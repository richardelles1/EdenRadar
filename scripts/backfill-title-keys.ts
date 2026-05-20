/**
 * One-time backfill: compute title_key for all existing assets and collapse
 * cross-institution exact-title duplicates by setting canonical_asset_id.
 *
 * Run once against Supabase:
 *   tsx scripts/backfill-title-keys.ts
 */
import { Pool } from "pg";
import { computeTitleKey } from "../server/lib/pipeline/titleKey";

const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

const BATCH = 2000;

async function run() {
  console.log("[backfill] Starting title-key backfill...");

  // --- Pass 1: stamp title_key on every asset that lacks one ---
  let offset = 0;
  let totalKeyed = 0;
  while (true) {
    const { rows } = await pool.query<{ id: number; asset_name: string }>(
      `SELECT id, asset_name FROM ingested_assets
       WHERE title_key IS NULL AND asset_name IS NOT NULL
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [BATCH, offset]
    );
    if (rows.length === 0) break;

    // Build per-row update values
    const cases = rows
      .map((r) => `WHEN id = ${r.id} THEN '${computeTitleKey(r.asset_name).replace(/'/g, "''")}'`)
      .join(" ");
    const ids = rows.map((r) => r.id).join(",");
    await pool.query(
      `UPDATE ingested_assets SET title_key = CASE ${cases} END WHERE id IN (${ids})`
    );

    totalKeyed += rows.length;
    offset += rows.length;
    if (rows.length < BATCH) break;
    console.log(`[backfill] Keyed ${totalKeyed} assets...`);
  }
  console.log(`[backfill] Pass 1 done — ${totalKeyed} assets stamped with title_key`);

  // --- Pass 2: find cross-institution duplicates using title_key ---
  // For each title_key that appears across multiple institutions, keep the
  // asset with the highest completeness_score (ties broken by lower id) as
  // canonical, and point all others to it via canonical_asset_id.
  const { rows: dupGroups } = await pool.query<{
    title_key: string;
    ids: string;
    institutions: string;
  }>(`
    SELECT
      title_key,
      string_agg(id::text, ',' ORDER BY COALESCE(completeness_score, 0) DESC, id ASC) AS ids,
      string_agg(DISTINCT institution, ' | ') AS institutions
    FROM ingested_assets
    WHERE title_key IS NOT NULL
      AND title_key <> ''
      AND relevant = true
      AND canonical_asset_id IS NULL
    GROUP BY title_key
    HAVING COUNT(DISTINCT institution) > 1
  `);

  console.log(`[backfill] Found ${dupGroups.length} title keys with cross-institution duplicates`);

  let collapsed = 0;
  for (const group of dupGroups) {
    const ids = group.ids.split(",").map(Number);
    const canonId = ids[0]!;         // highest completeness (first in sorted order)
    const dupeIds = ids.slice(1);    // rest are non-canonical

    if (dupeIds.length === 0) continue;

    await pool.query(
      `UPDATE ingested_assets SET canonical_asset_id = $1 WHERE id = ANY($2) AND canonical_asset_id IS NULL`,
      [canonId, dupeIds]
    );
    collapsed += dupeIds.length;

    console.log(
      `[backfill] canonical=${canonId} ← ${dupeIds.length} dupe(s) | key="${group.title_key.slice(0, 60)}" | institutions: ${group.institutions}`
    );
  }

  console.log(`[backfill] Pass 2 done — ${collapsed} assets linked to canonical records`);
  await pool.end();
  console.log("[backfill] Complete.");
}

run().catch((err) => {
  console.error("[backfill] Fatal:", err);
  process.exit(1);
});
