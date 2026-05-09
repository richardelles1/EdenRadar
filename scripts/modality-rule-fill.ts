/**
 * Modality Rule-Fill — Task #975
 *
 * Maps relevant assets with null/unknown modality using a tiered keyword
 * rule engine. GPT-4o-mini fallback for unresolved residual.
 * Recomputes completeness scores for every updated asset.
 *
 * Usage:
 *   npx tsx scripts/modality-rule-fill.ts
 *   npx tsx scripts/modality-rule-fill.ts --dry-run
 *   npx tsx scripts/modality-rule-fill.ts --skip-gpt
 *
 * Outputs a before/after tier-lift table so each run is self-documenting.
 */

import { pool } from "../server/db";
import { runModalityFill } from "../server/lib/pipeline/modalityFill";

const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_GPT = process.argv.includes("--skip-gpt");

async function getTierCounts(client: import("pg").PoolClient) {
  const { rows } = await client.query<{
    investment_ready: string;
    reviewable: string;
    developing: string;
    early_stage: string;
    total: string;
    has_modality: string;
    no_modality: string;
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE completeness_score >= 80)                        AS investment_ready,
      COUNT(*) FILTER (WHERE completeness_score >= 60 AND completeness_score < 80) AS reviewable,
      COUNT(*) FILTER (WHERE completeness_score >= 40 AND completeness_score < 60) AS developing,
      COUNT(*) FILTER (WHERE completeness_score < 40 AND completeness_score IS NOT NULL) AS early_stage,
      COUNT(*)                                                                 AS total,
      COUNT(*) FILTER (WHERE modality IS NOT NULL AND modality NOT IN ('unknown',''))  AS has_modality,
      COUNT(*) FILTER (WHERE modality IS NULL OR modality IN ('unknown',''))   AS no_modality
    FROM ingested_assets
    WHERE relevant = true
  `);
  const r = rows[0];
  return {
    investmentReady: Number(r.investment_ready),
    reviewable: Number(r.reviewable),
    developing: Number(r.developing),
    earlyStage: Number(r.early_stage),
    total: Number(r.total),
    hasModality: Number(r.has_modality),
    noModality: Number(r.no_modality),
  };
}

function printTierTable(
  label: string,
  counts: Awaited<ReturnType<typeof getTierCounts>>,
) {
  const pct = (n: number) => ((n / counts.total) * 100).toFixed(1) + "%";
  const reviewablePlus = counts.investmentReady + counts.reviewable;
  const gapTo80 = Math.max(0, Math.round(0.8 * counts.total) - reviewablePlus);

  console.log(`\n  ┌─ ${label} ─────────────────────────────────────`);
  console.log(`  │  Investment Ready  (≥80) : ${counts.investmentReady.toLocaleString().padStart(7)}  (${pct(counts.investmentReady)})`);
  console.log(`  │  Reviewable       (60-79): ${counts.reviewable.toLocaleString().padStart(7)}  (${pct(counts.reviewable)})`);
  console.log(`  │  Developing       (40-59): ${counts.developing.toLocaleString().padStart(7)}  (${pct(counts.developing)})`);
  console.log(`  │  Early Stage       (<40) : ${counts.earlyStage.toLocaleString().padStart(7)}  (${pct(counts.earlyStage)})`);
  console.log(`  │  Reviewable+ total       : ${reviewablePlus.toLocaleString().padStart(7)}  (${pct(reviewablePlus)})`);
  console.log(`  │  Has modality            : ${counts.hasModality.toLocaleString().padStart(7)}`);
  console.log(`  │  Gap to 80% Reviewable+  : ${gapTo80.toLocaleString().padStart(7)}`);
  console.log(`  └────────────────────────────────────────────────────`);
}

async function main() {
  console.log(`[modality-fill] Starting${DRY_RUN ? " (DRY RUN)" : ""}…`);

  const client = await pool.connect();
  try {
    const before = await getTierCounts(client);
    printTierTable("BEFORE", before);

    const summary = await runModalityFill(client, {
      dryRun: DRY_RUN,
      skipGpt: SKIP_GPT,
      onProgress: (done, total) => {
        process.stdout.write(`\r[modality-fill] Updated ${done}/${total}…`);
      },
    });

    if (!DRY_RUN) process.stdout.write("\n");

    const after = await getTierCounts(client);
    printTierTable("AFTER", after);

    const irLift = after.investmentReady - before.investmentReady;
    const reviewablePlusBefore = before.investmentReady + before.reviewable;
    const reviewablePlusAfter  = after.investmentReady  + after.reviewable;
    const reviewablePlusLift   = reviewablePlusAfter - reviewablePlusBefore;
    const gapBefore = Math.max(0, Math.round(0.8 * before.total) - reviewablePlusBefore);
    const gapAfter  = Math.max(0, Math.round(0.8 * after.total)  - reviewablePlusAfter);

    console.log("\n─────────────────────────────────────────────────────────");
    console.log("[modality-fill] FILL SUMMARY");
    console.log(`  Assets with null/unknown modality processed : ${summary.total}`);
    console.log(`  Step 1 normalizations                       : ${summary.normalized}`);
    console.log(`  Rule-matched (T1 / T2 / T3)                 : ${summary.tierCounts.t1} / ${summary.tierCounts.t2} / ${summary.tierCounts.t3}`);
    console.log(`  Total rule-matched                          : ${summary.ruleMatched}`);
    console.log(`  Sent to GPT-4o-mini                         : ${summary.gptSent}`);
    console.log(`  GPT-4o-mini resolved                        : ${summary.gptResolved}`);
    console.log(`  Total updated                               : ${DRY_RUN ? "(dry run)" : summary.totalUpdated}`);
    console.log(`  Unresolved (still null/unknown)             : ${summary.unresolved}`);
    console.log("─────────────────────────────────────────────────────────");
    console.log("[modality-fill] TIER LIFT");
    console.log(`  Investment Ready lift  : ${irLift >= 0 ? "+" : ""}${irLift}`);
    console.log(`  Reviewable+ lift       : ${reviewablePlusLift >= 0 ? "+" : ""}${reviewablePlusLift}`);
    console.log(`  Gap to 80% Reviewable+ : ${gapBefore.toLocaleString()} → ${gapAfter.toLocaleString()} (closed ${gapBefore - gapAfter})`);
    console.log("─────────────────────────────────────────────────────────");
  } finally {
    client.release();
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("[modality-fill] Fatal error:", err);
    pool.end().finally(() => process.exit(1));
  });
