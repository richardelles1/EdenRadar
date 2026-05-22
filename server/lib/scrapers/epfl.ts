/**
 * EPFL Technology Transfer Office — Licensing Opportunities
 *
 * Platform: WordPress (wp-theme-2018), SSR, no bot protection
 * URL: https://www.epfl.ch/research/technology-transfer/access/licensing-opportunities/
 * Structure: Single page, all items in Bootstrap card-deck layout
 *   Category: h2.wp-block-heading (Digital/Data, Manufacturing/Materials, Life Sciences, etc.)
 *   Item card: div.card-deck .card
 *     Title: h3.card-title a
 *     URL: h3.card-title a href (Google Drive PDF — no per-tech HTML page)
 *     Description: div.card-body p
 *     Ref ID: div.card-footer a.btn text → "See ref 6.XXXX"
 * WP REST API returns 401 Unauthorized — direct HTML only.
 * Verified accessible 2026-05-22: ~80-120 technologies across multiple categories.
 */

import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const INST = "EPFL";
const LISTING_URL =
  "https://www.epfl.ch/research/technology-transfer/access/licensing-opportunities/";

export const epflScraper: InstitutionScraper = {
  institution: INST,

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    const $ = await fetchHtml(LISTING_URL, 20_000);
    if (!$) return [];
    const results: ScrapedListing[] = [];
    $("div.card-deck .card").each((_, el) => {
      if (results.length >= maxResults) return false as any;
      const title = cleanText($(el).find("h3.card-title a").first().text());
      const href = $(el).find("h3.card-title a").first().attr("href") ?? "";
      if (title.length < 4 || !href) return;
      results.push({ title, url: href, institution: INST, description: "" });
    });
    return results;
  },

  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching licensing opportunities...`);
    const $ = await fetchHtml(LISTING_URL, 30_000);
    if (!$) return [];

    const results: ScrapedListing[] = [];
    let currentCategory = "";

    $("div.entry-content")
      .children()
      .each((_, el) => {
        const tag = (el as any).tagName?.toLowerCase();

        if (tag === "h2") {
          currentCategory = cleanText($(el).text());
          return;
        }

        // card-deck containers are wrapped in div.container-full > div.container > div.card-deck
        $(el)
          .find("div.card-deck .card")
          .each((_, card) => {
            const $card = $(card);
            const titleEl = $card.find("h3.card-title a").first();
            const title = cleanText(titleEl.text());
            const href = titleEl.attr("href") ?? "";
            if (title.length < 4 || !href) return;

            const description = cleanText($card.find("div.card-body p").first().text());

            const footerText = cleanText($card.find("div.card-footer a.btn").first().text());
            const refMatch = footerText.match(/ref\s+([\d.]+)/i);
            const technologyId = refMatch ? refMatch[1] : undefined;

            results.push({
              title,
              url: href,
              institution: INST,
              description,
              ...(technologyId ? { technologyId } : {}),
              ...(currentCategory ? { categories: [currentCategory] } : {}),
            });
          });
      });

    console.log(`[scraper] ${INST}: ${results.length} listings`);
    return results;
  },
};
