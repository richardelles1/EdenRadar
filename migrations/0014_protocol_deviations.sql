ALTER TABLE research_projects
  ADD COLUMN IF NOT EXISTS protocol_deviations jsonb;
