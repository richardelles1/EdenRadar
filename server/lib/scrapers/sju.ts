import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const INST = "Saint Joseph's University";
const BASE = "https://www.sju.edu";
const LIST_URL = `${BASE}/research/inventions-and-discoveries`;

async function fetchDescription(url: string): Promise<string> {
  const $ = await fetchHtml(url, 12_000);
  if (!$) return "";
  $("nav, header, footer, .breadcrumb, script, style, .region-header, .region-pre-content").remove();
  // Drupal content field selectors in priority order, falling back to main
  for (const sel of [".field--name-body", ".node__content", ".region-content", "main", "article"]) {
    const el = $(sel);
    if (el.length > 0) {
      const text = cleanText(el.text());
      if (text.length > 40) return text.substring(0, 1000);
    }
  }
  return "";
}

export const sjuScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching listing page...`);
    const $ = await fetchHtml(LIST_URL, 15_000, undefined, 2, true);
    if (!$) {
      console.error(`[scraper] ${INST}: failed to fetch listing page`);
      return [];
    }

    const seen = new Set<string>();
    const links: Array<{ url: string; title: string }> = [];

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      if (!href.includes("/research/inventions-and-discoveries/")) return;
      const fullUrl = href.startsWith("http") ? href : `${BASE}${href}`;
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);
      const title = cleanText($(el).text());
      if (!title || title.length < 5) return;
      links.push({ url: fullUrl, title });
    });

    console.log(`[scraper] ${INST}: found ${links.length} invention links, fetching detail pages...`);

    const results: ScrapedListing[] = [];
    for (const { url, title } of links) {
      const description = await fetchDescription(url);
      results.push({ title, description, url, institution: INST });
    }

    console.log(`[scraper] ${INST}: ${results.length} listings scraped`);
    return results;
  },
};
