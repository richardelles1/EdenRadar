import { createTechPublisherScraper } from "./techpublisher";
import { createFlintboxScraper } from "./flintbox";
import { createUCTechTransferScraper } from "./uctechtransfer";
import { fetchHtml, cleanText } from "./utils";
import type { InstitutionScraper, ScrapedListing } from "./types";

function createStubScraper(institution: string, reason = "no public TTO listing portal"): InstitutionScraper {
  return {
    institution,
    async scrape(): Promise<ScrapedListing[]> {
      console.log(`[scraper] ${institution}: skipped — ${reason}`);
      return [];
    },
  };
}

const IN_PART_API = "https://app.in-part.com/api/v3/public/opportunities";
const IN_PART_LIMIT = 24;

function createInPartScraper(subdomain: string, institution: string): InstitutionScraper {
  return {
    institution,
    async probe(maxResults = 3): Promise<ScrapedListing[]> {
      const portalBase = `https://${subdomain}.portals.in-part.com`;
      const url = `${IN_PART_API}?portalSubdomain=${subdomain}&page=1&limit=${maxResults}`;
      try {
        const res = await fetch(url, {
          headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) throw new Error(`API HTTP ${res.status}`);
        const data = await res.json();
        const results: any[] = data?.data?.results ?? data?.results ?? [];
        return results.slice(0, maxResults).map((r: any) => ({
          title: (r.title ?? "").trim(),
          description: "",
          url: `${portalBase}/${r.idHash ?? r.id ?? ""}`,
          institution,
        })).filter((r: ScrapedListing) => r.title.length > 0);
      } catch {
        return [];
      }
    },
    async scrape(): Promise<ScrapedListing[]> {
      const portalBase = `https://${subdomain}.portals.in-part.com`;

      try {
        const firstUrl = `${IN_PART_API}?portalSubdomain=${subdomain}&page=1&limit=${IN_PART_LIMIT}`;
        const firstRes = await fetch(firstUrl, {
          headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!firstRes.ok) throw new Error(`API page 1 HTTP ${firstRes.status}`);

        const firstData = await firstRes.json();
        const page1Results: any[] = firstData?.data?.results ?? firstData?.results ?? [];
        const pagination = firstData?.data?.pagination ?? firstData?.pagination ?? {};
        const totalPages = pagination.last ?? 1;

        if (page1Results.length === 0) {
          const ssrRes = await fetch(`${portalBase}/`, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
            signal: AbortSignal.timeout(15_000),
          });
          if (ssrRes.ok) {
            const html = await ssrRes.text();
            const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/);
            if (m) {
              const nd = JSON.parse(m[1]);
              const queries = nd?.props?.pageProps?.dehydratedState?.queries ?? [];
              const pg = queries[0]?.state?.data?.pages?.[0];
              if (pg?.results?.length > 0) {
                const ssrTotal = pg.pagination?.last ?? 1;
                const ssrCount = pg.pagination?.count ?? pg.results.length;
                const results: ScrapedListing[] = pg.results
                  .map((r: any) => ({
                    title: (r.title ?? "").trim(),
                    description: "",
                    url: `${portalBase}/${r.idHash}`,
                    institution,
                  }))
                  .filter((r: ScrapedListing) => r.title.length > 0);
                if (ssrTotal > 1) {
                  console.warn(`[scraper] ${institution}: SSR fallback got ${results.length}/${ssrCount} listings (page 1 of ${ssrTotal} — API unavailable, SSR cannot paginate)`);
                } else {
                  console.log(`[scraper] ${institution}: ${results.length} listings (in-part SSR fallback)`);
                }
                return results;
              }
            }
          }
          console.log(`[scraper] ${institution}: 0 results (in-part API empty, SSR fallback empty)`);
          return [];
        }

        const allResults: ScrapedListing[] = page1Results
          .map((r: any) => ({
            title: (r.title ?? "").trim(),
            description: "",
            url: `${portalBase}/${r.idHash ?? r.id ?? ""}`,
            institution,
          }))
          .filter((r: ScrapedListing) => r.title.length > 0);

        for (let pg = 2; pg <= totalPages; pg++) {
          try {
            const pgUrl = `${IN_PART_API}?portalSubdomain=${subdomain}&page=${pg}&limit=${IN_PART_LIMIT}`;
            const pgRes = await fetch(pgUrl, {
              headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
              signal: AbortSignal.timeout(15_000),
            });
            if (!pgRes.ok) break;
            const pgData = await pgRes.json();
            const pgResults: any[] = pgData?.data?.results ?? pgData?.results ?? [];
            if (pgResults.length === 0) break;
            for (const r of pgResults) {
              const title = (r.title ?? "").trim();
              if (!title || title.length < 3) continue;
              allResults.push({
                title,
                description: "",
                url: `${portalBase}/${r.idHash ?? r.id ?? ""}`,
                institution,
              });
            }
          } catch (err: any) {
            console.warn(`[scraper] ${institution} (in-part API page ${pg}): ${err?.message}`);
            break;
          }
        }

        console.log(`[scraper] ${institution}: ${allResults.length} listings (in-part API, ${totalPages} pages)`);
        return allResults;
      } catch (err: any) {
        console.error(`[scraper] ${institution} (in-part) failed: ${err?.message}`);
        return [];
      }
    },
  };
}

function createWordPressApiScraper(
  baseUrl: string,
  postType: string,
  institution: string
): InstitutionScraper {
  return {
    institution,
    async scrape(): Promise<ScrapedListing[]> {
      const results: ScrapedListing[] = [];
      let page = 1;
      while (page <= 50) {
        try {
          const res = await fetch(
            `${baseUrl}/wp-json/wp/v2/${postType}?per_page=100&page=${page}`,
            {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
              signal: AbortSignal.timeout(10000),
            }
          );
          if (!res.ok) break;
          const items: any[] = await res.json();
          if (!Array.isArray(items) || items.length === 0) break;
          for (const item of items) {
            const title = (item.title?.rendered ?? "").replace(/<[^>]+>/g, "").trim();
            if (title.length > 0) {
              results.push({
                title,
                description: "",
                url: item.link ?? `${baseUrl}/${postType}/${item.slug}/`,
                institution,
              });
            }
          }
          if (items.length < 100) break;
          page++;
        } catch {
          break;
        }
      }
      console.log(`[scraper] ${institution}: ${results.length} listings (WordPress API, ${page} pages)`);
      return results;
    },
  };
}

function createMontanaStateScraper(): InstitutionScraper {
  const institution = "Montana State University";
  return {
    institution,
    async scrape(): Promise<ScrapedListing[]> {
      const indexUrl = "https://tto.montana.edu/for-industry/index.html";
      try {
        const res = await fetch(indexUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return [];
        const html = await res.text();
        const linkRe = /href="(\/links\/techops\/[^"]+\.html)"/g;
        const hrefs: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = linkRe.exec(html)) !== null) {
          if (!hrefs.includes(m[1])) hrefs.push(m[1]);
        }
        const results: ScrapedListing[] = [];
        for (const href of hrefs) {
          try {
            const pageRes = await fetch(`https://tto.montana.edu${href}`, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
              signal: AbortSignal.timeout(8000),
            });
            if (!pageRes.ok) continue;
            const pageHtml = await pageRes.text();
            const titleMatch = pageHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i) ??
              pageHtml.match(/<title>([^<]+)<\/title>/i);
            const title = titleMatch ? titleMatch[1].replace(/\s*[-|].*$/, "").trim() : "";
            if (title.length > 5) {
              results.push({
                title,
                description: "",
                url: `https://tto.montana.edu${href}`,
                institution,
              });
            }
          } catch {
            continue;
          }
        }
        console.log(`[scraper] ${institution}: ${results.length} listings (${hrefs.length} pages found)`);
        return results;
      } catch (err: any) {
        console.warn(`[scraper] ${institution}: ${err?.message}`);
        return [];
      }
    },
  };
}

// ── Verified working TechPublisher scrapers ──────────────────────────────
export const princetonScraper = createTechPublisherScraper(
  "puotl",
  "Princeton University",
  { maxPg: 80 }
);

export const uclaScraper = createUCTechTransferScraper("LA", "UCLA");

export const brownScraper = createTechPublisherScraper(
  "brown",
  "Brown University",
  { maxPg: 50 }
);

export const rochesterScraper = createTechPublisherScraper(
  "rochester",
  "University of Rochester",
  { maxPg: 80 }
);

export const tuftsScraper = createTechPublisherScraper(
  "tufts",
  "Tufts University",
  { maxPg: 50 }
);

export const uthealthScraper = createTechPublisherScraper(
  "uthealth",
  "UT Health",
  { maxPg: 50 }
);

export const coloradoStateScraper = createTechPublisherScraper(
  "csuventures",
  "Colorado State University",
  { maxPg: 50 }
);

export const virginiaTechScraper = createTechPublisherScraper(
  "vtip",
  "Virginia Tech",
  { maxPg: 80 }
);

export const usfScraper = createTechPublisherScraper(
  "usf",
  "University of South Florida",
  { maxPg: 80 }
);

export const wayneScraper = createTechPublisherScraper(
  "wayne",
  "Wayne State University",
  { maxPg: 80 }
);

export const utDallasScraper = createTechPublisherScraper(
  "utdallas",
  "UT Dallas",
  { maxPg: 50 }
);

export const msStateScraper = createTechPublisherScraper(
  "msstate-innovations",
  "Mississippi State University",
  { maxPg: 30 }
);

export const utToledoScraper = createTechPublisherScraper(
  "utoledo",
  "University of Toledo",
  { maxPg: 30 }
);

export const njitScraper = createTechPublisherScraper(
  "njit",
  "New Jersey Institute of Technology",
  { maxPg: 30 }
);

export const calPolyScraper = createTechPublisherScraper(
  "calpoly",
  "Cal Poly San Luis Obispo",
  { maxPg: 20 }
);

export const sluScraper = createTechPublisherScraper(
  "slu",
  "Saint Louis University",
  { maxPg: 30 }
);

export const ucDavisScraper = createUCTechTransferScraper("D", "UC Davis");
export const ucIrvineScraper = createUCTechTransferScraper("I", "UC Irvine");
export const ucRiversideScraper = createUCTechTransferScraper("R", "UC Riverside");
export const ucSantaBarbaraScraper = createUCTechTransferScraper("SB", "UC Santa Barbara");
export const ucSantaCruzScraper = createUCTechTransferScraper("SC", "UC Santa Cruz");

export const utahScraper = createTechPublisherScraper(
  "utah",
  "University of Utah",
  { maxPg: 80 }
);

export const uvaScraper = createTechPublisherScraper(
  "uva",
  "University of Virginia",
  { maxPg: 80 }
);

export const uOregonScraper = createTechPublisherScraper(
  "uoregon",
  "University of Oregon",
  { maxPg: 30 }
);

export const gwuScraper = createTechPublisherScraper(
  "gwu",
  "George Washington University",
  { maxPg: 30 }
);

export const czBiohubScraper = createTechPublisherScraper(
  "czbiohub",
  "CZ Biohub",
  { maxPg: 20 }
);

export const muscScraper = createTechPublisherScraper(
  "musc",
  "Medical University of South Carolina",
  { maxPg: 30 }
);

export const southCarolinaScraper = createTechPublisherScraper(
  "sc",
  "University of South Carolina",
  { maxPg: 30 }
);

export const lehighScraper = createTechPublisherScraper(
  "lehighott",
  "Lehigh University",
  { maxPg: 30 }
);

export const clemsonScraper = createTechPublisherScraper(
  "curf",
  "Clemson University",
  { maxPg: 50 }
);

export const iowaStateScraper = createTechPublisherScraper(
  "isurftech",
  "Iowa State University",
  { maxPg: 50 }
);

export const tgenScraper = createTechPublisherScraper(
  "tgen",
  "Translational Genomics Research Institute",
  { maxPg: 20 }
);

export const wsuScraper = createTechPublisherScraper(
  "wsu",
  "Washington State University",
  { selector: "a[href*='/techcase']", maxPg: 80 }
);

export const arizonaScraper = createTechPublisherScraper(
  "arizona",
  "University of Arizona",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 80, maxCats: 30, institutionTimeoutMs: 270_000 }
);

export const pennStateScraper = createFlintboxScraper(
  { slug: "psu", orgId: 196, accessKey: "4aaaa84c-fa95-4181-bd42-b907e00a73f7" },
  "Penn State University"
);

export const rutgersScraper = createTechPublisherScraper(
  "rutgers",
  "Rutgers University",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 80 }
);

export const stevensScraper = createTechPublisherScraper(
  "stevens",
  "Stevens Institute of Technology",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 30 }
);

export const rpiScraper = createTechPublisherScraper(
  "rpi",
  "Rensselaer Polytechnic Institute",
  { maxPg: 50 }
);

export const stonyBrookScraper = createTechPublisherScraper(
  "stonybrook",
  "Stony Brook University",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 50 }
);

export const cincinnatiScraper = createTechPublisherScraper(
  "uc",
  "University of Cincinnati",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 50 }
);

export const buffaloScraper = createTechPublisherScraper(
  "buffalo",
  "University at Buffalo",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 50 }
);

export const rowanScraper = createTechPublisherScraper(
  "rowan",
  "Rowan University",
  { maxPg: 30 }
);

export const georgemasonScraper = createTechPublisherScraper(
  "mason",
  "George Mason University",
  { maxPg: 50 }
);

export const umaineScraper = createTechPublisherScraper(
  "umaine",
  "University of Maine",
  { maxPg: 30 }
);

export const binghamtonScraper = createTechPublisherScraper(
  "binghamton",
  "Binghamton University",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 50 }
);

export const uscScraper = createTechPublisherScraper(
  "usc",
  "University of Southern California",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 80 }
);

export const oregonStateScraper = createTechPublisherScraper(
  "oregonstate",
  "Oregon State University",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 80 }
);

export const gsuScraper = createTechPublisherScraper(
  "gsu",
  "Georgia State University",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 50 }
);

export const northeasternScraper = createTechPublisherScraper(
  "nu",
  "Northeastern University",
  { maxPg: 50 }
);

export const uvmScraper = createTechPublisherScraper(
  "uvm",
  "University of Vermont",
  { selector: "a[href*='/techcase']", maxPg: 30 }
);

export const usdScraper = createTechPublisherScraper(
  "usd",
  "University of South Dakota",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 20 }
);

export const txstateScraper = createTechPublisherScraper(
  "txstate",
  "Texas State University",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 30 }
);

export const miamiScraper = createTechPublisherScraper(
  "miami",
  "University of Miami",
  { maxPg: 50 }
);

export const upstateScraper = createTechPublisherScraper(
  "upstate",
  "SUNY Upstate Medical University",
  { maxPg: 30 }
);

export const sunyScraper = createTechPublisherScraper(
  "suny",
  "SUNY System",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 20 }
);

export const alabamaScraper = createTechPublisherScraper(
  "ua",
  "University of Alabama",
  { maxPg: 50 }
);

export const wyomingScraper = createTechPublisherScraper(
  "uwyo",
  "University of Wyoming",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 20 }
);

export const idahoScraper = createTechPublisherScraper(
  "uidaho",
  "University of Idaho",
  { maxPg: 30 }
);

// ── New US: verified working TechPublisher slugs ─────────────────────────
export const uafScraper = createTechPublisherScraper("uaf", "University of Alaska Fairbanks", { maxPg: 20 });
export const sdstateScraper = createTechPublisherScraper("sdstate", "South Dakota State University", { maxPg: 30 });
export const olemissScraper = createTechPublisherScraper("olemiss", "University of Mississippi", { maxPg: 30 });

// ── New US: verified working TechPublisher slugs (international) ─────────
export const leedsScraper = createTechPublisherScraper("leeds", "University of Leeds", { maxPg: 50 });
export const southamptonScraper = createTechPublisherScraper("southampton", "University of Southampton", { maxPg: 50 });
export const usaskScraper = createTechPublisherScraper("usask", "University of Saskatchewan", { maxPg: 30 });

// ── New US: no TechPublisher portal (stubs) ──────────────────────────────
export { fsuScraper } from "./fsu";
export const ucfScraper = createFlintboxScraper(
  { slug: "ucf", orgId: 82, accessKey: "735da6c7-5d27-4015-bb46-60b45f80225d" },
  "University of Central Florida"
);
export const fiuScraper = createFlintboxScraper(
  { slug: "fiu", orgId: 21, accessKey: "283480d5-1f72-4bb5-bb3e-c46d7ce23ea3" },
  "Florida International University"
);
export const tamuScraper = createFlintboxScraper(
  { slug: "tamus", orgId: 100, accessKey: "1ebc3006-5557-499d-94b3-72f24dbbf5e8" },
  "Texas A&M University"
);
export const riceScraper = createInPartScraper("rice", "Rice University");
export const uhoustonScraper: InstitutionScraper = {
  institution: "University of Houston",
  async scrape(): Promise<ScrapedListing[]> {
    const url = "https://www.uh.edu/uh-energy-innovation/uh-innovation/technologies/";
    try {
      const $ = await fetchHtml(url, 15000);
      if (!$) return [];
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();
      $('a[href*="catalog/technologies.php?id="]').each((_, el) => {
        const href = $(el).attr("href") ?? "";
        const title = cleanText($(el).text());
        if (!title || title.length < 5) return;
        const fullUrl = href.startsWith("http") ? href : `https://www.uh.edu${href}`;
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);
        results.push({ title, description: "", url: fullUrl, institution: "University of Houston" });
      });
      console.log(`[scraper] University of Houston: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.warn(`[scraper] University of Houston: ${err?.message}`);
      return [];
    }
  },
};
export const texasTechScraper = createStubScraper("Texas Tech University", "Flintbox API deprecated, no public alternative found");
export const untScraper = createStubScraper("University of North Texas");
export const baylorScraper = createInPartScraper("bcm", "Baylor College of Medicine");
export const portlandStateScraper = createInPartScraper("pdx", "Portland State University");
export const umontanaScraper = createStubScraper("University of Montana");
export const montanaStateScraper = createMontanaStateScraper();
export const unmScraper = createStubScraper("University of New Mexico", "unm.flintbox.com — JS-rendered, no accessible public API; requires headless browser or credentials");
export const nmsuScraper = createStubScraper("New Mexico State University");
export const unrScraper = createStubScraper("University of Nevada, Reno");
export const unlvScraper = createTechPublisherScraper("unlvecondev", "University of Nevada, Las Vegas");
export const usuScraper = createFlintboxScraper(
  { slug: "usu", orgId: 198, accessKey: "6af4c512-15e2-4213-bb3f-3b7e904a0e43" },
  "Utah State University"
);
export const byuScraper = createStubScraper("Brigham Young University");
export const uaaScraper = createStubScraper("University of Alaska Anchorage");
export const undScraper: InstitutionScraper = {
  institution: "University of North Dakota",
  async scrape(): Promise<ScrapedListing[]> {
    const url = "https://und.edu/research/corporate-engagement-commercialization/available-technologies.html";
    try {
      const $ = await fetchHtml(url, 15000);
      if (!$) return [];
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();
      $('a[href*="_files/docs/available-technologies/"]').each((_, el) => {
        const href = $(el).attr("href") ?? "";
        const title = cleanText($(el).text());
        if (!title || title.length < 5) return;
        const fullUrl = href.startsWith("http") ? href : `https://und.edu${href}`;
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);
        results.push({ title, description: "", url: fullUrl, institution: "University of North Dakota" });
      });
      if (results.length === 0) {
        $("a[href$='.pdf']").each((_, el) => {
          const href = $(el).attr("href") ?? "";
          if (!href.includes("available-technolog")) return;
          const title = cleanText($(el).text());
          if (!title || title.length < 5) return;
          const fullUrl = href.startsWith("http") ? href : `https://und.edu${href}`;
          if (seen.has(fullUrl)) return;
          seen.add(fullUrl);
          results.push({ title, description: "", url: fullUrl, institution: "University of North Dakota" });
        });
      }
      console.log(`[scraper] University of North Dakota: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.warn(`[scraper] University of North Dakota: ${err?.message}`);
      return [];
    }
  },
};
export const ndsuScraper = createTechPublisherScraper("ndsurf", "North Dakota State University", { maxPg: 30 });
export const indianaScraper = createFlintboxScraper(
  { slug: "iu", orgId: 66, accessKey: "3548b15d-a08c-49ca-b3a3-6a4eb981205b" },
  "Indiana University"
);
export const notredameScraper = createInPartScraper("nd", "University of Notre Dame");
// WARF HTML crawl: /wp-json/warf/v1/technologies returns 404 — no REST API exists.
// This approach scrapes category options from /commercialize/technologies/ then
// concurrently fetches search results per-category. Verified: 1,525 listings (140 categories).
export const warfScraper: InstitutionScraper = {
  institution: "University of Wisconsin",
  async scrape(): Promise<ScrapedListing[]> {
    const base = "https://www.warf.org";
    const techPageUrl = `${base}/commercialize/technologies/`;
    const searchUrl = `${base}/search-results/?searchwp=&search-technology=1`;
    const results: ScrapedListing[] = [];
    const seen = new Set<string>();
    try {
      const $index = await fetchHtml(techPageUrl, 15000);
      if (!$index) {
        console.warn(`[scraper] University of Wisconsin (WARF): failed to load technologies page`);
        return [];
      }
      const categories: string[] = [];
      $index("select option").each((_, el) => {
        const val = $index(el).attr("value") ?? "";
        if (val && val.length > 2) {
          categories.push(val);
        }
      });
      const catSet = new Set(categories);
      const uniqueCats = Array.from(catSet);
      console.log(`[scraper] University of Wisconsin (WARF): found ${uniqueCats.length} categories, fetching...`);

      const CONCURRENCY = 5;
      let catIdx = 0;
      const worker = async () => {
        while (catIdx < uniqueCats.length) {
          const cat = uniqueCats[catIdx++];
          const catUrl = `${searchUrl}&s_tech_category=${encodeURIComponent(cat)}`;
          try {
            const $ = await fetchHtml(catUrl, 12000);
            if (!$) continue;
            $('a[href*="/technologies/summary/"]').each((_, el) => {
              const href = $(el).attr("href") ?? "";
              const title = cleanText($(el).text());
              if (!title || title.length < 5) return;
              const fullUrl = href.startsWith("http") ? href : `${base}${href}`;
              if (seen.has(fullUrl)) return;
              seen.add(fullUrl);
              results.push({ title, description: "", url: fullUrl, institution: "University of Wisconsin" });
            });
          } catch {
            continue;
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

      console.log(`[scraper] University of Wisconsin (WARF): ${results.length} listings (${uniqueCats.length} categories)`);
      return results;
    } catch (err: any) {
      console.warn(`[scraper] University of Wisconsin (WARF): ${err?.message}`);
      return results;
    }
  },
};
export const auburnScraper = createInPartScraper("auburn", "Auburn University");
export const ugaScraper = createInPartScraper("uga", "University of Georgia");
export const uarkansasScraper = createStubScraper("University of Arkansas", "Flintbox API deprecated, no public alternative found");
export const uamsScraper = createStubScraper("University of Arkansas for Medical Sciences");
export const udelScraper = createStubScraper("University of Delaware", "Flintbox API deprecated, no public alternative found");
export const templeScraper = createStubScraper("Temple University");
export const drexelScraper = createTechPublisherScraper("drexelotc", "Drexel University", { maxPg: 50 });
export const bucknellScraper = createStubScraper("Bucknell University");
export const sunyalbanyScraper = createStubScraper("SUNY Albany");
// UConn Flintbox API still works (verified: 298 items). Intentionally kept.
export const uconnScraper = createFlintboxScraper(
  { slug: "uconn", orgId: 106, accessKey: "c9a1cb21-6c5e-437c-9662-9492efa1205a" },
  "University of Connecticut"
);
export { dartmouthScraper } from "./dartmouth";
export const brandeisScraper = createStubScraper("Brandeis University", "Flintbox API deprecated, no public alternative found");
export const unhScraper = createStubScraper("University of New Hampshire");
export const uriScraper = createStubScraper("University of Rhode Island", "Flintbox API deprecated, no public alternative found");
export const mountsinaiScraper = createInPartScraper("mountsinai", "Icahn School of Medicine at Mount Sinai");
export const caltechScraper = createStubScraper("California Institute of Technology");
export const asuScraper = createWordPressApiScraper("https://skysonginnovations.com", "technology", "Arizona State University");

// ── International: UK ────────────────────────────────────────────────────
export const oxfordScraper = createStubScraper("University of Oxford");
export const imperialScraper = createStubScraper("Imperial College London");
export const uclScraper = createStubScraper("University College London");
export const manchesterScraper = createInPartScraper("manchester", "University of Manchester");
export const edinburghScraper = createStubScraper("University of Edinburgh");
export const bristolScraper = createStubScraper("University of Bristol");
export const glasgowScraper = createStubScraper("University of Glasgow");
export const birminghamScraper = createStubScraper("University of Birmingham");
export const nottinghamScraper = createStubScraper("University of Nottingham");
export const sheffieldScraper = createStubScraper("University of Sheffield");
export const warwickScraper = createStubScraper("University of Warwick");
export const kclScraper = createInPartScraper("kcl", "King's College London");
export const liverpoolScraper = createInPartScraper("liverpool", "University of Liverpool");
export const durhamInPartScraper = createInPartScraper("durham", "Durham University");

// ── International: Switzerland ───────────────────────────────────────────
export const ethzurichScraper = createInPartScraper("ethz", "ETH Zurich");
export const epflScraper = createStubScraper("EPFL");
export const ubaselScraper = createStubScraper("University of Basel");
export const ulausanneScraper = createStubScraper("University of Lausanne");
export const ugenevaScraper = createStubScraper("University of Geneva");
export const uzurichScraper = createStubScraper("University of Zurich");

// ── International: Benelux ───────────────────────────────────────────────
export const kuleuvenScraper = createStubScraper("KU Leuven");
export const ugentScraper = createStubScraper("Ghent University");
export const groningenScraper = createStubScraper("University of Groningen");
export const uamsterdamScraper = createStubScraper("University of Amsterdam");
export const vuamsterdamScraper = createStubScraper("Vrije Universiteit Amsterdam");
export const leidenScraper = createStubScraper("Leiden University");

// ── International: Nordic ────────────────────────────────────────────────
export const karolinskaScraper = createStubScraper("Karolinska Institutet");
export const inven2Scraper = createStubScraper("University of Oslo");
export const visScraper = createStubScraper("University of Bergen");
export const ntnuScraper = createStubScraper("NTNU");
export const ucphScraper = createStubScraper("University of Copenhagen");
export const aarhusScraper = createStubScraper("Aarhus University");
export const dtuScraper = createStubScraper("Technical University of Denmark");
export const lundScraper = createStubScraper("Lund University");
export const chalmersScraper = createStubScraper("Chalmers University of Technology");
export const gothenburgScraper = createStubScraper("University of Gothenburg");
export const helsinkiScraper = createInPartScraper("helsinki", "University of Helsinki");
export const aaltoScraper = createInPartScraper("aalto", "Aalto University");
export const tampereScraper = createInPartScraper("tampere", "Tampere University");

// ── International: Germany ───────────────────────────────────────────────
export const tumScraper = createStubScraper("Technical University of Munich");
export const lmuScraper = createInPartScraper("lmu", "Ludwig Maximilian University of Munich");
export const rwthScraper = createInPartScraper("rwth", "RWTH Aachen University");
export const ufreiburgScraper = createStubScraper("University of Freiburg");
export const ubonnScraper = createStubScraper("University of Bonn");
export const ucologneScraper = createStubScraper("University of Cologne");
export const utubingenScraper = createStubScraper("University of Tübingen");
export const heidelbergScraper = createStubScraper("University of Heidelberg");

// ── International: Israel ────────────────────────────────────────────────
export const weizmannScraper = createStubScraper("Weizmann Institute of Science");
export const technionScraper = createStubScraper("Technion – Israel Institute of Technology");

// ── International: Ireland ───────────────────────────────────────────────
export const tcdScraper = createInPartScraper("tcd", "Trinity College Dublin");
export const ulbScraper = createInPartScraper("ulb", "Université Libre de Bruxelles");

// ── International: Canada ────────────────────────────────────────────────
export const utorontoScraper = createInPartScraper("toronto", "University of Toronto");
export const westernScraper = createInPartScraper("western", "Western University");
export const queensuScraper = createInPartScraper("queensu", "Queen's University");
export const ualbertaScraper = createInPartScraper("ualberta", "University of Alberta");
export const mcgillScraper = createStubScraper("McGill University", "Flintbox API deprecated, no public alternative found");
export const ubcScraper = createInPartScraper("ubc", "University of British Columbia");
export const ucalgaryScraper = createStubScraper("University of Calgary", "Flintbox API deprecated, no public alternative found");
export const umanitobaScraper = createInPartScraper("manitoba", "University of Manitoba");
export const uvicScraper = createInPartScraper("uvic", "University of Victoria");
export const sfuScraper: InstitutionScraper = {
  institution: "Simon Fraser University",
  async scrape(): Promise<ScrapedListing[]> {
    const url = "https://www.sfu.ca/technology-licensing/industry/our-technologies.html";
    try {
      const $ = await fetchHtml(url, 15000);
      if (!$) return [];
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();
      $("a[href$='.pdf']").each((_, el) => {
        const href = $(el).attr("href") ?? "";
        if (!href.includes("technology-licensing")) return;
        const title = cleanText($(el).text());
        if (!title || title.length < 5) return;
        const fullUrl = href.startsWith("http") ? href : `https://www.sfu.ca${href}`;
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);
        results.push({ title, description: "", url: fullUrl, institution: "Simon Fraser University" });
      });
      if (results.length === 0) {
        $('a[href*="/technology-licensing/"]').each((_, el) => {
          const href = $(el).attr("href") ?? "";
          if (href === url || href.includes("industry") || href.includes("contact")) return;
          const title = cleanText($(el).text());
          if (!title || title.length < 5) return;
          const fullUrl = href.startsWith("http") ? href : `https://www.sfu.ca${href}`;
          if (seen.has(fullUrl)) return;
          seen.add(fullUrl);
          results.push({ title, description: "", url: fullUrl, institution: "Simon Fraser University" });
        });
      }
      console.log(`[scraper] Simon Fraser University: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.warn(`[scraper] Simon Fraser University: ${err?.message}`);
      return [];
    }
  },
};

// ── International: Asia-Pacific ──────────────────────────────────────────
export const umelbourneScraper = createStubScraper("University of Melbourne");
export const monashScraper = createFlintboxScraper(
  { slug: "monash", orgId: 38, accessKey: "57961255-e861-4776-80d1-33fc26ed5786" },
  "Monash University"
);
export const usydneyScraper = createStubScraper("University of Sydney");
export const uniquestScraper = createStubScraper("University of Queensland");
export const nusScraper = createStubScraper("National University of Singapore", "Flintbox API deprecated, no public alternative found");
export const hkustScraper = createStubScraper("Hong Kong University of Science and Technology");
export const hkuScraper = createStubScraper("University of Hong Kong");
export const griffithScraper = createInPartScraper("griffith", "Griffith University");
export const ntuScraper = createInPartScraper("ntu", "Nottingham Trent University");

// ── Additional US (in-part) ─────────────────────────────────────────────
export const uhawScraper = createInPartScraper("hawaii", "University of Hawaii");

// ── Flintbox batch (March 2026) — credentials extracted from page source ─
export const uiowaScraper = createFlintboxScraper(
  { slug: "uiowa", orgId: 42, accessKey: "3fc3085f-bc68-4c36-b0d2-03136e9f46bc" },
  "University of Iowa"
);
export const bidmcScraper = createFlintboxScraper(
  { slug: "bidmc", orgId: 64, accessKey: "b4d0c328-acae-4410-bdae-052fe53b61dc" },
  "Beth Israel Deaconess Medical Center"
);
export const northumbriaScraper = createFlintboxScraper(
  { slug: "northumbriaknowledgebank", orgId: 165, accessKey: "05cd9241-6f72-40c0-87ad-4ef62029d860" },
  "Northumbria University"
);
export const cmuScraper = createFlintboxScraper(
  { slug: "cmu", orgId: 18, accessKey: "c6a38f07-02cb-4ecb-88b2-a4cbb1b10702" },
  "Carnegie Mellon University"
);
export const kyotoIcemsScraper = createFlintboxScraper(
  { slug: "icems", orgId: 120, accessKey: "c168ecd8-5d85-42e0-bcd3-8c43b0b2b981" },
  "Kyoto University (ICEMS)"
);
export const smuFlintboxScraper = createFlintboxScraper(
  { slug: "smutechnologies", orgId: 135, accessKey: "b0c95f72-9597-45b8-a90a-b4add399abcf" },
  "Southern Methodist University"
);
export const clevelandClinicScraper = createFlintboxScraper(
  { slug: "ccf", orgId: 94, accessKey: "67eed3d0-b1c0-4d4c-be96-6fdc228cbf39" },
  "Cleveland Clinic"
);
export const uabScraper = createFlintboxScraper(
  { slug: "uab", orgId: 74, accessKey: "a693da4f-984d-4a23-b5de-ba78951a9c93" },
  "University of Alabama at Birmingham"
);
export const cercaScraper = createFlintboxScraper(
  { slug: "cerca", orgId: 117, accessKey: "531ecc7e-7810-4b64-b325-b2704444f2bc" },
  "CERCA"
);
export const kstateScraper = createFlintboxScraper(
  { slug: "k-state", orgId: 57, accessKey: "5cb342e4-893d-4386-98c5-165545060dfc" },
  "Kansas State University"
);
export const cedarsScraper = createFlintboxScraper(
  { slug: "cedars", orgId: 60, accessKey: "d18c195c-b0d6-4767-8dae-9e29351f5d49" },
  "Cedars-Sinai"
);
export const fauScraper = createFlintboxScraper(
  { slug: "fau", orgId: 127, accessKey: "c4d62df3-6f8d-40c1-b4ca-89cde3e5c455" },
  "Florida Atlantic University"
);
export const tulaneScraper = createFlintboxScraper(
  { slug: "tulane", orgId: 187, accessKey: "6ee6d4d8-f0fb-445e-8419-93669edc8425" },
  "Tulane University"
);
export const louisvilleScraper = createFlintboxScraper(
  { slug: "louisville", orgId: 28, accessKey: "a4d8f8a8-6e05-4f69-aeb3-a41213e75405" },
  "University of Louisville"
);
export const lsuItcScraper = createFlintboxScraper(
  { slug: "lsuitc", orgId: 149, accessKey: "6167ce86-a76a-4476-9c4b-7fde90ac9ecc" },
  "LSU Innovation and Technology Commercialization"
);
export const uhnScraper = createFlintboxScraper(
  { slug: "uhn", orgId: 26, accessKey: "bd089dc4-8be1-4a62-9757-54bb408fbeab" },
  "University Health Network (Toronto)"
);
export const lsuScraper = createFlintboxScraper(
  { slug: "lsu", orgId: 84, accessKey: "08ae8058-8a2b-4b39-8c24-6efdf059ae32" },
  "Louisiana State University"
);
export const uahScraper = createFlintboxScraper(
  { slug: "uah", orgId: 159, accessKey: "43df7c48-86b9-4b10-ba07-1ea36bd9fd38" },
  "University of Alabama in Huntsville"
);
export const wvuScraper = createFlintboxScraper(
  { slug: "wvu", orgId: 112, accessKey: "8f83dfaf-5248-4b45-8c37-ad8a3ebbb9af" },
  "West Virginia University"
);
export const cmhScraper = createFlintboxScraper(
  { slug: "cmh", orgId: 36, accessKey: "3702b6e9-3617-4381-8401-e48d2e0c9603" },
  "Children's Mercy Hospital"
);
export const kcvScraper = createFlintboxScraper(
  { slug: "kcv", orgId: 200, accessKey: "e88f24ea-041a-457f-b23c-163400eb3915" },
  "KCV"
);
export const strathclydeScraper = createFlintboxScraper(
  { slug: "strathclyde", orgId: 206, accessKey: "b2dc8d43-c279-408b-9f38-f3dbf8d840de" },
  "University of Strathclyde"
);
export const syracuseScraper = createFlintboxScraper(
  { slug: "syr", orgId: 86, accessKey: "d4754059-b9b5-4854-93a7-6b343d284d5e" },
  "Syracuse University"
);
export const swanseaScraper = createFlintboxScraper(
  { slug: "swansea", orgId: 188, accessKey: "6b0780a6-9a4d-40f8-8cc9-8085809becf2" },
  "Swansea University"
);
export const utsaScraper = createFlintboxScraper(
  { slug: "utsa", orgId: 72, accessKey: "71c1e3dd-f026-47a9-b73c-be980bdadb1e" },
  "UT San Antonio"
);
export const ncsuScraper = createFlintboxScraper(
  { slug: "ncsu", orgId: 119, accessKey: "335a4b56-8570-417f-aae1-02b10c577049" },
  "NC State University"
);
export const dalhousieScraper = createFlintboxScraper(
  { slug: "dal", orgId: 189, accessKey: "19307b7f-c176-48c7-ad34-7ea5fcf40e4a" },
  "Dalhousie University"
);

export const ufScraper = createTechPublisherScraper(
  "ufinnovate",
  "University of Florida",
  { selector: "a[href*='/tech/']", maxPg: 80 }
);

export const utepScraper = createStubScraper("University of Texas El Paso", "tradespacemarket.com — React SPA, no public API found");

// ── New platform-based scrapers (Task #100, March 2026) ─────────────────────

// In-Part scrapers
export const ucMercedScraper = createInPartScraper("ucmerced", "UC Merced");
export const sdsuScraper = createInPartScraper("sdsu", "San Diego State University");
export const southernMissScraper = createInPartScraper("mrc", "University of Southern Mississippi");

// TechPublisher scraper
export const michiganStateScraper = createTechPublisherScraper(
  "msut",
  "Michigan State University",
  { maxPg: 50 }
);

// Flintbox scrapers
export const denverScraper = createFlintboxScraper(
  { slug: "du", orgId: 53, accessKey: "efe8f8a7-f085-4c9e-905d-3435c5fc9393" },
  "University of Denver"
);
export const kansasScraper = createFlintboxScraper(
  { slug: "ku", orgId: 33, accessKey: "409f7eb2-4324-4a1a-9858-80459ce84ce2" },
  "University of Kansas"
);
export const siuScraper = createFlintboxScraper(
  { slug: "siusystem", orgId: 164, accessKey: "194bb68e-7abe-4dd1-9b4b-9efd6de59c6c" },
  "Southern Illinois University System"
);
export const ukyScraper = createFlintboxScraper(
  { slug: "uky", orgId: 78, accessKey: "38378c10-972e-4f49-b91f-a7eb0d8c7f31" },
  "University of Kentucky"
);

// ── Bespoke HTML scrapers (Task #101, March 2026) ───────────────────────────

export const boiseStateScraper: InstitutionScraper = {
  institution: "Boise State University",
  async scrape(): Promise<ScrapedListing[]> {
    const pageUrl = "https://www.boisestate.edu/research-ott/available-technologies/";
    const $ = await fetchHtml(pageUrl, 15000);
    if (!$) return [];
    const results: ScrapedListing[] = [];
    const seenBsu = new Set<string>();
    let currentCategory = "";
    $("h2.wp-block-heading, table.tablepress").each((_, el) => {
      const tag = $(el).prop("tagName");
      if (tag === "H2") {
        currentCategory = cleanText($(el).text());
        return;
      }
      $(el).find("tbody tr").each((__, row) => {
        const cols = $(row).find("td");
        if (cols.length < 3) return;
        const bsuFile = cleanText($(cols[0]).text());
        const inventors = cleanText($(cols[1]).text());
        const linkEl = $(cols[2]).find("a");
        const patentUrl = linkEl.attr("href") ?? "";
        if (!bsuFile || seenBsu.has(bsuFile)) return;
        seenBsu.add(bsuFile);
        const title = currentCategory
          ? `BSU-${bsuFile}: ${currentCategory} (${inventors})`
          : `BSU-${bsuFile}: ${inventors}`;
        const anchorId = currentCategory.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        results.push({
          title,
          description: patentUrl ? `Google Patents: ${patentUrl}` : "",
          url: anchorId ? `${pageUrl}#h-${anchorId}` : pageUrl,
          institution: "Boise State University",
          inventors: inventors ? inventors.split(/,\s*/).filter(Boolean) : undefined,
          technologyId: `BSU-${bsuFile}`,
          categories: currentCategory ? [currentCategory] : undefined,
        });
      });
    });
    console.log(`[scraper] Boise State University: ${results.length} listings (tablepress)`);
    return results;
  },
};

export const nauScraper: InstitutionScraper = {
  institution: "Northern Arizona University",
  async scrape(): Promise<ScrapedListing[]> {
    const baseUrl = "https://in.nau.edu/research/innovations/available-technologies/";
    const knownCategories = [
      "biomedical", "cybersecurity", "energy", "environmental",
      "other", "research-tools", "software-hardware",
    ];
    const $index = await fetchHtml(baseUrl, 15000);
    const categories = new Set(knownCategories);
    if ($index) {
      $index(`a[href*="/available-technologies/"]`).each((_, el) => {
        const href = $index(el).attr("href") ?? "";
        const match = href.match(/available-technologies\/([a-z0-9-]+)\/?$/);
        if (match && match[1] !== "available-technologies") categories.add(match[1]);
      });
    }
    const results: ScrapedListing[] = [];
    const seenUrls = new Set<string>();
    for (const cat of categories) {
      const catUrl = `https://in.nau.edu/research/innovations/available-technologies/${cat}/`;
      const $ = await fetchHtml(catUrl, 15000);
      if (!$) continue;
      let currentSubHeading = cat;
      $("main h2, main ul.wp-block-list").each((_, el) => {
        const tag = $(el).prop("tagName");
        if (tag === "H2") {
          currentSubHeading = cleanText($(el).text());
          return;
        }
        $(el).find("li").each((__, li) => {
          const link = $(li).find("a").first();
          const title = cleanText($(li).text());
          if (!title || title.length < 10 || title.length > 200) return;
          const href = link.attr("href") ?? "";
          const detailUrl = href.startsWith("http")
            ? href
            : href
              ? `https://in.nau.edu${href}`
              : catUrl;
          if (seenUrls.has(detailUrl)) return;
          seenUrls.add(detailUrl);
          results.push({
            title,
            description: "",
            url: detailUrl,
            institution: "Northern Arizona University",
            categories: [cat, currentSubHeading].filter(Boolean),
          });
        });
      });
    }
    console.log(`[scraper] Northern Arizona University: ${results.length} listings (${categories.length} categories)`);
    return results;
  },
};

export const utennesseeScraper: InstitutionScraper = {
  institution: "University of Tennessee",
  async scrape(): Promise<ScrapedListing[]> {
    const base = "https://utrf.tennessee.edu";
    const results: ScrapedListing[] = [];
    const seenUrls = new Set<string>();

    async function scrapePage(pageUrl: string): Promise<boolean> {
      const $ = await fetchHtml(pageUrl, 15000);
      if (!$) return false;
      let found = 0;
      $('a[href*="/technologies/"]').each((_, el) => {
        const href = $(el).attr("href") ?? "";
        if (!href.includes("/technologies/")) return;
        const fullUrl = href.startsWith("http") ? href : `${base}${href}`;
        if (seenUrls.has(fullUrl)) return;
        if (fullUrl.includes("Read More") || href.endsWith("/technologies/")) return;
        const title = cleanText($(el).text());
        if (!title || title === "Read More" || title.length < 5) return;
        seenUrls.add(fullUrl);
        found++;
        results.push({
          title,
          description: "",
          url: fullUrl,
          institution: "University of Tennessee",
        });
      });
      return found > 0;
    }

    const entryPoints = [
      `${base}/industry/available-technologies/`,
      `${base}/technology-category/human-health/`,
    ];

    for (const entry of entryPoints) {
      await scrapePage(entry);
      for (let pg = 2; pg <= 10; pg++) {
        const pageUrl = `${entry}page/${pg}/`;
        const hasMore = await scrapePage(pageUrl);
        if (!hasMore) break;
      }
    }

    console.log(`[scraper] University of Tennessee: ${results.length} listings (UTRF)`);
    return results;
  },
};

export const ncatScraper: InstitutionScraper = {
  institution: "NC A&T State University",
  async scrape(): Promise<ScrapedListing[]> {
    const url = "https://www.ncat.edu/research/technology-transfer/available-technologies.php";
    const $ = await fetchHtml(url, 15000);
    if (!$) return [];
    const results: ScrapedListing[] = [];
    const seenTitles = new Set<string>();
    $("main p > strong, main p > b").each((_, el) => {
      const title = cleanText($(el).text());
      if (!title || title.length < 10 || title.length > 200) return;
      if (/^(home|research|technology transfer|available|page|search|office|contact)/i.test(title)) return;
      const lower = title.toLowerCase();
      if (seenTitles.has(lower)) return;
      seenTitles.add(lower);
      const parentP = $(el).closest("p");
      const patentLink = parentP.find('a[href*="patents.google.com"]').first();
      const patentUrl = patentLink.attr("href") ?? "";
      results.push({
        title,
        description: "",
        url: patentUrl || url,
        institution: "NC A&T State University",
      });
    });
    console.log(`[scraper] NC A&T State University: ${results.length} listings`);
    return results;
  },
};

export const morganStateScraper = createStubScraper(
  "Morgan State University",
  "IPD Executive Summaries page says 'Coming Soon' — no listings available yet"
);

// ── Task #103: Platform Scrapers Batch 2 (March 2026) ─────────────────────────

// In-Part portals
export const howardScraper = createInPartScraper("howard", "Howard University");
export const uncChapelHillScraper = createInPartScraper("chapelhill", "UNC Chapel Hill");
export const prscienceTrustScraper = createInPartScraper("prsciencetrust", "Puerto Rico Science Trust");

// TechPublisher portals
export const umassAmherstScraper = createTechPublisherScraper(
  "tto-umass-amherst",
  "UMass Amherst"
);
export const southAlabamaScraper = createTechPublisherScraper(
  "southalabama",
  "University of South Alabama"
);

// Flintbox portals
export const umbcScraper = createFlintboxScraper(
  { slug: "umbc", orgId: 131, accessKey: "886542e2-8300-4e8a-ad5a-136fbc497726" },
  "University of Maryland Baltimore County (UMBC)"
);
export const bostonCollegeScraper = createFlintboxScraper(
  { slug: "bc", orgId: 134, accessKey: "bd07e4dd-db0e-422f-9fe1-5e4995879b5f" },
  "Boston College"
);
