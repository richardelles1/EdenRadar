/**
 * scripts/enrichment-audit.ts
 *
 * Enrichment audit: captures before/after snapshots around a full mini-enrichment
 * drain, then writes a markdown report to reports/enrichment-audit-YYYY-MM-DD.md.
 *
 * Runs the enrichment inline (imports the pipeline directly) to avoid HTTP auth
 * complexity and give precise per-asset tracking.
 *
 * Usage:
 *   tsx scripts/enrichment-audit.ts [--dry-run]
 *
 * --dry-run  → snapshot the queue and exit without processing (no LLM calls, no writes)
 *
 * Exits 0 on success, non-zero on fatal error.
 */

import { db } from "../server/db";
import { pool } from "../server/db";
import { sql, inArray } from "drizzle-orm";
import { ingestedAssets } from "../shared/schema";
import { storage } from "../server/storage";
import { classifyAsset } from "../server/lib/pipeline/classifyAsset";
import { computeCompletenessScore } from "../server/lib/pipeline/contentHash";
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = 20;
const BATCH_SIZE = 500;
const MINI_INPUT_PER_M = 0.15;   // gpt-4o-mini input $/1M tokens
const MINI_OUTPUT_PER_M = 0.60;  // gpt-4o-mini output $/1M tokens

// ── Eligibility criteria (mirrors buildEnrichWhere({}) in server/storage.ts) ──
const ELIGIBLE_WHERE = sql`
  relevant = true
  AND (data_sparse IS NULL OR data_sparse = false)
  AND char_length(COALESCE(summary, '') || COALESCE(abstract, '')) >= 120
  AND COALESCE(mini_enrich_attempts, 0) < 3
  AND (
    (completeness_score IS NULL OR completeness_score = 0)
    OR (
      (CASE WHEN COALESCE(target, 'unknown') = 'unknown' THEN 1 ELSE 0 END) +
      (CASE WHEN COALESCE(modality, 'unknown') = 'unknown' THEN 1 ELSE 0 END) +
      (CASE WHEN COALESCE(indication, 'unknown') = 'unknown' THEN 1 ELSE 0 END) +
      (CASE WHEN development_stage = 'unknown' THEN 1 ELSE 0 END)
    ) >= 3
  )
`;

// ─────────────────────────────────────────────────
// Snapshot types
// ─────────────────────────────────────────────────

interface GlobalStats {
  totalEligible: number;
  avgScore: number;
  missingTarget: number;
  missingModality: number;
  missingIndication: number;
  missingStage: number;
  // Tier bands across ALL relevant assets (not just queue)
  allTotal: number;
  allAvgScore: number;
  unscored: number;
  poor: number;
  partial: number;
  good: number;
  excellent: number;
  // Gave up (mini_enrich_attempts >= 3)
  gaveUp: number;
}

interface InstitutionRow {
  institution: string;
  eligible: number;
}

interface InstitutionGaveUp {
  institution: string;
  count: number;
}

// ─────────────────────────────────────────────────
// Query helpers
// ─────────────────────────────────────────────────

async function getGlobalStats(): Promise<GlobalStats> {
  // Queue stats
  const queueRes = await db.execute<{
    total_eligible: string;
    avg_score: string;
    missing_target: string;
    missing_modality: string;
    missing_indication: string;
    missing_stage: string;
  }>(sql`
    SELECT
      COUNT(*) AS total_eligible,
      ROUND(AVG(COALESCE(completeness_score, 0))::numeric, 2) AS avg_score,
      COUNT(*) FILTER (WHERE target IS NULL OR target IN ('unknown','')) AS missing_target,
      COUNT(*) FILTER (WHERE modality IS NULL OR modality IN ('unknown','')) AS missing_modality,
      COUNT(*) FILTER (WHERE indication IS NULL OR indication IN ('unknown','')) AS missing_indication,
      COUNT(*) FILTER (WHERE development_stage = 'unknown' OR development_stage IS NULL) AS missing_stage
    FROM ingested_assets
    WHERE ${ELIGIBLE_WHERE}
  `);

  const gaveUpRes = await db.execute<{ gave_up: string }>(sql`
    SELECT COUNT(*) AS gave_up
    FROM ingested_assets
    WHERE relevant = true AND COALESCE(mini_enrich_attempts, 0) >= 3
  `);

  // All-relevant tier distribution
  const allRes = await db.execute<{
    all_total: string;
    all_avg: string;
    unscored: string;
    poor: string;
    partial: string;
    good: string;
    excellent: string;
  }>(sql`
    SELECT
      COUNT(*) AS all_total,
      ROUND(AVG(COALESCE(completeness_score, 0))::numeric, 2) AS all_avg,
      COUNT(*) FILTER (WHERE completeness_score IS NULL OR completeness_score = 0) AS unscored,
      COUNT(*) FILTER (WHERE completeness_score >= 1 AND completeness_score < 40) AS poor,
      COUNT(*) FILTER (WHERE completeness_score >= 40 AND completeness_score < 60) AS partial,
      COUNT(*) FILTER (WHERE completeness_score >= 60 AND completeness_score < 80) AS good,
      COUNT(*) FILTER (WHERE completeness_score >= 80) AS excellent
    FROM ingested_assets
    WHERE relevant = true
  `);

  const q = queueRes.rows[0]!;
  const a = allRes.rows[0]!;
  return {
    totalEligible: Number(q.total_eligible),
    avgScore: Number(q.avg_score),
    missingTarget: Number(q.missing_target),
    missingModality: Number(q.missing_modality),
    missingIndication: Number(q.missing_indication),
    missingStage: Number(q.missing_stage),
    allTotal: Number(a.all_total),
    allAvgScore: Number(a.all_avg),
    unscored: Number(a.unscored),
    poor: Number(a.poor),
    partial: Number(a.partial),
    good: Number(a.good),
    excellent: Number(a.excellent),
    gaveUp: Number(gaveUpRes.rows[0]?.gave_up ?? 0),
  };
}

async function getInstitutionBreakdown(): Promise<InstitutionRow[]> {
  const res = await db.execute<{ institution: string; eligible: string }>(sql`
    SELECT institution, COUNT(*) AS eligible
    FROM ingested_assets
    WHERE ${ELIGIBLE_WHERE}
    GROUP BY institution
    ORDER BY COUNT(*) DESC
    LIMIT 30
  `);
  return res.rows.map(r => ({ institution: r.institution, eligible: Number(r.eligible) }));
}

async function getGaveUpByInstitution(): Promise<InstitutionGaveUp[]> {
  const res = await db.execute<{ institution: string; count: string }>(sql`
    SELECT institution, COUNT(*) AS count
    FROM ingested_assets
    WHERE relevant = true AND COALESCE(mini_enrich_attempts, 0) >= 3
    GROUP BY institution
    ORDER BY COUNT(*) DESC
    LIMIT 20
  `);
  return res.rows.map(r => ({ institution: r.institution, count: Number(r.count) }));
}

async function getInstitutionsForIds(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: ingestedAssets.id, institution: ingestedAssets.institution })
    .from(ingestedAssets)
    .where(inArray(ingestedAssets.id, ids));
  return new Map(rows.map(r => [r.id, r.institution]));
}

// ─────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────

(async () => {
  const runDate = new Date().toISOString().slice(0, 10);
  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║   EdenRadar Enrichment Audit — ${runDate}${DRY_RUN ? " [DRY RUN]" : "          "}   ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝\n`);

  // ── Before snapshot ──────────────────────────────
  console.log("📸 Capturing BEFORE snapshot…");
  const before = await getGlobalStats();
  const beforeInstitutions = await getInstitutionBreakdown();
  const gaveUpByInstitution = await getGaveUpByInstitution();

  console.log(`   Queue size: ${before.totalEligible.toLocaleString()} eligible assets`);
  console.log(`   Avg score (queue): ${before.avgScore}`);
  console.log(`   All relevant: ${before.allTotal.toLocaleString()} · avg score: ${before.allAvgScore}`);
  console.log(`   Tiers — unscored: ${before.unscored} | poor: ${before.poor} | partial: ${before.partial} | good: ${before.good} | excellent: ${before.excellent}`);
  console.log(`   Missing fields (queue) — target: ${before.missingTarget} | modality: ${before.missingModality} | indication: ${before.missingIndication} | stage: ${before.missingStage}`);
  console.log(`   Gave up (attempts≥3): ${before.gaveUp.toLocaleString()}\n`);

  if (DRY_RUN) {
    console.log("⏭  --dry-run flag set — skipping enrichment. Writing snapshot report only.\n");
  }

  // ── Enrichment drain ─────────────────────────────
  let processed = 0;
  let improved = 0;
  let tokenCostUSD = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const fieldGains = { target: 0, modality: 0, indication: 0, stage: 0 };
  // per-institution: { processed, improved }
  const perInstitution = new Map<string, { processed: number; improved: number }>();

  // per-asset band movements: track for assets we actually processed
  // { institution, beforeScore, afterScore }
  const bandMovements: Array<{ institution: string; beforeScore: number | null; afterScore: number | null }> = [];

  const isKnown = (v: string | null | undefined) =>
    v != null && v !== "" && v.toLowerCase() !== "unknown";

  if (!DRY_RUN) {
    if (before.totalEligible === 0) {
      console.log("✅ Queue is empty — nothing to process.\n");
    } else {
      console.log(`🚀 Starting drain (CONCURRENCY=${CONCURRENCY}, BATCH_SIZE=${BATCH_SIZE})…`);
      const drainStart = Date.now();
      let batchNum = 0;

      while (true) {
        const batch = await storage.getMiniEnrichBatch(BATCH_SIZE);
        if (batch.length === 0) break;
        batchNum++;

        // Query institution + before completeness_score for this batch
        const ids = batch.map(a => a.id);
        const institutionMap = await getInstitutionsForIds(ids);

        // Query before completeness scores for band movement tracking
        const scoreRows = await db.select({ id: ingestedAssets.id, completenessScore: ingestedAssets.completenessScore })
          .from(ingestedAssets)
          .where(inArray(ingestedAssets.id, ids));
        const beforeScoreMap = new Map(scoreRows.map(r => [r.id, r.completenessScore ?? null]));

        console.log(`   Batch ${batchNum}: ${batch.length} assets (total processed so far: ${processed})`);

        let idx = 0;
        const assetResults: Array<{
          id: number;
          institution: string;
          beforeScore: number | null;
          afterScore: number | null;
          wasImproved: boolean;
        }> = [];

        async function worker() {
          while (idx < batch.length) {
            const asset = batch[idx++];
            if (!asset) continue;

            const institution = institutionMap.get(asset.id) ?? "unknown";
            const beforeScore = beforeScoreMap.get(asset.id) ?? null;

            try {
              const classification = await classifyAsset(
                asset.assetName,
                asset.summary,
                asset.abstract ?? undefined,
                "gpt-4o-mini",
                false,
                {
                  categories: asset.categories,
                  patentStatus: asset.patentStatus,
                  licensingStatus: asset.licensingStatus,
                  inventors: asset.inventors,
                  sourceUrl: asset.sourceUrl,
                  currentValues: {
                    target: asset.target,
                    modality: asset.modality,
                    indication: asset.indication,
                    developmentStage: asset.developmentStage,
                  },
                },
              );

              const score = computeCompletenessScore({
                modality: classification.modality,
                indication: classification.indication,
                developmentStage: classification.developmentStage,
                mechanismOfAction: classification.mechanismOfAction,
                ipType: classification.ipType,
                summary: asset.summary,
              });

              await storage.updateIngestedAssetEnrichment(asset.id, {
                ...classification,
                completenessScore: score,
              });

              const inTok = classification.tokenUsage?.inputTokens ?? 0;
              const outTok = classification.tokenUsage?.outputTokens ?? 0;
              totalInputTokens += inTok;
              totalOutputTokens += outTok;
              tokenCostUSD += (inTok * MINI_INPUT_PER_M + outTok * MINI_OUTPUT_PER_M) / 1_000_000;

              // Field-level gains
              if (!isKnown(asset.target) && isKnown(classification.target)) fieldGains.target++;
              if (!isKnown(asset.modality) && isKnown(classification.modality)) fieldGains.modality++;
              if (!isKnown(asset.indication) && isKnown(classification.indication)) fieldGains.indication++;
              if (asset.developmentStage === "unknown" && isKnown(classification.developmentStage)) fieldGains.stage++;

              const wasImproved =
                (!isKnown(asset.target) && isKnown(classification.target)) ||
                (!isKnown(asset.modality) && isKnown(classification.modality)) ||
                (!isKnown(asset.indication) && isKnown(classification.indication)) ||
                (asset.developmentStage === "unknown" && isKnown(classification.developmentStage));

              if (wasImproved) improved++;

              assetResults.push({ id: asset.id, institution, beforeScore, afterScore: score, wasImproved });
            } catch (e) {
              console.error(`  ⚠ classifyAsset failed for asset ${asset.id}:`, (e as Error).message);
              await storage.incrementMiniEnrichAttempts(asset.id);
              assetResults.push({ id: asset.id, institution, beforeScore, afterScore: beforeScore, wasImproved: false });
            }

            await storage.stampEnrichedAt(asset.id);
            processed++;

            if (processed % 100 === 0) {
              const elapsed = ((Date.now() - drainStart) / 1000).toFixed(0);
              const rate = (processed / ((Date.now() - drainStart) / 1000)).toFixed(1);
              console.log(`   … ${processed} processed | ${improved} improved | $${tokenCostUSD.toFixed(4)} | ${rate} assets/s | ${elapsed}s elapsed`);
            }
          }
        }

        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));

        // Accumulate per-institution and band-movement data from this batch
        for (const ar of assetResults) {
          const entry = perInstitution.get(ar.institution) ?? { processed: 0, improved: 0 };
          entry.processed++;
          if (ar.wasImproved) entry.improved++;
          perInstitution.set(ar.institution, entry);
          bandMovements.push({ institution: ar.institution, beforeScore: ar.beforeScore, afterScore: ar.afterScore });
        }
      }

      const totalSecs = ((Date.now() - drainStart) / 1000).toFixed(0);
      console.log(`\n✅ Drain complete in ${totalSecs}s: ${processed} processed · ${improved} improved · $${tokenCostUSD.toFixed(4)}\n`);
    }
  }

  // ── After snapshot ────────────────────────────────
  console.log("📸 Capturing AFTER snapshot…");
  const after = await getGlobalStats();
  const afterInstitutions = await getInstitutionBreakdown();

  console.log(`   Queue size: ${after.totalEligible.toLocaleString()} remaining`);
  console.log(`   Avg score (all relevant): ${after.allAvgScore} (was ${before.allAvgScore})`);
  console.log(`   Tiers — unscored: ${after.unscored} | poor: ${after.poor} | partial: ${after.partial} | good: ${after.good} | excellent: ${after.excellent}\n`);

  // ── Band movement table from in-memory tracking ───
  function tierLabel(score: number | null): string {
    if (score === null || score === 0) return "unscored";
    if (score < 40) return "poor";
    if (score < 60) return "partial";
    if (score < 80) return "good";
    return "excellent";
  }

  const bandMoveCount = new Map<string, number>();
  for (const bm of bandMovements) {
    const key = `${tierLabel(bm.beforeScore)} → ${tierLabel(bm.afterScore)}`;
    bandMoveCount.set(key, (bandMoveCount.get(key) ?? 0) + 1);
  }

  // ── Per-institution diff table ─────────────────────
  // Build from both beforeInstitutions and afterInstitutions
  const allInstitutions = new Set([
    ...beforeInstitutions.map(r => r.institution),
    ...afterInstitutions.map(r => r.institution),
  ]);
  const beforeMap = new Map(beforeInstitutions.map(r => [r.institution, r.eligible]));
  const afterMap = new Map(afterInstitutions.map(r => [r.institution, r.eligible]));

  const instRows: Array<{
    institution: string;
    before: number;
    after: number;
    delta: number;
    processed: number;
    improved: number;
  }> = [];

  for (const inst of allInstitutions) {
    const bef = beforeMap.get(inst) ?? 0;
    const aft = afterMap.get(inst) ?? 0;
    const pd = perInstitution.get(inst) ?? { processed: 0, improved: 0 };
    instRows.push({ institution: inst, before: bef, after: aft, delta: bef - aft, processed: pd.processed, improved: pd.improved });
  }
  // Sort by before count desc
  instRows.sort((a, b) => b.before - a.before);

  // ── Build markdown report ─────────────────────────
  const reportDate = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const reportFileName = `enrichment-audit-${runDate}.md`;
  const reportDir = path.join(process.cwd(), "reports");
  mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, reportFileName);

  const pct = (n: number, total: number) => total === 0 ? "0%" : `${((n / total) * 100).toFixed(1)}%`;
  const delta = (b: number, a: number) => {
    const d = a - b;
    return d === 0 ? "—" : d > 0 ? `+${d}` : `${d}`;
  };

  // Improvement rate for processed assets
  const improvementRate = processed === 0 ? "N/A" : `${((improved / processed) * 100).toFixed(1)}%`;

  // Field-fill rates relative to before queue missing counts
  const targetFillRate = before.missingTarget === 0 ? "N/A" : `${((fieldGains.target / before.missingTarget) * 100).toFixed(1)}%`;
  const modalityFillRate = before.missingModality === 0 ? "N/A" : `${((fieldGains.modality / before.missingModality) * 100).toFixed(1)}%`;
  const indicationFillRate = before.missingIndication === 0 ? "N/A" : `${((fieldGains.indication / before.missingIndication) * 100).toFixed(1)}%`;
  const stageFillRate = before.missingStage === 0 ? "N/A" : `${((fieldGains.stage / before.missingStage) * 100).toFixed(1)}%`;

  // Recommendations
  const persistentlyEmptyInst = instRows.filter(r => r.before > 0 && r.after >= r.before * 0.9 && r.processed === 0).slice(0, 5);
  const highGaveUp = gaveUpByInstitution.slice(0, 5);
  const lowestFillField = [
    { field: "target", rate: before.missingTarget === 0 ? 1 : fieldGains.target / before.missingTarget },
    { field: "modality", rate: before.missingModality === 0 ? 1 : fieldGains.modality / before.missingModality },
    { field: "indication", rate: before.missingIndication === 0 ? 1 : fieldGains.indication / before.missingIndication },
    { field: "stage", rate: before.missingStage === 0 ? 1 : fieldGains.stage / before.missingStage },
  ].sort((a, b) => a.rate - b.rate);

  // Pre-compute blocks that contain backticks so they don't confuse the outer template
  const bandMovementsBlock = bandMovements.length > 0
    ? ["", "### Band Movements (processed assets)", "", "| Movement | Count |", "|----------|-------|",
       ...[...bandMoveCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => "| " + k + " | " + v.toLocaleString() + " |"),
       ""].join("\n")
    : "";

  const fieldRecsBlock = lowestFillField.map(f => {
    const rateStr = (f.rate * 100).toFixed(1) + "%";
    if (f.rate < 0.05) {
      return "- **" + f.field + "** — lowest fill rate (" + rateStr + "). Assets lack text signals for GPT-4o-mini to infer this field. Consider: (a) enriching abstract/summary via deeper scraping, (b) adding source URL context to the prompt, or (c) flagging as `data_sparse` to skip re-attempts.";
    } else if (f.rate < 0.2) {
      return "- **" + f.field + "** — low fill rate (" + rateStr + "). Many assets may be non-drug/biologic (medical device, research tool, software) where this field is N/A, or descriptions lack detail. Consider splitting the queue by asset_class and applying field-specific prompts.";
    } else {
      return "- **" + f.field + "** — moderate fill rate (" + rateStr + "). Reasonable performance; further gains require richer source text.";
    }
  }).join("\n");

  const priorityInstBlock = afterInstitutions.slice(0, 5).length > 0
    ? "The following institutions still have the largest eligible queues after this run and should be prioritized for scraper content quality improvements:\n\n" +
      afterInstitutions.slice(0, 5).map((r, i) => (i + 1) + ". **" + r.institution + "** — " + r.eligible + " assets still eligible").join("\n")
    : "Queue is fully drained — no remaining eligible assets.";

  const persistEmptyBlock = persistentlyEmptyInst.length > 0
    ? "\nInstitutions with large queues that were **not processed** (no content match): " + persistentlyEmptyInst.map(r => r.institution).join(", ")
    : "";

  const gaveUpBlock = highGaveUp.length > 0
    ? "Top institutions by gave-up count:\n" +
      highGaveUp.map((r, i) => (i + 1) + ". **" + r.institution + "** — " + r.count + " assets").join("\n") +
      "\n\nThese assets likely have very short or non-informative descriptions. Recommended actions:\n" +
      "- Audit description lengths for these institutions (look for `data_sparse` candidates)\n" +
      "- Consider adding a \"reset attempts on manual curation\" admin action to allow one final pass after human editing\n" +
      "- If an institution consistently produces low-quality descriptions, mark as `data_sparse` at ingestion time"
    : "No gave-up data available.";

  const md = `# Enrichment Audit Report

Generated: ${reportDate}${DRY_RUN ? "  \n**MODE: DRY RUN — no assets were processed**" : ""}

---

## 1. Queue Summary

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Assets eligible (queue) | ${before.totalEligible.toLocaleString()} | ${after.totalEligible.toLocaleString()} | ${delta(before.totalEligible, after.totalEligible)} |
| Assets gave up (attempts ≥ 3) | ${before.gaveUp.toLocaleString()} | ${after.gaveUp.toLocaleString()} | ${delta(before.gaveUp, after.gaveUp)} |
| All relevant assets | ${before.allTotal.toLocaleString()} | ${after.allTotal.toLocaleString()} | ${delta(before.allTotal, after.allTotal)} |
| Avg completeness score (all relevant) | ${before.allAvgScore} | ${after.allAvgScore} | ${delta(before.allAvgScore, after.allAvgScore)} |

**Job results:**
- Assets processed: **${processed.toLocaleString()}**
- Assets improved (≥1 field gained): **${improved.toLocaleString()}** (${improvementRate} of processed)
- Assets failed / error: **${processed - improved > 0 ? (processed - improved).toLocaleString() : "0"}** (not all non-improved are failures; some had no new info)

---

## 2. Field-Fill Rates

Fields that went from \`unknown\` → a known value during this run:

| Field | Missing (before) | Gained | Fill Rate |
|-------|-----------------|--------|-----------|
| target | ${before.missingTarget.toLocaleString()} | ${fieldGains.target.toLocaleString()} | ${targetFillRate} |
| modality | ${before.missingModality.toLocaleString()} | ${fieldGains.modality.toLocaleString()} | ${modalityFillRate} |
| indication | ${before.missingIndication.toLocaleString()} | ${fieldGains.indication.toLocaleString()} | ${indicationFillRate} |
| development_stage | ${before.missingStage.toLocaleString()} | ${fieldGains.stage.toLocaleString()} | ${stageFillRate} |

**Remaining gaps after run (all relevant assets):**

| Field | Still missing | % of all relevant |
|-------|--------------|-------------------|
| target | ${after.missingTarget.toLocaleString()} | ${pct(after.missingTarget, after.allTotal)} |
| modality | ${after.missingModality.toLocaleString()} | ${pct(after.missingModality, after.allTotal)} |
| indication | ${after.missingIndication.toLocaleString()} | ${pct(after.missingIndication, after.allTotal)} |
| development_stage | ${after.missingStage.toLocaleString()} | ${pct(after.missingStage, after.allTotal)} |

---

## 3. Tier Band Distribution

| Tier | Before | After | Delta | % of all (after) |
|------|--------|-------|-------|------------------|
| Excellent (≥80) | ${before.excellent.toLocaleString()} | ${after.excellent.toLocaleString()} | ${delta(before.excellent, after.excellent)} | ${pct(after.excellent, after.allTotal)} |
| Good (60–79) | ${before.good.toLocaleString()} | ${after.good.toLocaleString()} | ${delta(before.good, after.good)} | ${pct(after.good, after.allTotal)} |
| Partial (40–59) | ${before.partial.toLocaleString()} | ${after.partial.toLocaleString()} | ${delta(before.partial, after.partial)} | ${pct(after.partial, after.allTotal)} |
| Poor (1–39) | ${before.poor.toLocaleString()} | ${after.poor.toLocaleString()} | ${delta(before.poor, after.poor)} | ${pct(after.poor, after.allTotal)} |
| Unscored (0/null) | ${before.unscored.toLocaleString()} | ${after.unscored.toLocaleString()} | ${delta(before.unscored, after.unscored)} | ${pct(after.unscored, after.allTotal)} |

${bandMovementsBlock}

---

## 4. Per-Institution Breakdown

Top institutions by eligible queue size before the run:

| Institution | Before | After | Cleared | Processed | Improved |
|-------------|--------|-------|---------|-----------|---------|
${instRows.slice(0, 30).map(r => "| " + r.institution + " | " + r.before + " | " + r.after + " | " + (r.delta > 0 ? r.delta : 0) + " | " + r.processed + " | " + r.improved + " |").join("\n")}

---

## 5. Gave-Up Analysis

Assets permanently excluded (mini_enrich_attempts ≥ 3) by institution:

| Institution | Gave Up |
|-------------|---------|
${gaveUpByInstitution.map(r => `| ${r.institution} | ${r.count.toLocaleString()} |`).join("\n")}

Total gave up: **${before.gaveUp.toLocaleString()}** assets

---

## 6. Token Cost

| Metric | Value |
|--------|-------|
| Input tokens | ${totalInputTokens.toLocaleString()} |
| Output tokens | ${totalOutputTokens.toLocaleString()} |
| Total tokens | ${(totalInputTokens + totalOutputTokens).toLocaleString()} |
| Estimated cost | **$${tokenCostUSD.toFixed(4)}** |
| Cost per asset | $${processed > 0 ? (tokenCostUSD / processed).toFixed(5) : "N/A"} |
| Model | gpt-4o-mini |

---

## 7. Optimization Recommendations

### 7.1 Institutions to Prioritize Next

${priorityInstBlock}
${persistEmptyBlock}

### 7.2 Field Fill Rate Analysis

${fieldRecsBlock}

### 7.3 Gave-Up Cap Analysis

**${before.gaveUp.toLocaleString()}** assets have hit the 3-attempt cap and are permanently excluded.

${gaveUpBlock}

### 7.4 Concrete Prompt/Data Improvements

1. **Target inference from context**: Many drug assets fail target extraction when the gene symbol isn't named explicitly (e.g., "inhibits the JAK pathway" → should infer JAK1/JAK2). Extending the HGNC mapping table in the system prompt with more pathway-to-gene translations would improve target fill rate.

2. **Stage inference from licensing language**: TTO listings often say "licensed to [company]" or "startup formed" without explicit clinical language. Add a heuristic rule: if licensingReadiness = "startup formed" AND no clinical signals → default to preclinical rather than unknown.

3. **Data-sparse threshold**: Assets with < 150 chars combined summary+abstract are marked data_sparse. Consider raising this to 200 chars — very short descriptions rarely yield useful classification and waste API budget.

4. **Non-drug filtering before mini-enrich**: Assets already classified as research_tool or software will always have null target/indication/modality (field semantics: null = N/A). These should be excluded from the 3-unknown gate entirely to avoid wasting batch slots and attempt counts.

5. **Abstract scraping coverage**: Institutions with low improvement rates often lack abstract text. Adding abstract scraping (via the existing TechPublisher/WordPress factory patterns) for top-gap institutions could meaningfully improve fill rates without prompt changes.

---

*Report generated by scripts/enrichment-audit.ts on ${reportDate}*
`;

  writeFileSync(reportPath, md, "utf-8");

  console.log(`\n📄 Report written to: reports/${reportFileName}`);
  console.log("\n═══════════════ SUMMARY ═══════════════");
  console.log(`  Queue before  : ${before.totalEligible.toLocaleString()}`);
  console.log(`  Processed     : ${processed.toLocaleString()}`);
  console.log(`  Improved      : ${improved.toLocaleString()} (${improvementRate})`);
  console.log(`  Remaining     : ${after.totalEligible.toLocaleString()}`);
  console.log(`  Token cost    : $${tokenCostUSD.toFixed(4)}`);
  console.log(`  Avg score     : ${before.allAvgScore} → ${after.allAvgScore}`);
  console.log("═══════════════════════════════════════\n");

  await pool.end();
  process.exit(0);
})().catch(async err => {
  console.error("\n[enrichment-audit] fatal:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
