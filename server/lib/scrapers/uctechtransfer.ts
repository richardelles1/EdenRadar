import * as cheerio from "cheerio";
import type { InstitutionScraper, ScrapedListing } from "./types";

const BASE = "https://techtransfer.universityofcalifornia.edu";
const UA = "Mozilla/5.0 (compatible; EdenRadar/2.0)";
const NEXT_TARGET = "ctl00$ContentPlaceHolder1$ucNCDList$ucPagination$nextPage";
const DEFAULT_MAX_PAGES = 60;

function extractListings(html: string, institution: string): ScrapedListing[] {
  const $ = cheerio.load(html);
  const results: ScrapedListing[] = [];
  $(".technology-row").each((_, row) => {
    const title = $(row).find("a.tech-link").text().trim();
    if (!title || title.length < 5) return;

    // NCDId is in a span whose id ends with _lblNCDId
    const ncdId = $(row).find("span[id$='_lblNCDId']").text().trim();
    if (!ncdId) return;

    const url = `${BASE}/NCD/Detail?NCDId=${ncdId}`;
    const description = $(row).find(".tech-info p").first().text().trim();
    results.push({ title, description, url, institution });
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

function extractTotalPages(html: string, maxPages: number): number {
  const m = html.match(/lblTotalPages[^>]*>(\d+)<\/span>/i);
  return m ? Math.min(parseInt(m[1], 10), maxPages) : 1;
}

// Node 18+ / undici 5.x exposes getSetCookie() which returns each Set-Cookie
// header as a separate string[], avoiding the collapse that happens when
// headers.forEach() receives pre-joined comma-separated values.
// The property is optional here so the else-branch stays typed as Headers.
type HeadersExt = Headers & { getSetCookie?: () => string[] };

function extractCookies(response: Response): string {
  const h = response.headers as HeadersExt;
  if (typeof h.getSetCookie === "function") {
    return h
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .filter(Boolean)
      .join("; ");
  }
  // Fallback: headers.forEach works when Set-Cookie headers are not collapsed.
  const cookies: string[] = [];
  h.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      const nameVal = value.split(";")[0];
      if (nameVal) cookies.push(nameVal);
    }
  });
  return cookies.join("; ");
}

export function createUCTechTransferScraper(
  campusCode: string,
  institution: string,
  maxPages = DEFAULT_MAX_PAGES
): InstitutionScraper {
  const listUrl = `${BASE}/Default?RunSearch=true&campus=${campusCode}`;

  return {
    institution,
    async scrape(): Promise<ScrapedListing[]> {
      console.log(`[scraper] ${institution} (campus=${campusCode}): fetching UC tech transfer pages...`);
      try {
        const res = await fetch(listUrl, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        // Carry ASP.NET session cookie across paginated POSTs
        const sessionCookie = extractCookies(res);
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
        };

        addResults(extractListings(html, institution));
        const totalPages = extractTotalPages(html, maxPages);
        console.log(`[scraper] ${institution}: page 1/${totalPages} — ${allResults.length} listings`);

        let viewState = extractViewState(html);

        for (let page = 2; page <= totalPages; page++) {
          if (!viewState.__VIEWSTATE) {
            console.warn(`[scraper] ${institution}: missing __VIEWSTATE at page ${page}, stopping`);
            break;
          }

          const body = new URLSearchParams();
          body.set("__EVENTTARGET", NEXT_TARGET);
          body.set("__EVENTARGUMENT", "");
          if (viewState.__VIEWSTATE) body.set("__VIEWSTATE", viewState.__VIEWSTATE);
          if (viewState.__VIEWSTATEGENERATOR) body.set("__VIEWSTATEGENERATOR", viewState.__VIEWSTATEGENERATOR);
          if (viewState.__EVENTVALIDATION) body.set("__EVENTVALIDATION", viewState.__EVENTVALIDATION);

          try {
            const headers: Record<string, string> = {
              "User-Agent": UA,
              "Content-Type": "application/x-www-form-urlencoded",
              "Referer": listUrl,
            };
            if (sessionCookie) headers["Cookie"] = sessionCookie;

            const postRes = await fetch(listUrl, {
              method: "POST",
              headers,
              body: body.toString(),
              signal: AbortSignal.timeout(20_000),
            });
            if (!postRes.ok) {
              console.warn(`[scraper] ${institution}: page ${page} returned ${postRes.status}, stopping`);
              break;
            }
            html = await postRes.text();
            const before = allResults.length;
            addResults(extractListings(html, institution));
            if (allResults.length === before) {
              console.log(`[scraper] ${institution}: no new listings on page ${page}, stopping`);
              break;
            }
            viewState = extractViewState(html);
          } catch (err: any) {
            console.warn(`[scraper] ${institution}: page ${page} error: ${err?.message}, stopping`);
            break;
          }
        }

        console.log(`[scraper] ${institution}: ${allResults.length} listings across ${totalPages} pages`);
        return allResults;
      } catch (err: any) {
        console.error(`[scraper] ${institution} failed: ${err?.message}`);
        return [];
      }
    },
  };
}
