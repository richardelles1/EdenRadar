import type { RawSignal } from "../types";
import { quoteQuery } from "./query-utils";

const EPMC_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

function toRawSignal(item: any): RawSignal {
  const doi = item.doi ?? "";
  const url = doi ? `https://doi.org/${doi}` : `https://www.medrxiv.org`;
  return {
    id: `medrxiv-${doi || item.id || Math.random()}`,
    source_type: "preprint",
    title: item.title ?? "",
    text: item.abstractText ?? "",
    authors_or_owner: item.authorString ?? "",
    institution_or_sponsor: item.affiliation ?? "",
    date: item.firstPublicationDate ?? "",
    stage_hint: "preclinical",
    url,
    metadata: { doi, category: item.pubType, server: item.bookOrReportDetails?.publisher ?? "medRxiv" },
  };
}

export async function searchMedrxiv(query: string, maxResults = 10): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      query: quoteQuery(query),
      source: "PPR",
      format: "json",
      resultType: "core",
      pageSize: String(maxResults * 3),
    });
    const url = `${EPMC_BASE}?${params}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) throw new Error(`Europe PMC preprint search failed: ${res.status}`);
    const data = await res.json();
    const results: any[] = data?.resultList?.result ?? [];

    const medrxivResults = results.filter((r) => {
      const pub = (r.bookOrReportDetails?.publisher ?? "").toLowerCase();
      return pub.includes("medrxiv");
    });

    const finalResults = medrxivResults.length > 0 ? medrxivResults : results;
    return finalResults.slice(0, maxResults).map(toRawSignal);
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}
