# EdenRadar v2

AI-powered biotech asset matchmaking platform for internal use. Ingests signals from multiple sources, normalizes them through a scoring pipeline, and generates buyer-facing intelligence outputs (ranked results, dossiers, match reports). Includes a real TTO ingestion pipeline covering 205 institutions globally (138 with active scrapers, 67 stubbed pending custom scraper development).

## Architecture

### Stack
- **Frontend**: React + Vite + TailwindCSS + Shadcn UI (wouter routing, TanStack Query)
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **AI**: gpt-4o-mini for bulk signal extraction & TTO enrichment; gpt-4o for report/dossier narrative generation (uses `OPENAI_API_KEY`)
- **Data Sources**: PubMed, bioRxiv, medRxiv, ClinicalTrials.gov, USPTO Patents, University Tech Transfer, NIH Reporter, OpenAlex
- **TTO Scraping**: cheerio-based real scrapers for 138 institutions with active TechPublisher/custom/in-part/Flintbox/WordPress scrapers; 67 additional institutions stubbed (no public TTO listing portal or non-TechPublisher sites needing custom scrapers); daily cron at 8AM; manual Refresh button
- **in-part.com factory**: `createInPartScraper(subdomain, institution)` in new-institutions.ts — direct API calls to `https://app.in-part.com/api/v3/public/opportunities?portalSubdomain=X&page=N&limit=24` (no Playwright needed). SSR `__NEXT_DATA__` fallback if API empty. 19+ in-part scrapers active. Records per-institution counts to `scan_institution_counts` table.
- **WordPress API factory**: `createWordPressApiScraper(baseUrl, postType, institution)` — paginates `/wp-json/wp/v2/{postType}?per_page=100&page=N`. Used by ASU/Skysong (~1,317 technologies).
- **TechPublisher v3**: Sitemap-based category discovery (sitemap.xml → all category URLs → fetch per category page); individual page fetching for uncovered tech URLs from sitemap; achieves ~99% coverage (72/73 for Lehigh vs. 10 previously). Falls back to RSS when no sitemap.
- **Flintbox scraper factory**: `server/lib/scrapers/flintbox.ts` — uses confirmed working API: `GET /api/v1/technologies?organizationId={id}&organizationAccessKey={key}&per_page=500` with `X-Requested-With: XMLHttpRequest` header; response is JSON:API format (`data[].attributes.name`); Georgetown returns 111, Cornell returns 1,114 assets
- **UMich unblocked**: Removed from BLOCKED_SLUGS; now uses Flintbox scraper (umich.flintbox.com, org 12)
- **Georgia Tech added**: New institution entry (gatech.flintbox.com, org 186) with dedicated Flintbox scraper

### Portal Gates
**Industry Portal** (original):
- `localStorage.getItem('eden-portal')` = "true" to be inside
- `DashboardLayout` redirects to `/` if flag missing
- Entry: "For Industry" CTA on Landing page; exit: "Exit Portal" in Sidebar
- Routes: /scout, /assets, /reports, /alerts, /institutions, /sources

**Researcher Portal** (new — Task #21):
- `localStorage.getItem('eden-research-portal')` = "true" to be inside
- `ResearchLayout` redirects to `/` if flag missing
- Researcher identity: `localStorage.getItem('eden-researcher-id')` = UUID (auto-generated)
- Researcher profile: `localStorage.getItem('eden-researcher-profile')` = JSON
- Entry: "For Researchers" CTA on Landing page; exit: "Exit Portal" in ResearchSidebar
- Routes: /research, /research/create-discovery, /research/my-discoveries, /research/data-sources, /research/profile
- Industry Bridge: Published discovery cards appear in GET /api/discoveries (public endpoint) — surfaced in industry Scout with "Lab Published" amber badge (AssetCard.tsx checks source_types includes "researcher")

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
- **Ingestion pipeline**: `runIngestionPipeline()` scrapes all 86 TTOs with concurrency=5, upserts to DB, diffs for new
- **Per-institution sync**: `runInstitutionSync(institution)` — single-institution scrape → fingerprint compare → AI enrich → staging table. Two-step push: preview results then explicit "Push to Index". Zero guard blocks push if rawCount=0. Soft warning if rawCount < 50% of currentIndexed. Mutual exclusion with full ingestion.
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
      index.ts            # collectAllSignals() fan-out + DataSource registry
      pubmed.ts, biorxiv.ts, medrxiv.ts, clinicaltrials.ts, patents.ts, techtransfer/
    pipeline/
      normalizeSignals.ts, clusterAssets.ts, scoreAssets.ts, generateReport.ts, generateDossier.ts
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
    AssetDossier.tsx      # /asset/:id — dossier view
    Report.tsx            # /report — buyer intelligence report

shared/schema.ts          # Drizzle: users, searchHistory, savedAssets, ingestionRuns, ingestedAssets, scanInstitutionCounts
```

### Pages
- **`/`** — Landing with EdenSVG botanical icon, Enter Portal CTA
- **`/scout`** — Multi-source search with scan status banner, buyer thesis, source toggles, scored asset grid
- **`/assets`** — Saved pipeline kanban by clinical stage
- **`/institutions`** — 195 TTO cards with live listing counts from DB
- **`/institutions/:slug`** — Ingested listings with sort (Newest First / Best Commercial / A-Z / Z-A), search filter, modality/stage tags via title-signal parser, commercial score badge, expandable detail panel per asset
- **`/alerts`** — Real delta data from last ingestion run (new assets per institution), Create Alert sheet
- **`/admin`** — Admin control panel (password: "eden") with scan tracking table showing per-institution counts per run, delta column, sortable
- **`/reports`** — Mock report cards
- **`/asset/:id`** — Full dossier with score breakdown
- **`/report`** — Buyer intelligence report

### API Routes
- `GET /api/sources` — list available source modules
- `POST /api/search` — full pipeline search → `ScoredAsset[]`
- `POST /api/report` — GPT-4o market report
- `POST /api/dossier` — GPT-4o dossier brief
- `GET/POST /api/saved-assets` — saved asset CRUD
- `DELETE /api/saved-assets/:id`
- `GET /api/search-history`
- `GET /api/admin/scan-matrix?pw=eden` — per-institution counts for last N completed runs (password protected)
- `POST /api/ingest/run` — trigger TTO scrape pipeline (async, non-blocking)
- `GET /api/ingest/status` — last run status (never_run | running | completed | failed)
- `GET /api/institutions/counts` — `Record<string, number>` count per institution
- `GET /api/institutions/:slug/assets` — ingested assets for an institution

### Database Tables
- `search_history`: query, source, result_count, created_at
- `saved_assets`: full asset data from saved search results
- `ingestion_runs`: id, ran_at, total_found, new_count, status, error_message
- `ingested_assets`: fingerprint (unique), asset_name, institution, source_url, summary, stage, first_seen_at, last_seen_at, enriched_at, run_id
- `scan_institution_counts`: run_id, institution, count — per-institution scrape counts per ingestion run (populated during ingestion)
- `enrichment_jobs`: id, model, status, total, processed, improved, started_at, completed_at — tracks enrichment job progress in DB for resumability

### Visual Theme
- Botanical green: `--primary: 142 52% 36%` (light) / `142 65% 48%` (dark)
- Dark mode: `--background: 222 47% 6%`
- CSS animations: `radar-sweep`, `helix-scroll`, `glow-pulse`

## Environment Variables
- `DATABASE_URL`: PostgreSQL connection (auto-provided by Replit)
- `OPENAI_API_KEY`: OpenAI API key (Replit secret)
- `SESSION_SECRET`: Session encryption secret
