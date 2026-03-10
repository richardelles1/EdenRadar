import { createTechPublisherScraper } from "./techpublisher";

export const utexasScraper = createTechPublisherScraper(
  "utotc",
  "University of Texas",
  { selector: "a.technology_title, h2 a[href*='/technology/']", maxPg: 60 }
);
