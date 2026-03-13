import type { RawSignal } from "../types";

// EU Clinical Trials Register (clinicaltrialsregister.eu) does not offer a public
// machine-readable API — its REST endpoint returns HTML error pages. We use
// Europe PMC's CTX source, which indexes EU clinical trial records, as the
// data provider for this source.
const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

export async function searchEuClinicalTrials(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      query: `${query} (SRC:CTX OR SRC:CBA)`,
      format: "json",
      pageSize: String(maxResults),
      resultType: "core",
    });

    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) throw new Error(`EU Clinical Trials via Europe PMC error: ${res.status}`);
    const data = await res.json();
    const results: any[] = data?.resultList?.result ?? [];

    return results.filter((r) => r.title).map((r): RawSignal => {
      const pmcid = r.pmcid ?? r.id ?? "";
      const doi = r.doi ?? "";
      return {
        id: `euct-${pmcid || doi || Math.random()}`,
        source_type: "clinical_trial",
        title: r.title,
        text: r.abstractText ?? r.title ?? "",
        authors_or_owner: (r.authorString ?? "").slice(0, 200),
        institution_or_sponsor: r.affiliation ?? "",
        date: r.firstPublicationDate ?? r.dateOfCreation ?? "",
        stage_hint: extractPhaseFromText(r.title + " " + (r.abstractText ?? "")),
        url: doi ? `https://doi.org/${doi}` : pmcid ? `https://europepmc.org/article/${r.source}/${pmcid}` : "https://euclinicaltrials.eu",
        metadata: {
          doi,
          pmcid,
          source_label: "EU Clinical Trials",
        },
      };
    });
  } catch (err) {
    console.error("EU Clinical Trials search error:", err);
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
