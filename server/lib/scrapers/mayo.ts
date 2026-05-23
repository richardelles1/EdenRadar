import * as cheerio from "cheerio";
import type { InstitutionScraper, ScrapedListing } from "./types";
import { cleanText } from "./utils";

const INST = "Mayo Clinic";

// ─────────────────────────────────────────────────────────────────────────────
// Mayo Clinic Business Development — site audit (May 2026)
// ─────────────────────────────────────────────────────────────────────────────
//
// Discovery strategy (in order):
//   1. WP sitemap — /wp-sitemap.xml (WordPress 5.5+) lists every published page.
//      We fetch it, filter to likely-tech URLs, and parse each with the existing
//      individual-tech / biopharma parsers.  Parser returns null for thin pages
//      (no real title/description), so trying all candidates is safe.
//   2. WP REST pages API — /wp-json/wp/v2/pages?per_page=100 returns all pages
//      with slugs + titles, letting us pre-filter before fetching each page.
//   3. Hardcoded fallback — the 12 URLs confirmed during the May 2026 manual
//      audit, used if both dynamic methods return fewer than 5 results.
//
// Confirmed real-asset paths (still valid as of May 2026):
//   /collaborate/biopharmaceuticals/  — 9 biopharma technologies (Elementor layout)
//   /houses-platform/, /best-next-drug-migraine-algorithm/, etc.
//   /copyrighted-materials/           — COA tools catalog
//   /impact-stories/q-hdmi/, /impact-stories/maggies-pearl/, etc.
//
// Intentionally excluded (redirect to images or generic marketing):
//   /collaborate/medical-devices/, /collaborate/research-tools/,
//   /collaborate/devices/, /collaborate/data/, /collaborate/digital/
//   WP REST `dt_portfolio` and `posts` endpoints — return zero items.
//
// Note: The Mayo site WAF blocks the full Chrome UA from cloud IPs;
// a lightweight Mozilla-compatible UA returns HTTP 200 successfully.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://businessdevelopment.mayoclinic.org";

const BIOPHARMA_URL = `${BASE}/collaborate/biopharmaceuticals/`;

// Known-good pages from manual audit — used as fallback if dynamic discovery fails.
const HARDCODED_PAGES: Array<{ url: string; category: string }> = [
  { url: `${BASE}/houses-platform/`, category: "individual" },
  { url: `${BASE}/best-next-drug-migraine-algorithm/`, category: "individual" },
  { url: `${BASE}/pellikka-hfpef-aik/`, category: "individual" },
  { url: `${BASE}/uc-score/`, category: "individual" },
  { url: `${BASE}/copyrighted-materials/`, category: "copyrighted-material" },
  { url: `${BASE}/impact-stories/q-hdmi/`, category: "impact-story" },
  { url: `${BASE}/impact-stories/maggies-pearl/`, category: "impact-story" },
  { url: `${BASE}/impact-stories/stem-cell-therapy-for-perianal-fistulas/`, category: "impact-story" },
  { url: `${BASE}/impact-stories/vyriad/`, category: "impact-story" },
  { url: `${BASE}/impact-stories/magnetic-resonance-elastography/`, category: "impact-story" },
  { url: `${BASE}/impact-stories/remote-ecg-patient-monitoring/`, category: "impact-story" },
  { url: `${BASE}/impact-stories/phage-therapy/`, category: "impact-story" },
];

// Path patterns that are known-non-tech pages — excluded from dynamic discovery.
const EXCLUDE_PATHS = [
  /^\/$/,
  /\/(about|contact|press|events|resources|privacy|terms|careers|sitemap|feed|author|tag|category)\b/i,
  /\/wp-(admin|content|includes|json|login)\b/,
  /\.(jpg|jpeg|png|gif|svg|pdf|zip|mp4)(\?|$)/i,
  // Confirmed image/redirect URLs from manual audit
  /\/collaborate\/(medical-devices|research-tools|devices|data|digital)\//,
  /\/technology-licensing\/?$/,
  // Generic page number slugs
  /\/page\/\d+/,
];

function isLikelyTechUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return !EXCLUDE_PATHS.some((re) => re.test(path));
  } catch {
    return false;
  }
}

function categoryForUrl(url: string): string {
  if (url.includes("/impact-stories/")) return "impact-story";
  if (url.includes("/collaborate/biopharmaceuticals")) return "biopharmaceutical";
  if (url.includes("/copyrighted-materials")) return "copyrighted-material";
  return "individual";
}

const UA = "Mozilla/5.0 (compatible; EdenRadar/2.0; +https://edenradar.com)";
const PAGE_TIMEOUT_MS = 25000;

async function fetchPage(url: string, externalSignal?: AbortSignal): Promise<string | null> {
  const signal = externalSignal
    ? AbortSignal.any([AbortSignal.timeout(PAGE_TIMEOUT_MS), externalSignal])
    : AbortSignal.timeout(PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xml,application/json,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) {
      console.warn(`[scraper] ${INST}: HTTP ${res.status} for ${url} — skipping`);
      return null;
    }
    return await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[scraper] ${INST}: fetch failed for ${url} — ${msg}`);
    return null;
  }
}

/** Discovers page URLs from the WordPress XML sitemap. */
async function discoverViaSitemap(signal?: AbortSignal): Promise<string[]> {
  for (const sitemapUrl of [
    `${BASE}/wp-sitemap.xml`,
    `${BASE}/wp-sitemap-posts-page-1.xml`,
    `${BASE}/sitemap.xml`,
    `${BASE}/sitemap_index.xml`,
  ]) {
    const xml = await fetchPage(sitemapUrl, signal);
    if (!xml || xml.length < 100) continue;

    // Collect sitemap index sub-sitemaps first (if this is an index)
    const subSitemaps = [...xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>/g)].map(
      (m) => m[1].trim(),
    );
    const candidates: string[] = [];

    if (subSitemaps.length > 0) {
      // Sitemap index — fetch each sub-sitemap
      for (const sub of subSitemaps) {
        const subXml = await fetchPage(sub, signal);
        if (!subXml) continue;
        const locs = [...subXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
        candidates.push(...locs);
      }
    } else {
      // Direct sitemap — extract <loc> entries
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
      candidates.push(...locs);
    }

    const filtered = candidates.filter(
      (u) => u.startsWith(BASE) && isLikelyTechUrl(u),
    );
    if (filtered.length > 0) {
      console.log(`[scraper] ${INST}: sitemap at ${sitemapUrl} → ${filtered.length} candidate URLs`);
      return filtered;
    }
  }
  return [];
}

/** Discovers page slugs via the WordPress REST API. */
async function discoverViaWpApi(signal?: AbortSignal): Promise<string[]> {
  // Try pages, then any custom post types registered on the site
  const endpoints = [
    `${BASE}/wp-json/wp/v2/pages?per_page=100&status=publish&_fields=link,slug,title`,
    `${BASE}/wp-json/wp/v2/technology?per_page=100&status=publish&_fields=link,slug,title`,
  ];
  const discovered: string[] = [];
  for (const endpoint of endpoints) {
    const raw = await fetchPage(endpoint, signal);
    if (!raw) continue;
    try {
      const items: Array<{ link?: string }> = JSON.parse(raw);
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const link = String(item.link || "");
        if (link.startsWith(BASE) && isLikelyTechUrl(link)) discovered.push(link);
      }
    } catch {
      // Not JSON — skip
    }
  }
  return discovered;
}

// Parse the Elementor h5/text-editor pattern used on /collaborate/biopharmaceuticals/.
// Each technology appears as <h5><strong>Title</strong></h5> followed by 1-N
// text-editor widgets containing "Unmet need:" / "Innovation:" prose.
export function parseBiopharmaPage(html: string, url: string): ScrapedListing[] {
  const $ = cheerio.load(html);

  const widgets: Array<{ kind: "title" | "body"; text: string }> = [];
  $(".elementor-widget-text-editor .elementor-widget-container").each((_, el) => {
    const h5 = $(el).find("h5").text().trim();
    if (h5 && h5.length > 5) {
      widgets.push({ kind: "title", text: cleanText(h5) });
    } else {
      const body = cleanText($(el).text());
      if (body.length > 20) widgets.push({ kind: "body", text: body });
    }
  });

  const listings: ScrapedListing[] = [];
  for (let i = 0; i < widgets.length; i++) {
    if (widgets[i].kind !== "title") continue;
    const title = widgets[i].text;

    const bodyParts: string[] = [];
    for (let j = i + 1; j < widgets.length && widgets[j].kind === "body"; j++) {
      bodyParts.push(widgets[j].text);
    }
    const fullBody = bodyParts.join(" ");

    const innovMatch = fullBody.match(/Innovation[:\s]+([\s\S]{20,600}?)(?:Publications:|Learn more|$)/i);
    const description = innovMatch
      ? innovMatch[1].trim().slice(0, 1000)
      : fullBody.slice(0, 400);

    listings.push({
      title,
      description,
      url,
      institution: INST,
      categories: ["biopharmaceutical"],
    });
  }
  return listings;
}

// Parse a single individual-technology page. Each such page describes ONE
// licensable asset; we extract title + description from og:title / og:meta /
// h1 + the longest meaningful text-editor widget.
export function parseIndividualTechPage(
  html: string,
  url: string,
  category: string,
): ScrapedListing | null {
  const $ = cheerio.load(html);

  // Title preference: og:title (cleaned of "- Mayo Clinic Business Development" suffix)
  // → first <h1> → <title> tag.
  let title = $('meta[property="og:title"]').attr("content") || "";
  title = title.replace(/\s*[-|]\s*Mayo Clinic.*$/i, "").trim();
  if (!title) title = $("h1").first().text().trim();
  if (!title) {
    title = ($("title").first().text() || "")
      .replace(/\s*[-|]\s*Mayo Clinic.*$/i, "")
      .trim();
  }
  title = cleanText(title);
  if (!title || title.length < 5) return null;

  // Description: prefer the longest text-editor widget body (real prose),
  // fall back to og:description / meta description.
  let bestBody = "";
  $(".elementor-widget-text-editor .elementor-widget-container").each((_, el) => {
    const text = cleanText($(el).text());
    if (
      text.length > bestBody.length &&
      text.length > 80 &&
      // skip nav-y / boilerplate widgets
      !/^(Home|Collaborate|About|Contact|Press|Resources)\b/i.test(text)
    ) {
      bestBody = text;
    }
  });

  const ogDesc = $('meta[property="og:description"]').attr("content") || "";
  const metaDesc = $('meta[name="description"]').attr("content") || "";
  const fallback = cleanText(ogDesc || metaDesc);

  const description = (bestBody || fallback || "").slice(0, 1000);
  if (description.length < 20) return null;

  return {
    title,
    description,
    url,
    institution: INST,
    categories: [category],
  };
}

export const mayoScraper: InstitutionScraper = {
  institution: INST,
  scraperType: "http",
  async scrape(signal?: AbortSignal): Promise<ScrapedListing[]> {
    // ── Step 1: discover all candidate URLs ──────────────────────────────────
    const [sitemapUrls, wpApiUrls] = await Promise.all([
      discoverViaSitemap(signal),
      discoverViaWpApi(signal),
    ]);

    // Merge dynamic + hardcoded, deduplicated by normalized URL.
    const seen = new Set<string>();
    const normalise = (u: string) => u.replace(/\/?$/, "/").toLowerCase();

    const allCandidates: Array<{ url: string; kind: "biopharma" | "individual"; category: string }> = [];

    // Always include the biopharma index page first
    allCandidates.push({ url: BIOPHARMA_URL, kind: "biopharma", category: "biopharmaceutical" });
    seen.add(normalise(BIOPHARMA_URL));

    // Collect dynamic discoveries
    const dynamicUrls = [...new Set([...sitemapUrls, ...wpApiUrls])];
    for (const url of dynamicUrls) {
      const key = normalise(url);
      if (seen.has(key)) continue;
      seen.add(key);
      // Skip the biopharma index — already added as biopharma kind above
      if (url.includes("/collaborate/biopharmaceuticals")) continue;
      allCandidates.push({ url, kind: "individual", category: categoryForUrl(url) });
    }

    // Fill in hardcoded pages that weren't found dynamically
    for (const p of HARDCODED_PAGES) {
      const key = normalise(p.url);
      if (seen.has(key)) continue;
      seen.add(key);
      allCandidates.push({ url: p.url, kind: "individual", category: p.category });
    }

    console.log(
      `[scraper] ${INST}: ${allCandidates.length} candidate pages ` +
        `(sitemap=${sitemapUrls.length}, wp-api=${wpApiUrls.length}, hardcoded=${HARDCODED_PAGES.length})`,
    );

    // ── Step 2: fetch all candidates in parallel ─────────────────────────────
    const fetched = await Promise.all(
      allCandidates.map((p) => fetchPage(p.url, signal).then((html) => ({ ...p, html }))),
    );

    // ── Step 3: parse and deduplicate ────────────────────────────────────────
    const perCategoryCounts: Record<string, number> = {};
    const titleSeen = new Set<string>();
    const listings: ScrapedListing[] = [];
    let rawCount = 0;
    let duplicatesRemoved = 0;

    for (const page of fetched) {
      if (!page.html) continue;
      const items =
        page.kind === "biopharma"
          ? parseBiopharmaPage(page.html, page.url)
          : (() => {
              const one = parseIndividualTechPage(page.html, page.url, page.category);
              return one ? [one] : [];
            })();

      for (const item of items) {
        rawCount++;
        const titleKey = `${INST}|${item.title.toLowerCase().trim()}`;
        if (titleSeen.has(titleKey)) {
          duplicatesRemoved++;
          continue;
        }
        titleSeen.add(titleKey);
        listings.push(item);
        const cat = item.categories?.[0] || "uncategorized";
        perCategoryCounts[cat] = (perCategoryCounts[cat] || 0) + 1;
      }
    }

    const breakdown = Object.entries(perCategoryCounts)
      .map(([cat, n]) => `${cat}=${n}`)
      .join(", ");
    console.log(
      `[scraper] ${INST}: ${listings.length} listings (raw=${rawCount}, ` +
        `duplicates_removed=${duplicatesRemoved}, ${breakdown})`,
    );
    return listings;
  },
};
