import crypto from "crypto";
import type { Express } from "express";
import { createServer, type Server } from "http";
import mammoth from "mammoth";
import { storage } from "./storage";
import { insertDiscoveryCardSchema, insertResearchProjectSchema, insertSavedReferenceSchema, insertSavedGrantSchema, insertConceptCardSchema, conceptCards, conceptInterests, researchProjects, type InsertResearchProject, type IngestedAsset, ingestedAssets, pipelineLists, savedAssets, insertManualInstitutionSchema } from "@shared/schema";
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
import { scoreAssets } from "./lib/pipeline/scoreAssets";
import { generateReport } from "./lib/pipeline/generateReport";
import { generateDossier } from "./lib/pipeline/generateDossier";
import { isFatalOpenAIError } from "./lib/llm";
import type { BuyerProfile, ScoredAsset } from "./lib/types";
import { z } from "zod";
import { runIngestionPipeline, isIngestionRunning, getEnrichingCount, getScrapingProgress, getUpsertProgress, isSyncRunning, getSyncRunningFor, runInstitutionSync, tryAcquireSyncLock, releaseSyncLock } from "./lib/ingestion";
import { getSchedulerStatus, startScheduler, pauseScheduler, bumpToFront, setDelay } from "./lib/scheduler";
import { ALL_SCRAPERS } from "./lib/scrapers/index";
import { reEnrichAsset } from "./lib/scrapers/enrichAsset";
import { deepEnrichBatch } from "./lib/pipeline/deepEnrichBatch";
import { embedAssets } from "./lib/pipeline/embedAssets";
import { embedQuery, ragQuery, directQuery, aggregationQuery, isConversational, isAggregationQuery, resolveAggregationQuery, fetchPortfolioStats, parseQueryFilters, hasMeaningfulFilters, getOrUpdateSessionFocus, GEO_INSTITUTION_REGEX, type UserContext, type SessionFocusContext } from "./lib/eden/rag";
import { verifyResearcherAuth, verifyConceptAuth, verifyAnyAuth } from "./lib/supabaseAuth";
import { ALL_PORTAL_ROLES } from "@shared/portals";
import type { RawSignal } from "./lib/types";

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

      let signals = await collectAllSignals(enrichedQuery, effectiveSources, maxPerSource);

      signals = applySignalFilters(signals, { sourceType, dateRange, trialPhase, field, technologyType });
      signals = signals.slice(0, 150);

      if (signals.length === 0) {
        await storage.createSearchHistory({ query, source: effectiveSources.join(","), resultCount: 0 });
        return res.json({ assets: [], query, sources: effectiveSources, signalsFound: 0 });
      }

      let normalized: Partial<import("./lib/types").ScoredAsset>[];
      try {
        normalized = await normalizeSignals(signals);
      } catch (normErr) {
        console.error("normalizeSignals failed, falling back to raw signals:", normErr);
        normalized = signals.map((s) => ({
          id: crypto.randomUUID().slice(0, 8),
          asset_name: s.title?.slice(0, 80) || "unknown",
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

      return res.json({
        assets: scored,
        query,
        sources: effectiveSources,
        signalsFound: signals.length,
        assetsFound: scored.length,
      });
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
        limit: z.number().int().min(1).max(100).default(50),
        since: z.string().optional(),
        before: z.string().optional(),
      });
      const { query, minSimilarity, modality, stage, indication, institution, limit, since, before } = schema.parse(req.body);
      const sinceDate = since && !isNaN(Date.parse(since)) ? new Date(since) : undefined;
      const beforeDate = before && !isNaN(Date.parse(before)) ? new Date(before) : undefined;

      const embedding = await embedQuery(query);
      const results = await storage.scoutVectorSearch(embedding, {
        modality, stage, indication, institution, limit, minSimilarity, since: sinceDate, before: beforeDate,
      });

      const TIER1_UNIVERSITIES = ["MIT", "Stanford", "Harvard", "UCSF", "Johns Hopkins", "Columbia", "Yale", "Penn", "Duke", "Cornell"];
      const EARLY_STAGES = ["preclinical", "phase 1", "phase-1", "phase i", "phase 2", "phase-2", "phase ii"];

      const assets: ScoredAsset[] = results.map((r) => {
        const sim = r.similarity ?? 0;
        // Floor-lifted: sim 0.40 → score 40, sim 1.00 → score 100; quality bonuses max +10
        const baseScore = Math.round(40 + ((sim - 0.40) / 0.60) * 60);
        const stageLower = (r.developmentStage ?? "").toLowerCase();
        const instLower  = (r.institution ?? "").toLowerCase();
        const bonuses =
          (TIER1_UNIVERSITIES.some((u) => instLower.includes(u.toLowerCase())) ? 3 : 0) +
          (r.developmentStage && r.developmentStage !== "unknown" ? 2 : 0) +
          (EARLY_STAGES.some((s) => stageLower.includes(s)) ? 2 : 0) +
          (r.licensingReadiness && r.licensingReadiness !== "unknown" ? 2 : 0) +
          (r.modality && r.modality !== "unknown" ? 1 : 0);
        const score = Math.max(0, Math.min(100, baseScore + bonuses));
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
          score,
          score_breakdown: { freshness: 0, novelty: bonuses, readiness: 0, licensability: 0, fit: baseScore, competition: 0, total: score },
          latest_signal_date: "",
          matching_tags: [],
          evidence_count: 1,
          confidence: score >= 75 ? "high" : score >= 55 ? "medium" : "low",
          signals: [],
          owner_name: r.institution,
          owner_type: "university" as const,
          patent_status: "unknown",
          licensing_status: r.licensingReadiness ?? "unknown",
        };
      });

      await storage.createSearchHistory({ query, source: "scout_tto", resultCount: assets.length });

      return res.json({ assets, query, assetsFound: assets.length, sources: ["tech_transfer"] });
    } catch (err: any) {
      console.error("[scout/search] Error:", err);
      return res.status(500).json({ error: err.message ?? "Search failed" });
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
      const [stats, recentSearches, recentAssets, therapyAreaCountResult, institutionCountResult, reviewCount, weeklyNewResult] = await Promise.all([
        fetchPortfolioStats(),
        storage.getSearchHistory(8),
        db.select({
          id: ingestedAssets.id,
          assetName: ingestedAssets.assetName,
          institution: ingestedAssets.institution,
          modality: ingestedAssets.modality,
          indication: ingestedAssets.indication,
          firstSeenAt: ingestedAssets.firstSeenAt,
        })
        .from(ingestedAssets)
        .orderBy(desc(ingestedAssets.firstSeenAt))
        .limit(8),
        db.execute(sql`SELECT COUNT(DISTINCT LOWER(indication))::int AS n FROM ingested_assets WHERE indication IS NOT NULL AND indication != '' AND indication != 'unknown'`),
        db.execute(sql`SELECT COUNT(DISTINCT institution)::int AS n FROM ingested_assets WHERE institution IS NOT NULL AND institution != ''`),
        db.execute(sql`SELECT COUNT(*)::int AS n FROM review_queue WHERE status = 'pending'`),
        db.execute(sql`SELECT COUNT(*)::int AS n FROM ingested_assets WHERE first_seen_at >= NOW() - INTERVAL '7 days'`),
      ]);
      const therapyAreaCount = Number((therapyAreaCountResult.rows[0] as Record<string, unknown>)?.n ?? 0);
      const institutionCount = Number((institutionCountResult.rows[0] as Record<string, unknown>)?.n ?? 0);
      const assetsInReview = Number((reviewCount.rows[0] as Record<string, unknown>)?.n ?? 0);
      const weeklyNew = Number((weeklyNewResult.rows[0] as Record<string, unknown>)?.n ?? 0);
      return res.json({ stats, recentSearches, recentAssets, therapyAreaCount, institutionCount, assetsInReview, weeklyNew });
    } catch (err: any) {
      console.error("[dashboard/stats] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load stats" });
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
      const rawPl = req.query.pipelineListId;
      let pipelineListId: number | null | undefined = undefined;
      if (rawPl === "null") pipelineListId = null;
      else if (rawPl !== undefined) {
        const parsed = parseInt(rawPl as string, 10);
        if (!isNaN(parsed)) pipelineListId = parsed;
      }
      const assets = await storage.getSavedAssets(pipelineListId);
      res.json({ assets });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch saved assets" });
    }
  });

  app.post("/api/saved-assets", async (req, res) => {
    try {
      const body = saveAssetBodySchema.parse(req.body);
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
      });
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

  app.get("/api/pipelines", async (_req, res) => {
    try {
      const lists = await storage.getPipelineLists();
      const all = await storage.getSavedAssets();
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
      const { name } = z.object({ name: z.string().min(1).max(100) }).parse(req.body);
      const list = await storage.createPipelineList({ name });
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
      });
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
        ucsf: "University of California San Francisco",
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
      };
      const name = SLUG_TO_NAME[req.params.slug];
      if (!name) return res.status(404).json({ error: "Institution not found" });
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

      const allInstitutionNames = ALL_SCRAPERS.map((s) => s.institution);

      const healthData = await storage.getCollectorHealthData();
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

      const rows = allInstitutionNames.map((name) => {
        const dbRow = instMap.get(name);
        const totalInDb = dbRow?.totalInDb ?? 0;
        const biotechRelevant = dbRow?.biotechRelevant ?? 0;
        const instSessions = sessionsByInstitution.get(name) ?? [];
        const session = instSessions[0] ?? null;

        let consecutiveFailures = 0;
        for (const s of instSessions) {
          if (s.status === "failed") {
            consecutiveFailures++;
          } else {
            break;
          }
        }

        let health: "ok" | "degraded" | "failing" | "stale" | "syncing" | "never";
        if (!session) {
          health = "never";
        } else if (session.status === "running") {
          const heartbeat = session.lastRefreshedAt ?? session.createdAt;
          const elapsed = now - new Date(heartbeat).getTime();
          health = elapsed > STALE_THRESHOLD_MS ? "stale" : "syncing";
        } else if (session.status === "failed") {
          health = consecutiveFailures >= 3 ? "failing" : "degraded";
        } else if (session.status === "enriched" || session.status === "completed" || session.status === "pushed") {
          health = "ok";
        } else {
          health = "degraded";
        }

        return {
          institution: name,
          totalInDb,
          biotechRelevant,
          lastSyncAt: session?.completedAt ?? session?.createdAt ?? null,
          lastSyncStatus: session?.status ?? null,
          lastSyncError: session?.errorMessage ?? null,
          rawCount: session?.rawCount ?? 0,
          newCount: session?.newCount ?? 0,
          relevantCount: session?.relevantCount ?? 0,
          phase: session?.phase ?? null,
          sessionId: session?.sessionId ?? null,
          consecutiveFailures,
          health,
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
    const result = pauseScheduler();
    res.json(result);
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

      if (isSyncRunning() && getSyncRunningFor() === institution) {
        releaseSyncLock();
      }

      res.json({ ok: true, message: `Session for ${institution} cancelled` });
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

      if (!tryAcquireSyncLock(institution)) {
        return res.status(409).json({ error: `Sync already running for ${getSyncRunningFor()}` });
      }

      const sessionId = crypto.randomUUID();
      res.json({ message: "Sync started", institution, sessionId });

      runInstitutionSync(institution, sessionId).catch((err) => {
        console.error(`[sync] Background sync failed for ${institution}:`, err?.message);
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
      if (session.rawCount === 0) return res.status(400).json({ error: "Cannot push — scraper returned 0 results (connection may be broken)" });

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

  (async () => {
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
  })();

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
      const [coverage, embeddingCoverage, latest, needingDeepEnrich] = await Promise.all([
        storage.getDeepEnrichmentCoverage(),
        storage.getEmbeddingCoverage(),
        storage.getLatestDeepEnrichmentJob(),
        storage.getAssetsNeedingDeepEnrichCount(),
      ]);
      res.json({
        coverage,
        embeddingCoverage,
        latestJob: latest ?? null,
        needingDeepEnrich,
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
      const assets = await storage.getAssetsNeedingDeepEnrich();
      if (assets.length === 0) return res.json({ message: "All relevant assets already deeply enriched", total: 0 });

      edenTotal = assets.length;
      edenProcessed = 0;
      edenRunning = true;
      edenShouldStop = false;

      edenImproved = 0;
      edenFailed = 0;

      const job = await storage.createDeepEnrichmentJob(assets.length);
      edenJobId = job.id;

      res.json({ message: "Deep enrichment started", jobId: job.id, total: assets.length });

      deepEnrichBatch(
        assets,
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

  (async () => {
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
            remaining,
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
  })();

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

  // ── EDEN chat routes ──────────────────────────────────────────────────────

  const INSTITUTION_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
    { pattern: /\bstanford\b/i, name: "stanford" },
    { pattern: /\bmit\b|\bmassachusetts\s+institute\b/i, name: "mit" },
    { pattern: /\bharvard\b/i, name: "harvard" },
    { pattern: /\bcolumbia\b/i, name: "columbia" },
    { pattern: /\byale\b/i, name: "yale" },
    { pattern: /\bjohns\s+hop+kins\b/i, name: "johns hopkins" },
    { pattern: /\bduke\b/i, name: "duke" },
    { pattern: /\bucsf\b/i, name: "ucsf" },
    { pattern: /\bucla\b/i, name: "ucla" },
    { pattern: /\bcaltech\b|\bcalifornia\s+institute\s+of\s+tech/i, name: "caltech" },
    { pattern: /\bcornell\b/i, name: "cornell" },
    { pattern: /\bprinceton\b/i, name: "princeton" },
    { pattern: /\bupenn\b|\buniversity\s+of\s+pennsylvania\b/i, name: "university of pennsylvania" },
    { pattern: /\buniversity\s+of\s+michigan\b/i, name: "university of michigan" },
    { pattern: /\buniversity\s+of\s+toronto\b/i, name: "university of toronto" },
    { pattern: /\buniversity\s+of\s+oxford\b|\boxford\s+university\b/i, name: "university of oxford" },
    { pattern: /\buniversity\s+of\s+cambridge\b|\bcambridge\s+university\b/i, name: "university of cambridge" },
    { pattern: /\bwustl\b|\bwashington\s+university\b/i, name: "washington university" },
    { pattern: /\buc\s+san\s+diego\b|\bucsd\b/i, name: "uc san diego" },
    { pattern: /\buc\s+davis\b/i, name: "uc davis" },
    { pattern: /\buc\s+berkeley\b|\bberkeley\b/i, name: "uc berkeley" },
    { pattern: /\bpitt\b|\buniversity\s+of\s+pittsburgh\b/i, name: "university of pittsburgh" },
    { pattern: /\bemory\b/i, name: "emory" },
    { pattern: /\bvanderbi?lt\b/i, name: "vanderbilt" },
    { pattern: /\bgeorgetown\b/i, name: "georgetown" },
    { pattern: /\bnorthwestern\b/i, name: "northwestern" },
    { pattern: /\bnyu\b|\bnew\s+york\s+university\b/i, name: "new york university" },
    { pattern: /\bbaylor\b/i, name: "baylor" },
    { pattern: /\btufts\b/i, name: "tufts" },
  ];
  function detectInstitutionKeyword(query: string): string | null {
    for (const { pattern, name } of INSTITUTION_PATTERNS) {
      if (pattern.test(query)) return name;
    }
    return null;
  }

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
          console.error("[eden] Portfolio stats preload failed — count answers may be degraded:", err?.message ?? err);
          return undefined;
        }),
      ]);
      const history = (session.messages ?? []).map((t) => ({ role: t.role, content: t.content }));

      await storage.appendEdenMessage(sid, { role: "user", content: message.trim() });

      // ── Session focus context + filter extraction ────────────────────────
      const focusContext = getOrUpdateSessionFocus(sid, message.trim());
      const filters = parseQueryFilters(message.trim(), focusContext);
      const filtersActive = hasMeaningfulFilters(filters);
      const geoRx: string | undefined = filters.geography ? GEO_INSTITUTION_REGEX[filters.geography] : undefined;

      // isAggregationQuery MUST be checked before isConversational — short count
      // phrases like "what's the total" and "give me a count" have no biotech signals
      // and would be misclassified as conversational, bypassing the SQL count path.
      const aggQuery = isAggregationQuery(message.trim());
      const chat = !aggQuery && isConversational(message.trim());

      if (chat) {
        sendEvent("context", { sessionId: sid, assets: [] });

        let fullResponse = "";
        for await (const token of directQuery(message.trim(), history, ctx, portfolioStats, focusContext)) {
          fullResponse += token;
          sendEvent("token", { text: token });
        }

        await storage.appendEdenMessage(sid, {
          role: "assistant",
          content: fullResponse,
          assetIds: [],
          assets: [],
        });
      } else if (aggQuery) {
        // ── Step 1: Structural/breakdown queries via deterministic SQL ────
        // Handles: institution COUNT(DISTINCT), institution-specific asset count,
        // newest-by-institution, stage breakdown, area→institution breakdown.
        // Generic count phrases ("how many do you have", "what's the total") and
        // modality scalar counts ("how many gene therapy assets") intentionally
        // return null here — they are handled by filteredCount in Step 2.
        const resolvedResult = await resolveAggregationQuery(message.trim(), filters, geoRx).catch(() => null);
        if (resolvedResult) {
          sendEvent("context", { sessionId: sid, assets: [] });
          let fullResponse = "";
          for await (const token of aggregationQuery(message.trim(), resolvedResult, history, ctx, portfolioStats, focusContext)) {
            fullResponse += token;
            sendEvent("token", { text: token });
          }
          await storage.appendEdenMessage(sid, {
            role: "assistant",
            content: fullResponse,
            assetIds: [],
            assets: [],
          });
          sendEvent("done", { sessionId: sid });
          return;
        }

        // ── Step 2: SQL COUNT for all remaining count intents ─────────────
        // Runs unconditionally — filteredCount with no active filters returns
        // the total asset count; with filters it returns the constrained count.
        // Covers: "how many gene therapy assets" (modality filter from query),
        // "what's the total" (no filters → total), "give me a count",
        // "how many do you have" (session filters → filtered count), etc.
        const count = await storage.filteredCount(
          geoRx,
          filters.modality,
          filters.stage,
          filters.indication,
          filters.institution
        ).catch(() => null);

        if (count !== null) {
          const filterDesc = [
            filters.geography ? `${filters.geography.toUpperCase()} institution` : "",
            filters.modality || "",
            filters.stage || "",
            filters.indication || "",
            filters.institution || "",
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
          await storage.appendEdenMessage(sid, {
            role: "assistant",
            content: fullResponse,
            assetIds: [],
            assets: [],
          });
          sendEvent("done", { sessionId: sid });
          return;
        }

        // ── Fall through to RAG ───────────────────────────────────────────
        const institutionName = detectInstitutionKeyword(message.trim());
        const [queryEmbedding, institutionAssets] = await Promise.all([
          embedQuery(message.trim()),
          institutionName ? storage.searchIngestedAssetsByInstitution(institutionName, 8) : Promise.resolve([] as import("./storage").RetrievedAsset[]),
        ]);

        let allSemantic: import("./storage").RetrievedAsset[];
        if (filtersActive) {
          allSemantic = await storage.filteredSemanticSearch(queryEmbedding, geoRx, filters.modality, filters.stage, filters.indication, filters.institution, 15);
        } else {
          allSemantic = await storage.semanticSearch(queryEmbedding, 15);
        }

        const threshold = institutionName ? 0.38 : 0.45;
        const institutionIds = new Set(institutionAssets.map((a) => a.id));
        const retrieved = [
          ...institutionAssets,
          ...allSemantic.filter((a) => a.similarity > threshold && !institutionIds.has(a.id)),
        ].slice(0, 15);
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
          assetIds: retrieved.map((a) => a.id), assets: assetPayload,
        });
      } else {
        const institutionName = detectInstitutionKeyword(message.trim());
        const [queryEmbedding, institutionAssets] = await Promise.all([
          embedQuery(message.trim()),
          institutionName ? storage.searchIngestedAssetsByInstitution(institutionName, 8) : Promise.resolve([] as import("./storage").RetrievedAsset[]),
        ]);

        let allSemantic: import("./storage").RetrievedAsset[];
        if (filtersActive) {
          allSemantic = await storage.filteredSemanticSearch(queryEmbedding, geoRx, filters.modality, filters.stage, filters.indication, filters.institution, 15);
        } else {
          allSemantic = await storage.semanticSearch(queryEmbedding, 15);
        }

        const threshold = institutionName ? 0.38 : 0.45;
        const institutionIds = new Set(institutionAssets.map((a) => a.id));
        const retrieved = [
          ...institutionAssets,
          ...allSemantic.filter((a) => a.similarity > threshold && !institutionIds.has(a.id)),
        ].slice(0, 15);

        const assetPayload = retrieved.map((a) => ({
          id: a.id,
          assetName: a.assetName,
          institution: a.institution,
          indication: a.indication,
          modality: a.modality,
          developmentStage: a.developmentStage,
          ipType: a.ipType,
          sourceName: a.sourceName,
          sourceUrl: a.sourceUrl,
          similarity: Math.round(a.similarity * 100) / 100,
        }));

        sendEvent("context", { sessionId: sid, assets: assetPayload });

        let fullResponse = "";
        for await (const token of ragQuery(message.trim(), retrieved, history, ctx, portfolioStats, focusContext)) {
          fullResponse += token;
          sendEvent("token", { text: token });
        }

        await storage.appendEdenMessage(sid, {
          role: "assistant",
          content: fullResponse,
          assetIds: retrieved.map((a) => a.id),
          assets: assetPayload,
        });
      }

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

  app.get("/api/browse/assets", async (req, res) => {
    try {
      const therapyArea = req.query.therapyArea as string | undefined;
      const institution = req.query.institution as string | undefined;
      const modality = req.query.modality as string | undefined;
      const stage = req.query.stage as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      const conditions = [eq(ingestedAssets.relevant, true)];
      if (therapyArea) {
        conditions.push(sql`${ingestedAssets.categories}::jsonb @> ${JSON.stringify([therapyArea])}::jsonb`);
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
        .orderBy(sql`${ingestedAssets.firstSeenAt} desc`);

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
        })
        .from(researchProjects)
        .where(eq(researchProjects.publishToIndustry, true))
        .orderBy(desc(researchProjects.lastEditedAt));
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
      await db
        .update(researchProjects)
        .set({ adminStatus })
        .where(eq(researchProjects.id, Number(id)));
      res.json({ ok: true, id: Number(id), adminStatus });
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
        role: u.user_metadata?.role ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
      }));
      res.json({ users });
    } catch (err: any) {
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
        return res.json({ assets: [], literature: [], noResults: true });
      }
      res.json({ assets, literature });
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

  app.get("/api/alerts", async (_req, res) => {
    try {
      const alerts = await storage.listUserAlerts();
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
      const alert = await storage.createUserAlert({
        name: name ?? null,
        query: query ?? null,
        modalities: modalities ?? null,
        stages: stages ?? null,
        institutions: institutions ?? null,
      });
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

      const [newAssetRows, newConceptRows, newProjectRows] = await Promise.all([
        db
          .select({
            id: ingestedAssets.id,
            institution: ingestedAssets.institution,
            assetName: ingestedAssets.assetName,
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
      ]);

      const institutionMap = new Map<string, { count: number; sampleAssets: Array<{ id: number; name: string }> }>();
      for (const row of newAssetRows) {
        const inst = row.institution || "Unknown";
        const existing = institutionMap.get(inst) ?? { count: 0, sampleAssets: [] };
        existing.count++;
        if (existing.sampleAssets.length < 5) existing.sampleAssets.push({ id: row.id, name: row.assetName });
        institutionMap.set(inst, existing);
      }

      const byInstitution = Array.from(institutionMap.entries())
        .map(([institution, { count, sampleAssets }]) => ({ institution, count, sampleAssets }))
        .sort((a, b) => b.count - a.count);

      const windowHours = Math.round((Date.now() - since.getTime()) / 3600000);
      res.json({
        newAssets: { total: newAssetRows.length, byInstitution },
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

    const PARSE_PROMPT = `You are a biotech technology transfer analyst. Extract every distinct licensable asset from the provided TTO (Technology Transfer Office) content for institution: ${institution}.

Return ONLY valid JSON with a single key "assets" containing an array (up to 200 items). Each item must have these fields:
- name: the technology/asset name as listed (string)
- description: 2-3 sentence summary of the technology (string, "" if not determinable)
- sourceUrl: URL of this specific listing if visible (string, "" if not)
- inventors: array of inventor names if listed (string[], [] if none stated)
- patentStatus: one of "patented", "patent pending", "provisional", "unknown"
- technologyId: technology ID or case number if visible (string, "" if not)
- contactEmail: contact email if listed (string, "" if not)
- target: molecular or biological target if determinable, e.g. "EGFR", "PD-1" ("unknown" if not stated)
- modality: one of "small molecule", "antibody", "gene therapy", "cell therapy", "peptide", "vaccine", "nanoparticle", "medical device", "diagnostic", "platform technology", "research tool", "unknown"
- indication: disease or condition being targeted ("unknown" if not stated)
- developmentStage: one of "discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved", "unknown"
- abstract: full description text from listing if visible (string, "" if not)
- categories: array of 2-4 therapeutic area tags e.g. ["oncology", "immunotherapy"] ([] if not determinable)
- innovationClaim: 1-sentence key innovation ("unknown" if not clear)
- mechanismOfAction: brief MoA description ("unknown" if not stated)

If multiple assets appear, return each as a separate array item. If only one asset, return a one-item array.`;

    try {
      const messageParts: any[] = [{ type: "text", text: PARSE_PROMPT }];

      for (const file of imageFiles) {
        const b64 = file.buffer.toString("base64");
        messageParts.push({ type: "image_url", image_url: { url: `data:${file.mimetype};base64,${b64}`, detail: "high" as const } });
      }

      if (combinedText) {
        messageParts.push({ type: "text", text: `\n\n---\nContent:\n${combinedText.slice(0, 16000)}` });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: messageParts }],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 4096,
      });

      const aiContent = response.choices[0]?.message?.content ?? "";
      let parsedJson: any;
      try { parsedJson = JSON.parse(aiContent); } catch { return res.status(500).json({ error: "AI returned invalid JSON" }); }

      const rawAssets: any[] = Array.isArray(parsedJson?.assets) ? parsedJson.assets
        : Array.isArray(parsedJson) ? parsedJson : [];

      const assets = rawAssets.slice(0, 200).map((a: any) => {
        const name: string = String(a.name || "Unknown Asset");
        const description: string = String(a.description || "");
        const sourceUrl: string = String(a.sourceUrl || "");
        const inventors: string[] = Array.isArray(a.inventors) ? a.inventors.map(String) : [];
        const patentStatus: string = String(a.patentStatus || "unknown");
        const technologyId: string = String(a.technologyId || "");
        const contactEmail: string = String(a.contactEmail || "");
        const target: string = String(a.target || "unknown");
        const modality: string = String(a.modality || "unknown");
        const indication: string = String(a.indication || "unknown");
        const developmentStage: string = String(a.developmentStage || "unknown");
        const abstract: string = String(a.abstract || "");
        const categories: string[] = Array.isArray(a.categories) ? a.categories.map(String) : [];
        const innovationClaim: string = String(a.innovationClaim || "unknown");
        const mechanismOfAction: string = String(a.mechanismOfAction || "unknown");

        return { name, description, sourceUrl, inventors, patentStatus, technologyId, contactEmail, target, modality, indication, developmentStage, abstract, categories, innovationClaim, mechanismOfAction };
      });

      return res.json({ assets, institution });
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
        abstract: null as string | null,
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
              summary: stored?.summary ?? null,
              abstract: stored?.abstract ?? null,
              inventors: stored?.inventors ?? null,
              patentStatus: stored?.patentStatus ?? null,
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
                enrichedAt: new Date(),
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

  return httpServer;
}
