# EdenRadar — Engineering Context

> This document is for engineers who are new to the codebase — diligence teams, acqui-hire evaluators, or incoming hires. It covers the *why* behind non-obvious decisions, the honest state of each product area, and the things you would otherwise spend a week figuring out. The code explains *what*; this explains *why*.

---

## What This Is

EdenRadar (product name: **EdenScout**) is a biotech intelligence platform for pharma business development teams, acquisition scouts, and strategy groups. It aggregates early-stage drug and technology assets from 400+ university technology transfer offices (TTOs), enriches them with AI-extracted structured fields, and lets subscribers track, filter, and act on them.

The primary revenue driver is **EdenScout** — the asset discovery, search, and pipeline-tracking product. Everything else in this codebase is either infrastructure that serves Scout or a future product that shares the same data layer.

**Parent company:** EdenNX. EdenScout is the first product. EdenMarket and the Research/Lab module are future standalone products under the same umbrella that happen to live in this repo.

**Target buyer:** Pharma and biotech BD teams, acquisition scouts, strategy analysts. Secondary: individual researchers and lab leads who want competitive intelligence in a narrow therapeutic area. The institutional price point is accessible enough that a single-PI lab can subscribe.

**Acquisition thesis:** The scraper network and the dataset. There is no comparable live-updated corpus of early-stage biotech assets aggregated from 400+ TTOs at this level of structured enrichment. The value is threefold: (1) the collection mechanism — scrapers that actually work against real TTO websites, maintained and extended over time; (2) the dataset itself — structured, AI-enriched, deduplicated, continuously updated; (3) the platform that distributes it. An acquirer could take any layer independently — plug in the scraper network as a data feed, consume the enriched dataset as a CSV or API, or acquire the full stack. The clean separation between collection (`lib/scrapers`), enrichment (`lib/pipeline`), and distribution (`routes/`) was intentional with this in mind.

---

## The Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS, Radix UI |
| Backend | Node.js + TypeScript, Express 5 |
| Database | PostgreSQL via Supabase (managed), pgvector for embeddings |
| ORM | Drizzle ORM + Drizzle Kit for schema migrations |
| Auth | Supabase Auth (JWT) — see Auth section below |
| AI/LLM | OpenAI gpt-4o-mini (enrichment) + gpt-4o (deep enrichment) |
| Email | Resend |
| Billing | Stripe |
| Error tracking | Sentry |
| Logging | Pino (structured JSON in prod, pretty-print in dev) |
| Scraping | Playwright (JS-rendered sites) + Cheerio (static HTML) |
| Hosting | Replit (single environment — see Deployment section) |

---

## Deployment — The Real Story

**Replit is the only environment.** There is no separate staging environment. The domain `[custom domain]` points at a Replit deployment. Supabase is the database for both development and production — there is one Supabase project.

**What happens on deploy:** A new build fully restarts the Node process. This means:
- The **scheduler** (institution scraping queue) stops and must be manually restarted from the admin panel
- Any running **enrichment jobs** are terminated and must be restarted
- The scheduler saves its queue position to the database before shutdown (graceful SIGTERM handler), so it resumes at the right institution — but it does not auto-start

**Practical consequence for an incoming team:** Before this codebase moves to a proper deployment pipeline (e.g., Railway, Fly.io, or AWS), deploys require an operator to check the admin panel and restart the scheduler after every release. This is a known operational gap.

**`SCRAPER_PROXY_URL` (Cloudflare worker):** This env var references a Cloudflare Worker that was explored as a way to route scraper requests through a non-Replit IP (some institutions block cloud provider IP ranges). It did not resolve the blocking problem and is not in active use. The env var exists, the code reads it, but passing proxy requests through it has no effect on the institutions we care about. Consider this infrastructure dead weight until there is a concrete need.

---

## How the Codebase Is Organized

The server was originally a single `routes.ts` file. It was refactored into domain modules, each registered in `server/routes.ts`:

```
server/
  index.ts          — app bootstrap, middleware, startup jobs
  routes.ts         — route registration hub (imports all domain modules)
  storage.ts        — database abstraction layer (all Drizzle queries live here)
  db.ts             — pg pool + Drizzle instance

  routes/           — one file per product domain
    search.ts       — asset search (public + authenticated)
    pipeline.ts     — saved assets, watchlists, notes
    alerts.ts       — saved searches + email digest triggers
    eden.ts         — conversational RAG search (Eden chat)
    auth.ts         — Supabase auth flows, org/team management
    market.ts       — EdenMarket deal platform
    research.ts     — Research/Lab module
    billing.ts      — Stripe checkout + webhooks
    institutions.ts — institution metadata API
    ingest.ts       — scraper triggers (admin-only)
    admin*.ts       — 14 admin sub-modules (enrichment, analytics, users, etc.)

  lib/
    scheduler.ts    — institution scraping queue orchestrator
    ingestion.ts    — full scrape → staging → enrich → index pipeline
    scrapers/       — ~400 institution scraper implementations
    sources/        — external API integrations (ClinicalTrials, USPTO, Lens, etc.)
    pipeline/       — LLM enrichment pipeline (20 modules)
    eden/rag.ts     — conversational search engine
    supabaseAuth.ts — all auth middleware
    logger.ts       — pino instance + production console bridge

shared/
  schema.ts         — Drizzle schema (50+ tables, source of truth for all types)
```

`storage.ts` is the single database abstraction layer. All Drizzle queries go through it. Route files call `storage.*` — they do not write SQL directly except in a handful of admin analytics endpoints where dynamic queries are necessary (and those are admin-only).

---

## Key Design Decisions

### The three-tier user role system

There are three distinct Supabase user roles: `industry`, `researcher`, and `concept`. This was a deliberate product architecture decision, not a technical one.

The original vision was a **pipeline escalator**: a researcher submits a concept card (concept role) → develops it into a structured research project (researcher role) → the platform circulates mature assets to paying discovery customers (industry role). The idea was to source deal flow from within the platform.

The concept and researcher tiers are now free. The industry tier (EdenScout) is the paid product. The roles remain separate because they have meaningfully different UX flows, data models, and auth requirements — researchers need file upload and project collaboration, industry users need pipeline tracking and market access.

**The legacy `users` table** (Postgres, local passwords, Passport.js) is orphaned. It predates the Supabase Auth integration and nothing in the current codebase actively uses it for authentication. It exists in the schema for historical continuity. An incoming team can consider it dead code.

### The two-step ingestion pipeline (staging → production)

Scraped assets do not go directly into `ingested_assets`. They land in `sync_staging` first. The admin panel has a sync review interface where an operator can inspect what the scraper found before pushing it to the live index.

This was built when the scrapers were less reliable and operator confidence in the data quality was low. It remains useful as an audit layer — you can see exactly what a scraper returned for a given run before it affects users. But in practice, pushes are rarely blocked; most syncs are pushed automatically or semi-automatically. An incoming team should understand this is a quality gate that could be fully automated if confidence is high.

### The enrichment pipeline cost architecture

The most important thing to understand about the AI pipeline is that it is **deliberately tiered by cost**. Every asset goes through the cheapest model that can do the job. Expensive models are reserved for assets that have earned them.

```
Path 1 — Pre-filter (gpt-4o-mini, ~$0.00002/asset)
  Raw scraper output → yes/no biotech relevance gate → discard noise before DB write

Path 2 — Classification (gpt-4o-mini, ~$0.00005/asset)
  New assets → extract target, modality, indication, stage, completeness score

Path 3 — Re-enrichment (gpt-4o-mini, ~$0.00005/asset)
  Assets with unknown fields → fill gaps without touching already-enriched fields

Path 4 — Deep enrichment (gpt-4o, ~$0.01/asset)
  High-value assets → MoA, innovation claim, unmet need, comparable drugs,
  licensing readiness, IP type. At most 2 lifetime calls per asset.
  Re-triggered only if content changes substantially.
```

Path 4 is manually triggered by an admin. The `deepEnrichAttempts` counter prevents runaway costs — an asset exits the eligible pool after two deep enrichment passes.

### The factory scraper pattern (`new-institutions.ts`)

`server/lib/scrapers/new-institutions.ts` is a large file that registers hundreds of institutions that share the same CMS platforms (primarily Flintbox and TechPublisher). This was an intentional decision: those platforms follow identical URL and DOM patterns, so a single factory function can handle all of them. Adding a new Flintbox institution is a one-liner — drop in the institution name and URL slug.

The file is large by necessity, not by accident. An incoming team should not attempt to split it into per-institution files — that would create hundreds of trivial files with no benefit. The right refactor, if one is needed, is to move the institution list to a database table so new sources can be added without a code deployment.

### The scraper tier system

Scrapers are classified T1–T4 by technique:
- **T1** — Direct API or RSS (fast, reliable, no browser needed)
- **T2** — Platform factory (Flintbox, TechPublisher — template-driven)
- **T3** — Custom HTML parsing (Cheerio — institution-specific DOM)
- **T4** — Playwright (JavaScript-rendered sites, slowest, highest memory cost)

The scheduler runs T1 scrapers first and T4 last. Concurrency is capped lower for T4 to avoid memory pressure. When adding a new institution, default to the lowest tier that works — avoid Playwright unless the site actually requires it.

---

## Data Model Orientation

The full schema is in `shared/schema.ts`. A few tables warrant specific explanation:

**`ingestedAssets`** — the central table. Every drug/technology asset from every institution lives here. The `fingerprint` column is the deduplication key (hash of institution + title). The `relevant` boolean is a first-class filter — every query that surfaces assets to users should include `WHERE relevant = true`. Querying without this filter includes noise that was scraped but filtered as non-biotech.

**`syncStaging`** — the holding area for freshly scraped assets pending operator review. Do not read this table for user-facing features. It is an admin-only buffer.

**`organizations` + `orgMembers`** — the team billing container. An org has a plan tier, seat limit, and Stripe subscription. Users belong to an org through `orgMembers` with roles (owner, admin, member, viewer). Most entitlement checks go through the org, not the individual user.

**`savedAssets` + `pipelineLists`** — the user's watchlist. `savedAssets` has a status field (watching → evaluating → in_discussion → on_hold → passed) that models a lightweight deal pipeline. `pipelineLists` are named collections (e.g. "Q3 Targets").

**`userAlerts`** — saved search subscriptions. Each alert has filter criteria and a `lastAlertSentAt` timestamp. The alert mailer runs on a configurable interval and dispatches digests based on assets newer than the last send.

---

## Product Areas: Honest State Assessment

### EdenScout — Mature, active, revenue-generating
The asset discovery, search, pipeline tracking, and alert system. This is what customers pay for. The enrichment pipeline, scraper network, and admin tooling all serve this product. It is the most complete and most tested part of the codebase.

### Eden (RAG chat) — Mature, integrated into Scout
The conversational search interface in `server/lib/eden/rag.ts`. Vector retrieval + rules + live source augmentation (clinical trials, patents, preprints). Session state is managed per conversation. This is production-facing and in active use.

### EdenMarket — Built, not launched
A full B2B deal marketplace with listings, expressions of interest, deal rooms, NDA workflows, and seller verification. It is architecturally complete. It was built opportunistically during a period of free compute credits to get the infrastructure in place.

**No real assets are listed.** No commercial conversations have started around it. Treat it as a future product — the code is real and works, but the GTM has not begun. It is likely to be positioned as a separate product under EdenNX rather than a feature of EdenScout.

### Research / Lab module — Built, not central to revenue
An 11-section structured research project tool with hypothesis tracking, evidence synthesis, literature review, and protocol registration. Also includes Discovery Cards (pre-formatted tech transfer summaries) and Concept Cards (early-stage innovation submissions).

These are free tiers of the platform. They may become a separate EdenNX product (potentially EdenLab). They are not the current revenue driver and do not need to be prioritized in diligence.

### MCP Server — Built, pre-launch
An API layer implementing the Model Context Protocol so AI agents can query the EdenScout dataset programmatically. Tier-gated by API key (free → starter → professional → enterprise). Built pre-launch to demonstrate API-readiness and as a cost-control mechanism — external API consumers use their own tokens.

No customers are actively using it yet. It is infrastructure proof-of-concept.

### Convergence Signals — Infrastructure of unclear provenance
The `convergenceSignals` table and associated intelligence endpoints exist in the codebase. The exact purpose and original design intent are not fully documented. The infrastructure works but it is not wired to a user-facing feature in the current UI. Treat as exploratory infrastructure until a product decision is made about it.

---

## Known Technical Debt

**Operational:** Deploys require manual scheduler restart. There is no auto-resume on startup (the scheduler saves state but does not auto-start). The first thing to fix before handing this to an ops team is adding a `START_SCHEDULER_ON_BOOT=true` env flag.

**Dead code:** The `users` table, Passport.js local auth strategy, and associated legacy auth flows are orphaned. They can be removed without affecting any active user path.

**Dead infrastructure:** `SCRAPER_PROXY_URL` / Cloudflare worker integration is wired but non-functional. The env var can be removed from the runtime config.

**Dossier (asset detail page):** This is the highest-traffic user-facing surface and it is in a state of constant iteration. The data quality of individual assets varies — some are deeply enriched with MoA, comparable drugs, and licensing readiness; others have only basic fields. This is a content quality issue, not a code quality issue, and it improves as the enrichment pipeline runs.

**No staging environment:** All development and testing runs against the production Supabase instance. This is workable for a solo operator but becomes a risk once a team is involved. Creating a Supabase branch or a separate project for development should be an early infrastructure task for an incoming team.

---

## What to Read First

If you are a new engineer orienting to this codebase, read in this order:

1. **`shared/schema.ts`** — the full data model. Everything else refers to these types.
2. **`server/lib/supabaseAuth.ts`** — the auth middleware. Understand `verifyAnyAuth`, `requireAdmin`, and `tryGetUserId` before touching any route.
3. **`server/storage.ts`** — the database abstraction. This is where all queries live.
4. **`server/lib/ingestion.ts`** — the scrape → enrich → index pipeline. The heart of the data operation.
5. **`server/routes/search.ts`** — the primary user-facing API surface.
6. **`server/lib/scheduler.ts`** — the background orchestrator. Understand this before touching anything that affects scraper timing.

The admin panel (`/admin` in the UI) is the operational dashboard. Spend 30 minutes in it before reading any admin route code — it makes the code much more legible.

---

## Process Notes for an Incoming Team

- **Adding a new scraper institution:** Implement `InstitutionScraper` interface, register in `server/lib/scrapers/index.ts`. If it uses Flintbox or TechPublisher, add a one-liner to the factory block in `new-institutions.ts`. Default new scrapers to T3; only escalate to T4 if the site requires JavaScript rendering.

- **Adding a new enrichment field:** Add the column to `shared/schema.ts`, create a migration, update the relevant extraction prompt in `server/lib/pipeline/`, and add a fill rule in `normalizeSignals.ts`. The `completenessScore` calculation in `contentHash.ts` may also need updating.

- **Deploying:** Push to the branch, merge to main, trigger build in Replit. After deploy: navigate to admin panel → Scheduler → Start. Check enrichment job status if any were running before deploy.

- **Environment variables:** All required variables are documented in `.env.example`. The minimum set to run locally is: `SUPABASE_DATABASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `RESEND_API_KEY`, and `ADMIN_EMAILS`.

---

*This document is maintained by Claude (AI pair programmer) and updated at the end of sessions where architectural decisions change. If you find something that is out of date, the canonical source of truth is always the code.*
