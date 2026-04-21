-- Add FDA designation tracking columns to ingested_assets.
-- These columns were previously added only at startup via ALTER TABLE in server/index.ts,
-- which is skipped in production ("Skipping startup migrations"). This migration ensures
-- the columns exist in all environments including Supabase production.
ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS fda_designation TEXT;
ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS fda_designation_date TEXT;
