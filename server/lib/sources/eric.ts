import type { RawSignal } from "../types";

const BASE = "https://api.ies.ed.gov/eric/";

export async function searchEric(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      search: `title:"${query}" OR description:"${query}"`,
      rows: String(maxResults),
      format: "json",
    });

    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`ERIC API error: ${res.status}`);
    const data = await res.json();
    const docs: any[] = data?.response?.docs ?? [];

    return docs.filter((d) => d.title).map((d): RawSignal => {
      const url = d.url ?? (d.id ? `https://eric.ed.gov/?id=${d.id}` : "https://eric.ed.gov");

      return {
        id: `eric-${d.id ?? Math.random()}`,
        source_type: "paper",
        title: d.title,
        text: (d.description ?? "").slice(0, 1500),
        authors_or_owner: Array.isArray(d.author) ? d.author.slice(0, 4).join(", ") : (d.author ?? ""),
        institution_or_sponsor: d.source ?? d.publisher ?? "",
        date: d.publicationdateyear?.toString() ?? "",
        stage_hint: "unknown",
        url,
        metadata: {
          source_label: "ERIC",
          ericId: d.id ?? "",
          peerReviewed: d.peerreviewed ?? "",
        },
      };
    });
  } catch (err) {
    console.error("ERIC search error:", err);
    return [];
  }
}
