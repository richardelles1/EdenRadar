import {
  users, type User, type InsertUser,
  searchHistory, type SearchHistory, type InsertSearchHistory,
  savedAssets, type SavedAsset, type InsertSavedAsset,
  ingestionRuns, type IngestionRun, type InsertIngestionRun,
  ingestedAssets, type IngestedAsset, type InsertIngestedAsset,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getSearchHistory(limit?: number): Promise<SearchHistory[]>;
  createSearchHistory(entry: InsertSearchHistory): Promise<SearchHistory>;

  getSavedAssets(): Promise<SavedAsset[]>;
  getSavedAsset(id: number): Promise<SavedAsset | undefined>;
  createSavedAsset(asset: InsertSavedAsset): Promise<SavedAsset>;
  deleteSavedAsset(id: number): Promise<void>;

  createIngestionRun(): Promise<IngestionRun>;
  updateIngestionRun(id: number, data: Partial<InsertIngestionRun>): Promise<IngestionRun>;
  getLastIngestionRun(): Promise<IngestionRun | undefined>;
  getIngestionRunHistory(limit?: number): Promise<IngestionRun[]>;

  upsertIngestedAsset(fingerprint: string, data: Omit<InsertIngestedAsset, "fingerprint">): Promise<{ asset: IngestedAsset; isNew: boolean }>;
  getIngestedAssetsByInstitution(institution: string): Promise<IngestedAsset[]>;
  getInstitutionAssetCounts(): Promise<Record<string, number>>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getSearchHistory(limit = 20): Promise<SearchHistory[]> {
    return db.select().from(searchHistory).orderBy(desc(searchHistory.createdAt)).limit(limit);
  }

  async createSearchHistory(entry: InsertSearchHistory): Promise<SearchHistory> {
    const [row] = await db.insert(searchHistory).values(entry).returning();
    return row;
  }

  async getSavedAssets(): Promise<SavedAsset[]> {
    return db.select().from(savedAssets).orderBy(desc(savedAssets.savedAt));
  }

  async getSavedAsset(id: number): Promise<SavedAsset | undefined> {
    const [asset] = await db.select().from(savedAssets).where(eq(savedAssets.id, id));
    return asset;
  }

  async createSavedAsset(asset: InsertSavedAsset): Promise<SavedAsset> {
    const [row] = await db.insert(savedAssets).values(asset).returning();
    return row;
  }

  async deleteSavedAsset(id: number): Promise<void> {
    await db.delete(savedAssets).where(eq(savedAssets.id, id));
  }

  async createIngestionRun(): Promise<IngestionRun> {
    const [run] = await db.insert(ingestionRuns).values({ status: "running", totalFound: 0, newCount: 0 }).returning();
    return run;
  }

  async updateIngestionRun(id: number, data: Partial<InsertIngestionRun>): Promise<IngestionRun> {
    const [run] = await db.update(ingestionRuns).set(data).where(eq(ingestionRuns.id, id)).returning();
    return run;
  }

  async getLastIngestionRun(): Promise<IngestionRun | undefined> {
    const [run] = await db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.ranAt)).limit(1);
    return run;
  }

  async getIngestionRunHistory(limit = 10): Promise<IngestionRun[]> {
    return db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.ranAt)).limit(limit);
  }

  async upsertIngestedAsset(fingerprint: string, data: Omit<InsertIngestedAsset, "fingerprint">): Promise<{ asset: IngestedAsset; isNew: boolean }> {
    const existing = await db.select().from(ingestedAssets).where(eq(ingestedAssets.fingerprint, fingerprint)).limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(ingestedAssets)
        .set({ lastSeenAt: new Date(), runId: data.runId })
        .where(eq(ingestedAssets.fingerprint, fingerprint))
        .returning();
      return { asset: updated, isNew: false };
    }

    const [inserted] = await db
      .insert(ingestedAssets)
      .values({ fingerprint, ...data })
      .returning();
    return { asset: inserted, isNew: true };
  }

  async getIngestedAssetsByInstitution(institution: string): Promise<IngestedAsset[]> {
    return db
      .select()
      .from(ingestedAssets)
      .where(eq(ingestedAssets.institution, institution))
      .orderBy(desc(ingestedAssets.lastSeenAt));
  }

  async getInstitutionAssetCounts(): Promise<Record<string, number>> {
    const rows = await db
      .select({
        institution: ingestedAssets.institution,
        count: sql<number>`count(*)::int`,
      })
      .from(ingestedAssets)
      .groupBy(ingestedAssets.institution);

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.institution] = row.count;
    }
    return result;
  }
}

export const storage = new DatabaseStorage();
