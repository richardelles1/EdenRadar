# EdenRadar

AI-powered biotech asset matchmaking platform that ingests signals from technology transfer offices and other sources, normalizes them, and generates buyer-facing intelligence outputs (ranked results, dossiers, match reports, deal rooms).

## Run & Operate

- **Run Dev**: `npm run dev`
- **Build**: `npm run build`
- **Typecheck**: `npm run typecheck` (use `node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc --noEmit` for large runs)
- **Codegen**: `npm run codegen`
- **DB Push**: `npx drizzle-kit push:pg` (for schema changes — targets `SUPABASE_DATABASE_URL`)
- **Schema migration (safe, non-interactive)**: `node -e "const {Pool}=require('pg');const p=new Pool({connectionString:process.env.SUPABASE_DATABASE_URL});p.query('ALTER TABLE ...').then(()=>p.end())"`

**Environment Variables**:
- `DATABASE_URL` — **NEVER USE. This is a local Replit-managed DB. All data lives in Supabase.**
- `SUPABASE_DATABASE_URL` — **THE real database. Always use this for any direct SQL or migration.**
- `OPENAI_API_KEY`
- `SESSION_SECRET`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `RESEND_API_KEY`
- `SENTRY_DSN` (optional)
- `VITE_SENTRY_DSN` (optional)
- `STRIPE_SECRET_KEY` (required for Stripe features)
- `STRIPE_WEBHOOK_SECRET` (required for Stripe — missing this causes webhook to return 400 and Stripe retries)
- `STRIPE_PRICE_INDIVIDUAL`, `STRIPE_PRICE_TEAM5`, `STRIPE_PRICE_TEAM10` (required for Stripe features)
- `STRIPE_PRICE_EDENMARKET` (required for EdenMarket)
- `ADMIN_EMAILS` (for admin access, comma-separated)
- `IMPERSONATION_HMAC_SECRET` (required for admin impersonation feature)
- `EDEN_CONFIDENCE_AWARE_RANKING` (feature flag, `"true"` or `"false"`)
- `EDEN_RELEVANCE_CLASSIFIER_V2` (feature flag, `"true"` or `"false"`)
- `EDEN_USER_FEEDBACK_OFFSET` (feature flag)
- `IEDISON_API_KEY` (optional)
- `SCRAPER_PROXY_URL` (for Cloudflare Worker proxy — required for DOE lab scrapers)

## Stack

- **Frontend**: React 18, Vite, TailwindCSS, Shadcn UI, wouter, TanStack Query
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL 17 via Drizzle ORM (Supabase, us-west-2)
- **AI**: OpenAI (gpt-4o-mini, gpt-4o)
- **Authentication**: Supabase Auth (JWT) + API key auth + admin impersonation
- **Data Sources**: Scientific/patent/grant/pre-print sources (PubMed, ClinicalTrials.gov, USPTO, bioRxiv, etc.)
- **TTO Scraping**: cheerio-based custom scrapers for ~401 registered institutions (~350+ live)
- **Build Tool**: Vite

## Where things live

- **Backend Logic**: `server/`
  - Ingestion pipeline: `server/lib/ingestion.ts`
  - Scrapers: `server/lib/scrapers/`
  - Data sources: `server/lib/sources/`
  - Core pipeline logic: `server/lib/pipeline/`
  - API Routes: `server/routes/` (directory — one file per domain: `market.ts`, `billing.ts`, `alerts.ts`, `pipeline.ts`, `ingest.ts`, `misc.ts`, `admin_users.ts`, `admin_analytics.ts`, etc.)
  - Database interactions: `server/storage.ts`
  - Auth middleware: `server/lib/supabaseAuth.ts`, `server/lib/apiKeyAuth.ts`
  - Admin impersonation: `server/lib/impersonation.ts`
  - Route helpers (ownership checks): `server/lib/routeHelpers.ts`
  - Email service: `server/email.ts`
  - OneDrive integration: `server/lib/oneDriveClient.ts`
- **Frontend Logic**: `client/src/`
  - Pages: `client/src/pages/`
  - Hooks: `client/src/hooks/`
  - Supabase client: `client/src/lib/supabase.ts`
- **Shared Schemas**: `shared/schema.ts` (Drizzle DB schema — 72 tables)
- **Portal Configuration**: `shared/portals.ts`
- **Cloudflare Scraper Proxy Worker**: `server/lib/scrapers/cloudflare-proxy/worker.js`
- **Stripe Billing Routes**: `server/routes/billing.ts`
- **Sentry Integration**: `server/lib/sentry.ts`, `client/src/main.tsx`
- **Relevance Classifier**: `scripts/train-relevance-classifier.ts`, `server/lib/pipeline/relevanceTrainer.ts`

## Architecture decisions

- **Unified `RawSignal` Type**: All data sources normalize output into a single `RawSignal[]` type for consistent processing.
- **Pipeline Stages**: collect → pre-filter → normalize (LLM) → content hash → dedup → upsert → AI classify → completeness score → prune → cluster → score → rank.
- **`enrichedAt IS NULL` for Re-enrichment**: Flags assets for deep AI enrichment; resets on content change so improved assets are automatically re-processed.
- **Eden AI Deterministic SQL Aggregation**: `/api/eden/chat` primarily uses deterministic SQL aggregation, falling back to RAG only if SQL yields no results.
- **Semantic Near-Duplicate Detection**: `text-embedding-3-small` embeddings + cosine similarity for near-duplicate detection within the same institution.
- **Admin Access via Supabase Auth**: Admin identity derived from `user_metadata.is_admin` flag — no shared password. `verifyBearerAdmin` checks both email allowlist and `is_admin` metadata.
- **Admin Impersonation**: HMAC-signed tokens in `x-impersonation-token` header allow admins to act as any user. Sessions are read-only by default, max 8-hour lifetime, fully audited in `impersonation_audit_events`.
- **Feedback-Driven Relevance**: Append-only user feedback (save/dismiss/view) + holdout evaluation set trains a logistic regression classifier for dynamic relevance improvement.
- **API Keys Product**: External developer API with three tiers (starter/professional/enterprise), six scopes, per-key daily limits, and full usage logging. Keys stored as hashed values only.
- **Stripe Webhook as Source of Truth**: Plan tier is written only on confirmed Stripe webhook events — never on client-initiated upgrade requests. Missing `rawBody` returns 400 so Stripe retries rather than silently dropping events.
- **Smoke Auth Restricted to Test**: The smoke auth bypass (`NODE_ENV === "test"` only) is never active in development or production.

## Product

- **EdenScout**: AI-powered search and discovery across ~350+ TTO institutions. Semantic search, landscape intelligence, asset dossiers, convergence signals, alerts, and pipeline management.
- **EdenLab**: Researcher workspace for managing projects, hypotheses, literature reviews, systematic reviews, grant tracking, and publishing Discovery Cards to industry.
- **EdenMarket**: Confidential biopharma deal marketplace. Listings, EOIs, deal rooms (NDA signing, document vault, messaging, term sheets), observer access for counsel/advisors, success fee invoicing, and deal comparables from SEC 8-K filings.
- **EDEN AI**: Conversational BD intelligence. Deterministic SQL aggregation + RAG fallback. Feedback loop via thumbs up/down on individual messages.
- **Discovery Portal**: Registry for pre-research concepts with AI credibility scoring, interest flagging (collaborate / fund / advise), and escalation workflow.
- **Eden Brief**: Curated biotech intelligence newsletter. Admin-authored issues, subscriber management, and public archive.
- **Developer API**: External REST API with tiered access (starter/professional/enterprise), scoped permissions, and usage analytics.
- **Organizations & Teams**: Multi-seat organizations with owner/admin/member roles, activity feed, weekly recaps, and self-service invite flow.
- **Stripe Billing**: Self-serve subscription management for Individual, Team (5/10 seats), and EdenMarket plans via Stripe Checkout. Full billing event audit log.
- **Admin Panel**: User management, org management, impersonation, JARVIS SQL pad (read-only), scraper health, enrichment jobs, API key management, and entitlement overrides.
- **Error Monitoring**: Sentry for server-side and frontend error tracking.

## Security

See `SECURITY_AUDIT.md` for the full pre-launch security audit (12 HIGH, 18 MEDIUM findings — all Tier 1-3 items remediated). Six low-priority deferred items remain open.

Key security properties:
- All routes behind `requireAdmin`, `verifyAnyAuth`, or `requireNotViewer` as appropriate
- No SQL injection: all queries use Drizzle ORM parameterized bindings
- XSS prevention: `DOMPurify.sanitize()` on `dangerouslySetInnerHTML`, `escapeHtml()` on dynamic email content
- Path traversal prevention: `path.basename()` on all file operations
- CORS blocks no-Origin requests in production

## Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| Engineering guide | `replit.md` | This file — stack, architecture, gotchas |
| Security audit | `SECURITY_AUDIT.md` | Pre-launch audit findings and remediation status |
| Database reference | `DATABASE.md` | Full schema reference, PII register, backup status |
| Data policy | `DATA_POLICY.md` | Retention, deletion, GDPR readiness roadmap |
| Incident response | `docs/incident-response.md` | Incident classification, response steps, breach protocol |
| Stripe runbook | `docs/stripe-webhook-runbook.md` | Stripe webhook incident handling |
| ICP & outreach | `docs/edenradar-icp-and-outreach-brief-v3.md` | Ideal customer profile and outreach strategy |

## User preferences

- **NEVER use `DATABASE_URL` (local Replit DB) — all data is in Supabase (`SUPABASE_DATABASE_URL`).** Always run direct SQL and migrations against `SUPABASE_DATABASE_URL`.

## Gotchas

- **Stale Scheduler Sessions**: If a sync session gets stuck (e.g., due to server restart), use `POST /api/ingest/sync/:institution/cancel` to clear it.
- **Stripe Price IDs**: Ensure `STRIPE_PRICE_EDENMARKET` is set to a *recurring* price ID for the EdenMarket subscription to function correctly.
- **Stripe Webhook Secret**: Missing `STRIPE_WEBHOOK_SECRET` causes the webhook handler to return 400 (Stripe will retry). Configure this in all environments.
- **Scraper Proxy**: DOE lab scrapers (ornl, argonne, pnnl) require `SCRAPER_PROXY_URL` to be set, routing requests through a Cloudflare Worker to bypass Replit IP blocks.
- **TypeScript OOM**: `npx tsc --noEmit` runs out of memory on this codebase. Use `node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc --noEmit` instead.
- **InsertMarketDeal vs raw Drizzle type**: `InsertMarketDeal` (Zod-derived) omits financial fields for user-facing safety. Internal billing code uses `typeof marketDeals.$inferInsert` directly for `updateMarketDeal`.
- **Admin Bootstrap**: After bootstrapping admins with `node scripts/bootstrap-admins.mjs`, immediately rotate the default password in production. Do not commit credentials.
- **`req.path` in mounted middleware**: `req.path` is prefix-stripped in `app.use()` middleware. Use `req.originalUrl` for skip-path checks.
- **Categories JSONB**: `r.categories` arrives as a raw JSON string — always call `toText()` or `JSON.parse()` before substring matching.

## Pointers

- **Drizzle ORM Docs**: https://orm.drizzle.team/docs/overview
- **Supabase Docs**: https://supabase.com/docs
- **TailwindCSS Docs**: https://tailwindcss.com/docs
- **Shadcn UI Docs**: https://ui.shadcn.com/docs
- **OpenAI API Docs**: https://platform.openai.com/docs
- **Stripe Docs**: https://stripe.com/docs
- **Sentry Docs**: https://docs.sentry.io/
- **NIH iEdison API**: https://iedison.nih.gov/iEdison/api/v1/publicInventions
