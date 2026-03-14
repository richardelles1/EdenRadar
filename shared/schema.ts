import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean, uuid, date, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

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

export const savedAssets = pgTable("saved_assets", {
  id: serial("id").primaryKey(),
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
  savedAt: timestamp("saved_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertSavedAssetSchema = createInsertSchema(savedAssets).omit({
  id: true,
  savedAt: true,
});
export type InsertSavedAsset = z.infer<typeof insertSavedAssetSchema>;
export type SavedAsset = typeof savedAssets.$inferSelect;

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
});

export const insertIngestedAssetSchema = createInsertSchema(ingestedAssets).omit({
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
});

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
