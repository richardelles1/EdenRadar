-- Migration: Add welcome email idempotency column to organizations table
-- Applied: 2026-04-22 (applied directly via pg client)
-- Safe to re-run: uses IF NOT EXISTS guard

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS welcome_email_sent_sub_id TEXT;

-- This column stores the Stripe subscription ID for which a welcome email
-- was successfully sent. Before sending a subscription welcome email the
-- webhook handler checks this column to prevent duplicate sends on retries
-- or server restarts (durable idempotency).
