-- Migration: 0001_stage_tracking_columns
-- Applied to Supabase production on 2026-04-07
-- Adds stage-change tracking fields to ingested_assets.
-- These columns are referenced by:
--   - shared/schema.ts (stageChangedAt, previousStage)
--   - server/storage.ts (bulkUpsertIngestedAssets, updateIngestedAssetEnrichment)
--   - server/routes.ts  (stage fields mapper, /api/scout/recently-added)

ALTER TABLE ingested_assets
  ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS previous_stage   TEXT;
