import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "UC Berkeley";

export const ucBerkeleyScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: techtransfer.universityofcalifornia.edu uses ASP.NET with JavaScript-rendered results — no static HTML listings available`);
    return [];
  },
};
