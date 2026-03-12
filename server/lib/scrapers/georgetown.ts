import { createFlintboxScraper } from "./flintbox";

// Georgetown Flintbox API still works (verified: 111 items). Intentionally kept.
export const georgetownScraper = createFlintboxScraper(
  { slug: "georgetown", orgId: 75, accessKey: "cd205aca-b649-4103-83b5-e48e69e48a87" },
  "Georgetown University"
);
