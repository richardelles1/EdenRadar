import type { RawSignal } from "../types";

const BASE_URL = "https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi";

export async function searchBase(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      func: "PerformSearch",
      query: `dctitle:(${query}) OR dcsubject:(${query})`,
      format: "json",
      hits: String(maxResults),
      sortby: "dchits",
    });

    const res = await fetch(`${BASE_URL}?${params}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`BASE API error: ${res.status}`);
    const data = await res.json();
    const docs: any[] = data?.response?.docs ?? [];

    return docs.filter((d) => d.dctitle).map((d): RawSignal => {
      const title = Array.isArray(d.dctitle) ? d.dctitle[0] : d.dctitle;
      const abstract = Array.isArray(d.dcdescription) ? d.dcdescription[0] : (d.dcdescription ?? "");
      const authors = Array.isArray(d.dccreator)
        ? d.dccreator.slice(0, 4).join(", ")
        : (d.dccreator ?? "");
      const identifier = Array.isArray(d.dcidentifier) ? d.dcidentifier[0] : (d.dcidentifier ?? "");
      const url = Array.isArray(d.dclink) ? d.dclink[0] : (d.dclink ?? identifier ?? "https://base-search.net");
      const date = Array.isArray(d.dcdate) ? d.dcdate[0] : (d.dcdate ?? "");
      const source = Array.isArray(d.dcsource) ? d.dcsource[0] : (d.dcsource ?? "");

      return {
        id: `base-${d.dcrecordid ?? Math.random()}`,
        source_type: "paper",
        title,
        text: typeof abstract === "string" ? abstract.slice(0, 1500) : "",
        authors_or_owner: authors,
        institution_or_sponsor: source,
        date: typeof date === "string" ? date.slice(0, 10) : "",
        stage_hint: "unknown",
        url: typeof url === "string" ? url : "https://base-search.net",
        metadata: {
          source_label: "BASE",
        },
      };
    });
  } catch (err) {
    console.error("BASE search error:", err);
    return [];
  }
}
