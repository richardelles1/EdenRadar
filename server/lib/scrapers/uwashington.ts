import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "University of Washington";

// Re-probed 2026-06-12:
//   techtransfer.washington.edu — TCP connection refused (domain dead)
//   comotion.uw.edu sitemaps   — HTTP 403 regardless of UA
//   els2.comotion.uw.edu       — current UW Enterprise License System portal
//     /autocomplete/products   — returns all 250+ technologies as JSON
//     individual pages at      — https://els2.comotion.uw.edu/product/SLUG
export const uwashingtonScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const UA =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

      const res = await fetch(
        "https://els2.comotion.uw.edu/autocomplete/products",
        {
          headers: {
            "User-Agent": UA,
            Accept: "application/json, */*",
            Referer: "https://els2.comotion.uw.edu/products/available-technologies",
          },
          signal: AbortSignal.timeout(20_000),
        }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      type ELS2Item = {
        name: string;
        dataAttributes?: { id?: number; url?: string };
      };

      const items: ELS2Item[] = await res.json();
      if (!Array.isArray(items)) throw new Error("Unexpected response shape");

      const seen = new Set<string>();
      const results: ScrapedListing[] = [];

      for (const item of items) {
        const title = item.name?.trim();
        if (!title || title.length < 5) continue;
        const slug = item.dataAttributes?.url ?? "";
        const url = slug
          ? `https://els2.comotion.uw.edu/${slug}`
          : "https://els2.comotion.uw.edu/products/available-technologies";
        if (seen.has(url)) continue;
        seen.add(url);
        results.push({ title, description: "", url, institution: INST });
      }

      console.log(
        `[scraper] ${INST}: ${results.length} listings via els2.comotion.uw.edu`
      );
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
