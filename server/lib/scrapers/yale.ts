import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Yale University";

export const yaleScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: yale-technologies (ventures.yale.edu) is a Drupal 10 React SPA — JSON:API does not expose technology node type publicly`);
    return [];
  },
};
