/**
 * SKELETON SPECS — placeholder tests for the remaining critical journeys.
 *
 * Each `test.fixme(...)` documents WHAT to assert and WHAT new infrastructure
 * is required (mocks, fixtures, env vars). When you implement one, replace
 * `test.fixme` with `test` and remove the TODO block.
 *
 * The blockers below are all "honest hard problems": each requires either a
 * dedicated Supabase test project, a network-mock layer, or a test-only
 * server endpoint. They are NOT cosmetic — do not remove them without
 * actually solving the underlying issue.
 */
import { test } from "@playwright/test";

test.describe("Journey 1 — signup → trial active", () => {
  test.fixme("new user signs up, lands on dashboard, has 14-day trial", async () => {
    /* TODO:
     *   - Need Supabase test project OR `supabase.auth.signUp` mock that
     *     issues a real-shaped JWT the backend's verifyAnyAuth accepts.
     *   - Need to seed/clean an organizations row + trial_started_at field.
     *   - Assert /industry/dashboard shows "Trial: 14 days remaining" tile.
     *   - Verify org row has `trial_ends_at = now + 14d`.
     */
  });
});

test.describe("Journey 2 — digest opt-in → admin trigger → email logged", () => {
  test.fixme("opt-in toggle persists; admin run-digest creates dispatch_logs row", async () => {
    /* TODO:
     *   - Need authenticated industry session (see Journey 1 blocker).
     *   - Need authenticated admin session (allowlist email + JWT).
     *   - Need to mock Resend (intercept `POST /emails` to api.resend.com).
     *   - Toggle subscribed_to_digest on /settings, then POST
     *     /api/admin/digest/run, assert dispatch_logs row inserted with
     *     `is_test = false` and asset_ids array populated.
     */
  });
});

test.describe("Journey 3 — realtime alert latency (Task #687)", () => {
  test.fixme("ingesting a new asset fires an alert within latency budget", async () => {
    /* TODO:
     *   - Seed an industry profile with matching therapeutic_areas.
     *   - Insert a new ingested_assets row matching the profile filter.
     *   - Wait for the periodic-evaluation timer (or expose a test-only
     *     POST /api/_e2e/trigger-alerts endpoint guarded by E2E_TEST_TOKEN).
     *   - Assert dispatch_logs row written with sent_at - first_seen_at < 5min.
     *   - Assert /api/admin/alerts/latency returns avgMinutes < 5.
     */
  });
});

test.describe("Journey 4 — EdenScout search → save asset", () => {
  test.fixme("search returns results, save persists to saved_assets", async () => {
    /* TODO:
     *   - Mock OpenAI embeddings / OpenAI chat at network layer (Playwright
     *     route() interception of api.openai.com).
     *   - Need authenticated session.
     *   - Type query into /scout, assert result cards render, click save,
     *     verify saved_assets row inserted for user_id.
     */
  });
});

test.describe("Journey 5 — EdenMarket EOI → mutual interest", () => {
  test.fixme("buyer submits EOI, seller accepts, both unlock identities", async () => {
    /* TODO:
     *   - Need TWO authenticated sessions (buyer + seller) — use
     *     `browser.newContext()` to isolate cookies.
     *   - Seed a market_listings row with a known seller_id.
     *   - Submit EOI via UI on /market/listing/:id.
     *   - As seller, accept the EOI from /market/seller dashboard.
     *   - Assert market_eois.status = 'mutual_interest' and identities are
     *     visible to both parties.
     */
  });
});

test.describe("Journey 6 — NDA sign → deal room unlocked", () => {
  test.fixme("buyer signs NDA, deal room data room becomes accessible", async () => {
    /* TODO:
     *   - Continuation of Journey 5 fixture state (mutual interest).
     *   - Visit /market/deals/:id, sign NDA via DocuSign-style modal.
     *   - Assert deal_rooms.nda_signed_at is non-null.
     *   - Assert /market/deals/:id shows uploaded data room files.
     */
  });
});

test.describe("Journey 7 — admin password reset (Tasks #676/#677)", () => {
  test.fixme("admin /reset-password flow sends Supabase reset email", async () => {
    /* TODO:
     *   - Visit /admin/reset-password while signed in as allowlisted admin.
     *   - Mock supabase.auth.resetPasswordForEmail OR intercept the network
     *     request and verify it was called with the admin's email.
     *   - Assert success toast and that no plaintext password ever leaves
     *     the UI (regression guard for legacy shared-password gate).
     */
  });
});

test.describe("Journey 9 — team invite → accept → org membership", () => {
  test.fixme("admin invites teammate, teammate signs up via link, joins org", async () => {
    /* TODO:
     *   - Authenticated org owner posts to /api/org/invites.
     *   - Capture invite token from DB (organization_invites table).
     *   - In a fresh browser context, visit the invite link, sign up.
     *   - Assert organization_members row inserted linking new user to org.
     */
  });
});
