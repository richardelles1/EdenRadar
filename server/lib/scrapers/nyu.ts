import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const BASE = "https://license.tov.med.nyu.edu";
const INST = "NYU Langone";
const SEARCH_URL = `${BASE}/client/products/search`;
const ITEMS_PER_PAGE = 300;

interface NyuProduct {
  url: string;
  name: string;
  shortDescription: string | null;
}

export const nyuScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const params = new URLSearchParams({
        page: "1",
        orderBy: "2",
        itemsPerPage: String(ITEMS_PER_PAGE),
        "columns[]": "url",
      });
      params.append("columns[]", "name");
      params.append("columns[]", "shortDescription");

      const firstRes = await fetch(`${SEARCH_URL}?${params}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!firstRes.ok) throw new Error(`API HTTP ${firstRes.status}`);
      const firstData = await firstRes.json();

      let allProducts: NyuProduct[] = (firstData.items ?? []).filter(
        (p: any) => p && p.url && p.name
      );
      const totalPages = firstData.pages ?? 1;

      for (let pg = 2; pg <= totalPages; pg++) {
        const pgParams = new URLSearchParams({
          page: String(pg),
          orderBy: "2",
          itemsPerPage: String(ITEMS_PER_PAGE),
          "columns[]": "url",
        });
        pgParams.append("columns[]", "name");
        pgParams.append("columns[]", "shortDescription");

        try {
          const pgRes = await fetch(`${SEARCH_URL}?${pgParams}`, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)",
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(15_000),
          });
          if (!pgRes.ok) continue;
          const pgData = await pgRes.json();
          const items = (pgData.items ?? []).filter(
            (p: any) => p && p.url && p.name
          );
          allProducts = allProducts.concat(items);
        } catch {
          console.warn(`[scraper] ${INST}: page ${pg} fetch failed, continuing`);
        }
      }

      const seen = new Set<string>();
      const results: ScrapedListing[] = [];

      for (const p of allProducts) {
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

      console.log(`[scraper] ${INST}: ${results.length} listings from API, enriching details...`);

      const DETAIL_BATCH = 10;
      for (let i = 0; i < results.length; i += DETAIL_BATCH) {
        const batch = results.slice(i, i + DETAIL_BATCH);
        await Promise.all(
          batch.map(async (item) => {
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
