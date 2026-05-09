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
 */

import { pool } from "../server/db";
import { runModalityFill } from "../server/lib/pipeline/modalityFill";

const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_GPT = process.argv.includes("--skip-gpt");

async function main() {
  console.log(`[modality-fill] Starting${DRY_RUN ? " (DRY RUN)" : ""}…`);

  const client = await pool.connect();
  try {
    const summary = await runModalityFill(client, {
      dryRun: DRY_RUN,
      skipGpt: SKIP_GPT,
      onProgress: (done, total) => {
        process.stdout.write(`\r[modality-fill] Updated ${done}/${total}…`);
      },
    });

    if (!DRY_RUN) process.stdout.write("\n");

    console.log("\n─────────────────────────────────────────");
    console.log("[modality-fill] SUMMARY");
    console.log(`  Total assets processed  : ${summary.total}`);
    console.log(`  Step 1 normalizations   : ${summary.normalized}`);
    console.log(`  Rule-matched (T1)       : ${summary.tierCounts.t1}`);
    console.log(`  Rule-matched (T2)       : ${summary.tierCounts.t2}`);
    console.log(`  Rule-matched (T3)       : ${summary.tierCounts.t3}`);
    console.log(`  Total rule-matched      : ${summary.ruleMatched}`);
    console.log(`  Sent to GPT-4o-mini     : ${summary.gptSent}`);
    console.log(`  GPT-4o-mini resolved    : ${summary.gptResolved}`);
    console.log(`  Total updated           : ${DRY_RUN ? "(dry run)" : summary.totalUpdated}`);
    console.log(`  Unresolved (still null) : ${summary.unresolved}`);
    console.log("─────────────────────────────────────────");
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
