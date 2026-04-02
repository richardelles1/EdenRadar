import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const INST = "Max Planck Innovation";
const DOMAINS = [
  "https://www.max-planck-innovation.com",
  "https://www.max-planck-innovation.de",
];

const BIOTECH_CATEGORIES = [
  "medicine",
  "nucleic-acid-protein-and-cell-related-technologies",
  "processes-and-methods-incl-screening",
  "research-tools",
  "green-biotech",
  "imaging-microscopy",
];

const MAX_OFFERS = 60;
const LISTING_TIMEOUT_MS = 10_000;
const DETAIL_TIMEOUT_MS = 8_000;
const DETAIL_CONCURRENCY = 3;

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#40;/g, "(")
    .replace(/&#41;/g, ")")
    .replace(/&#38;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

function extractOffersFromHtml(
  html: string
): { title: string; slug: string }[] {
  const offers: { title: string; slug: string }[] = [];
  const seen = new Set<string>();

  const catPattern = /<a[^>]+href="technology-offers\/technology-offer\/([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = catPattern.exec(html)) !== null) {
    const slug = match[1];
    const title = decodeHtmlEntities(match[2]);
    if (title && title.length >= 5 && !seen.has(slug)) {
      seen.add(slug);
      offers.push({ title, slug });
    }
  }

  if (offers.length === 0) {
    const homePattern = /<h3>([^<]+)<\/h3>\s*<p><a href="technology-offers\/technology-offer\/([^"]+)">[^<]*<\/a><\/p>/gi;
    while ((match = homePattern.exec(html)) !== null) {
      const title = decodeHtmlEntities(match[1]);
      const slug = match[2];
      if (title && title.length >= 5 && !seen.has(slug)) {
        seen.add(slug);
        offers.push({ title, slug });
      }
    }
  }

  return offers;
}

async function fetchPageHtml(url: string, signal?: AbortSignal): Promise<string | null> {
  if (signal?.aborted) return null;
  try {
    const combined = signal
      ? AbortSignal.any([AbortSignal.timeout(LISTING_TIMEOUT_MS), signal])
      : AbortSignal.timeout(LISTING_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: combined,
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

export const maxPlanckScraper: InstitutionScraper = {
  institution: INST,
  async scrape(signal?: AbortSignal): Promise<ScrapedListing[]> {
    const seen = new Set<string>();
    const allOffers: { title: string; slug: string; category?: string }[] = [];
    let workingBase = DOMAINS[0];

    for (const base of DOMAINS) {
      if (signal?.aborted) break;
      for (const category of BIOTECH_CATEGORIES) {
        if (signal?.aborted) break;
        const paths = [
          `${base}/technology-offers/${category}.html`,
          `${base}/en/technology-offers/${category}.html`,
        ];
        for (const catUrl of paths) {
          if (signal?.aborted) break;
          try {
            const html = await fetchPageHtml(catUrl, signal);
            if (!html) continue;
            const offers = extractOffersFromHtml(html);
            for (const o of offers) {
              if (!seen.has(o.slug)) {
                seen.add(o.slug);
                allOffers.push({ ...o, category });
                workingBase = base;
              }
            }
            if (offers.length > 0) break;
          } catch {
            continue;
          }
        }
      }
      if (allOffers.length > 0) break;
    }

    if (allOffers.length === 0 && !signal?.aborted) {
      for (const base of DOMAINS) {
        if (signal?.aborted) break;
        for (const path of [`${base}/`, `${base}/en/`]) {
          if (signal?.aborted) break;
          try {
            const html = await fetchPageHtml(path, signal);
            if (!html) continue;
            const offers = extractOffersFromHtml(html);
            for (const o of offers) {
              if (!seen.has(o.slug)) {
                seen.add(o.slug);
                allOffers.push(o);
                workingBase = base;
              }
            }
            if (allOffers.length > 0) break;
          } catch {
            continue;
          }
        }
        if (allOffers.length > 0) break;
      }
    }

    if (allOffers.length === 0) {
      console.log(`[scraper] ${INST}: 0 tech offers found`);
      return [];
    }

    const capped = allOffers.slice(0, MAX_OFFERS);
    const skipped = allOffers.length - capped.length;
    if (skipped > 0) {
      console.log(`[scraper] ${INST}: capping detail fetches at ${MAX_OFFERS} (${skipped} offers title-only)`);
    }

    const results: ScrapedListing[] = new Array(capped.length);
    const titleOnlyItems = allOffers.slice(MAX_OFFERS);

    for (let i = 0; i < capped.length; i += DETAIL_CONCURRENCY) {
      if (signal?.aborted) break;
      const batch = capped.slice(i, i + DETAIL_CONCURRENCY);
      await Promise.allSettled(
        batch.map(async ({ title, slug, category }, batchIdx) => {
          const idx = i + batchIdx;
          const detailPaths = [
            `${workingBase}/technology-offers/technology-offer/${slug}`,
            `${workingBase}/en/technology-offers/technology-offer/${slug}`,
          ];

          let description = title;
          let detailUrl = detailPaths[0];

          if (!signal?.aborted) {
            for (const dUrl of detailPaths) {
              if (signal?.aborted) break;
              try {
                const $ = await fetchHtml(dUrl, DETAIL_TIMEOUT_MS, signal, 1);
                if (!$) continue;
                const pageTitle = cleanText($("h1").first().text());
                if (
                  pageTitle &&
                  pageTitle.length > 10 &&
                  !pageTitle.includes("Technology Transfer for the Max Planck")
                ) {
                  const bodyText = cleanText(
                    $("main p")
                      .map((_, el) => $(el).text())
                      .get()
                      .join(" ")
                  ).slice(0, 2000);
                  if (bodyText && bodyText.length > 20) {
                    description = bodyText;
                    detailUrl = dUrl;
                    break;
                  }
                }
              } catch {
                continue;
              }
            }
          }

          results[idx] = {
            title,
            description,
            url: detailUrl,
            institution: INST,
            categories: category
              ? [category.replace(/-/g, " ").replace(/\bincl\b/g, "including")]
              : undefined,
          };
        })
      );
    }

    for (const { title, slug, category } of titleOnlyItems) {
      results.push({
        title,
        description: title,
        url: `${workingBase}/technology-offers/technology-offer/${slug}`,
        institution: INST,
        categories: category
          ? [category.replace(/-/g, " ").replace(/\bincl\b/g, "including")]
          : undefined,
      });
    }

    const finalResults = results.filter(Boolean);
    const enrichedCount = finalResults.filter(
      (r) => r.description !== r.title
    ).length;
    console.log(
      `[scraper] ${INST}: ${finalResults.length} listings (${enrichedCount} detail-enriched, ${BIOTECH_CATEGORIES.length} categories attempted, concurrency=${DETAIL_CONCURRENCY})`
    );
    return finalResults;
  },
};
