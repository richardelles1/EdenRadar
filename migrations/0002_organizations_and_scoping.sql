-- 0002_organizations_and_scoping.sql
-- Creates organizations and org_members tables.
-- Adds org_id to industry_profiles.
-- Adds user_id + org_id to pipeline_lists (multi-tenant scoping).
-- Adds user_id to saved_assets and user_alerts.
-- All statements are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  plan_tier TEXT NOT NULL DEFAULT 'individual',
  seat_limit INTEGER NOT NULL DEFAULT 1,
  logo_url TEXT,
  primary_color TEXT,
  billing_email TEXT,
  billing_method TEXT NOT NULL DEFAULT 'stripe',
  billing_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- org_members table
CREATE TABLE IF NOT EXISTS org_members (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add org_id to industry_profiles
ALTER TABLE industry_profiles ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;

-- Add user scoping to pipeline_lists
ALTER TABLE pipeline_lists ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE pipeline_lists ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;

-- Add user scoping to saved_assets
ALTER TABLE saved_assets ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Add user scoping to user_alerts
ALTER TABLE user_alerts ADD COLUMN IF NOT EXISTS user_id TEXT;
