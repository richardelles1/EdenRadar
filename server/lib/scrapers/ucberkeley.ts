import * as cheerio from "cheerio";
import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "UC Berkeley";
const BASE_URL = "https://techtransfer.universityofcalifornia.edu";
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

async function fetchTitle(ncdPath: string): Promise<{ url: string; title: string } | null> {
  const url = `${BASE_URL}/${ncdPath}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    const title = $("h1.tech-heading-main").first().text().trim()
      || $("h1").first().text().trim()
      || $("title").text().replace(/\s*-\s*Available technology.*$/i, "").trim();
    if (!title) return null;
    return { url, title };
  } catch {
    return null;
  }
}

export const ucBerkeleyScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching NCD technology pages from sitemap...`);
    try {
      const res = await fetch(SITEMAP_URL, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
      });
      if (!res.ok) throw new Error(`sitemap HTTP ${res.status}`);
      const xml = await res.text();

      const ncdPaths: string[] = [];
      const re = /NCD\/(\d+)\.html/g;
      let m: RegExpExecArray | null;
      const seen = new Set<string>();
      while ((m = re.exec(xml)) !== null) {
        const path = `NCD/${m[1]}.html`;
        if (!seen.has(path)) {
          seen.add(path);
          ncdPaths.push(path);
        }
      }

      console.log(`[scraper] ${INST}: found ${ncdPaths.length} NCD tech IDs in sitemap`);

      const tasks = ncdPaths.map((path) => () => fetchTitle(path));
      const results = await runWithConcurrency(tasks, 4);

      const listings: ScrapedListing[] = results
        .filter((r): r is { url: string; title: string } => r !== null)
        .map(({ url, title }) => ({ title, description: "", url, institution: INST }));

      console.log(`[scraper] ${INST}: scraped ${listings.length} listings`);
      return listings;
    } catch (err: any) {
      console.error(`[scraper] ${INST}: error — ${err.message}`);
      return [];
    }
  },
};
