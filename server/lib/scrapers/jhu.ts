import { createTechPublisherScraper } from "./techpublisher";

export const jhuScraper = createTechPublisherScraper(
  "jhu",
  "Johns Hopkins University",
  { maxPg: 220 }
);
