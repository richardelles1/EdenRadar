import type { RawSignal } from "../types";

const BASE = "https://datadryad.org/api/v2/search";

export async function searchDryad(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      per_page: String(Math.min(maxResults, 25)),
    });

    const res = await fetch(`${BASE}?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`Dryad API error: ${res.status}`);
    const data = await res.json();
    const items: any[] = data?._embedded?.["stash:datasets"] ?? [];

    return items.filter((item) => item.title).map((item): RawSignal => {
      const authors = (item.authors ?? []).slice(0, 4).map((a: any) => [a.firstName, a.lastName].filter(Boolean).join(" ")).filter(Boolean).join(", ");
      const doi = item.identifier ?? "";
      const url = doi ? `https://doi.org/${doi.replace("doi:", "")}` : "https://datadryad.org";

      return {
        id: `dryad-${encodeURIComponent(doi || Math.random().toString())}`,
        source_type: "dataset",
        title: item.title,
        text: (item.abstract ?? "").slice(0, 1500),
        authors_or_owner: authors,
        institution_or_sponsor: item.affiliations?.[0]?.institutionName ?? "",
        date: item.publicationDate?.slice(0, 10) ?? item.lastModificationDate?.slice(0, 10) ?? "",
        stage_hint: "unknown",
        url,
        metadata: {
          doi,
          dryad_version: item.versionNumber,
          keywords: (item.keywords ?? []).slice(0, 8),
          source_label: "Dryad",
        },
      };
    });
  } catch (err) {
    console.error("Dryad search error:", err);
    return [];
  }
}
