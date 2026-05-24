export type SourceType =
  | "paper"
  | "preprint"
  | "clinical_trial"
  | "patent"
  | "tech_transfer"
  | "researcher";

export interface SignalEvent {
  id: number;
  event_type: "stage_change" | "first_indexed" | "content_update" | "citation_update" | string;
  payload?: Record<string, unknown> | null;
  occurred_at: string;
}

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
  search_relevance?: number;
  record_quality?: number;
  availability?: number;
  total: number;
  signal_coverage?: number;
  scored_dimensions?: string[];
  dimension_basis?: Record<string, string>;
  confidence_factor?: number;
  category_confidence?: number;
  text_relevance?: number;
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
  category_confidence?: number;
  asset_class?: string | null;
  contact_office?: string;
  stage_changed_at?: string | null;
  previous_stage?: string | null;
  signals: RawSignal[];
  dataSparse?: boolean;
  completeness_score?: number | null;
  last_seen_at?: string | null;
  biology?: string | null;
  momentum_score?: number | null;
  institutions?: string[];
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
