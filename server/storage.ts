import {
  users, type User, type InsertUser,
  searchHistory, type SearchHistory, type InsertSearchHistory,
  savedAssets, type SavedAsset, type InsertSavedAsset,
  ingestionRuns, type IngestionRun, type InsertIngestionRun,
  ingestedAssets, type IngestedAsset, type InsertIngestedAsset,
  scanInstitutionCounts,
  syncSessions, type SyncSession,
  syncStaging, type SyncStagingRow,
  enrichmentJobs, type EnrichmentJob,
  researchProjects, type ResearchProject, type InsertResearchProject,
  discoveryCards, type DiscoveryCard, type InsertDiscoveryCard,
  savedReferences, type SavedReference, type InsertSavedReference,
  savedGrants, type SavedGrant, type InsertSavedGrant,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, gte, and, inArray, lt, isNull, or } from "drizzle-orm";

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
  bulkUpsertIngestedAssets(
    listings: Array<{ fingerprint: string } & Omit<InsertIngestedAsset, "fingerprint">>,
    onProgress?: (done: number, total: number) => void
  ): Promise<{ newAssets: Array<{ id: number; assetName: string; fingerprint: string }>; totalProcessed: number }>;
  updateIngestedAssetEnrichment(id: number, data: { target: string; modality: string; indication: string; developmentStage: string; biotechRelevant: boolean }): Promise<void>;
  deleteIngestedAsset(id: number): Promise<void>;
  getIngestedAssetsByInstitution(institution: string): Promise<IngestedAsset[]>;
  getInstitutionAssetCounts(): Promise<Record<string, number>>;
  getIngestionDelta(ranAt: Date): Promise<{ institution: string; count: number; sampleAssets: string[] }[]>;

  recordScanCounts(runId: number, counts: Record<string, number>): Promise<void>;
  getScanMatrix(limit?: number): Promise<{
    runs: Array<{ id: number; ranAt: Date; totalFound: number; newCount: number; status: string }>;
    matrix: Array<{ institution: string; counts: number[] }>;
    totalInSystem: number;
  }>;

  getCollectorHealthData(): Promise<{
    institutions: Array<{ institution: string; totalInDb: number; biotechRelevant: number }>;
    syncSessions: SyncSession[];
  }>;

  getScraperHealthData(): Promise<Array<{ institution: string; count: number; lastSeenAt: Date | null }>>;

  createSyncSession(sessionId: string, institution: string, currentIndexed: number): Promise<SyncSession>;
  updateSyncSession(sessionId: string, data: Partial<Pick<SyncSession, "status" | "phase" | "rawCount" | "newCount" | "relevantCount" | "pushedCount" | "completedAt" | "lastRefreshedAt" | "errorMessage">>): Promise<SyncSession>;
  getSyncSession(sessionId: string): Promise<SyncSession | undefined>;
  getLatestSyncSessions(): Promise<SyncSession[]>;
  clearSyncStaging(institution: string): Promise<void>;
  insertSyncStagingBatch(rows: Array<Omit<SyncStagingRow, "id" | "createdAt">>): Promise<void>;
  getSyncStagingRows(sessionId: string): Promise<SyncStagingRow[]>;
  updateSyncStagingStatus(sessionId: string, status: string, filterIsNew?: boolean, filterRelevant?: boolean): Promise<number>;
  getExistingFingerprints(institution: string): Promise<Set<string>>;
  getInstitutionIndexedCount(institution: string): Promise<number>;

  getEnrichmentStats(): Promise<{
    total: number;
    unknownCount: number;
    byField: { target: number; modality: number; indication: number; developmentStage: number };
  }>;
  getIncompleteAssets(since?: Date): Promise<Array<{ id: number; assetName: string; summary: string; target: string; modality: string; indication: string; developmentStage: string }>>;

  createEnrichmentJob(total: number): Promise<EnrichmentJob>;
  updateEnrichmentJob(id: number, data: Partial<Pick<EnrichmentJob, "status" | "processed" | "improved" | "completedAt">>): Promise<void>;
  getRunningEnrichmentJob(): Promise<EnrichmentJob | undefined>;
  getLatestEnrichmentJob(): Promise<EnrichmentJob | undefined>;
  stampEnrichedAt(assetId: number): Promise<void>;

  getResearchProject(id: number, researcherId: string): Promise<ResearchProject | undefined>;
  getResearchProjects(researcherId: string): Promise<ResearchProject[]>;
  createResearchProject(data: InsertResearchProject): Promise<ResearchProject>;
  updateResearchProject(id: number, researcherId: string, data: Partial<InsertResearchProject>): Promise<ResearchProject | undefined>;
  deleteResearchProject(id: number, researcherId: string): Promise<void>;

  getDiscoveryCards(researcherId: string): Promise<DiscoveryCard[]>;
  getPublishedDiscoveryCards(): Promise<DiscoveryCard[]>;
  getAllDiscoveryCardsForAdmin(): Promise<DiscoveryCard[]>;
  getApprovedDiscoveryCards(): Promise<DiscoveryCard[]>;
  createDiscoveryCard(data: InsertDiscoveryCard): Promise<DiscoveryCard>;
  publishDiscoveryCard(id: number, researcherId: string): Promise<DiscoveryCard | undefined>;
  updateDiscoveryCard(id: number, researcherId: string, data: Partial<InsertDiscoveryCard>): Promise<DiscoveryCard | undefined>;
  updateDiscoveryCardAdmin(id: number, data: { adminStatus: string; adminNote?: string }): Promise<DiscoveryCard | undefined>;

  getSavedReferences(userId: string, projectId?: number): Promise<SavedReference[]>;
  createSavedReference(data: InsertSavedReference): Promise<SavedReference>;
  deleteSavedReference(id: number, userId: string): Promise<void>;

  getSavedGrants(userId: string): Promise<SavedGrant[]>;
  createSavedGrant(data: InsertSavedGrant): Promise<SavedGrant>;
  updateSavedGrant(id: number, userId: string, data: Partial<InsertSavedGrant>): Promise<SavedGrant>;
  deleteSavedGrant(id: number, userId: string): Promise<void>;
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

  async bulkUpsertIngestedAssets(
    listings: Array<{ fingerprint: string } & Omit<InsertIngestedAsset, "fingerprint">>,
    onProgress?: (done: number, total: number) => void
  ): Promise<{ newAssets: Array<{ id: number; assetName: string; fingerprint: string }>; totalProcessed: number }> {
    const CHUNK = 800;
    const total = listings.length;
    const allFingerprints = listings.map((l) => l.fingerprint);

    // 1. Find which fingerprints already exist (chunked SELECT)
    const existingSet = new Map<string, number>(); // fingerprint -> id
    for (let i = 0; i < allFingerprints.length; i += CHUNK) {
      const chunk = allFingerprints.slice(i, i + CHUNK);
      const rows = await db
        .select({ id: ingestedAssets.id, fingerprint: ingestedAssets.fingerprint })
        .from(ingestedAssets)
        .where(inArray(ingestedAssets.fingerprint, chunk));
      for (const row of rows) existingSet.set(row.fingerprint, row.id);
    }

    const newListings = listings.filter((l) => !existingSet.has(l.fingerprint));
    const existingListings = listings.filter((l) => existingSet.has(l.fingerprint));

    // 2. Bulk INSERT new listings (chunked)
    const newAssets: Array<{ id: number; assetName: string; fingerprint: string }> = [];
    for (let i = 0; i < newListings.length; i += CHUNK) {
      const chunk = newListings.slice(i, i + CHUNK);
      const inserted = await db
        .insert(ingestedAssets)
        .values(chunk.map(({ fingerprint, ...data }) => ({ fingerprint, ...data })))
        .returning({ id: ingestedAssets.id, assetName: ingestedAssets.assetName, fingerprint: ingestedAssets.fingerprint });
      for (const row of inserted) newAssets.push({ id: row.id, assetName: row.assetName, fingerprint: row.fingerprint });
      onProgress?.(Math.min(i + CHUNK, newListings.length) + existingListings.length, total);
    }

    // 3. Bulk UPDATE existing listings (chunked — update lastSeenAt + runId only)
    const runId = listings[0]?.runId;
    for (let i = 0; i < existingListings.length; i += CHUNK) {
      const chunk = existingListings.slice(i, i + CHUNK);
      const fps = chunk.map((l) => l.fingerprint);
      await db
        .update(ingestedAssets)
        .set({ lastSeenAt: new Date(), runId })
        .where(inArray(ingestedAssets.fingerprint, fps));
      onProgress?.(newListings.length + Math.min(i + CHUNK, existingListings.length), total);
    }

    if (total > 0 && newListings.length === 0 && existingListings.length === 0) {
      onProgress?.(total, total);
    }

    return { newAssets, totalProcessed: total };
  }

  async updateIngestedAssetEnrichment(id: number, data: { target: string; modality: string; indication: string; developmentStage: string; biotechRelevant: boolean }): Promise<void> {
    await db
      .update(ingestedAssets)
      .set({
        target: data.target,
        modality: data.modality,
        indication: data.indication,
        developmentStage: data.developmentStage,
        relevant: data.biotechRelevant,
      })
      .where(eq(ingestedAssets.id, id));
  }

  async deleteIngestedAsset(id: number): Promise<void> {
    await db.delete(ingestedAssets).where(eq(ingestedAssets.id, id));
  }

  async getIngestedAssetsByInstitution(institution: string): Promise<IngestedAsset[]> {
    return db
      .select()
      .from(ingestedAssets)
      .where(and(eq(ingestedAssets.institution, institution), eq(ingestedAssets.sourceType, "tech_transfer")))
      .orderBy(desc(ingestedAssets.lastSeenAt));
  }

  async getInstitutionAssetCounts(): Promise<Record<string, number>> {
    const rows = await db
      .select({
        institution: ingestedAssets.institution,
        count: sql<number>`count(*)::int`,
      })
      .from(ingestedAssets)
      .where(eq(ingestedAssets.sourceType, "tech_transfer"))
      .groupBy(ingestedAssets.institution);

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.institution] = row.count;
    }
    return result;
  }

  async getIngestionDelta(ranAt: Date): Promise<{ institution: string; count: number; sampleAssets: string[] }[]> {
    const rows = await db
      .select({
        institution: ingestedAssets.institution,
        assetName: ingestedAssets.assetName,
      })
      .from(ingestedAssets)
      .where(and(gte(ingestedAssets.firstSeenAt, ranAt), eq(ingestedAssets.relevant, true)))
      .orderBy(desc(ingestedAssets.firstSeenAt));

    const grouped: Record<string, string[]> = {};
    for (const row of rows) {
      if (!grouped[row.institution]) grouped[row.institution] = [];
      grouped[row.institution].push(row.assetName);
    }

    return Object.entries(grouped)
      .map(([institution, names]) => ({
        institution,
        count: names.length,
        sampleAssets: names.slice(0, 5),
      }))
      .sort((a, b) => b.count - a.count);
  }

  async recordScanCounts(runId: number, counts: Record<string, number>): Promise<void> {
    const entries = Object.entries(counts).filter(([, c]) => c > 0);
    if (entries.length === 0) return;
    const CHUNK = 500;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      await db.insert(scanInstitutionCounts).values(
        chunk.map(([institution, count]) => ({ runId, institution, count }))
      );
    }
  }

  async getScanMatrix(limit = 10): Promise<{
    runs: Array<{ id: number; ranAt: Date; totalFound: number; newCount: number; status: string }>;
    matrix: Array<{ institution: string; counts: number[] }>;
    totalInSystem: number;
  }> {
    const runs = await db
      .select({
        id: ingestionRuns.id,
        ranAt: ingestionRuns.ranAt,
        totalFound: ingestionRuns.totalFound,
        newCount: ingestionRuns.newCount,
        status: ingestionRuns.status,
      })
      .from(ingestionRuns)
      .where(eq(ingestionRuns.status, "completed"))
      .orderBy(desc(ingestionRuns.ranAt))
      .limit(limit);

    const [{ count: totalInSystem }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ingestedAssets);

    if (runs.length === 0) return { runs: [], matrix: [], totalInSystem };

    const runIds = runs.map((r) => r.id);

    const rows = await db
      .select({
        runId: scanInstitutionCounts.runId,
        institution: scanInstitutionCounts.institution,
        count: scanInstitutionCounts.count,
      })
      .from(scanInstitutionCounts)
      .where(inArray(scanInstitutionCounts.runId, runIds));

    const coveredRunIds = new Set(rows.map((r) => r.runId));
    const uncoveredRunIds = runIds.filter((id) => !coveredRunIds.has(id));
    if (uncoveredRunIds.length > 0) {
      const fallbackRows = await db
        .select({
          runId: ingestedAssets.runId,
          institution: ingestedAssets.institution,
          count: sql<number>`count(*)::int`,
        })
        .from(ingestedAssets)
        .where(inArray(ingestedAssets.runId, uncoveredRunIds))
        .groupBy(ingestedAssets.runId, ingestedAssets.institution);
      for (const row of fallbackRows) rows.push(row);
    }

    const instMap: Record<string, Record<number, number>> = {};
    for (const row of rows) {
      if (!instMap[row.institution]) instMap[row.institution] = {};
      instMap[row.institution][row.runId] = row.count;
    }

    const matrix = Object.entries(instMap)
      .map(([institution, runCounts]) => ({
        institution,
        counts: runs.map((r) => runCounts[r.id] ?? 0),
      }))
      .filter((row) => row.counts.some((c) => c > 0))
      .sort((a, b) => (b.counts[0] ?? 0) - (a.counts[0] ?? 0));

    return { runs, matrix, totalInSystem };
  }

  async getCollectorHealthData(): Promise<{
    institutions: Array<{ institution: string; totalInDb: number; biotechRelevant: number }>;
    syncSessions: SyncSession[];
  }> {
    const instRows = await db
      .select({
        institution: ingestedAssets.institution,
        totalInDb: sql<number>`count(*)::int`,
        biotechRelevant: sql<number>`count(*) filter (where ${ingestedAssets.relevant} = true)::int`,
      })
      .from(ingestedAssets)
      .groupBy(ingestedAssets.institution);

    const sessions = await db.select().from(syncSessions).orderBy(desc(syncSessions.createdAt));

    return { institutions: instRows, syncSessions: sessions };
  }

  async getScraperHealthData(): Promise<Array<{ institution: string; count: number; lastSeenAt: Date | null }>> {
    const rows = await db
      .select({
        institution: ingestedAssets.institution,
        count: sql<number>`count(*)::int`,
        lastSeenAt: sql<Date | null>`max(${ingestedAssets.lastSeenAt})`,
      })
      .from(ingestedAssets)
      .where(eq(ingestedAssets.sourceType, "tech_transfer"))
      .groupBy(ingestedAssets.institution);
    return rows;
  }

  async createSyncSession(sessionId: string, institution: string, currentIndexed: number): Promise<SyncSession> {
    await db.delete(syncStaging).where(eq(syncStaging.institution, institution));

    const existing = await db
      .select({ id: syncSessions.id })
      .from(syncSessions)
      .where(eq(syncSessions.institution, institution))
      .orderBy(desc(syncSessions.createdAt));

    if (existing.length >= 10) {
      const keepIds = existing.slice(0, 9).map((r) => r.id);
      await db.delete(syncSessions).where(
        and(
          eq(syncSessions.institution, institution),
          sql`${syncSessions.id} NOT IN (${sql.join(keepIds.map(id => sql`${id}`), sql`, `)})`
        )
      );
    }

    const [row] = await db.insert(syncSessions).values({
      sessionId,
      institution,
      status: "running",
      phase: "scraping",
      currentIndexed,
    }).returning();
    return row;
  }

  async updateSyncSession(sessionId: string, data: Partial<Pick<SyncSession, "status" | "phase" | "rawCount" | "newCount" | "relevantCount" | "pushedCount" | "completedAt" | "lastRefreshedAt" | "errorMessage">>): Promise<SyncSession> {
    const [row] = await db.update(syncSessions).set(data).where(eq(syncSessions.sessionId, sessionId)).returning();
    return row;
  }

  async getSyncSession(sessionId: string): Promise<SyncSession | undefined> {
    const [row] = await db.select().from(syncSessions).where(eq(syncSessions.sessionId, sessionId));
    return row;
  }

  async getLatestSyncSessions(): Promise<SyncSession[]> {
    return db.select().from(syncSessions).orderBy(desc(syncSessions.createdAt));
  }

  async clearSyncStaging(institution: string): Promise<void> {
    await db.delete(syncStaging).where(eq(syncStaging.institution, institution));
  }

  async insertSyncStagingBatch(rows: Array<Omit<SyncStagingRow, "id" | "createdAt">>): Promise<void> {
    if (rows.length === 0) return;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db.insert(syncStaging).values(rows.slice(i, i + CHUNK));
    }
  }

  async getSyncStagingRows(sessionId: string): Promise<SyncStagingRow[]> {
    return db.select().from(syncStaging).where(eq(syncStaging.sessionId, sessionId)).orderBy(desc(syncStaging.isNew));
  }

  async updateSyncStagingStatus(sessionId: string, status: string, filterIsNew?: boolean, filterRelevant?: boolean): Promise<number> {
    let conditions = [eq(syncStaging.sessionId, sessionId)];
    if (filterIsNew !== undefined) conditions.push(eq(syncStaging.isNew, filterIsNew));
    if (filterRelevant !== undefined) conditions.push(eq(syncStaging.relevant, filterRelevant));
    const result = await db.update(syncStaging).set({ status }).where(and(...conditions)).returning({ id: syncStaging.id });
    return result.length;
  }

  async getExistingFingerprints(institution: string): Promise<Set<string>> {
    const rows = await db
      .select({ fingerprint: ingestedAssets.fingerprint })
      .from(ingestedAssets)
      .where(eq(ingestedAssets.institution, institution));
    return new Set(rows.map(r => r.fingerprint));
  }

  async getInstitutionIndexedCount(institution: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ingestedAssets)
      .where(and(eq(ingestedAssets.institution, institution), eq(ingestedAssets.relevant, true)));
    return row?.count ?? 0;
  }

  async getEnrichmentStats(): Promise<{
    total: number;
    unknownCount: number;
    byField: { target: number; modality: number; indication: number; developmentStage: number };
  }> {
    const [totalRow] = await db.select({ count: sql<number>`count(*)::int` }).from(ingestedAssets);
    const total = totalRow?.count ?? 0;

    const [unknownRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ingestedAssets)
      .where(
        sql`(${ingestedAssets.target} = 'unknown' OR ${ingestedAssets.modality} = 'unknown' OR ${ingestedAssets.indication} = 'unknown' OR ${ingestedAssets.developmentStage} = 'unknown')`
      );
    const unknownCount = unknownRow?.count ?? 0;

    const [targetRow] = await db.select({ count: sql<number>`count(*)::int` }).from(ingestedAssets).where(eq(ingestedAssets.target, "unknown"));
    const [modalityRow] = await db.select({ count: sql<number>`count(*)::int` }).from(ingestedAssets).where(eq(ingestedAssets.modality, "unknown"));
    const [indicationRow] = await db.select({ count: sql<number>`count(*)::int` }).from(ingestedAssets).where(eq(ingestedAssets.indication, "unknown"));
    const [stageRow] = await db.select({ count: sql<number>`count(*)::int` }).from(ingestedAssets).where(eq(ingestedAssets.developmentStage, "unknown"));

    return {
      total,
      unknownCount,
      byField: {
        target: targetRow?.count ?? 0,
        modality: modalityRow?.count ?? 0,
        indication: indicationRow?.count ?? 0,
        developmentStage: stageRow?.count ?? 0,
      },
    };
  }

  async getIncompleteAssets(since?: Date): Promise<Array<{ id: number; assetName: string; summary: string; target: string; modality: string; indication: string; developmentStage: string }>> {
    const unknownFilter = sql`(${ingestedAssets.target} = 'unknown' OR ${ingestedAssets.modality} = 'unknown' OR ${ingestedAssets.indication} = 'unknown' OR ${ingestedAssets.developmentStage} = 'unknown')`;

    const conditions = since
      ? and(unknownFilter, or(isNull(ingestedAssets.enrichedAt), lt(ingestedAssets.enrichedAt, since)))
      : unknownFilter;

    return db
      .select({
        id: ingestedAssets.id,
        assetName: ingestedAssets.assetName,
        summary: ingestedAssets.summary,
        target: ingestedAssets.target,
        modality: ingestedAssets.modality,
        indication: ingestedAssets.indication,
        developmentStage: ingestedAssets.developmentStage,
      })
      .from(ingestedAssets)
      .where(conditions!);
  }

  async createEnrichmentJob(total: number): Promise<EnrichmentJob> {
    const [row] = await db.insert(enrichmentJobs).values({ total, status: "running" }).returning();
    return row;
  }

  async updateEnrichmentJob(id: number, data: Partial<Pick<EnrichmentJob, "status" | "processed" | "improved" | "completedAt">>): Promise<void> {
    await db.update(enrichmentJobs).set(data).where(eq(enrichmentJobs.id, id));
  }

  async getRunningEnrichmentJob(): Promise<EnrichmentJob | undefined> {
    const [row] = await db.select().from(enrichmentJobs).where(eq(enrichmentJobs.status, "running")).orderBy(desc(enrichmentJobs.startedAt)).limit(1);
    return row;
  }

  async getLatestEnrichmentJob(): Promise<EnrichmentJob | undefined> {
    const [row] = await db.select().from(enrichmentJobs).orderBy(desc(enrichmentJobs.startedAt)).limit(1);
    return row;
  }

  async stampEnrichedAt(assetId: number): Promise<void> {
    await db.update(ingestedAssets).set({ enrichedAt: new Date() }).where(eq(ingestedAssets.id, assetId));
  }

  async getResearchProject(id: number, researcherId: string): Promise<ResearchProject | undefined> {
    const [row] = await db.select().from(researchProjects)
      .where(and(eq(researchProjects.id, id), eq(researchProjects.researcherId, researcherId)));
    return row;
  }

  async getResearchProjects(researcherId: string): Promise<ResearchProject[]> {
    return db.select().from(researchProjects).where(eq(researchProjects.researcherId, researcherId)).orderBy(desc(researchProjects.lastEditedAt));
  }

  async createResearchProject(data: InsertResearchProject): Promise<ResearchProject> {
    const [row] = await db.insert(researchProjects).values(data).returning();
    return row;
  }

  async updateResearchProject(id: number, researcherId: string, data: Partial<InsertResearchProject>): Promise<ResearchProject | undefined> {
    const [row] = await db.update(researchProjects)
      .set({ ...data, lastEditedAt: new Date() })
      .where(and(eq(researchProjects.id, id), eq(researchProjects.researcherId, researcherId)))
      .returning();
    return row;
  }

  async deleteResearchProject(id: number, researcherId: string): Promise<void> {
    await db.delete(researchProjects).where(and(eq(researchProjects.id, id), eq(researchProjects.researcherId, researcherId)));
  }

  async getDiscoveryCards(researcherId: string): Promise<DiscoveryCard[]> {
    return db.select().from(discoveryCards).where(eq(discoveryCards.researcherId, researcherId)).orderBy(desc(discoveryCards.createdAt));
  }

  async getPublishedDiscoveryCards(): Promise<DiscoveryCard[]> {
    return db.select().from(discoveryCards)
      .where(and(eq(discoveryCards.published, true), eq(discoveryCards.adminStatus, "approved")))
      .orderBy(desc(discoveryCards.createdAt));
  }

  async getAllDiscoveryCardsForAdmin(): Promise<DiscoveryCard[]> {
    return db.select().from(discoveryCards).where(eq(discoveryCards.published, true)).orderBy(desc(discoveryCards.createdAt));
  }

  async getApprovedDiscoveryCards(): Promise<DiscoveryCard[]> {
    return db.select().from(discoveryCards)
      .where(and(eq(discoveryCards.published, true), eq(discoveryCards.adminStatus, "approved")))
      .orderBy(desc(discoveryCards.createdAt));
  }

  async createDiscoveryCard(data: InsertDiscoveryCard): Promise<DiscoveryCard> {
    const [row] = await db.insert(discoveryCards).values(data).returning();
    return row;
  }

  async publishDiscoveryCard(id: number, researcherId: string): Promise<DiscoveryCard | undefined> {
    const [row] = await db.update(discoveryCards)
      .set({ published: true })
      .where(and(eq(discoveryCards.id, id), eq(discoveryCards.researcherId, researcherId)))
      .returning();
    return row;
  }

  async updateDiscoveryCard(id: number, researcherId: string, data: Partial<InsertDiscoveryCard>): Promise<DiscoveryCard | undefined> {
    const [row] = await db.update(discoveryCards)
      .set(data)
      .where(and(eq(discoveryCards.id, id), eq(discoveryCards.researcherId, researcherId)))
      .returning();
    return row;
  }

  async updateDiscoveryCardAdmin(id: number, data: { adminStatus: string; adminNote?: string }): Promise<DiscoveryCard | undefined> {
    const [row] = await db.update(discoveryCards)
      .set({ adminStatus: data.adminStatus, adminNote: data.adminNote ?? null })
      .where(eq(discoveryCards.id, id))
      .returning();
    return row;
  }

  async getSavedReferences(userId: string, projectId?: number): Promise<SavedReference[]> {
    const conditions = [eq(savedReferences.userId, userId)];
    if (projectId !== undefined) {
      conditions.push(eq(savedReferences.projectId, projectId));
    }
    return db.select().from(savedReferences).where(and(...conditions)).orderBy(desc(savedReferences.createdAt));
  }

  async createSavedReference(data: InsertSavedReference): Promise<SavedReference> {
    const [row] = await db.insert(savedReferences).values(data).returning();
    return row;
  }

  async deleteSavedReference(id: number, userId: string): Promise<void> {
    await db.delete(savedReferences).where(and(eq(savedReferences.id, id), eq(savedReferences.userId, userId)));
  }

  async getSavedGrants(userId: string): Promise<SavedGrant[]> {
    return db.select().from(savedGrants).where(eq(savedGrants.userId, userId)).orderBy(desc(savedGrants.createdAt));
  }

  async createSavedGrant(data: InsertSavedGrant): Promise<SavedGrant> {
    const [row] = await db.insert(savedGrants).values(data).returning();
    return row;
  }

  async updateSavedGrant(id: number, userId: string, data: Partial<InsertSavedGrant>): Promise<SavedGrant> {
    const [row] = await db.update(savedGrants).set(data).where(and(eq(savedGrants.id, id), eq(savedGrants.userId, userId))).returning();
    return row;
  }

  async deleteSavedGrant(id: number, userId: string): Promise<void> {
    await db.delete(savedGrants).where(and(eq(savedGrants.id, id), eq(savedGrants.userId, userId)));
  }
}

export const storage = new DatabaseStorage();
