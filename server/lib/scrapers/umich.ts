import { createFlintboxScraper } from "./flintbox";
import { fetchHtml, cleanText } from "./utils";
import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "University of Michigan";

const flintbox = createFlintboxScraper(
  { slug: "umich", orgId: 12, accessKey: "b13dccc5-1084-40f7-a666-1b68e9e69ba1" },
  INST
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
        institution: INST,
      });
    });
  }

  await harvest(`${base}/technologies`);
  return results;
}

async function scrapeInnovationPartnerships(): Promise<ScrapedListing[]> {
  const base = "https://innovationpartnerships.umich.edu";
  const results: ScrapedListing[] = [];
  const seen = new Set<string>();

  for (const path of ["/for-industry/available-technologies/", "/technologies/", "/"]) {
    try {
      const $ = await fetchHtml(`${base}${path}`, 15_000);
      if (!$) continue;
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") ?? "";
        if (!href.includes("/technolog") && !href.includes("/available-")) return;
        if (href === path || href.endsWith("/available-technologies/")) return;
        const title = cleanText($(el).text());
        if (!title || title.length < 8 || seen.has(title)) return;
        seen.add(title);
        results.push({
          title,
          description: "",
          url: href.startsWith("http") ? href : `${base}${href}`,
          institution: INST,
        });
      });
      if (results.length > 0) return results;
    } catch {
      continue;
    }
  }

  return results;
}

export const umichScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    const flintboxResults = await flintbox.scrape();
    if (flintboxResults.length > 0) return flintboxResults;

    const ttResults = await scrapeTechtransfer();
    if (ttResults.length > 0) {
      console.log(`[scraper] ${INST}: ${ttResults.length} listings via techtransfer.umich.edu`);
      return ttResults;
    }

    const ipResults = await scrapeInnovationPartnerships();
    if (ipResults.length > 0) {
      console.log(`[scraper] ${INST}: ${ipResults.length} listings via innovationpartnerships.umich.edu`);
      return ipResults;
    }

    console.log(`[scraper] ${INST}: 0 results from all sources`);
    return [];
  },
};
