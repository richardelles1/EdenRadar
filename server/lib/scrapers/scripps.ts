import { createTechPublisherScraper } from "./techpublisher";

export const scrippsScraper = createTechPublisherScraper(
  "scrippsotd",
  "Scripps Research",
  { maxPg: 50 }
);
