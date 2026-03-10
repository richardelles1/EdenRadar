import type { InstitutionScraper, ScrapedListing } from "./types";

const ALGOLIA_APP_ID = "JHR6AZA86G";
const ALGOLIA_SEARCH_KEY = "f5c5e0e5bbcfbb7773c2b24b55e7f21c";
const ALGOLIA_INDEX = "Prod_Inteum_TechnologyPublisher_nulive";
const BASE = "https://inventions.invo.northwestern.edu";
const INST = "Northwestern University";

export const northwesternScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      const PAGE_SIZE = 1000;
      let page = 0;
      let totalPages = 1;

      while (page < totalPages) {
        const res = await fetch(
          `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`,
          {
            method: "POST",
            headers: {
              "X-Algolia-Application-Id": ALGOLIA_APP_ID,
              "X-Algolia-API-Key": ALGOLIA_SEARCH_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: "",
              hitsPerPage: PAGE_SIZE,
              page,
              attributesToRetrieve: ["title", "Url", "descriptionTruncated"],
            }),
          }
        );

        if (!res.ok) {
          console.error(`[scraper] ${INST}: Algolia HTTP ${res.status}`);
          break;
        }

        const data = await res.json() as { hits: any[]; nbPages: number; nbHits: number };
        totalPages = data.nbPages ?? 1;

        for (const hit of data.hits ?? []) {
          const title = (hit.title ?? "").trim();
          if (!title || title.length < 5 || seen.has(title)) continue;
          seen.add(title);
          const url = hit.Url
            ? (hit.Url.startsWith("http") ? hit.Url : `${BASE}${hit.Url}`)
            : `${BASE}/`;
          results.push({
            title,
            description: (hit.descriptionTruncated ?? title).slice(0, 300),
            url,
            institution: INST,
          });
        }

        page++;
        if (data.hits?.length === 0) break;
      }

      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
