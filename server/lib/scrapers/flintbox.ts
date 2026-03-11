import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchJson, fetchHtml, cleanText } from "./utils";

export interface FlintboxOrg {
  slug: string;
  orgId: number;
  accessKey: string;
}

interface WellspringTech {
  id?: number;
  name?: string;
  title?: string;
  slug?: string;
  brief_description?: string;
  description?: string;
  url?: string;
}

async function tryWellspringApi(org: FlintboxOrg, institution: string): Promise<ScrapedListing[] | null> {
  const base = `https://${org.slug}.flintbox.com`;
  const patterns = [
    `${base}/api/v1/technologies?organization_id=${org.orgId}&access_key=${org.accessKey}&per_page=500`,
    `${base}/api/technologies?access_key=${org.accessKey}&per_page=500`,
    `https://app.wellspringsoftware.net/api/v1/technologies?organization_id=${org.orgId}&access_key=${org.accessKey}&per_page=500`,
    `https://app.wellspringsoftware.net/technology_searches.json?q=&per_page=500&organization_id=${org.orgId}&access_key=${org.accessKey}`,
  ];

  for (const url of patterns) {
    const data = await fetchJson<any>(url);
    if (!data || data.errors || data.status === 404) continue;
    const items: WellspringTech[] = Array.isArray(data) ? data : (data.technologies ?? data.results ?? data.data ?? []);
    if (!Array.isArray(items) || items.length === 0) continue;

    return items
      .filter((t) => t.name || t.title)
      .map((t) => ({
        title: cleanText((t.name ?? t.title)!),
        description: cleanText(t.brief_description ?? t.description ?? ""),
        url: t.url ?? `${base}/technologies/${t.slug ?? t.id ?? ""}`,
        institution,
      }));
  }
  return null;
}

export function createFlintboxScraper(org: FlintboxOrg, institution: string): InstitutionScraper {
  return {
    institution,
    async scrape(): Promise<ScrapedListing[]> {
      try {
        const apiResults = await tryWellspringApi(org, institution);
        if (apiResults && apiResults.length > 0) {
          console.log(`[scraper] ${institution}: ${apiResults.length} listings via Flintbox API`);
          return apiResults;
        }

        const base = `https://${org.slug}.flintbox.com`;
        const $ = await fetchHtml(`${base}/technologies`);
        if (!$) {
          console.log(`[scraper] ${institution}: Flintbox SPA not accessible without JS rendering`);
          return [];
        }

        const results: ScrapedListing[] = [];
        const seen = new Set<string>();
        $("a[href*='/technologies/']").each((_, el) => {
          const href = $(el).attr("href") ?? "";
          const title = cleanText($(el).text());
          if (!title || title.length < 8 || seen.has(title)) return;
          seen.add(title);
          const fullUrl = href.startsWith("http") ? href : `${base}${href}`;
          results.push({ title, description: "", url: fullUrl, institution });
        });

        if (results.length > 0) {
          console.log(`[scraper] ${institution}: ${results.length} listings via Flintbox HTML`);
          return results;
        }

        console.log(`[scraper] ${institution}: Flintbox (${org.slug}.flintbox.com) requires JS rendering — 0 results`);
        return [];
      } catch (err: any) {
        console.error(`[scraper] ${institution} Flintbox failed: ${err?.message}`);
        return [];
      }
    },
  };
}
