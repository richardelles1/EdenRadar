import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

export interface FlintboxOrg {
  slug: string;
  orgId: number;
  accessKey: string;
}

interface JsonApiTech {
  id?: string | number;
  attributes?: {
    name?: string;
    title?: string;
    briefDescription?: string;
    brief_description?: string;
    keyPoint1?: string;
    slug?: string;
  };
}

export function createFlintboxScraper(org: FlintboxOrg, institution: string): InstitutionScraper {
  const base = `https://${org.slug}.flintbox.com`;

  return {
    institution,
    async scrape(): Promise<ScrapedListing[]> {
      try {
        const url =
          `${base}/api/v1/technologies` +
          `?organizationId=${org.orgId}` +
          `&organizationAccessKey=${org.accessKey}` +
          `&per_page=500`;

        const res = await fetch(url, {
          headers: {
            Accept: "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Mozilla/5.0",
          },
          signal: AbortSignal.timeout(15_000),
        });

        if (res.ok) {
          const json = await res.json() as any;
          const items: JsonApiTech[] = Array.isArray(json)
            ? json
            : (json.data ?? json.technologies ?? json.results ?? []);

          if (Array.isArray(items) && items.length > 0) {
            const results: ScrapedListing[] = [];
            for (const item of items) {
              const attrs = item.attributes ?? (item as any);
              const name = cleanText(attrs.name ?? attrs.title ?? "");
              if (!name || name.length < 5) continue;
              const desc = cleanText(
                attrs.briefDescription ?? attrs.brief_description ?? attrs.keyPoint1 ?? ""
              );
              const techId = item.id ?? attrs.slug ?? "";
              const techUrl = techId
                ? `${base}/technologies/${techId}`
                : `${base}/technologies`;
              results.push({ title: name, description: desc, url: techUrl, institution });
            }
            console.log(`[scraper] ${institution}: ${results.length} listings via Flintbox API`);
            return results;
          }
        }

        const $ = await fetchHtml(`${base}/technologies`);
        if ($) {
          const results: ScrapedListing[] = [];
          const seen = new Set<string>();
          $("a[href*='/technologies/']").each((_, el) => {
            const href = $(el).attr("href") ?? "";
            const title = cleanText($(el).text());
            if (!title || title.length < 8 || seen.has(title)) return;
            seen.add(title);
            results.push({
              title,
              description: "",
              url: href.startsWith("http") ? href : `${base}${href}`,
              institution,
            });
          });
          if (results.length > 0) {
            console.log(`[scraper] ${institution}: ${results.length} listings via Flintbox HTML`);
            return results;
          }
        }

        console.log(`[scraper] ${institution}: Flintbox (${org.slug}) — 0 results`);
        return [];
      } catch (err: any) {
        console.error(`[scraper] ${institution} Flintbox failed: ${err?.message}`);
        return [];
      }
    },
  };
}
