import type { RawSignal } from "../types";

// ISRCTN (isrctn.com) does not offer a public JSON API — its /api/query endpoint
// returns HTML. We use Europe PMC, which indexes ISRCTN-registered trials, as the
// data provider for this source.
const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

export async function searchIsrctn(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      query: `${query} ISRCTN`,
      format: "json",
      pageSize: String(maxResults),
      resultType: "core",
    });

    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(12000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) throw new Error(`ISRCTN via Europe PMC error: ${res.status}`);
    const data = await res.json();
    const results: any[] = data?.resultList?.result ?? [];

    return results.filter((r) => r.title).map((r): RawSignal => {
      const id = r.id ?? r.pmcid ?? "";
      const doi = r.doi ?? "";
      const isrctnMatch = (r.title + " " + (r.abstractText ?? "")).match(/ISRCTN\d+/);
      const isrctnId = isrctnMatch ? isrctnMatch[0] : "";

      return {
        id: `isrctn-${isrctnId || id || Math.random()}`,
        source_type: "clinical_trial",
        title: r.title,
        text: r.abstractText ?? r.title ?? "",
        authors_or_owner: (r.authorString ?? "").slice(0, 200),
        institution_or_sponsor: r.affiliation ?? "",
        date: r.firstPublicationDate ?? r.dateOfCreation ?? "",
        stage_hint: extractPhaseFromText(r.title + " " + (r.abstractText ?? "")),
        url: isrctnId ? `https://www.isrctn.com/${isrctnId}` : doi ? `https://doi.org/${doi}` : "https://www.isrctn.com",
        metadata: {
          isrctn_id: isrctnId,
          doi,
          source_label: "ISRCTN",
        },
      };
    });
  } catch (err) {
    console.error("ISRCTN search error:", err);
    return [];
  }
}

function extractPhaseFromText(text: string): string {
  const t = text.toLowerCase();
  if (/phase\s*(iv|4)/i.test(t)) return "approved";
  if (/phase\s*(iii|3)/i.test(t)) return "phase 3";
  if (/phase\s*(ii|2)/i.test(t)) return "phase 2";
  if (/phase\s*(i|1)/i.test(t)) return "phase 1";
  if (/preclinical|pre-clinical/i.test(t)) return "preclinical";
  return "unknown";
}
