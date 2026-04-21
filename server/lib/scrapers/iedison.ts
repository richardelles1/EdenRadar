import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const INST = "NIH iEdison";
const BASE_URL = "https://iedison.nih.gov";
const SEARCH_PATH = "/iEdison/pubsite/search/doSearch";
const PAGE_TIMEOUT_MS = 30_000;
const ROWS_PER_PAGE = 50;

interface IEdisonRecord {
  title: string;
  institution: string;
  url: string;
  description: string;
  stage?: string;
  technologyId?: string;
  inventors?: string[];
  patentStatus?: string;
}

function parseSearchPage(html: string, baseUrl: string): IEdisonRecord[] {
  const records: IEdisonRecord[] = [];

  const rowRegex = /<tr[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];

    const linkMatch = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(row);
    if (!linkMatch) continue;

    const href = linkMatch[1].trim();
    const titleRaw = linkMatch[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!titleRaw || titleRaw.length < 5) continue;

    const url = href.startsWith("http") ? href : `${baseUrl}${href}`;
    const descMatch = /<td[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(row);
    const description = descMatch ? cleanText(descMatch[1]) : titleRaw;

    records.push({
      title: titleRaw,
      institution: INST,
      url,
      description: description || titleRaw,
    });
  }

  return records;
}

function parseTechListings($html: string): IEdisonRecord[] {
  const records: IEdisonRecord[] = [];

  const cardRegex = /<div[^>]*class="[^"]*tech-item[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class="[^"]*tech-item|$)/gi;
  let m: RegExpExecArray | null;

  while ((m = cardRegex.exec($html)) !== null) {
    const block = m[1];
    const linkM = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!linkM) continue;
    const href = linkM[1].trim();
    const titleRaw = linkM[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!titleRaw || titleRaw.length < 5) continue;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const descM = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
    const description = descM ? cleanText(descM[1]) : titleRaw;
    records.push({ title: titleRaw, institution: INST, url, description: description || titleRaw });
  }

  return records;
}

async function fetchPage(page: number, signal?: AbortSignal): Promise<{ records: IEdisonRecord[]; hasMore: boolean }> {
  const url = `${BASE_URL}${SEARCH_PATH}?searchTerm=&page=${page}&rows=${ROWS_PER_PAGE}&status=available`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0; +https://edenradar.com)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: signal ?? AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn(`[scraper] ${INST}: HTTP ${res.status} for page ${page}`);
      return { records: [], hasMore: false };
    }

    const html = await res.text();

    let records = parseSearchPage(html, BASE_URL);
    if (records.length === 0) {
      records = parseTechListings(html);
    }

    if (records.length === 0 && page === 0) {
      console.warn(`[scraper] ${INST}: page 0 returned no parsed records — HTML structure may have changed`);
    }

    const hasMore = records.length >= ROWS_PER_PAGE;
    return { records, hasMore };
  } catch (err: any) {
    if (err?.name === "AbortError" || err?.name === "TimeoutError") {
      console.warn(`[scraper] ${INST}: page ${page} timed out`);
    } else {
      console.warn(`[scraper] ${INST}: page ${page} error: ${err?.message}`);
    }
    return { records: [], hasMore: false };
  }
}

function toScrapedListing(r: IEdisonRecord): ScrapedListing {
  return {
    title: r.title,
    description: r.description,
    url: r.url,
    institution: r.institution,
    stage: r.stage,
    inventors: r.inventors,
    patentStatus: r.patentStatus,
    technologyId: r.technologyId,
  };
}

export const iEdisonScraper: InstitutionScraper = {
  institution: INST,
  scraperType: "http",
  tier: 3,
  scraperTimeoutMs: 3 * 60 * 1000,

  async scrape(signal?: AbortSignal): Promise<ScrapedListing[]> {
    const all: IEdisonRecord[] = [];
    const seen = new Set<string>();

    try {
      let page = 0;
      const MAX_PAGES = 20;

      while (page < MAX_PAGES) {
        const { records, hasMore } = await fetchPage(page, signal);

        for (const r of records) {
          const key = r.url || r.title;
          if (!seen.has(key)) {
            seen.add(key);
            all.push(r);
          }
        }

        if (!hasMore || records.length === 0) break;
        page++;
      }

      console.log(`[scraper] ${INST}: ${all.length} listings from ${page + 1} page(s)`);
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
    }

    return all.map(toScrapedListing);
  },

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    const { records } = await fetchPage(0);
    return records.slice(0, maxResults).map(toScrapedListing);
  },
};
