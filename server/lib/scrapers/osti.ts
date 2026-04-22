/**
 * OSTI.gov — DOE Patents scraper
 *
 * Source: U.S. Department of Energy Office of Scientific and Technical
 *         Information (OSTI.GOV). The standalone "DOE Patents" tool was
 *         retired in September 2025 and merged into OSTI.GOV.
 *
 * API:    https://www.osti.gov/api/v1/records
 *         Public, no auth, no key required.
 *
 * Strategy:
 *   Run a curated list of biotech keyword queries against the OSTI patent
 *   index. Each query is paginated via Link response headers (rel="next" /
 *   rel="last"). Results are deduplicated within the scraper by osti_id.
 *   The relevance pre-filter in the ingestion pipeline handles non-biotech
 *   patents that slip through.
 *
 * Institution attribution:
 *   Each record carries research_orgs[] from the API. We use research_orgs[0]
 *   and strip the trailing geographic suffix (", City, ST (Country)") so the
 *   institution field contains only the lab or company name. This ensures
 *   the fingerprint matches other scrapers targeting the same lab.
 *
 * Admin panel label: "OSTI.gov (DOE Patents)"
 *   The per-record ScrapedListing.institution is the actual performing org,
 *   not this admin label.
 */

import type { InstitutionScraper, ScrapedListing } from "./types";

const ADMIN_INST = "OSTI.gov (DOE Patents)";
const BASE_URL = "https://www.osti.gov";
const API_BASE = `${BASE_URL}/api/v1/records`;
const ROWS_PER_PAGE = 50;
const REQUEST_TIMEOUT_MS = 30_000;
const FALLBACK_INSTITUTION = "DOE National Laboratory";

// ── Biotech keyword buckets ──────────────────────────────────────────────────
// Each becomes a separate paginated query. Cross-query duplicates are caught
// by the in-scraper seen-set keyed on osti_id.
const BIOTECH_QUERIES = [
  "cancer",
  "immunotherapy",
  "antibody",
  "gene therapy",
  "cell therapy",
  "protein therapeutic",
  "vaccine",
  "biomedical",
  "genomics",
  "drug delivery",
  "diagnostic",
  "biosensor",
  "enzyme",
  "biologic",
  "neuroscience",
  "antimicrobial",
  "stem cell",
  "CRISPR",
  "RNA",
  "radiopharmaceutical",
  "nanoparticle biology",
  "molecular imaging",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip trailing geographic suffix from research_orgs[] entries.
 * Input:  "Argonne National Laboratory (ANL), Argonne, IL (United States)"
 * Output: "Argonne National Laboratory (ANL)"
 *
 * Input:  "SHINE Technologies, LLC, Janesville, WI (United States)"
 * Output: "SHINE Technologies, LLC"
 */
function stripGeoSuffix(raw: string): string {
  let s = raw.trim();
  s = s.replace(/\s*\([^)]+\)\s*$/, "");  // strip " (United States)" etc.
  s = s.replace(/,\s*[A-Z]{2}\s*$/, "");  // strip ", IL"
  s = s.replace(/,\s*[A-Za-z][A-Za-z ]*$/, ""); // strip ", Argonne"
  return s.trim();
}

function resolveInstitution(record: OstiRecord): string {
  const orgs = record.research_orgs;
  if (Array.isArray(orgs) && orgs.length > 0) {
    const raw = orgs[0] ?? "";
    if (raw && !raw.toLowerCase().includes("not identified")) {
      const stripped = stripGeoSuffix(raw);
      if (stripped && stripped.length > 2) return stripped;
    }
  }
  // Fallback: try assignee field
  const assignee = (record.assignee ?? "").trim().replace(/^\s+|\s+$/g, "");
  if (assignee && assignee.length > 2) return assignee.split(",")[0].trim();
  return FALLBACK_INSTITUTION;
}

function resolveUrl(record: OstiRecord): string {
  const links = record.links ?? [];
  const citation = links.find((l) => l.rel === "citation");
  if (citation?.href) return citation.href;
  if (record.osti_id) return `${BASE_URL}/biblio/${record.osti_id}`;
  return BASE_URL;
}

function resolvePatentStatus(record: OstiRecord): string | undefined {
  const parts: string[] = [];
  if (record.country_publication) parts.push(record.country_publication);
  if (record.patent_number) parts.push(`Patent ${record.patent_number}`);
  return parts.length > 0 ? parts.join(" — ") : undefined;
}

/** Parse Link header and return a map of rel → URL */
function parseLinkHeader(header: string | null): Record<string, string> {
  const map: Record<string, string> = {};
  if (!header) return map;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="(\w+)"/);
    if (m) map[m[2]] = m[1];
  }
  return map;
}

/** Extract 0-based page number from a fully-qualified URL */
function pageFromUrl(url: string): number {
  try {
    return parseInt(new URL(url).searchParams.get("page") ?? "0", 10);
  } catch {
    return 0;
  }
}

// ── Type definitions ─────────────────────────────────────────────────────────

interface OstiLink {
  rel: string;
  href: string;
}

interface OstiRecord {
  osti_id?: number;
  title?: string;
  description?: string;
  research_orgs?: string[];
  sponsor_orgs?: string[];
  authors?: string[];
  patent_number?: string;
  application_number?: string;
  publication_date?: string;
  country_publication?: string;
  assignee?: string;
  links?: OstiLink[];
}

// ── Core fetch helpers ────────────────────────────────────────────────────────

async function fetchPage(
  query: string,
  page: number,
  signal?: AbortSignal
): Promise<{ records: OstiRecord[]; links: Record<string, string> }> {
  const url = new URL(API_BASE);
  url.searchParams.set("product_type", "Patent");
  url.searchParams.set("q", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("rows", String(ROWS_PER_PAGE));

  const combined = signal
    ? AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), signal])
    : AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: combined,
  });

  if (!res.ok) throw new Error(`OSTI HTTP ${res.status} for query="${query}" page=${page}`);

  const records: OstiRecord[] = await res.json();
  const links = parseLinkHeader(res.headers.get("link"));
  return { records, links };
}

function recordToListing(record: OstiRecord): ScrapedListing | null {
  const title = (record.title ?? "").trim();
  if (!title || title.length < 5) return null;

  const description = (record.description ?? title).trim();
  const url = resolveUrl(record);
  if (!url || url === BASE_URL) return null;

  const institution = resolveInstitution(record);

  const authors = Array.isArray(record.authors)
    ? record.authors.filter(Boolean)
    : undefined;

  return {
    title,
    description: description || title,
    url,
    institution,
    inventors: authors && authors.length > 0 ? authors : undefined,
    patentStatus: resolvePatentStatus(record),
    technologyId: record.patent_number ?? String(record.osti_id ?? ""),
    publishedDate: record.publication_date
      ? record.publication_date.split("T")[0]
      : undefined,
  };
}

/**
 * Fetch all pages for a single keyword query and push non-duplicate results
 * into `out`. Returns the count of newly added records.
 */
async function fetchQuery(
  query: string,
  seen: Set<number>,
  out: ScrapedListing[],
  signal?: AbortSignal
): Promise<number> {
  let added = 0;
  let page = 0;
  let lastPage = 0;

  try {
    const first = await fetchPage(query, 0, signal);
    if (first.records.length === 0) return 0;

    // Determine total page count from Link header
    if (first.links.last) {
      lastPage = pageFromUrl(first.links.last);
    } else if (!first.links.next) {
      // Only one page
      lastPage = 0;
    }

    const process = (records: OstiRecord[]) => {
      for (const rec of records) {
        if (!rec.osti_id) continue;
        if (seen.has(rec.osti_id)) continue;
        seen.add(rec.osti_id);
        const listing = recordToListing(rec);
        if (listing) { out.push(listing); added++; }
      }
    };

    process(first.records);

    for (page = 1; page <= lastPage; page++) {
      if (signal?.aborted) break;
      try {
        const { records } = await fetchPage(query, page, signal);
        if (records.length === 0) break;
        process(records);
      } catch (err: any) {
        console.warn(`[scraper] ${ADMIN_INST}: query="${query}" page ${page} failed: ${err?.message}`);
        // Continue — don't abort the whole run on a single page failure
      }
    }

    if (added > 0) {
      console.log(`[scraper] ${ADMIN_INST}: q="${query}" pages 0-${page - 1} → ${added} new`);
    }
  } catch (err: any) {
    console.warn(`[scraper] ${ADMIN_INST}: query="${query}" fetch failed: ${err?.message}`);
  }

  return added;
}

// ── Exported scraper ─────────────────────────────────────────────────────────

export const ostiScraper: InstitutionScraper = {
  institution: ADMIN_INST,
  scraperType: "api",
  tier: 1,

  async scrape(signal?: AbortSignal): Promise<ScrapedListing[]> {
    const results: ScrapedListing[] = [];
    const seen = new Set<number>(); // keyed on osti_id

    for (const query of BIOTECH_QUERIES) {
      if (signal?.aborted) break;
      await fetchQuery(query, seen, results, signal);
    }

    console.log(`[scraper] ${ADMIN_INST}: ${results.length} total listings across ${BIOTECH_QUERIES.length} queries`);
    return results;
  },

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    const results: ScrapedListing[] = [];
    const seen = new Set<number>();
    // Probe using the first query — guaranteed to have results
    await fetchQuery(BIOTECH_QUERIES[0], seen, results);
    const sample = results.slice(0, maxResults);
    const ok = sample.length >= 3 && sample.every((r) => r.title && r.url && r.institution);
    console.log(
      `[scraper] ${ADMIN_INST}: probe ${ok ? "OK" : "PARTIAL"} — ${sample.length} results:`,
      sample.map((r) => `"${r.title.slice(0, 60)}" [${r.institution}]`)
    );
    return sample;
  },
};

// ── Startup self-test (logs results to console for verification) ──────────────
(async () => {
  try {
    await ostiScraper.probe!(3);
  } catch (err: any) {
    console.warn(`[scraper] ${ADMIN_INST}: startup probe error: ${err?.message}`);
  }
})();
