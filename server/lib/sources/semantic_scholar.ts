import type { RawSignal } from "../types";

const BASE = "https://api.semanticscholar.org/graph/v1/paper/search";

export async function searchSemanticScholar(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      query,
      limit: String(Math.min(maxResults, 100)),
      fields: "paperId,title,abstract,authors,year,publicationDate,venue,externalIds,url,openAccessPdf",
    });

    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`Semantic Scholar API error: ${res.status}`);
    const data = await res.json();
    const papers: any[] = data?.data ?? [];

    return papers.filter((p) => p.title).map((p): RawSignal => {
      const authors = (p.authors ?? []).slice(0, 4).map((a: any) => a.name ?? "").filter(Boolean).join(", ");
      const doi = p.externalIds?.DOI ?? "";
      const pmid = p.externalIds?.PubMed ?? "";
      const url = doi ? `https://doi.org/${doi}` : p.url ?? `https://www.semanticscholar.org/paper/${p.paperId}`;

      return {
        id: `semscholar-${p.paperId}`,
        source_type: "paper",
        title: p.title,
        text: p.abstract ?? "",
        authors_or_owner: authors,
        institution_or_sponsor: "",
        date: p.publicationDate ?? (p.year ? `${p.year}-01-01` : ""),
        stage_hint: "unknown",
        url,
        metadata: {
          paperId: p.paperId,
          doi,
          pmid,
          venue: p.venue ?? "",
          year: p.year,
          source_label: "Semantic Scholar",
        },
      };
    });
  } catch (err) {
    console.error("Semantic Scholar search error:", err);
    return [];
  }
}
