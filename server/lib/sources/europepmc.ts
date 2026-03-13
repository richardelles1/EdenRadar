import type { RawSignal } from "../types";

const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

export async function searchEuropePmc(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      query,
      format: "json",
      resultType: "core",
      pageSize: String(maxResults),
      sort: "RELEVANCE",
    });

    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`Europe PMC API error: ${res.status}`);
    const data = await res.json();
    const results: any[] = data?.resultList?.result ?? [];

    return results.filter((r) => r.title).map((r): RawSignal => {
      const doi = r.doi ?? "";
      const pmid = r.pmid ?? "";
      const url = doi ? `https://doi.org/${doi}` : pmid ? `https://europepmc.org/article/MED/${pmid}` : "https://europepmc.org";

      return {
        id: `epmc-${pmid || doi || r.id || Math.random()}`,
        source_type: "paper",
        title: r.title,
        text: r.abstractText ?? "",
        authors_or_owner: r.authorString ?? "",
        institution_or_sponsor: r.affiliation ?? "",
        date: r.firstPublicationDate ?? "",
        stage_hint: "unknown",
        url,
        metadata: {
          doi,
          pmid,
          journal: r.journalTitle ?? "",
          citedByCount: r.citedByCount ?? 0,
          source_label: "Europe PMC",
        },
      };
    });
  } catch (err) {
    console.error("Europe PMC search error:", err);
    return [];
  }
}
