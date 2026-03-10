import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

export interface TechPublisherOptions {
  baseUrl?: string;
  selector?: string;
  maxPg?: number;
}

export function createTechPublisherScraper(
  slug: string,
  institution: string,
  opts: TechPublisherOptions = {}
): InstitutionScraper {
  const base = opts.baseUrl ?? `https://${slug}.technologypublisher.com`;
  const selector = opts.selector ?? "a[href*='/technology/']";
  const maxPg = opts.maxPg ?? 200;

  return {
    institution,
    async scrape(): Promise<ScrapedListing[]> {
      try {
        const results: ScrapedListing[] = [];
        const seen = new Set<string>();

        for (let pg = 0; pg <= maxPg; pg++) {
          const url = `${base}/SearchResults.aspx?type=Tech&q=&pg=${pg}`;
          const $ = await fetchHtml(url);
          if (!$) break;

          let pageCount = 0;
          $(selector).each((_, el) => {
            const href = $(el).attr("href") ?? "";
            const title = cleanText($(el).text());
            if (!title || title.length < 10 || seen.has(title)) return;
            seen.add(title);
            pageCount++;
            results.push({
              title,
              description: title,
              url: href.startsWith("http") ? href : `${base}${href}`,
              institution,
            });
          });

          if (pageCount === 0) break;
        }

        console.log(`[scraper] ${institution}: ${results.length} listings`);
        return results;
      } catch (err: any) {
        console.error(`[scraper] ${institution} failed: ${err?.message}`);
        return [];
      }
    },
  };
}
