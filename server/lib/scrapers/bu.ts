import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Boston University";

export const buScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: skipped — technologies-database page is JS-rendered with no public API`);
    return [];
  },
};
