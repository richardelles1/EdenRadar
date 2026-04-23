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

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("SUPABASE_DATABASE_URL must be set. This app requires Supabase — do not use a Replit-managed database.");

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

    // Task #461 -- team_activities table for org-scoped member action feed
    await client.query(`
      CREATE TABLE IF NOT EXISTS team_activities (
        id         SERIAL PRIMARY KEY,
        org_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id    TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        action     TEXT NOT NULL,
        asset_id   INTEGER REFERENCES saved_assets(id) ON DELETE SET NULL,
        asset_name TEXT NOT NULL,
        metadata   JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS team_activities_org_created_idx
        ON team_activities (org_id, created_at DESC)
    `);
    // Add action CHECK constraint if not already present
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'team_activities_action_check' AND conrelid = 'team_activities'::regclass
        ) THEN
          ALTER TABLE team_activities
            ADD CONSTRAINT team_activities_action_check
            CHECK (action IN ('saved_asset','moved_asset','added_note','removed_asset','moved_pipeline'));
        END IF;
      END $$
    `);
    // Add asset_id FK if not already present (table may exist from initial create)
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'team_activities_asset_id_fkey' AND conrelid = 'team_activities'::regclass
        ) THEN
          ALTER TABLE team_activities
            ADD CONSTRAINT team_activities_asset_id_fkey
            FOREIGN KEY (asset_id) REFERENCES saved_assets(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);

    // Task #462 -- app_events table for feature-level usage analytics
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_events (
        id         SERIAL PRIMARY KEY,
        event      TEXT NOT NULL,
        metadata   JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS app_events_event_created_idx
        ON app_events (event, created_at DESC)
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
