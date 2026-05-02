# EdenRadar v2

AI-powered biotech asset matchmaking platform for internal use. Ingests signals from multiple sources, normalizes them through a scoring pipeline, and generates buyer-facing intelligence outputs (ranked results, dossiers, match reports). Includes a real TTO ingestion pipeline with **281 scrapers** across US universities, international institutions, government labs, pediatric/cancer centers, and DOE national labs (proxy-routed).

## Architecture

### Stack
- **Frontend**: React + Vite + TailwindCSS + Shadcn UI (wouter routing, TanStack Query)
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **AI**: gpt-4o-mini for bulk signal extraction & TTO enrichment; gpt-4o for report/dossier narrative generation (uses `OPENAI_API_KEY`)
- **Data Sources**: PubMed, bioRxiv, medRxiv, ClinicalTrials.gov, USPTO Patents, University Tech Transfer, NIH Reporter, OpenAlex, Semantic Scholar, arXiv, NSF Awards, EU CORDIS, Lens.org, Europe PMC, Zenodo, EU Clinical Trials, ISRCTN, GEO, PDB, Grants.gov, BASE, CORE, IEEE Xplore, ERIC, ChemRxiv, SocArXiv, PsyArXiv, EarthArXiv, engrXiv, DOAJ, OpenAIRE, HAL (32 total)
- **TTO Scraping**: cheerio-based real scrapers for 138 institutions with active TechPublisher/custom/in-part/Flintbox/WordPress scrapers; 67 additional institutions stubbed (no public TTO listing portal or non-TechPublisher sites needing custom scrapers); daily cron at 8AM; manual Refresh button
- **in-part.com factory**: `createInPartScraper(subdomain, institution)` in new-institutions.ts — direct API calls to `https://app.in-part.com/api/v3/public/opportunities?portalSubdomain=X&page=N&limit=24` (no Playwright needed). SSR `__NEXT_DATA__` fallback if API empty. 30+ in-part scrapers active (Batch E added imperial, birmingham, sheffield, exeter, cardiff, dundee, warwick, mcgill, waterloo, mcmaster, ucalgary). Records per-institution counts to `scan_institution_counts` table.
- **Egress proxy**: `fetchHtmlViaProxy(url)` in utils.ts routes requests through Cloudflare Worker when `SCRAPER_PROXY_URL` env secret is set; falls back to direct fetch otherwise. Used by ornlScraper, argonneScraper, pnnlScraper for DOE labs blocked from Replit's egress IPs. Worker script: `server/lib/scrapers/cloudflare-proxy/worker.js` (deploy with `wrangler deploy`, then set SCRAPER_PROXY_URL secret).
- **WordPress API factory**: `createWordPressApiScraper(baseUrl, postType, institution)` — paginates `/wp-json/wp/v2/{postType}?per_page=100&page=N`. Used by ASU/Skysong (~1,317 technologies).
- **TechPublisher v3**: Sitemap-based category discovery (sitemap.xml → all category URLs → fetch per category page); individual page fetching for uncovered tech URLs from sitemap; achieves ~99% coverage (72/73 for Lehigh vs. 10 previously). Falls back to RSS when no sitemap.
- **Flintbox scraper factory**: `server/lib/scrapers/flintbox.ts` — uses confirmed working API: `GET /api/v1/technologies?organizationId={id}&organizationAccessKey={key}&per_page=500` with `X-Requested-With: XMLHttpRequest` header; response is JSON:API format (`data[].attributes.name`); Georgetown returns 111, Cornell returns 1,114 assets
- **UMich unblocked**: Removed from BLOCKED_SLUGS; now uses Flintbox scraper (umich.flintbox.com, org 12)
- **Georgia Tech added**: New institution entry (gatech.flintbox.com, org 186) with dedicated Flintbox scraper

### Authentication (Task #25 — Supabase Auth)
**Site Gate**: Password "quality" unlocks the site (localStorage `eden-access`). Full-screen prompt before landing page.

**Supabase Auth**: Email/password auth via `@supabase/supabase-js`. User role stored in `user_metadata.role` ("industry" | "researcher" | "concept").
- Supabase project: `tqaitpaajbogrcoyzsgx`
- Frontend client: `client/src/lib/supabase.ts`
- Auth context: `client/src/hooks/use-auth.tsx` — `AuthProvider` wraps entire app, `useAuth()` hook
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

**Test Accounts**:
- `concept@test.com` / `Quality2025!` → role: concept
- `industry@test.com` / `Quality2025!` → role: industry
- `research@test.com` / `Quality2025!` → role: researcher

**Industry Portal**:
- `DashboardLayout` checks Supabase session + role='industry'; redirects to /login if unauthenticated, to /research if wrong role
- **IndustrySidebar** (emerald-400 accent): replaces old Sidebar.tsx for all industry routes; logo with Radar icon, 8 nav items: Scout, Concepts, Research Projects, Institutions, Alerts, Pipelines, Eden, Profile; company name avatar with initials in footer
- **Industry Profile** (`/industry/profile`): localStorage key `eden-industry-profile`; fields: company name, company type, therapeutic focus areas (tag input), modalities of interest (tag input), preferred deal stages (toggle pills); saves to localStorage for Eden/Scout personalization. **Server persistence (Task #237)**: `industry_profiles` table (Postgres); `GET/PUT /api/industry/profile` (verifyAnyAuth middleware, `x-user-id` header from JWT); `useIndustrySyncOnMount()` hook called in DashboardLayout hydrates localStorage from server on first load; `saveIndustryProfile()` triggers `syncIndustryProfileToServer()` async fire-and-forget on every save. **Notifications section (Task #388)**: toggle + frequency selector (daily/weekly) for asset-match email alerts; `subscribedToDigest` + `lastAlertSentAt` + `alertLastAssetId` columns on `industry_profiles`; `PATCH /api/users/subscribe` sets both Supabase user_metadata and DB column; `PATCH /api/users/notification-prefs` sets `notificationPrefs.frequency`; "Last sent: X ago" shown when applicable
- **Concepts tab** (`/industry/concepts`): fetches `GET /api/discovery/concepts` (active concept cards from Discovery portal); card grid with therapeutic area + stage badges, credibility score, seeking tags, submitter affiliation; filters: text search, therapeutic area, stage; links to `/discovery/concept/:id`
- **Research Projects tab** (`/industry/projects`): fetches `GET /api/industry/projects` (research projects with `publishToIndustry=true`); card grid with status/area badges, open-for-collab badge, keywords, seeking; filters: text search, research area, status, collaboration
- **Alerts revamp** (`/alerts`): 3-bucket layout — TTO Assets (from `firstSeenAt` 48h window), New Concepts, New Research Projects; summary sidebar card with per-bucket counts + total; collapsible sections; Create Alert sheet preserved; source: `GET /api/industry/alerts/delta`
- **Eden AI tab** (`/industry/eden`): Full redesign (Task #140) — EDEN acronym staggered intro animation (once per session until first message sent), 6-card 2×3 prompt grid (grid-cols-1 sm:grid-cols-2 lg:grid-cols-3), industry profile context injection via `getIndustryProfile()` → `EdenUserContext` → backend system prompt augmentation, rule-based contextual follow-up pills after every response, session history sidebar, citation cards with PipelinePicker. **Architecture decision**: Eden uses a deterministic SQL aggregation pipeline (not LLM tool-call JSON parsing). `/api/eden/chat` has a 3-path decision tree: (1) `isConversational()` → `directQuery()`, (2) `isAggregationQuery()` → `resolveAggregationQuery()` [direct Drizzle SQL] → `aggregationQuery()` [conversational formatting], falls back to RAG if SQL returns null, (3) RAG path — `embedQuery` + `semanticSearch` → `ragQuery()`. Five data-query routes also available under `/api/eden/query/*`.
- **Scout filter cleanup**: replaced multi-row pill SourceSelector + showControls selects with a single "Filters" button (with active count badge) that opens a right Sheet containing all filters (sources, score, sort, date, stage, modality, institution) + reset-all button; active filter badges shown inline below search bar for quick removal
- Routes: /scout, /assets, /reports, /alerts, /institutions, /sources, /industry/concepts, /industry/projects, /industry/profile, /industry/eden
- **Backend routes added**: `GET /api/industry/projects` (publishToIndustry=true research projects), `GET /api/industry/alerts/delta` (3-bucket 48h alert delta)

**Researcher Portal**:
- `ResearchLayout` checks Supabase session + role='researcher'; redirects to /login if unauthenticated, to /scout if wrong role
- Researcher identity: Supabase `user.id` (UUID) — passed as `x-researcher-id` header
- Researcher profile: localStorage `eden-researcher-profile` = JSON with fields: name, institution, lab, researchAreas, careerStage, institutionType, alertTopics, secondaryInterests
- Routes: /research, /research/create-discovery, /research/my-discoveries, /research/data-sources, /research/profile, /research/alerts
- Industry Bridge: Published discovery cards appear in GET /api/discoveries (public endpoint) — surfaced in industry Scout with "Lab Published" amber badge
- Discovery Cards: schema has `archived` (boolean) and `attachmentUrls` (jsonb string[]) columns; archive toggle via PATCH `/api/research/discoveries/:id/archive`; file uploads via POST `/api/research/discoveries/:id/files` (max 3 files, 10MB each, server-side MIME validation, Supabase Storage bucket `research-discoveries`)
- My Discoveries: tab strip (Active / Archived / All), archive/restore action on each card, attachment links display
- Create Discovery: file attachment zone (drag-to-click, up to 3 files with PDF/DOCX/PPTX/XLSX/PNG/JPG), uploads after card creation with error reporting
- Alerts: 3 collapsible sections — Breaking Research (PubMed/bioRxiv/arXiv), Grant Opportunities (NIH Reporter/NSF/Grants.gov), Discovery Updates (researcher's own cards with status timeline)
- Profile: extended with careerStage, institutionType, alertTopics (override for alerts), secondaryInterests; dashboard subtitle shows institution + lab + careerStage
- Research Tools (§12 in ProjectDetail): Three sub-tabs inside each project — Hypothesis Builder (CRUD with status/confidence badges, expandable cards), Fishbone Diagram (Ishikawa 6-branch cause-and-effect, clipboard Markdown export), Visual Timeline (milestones with horizontal CSS timeline, today marker, color-coded status: green=completed, amber=overdue, grey=upcoming). All tools use local state with explicit save buttons (no per-keystroke PATCH). Schema columns: `hypotheses` (jsonb), `fishbone` (jsonb), `milestones` (jsonb) on `researchProjects`.

**Eden Discovery Portal (Tier 1 — Amber Branding)**:
- `DiscoveryLayout` checks Supabase session + role='concept'; redirects to /login if unauthenticated, to correct portal if wrong role
- Routes: /discovery (concept feed), /discovery/submit (submit concept), /discovery/concept/:id (detail page)
- `conceptCards` table: pre-research concept registry with AI credibility scoring (0-100) via gpt-4o-mini
- API: GET /api/discovery/concepts (public feed), GET /api/discovery/concepts/:id, POST /api/discovery/concepts (concept auth), PATCH /api/discovery/concepts/:id/interest (any auth)
- Auth middleware: `verifyConceptAuth` (concept role only), `verifyAnyAuth` (any authenticated user)

**Login Page** (`/login`): Sign In / Sign Up tabs; sign-up includes role selector (Industry / Researcher / Concept).
**Landing Page** (`/`): Three portal CTAs; auto-redirects to portal if already authenticated. Portal toggle shows Industry / Research / Discovery tabs.
**Pitch Deck** (`/pitch`): 10-slide branded presentation (no auth, bypasses SiteGate). Dark background, scroll-snap, floating dot nav, Export PDF button. Print CSS produces one slide per page with forced dark colors. `?print` param hides nav for clean layout. File: `client/src/pages/PitchDeck.tsx`.
**Sign Out**: All sidebars have "Sign Out" button → clears Supabase session → redirects to /login.
**Admin**: `eden-admin-pw` localStorage gate (password: "eden"). Tabs: Data Health, Enrichment, Pipeline Review, Research Queue, Concept Queue, Account Center.
- **Account Center** (Task #72): User management via Supabase Admin API (`SUPABASE_SERVICE_ROLE_KEY`). List all users, assign portal roles via inline dropdown, invite new users (email + password + role). Portal Directory cards with user counts and copy-to-clipboard invite links (`/register?portal=<role>` — placeholder, not yet built). Uses shared `PORTAL_CONFIG` from `shared/portals.ts` for scalable role→portal mapping.
- **Portal Config**: `shared/portals.ts` — single source of truth mapping `PortalRole` ("industry"|"researcher"|"concept") to label, tier, color, badgeClass, description, registerPath. Adding a new portal only requires one new entry here.

### Discovery Cards (Ecosystem Bridge)
- Researchers create Discovery Cards via `POST /api/research/discoveries`
- Publishing via `PATCH /api/research/discoveries/:id/publish` makes card visible industry-side
- All published cards in `GET /api/discoveries` (no auth needed)
- In industry Scout search results, cards with `source_types` including "researcher" get amber "Lab Published · Researcher Discovery" banner

### Key Design Decisions
- **Unified `RawSignal` type**: All 8 data sources convert their output to `RawSignal[]`
- **Pipeline architecture**: collect → normalize (LLM) → cluster → score (deterministic) → rank
- **Scoring weights**: freshness×0.15 + novelty×0.20 + readiness×0.15 + licensability×0.25 + fit×0.15 + competition×0.10
- **Tech Transfer (live)**: Real cheerio scrapers per institution. Ingested to `ingested_assets` DB table.
- **Ingestion pipeline**: `runIngestionPipeline()` scrapes all TTOs with concurrency=5, pre-filters (relevance), computes content hashes, upserts to DB with content change detection (`lastContentChangeAt`), classifies new assets via AI (`classifyBatch`), computes completeness scores, and removes non-biotech-relevant assets
- **Pipeline stages**: collect → pre-filter (keyword heuristic) → normalize (patent/licensing status) → content hash → dedup → upsert → AI classify (12-field) → completeness score → prune non-relevant
- **Content change detection**: `bulkUpsertIngestedAssets` compares incoming `contentHash` with stored hash; when different, updates `lastContentChangeAt` + summary/abstract and resets `enrichedAt = null` to re-queue the asset for deep enrichment
- **Re-enrichment contract**: `enrichedAt IS NULL` is the single signal used to select assets for deep enrichment (replaces any separate `needs_enrichment` flag). It is reset to null on content change so improved assets are automatically re-enriched next cycle. `getAssetsNeedingDeepEnrich` and `getAssetsNeedingDeepEnrichCount` both filter on `enrichedAt IS NULL`.
- **Semantic dedup pipeline**: `runNearDuplicateDetection` embeds all non-flagged assets via `text-embedding-3-small`, groups by `institution + indication`, and flags pairs with cosine similarity >= 0.92 as duplicates. Scoped to same-institution pairs only (no cross-institution flagging). Admin "Potential Duplicates" panel provides manual review + dismiss. Dismissed pairs retain `duplicateOfId` as a suppression marker to prevent re-flagging on subsequent scans. Dedup embeddings are cleared on deep enrichment writes (target/indication change triggers re-embedding on next scan).
- **URL dedup + unique index**: `bulkUpsertIngestedAssets` updates existing rows by `source_url` instead of inserting duplicates. Startup migration reconciles any pre-existing URL duplicates (canonical = highest completeness score, lowest ID as tie-breaker; non-canonical rows have URL cleared), then creates a partial unique index on `source_url IS NOT NULL`.
- **Review Queue**: Ambiguous assets flagged by pre-filter are stored in `reviewQueue` table for manual admin review
- **Taxonomy pipeline**: `refreshTaxonomyCounts()` builds therapy area taxonomy from asset categories; `detectConvergenceSignals()` identifies multi-institution convergence on targets/mechanisms
- **Per-institution sync**: `runInstitutionSync(institution)` — single-institution scrape → fingerprint compare → AI enrich → staging table. Two-step push: preview results then explicit "Push to Index". Zero guard blocks push if rawCount=0. Soft warning if rawCount < 50% of currentIndexed. Mutual exclusion with full ingestion.
- **Sequential Scheduler**: `server/lib/scheduler.ts` — round-robin scheduler syncs one institution at a time with 5s delay between. Start/pause controls. Replaces bulk scan as primary mechanism. Routes: GET `/api/ingest/scheduler/status`, POST `/api/ingest/scheduler/start`, POST `/api/ingest/scheduler/pause`
- **Stale session cancel**: POST `/api/ingest/sync/:institution/cancel` — clears running sessions stuck > 10min (from server restart losing in-memory lock)
- **Collector Health**: Derived from `syncSessions` table (latest per institution), not bulk `scanInstitutionCounts`. Shows: totalInDb, biotechRelevant, health status (ok/degraded/failing/stale/syncing/never), error messages.
- **Daily cron**: `node-cron` at 8:00 AM runs ingestion automatically

### Folder Structure
```
server/
  lib/
    ingestion.ts          # runIngestionPipeline() + runInstitutionSync() — full & per-institution sync
    scrapers/
      types.ts            # ScrapedListing, InstitutionScraper interfaces
      utils.ts            # fetchHtml (cheerio), cleanText, resolveUrl helpers
      index.ts            # runAllScrapers() with concurrency=5
      stanford.ts         # Stanford TechFinder scraper
      mit.ts              # MIT TLO scraper
      harvard.ts          # Harvard OTD scraper
      ucsf.ts             # UCSF Innovation Ventures scraper
      jhu.ts              # Johns Hopkins Ventures scraper
      duke.ts             # Duke OLV scraper
      columbia.ts         # Columbia TechVentures scraper
      upenn.ts            # Penn PCI scraper
      northwestern.ts     # Northwestern TTO scraper — Algolia API (761 hits)
      cornell.ts          # Cornell CTL (no static listing — graceful no-op)
      ucberkeley.ts       # UC Berkeley — sitemap-driven NCD page scraper (3,770 tech pages → 1,678 assets)
      uwashington.ts      # UW CoMotion stub (no public listing page)
      wustl.ts            # WashU OTM scraper — /basic-tech-summary-search/ (668 listings)
      umich.ts            # UMich TechTransfer scraper
      mayo.ts             # Mayo Clinic Ventures scraper
      scripps.ts          # Scripps TTVD scraper
      salk.ts             # Salk Institute scraper
      mdanderson.ts       # MD Anderson TTO scraper
      upitt.ts            # Pitt Innovation scraper
      uchicago.ts         # UChicago Polsky Center scraper
      yale.ts             # Yale — Drupal node ID → cheerio scraper (25 pages, 248 assets)
      purdue.ts           # Purdue RF — REST API (licensing.prf.org/client/products/search, 1,601 assets)
      new-institutions.ts # TechPublisher factory (43 verified) + stubs for ~100 institutions without TechPublisher portals
      vanderbilt.ts       # Vanderbilt CTT scraper
      emory.ts            # Emory OTT scraper
      bu.ts               # BU OTD scraper
      georgetown.ts       # Georgetown OTL scraper
      utexas.ts           # UT Texas OTC scraper — utotc.technologypublisher.com (pagination broken, 10 results)
      cwru.ts             # CWRU TTO scraper
      ucolorado.ts        # CU Innovations scraper
    sources/
      index.ts            # collectAllSignals() fan-out + DataSource registry (37 sources)
      pubmed.ts, biorxiv.ts, medrxiv.ts, clinicaltrials.ts, patents.ts, techtransfer/
      base_search.ts, core.ts, ieee.ts, eric.ts, osf_preprints.ts, doaj.ts, openaire.ts, hal.ts
      harvard_dataverse.ts, figshare.ts, dryad.ts, biostudies.ts
    pipeline/
      normalizeSignals.ts, clusterAssets.ts, scoreAssets.ts, generateReport.ts, generateDossier.ts
      relevancePreFilter.ts  # keyword-based biotech relevance pre-filter
      classifyAsset.ts       # 12-field AI classifier (gpt-4o-mini) for new assets
      contentHash.ts         # SHA-256 content hash, completeness score, patent/licensing normalizers
      taxonomyPipeline.ts    # therapy area taxonomy + convergence signal detection
  routes.ts               # All API routes
  storage.ts              # DatabaseStorage implementing IStorage

client/src/
  pages/
    Landing.tsx           # / — Enter Portal CTA
    Scout.tsx             # /scout — search + ScanStatusBar + Refresh button
    Assets.tsx            # /assets — saved pipeline (kanban)
    Institutions.tsx      # /institutions — 28 TTO cards with live counts
    InstitutionDetail.tsx # /institutions/:slug — real ingested listings
    Admin.tsx             # /admin — admin control panel with password gate and scan tracking
    Reports.tsx           # /reports — mock report cards
    Alerts.tsx            # /alerts — mock alerts + Create Alert drawer
    AssetDossier.tsx      # /asset/:id — dossier view with pipeline intelligence panel
    Report.tsx            # /report — buyer intelligence report

shared/schema.ts          # Drizzle: users, searchHistory, savedAssets, ingestionRuns, ingestedAssets, scanInstitutionCounts, organizations, orgMembers
```

### Pages
- **`/`** — Landing with EdenSVG botanical icon, Enter Portal CTA
- **`/scout`** — Multi-source search with scan status banner, buyer thesis, source toggles, scored asset grid
- **`/assets`** — Saved pipeline kanban by clinical stage
- **`/institutions`** — 195 TTO cards with live listing counts from DB
- **`/institutions/:slug`** — Ingested listings with sort (Newest First / Best Commercial / A-Z / Z-A), search filter, modality/stage tags via title-signal parser, commercial score badge, expandable detail panel per asset
- **`/alerts`** — Real delta data from last ingestion run (new assets per institution), Create Alert sheet
- **`/admin`** — Admin control panel (password: "eden") with Data Health, Enrichment, Pipeline Review (review queue + wipe/re-collect), Research Queue, Organizations (org + member CRUD) tabs
- **`/reports`** — Mock report cards
- **`/asset/:id`** — Full dossier with score breakdown + pipeline intelligence (enriched fields, competing assets, supporting literature)
- **`/report`** — Buyer intelligence report

### API Routes
- `GET /api/sources` — list available source modules
- `POST /api/search` — full pipeline search → `ScoredAsset[]`
- `POST /api/report` — GPT-4o market report
- `POST /api/dossier` — GPT-4o dossier brief
- `GET /api/assets/:fingerprint/intelligence` — Pipeline intelligence: enriched fields, competing assets (same target/indication), PubMed+bioRxiv literature
- `GET/POST /api/saved-assets` — saved asset CRUD
- `DELETE /api/saved-assets/:id`
- `GET /api/search-history`
- `GET /api/admin/scan-matrix?pw=eden` — per-institution counts for last N completed runs (password protected)
- `POST /api/ingest/run` — trigger TTO scrape pipeline (async, non-blocking)
- `GET /api/ingest/status` — last run status (never_run | running | completed | failed)
- `GET /api/institutions/counts` — `Record<string, number>` count per institution
- `GET /api/institutions/:slug/assets` — ingested assets for an institution
- `POST /api/admin/wipe-assets` — delete all ingested assets (admin)
- `GET /api/admin/review-queue` — pipeline review queue items (admin)
- `PATCH /api/admin/review-queue/:id` — resolve review queue item (admin)
- `GET /api/taxonomy/therapy-areas` — therapy area taxonomy with asset counts
- `GET /api/taxonomy/convergence` — convergence signals (multi-institution targets)
- `POST /api/admin/taxonomy/refresh` — refresh taxonomy + convergence (admin)
- `GET /api/browse/assets` — browse ingested assets with filters (therapyArea, institution, modality, stage)

### Database Tables
- `search_history`: query, source, result_count, created_at
- `saved_assets`: full asset data from saved search results
- `ingestion_runs`: id, ran_at, total_found, new_count, status, error_message
- `ingested_assets`: fingerprint (unique), asset_name, institution, source_url, summary, stage, first_seen_at, last_seen_at, enriched_at, run_id, categories (jsonb), categoryConfidence, available, contentHash, completenessScore, lastContentChangeAt, innovationClaim, mechanismOfAction, ipType, unmetNeed, comparableDrugs, licensingReadiness, patentStatus, licensingStatus, inventors (jsonb), contactEmail, technologyId, abstract
- `scan_institution_counts`: run_id, institution, count — per-institution scrape counts per ingestion run (populated during ingestion)
- `enrichment_jobs`: id, model, status, total, processed, improved, started_at, completed_at — tracks enrichment job progress in DB for resumability
- `review_queue`: assetId, fingerprint, reason, status, reviewerNote, createdAt, resolvedAt — ambiguous assets flagged for manual review
- `therapy_area_taxonomy`: name (unique), parentId, level, assetCount, lastUpdatedAt — therapy area hierarchy with live asset counts
- `convergence_signals`: therapyArea, targetOrMechanism, institutionCount, assetIds (jsonb), institutions (jsonb), score, detectedAt, lastUpdatedAt — multi-institution convergence detection

### Visual Theme
- Botanical green: `--primary: 142 52% 36%` (light) / `142 65% 48%` (dark)
- Dark mode: `--background: 222 47% 6%`
- CSS animations: `radar-sweep`, `helix-scroll`, `glow-pulse`

## Stripe Subscription Rails (Task #429)

Self-serve billing via Stripe Checkout for EdenScout (Individual / Team 5 / Team 10 plans).

### Schema
`organizations` table has 4 Stripe columns (added via SQL ALTER TABLE, not db:push):
- `stripe_customer_id`, `stripe_subscription_id`, `stripe_status`, `stripe_price_id`
- Existing `plan_tier` column is the gating field written by webhook/verify-session

### Storage methods added (`server/storage.ts`)
- `getOrgByStripeCustomer(stripeCustomerId)` — reverse lookup by Stripe customer ID
- `applyStripeSubscription(orgId, data)` — atomic write of all Stripe + planTier fields

### Backend routes (`server/routes.ts`)
- `POST /api/stripe/checkout` (auth required) — creates Stripe Checkout session, returns `{ url }`
- `GET /api/stripe/verify-session?session_id=` (auth required) — verifies payment, writes planTier to DB
- `POST /api/stripe/webhook` — handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`; gracefully skips signature verification if `STRIPE_WEBHOOK_SECRET` is not yet set

All Stripe routes return **503** when `STRIPE_SECRET_KEY` is absent — no crash on startup.

### Frontend
- `client/src/pages/Pricing.tsx` — Subscribe buttons per plan call `/api/stripe/checkout`, redirect unauthenticated users to `/login?mode=signup&redirect=/pricing`
- `client/src/pages/BillingSuccess.tsx` — shown at `/billing/success?session_id=...`; calls verify-session and displays plan + billing date; handles loading/error states
- Route registered in `client/src/App.tsx`

### Env vars needed (not yet set — user will supply after smoke-test)
- `STRIPE_SECRET_KEY` — Stripe secret key (sk_live_... or sk_test_...)
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret (whsec_...)
- `STRIPE_PRICE_INDIVIDUAL` — Stripe price ID for Individual plan
- `STRIPE_PRICE_TEAM5` — Stripe price ID for Team (5 seats)
- `STRIPE_PRICE_TEAM10` — Stripe price ID for Team (10 seats)

## Saved Reports (Task #554)
- `saved_reports` table: id, user_id, title, query, assets_json (JSONB), report_json (JSONB), created_at
- Created via startup migration in `server/index.ts` (`createSavedReportsTable()`)
- API routes: `POST /api/saved-reports`, `GET /api/saved-reports`, `DELETE /api/saved-reports/:id` (all use `verifyAnyAuth`)
- Scout saves report on `reportMutation.onSuccess` (fire-and-forget)
- Reports page (`client/src/pages/Reports.tsx`) fetches from API with loading skeleton, empty state, and delete button

## Trial Ending Reminder Email (Task #555)
- `sendTrialEndingEmail(to, orgName, trialEndDate, portalUrl?)` in `server/email.ts` — subject: "Your EdenScout trial expires tomorrow"
- `checkAndSendTrialReminders()` + `scheduleTrialReminderCheck()` in `server/index.ts` — runs 10s after startup then every 6h
- Queries via `storage.getOrgsWithTrialEndingSoon(25)` — orgs with `stripeStatus='trialing'`, `stripeCurrentPeriodEnd` within 25 hours, `trialReminderSentAt IS NULL`
- Email recipient: org owner's Supabase auth email (resolved via Admin API) → falls back to `org.billingEmail`
- Idempotency via `trialReminderSentAt` timestamp column on `organizations` (set via `updateOrganization` after send)
- Column added via startup migration: `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_reminder_sent_at TIMESTAMP`

## Sentry Error Monitoring (Task #556)
- Packages: `@sentry/node` (server), `@sentry/react` (frontend)
- Server init: `server/lib/sentry.ts` exports `initSentry()` (called at top of `server/index.ts` before any other code) + re-exports `captureException`; no-op + console.warn if `SENTRY_DSN` absent
- Sentry Express error handler: `Sentry.setupExpressErrorHandler(app)` registered after routes; global error middleware calls `Sentry.captureException` for 5xx errors
- Caught errors instrumented with `sentryCaptureException` in key routes: `POST /api/report`, `POST /api/org/members`, `POST /api/stripe/checkout`, `GET /api/stripe/verify-session`, `POST /api/stripe/webhook`
- Frontend: `client/src/main.tsx` — `Sentry.init` gated on `VITE_SENTRY_DSN`; `<App />` wrapped in `<Sentry.ErrorBoundary>` with a branded "Something went wrong" fallback UI
- Release tagging via `npm_package_version` (server) / `VITE_npm_package_version` (frontend) for per-deploy error grouping
- Both sides gracefully no-op if DSN is not set (safe for development)

## EdenMarket (Task #627)

Confidential biopharma deal marketplace portal at `/market`. Subscription-gated ($1k/month via Stripe), fully integrated with the industry portal.

### Architecture
- **Access gate**: `MarketGate` component checks `/api/market/access` — shows paywall if `org.edenMarketAccess === false`
- **Stripe checkout**: `POST /api/market/checkout` creates a Stripe subscription session; `GET /api/market/verify-session?market_session_id=` activates org access after payment
- **Layout**: `MarketLayout` + `MarketSidebar` (violet accent `hsl(271 81% 55%)`) — separate from DashboardLayout
- **DB tables**: `market_listings`, `market_eois`, `market_subscriptions` + `eden_market_access`/`eden_market_stripe_sub_id` on organizations
- **Migration**: `migrations/0009_edenmarket.sql`

### Routes
| Route | Description |
|---|---|
| `/market` | Buyer feed with filters + side-by-side comparison (up to 3) |
| `/market/listing/:id` | Full listing detail + EOI submission sheet |
| `/market/seller` | Seller dashboard — manage listings, view EOIs with Accept/Decline |
| `/market/create-listing` | Multi-step listing form (4 steps + AI summary generation) |
| `/market/my-eois` | Buyer's submitted EOIs with status tracking |
| `/market/deals` | Active deal rooms listing (buyer & seller) |
| `/market/deals/:dealId` | Deal room — NDA signing, document vault, messaging, status tracker |

### Deal Room Flow (Task #628)
1. Seller clicks **Accept** on an EOI → deal record created (`market_deals`), both parties emailed
2. Both parties visit `/market/deals/:id` and **e-sign the mutual NDA** (inline HTML template, name + timestamp stored)
3. Once both sign, deal room fully unlocks: listing details revealed, document upload, threaded messages
4. Seller updates deal status (NDA Signed → Due Diligence → Term Sheet → LOI → Closed)
5. Admin generates success fee invoice from the Deals tab (≤$5M → $10k, $5-50M → $30k, >$50M → $50k)

### DB Tables (Task #628 additions)
- `market_deals` — deal record, NDA signatures, status, success fee fields
- `market_deal_documents` — uploaded files (Supabase Storage bucket `market-deal-docs`)
- `market_deal_messages` — threaded messaging (30s polling)

### Eden Intelligence Integration (Task #629)

- **`ingestedAssetId` column** on `market_listings` (startup migration, optional FK to `ingested_assets`)
- **Eden Signal Score** — computed client-side 0–100 badge on each listing card (green ≥70, amber ≥40, grey otherwise). Factors: EdenScout link (+40), mechanism (+10), IP status (+5), milestone history (+5), price range (+10), AI summary (+10), TA/modality/stage/engagement (+5 each)
- **Eden Intelligence Sidebar** on `MarketListingDetail` — collapsible panel with 5 sections: EDEN Enrichment (linked ingested_asset fields), Related TTO Assets, Active Clinical Trials, Related Patents, Comparable Deals
- **Intelligence Assist on listing creation** — step 0 of `MarketCreateListing` shows EdenScout fuzzy search when TA is selected; linking an asset pre-fills mechanism/IP/modality/stage fields
- **EdenScout → EdenMarket availability signal** — admin PATCH listing to "active" emails all users who have the linked ingested_asset in their EdenScout saved portfolio
- **Dossier badge** — `AssetDossier` checks `GET /api/assets/:fingerprint/market-listing`; if an active listing is linked, shows "Listed in EdenMarket" badge linking to the listing page

### API Endpoints
- `GET /api/market/access` — access check
- `POST /api/market/checkout` — Stripe checkout
- `GET /api/market/verify-session` — activate after payment
- `GET /api/market/listings` — active listings (buyer feed, filtered)
- `GET /api/market/listings/suggest-asset?q=&ta=` — EdenScout fuzzy search for listing creation assist
- `POST /api/market/listings` — create listing (AI summary via gpt-4o-mini, optional `ingestedAssetId`)
- `GET/PATCH/DELETE /api/market/listings/:id` — listing CRUD (`PATCH` now accepts `ingestedAssetId`)
- `GET /api/market/listings/:id/intelligence` — Eden Intelligence panel data (TTO assets, trials, patents, comparable deals, EDEN enrichment)
- `GET /api/assets/:fingerprint/market-listing` — check if ingested_asset has an active EdenMarket listing (for dossier badge)
- `GET /api/market/my-listings` — seller's own listings
- `POST /api/market/eois` — submit EOI
- `GET /api/market/my-eois` — buyer's EOIs
- `GET /api/market/seller/eois` — EOIs on seller's listings
- `POST /api/market/eois/:id/accept` — accept EOI, create deal room
- `POST /api/market/eois/:id/decline` — decline EOI
- `GET /api/market/deals` — list deals for current user
- `GET /api/market/deals/:id` — deal room data (deal + listing + eoi)
- `POST /api/market/deals/:id/sign-nda` — e-sign NDA
- `PATCH /api/market/deals/:id/status` — update deal status (seller only)
- `GET/POST /api/market/deals/:id/documents` — document list/upload
- `DELETE /api/market/deals/:id/documents/:docId` — delete document
- `GET/POST /api/market/deals/:id/messages` — message thread
- `GET /api/admin/market/deals` — admin deal pipeline
- `POST /api/admin/market/deals/:id/invoice` — generate success fee invoice (Stripe)
- `GET/PATCH /api/admin/market/*` — admin review, stats, approval (PATCH to "active" fires EdenScout availability signal emails)

### Admin Tab
Admin panel "EdenMarket" section has 4 tabs: Listings (review/approve), EOIs (audit), **Deals (pipeline + success fee invoicing)**, Subscribers.

### Env Vars Required
- `STRIPE_PRICE_EDENMARKET` — Stripe price ID for the $1,000/month EdenMarket subscription

## Environment Variables
- `DATABASE_URL`: PostgreSQL connection (auto-provided by Replit)
- `SUPABASE_DATABASE_URL`: Supabase PostgreSQL connection (used in server/db.ts)
- `OPENAI_API_KEY`: OpenAI API key (Replit secret)
- `SESSION_SECRET`: Session encryption secret
- `VITE_SUPABASE_URL`: Supabase project URL (frontend)
- `VITE_SUPABASE_ANON_KEY`: Supabase anon/public API key (frontend)
- `RESEND_API_KEY`: Resend transactional email API key
- `SENTRY_DSN` *(optional)*: Sentry DSN for server-side error tracking — if set, Sentry is initialized
- `VITE_SENTRY_DSN` *(optional)*: Sentry DSN for frontend error tracking — if set, Sentry is initialized
- `IEDISON_API_KEY` *(optional)*: NIH iEdison REST API key. When set, the iEdison scraper
  uses authenticated JSON API requests (Bearer token + X-API-Key header) enabling full
  date-range access and higher rate limits. Obtain from https://iedison.nih.gov/iEdison/api/v1/publicInventions.
  When absent the scraper falls back to the HTML search interface automatically.
