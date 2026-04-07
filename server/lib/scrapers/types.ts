export interface ScrapedListing {
  title: string;
  description: string;
  url: string;
  institution: string;
  stage?: string;
  date?: string;
  categories?: string[];
  abstract?: string;
  inventors?: string[];
  patentStatus?: string;
  licensingStatus?: string;
  contactEmail?: string;
  publishedDate?: string;
  technologyId?: string;
}

export interface InstitutionScraper {
  institution: string;
  scraperType?: "playwright" | "http" | "api" | "stub";
  tier?: 1 | 2 | 3 | 4;
  /** Override the default per-type timeout for this scraper (milliseconds). */
  scraperTimeoutMs?: number;
  scrape(signal?: AbortSignal): Promise<ScrapedListing[]>;
  probe?(maxResults?: number): Promise<ScrapedListing[]>;
}

export async function runProbe(scraper: InstitutionScraper, maxResults = 3): Promise<ScrapedListing[]> {
  if (scraper.probe) {
    const results = await scraper.probe(maxResults);
    return results.slice(0, maxResults);
  }
  const results = await scraper.scrape();
  return results.slice(0, maxResults);
}
