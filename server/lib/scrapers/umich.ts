import { createFlintboxScraper } from "./flintbox";

export const umichScraper = createFlintboxScraper(
  { slug: "umich", orgId: 12, accessKey: "b13dccc5-1084-40f7-a666-1b68e9e69ba1" },
  "University of Michigan"
);
