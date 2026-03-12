import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Columbia University";
const BASE = "https://inventions.techventures.columbia.edu";

const CATEGORIES = [
  "Biology",
  "Biotechnology",
  "Chemistry",
  "Medicine",
  "Pharmacology",
  "Genetics",
  "Neuroscience",
  "Biochemistry",
  "Bioinformatics",
  "Biomedical Engineering",
];

function slugToTitle(slug: string): string {
  return slug
    .replace(/--[A-Z0-9]+$/, "")
    .replace(/-+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

async function fetchPage(category: string, page: number): Promise<string[]> {
  const encoded = encodeURIComponent(`"${category}"`);
  const url = `${BASE}/search?fs=categories%3A${encoded}&p=${page}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const slugs: string[] = [];
    const re = /href="\/technologies\/([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      slugs.push(m[1]);
    }
    return slugs;
  } catch {
    return [];
  }
}

export const columbiaScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: paginating categories...`);
    const seen = new Set<string>();
    const results: ScrapedListing[] = [];

    for (const category of CATEGORIES) {
      let page = 1;
      while (page <= 100) {
        const slugs = await fetchPage(category, page);
        if (slugs.length === 0) break;
        for (const slug of slugs) {
          if (!seen.has(slug)) {
            seen.add(slug);
            results.push({
              title: slugToTitle(slug),
              description: "",
              url: `${BASE}/technologies/${slug}`,
              institution: INST,
            });
          }
        }
        page++;
      }
      console.log(`[scraper] ${INST}: ${category} done, total so far: ${results.length}`);
    }

    console.log(`[scraper] ${INST}: scraped ${results.length} listings`);
    return results;
  },
};
