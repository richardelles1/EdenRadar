/**
 * scripts/drain-queue.ts
 *
 * Processes ONE batch (500 assets) from the mini-enrichment queue and exits.
 * Run multiple times until queue is empty. Used by enrichment-audit.ts workflow.
 *
 * Usage:
 *   tsx scripts/drain-queue.ts
 *   tsx scripts/drain-queue.ts --concurrency 15
 *   tsx scripts/drain-queue.ts --batch-size 200
 */

import { db } from "../server/db";
import { sql, inArray } from "drizzle-orm";
import { ingestedAssets } from "../shared/schema";
import { storage } from "../server/storage";
import { classifyAsset } from "../server/lib/pipeline/classifyAsset";
import { computeCompletenessScore } from "../server/lib/pipeline/contentHash";
import { pool } from "../server/db";

const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith("--concurrency="))?.split("=")[1] ?? "20");
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith("--batch-size="))?.split("=")[1] ?? "500");
const MINI_INPUT_PER_M = 0.15;
const MINI_OUTPUT_PER_M = 0.60;

const isKnown = (v: string | null | undefined) =>
  v != null && v !== "" && v.toLowerCase() !== "unknown";

(async () => {
  // Query current queue size before
  const queueBefore = await db.execute<{ cnt: string }>(sql`
    SELECT COUNT(*) AS cnt FROM ingested_assets
    WHERE relevant = true
      AND (data_sparse IS NULL OR data_sparse = false)
      AND char_length(COALESCE(summary,'') || COALESCE(abstract,'')) >= 120
      AND COALESCE(mini_enrich_attempts, 0) < 3
      AND (
        (completeness_score IS NULL OR completeness_score = 0)
        OR (
          (CASE WHEN COALESCE(target,'unknown')='unknown' THEN 1 ELSE 0 END) +
          (CASE WHEN COALESCE(modality,'unknown')='unknown' THEN 1 ELSE 0 END) +
          (CASE WHEN COALESCE(indication,'unknown')='unknown' THEN 1 ELSE 0 END) +
          (CASE WHEN development_stage='unknown' THEN 1 ELSE 0 END)
        ) >= 3
      )
  `);
  const remaining = Number(queueBefore.rows[0]?.cnt ?? 0);

  if (remaining === 0) {
    console.log("✅ Queue empty — nothing to do.");
    await pool.end();
    process.exit(0);
  }

  console.log(`Queue: ${remaining} eligible. Fetching batch of ${BATCH_SIZE}…`);
  const batch = await storage.getMiniEnrichBatch(BATCH_SIZE);
  if (batch.length === 0) {
    console.log("✅ getMiniEnrichBatch returned 0 — queue drained.");
    await pool.end();
    process.exit(0);
  }

  console.log(`Processing ${batch.length} assets (concurrency=${CONCURRENCY})…`);
  const start = Date.now();
  let processed = 0;
  let improved = 0;
  let tokenCost = 0;
  let idx = 0;

  async function worker() {
    while (idx < batch.length) {
      const asset = batch[idx++];
      if (!asset) continue;
      try {
        const classification = await classifyAsset(
          asset.assetName, asset.summary, asset.abstract ?? undefined,
          "gpt-4o-mini", false,
          {
            categories: asset.categories, patentStatus: asset.patentStatus,
            licensingStatus: asset.licensingStatus, inventors: asset.inventors,
            sourceUrl: asset.sourceUrl,
            currentValues: {
              target: asset.target, modality: asset.modality,
              indication: asset.indication, developmentStage: asset.developmentStage,
            },
          },
        );
        const score = computeCompletenessScore({
          modality: classification.modality, indication: classification.indication,
          developmentStage: classification.developmentStage, mechanismOfAction: classification.mechanismOfAction,
          ipType: classification.ipType, summary: asset.summary,
        });
        await storage.updateIngestedAssetEnrichment(asset.id, { ...classification, completenessScore: score });
        const inTok = classification.tokenUsage?.inputTokens ?? 0;
        const outTok = classification.tokenUsage?.outputTokens ?? 0;
        tokenCost += (inTok * MINI_INPUT_PER_M + outTok * MINI_OUTPUT_PER_M) / 1_000_000;
        const wasImproved =
          (!isKnown(asset.target) && isKnown(classification.target)) ||
          (!isKnown(asset.modality) && isKnown(classification.modality)) ||
          (!isKnown(asset.indication) && isKnown(classification.indication)) ||
          (asset.developmentStage === "unknown" && isKnown(classification.developmentStage));
        if (wasImproved) improved++;
      } catch {
        await storage.incrementMiniEnrichAttempts(asset.id);
      }
      await storage.stampEnrichedAt(asset.id);
      processed++;
      if (processed % 100 === 0) {
        const rate = (processed / ((Date.now() - start) / 1000)).toFixed(1);
        console.log(`  ${processed}/${batch.length} processed | ${improved} improved | $${tokenCost.toFixed(4)} | ${rate}/s`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));

  const secs = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`✅ Done: ${processed} processed | ${improved} improved | $${tokenCost.toFixed(4)} | ${secs}s`);
  console.log(`   Remaining in queue: ${remaining - processed}`);

  await pool.end();
  process.exit(0);
})().catch(async err => {
  console.error("[drain-queue] fatal:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
