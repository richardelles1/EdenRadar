import { createTechPublisherScraper } from "./techpublisher";

export const uchicagoScraper = createTechPublisherScraper(
  "uchicago",
  "University of Chicago",
  { selector: "a[href*='/techcase/']", maxPg: 30 }
);
