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
  // Prefer an explicit field from the API response if present
  if (rawLicensingStatus && rawLicensingStatus.trim().length > 0) {
    return rawLicensingStatus.trim().slice(0, 200);
  }
  // Fall back to parsing the HTML description for licensing section headings
  const sectionM = descriptionHtml.match(
    /Licensing\s+(?:Status|Information|Opportunity)[:\s]*<\/h[23]>\s*<p>(.*?)<\/p>/is,
  );
  if (sectionM) return stripHtml(sectionM[1]).slice(0, 200);
  // Inline "Available for licensing" / "Seeking partners" patterns
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
): Promise<ColumbiaJsonResponse | null> {
  try {
    const res = await fetch(`${url}.json`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
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

  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching sitemap…`);
    try {
      const techUrls = await fetchColumbiaSitemapUrls();
      if (!techUrls || techUrls.length === 0) {
        console.warn(
          `[scraper] ${INST}: sitemap unavailable — skipping full scrape this cycle`,
        );
        return [];
      }
      console.log(
        `[scraper] ${INST}: ${techUrls.length} technology URLs — fetching JSON details…`,
      );

      const results: ScrapedListing[] = [];
      const CONCURRENCY = 5;
      const DELAY_MS = 300;

      for (let i = 0; i < techUrls.length; i += CONCURRENCY) {
        const batch = techUrls.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map(async (url) => {
            const data = await fetchColumbiaJson(url);
            if (!data) return null;
            return columbiaJsonToListing(url, data);
          }),
        );
        for (const r of batchResults) {
          if (r) results.push(r);
        }
        if (i + CONCURRENCY < techUrls.length) {
          await new Promise((r) => setTimeout(r, DELAY_MS));
        }
      }

      const thinCount = results.filter(
        (r) => !r.description || r.description.length < 50,
      ).length;
      console.log(
        `[scraper] ${INST}: ${results.length} listings (${results.length - thinCount} with description, ${thinCount} thin)`,
      );
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
