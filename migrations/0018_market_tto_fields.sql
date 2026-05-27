-- Item 10: TTO native listing portal fields
-- Adds optional Technology Transfer Office metadata columns to market_listings.
-- These are submitted when a seller self-identifies as a TTO/university tech-transfer office.

ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS trl_level integer CHECK (trl_level BETWEEN 1 AND 9);
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS patent_numbers text;
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS inventor_affiliation text;
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS tto_ref_number text;
