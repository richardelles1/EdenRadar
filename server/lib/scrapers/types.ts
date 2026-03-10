export interface ScrapedListing {
  title: string;
  description: string;
  url: string;
  institution: string;
  stage?: string;
  date?: string;
}

export interface InstitutionScraper {
  institution: string;
  scrape(): Promise<ScrapedListing[]>;
}
