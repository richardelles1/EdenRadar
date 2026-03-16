import type { RawSignal } from "../types";

const BASE = "https://api.figshare.com/v2/articles/search";

export async function searchFigshare(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        search_for: query,
        page_size: Math.min(maxResults, 25),
        order: "published_date",
        order_direction: "desc",
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`Figshare API error: ${res.status}`);
    const items: any[] = await res.json();

    return (Array.isArray(items) ? items : [])
      .filter((item) => item.title)
      .map((item): RawSignal => {
        const authors = (item.authors ?? []).slice(0, 4).map((a: any) => a.full_name ?? a.name ?? "").filter(Boolean).join(", ");
        const doi = item.doi ?? "";

        return {
          id: `figshare-${item.id ?? Math.random()}`,
          source_type: "dataset",
          title: stripHtml(item.title),
          text: (item.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1500),
          authors_or_owner: authors,
          institution_or_sponsor: "",
          date: item.published_date?.slice(0, 10) ?? item.created_date?.slice(0, 10) ?? "",
          stage_hint: "unknown",
          url: doi ? `https://doi.org/${doi}` : item.url ?? item.figshare_url ?? "https://figshare.com",
          metadata: {
            doi,
            figshare_id: item.id,
            item_type: item.defined_type_name,
            source_label: "Figshare",
          },
        };
      });
  } catch (err) {
    console.error("Figshare search error:", err);
    return [];
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
