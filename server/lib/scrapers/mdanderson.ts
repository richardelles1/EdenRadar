import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "MD Anderson Cancer Center";

export const mdandersonScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: technology commercialization page redirects to 404 — no public technology listing available`);
    return [];
  },
};
