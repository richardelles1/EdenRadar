import type { InstitutionScraper, ScrapedListing } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

function extractListingAnchors(
  baseUrl: string
): Array<{ href: string; title: string; description: string }> {
  const results: Array<{ href: string; title: string; description: string }> = [];
  const seen = new Set<string>();

  const add = (href: string, title: string, description = "") => {
    const full = href.startsWith("http") ? href : `${baseUrl}${href}`;
    if (seen.has(full) || title.length < 5) return;
    seen.add(full);
    results.push({ href: full, title, description });
  };

  const extractFromEl = (el: Element) => {
    const anchor = el.tagName === "A" ? (el as HTMLAnchorElement) : el.querySelector("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    if (!href) return;
    const heading = el.querySelector(
      "h1, h2, h3, h4, [class*='title'], [class*='Title'], [class*='name'], [class*='Name']"
    );
    const title = (heading?.textContent ?? anchor.textContent ?? "").trim();
    const pTags = Array.from(
      el.querySelectorAll("p, [class*='description'], [class*='Description'], [class*='snippet'], [class*='Snippet']")
    );
    const description = pTags
      .map((p) => p.textContent?.trim() ?? "")
      .filter((s) => s.length > 0)
      .join(" ")
      .substring(0, 500);
    add(href, title, description);
  };

  // ── Pass 1: Tradespace-specific listing URL patterns ──────────────────────
  // Tradespace listing URLs follow: /listings/{slug}, /market/listings/{id}, etc.
  const tradespaceAnchors = Array.from(
    document.querySelectorAll(
      'a[href*="/listings/"], a[href*="/listing/"], a[href*="/opportunities/"], a[href*="/opportunity/"]'
    )
  );
  for (const a of tradespaceAnchors) {
    const href = (a as HTMLAnchorElement).getAttribute("href") ?? "";
    const parentCard = a.closest('[class*="card"], [class*="Card"], [class*="item"], [class*="Item"], article, li')
      ?? a;
    const heading = parentCard.querySelector(
      "h1, h2, h3, h4, [class*='title'], [class*='Title'], [class*='name'], [class*='Name']"
    );
    const title = (heading?.textContent ?? a.textContent ?? "").trim();
    const pTags = Array.from(
      parentCard.querySelectorAll("p, [class*='description'], [class*='Description']")
    );
    const description = pTags
      .map((p) => p.textContent?.trim() ?? "")
      .filter((s) => s.length > 0)
      .join(" ")
      .substring(0, 500);
    add(href, title, description);
  }

  if (results.length >= 2) return results;

  // ── Pass 2: Card/article-based extraction ────────────────────────────────
  const cardSelectors = [
    '[class*="TechCard"]',
    '[class*="tech-card"]',
    '[class*="ListingCard"]',
    '[class*="listing-card"]',
    '[class*="OpportunityCard"]',
    '[class*="MarketCard"]',
    '[class*="card"]',
    '[class*="Card"]',
    "article",
    "li[class]",
  ];

  for (const sel of cardSelectors) {
    const els = Array.from(document.querySelectorAll(sel));
    for (const el of els) extractFromEl(el);
    if (results.length >= 2) break;
  }

  return results;
}

async function playwrightScrapeSubdomain(
  subdomain: string,
  institution: string,
  opts: { classificationId?: number } = {}
): Promise<ScrapedListing[]> {
  const base = `https://${subdomain}.tradespacemarket.com`;
  let browser: import("playwright").Browser | null = null;

  const buildUrl = (path: string, classId?: number) => {
    const url = `${base}${path}`;
    return classId ? `${url}?level_1_classification_id=${classId}` : url;
  };

  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ "User-Agent": UA });

    const allItems = new Map<string, string>();

    const collectFromPage = async () => {
      const items: Array<{ href: string; title: string; description: string }> =
        await page.evaluate(extractListingAnchors, base);
      for (const item of items) {
        if (!allItems.has(item.href)) {
          allItems.set(
            item.href,
            item.title + (item.description ? "\x00" + item.description : "")
          );
        }
      }
    };

    const paginateAndCollect = async () => {
      await collectFromPage();

      for (let pg = 0; pg < 30; pg++) {
        const prevSize = allItems.size;

        const loadMoreBtn = await page.$(
          'button:has-text("Load More"), button:has-text("Show More"), ' +
          'button:has-text("Next"), [aria-label="Next page"], ' +
          '[class*="load-more"], [class*="LoadMore"]'
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
        await collectFromPage();

        if (allItems.size === prevSize) break;
      }
    };

    // ── Attempt 1: Root page (unfiltered) ───────────────────────────────────
    await page.goto(buildUrl("/"), { timeout: 60_000, waitUntil: "networkidle" });
    await page.waitForTimeout(3_500);
    await paginateAndCollect();

    // ── Attempt 2: /market subpath if root yielded nothing ──────────────────
    if (allItems.size === 0) {
      await page.goto(buildUrl("/market"), { timeout: 30_000, waitUntil: "networkidle" });
      await page.waitForTimeout(3_000);
      await paginateAndCollect();
    }

    // ── Attempt 3: Life-sciences filter (classification_id=7) ───────────────
    // Use when unfiltered results are noisy (>100) or still empty.
    const lifeSciId = opts.classificationId ?? 7;
    if (allItems.size === 0 || allItems.size > 100) {
      const preFilterSize = allItems.size;
      const filteredItems = new Map<string, string>();

      await page.goto(buildUrl("/", lifeSciId), { timeout: 30_000, waitUntil: "networkidle" });
      await page.waitForTimeout(3_000);

      const rawItems: Array<{ href: string; title: string; description: string }> =
        await page.evaluate(extractListingAnchors, base);
      for (const item of rawItems) {
        filteredItems.set(
          item.href,
          item.title + (item.description ? "\x00" + item.description : "")
        );
      }

      if (filteredItems.size > 0 && (preFilterSize === 0 || filteredItems.size < preFilterSize)) {
        console.log(
          `[scraper] ${institution}: life-sciences filter (level_1_classification_id=${lifeSciId}) ` +
          `narrowed ${preFilterSize} → ${filteredItems.size} results`
        );
        for (const [k, v] of filteredItems.entries()) {
          if (!allItems.has(k)) allItems.set(k, v);
        }
      }
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
  institution: string,
  opts: { classificationId?: number } = {}
): InstitutionScraper {
  return {
    institution,
    scraperType: "playwright",
    async probe(maxResults = 3): Promise<ScrapedListing[]> {
      const results = await playwrightScrapeSubdomain(subdomain, institution, opts);
      return results.slice(0, maxResults);
    },
    async scrape(): Promise<ScrapedListing[]> {
      return playwrightScrapeSubdomain(subdomain, institution, opts);
    },
  };
}

export const gladstoneScraper = createTradescapeScraper(
  "gladstone",
  "Gladstone Institutes"
);
