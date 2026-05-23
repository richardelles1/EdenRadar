/**
 * Temple University — Office of Technology Commercialization
 *
 * Platform: Drupal 7 (tuportal6.temple.edu)
 * Structure: Single SSR page, 30-35 techs as h3-separated content blocks.
 *   Each block: <h3>Title</h3> … <strong>About</strong> <p>text</p> …
 *   Ref ID pattern: C2022-026 (appears in block text after the h3)
 * Verified accessible 2026-05-23.
 */

import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const INST = "Temple University";
const LISTING_URL =
  "https://tuportal6.temple.edu/html/TEMPLE/apps/tup/Public/Research/LicensingOpportunities/";
const REF_ID_RE = /([A-Z]\d{4}-\d+)/;
const SECTION_LABELS = new Set(["About", "Proposed Use", "Creator(s)", "Patent", "Contact", "Keywords"]);

function extractBlock($: ReturnType<typeof Object.create>, h3el: any): ScrapedListing | null {
  const title = cleanText($(h3el).text());
  if (!title || title.length < 4) return null;

  // Collect all sibling content between this h3 and the next h3
  let blockText = "";
  let $cur = $(h3el).next();
  while ($cur.length && (!$cur[0].tagName || $cur[0].tagName.toLowerCase() !== "h3")) {
    blockText += " " + $cur.text();
    $cur = $cur.next();
  }

  const refMatch = blockText.match(REF_ID_RE);
  const technologyId = refMatch?.[1];

  // Extract About section (between "About" and "Proposed Use")
  const aboutIdx = blockText.indexOf("About");
  const proposedIdx = blockText.indexOf("Proposed Use");
  let description = "";
  if (aboutIdx !== -1) {
    const afterAbout = blockText.slice(aboutIdx + "About".length);
    const end = proposedIdx > aboutIdx ? proposedIdx - aboutIdx - "About".length : -1;
    const raw = end !== -1 ? afterAbout.slice(0, end) : afterAbout;
    description = cleanText(raw).substring(0, 1000);
  }

  const anchor = technologyId
    ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 60);
  const url = `${LISTING_URL}#${anchor}`;

  return {
    title,
    description,
    url,
    institution: INST,
    ...(technologyId ? { technologyId } : {}),
  };
}

export const templeScraper: InstitutionScraper = {
  institution: INST,

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    const $ = await fetchHtml(LISTING_URL, 20_000);
    if (!$) return [];
    const results: ScrapedListing[] = [];
    $("h3").each((_, el) => {
      if (results.length >= maxResults) return false as any;
      const title = cleanText($(el).text());
      if (title.length >= 4 && !SECTION_LABELS.has(title)) {
        results.push({ title, url: LISTING_URL, institution: INST, description: "" });
      }
    });
    return results;
  },

  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching...`);
    const $ = await fetchHtml(LISTING_URL, 25_000, undefined, 1, true);
    if (!$) return [];

    const results: ScrapedListing[] = [];
    const seen = new Set<string>();

    $("h3").each((_, el) => {
      const title = cleanText($(el).text());
      if (!title || SECTION_LABELS.has(title) || seen.has(title)) return;
      seen.add(title);
      const listing = extractBlock($, el);
      if (listing) results.push(listing);
    });

    console.log(`[scraper] ${INST}: ${results.length} listings`);
    return results;
  },
};
