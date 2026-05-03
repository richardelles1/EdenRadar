-- Task #711 — Seller verification badge
-- Adds admin-controlled EdenMarket seller verification fields to organizations.
-- Verification is granted by an ADMIN_EMAILS user; verified orgs surface a
-- "Verified Seller" badge on listing cards and listing detail pages.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS market_seller_verified_at      TIMESTAMP,
  ADD COLUMN IF NOT EXISTS market_seller_verified_by      TEXT,
  ADD COLUMN IF NOT EXISTS market_seller_verification_note TEXT;
