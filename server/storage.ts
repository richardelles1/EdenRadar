import {
  users, type User, type InsertUser,
  searchHistory, type SearchHistory, type InsertSearchHistory,
  savedAssets, type SavedAsset, type InsertSavedAsset,
  pipelineLists, type PipelineList, type InsertPipelineList,
  ingestionRuns, type IngestionRun, type InsertIngestionRun,
  ingestedAssets, type IngestedAsset, type InsertIngestedAsset,
  scanInstitutionCounts,
  syncSessions, type SyncSession,
  syncStaging, type SyncStagingRow,
  enrichmentJobs, type EnrichmentJob,
  researchProjects, type ResearchProject, type InsertResearchProject,
  discoveryCards, type DiscoveryCard, type InsertDiscoveryCard,
  conceptCards,
  savedReferences, type SavedReference, type InsertSavedReference,
  savedGrants, type SavedGrant, type InsertSavedGrant,
  reviewQueue,
  edenSessions, type EdenSession,
  edenMessageFeedback,
  userAlerts, type UserAlert, type InsertUserAlert,
  manualInstitutions, type ManualInstitution, type InsertManualInstitution,
  dispatchLogs, type DispatchLog, type InsertDispatchLog,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, gte, and, inArray, lt, isNull, isNotNull, or, ilike, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export type RetrievedAsset = {
  id: number;
  assetName: string;
  target: string;
  modality: string;
  indication: string;
  developmentStage: string;
  institution: string;
  mechanismOfAction: string | null;
  innovationClaim: string | null;
  unmetNeed: string | null;
  comparableDrugs: string | null;
  completenessScore: number | null;
  licensingReadiness: string | null;
  ipType: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  summary: string | null;
  categories: string | null;
  technologyId: string | null;
  similarity: number;
};

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getSearchHistory(limit?: number): Promise<SearchHistory[]>;
  createSearchHistory(entry: InsertSearchHistory): Promise<SearchHistory>;

  getSavedAssets(pipelineListId?: number | null): Promise<SavedAsset[]>;
  getSavedAsset(id: number): Promise<SavedAsset | undefined>;
  createSavedAsset(asset: InsertSavedAsset): Promise<SavedAsset>;
  updateSavedAssetPipeline(id: number, pipelineListId: number | null): Promise<SavedAsset | undefined>;
  deleteSavedAsset(id: number): Promise<void>;

  getPipelineLists(): Promise<PipelineList[]>;
  getPipelineList(id: number): Promise<PipelineList | undefined>;
  createPipelineList(data: InsertPipelineList): Promise<PipelineList>;
  updatePipelineList(id: number, name: string): Promise<PipelineList | undefined>;
  deletePipelineList(id: number): Promise<void>;

  createIngestionRun(): Promise<IngestionRun>;
  updateIngestionRun(id: number, data: Partial<InsertIngestionRun>): Promise<IngestionRun>;
  getLastIngestionRun(): Promise<IngestionRun | undefined>;
  getIngestionRunHistory(limit?: number): Promise<IngestionRun[]>;

  upsertIngestedAsset(fingerprint: string, data: Omit<InsertIngestedAsset, "fingerprint">): Promise<{ asset: IngestedAsset; isNew: boolean }>;
  bulkUpsertIngestedAssets(
    listings: Array<{ fingerprint: string } & Omit<InsertIngestedAsset, "fingerprint">>,
    onProgress?: (done: number, total: number) => void
  ): Promise<{ newAssets: Array<{ id: number; assetName: string; fingerprint: string }>; totalProcessed: number }>;
  updateIngestedAssetEnrichment(id: number, data: {
    target: string; modality: string; indication: string; developmentStage: string; biotechRelevant: boolean;
    categories?: string[]; categoryConfidence?: number; innovationClaim?: string; mechanismOfAction?: string;
    ipType?: string; unmetNeed?: string; comparableDrugs?: string; licensingReadiness?: string; completenessScore?: number;
  }): Promise<void>;
  wipeAllAssets(): Promise<void>;
  getReviewQueue(): Promise<any[]>;
  resolveReviewItem(id: number, note: string): Promise<void>;
  addToReviewQueue(assetId: number, fingerprint: string, reason: string): Promise<void>;
  deleteIngestedAsset(id: number): Promise<void>;
  getIngestedAssetsByInstitution(institution: string): Promise<IngestedAsset[]>;
  getIngestedAssetsByIds(ids: number[]): Promise<RetrievedAsset[]>;
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

  createSyncSession(sessionId: string, institution: string, currentIndexed: number): Promise<SyncSession>;
  updateSyncSession(sessionId: string, data: Partial<Pick<SyncSession, "status" | "phase" | "rawCount" | "newCount" | "relevantCount" | "pushedCount" | "completedAt" | "lastRefreshedAt" | "errorMessage">>): Promise<SyncSession>;
  getSyncSession(sessionId: string): Promise<SyncSession | undefined>;
  getLatestSyncSessions(): Promise<SyncSession[]>;
  markRunningSessionsFailed(): Promise<number>;
  getInstitutionSyncHistory(institution: string, limit?: number): Promise<SyncSession[]>;
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
  resetLatestEnrichmentJob(): Promise<void>;
  stampEnrichedAt(assetId: number): Promise<void>;

  getDeepEnrichmentCoverage(): Promise<{
    totalRelevant: number;
    deepEnriched: number;
    withMoa: number;
    withInnovationClaim: number;
    withUnmetNeed: number;
    withComparableDrugs: number;
    avgCompletenessScore: number | null;
  }>;
  // Re-enrichment contract: `enrichedAt IS NULL` is the single signal used to
  // select assets for deep enrichment. It replaces any separate `needs_enrichment` flag.
  // It is reset to null whenever source content changes (contentHash differs) so that
  // content-improved assets are automatically re-enriched the next cycle.
  getAssetsNeedingDeepEnrich(): Promise<Array<{
    id: number; assetName: string; summary: string; abstract: string | null;
    categories: string[] | null; patentStatus: string | null; licensingStatus: string | null;
    inventors: string[] | null; sourceUrl: string | null;
  }>>;
  getAssetsNeedingDeepEnrichCount(): Promise<number>;
  updateIngestedAssetDeepEnrichment(id: number, data: {
    target: string; modality: string; indication: string; developmentStage: string; biotechRelevant: boolean;
    categories: string[]; categoryConfidence: number; innovationClaim: string; mechanismOfAction: string;
    ipType: string; unmetNeed: string; comparableDrugs: string; licensingReadiness: string; completenessScore: number;
  }): Promise<void>;
  bulkUpdateIngestedAssetsDeepEnrichment(batch: Array<{
    id: number; target: string; modality: string; indication: string; developmentStage: string; biotechRelevant: boolean;
    categories: string[]; categoryConfidence: number; innovationClaim: string; mechanismOfAction: string;
    ipType: string; unmetNeed: string; comparableDrugs: string; licensingReadiness: string; completenessScore: number;
  }>): Promise<number>;
  createDeepEnrichmentJob(total: number): Promise<EnrichmentJob>;
  getRunningDeepEnrichmentJob(): Promise<EnrichmentJob | undefined>;
  getLatestDeepEnrichmentJob(): Promise<EnrichmentJob | undefined>;

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

  getNewArrivals(): Promise<Array<{
    institution: string;
    count: number;
    assets: Array<{ id: number; assetName: string; firstSeenAt: Date; sourceUrl: string | null }>;
  }>>;
  pushNewArrivals(institution?: string): Promise<{ updated: number }>;
  rejectStagingItem(id: number): Promise<boolean>;

  getDuplicateCandidates(): Promise<Array<{
    id: number; assetName: string; institution: string | null; indication: string | null;
    target: string | null; sourceUrl: string | null; duplicateOfId: number | null;
    canonicalName: string | null; dedupeSimilarity: number | null;
  }>>;
  dismissDuplicateCandidate(id: number): Promise<void>;
  runNearDuplicateDetection(onProgress?: (msg: string) => void): Promise<{ embedded: number; flagged: number; pairs: number }>;

  getEmbeddingCoverage(): Promise<{ totalRelevant: number; totalEmbedded: number }>;
  getAssetsNeedingEmbedding(): Promise<Array<{
    id: number; assetName: string; target: string; modality: string; indication: string;
    developmentStage: string; institution: string; summary: string;
    mechanismOfAction: string | null; innovationClaim: string | null;
    unmetNeed: string | null; comparableDrugs: string | null;
  }>>;

  semanticSearch(queryEmbedding: number[], limit?: number): Promise<RetrievedAsset[]>;
  filteredSemanticSearch(queryEmbedding: number[], geoRegex?: string, modality?: string, stage?: string, indication?: string, institutionPattern?: string, limit?: number): Promise<RetrievedAsset[]>;
  scoutVectorSearch(queryEmbedding: number[], opts?: { modality?: string; stage?: string; indication?: string; institution?: string; limit?: number; minSimilarity?: number; since?: Date; before?: Date }): Promise<RetrievedAsset[]>;
  keywordSearchIngestedAssets(query: string, limit?: number, opts?: { modality?: string; stage?: string; indication?: string; institution?: string; since?: Date; before?: Date }): Promise<RetrievedAsset[]>;
  filteredCount(geoRegex?: string, modality?: string, stage?: string, indication?: string, institutionPattern?: string): Promise<number>;
  searchIngestedAssetsByInstitution(name: string, limit?: number): Promise<RetrievedAsset[]>;
  getOrCreateEdenSession(sessionId: string): Promise<EdenSession>;
  appendEdenMessage(sessionId: string, turn: { role: "user" | "assistant"; content: string; assetIds?: number[] }): Promise<EdenSession>;
  getEdenSession(sessionId: string): Promise<EdenSession | undefined>;
  listEdenSessions(limit?: number): Promise<EdenSession[]>;
  createEdenMessageFeedback(sessionId: string, messageIndex: number, sentiment: string): Promise<void>;
  getEdenFeedbackForSession(sessionId: string): Promise<Array<{ messageIndex: number; sentiment: string }>>;

  createUserAlert(data: InsertUserAlert): Promise<UserAlert>;
  listUserAlerts(): Promise<UserAlert[]>;
  deleteUserAlert(id: number): Promise<void>;

  getManualInstitutions(): Promise<ManualInstitution[]>;
  createManualInstitution(data: InsertManualInstitution): Promise<ManualInstitution>;

  getNewDiscoveries(windowHours: number, filters?: { institutions?: string[]; modalities?: string[] }): Promise<Array<{
    id: number; assetName: string; institution: string; indication: string;
    modality: string; target: string; developmentStage: string; summary: string | null;
    sourceUrl: string | null; firstSeenAt: Date; previouslySent: boolean;
  }>>;
  getAssetsByIds(ids: number[]): Promise<Array<{
    id: number; assetName: string; institution: string; indication: string;
    modality: string; target: string; developmentStage: string; summary: string | null;
    sourceUrl: string | null; firstSeenAt: Date;
  }>>;
  createDispatchLog(data: InsertDispatchLog): Promise<DispatchLog>;
  getDispatchHistory(limit?: number): Promise<DispatchLog[]>;

  getPlatformStats(): Promise<{
    totalUsers: number;
    totalAssets: number;
    relevantAssets: number;
    totalInstitutions: number;
    edenSessionsAllTime: number;
    edenSessions24h: number;
    edenSessions7d: number;
    edenSessions30d: number;
    conceptCards: number;
    researchProjects: number;
    publishedDiscoveryCards: number;
    savedAssets: number;
    enrichmentJobsProcessed: number;
  }>;
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

  async getSavedAssets(pipelineListId?: number | null): Promise<SavedAsset[]> {
    if (pipelineListId === null) {
      return db.select().from(savedAssets).where(isNull(savedAssets.pipelineListId)).orderBy(desc(savedAssets.savedAt));
    }
    if (pipelineListId !== undefined) {
      return db.select().from(savedAssets).where(eq(savedAssets.pipelineListId, pipelineListId)).orderBy(desc(savedAssets.savedAt));
    }
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

  async updateSavedAssetPipeline(id: number, pipelineListId: number | null): Promise<SavedAsset | undefined> {
    const [row] = await db.update(savedAssets).set({ pipelineListId }).where(eq(savedAssets.id, id)).returning();
    return row;
  }

  async deleteSavedAsset(id: number): Promise<void> {
    await db.delete(savedAssets).where(eq(savedAssets.id, id));
  }

  async getPipelineLists(): Promise<PipelineList[]> {
    return db.select().from(pipelineLists).orderBy(pipelineLists.createdAt);
  }

  async getPipelineList(id: number): Promise<PipelineList | undefined> {
    const [row] = await db.select().from(pipelineLists).where(eq(pipelineLists.id, id));
    return row;
  }

  async createPipelineList(data: InsertPipelineList): Promise<PipelineList> {
    const [row] = await db.insert(pipelineLists).values(data).returning();
    return row;
  }

  async updatePipelineList(id: number, name: string): Promise<PipelineList | undefined> {
    const [row] = await db.update(pipelineLists).set({ name, updatedAt: new Date() }).where(eq(pipelineLists.id, id)).returning();
    return row;
  }

  async deletePipelineList(id: number): Promise<void> {
    await db.update(savedAssets).set({ pipelineListId: null }).where(eq(savedAssets.pipelineListId, id));
    await db.delete(pipelineLists).where(eq(pipelineLists.id, id));
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

    // 1. Find which fingerprints already exist (chunked SELECT) — also grab contentHash for change detection
    const existingSet = new Map<string, { id: number; contentHash: string | null }>(); 
    for (let i = 0; i < allFingerprints.length; i += CHUNK) {
      const chunk = allFingerprints.slice(i, i + CHUNK);
      const rows = await db
        .select({ id: ingestedAssets.id, fingerprint: ingestedAssets.fingerprint, contentHash: ingestedAssets.contentHash })
        .from(ingestedAssets)
        .where(inArray(ingestedAssets.fingerprint, chunk));
      for (const row of rows) existingSet.set(row.fingerprint, { id: row.id, contentHash: row.contentHash });
    }

    const fingerprintNewListings = listings.filter((l) => !existingSet.has(l.fingerprint));
    const existingListings = listings.filter((l) => existingSet.has(l.fingerprint));
    const runId = listings[0]?.runId;
    const now = new Date();

    // 1b. URL-based dedup: for fingerprint-new listings with a sourceUrl,
    //     check both within-batch duplicates AND existing DB rows.
    //     Priority: first occurrence in batch wins; rest merge to that row.

    // Step 1: Collapse intra-batch duplicates by sourceUrl (keep first per URL)
    const batchUrlSeen = new Set<string>();
    const batchUrlDiscarded: typeof fingerprintNewListings = [];
    const fingerprintNewDeduped = fingerprintNewListings.filter((l) => {
      if (!l.sourceUrl) return true; // No URL — no dedup needed
      if (batchUrlSeen.has(l.sourceUrl)) {
        batchUrlDiscarded.push(l);
        return false;
      }
      batchUrlSeen.add(l.sourceUrl);
      return true;
    });
    if (batchUrlDiscarded.length > 0) {
      console.log(`[storage] Intra-batch URL dedup: ${batchUrlDiscarded.length} listings discarded (same source_url as another listing in this batch)`);
    }

    // Step 2: Query DB for remaining URL candidates already present under a different fingerprint
    const urlCandidates = fingerprintNewDeduped.filter((l) => l.sourceUrl);
    const urlDeduped = new Map<string, { id: number; fingerprint: string; contentHash: string | null }>();
    for (let i = 0; i < urlCandidates.length; i += CHUNK) {
      const chunkUrls = urlCandidates.slice(i, i + CHUNK).map((l) => l.sourceUrl!);
      const rows = await db
        .select({ id: ingestedAssets.id, fingerprint: ingestedAssets.fingerprint, sourceUrl: ingestedAssets.sourceUrl, contentHash: ingestedAssets.contentHash })
        .from(ingestedAssets)
        .where(inArray(ingestedAssets.sourceUrl, chunkUrls));
      for (const row of rows) {
        if (row.sourceUrl) urlDeduped.set(row.sourceUrl, { id: row.id, fingerprint: row.fingerprint, contentHash: row.contentHash });
      }
    }

    const urlDuplicates = fingerprintNewDeduped.filter((l) => l.sourceUrl && urlDeduped.has(l.sourceUrl));
    const newListings = fingerprintNewDeduped.filter((l) => !l.sourceUrl || !urlDeduped.has(l.sourceUrl));

    // Update URL-matched duplicates (refresh content + lastSeenAt instead of inserting)
    if (urlDuplicates.length > 0) {
      console.log(`[storage] URL dedup: ${urlDuplicates.length} listings matched existing rows by source_url — updating instead of inserting`);
      for (const listing of urlDuplicates) {
        const existing = urlDeduped.get(listing.sourceUrl!);
        if (!existing) continue;
        const contentChanged = listing.contentHash && existing.contentHash !== listing.contentHash;
        await db
          .update(ingestedAssets)
          .set({
            lastSeenAt: now,
            runId,
            contentHash: listing.contentHash,
            // Refresh all mutable display metadata so the canonical row stays current
            ...(listing.assetName ? { assetName: listing.assetName } : {}),
            summary: listing.summary || undefined,
            abstract: listing.abstract || undefined,
            ...(listing.categories?.length ? { categories: listing.categories } : {}),
            ...(listing.inventors?.length ? { inventors: listing.inventors } : {}),
            ...(listing.patentStatus ? { patentStatus: listing.patentStatus } : {}),
            ...(listing.licensingStatus ? { licensingStatus: listing.licensingStatus } : {}),
            // Reset enrichedAt when content changes so re-enrichment is triggered
            ...(contentChanged ? { enrichedAt: null } : {}),
          })
          .where(eq(ingestedAssets.id, existing.id));
      }
    }

    // 2. Bulk INSERT truly new listings (chunked)
    const newAssets: Array<{ id: number; assetName: string; fingerprint: string }> = [];
    for (let i = 0; i < newListings.length; i += CHUNK) {
      const chunk = newListings.slice(i, i + CHUNK);
      const inserted = await db
        .insert(ingestedAssets)
        .values(chunk.map(({ fingerprint, ...data }) => ({ fingerprint, ...data })))
        .onConflictDoNothing() // Safe guard: ignore if source_url unique index or fingerprint conflicts
        .returning({ id: ingestedAssets.id, assetName: ingestedAssets.assetName, fingerprint: ingestedAssets.fingerprint });
      for (const row of inserted) newAssets.push({ id: row.id, assetName: row.assetName, fingerprint: row.fingerprint });
      onProgress?.(Math.min(i + CHUNK, newListings.length) + existingListings.length, total);
    }

    // 3. Bulk UPDATE existing listings — update lastSeenAt + runId, detect content changes
    const changedFps: string[] = [];
    const unchangedFps: string[] = [];
    for (const listing of existingListings) {
      const existing = existingSet.get(listing.fingerprint);
      // Treat as changed when: incoming hash exists AND differs from stored hash
      // (includes null stored hash = first-time hash population on a legacy row)
      if (existing && listing.contentHash && listing.contentHash !== existing.contentHash) {
        changedFps.push(listing.fingerprint);
      } else {
        unchangedFps.push(listing.fingerprint);
      }
    }

    for (let i = 0; i < unchangedFps.length; i += CHUNK) {
      const chunk = unchangedFps.slice(i, i + CHUNK);
      await db
        .update(ingestedAssets)
        .set({ lastSeenAt: now, runId })
        .where(inArray(ingestedAssets.fingerprint, chunk));
    }

    for (let i = 0; i < changedFps.length; i += CHUNK) {
      const chunk = changedFps.slice(i, i + CHUNK);
      const chunkListings = existingListings.filter((l) => chunk.includes(l.fingerprint));
      for (const listing of chunkListings) {
        await db
          .update(ingestedAssets)
          .set({
            lastSeenAt: now,
            runId,
            contentHash: listing.contentHash,
            lastContentChangeAt: now,
            summary: listing.summary || undefined,
            abstract: listing.abstract || undefined,
            // Reset enrichedAt so the asset gets re-enriched with improved content
            enrichedAt: null,
          })
          .where(eq(ingestedAssets.fingerprint, listing.fingerprint));
      }
      if (changedFps.length > 0) {
        console.log(`[storage] Content change detected on ${changedFps.length} assets — enrichedAt reset for re-enrichment`);
      }
    }

    onProgress?.(total, total);

    if (total > 0 && newListings.length === 0 && existingListings.length === 0) {
      onProgress?.(total, total);
    }

    return { newAssets, totalProcessed: total };
  }

  async updateIngestedAssetEnrichment(id: number, data: {
    target: string; modality: string; indication: string; developmentStage: string; biotechRelevant: boolean;
    categories?: string[]; categoryConfidence?: number; innovationClaim?: string; mechanismOfAction?: string;
    ipType?: string; unmetNeed?: string; comparableDrugs?: string; licensingReadiness?: string; completenessScore?: number;
  }): Promise<void> {
    const updateData: Record<string, any> = {
      target: data.target,
      modality: data.modality,
      indication: data.indication,
      developmentStage: data.developmentStage,
      relevant: data.biotechRelevant,
    };
    if (data.categories) updateData.categories = data.categories;
    if (data.categoryConfidence !== undefined) updateData.categoryConfidence = data.categoryConfidence;
    if (data.innovationClaim) updateData.innovationClaim = data.innovationClaim;
    if (data.mechanismOfAction) updateData.mechanismOfAction = data.mechanismOfAction;
    if (data.ipType) updateData.ipType = data.ipType;
    if (data.unmetNeed) updateData.unmetNeed = data.unmetNeed;
    if (data.comparableDrugs) updateData.comparableDrugs = data.comparableDrugs;
    if (data.licensingReadiness) updateData.licensingReadiness = data.licensingReadiness;
    if (data.completenessScore !== undefined) updateData.completenessScore = data.completenessScore;

    await db
      .update(ingestedAssets)
      .set(updateData)
      .where(eq(ingestedAssets.id, id));
  }

  async wipeAllAssets(): Promise<void> {
    await db.delete(ingestedAssets);
    console.log("[storage] All ingested assets wiped");
  }

  async getReviewQueue(): Promise<any[]> {
    return db.select().from(reviewQueue).where(eq(reviewQueue.status, "pending")).orderBy(desc(reviewQueue.createdAt));
  }

  async resolveReviewItem(id: number, note: string): Promise<void> {
    await db.update(reviewQueue).set({ status: "resolved", reviewerNote: note, resolvedAt: new Date() }).where(eq(reviewQueue.id, id));
  }

  async addToReviewQueue(assetId: number, fingerprint: string, reason: string): Promise<void> {
    await db.insert(reviewQueue).values({ assetId, fingerprint, reason }).onConflictDoNothing();
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

  async getIngestedAssetsByIds(ids: number[]): Promise<RetrievedAsset[]> {
    if (!ids.length) return [];
    const rows = await db
      .select({
        id: ingestedAssets.id,
        assetName: ingestedAssets.assetName,
        target: ingestedAssets.target,
        modality: ingestedAssets.modality,
        indication: ingestedAssets.indication,
        developmentStage: ingestedAssets.developmentStage,
        institution: ingestedAssets.institution,
        mechanismOfAction: ingestedAssets.mechanismOfAction,
        innovationClaim: ingestedAssets.innovationClaim,
        unmetNeed: ingestedAssets.unmetNeed,
        comparableDrugs: ingestedAssets.comparableDrugs,
        completenessScore: ingestedAssets.completenessScore,
        licensingReadiness: ingestedAssets.licensingReadiness,
        ipType: ingestedAssets.ipType,
        sourceUrl: ingestedAssets.sourceUrl,
        sourceName: ingestedAssets.sourceName,
        summary: ingestedAssets.summary,
        categories: sql<string | null>`${ingestedAssets.categories}::text`,
        technologyId: ingestedAssets.technologyId,
      })
      .from(ingestedAssets)
      .where(inArray(ingestedAssets.id, ids));
    return rows.map((r) => ({ ...r, similarity: 1.0 }));
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

  async markRunningSessionsFailed(): Promise<number> {
    const now = new Date();
    const rows = await db
      .update(syncSessions)
      .set({
        status: "failed",
        phase: "done",
        completedAt: now,
        errorMessage: "Server restarted during sync",
      })
      .where(and(eq(syncSessions.status, "running"), isNull(syncSessions.completedAt)))
      .returning({ sessionId: syncSessions.sessionId });
    return rows.length;
  }

  async getInstitutionSyncHistory(institution: string, limit = 5): Promise<SyncSession[]> {
    return db
      .select()
      .from(syncSessions)
      .where(eq(syncSessions.institution, institution))
      .orderBy(desc(syncSessions.createdAt))
      .limit(limit);
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

  async resetLatestEnrichmentJob(): Promise<void> {
    const [latest] = await db.select().from(enrichmentJobs).orderBy(desc(enrichmentJobs.startedAt)).limit(1);
    if (latest) {
      await db.update(enrichmentJobs).set({ status: "completed", completedAt: new Date() }).where(eq(enrichmentJobs.id, latest.id));
    }
  }

  async stampEnrichedAt(assetId: number): Promise<void> {
    await db.update(ingestedAssets).set({ enrichedAt: new Date() }).where(eq(ingestedAssets.id, assetId));
  }

  async getDeepEnrichmentCoverage(): Promise<{
    totalRelevant: number;
    deepEnriched: number;
    withMoa: number;
    withInnovationClaim: number;
    withUnmetNeed: number;
    withComparableDrugs: number;
    avgCompletenessScore: number | null;
  }> {
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ingestedAssets)
      .where(eq(ingestedAssets.relevant, true));
    const totalRelevant = totalRow?.count ?? 0;

    const [deepRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ingestedAssets)
      .where(and(eq(ingestedAssets.relevant, true), isNotNull(ingestedAssets.mechanismOfAction)));
    const deepEnriched = deepRow?.count ?? 0;

    const [moaRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ingestedAssets)
      .where(and(eq(ingestedAssets.relevant, true), sql`${ingestedAssets.mechanismOfAction} IS NOT NULL AND length(${ingestedAssets.mechanismOfAction}) > 5`));

    const [claimRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ingestedAssets)
      .where(and(eq(ingestedAssets.relevant, true), sql`${ingestedAssets.innovationClaim} IS NOT NULL AND length(${ingestedAssets.innovationClaim}) > 5`));

    const [needRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ingestedAssets)
      .where(and(eq(ingestedAssets.relevant, true), sql`${ingestedAssets.unmetNeed} IS NOT NULL AND length(${ingestedAssets.unmetNeed}) > 5`));

    const [drugsRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ingestedAssets)
      .where(and(eq(ingestedAssets.relevant, true), sql`${ingestedAssets.comparableDrugs} IS NOT NULL AND length(${ingestedAssets.comparableDrugs}) > 2`));

    const [avgRow] = await db
      .select({ avg: sql<number>`round(avg(${ingestedAssets.completenessScore})::numeric, 1)` })
      .from(ingestedAssets)
      .where(and(eq(ingestedAssets.relevant, true), isNotNull(ingestedAssets.completenessScore)));

    return {
      totalRelevant,
      deepEnriched,
      withMoa: moaRow?.count ?? 0,
      withInnovationClaim: claimRow?.count ?? 0,
      withUnmetNeed: needRow?.count ?? 0,
      withComparableDrugs: drugsRow?.count ?? 0,
      avgCompletenessScore: avgRow?.avg ?? null,
    };
  }

  async getAssetsNeedingDeepEnrich(): Promise<Array<{
    id: number; assetName: string; summary: string; abstract: string | null;
    categories: string[] | null; patentStatus: string | null; licensingStatus: string | null;
    inventors: string[] | null; sourceUrl: string | null;
  }>> {
    return db
      .select({
        id: ingestedAssets.id,
        assetName: ingestedAssets.assetName,
        summary: ingestedAssets.summary,
        abstract: ingestedAssets.abstract,
        categories: ingestedAssets.categories,
        patentStatus: ingestedAssets.patentStatus,
        licensingStatus: ingestedAssets.licensingStatus,
        inventors: ingestedAssets.inventors,
        sourceUrl: ingestedAssets.sourceUrl,
      })
      .from(ingestedAssets)
      // Re-enrichment contract: enrichedAt IS NULL is the single signal that drives re-enrichment.
      // It is reset to null by: (1) URL-dedup update path when contentHash changes,
      // (2) changedFps update block when contentHash changes, (3) fresh inserts (default null).
      // No separate needs_enrichment flag is used — enrichedAt IS NULL covers all cases.
      .where(
        and(
          eq(ingestedAssets.relevant, true),
          or(
            // Content changed and enrichedAt was reset → re-enrich even if deep fields are populated
            isNull(ingestedAssets.enrichedAt),
            isNull(ingestedAssets.completenessScore),
            sql`(${ingestedAssets.mechanismOfAction} IS NULL OR ${ingestedAssets.mechanismOfAction} = '')`,
            sql`(${ingestedAssets.innovationClaim} IS NULL OR ${ingestedAssets.innovationClaim} = '')`,
            sql`(${ingestedAssets.unmetNeed} IS NULL OR ${ingestedAssets.unmetNeed} = '')`,
            sql`(${ingestedAssets.comparableDrugs} IS NULL OR ${ingestedAssets.comparableDrugs} = '')`,
            sql`(${ingestedAssets.ipType} IS NULL OR ${ingestedAssets.ipType} = 'unknown')`,
            sql`(${ingestedAssets.licensingReadiness} IS NULL OR ${ingestedAssets.licensingReadiness} = 'unknown')`,
          ),
        ),
      );
  }

  async getAssetsNeedingDeepEnrichCount(): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ingestedAssets)
      .where(
        and(
          eq(ingestedAssets.relevant, true),
          or(
            isNull(ingestedAssets.enrichedAt), // Aligns with getAssetsNeedingDeepEnrich enqueue criteria
            isNull(ingestedAssets.completenessScore),
            sql`(${ingestedAssets.mechanismOfAction} IS NULL OR ${ingestedAssets.mechanismOfAction} = '')`,
            sql`(${ingestedAssets.innovationClaim} IS NULL OR ${ingestedAssets.innovationClaim} = '')`,
            sql`(${ingestedAssets.unmetNeed} IS NULL OR ${ingestedAssets.unmetNeed} = '')`,
            sql`(${ingestedAssets.comparableDrugs} IS NULL OR ${ingestedAssets.comparableDrugs} = '')`,
            sql`(${ingestedAssets.ipType} IS NULL OR ${ingestedAssets.ipType} = 'unknown')`,
            sql`(${ingestedAssets.licensingReadiness} IS NULL OR ${ingestedAssets.licensingReadiness} = 'unknown')`,
          ),
        ),
      );
    return row?.count ?? 0;
  }

  async updateIngestedAssetDeepEnrichment(id: number, data: {
    target: string; modality: string; indication: string; developmentStage: string; biotechRelevant: boolean;
    categories: string[]; categoryConfidence: number; innovationClaim: string; mechanismOfAction: string;
    ipType: string; unmetNeed: string; comparableDrugs: string; licensingReadiness: string; completenessScore: number;
  }): Promise<void> {
    await db.update(ingestedAssets).set({
      target: data.target,
      modality: data.modality,
      indication: data.indication,
      developmentStage: data.developmentStage,
      relevant: data.biotechRelevant,
      categories: data.categories,
      categoryConfidence: data.categoryConfidence,
      innovationClaim: data.innovationClaim || null,
      mechanismOfAction: data.mechanismOfAction || null,
      ipType: data.ipType,
      unmetNeed: data.unmetNeed || null,
      comparableDrugs: data.comparableDrugs || null,
      licensingReadiness: data.licensingReadiness,
      completenessScore: data.completenessScore,
      enrichedAt: new Date(), // Mark as enriched so it is not re-selected by getAssetsNeedingDeepEnrich
      // Clear stale dedupe embedding — target/indication changed so the vector must be refreshed
      // on the next nearDuplicateDetection scan to avoid false-negative dedup comparisons.
      dedupeEmbedding: null,
    }).where(eq(ingestedAssets.id, id));
  }

  async bulkUpdateIngestedAssetsDeepEnrichment(batch: Array<{
    id: number; target: string; modality: string; indication: string; developmentStage: string; biotechRelevant: boolean;
    categories: string[]; categoryConfidence: number; innovationClaim: string; mechanismOfAction: string;
    ipType: string; unmetNeed: string; comparableDrugs: string; licensingReadiness: string; completenessScore: number;
  }>): Promise<number> {
    if (batch.length === 0) return 0;
    let written = 0;
    const now = new Date();
    await db.transaction(async (tx) => {
      for (const data of batch) {
        try {
          await tx.update(ingestedAssets).set({
            target: data.target,
            modality: data.modality,
            indication: data.indication,
            developmentStage: data.developmentStage,
            relevant: data.biotechRelevant,
            categories: data.categories,
            categoryConfidence: data.categoryConfidence,
            innovationClaim: data.innovationClaim || null,
            mechanismOfAction: data.mechanismOfAction || null,
            ipType: data.ipType,
            unmetNeed: data.unmetNeed || null,
            comparableDrugs: data.comparableDrugs || null,
            licensingReadiness: data.licensingReadiness,
            completenessScore: data.completenessScore,
            enrichedAt: now, // Mark as enriched so it is not re-selected by getAssetsNeedingDeepEnrich
            // Clear stale dedupe embedding — forces re-embedding on next scan after target/indication update
            dedupeEmbedding: null,
          }).where(eq(ingestedAssets.id, data.id));
          written++;
        } catch (e) {
          console.error(`[bulkUpdate] failed for asset ${data.id}:`, e);
        }
      }
    });
    return written;
  }

  async createDeepEnrichmentJob(total: number): Promise<EnrichmentJob> {
    const [row] = await db.insert(enrichmentJobs).values({ total, status: "running", model: "gpt-4o" }).returning();
    return row;
  }

  async getRunningDeepEnrichmentJob(): Promise<EnrichmentJob | undefined> {
    const [row] = await db
      .select()
      .from(enrichmentJobs)
      .where(and(eq(enrichmentJobs.status, "running"), eq(enrichmentJobs.model, "gpt-4o")))
      .orderBy(desc(enrichmentJobs.startedAt))
      .limit(1);
    return row;
  }

  async getLatestDeepEnrichmentJob(): Promise<EnrichmentJob | undefined> {
    const [row] = await db
      .select()
      .from(enrichmentJobs)
      .where(eq(enrichmentJobs.model, "gpt-4o"))
      .orderBy(desc(enrichmentJobs.startedAt))
      .limit(1);
    return row;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [row] = await db.insert(researchProjects).values(data as any).returning();
    return row;
  }

  async updateResearchProject(id: number, researcherId: string, data: Partial<InsertResearchProject>): Promise<ResearchProject | undefined> {
    const [row] = await db.update(researchProjects)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set({ ...data, lastEditedAt: new Date() } as any)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [row] = await db.insert(discoveryCards).values(data as any).returning();
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(data as any)
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

  async getNewArrivals(): Promise<Array<{
    institution: string;
    count: number;
    assets: Array<{ id: number; assetName: string; firstSeenAt: Date; sourceUrl: string | null }>;
  }>> {
    // DISTINCT ON (asset_name, institution) keeps only the newest staging row per
    // title+institution pair, collapsing duplicates created by back-to-back scraper runs.
    const result = await db.execute(sql`
      SELECT DISTINCT ON (ss.asset_name, ss.institution)
             ss.id, ss.asset_name, ss.institution, ss.created_at, ss.source_url
      FROM sync_staging ss
      JOIN sync_sessions ses ON ses.session_id = ss.session_id
      WHERE ss.is_new = true
        AND ss.relevant = true
        AND ss.status NOT IN ('pushed', 'skipped')
        AND ses.status = 'enriched'
      ORDER BY ss.asset_name, ss.institution, ss.created_at DESC
    `);
    const rows = result.rows as Array<{
      id: number; asset_name: string; institution: string; created_at: string; source_url: string | null;
    }>;

    const grouped = new Map<string, {
      institution: string;
      count: number;
      assets: Array<{ id: number; assetName: string; firstSeenAt: Date; sourceUrl: string | null }>;
    }>();

    for (const row of rows) {
      if (!grouped.has(row.institution)) {
        grouped.set(row.institution, { institution: row.institution, count: 0, assets: [] });
      }
      const entry = grouped.get(row.institution)!;
      entry.count += 1;
      entry.assets.push({
        id: Number(row.id),
        assetName: row.asset_name,
        firstSeenAt: new Date(row.created_at),
        sourceUrl: row.source_url,
      });
    }

    return Array.from(grouped.values()).sort((a, b) => b.count - a.count);
  }

  async pushNewArrivals(institution?: string): Promise<{ updated: number }> {
    const institutionFilter = institution ? sql`AND ss.institution = ${institution}` : sql``;
    const result = await db.execute(sql`
      SELECT ss.id, ss.session_id, ss.fingerprint, ss.asset_name, ss.institution,
             ss.summary, ss.source_url, ss.target, ss.modality, ss.indication, ss.development_stage
      FROM sync_staging ss
      JOIN sync_sessions ses ON ses.session_id = ss.session_id
      WHERE ss.is_new = true
        AND ss.relevant = true
        AND ss.status NOT IN ('pushed', 'skipped')
        AND ses.status = 'enriched'
        ${institutionFilter}
    `);
    const stagingRows = result.rows as Array<{
      id: number; session_id: string; fingerprint: string; asset_name: string; institution: string;
      summary: string; source_url: string | null; target: string; modality: string;
      indication: string; development_stage: string;
    }>;

    if (stagingRows.length === 0) return { updated: 0 };

    const { newAssets } = await this.bulkUpsertIngestedAssets(
      stagingRows.map((r) => ({
        fingerprint: r.fingerprint,
        assetName: r.asset_name,
        institution: r.institution,
        summary: r.summary,
        sourceUrl: r.source_url,
        sourceType: "tech_transfer" as const,
        developmentStage: r.development_stage,
        target: r.target,
        modality: r.modality,
        indication: r.indication,
        relevant: true,
        runId: 0,
      }))
    );

    for (const asset of newAssets) {
      await this.stampEnrichedAt(asset.id);
    }

    const sessionIds = [...new Set(stagingRows.map((r) => r.session_id))];
    for (const sessionId of sessionIds) {
      const countForSession = stagingRows.filter((r) => r.session_id === sessionId).length;
      await this.updateSyncStagingStatus(sessionId, "pushed", true, true);
      await this.updateSyncSession(sessionId, { status: "pushed", pushedCount: countForSession, lastRefreshedAt: new Date() });
    }

    return { updated: stagingRows.length };
  }

  async rejectStagingItem(id: number): Promise<boolean> {
    const rows = await db.update(syncStaging).set({ status: "skipped" }).where(eq(syncStaging.id, id)).returning({ id: syncStaging.id });
    return rows.length > 0;
  }

  async getDuplicateCandidates(): Promise<Array<{
    id: number; assetName: string; institution: string | null; indication: string | null;
    target: string | null; sourceUrl: string | null; duplicateOfId: number | null;
    canonicalName: string | null; dedupeSimilarity: number | null;
  }>> {
    // Use a typed Drizzle self-join to avoid unsafe row casts
    const canonical = alias(ingestedAssets, "canonical");
    const rows = await db
      .select({
        id: ingestedAssets.id,
        assetName: ingestedAssets.assetName,
        institution: ingestedAssets.institution,
        indication: ingestedAssets.indication,
        target: ingestedAssets.target,
        sourceUrl: ingestedAssets.sourceUrl,
        duplicateOfId: ingestedAssets.duplicateOfId,
        dedupeSimilarity: ingestedAssets.dedupeSimilarity,
        canonicalName: canonical.assetName,
      })
      .from(ingestedAssets)
      .leftJoin(canonical, eq(canonical.id, ingestedAssets.duplicateOfId))
      .where(eq(ingestedAssets.duplicateFlag, true))
      .orderBy(desc(ingestedAssets.dedupeSimilarity), desc(ingestedAssets.id))
      .limit(500);
    return rows.map((r) => ({
      id: r.id,
      assetName: r.assetName,
      institution: r.institution,
      indication: r.indication,
      target: r.target,
      sourceUrl: r.sourceUrl,
      duplicateOfId: r.duplicateOfId,
      canonicalName: r.canonicalName,
      dedupeSimilarity: r.dedupeSimilarity,
    }));
  }

  async dismissDuplicateCandidate(id: number): Promise<void> {
    // Set duplicateFlag=false to remove from the admin panel, but intentionally
    // keep duplicateOfId set as a suppression marker. The near-duplicate scan
    // detects this and skips re-flagging the same pair, preventing admin churn.
    await db
      .update(ingestedAssets)
      .set({ duplicateFlag: false })
      .where(eq(ingestedAssets.id, id));
  }

  async runNearDuplicateDetection(onProgress?: (msg: string) => void): Promise<{ embedded: number; flagged: number; pairs: number }> {
    const { runNearDuplicateDetection: detect } = await import("./lib/pipeline/nearDuplicateDetection");
    const result = await detect(onProgress);
    return { embedded: result.embedded, flagged: result.flagged, pairs: result.pairs.length };
  }

  async getEmbeddingCoverage(): Promise<{ totalRelevant: number; totalEmbedded: number }> {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE relevant = true) AS total_relevant,
        COUNT(*) FILTER (WHERE relevant = true AND embedding IS NOT NULL) AS total_embedded
      FROM ingested_assets
    `);
    const row = result.rows[0] as Record<string, unknown>;
    return {
      totalRelevant: parseInt(String(row.total_relevant ?? "0"), 10),
      totalEmbedded: parseInt(String(row.total_embedded ?? "0"), 10),
    };
  }

  async getAssetsNeedingEmbedding(): Promise<Array<{
    id: number; assetName: string; target: string; modality: string; indication: string;
    developmentStage: string; institution: string; summary: string;
    mechanismOfAction: string | null; innovationClaim: string | null;
    unmetNeed: string | null; comparableDrugs: string | null;
  }>> {
    const result = await db.execute(sql`
      SELECT id, asset_name, target, modality, indication, development_stage, institution,
             summary, mechanism_of_action, innovation_claim, unmet_need, comparable_drugs
      FROM ingested_assets
      WHERE relevant = true AND embedding IS NULL
      ORDER BY completeness_score DESC NULLS LAST
    `);
    return (result.rows as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id),
      assetName: String(r.asset_name ?? ""),
      target: String(r.target ?? ""),
      modality: String(r.modality ?? ""),
      indication: String(r.indication ?? ""),
      developmentStage: String(r.development_stage ?? ""),
      institution: String(r.institution ?? ""),
      summary: String(r.summary ?? ""),
      mechanismOfAction: typeof r.mechanism_of_action === "string" ? r.mechanism_of_action : null,
      innovationClaim: typeof r.innovation_claim === "string" ? r.innovation_claim : null,
      unmetNeed: typeof r.unmet_need === "string" ? r.unmet_need : null,
      comparableDrugs: typeof r.comparable_drugs === "string" ? r.comparable_drugs : null,
    }));
  }

  async semanticSearch(queryEmbedding: number[], limit = 15): Promise<RetrievedAsset[]> {
    const vectorStr = `[${queryEmbedding.join(",")}]`;
    const result = await db.execute(sql`
      SELECT
        id, asset_name, target, modality, indication, development_stage, institution,
        mechanism_of_action, innovation_claim, unmet_need, comparable_drugs,
        completeness_score, licensing_readiness, ip_type, source_url, source_name,
        summary, categories, technology_id,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM ingested_assets
      WHERE embedding IS NOT NULL AND relevant = true
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `);

    return (result.rows as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id),
      assetName: typeof r.asset_name === "string" ? r.asset_name : String(r.asset_name ?? ""),
      target: typeof r.target === "string" ? r.target : String(r.target ?? ""),
      modality: typeof r.modality === "string" ? r.modality : String(r.modality ?? ""),
      indication: typeof r.indication === "string" ? r.indication : String(r.indication ?? ""),
      developmentStage: typeof r.development_stage === "string" ? r.development_stage : String(r.development_stage ?? ""),
      institution: typeof r.institution === "string" ? r.institution : String(r.institution ?? ""),
      mechanismOfAction: typeof r.mechanism_of_action === "string" && r.mechanism_of_action ? r.mechanism_of_action : null,
      innovationClaim: typeof r.innovation_claim === "string" && r.innovation_claim ? r.innovation_claim : null,
      unmetNeed: typeof r.unmet_need === "string" && r.unmet_need ? r.unmet_need : null,
      comparableDrugs: typeof r.comparable_drugs === "string" && r.comparable_drugs ? r.comparable_drugs : null,
      completenessScore: r.completeness_score != null ? parseFloat(String(r.completeness_score)) : null,
      licensingReadiness: typeof r.licensing_readiness === "string" && r.licensing_readiness ? r.licensing_readiness : null,
      ipType: typeof r.ip_type === "string" && r.ip_type ? r.ip_type : null,
      sourceUrl: typeof r.source_url === "string" && r.source_url ? r.source_url : null,
      sourceName: typeof r.source_name === "string" && r.source_name ? r.source_name : null,
      summary: typeof r.summary === "string" && r.summary ? r.summary : null,
      categories: typeof r.categories === "string" && r.categories ? r.categories : null,
      technologyId: typeof r.technology_id === "string" && r.technology_id ? r.technology_id : null,
      similarity: parseFloat(String(r.similarity ?? 0)),
    }));
  }

  async filteredCount(
    geoRegex?: string,
    modality?: string,
    stage?: string,
    indication?: string,
    institutionPattern?: string
  ): Promise<number> {
    const conditions: ReturnType<typeof sql>[] = [sql`relevant = true`];
    if (geoRegex) conditions.push(sql`institution ~* ${geoRegex}`);
    if (modality) conditions.push(sql`LOWER(modality) LIKE ${"%" + modality.toLowerCase() + "%"}`);
    if (stage) conditions.push(sql`LOWER(development_stage) LIKE ${"%" + stage.toLowerCase() + "%"}`);
    if (indication) conditions.push(sql`LOWER(indication) LIKE ${"%" + indication.toLowerCase() + "%"}`);
    if (institutionPattern) conditions.push(sql`LOWER(institution) LIKE ${"%" + institutionPattern.toLowerCase() + "%"}`);

    const where = conditions.reduce((acc, cond, i) => i === 0 ? cond : sql`${acc} AND ${cond}`);
    const result = await db.execute(sql`SELECT COUNT(*)::int AS count FROM ingested_assets WHERE ${where}`);
    return Number((result.rows[0] as Record<string, unknown>)?.count ?? 0);
  }

  async filteredSemanticSearch(
    queryEmbedding: number[],
    geoRegex?: string,
    modality?: string,
    stage?: string,
    indication?: string,
    institutionPattern?: string,
    limit = 15
  ): Promise<RetrievedAsset[]> {
    const vectorStr = `[${queryEmbedding.join(",")}]`;
    const filterConditions: ReturnType<typeof sql>[] = [
      sql`embedding IS NOT NULL AND relevant = true`,
    ];
    if (geoRegex) filterConditions.push(sql`institution ~* ${geoRegex}`);
    if (modality) filterConditions.push(sql`LOWER(modality) LIKE ${"%" + modality.toLowerCase() + "%"}`);
    if (stage) filterConditions.push(sql`LOWER(development_stage) LIKE ${"%" + stage.toLowerCase() + "%"}`);
    if (indication) filterConditions.push(sql`LOWER(indication) LIKE ${"%" + indication.toLowerCase() + "%"}`);
    if (institutionPattern) filterConditions.push(sql`LOWER(institution) LIKE ${"%" + institutionPattern.toLowerCase() + "%"}`);

    const where = filterConditions.reduce((acc, cond, i) => i === 0 ? cond : sql`${acc} AND ${cond}`);

    const result = await db.execute(sql`
      SELECT
        id, asset_name, target, modality, indication, development_stage, institution,
        mechanism_of_action, innovation_claim, unmet_need, comparable_drugs,
        completeness_score, licensing_readiness, ip_type, source_url, source_name,
        summary, categories, technology_id,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM ingested_assets
      WHERE ${where}
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `);

    return (result.rows as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id),
      assetName: typeof r.asset_name === "string" ? r.asset_name : String(r.asset_name ?? ""),
      target: typeof r.target === "string" ? r.target : String(r.target ?? ""),
      modality: typeof r.modality === "string" ? r.modality : String(r.modality ?? ""),
      indication: typeof r.indication === "string" ? r.indication : String(r.indication ?? ""),
      developmentStage: typeof r.development_stage === "string" ? r.development_stage : String(r.development_stage ?? ""),
      institution: typeof r.institution === "string" ? r.institution : String(r.institution ?? ""),
      mechanismOfAction: typeof r.mechanism_of_action === "string" && r.mechanism_of_action ? r.mechanism_of_action : null,
      innovationClaim: typeof r.innovation_claim === "string" && r.innovation_claim ? r.innovation_claim : null,
      unmetNeed: typeof r.unmet_need === "string" && r.unmet_need ? r.unmet_need : null,
      comparableDrugs: typeof r.comparable_drugs === "string" && r.comparable_drugs ? r.comparable_drugs : null,
      completenessScore: r.completeness_score != null ? parseFloat(String(r.completeness_score)) : null,
      licensingReadiness: typeof r.licensing_readiness === "string" && r.licensing_readiness ? r.licensing_readiness : null,
      ipType: typeof r.ip_type === "string" && r.ip_type ? r.ip_type : null,
      sourceUrl: typeof r.source_url === "string" && r.source_url ? r.source_url : null,
      sourceName: typeof r.source_name === "string" && r.source_name ? r.source_name : null,
      summary: typeof r.summary === "string" && r.summary ? r.summary : null,
      categories: typeof r.categories === "string" && r.categories ? r.categories : null,
      technologyId: typeof r.technology_id === "string" && r.technology_id ? r.technology_id : null,
      similarity: parseFloat(String(r.similarity ?? 0)),
    }));
  }

  async scoutVectorSearch(
    queryEmbedding: number[],
    opts: { modality?: string; stage?: string; indication?: string; institution?: string; limit?: number; minSimilarity?: number; since?: Date; before?: Date } = {}
  ): Promise<RetrievedAsset[]> {
    const { modality, stage, indication, institution, limit = 40, minSimilarity = 0.35, since, before } = opts;
    const vectorStr = `[${queryEmbedding.join(",")}]`;
    const filterConditions: ReturnType<typeof sql>[] = [
      sql`embedding IS NOT NULL AND relevant = true`,
      sql`(1 - (embedding <=> ${vectorStr}::vector)) >= ${minSimilarity}`,
    ];
    if (modality) filterConditions.push(sql`LOWER(modality) LIKE ${"%" + modality.toLowerCase() + "%"}`);
    if (stage) filterConditions.push(sql`LOWER(development_stage) LIKE ${"%" + stage.toLowerCase() + "%"}`);
    if (indication) filterConditions.push(sql`LOWER(indication) LIKE ${"%" + indication.toLowerCase() + "%"}`);
    if (institution) filterConditions.push(sql`LOWER(institution) LIKE ${"%" + institution.toLowerCase() + "%"}`);
    if (since) filterConditions.push(sql`first_seen_at >= ${since}`);
    if (before) filterConditions.push(sql`first_seen_at < ${before}`);

    const where = filterConditions.reduce((acc, cond, i) => i === 0 ? cond : sql`${acc} AND ${cond}`);

    const result = await db.execute(sql`
      SELECT
        id, asset_name, target, modality, indication, development_stage, institution,
        mechanism_of_action, innovation_claim, unmet_need, comparable_drugs,
        completeness_score, licensing_readiness, ip_type, source_url, source_name,
        summary, categories, technology_id,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM ingested_assets
      WHERE ${where}
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `);

    return (result.rows as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id),
      assetName: typeof r.asset_name === "string" ? r.asset_name : String(r.asset_name ?? ""),
      target: typeof r.target === "string" ? r.target : String(r.target ?? ""),
      modality: typeof r.modality === "string" ? r.modality : String(r.modality ?? ""),
      indication: typeof r.indication === "string" ? r.indication : String(r.indication ?? ""),
      developmentStage: typeof r.development_stage === "string" ? r.development_stage : String(r.development_stage ?? ""),
      institution: typeof r.institution === "string" ? r.institution : String(r.institution ?? ""),
      mechanismOfAction: typeof r.mechanism_of_action === "string" && r.mechanism_of_action ? r.mechanism_of_action : null,
      innovationClaim: typeof r.innovation_claim === "string" && r.innovation_claim ? r.innovation_claim : null,
      unmetNeed: typeof r.unmet_need === "string" && r.unmet_need ? r.unmet_need : null,
      comparableDrugs: typeof r.comparable_drugs === "string" && r.comparable_drugs ? r.comparable_drugs : null,
      completenessScore: r.completeness_score != null ? parseFloat(String(r.completeness_score)) : null,
      licensingReadiness: typeof r.licensing_readiness === "string" && r.licensing_readiness ? r.licensing_readiness : null,
      ipType: typeof r.ip_type === "string" && r.ip_type ? r.ip_type : null,
      sourceUrl: typeof r.source_url === "string" && r.source_url ? r.source_url : null,
      sourceName: typeof r.source_name === "string" && r.source_name ? r.source_name : null,
      summary: typeof r.summary === "string" && r.summary ? r.summary : null,
      categories: typeof r.categories === "string" && r.categories ? r.categories : null,
      technologyId: typeof r.technology_id === "string" && r.technology_id ? r.technology_id : null,
      similarity: parseFloat(String(r.similarity ?? 0)),
    }));
  }

  async keywordSearchIngestedAssets(
    query: string,
    limit = 40,
    opts: { modality?: string; stage?: string; indication?: string; institution?: string; since?: Date; before?: Date } = {}
  ): Promise<RetrievedAsset[]> {
    const { modality, stage, indication, institution, since, before } = opts;
    const tokens = query
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3)
      .slice(0, 6);

    if (tokens.length === 0) return [];

    const termConditions = tokens.map((t) => {
      const p = `%${t}%`;
      return sql`(LOWER(asset_name) LIKE ${p} OR LOWER(indication) LIKE ${p} OR LOWER(target) LIKE ${p} OR LOWER(COALESCE(summary,'')) LIKE ${p} OR LOWER(institution) LIKE ${p} OR LOWER(COALESCE(mechanism_of_action,'')) LIKE ${p})`;
    });

    const textMatch = termConditions.reduce((acc, cond, i) => i === 0 ? cond : sql`${acc} OR ${cond}`);

    const filterConditions: ReturnType<typeof sql>[] = [sql`relevant = true`, sql`(${textMatch})`];
    if (modality) filterConditions.push(sql`LOWER(modality) LIKE ${"%" + modality.toLowerCase() + "%"}`);
    if (stage) filterConditions.push(sql`LOWER(development_stage) LIKE ${"%" + stage.toLowerCase() + "%"}`);
    if (indication) filterConditions.push(sql`LOWER(indication) LIKE ${"%" + indication.toLowerCase() + "%"}`);
    if (institution) filterConditions.push(sql`LOWER(institution) LIKE ${"%" + institution.toLowerCase() + "%"}`);
    if (since) filterConditions.push(sql`first_seen_at >= ${since}`);
    if (before) filterConditions.push(sql`first_seen_at < ${before}`);

    const where = filterConditions.reduce((acc, cond, i) => i === 0 ? cond : sql`${acc} AND ${cond}`);

    const result = await db.execute(sql`
      SELECT
        id, asset_name, target, modality, indication, development_stage, institution,
        mechanism_of_action, innovation_claim, unmet_need, comparable_drugs,
        completeness_score, licensing_readiness, ip_type, source_url, source_name,
        summary, categories, technology_id,
        0 AS similarity
      FROM ingested_assets
      WHERE ${where}
      ORDER BY completeness_score DESC NULLS LAST, last_seen_at DESC NULLS LAST
      LIMIT ${limit}
    `);

    return (result.rows as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id),
      assetName: typeof r.asset_name === "string" ? r.asset_name : String(r.asset_name ?? ""),
      target: typeof r.target === "string" ? r.target : String(r.target ?? ""),
      modality: typeof r.modality === "string" ? r.modality : String(r.modality ?? ""),
      indication: typeof r.indication === "string" ? r.indication : String(r.indication ?? ""),
      developmentStage: typeof r.development_stage === "string" ? r.development_stage : String(r.development_stage ?? ""),
      institution: typeof r.institution === "string" ? r.institution : String(r.institution ?? ""),
      mechanismOfAction: typeof r.mechanism_of_action === "string" && r.mechanism_of_action ? r.mechanism_of_action : null,
      innovationClaim: typeof r.innovation_claim === "string" && r.innovation_claim ? r.innovation_claim : null,
      unmetNeed: typeof r.unmet_need === "string" && r.unmet_need ? r.unmet_need : null,
      comparableDrugs: typeof r.comparable_drugs === "string" && r.comparable_drugs ? r.comparable_drugs : null,
      completenessScore: r.completeness_score != null ? parseFloat(String(r.completeness_score)) : null,
      licensingReadiness: typeof r.licensing_readiness === "string" && r.licensing_readiness ? r.licensing_readiness : null,
      ipType: typeof r.ip_type === "string" && r.ip_type ? r.ip_type : null,
      sourceUrl: typeof r.source_url === "string" && r.source_url ? r.source_url : null,
      sourceName: typeof r.source_name === "string" && r.source_name ? r.source_name : null,
      summary: typeof r.summary === "string" && r.summary ? r.summary : null,
      categories: typeof r.categories === "string" && r.categories ? r.categories : null,
      technologyId: typeof r.technology_id === "string" && r.technology_id ? r.technology_id : null,
      similarity: 0,
    }));
  }

  async searchIngestedAssetsByInstitution(name: string, limit = 8): Promise<RetrievedAsset[]> {
    const pattern = `%${name.toLowerCase()}%`;
    const result = await db.execute(sql`
      SELECT
        id, asset_name, target, modality, indication, development_stage, institution,
        mechanism_of_action, innovation_claim, unmet_need, comparable_drugs,
        completeness_score, licensing_readiness, ip_type, source_url, source_name,
        summary, categories, technology_id,
        0.85 AS similarity
      FROM ingested_assets
      WHERE relevant = true AND source_type = 'tech_transfer' AND LOWER(institution) LIKE ${pattern}
      ORDER BY last_seen_at DESC
      LIMIT ${limit}
    `);
    return (result.rows as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id),
      assetName: typeof r.asset_name === "string" ? r.asset_name : String(r.asset_name ?? ""),
      target: typeof r.target === "string" ? r.target : String(r.target ?? ""),
      modality: typeof r.modality === "string" ? r.modality : String(r.modality ?? ""),
      indication: typeof r.indication === "string" ? r.indication : String(r.indication ?? ""),
      developmentStage: typeof r.development_stage === "string" ? r.development_stage : String(r.development_stage ?? ""),
      institution: typeof r.institution === "string" ? r.institution : String(r.institution ?? ""),
      mechanismOfAction: typeof r.mechanism_of_action === "string" && r.mechanism_of_action ? r.mechanism_of_action : null,
      innovationClaim: typeof r.innovation_claim === "string" && r.innovation_claim ? r.innovation_claim : null,
      unmetNeed: typeof r.unmet_need === "string" && r.unmet_need ? r.unmet_need : null,
      comparableDrugs: typeof r.comparable_drugs === "string" && r.comparable_drugs ? r.comparable_drugs : null,
      completenessScore: r.completeness_score != null ? parseFloat(String(r.completeness_score)) : null,
      licensingReadiness: typeof r.licensing_readiness === "string" && r.licensing_readiness ? r.licensing_readiness : null,
      ipType: typeof r.ip_type === "string" && r.ip_type ? r.ip_type : null,
      sourceUrl: typeof r.source_url === "string" && r.source_url ? r.source_url : null,
      sourceName: typeof r.source_name === "string" && r.source_name ? r.source_name : null,
      summary: typeof r.summary === "string" && r.summary ? r.summary : null,
      categories: typeof r.categories === "string" && r.categories ? r.categories : null,
      technologyId: typeof r.technology_id === "string" && r.technology_id ? r.technology_id : null,
      similarity: 0.85,
    }));
  }

  async createEdenMessageFeedback(sessionId: string, messageIndex: number, sentiment: string): Promise<void> {
    await db.execute(sql`
      INSERT INTO eden_message_feedback (session_id, message_index, sentiment)
      VALUES (${sessionId}, ${messageIndex}, ${sentiment})
      ON CONFLICT (session_id, message_index) DO UPDATE SET sentiment = EXCLUDED.sentiment
    `);
  }

  async getEdenFeedbackForSession(sessionId: string): Promise<Array<{ messageIndex: number; sentiment: string }>> {
    const rows = await db
      .select({ messageIndex: edenMessageFeedback.messageIndex, sentiment: edenMessageFeedback.sentiment })
      .from(edenMessageFeedback)
      .where(eq(edenMessageFeedback.sessionId, sessionId))
      .orderBy(edenMessageFeedback.messageIndex);
    return rows;
  }

  async getOrCreateEdenSession(sessionId: string): Promise<EdenSession> {
    const [existing] = await db.select().from(edenSessions).where(eq(edenSessions.sessionId, sessionId));
    if (existing) return existing;
    const [created] = await db
      .insert(edenSessions)
      .values({ sessionId, messages: [] })
      .returning();
    return created;
  }

  async appendEdenMessage(
    sessionId: string,
    turn: {
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
    }
  ): Promise<EdenSession> {
    const session = await this.getOrCreateEdenSession(sessionId);
    const newTurn = { ...turn, ts: new Date().toISOString() };
    const updatedMessages = [...(session.messages ?? []), newTurn];
    const [updated] = await db
      .update(edenSessions)
      .set({ messages: updatedMessages, updatedAt: new Date() })
      .where(eq(edenSessions.sessionId, sessionId))
      .returning();
    return updated;
  }

  async getEdenSession(sessionId: string): Promise<EdenSession | undefined> {
    const [session] = await db.select().from(edenSessions).where(eq(edenSessions.sessionId, sessionId));
    return session;
  }

  async listEdenSessions(limit = 50): Promise<EdenSession[]> {
    return db
      .select()
      .from(edenSessions)
      .orderBy(desc(edenSessions.updatedAt))
      .limit(limit);
  }

  async createUserAlert(data: InsertUserAlert): Promise<UserAlert> {
    const [row] = await db.insert(userAlerts).values(data).returning();
    return row;
  }

  async listUserAlerts(): Promise<UserAlert[]> {
    return db.select().from(userAlerts).orderBy(desc(userAlerts.createdAt));
  }

  async deleteUserAlert(id: number): Promise<void> {
    await db.delete(userAlerts).where(eq(userAlerts.id, id));
  }

  async getManualInstitutions(): Promise<ManualInstitution[]> {
    return db.select().from(manualInstitutions).orderBy(manualInstitutions.name);
  }

  async createManualInstitution(data: InsertManualInstitution): Promise<ManualInstitution> {
    const [row] = await db.insert(manualInstitutions).values(data).returning();
    return row;
  }

  async getNewDiscoveries(windowHours: number, filters?: { institutions?: string[]; modalities?: string[] }): Promise<Array<{
    id: number; assetName: string; institution: string; indication: string;
    modality: string; target: string; developmentStage: string; summary: string | null;
    sourceUrl: string | null; firstSeenAt: Date; previouslySent: boolean;
  }>> {
    const cutoff = new Date(Date.now() - windowHours * 3600 * 1000);
    const instCond = filters?.institutions?.length
      ? or(...filters.institutions.map((inst) => ilike(ingestedAssets.institution, `%${inst}%`)))
      : undefined;
    const modalCond = filters?.modalities?.length
      ? inArray(ingestedAssets.modality, filters.modalities)
      : undefined;
    const whereClause = and(
      eq(ingestedAssets.relevant, true),
      gte(ingestedAssets.firstSeenAt, cutoff),
      instCond,
      modalCond,
    );
    const rows = await db
      .select({
        id: ingestedAssets.id,
        assetName: ingestedAssets.assetName,
        institution: ingestedAssets.institution,
        indication: ingestedAssets.indication,
        modality: ingestedAssets.modality,
        target: ingestedAssets.target,
        developmentStage: ingestedAssets.developmentStage,
        summary: ingestedAssets.summary,
        sourceUrl: ingestedAssets.sourceUrl,
        firstSeenAt: ingestedAssets.firstSeenAt,
      })
      .from(ingestedAssets)
      .where(whereClause)
      .orderBy(desc(ingestedAssets.firstSeenAt))
      .limit(500);

    const allIds = rows.map((r) => r.id);
    const sentIds = new Set<number>();
    if (allIds.length > 0) {
      const logs = await db.select({ assetIds: dispatchLogs.assetIds }).from(dispatchLogs).where(eq(dispatchLogs.isTest, false));
      for (const log of logs) {
        for (const id of (log.assetIds ?? [])) sentIds.add(id);
      }
    }

    return rows.map((r) => ({
      id: r.id,
      assetName: r.assetName,
      institution: r.institution ?? "",
      indication: r.indication ?? "",
      modality: r.modality ?? "",
      target: r.target ?? "",
      developmentStage: r.developmentStage ?? "",
      summary: r.summary,
      sourceUrl: r.sourceUrl,
      firstSeenAt: r.firstSeenAt ?? new Date(),
      previouslySent: sentIds.has(r.id),
    }));
  }

  async getAssetsByIds(ids: number[]): Promise<Array<{
    id: number; assetName: string; institution: string; indication: string;
    modality: string; target: string; developmentStage: string; summary: string | null;
    sourceUrl: string | null; firstSeenAt: Date;
  }>> {
    if (ids.length === 0) return [];
    const rows = await db
      .select({
        id: ingestedAssets.id,
        assetName: ingestedAssets.assetName,
        institution: ingestedAssets.institution,
        indication: ingestedAssets.indication,
        modality: ingestedAssets.modality,
        target: ingestedAssets.target,
        developmentStage: ingestedAssets.developmentStage,
        summary: ingestedAssets.summary,
        sourceUrl: ingestedAssets.sourceUrl,
        firstSeenAt: ingestedAssets.firstSeenAt,
      })
      .from(ingestedAssets)
      .where(inArray(ingestedAssets.id, ids));
    return rows.map((r) => ({
      id: r.id,
      assetName: r.assetName,
      institution: r.institution ?? "",
      indication: r.indication ?? "",
      modality: r.modality ?? "",
      target: r.target ?? "",
      developmentStage: r.developmentStage ?? "",
      summary: r.summary,
      sourceUrl: r.sourceUrl,
      firstSeenAt: r.firstSeenAt ?? new Date(),
    }));
  }

  async createDispatchLog(data: InsertDispatchLog): Promise<DispatchLog> {
    const [row] = await db.insert(dispatchLogs).values(data).returning();
    return row;
  }

  async getDispatchHistory(limit = 20): Promise<DispatchLog[]> {
    return db.select().from(dispatchLogs).orderBy(desc(dispatchLogs.sentAt)).limit(limit);
  }

  async getPlatformStats(): Promise<{
    totalUsers: number;
    totalAssets: number;
    relevantAssets: number;
    totalInstitutions: number;
    edenSessionsAllTime: number;
    edenSessions24h: number;
    edenSessions7d: number;
    edenSessions30d: number;
    conceptCards: number;
    researchProjects: number;
    publishedDiscoveryCards: number;
    savedAssets: number;
    enrichmentJobsProcessed: number;
  }> {
    const now = new Date();
    const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const result = await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM users)                                                         AS total_users,
        (SELECT count(*)::int FROM ingested_assets)                                              AS total_assets,
        (SELECT count(*)::int FROM ingested_assets WHERE relevant = true)                        AS relevant_assets,
        (SELECT count(DISTINCT institution)::int FROM ingested_assets)                           AS total_institutions,
        (SELECT count(*)::int FROM eden_sessions)                                                AS eden_sessions_all,
        (SELECT count(*)::int FROM eden_sessions WHERE created_at >= ${ago24h})                 AS eden_sessions_24h,
        (SELECT count(*)::int FROM eden_sessions WHERE created_at >= ${ago7d})                  AS eden_sessions_7d,
        (SELECT count(*)::int FROM eden_sessions WHERE created_at >= ${ago30d})                 AS eden_sessions_30d,
        (SELECT count(*)::int FROM concept_cards)                                                AS concept_cards,
        (SELECT count(*)::int FROM research_projects)                                            AS research_projects,
        (SELECT count(*)::int FROM discovery_cards WHERE published = true)                       AS published_discovery_cards,
        (SELECT count(*)::int FROM saved_assets)                                                 AS saved_assets,
        (SELECT coalesce(sum(processed), 0)::int FROM enrichment_jobs)                          AS enrichment_processed
    `);
    const row = result.rows[0] as Record<string, unknown>;

    return {
      totalUsers: Number(row?.total_users ?? 0),
      totalAssets: Number(row?.total_assets ?? 0),
      relevantAssets: Number(row?.relevant_assets ?? 0),
      totalInstitutions: Number(row?.total_institutions ?? 0),
      edenSessionsAllTime: Number(row?.eden_sessions_all ?? 0),
      edenSessions24h: Number(row?.eden_sessions_24h ?? 0),
      edenSessions7d: Number(row?.eden_sessions_7d ?? 0),
      edenSessions30d: Number(row?.eden_sessions_30d ?? 0),
      conceptCards: Number(row?.concept_cards ?? 0),
      researchProjects: Number(row?.research_projects ?? 0),
      publishedDiscoveryCards: Number(row?.published_discovery_cards ?? 0),
      savedAssets: Number(row?.saved_assets ?? 0),
      enrichmentJobsProcessed: Number(row?.enrichment_processed ?? 0),
    };
  }
}

export const storage = new DatabaseStorage();
