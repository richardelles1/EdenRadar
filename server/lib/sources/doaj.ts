import type { RawSignal } from "../types";

const BASE = "https://doaj.org/api/search/articles";

export async function searchDoaj(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const url = `${BASE}/${encodeURIComponent(query)}?page=1&pageSize=${maxResults}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`DOAJ API error: ${res.status}`);
    const data = await res.json();
    const results: any[] = data?.results ?? [];

    return results.filter((r) => r.bibjson?.title).map((r): RawSignal => {
      const bib = r.bibjson;
      const authors = (bib.author ?? [])
        .slice(0, 4)
        .map((a: any) => a.name ?? "")
        .filter(Boolean)
        .join(", ");
      const doi = (bib.identifier ?? []).find((id: any) => id.type === "doi")?.id ?? "";
      const url = doi
        ? `https://doi.org/${doi}`
        : (bib.link ?? []).find((l: any) => l.type === "fulltext")?.url ?? "https://doaj.org";
      const journal = bib.journal?.title ?? "";
      const year = bib.year ?? "";
      const month = bib.month ?? "01";

      return {
        id: `doaj-${r.id ?? Math.random()}`,
        source_type: "paper",
        title: bib.title,
        text: (bib.abstract ?? "").slice(0, 1500),
        authors_or_owner: authors,
        institution_or_sponsor: journal,
        date: year ? `${year}-${String(month).padStart(2, "0")}-01` : "",
        stage_hint: "unknown",
        url,
        metadata: {
          doi,
          journal,
          source_label: "DOAJ",
        },
      };
    });
  } catch (err) {
    console.error("DOAJ search error:", err);
    return [];
  }
}
