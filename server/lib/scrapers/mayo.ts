import * as cheerio from "cheerio";
import type { InstitutionScraper, ScrapedListing } from "./types";
import { cleanText } from "./utils";

const INST = "Mayo Clinic";

// ─────────────────────────────────────────────────────────────────────────────
// Mayo Clinic Business Development — site audit (May 2026)
// ─────────────────────────────────────────────────────────────────────────────
//
// Mayo's BD site does NOT publish a broad licensable-tech catalog. Most
// "category" URLs that look promising are Yoast SEO redirects to marketing
// graphics (JPG/PNG). Confirmed surface of real licensable-asset content:
//
//   1. /collaborate/biopharmaceuticals/  — single category index page,
//      9 biopharma assets, Elementor h5/text-editor widgets.
//
//   2. Individual root-level technology pages (one tech each):
//        /houses-platform/                         (HOUSES population-health)
//        /best-next-drug-migraine-algorithm/       (AI migraine algorithm)
//        /pellikka-hfpef-aik/                      (HFpEF AI screening)
//        /uc-score/                                (UC Score)
//
//   3. /copyrighted-materials/ — Mayo's catalog of licensable Clinical
//      Outcome Assessment (COA) tools (Mayo Score, COMPASS 31, PETS, etc.).
//      The individual tools are listed inline as a comma-separated UL with
//      no consistent per-tool wrapper, so we ingest the page as a single
//      "Mayo Clinic Clinical Outcome Assessment tool catalog" listing
//      rather than risk a brittle inline split.
//
//   4. /impact-stories/* — case-study pages that double as licensable-tech
//      profiles (each is a single specific technology):
//        /impact-stories/q-hdmi/                                (q-HDMI ultrasound)
//        /impact-stories/maggies-pearl/                         (Maggie's Pearl device)
//        /impact-stories/stem-cell-therapy-for-perianal-fistulas/
//        /impact-stories/vyriad/                                (sodium-iodide symporter)
//        /impact-stories/magnetic-resonance-elastography/
//        /impact-stories/remote-ecg-patient-monitoring/
//        /impact-stories/phage-therapy/
//
// Intentionally EXCLUDED (verified non-asset / redirect / general topic):
//   - /collaborate/medical-devices/  → 301 to /wp-content/.../Medical-Devices.png
//   - /collaborate/research-tools/   → 301 to /wp-content/.../Research-Tools.jpg
//   - /collaborate/devices/          → 301 to /wp-content/.../Devices.jpg
//   - /collaborate/data/             → 301 to /press/
//   - /collaborate/digital/          → 301 to a press article
//   - /biopharmaceuticals/ (root)    → 301 to /collaborate/biopharmaceuticals/
//   - /technology-licensing/         → mirrors /collaborate/ index
//   - /impact-stories/spotlight-cures/, /evolving-vaccine-efforts/,
//     /cancer-screening-revolution/, /examples/ — general-topic essays,
//     not specific licensable assets.
//   - WP REST endpoints `dt_portfolio` and `posts` return zero items.
//
// Note: The Mayo site WAF blocks the full Chrome UA from cloud IPs;
// a lightweight Mozilla-compatible UA returns HTTP 200 successfully.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://businessdevelopment.mayoclinic.org";

const BIOPHARMA_URL = `${BASE}/collaborate/biopharmaceuticals/`;

interface IndividualTech {
  url: string;
  category: string;
}

const INDIVIDUAL_TECH_PAGES: IndividualTech[] = [
  // Root-level individual tech pages
  { url: `${BASE}/houses-platform/`, category: "individual" },
  { url: `${BASE}/best-next-drug-migraine-algorithm/`, category: "individual" },
  { url: `${BASE}/pellikka-hfpef-aik/`, category: "individual" },
  { url: `${BASE}/uc-score/`, category: "individual" },

  // Catalog page — emitted as one combined listing
  { url: `${BASE}/copyrighted-materials/`, category: "copyrighted-material" },

  // Impact-story pages that are actually single licensable technologies
  { url: `${BASE}/impact-stories/q-hdmi/`, category: "impact-story" },
  { url: `${BASE}/impact-stories/maggies-pearl/`, category: "impact-story" },
  { url: `${BASE}/impact-stories/stem-cell-therapy-for-perianal-fistulas/`, category: "impact-story" },
  { url: `${BASE}/impact-stories/vyriad/`, category: "impact-story" },
  { url: `${BASE}/impact-stories/magnetic-resonance-elastography/`, category: "impact-story" },
  { url: `${BASE}/impact-stories/remote-ecg-patient-monitoring/`, category: "impact-story" },
  { url: `${BASE}/impact-stories/phage-therapy/`, category: "impact-story" },
];

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
        Accept: "text/html,*/*",
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
    const allUrls = [
      { url: BIOPHARMA_URL, kind: "biopharma" as const, category: "biopharmaceutical" },
      ...INDIVIDUAL_TECH_PAGES.map((p) => ({ url: p.url, kind: "individual" as const, category: p.category })),
    ];

    // Fetch all pages in parallel (12 pages, well below the 20-slot global cap).
    const fetched = await Promise.all(allUrls.map((p) => fetchPage(p.url, signal).then((html) => ({ ...p, html }))));

    const perCategoryCounts: Record<string, number> = {};
    const dedupeKeys = new Set<string>(); // institution|title (case-insensitive)
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
        const key = `${INST}|${item.title.toLowerCase().trim()}`;
        if (dedupeKeys.has(key)) {
          duplicatesRemoved++;
          continue;
        }
        dedupeKeys.add(key);
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
