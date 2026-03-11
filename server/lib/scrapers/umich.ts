import { createFlintboxScraper } from "./flintbox";
import { createTechPublisherScraper } from "./techpublisher";
import { fetchHtml, cleanText } from "./utils";
import type { InstitutionScraper, ScrapedListing } from "./types";

const flintbox = createFlintboxScraper(
  { slug: "umich", orgId: 12, accessKey: "b13dccc5-1084-40f7-a666-1b68e9e69ba1" },
  "University of Michigan"
);

async function scrapeTechtransfer(): Promise<ScrapedListing[]> {
  const base = "https://techtransfer.umich.edu";
  const results: ScrapedListing[] = [];
  const seen = new Set<string>();

  async function harvest(url: string) {
    const $ = await fetchHtml(url);
    if (!$) return;
    $("a[href*='/technologies/']").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const title = cleanText($(el).text());
      if (!title || title.length < 8 || seen.has(title)) return;
      seen.add(title);
      results.push({
        title,
        description: "",
        url: href.startsWith("http") ? href : `${base}${href}`,
        institution: "University of Michigan",
      });
    });
  }

  await harvest(`${base}/technologies`);
  return results;
}

export const umichScraper: InstitutionScraper = {
  institution: "University of Michigan",
  async scrape(): Promise<ScrapedListing[]> {
    const flintboxResults = await flintbox.scrape();
    if (flintboxResults.length > 0) return flintboxResults;

    const ttResults = await scrapeTechtransfer();
    if (ttResults.length > 0) {
      console.log(`[scraper] University of Michigan: ${ttResults.length} listings via techtransfer.umich.edu`);
      return ttResults;
    }

    console.log("[scraper] University of Michigan: 0 results from all sources");
    return [];
  },
};
