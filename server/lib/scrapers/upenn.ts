import { createTechPublisherScraper } from "./techpublisher";

export const upennScraper = createTechPublisherScraper(
  "upenn",
  "University of Pennsylvania",
  { maxPg: 50 }
);
