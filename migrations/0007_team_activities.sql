-- Task #461: Team activity feed
-- Creates the team_activities table for logging org-scoped member actions.

CREATE TABLE IF NOT EXISTS team_activities (
  id          SERIAL PRIMARY KEY,
  org_id      INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  actor_name  TEXT NOT NULL,
  action      TEXT NOT NULL
    CHECK (action IN ('saved_asset','moved_asset','added_note','removed_asset','moved_pipeline')),
  asset_id    INTEGER REFERENCES saved_assets(id) ON DELETE SET NULL,
  asset_name  TEXT NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS team_activities_org_created_idx
  ON team_activities (org_id, created_at DESC);
