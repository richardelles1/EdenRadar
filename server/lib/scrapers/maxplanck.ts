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
  const pattern = /<h3>([^<]+)<\/h3>\s*<p><a href="technology-offers\/technology-offer\/([^"]+)">[^<]*<\/a><\/p>/gi;
  const offers: { title: string; slug: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const title = decodeHtmlEntities(match[1]);
    const slug = match[2];
    if (title && title.length >= 5) {
      offers.push({ title, slug });
    }
  }
  return offers;
}

async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

export const maxPlanckScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    const seen = new Set<string>();
    const allOffers: { title: string; slug: string; category?: string }[] = [];
    let workingBase = DOMAINS[0];

    for (const base of DOMAINS) {
      for (const category of BIOTECH_CATEGORIES) {
        const paths = [
          `${base}/en/technology-offers/${category}.html`,
          `${base}/technology-offers/${category}.html`,
        ];
        for (const catUrl of paths) {
          try {
            const html = await fetchPageHtml(catUrl);
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

    if (allOffers.length === 0) {
      for (const base of DOMAINS) {
        for (const path of [`${base}/`, `${base}/en/`]) {
          try {
            const html = await fetchPageHtml(path);
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

    const results: ScrapedListing[] = [];

    for (const { title, slug, category } of allOffers) {
      const detailPaths = [
        `${workingBase}/technology-offers/technology-offer/${slug}`,
        `${workingBase}/en/technology-offers/technology-offer/${slug}`,
      ];

      let description = title;
      let detailUrl = detailPaths[0];
      let enriched = false;

      for (const dUrl of detailPaths) {
        try {
          const $ = await fetchHtml(dUrl, 12_000);
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
              enriched = true;
              break;
            }
          }
        } catch {
          continue;
        }
      }

      results.push({
        title,
        description,
        url: detailUrl,
        institution: INST,
        categories: category
          ? [category.replace(/-/g, " ").replace(/\bincl\b/g, "including")]
          : undefined,
      });
    }

    const enrichedCount = results.filter(
      (r) => r.description !== r.title
    ).length;
    console.log(
      `[scraper] ${INST}: ${results.length} listings (${enrichedCount} detail-enriched, ${BIOTECH_CATEGORIES.length} categories attempted)`
    );
    return results;
  },
};
