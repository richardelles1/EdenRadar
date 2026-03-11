import { createTechPublisherScraper } from "./techpublisher";

export const upennScraper = createTechPublisherScraper(
  "upenn",
  "University of Pennsylvania",
  { maxCats: 30, maxTech: 50 }
);
