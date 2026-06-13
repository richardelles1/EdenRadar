// Single source of truth for platform-scale figures shown in user-facing copy.
//
// TTO_COUNT_LABEL is the always-safe display for institution / TTO coverage
// claims. Use it for marketing copy, the Scout coverage chip, access gates, and
// empty states so every surface agrees.
//
// LIVE_SCRAPER_COUNT is the exact number of live (non-stub) scrapers. Keep it in
// sync with the active entries in server/lib/scrapers/index.ts. Only surfaces
// that intentionally show an exact figure should use it; everything else uses
// TTO_COUNT_LABEL.
export const LIVE_SCRAPER_COUNT = 356;
export const TTO_COUNT_LABEL = "350+";
