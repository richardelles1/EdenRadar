-- Deep research workflow expansion: 13-step systematic review pipeline
-- Adds new sections: Eligibility Criteria, Search Strategy, Screening (PRISMA),
-- Data Extraction, Risk of Bias, Evidence Synthesis, Results & Conclusions,
-- Dissemination Plan, and Protocol Registration fields.

ALTER TABLE research_projects
  ADD COLUMN IF NOT EXISTS eligibility_criteria    jsonb,
  ADD COLUMN IF NOT EXISTS search_strategy         jsonb,
  ADD COLUMN IF NOT EXISTS screening_papers        jsonb,
  ADD COLUMN IF NOT EXISTS extraction_fields       jsonb,
  ADD COLUMN IF NOT EXISTS extracted_data          jsonb,
  ADD COLUMN IF NOT EXISTS risk_of_bias            jsonb,
  ADD COLUMN IF NOT EXISTS rob_tool                text,
  ADD COLUMN IF NOT EXISTS evidence_synthesis_text jsonb,
  ADD COLUMN IF NOT EXISTS research_results        jsonb,
  ADD COLUMN IF NOT EXISTS dissemination_plan      jsonb,
  ADD COLUMN IF NOT EXISTS prospero_id             text,
  ADD COLUMN IF NOT EXISTS protocol_version        text,
  ADD COLUMN IF NOT EXISTS protocol_locked_at      timestamp;
