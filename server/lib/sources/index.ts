import { searchPubMed } from "./pubmed";
import { searchBiorxiv } from "./biorxiv";
import { searchMedrxiv } from "./medrxiv";
import { searchClinicalTrials } from "./clinicaltrials";
import { searchPatents } from "./patents";
import { searchTechTransfer } from "./techtransfer/index";
import { searchNihReporter } from "./nih_reporter";
import { searchOpenAlex } from "./openalex";
import { searchSemanticScholar } from "./semantic_scholar";
import { searchArxiv } from "./arxiv";
import { searchNsfAwards } from "./nsf_awards";
import { searchEuCordis } from "./eu_cordis";
import { searchLens } from "./lens";
import { searchEuropePmc } from "./europepmc";
import { searchZenodo } from "./zenodo";
import { searchEuClinicalTrials } from "./eu_clinicaltrials";
import { searchIsrctn } from "./isrctn";
import { searchGeo } from "./geo";
import { searchPdb } from "./pdb";
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
  | "lab_discoveries"
  | "semantic_scholar"
  | "arxiv"
  | "nsf_awards"
  | "eu_cordis"
  | "lens"
  | "europepmc"
  | "zenodo"
  | "eu_clinicaltrials"
  | "isrctn"
  | "geo"
  | "pdb";

export const ALL_SOURCE_KEYS: SourceKey[] = [
  "pubmed", "biorxiv", "medrxiv", "clinicaltrials", "patents", "techtransfer",
  "nih_reporter", "openalex", "lab_discoveries",
  "semantic_scholar", "arxiv", "nsf_awards", "eu_cordis", "lens",
  "europepmc", "zenodo", "eu_clinicaltrials", "isrctn", "geo", "pdb",
];

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
  semantic_scholar: {
    id: "semantic_scholar",
    label: "Semantic Scholar",
    description: "200M+ papers — AI-powered scholarly search with rich metadata",
    search: searchSemanticScholar,
  },
  arxiv: {
    id: "arxiv",
    label: "arXiv",
    description: "Preprints in physics, math, CS, and quantitative biology",
    search: searchArxiv,
  },
  nsf_awards: {
    id: "nsf_awards",
    label: "NSF Awards",
    description: "US National Science Foundation funded research grants",
    search: searchNsfAwards,
  },
  eu_cordis: {
    id: "eu_cordis",
    label: "EU CORDIS",
    description: "European research funding — Horizon Europe and FP projects",
    search: searchEuCordis,
  },
  lens: {
    id: "lens",
    label: "Lens.org",
    description: "Global patent search covering USPTO, EPO, and WIPO (requires LENS_API_KEY)",
    search: searchLens,
  },
  europepmc: {
    id: "europepmc",
    label: "Europe PMC",
    description: "Life sciences literature — 40M+ articles, preprints, patents, and clinical guidelines",
    search: searchEuropePmc,
  },
  zenodo: {
    id: "zenodo",
    label: "Zenodo",
    description: "Open research datasets, software, and preprints from CERN",
    search: searchZenodo,
  },
  eu_clinicaltrials: {
    id: "eu_clinicaltrials",
    label: "EU Clinical Trials",
    description: "European Clinical Trials Information System (CTIS)",
    search: searchEuClinicalTrials,
  },
  isrctn: {
    id: "isrctn",
    label: "ISRCTN",
    description: "UK/international clinical trials registry",
    search: searchIsrctn,
  },
  geo: {
    id: "geo",
    label: "GEO",
    description: "Gene Expression Omnibus — genomics datasets from NCBI",
    search: searchGeo,
  },
  pdb: {
    id: "pdb",
    label: "PDB",
    description: "Protein Data Bank — 3D structures of proteins and nucleic acids",
    search: searchPdb,
  },
};

export function getSource(key: string): DataSource {
  if (key in dataSources) return dataSources[key as SourceKey];
  return dataSources.pubmed;
}

const SOURCE_TIMEOUT_MS = 7000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Source "${label}" timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function collectAllSignals(
  query: string,
  sourceKeys: SourceKey[],
  maxPerSource = 5
): Promise<RawSignal[]> {
  const selectedSources = sourceKeys
    .filter((k) => k in dataSources)
    .map((k) => dataSources[k]);

  const results = await Promise.allSettled(
    selectedSources.map((s) =>
      withTimeout(s.search(query, maxPerSource), SOURCE_TIMEOUT_MS, s.id)
    )
  );

  const signals: RawSignal[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      signals.push(...r.value);
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      if (msg.includes("timed out")) {
        console.warn(`[search] ${msg}`);
      } else {
        console.error(`[search] Source ${selectedSources[i].id} failed:`, r.reason);
      }
    }
  });

  return signals;
}
