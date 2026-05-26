-- Add server-side buyer profile storage to industry_profiles
ALTER TABLE industry_profiles
  ADD COLUMN IF NOT EXISTS buyer_profile jsonb DEFAULT NULL;
