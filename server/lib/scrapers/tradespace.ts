import type { InstitutionScraper, ScrapedListing } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

async function playwrightScrapeSubdomain(
  subdomain: string,
  institution: string
): Promise<ScrapedListing[]> {
  const base = `https://${subdomain}.tradespacemarket.com`;
  let browser: import("playwright").Browser | null = null;

  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ "User-Agent": UA });

    await page.goto(base, { timeout: 60_000, waitUntil: "networkidle" });
    await page.waitForTimeout(3_000);

    const allItems = new Map<string, string>();

    const extractListings = async () => {
      const items = await page.evaluate((baseUrl: string) => {
        const results: Array<{ href: string; title: string; description: string }> = [];
        const seen = new Set<string>();

        const tryExtract = (el: Element) => {
          const anchor = el.tagName === "A" ? (el as HTMLAnchorElement) : el.querySelector("a");
          if (!anchor) return;
          const href = anchor.getAttribute("href") ?? "";
          if (!href || seen.has(href)) return;
          const heading =
            el.querySelector("h1, h2, h3, h4, [class*='title'], [class*='Title'], [class*='name'], [class*='Name']");
          const title = (heading?.textContent ?? anchor.textContent ?? "").trim();
          if (title.length < 5) return;
          seen.add(href);
          const pTags = Array.from(el.querySelectorAll("p, [class*='description'], [class*='Description']"));
          const description = pTags
            .map((p) => p.textContent?.trim() ?? "")
            .filter((s) => s.length > 0)
            .join(" ")
            .substring(0, 500);
          const fullHref = href.startsWith("http") ? href : `${baseUrl}${href}`;
          results.push({ href: fullHref, title, description });
        };

        const cardSelectors = [
          '[class*="card"]',
          '[class*="Card"]',
          '[class*="listing"]',
          '[class*="Listing"]',
          '[class*="opportunity"]',
          '[class*="Opportunity"]',
          '[class*="tech"]',
          '[class*="Tech"]',
          '[class*="item"]',
          '[class*="Item"]',
          "article",
          "li[class]",
        ];

        for (const sel of cardSelectors) {
          const els = Array.from(document.querySelectorAll(sel));
          if (els.length > 0) {
            for (const el of els) tryExtract(el);
            if (results.length >= 2) break;
          }
        }

        if (results.length === 0) {
          const anchors = Array.from(
            document.querySelectorAll('a[href*="/market"], a[href*="/listing"], a[href*="/opportunity"], a[href*="/tech"]')
          );
          for (const a of anchors) {
            const href = (a as HTMLAnchorElement).getAttribute("href") ?? "";
            if (!href || seen.has(href)) continue;
            const title = (a.textContent ?? "").trim();
            if (title.length < 5) continue;
            seen.add(href);
            results.push({
              href: href.startsWith("http") ? href : `${baseUrl}${href}`,
              title,
              description: "",
            });
          }
        }

        return results;
      }, base);

      for (const item of items) {
        if (!allItems.has(item.href)) {
          allItems.set(item.href, item.title + (item.description ? "\x00" + item.description : ""));
        }
      }
    };

    await extractListings();

    let loadMoreAttempts = 0;
    while (loadMoreAttempts < 20) {
      const prevSize = allItems.size;

      const loadMoreBtn = await page.$(
        'button:has-text("Load More"), button:has-text("Show More"), button:has-text("Next"), ' +
        '[class*="load-more"], [class*="LoadMore"], [aria-label*="next" i], [aria-label*="Next"]'
      );

      if (!loadMoreBtn) break;

      const disabled = await loadMoreBtn.evaluate(
        (el) =>
          el.hasAttribute("disabled") ||
          el.classList.contains("disabled") ||
          el.getAttribute("aria-disabled") === "true"
      );
      if (disabled) break;

      await loadMoreBtn.click();
      await page.waitForTimeout(3_000);
      await extractListings();

      if (allItems.size === prevSize) break;
      loadMoreAttempts++;
    }

    if (allItems.size === 0) {
      await page.goto(`${base}/market`, { timeout: 30_000, waitUntil: "networkidle" });
      await page.waitForTimeout(3_000);
      await extractListings();
    }

    const results: ScrapedListing[] = [];
    for (const [url, raw] of Array.from(allItems.entries())) {
      const sepIdx = raw.indexOf("\x00");
      const title = sepIdx >= 0 ? raw.substring(0, sepIdx) : raw;
      const description = sepIdx >= 0 ? raw.substring(sepIdx + 1) : "";
      results.push({ title, description, url, institution });
    }

    console.log(`[scraper] ${institution}: ${results.length} listings (Tradespace Playwright)`);
    return results;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[scraper] ${institution} Tradespace Playwright failed: ${msg}`);
    return [];
  } finally {
    await browser?.close();
  }
}

export function createTradescapeScraper(
  subdomain: string,
  institution: string
): InstitutionScraper {
  return {
    institution,
    scraperType: "playwright",
    async probe(maxResults = 3): Promise<ScrapedListing[]> {
      const results = await playwrightScrapeSubdomain(subdomain, institution);
      return results.slice(0, maxResults);
    },
    async scrape(): Promise<ScrapedListing[]> {
      return playwrightScrapeSubdomain(subdomain, institution);
    },
  };
}

export const gladstoneScraper = createTradescapeScraper(
  "gladstone",
  "Gladstone Institutes"
);
