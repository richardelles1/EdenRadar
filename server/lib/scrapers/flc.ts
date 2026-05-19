import { createFlintboxScraper } from "./flintbox";

export const flcScraper = createFlintboxScraper(
  { slug: "flc", orgId: 139, accessKey: "321fdfb7-7f75-48de-8916-e73006ce827d" },
  "FLC (Federal Laboratory Consortium)",
  25 * 60 * 1000 // 25 min — 4,915 listings × thin-listing enrichment
);
