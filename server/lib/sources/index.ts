import { searchPubMed } from "./pubmed";
import { searchBiorxiv } from "./biorxiv";
import { searchMedrxiv } from "./medrxiv";
import { searchClinicalTrials } from "./clinicaltrials";
import { searchPatents } from "./patents";
import { searchTechTransfer } from "./techtransfer/index";
import { searchNihReporter } from "./nih_reporter";
import { searchOpenAlex } from "./openalex";
import type { RawSignal } from "../types";

export { type RawPaper } from "./pubmed";
export type { RawSignal };

export type SourceKey =
  | "pubmed"
  | "biorxiv"
  | "medrxiv"
  | "clinicaltrials"
  | "patents"
  | "techtransfer"
  | "nih_reporter"
  | "openalex";

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
      date: p.date || p.year,
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
    description: "Biology preprints via Europe PMC full-text search",
    search: searchBiorxiv,
  },
  medrxiv: {
    id: "medrxiv",
    label: "medRxiv",
    description: "Clinical/health sciences preprints via Europe PMC full-text search",
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
    description: "University technology licensing offices (28 institutions, ~224 listings)",
    search: searchTechTransfer,
  },
  nih_reporter: {
    id: "nih_reporter",
    label: "NIH Reporter",
    description: "NIH-funded research projects (2023–2025) — leading-edge funded science",
    search: searchNihReporter,
  },
  openalex: {
    id: "openalex",
    label: "OpenAlex",
    description: "Open scholarly database — broader journal coverage beyond PubMed",
    search: searchOpenAlex,
  },
};

export function getSource(key: string): DataSource {
  if (key in dataSources) return dataSources[key as SourceKey];
  return dataSources.pubmed;
}

export async function collectAllSignals(
  query: string,
  sourceKeys: SourceKey[],
  maxPerSource = 12
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
