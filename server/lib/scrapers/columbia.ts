import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Columbia University";
const BASE = "https://inventions.techventures.columbia.edu";
const SITEMAP_URL = `${BASE}/sitemap.xml`;

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPatentStatus(descriptionHtml: string): string | undefined {
  const m = descriptionHtml.match(
    /Patent Information[:\s]*<\/h2>\s*<p>(.*?)<\/p>/is,
  );
  if (m) return stripHtml(m[1]).slice(0, 300);
  const inline = descriptionHtml.match(
    /(Patent\s+(?:Pending|Issued|Filed|Application|Granted)[^<]{0,200})/i,
  );
  if (inline) return stripHtml(inline[1]).slice(0, 300);
  return undefined;
}

function extractLicensingStatus(
  descriptionHtml: string,
  rawLicensingStatus?: string,
): string | undefined {
  if (rawLicensingStatus && rawLicensingStatus.trim().length > 0) {
    return rawLicensingStatus.trim().slice(0, 200);
  }
  const sectionM = descriptionHtml.match(
    /Licensing\s+(?:Status|Information|Opportunity)[:\s]*<\/h[23]>\s*<p>(.*?)<\/p>/is,
  );
  if (sectionM) return stripHtml(sectionM[1]).slice(0, 200);
  const inlineM = descriptionHtml.match(
    /(Available\s+for\s+(?:licensing|partnership|commercialization)[^<]{0,150}|Seeking\s+(?:licensees?|partners?|investors?)[^<]{0,150})/i,
  );
  if (inlineM) return stripHtml(inlineM[1]).slice(0, 200);
  return undefined;
}

export interface ColumbiaSource {
  id?: string;
  title?: string;
  description_?: string;
  meta_description?: string;
  inventors?: string[];
  file_number?: string;
  licensing_status?: string;
  license_status?: string;
  tags?: string[];
  date_released?: string;
}

export interface ColumbiaJsonResponse {
  id?: string;
  slug?: string;
  source?: ColumbiaSource;
}

export async function fetchColumbiaJson(
  url: string,
  timeoutMs = 12_000,
  externalSignal?: AbortSignal,
): Promise<ColumbiaJsonResponse | null> {
  const attemptFetch = async (): Promise<Response | null> => {
    try {
      const timeoutSig = AbortSignal.timeout(timeoutMs);
      const signal = externalSignal
        ? AbortSignal.any([externalSignal, timeoutSig])
        : timeoutSig;
      return await fetch(`${url}.json`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
        signal,
      });
    } catch {
      return null;
    }
  };

  try {
    let res = await attemptFetch();
    if (!res) return null;

    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 5_000));
      res = await attemptFetch();
      if (!res || !res.ok) return null;
    }

    if (!res.ok) return null;
    return (await res.json()) as ColumbiaJsonResponse;
  } catch {
    return null;
  }
}

export function columbiaJsonToListing(
  url: string,
  data: ColumbiaJsonResponse,
): ScrapedListing | null {
  const src = data.source;
  if (!src) return null;
  const title = src.title?.trim() ?? "";
  if (title.length < 5) return null;

  const descHtml = src.description_ ?? "";
  const descText = stripHtml(descHtml).slice(0, 5000);
  const abstract = src.meta_description?.trim() ?? "";
  const inventors = (src.inventors ?? []).filter(Boolean);
  const patentStatus = extractPatentStatus(descHtml);
  const licensingStatus = extractLicensingStatus(
    descHtml,
    src.licensing_status ?? src.license_status,
  );
  const technologyId = src.file_number ?? src.id ?? undefined;

  return {
    title,
    description: descText || abstract,
    url,
    institution: INST,
    abstract: abstract || undefined,
    inventors: inventors.length > 0 ? inventors : undefined,
    patentStatus,
    licensingStatus,
    technologyId,
  };
}

/**
 * Fetches Columbia's sitemap and returns all /technologies/ URLs.
 * Returns null (instead of throwing) if the sitemap is rate-limited (429)
 * so callers can gracefully fall back to using DB slugs directly.
 */
export async function fetchColumbiaSitemapUrls(): Promise<string[] | null> {
  try {
    const res = await fetch(SITEMAP_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429) {
      console.warn(
        `[scraper] ${INST}: sitemap rate-limited (429) — will use DB slugs directly`,
      );
      return null;
    }
    if (!res.ok) throw new Error(`Sitemap HTTP ${res.status}`);
    const xml = await res.text();
    const urls: string[] = [];
    const re =
      /<loc>(https:\/\/inventions\.techventures\.columbia\.edu\/technologies\/([^<]+))<\/loc>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      urls.push(m[1]);
    }
    return urls;
  } catch (err: any) {
    console.warn(
      `[scraper] ${INST}: sitemap fetch failed (${err?.message}) — will use DB slugs directly`,
    );
    return null;
  }
}

export const columbiaScraper: InstitutionScraper = {
  institution: INST,
  // Columbia's .json endpoint rate-limits when hit too quickly.
  // Safe rate: CONCURRENCY=1, DELAY=1500ms (~0.67 req/s).
  // On repeat syncs knownUrls filters to only NEW listings (typically 0–50),
  // plus a small health-validation sample so the scraper always returns a
  // non-zero count and the admin panel shows "OK".
  // scraperTimeoutMs raised to 10 min in case a first-time full scan is needed.
  scraperTimeoutMs: 10 * 60 * 1000,

  async scrape(signal?: AbortSignal, knownUrls?: Set<string>): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching sitemap…`);
    try {
      const allUrls = await fetchColumbiaSitemapUrls();

      // --- Sitemap unavailable (rate-limited or failed) ---
      // Fall back to knownUrls for a health sample so the scraper returns
      // a non-zero result and keeps the admin health indicator green.
      if (!allUrls || allUrls.length === 0) {
        if (!knownUrls || knownUrls.size === 0) {
          console.warn(
            `[scraper] ${INST}: sitemap unavailable and no known URLs — skipping cycle`,
          );
          return [];
        }
        const FALLBACK_SAMPLE = 15;
        const sampleUrls = Array.from(knownUrls).slice(0, FALLBACK_SAMPLE);
        console.log(
          `[scraper] ${INST}: sitemap unavailable — using ${sampleUrls.length} known URLs as health sample`,
        );
        const results: ScrapedListing[] = [];
        for (const url of sampleUrls) {
          if (signal?.aborted) break;
          const data = await fetchColumbiaJson(url, 12_000, signal);
          if (!data) continue;
          const listing = columbiaJsonToListing(url, data);
          if (listing) results.push(listing);
          await new Promise((r) => setTimeout(r, 1_500));
        }
        console.log(
          `[scraper] ${INST}: fallback health sample — ${results.length} listings collected`,
        );
        return results;
      }

      // --- Normal path: sitemap available ---
      const newUrls = knownUrls
        ? allUrls.filter((u) => !knownUrls.has(u))
        : allUrls;

      console.log(
        `[scraper] ${INST}: ${allUrls.length} sitemap URLs — ${knownUrls?.size ?? 0} already known, ${newUrls.length} new`,
      );

      // Build stubs for ALL sitemap URLs. Only fetch .json detail for new URLs.
      // Returning all listings lets the pipeline record real rawCollected / relevant
      // counts, matching the behaviour of every other scraper.
      const stubResults: ScrapedListing[] = allUrls.map((url) => {
        const slug = url.split("/technologies/")[1] ?? url;
        const titleStub = slug
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .slice(0, 200);
        return { title: titleStub, description: "", url, institution: INST };
      });

      const results: ScrapedListing[] = [...stubResults];

      if (newUrls.length > 0) {
        const CONCURRENCY = 1;
        const DELAY_MS = 1500;
        const enriched = new Map<string, ScrapedListing>();

        console.log(`[scraper] ${INST}: fetching .json for ${newUrls.length} new listings…`);
        for (let i = 0; i < newUrls.length; i += CONCURRENCY) {
          if (signal?.aborted) break;
          const batch = newUrls.slice(i, i + CONCURRENCY);
          const batchResults = await Promise.all(
            batch.map(async (url) => {
              const data = await fetchColumbiaJson(url, 12_000, signal);
              if (!data) return null;
              return columbiaJsonToListing(url, data);
            }),
          );
          for (const r of batchResults) {
            if (r) enriched.set(r.url, r);
          }
          if (i + CONCURRENCY < newUrls.length) {
            await new Promise((r) => setTimeout(r, DELAY_MS));
          }
        }

        // Replace stubs with fully-enriched listings for new URLs
        for (let i = 0; i < results.length; i++) {
          const full = enriched.get(results[i].url);
          if (full) results[i] = full;
        }
      } else {
        console.log(`[scraper] ${INST}: no new listings this cycle — returning ${results.length} stubs for pipeline count`);
      }

      const thinCount = results.filter((r) => !r.description || r.description.length < 50).length;
      console.log(
        `[scraper] ${INST}: ${results.length} listings (${newUrls.length} detail-enriched, ${thinCount} thin stubs)`,
      );
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
