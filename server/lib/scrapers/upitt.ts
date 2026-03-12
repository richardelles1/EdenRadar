import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "University of Pittsburgh";
const JSON_URL = "https://inventions.pitt.edu/technologies/index.json";

interface PittTech {
  title: string;
  llm_summary: string;
  url: string;
  json_url: string;
}

export const upittScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const res = await fetch(JSON_URL, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        console.error(`[scraper] ${INST}: HTTP ${res.status}`);
        return [];
      }
      const data: PittTech[] = await res.json();
      if (!Array.isArray(data)) {
        console.log(`[scraper] ${INST}: 0 listings (response is not an array)`);
        return [];
      }

      const results: ScrapedListing[] = data
        .filter((item) => item.title && item.title.length > 5)
        .map((item) => ({
          title: item.title.trim(),
          description: (item.llm_summary || item.title).trim().slice(0, 500),
          url: item.url || JSON_URL,
          institution: INST,
        }));

      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
