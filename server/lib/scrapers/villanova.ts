/**
 * Villanova University — Office of Research & Graduate Studies
 *
 * Platform: Adobe Experience Manager (AEM) — villanova.edu
 * Structure: Single page, each invention is a .par_container.parsys div:
 *   1st child .text: <p style="text-align:center"><b>Title</b></p>
 *   2nd child .text: investigator info (skipped)
 *   buttonCollapse div: PDF link (IP Summary)
 * ~16 technologies.
 * Verified accessible 2026-05-23.
 */

import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const INST = "Villanova University";
const BASE = "https://www.villanova.edu";
const LIST_URL = `${BASE}/university/research-scholarship/innovation-technology/available-inventions.html`;

export const villanovaScraper: InstitutionScraper = {
  institution: INST,

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    const $ = await fetchHtml(LIST_URL, 15_000);
    if (!$) return [];
    const results: ScrapedListing[] = [];
    $(".par_container").each((_, container) => {
      if (results.length >= maxResults) return false as any;
      const $c = $(container);
      const title = cleanText($c.find('p[style*="center"] b').first().text());
      if (title.length >= 10) results.push({ title, url: LIST_URL, institution: INST, description: "" });
    });
    return results;
  },

  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching listing page...`);
    const $ = await fetchHtml(LIST_URL, 15_000, undefined, 2, true);
    if (!$) {
      console.error(`[scraper] ${INST}: failed to fetch listing page`);
      return [];
    }

    const results: ScrapedListing[] = [];
    const seen = new Set<string>();

    $(".par_container").each((_, container) => {
      const $c = $(container);

      // Title lives in the first centered <p><b>…</b></p> within the container
      const title = cleanText($c.find('p[style*="center"] b').first().text());
      if (!title || title.length < 10) return;

      // PDF link (IP Summary)
      const href = $c.find('a[href$=".pdf"]').first().attr("href") ?? "";
      if (!href) return;

      const fullUrl = href.startsWith("http") ? href : `${BASE}${href}`;
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);

      results.push({ title, description: "", url: fullUrl, institution: INST });
    });

    console.log(`[scraper] ${INST}: ${results.length} listings scraped`);
    return results;
  },
};
