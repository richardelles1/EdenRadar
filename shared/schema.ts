import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
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
  runId: integer("run_id").notNull(),
});

export const insertIngestedAssetSchema = createInsertSchema(ingestedAssets).omit({
  id: true,
  firstSeenAt: true,
  lastSeenAt: true,
});
export type InsertIngestedAsset = z.infer<typeof insertIngestedAssetSchema>;
export type IngestedAsset = typeof ingestedAssets.$inferSelect;
