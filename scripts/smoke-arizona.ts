/**
 * University of Arizona scraper smoke test
 * Run: npx tsx scripts/smoke-arizona.ts
 */

import { arizonaScraper } from "../server/lib/scrapers/new-institutions";

console.log("Running University of Arizona scraper against live Algolia API...\n");
const start = Date.now();

const listings = await arizonaScraper.scrape();
const elapsed = ((Date.now() - start) / 1000).toFixed(1);

console.log(`\n── Results ──────────────────────────────────`);
console.log(`Total listings : ${listings.length}`);
console.log(`Elapsed        : ${elapsed}s`);

if (listings.length === 0) {
  console.error("FAIL: 0 listings returned");
  process.exit(1);
}

// Sample
console.log(`\nFirst 5 listings:`);
for (const l of listings.slice(0, 5)) {
  console.log(`  [${l.technologyId ?? "?"}] ${l.title.slice(0, 70)}`);
  console.log(`    url  : ${l.url}`);
  console.log(`    desc : ${(l.description ?? "").slice(0, 80).replace(/\n/g, " ")}...`);
  console.log(`    cats : ${(l.categories ?? []).join(", ") || "(none)"}`);
}

// Quality checks
const noUrl = listings.filter((l) => !l.url).length;
const noDesc = listings.filter((l) => !l.description || l.description.length < 10).length;
const noTitle = listings.filter((l) => !l.title || l.title.length < 5).length;

console.log(`\n── Quality ──────────────────────────────────`);
console.log(`Missing URL   : ${noUrl}`);
console.log(`Short desc    : ${noDesc}`);
console.log(`Short title   : ${noTitle}`);
console.log(`With techID   : ${listings.filter((l) => l.technologyId).length}`);
console.log(`With category : ${listings.filter((l) => l.categories?.length).length}`);
console.log(`With inventors: ${listings.filter((l) => l.inventors?.length).length}`);

if (listings.length >= 1000) {
  console.log(`\nNOTE: got ${listings.length} listings — cap-bypass strategy worked (>1000 unique records)`);
} else {
  console.log(`\nNOTE: got ${listings.length} listings — under 1000 cap, facet pass may not have been needed`);
}
