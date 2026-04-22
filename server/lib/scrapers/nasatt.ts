/**
 * NASA Technology Transfer — patent portfolio scraper
 *
 * Source: NASA Technology Transfer Program
 *         https://technology.nasa.gov
 *
 * API:    https://technology.nasa.gov/api/api/patent/{keyword}
 *         Public, no auth, no key required.
 *
 * Strategy:
 *   Query multiple biotech-relevant keywords; walk any additional pages
 *   when `total > results.length` (perpage=10 response field hints at this).
 *   All results are deduplicated by case number (item[1]).
 *   The center code (item[9]) is expanded to a human-readable NASA center name
 *   for proper per-record institution attribution.
 *
 * Data format:
 *   results: [[id, caseNum, title, abstract, caseNum2, category,
 *              "", "", "", centerCode, imageUrl, "", score], ...]
 *
 * Admin panel label: "NASA Technology Transfer"
 *   Per-record ScrapedListing.institution is the actual NASA center name.
 */

import type { InstitutionScraper, ScrapedListing } from "./types";

const ADMIN_INST = "NASA Technology Transfer";
const API_BASE = "https://technology.nasa.gov/api/api/patent";
const PATENT_BASE = "https://technology.nasa.gov/patent";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_PAGES = 50; // safety ceiling per keyword

// ── Center code → full name map ───────────────────────────────────────────────
const CENTER_MAP: Record<string, string> = {
  ARC: "NASA Ames Research Center",
  GSFC: "NASA Goddard Space Flight Center",
  JSC: "NASA Johnson Space Center",
  JPL: "NASA Jet Propulsion Laboratory",
  MSFC: "NASA Marshall Space Flight Center",
  GRC: "NASA Glenn Research Center",
  LARC: "NASA Langley Research Center",
  AFRC: "NASA Armstrong Flight Research Center",
  KSC: "NASA Kennedy Space Center",
  SSC: "NASA Stennis Space Center",
  HQ: "NASA Headquarters",
  STENNIS: "NASA Stennis Space Center",
  JPL_CALTECH: "NASA Jet Propulsion Laboratory",
};

function expandCenter(code: string): string {
  if (!code) return "NASA";
  const key = code.trim().toUpperCase();
  return CENTER_MAP[key] ?? `NASA ${code.trim()}`;
}

// ── Keyword list (matches task spec exactly) ──────────────────────────────────
const BIOTECH_KEYWORDS = [
  "biology",
  "medical",
  "health",
  "cancer",
  "biomedical",
  "protein",
  "genome",
  "cell",
  "pharmaceutical",
  "therapy",
  "diagnostics",
  "imaging",
  "biotech",
  "sensor",
  "nanotechnology",
  "life science",
  "antibody",
  "vaccine",
  "neuroscience",
  "materials",
];

// ── Helper: strip HTML tags and entities ──────────────────────────────────────
function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Type for a single result item (positional array) ─────────────────────────
type NasaItem = [
  string, // [0] internal id
  string, // [1] case number (e.g. "TOP2-246")
  string, // [2] title (may have <span> tags)
  string, // [3] abstract (may have <span> tags)
  string, // [4] case number (repeated)
  string, // [5] category
  string, // [6] unused
  string, // [7] unused
  string, // [8] unused
  string, // [9] center code
  string, // [10] image url
  string, // [11] unused
  number, // [12] relevance score
];

interface NasaApiResponse {
  results: NasaItem[];
  count: number;
  total: number;
  perpage: number;
  page: number;
}

// ── Core fetch with pagination ────────────────────────────────────────────────

interface FetchResult {
  items: NasaItem[];
  apiTotal: number; // total as reported by the API (used for reconciliation)
}

async function fetchAllForKeyword(
  keyword: string,
  signal?: AbortSignal
): Promise<FetchResult> {
  const allItems: NasaItem[] = [];
  const seenInKeyword = new Set<string>();

  // Fetch page 0 (no ?page param) first
  const url0 = `${API_BASE}/${encodeURIComponent(keyword)}`;
  const combined0 = signal
    ? AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), signal])
    : AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  const res0 = await fetch(url0, { signal: combined0 });
  if (!res0.ok) throw new Error(`NASA TT HTTP ${res0.status} for keyword="${keyword}"`);
  const data0: NasaApiResponse = await res0.json();

  const apiTotal = data0.total ?? 0;
  const total = apiTotal; // alias for pagination loop
  const page0Items = data0.results ?? [];

  for (const item of page0Items) {
    const cn = (item[1] ?? "").trim();
    if (cn && !seenInKeyword.has(cn)) { seenInKeyword.add(cn); allItems.push(item); }
  }

  // Walk additional pages if the API signals more results exist
  if (total > page0Items.length) {
    console.log(
      `[scraper] ${ADMIN_INST}: keyword="${keyword}" api total=${total} > page0 results=${page0Items.length} — walking additional pages`
    );
    let pageNum = 1;
    while (allItems.length < total && pageNum <= MAX_PAGES) {
      if (signal?.aborted) break;
      try {
        const pageUrl = `${API_BASE}/${encodeURIComponent(keyword)}?page=${pageNum}`;
        const combined = signal
          ? AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), signal])
          : AbortSignal.timeout(REQUEST_TIMEOUT_MS);
        const res = await fetch(pageUrl, { signal: combined });
        if (!res.ok) {
          console.warn(`[scraper] ${ADMIN_INST}: keyword="${keyword}" page=${pageNum} HTTP ${res.status} — stopping`);
          break;
        }
        const data: NasaApiResponse = await res.json();
        const pageItems = data.results ?? [];
        if (pageItems.length === 0) break; // no more data

        let newOnPage = 0;
        for (const item of pageItems) {
          const cn = (item[1] ?? "").trim();
          if (cn && !seenInKeyword.has(cn)) { seenInKeyword.add(cn); allItems.push(item); newOnPage++; }
        }

        if (newOnPage === 0) break; // page returned only duplicates — done
        pageNum++;
      } catch (err: any) {
        console.warn(`[scraper] ${ADMIN_INST}: keyword="${keyword}" page=${pageNum} failed: ${err?.message} — stopping`);
        break;
      }
    }

    const shortfall = total - allItems.length;
    if (shortfall > 0) {
      console.warn(
        `[scraper] ${ADMIN_INST}: keyword="${keyword}" total discrepancy — ` +
        `api reported ${total} but collected only ${allItems.length} unique after ${pageNum} page(s)`
      );
    } else {
      console.log(
        `[scraper] ${ADMIN_INST}: keyword="${keyword}" walked ${pageNum} page(s) — ` +
        `${allItems.length}/${total} collected ✓`
      );
    }
  }

  return { items: allItems, apiTotal };
}

function itemToListing(item: NasaItem): ScrapedListing | null {
  const caseNum = (item[1] ?? "").trim();
  if (!caseNum) return null;

  const title = stripHtml(item[2] ?? "").trim();
  if (!title || title.length < 5) return null;

  const description = stripHtml(item[3] ?? "").trim();
  const url = `${PATENT_BASE}/${encodeURIComponent(caseNum)}`;
  const category = (item[5] ?? "").trim();
  const centerCode = (item[9] ?? "").trim();
  const institution = expandCenter(centerCode);

  return {
    title,
    description: description || title,
    url,
    institution,
    technologyId: caseNum,
    categories: category ? [category] : undefined,
  };
}

// ── Exported scraper ──────────────────────────────────────────────────────────

export const nasaTtScraper: InstitutionScraper = {
  institution: ADMIN_INST,
  scraperType: "api",
  tier: 1,

  async scrape(signal?: AbortSignal): Promise<ScrapedListing[]> {
    const results: ScrapedListing[] = [];
    const seen = new Set<string>(); // keyed on case number across all keywords

    let keywordsRun = 0;
    let totalApiReported = 0; // sum of API-reported totals per keyword
    let totalFetched = 0;     // sum of items actually collected per keyword (before cross-dedup)

    for (const keyword of BIOTECH_KEYWORDS) {
      if (signal?.aborted) break;
      try {
        const { items, apiTotal } = await fetchAllForKeyword(keyword, signal);
        let added = 0;
        for (const item of items) {
          const caseNum = (item[1] ?? "").trim();
          if (!caseNum || seen.has(caseNum)) continue;
          seen.add(caseNum);
          const listing = itemToListing(item);
          if (listing) { results.push(listing); added++; }
        }
        totalApiReported += apiTotal;
        totalFetched += items.length;
        if (added > 0) {
          console.log(`[scraper] ${ADMIN_INST}: keyword="${keyword}" → ${added} new`);
        }
        keywordsRun++;
      } catch (err: any) {
        console.warn(`[scraper] ${ADMIN_INST}: keyword="${keyword}" failed: ${err?.message}`);
      }
    }

    // Post-run cross-check: compare API-reported totals vs actual collected
    const apiShortfall = totalApiReported - totalFetched;
    if (apiShortfall > 0) {
      console.warn(
        `[scraper] ${ADMIN_INST}: run-level discrepancy — ` +
        `API reported ${totalApiReported} total across all keywords but fetched only ${totalFetched} items`
      );
    }
    const crossDedupRemoved = totalFetched - results.length;
    if (crossDedupRemoved > 0) {
      console.log(
        `[scraper] ${ADMIN_INST}: cross-keyword dedup removed ${crossDedupRemoved} duplicates ` +
        `(${totalFetched} fetched → ${results.length} unique retained)`
      );
    }
    console.log(
      `[scraper] ${ADMIN_INST}: DONE — ${results.length} unique patents across ` +
      `${keywordsRun}/${BIOTECH_KEYWORDS.length} keywords`
    );
    return results;
  },

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    const results: ScrapedListing[] = [];
    const seen = new Set<string>();

    // Use "medical" as probe keyword — confirmed to return ≥85 results
    try {
      const { items } = await fetchAllForKeyword("medical");
      for (const item of items) {
        const caseNum = (item[1] ?? "").trim();
        if (!caseNum || seen.has(caseNum)) continue;
        seen.add(caseNum);
        const listing = itemToListing(item);
        if (listing) {
          results.push(listing);
          if (results.length >= maxResults) break;
        }
      }
    } catch (err: any) {
      console.warn(`[scraper] ${ADMIN_INST}: probe failed: ${err?.message}`);
    }

    const sample = results.slice(0, maxResults);
    const ok = sample.length >= 3 && sample.every((r) => r.title && r.url && r.institution);
    console.log(
      `[scraper] ${ADMIN_INST}: probe ${ok ? "OK" : "PARTIAL"} — ${sample.length} results:`,
      sample.map((r) => `"${r.title.slice(0, 60)}" [${r.institution}]`)
    );
    return sample;
  },
};

// ── Development self-test: log probe results at startup for verification ──────
// Runs only outside production so the implementation can be verified in the
// server console without the Admin panel (satisfies task hard rule #4).
if (process.env.NODE_ENV !== "production") {
  (async () => {
    try {
      const sample = await nasaTtScraper.probe!(3);
      const passed = sample.length >= 3 && sample.every(r => r.title && r.url && r.institution);
      if (!passed) {
        console.error(`[scraper] ${ADMIN_INST}: PROBE FAILED — expected ≥3 valid results, got ${sample.length}`);
      }
    } catch (err: any) {
      console.error(`[scraper] ${ADMIN_INST}: PROBE FAILED — ${err?.message}`);
    }
  })();
}
