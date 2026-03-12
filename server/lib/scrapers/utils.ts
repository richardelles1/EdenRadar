import * as cheerio from "cheerio";

function combineSignal(timeoutMs: number, external?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = external
    ? AbortSignal.any([timeoutSignal, external])
    : timeoutSignal;

  return { signal, cleanup: () => {} };
}

export async function fetchHtml(
  url: string,
  timeoutMs = 8000,
  externalSignal?: AbortSignal
): Promise<cheerio.CheerioAPI | null> {
  if (externalSignal?.aborted) return null;
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
    if (!res.ok) {
      console.warn(`[scraper] HTTP ${res.status} for ${url}`);
      return null;
    }
    const html = await res.text();
    return cheerio.load(html);
  } catch (err: any) {
    cleanup();
    if (err?.name !== "AbortError") {
      console.warn(`[scraper] Fetch failed for ${url}: ${err?.message ?? err}`);
    }
    return null;
  }
}

export async function fetchJson<T = any>(
  url: string,
  timeoutMs = 10000,
  externalSignal?: AbortSignal
): Promise<T | null> {
  if (externalSignal?.aborted) return null;
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
    if (!res.ok) {
      console.warn(`[scraper] HTTP ${res.status} for ${url}`);
      return null;
    }
    return await res.json() as T;
  } catch (err: any) {
    cleanup();
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
