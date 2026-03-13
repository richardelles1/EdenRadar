import type { RawSignal } from "../types";

const BASE = "https://ieeexploreapi.ieee.org/api/v1/search/articles";

export async function searchIeee(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const apiKey = process.env.IEEE_API_KEY;
    if (!apiKey) return [];

    const params = new URLSearchParams({
      querytext: query,
      max_records: String(maxResults),
      sort_order: "desc",
      sort_field: "article_number",
      apikey: apiKey,
    });

    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`IEEE Xplore API error: ${res.status}`);
    const data = await res.json();
    const articles: any[] = data?.articles ?? [];

    return articles.filter((a) => a.title).map((a): RawSignal => {
      const authors = (a.authors?.authors ?? [])
        .slice(0, 4)
        .map((au: any) => au.full_name ?? "")
        .filter(Boolean)
        .join(", ");
      const doi = a.doi ?? "";
      const url = doi ? `https://doi.org/${doi}` : a.html_url ?? a.pdf_url ?? "https://ieeexplore.ieee.org";

      return {
        id: `ieee-${a.article_number ?? Math.random()}`,
        source_type: "paper",
        title: a.title,
        text: (a.abstract ?? "").slice(0, 1500),
        authors_or_owner: authors,
        institution_or_sponsor: a.publisher ?? "",
        date: a.publication_date ?? a.publication_year?.toString() ?? "",
        stage_hint: "unknown",
        url,
        metadata: {
          doi,
          source_label: "IEEE Xplore",
          contentType: a.content_type ?? "",
        },
      };
    });
  } catch (err) {
    console.error("IEEE Xplore search error:", err);
    return [];
  }
}
