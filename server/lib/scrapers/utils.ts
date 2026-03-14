import * as cheerio from "cheerio";

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
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
        console.warn(`[scraper] Retry ${attempt + 1}/${maxRetries} for ${label} after ${Math.round(delay)}ms: ${err?.message}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

export async function fetchHtml(
  url: string,
  timeoutMs = 8000,
  externalSignal?: AbortSignal,
  retries = 2
): Promise<cheerio.CheerioAPI | null> {
  if (externalSignal?.aborted) return null;
  try {
    return await withRetry(async () => {
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
        cleanup();
        if (res.status === 429) {
          throw new Error(`HTTP 429 rate limited`);
        }
        if (!res.ok) {
          console.warn(`[scraper] HTTP ${res.status} for ${url}`);
          return null;
        }
        const html = await res.text();
        return cheerio.load(html);
      } catch (err: any) {
        cleanup();
        throw err;
      }
    }, retries, 1000, url);
  } catch (err: any) {
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
        cleanup();
        if (res.status === 429) {
          throw new Error(`HTTP 429 rate limited`);
        }
        if (!res.ok) {
          console.warn(`[scraper] HTTP ${res.status} for ${url}`);
          return null;
        }
        return await res.json() as T;
      } catch (err: any) {
        cleanup();
        throw err;
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
