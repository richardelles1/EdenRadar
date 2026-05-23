/**
 * Temple University — Office of Technology Commercialization
 *
 * Platform: Drupal 7 + DataTables (tuportal6.temple.edu)
 * Structure: Single SSR page, all ~40-45 techs in one HTML table
 *   Table: #Table_TechTransfer
 *   Each row: first td → <b>Title</b><br>RefID
 *              second td → Column1 div with About / Proposed Use sections
 * No per-technology URLs — all items share the listing page URL.
 * Verified accessible 2026-05-21.
 */

import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const INST = "Temple University";
const LISTING_URL =
  "https://tuportal6.temple.edu/html/TEMPLE/apps/tup/Public/Research/LicensingOpportunities/";
const REF_ID_RE = /([A-Z]\d{4}-\d+)/;

function extractSection(colText: string, label: string, nextLabel?: string): string {
  const start = colText.indexOf(label);
  if (start === -1) return "";
  const afterLabel = colText.slice(start + label.length);
  const end = nextLabel ? afterLabel.indexOf(nextLabel) : -1;
  const segment = end !== -1 ? afterLabel.slice(0, end) : afterLabel;
  return segment.replace(/\s+/g, " ").trim();
}

function parseRow($: ReturnType<typeof Object.create>, row: any, $row: any): ScrapedListing | null {
  const cells = $row.find("td");
  if (cells.length < 2) return null;

  const titleCell = cells.eq(0);
  const title = cleanText(titleCell.find("b").first().text());
  if (title.length < 4) return null;

  const cellText = titleCell.text();
  const refMatch = cellText.match(REF_ID_RE);
  const technologyId = refMatch?.[1];

  const colText = cells.eq(1).find(".Column1").text();
  const description = extractSection(colText, "About", "Proposed Use");

  // Use anchor URL so each listing gets a unique sourceUrl — the ingest pipeline
  // deduplicates by sourceUrl within a batch, which would collapse all 58 rows to
  // one if they all point to the same listing page.
  const listingUrl = technologyId ? `${LISTING_URL}#${technologyId}` : LISTING_URL;

  return {
    title,
    description,
    url: listingUrl,
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
    $("#Table_TechTransfer tbody tr").each((_, row) => {
      if (results.length >= maxResults) return false as any;
      const $row = $(row);
      const title = cleanText($row.find("td").eq(0).find("b").first().text());
      if (title.length >= 4) results.push({ title, url: LISTING_URL, institution: INST, description: "" });
    });
    return results;
  },

  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching...`);
    const $ = await fetchHtml(LISTING_URL, 25_000, undefined, 1, true);
    if (!$) return [];

    const results: ScrapedListing[] = [];
    $("#Table_TechTransfer tbody tr").each((_, row) => {
      const $row = $(row);
      const listing = parseRow($, row, $row);
      if (listing) results.push(listing);
    });

    console.log(`[scraper] ${INST}: ${results.length} listings`);
    return results;
  },
};
