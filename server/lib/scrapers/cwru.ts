import type { InstitutionScraper, ScrapedListing } from "./types";
import { cleanText } from "./utils";

const INST = "Case Western Reserve University";
const BASE = "https://case.flintbox.com";

interface FlintboxAttr {
  uuid?: string;
  name?: string;
  keyPoint1?: string;
  keyPoint2?: string;
  keyPoint3?: string;
  publishedOn?: string;
}

interface FlintboxTech {
  id?: string;
  type?: string;
  attributes?: FlintboxAttr;
}

interface FlintboxMeta {
  totalPages?: number;
  currentPage?: number;
  nextPage?: number | null;
}

interface FlintboxResponse {
  data?: FlintboxTech[];
  meta?: FlintboxMeta;
}

interface OrgResponse {
  data?: {
    attributes?: {
      technologiesCount?: number;
    };
  };
}

// ── Strategy 1: Playwright traversal of /technologies with JS pagination ──────
async function playwrightScrape(): Promise<ScrapedListing[]> {
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
    });

    await page.goto(`${BASE}/technologies`, { timeout: 45_000, waitUntil: "networkidle" });
    await page.waitForTimeout(4_000);

    const allLinks = new Map<string, string>();

    const collectPage = async () => {
      const links = await page.$$eval('a[href*="/technologies/"]', (els) =>
        els.map((el) => {
          const href = el.getAttribute("href") ?? "";
          // Title is in the h2 inside the card
          const h2 = el.querySelector("h2");
          const title = h2 ? (h2.textContent?.trim() ?? "") : "";
          // Description is in the list items (key points)
          const listItems = Array.from(el.querySelectorAll("li"));
          const desc = listItems
            .map((li) => li.textContent?.trim() ?? "")
            .filter((s) => s.length > 0)
            .join(" ");
          return { href, title, desc };
        })
      );
      for (const l of links) {
        if (!l.href || !l.title || l.title.length < 5 || allLinks.has(l.href)) continue;
        allLinks.set(l.href, l.title + (l.desc ? "\x00" + l.desc : ""));
      }
    };

    await collectPage();

    // Paginate by clicking the Next button (title="Next") until disabled or no new links
    for (let pg = 2; pg <= 30; pg++) {
      const nextBtn = await page.$('button[title="Next"]');
      if (!nextBtn) break;
      const isDisabled = await nextBtn.evaluate(
        (el) => el.hasAttribute("disabled") || el.classList.contains("Mui-disabled") || el.getAttribute("aria-disabled") === "true"
      );
      if (isDisabled) break;

      const prevSize = allLinks.size;
      await nextBtn.click();
      await page.waitForTimeout(2_500);
      await collectPage();
      if (allLinks.size === prevSize) break;
    }

    const results: ScrapedListing[] = [];
    for (const [href, raw] of Array.from(allLinks.entries())) {
      const sepIdx = raw.indexOf("\x00");
      const title = sepIdx >= 0 ? raw.substring(0, sepIdx) : raw;
      const description = sepIdx >= 0 ? raw.substring(sepIdx + 1) : "";
      const fullUrl = href.startsWith("http") ? href : `${BASE}${href}`;
      results.push({ title, description, url: fullUrl, institution: INST });
    }
    return results;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[scraper] ${INST} Playwright failed: ${msg}`);
    return [];
  } finally {
    await browser?.close();
  }
}

// ── Strategy 2: Flintbox JSON API (fallback if Playwright yields 0) ───────────
async function apiScrape(orgId: number, accessKey: string): Promise<ScrapedListing[]> {
  const results: ScrapedListing[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const url =
      `${BASE}/api/v1/technologies` +
      `?organizationId=${orgId}` +
      `&organizationAccessKey=${accessKey}` +
      `&page=${page}` +
      `&query=`;

    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        console.error(`[scraper] ${INST}: API returned ${res.status} on page ${page}`);
        break;
      }
      const json: FlintboxResponse = await res.json();
      totalPages = json.meta?.totalPages ?? 1;

      for (const item of json.data ?? []) {
        const attrs = item.attributes;
        if (!attrs) continue;
        const title = cleanText(attrs.name ?? "");
        if (!title || title.length < 5) continue;
        const uuid = attrs.uuid ?? item.id ?? "";
        const techUrl = uuid ? `${BASE}/technologies/${uuid}` : `${BASE}/technologies`;
        const keyPoints = (
          [attrs.keyPoint1, attrs.keyPoint2, attrs.keyPoint3] as Array<string | undefined>
        )
          .filter((s): s is string => typeof s === "string" && s.length > 0)
          .map((s) => cleanText(s))
          .filter((s) => s.length > 0)
          .join(" ");

        results.push({
          title,
          description: keyPoints,
          url: techUrl,
          institution: INST,
          publishedDate: attrs.publishedOn,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] ${INST}: API fetch error on page ${page}: ${msg}`);
      break;
    }
    page++;
  }
  return results;
}

// ── Discover Flintbox orgId + accessKey from page HTML ────────────────────────
async function discoverApiCredentials(): Promise<{ orgId: number; accessKey: string } | null> {
  try {
    const res = await fetch(`${BASE}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const idMatch = html.match(/data-organization-id="(\d+)"/);
    const keyMatch = html.match(/data-organization-access-key="([^"]+)"/);
    if (!idMatch || !keyMatch) return null;
    const orgId = parseInt(idMatch[1], 10);
    if (isNaN(orgId)) return null;
    return { orgId, accessKey: keyMatch[1] };
  } catch {
    return null;
  }
}

export const cwruScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    // Primary: Playwright traversal of /technologies with Next-button pagination
    const pwResults = await playwrightScrape();
    if (pwResults.length > 0) {
      console.log(`[scraper] ${INST}: ${pwResults.length} listings via Playwright`);
      return pwResults;
    }

    // Fallback: Flintbox JSON API (auto-discover credentials from page HTML)
    console.log(`[scraper] ${INST}: Playwright returned 0 — attempting API fallback`);
    const creds = await discoverApiCredentials();
    const orgId = creds?.orgId ?? 58;
    const accessKey = creds?.accessKey ?? "a1712fca-3f6b-4805-8024-9846e4c13a10";

    const apiResults = await apiScrape(orgId, accessKey);
    console.log(`[scraper] ${INST}: ${apiResults.length} listings via Flintbox API fallback`);
    return apiResults;
  },
};
