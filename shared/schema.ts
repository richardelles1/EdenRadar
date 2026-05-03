import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean, uuid, date, real, customType, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

const vector1536 = customType<{ data: number[]; driverData: string }>({
  dataType() { return "vector(1536)"; },
  fromDriver(v: string): number[] { return v.slice(1, -1).split(",").map(Number); },
  toDriver(v: number[]): string { return `[${v.join(",")}]`; },
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  subscribedToDigest: boolean("subscribed_to_digest").notNull().default(false),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// user_id is a Supabase Auth UUID (from supabase.auth.getUser).
// Industry users authenticate via Supabase, not our local `users` table,
// so no FK to users.id is possible or correct here.
export const industryProfiles = pgTable("industry_profiles", {
  userId: text("user_id").primaryKey(),
  userName: text("user_name").notNull().default(""),
  companyName: text("company_name").notNull().default(""),
  companyType: text("company_type").notNull().default(""),
  therapeuticAreas: text("therapeutic_areas").array().notNull().default(sql`'{}'::text[]`),
  dealStages: text("deal_stages").array().notNull().default(sql`'{}'::text[]`),
  modalities: text("modalities").array().notNull().default(sql`'{}'::text[]`),
  onboardingDone: boolean("onboarding_done").notNull().default(false),
  notificationPrefs: jsonb("notification_prefs").$type<{ frequency: string }>().default({ frequency: "daily" }),
  subscribedToDigest: boolean("subscribed_to_digest").notNull().default(false),
  lastAlertSentAt: timestamp("last_alert_sent_at"),
  alertLastAssetId: integer("alert_last_asset_id"),
  lastViewedAlertsAt: timestamp("last_viewed_alerts_at"),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  orgId: integer("org_id").references(() => organizations.id, { onDelete: "set null" }),
});

export type IndustryProfileRow = typeof industryProfiles.$inferSelect;

export const searchHistory = pgTable("search_history", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  source: text("source").notNull().default("pubmed"),
  resultCount: integer("result_count").notNull().default(0),
  userId: text("user_id"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertSearchHistorySchema = createInsertSchema(searchHistory).omit({
  id: true,
  createdAt: true,
});
export type InsertSearchHistory = z.infer<typeof insertSearchHistorySchema>;
export type SearchHistory = typeof searchHistory.$inferSelect;

export const pipelineLists = pgTable("pipeline_lists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  userId: text("user_id"),
  orgId: integer("org_id").references(() => organizations.id, { onDelete: "cascade" }),
});

export const insertPipelineListSchema = createInsertSchema(pipelineLists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPipelineList = z.infer<typeof insertPipelineListSchema>;
export type PipelineList = typeof pipelineLists.$inferSelect;

export const savedAssets = pgTable("saved_assets", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  ingestedAssetId: integer("ingested_asset_id"),
  pipelineListId: integer("pipeline_list_id").references(() => pipelineLists.id, { onDelete: "set null" }),
  assetName: text("asset_name").notNull(),
  target: text("target").notNull(),
  modality: text("modality").notNull(),
  developmentStage: text("development_stage").notNull(),
  diseaseIndication: text("disease_indication").notNull(),
  summary: text("summary").notNull(),
  sourceTitle: text("source_title").notNull(),
  sourceJournal: text("source_journal").notNull(),
  publicationYear: text("publication_year").notNull(),
  sourceName: text("source_name").notNull().default("pubmed"),
  sourceUrl: text("source_url"),
  pmid: text("pmid"),
  status: text("status"),
  savedAt: timestamp("saved_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const SAVED_ASSET_STATUSES = ["watching", "evaluating", "in_discussion", "on_hold", "passed"] as const;
export type SavedAssetStatus = typeof SAVED_ASSET_STATUSES[number];
export const savedAssetStatusEnum = z.enum(SAVED_ASSET_STATUSES).nullable().optional();
export const insertSavedAssetSchema = createInsertSchema(savedAssets).omit({
  id: true,
  savedAt: true,
}).extend({
  status: savedAssetStatusEnum,
});
export type InsertSavedAsset = z.infer<typeof insertSavedAssetSchema>;
export type SavedAsset = typeof savedAssets.$inferSelect;

export const savedAssetNotes = pgTable("saved_asset_notes", {
  id: serial("id").primaryKey(),
  savedAssetId: integer("saved_asset_id").notNull().references(() => savedAssets.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  authorName: text("author_name").notNull().default("Unknown"),
  content: text("content").notNull(),
  isSystemEvent: boolean("is_system_event").notNull().default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertSavedAssetNoteSchema = createInsertSchema(savedAssetNotes).omit({
  id: true,
  createdAt: true,
});
export type InsertSavedAssetNote = z.infer<typeof insertSavedAssetNoteSchema>;
export type SavedAssetNote = typeof savedAssetNotes.$inferSelect;

export const assetSchema = z.object({
  asset_name: z.string(),
  target: z.string(),
  modality: z.string(),
  development_stage: z.string(),
  disease_indication: z.string(),
  summary: z.string(),
  source_title: z.string(),
  source_journal: z.string(),
  publication_year: z.string(),
  source_name: z.string(),
  source_url: z.string().optional(),
  pmid: z.string().optional(),
});

export type Asset = z.infer<typeof assetSchema>;

export const ingestionRuns = pgTable("ingestion_runs", {
  id: serial("id").primaryKey(),
  ranAt: timestamp("ran_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  totalFound: integer("total_found").notNull().default(0),
  newCount: integer("new_count").notNull().default(0),
  relevantNewCount: integer("relevant_new_count").notNull().default(0),
  status: text("status").notNull().default("running"),
  errorMessage: text("error_message"),
});

export const insertIngestionRunSchema = createInsertSchema(ingestionRuns).omit({
  id: true,
  ranAt: true,
});
export type InsertIngestionRun = z.infer<typeof insertIngestionRunSchema>;
export type IngestionRun = typeof ingestionRuns.$inferSelect;

export const ingestedAssets = pgTable("ingested_assets", {
  id: serial("id").primaryKey(),
  fingerprint: text("fingerprint").notNull().unique(),
  assetName: text("asset_name").notNull(),
  target: text("target").default("unknown"),
  modality: text("modality").default("unknown"),
  developmentStage: text("development_stage").notNull().default("unknown"),
  indication: text("indication").default("unknown"),
  institution: text("institution").notNull(),
  sourceType: text("source_type").notNull().default("tech_transfer"),
  summary: text("summary").notNull(),
  sourceUrl: text("source_url"),
  relevant: boolean("relevant").notNull().default(false),
  firstSeenAt: timestamp("first_seen_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastSeenAt: timestamp("last_seen_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  enrichedAt: timestamp("enriched_at"),
  runId: integer("run_id").notNull(),
  categories: jsonb("categories").$type<string[]>(),
  categoryConfidence: real("category_confidence"),
  available: boolean("available"),
  contentHash: text("content_hash"),
  completenessScore: real("completeness_score"),
  lastContentChangeAt: timestamp("last_content_change_at"),
  stageChangedAt: timestamp("stage_changed_at"),
  previousStage: text("previous_stage"),
  innovationClaim: text("innovation_claim"),
  mechanismOfAction: text("mechanism_of_action"),
  ipType: text("ip_type"),
  unmetNeed: text("unmet_need"),
  comparableDrugs: text("comparable_drugs"),
  licensingReadiness: text("licensing_readiness"),
  patentStatus: text("patent_status"),
  licensingStatus: text("licensing_status"),
  inventors: jsonb("inventors").$type<string[]>(),
  contactEmail: text("contact_email"),
  technologyId: text("technology_id"),
  abstract: text("abstract"),
  // source_name added via startup migration; declared here for type safety
  sourceName: text("source_name"),
  // NOTE: embedding column is managed via startup migration (CREATE EXTENSION vector + ADD COLUMN IF NOT EXISTS)
  // This declaration provides TypeScript type safety; actual column creation is handled at server startup.
  embedding: vector1536("embedding"),
  // Near-duplicate detection columns (managed via startup migration)
  duplicateFlag: boolean("duplicate_flag").default(false),
  duplicateOfId: integer("duplicate_of_id"),
  // Compact embedding for near-duplicate comparison (JSONB number array, not vector type)
  dedupeEmbedding: jsonb("dedupe_embedding").$type<number[]>(),
  // Similarity score stored when near-duplicate is flagged (0.0–1.0)
  dedupeSimilarity: real("dedupe_similarity"),
  // Tracks how many times the GPT-4o deep enrichment job has processed this asset.
  // Bucket C (low-quality retry) selects assets with deepEnrichAttempts <= 1:
  //   - First deep-enrich pass increments 0 → 1.
  //   - If score < 15 after the first pass, the asset re-enters bucket C (attempts = 1 satisfies <= 1).
  //   - The retry increments 1 → 2, permanently excluding the asset (2 > 1).
  //   - Maximum 2 GPT-4o calls per asset; reset to 0 on content change.
  deepEnrichAttempts: integer("deep_enrich_attempts").default(0).notNull(),
  // Asset class detected by the type-aware classifier (managed via db:push)
  assetClass: text("asset_class"),
  // Device/tool/software-specific attributes stored as JSONB (managed via db:push)
  deviceAttributes: jsonb("device_attributes").$type<Record<string, unknown>>(),
  // Tracks which pipeline wrote each enriched field: { indication: "rule"|"mini"|"gpt4o", ... }
  enrichmentSources: jsonb("enrichment_sources").$type<Record<string, string>>(),
  // Human-verified fields that are protected from AI overwrites: { indication: true, target: true }
  humanVerified: jsonb("human_verified").$type<Record<string, boolean>>(),
  // True when stored description text is too short for meaningful AI enrichment (< 150 chars)
  dataSparse: boolean("data_sparse").default(false),
});

export const insertIngestedAssetSchema = createInsertSchema(ingestedAssets, {
  // Override jsonb columns: drizzle-zod infers jsonb as z.unknown() which is incompatible
  // with drizzle's insert type. Explicitly type these as string[] so TypeScript accepts
  // them without casts.
  categories: z.array(z.string()).nullable().optional(),
  inventors: z.array(z.string()).nullable().optional(),
  embedding: z.array(z.number()).nullable().optional(),
  dedupeEmbedding: z.array(z.number()).nullable().optional(),
}).omit({
  id: true,
  firstSeenAt: true,
  lastSeenAt: true,
});
export type InsertIngestedAsset = z.infer<typeof insertIngestedAssetSchema>;
export type IngestedAsset = typeof ingestedAssets.$inferSelect;

export const scanInstitutionCounts = pgTable("scan_institution_counts", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  institution: text("institution").notNull(),
  count: integer("count").notNull().default(0),
});

export const syncSessions = pgTable("sync_sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  institution: text("institution").notNull(),
  status: text("status").notNull().default("running"),
  phase: text("phase").notNull().default("scraping"),
  rawCount: integer("raw_count").notNull().default(0),
  newCount: integer("new_count").notNull().default(0),
  relevantCount: integer("relevant_count").notNull().default(0),
  pushedCount: integer("pushed_count").notNull().default(0),
  currentIndexed: integer("current_indexed").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: timestamp("completed_at"),
  lastRefreshedAt: timestamp("last_refreshed_at"),
});

export type SyncSession = typeof syncSessions.$inferSelect;

export const syncStaging = pgTable("sync_staging", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  institution: text("institution").notNull(),
  fingerprint: text("fingerprint").notNull(),
  assetName: text("asset_name").notNull(),
  sourceUrl: text("source_url"),
  summary: text("summary").notNull().default(""),
  isNew: boolean("is_new").notNull().default(false),
  relevant: boolean("relevant"),
  target: text("target").notNull().default("unknown"),
  modality: text("modality").notNull().default("unknown"),
  indication: text("indication").notNull().default("unknown"),
  developmentStage: text("development_stage").notNull().default("unknown"),
  status: text("status").notNull().default("scraped"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [
  index("sync_staging_institution_status_created_idx").on(t.institution, t.status, t.createdAt),
  index("sync_staging_session_fingerprint_idx").on(t.sessionId, t.fingerprint),
  index("sync_staging_session_status_idx").on(t.sessionId, t.status),
]);

export type SyncStagingRow = typeof syncStaging.$inferSelect;

export const enrichmentJobs = pgTable("enrichment_jobs", {
  id: serial("id").primaryKey(),
  model: text("model").notNull().default("gpt-4o-mini"),
  status: text("status").notNull().default("running"),
  total: integer("total").notNull().default(0),
  processed: integer("processed").notNull().default(0),
  improved: integer("improved").notNull().default(0),
  startedAt: timestamp("started_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: timestamp("completed_at"),
});

export type EnrichmentJob = typeof enrichmentJobs.$inferSelect;

export const researchProjects = pgTable("research_projects", {
  id: serial("id").primaryKey(),
  researcherId: text("researcher_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  researchArea: text("research_area"),
  hypothesis: text("hypothesis"),
  status: text("status").default("planning").notNull(),
  objectives: text("objectives"),
  methodology: text("methodology"),
  targetCompletion: date("target_completion"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastEditedAt: timestamp("last_edited_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  // §1 Overview
  researchDomain: text("research_domain"),
  keywords: jsonb("keywords").$type<string[]>(),
  // §2 Research Question
  primaryResearchQuestion: text("primary_research_question"),
  scientificRationale: text("scientific_rationale"),
  // §3 Literature Context
  keyPapers: jsonb("key_papers").$type<Array<{ paper_title: string; authors: string; journal: string; year: string; paper_link: string; notes: string }>>(),
  conflictingEvidence: text("conflicting_evidence"),
  literatureGap: text("literature_gap"),
  // §4 Methods
  experimentalDesign: text("experimental_design"),
  keyTechnologies: jsonb("key_technologies").$type<string[]>(),
  datasetsUsed: jsonb("datasets_used").$type<Array<{ dataset_name: string; dataset_source: string; dataset_link: string; notes: string }>>(),
  // §5 Data & Evidence
  preliminaryData: text("preliminary_data"),
  supportingEvidenceLinks: jsonb("supporting_evidence_links").$type<Array<{ url: string; label: string }>>(),
  confidenceLevel: text("confidence_level"),
  // §6 Commercialization
  potentialApplications: text("potential_applications"),
  industryRelevance: text("industry_relevance"),
  patentStatus: text("patent_status"),
  startupPotential: text("startup_potential"),
  // §7 Collaboration
  projectContributors: jsonb("project_contributors").$type<Array<{ name: string; institution: string; role: string; email: string }>>(),
  openForCollaboration: boolean("open_for_collaboration"),
  collaborationType: jsonb("collaboration_type").$type<string[]>(),
  // §8 Funding
  fundingStatus: text("funding_status"),
  fundingSources: jsonb("funding_sources").$type<string[]>(),
  estimatedBudget: integer("estimated_budget"),
  // §9 Risk
  technicalRisk: text("technical_risk"),
  regulatoryRisk: text("regulatory_risk"),
  keyScientificUnknowns: text("key_scientific_unknowns"),
  // §10 Milestones
  nextExperiments: jsonb("next_experiments").$type<Array<{ label: string; done: boolean }>>(),
  expectedTimeline: text("expected_timeline"),
  successCriteria: text("success_criteria"),
  // §11 Discovery Card Prep
  discoveryTitle: text("discovery_title"),
  discoverySummary: text("discovery_summary"),
  technologyType: text("technology_type"),
  developmentStage: text("development_stage"),
  projectSeeking: jsonb("project_seeking").$type<string[]>(),
  publishToIndustry: boolean("publish_to_industry"),
  adminStatus: text("admin_status").default("pending").notNull(),
  adminNote: text("admin_note"),
  projectUrl: text("project_url"),
  evidenceTables: jsonb("evidence_tables").$type<Array<{
    id: string;
    createdAt: string;
    rows: Array<{
      referenceId: number;
      title: string;
      studyType: string;
      sampleSize: string;
      population: string;
      interventionTarget: string;
      outcome: string;
      keyFindings: string;
      evidenceStrength: string;
    }>;
  }>>(),
  potentialPartners: jsonb("potential_partners").$type<Array<{
    name: string;
    website: string;
    status: string;
    outreachDate: string;
    contactName: string;
  }>>(),
  section4Files: jsonb("section4_files").$type<string[]>(),
  section5Files: jsonb("section5_files").$type<string[]>(),
  section8Files: jsonb("section8_files").$type<string[]>(),
  generalFiles: jsonb("general_files").$type<string[]>(),
  hypotheses: jsonb("hypotheses").$type<Array<{
    id: string;
    statement: string;
    independentVars: string;
    dependentVars: string;
    expectedOutcome: string;
    nullHypothesis: string;
    evidenceNotes: string;
    status: string;
    confidence: string;
  }>>().default([]),
  fishbone: jsonb("fishbone").$type<{
    effect: string;
    branches: Record<string, string[]>;
  }>(),
  milestones: jsonb("milestones").$type<Array<{
    id: string;
    label: string;
    targetDate: string;
    completed: boolean;
  }>>().default([]),
  pico: jsonb("pico").$type<{
    population: string;
    intervention: string;
    comparison: string;
    outcome: string;
  }>(),
  protocolChecklist: jsonb("protocol_checklist").$type<Record<string, boolean>>(),
});

export const insertResearchProjectSchema = createInsertSchema(researchProjects).omit({
  id: true,
  createdAt: true,
  lastEditedAt: true,
});
export type InsertResearchProject = z.infer<typeof insertResearchProjectSchema>;
export type ResearchProject = typeof researchProjects.$inferSelect;

export const discoveryCards = pgTable("discovery_cards", {
  id: serial("id").primaryKey(),
  researcherId: text("researcher_id").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  researchArea: text("research_area").notNull(),
  technologyType: text("technology_type").notNull(),
  institution: text("institution").notNull(),
  lab: text("lab"),
  developmentStage: text("development_stage").notNull(),
  ipStatus: text("ip_status").notNull(),
  seeking: text("seeking").notNull(),
  contactEmail: text("contact_email").notNull(),
  publicationLink: text("publication_link"),
  patentLink: text("patent_link"),
  published: boolean("published").default(false).notNull(),
  archived: boolean("archived").default(false).notNull(),
  attachmentUrls: jsonb("attachment_urls").$type<string[]>().default([]),
  adminStatus: text("admin_status").default("pending").notNull(),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertDiscoveryCardSchema = createInsertSchema(discoveryCards).omit({
  id: true,
  createdAt: true,
});
export type InsertDiscoveryCard = z.infer<typeof insertDiscoveryCardSchema>;
export type DiscoveryCard = typeof discoveryCards.$inferSelect;

export const savedGrants = pgTable("saved_grants", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  projectId: integer("project_id").references(() => researchProjects.id),
  title: text("title").notNull(),
  url: text("url"),
  agencyName: text("agency_name").notNull().default(""),
  deadline: text("deadline"),
  amount: text("amount"),
  notes: text("notes"),
  status: text("status").notNull().default("not_started"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertSavedGrantSchema = createInsertSchema(savedGrants).omit({ id: true, createdAt: true });
export type InsertSavedGrant = z.infer<typeof insertSavedGrantSchema>;
export type SavedGrant = typeof savedGrants.$inferSelect;

export const savedReferences = pgTable("saved_references", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  projectId: integer("project_id").references(() => researchProjects.id),
  title: text("title").notNull(),
  url: text("url").notNull(),
  sourceType: text("source_type").notNull().default("paper"),
  date: text("date").notNull().default(""),
  institution: text("institution").notNull().default(""),
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertSavedReferenceSchema = createInsertSchema(savedReferences).omit({
  id: true,
  createdAt: true,
});
export type InsertSavedReference = z.infer<typeof insertSavedReferenceSchema>;
export type SavedReference = typeof savedReferences.$inferSelect;

export const reviewQueue = pgTable("review_queue", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  fingerprint: text("fingerprint").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  reviewerNote: text("reviewer_note"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  resolvedAt: timestamp("resolved_at"),
});
export type ReviewQueueItem = typeof reviewQueue.$inferSelect;

export const therapyAreaTaxonomy = pgTable("therapy_area_taxonomy", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  parentId: integer("parent_id"),
  level: integer("level").notNull().default(0),
  assetCount: integer("asset_count").notNull().default(0),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export type TherapyArea = typeof therapyAreaTaxonomy.$inferSelect;

export const convergenceSignals = pgTable("convergence_signals", {
  id: serial("id").primaryKey(),
  therapyArea: text("therapy_area").notNull(),
  targetOrMechanism: text("target_or_mechanism").notNull(),
  institutionCount: integer("institution_count").notNull().default(0),
  assetIds: jsonb("asset_ids").$type<number[]>(),
  institutions: jsonb("institutions").$type<string[]>(),
  score: real("score").notNull().default(0),
  detectedAt: timestamp("detected_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export type ConvergenceSignal = typeof convergenceSignals.$inferSelect;

export const conceptCards = pgTable("concept_cards", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  submitterName: text("submitter_name").notNull(),
  submitterAffiliation: text("submitter_affiliation"),
  submitterEmail: text("submitter_email"),
  title: text("title").notNull(),
  oneLiner: text("one_liner").notNull(),
  hypothesis: text("hypothesis"),
  problem: text("problem").notNull(),
  proposedApproach: text("proposed_approach").notNull(),
  requiredExpertise: text("required_expertise"),
  seeking: jsonb("seeking").$type<string[]>(),
  therapeuticArea: text("therapeutic_area").notNull(),
  modality: text("modality").notNull().default("unknown"),
  stage: integer("stage").notNull().default(1),
  credibilityScore: integer("credibility_score"),
  credibilityRationale: text("credibility_rationale"),
  interestCollaborating: integer("interest_collaborating").notNull().default(0),
  interestFunding: integer("interest_funding").notNull().default(0),
  interestAdvising: integer("interest_advising").notNull().default(0),
  attachedFiles: jsonb("attached_files").$type<{ name: string; url: string; size: number }[]>().default([]),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertConceptCardSchema = createInsertSchema(conceptCards).omit({
  id: true,
  credibilityScore: true,
  credibilityRationale: true,
  interestCollaborating: true,
  interestFunding: true,
  interestAdvising: true,
  createdAt: true,
  attachedFiles: true,
}).extend({
  stage: z.number().int().min(1).max(4),
});
export type InsertConceptCard = z.infer<typeof insertConceptCardSchema>;
export type ConceptCard = typeof conceptCards.$inferSelect;

export const conceptInterests = pgTable("concept_interests", {
  id: serial("id").primaryKey(),
  conceptId: integer("concept_id").notNull(),
  userId: text("user_id").notNull(),
  userEmail: text("user_email"),
  userName: text("user_name"),
  type: text("type").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export type ConceptInterest = typeof conceptInterests.$inferSelect;

export const edenMessageFeedback = pgTable("eden_message_feedback", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  messageIndex: integer("message_index").notNull(),
  sentiment: text("sentiment").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export type EdenMessageFeedback = typeof edenMessageFeedback.$inferSelect;

export const userAlerts = pgTable("user_alerts", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  name: text("name"),
  query: text("query"),
  modalities: text("modalities").array(),
  stages: text("stages").array(),
  institutions: text("institutions").array(),
  criteriaType: text("criteria_type").notNull().default("custom"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastAlertSentAt: timestamp("last_alert_sent_at"),
});
export type UserAlert = typeof userAlerts.$inferSelect;
export type InsertUserAlert = typeof userAlerts.$inferInsert;

export const manualInstitutions = pgTable("manual_institutions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  ttoUrl: text("tto_url"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertManualInstitutionSchema = createInsertSchema(manualInstitutions).omit({ id: true, createdAt: true });
export type InsertManualInstitution = z.infer<typeof insertManualInstitutionSchema>;
export type ManualInstitution = typeof manualInstitutions.$inferSelect;

export const edenSessions = pgTable("eden_sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  focusContext: jsonb("focus_context").$type<Record<string, unknown>>(),
  messages: jsonb("messages").$type<Array<{
    role: "user" | "assistant";
    content: string;
    assetIds?: number[];
    assets?: Array<{
      id: number;
      assetName: string;
      institution: string;
      indication: string;
      modality: string;
      developmentStage?: string;
      ipType?: string | null;
      sourceName?: string | null;
      sourceUrl?: string | null;
      similarity: number;
    }>;
    ts: string;
  }>>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export type EdenSession = typeof edenSessions.$inferSelect;

// ── Organizations & Org Members ───────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  planTier: text("plan_tier").notNull().default("individual"), // individual | team5 | team10 | enterprise | "none"=subscription canceled/revoked
  seatLimit: integer("seat_limit").notNull().default(1),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color"), // hex e.g. "#16a34a"
  billingEmail: text("billing_email"),
  billingMethod: text("billing_method").notNull().default("stripe"), // stripe | ach | invoice
  billingNotes: text("billing_notes"),
  // Stripe subscription columns — added via startup migration; declared here for type safety.
  // Values are null until a Stripe checkout is completed.
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeStatus: text("stripe_status"), // active | past_due | canceled | null
  stripePriceId: text("stripe_price_id"),
  stripeCurrentPeriodEnd: timestamp("stripe_current_period_end"), // next renewal date (null until subscribed)
  stripeCancelAt: timestamp("stripe_cancel_at"), // scheduled cancellation date, if any
  // Idempotency guard: set to the subscription ID after welcome email is sent.
  // Prevents duplicate welcome emails on Stripe webhook retries or server restarts.
  welcomeEmailSentSubId: text("welcome_email_sent_sub_id"),
  // Idempotency guard: set to the invoice ID after a payment failure email is sent.
  // Prevents duplicate failure emails when Stripe retries the webhook.
  paymentFailedEmailSentInvId: text("payment_failed_email_sent_inv_id"),
  // Trial-ending reminder: set when we send the 24-hour-before reminder so it is never sent twice.
  trialReminderSentAt: timestamp("trial_reminder_sent_at"),
  // EdenMarket access — granted when org completes EdenMarket Stripe checkout
  edenMarketAccess: boolean("eden_market_access").notNull().default(false),
  edenMarketStripeSubId: text("eden_market_stripe_sub_id"),
  // EdenMarket grace period (Task #714) — set on subscription cancellation to
  // (now + 30 days). While in grace, edenMarketAccess remains true so reads
  // continue, but write endpoints (listing/EOI/doc/message) reject. Cleared
  // back to null on reactivation.
  marketAccessExpiresAt: timestamp("market_access_expires_at"),
  // Idempotency guard — set when the grace-period notice email is sent so
  // repeated webhook deliveries don't spam the seller.
  marketGraceEmailSentAt: timestamp("market_grace_email_sent_at"),
  // EdenMarket seller verification — granted by admin (ADMIN_EMAILS allowlist).
  // When set, the org's listings show a "Verified Seller" badge on browse + detail.
  marketSellerVerifiedAt: timestamp("market_seller_verified_at"),
  marketSellerVerifiedBy: text("market_seller_verified_by"), // admin user id
  marketSellerVerificationNote: text("market_seller_verification_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;

// ── Institution metadata (Task #729) ───────────────────────────────────────
// Source of truth for institution display data: city, TTO name, website,
// specialties, continent, and access flags. Created via startup migration
// and seeded from the historical hand-curated list. Joined to live scraper
// coverage (ALL_SCRAPERS) and to ingested_assets at /api/institutions
// request time so newly-added scrapers appear without a code change here.
export const institutionMetadata = pgTable("institution_metadata", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  city: text("city"),
  ttoName: text("tto_name"),
  website: text("website"),
  specialties: jsonb("specialties").$type<string[]>().notNull().default([]),
  continent: text("continent"),
  noPublicPortal: boolean("no_public_portal").notNull().default(false),
  accessRestricted: boolean("access_restricted").notNull().default(false),
});
export type InstitutionMetadata = typeof institutionMetadata.$inferSelect;
export type InsertInstitutionMetadata = typeof institutionMetadata.$inferInsert;

export const orgMembers = pgTable("org_members", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  userId: text("user_id").notNull(),
  email: text("email"),
  memberName: text("member_name"),
  role: text("role").notNull().default("member"), // owner | admin | member
  invitedBy: text("invited_by"),                  // userId of inviter or "admin"
  inviteSource: text("invite_source"),             // "admin" | "self_service"
  inviteStatus: text("invite_status").default("pending"), // "pending" | "active"
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});
export const insertOrgMemberSchema = createInsertSchema(orgMembers).omit({ id: true, joinedAt: true });
export type InsertOrgMember = z.infer<typeof insertOrgMemberSchema>;
export type OrgMember = typeof orgMembers.$inferSelect;

export const dispatchLogs = pgTable("dispatch_logs", {
  id: serial("id").primaryKey(),
  sentAt: timestamp("sent_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  subject: text("subject").notNull(),
  recipients: text("recipients").array().notNull().default(sql`'{}'::text[]`),
  assetIds: integer("asset_ids").array().notNull().default(sql`'{}'::integer[]`),
  assetNames: text("asset_names").array().notNull().default(sql`'{}'::text[]`),
  assetSourceUrls: text("asset_source_urls").array().notNull().default(sql`'{}'::text[]`),
  assetCount: integer("asset_count").notNull().default(0),
  windowHours: integer("window_hours").notNull().default(72),
  isTest: boolean("is_test").notNull().default(false),
});
export const insertDispatchLogSchema = createInsertSchema(dispatchLogs).omit({ id: true, sentAt: true });
export type InsertDispatchLog = z.infer<typeof insertDispatchLogSchema>;
export type DispatchLog = typeof dispatchLogs.$inferSelect;

// ── Team Activity Feed ─────────────────────────────────────────────────────────

export const TEAM_ACTIVITY_ACTIONS = ["saved_asset", "moved_asset", "added_note", "removed_asset"] as const;
export type TeamActivityAction = typeof TEAM_ACTIVITY_ACTIONS[number];

export const teamActivities = pgTable("team_activities", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  assetId: integer("asset_id"),
  assetName: text("asset_name").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTeamActivitySchema = createInsertSchema(teamActivities).omit({ id: true, createdAt: true });
export type InsertTeamActivity = z.infer<typeof insertTeamActivitySchema>;
export type TeamActivity = typeof teamActivities.$inferSelect;

export const sharedLinks = pgTable("shared_links", {
  id: serial("id").primaryKey(),
  token: uuid("token").notNull().unique().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // "dossier" | "pipeline_brief"
  entityId: text("entity_id"),
  payload: jsonb("payload").notNull(),
  createdBy: text("created_by"),
  expiresAt: timestamp("expires_at").notNull(),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertSharedLinkSchema = createInsertSchema(sharedLinks).omit({ id: true, token: true, createdAt: true });
export type InsertSharedLink = z.infer<typeof insertSharedLinkSchema>;
export type SharedLink = typeof sharedLinks.$inferSelect;

// ── Stripe Billing Events (audit log) ─────────────────────────────────────────

export const stripeBillingEvents = pgTable("stripe_billing_events", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id"),
  eventType: text("event_type").notNull(), // checkout_completed | subscription_updated | subscription_deleted | payment_failed | payment_succeeded
  oldPriceId: text("old_price_id"),
  newPriceId: text("new_price_id"),
  oldPlanTier: text("old_plan_tier"),
  newPlanTier: text("new_plan_tier"),
  stripeStatus: text("stripe_status"),
  amountCents: integer("amount_cents"),
  currency: text("currency"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertStripeBillingEventSchema = createInsertSchema(stripeBillingEvents).omit({ id: true, createdAt: true });
export type InsertStripeBillingEvent = z.infer<typeof insertStripeBillingEventSchema>;
export type StripeBillingEvent = typeof stripeBillingEvents.$inferSelect;

// ── App Events (usage analytics) ──────────────────────────────────────────────

export const APP_EVENT_TYPES = [
  "dossier_opened",
  "intelligence_fetched",
  "report_generated",
  "pipeline_brief_generated",
  "concept_submitted",
] as const;
export type AppEventType = typeof APP_EVENT_TYPES[number];

// ── EdenMarket ─────────────────────────────────────────────────────────────────

export const MARKET_ENGAGEMENT_STATUSES = [
  "actively_seeking",
  "quietly_inbound",
  "under_loi",
  "closed",
] as const;
export type MarketEngagementStatus = typeof MARKET_ENGAGEMENT_STATUSES[number];

export const MARKET_LISTING_STATUSES = ["draft", "pending", "active", "paused", "closed"] as const;
export type MarketListingStatus = typeof MARKET_LISTING_STATUSES[number];

export const marketListings = pgTable("market_listings", {
  id: serial("id").primaryKey(),
  sellerId: text("seller_id").notNull(),
  orgId: integer("org_id").references(() => organizations.id, { onDelete: "set null" }),
  // Optional link to an EdenScout ingested_asset record — enables intelligence sidebar & Eden Signal score
  ingestedAssetId: integer("ingested_asset_id"),
  assetName: text("asset_name"),
  blind: boolean("blind").notNull().default(false),
  blindFields: jsonb("blind_fields").$type<{
    assetName?: boolean;
    institution?: boolean;
    inventorNames?: boolean;
    exactPatentIds?: boolean;
    mechanismDetail?: boolean;
  }>().notNull().default({}),
  therapeuticArea: text("therapeutic_area").notNull(),
  modality: text("modality").notNull(),
  stage: text("stage").notNull(),
  milestoneHistory: text("milestone_history"),
  mechanism: text("mechanism"),
  ipStatus: text("ip_status"),
  ipSummary: text("ip_summary"),
  askingPrice: text("asking_price"),
  priceRangeMin: integer("price_range_min"),
  priceRangeMax: integer("price_range_max"),
  engagementStatus: text("engagement_status").notNull().default("actively_seeking"),
  aiSummary: text("ai_summary"),
  status: text("status").notNull().default("draft"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertMarketListingSchema = createInsertSchema(marketListings).omit({ id: true, createdAt: true, updatedAt: true, aiSummary: true, adminNote: true, status: true }).extend({
  blindFields: z.object({
    assetName: z.boolean().optional(),
    institution: z.boolean().optional(),
    inventorNames: z.boolean().optional(),
    exactPatentIds: z.boolean().optional(),
    mechanismDetail: z.boolean().optional(),
  }).optional(),
});
export type InsertMarketListing = z.infer<typeof insertMarketListingSchema>;
export type InsertMarketListingFull = InsertMarketListing & {
  sellerId: string;
  orgId?: number | null;
  aiSummary?: string | null;
  status?: string;
};
export type MarketListing = typeof marketListings.$inferSelect;

export const MARKET_EOI_STATUSES = ["submitted", "viewed", "accepted", "declined"] as const;
export type MarketEoiStatus = typeof MARKET_EOI_STATUSES[number];

export const marketEois = pgTable("market_eois", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull().references(() => marketListings.id, { onDelete: "cascade" }),
  buyerId: text("buyer_id").notNull(),
  company: text("company").notNull(),
  role: text("role").notNull(),
  rationale: text("rationale").notNull(),
  budgetRange: text("budget_range"),
  timeline: text("timeline"),
  status: text("status").notNull().default("submitted"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertMarketEoiSchema = createInsertSchema(marketEois).omit({ id: true, createdAt: true, status: true });
export type InsertMarketEoi = z.infer<typeof insertMarketEoiSchema>;
export type MarketEoi = typeof marketEois.$inferSelect;

export const marketSubscriptions = pgTable("market_subscriptions", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").notNull().default("active"),
  currentPeriodEnd: timestamp("current_period_end"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertMarketSubscriptionSchema = createInsertSchema(marketSubscriptions).omit({ id: true, createdAt: true });
export type InsertMarketSubscription = z.infer<typeof insertMarketSubscriptionSchema>;
export type MarketSubscription = typeof marketSubscriptions.$inferSelect;

export const appEvents = pgTable("app_events", {
  id: serial("id").primaryKey(),
  event: text("event").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertAppEventSchema = createInsertSchema(appEvents).omit({ id: true, createdAt: true });
export type InsertAppEvent = z.infer<typeof insertAppEventSchema>;
export type AppEvent = typeof appEvents.$inferSelect;

// ── Saved Reports ─────────────────────────────────────────────────────────────

export const savedReports = pgTable("saved_reports", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  query: text("query").notNull(),
  assetsJson: jsonb("assets_json").$type<Record<string, unknown>[]>().notNull().default([]),
  reportJson: jsonb("report_json").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSavedReportSchema = createInsertSchema(savedReports).omit({ id: true, createdAt: true });
export type InsertSavedReport = z.infer<typeof insertSavedReportSchema>;
export type SavedReport = typeof savedReports.$inferSelect;

// ── EdenMarket — Deal Rooms ───────────────────────────────────────────────────

export const MARKET_DEAL_STATUSES = ["nda_pending", "nda_signed", "due_diligence", "term_sheet", "loi", "closed", "paused"] as const;
export type MarketDealStatus = (typeof MARKET_DEAL_STATUSES)[number];
export type DealStatusHistoryEntry = { status: string; changedAt: string; changedBy: string };

export const marketDeals = pgTable("market_deals", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull().references(() => marketListings.id, { onDelete: "cascade" }),
  eoiId: integer("eoi_id").notNull().references(() => marketEois.id, { onDelete: "cascade" }),
  sellerId: text("seller_id").notNull(),
  buyerId: text("buyer_id").notNull(),
  status: text("status").notNull().default("nda_pending"),
  statusHistory: jsonb("status_history").$type<DealStatusHistoryEntry[]>().default([]).notNull(),
  sellerSignedAt: timestamp("seller_signed_at"),
  sellerSignedName: text("seller_signed_name"),
  buyerSignedAt: timestamp("buyer_signed_at"),
  buyerSignedName: text("buyer_signed_name"),
  ndaSignedAt: timestamp("nda_signed_at"),
  ndaDocumentPath: text("nda_document_path"),
  successFeeInvoiceId: text("success_fee_invoice_id"),
  successFeeDealSizeM: integer("success_fee_deal_size_m"),
  successFeeAmount: integer("success_fee_amount"),
  successFeePaidAt: timestamp("success_fee_paid_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertMarketDealSchema = createInsertSchema(marketDeals)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({ statusHistory: z.array(z.object({ status: z.string(), changedAt: z.string(), changedBy: z.string() })).optional() });
export type InsertMarketDeal = z.infer<typeof insertMarketDealSchema>;
export type MarketDeal = typeof marketDeals.$inferSelect;

export const marketDealDocuments = pgTable("market_deal_documents", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").notNull().references(() => marketDeals.id, { onDelete: "cascade" }),
  uploaderId: text("uploader_id").notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size"),
  uploadedAt: timestamp("uploaded_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertMarketDealDocumentSchema = createInsertSchema(marketDealDocuments).omit({ id: true, uploadedAt: true });
export type InsertMarketDealDocument = z.infer<typeof insertMarketDealDocumentSchema>;
export type MarketDealDocument = typeof marketDealDocuments.$inferSelect;

// Track each open / signed-URL issuance for a Deal Room document so each
// counterparty can see when the other has actually engaged with the diligence
// material (granularity = "opened the file", not page-level).
export const marketDealDocumentViews = pgTable("market_deal_document_views", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => marketDealDocuments.id, { onDelete: "cascade" }),
  viewerId: text("viewer_id").notNull(),
  viewedAt: timestamp("viewed_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  byDocumentRecent: index("market_deal_document_views_doc_viewed_idx").on(t.documentId, t.viewedAt),
}));

export const insertMarketDealDocumentViewSchema = createInsertSchema(marketDealDocumentViews).omit({ id: true, viewedAt: true });
export type InsertMarketDealDocumentView = z.infer<typeof insertMarketDealDocumentViewSchema>;
export type MarketDealDocumentView = typeof marketDealDocumentViews.$inferSelect;

export const marketDealMessages = pgTable("market_deal_messages", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").notNull().references(() => marketDeals.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull(),
  body: text("body").notNull(),
  sentAt: timestamp("sent_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertMarketDealMessageSchema = createInsertSchema(marketDealMessages).omit({ id: true, sentAt: true });
export type InsertMarketDealMessage = z.infer<typeof insertMarketDealMessageSchema>;
export type MarketDealMessage = typeof marketDealMessages.$inferSelect;

// In-app notifications: EdenScout → EdenMarket availability signal (one per user per listing activation)
export const marketAvailabilityNotifications = pgTable("market_availability_notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  listingId: integer("listing_id").notNull(),
  ingestedAssetId: integer("ingested_asset_id"),
  message: text("message").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, t => ({
  userListingUnique: uniqueIndex("man_user_listing_unique").on(t.userId, t.listingId),
}));
export type MarketAvailabilityNotification = typeof marketAvailabilityNotifications.$inferSelect;

// Free-form email-address opt-outs (admin manual dispatch recipients with no
// Eden account). Token-signed unsubscribe links resolve to a row here when
// the recipient has no userId. Future digest sends to addresses present in
// this table are skipped at the dispatch layer.
export const emailUnsubscribes = pgTable("email_unsubscribes", {
  email: text("email").primaryKey(),
  unsubscribedAt: timestamp("unsubscribed_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export type EmailUnsubscribe = typeof emailUnsubscribes.$inferSelect;

// ── Saved Searches — EdenMarket Browse alerts (Task #713) ────────────────────
// A buyer can save the current EdenMarket browse filter set + keyword as a
// named saved search. When a listing flips to `active`, every saved search
// whose filters/keyword match the new listing produces an in-app notification
// + email to the saving buyer (deduped per-listing in the route).
export type MarketSavedSearchFilters = {
  therapeuticArea?: string;
  modality?: string;
  stage?: string;
  engagementStatus?: string;
  priceRangeMinM?: number;
  priceRangeMaxM?: number;
};

export const marketSavedSearches = pgTable("market_saved_searches", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  keyword: text("keyword"),
  filters: jsonb("filters").$type<MarketSavedSearchFilters>().notNull().default({}),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, t => ({
  userNameUnique: uniqueIndex("market_saved_searches_user_name_unique").on(t.userId, t.name),
}));

export const insertMarketSavedSearchSchema = createInsertSchema(marketSavedSearches)
  .omit({ id: true, createdAt: true })
  .extend({
    name: z.string().min(1).max(120),
    keyword: z.string().max(240).optional().nullable(),
    filters: z.object({
      therapeuticArea: z.string().optional(),
      modality: z.string().optional(),
      stage: z.string().optional(),
      engagementStatus: z.string().optional(),
      priceRangeMinM: z.number().int().nonnegative().optional(),
      priceRangeMaxM: z.number().int().nonnegative().optional(),
    }).optional().default({}),
  });
export type InsertMarketSavedSearch = z.infer<typeof insertMarketSavedSearchSchema>;
export type MarketSavedSearch = typeof marketSavedSearches.$inferSelect;

// ── Feedback-driven Relevance (Task #694) ────────────────────────────────────

export const FEEDBACK_ACTIONS = ["save", "dismiss", "view", "nda_request"] as const;
export type FeedbackAction = (typeof FEEDBACK_ACTIONS)[number];

// Append-only event log: every save / dismiss / view / nda_request lands as
// its own row so weekly metrics and per-user offsets can reason about full
// history. "Current preference" is derived at query time (latest event per
// (userId, assetId) wins).
export const userAssetFeedback = pgTable("user_asset_feedback", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  assetId: integer("asset_id").notNull(),
  action: text("action").notNull(),
  source: text("source").notNull().default("scout"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  userActionIdx: index("user_asset_feedback_user_action_idx").on(t.userId, t.action),
  assetActionIdx: index("user_asset_feedback_asset_action_idx").on(t.assetId, t.action),
  userAssetCreatedIdx: index("user_asset_feedback_user_asset_created_idx").on(t.userId, t.assetId, t.createdAt),
}));

export const insertUserAssetFeedbackSchema = createInsertSchema(userAssetFeedback)
  .omit({ id: true, createdAt: true })
  .extend({ action: z.enum(FEEDBACK_ACTIONS) });
export type InsertUserAssetFeedback = z.infer<typeof insertUserAssetFeedbackSchema>;
export type UserAssetFeedback = typeof userAssetFeedback.$inferSelect;

// Holdout set for measuring/tuning the relevance pre-filter. Built from
// human_verified flags and from strong save/dismiss signals on `ingested_assets`.
export const RELEVANCE_LABEL_SOURCES = ["human_verified", "save_signal", "dismiss_signal"] as const;
export type RelevanceLabelSource = (typeof RELEVANCE_LABEL_SOURCES)[number];

export const relevanceHoldout = pgTable("relevance_holdout", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  label: boolean("label").notNull(),
  labelSource: text("label_source").notNull(),
  split: text("split").notNull().default("eval"),
  text: text("text").notNull(),
  assetClass: text("asset_class"),
  sourceName: text("source_name"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  assetUniq: uniqueIndex("relevance_holdout_asset_uniq").on(t.assetId),
  splitIdx: index("relevance_holdout_split_idx").on(t.split),
}));
export type RelevanceHoldoutRow = typeof relevanceHoldout.$inferSelect;

// Aggregated weekly save/dismiss-rate metrics, sliced per dimension.
export const RELEVANCE_DIMENSIONS = ["overall", "source", "asset_class", "institution"] as const;
export type RelevanceDimension = (typeof RELEVANCE_DIMENSIONS)[number];

export const relevanceMetrics = pgTable("relevance_metrics", {
  id: serial("id").primaryKey(),
  computedAt: timestamp("computed_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  periodDays: integer("period_days").notNull().default(7),
  dimension: text("dimension").notNull(),
  dimensionValue: text("dimension_value").notNull().default(""),
  shownCount: integer("shown_count").notNull().default(0),
  saveCount: integer("save_count").notNull().default(0),
  dismissCount: integer("dismiss_count").notNull().default(0),
  viewCount: integer("view_count").notNull().default(0),
  saveRate: real("save_rate"),
  dismissRate: real("dismiss_rate"),
}, (t) => ({
  computedDimIdx: index("relevance_metrics_computed_dim_idx").on(t.computedAt, t.dimension),
}));
export type RelevanceMetricsRow = typeof relevanceMetrics.$inferSelect;

// ── Cloud Export Log ──────────────────────────────────────────────────────────
export const exportLogs = pgTable("export_logs", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  destination: text("destination").notNull(),
  fileType: text("file_type").notNull().default("document"),
  exportedBy: text("exported_by"),
  shareUrl: text("share_url"),
  success: boolean("success").notNull().default(true),
  errorMessage: text("error_message"),
  exportedAt: timestamp("exported_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertExportLogSchema = createInsertSchema(exportLogs).omit({ id: true, exportedAt: true });
export type InsertExportLog = z.infer<typeof insertExportLogSchema>;
export type ExportLog = typeof exportLogs.$inferSelect;
