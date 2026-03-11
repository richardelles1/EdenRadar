import type { IngestedAsset } from "@shared/schema";

const MODALITY_PATTERNS: [RegExp, string][] = [
  [/\bcar[\s-]?t\b/i, "CAR-T"],
  [/\bbispecific\b/i, "Bispecific Ab"],
  [/\badc\b|\bantibody[\s-]drug conjugate/i, "ADC"],
  [/\bsirna\b|\brnai\b|\bshRNA\b/i, "siRNA"],
  [/\bmrna\b|\bm-rna\b/i, "mRNA"],
  [/\bcrispr\b|\bcas9\b|\bcas-9\b|\bgene edit/i, "Gene Editing"],
  [/\bgene therapy\b|\bgene transfer\b|\bviral vector\b|\baav\b|\badeno-associated\b/i, "Gene Therapy"],
  [/\bcell therapy\b|\bstem cell\b|\bcar[\s-]nk\b/i, "Cell Therapy"],
  [/\bantibody\b|\bmonoclonal\b|\bmab\b|\bimmunoglobulin\b/i, "Antibody"],
  [/\bprotac\b|\bdegrader\b|\btargeted protein\b/i, "PROTAC"],
  [/\bpeptide\b|\bstapled peptide\b|\bcyclic peptide\b/i, "Peptide"],
  [/\bvaccine\b|\bimmunization\b/i, "Vaccine"],
  [/\bnanoparticle\b|\bnano[\s-]particle\b|\bliposom/i, "Nanoparticle"],
  [/\bsmall molecule\b|\binhibitor\b|\bagonist\b|\bantagonist\b|\bcompound\b/i, "Small Molecule"],
];

const STAGE_PATTERNS: [RegExp, string][] = [
  [/\bphase\s*3\b|\bphase\s*iii\b/i, "phase 3"],
  [/\bphase\s*2\b|\bphase\s*ii\b/i, "phase 2"],
  [/\bphase\s*1\b|\bphase\s*i\b|\bind[\s-]enabling\b|\bind\s+filing\b/i, "phase 1"],
  [/\bclinical\b/i, "phase 1"],
  [/\bpreclinical\b|\bpre-clinical\b|\bin\s+vivo\b|\bin\s+vitro\b/i, "preclinical"],
  [/\bdiscovery\b|\blead\s+opt/i, "discovery"],
];

export function detectModality(name: string): string | null {
  for (const [pattern, label] of MODALITY_PATTERNS) {
    if (pattern.test(name)) return label;
  }
  return null;
}

export function detectStage(name: string, dbStage?: string): string | null {
  if (dbStage && dbStage !== "unknown") return dbStage;
  for (const [pattern, label] of STAGE_PATTERNS) {
    if (pattern.test(name)) return label;
  }
  return null;
}

function stageReadiness(stage: string | null): number {
  if (!stage) return 35;
  const s = stage.toLowerCase();
  if (s.includes("phase 3")) return 90;
  if (s.includes("phase 2")) return 80;
  if (s.includes("phase 1")) return 65;
  if (s.includes("preclinical")) return 50;
  if (s.includes("discovery")) return 30;
  if (s.includes("approved")) return 60;
  return 35;
}

function freshnessScore(firstSeenAt: Date | string): number {
  const days = Math.floor((Date.now() - new Date(firstSeenAt).getTime()) / 86400000);
  if (days <= 30) return 100;
  if (days <= 90) return 85;
  if (days <= 180) return 65;
  if (days <= 365) return 45;
  if (days <= 730) return 25;
  return 10;
}

export function computeCommercialScore(asset: IngestedAsset): number {
  const stage = detectStage(asset.assetName, asset.developmentStage);
  const readiness = stageReadiness(stage);
  const freshness = freshnessScore(asset.firstSeenAt);
  return Math.max(0, Math.min(100, Math.round(readiness * 0.5 + freshness * 0.5)));
}

export function formatRelativeTime(dt: Date | string): string {
  const days = Math.floor((Date.now() - new Date(dt).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}
