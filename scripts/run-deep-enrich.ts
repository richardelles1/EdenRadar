/**
 * scripts/run-deep-enrich.ts
 *
 * Standalone deep enrichment drain — bypasses the HTTP server entirely.
 * Mirrors the EDEN route exactly: same storage query, same deepEnrichBatch
 * call, same bulkUpdateIngestedAssetsDeepEnrichment write path.
 *
 * Differences from the EDEN UI button:
 *   - No 500-asset-per-cycle cap (drains the full queue in one run)
 *   - Live console progress every 25 assets
 *   - Final summary with cost, band movements, and field-fill counts
 *
 * Run: tsx scripts/run-deep-enrich.ts [--cap <n>]
 */

import "dotenv/config";
import { storage } from "../server/storage";
import { deepEnrichBatch } from "../server/lib/pipeline/deepEnrichBatch";
import { db } from "../server/db";
import { pool } from "../server/db";
import { sql } from "drizzle-orm";

const capArg = process.argv.indexOf("--cap");
const CAP = capArg !== -1 ? parseInt(process.argv[capArg + 1] ?? "9999", 10) : 9999;

const GPT4O_IN_PER_M  = 2.50;
const GPT4O_OUT_PER_M = 10.0;

function scoreToBand(score: number | null | undefined): string {
  if (score == null || score === 0) return "bare";
  if (score >= 80) return "rich";
  if (score >= 60) return "decent";
  if (score >= 40) return "sparse";
  return "very_sparse";
}

async function main() {
  const startMs = Date.now();

  console.log("═══════════════════════════════════════════════════════════");
  console.log("DEEP ENRICH DRAIN — direct script (no HTTP server)");
  console.log(`Run started: ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── Fetch queue ──────────────────────────────────────────────────────────
  console.log("⏳ Fetching enrichment queue from DB…");
  const allAssets = await storage.getAssetsNeedingDeepEnrich();
  const assets = allAssets.slice(0, CAP);
  const deferred = allAssets.length - assets.length;

  if (assets.length === 0) {
    console.log("✅ Queue is empty — nothing to process.");
    await pool.end();
    return;
  }

  console.log(`   Queue size   : ${allAssets.length.toLocaleString()} total eligible`);
  if (deferred > 0) console.log(`   Cap applied  : processing ${assets.length}, deferring ${deferred}`);
  console.log(`   Assets       : ${assets.length.toLocaleString()} in this run\n`);

  // ── Pre-run snapshot ─────────────────────────────────────────────────────
  const assetIds = assets.map((a) => a.id);
  const snapBefore: Record<number, string> = {};
  try {
    const snapRows = await db.execute<{ id: number; completeness_score: number | null }>(sql`
      SELECT id, completeness_score FROM ingested_assets WHERE id = ANY(${assetIds}::int[])
    `);
    for (const r of snapRows.rows) snapBefore[r.id] = scoreToBand(r.completeness_score);
  } catch (e: any) {
    console.warn("   ⚠ Pre-run snapshot failed (non-fatal):", e?.message);
  }

  // ── Create tracking job ───────────────────────────────────────────────────
  let jobId: number | null = null;
  try {
    const job = await storage.createDeepEnrichmentJob(assets.length);
    jobId = job.id;
    console.log(`   Job ID       : ${jobId}\n`);
  } catch (e: any) {
    console.warn("   ⚠ Could not create enrichment_jobs row (non-fatal):", e?.message);
  }

  // ── Progress tracking ─────────────────────────────────────────────────────
  let totalInputTokens  = 0;
  let totalOutputTokens = 0;
  let succeeded = 0;
  let failed    = 0;
  let skipped   = 0;

  const reportLine = (processed: number, total: number) => {
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
    const rate    = processed > 0 ? (processed / ((Date.now() - startMs) / 1000)).toFixed(1) : "0.0";
    const costSoFar = ((totalInputTokens * GPT4O_IN_PER_M + totalOutputTokens * GPT4O_OUT_PER_M) / 1_000_000).toFixed(4);
    process.stdout.write(
      `   [${elapsed}s] ${processed}/${total} processed — succeeded=${succeeded} failed=${failed} skipped=${skipped} cost=$${costSoFar} rate=${rate}/s\r`
    );
  };

  // ── Run ───────────────────────────────────────────────────────────────────
  console.log("🚀 Starting deep enrichment batch…\n");

  const batchResult = await deepEnrichBatch(
    assets.map((a) => ({
      id:         a.id,
      assetName:  a.assetName,
      summary:    a.summary,
      abstract:   a.abstract,
      sourceType: a.sourceType,
      biology:    a.biology,
      ctx: {
        categories:     a.categories,
        patentStatus:   a.patentStatus,
        licensingStatus: a.licensingStatus,
        inventors:      a.inventors,
        sourceUrl:      a.sourceUrl,
      },
    })),
    20, // concurrency
    async (batch) => storage.bulkUpdateIngestedAssetsDeepEnrichment(batch, "deep"),
    (processed, total, suc, fail, skip) => {
      succeeded = suc;
      failed    = fail;
      skipped   = skip;
      if (processed % 25 === 0 || processed === total) {
        reportLine(processed, total);
        if (processed === total) process.stdout.write("\n");
      }
      // Update enrichment_jobs row every 50 assets
      if (jobId !== null && processed % 50 === 0) {
        storage.updateEnrichmentJob(jobId, { processed: suc + fail, improved: suc }).catch(() => {});
      }
    },
    undefined, // no abort
    (inTok, outTok) => {
      totalInputTokens  += inTok;
      totalOutputTokens += outTok;
    },
  );

  // Final progress line
  reportLine(assets.length, assets.length);
  process.stdout.write("\n\n");

  // ── Finalize job ──────────────────────────────────────────────────────────
  if (jobId !== null) {
    try {
      await storage.updateEnrichmentJob(jobId, {
        status:      "done",
        completedAt: new Date(),
        processed:   batchResult.succeeded + batchResult.failed,
        improved:    batchResult.succeeded,
      });
    } catch (e: any) {
      console.warn("   ⚠ Could not finalize enrichment_jobs row:", e?.message);
    }
  }

  // ── Post-run band movements ───────────────────────────────────────────────
  const bandMovements: Record<string, number> = {};
  try {
    const postRows = await db.execute<{ id: number; completeness_score: number | null }>(sql`
      SELECT id, completeness_score FROM ingested_assets WHERE id = ANY(${assetIds}::int[])
    `);
    for (const r of postRows.rows) {
      const after  = scoreToBand(r.completeness_score);
      const before = snapBefore[r.id];
      if (before && after !== before) {
        const key = `${before}→${after}`;
        bandMovements[key] = (bandMovements[key] ?? 0) + 1;
      }
    }
  } catch (e: any) {
    console.warn("   ⚠ Post-run band movement query failed (non-fatal):", e?.message);
  }

  // ── Post-run queue size ───────────────────────────────────────────────────
  let remaining = "unknown";
  try {
    const remRow = await db.execute<{ cnt: string }>(sql`
      SELECT COUNT(*)::int AS cnt FROM ingested_assets
      WHERE relevant = true AND enriched_at IS NULL
    `);
    remaining = Number(remRow.rows[0]?.cnt ?? 0).toLocaleString();
  } catch { /* non-fatal */ }

  // ── Post-run field-fill check ─────────────────────────────────────────────
  interface FieldStats { miss_target: string; miss_modality: string; miss_indication: string; avg_score: string; }
  let fieldStats: FieldStats | null = null;
  try {
    const fsRow = await db.execute<FieldStats>(sql`
      SELECT
        COUNT(*) FILTER (WHERE relevant = true AND (target    IS NULL OR target    IN ('unknown','')))::int AS miss_target,
        COUNT(*) FILTER (WHERE relevant = true AND (modality  IS NULL OR modality  IN ('unknown','')))::int AS miss_modality,
        COUNT(*) FILTER (WHERE relevant = true AND (indication IS NULL OR indication IN ('unknown','')))::int AS miss_indication,
        ROUND(AVG(COALESCE(completeness_score, 0)) FILTER (WHERE relevant = true)::numeric, 2) AS avg_score
      FROM ingested_assets
    `);
    fieldStats = fsRow.rows[0] ?? null;
  } catch { /* non-fatal */ }

  const durationSec = ((Date.now() - startMs) / 1000).toFixed(0);
  const totalCost   = ((totalInputTokens * GPT4O_IN_PER_M + totalOutputTokens * GPT4O_OUT_PER_M) / 1_000_000).toFixed(4);
  const costPerAsset = batchResult.succeeded > 0
    ? ((totalInputTokens * GPT4O_IN_PER_M + totalOutputTokens * GPT4O_OUT_PER_M) / 1_000_000 / batchResult.succeeded).toFixed(5)
    : "N/A";

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════");
  console.log("RESULTS");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Duration     : ${durationSec}s`);
  console.log(`  Job ID       : ${jobId ?? "N/A"}`);
  console.log(`  Total queue  : ${assets.length.toLocaleString()}${deferred > 0 ? ` (+ ${deferred} deferred)` : ""}`);
  console.log(`  Succeeded    : ${batchResult.succeeded.toLocaleString()}`);
  console.log(`  Failed       : ${batchResult.failed.toLocaleString()}`);
  console.log(`  Skipped      : ${batchResult.skipped.toLocaleString()} (content too thin)`);
  console.log(`  Input tokens : ${totalInputTokens.toLocaleString()}`);
  console.log(`  Output tokens: ${totalOutputTokens.toLocaleString()}`);
  console.log(`  Total cost   : $${totalCost}`);
  console.log(`  Cost/asset   : $${costPerAsset}`);
  console.log(`  Remaining    : ${remaining} assets still need enriched_at`);

  if (fieldStats) {
    console.log("\n  Field coverage (all relevant assets after run):");
    console.log(`    Missing target     : ${Number(fieldStats.miss_target).toLocaleString()}`);
    console.log(`    Missing modality   : ${Number(fieldStats.miss_modality).toLocaleString()}`);
    console.log(`    Missing indication : ${Number(fieldStats.miss_indication).toLocaleString()}`);
    console.log(`    Avg completeness   : ${fieldStats.avg_score}`);
  }

  if (Object.keys(bandMovements).length > 0) {
    console.log("\n  Band movements (this run):");
    const sorted = Object.entries(bandMovements).sort((a, b) => b[1] - a[1]);
    for (const [k, v] of sorted) {
      console.log(`    ${k.padEnd(22)} : ${v}`);
    }
  } else {
    console.log("\n  Band movements : none detected");
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`Run completed: ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("\n[run-deep-enrich] fatal:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
