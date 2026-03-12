import * as cheerio from "cheerio";
import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "University of California San Francisco";
const BASE = "https://techtransfer.universityofcalifornia.edu";
const LIST_URL = `${BASE}/Default?RunSearch=true&campus=SF`;
const UA = "Mozilla/5.0 (compatible; EdenRadar/2.0)";
const NEXT_TARGET = "ctl00$ContentPlaceHolder1$ucNCDList$ucPagination$nextPage";

function extractNcdPaths(html: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  const re = /NCD\/(\d+)\.html/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const path = `NCD/${m[1]}.html`;
    if (!seen.has(path)) {
      seen.add(path);
      paths.push(path);
    }
  }
  return paths;
}

function extractViewState(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const name of ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"]) {
    const re = new RegExp(`id="${name}"[^>]*value="([^"]*)"`);
    const m = html.match(re);
    if (m) fields[name] = m[1];
  }
  return fields;
}

const MAX_PAGES = 30;

function extractTotalPages(html: string): number {
  const m = html.match(/lblTotalPages[^>]*>(\d+)<\/span>/i);
  return m ? Math.min(parseInt(m[1], 10), MAX_PAGES) : MAX_PAGES;
}

async function fetchTitle(ncdPath: string): Promise<{ url: string; title: string } | null> {
  const url = `${BASE}/${ncdPath}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15_000),
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
    console.log(`[scraper] ${INST}: fetching NCD technology list (all pages)...`);
    try {
      const res = await fetch(LIST_URL, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let html = await res.text();

      const allNcdPaths: string[] = [];
      const globalSeen = new Set<string>();

      const page1Paths = extractNcdPaths(html);
      for (const p of page1Paths) {
        if (!globalSeen.has(p)) { globalSeen.add(p); allNcdPaths.push(p); }
      }

      const totalPages = extractTotalPages(html);
      console.log(`[scraper] ${INST}: page 1/${totalPages} — ${page1Paths.length} NCD IDs`);

      let viewState = extractViewState(html);

      for (let page = 2; page <= totalPages; page++) {
        if (!viewState.__VIEWSTATE) {
          console.warn(`[scraper] ${INST}: missing __VIEWSTATE at page ${page}, stopping`);
          break;
        }

        const body = new URLSearchParams();
        body.set("__EVENTTARGET", NEXT_TARGET);
        body.set("__EVENTARGUMENT", "");
        if (viewState.__VIEWSTATE) body.set("__VIEWSTATE", viewState.__VIEWSTATE);
        if (viewState.__VIEWSTATEGENERATOR) body.set("__VIEWSTATEGENERATOR", viewState.__VIEWSTATEGENERATOR);
        if (viewState.__EVENTVALIDATION) body.set("__EVENTVALIDATION", viewState.__EVENTVALIDATION);

        const postRes = await fetch(LIST_URL, {
          method: "POST",
          headers: {
            "User-Agent": UA,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
          signal: AbortSignal.timeout(15_000),
        });

        if (!postRes.ok) {
          console.warn(`[scraper] ${INST}: page ${page} POST returned ${postRes.status}, stopping`);
          break;
        }

        html = await postRes.text();
        const pagePaths = extractNcdPaths(html);
        let newCount = 0;
        for (const p of pagePaths) {
          if (!globalSeen.has(p)) { globalSeen.add(p); allNcdPaths.push(p); newCount++; }
        }
        console.log(`[scraper] ${INST}: page ${page}/${totalPages} — ${pagePaths.length} NCD IDs, ${newCount} new (total: ${allNcdPaths.length})`);
        if (newCount === 0) {
          console.log(`[scraper] ${INST}: no new IDs on page ${page}, stopping pagination`);
          break;
        }

        viewState = extractViewState(html);
      }

      console.log(`[scraper] ${INST}: collected ${allNcdPaths.length} NCD IDs across ${totalPages} pages, fetching titles...`);

      const results: ScrapedListing[] = [];
      const BATCH = 10;
      for (let i = 0; i < allNcdPaths.length; i += BATCH) {
        const batch = allNcdPaths.slice(i, i + BATCH);
        const fetched = await Promise.all(batch.map(fetchTitle));
        for (const r of fetched) {
          if (r) results.push({ title: r.title, description: "", url: r.url, institution: INST });
        }
      }

      console.log(`[scraper] ${INST}: scraped ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
