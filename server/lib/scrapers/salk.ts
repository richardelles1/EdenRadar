import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Salk Institute for Biological Studies";


export const salkScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: technology portal (salk.portals.in-part.com) uses a Next.js SPA with authenticated API — no public listing access`);
    return [];
  },
};
