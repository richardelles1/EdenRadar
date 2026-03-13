import type { RawSignal } from "../types";

const BASE = "https://cordis.europa.eu/api/search/results";

export async function searchEuCordis(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      q: `contenttype='project' AND '${query}'`,
      format: "json",
      p: "1",
      num: String(maxResults),
    });

    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) throw new Error(`EU CORDIS API error: ${res.status}`);
    const data = await res.json();
    const results: any[] = data?.results ?? data?.payload?.results ?? [];

    return results.filter((r) => r.title || r.acronym).map((r): RawSignal => {
      const projectId = r.rcn ?? r.id ?? "";
      const startDate = r.startDate ?? "";
      const coordinator = r.coordinatorCountry ?? r.coordinator ?? "";

      return {
        id: `cordis-${projectId || Math.random()}`,
        source_type: "grant",
        title: r.title ?? r.acronym ?? "Untitled EU Project",
        text: r.objective ?? r.teaser ?? "",
        authors_or_owner: r.coordinator ?? "",
        institution_or_sponsor: coordinator,
        date: startDate ? startDate.slice(0, 10) : "",
        stage_hint: "preclinical",
        url: projectId ? `https://cordis.europa.eu/project/id/${projectId}` : "https://cordis.europa.eu",
        metadata: {
          rcn: projectId,
          acronym: r.acronym ?? "",
          programme: r.frameworkProgramme ?? "",
          totalCost: r.totalCost ?? "",
          source_label: "EU CORDIS",
        },
      };
    });
  } catch (err) {
    console.error("EU CORDIS search error:", err);
    return [];
  }
}
