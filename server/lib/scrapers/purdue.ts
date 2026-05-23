import type { InstitutionScraper, ScrapedListing } from "./types";
import { enrichWithDetailPages } from "./detailFetcher";

const INST = "Purdue University";
const API_BASE = "https://licensing.prf.org/client/products/search";
const PRODUCT_BASE = "https://licensing.prf.org/product";

// Cap on how many thin listings we send to detail-page enrichment per run.
// The PRF site (~500+ products) will time out if we try all of them at once.
const DETAIL_ENRICH_CAP = 200;

// Delay between listing-page API batches to avoid overwhelming the PRF server.
const BATCH_DELAY_MS = 300;

interface PurdueProduct {
  name: string;
  slug: string;
  // Fields returned if the API supports extended columns
  overview?: string;
  short_description?: string;
  description?: string;
}

interface PurdueResponse {
  page: number;
  pages: number;
  total: number;
  items: PurdueProduct[];
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchListingPage(page: number): Promise<PurdueResponse> {
  const params = new URLSearchParams({
    page: String(page),
    itemsPerPage: "100",
    orderBy: "0",
  });
  params.append("columns[]", "name");
  params.append("columns[]", "slug");
  // Request extended description fields — returned as-is if the API supports them,
  // silently absent if not.  Either way detail-page enrichment handles the gap.
  params.append("columns[]", "overview");
  params.append("columns[]", "short_description");

  const res = await fetch(`${API_BASE}?${params.toString()}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)",
      Accept: "application/json",
      Referer: "https://licensing.prf.org/products",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<PurdueResponse>;
}

function productDescription(item: PurdueProduct): string {
  return (item.overview || item.short_description || item.description || "").slice(0, 2000);
}

export const purdueRFScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching products via REST API...`);
    try {
      const first = await fetchListingPage(1);
      const totalPages = first.pages;
      console.log(`[scraper] ${INST}: ${first.total} total products across ${totalPages} pages`);

      const allItems: PurdueProduct[] = [...first.items];

      const remaining = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
      for (let i = 0; i < remaining.length; i += 3) {
        await sleep(BATCH_DELAY_MS);
        const batch = remaining.slice(i, i + 3);
        const settled = await Promise.allSettled(batch.map((p) => fetchListingPage(p)));
        for (const result of settled) {
          if (result.status === "fulfilled") allItems.push(...result.value.items);
        }
      }

      const seen = new Set<string>();
      const listings: ScrapedListing[] = [];
      for (const item of allItems) {
        if (!item.slug || !item.name || seen.has(item.slug)) continue;
        seen.add(item.slug);
        listings.push({
          title: item.name,
          description: productDescription(item),
          url: `${PRODUCT_BASE}/${item.slug}`,
          institution: INST,
        });
      }

      const thinBefore = listings.filter((l) => !l.description || l.description.length < 50);
      console.log(
        `[scraper] ${INST}: ${listings.length} listings (${thinBefore.length} thin after API) — ` +
          `enriching up to ${DETAIL_ENRICH_CAP} detail pages...`,
      );

      if (thinBefore.length > 0) {
        await enrichWithDetailPages(
          listings,
          {
            description: [
              ".product-description-box .section",
              ".section",
              ".product-description-box",
              // Fallback generic selectors
              ".description",
              "article .content",
              ".entry-content",
              "main p",
            ],
          },
          DETAIL_ENRICH_CAP,
        );
      }

      const enrichedCount = thinBefore.filter((l) => (l.description?.length ?? 0) >= 50).length;
      console.log(`[scraper] ${INST}: detail fetch complete — ${enrichedCount} of ${thinBefore.length} enriched`);
      const sample = listings.find((l) => (l.description?.length ?? 0) > 200);
      if (sample) {
        console.log(`[scraper] ${INST}: sample — "${sample.title.slice(0, 60)}" desc=${sample.description!.length} chars`);
      }
      return listings;
    } catch (err: any) {
      console.error(`[scraper] ${INST}: error — ${err.message}`);
      return [];
    }
  },
};
