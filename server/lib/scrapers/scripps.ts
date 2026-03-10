import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Scripps Research";

export const scrippsScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: technology licensing pages at scripps.edu return 404 — no public technology listing available`);
    return [];
  },
};
