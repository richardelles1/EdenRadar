import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://case.edu";
const INST = "Case Western Reserve University";

export const cwruScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      const urls = [
        `${BASE}/research/commercialization-industry/`,
        `${BASE}/research/commercialization-industry/available-technologies/`,
        "https://research.case.edu/technology-licensing/",
      ];

      for (const url of urls) {
        const $ = await fetchHtml(url);
        if (!$) continue;

        $("article, .views-row, .technology, li.result, tr, .tech-item").each((_, el) => {
          const titleEl = $(el).find("h2 a, h3 a, h4 a, .title a, a").first();
          const title = cleanText(titleEl.text());
          if (!title || title.length < 15 || seen.has(title)) return;
          if (/(menu|nav|footer|contact|about|event|news|report|award|staff)/i.test(title)) return;
          seen.add(title);
          const href = titleEl.attr("href") ?? "";
          const base = new URL(url).origin;
          results.push({
            title,
            description: cleanText($(el).find("p, .summary, td").first().text()) || title,
            url: href ? resolveUrl(base, href) : base,
            institution: INST,
          });
        });
      }

      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
