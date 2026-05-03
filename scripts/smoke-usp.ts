import { uspScraper } from "../server/lib/scrapers/new-institutions";

async function main() {
  console.log("[smoke-usp] starting scrape...");
  const start = Date.now();
  try {
    const results = await uspScraper.scrape();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[smoke-usp] returned ${results.length} listings in ${elapsed}s`);
    console.log("[smoke-usp] first 5 samples:");
    for (const r of results.slice(0, 5)) {
      console.log(` - ${r.title}\n   ${r.url}`);
    }
    const allHaveTitle = results.every((r) => r.title.trim().length > 0);
    const allHaveExpectedHost = results.every((r) =>
      /(usp\.technologypublisher\.com|patentes\.usp\.br)/.test(r.url)
    );
    console.log(`[smoke-usp] all titles non-empty: ${allHaveTitle}`);
    console.log(`[smoke-usp] all URLs match expected host: ${allHaveExpectedHost}`);
    if (results.length < 200 || !allHaveTitle || !allHaveExpectedHost) {
      console.error("[smoke-usp] FAIL — acceptance bar not met");
      process.exit(1);
    }
    console.log("[smoke-usp] PASS");
    process.exit(0);
  } catch (err) {
    console.error("[smoke-usp] ERROR:", err);
    process.exit(1);
  }
}

main();
