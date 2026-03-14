import type { RawSignal } from "../types";

const BASE = "https://api.openaire.eu/search/publications";

export async function searchOpenaire(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      keywords: query,
      size: String(maxResults),
      format: "json",
      sortBy: "resultdateofacceptance,descending",
    });

    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`OpenAIRE API error: ${res.status}`);
    const data = await res.json();
    const results: any[] = data?.response?.results?.result ?? [];

    return results.filter((r) => r.metadata?.["oaf:entity"]?.["oaf:result"]?.title).map((r): RawSignal => {
      const result = r.metadata["oaf:entity"]["oaf:result"];
      const titleObj = result.title;
      const title = Array.isArray(titleObj)
        ? (titleObj.find((t: any) => t?.["@classid"] === "main title")?.["$"] ?? titleObj[0]?.["$"] ?? "")
        : (titleObj?.["$"] ?? titleObj ?? "");

      const descArr = result.description;
      const desc = Array.isArray(descArr) ? (descArr[0]?.["$"] ?? "") : (descArr?.["$"] ?? descArr ?? "");

      const creators = result.creator;
      const authorList = Array.isArray(creators)
        ? creators.slice(0, 4).map((c: any) => c?.["$"] ?? "").filter(Boolean).join(", ")
        : (creators?.["$"] ?? "");

      const pidArr = result.pid;
      const pids = Array.isArray(pidArr) ? pidArr : pidArr ? [pidArr] : [];
      const doi = pids.find((p: any) => p?.["@classid"] === "doi")?.["$"] ?? "";
      const url = doi ? `https://doi.org/${doi}` : "https://explore.openaire.eu";
      const dateAcceptance = result.dateofacceptance?.["$"] ?? "";

      return {
        id: `openaire-${r?.header?.["dri:objIdentifier"]?.["$"] ?? Math.random()}`,
        source_type: "paper",
        title: typeof title === "string" ? title : String(title),
        text: typeof desc === "string" ? desc.slice(0, 1500) : "",
        authors_or_owner: authorList,
        institution_or_sponsor: "",
        date: typeof dateAcceptance === "string" ? dateAcceptance.slice(0, 10) : "",
        stage_hint: "unknown",
        url,
        metadata: {
          doi,
          source_label: "OpenAIRE",
        },
      };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("abort") && !msg.includes("timeout") && !msg.includes("TimeoutError")) {
      console.warn(`[search] OpenAIRE error: ${msg}`);
    }
    return [];
  }
}
