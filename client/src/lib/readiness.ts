import type { ResearchProject } from "@shared/schema";

export type ReadinessResult = { score: number; textColor: string; barColor: string; label: string };

export function computeReadinessScore(p: ResearchProject): ReadinessResult {
  let score = 0;
  if (p.description?.trim()) score += 10;
  if (p.primaryResearchQuestion?.trim()) score += 8;
  if (p.hypothesis?.trim()) score += 10;
  if ((p.keyPapers ?? []).length > 0) score += 15;
  if (p.methodology?.trim()) score += 8;
  if (p.patentStatus) score += 10;
  if (p.fundingStatus) score += 8;
  if (p.developmentStage && p.developmentStage !== "unknown") score += 7;
  if (p.discoveryTitle?.trim()) score += 12;
  if (p.discoverySummary?.trim()) score += 12;

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
