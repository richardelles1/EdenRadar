import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const INST = "Memorial Sloan Kettering Cancer Center";
const BASE = "https://www.mskcc.org";
const LISTING_URL = `${BASE}/commercialization/partnering/technologies-available-licensing`;

const TOP_LEVEL_INDICATIONS = [
  "2365", "2366", "2367", "2370", "2368", "2369", "2395",
];

function extractCards(
  $: ReturnType<typeof import("cheerio").load>,
  seen: Set<string>,
  results: ScrapedListing[]
): number {
  let found = 0;
  $(".msk-baseball-card--technology").each((_, el) => {
    const $card = $(el);
    const anchor = $card.find("a.msk-baseball-card__heading");
    const title = cleanText(
      anchor.text() || $card.find(".msk-baseball-card__heading").text()
    );
    const href =
      anchor.attr("href") ??
      $card.find("a[href*='/research-advantage/']").attr("href") ??
      "";
    const techId = cleanText(
      $card.find(".msk-baseball-card__eyebrow-text").text()
    );

    if (!title || title.length < 5) return;
    if (!href || !href.startsWith("/")) return;

    const fullUrl = `${BASE}${href}`;
    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    const categories: string[] = [];
    $card.find(".msk-list li").each((_, li) => {
      const cat = cleanText($(li).text());
      if (cat) categories.push(cat);
    });

    results.push({
      title,
      description: title,
      url: fullUrl,
      institution: INST,
      technologyId: techId || undefined,
      categories: categories.length > 0 ? categories : undefined,
    });
    found++;
  });
  return found;
}

async function paginateListing(
  baseUrl: string,
  seen: Set<string>,
  results: ScrapedListing[],
  maxPages = 30
): Promise<number> {
  let total = 0;
  for (let page = 0; page < maxPages; page++) {
    try {
      const url = page === 0 ? baseUrl : `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}page=${page}`;
      const $ = await fetchHtml(url, 15_000);
      if (!$) break;
      const found = extractCards($, seen, results);
      total += found;
      if (found === 0) break;
    } catch {
      break;
    }
  }
  return total;
}

export const mskScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    const results: ScrapedListing[] = [];
    const seen = new Set<string>();

    const mainCount = await paginateListing(LISTING_URL, seen, results);
    console.log(`[scraper] ${INST}: main listing → ${mainCount} technologies`);

    for (const tid of TOP_LEVEL_INDICATIONS) {
      try {
        const filterUrl = `${LISTING_URL}?field_indication_tid=${tid}`;
        const count = await paginateListing(filterUrl, seen, results);
        if (count > 0) {
          console.log(`[scraper] ${INST}: indication ${tid} → ${count} new technologies`);
        }
      } catch {}
    }

    if (results.length > 0) {
      console.log(`[scraper] ${INST}: enriching ${results.length} detail pages...`);
      const BATCH = 5;
      for (let i = 0; i < results.length; i += BATCH) {
        await Promise.all(
          results.slice(i, i + BATCH).map(async (item) => {
            try {
              const $ = await fetchHtml(item.url, 12_000);
              if (!$) return;
              const desc = cleanText(
                $(".field--name-body").text() ||
                $(".msk-article__body").text() ||
                $("main p").first().text()
              );
              if (desc && desc.length > item.description.length) {
                item.description = desc.slice(0, 2000);
              }
            } catch {}
          })
        );
      }
    }

    console.log(`[scraper] ${INST}: ${results.length} listings (paginated + filter sweep, detail-enriched)`);
    return results;
  },
};
