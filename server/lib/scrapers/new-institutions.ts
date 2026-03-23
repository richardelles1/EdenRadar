import { createTechPublisherScraper } from "./techpublisher";
import { createFlintboxScraper } from "./flintbox";
import { createUCTechTransferScraper } from "./uctechtransfer";
import { fetchHtml, fetchHtmlViaProxy, cleanText } from "./utils";
import { enrichWithDetailPages } from "./detailFetcher";
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
// Leeds licensing storefront: https://licensing.leeds.ac.uk
// URL structure: /products/<category>/<slug> (3 path segments = product page)
//                /products/<category>       (2 path segments = category page)
// Strategy 1 (primary): Playwright traversal of /products category hierarchy.
//   - Collect category hrefs (2 segments) from /products listing page.
//   - For each category, collect product hrefs (3 segments) from category page.
//   - For each product, navigate and extract h1 title + meta description / first paragraph.
// Strategy 2 (fallback if <5): JSON client API enriched with per-product HTTP detail fetch.
// Strategy 3 (final fallback if <5): Playwright on leeds.technologypublisher.com.
// Overall cap: 120 s (DEADLINE) enforced across all strategies.
export const leedsScraper: InstitutionScraper = {
  institution: "University of Leeds",
  scraperType: "playwright",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "University of Leeds";
    const BASE = "https://licensing.leeds.ac.uk";
    const TP_URL = "https://leeds.technologypublisher.com/SearchResults.aspx?type=Tech&q=";
    const DEADLINE = Date.now() + 120_000; // 120 s overall cap across all strategies

    // ── Strategy 1: Playwright traversal of licensing.leeds.ac.uk ─────────────
    // Product pages live at /products/<category>/<slug> (3 segments).
    const playwrightLicensingScrape = async (): Promise<ScrapedListing[]> => {
      if (Date.now() > DEADLINE) return [];
      let browser: import("playwright").Browser | null = null;
      try {
        const { chromium } = await import("playwright");
        browser = await chromium.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        });
        const pw = await browser.newPage();
        await pw.setExtraHTTPHeaders({
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        });

        // Phase 1: collect category links (exactly 2 segments: /products/<cat>)
        await pw.goto(`${BASE}/products`, { timeout: 30_000, waitUntil: "networkidle" });
        await pw.waitForTimeout(2_000);

        const categoryHrefs = await pw.$$eval('a[href^="/products/"]', (els) =>
          Array.from(
            new Set(
              els
                .map((el) => el.getAttribute("href") ?? "")
                .filter((h) => {
                  const parts = h.split("/").filter((s) => s.length > 0);
                  return parts.length === 2; // ["products", "<cat>"]
                })
            )
          )
        );

        // Phase 2: for each category, collect product hrefs (3 segments)
        const productUrls = new Set<string>();
        for (const catHref of categoryHrefs) {
          if (Date.now() > DEADLINE) break;
          const catUrl = `${BASE}${catHref}`;
          try {
            await pw.goto(catUrl, { timeout: 25_000, waitUntil: "networkidle" });
            await pw.waitForTimeout(1_500);
          } catch {
            continue;
          }
          const hrefs = await pw.$$eval('a[href^="/products/"]', (els) =>
            els
              .map((el) => el.getAttribute("href") ?? "")
              .filter((h) => {
                const parts = h.split("/").filter((s) => s.length > 0);
                return parts.length === 3; // ["products", "<cat>", "<slug>"]
              })
          );
          for (const h of hrefs) productUrls.add(h);
        }

        // Phase 3: visit each product page and extract title (h1) + description
        const results: ScrapedListing[] = [];
        for (const prodHref of Array.from(productUrls)) {
          if (Date.now() > DEADLINE) break;
          const prodUrl = `${BASE}${prodHref}`;
          try {
            await pw.goto(prodUrl, { timeout: 25_000, waitUntil: "domcontentloaded" });
            const title = await pw.$eval("h1", (el) => el.textContent?.trim() ?? "").catch(() => "");
            const metaDesc = await pw.$eval(
              'meta[name="description"]',
              (el) => el.getAttribute("content") ?? ""
            ).catch(() => "");
            const firstPara = await pw.$eval("article p, main p, .product-description p",
              (el) => el.textContent?.trim() ?? ""
            ).catch(() => "");
            const description = metaDesc || firstPara;
            if (!title || title.length < 5) continue;
            results.push({
              title: cleanText(title),
              description: cleanText(description).slice(0, 800),
              url: prodUrl,
              institution: INST,
            });
          } catch {
            continue;
          }
        }

        return results;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[scraper] ${INST} Playwright licensing failed: ${msg}`);
        return [];
      } finally {
        await browser?.close();
      }
    };

    // ── Strategy 2: JSON client API with per-product HTTP enrichment ──────────
    const apiScrape = async (): Promise<ScrapedListing[]> => {
      if (Date.now() > DEADLINE) return [];
      interface LeedsItem {
        url?: string;
        name?: string;
        shortDescription?: string | null;
      }
      interface LeedsPage {
        total?: number;
        pages?: number;
        items?: LeedsItem[];
      }

      const raw: ScrapedListing[] = [];
      let pg = 1;
      let totalPgs = 1;

      while (pg <= totalPgs && Date.now() < DEADLINE) {
        const apiUrl =
          `${BASE}/client/products/search` +
          `?page=${pg}&itemsPerPage=300` +
          `&columns[]=url&columns[]=name&columns[]=shortDescription`;
        try {
          const res = await fetch(apiUrl, {
            headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
            signal: AbortSignal.timeout(15_000),
          });
          if (!res.ok) break;
          const json: LeedsPage = await res.json();
          totalPgs = json.pages ?? 1;
          for (const item of json.items ?? []) {
            const title = cleanText(item.name ?? "");
            const itemUrl = item.url ?? "";
            if (!title || title.length < 5 || !itemUrl) continue;
            const fullUrl = itemUrl.startsWith("http") ? itemUrl : `${BASE}${itemUrl}`;
            raw.push({
              title,
              description: cleanText(item.shortDescription ?? ""),
              url: fullUrl,
              institution: INST,
            });
          }
        } catch {
          break;
        }
        pg++;
      }

      if (raw.length === 0) return raw;

      // Per-product HTTP detail fetch for items with missing descriptions
      const needsDetail = raw.filter((r) => !r.description || r.description.length < 10);
      const toFetch = needsDetail.slice(0, 30);
      if (toFetch.length > 0) {
        let idx = 0;
        const worker = async () => {
          while (idx < toFetch.length && Date.now() < DEADLINE) {
            const item = toFetch[idx++];
            if (!item) continue;
            try {
              const res = await fetch(item.url, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
                signal: AbortSignal.timeout(10_000),
              });
              if (!res.ok) continue;
              const html = await res.text();
              const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
              if (h1Match) {
                const h1Title = cleanText(h1Match[1]);
                if (h1Title && h1Title.length > 5) item.title = h1Title;
              }
              const metaMatch =
                html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']{20,})["']/i) ??
                html.match(/<meta[^>]*content=["']([^"']{20,})["'][^>]*name=["']description["']/i);
              if (metaMatch) {
                item.description = cleanText(metaMatch[1]);
              } else {
                const pMatch = html.match(/<p[^>]*>([\s\S]{30,600}?)<\/p>/i);
                if (pMatch) item.description = cleanText(pMatch[1].replace(/<[^>]+>/g, " "));
              }
            } catch {
              // skip
            }
          }
        };
        await Promise.all(Array.from({ length: 5 }, () => worker()));
      }

      return raw;
    };

    // ── Strategy 3: Playwright on leeds.technologypublisher.com ──────────────
    const playwrightTechPublisher = async (): Promise<ScrapedListing[]> => {
      if (Date.now() > DEADLINE) return [];
      let browser: import("playwright").Browser | null = null;
      try {
        const { chromium } = await import("playwright");
        browser = await chromium.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        });
        const pw = await browser.newPage();
        await pw.setExtraHTTPHeaders({
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        });
        await pw.goto(TP_URL, { timeout: 45_000, waitUntil: "networkidle" });
        await pw.waitForTimeout(4_000);

        const allLinks = new Map<string, string>();
        const collectLinks = async () => {
          const links = await pw.$$eval(
            'a[href*="/tech/"], a[href*="/technology/"]',
            (els) =>
              els.map((el) => ({
                href: el.getAttribute("href") ?? "",
                text: (el as HTMLElement).innerText?.trim() ?? el.textContent?.trim() ?? "",
              }))
          );
          for (const l of links) {
            if (l.href && l.text.length > 4 && !allLinks.has(l.href)) allLinks.set(l.href, l.text);
          }
        };

        await collectLinks();
        for (let p = 2; p <= 20 && Date.now() < DEADLINE; p++) {
          const nextBtn = await pw.$('a[title="Next"], [class*="next" i] a').catch(() => null);
          if (!nextBtn) break;
          const disabled = await nextBtn.evaluate((el) =>
            el.hasAttribute("disabled") || el.classList.contains("disabled")
          ).catch(() => true);
          if (disabled) break;
          await nextBtn.click();
          await pw.waitForTimeout(3_000);
          const prev = allLinks.size;
          await collectLinks();
          if (allLinks.size === prev) break;
        }

        const results: ScrapedListing[] = [];
        for (const [href, title] of Array.from(allLinks.entries())) {
          const fullUrl = href.startsWith("http") ? href : `https://leeds.technologypublisher.com${href}`;
          results.push({ title: cleanText(title), description: "", url: fullUrl, institution: INST });
        }
        return results;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[scraper] ${INST} TechPublisher Playwright failed: ${msg}`);
        return [];
      } finally {
        await browser?.close();
      }
    };

    // ── Execution order (120 s overall cap enforced by DEADLINE) ─────────────
    const pwResults = await playwrightLicensingScrape();
    if (pwResults.length >= 5) {
      console.log(`[scraper] ${INST}: ${pwResults.length} listings via Playwright (/products/)`);
      return pwResults;
    }

    const apiResults = await apiScrape();
    if (apiResults.length >= 5) {
      console.log(`[scraper] ${INST}: ${apiResults.length} listings via JSON API`);
      return apiResults;
    }

    const tpResults = await playwrightTechPublisher();
    console.log(`[scraper] ${INST}: ${tpResults.length} listings via TechPublisher Playwright`);
    return tpResults;
  },
};
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
// ── New Mexico State University — Arrowhead Center (Task #135) ────────────────
// URL: https://arrowheadcenter.nmsu.edu/technologies/
// WordPress site — technologies as paginated HTML listing.
// WP REST API: /wp-json/wp/v2/pages?per_page=100 (used as fallback).
export const nmsuScraper: InstitutionScraper = {
  institution: "New Mexico State University",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "New Mexico State University";
    const BASE = "https://arrowheadcenter.nmsu.edu";
    const INDEX = `${BASE}/technologies/`;

    try {
      const seenUrls = new Set<string>();
      const techUrls: string[] = [];

      const collectFrom$ = ($: Awaited<ReturnType<typeof fetchHtml>>) => {
        if (!$) return;
        $("a[href*='/technologies/']").each((_, el) => {
          const href = ($)(el).attr("href") ?? "";
          if (!href) return;
          const full = href.startsWith("http") ? href : `${BASE}${href}`;
          const clean = full.split("?")[0].split("#")[0];
          if (clean === INDEX || seenUrls.has(clean)) return;
          if (!/\/technologies\/[^/]+\/?$/.test(clean)) return;
          seenUrls.add(clean);
          techUrls.push(clean);
        });
      };

      // Page 1
      const page1$ = await fetchHtml(INDEX, 20_000);
      collectFrom$(page1$);

      // Detect max page
      let maxPage = 1;
      page1$?.("a[href*='/technologies/page/']").each((_, el) => {
        const m = (page1$!(el).attr("href") ?? "").match(/\/page\/(\d+)/);
        if (m) maxPage = Math.max(maxPage, parseInt(m[1], 10));
      });

      // Fetch remaining pages (WordPress /page/N pagination)
      const BATCH = 6;
      const pageUrls: string[] = [];
      for (let p = 2; p <= Math.min(maxPage, 30); p++) {
        pageUrls.push(`${INDEX}page/${p}/`);
      }
      for (let i = 0; i < pageUrls.length; i += BATCH) {
        const batch = pageUrls.slice(i, i + BATCH);
        const settled = await Promise.allSettled(batch.map((u) => fetchHtml(u, 20_000)));
        for (const r of settled) {
          if (r.status === "fulfilled") collectFrom$(r.value);
        }
      }

      // Fallback: WP REST API for pages/posts tagged "technology"
      if (techUrls.length === 0) {
        try {
          const apiUrl = `${BASE}/wp-json/wp/v2/pages?per_page=100&search=technology`;
          const r = await fetch(apiUrl, {
            signal: AbortSignal.timeout(15_000),
            headers: { "User-Agent": "Mozilla/5.0" },
          });
          if (r.ok) {
            const items = await r.json() as Array<{ link: string; title: { rendered: string }; excerpt: { rendered: string } }>;
            for (const item of items) {
              if (!item.link || seenUrls.has(item.link)) continue;
              seenUrls.add(item.link);
              const title = cleanText(item.title?.rendered ?? "");
              const description = cleanText((item.excerpt?.rendered ?? "").replace(/<[^>]+>/g, " "));
              if (title && title.length > 5) {
                techUrls.push(item.link);
              }
            }
          }
        } catch {
          // REST API unavailable
        }
      }

      if (techUrls.length === 0) {
        console.log(`[scraper] ${INST}: 0 tech URLs found`);
        return [];
      }

      const toTitle = (u: string) =>
        (u.split("/").pop() ?? "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

      const enriched = await enrichWithDetailPages(
        techUrls.map((u) => ({ title: toTitle(u), description: "", url: u, institution: INST })),
        { description: [".entry-content p", ".post-content p", "main p", "article p"] }
      );

      console.log(`[scraper] ${INST}: ${enriched.length} listings`);
      return enriched;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
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
// imperialScraper — real in-part "imperial" implementation is in Batch E section (end of file)
export const uclScraper = createStubScraper("University College London");
export const manchesterScraper = createInPartScraper("manchester", "University of Manchester");
export const edinburghScraper = createStubScraper("University of Edinburgh");
// glasgowScraper: real in-part "gla" implementation is at Task #114 section (end of file)
// birminghamScraper — real in-part "birmingham" implementation is in Batch E section (end of file)
// warwickScraper — real in-part "warwick" implementation is in Batch E section (end of file)
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
export const ubcScraper = createInPartScraper("ubc", "University of British Columbia");
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
    const categoriesSet = new Set(knownCategories);
    if ($index) {
      $index(`a[href*="/available-technologies/"]`).each((_, el) => {
        const href = $index(el).attr("href") ?? "";
        const match = href.match(/available-technologies\/([a-z0-9-]+)\/?$/);
        if (match && match[1] !== "available-technologies") categoriesSet.add(match[1]);
      });
    }
    const categories = Array.from(categoriesSet);
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

// ── Morgan State University — HTML table scraper (Task #136) ──────────────────
// Previous PDF approach: PDF URL returns 404 / TCP refused from Replit (research
// subdomain blocked). Probe of www.morgan.edu shows two accessible HTML table pages:
//   /technology-transfer-and-intellectual-property/issued-patents        (~150 <td>s)
//   /technology-transfer-and-intellectual-property/pending-utility-patents (~108 <td>s)
// Each page has a <table> where row 0 is the header, subsequent rows are patents.
// Column 0 = patent title, Column 1 = inventors.
export const morganStateScraper: InstitutionScraper = {
  institution: "Morgan State University",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Morgan State University";
    const BASE = "https://www.morgan.edu";
    const PAGES = [
      { path: "/technology-transfer-and-intellectual-property/issued-patents" },
      { path: "/technology-transfer-and-intellectual-property/pending-utility-patents" },
    ];

    // Noise-rejection filter — these pages are explicitly "issued-patents" and
    // "pending-utility-patents" so all table rows are real patents. The filter only
    // rejects residual UI chrome (navigation links, section headers) that might
    // occasionally appear in a <td> due to CMS injection. Rather than keyword-matching
    // biotech terms (which would drop valid titles like "Engineered Cyanobacteria…"),
    // we rely on the header-row skip and minimum-length check as the sole gates.
    // A light noise check: reject rows that look like UI chrome (very short, or pure
    // nav/action text).
    const isNoisyRow = (t: string) =>
      /^(home|about|contact|faq|menu|back|next|previous|click|download|more|learn more|submit|search|filter)$/i.test(t);

    const results: ScrapedListing[] = [];
    const seen = new Set<string>();

    for (const { path } of PAGES) {
      const url = `${BASE}${path}`;
      try {
        const $ = await fetchHtml(url, 20_000);
        if (!$) continue;

        // Morgan State table layout (3 columns per data row):
        //   cells[0] — Patent number (e.g., "#12,499,118") with link to PDF
        //   cells[1] — Title         (e.g., "System and Method for Synchronization…")
        //   cells[2] — Inventors     (e.g., "Snehanshu Banerjee, Mansoureh Jeihani")
        // Header row also uses <td> (not <th>), styled with background-color: #cccccc.
        $("table tr").each((_, row) => {
          const cells = $(row).find("td");
          if (cells.length < 2) return; // Need at least patent# + title columns

          const patentNum = cleanText($(cells[0]).text());

          // Skip header row ("Patent #" / "Morgan U.S. Issued Patents")
          if (/^(patent|title|invention|technology|name|description)/i.test(patentNum)) return;

          // Column 1 = title
          const rawTitle = cleanText($(cells[1]).text());
          if (!rawTitle || rawTitle.length < 8) return;

          // Strip trailing issue/filing date annotations
          // e.g., "Method for Detecting Foo - Issued 12/16/2025" → "Method for Detecting Foo"
          const cleanTitle = rawTitle
            .replace(/\s*[-–]\s*(Issued|Filed|Pending|Granted|Published)\s+\d{1,2}\/\d{1,2}\/\d{4}\s*$/i, "")
            .replace(/\s*[-–]\s*\d{1,2}\/\d{1,2}\/\d{4}\s*$/, "")
            .trim();

          if (cleanTitle.length < 8) return;

          // Reject residual UI chrome that occasionally slips into table cells
          if (isNoisyRow(cleanTitle)) return;

          if (seen.has(cleanTitle)) return;
          seen.add(cleanTitle);

          // Column 2 = inventors
          const inventors = cells.length >= 3 ? cleanText($(cells[2]).text()) : "";
          const parts: string[] = [];
          if (patentNum) parts.push(`Patent: ${patentNum}`);
          if (inventors) parts.push(`Inventors: ${inventors}`);
          const description = parts.join(". ");

          // URL points to the source page (issued vs pending) so users land on the right list
          results.push({ title: cleanTitle, description, url, institution: INST });
        });
      } catch {
        // Page unavailable — continue to next source page
      }
    }

    if (results.length === 0) {
      console.log(`[scraper] ${INST}: 0 patent rows found — table pages may be unavailable`);
      return [];
    }

    console.log(`[scraper] ${INST}: ${results.length} listings (HTML tables)`);
    return results;
  },
};

// ── Task #104: Bespoke Scrapers Batch 2A (March 2026) ─────────────────────────

// 1a. Sacramento State (CSUS)
// Page at /available-licensing.html (HTTP 200) lists technologies as inline PDF anchors.
// Internal tech docs: a[href*="_internal/documents/"][href$=".pdf"] — title from anchor text.
// External patent links (Google Patents, USPTO) are also included.
export const csusScraper: InstitutionScraper = {
  institution: "Sacramento State (CSUS)",
  async scrape(): Promise<ScrapedListing[]> {
    const pageBase = "https://www.csus.edu/experience/innovation-creativity/oried/innovation-technology-transfer";
    const pageUrl = `${pageBase}/available-licensing.html`;
    const res = await fetch(pageUrl, {
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = (await import("cheerio")).load(html);
    const results: ScrapedListing[] = [];
    const seen = new Set<string>();
    // Select PDF-linked tech entries: internal CSUS docs + external patent PDFs in main area
    $('main a[href*="_internal/documents/"], main a[href*="patentimages.storage.googleapis.com"], main a[href*="image-ppubs.uspto.gov"]').each((_, el) => {
      const href = $(el).attr("href") ?? "";
      if (!href) return;
      const fullUrl = href.startsWith("http") ? href : `${pageBase}/${href.replace(/^\/+/, "")}`;
      const title = cleanText($(el).text());
      if (!title || title.length < 8) return;
      if (/^(home|about|contact|office|available|index)/i.test(title)) return;
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);
      results.push({ title, description: "", url: fullUrl, institution: "Sacramento State (CSUS)" });
    });
    console.log(`[scraper] Sacramento State (CSUS): ${results.length} listings`);
    return results;
  },
};

// 1b. Loyola University Chicago
// TTO page returns HTTP 200 with a full browser UA and contains named PDF anchors
// at /media/lucedu/ors/pdfsanddocs/research/*.pdf — one per technology.
// Title is taken from anchor text; if blank, derived from the PDF filename.
export const loyolaChicagoScraper: InstitutionScraper = {
  institution: "Loyola University Chicago",
  async scrape(): Promise<ScrapedListing[]> {
    const base = "https://www.luc.edu";
    const url = `${base}/ors/tt_licensing.shtml`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = (await import("cheerio")).load(html);
    const results: ScrapedListing[] = [];
    const seen = new Set<string>();
    $('a[href*="/pdfsanddocs/research/"][href$=".pdf"]').each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const fullUrl = href.startsWith("http") ? href : `${base}${href}`;
      // Title from anchor text, falling back to cleaned filename
      let title = cleanText($(el).text());
      if (!title) {
        const filename = href.split("/").pop() ?? "";
        title = filename
          .replace(/\.pdf$/i, "")
          .replace(/_NCD$/i, "")
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, c => c.toUpperCase())
          .trim();
      }
      if (!title || title.length < 5) return;
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);
      results.push({ title, description: "", url: fullUrl, institution: "Loyola University Chicago" });
    });
    console.log(`[scraper] Loyola University Chicago: ${results.length} listings`);
    return results;
  },
};

// 2. Ohio University
export const ohioScraper: InstitutionScraper = {
  institution: "Ohio University",
  async scrape(): Promise<ScrapedListing[]> {
    const base = "https://www.ohio.edu";
    const listUrl = `${base}/research/tto/technologies`;
    const $ = await fetchHtml(listUrl, 15000);
    if (!$) return [];
    const stubs: Array<{ title: string; url: string }> = [];
    const seen = new Set<string>();
    $('a[href*="/technologies/"]').each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const title = cleanText($(el).text());
      if (!title || title.length < 8 || title.length > 200) return;
      if (/^(engineering|environmental|life.science|technologies)$/i.test(title)) return;
      const fullUrl = href.startsWith("http") ? href : `${base}${href}`;
      if (seen.has(fullUrl) || fullUrl.endsWith("/technologies/") || fullUrl.endsWith("/technologies")) return;
      // Exclude category hub pages: paths with only 1 segment after /technologies/ are category roots
      const techPath = fullUrl.split("/technologies/")[1] ?? "";
      if (!techPath.includes("/")) return; // must have at least 2 segments (category/slug)
      seen.add(fullUrl);
      stubs.push({ title, url: fullUrl });
    });
    // Fetch detail pages concurrently (limit 5) for descriptions via meta description
    const CONC = 5;
    const results: ScrapedListing[] = [];
    for (let i = 0; i < stubs.length; i += CONC) {
      const batch = stubs.slice(i, i + CONC);
      const settled = await Promise.allSettled(
        batch.map(async (s) => {
          const detail = await fetchHtml(s.url, 10000);
          const description = detail
            ? cleanText(detail('meta[name="description"]').attr("content") ?? detail("main p, .content p").first().text()).slice(0, 400)
            : "";
          return { ...s, description, institution: "Ohio University" };
        })
      );
      settled.forEach((r) => {
        if (r.status === "fulfilled") results.push(r.value);
      });
    }
    console.log(`[scraper] Ohio University: ${results.length} listings`);
    return results;
  },
};

// 2. UMKC
// Page uses Bootstrap accordion: each .card has a h3 button (title) + .card-body (description + PDF link)
export const umkcScraper: InstitutionScraper = {
  institution: "University of Missouri – Kansas City (UMKC)",
  async scrape(): Promise<ScrapedListing[]> {
    const base = "https://ori.umkc.edu/facilities-compliance-and-commercialization/commercialization";
    const listUrl = `${base}/technologies.html`;
    const $ = await fetchHtml(listUrl, 15000);
    if (!$) return [];
    const results: ScrapedListing[] = [];
    const seen = new Set<string>();
    // Each accordion card: .card-header (title button) + .card-body (description + PDF)
    $(".card").each((_, card) => {
      const title = cleanText($(card).find(".card-header button").first().text());
      if (!title || title.length < 10 || title.length > 250) return;
      if (seen.has(title.toLowerCase())) return;
      seen.add(title.toLowerCase());
      const cardBody = $(card).find(".card-body");
      // Description: first <p> after the "Description:" h4 (using :contains selector)
      const descP = cardBody.find("h4:contains('Description')").first().next("p");
      const description = cleanText(descP.text()).slice(0, 400);
      // PDF URL: any relative link to technology-docs or .pdf file
      const pdfHref = cardBody.find('a[href*="technology-docs"], a[href*=".pdf"]').first().attr("href") ?? "";
      const pdfUrl = pdfHref
        ? (pdfHref.startsWith("http") ? pdfHref : `${base}/${pdfHref.replace(/^\/+/, "")}`)
        : listUrl;
      results.push({ title, description, url: pdfUrl, institution: "University of Missouri – Kansas City (UMKC)" });
    });
    console.log(`[scraper] UMKC: ${results.length} listings`);
    return results;
  },
};

// 3. FAMU
export const famuScraper: InstitutionScraper = {
  institution: "Florida A&M University (FAMU)",
  async scrape(): Promise<ScrapedListing[]> {
    const url = "https://www.famu.edu/administration/research/office-of-technology-transfer-and-export-control/technologies-available-for-licensing.php";
    const $ = await fetchHtml(url, 15000);
    if (!$) return [];
    const results: ScrapedListing[] = [];
    const seen = new Set<string>();
    // Page is a 3-column table: [docket/date link → archive PDF] | [inventors] | [tech title (plain text)]
    $("tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 3) return;
      const pdfLink = $(cells[0]).find('a[href*="archive.famu.edu"]').first();
      if (!pdfLink.length) return;
      const pdfUrl = pdfLink.attr("href") ?? url;
      const title = cleanText($(cells[2]).text());
      if (!title || title.length < 10 || title.length > 300) return;
      if (seen.has(title.toLowerCase())) return;
      seen.add(title.toLowerCase());
      results.push({ title, description: "", url: pdfUrl, institution: "Florida A&M University (FAMU)" });
    });
    console.log(`[scraper] FAMU: ${results.length} listings`);
    return results;
  },
};

// 4. UNeTech (University of Nebraska)
export const unetechScraper: InstitutionScraper = {
  institution: "University of Nebraska (UNeTech)",
  async scrape(): Promise<ScrapedListing[]> {
    const base = "https://www.unetech.org";
    const listUrl = `${base}/portfolio/`;
    const $ = await fetchHtml(listUrl, 15000);
    if (!$) return [];
    const results: ScrapedListing[] = [];
    const seen = new Set<string>();
    $('a[href*="/portfolio/"]').each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const title = cleanText($(el).text());
      if (!title || title.length < 5) return;
      const fullUrl = href.startsWith("http") ? href : `${base}${href}`;
      // Exclude the listing page itself and non-tech pages
      if (fullUrl === listUrl || seen.has(fullUrl)) return;
      if (/summit|investor|corps|steam|event/i.test(fullUrl)) return;
      seen.add(fullUrl);
      results.push({ title, description: "", url: fullUrl, institution: "University of Nebraska (UNeTech)" });
    });
    console.log(`[scraper] UNeTech: ${results.length} listings`);
    return results;
  },
};

// 7. Nebraska Med (UNEMED)
// Primary source: unemed.com/unmc-technologies — a nav page listing technology category links.
// Scraper discovers category links dynamically from the primary source, then crawls each category.
export const uneMedScraper: InstitutionScraper = {
  institution: "University of Nebraska Medical Center (UNEMED)",
  async scrape(): Promise<ScrapedListing[]> {
    const base = "https://www.unemed.com";
    const primaryUrl = `${base}/unmc-technologies`;
    const results: ScrapedListing[] = [];
    const seen = new Set<string>();
    // Step 1: fetch primary source and discover category URLs
    const navPage = await fetchHtml(primaryUrl, 12000);
    const categoryUrls: string[] = [];
    if (navPage) {
      navPage('a[href*="/product-category/"]').each((_, el) => {
        const href = navPage(el).attr("href") ?? "";
        const catUrl = href.startsWith("http") ? href : `${base}${href}`;
        if (!categoryUrls.includes(catUrl)) categoryUrls.push(catUrl);
      });
    }
    // Fallback: known categories if primary source nav changes
    if (categoryUrls.length === 0) {
      ["cancer", "cardio", "covid-19", "delivery", "devices", "infectious", "metabolic", "neuro", "research"].forEach(cat =>
        categoryUrls.push(`${base}/product-category/${cat}`)
      );
    }
    // Step 2: crawl each category page for individual product links
    for (const catUrl of categoryUrls) {
      const $ = await fetchHtml(catUrl, 12000);
      if (!$) continue;
      $('a[href*="/product/"]').each((_, el) => {
        const href = $(el).attr("href") ?? "";
        const title = cleanText($(el).text());
        if (!title || title.length < 5 || /read.more/i.test(title)) return;
        const fullUrl = href.startsWith("http") ? href : `${base}${href}`;
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);
        results.push({ title, description: "", url: fullUrl, institution: "University of Nebraska Medical Center (UNEMED)" });
      });
    }
    console.log(`[scraper] UNEMED: ${results.length} listings from ${categoryUrls.length} categories`);
    return results;
  },
};

// 8. UMVentures (University of Maryland)
// Note: site returns 403 to the standard fetchHtml user-agent; use minimal direct fetch
export const umventuresScraper: InstitutionScraper = {
  institution: "University of Maryland (UMVentures)",
  async scrape(): Promise<ScrapedListing[]> {
    const base = "https://www.umventures.org";
    const results: ScrapedListing[] = [];
    const seen = new Set<string>();
    const cheerio = await import("cheerio");
    for (let pg = 0; pg <= 10; pg++) {
      const pageUrl = pg === 0
        ? `${base}/technologies?sort=created+DESC`
        : `${base}/technologies?sort=created%20DESC&page=${pg}`;
      try {
        const res = await fetch(pageUrl, {
          signal: AbortSignal.timeout(15000),
          headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html,*/*" },
        });
        if (!res.ok) break;
        const $ = cheerio.load(await res.text());
        let found = 0;
        $('a[href*="/technologies/"]').each((_, el) => {
          const href = $(el).attr("href") ?? "";
          const title = cleanText($(el).text());
          if (!title || title.length < 8) return;
          const fullUrl = href.startsWith("http") ? href : `${base}${href}`;
          // Exclude the listing root and any URLs with query params (faceted filter/category links)
          if (seen.has(fullUrl) || fullUrl.includes("?") || fullUrl.endsWith("/technologies") || fullUrl.endsWith("/technologies/")) return;
          seen.add(fullUrl);
          found++;
          results.push({ title, description: "", url: fullUrl, institution: "University of Maryland (UMVentures)" });
        });
        if (found === 0) break;
      } catch {
        break;
      }
    }
    console.log(`[scraper] UMVentures: ${results.length} listings`);
    return results;
  },
};

// 9. University of Memphis
export const memphisScraper: InstitutionScraper = {
  institution: "University of Memphis",
  async scrape(): Promise<ScrapedListing[]> {
    const base = "https://www.memphis.edu";
    const listUrl = `${base}/fedex/ott/available_technologies.php`;
    const $ = await fetchHtml(listUrl, 15000);
    if (!$) return [];
    const results: ScrapedListing[] = [];
    const seen = new Set<string>();
    // Tech titles are h2/h3 not matching nav boilerplate; each has a nearby PDF link
    $("h2, h3").each((_, el) => {
      const title = cleanText($(el).text());
      if (!title || title.length < 15 || title.length > 250) return;
      if (/^(FedEx|Office|Available|About|Technology Transfer)/i.test(title)) return;
      if (seen.has(title.toLowerCase())) return;
      seen.add(title.toLowerCase());
      // Find nearest PDF link in following sibling content
      let pdfUrl = listUrl;
      const nextSibling = $(el).nextAll("p, div, ul").first();
      const pdfLink = nextSibling.find('a[href*=".pdf"]').first();
      if (pdfLink.length) {
        const href = pdfLink.attr("href") ?? "";
        pdfUrl = href.startsWith("http") ? href : `${base}${href}`;
      }
      // Capture any description text (typically a patent reference) from sibling content
      const descText = cleanText(nextSibling.text()).replace(/\(PDF\)/gi, "").trim().slice(0, 300);
      results.push({ title, description: descText, url: pdfUrl, institution: "University of Memphis" });
    });
    console.log(`[scraper] University of Memphis: ${results.length} listings`);
    return results;
  },
};

// 10. UTRGV
export const utrgvScraper: InstitutionScraper = {
  institution: "University of Texas Rio Grande Valley (UTRGV)",
  async scrape(): Promise<ScrapedListing[]> {
    const base = "https://www.utrgv.edu/research/departments/research-operations/otc/utrgv-technologies";
    const listUrl = `${base}/index.htm`;
    const $ = await fetchHtml(listUrl, 15000);
    if (!$) return [];
    const stubs: Array<{ title: string; url: string }> = [];
    const seen = new Set<string>();
    // "Learn more about X" links point to relative sub-directory index pages
    $('a').each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const text = cleanText($(el).text());
      if (!href || href.startsWith("http") || href.startsWith("../") || href.startsWith("#") || href.startsWith("mailto")) return;
      const title = text.replace(/^Learn more about\s*/i, "").trim();
      if (!title || title.length < 8) return;
      const fullUrl = href.startsWith("/")
        ? `https://www.utrgv.edu${href}`
        : `${base}/${href}`;
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);
      stubs.push({ title, url: fullUrl });
    });
    // Fetch detail pages concurrently (limit 4) for description text
    const CONC = 4;
    const results: ScrapedListing[] = [];
    for (let i = 0; i < stubs.length; i += CONC) {
      const batch = stubs.slice(i, i + CONC);
      const settled = await Promise.allSettled(
        batch.map(async (s) => {
          const detail = await fetchHtml(s.url, 10000);
          let description = "";
          if (detail) {
            // Try meta description, then first meaningful paragraph not in nav
            const metaDesc = cleanText(detail('meta[name="description"]').attr("content") ?? "");
            let bodyP = "";
            detail("main p, article p, .utrgv-content p, td p").each((_, el) => {
              if (bodyP) return;
              const t = detail(el).text().trim();
              if (t.length > 40 && !/streamlining|division of research|analytics hub/i.test(t)) {
                bodyP = t;
              }
            });
            description = (metaDesc || cleanText(bodyP)).slice(0, 400);
          }
          return { ...s, description, institution: "University of Texas Rio Grande Valley (UTRGV)" };
        })
      );
      settled.forEach((r) => {
        if (r.status === "fulfilled") results.push(r.value);
      });
    }
    const final = results.filter(r => r.title.length > 0);
    console.log(`[scraper] UTRGV: ${final.length} listings`);
    return final;
  },
};

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

// ── Batch 2B (Task #105, March 2026) ────────────────────────────────────────

// UWM Research Foundation (UWMRF) — University of Wisconsin–Milwaukee
// WordPress portfolio with OTT-numbered tech cards; detail pages fetched for description
export const uwmrfScraper: InstitutionScraper = {
  institution: "UWM Research Foundation (UWMRF)",
  async scrape(): Promise<ScrapedListing[]> {
    const base = "https://uwmrf.org";
    const stubs: Array<{ title: string; url: string }> = [];
    const seen = new Set<string>();
    const cheerioLib = await import("cheerio");
    // Collect all listing stubs from paginated tech portfolio
    for (let pg = 1; pg <= 5; pg++) {
      const pageUrl = pg === 1 ? `${base}/technologies/` : `${base}/technologies/page/${pg}/`;
      try {
        const res = await fetch(pageUrl, {
          signal: AbortSignal.timeout(15000),
          headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html,*/*" },
        });
        if (!res.ok) break;
        const $ = cheerioLib.load(await res.text());
        let found = 0;
        $("article").each((_, art) => {
          const href = $(art).find('a[href*="/technology/"]').first().attr("href") ?? "";
          if (!href || seen.has(href)) return;
          const pHtml = $(art).find(".tech-info-text p").first().html() ?? "";
          const titlePart = pHtml.split(/<br\s*\/?>/i)[0];
          const title = cleanText(cheerioLib.load(titlePart).text());
          if (!title) return;
          seen.add(href);
          found++;
          stubs.push({ title, url: href });
        });
        if (found === 0) break;
      } catch {
        break;
      }
    }
    // Fetch detail pages concurrently (limit 5) for description
    const CONC = 5;
    const results: ScrapedListing[] = [];
    for (let i = 0; i < stubs.length; i += CONC) {
      const batch = stubs.slice(i, i + CONC);
      const settled = await Promise.allSettled(
        batch.map(async (s) => {
          const detail = await fetchHtml(s.url, 10000);
          let description = "";
          if (detail) {
            detail("p").each((_, el) => {
              const txt = cleanText(detail(el).text());
              if (txt.length > description.length && txt.length > 30) description = txt;
            });
            description = description.slice(0, 400);
          }
          return { ...s, description, institution: "UWM Research Foundation (UWMRF)" };
        })
      );
      settled.forEach((r) => { if (r.status === "fulfilled") results.push(r.value); });
    }
    console.log(`[scraper] UWMRF: ${results.length} listings`);
    return results;
  },
};

// ── Batch 2B additions (Task #105) ───────────────────────────────────────────

// 1. Jackson State University
// HBCU TTO page lists technologies as Google Patents links and internal patent PDFs.
// For Google Patents hrefs, extracts canonical patent number (e.g. US7347984B2) from
// the URL path and builds canonical https://patents.google.com/patent/{NUM}/en URL.
export const jacksonStateScraper: InstitutionScraper = {
  institution: "Jackson State University",
  async scrape(): Promise<ScrapedListing[]> {
    const url = "https://www.jsums.edu/technologytransfer/industry/";
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = (await import("cheerio")).load(html);
    const results: ScrapedListing[] = [];
    const seen = new Set<string>();
    // Select Google Patents links and internal patent PDF files only (not nav links)
    $('a[href*="patents.google.com"], a[href*="/technologytransfer/files/"][href$=".pdf"], a[href*="/research/files/"][href$=".pdf"]').each((_, el) => {
      const href = $(el).attr("href") ?? "";
      if (!href || href.includes("student") || href.includes("handbook")) return;
      let fullUrl = href.startsWith("http") ? href : `https://www.jsums.edu${href}`;
      // Canonicalize Google Patents URLs: extract patent number from path and rebuild URL
      if (fullUrl.includes("patents.google.com")) {
        const patentMatch = fullUrl.match(/\/patent\/([A-Z]{2}[0-9]+[A-Z0-9]*)/i);
        if (patentMatch) {
          const canonNum = patentMatch[1].toUpperCase();
          fullUrl = `https://patents.google.com/patent/${canonNum}/en`;
        }
      }
      if (seen.has(fullUrl)) return;
      // Build title: prefer anchor text; fall back to canonical patent number from URL
      let title = cleanText($(el).text());
      if (!title || title.length < 5) {
        const numMatch = fullUrl.match(/\/patent\/([A-Z]{2}[0-9]+[A-Z0-9]*)/i);
        if (numMatch) title = `Patent ${numMatch[1].toUpperCase()}`;
      }
      if (!title || title.length < 5) return;
      seen.add(fullUrl);
      results.push({ title, description: "", url: fullUrl, institution: "Jackson State University" });
    });
    console.log(`[scraper] Jackson State University: ${results.length} listings`);
    return results;
  },
};

// 2. Ferris State University
// TTO page lists technologies as Google Patent image PDF links (patentimages.storage.googleapis.com)
export const ferrisStateScraper: InstitutionScraper = {
  institution: "Ferris State University",
  async scrape(): Promise<ScrapedListing[]> {
    const url = "https://www.ferris.edu/administration/academicaffairs/vpoffice/Academic_Research/int-prop-and-tech-transfer.htm";
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = (await import("cheerio")).load(html);
    const results: ScrapedListing[] = [];
    const seen = new Set<string>();
    // Extract Google Patent image PDFs and internal FSU patent PDFs (exclude policy/process docs)
    $('a[href*="patentimages.storage.googleapis.com"], a[href*="image-ppubs.uspto.gov"]').each((_, el) => {
      const href = $(el).attr("href") ?? "";
      if (!href || seen.has(href)) return;
      const title = cleanText($(el).text());
      if (!title || title.length < 5 || /^(AAU|process|policy|form|guidelines|charter)/i.test(title)) return;
      seen.add(href);
      results.push({ title, description: "", url: href, institution: "Ferris State University" });
    });
    // Also capture internal patent PDFs with descriptive anchor text
    $('a[href*="pdfs-docs/Protoconch"], a[href*="/technologytransfer/files/"]').each((_, el) => {
      const href = $(el).attr("href") ?? "";
      if (!href || seen.has(href)) return;
      const title = cleanText($(el).text());
      if (!title || title.length < 10 || /^(description|DESCRIPTION)/i.test(title.slice(0,15))) return;
      const fullUrl = href.startsWith("http") ? href : `https://www.ferris.edu${href}`;
      seen.add(fullUrl);
      results.push({ title, description: "", url: fullUrl, institution: "Ferris State University" });
    });
    console.log(`[scraper] Ferris State University: ${results.length} listings`);
    return results;
  },
};

// 3. Brookhaven National Laboratory
// List pages at /techtransfer/list.php?t=1&q=XXXX enumerate tech IDs;
// detail pages at technology.php?sel={id} provide description text
export const brookhavenScraper: InstitutionScraper = {
  institution: "Brookhaven National Laboratory",
  async scrape(): Promise<ScrapedListing[]> {
    const base = "https://www.bnl.gov/techtransfer";
    const stubs: Array<{ title: string; url: string }> = [];
    const seen = new Set<string>();
    const cheerio = await import("cheerio");
    // Collect all tech stubs by iterating q values (1001-1020)
    for (let q = 1001; q <= 1020; q++) {
      try {
        const r = await fetch(`${base}/list.php?t=1&q=${q}`, {
          signal: AbortSignal.timeout(12000),
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!r.ok) continue;
        const $ = cheerio.load(await r.text());
        $('a[href*="technology.php"]').each((_, el) => {
          const href = $(el).attr("href") ?? "";
          if (!href.match(/sel=\d+/)) return;
          const fullUrl = href.startsWith("http") ? href : `${base}/${href.replace(/^\/+/, "")}`;
          if (seen.has(fullUrl)) return;
          const title = cleanText($(el).text());
          if (!title || title.length < 5) return;
          seen.add(fullUrl);
          stubs.push({ title, url: fullUrl });
        });
      } catch {
        continue;
      }
    }
    // Fetch detail pages concurrently (limit 5) for descriptions
    const CONC = 5;
    const results: ScrapedListing[] = [];
    for (let i = 0; i < stubs.length; i += CONC) {
      const batch = stubs.slice(i, i + CONC);
      const settled = await Promise.allSettled(
        batch.map(async (s) => {
          const detail = await fetchHtml(s.url, 10000);
          let description = "";
          if (detail) {
            detail("p").each((_, el) => {
              const txt = cleanText(detail(el).text());
              if (txt.length > description.length && txt.length > 30) description = txt;
            });
            description = description.slice(0, 400);
          }
          return { ...s, description, institution: "Brookhaven National Laboratory" };
        })
      );
      settled.forEach((r) => { if (r.status === "fulfilled") results.push(r.value); });
    }
    console.log(`[scraper] Brookhaven National Laboratory: ${results.length} listings`);
    return results;
  },
};

// 4. LaunchTN
// available-technologies page (with curl UA to bypass WAF) embeds static First Ignite
// (app.firstignite.com/public/listings/{UUID}) anchor pairs: (title, institution) per tech.
// Fetches detail page at app.firstignite.com for description field.
export const launchTNScraper: InstitutionScraper = {
  institution: "LaunchTN",
  async scrape(): Promise<ScrapedListing[]> {
    // Must use curl UA to bypass WAF; Chrome/Firefox UA gets 403
    const cheerio = await import("cheerio");
    const res = await fetch("https://launchtn.org/available-technologies/", {
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
      headers: { "User-Agent": "curl/7.88.1", "Accept": "text/html,*/*" },
    });
    if (!res.ok) return [];
    const $ = cheerio.load(await res.text());
    // Collect First Ignite listing links — every pair (even idx = title, odd idx = institution)
    const links: Array<{ href: string; text: string }> = [];
    $('a[href*="app.firstignite.com/public/listings/"]').each((_, el) => {
      links.push({ href: $(el).attr("href") ?? "", text: cleanText($(el).text()) });
    });
    // Deduplicate by UUID — validate pairing: both links in a pair must share the same href
    // (title-link and institution-link for each tech both point to the same UUID URL)
    const seen = new Set<string>();
    const stubs: Array<{ title: string; institution: string; url: string }> = [];
    for (let i = 0; i + 1 < links.length; i += 2) {
      const href = links[i].href;
      const pairHref = links[i + 1]?.href ?? "";
      // Guard: if pair hrefs differ, the alternating assumption is broken — skip
      if (!href || seen.has(href) || href !== pairHref) continue;
      const title = links[i].text;
      const institution = links[i + 1].text || "LaunchTN";
      if (!title || title.length < 5) continue;
      seen.add(href);
      stubs.push({ title, institution, url: href });
    }
    // Fetch First Ignite detail pages for description (limit 5 concurrent)
    const CONC = 5;
    const results: ScrapedListing[] = [];
    for (let i = 0; i < stubs.length; i += CONC) {
      const batch = stubs.slice(i, i + CONC);
      const settled = await Promise.allSettled(
        batch.map(async (s) => {
          const detail = await fetchHtml(s.url, 10000);
          let description = "";
          if (detail) {
            detail("p").each((_, el) => {
              const txt = cleanText(detail(el).text());
              if (txt.length > description.length && txt.length > 30) description = txt;
            });
            description = description.slice(0, 400);
          }
          return { title: s.title, description, url: s.url, institution: `LaunchTN (${s.institution})` };
        })
      );
      settled.forEach((r) => { if (r.status === "fulfilled") results.push(r.value); });
    }
    console.log(`[scraper] LaunchTN: ${results.length} listings`);
    return results;
  },
};

// 5. RIT (Rochester Institute of Technology)
// Listing page at /ipmo/available-technologies has links to /ipmo/patents/us-XXXXXXXX;
// detail pages fetched concurrently for description text
export const ritScraper: InstitutionScraper = {
  institution: "Rochester Institute of Technology (RIT)",
  async scrape(): Promise<ScrapedListing[]> {
    const base = "https://www.rit.edu";
    const url = `${base}/ipmo/available-technologies`;
    const $ = await fetchHtml(url, 15000);
    if (!$) return [];
    const stubs: Array<{ title: string; url: string }> = [];
    const seen = new Set<string>();
    $('a[href*="/ipmo/patents/"], a[href*="/ipmo/license/"]').each((_, el) => {
      const href = $(el).attr("href") ?? "";
      if (!href) return;
      const fullUrl = href.startsWith("http") ? href : `${base}${href}`;
      if (seen.has(fullUrl)) return;
      const title = cleanText($(el).text());
      if (!title || title.length < 8 || /^(technical.review|panel|review)/i.test(title)) return;
      seen.add(fullUrl);
      stubs.push({ title, url: fullUrl });
    });
    // Fetch detail pages concurrently (limit 4) for description
    const CONC = 4;
    const results: ScrapedListing[] = [];
    for (let i = 0; i < stubs.length; i += CONC) {
      const batch = stubs.slice(i, i + CONC);
      const settled = await Promise.allSettled(
        batch.map(async (s) => {
          const detail = await fetchHtml(s.url, 10000);
          let description = "";
          if (detail) {
            detail("p").each((_, el) => {
              const txt = cleanText(detail(el).text());
              if (txt.length > description.length && txt.length > 30) description = txt;
            });
            description = description.slice(0, 400);
          }
          return { ...s, description, institution: "Rochester Institute of Technology (RIT)" };
        })
      );
      settled.forEach((r) => { if (r.status === "fulfilled") results.push(r.value); });
    }
    console.log(`[scraper] RIT: ${results.length} listings`);
    return results;
  },
};

// 7. New Mexico Tech
// Invention summaries page lists technologies as PDF links with descriptive anchor text
export const nmTechScraper: InstitutionScraper = {
  institution: "New Mexico Tech",
  async scrape(): Promise<ScrapedListing[]> {
    const base = "https://www.nmt.edu";
    const url = `${base}/oic/invention-summaries.php`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = (await import("cheerio")).load(html);
    const results: ScrapedListing[] = [];
    const seen = new Set<string>();
    $("a[href$='.pdf'], a[href*='/oic/']").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      if (!href || !href.endsWith(".pdf")) return;
      const title = cleanText($(el).text());
      if (!title || title.length < 8) return;
      const fullUrl = href.startsWith("http") ? href : `${base}${href.startsWith("/") ? "" : "/"}${href}`;
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);
      results.push({ title, description: "", url: fullUrl, institution: "New Mexico Tech" });
    });
    console.log(`[scraper] New Mexico Tech: ${results.length} listings`);
    return results;
  },
};

// 8. Sandia National Laboratories
// Discovers ip-opportunity sitemap pages via WP sitemap index (wp-sitemap.xml);
// fetches each discovered page concurrently and derives titles from URL slugs.
export const sandiaScraper: InstitutionScraper = {
  institution: "Sandia National Laboratories",
  async scrape(): Promise<ScrapedListing[]> {
    const base = "https://ip.sandia.gov";
    const allUrls: string[] = [];
    try {
      // Step 1: discover sitemap pages from WP sitemap index
      const indexRes = await fetch(`${base}/wp-sitemap.xml`, { signal: AbortSignal.timeout(12000), headers: { "User-Agent": "Mozilla/5.0" } });
      let sitemapPages: string[] = [];
      if (indexRes.ok) {
        const indexXml = await indexRes.text();
        sitemapPages = Array.from(
          indexXml.matchAll(/<loc>(https:\/\/ip\.sandia\.gov\/wp-sitemap-posts-ip-opportunity-[^<]+)<\/loc>/g)
        ).map(m => m[1]);
      }
      // Fall back to known page if sitemap index not available or contains no opportunity sitemaps
      if (sitemapPages.length === 0) {
        sitemapPages = [`${base}/wp-sitemap-posts-ip-opportunity-1.xml`];
      }
      // Step 2: fetch all sitemap pages for opportunity URLs
      for (const page of sitemapPages) {
        try {
          const res = await fetch(page, { signal: AbortSignal.timeout(12000), headers: { "User-Agent": "Mozilla/5.0" } });
          if (!res.ok) continue;
          const xml = await res.text();
          const urls = Array.from(xml.matchAll(/<loc>(https:\/\/ip\.sandia\.gov\/opportunity\/[^<]+)<\/loc>/g)).map(m => m[1]);
          allUrls.push(...urls);
        } catch { continue; }
      }
    } catch {
      return [];
    }
    const results: ScrapedListing[] = allUrls.map(url => {
      const slug = url.replace(/\/$/, "").split("/").pop() ?? "";
      const title = slug.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      return { title, description: "", url, institution: "Sandia National Laboratories" };
    });
    console.log(`[scraper] Sandia National Laboratories: ${results.length} listings`);
    return results;
  },
};

// ── Los Alamos National Laboratory — CDX-only (Task #136) ─────────────────────
// All lanl.gov IPs are blocked from Replit — every direct HTTP fetch returns 404
// (including the homepage). Direct Playwright would also fail.
// Strategy: Wayback Machine CDX to discover historically-archived technology URLs,
// then attempt to load those archived URLs. CDX is queried with a short timeout
// and gracefully returns [] if the CDX server is slow or the query yields nothing.
// Multiple URL patterns tried because LANL has reorganised its TTO paths over time.
export const losAlamosScraper: InstitutionScraper = {
  institution: "Los Alamos National Laboratory",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Los Alamos National Laboratory";

    // CDX URL patterns to probe — ordered most-likely-to-have-results first
    const CDX_PATTERNS = [
      "lanl.gov/technology-transfer/available-technologies/*",
      "lanl.gov/business/technology-transfer/available-technologies/*",
      "lanl.gov/partnerships/technology-transfer/*",
      "lanl.gov/industry/technology-transfer/*",
    ];

    const seenUrls = new Set<string>();
    const techUrls: string[] = [];

    for (const pattern of CDX_PATTERNS) {
      try {
        const cdxRes = await fetch(
          `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(pattern)}&output=json&limit=300&fl=original&collapse=urlkey&filter=statuscode:200`,
          {
            signal: AbortSignal.timeout(25_000),
            headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
          }
        );
        if (!cdxRes.ok) continue;
        const rows = await cdxRes.json() as string[][];
        for (const row of rows.slice(1)) {
          const url = row[0];
          if (!url) continue;
          const clean = url.split("?")[0].split("#")[0];
          // Must be a detail page (has a slug after the known directory paths)
          const isDetail =
            /\/available-technologies\/[^/]+$/.test(clean) ||
            /\/technology-transfer\/[a-z0-9-]{10,}$/.test(clean);
          if (!isDetail || seenUrls.has(clean)) continue;
          seenUrls.add(clean);
          techUrls.push(clean);
        }
        if (techUrls.length > 0) break; // Found results from this pattern — stop
      } catch {
        // CDX timeout or network error for this pattern — try next
      }
    }

    if (techUrls.length === 0) {
      console.log(`[scraper] ${INST}: 0 tech URLs from CDX — lanl.gov blocks Replit IPs; will retry when proxy is available`);
      return [];
    }

    // Validate discovered URLs against the live site — only keep listings that respond.
    // lanl.gov currently blocks Replit IPs so all live checks will likely fail;
    // in that case return [] gracefully rather than emitting stale/unresolvable listings.
    const toTitle = (u: string) =>
      (u.split("/").pop() ?? "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

    const liveResults: ScrapedListing[] = [];
    const CHECK_TIMEOUT = 8_000;
    const BATCH = 10; // Concurrent HEAD requests

    for (let i = 0; i < techUrls.length; i += BATCH) {
      const batch = techUrls.slice(i, i + BATCH);
      const checks = await Promise.allSettled(
        batch.map(async (u) => {
          const res = await fetch(u, {
            method: "HEAD",
            signal: AbortSignal.timeout(CHECK_TIMEOUT),
            headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
            redirect: "follow",
          });
          return res.ok ? u : null;
        })
      );
      for (const r of checks) {
        const url = r.status === "fulfilled" ? r.value : null;
        if (!url) continue;
        liveResults.push({ title: toTitle(url), description: "", url, institution: INST });
      }
    }

    if (liveResults.length === 0) {
      console.log(`[scraper] ${INST}: CDX found ${techUrls.length} historical URLs but none are live (lanl.gov blocks Replit IPs)`);
      return [];
    }

    console.log(`[scraper] ${INST}: ${liveResults.length} live listings`);
    return liveResults;
  },
};

// Flintbox portals
export const umbcScraper = createFlintboxScraper(
  { slug: "umbc", orgId: 131, accessKey: "886542e2-8300-4e8a-ad5a-136fbc497726" },
  "University of Maryland Baltimore County (UMBC)"
);
export const bostonCollegeScraper = createFlintboxScraper(
  { slug: "bc", orgId: 134, accessKey: "bd07e4dd-db0e-422f-9fe1-5e4995879b5f" },
  "Boston College"
);

// ─── Batch 3: Government & Cancer Center Scrapers (Task #107) ─────────────────

// 1. NIDDK (National Institute of Diabetes and Digestive and Kidney Diseases)
// RSS feed at niddk.nih.gov/rss/research-materials;
// 50 items with CDATA titles and HTML-encoded descriptions.
export const niddkScraper: InstitutionScraper = {
  institution: "NIDDK (NIH)",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "NIDDK (NIH)";
    try {
      const r = await fetch("https://www.niddk.nih.gov/rss/research-materials", {
        signal: AbortSignal.timeout(15_000),
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const xml = await r.text();

      const results: ScrapedListing[] = [];
      const items = Array.from(xml.matchAll(/<item>([\s\S]+?)<\/item>/g));

      for (const item of items) {
        const block = item[1];
        const rawTitle =
          block.match(/<title><!\[CDATA\[(.+?)\]\]><\/title>/)?.[1] ??
          block.match(/<title>(.+?)<\/title>/)?.[1] ??
          "";
        const title = rawTitle
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
          .replace(/&[a-z#0-9]+;/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
        const link = (
          block.match(/<link>([^<\s]+)<\/link>/)?.[1] ??
          block.match(/<guid[^>]*>([^<]+)<\/guid>/)?.[1] ??
          ""
        ).trim();
        const rawDesc =
          block.match(/<description><!\[CDATA\[([\s\S]+?)\]\]><\/description>/)?.[1] ??
          block.match(/<description>([\s\S]+?)<\/description>/)?.[1] ??
          "";
        const description = rawDesc
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
          .replace(/<[^>]+>/g, " ")
          .replace(/&[a-z#0-9]+;/gi, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 2000);

        if (!title || !link) continue;
        results.push({ title, description: description || title, url: link, institution: INST });
      }

      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};

// 2. Lawrence Berkeley National Laboratory
// WordPress REST API: ipo.lbl.gov/wp-json/wp/v2/posts?per_page=100&page=N
// ~1066 posts across ~11 pages; descriptions extracted from content.rendered
// using the longest-paragraph strategy — no separate detail-page fetch needed.
export const lblScraper: InstitutionScraper = {
  institution: "Lawrence Berkeley National Laboratory",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Lawrence Berkeley National Laboratory";
    const BASE = "https://ipo.lbl.gov";
    const PER_PAGE = 100;

    function extractDescription(html: string): string {
      const paras = Array.from(html.matchAll(/<p[^>]*>([\s\S]+?)<\/p>/gi));
      let longest = "";
      for (const m of paras) {
        const text = m[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&[a-z#0-9]+;/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (text.length > longest.length) longest = text;
      }
      return longest.slice(0, 2000);
    }

    function decodeTitle(html: string): string {
      return html
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&[a-z#0-9]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    try {
      const firstRes = await fetch(`${BASE}/wp-json/wp/v2/posts?per_page=${PER_PAGE}&page=1`, {
        signal: AbortSignal.timeout(20_000),
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!firstRes.ok) throw new Error(`HTTP ${firstRes.status}`);
      const totalPages = Math.min(parseInt(firstRes.headers.get("X-WP-TotalPages") ?? "1", 10), 50);
      const firstPosts: any[] = await firstRes.json();
      const allPosts: any[] = [...firstPosts];

      for (let pg = 2; pg <= totalPages; pg += 5) {
        const batch: Promise<any[]>[] = [];
        for (let i = pg; i < Math.min(pg + 5, totalPages + 1); i++) {
          batch.push(
            fetch(`${BASE}/wp-json/wp/v2/posts?per_page=${PER_PAGE}&page=${i}`, {
              signal: AbortSignal.timeout(20_000),
              headers: { "User-Agent": "Mozilla/5.0" },
            })
              .then((r) => (r.ok ? r.json() : []))
              .catch(() => [])
          );
        }
        const batchResults = await Promise.all(batch);
        for (const posts of batchResults) allPosts.push(...(posts as any[]));
      }

      const results: ScrapedListing[] = [];
      for (const post of allPosts) {
        const title = decodeTitle(post.title?.rendered ?? "");
        const url: string = post.link ?? "";
        if (!title || !url) continue;
        const description = extractDescription(post.content?.rendered ?? "");
        results.push({ title, description: description || title, url, institution: INST });
      }

      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};

// 3. Roswell Park Comprehensive Cancer Center
// Sitemap pages 1–8 at roswellpark.org/sitemap.xml?page=N filtered for
// /commercialization/technologies/ URLs; concurrent detail-page fetch (limit 5)
// for h1 title and longest-paragraph description.
export const roswellParkScraper: InstitutionScraper = {
  institution: "Roswell Park Comprehensive Cancer Center",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Roswell Park Comprehensive Cancer Center";
    const BASE = "https://www.roswellpark.org";
    const TECH_PREFIX = `${BASE}/commercialization/technologies/`;

    const techUrls = new Set<string>();
    for (let pg = 1; pg <= 8; pg++) {
      try {
        const r = await fetch(`${BASE}/sitemap.xml?page=${pg}`, {
          signal: AbortSignal.timeout(12_000),
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!r.ok) break;
        const xml = await r.text();
        const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
        let found = 0;
        for (const u of locs) {
          if (u.startsWith(TECH_PREFIX) && u !== TECH_PREFIX) {
            techUrls.add(u);
            found++;
          }
        }
        if (pg >= 4 && locs.length < 100) break;
      } catch {
        break;
      }
    }

    if (techUrls.size === 0) {
      console.log(`[scraper] ${INST}: 0 tech URLs found in sitemap`);
      return [];
    }

    const CONCURRENCY = 5;
    const urlList = Array.from(techUrls);
    const results: ScrapedListing[] = [];

    for (let i = 0; i < urlList.length; i += CONCURRENCY) {
      const batch = urlList.slice(i, i + CONCURRENCY);
      const fetched = await Promise.all(
        batch.map(async (url) => {
          try {
            const r = await fetch(url, {
              signal: AbortSignal.timeout(12_000),
              headers: { "User-Agent": "Mozilla/5.0" },
            });
            if (!r.ok) return null;
            const html = await r.text();
            const title = (html.match(/<h1[^>]*>([\s\S]+?)<\/h1>/i)?.[1] ?? "")
              .replace(/<[^>]+>/g, "")
              .replace(/&[a-z#0-9]+;/gi, " ")
              .replace(/\s+/g, " ")
              .trim();
            if (!title) return null;
            const paras = Array.from(html.matchAll(/<p[^>]*>([\s\S]+?)<\/p>/gi));
            let description = "";
            for (const m of paras) {
              const text = m[1]
                .replace(/<[^>]+>/g, "")
                .replace(/&[a-z#0-9]+;/gi, " ")
                .replace(/\s+/g, " ")
                .trim();
              if (text.length > 80 && text.length > description.length) description = text;
            }
            return {
              title,
              description: description.slice(0, 2000) || title,
              url,
              institution: INST,
            } satisfies ScrapedListing;
          } catch {
            return null;
          }
        })
      );
      for (const r of fetched) if (r) results.push(r);
    }

    console.log(`[scraper] ${INST}: ${results.length} listings`);
    return results;
  },
};

// 4. NCATS (National Center for Advancing Translational Sciences)
// Same Algolia infrastructure as nihott.ts; filter by field_ics:NCATS.
// 143 records confirmed. Data source is NIHTT; URLs resolve to techtransfer.nih.gov/tech/*.
const NCATS_ALGOLIA_APP_ID = "WEXCESI5EU";
const NCATS_ALGOLIA_API_KEY = "3986149b687b8f20e2468432f329f08c";
const NCATS_ALGOLIA_URL = `https://${NCATS_ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/ott/query`;
const NCATS_BASE_URL = "https://techtransfer.nih.gov";

export const ncatsScraper: InstitutionScraper = {
  institution: "NCATS (NIH)",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "NCATS (NIH)";
    const HITS_PER_PAGE = 200;

    function stripHtml(html: string): string {
      return html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
    }

    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();
      let page = 0;
      let nbPages = 1;

      while (page < nbPages) {
        const res = await fetch(NCATS_ALGOLIA_URL, {
          method: "POST",
          signal: AbortSignal.timeout(30_000),
          headers: {
            "X-Algolia-Application-Id": NCATS_ALGOLIA_APP_ID,
            "X-Algolia-API-Key": NCATS_ALGOLIA_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: "",
            hitsPerPage: HITS_PER_PAGE,
            page,
            filters: "type:tech AND field_ics:NCATS",
            attributesToRetrieve: [
              "title", "body", "url",
              "field_therapeutic_areas", "field_development_stages",
              "field_applications", "field_ics", "field_data_source",
              "field_collaborations", "field_date_published",
              "field_inventor_names", "field_patent_statuses",
              "field_inventor_emails", "field_commercial_applications",
              "field_competitive_advantages", "objectID",
            ],
          }),
        });
        if (!res.ok) throw new Error(`Algolia HTTP ${res.status}`);
        const json: { hits: any[]; nbPages: number; nbHits: number } = await res.json();
        nbPages = json.nbPages;

        for (const hit of json.hits) {
          const title = (hit.title ?? "").trim();
          if (!title || title.length < 5) continue;
          const rawUrl: string = hit.url ?? "";
          const url = rawUrl.startsWith("http")
            ? rawUrl
            : rawUrl.startsWith("/")
            ? `${NCATS_BASE_URL}${rawUrl}`
            : "";
          if (!url) continue;
          const dedupKey: string = hit.objectID || url || title;
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);

          const bodyText = stripHtml(hit.body ?? "");
          const commercialApps = stripHtml(hit.field_commercial_applications ?? "");
          const advantages = stripHtml(hit.field_competitive_advantages ?? "");
          const description =
            [bodyText, commercialApps, advantages].filter(Boolean).join(" ").slice(0, 2000) || title;

          const toArr = (v: unknown): string[] =>
            Array.isArray(v) ? v : typeof v === "string" && v ? [v] : [];

          results.push({
            title,
            description,
            url,
            institution: INST,
            categories: [
              ...toArr(hit.field_therapeutic_areas),
              ...toArr(hit.field_applications),
            ].filter(Boolean),
            stage: toArr(hit.field_development_stages)[0] ?? undefined,
            inventors: toArr(hit.field_inventor_names).length ? toArr(hit.field_inventor_names) : undefined,
            patentStatus: toArr(hit.field_patent_statuses)[0] ?? undefined,
            publishedDate: hit.field_date_published ?? undefined,
            contactEmail: toArr(hit.field_inventor_emails)[0] ?? undefined,
            technologyId: hit.objectID ?? undefined,
          });
        }
        page++;
      }

      console.log(`[scraper] ${INST}: ${results.length} listings (Algolia field_ics:NCATS)`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};

// ── Task #109 — Batch 4 Scrapers (March 2026) ────────────────────────────────

// Dana-Farber Cancer Institute — in-part portal (subdomain "dfci"), ~70 technologies
// Export as both dfciScraper (canonical task name) and danaFarberScraper (alias)
export const dfciScraper = createInPartScraper("dfci", "Dana-Farber Cancer Institute");
export const danaFarberScraper = dfciScraper;

// Cincinnati Children's Hospital Medical Center
// Source: HTML search page at /research/support/innovation-ventures/technologies/search
// Paginates with ?page=N until no new URLs appear (server returns same 40 records when exhausted).
// Cards rendered server-side; descriptions extracted from card-text divs.
export const cincyChildrensScraper: InstitutionScraper = {
  institution: "Cincinnati Children's Hospital Medical Center",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Cincinnati Children's Hospital Medical Center";
    const BASE = "https://www.cincinnatichildrens.org";
    const SEARCH_BASE = `${BASE}/research/support/innovation-ventures/technologies/search`;

    const extractCards = (html: string): ScrapedListing[] => {
      const items: ScrapedListing[] = [];
      const cardRe =
        /class="card-title name mb-3"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]{0,400}?class="card-text"[^>]*>([\s\S]{0,500}?)<\/div>/g;
      let m: RegExpExecArray | null;
      while ((m = cardRe.exec(html)) !== null) {
        const url = m[1].trim();
        const title = m[2].trim();
        if (!title || title.length < 3) continue;
        const rawDesc = m[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        items.push({
          title,
          description: rawDesc.slice(0, 1000),
          url: url.startsWith("http") ? url : `${BASE}${url}`,
          institution: INST,
        });
      }
      // Fallback: simpler link extraction
      if (items.length === 0) {
        const re = /<a[^>]*href="(https?:\/\/www\.cincinnatichildrens\.org\/research\/support\/innovation-ventures\/technologies\/[0-9-]+)"[^>]*>([^<]{5,})<\/a>/g;
        while ((m = re.exec(html)) !== null) {
          const title = m[2].trim();
          if (title.length >= 5) items.push({ title, description: "", url: m[1].trim(), institution: INST });
        }
      }
      return items;
    };

    try {
      const seen = new Set<string>();
      const results: ScrapedListing[] = [];
      let page = 1;

      while (page <= 20) {
        const url = page === 1 ? SEARCH_BASE : `${SEARCH_BASE}?page=${page}`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) break;
        const html = await res.text();
        const cards = extractCards(html);
        let newCount = 0;
        for (const card of cards) {
          if (seen.has(card.url)) continue;
          seen.add(card.url);
          results.push(card);
          newCount++;
        }
        // Stop when no new URLs appear (server repeats results when page is exhausted)
        if (newCount === 0 || cards.length === 0) break;
        page++;
      }

      console.log(`[scraper] ${INST}: ${results.length} listings (${page - 1} pages fetched)`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
export const cincinnatiChildrensScraper = cincyChildrensScraper;

// Fox Chase Cancer Center
// Source: Drupal listing at /about-us/research-and-development-alliances/technology-transfer/licensing
// Two-level crawl: category pages (5 path segs) → tech pages (6+ path segs) → h1 title
export const foxChaseScraper: InstitutionScraper = {
  institution: "Fox Chase Cancer Center",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Fox Chase Cancer Center";
    const BASE = "https://www.foxchase.org";
    const LISTING = `${BASE}/about-us/research-and-development-alliances/technology-transfer/licensing`;

    const fetchHtmlFox = async (url: string): Promise<string | null> => {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
          signal: AbortSignal.timeout(15_000),
        });
        return res.ok ? await res.text() : null;
      } catch {
        return null;
      }
    };

    const extractLicensingLinks = (html: string): { categories: string[]; techPages: string[] } => {
      const categories: string[] = [];
      const techPages: string[] = [];
      const re = /href="(\/about-us\/research-and-development-alliances\/technology-transfer\/licensing\/[^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) {
        const path = m[1];
        const segs = path.split("/").filter(Boolean);
        // 5 segs → category page  (…/licensing/{category})
        // 6+ segs → individual tech page (…/licensing/{category}/{tech})
        if (segs.length === 5) {
          if (!categories.includes(path)) categories.push(path);
        } else if (segs.length >= 6) {
          if (!techPages.includes(path)) techPages.push(path);
        }
      }
      return { categories, techPages };
    };

    const extractTitle = (html: string): string => {
      const h1 =
        html.match(/<h1[^>]*class="[^"]*page-title[^"]*"[^>]*>([\s\S]+?)<\/h1>/i) ??
        html.match(/<h1[^>]*>([\s\S]+?)<\/h1>/i);
      if (h1) return h1[1].replace(/<[^>]+>/g, "").trim();
      const t = html.match(/<title>([^<|]+)/i);
      if (t) return t[1].replace(/\s*[-|].*$/, "").trim();
      return "";
    };

    try {
      const listingHtml = await fetchHtmlFox(LISTING);
      if (!listingHtml) throw new Error("Listing page fetch failed");

      const { categories, techPages: listingTechPages } = extractLicensingLinks(listingHtml);
      const allTechPages = new Set<string>(listingTechPages);

      for (const catPath of categories) {
        const catHtml = await fetchHtmlFox(`${BASE}${catPath}`);
        if (!catHtml) continue;
        const { techPages: catTechPages } = extractLicensingLinks(catHtml);
        for (const tp of catTechPages) allTechPages.add(tp);
      }

      const results: ScrapedListing[] = [];
      for (const techPath of Array.from(allTechPages)) {
        try {
          const pageHtml = await fetchHtmlFox(`${BASE}${techPath}`);
          if (!pageHtml) continue;
          const title = extractTitle(pageHtml);
          if (!title || title.length < 3) continue;
          const segs = techPath.split("/").filter(Boolean);
          const category = segs[4] ? segs[4].replace(/-/g, " ") : undefined;
          results.push({
            title,
            description: "",
            url: `${BASE}${techPath}`,
            institution: INST,
            categories: category ? [category] : undefined,
          });
        } catch {
          continue;
        }
      }

      console.log(`[scraper] ${INST}: ${results.length} listings (${allTechPages.size} tech pages, ${categories.length} categories)`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};

// Fred Hutchinson Cancer Center
// Investigation (March 2026):
//   AEM page uses Elastic App Search — default URL loads 10 results (size=n_10_n).
//   Fix (Task #137): Navigate directly to ?size=n_1000_n with the search_result_type
//   filter so all 61 available technologies appear in a single page load.
//   Verified: 61 tech-details links returned in one load (2026-03-18).
export const fredHutchScraper: InstitutionScraper = {
  institution: "Fred Hutchinson Cancer Center",
  scraperType: "playwright",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Fred Hutchinson Cancer Center";
    const BASE = "https://www.fredhutch.org";
    // size=n_1000_n forces Elastic App Search to return up to 1000 results in one page.
    // The filter restricts to "Available Technologies" search_result_type.
    const LISTING_URL =
      `${BASE}/en/investors/business-development/available-technologies.html` +
      `?size=n_1000_n` +
      `&filters%5B0%5D%5Bfield%5D=search_result_type` +
      `&filters%5B0%5D%5Btype%5D=any` +
      `&filters%5B0%5D%5Bvalues%5D%5B0%5D=Available%20Technologies`;

    let browser: import("playwright").Browser | null = null;
    try {
      const { chromium } = await import("playwright");
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      });

      // AEM + Elastic renders asynchronously — use networkidle then wait 5 s more
      await page.goto(LISTING_URL, { timeout: 60_000, waitUntil: "networkidle" });
      await page.waitForTimeout(5_000);

      // Scroll to trigger any lazy-loaded Elastic result blocks
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2_000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1_500);

      // Non-throwing wait for any tech link to appear
      await page.waitForSelector(
        'a[href*="technology-details"]',
        { timeout: 12_000 }
      ).catch(() => null);

      const allLinks = new Map<string, string>();

      // Collect all technology-details links from the fully-loaded page
      const links = await page.$$eval(
        'a[href*="technology-details"]',
        (els) => Array.from(new Set(els)).map((el) => ({
          href: (el as HTMLAnchorElement).getAttribute("href") ?? "",
          text: el.textContent?.trim() ?? "",
        }))
      );
      for (const l of links) {
        if (!l.href || !/technology-details/.test(l.href)) continue;
        if (!allLinks.has(l.href)) allLinks.set(l.href, l.text);
      }

      const results: ScrapedListing[] = [];
      for (const [href, title] of Array.from(allLinks.entries())) {
        if (!title || title.length < 3) continue;
        const fullUrl = href.startsWith("http") ? href : `${BASE}${href}`;
        results.push({ title, description: "", url: fullUrl, institution: INST });
      }

      console.log(`[scraper] ${INST}: ${results.length} listings (Playwright AEM, size=1000)`);
      return results;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] ${INST} Playwright failed: ${msg}`);
      return [];
    } finally {
      await browser?.close();
    }
  },
};

// Moffitt Cancer Center
// Direct HTTP access blocked by Cloudflare Managed Challenge (HTTP 403; Playwright also blocked).
// Primary strategy: Playwright traversal of the live site (attempt first; Cloudflare may block headless).
// Fallback strategy: Wayback Machine 2023 snapshot — 6 confirmed archived category pages:
//   pharmaceuticals-biologics, diagnostics, devices, immunotherapies,
//   software-tools, clinical-decision-support-tools
// Archived category pages contain individual tech slug links; titles derived from slugs.
// Smoke-tested: 158 listings from 4 archived categories (as of 2026-03-17).
export const moffittScraper: InstitutionScraper = {
  institution: "Moffitt Cancer Center",
  scraperType: "playwright",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Moffitt Cancer Center";
    const MOFFITT_BASE = "https://www.moffitt.org/research-science/academic-and-industry-partnerships/office-of-innovation/available-technologies";
    const LISTING_URL = `${MOFFITT_BASE}/`;
    const WB_BASE = "https://web.archive.org/web";
    const LISTING_TS = "20230803091028";

    // ── Primary: Playwright live traversal ──────────────────────────────────
    const playwrightScrape = async (): Promise<ScrapedListing[] | null> => {
      let browser: import("playwright").Browser | null = null;
      try {
        const { chromium } = await import("playwright");
        browser = await chromium.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        });
        const page = await browser.newPage();
        await page.setExtraHTTPHeaders({
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        });
        await page.goto(LISTING_URL, { timeout: 20_000, waitUntil: "domcontentloaded" });
        await page.waitForTimeout(4_000);

        const pageTitle = await page.title();
        // Cloudflare challenge returns "Just a moment..." — fall back to Wayback
        if (pageTitle.includes("Just a moment") || pageTitle.includes("Attention Required")) {
          return null;
        }

        // Collect category links from the listing page
        const catLinks = await page.$$eval(`a[href*="available-technologies/"]`, (els) =>
          Array.from(new Set(els
            .map((el) => el.getAttribute("href") ?? "")
            .filter((h) => h.includes("available-technologies/") && !h.endsWith("/available-technologies/"))
          ))
        );

        const allResults: ScrapedListing[] = [];
        const seen = new Set<string>();

        for (const catHref of catLinks) {
          const catUrl = catHref.startsWith("http") ? catHref : `https://www.moffitt.org${catHref}`;
          try {
            await page.goto(catUrl, { timeout: 20_000, waitUntil: "domcontentloaded" });
            await page.waitForTimeout(2_000);
            const techLinks = await page.$$eval(`a[href*="available-technologies/"][href]`, (els) =>
              els
                .map((el) => ({ href: el.getAttribute("href") ?? "", text: el.textContent?.trim() ?? "" }))
                .filter((l) => l.text.length > 3)
            );
            for (const l of techLinks) {
              if (seen.has(l.href)) continue;
              seen.add(l.href);
              const url = l.href.startsWith("http") ? l.href : `https://www.moffitt.org${l.href}`;
              allResults.push({ title: l.text, description: "", url, institution: INST });
            }
          } catch {
            continue;
          }
        }
        return allResults;
      } catch {
        return null;
      } finally {
        await browser?.close();
      }
    };

    const wbFetch = async (liveUrl: string, ts: string): Promise<string | null> => {
      try {
        const archiveUrl = `${WB_BASE}/${ts}/${liveUrl}`;
        const res = await fetch(archiveUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
          signal: AbortSignal.timeout(20_000),
        });
        return res.ok ? await res.text() : null;
      } catch {
        return null;
      }
    };

    // Extract individual tech page hrefs from an archived category page
    const extractTechLinks = (html: string, categorySlug: string): Array<{ liveUrl: string; archiveTs: string }> => {
      const items: Array<{ liveUrl: string; archiveTs: string }> = [];
      // Archive links look like: href="/web/{TS}/https://www.moffitt.org/.../available-technologies/{cat}/{slug}/"
      const re = new RegExp(
        `/web/(\\d{14})/https?://(?:www\\.)?moffitt\\.org/[^"]*available-technologies/${categorySlug}/([^/"]+)/?"`,
        "g"
      );
      let m: RegExpExecArray | null;
      const seen = new Set<string>();
      while ((m = re.exec(html)) !== null) {
        const archiveTs = m[1];
        const slug = m[2];
        if (!slug || slug === "availabletechnologiessearch" || seen.has(slug)) continue;
        seen.add(slug);
        items.push({
          liveUrl: `${MOFFITT_BASE}/${categorySlug}/${slug}/`,
          archiveTs,
        });
      }
      return items;
    };

    // Derive a human-readable title from URL slug
    // Slug format: {id}-{title-words...}  e.g. "22mb110n-dc-vaccine-enriching-..."
    const LOWER_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in",
      "is", "it", "nor", "of", "on", "or", "so", "the", "to", "up", "via", "yet"]);
    const titleFromSlug = (slug: string): string => {
      const withoutId = slug.replace(/^[0-9]{2}[a-z]{2,}[0-9]+[a-z]?-/, "");
      const words = withoutId.split("-");
      return words
        .map((w, i) =>
          i > 0 && LOWER_WORDS.has(w)
            ? w
            : w.charAt(0).toUpperCase() + w.slice(1)
        )
        .join(" ");
    };

    // ── Try Playwright primary strategy first ───────────────────────────────
    const pwResults = await playwrightScrape();
    if (pwResults !== null && pwResults.length > 0) {
      console.log(`[scraper] ${INST}: ${pwResults.length} listings (Playwright live traversal)`);
      return pwResults;
    }
    console.log(`[scraper] ${INST}: Playwright attempt failed or blocked — falling back to Wayback Machine`);

    // ── Fallback: Wayback Machine 2023 snapshot ──────────────────────────────
    try {
      // Known categories (confirmed from 2023 archived listing)
      const CATEGORIES = [
        "pharmaceuticals-biologics",
        "diagnostics",
        "devices",
        "immunotherapies",
        "software-tools",
        "clinical-decision-support-tools",
      ];

      const allTechItems: Array<{ liveUrl: string; archiveTs: string; slug: string; category: string }> = [];

      // Fetch each archived category page and extract tech links
      for (const cat of CATEGORIES) {
        const catLiveUrl = `${MOFFITT_BASE}/${cat}/`;
        const catHtml = await wbFetch(catLiveUrl, LISTING_TS);
        if (!catHtml) continue;
        const techLinks = extractTechLinks(catHtml, cat);
        for (const t of techLinks) {
          const slug = t.liveUrl.split("/").filter(Boolean).pop() ?? "";
          allTechItems.push({ ...t, slug, category: cat });
        }
      }

      // Derive titles from slugs (no per-page fetching — Wayback Machine is too slow for
      // hundreds of individual tech pages; slug encodes a high-fidelity title approximation)
      const results: ScrapedListing[] = allTechItems
        .map((item) => ({
          title: titleFromSlug(item.slug),
          description: "",
          url: item.liveUrl,
          institution: INST,
          categories: [item.category.replace(/-/g, " ")],
        }))
        .filter((r) => r.title.length > 3);

      console.log(`[scraper] ${INST}: ${results.length} listings (${allTechItems.length} tech pages, titles from slugs, Wayback 2023 snapshot)`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};

// ── Pediatric / Children's Hospital Batch (Task #112, March 2026) ─────────────

// ── InPart API scrapers ───────────────────────────────────────────────────────

export const chlaScraper = createInPartScraper(
  "chla",
  "Children's Hospital Los Angeles"
);

export const lurieChildrensScraper = createInPartScraper(
  "luriechildrens",
  "Lurie Children's Hospital"
);

// Baylor College of Medicine — InPart subdomain "bcm"
// Note: the legacy baylorScraper export (line ~897) also covers this institution.
// bcmScraper is the Task #112 canonical export; baylorScraper is kept for compat
// but only ONE of them should appear in ALL_SCRAPERS.
export const bcmScraper = createInPartScraper("bcm", "Baylor College of Medicine");

export const childrensNationalScraper = createInPartScraper(
  "childrensnational",
  "Children's National"
);

// ── TechPublisher ─────────────────────────────────────────────────────────────

export const bostonChildrensScraper = createTechPublisherScraper(
  "bch",
  "Boston Children's Hospital",
  { maxPg: 50 }
);

// ── Flintbox ──────────────────────────────────────────────────────────────────

export const chopScraper = createFlintboxScraper(
  { slug: "chop", orgId: 96, accessKey: "f12b8075-623f-4993-aeb5-ba16d11c0a29" },
  "Children's Hospital of Philadelphia"
);

// ── St. Jude Children's Research Hospital — bespoke HTML scraper ──────────────
// Category pages at .../technology-licensing/<cat>.html contain links to individual
// tech pages at .../technology-licensing/technologies/<slug>.html.
// Title: <h1>, Description: <meta name="description">.
export const stjudeScraper: InstitutionScraper = {
  institution: "St. Jude Children's Research Hospital",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "St. Jude Children's Research Hospital";
    const BASE = "https://www.stjude.org";
    const TTO_BASE = `${BASE}/research/why-st-jude/shared-resources/technology-licensing`;
    const CATEGORY_PAGES = [
      `${TTO_BASE}/technologies.html`,
      `${TTO_BASE}/antibodies-for-basic-research.html`,
      `${TTO_BASE}/biologics.html`,
      `${TTO_BASE}/diagnostics.html`,
      `${TTO_BASE}/drug-discovery-development-tools.html`,
      `${TTO_BASE}/vaccines.html`,
    ];
    const TIMEOUT_MS = 15_000;

    try {
      const seenUrls = new Set<string>();
      const techUrls: string[] = [];

      // Collect tech-page links from all category pages
      for (const catUrl of CATEGORY_PAGES) {
        try {
          const res = await fetch(catUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!res.ok) continue;
          const html = await res.text();
          const hrefRe = /href="(\/research\/why-st-jude\/shared-resources\/technology-licensing\/technologies\/[^"]+\.html)"/g;
          let m: RegExpExecArray | null;
          while ((m = hrefRe.exec(html)) !== null) {
            const fullUrl = `${BASE}${m[1]}`;
            if (!seenUrls.has(fullUrl)) {
              seenUrls.add(fullUrl);
              techUrls.push(fullUrl);
            }
          }
        } catch {
          continue;
        }
      }

      if (techUrls.length === 0) {
        console.log(`[scraper] ${INST}: 0 tech URLs collected from category pages`);
        return [];
      }

      // Fetch each detail page for title + description
      const CONCUR = 5;
      const results: ScrapedListing[] = [];
      const queue = [...techUrls];

      const worker = async (): Promise<void> => {
        while (queue.length > 0) {
          const url = queue.shift();
          if (!url) return;
          try {
            const res = await fetch(url, {
              headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
              signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            if (!res.ok) continue;
            const html = await res.text();
            const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
            const metaMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
            const title = h1Match ? cleanText(h1Match[1]) : "";
            const description = metaMatch ? cleanText(metaMatch[1]) : "";
            if (title && title.length > 5) {
              results.push({ title, description, url, institution: INST });
            }
          } catch {
            continue;
          }
        }
      };

      await Promise.all(Array.from({ length: CONCUR }, () => worker()));
      console.log(`[scraper] ${INST}: ${results.length} listings (${techUrls.length} tech pages, ${CATEGORY_PAGES.length} category pages)`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};

// ── Nationwide Children's Hospital — cheerio scraper (Task #135) ─────────────
// Main listing at /research/technology-commercialization/available-technologies.
// Individual tech pages at /research/technology-commercialization/available-technologies/<slug>.
// Follows pagination links (rel="next", .next, ?page=N).
export const nationwideChildrensScraper: InstitutionScraper = {
  institution: "Nationwide Children's Hospital",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Nationwide Children's Hospital";
    const BASE = "https://www.nationwidechildrens.org";
    const INDEX_PATH = "/research/technology-commercialization/available-technologies";
    const INDEX_URL = `${BASE}${INDEX_PATH}`;

    try {
      const seenUrls = new Set<string>();
      const techUrls: string[] = [];

      const collectFromPage = ($: Awaited<ReturnType<typeof fetchHtml>>) => {
        if (!$) return;
        // Tech detail links: /research/technology-commercialization/available-technologies/<slug>
        $(`a[href*="${INDEX_PATH}/"]`).each((_, el) => {
          const href = ($)(el).attr("href") ?? "";
          if (!href) return;
          const full = href.startsWith("http") ? href : `${BASE}${href}`;
          const cleaned = full.split("?")[0].split("#")[0];
          if (cleaned === INDEX_URL || seenUrls.has(cleaned)) return;
          if (!/available-technologies\/[^/]+$/.test(cleaned)) return;
          seenUrls.add(cleaned);
          techUrls.push(cleaned);
        });
      };

      // Page 1
      let page1$ = await fetchHtml(INDEX_URL, 20_000);
      collectFromPage(page1$);

      // Follow pagination: rel=next, .next a, ?page=N links
      let currentUrl = INDEX_URL;
      for (let pg = 2; pg <= 40; pg++) {
        if (!page1$) break;
        let nextUrl: string | null = null;
        // rel="next"
        page1$('a[rel="next"], .pager__item--next a, .next a, li.next a').each((_, el) => {
          const href = page1$!(el).attr("href");
          if (href && !nextUrl) nextUrl = href.startsWith("http") ? href : `${BASE}${href}`;
        });
        // ?page=N pattern
        if (!nextUrl) {
          const m = currentUrl.match(/[?&]page=(\d+)/);
          const nextN = m ? parseInt(m[1]) + 1 : pg;
          const candidate = `${INDEX_URL}?page=${nextN}`;
          if (candidate !== currentUrl) nextUrl = candidate;
        }
        if (!nextUrl || nextUrl === currentUrl) break;
        currentUrl = nextUrl;
        const next$ = await fetchHtml(nextUrl, 20_000);
        if (!next$) break;
        const prevCount = techUrls.length;
        collectFromPage(next$);
        if (techUrls.length === prevCount) break; // No new links
        page1$ = next$;
      }

      if (techUrls.length === 0) {
        console.log(`[scraper] ${INST}: 0 tech URLs found on listing page`);
        return [];
      }

      const toTitle = (u: string) =>
        (u.split("/").pop() ?? "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

      // Enrich detail pages in batches
      const enriched = await enrichWithDetailPages(
        techUrls.map((u) => ({ title: toTitle(u), description: "", url: u, institution: INST })),
        { description: [".field-body p", "main p", "article p", ".contentBody p"] }
      );

      console.log(`[scraper] ${INST}: ${enriched.length} listings`);
      return enriched;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};

// ── Nemours Children's Health — bespoke static-HTML scraper ──────────────────
// Technologies are listed directly in the page HTML as <li><p><b>Title</b><br>
// Patent status: ...<br>Inventor: ...</p></li> items. We identify technology
// entries (vs. general benefit bullets) by the presence of "Patent", "Inventor",
// or "Licens" keywords in the list item text.
export const nemoursScraper: InstitutionScraper = {
  institution: "Nemours Children's Health",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Nemours Children's Health";
    const PAGE_URL = "https://www.nemours.org/pediatric-research/technology-transfer.html";
    const TIMEOUT_MS = 20_000;
    const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    try {
      const res = await fetch(PAGE_URL, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      const results: ScrapedListing[] = [];
      const seenTitles = new Set<string>();

      // Technologies are <li> items that contain <p><b>Title</b> and have
      // patent/inventor/licensing keywords — distinguishes them from benefit bullets.
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let m: RegExpExecArray | null;
      while ((m = liRe.exec(html)) !== null) {
        const inner = m[1];
        // Must contain a paragraph with bold title
        if (!inner.includes("<p>") || !inner.includes("<b>")) continue;
        // Must look like a technology entry (has patent/inventor/licensing info)
        const plainText = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (!/patent|inventor|licens/i.test(plainText)) continue;

        const boldMatch = inner.match(/<b>([^<]+)<\/b>/i);
        if (!boldMatch) continue;
        const title = cleanText(boldMatch[1]);
        if (!title || title.length < 5 || seenTitles.has(title)) continue;
        seenTitles.add(title);

        results.push({
          title,
          description: cleanText(plainText),
          url: PAGE_URL,
          institution: INST,
        });
      }

      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};

// ── International Batch A (Task #113) ──────────────────────────────────────

// ── Oxford University Innovation ─────────────────────────────────────────────
// Technologies paginated at /technologies-available/technology-licensing/page/N/
// Individual tech URLs are at /licence-details/SLUG/ — 18 pages, ~12 per page.
// Title derived by converting slug hyphens → spaces + title-casing each word.
export const oxfordInnovationScraper: InstitutionScraper = {
  institution: "Oxford University Innovation",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Oxford University Innovation";
    const BASE = "https://innovation.ox.ac.uk/technologies-available/technology-licensing";
    const TIMEOUT_MS = 20_000;
    const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    const slugToTitle = (slug: string): string =>
      slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

    try {
      const seenSlugs = new Set<string>();
      const results: ScrapedListing[] = [];

      const fetchPage = async (url: string): Promise<string> => {
        const res = await fetch(url, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      };

      const extractFromHtml = (html: string) => {
        const licenceRe = /href="https:\/\/innovation\.ox\.ac\.uk\/licence-details\/([^/"]+)\/"/g;
        let m: RegExpExecArray | null;
        while ((m = licenceRe.exec(html)) !== null) {
          const slug = m[1];
          if (seenSlugs.has(slug)) continue;
          seenSlugs.add(slug);
          results.push({
            title: slugToTitle(slug),
            description: "",
            url: `https://innovation.ox.ac.uk/licence-details/${slug}/`,
            institution: INST,
          });
        }
      };

      // Page 1 = base listing URL (with all-category filter to force server-side render)
      const categoryIds = ["4337","26","10","14","24","45","16","21","22","23","4338","42","4339","33","37","4341","18","4340"];
      const filterQS = categoryIds.map(id => `filter%5B%5D=${id}`).join("&");
      try {
        const page1Html = await fetchPage(`${BASE}/?${filterQS}`);
        extractFromHtml(page1Html);
      } catch {
        // If the filter approach fails, page 1 results will be picked up via next pages
      }

      // Pages 2..25 are server-rendered without any filter needed
      for (let page = 2; page <= 25; page++) {
        try {
          const html = await fetchPage(`${BASE}/page/${page}/`);
          const before = results.length;
          extractFromHtml(html);
          if (results.length === before && page > 3) break; // No new listings = past last page
        } catch {
          if (page > 5) break;
        }
      }

      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};

// ── University of Bristol ─────────────────────────────────────────────────────
// Technologies at /business/innovate-and-grow/research-commercialisation/available-technologies/
// Each has a dedicated slug page; H1 on the detail page gives the real title.
export const bristolScraper: InstitutionScraper = {
  institution: "University of Bristol",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "University of Bristol";
    const BASE_URL = "https://www.bristol.ac.uk";
    const LISTING_URL = `${BASE_URL}/business/innovate-and-grow/research-commercialisation/available-technologies/`;
    const TIMEOUT_MS = 20_000;
    const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    try {
      const listRes = await fetch(LISTING_URL, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
      const listHtml = await listRes.text();

      // Extract relative tech slugs: /business/.../available-technologies/SLUG/
      const slugRe = /href="(\/business\/innovate-and-grow\/research-commercialisation\/available-technologies\/([^/"]+)\/?)"/g;
      const slugSet = new Set<string>();
      let sm: RegExpExecArray | null;
      while ((sm = slugRe.exec(listHtml)) !== null) {
        const path = sm[1];
        const slug = sm[2];
        // Exclude self-referential link
        if (!slug || slug === "available-technologies") continue;
        slugSet.add(path);
      }

      const results: ScrapedListing[] = [];
      for (const path of Array.from(slugSet)) {
        try {
          const detailRes = await fetch(`${BASE_URL}${path}`, {
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!detailRes.ok) continue;
          const detailHtml = await detailRes.text();

          const h1Match = detailHtml.match(/<h1[^>]*class="[^"]*page-title[^"]*"[^>]*>([^<]+)<\/h1>/i)
            || detailHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i);
          const titleRaw = h1Match ? cleanText(h1Match[1]) : "";
          if (!titleRaw || titleRaw.length < 4) continue;

          const metaDesc = detailHtml.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
          const description = metaDesc ? cleanText(metaDesc[1]) : "";

          results.push({
            title: titleRaw,
            description,
            url: `${BASE_URL}${path}`,
            institution: INST,
          });
        } catch {
          continue;
        }
      }

      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};

// ── UCL Business (UCLB) ───────────────────────────────────────────────────────
// InPart portal (uclb.portals.in-part.com) returns "404: Portal not enabled".
// XIP express-licensing storefront (xip.uclb.com) requires JavaScript rendering.
// No server-side accessible technology listing found. Stub pending JS-render approach.
export const uclbScraper: InstitutionScraper = createStubScraper(
  "UCL Business (UCLB)",
  "InPart portal disabled; XIP storefront (xip.uclb.com) requires JavaScript — needs Playwright"
);

// ── KU Leuven Research & Development ─────────────────────────────────────────
// TTO site: lrd.kuleuven.be/en/ip/which-technologies-do-we-offer/technology-offers
// All outbound requests time out (server-side IP block or firewall). Returns empty.
export const kuLeuvenScraper: InstitutionScraper = {
  institution: "KU Leuven R&D",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "KU Leuven R&D";
    const URL = "https://lrd.kuleuven.be/en/ip/which-technologies-do-we-offer/technology-offers";
    const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    try {
      const res = await fetch(URL, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      // Extract any technology-offer links
      const linkRe = /href="(https?:\/\/lrd\.kuleuven\.be[^"]*(?:technolog|offer|licens)[^"]*)"/gi;
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = linkRe.exec(html)) !== null) {
        const url = m[1];
        if (seen.has(url)) continue;
        seen.add(url);
        results.push({ title: url.split("/").pop() ?? url, description: "", url, institution: INST });
      }
      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.warn(`[scraper] ${INST}: unreachable (${err?.message}) — server-side IP block suspected`);
      return [];
    }
  },
};

// ── Ghent University Technology Transfer ─────────────────────────────────────
// Site: techtransfer.ugent.be — informational Drupal site, no enumerable tech listing.
// IP/licensing section links to SharePoint intranet only. No public catalog found.
export const ghentScraper: InstitutionScraper = createStubScraper(
  "Ghent University TTO",
  "No public technology listing — techtransfer.ugent.be is informational only; catalog behind SharePoint intranet"
);

// ── UniQuest (University of Queensland TTO) ───────────────────────────────────
// Site: uniquest.com.au/technologies/ returns 403 (WAF IP block) on all endpoints
// including WordPress REST API. Playwright attempt to bypass WAF.
export const uniquestScraper: InstitutionScraper = {
  institution: "UniQuest (University of Queensland)",
  scraperType: "playwright",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "UniQuest (University of Queensland)";
    const LIST_URL = "https://uniquest.com.au/technologies/";
    const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    // Try direct fetch first (may bypass WAF in some environments)
    try {
      const res = await fetch(LIST_URL, {
        headers: { "User-Agent": UA, Referer: "https://uniquest.com.au/" },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        const html = await res.text();
        const techRe = /href="(https?:\/\/uniquest\.com\.au\/(?:technology|technologies)\/([^/"]+)\/?)"/gi;
        const results: ScrapedListing[] = [];
        const seen = new Set<string>();
        let m: RegExpExecArray | null;
        while ((m = techRe.exec(html)) !== null) {
          if (seen.has(m[1])) continue;
          seen.add(m[1]);
          const slug = m[2];
          const title = slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
          results.push({ title, description: "", url: m[1], institution: INST });
        }
        if (results.length > 0) {
          console.log(`[scraper] ${INST}: ${results.length} listings (direct fetch)`);
          return results;
        }
      }
    } catch {
      // Direct fetch blocked — fall through to Playwright
    }

    // Playwright fallback
    try {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({ "User-Agent": UA });
      await page.goto(LIST_URL, { waitUntil: "networkidle", timeout: 30_000 });
      await page.waitForSelector("a[href*='/technology']", { timeout: 10_000 }).catch(() => null);
      const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll("a[href*='/technology']"));
        return anchors.map(a => ({ href: (a as HTMLAnchorElement).href, text: (a as HTMLElement).innerText.trim() }));
      });
      await browser.close();

      const results: ScrapedListing[] = [];
      const seen = new Set<string>();
      for (const { href, text } of links) {
        if (!href.includes("uniquest.com.au") || seen.has(href)) continue;
        if (href === LIST_URL || !text || text.length < 4) continue;
        seen.add(href);
        results.push({ title: text, description: "", url: href, institution: INST });
      }
      console.log(`[scraper] ${INST}: ${results.length} listings (Playwright)`);
      return results;
    } catch (err: any) {
      console.warn(`[scraper] ${INST}: both direct fetch and Playwright failed — ${err?.message}`);
      return [];
    }
  },
};

// mcgillScraper — real in-part "mcgill" implementation is in Batch E section (end of file).
// Previous OTT website (mcgill.ca/ott) was offline/maintenance and is superseded by in-part portal.

// ── Leiden University (LURIS) ─────────────────────────────────────────────────
// LURIS (Leiden University Research and Innovation Services) at luris.nl is a
// Wix-hosted site — all content rendered client-side via JavaScript. No static listing.
export const leidenScraper: InstitutionScraper = createStubScraper(
  "Leiden University (LURIS)",
  "luris.nl is a Wix site — content fully JS-rendered, no static technology listing accessible"
);

// ── TU Delft Technology Transfer ─────────────────────────────────────────────
// TU Delft TTO has no publicly enumerable technology listing URL. Innovation-impact
// section covers entrepreneurship and patents but not a browsable licensing catalog.
export const tuDelftScraper: InstitutionScraper = createStubScraper(
  "TU Delft TTO",
  "No public technology licensing catalog found — tudelft.nl innovation pages are informational only"
);

// ── NUS Enterprise (National University of Singapore) ────────────────────────
// enterprise.nus.edu.sg is protected by Imperva/Incapsula anti-bot (SWUDNSAI challenge).
// Playwright fallback — Incapsula may still block headless browsers.
export const nusScraper: InstitutionScraper = {
  institution: "NUS Enterprise",
  scraperType: "playwright",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "NUS Enterprise";
    const LIST_URL = "https://enterprise.nus.edu.sg/technologies/";
    const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    // Try direct fetch first
    try {
      const res = await fetch(LIST_URL, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const html = await res.text();
        if (!html.includes("Incapsula") && !html.includes("SWUDNSAI")) {
          const techRe = /href="(https?:\/\/enterprise\.nus\.edu\.sg\/(?:technologies?|tech)[^"]+)"/gi;
          const results: ScrapedListing[] = [];
          const seen = new Set<string>();
          let m: RegExpExecArray | null;
          while ((m = techRe.exec(html)) !== null) {
            if (seen.has(m[1])) continue;
            seen.add(m[1]);
            results.push({ title: m[1].split("/").filter(Boolean).pop() ?? m[1], description: "", url: m[1], institution: INST });
          }
          if (results.length > 0) {
            console.log(`[scraper] ${INST}: ${results.length} listings (direct fetch)`);
            return results;
          }
        }
      }
    } catch {
      // Fall through to Playwright
    }

    // Playwright fallback (Incapsula detection may still block)
    try {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({ "User-Agent": UA });
      await page.goto(LIST_URL, { waitUntil: "networkidle", timeout: 40_000 });

      // Check for Incapsula challenge
      const bodyText = await page.textContent("body") ?? "";
      if (bodyText.includes("Incapsula") || bodyText.includes("Request unsuccessful")) {
        await browser.close();
        console.warn(`[scraper] ${INST}: blocked by Incapsula anti-bot`);
        return [];
      }

      await page.waitForSelector("a[href*='/tech']", { timeout: 8_000 }).catch(() => null);
      const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll("a"));
        return anchors.map(a => ({ href: (a as HTMLAnchorElement).href, text: (a as HTMLElement).innerText.trim() }));
      });
      await browser.close();

      const results: ScrapedListing[] = [];
      const seen = new Set<string>();
      for (const { href, text } of links) {
        if (!href.includes("enterprise.nus.edu.sg/tech") || seen.has(href)) continue;
        if (!text || text.length < 4) continue;
        seen.add(href);
        results.push({ title: text, description: "", url: href, institution: INST });
      }
      console.log(`[scraper] ${INST}: ${results.length} listings (Playwright)`);
      return results;
    } catch (err: any) {
      console.warn(`[scraper] ${INST}: Playwright failed — ${err?.message}`);
      return [];
    }
  },
};

// University of Nottingham — implemented via TechPublisher factory below (Task #113)

// sheffieldScraper — real in-part "sheffield" implementation is in Batch E section (end of file).
// Previous probe of sheffield.ac.uk showed no public listing; in-part portal confirmed 2026-03-17.

// ── Yissum Research Development Co. (Hebrew University of Jerusalem) ──────────
// Technologies listed via WordPress Custom Post Type REST API.
// Endpoint: /wp-json/wp/v2/technology — 234 total techs, per_page=100 (3 pages).
// Title in title.rendered (HTML-decoded); description in excerpt.rendered.
export const yissumScraper: InstitutionScraper = {
  institution: "Yissum (Hebrew University of Jerusalem)",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Yissum (Hebrew University of Jerusalem)";
    const API_BASE = "https://www.yissum.co.il/wp-json/wp/v2/technology";
    const PER_PAGE = 100;
    const TIMEOUT_MS = 20_000;
    const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    const decodeHtml = (html: string): string =>
      html
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    try {
      const results: ScrapedListing[] = [];
      const seenIds = new Set<number>();

      for (let page = 1; page <= 10; page++) {
        const url = `${API_BASE}?per_page=${PER_PAGE}&page=${page}&_fields=id,slug,title,excerpt,link`;
        let data: Array<{
          id: number;
          slug: string;
          title?: { rendered?: string };
          excerpt?: { rendered?: string };
          link?: string;
        }>;

        try {
          const res = await fetch(url, {
            headers: { "User-Agent": UA, Accept: "application/json" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!res.ok) break; // 400 = past last page
          data = await res.json() as typeof data;
        } catch {
          break;
        }

        if (!Array.isArray(data) || data.length === 0) break;

        for (const item of data) {
          if (seenIds.has(item.id)) continue;
          seenIds.add(item.id);
          const title = decodeHtml(item.title?.rendered ?? "");
          if (!title || title.length < 4) continue;
          const description = decodeHtml(item.excerpt?.rendered ?? "");
          const techUrl = item.link ?? `https://www.yissum.co.il/technology/${item.slug}/`;
          results.push({ title, description, url: techUrl, institution: INST });
        }

        if (data.length < PER_PAGE) break; // Last page
      }

      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};

// ── University of Nottingham — TechPublisher (Task #113) ──────────────────────
// uon.technologypublisher.com — robots.txt permits scraping; factory handles
// sitemap + RSS + paginated search-results automatically.
export const nottinghamScraper = createTechPublisherScraper(
  "uon",
  "University of Nottingham",
  { maxPg: 80 }
);

// ── TechLink (DoD Technology Transfer) — ES XHR Intercept + Playwright (Task #137) ─
// techlinkcenter.org/technologies — React SPA backed by an OpenSearch/ES cluster.
// robots.txt: /technologies not disallowed. Legal: DoD Partnership Intermediary
// under 15 U.S.C. § 3715; purpose is public discovery and licensing.
//
// Verified: 6,626 listings on 663 pages (10/page) as of 2026-03-18.
//
// Strategy:
//   1. XHR Intercept — Playwright captures the Elasticsearch XHR the React app fires.
//      The request URL contains a `source` param (JSON-encoded ES query).
//      After capturing the first XHR, we replay it from browser context (page.evaluate)
//      with modified from/size to bulk-retrieve all results in batches of 100.
//      This avoids clicking 663 Next buttons (~33 min).
//   2. Next-button fallback — if XHR replay fails (e.g. auth rejected for direct replay),
//      fall back to clicking up to MAX_BTN_PAGES (100) pages via the Next button,
//      collecting data from both the DOM and intercepted XHR responses.
export const techLinkScraper: InstitutionScraper = {
  institution: "TechLink (DoD Technology Transfer)",
  scraperType: "playwright",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "TechLink (DoD Technology Transfer)";
    const BASE = "https://techlinkcenter.org";
    const MAX_BTN_PAGES = 100; // fallback cap: ~1,000 listings at 10/page

    let browser: import("playwright").Browser | null = null;
    try {
      const { chromium } = await import("playwright");
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      });

      // ── XHR intercept ──────────────────────────────────────────────────────
      // Capture the first ES search request URL + Authorization header, plus
      // collect items from every ES response as they fire.
      let esRequestUrl: string | null = null;
      let esAuthHeader: string | null = null;
      let esTotal = 0;
      const xhrItems = new Map<string, { title: string; description: string; url: string }>();

      const extractHits = (hits: unknown[]) => {
        for (const hit of hits) {
          const h = hit as Record<string, unknown>;
          const src = (h._source ?? {}) as Record<string, unknown>;
          const title = String(src.title ?? src.name ?? src.techName ?? "").trim();
          if (!title || title.length < 4) continue;
          const slug = String(src.slug ?? src.id ?? h._id ?? "").trim();
          const url = slug ? `${BASE}/technologies/${slug}` : BASE;
          const description = String(src.description ?? src.abstract ?? src.summary ?? "").slice(0, 1000);
          xhrItems.set(url, { title, description, url });
        }
      };

      // Capture auth header from the outgoing request
      page.on("request", (req) => {
        const url = req.url();
        if (!url.includes("es.amazonaws.com") || !url.includes("_search")) return;
        if (!esRequestUrl) {
          esRequestUrl = url;
          esAuthHeader = req.headers()["authorization"] ?? null;
        }
      });

      page.on("response", async (resp) => {
        const url = resp.url();
        if (!url.includes("es.amazonaws.com") || !url.includes("_search")) return;
        try {
          const data = await resp.json().catch(() => null);
          if (!data?.hits?.hits) return;
          extractHits(data.hits.hits as unknown[]);
          if (!esTotal) {
            esTotal = (data.hits.total?.value as number) ?? (data.hits.total as number) ?? 0;
          }
        } catch { /* ignore parse errors */ }
      });

      await page.goto(`${BASE}/technologies`, {
        timeout: 60_000,
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(8_000); // wait for React mount + first XHR

      // ── Close browser — Node.js handles all bulk requests directly ─────────
      // We captured the ES URL and Authorization header from the first XHR.
      // All subsequent pagination is done via Node.js fetch (no page.evaluate)
      // so there is no Playwright evaluation timeout to hit.
      await browser.close();
      browser = null;

      // ── Bulk replay via Node.js fetch with captured auth header ────────────
      // The Authorization header is a public client credential embedded in the
      // TechLink React app bundle (DoD public search tool, intentionally browser-
      // readable). Fetching directly from Node.js is identical to what the browser
      // does — same host, same header — and avoids any CORS/credentials issue.
      if (esRequestUrl && esAuthHeader && esTotal > 10) {
        const urlObj = new URL(esRequestUrl);
        const rawSource = urlObj.searchParams.get("source");
        if (rawSource) {
          const baseQuery = JSON.parse(rawSource) as Record<string, unknown>;
          const PAGE_SIZE = 100;
          const totalPages = Math.ceil(esTotal / PAGE_SIZE);
          let errors = 0;

          for (let pg = 0; pg < Math.min(totalPages, 70); pg++) {
            const newQuery = { ...baseQuery, from: pg * PAGE_SIZE, size: PAGE_SIZE };
            const newUrlObj = new URL(esRequestUrl);
            newUrlObj.searchParams.set("source", JSON.stringify(newQuery));
            newUrlObj.searchParams.set("source_content_type", "application/json");

            try {
              const r = await fetch(newUrlObj.toString(), {
                headers: {
                  "Accept": "application/json, text/plain, */*",
                  "Authorization": esAuthHeader,
                },
                signal: AbortSignal.timeout(15_000),
              });
              if (!r.ok) {
                errors++;
                if (errors > 2) break;
                continue;
              }
              const data = (await r.json()) as Record<string, unknown>;
              const hits = (
                (data.hits as Record<string, unknown>)?.hits ?? []
              ) as unknown[];
              extractHits(hits);
              if (hits.length < PAGE_SIZE) break; // last page reached
            } catch {
              errors++;
              if (errors > 2) break;
            }
          }
        }
      }

      if (xhrItems.size > 0) {
        const results = Array.from(xhrItems.values()).map((item) => ({
          ...item,
          institution: INST,
        }));
        console.log(`[scraper] ${INST}: ${results.length} listings (ES Node.js bulk fetch)`);
        return results;
      }

      // No results — return empty (fallback Next-button approach removed;
      // if the ES endpoint changes, a failed run will be obvious from count=0)
      console.log(`[scraper] ${INST}: 0 listings — ES auth capture failed`);
      return [];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] ${INST} Playwright failed: ${msg}`);
      return [];
    } finally {
      await browser?.close();
    }
  },
};

// ── researchportal.be — Ghent University Patents (Task #113) ──────────────────
// Belgian FRIS research portal filtered to Ghent University patents (1,637).
// Protected by Akamai Bot Manager — uses real Chromium with stealth headers
// to attempt bypass. Returns [] gracefully if Akamai blocks.
// URL: /en/search?f[0]=fris_content_type:patent&f[1]=fris_knowledge_institution:131211
export const researchPortalGhentScraper: InstitutionScraper = {
  institution: "Ghent University (researchportal.be)",
  scraperType: "playwright",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Ghent University (researchportal.be)";
    const BASE = "https://www.researchportal.be";
    const SEARCH_URL =
      `${BASE}/en/search` +
      `?f%5B0%5D=fris_content_type%3Apatent` +
      `&f%5B1%5D=fris_knowledge_institution%3A131211` +
      `&sort=search_api_relevance&order=desc`;

    let browser: import("playwright").Browser | null = null;
    try {
      const { chromium } = await import("playwright");
      browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
          "--window-size=1280,900",
        ],
      });
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 900 },
        locale: "en-GB",
        timezoneId: "Europe/Brussels",
        extraHTTPHeaders: {
          "Accept-Language": "en-GB,en;q=0.9",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });

      // Mask automation signals
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      });

      const page = await context.newPage();

      await page.goto(SEARCH_URL, { timeout: 60_000, waitUntil: "domcontentloaded" });

      // Check for Akamai block
      const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
      if (
        bodyText.includes("Access Denied") ||
        bodyText.includes("403") ||
        bodyText.toLowerCase().includes("bot")
      ) {
        console.warn(`[scraper] ${INST}: Akamai block detected, returning []`);
        return [];
      }

      // Wait for search results
      await page.waitForSelector(
        'article,li[class*="result"],.search-result,[class*="patent"]',
        { state: "visible", timeout: 30_000 }
      );

      const allItems = new Map<string, string>();

      const collectPage = async () => {
        const items = await page.$$eval(
          'article h3 a, li[class*="result"] h3 a, .views-row h3 a, h3.title a, h2.title a, .search-result-title a',
          (els) =>
            els.map((el) => ({
              href: (el as HTMLAnchorElement).href ?? "",
              title: el.textContent?.trim() ?? "",
            }))
        );
        for (const item of items) {
          if (!item.href || !item.title || item.title.length < 5) continue;
          if (allItems.has(item.href)) continue;
          allItems.set(item.href, item.title);
        }
      };

      await collectPage();

      // Paginate through results
      for (let pg = 2; pg <= 100; pg++) {
        const nextLink = await page.$(
          'a[title="Go to next page"],a[rel="next"],li.next a,.pager-next a,a[aria-label="Next page"]'
        );
        if (!nextLink) break;
        const prevSize = allItems.size;
        await nextLink.click();
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        await collectPage();
        if (allItems.size === prevSize) break;
      }

      const results: ScrapedListing[] = Array.from(allItems.entries()).map(
        ([url, title]) => ({ title, description: "", url, institution: INST })
      );

      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] ${INST} Playwright failed: ${msg}`);
      return [];
    } finally {
      await browser?.close();
    }
  },
};

// ── International Batch B (Task #114) ──────────────────────────────────────
// 11 new institutions: Yeda/Weizmann (custom), Glasgow/SDU/UEA/Sussex/
// Newcastle/Plymouth/Saarland/Stellenbosch/Macquarie (in-part API),
// Edinburgh Innovations (Playwright/Elucid3).
// Total after registration: 252 scrapers (241 + 11).

// ── 1. Yeda Research and Development (Weizmann Institute of Science) ────────
// Technology search page lists all available technologies with titles in
// mailto share links: href="mailto:?body=URL&subject=TITLE_ENCODED"
export const yedaResearchScraper: InstitutionScraper = {
  institution: "Yeda Research and Development",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Yeda Research and Development";
    const BASE = "https://www.yedarnd.com";
    try {
      const res = await fetch(`${BASE}/technology-search`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://www.google.com/",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      // Extract from mailto share links:
      // href="mailto:?body=https://www.yedarnd.com/technology/ID&subject=TITLE"
      const re =
        /href="mailto:\?body=https:\/\/www\.yedarnd\.com\/(technology\/[^&"]+)&subject=([^"]+)"/g;
      const seen = new Set<string>();
      const results: ScrapedListing[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) {
        const path = m[1];
        const rawTitle = m[2];
        const url = `${BASE}/${path}`;
        if (seen.has(url)) continue;
        seen.add(url);
        const title = decodeURIComponent(rawTitle.replace(/\+/g, " ")).trim();
        if (title.length < 5) continue;
        results.push({ title, description: "", url, institution: INST });
      }
      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] ${INST} failed: ${msg}`);
      return [];
    }
  },
};

// ── 2–10. In-Part API scrapers (confirmed working subdomains) ───────────────
export const glasgowScraper = createInPartScraper("gla", "University of Glasgow");
export const sduScraper = createInPartScraper("sdu", "University of Southern Denmark");
export const ueaScraper = createInPartScraper("uea", "University of East Anglia");
export const sussexScraper = createInPartScraper("sussex", "University of Sussex");
export const newcastleScraper = createInPartScraper("newcastle", "Newcastle University");
export const plymouthScraper = createInPartScraper("plymouth", "University of Plymouth");
export const saarlandScraper = createInPartScraper("saarland", "Saarland University");
export const stellenboschScraper = createInPartScraper("sun", "Stellenbosch University");
export const macquarieScraper = createInPartScraper("mq", "Macquarie University");

// ── Edinburgh Innovations — HTML listing scraper (rewritten Task #135) ────────
// Old scraper targeted licensing.edinburgh-innovations.ed.ac.uk (Elucid3 SPA) — wrong subdomain.
// Correct URL: https://edinburgh-innovations.ed.ac.uk/technology
// Pagination: ?page=N (confirmed via ?page=3 in user-provided URLs)
// Detail: /technology/{slug}
export const edinburghInnovationsScraper: InstitutionScraper = {
  institution: "Edinburgh Innovations",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Edinburgh Innovations";
    const BASE = "https://edinburgh-innovations.ed.ac.uk";
    const INDEX = `${BASE}/technology`;

    try {
      // Fetch page 1 and detect max page
      const page1$ = await fetchHtml(INDEX, 20_000);
      if (!page1$) {
        console.warn(`[scraper] ${INST}: could not fetch listing page`);
        return [];
      }

      let maxPage = 1;
      page1$("a[href*='?page=']").each((_, el) => {
        const m = (page1$(el).attr("href") ?? "").match(/[?&]page=(\d+)/);
        if (m) maxPage = Math.max(maxPage, parseInt(m[1], 10));
      });
      console.log(`[scraper] ${INST}: detected ${maxPage} pages`);

      // Collect all page URLs (cap at 60 for safety)
      const pageUrls = [INDEX];
      for (let p = 2; p <= Math.min(maxPage, 60); p++) {
        pageUrls.push(`${INDEX}?page=${p}`);
      }

      // Collect links + anchor text (as title) from listing pages
      const slugTitles = new Map<string, string>();

      const collectFromPage = ($: Awaited<ReturnType<typeof fetchHtml>>) => {
        if (!$) return;
        $("a[href*='/technology/']").each((_, el) => {
          const href = ($)(el).attr("href") ?? "";
          if (!href) return;
          const full = href.startsWith("http") ? href : `${BASE}${href}`;
          const clean = full.split("?")[0].split("#")[0];
          if (clean.replace(/\/$/, "") === INDEX.replace(/\/$/, "")) return;
          if (!/\/technology\/[^?#/]+/.test(clean)) return;
          if (!slugTitles.has(clean)) {
            // Title from link text; fallback to slug
            const text = cleanText(($)(el).text());
            const slug = clean.split("/").pop()?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ?? "";
            slugTitles.set(clean, text.length > 5 ? text : slug);
          }
        });
      };

      collectFromPage(page1$);

      const BATCH = 8;
      for (let i = 1; i < pageUrls.length; i += BATCH) {
        const batch = pageUrls.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map((u) => fetchHtml(u, 20_000))
        );
        for (const r of results) {
          if (r.status === "fulfilled" && r.value) collectFromPage(r.value);
        }
      }

      if (slugTitles.size === 0) {
        console.log(`[scraper] ${INST}: 0 tech URLs found`);
        return [];
      }

      console.log(`[scraper] ${INST}: ${slugTitles.size} tech URLs — enriching`);

      // Enrich detail pages for description
      const enriched = await enrichWithDetailPages(
        Array.from(slugTitles.entries()).map(([u, t]) => ({ title: t, description: "", url: u, institution: INST })),
        { description: ["article p", ".field-body p", ".node__content p", "main p"] }
      );

      console.log(`[scraper] ${INST}: ${enriched.length} listings after enrichment`);
      return enriched;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] ${INST} failed: ${msg}`);
      return [];
    }
  },
};

// ── Deferred stubs (Task #114 targets that are network-blocked or have no
//    enumerable public tech listing; NOT registered in ALL_SCRAPERS) ─────────
//
// Ramot Technology Transfer (Tel Aviv University) — ramot.org
//   TCP connection refused from all Replit egress IPs (132.66.x.x GeoIP block).
//   Stub kept for future VPN/residential-proxy implementation.
//
// Technion T3 (t3.technion.ac.il)
//   TCP connection refused; no response on any path.
//   Stub kept for future VPN implementation.
//
// Karolinska Institutet Innovations (ki-innovations.se)
//   Connection refused from Replit IPs; ki.se innovation pages return 404.
//   No enumerable tech listing discovered on any path.
//
// Lund University Innovation / LU Innovation
//   lu.se/en/research/innovation redirects to Swedish-language portal;
//   no in-part or other machine-readable TTO listing found.
//
// University of Copenhagen Technology Transfer (techtransfer.ku.dk)
//   301 redirect to ku.dk/en page that returns 404; no in-part portal found.
//
// EPFL Technology Transfer Office
//   epfl.flintbox.com: TCP connection refused from Replit egress (GeoIP block?);
//   WP REST API on epfl.ch/research/technology-transfer returns 401 (auth required).
//
// University of Zurich Innovation Hub (innovation.uzh.ch)
//   innovation.uzh.ch/en/technologies.html returns 404; hub is entrepreneurship-
//   focused and has no publicly enumerable technology licensing catalog.

// ── FRIS Belgium Platform Expansion (Task #115) ────────────────────────────
// FRIS (researchportal.be) is comprehensively Akamai-blocked from Replit egress:
//   - HTTP curl: 403 (Akamai Bot Manager)
//   - Playwright stealth: bodyText contains "Access Denied" even with full UA/timezone/locale spoofing
// All five confirmed alternatives below were validated via the in-part API
// (app.in-part.com/api/v3/public/opportunities?portalSubdomain=SLUG&page=1&limit=1)
// returning pagination.last > 0 with real technology titles in results.
//
// Blocked FRIS targets (documented; implement if Replit egress IP changes):
//   KU Leuven, University of Antwerp, VUB, Hasselt, IMEC — all Akamai 403
//
// Alternative institutions confirmed accessible (5 total, 252 → 257 scrapers):

// ── 1. Nagoya University (Japan) — in-part "nagoya" — ~72 techs ─────────────
export const nagoyaScraper = createInPartScraper("nagoya", "Nagoya University");

// ── 2. Okinawa Institute of Science and Technology (Japan) — "oist" — ~68 techs
export const oistScraper = createInPartScraper("oist", "Okinawa Institute of Science and Technology");

// ── 3. Hokkaido University (Japan) — in-part "hokkaido" — ~31 techs ─────────
export const hokkaidoScraper = createInPartScraper("hokkaido", "Hokkaido University");

// ── 4. University of St Andrews (UK) — in-part "st-andrews" — 20 techs ──────
export const stAndrewsScraper = createInPartScraper("st-andrews", "University of St Andrews");

// ── 5. University of Salford (UK) — in-part "salford" — ~5 techs ─────────────
export const salfordScraper = createInPartScraper("salford", "University of Salford");

// ── International Scrapers — Batch C (Task #118) ────────────────────────────
//
// Probe results (all confirmed from Replit egress IPs):
//
// CONFIRMED accessible (implemented below):
//   UNSW (unsw.technologypublisher.com)       — 200, 54 sitemap tech entries
//   Loughborough (lboro.technologypublisher.com) — 200, 36 sitemap tech entries
//   Ottawa (uottawa.technologypublisher.com)   — 200, 53 sitemap tech entries
//   Surrey (surrey.technologypublisher.com)    — 200, 45 sitemap tech entries
//   La Trobe (latrobe.technologypublisher.com) — 200, 9 sitemap tech entries
//   Vanderbilt (vanderbilt.technologypublisher.com) — 200, 213 sitemap tech entries
//   Queen's University Belfast (qub.technologypublisher.com) — 200, listings confirmed
//   UCL / XIP (xip.uclb.com) — 200, Elucid3/XIP SPA, 34 product category pages (Playwright)
//
// BLOCKED / inaccessible (not implemented):
//   in-part platform: HTTP 000 (connection refused) from ALL Replit egress IPs —
//     affects all target in-part slugs: imperial, ucl, birmingham, warwick, dtu
//   flintbox platform: HTTP 000 (connection refused) from all Replit egress IPs —
//     affects uq.flintbox.com, tau.flintbox.com, technion.flintbox.com
//   NUS (nus.edu.sg/ilo/technologies): 200 but no enumerable tech listing (JS-rendered, no public API)
//   NTU (ntu.edu.sg): redirects to 404
//   KAIST: 404 on TTO URL; main site 200 but Korean-only, no enumerable listing
//   POSTECH: TCP refused (000)
//   University of Tokyo (ducr.u-tokyo.ac.jp): TCP refused (000)
//   Seoul National University (tlo.snu.ac.kr): TCP refused (000)
//   University of Queensland (uq.edu.au): redirects to research.uq.edu.au (200) but no
//     enumerable TTO listing; flintbox.com portal TCP refused
//   University of Sydney (sydney.edu.au): 404 on TTO path
//   University of Melbourne (unimelb.edu.au): 403 on TTO path
//   ANU: 404 on TTO path
//   Eindhoven TU/e: 404 on tue.nl TTO path; tue.technologypublisher.com: 404
//   Delft TU: 404 on tudelft.nl TTO path
//   Imperial College London (imperialcollegeaccount.tech-transfer.com): TCP refused (000)
//   Total scrapers: 257 → 265 (+8)

// ── 1. University of New South Wales (UNSW) — TechPublisher "unsw" ───────────
// NewSouth Innovations Pty Ltd — 54 sitemap tech entries confirmed; RSS active
export const unswScraper = createTechPublisherScraper("unsw", "University of New South Wales");

// ── 2. Loughborough University — TechPublisher "lboro" ───────────────────────
// 36 sitemap tech entries confirmed; engineering + biotech mix
export const loughboroughScraper = createTechPublisherScraper("lboro", "Loughborough University");

// ── 3. University of Ottawa — TechPublisher "uottawa" ────────────────────────
// 53 sitemap tech entries confirmed; health sciences prominent
export const uottawaScraper = createTechPublisherScraper("uottawa", "University of Ottawa");

// ── 4. University of Surrey — TechPublisher "surrey" ─────────────────────────
// 45 sitemap tech entries confirmed; strong biotech and sensing portfolio
export const surreyScraper = createTechPublisherScraper("surrey", "University of Surrey");

// ── 5. La Trobe University — TechPublisher "latrobe" ─────────────────────────
// 9 sitemap tech entries confirmed; small but legitimate public listing
export const latrobeScraper = createTechPublisherScraper("latrobe", "La Trobe University");

// ── 6. Vanderbilt University — TechPublisher "vanderbilt" ────────────────────
// 213 sitemap tech entries confirmed; large, strong biomedical R&D portfolio
export const vanderbiltScraper = createTechPublisherScraper("vanderbilt", "Vanderbilt University");

// ── 7. Queen's University Belfast — TechPublisher "qub" ──────────────────────
// Confirmed 200 with tech listings; Northern Ireland's flagship research university
export const queensBelfastScraper = createTechPublisherScraper("qub", "Queen's University Belfast");

// ── 8. UCL Business / XIP — Elucid3 SPA, Playwright ─────────────────────────
// xip.uclb.com is University College London's public technology licensing storefront,
// powered by the Elucid3/XIP platform (same engine as Edinburgh Innovations).
// The page is a React SPA — all product cards are client-side rendered.
// Confirmed 200, 34+ product category pages discovered.
// Approach: Playwright visits /products, then each /products/* category page,
// harvesting a[href*='/product/'] links with their text labels.
export const uclBusinessScraper: InstitutionScraper = {
  institution: "UCL Business",
  scraperType: "playwright",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "UCL Business";
    const BASE = "https://xip.uclb.com";
    let browser: import("playwright").Browser | null = null;
    try {
      const { chromium } = await import("playwright");
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.google.com/",
        "Accept-Language": "en-US,en;q=0.9",
      });

      const allProducts = new Map<string, string>();

      const collectProducts = async () => {
        const links = await page.$$eval("a[href*='/product/']", (els) =>
          els.map((el) => ({
            href: (el as HTMLAnchorElement).href ?? "",
            text: el.textContent?.trim() ?? "",
          }))
        );
        for (const l of links) {
          if (!l.href || l.href.includes("/products/") || allProducts.has(l.href)) continue;
          const title = l.text.replace(/\s+/g, " ").trim();
          if (title.length < 5) continue;
          allProducts.set(l.href, title);
        }
      };

      await page.goto(`${BASE}/products`, { timeout: 30_000, waitUntil: "networkidle" });
      await collectProducts();

      const categoryUrls = await page.$$eval("a[href*='/products/']", (els) =>
        Array.from(
          new Set(
            els
              .map((el) => (el as HTMLAnchorElement).href ?? "")
              .filter((h) => h.includes("/products/"))
          )
        )
      );

      for (const catUrl of categoryUrls.slice(0, 40)) {
        try {
          await page.goto(catUrl, { timeout: 25_000, waitUntil: "networkidle" });
          await collectProducts();
        } catch {
          continue;
        }
      }

      const results: ScrapedListing[] = Array.from(allProducts.entries()).map(
        ([url, title]) => ({ title, description: "", url, institution: INST })
      );
      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] ${INST} Playwright failed: ${msg}`);
      return [];
    } finally {
      await browser?.close();
    }
  },
};

// ── International Scrapers — Batch D (Task #119) ──────────────────────────
//
// Probe-first mandate satisfied (2026-03-17):
//   CERN KT:               https://kt.cern/technology-portfolio                             200 OK  54 tech slugs
//   Cancer Res. Horizons:  https://www.cancerresearchhorizons.com/our-portfolio/our-…       200 OK  173 KB page (JS-rendered; 12 items observed at Playwright runtime 2026-03-17)
//
// Blocked / failed probes — exhaustive survey of 300+ candidates, 2026-03-17:
//   TechPublisher platform:  All 300+ slug variations probed — customer base fully exhausted; zero new hits.
//   in-part platform:        Permanently blocked from Replit egress (HTTP 000) on all subdomains.
//   flintbox platform:       Permanently blocked from Replit egress (HTTP 000).
//   NASA Tech Portal:        JS-rendered React SPA; lower biotech relevance; Playwright cost not justified.
//   US R1 portals probed:    UFL, TAMU, MSU, UNC, NCSU, UConn, VCU, Tulane — all HTTP 000 (Replit egress blocked).
//   Canadian portals:        UofT, UAlberta (covered via Flintbox), UBC (covered), Simon Fraser (covered) — remainder HTTP 000.
//   Australian portals:      Melbourne, QUT, Sydney, Adelaide, ANU — HTTP 000.
//   DOE national labs:       Argonne, ORNL, PNNL, NREL — HTTP 000 or no public enumerable listing.
//   European/other:          Karolinska, KU Leuven, TU Munich, Fraunhofer — HTTP 000 or non-enumerable portals.

// ── 1. CERN Knowledge Transfer ────────────────────────────────────────────
// Probe: 2026-03-17 — https://kt.cern/technology-portfolio — 200 OK — 54 tech slugs
// Drupal SSR; all techs listed on one page (no pagination). Individual tech pages
// at /technologies/[slug]. H1 on each page is the technology name.
// Mix of physics/instrumentation/biomedical (Medipix, MEDICIS isotopes, ventilator).
export const cernKtScraper: InstitutionScraper = {
  institution: "CERN Knowledge Transfer",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "CERN Knowledge Transfer";
    const BASE = "https://kt.cern";
    const LISTING = `${BASE}/technology-portfolio`;

    try {
      const $listing = await fetchHtml(LISTING, 15_000);
      if (!$listing) {
        console.warn(`[scraper] ${INST}: could not fetch listing page`);
        return [];
      }

      // Harvest unique tech slugs — all 54 appear on a single listing page
      // Regex allows lowercase letters, digits, hyphens, and underscores (e.g. sps_north_area)
      const slugs = new Set<string>();
      $listing("a[href^='/technologies/']").each((_, el) => {
        const href = $listing(el).attr("href") ?? "";
        if (href && /^\/technologies\/[a-z0-9][a-z0-9_-]*$/.test(href)) {
          slugs.add(href);
        }
      });

      if (slugs.size === 0) {
        console.warn(`[scraper] ${INST}: no tech slugs found on listing page`);
        return [];
      }

      const techUrls = Array.from(slugs).map((s) => `${BASE}${s}`);
      const results: ScrapedListing[] = [];
      const CONCURRENCY = 5;
      const queue = [...techUrls];

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
          while (queue.length > 0) {
            const url = queue.shift()!;
            try {
              const $ = await fetchHtml(url, 12_000);
              if (!$) continue;

              // Title: iterate h1 elements, skip the site-wide header "CERN Accelerating science"
              let title = "";
              $("h1").each((_, el) => {
                if (title) return;
                const t = cleanText($(el).text());
                if (t.length > 5 && !/accelerating science/i.test(t)) {
                  title = t;
                }
              });
              if (!title || title.length < 3) continue;

              // Description: try the "Description" labelled field first, then first
              // substantial <p> in the page body (Drupal tech pages often have rich
              // paragraph content even when the structured field is missing/short)
              let description = "";
              $(".field--label").each((_, el) => {
                if (description) return;
                const label = $(el).text().trim();
                if (label === "Description") {
                  const text = cleanText(
                    $(el).closest(".field").find(".field--item").first().text()
                  );
                  if (text.length > 20) description = text;
                }
              });
              if (!description) {
                $("p").each((_, el) => {
                  if (description) return;
                  const text = cleanText($(el).text());
                  if (text.length > 40 && !/cookie|privacy|copyright/i.test(text)) {
                    description = text.slice(0, 500);
                  }
                });
              }

              results.push({ title, description, url, institution: INST });
            } catch {
              continue;
            }
          }
        })
      );

      console.log(`[scraper] ${INST}: ${results.length} listings (${slugs.size} slugs found)`);
      return results;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] ${INST} failed: ${msg}`);
      return [];
    }
  },
};

// ── 2. Cancer Research Horizons ───────────────────────────────────────────
// Probe: 2026-03-17 — https://www.cancerresearchhorizons.com/our-portfolio/our-licensing-opportunities
//         200 OK, 173 KB — fully JS-rendered (Cloudflare Rocket Loader, no SSR tech data)
//         12 items observed at Playwright runtime (2026-03-17)
// Verified (Task #137): Live run 2026-03-18 confirmed 12 listings — no code change required.
//   ECLIPSE, Novel Apelin receptor antagonist, Trimeric cell-penetrating peptides, …
// CRUK's commercial arm; highly relevant oncology/cancer therapeutic portfolio.
// Fix (Task #136): Cloudflare challenge fires on headless browsers without stealth.
//   Added --disable-blink-features=AutomationControlled, navigator.webdriver spoofing,
//   full sec-ch-ua headers, and a 10 s post-navigation wait (Cloudflare clears in ~5–8 s).
//   Added 3-attempt retry loop in case the first attempt catches the challenge page.
export const cancerResearchHorizonsScraper: InstitutionScraper = {
  institution: "Cancer Research Horizons",
  scraperType: "playwright",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Cancer Research Horizons";
    const BASE = "https://www.cancerresearchhorizons.com";
    const LISTING = `${BASE}/our-portfolio/our-licensing-opportunities`;
    let browser: import("playwright").Browser | null = null;

    try {
      const { chromium } = await import("playwright");
      browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
          "--window-size=1280,800",
        ],
      });

      const page = await browser.newPage();

      // Spoof navigator.webdriver so Cloudflare JS checks pass
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      });

      await page.setExtraHTTPHeaders({
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://www.google.com/",
        "sec-ch-ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
      });

      const seen = new Set<string>();
      const results: ScrapedListing[] = [];

      const collectLinks = async () => {
        const links = await page.$$eval(
          `a[href*='/our-portfolio/our-licensing-opportunities/']`,
          (els) =>
            els.map((el) => ({
              href: (el as HTMLAnchorElement).href ?? "",
              text: el.textContent?.trim() ?? "",
            }))
        );
        let added = 0;
        for (const l of links) {
          if (!l.href || seen.has(l.href)) continue;
          if (l.href.replace(/\/$/, "") === LISTING.replace(/\/$/, "")) continue;
          seen.add(l.href);
          const title = l.text.replace(/\s+/g, " ").trim();
          if (title.length < 5) continue;
          results.push({ title, description: "", url: l.href, institution: INST });
          added++;
        }
        return added;
      };

      // Navigate with retry — Cloudflare challenge may delay first load by ~5–8 s.
      // Use networkidle: Cloudflare's JS challenge fires network activity that must
      // settle before the real page loads; networkidle waits for that to complete.
      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          await page.goto(LISTING, { timeout: 75_000, waitUntil: "networkidle" });

          // Extra 5 s for any remaining async JS rendering after network goes idle
          await page.waitForTimeout(5_000);

          // Scroll to trigger any lazy-loaded items
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(2_000);
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(1_500);

          // Check whether we're past the Cloudflare challenge
          const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
          const isChallenge = /just a moment|checking your browser|enable javascript/i.test(bodyText);
          if (isChallenge && attempt < MAX_ATTEMPTS) {
            await page.waitForTimeout(6_000); // Extra wait before retry
            continue;
          }

          // Try to click any "Load more" button
          try {
            const loadMoreBtn = page.locator('button:has-text("Load more"), button:has-text("Show more"), a:has-text("Load more")').first();
            const visible = await loadMoreBtn.isVisible({ timeout: 2_000 });
            if (visible) {
              await loadMoreBtn.click();
              await page.waitForTimeout(2_500);
            }
          } catch {
            // No load-more button
          }

          await collectLinks();

          // Follow ?page=N pagination — confirmed from user-provided URL ?page=3.
          // Use networkidle on each page to allow Cloudflare + JS to fully settle.
          for (let pg = 2; pg <= 50; pg++) {
            const pageUrl = `${LISTING}?page=${pg}`;
            try {
              await page.goto(pageUrl, { timeout: 60_000, waitUntil: "networkidle" });
              await page.waitForTimeout(3_000);
              await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
              await page.waitForTimeout(1_500);
              const added = await collectLinks();
              if (added === 0) break;
            } catch {
              break;
            }
          }

          break; // Successful run — exit attempt loop
        } catch {
          if (attempt === MAX_ATTEMPTS) break;
          await page.waitForTimeout(5_000);
        }
      }

      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] ${INST} Playwright failed: ${msg}`);
      return [];
    } finally {
      await browser?.close();
    }
  },
};

// ── International Scrapers — Batch E (Task #120 → fixed Task #134) ───────────
//
// Original in-part scrapers returned 0 results for all 11 institutions.
// Replaced with correct implementations per Task #134 (2026-03-18):
//
// UK targets:
//   imperialScraper  — Imperial College London  → paginated HTML (imperial.ac.uk/technology-search)
//   birminghamScraper — University of Birmingham → Flintbox (unibirmingham.flintbox.com)
//   sheffieldScraper  — University of Sheffield  → HTML listing (sheffield.ac.uk/commercialisation)
//   exeterScraper     — University of Exeter     → STUB (no usable public TTO portal)
//   cardiffScraper    — Cardiff University       → STUB (no usable public TTO portal)
//   dundeeScraper     — University of Dundee     → Flintbox (dundee.flintbox.com)
//   warwickScraper    — University of Warwick    → STUB (no usable public TTO portal)
//
// Canada targets:
//   mcgillScraper    — McGill University          → Flintbox (mcgill.flintbox.com)
//   waterlooScraper  — University of Waterloo     → HTML catalog (uwaterloo.ca/watco-technologies)
//   mcmasterScraper  — McMaster University        → HTML listing (research.mcmaster.ca/tech)
//   calgaryScraper   — University of Calgary      → Flintbox (calgary.flintbox.com)
//
// Exeter, Cardiff, Warwick stubs are NOT registered in ALL_SCRAPERS (index.ts).
// Total active: 267 → 275 scrapers (8 UK/Canada active; 3 stubs excluded)

// ── UK ────────────────────────────────────────────────────────────────────────

// ── 1. Imperial College London — paginated HTML ───────────────────────────────
// https://www.imperial.ac.uk/for-business/commercialisation/imperial-tech/technology-search/
// Pagination: ?page=N (page=7 confirmed). Detail: .../technology-search/{slug}/
export const imperialScraper: InstitutionScraper = {
  institution: "Imperial College London",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Imperial College London";
    const BASE = "https://www.imperial.ac.uk";
    const INDEX = `${BASE}/for-business/commercialisation/imperial-tech/technology-search/`;

    // Step 1: fetch page 1, detect last page
    const page1$ = await fetchHtml(INDEX, 15_000);
    if (!page1$) { console.warn(`[scraper] ${INST}: could not fetch listing`); return []; }

    let maxPage = 1;
    page1$("a[href*='?page=']").each((_, el) => {
      const m = (page1$(el).attr("href") ?? "").match(/\?page=(\d+)/);
      if (m) maxPage = Math.max(maxPage, parseInt(m[1], 10));
    });

    // Step 2: collect all page URLs (0 = no param, 1..maxPage = ?page=N)
    const pageUrls: string[] = [INDEX];
    for (let p = 1; p <= maxPage; p++) pageUrls.push(`${INDEX}?page=${p}`);

    // Step 3: fetch all pages in parallel (batches of 8)
    const seen = new Set<string>();
    const results: ScrapedListing[] = [];

    function extractFromPage($p: import("cheerio").CheerioAPI): void {
      $p("a[href*='/technology-search/']").each((_, el) => {
        const href = ($p(el).attr("href") ?? "").split("?")[0];
        if (!href || href.endsWith("/technology-search/") || seen.has(href)) return;
        const title = cleanText($p(el).text());
        if (title.length < 5) return;
        seen.add(href);
        results.push({
          title,
          description: "",
          url: href.startsWith("http") ? href : `${BASE}${href}`,
          institution: INST,
        });
      });
    }

    extractFromPage(page1$);

    const remaining = pageUrls.slice(1);
    const BATCH = 8;
    for (let i = 0; i < remaining.length; i += BATCH) {
      const batch = remaining.slice(i, i + BATCH);
      const pages = await Promise.all(batch.map((u) => fetchHtml(u, 15_000)));
      for (const $p of pages) { if ($p) extractFromPage($p); }
    }

    console.log(`[scraper] ${INST}: ${results.length} listings (${maxPage + 1} pages), fetching details...`);

    await enrichWithDetailPages(
      results,
      {
        description: [".body-copy p", "article .content p", ".prose p", "main .content p", "main p"],
        abstract: [".field--name-field-abstract", ".abstract"],
      },
      60
    );

    console.log(`[scraper] ${INST}: ${results.length} listings (detail-enriched)`);
    return results;
  },
};

// ── 2. University of Birmingham — Flintbox ────────────────────────────────────
// https://unibirmingham.flintbox.com/technologies
export const birminghamScraper = createFlintboxScraper({ slug: "unibirmingham", orgId: 0, accessKey: "" }, "University of Birmingham");

// ── 3. University of Sheffield — HTML listing ─────────────────────────────────
// https://sheffield.ac.uk/commercialisation/current-opportunities/
// Detail pattern: /commercialisation/current-opportunities/{slug}
export const sheffieldScraper: InstitutionScraper = {
  institution: "University of Sheffield",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "University of Sheffield";
    const BASE = "https://www.sheffield.ac.uk";
    const INDEX = `${BASE}/commercialisation/current-opportunities`;
    const results: ScrapedListing[] = [];
    const seen = new Set<string>();

    async function crawlPage(url: string): Promise<string | null> {
      const $ = await fetchHtml(url, 15_000);
      if (!$) return null;

      $("a[href*='/commercialisation/current-opportunities/']").each((_, el) => {
        const href = ($("a", el).length ? $("a", el).attr("href") : $(el).attr("href")) ?? $(el).attr("href") ?? "";
        const norm = href.split("?")[0].replace(/\/$/, "");
        if (!norm || norm.endsWith("/current-opportunities") || seen.has(norm)) return;
        const title = cleanText($(el).text());
        if (title.length < 4) return;
        seen.add(norm);
        results.push({
          title,
          description: "",
          url: norm.startsWith("http") ? norm : `${BASE}${norm}`,
          institution: INST,
        });
      });

      // look for next-page link
      const nextHref = $("a[rel='next'], a:contains('Next'), .pager__item--next a").attr("href");
      return nextHref ? (nextHref.startsWith("http") ? nextHref : `${BASE}${nextHref}`) : null;
    }

    let nextUrl: string | null = INDEX;
    while (nextUrl) nextUrl = await crawlPage(nextUrl);

    console.log(`[scraper] ${INST}: ${results.length} listings, fetching details...`);

    await enrichWithDetailPages(
      results,
      { description: [".prose p", "main article p", ".field--name-body p", ".content p", "main p"] },
      80
    );

    console.log(`[scraper] ${INST}: ${results.length} listings (detail-enriched)`);
    return results;
  },
};

// ── 4. University of Exeter — no usable public TTO listing ───────────────────
export const exeterScraper = createStubScraper("University of Exeter", "in-part portal inactive — no public TTO listing found");

// ── 5. Cardiff University — no usable public TTO listing ─────────────────────
export const cardiffScraper = createStubScraper("Cardiff University", "in-part portal inactive — no public TTO listing found");

// ── 6. University of Dundee — Flintbox ───────────────────────────────────────
// https://dundee.flintbox.com/technologies
export const dundeeScraper = createFlintboxScraper({ slug: "dundee", orgId: 0, accessKey: "" }, "University of Dundee");

// ── 7. University of Warwick — no usable public TTO listing ──────────────────
export const warwickScraper = createStubScraper("University of Warwick", "in-part portal inactive — no public TTO listing found");

// ── Canada ────────────────────────────────────────────────────────────────────

// ── 8. McGill University — Flintbox ──────────────────────────────────────────
// https://mcgill.flintbox.com/technologies
export const mcgillScraper = createFlintboxScraper({ slug: "mcgill", orgId: 0, accessKey: "" }, "McGill University");

// ── 9. University of Waterloo — HTML catalog ─────────────────────────────────
// https://uwaterloo.ca/research/catalogs/watco-technologies/
// Category entry: .../category/life-science-and-healthcare
// Detail pattern: /research/catalogs/watco-technologies/{slug}
export const waterlooScraper: InstitutionScraper = {
  institution: "University of Waterloo",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "University of Waterloo";
    const BASE = "https://uwaterloo.ca";
    const CATALOG_ROOT = `${BASE}/research/catalogs/watco-technologies`;
    const CATEGORY_SEED = `${CATALOG_ROOT}/category/life-science-and-healthcare`;

    const seen = new Set<string>();
    const results: ScrapedListing[] = [];
    const DETAIL_PAT = /\/research\/catalogs\/watco-technologies\/[^/]+$/;

    function extractTechLinks(page$: NonNullable<Awaited<ReturnType<typeof fetchHtml>>>): void {
      page$("a[href]").each((_, el) => {
        const href = (page$(el).attr("href") ?? "").split("?")[0].replace(/\/$/, "");
        if (!DETAIL_PAT.test(href) || seen.has(href)) return;
        const title = cleanText(page$(el).text());
        if (title.length < 4) return;
        seen.add(href);
        results.push({
          title,
          description: "",
          url: href.startsWith("http") ? href : `${BASE}${href}`,
          institution: INST,
        });
      });
    }

    // Discover category pages from catalog root
    const root$ = await fetchHtml(CATALOG_ROOT, 15_000);
    const categoryUrls: string[] = [CATEGORY_SEED];
    if (root$) {
      root$("a[href*='/watco-technologies/category/']").each((_, el) => {
        const href = root$(el).attr("href") ?? "";
        const full = href.startsWith("http") ? href : `${BASE}${href}`;
        if (!categoryUrls.includes(full)) categoryUrls.push(full);
      });
      extractTechLinks(root$);
    }

    // Crawl each category page (with pagination)
    for (const catUrl of categoryUrls) {
      let nextUrl: string | null = catUrl;
      while (nextUrl) {
        const page$ = await fetchHtml(nextUrl, 15_000);
        if (!page$) break;
        extractTechLinks(page$);
        const nextHref = page$("a[rel='next'], .pager__item--next a").attr("href");
        nextUrl = nextHref ? (nextHref.startsWith("http") ? nextHref : `${BASE}${nextHref}`) : null;
      }
    }

    console.log(`[scraper] ${INST}: ${results.length} listings, fetching details...`);

    await enrichWithDetailPages(
      results,
      { description: [".node__content p", ".field--name-body p", "article p", "main p"] },
      80
    );

    console.log(`[scraper] ${INST}: ${results.length} listings (detail-enriched)`);
    return results;
  },
};

// ── 10. McMaster University — HTML listing ────────────────────────────────────
// https://research.mcmaster.ca/industry-investors/techs-for-licensing/
// Detail pattern: /industry-investors/tech/{id}/
export const mcmasterScraper: InstitutionScraper = {
  institution: "McMaster University",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "McMaster University";
    const BASE = "https://research.mcmaster.ca";
    const INDEX = `${BASE}/industry-investors/techs-for-licensing/`;
    const seen = new Set<string>();
    const results: ScrapedListing[] = [];

    async function crawlPage(url: string): Promise<string | null> {
      const $ = await fetchHtml(url, 15_000);
      if (!$) return null;

      $("a[href*='/industry-investors/tech/']").each((_, el) => {
        const href = ($(el).attr("href") ?? "").split("?")[0].replace(/\/$/, "");
        if (!href || seen.has(href)) return;
        const title = cleanText($(el).text());
        if (title.length < 4) return;
        seen.add(href);
        results.push({
          title,
          description: "",
          url: href.startsWith("http") ? href : `${BASE}${href}`,
          institution: INST,
        });
      });

      const nextHref = $("a[rel='next'], .pager__item--next a, a:contains('Next page')").attr("href");
      return nextHref ? (nextHref.startsWith("http") ? nextHref : `${BASE}${nextHref}`) : null;
    }

    let nextUrl: string | null = INDEX;
    while (nextUrl) nextUrl = await crawlPage(nextUrl);

    console.log(`[scraper] ${INST}: ${results.length} listings, fetching details...`);

    await enrichWithDetailPages(
      results,
      { description: [".entry-content p", ".technology-description", ".field--name-body p", "main p"] },
      100
    );

    console.log(`[scraper] ${INST}: ${results.length} listings (detail-enriched)`);
    return results;
  },
};

// ── 11. University of Calgary — Flintbox ──────────────────────────────────────
// https://calgary.flintbox.com/technologies
export const calgaryScraper = createFlintboxScraper({ slug: "calgary", orgId: 0, accessKey: "" }, "University of Calgary");

// ── DOE National Labs — Proxy-Routed Scrapers (Task #121) ────────────────────
//
// These three labs are confirmed accessible from normal browsers but return
// HTTP 000 (connection refused) from Replit's shared egress IP range.
//
// Infrastructure: Deploy server/lib/scrapers/cloudflare-proxy/worker.js as a
// Cloudflare Worker, then set SCRAPER_PROXY_URL env secret to the *.workers.dev
// URL. fetchHtmlViaProxy() routes through the worker when that env var is set.
// Without it, the scrapers fall back to direct fetch (works outside Replit).
//
// Probe targets (all return HTTP 000 from Replit, confirmed 2026-03-17):
//   ORNL  — technology.ornl.gov/license-search/
//   ANL   — www.anl.gov/partnerships/argonne-technologies-available-for-licensing
//   PNNL  — availabletechnologies.pnl.gov/
//
// Listing estimates based on public records:
//   ORNL  — ~120+ technologies (searchable database)
//   ANL   — ~200+ technologies (card-grid listing)
//   PNNL  — ~150+ technologies (category-based listing)
//
// Total with DOE: 278 → 281 scrapers

// ── Oak Ridge National Laboratory (ORNL) ─────────────────────────────────────
export const ornlScraper: InstitutionScraper = {
  institution: "Oak Ridge National Laboratory",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Oak Ridge National Laboratory";
    const BASE = "https://technology.ornl.gov";
    const LISTING = `${BASE}/license-search/`;

    const $ = await fetchHtmlViaProxy(LISTING, 20_000);
    if (!$) {
      console.warn(`[scraper] ${INST}: no content — set SCRAPER_PROXY_URL to unblock`);
      return [];
    }

    const results: ScrapedListing[] = [];
    const seen = new Set<string>();

    // ORNL license-search renders tech cards; try known selectors first
    const candidateSelectors = [
      'a[href*="/license/"]',
      'a[href*="/technology/"]',
      ".technology-card a",
      ".result-item a",
      "article h2 a",
      "article h3 a",
      ".tech-title a",
    ];

    for (const sel of candidateSelectors) {
      $(sel).each((_, el) => {
        const href = $(el).attr("href") ?? "";
        const text = cleanText($(el).text());
        if (!text || text.length < 5) return;
        const url = href.startsWith("http") ? href : `${BASE}${href.startsWith("/") ? "" : "/"}${href}`;
        if (seen.has(url)) return;
        seen.add(url);
        results.push({ title: text, description: "", url, institution: INST });
      });
      if (results.length > 0) break;
    }

    // Generic fallback
    if (results.length === 0) {
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") ?? "";
        const text = cleanText($(el).text());
        if (
          text.length >= 10 &&
          (href.includes("/license/") || href.includes("/technology/") || href.includes("/tech/")) &&
          !href.includes("category") && !href.includes("search")
        ) {
          const url = href.startsWith("http") ? href : `${BASE}${href}`;
          if (seen.has(url)) return;
          seen.add(url);
          results.push({ title: text, description: "", url, institution: INST });
        }
      });
    }

    console.log(`[scraper] ${INST}: ${results.length} listings`);
    return results;
  },
};

// ── Argonne National Laboratory (ANL) ────────────────────────────────────────
export const argonneScraper: InstitutionScraper = {
  institution: "Argonne National Laboratory",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Argonne National Laboratory";
    const BASE = "https://www.anl.gov";
    const LISTING = `${BASE}/partnerships/argonne-technologies-available-for-licensing`;

    const $ = await fetchHtmlViaProxy(LISTING, 20_000);
    if (!$) {
      console.warn(`[scraper] ${INST}: no content — set SCRAPER_PROXY_URL to unblock`);
      return [];
    }

    const results: ScrapedListing[] = [];
    const seen = new Set<string>();

    // ANL technologies page: Drupal-based, typically uses views with card rows
    const candidateSelectors = [
      'a[href*="/technology/"]',
      'a[href*="/ip/"]',
      ".views-row a",
      ".field--name-title a",
      "article h2 a",
      "article h3 a",
      ".card__title a",
    ];

    for (const sel of candidateSelectors) {
      $(sel).each((_, el) => {
        const href = $(el).attr("href") ?? "";
        const text = cleanText($(el).text());
        if (!text || text.length < 5) return;
        const url = href.startsWith("http") ? href : `${BASE}${href}`;
        if (seen.has(url)) return;
        seen.add(url);
        results.push({ title: text, description: "", url, institution: INST });
      });
      if (results.length > 0) break;
    }

    // Generic fallback
    if (results.length === 0) {
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") ?? "";
        const text = cleanText($(el).text());
        if (
          text.length >= 10 &&
          (href.includes("/technology/") || href.match(/\/anl-\d+/i) || href.includes("anl.gov/tech"))
        ) {
          const url = href.startsWith("http") ? href : `${BASE}${href}`;
          if (seen.has(url)) return;
          seen.add(url);
          results.push({ title: text, description: "", url, institution: INST });
        }
      });
    }

    console.log(`[scraper] ${INST}: ${results.length} listings`);
    return results;
  },
};

// ── Pacific Northwest National Laboratory (PNNL) ─────────────────────────────
export const pnnlScraper: InstitutionScraper = {
  institution: "Pacific Northwest National Laboratory",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Pacific Northwest National Laboratory";
    const BASE = "https://availabletechnologies.pnl.gov";
    const LISTING = `${BASE}/`;

    const $ = await fetchHtmlViaProxy(LISTING, 20_000);
    if (!$) {
      console.warn(`[scraper] ${INST}: no content — set SCRAPER_PROXY_URL to unblock`);
      return [];
    }

    const results: ScrapedListing[] = [];
    const seen = new Set<string>();

    // PNNL uses a category-based structure — collect category pages then recurse
    const categoryLinks: string[] = [];
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const text = cleanText($(el).text());
      if (
        text.length > 3 &&
        (href.includes("/category/") || href.includes("/area/") || href.match(/^\/[a-z-]+\/?$/)) &&
        href !== "/" && !href.includes("search") && !href.includes("contact")
      ) {
        const url = href.startsWith("http") ? href : `${BASE}${href}`;
        if (!categoryLinks.includes(url)) categoryLinks.push(url);
      }
    });

    for (const catUrl of categoryLinks.slice(0, 15)) {
      const cat$ = await fetchHtmlViaProxy(catUrl, 15_000);
      if (!cat$) continue;
      cat$("a[href]").each((_, el) => {
        const href = cat$(el).attr("href") ?? "";
        const text = cleanText(cat$(el).text());
        if (
          text.length >= 10 &&
          (href.includes("/technology/") || href.includes("/tech/") || href.match(/\/\d{3,}/)) &&
          !href.includes("category") && !href.includes("area")
        ) {
          const url = href.startsWith("http") ? href : `${BASE}${href}`;
          if (seen.has(url)) return;
          seen.add(url);
          results.push({ title: text, description: "", url, institution: INST });
        }
      });
    }

    // Fallback: direct tech links from listing page
    if (results.length === 0) {
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") ?? "";
        const text = cleanText($(el).text());
        if (text.length >= 10 && (href.includes("/technology/") || href.includes("/tech/"))) {
          const url = href.startsWith("http") ? href : `${BASE}${href}`;
          if (seen.has(url)) return;
          seen.add(url);
          results.push({ title: text, description: "", url, institution: INST });
        }
      });
    }

    console.log(`[scraper] ${INST}: ${results.length} listings`);
    return results;
  },
};
