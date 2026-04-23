CREATE TABLE IF NOT EXISTS "shared_links" (
  "id" SERIAL PRIMARY KEY,
  "token" UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "type" TEXT NOT NULL,
  "entity_id" TEXT,
  "payload" JSONB NOT NULL,
  "created_by" TEXT,
  "expires_at" TIMESTAMP NOT NULL,
  "password_hash" TEXT,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS "shared_links_token_idx" ON "shared_links" ("token");
CREATE INDEX IF NOT EXISTS "shared_links_created_by_idx" ON "shared_links" ("created_by");
