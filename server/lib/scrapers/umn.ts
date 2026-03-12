import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "University of Minnesota";
const API_BASE = "https://license.umn.edu/client/products/search";
const PRODUCT_BASE = "https://license.umn.edu/product";

interface UMNProduct {
  name: string;
  slug: string;
}

interface UMNResponse {
  page: number;
  pages: number;
  total: number;
  items: UMNProduct[];
}

async function fetchPage(page: number): Promise<UMNResponse> {
  const params = new URLSearchParams({
    page: String(page),
    itemsPerPage: "20",
    orderBy: "0",
  });
  params.append("columns[]", "name");
  params.append("columns[]", "slug");

  const res = await fetch(`${API_BASE}?${params.toString()}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)",
      Accept: "application/json",
      Referer: "https://license.umn.edu/products",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<UMNResponse>;
}

export const umnScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching products via elucid REST API...`);
    try {
      const first = await fetchPage(1);
      const totalPages = first.pages;
      console.log(`[scraper] ${INST}: ${first.total} total products across ${totalPages} pages`);

      const allItems: UMNProduct[] = [...first.items];

      const remaining = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
      for (let i = 0; i < remaining.length; i += 5) {
        const batch = remaining.slice(i, i + 5);
        const results = await Promise.all(batch.map((p) => fetchPage(p)));
        for (const r of results) allItems.push(...r.items);
      }

      const seen = new Set<string>();
      const listings: ScrapedListing[] = [];
      for (const item of allItems) {
        if (!item.slug || !item.name || seen.has(item.slug)) continue;
        seen.add(item.slug);
        listings.push({
          title: item.name,
          description: "",
          url: `${PRODUCT_BASE}/${item.slug}`,
          institution: INST,
        });
      }

      console.log(`[scraper] ${INST}: scraped ${listings.length} listings`);
      return listings;
    } catch (err: any) {
      console.error(`[scraper] ${INST}: error — ${err.message}`);
      return [];
    }
  },
};
