import type { ResearchProject } from "@shared/schema";

export type ReadinessResult = { score: number; textColor: string; barColor: string; label: string };

export function computeReadinessScore(p: ResearchProject): ReadinessResult {
  let score = 0;

  // §1 Overview & Protocol (10pts)
  if (p.description?.trim()) score += 5;
  if (p.researchDomain) score += 3;
  if ((p as any).prosperoId?.trim()) score += 2;

  // §2 Research Question (10pts)
  if (p.primaryResearchQuestion?.trim()) score += 5;
  if (p.hypothesis?.trim()) score += 5;

  // §3 Eligibility Criteria (5pts)
  const elig = (p as any).eligibilityCriteria;
  if (elig?.inclusion?.length > 0) score += 3;
  if (elig?.exclusion?.length > 0) score += 2;

  // §4 Search Strategy (5pts)
  const search = (p as any).searchStrategy;
  if (search?.databases?.length > 0) score += 3;
  if (search?.searchStrings?.length > 0) score += 2;

  // §5 Screening (5pts)
  const papers = (p as any).screeningPapers ?? [];
  const included = papers.filter((x: any) => x.fullTextDecision === "include");
  if (papers.length > 0) score += 2;
  if (included.length > 0) score += 3;

  // §6 Literature (5pts)
  if ((p.keyPapers ?? []).length > 0) score += 5;

  // §7 Methods (7pts)
  if (p.methodology?.trim()) score += 4;
  if (p.experimentalDesign?.trim()) score += 3;

  // §8 Data Extraction (5pts)
  const extracted = (p as any).extractedData ?? [];
  if (extracted.length > 0) score += 5;

  // §9 Risk of Bias (5pts)
  const rob = (p as any).riskOfBias ?? [];
  if (rob.length > 0) score += 5;

  // §10 Evidence Synthesis (5pts)
  const synthesis = (p as any).evidenceSynthesisText;
  if (synthesis?.narrative?.trim()) score += 3;
  if (synthesis?.certaintyGrade) score += 2;

  // §11 Results (8pts)
  const results = (p as any).researchResults;
  if (results?.mainFindings?.trim()) score += 5;
  if (results?.conclusions?.trim()) score += 3;

  // §12 Discovery Card (15pts)
  if (p.discoveryTitle?.trim()) score += 7;
  if (p.discoverySummary?.trim()) score += 5;
  if (p.patentStatus) score += 3;

  // §13 Dissemination (5pts)
  const diss = (p as any).disseminationPlan;
  if (diss?.targetJournals?.length > 0) score += 3;
  if (diss?.timelineToSubmit) score += 2;

  // Cap at 100
  score = Math.min(score, 100);

  const textColor =
    score >= 70
      ? "text-emerald-600 dark:text-emerald-400"
      : score >= 40
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-500 dark:text-red-400";

  const barColor =
    score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";

  const label = score >= 70 ? "Strong" : score >= 40 ? "Developing" : "Early";

  return { score, textColor, barColor, label };
}
