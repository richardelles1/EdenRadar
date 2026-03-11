import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "University of Washington";

export const uwashingtonScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: skipped — CoMotion portal has no public technology listing page`);
    return [];
  },
};
