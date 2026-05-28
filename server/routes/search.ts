import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Express } from "express";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import { z } from "zod";
import { db } from "../db";
import { eq, and, ne, or, sql, desc, inArray, gte, count as drizzleCount } from "drizzle-orm";
import { storage } from "../storage";
import { ingestedAssets, type IngestedAsset, marketListings, scoutSavedSearches, insertScoutSavedSearchSchema } from "@shared/schema";
import { verifyAnyAuth, tryGetUserId, requireAdmin, getAdminEmails } from "../lib/supabaseAuth";
import { dataSources, collectAllSignals, collectAllSignalsWithDiag, ALL_SOURCE_KEYS, withHardTimeout, getSourceHealthEntries, type SourceKey, type SourceDiag } from "../lib/sources/index";
import { searchPatents } from "../lib/sources/patents";
import { searchClinicalTrials } from "../lib/sources/clinicaltrials";
import { normalizeSignals } from "../lib/pipeline/normalizeSignals";
import { clusterAssets } from "../lib/pipeline/clusterAssets";
import { scoreAssets, computeFitBonus, computeTotal, TTO_WEIGHTS, scoreSearchRelevance, scoreCompleteness, scoreAvailability, CONFIDENCE_AWARE_RANKING_ENABLED, CONFIDENCE_FLOOR } from "../lib/pipeline/scoreAssets";
import { generateReport } from "../lib/pipeline/generateReport";
import { generateDossier } from "../lib/pipeline/generateDossier";
import { isFatalOpenAIError, streamDossierNarrative, friendlyOpenAIError } from "../lib/llm";
import type { BuyerProfile, ScoredAsset, RawSignal } from "../lib/types";
import { fetchPortfolioStats, parseQueryFilters, hasMeaningfulFilters } from "../lib/eden/rag";
import { cacheGet, cacheSet } from "../lib/responseCache";
import type { RetrievedAsset } from "../storage";
import { captureException as sentryCaptureException } from "../lib/sentry";
import { logAppEvent } from "../lib/routeHelpers";
import { userHasMarketRead } from "../lib/marketEntitlement";

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

// â”€â”€ Rate limiters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Applied only to the four AI-backed endpoints that hit OpenAI and are
// expensive to abuse. Limits are intentionally generous â€” a real user
// clicking through the app will never approach them.
const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,       // 1-minute rolling window
  max: 10,                   // 10 requests per IP per minute
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests â€” please wait a moment before trying again." },
});

// â”€â”€â”€ Scout search: field-level query match scoring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Hoisted to module scope â€” not re-instantiated on every request.

export type FieldMatchResult = { score: number; basis: string };

/** Unwrap a raw DB field to a plain comparable string.
 *  Handles JSONB-serialised arrays (categories: '["gene_therapy","oncology"]')
 *  and underscore-joined values so substring matching works correctly. */
export function toText(raw: string | null | undefined): string {
  if (!raw) return "";
  if (raw.trimStart().startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return (parsed as string[]).join(" ").replace(/_/g, " ");
    } catch {}
  }
  return raw.replace(/_/g, " ");
}

/** Absolute field-level query-match score for a single TTO asset.
 *  Score reflects WHERE each term appears, not the asset's rank among other results â€”
 *  every asset with the term in its name scores 95 regardless of result-set size.
 *
 *  Returns null when every query token is < 3 characters (e.g. "IL", "NK AR").
 *  The caller must leave normalizedRrfById unpopulated in that case so
 *  scoreSearchRelevance receives undefined â†’ hasData:false, which causes
 *  computeTotal to redistribute the 80% search_relevance weight to
 *  record_quality and availability rather than pinning every asset at 50. */
export function computeFieldMatch(q: string, r: RetrievedAsset): FieldMatchResult | null {
  const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  if (terms.length === 0) return null;

  const tiers: { text: string; score: number; label: string }[] = [
    { text: toText(r.assetName).toLowerCase(),                                    score: 95, label: "asset name" },
    { text: `${toText(r.indication)} ${toText(r.target)}`.toLowerCase(),          score: 85, label: "indication or target" },
    { text: `${toText(r.modality)} ${toText(r.mechanismOfAction)}`.toLowerCase(), score: 75, label: "mechanism or modality" },
    { text: `${toText(r.innovationClaim)} ${toText(r.summary)}`.toLowerCase(),    score: 65, label: "description" },
    { text: `${toText(r.biology)} ${toText(r.categories)}`.toLowerCase(),         score: 55, label: "secondary fields" },
  ];

  type TermResult = { score: number; label: string | null };
  const termResults: TermResult[] = terms.map((term) => {
    for (const tier of tiers) {
      if (tier.text.includes(term)) return { score: tier.score, label: tier.label };
    }
    return { score: 40, label: null }; // FTS/vector match on indexed content not in structured fields
  });

  const avg = termResults.reduce((sum, t) => sum + t.score, 0) / termResults.length;
  const score = Math.min(100, Math.round(avg));

  const structuredHits = termResults.filter((t) => t.label !== null);
  const hasUnstructured = termResults.some((t) => t.label === null);
  let basis: string;
  if (structuredHits.length === 0) {
    basis = `Semantic or full-text match (score: ${score}/100)`;
  } else {
    const bestLabel = structuredHits.reduce((best, t) => t.score > best.score ? t : best).label!;
    basis = hasUnstructured
      ? `Query terms found in ${bestLabel} (partial structured match)`
      : `Query terms found in ${bestLabel}`;
  }

  return { score, basis };
}



export function registerSearchRoutes(app: Express): void {
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

      // Call searchPatents and searchClinicalTrials directly, bypassing the
      // 4s per-source budget in collectAllSignalsWithDiag â€” both have a 12s
      // upstream AbortSignal of their own (USPTO/CT.gov can legitimately take
      // 5-10s on cold queries) and were being prematurely dropped at 4s.
      // We wrap them at 13s here so the upstream AbortSignal fires first and
      // the source surfaces its own typed error rather than a generic timeout.
      const DIRECT_SOURCE_TIMEOUT_MS = 13000;
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
          const out = await withHardTimeout(run(), DIRECT_SOURCE_TIMEOUT_MS, key);
          // Connectors now THROW on real failures (auth/transport/parse), so a
          // returned [] here unambiguously means "legitimate zero matches".
          directDiag.push({ source: key, ms: Date.now() - t0, status: out.length === 0 ? "empty" : "ok", count: out.length });
          return out;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const isTimeout = /timed out|abort|timeout/i.test(msg);
          if (isTimeout) {
            console.warn(`[search] ${key} dropped (timeout):`, msg);
          } else {
            console.error(`[search] ${key} dropped (error):`, msg);
          }
          directDiag.push({ source: key, ms: Date.now() - t0, status: isTimeout ? "timeout" : "error", count: 0, error: msg });
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
      // Patents and clinical trials skip LLM normalization (pure buildFallback), so
      // they don't pressure the normalizeSignals timeout — cap raised to 100 safely.
      const TOTAL_CAP = 100;
      const PATENT_RESERVE = 25;
      const TRIAL_RESERVE = 25;
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
        const emptySearchResponse = {
          assets: [],
          query,
          sources: effectiveSources,
          signalsFound: 0,
          assetsFound: 0,
          sourceDiagnostics,
        };
        cacheSet(searchCacheKey, emptySearchResponse, 5 * 60 * 1000);
        return res.json(emptySearchResponse);
      }

      let normalized: Partial<import("../lib/types").ScoredAsset>[];
      try {
        normalized = await withHardTimeout(normalizeSignals(combinedSignals), 6000, "normalizeSignals");
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

      let scored: import("../lib/types").ScoredAsset[];
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

  app.post("/api/scout/search", verifyAnyAuth, async (req, res) => {
    try {
      const scoutUserId = req.headers["x-user-id"] as string;
      // Server-side plan enforcement â€” mirrors ScoutGate client check so the
      // API cannot be called directly to bypass the paywall.
      const userEmail = (req.headers["x-user-email"] as string ?? "").toLowerCase();
      const isAdminUser = getAdminEmails().includes(userEmail);
      if (!isAdminUser) {
        const PAID_PLANS = ["individual", "team5", "team10", "enterprise"];
        const membership = await storage.getOrgPlanByMembership(scoutUserId);
        if (!membership?.plan || !PAID_PLANS.includes(membership.plan)) {
          return res.status(403).json({ error: "Scout subscription required", code: "SCOUT_PLAN_REQUIRED" });
        }
      }
      const schema = z.object({
        // Allow empty query when at least one filter is provided (e.g. browsing
        // by modality/stage/institution from an Alerts "Explore matches" link).
        query: z.string().max(500).default(""),
        minSimilarity: z.number().min(0.40).max(1).default(0.40),
        modality: z.string().optional(),
        stage: z.string().optional(),
        indication: z.string().optional(),
        institution: z.string().optional(),
        biology: z.string().optional(),
        // Multi-value lists (used by Alerts "Explore matches" links + biology chip filter).
        // Each list is OR'd within itself; lists are AND'd across each other.
        biologies: z.array(z.string()).optional(),
        modalities: z.array(z.string()).optional(),
        stages: z.array(z.string()).optional(),
        institutions: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(200).default(100),
        since: z.string().optional(),
        before: z.string().optional(),
        buyerProfile: buyerProfileSchema,
      });
      const { query, minSimilarity, modality, stage, indication, institution, biology, biologies, modalities, stages, institutions, limit, since, before, buyerProfile: sessionBuyerProfile } = schema.parse(req.body);
      const hasAnyFilter = !!(modality || stage || indication || institution || biology || since || before
        || (biologies && biologies.length) || (modalities && modalities.length) || (stages && stages.length) || (institutions && institutions.length));
      if (!query.trim() && !hasAnyFilter) {
        return res.json({ assets: [], query, assetsFound: 0, sources: ["tech_transfer"], fallback: false });
      }
      const sinceDate = since && !isNaN(Date.parse(since)) ? new Date(since) : undefined;
      const beforeDate = before && !isNaN(Date.parse(before)) ? new Date(before) : undefined;

      // Response cache — keyed on query + all filters + user so different users
      // or filter states never share results. 2-min TTL covers the typical
      // search-refine loop while keeping results fresh for active sessions.
      const scoutCacheKey = `scout:${query.trim().toLowerCase()}:${modality ?? ""}:${stage ?? ""}:${indication ?? ""}:${institution ?? ""}:${biology ?? ""}:${since ?? ""}:${before ?? ""}:${(biologies ?? []).join(",")}:${(modalities ?? []).join(",")}:${(stages ?? []).join(",")}:${(institutions ?? []).join(",")}:${scoutUserId ?? ""}`;
      const cachedScout = cacheGet<object>(scoutCacheKey);
      if (cachedScout) return res.json(cachedScout);

      let results: import("../storage").RetrievedAsset[] = [];

      const searchOpts = {
        modality, stage, indication, institution, biology,
        biologies: biologies && biologies.length ? biologies : undefined,
        modalities: modalities && modalities.length ? modalities : undefined,
        stages: stages && stages.length ? stages : undefined,
        institutions: institutions && institutions.length ? institutions : undefined,
        since: sinceDate, before: beforeDate,
      };

      // â”€â”€ Hybrid keyword + vector retrieval (Task #762) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Run keyword (FTS) and vector retrieval in parallel for queried
      // searches, then fuse with Reciprocal Rank Fusion (RRF). Empty-query +
      // filter-only browsing path is unchanged â€” vector search needs a
      // query to embed.
      //
      // Safety net: hybrid path is bypassed entirely (route falls back to
      // pure keyword) when EDEN_HYBRID_SEARCH=false. Default ON in non-prod,
      // OFF in prod unless explicitly enabled.
      const _hybridFlag = (process.env.EDEN_HYBRID_SEARCH ?? "").toLowerCase();
      const _isProdHybrid = (process.env.NODE_ENV ?? "").toLowerCase() === "production";
      const HYBRID_ENABLED =
        _hybridFlag === "true" ? true : _hybridFlag === "false" ? false : !_isProdHybrid;
      // RRF constant â€” standard default from the original RRF paper. Larger
      // values flatten the contribution of high-ranked items; 60 is the
      // canonical compromise.
      const RRF_K = 60;
      // Pull a slightly larger candidate set from each retrieval path so
      // fusion has enough material to mix; result is sliced back to `limit`
      // after RRF + sorting.
      const RETRIEVAL_OVERSAMPLE = Math.max(limit, 100);
      // Vector similarity floor for confidence-gate exemption (#762 step 4).
      // Strong vector hits are exempt from being demoted by the top-5
      // confidence gate, the same way exact-name hits are exempt today.
      const STRONG_VECTOR_THRESHOLD = 0.75;
      // Minimum cosine similarity to consider a vector candidate at all â€”
      // intentionally permissive so RRF can still surface mid-similarity
      // semantic matches that share no tokens with the query.
      const VECTOR_MIN_SIMILARITY = 0.35;

      type RetrievedAssetT = import("../storage").RetrievedAsset;
      const trimmedQuery = query.trim();
      const runHybrid = HYBRID_ENABLED && !!trimmedQuery;

      const hybridSearchOpts = { ...searchOpts, limit: RETRIEVAL_OVERSAMPLE } as const;
      const keywordPromise = storage.keywordSearchIngestedAssets(
        query,
        runHybrid ? RETRIEVAL_OVERSAMPLE : limit,
        searchOpts,
      );

      let embedLatencyMs = 0;
      let embedFallbackReason: string | null = null;
      const vectorPromise: Promise<RetrievedAssetT[]> = runHybrid
        ? (async () => {
            const { getQueryEmbedding } = await import("../lib/queryEmbedding");
            const embed = await getQueryEmbedding(trimmedQuery);
            embedLatencyMs = embed.latencyMs;
            if (!embed.ok) {
              embedFallbackReason = embed.reason + (embed.error ? `:${embed.error}` : "");
              return [];
            }
            try {
              return await withHardTimeout(
                storage.scoutVectorSearch(embed.vec, {
                  ...hybridSearchOpts,
                  minSimilarity: VECTOR_MIN_SIMILARITY,
                }),
                2000,
                "scoutVectorSearch",
              );
            } catch (e) {
              embedFallbackReason = "vector_search_error:" + (e instanceof Error ? e.message : String(e));
              return [];
            }
          })()
        : Promise.resolve([] as RetrievedAssetT[]);

      const hybridStart = Date.now();
      const [keywordResults, vectorResults] = await Promise.all([keywordPromise, vectorPromise]);

      // RRF fusion â€” score(a) = Î£ 1/(K + rank_i(a)) over the lists where
      // `a` appears (rank is 0-indexed). Dedupe by asset id; carry forward
      // textRelevance from the keyword path and similarity from the vector
      // path so the score breakdown has both signals.
      type FusedEntry = {
        asset: RetrievedAssetT;
        rrfScore: number;
        textRank: number | null;
        vectorSimilarity: number | null;
      };
      const fusedById = new Map<number, FusedEntry>();
      const upsert = (asset: RetrievedAssetT, rank: number, isVector: boolean) => {
        const contribution = 1 / (RRF_K + rank + 1);
        const existing = fusedById.get(asset.id);
        if (existing) {
          existing.rrfScore += contribution;
          if (isVector) {
            existing.vectorSimilarity = asset.similarity;
          } else if (asset.textRelevance != null) {
            existing.textRank = asset.textRelevance;
          }
          return;
        }
        fusedById.set(asset.id, {
          asset,
          rrfScore: contribution,
          textRank: !isVector && asset.textRelevance != null ? asset.textRelevance : null,
          vectorSimilarity: isVector ? asset.similarity : null,
        });
      };
      keywordResults.forEach((a, i) => upsert(a, i, false));
      vectorResults.forEach((a, i) => upsert(a, i, true));

      if (runHybrid) {
        // Order by fused RRF score, then slice to the requested limit. Final
        // top-of-list ordering (exact-name pin, confidence gate) is applied
        // below over this slice.
        const fused = [...fusedById.values()].sort((a, b) => b.rrfScore - a.rrfScore).slice(0, limit);
        results = fused.map((f) => ({
          ...f.asset,
          textRelevance: f.textRank ?? f.asset.textRelevance ?? 0,
          similarity: f.vectorSimilarity ?? f.asset.similarity ?? 0,
        }));
      } else {
        results = keywordResults;
      }

      // Telemetry â€” keyword/vector/fused counts, embedding latency, total
      // hybrid latency. Logged on every request so we can spot regressions
      // without enabling the per-request debug header.
      const hybridLatencyMs = Date.now() - hybridStart;
      console.info(
        `[scout/search] hybrid q="${trimmedQuery.slice(0, 80)}" kw=${keywordResults.length} vec=${vectorResults.length} fused=${runHybrid ? results.length : keywordResults.length} embed=${embedLatencyMs}ms total=${hybridLatencyMs}ms${embedFallbackReason ? ` fallback=${embedFallbackReason}` : ""}${runHybrid ? "" : " (hybrid_disabled)"}`,
      );

      // Build per-asset hybrid score map for downstream score_breakdown
      // plumbing (#762 step 5) and confidence-gate exemption (#762 step 4).
      const hybridScoreById = new Map<number, { textRank: number; vectorSimilarity: number; rrfScore: number }>();
      const strongVectorIds = new Set<number>();
      if (runHybrid) {
        for (const f of fusedById.values()) {
          hybridScoreById.set(f.asset.id, {
            textRank: f.textRank ?? 0,
            vectorSimilarity: f.vectorSimilarity ?? 0,
            rrfScore: f.rrfScore,
          });
          if ((f.vectorSimilarity ?? 0) >= STRONG_VECTOR_THRESHOLD) {
            strongVectorIds.add(f.asset.id);
          }
        }
      }

      // Score each retrieved asset against the query using computeFieldMatch (module
      // scope). A null return means every query token was < 3 chars (abbreviation
      // search); those assets are omitted from the map so scoreSearchRelevance
      // receives undefined â†’ hasData:false â†’ weight auto-redistributes to
      // record_quality + availability rather than assigning a flat, meaningless 50.
      const normalizedRrfById = new Map<number, FieldMatchResult>();
      if (trimmedQuery) {
        for (const r of results) {
          const fm = computeFieldMatch(trimmedQuery, r);
          if (fm !== null) normalizedRrfById.set(r.id, fm);
        }
      }

      // Debug surface (#761 step 5): when an internal flag/header is set,
      // surface the synonym expansion so we can verify which groups fired.
      // Off by default so the production payload is unchanged.
      const debugRequested = req.header("x-eden-search-debug") === "1";
      let searchDebug: {
        expanded_terms: { source: string; members: string[]; negated: boolean }[];
        stripped_stopwords: string[];
        original_query: string;
        hybrid?: {
          enabled: boolean;
          keyword_count: number;
          vector_count: number;
          fused_count: number;
          embed_latency_ms: number;
          embed_fallback_reason: string | null;
          strong_vector_count: number;
        };
      } | undefined;
      if (debugRequested && query.trim()) {
        const { expandQuery } = await import("../lib/biotechSynonyms");
        const exp = expandQuery(query);
        searchDebug = {
          expanded_terms: exp.groups.map((g: { source: string; members: string[]; negated: boolean }) => ({ source: g.source, members: g.members, negated: g.negated })),
          stripped_stopwords: exp.strippedStopwords,
          original_query: exp.original,
          hybrid: {
            enabled: runHybrid,
            keyword_count: keywordResults.length,
            vector_count: vectorResults.length,
            fused_count: results.length,
            embed_latency_ms: embedLatencyMs,
            embed_fallback_reason: embedFallbackReason,
            strong_vector_count: strongVectorIds.size,
          },
        };
      }

      // Exact-name guarantee: compute a normalized form of both the query and
      // each result's asset_name so we can pin/boost rows whose name contains
      // the full query string (case + punctuation insensitive). This protects
      // against the confidence gate burying a real exact match.
      // Mirrors storage SQL normalization (lower â†’ strip non [a-z0-9 -] â†’
      // collapse whitespace â†’ trim) so route-level pin/exemption is symmetric
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

      // Require explicit opt-in only â€” never default ON (was !_isProd which crushed
      // all scores to 4â€“7 in non-prod due to low category_confidence).
      const _flagRaw = (process.env.EDEN_CONFIDENCE_AWARE_RANKING ?? "").toLowerCase();
      const CONFIDENCE_AWARE = _flagRaw === "true";
      const CONF_FLOOR = 0.4;
      const LOW_CONF = 0.5;

      // Tie-break metadata for final ordering (#762 step 3): completeness desc,
      // then recency desc. Keyed by id so we don't have to extend ScoredAsset.
      const tieBreakById = new Map<number, { completeness: number; recencyMs: number }>();
      for (const r of results) {
        const completeness = typeof r.completenessScore === "number" ? r.completenessScore : 0;
        const recencyMs = r.lastSeenAt ? new Date(r.lastSeenAt).getTime() : (r.stageChangedAt instanceof Date ? r.stageChangedAt.getTime() : 0);
        tieBreakById.set(r.id, { completeness, recencyMs });
      }

      // â”€â”€ TTO fit-profile: load from saved Deal Focus only â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // (Task #980 / #1060) Fit scoring reflects the user's saved thesis only.
      // The search query already determines which assets surface via text ranking;
      // using it a second time for fit would penalise assets whose stored modality
      // doesn't literally match the query string â€” collapsing scores to 4â€“7.

      // Step 1: load the user's saved thesis (therapeuticAreas + modalities from industry profile).
      let savedFitBasis: { therapeutic_areas: string[]; modalities: string[] } | undefined;
      if (scoutUserId) {
        try {
          const industryProfile = await storage.getIndustryProfileByUserId(scoutUserId);
          if (industryProfile && (industryProfile.therapeuticAreas.length > 0 || industryProfile.modalities.length > 0)) {
            savedFitBasis = {
              therapeutic_areas: industryProfile.therapeuticAreas,
              modalities: industryProfile.modalities,
            };
          }
        } catch (profileLoadErr) {
          console.warn("[scout/search] saved profile load failed:", profileLoadErr instanceof Error ? profileLoadErr.message : profileLoadErr);
        }
      }

      // Step 2: build fit profile. Prefer the session buyerProfile (has full
      // criteria: stages, keywords, excluded stages) over the DB-only profile
      // (therapeutic_areas + modalities only). The search query already drives
      // which assets surface via text ranking â€” fit is an additional boost for
      // thesis alignment, not a search signal.
      let scoutFitProfile: import("../lib/types").BuyerProfile | undefined;
      const sessionHasCriteria = !!(sessionBuyerProfile && (
        (sessionBuyerProfile.therapeutic_areas?.length ?? 0) > 0 ||
        (sessionBuyerProfile.modalities?.length ?? 0) > 0 ||
        (sessionBuyerProfile.preferred_stages?.length ?? 0) > 0 ||
        (sessionBuyerProfile.indication_keywords?.length ?? 0) > 0 ||
        (sessionBuyerProfile.target_keywords?.length ?? 0) > 0
      ));
      if (sessionHasCriteria && sessionBuyerProfile) {
        scoutFitProfile = { ...DEFAULT_BUYER_PROFILE, ...sessionBuyerProfile };
      } else if (savedFitBasis && (savedFitBasis.therapeutic_areas.length > 0 || savedFitBasis.modalities.length > 0)) {
        scoutFitProfile = {
          ...DEFAULT_BUYER_PROFILE,
          therapeutic_areas:   savedFitBasis.therapeutic_areas,
          modalities:          savedFitBasis.modalities,
        };
      }
      // Query-match boost: inject search terms as fit keywords so assets whose
      // text literally matches the query get a fit bonus even without a saved
      // buyer profile. For a specific query like "CAR-T" this pushes clearly
      // relevant results from the 40-65 range up toward 80-100.
      // Only include tokens â‰¥ 4 chars to avoid short abbreviations over-matching.
      if (trimmedQuery) {
        const queryLower = trimmedQuery.toLowerCase();
        const rawTerms = queryLower.split(/\s+/).filter(w => w.length >= 4);
        // Include the full phrase if it's a single meaningful token, plus individual long words
        const queryKw = [...new Set([
          ...(queryLower.length >= 4 ? [queryLower] : []),
          ...rawTerms,
        ])];
        if (queryKw.length > 0) {
          if (scoutFitProfile) {
            scoutFitProfile = {
              ...scoutFitProfile,
              indication_keywords: [...new Set([...(scoutFitProfile.indication_keywords ?? []), ...queryKw])],
              target_keywords: [...new Set([...(scoutFitProfile.target_keywords ?? []), ...queryKw])],
            };
          } else {
            scoutFitProfile = {
              ...DEFAULT_BUYER_PROFILE,
              indication_keywords: queryKw,
              target_keywords: queryKw,
            };
          }
        }
      }

      // â”€â”€ TTO scoring: relevance base + fit bonus â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Base score (search_relevance 80%, record_quality 12%, availability 8%)
      // drives ranking. Fit bonus (+0/+8/+15/+20) is added after â€” boosts
      // thesis-aligned assets without penalising others for imperfect DB fields.
      const assets: ScoredAsset[] = results.map((r) => {
        const partialAsset: Partial<ScoredAsset> = {
          asset_name: r.assetName,
          development_stage: r.developmentStage,
          licensing_status: r.licensingReadiness ?? "unknown",
          owner_name: r.institution,
          owner_type: "university",
          source_types: ["tech_transfer"],
          target: r.target ?? undefined,
          modality: r.modality ?? undefined,
          indication: r.indication ?? undefined,
          summary: r.summary ?? undefined,
          matching_tags: [],
          evidence_count: 1,
          patent_status: "unknown",
          completeness_score: r.completenessScore,
          last_seen_at: r.lastSeenAt ?? undefined,
          latest_signal_date: r.lastSeenAt ?? "",
        };

        const fmEntry = normalizedRrfById.get(r.id);
        const searchRelevanceResult = scoreSearchRelevance(fmEntry?.score, fmEntry?.basis);
        const completenessResult = scoreCompleteness(partialAsset);
        const availabilityResult = scoreAvailability(partialAsset);

        const dimResults = {
          search_relevance: searchRelevanceResult,
          record_quality:   completenessResult,
          availability:     availabilityResult,
        };

        const { total: baseScore, signal_coverage, scored_dimensions, dimension_basis } = computeTotal(dimResults, TTO_WEIGHTS);

        // Fit bonus: soft full-text match, additive only, never penalises
        const fitBonus = computeFitBonus({
          asset_name: r.assetName,
          indication: r.indication ?? undefined,
          target: r.target ?? undefined,
          modality: r.modality ?? undefined,
          summary: r.summary ?? undefined,
          biology: r.biology ?? undefined,
          development_stage: r.developmentStage,
        }, scoutFitProfile);

        const catConf = typeof r.categoryConfidence === "number"
          ? Math.max(0, Math.min(1, r.categoryConfidence))
          : undefined;
        const coverageNorm = signal_coverage / 100;
        const confidenceFactor = catConf !== undefined ? Math.min(catConf, coverageNorm) : coverageNorm;
        const rawTotal = CONFIDENCE_AWARE
          ? Math.max(0, Math.min(100, Math.round(baseScore * (CONF_FLOOR + (1 - CONF_FLOOR) * confidenceFactor))))
          : baseScore;
        const total = Math.max(0, Math.min(100, Math.round(rawTotal + fitBonus)));
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
            search_relevance: searchRelevanceResult.score,
            fit_bonus:      fitBonus,
            record_quality: completenessResult.score,
            availability:   availabilityResult.score,
            fit:          0,
            novelty:      0,
            freshness:    0,
            readiness:    0,
            licensability: 0,
            competition:  0,
            total,
            signal_coverage,
            scored_dimensions,
            dimension_basis,
            confidence_factor: Math.round(confidenceFactor * 100) / 100,
            confidence_aware_enabled: CONFIDENCE_AWARE,
            raw_total: rawTotal,
            ...(catConf !== undefined ? { category_confidence: catConf } : {}),
            ...(typeof r.textRelevance === "number" ? { text_relevance: Math.round(r.textRelevance * 1000) / 1000 } : {}),
            ...(hybridScoreById.has(r.id)
              ? (() => {
                  const h = hybridScoreById.get(r.id)!;
                  return {
                    text_rank: Math.round(h.textRank * 1000) / 1000,
                    vector_similarity: Math.round(h.vectorSimilarity * 1000) / 1000,
                    rrf_score: Math.round(h.rrfScore * 100000) / 100000,
                  };
                })()
              : {}),
          },
          latest_signal_date: r.lastSeenAt ?? "",
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
          completeness_score: r.completenessScore,
          last_seen_at: r.lastSeenAt,
          biology: r.biology ?? null,
          momentum_score: r.momentumScore ?? null,
          institutions: (() => {
            const canon = r.institution ? [r.institution] : [];
            const alts = r.altInstitutions ?? [];
            const all = [...new Set([...canon, ...alts])].filter(Boolean);
            return all.length > 0 ? all : undefined;
          })(),
        };
      });

      const isExact = (a: ScoredAsset) => exactNameIds.has(Number(a.id));
      const textRel = (a: ScoredAsset) => a.score_breakdown?.text_relevance ?? 0;
      const rrfOf = (a: ScoredAsset) => hybridScoreById.get(Number(a.id))?.rrfScore ?? 0;
      const completenessOf = (a: ScoredAsset) => tieBreakById.get(Number(a.id))?.completeness ?? 0;
      const recencyOf = (a: ScoredAsset) => tieBreakById.get(Number(a.id))?.recencyMs ?? 0;
      // TTO score sort:
      //   1. Exact-name matches pinned to top.
      //   2. Score is the primary order. Weights: search_relevance 80% (absolute
      //      field-match grade) + fit_bonus (additive) + record_quality 12% + availability 8%.
      //   3. RRF / text_relevance as secondary tiebreaker between equal scores.
      //   4. Completeness â†’ recency as final tiebreakers.
      assets.sort((a, b) => {
        const ax = isExact(a) ? 1 : 0;
        const bx = isExact(b) ? 1 : 0;
        if (ax !== bx) return bx - ax;
        // Primary: fit-weighted score
        const ds = b.score - a.score;
        if (ds !== 0) return ds;
        // Secondary: text relevance / hybrid RRF as tiebreaker
        if (runHybrid) {
          const dr = rrfOf(b) - rrfOf(a);
          if (Math.abs(dr) > 1e-9) return dr;
        }
        const dt = textRel(b) - textRel(a);
        if (Math.abs(dt) > 1e-6) return dt;
        // Tie-break: completeness desc, then recency desc
        const dc = completenessOf(b) - completenessOf(a);
        if (dc !== 0) return dc;
        return recencyOf(b) - recencyOf(a);
      });

      // Top-5 confidence gate: push low-confidence assets out of the top 5
      // when 5+ higher-confidence alternatives exist (flag-gated). Exact-name
      // matches are exempt â€” they stay in the high bucket so a real text hit
      // is never demoted below unrelated higher-confidence rows.
      if (CONFIDENCE_AWARE && assets.length > 5) {
        // Strong vector hits are exempt from the confidence gate (#762
        // step 4) â€” same treatment as exact-name matches. A high-similarity
        // semantic match should not be demoted just because its category
        // confidence is low, since the vector signal is itself a strong
        // independent confidence indicator.
        const isLow = (a: ScoredAsset) =>
          !isExact(a) && !strongVectorIds.has(Number(a.id))
          && (a.score_breakdown?.confidence_factor ?? 1) < LOW_CONF;
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

      const scoutResponse = {
        assets,
        query,
        assetsFound: assets.length,
        sources: ["tech_transfer"],
        fallback: false,
        ...(searchDebug ? { debug: searchDebug } : {}),
      };
      cacheSet(scoutCacheKey, scoutResponse, 2 * 60 * 1000);
      return res.json(scoutResponse);
    } catch (err: unknown) {
      console.error("[scout/search] Error:", err);
      const message = err instanceof Error ? err.message : "Search failed";
      return res.status(200).json({ assets: [], query: String(req.body?.query ?? ""), assetsFound: 0, sources: ["tech_transfer"], fallback: false, error: message });
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
          first_seen_at, last_seen_at, category_confidence, asset_class
        FROM ingested_assets
        WHERE relevant = true AND completeness_score >= 40
        ORDER BY first_seen_at DESC NULLS LAST
        LIMIT 12
      `);
      const assets = (rows.rows as Record<string, unknown>[]).map((r) => {
        const institution = typeof r.institution === "string" ? r.institution : String(r.institution ?? "");
        const developmentStage = typeof r.development_stage === "string" ? r.development_stage : String(r.development_stage ?? "");
        const licensingReadiness = typeof r.licensing_readiness === "string" ? r.licensing_readiness : null;
        const firstSeenAt = r.first_seen_at ? String(r.first_seen_at) : null;
        const lastSeenAt = r.last_seen_at ? String(r.last_seen_at) : null;
        const sourceUrl = typeof r.source_url === "string" ? r.source_url : null;
        const catConfRaw = r.category_confidence;
        const catConf = catConfRaw != null && !Number.isNaN(parseFloat(String(catConfRaw)))
          ? Math.max(0, Math.min(1, parseFloat(String(catConfRaw))))
          : undefined;
        const assetClass = typeof r.asset_class === "string" && r.asset_class ? r.asset_class : null;
        const completenessScoreVal = r.completeness_score != null ? parseFloat(String(r.completeness_score)) : null;

        // Recently-added feed: no query, no buyer profile.
        // Score = record quality (60%) + availability (40%) after weight redistribution
        // (search_relevance hasData:false â†’ its 80% redistributes to the other two).
        const partialAsset: Partial<ScoredAsset> = {
          development_stage: developmentStage,
          licensing_status: licensingReadiness ?? "unknown",
          owner_name: institution,
          owner_type: "university",
          source_types: ["tech_transfer"],
          modality: typeof r.modality === "string" ? r.modality : undefined,
          indication: typeof r.indication === "string" ? r.indication : undefined,
          matching_tags: [],
          evidence_count: 1,
          patent_status: "unknown",
          completeness_score: completenessScoreVal,
          last_seen_at: lastSeenAt,
          latest_signal_date: lastSeenAt ?? firstSeenAt ?? "",
        };

        const completenessResult = scoreCompleteness(partialAsset);
        const availabilityResult = scoreAvailability(partialAsset);

        const dimResults = {
          search_relevance: scoreSearchRelevance(undefined),
          record_quality:   completenessResult,
          availability:     availabilityResult,
        };

        const { total: rawTotal, signal_coverage, scored_dimensions, dimension_basis } = computeTotal(dimResults, TTO_WEIGHTS);

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
          completeness_score: completenessScoreVal,
          licensing_readiness: licensingReadiness,
          ip_type: typeof r.ip_type === "string" ? r.ip_type : null,
          innovation_claim: typeof r.innovation_claim === "string" ? r.innovation_claim : null,
          stage_changed_at: r.stage_changed_at ? String(r.stage_changed_at) : null,
          previous_stage: typeof r.previous_stage === "string" ? r.previous_stage : null,
          first_seen_at: firstSeenAt,
          score: total,
          score_breakdown: {
            record_quality: completenessResult.score,
            availability:   availabilityResult.score,
            fit:          0,
            fit_bonus:    0,
            novelty:      0,
            freshness:    0,
            readiness:    0,
            licensability: 0,
            competition:  0,
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
          latest_signal_date: lastSeenAt ?? firstSeenAt ?? "",
          matching_tags: [],
          evidence_count: 1,
          confidence,
          ...(catConf !== undefined ? { category_confidence: catConf } : {}),
          asset_class: assetClass,
          signals: [],
        };
      });

      // Preserve recency ordering (already sorted by first_seen_at DESC) â€” this
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

  // â”€â”€ Scout Saved Searches â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  app.get("/api/scout/saved-searches", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const rows = await db.select().from(scoutSavedSearches)
        .where(eq(scoutSavedSearches.userId, userId))
        .orderBy(desc(scoutSavedSearches.createdAt));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/scout/saved-searches", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const data = insertScoutSavedSearchSchema.parse({ ...req.body, userId });
      // Enforce per-user cap of 50.
      const [{ cnt }] = await db.select({ cnt: drizzleCount() }).from(scoutSavedSearches)
        .where(eq(scoutSavedSearches.userId, userId));
      if (Number(cnt) >= 50) {
        return res.status(400).json({ error: "Saved search limit reached (50). Delete some before adding more." });
      }
      try {
        const [row] = await db.insert(scoutSavedSearches).values(data).returning();
        res.status(201).json(row);
      } catch (dbErr: any) {
        if (dbErr.code === "23505") {
          return res.status(409).json({ error: "A saved search with that name already exists." });
        }
        throw dbErr;
      }
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: err.errors });
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/scout/saved-searches/:id", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const id = Number(req.params.id);
      const { notifyByEmail } = z.object({ notifyByEmail: z.boolean() }).parse(req.body);
      const [row] = await db.update(scoutSavedSearches)
        .set({ notifyByEmail })
        .where(and(eq(scoutSavedSearches.id, id), eq(scoutSavedSearches.userId, userId)))
        .returning();
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/scout/saved-searches/:id", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const id = Number(req.params.id);
      await db.delete(scoutSavedSearches)
        .where(and(eq(scoutSavedSearches.id, id), eq(scoutSavedSearches.userId, userId)));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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

  app.get("/api/scout/stats", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT
          COUNT(*)::int AS relevant_assets,
          COUNT(DISTINCT institution)::int AS institutions
        FROM ingested_assets
        WHERE relevant = true
      `);
      const row = result.rows[0] as Record<string, unknown>;
      return res.json({
        relevantAssets: Number(row?.relevant_assets ?? 0),
        institutions: Number(row?.institutions ?? 0),
      });
    } catch (err: any) {
      console.error("[scout/stats] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load stats" });
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

  app.get("/api/intelligence/market", async (req, res) => {
    const validRanges = ["30d", "60d", "90d", "all"] as const;
    type RangeOpt = typeof validRanges[number];
    const rangeParam = (req.query.range as string) || "all";
    const range: RangeOpt = (validRanges as readonly string[]).includes(rangeParam) ? rangeParam as RangeOpt : "all";
    const CACHE_KEY = `intelligence:market:v6:${range}`;
    const TTL_MS = 15 * 60 * 1000;
    const cached = cacheGet<object>(CACHE_KEY);
    if (cached) return res.json(cached);
    try {
      const days = range === "30d" ? 30 : range === "60d" ? 60 : range === "90d" ? 90 : null;
      const df = days !== null ? sql.raw(`AND first_seen_at >= NOW() - INTERVAL '${days} days'`) : sql.raw("");
      const dfWhere = days !== null ? sql.raw(`WHERE first_seen_at >= NOW() - INTERVAL '${days} days' AND`) : sql.raw("WHERE");

      const deltaDays = days ?? 90;
      const [biologyRows, whitespaceRows, modalityRows, weeklyRows, velocityRows, totalRow, stageFunnelRows, opportunityRows, risingRows, instPipelineRows] = await Promise.all([
        db.execute(sql`
          SELECT biology,
            COUNT(*)::int AS count,
            COUNT(*) FILTER (WHERE first_seen_at >= NOW() - INTERVAL '1 day' * ${deltaDays})::int AS recent_delta
          FROM ingested_assets
          WHERE biology IS NOT NULL AND biology != '' AND biology != 'unknown'
          ${df}
          GROUP BY biology ORDER BY count DESC LIMIT 20
        `),
        db.execute(sql`
          SELECT biology, modality, COUNT(*)::int AS count
          FROM ingested_assets
          WHERE biology IS NOT NULL AND biology != '' AND biology != 'unknown'
            AND modality IS NOT NULL AND modality != '' AND modality != 'unknown'
            AND modality NOT IN ('other', 'medical device', 'research tool', 'biologic')
          ${df}
          GROUP BY biology, modality
        `),
        db.execute(sql`
          SELECT modality,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE first_seen_at >= NOW() - INTERVAL '90 days')::int AS recent_delta
          FROM ingested_assets
          ${dfWhere} modality IS NOT NULL AND modality != '' AND modality != 'unknown'
            AND modality NOT IN ('other', 'medical device', 'research tool', 'biologic')
          GROUP BY modality ORDER BY total DESC LIMIT 12
        `),
        db.execute(sql`
          WITH weeks AS (
            SELECT generate_series(
              date_trunc('week', NOW() - INTERVAL '7 weeks'),
              date_trunc('week', NOW()),
              INTERVAL '1 week'
            )::date AS week
          ),
          counts AS (
            SELECT date_trunc('week', first_seen_at)::date AS week, COUNT(*)::int AS count
            FROM ingested_assets
            WHERE first_seen_at >= NOW() - INTERVAL '8 weeks' AND first_seen_at IS NOT NULL
            GROUP BY 1
          )
          SELECT w.week, COALESCE(c.count, 0)::int AS count
          FROM weeks w LEFT JOIN counts c ON c.week = w.week
          ORDER BY w.week
        `),
        db.execute(sql`
          SELECT institution, COUNT(*)::int AS count
          FROM ingested_assets
          ${dfWhere} institution IS NOT NULL AND institution != ''
          GROUP BY institution ORDER BY count DESC LIMIT 20
        `),
        db.execute(sql`SELECT COUNT(*)::int AS total FROM ingested_assets WHERE relevant = true`),
        db.execute(sql`
          SELECT development_stage AS stage, COUNT(*)::int AS count
          FROM ingested_assets
          WHERE relevant = true
            AND development_stage IS NOT NULL AND development_stage != '' AND development_stage != 'unknown'
          ${df}
          GROUP BY development_stage
        `),
        db.execute(sql`
          SELECT biology,
            COUNT(*)::int AS asset_count,
            ROUND(AVG(unmet_need_severity)::numeric, 2)::float AS avg_unmet_need
          FROM ingested_assets
          WHERE relevant = true
            AND biology IS NOT NULL AND biology != '' AND biology != 'unknown'
            AND unmet_need_severity IS NOT NULL
          ${df}
          GROUP BY biology
          HAVING COUNT(*) >= 5
          ORDER BY avg_unmet_need DESC, asset_count ASC
          LIMIT 20
        `),
        db.execute(sql`
          SELECT id, asset_name, institution, biology, modality, development_stage,
            LEAST(100,
              CASE WHEN stage_changed_at >= NOW() - INTERVAL '30 days' THEN 40
                   WHEN stage_changed_at >= NOW() - INTERVAL '60 days' THEN 30
                   WHEN stage_changed_at >= NOW() - INTERVAL '90 days' THEN 20
                   WHEN stage_changed_at >= NOW() - INTERVAL '180 days' THEN 10
                   ELSE 0 END +
              CASE WHEN last_content_change_at >= NOW() - INTERVAL '30 days' THEN 20
                   WHEN last_content_change_at >= NOW() - INTERVAL '60 days' THEN 15
                   WHEN last_content_change_at >= NOW() - INTERVAL '90 days' THEN 10
                   WHEN last_content_change_at >= NOW() - INTERVAL '180 days' THEN 5
                   ELSE 0 END +
              CASE WHEN first_seen_at >= NOW() - INTERVAL '14 days' THEN 20
                   WHEN first_seen_at >= NOW() - INTERVAL '30 days' THEN 15
                   WHEN first_seen_at >= NOW() - INTERVAL '60 days' THEN 10
                   WHEN first_seen_at >= NOW() - INTERVAL '90 days' THEN 5
                   ELSE 0 END
            ) AS momentum_score
          FROM ingested_assets
          WHERE relevant = true
          ORDER BY momentum_score DESC
          LIMIT 15
        `),
        db.execute(sql`
          WITH top_insts AS (
            SELECT institution
            FROM ingested_assets
            WHERE relevant = true AND institution IS NOT NULL AND institution != ''
            ${df}
            GROUP BY institution ORDER BY COUNT(*) DESC LIMIT 10
          )
          SELECT ia.institution, ia.development_stage AS stage, COUNT(*)::int AS count
          FROM ingested_assets ia
          INNER JOIN top_insts ti ON ia.institution = ti.institution
          WHERE ia.relevant = true
            AND ia.development_stage IS NOT NULL
            AND ia.development_stage != '' AND ia.development_stage != 'unknown'
          ${df}
          GROUP BY ia.institution, ia.development_stage
        `),
      ]);

      const biologyLandscape = (biologyRows.rows as Record<string, unknown>[]).map((r) => ({
        biology: String(r.biology ?? ""),
        count: Number(r.count ?? 0),
        recentDelta: Number(r.recent_delta ?? 0),
      }));

      const allWhitespace = whitespaceRows.rows as Record<string, unknown>[];
      const bioSet = new Map<string, number>();
      const modalitySet = new Map<string, number>();
      for (const r of allWhitespace) {
        const b = String(r.biology ?? ""), m = String(r.modality ?? ""), c = Number(r.count ?? 0);
        bioSet.set(b, (bioSet.get(b) ?? 0) + c);
        modalitySet.set(m, (modalitySet.get(m) ?? 0) + c);
      }
      const topBio = [...bioSet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map((e) => e[0]);
      const topModality = [...modalitySet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map((e) => e[0]);
      const cellMap: Record<string, number> = {};
      for (const r of allWhitespace) {
        const b = String(r.biology ?? ""), m = String(r.modality ?? "");
        if (topBio.includes(b) && topModality.includes(m)) {
          cellMap[`${b}|${m}`] = Number(r.count ?? 0);
        }
      }
      const whitespaceMatrix = { biologies: topBio, modalities: topModality, cells: cellMap };

      const modalityMomentum = (modalityRows.rows as Record<string, unknown>[]).map((r) => ({
        modality: String(r.modality ?? ""),
        total: Number(r.total ?? 0),
        recentDelta: Number(r.recent_delta ?? 0),
      }));

      const weeklyTrend = (weeklyRows.rows as Record<string, unknown>[]).map((r) => ({
        week: String(r.week ?? ""),
        count: Number(r.count ?? 0),
      }));

      const institutionVelocity = (velocityRows.rows as Record<string, unknown>[]).map((r) => ({
        institution: String(r.institution ?? ""),
        count: Number(r.count ?? 0),
      }));

      const totalAssetsIndexed = Number((totalRow.rows[0] as Record<string, unknown>)?.total ?? 0);
      const recentDeltaWindow: string = range === "all" ? "90d" : range;

      const stageFunnel = (stageFunnelRows.rows as Record<string, unknown>[]).map((r) => ({
        stage: String(r.stage ?? ""),
        count: Number(r.count ?? 0),
      }));

      const whitespaceOpportunity = (opportunityRows.rows as Record<string, unknown>[]).map((r) => ({
        biology: String(r.biology ?? ""),
        assetCount: Number(r.asset_count ?? 0),
        avgUnmetNeed: Number(r.avg_unmet_need ?? 0),
      }));

      const risingAssets = (risingRows.rows as Record<string, unknown>[]).map((r) => ({
        id: Number(r.id ?? 0),
        title: String(r.asset_name ?? ""),
        institution: String(r.institution ?? ""),
        biology: String(r.biology ?? ""),
        modality: String(r.modality ?? ""),
        developmentStage: String(r.development_stage ?? ""),
        momentumScore: Number(r.momentum_score ?? 0),
      }));

      const instStageMap = new Map<string, { institution: string; stages: Record<string, number>; total: number }>();
      for (const r of instPipelineRows.rows as Record<string, unknown>[]) {
        const inst = String(r.institution ?? "");
        const stage = String(r.stage ?? "");
        const count = Number(r.count ?? 0);
        if (!instStageMap.has(inst)) instStageMap.set(inst, { institution: inst, stages: {}, total: 0 });
        const entry = instStageMap.get(inst)!;
        entry.stages[stage] = count;
        entry.total += count;
      }
      const institutionPipeline = [...instStageMap.values()]
        .sort((a, b) => b.total - a.total)
        .map((e) => ({
          institution: e.institution.length > 28 ? e.institution.slice(0, 28) + "â€¦" : e.institution,
          total: e.total,
          discovery: e.stages["discovery"] ?? 0,
          earlyStage: e.stages["early stage"] ?? 0,
          preclinical: e.stages["preclinical"] ?? 0,
          phase1: e.stages["phase 1"] ?? 0,
          phase2: e.stages["phase 2"] ?? 0,
          phase3: e.stages["phase 3"] ?? 0,
          approved: e.stages["approved"] ?? 0,
          commercial: e.stages["commercial"] ?? 0,
        }));

      const result = { biologyLandscape, whitespaceMatrix, modalityMomentum, weeklyTrend, institutionVelocity, totalAssetsIndexed, recentDeltaWindow, stageFunnel, whitespaceOpportunity, risingAssets, institutionPipeline };
      cacheSet(CACHE_KEY, result, TTL_MS);
      return res.json(result);
    } catch (err: any) {
      console.error("[intelligence/market] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load market intelligence" });
    }
  });

  app.get("/api/intelligence/assets", async (req, res) => {
    try {
      const biology = req.query.biology as string | undefined;
      const modality = req.query.modality as string | undefined;
      const institution = req.query.institution as string | undefined;
      const after = req.query.after as string | undefined;
      const before = req.query.before as string | undefined;
      const rawLimit = parseInt(String(req.query.limit ?? "20"), 10);
      const rawOffset = parseInt(String(req.query.offset ?? "0"), 10);
      const limit = Math.min(Math.max(isNaN(rawLimit) ? 20 : rawLimit, 1), 100);
      const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

      const rangeParam = req.query.range as string | undefined;
      const validAssetRanges: Record<string, number> = { "30d": 30, "60d": 60, "90d": 90 };
      const daysNum = rangeParam && validAssetRanges[rangeParam] ? validAssetRanges[rangeParam] : null;
      const cutoff = daysNum
        ? new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const mkDateFilter = () => cutoff ? sql`AND first_seen_at >= ${cutoff}::timestamptz` : sql``;

      if (!biology && !modality && !institution && !after && !before) {
        return res.status(400).json({ error: "At least one filter is required" });
      }

      let rows;
      let countRows;

      if (biology && modality) {
        [rows, countRows] = await Promise.all([
          db.execute(sql`
            SELECT id, asset_name, institution, modality, biology, completeness_score
            FROM ingested_assets
            WHERE biology = ${biology} AND modality = ${modality}
            ${mkDateFilter()}
            ORDER BY completeness_score DESC NULLS LAST
            LIMIT ${limit} OFFSET ${offset}
          `),
          db.execute(sql`
            SELECT COUNT(*)::int AS total FROM ingested_assets
            WHERE biology = ${biology} AND modality = ${modality}
            ${mkDateFilter()}
          `),
        ]);
      } else if (biology) {
        [rows, countRows] = await Promise.all([
          db.execute(sql`
            SELECT id, asset_name, institution, modality, biology, completeness_score
            FROM ingested_assets
            WHERE biology = ${biology}
            ${mkDateFilter()}
            ORDER BY completeness_score DESC NULLS LAST
            LIMIT ${limit} OFFSET ${offset}
          `),
          db.execute(sql`
            SELECT COUNT(*)::int AS total FROM ingested_assets
            WHERE biology = ${biology}
            ${mkDateFilter()}
          `),
        ]);
      } else if (modality) {
        [rows, countRows] = await Promise.all([
          db.execute(sql`
            SELECT id, asset_name, institution, modality, biology, completeness_score
            FROM ingested_assets
            WHERE modality = ${modality}
            ${mkDateFilter()}
            ORDER BY completeness_score DESC NULLS LAST
            LIMIT ${limit} OFFSET ${offset}
          `),
          db.execute(sql`
            SELECT COUNT(*)::int AS total FROM ingested_assets
            WHERE modality = ${modality}
            ${mkDateFilter()}
          `),
        ]);
      } else if (institution) {
        [rows, countRows] = await Promise.all([
          db.execute(sql`
            SELECT id, asset_name, institution, modality, biology, completeness_score
            FROM ingested_assets
            WHERE institution = ${institution}
            ${mkDateFilter()}
            ORDER BY completeness_score DESC NULLS LAST
            LIMIT ${limit} OFFSET ${offset}
          `),
          db.execute(sql`
            SELECT COUNT(*)::int AS total FROM ingested_assets
            WHERE institution = ${institution}
            ${mkDateFilter()}
          `),
        ]);
      } else if (after && before) {
        const afterDate = new Date(after);
        const beforeDate = new Date(before);
        if (isNaN(afterDate.getTime()) || isNaN(beforeDate.getTime())) {
          return res.status(400).json({ error: "Invalid date format" });
        }
        [rows, countRows] = await Promise.all([
          db.execute(sql`
            SELECT id, asset_name, institution, modality, biology, completeness_score
            FROM ingested_assets
            WHERE first_seen_at >= ${afterDate.toISOString()} AND first_seen_at < ${beforeDate.toISOString()}
            ORDER BY completeness_score DESC NULLS LAST
            LIMIT ${limit} OFFSET ${offset}
          `),
          db.execute(sql`
            SELECT COUNT(*)::int AS total FROM ingested_assets
            WHERE first_seen_at >= ${afterDate.toISOString()} AND first_seen_at < ${beforeDate.toISOString()}
          `),
        ]);
      } else {
        return res.status(400).json({ error: "Provide a valid filter combination" });
      }

      const assets = (rows.rows as Record<string, unknown>[]).map((r) => ({
        id: Number(r.id),
        title: String(r.asset_name ?? ""),
        institution: String(r.institution ?? ""),
        modality: String(r.modality ?? ""),
        biology: String(r.biology ?? ""),
        score: r.completeness_score != null ? Number(r.completeness_score) : null,
      }));

      const total = Number((countRows.rows[0] as Record<string, unknown>)?.total ?? 0);

      return res.json({ assets, total });
    } catch (err: any) {
      console.error("[intelligence/assets] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load assets" });
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

  // SSE streaming dossier — mini by default, gpt-4o when fullModel=true
  app.post("/api/dossier/stream", aiRateLimit, async (req, res) => {
    try {
      const body = z.object({ asset: z.any(), fullModel: z.boolean().optional() }).parse(req.body);
      if (!body.asset) return res.status(400).json({ error: "Asset required" });
      const asset = body.asset as ScoredAsset;
      const fullModel = body.fullModel ?? false;

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      for await (const chunk of streamDossierNarrative(asset, fullModel)) {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true, generated_at: new Date().toISOString() })}\n\n`);
      logAppEvent("dossier_opened", { institution: asset.institution ?? null, model: fullModel ? "gpt-4o" : "gpt-4o-mini" });
      res.end();
    } catch (err: any) {
      console.error("Dossier stream error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: friendlyOpenAIError(err) });
      } else {
        res.write(`data: ${JSON.stringify({ error: friendlyOpenAIError(err) })}\n\n`);
        res.end();
      }
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
      let clinicalTrials: Array<{ nctId: string; title: string; phase: string; status: string; url: string }> = [];

      if (enrichedRecord) {
        const searchTerms = [
          enrichedRecord.target !== "unknown" ? enrichedRecord.target : null,
          enrichedRecord.indication !== "unknown" ? enrichedRecord.indication : null,
        ].filter(Boolean).join(" ");

        if (searchTerms) {
          // Literature (PubMed + bioRxiv) and clinical trials run in parallel
          const [litResult, trialResult] = await Promise.allSettled([
            (async () => {
              const pubmedSource = dataSources["pubmed" as SourceKey];
              const biorxivSource = dataSources["biorxiv" as SourceKey];
              const signals: RawSignal[] = [];
              if (pubmedSource) signals.push(...await pubmedSource.search(searchTerms, 3));
              if (biorxivSource) signals.push(...await biorxivSource.search(searchTerms, 2));
              return signals;
            })(),
            searchClinicalTrials(searchTerms, 5),
          ]);

          if (litResult.status === "fulfilled") {
            literature = litResult.value.map((s) => ({
              title: s.title,
              url: s.url,
              date: s.date,
              source_type: s.source_type,
            }));
          } else {
            console.error("[intelligence] Literature fetch error:", litResult.reason);
          }

          if (trialResult.status === "fulfilled") {
            clinicalTrials = trialResult.value
              .filter((s) => s.metadata?.nct_id)
              .map((s) => ({
                nctId: String(s.metadata!.nct_id),
                title: s.title,
                phase: String(s.metadata?.phase ?? ""),
                status: String(s.metadata?.status ?? ""),
                url: s.url,
              }));
          } else {
            console.error("[intelligence] Clinical trials fetch error:", trialResult.reason);
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
              enrichmentSources: enrichedRecord.enrichmentSources as Record<string, string> | null,
              humanVerified: enrichedRecord.humanVerified as Record<string, boolean> | null,
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
        clinicalTrials,
      });
      logAppEvent("intelligence_fetched", { institution: enrichedRecord?.institution ?? null });
    } catch (err: any) {
      console.error("[intelligence] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to fetch intelligence" });
    }
  });

  // POST /api/assets/:fingerprint/export-pdf — server-side Playwright PDF generation
  app.post("/api/assets/:fingerprint/export-pdf", verifyAnyAuth, async (req, res) => {
    try {
      const { fingerprint } = req.params;
      const fingerprintStr = Array.isArray(fingerprint) ? fingerprint[0] : fingerprint;
      if (!fingerprintStr) return res.status(400).json({ error: "Fingerprint required" });

      const { asset, dossier } = req.body as {
        asset?: import("../lib/types").ScoredAsset;
        dossier?: { narrative: string; generated_at: string } | null;
      };

      // Fetch enriched record and competing assets from DB
      let rec = await db.select().from(ingestedAssets)
        .where(eq(ingestedAssets.fingerprint, fingerprintStr)).limit(1).then((r) => r[0]);
      if (!rec) {
        const n = parseInt(fingerprintStr, 10);
        if (!isNaN(n)) rec = await db.select().from(ingestedAssets)
          .where(eq(ingestedAssets.id, n)).limit(1).then((r) => r[0]);
      }

      let competing: typeof rec[] = [];
      if (rec?.target && rec.target !== "unknown") {
        competing = await db.select().from(ingestedAssets).where(
          and(
            eq(ingestedAssets.target, rec.target),
            sql`${ingestedAssets.institution} != ${rec.institution}`,
            eq(ingestedAssets.relevant, true),
            sql`${ingestedAssets.fingerprint} != ${fingerprintStr}`,
          )
        ).limit(5);
      }

      // Best-effort literature fetch (non-blocking)
      let literature: Array<{ title: string; url: string; date: string; source_type: string }> = [];
      if (rec) {
        const terms = [rec.target, rec.indication].filter((v) => v && v !== "unknown").join(" ");
        if (terms) {
          try {
            const pubmed = dataSources["pubmed" as SourceKey];
            if (pubmed) {
              const sigs = await Promise.race([
                pubmed.search(terms, 4),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
              ]);
              literature = (sigs as import("../lib/types").RawSignal[]).map((s) => ({
                title: s.title, url: s.url, date: s.date, source_type: s.source_type,
              }));
            }
          } catch { /* skip literature on timeout */ }
        }
      }

      const { generateDossierPdf } = await import("../pdfExport");

      const pdf = await generateDossierPdf({
        fingerprint: fingerprintStr,
        assetName: (rec?.assetName?.trim() || asset?.asset_name?.trim()) || "Asset Dossier",
        institution: (rec?.institution?.trim() || asset?.institution?.trim()) || null,
        indication: (rec?.indication?.trim() || asset?.indication?.trim()) || null,
        target: (rec?.target?.trim() || asset?.target?.trim()) || null,
        modality: (rec?.modality?.trim() || asset?.modality?.trim()) || null,
        stage: (rec?.developmentStage?.trim() || asset?.development_stage?.trim()) || null,
        patentStatus: (rec?.patentStatus?.trim() || asset?.patent_status?.trim()) || null,
        licensingStatus: (rec?.licensingStatus?.trim() || asset?.licensing_status?.trim()) || null,
        contactEmail: rec?.contactEmail ?? asset?.contact_office ?? null,
        sourceTypes: asset?.source_types ?? [],
        evidenceCount: asset?.evidence_count ?? 0,
        sourceUrls: asset?.source_urls ?? (rec?.sourceUrl ? [rec.sourceUrl] : []),
        score: asset?.score ?? 0,
        scoreBreakdown: asset?.score_breakdown ? {
          novelty: asset.score_breakdown.novelty,
          freshness: asset.score_breakdown.freshness,
          readiness: asset.score_breakdown.readiness,
          licensability: asset.score_breakdown.licensability,
          fit: asset.score_breakdown.fit,
          competition: asset.score_breakdown.competition,
          total: asset.score_breakdown.total,
          signal_coverage: asset.score_breakdown.signal_coverage ?? 0,
          scored_dimensions: asset.score_breakdown.scored_dimensions ?? [],
        } : null,
        mechanismOfAction: rec?.mechanismOfAction ?? null,
        abstract: rec?.abstract ?? null,
        ipType: rec?.ipType ?? null,
        licensingReadiness: rec?.licensingReadiness ?? null,
        inventors: rec?.inventors ?? null,
        innovationClaim: rec?.innovationClaim ?? null,
        unmetNeed: rec?.unmetNeed ?? null,
        comparableDrugs: rec?.comparableDrugs ?? null,
        whyItMatters: asset?.why_it_matters ?? null,
        literature,
        competingAssets: competing.map((c) => ({
          assetName: c.assetName ?? "",
          target: c.target ?? "",
          modality: c.modality ?? "",
          developmentStage: c.developmentStage ?? "",
          institution: c.institution ?? "",
        })),
        narrative: dossier?.narrative ?? null,
        narrativeGeneratedAt: dossier?.generated_at ?? null,
      });

      const safeName = (rec?.assetName?.trim() || asset?.asset_name?.trim() || "dossier")
        .replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_").slice(0, 60);
      const date = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="EdenScout_${safeName}_${date}.pdf"`);
      res.setHeader("Content-Length", pdf.length);
      return res.end(pdf);
    } catch (err: any) {
      console.error("[export-pdf] Error:", err);
      return res.status(500).json({ error: err.message ?? "PDF generation failed" });
    }
  });

  // GET /api/assets/:fingerprint/regulatory — Orphan Drug designations matched to this asset
  app.get("/api/assets/:fingerprint/regulatory", async (req, res) => {
    try {
      const { fingerprint } = req.params;
      const fingerprintStr = Array.isArray(fingerprint) ? fingerprint[0] : fingerprint;

      // Resolve the asset's indication for matching
      const where = /^\d+$/.test(fingerprintStr)
        ? eq(ingestedAssets.id, parseInt(fingerprintStr, 10))
        : eq(ingestedAssets.fingerprint, fingerprintStr);

      const [rec] = await db
        .select({ indication: ingestedAssets.indication, target: ingestedAssets.target })
        .from(ingestedAssets)
        .where(where)
        .limit(1);

      if (!rec || !rec.indication || rec.indication === "unknown") {
        return res.json({ designations: [] });
      }

      // Trigram similarity match on the indication field.
      // Threshold 0.25 is permissive enough to catch partial matches (e.g.
      // "acute myeloid leukemia" ↔ "leukemia") while filtering noise.
      const rows = await db.execute<{
        id: number;
        application_number: string | null;
        sponsor_name: string | null;
        generic_name: string | null;
        brand_name: string | null;
        indication: string;
        source_url: string | null;
        sim: number;
      }>(sql`
        SELECT
          id,
          application_number,
          sponsor_name,
          generic_name,
          brand_name,
          indication,
          source_url,
          similarity(indication, ${rec.indication}) AS sim
        FROM regulatory_designations
        WHERE similarity(indication, ${rec.indication}) > 0.25
        ORDER BY sim DESC
        LIMIT 5
      `);

      return res.json({
        designations: rows.rows.map((r) => ({
          id: r.id,
          applicationNumber: r.application_number,
          sponsorName: r.sponsor_name,
          genericName: r.generic_name,
          brandName: r.brand_name,
          indication: r.indication,
          sourceUrl: r.source_url,
          similarity: Math.round(Number(r.sim) * 100),
        })),
      });
    } catch (err: any) {
      // Table may not exist yet during first boot — return empty gracefully
      console.error("[regulatory] Error:", err?.message);
      return res.json({ designations: [] });
    }
  });

  // POST /api/admin/regulatory/sync — manual trigger for the weekly FDA sync
  app.post("/api/admin/regulatory/sync", requireAdmin, async (_req, res) => {
    try {
      const { syncRegulatoryDesignations } = await import("../lib/regulatorySync");
      const result = await syncRegulatoryDesignations();
      return res.json(result);
    } catch (err: any) {
      console.error("[regulatory] Manual sync error:", err?.message);
      return res.status(500).json({ error: err.message ?? "Sync failed" });
    }
  });

  // GET /api/assets/:fingerprint/signal-events — Signal Activity timeline for the dossier
  app.get("/api/assets/:fingerprint/signal-events", async (req, res) => {
    try {
      const { fingerprint } = req.params;
      const fingerprintStr = Array.isArray(fingerprint) ? fingerprint[0] : fingerprint;

      // Resolve asset record (needed for synthetic event backfill)
      const where = /^\d+$/.test(fingerprintStr)
        ? eq(ingestedAssets.id, parseInt(fingerprintStr, 10))
        : eq(ingestedAssets.fingerprint, fingerprintStr);

      const [rec] = await db.select({
        id: ingestedAssets.id,
        firstSeenAt: ingestedAssets.firstSeenAt,
        stageChangedAt: ingestedAssets.stageChangedAt,
        previousStage: ingestedAssets.previousStage,
      })
        .from(ingestedAssets)
        .where(where)
        .limit(1);

      if (!rec) return res.json({ events: [] });

      const storedEvents = await storage.getSignalEvents(rec.id);
      const syntheticEvents: typeof storedEvents = [];

      // Back-fill first_indexed from first_seen_at so every asset has at least one event
      if (!storedEvents.some((e) => e.eventType === "first_indexed") && rec.firstSeenAt) {
        syntheticEvents.push({ id: -1, eventType: "first_indexed", payload: null, occurredAt: rec.firstSeenAt });
      }
      // Back-fill stage_change from stage_changed_at + previous_stage columns
      if (!storedEvents.some((e) => e.eventType === "stage_change") && rec.stageChangedAt && rec.previousStage) {
        syntheticEvents.push({ id: -2, eventType: "stage_change", payload: { from: rec.previousStage, to: null }, occurredAt: rec.stageChangedAt });
      }

      const merged = [...storedEvents, ...syntheticEvents]
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

      return res.json({
        events: merged.map((e) => ({
          id: e.id,
          event_type: e.eventType,
          payload: e.payload,
          occurred_at: e.occurredAt.toISOString(),
        })),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message ?? "Failed to fetch signal events" });
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

  const feedbackBodySchema = z.object({
    assetId: z.number().int().positive(),
    action: z.enum(["save", "dismiss", "view", "nda_request"]),
    source: z.string().max(40).optional(),
  });

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

}
