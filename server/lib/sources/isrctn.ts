import type { RawSignal } from "../types";

const BASE = "https://www.isrctn.com/api/query/format/json";

export async function searchIsrctn(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      page: "1",
      pageSize: String(maxResults),
    });

    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(12000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) throw new Error(`ISRCTN API error: ${res.status}`);
    const data = await res.json();
    const items: any[] = data?.items ?? data?.results ?? [];

    return items.filter((item) => item.title || item.isrctn).map((item): RawSignal => {
      const isrctnId = item.isrctn ?? item.doi ?? "";
      return {
        id: `isrctn-${isrctnId || Math.random()}`,
        source_type: "clinical_trial",
        title: item.title ?? `ISRCTN ${isrctnId}`,
        text: item.plainEnglishSummary ?? item.scientificTitle ?? "",
        authors_or_owner: item.contacts?.[0]?.name ?? "",
        institution_or_sponsor: item.sponsor?.organisation ?? item.sponsor ?? "",
        date: item.lastEdited ?? item.dateAssigned ?? "",
        stage_hint: mapIsrctnPhase(item.phase),
        url: isrctnId ? `https://www.isrctn.com/${isrctnId}` : "https://www.isrctn.com",
        metadata: {
          isrctn_id: isrctnId,
          status: item.recruitmentStatus ?? item.overallTrialStatus ?? "",
          phase: item.phase ?? "",
          source_label: "ISRCTN",
        },
      };
    });
  } catch (err) {
    console.error("ISRCTN search error:", err);
    return [];
  }
}

function mapIsrctnPhase(phase: string | undefined): string {
  if (!phase) return "unknown";
  const p = phase.toLowerCase();
  if (p.includes("1") || p.includes("i") && !p.includes("ii")) return "phase 1";
  if (p.includes("2") || p.includes("ii") && !p.includes("iii")) return "phase 2";
  if (p.includes("3") || p.includes("iii")) return "phase 3";
  if (p.includes("4") || p.includes("iv")) return "approved";
  return "preclinical";
}
