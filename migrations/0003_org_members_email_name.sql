-- Add email and member_name columns to org_members for display in admin UI
ALTER TABLE org_members ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE org_members ADD COLUMN IF NOT EXISTS member_name TEXT;
