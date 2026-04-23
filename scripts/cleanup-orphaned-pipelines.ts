/**
 * cleanup-orphaned-pipelines.ts
 *
 * Removes pipeline_lists rows that have no owner (user_id IS NULL and
 * org_id IS NULL). These rows were created before user accounts existed and
 * are now invisible to all users — but they still occupy space and may confuse
 * future audits.
 *
 * The saved_assets.pipeline_list_id FK is defined ON DELETE SET NULL, so any
 * saved assets that referenced an orphaned pipeline will have their
 * pipeline_list_id nulled out automatically — they are NOT deleted.
 *
 * Safe to run multiple times (idempotent — if no orphans exist, 0 rows deleted).
 *
 * Usage:
 *   npx tsx scripts/cleanup-orphaned-pipelines.ts
 *
 * Add --dry-run to preview what would be deleted without making any changes:
 *   npx tsx scripts/cleanup-orphaned-pipelines.ts --dry-run
 */

import { Pool } from "pg";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) {
  throw new Error(
    "SUPABASE_DATABASE_URL must be set. This script targets the Supabase database."
  );
}

const isDryRun = process.argv.includes("--dry-run");

const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    // ── 1. Identify orphaned pipelines ────────────────────────────────────────
    const orphanResult = await client.query<{
      id: number;
      name: string;
      created_at: Date;
    }>(`
      SELECT id, name, created_at
      FROM pipeline_lists
      WHERE user_id IS NULL AND org_id IS NULL
      ORDER BY created_at
    `);

    const orphans = orphanResult.rows;

    if (orphans.length === 0) {
      console.log("cleanup-orphaned-pipelines: no orphaned pipelines found — nothing to do.");
      return;
    }

    console.log(`cleanup-orphaned-pipelines: found ${orphans.length} orphaned pipeline(s):`);
    for (const row of orphans) {
      console.log(`  id=${row.id}  name="${row.name}"  created_at=${row.created_at.toISOString()}`);
    }

    // ── 2. Count saved assets that will be un-linked (NOT deleted) ────────────
    const ids = orphans.map((r) => r.id);
    const affectedAssetsResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM saved_assets WHERE pipeline_list_id = ANY($1::int[])`,
      [ids]
    );
    const affectedCount = parseInt(affectedAssetsResult.rows[0].count, 10);
    if (affectedCount > 0) {
      console.log(
        `cleanup-orphaned-pipelines: ${affectedCount} saved asset(s) reference these pipelines — ` +
        `their pipeline_list_id will be set to NULL (assets are NOT deleted).`
      );
    }

    if (isDryRun) {
      console.log("cleanup-orphaned-pipelines: --dry-run mode — no changes made.");
      return;
    }

    // ── 3. Delete orphaned pipelines (FK cascade nulls saved_assets) ──────────
    const deleteResult = await client.query(
      `DELETE FROM pipeline_lists WHERE id = ANY($1::int[])`,
      [ids]
    );

    console.log(
      `cleanup-orphaned-pipelines: deleted ${deleteResult.rowCount} orphaned pipeline(s). ` +
      `${affectedCount} saved asset(s) had their pipeline_list_id set to NULL.`
    );
  } catch (err) {
    console.error("cleanup-orphaned-pipelines: error --", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
