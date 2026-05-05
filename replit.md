# EdenRadar

AI-powered biotech asset matchmaking platform that ingests signals from various sources, normalizes them, and generates buyer-facing intelligence outputs (ranked results, dossiers, match reports).

## Run & Operate

- **Run Dev**: `npm run dev`
- **Build**: `npm run build`
- **Typecheck**: `npm run typecheck`
- **Codegen**: `npm run codegen`
- **DB Push**: `npx drizzle-kit push:pg` (for schema changes)

**Environment Variables**:
- `DATABASE_URL`
- `SUPABASE_DATABASE_URL`
- `OPENAI_API_KEY`
- `SESSION_SECRET`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `RESEND_API_KEY`
- `SENTRY_DSN` (optional)
- `VITE_SENTRY_DSN` (optional)
- `STRIPE_SECRET_KEY` (required for Stripe features)
- `STRIPE_WEBHOOK_SECRET` (required for Stripe features)
- `STRIPE_PRICE_INDIVIDUAL`, `STRIPE_PRICE_TEAM5`, `STRIPE_PRICE_TEAM10` (required for Stripe features)
- `STRIPE_PRICE_EDENMARKET` (required for EdenMarket)
- `ADMIN_EMAILS` (for admin access, comma-separated)
- `EDEN_CONFIDENCE_AWARE_RANKING` (feature flag, `"true"` or `"false"`)
- `EDEN_RELEVANCE_CLASSIFIER_V2` (feature flag, `"true"` or `"false"`)
- `EDEN_USER_FEEDBACK_OFFSET` (feature flag)
- `IEDISON_API_KEY` (optional)
- `SCRAPER_PROXY_URL` (for Cloudflare Worker proxy)

## Stack

- **Frontend**: React, Vite, TailwindCSS, Shadcn UI, wouter, TanStack Query
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL (via Drizzle ORM)
- **AI**: OpenAI (gpt-4o-mini, gpt-4o)
- **Authentication**: Supabase Auth
- **Data Sources**: 32 scientific/patent/grant/pre-print sources (e.g., PubMed, ClinicalTrials.gov, USPTO, bioRxiv)
- **TTO Scraping**: cheerio-based custom scrapers for 281 institutions (TechPublisher, Flintbox, WordPress API factories)
- **Build Tool**: Vite

## Where things live

- **Backend Logic**: `server/`
  - Ingestion pipeline: `server/lib/ingestion.ts`
  - Scrapers: `server/lib/scrapers/`
  - Data sources: `server/lib/sources/`
  - Core pipeline logic: `server/lib/pipeline/`
  - API Routes: `server/routes.ts`
  - Database interactions: `server/storage.ts`
- **Frontend Logic**: `client/src/`
  - Pages: `client/src/pages/`
  - Hooks: `client/src/hooks/`
  - Supabase client: `client/src/lib/supabase.ts`
- **Shared Schemas**: `shared/schema.ts` (Drizzle DB schema)
- **Portal Configuration**: `shared/portals.ts`
- **Cloudflare Scraper Proxy Worker**: `server/lib/scrapers/cloudflare-proxy/worker.js`
- **Pitch Deck**: `client/src/pages/PitchDeck.tsx`
- **Stripe Billing Routes**: `server/routes.ts` (sections related to `/api/stripe` and `/api/market`)
- **Email Service**: `server/email.ts`
- **Sentry Integration**: `server/lib/sentry.ts`, `client/src/main.tsx`
- **Relevance Classifier Training Script**: `scripts/train-relevance-classifier.ts`
- **Relevance Trainer**: `server/lib/pipeline/relevanceTrainer.ts`

## Architecture decisions

- **Unified `RawSignal` Type**: All 32 data sources normalize their output into a single `RawSignal[]` type for consistent processing.
- **Pipeline Stages**: A clear, sequential pipeline: collect → pre-filter → normalize (LLM) → content hash → dedup → upsert → AI classify → completeness score → prune → cluster → score (deterministic) → rank.
- **`enrichedAt IS NULL` for Re-enrichment**: This single signal flags assets for deep AI enrichment, resetting on content changes to ensure improved assets are automatically re-processed.
- **Eden AI Deterministic SQL Aggregation**: Eden's `/api/eden/chat` endpoint primarily uses deterministic SQL aggregation for data queries, falling back to RAG only if SQL yields no results, avoiding LLM tool-call parsing.
- **Semantic Near-Duplicate Detection**: Uses `text-embedding-3-small` for semantic embedding and cosine similarity to detect near-duplicates within the same institution, improving data hygiene.
- **Admin Access via Supabase Auth**: Replaced shared password with Supabase email allowlist and `user_metadata.is_admin` flag for secure and auditable admin access.
- **Feedback-Driven Relevance**: Implemented append-only user feedback (save/dismiss/view) and a holdout evaluation set to train and tune a logistic regression classifier, improving search relevance dynamically.

## Product

- **Asset Matchmaking**: AI-powered platform to match biotech assets with buyer needs.
- **TTO Ingestion**: Automated scraping and ingestion of tech transfer office (TTO) data from numerous institutions.
- **Scoring Pipeline**: Normalizes, clusters, scores, and ranks assets based on freshness, novelty, readiness, licensability, fit, and competition.
- **Intelligence Outputs**: Generates ranked results, detailed dossiers, and match reports.
- **Industry Portal**: Features Scout search, Concepts, Research Projects, Institutions, Alerts, Pipelines, an AI-powered Eden chat, and a personalized profile.
- **Researcher Portal**: Tools for creating and managing Discovery Cards, viewing data sources, and managing alerts.
- **Discovery Portal**: A registry for pre-research concepts with AI credibility scoring, enabling submission and interest flagging.
- **EdenMarket**: A confidential biopharma deal marketplace with features for listing assets, submitting Expressions of Interest (EOIs), deal room management (NDA signing, document vault, messaging), and success fee invoicing.
- **Stripe Billing Integration**: Self-serve subscription management for various plans (Individual, Team, EdenMarket) via Stripe Checkout.
- **Error Monitoring**: Integrated Sentry for both server-side and frontend error tracking.

## User preferences

- _Populate as you build_

## Gotchas

- **Stripe Webhook Secret**: Stripe webhooks gracefully skip signature verification if `STRIPE_WEBHOOK_SECRET` is not set, but this should be configured in production for security.
- **Stale Scheduler Sessions**: If a sync session gets stuck (e.g., due to server restart), use `POST /api/ingest/sync/:institution/cancel` to clear it.
- **Admin Default Password**: After bootstrapping admins with `node scripts/bootstrap-admins.mjs`, immediately rotate the default password (`edenadmin1`) in production.
- **Stripe Price IDs**: Ensure `STRIPE_PRICE_EDENMARKET` is set to a *recurring* price ID for the EdenMarket subscription to function correctly.
- **Scraper Proxy**: DOE lab scrapers (ornl, argonne, pnnl) require `SCRAPER_PROXY_URL` to be set, routing requests through a Cloudflare Worker to bypass Replit IP blocks.

## Pointers

- **Drizzle ORM Docs**: [https://orm.drizzle.team/docs/overview](https://orm.drizzle.team/docs/overview)
- **Supabase Docs**: [https://supabase.com/docs](https://supabase.com/docs)
- **TailwindCSS Docs**: [https://tailwindcss.com/docs](https://tailwindcss.com/docs)
- **Shadcn UI Docs**: [https://ui.shadcn.com/docs](https://ui.shadcn.com/docs)
- **OpenAI API Docs**: [https://platform.openai.com/docs](https://platform.openai.com/docs)
- **Stripe Docs**: [https://stripe.com/docs](https://stripe.com/docs)
- **Sentry Docs**: [https://docs.sentry.io/](https://docs.sentry.io/)
- **NIH iEdison API**: [https://iedison.nih.gov/iEdison/api/v1/publicInventions](https://iedison.nih.gov/iEdison/api/v1/publicInventions)