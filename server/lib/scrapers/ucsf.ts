import * as cheerio from "cheerio";
import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "University of California San Francisco";
const BASE = "https://techtransfer.universityofcalifornia.edu";
const LIST_URL = `${BASE}/Default?RunSearch=true&campus=SF`;
const UA = "Mozilla/5.0 (compatible; EdenRadar/2.0)";
const NEXT_TARGET = "ctl00$ContentPlaceHolder1$ucNCDList$ucPagination$nextPage";
const MAX_PAGES = 30;

function extractListings(html: string, institution: string): ScrapedListing[] {
  const $ = cheerio.load(html);
  const results: ScrapedListing[] = [];
  $('a.tech-link[href*="NCD/"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const title = $(el).text().trim();
    if (!title || title.length < 5) return;
    const url = href.startsWith("http") ? href : `${BASE}${href}`;
    results.push({ title, description: "", url, institution });
  });
  return results;
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

function extractTotalPages(html: string): number {
  const m = html.match(/lblTotalPages[^>]*>(\d+)<\/span>/i);
  return m ? Math.min(parseInt(m[1], 10), MAX_PAGES) : 1;
}

export const ucsfScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching campus-filtered listing pages...`);
    try {
      const res = await fetch(LIST_URL, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let html = await res.text();

      const seen = new Set<string>();
      const allResults: ScrapedListing[] = [];

      const addResults = (listings: ScrapedListing[]) => {
        for (const l of listings) {
          if (!seen.has(l.url)) {
            seen.add(l.url);
            allResults.push(l);
          }
        }
      }

      addResults(extractListings(html, INST));
      const totalPages = extractTotalPages(html);
      console.log(`[scraper] ${INST}: page 1/${totalPages} — ${allResults.length} listings`);

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

        try {
          const postRes = await fetch(LIST_URL, {
            method: "POST",
            headers: {
              "User-Agent": UA,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
            signal: AbortSignal.timeout(20_000),
          });

          if (!postRes.ok) {
            console.warn(`[scraper] ${INST}: page ${page} POST returned ${postRes.status}, stopping`);
            break;
          }

          html = await postRes.text();
          const before = allResults.length;
          addResults(extractListings(html, INST));
          const newCount = allResults.length - before;
          if (newCount === 0) {
            console.log(`[scraper] ${INST}: no new listings on page ${page}, stopping`);
            break;
          }

          viewState = extractViewState(html);
        } catch (err: any) {
          console.warn(`[scraper] ${INST}: page ${page} error: ${err?.message}, stopping`);
          break;
        }
      }

      console.log(`[scraper] ${INST}: ${allResults.length} listings across ${totalPages} pages`);
      return allResults;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
