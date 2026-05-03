import { unicampScraper } from "../server/lib/scrapers/new-institutions";

async function main() {
  console.log("[smoke-unicamp] starting scrape...");
  const start = Date.now();
  try {
    const results = await unicampScraper.scrape();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[smoke-unicamp] returned ${results.length} listings in ${elapsed}s`);
    console.log("[smoke-unicamp] first 5 samples:");
    for (const r of results.slice(0, 5)) {
      console.log(` - ${r.title}\n   ${r.url}`);
    }
    const allHaveTitle = results.every((r) => r.title.trim().length > 0);
    const allHaveExpectedHost = results.every((r) =>
      r.url.includes("tecnologias.inova.unicamp.br/tecnologia/")
    );
    console.log(`[smoke-unicamp] all titles non-empty: ${allHaveTitle}`);
    console.log(`[smoke-unicamp] all URLs match expected host: ${allHaveExpectedHost}`);
    if (results.length < 1000 || !allHaveTitle || !allHaveExpectedHost) {
      console.error("[smoke-unicamp] FAIL — acceptance bar not met");
      process.exit(1);
    }
    console.log("[smoke-unicamp] PASS");
    process.exit(0);
  } catch (err) {
    console.error("[smoke-unicamp] ERROR:", err);
    process.exit(1);
  }
}

main();
