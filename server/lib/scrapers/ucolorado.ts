import type { InstitutionScraper, ScrapedListing } from "./types";

// CU Venture Partners explicitly states: "Most of our technologies that are available
// for licensing are not published online. Contact us directly to learn about available
// technologies." Their portfolio page only lists 7 category nav links, not individual
// technologies. No public machine-readable catalog exists.
export const ucoloradoScraper: InstitutionScraper = {
  institution: "University of Colorado",
  async scrape(): Promise<ScrapedListing[]> {
    return [];
  },
};
