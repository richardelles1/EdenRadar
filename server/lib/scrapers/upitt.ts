import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchJson } from "./utils";

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
      const data = await fetchJson<PittTech[]>(JSON_URL);
      if (!data || !Array.isArray(data)) {
        console.log(`[scraper] ${INST}: 0 listings (no data)`);
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
