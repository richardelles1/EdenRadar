import { createFlintboxScraper } from "./flintbox";
import { fetchHtml, cleanText } from "./utils";
import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "University of Michigan";

const ELUCID_BASE = "https://available-inventions.umich.edu";
const ELUCID_ITEMS_PER_PAGE = 100;

const flintbox = createFlintboxScraper(
  { slug: "umich", orgId: 12, accessKey: "b13dccc5-1084-40f7-a666-1b68e9e69ba1" },
  INST
);

interface ElucidItem {
  name: string;
  slug: string;
}

interface ElucidResponse {
  page: number;
  pages: number;
  total: number;
  items: ElucidItem[];
}

async function scrapeElucid(): Promise<ScrapedListing[]> {
  const results: ScrapedListing[] = [];
  let page = 1;

  try {
    while (true) {
      const params = new URLSearchParams();
      params.append("columns[]", "name");
      params.append("columns[]", "slug");
      params.append("page", String(page));
      params.append("itemsPerPage", String(ELUCID_ITEMS_PER_PAGE));

      const res = await fetch(
        `${ELUCID_BASE}/client/products/search?${params.toString()}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)",
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(20_000),
        }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: ElucidResponse = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];

      for (const item of items) {
        if (!item.name || !item.slug) continue;
        results.push({
          title: item.name.trim(),
          description: "",
          url: `${ELUCID_BASE}/product/${item.slug}`,
          institution: INST,
        });
      }

      if (page >= data.pages || items.length === 0) break;
      page++;
    }
  } catch (err: any) {
    console.warn(
      `[scraper] ${INST}: Elucid API failed (${err?.message}) — falling back to other sources`
    );
    return [];
  }

  return results;
}

async function scrapeTechtransfer(): Promise<ScrapedListing[]> {
  const base = "https://techtransfer.umich.edu";
  const results: ScrapedListing[] = [];
  const seen = new Set<string>();

  async function harvest(url: string) {
    const $ = await fetchHtml(url);
    if (!$) return;
    $("a[href*='/technologies/']").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const title = cleanText($(el).text());
      if (!title || title.length < 8 || seen.has(title)) return;
      seen.add(title);
      results.push({
        title,
        description: "",
        url: href.startsWith("http") ? href : `${base}${href}`,
        institution: INST,
      });
    });
  }

  await harvest(`${base}/technologies`);
  return results;
}

async function scrapeInnovationPartnerships(): Promise<ScrapedListing[]> {
  const base = "https://innovationpartnerships.umich.edu";
  const results: ScrapedListing[] = [];
  const seen = new Set<string>();

  for (const path of ["/for-industry/available-technologies/", "/technologies/", "/"]) {
    try {
      const $ = await fetchHtml(`${base}${path}`, 15_000);
      if (!$) continue;
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") ?? "";
        if (!href.includes("/technolog") && !href.includes("/available-")) return;
        if (href === path || href.endsWith("/available-technologies/")) return;
        const title = cleanText($(el).text());
        if (!title || title.length < 8 || seen.has(title)) return;
        seen.add(title);
        results.push({
          title,
          description: "",
          url: href.startsWith("http") ? href : `${base}${href}`,
          institution: INST,
        });
      });
      if (results.length > 0) return results;
    } catch {
      continue;
    }
  }

  return results;
}

export const umichScraper: InstitutionScraper = {
  institution: INST,

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    try {
      const params = new URLSearchParams();
      params.append("columns[]", "name");
      params.append("columns[]", "slug");
      params.append("page", "1");
      params.append("itemsPerPage", String(maxResults));

      const res = await fetch(
        `${ELUCID_BASE}/client/products/search?${params.toString()}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)",
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ElucidResponse = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      return items.slice(0, maxResults).flatMap((item) => {
        if (!item.name || !item.slug) return [];
        return [{ title: item.name.trim(), description: "", url: `${ELUCID_BASE}/product/${item.slug}`, institution: INST }];
      });
    } catch {
      return [];
    }
  },

  async scrape(): Promise<ScrapedListing[]> {
    const elucidResults = await scrapeElucid();
    if (elucidResults.length > 0) {
      console.log(`[scraper] ${INST}: ${elucidResults.length} listings via available-inventions.umich.edu (Elucid)`);
      return elucidResults;
    }

    const flintboxResults = await flintbox.scrape();
    if (flintboxResults.length > 0) return flintboxResults;

    const ttResults = await scrapeTechtransfer();
    if (ttResults.length > 0) {
      console.log(`[scraper] ${INST}: ${ttResults.length} listings via techtransfer.umich.edu`);
      return ttResults;
    }

    const ipResults = await scrapeInnovationPartnerships();
    if (ipResults.length > 0) {
      console.log(`[scraper] ${INST}: ${ipResults.length} listings via innovationpartnerships.umich.edu`);
      return ipResults;
    }

    console.log(`[scraper] ${INST}: 0 results from all sources`);
    return [];
  },
};
