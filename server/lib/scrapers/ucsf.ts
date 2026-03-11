import * as cheerio from "cheerio";
import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "University of California San Francisco";
const BASE = "https://techtransfer.universityofcalifornia.edu";
const LIST_URL = `${BASE}/Default?RunSearch=true&campus=SF`;

async function fetchTitle(ncdPath: string): Promise<{ url: string; title: string } | null> {
  const url = `${BASE}/${ncdPath}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    const title =
      $("h1.tech-heading-main").first().text().trim() ||
      $("h1").first().text().trim() ||
      $("title").text().replace(/\s*-\s*Available technology.*$/i, "").trim();
    if (!title) return null;
    return { url, title };
  } catch {
    return null;
  }
}

export const ucsfScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching NCD technology list...`);
    try {
      const res = await fetch(LIST_URL, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      const ncdPaths: string[] = [];
      const seen = new Set<string>();
      const re = /NCD\/(\d+)\.html/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) {
        const path = `NCD/${m[1]}.html`;
        if (!seen.has(path)) {
          seen.add(path);
          ncdPaths.push(path);
        }
      }

      console.log(`[scraper] ${INST}: found ${ncdPaths.length} NCD IDs`);

      const results: ScrapedListing[] = [];
      for (const path of ncdPaths) {
        const r = await fetchTitle(path);
        if (r) results.push({ title: r.title, description: "", url: r.url, institution: INST });
      }

      console.log(`[scraper] ${INST}: scraped ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
