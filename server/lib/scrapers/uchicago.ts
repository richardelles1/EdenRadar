import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://polsky.uchicago.edu";
const INST = "University of Chicago";

export const uchicagoScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      const url = `${BASE}/innovation-commercialization/technologies/`;
      const $ = await fetchHtml(url);
      if (!$) {
        console.log(`[scraper] ${INST}: 0 listings (unreachable)`);
        return [];
      }

      $("a[href*='technologypublisher.com/techcase']").each((_, el) => {
        const href = $(el).attr("href") ?? "";
        const title = cleanText($(el).closest(".pc---image-color__card, article, .card, li").find("h2, h3, h4, .title, img[alt]").first().attr("alt") || $(el).text() || "");
        const resolvedTitle = title.length > 10 ? title : cleanText($(el).text());
        if (!resolvedTitle || resolvedTitle.length < 10 || seen.has(resolvedTitle)) return;
        seen.add(resolvedTitle);
        results.push({
          title: resolvedTitle,
          description: resolvedTitle,
          url: href,
          institution: INST,
        });
      });

      $(".pc---image-color__card").each((_, el) => {
        const href = $(el).attr("href") ?? "";
        if (!href.includes("technologypublisher")) return;
        const titleText = cleanText($(el).find("img").attr("alt") || $(el).text() || "");
        if (!titleText || titleText.length < 10 || seen.has(href)) return;
        seen.add(href);
        results.push({
          title: titleText,
          description: titleText,
          url: href,
          institution: INST,
        });
      });

      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
