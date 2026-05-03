export type SourceType =
  | "paper"
  | "preprint"
  | "clinical_trial"
  | "patent"
  | "tech_transfer"
  | "grant"
  | "dataset"
  | "researcher";

export interface RawSignal {
  id: string;
  source_type: SourceType;
  title: string;
  text: string;
  authors_or_owner: string;
  institution_or_sponsor: string;
  date: string;
  stage_hint: string;
  url: string;
  metadata: Record<string, unknown>;
}

export interface ScoreBreakdown {
  novelty: number;
  freshness: number;
  readiness: number;
  licensability: number;
  fit: number;
  competition: number;
  total: number;
  signal_coverage?: number;
  scored_dimensions?: string[];
  dimension_basis?: Record<string, string>;
  /** 0-1, factor used to penalize the final score (1.0 = no penalty). */
  confidence_factor?: number;
  /** 0-1, classifier confidence forwarded for diagnostics. */
  category_confidence?: number;
}

export interface ScoredAsset {
  id: string;
  asset_name: string;
  target: string;
  modality: string;
  indication: string;
  development_stage: string;
  owner_name: string;
  owner_type: "university" | "company" | "unknown";
  institution: string;
  patent_status: string;
  licensing_status: string;
  summary: string;
  why_it_matters: string;
  evidence_count: number;
  source_types: SourceType[];
  source_urls: string[];
  latest_signal_date: string;
  score: number;
  score_breakdown: ScoreBreakdown;
  matching_tags: string[];
  confidence: "high" | "medium" | "low";
  /** Raw 0-1 classifier confidence (when known). */
  category_confidence?: number;
  contact_office?: string;
  signals: RawSignal[];
}

export interface BuyerProfile {
  therapeutic_areas: string[];
  modalities: string[];
  preferred_stages: string[];
  excluded_stages: string[];
  owner_type_preference: "university" | "company" | "any";
  freshness_days: number;
  indication_keywords: string[];
  target_keywords: string[];
  notes: string;
}

export const DEFAULT_BUYER_PROFILE: BuyerProfile = {
  therapeutic_areas: [],
  modalities: [],
  preferred_stages: [],
  excluded_stages: [],
  owner_type_preference: "any",
  freshness_days: 365,
  indication_keywords: [],
  target_keywords: [],
  notes: "",
};

export interface ReportPayload {
  title: string;
  executive_summary: string;
  buyer_profile_summary: string;
  top_assets: ScoredAsset[];
  narrative: string;
  query: string;
  generated_at: string;
}

export interface DossierPayload {
  asset: ScoredAsset;
  narrative: string;
  generated_at: string;
}
