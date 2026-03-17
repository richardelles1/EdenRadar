import type { InstitutionScraper, ScrapedListing } from "./types";
import { cleanText } from "./utils";

const INST = "Georgia Institute of Technology";
const BASE = "https://gatech.flintbox.com";

// Flintbox API returns {"errors":"404"} for all parameter variants tested.
// The gatech.flintbox.com React SPA cannot be scraped via static fetchHtml.
// Primary strategy: Playwright traversal of /technologies with Next-button pagination.
// Fallback: auto-discover credentials from page HTML and call Flintbox JSON API.

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
  attributes?: FlintboxAttr;
}

interface FlintboxMeta {
  totalPages?: number;
}

interface FlintboxResponse {
  data?: FlintboxTech[];
  meta?: FlintboxMeta;
}

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
    // Wait for the first technology card link to be visible before extracting.
    await page.waitForSelector('a[href*="/technologies/"]', { state: "visible", timeout: 30_000 });

    const allLinks = new Map<string, string>();

    const collectPage = async () => {
      const links = await page.$$eval('a[href*="/technologies/"]', (els) =>
        els.map((el) => {
          const href = el.getAttribute("href") ?? "";
          const h2 = el.querySelector("h2");
          const title = h2 ? (h2.textContent?.trim() ?? "") : "";
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

    for (let pg = 2; pg <= 50; pg++) {
      const nextBtn = await page.$('button[title="Next"]');
      if (!nextBtn) break;
      const isDisabled = await nextBtn.evaluate(
        (el) =>
          el.hasAttribute("disabled") ||
          el.classList.contains("Mui-disabled") ||
          el.getAttribute("aria-disabled") === "true"
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

async function discoverCredentials(): Promise<{ orgId: number; accessKey: string } | null> {
  try {
    const res = await fetch(BASE, {
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
      if (!res.ok) break;
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
          .join(" ");
        results.push({
          title,
          description: keyPoints,
          url: techUrl,
          institution: INST,
          publishedDate: attrs.publishedOn,
        });
      }
    } catch {
      break;
    }
    page++;
  }
  return results;
}

export const gatechScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    const pwResults = await playwrightScrape();
    if (pwResults.length > 0) {
      console.log(`[scraper] ${INST}: ${pwResults.length} listings via Playwright`);
      return pwResults;
    }

    console.log(`[scraper] ${INST}: Playwright returned 0 — attempting API fallback`);
    const creds = await discoverCredentials();
    const orgId = creds?.orgId ?? 186;
    const accessKey = creds?.accessKey ?? "803ec38e-0986-4610-af3c-fbb9084a1a43";
    const apiResults = await apiScrape(orgId, accessKey);
    console.log(`[scraper] ${INST}: ${apiResults.length} listings via API fallback`);
    return apiResults;
  },
};
