import { searchPubMed } from "./pubmed";
import { searchBiorxiv } from "./biorxiv";
import { searchMedrxiv } from "./medrxiv";
import { searchClinicalTrials } from "./clinicaltrials";
import { searchPatents } from "./patents";
import { searchTechTransfer } from "./techtransfer/index";
import { searchNihReporter } from "./nih_reporter";
import { searchOpenAlex } from "./openalex";
import type { RawSignal } from "../types";
import { db } from "../../db";
import { discoveryCards } from "@shared/schema";
import { eq, and } from "drizzle-orm";

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
  | "openalex"
  | "lab_discoveries";

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

async function searchLabDiscoveries(query: string): Promise<RawSignal[]> {
  const cards = await db.select().from(discoveryCards)
    .where(and(eq(discoveryCards.published, true), eq(discoveryCards.adminStatus, "approved")));

  const q = query.toLowerCase();
  const scored = cards
    .map((c) => {
      const text = `${c.title} ${c.summary} ${c.researchArea} ${c.technologyType} ${c.institution}`.toLowerCase();
      const words = q.split(/\s+/).filter(Boolean);
      const matches = words.filter((w) => text.includes(w)).length;
      return { card: c, score: matches };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return scored.map(({ card: c }): RawSignal => ({
    id: `lab-discovery-${c.id}`,
    source_type: "researcher",
    title: c.title,
    text: c.summary,
    authors_or_owner: c.contactEmail,
    institution_or_sponsor: c.institution,
    date: c.createdAt.toISOString().slice(0, 10),
    stage_hint: c.developmentStage,
    url: c.publicationLink ?? c.patentLink ?? undefined,
    metadata: {
      researchArea: c.researchArea,
      technologyType: c.technologyType,
      ipStatus: c.ipStatus,
      seeking: c.seeking,
      lab: c.lab,
    },
  }));
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
    description: "University technology licensing offices (138 institutions — DB-backed, updated nightly)",
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
  lab_discoveries: {
    id: "lab_discoveries",
    label: "Lab Discoveries",
    description: "Admin-curated researcher Discovery Cards — direct submissions from academic labs seeking licensing partners",
    search: searchLabDiscoveries,
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
