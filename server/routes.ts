import crypto from "crypto";
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertDiscoveryCardSchema, insertResearchProjectSchema, insertSavedReferenceSchema, insertSavedGrantSchema, insertConceptCardSchema, conceptCards, type InsertResearchProject, type IngestedAsset, ingestedAssets } from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, desc } from "drizzle-orm";
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
import { verifyResearcherAuth, verifyConceptAuth, verifyAnyAuth } from "./lib/supabaseAuth";
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
  maxPerSource: z.number().int().min(1).max(50).default(5),
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
  maxPerSource: z.number().int().min(1).max(15).default(5),
  buyerProfile: buyerProfileSchema,
});

const dossierBodySchema = z.object({
  asset: z.any(),
});

const saveAssetBodySchema = z.object({
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
      signals = applyRelevanceFilter(signals, query);

      if (signals.length === 0) {
        await storage.createSearchHistory({ query, source: effectiveSources.join(","), resultCount: 0 });
        return res.json({ assets: [], query, sources: effectiveSources, signalsFound: 0 });
      }

      const normalized = await normalizeSignals(signals);
      const clustered = clusterAssets(normalized);
      const profile = buyerProfile ?? DEFAULT_BUYER_PROFILE;
      const scored = await scoreAssets(clustered, profile);

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

  app.get("/api/saved-assets", async (_req, res) => {
    try {
      const assets = await storage.getSavedAssets();
      res.json({ assets });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch saved assets" });
    }
  });

  app.post("/api/saved-assets", async (req, res) => {
    try {
      const body = saveAssetBodySchema.parse(req.body);
      const asset = await storage.createSavedAsset({
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

      const totalInDb = rows.reduce((s, r) => s + r.totalInDb, 0);
      const totalBiotechRelevant = rows.reduce((s, r) => s + r.biotechRelevant, 0);
      const issueCount = rows.filter((r) => r.health !== "ok" && r.health !== "syncing" && r.health !== "never").length;
      const syncingCount = rows.filter((r) => r.health === "syncing").length;

      const scheduler = getSchedulerStatus();

      res.json({
        rows,
        totalInDb,
        totalBiotechRelevant,
        totalInstitutions: allInstitutionNames.length,
        issueCount,
        syncingCount,
        scheduler,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch collector health" });
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

      async function worker() {
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

  // Pass-through — schema now uses canonical field names directly
  function canonicalizeConcept(c: Record<string, any>) { return c; }

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
      res.json({ concepts: results.map(canonicalizeConcept), page, limit, total: count, totalPages: Math.ceil(count / limit) });
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
      res.json({ concepts: results.map(canonicalizeConcept) });
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
      res.json({ concept: canonicalizeConcept(concept) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/discovery/concepts", verifyConceptAuth, async (req, res) => {
    try {
      const parsed = insertConceptCardSchema.parse({
        ...req.body,
        userId: req.headers["x-concept-user-id"] as string,
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

      const [concept] = await db
        .insert(conceptCards)
        .values({
          ...parsed,
          credibilityScore: aiScore,
          credibilityRationale: aiRationale,
        })
        .returning();

      res.json({ concept: canonicalizeConcept(concept) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch("/api/discovery/concepts/:id/interest", verifyAnyAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const type = (req.body?.type as string) || "collaborating";
      const colMap: Record<string, any> = {
        collaborating: { interestCollaborating: sql`${conceptCards.interestCollaborating} + 1` },
        funding: { interestFunding: sql`${conceptCards.interestFunding} + 1` },
        advising: { interestAdvising: sql`${conceptCards.interestAdvising} + 1` },
      };
      const updateSet = colMap[type] ?? colMap.collaborating;
      const [updated] = await db
        .update(conceptCards)
        .set(updateSet)
        .where(eq(conceptCards.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Concept not found" });
      res.json({ concept: updated });
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
      const searchSlug = therapyArea.substring(0, 10);
      // Build literature search term from concept title + hypothesis + therapeuticArea for maximum relevance
      const titleTerms = (concept.title ?? "").split(/\s+/).filter(w => w.length > 4).slice(0, 3).join(" ");
      const hypothesisTerms = (concept.hypothesis ?? "").split(/\s+/).filter(w => w.length > 5).slice(0, 3).join(" ");
      const litSearchTerms = [titleTerms, hypothesisTerms, therapyArea].filter(Boolean).join(" ");

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
          .where(
            and(
              eq(ingestedAssets.relevant, true),
              sql`lower(${ingestedAssets.indication}) like ${"%" + searchSlug + "%"}`
            )
          )
          .orderBy(desc(ingestedAssets.firstSeenAt))
          .limit(6),

        (async () => {
          const [pubmedItems, biorxivItems] = await Promise.allSettled([
            (async () => {
              const searchTerm = encodeURIComponent(litSearchTerms);
              const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${searchTerm}&retmax=4&retmode=json&sort=relevance`;
              const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });
              if (!searchRes.ok) return [];
              const searchJson = await searchRes.json() as { esearchresult?: { idlist?: string[] } };
              const ids: string[] = searchJson.esearchresult?.idlist ?? [];
              if (ids.length === 0) return [];
              const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`;
              const summaryRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(5000) });
              if (!summaryRes.ok) return [];
              const summaryJson = await summaryRes.json() as { result?: Record<string, any> };
              const result = summaryJson.result ?? {};
              return ids.slice(0, 4).map((pmid) => {
                const doc = result[pmid] ?? {};
                return {
                  source: "pubmed" as const,
                  pmid,
                  title: doc.title ?? "Untitled",
                  authors: (doc.authors ?? []).slice(0, 2).map((a: any) => a.name).join(", "),
                  journal: doc.fulljournalname ?? doc.source ?? "",
                  year: doc.pubdate?.substring(0, 4) ?? "",
                  url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
                };
              });
            })(),
            (async () => {
              const q = encodeURIComponent(litSearchTerms);
              const url = `https://api.crossref.org/works?query=${q}&filter=type:posted-content,member:246&rows=3&sort=relevance&mailto=eden@edenradar.io`;
              const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
              if (!res.ok) return [];
              const json = await res.json() as { message?: { items?: any[] } };
              return (json.message?.items ?? []).slice(0, 3).map((item: any) => {
                const pmid = item.DOI ?? "";
                const authors = (item.author ?? []).slice(0, 2).map((a: any) => `${a.given ?? ""} ${a.family ?? ""}`.trim()).join(", ");
                const year = item.created?.["date-parts"]?.[0]?.[0]?.toString() ?? "";
                return {
                  source: "biorxiv" as const,
                  pmid,
                  title: item.title?.[0] ?? "Untitled",
                  authors,
                  journal: "bioRxiv preprint",
                  year,
                  url: `https://doi.org/${pmid}`,
                };
              });
            })(),
          ]);
          const pubmed = pubmedItems.status === "fulfilled" ? pubmedItems.value : [];
          const biorxiv = biorxivItems.status === "fulfilled" ? biorxivItems.value : [];
          return [...pubmed, ...biorxiv];
        })(),
      ]);

      res.json({
        assets: relatedAssets.status === "fulfilled" ? relatedAssets.value : [],
        literature: pubmedResults.status === "fulfilled" ? pubmedResults.value : [],
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
