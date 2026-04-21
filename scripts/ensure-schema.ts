/**
 * ensure-schema.ts
 *
 * One-shot schema alignment script for columns that drizzle-kit db:push cannot
 * apply non-interactively (e.g. when other pending schema changes trigger an
 * interactive TTY prompt).
 *
 * Safe to run multiple times -- every statement uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
 *
 * Usage:
 *   npx tsx scripts/ensure-schema.ts
 */

import { Pool } from "pg";

const url = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("SUPABASE_DATABASE_URL or DATABASE_URL must be set");

const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Task #406 -- deep_enrich_attempts column on ingested_assets
    // Added because db:push was blocked by an interactive prompt on the
    // manual_institutions_name_unique constraint.  Column is already defined
    // in shared/schema.ts (deepEnrichAttempts: integer, NOT NULL, DEFAULT 0).
    await client.query(`
      ALTER TABLE ingested_assets
      ADD COLUMN IF NOT EXISTS deep_enrich_attempts integer NOT NULL DEFAULT 0
    `);

    await client.query("COMMIT");
    console.log("ensure-schema: all column checks passed");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("ensure-schema: error --", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
