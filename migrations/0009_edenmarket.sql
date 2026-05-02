-- EdenMarket schema migration
-- Adds edenMarketAccess to organizations + three new market tables

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS eden_market_access BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS eden_market_stripe_sub_id TEXT;

CREATE TABLE IF NOT EXISTS market_listings (
  id                  SERIAL PRIMARY KEY,
  seller_id           TEXT NOT NULL,
  org_id              INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  asset_name          TEXT,
  blind               BOOLEAN NOT NULL DEFAULT FALSE,
  therapeutic_area    TEXT NOT NULL,
  modality            TEXT NOT NULL,
  stage               TEXT NOT NULL,
  milestone_history   TEXT,
  mechanism           TEXT,
  ip_status           TEXT,
  ip_summary          TEXT,
  asking_price        TEXT,
  price_range_min     INTEGER,
  price_range_max     INTEGER,
  engagement_status   TEXT NOT NULL DEFAULT 'actively_seeking',
  ai_summary          TEXT,
  status              TEXT NOT NULL DEFAULT 'draft',
  admin_note          TEXT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS market_eois (
  id          SERIAL PRIMARY KEY,
  listing_id  INTEGER NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
  buyer_id    TEXT NOT NULL,
  company     TEXT NOT NULL,
  role        TEXT NOT NULL,
  rationale   TEXT NOT NULL,
  budget_range TEXT,
  timeline    TEXT,
  status      TEXT NOT NULL DEFAULT 'submitted',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS market_subscriptions (
  id                      SERIAL PRIMARY KEY,
  org_id                  INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_subscription_id  TEXT,
  status                  TEXT NOT NULL DEFAULT 'active',
  current_period_end      TIMESTAMP,
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
