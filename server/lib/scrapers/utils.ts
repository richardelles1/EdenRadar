import * as cheerio from "cheerio";

export async function fetchHtml(url: string, timeoutMs = 15000): Promise<cheerio.CheerioAPI | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/1.0; +https://edenradar.io)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[scraper] HTTP ${res.status} for ${url}`);
      return null;
    }
    const html = await res.text();
    return cheerio.load(html);
  } catch (err: any) {
    console.warn(`[scraper] Fetch failed for ${url}: ${err?.message ?? err}`);
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
