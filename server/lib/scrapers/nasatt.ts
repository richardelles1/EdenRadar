/**
 * NASA Technology Transfer — patent portfolio scraper
 *
 * Source: NASA Technology Transfer Program
 *         https://technology.nasa.gov
 *
 * API:    https://technology.nasa.gov/api/api/patent/{keyword}
 *         Public, no auth, no key required.
 *         Returns all matching results in a single response per keyword
 *         (the API ignores perpage for JSON responses — results.length === total).
 *
 * Strategy:
 *   Query multiple biotech-relevant keywords and deduplicate by case number
 *   (item[1]). Each result array item has positional fields — no named keys.
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
  if (!code) return ADMIN_INST;
  const key = code.trim().toUpperCase();
  return CENTER_MAP[key] ?? `NASA ${code.trim()}`;
}

// ── Keyword list ──────────────────────────────────────────────────────────────
// These terms are searched against the patent title+abstract index.
// The API returns all matching results in one shot per keyword.
const BIOTECH_KEYWORDS = [
  "biology",
  "medical",
  "health",
  "cancer",
  "biomedical",
  "protein",
  "genome",
  "pharmaceutical",
  "therapy",
  "diagnostics",
  "imaging",
  "biotech",
  "sensor",
  "antibody",
  "vaccine",
  "neuroscience",
  "life science",
  "cell",
  "radiation",
  "microbe",
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

// ── Core fetch ────────────────────────────────────────────────────────────────

async function fetchKeyword(
  keyword: string,
  signal?: AbortSignal
): Promise<NasaItem[]> {
  const url = `${API_BASE}/${encodeURIComponent(keyword)}`;
  const combined = signal
    ? AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), signal])
    : AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  const res = await fetch(url, { signal: combined });
  if (!res.ok) throw new Error(`NASA TT HTTP ${res.status} for keyword="${keyword}"`);

  const data: NasaApiResponse = await res.json();
  const items = data.results ?? [];

  // Sanity check: API claims to return all results in one shot
  if (items.length !== data.total && data.total > 0) {
    console.warn(
      `[scraper] ${ADMIN_INST}: keyword="${keyword}" total=${data.total} but got ${items.length} items`
    );
  }

  return items;
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
    const seen = new Set<string>(); // keyed on case number

    let keywordsRun = 0;

    for (const keyword of BIOTECH_KEYWORDS) {
      if (signal?.aborted) break;
      try {
        const items = await fetchKeyword(keyword, signal);
        let added = 0;
        for (const item of items) {
          const caseNum = (item[1] ?? "").trim();
          if (!caseNum || seen.has(caseNum)) continue;
          seen.add(caseNum);
          const listing = itemToListing(item);
          if (listing) { results.push(listing); added++; }
        }
        if (added > 0) {
          console.log(`[scraper] ${ADMIN_INST}: keyword="${keyword}" → ${added} new (${items.length} returned)`);
        }
        keywordsRun++;
      } catch (err: any) {
        console.warn(`[scraper] ${ADMIN_INST}: keyword="${keyword}" failed: ${err?.message}`);
      }
    }

    console.log(
      `[scraper] ${ADMIN_INST}: ${results.length} total listings across ${keywordsRun}/${BIOTECH_KEYWORDS.length} keywords`
    );
    return results;
  },

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    const results: ScrapedListing[] = [];
    const seen = new Set<string>();

    // Use "medical" as probe keyword — confirmed to return ≥85 results
    try {
      const items = await fetchKeyword("medical");
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
    const ok = sample.every((r) => r.title && r.url && r.institution);
    console.log(
      `[scraper] ${ADMIN_INST}: probe ${ok ? "OK" : "PARTIAL"} — ${sample.length} results:`,
      sample.map((r) => `"${r.title.slice(0, 60)}" [${r.institution}]`)
    );
    return sample;
  },
};
