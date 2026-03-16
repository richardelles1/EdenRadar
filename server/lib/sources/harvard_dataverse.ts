import type { RawSignal } from "../types";

const BASE = "https://dataverse.harvard.edu/api/search";

export async function searchHarvardDataverse(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      type: "dataset",
      per_page: String(Math.min(maxResults, 25)),
      sort: "score",
      order: "desc",
    });

    const res = await fetch(`${BASE}?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`Harvard Dataverse API error: ${res.status}`);
    const data = await res.json();
    const items: any[] = data?.data?.items ?? [];

    return items.filter((item) => item.name).map((item): RawSignal => {
      const authors = (item.authors ?? []).slice(0, 4).map((a: any) => a.name ?? "").filter(Boolean).join(", ");
      const doi = item.global_id ?? "";
      const url = doi ? `https://doi.org/${doi.replace("doi:", "")}` : item.url ?? "https://dataverse.harvard.edu";

      return {
        id: `harvard-dataverse-${item.entity_id ?? Math.random()}`,
        source_type: "dataset",
        title: item.name,
        text: (item.description ?? "").slice(0, 1500),
        authors_or_owner: authors,
        institution_or_sponsor: "Harvard Dataverse",
        date: item.published_at?.slice(0, 10) ?? "",
        stage_hint: "unknown",
        url,
        metadata: {
          doi,
          entity_type: item.type,
          identifier: item.identifier_of_dataverse,
          source_label: "Harvard Dataverse",
        },
      };
    });
  } catch (err) {
    console.error("Harvard Dataverse search error:", err);
    return [];
  }
}
