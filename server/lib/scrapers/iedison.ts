/**
 * NIH iEdison Technology Transfer Scraper
 *
 * Strategy:
 *  A. IEDISON_API_KEY is SET:
 *     1. Authenticated JSON API -- Bearer token + X-API-Key headers sent with
 *        every request. Full date-range + higher rate limits.
 *     2. On 401/403: logs prominently, then retries without the key (public
 *        JSON API) so data continues to flow while the operator investigates.
 *     3. If JSON API fully unavailable: falls back to HTML scraper.
 *
 *  B. IEDISON_API_KEY is NOT SET:
 *     HTML scraper is used directly (per task spec). Date-range params are
 *     forwarded to the HTML endpoint in case it honours them.
 *
 * Incremental date-range cursor:
 *  fromDate = MAX(last_seen_at) FROM ingested_assets WHERE source_url LIKE
 *  '%iedison.nih.gov%', advanced by 1 second to avoid boundary re-pulls.
 *  Granularity is YYYY-MM-DD (day precision); same-day re-pulls are possible
 *  but harmless -- the ingestion pipeline deduplicates by fingerprint/contentHash.
 *  Falls back to a 12-month hard cap when no records exist yet.
 *
 * Configure by setting the `IEDISON_API_KEY` Replit secret (obtain from NIH:
 *   https://iedison.nih.gov/iEdison/api/v1/publicInventions).
 *
 * Field mapping priority (first non-empty wins):
 *   title          — title | technologyTitle | name
 *   description    — briefDescription | abstract | summary
 *   inventors      — inventorNames | inventors[].name
 *   institution    — assigneeInstitution | organizationName | institutionName
 *   patentStatus   — patentStatus | patentApplicationStatus
 *   technologyId   — technologyId | docketNumber | serialNumber
 *   stage          — developmentStage | stage
 */

import type { InstitutionScraper, ScrapedListing } from "./types";
import { cleanText } from "./utils";
import { scraperDb as db } from "../../scraperDb";
import { sql } from "drizzle-orm";

const INST = "NIH iEdison";
const BASE_URL = "https://iedison.nih.gov";

// iEdison public search endpoint (HTML fallback)
const HTML_SEARCH_PATH = "/iEdison/pubsite/search/doSearch";
// iEdison public API -- public browse works without a key; authenticated
// requests with IEDISON_API_KEY unlock full date-range and higher rate limits.
const API_SEARCH_PATH = "/iEdison/api/v1/publicInventions";

const PAGE_TIMEOUT_MS = 30_000;
const ROWS_PER_PAGE = 50;
const MAX_PAGES = 20;

// Hard cap on how far back we look when there is no prior run on record.
const MAX_LOOKBACK_MONTHS = 12;

/**
 * Return the API key from the environment, or undefined if not configured.
 * Both `IEDISON_API_KEY` (Replit secret) and the plain env var are accepted.
 */
function getApiKey(): string | undefined {
  return process.env.IEDISON_API_KEY || undefined;
}

// ── Shared field normalisation ────────────────────────────────────────────────

function pickFirst<T>(...candidates: (T | undefined | null)[]): T | undefined {
  for (const c of candidates) {
    if (c !== undefined && c !== null && c !== "") return c;
  }
  return undefined;
}

function parseInventors(raw: unknown): string[] | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") {
    const parts = raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts : undefined;
  }
  if (Array.isArray(raw)) {
    const names = raw
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const obj = item as Record<string, string>;
          return (obj.name ?? obj.fullName ?? obj.inventorName ?? "").trim();
        }
        return "";
      })
      .filter(Boolean);
    return names.length > 0 ? names : undefined;
  }
  return undefined;
}

function mapJsonRecord(r: Record<string, any>, baseUrl: string): ScrapedListing | null {
  const title = cleanText(
    pickFirst(r.technologyTitle, r.title, r.name, r.docketNumber)
  );
  if (!title || title.length < 5) return null;

  const urlPath = pickFirst(r.detailUrl, r.url, r.publicUrl);
  const url = urlPath
    ? (urlPath.startsWith("http") ? urlPath : `${baseUrl}${urlPath}`)
    : `${baseUrl}${HTML_SEARCH_PATH}`;

  const description = cleanText(
    pickFirst(r.briefDescription, r.abstract, r.summary, r.description, title)
  ) || title;

  const institution = cleanText(
    pickFirst(r.assigneeInstitution, r.organizationName, r.institutionName, r.institution)
  ) || INST;

  const inventors = parseInventors(
    pickFirst(r.inventorNames, r.inventors, r.inventorList)
  );

  const patentStatus = cleanText(
    pickFirst(r.patentStatus, r.patentApplicationStatus, r.ipStatus)
  );

  const technologyId = cleanText(
    pickFirst(r.technologyId, r.docketNumber, r.serialNumber, r.referenceNumber)
  );

  const stage = cleanText(pickFirst(r.developmentStage, r.stage, r.trlLevel));

  return { title, description, url, institution, inventors, patentStatus, technologyId, stage };
}

// ── JSON API fetch ─────────────────────────────────────────────────────────────

/**
 * Query the iEdison JSON API.
 * Supports date-range filtering via `fromDate`/`toDate` (YYYY-MM-DD)
 * and optional institution-aware filtering via `institution` (e.g. "NIH").
 * When `institution` is omitted the API returns all public institutions.
 * When `apiKey` is provided it is sent as a Bearer token (authenticated mode
 * unlocks full date-range access and higher rate limits).
 */
async function fetchJsonPage(
  page: number,
  signal?: AbortSignal,
  fromDate?: string,
  toDate?: string,
  institution?: string,
  apiKey?: string,
): Promise<{ records: ScrapedListing[]; hasMore: boolean; apiAvailable: boolean; authError?: boolean }> {
  const params = new URLSearchParams({
    page: String(page),
    size: String(ROWS_PER_PAGE),
    status: "available",
  });
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  if (institution) params.set("institution", institution);

  const url = `${BASE_URL}${API_SEARCH_PATH}?${params.toString()}`;

  const headers: Record<string, string> = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0; +https://edenradar.com)",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["X-API-Key"] = apiKey;
  }

  try {
    const res = await fetch(url, {
      headers,
      signal: signal ?? AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });

    if (res.status === 404) {
      // Endpoint not found -- signal fallback
      return { records: [], hasMore: false, apiAvailable: false };
    }
    if (res.status === 401 || res.status === 403) {
      if (apiKey) {
        // Key was provided but rejected -- signal auth failure so the caller
        // can handle it explicitly (logged + propagated, not silently dropped).
        return { records: [], hasMore: false, apiAvailable: false, authError: true };
      }
      // No key -- API requires auth; signal fallback
      return { records: [], hasMore: false, apiAvailable: false };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("json")) {
      return { records: [], hasMore: false, apiAvailable: false };
    }

    const data = await res.json();

    // Handle both paginated wrapper objects and bare arrays
    const rawList: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data.content)
      ? data.content
      : Array.isArray(data.results)
      ? data.results
      : Array.isArray(data.technologies)
      ? data.technologies
      : [];

    const records: ScrapedListing[] = rawList
      .map((r) => mapJsonRecord(r as Record<string, any>, BASE_URL))
      .filter((r): r is ScrapedListing => r !== null);

    const hasMore = rawList.length >= ROWS_PER_PAGE;
    return { records, hasMore, apiAvailable: true };
  } catch (err: any) {
    if (err?.name === "AbortError" || err?.name === "TimeoutError") {
      console.warn(`[scraper] ${INST}: JSON API page ${page} timed out`);
    }
    // Network error or unexpected format — fall through to HTML
    return { records: [], hasMore: false, apiAvailable: false };
  }
}

// ── HTML fallback ─────────────────────────────────────────────────────────────

function parseHtmlResults(html: string, baseUrl: string): ScrapedListing[] {
  const records: ScrapedListing[] = [];
  const seen = new Set<string>();

  // Strategy 1: result-row table pattern
  const rowRegex = /<tr[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];
    const linkMatch = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(row);
    if (!linkMatch) continue;
    const href = linkMatch[1].trim();
    const titleRaw = cleanText(linkMatch[2]);
    if (!titleRaw || titleRaw.length < 5) continue;
    const url = href.startsWith("http") ? href : `${baseUrl}${href}`;
    if (seen.has(url)) continue;
    seen.add(url);

    const descMatch = /<td[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(row);
    const description = descMatch ? cleanText(descMatch[1]) : titleRaw;

    // Extract inventors from metadata cells
    const inventorMatch = /<td[^>]*class="[^"]*inventor[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(row);
    const inventorRaw = inventorMatch ? cleanText(inventorMatch[1]) : undefined;
    const inventors = inventorRaw ? parseInventors(inventorRaw) : undefined;

    // Extract patent status
    const patentMatch = /<td[^>]*class="[^"]*patent[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(row);
    const patentStatus = patentMatch ? cleanText(patentMatch[1]) : undefined;

    // Extract institution / assignee
    const instMatch = /<td[^>]*class="[^"]*(?:institution|assignee|owner)[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(row);
    const institution = instMatch ? cleanText(instMatch[1]) : INST;

    // Extract technology ID
    const idMatch = /(?:docket|ref|id)[^:]*:\s*([A-Z0-9\-\/]+)/i.exec(row);
    const technologyId = idMatch ? idMatch[1].trim() : undefined;

    records.push({ title: titleRaw, description: description || titleRaw, url, institution, inventors, patentStatus, technologyId });
  }

  // Strategy 2: tech-item card pattern (alternate layout)
  if (records.length === 0) {
    const cardRegex = /<div[^>]*class="[^"]*tech-item[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*tech-item|$)/gi;
    let m: RegExpExecArray | null;
    while ((m = cardRegex.exec(html)) !== null) {
      const block = m[1];
      const linkM = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
      if (!linkM) continue;
      const href = linkM[1].trim();
      const titleRaw = cleanText(linkM[2]);
      if (!titleRaw || titleRaw.length < 5) continue;
      const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
      if (seen.has(url)) continue;
      seen.add(url);
      const descM = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
      const description = descM ? cleanText(descM[1]) : titleRaw;

      const invM = /inventors?\s*:\s*([^<\n]{3,80})/i.exec(block);
      const inventors = invM ? parseInventors(invM[1]) : undefined;

      const ptM = /patent\s*(?:status|no|number)?\s*:\s*([^<\n]{2,60})/i.exec(block);
      const patentStatus = ptM ? ptM[1].trim() : undefined;

      const instM = /(?:institution|assignee)\s*:\s*([^<\n]{3,80})/i.exec(block);
      const institution = instM ? cleanText(instM[1]) : INST;

      records.push({ title: titleRaw, description: description || titleRaw, url, institution, inventors, patentStatus });
    }
  }

  return records;
}

async function fetchHtmlPage(
  page: number,
  signal?: AbortSignal,
  institution?: string,
  fromDate?: string,
  toDate?: string,
): Promise<{ records: ScrapedListing[]; hasMore: boolean }> {
  // iEdison HTML search -- include date-range params so the server can honour
  // them if supported; params are silently ignored by older HTML endpoints but
  // still present so no out-of-window records are returned when the server does
  // honour them.
  const params = new URLSearchParams({
    searchTerm: "",
    page: String(page),
    rows: String(ROWS_PER_PAGE),
    status: "available",
  });
  if (institution) params.set("institution", institution);
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  const url = `${BASE_URL}${HTML_SEARCH_PATH}?${params.toString()}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0; +https://edenradar.com)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: signal ?? AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn(`[scraper] ${INST}: HTML HTTP ${res.status} for page ${page}`);
      return { records: [], hasMore: false };
    }

    const html = await res.text();
    const records = parseHtmlResults(html, BASE_URL);

    if (records.length === 0 && page === 0) {
      console.warn(`[scraper] ${INST}: page 0 returned no parsed records — HTML layout may have changed`);
    }

    return { records, hasMore: records.length >= ROWS_PER_PAGE };
  } catch (err: any) {
    if (err?.name === "AbortError" || err?.name === "TimeoutError") {
      console.warn(`[scraper] ${INST}: HTML page ${page} timed out`);
    } else {
      console.warn(`[scraper] ${INST}: HTML page ${page} error: ${err?.message}`);
    }
    return { records: [], hasMore: false };
  }
}

// ── InstitutionScraper export ─────────────────────────────────────────────────

export const iEdisonScraper: InstitutionScraper = {
  institution: INST,
  scraperType: "http",
  tier: 3,
  scraperTimeoutMs: 3 * 60 * 1000,

  async scrape(signal?: AbortSignal): Promise<ScrapedListing[]> {
    const all: ScrapedListing[] = [];
    const seen = new Set<string>();

    const addUnique = (listing: ScrapedListing) => {
      const key = listing.url || listing.title;
      if (!seen.has(key)) { seen.add(key); all.push(listing); }
    };

    const apiKey = getApiKey();

    // ── Compute date-range ──────────────────────────────────────────────────
    // Default cap: last MAX_LOOKBACK_MONTHS months (no unbounded backfill).
    const toDate = new Date();
    const hardCap = new Date(toDate);
    hardCap.setMonth(hardCap.getMonth() - MAX_LOOKBACK_MONTHS);

    // Incremental mode: use MAX(last_seen_at) from ingested_assets for records
    // that came from the iEdison site (matched by source_url domain). This is
    // more accurate than institution name because iEdison records are stored with
    // the extracted assignee institution (e.g. "Harvard Medical School"), not the
    // scraper name "NIH iEdison". Source URL is the stable per-record identity.
    // Falls back to the hard cap on the first run or on DB error.
    let fromDate = hardCap;
    try {
      const result = await db.execute(
        sql`SELECT MAX(last_seen_at) AS max_last_seen
            FROM ingested_assets
            WHERE source_url LIKE ${`%${BASE_URL.replace("https://", "")}%`}`
      );
      const maxLastSeen = (result.rows as any[])[0]?.max_last_seen;
      if (maxLastSeen) {
        const lastIngest = new Date(maxLastSeen);
        // Advance by one second to avoid re-pulling records at the exact
        // same timestamp boundary on back-to-back runs.
        lastIngest.setSeconds(lastIngest.getSeconds() + 1);
        // Use lastIngest only if it's more recent than the hard cap and in the past
        if (lastIngest > hardCap && lastIngest < toDate) {
          fromDate = lastIngest;
        }
      }
    } catch (err: any) {
      console.warn(`[scraper] ${INST}: could not query last_seen_at for incremental date -- using hard cap: ${err?.message}`);
    }

    const fromDateStr = fromDate.toISOString().slice(0, 10);  // YYYY-MM-DD
    const toDateStr = toDate.toISOString().slice(0, 10);
    const mode = apiKey ? "authenticated" : "public";
    const isIncremental = fromDate > hardCap;

    console.log(
      `[scraper] ${INST}: starting ${mode} scrape ` +
      `(${isIncremental ? "incremental" : "full"} window: ${fromDateStr} to ${toDateStr})` +
      (apiKey ? "" : " -- set IEDISON_API_KEY for authenticated access")
    );

    let usedPath = "html";
    let page = 0;

    if (apiKey) {
      // ── Authenticated JSON API path ───────────────────────────────────────
      // IEDISON_API_KEY is configured: use authenticated REST endpoint.
      // On auth failure, log prominently and continue with best-effort public
      // JSON API so data keeps flowing while the operator investigates.
      let apiAvailable = true;
      let apiAuthFailed = false;

      while (page < MAX_PAGES && apiAvailable) {
        const { records, hasMore, apiAvailable: stillUp, authError } = await fetchJsonPage(
          page, signal, fromDateStr, toDateStr, undefined, apiKey
        );
        if (authError) {
          console.error(
            `[scraper] ${INST}: IEDISON_API_KEY rejected (HTTP 401/403) -- ` +
            `check the key is valid and not expired. ` +
            `Attempting public (no-auth) JSON API as fallback.`
          );
          apiAuthFailed = true;
          apiAvailable = false;
          break;
        }
        apiAvailable = stillUp;
        if (!apiAvailable) break;
        records.forEach(addUnique);
        if (!hasMore || records.length === 0) break;
        page++;
      }

      if (apiAuthFailed) {
        // Phase 1b: public JSON API retry after key rejection
        page = 0;
        let publicApiAvailable = true;
        while (page < MAX_PAGES && publicApiAvailable) {
          const { records, hasMore, apiAvailable: stillUp } = await fetchJsonPage(
            page, signal, fromDateStr, toDateStr, undefined, undefined
          );
          publicApiAvailable = stillUp;
          if (!publicApiAvailable) break;
          records.forEach(addUnique);
          if (!hasMore || records.length === 0) break;
          page++;
        }
        apiAvailable = publicApiAvailable;
      }

      if (apiAvailable || all.length > 0) {
        usedPath = apiAuthFailed ? "JSON API (public, after key rejection)" : "JSON API (authenticated)";
      } else {
        // JSON API fully unavailable -- fall through to HTML
        console.log(`[scraper] ${INST}: JSON API unavailable -- falling back to HTML scraping`);
      }
    }

    if (usedPath === "html") {
      // ── HTML scraper path ─────────────────────────────────────────────────
      // Used when: (a) no IEDISON_API_KEY configured, OR (b) JSON API fully unavailable.
      // Per task spec, when no key is configured the HTML interface is the primary path.
      // Date-range params are forwarded in case the HTML interface honours them.
      // NOTE: fromDate/toDate are YYYY-MM-DD (day granularity). Records created on
      // the same day as the cursor may be re-pulled; upsert deduplication in the
      // ingestion pipeline prevents double-counting.
      page = 0;
      while (page < MAX_PAGES) {
        const { records, hasMore } = await fetchHtmlPage(page, signal, undefined, fromDateStr, toDateStr);
        records.forEach(addUnique);
        if (!hasMore || records.length === 0) break;
        page++;
      }
    }

    console.log(
      `[scraper] ${INST}: ${all.length} listings from ${page + 1} page(s) ` +
      `via ${usedPath} ` +
      `(${isIncremental ? "incremental" : "full"} window: ${fromDateStr} to ${toDateStr})`
    );

    return all;
  },

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    const { records, apiAvailable } = await fetchJsonPage(0);
    if (apiAvailable && records.length > 0) return records.slice(0, maxResults);
    const { records: htmlRecords } = await fetchHtmlPage(0);
    return htmlRecords.slice(0, maxResults);
  },
};
