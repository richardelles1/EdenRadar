import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Georgetown University";

export const georgetownScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: technology portal (otl.georgetown.edu) uses a JavaScript SPA — no static listings available`);
    return [];
  },
};
