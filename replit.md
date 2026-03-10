# HelixRadar

AI-powered biotech asset discovery platform that extracts structured drug asset intelligence from scientific literature.

## Architecture

### Stack
- **Frontend**: React + Vite + TailwindCSS + Shadcn UI (wouter routing, TanStack Query)
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **AI**: OpenAI gpt-4o-mini for structured extraction (uses `OPENAI_API_KEY` env var)
- **Data Source**: PubMed E-utilities API (extensible to other sources)

### Key Design Decisions
- **Extensible data source architecture**: `server/lib/sources/index.ts` defines a `DataSource` interface. PubMed is the first implementation. To add a new source (ClinicalTrials.gov, bioRxiv, etc.), implement the interface and register it in the `dataSources` registry.
- **AI extraction**: Each paper abstract is passed to OpenAI with a structured JSON extraction prompt. Returns asset_name, target, modality, development_stage, disease_indication, summary. Fatal OpenAI errors (auth, quota) are rethrown and surface as user-visible error messages.
- **No database for search results**: Results are ephemeral (per-request). Only saved assets and search history are persisted.

### Folder Structure
```
server/
  lib/
    sources/
      index.ts        # DataSource interface + registry (add new sources here)
      pubmed.ts       # PubMed E-utilities implementation
    extractor.ts      # OpenAI-powered structured data extraction
  routes.ts           # API routes (/api/search, /api/saved-assets, /api/search-history)
  storage.ts          # Database CRUD via Drizzle
  db.ts               # Drizzle + pg pool setup

client/src/
  pages/
    Landing.tsx       # / — hero landing page with animated helix + radar
    Discover.tsx      # /discover — search interface with filter chips
    Pipeline.tsx      # /pipeline — kanban view of saved assets by clinical stage
  components/
    Nav.tsx           # Shared sticky navigation across all pages
    SearchBar.tsx     # Search input + source selector + example queries
    SearchResults.tsx # Results grid with loading/empty states
    AssetCard.tsx     # Drug asset card + saved asset card
    SavedAssetsPanel.tsx    # Right sidebar for saved assets
    SearchHistoryPanel.tsx  # Recent search bubbles

shared/schema.ts      # Drizzle schema: searchHistory, savedAssets tables + Asset type
```

### Pages
- **`/`** — Landing page with animated SVG DNA double helix + spinning radar graphic, feature highlights, CTA to Discover
- **`/discover`** — Full search interface: query input, source selector, example queries, radar sweep loading animation, filter chips (by stage/modality), results grid, saved assets sidebar
- **`/pipeline`** — Kanban pipeline view: saved assets organized into columns by development stage (Discovery → Preclinical → Phase 1 → Phase 2 → Phase 3 → Approved), with JSON/CSV export

### Visual Theme
- Deep-space navy dark mode (`--background: 222 47% 6%`) + electric cyan primary (`--primary: 183 85% 52%`)
- Gradient text: `.gradient-text` (dark) / `.gradient-text-light` (light)
- CSS animations: `radar-sweep` (4s spin), `helix-scroll` (12s translateY), `glow-pulse`

### Database Tables
- `search_history`: Persists query, source, result_count, created_at
- `saved_assets`: Full asset data including all AI-extracted fields + source metadata

## Adding New Data Sources

1. Create `server/lib/sources/[source-name].ts` implementing `search(query, maxResults): Promise<RawPaper[]>`
2. Add to the `dataSources` registry in `server/lib/sources/index.ts`
3. The frontend will automatically show the new source in the dropdown

## Environment Variables
- `DATABASE_URL`: PostgreSQL connection string (auto-provided by Replit)
- `OPENAI_API_KEY`: OpenAI API key (user's own key, set as Replit secret)
