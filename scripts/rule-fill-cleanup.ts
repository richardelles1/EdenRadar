/**
 * Rule-fill quality pass — DB cleanup script.
 *
 * Resets `indication = NULL` for rule-sourced assets whose current indication
 * was produced by a now-corrected false-positive regex pattern. Human-verified
 * records are never touched.
 *
 * Affected false-positive values:
 *   - "glioblastoma"         — where summary lacks the word "glioblastoma"/"gbm"/"high-grade glioma"
 *   - "non-small cell lung cancer" — where summary lacks "non-small" and "nsclc"
 *   - "major depressive disorder"  — where clinical co-signals are absent from text
 *   - "hiv infection"        — where therapeutic context is absent from text
 *
 * Usage: tsx scripts/rule-fill-cleanup.ts [--dry-run]
 */

import { Pool } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL });

async function query(sql: string, params: any[] = []) {
  const res = await pool.query(sql, params);
  return res;
}

async function main() {
  console.log(`[cleanup] Starting rule-fill quality pass cleanup${DRY_RUN ? " (DRY RUN)" : ""}…`);

  // ── Before counts ──────────────────────────────────────────────────────────
  const before = await query(`
    SELECT indication, COUNT(*) AS cnt
    FROM ingested_assets
    WHERE indication IN ('glioblastoma', 'non-small cell lung cancer', 'major depressive disorder', 'hiv infection')
      AND (human_verified->>'indication')::boolean IS NOT TRUE
      AND enrichment_sources->>'indication' = 'rule'
    GROUP BY indication
    ORDER BY indication
  `);
  console.log("\n[cleanup] Before counts (rule-sourced only, non-human-verified):");
  for (const r of before.rows) {
    console.log(`  ${r.indication}: ${r.cnt}`);
  }

  // ── 1. glioblastoma: clear where text lacks the specific word ─────────────
  const glioblastomaQ = `
    UPDATE ingested_assets
    SET indication = NULL,
        enrichment_sources = enrichment_sources - 'indication'
    WHERE indication = 'glioblastoma'
      AND (human_verified->>'indication')::boolean IS NOT TRUE
      AND enrichment_sources->>'indication' = 'rule'
      AND NOT (
        (COALESCE(asset_name,'') || ' ' || COALESCE(summary,'') || ' ' || COALESCE(abstract,''))
          ~* '\\mglioblastoma\\M|\\mgbm\\M|\\mhigh.grade\\s+glioma\\M'
      )
    RETURNING id
  `;
  if (DRY_RUN) {
    const r = await query(glioblastomaQ.replace("UPDATE ingested_assets\n    SET indication = NULL,\n        enrichment_sources = enrichment_sources - 'indication'\n    ", "SELECT id FROM ingested_assets ").replace("RETURNING id", ""));
    console.log(`\n[cleanup] [DRY RUN] glioblastoma: would reset ${r.rowCount} assets`);
  } else {
    const r = await query(glioblastomaQ);
    console.log(`\n[cleanup] glioblastoma: reset ${r.rowCount} assets`);
  }

  // ── 2. non-small cell lung cancer: clear where text lacks "non-small"/nsclc ─
  const nsclcQ = `
    UPDATE ingested_assets
    SET indication = NULL,
        enrichment_sources = enrichment_sources - 'indication'
    WHERE indication = 'non-small cell lung cancer'
      AND (human_verified->>'indication')::boolean IS NOT TRUE
      AND enrichment_sources->>'indication' = 'rule'
      AND NOT (
        (COALESCE(asset_name,'') || ' ' || COALESCE(summary,'') || ' ' || COALESCE(abstract,''))
          ~* '\\mnon.small\\M|\\mnsclc\\M'
      )
    RETURNING id
  `;
  if (DRY_RUN) {
    const r = await query(nsclcQ.replace("UPDATE ingested_assets\n    SET indication = NULL,\n        enrichment_sources = enrichment_sources - 'indication'\n    ", "SELECT id FROM ingested_assets ").replace("RETURNING id", ""));
    console.log(`[cleanup] [DRY RUN] non-small cell lung cancer: would reset ${r.rowCount} assets`);
  } else {
    const r = await query(nsclcQ);
    console.log(`[cleanup] non-small cell lung cancer: reset ${r.rowCount} assets`);
  }

  // ── 3. major depressive disorder: clear where clinical co-signals absent ──
  const mddQ = `
    UPDATE ingested_assets
    SET indication = NULL,
        enrichment_sources = enrichment_sources - 'indication'
    WHERE indication = 'major depressive disorder'
      AND (human_verified->>'indication')::boolean IS NOT TRUE
      AND enrichment_sources->>'indication' = 'rule'
      AND NOT (
        (COALESCE(asset_name,'') || ' ' || COALESCE(summary,'') || ' ' || COALESCE(abstract,''))
          ~* '\\mmajor\\s+depressive\\s+disorder\\M|\\mdepressive\\s+disorder\\M|\\mclinical\\s+depression\\M|\\mantidepressant\\M|\\btreat\\w*\\s+depression\\b|\\mdepression\\s+treatment\\M|\\mdepressive\\s+episode\\M|\\mmdd\\M'
      )
    RETURNING id
  `;
  if (DRY_RUN) {
    const r = await query(mddQ.replace("UPDATE ingested_assets\n    SET indication = NULL,\n        enrichment_sources = enrichment_sources - 'indication'\n    ", "SELECT id FROM ingested_assets ").replace("RETURNING id", ""));
    console.log(`[cleanup] [DRY RUN] major depressive disorder: would reset ${r.rowCount} assets`);
  } else {
    const r = await query(mddQ);
    console.log(`[cleanup] major depressive disorder: reset ${r.rowCount} assets`);
  }

  // ── 4. hiv infection: clear where therapeutic context absent ─────────────
  const hivQ = `
    UPDATE ingested_assets
    SET indication = NULL,
        enrichment_sources = enrichment_sources - 'indication'
    WHERE indication = 'hiv infection'
      AND (human_verified->>'indication')::boolean IS NOT TRUE
      AND enrichment_sources->>'indication' = 'rule'
      AND NOT (
        (COALESCE(asset_name,'') || ' ' || COALESCE(summary,'') || ' ' || COALESCE(abstract,''))
          ~* '\\mHIV\\s+(infection|disease|positive|status|patient|treatment|therap)\\M|HIV.infected|\\mantiretroviral\\M|\\mHAART\\M|\\mAIDS\\M.*(infect|patient|treatment|therap)'
      )
    RETURNING id
  `;
  if (DRY_RUN) {
    const r = await query(hivQ.replace("UPDATE ingested_assets\n    SET indication = NULL,\n        enrichment_sources = enrichment_sources - 'indication'\n    ", "SELECT id FROM ingested_assets ").replace("RETURNING id", ""));
    console.log(`[cleanup] [DRY RUN] hiv infection: would reset ${r.rowCount} assets`);
  } else {
    const r = await query(hivQ);
    console.log(`[cleanup] hiv infection: reset ${r.rowCount} assets`);
  }

  // ── After counts ───────────────────────────────────────────────────────────
  if (!DRY_RUN) {
    const after = await query(`
      SELECT indication, COUNT(*) AS cnt
      FROM ingested_assets
      WHERE indication IN ('glioblastoma', 'non-small cell lung cancer', 'major depressive disorder', 'hiv infection')
        AND (human_verified->>'indication')::boolean IS NOT TRUE
        AND enrichment_sources->>'indication' = 'rule'
      GROUP BY indication
      ORDER BY indication
    `);
    console.log("\n[cleanup] After counts (rule-sourced only, non-human-verified):");
    for (const r of after.rows) {
      console.log(`  ${r.indication}: ${r.cnt}`);
    }
  }

  await pool.end();
  console.log("\n[cleanup] Done.");
}

main().catch(err => {
  console.error("[cleanup] Fatal:", err);
  process.exit(1);
});
