ALTER TABLE "sync_sessions" ADD COLUMN IF NOT EXISTS "content_updated" integer NOT NULL DEFAULT 0;
