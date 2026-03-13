import type { RawSignal } from "../types";

const BASE = "https://api.nsf.gov/services/v1/awards.json";

export async function searchNsfAwards(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      keyword: query,
      printFields: "id,title,abstractText,piFirstName,piLastName,awardeeName,date,startDate,expDate,fundProgramName,awardeeName",
      offset: "1",
      rpp: String(maxResults),
    });

    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`NSF Awards API error: ${res.status}`);
    const data = await res.json();
    const awards: any[] = data?.response?.award ?? [];

    return awards.filter((a) => a.title).map((a): RawSignal => {
      const piName = [a.piFirstName, a.piLastName].filter(Boolean).join(" ");
      const startDate = a.startDate ?? a.date ?? "";
      const dateFormatted = startDate ? convertNsfDate(startDate) : "";

      return {
        id: `nsf-${a.id || Math.random()}`,
        source_type: "grant",
        title: a.title,
        text: a.abstractText ?? "",
        authors_or_owner: piName,
        institution_or_sponsor: a.awardeeName ?? "",
        date: dateFormatted,
        stage_hint: "preclinical",
        url: a.id ? `https://www.nsf.gov/awardsearch/showAward?AWD_ID=${a.id}` : "https://www.nsf.gov",
        metadata: {
          award_id: a.id,
          program: a.fundProgramName ?? "",
          institution: a.awardeeName ?? "",
          source_label: "NSF Awards",
        },
      };
    });
  } catch (err) {
    console.error("NSF Awards search error:", err);
    return [];
  }
}

function convertNsfDate(d: string): string {
  const parts = d.split("/");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  }
  return d;
}
