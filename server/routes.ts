import crypto from "crypto";
import { captureException as sentryCaptureException } from "./lib/sentry";
import rateLimit from "express-rate-limit";
import { cacheGet, cacheSet } from "./lib/responseCache";
import type { Express } from "express";
import { createServer, type Server } from "http";
import mammoth from "mammoth";
import { storage } from "./storage";
import { insertDiscoveryCardSchema, insertResearchProjectSchema, insertSavedReferenceSchema, insertSavedGrantSchema, insertConceptCardSchema, conceptCards, conceptInterests, researchProjects, userAlerts, type UserAlert, type InsertResearchProject, type IngestedAsset, ingestedAssets, pipelineLists, savedAssets, insertManualInstitutionSchema, SAVED_ASSET_STATUSES, sharedLinks, industryProfiles, appEvents, marketEois, marketListings, marketAvailabilityNotifications, marketSavedSearches, insertMarketSavedSearchSchema, institutionMetadata, emailUnsubscribes } from "@shared/schema";
import { slugifyInstitutionName } from "./lib/institutionSeed";
import { db } from "./db";
import { eq, and, sql, desc, or, ilike, inArray, gte, gt, count as drizzleCount, isNull } from "drizzle-orm";
import { computeCompletenessScore } from "./lib/pipeline/contentHash";
import { makeFingerprint } from "./lib/ingestion";
import { classifyBatch, classifyAsset } from "./lib/pipeline/classifyAsset";
import OpenAI from "openai";
import Stripe from "stripe";
import multer from "multer";
import { dataSources, collectAllSignals, collectAllSignalsWithDiag, ALL_SOURCE_KEYS, withHardTimeout, type SourceKey, type SourceDiag } from "./lib/sources/index";
import { searchPatents } from "./lib/sources/patents";
import { searchClinicalTrials } from "./lib/sources/clinicaltrials";
import { normalizeSignals } from "./lib/pipeline/normalizeSignals";
import { clusterAssets } from "./lib/pipeline/clusterAssets";
import { scoreAssets, scoreFreshness, scoreNovelty, scoreReadiness, scoreLicensability, scoreCompetition, computeTotal, CONFIDENCE_AWARE_RANKING_ENABLED, CONFIDENCE_FLOOR } from "./lib/pipeline/scoreAssets";
import { generateReport } from "./lib/pipeline/generateReport";
import { generateDossier } from "./lib/pipeline/generateDossier";
import { isFatalOpenAIError } from "./lib/llm";
import type { BuyerProfile, ScoredAsset } from "./lib/types";
import { z } from "zod";
import { runIngestionPipeline, isIngestionRunning, getEnrichingCount, getScrapingProgress, getUpsertProgress, isSyncRunning, getSyncRunningFor, getActiveSyncs, runInstitutionSync, tryAcquireSyncLock, releaseSyncLock } from "./lib/ingestion";
import { getSchedulerStatus, startScheduler, pauseScheduler, resetAndStartScheduler, bumpToFront, setDelay, invalidateHealthCacheEntry, startTierOnly, setConcurrency, getMaxHttpConcurrent, getScraperHealthCache, cancelCurrentSync, isTransientDbError } from "./lib/scheduler";
import { getAllScraperHealth, clearScraperBackoff, updateScraperHealth } from "./lib/scraperState";
import { ALL_SCRAPERS, getScraperTier } from "./lib/scrapers/index";
import { deepEnrichBatch } from "./lib/pipeline/deepEnrichBatch";
import { embedAssets } from "./lib/pipeline/embedAssets";
import { embedQuery, ragQuery, directQuery, aggregationQuery, isConversational, isAggregationQuery, resolveAggregationQuery, fetchPortfolioStats, parseQueryFilters, hasMeaningfulFilters, getOrUpdateSessionFocus, GEO_INSTITUTION_REGEX, detectInstitutionName, detectAllInstitutionNames, isDefinitionalQuery, detectBackReference, extractBackRefPosition, extractBackRefInstitution, rerankAssets, persistSessionFocus, seedSessionFocusFromDb, conceptQuery, deriveEngagementSignals, markEngagementReset, isEngagementResetMessage, isComparativeQuery, compareQuery, type UserContext, type SessionFocusContext } from "./lib/eden/rag";
import { verifyResearcherAuth, verifyConceptAuth, verifyAnyAuth, tryGetUserId, requireAdmin, getAdminUser } from "./lib/supabaseAuth";
import { hasMarketRead, getMarketAccessState } from "./lib/marketAccess";
import {
  getEffectiveMarketAccess,
  getUserMarketEntitlement,
  setUserMarketEntitlement,
  syncOrgMembersMarketEntitlement,
  userHasMarketRead,
} from "./lib/marketEntitlement";
import { registerClient, unregisterClient, broadcastToOrg, registerUserClient, unregisterUserClient, broadcastToUsers } from "./lib/orgBroadcast";
import { ALL_PORTAL_ROLES } from "@shared/portals";
import type { RawSignal } from "./lib/types";
import { sendWelcomeEmail, sendTeamInviteEmail, sendAccountDeletionEmail, sendSubscriptionWelcomeEmail, sendPaymentFailedEmail, sendRenewalConfirmationEmail, sendMarketMutualInterestEmail, sendMarketNdaSignedEmail, sendDealRoomMessageEmail, sendDealRoomDocumentEmail, sendMarketGraceNoticeEmail, APP_URL, sendEmail, sendMarketAdHocEmail, sendAdminNotificationEmail, verifyUnsubscribeToken, verifyUnsubscribeTokenForEmail, unsubscribeUrlForEmail, FROM_DIGEST } from "./email";

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
  patentSince: z.enum(["6m", "2024", "2023", "2022"]).optional(),
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

// ── Rate limiters ─────────────────────────────────────────────────────────────
// Applied only to the four AI-backed endpoints that hit OpenAI and are
// expensive to abuse. Limits are intentionally generous — a real user
// clicking through the app will never approach them.
const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,       // 1-minute rolling window
  max: 10,                   // 10 requests per IP per minute
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — please wait a moment before trying again." },
});

// In-memory throttle for deal-room message notifications: at most one email
// per (dealId, recipientId) per hour. Server restarts reset the window — an
// acceptable trade-off given the alternative is a DB write on every send.
const dealMessageEmailLastSent = new Map<string, number>();

// ── Admin /relevance/eval per-row probability cache ──────────────────────
// The eval endpoint scores up to 20k holdout rows + sweeps 9 thresholds.
// All of that is a pure function of (row text, classifier weights), so we
// memoize the per-row probability + v1 keep-decision. activeThreshold and
// the threshold sweep are derived from the cached probs in O(N) per call.
// Invalidated when buildRelevanceHoldout runs (membership change) or when
// CLASSIFIER_VERSION changes (weights/keywords change).
type RelevanceEvalCache = {
  key: string;
  scored: Array<{ label: boolean; prob: number; v1Kept: boolean }>;
  holdoutSize: number;
};
let relevanceEvalCache: RelevanceEvalCache | null = null;
function relevanceEvalCacheKey(classifierVersion: string, weightsSig: string): string {
  // Per-row scores depend on BOTH the static feature/keyword version (bumped
  // by engineers when extractFeatures changes) and the active tuned weights
  // (which can change on every /weights/tune call). Including the weights
  // signature in the cache key means a tune is reflected on the next admin
  // /relevance/eval click without needing a manual invalidate.
  return `cv=${classifierVersion}|w=${weightsSig}`;
}
function invalidateRelevanceEvalCache(): void {
  relevanceEvalCache = null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Admin "Act as user" impersonation (Task #736):
  //  1. impersonationReadOnlyGate — global write-block for read-only sessions
  //     (catches every non-GET request including those that don't go through
  //     verifyAnyAuth, e.g. routes using tryGetUserId for identity).
  //  2. impersonationAuditMiddleware — per-request audit log writer; no-op
  //     unless x-impersonation-session-id is set.
  {
    const {
      stripSpoofableHeaders,
      impersonationContext,
      impersonationAuditMiddleware,
    } = await import("./lib/impersonation");
    // Order matters:
    //  1. stripSpoofableHeaders removes any client-supplied identity headers
    //     (x-user-*, x-impersonation-session-id, x-admin-*, etc.) so only
    //     trusted server middleware can populate them.
    //  2. impersonationContext resolves the session and stamps both the
    //     server-internal marker (Symbol) and the identity headers.
    //  3. impersonationAuditMiddleware records every /api/* request that has
    //     the trusted marker.
    app.use(stripSpoofableHeaders);
    app.use(impersonationContext);
    app.use(impersonationAuditMiddleware);
  }

  app.get("/api/sources", (_req, res) => {
    const sources = Object.values(dataSources).map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
    }));
    res.json({ sources });
  });

  app.post("/api/search", aiRateLimit, async (req, res) => {
    try {
      const { query, sources, maxPerSource, buyerProfile, field, sourceType, dateRange, technologyType, trialPhase, patentSince } = searchBodySchema.parse(req.body);
      const validSources = sources.filter((s): s is SourceKey => s in dataSources) as SourceKey[];
      const effectiveSources = validSources.length > 0 ? validSources : ALL_SOURCES;
      const searchUserId = await tryGetUserId(req);

      const enrichedQuery = [query, field, technologyType].filter(Boolean).join(" ");

      const profileFingerprint = buyerProfile
        ? crypto.createHash("sha256").update(JSON.stringify(buyerProfile)).digest("hex").slice(0, 16)
        : "default";
      const searchCacheKey = `search:${enrichedQuery}:${[...effectiveSources].sort().join(",")}:${maxPerSource ?? ""}:${field ?? ""}:${sourceType ?? ""}:${dateRange ?? ""}:${technologyType ?? ""}:${trialPhase ?? ""}:${patentSince ?? ""}:${profileFingerprint}`;
      const cachedSearch = cacheGet<object>(searchCacheKey);
      if (cachedSearch) return res.json(cachedSearch);

      // Compute date bounds for server-side patent pre-filtering
      let patentSinceDate: string | undefined;
      let patentBeforeDate: string | undefined;
      if (patentSince) {
        const now = new Date();
        if (patentSince === "6m") {
          const d = new Date(now.getTime() - 183 * 24 * 60 * 60 * 1000);
          patentSinceDate = d.toISOString().slice(0, 10);
        } else if (patentSince === "2024") {
          patentSinceDate = "2024-01-01";
        } else if (patentSince === "2023") {
          patentSinceDate = "2023-01-01";
          patentBeforeDate = "2024-01-01";
        } else if (patentSince === "2022") {
          patentBeforeDate = "2023-01-01";
        }
      }

      // Always call searchPatents and searchClinicalTrials directly, bypassing
      // collectAllSignals entirely. collectAllSignals wraps every source with a
      // 3,500ms timeout — far too short for USPTO (5–10s) or ClinicalTrials.gov
      // (up to 12s). Both have their own timeout budgets and are called in parallel.
      const patentInSources = effectiveSources.includes("patents" as SourceKey);
      const trialInSources = effectiveSources.includes("clinicaltrials" as SourceKey);
      const nonDirectSources = effectiveSources.filter(
        (s) => s !== ("patents" as SourceKey) && s !== ("clinicaltrials" as SourceKey)
      );

      const directDiag: SourceDiag[] = [];
      const timedDirect = async (
        key: "patents" | "clinicaltrials",
        run: () => Promise<RawSignal[]>,
      ): Promise<RawSignal[]> => {
        const t0 = Date.now();
        try {
          const out = await withHardTimeout(run(), 4000, key);
          directDiag.push({ source: key, ms: Date.now() - t0, status: out.length === 0 ? "empty" : "ok", count: out.length });
          return out;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`[search] ${key} dropped:`, msg);
          directDiag.push({ source: key, ms: Date.now() - t0, status: msg.includes("timed out") ? "timeout" : "error", count: 0, error: msg });
          return [];
        }
      };

      const [collected, patentSignals, trialSignals] = await Promise.all([
        collectAllSignalsWithDiag(enrichedQuery, nonDirectSources, maxPerSource),
        patentInSources ? timedDirect("patents", () => searchPatents(enrichedQuery, maxPerSource, patentSinceDate, patentBeforeDate)) : Promise.resolve([] as RawSignal[]),
        trialInSources ? timedDirect("clinicaltrials", () => searchClinicalTrials(enrichedQuery, maxPerSource)) : Promise.resolve([] as RawSignal[]),
      ]);
      const signals = collected.signals;
      const sourceDiagnostics: SourceDiag[] = [...collected.diagnostics, ...directDiag];
      const filteredOther = applySignalFilters(signals, { sourceType, dateRange, trialPhase, field, technologyType });
      const filteredPatents = applySignalFilters(patentSignals, { sourceType, dateRange, trialPhase, field, technologyType });
      const filteredTrials = applySignalFilters(trialSignals, { sourceType, dateRange, trialPhase, field, technologyType });

      // Fair-share the signal cap so that patents and clinical trials always
      // get to contribute results, instead of being starved by a flood of TTO/article
      // signals that come first in the concat order. Reserve PATENT_RESERVE/TRIAL_RESERVE
      // slots out of TOTAL_CAP for them; the rest goes to the other sources; any
      // unused reservation is redistributed below.
      // TOTAL_CAP is sized to fit normalize/score within the per-step hard budgets;
      // raising it past ~80 starts to push normalizeSignals beyond its 2s window.
      const TOTAL_CAP = 80;
      const PATENT_RESERVE = 20;
      const TRIAL_RESERVE = 20;
      const patentsKept = filteredPatents.slice(0, PATENT_RESERVE);
      const trialsKept = filteredTrials.slice(0, TRIAL_RESERVE);
      const otherBudget = TOTAL_CAP - patentsKept.length - trialsKept.length;
      const otherKept = filteredOther.slice(0, otherBudget);
      let combinedSignals = [...otherKept, ...patentsKept, ...trialsKept];
      if (combinedSignals.length < TOTAL_CAP) {
        const usedIds = new Set(combinedSignals.map((s) => s.id));
        for (const extra of [...filteredPatents.slice(PATENT_RESERVE), ...filteredTrials.slice(TRIAL_RESERVE), ...filteredOther.slice(otherBudget)]) {
          if (combinedSignals.length >= TOTAL_CAP) break;
          if (usedIds.has(extra.id)) continue;
          combinedSignals.push(extra);
          usedIds.add(extra.id);
        }
      }

      if (combinedSignals.length === 0) {
        await storage.createSearchHistory({ query, source: effectiveSources.join(","), resultCount: 0, userId: searchUserId ?? null });
        const emptySearchResponse = { assets: [], query, sources: effectiveSources, signalsFound: 0 };
        cacheSet(searchCacheKey, emptySearchResponse, 5 * 60 * 1000);
        return res.json(emptySearchResponse);
      }

      let normalized: Partial<import("./lib/types").ScoredAsset>[];
      try {
        normalized = await withHardTimeout(normalizeSignals(combinedSignals), 2000, "normalizeSignals");
      } catch (normErr) {
        console.error("normalizeSignals failed/timed out, falling back to raw signals:", normErr instanceof Error ? normErr.message : normErr);
        normalized = combinedSignals.map((s) => ({
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

      // Task #695: hydrate per-asset category_confidence + asset_class from
      // ingested_assets where any of the asset's source URLs match a row we've
      // already classified. This lets scoreAssets() apply the full
      // confidence-aware formula (min(category_confidence, coverage)) on the
      // /api/search path instead of silently falling back to coverage-only,
      // matching the behavior of /api/scout/search and /api/scout/recently-added.
      // Assets without a matching ingested row keep category_confidence
      // undefined and scoreAssets's existing coverage-only fallback applies.
      try {
        const allUrls = Array.from(new Set(
          clustered.flatMap((a) => a.source_urls ?? []).filter((u): u is string => typeof u === "string" && u.length > 0)
        ));
        if (allUrls.length > 0) {
          const hydrationRows = await db.execute(sql`
            SELECT source_url, category_confidence, asset_class
            FROM ingested_assets
            WHERE source_url = ANY(${allUrls}::text[])
              AND (category_confidence IS NOT NULL OR asset_class IS NOT NULL)
          `);
          const urlToMeta = new Map<string, { categoryConfidence: number | undefined; assetClass: string | null }>();
          for (const row of hydrationRows.rows as Record<string, unknown>[]) {
            const url = typeof row.source_url === "string" ? row.source_url : null;
            if (!url) continue;
            const cc = row.category_confidence != null && !Number.isNaN(parseFloat(String(row.category_confidence)))
              ? Math.max(0, Math.min(1, parseFloat(String(row.category_confidence))))
              : undefined;
            const ac = typeof row.asset_class === "string" && row.asset_class ? row.asset_class : null;
            const existing = urlToMeta.get(url);
            // If multiple ingested rows share a URL, keep the highest confidence.
            if (!existing || (cc !== undefined && (existing.categoryConfidence === undefined || cc > existing.categoryConfidence))) {
              urlToMeta.set(url, { categoryConfidence: cc, assetClass: ac ?? existing?.assetClass ?? null });
            } else if (existing && existing.assetClass == null && ac) {
              urlToMeta.set(url, { ...existing, assetClass: ac });
            }
          }
          if (urlToMeta.size > 0) {
            for (const a of clustered) {
              let bestConf: number | undefined;
              let bestClass: string | null | undefined;
              for (const u of a.source_urls ?? []) {
                const meta = urlToMeta.get(u);
                if (!meta) continue;
                if (meta.categoryConfidence !== undefined && (bestConf === undefined || meta.categoryConfidence > bestConf)) {
                  bestConf = meta.categoryConfidence;
                }
                if (!bestClass && meta.assetClass) bestClass = meta.assetClass;
              }
              if (bestConf !== undefined && a.category_confidence === undefined) {
                a.category_confidence = bestConf;
              }
              if (bestClass && !a.asset_class) {
                a.asset_class = bestClass;
              }
            }
          }
        }
      } catch (hydrateErr) {
        console.warn("[search] category_confidence hydration failed, falling back to coverage-only:", hydrateErr);
      }

      let scored: import("./lib/types").ScoredAsset[];
      try {
        const userOffsets = searchUserId
          ? await storage.getUserClassOffsets(searchUserId).catch(() => ({}))
          : undefined;
        scored = await withHardTimeout(scoreAssets(clustered, profile, userOffsets), 1500, "scoreAssets");
      } catch (scoreErr) {
        console.error("scoreAssets failed/timed out, returning clustered results without scores:", scoreErr instanceof Error ? scoreErr.message : scoreErr);
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

      await storage.createSearchHistory({ query, source: effectiveSources.join(","), resultCount: scored.length, userId: searchUserId ?? null });

      const searchResponse = {
        assets: scored,
        query,
        sources: effectiveSources,
        signalsFound: signals.length,
        assetsFound: scored.length,
        sourceDiagnostics,
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
      const scoutUserId = await tryGetUserId(req);
      const schema = z.object({
        // Allow empty query when at least one filter is provided (e.g. browsing
        // by modality/stage/institution from an Alerts "Explore matches" link).
        query: z.string().max(500).default(""),
        minSimilarity: z.number().min(0.40).max(1).default(0.40),
        modality: z.string().optional(),
        stage: z.string().optional(),
        indication: z.string().optional(),
        institution: z.string().optional(),
        // Multi-value lists (used by Alerts "Explore matches" links).
        // Each list is OR'd within itself; lists are AND'd across each other.
        modalities: z.array(z.string()).optional(),
        stages: z.array(z.string()).optional(),
        institutions: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(200).default(100),
        since: z.string().optional(),
        before: z.string().optional(),
      });
      const { query, minSimilarity, modality, stage, indication, institution, modalities, stages, institutions, limit, since, before } = schema.parse(req.body);
      const hasAnyFilter = !!(modality || stage || indication || institution || since || before
        || (modalities && modalities.length) || (stages && stages.length) || (institutions && institutions.length));
      if (!query.trim() && !hasAnyFilter) {
        return res.json({ assets: [], query, assetsFound: 0, sources: ["tech_transfer"], fallback: false });
      }
      const sinceDate = since && !isNaN(Date.parse(since)) ? new Date(since) : undefined;
      const beforeDate = before && !isNaN(Date.parse(before)) ? new Date(before) : undefined;

      let results: import("./storage").RetrievedAsset[] = [];

      const searchOpts = {
        modality, stage, indication, institution,
        modalities: modalities && modalities.length ? modalities : undefined,
        stages: stages && stages.length ? stages : undefined,
        institutions: institutions && institutions.length ? institutions : undefined,
        since: sinceDate, before: beforeDate,
      };
      results = await storage.keywordSearchIngestedAssets(query, limit, searchOpts);

      // Debug surface (#761 step 5): when an internal flag/header is set,
      // surface the synonym expansion so we can verify which groups fired.
      // Off by default so the production payload is unchanged.
      const debugRequested = req.header("x-eden-search-debug") === "1";
      let searchDebug: {
        expanded_terms: { source: string; members: string[]; negated: boolean }[];
        stripped_stopwords: string[];
        original_query: string;
      } | undefined;
      if (debugRequested && query.trim()) {
        const { expandQuery } = await import("./lib/biotechSynonyms");
        const exp = expandQuery(query);
        searchDebug = {
          expanded_terms: exp.groups.map((g) => ({ source: g.source, members: g.members, negated: g.negated })),
          stripped_stopwords: exp.strippedStopwords,
          original_query: exp.original,
        };
      }

      // Exact-name guarantee: compute a normalized form of both the query and
      // each result's asset_name so we can pin/boost rows whose name contains
      // the full query string (case + punctuation insensitive). This protects
      // against the confidence gate burying a real exact match.
      // Mirrors storage SQL normalization (lower → strip non [a-z0-9 -] →
      // collapse whitespace → trim) so route-level pin/exemption is symmetric
      // with the SQL exact_name_match flag computed in keywordSearchIngestedAssets.
      const normalizeText = (s: string) =>
        s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
      const normalizedQuery = normalizeText(query);
      const exactNameIds = new Set<number>();
      if (normalizedQuery) {
        for (const r of results) {
          const n = normalizeText(r.assetName ?? "");
          if (n && (n === normalizedQuery || n.includes(normalizedQuery))) {
            exactNameIds.add(r.id);
          }
        }
      }

      // Default policy: ON in non-prod, OFF in prod unless flag explicitly set.
      const _flagRaw = (process.env.EDEN_CONFIDENCE_AWARE_RANKING ?? "").toLowerCase();
      const _isProd = (process.env.NODE_ENV ?? "").toLowerCase() === "production";
      const CONFIDENCE_AWARE =
        _flagRaw === "true" ? true : _flagRaw === "false" ? false : !_isProd;
      const CONF_FLOOR = 0.4;
      const LOW_CONF = 0.5;

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

        const { total: rawTotal, signal_coverage, scored_dimensions, dimension_basis } = computeTotal(dimResults);

        // ── Confidence-aware ranking (Task #693) — applied here too because the
        // scout path scores inline without going through scoreAssets().
        const catConf = typeof r.categoryConfidence === "number"
          ? Math.max(0, Math.min(1, r.categoryConfidence))
          : undefined;
        const coverageNorm = signal_coverage / 100;
        const confidenceFactor = catConf !== undefined ? Math.min(catConf, coverageNorm) : coverageNorm;
        const total = CONFIDENCE_AWARE
          ? Math.max(0, Math.min(100, Math.round(rawTotal * (CONF_FLOOR + (1 - CONF_FLOOR) * confidenceFactor))))
          : rawTotal;
        const confidence: "high" | "medium" | "low" =
          confidenceFactor >= 0.75 ? "high" : confidenceFactor >= 0.5 ? "medium" : "low";

        return {
          id: String(r.id),
          asset_name: r.assetName,
          target: r.target ?? "unknown",
          modality: r.modality ?? "unknown",
          indication: r.indication ?? "unknown",
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
            confidence_factor: Math.round(confidenceFactor * 100) / 100,
            ...(catConf !== undefined ? { category_confidence: catConf } : {}),
            ...(typeof r.textRelevance === "number" ? { text_relevance: Math.round(r.textRelevance * 1000) / 1000 } : {}),
          },
          latest_signal_date: "",
          matching_tags: [],
          evidence_count: 1,
          confidence,
          ...(catConf !== undefined ? { category_confidence: catConf } : {}),
          asset_class: r.assetClass ?? null,
          signals: [],
          owner_name: r.institution,
          owner_type: "university" as const,
          patent_status: "unknown",
          licensing_status: r.licensingReadiness ?? "unknown",
          stage_changed_at: r.stageChangedAt ? r.stageChangedAt.toISOString() : null,
          previous_stage: r.previousStage ?? null,
          dataSparse: r.dataSparse ?? false,
        };
      });

      // Final ordering:
      //   1. Exact-name matches pinned to the top (carried over from #759).
      //   2. For queried searches, FTS text_relevance (ts_rank_cd from Tier 1,
      //      task #760) drives the primary order so the strongest text matches
      //      come first regardless of completeness/recency. Score is the
      //      tiebreaker.
      //   3. For filter-only browsing (no query), text_relevance is 0 for all
      //      rows so the existing score-first behavior is preserved.
      const hasQuery = !!query.trim();
      const isExact = (a: ScoredAsset) => exactNameIds.has(Number(a.id));
      const textRel = (a: ScoredAsset) => a.score_breakdown?.text_relevance ?? 0;
      assets.sort((a, b) => {
        const ax = isExact(a) ? 1 : 0;
        const bx = isExact(b) ? 1 : 0;
        if (ax !== bx) return bx - ax;
        if (hasQuery) {
          const dr = textRel(b) - textRel(a);
          if (Math.abs(dr) > 1e-6) return dr;
        }
        return b.score - a.score;
      });

      // Top-5 confidence gate: push low-confidence assets out of the top 5
      // when 5+ higher-confidence alternatives exist (flag-gated). Exact-name
      // matches are exempt — they stay in the high bucket so a real text hit
      // is never demoted below unrelated higher-confidence rows.
      if (CONFIDENCE_AWARE && assets.length > 5) {
        const isLow = (a: ScoredAsset) =>
          !isExact(a) && (a.score_breakdown?.confidence_factor ?? 1) < LOW_CONF;
        const highCount = assets.reduce((n, a) => n + (isLow(a) ? 0 : 1), 0);
        if (highCount >= 5) {
          const high: ScoredAsset[] = [];
          const low: ScoredAsset[] = [];
          for (const a of assets) (isLow(a) ? low : high).push(a);
          assets.length = 0;
          assets.push(...high, ...low);
        }
      }

      await storage.createSearchHistory({ query, source: "scout_tto", resultCount: assets.length, userId: scoutUserId ?? null }).catch(() => {});

      return res.json({
        assets,
        query,
        assetsFound: assets.length,
        sources: ["tech_transfer"],
        fallback: false,
        ...(searchDebug ? { debug: searchDebug } : {}),
      });
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
          first_seen_at, category_confidence, asset_class
        FROM ingested_assets
        WHERE relevant = true AND completeness_score >= 0.4
        ORDER BY first_seen_at DESC NULLS LAST
        LIMIT 12
      `);
      const assets = (rows.rows as Record<string, unknown>[]).map((r) => {
        const institution = typeof r.institution === "string" ? r.institution : String(r.institution ?? "");
        const developmentStage = typeof r.development_stage === "string" ? r.development_stage : String(r.development_stage ?? "");
        const licensingReadiness = typeof r.licensing_readiness === "string" ? r.licensing_readiness : null;
        const firstSeenAt = r.first_seen_at ? String(r.first_seen_at) : null;
        const sourceUrl = typeof r.source_url === "string" ? r.source_url : null;
        const catConfRaw = r.category_confidence;
        const catConf = catConfRaw != null && !Number.isNaN(parseFloat(String(catConfRaw)))
          ? Math.max(0, Math.min(1, parseFloat(String(catConfRaw))))
          : undefined;
        const assetClass = typeof r.asset_class === "string" && r.asset_class ? r.asset_class : null;

        // Inline confidence-aware scoring (Task #695) — mirrors /api/scout/search
        // so the same asset shows the same score & confidence pill on every screen.
        const partialAsset: Partial<ScoredAsset> = {
          development_stage: developmentStage,
          licensing_status: licensingReadiness ?? "unknown",
          owner_name: institution,
          owner_type: "university",
          source_types: ["tech_transfer"],
          latest_signal_date: firstSeenAt ?? "",
          evidence_count: 1,
          patent_status: "unknown",
        };

        const freshnessResult = firstSeenAt
          ? scoreFreshness(partialAsset)
          : { score: 0, hasData: false, basis: "No signal date available" };
        const noveltyResult = scoreNovelty(partialAsset);
        const readinessResult = scoreReadiness(partialAsset);
        const licensabilityResult = scoreLicensability(partialAsset);
        const competitionResult = scoreCompetition(partialAsset);
        const fitResult = { score: 0, hasData: false, basis: "No buyer profile configured" };

        const dimResults = {
          freshness: freshnessResult,
          novelty: noveltyResult,
          readiness: readinessResult,
          licensability: licensabilityResult,
          fit: fitResult,
          competition: competitionResult,
        };

        const { total: rawTotal, signal_coverage, scored_dimensions, dimension_basis } = computeTotal(dimResults);

        const coverageNorm = signal_coverage / 100;
        const confidenceFactor = catConf !== undefined ? Math.min(catConf, coverageNorm) : coverageNorm;
        const total = CONFIDENCE_AWARE_RANKING_ENABLED
          ? Math.max(0, Math.min(100, Math.round(rawTotal * (CONFIDENCE_FLOOR + (1 - CONFIDENCE_FLOOR) * confidenceFactor))))
          : rawTotal;
        const confidence: "high" | "medium" | "low" =
          confidenceFactor >= 0.75 ? "high" : confidenceFactor >= 0.5 ? "medium" : "low";

        return {
          id: String(r.id),
          asset_name: typeof r.asset_name === "string" ? r.asset_name : String(r.asset_name ?? ""),
          target: typeof r.target === "string" ? r.target : String(r.target ?? ""),
          modality: typeof r.modality === "string" ? r.modality : String(r.modality ?? ""),
          indication: typeof r.indication === "string" ? r.indication : String(r.indication ?? ""),
          development_stage: developmentStage,
          institution,
          summary: typeof r.summary === "string" ? r.summary : null,
          source_url: sourceUrl,
          source_name: typeof r.source_name === "string" ? r.source_name : null,
          completeness_score: r.completeness_score != null ? parseFloat(String(r.completeness_score)) : null,
          licensing_readiness: licensingReadiness,
          ip_type: typeof r.ip_type === "string" ? r.ip_type : null,
          innovation_claim: typeof r.innovation_claim === "string" ? r.innovation_claim : null,
          stage_changed_at: r.stage_changed_at ? String(r.stage_changed_at) : null,
          previous_stage: typeof r.previous_stage === "string" ? r.previous_stage : null,
          first_seen_at: firstSeenAt,
          score: total,
          score_breakdown: {
            freshness: freshnessResult.score,
            novelty: noveltyResult.score,
            readiness: readinessResult.score,
            licensability: licensabilityResult.score,
            fit: fitResult.score,
            competition: competitionResult.score,
            total,
            signal_coverage,
            scored_dimensions,
            dimension_basis,
            confidence_factor: Math.round(confidenceFactor * 100) / 100,
            ...(catConf !== undefined ? { category_confidence: catConf } : {}),
          },
          owner_name: institution,
          owner_type: "university" as const,
          patent_status: "unknown",
          licensing_status: licensingReadiness ?? "unknown",
          why_it_matters: typeof r.innovation_claim === "string" ? r.innovation_claim : "",
          source_urls: sourceUrl ? [sourceUrl] : [],
          source_types: ["tech_transfer" as const],
          latest_signal_date: firstSeenAt ?? "",
          matching_tags: [],
          evidence_count: 1,
          confidence,
          ...(catConf !== undefined ? { category_confidence: catConf } : {}),
          asset_class: assetClass,
          signals: [],
        };
      });

      // Preserve recency ordering (already sorted by first_seen_at DESC) — this
      // is a "what's new" feed, not a ranked search. The confidence pill and
      // confidence-aware score are still surfaced per asset, but we deliberately
      // do NOT apply applyTopKConfidenceGate here because that helper partitions
      // the entire list and would push older high-confidence rows above newer
      // low-confidence rows, breaking the recency contract of this endpoint.
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
        LIMIT 2000
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

  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const dashUserId = await tryGetUserId(req);
      const [stats, recentSearches, recentAssets, institutionCountResult, reviewCount, weeklyNewResult] = await Promise.all([
        fetchPortfolioStats(),
        storage.getSearchHistory(8, dashUserId ?? undefined),
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

  app.get("/api/pipeline-lists/summary", async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const userOrg = await storage.getOrgForUser(userId);
      const orgId = userOrg?.id ?? null;

      // Pipeline lists query: scope to the calling user and their org (if any)
      const listsQuery = orgId
        ? sql`
          SELECT pl.id, pl.name, COUNT(sa.id)::int AS asset_count
          FROM pipeline_lists pl
          LEFT JOIN saved_assets sa ON sa.pipeline_list_id = pl.id
          WHERE pl.user_id = ${userId} OR pl.org_id = ${orgId}
          GROUP BY pl.id, pl.name
          ORDER BY pl.created_at DESC
        `
        : sql`
          SELECT pl.id, pl.name, COUNT(sa.id)::int AS asset_count
          FROM pipeline_lists pl
          LEFT JOIN saved_assets sa ON sa.pipeline_list_id = pl.id
          WHERE pl.user_id = ${userId}
          GROUP BY pl.id, pl.name
          ORDER BY pl.created_at DESC
        `;

      const [lists, totalSavedResult, institutionCountResult, typeCountsResult] = await Promise.all([
        db.execute(listsQuery),
        db.execute(sql`SELECT COUNT(*)::int AS n FROM saved_assets WHERE user_id = ${userId}`),
        db.execute(sql`
          SELECT COUNT(DISTINCT COALESCE(ia.institution, sa.source_journal))::int AS n
          FROM saved_assets sa
          LEFT JOIN ingested_assets ia ON ia.id = sa.ingested_asset_id
          WHERE sa.user_id = ${userId}
            AND COALESCE(ia.institution, sa.source_journal) IS NOT NULL
            AND COALESCE(ia.institution, sa.source_journal) != ''
            AND COALESCE(ia.institution, sa.source_journal) != 'unknown'
        `),
        // ── By-the-Numbers type breakdown (Task #743) ────────────────────────
        // Buckets the user's saved assets by ingested_assets.source_type.
        // Mapping (single source of truth — extend here when adding sources):
        //   patents          → 'patent'
        //   researchStudies  → 'paper', 'preprint'
        //   clinicalTrials   → 'clinical_trial'
        // Rows with no linked ingested_asset (legacy saves) fall through and
        // are excluded from these three counts (per task spec).
        db.execute(sql`
          SELECT
            SUM(CASE WHEN ia.source_type = 'patent' THEN 1 ELSE 0 END)::int AS patents,
            SUM(CASE WHEN ia.source_type IN ('paper','preprint') THEN 1 ELSE 0 END)::int AS research_studies,
            SUM(CASE WHEN ia.source_type = 'clinical_trial' THEN 1 ELSE 0 END)::int AS clinical_trials
          FROM saved_assets sa
          JOIN ingested_assets ia ON ia.id = sa.ingested_asset_id
          WHERE sa.user_id = ${userId}
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
      const tcRow = (typeCountsResult.rows[0] as Record<string, unknown> | undefined) ?? {};
      const typeCounts = {
        patents: Number(tcRow.patents ?? 0),
        researchStudies: Number(tcRow.research_studies ?? 0),
        clinicalTrials: Number(tcRow.clinical_trials ?? 0),
      };
      return res.json({ lists: pipelineSummaryLists, totalPipelines, totalSavedAssets, institutionCount, typeCounts });
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
      logAppEvent("pipeline_brief_generated", { listId, assetCount: assets.length });
      return res.json({ brief, assetCount: assets.length, pipelineName });
    } catch (err: any) {
      console.error("[pipeline-lists/brief] Error:", err);
      return res.status(500).json({ error: friendlyOpenAIError(err) });
    }
  });

  app.post("/api/report", aiRateLimit, async (req, res) => {
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
      const reportUserId = await tryGetUserId(req).catch(() => null);
      const reportUserOffsets = reportUserId
        ? await storage.getUserClassOffsets(reportUserId).catch(() => ({}))
        : undefined;
      const scored = await scoreAssets(clustered, profile, reportUserOffsets);
      const report = await generateReport(scored, query, profile);
      logAppEvent("report_generated", { assetCount: scored.length });
      return res.json(report);
    } catch (err: any) {
      console.error("Report error:", err);
      sentryCaptureException(err);
      return res.status(500).json({ error: friendlyOpenAIError(err) });
    }
  });

  const savedReportBodySchema = z.object({
    title: z.string().min(1).max(300),
    query: z.string().min(1),
    assetsJson: z.array(z.record(z.unknown())).default([]),
    reportJson: z.record(z.unknown()).default({}),
  });

  app.post("/api/saved-reports", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const parseResult = savedReportBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
      }
      const report = await storage.createSavedReport({ userId, ...parseResult.data });
      return res.status(201).json(report);
    } catch (err: any) {
      console.error("[saved-reports POST]", err);
      return res.status(500).json({ error: "Failed to save report" });
    }
  });

  app.get("/api/saved-reports", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const reports = await storage.getSavedReports(userId);
      return res.json(reports);
    } catch (err: any) {
      console.error("[saved-reports GET]", err);
      return res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  app.delete("/api/saved-reports/:id", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const id = parseInt(req.params["id"] as string, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid report id" });
      await storage.deleteSavedReport(id, userId);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[saved-reports DELETE]", err);
      return res.status(500).json({ error: "Failed to delete report" });
    }
  });

  app.post("/api/dossier", aiRateLimit, async (req, res) => {
    try {
      const { asset } = dossierBodySchema.parse(req.body);
      if (!asset) return res.status(400).json({ error: "Asset required" });
      const dossier = await generateDossier(asset as ScoredAsset);
      logAppEvent("dossier_opened", { institution: (asset as ScoredAsset).institution ?? null });
      return res.json(dossier);
    } catch (err: any) {
      console.error("Dossier error:", err);
      return res.status(500).json({ error: friendlyOpenAIError(err) });
    }
  });

  app.get("/api/assets/:fingerprint/intelligence", aiRateLimit, async (req, res) => {
    try {
      const { fingerprint } = req.params;
      const fingerprintStr = Array.isArray(fingerprint) ? fingerprint[0] : fingerprint;
      if (!fingerprintStr) return res.status(400).json({ error: "Fingerprint required" });

      let [enrichedRecord] = await db
        .select()
        .from(ingestedAssets)
        .where(eq(ingestedAssets.fingerprint, fingerprintStr))
        .limit(1);

      if (!enrichedRecord) {
        const numericId = parseInt(fingerprintStr, 10);
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
              dataSparse: enrichedRecord.dataSparse ?? false,
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
              categoryConfidence: enrichedRecord.categoryConfidence,
              assetClass: enrichedRecord.assetClass,
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
      logAppEvent("intelligence_fetched", { institution: enrichedRecord?.institution ?? null });
    } catch (err: any) {
      console.error("[intelligence] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to fetch intelligence" });
    }
  });

  // GET /api/assets/:fingerprint/market-listing — check if this ingestedAsset has an active EdenMarket listing
  app.get("/api/assets/:fingerprint/market-listing", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });

      const { fingerprint } = req.params;
      const fingerprintStr = Array.isArray(fingerprint) ? fingerprint[0] : fingerprint;

      let enrichedId: number | null = null;
      if (/^\d+$/.test(fingerprintStr)) {
        enrichedId = parseInt(fingerprintStr, 10);
      } else {
        const [rec] = await db.select({ id: ingestedAssets.id })
          .from(ingestedAssets)
          .where(eq(ingestedAssets.fingerprint, fingerprintStr))
          .limit(1);
        enrichedId = rec?.id ?? null;
      }

      if (!enrichedId) return res.json({ listing: null });

      const [listing] = await db.select({
        id: marketListings.id,
        therapeuticArea: marketListings.therapeuticArea,
        modality: marketListings.modality,
        stage: marketListings.stage,
        assetName: marketListings.assetName,
        blind: marketListings.blind,
        status: marketListings.status,
        engagementStatus: marketListings.engagementStatus,
      })
        .from(marketListings)
        .where(and(eq(marketListings.ingestedAssetId, enrichedId), eq(marketListings.status, "active")))
        .limit(1);

      res.json({ listing: listing ?? null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/search-history", async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      const history = await storage.getSearchHistory(30, userId ?? undefined);
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
      logTeamActivity(userId ?? null, "saved_asset", asset.ingestedAssetId ?? null, null, asset.assetName).catch(() => {});
      // Append save event to the relevance feedback log (Task #694). The log is
      // append-only — earlier dismiss events are kept; getUserClassOffsets
      // resolves preference using the latest event per (user, asset).
      if (userId && asset.ingestedAssetId) {
        storage.recordFeedback(userId, asset.ingestedAssetId, "save", "saved_assets").catch(() => {});
      }
      res.status(201).json({ asset });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to save asset" });
    }
  });

  app.get("/api/saved-assets/events", async (req, res) => {
    const token = (req.headers.authorization?.replace("Bearer ", "") || req.query.token) as string | undefined;
    let userId: string | undefined;
    if (token) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const adminSupabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        );
        const { data } = await adminSupabase.auth.getUser(token);
        userId = data.user?.id;
      } catch {}
    }
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const userOrg = await storage.getOrgForUser(userId);
    if (!userOrg) return res.status(403).json({ error: "No organisation found" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write("event: connected\ndata: {}\n\n");

    registerClient(userOrg.id, res);
    req.on("close", () => unregisterClient(userOrg.id, res));
  });

  app.patch("/api/saved-assets/:id/pipeline", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const { pipeline_list_id } = z.object({ pipeline_list_id: z.number().int().nullable() }).parse(req.body);
      const userId = await tryGetUserId(req);
      const existing = await storage.getSavedAsset(id);
      if (!existing) return res.status(404).json({ error: "Asset not found" });
      if (!await canAccessSavedAsset(existing, userId ?? null)) return res.status(403).json({ error: "Access denied" });
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

  // ── Log a team activity (fire-and-forget) ──────────────────────────────────
  // Logs to team_activities for both org members and individual-account users.
  // orgId is nullable on the row: for users without an org it is stored as
  // null, and /api/team/activity scopes by userId for the no-org branch.
  async function logTeamActivity(
    userId: string | null,
    action: string,
    assetId: number | null,
    assetFingerprint: string | null,
    assetName: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!userId) return;
    try {
      const org = await storage.getOrgForUser(userId);
      const member = org ? await storage.getOrgMemberByUserId(org.id, userId) : undefined;
      const actorName =
        (member?.memberName?.trim() || null) ?? (await resolveAuthorName(userId));
      // Resolve fingerprint from ingestedAssetId when caller didn't supply one.
      let fp = assetFingerprint;
      if (!fp && assetId != null) {
        try {
          const rows = await db.execute(sql`SELECT fingerprint FROM ingested_assets WHERE id = ${assetId} LIMIT 1`);
          const row = rows.rows[0] as { fingerprint?: string } | undefined;
          fp = row?.fingerprint ?? null;
        } catch { /* ignore */ }
      }
      await storage.createTeamActivity({
        orgId: org?.id ?? null,
        userId,
        actorName,
        action,
        assetId: assetId ?? null,
        assetFingerprint: fp ?? null,
        assetName,
        metadata: metadata ?? null,
      });
    } catch (e) {
      console.error("[team-activity] Failed to log:", e);
    }
  }

  // ── App event logger (fire-and-forget, no PII) ──────────────────────────
  function logAppEvent(event: string, metadata?: Record<string, unknown>): void {
    db.insert(appEvents).values({ event, metadata: metadata ?? null }).catch((e) => {
      console.error("[app-events] Failed to log:", e);
    });
  }

  // ── Pipeline ownership guard ──────────────────────────────────────────────
  async function canMutatePipeline(pipeline: { userId: string | null; orgId: number | null }, requestUserId: string | null): Promise<boolean> {
    if (!requestUserId) return false;
    // Unclaimed pipelines (null userId) are accessible to any authenticated user — backward compat
    if (pipeline.userId === null) return true;
    if (pipeline.userId === requestUserId) return true;
    if (pipeline.orgId) {
      const requesterOrg = await storage.getOrgForUser(requestUserId);
      if (requesterOrg && requesterOrg.id === pipeline.orgId) return true;
    }
    return false;
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
        logTeamActivity(userId ?? null, "moved_asset", before.ingestedAssetId ?? null, null, before.assetName, {
          fromStage: prevLabel,
          toStage: nextLabel,
        }).catch(() => {});
      }

      const statusOrg = await storage.getOrgForUser(userId ?? "").catch(() => null);
      if (statusOrg) broadcastToOrg(statusOrg.id, "status_changed", { savedAssetId: id });
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
      logTeamActivity(userId ?? null, "added_note", asset.ingestedAssetId ?? null, null, asset.assetName).catch(() => {});
      const noteOrg = await storage.getOrgForUser(userId ?? "").catch(() => null);
      if (noteOrg) broadcastToOrg(noteOrg.id, "note_added", { savedAssetId: id });
      res.status(201).json({ note });
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed to create note" });
    }
  });

  app.patch("/api/saved-assets/:id/notes/:noteId", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const noteId = parseInt(req.params.noteId);
      if (isNaN(id) || isNaN(noteId)) return res.status(400).json({ error: "Invalid ID" });
      const { content } = z.object({ content: z.string().min(1).max(2000) }).parse(req.body);
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const updated = await storage.updateAssetNote(noteId, content, userId);
      if (!updated) return res.status(404).json({ error: "Note not found or not owned by you" });

      const noteOrg = await storage.getOrgForUser(userId).catch(() => null);
      if (noteOrg) broadcastToOrg(noteOrg.id, "note_updated", { savedAssetId: id });
      res.json({ note: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed to update note" });
    }
  });

  app.delete("/api/saved-assets/:id/notes/:noteId", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const noteId = parseInt(req.params.noteId);
      if (isNaN(id) || isNaN(noteId)) return res.status(400).json({ error: "Invalid ID" });
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const deleted = await storage.deleteAssetNote(noteId, userId);
      if (!deleted) return res.status(404).json({ error: "Note not found or not owned by you" });

      const noteOrg = await storage.getOrgForUser(userId).catch(() => null);
      if (noteOrg) broadcastToOrg(noteOrg.id, "note_deleted", { savedAssetId: id });
      res.status(204).end();
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed to delete note" });
    }
  });

  app.delete("/api/saved-assets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const userId = await tryGetUserId(req);
      const assetBefore = await storage.getSavedAsset(id);
      if (!assetBefore) return res.status(404).json({ error: "Asset not found" });
      if (!await canAccessSavedAsset(assetBefore, userId ?? null)) return res.status(403).json({ error: "Access denied" });
      await storage.deleteSavedAsset(id);
      logTeamActivity(userId ?? null, "removed_asset", assetBefore.ingestedAssetId ?? null, null, assetBefore.assetName).catch(() => {});
      // Unsave records a dismiss event (Task #694). The prior save event is
      // preserved in the append-only log; latest-event-wins makes this user's
      // current preference "dismiss" for the asset class.
      if (userId && assetBefore.ingestedAssetId) {
        storage.recordFeedback(userId, assetBefore.ingestedAssetId, "dismiss", "unsave").catch(() => {});
      }
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to delete asset" });
    }
  });

  // ── Team / Recent Activity Feed ────────────────────────────────────────────
  // Returns activity rows for the requester. Org members get the org-wide feed
  // (all members' actions); individual / single-seat users get just their own
  // actions. Response also includes `memberCount` so the client can pick the
  // appropriate headline ("Team Activity" vs "Recent Activity").
  app.get("/api/team/activity", verifyAnyAuth, async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const org = await storage.getOrgForUser(userId);
      let activities;
      let memberCount = 1;
      if (org) {
        activities = await storage.getTeamActivities(org.id, 20);
        memberCount = await storage.getOrgMemberCount(org.id).catch(() => 1);
      } else {
        activities = await storage.getUserActivities(userId, 20);
      }
      res.json({ activities, memberCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch team activity" });
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
      logAppEvent("pipeline_brief_generated", { stage, assetCount: assets.length });
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
      const userId = await tryGetUserId(req);
      const existing = await storage.getPipelineList(id);
      if (!existing) return res.status(404).json({ error: "Pipeline not found" });
      if (!await canMutatePipeline(existing, userId ?? null)) return res.status(403).json({ error: "Access denied" });
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
      const userId = await tryGetUserId(req);
      const existing = await storage.getPipelineList(id);
      if (!existing) return res.status(404).json({ error: "Pipeline not found" });
      if (!await canMutatePipeline(existing, userId ?? null)) return res.status(403).json({ error: "Access denied" });
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

  app.get("/api/ingest/history", requireAdmin, async (req, res) => {
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

  // ── /api/institutions (Task #729, refined #740) ──────────────────────────
  // Canonical membership = ALL_SCRAPERS where scraperType !== "stub" (mirrors
  // Admin → Data Health). institution_metadata is a display overlay (city,
  // TTO, specialties, continent, restriction flags) and never adds members.
  // Stub scrapers (no real portal) and orphaned ingested_assets rows are
  // excluded so the public Institutions grid matches Data Health (~330–340).
  // ingested_assets is still LEFT-joined for per-card "active listings".
  const INSTITUTIONS_CACHE_KEY = "institutions:all:v3";
  const INSTITUTIONS_CACHE_TTL_MS = 5 * 60 * 1000;
  app.get("/api/institutions", async (_req, res) => {
    try {
      const cached = cacheGet<object>(INSTITUTIONS_CACHE_KEY);
      if (cached) return res.json(cached);

      const [metadataRows, counts] = await Promise.all([
        db.select().from(institutionMetadata),
        storage.getInstitutionAssetCounts(),
      ]);

      const metaBySlug = new Map(metadataRows.map((m) => [m.slug, m]));

      // Fold ingested counts (keyed by raw name) into canonical slug space so
      // name variants ("MIT" vs "Massachusetts Institute of Technology") merge.
      const countBySlug = new Map<string, number>();
      const nameBySlug = new Map<string, string>();
      for (const [rawName, n] of Object.entries(counts)) {
        const slug = slugifyInstitutionName(rawName);
        countBySlug.set(slug, (countBySlug.get(slug) ?? 0) + n);
        if (!nameBySlug.has(slug)) nameBySlug.set(slug, rawName);
      }

      // Membership: only non-stub scrapers (mirrors Admin Data Health).
      // Stub scrapers and orphaned ingested_assets rows are excluded.
      const slugSet = new Set<string>();
      for (const s of ALL_SCRAPERS.filter((x) => x.scraperType !== "stub")) {
        const slug = slugifyInstitutionName(s.institution);
        slugSet.add(slug);
        if (!nameBySlug.has(slug)) nameBySlug.set(slug, s.institution);
      }

      const institutions = Array.from(slugSet).map((slug) => {
        const meta = metaBySlug.get(slug);
        const fallbackName = nameBySlug.get(slug) ?? slug;
        return {
          slug,
          name: meta?.name ?? fallbackName,
          city: meta?.city ?? null,
          ttoName: meta?.ttoName ?? null,
          website: meta?.website ?? null,
          specialties: meta?.specialties ?? [],
          continent: meta?.continent ?? null,
          noPublicPortal: meta?.noPublicPortal ?? false,
          accessRestricted: meta?.accessRestricted ?? false,
          // `count` is the legacy field name used across Sources/Dashboard/etc;
          // `activeListings` is the spec-named alias for new consumers. Keep
          // both until migration completes.
          count: countBySlug.get(slug) ?? 0,
          activeListings: countBySlug.get(slug) ?? 0,
        };
      });

      institutions.sort((a, b) => a.name.localeCompare(b.name));
      const payload = { institutions, total: institutions.length };
      cacheSet(INSTITUTIONS_CACHE_KEY, payload, INSTITUTIONS_CACHE_TTL_MS);
      res.json(payload);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch institutions" });
    }
  });

  app.get("/api/institutions/:slug/assets", async (req, res) => {
    try {
      // Slug → assets resolution. Membership is canonical-by-slug, so we
      // gather EVERY raw institution name (from metadata, scrapers, and
      // ingested_assets) whose slug matches and query all aliases at once.
      // The display name is the metadata overlay if present, else the first
      // scraper/ingested name, else a titleized slug.
      const slug = req.params.slug;
      const [meta, counts] = await Promise.all([
        db
          .select({ name: institutionMetadata.name })
          .from(institutionMetadata)
          .where(eq(institutionMetadata.slug, slug))
          .limit(1),
        storage.getInstitutionAssetCounts(),
      ]);

      const aliasNames = new Set<string>();
      if (meta[0]?.name) aliasNames.add(meta[0].name);
      for (const s of ALL_SCRAPERS) {
        if (slugifyInstitutionName(s.institution) === slug) {
          aliasNames.add(s.institution);
        }
      }
      for (const rawName of Object.keys(counts)) {
        if (slugifyInstitutionName(rawName) === slug) {
          aliasNames.add(rawName);
        }
      }

      const displayName =
        meta[0]?.name ??
        Array.from(aliasNames)[0] ??
        slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

      const assets = aliasNames.size
        ? await storage.getIngestedAssetsByInstitutionNames(Array.from(aliasNames))
        : await storage.getIngestedAssetsByInstitution(displayName);
      res.json({ assets, institution: displayName });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch assets" });
    }
  });

  // ── Feedback-driven Relevance (Task #694) ─────────────────────────────────
  // Anonymous-tolerant: persisted only if the request resolves to a userId.
  const feedbackBodySchema = z.object({
    assetId: z.number().int().positive(),
    action: z.enum(["save", "dismiss", "view", "nda_request"]),
    source: z.string().max(40).optional(),
  });

  // Rate-limit feedback writes per IP — prevents a compromised/malicious account
  // from spamming the table and skewing per-user offsets or weekly metrics.
  const feedbackRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many feedback events — please slow down." },
  });

  app.post("/api/feedback", feedbackRateLimit, async (req, res) => {
    try {
      const body = feedbackBodySchema.parse(req.body);
      const userId = await tryGetUserId(req).catch(() => null);
      if (!userId) return res.status(200).json({ recorded: false, reason: "anonymous" });
      // Append-only log: every event is preserved. getUserClassOffsets and
      // buildRelevanceHoldout derive the user's current preference using the
      // latest event per (user, asset).
      const row = await storage.recordFeedback(userId, body.assetId, body.action, body.source ?? "scout");
      res.status(201).json({ recorded: true, feedback: row });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to record feedback";
      res.status(400).json({ error: msg });
    }
  });

  app.delete("/api/feedback", async (req, res) => {
    try {
      const body = feedbackBodySchema.parse(req.body);
      const userId = await tryGetUserId(req).catch(() => null);
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const removed = await storage.deleteFeedback(userId, body.assetId, body.action);
      res.json({ removed });
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed to delete feedback" });
    }
  });

  // ── Admin auth: every /api/admin/* route requires a Supabase Bearer token
  // for a user whose email is in the ADMIN_EMAILS allowlist.
  app.use("/api/admin", requireAdmin);

  // ── Admin "Act as user" impersonation (Task #736) ─────────────────────────
  // Lives under /api/admin/* so requireAdmin gates everything. The startSession/
  // endSession routes use the verified admin id from x-admin-id; downstream
  // identity swap happens in the auth middleware via x-impersonation-token.
  {
    const imp = await import("./lib/impersonation");
    const { z } = await import("zod");

    app.post("/api/admin/impersonation/start", async (req, res) => {
      try {
        const adminId = String(req.headers["x-admin-id"] ?? "");
        const adminEmail = String(req.headers["x-admin-email"] ?? "");
        if (!adminId) return res.status(401).json({ error: "Admin auth required" });
        const schema = z.object({
          targetUserId: z.string().min(1),
          readOnly: z.boolean().default(true),
        });
        const body = schema.parse(req.body);
        const result = await imp.startSession({
          adminId,
          adminEmail,
          targetUserId: body.targetUserId,
          readOnly: body.readOnly,
        });
        if ("error" in result) return res.status(result.status).json({ error: result.error });
        res.json({
          token: result.token,
          session: {
            id: result.session.id,
            targetUserId: result.session.targetUserId,
            targetEmail: result.session.targetEmail,
            targetRole: result.session.targetRole,
            readOnly: result.session.readOnly,
            startedAt: result.session.startedAt,
          },
        });
      } catch (err: any) {
        if (err?.name === "ZodError") return res.status(400).json({ error: "Invalid input" });
        res.status(500).json({ error: err?.message ?? "Failed to start impersonation" });
      }
    });

    app.post("/api/admin/impersonation/end", async (req, res) => {
      try {
        const adminId = String(req.headers["x-admin-id"] ?? "");
        const schema = z.object({ sessionId: z.number().int().positive() });
        const { sessionId } = schema.parse(req.body);
        const ok = await imp.endSession(sessionId, adminId);
        if (!ok) {
          // Either the session belongs to a different admin, is already
          // ended, or doesn't exist. Surface as 404 so the client mutation
          // is treated as a failure (avoids silently clearing the local
          // token when nothing was actually ended).
          return res.status(404).json({ error: "Session not found or not yours to end", ended: false });
        }
        res.json({ ended: true });
      } catch (err: any) {
        if (err?.name === "ZodError") return res.status(400).json({ error: "Invalid input" });
        res.status(500).json({ error: err?.message ?? "Failed to end impersonation" });
      }
    });

    // List impersonation sessions. Default is scoped to the calling admin so
    // one admin's active session can never block or be ended by another. Pass
    // ?scope=all to include other admins (useful for organization-wide audit).
    app.get("/api/admin/impersonation/sessions", async (req, res) => {
      try {
        const adminId = String(req.headers["x-admin-id"] ?? "");
        const scope = String(req.query.scope ?? "mine");
        const sessions = scope === "all"
          ? await imp.listRecentSessions(100)
          : await imp.listSessionsForAdmin(adminId, 100);
        res.json({ sessions });
      } catch (err: any) {
        res.status(500).json({ error: err?.message ?? "Failed to list sessions" });
      }
    });

    app.get("/api/admin/impersonation/sessions/:id/events", async (req, res) => {
      try {
        const sessionId = Number(req.params.id);
        if (!Number.isFinite(sessionId)) return res.status(400).json({ error: "Invalid id" });
        // Scope: an admin can only read the events for their own sessions.
        const adminId = String(req.headers["x-admin-id"] ?? "");
        const ownerId = await imp.getSessionAdminId(sessionId);
        if (!ownerId) return res.status(404).json({ error: "Session not found" });
        if (ownerId !== adminId) return res.status(403).json({ error: "Not your session" });
        const events = await imp.listSessionEvents(sessionId, 200);
        res.json({ events });
      } catch (err: any) {
        res.status(500).json({ error: err?.message ?? "Failed to list events" });
      }
    });
  }

  // Read the current impersonation session (if any) for the calling admin.
  // Mounted on /api so it can be read without an admin token swap, but it
  // requires a valid bearer that matches the session's admin_id.
  app.get("/api/me/impersonation", async (req, res) => {
    try {
      const token = req.headers["x-impersonation-token"];
      if (typeof token !== "string" || !token) return res.json({ active: null });
      const bearer = req.headers.authorization?.replace("Bearer ", "");
      if (!bearer) return res.json({ active: null });
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.VITE_SUPABASE_URL || "", process.env.VITE_SUPABASE_ANON_KEY || "");
      const { data, error } = await sb.auth.getUser(bearer);
      if (error || !data.user) return res.json({ active: null });
      const imp = await import("./lib/impersonation");
      const session = await imp.loadActiveSessionByToken(token, data.user.id);
      if (!session) return res.json({ active: null });
      res.json({
        active: {
          id: session.id,
          targetUserId: session.targetUserId,
          targetEmail: session.targetEmail,
          targetRole: session.targetRole,
          readOnly: session.readOnly,
          startedAt: session.startedAt,
          actionCount: session.actionCount,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to load impersonation state" });
    }
  });

  // ── Admin Relevance panel (Task #694) ─────────────────────────────────────
  app.post("/api/admin/relevance/holdout/build", async (_req, res) => {
    try {
      const result = await storage.buildRelevanceHoldout();
      const stats = await storage.getRelevanceHoldoutStats();
      // Holdout membership changed → drop cached per-row scores so the next
      // /relevance/eval call rescores against the new row set.
      invalidateRelevanceEvalCache();
      res.json({ ...result, stats });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to build holdout" });
    }
  });

  app.get("/api/admin/relevance/eval", async (_req, res) => {
    try {
      const preFilterMod = await import("./lib/pipeline/relevancePreFilter");
      const classifierMod = await import("./lib/pipeline/relevanceClassifier");
      const { preFilterRelevance } = preFilterMod;
      const {
        scoreText,
        CLASSIFIER_THRESHOLD,
        CLASSIFIER_V2_ENABLED,
        CLASSIFIER_VERSION,
        getActiveThreshold,
        getActiveWeights,
        weightsSignature,
      } = classifierMod;
      const [activeThreshold, activeWeights] = await Promise.all([
        getActiveThreshold(),
        getActiveWeights(),
      ]);
      const activeWeightsSig = weightsSignature(activeWeights);

      // Production pipeline keeps anything that isn't an explicit reject:
      // both `pass` and `ambiguous` flow forward into the rest of ingestion.
      const decisionToKept = (d: "pass" | "reject" | "ambiguous") => d !== "reject";

      // Per-row cache: keyed by (eval row count, classifier version). The
      // probability vector + v1 decision are both pure functions of the row
      // text and the classifier weights, so they don't need to be recomputed
      // on every admin click. Invalidated when buildRelevanceHoldout runs
      // (route handler above) or when CLASSIFIER_VERSION is bumped (engineers
      // bump the constant when weights/keywords change).
      type ScoredRow = { label: boolean; prob: number; v1Kept: boolean };
      let scored: ScoredRow[];
      let holdoutSize: number;
      const cacheKey = relevanceEvalCacheKey(CLASSIFIER_VERSION, activeWeightsSig);
      if (relevanceEvalCache && relevanceEvalCache.key === cacheKey) {
        scored = relevanceEvalCache.scored;
        holdoutSize = relevanceEvalCache.holdoutSize;
      } else {
        // Eval split only — train/eval partitioning is enforced by
        // buildRelevanceHoldout.
        const rows = await storage.listRelevanceHoldout(20000, "eval");
        type Listing = Parameters<typeof preFilterRelevance>[0];
        const buildListing = (r: typeof rows[number]): Listing => ({
          title: r.text || "",
          description: "",
          url: "",
          institution: r.sourceName || "unknown",
        });
        scored = rows.map((r) => {
          const listing = buildListing(r);
          const text = `${listing.title} ${listing.description ?? ""}`;
          return {
            label: !!r.label,
            // Score with the *active* (possibly tuned) weights so the cached
            // probability vector reflects whatever production is using right
            // now. The cache key above includes the weights signature, so a
            // tune call invalidates this cache automatically.
            prob: scoreText(text, activeWeights).prob,
            v1Kept: decisionToKept(preFilterRelevance(listing)),
          };
        });
        holdoutSize = rows.length;
        relevanceEvalCache = { key: cacheKey, scored, holdoutSize };
      }

      if (holdoutSize === 0) {
        return res.json({
          holdoutSize: 0,
          threshold: CLASSIFIER_THRESHOLD,
          activeThreshold,
          currentVariant: CLASSIFIER_V2_ENABLED ? "v2_classifier" : "v1_keyword",
          v1: null,
          v2: null,
          current: null,
          sweep: [],
          bestThreshold: null,
        });
      }

      const tally = (preds: Array<{ label: boolean; pred: boolean }>) => {
        let tp = 0, fp = 0, tn = 0, fn = 0;
        for (const p of preds) {
          if (p.pred && p.label) tp++;
          else if (p.pred && !p.label) fp++;
          else if (!p.pred && p.label) fn++;
          else tn++;
        }
        const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
        const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
        const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
        return { tp, fp, tn, fn, precision, recall, f1 };
      };

      // preFilterRelevanceV2 only depends on the cached probability:
      //   prob >= t + 0.15 → pass, prob <= t - 0.15 → reject, else ambiguous.
      // We inline that here so the threshold sweep is O(N) over a number[]
      // instead of re-running scoreText/extractFeatures per row per threshold.
      const v2KeptAt = (t: number, prob: number) => prob > t - 0.15;

      const v1Stats = tally(scored.map((s) => ({ label: s.label, pred: s.v1Kept })));
      const evalV2At = (t: number) => tally(scored.map((s) => ({
        label: s.label,
        pred: v2KeptAt(t, s.prob),
      })));
      // v2 stats are evaluated at the *active* threshold (env > tuned > default),
      // not the bare CLASSIFIER_THRESHOLD constant. That way the v2 card and
      // the "Current pipeline" card always tell the same story after a tune,
      // and the head-to-head with v1 reflects what production actually runs.
      const v2Stats = evalV2At(activeThreshold);
      const sweep = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7].map((t) => ({
        threshold: t,
        ...evalV2At(t),
      }));
      // currentPipeline = whichever pre-filter actually runs in production
      // right now (v1 keyword OR v2 classifier at the active threshold).
      const currentStats = CLASSIFIER_V2_ENABLED ? evalV2At(activeThreshold) : v1Stats;
      // bestThreshold = sweep entry with the highest F1 — used by
      // POST /api/admin/relevance/threshold/tune to persist the choice.
      const best = sweep.reduce((acc, s) => (s.f1 > acc.f1 ? s : acc), sweep[0]);

      res.json({
        holdoutSize,
        threshold: CLASSIFIER_THRESHOLD,
        activeThreshold,
        currentVariant: CLASSIFIER_V2_ENABLED ? "v2_classifier" : "v1_keyword",
        v1: v1Stats,
        v2: v2Stats,
        current: currentStats,
        sweep,
        bestThreshold: best ? { threshold: best.threshold, f1: best.f1 } : null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to evaluate";
      res.status(500).json({ error: msg });
    }
  });

  // POST → picks the best-F1 threshold from the sweep and persists it via
  // storage.setTunedClassifierThreshold. The classifier reads it lazily
  // (cached for 5 min) so production switches over without a restart.
  app.post("/api/admin/relevance/threshold/tune", async (_req, res) => {
    try {
      const classifierMod = await import("./lib/pipeline/relevanceClassifier");
      const { preFilterRelevanceV2, invalidateThresholdCache } = classifierMod;
      const rows = await storage.listRelevanceHoldout(20000, "eval");
      if (rows.length === 0) return res.status(400).json({ error: "Holdout is empty — build it first" });
      // Tune against the *real* v2 decision function (preFilterRelevanceV2),
      // so the chosen threshold optimizes the same pass/ambiguous/reject
      // routing that ingestion uses — not a proxy probability cutoff.
      type Listing = Parameters<typeof preFilterRelevanceV2>[0];
      const listings: Array<{ label: boolean; listing: Listing }> = rows.map((r) => ({
        label: !!r.label,
        listing: { title: r.text || "", description: "", url: "", institution: r.sourceName || "unknown" },
      }));
      let best = { threshold: 0.5, f1: -1 };
      for (const t of [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70]) {
        let tp = 0, fp = 0, fn = 0;
        for (const p of listings) {
          const decision = preFilterRelevanceV2(p.listing, t);
          const pred = decision !== "reject"; // pass + ambiguous both flow forward
          if (pred && p.label) tp++;
          else if (pred && !p.label) fp++;
          else if (!pred && p.label) fn++;
        }
        const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
        const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
        const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
        if (f1 > best.f1) best = { threshold: t, f1 };
      }
      await storage.setTunedClassifierThreshold(best.threshold, best.f1);
      invalidateThresholdCache();
      res.json({ tuned: best, holdoutSize: rows.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to tune threshold";
      res.status(500).json({ error: msg });
    }
  });

  // Task #699: fit logistic-regression weights from the train split, choose
  // the threshold on the eval split, persist both — but only if the fitted
  // model strictly beats the current persisted/baseline F1 on eval. This
  // satisfies the task's "v2 strictly ≥ v1 on F1 before flag default flips
  // ON" gate. Pass ?force=1 to persist regardless (useful when iterating).
  app.post("/api/admin/relevance/weights/tune", async (req, res) => {
    try {
      const force = req.query.force === "1" || req.query.force === "true";
      const trainerMod = await import("./lib/pipeline/relevanceTrainer");
      const classifierMod = await import("./lib/pipeline/relevanceClassifier");
      const { fitAndEvaluate } = trainerMod;
      const {
        DEFAULT_WEIGHTS,
        getActiveWeights,
        invalidateWeightsCache,
        invalidateThresholdCache,
      } = classifierMod;

      const [trainRowsRaw, evalRowsRaw, currentActive] = await Promise.all([
        storage.listRelevanceHoldout(20000, "train"),
        storage.listRelevanceHoldout(20000, "eval"),
        getActiveWeights(),
      ]);
      if (trainRowsRaw.length < 50) {
        return res.status(400).json({
          error: `Train split too small (${trainRowsRaw.length} rows). Build holdout and collect more save/dismiss feedback first.`,
        });
      }
      if (evalRowsRaw.length < 20) {
        return res.status(400).json({
          error: `Eval split too small (${evalRowsRaw.length} rows). Build holdout first.`,
        });
      }

      const trainRows = trainRowsRaw.map((r) => ({ text: r.text || "", label: !!r.label }));
      const evalRows = evalRowsRaw.map((r) => ({ text: r.text || "", label: !!r.label }));

      // Baseline = whatever's currently live (DEFAULT_WEIGHTS if nothing has
      // ever been tuned). This is what the new weights have to beat.
      const result = fitAndEvaluate(trainRows, evalRows, currentActive);

      const improvedF1 = result.fittedEval.f1 > result.baselineEval.f1;
      const persisted = force || improvedF1;

      if (persisted) {
        await storage.setTunedClassifierWeights(result.fitted, result.fittedEval.f1);
        // Tuning weights also implies the chosen threshold — persist it too
        // so the active threshold reflects the same fit.
        await storage.setTunedClassifierThreshold(result.threshold, result.fittedEval.f1);
        invalidateWeightsCache();
        invalidateThresholdCache();
        invalidateRelevanceEvalCache();
      }

      res.json({
        persisted,
        improvedF1,
        forced: force,
        defaultWeights: DEFAULT_WEIGHTS,
        currentActiveWeights: currentActive,
        fitted: {
          weights: result.fitted,
          threshold: result.threshold,
          eval: result.fittedEval,
        },
        baseline: {
          // What the live weights score on the eval split *right now* (at the
          // best sweep threshold) — so the UI can render a fair head-to-head.
          weights: currentActive,
          threshold: result.baselineThreshold,
          eval: result.baselineEval,
        },
        trainSize: trainRows.length,
        evalSize: evalRows.length,
        trainResult: {
          iterations: result.trainResult.iterations,
          finalLoss: result.trainResult.finalLoss,
          positiveRate: result.trainResult.positiveRate,
          converged: result.trainResult.converged,
        },
        sweep: result.sweep,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to tune weights";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/admin/relevance/metrics", async (_req, res) => {
    try {
      const rows = await storage.getLatestRelevanceMetrics(500);
      const lastAt = await storage.getLastRelevanceMetricsAt();
      res.json({ rows, lastComputedAt: lastAt });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch metrics" });
    }
  });

  app.post("/api/admin/relevance/metrics/refresh", async (_req, res) => {
    try {
      const result = await storage.computeRelevanceMetrics(7);
      res.json({ inserted: result.inserted });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to refresh metrics" });
    }
  });


  app.get("/api/admin/whoami", (req, res) => {
    res.json({
      id: req.headers["x-admin-id"],
      email: req.headers["x-admin-email"],
      isAdmin: true,
    });
  });

  app.get("/api/admin/scan-matrix", async (req, res) => {
    try {
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

        type HealthStatus = "ok" | "warning" | "degraded" | "failing" | "stale" | "syncing" | "never" | "blocked" | "network_blocked" | "site_down" | "rate_limited" | "parser_failure";

        function classifyByError(errMsg: string | null | undefined): HealthStatus {
          if (!errMsg) return "parser_failure";
          const m = errMsg.toLowerCase();
          if (/\b5\d{2}\b/.test(errMsg) || m.includes("service unavailable") || m.includes("maintenance")) return "site_down";
          if (m.includes(" 429") || m.includes("rate limit") || m.includes("rate-limit") || m.includes("too many request")) return "rate_limited";
          if (m.includes(" 403") || m.includes("cloudflare") || m.includes("bot challenge") || m.includes("access denied") || m.includes(" 401")) return "blocked";
          if (m.includes("network unreachable") || m.includes("blocks cloud") || m.includes("cloud/datacenter")) return "network_blocked";
          // Unrecognised error text on a completed session = scraper ran but
          // produced no listings -- treat as a parser / selector issue.
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
          phase: (liveActiveSyncs.has(name) && session?.status !== "running") ? null : (session?.phase ?? null),
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
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const found = await storage.rejectStagingItem(id);
      if (!found) return res.status(404).json({ error: "Item not found" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Reject failed" });
    }
  });

  app.get("/api/ingest/sync/sessions", requireAdmin, async (req, res) => {
    try {

      const sessions = await storage.getLatestSyncSessions();
      res.json({ sessions });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch sync sessions" });
    }
  });

  app.get("/api/ingest/sync-global-status", requireAdmin, async (req, res) => {
    res.json({
      syncRunning: isSyncRunning(),
      syncRunningFor: getSyncRunningFor(),
      ingestionRunning: isIngestionRunning(),
    });
  });

  app.get("/api/ingest/scheduler/status", requireAdmin, async (req, res) => {
    res.json(getSchedulerStatus());
  });

  app.post("/api/ingest/scheduler/start", requireAdmin, async (req, res) => {
    const result = startScheduler();
    res.json(result);
  });

  app.post("/api/ingest/scheduler/pause", requireAdmin, async (req, res) => {
    try {
      const result = await pauseScheduler();
      res.json(result);
    } catch (err: any) {
      console.error(`[scheduler] Pause DB write failed: ${err?.message}`);
      res.status(500).json({ error: "Pause succeeded in-memory but failed to persist — restart risk remains", detail: err?.message });
    }
  });

  app.post("/api/ingest/scheduler/reset", requireAdmin, async (req, res) => {
    const result = resetAndStartScheduler();
    res.json({ ...result, status: getSchedulerStatus() });
  });

  app.post("/api/ingest/scheduler/run-tier", requireAdmin, async (req, res) => {
    const { tier } = req.body ?? {};
    if (![1, 2, 3, 4].includes(tier)) return res.status(400).json({ error: "tier must be 1, 2, 3, or 4" });
    const result = startTierOnly(tier as 1 | 2 | 3 | 4);
    res.json({ ...result, status: getSchedulerStatus() });
  });

  app.post("/api/ingest/scheduler/bump", requireAdmin, async (req, res) => {
    const { institution } = req.body ?? {};
    if (!institution) return res.status(400).json({ error: "institution is required" });
    const result = bumpToFront(institution);
    res.json(result);
  });

  app.post("/api/ingest/scheduler/delay", requireAdmin, async (req, res) => {
    const { delayMs } = req.body ?? {};
    if (typeof delayMs !== "number") return res.status(400).json({ error: "delayMs (number) is required" });
    const result = setDelay(delayMs);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  app.post("/api/ingest/scheduler/concurrency", requireAdmin, async (req, res) => {
    const { concurrency } = req.body ?? {};
    if (concurrency !== 1 && concurrency !== 2 && concurrency !== 3) return res.status(400).json({ error: "concurrency must be 1, 2, or 3" });
    setConcurrency(concurrency as 1 | 2 | 3);
    res.json({ ok: true, message: `Concurrency set to ${concurrency}`, concurrency });
  });

  app.get("/api/admin/scraper-health", async (req, res) => {
    try {
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
      const institution = decodeURIComponent(String(req.params.institution));
      await clearScraperBackoff(institution);
      invalidateHealthCacheEntry(institution);  // immediate effect on scheduling decisions
      res.json({ ok: true, message: `Backoff cleared for ${institution}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Clear backoff failed" });
    }
  });

  app.post("/api/ingest/sync/:institution/cancel", requireAdmin, async (req, res) => {
    try {

      const institution = decodeURIComponent(String(req.params.institution));
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

  app.post("/api/ingest/sync/:institution", requireAdmin, async (req, res) => {
    try {

      const institution = decodeURIComponent(String(req.params.institution));
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
        .then((result) => {
          updateScraperHealth(institution, true, undefined, result.newCount, result.rawCount).catch(() => {});
          invalidateHealthCacheEntry(institution, { newCount: result.newCount, rawCount: result.rawCount });
        })
        .catch((err) => {
          const msg = err?.message ?? "";
          console.error(`[sync] Background sync failed for ${institution}:`, msg);
          if (!isTransientDbError(msg)) {
            updateScraperHealth(institution, false, msg).catch(() => {});
          }
        });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Sync failed" });
    }
  });

  app.get("/api/ingest/sync/:institution/status", requireAdmin, async (req, res) => {
    try {

      const institution = decodeURIComponent(String(req.params.institution));
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

  app.get("/api/ingest/sync/:institution/history", requireAdmin, async (req, res) => {
    try {
      const institution = decodeURIComponent(String(req.params.institution));
      const sessions = await storage.getInstitutionSyncHistory(institution, 5);
      res.json({ sessions });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch sync history" });
    }
  });

  app.post("/api/ingest/sync/:institution/push", requireAdmin, async (req, res) => {
    try {

      const institution = decodeURIComponent(String(req.params.institution));
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
    drain: boolean;
  } | null = null;
  let standardEnrichShouldStop = false;

  async function runEnrichmentWorker(
    jobId: number,
    assets: Array<{ id: number; assetName: string; summary: string; abstract: string | null; target: string; modality: string; indication: string; developmentStage: string; categories: string[] | null; patentStatus: string | null; licensingStatus: string | null; inventors: string[] | null; sourceUrl: string | null }>,
    startProcessed: number,
    startImproved: number,
    resumed: boolean,
    drain: boolean = false,
  ) {
    liveEnrichment = { jobId, processed: startProcessed, improved: startImproved, total: startProcessed + assets.length, resumed, drain };
    const CONCURRENCY = 30;
    let idx = 0;

    async function worker() {
      while (idx < assets.length) {
        if (standardEnrichShouldStop) break;
        const asset = assets[idx++];
        if (!asset) continue;
        try {
          // Use the type-aware classifyAsset pipeline (gpt-4o-mini, non-deep pass) so that
          // all new fields (assetClass, deviceAttributes, vocab-normalized target/indication)
          // are populated consistently with the rest of the pipeline.
          // Pass the asset's abstract + ctx (categories/patent/licensing/inventors/sourceUrl)
          // and current known field values — the prompt uses these to focus on filling the
          // unknowns and to preserve already-known values unless the source contradicts them.
          const classification = await classifyAsset(
            asset.assetName,
            asset.summary,
            asset.abstract ?? undefined,
            "gpt-4o-mini",  // cost-efficient model for Step 2
            false,          // non-deep mode
            {
              categories: asset.categories,
              patentStatus: asset.patentStatus,
              licensingStatus: asset.licensingStatus,
              inventors: asset.inventors,
              sourceUrl: asset.sourceUrl,
              currentValues: {
                target: asset.target,
                modality: asset.modality,
                indication: asset.indication,
                developmentStage: asset.developmentStage,
              },
            },
          );
          const score = computeCompletenessScore({
            assetClass: classification.assetClass,
            target: classification.target,
            modality: classification.modality,
            indication: classification.indication,
            developmentStage: classification.developmentStage,
            mechanismOfAction: classification.mechanismOfAction,
            innovationClaim: classification.innovationClaim,
            unmetNeed: classification.unmetNeed,
            comparableDrugs: classification.comparableDrugs,
            licensingReadiness: classification.licensingReadiness,
            deviceAttributes: classification.deviceAttributes,
          });
          // Always persist the type-aware classification (assetClass, deviceAttributes,
          // completenessScore, enrichmentSources, and any vocab-normalized fields).
          // The storage layer enforces human-verified locking, so locked fields are safe.
          // We still track "improved" for the job counter — counts only when pharma-style
          // unknown→known transitions occur.
          await storage.updateIngestedAssetEnrichment(asset.id, {
            ...classification,
            completenessScore: score,
          });

          const isKnown = (v: string | null | undefined) =>
            v != null && v !== "" && v !== "unknown";
          const improved =
            ((!asset.target || asset.target === "unknown") && isKnown(classification.target)) ||
            ((!asset.modality || asset.modality === "unknown") && isKnown(classification.modality)) ||
            ((!asset.indication || asset.indication === "unknown") && isKnown(classification.indication)) ||
            (asset.developmentStage === "unknown" && isKnown(classification.developmentStage));

          if (improved) liveEnrichment!.improved++;
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

      // Drain mode: after the current batch finishes, keep pulling the next 500
      // un-scanned assets from the same mini-queue and continue under the same
      // job until the queue is empty (or stop is requested). The mini-queue
      // criteria already exclude assets we've just scored, so we will not pay
      // twice for the same asset.
      while (drain && !standardEnrichShouldStop) {
        const next = await storage.getMiniEnrichBatch(500);
        if (next.length === 0) break;
        idx = 0;
        assets = next;
        liveEnrichment!.total += next.length;
        await storage.updateEnrichmentJob(jobId, { total: liveEnrichment!.total });
        console.log(`[enrichment] Drain: fetched next batch of ${next.length} assets for job ${jobId}`);
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, assets.length) }, worker));
      }

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
      const stats = await storage.getEnrichmentStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch enrichment stats" });
    }
  });

  // ── Rule-Based Fill ────────────────────────────────────────────────────────

  app.get("/api/admin/enrichment/rule-fill/estimate", async (req, res) => {
    try {
      const { estimateRuleBasedFill } = await import("./lib/pipeline/ruleBasedFill");
      const result = await estimateRuleBasedFill();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to estimate" });
    }
  });

  let ruleFillRunning = false;
  let ruleFillProgress: { processed: number; total: number; filled: number } | null = null;
  let ruleFillResult: { processed: number; filled: number; fieldsWritten: number; byField: Record<string, number>; dataSparseTagged: number } | null = null;
  let ruleFillShouldStop = false;

  app.get("/api/admin/enrichment/rule-fill/status", async (req, res) => {
    try {
      res.json({
        running: ruleFillRunning,
        progress: ruleFillProgress,
        result: ruleFillResult,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  app.post("/api/admin/enrichment/rule-fill", async (req, res) => {
    try {
      if (ruleFillRunning) return res.status(409).json({ error: "Rule-based fill already running" });

      ruleFillRunning = true;
      ruleFillProgress = { processed: 0, total: 0, filled: 0 };
      ruleFillResult = null;
      ruleFillShouldStop = false;

      res.json({ started: true });

      // Run async
      import("./lib/pipeline/ruleBasedFill").then(({ runRuleBasedFill }) => {
        runRuleBasedFill(
          (processed, total, filled) => { ruleFillProgress = { processed, total, filled }; },
          () => ruleFillShouldStop,
        ).then(summary => {
          ruleFillResult = summary;
          console.log(`[rule-fill] Done: ${summary.filled} assets filled, ${summary.fieldsWritten} field writes`);
        }).catch(err => {
          console.error("[rule-fill] Failed:", err);
        }).finally(() => {
          ruleFillRunning = false;
        });
      });
    } catch (err: any) {
      ruleFillRunning = false;
      res.status(500).json({ error: err.message ?? "Failed to start rule-based fill" });
    }
  });

  app.post("/api/admin/enrichment/rule-fill/stop", async (req, res) => {
    try {
      ruleFillShouldStop = true;
      res.json({ stopped: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // ── Human-Verified Field Locking ──────────────────────────────────────────

  app.post("/api/admin/assets/:id/verify-field", async (req, res) => {
    try {
      const assetId = parseInt(req.params.id);
      if (isNaN(assetId)) return res.status(400).json({ error: "Invalid asset ID" });
      const { field, verified } = req.body;
      if (!field || typeof field !== "string") return res.status(400).json({ error: "field required" });
      await storage.setHumanVerified(assetId, field, verified !== false);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // ── Mini Enrich Queue ──────────────────────────────────────────────────────

  app.get("/api/admin/enrichment/mini-queue", async (req, res) => {
    try {
      const queue = await storage.getMiniEnrichQueue();
      res.json(queue);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // --- Dataset Quality Analytics (relevant=true only) ---

  app.get("/api/admin/dataset-quality", async (req, res) => {
    try {

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
        WHERE relevant = true AND (data_sparse IS NULL OR data_sparse = false)
      `);

      const institutionResult = await db.execute(sql`
        SELECT
          COALESCE(institution, 'Unknown') AS institution,
          COUNT(*)::int AS relevant_count,
          ROUND(AVG(completeness_score)::numeric, 1) AS avg_completeness,
          ROUND(100.0 * COUNT(CASE WHEN target IS NOT NULL AND target NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_target,
          ROUND(100.0 * COUNT(CASE WHEN indication IS NOT NULL AND indication NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_indication
        FROM ingested_assets
        WHERE relevant = true AND (data_sparse IS NULL OR data_sparse = false)
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

  // --- By Asset Class Fill-Rate ---

  app.get("/api/admin/dataset-quality/by-class", async (req, res) => {
    try {

      // Include ALL relevant rows so sparse_count reflects real sparse assets per class.
      // Fill-rate metrics are scoped to non-sparse rows via CASE guards.
      const result = await db.execute(sql`
        SELECT
          COALESCE(asset_class, 'unclassified') AS asset_class,
          COUNT(CASE WHEN data_sparse IS NULL OR data_sparse = false THEN 1 END)::int AS count,
          ROUND(AVG(CASE WHEN data_sparse IS NULL OR data_sparse = false THEN completeness_score END)::numeric, 1) AS avg_score,
          ROUND(100.0 * COUNT(CASE WHEN (data_sparse IS NULL OR data_sparse = false) AND target IS NOT NULL AND target NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(CASE WHEN data_sparse IS NULL OR data_sparse = false THEN 1 END), 0), 1) AS fill_target,
          ROUND(100.0 * COUNT(CASE WHEN (data_sparse IS NULL OR data_sparse = false) AND modality IS NOT NULL AND modality NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(CASE WHEN data_sparse IS NULL OR data_sparse = false THEN 1 END), 0), 1) AS fill_modality,
          ROUND(100.0 * COUNT(CASE WHEN (data_sparse IS NULL OR data_sparse = false) AND indication IS NOT NULL AND indication NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(CASE WHEN data_sparse IS NULL OR data_sparse = false THEN 1 END), 0), 1) AS fill_indication,
          ROUND(100.0 * COUNT(CASE WHEN (data_sparse IS NULL OR data_sparse = false) AND development_stage IS NOT NULL AND development_stage NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(CASE WHEN data_sparse IS NULL OR data_sparse = false THEN 1 END), 0), 1) AS fill_stage,
          COUNT(CASE WHEN data_sparse = true THEN 1 END)::int AS sparse_count
        FROM ingested_assets
        WHERE relevant = true
        GROUP BY asset_class
        ORDER BY COUNT(CASE WHEN data_sparse IS NULL OR data_sparse = false THEN 1 END) DESC
      `);

      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch class breakdown" });
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

  // ── Confidence Distribution + Save-Rate by Confidence (Task #693) ─────────
  // Surfaces (a) how the classifier's confidence is distributed across the
  // corpus and (b) whether higher-confidence rows are actually saved more
  // often by users — a feedback loop for tuning the confidence-aware ranker.
  app.get("/api/admin/dataset-quality/confidence-distribution", async (_req, res) => {
    try {
      const histogram = await db.execute(sql`
        SELECT
          bucket,
          COUNT(*)::int AS count,
          ROUND(AVG(completeness_score)::numeric, 1) AS avg_completeness
        FROM (
          SELECT
            completeness_score,
            CASE
              WHEN category_confidence IS NULL THEN 'unscored'
              WHEN category_confidence < 0.2 THEN '0.0-0.2'
              WHEN category_confidence < 0.4 THEN '0.2-0.4'
              WHEN category_confidence < 0.6 THEN '0.4-0.6'
              WHEN category_confidence < 0.8 THEN '0.6-0.8'
              ELSE '0.8-1.0'
            END AS bucket
          FROM ingested_assets
          WHERE relevant = true
        ) b
        GROUP BY bucket
        ORDER BY
          CASE bucket
            WHEN '0.0-0.2' THEN 1 WHEN '0.2-0.4' THEN 2 WHEN '0.4-0.6' THEN 3
            WHEN '0.6-0.8' THEN 4 WHEN '0.8-1.0' THEN 5 ELSE 6
          END
      `);

      const saveRate = await db.execute(sql`
        SELECT
          bucket,
          COUNT(DISTINCT ia.id)::int AS asset_count,
          COUNT(DISTINCT CASE WHEN s.id IS NOT NULL THEN ia.id END)::int AS saved_asset_count,
          ROUND(
            100.0 * COUNT(DISTINCT CASE WHEN s.id IS NOT NULL THEN ia.id END)
              / NULLIF(COUNT(DISTINCT ia.id), 0),
            1
          ) AS save_rate_pct
        FROM (
          SELECT
            id,
            CASE
              WHEN category_confidence IS NULL THEN 'unscored'
              WHEN category_confidence < 0.2 THEN '0.0-0.2'
              WHEN category_confidence < 0.4 THEN '0.2-0.4'
              WHEN category_confidence < 0.6 THEN '0.4-0.6'
              WHEN category_confidence < 0.8 THEN '0.6-0.8'
              ELSE '0.8-1.0'
            END AS bucket
          FROM ingested_assets
          WHERE relevant = true
        ) ia
        LEFT JOIN saved_assets s ON s.ingested_asset_id = ia.id
        GROUP BY bucket
        ORDER BY
          CASE bucket
            WHEN '0.0-0.2' THEN 1 WHEN '0.2-0.4' THEN 2 WHEN '0.4-0.6' THEN 3
            WHEN '0.6-0.8' THEN 4 WHEN '0.8-1.0' THEN 5 ELSE 6
          END
      `);

      res.json({
        histogram: histogram.rows,
        saveRate: saveRate.rows,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch confidence distribution" });
    }
  });

  app.get("/api/admin/dataset-quality/institution/:name", async (req, res) => {
    try {

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
                 first_seen_at, enriched_at, patent_status, categories, inventors,
                 human_verified, enrichment_sources
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

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

      const existingRes = await db.execute(sql`
        SELECT target, indication, modality, development_stage, ip_type, licensing_readiness,
               mechanism_of_action, innovation_claim, unmet_need, comparable_drugs, summary, abstract,
               categories, inventors, patent_status, asset_class, device_attributes
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
        assetClass: existing.asset_class ?? null,
        deviceAttributes: existing.device_attributes ?? null,
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

      if (liveEnrichment) {
        return res.status(409).json({ error: "Enrichment job already running" });
      }

      const existingJob = await storage.getRunningEnrichmentJob();
      if (existingJob) {
        return res.status(409).json({ error: "Enrichment job already running (will resume on next restart)" });
      }

      // ?all=1 (or POST body { all: true }) drains the entire mini-queue under a single
      // job, fetching the next 500 un-scanned assets after each batch finishes. The
      // selection query already excludes anything we just scored, so we never re-pay
      // for the same asset.
      const drainAll = req.query.all === "1" || req.body?.all === true;

      // Use mini-queue criteria (relevant, non-sparse, >150 chars, 3+ unknowns) capped at
      // 500 assets per cycle so each run is cost-controlled and predictable.
      const MINI_BATCH_CAP = 500;
      const assets = await storage.getMiniEnrichBatch(MINI_BATCH_CAP);
      if (assets.length === 0) {
        return res.json({ message: "No assets in mini-enrich queue" });
      }

      const job = await storage.createEnrichmentJob(assets.length);
      res.json({ message: drainAll ? "Drain enrichment started" : "Enrichment started", total: assets.length, jobId: job.id, drain: drainAll });

      standardEnrichShouldStop = false;
      runEnrichmentWorker(job.id, assets, 0, 0, false, drainAll);
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
        // Use mini-queue criteria (relevant, non-sparse, >150 chars, unscored OR 3+ unknowns,
        // capped at 500) so resume respects the same cost-controlled batch semantics as a
        // fresh run — preventing unbounded reprocessing after a restart.
        const remaining = await storage.getMiniEnrichBatch(500);
        if (remaining.length > 0) {
          console.log(`[enrichment] Resuming job ${staleJob.id}: ${remaining.length} assets in mini-queue (${staleJob.processed} already processed)`);
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
  let edenPaused = false;
  const _rawCap = parseInt(process.env.ENRICH_MAX_PER_CYCLE ?? "500", 10);
  const ENRICH_MAX_PER_CYCLE = Number.isFinite(_rawCap) && _rawCap > 0 ? _rawCap : 500;
  let edenLastCycleCount = 0;
  let edenLastCycleDeferred = 0;

  app.get("/api/admin/eden/stats", async (req, res) => {
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
    if (edenPaused) return res.status(409).json({ error: "Deep enrichment is paused — resume it first" });
    if (edenRunning) return res.status(409).json({ error: "Deep enrichment already running" });
    try {
      const [assets, breakdown] = await Promise.all([
        storage.getAssetsNeedingDeepEnrich(),
        storage.getAssetsNeedingDeepEnrichBreakdown(),
      ]);
      if (assets.length === 0) return res.json({ message: "All relevant assets already deeply enriched", total: 0, breakdown: { fresh: 0, legacy: 0, lowQualityRetry: 0, total: 0 } });

      const capped = assets.slice(0, ENRICH_MAX_PER_CYCLE);
      const deferred = assets.length - capped.length;
      if (deferred > 0) {
        console.log(`[EDEN] Per-cycle cap hit: processing ${capped.length} assets, deferring ${deferred} to next run (cap=${ENRICH_MAX_PER_CYCLE})`);
      }

      edenTotal = capped.length;
      edenProcessed = 0;
      edenRunning = true;
      edenShouldStop = false;
      edenImproved = 0;
      edenFailed = 0;

      const job = await storage.createDeepEnrichmentJob(capped.length);
      edenJobId = job.id;

      res.json({ message: "Deep enrichment started", jobId: job.id, total: capped.length, totalAvailable: assets.length, deferred, breakdown });

      deepEnrichBatch(
        capped.map((a) => ({
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
          return storage.bulkUpdateIngestedAssetsDeepEnrichment(batch, "deep");
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
        edenLastCycleCount = batchResult.succeeded;
        edenLastCycleDeferred = deferred;
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
    try {
      const latest = await storage.getLatestDeepEnrichmentJob();
      // staleJobDetected: a job was in-progress when the server last restarted and
      // has not been resumed or completed. The admin must explicitly resume it.
      const staleJob = !edenRunning ? await storage.getRunningDeepEnrichmentJob() : null;
      const staleJobDetected = staleJob !== null && staleJob !== undefined;
      res.json({
        running: edenRunning,
        paused: edenPaused,
        capPerCycle: ENRICH_MAX_PER_CYCLE,
        processed: edenProcessed,
        total: edenTotal,
        succeeded: edenImproved,
        failed: edenFailed,
        lastCycleCount: edenLastCycleCount,
        lastCycleDeferred: edenLastCycleDeferred,
        job: latest ?? null,
        staleJobDetected,
        staleJobId: staleJob?.id ?? null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/eden/enrich/toggle-pause", async (req, res) => {
    if (edenRunning) return res.status(409).json({ error: "Cannot toggle pause while enrichment is running — stop it first" });
    edenPaused = !edenPaused;
    console.log(`[EDEN] Deep enrichment ${edenPaused ? "paused" : "resumed"} by admin`);
    res.json({ paused: edenPaused });
  });

  app.post("/api/admin/eden/enrich/stop", async (req, res) => {
    if (!edenRunning) return res.json({ message: "No EDEN enrichment running" });
    edenShouldStop = true;
    res.json({ message: "Stop signal sent — finishing in-flight batch then halting" });
  });

  app.post("/api/admin/enrichment/stop", async (req, res) => {
    if (!liveEnrichment) return res.json({ message: "No standard enrichment running" });
    standardEnrichShouldStop = true;
    res.json({ message: "Stop signal sent — finishing in-flight assets then halting" });
  });

  // ── EDEN embedding routes ────────────────────────────────────────────────

  let embedRunning = false;
  let embedProcessed = 0;
  let embedTotal = 0;
  let embedSucceeded = 0;
  let embedFailed = 0;

  app.post("/api/admin/eden/embed", async (req, res) => {
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
    res.json({
      running: embedRunning,
      processed: embedProcessed,
      total: embedTotal,
      succeeded: embedSucceeded,
      failed: embedFailed,
    });
  });

  // ── EDEN chat routes ──────────────────────────────────────────────────────

  app.post("/api/eden/chat", verifyAnyAuth, async (req, res) => {

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
          indication: a.indication ?? "unknown", modality: a.modality ?? "unknown", developmentStage: a.developmentStage,
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
              indication: a.indication ?? "unknown", modality: a.modality ?? "unknown",
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
            indication: a.indication ?? "unknown", modality: a.modality ?? "unknown",
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
        indication: a.indication ?? "unknown", modality: a.modality ?? "unknown", developmentStage: a.developmentStage,
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

  app.get("/api/eden/feedback/:sessionId", verifyAnyAuth, async (req, res) => {
    try {
      const data = await storage.getEdenFeedbackForSession(String(req.params.sessionId));
      return res.json(data);
    } catch (err) {
      console.error("[EDEN feedback GET]", err);
      return res.status(500).json({ error: "Failed" });
    }
  });

  app.post("/api/eden/feedback", verifyAnyAuth, async (req, res) => {
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

  app.get("/api/eden/sessions", verifyAnyAuth, async (req, res) => {
    try {
      const limit = Math.min(100, parseInt(String(req.query.limit ?? "50"), 10) || 50);
      const sessions = await storage.listEdenSessions(limit);
      res.json(sessions);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/eden/sessions/:sessionId", verifyAnyAuth, async (req, res) => {
    try {
      const session = await storage.getEdenSession(String(req.params.sessionId));
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json(session);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      res.status(500).json({ error: msg });
    }
  });

  // ── Eden data-query tool routes (authenticated user) ─────────────────────

  app.get("/api/eden/query/count-by-institution", verifyAnyAuth, async (req, res) => {
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

  app.get("/api/eden/query/top-institutions", verifyAnyAuth, async (req, res) => {
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

  app.get("/api/eden/query/count-by-modality", verifyAnyAuth, async (req, res) => {
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

  app.get("/api/eden/query/count-by-stage", verifyAnyAuth, async (req, res) => {
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

  app.get("/api/eden/query/newest-by-institution", verifyAnyAuth, async (req, res) => {
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
    try {
      await storage.wipeAllAssets();
      res.json({ ok: true, message: "All ingested assets wiped" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Inspect, reassign, or delete orphaned saved_assets / pipeline_lists rows with NULL user_id.
  // These were created before auth was wired up.  Three operations are available:
  //   GET    /api/admin/orphaned-records              — counts + 20-row preview
  //   POST   /api/admin/orphaned-records/reassign     — reassign to a target userId
  //   DELETE /api/admin/orphaned-records              — hard delete (requires confirm: true)
  // Auth: requireAdmin middleware (mounted on /api/admin).
  // Destructive operations additionally require { confirm: true } in the request body.

  app.get("/api/admin/orphaned-records", async (req, res) => {
    try {
      const [saCountResult, plCountResult, saPreview, plPreview] = await Promise.all([
        db.execute(sql`SELECT COUNT(*)::int AS n FROM saved_assets WHERE user_id IS NULL`),
        db.execute(sql`SELECT COUNT(*)::int AS n FROM pipeline_lists WHERE user_id IS NULL`),
        db.execute(sql`SELECT id, asset_name, saved_at FROM saved_assets WHERE user_id IS NULL ORDER BY saved_at DESC LIMIT 20`),
        db.execute(sql`SELECT id, name, created_at FROM pipeline_lists WHERE user_id IS NULL ORDER BY created_at DESC LIMIT 20`),
      ]);
      return res.json({
        savedAssets: {
          count: Number((saCountResult.rows[0] as Record<string, unknown>)?.n ?? 0),
          preview: saPreview.rows,
        },
        pipelineLists: {
          count: Number((plCountResult.rows[0] as Record<string, unknown>)?.n ?? 0),
          preview: plPreview.rows,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Reassign null-userId rows to a specific user (and optionally an org).
  // Call GET first to confirm what will be affected, then POST to commit.
  app.post("/api/admin/orphaned-records/reassign", async (req, res) => {
    const { targetUserId, targetOrgId, confirm: confirmed } = req.body as {
      targetUserId?: string;
      targetOrgId?: number;
      confirm?: boolean;
    };
    if (!targetUserId) return res.status(400).json({ error: "targetUserId is required" });
    if (!confirmed) return res.status(400).json({ error: "Pass { confirm: true } to execute" });
    try {
      // Count first so the response is informative even if no rows matched
      const [saCountResult, plCountResult] = await Promise.all([
        db.execute(sql`SELECT COUNT(*)::int AS n FROM saved_assets WHERE user_id IS NULL`),
        db.execute(sql`SELECT COUNT(*)::int AS n FROM pipeline_lists WHERE user_id IS NULL`),
      ]);
      const savedAssetCount = Number((saCountResult.rows[0] as Record<string, unknown>)?.n ?? 0);
      const pipelineListCount = Number((plCountResult.rows[0] as Record<string, unknown>)?.n ?? 0);

      // Perform reassignment — savedAssets has no orgId column, so we only set orgId on pipelineLists
      const saUpdateOpts = { userId: targetUserId };
      const plUpdateOpts = targetOrgId
        ? { userId: targetUserId, orgId: targetOrgId }
        : { userId: targetUserId };
      await Promise.all([
        db.update(savedAssets).set(saUpdateOpts).where(isNull(savedAssets.userId)),
        db.update(pipelineLists).set(plUpdateOpts).where(isNull(pipelineLists.userId)),
      ]);
      return res.json({ ok: true, reassignedSavedAssets: savedAssetCount, reassignedPipelineLists: pipelineListCount, targetUserId, targetOrgId: targetOrgId ?? null });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Hard-delete all remaining null-userId rows.  Run /reassign first for records worth keeping.
  app.delete("/api/admin/orphaned-records", async (req, res) => {
    const { confirm: confirmed } = req.body as { confirm?: boolean };
    if (!confirmed) return res.status(400).json({ error: "Pass { confirm: true } to execute" });
    try {
      // Count before deleting so the response accurately reflects what was removed
      const [saCountResult, plCountResult] = await Promise.all([
        db.execute(sql`SELECT COUNT(*)::int AS n FROM saved_assets WHERE user_id IS NULL`),
        db.execute(sql`SELECT COUNT(*)::int AS n FROM pipeline_lists WHERE user_id IS NULL`),
      ]);
      const savedAssetCount = Number((saCountResult.rows[0] as Record<string, unknown>)?.n ?? 0);
      const pipelineListCount = Number((plCountResult.rows[0] as Record<string, unknown>)?.n ?? 0);

      await Promise.all([
        db.delete(savedAssets).where(isNull(savedAssets.userId)),
        db.delete(pipelineLists).where(isNull(pipelineLists.userId)),
      ]);
      return res.json({ ok: true, deletedSavedAssets: savedAssetCount, deletedPipelineLists: pipelineListCount });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
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
    const institution = decodeURIComponent(String(req.params.institution));
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
    try {
      const summary = await storage.getQuarantineSummary();
      res.json({ summary });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/indexing-queue/quarantine", async (req, res) => {
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
    try {
      const items = await storage.getReviewQueue();
      res.json({ items });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/review-queue/:id", async (req, res) => {
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
    try {
      const cards = await storage.getAllDiscoveryCardsForAdmin();
      res.json({ cards });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: approve or reject a discovery card
  app.patch("/api/admin/research-queue/:id", async (req, res) => {
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
      // New projects start as "draft" — they only enter the admin queue after the
      // researcher explicitly toggles "Publish to industry" in §11.
      const project = await storage.createResearchProject({ ...parsed.data, adminStatus: "draft" });
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
    let unpublishRequested = false;
    if (validated.publishToIndustry !== undefined) {
      updates.publishToIndustry = validated.publishToIndustry;
      // When the researcher requests publishing, queue it for admin review.
      // When they unpublish, reset to draft so it disappears from the admin queue.
      if (validated.publishToIndustry === true) {
        (updates as any).adminStatus = "pending";
        // Clear any previous rejection note when resubmitting.
        (updates as any).adminNote = null;
      } else if (validated.publishToIndustry === false) {
        (updates as any).adminStatus = "draft";
        unpublishRequested = true;
      }
    }
    if (validated.estimatedBudget !== undefined) updates.estimatedBudget = validated.estimatedBudget;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No valid fields to update" });
    try {
      const project = await storage.updateResearchProject(id, researcherId, updates);
      if (!project) return res.status(404).json({ error: "Project not found" });
      // Researcher unpublish must also hide the bridged Scout/Institutions row.
      if (unpublishRequested) {
        await db.update(ingestedAssets)
          .set({ relevant: false })
          .where(eq(ingestedAssets.fingerprint, `researcher-project-${id}`));
      }
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
          adminNote: researchProjects.adminNote,
        })
        .from(researchProjects)
        .where(
          // Exclude drafts — only show projects researchers have explicitly submitted.
          sql`${researchProjects.adminStatus} IN ('pending', 'published', 'rejected')`,
        )
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
      const { id } = req.params;
      const projectId = Number(id);
      const schema = z.object({
        adminStatus: z.enum(["pending", "published", "rejected"]),
        adminNote: z.string().nullable().optional(),
      });
      const { adminStatus, adminNote } = schema.parse(req.body);
      // Admin actions normalise the publish flag so the researcher-facing status
      // badge stays in sync (pending = awaiting review, so publish flag stays true).
      const publishToIndustry = adminStatus === "rejected" ? false : true;
      // Reset the rejection note unless the admin is rejecting now.
      const noteUpdate = adminStatus === "rejected"
        ? { adminNote: adminNote ?? null }
        : { adminNote: null };
      await db
        .update(researchProjects)
        .set({ adminStatus, publishToIndustry, ...noteUpdate })
        .where(eq(researchProjects.id, projectId));

      // Bridge into ingested_assets so approved researcher submissions surface in
      // EdenScout/Institutions alongside scraped tech-transfer assets.
      const fingerprint = `researcher-project-${projectId}`;
      if (adminStatus === "published") {
        const [project] = await db.select().from(researchProjects).where(eq(researchProjects.id, projectId)).limit(1);
        if (project) {
          const contributors = (project.projectContributors ?? []) as Array<{ name: string; institution: string; role: string; email: string }>;
          const institution = contributors.find((c) => c.institution)?.institution || "Researcher Submission";
          const assetName = project.discoveryTitle || project.title || `Research Project #${projectId}`;
          const summary = project.discoverySummary || project.description || project.hypothesis || "";
          const stage = (project.developmentStage || "unknown").toLowerCase();
          const inventors = contributors.map((c) => c.name).filter(Boolean);

          const [existing] = await db.select({ id: ingestedAssets.id })
            .from(ingestedAssets)
            .where(eq(ingestedAssets.fingerprint, fingerprint))
            .limit(1);

          if (existing) {
            await db.update(ingestedAssets)
              .set({
                assetName,
                institution,
                summary,
                developmentStage: stage,
                sourceUrl: project.projectUrl ?? null,
                relevant: true,
                lastSeenAt: new Date(),
                inventors: inventors.length > 0 ? inventors : null,
              })
              .where(eq(ingestedAssets.id, existing.id));
          } else {
            await db.insert(ingestedAssets).values({
              fingerprint,
              assetName,
              institution,
              summary,
              sourceType: "researcher",
              sourceName: "EdenLab Research Project",
              developmentStage: stage,
              sourceUrl: project.projectUrl ?? null,
              relevant: true,
              runId: 0,
              inventors: inventors.length > 0 ? inventors : null,
            });
          }
        }
      } else {
        // Unpublish or reject: hide from Scout but keep the row so re-publishing
        // does not need re-enrichment.
        await db.update(ingestedAssets)
          .set({ relevant: false })
          .where(eq(ingestedAssets.fingerprint, fingerprint));
      }

      res.json({ ok: true, id: projectId, adminStatus, publishToIndustry });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Admin Analytics ──────────────────────────────────────────────────────

  app.get("/api/admin/analytics/overview", async (req, res) => {
    try {

      const analyticsSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const analyticsSupabaseUrl = process.env.VITE_SUPABASE_URL || "";

      // Daily search volume — last 30 days
      const searchesPerDayResult = await db.execute(sql`
        SELECT DATE(created_at) AS day, COUNT(*) AS count
        FROM search_history
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `);
      const searchesPerDay = searchesPerDayResult.rows as { day: string; count: string }[];

      // Eden AI sessions per day — last 30 days
      const sessionsPerDayResult = await db.execute(sql`
        SELECT DATE(created_at) AS day, COUNT(*) AS count
        FROM eden_sessions
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `);
      const sessionsPerDay = sessionsPerDayResult.rows as { day: string; count: string }[];

      // Saved assets per day (cumulative growth proxy) — last 30 days
      const savedAssetsPerDayResult = await db.execute(sql`
        SELECT DATE(saved_at) AS day, COUNT(*) AS count
        FROM saved_assets
        WHERE saved_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `);
      const savedAssetsPerDay = savedAssetsPerDayResult.rows as { day: string; count: string }[];

      // Dispatch logs per week — last 8 weeks
      const dispatchesPerWeekResult = await db.execute(sql`
        SELECT DATE_TRUNC('week', sent_at) AS week, COUNT(*) AS count
        FROM dispatch_logs
        WHERE sent_at >= NOW() - INTERVAL '8 weeks'
        GROUP BY week
        ORDER BY week ASC
      `);
      const dispatchesPerWeek = dispatchesPerWeekResult.rows as { week: string; count: string }[];

      // App event feature usage counts (all time)
      const featureUsageResult = await db.execute(sql`
        SELECT event, COUNT(*) AS count
        FROM app_events
        GROUP BY event
        ORDER BY count DESC
      `);
      const featureUsage = featureUsageResult.rows as { event: string; count: string }[];

      // Recent app events list (last 50)
      const recentEventsResult = await db.execute(sql`
        SELECT id, event, metadata, created_at
        FROM app_events
        ORDER BY created_at DESC
        LIMIT 50
      `);
      const recentEvents = recentEventsResult.rows as { id: number; event: string; metadata: Record<string, unknown> | null; created_at: string }[];

      // Aggregate totals
      const [totalSearches, totalSessions, totalSavedAssets, totalDispatches] = await Promise.all([
        db.execute(sql`SELECT COUNT(*) AS n FROM search_history`),
        db.execute(sql`SELECT COUNT(*) AS n FROM eden_sessions`),
        db.execute(sql`SELECT COUNT(*) AS n FROM saved_assets`),
        db.execute(sql`SELECT COUNT(*) AS n FROM dispatch_logs`),
      ]);

      type CountRow = { n: string };
      const toCount = (rows: unknown[]): number => Number((rows[0] as CountRow)?.n ?? 0);

      // New user signups by week (last 8 weeks) via Supabase admin API
      type SignupWeek = { week: string; count: number };
      let signupsPerWeek: SignupWeek[] = [];
      if (analyticsSupabaseKey && analyticsSupabaseUrl) {
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const adminClient = createClient(analyticsSupabaseUrl, analyticsSupabaseKey);
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - 56); // 8 weeks
          // Paginate through all users to avoid the 500-user cap
          const allUsers: { created_at: string }[] = [];
          let page = 1;
          while (true) {
            const { data: pageData } = await adminClient.auth.admin.listUsers({ perPage: 1000, page });
            const batch = pageData?.users ?? [];
            allUsers.push(...batch);
            if (batch.length < 1000) break;
            page++;
          }
          // Bucket by ISO week (Monday-based)
          const weekMap = new Map<string, number>();
          for (const u of allUsers) {
            const created = new Date(u.created_at);
            if (created < cutoff) continue;
            // Get Monday of that week
            const day = created.getDay(); // 0=Sun
            const diff = (day === 0 ? -6 : 1) - day;
            const monday = new Date(created);
            monday.setDate(created.getDate() + diff);
            const key = monday.toISOString().slice(0, 10);
            weekMap.set(key, (weekMap.get(key) ?? 0) + 1);
          }
          signupsPerWeek = Array.from(weekMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([week, count]) => ({ week, count }));
        } catch {
          // Non-fatal: if Supabase admin fails, omit signup chart
        }
      }

      res.json({
        searchesPerDay: searchesPerDay.map(r => ({ day: r.day, count: Number(r.count) })),
        sessionsPerDay: sessionsPerDay.map(r => ({ day: r.day, count: Number(r.count) })),
        savedAssetsPerDay: savedAssetsPerDay.map(r => ({ day: r.day, count: Number(r.count) })),
        dispatchesPerWeek: dispatchesPerWeek.map(r => ({ week: r.week, count: Number(r.count) })),
        signupsPerWeek,
        featureUsage: featureUsage.map(r => ({ event: r.event, count: Number(r.count) })),
        recentEvents: recentEvents.map(r => ({ id: r.id, event: r.event, metadata: r.metadata, createdAt: r.created_at })),
        totals: {
          searches: toCount(totalSearches.rows),
          sessions: toCount(totalSessions.rows),
          savedAssets: toCount(totalSavedAssets.rows),
          dispatches: toCount(totalDispatches.rows),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/analytics/top-searches", async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT query, COUNT(*) AS count
        FROM search_history
        GROUP BY query
        ORDER BY count DESC
        LIMIT 20
      `);
      const rows = result.rows as { query: string; count: string }[];
      res.json({ searches: rows.map(r => ({ query: r.query, count: Number(r.count) })) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || "";

  app.get("/api/admin/users", async (req, res) => {
    try {
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data, error } = await adminSupabase.auth.admin.listUsers({ perPage: 500 });
      if (error) return res.status(500).json({ error: error.message });
      const users = (data?.users ?? []).map((u) => {
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
        const name =
          (typeof meta.name === "string" && meta.name) ||
          (typeof meta.full_name === "string" && meta.full_name) ||
          (typeof meta.fullName === "string" && meta.fullName) ||
          (typeof meta.display_name === "string" && meta.display_name) ||
          null;
        const rawEnt = meta.marketEntitlement as Record<string, unknown> | undefined;
        const marketEntitlement = rawEnt && typeof rawEnt.active === "boolean"
          ? {
              active: rawEnt.active as boolean,
              source: (rawEnt.source === "admin" || rawEnt.source === "stripe") ? rawEnt.source as "admin" | "stripe" : null,
              grantedAt: typeof rawEnt.grantedAt === "string" ? rawEnt.grantedAt : null,
            }
          : null;
        return {
          id: u.id,
          email: u.email ?? "",
          name,
          contactEmail: (typeof meta.contactEmail === "string" ? meta.contactEmail : null),
          role: (typeof meta.role === "string" ? meta.role : null),
          subscribedToDigest: meta.subscribedToDigest === true,
          marketEntitlement,
          createdAt: u.created_at,
          lastSignInAt: u.last_sign_in_at ?? null,
        };
      });
      res.json({ users });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/users/:id/email", async (req, res) => {
    try {
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
      // Sync to industry_profiles so alertMailer (which reads that table) sees the change
      await storage.setIndustryProfileSubscription(id, subscribedToDigest).catch((e: any) => {
        console.warn("[admin/subscribed] industry_profiles sync failed:", e?.message);
      });
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

  // PATCH /api/admin/users/:id/market-access — Task #752: grant or revoke
  // EdenMarket access for an individual user (independent of org subscription).
  // Source is recorded as "admin" so subsequent Stripe-driven syncs do not
  // silently revoke admin grants — only the same source can flip it off via
  // the webhook path (admin always wins via this endpoint).
  app.patch("/api/admin/users/:id/market-access", async (req, res) => {
    try {
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const { id } = req.params;
      const schema = z.object({ active: z.boolean() });
      const { active } = schema.parse(req.body);
      const ent = await setUserMarketEntitlement(id, { active, source: "admin" });
      res.json({ id, marketEntitlement: ent });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: "Invalid body" });
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/users/invite", async (req, res) => {
    try {
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

  app.get("/api/admin/organizations", async (req, res) => {
    try {
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
      await storage.deleteOrganization(Number(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Billing history — returns all billing events for an org in reverse-chronological order
  app.get("/api/admin/organizations/:id/billing-history", async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      if (!orgId) return res.status(400).json({ error: "Invalid org id" });
      const events = await storage.getBillingHistory(orgId);
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Logo upload — stores a URL or base64 data URL in logoUrl field
  app.post("/api/admin/organizations/:id/logo", async (req, res) => {
    try {
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
          options: { redirectTo: APP_URL },
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
      const member = await storage.addOrgMember({ orgId, userId, email, memberName: fullName, role, invitedBy: "admin", inviteSource: "admin", inviteStatus: "pending" });

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
        options: { redirectTo: APP_URL },
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

      // Cancel any active Stripe subscription before deleting the account
      try {
        const userOrg = await storage.getOrgForUser(userId);
        if (userOrg?.stripeSubscriptionId) {
          const stripe = getStripe();
          if (stripe) {
            await stripe.subscriptions.cancel(userOrg.stripeSubscriptionId);
            await storage.updateOrganization(userOrg.id, { stripeStatus: "canceled" });
            console.log(`[delete-account] Canceled Stripe subscription ${userOrg.stripeSubscriptionId} for org ${userOrg.id}`);
          } else {
            console.warn(`[delete-account] BILLING LEAK RISK: org ${userOrg.id} has subscription ${userOrg.stripeSubscriptionId} but Stripe client is unavailable (STRIPE_SECRET_KEY missing) — subscription was NOT canceled`);
          }
        }
      } catch (stripeErr: any) {
        console.error("[delete-account] Stripe cancellation failed, continuing with account deletion:", stripeErr?.message ?? stripeErr);
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
  // planTier="none" is the canonical non-paid sentinel written by the Stripe webhook on
  // subscription cancellation; it is not in PAID_PLANS so this endpoint returns plan=null for it.
  app.get("/api/me/plan", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const PAID_PLANS = ["individual", "team5", "team10", "enterprise"] as const;
      const membership = await storage.getOrgPlanByMembership(userId);
      if (!membership || !PAID_PLANS.includes(membership.plan as (typeof PAID_PLANS)[number])) {
        return res.json({ plan: null, orgName: null, stripeStatus: null, stripeCurrentPeriodEnd: null });
      }
      return res.json({
        plan: membership.plan,
        orgName: membership.orgName,
        stripeStatus: membership.stripeStatus ?? null,
        stripeCurrentPeriodEnd: membership.stripeCurrentPeriodEnd ?? null,
      });
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
      // Auto-transition: mark invited member as active on first org access
      const self = members.find((m) => m.userId === userId);
      if (self && self.inviteStatus === "pending") {
        await storage.updateOrgMemberInviteStatus(org.id, userId, "active");
        self.inviteStatus = "active";
      }
      res.json({ ...org, members });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Self-service team invite routes (owner-only, no admin password required) ──

  async function requireOrgOwner(req: any, res: any): Promise<{ org: any; userId: string } | null> {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return null; }
    const org = await storage.getOrgForUser(userId);
    if (!org) { res.status(404).json({ error: "No organization found for this user" }); return null; }
    const member = await storage.getOrgMemberByUserId(org.id, userId);
    if (!member || member.role !== "owner") {
      res.status(403).json({ error: "Only the org owner can manage team members" });
      return null;
    }
    return { org, userId };
  }

  // POST /api/org/members — invite a new team member (owner only)
  app.post("/api/org/members", verifyAnyAuth, async (req, res) => {
    try {
      const ctx = await requireOrgOwner(req, res);
      if (!ctx) return;
      const { org } = ctx;

      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }

      const memberSchema = z.object({
        email: z.string().email(),
        fullName: z.string().optional(),
        role: z.enum(["admin", "member"]).default("member"),
      });
      const { email, fullName: rawFullName, role } = memberSchema.parse(req.body);
      const fullName = rawFullName?.trim() || email.split("@")[0];

      const currentCount = await storage.getOrgMemberCount(org.id);
      if (currentCount >= org.seatLimit) {
        return res.status(400).json({ error: `Seat limit reached (${currentCount}/${org.seatLimit}). Upgrade the plan to add more members.` });
      }

      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data: userData, error: supabaseError } = await adminSupabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { role: "industry", fullName },
      });
      if (supabaseError) return res.status(500).json({ error: supabaseError.message });
      const newUserId = userData.user.id;

      let setPasswordLink: string | undefined;
      try {
        const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: APP_URL } });
        if (!linkError) setPasswordLink = linkData?.properties?.action_link ?? undefined;
      } catch {}

      const newMember = await storage.addOrgMember({ orgId: org.id, userId: newUserId, email, memberName: fullName, role, invitedBy: ctx.userId, inviteSource: "self_service", inviteStatus: "pending" });
      await storage.setIndustryProfileOrg(newUserId, org.id);
      await sendTeamInviteEmail(email, fullName, org.name, org.planTier ?? "individual", setPasswordLink).catch((err) =>
        console.error("[email] Self-service invite email failed:", err)
      );

      res.json({ member: newMember, user: { id: newUserId, email: userData.user.email, fullName } });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      console.error("[org/members]", err?.message);
      sentryCaptureException(err);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/org/members/:userId — remove a member (owner only, cannot remove self)
  app.delete("/api/org/members/:memberId", verifyAnyAuth, async (req, res) => {
    try {
      const ctx = await requireOrgOwner(req, res);
      if (!ctx) return;
      const { org, userId: callerId } = ctx;
      const memberId = req.params.memberId as string;
      if (memberId === callerId) {
        return res.status(400).json({ error: "You cannot remove yourself from the organization" });
      }
      // Validate target member belongs to this org before removal
      const targetMember = await storage.getOrgMemberByUserId(org.id, memberId);
      if (!targetMember) {
        return res.status(404).json({ error: "Member not found in your organization" });
      }
      await storage.removeOrgMember(org.id, memberId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/org/members/:userId/resend — resend invite email (owner only)
  app.post("/api/org/members/:memberId/resend", verifyAnyAuth, async (req, res) => {
    try {
      const ctx = await requireOrgOwner(req, res);
      if (!ctx) return;
      const { org } = ctx;
      const memberId = req.params.memberId as string;

      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }

      const members = await storage.getOrgMembers(org.id);
      const member = members.find((m) => m.userId === memberId);
      if (!member) return res.status(404).json({ error: "Member not found" });
      if (!member.email) return res.status(400).json({ error: "Member has no email on record" });

      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({ type: "recovery", email: member.email, options: { redirectTo: APP_URL } });
      if (linkError) return res.status(500).json({ error: linkError.message });
      const setPasswordLink = linkData?.properties?.action_link ?? undefined;

      await sendTeamInviteEmail(member.email, member.memberName ?? "", org.name, org.planTier ?? "individual", setPasswordLink).catch((err) =>
        console.error("[email] Resend self-service invite failed:", err)
      );

      res.json({ ok: true, email: member.email });
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

      logAppEvent("concept_submitted", { therapeuticArea: parsed.therapeuticArea, modality: parsed.modality });
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
      const { query, modalities, stages, institutions, name, criteriaType, enabled } = req.body ?? {};
      const trimmedName = (name as string | undefined)?.trim();
      if (!trimmedName) {
        return res.status(400).json({ error: "Alert name is required" });
      }
      const isAllNew = criteriaType === "all_new";
      if (!isAllNew && !query && (!modalities?.length) && (!stages?.length) && (!institutions?.length)) {
        return res.status(400).json({ error: "At least one filter must be set" });
      }
      const userId = await tryGetUserId(req);
      const alert = await storage.createUserAlert({
        name: trimmedName,
        query: isAllNew ? null : (query ?? null),
        modalities: isAllNew ? null : (modalities ?? null),
        stages: isAllNew ? null : (stages ?? null),
        institutions: isAllNew ? null : (institutions ?? null),
        criteriaType: criteriaType ?? "custom",
        enabled: enabled !== false,
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
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      await storage.deleteUserAlert(id, userId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/alerts/:id/enabled", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { enabled } = req.body ?? {};
      if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be a boolean" });
      const updated = await storage.updateUserAlert(id, userId, { enabled });
      if (!updated) return res.status(404).json({ error: "Alert not found or access denied" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/alerts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { query, modalities, stages, institutions, name, criteriaType, enabled } = req.body ?? {};
      const trimmedName = (name as string | undefined)?.trim();
      if (!trimmedName) {
        return res.status(400).json({ error: "Alert name is required" });
      }
      const isAllNew = criteriaType === "all_new";
      if (!isAllNew && !query && (!modalities?.length) && (!stages?.length) && (!institutions?.length)) {
        return res.status(400).json({ error: "At least one filter must be set" });
      }
      const updated = await storage.updateUserAlert(id, userId, {
        name: trimmedName,
        query: isAllNew ? null : (query ?? null),
        modalities: isAllNew ? null : (modalities ?? null),
        stages: isAllNew ? null : (stages ?? null),
        institutions: isAllNew ? null : (institutions ?? null),
        criteriaType: criteriaType ?? "custom",
        ...(enabled !== undefined ? { enabled: enabled !== false } : {}),
      });
      if (!updated) return res.status(404).json({ error: "Alert not found or access denied" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Shared SQL alert predicate builder ───────────────────────────────────
  // Mirrors the logic in server/lib/alertMailer.ts matchAssetsForAlert so that
  // in-app display and email delivery use identical matching semantics.
  // When criteriaType === "all_new", all filter conditions are skipped so every
  // relevant asset matches (the "All New Assets" catch-all alert type).
  function buildAlertWhere(
    alert: { query?: string | null; modalities?: string[] | null; stages?: string[] | null; institutions?: string[] | null; criteriaType?: string | null },
    extraConditions?: ReturnType<typeof and>[],
  ) {
    if (alert.criteriaType === "all_new") {
      return and(eq(ingestedAssets.relevant, true), ...(extraConditions ?? []));
    }
    const trimmedQuery = alert.query?.trim();
    return and(
      eq(ingestedAssets.relevant, true),
      ...(extraConditions ?? []),
      alert.institutions?.length ? inArray(ingestedAssets.institution, alert.institutions) : undefined,
      alert.modalities?.length ? inArray(ingestedAssets.modality, alert.modalities) : undefined,
      alert.stages?.length ? inArray(ingestedAssets.developmentStage, alert.stages) : undefined,
      trimmedQuery
        ? or(
            ilike(ingestedAssets.assetName, `%${trimmedQuery}%`),
            ilike(ingestedAssets.summary, `%${trimmedQuery}%`),
            ilike(ingestedAssets.indication, `%${trimmedQuery}%`),
            ilike(ingestedAssets.target, `%${trimmedQuery}%`),
          )
        : undefined,
    );
  }

  // ── GET /api/alerts/delta — user-scoped, grouped by alert ────────────────
  // Uses identical SQL predicates to alertMailer.ts so in-app and email counts agree.
  // Only counts enabled alerts (enabled = true).
  app.get("/api/alerts/delta", async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const allAlerts = await storage.listUserAlerts(userId);
      const alerts = allAlerts.filter((a) => a.enabled !== false);
      const sinceParam = req.query.since as string | undefined;
      const since = sinceParam && !isNaN(Date.parse(sinceParam))
        ? new Date(sinceParam)
        : new Date(Date.now() - 48 * 60 * 60 * 1000);

      if (alerts.length === 0) {
        return res.json({ byAlert: [], total: 0, distinctTotal: 0, since: since.toISOString() });
      }

      type AlertBucket = {
        alertId: number;
        alertName: string;
        matchCount: number;
        samples: Array<{ id: number; assetName: string; institution: string; modality: string; developmentStage: string }>;
      };
      const byAlert: AlertBucket[] = [];

      for (const alert of alerts) {
        const sinceCondition = gt(ingestedAssets.firstSeenAt, since);
        const rows = await db
          .select({
            id: ingestedAssets.id,
            assetName: ingestedAssets.assetName,
            institution: ingestedAssets.institution,
            modality: ingestedAssets.modality,
            developmentStage: ingestedAssets.developmentStage,
          })
          .from(ingestedAssets)
          .where(buildAlertWhere(alert, [sinceCondition]))
          .orderBy(desc(ingestedAssets.firstSeenAt));

        if (rows.length === 0) continue;
        byAlert.push({
          alertId: alert.id,
          alertName: alert.name ?? alert.query ?? "Untitled alert",
          matchCount: rows.length,
          samples: rows.slice(0, 5).map((r) => ({
            id: r.id,
            assetName: r.assetName,
            institution: r.institution ?? "",
            modality: r.modality ?? "",
            developmentStage: r.developmentStage ?? "",
          })),
        });
      }

      // Collect distinct asset IDs across all alert buckets so the top-level
      // count matches the sidebar badge (which also deduplicates).
      const distinctIds = new Set<number>();
      for (const alert of alerts) {
        const sinceCondition = gt(ingestedAssets.firstSeenAt, since);
        const ids = await db
          .select({ id: ingestedAssets.id })
          .from(ingestedAssets)
          .where(buildAlertWhere(alert, [sinceCondition]));
        for (const row of ids) distinctIds.add(row.id);
      }
      const distinctTotal = distinctIds.size;
      const total = byAlert.reduce((s, b) => s + b.matchCount, 0);
      return res.json({ byAlert, total, distinctTotal, since: since.toISOString() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/alerts/preview — live match count for unsaved criteria ──────
  // Runs SQL count(*) with the same predicates as alertMailer for an accurate total.
  app.post("/api/alerts/preview", async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { query, modalities, stages, institutions } = req.body ?? {};
      const trimmedQuery = (query as string | undefined)?.trim();
      const hasAnyFilter =
        !!trimmedQuery ||
        (modalities?.length ?? 0) > 0 ||
        (stages?.length ?? 0) > 0 ||
        (institutions?.length ?? 0) > 0;

      if (!hasAnyFilter) return res.json({ count: 0, samples: [] });

      const draft = {
        query: trimmedQuery || null,
        modalities: (modalities?.length ?? 0) > 0 ? (modalities as string[]) : null,
        stages: (stages?.length ?? 0) > 0 ? (stages as string[]) : null,
        institutions: (institutions?.length ?? 0) > 0 ? (institutions as string[]) : null,
      };
      const whereClause = buildAlertWhere(draft);

      const [{ totalCount }] = await db
        .select({ totalCount: drizzleCount() })
        .from(ingestedAssets)
        .where(whereClause);

      const samples = await db
        .select({
          id: ingestedAssets.id,
          assetName: ingestedAssets.assetName,
          institution: ingestedAssets.institution,
          modality: ingestedAssets.modality,
          developmentStage: ingestedAssets.developmentStage,
        })
        .from(ingestedAssets)
        .where(whereClause)
        .orderBy(desc(ingestedAssets.firstSeenAt))
        .limit(5);

      return res.json({
        count: Number(totalCount),
        samples,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/alerts/unread-count — backend-driven badge count ────────────
  // Returns the number of distinct ingested assets matching any of the user's
  // enabled saved alerts that have arrived since last_viewed_alerts_at. Uses the
  // same buildAlertWhere SQL predicate as alertMailer for accuracy.
  app.get("/api/alerts/unread-count", async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      if (!userId) return res.json({ count: 0 });

      const [profileRow] = await db
        .select({ lastViewedAlertsAt: industryProfiles.lastViewedAlertsAt })
        .from(industryProfiles)
        .where(eq(industryProfiles.userId, userId))
        .limit(1);

      const since = profileRow?.lastViewedAlertsAt
        ? profileRow.lastViewedAlertsAt
        : new Date(Date.now() - 48 * 60 * 60 * 1000);

      const userAlertsList = await db
        .select()
        .from(userAlerts)
        .where(and(eq(userAlerts.userId, userId), eq(userAlerts.enabled, true)))
        .orderBy(desc(userAlerts.createdAt));

      if (userAlertsList.length === 0) return res.json({ count: 0 });

      const sinceCondition = gt(ingestedAssets.firstSeenAt, since);
      const seenIds = new Set<number>();
      for (const alert of userAlertsList) {
        const rows = await db
          .select({ id: ingestedAssets.id })
          .from(ingestedAssets)
          .where(buildAlertWhere(alert, [sinceCondition]));
        for (const row of rows) seenIds.add(row.id);
      }

      res.json({ count: seenIds.size });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/alerts/viewed-since — return the DB-side last-viewed timestamp ─
  // Frontend uses this as the authoritative sinceParam so badge and page counts agree.
  app.get("/api/alerts/viewed-since", async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      if (!userId) return res.json({ since: null });

      const [profileRow] = await db
        .select({ lastViewedAlertsAt: industryProfiles.lastViewedAlertsAt })
        .from(industryProfiles)
        .where(eq(industryProfiles.userId, userId))
        .limit(1);

      res.json({ since: profileRow?.lastViewedAlertsAt?.toISOString() ?? null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/alerts/mark-read — clear the unread badge ──────────────────
  // Updates last_viewed_alerts_at on industry_profiles so subsequent calls to
  // /api/alerts/unread-count return 0 until new assets arrive.
  // Returns the timestamp used so the client can sync its local sinceParam.
  app.post("/api/alerts/mark-read", async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      if (!userId) return res.json({ ok: true, lastViewedAt: null });

      const now = new Date();
      await db
        .update(industryProfiles)
        .set({ lastViewedAlertsAt: now })
        .where(eq(industryProfiles.userId, userId));

      res.json({ ok: true, lastViewedAt: now.toISOString() });
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

  // Mirrors buildAlertWhere semantics for in-memory filtering used by the
  // industry-grouped delta endpoint (exact inArray-equivalent matches for
  // institution/modality/stage; substring ILIKE-equivalent for query).
  function assetMatchesAlertJS(
    alert: UserAlert,
    asset: { assetName: string; institution: string | null; modality: string | null; developmentStage: string | null; summary?: string | null; indication?: string | null; target?: string | null }
  ): boolean {
    if (alert.criteriaType === "all_new") return true;
    const hasInst = (alert.institutions?.length ?? 0) > 0;
    const hasMod  = (alert.modalities?.length ?? 0) > 0;
    const hasSt   = (alert.stages?.length ?? 0) > 0;
    const hasQ    = !!(alert.query?.trim());
    if (!hasInst && !hasMod && !hasSt && !hasQ) return true;
    if (hasInst && !alert.institutions!.some((ai) => ai.toLowerCase() === (asset.institution ?? "").toLowerCase())) return false;
    if (hasMod  && !alert.modalities!.some((m)  => m.toLowerCase()  === (asset.modality ?? "").toLowerCase()))          return false;
    if (hasSt   && !alert.stages!.some((s)       => s.toLowerCase()  === (asset.developmentStage ?? "").toLowerCase())) return false;
    if (hasQ) {
      const q = alert.query!.toLowerCase().trim();
      const fields = [asset.assetName, asset.summary, asset.indication, asset.target].filter(Boolean).join(" ").toLowerCase();
      if (!fields.includes(q)) return false;
    }
    return true;
  }

  app.get("/api/industry/alerts/delta", async (req, res) => {
    try {
      const WINDOW_HOURS = 48;
      const sinceParam = req.query.since as string | undefined;
      const since = sinceParam && !isNaN(Date.parse(sinceParam))
        ? new Date(sinceParam)
        : new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);

      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const [newAssetRows, newConceptRows, newProjectRows, savedAlerts] = await Promise.all([
        db
          .select({
            id: ingestedAssets.id,
            institution: ingestedAssets.institution,
            assetName: ingestedAssets.assetName,
            modality: ingestedAssets.modality,
            developmentStage: ingestedAssets.developmentStage,
            summary: ingestedAssets.summary,
            indication: ingestedAssets.indication,
            target: ingestedAssets.target,
          })
          .from(ingestedAssets)
          .where(
            and(
              eq(ingestedAssets.relevant, true),
              gt(ingestedAssets.firstSeenAt, since),
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

        db.select().from(userAlerts).where(and(eq(userAlerts.userId, userId), eq(userAlerts.enabled, true))).orderBy(desc(userAlerts.createdAt)),
      ]);

      // Per-asset alert matching delegated to the module-level alertMatchesAsset
      // helper which also searches summary, indication, and target for consistency
      // with the automated email delivery logic.
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
            if (assetMatchesAlertJS(alert, row)) {
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

      const matchedTotal = byInstitution.reduce((sum, entry) => sum + entry.matchedCount, 0);

      const windowHours = Math.round((Date.now() - since.getTime()) / 3600000);
      res.json({
        newAssets: {
          total: newAssetRows.length,
          matchedTotal,
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
            const finalTarget = (listing?.target && listing.target !== "unknown") ? listing.target : (classification.target ?? "unknown");
            const finalModality = (listing?.modality && listing.modality !== "unknown") ? listing.modality : (classification.modality ?? "unknown");
            const finalIndication = (listing?.indication && listing.indication !== "unknown") ? listing.indication : (classification.indication ?? "unknown");
            const finalStage = (listing?.developmentStage && listing.developmentStage !== "unknown") ? listing.developmentStage : classification.developmentStage;
            const score = computeCompletenessScore({
              assetClass: classification.assetClass,
              deviceAttributes: classification.deviceAttributes,
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

  // ── Unsubscribe (token-signed, no auth) ────────────────────────────────────
  // Used by the List-Unsubscribe header (one-click POST per RFC 8058) and by the
  // visible footer link (GET → page → POST). Flips industry_profiles.subscribed_to_digest = false.
  async function handleUnsubscribe(token: string): Promise<{ ok: boolean; alreadyUnsubscribed?: boolean; error?: string }> {
    // Email-keyed token (admin manual dispatch recipients with no Eden account)
    const email = verifyUnsubscribeTokenForEmail(token);
    if (email) {
      try {
        // Short-circuit repeat clicks: if the email is already in the
        // suppression list we treat the request as already-unsubscribed and
        // skip the expensive Supabase user scan below. This keeps the
        // unauthenticated /unsubscribe endpoint cheap under repeat hits.
        const already = await db.select({ email: emailUnsubscribes.email })
          .from(emailUnsubscribes).where(eq(emailUnsubscribes.email, email)).limit(1);
        if (already.length > 0) {
          return { ok: true, alreadyUnsubscribed: true };
        }
        await db.insert(emailUnsubscribes).values({ email }).onConflictDoNothing();
        // Best-effort: if the address belongs to an Eden user, also flip their
        // industry_profiles.subscribed_to_digest so the unsubscribe takes
        // effect across both manual and automated digests. Run async so the
        // unauthenticated /unsubscribe response stays fast and isn't a perf
        // hotspot for repeat hits.
        void (async () => {
          try {
            const sbUrl = process.env.VITE_SUPABASE_URL ?? "";
            const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
            if (!sbUrl || !sbKey) return;
            const { createClient } = await import("@supabase/supabase-js");
            const sb = createClient(sbUrl, sbKey);
            // Paginate through Supabase users; cap at 50 pages × 200 = 10k.
            let matchedId: string | null = null;
            for (let page = 1; page <= 50 && !matchedId; page++) {
              const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
              const users = data?.users ?? [];
              matchedId = users.find(u => (u.email ?? "").toLowerCase() === email)?.id ?? null;
              if (users.length < 200) break;
            }
            if (matchedId) {
              await db.insert(industryProfiles).values({ userId: matchedId, subscribedToDigest: false })
                .onConflictDoUpdate({ target: industryProfiles.userId, set: { subscribedToDigest: false } });
            }
          } catch (syncErr: any) {
            console.warn("[unsubscribe] best-effort account sync failed:", syncErr?.message);
          }
        })();
        console.log(`[unsubscribe] Email ${email} added to email_unsubscribes via token link`);
        return { ok: true };
      } catch (err: any) {
        console.error("[unsubscribe] email-token error:", err?.message);
        return { ok: false, error: "Could not process unsubscribe" };
      }
    }
    const userId = verifyUnsubscribeToken(token);
    if (!userId) return { ok: false, error: "Invalid or expired unsubscribe link" };
    try {
      const existing = await db.select({ subscribedToDigest: industryProfiles.subscribedToDigest })
        .from(industryProfiles).where(eq(industryProfiles.userId, userId)).limit(1);
      if (existing.length === 0) {
        await db.insert(industryProfiles).values({ userId, subscribedToDigest: false }).onConflictDoNothing();
        return { ok: true };
      }
      if (!existing[0].subscribedToDigest) return { ok: true, alreadyUnsubscribed: true };
      await db.update(industryProfiles).set({ subscribedToDigest: false }).where(eq(industryProfiles.userId, userId));
      console.log(`[unsubscribe] User ${userId} unsubscribed via token link`);
      return { ok: true };
    } catch (err: any) {
      console.error("[unsubscribe] Error:", err?.message);
      return { ok: false, error: "Could not process unsubscribe" };
    }
  }

  app.post("/api/digest/unsubscribe", async (req, res) => {
    const token = (req.body?.token ?? req.query?.t ?? "") as string;
    const result = await handleUnsubscribe(token);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  // RFC 8058 one-click unsubscribe (Gmail/Yahoo bulk-sender requirement).
  // Mail clients POST to the List-Unsubscribe URL with body `List-Unsubscribe=One-Click`.
  app.post("/unsubscribe", async (req, res) => {
    const token = (req.query?.t ?? req.body?.t ?? "") as string;
    const result = await handleUnsubscribe(token);
    if (!result.ok) return res.status(400).send(result.error ?? "Invalid request");
    res.send("Unsubscribed");
  });

  // ── Avg alert delivery latency (last 24h) ──────────────────────────────────
  // Computes average minutes from ingested_assets.first_seen_at to dispatch_logs.sent_at
  // for non-test dispatch logs in the last 24h. Used by Admin "Avg alert latency" tile
  // to verify the periodic-evaluation timer (Task #687) is keeping latency low.
  app.get("/api/admin/alerts/latency", requireAdmin, async (_req, res) => {
    try {
      const result: any = await db.execute(sql`
        SELECT
          AVG(EXTRACT(EPOCH FROM (dl.sent_at - ia.first_seen_at)) / 60.0)::float AS avg_minutes,
          COUNT(*)::int AS sample_size
        FROM dispatch_logs dl
        CROSS JOIN LATERAL unnest(dl.asset_ids) AS aid
        JOIN ingested_assets ia ON ia.id = aid
        WHERE dl.is_test = false
          AND dl.sent_at >= NOW() - INTERVAL '24 hours'
          AND ia.first_seen_at IS NOT NULL
          AND dl.sent_at >= ia.first_seen_at
      `);
      const row = (result.rows ?? result)[0] ?? {};
      res.json({
        avgMinutes: row.avg_minutes != null ? Number(row.avg_minutes) : null,
        sampleSize: row.sample_size ?? 0,
        windowHours: 24,
      });
    } catch (err: any) {
      console.error("[admin/alerts/latency] error:", err?.message);
      res.status(500).json({ error: err?.message ?? "Failed to compute latency" });
    }
  });

  app.get("/api/admin/dispatch/filter-options", async (req, res) => {
    try {
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
      const html = renderDispatchEmail({ subject: resolvedSubject, assets: selectedAssets, windowLabel, isTest, colorMode, settingsUrl: "https://edenradar.com/industry/settings" });
      return res.json({ html, resolvedSubject });
    } catch (err: any) {
      console.error("[dispatch/preview] Error:", err);
      return res.status(500).json({ error: err.message ?? "Preview failed" });
    }
  });

  app.post("/api/admin/dispatch/send", async (req, res) => {
    try {

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

      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "RESEND_API_KEY is not configured. Add it to your environment secrets to enable email dispatch." });
      }

      const rawToList = isTest ? [testAddress ?? recipients[0]] : recipients;
      const finalSubject = isTest ? `[TEST] ${resolvedSubject}` : resolvedSubject;

      // Skip recipients who previously unsubscribed via an email-keyed token.
      // (Admin manual dispatch recipients have no Eden account, so they live in
      // the email_unsubscribes suppression list — not industry_profiles.)
      const normalizedRecipients = rawToList.map(a => a.trim().toLowerCase());
      const suppressedRows = normalizedRecipients.length > 0
        ? await db.select({ email: emailUnsubscribes.email })
            .from(emailUnsubscribes)
            .where(inArray(emailUnsubscribes.email, normalizedRecipients))
        : [];
      const suppressed = new Set(suppressedRows.map(r => r.email.toLowerCase()));
      const toList = rawToList.filter(addr => !suppressed.has(addr.trim().toLowerCase()));
      const suppressedCount = rawToList.length - toList.length;
      if (suppressedCount > 0) {
        console.log(`[dispatch/send] suppressed ${suppressedCount}/${rawToList.length} recipient(s) via email_unsubscribes`);
      }
      if (toList.length === 0) {
        return res.json({ ok: true, sentTo: 0, isTest, skipped: rawToList.length, reason: "all recipients unsubscribed" });
      }

      // Manual admin dispatch: render + send per-recipient so each email
      // carries a recipient-specific unsubscribe URL — both as the RFC 8058
      // one-click List-Unsubscribe header AND as the visible footer link
      // baked into the rendered template.
      try {
        await Promise.all(toList.map(addr => {
          const unsubscribeUrl = unsubscribeUrlForEmail(addr);
          const perRecipientHtml = renderDispatchEmail({
            subject: resolvedSubject,
            assets: selectedAssets,
            windowLabel,
            isTest,
            colorMode,
            settingsUrl: "https://edenradar.com/industry/settings",
            unsubscribeUrl,
          });
          return sendEmail(addr, finalSubject, perRecipientHtml, {
            from: FROM_DIGEST,
            replyTo: "support@edenradar.com",
            unsubscribeUrl,
          });
        }));
      } catch (sendErr: any) {
        console.error("[dispatch/send] Resend error:", sendErr);
        return res.status(502).json({ error: `Email provider error: ${sendErr?.message ?? "send failed"}` });
      }

      if (!isTest) {
        await storage.createDispatchLog({
          subject: resolvedSubject,
          recipients: toList,
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

  app.post("/api/admin/alerts/trigger-emails", async (req, res) => {
    try {
      const { checkAndSendAlerts } = await import("./lib/alertMailer");
      // Run async — don't await so the HTTP response returns immediately
      checkAndSendAlerts().catch((err: any) => {
        console.error("[admin/alerts/trigger-emails] Error:", err?.message);
      });
      return res.json({ ok: true, message: "Alert email evaluation started in background." });
    } catch (err: any) {
      console.error("[admin/alerts/trigger-emails] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to trigger alert emails" });
    }
  });

  app.get("/api/admin/dispatch/subscribers", async (req, res) => {
    try {
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
      const history = await storage.getDispatchHistory(30);
      return res.json({ history });
    } catch (err: any) {
      console.error("[dispatch/history] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load history" });
    }
  });

  app.get("/api/admin/all-institutions", async (req, res) => {
    try {
      const institutions = await storage.getAllInstitutionNames();
      return res.json({ institutions });
    } catch (err: any) {
      console.error("[all-institutions] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load institutions" });
    }
  });


  app.get("/api/admin/platform-stats", async (req, res) => {
    try {
      const stats = await storage.getPlatformStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch platform stats" });
    }
  });

  app.get("/api/admin/duplicate-candidates", async (req, res) => {
    try {
      const candidates = await storage.getDuplicateCandidates();
      res.json({ candidates, total: candidates.length });
    } catch (err: any) {
      console.error("[duplicate-candidates] Error:", err);
      res.status(500).json({ error: err.message ?? "Failed to load duplicate candidates" });
    }
  });

  app.post("/api/admin/duplicate-candidates/:id/dismiss", async (req, res) => {
    try {
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
      const result = await storage.runNearDuplicateDetection((msg) => console.log(`[dedup] ${msg}`));
      res.json(result);
    } catch (err: any) {
      console.error("[duplicate-detection/run] Error:", err);
      res.status(500).json({ error: err.message ?? "Failed to run duplicate detection" });
    }
  });

  app.get("/api/admin/assets/export-csv", async (req, res) => {
    try {

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
      const { runAlertDispatch } = await import("./lib/alertDispatch.js");
      const result = await runAlertDispatch();
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[admin/alerts/dispatch]", err);
      return res.status(500).json({ error: err.message ?? "Dispatch failed" });
    }
  });

  // ── Stripe subscription routes ──────────────────────────────────────────────
  //
  // All Stripe routes gracefully degrade when STRIPE_SECRET_KEY is absent.
  // Keys are wired in separately after smoke-testing the checkout flow.
  //
  // DB MIGRATION NOTE: The 4 Stripe columns on the organizations table
  // (stripe_customer_id, stripe_subscription_id, stripe_status, stripe_price_id)
  // were applied manually via SQL ALTER TABLE IF NOT EXISTS.
  // This file serves as the in-repo record; re-run via:
  //   ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
  //   ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
  //   ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_status TEXT;
  //   ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
  //
  // BILLING EVENTS MIGRATION: stripe_billing_events table for audit log.
  // Applied automatically on startup via createStripeBillingEventsTable() in server/index.ts.
  // Manual equivalent:
  //   CREATE TABLE IF NOT EXISTS stripe_billing_events (
  //     id SERIAL PRIMARY KEY,
  //     org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  //     stripe_subscription_id TEXT,
  //     event_type TEXT NOT NULL,
  //     old_price_id TEXT,
  //     new_price_id TEXT,
  //     old_plan_tier TEXT,
  //     new_plan_tier TEXT,
  //     stripe_status TEXT,
  //     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  //   );

  type StripePlanId = "individual" | "team5" | "team10";

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  // Price ID map — set via env vars in Stripe Dashboard
  const STRIPE_PRICE_MAP: Record<StripePlanId, string | undefined> = {
    individual: process.env.STRIPE_PRICE_INDIVIDUAL,
    team5: process.env.STRIPE_PRICE_TEAM5,
    team10: process.env.STRIPE_PRICE_TEAM10,
  };

  // Plan tier and seat limits for each plan ID
  const PLAN_TIER_MAP: Record<StripePlanId, string> = {
    individual: "individual",
    team5: "team5",
    team10: "team10",
  };
  const PLAN_SEAT_MAP: Record<StripePlanId, number> = {
    individual: 1,
    team5: 5,
    team10: 10,
  };

  function isStripePlanId(val: string): val is StripePlanId {
    return val === "individual" || val === "team5" || val === "team10";
  }

  if (!STRIPE_SECRET_KEY) {
    console.warn("[stripe] STRIPE_SECRET_KEY not set — Stripe routes will return 503 until configured");
  }
  if (!STRIPE_WEBHOOK_SECRET) {
    console.warn("[stripe] STRIPE_WEBHOOK_SECRET not set — webhook route will reject all events until configured");
  }

  // Helper: initialise stripe SDK (returns null if key absent)
  function getStripe() {
    if (!STRIPE_SECRET_KEY) return null;
    return new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });
  }

  // Helper: extract the string ID from a Stripe expandable field (string | { id: string } | null)
  function stripeId(field: string | { id: string } | null | undefined): string {
    if (!field) return "";
    if (typeof field === "string") return field;
    return field.id;
  }

  // Helper: resolve or auto-create an org for a user so self-serve checkout always works.
  // After creating, industry_profiles.org_id is set so repeated checkout attempts always
  // find the same org via getOrgForUser — preventing duplicate org creation.
  async function resolveOrCreateOrgForUser(
    userId: string,
    planId: StripePlanId,
  ) {
    // 1. Primary lookup via industry_profiles.org_id
    const existing = await storage.getOrgForUser(userId);
    if (existing) return existing;

    // 2. Auto-create a personal org, add membership, and link via industry_profile.org_id
    //    so the next call to getOrgForUser returns this org (preventing duplicate creation).
    const existingProfile = await storage.getIndustryProfileByUserId(userId).catch(() => null);
    const newOrgName = existingProfile?.companyName?.trim() || "Personal Workspace";
    const newOrg = await storage.createOrganization({
      name: newOrgName,
      planTier: "none",
      seatLimit: PLAN_SEAT_MAP[planId],
      billingMethod: "stripe",
    });
    await storage.addOrgMember({ orgId: newOrg.id, userId, role: "owner", inviteSource: "self_service", inviteStatus: "active" });
    await storage.setIndustryProfileOrg(userId, newOrg.id);
    console.log(`[stripe] Auto-created org ${newOrg.id} for user ${userId}`);
    return newOrg;
  }

  // POST /api/stripe/checkout — create a hosted checkout session
  app.post("/api/stripe/checkout", verifyAnyAuth, async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Stripe is not configured on this server yet" });

    try {
      const userId = req.headers["x-user-id"] as string;
      const rawPlanId = String(req.body?.planId ?? "");

      if (!isStripePlanId(rawPlanId)) {
        return res.status(400).json({ error: "Invalid planId — must be individual | team5 | team10" });
      }
      const planId: StripePlanId = rawPlanId;

      const priceId = STRIPE_PRICE_MAP[planId];
      if (!priceId) {
        return res.status(503).json({ error: `STRIPE_PRICE_${planId.toUpperCase()} env var not set` });
      }

      // Resolve or auto-create the user's org
      const org = await resolveOrCreateOrgForUser(userId, planId);

      // Block duplicate subscriptions — prevent a second checkout while active/trialing.
      // (Past-due is allowed so the user can update payment by starting a fresh session.)
      if (org.stripeStatus === "active" || org.stripeStatus === "trialing") {
        return res.status(409).json({
          error: "You already have an active subscription. Manage or upgrade your plan from Settings.",
          redirect: "/industry/settings",
        });
      }

      // Find or create Stripe customer
      let customerId: string;
      if (org.stripeCustomerId) {
        customerId = org.stripeCustomerId;
      } else {
        const billingEmail = org.billingEmail ?? undefined;
        const customer = await stripe.customers.create({
          email: billingEmail,
          metadata: { orgId: String(org.id), planId },
        });
        customerId = customer.id;
        // Pre-store customerId so webhook can locate the org if the browser redirect is skipped
        await storage.updateOrganization(org.id, { stripeCustomerId: customerId });
      }

      const origin = (req.headers.origin ?? req.headers.referer ?? "").replace(/\/$/, "");
      const baseUrl = origin || `https://${req.headers.host}`;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        payment_method_types: ["us_bank_account", "card"],
        payment_method_options: {
          us_bank_account: {
            verification_method: "automatic",
            financial_connections: { permissions: ["payment_method"] },
          },
        },
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pricing`,
        metadata: { orgId: String(org.id), planId },
        subscription_data: {
          // Only offer the free trial to first-time subscribers.
          // If the org already has (or had) a Stripe subscription, skip the trial.
          ...(org.stripeSubscriptionId ? {} : { trial_period_days: 3 }),
          metadata: { orgId: String(org.id), planId },
        },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error("[stripe/checkout]", err?.message);
      sentryCaptureException(err);
      res.status(500).json({ error: err.message ?? "Failed to create checkout session" });
    }
  });

  // GET /api/stripe/verify-session?session_id=... — verify checkout completion
  // Security: org resolution tracks HOW the org was found; any org resolved by id (not by caller's
  // own userId) triggers a hard membership check and returns 403 on mismatch to prevent IDOR.
  app.get("/api/stripe/verify-session", verifyAnyAuth, async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Stripe is not configured" });

    try {
      const sessionId = String(req.query.session_id ?? "");
      if (!sessionId) return res.status(400).json({ error: "session_id is required" });

      const userId = req.headers["x-user-id"] as string;

      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription", "customer"],
      });

      // Only activate plan for definitively paid or fully-covered (coupon/trial) sessions.
      // "status === complete" alone is insufficient — a session can be complete with payment_status
      // "unpaid" (e.g. payment failed). Both conditions must agree before granting access.
      const safePaymentStatuses = ["paid", "no_payment_required"] as const;
      if (!(safePaymentStatuses as ReadonlyArray<string>).includes(session.payment_status)) {
        return res.status(402).json({ error: "Payment not completed — session payment_status is not confirmed" });
      }

      const rawPlanId = String(session.metadata?.planId ?? "");
      const planId: StripePlanId = isStripePlanId(rawPlanId) ? rawPlanId : "individual";
      const planTier = PLAN_TIER_MAP[planId];

      const customerId = stripeId(session.customer);

      // ── Org resolution with ownership tracking ──────────────────────────────
      // org is found in one of four ways — order matters for ownership semantics:
      // 1) metadata orgId: requires membership check (could be any user's org if session_id leaked)
      // 2) caller's own industry_profile.org_id: guaranteed ownership — no check needed
      // 3) Stripe customer ID: requires membership check (customer was created for a specific org)
      // 4) auto-create: guaranteed ownership — created for this caller

      type OrgSource = "metadata" | "caller" | "customer" | "created";
      let org: Awaited<ReturnType<typeof storage.getOrganization>> | null = null;
      let orgSource: OrgSource = "created";

      const metaOrgId = parseInt(session.metadata?.orgId ?? "0", 10);
      if (metaOrgId) {
        org = await storage.getOrganization(metaOrgId) ?? null;
        if (org) orgSource = "metadata";
      }

      if (!org) {
        org = await storage.getOrgForUser(userId) ?? null;
        if (org) orgSource = "caller";
      }

      if (!org && customerId) {
        org = await storage.getOrgByStripeCustomer(customerId) ?? null;
        if (org) orgSource = "customer";
      }

      if (!org) {
        // Auto-create — fully owned by this caller
        const callerProfile = await storage.getIndustryProfileByUserId(userId).catch(() => null);
        const autoOrgName = callerProfile?.companyName?.trim() || "Personal Workspace";
        org = await storage.createOrganization({
          name: autoOrgName,
          planTier: "none",
          seatLimit: PLAN_SEAT_MAP[planId],
          billingMethod: "stripe",
        });
        await storage.addOrgMember({ orgId: org.id, userId, role: "owner", inviteSource: "self_service", inviteStatus: "active" });
        await storage.setIndustryProfileOrg(userId, org.id);
        orgSource = "created";
        console.log(`[stripe/verify-session] Auto-created org ${org.id} for user ${userId}`);
      }

      // Ownership enforcement: if org came from metadata or customer-id lookup,
      // verify the caller is a member — return 403 if not.
      if (orgSource === "metadata" || orgSource === "customer") {
        const members = await storage.getOrgMembers(org.id);
        if (!members.some((m) => m.userId === userId)) {
          console.warn(`[stripe/verify-session] User ${userId} not authorized for org ${org.id} (source=${orgSource})`);
          return res.status(403).json({ error: "Not authorized for this checkout session" });
        }
      }

      // Extract subscription details from the expanded Stripe response
      type ExpandedSub = { id: string; status: string; current_period_end: number; trial_end: number | null; items: { data: { price: { id: string } }[] } };
      const sub: ExpandedSub | null =
        session.subscription && typeof session.subscription === "object"
          ? (session.subscription as unknown as ExpandedSub)
          : null;
      const subscriptionId = sub?.id ?? (typeof session.subscription === "string" ? session.subscription : "");
      const stripeStatus = sub?.status ?? "active";
      const stripePriceId = sub?.items?.data?.[0]?.price?.id ?? "";
      const stripeTrialEnd = sub?.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;

      // Write Stripe fields + grant plan access
      const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end * 1000) : null;
      const updatedOrg = await storage.applyStripeSubscription(org.id, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripeStatus,
        stripePriceId,
        planTier,
        stripeCurrentPeriodEnd: periodEnd,
        stripeCancelAt: null,
      });

      // Ensure industry_profile.orgId is linked so subsequent getOrgForUser calls succeed
      await storage.setIndustryProfileOrg(userId, org.id);

      const nextBillingAt = sub?.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null;

      console.log(`[stripe] Verified session ${sessionId}: org ${org.id} → planTier=${planTier}, status=${stripeStatus}`);

      res.json({
        planTier,
        planId,
        orgName: updatedOrg?.name ?? null,
        nextBillingAt,
        stripeStatus,
        stripeTrialEnd,
      });
    } catch (err: any) {
      console.error("[stripe/verify-session]", err?.message);
      sentryCaptureException(err);
      res.status(500).json({ error: err.message ?? "Failed to verify session" });
    }
  });

  // POST /api/stripe/upgrade-plan — upgrade a team5 subscription to team10 mid-cycle with proration
  app.post("/api/stripe/upgrade-plan", verifyAnyAuth, async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Stripe is not configured on this server yet" });

    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(400).json({ error: "Missing user id" });

      const org = await storage.getOrgForUser(userId);
      if (!org) return res.status(404).json({ error: "No organisation found for this user" });

      // Verify caller is an owner of the org
      const members = await storage.getOrgMembers(org.id);
      const callerMember = members.find((m) => m.userId === userId);
      if (!callerMember || callerMember.role !== "owner") {
        return res.status(403).json({ error: "Only the org owner can upgrade the plan" });
      }

      if (org.planTier !== "team5") {
        return res.status(400).json({ error: "Only team5 subscriptions can be upgraded to team10 via this endpoint" });
      }

      if (!org.stripeSubscriptionId) {
        return res.status(400).json({ error: "No active Stripe subscription found for this organisation" });
      }

      const newPriceId = STRIPE_PRICE_MAP["team10"];
      if (!newPriceId) {
        return res.status(503).json({ error: "STRIPE_PRICE_TEAM10 env var not set" });
      }

      // Retrieve the current subscription to get the subscription item ID
      const currentSub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
      const itemId = currentSub.items?.data?.[0]?.id;
      if (!itemId) {
        return res.status(500).json({ error: "Could not find subscription item to update" });
      }

      // Swap the price with proration
      const updatedSub = await stripe.subscriptions.update(org.stripeSubscriptionId, {
        items: [{ id: itemId, price: newPriceId }],
        proration_behavior: "create_prorations",
      });

      const newStripePriceId = updatedSub.items?.data?.[0]?.price?.id ?? newPriceId;
      const newStatus = updatedSub.status ?? "active";

      // Persist the plan change to the DB immediately
      await storage.updateOrganization(org.id, {
        planTier: "team10",
        seatLimit: PLAN_SEAT_MAP["team10"],
        stripePriceId: newStripePriceId,
        stripeStatus: newStatus,
      });

      console.log(`[stripe/upgrade-plan] Org ${org.id} upgraded from team5 → team10 (sub ${org.stripeSubscriptionId})`);

      return res.json({ ok: true, planTier: "team10", seatLimit: PLAN_SEAT_MAP["team10"] });
    } catch (err: any) {
      console.error("[stripe/upgrade-plan]", err?.message);
      return res.status(500).json({ error: err.message ?? "Failed to upgrade plan" });
    }
  });

  // POST /api/stripe/webhook — handle Stripe events
  // Signature verification is REQUIRED. Returns 503 when STRIPE_WEBHOOK_SECRET is absent.
  app.post("/api/stripe/webhook", async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Stripe not configured — STRIPE_SECRET_KEY not set" });

    if (!STRIPE_WEBHOOK_SECRET) {
      console.error("[stripe/webhook] Rejecting event — STRIPE_WEBHOOK_SECRET not set");
      return res.status(503).json({ error: "Webhook endpoint not ready — STRIPE_WEBHOOK_SECRET not configured" });
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) {
      console.error("[stripe/webhook] Rejecting event — missing stripe-signature header");
      return res.status(400).json({ error: "Missing stripe-signature header" });
    }

    let event: { type: string; data: { object: Record<string, unknown> } };
    try {
      const rawBody = req.rawBody as Buffer | string;
      event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET) as unknown as { type: string; data: { object: Record<string, unknown> } };
    } catch (err: any) {
      console.error("[stripe/webhook] Signature verification failed:", err?.message);
      return res.status(400).json({ error: `Webhook signature error: ${err?.message}` });
    }

    const eventType: string = event.type;
    console.log(`[stripe/webhook] Received event: ${eventType}`);

    try {
      switch (eventType) {
        case "checkout.session.completed": {
          // Safety sync fallback — verify-session handles the primary write after the browser redirect.
          const sess = event.data.object as Record<string, unknown>;
          const sessMeta = sess["metadata"] as Record<string, string> | undefined;
          const orgId = parseInt(String(sessMeta?.["orgId"] || "0"), 10);
          if (!orgId) break;

          // EdenMarket subscriptions are separate from the main plan tier system
          if (sessMeta?.["product"] === "edenmarket") {
            const customerEM = stripeId(sess["customer"] as string | { id: string } | null);
            const subEM = stripeId(sess["subscription"] as string | { id: string } | null);
            await storage.updateOrganization(orgId, {
              edenMarketAccess: true,
              edenMarketStripeSubId: subEM || undefined,
              ...(customerEM ? { stripeCustomerId: customerEM } : {}),
            });
            // Task #752 — sync per-user entitlement.
            await syncOrgMembersMarketEntitlement(orgId, true);
            console.log(`[stripe/webhook] checkout.session.completed (edenmarket): org ${orgId} access activated, sub=${subEM}`);
            break;
          }

          const rawPlanIdC = String(sessMeta?.["planId"] || "");
          const planIdC: StripePlanId = isStripePlanId(rawPlanIdC) ? rawPlanIdC : "individual";
          const planTierC = PLAN_TIER_MAP[planIdC];
          const customerC = stripeId(sess["customer"] as string | { id: string } | null);
          const subC = stripeId(sess["subscription"] as string | { id: string } | null);
          // Derive status: if payment_status is "no_payment_required" the subscription is in trial
          const paymentStatusC = String(sess["payment_status"] ?? "paid");
          const initialStripeStatus = paymentStatusC === "no_payment_required" ? "trialing" : "active";
          if (customerC && orgId) {
            const seatLimitC = isStripePlanId(rawPlanIdC) ? PLAN_SEAT_MAP[rawPlanIdC] : undefined;

            // Retrieve the subscription early so we can record the exact Stripe Price ID.
            let resolvedPriceId: string = STRIPE_PRICE_MAP[planIdC] ?? "";
            let preloadedStripeSub: import("stripe").Stripe.Subscription | null = null;
            if (subC) {
              try {
                const stripeInstance = getStripe();
                if (stripeInstance) {
                  const fetchedSub = await stripeInstance.subscriptions.retrieve(subC);
                  preloadedStripeSub = fetchedSub;
                  const actualPriceId = fetchedSub.items.data[0]?.price?.id;
                  if (actualPriceId) resolvedPriceId = actualPriceId;
                }
              } catch (subPreloadErr: unknown) {
                console.warn("[stripe/webhook] Could not retrieve subscription for price ID:", (subPreloadErr as Error)?.message);
                console.warn(`[stripe/webhook] Falling back to mapped price ID for plan '${planIdC}' — actual Stripe price may differ`);
              }
            }

            await storage.applyStripeSubscription(orgId, {
              stripeCustomerId: customerC,
              stripeSubscriptionId: subC,
              stripeStatus: initialStripeStatus,
              stripePriceId: resolvedPriceId,
              planTier: planTierC,
              ...(seatLimitC !== undefined ? { seatLimit: seatLimitC } : {}),
            }, "checkout_completed");
            console.log(`[stripe/webhook] checkout.session.completed: org ${orgId} → ${planTierC}, priceId=${resolvedPriceId}`);

            if (subC) {
              try {
                const org = await storage.getOrganization(orgId);
                const billingEmail = org?.billingEmail
                  ?? (sess["customer_details"] as Record<string, unknown> | null)?.["email"] as string | undefined
                  ?? undefined;
                if (!billingEmail) {
                  console.warn(`[stripe/webhook] No billing email for org ${orgId} — skipping welcome email`);
                } else {
                  // Atomically claim the send slot before sending to prevent concurrent duplicate sends.
                  // markWelcomeEmailSent uses WHERE welcome_email_sent_sub_id IS DISTINCT FROM subC,
                  // so only one concurrent webhook delivery wins (returns true); others skip.
                  const claimed = await storage.markWelcomeEmailSent(orgId, subC);
                  if (!claimed) {
                    console.log(`[stripe/webhook] Welcome email already sent for sub ${subC} — skipping`);
                  } else {
                    const seatCount = isStripePlanId(rawPlanIdC) ? PLAN_SEAT_MAP[rawPlanIdC] : 1;
                    let nextBillingDate = "—";
                    try {
                      // Reuse the already-retrieved subscription when available.
                      const stripeSub = preloadedStripeSub ?? await (async () => {
                        const stripeInstance = getStripe();
                        return stripeInstance ? stripeInstance.subscriptions.retrieve(subC) : null;
                      })();
                      if (stripeSub) {
                        const periodEnd: number = (stripeSub as unknown as { current_period_end: number }).current_period_end;
                        nextBillingDate = new Date(periodEnd * 1000).toLocaleDateString("en-US", {
                          year: "numeric", month: "long", day: "numeric",
                        });
                      }
                    } catch (subErr: unknown) {
                      console.warn("[stripe/webhook] Could not retrieve subscription for billing date:", (subErr as Error)?.message);
                    }
                    try {
                      await sendSubscriptionWelcomeEmail(
                        billingEmail,
                        org?.name ?? "",
                        planTierC,
                        seatCount,
                        nextBillingDate,
                      );
                      console.log(`[stripe/webhook] Welcome email sent to ${billingEmail} for org ${orgId}, sub ${subC}`);
                    } catch (sendErr: unknown) {
                      // Release the claim so the next Stripe retry can attempt delivery again.
                      console.error("[stripe/webhook] Welcome email delivery failed — releasing claim:", (sendErr as Error)?.message);
                      await storage.releaseWelcomeEmailClaim(orgId, subC).catch((e: unknown) =>
                        console.error("[stripe/webhook] Failed to release welcome email claim:", (e as Error)?.message)
                      );
                    }
                  }
                }
              } catch (emailErr: unknown) {
                console.error("[stripe/webhook] Error preparing welcome email:", (emailErr as Error)?.message);
              }
            }
          }
          break;
        }

        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const sub = event.data.object as Record<string, unknown>;
          const stripeCustomerId = String(sub["customer"] ?? "");
          const stripeSubscriptionId = String(sub["id"] ?? "");

          // EdenMarket subscriptions are tracked separately from main plan tier.
          // Activate access idempotently when status is active or trialing; revoke otherwise.
          const subMetaCU = sub["metadata"] as Record<string, string> | undefined;
          if (subMetaCU?.["product"] === "edenmarket") {
            const orgEMCU = stripeCustomerId ? await storage.getOrgByStripeCustomer(stripeCustomerId) : null;
            if (!orgEMCU) {
              console.warn(`[stripe/webhook] ${eventType} (edenmarket): no org for customer ${stripeCustomerId}`);
              break;
            }
            const subStatusCU = String(sub["status"] ?? "");
            const isActive = subStatusCU === "active" || subStatusCU === "trialing";
            const isCanceled = subStatusCU === "canceled";
            // Task #714 — three transitions:
            //   active|trialing  → clear grace, ensure access true (reactivation
            //                      after a previous cancel rearms idempotency).
            //   canceled         → start a 30-day grace window (mirrors the
            //                      subscription.deleted branch). Reads continue,
            //                      writes are blocked by requireFullMarketAccess,
            //                      and after 30d getMarketAccessState rejects.
            //   anything else    → past_due / unpaid / incomplete: leave the
            //                      org's access state untouched. Stripe will
            //                      eventually fire either a reactivation
            //                      (active) or a cancellation, which then drives
            //                      the real state transition.
            if (isActive) {
              await storage.updateOrganization(orgEMCU.id, {
                edenMarketAccess: true,
                edenMarketStripeSubId: stripeSubscriptionId,
                marketAccessExpiresAt: null,
                marketGraceEmailSentAt: null,
              });
              await syncOrgMembersMarketEntitlement(orgEMCU.id, true);
              console.log(`[stripe/webhook] ${eventType} (edenmarket): org ${orgEMCU.id} reactivated, status=${subStatusCU}, sub=${stripeSubscriptionId}`);
            } else if (isCanceled) {
              const alreadyInGrace = orgEMCU.marketAccessExpiresAt && orgEMCU.marketAccessExpiresAt > new Date();
              const graceEndsAt = alreadyInGrace
                ? orgEMCU.marketAccessExpiresAt!
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
              await storage.updateOrganization(orgEMCU.id, {
                edenMarketAccess: true,
                edenMarketStripeSubId: null,
                marketAccessExpiresAt: graceEndsAt,
              });
              // Task #752 — revoke stripe-sourced per-user entitlements so
              // canceled buyers immediately drop to org-only read access
              // (and lose write access). Admin grants are preserved.
              await syncOrgMembersMarketEntitlement(orgEMCU.id, false);
              console.log(`[stripe/webhook] ${eventType} (edenmarket): org ${orgEMCU.id} entered/extended 30-day grace, expires ${graceEndsAt.toISOString()}`);
              // One-time grace-notice email, idempotent on marketGraceEmailSentAt
              const graceEmailTo = orgEMCU.billingEmail ?? undefined;
              if (graceEmailTo && !orgEMCU.marketGraceEmailSentAt && !alreadyInGrace) {
                try {
                  await sendMarketGraceNoticeEmail(graceEmailTo, orgEMCU.name ?? "", graceEndsAt);
                  await storage.updateOrganization(orgEMCU.id, { marketGraceEmailSentAt: new Date() });
                  console.log(`[stripe/webhook] EdenMarket grace notice sent to ${graceEmailTo} (via subscription.updated)`);
                } catch (graceEmailErr) {
                  console.warn("[stripe/webhook] EdenMarket grace notice email failed (subscription.updated):", (graceEmailErr as Error)?.message);
                }
              }
            } else {
              console.log(`[stripe/webhook] ${eventType} (edenmarket): org ${orgEMCU.id} non-terminal status=${subStatusCU} — leaving access state unchanged`);
            }
            break;
          }

          // Resolve org by customer ID first, fall back to subscription ID
          let orgU = stripeCustomerId ? await storage.getOrgByStripeCustomer(stripeCustomerId) : null;
          if (!orgU && stripeSubscriptionId) {
            orgU = await storage.getOrgByStripeSubscriptionId(stripeSubscriptionId) ?? null;
          }
          if (!orgU) {
            console.warn(`[stripe/webhook] subscription.updated: no org for customer ${stripeCustomerId} / sub ${stripeSubscriptionId}`);
            break;
          }
          const items = sub["items"] as { data: { price: { id: string } }[] } | undefined;
          const rawPriceId = items?.data?.[0]?.price?.id;
          if (!rawPriceId) {
            console.warn(`[stripe/webhook] subscription.updated: no price ID in payload for org ${orgU.id} — retaining existing priceId=${orgU.stripePriceId ?? "(none)"}`);
          }
          const priceId = rawPriceId ?? orgU.stripePriceId ?? "";
          const matchedPlanId = Object.entries(STRIPE_PRICE_MAP).find(([, pid]) => pid === priceId)?.[0];
          const resolvedPlanId: StripePlanId | null = matchedPlanId && isStripePlanId(matchedPlanId) ? matchedPlanId : null;
          const planTierU = resolvedPlanId ? PLAN_TIER_MAP[resolvedPlanId] : orgU.planTier;
          const seatLimitU = resolvedPlanId ? PLAN_SEAT_MAP[resolvedPlanId] : orgU.seatLimit;
          const periodEndU = typeof sub["current_period_end"] === "number" ? new Date(sub["current_period_end"] * 1000) : null;
          const cancelAtU = typeof sub["cancel_at"] === "number" ? new Date(sub["cancel_at"] * 1000) : null;
          await storage.applyStripeSubscription(orgU.id, {
            stripeCustomerId,
            stripeSubscriptionId,
            stripeStatus: String(sub["status"] ?? "active"),
            stripePriceId: priceId,
            planTier: planTierU,
            seatLimit: seatLimitU,
            stripeCurrentPeriodEnd: periodEndU,
            stripeCancelAt: cancelAtU,
          }, "subscription_updated");
          console.log(`[stripe/webhook] Updated org ${orgU.id} → planTier=${planTierU}, seatLimit=${seatLimitU}, status=${sub["status"]}, priceId=${priceId}`);
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object as Record<string, unknown>;
          const stripeCustomerId = String(sub["customer"] ?? "");
          const stripeSubscriptionId = String(sub["id"] ?? "");

          // Check if this is an EdenMarket subscription before falling through to main plan revocation
          const subMetaDel = sub["metadata"] as Record<string, string> | undefined;
          const subProductDel = subMetaDel?.["product"] ?? "";
          if (subProductDel === "edenmarket") {
            // Task #714 — keep access on but start a 30-day grace period.
            // Reads (browse, deal rooms) continue; writes are blocked by
            // requireFullMarketAccess. After 30d the access naturally
            // expires (getMarketAccessState treats stale grace as no access).
            const orgEMDel = stripeCustomerId ? await storage.getOrgByStripeCustomer(stripeCustomerId) : null;
            if (orgEMDel) {
              const graceEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
              await storage.updateOrganization(orgEMDel.id, {
                edenMarketAccess: true,
                edenMarketStripeSubId: null,
                marketAccessExpiresAt: graceEndsAt,
              });
              // Task #752 — revoke stripe-sourced per-user entitlements
              // immediately on cancel; admin grants are preserved.
              await syncOrgMembersMarketEntitlement(orgEMDel.id, false);
              console.log(`[stripe/webhook] EdenMarket subscription canceled — org ${orgEMDel.id} entered 30-day grace, expires ${graceEndsAt.toISOString()}`);

              // Send the one-time grace-notice email. Idempotent on
              // marketGraceEmailSentAt so retries don't double-send.
              const graceEmailTo = orgEMDel.billingEmail ?? undefined;
              if (graceEmailTo && !orgEMDel.marketGraceEmailSentAt) {
                try {
                  await sendMarketGraceNoticeEmail(graceEmailTo, orgEMDel.name ?? "", graceEndsAt);
                  await storage.updateOrganization(orgEMDel.id, { marketGraceEmailSentAt: new Date() });
                  console.log(`[stripe/webhook] EdenMarket grace notice sent to ${graceEmailTo}`);
                } catch (graceEmailErr) {
                  console.warn("[stripe/webhook] EdenMarket grace notice email failed:", (graceEmailErr as Error)?.message);
                }
              }
            } else {
              console.warn(`[stripe/webhook] subscription.deleted (edenmarket): no org for customer ${stripeCustomerId}`);
            }
            break;
          }

          // Resolve org by customer ID first, fall back to subscription ID (mirrors subscription.updated)
          let orgDel = stripeCustomerId ? await storage.getOrgByStripeCustomer(stripeCustomerId) : null;
          if (!orgDel && stripeSubscriptionId) {
            orgDel = await storage.getOrgByStripeSubscriptionId(stripeSubscriptionId) ?? null;
          }
          if (!orgDel) {
            console.warn(`[stripe/webhook] subscription.deleted: no org for customer ${stripeCustomerId} / sub ${stripeSubscriptionId}`);
            break;
          }
          const items = sub["items"] as { data: { price: { id: string } }[] } | undefined;
          // Revoke access: planTier "none" is not in PAID_PLANS → ScoutGate blocks
          await storage.applyStripeSubscription(orgDel.id, {
            stripeCustomerId,
            stripeSubscriptionId,
            stripeStatus: "canceled",
            stripePriceId: items?.data?.[0]?.price?.id ?? "",
            planTier: "none",
            stripeCurrentPeriodEnd: null,
            stripeCancelAt: null,
          }, "subscription_deleted");
          console.log(`[stripe/webhook] Org ${orgDel.id} subscription canceled — planTier set to "none", access revoked`);
          break;
        }

        case "invoice.payment_failed": {
          // Stripe also fires customer.subscription.updated (status → past_due) shortly after, which
          // is the primary handler. This case provides an extra safety net and writes a billing event
          // so the failure appears in the org's billing history timeline.
          const inv = event.data.object as Record<string, unknown>;
          const invCustomerId = String(inv["customer"] ?? "");
          const invSubId = String(inv["subscription"] ?? "");
          let orgFail = invCustomerId ? await storage.getOrgByStripeCustomer(invCustomerId) : null;
          if (!orgFail && invSubId) {
            orgFail = await storage.getOrgByStripeSubscriptionId(invSubId) ?? null;
          }
          if (!orgFail) {
            console.warn(`[stripe/webhook] invoice.payment_failed: no org for customer ${invCustomerId} / sub ${invSubId}`);
            break;
          }
          // Only write status if not already past_due (avoid redundant updates)
          if (orgFail.stripeStatus !== "past_due") {
            await storage.updateOrganization(orgFail.id, { stripeStatus: "past_due" });
          }
          // Always record the payment failure in billing history for auditability
          const failAmountDue = typeof inv["amount_due"] === "number" ? inv["amount_due"] : null;
          const failCurrency = typeof inv["currency"] === "string" ? inv["currency"] : null;
          await storage.logBillingEvent({
            orgId: orgFail.id,
            stripeSubscriptionId: invSubId || null,
            eventType: "payment_failed",
            stripeStatus: "past_due",
            amountCents: failAmountDue,
            currency: failCurrency,
          });
          console.warn(`[stripe/webhook] invoice.payment_failed: org ${orgFail.id} (${invCustomerId}) — payment failed, status → past_due`);

          // Send branded payment failure email with idempotency guard keyed on invoice ID
          const invId = String(inv["id"] ?? "");
          const failBillingEmail = orgFail.billingEmail ?? undefined;
          if (invId && failBillingEmail) {
            try {
              const claimed = await storage.markPaymentFailedEmailSent(orgFail.id, invId);
              if (!claimed) {
                console.log(`[stripe/webhook] Payment failure email already sent for invoice ${invId} — skipping`);
              } else {
                // Generate a Stripe billing portal URL so the subscriber can update their payment method directly
                const settingsUrl = `${APP_URL}/industry/settings`;
                let portalUrl = settingsUrl;
                try {
                  const stripeInst = getStripe();
                  if (stripeInst && orgFail.stripeCustomerId) {
                    const portalSession = await stripeInst.billingPortal.sessions.create({
                      customer: orgFail.stripeCustomerId,
                      return_url: settingsUrl,
                    });
                    portalUrl = portalSession.url;
                  }
                } catch (portalErr: unknown) {
                  console.warn("[stripe/webhook] Could not create billing portal session for failure email:", (portalErr as Error)?.message);
                }
                try {
                  await sendPaymentFailedEmail(failBillingEmail, orgFail.name ?? "", portalUrl);
                  console.log(`[stripe/webhook] Payment failure email sent to ${failBillingEmail} for org ${orgFail.id}, invoice ${invId}`);
                } catch (sendErr: unknown) {
                  console.error("[stripe/webhook] Payment failure email delivery failed — releasing claim:", (sendErr as Error)?.message);
                  await storage.releasePaymentFailedEmailClaim(orgFail.id, invId).catch((e: unknown) =>
                    console.error("[stripe/webhook] Failed to release payment failure email claim:", (e as Error)?.message)
                  );
                }
              }
            } catch (emailErr: unknown) {
              console.error("[stripe/webhook] Error preparing payment failure email:", (emailErr as Error)?.message);
            }
          } else if (!failBillingEmail) {
            console.warn(`[stripe/webhook] invoice.payment_failed: no billingEmail for org ${orgFail.id} — skipping failure email`);
          }
          break;
        }

        case "invoice.payment_succeeded": {
          // Fires on every successful charge: trial conversion, renewal, and reactivation after past_due.
          // The downstream customer.subscription.updated event updates the org record; this handler's
          // sole job is to write a billing event so successful payments appear in the billing timeline.
          const invOk = event.data.object as Record<string, unknown>;
          const invOkCustomerId = String(invOk["customer"] ?? "");
          const invOkSubId = String(invOk["subscription"] ?? "");
          // EdenMarket success-fee invoices carry metadata.dealId and are NOT
          // tied to a subscription. They are handled by the invoice.paid case
          // below — skip them here so we don't pollute org billing history.
          const invOkMeta = (invOk["metadata"] as Record<string, string> | null | undefined) ?? {};
          if (invOkMeta["dealId"]) {
            console.log(`[stripe/webhook] invoice.payment_succeeded: skipping EdenMarket success-fee invoice (dealId=${invOkMeta["dealId"]}) — handled by invoice.paid`);
            break;
          }
          // Skip initial trial invoices (amount_paid = 0) — they're not real payments
          const amountPaid = typeof invOk["amount_paid"] === "number" ? invOk["amount_paid"] : -1;
          if (amountPaid === 0) {
            console.log(`[stripe/webhook] invoice.payment_succeeded: skipping zero-amount invoice (trial) for customer ${invOkCustomerId}`);
            break;
          }

          // EdenMarket safety net: if this invoice belongs to an EdenMarket subscription,
          // ensure access remains on (covers past_due → active recovery) and skip plan billing log.
          if (invOkSubId) {
            try {
              const stripeInst = getStripe();
              if (stripeInst) {
                const fetchedSub = await stripeInst.subscriptions.retrieve(invOkSubId);
                if (fetchedSub.metadata?.product === "edenmarket") {
                  const orgEMInv = invOkCustomerId ? await storage.getOrgByStripeCustomer(invOkCustomerId) : null;
                  if (orgEMInv) {
                    if (!orgEMInv.edenMarketAccess || orgEMInv.edenMarketStripeSubId !== invOkSubId || orgEMInv.marketAccessExpiresAt) {
                      // Task #714 — clear any grace on successful renewal/payment.
                      await storage.updateOrganization(orgEMInv.id, {
                        edenMarketAccess: true,
                        edenMarketStripeSubId: invOkSubId,
                        marketAccessExpiresAt: null,
                        marketGraceEmailSentAt: null,
                      });
                      await syncOrgMembersMarketEntitlement(orgEMInv.id, true);
                      console.log(`[stripe/webhook] invoice.payment_succeeded (edenmarket): org ${orgEMInv.id} access ensured + grace cleared, sub=${invOkSubId}`);
                    }
                  } else {
                    console.warn(`[stripe/webhook] invoice.payment_succeeded (edenmarket): no org for customer ${invOkCustomerId}`);
                  }
                  break;
                }
              }
            } catch (subFetchErr: unknown) {
              console.warn("[stripe/webhook] invoice.payment_succeeded: could not retrieve subscription for product check:", (subFetchErr as Error)?.message);
            }
          }

          let orgOk = invOkCustomerId ? await storage.getOrgByStripeCustomer(invOkCustomerId) : null;
          if (!orgOk && invOkSubId) {
            orgOk = await storage.getOrgByStripeSubscriptionId(invOkSubId) ?? null;
          }
          if (!orgOk) {
            console.warn(`[stripe/webhook] invoice.payment_succeeded: no org for customer ${invOkCustomerId} / sub ${invOkSubId}`);
            break;
          }
          const okCurrency = typeof invOk["currency"] === "string" ? invOk["currency"] : null;
          await storage.logBillingEvent({
            orgId: orgOk.id,
            stripeSubscriptionId: invOkSubId || null,
            eventType: "payment_succeeded",
            // Use "active" as the canonical post-payment status rather than reading current
            // org state, which may still reflect "past_due" before subscription.updated arrives.
            stripeStatus: "active",
            amountCents: amountPaid > 0 ? amountPaid : null,
            currency: okCurrency,
          });
          console.log(`[stripe/webhook] invoice.payment_succeeded: org ${orgOk.id} — payment recorded, amount=${amountPaid}`);

          // Send renewal confirmation email for subscription cycle renewals (not the initial checkout invoice)
          const billingReason = String(invOk["billing_reason"] ?? "");
          const renewBillingEmail = orgOk.billingEmail ?? undefined;
          if (billingReason === "subscription_cycle" && renewBillingEmail) {
            try {
              const amountFormatted = `$${(amountPaid / 100).toFixed(2)}`;
              await sendRenewalConfirmationEmail(renewBillingEmail, orgOk.name ?? "", amountFormatted);
              console.log(`[stripe/webhook] Renewal confirmation email sent to ${renewBillingEmail} for org ${orgOk.id}, amount=${amountPaid}`);
            } catch (sendErr: unknown) {
              console.error("[stripe/webhook] Renewal confirmation email delivery failed:", (sendErr as Error)?.message);
            }
          }
          break;
        }

        case "invoice.paid": {
          // EdenMarket success-fee invoice paid — persist paidAt, email seller a receipt.
          // Idempotent: if successFeePaidAt is already set, do nothing.
          const invPaid = event.data.object as Record<string, unknown>;
          const invPaidMeta = (invPaid["metadata"] as Record<string, string> | null | undefined) ?? {};
          const dealIdStr = invPaidMeta["dealId"];
          if (!dealIdStr) {
            // Not a success-fee invoice (subscription invoices are handled by invoice.payment_succeeded).
            break;
          }
          const dealIdPaid = parseInt(dealIdStr, 10);
          if (!Number.isFinite(dealIdPaid)) {
            console.warn(`[stripe/webhook] invoice.paid: malformed dealId metadata=${dealIdStr}`);
            break;
          }
          const dealPaid = await storage.getMarketDeal(dealIdPaid);
          if (!dealPaid) {
            console.warn(`[stripe/webhook] invoice.paid: deal ${dealIdPaid} not found`);
            break;
          }
          if (dealPaid.successFeePaidAt) {
            console.log(`[stripe/webhook] invoice.paid: deal ${dealIdPaid} already marked paid — skipping`);
            break;
          }
          // Defense-in-depth: ensure the paid invoice ID matches the one we
          // recorded against the deal. Guards against accidental metadata
          // mismatch (manual Stripe edits, replay of a stale event, etc.).
          const invPaidId = typeof invPaid["id"] === "string" ? invPaid["id"] : null;
          if (dealPaid.successFeeInvoiceId && invPaidId && dealPaid.successFeeInvoiceId !== invPaidId) {
            console.warn(`[stripe/webhook] invoice.paid: invoice id mismatch for deal ${dealIdPaid} — event=${invPaidId} expected=${dealPaid.successFeeInvoiceId}; ignoring`);
            break;
          }
          const paidAt = new Date();
          await storage.updateMarketDeal(dealIdPaid, { successFeePaidAt: paidAt });
          console.log(`[stripe/webhook] invoice.paid: deal ${dealIdPaid} success-fee marked paid at ${paidAt.toISOString()}`);

          // Best-effort receipt email to seller's billing email.
          try {
            const sellerOrgPaid = await storage.getOrgForUser(dealPaid.sellerId);
            const billingEmailPaid = sellerOrgPaid?.billingEmail;
            if (billingEmailPaid) {
              const listingPaid = await storage.getMarketListing(dealPaid.listingId);
              const labelPaid = listingPaid?.assetName || `Listing #${dealPaid.listingId}`;
              const feeDisplay = dealPaid.successFeeAmount
                ? `$${dealPaid.successFeeAmount.toLocaleString("en-US")}`
                : "your EdenMarket success fee";
              const hostedUrl = typeof invPaid["hosted_invoice_url"] === "string" ? invPaid["hosted_invoice_url"] : null;
              const html = `
                <p>Thank you — we've received your payment of <strong>${feeDisplay}</strong> for the EdenMarket success fee on Deal #${dealIdPaid} (${labelPaid}).</p>
                ${hostedUrl ? `<p><a href="${hostedUrl}">View your receipt</a></p>` : ""}
                <p>The deal record has been updated with the paid timestamp. If you have any questions, just reply to this email.</p>
              `;
              await sendEmail(
                billingEmailPaid,
                `Payment received — EdenMarket success fee, Deal #${dealIdPaid}`,
                html,
              );
              console.log(`[stripe/webhook] invoice.paid: receipt emailed to ${billingEmailPaid} for deal ${dealIdPaid}`);
            } else {
              console.warn(`[stripe/webhook] invoice.paid: deal ${dealIdPaid} — seller org has no billing email, skipping receipt`);
            }
          } catch (emailErr: unknown) {
            console.error("[stripe/webhook] invoice.paid: receipt email failed", (emailErr as Error)?.message);
          }
          break;
        }

        default:
          console.log(`[stripe/webhook] Unhandled event type: ${eventType}`);
          break;
      }
    } catch (err: any) {
      console.error(`[stripe/webhook] Error handling event ${eventType}:`, err?.message);
      sentryCaptureException(err);
      return res.status(500).json({ error: "Internal error processing webhook — Stripe will retry" });
    }

    res.json({ received: true });
  });

  // GET /api/billing/history — returns billing events for the authenticated user's org
  app.get("/api/billing/history", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!org) return res.status(404).json({ error: "No organization found for this account" });
      const events = await storage.getBillingHistory(org.id);
      res.json(events);
    } catch (err: any) {
      console.error("[billing/history]", err?.message);
      res.status(500).json({ error: err.message ?? "Failed to fetch billing history" });
    }
  });

  // POST /api/stripe/portal — create a Stripe Customer Portal session for self-serve plan management
  app.post("/api/stripe/portal", verifyAnyAuth, async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Stripe is not configured on this server yet" });

    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);

      if (!org) {
        return res.status(404).json({ error: "No organization found for this account" });
      }
      if (!org.stripeCustomerId) {
        return res.status(400).json({ error: "No Stripe billing found — subscribe to a plan first" });
      }

      const origin = (req.headers.origin ?? req.headers.referer ?? "").replace(/\/$/, "");
      const baseUrl = origin || `https://${req.headers.host}`;

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: org.stripeCustomerId,
        return_url: `${baseUrl}/industry/settings`,
      });

      res.json({ url: portalSession.url });
    } catch (err: any) {
      console.error("[stripe/portal]", err?.message);
      res.status(500).json({ error: err.message ?? "Failed to create portal session" });
    }
  });

  // ── Shareable links ──────────────────────────────────────────────────────────

  app.post("/api/share", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const { type, entityId, payload, password, expiresInDays = 7 } = req.body;

      if (!type || !payload) {
        return res.status(400).json({ error: "type and payload are required" });
      }
      if (!["dossier", "pipeline_brief"].includes(type)) {
        return res.status(400).json({ error: "type must be dossier or pipeline_brief" });
      }
      const payloadSize = JSON.stringify(payload).length;
      if (payloadSize > 64_000) {
        return res.status(400).json({ error: "Payload too large (max 64 KB)" });
      }
      if (password && String(password).length > 256) {
        return res.status(400).json({ error: "Password too long (max 256 characters)" });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Math.min(Math.max(1, expiresInDays), 30));

      let passwordHash: string | undefined;
      if (password) {
        passwordHash = crypto.createHash("sha256").update(password).digest("hex");
      }

      const link = await storage.createSharedLink({
        type,
        entityId: entityId ?? undefined,
        payload,
        createdBy: userId ?? undefined,
        expiresAt,
        passwordHash,
      });

      const configuredBase = process.env.APP_BASE_URL?.replace(/\/$/, "");
      const originHeader = (req.headers.origin ?? "").replace(/\/$/, "");
      const hostFallback = `https://${req.headers.host}`;
      const baseUrl = configuredBase || originHeader || hostFallback;
      const url = `${baseUrl}/share/${link.token}`;

      res.json({ token: link.token, expiresAt: link.expiresAt, url });
    } catch (err: any) {
      console.error("[share/create]", err?.message);
      res.status(500).json({ error: err.message ?? "Failed to create shared link" });
    }
  });

  type ResolvedShareLink = { type: string; entityId: string | null; payload: unknown; expiresAt: Date; createdAt: Date };
  type ShareLinkError = { httpStatus: number; body: Record<string, unknown> };

  async function fetchSharedLinkData(token: string, password: string | undefined): Promise<{ ok: true; data: ResolvedShareLink } | { ok: false; error: ShareLinkError }> {
    const link = await storage.getSharedLinkByToken(token);
    if (!link) {
      return { ok: false, error: { httpStatus: 404, body: { error: "Link not found" } } };
    }
    if (link.expiresAt < new Date()) {
      return { ok: false, error: { httpStatus: 410, body: { error: "Link has expired" } } };
    }
    if (link.passwordHash) {
      if (!password) {
        return { ok: false, error: { httpStatus: 401, body: { error: "Password required", passwordRequired: true } } };
      }
      const hash = crypto.createHash("sha256").update(password).digest("hex");
      if (hash !== link.passwordHash) {
        return { ok: false, error: { httpStatus: 401, body: { error: "Incorrect password", passwordRequired: true } } };
      }
    }
    return { ok: true, data: { type: link.type, entityId: link.entityId, payload: link.payload, expiresAt: link.expiresAt, createdAt: link.createdAt } };
  }

  app.get("/api/share/:token", async (req, res) => {
    try {
      const result = await fetchSharedLinkData(req.params.token, undefined);
      if (!result.ok) return res.status(result.error.httpStatus).json(result.error.body);
      res.json(result.data);
    } catch (err: any) {
      console.error("[share/get]", err?.message);
      res.status(500).json({ error: err.message ?? "Failed to retrieve shared link" });
    }
  });

  app.post("/api/share/:token/resolve", async (req, res) => {
    try {
      const { password } = req.body as { password?: string };
      const result = await fetchSharedLinkData(req.params.token, password);
      if (!result.ok) return res.status(result.error.httpStatus).json(result.error.body);
      res.json(result.data);
    } catch (err: any) {
      console.error("[share/resolve]", err?.message);
      res.status(500).json({ error: err.message ?? "Failed to retrieve shared link" });
    }
  });

  // ── EdenMarket routes ─────────────────────────────────────────────────────────

  // GET /api/market/activity-summary — used by the IndustryDashboard EdenMarket widget.
  // Returns counts that work for both subscribers and non-subscribers so the upsell card
  // always has a number to show (per task #664 spec).
  // Optionally reads bearer token to populate hasAccess + matchingFilters for logged-in users.
  app.get("/api/market/activity-summary", async (req, res) => {
    let newListings7d = 0;
    let matchingFilters = 0;
    let hasAccess = false;

    let activeListings: any[] = [];
    try {
      activeListings = await storage.getMarketListings({ status: "active" });
    } catch {
      activeListings = [];
    }

    try {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      newListings7d = activeListings.filter((l: any) => {
        const ts = l?.createdAt ? new Date(l.createdAt).getTime() : 0;
        return ts >= sevenDaysAgo;
      }).length;
    } catch {
      // ignore
    }

    try {
      const userId = await tryGetUserId(req);
      if (userId) {
        // Task #752 — use effective entitlement (admin / stripe / org)
        // so per-user grants and admin revokes are reflected in the
        // upsell widget instead of relying on org.edenMarketAccess only.
        const eff = await getEffectiveMarketAccess(userId);
        hasAccess = eff.access;

        const profile = await storage.getIndustryProfileByUserId(userId);
        if (profile) {
          const tas = (profile.therapeuticAreas || []).map(s => s.toLowerCase());
          const mods = (profile.modalities || []).map(s => s.toLowerCase());
          const stages = (profile.dealStages || []).map(s => s.toLowerCase());
          const hasFilters = tas.length || mods.length || stages.length;
          if (hasFilters) {
            matchingFilters = activeListings.filter((l: any) => {
              const ta = (l?.therapeuticArea || "").toLowerCase();
              const mod = (l?.modality || "").toLowerCase();
              const st = (l?.stage || "").toLowerCase();
              const taOk = !tas.length || tas.includes(ta);
              const modOk = !mods.length || mods.includes(mod);
              const stOk = !stages.length || stages.includes(st);
              return taOk && modOk && stOk;
            }).length;
          }
        }
      }
    } catch {
      // ignore — public endpoint, defaults stay at 0/false
    }

    res.json({ newListings7d, matchingFilters, hasAccess });
  });

  // GET /api/market/access — check whether the current user has EdenMarket
  // access. Task #752: combines per-user entitlement (admin- or Stripe-granted
  // marketEntitlement on supabase user_metadata) with the legacy org-level
  // edenMarketAccess flag. Either grant route enables access.
  app.get("/api/market/access", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const eff = await getEffectiveMarketAccess(userId);
      res.json({
        access: eff.access,
        orgId: eff.orgState ? (await storage.getOrgForUser(userId))?.id ?? null : null,
        fullAccess: eff.fullAccess,
        inGrace: eff.inGrace,
        marketAccessExpiresAt: eff.marketAccessExpiresAt,
        source: eff.source,
        entitlement: eff.entitlement,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/market/checkout — Stripe checkout for EdenMarket subscription
  app.post("/api/market/checkout", verifyAnyAuth, async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Stripe is not configured on this server" });

    try {
      const userId = req.headers["x-user-id"] as string;
      const priceId = process.env.STRIPE_PRICE_EDENMARKET;
      if (!priceId) return res.status(503).json({ error: "STRIPE_PRICE_EDENMARKET env var not set" });

      let org = await storage.getOrgForUser(userId);
      if (!org) {
        const profile = await storage.getIndustryProfileByUserId(userId).catch(() => null);
        org = await storage.createOrganization({
          name: profile?.companyName?.trim() || "Personal Workspace",
          planTier: "none",
          seatLimit: 1,
          billingMethod: "stripe",
        });
        await storage.addOrgMember({ orgId: org.id, userId, role: "owner", inviteSource: "self_service", inviteStatus: "active" });
        await storage.setIndustryProfileOrg(userId, org.id);
      }

      // Only block when org has full active access (not in grace). Grace orgs
      // must be able to reactivate via this endpoint — that's the banner CTA.
      if (getMarketAccessState(org).hasFullAccess) {
        return res.status(409).json({ error: "Your organization already has EdenMarket access." });
      }

      let customerId: string;
      if (org.stripeCustomerId) {
        customerId = org.stripeCustomerId;
      } else {
        const customer = await stripe.customers.create({
          email: org.billingEmail ?? undefined,
          metadata: { orgId: String(org.id), product: "edenmarket" },
        });
        customerId = customer.id;
        await storage.updateOrganization(org.id, { stripeCustomerId: customerId });
      }

      const origin = (req.headers.origin ?? req.headers.referer ?? "").replace(/\/$/, "");
      const baseUrl = origin || `https://${req.headers.host}`;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/market?market_session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/market`,
        metadata: { orgId: String(org.id), product: "edenmarket" },
        subscription_data: { metadata: { orgId: String(org.id), product: "edenmarket" } },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error("[market/checkout]", err?.message);
      res.status(500).json({ error: err.message ?? "Failed to create checkout session" });
    }
  });

  // GET /api/market/verify-session — activate market access after checkout
  app.get("/api/market/verify-session", verifyAnyAuth, async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

    try {
      const sessionId = String(req.query.market_session_id ?? "");
      if (!sessionId) return res.status(400).json({ error: "market_session_id required" });

      const userId = req.headers["x-user-id"] as string;
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });

      // Verify this session is specifically for the EdenMarket product
      if (session.metadata?.product !== "edenmarket") {
        return res.status(400).json({ error: "Session is not for EdenMarket" });
      }

      const safeStatuses = ["paid", "no_payment_required"];
      if (!safeStatuses.includes(session.payment_status)) {
        return res.status(402).json({ error: "Payment not completed" });
      }

      // Optionally validate the price matches the configured EdenMarket price
      const expectedPriceId = process.env.STRIPE_PRICE_EDENMARKET;
      if (expectedPriceId) {
        const lineItems = (session as any).line_items?.data ?? [];
        const hasMarketPrice = lineItems.some((item: any) => item.price?.id === expectedPriceId);
        if (lineItems.length > 0 && !hasMarketPrice) {
          return res.status(400).json({ error: "Session does not contain EdenMarket price" });
        }
      }

      const orgId = parseInt(String(session.metadata?.orgId ?? "0"), 10);
      if (!orgId) return res.status(400).json({ error: "No orgId in session metadata" });

      // Verify the authenticated user belongs to this org
      const userOrg = await storage.getOrgForUser(userId);
      if (!userOrg || userOrg.id !== orgId) {
        return res.status(403).json({ error: "User is not a member of the purchasing org" });
      }

      const subId = typeof session.subscription === "string" ? session.subscription : (session.subscription as any)?.id ?? "";

      await storage.updateOrganization(orgId, {
        edenMarketAccess: true,
        edenMarketStripeSubId: subId || undefined,
        // Task #714 — explicit reactivation clears any prior grace state.
        marketAccessExpiresAt: null,
        marketGraceEmailSentAt: null,
      });

      if (subId) {
        await storage.createMarketSubscription({ orgId, stripeSubscriptionId: subId, status: "active" });
      }

      // Task #752 — mirror the org's new active state to each member's
      // per-user entitlement so admin-granted and Stripe-granted access
      // share a single source of truth on the client.
      await syncOrgMembersMarketEntitlement(orgId, true);

      res.json({ access: true });
    } catch (err: any) {
      console.error("[market/verify-session]", err?.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Eden Signal Score — intelligence-derived: uses linked EdenScout asset enrichment quality,
  // patent/IP signals, and clinical-stage trials inference. Falls back to listing-field score
  // when no ingestedAsset link exists.
  type IngestedAssetSignals = {
    completenessScore: number | null;
    patentStatus: string | null;
    ipType: string | null;
    developmentStage: string | null;
    mechanismOfAction: string | null;
    target: string | null;
  };
  function edenSignalScore(
    l: { ingestedAssetId?: number | null; mechanism?: string | null; priceRangeMin?: number | null; aiSummary?: string | null; therapeuticArea?: string | null; modality?: string | null; stage?: string | null; engagementStatus?: string | null },
    linked?: IngestedAssetSignals | null
  ): number {
    let s = 0;
    if (l.ingestedAssetId && linked) {
      s += 30;  // EdenScout linkage base
      // EDEN enrichment completeness (proportional, up to 20 pts)
      if (linked.completenessScore != null) s += Math.round((linked.completenessScore / 100) * 20);
      // Patents signal: asset has known IP status
      if (linked.patentStatus || linked.ipType) s += 10;
      // Trials signal: clinical stage implies registered trials
      const clinicalStages = ["phase 1", "phase 2", "phase 3", "approved", "phase i", "phase ii", "phase iii"];
      if (linked.developmentStage && clinicalStages.includes(linked.developmentStage.toLowerCase())) s += 10;
      // Scientific specificity from EdenScout intelligence
      if (linked.mechanismOfAction || linked.target) s += 10;
    } else {
      if (l.ingestedAssetId) s += 30; // linked but asset not resolved yet
    }
    // Listing-level market signals (seller-provided)
    if (l.priceRangeMin) s += 10;
    if (l.aiSummary) s += 5;
    if (l.mechanism) s += 5;
    if (l.therapeuticArea && l.modality && l.stage) s += 10; // full classification
    if (l.engagementStatus && l.engagementStatus !== "closed") s += 5;
    return Math.min(100, s);
  }

  // ── Per-field blinding helpers ─────────────────────────────────────────────
  // Sellers and admins always see the full record. For everyone else we mask
  // each field independently based on the listing's `blindFields` map. The
  // legacy `blind` boolean is treated as a derived "any field masked" flag.
  type BlindFields = NonNullable<typeof marketListings.$inferSelect.blindFields>;
  function normalizeBlindFields(l: { blind?: boolean | null; blindFields?: BlindFields | null }): BlindFields {
    const bf = (l.blindFields ?? {}) as BlindFields;
    // Backwards-compat: if a legacy listing has blind=true and no per-field map,
    // treat it as masking name + institution + inventor names.
    if (l.blind && !bf.assetName && !bf.institution && !bf.inventorNames && !bf.exactPatentIds && !bf.mechanismDetail) {
      return { assetName: true, institution: true, inventorNames: true };
    }
    return bf;
  }
  function anyBlinded(bf: BlindFields): boolean {
    return !!(bf.assetName || bf.institution || bf.inventorNames || bf.exactPatentIds || bf.mechanismDetail);
  }
  function maskListingForViewer<T extends typeof marketListings.$inferSelect>(listing: T, isPrivileged: boolean): T {
    if (isPrivileged) return listing;
    const bf = normalizeBlindFields(listing);
    const out: T = { ...listing };
    if (bf.assetName) out.assetName = null;
    if (bf.mechanismDetail) out.mechanism = null;
    if (bf.exactPatentIds) {
      out.ipStatus = null;
      out.ipSummary = null;
    }
    // Keep legacy `blind` flag in sync as a derived "any field masked" indicator.
    out.blind = anyBlinded(bf);
    return out;
  }
  // For the intelligence panel: linked EdenScout enrichment can re-leak fields
  // the seller has chosen to blind. Mask the corresponding sub-fields.
  function maskEdenEnrichment<T extends Record<string, unknown> | null>(enrichment: T, bf: BlindFields, isPrivileged: boolean): T {
    if (isPrivileged || !enrichment) return enrichment;
    const e = { ...enrichment } as Record<string, unknown>;
    if (bf.assetName) e.assetName = null;
    if (bf.institution) {
      e.institution = null;
      e.sourceUrl = null; // URL itself can identify the institution
    }
    if (bf.inventorNames) {
      e.inventors = null;
    }
    if (bf.mechanismDetail) {
      e.mechanismOfAction = null;
      e.target = null;
      e.innovationClaim = null;
    }
    if (bf.exactPatentIds) {
      e.ipType = null;
    }
    return e as T;
  }

  // GET /api/market/listings — buyer feed (active listings)
  app.get("/api/market/listings", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });

      const { therapeuticArea, modality, stage, engagementStatus } = req.query as Record<string, string | undefined>;
      const listings = await storage.getMarketListings({ status: "active", therapeuticArea, modality, stage, engagementStatus });

      // Batch-fetch linked EdenScout assets for signal score computation
      const linkedIds = [...new Set(listings.map(l => l.ingestedAssetId).filter((id): id is number => id != null))];
      const linkedAssets = linkedIds.length > 0
        ? await db.select({
            id: ingestedAssets.id,
            completenessScore: ingestedAssets.completenessScore,
            patentStatus: ingestedAssets.patentStatus,
            ipType: ingestedAssets.ipType,
            developmentStage: ingestedAssets.developmentStage,
            mechanismOfAction: ingestedAssets.mechanismOfAction,
            target: ingestedAssets.target,
          }).from(ingestedAssets).where(inArray(ingestedAssets.id, linkedIds))
        : [];
      const linkedMap = new Map(linkedAssets.map(a => [a.id, a]));

      const eoiCounts = await Promise.all(listings.map(l => storage.getMarketEoiCount(l.id)));
      const myEois = await storage.getMarketEoisByBuyer(userId);
      const myEoiMap = new Map(myEois.map(e => [e.listingId, e.status]));

      // Batch resolve seller-verification status off the listing's owning org
      // (listing.orgId is set at creation time — see createMarketListing). This is
      // architecturally sounder than going through the seller user's current org
      // and is robust if a user later belongs to multiple orgs. We expose only a
      // boolean — never leak the seller's org name or other identifying info
      // (esp. for blind listings).
      const orgIds = [...new Set(listings.map(l => l.orgId).filter((id): id is number => id != null))];
      const orgs = await Promise.all(orgIds.map(oid => storage.getOrganization(oid).catch(() => null)));
      const orgVerifiedMap = new Map<number, boolean>();
      orgIds.forEach((oid, i) => orgVerifiedMap.set(oid, !!orgs[i]?.marketSellerVerifiedAt));

      const result = listings.map((l, i) => {
        const isPrivileged = l.sellerId === userId;
        const masked = maskListingForViewer(l, isPrivileged);
        return {
          ...masked,
          eoiCount: eoiCounts[i],
          myEoiStatus: myEoiMap.get(l.id) ?? null,
          edenSignalScore: edenSignalScore(l, l.ingestedAssetId ? linkedMap.get(l.ingestedAssetId) ?? null : null),
          sellerVerified: l.orgId != null ? (orgVerifiedMap.get(l.orgId) ?? false) : false,
        };
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/market/listings — create listing (seller)
  app.post("/api/market/listings", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      // Task #714 — strict gate: writes blocked during 30-day grace period.
      const accessState = getMarketAccessState(org);
      if (!accessState.hasFullAccess || !org) {
        return res.status(403).json(accessState.inGrace
          ? { error: "EdenMarket is read-only during your grace period — reactivate your subscription to create listings.", marketGrace: true, marketAccessExpiresAt: accessState.expiresAt }
          : { error: "EdenMarket subscription required" });
      }

      const schema = z.object({
        therapeuticArea: z.string().min(1),
        modality: z.string().min(1),
        stage: z.string().min(1),
        assetName: z.string().optional().nullable(),
        blind: z.boolean().default(false),
        blindFields: z.object({
          assetName: z.boolean().optional(),
          institution: z.boolean().optional(),
          inventorNames: z.boolean().optional(),
          exactPatentIds: z.boolean().optional(),
          mechanismDetail: z.boolean().optional(),
        }).optional(),
        ingestedAssetId: z.number().int().optional().nullable(),
        milestoneHistory: z.string().optional().nullable(),
        mechanism: z.string().optional().nullable(),
        ipStatus: z.string().optional().nullable(),
        ipSummary: z.string().optional().nullable(),
        askingPrice: z.string().optional().nullable(),
        priceRangeMin: z.number().int().optional().nullable(),
        priceRangeMax: z.number().int().optional().nullable(),
        engagementStatus: z.string().default("actively_seeking"),
        status: z.enum(["draft", "pending"]).optional(),
      });

      const data = schema.parse(req.body);
      // Derive `blind` boolean from per-field map so the legacy badge flag stays correct.
      const blindFieldsIn = data.blindFields ?? {};
      data.blindFields = blindFieldsIn;
      data.blind = !!(blindFieldsIn.assetName || blindFieldsIn.institution || blindFieldsIn.inventorNames || blindFieldsIn.exactPatentIds || blindFieldsIn.mechanismDetail) || data.blind;

      // Verify ingestedAssetId exists if provided
      if (data.ingestedAssetId != null) {
        const [linked] = await db.select({ id: ingestedAssets.id }).from(ingestedAssets).where(eq(ingestedAssets.id, data.ingestedAssetId)).limit(1);
        if (!linked) return res.status(400).json({ error: "ingestedAssetId does not reference a valid EdenScout asset." });
      }

      // Generate AI summary using GPT-4o-mini
      let aiSummary: string | null = null;
      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const prompt = `Write a concise one-paragraph deal summary for a biopharma asset listing:
Therapeutic Area: ${data.therapeuticArea}
Modality: ${data.modality}
Clinical Stage: ${data.stage}
Mechanism: ${data.mechanism || "Not specified"}
IP Status: ${data.ipStatus || "Not specified"}
${data.assetName && !data.blind ? `Asset Name: ${data.assetName}` : "(Blind listing — name withheld)"}
Price Range: ${data.priceRangeMin ? `$${data.priceRangeMin}M–$${data.priceRangeMax}M` : data.askingPrice || "Not disclosed"}

Write in a professional deal memo tone. 2–4 sentences. Focus on the strategic value and fit.`;

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 180,
        });
        aiSummary = completion.choices[0]?.message?.content?.trim() ?? null;
      } catch (aiErr: any) {
        console.warn("[market/listings] AI summary failed:", aiErr?.message);
      }

      const listingStatus = data.status === "draft" ? "draft" : "pending";
      const listing = await storage.createMarketListing({
        ...data,
        sellerId: userId,
        orgId: org.id,
        aiSummary,
        status: listingStatus,
      });

      res.json(listing);
    } catch (err: any) {
      console.error("[market/listings POST]", err?.message);
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/market/listings/suggest-asset — fuzzy search ingested_assets for listing creation assist
  // IMPORTANT: Must be declared before /:id to avoid Express treating "suggest-asset" as a param value
  app.get("/api/market/listings/suggest-asset", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const q = String(req.query.q ?? "").trim();
      const ta = String(req.query.ta ?? "").trim();
      const query = [q, ta].filter(Boolean).join(" ");
      if (query.length < 2) return res.json([]);

      // Fetch a wider pool, then re-rank: institution-aware matches rise to top
      const pool = await storage.keywordSearchIngestedAssets(query, 12);
      // Institution signal: if query contains a word that appears in institution name, boost it
      const qLower = q.toLowerCase();
      const scored = pool.map(r => {
        let rank = 0;
        if (r.institution && qLower && r.institution.toLowerCase().includes(qLower)) rank += 10;
        if (r.completenessScore) rank += r.completenessScore / 100; // tiebreak by data quality
        return { r, rank };
      });
      scored.sort((a, b) => b.rank - a.rank);
      const results = scored.slice(0, 3).map(x => x.r); // hard cap at 3 suggestions
      res.json(results.map(r => ({
        id: r.id,
        assetName: r.assetName,
        institution: r.institution,
        modality: r.modality,
        developmentStage: r.developmentStage,
        indication: r.indication,
        target: r.target,
        innovationClaim: r.innovationClaim,
        mechanismOfAction: r.mechanismOfAction,
        ipType: r.ipType,
        completenessScore: r.completenessScore,
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/market/listings/:id — single listing detail
  app.get("/api/market/listings/:id", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });

      const id = parseInt(String(req.params.id), 10);
      const listing = await storage.getMarketListing(id);
      if (!listing) return res.status(404).json({ error: "Listing not found" });

      const isSeller = listing.sellerId === userId;
      if (!isSeller && listing.status !== "active") {
        return res.status(404).json({ error: "Listing not found" });
      }

      const eoiCount = await storage.getMarketEoiCount(id);
      const myEoi = await storage.getBuyerEoiForListing(id, userId);
      // Derive seller verification from the listing's owning org (listing.orgId),
      // not from the seller user's current org membership.
      const sellerOrg = listing.orgId != null
        ? await storage.getOrganization(listing.orgId).catch(() => null)
        : null;

      const masked = maskListingForViewer(listing, isSeller);
      res.json({
        ...masked,
        blindFields: normalizeBlindFields(listing),
        eoiCount,
        myEoi: myEoi ?? null,
        sellerVerified: !!sellerOrg?.marketSellerVerifiedAt,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/market/listings/:id/intelligence — Eden Intelligence panel data
  app.get("/api/market/listings/:id/intelligence", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid listing id" });

      const listing = await storage.getMarketListing(id);
      if (!listing) return res.status(404).json({ error: "Listing not found" });

      // Admin bypass — Supabase Bearer token + ADMIN_EMAILS allowlist
      const isAdmin = !!(await getAdminUser(req));

      if (!isAdmin) {
        const org = await storage.getOrgForUser(userId);
        if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
        const isSeller = listing.sellerId === userId;
        if (!isSeller && listing.status !== "active") return res.status(404).json({ error: "Not found" });
      }

      const searchQuery = [listing.therapeuticArea, listing.modality].filter(Boolean).join(" ");
      const patentQuery = [listing.therapeuticArea, listing.mechanism?.slice(0, 80) ?? ""].filter(Boolean).join(" ");

      const [relatedRaw, linkedRaw, trialsRaw, patentsRaw, compsRaw] = await Promise.allSettled([
        storage.keywordSearchIngestedAssets(searchQuery, 10),
        listing.ingestedAssetId
          ? db.select().from(ingestedAssets).where(eq(ingestedAssets.id, listing.ingestedAssetId)).limit(1)
          : Promise.resolve([] as typeof ingestedAssets.$inferSelect[]),
        searchClinicalTrials(listing.therapeuticArea, 5).catch(() => []),
        searchPatents(patentQuery, 5).catch(() => []),
        storage.keywordSearchIngestedAssets(listing.therapeuticArea, 15),
      ]);

      const relatedTtoAssets = relatedRaw.status === "fulfilled"
        ? relatedRaw.value
            .filter(a => a.id !== listing.ingestedAssetId)
            .slice(0, 5)
            .map(a => ({ id: a.id, assetName: a.assetName, institution: a.institution, modality: a.modality, developmentStage: a.developmentStage, indication: a.indication, completenessScore: a.completenessScore }))
        : [];

      const linked = linkedRaw.status === "fulfilled" ? (linkedRaw.value[0] ?? null) : null;

      const activeTrials = trialsRaw.status === "fulfilled"
        ? trialsRaw.value.slice(0, 5).map(s => ({ title: s.title, url: s.url, date: s.date, stage: s.stage_hint, sponsor: s.institution_or_sponsor }))
        : [];

      const relatedPatents = patentsRaw.status === "fulfilled"
        ? patentsRaw.value.slice(0, 5).map(s => ({ title: s.title, url: s.url, date: s.date, owner: s.institution_or_sponsor || s.authors_or_owner }))
        : [];

      // Comparable deals: filter by TA + modality + stage to surface truly comparable transactions
      const LICENSED_STATUSES = ["exclusively licensed", "non-exclusively licensed", "startup formed", "optioned"];
      const normStage = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, "");
      const normModality = (m: string | null | undefined) => (m ?? "").toLowerCase();
      const listingStage = normStage(listing.stage);
      const listingModality = normModality(listing.modality);
      const comparableDeals = compsRaw.status === "fulfilled"
        ? compsRaw.value
            .filter(a => {
              if (a.id === listing.ingestedAssetId) return false;
              if (!a.licensingReadiness || !LICENSED_STATUSES.includes(a.licensingReadiness)) return false;
              // Require modality match if listing specifies one
              if (listingModality && normModality(a.modality) !== listingModality) return false;
              // Stage match: same bucket (preclinical vs clinical) if listing has a stage
              if (listingStage) {
                const aStage = normStage(a.developmentStage);
                const isClinical = (s: string) => ["phase1","phase2","phase3","phasei","phaseii","phaseiii","approved"].includes(s);
                if (isClinical(listingStage) !== isClinical(aStage)) return false;
              }
              return true;
            })
            .slice(0, 5)
            .map(a => ({ id: a.id, assetName: a.assetName, institution: a.institution, modality: a.modality, developmentStage: a.developmentStage, licensingReadiness: a.licensingReadiness }))
        : [];

      const rawEnrichment = linked ? {
        assetName: linked.assetName,
        institution: linked.institution,
        target: linked.target,
        mechanismOfAction: linked.mechanismOfAction,
        innovationClaim: linked.innovationClaim,
        unmetNeed: linked.unmetNeed,
        comparableDrugs: linked.comparableDrugs,
        licensingReadiness: linked.licensingReadiness,
        completenessScore: linked.completenessScore,
        ipType: linked.ipType,
        sourceUrl: linked.sourceUrl,
        inventors: linked.inventors,
      } : null;
      const isPrivilegedView = isAdmin || listing.sellerId === userId;
      const bf = normalizeBlindFields(listing);
      const edenEnrichment = maskEdenEnrichment(rawEnrichment, bf, isPrivilegedView);

      res.json({ relatedTtoAssets, activeTrials, relatedPatents, comparableDeals, edenEnrichment, blindFields: bf, linkedAssetId: listing.ingestedAssetId ?? null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/market/listings/:id — update own listing
  app.patch("/api/market/listings/:id", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const id = parseInt(String(req.params.id), 10);
      const listing = await storage.getMarketListing(id);
      if (!listing) return res.status(404).json({ error: "Listing not found" });
      if (listing.sellerId !== userId) return res.status(403).json({ error: "Forbidden" });

      // Sellers cannot self-activate from draft/pending — only admins can move a listing to active.
      // Exception: paused listings can be resumed (paused→active) because they were already admin-approved.
      const allowed = z.object({
        assetName: z.string().optional().nullable(),
        blind: z.boolean().optional(),
        blindFields: z.object({
          assetName: z.boolean().optional(),
          institution: z.boolean().optional(),
          inventorNames: z.boolean().optional(),
          exactPatentIds: z.boolean().optional(),
          mechanismDetail: z.boolean().optional(),
        }).optional(),
        ingestedAssetId: z.number().int().optional().nullable(),
        therapeuticArea: z.string().optional(),
        modality: z.string().optional(),
        stage: z.string().optional(),
        milestoneHistory: z.string().optional().nullable(),
        mechanism: z.string().optional().nullable(),
        ipStatus: z.string().optional().nullable(),
        ipSummary: z.string().optional().nullable(),
        askingPrice: z.string().optional().nullable(),
        priceRangeMin: z.number().int().optional().nullable(),
        priceRangeMax: z.number().int().optional().nullable(),
        engagementStatus: z.string().optional(),
        status: z.enum(["active", "paused", "closed", "pending"]).optional(),
      });

      const data = allowed.parse(req.body);

      // Derive `blind` boolean from per-field map when provided.
      if (data.blindFields !== undefined) {
        const bf = data.blindFields ?? {};
        data.blind = !!(bf.assetName || bf.institution || bf.inventorNames || bf.exactPatentIds || bf.mechanismDetail);
      }

      // Verify ingestedAssetId exists if provided
      if (data.ingestedAssetId != null) {
        const [linked] = await db.select({ id: ingestedAssets.id }).from(ingestedAssets).where(eq(ingestedAssets.id, data.ingestedAssetId)).limit(1);
        if (!linked) return res.status(400).json({ error: "ingestedAssetId does not reference a valid EdenScout asset." });
      }

      // Block self-activation from draft or pending (must go through admin review)
      if (data.status === "active" && listing.status !== "paused") {
        return res.status(403).json({ error: "Listings can only be activated by admin. Submit for review first." });
      }
      // Block setting back to pending unless explicitly re-submitting a draft
      if (data.status === "pending" && listing.status !== "draft") {
        return res.status(400).json({ error: "Only draft listings can be submitted for review." });
      }

      const updated = await storage.updateMarketListing(id, userId, data);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // DELETE /api/market/listings/:id
  app.delete("/api/market/listings/:id", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const id = parseInt(String(req.params.id), 10);
      const listing = await storage.getMarketListing(id);
      if (!listing) return res.status(404).json({ error: "Listing not found" });
      if (listing.sellerId !== userId) return res.status(403).json({ error: "Forbidden" });
      await storage.deleteMarketListing(id, userId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/market/my-listings — seller's own listings
  app.get("/api/market/my-listings", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const listings = await storage.getMarketListingsBySeller(userId);
      const eoiCounts = await Promise.all(listings.map(l => storage.getMarketEoiCount(l.id)));
      res.json(listings.map((l, i) => ({ ...l, eoiCount: eoiCounts[i] })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/market/eois — submit EOI
  app.post("/api/market/eois", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      // Task #714 — strict gate: writes blocked during 30-day grace period.
      const eoiAccessState = getMarketAccessState(org);
      if (!eoiAccessState.hasFullAccess) {
        return res.status(403).json(eoiAccessState.inGrace
          ? { error: "EdenMarket is read-only during your grace period — reactivate your subscription to submit EOIs.", marketGrace: true, marketAccessExpiresAt: eoiAccessState.expiresAt }
          : { error: "EdenMarket subscription required" });
      }

      const schema = z.object({
        listingId: z.number().int(),
        company: z.string().min(1),
        role: z.string().min(1),
        rationale: z.string().min(1),
        budgetRange: z.string().optional().nullable(),
        timeline: z.string().optional().nullable(),
      });

      const data = schema.parse(req.body);

      const listing = await storage.getMarketListing(data.listingId);
      if (!listing || listing.status !== "active") {
        return res.status(404).json({ error: "Listing not found or not active" });
      }

      const existing = await storage.getBuyerEoiForListing(data.listingId, userId);
      if (existing) return res.status(409).json({ error: "You have already submitted an EOI for this listing" });

      const eoi = await storage.createMarketEoi({ ...data, buyerId: userId });

      // Notify admin
      try {
        await sendAdminNotificationEmail(
          `New EOI submitted — Listing #${data.listingId}`,
          `<p>A new Expression of Interest has been submitted for listing #${data.listingId}.</p>
           <p>Company: ${data.company}<br>Role: ${data.role}</p>
           <p><a href="${APP_URL}/market/listing/${data.listingId}">View listing</a></p>`
        );
      } catch (e) { console.warn("[market] admin EOI-submitted email failed", e); }

      // Notify seller via their org billing email
      try {
        const sellerOrg = await storage.getOrgForUser(listing.sellerId);
        const sellerEmail = sellerOrg?.billingEmail;
        if (sellerEmail) {
          const assetLabel = listing.blind ? `a blind ${listing.therapeuticArea} ${listing.modality} listing` : (listing.assetName || `Listing #${listing.id}`);
          await sendMarketAdHocEmail(
            sellerEmail,
            `New Expression of Interest received — ${assetLabel}`,
            `<p>A qualified buyer has submitted an Expression of Interest for <strong>${assetLabel}</strong>.</p>
             <p>Log in to your <a href="${APP_URL}/market/seller">Seller Dashboard</a> to review the EOI details.</p>
             <p style="font-size:12px;color:#9ca3af">Buyer identity is kept confidential until you accept and both parties agree to reveal.</p>`
          );
        }
      } catch (e) { console.warn("[market] seller EOI-submitted email failed", e); }

      res.json(eoi);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/market/my-eois — buyer's submitted EOIs
  app.get("/api/market/my-eois", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const eois = await storage.getMarketEoisByBuyer(userId);
      res.json(eois);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/market/seller/eois — EOIs on seller's listings
  app.get("/api/market/seller/eois", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const listings = await storage.getMarketListingsBySeller(userId);
      const listingIds = listings.map(l => l.id);
      if (!listingIds.length) return res.json([]);

      const eoisByListing = await Promise.all(
        listingIds.map(async id => {
          const eois = await storage.getMarketEoisForListing(id);
          // Sellers see full buyer details (company/role/rationale) for all EOIs
          // so they can make an informed accept/decline decision — this is the
          // point of the seller review step. Deep financial/IP data stays gated
          // behind NDA inside the deal room.
          return { listingId: id, eois };
        })
      );
      res.json(eoisByListing);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: EdenMarket ─────────────────────────────────────────────────────────
  // All admin/market routes are mounted under /api/admin and protected by the
  // requireAdmin middleware (Supabase Bearer token + ADMIN_EMAILS allowlist).

  async function logDealEvent(dealId: number, actorId: string, eventType: string, detail?: string) {
    try {
      await db.execute(
        sql`INSERT INTO market_deal_events (deal_id, actor_id, event_type, detail) VALUES (${dealId}, ${actorId}, ${eventType}, ${detail ?? null})`
      );
    } catch (e) { console.warn("[market] deal event log failed", dealId, eventType, e); }
  }

  // Returns a label (org name, falling back to "the seller"/"the buyer") and
  // the org's billing email for the *other* party in a deal.
  async function resolveDealRecipient(deal: { id: number; sellerId: string; buyerId: string; listingId: number }, actorId: string) {
    const recipientId = deal.sellerId === actorId ? deal.buyerId : deal.sellerId;
    const actorIsSeller = deal.sellerId === actorId;
    const [recipientOrg, actorOrg, listing] = await Promise.all([
      storage.getOrgForUser(recipientId).catch(() => null),
      storage.getOrgForUser(actorId).catch(() => null),
      storage.getMarketListing(deal.listingId).catch(() => null),
    ]);
    const assetLabel = listing?.blind
      ? `a ${listing.therapeuticArea} ${listing.modality} opportunity`
      : (listing?.assetName || `Listing #${deal.listingId}`);
    return {
      recipientId,
      recipientEmail: recipientOrg?.billingEmail ?? null,
      recipientName: recipientOrg?.name ?? "",
      // We never reveal the counterparty's org name on a *blind* listing —
      // identity stays generic until the seller un-blinds it.
      actorLabel: listing?.blind
        ? (actorIsSeller ? "The seller" : "A prospective buyer")
        : (actorOrg?.name ?? (actorIsSeller ? "The seller" : "The buyer")),
      assetLabel,
      dealUrl: `${APP_URL}/market/deals/${deal.id}`,
    };
  }

  async function notifyDealRoomDocument(deal: { id: number; sellerId: string; buyerId: string; listingId: number }, uploaderId: string, fileName: string) {
    const r = await resolveDealRecipient(deal, uploaderId);
    if (!r.recipientEmail) return; // no email on file → nothing to do
    await sendDealRoomDocumentEmail(r.recipientEmail, r.recipientName, r.actorLabel, r.dealUrl, r.assetLabel, fileName);
  }

  async function notifyDealRoomMessage(deal: { id: number; sellerId: string; buyerId: string; listingId: number }, senderId: string, body: string) {
    const r = await resolveDealRecipient(deal, senderId);
    if (!r.recipientEmail) return;
    // Throttle: at most one message email per (deal, recipient) per hour.
    const now = Date.now();
    const key = `${deal.id}:${r.recipientId}`;
    const last = dealMessageEmailLastSent.get(key) ?? 0;
    if (now - last < 60 * 60 * 1000) return;
    dealMessageEmailLastSent.set(key, now);
    try {
      await sendDealRoomMessageEmail(r.recipientEmail, r.recipientName, r.actorLabel, r.dealUrl, r.assetLabel, body);
    } catch (e) {
      // Roll back the throttle stamp so a transient send failure doesn't
      // silence the next legitimate notification for an hour.
      dealMessageEmailLastSent.delete(key);
      throw e;
    }
  }

  app.get("/api/admin/market/stats", async (req, res) => {
    try {
      const stats = await storage.getMarketAdminStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/market/listings", async (req, res) => {
    try {
      const { status } = req.query as { status?: string };
      const listings = await storage.getMarketListings(status ? { status } : undefined);
      const eoiCounts = await Promise.all(listings.map(l => storage.getMarketEoiCount(l.id)));
      res.json(listings.map((l, i) => ({ ...l, eoiCount: eoiCounts[i] })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/market/listings/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const schema = z.object({
        status: z.enum(["active", "pending", "paused", "closed", "draft"]),
        adminNote: z.string().optional(),
      });
      const data = schema.parse(req.body);
      const prevListing = await storage.getMarketListing(id);
      const updated = await storage.adminUpdateMarketListing(id, data);

      // EdenScout → EdenMarket availability signal:
      // When a listing goes "active" for the first time and it's linked to an ingestedAsset,
      // notify all users who have that asset saved in their EdenScout portfolio.
      if (data.status === "active" && prevListing?.status !== "active" && updated?.ingestedAssetId) {
        const assetId = updated.ingestedAssetId;
        try {
          const saved = await db.select({ userId: savedAssets.userId })
            .from(savedAssets)
            .where(eq(savedAssets.ingestedAssetId, assetId))
            .then(rows => [...new Set(rows.map(r => r.userId).filter((u): u is string => u !== null))]);

          const assetLabel = updated.blind
            ? `a ${updated.therapeuticArea} ${updated.modality} asset`
            : (updated.assetName || `a ${updated.therapeuticArea} asset`);

          const notifMessage = `An asset you track in EdenScout — ${assetLabel} — is now listed in EdenMarket.`;
          const { enqueueListingAvailable } = await import("./lib/marketEmailCoalescer");
          await Promise.allSettled(saved.map(async uid => {
            // Insert in-app notification (deduplicated by user+listing via DB unique idx)
            await db.insert(marketAvailabilityNotifications).values({
              userId: uid,
              listingId: updated.id,
              ingestedAssetId: assetId,
              message: notifMessage,
            }).onConflictDoNothing().catch(() => {});
            // Enqueue email — coalesced per-user with a 5-min debounce so a bulk
            // status flip becomes one summary email rather than one per listing.
            const userOrg = await storage.getOrgForUser(uid);
            const email = userOrg?.billingEmail;
            if (email) {
              enqueueListingAvailable(email, updated.id, assetLabel);
            }
          }));
        } catch (e) { console.warn("[market] availability signal emails failed", e); }
      }

      // Saved-search fan-out (Task #713): on first activation, evaluate every
      // saved search against this listing and notify matching buyers — once
      // per (user, listing) regardless of how many of their searches matched
      // and on top of the EdenScout-link path above.
      if (data.status === "active" && prevListing?.status !== "active" && updated) {
        try {
          const { fanOutSavedSearchesForListing } = await import("./lib/marketSavedSearchMatcher");
          const { enqueueListingAvailable } = await import("./lib/marketEmailCoalescer");
          const newlyNotified = await fanOutSavedSearchesForListing(updated);
          const assetLabel = updated.blind
            ? `a ${updated.therapeuticArea} ${updated.modality} listing`
            : (updated.assetName || `a ${updated.therapeuticArea} listing`);
          await Promise.allSettled(newlyNotified.map(async ({ userId: uid }) => {
            const userOrg = await storage.getOrgForUser(uid);
            const email = userOrg?.billingEmail;
            if (email) enqueueListingAvailable(email, updated.id, assetLabel);
          }));
        } catch (e) { console.warn("[market] saved-search fan-out failed", e); }
      }

      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ── Saved Searches (Task #713) ───────────────────────────────────────────
  app.get("/api/market/saved-searches", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const rows = await db.select()
        .from(marketSavedSearches)
        .where(eq(marketSavedSearches.userId, userId))
        .orderBy(desc(marketSavedSearches.createdAt));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/market/saved-searches", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const data = insertMarketSavedSearchSchema.parse({ ...req.body, userId });
      try {
        const [row] = await db.insert(marketSavedSearches).values({
          userId,
          name: data.name,
          keyword: data.keyword ?? null,
          filters: data.filters ?? {},
        }).returning();
        res.json(row);
      } catch (e: any) {
        if (String(e?.message || "").toLowerCase().includes("unique")) {
          return res.status(409).json({ error: "A saved search with that name already exists" });
        }
        throw e;
      }
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch("/api/market/saved-searches/:id", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const id = parseInt(String(req.params.id), 10);
      const schema = z.object({ name: z.string().min(1).max(120) });
      const { name } = schema.parse(req.body);
      try {
        const [row] = await db.update(marketSavedSearches)
          .set({ name })
          .where(and(eq(marketSavedSearches.id, id), eq(marketSavedSearches.userId, userId)))
          .returning();
        if (!row) return res.status(404).json({ error: "Saved search not found" });
        res.json(row);
      } catch (e: any) {
        if (String(e?.message || "").toLowerCase().includes("unique")) {
          return res.status(409).json({ error: "A saved search with that name already exists" });
        }
        throw e;
      }
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/market/saved-searches/:id", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const id = parseInt(String(req.params.id), 10);
      const [row] = await db.delete(marketSavedSearches)
        .where(and(eq(marketSavedSearches.id, id), eq(marketSavedSearches.userId, userId)))
        .returning();
      if (!row) return res.status(404).json({ error: "Saved search not found" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/market/notifications — unread EdenScout→EdenMarket availability alerts for current user
  app.get("/api/market/notifications", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const rows = await db.select()
        .from(marketAvailabilityNotifications)
        .where(and(
          eq(marketAvailabilityNotifications.userId, userId),
          isNull(marketAvailabilityNotifications.readAt),
        ))
        .orderBy(desc(marketAvailabilityNotifications.createdAt))
        .limit(20);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/market/notifications/read — mark all notifications read for current user
  app.patch("/api/market/notifications/read", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      await db.execute(sql`UPDATE market_availability_notifications SET read_at = NOW() WHERE user_id = ${userId} AND read_at IS NULL`);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/market/eois", async (req, res) => {
    try {
      const listings = await storage.getMarketListings();
      const result = await Promise.all(
        listings.map(async l => ({ listing: l, eois: await storage.getMarketEoisForListing(l.id) }))
      );
      res.json(result.filter(r => r.eois.length > 0));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/market/subscribers", async (req, res) => {
    try {
      const orgs = await storage.getMarketSubscriberOrgs();
      res.json(orgs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/admin/orgs/:id/market-access — admin grace-period controls
  // Task #733. Two operations:
  //   action="extend" + days=N (default 30) → push marketAccessExpiresAt forward
  //     by N days from the current expiry (or from now if no expiry set).
  //     edenMarketAccess remains true. Useful for support extensions.
  //   action="revoke" → immediately set edenMarketAccess=false and clear
  //     marketAccessExpiresAt. Use for fraud / compliance / hard-cancel.
  // All transitions emit a logAppEvent for audit.
  app.patch("/api/admin/orgs/:id/market-access", async (req, res) => {
    try {
      const orgId = parseInt(String(req.params.id), 10);
      if (isNaN(orgId)) return res.status(400).json({ error: "Invalid org id" });

      const schema = z.object({
        action: z.enum(["extend", "revoke"]),
        days: z.number().int().min(1).max(365).optional(),
      });
      const { action, days } = schema.parse(req.body);

      const org = await storage.getOrganization(orgId);
      if (!org) return res.status(404).json({ error: "Organization not found" });

      const adminUser = await getAdminUser(req);
      const adminUserId = adminUser?.id ?? "admin";
      const adminEmail = adminUser?.email ?? null;

      let updated;
      if (action === "extend") {
        const addDays = days ?? 30;
        const base = org.marketAccessExpiresAt
          ? new Date(org.marketAccessExpiresAt).getTime()
          : Date.now();
        // Never extend backwards: if the stored expiry is already in the past,
        // start from "now" so the extension always lands in the future.
        const start = Math.max(base, Date.now());
        const newExpiry = new Date(start + addDays * 24 * 60 * 60 * 1000);
        updated = await storage.updateOrganization(orgId, {
          edenMarketAccess: true,
          marketAccessExpiresAt: newExpiry,
        });
        logAppEvent("market_access_extended", {
          orgId, orgName: org.name,
          actorId: adminUserId, actorEmail: adminEmail,
          previousExpiresAt: org.marketAccessExpiresAt ?? null,
          newExpiresAt: newExpiry.toISOString(),
          addedDays: addDays,
        });
      } else {
        updated = await storage.updateOrganization(orgId, {
          edenMarketAccess: false,
          marketAccessExpiresAt: null,
        });
        // Task #752 — also clear stripe-sourced per-user entitlements.
        await syncOrgMembersMarketEntitlement(orgId, false);
        logAppEvent("market_access_revoked", {
          orgId, orgName: org.name,
          actorId: adminUserId, actorEmail: adminEmail,
          previouslyHadAccess: !!org.edenMarketAccess,
          previousExpiresAt: org.marketAccessExpiresAt ?? null,
        });
      }

      res.json(updated);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Invalid payload", details: err.errors });
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/admin/orgs/:id/market-seller-verification — admin marks an org
  // as a verified EdenMarket seller (or revokes verification).
  // Mounted under /api/admin → already gated by requireAdmin middleware.
  app.patch("/api/admin/orgs/:id/market-seller-verification", async (req, res) => {
    try {
      const orgId = parseInt(String(req.params.id), 10);
      if (isNaN(orgId)) return res.status(400).json({ error: "Invalid org id" });

      const schema = z.object({
        verified: z.boolean(),
        note: z.string().max(500).optional().nullable(),
      });
      const { verified, note } = schema.parse(req.body);

      const org = await storage.getOrganization(orgId);
      if (!org) return res.status(404).json({ error: "Organization not found" });

      const adminUser = await getAdminUser(req);
      const adminUserId = adminUser?.id ?? "admin";
      const adminEmail = adminUser?.email ?? null;

      const updated = await storage.updateOrganization(orgId, verified
        ? {
            marketSellerVerifiedAt: new Date(),
            marketSellerVerifiedBy: adminUserId, // immutable admin user id for audit
            marketSellerVerificationNote: note ?? null,
          }
        : {
            marketSellerVerifiedAt: null,
            marketSellerVerifiedBy: null,
            marketSellerVerificationNote: null,
          });

      // Durable audit log — survives server restarts and is queryable from admin tools.
      logAppEvent(verified ? "market_seller_verified" : "market_seller_unverified", {
        orgId,
        orgName: org.name,
        actorId: adminUserId,
        actorEmail: adminEmail,
        note: verified ? (note ?? null) : null,
        previouslyVerifiedAt: org.marketSellerVerifiedAt ?? null,
        previouslyVerifiedBy: org.marketSellerVerifiedBy ?? null,
      });

      res.json(updated);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Invalid payload", details: err.errors });
      res.status(500).json({ error: err.message });
    }
  });

  // ── EdenMarket — Deal Room ────────────────────────────────────────────────────

  // POST /api/market/eois/:id/accept — seller accepts an EOI, creating a deal
  app.post("/api/market/eois/:id/accept", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      // Task #714 — strict gate: writes blocked during 30-day grace period.
      const acceptAccessState = getMarketAccessState(org);
      if (!acceptAccessState.hasFullAccess) {
        return res.status(403).json(acceptAccessState.inGrace
          ? { error: "EdenMarket is read-only during your grace period — reactivate your subscription to accept EOIs.", marketGrace: true, marketAccessExpiresAt: acceptAccessState.expiresAt }
          : { error: "EdenMarket subscription required" });
      }

      const eoiId = parseInt(String(req.params.id), 10);
      if (isNaN(eoiId)) return res.status(400).json({ error: "Invalid EOI ID" });
      const listings = await storage.getMarketListingsBySeller(userId);
      const listingIds = listings.map(l => l.id);

      const [eoiRow] = await db.select().from(marketEois).where(eq(marketEois.id, eoiId)).limit(1);
      if (!eoiRow) return res.status(404).json({ error: "EOI not found" });
      if (!listingIds.includes(eoiRow.listingId)) return res.status(403).json({ error: "Not your listing" });
      if (eoiRow.status === "declined") return res.status(400).json({ error: "EOI already declined" });
      if (eoiRow.status === "accepted") {
        const existing = await storage.getDealForEoi(eoiId);
        if (existing) return res.json({ deal: existing, created: false });
      }

      // Update EOI status to accepted
      await db.update(marketEois).set({ status: "accepted" }).where(eq(marketEois.id, eoiId));

      // Create deal record
      const deal = await storage.createMarketDeal({
        listingId: eoiRow.listingId,
        eoiId: eoiRow.id,
        sellerId: userId,
        buyerId: eoiRow.buyerId,
        status: "nda_pending",
      });

      // Send notification emails to both parties
      const listing = await storage.getMarketListing(eoiRow.listingId);
      const assetLabel = listing?.blind
        ? `a ${listing.therapeuticArea} ${listing.modality} opportunity`
        : (listing?.assetName || `Listing #${eoiRow.listingId}`);
      const dealUrl = `${APP_URL}/market/deals/${deal.id}`;

      try {
        const sellerOrg = await storage.getOrgForUser(userId);
        if (sellerOrg?.billingEmail) {
          await sendMarketMutualInterestEmail(sellerOrg.billingEmail, sellerOrg.name ?? "", dealUrl, assetLabel);
        }
      } catch (e) { console.warn("[market] seller mutual-interest email failed", e); }
      try {
        const buyerOrg = await storage.getOrgForUser(eoiRow.buyerId);
        if (buyerOrg?.billingEmail) {
          await sendMarketMutualInterestEmail(buyerOrg.billingEmail, buyerOrg.name ?? "", dealUrl, assetLabel);
        }
      } catch (e) { console.warn("[market] buyer mutual-interest email failed", e); }
      try {
        await sendAdminNotificationEmail(`Deal created — #${deal.id} — ${assetLabel}`, `<p>Seller accepted EOI #${eoiId}. Deal #${deal.id} created. <a href="${APP_URL}/admin">View admin</a></p>`);
      } catch (e) { console.warn("[market] admin deal-created email failed", e); }

      res.json({ deal, created: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/market/eois/:id/decline — seller declines an EOI
  app.post("/api/market/eois/:id/decline", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });

      const eoiId = parseInt(String(req.params.id), 10);
      if (isNaN(eoiId)) return res.status(400).json({ error: "Invalid EOI ID" });
      const listings = await storage.getMarketListingsBySeller(userId);
      const listingIds = listings.map(l => l.id);

      const [eoiRow] = await db.select().from(marketEois).where(eq(marketEois.id, eoiId)).limit(1);
      if (!eoiRow) return res.status(404).json({ error: "EOI not found" });
      if (!listingIds.includes(eoiRow.listingId)) return res.status(403).json({ error: "Not your listing" });
      if (eoiRow.status === "accepted") return res.status(400).json({ error: "Cannot decline an already accepted EOI" });

      await db.update(marketEois).set({ status: "declined" }).where(eq(marketEois.id, eoiId));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/market/deals/events — SSE stream for deal-room real-time updates
  app.get("/api/market/deals/events", async (req, res) => {
    const token = (req.headers.authorization?.replace("Bearer ", "") || req.query.token) as string | undefined;
    let userId: string | undefined;
    if (token) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const adminSupabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        );
        const { data } = await adminSupabase.auth.getUser(token);
        userId = data.user?.id;
      } catch {}
    }
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write("event: connected\ndata: {}\n\n");

    registerUserClient(userId, res);
    req.on("close", () => unregisterUserClient(userId!, res));
  });

  // GET /api/market/deals — list deals for current user
  app.get("/api/market/deals", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const deals = await storage.getMarketDealsForUser(userId);
      res.json(deals);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/market/deals/:id — get single deal room data (seller or buyer, or admin read-only)
  app.get("/api/market/deals/:id", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const isAdmin = !!(await getAdminUser(req));

      if (!isAdmin) {
        const org = await storage.getOrgForUser(userId);
        if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      }

      const dealId = parseInt(String(req.params.id), 10);
      if (isNaN(dealId)) return res.status(400).json({ error: "Invalid deal ID" });
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (!isAdmin && deal.sellerId !== userId && deal.buyerId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const listing = await storage.getMarketListing(deal.listingId);
      const [eoi] = await db.select().from(marketEois).where(eq(marketEois.id, deal.eoiId)).limit(1);

      // Resolve org names for explicit legal-counterparty identity display
      const [sellerOrg, buyerOrg] = await Promise.all([
        storage.getOrgForUser(deal.sellerId),
        storage.getOrgForUser(deal.buyerId),
      ]);
      const sellerOrgName: string | null = sellerOrg?.name ?? null;
      const buyerOrgName: string | null = buyerOrg?.name ?? null;

      // After EOI acceptance (deal created), identities are mutually revealed.
      // Deep IP/financial data and EOI rationale/budget are gated behind NDA execution.
      if (!deal.ndaSignedAt) {
        const bf = normalizeBlindFields(listing ?? { blind: false, blindFields: {} });
        const redactedListing = listing ? {
          id: listing.id,
          therapeuticArea: listing.therapeuticArea,
          modality: listing.modality,
          stage: listing.stage,
          engagementStatus: listing.engagementStatus,
          blind: listing.blind,
          blindFields: bf,
          status: listing.status,
          createdAt: listing.createdAt,
          updatedAt: listing.updatedAt,
          sellerId: listing.sellerId,
          // Per-field blinding: asset name only revealed pre-NDA if seller did not mask it.
          // Anything masked stays redacted until NDA is fully executed.
          assetName: bf.assetName ? null : listing.assetName,
          // Gate deep technical/financial data behind NDA
          mechanism: null,
          ipStatus: null,
          ipSummary: null,
          milestoneHistory: null,
          askingPrice: null,
          priceRangeMin: null,
          priceRangeMax: null,
          aiSummary: null,
          adminNote: null,
        } : null;
        const redactedEoi = eoi ? {
          id: eoi.id,
          listingId: eoi.listingId,
          status: eoi.status,
          createdAt: eoi.createdAt,
          // Identity reveal: buyer company/role are shared post-accept
          buyerId: eoi.buyerId,
          company: eoi.company,
          role: eoi.role,
          // Gate due-diligence details behind NDA
          rationale: null,
          budgetRange: null,
          timeline: null,
        } : null;
        return res.json({ deal, listing: redactedListing, eoi: redactedEoi, sellerOrgName, buyerOrgName });
      }

      // NDA signed — return NDA download URL if document exists
      let ndaDocumentUrl: string | null = null;
      if (deal.ndaDocumentPath) {
        const sbUrl = process.env.VITE_SUPABASE_URL;
        const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (sbUrl && sbServiceKey) {
          try {
            const { createClient: createSbClient } = await import("@supabase/supabase-js");
            const sbAdmin = createSbClient(sbUrl, sbServiceKey);
            const { data } = await sbAdmin.storage.from("market-deal-docs").createSignedUrl(deal.ndaDocumentPath, 3600);
            ndaDocumentUrl = data?.signedUrl ?? null;
          } catch (e) { console.warn("[market] NDA signed URL generation failed for deal", deal.id, e); }
        }
      }

      // Strip internal-only fields from listing before returning to parties
      const sanitizedListing = listing ? (() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { adminNote: _an, ...rest } = listing as typeof listing & { adminNote?: unknown };
        return rest;
      })() : null;

      res.json({ deal, listing: sanitizedListing, eoi, ndaDocumentUrl, sellerOrgName, buyerOrgName });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/market/deals/:id/sign-nda — sign NDA
  app.post("/api/market/deals/:id/sign-nda", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });

      const dealId = parseInt(String(req.params.id), 10);
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { signedName } = z.object({ signedName: z.string().min(2) }).parse(req.body);
      const isSeller = deal.sellerId === userId;
      const now = new Date();

      const updateData: Record<string, unknown> = {};
      if (isSeller && !deal.sellerSignedAt) {
        updateData.sellerSignedAt = now;
        updateData.sellerSignedName = signedName;
      } else if (!isSeller && !deal.buyerSignedAt) {
        updateData.buyerSignedAt = now;
        updateData.buyerSignedName = signedName;
      } else {
        return res.json({ deal, alreadySigned: true });
      }

      let updatedDeal = await storage.updateMarketDeal(dealId, updateData);
      if (!updatedDeal) return res.status(500).json({ error: "Update failed" });

      // If both have signed, unlock the deal room
      if (updatedDeal.sellerSignedAt && updatedDeal.buyerSignedAt && !updatedDeal.ndaSignedAt) {
        const ndaHistoryEntry: import("@shared/schema").DealStatusHistoryEntry = { status: "nda_signed", changedAt: now.toISOString(), changedBy: "system" };
        updatedDeal = await storage.updateMarketDeal(dealId, {
          ndaSignedAt: now,
          status: "nda_signed",
          statusHistory: [...(Array.isArray(deal.statusHistory) ? deal.statusHistory : []), ndaHistoryEntry],
        }) ?? updatedDeal;

        // Generate and store NDA artifact as PDF
        const listing = await storage.getMarketListing(deal.listingId);
        const assetRef = listing?.blind
          ? `a ${listing.therapeuticArea} ${listing.modality} asset (EdenMarket Listing #${deal.listingId})`
          : (listing?.assetName || `EdenMarket Listing #${deal.listingId}`);
        const signedDate = new Date(updatedDeal.sellerSignedAt!).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

        // Resolve legal names for PDF preamble
        const [ndaSellerOrg, ndaBuyerOrg] = await Promise.all([
          storage.getOrgForUser(deal.sellerId),
          storage.getOrgForUser(deal.buyerId),
        ]);
        const sellerLegalName = ndaSellerOrg?.name ?? `Party A (Deal #${dealId})`;
        const buyerLegalName = ndaBuyerOrg?.name ?? `Party B (Deal #${dealId})`;

        try {
          const sbUrl = process.env.VITE_SUPABASE_URL;
          const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (sbUrl && sbServiceKey) {
            const PDFDocument = (await import("pdfkit")).default;
            const ndaPdfBuffer = await new Promise<Buffer>((resolve, reject) => {
              const doc = new PDFDocument({ margin: 72, size: "LETTER" });
              const chunks: Buffer[] = [];
              doc.on("data", (c: Buffer) => chunks.push(c));
              doc.on("end", () => resolve(Buffer.concat(chunks)));
              doc.on("error", reject);

              doc.font("Helvetica-Bold").fontSize(14).text("MUTUAL NON-DISCLOSURE AGREEMENT", { align: "center" });
              doc.moveDown();
              doc.font("Helvetica").fontSize(10);
              doc.text(`This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of ${signedDate}, between ${sellerLegalName} ("Seller", Deal Party A) and ${buyerLegalName} ("Buyer", Deal Party B) in connection with ${assetRef}, facilitated through EdenMarket by EdenRadar.`, { align: "justify" });
              doc.moveDown();
              const clauses = [
                ["1. CONFIDENTIAL INFORMATION.", 'Each party ("Disclosing Party") may disclose to the other party ("Receiving Party") certain non-public, proprietary, or confidential information ("Confidential Information") in connection with the evaluation of a potential business transaction regarding the above-referenced asset.'],
                ["2. NON-DISCLOSURE.", 'Each Receiving Party agrees to: (a) hold the Disclosing Party\'s Confidential Information in strict confidence; (b) not disclose it to any third party without prior written consent; (c) use it solely for evaluating the Potential Transaction; and (d) protect it using at least the same degree of care applied to its own confidential information.'],
                ["3. TERM.", "This Agreement shall remain in force for three (3) years from the date of execution, unless otherwise terminated by mutual written agreement."],
                ["4. RETURN OF INFORMATION.", "Upon request, each party shall promptly return or certifiably destroy all Confidential Information received."],
                ["5. GOVERNING LAW.", "This Agreement shall be governed by the laws of the jurisdiction in which the Disclosing Party is incorporated."],
                ["6. ENTIRE AGREEMENT.", "This Agreement constitutes the entire agreement between the parties with respect to the subject matter herein."],
              ];
              for (const [title, body] of clauses) {
                doc.font("Helvetica-Bold").text(title, { continued: true });
                doc.font("Helvetica").text(` ${body}`, { align: "justify" });
                doc.moveDown(0.5);
              }
              doc.moveDown();
              doc.moveTo(72, doc.y).lineTo(540, doc.y).stroke();
              doc.moveDown();
              const sellerSigName = updatedDeal?.sellerSignedName ?? "";
              const sellerSigDate = updatedDeal?.sellerSignedAt ? new Date(updatedDeal.sellerSignedAt).toLocaleString() : "";
              const buyerSigName = updatedDeal?.buyerSignedName ?? "";
              const buyerSigDate = updatedDeal?.buyerSignedAt ? new Date(updatedDeal.buyerSignedAt).toLocaleString() : "";
              doc.font("Helvetica-Bold").text("Signatures");
              doc.moveDown(0.5);
              doc.font("Helvetica").text(`Party A (Seller): ${sellerSigName}   Signed: ${sellerSigDate}`);
              doc.moveDown(0.5);
              doc.text(`Party B (Buyer):  ${buyerSigName}   Signed: ${buyerSigDate}`);
              doc.moveDown();
              doc.font("Helvetica").fontSize(8).fillColor("grey")
                .text(`Document ID: DEAL-${dealId}-NDA · EdenMarket · Generated: ${new Date().toISOString()}`, { align: "center" });
              doc.end();
            });

            const { createClient: createSbClient } = await import("@supabase/supabase-js");
            const sbAdmin = createSbClient(sbUrl, sbServiceKey);
            const ndaPath = `deal-${dealId}/nda-executed.pdf`;
            await sbAdmin.storage.from("market-deal-docs").upload(ndaPath, ndaPdfBuffer, { contentType: "application/pdf", upsert: true });
            await storage.updateMarketDeal(dealId, { ndaDocumentPath: ndaPath });
          }
        } catch (e) { console.warn("[market] NDA PDF generation/upload failed for deal", dealId, e); }

        const assetLabel = listing?.blind
          ? `a ${listing.therapeuticArea} ${listing.modality} opportunity`
          : (listing?.assetName || `Listing #${deal.listingId}`);
        const dealUrl = `${APP_URL}/market/deals/${dealId}`;
        try {
          const sellerOrg = await storage.getOrgForUser(deal.sellerId);
          if (sellerOrg?.billingEmail) await sendMarketNdaSignedEmail(sellerOrg.billingEmail, sellerOrg.name ?? "", dealUrl, assetLabel);
        } catch (e) { console.warn("[market] seller NDA-signed email failed", e); }
        try {
          const buyerOrg = await storage.getOrgForUser(deal.buyerId);
          if (buyerOrg?.billingEmail) await sendMarketNdaSignedEmail(buyerOrg.billingEmail, buyerOrg.name ?? "", dealUrl, assetLabel);
        } catch (e) { console.warn("[market] buyer NDA-signed email failed", e); }
      }

      void logDealEvent(dealId, userId, "nda_signed", `${isSeller ? "seller" : "buyer"} signed as "${signedName}"`);
      if (updatedDeal?.ndaSignedAt) void logDealEvent(dealId, userId, "nda_executed", "NDA fully executed by both parties");

      broadcastToUsers([deal.sellerId, deal.buyerId], "deal_updated", { dealId });

      res.json({ deal: updatedDeal, alreadySigned: false });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // PATCH /api/market/deals/:id/status — seller updates deal status
  app.patch("/api/market/deals/:id/status", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });

      const dealId = parseInt(String(req.params.id), 10);
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId) return res.status(403).json({ error: "Only seller can update status" });

      const { status, dealSizeM } = z.object({
        status: z.enum(["nda_pending", "nda_signed", "due_diligence", "term_sheet", "loi", "closed", "paused"]),
        dealSizeM: z.number().int().positive().optional(),
      }).parse(req.body);

      // Enforce NDA must be signed before progressing past nda_pending
      const ndaRequiredStatuses = ["nda_signed", "due_diligence", "term_sheet", "loi", "closed"];
      if (ndaRequiredStatuses.includes(status) && !deal.ndaSignedAt) {
        return res.status(400).json({ error: "NDA must be executed by both parties before advancing deal status" });
      }

      // Guard against regressing back to nda_pending once NDA is signed
      if (status === "nda_pending" && deal.ndaSignedAt) {
        return res.status(400).json({ error: "Cannot revert to NDA pending after NDA has been executed" });
      }

      // Closing requires a deal size — either provided now, or already persisted
      // from a prior close attempt that failed mid-flight. We need it to compute
      // the success-fee tier and auto-fire the invoice.
      const effectiveDealSizeM = dealSizeM ?? deal.successFeeDealSizeM ?? null;
      if (status === "closed" && !effectiveDealSizeM) {
        return res.status(400).json({ error: "dealSizeM (final deal size in millions USD) is required when closing a deal" });
      }

      // Idempotency for re-closing: if the deal is already closed and an
      // invoice was already issued, do not allow another close+invoice cycle.
      if (status === "closed" && deal.status === "closed" && deal.successFeeInvoiceId) {
        return res.status(409).json({
          error: "Deal already closed and invoiced",
          invoiceId: deal.successFeeInvoiceId,
        });
      }

      // Append to status history
      const historyEntry: import("@shared/schema").DealStatusHistoryEntry = { status, changedAt: new Date().toISOString(), changedBy: userId };
      const currentHistory = Array.isArray(deal.statusHistory) ? deal.statusHistory : [];

      // Persist the deal-size up-front so we have it on record even if invoice
      // generation fails partway through. The status flips to "closed" in the
      // same UPDATE so the helper sees a closed deal.
      const updatePayload: Partial<import("@shared/schema").InsertMarketDeal> = {
        status,
        statusHistory: [...currentHistory, historyEntry],
      };
      if (status === "closed" && dealSizeM) {
        updatePayload.successFeeDealSizeM = dealSizeM;
      }
      const updated = await storage.updateMarketDeal(dealId, updatePayload);

      void logDealEvent(dealId, userId, "status_changed", `→ ${status}`);
      broadcastToUsers([deal.sellerId, deal.buyerId], "deal_updated", { dealId });

      // Alert admin on LOI or Closed
      if (status === "loi" || status === "closed") {
        const listing = await storage.getMarketListing(deal.listingId);
        const label = listing?.assetName || `Listing #${deal.listingId}`;
        try {
          await sendAdminNotificationEmail(
            `Deal #${dealId} moved to ${status.toUpperCase()} — ${label}`,
            `<p>Deal #${dealId} (${label}) has been moved to <strong>${status}</strong>.</p><p><a href="${APP_URL}/admin">View in admin panel</a></p>`
          );
        } catch (e) { console.warn("[market] admin status-change email failed", e); }
      }

      // Auto-fire success-fee invoice on close. We do NOT roll back the status
      // change on invoice failure — the deal really did close. Instead we
      // surface the error to the seller and alert admins so the manual
      // fallback endpoint can be used.
      if (status === "closed" && effectiveDealSizeM) {
        try {
          const invoiceResult = await generateSuccessFeeInvoice(dealId, effectiveDealSizeM);
          if (invoiceResult.ok) {
            return res.json({
              ...invoiceResult.deal,
              autoInvoice: {
                feeAmount: invoiceResult.feeAmount,
                invoiceId: invoiceResult.invoiceId,
                invoiceUrl: invoiceResult.invoiceUrl ?? null,
                note: invoiceResult.note,
              },
            });
          }
          // Invoice generation failed — keep the close, alert admins.
          console.error(`[market/auto-invoice] deal ${dealId} closed but invoice failed: ${invoiceResult.error}`);
          try {
            await sendAdminNotificationEmail(
              `URGENT: Deal #${dealId} closed but auto-invoice FAILED`,
              `<p>Deal #${dealId} was marked closed by seller but the success-fee invoice could not be generated automatically.</p>
               <p><strong>Reason:</strong> ${invoiceResult.error}</p>
               <p>Use the manual invoice button in <a href="${APP_URL}/admin">the admin panel</a>.</p>`
            );
          } catch (e) { console.warn("[market] admin auto-invoice failure email failed", e); }
          return res.status(207).json({
            ...updated,
            autoInvoice: { error: invoiceResult.error, invoiceId: invoiceResult.invoiceId ?? null },
          });
        } catch (invErr: any) {
          console.error(`[market/auto-invoice] deal ${dealId} unhandled error`, invErr);
          sentryCaptureException(invErr);
          try {
            await sendAdminNotificationEmail(
              `URGENT: Deal #${dealId} closed but auto-invoice CRASHED`,
              `<p>Deal #${dealId} was marked closed by seller. The success-fee invoice generator crashed.</p>
               <p><strong>Error:</strong> ${invErr?.message ?? String(invErr)}</p>
               <p>Use the manual invoice button in <a href="${APP_URL}/admin">the admin panel</a>.</p>`
            );
          } catch (e) { console.warn("[market] admin auto-invoice crash email failed", e); }
          return res.status(207).json({
            ...updated,
            autoInvoice: { error: invErr?.message ?? "Invoice generation crashed" },
          });
        }
      }

      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/market/deals/:id/documents — list documents
  // Each row is enriched with view-tracking metadata derived from
  // market_deal_document_views, scoped to "the other party's views" so each
  // side sees engagement signal from the counterparty (plus their own opens
  // as confirmation).
  app.get("/api/market/deals/:id/documents", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      // Task #714 — lenient gate: allowed during 30d grace, blocked once expired.
      const docReadOrg = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, docReadOrg))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const dealId = parseInt(String(req.params.id), 10);
      if (isNaN(dealId)) return res.status(400).json({ error: "Invalid deal ID" });
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });
      if (!deal.ndaSignedAt) return res.status(403).json({ error: "NDA must be signed before accessing documents" });
      const docs = await storage.getMarketDealDocuments(dealId);

      // Compute view stats per document. Each side sees:
      //   - lastViewedByCounterparty / viewCountByCounterparty: opens by the OTHER party only
      //   - ownViews: their own opens (as confirmation)
      const allViews = await storage.getMarketDealDocumentViews(docs.map(d => d.id));
      const viewsByDoc = new Map<number, typeof allViews>();
      for (const v of allViews) {
        const arr = viewsByDoc.get(v.documentId) ?? [];
        arr.push(v);
        viewsByDoc.set(v.documentId, arr);
      }

      // Generate short-lived signed URLs for each document
      const sbUrl = process.env.VITE_SUPABASE_URL;
      const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      let sbAdmin: ReturnType<typeof import("@supabase/supabase-js").createClient> | null = null;
      if (sbUrl && sbServiceKey && docs.length > 0) {
        try {
          const { createClient: createSbClient } = await import("@supabase/supabase-js");
          sbAdmin = createSbClient(sbUrl, sbServiceKey);
        } catch (e) { console.warn("[market] supabase client init failed for deal docs", e); }
      }

      const enriched = await Promise.all(docs.map(async (doc) => {
        let fileUrl = doc.fileUrl;
        if (sbAdmin && !doc.fileUrl.startsWith("http")) {
          try {
            const { data } = await sbAdmin.storage.from("market-deal-docs").createSignedUrl(doc.fileUrl, 3600);
            fileUrl = data?.signedUrl ?? doc.fileUrl;
          } catch (e) { console.warn("[market] signed URL generation failed for doc", doc.id, e); }
        }

        // Views by the *other* party only — each side already knows what they
        // themselves opened, the value is seeing the counterparty engage.
        const docViews = viewsByDoc.get(doc.id) ?? [];
        const counterpartyViews = docViews.filter(v => v.viewerId !== userId);
        const ownViews = docViews.filter(v => v.viewerId === userId);
        const last = counterpartyViews[0] ?? null; // ordered desc

        return {
          ...doc,
          fileUrl,
          lastViewedByCounterparty: last
            ? { viewerId: last.viewerId, viewedAt: last.viewedAt }
            : null,
          viewCountByCounterparty: counterpartyViews.length,
          counterpartyViews: counterpartyViews.map(v => ({ viewerId: v.viewerId, viewedAt: v.viewedAt })),
          ownViewCount: ownViews.length,
        };
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/market/deals/:id/documents/:docId/track-view —
  // Records a view row for a Deal Room document open. Called by the
  // documents tab UI just before opening the signed URL. Validates the
  // viewer is a deal participant and NDA is signed (mirrors the read gate).
  app.post("/api/market/deals/:dealId/documents/:docId/track-view", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      // Task #714 — lenient gate: allowed during 30d grace, blocked once expired.
      const trackOrg = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, trackOrg))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const dealId = parseInt(String(req.params.dealId), 10);
      const docId = parseInt(String(req.params.docId), 10);
      if (isNaN(dealId) || isNaN(docId)) return res.status(400).json({ error: "Invalid id" });
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });
      if (!deal.ndaSignedAt) return res.status(403).json({ error: "NDA must be signed before accessing documents" });
      const docs = await storage.getMarketDealDocuments(dealId);
      const doc = docs.find(d => d.id === docId);
      if (!doc) return res.status(404).json({ error: "Document not found" });

      const view = await storage.recordMarketDealDocumentView({ documentId: docId, viewerId: userId });
      // Notify the counterparty in real-time so their UI refetches and the
      // "Last viewed by …" subline updates without a page reload.
      broadcastToUsers([deal.sellerId, deal.buyerId], "deal_document", { dealId });
      res.json({ ok: true, viewedAt: view.viewedAt });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/market/deals/:id/documents — upload document
  app.post("/api/market/deals/:id/documents", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      // Task #714 — lenient gate: in-flight deal-room document exchange is
      // allowed during the 30-day grace period so paid users can complete
      // existing diligence. Only revoke once grace has fully expired.
      const docOrg = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, docOrg))) {
        return res.status(403).json({ error: "EdenMarket subscription required" });
      }
      const dealId = parseInt(String(req.params.id), 10);
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });
      if (!deal.ndaSignedAt) return res.status(403).json({ error: "NDA must be signed before uploading documents" });

      const multerMod = (await import("multer")).default;
      const upload = multerMod({
        storage: multerMod.memoryStorage(),
        limits: { fileSize: 50 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
          const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/msword", "application/vnd.ms-excel"];
          if (allowed.includes(file.mimetype) || file.originalname.match(/\.(pdf|docx|xlsx|doc|xls)$/i)) {
            cb(null, true);
          } else {
            cb(new Error("Only PDF, DOCX, and XLSX files are allowed"));
          }
        },
      });

      const multerReq = req as typeof req & { file?: Express.Multer.File };
      await new Promise<void>((resolve, reject) => {
        upload.single("file")(multerReq, res, (err: unknown) => { if (err) reject(err); else resolve(); });
      });

      const file = multerReq.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const sbUrl = process.env.VITE_SUPABASE_URL;
      const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!sbUrl || !sbServiceKey) return res.status(503).json({ error: "Storage not configured" });

      const { createClient } = await import("@supabase/supabase-js");
      const adminClient = createClient(sbUrl, sbServiceKey);
      const ext = file.originalname.split(".").pop() ?? "bin";
      const path = `deal-${dealId}/${Date.now()}-${userId.slice(0, 8)}.${ext}`;

      const { error: uploadError } = await adminClient.storage
        .from("market-deal-docs")
        .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });

      if (uploadError) {
        // If bucket doesn't exist, create it and retry
        if (uploadError.message?.includes("not found") || uploadError.message?.includes("Bucket")) {
          await adminClient.storage.createBucket("market-deal-docs", { public: false });
          const { error: retryErr } = await adminClient.storage
            .from("market-deal-docs")
            .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
          if (retryErr) return res.status(500).json({ error: retryErr.message });
        } else {
          return res.status(500).json({ error: uploadError.message });
        }
      }

      // Store bucket path — signed URLs are generated on retrieval
      const doc = await storage.createMarketDealDocument({
        dealId,
        uploaderId: userId,
        fileName: file.originalname,
        fileUrl: path,
        fileSize: file.size,
      });

      void logDealEvent(dealId, userId, "document_uploaded", file.originalname);
      broadcastToUsers([deal.sellerId, deal.buyerId], "deal_document", { dealId });
      // Notify the *other* party. Fire-and-forget so a Resend hiccup never
      // blocks the actual upload from succeeding.
      void notifyDealRoomDocument(deal, userId, file.originalname).catch((e) =>
        console.warn("[market] deal-room document email failed", e),
      );
      res.json(doc);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/market/deals/:dealId/documents/:docId — delete document
  app.delete("/api/market/deals/:dealId/documents/:docId", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      // Task #714 — lenient gate: allowed during 30d grace, blocked once expired.
      const delDocOrg = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, delDocOrg))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const dealId = parseInt(String(req.params.dealId), 10);
      const docId = parseInt(String(req.params.docId), 10);
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });
      const docs = await storage.getMarketDealDocuments(dealId);
      const doc = docs.find(d => d.id === docId);
      if (!doc) return res.status(404).json({ error: "Document not found" });
      if (doc.uploaderId !== userId) return res.status(403).json({ error: "Only the uploader can delete this document" });

      // Physically remove from Supabase Storage before deleting DB row
      if (!doc.fileUrl.startsWith("http")) {
        const sbUrl = process.env.VITE_SUPABASE_URL;
        const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (sbUrl && sbServiceKey) {
          try {
            const { createClient: createSbClient } = await import("@supabase/supabase-js");
            const sbAdmin = createSbClient(sbUrl, sbServiceKey);
            const { error: storageError } = await sbAdmin.storage.from("market-deal-docs").remove([doc.fileUrl]);
            if (storageError) console.warn("[market] storage remove failed for doc", docId, storageError.message);
          } catch (e) { console.warn("[market] storage remove exception for doc", docId, e); }
        }
      }

      await storage.deleteMarketDealDocument(docId, userId);
      void logDealEvent(dealId, userId, "document_deleted", doc.fileName);
      broadcastToUsers([deal.sellerId, deal.buyerId], "deal_document", { dealId });
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // GET /api/market/deals/:id/messages — get messages
  app.get("/api/market/deals/:id/messages", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      // Task #714 — lenient gate: allowed during 30d grace, blocked once expired.
      const msgReadOrg = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, msgReadOrg))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const dealId = parseInt(String(req.params.id), 10);
      if (isNaN(dealId)) return res.status(400).json({ error: "Invalid deal ID" });
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });
      if (!deal.ndaSignedAt) return res.status(403).json({ error: "NDA must be signed before accessing messages" });
      const messages = await storage.getMarketDealMessages(dealId);
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/market/deals/:id/messages — send message
  app.post("/api/market/deals/:id/messages", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      // Task #714 — lenient gate: messaging in existing deal rooms is
      // explicitly allowed during the 30-day grace period (per acceptance
      // criteria). Only revoke once grace has fully expired.
      const msgOrg = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, msgOrg))) {
        return res.status(403).json({ error: "EdenMarket subscription required" });
      }
      const dealId = parseInt(String(req.params.id), 10);
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });
      if (!deal.ndaSignedAt) return res.status(403).json({ error: "NDA must be signed before messaging" });

      const { body } = z.object({ body: z.string().min(1).max(4000) }).parse(req.body);
      const msg = await storage.createMarketDealMessage({ dealId, senderId: userId, body });
      void logDealEvent(dealId, userId, "message_sent");
      broadcastToUsers([deal.sellerId, deal.buyerId], "deal_message", { dealId });
      // Throttled per (deal, recipient) inside notifyDealRoomMessage so
      // a chatty back-and-forth doesn't spam either inbox.
      void notifyDealRoomMessage(deal, userId, body).catch((e) =>
        console.warn("[market] deal-room message email failed", e),
      );
      res.json(msg);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/admin/market/deals/:id/events — deal activity log (admin only)
  app.get("/api/admin/market/deals/:id/events", async (req, res) => {
    try {
      const dealId = parseInt(String(req.params.id), 10);
      if (isNaN(dealId)) return res.status(400).json({ error: "Invalid deal ID" });
      const events = await db.execute(
        sql`SELECT id, deal_id, actor_id, event_type, detail, created_at FROM market_deal_events WHERE deal_id = ${dealId} ORDER BY created_at ASC`
      );
      res.json(events.rows);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // ── Admin: Deal Pipeline ──────────────────────────────────────────────────────

  // GET /api/admin/market/deals/:id — full deal room payload (admin read-only)
  app.get("/api/admin/market/deals/:id", async (req, res) => {
    try {
      const dealId = parseInt(String(req.params.id), 10);
      if (isNaN(dealId)) return res.status(400).json({ error: "Invalid deal ID" });
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      const listing = await storage.getMarketListing(deal.listingId);
      const [eoi] = await db.select().from(marketEois).where(eq(marketEois.id, deal.eoiId)).limit(1);

      let ndaDocumentUrl: string | null = null;
      if (deal.ndaDocumentPath) {
        const sbUrl = process.env.VITE_SUPABASE_URL;
        const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (sbUrl && sbServiceKey) {
          try {
            const { createClient: createSbClient } = await import("@supabase/supabase-js");
            const sbAdmin = createSbClient(sbUrl, sbServiceKey);
            const { data } = await sbAdmin.storage.from("market-deal-docs").createSignedUrl(deal.ndaDocumentPath, 3600);
            ndaDocumentUrl = data?.signedUrl ?? null;
          } catch (e) { console.warn("[market] admin NDA signed URL failed", e); }
        }
      }

      res.json({ deal, listing: listing ?? null, eoi: eoi ?? null, ndaDocumentUrl });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
    }
  });

  // GET /api/admin/market/deals/:id/messages — read-only deal message thread
  app.get("/api/admin/market/deals/:id/messages", async (req, res) => {
    try {
      const dealId = parseInt(String(req.params.id), 10);
      if (isNaN(dealId)) return res.status(400).json({ error: "Invalid deal ID" });
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      const messages = await storage.getMarketDealMessages(dealId);
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/market/deals/:id/documents — read-only deal document list
  // Admins see the FULL view log (both parties' opens) for compliance and
  // dispute resolution.
  app.get("/api/admin/market/deals/:id/documents", async (req, res) => {
    try {
      const dealId = parseInt(String(req.params.id), 10);
      if (isNaN(dealId)) return res.status(400).json({ error: "Invalid deal ID" });
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      const docs = await storage.getMarketDealDocuments(dealId);
      const allViews = await storage.getMarketDealDocumentViews(docs.map(d => d.id));
      const viewsByDoc = new Map<number, typeof allViews>();
      for (const v of allViews) {
        const arr = viewsByDoc.get(v.documentId) ?? [];
        arr.push(v);
        viewsByDoc.set(v.documentId, arr);
      }

      // Generate signed URLs for admin visibility
      const sbUrl = process.env.VITE_SUPABASE_URL;
      const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      let sbAdmin: ReturnType<typeof import("@supabase/supabase-js").createClient> | null = null;
      if (sbUrl && sbServiceKey && docs.length > 0) {
        try {
          const { createClient: createSbClient } = await import("@supabase/supabase-js");
          sbAdmin = createSbClient(sbUrl, sbServiceKey);
        } catch (e) { console.warn("[market] admin supabase client init failed", e); }
      }

      const enriched = await Promise.all(docs.map(async (doc) => {
        let fileUrl = doc.fileUrl;
        if (sbAdmin && !doc.fileUrl.startsWith("http")) {
          try {
            const { data } = await sbAdmin.storage.from("market-deal-docs").createSignedUrl(doc.fileUrl, 3600);
            fileUrl = data?.signedUrl ?? doc.fileUrl;
          } catch (e) { console.warn("[market] admin signed URL failed for doc", doc.id, e); }
        }
        const docViews = viewsByDoc.get(doc.id) ?? [];
        return {
          ...doc,
          fileUrl,
          views: docViews.map(v => ({
            viewerId: v.viewerId,
            viewedAt: v.viewedAt,
            viewerRole: v.viewerId === deal.sellerId ? "seller" : v.viewerId === deal.buyerId ? "buyer" : "other",
          })),
          viewCount: docViews.length,
        };
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/market/deals — all deals pipeline view
  app.get("/api/admin/market/deals", async (req, res) => {
    try {
      const deals = await storage.getAllMarketDeals();
      const enriched = await Promise.all(deals.map(async d => {
        const listing = await storage.getMarketListing(d.listingId);
        const [eoiRow] = await db.select().from(marketEois).where(eq(marketEois.id, d.eoiId)).limit(1);
        const [sellerOrg, buyerOrg] = await Promise.all([
          storage.getOrgForUser(d.sellerId),
          storage.getOrgForUser(d.buyerId),
        ]);
        return {
          ...d,
          assetLabel: listing?.blind ? `Blind ${listing.therapeuticArea}` : (listing?.assetName ?? `Listing #${d.listingId}`),
          therapeuticArea: listing?.therapeuticArea ?? "",
          eoiCreatedAt: eoiRow?.createdAt ?? null,
          sellerLabel: sellerOrg?.name ?? d.sellerId.slice(0, 8),
          buyerLabel: buyerOrg?.name ?? d.buyerId.slice(0, 8),
        };
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Shared helper — generates a success-fee Stripe invoice for a closed deal.
  // Used by both the admin manual invoice endpoint and the seller-driven
  // auto-fire path on deal close. Returns a discriminated result so callers
  // can map failures to the correct HTTP status.
  type SuccessFeeResult =
    | { ok: true; deal: import("@shared/schema").MarketDeal; feeAmount: number; invoiceId: string | null; invoiceUrl?: string | null; note?: string }
    | { ok: false; status: number; error: string; invoiceId?: string };

  async function computeSuccessFeeAmount(dealSizeM: number): Promise<number> {
    if (dealSizeM <= 5) return 10000;
    if (dealSizeM <= 50) return 30000;
    return 50000;
  }

  async function generateSuccessFeeInvoice(dealId: number, dealSizeM: number): Promise<SuccessFeeResult> {
    const deal = await storage.getMarketDeal(dealId);
    if (!deal) return { ok: false, status: 404, error: "Deal not found" };
    if (deal.status !== "closed") {
      return { ok: false, status: 400, error: "Invoice can only be generated when the deal is marked Closed" };
    }
    if (deal.successFeeInvoiceId) {
      return { ok: false, status: 409, error: "Invoice already generated for this deal", invoiceId: deal.successFeeInvoiceId };
    }
    if (!Number.isInteger(dealSizeM) || dealSizeM <= 0) {
      return { ok: false, status: 400, error: "dealSizeM must be a positive integer (millions USD)" };
    }

    const feeAmount = await computeSuccessFeeAmount(dealSizeM);

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) {
      const updated = await storage.updateMarketDeal(dealId, {
        successFeeDealSizeM: dealSizeM,
        successFeeAmount: feeAmount,
      });
      return { ok: true, deal: updated!, feeAmount, invoiceId: null, note: "Stripe not configured — recorded locally" };
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });

    const sellerOrg = await storage.getOrgForUser(deal.sellerId);
    let customerId = sellerOrg?.stripeCustomerId;
    if (!customerId && sellerOrg?.billingEmail) {
      const customer = await stripe.customers.create({
        email: sellerOrg.billingEmail,
        name: sellerOrg.name ?? undefined,
        metadata: { orgId: String(sellerOrg.id), dealId: String(dealId) },
      });
      customerId = customer.id;
    }
    if (!customerId) {
      return { ok: false, status: 400, error: "Seller has no Stripe customer — add billing email first" };
    }

    const listing = await storage.getMarketListing(deal.listingId);
    const assetLabel = listing?.blind ? `Blind ${listing.therapeuticArea} opportunity` : (listing?.assetName || `Listing #${deal.listingId}`);

    const invoice = await stripe.invoices.create({
      customer: customerId,
      auto_advance: false,
      description: `EdenMarket success fee — ${assetLabel} — Deal #${dealId}`,
      metadata: { dealId: String(dealId), dealSizeM: String(dealSizeM) },
    });

    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      amount: feeAmount * 100,
      currency: "usd",
      description: `EdenMarket success fee ($${dealSizeM}M deal → $${(feeAmount / 1000).toFixed(0)}k tier)`,
    });

    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.sendInvoice(finalizedInvoice.id);

    const updated = await storage.updateMarketDeal(dealId, {
      successFeeDealSizeM: dealSizeM,
      successFeeAmount: feeAmount,
      successFeeInvoiceId: finalizedInvoice.id,
    });

    return {
      ok: true,
      deal: updated!,
      feeAmount,
      invoiceId: finalizedInvoice.id,
      invoiceUrl: finalizedInvoice.hosted_invoice_url ?? null,
    };
  }

  // POST /api/admin/market/deals/:id/invoice — generate success fee invoice (manual fallback)
  app.post("/api/admin/market/deals/:id/invoice", async (req, res) => {
    try {
      const dealId = parseInt(String(req.params.id), 10);
      const { dealSizeM } = z.object({ dealSizeM: z.number().int().positive() }).parse(req.body);
      const result = await generateSuccessFeeInvoice(dealId, dealSizeM);
      if (!result.ok) {
        return res.status(result.status).json({ error: result.error, ...(result.invoiceId ? { invoiceId: result.invoiceId } : {}) });
      }
      res.json({ deal: result.deal, feeAmount: result.feeAmount, invoiceId: result.invoiceId, invoiceUrl: result.invoiceUrl, note: result.note });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ── CLOUD EXPORT: status + upload endpoints ─────────────────────────────────
  // Used by the public-facing <ExportMenu /> dropdown on Pitch Deck, One-Pager,
  // Pipeline Brief, and admin CSV export. OneDrive is always available (preauthorized
  // org-wide); Google Drive is conditional on the user having completed OAuth.
  app.get("/api/export/status", async (_req, res) => {
    try {
      const { isOneDriveConnected } = await import("./lib/oneDriveClient");
      const { isGoogleDriveConnected } = await import("./lib/googleDriveClient");
      const [onedrive, googledrive] = await Promise.all([
        isOneDriveConnected(),
        isGoogleDriveConnected(),
      ]);
      res.json({ onedrive, googledrive });
    } catch {
      res.json({ onedrive: false, googledrive: false });
    }
  });

  // Note: no client-supplied folder override — destination is strictly derived from
  // fileType server-side so users can't write outside the EdenRadar/* folder tree.
  const exportBodySchema = z.object({
    filename: z.string().min(1).max(200),
    fileType: z.string().min(1).max(50).default("document"),
    content: z.string().min(1),                 // base64-encoded file content
    // Only used when fileType === "ad-campaign". Whitelisted to filesystem-safe
    // characters; the resulting folder is always EdenRadar/Ads/<campaignSlug>.
    campaignSlug: z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/i).optional(),
  });

  function folderForFileType(fileType: string, campaignSlug?: string): string {
    const t = fileType.toLowerCase();
    if (t === "ad-campaign" && campaignSlug) return `EdenRadar/Ads/${campaignSlug}`;
    if (t === "csv" || t === "xlsx" || t === "export") return "EdenRadar/Exports";
    if (t === "template" || t === "email") return "EdenRadar/Templates";
    return "EdenRadar/Documents";
  }

  // 8 MB hard limit on the decoded payload (matches Express default body size budget;
  // larger files would exceed Microsoft Graph's "small file" upload window anyway).
  const MAX_EXPORT_BYTES = 8 * 1024 * 1024;
  const EXPORT_RATE_WINDOW_MS = 60_000;
  const EXPORT_RATE_MAX = 20; // per user, per minute
  const exportRateBuckets = new Map<string, { count: number; resetAt: number }>();
  function rateLimitOk(userId: string): boolean {
    const now = Date.now();
    const bucket = exportRateBuckets.get(userId);
    if (!bucket || now > bucket.resetAt) {
      exportRateBuckets.set(userId, { count: 1, resetAt: now + EXPORT_RATE_WINDOW_MS });
      return true;
    }
    if (bucket.count >= EXPORT_RATE_MAX) return false;
    bucket.count += 1;
    return true;
  }

  app.post("/api/export/onedrive", async (req, res) => {
    // Auth required — these endpoints upload into shared org cloud storage.
    const userId = await tryGetUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Authentication required to export to cloud storage." });
    }
    if (!rateLimitOk(userId)) {
      return res.status(429).json({ error: "Too many exports. Please wait a minute and try again." });
    }
    let parsed: z.infer<typeof exportBodySchema>;
    try {
      parsed = exportBodySchema.parse(req.body);
    } catch (err: any) {
      return res.status(400).json({ error: "Invalid request: " + (err.message ?? String(err)) });
    }
    // Reject oversize payloads (base64 → bytes ~ length * 3/4)
    if (Math.floor(parsed.content.length * 0.75) > MAX_EXPORT_BYTES) {
      return res.status(413).json({ error: `Payload too large. Max ${Math.floor(MAX_EXPORT_BYTES / 1024 / 1024)}MB.` });
    }
    const folder = folderForFileType(parsed.fileType, parsed.campaignSlug);
    try {
      const { uploadToOneDrive } = await import("./lib/oneDriveClient");
      const buffer = Buffer.from(parsed.content, "base64");
      const result = await uploadToOneDrive(parsed.filename, buffer, folder);
      await storage.logExport({
        filename: parsed.filename,
        destination: "onedrive",
        fileType: parsed.fileType,
        exportedBy: userId ?? null,
        shareUrl: result.webUrl,
        success: true,
        errorMessage: null,
      });
      res.json({ success: true, url: result.webUrl, webUrl: result.webUrl });
    } catch (err: any) {
      const message = err?.message ?? "OneDrive upload failed";
      await storage.logExport({
        filename: parsed.filename,
        destination: "onedrive",
        fileType: parsed.fileType,
        exportedBy: userId ?? null,
        shareUrl: null,
        success: false,
        errorMessage: message,
      }).catch(() => {});
      res.status(502).json({ error: message });
    }
  });

  app.post("/api/export/googledrive", async (req, res) => {
    const userId = await tryGetUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Authentication required to export to cloud storage." });
    }
    if (!rateLimitOk(userId)) {
      return res.status(429).json({ error: "Too many exports. Please wait a minute and try again." });
    }
    let parsed: z.infer<typeof exportBodySchema>;
    try {
      parsed = exportBodySchema.parse(req.body);
    } catch (err: any) {
      return res.status(400).json({ error: "Invalid request: " + (err.message ?? String(err)) });
    }
    if (Math.floor(parsed.content.length * 0.75) > MAX_EXPORT_BYTES) {
      return res.status(413).json({ error: `Payload too large. Max ${Math.floor(MAX_EXPORT_BYTES / 1024 / 1024)}MB.` });
    }
    const folder = folderForFileType(parsed.fileType, parsed.campaignSlug);
    try {
      const { uploadToGoogleDrive, isGoogleDriveConnected } = await import("./lib/googleDriveClient");
      if (!(await isGoogleDriveConnected())) {
        return res.status(400).json({ error: "Google Drive is not connected. Connect it in your Replit workspace integrations to enable Drive exports." });
      }
      const buffer = Buffer.from(parsed.content, "base64");
      const result = await uploadToGoogleDrive(parsed.filename, buffer, folder);
      if (!result) {
        return res.status(400).json({ error: "Google Drive is not connected." });
      }
      await storage.logExport({
        filename: parsed.filename,
        destination: "googledrive",
        fileType: parsed.fileType,
        exportedBy: userId ?? null,
        shareUrl: result.editUrl,
        success: true,
        errorMessage: null,
      });
      res.json({ success: true, url: result.editUrl, editUrl: result.editUrl });
    } catch (err: any) {
      const message = err?.message ?? "Google Drive upload failed";
      await storage.logExport({
        filename: parsed.filename,
        destination: "googledrive",
        fileType: parsed.fileType,
        exportedBy: userId ?? null,
        shareUrl: null,
        success: false,
        errorMessage: message,
      }).catch(() => {});
      res.status(502).json({ error: message });
    }
  });

  // Admin-only — recent exports for the Documents tab log
  app.get("/api/admin/export-log", async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 20), 100);
      const exports = await storage.getRecentExports(limit);
      res.json({ exports });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // The admin "Documents" tab used to also generate .docx outbound BD email
  // templates (BD Outreach, TTO Partner Invite, EdenMarket Lister Invite) and
  // upload them to OneDrive / Google Drive. That generator was removed because
  // the canonical copies now live in Gmail templates — keeping a second source
  // of truth in code was just drift waiting to happen. The /api/admin/export-log
  // route above is intentionally retained: it powers the audit trail for
  // pitch-deck / one-pager / dossier exports triggered elsewhere in the app.

  // ── Weekly Recap (Task #738) ─────────────────────────────────────────────
  // Org-scoped read endpoints + admin regenerate. The Monday job and backfill
  // live in server/lib/weeklyRecap.ts; routes are thin reads + a write hook.
  {
    const {
      assembleRecap,
      getStoredRecap,
      upsertRecap,
      listRecaps,
      startOfWeek,
      previousWeekStart,
      runWeeklyRecapJob,
      resolveRequestOrgId,
    } = await import("./lib/weeklyRecap");

    function parseWeekStart(input: string): Date | null {
      const d = new Date(input);
      if (isNaN(d.getTime())) return null;
      const norm = startOfWeek(d);
      if (norm.getTime() !== d.getTime() && norm.toISOString().slice(0, 10) !== input.slice(0, 10)) {
        // Snap any submitted date to its week's Monday (UTC).
      }
      return norm;
    }

    // GET /api/recap/current — live preview of in-progress week
    app.get("/api/recap/current", async (req, res) => {
      try {
        const userId = await tryGetUserId(req);
        const orgId = await resolveRequestOrgId(userId ?? undefined);
        if (!orgId) return res.status(404).json({ error: "No organization for this user" });
        const weekStart = startOfWeek(new Date());
        const payload = await assembleRecap(orgId, weekStart);
        // Persist as a non-frozen live snapshot for fast subsequent reads.
        await upsertRecap(orgId, weekStart, payload, false);
        res.json({ weekStart: weekStart.toISOString(), frozen: false, payload });
      } catch (err: any) {
        console.error("[recap/current] Error:", err);
        res.status(500).json({ error: err?.message ?? "Failed to assemble recap" });
      }
    });

    // GET /api/recap/list — recent weeks for the navigator
    app.get("/api/recap/list", async (req, res) => {
      try {
        const userId = await tryGetUserId(req);
        const orgId = await resolveRequestOrgId(userId ?? undefined);
        if (!orgId) return res.status(404).json({ error: "No organization for this user" });
        const weeks = await listRecaps(orgId, 12);
        res.json({ weeks });
      } catch (err: any) {
        res.status(500).json({ error: err?.message ?? "Failed to list recaps" });
      }
    });

    // GET /api/recap/:weekStart — stored recap (frozen or live snapshot)
    app.get("/api/recap/:weekStart", async (req, res) => {
      try {
        const userId = await tryGetUserId(req);
        const orgId = await resolveRequestOrgId(userId ?? undefined);
        if (!orgId) return res.status(404).json({ error: "No organization for this user" });
        const weekStart = parseWeekStart(req.params.weekStart);
        if (!weekStart) return res.status(400).json({ error: "Invalid weekStart date" });
        const stored = await getStoredRecap(orgId, weekStart);
        if (stored) {
          return res.json({
            weekStart: stored.weekStartDate.toISOString(),
            frozen: stored.frozen,
            payload: stored.payload,
          });
        }
        // No stored recap — assemble on demand. If it's a past week, freeze it.
        const thisWeek = startOfWeek(new Date());
        const payload = await assembleRecap(orgId, weekStart);
        const isPast = weekStart.getTime() < thisWeek.getTime();
        await upsertRecap(orgId, weekStart, payload, isPast);
        res.json({ weekStart: weekStart.toISOString(), frozen: isPast, payload });
      } catch (err: any) {
        console.error("[recap/:weekStart] Error:", err);
        res.status(500).json({ error: err?.message ?? "Failed to load recap" });
      }
    });

    // POST /api/admin/recap/regenerate — admin-only, re-run the freeze job.
    // Body: { weekStart?: ISO date } — defaults to most recent completed week.
    app.post("/api/admin/recap/regenerate", requireAdmin, async (req, res) => {
      try {
        const body = req.body as { weekStart?: string; orgId?: number } | undefined;
        if (body?.weekStart && body?.orgId) {
          const weekStart = parseWeekStart(body.weekStart);
          if (!weekStart) return res.status(400).json({ error: "Invalid weekStart" });
          const payload = await assembleRecap(body.orgId, weekStart);
          await upsertRecap(body.orgId, weekStart, payload, true);
          return res.json({ ok: true, orgId: body.orgId, weekStart: weekStart.toISOString() });
        }
        const result = await runWeeklyRecapJob({ force: true });
        res.json({ ok: true, ...result });
      } catch (err: any) {
        res.status(500).json({ error: err?.message ?? "Regenerate failed" });
      }
    });
  }

  return httpServer;
}
