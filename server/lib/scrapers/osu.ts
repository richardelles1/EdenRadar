import type { InstitutionScraper, ScrapedListing } from "./types";
import type { CheerioAPI } from "cheerio";
import { fetchHtml, cleanText } from "./utils";

const INST = "Ohio State University";
const BASE = "https://innovate.osu.edu";
const LISTING_BASE = `${BASE}/available_technologies/`;
const DETAIL_CONCURRENCY = 8;

// Fallback category list used when dynamic discovery fails. Kept up-to-date
// manually, but the scraper always tries discovery first so new categories
// on the OSU site are picked up automatically.
const FALLBACK_CATEGORIES: { id: number; name: string }[] = [
  { id: 61665, name: "Clinical Area" },
  { id: 61784, name: "Life & Health Sciences" },
  { id: 61816, name: "Research & Development Tools" },
];

function extractTechUrls($: CheerioAPI): { id: string; url: string }[] {
  const results: { id: string; url: string }[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const match = href.match(/^\/available_technologies\/(\d+)\//);
    if (match) {
      results.push({ id: match[1], url: `${BASE}${href}` });
    }
  });
  return results;
}

// Detects whether a loaded page is the login wall (the portal went auth-only in 2025).
// Throws so the scheduler records a real failure and applies backoff, rather than
// silently returning rawCount=0 which shows as a false "ok/empty_response".
function assertNotLoginPage($: ReturnType<typeof import("cheerio").load>, context: string): void {
  const bodyText = $('body').text();
  const isLoginPage =
    $('input[type="password"]').length > 0 ||
    bodyText.includes("OSU Users") ||
    bodyText.includes("Non-OSU Users") ||
    bodyText.includes("Forgot Password") ||
    (bodyText.includes("Log In") && bodyText.includes("Technology Commercialization"));
  if (isLoginPage) {
    throw new Error("innovate.osu.edu requires login — portal moved behind authentication wall (detected at: " + context + ")");
  }
}

// Fetches the main listing page and parses category filter links to discover all
// active categories. Falls back to FALLBACK_CATEGORIES on failure so that a
// temporary OSU outage doesn't permanently break the scraper.
async function discoverCategories(): Promise<{ id: number; name: string }[]> {
  const $ = await fetchHtml(LISTING_BASE, 20_000);
  if (!$) {
    console.warn(`[scraper] ${INST}: could not load listing page for category discovery — using fallback`);
    return FALLBACK_CATEGORIES;
  }

  assertNotLoginPage($, LISTING_BASE);

  const cats: { id: number; name: string }[] = [];
  const seen = new Set<number>();

  $('a[href*="categoryId="]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const idMatch = href.match(/categoryId=(\d+)/);
    const nameMatch = href.match(/categoryName=([^&]+)/);
    if (idMatch && nameMatch) {
      const id = parseInt(idMatch[1], 10);
      const name = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
      if (!seen.has(id) && name.length > 0) {
        seen.add(id);
        cats.push({ id, name });
      }
    }
  });

  if (cats.length === 0) {
    console.warn(`[scraper] ${INST}: no category links found in page HTML — using fallback`);
    return FALLBACK_CATEGORIES;
  }

  console.log(`[scraper] ${INST}: discovered ${cats.length} categories: ${cats.map((c) => c.name).join(', ')}`);
  return cats;
}

// Fetches all listing URLs for a category using a doubling-limit strategy.
// Starts at limit=500 and doubles on each full page until the server returns
// fewer items than requested, meaning we have everything. Capped at 5 000 per
// request to avoid server timeouts on very large categories.
async function fetchCategoryListings(cat: { id: number; name: string }): Promise<string[]> {
  const seen = new Set<string>();
  const urls: string[] = [];
  let limit = 500;

  while (true) {
    const pageUrl = `${LISTING_BASE}?categoryId=${cat.id}&categoryName=${encodeURIComponent(cat.name)}&limit=${limit}`;
    const $ = await fetchHtml(pageUrl, 20_000);
    if (!$) {
      console.warn(`[scraper] ${INST}: ${cat.name} — fetch failed at limit=${limit}, stopping`);
      break;
    }

    assertNotLoginPage($, pageUrl);
    const found = extractTechUrls($);
    let newCount = 0;
    for (const item of found) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        urls.push(item.url);
        newCount++;
      }
    }

    console.log(`[scraper] ${INST}: ${cat.name} limit=${limit} → ${found.length} found, ${newCount} new`);

    if (found.length < limit) break; // received fewer than requested — have everything

    // Got a full page; double the limit and try again to capture any remaining items.
    // Cap at 5 000 to avoid requesting an unreasonably large page from OSU's server.
    if (limit >= 5000) {
      console.warn(`[scraper] ${INST}: ${cat.name} — hit limit ceiling at ${limit}, some items may be missing`);
      break;
    }
    limit = Math.min(limit * 2, 5000);
  }

  console.log(`[scraper] ${INST}: ${cat.name} → ${urls.length} total unique listings`);
  return urls;
}

async function fetchDetail(url: string): Promise<ScrapedListing | null> {
  const $ = await fetchHtml(url, 15_000);
  if (!$) return null;

  const title = cleanText($('.techSummaryContainer h2, .detailedDesc h2, h2').first().text())
    || cleanText($('h1').first().text())
    || cleanText($('.techSummaryContainer h3').first().text());

  if (!title) return null;

  const descParts: string[] = [];
  const sectionHeadings = ['The Need', 'The Technology', 'Commercial Applications', 'Benefits/Advantages', 'Overview', 'Description', 'Abstract', 'Summary'];

  $('.detailedDesc h2, .detailedDesc h3').each((_, heading) => {
    const headingText = cleanText($(heading).text());
    if (!sectionHeadings.some(s => headingText.includes(s))) return;

    let content = '';
    let sibling = $(heading).next();
    while (sibling.length && !sibling.is('h2, h3')) {
      content += ' ' + sibling.text();
      sibling = sibling.next();
    }
    const cleaned = cleanText(content);
    if (cleaned) {
      descParts.push(`${headingText}: ${cleaned}`);
    }
  });

  const description = descParts.join('\n\n');

  let techId = '';
  let inventors: string[] = [];
  let categories: string[] = [];
  let contactEmail = '';

  $('.techSummaryMetadata h3').each((_, heading) => {
    const label = cleanText($(heading).text());

    if (label.includes('Tech ID')) {
      const nextP = $(heading).next('p');
      if (nextP.length) {
        techId = cleanText(nextP.text());
      }
    }

    if (label.includes('Inventor')) {
      $(heading).nextAll('div').first().find('li a').each((_, a) => {
        const t = cleanText($(a).text());
        if (t && t.length > 1) inventors.push(t);
      });
      if (inventors.length === 0) {
        $(heading).nextAll('div').first().find('a').each((_, a) => {
          const t = cleanText($(a).text());
          if (t && t.length > 1) inventors.push(t);
        });
      }
    }

    if (label.includes('Categor')) {
      const catSet = new Set<string>();
      $(heading).nextAll('div').first().find('li a').each((_, a) => {
        const t = cleanText($(a).text());
        if (t && t.length > 1 && !catSet.has(t)) {
          catSet.add(t);
          categories.push(t);
        }
      });
      if (categories.length === 0) {
        $(heading).nextAll('div').first().find('a').each((_, a) => {
          const t = cleanText($(a).text());
          if (t && t.length > 1 && !catSet.has(t)) {
            catSet.add(t);
            categories.push(t);
          }
        });
      }
    }

    if (label.includes('Licensing Manager')) {
      const block = $(heading).nextAll('div, p').first();
      const blockHtml = block.html() ?? '';
      const emailMatch = blockHtml.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) contactEmail = emailMatch[0];
    }
  });

  if (!techId) {
    const bodyText = $('body').text();
    const idMatch = bodyText.match(/Tech ID\s+([A-Z0-9][\w-]+)/i);
    if (idMatch) techId = idMatch[1];
  }

  if (!contactEmail) {
    const bodyHtml = $('body').html() ?? '';
    const emailMatch = bodyHtml.match(/([\w.-]+@(?:osu|ohio-state)\.edu)/i);
    if (emailMatch) contactEmail = emailMatch[1];
  }

  return {
    title,
    description: description || cleanText($('.detailedDesc').text()).slice(0, 2000),
    url,
    institution: INST,
    technologyId: techId || undefined,
    inventors: inventors.length > 0 ? inventors : undefined,
    categories: categories.length > 0 ? categories : undefined,
    contactEmail: contactEmail || undefined,
  };
}

export const osuScraper: InstitutionScraper = {
  institution: INST,
  // innovate.osu.edu moved behind authentication in 2025 — every page now
  // redirects to a login wall. Stubbed to stop wasting 20-min scrape slots.
  // Re-enable (remove scraperType: "stub") if OSU re-opens the public catalog
  // or we obtain API credentials. Login detection in discoverCategories() and
  // fetchCategoryListings() will surface a clear error if the scraper is re-enabled.
  scraperType: "stub",
  scraperTimeoutMs: 20 * 60 * 1000,

  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: STUB — innovate.osu.edu requires login, no public catalog available`);
    return [];
  },
};
