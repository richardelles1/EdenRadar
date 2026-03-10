import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Cornell University";

export const cornellScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: CTL (ctl.cornell.edu) has no paginated technology listing — only featured items and express licensing categories`);
    return [];
  },
};
