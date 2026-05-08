import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";
import { enrichWithDetailPages } from "./detailFetcher";

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
    uuid?: string;
    description?: string;
    abstract?: string;
    fullDescription?: string;
    full_description?: string;
    inventors?: string;
    inventor_names?: string[];
    patentStatus?: string;
    patent_status?: string;
    licensingStatus?: string;
    licensing_status?: string;
    status?: string;
    categories?: string[];
    category?: string;
    contactEmail?: string;
    contact_email?: string;
    publishedDate?: string;
    published_date?: string;
    technologyNumber?: string;
    technology_number?: string;
  };
}

const discoveredCreds = new Map<string, { orgId: number; accessKey: string }>();

export async function discoverFlintboxCredentials(
  slug: string,
): Promise<{ orgId: number; accessKey: string } | null> {
  if (discoveredCreds.has(slug)) return discoveredCreds.get(slug)!;
  const base = `https://${slug}.flintbox.com`;
  try {
    // Primary: cheerio-based attribute extraction
    const $ = await fetchHtml(base, 15000);
    if ($) {
      const el = $("#flintbox");
      const rawId = el.attr("data-organization-id");
      const rawKey = el.attr("data-organization-access-key");
      if (rawId && rawKey) {
        const creds = { orgId: parseInt(rawId, 10), accessKey: rawKey };
        if (!isNaN(creds.orgId)) {
          discoveredCreds.set(slug, creds);
          console.log(`[scraper] Flintbox discovered credentials for ${slug} (orgId=${creds.orgId})`);
          return creds;
        }
      }
    }
    // Fallback: raw regex on HTML — handles React SPA pages where cheerio misses attrs
    const res = await fetch(base, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const idMatch = html.match(/data-organization-id=["'](\d+)["']/);
    const keyMatch = html.match(/data-organization-access-key=["']([a-f0-9-]{36})["']/);
    if (!idMatch || !keyMatch) return null;
    const creds = { orgId: parseInt(idMatch[1], 10), accessKey: keyMatch[1] };
    if (isNaN(creds.orgId)) return null;
    discoveredCreds.set(slug, creds);
    console.log(`[scraper] Flintbox regex-discovered credentials for ${slug} (orgId=${creds.orgId})`);
    return creds;
  } catch {
    return null;
  }
}

function stripHtml(s: string): string {
  return s
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

/** Fetches the single-technology Flintbox API endpoint for thin listings
 * and merges the full `abstract` (+ `marketApplication`) back onto each listing. */
async function enrichFlintboxThinListings(
  results: ScrapedListing[],
  orgId: number,
  accessKey: string,
  base: string,
  concurrency = 10,
): Promise<void> {
  const thin = results.filter(
    (l) => !l.description || l.description.length < 50,
  );
  if (thin.length === 0) return;

  // Process in batches of `concurrency` with a 200ms pause between batches
  for (let batchStart = 0; batchStart < thin.length; batchStart += concurrency) {
    const batch = thin.slice(batchStart, batchStart + concurrency);
    await Promise.all(
      batch.map(async (listing) => {
        const uuid = listing.url.split("/technologies/")[1]?.split("?")[0];
        if (!uuid) return;
        try {
          const apiUrl =
            `${base}/api/v1/technologies/${uuid}` +
            `?organizationId=${orgId}&organizationAccessKey=${accessKey}`;
          const res = await fetch(apiUrl, {
            headers: {
              Accept: "application/json",
              "X-Requested-With": "XMLHttpRequest",
              "User-Agent": "Mozilla/5.0",
            },
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) return;
          const json = await res.json() as any;
          const attrs = json?.data?.attributes ?? json?.attributes ?? (json as any);
          // Prioritised fallback: description → fullDescription → abstract
          // Then supplementary fields: benefit, marketApplication, keyPoint1-3, other.
          // "other" is the primary rich-text description for Cornell and extended content for Auburn.
          const descRaw = cleanText(stripHtml(
            attrs?.description ?? attrs?.fullDescription ?? attrs?.abstract ?? "",
          ));
          const benefitRaw = cleanText(stripHtml(attrs?.benefit ?? ""));
          const marketRaw = cleanText(stripHtml(attrs?.marketApplication ?? ""));
          const kp1 = cleanText(stripHtml(attrs?.keyPoint1 ?? ""));
          const kp2 = cleanText(stripHtml(attrs?.keyPoint2 ?? ""));
          const kp3 = cleanText(stripHtml(attrs?.keyPoint3 ?? ""));
          const otherRaw = cleanText(stripHtml(attrs?.other ?? ""));
          const combined = [descRaw, benefitRaw, marketRaw, kp1, kp2, kp3, otherRaw]
            .filter((s) => s.length > 0).join(" ").slice(0, 2000);
          if (combined.length >= 50) {
            listing.description = combined;
            if (descRaw.length >= 50) listing.abstract = descRaw.slice(0, 2000);
          }
        } catch {
          // silently skip
        }
      }),
    );
    // 200ms pause between batches to avoid rate-limiting
    if (batchStart + concurrency < thin.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
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
          const discovered = await discoverFlintboxCredentials(org.slug);
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
                const fullDesc = cleanText(
                  attrs.fullDescription ?? attrs.full_description ?? attrs.description ?? ""
                );
                const techId = attrs.uuid ?? attrs.slug ?? item.id ?? "";
                const techUrl = techId
                  ? `${base}/technologies/${techId}`
                  : `${base}/technologies`;

                const inventorStr = attrs.inventors ?? attrs.inventor_names?.join(", ") ?? "";
                const inventors = inventorStr
                  ? inventorStr.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean)
                  : undefined;

                const cats = attrs.categories ?? (attrs.category ? [attrs.category] : undefined);

                results.push({
                  title: name,
                  description: desc || fullDesc,
                  url: techUrl,
                  institution,
                  abstract: fullDesc || undefined,
                  inventors: inventors && inventors.length > 0 ? inventors : undefined,
                  patentStatus: attrs.patentStatus ?? attrs.patent_status ?? undefined,
                  licensingStatus: attrs.licensingStatus ?? attrs.licensing_status ?? attrs.status ?? undefined,
                  categories: cats,
                  contactEmail: attrs.contactEmail ?? attrs.contact_email ?? undefined,
                  publishedDate: attrs.publishedDate ?? attrs.published_date ?? undefined,
                  technologyId: attrs.technologyNumber ?? attrs.technology_number ?? (techId ? String(techId) : undefined),
                });
              }
              const thinCount = results.filter(
                (l) => !l.description || l.description === l.title || l.description.length < 50
              ).length;
              if (thinCount > 0) {
                console.log(`[scraper] ${institution}: fetching single-tech API for ${thinCount} thin Flintbox listings...`);
                await enrichFlintboxThinListings(results, orgId, accessKey, base);
                const enrichedCount = results.filter((l) => (l.description?.length ?? 0) >= 50).length;
                console.log(`[scraper] ${institution}: single-tech API enriched ${enrichedCount - (results.length - thinCount)} of ${thinCount} thin listings`);
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
          console.log(`[scraper] ${institution}: fetching detail pages for ${results.length} Flintbox HTML listings...`);
          await enrichWithDetailPages(results, {
            description: [
              ".technology-summary",
              ".field--name-body .field__item",
              ".field--name-body",
              ".tech-summary",
              "#description",
              ".description",
              "article .content",
              ".entry-content",
              "main p",
            ],
            abstract: [
              ".technology-abstract",
              ".field--name-field-abstract .field__item",
              ".field--name-field-abstract",
              "#abstract",
              ".abstract",
            ],
            inventors: [
              ".inventor-list li",
              ".inventors li",
              ".field--name-field-inventors li",
              ".inventor-name",
            ],
            patentStatus: [
              ".patent-status",
              ".field--name-field-patent-status .field__item",
              ".field--name-field-patent-status",
              ".ip-status",
            ],
            licensingStatus: [
              ".licensing-status",
              ".field--name-field-licensing-status .field__item",
              ".field--name-field-licensing-status",
            ],
          });
          console.log(`[scraper] ${institution}: ${results.length} listings via Flintbox HTML (detail-enriched)`);
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
