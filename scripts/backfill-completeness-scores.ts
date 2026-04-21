/**
 * One-time migration: recompute completeness scores for all ingested_assets that
 * already have a non-null completenessScore using the unified computeCompletenessScore
 * function (which includes summary, abstract, categories, inventors, and patentStatus).
 *
 * Previously, PATH 1 (standard enrichment) only scored the 9 classification fields,
 * while PATH 2 (deep enrichment) correctly scored all 14 fields. This caused assets
 * that were classified by PATH 1 to have under-reported scores, leading bucket-C
 * re-enrichment (score < 15) to select or skip the wrong assets.
 *
 * Usage:
 *   npx tsx scripts/backfill-completeness-scores.ts
 *
 * The script is idempotent — rows whose stored score already matches the recomputed
 * value are skipped. Only completenessScore is updated; enrichedAt and
 * deepEnrichAttempts are left untouched to prevent unwanted re-enrichment.
 */

import { pool } from "../server/db";
import { storage } from "../server/storage";

async function main() {
  console.log("[backfill] Starting completeness score backfill...");
  try {
    const result = await storage.backfillCompletenessScores();
    console.log(
      `[backfill] Complete — total: ${result.total}, updated: ${result.updated}, unchanged: ${result.unchanged}`
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[backfill] Fatal error:", err);
  process.exit(1);
});
