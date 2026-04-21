-- Add deep_enrich_attempts counter to ingested_assets
-- Tracks how many times an asset has been submitted for deep enrichment,
-- enabling backoff logic and preventing runaway re-enrichment loops.
ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS deep_enrich_attempts integer NOT NULL DEFAULT 0;
