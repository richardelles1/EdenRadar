-- Migration: Add payment failure email idempotency column to organizations table
-- Applied: 2026-04-24 (applied directly via pg client)
-- Safe to re-run: uses IF NOT EXISTS guard

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS payment_failed_email_sent_inv_id TEXT;

-- This column stores the Stripe invoice ID for which a payment failure email
-- was successfully sent. Before sending the failure email the webhook handler
-- checks this column to prevent duplicate sends on Stripe retries or server
-- restarts (durable idempotency), mirroring the welcome_email_sent_sub_id pattern.
