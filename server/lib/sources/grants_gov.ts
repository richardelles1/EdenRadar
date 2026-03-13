import type { RawSignal } from "../types";

const GRANTS_GOV_API = "https://apply07.grants.gov/grantsws/rest/opportunities/search/";

interface GrantsGovOpportunity {
  id: string;
  number: string;
  title: string;
  agency: string;
  agencyCode: string;
  openDate: string;
  closeDate: string;
  oppStatus: string;
  docType: string;
  cfdaList?: string[];
}

function parseGrantDate(raw: string | null | undefined): string {
  if (!raw) return "";
  const parts = raw.split("/");
  if (parts.length === 3) {
    const [month, day, year] = parts;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return raw;
}

function toRawSignal(opp: GrantsGovOpportunity): RawSignal {
  const closeDate = parseGrantDate(opp.closeDate);
  const openDate = parseGrantDate(opp.openDate);

  return {
    id: `grants-gov-${opp.id}`,
    source_type: "grant",
    title: opp.title || "Untitled Opportunity",
    text: opp.title || "",
    authors_or_owner: "",
    institution_or_sponsor: opp.agency || "",
    date: closeDate || openDate,
    stage_hint: "open_funding",
    url: `https://www.grants.gov/search-results-detail/${opp.id}`,
    metadata: {
      opp_num: opp.number,
      open_date: openDate,
      close_date: closeDate,
      opp_status: opp.oppStatus,
      doc_type: opp.docType,
      cfda: opp.cfdaList,
      source_label: "Grants.gov",
    },
  };
}

export async function searchGrantsGov(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const body = {
      keyword: query,
      oppStatuses: "posted|forecasted",
      rows: maxResults,
      sortBy: "closeDate|asc",
    };

    const res = await fetch(GRANTS_GOV_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`Grants.gov API error: ${res.status}`);
    const data = await res.json();
    const opps: GrantsGovOpportunity[] = data?.oppHits ?? [];
    return opps.filter((o) => o.title).map(toRawSignal);
  } catch (err) {
    console.error("Grants.gov search error:", err);
    return [];
  }
}
