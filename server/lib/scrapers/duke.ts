import { chromium, type Browser } from "playwright";
import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Duke University";

export const dukeScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    const portalUrl = "https://duke.portals.in-part.com/";
    let browser: Browser | null = null;

    let ssrResults: ScrapedListing[] | null = null;
    let expectedPages = 2;
    try {
      const res = await fetch(portalUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const html = await res.text();
        const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/);
        if (m) {
          const data = JSON.parse(m[1]);
          const queries = data?.props?.pageProps?.dehydratedState?.queries ?? [];
          const page = queries[0]?.state?.data?.pages?.[0];
          if (page?.results?.length > 0) {
            const totalPages = page.pagination?.last ?? 1;
            expectedPages = totalPages;
            if (totalPages <= 1) {
              const results: ScrapedListing[] = page.results
                .map((r: any) => ({
                  title: r.title ?? "",
                  description: "",
                  url: `https://duke.portals.in-part.com/${r.idHash}`,
                  institution: INST,
                }))
                .filter((r: ScrapedListing) => r.title.length > 0);
              console.log(`[scraper] ${INST}: ${results.length} listings (in-part SSR, 1 page)`);
              return results;
            }
            ssrResults = page.results.map((r: any) => ({
              title: r.title ?? "",
              description: "",
              url: `https://duke.portals.in-part.com/${r.idHash}`,
              institution: INST,
            })).filter((r: ScrapedListing) => r.title.length > 0);
          }
        }
      }
    } catch {
    }

    const runPlaywright = async (): Promise<ScrapedListing[]> => {
      browser = await chromium.launch({ headless: true });
      const bPage = await browser.newPage();
      await bPage.goto(portalUrl, { waitUntil: "networkidle", timeout: 60000 });

      await bPage.waitForSelector(
        'a[href^="/"], [class*="card"], [class*="result"], [class*="listing"], [class*="technolog"]',
        { timeout: 15000 }
      ).catch(() => {});

      let prevLinkCount = 0;
      let stableRounds = 0;
      const maxScrolls = Math.max(expectedPages * 3, 30);
      for (let scroll = 0; scroll < maxScrolls; scroll++) {
        await bPage.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
          const containers = document.querySelectorAll('[class*="scroll"],[class*="list"],[class*="results"],[class*="technologies"]');
          containers.forEach((el) => { (el as HTMLElement).scrollTop = (el as HTMLElement).scrollHeight; });
        });

        await bPage.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button, a[role="button"]'));
          for (const btn of btns) {
            const text = (btn.textContent ?? "").toLowerCase().trim();
            if (text.includes("load more") || text.includes("show more") || text.includes("see more")) {
              (btn as HTMLElement).click();
            }
          }
        });

        await bPage.waitForTimeout(2000);

        const linkCount = await bPage.evaluate(
          () => document.querySelectorAll('a[href^="/"]').length
        );
        if (linkCount === prevLinkCount) {
          stableRounds++;
          if (stableRounds >= 2) break;
        } else {
          stableRounds = 0;
        }
        prevLinkCount = linkCount;
      }

      const listings = await bPage.evaluate((inst: string) => {
        const SKIP = new Set(["", "/", "/profile", "/privacy", "/terms"]);
        const links = Array.from(document.querySelectorAll('a[href^="/"]'));
        const seen = new Set<string>();
        const results: { title: string; description: string; url: string; institution: string }[] = [];
        for (const a of links) {
          const href = a.getAttribute("href") ?? "";
          if (href.length < 4 || href.startsWith("/_") || href.startsWith("/api") || SKIP.has(href)) continue;
          if ((href.match(/\//g) ?? []).length > 2) continue;
          if (seen.has(href)) continue;
          seen.add(href);
          const title = (a.textContent ?? "").replace(/\s+/g, " ").trim();
          const cleaned = title.replace(/^[A-Z][a-z]+ (?:University|College|Institute|School|Université)[A-Za-z ]*/u, "").trim();
          if (!cleaned || cleaned.length < 5) continue;
          results.push({
            title: cleaned,
            description: "",
            url: `https://duke.portals.in-part.com${href}`,
            institution: inst,
          });
        }
        return results;
      }, INST);

      await browser.close();
      browser = null;
      return listings as ScrapedListing[];
    };

    try {
      const abort = AbortSignal.timeout(90_000);
      const abortPromise = new Promise<never>((_, reject) =>
        abort.addEventListener("abort", () => {
          if (browser) browser.close().catch(() => {});
          reject(new Error("Duke in-part Playwright timeout (90s)"));
        })
      );
      const listings = await Promise.race([runPlaywright(), abortPromise]);
      if (listings.length > 0) {
        console.log(`[scraper] ${INST}: ${listings.length} listings (in-part Playwright)`);
        return listings;
      }
    } catch (err: any) {
      console.warn(`[scraper] ${INST} (in-part Playwright): ${err?.message}`);
    } finally {
      if (browser) await (browser as Browser).close().catch(() => {});
    }

    if (ssrResults && ssrResults.length > 0) {
      console.log(`[scraper] ${INST}: ${ssrResults.length} listings (in-part SSR page-1 fallback)`);
      return ssrResults;
    }
    console.warn(`[scraper] ${INST}: all paths failed, returning empty`);
    return [];
  },
};
