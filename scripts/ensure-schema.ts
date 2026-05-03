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
    // pgvector extension must be created outside a transaction block.
    // Supabase typically pre-installs it; this is a no-op if already present.
    try {
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    } catch (extErr: unknown) {
      const msg = extErr instanceof Error ? extErr.message : String(extErr);
      console.warn("ensure-schema: pgvector extension not available (embedding column will be skipped):", msg);
    }

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

    // Task #475 -- Stripe billing columns on organizations
    // These were defined in shared/schema.ts but never applied to the live DB.
    // All nullable — safe for existing rows.
    await client.query(`
      ALTER TABLE organizations
        ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT,
        ADD COLUMN IF NOT EXISTS stripe_subscription_id   TEXT,
        ADD COLUMN IF NOT EXISTS stripe_status            TEXT,
        ADD COLUMN IF NOT EXISTS stripe_price_id          TEXT,
        ADD COLUMN IF NOT EXISTS stripe_current_period_end TIMESTAMP,
        ADD COLUMN IF NOT EXISTS stripe_cancel_at         TIMESTAMP,
        ADD COLUMN IF NOT EXISTS welcome_email_sent_sub_id TEXT
    `);

    // Task #482 -- industry_profiles columns missing from live DB.
    // Startup migrations in server/index.ts are dead code (return early).
    // subscribed_to_digest is NOT NULL so it needs a DEFAULT for existing rows.
    await client.query(`
      ALTER TABLE industry_profiles
        ADD COLUMN IF NOT EXISTS subscribed_to_digest  BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS last_alert_sent_at    TIMESTAMP,
        ADD COLUMN IF NOT EXISTS alert_last_asset_id   INTEGER,
        ADD COLUMN IF NOT EXISTS notification_prefs    JSONB DEFAULT '{"frequency":"daily"}',
        ADD COLUMN IF NOT EXISTS last_viewed_alerts_at TIMESTAMP
    `);

    // Task #482 -- ingested_assets enrichment columns from dead startup migration.
    // All nullable (or have safe defaults) so existing rows are unaffected.
    await client.query(`
      ALTER TABLE ingested_assets
        ADD COLUMN IF NOT EXISTS source_name           TEXT NOT NULL DEFAULT 'tech_transfer',
        ADD COLUMN IF NOT EXISTS categories            JSONB,
        ADD COLUMN IF NOT EXISTS category_confidence   REAL,
        ADD COLUMN IF NOT EXISTS available             BOOLEAN,
        ADD COLUMN IF NOT EXISTS content_hash          TEXT,
        ADD COLUMN IF NOT EXISTS completeness_score    REAL,
        ADD COLUMN IF NOT EXISTS last_content_change_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS innovation_claim      TEXT,
        ADD COLUMN IF NOT EXISTS mechanism_of_action   TEXT,
        ADD COLUMN IF NOT EXISTS ip_type               TEXT,
        ADD COLUMN IF NOT EXISTS unmet_need            TEXT,
        ADD COLUMN IF NOT EXISTS comparable_drugs      TEXT,
        ADD COLUMN IF NOT EXISTS licensing_readiness   TEXT,
        ADD COLUMN IF NOT EXISTS patent_status         TEXT,
        ADD COLUMN IF NOT EXISTS licensing_status      TEXT,
        ADD COLUMN IF NOT EXISTS inventors             JSONB,
        ADD COLUMN IF NOT EXISTS contact_email         TEXT,
        ADD COLUMN IF NOT EXISTS technology_id         TEXT,
        ADD COLUMN IF NOT EXISTS abstract              TEXT,
        ADD COLUMN IF NOT EXISTS duplicate_flag        BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS duplicate_of_id       INTEGER,
        ADD COLUMN IF NOT EXISTS dedupe_embedding      JSONB,
        ADD COLUMN IF NOT EXISTS dedupe_similarity     REAL
    `);

    // Task #482 -- ingestion_runs column from dead startup migration.
    await client.query(`
      ALTER TABLE ingestion_runs
        ADD COLUMN IF NOT EXISTS relevant_new_count INTEGER NOT NULL DEFAULT 0
    `);

    // Task #482 -- saved_assets.status column and check constraint.
    await client.query(`
      ALTER TABLE saved_assets
        ADD COLUMN IF NOT EXISTS status TEXT
    `);
    // Values match SAVED_ASSET_STATUSES in shared/schema.ts (5-value vocabulary).
    // The server/index.ts startup function also enforces this constraint (DROP + re-ADD),
    // so this is a no-op if it already exists with the correct values.
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'saved_assets_status_check' AND conrelid = 'saved_assets'::regclass
        ) THEN
          ALTER TABLE saved_assets
            ADD CONSTRAINT saved_assets_status_check
            CHECK (status IS NULL OR status IN ('watching', 'evaluating', 'in_discussion', 'on_hold', 'passed'));
        END IF;
      END $$
    `);

    await client.query("COMMIT");

    // Add the vector embedding column outside the transaction — it depends on
    // the pgvector extension (already ensured above) but cannot be in a txn
    // alongside the extension creation on all PG versions.
    try {
      await client.query(`
        ALTER TABLE ingested_assets
          ADD COLUMN IF NOT EXISTS embedding vector(1536)
      `);
    } catch (embErr: unknown) {
      const msg = embErr instanceof Error ? embErr.message : String(embErr);
      // Non-fatal: embedding is used for similarity search, not for checkout/industry portal.
      console.warn("ensure-schema: embedding column skipped (pgvector unavailable?):", msg);
    }

    // Task #498 -- user_id on search_history for per-user scoping
    await client.query(`
      ALTER TABLE search_history
      ADD COLUMN IF NOT EXISTS user_id text
    `);

    // Task #511 -- invite tracking columns on org_members
    await client.query(`
      ALTER TABLE org_members
      ADD COLUMN IF NOT EXISTS invite_source text,
      ADD COLUMN IF NOT EXISTS invite_status text DEFAULT 'pending'
    `);

    // Task #714 -- EdenMarket grace period columns on organizations
    await client.query(`
      ALTER TABLE organizations
      ADD COLUMN IF NOT EXISTS market_access_expires_at timestamp,
      ADD COLUMN IF NOT EXISTS market_grace_email_sent_at timestamp
    `);

    console.log("ensure-schema: all column checks passed");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ensure-schema: error --", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
