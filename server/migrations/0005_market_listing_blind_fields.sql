-- Migration 0005: Per-field listing blinding (Task #710)
-- Replaces the single `blind` boolean with a per-field `blind_fields` jsonb map.
-- The `blind` boolean is retained as a derived "any field masked" badge flag —
-- the server keeps it in sync on create/update.
-- Applied via direct DDL on 2026-05-03; this file is the canonical record.

ALTER TABLE market_listings
  ADD COLUMN IF NOT EXISTS blind_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill: legacy `blind = true` rows expand to the canonical 3-field mask
-- (asset name, institution, inventor names) so existing buyer views keep
-- the same fields hidden.
UPDATE market_listings
SET blind_fields = '{"assetName":true,"institution":true,"inventorNames":true}'::jsonb
WHERE blind = true
  AND blind_fields = '{}'::jsonb;
