import { createTechPublisherScraper } from "./techpublisher";

export const jhuScraper = createTechPublisherScraper(
  "jhu",
  "Johns Hopkins University",
  { maxCats: 30, maxTech: 150, institutionTimeoutMs: 90_000 }
);
