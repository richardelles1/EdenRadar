import type { RawSignal } from "../types";
import { quoteQuery } from "./query-utils";

const EPMC_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

function toRawSignal(item: any): RawSignal {
  const doi = item.doi ?? "";
  const url = doi ? `https://doi.org/${doi}` : `https://www.biorxiv.org`;
  const publisher: string = (item.bookOrReportDetails?.publisher ?? "").toLowerCase();
  return {
    id: `biorxiv-${doi || item.id || Math.random()}`,
    source_type: "preprint",
    title: item.title ?? "",
    text: item.abstractText ?? "",
    authors_or_owner: item.authorString ?? "",
    institution_or_sponsor: item.affiliation ?? "",
    date: item.firstPublicationDate ?? "",
    stage_hint: publisher.includes("medrxiv") ? "preclinical" : "preclinical",
    url,
    metadata: { doi, category: item.pubType, server: item.bookOrReportDetails?.publisher ?? "bioRxiv" },
  };
}

export async function searchBiorxiv(query: string, maxResults = 10): Promise<RawSignal[]> {
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

    const biorxivResults = results.filter((r) => {
      const pub = (r.bookOrReportDetails?.publisher ?? "").toLowerCase();
      return pub.includes("biorxiv") || pub === "";
    });

    const finalResults = biorxivResults.length > 0 ? biorxivResults : results;
    return finalResults.slice(0, maxResults).map(toRawSignal);
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}
