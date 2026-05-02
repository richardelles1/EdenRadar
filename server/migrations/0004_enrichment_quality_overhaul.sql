-- Migration 0004: Enrichment Quality Overhaul
-- Adds 5 new columns and relaxes NOT NULL on target/modality/indication
-- so the pipeline can store null for non-applicable fields (e.g. device assets have no target).
-- Applied via direct DDL on 2026-05-02; this file serves as the canonical record.

ALTER TABLE ingested_assets
  ALTER COLUMN target     DROP NOT NULL,
  ALTER COLUMN modality   DROP NOT NULL,
  ALTER COLUMN indication DROP NOT NULL;

ALTER TABLE ingested_assets
  ADD COLUMN IF NOT EXISTS asset_class        TEXT,
  ADD COLUMN IF NOT EXISTS device_attributes  JSONB,
  ADD COLUMN IF NOT EXISTS enrichment_sources JSONB,
  ADD COLUMN IF NOT EXISTS human_verified     JSONB,
  ADD COLUMN IF NOT EXISTS data_sparse        BOOLEAN;
