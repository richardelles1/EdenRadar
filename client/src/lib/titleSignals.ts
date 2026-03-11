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

const INDICATION_PATTERNS: [RegExp, string][] = [
  [/\bcancer\b|\btumor\b|\btumour\b|\bcarcinoma\b|\boncology\b|\bleukemia\b|\blymphoma\b|\bmelanoma\b|\bglioma\b|\bsarcoma\b|\bneoplasm\b|\bmalignant\b/i, "Oncology"],
  [/\bneurodegenerat\b|\balzheimer\b|\bparkinson\b|\b\bals\b|\bamyotrophic\b|\bepilepsy\b|\bseizure\b|\bstroke\b|\bneuropath\b|\bdementia\b/i, "CNS"],
  [/\bcardiac\b|\bheart\b|\bmyocardial\b|\batherosclerosis\b|\bhypertension\b|\bcoronar\b|\barrhythmia\b|\bheart failure\b/i, "Cardiovascular"],
  [/\bbacterial\b|\bviral\b|\bantifungal\b|\bantibiotic\b|\bantimicrobial\b|\bpathogen\b|\binfection\b|\bsepsis\b|\bHIV\b|\binfluenza\b|\bSARS\b|\bCOVID\b/i, "Infectious Disease"],
  [/\bdiabetes\b|\binsulin\b|\bobesity\b|\bfatty liver\b|\bnafld\b|\bmetabolic\b|\bglucose\b|\blipid\b|\bhyperglycemia\b/i, "Metabolic"],
  [/\brare disease\b|\borphan\b|\bgenetic disorder\b|\bdystrophy\b|\blysosomal\b|\bfabry\b|\bgaucher\b|\bpompe\b/i, "Rare Disease"],
  [/\blung\b|\bpulmonar\b|\basthma\b|\bcopd\b|\bfibrosis\b|\brespiratory\b|\bbronch\b|\bairway\b/i, "Respiratory"],
  [/\bautoimmune\b|\binflammation\b|\brheumatoid\b|\blupus\b|\bcrohn\b|\bcolitis\b|\bpsoriasis\b|\bimmunolog\b/i, "Immunology"],
  [/\bwound\b|\bbone\b|\borthopedic\b|\bcartilage\b|\btendon\b|\bspin\b|\bjoint\b|\bfracture\b/i, "Musculoskeletal"],
  [/\bophthalmolog\b|\bretinal\b|\bmacular\b|\bglaucoma\b|\bocular\b|\beye\b|\bcorneal\b/i, "Ophthalmology"],
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

export function detectIndication(name: string): string | null {
  for (const [pattern, label] of INDICATION_PATTERNS) {
    if (pattern.test(name)) return label;
  }
  return null;
}

function stageBonus(stage: string | null): number {
  if (!stage) return 0;
  const s = stage.toLowerCase();
  if (s.includes("phase 3")) return 43;
  if (s.includes("phase 2")) return 32;
  if (s.includes("phase 1")) return 22;
  if (s.includes("preclinical")) return 12;
  if (s.includes("discovery")) return 5;
  if (s.includes("approved")) return 20;
  return 0;
}

export function computeCommercialScore(asset: IngestedAsset): number {
  const name = asset.assetName;
  const stage = detectStage(name, asset.developmentStage);
  const modality = detectModality(name);
  const indication = detectIndication(name);
  const wordCount = name.trim().split(/\s+/).length;

  let score = 55;
  score += stageBonus(stage);
  if (modality) score += 12;
  if (indication) score += 8;
  if (wordCount >= 6) score += 5;

  return Math.max(0, Math.min(100, score));
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
