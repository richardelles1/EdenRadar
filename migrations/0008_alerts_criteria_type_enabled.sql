-- Migration 0008: alerts criteriaType + enabled columns + backfill
--
-- Adds criteria_type (text NOT NULL DEFAULT 'custom') and enabled (boolean NOT NULL DEFAULT true)
-- to user_alerts, then backfills existing rows:
--   • criteria_type: inferred from filter presence (all empty → 'all_new', else 'custom')
--   • enabled: already has a column-level default; no existing rows need updating
--   • name: any row with a blank/null name gets 'My Alert — <created_at date>'
--
-- Safe to re-run: uses IF NOT EXISTS / idempotent UPDATE logic.

-- 1. Add columns if they do not yet exist ----------------------------------------

ALTER TABLE user_alerts
  ADD COLUMN IF NOT EXISTS criteria_type TEXT;

ALTER TABLE user_alerts
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN;

-- 2. Back-fill criteria_type: rows with NO filter criteria are "all_new" -----------

UPDATE user_alerts
SET criteria_type = 'all_new'
WHERE criteria_type IS NULL
  AND (query IS NULL OR TRIM(query) = '')
  AND (modalities IS NULL OR modalities = '{}')
  AND (stages    IS NULL OR stages    = '{}')
  AND (institutions IS NULL OR institutions = '{}');

-- All other rows are "custom" alerts -----------------------------------------------

UPDATE user_alerts
SET criteria_type = 'custom'
WHERE criteria_type IS NULL;

-- 3. Set NOT NULL + DEFAULT now that every row has a value -------------------------

ALTER TABLE user_alerts
  ALTER COLUMN criteria_type SET NOT NULL,
  ALTER COLUMN criteria_type SET DEFAULT 'custom';

-- 4. Back-fill enabled: every existing alert is active unless explicitly set -------

UPDATE user_alerts
SET enabled = true
WHERE enabled IS NULL;

ALTER TABLE user_alerts
  ALTER COLUMN enabled SET NOT NULL,
  ALTER COLUMN enabled SET DEFAULT true;

-- 5. Back-fill missing alert names ------------------------------------------------

UPDATE user_alerts
SET name = 'My Alert — ' || TO_CHAR(created_at AT TIME ZONE 'UTC', 'Mon DD, YYYY')
WHERE name IS NULL OR TRIM(name) = '';
