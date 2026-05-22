/**
 * ICGEB — International Centre for Genetic Engineering and Biotechnology
 *
 * Platform: WordPress + Neve theme + Content Views Pro plugin (pt-cv-*)
 * URL: https://icgeb.res.in:8443/techtransfer/mature-technology/
 * Structure: Single page, all ~31 mature tech cards, no pagination
 *   Card selector: div.pt-cv-overlay-wrapper h4.pt-cv-title a
 *   Category: div.pt-cv-taxoterm a
 * TLS: Valid certificate on port 8443 (verified 2026-05-21)
 *
 * Coverage: Italy (Trieste), India (New Delhi), South Africa (Cape Town)
 * Focus: Biosimilars, biologics, vaccines, crop improvement, biofuel
 * Verified accessible 2026-05-21: 31 mature technologies.
 */

import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";
import { enrichWithDetailPages } from "./detailFetcher";

const INST = "ICGEB";
const BASE = "https://icgeb.res.in:8443";
const LISTING_URL = `${BASE}/techtransfer/mature-technology/`;

const DETAIL_SELECTORS = {
  description: [
    ".entry-content",
    "article .nv-content-wrap",
    ".nv-single-post-wrap p",
    "main article p",
  ],
};

export const icgebScraper: InstitutionScraper = {
  institution: INST,

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    const $ = await fetchHtml(LISTING_URL, 20_000);
    if (!$) return [];

    const results: ScrapedListing[] = [];
    $("div.pt-cv-overlay-wrapper h4.pt-cv-title a").each((_, el) => {
      if (results.length >= maxResults) return false as any;
      const title = cleanText($(el).text());
      const href = $(el).attr("href") ?? "";
      if (title.length < 4 || !href) return;
      results.push({ title, url: href, institution: INST, description: "" });
    });
    return results;
  },

  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching mature technology listings...`);
    const $ = await fetchHtml(LISTING_URL, 20_000, undefined, 1, true);
    if (!$) return [];

    const results: ScrapedListing[] = [];
    $("div.pt-cv-overlay-wrapper h4.pt-cv-title a").each((_, el) => {
      const title = cleanText($(el).text());
      const href = $(el).attr("href") ?? "";
      if (title.length < 4 || !href) return;

      const $card = $(el).closest("div.pt-cv-overlay-wrapper");
      const category = cleanText($card.find("div.pt-cv-taxoterm a").first().text());

      results.push({
        title,
        url: href,
        institution: INST,
        description: "",
        ...(category ? { categories: [category] } : {}),
      });
    });

    if (results.length === 0) {
      console.warn(`[scraper] ${INST}: 0 items found — selector may have changed`);
      return [];
    }

    console.log(`[scraper] ${INST}: ${results.length} listings — enriching descriptions...`);
    await enrichWithDetailPages(results, DETAIL_SELECTORS);
    console.log(`[scraper] ${INST}: done`);
    return results;
  },
};
