CREATE TABLE IF NOT EXISTS "scout_saved_searches" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "query" text,
  "filters" jsonb DEFAULT '{}' NOT NULL,
  "notify_by_email" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "scout_saved_searches_user_name_unique"
  ON "scout_saved_searches" ("user_id", "name");
