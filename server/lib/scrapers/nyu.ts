import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const BASE = "https://license.tov.med.nyu.edu";
const INST = "NYU Langone";
const SEARCH_URL = `${BASE}/client/products/search`;

/**
 * NYU Langone — Elucid platform
 *
 * The /client/products/search API returns product metadata only when the
 * `columns[]` parameter is supplied (without it, `items` comes back as an
 * array of empty sub-arrays regardless of other params).  itemsPerPage=300
 * returns all 245 listings in a single page-1 request.
 *
 * Fallback: if the primary call ever returns 0 items (e.g. API contract
 * changes) we fall back to an alpha keyword sweep (a–z) which also works
 * with columns[] and covers the full corpus with overlap — dedup handles it.
 */
async function fetchNyuPage(
  page: number,
  itemsPerPage: number,
  keyword?: string
): Promise<{ total: number; pages: number; items: any[] }> {
  const params = new URLSearchParams({
    page: String(page),
    orderBy: "2",
    itemsPerPage: String(itemsPerPage),
  });
  params.append("columns[]", "url");
  params.append("columns[]", "name");
  params.append("columns[]", "shortDescription");
  if (keyword) params.append("keyword", keyword);

  const res = await fetch(`${SEARCH_URL}?${params}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`API HTTP ${res.status}`);
  const data = await res.json();
  return {
    total: data.total ?? 0,
    pages: data.pages ?? 1,
    items: (data.items ?? []).filter((p: any) => p?.url && p?.name),
  };
}

async function primarySweep(): Promise<any[]> {
  const first = await fetchNyuPage(1, 300);
  const all: any[] = [...first.items];
  for (let pg = 2; pg <= first.pages; pg++) {
    try {
      const { items } = await fetchNyuPage(pg, 300);
      all.push(...items);
    } catch {
      console.warn(`[scraper] ${INST}: page ${pg} failed, skipping`);
    }
  }
  return all;
}

async function alphaSweep(): Promise<any[]> {
  const alphabet = "abcdefghijklmnopqrstuvwxyz".split("");
  const all: any[] = [];
  for (const letter of alphabet) {
    try {
      const { items } = await fetchNyuPage(1, 300, letter);
      all.push(...items);
    } catch {
      console.warn(`[scraper] ${INST}: alpha sweep '${letter}' failed`);
    }
  }
  return all;
}

export const nyuScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      let rawProducts = await primarySweep();

      if (rawProducts.length === 0) {
        console.warn(`[scraper] ${INST}: primary sweep returned 0, trying alpha fallback`);
        rawProducts = await alphaSweep();
      }

      const seen = new Set<string>();
      const results: ScrapedListing[] = [];

      for (const p of rawProducts) {
        const title = (p.name ?? "").trim();
        if (!title || seen.has(title)) continue;
        seen.add(title);
        const url = p.url.startsWith("/") ? `${BASE}${p.url}` : p.url;
        results.push({
          title,
          description: (p.shortDescription ?? "").trim() || title,
          url,
          institution: INST,
        });
      }

      console.log(`[scraper] ${INST}: ${results.length} listings, enriching detail pages...`);

      const BATCH = 10;
      for (let i = 0; i < results.length; i += BATCH) {
        await Promise.all(
          results.slice(i, i + BATCH).map(async (item) => {
            try {
              const $ = await fetchHtml(item.url, 12_000);
              if (!$) return;
              const bodyText = cleanText(
                $(".product-description-box .description").text() ||
                $("#product-detail .description").text() ||
                $("main .container p").first().text()
              );
              if (bodyText && bodyText.length > item.description.length) {
                item.description = bodyText.slice(0, 2000);
              }
            } catch {}
          })
        );
      }

      console.log(`[scraper] ${INST}: ${results.length} listings (detail-enriched)`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
