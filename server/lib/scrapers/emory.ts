import { createTechPublisherScraper } from "./techpublisher";

export const emoryScraper = createTechPublisherScraper(
  "emoryott",
  "Emory University",
  { selector: "a[href*='/techcase']", maxPg: 50 }
);
