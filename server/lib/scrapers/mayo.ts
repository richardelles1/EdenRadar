import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Mayo Clinic";

export const mayoScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: skipped — ventures.mayoclinic.org unreachable (connection refused)`);
    return [];
  },
};
