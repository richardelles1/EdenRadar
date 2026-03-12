import { createTechPublisherScraper } from "./techpublisher";
import { createFlintboxScraper } from "./flintbox";
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

function createInPartScraper(subdomain: string, institution: string): InstitutionScraper {
  return {
    institution,
    async scrape(): Promise<ScrapedListing[]> {
      const url = `https://${subdomain}.portals.in-part.com/`;
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return [];
        const html = await res.text();
        const m = html.match(/__NEXT_DATA__[^>]+>([\s\S]+?)<\/script>/);
        if (!m) return [];
        const data = JSON.parse(m[1]);
        const queries = data?.props?.pageProps?.dehydratedState?.queries ?? [];
        const page = queries[0]?.state?.data?.pages?.[0];
        if (!page?.results) return [];
        const results: ScrapedListing[] = page.results.map((r: any) => ({
          title: r.title ?? "",
          description: "",
          url: `https://${subdomain}.portals.in-part.com/${r.idHash}`,
          institution,
        })).filter((r: ScrapedListing) => r.title.length > 0);
        console.log(`[scraper] ${institution}: ${results.length} listings (in-part SSR page 1 of ${page.pagination?.last ?? "?"})`);
        return results;
      } catch (err: any) {
        console.warn(`[scraper] ${institution} (in-part): ${err?.message}`);
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

export const uclaScraper = createTechPublisherScraper(
  "ucla",
  "UCLA",
  { maxPg: 100 }
);

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

export const ucDavisScraper = createTechPublisherScraper(
  "ucdavis",
  "UC Davis",
  { selector: "a[href*='/techcase']", maxPg: 80 }
);

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
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 80 }
);

export const pennStateScraper = createTechPublisherScraper(
  "pennstate",
  "Penn State University",
  { maxPg: 80 }
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
export const tamuScraper = createStubScraper("Texas A&M University");
export const riceScraper = createFlintboxScraper(
  { slug: "rice", orgId: 71, accessKey: "71da9d2e-1e3f-4137-81b1-54405988d820" },
  "Rice University"
);
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
export const texasTechScraper = createFlintboxScraper(
  { slug: "ttu", orgId: 23, accessKey: "391d483e-dc4f-4be7-913d-1a63f683a47b" },
  "Texas Tech University"
);
export const untScraper = createStubScraper("University of North Texas");
export const baylorScraper = createFlintboxScraper(
  { slug: "baylor", orgId: 201, accessKey: "613499ba-c868-4819-9b2d-d7744d83bebc" },
  "Baylor University"
);
export const portlandStateScraper = createInPartScraper("pdx", "Portland State University");
export const umontanaScraper = createStubScraper("University of Montana");
export const montanaStateScraper = createMontanaStateScraper();
export const unmScraper = createFlintboxScraper(
  { slug: "unm", orgId: 83, accessKey: "d806a16b-e229-4077-81f8-1704ae7099be" },
  "University of New Mexico"
);
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
export const indianaScraper = createInPartScraper("iu", "Indiana University");
export const notredameScraper = createInPartScraper("nd", "University of Notre Dame");
// WARF uses SearchWP with category-based filtering. The search page at
// /search-results/?searchwp=&search-technology=1 returns NO technology links
// without a s_tech_category param. Pagination (&pg=N, &paged=N) returns 0
// results per category — each category dumps all its results on one page.
// Tested empirically: category iteration is the only working approach.
export const warfScraper: InstitutionScraper = {
  institution: "University of Wisconsin",
  async scrape(): Promise<ScrapedListing[]> {
    const base = "https://www.warf.org";
    const searchUrl = `${base}/search-results/?searchwp=&search-technology=1`;
    const results: ScrapedListing[] = [];
    const seen = new Set<string>();
    try {
      const $index = await fetchHtml(searchUrl, 15000);
      if (!$index) return [];
      const categories: string[] = [];
      $index("select option, input[type='checkbox'], input[type='radio']").each((_, el) => {
        const val = $index(el).attr("value") ?? "";
        if (val && val.length > 2 && !["1", "search", "technology"].includes(val)) {
          categories.push(val);
        }
      });
      const uniqueCats = [...new Set(categories)].slice(0, 80);
      for (const cat of uniqueCats) {
        const catUrl = `${searchUrl}&s_tech_category=${encodeURIComponent(cat)}`;
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
      }
      console.log(`[scraper] University of Wisconsin (WARF): ${results.length} listings (${uniqueCats.length} categories)`);
      return results;
    } catch (err: any) {
      console.warn(`[scraper] University of Wisconsin (WARF): ${err?.message}`);
      return results;
    }
  },
};
export const auburnScraper = createFlintboxScraper(
  { slug: "auburn", orgId: 30, accessKey: "7ff46c23-25a2-4e76-9c2a-34f7c5819ab4" },
  "Auburn University"
);
export const ugaScraper = createFlintboxScraper(
  { slug: "uga", orgId: 11, accessKey: "28c03bda-3676-41d6-bf18-22101ac1dbc5" },
  "University of Georgia"
);
export const uarkansasScraper = createFlintboxScraper(
  { slug: "uaventures", orgId: 111, accessKey: "55f4e5e8-1c29-4e3d-a981-8c4d663d8472" },
  "University of Arkansas"
);
export const uamsScraper = createStubScraper("University of Arkansas for Medical Sciences");
export const udelScraper = createFlintboxScraper(
  { slug: "udel", orgId: 93, accessKey: "b3c809cf-2bd5-4b78-8f50-1cac404a5dba" },
  "University of Delaware"
);
export const templeScraper = createStubScraper("Temple University");
export const drexelScraper = createTechPublisherScraper("drexelotc", "Drexel University", { maxPg: 50 });
export const bucknellScraper = createStubScraper("Bucknell University");
export const sunyalbanyScraper = createStubScraper("SUNY Albany");
export const uconnScraper = createFlintboxScraper(
  { slug: "uconn", orgId: 106, accessKey: "c9a1cb21-6c5e-437c-9662-9492efa1205a" },
  "University of Connecticut"
);
export const dartmouthScraper = createFlintboxScraper(
  { slug: "dartmouth", orgId: 22, accessKey: "7c57a009-67e1-4f80-bd5f-1fd5d140fdb2" },
  "Dartmouth College"
);
export const brandeisScraper = createFlintboxScraper(
  { slug: "brandeis", orgId: 43, accessKey: "0bc51ba1-c4b3-41c2-a762-443373f4df2c" },
  "Brandeis University"
);
export const unhScraper = createStubScraper("University of New Hampshire");
export const uriScraper = createFlintboxScraper(
  { slug: "uri", orgId: 39, accessKey: "4cfe8cae-7fe8-4d31-a38e-9628d93f4ac0" },
  "University of Rhode Island"
);
export const mountsinaiScraper = createInPartScraper("mountsinai", "Icahn School of Medicine at Mount Sinai");
export const caltechScraper = createStubScraper("California Institute of Technology");
export const asuScraper = createWordPressApiScraper("https://skysonginnovations.com", "technology", "Arizona State University");

// ── International: UK ────────────────────────────────────────────────────
export const oxfordScraper = createStubScraper("University of Oxford");
export const imperialScraper = createStubScraper("Imperial College London");
export const uclScraper = createStubScraper("University College London");
export const manchesterScraper = createStubScraper("University of Manchester");
export const edinburghScraper = createStubScraper("University of Edinburgh");
export const bristolScraper = createStubScraper("University of Bristol");
export const glasgowScraper = createStubScraper("University of Glasgow");
export const birminghamScraper = createStubScraper("University of Birmingham");
export const nottinghamScraper = createStubScraper("University of Nottingham");
export const sheffieldScraper = createStubScraper("University of Sheffield");
export const warwickScraper = createStubScraper("University of Warwick");
export const kclScraper = createStubScraper("King's College London");

// ── International: Switzerland ───────────────────────────────────────────
export const ethzurichScraper = createStubScraper("ETH Zurich");
export const epflScraper = createStubScraper("EPFL");
export const ubaselScraper = createStubScraper("University of Basel");
export const ulausanneScraper = createStubScraper("University of Lausanne");
export const ugenevaScaper = createStubScraper("University of Geneva");
export const uzurichScraper = createStubScraper("University of Zurich");

// ── International: Benelux ───────────────────────────────────────────────
export const kuleuvenScraper = createStubScraper("KU Leuven");
export const ugentScraper = createStubScraper("Ghent University");
export const groningenScraper = createStubScraper("University of Groningen");
export const uamsterdamScraper = createStubScraper("University of Amsterdam");
export const vuamsterdamScraper = createStubScraper("Vrije Universiteit Amsterdam");
export const leidenScraper = createStubScraper("Leiden University");

// ── International: Nordic ────────────────────────────────────────────────
export const karolinskaScaper = createStubScraper("Karolinska Institutet");
export const inven2Scraper = createStubScraper("University of Oslo");
export const visScraper = createStubScraper("University of Bergen");
export const ntnuScraper = createStubScraper("NTNU");
export const ucphScraper = createStubScraper("University of Copenhagen");
export const aarhusScraper = createStubScraper("Aarhus University");
export const dtuScraper = createStubScraper("Technical University of Denmark");
export const lundScraper = createStubScraper("Lund University");
export const chalmersScraper = createStubScraper("Chalmers University of Technology");
export const gothenburgScraper = createStubScraper("University of Gothenburg");
export const helsinkiScraper = createStubScraper("University of Helsinki");
export const aaltoScraper = createStubScraper("Aalto University");

// ── International: Germany ───────────────────────────────────────────────
export const tumScraper = createStubScraper("Technical University of Munich");
export const lmuScraper = createStubScraper("Ludwig Maximilian University of Munich");
export const rwthScraper = createStubScraper("RWTH Aachen University");
export const ufreiburgScraper = createStubScraper("University of Freiburg");
export const ubonnScraper = createStubScraper("University of Bonn");
export const ucologneScraper = createStubScraper("University of Cologne");
export const utubingenScraper = createStubScraper("University of Tübingen");
export const heidelbergScraper = createStubScraper("University of Heidelberg");

// ── International: Israel ────────────────────────────────────────────────
export const weizmannScraper = createStubScraper("Weizmann Institute of Science");
export const technionScraper = createStubScraper("Technion – Israel Institute of Technology");

// ── International: Canada ────────────────────────────────────────────────
export const utorontoScraper = createStubScraper("University of Toronto");
export const mcgillScraper = createFlintboxScraper(
  { slug: "mcgill", orgId: 37, accessKey: "b2e0b0b3-23e5-4738-bbc8-846269cddced" },
  "McGill University"
);
export const ubcScraper = createFlintboxScraper(
  { slug: "ubc", orgId: 47, accessKey: "1389e7c7-144e-4b9e-935d-b798cb4eae59" },
  "University of British Columbia"
);
export const ucalgaryScraper = createFlintboxScraper(
  { slug: "calgary", orgId: 202, accessKey: "9939c8eb-7d70-4432-9a85-a7627b836328" },
  "University of Calgary"
);
export const umanitobaScraper = createInPartScraper("manitoba", "University of Manitoba");
export const uvicScraper = createFlintboxScraper(
  { slug: "uvic", orgId: 95, accessKey: "7b328428-6bc4-45ad-b80c-9f0531797e59" },
  "University of Victoria"
);
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
export const nusScraper = createFlintboxScraper(
  { slug: "nus", orgId: 67, accessKey: "54cd9616-abe5-4e1f-b7d9-a518525f9f69" },
  "National University of Singapore"
);
export const hkustScraper = createStubScraper("Hong Kong University of Science and Technology");
export const hkuScraper = createStubScraper("University of Hong Kong");
