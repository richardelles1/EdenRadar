import type { RawSignal } from "../types";

const ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";

export async function searchGeo(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const searchParams = new URLSearchParams({
      db: "gds",
      term: query,
      retmax: String(maxResults),
      retmode: "json",
    });

    const searchRes = await fetch(`${ESEARCH}?${searchParams}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!searchRes.ok) throw new Error(`GEO search error: ${searchRes.status}`);
    const searchData = await searchRes.json();
    const ids: string[] = searchData?.esearchresult?.idlist ?? [];

    if (ids.length === 0) return [];

    const summaryParams = new URLSearchParams({
      db: "gds",
      id: ids.join(","),
      retmode: "json",
    });

    const summaryRes = await fetch(`${ESUMMARY}?${summaryParams}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!summaryRes.ok) throw new Error(`GEO summary error: ${summaryRes.status}`);
    const summaryData = await summaryRes.json();
    const result = summaryData?.result ?? {};

    return ids.filter((id) => result[id]?.title).map((id): RawSignal => {
      const entry = result[id];
      const geoId = entry.accession ?? id;
      const taxon = entry.taxon ?? "";
      const samples = entry.n_samples ?? 0;

      return {
        id: `geo-${geoId}`,
        source_type: "dataset",
        title: entry.title ?? `GEO ${geoId}`,
        text: entry.summary ?? "",
        authors_or_owner: "",
        institution_or_sponsor: "",
        date: entry.pdat ?? "",
        stage_hint: "unknown",
        url: geoId.startsWith("GSE") ? `https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${geoId}` : `https://www.ncbi.nlm.nih.gov/gds/?term=${geoId}`,
        metadata: {
          accession: geoId,
          taxon,
          n_samples: samples,
          entryType: entry.entrytype ?? "",
          source_label: "GEO",
        },
      };
    });
  } catch (err) {
    console.error("GEO search error:", err);
    return [];
  }
}
