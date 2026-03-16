import type { RawSignal } from "../types";

const BASE = "https://www.ebi.ac.uk/biostudies/api/v1/search";

export async function searchBioStudies(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      query,
      pageSize: String(Math.min(maxResults, 25)),
      page: "1",
    });

    const res = await fetch(`${BASE}?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`BioStudies API error: ${res.status}`);
    const data = await res.json();
    const hits: any[] = data?.hits ?? [];

    return hits.filter((h) => h.title).map((h): RawSignal => {
      const accession = h.accession ?? "";
      const url = accession ? `https://www.ebi.ac.uk/biostudies/studies/${accession}` : "https://www.ebi.ac.uk/biostudies";

      return {
        id: `biostudies-${accession || Math.random()}`,
        source_type: "dataset",
        title: h.title,
        text: (h.description ?? "").slice(0, 1500),
        authors_or_owner: (h.authors ?? []).slice(0, 4).map((a: any) => a.name ?? "").filter(Boolean).join(", "),
        institution_or_sponsor: h.organisation ?? "",
        date: h.releaseDate?.slice(0, 10) ?? "",
        stage_hint: "unknown",
        url,
        metadata: {
          accession,
          study_type: h.type,
          source_label: "EMBL-EBI BioStudies",
        },
      };
    });
  } catch (err) {
    console.error("BioStudies search error:", err);
    return [];
  }
}
