import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://techtransfer.universityofcalifornia.edu";
const INST = "UC Berkeley";

export const ucBerkeleyScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      const urls = [
        `${BASE}/default.aspx?campus=B&status=A&startRow=1`,
        `${BASE}/default.aspx?campus=B&status=A&startRow=26`,
        `${BASE}/default.aspx?campus=B&status=A&startRow=51`,
        `${BASE}/default.aspx?campus=B&status=A&startRow=76`,
      ];

      for (const url of urls) {
        const $ = await fetchHtml(url);
        if (!$) continue;

        $("a[href*='techcase'], a[href*='/tc/']").each((_, el) => {
          const href = $(el).attr("href") ?? "";
          const title = cleanText($(el).text());
          if (!title || title.length < 10 || seen.has(title)) return;
          seen.add(title);
          results.push({
            title,
            description: title,
            url: resolveUrl(BASE, href),
            institution: INST,
          });
        });

        $("tr.alt1, tr.alt2, .resultrow, .search-result").each((_, el) => {
          const titleEl = $(el).find("a").first();
          const title = cleanText(titleEl.text());
          if (!title || title.length < 10 || seen.has(title)) return;
          seen.add(title);
          const href = titleEl.attr("href") ?? "";
          results.push({
            title,
            description: cleanText($(el).find("td:nth-child(2)").text()) || title,
            url: href ? resolveUrl(BASE, href) : BASE,
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
