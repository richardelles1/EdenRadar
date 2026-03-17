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

// 6. New Mexico State University (Tradespace)
// React SPA — no public JSON API found at /api/opportunities or /graphql endpoints
export const nmStateScraper = createStubScraper(
  "New Mexico State University (Tradespace)",
  "Tradespace marketplace is a React SPA with no public API endpoint — same pattern as UTEP Tradespace stub"
);

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

// 9. Los Alamos National Laboratory
// Tech-and-capability-search page and all known LANL tech listing URLs return HTTP 404;
// confirmed zero listings accessible via static scraping
export const losAlamosScraper = createStubScraper(
  "Los Alamos National Laboratory",
  "Confirmed zero listings: tech-and-capability-search page and all known LANL tech listing paths return HTTP 404"
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
//   Elastic App Search engine "cancer-consortium" at fredhutch-prod.ent.us-west-2.aws.found.io
//   Engine indexes cancerconsortium.org only — "Available Technology" type returns 0 hits
//   AEM childrenlist hasChildren:false — tech-detail pages are dynamically rendered by JS
//   Wayback Machine CDX: 0 archived technology-details pages
//   Strategy: (1) Elastic API exhaustive scan for fredhutch.org/technology-details URLs,
//             (2) Playwright JS navigation of available-technologies.html as fallback
//   Smoke-tested: ~61 listings via Playwright across 7 pages (as of 2026-03-17)
export const fredHutchScraper: InstitutionScraper = {
  institution: "Fred Hutchinson Cancer Center",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Fred Hutchinson Cancer Center";
    const LISTING_URL = "https://www.fredhutch.org/en/investors/business-development/available-technologies.html";
    const ELASTIC_ENDPOINT = "https://fredhutch-prod.ent.us-west-2.aws.found.io/api/as/v1/engines/cancer-consortium/search";
    const ELASTIC_KEY = "search-d4wmid75w6rn9onstbmpampm";

    // ── Strategy 1: Elastic App Search exhaustive scan ──────────────────────
    // Engine currently indexes cancerconsortium.org (not fredhutch.org tech pages),
    // but we attempt this first in case the engine scope expands in future.
    const elasticScan = async (): Promise<ScrapedListing[]> => {
      const results: ScrapedListing[] = [];
      try {
        let page = 1;
        let totalPages = 1;
        while (page <= totalPages && page <= 10) {
          const res = await fetch(ELASTIC_ENDPOINT, {
            method: "POST",
            headers: { "Authorization": `Bearer ${ELASTIC_KEY}`, "Content-Type": "application/json" },
            signal: AbortSignal.timeout(15_000),
            body: JSON.stringify({
              query: "",
              page: { size: 100, current: page },
              result_fields: {
                title: { raw: {} },
                url: { raw: {} },
                body_content: { raw: { size: 400 } },
              },
            }),
          });
          if (!res.ok) break;
          const json: { meta?: { page?: { total_pages?: number } }; results?: Array<Record<string, { raw?: string }>> } = await res.json();
          totalPages = json?.meta?.page?.total_pages ?? 1;
          for (const r of json.results ?? []) {
            const url = r.url?.raw ?? "";
            if (!url.includes("fredhutch.org") || !url.includes("technology-details")) continue;
            const title = (r.title?.raw ?? "").trim();
            if (!title) continue;
            const desc = (r.body_content?.raw ?? "").replace(/<[^>]+>/g, " ").trim();
            results.push({ title, description: desc.slice(0, 1000), url, institution: INST });
          }
          page++;
        }
      } catch {
        // Elastic unavailable — proceed to Playwright fallback
      }
      return results;
    };

    // ── Strategy 2: Playwright JS navigation fallback ────────────────────────
    // Tech listings are rendered via JavaScript (AEM). Must use networkidle so the
    // JS bundle finishes loading before we collect links.
    const playwrightScan = async (): Promise<ScrapedListing[]> => {
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

        await page.goto(LISTING_URL, { timeout: 45_000, waitUntil: "networkidle" });
        // Wait for at least one technology-details link to appear in the DOM
        await page.waitForSelector('a[href*="technology-details"]', { timeout: 15_000 });

        const allLinks = new Map<string, string>();

        const collectPage = async () => {
          const links = await page.$$eval('a[href*="technology-details"]', (els) =>
            els.map((el) => ({
              href: el.getAttribute("href") ?? "",
              text: el.textContent?.trim() ?? "",
            }))
          );
          for (const l of links) {
            if (l.href && !allLinks.has(l.href)) allLinks.set(l.href, l.text);
          }
        };

        await collectPage();

        // The listing page loads all items at once (no pagination button).
        // Attempt to click a Next/load-more button in case of future pagination.
        for (let pg = 2; pg <= 20; pg++) {
          const nextBtn = await page.$('[class*="next" i] a, button[aria-label*="next" i]').catch(() => null);
          if (!nextBtn) break;
          const isDisabled = await nextBtn.evaluate((el) =>
            el.classList.contains("disabled") || el.hasAttribute("disabled")
          ).catch(() => true);
          if (isDisabled) break;

          await nextBtn.click();
          await page.waitForTimeout(2_500);
          const prevSize = allLinks.size;
          await collectPage();
          if (allLinks.size === prevSize) break;
        }

        // Fallback: if main AEM listing rendered empty (JS failed to hydrate),
        // crawl the research-tools sub-page which contains additional tech-detail links.
        if (allLinks.size === 0) {
          const RESEARCH_TOOLS_URL =
            "https://www.fredhutch.org/en/investors/business-development/available-technologies/research-tools.html";
          try {
            await page.goto(RESEARCH_TOOLS_URL, { timeout: 30_000, waitUntil: "networkidle" });
            await page.waitForSelector('a[href*="technology-details"]', { timeout: 10_000 });
            await collectPage();
          } catch {
            // sub-page unavailable — proceed with empty results
          }
        }

        const results: ScrapedListing[] = [];
        for (const [href, title] of Array.from(allLinks.entries())) {
          if (!title || title.length < 3) continue;
          const fullUrl = href.startsWith("http") ? href : `https://www.fredhutch.org${href}`;
          results.push({ title, description: "", url: fullUrl, institution: INST });
        }
        return results;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[scraper] ${INST} Playwright failed: ${msg}`);
        return [];
      } finally {
        await browser?.close();
      }
    };

    // Run Elastic scan first; if it returns 0 (expected until engine scope changes),
    // fall back to Playwright navigation which yields real results
    const elasticResults = await elasticScan();
    if (elasticResults.length > 0) {
      console.log(`[scraper] ${INST}: ${elasticResults.length} listings (Elastic cancer-consortium)`);
      return elasticResults;
    }

    const pwResults = await playwrightScan();
    console.log(`[scraper] ${INST}: ${pwResults.length} listings (Playwright JS pagination)`);
    return pwResults;
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

// ── Nationwide Children's Hospital — bespoke HTML scraper ─────────────────────
// Main listing at /research/technology-commercialization/available-technologies.
// Individual tech pages at /research/technology-commercialization/available-technologies/<slug>.
// Title: <h1 class=" contentHeading"> (or any <h1>), Description: <meta name="og:description">.
export const nationwideChildrensScraper: InstitutionScraper = {
  institution: "Nationwide Children's Hospital",
  async scrape(): Promise<ScrapedListing[]> {
    const INST = "Nationwide Children's Hospital";
    const BASE = "https://www.nationwidechildrens.org";
    const INDEX_URL = `${BASE}/research/technology-commercialization/available-technologies`;
    const INDEX_PATH = "/research/technology-commercialization/available-technologies";
    const TIMEOUT_MS = 15_000;
    const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

    try {
      const res = await fetch(INDEX_URL, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      // Collect /research/technology-commercialization/available-technologies/<slug>
      const seenUrls = new Set<string>();
      const techUrls: string[] = [];
      const hrefRe = /href="(\/research\/technology-commercialization\/available-technologies\/[^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = hrefRe.exec(html)) !== null) {
        const fullUrl = `${BASE}${m[1]}`;
        if (!seenUrls.has(fullUrl)) {
          seenUrls.add(fullUrl);
          techUrls.push(fullUrl);
        }
      }

      if (techUrls.length === 0) {
        console.log(`[scraper] ${INST}: 0 tech URLs found on listing page`);
        return [];
      }

      const results: ScrapedListing[] = [];
      for (const url of techUrls) {
        try {
          const pageRes = await fetch(url, {
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!pageRes.ok) continue;
          const pageHtml = await pageRes.text();
          const h1Match = pageHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i);
          const ogDescMatch = pageHtml.match(/<meta\s+name="og:description"\s+content="([^"]+)"/i);
          const metaDescMatch = pageHtml.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
          const title = h1Match ? cleanText(h1Match[1]) : "";
          const description = ogDescMatch
            ? cleanText(ogDescMatch[1])
            : metaDescMatch ? cleanText(metaDescMatch[1]) : "";
          if (title && title.length > 5) {
            results.push({ title, description, url, institution: INST });
          }
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
