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

const discoveredCreds = new Map<string, { orgId: number; accessKey: string }>();

async function discoverCredentials(
  base: string,
  slug: string,
): Promise<{ orgId: number; accessKey: string } | null> {
  if (discoveredCreds.has(slug)) return discoveredCreds.get(slug)!;
  try {
    const $ = await fetchHtml(base, 15000);
    if (!$) return null;
    const el = $("#flintbox");
    const rawId = el.attr("data-organization-id");
    const rawKey = el.attr("data-organization-access-key");
    if (!rawId || !rawKey) return null;
    const creds = { orgId: parseInt(rawId, 10), accessKey: rawKey };
    if (isNaN(creds.orgId)) return null;
    discoveredCreds.set(slug, creds);
    console.log(`[scraper] Flintbox auto-discovered credentials for ${slug} (orgId=${creds.orgId})`);
    return creds;
  } catch {
    return null;
  }
}

export function createFlintboxScraper(org: FlintboxOrg, institution: string): InstitutionScraper {
  const base = `https://${org.slug}.flintbox.com`;

  return {
    institution,
    async scrape(): Promise<ScrapedListing[]> {
      try {
        let { orgId, accessKey } = org;

        if (orgId === 0) {
          const discovered = await discoverCredentials(base, org.slug);
          if (discovered) {
            orgId = discovered.orgId;
            accessKey = discovered.accessKey;
          }
        }

        if (orgId > 0 && accessKey) {
          const url =
            `${base}/api/v1/technologies` +
            `?organizationId=${orgId}` +
            `&organizationAccessKey=${accessKey}` +
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
                const techId = attrs.uuid ?? attrs.slug ?? item.id ?? "";
                const techUrl = techId
                  ? `${base}/technologies/${techId}`
                  : `${base}/technologies`;
                results.push({ title: name, description: desc, url: techUrl, institution });
              }
              console.log(`[scraper] ${institution}: ${results.length} listings via Flintbox API`);
              return results;
            }
          }
        }

        const results: ScrapedListing[] = [];
        const seenUrls = new Set<string>();

        for (const path of ["/technologies", "/categories"]) {
          const $ = await fetchHtml(`${base}${path}`);
          if (!$) continue;
          $("a[href*='/technologies/']").each((_, el) => {
            const href = $(el).attr("href") ?? "";
            const title = cleanText($(el).text());
            if (!title || title.length < 8) return;
            const fullUrl = href.startsWith("http") ? href : `${base}${href}`;
            if (seenUrls.has(fullUrl)) return;
            seenUrls.add(fullUrl);
            results.push({
              title,
              description: "",
              url: fullUrl,
              institution,
            });
          });
        }

        if (results.length > 0) {
          console.log(`[scraper] ${institution}: ${results.length} listings via Flintbox HTML`);
          return results;
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
