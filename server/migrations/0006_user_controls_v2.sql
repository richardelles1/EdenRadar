-- Migration 0006: User controls v2
-- Adds user account status, API key type classification, unified audit trail targetOrgId,
-- DB-driven feature entitlements, and org-level entitlement overrides.
-- Applied via direct DDL; this file is the canonical record.

-- 1. User account status on industry_profiles
ALTER TABLE industry_profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_by text,
  ADD COLUMN IF NOT EXISTS status_note text;

-- 2. API key type classification
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS key_type text NOT NULL DEFAULT 'personal';

-- Backfill: keys already linked to an org are org keys
UPDATE api_keys SET key_type = 'org' WHERE org_id IS NOT NULL AND key_type = 'personal';

-- 3. targetOrgId on admin_events for unified cross-referencing
ALTER TABLE admin_events
  ADD COLUMN IF NOT EXISTS target_org_id integer;

-- 4. Plan entitlements — DB-driven source of truth for plan feature limits
CREATE TABLE IF NOT EXISTS plan_entitlements (
  id          serial PRIMARY KEY,
  plan_tier   text NOT NULL,
  feature_key text NOT NULL,
  limit_value integer,               -- NULL = unlimited
  limit_type  text NOT NULL DEFAULT 'total',  -- daily | monthly | total | boolean
  enabled     boolean NOT NULL DEFAULT true,
  UNIQUE (plan_tier, feature_key)
);

INSERT INTO plan_entitlements (plan_tier, feature_key, limit_value, limit_type, enabled) VALUES
  -- individual
  ('individual', 'api_calls_daily',   500,  'daily',   true),
  ('individual', 'seat_count',        1,    'total',   true),
  ('individual', 'pipeline_lists',    10,   'total',   true),
  ('individual', 'reports_monthly',   5,    'monthly', true),
  ('individual', 'market_access',     0,    'boolean', false),
  -- team5
  ('team5',      'api_calls_daily',   5000, 'daily',   true),
  ('team5',      'seat_count',        5,    'total',   true),
  ('team5',      'pipeline_lists',    NULL, 'total',   true),
  ('team5',      'reports_monthly',   NULL, 'monthly', true),
  ('team5',      'market_access',     0,    'boolean', false),
  -- team10
  ('team10',     'api_calls_daily',   5000, 'daily',   true),
  ('team10',     'seat_count',        10,   'total',   true),
  ('team10',     'pipeline_lists',    NULL, 'total',   true),
  ('team10',     'reports_monthly',   NULL, 'monthly', true),
  ('team10',     'market_access',     0,    'boolean', false),
  -- enterprise
  ('enterprise', 'api_calls_daily',   50000,'daily',   true),
  ('enterprise', 'seat_count',        999,  'total',   true),
  ('enterprise', 'pipeline_lists',    NULL, 'total',   true),
  ('enterprise', 'reports_monthly',   NULL, 'monthly', true),
  ('enterprise', 'market_access',     1,    'boolean', true)
ON CONFLICT (plan_tier, feature_key) DO NOTHING;

-- 5. Org-level entitlement overrides — allows custom limits per org above/below plan defaults
CREATE TABLE IF NOT EXISTS org_entitlement_overrides (
  id            serial PRIMARY KEY,
  org_id        integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature_key   text NOT NULL,
  override_value integer,    -- NULL = unlimited override
  enabled       boolean,     -- NULL = inherit from plan; false = explicitly disabled
  granted_by    text,
  granted_at    timestamptz NOT NULL DEFAULT NOW(),
  note          text,
  UNIQUE (org_id, feature_key)
);

CREATE INDEX IF NOT EXISTS org_entitlement_overrides_org_idx ON org_entitlement_overrides(org_id);
