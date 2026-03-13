import type { RawSignal } from "../types";

const BASE = "https://euclinicaltrials.eu/ctis-public/search";

export async function searchEuClinicalTrials(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const body = {
      searchCriteria: {
        containAll: query,
        containAny: "",
        containNot: "",
      },
      pagination: {
        page: 1,
        size: maxResults,
      },
      sort: { property: "decisionDate", direction: "DESC" },
    };

    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`EU Clinical Trials API error: ${res.status}`);
    const data = await res.json();
    const results: any[] = data?.data ?? [];

    return results.filter((r) => r.ctTitle || r.ctNumber).map((r): RawSignal => {
      const ctNumber = r.ctNumber ?? "";
      return {
        id: `euct-${ctNumber || Math.random()}`,
        source_type: "clinical_trial",
        title: r.ctTitle ?? `EU Trial ${ctNumber}`,
        text: r.ctTitle ?? "",
        authors_or_owner: r.sponsorName ?? "",
        institution_or_sponsor: r.sponsorName ?? "",
        date: r.decisionDate ?? r.startDateEU ?? "",
        stage_hint: mapEuPhase(r.trialPhase),
        url: ctNumber ? `https://euclinicaltrials.eu/ctis-public/view/${ctNumber}` : "https://euclinicaltrials.eu",
        metadata: {
          ct_number: ctNumber,
          status: r.ctStatus ?? "",
          phase: r.trialPhase ?? "",
          source_label: "EU Clinical Trials",
        },
      };
    });
  } catch (err) {
    console.error("EU Clinical Trials search error:", err);
    return [];
  }
}

function mapEuPhase(phase: string | undefined): string {
  if (!phase) return "unknown";
  const p = phase.toLowerCase();
  if (p.includes("i") && !p.includes("ii")) return "phase 1";
  if (p.includes("ii") && !p.includes("iii")) return "phase 2";
  if (p.includes("iii")) return "phase 3";
  if (p.includes("iv")) return "approved";
  return "preclinical";
}
