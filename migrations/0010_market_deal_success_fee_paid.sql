-- Task #709 — Auto-fire success-fee invoice on close
-- Adds successFeePaidAt timestamp (and ensures the success-fee columns exist
-- for environments that were synced via drizzle push instead of migrations).

ALTER TABLE market_deals
  ADD COLUMN IF NOT EXISTS success_fee_invoice_id  TEXT,
  ADD COLUMN IF NOT EXISTS success_fee_deal_size_m INTEGER,
  ADD COLUMN IF NOT EXISTS success_fee_amount      INTEGER,
  ADD COLUMN IF NOT EXISTS success_fee_paid_at     TIMESTAMP;
