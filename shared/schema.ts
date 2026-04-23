import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean, uuid, date, real, customType, index } from "drizzle-orm/pg-core";
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
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  orgId: integer("org_id").references(() => organizations.id, { onDelete: "set null" }),
});

export type IndustryProfileRow = typeof industryProfiles.$inferSelect;

export const searchHistory = pgTable("search_history", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  source: text("source").notNull().default("pubmed"),
  resultCount: integer("result_count").notNull().default(0),
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
  target: text("target").notNull().default("unknown"),
  modality: text("modality").notNull().default("unknown"),
  developmentStage: text("development_stage").notNull().default("unknown"),
  indication: text("indication").notNull().default("unknown"),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;

export const orgMembers = pgTable("org_members", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  userId: text("user_id").notNull(),
  email: text("email"),
  memberName: text("member_name"),
  role: text("role").notNull().default("member"), // owner | admin | member
  invitedBy: text("invited_by"),
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
