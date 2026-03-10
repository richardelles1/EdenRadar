# HelixRadar v2

AI-powered biotech asset matchmaking platform. Ingests signals from multiple sources, normalizes them through a scoring pipeline, and generates buyer-facing intelligence outputs (ranked results, dossiers, match reports).

## Architecture

### Stack
- **Frontend**: React + Vite + TailwindCSS + Shadcn UI (wouter routing, TanStack Query)
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **AI**: gpt-4o-mini for bulk signal extraction; gpt-4o for report/dossier narrative generation (uses `OPENAI_API_KEY`)
- **Data Sources**: PubMed, bioRxiv, medRxiv, ClinicalTrials.gov, USPTO Patents, University Tech Transfer

### Key Design Decisions
- **Unified `RawSignal` type**: All 6 data sources convert their output to `RawSignal[]` — a common envelope that feeds the pipeline
- **Pipeline architecture**: collect → normalize (LLM) → cluster → score (deterministic) → rank
- **Three-tier model strategy**: gpt-4o-mini for paper/preprint/trial extraction; gpt-4o for patent + tech_transfer extraction (higher quality for dense text) + report/dossier narratives; mini fallback on gpt-4o errors
- **Scoring weights**: freshness×0.15 + novelty×0.20 + readiness×0.15 + licensability×0.25 + fit×0.15 + competition×0.10
- **Tech Transfer**: Adapter pattern with curated seed data (8 institutions). Future live scraping swappable per-adapter.
- **ClinicalTrials structured passthrough**: Known structured fields (indication, stage, owner, owner_type) applied directly before/after LLM extraction to prevent re-extraction errors
- **No nanoid**: Uses `crypto.randomUUID()` (built-in Node.js) for ID generation
- **PDF export**: @media print CSS block hides nav/buttons, forces white background, page-break control. Print buttons on Dossier + Report pages.

### Folder Structure
```
server/
  lib/
    types.ts              # Canonical types: RawSignal, ScoredAsset, BuyerProfile, ScoreBreakdown
    llm.ts                # LLM interface — extractAssetFromSignal (mini), generateWhyItMatters (mini), generateReportNarrative (4o), generateDossierNarrative (4o)
    sources/
      index.ts            # collectAllSignals() fan-out + DataSource registry (all 6 sources)
      pubmed.ts           # PubMed E-utilities → RawSignal[]
      biorxiv.ts          # bioRxiv via Europe PMC full-text search (PPR source, no date ceiling)
      medrxiv.ts          # medRxiv via Europe PMC full-text search (PPR source, no date ceiling)
      clinicaltrials.ts   # ClinicalTrials.gov API v2
      patents.ts          # USPTO PatentsView API (free, no key)
      techtransfer/
        index.ts          # TechTransferAdapter interface + getTechTransferSignals()
        stanford.ts       # 8 curated Stanford OTL listings
        mit.ts            # 8 curated MIT TLO listings
        oxford.ts         # 8 curated Oxford University Innovation listings
        ucsf.ts           # 8 curated UCSF Innovation Ventures listings
        broad.ts          # 8 curated Broad Institute Technology listings
        johnshopkins.ts   # 8 curated Johns Hopkins Technology Ventures listings
        harvard.ts        # 8 curated Harvard OTD listings
        emory.ts          # 8 curated Emory OTT listings
    pipeline/
      normalizeSignals.ts # RawSignal[] → Partial<ScoredAsset>[] via LLM extraction (concurrency=3)
      clusterAssets.ts    # Groups similar assets by name/target/indication/owner similarity
      scoreAssets.ts      # Deterministic 6-dimension scoring + generateWhyItMatters for top 10
      generateReport.ts   # Calls generateReportNarrative (gpt-4o) → ReportPayload
      generateDossier.ts  # Calls generateDossierNarrative (gpt-4o) → DossierPayload
    extractor.ts          # Legacy single-source extractor (kept for backward compat)
  routes.ts               # POST /api/search (full pipeline), POST /api/report, POST /api/dossier

client/src/
  lib/
    types.ts              # Client-side mirror of server types (ScoredAsset, BuyerProfile, etc.)
  pages/
    Landing.tsx           # / — animated DNA helix + radar landing page
    Discover.tsx          # /discover — multi-source search, buyer profile, source toggles, report button
    Pipeline.tsx          # /pipeline — kanban saved assets by stage
    AssetDossier.tsx      # /asset/:id — premium dossier view with score breakdown + evidence signals
    Report.tsx            # /report — buyer intelligence report with ranked assets + narrative
  components/
    Nav.tsx
    SearchBar.tsx
    SearchResults.tsx     # Updated to use ScoredAsset[]
    AssetCard.tsx         # Updated: ScoreBadge, SourceBadge, owner info, "View Dossier" button
    SavedAssetsPanel.tsx
    SearchHistoryPanel.tsx
    ScoreBadge.tsx        # Colored score badge (0-100) with score breakdown tooltip
    ScoreBreakdownCard.tsx # 6-dimension score breakdown with progress bars
    SourceBadge.tsx        # Color-coded source type pill (paper/preprint/trial/patent/tech_transfer)
    BuyerProfileForm.tsx   # Collapsible buyer thesis form with multi-select chips and keyword inputs

shared/schema.ts          # Drizzle schema: searchHistory, savedAssets tables
```

### Pages
- **`/`** — Landing with animated DNA helix + spinning radar, CTA to Discover
- **`/discover`** — Multi-source search with buyer thesis configuration, source toggles, scored asset grid, "Match Report" button, "View Dossier" per card
- **`/pipeline`** — Kanban of saved assets by clinical stage with JSON/CSV export
- **`/asset/:id`** — Premium dossier: score breakdown, evidence signals, commercial why-it-matters, "Generate Full Dossier" (GPT-4o)
- **`/report`** — Buyer intelligence report: exec summary, buyer thesis, ranked top assets, AI narrative analysis

### API Routes
- `GET /api/sources` — list all available source modules
- `POST /api/search` — `{ query, sources[], maxPerSource, buyerProfile? }` → `ScoredAsset[]` (full pipeline)
- `POST /api/report` — same body as search → `ReportPayload` (includes GPT-4o narrative)
- `POST /api/dossier` — `{ asset: ScoredAsset }` → `DossierPayload` (GPT-4o commercial brief)
- `GET/POST /api/saved-assets` — saved asset CRUD
- `GET /api/search-history` — recent searches

### Scoring Dimensions (0–100 each)
| Dimension | Weight | Signal |
|-----------|--------|--------|
| Novelty | 20% | Preprint/university sources, low evidence count = high novelty |
| Freshness | 15% | Days since latest signal (≤30 days = 100) |
| Readiness | 15% | Clinical stage + patent/trial presence |
| Licensability | 25% | University ownership + tech transfer + "available" licensing status |
| Buyer Fit | 15% | Alignment with BuyerProfile thesis (0 if no profile provided) |
| Competition | 10% | Inverted: large pharma sponsor or late-stage = penalty |

### Visual Theme
- Deep-space navy dark mode (`--background: 222 47% 6%`) + electric cyan primary (`--primary: 183 85% 52%`)
- CSS animations: `radar-sweep` (4s spin), `helix-scroll` (12s translateY), `glow-pulse`

### Database Tables
- `search_history`: query, source, result_count, created_at
- `saved_assets`: full asset data from saved search results

## Environment Variables
- `DATABASE_URL`: PostgreSQL connection string (auto-provided by Replit)
- `OPENAI_API_KEY`: OpenAI API key (user's own key, set as Replit secret)
