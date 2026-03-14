import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Duke University";
const PORTAL = "https://duke.portals.in-part.com";

export const dukeScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const res = await fetch(PORTAL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        console.log(`[scraper] ${INST}: in-part portal returned ${res.status}`);
        return [];
      }

      const html = await res.text();

      const m = html.match(
        /<script id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/
      );
      if (m) {
        try {
          const data = JSON.parse(m[1]);
          const queries =
            data?.props?.pageProps?.dehydratedState?.queries ?? [];
          const allResults: ScrapedListing[] = [];
          const ssrSeen = new Set<string>();
          for (const q of queries) {
            const pages = q?.state?.data?.pages ?? [];
            for (const page of pages) {
              const items = page?.results ?? [];
              for (const r of items) {
                const title = (r.title ?? "").trim();
                if (title.length < 5) continue;
                const hash = r.idHash ?? r.id;
                if (!hash) continue;
                const url = `${PORTAL}/${hash}`;
                if (ssrSeen.has(url)) continue;
                ssrSeen.add(url);
                allResults.push({
                  title,
                  description: "",
                  url,
                  institution: INST,
                });
              }
            }
          }
          if (allResults.length > 0) {
            console.log(
              `[scraper] ${INST}: ${allResults.length} listings (in-part SSR)`
            );
            return allResults;
          }
        } catch {}
      }

      const cheerio = await import("cheerio");
      const $ = cheerio.load(html);
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();
      $('a[href^="/"]').each((_, el) => {
        const href = $(el).attr("href") ?? "";
        if (
          href.length < 4 ||
          href.startsWith("/_") ||
          href.startsWith("/api") ||
          href === "/" ||
          href === "/profile" ||
          href === "/privacy" ||
          href === "/terms"
        )
          return;
        if ((href.match(/\//g) ?? []).length > 2) return;
        if (seen.has(href)) return;
        seen.add(href);
        const title = ($(el).text() ?? "")
          .replace(/\s+/g, " ")
          .trim();
        if (!title || title.length < 5) return;
        results.push({
          title,
          description: "",
          url: `${PORTAL}${href}`,
          institution: INST,
        });
      });

      if (results.length > 0) {
        console.log(
          `[scraper] ${INST}: ${results.length} listings (in-part HTML fallback)`
        );
        return results;
      }

      console.log(
        `[scraper] ${INST}: 0 results (in-part portal has no public listings in SSR or HTML)`
      );
      return [];
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
