import type { RawSignal } from "../types";

const GRANTS_GOV_API = "https://apply07.grants.gov/grantsws/rest/opportunities/search/";

interface GrantsGovOpportunity {
  id: number;
  oppNum: string;
  oppTitle: string;
  agencyName: string;
  openDate: string;
  closeDate: string;
  awardCeiling: number;
  awardFloor: number;
  synopsis: string;
  docType: string;
  categoryOfFundingActivity: string;
}

function formatDate(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toISOString().slice(0, 10);
  } catch {
    return raw;
  }
}

function formatCurrency(amount: number | null | undefined): string {
  if (!amount || amount <= 0) return "";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

function toRawSignal(opp: GrantsGovOpportunity): RawSignal {
  const closeDate = formatDate(opp.closeDate);
  const openDate = formatDate(opp.openDate);
  const ceiling = formatCurrency(opp.awardCeiling);
  const floor = formatCurrency(opp.awardFloor);
  const awardRange = ceiling && floor ? `${floor} – ${ceiling}` : ceiling || floor || "";

  return {
    id: `grants-gov-${opp.id}`,
    source_type: "grant",
    title: opp.oppTitle || "Untitled Opportunity",
    text: opp.synopsis || opp.oppTitle || "",
    authors_or_owner: "",
    institution_or_sponsor: opp.agencyName || "",
    date: closeDate || openDate,
    stage_hint: "open_funding",
    url: `https://www.grants.gov/search-results-detail/${opp.id}`,
    metadata: {
      opp_num: opp.oppNum,
      open_date: openDate,
      close_date: closeDate,
      award_ceiling: opp.awardCeiling,
      award_floor: opp.awardFloor,
      award_range: awardRange,
      category: opp.categoryOfFundingActivity,
      doc_type: opp.docType,
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
    return opps.filter((o) => o.oppTitle).map(toRawSignal);
  } catch (err) {
    console.error("Grants.gov search error:", err);
    return [];
  }
}
