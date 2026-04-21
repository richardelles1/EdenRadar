import crypto from "crypto";
import { cacheGet, cacheSet } from "./lib/responseCache";
import type { Express } from "express";
import { createServer, type Server } from "http";
import mammoth from "mammoth";
import { storage } from "./storage";
import { insertDiscoveryCardSchema, insertResearchProjectSchema, insertSavedReferenceSchema, insertSavedGrantSchema, insertConceptCardSchema, conceptCards, conceptInterests, researchProjects, userAlerts, type UserAlert, type InsertResearchProject, type IngestedAsset, ingestedAssets, pipelineLists, savedAssets, insertManualInstitutionSchema, SAVED_ASSET_STATUSES } from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, desc } from "drizzle-orm";
import { computeCompletenessScore } from "./lib/pipeline/contentHash";
import { makeFingerprint } from "./lib/ingestion";
import { classifyBatch } from "./lib/pipeline/classifyAsset";
import OpenAI from "openai";
import multer from "multer";
import { dataSources, collectAllSignals, ALL_SOURCE_KEYS, type SourceKey } from "./lib/sources/index";
import { normalizeSignals } from "./lib/pipeline/normalizeSignals";
import { clusterAssets } from "./lib/pipeline/clusterAssets";
import { scoreAssets, scoreNovelty, scoreReadiness, scoreLicensability, scoreCompetition, computeTotal } from "./lib/pipeline/scoreAssets";
import { generateReport } from "./lib/pipeline/generateReport";
import { generateDossier } from "./lib/pipeline/generateDossier";
import { isFatalOpenAIError } from "./lib/llm";
import type { BuyerProfile, ScoredAsset } from "./lib/types";
import { z } from "zod";
import { runIngestionPipeline, isIngestionRunning, getEnrichingCount, getScrapingProgress, getUpsertProgress, isSyncRunning, getSyncRunningFor, getActiveSyncs, runInstitutionSync, tryAcquireSyncLock, releaseSyncLock } from "./lib/ingestion";
import { getSchedulerStatus, startScheduler, pauseScheduler, resetAndStartScheduler, bumpToFront, setDelay, invalidateHealthCacheEntry, startTierOnly, setConcurrency, getMaxHttpConcurrent, getScraperHealthCache, cancelCurrentSync, loadFdaDesignationHealth } from "./lib/scheduler";
import { getAllScraperHealth, clearScraperBackoff, updateScraperHealth } from "./lib/scraperState";
import { ALL_SCRAPERS, getScraperTier } from "./lib/scrapers/index";
import { reEnrichAsset } from "./lib/scrapers/enrichAsset";
import { deepEnrichBatch } from "./lib/pipeline/deepEnrichBatch";
import { runFdaDesignationMatch } from "./lib/fda-designations";
import { embedAssets } from "./lib/pipeline/embedAssets";
import { embedQuery, ragQuery, directQuery, aggregationQuery, isConversational, isAggregationQuery, resolveAggregationQuery, fetchPortfolioStats, parseQueryFilters, hasMeaningfulFilters, getOrUpdateSessionFocus, GEO_INSTITUTION_REGEX, detectInstitutionName, detectAllInstitutionNames, isDefinitionalQuery, detectBackReference, extractBackRefPosition, extractBackRefInstitution, rerankAssets, persistSessionFocus, seedSessionFocusFromDb, conceptQuery, deriveEngagementSignals, markEngagementReset, isEngagementResetMessage, isComparativeQuery, compareQuery, type UserContext, type SessionFocusContext } from "./lib/eden/rag";
import { verifyResearcherAuth, verifyConceptAuth, verifyAnyAuth, tryGetUserId } from "./lib/supabaseAuth";
import { ALL_PORTAL_ROLES } from "@shared/portals";
import type { RawSignal } from "./lib/types";
import { sendWelcomeEmail, sendTeamInviteEmail, sendAccountDeletionEmail } from "./email";

const SOURCE_TYPE_MAP: Record<string, string[]> = {
  publication: ["paper"],
  preprint: ["preprint"],
  grant: ["grant"],
  clinical_trial: ["clinical_trial"],
  dataset: ["dataset"],
  patent: ["patent"],
  conference_abstract: ["paper"],
};

const FIELD_SYNONYMS: Record<string, string[]> = {
  oncology: ["oncology", "cancer", "tumor", "tumour", "carcinoma", "neoplasm", "malignant"],
  immunology: ["immunology", "immune", "autoimmune", "immunotherapy", "antibody"],
  neurology: ["neurology", "neurological", "brain", "neural", "neurodegenerative", "alzheimer", "parkinson", "cns"],
  cardiology: ["cardiology", "cardiovascular", "cardiac", "heart", "vascular", "atherosclerosis"],
  rare_diseases: ["rare disease", "orphan", "rare disorder", "ultra-rare"],
  infectious_disease: ["infectious disease", "infection", "pathogen", "antimicrobial", "antiviral", "antibiotic"],
  metabolic: ["metabolic", "metabolism", "diabetes", "obesity", "lipid", "cholesterol"],
  ophthalmology: ["ophthalmology", "ophthalmic", "retinal", "ocular", "eye disease", "macular"],
  dermatology: ["dermatology", "skin", "dermal", "psoriasis", "eczema", "cutaneous"],
  respiratory: ["respiratory", "pulmonary", "lung", "asthma", "copd", "airway"],
  gastroenterology: ["gastroenterology", "gastrointestinal", "gi tract", "liver", "hepatic", "crohn"],
  hematology: ["hematology", "haematology", "blood", "leukemia", "lymphoma", "anemia"],
  musculoskeletal: ["musculoskeletal", "bone", "joint", "arthritis", "osteoporosis", "orthopedic"],
  psychiatry: ["psychiatry", "psychiatric", "mental health", "depression", "anxiety", "schizophrenia"],
};

const TECH_SYNONYMS: Record<string, string[]> = {
  small_molecule: ["small molecule", "compound", "inhibitor", "oral drug", "chemical entity"],
  biologic: ["biologic", "biological", "biosimilar", "protein therapeutic", "recombinant"],
  gene_therapy: ["gene therapy", "gene editing", "crispr", "aav", "viral vector", "genetic"],
  cell_therapy: ["cell therapy", "car-t", "stem cell", "cellular therapy", "adoptive cell"],
  antibody: ["antibody", "monoclonal", "mab", "bispecific", "nanobody", "immunoglobulin"],
  vaccine: ["vaccine", "vaccination", "immunization", "mrna vaccine", "adjuvant"],
  diagnostic: ["diagnostic", "biomarker", "assay", "companion diagnostic", "imaging"],
  medical_device: ["medical device", "implant", "surgical", "wearable", "device"],
};

const PHASE_MAP: Record<string, string[]> = {
  preclinical: ["preclinical", "discovery"],
  phase_1: ["phase 1"],
  phase_2: ["phase 2"],
  phase_3: ["phase 3"],
  phase_4: ["phase 4"],
  approved: ["approved", "phase 4 approved", "post-market"],
};

function applySignalFilters(
  signals: RawSignal[],
  filters: { sourceType?: string; dateRange?: string; trialPhase?: string; field?: string; technologyType?: string }
): RawSignal[] {
  let filtered = signals;

  if (filters.field) {
    const terms = FIELD_SYNONYMS[filters.field] ?? [filters.field.replace(/_/g, " ")];
    filtered = filtered.filter((s) => {
      const haystack = `${s.title} ${s.text}`.toLowerCase();
      return terms.some((t) => haystack.includes(t));
    });
  }

  if (filters.technologyType) {
    const terms = TECH_SYNONYMS[filters.technologyType] ?? [filters.technologyType.replace(/_/g, " ")];
    filtered = filtered.filter((s) => {
      const haystack = `${s.title} ${s.text}`.toLowerCase();
      return terms.some((t) => haystack.includes(t));
    });
  }

  if (filters.sourceType) {
    const allowed = SOURCE_TYPE_MAP[filters.sourceType] ?? [filters.sourceType];
    filtered = filtered.filter((s) => allowed.includes(s.source_type));
  }

  if (filters.dateRange) {
    const now = new Date();
    let cutoff: Date;
    switch (filters.dateRange) {
      case "30d": cutoff = new Date(now.getTime() - 30 * 86400000); break;
      case "6m": cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()); break;
      case "1y": cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break;
      case "5y": cutoff = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate()); break;
      default: cutoff = new Date(0);
    }
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    filtered = filtered.filter((s) => {
      if (!s.date) return true;
      return s.date >= cutoffStr;
    });
  }

  if (filters.trialPhase) {
    const allowed = PHASE_MAP[filters.trialPhase] ?? [filters.trialPhase];
    filtered = filtered.filter((s) => {
      if (s.source_type !== "clinical_trial") return false;
      const hint = s.stage_hint.toLowerCase();
      return allowed.some((p) => hint.includes(p));
    });
  }

  return filtered;
}

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "as", "be", "was", "are",
  "were", "been", "being", "have", "has", "had", "do", "does", "did",
  "will", "would", "shall", "should", "may", "might", "can", "could",
  "not", "no", "this", "that", "these", "those", "its", "my", "your",
  "his", "her", "our", "their", "what", "which", "who", "whom",
  "how", "when", "where", "why", "all", "each", "every", "both",
  "few", "more", "most", "other", "some", "such", "than", "too",
  "very", "just", "about", "above", "after", "again", "between",
  "into", "through", "during", "before", "below", "up", "down",
  "out", "off", "over", "under", "further", "then", "once",
  "any", "only", "own", "same", "so", "if", "also", "new", "using",
  "use", "used", "based", "study", "research", "results", "analysis",
  "data", "method", "methods", "effect", "effects", "model",
]);

function applyRelevanceFilter(signals: RawSignal[], query: string): RawSignal[] {
  if (signals.length <= 5) return signals;

  const queryTokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  if (queryTokens.length === 0) return signals;

  return signals.filter((s) => {
    const haystack = `${s.title} ${s.text}`.toLowerCase();
    return queryTokens.some((token) => haystack.includes(token));
  });
}

function friendlyOpenAIError(err: unknown): string {
  if (isFatalOpenAIError(err)) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("401") || msg.includes("invalid_api_key") || msg.includes("Incorrect API key")) {
      return "OpenAI API key is invalid. Please check the OPENAI_API_KEY secret in your Replit settings.";
    }
    if (msg.includes("429") || msg.includes("quota") || msg.includes("insufficient_quota")) {
      return "OpenAI quota exceeded or rate limited. Please check your OpenAI account billing.";
    }
  }
  if (err instanceof Error) return err.message;
  return "Search failed. Please try again.";
}

const ALL_SOURCES = ALL_SOURCE_KEYS;

const buyerProfileSchema = z.object({
  therapeutic_areas: z.array(z.string()).default([]),
  modalities: z.array(z.string()).default([]),
  preferred_stages: z.array(z.string()).default([]),
  excluded_stages: z.array(z.string()).default([]),
  owner_type_preference: z.enum(["university", "company", "any"]).default("any"),
  freshness_days: z.number().int().min(1).max(3650).default(365),
  indication_keywords: z.array(z.string()).default([]),
  target_keywords: z.array(z.string()).default([]),
  notes: z.string().default(""),
}).optional();

const searchBodySchema = z.object({
  query: z.string().min(1).max(500),
  sources: z.array(z.string()).default(ALL_SOURCES),
  maxPerSource: z.number().int().min(1).max(200).default(25),
  buyerProfile: buyerProfileSchema,
  field: z.enum([
    "oncology", "immunology", "neurology", "cardiology", "rare_diseases",
    "infectious_disease", "metabolic", "ophthalmology", "dermatology",
    "respiratory", "gastroenterology", "hematology", "musculoskeletal", "psychiatry",
  ]).optional(),
  sourceType: z.enum(["publication", "preprint", "grant", "clinical_trial", "dataset", "patent", "conference_abstract"]).optional(),
  dateRange: z.enum(["30d", "6m", "1y", "5y"]).optional(),
  technologyType: z.enum([
    "small_molecule", "biologic", "gene_therapy", "cell_therapy",
    "antibody", "vaccine", "diagnostic", "medical_device",
  ]).optional(),
  trialPhase: z.enum(["preclinical", "phase_1", "phase_2", "phase_3", "phase_4", "approved"]).optional(),
});

const reportBodySchema = z.object({
  query: z.string().min(1).max(500),
  sources: z.array(z.string()).default(ALL_SOURCES),
  maxPerSource: z.number().int().min(1).max(200).default(20),
  buyerProfile: buyerProfileSchema,
});

const dossierBodySchema = z.object({
  asset: z.any(),
});

const saveAssetBodySchema = z.object({
  ingested_asset_id: z.number().int().optional(),
  pipeline_list_id: z.number().int().optional().nullable(),
  asset_name: z.string(),
  target: z.string(),
  modality: z.string(),
  development_stage: z.string(),
  disease_indication: z.string(),
  summary: z.string(),
  source_title: z.string(),
  source_journal: z.string(),
  publication_year: z.string(),
  source_name: z.string().default("pubmed"),
  source_url: z.string().optional(),
  pmid: z.string().optional(),
});

const DEFAULT_BUYER_PROFILE: BuyerProfile = {
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/sources", (_req, res) => {
    const sources = Object.values(dataSources).map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
    }));
    res.json({ sources });
  });

  app.post("/api/search", async (req, res) => {
    try {
      const { query, sources, maxPerSource, buyerProfile, field, sourceType, dateRange, technologyType, trialPhase } = searchBodySchema.parse(req.body);
      const validSources = sources.filter((s): s is SourceKey => s in dataSources) as SourceKey[];
      const effectiveSources = validSources.length > 0 ? validSources : ALL_SOURCES;

      const enrichedQuery = [query, field, technologyType].filter(Boolean).join(" ");

      const profileFingerprint = buyerProfile
        ? crypto.createHash("sha256").update(JSON.stringify(buyerProfile)).digest("hex").slice(0, 16)
        : "default";
      const searchCacheKey = `search:${enrichedQuery}:${[...effectiveSources].sort().join(",")}:${maxPerSource ?? ""}:${field ?? ""}:${sourceType ?? ""}:${dateRange ?? ""}:${technologyType ?? ""}:${trialPhase ?? ""}:${profileFingerprint}`;
      const cachedSearch = cacheGet<object>(searchCacheKey);
      if (cachedSearch) return res.json(cachedSearch);

      let signals = await collectAllSignals(enrichedQuery, effectiveSources, maxPerSource);

      signals = applySignalFilters(signals, { sourceType, dateRange, trialPhase, field, technologyType });
      signals = signals.slice(0, 150);

      if (signals.length === 0) {
        await storage.createSearchHistory({ query, source: effectiveSources.join(","), resultCount: 0 });
        const emptySearchResponse = { assets: [], query, sources: effectiveSources, signalsFound: 0 };
        cacheSet(searchCacheKey, emptySearchResponse, 5 * 60 * 1000);
        return res.json(emptySearchResponse);
      }

      let normalized: Partial<import("./lib/types").ScoredAsset>[];
      try {
        normalized = await normalizeSignals(signals);
      } catch (normErr) {
        console.error("normalizeSignals failed, falling back to raw signals:", normErr);
        normalized = signals.map((s) => ({
          id: crypto.randomUUID().slice(0, 8),
          asset_name: s.title || "unknown",
          target: "unknown",
          modality: "unknown",
          indication: "unknown",
          development_stage: s.stage_hint || "unknown",
          owner_name: s.institution_or_sponsor || s.authors_or_owner || "unknown",
          owner_type: "unknown" as const,
          institution: s.institution_or_sponsor || "unknown",
          licensing_status: "unknown",
          patent_status: "unknown",
          summary: s.text?.slice(0, 200) || "",
          why_it_matters: "",
          source_types: [s.source_type],
          source_urls: [s.url],
          latest_signal_date: s.date,
          matching_tags: [],
          evidence_count: 1,
          confidence: "low" as const,
          signals: [s],
        }));
      }

      const clustered = clusterAssets(normalized);
      const profile = buyerProfile ?? DEFAULT_BUYER_PROFILE;

      let scored: import("./lib/types").ScoredAsset[];
      try {
        scored = await scoreAssets(clustered, profile);
      } catch (scoreErr) {
        console.error("scoreAssets failed, returning clustered results without scores:", scoreErr);
        scored = clustered.map((a) => ({
          id: a.id ?? crypto.randomUUID().slice(0, 8),
          asset_name: a.asset_name ?? "unknown",
          target: a.target ?? "unknown",
          modality: a.modality ?? "unknown",
          indication: a.indication ?? "unknown",
          development_stage: a.development_stage ?? "unknown",
          owner_name: a.owner_name ?? "unknown",
          owner_type: a.owner_type ?? "unknown",
          institution: a.institution ?? "unknown",
          patent_status: a.patent_status ?? "unknown",
          licensing_status: a.licensing_status ?? "unknown",
          summary: a.summary ?? "",
          why_it_matters: "",
          evidence_count: a.evidence_count ?? 1,
          source_types: a.source_types ?? [],
          source_urls: a.source_urls ?? [],
          latest_signal_date: a.latest_signal_date ?? "",
          score: 0,
          score_breakdown: { freshness: 0, novelty: 0, readiness: 0, licensability: 0, fit: 0, competition: 0, total: 0 },
          matching_tags: a.matching_tags ?? [],
          confidence: a.confidence ?? "low",
          signals: a.signals ?? [],
        }));
      }

      await storage.createSearchHistory({ query, source: effectiveSources.join(","), resultCount: scored.length });

      const searchResponse = {
        assets: scored,
        query,
        sources: effectiveSources,
        signalsFound: signals.length,
        assetsFound: scored.length,
      };
      cacheSet(searchCacheKey, searchResponse, 45 * 60 * 1000);
      return res.json(searchResponse);
    } catch (err: any) {
      console.error("Search error:", err);
      return res.status(500).json({ error: friendlyOpenAIError(err) });
    }
  });

  app.post("/api/scout/search", async (req, res) => {
    try {
      const schema = z.object({
        query: z.string().min(1).max(500),
        minSimilarity: z.number().min(0.40).max(1).default(0.40),
        modality: z.string().optional(),
        stage: z.string().optional(),
        indication: z.string().optional(),
        institution: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(100),
        since: z.string().optional(),
        before: z.string().optional(),
      });
      const { query, minSimilarity, modality, stage, indication, institution, limit, since, before } = schema.parse(req.body);
      const sinceDate = since && !isNaN(Date.parse(since)) ? new Date(since) : undefined;
      const beforeDate = before && !isNaN(Date.parse(before)) ? new Date(before) : undefined;

      let results: import("./storage").RetrievedAsset[] = [];

      const searchOpts = { modality, stage, indication, institution, since: sinceDate, before: beforeDate };
      results = await storage.keywordSearchIngestedAssets(query, limit, searchOpts);

      const assets: ScoredAsset[] = results.map((r) => {
        const partialAsset: Partial<ScoredAsset> = {
          development_stage: r.developmentStage,
          licensing_status: r.licensingReadiness ?? "unknown",
          owner_name: r.institution,
          owner_type: "university",
          source_types: ["tech_transfer"],
          latest_signal_date: "",
          evidence_count: 1,
          patent_status: "unknown",
        };

        const freshnessResult  = { score: 0, hasData: false, basis: "No signal date available" };
        const noveltyResult    = scoreNovelty(partialAsset);
        const readinessResult  = scoreReadiness(partialAsset);
        const licensabilityResult = scoreLicensability(partialAsset);
        const competitionResult = scoreCompetition(partialAsset);
        const fitResult = { score: 0, hasData: false, basis: "No buyer profile configured" };

        const dimResults = {
          freshness:    freshnessResult,
          novelty:      noveltyResult,
          readiness:    readinessResult,
          licensability: licensabilityResult,
          fit:          fitResult,
          competition:  competitionResult,
        };

        const { total, signal_coverage, scored_dimensions, dimension_basis } = computeTotal(dimResults);
        const confidence: "high" | "medium" | "low" =
          signal_coverage >= 75 ? "high" : signal_coverage >= 50 ? "medium" : "low";

        return {
          id: String(r.id),
          asset_name: r.assetName,
          target: r.target,
          modality: r.modality,
          indication: r.indication,
          development_stage: r.developmentStage,
          institution: r.institution,
          summary: r.summary ?? "",
          why_it_matters: r.innovationClaim ?? "",
          source_urls: r.sourceUrl ? [r.sourceUrl] : [],
          source_types: ["tech_transfer"],
          score: total,
          score_breakdown: {
            freshness:    freshnessResult.score,
            novelty:      noveltyResult.score,
            readiness:    readinessResult.score,
            licensability: licensabilityResult.score,
            fit:          fitResult.score,
            competition:  competitionResult.score,
            total,
            signal_coverage,
            scored_dimensions,
            dimension_basis,
          },
          latest_signal_date: "",
          matching_tags: [],
          evidence_count: 1,
          confidence,
          signals: [],
          owner_name: r.institution,
          owner_type: "university" as const,
          patent_status: "unknown",
          licensing_status: r.licensingReadiness ?? "unknown",
          stage_changed_at: r.stageChangedAt ? r.stageChangedAt.toISOString() : null,
          previous_stage: r.previousStage ?? null,
          fda_designation: r.fdaDesignation ?? null,
          fda_designation_date: r.fdaDesignationDate ?? null,
        };
      });

      await storage.createSearchHistory({ query, source: "scout_tto", resultCount: assets.length }).catch(() => {});

      return res.json({ assets, query, assetsFound: assets.length, sources: ["tech_transfer"], fallback: false });
    } catch (err: any) {
      console.error("[scout/search] Error:", err);
      return res.status(200).json({ assets: [], query: String(req.body?.query ?? ""), assetsFound: 0, sources: ["tech_transfer"], fallback: false, error: err.message ?? "Search failed" });
    }
  });

  app.get("/api/scout/recently-added", async (_req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT
          id, asset_name, target, modality, indication, development_stage, institution,
          mechanism_of_action, innovation_claim, unmet_need, comparable_drugs,
          completeness_score, licensing_readiness, ip_type, source_url, source_name,
          summary, categories, technology_id, stage_changed_at, previous_stage,
          fda_designation, fda_designation_date,
          first_seen_at
        FROM ingested_assets
        WHERE relevant = true AND completeness_score >= 0.4
        ORDER BY first_seen_at DESC NULLS LAST
        LIMIT 12
      `);
      const assets = (rows.rows as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        asset_name: typeof r.asset_name === "string" ? r.asset_name : String(r.asset_name ?? ""),
        target: typeof r.target === "string" ? r.target : String(r.target ?? ""),
        modality: typeof r.modality === "string" ? r.modality : String(r.modality ?? ""),
        indication: typeof r.indication === "string" ? r.indication : String(r.indication ?? ""),
        development_stage: typeof r.development_stage === "string" ? r.development_stage : String(r.development_stage ?? ""),
        institution: typeof r.institution === "string" ? r.institution : String(r.institution ?? ""),
        summary: typeof r.summary === "string" ? r.summary : null,
        source_url: typeof r.source_url === "string" ? r.source_url : null,
        source_name: typeof r.source_name === "string" ? r.source_name : null,
        completeness_score: r.completeness_score != null ? parseFloat(String(r.completeness_score)) : null,
        licensing_readiness: typeof r.licensing_readiness === "string" ? r.licensing_readiness : null,
        ip_type: typeof r.ip_type === "string" ? r.ip_type : null,
        innovation_claim: typeof r.innovation_claim === "string" ? r.innovation_claim : null,
        stage_changed_at: r.stage_changed_at ? String(r.stage_changed_at) : null,
        previous_stage: typeof r.previous_stage === "string" ? r.previous_stage : null,
        fda_designation: typeof r.fda_designation === "string" ? r.fda_designation : null,
        fda_designation_date: typeof r.fda_designation_date === "string" ? r.fda_designation_date : null,
        first_seen_at: r.first_seen_at ? String(r.first_seen_at) : null,
        score: 0,
        score_breakdown: { freshness: 0, novelty: 0, readiness: 0, licensability: 0, fit: 0, competition: 0, total: 0 },
        owner_name: typeof r.institution === "string" ? r.institution : "",
        owner_type: "university" as const,
        patent_status: "unknown",
        licensing_status: typeof r.licensing_readiness === "string" ? r.licensing_readiness : "unknown",
        why_it_matters: typeof r.innovation_claim === "string" ? r.innovation_claim : "",
        source_urls: typeof r.source_url === "string" ? [r.source_url] : [],
        source_types: ["tech_transfer" as const],
        latest_signal_date: "",
        matching_tags: [],
        evidence_count: 1,
        confidence: "medium" as const,
        signals: [],
      }));
      return res.json({ assets });
    } catch (err: any) {
      console.error("[scout/recently-added] Error:", err);
      return res.status(500).json({ assets: [], error: err.message });
    }
  });

  app.get("/api/scout/institutions", async (_req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT institution, COUNT(*)::int AS count
        FROM ingested_assets
        WHERE relevant = true AND institution IS NOT NULL AND institution != ''
        GROUP BY institution
        ORDER BY count DESC
        LIMIT 200
      `);
      const institutions = (rows.rows as Record<string, unknown>[]).map((r) => ({
        institution: String(r.institution ?? ""),
        count: Number(r.count ?? 0),
      }));
      const totalCount = await db.execute(sql`
        SELECT COUNT(DISTINCT institution)::int AS n FROM ingested_assets WHERE relevant = true
      `);
      const total = Number((totalCount.rows[0] as Record<string, unknown>)?.n ?? institutions.length);
      return res.json({ institutions, total });
    } catch (err: any) {
      console.error("[scout/institutions] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load institutions" });
    }
  });

  app.get("/api/dashboard/stats", async (_req, res) => {
    try {
      const [stats, recentSearches, recentAssets, institutionCountResult, reviewCount, weeklyNewResult] = await Promise.all([
        fetchPortfolioStats(),
        storage.getSearchHistory(8),
        db.select({
          id: ingestedAssets.id,
          assetName: ingestedAssets.assetName,
          institution: ingestedAssets.institution,
          modality: ingestedAssets.modality,
          indication: ingestedAssets.indication,
          categories: ingestedAssets.categories,
          firstSeenAt: ingestedAssets.firstSeenAt,
        })
        .from(ingestedAssets)
        .orderBy(desc(ingestedAssets.firstSeenAt))
        .limit(8),
        db.execute(sql`SELECT COUNT(DISTINCT institution)::int AS n FROM ingested_assets WHERE institution IS NOT NULL AND institution != ''`),
        db.execute(sql`SELECT COUNT(*)::int AS n FROM review_queue WHERE status = 'pending'`),
        db.execute(sql`SELECT COUNT(*)::int AS n FROM ingested_assets WHERE first_seen_at >= NOW() - INTERVAL '7 days'`),
      ]);
      const institutionCount = Number((institutionCountResult.rows[0] as Record<string, unknown>)?.n ?? 0);
      const assetsInReview = Number((reviewCount.rows[0] as Record<string, unknown>)?.n ?? 0);
      const weeklyNew = Number((weeklyNewResult.rows[0] as Record<string, unknown>)?.n ?? 0);
      return res.json({ stats, recentSearches, recentAssets, institutionCount, assetsInReview, weeklyNew });
    } catch (err: any) {
      console.error("[dashboard/stats] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load stats" });
    }
  });

  app.get("/api/dashboard/top-therapy-areas", async (req, res) => {
    try {
      const limit = Math.min(Math.max(1, parseInt(String(req.query.limit ?? "8"), 10) || 8), 20);
      const rows = await db.execute(sql`
        SELECT area, COUNT(*)::int AS n
        FROM (
          SELECT unnest(categories) AS area
          FROM ingested_assets
          WHERE categories IS NOT NULL AND array_length(categories, 1) > 0
        ) sub
        WHERE area IS NOT NULL AND area != 'unknown' AND length(trim(area)) > 1
        GROUP BY area
        ORDER BY n DESC
        LIMIT ${limit}
      `);
      const areas = (rows.rows as Record<string, unknown>[]).map((r) => ({
        name: String(r.area ?? ""),
        count: Number(r.n ?? 0),
      }));
      return res.json({ areas });
    } catch (err: any) {
      console.error("[dashboard/top-therapy-areas] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load therapy areas" });
    }
  });

  app.get("/api/pipeline-lists/summary", async (_req, res) => {
    try {
      const [lists, totalSavedResult, institutionCountResult] = await Promise.all([
        db.execute(sql`
          SELECT pl.id, pl.name, COUNT(sa.id)::int AS asset_count
          FROM pipeline_lists pl
          LEFT JOIN saved_assets sa ON sa.pipeline_list_id = pl.id
          GROUP BY pl.id, pl.name
          ORDER BY pl.created_at DESC
        `),
        db.execute(sql`SELECT COUNT(*)::int AS n FROM saved_assets`),
        db.execute(sql`
          SELECT COUNT(DISTINCT COALESCE(ia.institution, sa.source_journal))::int AS n
          FROM saved_assets sa
          LEFT JOIN ingested_assets ia ON ia.id = sa.ingested_asset_id
          WHERE COALESCE(ia.institution, sa.source_journal) IS NOT NULL
            AND COALESCE(ia.institution, sa.source_journal) != ''
            AND COALESCE(ia.institution, sa.source_journal) != 'unknown'
        `),
      ]);
      const pipelineSummaryLists = (lists.rows as Record<string, unknown>[]).map((r) => ({
        id: Number(r.id),
        name: String(r.name ?? ""),
        assetCount: Number(r.asset_count ?? 0),
      }));
      const totalPipelines = pipelineSummaryLists.length;
      const totalSavedAssets = Number((totalSavedResult.rows[0] as Record<string, unknown>)?.n ?? 0);
      const institutionCount = Number((institutionCountResult.rows[0] as Record<string, unknown>)?.n ?? 0);
      return res.json({ lists: pipelineSummaryLists, totalPipelines, totalSavedAssets, institutionCount });
    } catch (err: any) {
      console.error("[pipeline-lists/summary] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load pipeline summary" });
    }
  });

  app.post("/api/pipeline-lists/:id/brief", async (req, res) => {
    try {
      const listId = parseInt(req.params.id, 10);
      if (isNaN(listId)) return res.status(400).json({ error: "Invalid pipeline list ID" });

      const [listResult, assetsResult] = await Promise.all([
        db.execute(sql`SELECT name FROM pipeline_lists WHERE id = ${listId} LIMIT 1`),
        db.execute(sql`
          SELECT sa.asset_name, sa.target, sa.modality, sa.disease_indication, sa.development_stage,
                 sa.source_name, sa.source_journal,
                 COALESCE(ia.institution, '') AS institution
          FROM saved_assets sa
          LEFT JOIN ingested_assets ia ON ia.id = sa.ingested_asset_id
          WHERE sa.pipeline_list_id = ${listId}
          ORDER BY sa.id DESC
        `),
      ]);

      const listRow = listResult.rows[0] as Record<string, unknown> | undefined;
      if (!listRow) return res.status(404).json({ error: "Pipeline list not found" });
      const pipelineName = String(listRow.name ?? "Pipeline");

      const assets = assetsResult.rows as Record<string, unknown>[];
      if (assets.length === 0) {
        return res.json({ brief: `No assets in the "${pipelineName}" pipeline yet.`, assetCount: 0, pipelineName });
      }

      const assetList = assets.map((a, i) => {
        const institution = String(a.institution ?? "").trim() || String(a.source_name || a.source_journal || "—");
        return `${i + 1}. ${String(a.asset_name ?? "Unknown")} | Institution: ${institution} | Target: ${String(a.target ?? "—")} | Modality: ${String(a.modality ?? "—")} | Stage: ${String(a.development_stage ?? "—")} | Disease: ${String(a.disease_indication ?? "—")}`;
      }).join("\n");

      const prompt = `You are a biotech intelligence analyst. Below is a list of drug development assets from a curated pipeline named "${pipelineName}".\n\nGenerate a concise pipeline dossier with the following sections:\nAsset Overview: Count and general description of the portfolio\nTherapeutic Targets & Mechanisms: Common targets and mechanisms of action\nModality Mix: Types of modalities represented (small molecules, biologics, etc.)\nDevelopment Stage Spread: Breakdown of where assets sit in development\nDisease Focus: Key indications and disease areas\nStrategic Summary: 2-3 sentences on the strategic significance and positioning of this pipeline\n\nAssets:\n${assetList}\n\nRespond with well-formatted plain text. Do not use markdown symbols or headers with #. Use clear labeled sections separated by blank lines.`;

      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 800,
        temperature: 0.4,
      });
      const brief = completion.choices[0]?.message?.content ?? "Unable to generate brief.";
      return res.json({ brief, assetCount: assets.length, pipelineName });
    } catch (err: any) {
      console.error("[pipeline-lists/brief] Error:", err);
      return res.status(500).json({ error: friendlyOpenAIError(err) });
    }
  });

  app.post("/api/report", async (req, res) => {
    try {
      const { query, sources, maxPerSource, buyerProfile } = reportBodySchema.parse(req.body);
      const validSources = sources.filter((s): s is SourceKey => s in dataSources) as SourceKey[];
      const effectiveSources = validSources.length > 0 ? validSources : ALL_SOURCES;
      const profile = buyerProfile ?? DEFAULT_BUYER_PROFILE;

      let signals = await collectAllSignals(query, effectiveSources, maxPerSource);
      signals = applyRelevanceFilter(signals, query);
      if (signals.length === 0) {
        return res.json({
          title: `HelixRadar Report: ${query}`,
          executive_summary: "No signals found for this query.",
          buyer_profile_summary: "",
          top_assets: [],
          narrative: "",
          query,
          generated_at: new Date().toISOString(),
        });
      }

      const normalized = await normalizeSignals(signals);
      const clustered = clusterAssets(normalized);
      const scored = await scoreAssets(clustered, profile);
      const report = await generateReport(scored, query, profile);

      return res.json(report);
    } catch (err: any) {
      console.error("Report error:", err);
      return res.status(500).json({ error: friendlyOpenAIError(err) });
    }
  });

  app.post("/api/dossier", async (req, res) => {
    try {
      const { asset } = dossierBodySchema.parse(req.body);
      if (!asset) return res.status(400).json({ error: "Asset required" });
      const dossier = await generateDossier(asset as ScoredAsset);
      return res.json(dossier);
    } catch (err: any) {
      console.error("Dossier error:", err);
      return res.status(500).json({ error: friendlyOpenAIError(err) });
    }
  });

  app.get("/api/assets/:fingerprint/intelligence", async (req, res) => {
    try {
      const { fingerprint } = req.params;
      if (!fingerprint) return res.status(400).json({ error: "Fingerprint required" });

      let [enrichedRecord] = await db
        .select()
        .from(ingestedAssets)
        .where(eq(ingestedAssets.fingerprint, fingerprint))
        .limit(1);

      if (!enrichedRecord) {
        const numericId = parseInt(fingerprint, 10);
        if (!isNaN(numericId)) {
          [enrichedRecord] = await db
            .select()
            .from(ingestedAssets)
            .where(eq(ingestedAssets.id, numericId))
            .limit(1);
        }
      }

      const competingAssets: IngestedAsset[] = [];
      if (enrichedRecord) {
        const target = enrichedRecord.target;
        const indication = enrichedRecord.indication;
        const institution = enrichedRecord.institution;

        if (target && target !== "unknown") {
          const byTarget = await db
            .select()
            .from(ingestedAssets)
            .where(
              and(
                eq(ingestedAssets.target, target),
                sql`${ingestedAssets.institution} != ${institution}`,
                eq(ingestedAssets.relevant, true),
                sql`${ingestedAssets.fingerprint} != ${fingerprint}`
              )
            )
            .limit(5);
          competingAssets.push(...byTarget);
        }

        if (competingAssets.length < 5 && indication && indication !== "unknown") {
          const existingFps = new Set([fingerprint, ...competingAssets.map((a) => a.fingerprint)]);
          const byIndication = await db
            .select()
            .from(ingestedAssets)
            .where(
              and(
                eq(ingestedAssets.indication, indication),
                sql`${ingestedAssets.institution} != ${institution}`,
                eq(ingestedAssets.relevant, true),
                sql`${ingestedAssets.fingerprint} != ${fingerprint}`
              )
            )
            .limit(5 - competingAssets.length);
          for (const a of byIndication) {
            if (!existingFps.has(a.fingerprint)) {
              competingAssets.push(a);
              existingFps.add(a.fingerprint);
            }
          }
        }
      }

      let literature: Array<{ title: string; url: string; date: string; source_type: string }> = [];
      if (enrichedRecord) {
        const searchTerms = [
          enrichedRecord.target !== "unknown" ? enrichedRecord.target : null,
          enrichedRecord.indication !== "unknown" ? enrichedRecord.indication : null,
        ].filter(Boolean).join(" ");

        if (searchTerms) {
          try {
            const pubmedSource = dataSources["pubmed" as SourceKey];
            const biorxivSource = dataSources["biorxiv" as SourceKey];
            const signals: RawSignal[] = [];
            if (pubmedSource) {
              const ps = await pubmedSource.search(searchTerms, 3);
              signals.push(...ps);
            }
            if (biorxivSource) {
              const bs = await biorxivSource.search(searchTerms, 2);
              signals.push(...bs);
            }
            literature = signals.map((s) => ({
              title: s.title,
              url: s.url,
              date: s.date,
              source_type: s.source_type,
            }));
          } catch (err) {
            console.error("[intelligence] Literature fetch error:", err);
          }
        }
      }

      return res.json({
        assetRecord: enrichedRecord
          ? {
              id: enrichedRecord.id,
              fingerprint: enrichedRecord.fingerprint,
              assetName: enrichedRecord.assetName,
              target: enrichedRecord.target,
              modality: enrichedRecord.modality,
              indication: enrichedRecord.indication,
              developmentStage: enrichedRecord.developmentStage,
              institution: enrichedRecord.institution,
              summary: enrichedRecord.summary,
              sourceUrl: enrichedRecord.sourceUrl,
              fdaDesignation: enrichedRecord.fdaDesignation ?? null,
              fdaDesignationDate: enrichedRecord.fdaDesignationDate ?? null,
            }
          : null,
        enriched: enrichedRecord
          ? {
              mechanismOfAction: enrichedRecord.mechanismOfAction,
              abstract: enrichedRecord.abstract,
              categories: enrichedRecord.categories,
              completenessScore: enrichedRecord.completenessScore,
              innovationClaim: enrichedRecord.innovationClaim,
              ipType: enrichedRecord.ipType,
              unmetNeed: enrichedRecord.unmetNeed,
              comparableDrugs: enrichedRecord.comparableDrugs,
              licensingReadiness: enrichedRecord.licensingReadiness,
              patentStatus: enrichedRecord.patentStatus,
              licensingStatus: enrichedRecord.licensingStatus,
              inventors: enrichedRecord.inventors,
              contactEmail: enrichedRecord.contactEmail,
            }
          : null,
        competingAssets: competingAssets.map((a) => ({
          fingerprint: a.fingerprint,
          assetName: a.assetName,
          target: a.target,
          modality: a.modality,
          indication: a.indication,
          developmentStage: a.developmentStage,
          institution: a.institution,
          completenessScore: a.completenessScore,
        })),
        literature,
      });
    } catch (err: any) {
      console.error("[intelligence] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to fetch intelligence" });
    }
  });

  app.get("/api/search-history", async (_req, res) => {
    try {
      const history = await storage.getSearchHistory(30);
      res.json({ history });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch history" });
    }
  });

  app.get("/api/saved-assets", async (req, res) => {
    try {
      const scope = req.query.scope as string | undefined;
      const userId = await tryGetUserId(req);

      if (scope === "team") {
        if (!userId) return res.status(401).json({ error: "Authentication required" });
        const userOrg = await storage.getOrgForUser(userId);
        if (!userOrg || userOrg.planTier === "individual") {
          return res.status(403).json({ error: "Team scope requires a team plan" });
        }
        const memberId = req.query.memberId as string | undefined;
        const result = await storage.getSavedAssetsForTeam(userOrg.id, memberId || undefined);
        const teamIds = result.assets.map((a) => a.id);
        const teamNoteMeta = await storage.getAssetNoteMeta(teamIds);
        return res.json({
          assets: result.assets.map((a) => ({
            ...a,
            noteCount: teamNoteMeta[a.id]?.count ?? 0,
            lastNoteAt: teamNoteMeta[a.id]?.lastNoteAt ?? null,
          })),
          members: result.members,
        });
      }

      const rawPl = req.query.pipelineListId;
      let pipelineListId: number | null | undefined = undefined;
      if (rawPl === "null") pipelineListId = null;
      else if (rawPl !== undefined) {
        const parsed = parseInt(rawPl as string, 10);
        if (!isNaN(parsed)) pipelineListId = parsed;
      }
      const assets = await storage.getSavedAssets(pipelineListId, userId);
      const assetIds = assets.map((a) => a.id);
      const noteMeta = await storage.getAssetNoteMeta(assetIds);
      res.json({
        assets: assets.map((a) => ({
          ...a,
          noteCount: noteMeta[a.id]?.count ?? 0,
          lastNoteAt: noteMeta[a.id]?.lastNoteAt ?? null,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch saved assets" });
    }
  });

  app.post("/api/saved-assets", async (req, res) => {
    try {
      const body = saveAssetBodySchema.parse(req.body);
      const userId = await tryGetUserId(req);
      const asset = await storage.createSavedAsset({
        ingestedAssetId: body.ingested_asset_id ?? null,
        pipelineListId: body.pipeline_list_id ?? null,
        assetName: body.asset_name,
        target: body.target,
        modality: body.modality,
        developmentStage: body.development_stage,
        diseaseIndication: body.disease_indication,
        summary: body.summary,
        sourceTitle: body.source_title,
        sourceJournal: body.source_journal,
        publicationYear: body.publication_year,
        sourceName: body.source_name,
        sourceUrl: body.source_url,
        pmid: body.pmid,
      }, userId);
      res.status(201).json({ asset });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to save asset" });
    }
  });

  app.patch("/api/saved-assets/:id/pipeline", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const { pipeline_list_id } = z.object({ pipeline_list_id: z.number().int().nullable() }).parse(req.body);
      const asset = await storage.updateSavedAssetPipeline(id, pipeline_list_id);
      if (!asset) return res.status(404).json({ error: "Asset not found" });
      res.json({ asset });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to update pipeline" });
    }
  });

  // ── Resolve display name from authenticated userId ────────────────────────
  async function resolveAuthorName(userId: string | null): Promise<string> {
    if (!userId) return "Team Member";
    try {
      const profile = await storage.getIndustryProfileByUserId(userId);
      if (profile?.userName?.trim()) return profile.userName.trim();
    } catch { /* fall through */ }
    return "Team Member";
  }

  // ── Saved asset access guard ─────────────────────────────────────────────
  async function canAccessSavedAsset(asset: { userId: string | null }, requestUserId: string | null): Promise<boolean> {
    if (!requestUserId) return false;
    // Legacy rows with no owner are visible to all authenticated industry users (backward compat).
    // These are historical TTO assets not yet associated with a specific org/user; any buyer
    // who can see them in their list query may also update status/notes on them.
    if (asset.userId === null) return true;
    if (asset.userId === requestUserId) return true;
    // Allow access for teammates in the same org
    if (asset.userId) {
      const [assetOwnerOrg, requesterOrg] = await Promise.all([
        storage.getOrgForUser(asset.userId),
        storage.getOrgForUser(requestUserId),
      ]);
      if (assetOwnerOrg && requesterOrg && assetOwnerOrg.id === requesterOrg.id) return true;
    }
    return false;
  }

  const STATUS_LABELS: Record<string, string> = {
    watching: "Watching",
    evaluating: "Evaluating",
    in_discussion: "In Discussion",
    on_hold: "On Hold",
    passed: "Passed",
  };

  app.patch("/api/saved-assets/:id/status", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const { status } = z.object({
        status: z.enum(SAVED_ASSET_STATUSES).nullable(),
      }).parse(req.body);
      const userId = await tryGetUserId(req);

      const before = await storage.getSavedAsset(id);
      if (!before) return res.status(404).json({ error: "Asset not found" });
      if (!await canAccessSavedAsset(before, userId ?? null)) return res.status(403).json({ error: "Access denied" });

      const asset = await storage.updateSavedAssetStatus(id, status);
      if (!asset) return res.status(404).json({ error: "Asset not found" });

      // Auto-log a system event note on status change (author resolved server-side)
      const prevLabel = before.status ?? null;
      const nextLabel = status ?? null;
      if (prevLabel !== nextLabel) {
        const displayName = await resolveAuthorName(userId ?? null);
        const content = nextLabel
          ? `Status changed to ${STATUS_LABELS[nextLabel] ?? nextLabel} by ${displayName}.`
          : `Status cleared by ${displayName}.`;
        await storage.createAssetNote({
          savedAssetId: id,
          userId: userId ?? null,
          authorName: displayName,
          content,
          isSystemEvent: true,
        }).catch((e) => console.error(`[system-event-note] Failed for asset ${id}:`, e));
      }

      res.json({ asset });
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed to update status" });
    }
  });

  app.get("/api/saved-assets/:id/notes", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const userId = await tryGetUserId(req);

      const asset = await storage.getSavedAsset(id);
      if (!asset) return res.status(404).json({ error: "Asset not found" });
      if (!await canAccessSavedAsset(asset, userId ?? null)) return res.status(403).json({ error: "Access denied" });

      const limitRaw = parseInt(req.query.limit as string || "50", 10);
      const offsetRaw = parseInt(req.query.offset as string || "0", 10);
      const limit = Math.min(isNaN(limitRaw) ? 50 : limitRaw, 200);
      const offset = isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw;
      const notes = await storage.getAssetNotes(id, limit, offset);
      res.json({ notes, limit, offset });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch notes" });
    }
  });

  app.post("/api/saved-assets/:id/notes", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const { content } = z.object({
        content: z.string().min(1).max(2000),
      }).parse(req.body);
      const userId = await tryGetUserId(req);

      const asset = await storage.getSavedAsset(id);
      if (!asset) return res.status(404).json({ error: "Asset not found" });
      if (!await canAccessSavedAsset(asset, userId ?? null)) return res.status(403).json({ error: "Access denied" });

      const resolvedAuthor = await resolveAuthorName(userId ?? null);
      const note = await storage.createAssetNote({
        savedAssetId: id,
        userId: userId ?? null,
        authorName: resolvedAuthor,
        content,
        isSystemEvent: false,
      });
      res.status(201).json({ note });
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed to create note" });
    }
  });

  app.delete("/api/saved-assets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      await storage.deleteSavedAsset(id);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to delete asset" });
    }
  });

  app.post("/api/pipeline/brief", async (req, res) => {
    try {
      const { stage } = z.object({ stage: z.string().min(1) }).parse(req.body);
      const result = await db.execute(sql`
        SELECT sa.asset_name, sa.target, sa.modality, sa.disease_indication, sa.development_stage, sa.source_name, sa.source_journal
        FROM saved_assets sa
        WHERE LOWER(TRIM(COALESCE(sa.development_stage, 'unknown'))) = ${stage.toLowerCase().trim()}
        ORDER BY sa.id DESC
        LIMIT 50
      `);
      const assets = result.rows as Record<string, unknown>[];
      if (assets.length === 0) {
        return res.json({ brief: "No assets in this pipeline stage.", assetCount: 0 });
      }
      const assetList = assets.map((a, i) =>
        `${i + 1}. ${String(a.asset_name ?? "Unknown")} | Target: ${String(a.target ?? "—")} | Modality: ${String(a.modality ?? "—")} | Disease: ${String(a.disease_indication ?? "—")} | Source: ${String(a.source_name || a.source_journal || "—")}`
      ).join("\n");
      const stageLabel = stage.charAt(0).toUpperCase() + stage.slice(1);
      const prompt = `You are a biotech intelligence analyst. Below is a list of drug development assets at the ${stageLabel} stage from a curated pipeline tracker.\n\nGenerate a concise pipeline brief with the following sections:\nAsset Overview: Count and general description\nTherapeutic Targets & Mechanisms: Common targets and mechanisms of action\nModality Mix: Types of modalities represented (small molecules, biologics, etc.)\nDisease Focus: Key indications and disease areas\nStrategic Summary: 2-3 sentences on the strategic significance of this pipeline stage\n\nAssets:\n${assetList}\n\nRespond with well-formatted plain text. Do not use markdown symbols or headers with #. Use clear labeled sections separated by blank lines.`;
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 700,
        temperature: 0.4,
      });
      const brief = completion.choices[0]?.message?.content ?? "Unable to generate brief.";
      return res.json({ brief, assetCount: assets.length });
    } catch (err: any) {
      console.error("[pipeline/brief] Error:", err);
      return res.status(500).json({ error: friendlyOpenAIError(err) });
    }
  });

  app.get("/api/pipelines", async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      // Resolve orgId so org-shared pipeline lists are included alongside personal ones
      const userOrg = userId ? await storage.getOrgForUser(userId) : null;
      const orgId = userOrg?.id;
      const lists = await storage.getPipelineLists(userId, orgId);
      const all = await storage.getSavedAssets(undefined, userId);
      const counts: Record<number, number> = {};
      let uncategorised = 0;
      for (const a of all) {
        if (a.pipelineListId == null) uncategorised++;
        else counts[a.pipelineListId] = (counts[a.pipelineListId] ?? 0) + 1;
      }
      res.json({ pipelines: lists.map((l) => ({ ...l, assetCount: counts[l.id] ?? 0 })), uncategorisedCount: uncategorised });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch pipelines" });
    }
  });

  app.post("/api/pipelines", async (req, res) => {
    try {
      const { name, shared } = z.object({ name: z.string().min(1).max(100), shared: z.boolean().optional() }).parse(req.body);
      const userId = await tryGetUserId(req);
      let orgId: number | undefined;
      if (shared && userId) {
        const userOrg = await storage.getOrgForUser(userId);
        if (userOrg && userOrg.planTier !== "individual") orgId = userOrg.id;
      }
      const list = await storage.createPipelineList({ name, ...(orgId ? { orgId } : {}) }, userId);
      res.status(201).json({ pipeline: { ...list, assetCount: 0 } });
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: err.message ?? "Invalid pipeline name" });
      res.status(500).json({ error: err.message ?? "Failed to create pipeline" });
    }
  });

  app.patch("/api/pipelines/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const { name } = z.object({ name: z.string().min(1).max(100) }).parse(req.body);
      const list = await storage.updatePipelineList(id, name);
      if (!list) return res.status(404).json({ error: "Pipeline not found" });
      res.json({ pipeline: list });
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: err.message ?? "Invalid pipeline name" });
      res.status(500).json({ error: err.message ?? "Failed to update pipeline" });
    }
  });

  app.delete("/api/pipelines/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      await storage.deletePipelineList(id);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to delete pipeline" });
    }
  });

  app.post("/api/pipelines/:id/assets", async (req, res) => {
    try {
      const pipelineId = parseInt(req.params.id);
      if (isNaN(pipelineId)) return res.status(400).json({ error: "Invalid pipeline ID" });
      const pipeline = await storage.getPipelineList(pipelineId);
      if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });
      const body = saveAssetBodySchema.parse({ ...req.body, pipeline_list_id: pipelineId });
      const userId = await tryGetUserId(req);
      const asset = await storage.createSavedAsset({
        ingestedAssetId: body.ingested_asset_id ?? null,
        pipelineListId: pipelineId,
        assetName: body.asset_name,
        target: body.target,
        modality: body.modality,
        developmentStage: body.development_stage,
        diseaseIndication: body.disease_indication,
        summary: body.summary,
        sourceTitle: body.source_title,
        sourceJournal: body.source_journal,
        publicationYear: body.publication_year,
        sourceName: body.source_name,
        sourceUrl: body.source_url ?? null,
        pmid: body.pmid ?? null,
      }, userId);
      res.status(201).json({ asset });
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed to add asset to pipeline" });
    }
  });

  app.get("/api/scrapers/active", (_req, res) => {
    res.json({ institutions: ALL_SCRAPERS.map((s) => s.institution) });
  });


  app.post("/api/ingest/run", async (_req, res) => {
    if (isIngestionRunning()) {
      const lastRun = await storage.getLastIngestionRun();
      return res.json({ message: "Ingestion already in progress", status: "running", runId: lastRun?.id });
    }
    if (isSyncRunning()) {
      return res.status(409).json({ error: `Institution sync is running for ${getSyncRunningFor()} — cannot start full ingestion` });
    }
    res.json({ message: "Ingestion started" });
    runIngestionPipeline().catch((err) => {
      console.error("[ingestion] Background run failed:", err);
    });
  });

  app.get("/api/ingest/status", async (_req, res) => {
    try {
      const lastRun = await storage.getLastIngestionRun();
      if (!lastRun) {
        return res.json({ status: "never_run", totalFound: 0, newCount: 0, ranAt: null });
      }
      const running = isIngestionRunning();
      return res.json({
        ...lastRun,
        status: running ? "running" : lastRun.status,
        enrichingCount: getEnrichingCount(),
        scrapingProgress: getScrapingProgress(),
        upsertProgress: getUpsertProgress(),
        syncRunning: isSyncRunning(),
        syncRunningFor: getSyncRunningFor(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch status" });
    }
  });

  app.get("/api/ingest/history", async (req, res) => {
    const pw = req.query.pw ?? req.headers["x-admin-password"];
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    try {
      const runs = await storage.getIngestionRunHistory(5);
      res.json(runs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/ingest/delta", async (_req, res) => {
    try {
      const lastRun = await storage.getLastIngestionRun();
      if (!lastRun || lastRun.status !== "completed") {
        return res.json({ runId: null, ranAt: null, totalNew: 0, byInstitution: [] });
      }
      const byInstitution = await storage.getIngestionDelta(lastRun.ranAt);
      const totalNew = byInstitution.reduce((sum, row) => sum + row.count, 0);
      return res.json({ runId: lastRun.id, ranAt: lastRun.ranAt, totalNew, byInstitution });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch delta" });
    }
  });

  app.get("/api/institutions/counts", async (_req, res) => {
    try {
      const counts = await storage.getInstitutionAssetCounts();
      res.json(counts);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch counts" });
    }
  });

  app.get("/api/institutions/:slug/assets", async (req, res) => {
    try {
      const SLUG_TO_NAME: Record<string, string> = {
        stanford: "Stanford University",
        mit: "MIT",
        harvard: "Harvard University",
        jhu: "Johns Hopkins University",
        ucsf: "UC San Francisco",
        duke: "Duke University",
        columbia: "Columbia University",
        upenn: "University of Pennsylvania",
        northwestern: "Northwestern University",
        cornell: "Cornell University",
        ucberkeley: "UC Berkeley",
        uwashington: "University of Washington",
        wustl: "Washington University in St. Louis",
        umich: "University of Michigan",
        mayo: "Mayo Clinic",
        scripps: "Scripps Research",
        salk: "Salk Institute for Biological Studies",
        mdanderson: "MD Anderson Cancer Center",
        upitt: "University of Pittsburgh",
        uchicago: "University of Chicago",
        vanderbilt: "Vanderbilt University",
        emory: "Emory University",
        bu: "Boston University",
        georgetown: "Georgetown University",
        utexas: "University of Texas",
        cwru: "Case Western Reserve University",
        ucolorado: "University of Colorado",
        princeton: "Princeton University",
        ucla: "UCLA",
        brown: "Brown University",
        rochester: "University of Rochester",
        tufts: "Tufts University",
        uthealth: "UT Health",
        coloradostate: "Colorado State University",
        virginiatech: "Virginia Tech",
        usf: "University of South Florida",
        waynestate: "Wayne State University",
        utdallas: "UT Dallas",
        msstate: "Mississippi State University",
        utoledo: "University of Toledo",
        njit: "New Jersey Institute of Technology",
        calpoly: "Cal Poly San Luis Obispo",
        slu: "Saint Louis University",
        ucdavis: "UC Davis",
        utah: "University of Utah",
        uva: "University of Virginia",
        uoregon: "University of Oregon",
        gwu: "George Washington University",
        czbiohub: "CZ Biohub",
        musc: "Medical University of South Carolina",
        southcarolina: "University of South Carolina",
        lehigh: "Lehigh University",
        clemson: "Clemson University",
        iowastate: "Iowa State University",
        tgen: "Translational Genomics Research Institute",
        wsu: "Washington State University",
        arizona: "University of Arizona",
        pennstate: "Penn State University",
        rutgers: "Rutgers University",
        stevens: "Stevens Institute of Technology",
        rpi: "Rensselaer Polytechnic Institute",
        stonybrook: "Stony Brook University",
        cincinnati: "University of Cincinnati",
        buffalo: "University at Buffalo",
        rowan: "Rowan University",
        georgemason: "George Mason University",
        umaine: "University of Maine",
        binghamton: "Binghamton University",
        usc: "University of Southern California",
        oregonstate: "Oregon State University",
        gsu: "Georgia State University",
        northeastern: "Northeastern University",
        uvm: "University of Vermont",
        usd: "University of South Dakota",
        txstate: "Texas State University",
        yale: "Yale University",
        purdue: "Purdue University",
        umn: "University of Minnesota",
        miami: "University of Miami",
        upstate: "SUNY Upstate Medical University",
        suny: "SUNY System",
        alabama: "University of Alabama",
        wyoming: "University of Wyoming",
        idaho: "University of Idaho",
        gatech: "Georgia Institute of Technology",
        fsu: "Florida State University",
        ucf: "University of Central Florida",
        fiu: "Florida International University",
        tamu: "Texas A&M University",
        rice: "Rice University",
        uhouston: "University of Houston",
        texastech: "Texas Tech University",
        unt: "University of North Texas",
        baylor: "Baylor University",
        portlandstate: "Portland State University",
        umontana: "University of Montana",
        montanastate: "Montana State University",
        unm: "University of New Mexico",
        nmsu: "New Mexico State University",
        unr: "University of Nevada, Reno",
        unlv: "University of Nevada, Las Vegas",
        usu: "Utah State University",
        byu: "Brigham Young University",
        uaf: "University of Alaska Fairbanks",
        uaa: "University of Alaska Anchorage",
        und: "University of North Dakota",
        ndsu: "North Dakota State University",
        sdstate: "South Dakota State University",
        indiana: "Indiana University",
        notredame: "University of Notre Dame",
        warf: "University of Wisconsin",
        auburn: "Auburn University",
        uga: "University of Georgia",
        uarkansas: "University of Arkansas",
        uams: "University of Arkansas for Medical Sciences",
        olemiss: "University of Mississippi",
        udel: "University of Delaware",
        temple: "Temple University",
        drexel: "Drexel University",
        bucknell: "Bucknell University",
        sunyalbany: "SUNY Albany",
        uconn: "University of Connecticut",
        dartmouth: "Dartmouth College",
        brandeis: "Brandeis University",
        unh: "University of New Hampshire",
        uri: "University of Rhode Island",
        mountsinai: "Icahn School of Medicine at Mount Sinai",
        caltech: "California Institute of Technology",
        asu: "Arizona State University",
        uillinois: "University of Illinois",
        oxford: "University of Oxford",
        cambridge: "University of Cambridge",
        imperial: "Imperial College London",
        ucl: "University College London",
        manchester: "University of Manchester",
        edinburgh: "University of Edinburgh",
        bristol: "University of Bristol",
        glasgow: "University of Glasgow",
        birmingham: "University of Birmingham",
        nottingham: "University of Nottingham",
        leeds: "University of Leeds",
        sheffield: "University of Sheffield",
        southampton: "University of Southampton",
        warwick: "University of Warwick",
        kcl: "King's College London",
        ethzurich: "ETH Zurich",
        epfl: "EPFL",
        ubasel: "University of Basel",
        ulausanne: "University of Lausanne",
        ugeneva: "University of Geneva",
        uzurich: "University of Zurich",
        kuleuven: "KU Leuven",
        ugent: "Ghent University",
        groningen: "University of Groningen",
        uamsterdam: "University of Amsterdam",
        vuamsterdam: "Vrije Universiteit Amsterdam",
        leiden: "Leiden University",
        karolinska: "Karolinska Institutet",
        inven2: "University of Oslo",
        vis: "University of Bergen",
        ntnu: "NTNU",
        ucph: "University of Copenhagen",
        aarhus: "Aarhus University",
        dtu: "Technical University of Denmark",
        lund: "Lund University",
        chalmers: "Chalmers University of Technology",
        gothenburg: "University of Gothenburg",
        helsinki: "University of Helsinki",
        aalto: "Aalto University",
        tum: "Technical University of Munich",
        lmu: "Ludwig Maximilian University of Munich",
        rwth: "RWTH Aachen University",
        ufreiburg: "University of Freiburg",
        ubonn: "University of Bonn",
        ucologne: "University of Cologne",
        utubingen: "University of Tübingen",
        heidelberg: "University of Heidelberg",
        weizmann: "Weizmann Institute of Science",
        technion: "Technion – Israel Institute of Technology",
        utoronto: "University of Toronto",
        mcgill: "McGill University",
        ubc: "University of British Columbia",
        ucalgary: "University of Calgary",
        usask: "University of Saskatchewan",
        umanitoba: "University of Manitoba",
        uvic: "University of Victoria",
        sfu: "Simon Fraser University",
        umelbourne: "University of Melbourne",
        monash: "Monash University",
        usydney: "University of Sydney",
        uniquest: "University of Queensland",
        nus: "National University of Singapore",
        hkust: "Hong Kong University of Science and Technology",
        hku: "University of Hong Kong",
        ucm: "Universidad Complutense de Madrid",
      };
      const name = SLUG_TO_NAME[req.params.slug]
        ?? req.params.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const assets = await storage.getIngestedAssetsByInstitution(name);
      res.json({ assets, institution: name });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch assets" });
    }
  });

  app.get("/api/admin/scan-matrix", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const limit = Math.min(parseInt(String(req.query.limit ?? "10"), 10) || 10, 50);
      const [data, indexedCounts] = await Promise.all([
        storage.getScanMatrix(limit),
        storage.getInstitutionAssetCounts(),
      ]);
      res.json({ ...data, indexedCounts });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch scan matrix" });
    }
  });

  app.get("/api/admin/collector-health", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const allInstitutionNames = ALL_SCRAPERS.filter((s) => s.scraperType !== "stub").map((s) => s.institution);

      const healthData = await storage.getCollectorHealthData();
      const scraperHealthMap = getScraperHealthCache();
      const { institutions: instRows, syncSessions: sessions } = healthData;

      const instMap = new Map(instRows.map((r) => [r.institution, r]));
      const sessionsByInstitution = new Map<string, typeof sessions>();
      for (const s of sessions) {
        if (!sessionsByInstitution.has(s.institution)) {
          sessionsByInstitution.set(s.institution, []);
        }
        sessionsByInstitution.get(s.institution)!.push(s);
      }

      const STALE_THRESHOLD_MS = 10 * 60 * 1000;
      const now = Date.now();
      // Live active syncs — cross-reference against DB session health so the
      // "syncing" status is always accurate regardless of DB session heartbeat lag.
      const liveActiveSyncs = new Set(getActiveSyncs());

      const rows = allInstitutionNames.map((name) => {
        const dbRow = instMap.get(name);
        const totalInDb = dbRow?.totalInDb ?? 0;
        const biotechRelevant = dbRow?.biotechRelevant ?? 0;
        const instSessions = sessionsByInstitution.get(name) ?? [];
        const session = instSessions[0] ?? null;

        // Use scraper_health table consecutiveFailures — this is maintained by the
        // scheduler and correctly excludes transient DB/server-restart errors via
        // isTransientDbError(). Computing from session history would count transient
        // errors that never incremented the real failure counter.
        const scraperHealth = scraperHealthMap.get(name);
        const consecutiveFailures = scraperHealth?.consecutiveFailures ?? 0;

        type HealthStatus = "ok" | "warning" | "degraded" | "failing" | "stale" | "syncing" | "never" | "blocked" | "site_down" | "rate_limited" | "parser_failure";

        function classifyByError(errMsg: string | null | undefined): HealthStatus {
          if (!errMsg) return "parser_failure";
          const m = errMsg.toLowerCase();
          if (/\b5\d{2}\b/.test(errMsg) || m.includes("service unavailable") || m.includes("maintenance")) return "site_down";
          if (m.includes(" 429") || m.includes("rate limit") || m.includes("rate-limit") || m.includes("too many request")) return "rate_limited";
          if (m.includes(" 403") || m.includes("cloudflare") || m.includes("bot challenge") || m.includes("access denied") || m.includes(" 401")) return "blocked";
          // Unrecognised error text on a completed session = scraper ran but
          // produced no listings — treat as a parser / selector issue.
          return "parser_failure";
        }

        let health: HealthStatus;
        // Live lock takes precedence: if ingestion is actively holding a lock for this
        // institution, it's definitively "syncing" regardless of DB session state.
        if (liveActiveSyncs.has(name)) {
          health = "syncing";
        } else if (!session) {
          health = "never";
        } else if (session.status === "running") {
          const heartbeat = session.lastRefreshedAt ?? session.createdAt;
          const elapsed = now - new Date(heartbeat).getTime();
          health = elapsed > STALE_THRESHOLD_MS ? "stale" : "syncing";
        } else if (session.status === "enriched" || session.status === "completed" || session.status === "pushed") {
          if ((session.rawCount ?? 0) === 0) {
            health = classifyByError(session.errorMessage);
          } else {
            health = "ok";
          }
        } else if (session.status === "failed") {
          const errMsg = session.errorMessage ?? "";
          const m = errMsg.toLowerCase();
          if (m.includes(" 503") || m.includes(" 502") || m.includes(" 500") || m.includes("service unavailable") || m.includes("maintenance")) {
            health = "site_down";
          } else if (m.includes(" 429") || m.includes("rate limit") || m.includes("rate-limit") || m.includes("too many request")) {
            health = "rate_limited";
          } else if (m.includes(" 403") || m.includes("cloudflare") || m.includes("bot challenge") || m.includes("access denied")) {
            health = "blocked";
          } else {
            // Generic failure — use consecutiveFailures for severity.
            // consecutiveFailures is maintained by the scheduler and correctly
            // excludes transient events (server restart, DB blip) via isTransientDbError().
            // When it's 0, the last failure was transient — don't show Warning.
            health = consecutiveFailures >= 4 ? "failing" :
                     consecutiveFailures >= 2 ? "degraded" :
                     consecutiveFailures >= 1 ? "warning" :
                     "ok";
          }
        } else {
          health = "degraded";
        }

        return {
          institution: name,
          totalInDb,
          biotechRelevant,
          lastSyncAt: session?.completedAt ?? session?.createdAt ?? null,
          lastSyncStatus: session?.status ?? null,
          lastSyncError: (health !== "ok" && health !== "syncing" && health !== "never") ? (session?.errorMessage ?? null) : null,
          rawCount: session?.rawCount ?? 0,
          newCount: session?.newCount ?? 0,
          relevantCount: session?.relevantCount ?? 0,
          phase: session?.phase ?? null,
          sessionId: session?.sessionId ?? null,
          consecutiveFailures,
          health,
          tier: getScraperTier(name),
        };
      });

      const manualInsts = await storage.getManualInstitutions();
      const activeSearchRows = manualInsts.map((m) => {
        const dbRow = instMap.get(m.name);
        return {
          institution: m.name,
          ttoUrl: m.ttoUrl ?? "",
          totalInDb: dbRow?.totalInDb ?? 0,
          biotechRelevant: dbRow?.biotechRelevant ?? 0,
        };
      });

      // Compute totals from the raw DB aggregation (instRows) to avoid double-counting
      // institutions that appear in both ALL_SCRAPERS and manual_institutions.
      const totalInDb = instRows.reduce((s, r) => s + r.totalInDb, 0);
      const totalBiotechRelevant = instRows.reduce((s, r) => s + r.biotechRelevant, 0);
      const issueCount = rows.filter((r) => r.health !== "ok" && r.health !== "syncing" && r.health !== "never").length;
      const syncingCount = rows.filter((r) => r.health === "syncing").length;
      const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
      const syncedToday = rows.filter((r) => r.lastSyncAt && new Date(r.lastSyncAt).getTime() > twentyFourHoursAgo).length;

      const scheduler = getSchedulerStatus();

      // ── FDA designation enrichment job health ────────────────────────────
      const fdaHealth = await loadFdaDesignationHealth().catch(() => null);
      const fdaDesignationJob = fdaHealth ? {
        lastRunAt: fdaHealth.lastSuccessAt,
        lastTaggedCount: fdaHealth.lastSuccessNewCount,
        consecutiveFailures: fdaHealth.consecutiveFailures,
        lastFailureReason: fdaHealth.lastFailureReason,
        lastFailureAt: fdaHealth.lastFailureAt,
        health: fdaHealth.consecutiveFailures >= 3 ? "failing"
              : fdaHealth.consecutiveFailures >= 1 ? "warning"
              : fdaHealth.lastSuccessAt ? "ok"
              : "never",
      } : { lastRunAt: null, lastTaggedCount: null, consecutiveFailures: 0, lastFailureReason: null, lastFailureAt: null, health: "never" };

      res.json({
        rows,
        activeSearchRows,
        totalInDb,
        totalBiotechRelevant,
        totalInstitutions: allInstitutionNames.length,
        totalActiveSearch: manualInsts.length,
        issueCount,
        syncingCount,
        syncedToday,
        scheduler,
        fdaDesignationJob,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch collector health" });
    }
  });

  app.get("/api/admin/new-arrivals", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const groups = await storage.getNewArrivals();
      const totalUnindexed = groups.reduce((s, g) => s + g.count, 0);
      const totalPendingEnrichment = totalUnindexed;
      const totalInstitutions = groups.length;
      res.json({ totalUnindexed, totalPendingEnrichment, totalInstitutions, groups });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch indexing queue" });
    }
  });

  app.post("/api/admin/new-arrivals/push", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const body = req.body as { institution?: unknown };
      const institution: string | undefined = typeof body.institution === "string" ? body.institution : undefined;
      const result = await storage.pushNewArrivals(institution);
      res.json({ updated: result.updated, message: `Marked ${result.updated} asset${result.updated !== 1 ? "s" : ""} as enrichment done` });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Push failed" });
    }
  });

  app.delete("/api/admin/new-arrivals/:id", async (req, res) => {
    try {
      const pw = req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const found = await storage.rejectStagingItem(id);
      if (!found) return res.status(404).json({ error: "Item not found" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Reject failed" });
    }
  });

  app.get("/api/ingest/sync/sessions", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const sessions = await storage.getLatestSyncSessions();
      res.json({ sessions });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch sync sessions" });
    }
  });

  app.get("/api/ingest/sync-global-status", async (req, res) => {
    const pw = req.query.pw ?? req.headers["x-admin-password"];
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    res.json({
      syncRunning: isSyncRunning(),
      syncRunningFor: getSyncRunningFor(),
      ingestionRunning: isIngestionRunning(),
    });
  });

  app.get("/api/ingest/scheduler/status", async (req, res) => {
    const pw = req.query.pw ?? req.headers["x-admin-password"];
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    res.json(getSchedulerStatus());
  });

  app.post("/api/ingest/scheduler/start", async (req, res) => {
    const pw = req.query.pw ?? req.headers["x-admin-password"];
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    const result = startScheduler();
    res.json(result);
  });

  app.post("/api/ingest/scheduler/pause", async (req, res) => {
    const pw = req.query.pw ?? req.headers["x-admin-password"];
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    try {
      const result = await pauseScheduler();
      res.json(result);
    } catch (err: any) {
      console.error(`[scheduler] Pause DB write failed: ${err?.message}`);
      res.status(500).json({ error: "Pause succeeded in-memory but failed to persist — restart risk remains", detail: err?.message });
    }
  });

  app.post("/api/ingest/scheduler/reset", async (req, res) => {
    const pw = req.query.pw ?? req.headers["x-admin-password"];
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    const result = resetAndStartScheduler();
    res.json({ ...result, status: getSchedulerStatus() });
  });

  app.post("/api/ingest/scheduler/run-tier", async (req, res) => {
    const pw = req.query.pw ?? req.headers["x-admin-password"];
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    const { tier } = req.body ?? {};
    if (![1, 2, 3, 4].includes(tier)) return res.status(400).json({ error: "tier must be 1, 2, 3, or 4" });
    const result = startTierOnly(tier as 1 | 2 | 3 | 4);
    res.json({ ...result, status: getSchedulerStatus() });
  });

  app.post("/api/ingest/scheduler/bump", async (req, res) => {
    const pw = req.query.pw ?? req.headers["x-admin-password"];
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    const { institution } = req.body ?? {};
    if (!institution) return res.status(400).json({ error: "institution is required" });
    const result = bumpToFront(institution);
    res.json(result);
  });

  app.post("/api/ingest/scheduler/delay", async (req, res) => {
    const pw = req.query.pw ?? req.headers["x-admin-password"];
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    const { delayMs } = req.body ?? {};
    if (typeof delayMs !== "number") return res.status(400).json({ error: "delayMs (number) is required" });
    const result = setDelay(delayMs);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  app.post("/api/ingest/scheduler/concurrency", async (req, res) => {
    const pw = req.query.pw ?? req.headers["x-admin-password"];
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    const { concurrency } = req.body ?? {};
    if (concurrency !== 1 && concurrency !== 2) return res.status(400).json({ error: "concurrency must be 1 or 2" });
    setConcurrency(concurrency as 1 | 2);
    res.json({ ok: true, message: `Concurrency set to ${concurrency}`, concurrency });
  });

  app.get("/api/admin/scraper-health", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const rows = await getAllScraperHealth();
      const now = Date.now();
      const enriched = rows.map((r) => ({
        ...r,
        lastFailureAt: r.lastFailureAt?.toISOString() ?? null,
        lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null,
        backoffUntil: r.backoffUntil?.toISOString() ?? null,
        inBackoff: r.backoffUntil ? r.backoffUntil.getTime() > now : false,
      }));
      res.json({ rows: enriched, total: enriched.length, inBackoff: enriched.filter((r) => r.inBackoff).length });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch scraper health" });
    }
  });

  app.post("/api/admin/scraper-health/:institution/clear-backoff", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const institution = decodeURIComponent(req.params.institution);
      await clearScraperBackoff(institution);
      invalidateHealthCacheEntry(institution);  // immediate effect on scheduling decisions
      res.json({ ok: true, message: `Backoff cleared for ${institution}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Clear backoff failed" });
    }
  });

  app.post("/api/ingest/sync/:institution/cancel", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const institution = decodeURIComponent(req.params.institution);
      const sessions = await storage.getLatestSyncSessions();
      const session = sessions.find((s) => s.institution === institution && s.status === "running");

      if (!session) return res.status(404).json({ error: "No running session found for this institution" });

      await storage.updateSyncSession(session.sessionId, {
        status: "failed",
        phase: "done",
        completedAt: new Date(),
        errorMessage: "Cancelled by admin (stale session)",
      });

      releaseSyncLock(institution);
      cancelCurrentSync(institution);

      res.json({ ok: true, message: `Sync for ${institution} cancelled` });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Cancel failed" });
    }
  });

  app.post("/api/ingest/sync/:institution", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const institution = decodeURIComponent(req.params.institution);
      if (isIngestionRunning()) return res.status(409).json({ error: "Full ingestion is running — cannot sync" });

      const scraper = ALL_SCRAPERS.find((s) => s.institution === institution);
      if (!scraper) return res.status(404).json({ error: `No scraper found for: ${institution}` });

      const scraperType = (scraper.scraperType === "stub" ? "http" : (scraper.scraperType ?? "http")) as "playwright" | "http" | "api";
      if (!tryAcquireSyncLock(institution, scraperType)) {
        return res.status(409).json({ error: `Sync already running or lock unavailable for ${getSyncRunningFor()}` });
      }

      const sessionId = crypto.randomUUID();
      res.json({ message: "Sync started", institution, sessionId });

      runInstitutionSync(institution, sessionId)
        .then(() => {
          updateScraperHealth(institution, true).catch(() => {});
          invalidateHealthCacheEntry(institution);
        })
        .catch((err) => {
          console.error(`[sync] Background sync failed for ${institution}:`, err?.message);
          updateScraperHealth(institution, false, err?.message).catch(() => {});
        });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Sync failed" });
    }
  });

  app.get("/api/ingest/sync/:institution/status", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const institution = decodeURIComponent(req.params.institution);
      const sessions = await storage.getLatestSyncSessions();
      const session = sessions.find((s) => s.institution === institution);

      if (!session) return res.json({ found: false });

      const stagingRows = session.status !== "running"
        ? await storage.getSyncStagingRows(session.sessionId)
        : [];

      const currentIndexed = await storage.getInstitutionIndexedCount(institution);

      res.json({
        found: true,
        session: {
          ...session,
          currentIndexed,
        },
        newEntries: stagingRows
          .filter((r) => r.isNew && r.relevant === true)
          .map((r) => ({
            assetName: r.assetName,
            sourceUrl: r.sourceUrl,
            target: r.target,
            modality: r.modality,
            indication: r.indication,
            developmentStage: r.developmentStage,
            firstSeenAt: r.createdAt,
          })),
        syncRunning: isSyncRunning(),
        syncRunningFor: getSyncRunningFor(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch sync status" });
    }
  });

  app.get("/api/ingest/sync/:institution/history", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const institution = decodeURIComponent(req.params.institution);
      const sessions = await storage.getInstitutionSyncHistory(institution, 5);
      res.json({ sessions });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch sync history" });
    }
  });

  app.post("/api/ingest/sync/:institution/push", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const institution = decodeURIComponent(req.params.institution);
      const sessions = await storage.getLatestSyncSessions();
      const session = sessions.find((s) => s.institution === institution);

      if (!session) return res.status(404).json({ error: "No sync session found" });
      if (session.status === "pushed") return res.status(400).json({ error: "Already pushed" });
      if (session.status !== "enriched") return res.status(400).json({ error: `Session not ready for push (status: ${session.status})` });
      if (session.rawCount === 0) return res.status(400).json({ error: "Cannot push — scraper returned 0 results. The site was likely rate-limited or unreachable during the sync. Run a manual scrape to retry." });

      const stagingRows = await storage.getSyncStagingRows(session.sessionId);
      const toPush = stagingRows.filter((r) => r.isNew && r.relevant === true);

      if (toPush.length === 0) {
        await storage.updateSyncSession(session.sessionId, { pushedCount: 0, status: "pushed", lastRefreshedAt: new Date() });
        return res.json({ pushed: 0, message: "No new relevant assets to push" });
      }

      const { newAssets } = await storage.bulkUpsertIngestedAssets(
        toPush.map((r) => ({
          fingerprint: r.fingerprint,
          assetName: r.assetName,
          institution: r.institution,
          summary: r.summary,
          sourceUrl: r.sourceUrl,
          sourceType: "tech_transfer" as const,
          developmentStage: r.developmentStage,
          target: r.target,
          modality: r.modality,
          indication: r.indication,
          relevant: true,
          runId: 0,
        }))
      );

      for (const asset of newAssets) {
        const staged = toPush.find((r) => r.fingerprint === asset.fingerprint);
        if (staged) {
          await storage.updateIngestedAssetEnrichment(asset.id, {
            target: staged.target,
            modality: staged.modality,
            indication: staged.indication,
            developmentStage: staged.developmentStage,
            biotechRelevant: true,
          });
          await storage.stampEnrichedAt(asset.id);
        }
      }

      await storage.updateSyncStagingStatus(session.sessionId, "pushed", true, true);
      await storage.updateSyncStagingStatus(session.sessionId, "skipped", false);
      const skippedNonRelevant = await storage.updateSyncStagingStatus(session.sessionId, "skipped", true, false);

      await storage.updateSyncSession(session.sessionId, {
        pushedCount: newAssets.length,
        status: "pushed",
        lastRefreshedAt: new Date(),
      });

      res.json({
        pushed: newAssets.length,
        skipped: skippedNonRelevant,
        message: `Pushed ${newAssets.length} new assets to index`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Push failed" });
    }
  });

  let liveEnrichment: {
    jobId: number;
    processed: number;
    improved: number;
    total: number;
    resumed: boolean;
  } | null = null;
  let standardEnrichShouldStop = false;

  async function runEnrichmentWorker(
    jobId: number,
    assets: Array<{ id: number; assetName: string; summary: string; target: string; modality: string; indication: string; developmentStage: string }>,
    startProcessed: number,
    startImproved: number,
    resumed: boolean,
  ) {
    liveEnrichment = { jobId, processed: startProcessed, improved: startImproved, total: startProcessed + assets.length, resumed };
    const CONCURRENCY = 30;
    let idx = 0;

    async function worker() {
      while (idx < assets.length) {
        if (standardEnrichShouldStop) break;
        const asset = assets[idx++];
        if (!asset) continue;
        try {
          const result = await reEnrichAsset(
            asset.assetName,
            asset.summary,
            { target: asset.target, modality: asset.modality, indication: asset.indication, developmentStage: asset.developmentStage },
          );
          const improved =
            (asset.target === "unknown" && result.target !== "unknown") ||
            (asset.modality === "unknown" && result.modality !== "unknown") ||
            (asset.indication === "unknown" && result.indication !== "unknown") ||
            (asset.developmentStage === "unknown" && result.developmentStage !== "unknown");

          if (improved) {
            await storage.updateIngestedAssetEnrichment(asset.id, {
              target: result.target,
              modality: result.modality,
              indication: result.indication,
              developmentStage: result.developmentStage,
              biotechRelevant: result.biotechRelevant,
            });
            liveEnrichment!.improved++;
          }
        } catch (e) {
          console.error(`[enrichment] failed for asset ${asset.id}:`, e);
        }
        await storage.stampEnrichedAt(asset.id);
        liveEnrichment!.processed++;
        await storage.updateEnrichmentJob(jobId, { processed: liveEnrichment!.processed, improved: liveEnrichment!.improved });
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, assets.length) }, worker));
      await storage.updateEnrichmentJob(jobId, { status: "done", processed: liveEnrichment!.processed, improved: liveEnrichment!.improved, completedAt: new Date() });
      console.log(`[enrichment] Job ${jobId} completed: ${liveEnrichment!.improved} improved out of ${liveEnrichment!.processed} processed`);
    } catch (e: any) {
      await storage.updateEnrichmentJob(jobId, { status: "error", processed: liveEnrichment!.processed, improved: liveEnrichment!.improved, completedAt: new Date() });
      console.error("[enrichment] Job failed:", e);
    } finally {
      liveEnrichment = null;
    }
  }

  app.get("/api/admin/enrichment/stats", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const stats = await storage.getEnrichmentStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch enrichment stats" });
    }
  });

  // --- Dataset Quality Analytics (relevant=true only) ---

  app.get("/api/admin/dataset-quality", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const globalResult = await db.execute(sql`
        SELECT
          COUNT(*)::int AS total_relevant,
          COUNT(completeness_score)::int AS scored_count,
          ROUND(AVG(completeness_score)::numeric, 1) AS avg_score,
          COUNT(CASE WHEN completeness_score >= 80 THEN 1 END)::int AS tier_excellent,
          COUNT(CASE WHEN completeness_score >= 60 AND completeness_score < 80 THEN 1 END)::int AS tier_good,
          COUNT(CASE WHEN completeness_score >= 40 AND completeness_score < 60 THEN 1 END)::int AS tier_partial,
          COUNT(CASE WHEN completeness_score >= 1 AND completeness_score < 40 THEN 1 END)::int AS tier_poor,
          COUNT(CASE WHEN completeness_score IS NULL OR completeness_score = 0 THEN 1 END)::int AS tier_unscored,
          ROUND(100.0 * COUNT(CASE WHEN target IS NOT NULL AND target NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_target,
          ROUND(100.0 * COUNT(CASE WHEN indication IS NOT NULL AND indication NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_indication,
          ROUND(100.0 * COUNT(CASE WHEN modality IS NOT NULL AND modality NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_modality,
          ROUND(100.0 * COUNT(CASE WHEN development_stage IS NOT NULL AND development_stage NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_stage,
          ROUND(100.0 * COUNT(CASE WHEN licensing_readiness IS NOT NULL AND licensing_readiness NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_licensing,
          ROUND(100.0 * COUNT(CASE WHEN ip_type IS NOT NULL AND ip_type NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_patent,
          COUNT(CASE WHEN first_seen_at >= NOW() - INTERVAL '7 days' THEN 1 END)::int AS added_7d,
          COUNT(CASE WHEN first_seen_at >= NOW() - INTERVAL '30 days' THEN 1 END)::int AS added_30d
        FROM ingested_assets
        WHERE relevant = true
      `);

      const institutionResult = await db.execute(sql`
        SELECT
          COALESCE(institution, 'Unknown') AS institution,
          COUNT(*)::int AS relevant_count,
          ROUND(AVG(completeness_score)::numeric, 1) AS avg_completeness,
          ROUND(100.0 * COUNT(CASE WHEN target IS NOT NULL AND target NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_target,
          ROUND(100.0 * COUNT(CASE WHEN indication IS NOT NULL AND indication NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_indication
        FROM ingested_assets
        WHERE relevant = true
        GROUP BY institution
        ORDER BY COUNT(*) DESC
        LIMIT 500
      `);

      res.json({
        global: globalResult.rows[0],
        institutions: institutionResult.rows,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch dataset quality" });
    }
  });

  // --- Dimensional Analytics ---

  const DIM_COL: Record<string, string> = {
    modality: "modality",
    stage: "development_stage",
    indication: "indication",
  };

  app.get("/api/admin/dataset-quality/dimensions", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const dim = String(req.query.dim ?? "modality");
      const col = DIM_COL[dim];
      if (!col) return res.status(400).json({ error: "Invalid dim — use modality, stage, or indication" });

      const rows = await db.execute(sql`
        SELECT
          COALESCE(${sql.raw(col)}, 'unknown') AS value,
          COUNT(*)::int AS count,
          ROUND(AVG(completeness_score)::numeric, 1) AS avg_completeness,
          ROUND(100.0 * COUNT(CASE WHEN target IS NOT NULL AND target NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_target,
          ROUND(100.0 * COUNT(CASE WHEN indication IS NOT NULL AND indication NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_indication
        FROM ingested_assets
        WHERE relevant = true
        GROUP BY ${sql.raw(col)}
        ORDER BY COUNT(*) DESC
        LIMIT 15
      `);

      res.json({ dim, rows: rows.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch dimensions" });
    }
  });

  app.get("/api/admin/dataset-quality/dimensions/export", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const dim = String(req.query.dim ?? "modality");
      const col = DIM_COL[dim];
      if (!col) return res.status(400).json({ error: "Invalid dim" });

      const rows = await db.execute(sql`
        SELECT
          COALESCE(${sql.raw(col)}, 'unknown') AS value,
          COUNT(*)::int AS count,
          ROUND(AVG(completeness_score)::numeric, 1) AS avg_completeness,
          ROUND(100.0 * COUNT(CASE WHEN target IS NOT NULL AND target NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_target,
          ROUND(100.0 * COUNT(CASE WHEN indication IS NOT NULL AND indication NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_indication
        FROM ingested_assets
        WHERE relevant = true
        GROUP BY ${sql.raw(col)}
        ORDER BY COUNT(*) DESC
      `);

      const escape = (v: unknown) => {
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""');
        return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
      };

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="dimension-${dim}.csv"`);
      res.write("value,count,avg_completeness,fill_target,fill_indication\n");
      for (const row of rows.rows as Record<string, unknown>[]) {
        res.write([escape(row.value), escape(row.count), escape(row.avg_completeness), escape(row.fill_target), escape(row.fill_indication)].join(",") + "\n");
      }
      res.end();
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Export failed" });
    }
  });

  app.get("/api/admin/dataset-quality/institution/:name", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const institutionName = req.params.name;
      const rows = await db.execute(sql`
        SELECT id, asset_name, target, indication, modality, development_stage, completeness_score
        FROM ingested_assets
        WHERE relevant = true
          AND COALESCE(institution, 'Unknown') = ${institutionName}
        ORDER BY completeness_score ASC NULLS FIRST
        LIMIT 5
      `);

      res.json({ assets: rows.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch institution assets" });
    }
  });

  // --- CSV Exports (relevant=true only) ---

  app.get("/api/admin/export/unenriched-csv", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const rows = await db.execute(sql`
        SELECT id, asset_name, abstract, summary, source_name
        FROM ingested_assets
        WHERE relevant = true AND completeness_score IS NULL
        ORDER BY id
      `);

      const escape = (v: unknown) => {
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""');
        return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
      };

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=\"unenriched-relevant-assets.csv\"");

      res.write("id,asset_name,abstract,summary,source_name\n");
      for (const row of rows.rows as Record<string, unknown>[]) {
        res.write(`${escape(row.id)},${escape(row.asset_name)},${escape(row.abstract)},${escape(row.summary)},${escape(row.source_name)}\n`);
      }
      res.end();
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Export failed" });
    }
  });

  app.get("/api/admin/export/full-relevant-csv", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const rows = await db.execute(sql`
        SELECT id, asset_name, source_name, target, indication, modality, development_stage,
               licensing_readiness, ip_type, completeness_score,
               abstract, summary, source_url, first_seen_at
        FROM ingested_assets
        WHERE relevant = true
        ORDER BY completeness_score DESC NULLS LAST
      `);

      const escape = (v: unknown) => {
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""');
        return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
      };

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=\"all-relevant-assets.csv\"");

      res.write("id,asset_name,source_name,target,indication,modality,development_stage,licensing_readiness,ip_type,completeness_score,abstract,summary,source_url,first_seen_at\n");
      for (const row of rows.rows as Record<string, unknown>[]) {
        res.write([
          escape(row.id), escape(row.asset_name), escape(row.source_name),
          escape(row.target), escape(row.indication), escape(row.modality),
          escape(row.development_stage), escape(row.licensing_readiness), escape(row.ip_type),
          escape(row.completeness_score), escape(row.abstract), escape(row.summary),
          escape(row.source_url), escape(row.first_seen_at),
        ].join(",") + "\n");
      }
      res.end();
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Export failed" });
    }
  });

  // --- Asset Browser ---

  app.get("/api/admin/assets/filter-values", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const [modRows, stageRows] = await Promise.all([
        db.execute(sql`
          SELECT DISTINCT modality AS value FROM ingested_assets
          WHERE relevant = true AND modality IS NOT NULL AND modality NOT IN ('unknown','')
          ORDER BY modality ASC LIMIT 80
        `),
        db.execute(sql`
          SELECT DISTINCT development_stage AS value FROM ingested_assets
          WHERE relevant = true AND development_stage IS NOT NULL AND development_stage NOT IN ('unknown','')
          ORDER BY development_stage ASC LIMIT 40
        `),
      ]);

      res.json({
        modalities: (modRows.rows as { value: string }[]).map(r => r.value),
        stages: (stageRows.rows as { value: string }[]).map(r => r.value),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  function buildAssetWhere(q: Record<string, any>) {
    const parts: ReturnType<typeof sql>[] = [sql`relevant = true`];
    if (q.institution) parts.push(sql`institution ILIKE ${'%' + q.institution + '%'}`);
    if (q.modality) parts.push(sql`modality = ${q.modality}`);
    if (q.stage) parts.push(sql`development_stage = ${q.stage}`);
    if (q.indication) parts.push(sql`indication ILIKE ${'%' + q.indication + '%'}`);
    if (q.q) parts.push(sql`asset_name ILIKE ${'%' + q.q + '%'}`);
    if (q.tier) {
      const t = q.tier;
      if (t === "excellent") parts.push(sql`completeness_score >= 80`);
      else if (t === "good") parts.push(sql`completeness_score >= 60 AND completeness_score < 80`);
      else if (t === "partial") parts.push(sql`completeness_score >= 40 AND completeness_score < 60`);
      else if (t === "poor") parts.push(sql`completeness_score >= 1 AND completeness_score < 40`);
      else if (t === "unscored") parts.push(sql`(completeness_score IS NULL OR completeness_score = 0)`);
    }
    if (q.missing) {
      const m = q.missing;
      if (m === "target") parts.push(sql`(target IS NULL OR target IN ('unknown',''))`);
      else if (m === "indication") parts.push(sql`(indication IS NULL OR indication IN ('unknown',''))`);
      else if (m === "modality") parts.push(sql`(modality IS NULL OR modality IN ('unknown',''))`);
      else if (m === "stage") parts.push(sql`(development_stage IS NULL OR development_stage IN ('unknown',''))`);
    }
    return parts.reduce((a, b) => sql`${a} AND ${b}`);
  }

  app.get("/api/admin/assets", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
      const offset = (page - 1) * limit;

      const sortParam = String(req.query.sort ?? "score");
      const dirParam = String(req.query.dir ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
      const sortCol = sortParam === "name" ? "asset_name" : sortParam === "date" ? "first_seen_at" : "completeness_score";
      const nullsClause = sortCol === "completeness_score" ? "NULLS LAST" : "";

      const where = buildAssetWhere(req.query as Record<string, any>);

      const [countRes, globalRes, rowsRes] = await Promise.all([
        db.execute(sql`SELECT COUNT(*)::int AS total FROM ingested_assets WHERE ${where}`),
        db.execute(sql`SELECT COUNT(*)::int AS global_total FROM ingested_assets WHERE relevant = true`),
        db.execute(sql`
          SELECT id, asset_name, institution, target, indication, modality, development_stage,
                 ip_type, licensing_readiness, completeness_score, mechanism_of_action,
                 innovation_claim, unmet_need, comparable_drugs, source_url, abstract, summary,
                 first_seen_at, enriched_at, patent_status, categories, inventors
          FROM ingested_assets
          WHERE ${where}
          ORDER BY ${sql.raw(sortCol)} ${sql.raw(dirParam)} ${sql.raw(nullsClause)}
          LIMIT ${limit} OFFSET ${offset}
        `),
      ]);

      res.json({
        total: (countRes.rows[0] as any).total,
        globalTotal: (globalRes.rows[0] as any).global_total,
        page,
        limit,
        assets: rowsRes.rows,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch assets" });
    }
  });

  app.get("/api/admin/assets/export", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const where = buildAssetWhere(req.query as Record<string, any>);

      const rows = await db.execute(sql`
        SELECT id, asset_name, institution, target, indication, modality, development_stage,
               ip_type, licensing_readiness, completeness_score, mechanism_of_action,
               innovation_claim, unmet_need, comparable_drugs, source_url, abstract, summary,
               first_seen_at
        FROM ingested_assets
        WHERE ${where}
        ORDER BY completeness_score DESC NULLS LAST
      `);

      const escape = (v: unknown) => {
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""');
        return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
      };

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=\"assets-export.csv\"");
      res.write("id,asset_name,institution,target,indication,modality,development_stage,ip_type,licensing_readiness,completeness_score,mechanism_of_action,innovation_claim,unmet_need,comparable_drugs,source_url,abstract,summary,first_seen_at\n");
      for (const row of rows.rows as Record<string, unknown>[]) {
        res.write([
          escape(row.id), escape(row.asset_name), escape(row.institution),
          escape(row.target), escape(row.indication), escape(row.modality),
          escape(row.development_stage), escape(row.ip_type), escape(row.licensing_readiness),
          escape(row.completeness_score), escape(row.mechanism_of_action), escape(row.innovation_claim),
          escape(row.unmet_need), escape(row.comparable_drugs), escape(row.source_url),
          escape(row.abstract), escape(row.summary), escape(row.first_seen_at),
        ].join(",") + "\n");
      }
      res.end();
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Export failed" });
    }
  });

  app.patch("/api/admin/assets/:id", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

      const existingRes = await db.execute(sql`
        SELECT target, indication, modality, development_stage, ip_type, licensing_readiness,
               mechanism_of_action, innovation_claim, unmet_need, comparable_drugs, summary, abstract,
               categories, inventors, patent_status
        FROM ingested_assets WHERE id = ${id}
      `);
      if (existingRes.rows.length === 0) return res.status(404).json({ error: "Not found" });
      const existing = existingRes.rows[0] as Record<string, any>;

      const body = req.body ?? {};
      const editableFields = ["target", "indication", "modality", "development_stage", "ip_type",
        "licensing_readiness", "mechanism_of_action", "innovation_claim", "unmet_need",
        "comparable_drugs", "summary", "abstract"];

      const merged: Record<string, any> = {};
      for (const f of editableFields) {
        merged[f] = (f in body) ? (body[f] ?? null) : (existing[f] ?? null);
      }

      const score = computeCompletenessScore({
        target: merged.target,
        modality: merged.modality,
        indication: merged.indication,
        developmentStage: merged.development_stage,
        summary: merged.summary,
        abstract: merged.abstract,
        categories: existing.categories ?? null,
        innovationClaim: merged.innovation_claim,
        mechanismOfAction: merged.mechanism_of_action,
        inventors: existing.inventors ?? null,
        patentStatus: existing.patent_status ?? null,
      });

      await db.execute(sql`
        UPDATE ingested_assets SET
          target = ${merged.target},
          indication = ${merged.indication},
          modality = ${merged.modality},
          development_stage = ${merged.development_stage},
          ip_type = ${merged.ip_type},
          licensing_readiness = ${merged.licensing_readiness},
          mechanism_of_action = ${merged.mechanism_of_action},
          innovation_claim = ${merged.innovation_claim},
          unmet_need = ${merged.unmet_need},
          comparable_drugs = ${merged.comparable_drugs},
          summary = ${merged.summary},
          abstract = ${merged.abstract},
          completeness_score = ${score},
          enriched_at = NOW()
        WHERE id = ${id}
      `);

      const updatedRes = await db.execute(sql`
        SELECT id, asset_name, institution, target, indication, modality, development_stage,
               ip_type, licensing_readiness, completeness_score, mechanism_of_action,
               innovation_claim, unmet_need, comparable_drugs, source_url, abstract, summary,
               first_seen_at, enriched_at, patent_status, categories, inventors
        FROM ingested_assets WHERE id = ${id}
      `);

      res.json({ asset: updatedRes.rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Patch failed" });
    }
  });

  app.get("/api/admin/enrichment/status", async (req, res) => {
    const pw = req.query.pw ?? req.headers["x-admin-password"];
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

    const lastJob = await storage.getLatestEnrichmentJob();

    if (liveEnrichment && lastJob && liveEnrichment.jobId === lastJob.id) {
      return res.json({
        status: "running",
        jobId: lastJob.id,
        processed: liveEnrichment.processed,
        total: liveEnrichment.total,
        improved: liveEnrichment.improved,
        resumed: liveEnrichment.resumed,
      });
    }

    if (lastJob) {
      // "completed" is the reset/dismissed state — treat as idle for UI purposes
      if (lastJob.status === "completed") {
        return res.json({ status: "idle", processed: 0, total: 0, improved: 0, resumed: false });
      }
      return res.json({
        status: lastJob.status as string,
        jobId: lastJob.id,
        processed: lastJob.processed,
        total: lastJob.total,
        improved: lastJob.improved,
        resumed: false,
      });
    }

    res.json({ status: "idle", processed: 0, total: 0, improved: 0, resumed: false });
  });

  app.post("/api/admin/enrichment/reset", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      if (liveEnrichment) {
        return res.status(409).json({ error: "Cannot reset while enrichment is running" });
      }
      await storage.resetLatestEnrichmentJob();
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to reset enrichment status" });
    }
  });

  app.post("/api/admin/enrichment/run", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      if (liveEnrichment) {
        return res.status(409).json({ error: "Enrichment job already running" });
      }

      const existingJob = await storage.getRunningEnrichmentJob();
      if (existingJob) {
        return res.status(409).json({ error: "Enrichment job already running (will resume on next restart)" });
      }

      const assets = await storage.getIncompleteAssets();
      if (assets.length === 0) {
        return res.json({ message: "No incomplete assets to enrich" });
      }

      const job = await storage.createEnrichmentJob(assets.length);
      res.json({ message: "Enrichment started", total: assets.length, jobId: job.id });

      standardEnrichShouldStop = false;
      runEnrichmentWorker(job.id, assets, 0, 0, false);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to start enrichment" });
    }
  });

  // Delay startup enrichment resume check so the migration client and scheduler
  // restoration queries can connect to Supabase/PgBouncer first without contention.
  setTimeout(async () => {
    try {
      const staleJob = await storage.getRunningEnrichmentJob();
      if (staleJob) {
        const remaining = await storage.getIncompleteAssets(staleJob.startedAt);
        if (remaining.length > 0) {
          console.log(`[enrichment] Resuming job ${staleJob.id}: ${remaining.length} assets remaining (${staleJob.processed} already processed)`);
          runEnrichmentWorker(staleJob.id, remaining, staleJob.processed, staleJob.improved, true);
        } else {
          await storage.updateEnrichmentJob(staleJob.id, { status: "done", completedAt: new Date() });
          console.log(`[enrichment] Stale job ${staleJob.id} had no remaining work — marked done`);
        }
      }
    } catch (e) {
      console.error("[enrichment] Failed to check for resumable jobs:", e);
    }
  }, 15_000);

  // ── EDEN routes ──────────────────────────────────────────────────────────

  let edenJobId: number | null = null;
  let edenRunning = false;
  let edenProcessed = 0;
  let edenTotal = 0;
  let edenImproved = 0;
  let edenFailed = 0;
  let edenShouldStop = false;

  app.get("/api/admin/eden/stats", async (req, res) => {
    const pass = req.headers["x-admin-password"] ?? req.query.adminPassword;
    if (pass !== "eden") return res.status(401).json({ error: "Unauthorized" });
    try {
      const [coverage, embeddingCoverage, latest, breakdown] = await Promise.all([
        storage.getDeepEnrichmentCoverage(),
        storage.getEmbeddingCoverage(),
        storage.getLatestDeepEnrichmentJob(),
        storage.getAssetsNeedingDeepEnrichBreakdown(),
      ]);
      res.json({
        coverage,
        embeddingCoverage,
        latestJob: latest ?? null,
        needingDeepEnrich: breakdown.total,
        breakdown,
        live: edenRunning ? { processed: edenProcessed, total: edenTotal } : null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/eden/enrich", async (req, res) => {
    const pass = req.headers["x-admin-password"] ?? req.body?.adminPassword;
    if (pass !== "eden") return res.status(401).json({ error: "Unauthorized" });
    if (edenRunning) return res.status(409).json({ error: "Deep enrichment already running" });
    try {
      const [assets, breakdown] = await Promise.all([
        storage.getAssetsNeedingDeepEnrich(),
        storage.getAssetsNeedingDeepEnrichBreakdown(),
      ]);
      if (assets.length === 0) return res.json({ message: "All relevant assets already deeply enriched", total: 0, breakdown: { fresh: 0, legacy: 0, lowQualityRetry: 0, total: 0 } });

      edenTotal = assets.length;
      edenProcessed = 0;
      edenRunning = true;
      edenShouldStop = false;

      edenImproved = 0;
      edenFailed = 0;

      const job = await storage.createDeepEnrichmentJob(assets.length);
      edenJobId = job.id;

      res.json({ message: "Deep enrichment started", jobId: job.id, total: assets.length, breakdown });

      deepEnrichBatch(
        assets.map((a) => ({
          id: a.id,
          assetName: a.assetName,
          summary: a.summary,
          abstract: a.abstract,
          ctx: {
            categories: a.categories,
            patentStatus: a.patentStatus,
            licensingStatus: a.licensingStatus,
            inventors: a.inventors,
            sourceUrl: a.sourceUrl,
          },
        })),
        20,
        async (batch) => {
          return storage.bulkUpdateIngestedAssetsDeepEnrichment(batch);
        },
        (processed, _total, succeeded, failed) => {
          edenProcessed = processed;
          edenImproved = succeeded;
          edenFailed = failed;
          if (edenJobId !== null) {
            storage.updateEnrichmentJob(edenJobId, { processed, improved: succeeded }).catch(() => {});
          }
        },
        () => edenShouldStop,
      ).then(async (batchResult) => {
        edenRunning = false;
        edenImproved = batchResult.succeeded;
        edenFailed = batchResult.failed;
        if (edenJobId !== null) {
          await storage.updateEnrichmentJob(edenJobId, {
            status: edenShouldStop ? "stopped" : "done",
            completedAt: new Date(),
            processed: batchResult.succeeded + batchResult.failed,
            improved: batchResult.succeeded,
          }).catch(() => {});
        }
        console.log(`[EDEN] Deep enrichment ${edenShouldStop ? "stopped" : "complete"}: ${batchResult.succeeded} succeeded, ${batchResult.failed} failed`);
        // Automatically trigger near-duplicate detection after enrichment completes
        if (!edenShouldStop) {
          storage.runNearDuplicateDetection((msg) => console.log(`[dedup/post-enrich] ${msg}`))
            .then((r) => console.log(`[dedup/post-enrich] Done: ${r.flagged} flagged, ${r.embedded} embedded`))
            .catch((e: any) => console.error("[dedup/post-enrich] Failed:", e?.message));
        }
      }).catch(async (e) => {
        edenRunning = false;
        if (edenJobId !== null) {
          await storage.updateEnrichmentJob(edenJobId, { status: "failed", completedAt: new Date(), processed: edenProcessed, improved: edenImproved }).catch(() => {});
        }
        console.error("[EDEN] Deep enrichment failed:", e);
      });
    } catch (err: any) {
      edenRunning = false;
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/eden/enrich/status", async (req, res) => {
    const pass = req.headers["x-admin-password"] ?? req.query.adminPassword;
    if (pass !== "eden") return res.status(401).json({ error: "Unauthorized" });
    try {
      const latest = await storage.getLatestDeepEnrichmentJob();
      res.json({
        running: edenRunning,
        processed: edenProcessed,
        total: edenTotal,
        succeeded: edenImproved,
        failed: edenFailed,
        job: latest ?? null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/eden/enrich/stop", async (req, res) => {
    const pass = req.headers["x-admin-password"] ?? req.body?.adminPassword;
    if (pass !== "eden") return res.status(401).json({ error: "Unauthorized" });
    if (!edenRunning) return res.json({ message: "No EDEN enrichment running" });
    edenShouldStop = true;
    res.json({ message: "Stop signal sent — finishing in-flight batch then halting" });
  });

  app.post("/api/admin/enrichment/stop", async (req, res) => {
    const pass = req.query.pw ?? req.headers["x-admin-password"];
    if (pass !== "eden") return res.status(401).json({ error: "Unauthorized" });
    if (!liveEnrichment) return res.json({ message: "No standard enrichment running" });
    standardEnrichShouldStop = true;
    res.json({ message: "Stop signal sent — finishing in-flight assets then halting" });
  });

  // Delay so the migration client and scheduler restoration queries finish
  // before we hit the pool with startup enrichment-job checks.
  const edenStartupDelay = 15_000;
  setTimeout(async () => {
    try {
      const staleDeepJob = await storage.getRunningDeepEnrichmentJob();
      if (staleDeepJob) {
        const remaining = await storage.getAssetsNeedingDeepEnrich();
        if (remaining.length > 0) {
          console.log(`[EDEN] Resuming deep enrichment job ${staleDeepJob.id}: ${remaining.length} assets remaining`);
          edenTotal = remaining.length;
          edenProcessed = staleDeepJob.processed ?? 0;
          edenImproved = staleDeepJob.improved ?? 0;
          edenFailed = 0;
          edenRunning = true;
          edenShouldStop = false;
          edenJobId = staleDeepJob.id;

          deepEnrichBatch(
            remaining.map((a) => ({
              id: a.id,
              assetName: a.assetName,
              summary: a.summary,
              abstract: a.abstract,
              ctx: {
                categories: a.categories,
                patentStatus: a.patentStatus,
                licensingStatus: a.licensingStatus,
                inventors: a.inventors,
                sourceUrl: a.sourceUrl,
              },
            })),
            20,
            async (batch) => storage.bulkUpdateIngestedAssetsDeepEnrichment(batch),
            (processed, _total, succeeded, failed) => {
              edenProcessed = (staleDeepJob.processed ?? 0) + processed;
              edenImproved = (staleDeepJob.improved ?? 0) + succeeded;
              edenFailed = failed;
              storage.updateEnrichmentJob(staleDeepJob.id, { processed: edenProcessed, improved: edenImproved }).catch(() => {});
            },
            () => edenShouldStop,
          ).then(async (batchResult) => {
            edenRunning = false;
            await storage.updateEnrichmentJob(staleDeepJob.id, {
              status: edenShouldStop ? "stopped" : "done",
              completedAt: new Date(),
              processed: (staleDeepJob.processed ?? 0) + batchResult.succeeded + batchResult.failed,
              improved: (staleDeepJob.improved ?? 0) + batchResult.succeeded,
            }).catch(() => {});
            console.log(`[EDEN] Resumed job ${edenShouldStop ? "stopped" : "complete"}: ${batchResult.succeeded} succeeded, ${batchResult.failed} failed`);
            // Automatically trigger near-duplicate detection after enrichment completes
            if (!edenShouldStop) {
              storage.runNearDuplicateDetection((msg) => console.log(`[dedup/post-enrich] ${msg}`))
                .then((r) => console.log(`[dedup/post-enrich] Done: ${r.flagged} flagged, ${r.embedded} embedded`))
                .catch((e: any) => console.error("[dedup/post-enrich] Failed:", e?.message));
            }
          }).catch(async (e) => {
            edenRunning = false;
            await storage.updateEnrichmentJob(staleDeepJob.id, { status: "failed", completedAt: new Date(), processed: edenProcessed, improved: edenImproved }).catch(() => {});
            console.error("[EDEN] Resumed job failed:", e);
          });
        } else {
          await storage.updateEnrichmentJob(staleDeepJob.id, { status: "done", completedAt: new Date() });
          console.log(`[EDEN] Stale deep job ${staleDeepJob.id} had no remaining work — marked done`);
        }
      }
    } catch (e) {
      console.error("[EDEN] Failed to check for resumable deep enrichment jobs:", e);
    }
  }, edenStartupDelay);

  // ── EDEN embedding routes ────────────────────────────────────────────────

  let embedRunning = false;
  let embedProcessed = 0;
  let embedTotal = 0;
  let embedSucceeded = 0;
  let embedFailed = 0;

  app.post("/api/admin/eden/embed", async (req, res) => {
    const pass = req.headers["x-admin-password"] ?? req.body?.adminPassword;
    if (pass !== "eden") return res.status(401).json({ error: "Unauthorized" });
    if (embedRunning) return res.status(409).json({ error: "Embedding already running" });
    try {
      const assets = await storage.getAssetsNeedingEmbedding();
      if (assets.length === 0) return res.json({ message: "All relevant assets already embedded", total: 0 });

      embedTotal = assets.length;
      embedProcessed = 0;
      embedSucceeded = 0;
      embedFailed = 0;
      embedRunning = true;

      res.json({ message: "Embedding started", total: assets.length });

      embedAssets(assets, (processed, _total, succeeded, failed) => {
        embedProcessed = processed;
        embedSucceeded = succeeded;
        embedFailed = failed;
      }).then((result) => {
        embedRunning = false;
        embedSucceeded = result.succeeded;
        embedFailed = result.failed;
        console.log(`[EDEN] Embedding complete: ${result.succeeded} succeeded, ${result.failed} failed`);
      }).catch((e) => {
        embedRunning = false;
        console.error("[EDEN] Embedding failed:", e);
      });
    } catch (err: any) {
      embedRunning = false;
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/eden/embed/status", async (req, res) => {
    const pass = req.headers["x-admin-password"] ?? req.query.adminPassword;
    if (pass !== "eden") return res.status(401).json({ error: "Unauthorized" });
    res.json({
      running: embedRunning,
      processed: embedProcessed,
      total: embedTotal,
      succeeded: embedSucceeded,
      failed: embedFailed,
    });
  });

  // ── FDA Designation enrichment ────────────────────────────────────────────

  let fdaDesignationRunning = false;

  app.post("/api/admin/fda-designations/run", async (req, res) => {
    const pass = req.headers["x-admin-password"] ?? req.body?.adminPassword;
    if (pass !== "eden") return res.status(401).json({ error: "Unauthorized" });
    if (fdaDesignationRunning) return res.status(409).json({ error: "FDA designation job already running" });
    fdaDesignationRunning = true;
    res.json({ message: "FDA designation match started" });
    try {
      const result = await runFdaDesignationMatch();
      console.log("[admin] FDA designation match complete:", result);
      const { recordFdaDesignationHealth } = await import("./lib/scraperState");
      await recordFdaDesignationHealth(result.tagged, result.errors).catch(() => {});
    } catch (err: any) {
      console.error("[admin] FDA designation match failed:", err?.message);
      const { recordFdaDesignationHealth } = await import("./lib/scraperState");
      await recordFdaDesignationHealth(0, 1).catch(() => {});
    } finally {
      fdaDesignationRunning = false;
    }
  });

  app.get("/api/admin/fda-designations/status", async (req, res) => {
    const pass = req.headers["x-admin-password"] ?? req.query.adminPassword;
    if (pass !== "eden") return res.status(401).json({ error: "Unauthorized" });
    const health = await loadFdaDesignationHealth().catch(() => null);
    res.json({
      running: fdaDesignationRunning,
      lastRunAt: health?.lastSuccessAt ?? null,
      lastTaggedCount: health?.lastSuccessNewCount ?? null,
      consecutiveFailures: health?.consecutiveFailures ?? 0,
      lastFailureReason: health?.lastFailureReason ?? null,
      lastFailureAt: health?.lastFailureAt ?? null,
    });
  });

  // ── EDEN chat routes ──────────────────────────────────────────────────────

  app.post("/api/eden/chat", async (req, res) => {
    const pass = req.headers["x-admin-password"] ?? req.body?.adminPassword;
    const SITE_PASSWORD = process.env.SITE_PASSWORD ?? "quality";
    if (pass !== "eden" && pass !== SITE_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

    const { message, sessionId, userContext } = req.body ?? {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const sid = (typeof sessionId === "string" && sessionId) || crypto.randomUUID();
    const ctx: UserContext | undefined = userContext && typeof userContext === "object" ? userContext as UserContext : undefined;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const [session, portfolioStats] = await Promise.all([
        storage.getOrCreateEdenSession(sid),
        fetchPortfolioStats().catch((err) => {
          console.error("[eden] Portfolio stats preload failed:", err?.message ?? err);
          return undefined;
        }),
      ]);
      const history = (session.messages ?? []).map((t) => ({ role: t.role, content: t.content }));

      // ── Seed in-memory focus from DB on first message of this server process ──
      seedSessionFocusFromDb(sid, session.focusContext);

      await storage.appendEdenMessage(sid, { role: "user", content: message.trim() });

      // ── Portfolio institution names for two-pass detection ────────────────
      // Defined first so pass-2 can be used in focus extraction AND filter override.
      const portfolioInstitutionNames: string[] = portfolioStats?.topInstitutions?.map((i: { institution: string }) => i.institution) ?? [];

      // ── Session focus context + filter extraction ──────────────────────────
      // Pass portfolio institution names so pass-2 detected institutions persist to focusContext
      const focusContext = getOrUpdateSessionFocus(sid, message.trim(), portfolioInstitutionNames);
      // Unconditional reset: any reset-intent message clears adaptive engagement
      // signals regardless of whether focus itself transitioned to empty.
      // This covers "start fresh with gene therapy" (focus becomes non-empty
      // but old engagement signals must still be wiped).
      if (isEngagementResetMessage(message.trim())) {
        markEngagementReset(sid);
      }
      const filters = parseQueryFilters(message.trim(), focusContext);

      // Override filters.institution with two-pass detection if not already set.
      // Must happen BEFORE filtersActive computation so pass-2 institutions
      // consistently trigger filtered semantic search.
      if (!filters.institution) {
        const detected = detectInstitutionName(message.trim(), portfolioInstitutionNames);
        if (detected) filters.institution = detected;
      }

      const filtersActive = hasMeaningfulFilters(filters);
      const geoRx: string | undefined = filters.geography ? GEO_INSTITUTION_REGEX[filters.geography] : undefined;

      // Fire-and-forget focus persistence to DB
      persistSessionFocus(sid, focusContext).catch((e) =>
        console.warn("[eden] focus persist failed:", e?.message ?? e)
      );

      // ── Intent classification (order matters) ─────────────────────────────
      // Routing priority (evaluated top-to-bottom, first match wins):
      //   1. Back-reference  — must be first; anaphoric phrases like "tell me more about
      //      the second one" look conversational to isConversational(), so checking them
      //      before conversational routing is essential. Comparative queries are excluded
      //      here — they resolve their own entities in Path 3.
      //   2. Aggregation     — count phrases lack biotech signals; must beat conversational.
      //   3. Comparative     — head-to-head asset comparisons with prior-context resolution.
      //   4. Definitional    — "what is a PROTAC?" beats conversational/RAG.
      //   5. Conversational  — general chitchat, greetings, out-of-scope.
      //   6. Standard RAG    — default retrieval path.

      // Pre-compute back-reference state so we can use it in the routing guard.
      // Find the most recent assistant turn with non-empty assetIds — skips
      // intervening conversational/definitional turns that have empty assetIds.
      const lastAssistantWithAssets = [...(session.messages ?? [])].reverse().find(
        (m) => m.role === "assistant" && (m.assetIds?.length ?? 0) > 0
      );
      const priorIds: number[] = (lastAssistantWithAssets?.assetIds ?? []).slice(0, 3);
      // Comparative queries do their own multi-asset entity resolution — exclude from back-ref
      // so "compare the first to the second" reaches Path 3 rather than Path 1.
      const isComparative = isComparativeQuery(message.trim());
      const isBackRef = !isComparative && priorIds.length > 0 && detectBackReference(message.trim());

      // ── Path 1: Back-reference ─────────────────────────────────────────────
      if (isBackRef) {
        const fetchedAssets = await storage.getIngestedAssetsByIds(priorIds).catch(() => [] as import("./storage").RetrievedAsset[]);
        // Restore original retrieval order (SQL IN clause does not guarantee order)
        const idOrder = new Map(priorIds.map((id, i) => [id, i]));
        fetchedAssets.sort((a, b) => (idOrder.get(a.id) ?? 99) - (idOrder.get(b.id) ?? 99));

        let targeted: import("./storage").RetrievedAsset[];
        // Institution-qualified back-ref: "the one from MIT", "that one from Stanford"
        const backRefInst = extractBackRefInstitution(message.trim(), portfolioInstitutionNames);
        if (backRefInst) {
          const instMatch = fetchedAssets.filter((a) =>
            a.institution?.toLowerCase().includes(backRefInst.toLowerCase())
          );
          targeted = instMatch.length > 0 ? instMatch : fetchedAssets;
        } else {
          const pos = extractBackRefPosition(message.trim());
          targeted = pos !== null && fetchedAssets[pos] ? [fetchedAssets[pos]] : fetchedAssets;
        }

        const assetPayload = targeted.map((a) => ({
          id: a.id, assetName: a.assetName, institution: a.institution,
          indication: a.indication, modality: a.modality, developmentStage: a.developmentStage,
          ipType: a.ipType, sourceName: a.sourceName, sourceUrl: a.sourceUrl, similarity: 1.0,
        }));
        sendEvent("context", { sessionId: sid, assets: assetPayload });
        let fullResponse = "";
        for await (const token of ragQuery(message.trim(), targeted, history, ctx, portfolioStats, focusContext)) {
          fullResponse += token;
          sendEvent("token", { text: token });
        }
        await storage.appendEdenMessage(sid, {
          role: "assistant", content: fullResponse,
          assetIds: targeted.map((a) => a.id), assets: assetPayload,
        });
        sendEvent("done", { sessionId: sid });
        return;
      }

      const aggQuery = isAggregationQuery(message.trim());
      const definitional = !aggQuery && isDefinitionalQuery(message.trim());
      const chat = !aggQuery && !definitional && isConversational(message.trim());

      // ── Path 2: Aggregation / count queries ──────────────────────────────
      if (aggQuery) {
        const resolvedResult = await resolveAggregationQuery(message.trim(), filters, geoRx).catch(() => null);
        if (resolvedResult) {
          sendEvent("context", { sessionId: sid, assets: [] });
          let fullResponse = "";
          for await (const token of aggregationQuery(message.trim(), resolvedResult, history, ctx, portfolioStats, focusContext)) {
            fullResponse += token;
            sendEvent("token", { text: token });
          }
          await storage.appendEdenMessage(sid, { role: "assistant", content: fullResponse, assetIds: [], assets: [] });
          sendEvent("done", { sessionId: sid });
          return;
        }

        const count = await storage.filteredCount(geoRx, filters.modality, filters.stage, filters.indication, filters.institution).catch(() => null);
        if (count !== null) {
          const filterDesc = [
            filters.geography ? `${filters.geography.toUpperCase()} institution` : "",
            filters.modality || "", filters.stage || "",
            filters.indication || "", filters.institution || "",
          ].filter(Boolean).join(", ");
          const sqlCountResult = filterDesc
            ? `Filtered count (${filterDesc}): **${count}** relevant assets match the active filters.`
            : `Total relevant assets indexed in the portfolio: **${count.toLocaleString()}**`;
          sendEvent("context", { sessionId: sid, assets: [] });
          let fullResponse = "";
          for await (const token of aggregationQuery(message.trim(), sqlCountResult, history, ctx, portfolioStats, focusContext)) {
            fullResponse += token;
            sendEvent("token", { text: token });
          }
          await storage.appendEdenMessage(sid, { role: "assistant", content: fullResponse, assetIds: [], assets: [] });
          sendEvent("done", { sessionId: sid });
          return;
        }
        // fall through to RAG if SQL cannot resolve
      }

      // ── Path 3: Comparative / head-to-head ──────────────────────────────
      // Resolver contract:
      //   hasExplicitRefs — true when the user cited specific ordinals, asset names,
      //   or institutions. Explicit references are terminal on partial failure; the
      //   user named something concrete and we must say what we could not find.
      //   Steps d/e (priorIds fallback, semantic) are only used for implicit queries
      //   like "compare these" or "compare gene therapy assets" that carry no specific ref.
      //
      // Resolution order (first successful path wins):
      //   a) Ordinal back-refs   — "first"/"second"/"third" → priorIds positional index
      //   b) Named-asset refs    — prior asset names (>=5 chars) verbatim in query
      //   c) Institution refs    — detectAllInstitutionNames (alias-aware, canonical-normalized)
      //   d) All priorIds        — implicit "compare these" (only when !hasExplicitRefs)
      //   e) Semantic fallback   — embed + retrieve from portfolio (only when !hasExplicitRefs)
      if (isComparative) {
        let compareIds: number[] = [];
        let terminalError: string | null = null;
        let hasExplicitRefs = false;

        // All prior asset payloads from typed session messages (assets is schema-typed on EdenSession)
        const allPriorAssetPayloads = (session.messages ?? [])
          .filter((m) => m.role === "assistant" && (m.assetIds?.length ?? 0) > 0)
          .flatMap((m) => m.assets ?? []);

        const msgLower = message.trim().toLowerCase();

        // ── Step a: ordinal back-refs ─────────────────────────────────────
        const ordinalPositions: number[] = [];
        if (/\bfirst\b|\b1st\b/.test(msgLower)) ordinalPositions.push(0);
        if (/\bsecond\b|\b2nd\b/.test(msgLower)) ordinalPositions.push(1);
        if (/\bthird\b|\b3rd\b/.test(msgLower)) ordinalPositions.push(2);
        if (ordinalPositions.length >= 2) {
          hasExplicitRefs = true;
          const resolvable = ordinalPositions.filter((p) => priorIds[p] !== undefined);
          if (resolvable.length >= 2) {
            compareIds = [...new Set(resolvable)].map((p) => priorIds[p]);
          } else {
            const avail = priorIds.length;
            terminalError = avail === 0
              ? "I don't have any previously shown assets to reference — search for a set of assets first, then ask me to compare them."
              : `I can see ${avail} previously shown asset${avail === 1 ? "" : "s"}, but your message references positions beyond what's available. Ask me to find more assets or compare the ones already shown.`;
          }
        }

        // ── Step b: named-asset matching ──────────────────────────────────
        // Detects prior asset names (>=5 chars) verbatim in the query against
        // session history. Named refs are explicit — any partial match (1 found)
        // triggers a portfolio-level semantic search for the missing side.
        // If portfolio search also fails, emits a terminal error naming the gap.
        if (compareIds.length < 2 && !terminalError) {
          const namedMatches: number[] = [];
          for (const a of allPriorAssetPayloads) {
            if (!a.assetName || a.assetName.length < 5) continue;
            if (msgLower.includes(a.assetName.toLowerCase()) && !namedMatches.includes(a.id)) {
              namedMatches.push(a.id);
            }
          }
          if (namedMatches.length >= 2) {
            hasExplicitRefs = true;
            compareIds = namedMatches.slice(0, 3);
          } else if (namedMatches.length === 1) {
            // 1 named asset from session history: explicit reference, needs a second.
            // Try portfolio semantic search to find a relevant counterpart.
            hasExplicitRefs = true;
            try {
              const namedEmbedding = await embedQuery(message.trim());
              const namedHits = await storage.semanticSearch(namedEmbedding, 5);
              const NAMED_SIM_THRESHOLD = 0.45;
              const portfolioCandidate = namedHits.find(
                (h) => h.similarity >= NAMED_SIM_THRESHOLD && !namedMatches.includes(h.id)
              );
              if (portfolioCandidate) {
                compareIds = [namedMatches[0], portfolioCandidate.id];
              } else {
                const resolvedAsset = allPriorAssetPayloads.find((a) => a.id === namedMatches[0]);
                terminalError = `I found "${resolvedAsset?.assetName ?? "one asset"}" from your session, but couldn't find a second asset to compare it to. Try searching for both assets first, then ask me to compare.`;
              }
            } catch {
              const resolvedAsset = allPriorAssetPayloads.find((a) => a.id === namedMatches[0]);
              terminalError = `I found "${resolvedAsset?.assetName ?? "one asset"}" from your session, but couldn't locate a second asset to compare it to.`;
            }
          }
        }

        // ── Step c: institution-qualified resolution ───────────────────────
        // detectAllInstitutionNames returns canonical forms ("washington university",
        // "mit", etc.) for all institutions mentioned in the query.
        // Resolution is two-pass per institution:
        //   1. Session history — checks allPriorAssetPayloads with bidirectional
        //      canonical normalization so "WUSTL" matches "washington university".
        //   2. Portfolio semantic search — embeds "institution + query" and
        //      filters results by institution name; lets "compare the MIT CAR-T
        //      to the Stanford one" work on a fresh session.
        // Partial resolution (1 found, 1 missing after both passes) → terminal error.
        if (compareIds.length < 2 && !terminalError) {
          const mentionedInsts = detectAllInstitutionNames(message.trim(), portfolioInstitutionNames);
          if (mentionedInsts.length >= 2) {
            hasExplicitRefs = true;
            const instMatched: number[] = [];
            let firstUnresolved: string | null = null;

            // Helper: check if an asset's institution matches a canonical key
            const institutionMatches = (institution: string | null | undefined, instKey: string): boolean => {
              if (!institution) return false;
              const aInstLower = institution.toLowerCase();
              if (aInstLower.includes(instKey)) return true;
              const canonical = detectInstitutionName(institution) ?? "";
              return canonical === instKey;
            };

            for (const inst of mentionedInsts.slice(0, 3)) {
              const instKey = inst.toLowerCase();

              // Pass 1: session history
              const sessionMatch = allPriorAssetPayloads.find((a) => institutionMatches(a.institution, instKey));
              if (sessionMatch && !instMatched.includes(sessionMatch.id)) {
                instMatched.push(sessionMatch.id);
                continue;
              }

              // Pass 2: portfolio-level semantic search with institution context
              let portfolioResolved = false;
              try {
                const instQueryText = `${inst} ${message.trim()}`;
                const instEmbedding = await embedQuery(instQueryText);
                const instHits = await storage.semanticSearch(instEmbedding, 8);
                const portfolioHit = instHits.find(
                  (h) => institutionMatches(h.institution, instKey) && !instMatched.includes(h.id)
                );
                if (portfolioHit) {
                  instMatched.push(portfolioHit.id);
                  portfolioResolved = true;
                }
              } catch (instSearchErr) {
                console.warn("[eden/comparative] institution portfolio search failed:", (instSearchErr as Error)?.message);
              }

              if (!portfolioResolved && !firstUnresolved) {
                firstUnresolved = inst;
              }
            }

            if (instMatched.length >= 2) {
              compareIds = instMatched;
            } else {
              // Both session history and portfolio search could not resolve ≥2 institutions
              if (instMatched.length === 1 && firstUnresolved) {
                const resolvedName = (
                  allPriorAssetPayloads.find((a) => a.id === instMatched[0])?.institution
                ) ?? mentionedInsts.find((i) => i !== firstUnresolved) ?? "one institution";
                terminalError = `I found assets from ${resolvedName}, but couldn't locate any licensable assets from "${firstUnresolved}" in the portfolio. Try searching for that institution directly first.`;
              } else if (firstUnresolved) {
                terminalError = `I couldn't find any licensable assets from "${firstUnresolved}" in the portfolio. Try searching for that institution directly.`;
              }
            }
          }
        }

        // ── Step d: all priorIds fallback ─────────────────────────────────
        // Only for implicit comparative queries ("compare these", "which is better?").
        // Skipped when the user cited specific refs that could not be resolved.
        if (compareIds.length < 2 && !terminalError && !hasExplicitRefs && priorIds.length >= 2) {
          compareIds = priorIds.slice(0, 3);
        }

        // ── Step e: semantic fallback ─────────────────────────────────────
        // Only for implicit queries. Covers fresh-session comparisons like
        // "compare gene therapy assets for ALS" with no prior context.
        if (compareIds.length < 2 && !terminalError && !hasExplicitRefs) {
          try {
            const compareEmbedding = await embedQuery(message.trim());
            const semanticHits = await storage.semanticSearch(compareEmbedding, 3);
            const COMPARE_SIM_THRESHOLD = 0.45;
            const passing = semanticHits.filter((a) => a.similarity >= COMPARE_SIM_THRESHOLD);
            if (passing.length >= 2) {
              compareIds = passing.slice(0, 3).map((a) => a.id);
            }
          } catch (semErr) {
            console.warn("[eden/comparative] semantic fallback failed:", (semErr as Error)?.message ?? semErr);
          }
        }

        // ── Terminal error emission ────────────────────────────────────────
        if (terminalError) {
          sendEvent("context", { sessionId: sid, assets: [] });
          sendEvent("token", { text: terminalError });
          await storage.appendEdenMessage(sid, { role: "assistant", content: terminalError, assetIds: [], assets: [] });
          sendEvent("done", { sessionId: sid });
          return;
        }

        // ── Comparison execution ──────────────────────────────────────────
        if (compareIds.length >= 2) {
          const fetchedForCompare = await storage.getIngestedAssetsByIds(compareIds).catch(
            () => [] as import("./storage").RetrievedAsset[]
          );
          const compareIdOrder = new Map(compareIds.map((id, i) => [id, i]));
          fetchedForCompare.sort((a, b) => (compareIdOrder.get(a.id) ?? 99) - (compareIdOrder.get(b.id) ?? 99));

          if (fetchedForCompare.length >= 2) {
            const compareAssetPayload = fetchedForCompare.map((a) => ({
              id: a.id, assetName: a.assetName, institution: a.institution,
              indication: a.indication, modality: a.modality,
              developmentStage: a.developmentStage, ipType: a.ipType,
              sourceName: a.sourceName, sourceUrl: a.sourceUrl, similarity: 1.0,
            }));
            sendEvent("context", { sessionId: sid, assets: compareAssetPayload });
            let fullResponse = "";
            for await (const token of compareQuery(message.trim(), fetchedForCompare, history, ctx, portfolioStats, focusContext)) {
              fullResponse += token;
              sendEvent("token", { text: token });
            }
            await storage.appendEdenMessage(sid, {
              role: "assistant", content: fullResponse,
              assetIds: fetchedForCompare.map((a) => a.id),
              assets: compareAssetPayload,
            });
            sendEvent("done", { sessionId: sid });
            return;
          }
        }
        // < 2 assets after all steps: fall through to definitional / RAG
      }

      // ── Path 4: Definitional / educational ──────────────────────────────
      if (definitional) {
        // Start embedding in parallel with the concept stream so portfolio
        // lookup adds minimal latency after the explanation finishes.
        const conceptEmbeddingPromise = embedQuery(message.trim());

        sendEvent("context", { sessionId: sid, assets: [] });
        let fullResponse = "";
        for await (const token of conceptQuery(message.trim(), history, ctx, portfolioStats, focusContext)) {
          fullResponse += token;
          sendEvent("token", { text: token });
        }

        // Portfolio lookup — find assets related to the concept.
        // Guard the parallel embedding promise against unhandled rejection.
        const CONCEPT_SIMILARITY_THRESHOLD = 0.50;
        let relatedAssets: import("./storage").RetrievedAsset[] = [];
        try {
          const conceptEmbedding = await conceptEmbeddingPromise.catch(() => null);
          if (conceptEmbedding) {
            const hits = await storage.semanticSearch(conceptEmbedding, 5);
            const passing = hits.filter((a) => a.similarity >= CONCEPT_SIMILARITY_THRESHOLD);
            // Log threshold misses so the cutoff can be tuned from real data
            if (hits.length > 0 && passing.length === 0) {
              const topSim = hits[0]?.similarity ?? 0;
              console.log(`[eden/definitional] 0 hits above ${CONCEPT_SIMILARITY_THRESHOLD} threshold (top sim: ${topSim.toFixed(3)}) for: "${message.trim().slice(0, 80)}"`);
            }
            relatedAssets = passing.slice(0, 3);
          }
        } catch (lookupErr) {
          console.warn("[eden/definitional] portfolio lookup failed:", (lookupErr as Error)?.message ?? lookupErr);
        }

        if (relatedAssets.length > 0) {
          const relatedAssetPayload = relatedAssets.map((a) => ({
            id: a.id, assetName: a.assetName, institution: a.institution,
            indication: a.indication, modality: a.modality,
            developmentStage: a.developmentStage, ipType: a.ipType,
            sourceName: a.sourceName, sourceUrl: a.sourceUrl,
            similarity: Math.round(a.similarity * 100) / 100,
          }));
          // Update context with found assets (client replaces the empty array)
          sendEvent("context", { sessionId: sid, assets: relatedAssetPayload });

          // Stream bridge section after the concept explanation
          const bridgeIntro = "\n\n";
          sendEvent("token", { text: bridgeIntro });
          fullResponse += bridgeIntro;

          const bridgePrompt = `You just explained a concept. Now briefly introduce these ${relatedAssets.length} portfolio asset${relatedAssets.length > 1 ? "s" : ""} that relate to it. Lead with "There ${relatedAssets.length === 1 ? "is" : "are"} ${relatedAssets.length} related asset${relatedAssets.length > 1 ? "s" : ""} in the portfolio:" then list each with one concise hook sentence (standard **Asset Name** (Institution) — hook format). Keep it under 80 words total.`;
          for await (const token of ragQuery(bridgePrompt, relatedAssets, [], ctx, portfolioStats, focusContext)) {
            fullResponse += token;
            sendEvent("token", { text: token });
          }

          await storage.appendEdenMessage(sid, {
            role: "assistant", content: fullResponse,
            assetIds: relatedAssets.slice(0, 3).map((a) => a.id),
            assets: relatedAssetPayload,
          });
        } else {
          await storage.appendEdenMessage(sid, { role: "assistant", content: fullResponse, assetIds: [], assets: [] });
        }

        sendEvent("done", { sessionId: sid });
        return;
      }

      // ── Path 5: Conversational ───────────────────────────────────────────
      if (chat) {
        sendEvent("context", { sessionId: sid, assets: [] });
        let fullResponse = "";
        for await (const token of directQuery(message.trim(), history, ctx, portfolioStats, focusContext)) {
          fullResponse += token;
          sendEvent("token", { text: token });
        }
        await storage.appendEdenMessage(sid, { role: "assistant", content: fullResponse, assetIds: [], assets: [] });
        sendEvent("done", { sessionId: sid });
        return;
      }

      // ── Path 6: Standard RAG (semantic retrieval) ─────────────────────────

      // Standard semantic retrieval (two-pass institution detection with portfolio names)
      const institutionName = detectInstitutionName(message.trim(), portfolioInstitutionNames);

      let allSemantic: import("./storage").RetrievedAsset[];
      let institutionAssets: import("./storage").RetrievedAsset[] = [];

      try {
        const [queryEmbedding, instAssets] = await Promise.all([
          embedQuery(message.trim()),
          institutionName
            ? storage.searchIngestedAssetsByInstitution(institutionName, 10)
            : Promise.resolve([] as import("./storage").RetrievedAsset[]),
        ]);
        institutionAssets = instAssets;
        if (filtersActive) {
          allSemantic = await storage.filteredSemanticSearch(queryEmbedding, geoRx, filters.modality, filters.stage, filters.indication, filters.institution, 15);
        } else {
          allSemantic = await storage.semanticSearch(queryEmbedding, 15);
        }
      } catch (embedErr) {
        console.warn("[eden/rag] embedding failed, falling back to keyword search:", (embedErr as Error)?.message ?? embedErr);
        // Keyword fallback: uses ILIKE against asset_name, indication, target, summary, institution
        const kwResults = await storage.keywordSearchIngestedAssets(message.trim(), 15, {
          modality: filters.modality,
          stage: filters.stage,
          indication: filters.indication,
          institution: filters.institution ?? (institutionName ?? undefined),
        }).catch(() => [] as import("./storage").RetrievedAsset[]);
        allSemantic = kwResults.map((a) => ({ ...a, similarity: 0.6 }));
        if (institutionName) {
          institutionAssets = await storage.searchIngestedAssetsByInstitution(institutionName, 10).catch(() => []);
        }
      }

      const threshold = institutionName ? 0.38 : 0.45;
      const institutionIds = new Set(institutionAssets.map((a) => a.id));
      // Cap merged candidates at 15 before reranking (spec adherence)
      const merged = [
        ...institutionAssets,
        ...allSemantic.filter((a) => a.similarity > threshold && !institutionIds.has(a.id)),
      ].slice(0, 15);

      // Derive engagement signals from session message history (includes back-refs
      // and follow-up turns already persisted to DB) then rerank with profile + adaptive tiers.
      const engagementSignals = deriveEngagementSignals(sid, session.messages ?? []);
      const retrieved = rerankAssets(merged, ctx, engagementSignals);

      const assetPayload = retrieved.map((a) => ({
        id: a.id, assetName: a.assetName, institution: a.institution,
        indication: a.indication, modality: a.modality, developmentStage: a.developmentStage,
        ipType: a.ipType, sourceName: a.sourceName, sourceUrl: a.sourceUrl,
        similarity: Math.round(a.similarity * 100) / 100,
      }));

      sendEvent("context", { sessionId: sid, assets: assetPayload });
      let fullResponse = "";
      for await (const token of ragQuery(message.trim(), retrieved, history, ctx, portfolioStats, focusContext)) {
        fullResponse += token;
        sendEvent("token", { text: token });
      }
      await storage.appendEdenMessage(sid, {
        role: "assistant", content: fullResponse,
        // Store exactly last 3 IDs for turn-memory contract (ordinal back-refs: first/second/third)
        assetIds: retrieved.slice(0, 3).map((a) => a.id), assets: assetPayload,
      });

      sendEvent("done", { sessionId: sid });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Chat failed";
      console.error("[EDEN chat] Error:", err);
      sendEvent("error", { message: errMsg });
    } finally {
      res.end();
    }
  });

  app.get("/api/eden/feedback/:sessionId", async (req, res) => {
    const pass = req.headers["x-admin-password"] ?? (req.query.adminPassword as string);
    const SITE_PASSWORD = process.env.SITE_PASSWORD ?? "quality";
    if (pass !== "eden" && pass !== SITE_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    try {
      const data = await storage.getEdenFeedbackForSession(req.params.sessionId);
      return res.json(data);
    } catch (err) {
      console.error("[EDEN feedback GET]", err);
      return res.status(500).json({ error: "Failed" });
    }
  });

  app.post("/api/eden/feedback", async (req, res) => {
    const pass = req.headers["x-admin-password"] ?? req.body?.adminPassword;
    const SITE_PASSWORD2 = process.env.SITE_PASSWORD ?? "quality";
    if (pass !== "eden" && pass !== SITE_PASSWORD2) return res.status(401).json({ error: "Unauthorized" });
    const { sessionId, messageIndex, sentiment } = req.body ?? {};
    if (!sessionId || typeof messageIndex !== "number" || !["up", "down"].includes(sentiment)) {
      return res.status(400).json({ error: "sessionId, messageIndex, and sentiment (up|down) required" });
    }
    try {
      await storage.createEdenMessageFeedback(sessionId, messageIndex, sentiment);
      return res.json({ ok: true });
    } catch (err) {
      console.error("[EDEN feedback]", err);
      return res.status(500).json({ error: "Failed to record feedback" });
    }
  });

  app.get("/api/eden/sessions", async (req, res) => {
    const pass = req.headers["x-admin-password"] ?? (req.query.adminPassword as string);
    const SITE_PASSWORD3 = process.env.SITE_PASSWORD ?? "quality";
    if (pass !== "eden" && pass !== SITE_PASSWORD3) return res.status(401).json({ error: "Unauthorized" });
    try {
      const limit = Math.min(100, parseInt(String(req.query.limit ?? "50"), 10) || 50);
      const sessions = await storage.listEdenSessions(limit);
      res.json(sessions);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/eden/sessions/:sessionId", async (req, res) => {
    const pass = req.headers["x-admin-password"] ?? (req.query.adminPassword as string);
    if (pass !== "eden") return res.status(401).json({ error: "Unauthorized" });
    try {
      const session = await storage.getEdenSession(req.params.sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json(session);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      res.status(500).json({ error: msg });
    }
  });

  // ── Eden data-query tool routes ───────────────────────────────────────────
  // Simple SQL aggregations — authenticated with site or admin password

  function edenQueryAuth(req: import("express").Request, res: import("express").Response): boolean {
    const pass = (req.headers["x-admin-password"] ?? req.query.adminPassword) as string;
    const SITE_PW = process.env.SITE_PASSWORD ?? "quality";
    if (pass !== "eden" && pass !== SITE_PW) {
      res.status(401).json({ error: "Unauthorized" });
      return false;
    }
    return true;
  }

  app.get("/api/eden/query/count-by-institution", async (req, res) => {
    if (!edenQueryAuth(req, res)) return;
    try {
      const area = typeof req.query.area === "string" ? req.query.area.toLowerCase() : null;
      const rows = await db
        .select({
          institution: ingestedAssets.institution,
          count: sql<number>`count(*)::int`,
        })
        .from(ingestedAssets)
        .where(
          area
            ? sql`${ingestedAssets.relevant} = true AND (lower(${ingestedAssets.indication}) LIKE ${"%" + area + "%"} OR lower(${ingestedAssets.categories}::text) LIKE ${"%" + area + "%"})`
            : sql`${ingestedAssets.relevant} = true`
        )
        .groupBy(ingestedAssets.institution)
        .orderBy(sql`count(*) DESC`)
        .limit(20);
      res.json({ results: rows });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Query failed" });
    }
  });

  app.get("/api/eden/query/top-institutions", async (req, res) => {
    if (!edenQueryAuth(req, res)) return;
    try {
      const area = typeof req.query.area === "string" ? req.query.area.toLowerCase() : "";
      const rows = await db
        .select({
          institution: ingestedAssets.institution,
          count: sql<number>`count(*)::int`,
        })
        .from(ingestedAssets)
        .where(
          area
            ? sql`${ingestedAssets.relevant} = true AND (lower(${ingestedAssets.indication}) LIKE ${"%" + area + "%"} OR lower(${ingestedAssets.categories}::text) LIKE ${"%" + area + "%"} OR lower(${ingestedAssets.assetName}) LIKE ${"%" + area + "%"})`
            : sql`${ingestedAssets.relevant} = true`
        )
        .groupBy(ingestedAssets.institution)
        .orderBy(sql`count(*) DESC`)
        .limit(10);
      res.json({ area, results: rows });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Query failed" });
    }
  });

  app.get("/api/eden/query/count-by-modality", async (req, res) => {
    if (!edenQueryAuth(req, res)) return;
    try {
      const rows = await db
        .select({
          modality: ingestedAssets.modality,
          count: sql<number>`count(*)::int`,
        })
        .from(ingestedAssets)
        .where(sql`${ingestedAssets.relevant} = true AND ${ingestedAssets.modality} != 'unknown'`)
        .groupBy(ingestedAssets.modality)
        .orderBy(sql`count(*) DESC`)
        .limit(20);
      res.json({ results: rows });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Query failed" });
    }
  });

  app.get("/api/eden/query/count-by-stage", async (req, res) => {
    if (!edenQueryAuth(req, res)) return;
    try {
      const rows = await db
        .select({
          stage: ingestedAssets.developmentStage,
          count: sql<number>`count(*)::int`,
        })
        .from(ingestedAssets)
        .where(sql`${ingestedAssets.relevant} = true AND ${ingestedAssets.developmentStage} != 'unknown'`)
        .groupBy(ingestedAssets.developmentStage)
        .orderBy(sql`count(*) DESC`)
        .limit(15);
      res.json({ results: rows });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Query failed" });
    }
  });

  app.get("/api/eden/query/newest-by-institution", async (req, res) => {
    if (!edenQueryAuth(req, res)) return;
    try {
      const institution = typeof req.query.institution === "string" ? req.query.institution : null;
      if (!institution) return res.status(400).json({ error: "institution param required" });
      const rows = await db
        .select({
          id: ingestedAssets.id,
          assetName: ingestedAssets.assetName,
          indication: ingestedAssets.indication,
          modality: ingestedAssets.modality,
          developmentStage: ingestedAssets.developmentStage,
          firstSeenAt: ingestedAssets.firstSeenAt,
        })
        .from(ingestedAssets)
        .where(sql`${ingestedAssets.relevant} = true AND lower(${ingestedAssets.institution}) LIKE ${"%" + institution.toLowerCase() + "%"}`)
        .orderBy(desc(ingestedAssets.firstSeenAt))
        .limit(10);
      res.json({ institution, results: rows });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Query failed" });
    }
  });

  // ── Researcher portal routes ──────────────────────────────────────────────

  // Public: admin-approved discovery cards (used by industry Scout)
  app.get("/api/discoveries", async (_req, res) => {
    try {
      const cards = await storage.getPublishedDiscoveryCards();
      res.json({ cards });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/wipe-assets", async (req, res) => {
    const pw = req.headers["x-admin-password"] as string;
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    try {
      await storage.wipeAllAssets();
      res.json({ ok: true, message: "All ingested assets wiped" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Wipe a single institution's ingested_assets + sync_staging rows.
  // Used when a scraper's fingerprint format changes (e.g., stub → Flintbox scraper)
  // so that re-sync correctly detects existing technologies as new rather than
  // triggering the anomaly guard.
  // Auth: header-only (never query string, which appears in proxy/server logs).
  // Safeguards: institution must be registered in ALL_SCRAPERS; body must include
  // { confirm: true } to prevent accidental destructive calls.
  app.post("/api/admin/wipe-assets/:institution", async (req, res) => {
    const pw = req.headers["x-admin-password"] as string;
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    const institution = decodeURIComponent(req.params.institution);
    // Only allow wiping institutions that have a registered scraper
    if (!ALL_SCRAPERS.some((s) => s.institution === institution)) {
      return res.status(400).json({ error: `No registered scraper for: ${institution}` });
    }
    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: "Must send { confirm: true } to confirm destructive wipe" });
    }
    try {
      const deleted = await storage.wipeInstitutionAssets(institution);
      const callerIp = req.ip ?? req.headers["x-forwarded-for"] ?? "unknown";
      console.warn(
        `[admin] INSTITUTION WIPE: institution="${institution}" deleted=${deleted} ip=${callerIp} ts=${new Date().toISOString()}`
      );
      res.json({ ok: true, institution, deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Quarantine all unpushed is_new=true staging rows for a specific institution.
  // Used to resolve false-new floods from URL/dedup churn before they reach the push step.
  // Legacy path kept for backward compat — new path is /api/admin/indexing-queue/quarantine.
  app.post("/api/admin/staging/quarantine", async (req, res) => {
    const pw = req.headers["x-admin-password"] as string;
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    const { institution } = req.body as { institution?: string };
    if (!institution || typeof institution !== "string" || !institution.trim()) {
      return res.status(400).json({ error: "institution is required" });
    }
    try {
      const quarantined = await storage.quarantineNewStagingRows(institution.trim());
      res.json({ ok: true, institution: institution.trim(), quarantined });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Indexing Queue quarantine controls ────────────────────────────────────

  app.get("/api/admin/indexing-queue/quarantine-summary", async (req, res) => {
    const pw = req.headers["x-admin-password"] as string;
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    try {
      const summary = await storage.getQuarantineSummary();
      res.json({ summary });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/indexing-queue/quarantine", async (req, res) => {
    const pw = req.headers["x-admin-password"] as string;
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    const { institution } = req.body as { institution?: string };
    if (!institution || typeof institution !== "string" || !institution.trim()) {
      return res.status(400).json({ error: "institution is required" });
    }
    try {
      const quarantined = await storage.quarantineNewStagingRows(institution.trim());
      res.json({ ok: true, institution: institution.trim(), quarantined });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/indexing-queue/release-quarantine", async (req, res) => {
    const pw = req.headers["x-admin-password"] as string;
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    const { institution } = req.body as { institution?: string };
    if (!institution || typeof institution !== "string" || !institution.trim()) {
      return res.status(400).json({ error: "institution is required" });
    }
    try {
      const released = await storage.releaseQuarantinedRows(institution.trim());
      res.json({ ok: true, institution: institution.trim(), released });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/indexing-queue/discard-quarantine", async (req, res) => {
    const pw = req.headers["x-admin-password"] as string;
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    const { institution } = req.body as { institution?: string };
    if (!institution || typeof institution !== "string" || !institution.trim()) {
      return res.status(400).json({ error: "institution is required" });
    }
    try {
      const discarded = await storage.discardQuarantinedRows(institution.trim());
      res.json({ ok: true, institution: institution.trim(), discarded });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/review-queue", async (req, res) => {
    const pw = req.headers["x-admin-password"] as string;
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    try {
      const items = await storage.getReviewQueue();
      res.json({ items });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/review-queue/:id", async (req, res) => {
    const pw = req.headers["x-admin-password"] as string;
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { note } = req.body as { note?: string };
    try {
      await storage.resolveReviewItem(id, note ?? "");
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: research queue — all published discovery cards for review
  app.get("/api/admin/research-queue", async (req, res) => {
    const pw = req.headers["x-admin-password"] as string;
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    try {
      const cards = await storage.getAllDiscoveryCardsForAdmin();
      res.json({ cards });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: approve or reject a discovery card
  app.patch("/api/admin/research-queue/:id", async (req, res) => {
    const pw = req.headers["x-admin-password"] as string;
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { adminStatus, adminNote } = req.body as { adminStatus: string; adminNote?: string };
    if (!["pending", "approved", "rejected"].includes(adminStatus)) {
      return res.status(400).json({ error: "Invalid adminStatus" });
    }
    try {
      const card = await storage.updateDiscoveryCardAdmin(id, { adminStatus, adminNote });
      if (!card) return res.status(404).json({ error: "Card not found" });
      res.json({ card });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Research projects (scoped to authenticated researcher)
  app.use("/api/research", verifyResearcherAuth);

  app.get("/api/research/projects", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    try {
      const projects = await storage.getResearchProjects(researcherId);
      res.json({ projects });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/research/projects", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const body = { ...req.body, researcherId };
    if (body.targetCompletion === "") body.targetCompletion = null;
    if (body.status && !["planning", "active", "on_hold", "completed"].includes(body.status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }
    if (body.targetCompletion && isNaN(Date.parse(body.targetCompletion))) {
      return res.status(400).json({ error: "Invalid targetCompletion date" });
    }
    const parsed = insertResearchProjectSchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const project = await storage.createResearchProject(parsed.data);
      res.json({ project });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/research/projects/:id", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    try {
      const project = await storage.getResearchProject(id, researcherId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      res.json({ project });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/research/projects/:id", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const patchSchema = z.object({
      title: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      researchArea: z.string().nullable().optional(),
      hypothesis: z.string().nullable().optional(),
      status: z.enum(["planning", "active", "on_hold", "completed"]).optional(),
      objectives: z.string().nullable().optional(),
      methodology: z.string().nullable().optional(),
      targetCompletion: z.string().nullable().optional().refine(
        (val) => val === undefined || val === null || !isNaN(Date.parse(val)),
        { message: "Invalid date format" }
      ),
      researchDomain: z.string().nullable().optional(),
      keywords: z.array(z.string()).nullable().optional(),
      primaryResearchQuestion: z.string().nullable().optional(),
      scientificRationale: z.string().nullable().optional(),
      keyPapers: z.array(z.object({
        paper_title: z.string(), authors: z.string(), journal: z.string(),
        year: z.string(), paper_link: z.string(), notes: z.string(),
      })).nullable().optional(),
      conflictingEvidence: z.string().nullable().optional(),
      literatureGap: z.string().nullable().optional(),
      experimentalDesign: z.string().nullable().optional(),
      keyTechnologies: z.array(z.string()).nullable().optional(),
      datasetsUsed: z.array(z.object({
        dataset_name: z.string(), dataset_source: z.string(),
        dataset_link: z.string(), notes: z.string(),
      })).nullable().optional(),
      preliminaryData: z.string().nullable().optional(),
      supportingEvidenceLinks: z.array(z.object({ url: z.string(), label: z.string() })).nullable().optional(),
      confidenceLevel: z.string().nullable().optional(),
      potentialApplications: z.string().nullable().optional(),
      industryRelevance: z.string().nullable().optional(),
      patentStatus: z.string().nullable().optional(),
      startupPotential: z.string().nullable().optional(),
      projectContributors: z.array(z.object({
        name: z.string(), institution: z.string(), role: z.string(), email: z.string(),
      })).nullable().optional(),
      openForCollaboration: z.boolean().nullable().optional(),
      collaborationType: z.array(z.string()).nullable().optional(),
      fundingStatus: z.string().nullable().optional(),
      fundingSources: z.array(z.string()).nullable().optional(),
      estimatedBudget: z.number().int().nullable().optional(),
      technicalRisk: z.string().nullable().optional(),
      regulatoryRisk: z.string().nullable().optional(),
      keyScientificUnknowns: z.string().nullable().optional(),
      nextExperiments: z.array(z.object({ label: z.string(), done: z.boolean() })).nullable().optional(),
      expectedTimeline: z.string().nullable().optional(),
      successCriteria: z.string().nullable().optional(),
      discoveryTitle: z.string().nullable().optional(),
      discoverySummary: z.string().nullable().optional(),
      technologyType: z.string().nullable().optional(),
      developmentStage: z.string().nullable().optional(),
      projectSeeking: z.array(z.string()).nullable().optional(),
      publishToIndustry: z.boolean().nullable().optional(),
      potentialPartners: z.array(z.object({
        name: z.string(), website: z.string(), status: z.string(),
        outreachDate: z.string(), contactName: z.string(),
      })).nullable().optional(),
      section4Files: z.array(z.string()).nullable().optional(),
      section5Files: z.array(z.string()).nullable().optional(),
      section8Files: z.array(z.string()).nullable().optional(),
      generalFiles: z.array(z.string()).nullable().optional(),
      hypotheses: z.array(z.object({
        id: z.string(),
        statement: z.string(),
        independentVars: z.string(),
        dependentVars: z.string(),
        expectedOutcome: z.string(),
        nullHypothesis: z.string(),
        evidenceNotes: z.string(),
        status: z.string(),
        confidence: z.string(),
      })).nullable().optional(),
      fishbone: z.object({
        effect: z.string(),
        branches: z.record(z.array(z.string())),
      }).nullable().optional(),
      milestones: z.array(z.object({
        id: z.string(),
        label: z.string(),
        targetDate: z.string(),
        completed: z.boolean(),
      })).nullable().optional(),
      pico: z.object({
        population: z.string(),
        intervention: z.string(),
        comparison: z.string(),
        outcome: z.string(),
      }).nullable().optional(),
      protocolChecklist: z.record(z.boolean()).nullable().optional(),
    });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const validated = parsed.data;
    const updates: Partial<InsertResearchProject> = {};
    const textFields = [
      "title","description","researchArea","hypothesis","status","objectives","methodology",
      "targetCompletion","researchDomain","primaryResearchQuestion","scientificRationale",
      "conflictingEvidence","literatureGap","experimentalDesign","preliminaryData",
      "confidenceLevel","potentialApplications","industryRelevance","patentStatus",
      "startupPotential","fundingStatus","technicalRisk","regulatoryRisk",
      "keyScientificUnknowns","expectedTimeline","successCriteria","discoveryTitle",
      "discoverySummary","technologyType","developmentStage",
    ] as const;
    for (const f of textFields) {
      if (validated[f] !== undefined) (updates as any)[f] = validated[f];
    }
    const jsonFields = [
      "keywords","keyPapers","keyTechnologies","datasetsUsed","supportingEvidenceLinks",
      "projectContributors","collaborationType","fundingSources","nextExperiments","projectSeeking",
      "potentialPartners","section4Files","section5Files","section8Files","generalFiles",
      "hypotheses","fishbone","milestones","pico","protocolChecklist",
    ] as const;
    for (const f of jsonFields) {
      if (validated[f] !== undefined) (updates as any)[f] = validated[f];
    }
    if (validated.openForCollaboration !== undefined) updates.openForCollaboration = validated.openForCollaboration;
    if (validated.publishToIndustry !== undefined) updates.publishToIndustry = validated.publishToIndustry;
    if (validated.estimatedBudget !== undefined) updates.estimatedBudget = validated.estimatedBudget;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No valid fields to update" });
    try {
      const project = await storage.updateResearchProject(id, researcherId, updates);
      if (!project) return res.status(404).json({ error: "Project not found" });
      res.json({ project });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/research/projects/:id/notes", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { content } = z.object({ content: z.string().min(1).max(10000) }).parse(req.body);
    try {
      const project = await storage.getResearchProject(id, researcherId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      const existing = project.description ?? "";
      const separator = existing ? "\n\n---\n\n" : "";
      const updated = existing + separator + content;
      await storage.updateResearchProject(id, researcherId, { description: updated });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/research/projects/:id", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    try {
      await storage.deleteResearchProject(id, researcherId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // File uploads for research projects
  const multer = (await import("multer")).default;
  const uploadMiddleware = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  app.post("/api/research/projects/:id/files", uploadMiddleware.single("file"), async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const section = (req.query.section as string) || "general";
    const allowedSections = ["section4", "section5", "section8", "general"];
    if (!allowedSections.includes(section)) return res.status(400).json({ error: "Invalid section" });
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file provided" });

    try {
      const project = await storage.getResearchProject(id, researcherId);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const sbUrl = process.env.VITE_SUPABASE_URL;
      if (!serviceKey || !sbUrl) return res.status(500).json({ error: "Storage not configured" });

      const { createClient } = await import("@supabase/supabase-js");
      const adminClient = createClient(sbUrl, serviceKey);

      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `research-projects/${id}/${section}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await adminClient.storage
        .from("research-projects")
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        if (uploadError.message?.includes("Bucket not found")) {
          await adminClient.storage.createBucket("research-projects", { public: false });
          const { error: retryError } = await adminClient.storage
            .from("research-projects")
            .upload(filePath, file.buffer, {
              contentType: file.mimetype,
              upsert: false,
            });
          if (retryError) return res.status(500).json({ error: retryError.message });
        } else {
          return res.status(500).json({ error: uploadError.message });
        }
      }

      const { data: signedData, error: signedError } = await adminClient.storage
        .from("research-projects")
        .createSignedUrl(filePath, 60 * 60 * 24 * 365 * 10);

      if (signedError || !signedData?.signedUrl) {
        const { data: publicData } = adminClient.storage
          .from("research-projects")
          .getPublicUrl(filePath);
        return res.json({ url: publicData.publicUrl });
      }

      res.json({ url: signedData.signedUrl });
    } catch (err: any) {
      console.error("[file-upload] Error:", err);
      res.status(500).json({ error: err.message || "Upload failed" });
    }
  });

  // Discovery cards
  app.get("/api/research/discoveries", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    try {
      const cards = await storage.getDiscoveryCards(researcherId);
      res.json({ cards });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/research/discoveries", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const parsed = insertDiscoveryCardSchema.safeParse({ ...req.body, researcherId, published: false });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const card = await storage.createDiscoveryCard(parsed.data);
      res.json({ card });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/research/discoveries/:id/publish", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    try {
      const card = await storage.publishDiscoveryCard(id, researcherId);
      if (!card) return res.status(404).json({ error: "Card not found" });
      res.json({ card });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/research/discoveries/:id", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    try {
      const card = await storage.updateDiscoveryCard(id, researcherId, req.body);
      if (!card) return res.status(404).json({ error: "Card not found" });
      res.json({ card });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/research/discoveries/:id/archive", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    try {
      const card = await storage.updateDiscoveryCard(id, researcherId, { archived: !((await storage.getDiscoveryCards(researcherId)).find(c => c.id === id)?.archived) });
      if (!card) return res.status(404).json({ error: "Card not found" });
      res.json({ card });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const ALLOWED_DISCOVERY_MIMES = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/png", "image/jpeg", "image/jpg",
  ]);
  const ALLOWED_DISCOVERY_EXTS = new Set([".pdf", ".doc", ".docx", ".pptx", ".xlsx", ".png", ".jpg", ".jpeg"]);

  app.post("/api/research/discoveries/:id/files", uploadMiddleware.single("file"), async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file provided" });

    const ext = "." + file.originalname.split(".").pop()?.toLowerCase();
    if (!ALLOWED_DISCOVERY_MIMES.has(file.mimetype) && !ALLOWED_DISCOVERY_EXTS.has(ext)) {
      return res.status(400).json({ error: "File type not allowed. Accepted: PDF, DOCX, PPTX, XLSX, PNG, JPG" });
    }
    if (file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: "File too large. Maximum 10 MB" });
    }

    try {
      const cards = await storage.getDiscoveryCards(researcherId);
      const card = cards.find(c => c.id === id);
      if (!card) return res.status(404).json({ error: "Card not found" });

      const existing = card.attachmentUrls ?? [];
      if (existing.length >= 3) return res.status(400).json({ error: "Maximum 3 attachments per discovery" });

      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const sbUrl = process.env.VITE_SUPABASE_URL;
      if (!serviceKey || !sbUrl) return res.status(500).json({ error: "Storage not configured" });

      const { createClient } = await import("@supabase/supabase-js");
      const adminClient = createClient(sbUrl, serviceKey);

      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `discoveries/${id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await adminClient.storage
        .from("research-discoveries")
        .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });

      if (uploadError) {
        if (uploadError.message?.includes("Bucket not found")) {
          await adminClient.storage.createBucket("research-discoveries", { public: false });
          const { error: retryError } = await adminClient.storage
            .from("research-discoveries")
            .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });
          if (retryError) return res.status(500).json({ error: retryError.message });
        } else {
          return res.status(500).json({ error: uploadError.message });
        }
      }

      const { data: signedData } = await adminClient.storage
        .from("research-discoveries")
        .createSignedUrl(filePath, 315360000);

      const signedUrl = signedData?.signedUrl;
      if (!signedUrl) return res.status(500).json({ error: "Failed to generate signed URL" });

      const updatedUrls = [...existing, signedUrl];
      const updated = await storage.updateDiscoveryCard(id, researcherId, { attachmentUrls: updatedUrls });
      res.json({ card: updated, url: signedUrl });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/research/profile/photo", uploadMiddleware.single("photo"), async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file provided" });

    const allowedMimes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
    if (!allowedMimes.has(file.mimetype)) {
      return res.status(400).json({ error: "Only PNG, JPG, and WebP images are allowed" });
    }
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "Photo must be under 5 MB" });
    }

    try {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const sbUrl = process.env.VITE_SUPABASE_URL;
      if (!serviceKey || !sbUrl) return res.status(500).json({ error: "Storage not configured" });

      const { createClient } = await import("@supabase/supabase-js");
      const adminClient = createClient(sbUrl, serviceKey);

      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `profiles/${researcherId}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await adminClient.storage
        .from("researcher-profiles")
        .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });

      if (uploadError) {
        if (uploadError.message?.includes("Bucket not found")) {
          await adminClient.storage.createBucket("researcher-profiles", { public: false });
          const { error: retryError } = await adminClient.storage
            .from("researcher-profiles")
            .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });
          if (retryError) return res.status(500).json({ error: retryError.message });
        } else {
          return res.status(500).json({ error: uploadError.message });
        }
      }

      const { data: signedData } = await adminClient.storage
        .from("researcher-profiles")
        .createSignedUrl(filePath, 315360000);

      res.json({ url: signedData?.signedUrl ?? "" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Saved references
  app.get("/api/research/references", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    let projectId: number | undefined;
    if (req.query.projectId) {
      projectId = parseInt(req.query.projectId as string);
      if (isNaN(projectId)) return res.status(400).json({ error: "Invalid projectId" });
    }
    try {
      const refs = await storage.getSavedReferences(researcherId, projectId);
      res.json({ references: refs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/research/references", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const parsed = insertSavedReferenceSchema.safeParse({ ...req.body, userId: researcherId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      if (parsed.data.projectId) {
        const project = await storage.getResearchProject(parsed.data.projectId, researcherId);
        if (!project) return res.status(403).json({ error: "Project not found or not owned by you" });
      }
      const ref = await storage.createSavedReference(parsed.data);
      res.json({ reference: ref });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/research/references/:id", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    try {
      await storage.deleteSavedReference(id, researcherId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const synthesizeBodySchema = z.object({
    signals: z.array(z.object({
      title: z.string(),
      text: z.string(),
      url: z.string(),
      date: z.string().optional(),
      source_type: z.string().optional(),
    })).min(1).max(10),
    query: z.string().min(1).max(500),
  });

  app.post("/api/research/synthesize", async (req, res) => {
    const parsed = synthesizeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten().fieldErrors });
    }
    try {
      const { signals, query } = parsed.data;

      const signalBlock = signals
        .map((s, i) => `[${i + 1}] "${s.title}" (${s.source_type ?? "unknown"}, ${s.date ?? "n/a"})\n${s.text.slice(0, 600)}`)
        .join("\n\n");

      const prompt = `You are a biotech research synthesis analyst. A researcher searched for "${query}" and found the results below. Synthesize them into a structured analysis.

Results:
${signalBlock}

Return ONLY valid JSON with these four fields:
- "consensus": 2-3 sentences summarizing what the field currently knows based on these results.
- "open_questions": Array of 3-5 strings, each a key open question or gap in the evidence.
- "strongest_signals": Array of up to 3 objects, each with "index" (1-based number from the results list), "title" (the paper/result title), and "reason" (1 sentence explaining why this result is most informative).
- "suggested_next_search": A single string with one follow-up search query the researcher should try next to deepen understanding.

Be specific and evidence-grounded. Do not speculate beyond what the results show.`;

      const { default: OpenAI } = await import("openai");
      const aiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await aiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return res.status(500).json({ error: "No response from AI" });

      const raw = JSON.parse(content);
      const synthesisResponseSchema = z.object({
        consensus: z.string().default(""),
        open_questions: z.array(z.string()).default([]),
        strongest_signals: z.array(z.object({
          index: z.number(),
          title: z.string(),
          reason: z.string(),
        })).default([]),
        suggested_next_search: z.string().default(""),
      });
      const validated = synthesisResponseSchema.parse(raw);
      return res.json(validated);
    } catch (err: any) {
      console.error("Synthesis error:", err);
      return res.status(500).json({ error: friendlyOpenAIError(err) });
    }
  });

  // Evidence extraction from saved references
  app.post("/api/research/library/extract-evidence", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });

    const { referenceIds } = req.body as { referenceIds?: number[] };
    if (!Array.isArray(referenceIds) || referenceIds.length < 2) {
      return res.status(400).json({ error: "Select at least 2 references" });
    }
    if (referenceIds.length > 20) {
      return res.status(400).json({ error: "Maximum 20 references at a time" });
    }

    try {
      const allRefs = await storage.getSavedReferences(researcherId);
      const selected = allRefs.filter((r) => referenceIds.includes(r.id));
      if (selected.length === 0) return res.status(404).json({ error: "No matching references found" });

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const rows: Array<{
        referenceId: number;
        title: string;
        studyType: string;
        sampleSize: string;
        population: string;
        interventionTarget: string;
        outcome: string;
        keyFindings: string;
        evidenceStrength: string;
      }> = [];

      const CONCURRENCY = 5;
      let idx = 0;
      const queue = [...selected];

      const worker = async () => {
        while (idx < queue.length) {
          const ref = queue[idx++];
          if (!ref) continue;
          const hasAbstract = !!ref.notes?.trim();
          if (!ref.title?.trim()) {
            rows.push({
              referenceId: ref.id,
              title: ref.title || "(untitled)",
              studyType: "N/A",
              sampleSize: "N/A",
              population: "N/A",
              interventionTarget: "N/A",
              outcome: "N/A",
              keyFindings: "N/A",
              evidenceStrength: "N/A",
            });
            continue;
          }

          try {
            const response = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [{
                role: "user",
                content: `You are a biomedical evidence extraction assistant. Extract structured evidence fields from the following reference.

Title: ${ref.title}
Source type: ${ref.sourceType}
Date: ${ref.date || "unknown"}
Institution: ${ref.institution || "unknown"}
${hasAbstract ? `Abstract/Notes: ${ref.notes}` : "Abstract: Not available — extract what you can from the title and metadata only. Use \"N/A\" for fields that cannot be determined without an abstract."}

Return ONLY valid JSON with these fields:
- studyType: the type of study (e.g., "RCT", "cohort study", "case report", "review", "in vitro", "animal model", "clinical trial", "computational", "N/A")
- sampleSize: number of subjects/samples or "N/A"
- population: the study population or subject group (e.g., "NSCLC patients", "healthy volunteers", "mouse model", "N/A")
- interventionTarget: the drug/compound/therapy/target being studied (string)
- outcome: primary outcome or endpoint measured (string or "N/A")
- keyFindings: 1-2 sentence summary of main results (string)
- evidenceStrength: one of "High", "Moderate", "Low", "Insufficient" based on study design and data quality

If a field cannot be determined, use "N/A".`
              }],
              response_format: { type: "json_object" },
              temperature: 0.1,
            });

            const content = response.choices[0]?.message?.content;
            if (content) {
              const parsed = JSON.parse(content);
              rows.push({
                referenceId: ref.id,
                title: ref.title,
                studyType: parsed.studyType ?? "N/A",
                sampleSize: parsed.sampleSize ?? "N/A",
                population: parsed.population ?? "N/A",
                interventionTarget: parsed.interventionTarget ?? "N/A",
                outcome: parsed.outcome ?? "N/A",
                keyFindings: parsed.keyFindings ?? "N/A",
                evidenceStrength: parsed.evidenceStrength ?? "N/A",
              });
            } else {
              rows.push({
                referenceId: ref.id, title: ref.title,
                studyType: "N/A", sampleSize: "N/A", population: "N/A",
                interventionTarget: "N/A", outcome: "N/A", keyFindings: "N/A", evidenceStrength: "N/A",
              });
            }
          } catch (err) {
            console.error(`[evidence] Failed to extract for ref ${ref.id}:`, err);
            rows.push({
              referenceId: ref.id, title: ref.title,
              studyType: "Error", sampleSize: "N/A", population: "N/A",
              interventionTarget: "N/A", outcome: "N/A", keyFindings: "Extraction failed", evidenceStrength: "N/A",
            });
          }
        }
      }

      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

      const sorted = referenceIds.map((id) => rows.find((r) => r.referenceId === id)).filter(Boolean);

      res.json({ rows: sorted });
    } catch (err: any) {
      console.error("[evidence] extraction error:", err);
      res.status(500).json({ error: err.message ?? "Evidence extraction failed" });
    }
  });

  // Save evidence table to project
  app.post("/api/research/projects/:id/evidence-table", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const projectId = parseInt(req.params.id);
    if (isNaN(projectId)) return res.status(400).json({ error: "Invalid project id" });

    const evidenceRowSchema = z.object({
      referenceId: z.number(),
      title: z.string(),
      studyType: z.string(),
      sampleSize: z.string(),
      population: z.string(),
      interventionTarget: z.string(),
      outcome: z.string(),
      keyFindings: z.string(),
      evidenceStrength: z.string(),
    });
    const bodyParsed = z.object({ rows: z.array(evidenceRowSchema).min(1) }).safeParse(req.body);
    if (!bodyParsed.success) {
      return res.status(400).json({ error: "Invalid evidence table data", details: bodyParsed.error.flatten() });
    }
    const { rows } = bodyParsed.data;

    try {
      const project = await storage.getResearchProject(projectId, researcherId);
      if (!project) return res.status(404).json({ error: "Project not found" });

      type EvidenceTable = NonNullable<typeof project.evidenceTables>[number];
      const existing: EvidenceTable[] = [...(project.evidenceTables ?? [])];
      const newTable: EvidenceTable = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        rows,
      };
      existing.push(newTable);

      await storage.updateResearchProject(projectId, researcherId, { evidenceTables: existing });
      res.json({ ok: true, tableId: newTable.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to save evidence table" });
    }
  });

  // Saved grants
  app.get("/api/research/grants", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    try {
      const grants = await storage.getSavedGrants(researcherId);
      res.json({ grants });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/research/grants", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const parsed = insertSavedGrantSchema.safeParse({ ...req.body, userId: researcherId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      if (parsed.data.projectId) {
        const project = await storage.getResearchProject(parsed.data.projectId, researcherId);
        if (!project) return res.status(403).json({ error: "Project not found or not owned by you" });
      }
      const grant = await storage.createSavedGrant(parsed.data);
      res.json({ grant });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/research/grants/:id", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    try {
      const grant = await storage.updateSavedGrant(id, researcherId, req.body);
      res.json({ grant });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/research/grants/:id", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    try {
      await storage.deleteSavedGrant(id, researcherId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/taxonomy/therapy-areas", async (_req, res) => {
    try {
      const { getTherapyAreas } = await import("./lib/pipeline/taxonomyPipeline");
      const areas = await getTherapyAreas();
      res.json({ areas });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/taxonomy/convergence", async (_req, res) => {
    try {
      const { getConvergenceSignals } = await import("./lib/pipeline/taxonomyPipeline");
      const signals = await getConvergenceSignals();
      res.json({ signals });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/taxonomy/refresh", async (req, res) => {
    const pw = req.headers["x-admin-password"] as string;
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    try {
      const { refreshTaxonomyCounts, detectConvergenceSignals } = await import("./lib/pipeline/taxonomyPipeline");
      await refreshTaxonomyCounts();
      await detectConvergenceSignals();
      res.json({ ok: true, message: "Taxonomy and convergence refreshed" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/browse/new-arrivals", async (req, res) => {
    try {
      const windowParam = (req.query.window as string) || "7d";
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 2000);
      const offset = parseInt(req.query.offset as string) || 0;
      const is30d = windowParam === "30d";
      const is24h = windowParam === "24h";
      const intervalSql = is30d
        ? sql`${ingestedAssets.firstSeenAt} >= NOW() - INTERVAL '30 days'`
        : is24h
        ? sql`${ingestedAssets.firstSeenAt} >= NOW() - INTERVAL '24 hours'`
        : sql`${ingestedAssets.firstSeenAt} >= NOW() - INTERVAL '7 days'`;
      const intervalRawSql = is30d
        ? sql`first_seen_at >= NOW() - INTERVAL '30 days'`
        : is24h
        ? sql`first_seen_at >= NOW() - INTERVAL '24 hours'`
        : sql`first_seen_at >= NOW() - INTERVAL '7 days'`;
      const windowCondition = and(
        eq(ingestedAssets.relevant, true),
        intervalSql
      );

      // Full-window count and institution grouping (no limit)
      const [countResult, instRows] = await Promise.all([
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(ingestedAssets)
          .where(windowCondition),
        db.execute(sql`
          SELECT institution, COUNT(*)::int AS count
          FROM ingested_assets
          WHERE relevant = true
            AND ${intervalRawSql}
          GROUP BY institution
          ORDER BY count DESC
        `),
      ]);

      const total = countResult[0]?.n ?? 0;
      const institutions = (instRows.rows as { institution: string; count: number }[])
        .map((r) => ({ institution: r.institution || "Unknown", count: r.count }));

      // Paginated asset list
      const assets = await db
        .select({
          id: ingestedAssets.id,
          assetName: ingestedAssets.assetName,
          institution: ingestedAssets.institution,
          modality: ingestedAssets.modality,
          indication: ingestedAssets.indication,
          completenessScore: ingestedAssets.completenessScore,
          firstSeenAt: ingestedAssets.firstSeenAt,
        })
        .from(ingestedAssets)
        .where(windowCondition)
        .orderBy(desc(ingestedAssets.firstSeenAt))
        .limit(limit)
        .offset(offset);

      res.json({ assets, institutions, total, window: windowParam, hasMore: offset + assets.length < total });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/browse/assets", async (req, res) => {
    try {
      const therapyArea = req.query.therapyArea as string | undefined;
      const institution = req.query.institution as string | undefined;
      const modality = req.query.modality as string | undefined;
      const stage = req.query.stage as string | undefined;
      const sortBy = req.query.sortBy as string | undefined;
      const minCompleteness = req.query.minCompleteness ? parseFloat(req.query.minCompleteness as string) : undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      const rawAreas: string[] = req.query.therapyAreas
        ? (Array.isArray(req.query.therapyAreas) ? req.query.therapyAreas as string[] : [req.query.therapyAreas as string])
        : therapyArea ? [therapyArea] : [];

      const conditions = [eq(ingestedAssets.relevant, true)];
      if (rawAreas.length > 0) {
        const areaConditions = rawAreas.map(area =>
          sql`lower(${ingestedAssets.categories}::text) LIKE ${"%" + area.toLowerCase() + "%"}`
        );
        conditions.push(areaConditions.length === 1 ? areaConditions[0] : sql`(${sql.join(areaConditions, sql` OR `)})`);
      }
      if (institution) {
        conditions.push(eq(ingestedAssets.institution, institution));
      }
      if (modality && modality !== "all") {
        conditions.push(eq(ingestedAssets.modality, modality));
      }
      if (stage && stage !== "all") {
        conditions.push(eq(ingestedAssets.developmentStage, stage));
      }
      if (minCompleteness !== undefined && !isNaN(minCompleteness)) {
        conditions.push(sql`${ingestedAssets.completenessScore} >= ${minCompleteness}`);
      }

      const orderClause = sortBy === "completeness"
        ? sql`${ingestedAssets.completenessScore} DESC NULLS LAST, ${ingestedAssets.firstSeenAt} DESC`
        : sql`${ingestedAssets.firstSeenAt} desc`;

      const results = await db
        .select({
          id: ingestedAssets.id,
          fingerprint: ingestedAssets.fingerprint,
          assetName: ingestedAssets.assetName,
          target: ingestedAssets.target,
          modality: ingestedAssets.modality,
          indication: ingestedAssets.indication,
          developmentStage: ingestedAssets.developmentStage,
          institution: ingestedAssets.institution,
          summary: ingestedAssets.summary,
          sourceUrl: ingestedAssets.sourceUrl,
          categories: ingestedAssets.categories,
          innovationClaim: ingestedAssets.innovationClaim,
          mechanismOfAction: ingestedAssets.mechanismOfAction,
          completenessScore: ingestedAssets.completenessScore,
          firstSeenAt: ingestedAssets.firstSeenAt,
        })
        .from(ingestedAssets)
        .where(and(...conditions))
        .limit(limit)
        .offset(offset)
        .orderBy(orderClause);

      res.json({ assets: results, hasMore: results.length === limit });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/concepts", async (req, res) => {
    try {
      const pw = req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const results = await db
        .select()
        .from(conceptCards)
        .orderBy(desc(conceptCards.createdAt))
        .limit(200);
      res.json({ concepts: results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/industry-projects", async (req, res) => {
    try {
      const pw = req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const results = await db
        .select({
          id: researchProjects.id,
          title: researchProjects.title,
          discoveryTitle: researchProjects.discoveryTitle,
          researchArea: researchProjects.researchArea,
          status: researchProjects.status,
          adminStatus: researchProjects.adminStatus,
          publishToIndustry: researchProjects.publishToIndustry,
          discoverySummary: researchProjects.discoverySummary,
          projectUrl: researchProjects.projectUrl,
          lastEditedAt: researchProjects.lastEditedAt,
          openForCollaboration: researchProjects.openForCollaboration,
          developmentStage: researchProjects.developmentStage,
        })
        .from(researchProjects)
        .orderBy(
          sql`CASE WHEN ${researchProjects.adminStatus} = 'pending' THEN 0 WHEN ${researchProjects.adminStatus} = 'published' THEN 1 ELSE 2 END`,
          desc(researchProjects.lastEditedAt),
        );
      res.json({ projects: results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/industry-projects/:id/status", async (req, res) => {
    try {
      const pw = req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const { id } = req.params;
      const schema = z.object({ adminStatus: z.enum(["pending", "published", "rejected"]) });
      const { adminStatus } = schema.parse(req.body);
      const publishToIndustry = adminStatus === "published" ? true : adminStatus === "rejected" ? false : null;
      await db
        .update(researchProjects)
        .set({ adminStatus, ...(publishToIndustry !== null ? { publishToIndustry } : {}) })
        .where(eq(researchProjects.id, Number(id)));
      res.json({ ok: true, id: Number(id), adminStatus, publishToIndustry });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || "";

  app.get("/api/admin/users", async (req, res) => {
    try {
      const pw = req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data, error } = await adminSupabase.auth.admin.listUsers({ perPage: 500 });
      if (error) return res.status(500).json({ error: error.message });
      const users = (data?.users ?? []).map((u) => ({
        id: u.id,
        email: u.email ?? "",
        contactEmail: u.user_metadata?.contactEmail ?? null,
        role: u.user_metadata?.role ?? null,
        subscribedToDigest: u.user_metadata?.subscribedToDigest === true,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
      }));
      res.json({ users });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/users/:id/email", async (req, res) => {
    try {
      const pw = req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const { id } = req.params;
      const schema = z.object({ contactEmail: z.string().email().or(z.literal("")) });
      const { contactEmail } = schema.parse(req.body);
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data: existing, error: fetchErr } = await adminSupabase.auth.admin.getUserById(id);
      if (fetchErr || !existing?.user) return res.status(404).json({ error: "User not found" });
      const { data, error } = await adminSupabase.auth.admin.updateUserById(id, {
        user_metadata: { ...existing.user.user_metadata, contactEmail: contactEmail || null },
      });
      if (error) return res.status(500).json({ error: error.message });
      res.json({
        id: data.user.id,
        contactEmail: data.user.user_metadata?.contactEmail ?? null,
      });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: "Invalid email" });
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/users/:id/subscribed", async (req, res) => {
    try {
      const pw = req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const { id } = req.params;
      const schema = z.object({ subscribedToDigest: z.boolean() });
      const { subscribedToDigest } = schema.parse(req.body);
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data: existing, error: fetchErr } = await adminSupabase.auth.admin.getUserById(id);
      if (fetchErr || !existing?.user) return res.status(404).json({ error: "User not found" });
      const { data, error } = await adminSupabase.auth.admin.updateUserById(id, {
        user_metadata: { ...existing.user.user_metadata, subscribedToDigest },
      });
      if (error) return res.status(500).json({ error: error.message });
      res.json({
        id: data.user.id,
        subscribedToDigest: data.user.user_metadata?.subscribedToDigest ?? false,
      });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: "Invalid body" });
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/users/:id/role", async (req, res) => {
    try {
      const pw = req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const { id } = req.params;
      const roleSchema = z.object({ role: z.enum(ALL_PORTAL_ROLES as [string, ...string[]]) });
      const { role } = roleSchema.parse(req.body);
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data, error } = await adminSupabase.auth.admin.updateUserById(id, {
        user_metadata: { role },
      });
      if (error) return res.status(500).json({ error: error.message });
      res.json({
        id: data.user.id,
        email: data.user.email ?? "",
        role: data.user.user_metadata?.role ?? null,
      });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: "Invalid role" });
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/users/invite", async (req, res) => {
    try {
      const pw = req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const inviteSchema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
        role: z.enum(ALL_PORTAL_ROLES as [string, ...string[]]),
      });
      const { email, password, role } = inviteSchema.parse(req.body);
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data, error } = await adminSupabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role },
      });
      if (error) return res.status(500).json({ error: error.message });
      res.json({
        id: data.user.id,
        email: data.user.email ?? "",
        role: data.user.user_metadata?.role ?? null,
      });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: "Invalid input: " + err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: err.message });
    }
  });

  // ── Organization Management Routes ──────────────────────────────────────────

  const orgBodySchema = z.object({
    name: z.string().min(1),
    planTier: z.enum(["individual", "team5", "team10", "enterprise"]).default("individual"),
    seatLimit: z.number().int().min(1).default(1),
    logoUrl: z.string().nullable().optional(),
    primaryColor: z.string().nullable().optional(),
    billingEmail: z.string().email().nullable().optional(),
    billingMethod: z.enum(["stripe", "ach", "invoice"]).default("stripe"),
    billingNotes: z.string().nullable().optional(),
  });

  function adminGuard(req: any, res: any): boolean {
    if (req.headers["x-admin-password"] !== "eden") {
      res.status(401).json({ error: "Unauthorized" });
      return false;
    }
    return true;
  }

  app.get("/api/admin/organizations", async (req, res) => {
    try {
      if (!adminGuard(req, res)) return;
      const orgs = await storage.getAllOrganizations();
      const orgsWithCounts = await Promise.all(
        orgs.map(async (org) => ({
          ...org,
          memberCount: await storage.getOrgMemberCount(org.id),
        }))
      );
      res.json(orgsWithCounts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/organizations/:id", async (req, res) => {
    try {
      if (!adminGuard(req, res)) return;
      const org = await storage.getOrganization(Number(req.params.id));
      if (!org) return res.status(404).json({ error: "Not found" });
      const members = await storage.getOrgMembers(org.id);
      res.json({ ...org, members });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/organizations", async (req, res) => {
    try {
      if (!adminGuard(req, res)) return;
      const data = orgBodySchema.parse(req.body);
      const org = await storage.createOrganization(data);
      res.json(org);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/organizations/:id", async (req, res) => {
    try {
      if (!adminGuard(req, res)) return;
      const data = orgBodySchema.partial().parse(req.body);
      const org = await storage.updateOrganization(Number(req.params.id), data);
      if (!org) return res.status(404).json({ error: "Not found" });
      res.json(org);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/organizations/:id", async (req, res) => {
    try {
      if (!adminGuard(req, res)) return;
      await storage.deleteOrganization(Number(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Logo upload — stores a URL or base64 data URL in logoUrl field
  app.post("/api/admin/organizations/:id/logo", async (req, res) => {
    try {
      if (!adminGuard(req, res)) return;
      const { logoUrl } = z.object({ logoUrl: z.string().min(1) }).parse(req.body);
      const org = await storage.updateOrganization(Number(req.params.id), { logoUrl });
      if (!org) return res.status(404).json({ error: "Not found" });
      res.json({ logoUrl: org.logoUrl });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: err.message });
    }
  });

  // Add member — creates Supabase account, adds to org_members, sets industry_profiles.org_id
  app.post("/api/admin/organizations/:id/members", async (req, res) => {
    try {
      if (!adminGuard(req, res)) return;
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const memberSchema = z.object({
        email: z.string().email(),
        fullName: z.string().min(1),
        role: z.enum(["owner", "admin", "member"]).default("member"),
      });
      const { email, fullName, role } = memberSchema.parse(req.body);
      const orgId = Number(req.params.id);

      // Seat limit check
      const org = await storage.getOrganization(orgId);
      if (!org) return res.status(404).json({ error: "Organization not found" });
      const currentCount = await storage.getOrgMemberCount(orgId);
      if (currentCount >= org.seatLimit) {
        return res.status(400).json({ error: `Seat limit reached (${currentCount}/${org.seatLimit}). Upgrade the plan to add more members.` });
      }

      // Create Supabase user without a password — they set it via the emailed link
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data: userData, error: supabaseError } = await adminSupabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { role: "industry", fullName },
      });
      if (supabaseError) return res.status(500).json({ error: supabaseError.message });
      const userId = userData.user.id;

      // Generate a password-recovery link the new member can use to set their password
      let setPasswordLink: string | undefined;
      try {
        const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
          type: "recovery",
          email,
        });
        if (linkError) {
          console.warn("[email] Could not generate password-set link:", linkError.message);
        } else {
          setPasswordLink = linkData?.properties?.action_link ?? undefined;
        }
      } catch (linkErr) {
        console.warn("[email] generateLink threw:", linkErr);
      }

      // Add to org_members — store email/name for display in admin UI
      const member = await storage.addOrgMember({ orgId, userId, email, memberName: fullName, role });

      // Set industry_profiles.org_id (creates profile row if missing)
      await storage.setIndustryProfileOrg(userId, orgId);

      await sendTeamInviteEmail(email, fullName, org.name, org.planTier ?? "individual", setPasswordLink).catch((err) =>
        console.error("[email] Team invite email failed:", err)
      );

      res.json({ member, user: { id: userId, email: userData.user.email, fullName } });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: err.message });
    }
  });

  // Remove member — removes from org_members, nulls industry_profiles.org_id
  app.delete("/api/admin/organizations/:id/members/:userId", async (req, res) => {
    try {
      if (!adminGuard(req, res)) return;
      const orgId = Number(req.params.id);
      const { userId } = req.params;
      await storage.removeOrgMember(orgId, userId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Resend invite — generates a fresh recovery link and re-sends the team invite email
  app.post("/api/admin/organizations/:id/members/:userId/resend-invite", async (req, res) => {
    try {
      if (!adminGuard(req, res)) return;
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const orgId = Number(req.params.id);
      const { userId } = req.params;

      const org = await storage.getOrganization(orgId);
      if (!org) return res.status(404).json({ error: "Organization not found" });

      const members = await storage.getOrgMembers(orgId);
      const member = members.find((m) => m.userId === userId);
      if (!member) return res.status(404).json({ error: "Member not found in this organization" });
      if (!member.email) return res.status(400).json({ error: "Member has no email address on record" });

      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);

      const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
        type: "recovery",
        email: member.email,
      });
      if (linkError) return res.status(500).json({ error: linkError.message });
      const setPasswordLink = linkData?.properties?.action_link ?? undefined;

      await sendTeamInviteEmail(
        member.email,
        member.memberName ?? "",
        org.name,
        org.planTier ?? "individual",
        setPasswordLink,
      ).catch((err) => console.error("[email] Resend invite email failed:", err));

      res.json({ ok: true, email: member.email });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete user account — deletes from Supabase Auth, org_members (all orgs), and industry_profiles
  app.delete("/api/admin/members/:userId", async (req, res) => {
    try {
      if (!adminGuard(req, res)) return;
      const { userId } = req.params;
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);

      // Fetch email BEFORE deleting so we can send a confirmation after
      let deletedEmail: string | undefined;
      let deletedName: string | undefined;
      try {
        const { data: authUser } = await adminSupabase.auth.admin.getUserById(userId);
        deletedEmail = authUser?.user?.email;
        deletedName = (authUser?.user?.user_metadata?.fullName as string | undefined) ?? undefined;
      } catch (lookupErr) {
        console.warn("[delete-account] Could not look up user email before deletion:", lookupErr);
      }

      // Delete Supabase Auth user first — if this fails, nothing else is touched
      const { error: supabaseError } = await adminSupabase.auth.admin.deleteUser(userId);
      if (supabaseError) {
        console.error("[delete-account] Supabase delete error:", supabaseError.message);
        return res.status(500).json({ error: `Failed to delete auth account: ${supabaseError.message}` });
      }
      // Auth account removed — now clean up DB records
      await storage.deleteUserAccount(userId);

      if (deletedEmail) {
        await sendAccountDeletionEmail(deletedEmail, deletedName ?? "").catch((err) =>
          console.error("[email] Account deletion email failed:", err)
        );
      }

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Change member role
  app.patch("/api/admin/organizations/:id/members/:userId/role", async (req, res) => {
    try {
      if (!adminGuard(req, res)) return;
      const { role } = z.object({ role: z.enum(["owner", "admin", "member"]) }).parse(req.body);
      const orgId = Number(req.params.id);
      const { userId } = req.params;
      await storage.updateOrgMemberRole(orgId, userId, role);
      res.json({ ok: true });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: err.message });
    }
  });

  // Plan-check endpoint — returns the authenticated user's active EdenScout plan tier.
  // Returns { plan: string | null, orgName: string | null }
  // plan is null when the user has no org or their org has no recognised paid tier.
  app.get("/api/me/plan", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const PAID_PLANS = ["individual", "team5", "team10", "enterprise"] as const;
      const membership = await storage.getOrgPlanByMembership(userId);
      if (!membership || !PAID_PLANS.includes(membership.plan as (typeof PAID_PLANS)[number])) {
        return res.json({ plan: null, orgName: null });
      }
      return res.json({ plan: membership.plan, orgName: membership.orgName });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Industry-facing org context route — requires verified JWT via verifyAnyAuth
  app.get("/api/industry/org", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!org) return res.json(null);
      const members = await storage.getOrgMembers(org.id);
      res.json({ ...org, members });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  function stripPrivateFields(c: Record<string, any>) {
    const { submitterEmail, ...rest } = c;
    return rest;
  }

  app.get("/api/discovery/concepts", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"))));
      const offset = (page - 1) * limit;
      const results = await db
        .select()
        .from(conceptCards)
        .where(eq(conceptCards.status, "active"))
        .orderBy(desc(conceptCards.createdAt))
        .limit(limit)
        .offset(offset);
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(conceptCards)
        .where(eq(conceptCards.status, "active"));
      res.json({ concepts: results.map(stripPrivateFields), page, limit, total: count, totalPages: Math.ceil(count / limit) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/my-concepts", verifyConceptAuth, async (req, res) => {
    try {
      const userId = req.headers["x-concept-user-id"] as string;
      const results = await db
        .select()
        .from(conceptCards)
        .where(eq(conceptCards.userId, userId))
        .orderBy(desc(conceptCards.createdAt));
      res.json({ concepts: results.map(stripPrivateFields) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/concepts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const [concept] = await db
        .select()
        .from(conceptCards)
        .where(and(eq(conceptCards.id, id), eq(conceptCards.status, "active")));
      if (!concept) return res.status(404).json({ error: "Concept not found" });
      res.json({ concept: stripPrivateFields(concept) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/discovery/concepts", verifyConceptAuth, async (req, res) => {
    try {
      const conceptUserId = req.headers["x-concept-user-id"] as string;
      if (!conceptUserId) {
        console.error("[concept POST] x-concept-user-id header is empty — auth middleware may have failed");
        return res.status(401).json({ error: "User identification failed" });
      }
      const parsed = insertConceptCardSchema.parse({
        ...req.body,
        userId: conceptUserId,
      });

      let aiScore: number | null = null;
      let aiRationale: string | null = null;

      try {
        const openai = new (await import("openai")).default({ apiKey: process.env.OPENAI_API_KEY });
        const aiRes = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content: `You are a biotech concept evaluator. Score the scientific credibility of a pre-research concept on a 0-100 scale. Consider: scientific plausibility, clarity of problem statement, feasibility of proposed approach, and relevance to biotech/pharma. Return JSON: {"score": number, "rationale": "one sentence"}.`,
            },
            {
              role: "user",
              content: `Title: ${parsed.title}\nOne-liner: ${parsed.oneLiner}\nHypothesis: ${parsed.hypothesis ?? "N/A"}\nProblem: ${parsed.problem}\nApproach: ${parsed.proposedApproach}\nTherapy Area: ${parsed.therapeuticArea}\nModality: ${parsed.modality}\nRequired Expertise: ${parsed.requiredExpertise ?? "N/A"}`,
            },
          ],
          response_format: { type: "json_object" },
        });
        const json = JSON.parse(aiRes.choices[0]?.message?.content || "{}");
        aiScore = typeof json.score === "number" ? Math.min(100, Math.max(0, json.score)) : null;
        aiRationale = json.rationale || null;
      } catch (aiErr) {
        console.error("AI credibility scoring failed:", aiErr);
      }

      const conceptEmail = (req.headers["x-concept-user-email"] as string) || (req.body.submitterEmail as string) || null;
      const attachedFileSchema = z.array(z.object({
        name: z.string().max(255),
        url: z.string().url().refine((u) => u.startsWith("https://"), { message: "URL must use HTTPS" }),
        size: z.number().int().min(0).max(10 * 1024 * 1024),
      })).max(5).default([]);
      const attachedFiles = attachedFileSchema.parse(req.body.attachedFiles ?? []);
      const [concept] = await db
        .insert(conceptCards)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .values({
          ...(parsed as any),
          submitterEmail: conceptEmail,
          credibilityScore: aiScore,
          credibilityRationale: aiRationale,
          attachedFiles,
        })
        .returning();

      res.json({ concept: stripPrivateFields(concept) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/discovery/concepts/:id", verifyConceptAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const conceptUserId = req.headers["x-concept-user-id"] as string;
      const [concept] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Concept not found" });
      if (concept.userId !== conceptUserId) return res.status(403).json({ error: "Not your concept" });

      await db.delete(conceptInterests).where(eq(conceptInterests.conceptId, id));
      await db.delete(conceptCards).where(eq(conceptCards.id, id));

      const files = concept.attachedFiles as { name: string; url: string; size: number }[] | null;
      if (files && files.length > 0) {
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        if (serviceRoleKey && supabaseUrl) {
          try {
            const { createClient } = await import("@supabase/supabase-js");
            const adminClient = createClient(supabaseUrl, serviceRoleKey);
            const paths = files.map((f) => {
              const url = new URL(f.url);
              const match = url.pathname.match(/\/object\/public\/concept-files\/(.+)/);
              return match ? match[1] : null;
            }).filter((p): p is string => !!p);
            if (paths.length > 0) {
              const { error } = await adminClient.storage.from("concept-files").remove(paths);
              if (error) console.error(`[concept DELETE] Storage cleanup error:`, error);
              else console.log(`[concept DELETE] Cleaned up ${paths.length} file(s) from storage`);
            }
          } catch (storageErr) {
            console.error(`[concept DELETE] Storage cleanup failed:`, storageErr);
          }
        } else {
          console.log(`[concept DELETE] Concept ${id} had ${files.length} attached file(s). Storage cleanup skipped (no SUPABASE_SERVICE_ROLE_KEY).`);
        }
      }

      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/discovery/concepts/:id/interest", verifyAnyAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const type = (req.body?.type as string) || "collaborating";
      if (!["collaborating", "funding", "advising"].includes(type)) {
        return res.status(400).json({ error: "Invalid interest type" });
      }

      const [concept] = await db.select({ id: conceptCards.id, userId: conceptCards.userId }).from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Concept not found" });

      const userId = req.headers["x-user-id"] as string;
      if (concept.userId === userId) {
        return res.status(400).json({ error: "Cannot express interest in your own concept" });
      }
      const userEmail = req.headers["x-user-email"] as string || null;
      const userName = (req.body?.userName as string) || null;

      const existing = await db
        .select()
        .from(conceptInterests)
        .where(and(
          eq(conceptInterests.conceptId, id),
          eq(conceptInterests.userId, userId),
          eq(conceptInterests.type, type)
        ))
        .limit(1);

      let toggled: "on" | "off";
      if (existing.length > 0) {
        await db.delete(conceptInterests).where(eq(conceptInterests.id, existing[0].id));
        toggled = "off";
      } else {
        await db.insert(conceptInterests).values({
          conceptId: id,
          userId,
          userEmail,
          userName,
          type,
        }).onConflictDoNothing();
        toggled = "on";
      }

      const [collabCount] = await db.select({ count: sql<number>`count(*)::int` }).from(conceptInterests).where(and(eq(conceptInterests.conceptId, id), eq(conceptInterests.type, "collaborating")));
      const [fundCount] = await db.select({ count: sql<number>`count(*)::int` }).from(conceptInterests).where(and(eq(conceptInterests.conceptId, id), eq(conceptInterests.type, "funding")));
      const [adviseCount] = await db.select({ count: sql<number>`count(*)::int` }).from(conceptInterests).where(and(eq(conceptInterests.conceptId, id), eq(conceptInterests.type, "advising")));

      const [updated] = await db
        .update(conceptCards)
        .set({
          interestCollaborating: collabCount.count,
          interestFunding: fundCount.count,
          interestAdvising: adviseCount.count,
        })
        .where(eq(conceptCards.id, id))
        .returning();

      const action = toggled === "on" ? "added" : "removed";
      const responsePayload: Record<string, any> = {
        concept: stripPrivateFields(updated),
        action,
        toggled,
      };
      if (toggled === "on") {
        responsePayload.submitterEmail = updated.submitterEmail || null;
      }
      res.json(responsePayload);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/concepts/:id/my-interest", verifyAnyAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const userId = req.headers["x-user-id"] as string;
      const rows = await db
        .select({ type: conceptInterests.type })
        .from(conceptInterests)
        .where(and(eq(conceptInterests.conceptId, id), eq(conceptInterests.userId, userId)));
      const typeSet = new Set(rows.map(r => r.type));
      res.json({
        collaborating: typeSet.has("collaborating"),
        funding: typeSet.has("funding"),
        advising: typeSet.has("advising"),
        types: rows.map(r => r.type),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/concepts/:id/interests", verifyConceptAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const conceptUserId = req.headers["x-concept-user-id"] as string;
      const [concept] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Concept not found" });
      if (concept.userId !== conceptUserId) return res.status(403).json({ error: "Not your concept" });
      const rows = await db
        .select()
        .from(conceptInterests)
        .where(eq(conceptInterests.conceptId, id))
        .orderBy(desc(conceptInterests.createdAt));
      const grouped: Record<string, typeof rows> = { collaborating: [], funding: [], advising: [] };
      for (const row of rows) {
        if (!grouped[row.type]) grouped[row.type] = [];
        grouped[row.type].push(row);
      }
      res.json({ interests: rows, byType: grouped, total: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/concepts/:id/contact", verifyAnyAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const userId = req.headers["x-user-id"] as string;

      const activeInterests = await db
        .select({ id: conceptInterests.id })
        .from(conceptInterests)
        .where(and(eq(conceptInterests.conceptId, id), eq(conceptInterests.userId, userId)))
        .limit(1);

      if (activeInterests.length === 0) {
        return res.status(403).json({ error: "Express interest first to view contact details" });
      }

      const [concept] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Concept not found" });

      res.json({
        submitterName: concept.submitterName,
        submitterAffiliation: concept.submitterAffiliation,
        submitterEmail: concept.submitterEmail,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/concepts/:id/landscape", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

      const landscapeCacheKey = `concept-landscape:${id}`;
      const cachedLandscape = cacheGet<object>(landscapeCacheKey);
      if (cachedLandscape) return res.json(cachedLandscape);

      const [concept] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Not found" });
      const therapyArea = concept.therapeuticArea?.toLowerCase() ?? "";
      const conceptModality = concept.modality?.toLowerCase() ?? "";
      const titleTerms = (concept.title ?? "").split(/\s+/).filter(w => w.length > 5).slice(0, 4).join(" ");
      const hypothesisTerms = (concept.hypothesis ?? "").split(/\s+/).filter(w => w.length > 5).slice(0, 3).join(" ");

      if (!therapyArea) {
        return res.json({ assets: [], literature: [], noResults: true });
      }

      const pubmedTermParts: string[] = [];
      if (titleTerms) pubmedTermParts.push(`(${titleTerms})[Title/Abstract]`);
      pubmedTermParts.push(`"${therapyArea}"[MeSH Terms]`);
      if (conceptModality && conceptModality !== "other" && conceptModality !== "unknown") pubmedTermParts.push(conceptModality);
      const pubmedQuery = pubmedTermParts.join(" AND ");

      const biorxivTerms = [titleTerms, therapyArea, conceptModality !== "other" && conceptModality !== "unknown" ? conceptModality : ""].filter(Boolean).join(" ");

      const assetWhereConditions = [
        eq(ingestedAssets.relevant, true),
        sql`lower(${ingestedAssets.indication}) like ${"%" + therapyArea + "%"}`,
      ];
      if (conceptModality && conceptModality !== "other" && conceptModality !== "unknown") {
        assetWhereConditions.push(sql`lower(${ingestedAssets.modality}) like ${"%" + conceptModality + "%"}`);
      }

      const [relatedAssets, pubmedResults] = await Promise.allSettled([
        db
          .select({
            id: ingestedAssets.id,
            assetName: ingestedAssets.assetName,
            institution: ingestedAssets.institution,
            modality: ingestedAssets.modality,
            developmentStage: ingestedAssets.developmentStage,
            target: ingestedAssets.target,
            sourceUrl: ingestedAssets.sourceUrl,
          })
          .from(ingestedAssets)
          .where(and(...assetWhereConditions))
          .orderBy(desc(ingestedAssets.firstSeenAt))
          .limit(6),

        (async () => {
          const [pubmedItems, biorxivItems] = await Promise.allSettled([
            (async () => {
              if (!pubmedQuery) return [];
              const searchTerm = encodeURIComponent(pubmedQuery);
              const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${searchTerm}&retmax=3&retmode=json&sort=relevance`;
              const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });
              if (!searchRes.ok) return [];
              const searchJson = await searchRes.json() as { esearchresult?: { idlist?: string[] } };
              const ids: string[] = searchJson.esearchresult?.idlist ?? [];
              if (ids.length === 0) return [];
              const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`;
              const summaryRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(5000) });
              if (!summaryRes.ok) return [];
              const summaryJson = await summaryRes.json() as { result?: Record<string, unknown> };
              const result = summaryJson.result ?? {};
              return ids.slice(0, 3).map((pmid) => {
                const doc = (result[pmid] ?? {}) as Record<string, unknown>;
                return {
                  source: "pubmed" as const,
                  pmid,
                  title: (doc.title as string) ?? "Untitled",
                  authors: (Array.isArray(doc.authors) ? doc.authors : []).slice(0, 2).map((a: Record<string, string>) => a.name).join(", "),
                  journal: (doc.fulljournalname as string) ?? (doc.source as string) ?? "",
                  year: typeof doc.pubdate === "string" ? doc.pubdate.substring(0, 4) : "",
                  url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
                };
              });
            })(),
            (async () => {
              if (!biorxivTerms.trim()) return [];
              const q = encodeURIComponent(biorxivTerms);
              const url = `https://api.crossref.org/works?query=${q}&filter=type:posted-content,member:246&rows=3&sort=relevance&mailto=eden@edenradar.io`;
              const biorxivRes = await fetch(url, { signal: AbortSignal.timeout(5000) });
              if (!biorxivRes.ok) return [];
              const json = await biorxivRes.json() as { message?: { items?: Record<string, unknown>[] } };
              return (json.message?.items ?? []).slice(0, 3).map((item) => {
                const doi = (item.DOI as string) ?? "";
                const authorArr = Array.isArray(item.author) ? item.author : [];
                const authors = authorArr.slice(0, 2).map((a: Record<string, string>) => `${a.given ?? ""} ${a.family ?? ""}`.trim()).join(", ");
                const created = item.created as Record<string, unknown> | undefined;
                const dateParts = created?.["date-parts"] as number[][] | undefined;
                const year = dateParts?.[0]?.[0]?.toString() ?? "";
                const titleArr = item.title as string[] | undefined;
                return {
                  source: "biorxiv" as const,
                  pmid: doi,
                  title: titleArr?.[0] ?? "Untitled",
                  authors,
                  journal: "bioRxiv preprint",
                  year,
                  url: `https://doi.org/${doi}`,
                };
              });
            })(),
          ]);
          const pubmed = pubmedItems.status === "fulfilled" ? pubmedItems.value : [];
          const biorxiv = biorxivItems.status === "fulfilled" ? biorxivItems.value : [];
          return [...pubmed, ...biorxiv].slice(0, 3);
        })(),
      ]);

      const assets = relatedAssets.status === "fulfilled" ? relatedAssets.value : [];
      const literature = pubmedResults.status === "fulfilled" ? pubmedResults.value : [];

      if (assets.length === 0 && literature.length === 0) {
        const emptyResp = { assets: [], literature: [], noResults: true };
        cacheSet(landscapeCacheKey, emptyResp, 2 * 60 * 60 * 1000);
        return res.json(emptyResp);
      }
      const landscapeResp = { assets, literature };
      cacheSet(landscapeCacheKey, landscapeResp, 2 * 60 * 60 * 1000);
      res.json(landscapeResp);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/industry/projects", async (_req, res) => {
    try {
      const projects = await db
        .select()
        .from(researchProjects)
        .where(
          and(
            eq(researchProjects.publishToIndustry, true),
            eq(researchProjects.adminStatus, "published"),
          ),
        )
        .orderBy(desc(researchProjects.lastEditedAt));
      res.json({ projects });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/alerts", async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      const alerts = await storage.listUserAlerts(userId);
      res.json(alerts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/alerts", async (req, res) => {
    try {
      const { query, modalities, stages, institutions, name } = req.body ?? {};
      if (!query && (!modalities?.length) && (!stages?.length) && (!institutions?.length)) {
        return res.status(400).json({ error: "At least one filter must be set" });
      }
      const userId = await tryGetUserId(req);
      const alert = await storage.createUserAlert({
        name: name ?? null,
        query: query ?? null,
        modalities: modalities ?? null,
        stages: stages ?? null,
        institutions: institutions ?? null,
      }, userId);
      res.status(201).json(alert);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/alerts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      await storage.deleteUserAlert(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/ingest/institutions/names", async (_req, res) => {
    try {
      const rows = await db
        .selectDistinct({ institution: ingestedAssets.institution })
        .from(ingestedAssets)
        .where(sql`${ingestedAssets.institution} IS NOT NULL AND ${ingestedAssets.institution} != ''`)
        .orderBy(ingestedAssets.institution)
        .limit(500);
      res.json(rows.map((r) => r.institution).filter(Boolean));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/industry/alerts/delta", async (req, res) => {
    try {
      const WINDOW_HOURS = 48;
      const sinceParam = req.query.since as string | undefined;
      const since = sinceParam && !isNaN(Date.parse(sinceParam))
        ? new Date(sinceParam)
        : new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);

      const [newAssetRows, newConceptRows, newProjectRows, savedAlerts] = await Promise.all([
        db
          .select({
            id: ingestedAssets.id,
            institution: ingestedAssets.institution,
            assetName: ingestedAssets.assetName,
            modality: ingestedAssets.modality,
            developmentStage: ingestedAssets.developmentStage,
          })
          .from(ingestedAssets)
          .where(
            and(
              eq(ingestedAssets.relevant, true),
              sql`${ingestedAssets.firstSeenAt} >= ${since}`,
            )
          )
          .orderBy(desc(ingestedAssets.firstSeenAt)),

        db
          .select({
            id: conceptCards.id,
            title: conceptCards.title,
            therapeuticArea: conceptCards.therapeuticArea,
            submitterAffiliation: conceptCards.submitterAffiliation,
            oneLiner: conceptCards.oneLiner,
          })
          .from(conceptCards)
          .where(
            and(
              eq(conceptCards.status, "active"),
              sql`${conceptCards.createdAt} >= ${since}`,
            ),
          )
          .orderBy(desc(conceptCards.createdAt))
          .limit(20),

        db
          .select({
            id: researchProjects.id,
            title: researchProjects.title,
            discoveryTitle: researchProjects.discoveryTitle,
            researchArea: researchProjects.researchArea,
            status: researchProjects.status,
            discoverySummary: researchProjects.discoverySummary,
            description: researchProjects.description,
            projectUrl: researchProjects.projectUrl,
            projectContributors: researchProjects.projectContributors,
          })
          .from(researchProjects)
          .where(
            and(
              eq(researchProjects.publishToIndustry, true),
              eq(researchProjects.adminStatus, "published"),
              sql`${researchProjects.lastEditedAt} >= ${since}`,
            ),
          )
          .orderBy(desc(researchProjects.lastEditedAt))
          .limit(20),

        db.select().from(userAlerts).orderBy(desc(userAlerts.createdAt)),
      ]);

      // Per-asset alert matching with full AND semantics across all 4 criteria.
      // A wildcard alert (all filter arrays empty, no query) matches any asset.
      function assetMatchesAlert(
        alert: UserAlert,
        asset: { assetName: string; institution: string | null; modality: string | null; developmentStage: string | null },
      ): boolean {
        const hasInst     = (alert.institutions?.length ?? 0) > 0;
        const hasModality = (alert.modalities?.length ?? 0) > 0;
        const hasStage    = (alert.stages?.length ?? 0) > 0;
        const hasQuery    = !!(alert.query?.trim());

        // Wildcard: no filters set — matches everything
        if (!hasInst && !hasModality && !hasStage && !hasQuery) return true;

        // All filter checks use one-direction containment (asset value contains
        // the filter term) and require the asset field to be non-empty; a null
        // or empty field never satisfies a non-empty filter.
        if (hasInst) {
          if (!asset.institution) return false;
          const instLower = asset.institution.toLowerCase();
          const ok = alert.institutions!.some((ai) => instLower.includes(ai.toLowerCase()));
          if (!ok) return false;
        }
        if (hasModality) {
          if (!asset.modality) return false;
          const modLower = asset.modality.toLowerCase();
          const ok = alert.modalities!.some((m) => modLower.includes(m.toLowerCase()));
          if (!ok) return false;
        }
        if (hasStage) {
          if (!asset.developmentStage) return false;
          const stageLower = asset.developmentStage.toLowerCase();
          const ok = alert.stages!.some((s) => stageLower.includes(s.toLowerCase()));
          if (!ok) return false;
        }
        if (hasQuery) {
          const nameLower = (asset.assetName ?? "").toLowerCase();
          const instLower = (asset.institution ?? "").toLowerCase();
          const haystack = `${nameLower} ${instLower}`;
          const queryLower = alert.query!.toLowerCase();
          // Tokenise on whitespace, keeping terms >= 3 chars. For short queries
          // (e.g. "AI", "RNA") the token list may be empty, so fall back to a
          // full-string match to avoid silently returning zero results.
          const tokens = queryLower.split(/\s+/).filter((t) => t.length >= 3);
          const ok = tokens.length > 0
            ? tokens.some((t) => haystack.includes(t))
            : haystack.includes(queryLower.trim());
          if (!ok) return false;
        }
        return true;
      }

      // This endpoint is single-tenant: user_alerts has no user_id column and all
      // alerts belong to the same organisation. hasAlerts and matching reflect the
      // single tenant's alert definitions.
      const hasAlerts = savedAlerts.length > 0;
      type InstEntry = {
        count: number;
        matchedCount: number;
        matchedBy: string | null;
        sampleAssets: Array<{ id: number; name: string }>;
        matchedSampleAssets: Array<{ id: number; name: string }>;
      };
      const institutionMap = new Map<string, InstEntry>();

      for (const row of newAssetRows) {
        const inst = row.institution || "Unknown";
        const existing = institutionMap.get(inst) ?? {
          count: 0,
          matchedCount: 0,
          matchedBy: null,
          sampleAssets: [],
          matchedSampleAssets: [],
        };
        existing.count++;

        if (hasAlerts) {
          for (const alert of savedAlerts) {
            if (assetMatchesAlert(alert, row)) {
              existing.matchedCount++;
              if (!existing.matchedBy) existing.matchedBy = alert.name ?? alert.query ?? "Your alert";
              // Only collect sample assets that actually matched
              if (existing.matchedSampleAssets.length < 5) {
                existing.matchedSampleAssets.push({ id: row.id, name: row.assetName });
              }
              break;
            }
          }
        }

        if (existing.sampleAssets.length < 5) existing.sampleAssets.push({ id: row.id, name: row.assetName });
        institutionMap.set(inst, existing);
      }

      const byInstitution = Array.from(institutionMap.entries())
        .map(([institution, { count, matchedCount, matchedBy, sampleAssets, matchedSampleAssets }]) => ({
          institution,
          count,
          matchedCount,
          matchedBy: matchedBy ?? null,
          sampleAssets,
          matchedSampleAssets,
        }))
        .sort((a, b) => b.count - a.count);

      const windowHours = Math.round((Date.now() - since.getTime()) / 3600000);
      res.json({
        newAssets: {
          total: newAssetRows.length,
          hasAlerts,
          byInstitution,
        },
        newConcepts: { total: newConceptRows.length, items: newConceptRows },
        newProjects: { total: newProjectRows.length, items: newProjectRows },
        windowHours,
        since: since.toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Institutions — merged scraped + manual list ──────────────────────────
  app.get("/api/admin/institutions", async (req, res) => {
    const pw = req.headers["x-admin-password"];
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    try {
      const manual = await storage.getManualInstitutions();
      const scraperNames = ALL_SCRAPERS.map((s) => s.institution);
      const manualNames = manual.map((m) => m.name);
      const merged = Array.from(new Set([...scraperNames, ...manualNames])).sort((a, b) => a.localeCompare(b));
      return res.json({ institutions: merged, manual: manual.map((m) => ({ name: m.name, ttoUrl: m.ttoUrl })) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/institutions", async (req, res) => {
    const pw = req.headers["x-admin-password"];
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
    try {
      const parsed = insertManualInstitutionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const row = await storage.createManualInstitution(parsed.data);
      return res.json({ institution: row });
    } catch (err: any) {
      if (err.message?.includes("unique") || err.message?.includes("duplicate")) {
        return res.status(409).json({ error: "Institution already exists" });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Manual Import — Parse (multipart form-data, returns asset array) ──────
  const manualImportUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 15 },
  });

  app.post(
    "/api/admin/manual-import/parse",
    manualImportUpload.fields([
      { name: "images", maxCount: 10 },
      { name: "documents", maxCount: 5 },
    ]),
    async (req: any, res) => {
    const pw = req.headers["x-admin-password"];
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

    const institution: string = (req.body?.institution ?? "").trim();
    if (!institution) return res.status(400).json({ error: "institution is required" });

    const rawText: string = (req.body?.rawText ?? "").trim();
    const filesMap: Record<string, Express.Multer.File[]> = (req.files as any) ?? {};
    const imageFiles: Express.Multer.File[] = filesMap["images"] ?? [];
    const docFiles: Express.Multer.File[] = filesMap["documents"] ?? [];

    if (!rawText && imageFiles.length === 0 && docFiles.length === 0) {
      return res.status(400).json({ error: "Provide rawText, at least one image, or at least one document" });
    }

    const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
    for (const file of imageFiles) {
      if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
        return res.status(400).json({ error: `Image type not supported: ${file.mimetype}. Use PNG, JPG, or WebP.` });
      }
    }

    const ALLOWED_DOC_TYPES = new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    for (const file of docFiles) {
      if (!ALLOWED_DOC_TYPES.has(file.mimetype)) {
        return res.status(400).json({ error: `Document type not supported: ${file.mimetype}. Use PDF or DOCX.` });
      }
    }

    // Extract text from uploaded documents (no AI cost — lazy dynamic import for CJS/ESM compat)
    const docTexts: string[] = [];
    if (docFiles.length > 0) {
      // Dynamic import is safe: esbuild transforms it to require() in CJS bundle; tsx uses native import()
      const pdfParseMod = await import("pdf-parse");
      const pdfParseFn: (buf: Buffer) => Promise<{ text: string }> =
        (pdfParseMod as any).default ?? pdfParseMod;

      for (const file of docFiles) {
        try {
          if (file.mimetype === "application/pdf") {
            const parsed = await pdfParseFn(file.buffer);
            if (parsed.text?.trim()) docTexts.push(parsed.text.trim());
          } else {
            const result = await mammoth.extractRawText({ buffer: file.buffer });
            if (result.value?.trim()) docTexts.push(result.value.trim());
          }
        } catch (e: any) {
          console.warn(`[manual-import/parse] Could not extract text from ${file.originalname}: ${e?.message}`);
        }
      }
    }

    const combinedText = [rawText, ...docTexts].filter(Boolean).join("\n\n---\n\n");

    // Guard: if documents were uploaded but yielded no extractable text (e.g. scanned/image PDFs)
    if (docFiles.length > 0 && docTexts.length === 0 && !rawText && imageFiles.length === 0) {
      return res.status(400).json({ error: "No text could be extracted from the uploaded documents. The files may be scanned/image-only PDFs. Try copying the text manually and using Paste Text mode instead." });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Layout-aware prompt: describes the standard two-column TTO listing page structure
    // so the model hunts each field in its expected zone rather than guessing.
    const buildParsePrompt = (inst: string) =>
      `You are a biotech technology transfer analyst extracting a single licensable asset from a TTO (Technology Transfer Office) listing page for institution: ${inst}.

TTO listing pages typically follow this two-column layout:
- LEFT SIDEBAR: technology ID / IDF number / case number (look for labels like "IDF #:", "Case #:", "Tech ID:"), inventor names (under "Meet the Inventors" or "Inventors"), contact person name and email (under "Contact For More Info"), school or department name.
- MAIN CONTENT AREA: the technology title (large heading at top), then labelled sections such as "Unmet Need", "Value Proposition" (used by Duke and some others as an equivalent to "Unmet Need"), "Technology", "Other Applications", "Advantages" (bullet list), "Background", "Description".

Extract exactly one asset from this page. Return ONLY valid JSON with a single key "assets" containing a one-item array. The item must have these fields:
- name: the technology title from the main heading (string)
- description: 2-3 sentence summary combining the Technology, Unmet Need, and/or Value Proposition sections (string, "" if not visible)
- abstract: the full verbatim text from all main content sections concatenated (string, "" if not visible)
- sourceUrl: the page URL if visible in a browser address bar or breadcrumb (string, "" if not)
- inventors: array of inventor full names from the sidebar (string[], [] if none listed)
- technologyId: the technology ID, IDF number, or case number from the sidebar — look for "IDF #:", "T-" prefixed codes, "Case #:" (string, "" if not visible)
- contactEmail: the contact email address from the sidebar (string, "" if not visible)
- patentStatus: one of "patented", "patent pending", "provisional", "unknown" — infer from any patent application links or text mentioning PCT/provisional
- target: molecular or biological target if determinable, e.g. "AAV capsid", "PD-1" ("unknown" if not stated)
- modality: one of "small molecule", "antibody", "gene therapy", "cell therapy", "peptide", "vaccine", "nanoparticle", "medical device", "diagnostic", "platform technology", "research tool", "unknown"
- indication: disease or condition being targeted ("unknown" if not stated)
- developmentStage: one of "discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved", "unknown"
- categories: array of 2-4 therapeutic area tags e.g. ["oncology", "gene therapy"] ([] if not determinable)
- innovationClaim: 1-sentence key innovation from the Advantages or Technology section ("unknown" if not clear)
- mechanismOfAction: brief mechanism description ("unknown" if not stated)`;

    // Normalise a raw AI response into a typed asset array
    function normaliseAssets(raw: any[]): any[] {
      return raw.slice(0, 200).map((a: any) => ({
        name: String(a.name || "Unknown Asset"),
        description: String(a.description || ""),
        sourceUrl: String(a.sourceUrl || ""),
        inventors: Array.isArray(a.inventors) ? a.inventors.map(String) : [],
        patentStatus: String(a.patentStatus || "unknown"),
        technologyId: String(a.technologyId || ""),
        contactEmail: String(a.contactEmail || ""),
        target: String(a.target || "unknown"),
        modality: String(a.modality || "unknown"),
        indication: String(a.indication || "unknown"),
        developmentStage: String(a.developmentStage || "unknown"),
        abstract: String(a.abstract || ""),
        categories: Array.isArray(a.categories) ? a.categories.map(String) : [],
        innovationClaim: String(a.innovationClaim || "unknown"),
        mechanismOfAction: String(a.mechanismOfAction || "unknown"),
      }));
    }

    try {
      let assets: any[] = [];
      const failedImages: string[] = [];

      if (imageFiles.length > 0) {
        // ── Image mode: gpt-4o, one API call per image ──────────────────────────
        // Processing images individually eliminates cross-page content bleed and
        // gives each screenshot its own full context window.
        const prompt = buildParsePrompt(institution);
        for (const file of imageFiles) {
          const b64 = file.buffer.toString("base64");
          const parts: any[] = [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${file.mimetype};base64,${b64}`, detail: "high" as const } },
          ];
          // If supplementary text was also uploaded, append it as context
          if (combinedText) {
            parts.push({ type: "text", text: `\n\n---\nSupplementary text (may relate to the same page):\n${combinedText.slice(0, 8000)}` });
          }
          try {
            const response = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [{ role: "user", content: parts }],
              response_format: { type: "json_object" },
              temperature: 0.1,
              max_tokens: 2048,
            });
            const aiContent = response.choices[0]?.message?.content ?? "";
            let parsedJson: any;
            try { parsedJson = JSON.parse(aiContent); } catch {
              failedImages.push(file.originalname);
              continue;
            }
            const rawAssets: any[] = Array.isArray(parsedJson?.assets) ? parsedJson.assets
              : Array.isArray(parsedJson) ? parsedJson : [];
            const normalised = normaliseAssets(rawAssets);
            if (normalised.length === 0) {
              failedImages.push(file.originalname);
            } else {
              assets.push(...normalised);
            }
          } catch (imgErr: any) {
            console.warn(`[manual-import/parse] gpt-4o call failed for image ${file.originalname}: ${imgErr?.message}`);
            failedImages.push(file.originalname);
          }
        }
        // If every image call failed or returned empty JSON, surface a real error
        if (assets.length === 0) {
          return res.status(500).json({ error: "No assets could be extracted from the uploaded images. The image quality may be too low, or the AI vision call failed — check server logs for details." });
        }
      } else if (combinedText) {
        // ── Text-only mode: gpt-4o-mini, single call ────────────────────────────
        // No vision needed — keep the cheaper model and a multi-asset prompt.
        const textPrompt = `You are a biotech technology transfer analyst. Extract every distinct licensable asset from the provided TTO (Technology Transfer Office) content for institution: ${institution}.

Return ONLY valid JSON with a single key "assets" containing an array (up to 200 items). Each item must have these fields:
- name: the technology/asset name as listed (string)
- description: 2-3 sentence summary of the technology (string, "" if not determinable)
- sourceUrl: URL of this specific listing if visible (string, "" if not)
- inventors: array of inventor names if listed (string[], [] if none stated)
- patentStatus: one of "patented", "patent pending", "provisional", "unknown"
- technologyId: technology ID or case number if visible (string, "" if not)
- contactEmail: contact email if listed (string, "" if not)
- target: molecular or biological target if determinable ("unknown" if not stated)
- modality: one of "small molecule", "antibody", "gene therapy", "cell therapy", "peptide", "vaccine", "nanoparticle", "medical device", "diagnostic", "platform technology", "research tool", "unknown"
- indication: disease or condition being targeted ("unknown" if not stated)
- developmentStage: one of "discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved", "unknown"
- abstract: full description text from listing if visible (string, "" if not)
- categories: array of 2-4 therapeutic area tags ([] if not determinable)
- innovationClaim: 1-sentence key innovation ("unknown" if not clear)
- mechanismOfAction: brief MoA description ("unknown" if not stated)

If multiple assets appear, return each as a separate array item.`;

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: [
            { type: "text", text: textPrompt },
            { type: "text", text: `\n\n---\nContent:\n${combinedText.slice(0, 16000)}` },
          ] }],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 4096,
        });
        const aiContent = response.choices[0]?.message?.content ?? "";
        let parsedJson: any;
        try { parsedJson = JSON.parse(aiContent); } catch { return res.status(500).json({ error: "AI returned invalid JSON" }); }
        const rawAssets: any[] = Array.isArray(parsedJson?.assets) ? parsedJson.assets
          : Array.isArray(parsedJson) ? parsedJson : [];
        assets = normaliseAssets(rawAssets);
      }

      return res.json({ assets, institution, failedImages });
    } catch (err: any) {
      console.error("[manual-import/parse] Error:", err);
      return res.status(500).json({ error: err.message ?? "Parse failed" });
    }
  });

  // ── Manual Import — Batch Commit to Indexing Queue ───────────────────────
  app.post("/api/admin/manual-import/commit", async (req, res) => {
    const pw = req.headers["x-admin-password"];
    if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

    const assetSchema = z.object({
      name: z.string().min(1),
      description: z.string().default(""),
      abstract: z.string().default(""),
      sourceUrl: z.string().default(""),
      inventors: z.array(z.string()).default([]),
      patentStatus: z.string().default("unknown"),
      technologyId: z.string().default(""),
      contactEmail: z.string().default(""),
      target: z.string().default("unknown"),
      modality: z.string().default("unknown"),
      indication: z.string().default("unknown"),
      developmentStage: z.string().default("unknown"),
    });

    const bodySchema = z.object({
      institution: z.string().min(1),
      assets: z.array(assetSchema).min(1).max(200),
    });

    const bodyParsed = bodySchema.safeParse(req.body);
    if (!bodyParsed.success) return res.status(400).json({ error: "Invalid request body" });
    const { institution, assets } = bodyParsed.data;

    try {
      const run = await storage.createIngestionRun();

      const listings = assets.map((a) => ({
        fingerprint: makeFingerprint(a.name, institution),
        assetName: a.name,
        institution,
        target: a.target && a.target !== "unknown" ? a.target : "unknown",
        modality: a.modality && a.modality !== "unknown" ? a.modality : "unknown",
        indication: a.indication && a.indication !== "unknown" ? a.indication : "unknown",
        developmentStage: a.developmentStage && a.developmentStage !== "unknown" ? a.developmentStage : "unknown",
        summary: a.description || a.name,
        abstract: a.abstract || null,
        sourceType: "tech_transfer" as const,
        sourceName: "manual",
        sourceUrl: a.sourceUrl || null,
        technologyId: a.technologyId || null,
        patentStatus: a.patentStatus !== "unknown" ? a.patentStatus : null,
        inventors: a.inventors.length > 0 ? a.inventors : null,
        contactEmail: a.contactEmail || null,
        relevant: true,
        runId: run.id,
      }));

      const { newAssets, totalProcessed } = await storage.bulkUpsertIngestedAssets(listings);
      const imported = newAssets.length;
      const skipped = totalProcessed - imported;

      await storage.updateIngestionRun(run.id, { status: "completed", totalFound: totalProcessed, newCount: imported });

      if (newAssets.length > 0) {
        const listingMap = new Map(listings.map((l) => [l.fingerprint, l]));
        const classifyInputs = newAssets.map((a) => ({
          id: a.id,
          title: a.assetName,
          description: listingMap.get(makeFingerprint(a.assetName, institution))?.summary ?? a.assetName,
          abstract: undefined as string | undefined,
        }));

        // Re-classify to fill any remaining unknown fields; preserve values already set from parse step
        const newAssetById = new Map(newAssets.map((a) => [a.id, a]));
        classifyBatch(classifyInputs, 5, async (id, classification) => {
          try {
            const stored = newAssetById.get(id);
            const listing = listingMap.get(makeFingerprint(stored?.assetName ?? "", institution));
            // Prefer parse-extracted values; only use classifier result when parse had "unknown"
            const finalTarget = (listing?.target && listing.target !== "unknown") ? listing.target : classification.target;
            const finalModality = (listing?.modality && listing.modality !== "unknown") ? listing.modality : classification.modality;
            const finalIndication = (listing?.indication && listing.indication !== "unknown") ? listing.indication : classification.indication;
            const finalStage = (listing?.developmentStage && listing.developmentStage !== "unknown") ? listing.developmentStage : classification.developmentStage;
            const score = computeCompletenessScore({
              target: finalTarget,
              modality: finalModality,
              indication: finalIndication,
              developmentStage: finalStage,
              categories: classification.categories,
              innovationClaim: classification.innovationClaim,
              mechanismOfAction: classification.mechanismOfAction,
              summary: listing?.summary ?? null,
              abstract: listing?.abstract ?? null,
              inventors: listing?.inventors ?? null,
              patentStatus: listing?.patentStatus ?? null,
            });
            await db
              .update(ingestedAssets)
              .set({
                target: finalTarget,
                modality: finalModality,
                indication: finalIndication,
                developmentStage: finalStage,
                ...(classification.categories ? { categories: classification.categories } : {}),
                ...(classification.categoryConfidence !== undefined ? { categoryConfidence: classification.categoryConfidence } : {}),
                ...(classification.innovationClaim ? { innovationClaim: classification.innovationClaim } : {}),
                ...(classification.mechanismOfAction ? { mechanismOfAction: classification.mechanismOfAction } : {}),
                completenessScore: score,
              })
              .where(eq(ingestedAssets.id, id));
          } catch (e: any) {
            console.error(`[manual-import/commit] classify error id=${id}: ${e?.message}`);
          }
        }).catch((e: any) => console.error("[manual-import/commit] classifyBatch error:", e?.message));
      }

      return res.json({ imported, skipped });
    } catch (err: any) {
      console.error("[manual-import/commit] Error:", err);
      return res.status(500).json({ error: err.message ?? "Commit failed" });
    }
  });

  function resolveSubjectTokens(subject: string, assets: Array<{ institution?: string | null }>): string {
    const count = assets.length;
    const institutionCount = new Set(assets.map((a) => a.institution ?? "")).size;
    const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return subject
      .replace(/\{count\}/g, String(count))
      .replace(/\{institution_count\}/g, String(institutionCount))
      .replace(/\{date\}/g, date);
  }

  app.get("/api/admin/dispatch/filter-options", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const rows = await db
        .select({ institution: ingestedAssets.institution, modality: ingestedAssets.modality })
        .from(ingestedAssets)
        .where(eq(ingestedAssets.relevant, true));
      const institutions = Array.from(new Set(rows.map((r) => r.institution).filter(Boolean))).sort();
      const modalities = Array.from(
        new Set(rows.map((r) => r.modality).filter((m): m is string => !!m && m !== "unknown"))
      ).sort();
      return res.json({ institutions, modalities });
    } catch (err: any) {
      console.error("[dispatch/filter-options] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load filter options" });
    }
  });

  app.get("/api/admin/new-discoveries", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const windowHours = Math.max(1, Math.min(8760, Number(req.query.windowHours ?? 168)));
      const parseList = (val: unknown): string[] => {
        if (typeof val === "string" && val) return val.split(",").map((s) => s.trim()).filter(Boolean);
        if (Array.isArray(val)) return (val as string[]).filter((s) => typeof s === "string" && s);
        return [];
      };
      const institutions = parseList(req.query.institutions);
      const modalities = parseList(req.query.modalities);
      const assets = await storage.getNewDiscoveries(windowHours, { institutions, modalities });
      return res.json({ assets, windowHours });
    } catch (err: any) {
      console.error("[new-discoveries] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load discoveries" });
    }
  });

  app.post("/api/admin/dispatch/preview", async (req, res) => {
    try {
      const pw = req.headers["x-admin-password"] ?? req.query.pw;
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const schema = z.object({
        subject: z.string().min(1).max(200),
        assetIds: z.array(z.number().int()).min(1).max(200),
        windowHours: z.number().int().min(1).default(72),
        isTest: z.boolean().default(false),
        colorMode: z.enum(["light", "dark"]).default("light"),
      });

      const { subject, assetIds, windowHours, isTest, colorMode } = schema.parse(req.body);
      const { renderDispatchEmail } = await import("./lib/emailTemplate");

      const selectedAssets = await storage.getAssetsByIds(assetIds);

      const windowOptions: Record<number, string> = {
        24: "Last 24 hours", 48: "Last 48 hours", 72: "Last 72 hours",
        168: "Last 7 days", 336: "Last 14 days", 720: "Last 30 days",
      };
      const windowLabel = windowOptions[windowHours] ?? `${windowHours}h window`;
      const resolvedSubject = resolveSubjectTokens(subject, selectedAssets);
      const html = renderDispatchEmail({ subject: resolvedSubject, assets: selectedAssets, windowLabel, isTest, colorMode });
      return res.json({ html, resolvedSubject });
    } catch (err: any) {
      console.error("[dispatch/preview] Error:", err);
      return res.status(500).json({ error: err.message ?? "Preview failed" });
    }
  });

  app.post("/api/admin/dispatch/send", async (req, res) => {
    try {
      const pw = req.headers["x-admin-password"] ?? req.query.pw;
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const schema = z.object({
        subject: z.string().min(1).max(200),
        recipients: z.array(z.string().email()).max(50).default([]),
        testAddress: z.string().email().optional(),
        assetIds: z.array(z.number().int()).min(1).max(200),
        windowHours: z.number().int().min(1).default(168),
        isTest: z.boolean().default(false),
        colorMode: z.enum(["light", "dark"]).default("light"),
      });

      const body = schema.parse(req.body);
      const { subject, recipients, testAddress, assetIds, windowHours, isTest, colorMode } = body;

      if (!isTest && recipients.length === 0) {
        return res.status(400).json({ error: "At least one recipient required for a non-test dispatch." });
      }
      if (isTest && !testAddress && recipients.length === 0) {
        return res.status(400).json({ error: "Provide a test address or at least one recipient for test sends." });
      }

      const { renderDispatchEmail } = await import("./lib/emailTemplate");
      const selectedAssets = await storage.getAssetsByIds(assetIds);
      if (selectedAssets.length === 0) {
        return res.status(400).json({ error: "None of the selected asset IDs could be found. Please refresh and try again." });
      }

      const windowOptions: Record<number, string> = {
        24: "Last 24 hours", 48: "Last 48 hours", 72: "Last 72 hours",
        168: "Last 7 days", 336: "Last 14 days", 720: "Last 30 days",
      };
      const windowLabel = windowOptions[windowHours] ?? `${windowHours}h window`;
      const resolvedSubject = resolveSubjectTokens(subject, selectedAssets);
      const htmlBody = renderDispatchEmail({ subject: resolvedSubject, assets: selectedAssets, windowLabel, isTest, colorMode });

      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "RESEND_API_KEY is not configured. Add it to your environment secrets to enable email dispatch." });
      }

      const { Resend } = await import("resend");
      const resendClient = new Resend(apiKey);
      const toList = isTest ? [testAddress ?? recipients[0]] : recipients;
      const finalSubject = isTest ? `[TEST] ${resolvedSubject}` : resolvedSubject;

      const { error: sendError } = await resendClient.emails.send({
        from: "EdenRadar Digest <digest@edenradar.com>",
        to: toList,
        subject: finalSubject,
        html: htmlBody,
      });

      if (sendError) {
        console.error("[dispatch/send] Resend error:", sendError);
        return res.status(502).json({ error: `Email provider error: ${sendError.message}` });
      }

      if (!isTest) {
        await storage.createDispatchLog({
          subject: resolvedSubject,
          recipients,
          assetIds,
          assetNames: selectedAssets.map((a) => a.assetName),
          assetSourceUrls: selectedAssets.map((a) => a.sourceUrl ?? ""),
          assetCount: selectedAssets.length,
          windowHours,
          isTest: false,
        });
      }

      return res.json({ ok: true, sentTo: toList.length, isTest });
    } catch (err: any) {
      console.error("[dispatch/send] Error:", err);
      return res.status(500).json({ error: err.message ?? "Dispatch failed" });
    }
  });

  app.get("/api/admin/dispatch/subscribers", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data, error } = await adminSupabase.auth.admin.listUsers({ perPage: 500 });
      if (error) return res.status(500).json({ error: error.message });
      const subscribers = (data?.users ?? [])
        .filter((u) => u.user_metadata?.subscribedToDigest === true)
        .map((u) => ({
          id: u.id,
          username: u.email ?? "",
          effectiveEmail: u.user_metadata?.contactEmail || u.email || "",
        }));
      return res.json({ subscribers });
    } catch (err: any) {
      console.error("[dispatch/subscribers] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load subscribers" });
    }
  });

  app.get("/api/admin/dispatch/subscriber-matches", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const windowHours = Math.max(1, Math.min(8760, Number(req.query.windowHours) || 168));
      const [profileMatches, supabaseSubscribers, windowSummary] = await Promise.all([
        storage.getSubscriberMatches(windowHours),
        (async () => {
          if (!supabaseServiceRoleKey || !supabaseUrl) return [] as Array<{ id: string; email: string }>;
          const { createClient } = await import("@supabase/supabase-js");
          const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
          const { data } = await adminSupabase.auth.admin.listUsers({ perPage: 500 });
          return (data?.users ?? [])
            .filter((u) => u.user_metadata?.subscribedToDigest === true)
            .map((u) => ({ id: u.id, email: u.user_metadata?.contactEmail || u.email || "" }));
        })(),
        storage.getWindowAssetSummary(windowHours),
      ]);
      const profileByUserId = new Map(profileMatches.map((m) => [m.userId, m]));
      const subscribers = supabaseSubscribers.map((s) => {
        const profile = profileByUserId.get(s.id);
        return profile
          ? { ...profile, email: s.email }
          : { userId: s.id, email: s.email, companyName: null, therapeuticAreas: [], modalities: [], dealStages: [], totalMatches: windowSummary.totalCount, top5AssetIds: windowSummary.top5Ids };
      }).sort((a, b) => b.totalMatches - a.totalMatches);
      return res.json({ subscribers, windowHours });
    } catch (err: any) {
      console.error("[dispatch/subscriber-matches]", err);
      return res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  app.get("/api/admin/dispatch/suggestions/:userId", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const { userId } = req.params;
      if (!userId) return res.status(400).json({ error: "userId required" });
      const windowHours = Math.max(1, Math.min(8760, Number(req.query.windowHours) || 168));
      const assets = await storage.getSubscriberSuggestions(userId, windowHours);
      return res.json({ assets, windowHours });
    } catch (err: any) {
      console.error("[dispatch/suggestions]", err);
      return res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  app.get("/api/admin/dispatch/history", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const history = await storage.getDispatchHistory(30);
      return res.json({ history });
    } catch (err: any) {
      console.error("[dispatch/history] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load history" });
    }
  });

  app.get("/api/admin/all-institutions", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const institutions = await storage.getAllInstitutionNames();
      return res.json({ institutions });
    } catch (err: any) {
      console.error("[all-institutions] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load institutions" });
    }
  });


  app.get("/api/admin/platform-stats", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const stats = await storage.getPlatformStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch platform stats" });
    }
  });

  app.get("/api/admin/duplicate-candidates", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const candidates = await storage.getDuplicateCandidates();
      res.json({ candidates, total: candidates.length });
    } catch (err: any) {
      console.error("[duplicate-candidates] Error:", err);
      res.status(500).json({ error: err.message ?? "Failed to load duplicate candidates" });
    }
  });

  app.post("/api/admin/duplicate-candidates/:id/dismiss", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      await storage.dismissDuplicateCandidate(id);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[duplicate-candidates/dismiss] Error:", err);
      res.status(500).json({ error: err.message ?? "Failed to dismiss duplicate" });
    }
  });

  app.post("/api/admin/duplicate-detection/run", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const result = await storage.runNearDuplicateDetection((msg) => console.log(`[dedup] ${msg}`));
      res.json(result);
    } catch (err: any) {
      console.error("[duplicate-detection/run] Error:", err);
      res.status(500).json({ error: err.message ?? "Failed to run duplicate detection" });
    }
  });

  app.get("/api/admin/assets/export-csv", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      function csvEscape(val: unknown): string {
        if (val === null || val === undefined) return "";
        let s = Array.isArray(val) ? JSON.stringify(val) : String(val);
        // Neutralize CSV formula injection: prefix dangerous leading chars with a tab
        if (s.length > 0 && (s[0] === "=" || s[0] === "+" || s[0] === "-" || s[0] === "@" || s[0] === "|" || s[0] === "%")) {
          s = "\t" + s;
        }
        if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\t")) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }

      const HEADERS = ["id","assetName","institution","summary","abstract","target","modality","indication","developmentStage","categories","mechanismOfAction","innovationClaim","unmetNeed","comparableDrugs","licensingReadiness","ipType","completenessScore"];

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="enrichment-${new Date().toISOString().slice(0,10)}.csv"`);
      res.write(HEADERS.join(",") + "\n");

      // Stream rows in batches of 1000 to avoid loading full dataset into memory
      const BATCH = 1000;
      let offset = 0;
      while (true) {
        const batch = await db
          .select({
            id: ingestedAssets.id,
            assetName: ingestedAssets.assetName,
            institution: ingestedAssets.institution,
            summary: ingestedAssets.summary,
            abstract: ingestedAssets.abstract,
            target: ingestedAssets.target,
            modality: ingestedAssets.modality,
            indication: ingestedAssets.indication,
            developmentStage: ingestedAssets.developmentStage,
            categories: ingestedAssets.categories,
            mechanismOfAction: ingestedAssets.mechanismOfAction,
            innovationClaim: ingestedAssets.innovationClaim,
            unmetNeed: ingestedAssets.unmetNeed,
            comparableDrugs: ingestedAssets.comparableDrugs,
            licensingReadiness: ingestedAssets.licensingReadiness,
            ipType: ingestedAssets.ipType,
            completenessScore: ingestedAssets.completenessScore,
          })
          .from(ingestedAssets)
          .orderBy(ingestedAssets.id)
          .limit(BATCH)
          .offset(offset);

        for (const r of batch) {
          res.write([
            r.id, csvEscape(r.assetName), csvEscape(r.institution), csvEscape(r.summary),
            csvEscape(r.abstract), csvEscape(r.target), csvEscape(r.modality), csvEscape(r.indication),
            csvEscape(r.developmentStage), csvEscape(r.categories), csvEscape(r.mechanismOfAction),
            csvEscape(r.innovationClaim), csvEscape(r.unmetNeed), csvEscape(r.comparableDrugs),
            csvEscape(r.licensingReadiness), csvEscape(r.ipType), csvEscape(r.completenessScore),
          ].join(",") + "\n");
        }

        offset += batch.length;
        if (batch.length < BATCH) break;
      }

      res.end();
    } catch (err: any) {
      console.error("[export-csv] Error:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message ?? "Export failed" });
      else res.end();
    }
  });

  app.post("/api/admin/assets/bulk-update", async (req, res) => {
    try {
      const pw = req.query.pw ?? req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });

      const rowSchema = z.object({
        id: z.number().int(),
        assetName: z.string().optional(),
        institution: z.string().optional(),
        summary: z.string().optional(),
        abstract: z.string().optional(),
        target: z.string().optional(),
        modality: z.string().optional(),
        indication: z.string().optional(),
        developmentStage: z.string().optional(),
        categories: z.array(z.string()).optional(),
        mechanismOfAction: z.string().optional(),
        innovationClaim: z.string().optional(),
        unmetNeed: z.string().optional(),
        comparableDrugs: z.string().optional(),
        licensingReadiness: z.string().optional(),
        ipType: z.string().optional(),
        completenessScore: z.number().optional(),
      });

      // Accept a raw JSON array of rows
      const body = req.body;
      if (!Array.isArray(body)) {
        return res.status(400).json({ error: "Request body must be a JSON array of row objects" });
      }
      if (body.length === 0 || body.length > 50000) {
        return res.status(400).json({ error: `Array must have 1-50000 rows (got ${body.length})` });
      }

      // Per-row validation — invalid rows are skipped, not batch-fatal
      const validRows: z.infer<typeof rowSchema>[] = [];
      const skippedDetails: Array<{ index: number; id?: number; reason: string }> = [];
      for (let idx = 0; idx < body.length; idx++) {
        const parsed = rowSchema.safeParse(body[idx]);
        if (!parsed.success) {
          skippedDetails.push({ index: idx, id: body[idx]?.id, reason: parsed.error.issues.map((i: z.ZodIssue) => i.message).join("; ") });
        } else {
          validRows.push(parsed.data);
        }
      }

      const result = validRows.length > 0
        ? await storage.bulkUpdateAssetsFromCsv(validRows)
        : { updated: 0, skipped: 0, notFoundIds: [] as number[] };

      // Merge unknown-ID skips into skippedDetails
      const notFoundDetails = result.notFoundIds.map((id) => ({
        index: -1 as number,
        id,
        reason: "ID not found in database",
      }));
      const allSkipped = [...skippedDetails, ...notFoundDetails];

      res.json({
        ok: true,
        updated: result.updated,
        skipped: result.skipped + skippedDetails.length,
        validationSkipped: skippedDetails.length,
        notFoundCount: result.notFoundIds.length,
        skippedDetails: allSkipped.slice(0, 100),
      });
    } catch (err: any) {
      console.error("[bulk-update] Error:", err);
      res.status(500).json({ error: err.message ?? "Bulk update failed" });
    }
  });

  const DEFAULT_INDUSTRY_PROFILE = {
    userName: "", companyName: "", companyType: "",
    therapeuticAreas: [], dealStages: [], modalities: [], onboardingDone: false,
  };

  app.get("/api/industry/profile", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const userRole = req.headers["x-user-role"] as string;
      if (!userId) return res.status(400).json({ error: "Missing user id" });
      if (userRole !== "industry") return res.status(403).json({ error: "Industry role required" });
      const profile = await storage.getIndustryProfileByUserId(userId);
      return res.json({ profile: profile ?? DEFAULT_INDUSTRY_PROFILE });
    } catch (err: any) {
      console.error("[industry/profile GET]", err);
      return res.status(500).json({ error: "Failed to load profile" });
    }
  });

  app.put("/api/industry/profile", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const userRole = req.headers["x-user-role"] as string;
      if (!userId) return res.status(400).json({ error: "Missing user id" });
      if (userRole !== "industry") return res.status(403).json({ error: "Industry role required" });
      const schema = z.object({
        userName: z.string().default(""),
        companyName: z.string().default(""),
        companyType: z.string().default(""),
        therapeuticAreas: z.array(z.string()).default([]),
        dealStages: z.array(z.string()).default([]),
        modalities: z.array(z.string()).default([]),
        onboardingDone: z.boolean().default(false),
        notificationPrefs: z.object({ frequency: z.enum(["realtime", "daily", "weekly"]) }).nullable().default(null),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      const isNewProfile = !(await storage.getIndustryProfileByUserId(userId));
      const profile = await storage.upsertIndustryProfile(userId, parsed.data);
      if (isNewProfile && supabaseServiceRoleKey && supabaseUrl) {
        (async () => {
          try {
            const { createClient } = await import("@supabase/supabase-js");
            const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
            const { data: authUser } = await adminSupabase.auth.admin.getUserById(userId);
            const email = authUser?.user?.email;
            if (email) {
              await sendWelcomeEmail(email, profile.userName ?? "");
            }
          } catch (emailErr) {
            console.error("[email] Welcome email failed:", emailErr);
          }
        })();
      }
      return res.json({ profile });
    } catch (err: any) {
      console.error("[industry/profile PUT]", err);
      return res.status(500).json({ error: "Failed to save profile" });
    }
  });

  app.get("/api/admin/industry-profiles", async (req, res) => {
    try {
      const pw = req.headers["x-admin-password"];
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const profiles = await storage.getAllIndustryProfiles();
      return res.json({ profiles });
    } catch (err: any) {
      console.error("[admin/industry-profiles]", err);
      return res.status(500).json({ error: "Failed to load profiles" });
    }
  });

  app.patch("/api/users/subscribe", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(400).json({ error: "Missing user id" });
      const schema = z.object({ subscribedToDigest: z.boolean() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
      const { subscribedToDigest } = parsed.data;
      const sbUrl = process.env.VITE_SUPABASE_URL ?? "";
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
      if (!sbUrl || !sbKey) return res.status(500).json({ error: "Supabase not configured" });
      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient(sbUrl, sbKey);
      const { data: existing, error: fetchErr } = await admin.auth.admin.getUserById(userId);
      if (fetchErr || !existing?.user) return res.status(404).json({ error: "User not found" });
      const { data, error } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: { ...existing.user.user_metadata, subscribedToDigest },
      });
      if (error) return res.status(500).json({ error: error.message });
      // Also persist to industry_profiles so alertDispatch can query it directly
      await storage.setIndustryProfileSubscription(userId, subscribedToDigest).catch(() => {});
      return res.json({ subscribedToDigest: data.user.user_metadata?.subscribedToDigest ?? false });
    } catch (err: any) {
      console.error("[users/subscribe]", err);
      return res.status(500).json({ error: err.message ?? "Failed to update subscription" });
    }
  });

  app.patch("/api/users/notification-prefs", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const userRole = req.headers["x-user-role"] as string;
      if (!userId) return res.status(400).json({ error: "Missing user id" });
      if (userRole !== "industry") return res.status(403).json({ error: "Industry role required" });
      const schema = z.object({ frequency: z.enum(["realtime", "daily", "weekly"]) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
      const existing = await storage.getIndustryProfileByUserId(userId);
      const base = existing ?? {
        userName: "", companyName: "", companyType: "",
        therapeuticAreas: [], dealStages: [], modalities: [],
        onboardingDone: false, notificationPrefs: null,
      };
      const updated = await storage.upsertIndustryProfile(userId, {
        ...base,
        notificationPrefs: { frequency: parsed.data.frequency },
      });
      return res.json({ notificationPrefs: updated.notificationPrefs });
    } catch (err: any) {
      console.error("[users/notification-prefs]", err);
      return res.status(500).json({ error: err.message ?? "Failed to save prefs" });
    }
  });

  app.post("/api/admin/alerts/dispatch", async (req, res) => {
    try {
      const pw = req.headers["x-admin-password"] ?? req.body?.adminPassword;
      if (pw !== "eden") return res.status(401).json({ error: "Unauthorized" });
      const { runAlertDispatch } = await import("./lib/alertDispatch.js");
      const result = await runAlertDispatch();
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[admin/alerts/dispatch]", err);
      return res.status(500).json({ error: err.message ?? "Dispatch failed" });
    }
  });

  return httpServer;
}
