import type { RawSignal } from "../types";

const BASE = "https://api.core.ac.uk/v3/search/works";

export async function searchCore(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const apiKey = process.env.CORE_API_KEY;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const res = await fetch(`${BASE}/?q=${encodeURIComponent(query)}&limit=${maxResults}&scroll=false`, {
      headers,
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`CORE API error: ${res.status}`);
    const data = await res.json();
    const results: any[] = data?.results ?? [];

    return results.filter((r) => r.title).map((r): RawSignal => {
      const authors = (r.authors ?? []).slice(0, 4).map((a: any) => a.name ?? "").filter(Boolean).join(", ");
      const doi = r.doi ?? "";
      const url = doi ? `https://doi.org/${doi}` : r.downloadUrl ?? r.sourceFulltextUrls?.[0] ?? "https://core.ac.uk";

      return {
        id: `core-${r.id ?? Math.random()}`,
        source_type: "paper",
        title: r.title,
        text: (r.abstract ?? "").slice(0, 1500),
        authors_or_owner: authors,
        institution_or_sponsor: r.dataProvider?.name ?? "",
        date: r.publishedDate ?? r.yearPublished?.toString() ?? "",
        stage_hint: "unknown",
        url,
        metadata: {
          doi,
          source_label: "CORE",
          downloadUrl: r.downloadUrl ?? "",
        },
      };
    });
  } catch (err) {
    console.error("CORE search error:", err);
    return [];
  }
}
