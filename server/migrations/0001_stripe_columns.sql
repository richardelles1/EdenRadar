-- Migration: Add Stripe billing columns to organizations table
-- Applied: 2026-04-22 (run manually via Supabase SQL editor or psql)
-- Safe to re-run: all statements use IF NOT EXISTS / idempotent guards

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_status          TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id        TEXT;

-- plan_tier already exists as NOT NULL DEFAULT 'individual'.
-- "none" is the canonical non-paid sentinel written on subscription cancellation.
-- PAID_PLANS set in routes.ts does not include "none", so /api/me/plan returns null for it.
