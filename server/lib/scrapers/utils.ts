import * as cheerio from "cheerio";

/** Thrown when the target site returns a non-OK HTTP status on a critical fetch.
 * Unlike generic network errors, this carries the exact HTTP status code so
 * the ingestion pipeline can record a specific failure reason (e.g. "HTTP 503")
 * and the health dashboard can show "Site down" vs "Rate limited" vs "Blocked". */
export class SiteHttpError extends Error {
  constructor(public readonly status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = "SiteHttpError";
  }
}

// ── Global outbound-HTTP semaphore ────────────────────────────────────────────
// Caps the total number of concurrent outbound fetch() calls across ALL scrapers
// so that running two institutions simultaneously (MAX_HTTP_CONCURRENT=2) does
// not generate 20+ simultaneous connections and trigger rate-limiting at TTO sites.
const MAX_CONCURRENT_FETCH = 8;
let _fetchSlots = MAX_CONCURRENT_FETCH;
const _fetchQueue: Array<{ resolve: () => void; reject: (e: unknown) => void }> = [];

function acquireFetchSlot(signal?: AbortSignal): Promise<void> {
  if (_fetchSlots > 0) {
    _fetchSlots--;
    return Promise.resolve();
  }
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<void>((resolve, reject) => {
    const entry = { resolve, reject };
    _fetchQueue.push(entry);
    signal?.addEventListener("abort", () => {
      const idx = _fetchQueue.indexOf(entry);
      if (idx !== -1) _fetchQueue.splice(idx, 1);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function releaseFetchSlot(): void {
  const next = _fetchQueue.shift();
  if (next) {
    next.resolve();
  } else {
    _fetchSlots++;
  }
}

function combineSignal(timeoutMs: number, external?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = external
    ? AbortSignal.any([timeoutSignal, external])
    : timeoutSignal;

  return { signal, cleanup: () => {} };
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number,
  label: string
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (err?.name === "AbortError") throw err;
      if (err instanceof SiteHttpError) throw err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
        console.warn(`[scraper] Retry ${attempt + 1}/${maxRetries} for ${label} after ${Math.round(delay)}ms: ${err?.message}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

/** Fetch and parse HTML from a URL.
 * @param strict - When true, throws SiteHttpError for non-OK HTTP responses
 *   instead of returning null. Use on first-page / critical fetches where a
 *   non-OK status should be surfaced as a named failure reason. */
export async function fetchHtml(
  url: string,
  timeoutMs = 8000,
  externalSignal?: AbortSignal,
  retries = 2,
  strict = false
): Promise<cheerio.CheerioAPI | null> {
  if (externalSignal?.aborted) return null;
  try {
    return await withRetry(async () => {
      await acquireFetchSlot(externalSignal);
      const { signal, cleanup } = combineSignal(timeoutMs, externalSignal);
      try {
        const res = await fetch(url, {
          signal,
          redirect: "follow",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });
        if (res.status === 429) {
          // Strict mode (first-page / critical fetch): surface as named SiteHttpError
          // so the ingestion pipeline captures "rate_limited" health status.
          // Non-strict (pagination pages): throw plain Error so withRetry still
          // retries and, after exhausting retries, fetchHtml returns null gracefully
          // without aborting the whole scrape run.
          if (strict) throw new SiteHttpError(429, url);
          throw new Error(`HTTP 429 rate limited`);
        }
        if (!res.ok) {
          if (strict) throw new SiteHttpError(res.status, url);
          console.warn(`[scraper] HTTP ${res.status} for ${url}`);
          return null;
        }
        const html = await res.text();
        return cheerio.load(html);
      } finally {
        cleanup();
        releaseFetchSlot();
      }
    }, retries, 1000, url);
  } catch (err: any) {
    if (err instanceof SiteHttpError) throw err;
    if (err?.name !== "AbortError") {
      console.warn(`[scraper] Fetch failed for ${url}: ${err?.message ?? err}`);
    }
    return null;
  }
}

export async function fetchJson<T = any>(
  url: string,
  timeoutMs = 10000,
  externalSignal?: AbortSignal,
  retries = 2
): Promise<T | null> {
  if (externalSignal?.aborted) return null;
  try {
    return await withRetry(async () => {
      await acquireFetchSlot(externalSignal);
      const { signal, cleanup } = combineSignal(timeoutMs, externalSignal);
      try {
        const res = await fetch(url, {
          signal,
          redirect: "follow",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json, text/plain, */*",
          },
        });
        if (res.status === 429) {
          throw new Error(`HTTP 429 rate limited`);
        }
        if (!res.ok) {
          console.warn(`[scraper] HTTP ${res.status} for ${url}`);
          return null;
        }
        return await res.json() as T;
      } finally {
        cleanup();
        releaseFetchSlot();
      }
    }, retries, 1000, url);
  } catch (err: any) {
    if (err?.name !== "AbortError") {
      console.warn(`[scraper] JSON fetch failed for ${url}: ${err?.message ?? err}`);
    }
    return null;
  }
}

export function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function resolveUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

export function extractText($: cheerio.CheerioAPI, selectors: string[]): string {
  for (const sel of selectors) {
    const el = $(sel);
    if (el.length > 0) {
      const text = cleanText(el.text());
      if (text.length > 20) return text;
    }
  }
  return "";
}

export function extractList($: cheerio.CheerioAPI, selectors: string[]): string[] {
  for (const sel of selectors) {
    const items: string[] = [];
    $(sel).each((_, el) => {
      const text = cleanText($(el).text());
      if (text) items.push(text);
    });
    if (items.length > 0) return items;
  }
  return [];
}

/**
 * Fetch an HTML page through the egress proxy defined by SCRAPER_PROXY_URL.
 * Returns null immediately if SCRAPER_PROXY_URL is not configured — does NOT
 * fall back to a direct fetch, because the sites that require this function
 * (DOE national labs etc.) block Replit egress IPs and would hang until the
 * per-request timeout fires, wasting the entire scraper timeout budget.
 *
 * Set SCRAPER_PROXY_URL to the deployed Cloudflare Worker URL from
 * server/lib/scrapers/cloudflare-proxy/worker.js before running these scrapers.
 */
let _proxyWarnedOnce = false;
export async function fetchHtmlViaProxy(
  url: string,
  timeoutMs = 15_000,
  externalSignal?: AbortSignal,
): Promise<cheerio.CheerioAPI | null> {
  const proxyBase = process.env.SCRAPER_PROXY_URL?.trim();

  if (!proxyBase) {
    if (!_proxyWarnedOnce) {
      console.warn(`[scraper] SCRAPER_PROXY_URL not configured — proxy-required scrapers (DOE labs etc.) will return 0 results. Set the env var to enable them.`);
      _proxyWarnedOnce = true;
    }
    return null;
  }

  const proxyUrl = `${proxyBase}?url=${encodeURIComponent(url)}`;

  try {
    const { signal, cleanup } = combineSignal(timeoutMs, externalSignal);
    try {
      const res = await fetch(proxyUrl, {
        signal,
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      cleanup();
      if (!res.ok) {
        console.warn(`[scraper] Proxy returned HTTP ${res.status} for ${url}`);
        return null;
      }
      const html = await res.text();
      return cheerio.load(html);
    } catch (err: any) {
      cleanup();
      throw err;
    }
  } catch (err: any) {
    console.warn(`[scraper] Proxy fetch failed for ${url}: ${err?.message ?? err}`);
    return null;
  }
}
