import { searchPubMed } from "./pubmed";
import { searchBiorxiv } from "./biorxiv";
import { searchMedrxiv } from "./medrxiv";
import { searchClinicalTrials } from "./clinicaltrials";
import { searchPatents } from "./patents";
import { searchTechTransfer } from "./techtransfer/index";
import type { RawSignal } from "../types";

export { type RawPaper } from "./pubmed";
export type { RawSignal };

export type SourceKey =
  | "pubmed"
  | "biorxiv"
  | "medrxiv"
  | "clinicaltrials"
  | "patents"
  | "techtransfer";

export interface DataSource {
  id: SourceKey;
  label: string;
  description: string;
  search(query: string, maxResults?: number): Promise<RawSignal[]>;
}

async function pubmedToSignals(query: string, maxResults = 10): Promise<RawSignal[]> {
  const papers = await searchPubMed(query, maxResults);
  return papers.map(
    (p): RawSignal => ({
      id: `pubmed-${p.pmid}`,
      source_type: "paper",
      title: p.title,
      text: p.abstract,
      authors_or_owner: "",
      institution_or_sponsor: "",
      date: p.year,
      stage_hint: "unknown",
      url: p.url,
      metadata: { pmid: p.pmid, journal: p.journal, year: p.year },
    })
  );
}

export const dataSources: Record<SourceKey, DataSource> = {
  pubmed: {
    id: "pubmed",
    label: "PubMed",
    description: "NCBI biomedical literature database",
    search: pubmedToSignals,
  },
  biorxiv: {
    id: "biorxiv",
    label: "bioRxiv",
    description: "Biology preprint server (last 90 days)",
    search: searchBiorxiv,
  },
  medrxiv: {
    id: "medrxiv",
    label: "medRxiv",
    description: "Clinical/health sciences preprint server (last 90 days)",
    search: searchMedrxiv,
  },
  clinicaltrials: {
    id: "clinicaltrials",
    label: "ClinicalTrials.gov",
    description: "US clinical trial registry",
    search: searchClinicalTrials,
  },
  patents: {
    id: "patents",
    label: "Patents",
    description: "USPTO patent database via PatentsView",
    search: searchPatents,
  },
  techtransfer: {
    id: "techtransfer",
    label: "Tech Transfer",
    description: "University technology licensing offices",
    search: searchTechTransfer,
  },
};

export function getSource(key: string): DataSource {
  if (key in dataSources) return dataSources[key as SourceKey];
  return dataSources.pubmed;
}

export async function collectAllSignals(
  query: string,
  sourceKeys: SourceKey[],
  maxPerSource = 8
): Promise<RawSignal[]> {
  const selectedSources = sourceKeys
    .filter((k) => k in dataSources)
    .map((k) => dataSources[k]);

  const results = await Promise.allSettled(
    selectedSources.map((s) => s.search(query, maxPerSource))
  );

  const signals: RawSignal[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      signals.push(...r.value);
    } else {
      console.error(`Source ${selectedSources[i].id} failed:`, r.reason);
    }
  });

  return signals;
}
