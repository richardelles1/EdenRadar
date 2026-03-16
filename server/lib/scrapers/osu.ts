import type { InstitutionScraper, ScrapedListing } from "./types";
import type { CheerioAPI } from "cheerio";
import { fetchHtml, cleanText } from "./utils";

const INST = "Ohio State University";
const BASE = "https://innovate.osu.edu";
const LISTING_BASE = `${BASE}/available_technologies/`;
const PAGE_SIZE = 20;
const MAX_PAGES = 50;
const DETAIL_CONCURRENCY = 4;

const CATEGORIES: { id: number; name: string }[] = [
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

async function fetchCategoryListings(cat: { id: number; name: string }): Promise<string[]> {
  const seen = new Set<string>();
  const urls: string[] = [];
  let offset = 0;
  let pageNum = 0;

  while (pageNum < MAX_PAGES) {
    const pageUrl = `${LISTING_BASE}?categoryId=${cat.id}&categoryName=${encodeURIComponent(cat.name)}&limit=${PAGE_SIZE}&offset=${offset}`;
    const $ = await fetchHtml(pageUrl, 15_000);
    if (!$) break;

    const found = extractTechUrls($);
    if (found.length === 0) break;

    let newCount = 0;
    for (const item of found) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        urls.push(item.url);
        newCount++;
      }
    }

    if (newCount === 0) {
      console.log(`[scraper] ${INST}: ${cat.name} page ${pageNum + 1} (offset=${offset}) yielded no new IDs, stopping`);
      break;
    }

    pageNum++;
    offset += PAGE_SIZE;
  }

  console.log(`[scraper] ${INST}: ${cat.name} crawled ${pageNum} page(s), ${urls.length} unique listings`);
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

  $('.techSummaryMetadata h3, .techSummaryMetadata strong').each((_, heading) => {
    const label = cleanText($(heading).text());
    const sibling = $(heading).next();

    if (label.includes('Tech ID')) {
      const text = cleanText(sibling.text());
      if (text) techId = text;
      else {
        let nextEl = $(heading).next();
        while (nextEl.length && !nextEl.is('h3, strong')) {
          const t = cleanText(nextEl.text());
          if (t) { techId = t; break; }
          nextEl = nextEl.next();
        }
      }
    }

    if (label.includes('Inventor')) {
      let nextEl = $(heading).next();
      while (nextEl.length && !nextEl.is('h3, strong')) {
        const t = cleanText(nextEl.text());
        if (t && t.length > 1) inventors.push(t);
        nextEl = nextEl.next();
      }
    }

    if (label.includes('Categor')) {
      let nextEl = $(heading).next();
      while (nextEl.length && !nextEl.is('h3, strong')) {
        const t = cleanText(nextEl.text());
        if (t && t.length > 1) categories.push(t);
        nextEl = nextEl.next();
      }
    }

    if (label.includes('Licensing Manager')) {
      const emailMatch = sibling.html()?.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) contactEmail = emailMatch[0];
      if (!contactEmail) {
        let nextEl = $(heading).next();
        while (nextEl.length && !nextEl.is('h3, strong')) {
          const em = nextEl.html()?.match(/[\w.-]+@[\w.-]+\.\w+/);
          if (em) { contactEmail = em[0]; break; }
          nextEl = nextEl.next();
        }
      }
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

  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: collecting listings from ${CATEGORIES.length} categories...`);

    const allUrls = new Set<string>();
    for (const cat of CATEGORIES) {
      const urls = await fetchCategoryListings(cat);
      console.log(`[scraper] ${INST}: ${cat.name} → ${urls.length} listings`);
      for (const u of urls) allUrls.add(u);
    }

    console.log(`[scraper] ${INST}: ${allUrls.size} unique listings, fetching details...`);

    const urlList = Array.from(allUrls);
    const listings: ScrapedListing[] = [];

    for (let i = 0; i < urlList.length; i += DETAIL_CONCURRENCY) {
      const batch = urlList.slice(i, i + DETAIL_CONCURRENCY);
      const results = await Promise.all(batch.map(fetchDetail));
      for (const r of results) {
        if (r) listings.push(r);
      }
    }

    console.log(`[scraper] ${INST}: scraped ${listings.length} listings with details`);
    return listings;
  },

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: probe — fetching first page of Clinical Area...`);
    const urls = await fetchCategoryListings(CATEGORIES[0]);
    const subset = urls.slice(0, maxResults);
    const results = await Promise.all(subset.map(fetchDetail));
    return results.filter((r): r is ScrapedListing => r !== null);
  },
};
