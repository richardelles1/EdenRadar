import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Case Western Reserve University";

export const cwruScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: available-intellectual-property page (case.edu) has no machine-readable technology listings — only contact info`);
    return [];
  },
};
