-- The Commons: pre-research concept market upgrade
ALTER TABLE concept_cards
  ADD COLUMN IF NOT EXISTS open_questions jsonb,
  ADD COLUMN IF NOT EXISTS mechanism_tags jsonb,
  ADD COLUMN IF NOT EXISTS escalation_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS escalation_requested_at timestamp,
  ADD COLUMN IF NOT EXISTS escalation_reviewed_at timestamp,
  ADD COLUMN IF NOT EXISTS escalation_note text,
  ADD COLUMN IF NOT EXISTS project_id integer REFERENCES research_projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at timestamp,
  ADD COLUMN IF NOT EXISTS content_hash text;

CREATE TABLE IF NOT EXISTS research_needs (
  id serial PRIMARY KEY,
  industry_user_id text NOT NULL,
  company_name text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  therapeutic_area text,
  mechanism_tags jsonb,
  stage_preference text,
  what_they_offer text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
