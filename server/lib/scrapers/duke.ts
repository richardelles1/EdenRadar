import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Duke University";

export const dukeScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: skipped — duke.portals.in-part.com has no public API or SSR-accessible listings`);
    return [];
  },
};
