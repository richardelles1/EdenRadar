/**
 * Mayo Clinic scraper smoke test
 *
 * Run with:
 *   npx tsx scripts/smoke-mayo.ts
 *
 * Validates that the expanded Mayo scraper:
 *  1. Successfully fetches every category / individual-tech page (HTTP 200).
 *  2. Parses the legacy biopharmaceutical category page (≥ 5 listings expected).
 *  3. Parses each individual root-level + impact-story tech page (1 listing each).
 *  4. Produces a deduplicated final set with non-trivial coverage growth vs.
 *     the previous biopharma-only scraper (which produced exactly 9 rows).
 *  5. Reports per-category raw counts and a sample of titles.
 */

import assert from "node:assert/strict";
import { mayoScraper, parseBiopharmaPage, parseIndividualTechPage } from "../server/lib/scrapers/mayo";
import { classifyBatch } from "../server/lib/pipeline/classifyAsset";

const PRIOR_BIOPHARMA_TITLES = new Set<string>([
  "anti-fibrotics for ipf",
  "biologic for tendon regeneration",
  "small molecule antagonist for cholangiopathies",
  "in vivo regulatory b-cell therapy for immune tolerance",
  "in situ car-t platform",
  "nanoimmuno conjugate platform",
  "bi-specific antibody targeting alk fusions in lung cancer",
  "modified proteins for neurodegenerative disease",
  "dendritic cell vaccine for rrp",
]);

// ── 0. Verify every configured Mayo URL returns HTTP 200 ──────────────────────
const REQUIRED_URLS = [
  "https://businessdevelopment.mayoclinic.org/collaborate/biopharmaceuticals/",
  "https://businessdevelopment.mayoclinic.org/houses-platform/",
  "https://businessdevelopment.mayoclinic.org/best-next-drug-migraine-algorithm/",
  "https://businessdevelopment.mayoclinic.org/pellikka-hfpef-aik/",
  "https://businessdevelopment.mayoclinic.org/uc-score/",
  "https://businessdevelopment.mayoclinic.org/copyrighted-materials/",
  "https://businessdevelopment.mayoclinic.org/impact-stories/q-hdmi/",
  "https://businessdevelopment.mayoclinic.org/impact-stories/maggies-pearl/",
  "https://businessdevelopment.mayoclinic.org/impact-stories/stem-cell-therapy-for-perianal-fistulas/",
  "https://businessdevelopment.mayoclinic.org/impact-stories/vyriad/",
  "https://businessdevelopment.mayoclinic.org/impact-stories/magnetic-resonance-elastography/",
  "https://businessdevelopment.mayoclinic.org/impact-stories/remote-ecg-patient-monitoring/",
  "https://businessdevelopment.mayoclinic.org/impact-stories/phage-therapy/",
];
console.log(`Verifying HTTP 200 for ${REQUIRED_URLS.length} configured URLs…`);
const headChecks = await Promise.all(
  REQUIRED_URLS.map(async (url) => {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0; +https://edenradar.com)" },
    });
    return { url, status: res.status };
  }),
);
for (const { url, status } of headChecks) {
  assert.equal(status, 200, `URL must return 200 (got ${status}): ${url}`);
}
console.log("  All URLs returned 200.\n");

const STARTED_AT = Date.now();

console.log("Running Mayo scraper end-to-end against the live site…\n");

const listings = await mayoScraper.scrape();
const elapsedMs = Date.now() - STARTED_AT;

// ── 1. Total coverage — assert exact expected counts from the May 2026 audit ──
console.log(`Fetched ${listings.length} total listings in ${elapsedMs}ms\n`);
const EXPECTED = { biopharmaceutical: 9, individual: 4, "copyrighted-material": 1, "impact-story": 7 };
const EXPECTED_TOTAL = Object.values(EXPECTED).reduce((a, b) => a + b, 0);
assert.equal(
  listings.length,
  EXPECTED_TOTAL,
  `Expected exactly ${EXPECTED_TOTAL} total listings (audit baseline), got ${listings.length}`,
);

// ── 2. Per-category breakdown ─────────────────────────────────────────────────
const byCategory: Record<string, typeof listings> = {};
for (const l of listings) {
  const cat = l.categories?.[0] || "uncategorized";
  (byCategory[cat] ??= []).push(l);
}
console.log("Per-category counts:");
for (const [cat, items] of Object.entries(byCategory)) {
  console.log(`  ${cat.padEnd(20)} ${items.length}`);
}
console.log();

// ── 3. Per-category counts must match the audit baseline exactly ──────────────
for (const [cat, expected] of Object.entries(EXPECTED)) {
  const actual = byCategory[cat]?.length ?? 0;
  assert.equal(actual, expected, `Category "${cat}" expected ${expected}, got ${actual}`);
}
const individualCount = byCategory["individual"]?.length ?? 0;
const impactCount = byCategory["impact-story"]?.length ?? 0;

// ── 5. Sample titles per category ─────────────────────────────────────────────
console.log("\nSample titles per category:");
for (const [cat, items] of Object.entries(byCategory)) {
  console.log(`\n  [${cat}]`);
  for (const item of items.slice(0, 10)) {
    console.log(`    • ${item.title.slice(0, 100)}`);
  }
}

// ── 6. Required fields present on every listing ───────────────────────────────
for (const l of listings) {
  assert.ok(l.title && l.title.length >= 5, `Listing missing/short title: ${JSON.stringify(l)}`);
  assert.ok(l.description && l.description.length >= 20, `Listing missing/short description: ${l.title}`);
  assert.ok(l.url.startsWith("https://businessdevelopment.mayoclinic.org/"), `Bad URL: ${l.url}`);
  assert.equal(l.institution, "Mayo Clinic");
}

// ── 7. Dedupe correctness — no two listings share the same case-insensitive title
const seen = new Set<string>();
for (const l of listings) {
  const k = l.title.toLowerCase().trim();
  assert.ok(!seen.has(k), `Duplicate title not deduped: ${l.title}`);
  seen.add(k);
}

// ── 8. Pure-parser regression test on a tiny synthetic biopharma page ─────────
const syntheticHtml = `
  <html><body>
    <div class="elementor-widget-text-editor"><div class="elementor-widget-container">
      <h5><strong>Synthetic Asset Alpha</strong></h5>
    </div></div>
    <div class="elementor-widget-text-editor"><div class="elementor-widget-container">
      Unmet need: lorem ipsum dolor sit amet consectetur adipiscing elit.
      Innovation: a synthetic novel therapeutic approach for testing the parser end-to-end.
    </div></div>
    <div class="elementor-widget-text-editor"><div class="elementor-widget-container">
      <h5><strong>Synthetic Asset Beta</strong></h5>
    </div></div>
    <div class="elementor-widget-text-editor"><div class="elementor-widget-container">
      Innovation: another synthetic asset description that the parser should pick up cleanly.
    </div></div>
  </body></html>
`;
const parsed = parseBiopharmaPage(syntheticHtml, "https://example/");
assert.equal(parsed.length, 2, "Synthetic biopharma page should yield 2 listings");
assert.match(parsed[0].title, /Alpha/);
assert.match(parsed[0].description, /synthetic novel therapeutic/i);

// ── 9. Pure-parser regression test on a synthetic individual-tech page ────────
const singleHtml = `
  <html><head>
    <meta property="og:title" content="Synthetic Tech XYZ - Mayo Clinic Business Development" />
    <meta property="og:description" content="A short marketing tagline for synthetic tech XYZ." />
  </head><body>
    <h1>Synthetic Tech XYZ</h1>
    <div class="elementor-widget-text-editor"><div class="elementor-widget-container">
      This is a much longer prose description of the technology, well over the eighty character minimum threshold needed to be selected as the listing description body.
    </div></div>
  </body></html>
`;
const single = parseIndividualTechPage(singleHtml, "https://example/xyz/", "individual");
assert.ok(single, "parseIndividualTechPage should return a listing for a valid page");
assert.equal(single!.title, "Synthetic Tech XYZ", "og:title suffix should be stripped");
assert.match(single!.description, /longer prose description/);

// ── 10. Classifier sanity check on the newly-discovered listings ──────────────
// Reports counts only — does not retune the classifier. Skipped (with warning)
// if OPENAI_API_KEY is not set in the environment.
const newItems = listings.filter((l) => !PRIOR_BIOPHARMA_TITLES.has(l.title.toLowerCase().trim()));
console.log(`\nClassifier sanity check on ${newItems.length} newly-discovered listings…`);
if (!process.env.OPENAI_API_KEY) {
  console.log("  OPENAI_API_KEY not set — skipping classifier pass.");
} else {
  const classifyInputs = newItems.map((l, idx) => ({
    id: idx,
    title: l.title,
    description: l.description,
    ctx: { sourceUrl: l.url, categories: l.categories },
  }));
  const results = await classifyBatch(classifyInputs, 8);
  let relevant = 0;
  const byClass: Record<string, number> = {};
  const byStage: Record<string, number> = {};
  for (const item of classifyInputs) {
    const c = results.get(item.id);
    if (!c) continue;
    if (c.biotechRelevant) relevant++;
    byClass[c.assetClass] = (byClass[c.assetClass] || 0) + 1;
    byStage[c.developmentStage] = (byStage[c.developmentStage] || 0) + 1;
  }
  console.log(`  biotechRelevant: ${relevant}/${newItems.length}`);
  console.log(`  by assetClass:    ${Object.entries(byClass).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`  by stage:         ${Object.entries(byStage).map(([k, v]) => `${k}=${v}`).join(", ")}`);
}

// ── Done ──────────────────────────────────────────────────────────────────────
console.log("\n✓ Mayo scraper smoke tests PASSED");
console.log(`  total=${listings.length}  biopharma=${byCategory["biopharmaceutical"]?.length ?? 0}` +
  `  individual=${individualCount}  impact-story=${impactCount}  elapsed=${elapsedMs}ms`);
