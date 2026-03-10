import { createTechPublisherScraper } from "./techpublisher";

export const vanderbiltScraper = createTechPublisherScraper(
  "vanderbilt",
  "Vanderbilt University",
  { maxPg: 50 }
);
