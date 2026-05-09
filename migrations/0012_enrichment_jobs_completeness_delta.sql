-- Task #964 — Show completeness improvement in job history table
-- Adds before/after avg_completeness snapshots to enrichment_jobs so admins
-- can see how much each historical run moved the needle in the job history table.

ALTER TABLE enrichment_jobs
  ADD COLUMN IF NOT EXISTS completeness_before_run integer,
  ADD COLUMN IF NOT EXISTS completeness_after_run  integer;
