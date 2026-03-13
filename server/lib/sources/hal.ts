import type { RawSignal } from "../types";

const BASE = "https://api.archives-ouvertes.fr/search/";

export async function searchHal(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      q: `title_t:(${query}) OR abstract_t:(${query})`,
      rows: String(maxResults),
      fl: "docid,title_s,abstract_s,authFullName_s,producedDate_s,uri_s,doiId_s,journalTitle_s,instStructName_s",
      sort: "producedDate_s desc",
      wt: "json",
    });

    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`HAL API error: ${res.status}`);
    const data = await res.json();
    const docs: any[] = data?.response?.docs ?? [];

    return docs.filter((d) => d.title_s).map((d): RawSignal => {
      const title = Array.isArray(d.title_s) ? d.title_s[0] : d.title_s;
      const abstract = Array.isArray(d.abstract_s) ? d.abstract_s[0] : (d.abstract_s ?? "");
      const authors = Array.isArray(d.authFullName_s)
        ? d.authFullName_s.slice(0, 4).join(", ")
        : (d.authFullName_s ?? "");
      const doi = d.doiId_s ?? "";
      const url = doi ? `https://doi.org/${doi}` : (d.uri_s ?? "https://hal.science");
      const institution = Array.isArray(d.instStructName_s)
        ? d.instStructName_s[0]
        : (d.instStructName_s ?? "");

      return {
        id: `hal-${d.docid ?? Math.random()}`,
        source_type: "paper",
        title: typeof title === "string" ? title : String(title),
        text: typeof abstract === "string" ? abstract.slice(0, 1500) : "",
        authors_or_owner: authors,
        institution_or_sponsor: institution,
        date: d.producedDate_s ?? "",
        stage_hint: "unknown",
        url,
        metadata: {
          doi,
          journal: d.journalTitle_s ?? "",
          source_label: "HAL",
        },
      };
    });
  } catch (err) {
    console.error("HAL search error:", err);
    return [];
  }
}
