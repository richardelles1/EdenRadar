import {
  users, type User, type InsertUser,
  searchHistory, type SearchHistory, type InsertSearchHistory,
  savedAssets, type SavedAsset, type InsertSavedAsset,
  savedAssetNotes, type SavedAssetNote, type InsertSavedAssetNote,
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
  industryProfiles, type IndustryProfileRow,
  organizations, type Organization, type InsertOrganization,
  orgMembers, type OrgMember, type InsertOrgMember,
  sharedLinks, type SharedLink,
  teamActivities, type TeamActivity, type InsertTeamActivity,
  stripeBillingEvents, type StripeBillingEvent, type InsertStripeBillingEvent,
  savedReports, type SavedReport, type InsertSavedReport,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, gte, gt, lte, and, inArray, lt, isNull, isNotNull, or, ilike, type SQL } from "drizzle-orm";
import { computeCompletenessScore } from "./lib/pipeline/contentHash";
import { alias } from "drizzle-orm/pg-core";

export type RetrievedAsset = {
  id: number;
  assetName: string;
  target: string | null;
  modality: string | null;
  indication: string | null;
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
  stageChangedAt?: Date | null;
  previousStage?: string | null;
};

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getSearchHistory(limit?: number, userId?: string): Promise<SearchHistory[]>;
  createSearchHistory(entry: InsertSearchHistory): Promise<SearchHistory>;

  getSavedAssets(pipelineListId?: number | null, userId?: string): Promise<SavedAsset[]>;
  getSavedAssetsForTeam(orgId: number, filterUserId?: string): Promise<{
    assets: Array<SavedAsset & { saverName: string | null }>;
    members: Array<{ userId: string; displayName: string | null }>;
  }>;
  getSavedAsset(id: number): Promise<SavedAsset | undefined>;
  createSavedAsset(asset: InsertSavedAsset, userId?: string): Promise<SavedAsset>;
  updateSavedAssetPipeline(id: number, pipelineListId: number | null): Promise<SavedAsset | undefined>;
  updateSavedAssetStatus(id: number, status: string | null): Promise<SavedAsset | undefined>;
  deleteSavedAsset(id: number): Promise<void>;

  createAssetNote(data: InsertSavedAssetNote): Promise<SavedAssetNote>;
  getAssetNotes(savedAssetId: number, limit?: number, offset?: number): Promise<SavedAssetNote[]>;
  getAssetNoteMeta(savedAssetIds: number[]): Promise<Record<number, { count: number; lastNoteAt: Date | null }>>;
  updateAssetNote(noteId: number, content: string, userId: string): Promise<SavedAssetNote | null>;
  deleteAssetNote(noteId: number, userId: string): Promise<boolean>;

  getPipelineLists(userId?: string, orgId?: number): Promise<PipelineList[]>;
  getPipelineList(id: number): Promise<PipelineList | undefined>;
  createPipelineList(data: InsertPipelineList, userId?: string): Promise<PipelineList>;
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
    target: string | null; modality: string | null; indication: string | null; developmentStage: string; biotechRelevant: boolean;
    categories?: string[]; categoryConfidence?: number; innovationClaim?: string; mechanismOfAction?: string | null;
    ipType?: string; unmetNeed?: string | null; comparableDrugs?: string | null; licensingReadiness?: string; completenessScore?: number;
    assetClass?: string | null; deviceAttributes?: Record<string, unknown> | null;
  }): Promise<void>;
  wipeAllAssets(): Promise<void>;
  wipeInstitutionAssets(institution: string): Promise<number>;
  getReviewQueue(): Promise<any[]>;
  resolveReviewItem(id: number, note: string): Promise<void>;
  addToReviewQueue(assetId: number, fingerprint: string, reason: string): Promise<void>;
  deleteIngestedAsset(id: number): Promise<void>;
  markAsIrrelevant(id: number): Promise<void>;
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
  getExistingFingerprints(institution: string): Promise<{ fingerprints: Set<string>; sourceUrls: Set<string> }>;
  supersedeStagingForInstitution(institution: string): Promise<number>;
  quarantineNewStagingRows(institution: string): Promise<number>;
  quarantineSessionNewRows(sessionId: string): Promise<number>;
  releaseQuarantinedRows(institution: string): Promise<number>;
  discardQuarantinedRows(institution: string): Promise<number>;
  getQuarantineSummary(): Promise<Array<{ institution: string; count: number }>>;
  getInstitutionIndexedCount(institution: string): Promise<number>;

  getEnrichmentStats(): Promise<{
    total: number;
    unknownCount: number;
    byField: { target: number; modality: number; indication: number; developmentStage: number };
  }>;
  getIncompleteAssets(since?: Date): Promise<Array<{ id: number; assetName: string; summary: string; target: string | null; modality: string | null; indication: string | null; developmentStage: string }>>;
  getMiniEnrichBatch(limit: number): Promise<Array<{ id: number; assetName: string; summary: string; target: string; modality: string; indication: string; developmentStage: string }>>;

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
    target: string | null; modality: string | null; indication: string | null; developmentStage: string; biotechRelevant: boolean;
    categories: string[]; categoryConfidence: number; innovationClaim: string; mechanismOfAction: string | null;
    ipType: string; unmetNeed: string | null; comparableDrugs: string | null; licensingReadiness: string; completenessScore: number;
    assetClass?: string | null; deviceAttributes?: Record<string, unknown> | null;
  }): Promise<void>;
  bulkUpdateIngestedAssetsDeepEnrichment(batch: Array<{
    id: number; target: string | null; modality: string | null; indication: string | null; developmentStage: string; biotechRelevant: boolean;
    categories: string[]; categoryConfidence: number; innovationClaim: string; mechanismOfAction: string;
    ipType: string; unmetNeed: string; comparableDrugs: string; licensingReadiness: string; completenessScore: number;
    assetClass?: string | null; deviceAttributes?: Record<string, unknown> | null;
  }>, source?: "mini" | "gpt4o" | "deep" | string): Promise<number>;
  createDeepEnrichmentJob(total: number): Promise<EnrichmentJob>;
  getRunningDeepEnrichmentJob(): Promise<EnrichmentJob | undefined>;
  getLatestDeepEnrichmentJob(): Promise<EnrichmentJob | undefined>;
  backfillCompletenessScores(): Promise<{ total: number; updated: number; unchanged: number }>;

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

  createUserAlert(data: InsertUserAlert, userId?: string): Promise<UserAlert>;
  updateUserAlert(id: number, userId: string, data: Partial<InsertUserAlert>): Promise<UserAlert | null>;
  listUserAlerts(userId?: string): Promise<UserAlert[]>;
  deleteUserAlert(id: number, userId: string): Promise<void>;

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

  bulkUpdateAssetsFromCsv(rows: Array<{
    id: number; assetName?: string; institution?: string; summary?: string; abstract?: string;
    target?: string; modality?: string; indication?: string; developmentStage?: string;
    categories?: string[]; mechanismOfAction?: string; innovationClaim?: string;
    unmetNeed?: string; comparableDrugs?: string; licensingReadiness?: string;
    ipType?: string; completenessScore?: number;
  }>): Promise<{ updated: number; skipped: number; notFoundIds: number[] }>;

  getIndustryProfileByUserId(userId: string): Promise<IndustryProfileRow | undefined>;
  upsertIndustryProfile(userId: string, data: Omit<IndustryProfileRow, "userId" | "updatedAt" | "orgId" | "subscribedToDigest" | "lastAlertSentAt" | "alertLastAssetId" | "lastViewedAlertsAt">): Promise<IndustryProfileRow>;
  getAllIndustryProfiles(): Promise<IndustryProfileRow[]>;
  setIndustryProfileOrg(userId: string, orgId: number | null): Promise<void>;

  getSubscriberMatches(windowHours: number): Promise<SubscriberMatchEntry[]>;
  getSubscriberSuggestions(userId: string, windowHours: number): Promise<AssetSuggestion[]>;
  getAlertSubscribers(): Promise<IndustryProfileRow[]>;
  updateAlertState(userId: string, lastAlertSentAt: Date, alertLastAssetId: number): Promise<void>;
  setIndustryProfileSubscription(userId: string, subscribedToDigest: boolean): Promise<void>;
  getWindowAssetSummary(windowHours: number): Promise<{ totalCount: number; top5Ids: number[] }>;
  getAllInstitutionNames(): Promise<string[]>;

  // Organizations
  getAllOrganizations(): Promise<Organization[]>;
  getOrganization(id: number): Promise<Organization | undefined>;
  createOrganization(data: InsertOrganization): Promise<Organization>;
  updateOrganization(id: number, data: Partial<InsertOrganization>): Promise<Organization | undefined>;
  deleteOrganization(id: number): Promise<void>;
  getOrgByStripeCustomer(stripeCustomerId: string): Promise<Organization | undefined>;
  getOrgByStripeSubscriptionId(stripeSubscriptionId: string): Promise<Organization | undefined>;
  claimOrgsForTrialReminder(windowHours: number): Promise<Organization[]>;
  applyStripeSubscription(orgId: number, data: { stripeCustomerId: string; stripeSubscriptionId: string; stripeStatus: string; stripePriceId: string; planTier: string; seatLimit?: number; stripeCurrentPeriodEnd?: Date | null; stripeCancelAt?: Date | null }, eventType?: string): Promise<Organization | undefined>;
  logBillingEvent(data: InsertStripeBillingEvent): Promise<StripeBillingEvent>;
  getBillingHistory(orgId: number): Promise<StripeBillingEvent[]>;
  markWelcomeEmailSent(orgId: number, subId: string): Promise<boolean>;
  releaseWelcomeEmailClaim(orgId: number, subId: string): Promise<void>;
  markPaymentFailedEmailSent(orgId: number, invId: string): Promise<boolean>;
  releasePaymentFailedEmailClaim(orgId: number, invId: string): Promise<void>;

  // Org Members
  getOrgMembers(orgId: number): Promise<OrgMember[]>;
  getOrgMemberCount(orgId: number): Promise<number>;
  addOrgMember(data: InsertOrgMember): Promise<OrgMember>;
  removeOrgMember(orgId: number, userId: string): Promise<void>;
  deleteUserAccount(userId: string): Promise<void>;
  updateOrgMemberRole(orgId: number, userId: string, role: string): Promise<void>;
  updateOrgMemberInviteStatus(orgId: number, userId: string, status: string): Promise<void>;
  getOrgForUser(userId: string): Promise<Organization | undefined>;
  getOrgPlanByMembership(userId: string): Promise<{ plan: string; orgName: string; stripeStatus: string | null; stripeCurrentPeriodEnd: Date | null } | null>;

  createSharedLink(data: { type: string; entityId?: string; payload: Record<string, unknown>; createdBy?: string; expiresAt: Date; passwordHash?: string }): Promise<SharedLink>;
  getSharedLinkByToken(token: string): Promise<SharedLink | undefined>;

  // Team Activities
  getOrgMemberByUserId(orgId: number, userId: string): Promise<OrgMember | undefined>;
  createTeamActivity(data: InsertTeamActivity): Promise<TeamActivity>;
  getTeamActivities(orgId: number, limit?: number): Promise<TeamActivity[]>;

  // Saved Reports
  createSavedReport(data: InsertSavedReport): Promise<SavedReport>;
  getSavedReports(userId: string): Promise<SavedReport[]>;
  deleteSavedReport(id: number, userId: string): Promise<void>;
}

export type SubscriberMatchEntry = {
  userId: string;
  companyName: string;
  therapeuticAreas: string[];
  modalities: string[];
  dealStages: string[];
  totalMatches: number;
  top5AssetIds: number[];
};

export type AssetSuggestion = {
  id: number;
  assetName: string;
  institution: string;
  indication: string;
  modality: string;
  target: string;
  developmentStage: string;
  summary: string | null;
  sourceUrl: string | null;
  firstSeenAt: Date;
  score: number;
  matchedFields: string[];
};

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

  async getSearchHistory(limit = 20, userId?: string): Promise<SearchHistory[]> {
    const where = userId ? eq(searchHistory.userId, userId) : undefined;
    return db.select().from(searchHistory).where(where).orderBy(desc(searchHistory.createdAt)).limit(limit);
  }

  async createSearchHistory(entry: InsertSearchHistory): Promise<SearchHistory> {
    const [row] = await db.insert(searchHistory).values(entry).returning();
    return row;
  }

  async getSavedAssets(pipelineListId?: number | null, userId?: string): Promise<SavedAsset[]> {
    if (!userId) return [];
    const conditions: SQL[] = [
      eq(savedAssets.userId, userId),
    ];
    if (pipelineListId === null) conditions.push(isNull(savedAssets.pipelineListId));
    else if (pipelineListId !== undefined) conditions.push(eq(savedAssets.pipelineListId, pipelineListId));
    return db.select().from(savedAssets).where(and(...conditions)).orderBy(desc(savedAssets.savedAt));
  }

  async getSavedAssetsForTeam(orgId: number, filterUserId?: string): Promise<{
    assets: Array<SavedAsset & { saverName: string | null }>;
    members: Array<{ userId: string; displayName: string | null }>;
  }> {
    // LEFT JOIN with industryProfiles to prefer the user's own display name (self-set)
    // over the admin-entered memberName (set at invite time)
    const rows = await db
      .select({
        userId: orgMembers.userId,
        memberName: orgMembers.memberName,
        profileName: industryProfiles.userName,
      })
      .from(orgMembers)
      .leftJoin(industryProfiles, eq(orgMembers.userId, industryProfiles.userId))
      .where(eq(orgMembers.orgId, orgId));
    if (rows.length === 0) return { assets: [], members: [] };

    // Resolve display name: profile userName wins if present and non-empty
    const nameMap = new Map(rows.map((r) => [
      r.userId,
      (r.profileName && r.profileName.trim()) || r.memberName || null,
    ]));
    const membersList = rows.map((r) => ({ userId: r.userId, displayName: nameMap.get(r.userId) ?? null }));

    // When filtering by a specific member, validate they belong to this org
    const queryUserIds = filterUserId && nameMap.has(filterUserId)
      ? [filterUserId]
      : rows.map((r) => r.userId);

    const assets = await db
      .select()
      .from(savedAssets)
      .where(inArray(savedAssets.userId, queryUserIds))
      .orderBy(desc(savedAssets.savedAt));

    return {
      assets: assets.map((a) => ({
        ...a,
        saverName: a.userId ? (nameMap.get(a.userId) ?? null) : null,
      })),
      members: membersList,
    };
  }

  async getSavedAsset(id: number): Promise<SavedAsset | undefined> {
    const [asset] = await db.select().from(savedAssets).where(eq(savedAssets.id, id));
    return asset;
  }

  async createSavedAsset(asset: InsertSavedAsset, userId?: string): Promise<SavedAsset> {
    const [row] = await db.insert(savedAssets).values({ ...asset, ...(userId ? { userId } : {}) }).returning();
    return row;
  }

  async updateSavedAssetPipeline(id: number, pipelineListId: number | null): Promise<SavedAsset | undefined> {
    const [row] = await db.update(savedAssets).set({ pipelineListId }).where(eq(savedAssets.id, id)).returning();
    return row;
  }

  async updateSavedAssetStatus(id: number, status: string | null): Promise<SavedAsset | undefined> {
    const [row] = await db.update(savedAssets).set({ status }).where(eq(savedAssets.id, id)).returning();
    return row;
  }

  async deleteSavedAsset(id: number): Promise<void> {
    await db.delete(savedAssets).where(eq(savedAssets.id, id));
  }

  async createAssetNote(data: InsertSavedAssetNote): Promise<SavedAssetNote> {
    const [row] = await db.insert(savedAssetNotes).values(data).returning();
    return row;
  }

  async getAssetNotes(savedAssetId: number, limit = 50, offset = 0): Promise<SavedAssetNote[]> {
    return db
      .select()
      .from(savedAssetNotes)
      .where(eq(savedAssetNotes.savedAssetId, savedAssetId))
      .orderBy(savedAssetNotes.createdAt)
      .limit(limit)
      .offset(offset);
  }

  async updateAssetNote(noteId: number, content: string, userId: string): Promise<SavedAssetNote | null> {
    const [row] = await db
      .update(savedAssetNotes)
      .set({ content })
      .where(and(eq(savedAssetNotes.id, noteId), eq(savedAssetNotes.userId, userId)))
      .returning();
    return row ?? null;
  }

  async deleteAssetNote(noteId: number, userId: string): Promise<boolean> {
    const result = await db
      .delete(savedAssetNotes)
      .where(and(eq(savedAssetNotes.id, noteId), eq(savedAssetNotes.userId, userId)))
      .returning({ id: savedAssetNotes.id });
    return result.length > 0;
  }

  async getAssetNoteMeta(savedAssetIds: number[]): Promise<Record<number, { count: number; lastNoteAt: Date | null }>> {
    if (savedAssetIds.length === 0) return {};
    const rows = await db
      .select({
        savedAssetId: savedAssetNotes.savedAssetId,
        count: sql<number>`count(*)::int`,
        lastNoteAt: sql<Date | null>`max(${savedAssetNotes.createdAt})`,
      })
      .from(savedAssetNotes)
      .where(inArray(savedAssetNotes.savedAssetId, savedAssetIds))
      .groupBy(savedAssetNotes.savedAssetId);
    return Object.fromEntries(rows.map((r) => [r.savedAssetId, { count: r.count, lastNoteAt: r.lastNoteAt }]));
  }

  async getPipelineLists(userId?: string, orgId?: number): Promise<PipelineList[]> {
    const conditions: SQL[] = [];
    if (userId) conditions.push(eq(pipelineLists.userId, userId));
    if (orgId) conditions.push(eq(pipelineLists.orgId, orgId));
    if (conditions.length === 0) return [];
    return db.select().from(pipelineLists).where(or(...conditions)).orderBy(pipelineLists.createdAt);
  }

  async getPipelineList(id: number): Promise<PipelineList | undefined> {
    const [row] = await db.select().from(pipelineLists).where(eq(pipelineLists.id, id));
    return row;
  }

  async createPipelineList(data: InsertPipelineList, userId?: string): Promise<PipelineList> {
    const [row] = await db.insert(pipelineLists).values({ ...data, ...(userId ? { userId } : {}) }).returning();
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

    // 1. Find which fingerprints already exist (chunked SELECT) — also grab contentHash and sourceUrl for change detection
    const existingSet = new Map<string, { id: number; contentHash: string | null; sourceUrl: string | null }>(); 
    for (let i = 0; i < allFingerprints.length; i += CHUNK) {
      const chunk = allFingerprints.slice(i, i + CHUNK);
      const rows = await db
        .select({ id: ingestedAssets.id, fingerprint: ingestedAssets.fingerprint, contentHash: ingestedAssets.contentHash, sourceUrl: ingestedAssets.sourceUrl })
        .from(ingestedAssets)
        .where(inArray(ingestedAssets.fingerprint, chunk));
      for (const row of rows) existingSet.set(row.fingerprint, { id: row.id, contentHash: row.contentHash, sourceUrl: row.sourceUrl });
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
            // Reset enrichedAt when content changes so re-enrichment is triggered.
            // Also reset deepEnrichAttempts so the asset is eligible for bucket-C
            // low-quality retry again if the fresh deep-enrich result is still thin.
            ...(contentChanged ? { enrichedAt: null, deepEnrichAttempts: 0 } : {}),
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
    // Unchanged but needs sourceUrl healed (stored null, incoming has real URL)
    const unchangedNeedsUrlFps: string[] = [];
    const unchangedFps: string[] = [];
    for (const listing of existingListings) {
      const existing = existingSet.get(listing.fingerprint);
      const needsUrlHeal = !existing?.sourceUrl && !!listing.sourceUrl;
      // Treat as changed when: incoming hash exists AND differs from stored hash
      // (includes null stored hash = first-time hash population on a legacy row)
      if (existing && listing.contentHash && listing.contentHash !== existing.contentHash) {
        changedFps.push(listing.fingerprint);
      } else if (needsUrlHeal) {
        unchangedNeedsUrlFps.push(listing.fingerprint);
      } else {
        unchangedFps.push(listing.fingerprint);
      }
    }

    // Bulk update truly unchanged listings (no content change, no URL to heal)
    for (let i = 0; i < unchangedFps.length; i += CHUNK) {
      const chunk = unchangedFps.slice(i, i + CHUNK);
      await db
        .update(ingestedAssets)
        .set({ lastSeenAt: now, runId })
        .where(inArray(ingestedAssets.fingerprint, chunk));
    }

    // Per-row update for listings that need their sourceUrl healed (were null, now have a real URL)
    if (unchangedNeedsUrlFps.length > 0) {
      console.log(`[storage] Healing sourceUrl for ${unchangedNeedsUrlFps.length} assets that previously had no URL`);
      const urlHealListings = existingListings.filter((l) => unchangedNeedsUrlFps.includes(l.fingerprint));
      for (const listing of urlHealListings) {
        await db
          .update(ingestedAssets)
          .set({ lastSeenAt: now, runId, sourceUrl: listing.sourceUrl })
          .where(eq(ingestedAssets.fingerprint, listing.fingerprint));
      }
    }

    for (let i = 0; i < changedFps.length; i += CHUNK) {
      const chunk = changedFps.slice(i, i + CHUNK);
      const chunkListings = existingListings.filter((l) => chunk.includes(l.fingerprint));
      for (const listing of chunkListings) {
        const existing = existingSet.get(listing.fingerprint);
        await db
          .update(ingestedAssets)
          .set({
            lastSeenAt: now,
            runId,
            contentHash: listing.contentHash,
            lastContentChangeAt: now,
            summary: listing.summary || undefined,
            abstract: listing.abstract || undefined,
            // Heal sourceUrl if it was previously null and we now have a real URL
            ...(!existing?.sourceUrl && listing.sourceUrl ? { sourceUrl: listing.sourceUrl } : {}),
            // Reset enrichedAt so the asset gets re-enriched with improved content.
            // Also reset deepEnrichAttempts so bucket-C low-quality retry is available again.
            enrichedAt: null,
            deepEnrichAttempts: 0,
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
    target: string | null; modality: string | null; indication: string | null; developmentStage: string; biotechRelevant: boolean;
    categories?: string[]; categoryConfidence?: number; innovationClaim?: string; mechanismOfAction?: string | null;
    ipType?: string; unmetNeed?: string | null; comparableDrugs?: string | null; licensingReadiness?: string; completenessScore?: number;
    assetClass?: string | null; deviceAttributes?: Record<string, unknown> | null;
  }): Promise<void> {
    // Fetch existing humanVerified and enrichmentSources
    const [existing] = await db
      .select({ developmentStage: ingestedAssets.developmentStage, humanVerified: ingestedAssets.humanVerified, enrichmentSources: ingestedAssets.enrichmentSources })
      .from(ingestedAssets)
      .where(eq(ingestedAssets.id, id))
      .limit(1);

    const hv: Record<string, boolean> = (existing?.humanVerified as Record<string, boolean>) ?? {};
    const existingSources: Record<string, string> = (existing?.enrichmentSources as Record<string, string>) ?? {};
    const newSources: Record<string, string> = { ...existingSources };

    const oldStage = existing?.developmentStage;
    const newStage = data.developmentStage;
    const stageChanged =
      oldStage && newStage &&
      oldStage !== "unknown" && newStage !== "unknown" &&
      oldStage !== newStage;

    // Build strictly-typed update using Drizzle's inferred insert type (no casting needed).
    const updateData: Partial<typeof ingestedAssets.$inferInsert> = {
      relevant: data.biotechRelevant,
    };
    if (stageChanged) {
      updateData.previousStage = oldStage ?? undefined;
      updateData.stageChangedAt = new Date();
    }

    // Only write fields that are not human-verified
    if (!hv.target) { updateData.target = data.target; newSources.target = "mini"; }
    if (!hv.modality) { updateData.modality = data.modality; newSources.modality = "mini"; }
    if (!hv.indication) { updateData.indication = data.indication; newSources.indication = "mini"; }
    if (!hv.developmentStage) { updateData.developmentStage = data.developmentStage; newSources.developmentStage = "mini"; }

    if (data.categories) updateData.categories = data.categories;
    if (data.categoryConfidence !== undefined) updateData.categoryConfidence = data.categoryConfidence;
    if (!hv.innovationClaim && data.innovationClaim) { updateData.innovationClaim = data.innovationClaim; newSources.innovationClaim = "mini"; }
    if (!hv.mechanismOfAction && data.mechanismOfAction !== undefined) { updateData.mechanismOfAction = data.mechanismOfAction || null; newSources.mechanismOfAction = "mini"; }
    if (!hv.ipType && data.ipType) { updateData.ipType = data.ipType; newSources.ipType = "mini"; }
    if (!hv.unmetNeed && data.unmetNeed !== undefined) { updateData.unmetNeed = data.unmetNeed || null; newSources.unmetNeed = "mini"; }
    if (!hv.comparableDrugs && data.comparableDrugs !== undefined) { updateData.comparableDrugs = data.comparableDrugs || null; newSources.comparableDrugs = "mini"; }
    if (!hv.licensingReadiness && data.licensingReadiness) { updateData.licensingReadiness = data.licensingReadiness; newSources.licensingReadiness = "mini"; }
    if (data.completenessScore !== undefined) updateData.completenessScore = data.completenessScore;
    if (data.assetClass) { updateData.assetClass = data.assetClass; newSources.assetClass = "mini"; }
    if (data.deviceAttributes !== undefined) updateData.deviceAttributes = data.deviceAttributes ?? null;

    updateData.enrichmentSources = newSources;

    await db.update(ingestedAssets).set(updateData).where(eq(ingestedAssets.id, id));
  }

  async wipeAllAssets(): Promise<void> {
    await db.delete(ingestedAssets);
    console.log("[storage] All ingested assets wiped");
  }

  async wipeInstitutionAssets(institution: string): Promise<number> {
    let deletedCount = 0;
    await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(ingestedAssets)
        .where(eq(ingestedAssets.institution, institution))
        .returning({ id: ingestedAssets.id });
      // Also clear staging rows so their fingerprints don't block fresh re-sync
      await tx.delete(syncStaging).where(eq(syncStaging.institution, institution));
      deletedCount = deleted.length;
    });
    console.log(`[storage] Wiped ${deletedCount} ingested assets + all staging rows for: ${institution}`);
    return deletedCount;
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
      .where(and(ilike(ingestedAssets.institution, `%${institution}%`), eq(ingestedAssets.sourceType, "tech_transfer")))
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
    // NOTE: Do NOT delete staging rows here. Pending staging rows from prior sessions
    // must remain available for fingerprint dedup in runInstitutionSync (getExistingFingerprints
    // reads them). Superseding (marking as 'skipped') is done after dedup in runInstitutionSync.

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

  async getExistingFingerprints(institution: string): Promise<{ fingerprints: Set<string>; sourceUrls: Set<string> }> {
    // 1. Fingerprints + source URLs already committed to the main table
    const dbRows = await db
      .select({ fingerprint: ingestedAssets.fingerprint, sourceUrl: ingestedAssets.sourceUrl })
      .from(ingestedAssets)
      .where(eq(ingestedAssets.institution, institution));

    const fingerprints = new Set(dbRows.map(r => r.fingerprint));
    const sourceUrls = new Set<string>(dbRows.filter(r => r.sourceUrl).map(r => r.sourceUrl!));

    // 1b. Domain-based cross-institution URL dedup for shared TTO portals.
    //     Multiple institutions may share a single web portal (e.g., all UC campuses
    //     share techtransfer.universityofcalifornia.edu; many universities host on
    //     flintbox.com / license.umn.edu / techlink portals). An asset present in any
    //     institution that shares the same domain must be excluded from the "new" set
    //     for this institution, preventing false-new floods when URL format changes.
    //     Detection is institution-name-driven so it works before any rows exist.
    const SHARED_DOMAIN_MAP: Record<string, string[]> = {
      "techtransfer.universityofcalifornia.edu": [
        "UC Berkeley", "UC San Diego", "UC Los Angeles", "UC Davis",
        "UC Santa Barbara", "UC Irvine", "UC Santa Cruz", "UC Riverside", "UC Merced",
      ],
      "flintbox.com": [],
      "techtransfer.bu.edu": [],
    };
    for (const [domain, campusNames] of Object.entries(SHARED_DOMAIN_MAP)) {
      const matchesByName = campusNames.includes(institution);
      const matchesByUrl = !matchesByName && dbRows.some(r => r.sourceUrl?.includes(domain));
      if (matchesByName || matchesByUrl) {
        const crossRows = await db.execute(sql`
          SELECT source_url FROM ingested_assets
          WHERE source_url LIKE ${"%" + domain + "%"}
            AND institution != ${institution}
            AND source_url IS NOT NULL
        `);
        for (const r of crossRows.rows as Array<{ source_url: string }>) {
          if (r.source_url) sourceUrls.add(r.source_url);
        }
      }
    }

    // 2. Also include fingerprints + source URLs from staging rows for this institution.
    //    Include ALL staging rows regardless of isNew flag (a Day-N scan may have inserted
    //    the same asset as isNew=false, and we must still recognise it on Day N+1).
    //    Only exclude 'pushed' rows since those are already reflected in ingested_assets.
    //    Use a 90-day window to keep the query efficient as the table accumulates over time.
    const stagingRows = await db
      .select({ fingerprint: syncStaging.fingerprint, sourceUrl: syncStaging.sourceUrl })
      .from(syncStaging)
      .where(
        and(
          eq(syncStaging.institution, institution),
          sql`${syncStaging.status} != 'pushed'`,
          gte(syncStaging.createdAt, sql`NOW() - INTERVAL '90 days'`)
        )
      );

    for (const r of stagingRows) {
      fingerprints.add(r.fingerprint);
      if (r.sourceUrl) sourceUrls.add(r.sourceUrl);
    }

    return { fingerprints, sourceUrls };
  }

  async supersedeStagingForInstitution(institution: string): Promise<number> {
    // Supersede stale/incomplete session rows (running, failed, stuck, anomalous).
    // Rows from enriched sessions are preserved (they are the Indexing Queue).
    // 'quarantined' rows are also preserved — they may be released later.
    const staleResult = await db.execute(sql`
      UPDATE sync_staging ss
      SET status = 'skipped'
      FROM sync_sessions ses
      WHERE ss.session_id = ses.session_id
        AND ss.institution = ${institution}
        AND ss.status NOT IN ('pushed', 'skipped', 'quarantined')
        AND ses.status NOT IN ('enriched', 'anomalous')
      RETURNING ss.id
    `);

    // Expire all enriched-session rows older than 14 days — including pushed rows.
    // Pushed rows are already committed to ingested_assets, so keeping them in
    // staging is purely redundant. Non-pushed enriched rows this old are abandoned.
    // Skipping them (rather than deleting) keeps them out of the Indexing Queue
    // while still being excluded by getExistingFingerprints (which reads from
    // ingestedAssets for the pushed fingerprints and skips 'pushed' staging rows).
    // Scoped to enriched sessions; non-enriched old rows are already handled by
    // the stale-session supersede above.
    await db.execute(sql`
      UPDATE sync_staging ss
      SET status = 'skipped'
      FROM sync_sessions ses
      WHERE ss.session_id = ses.session_id
        AND ss.institution = ${institution}
        AND ss.status NOT IN ('skipped', 'quarantined')
        AND ses.status = 'enriched'
        AND ss.created_at < NOW() - INTERVAL '14 days'
    `);

    return staleResult.rows.length;
  }

  async quarantineNewStagingRows(institution: string): Promise<number> {
    // Mark all is_new=true staging rows for the institution as 'quarantined' so they
    // cannot be pushed but can be released later. Used to quarantine false-new floods
    // caused by URL/dedup churn (e.g., UC campus URL format changes).
    const result = await db.execute(sql`
      UPDATE sync_staging
      SET status = 'quarantined'
      WHERE institution = ${institution}
        AND is_new = true
        AND status NOT IN ('pushed', 'skipped', 'quarantined')
      RETURNING id
    `);
    return result.rows.length;
  }

  async quarantineSessionNewRows(sessionId: string): Promise<number> {
    // Session-scoped variant used by the anomaly guard in runInstitutionSync.
    // Only touches rows from the current (bad) session rather than all institution rows.
    const result = await db.execute(sql`
      UPDATE sync_staging
      SET status = 'quarantined'
      WHERE session_id = ${sessionId}
        AND is_new = true
        AND status NOT IN ('pushed', 'skipped', 'quarantined')
      RETURNING id
    `);
    return result.rows.length;
  }

  async releaseQuarantinedRows(institution: string): Promise<number> {
    // Release quarantined rows back to 'scraped' (pending-equivalent).
    // relevant remains NULL — rows require a re-sync to be properly classified
    // before they can appear in the Indexing Queue and be pushed.
    // The session is promoted to 'enriched' so the admin can see the batch in the
    // sync panel and trigger a manual re-sync.
    const result = await db.execute(sql`
      UPDATE sync_staging
      SET status = 'scraped'
      WHERE institution = ${institution}
        AND status = 'quarantined'
      RETURNING id, session_id
    `);
    if (result.rows.length > 0) {
      const sessionIds = [...new Set((result.rows as Array<{ session_id: string }>).map(r => r.session_id))];
      for (const sessionId of sessionIds) {
        await db.execute(sql`
          UPDATE sync_sessions
          SET status = 'enriched', completed_at = NOW()
          WHERE session_id = ${sessionId}
            AND status = 'anomalous'
        `);
      }
    }
    return result.rows.length;
  }

  async discardQuarantinedRows(institution: string): Promise<number> {
    // Permanently discard quarantined rows by marking them 'skipped'.
    // Used when the quarantine is confirmed to be a genuine dedup failure.
    const result = await db.execute(sql`
      UPDATE sync_staging
      SET status = 'skipped'
      WHERE institution = ${institution}
        AND status = 'quarantined'
      RETURNING id
    `);
    return result.rows.length;
  }

  async getQuarantineSummary(): Promise<Array<{ institution: string; count: number }>> {
    const rows = await db.execute(sql`
      SELECT institution, COUNT(*)::int AS count
      FROM sync_staging
      WHERE status = 'quarantined'
      GROUP BY institution
      ORDER BY count DESC
    `);
    return rows.rows as Array<{ institution: string; count: number }>;
  }

  async markAsIrrelevant(id: number): Promise<void> {
    await db
      .update(ingestedAssets)
      .set({ relevant: false })
      .where(eq(ingestedAssets.id, id));
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

    const rows = await db
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
    return rows.map(r => ({
      ...r,
      target: r.target ?? "unknown",
      modality: r.modality ?? "unknown",
      indication: r.indication ?? "unknown",
    }));
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
      // Three finite, non-overlapping selection buckets. Each asset will only ever
      // fall into one bucket; once it exits all three it is never re-selected.
      //
      // Bucket A — fresh/reset (enrichedAt IS NULL):
      //   Covers: new inserts (default null) and content-change resets
      //   (bulkUpsertIngestedAssets clears enrichedAt when contentHash changes).
      //
      // Bucket B — legacy (completenessScore IS NULL AND enrichedAt IS NOT NULL):
      //   Covers: assets enriched before completeness scoring was introduced.
      //   These have enrichedAt set but no score recorded.
      //
      // Bucket C — low-quality retry (completenessScore < 15 AND enrichedAt IS NOT NULL
      //           AND deepEnrichAttempts <= 1):
      //   Covers: assets that produced a near-zero score on their first GPT-4o pass
      //   (e.g., thin-content stub that later gained an abstract).
      //   Threshold: score < 15 means not even one standard field was filled
      //   (target/modality/indication each contribute 15 pts; a legitimate result
      //   that extracted one field cleanly will score >= 15 and exit this bucket).
      //
      //   Why <= 1 and not = 0:
      //     - Every deep-enrich write (bucket A or B) increments deepEnrichAttempts (0→1).
      //     - After the first pass, deepEnrichAttempts = 1.  If score is still < 15,
      //       the asset enters bucket C (attempts = 1, which satisfies <= 1) for ONE retry.
      //     - The retry increments deepEnrichAttempts to 2, permanently excluding the asset
      //       (2 > 1).  Total: at most TWO GPT-4o calls per asset.
      //     - Content-change resets both enrichedAt and deepEnrichAttempts to 0/null,
      //       restarting the two-pass lifecycle for updated content.
      .where(
        and(
          eq(ingestedAssets.relevant, true),
          or(
            isNull(ingestedAssets.enrichedAt),
            and(
              sql`${ingestedAssets.enrichedAt} IS NOT NULL`,
              isNull(ingestedAssets.completenessScore),
            ),
            and(
              sql`${ingestedAssets.enrichedAt} IS NOT NULL`,
              sql`${ingestedAssets.completenessScore} IS NOT NULL`,
              sql`${ingestedAssets.completenessScore} < 15`,
              sql`${ingestedAssets.deepEnrichAttempts} <= 1`,
            ),
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
            isNull(ingestedAssets.enrichedAt),
            and(
              sql`${ingestedAssets.enrichedAt} IS NOT NULL`,
              isNull(ingestedAssets.completenessScore),
            ),
            and(
              sql`${ingestedAssets.enrichedAt} IS NOT NULL`,
              sql`${ingestedAssets.completenessScore} IS NOT NULL`,
              sql`${ingestedAssets.completenessScore} < 15`,
              sql`${ingestedAssets.deepEnrichAttempts} <= 1`,
            ),
          ),
        ),
      );
    return row?.count ?? 0;
  }

  async getAssetsNeedingDeepEnrichBreakdown(): Promise<{ fresh: number; legacy: number; lowQualityRetry: number; total: number }> {
    const result = await db.execute<{ fresh: number; legacy: number; low_quality_retry: number; total: number }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE enriched_at IS NULL)::int                                                                               AS fresh,
        COUNT(*) FILTER (WHERE enriched_at IS NOT NULL AND completeness_score IS NULL)::int                                            AS legacy,
        COUNT(*) FILTER (WHERE enriched_at IS NOT NULL AND completeness_score IS NOT NULL AND completeness_score < 15 AND deep_enrich_attempts <= 1)::int AS low_quality_retry,
        COUNT(*)::int                                                                                                                   AS total
      FROM ingested_assets
      WHERE relevant = true
        AND (
          enriched_at IS NULL
          OR (enriched_at IS NOT NULL AND completeness_score IS NULL)
          OR (enriched_at IS NOT NULL AND completeness_score IS NOT NULL AND completeness_score < 15 AND deep_enrich_attempts <= 1)
        )
    `);
    const row = result.rows[0];
    return {
      fresh: Number(row?.fresh ?? 0),
      legacy: Number(row?.legacy ?? 0),
      lowQualityRetry: Number(row?.low_quality_retry ?? 0),
      total: Number(row?.total ?? 0),
    };
  }

  async updateIngestedAssetDeepEnrichment(id: number, data: {
    target: string | null; modality: string | null; indication: string | null; developmentStage: string; biotechRelevant: boolean;
    categories: string[]; categoryConfidence: number; innovationClaim: string; mechanismOfAction: string | null;
    ipType: string; unmetNeed: string | null; comparableDrugs: string | null; licensingReadiness: string; completenessScore: number;
    assetClass?: string | null; deviceAttributes?: Record<string, unknown> | null;
  }): Promise<void> {
    // Pre-fetch humanVerified, enrichmentSources, AND deepEnrichAttempts so we can
    // increment the counter as a plain integer (no SQL expression → no type cast needed).
    const [cur] = await db.select({
      humanVerified: ingestedAssets.humanVerified,
      enrichmentSources: ingestedAssets.enrichmentSources,
      deepEnrichAttempts: ingestedAssets.deepEnrichAttempts,
    }).from(ingestedAssets).where(eq(ingestedAssets.id, id));

    const hv: Record<string, boolean> = (cur?.humanVerified as Record<string, boolean>) ?? {};
    const existingSources: Record<string, string> = (cur?.enrichmentSources as Record<string, string>) ?? {};
    const newSources: Record<string, string> = { ...existingSources };

    // Build strictly-typed update using Drizzle's inferred insert type (no casting needed).
    const update: Partial<typeof ingestedAssets.$inferInsert> = {
      relevant: data.biotechRelevant,
      categories: data.categories,
      categoryConfidence: data.categoryConfidence,
      completenessScore: data.completenessScore,
      enrichedAt: new Date(),
      deepEnrichAttempts: (cur?.deepEnrichAttempts ?? 0) + 1,
      dedupeEmbedding: null,
    };

    if (!hv.target) { update.target = data.target; newSources.target = "deep"; }
    if (!hv.modality) { update.modality = data.modality; newSources.modality = "deep"; }
    if (!hv.indication) { update.indication = data.indication; newSources.indication = "deep"; }
    if (!hv.developmentStage) { update.developmentStage = data.developmentStage; newSources.developmentStage = "deep"; }
    if (!hv.mechanismOfAction) { update.mechanismOfAction = data.mechanismOfAction || null; newSources.mechanismOfAction = "deep"; }
    if (!hv.innovationClaim) { update.innovationClaim = data.innovationClaim || null; newSources.innovationClaim = "deep"; }
    if (!hv.ipType) { update.ipType = data.ipType; newSources.ipType = "deep"; }
    if (!hv.unmetNeed) { update.unmetNeed = data.unmetNeed || null; newSources.unmetNeed = "deep"; }
    if (!hv.comparableDrugs) { update.comparableDrugs = data.comparableDrugs || null; newSources.comparableDrugs = "deep"; }
    if (!hv.licensingReadiness) { update.licensingReadiness = data.licensingReadiness; newSources.licensingReadiness = "deep"; }
    if (data.assetClass) { update.assetClass = data.assetClass; newSources.assetClass = "deep"; }
    if (data.deviceAttributes !== undefined) update.deviceAttributes = data.deviceAttributes ?? null;

    update.enrichmentSources = newSources;
    await db.update(ingestedAssets).set(update).where(eq(ingestedAssets.id, id));
  }

  async bulkUpdateIngestedAssetsDeepEnrichment(batch: Array<{
    id: number; target: string | null; modality: string | null; indication: string | null; developmentStage: string; biotechRelevant: boolean;
    categories: string[]; categoryConfidence: number; innovationClaim: string; mechanismOfAction: string;
    ipType: string; unmetNeed: string; comparableDrugs: string; licensingReadiness: string; completenessScore: number;
    assetClass?: string | null; deviceAttributes?: Record<string, unknown> | null;
  }>, source: string = "gpt4o"): Promise<number> {
    if (batch.length === 0) return 0;
    let written = 0;
    const now = new Date();
    await db.transaction(async (tx) => {
      for (const data of batch) {
        try {
          // Pre-fetch humanVerified, enrichmentSources, AND deepEnrichAttempts so we can
          // increment the counter as a plain integer — no SQL expression, no type cast needed.
          const [cur] = await tx.select({
            humanVerified: ingestedAssets.humanVerified,
            enrichmentSources: ingestedAssets.enrichmentSources,
            deepEnrichAttempts: ingestedAssets.deepEnrichAttempts,
          }).from(ingestedAssets).where(eq(ingestedAssets.id, data.id));

          const hv: Record<string, boolean> = (cur?.humanVerified as Record<string, boolean>) ?? {};
          const existingSources: Record<string, string> = (cur?.enrichmentSources as Record<string, string>) ?? {};

          const newSources: Record<string, string> = { ...existingSources };
          // Strictly-typed update — no Record<string, unknown> or `as any` needed.
          const update: Partial<typeof ingestedAssets.$inferInsert> = {
            relevant: data.biotechRelevant,
            categories: data.categories,
            categoryConfidence: data.categoryConfidence,
            completenessScore: data.completenessScore,
            enrichedAt: now,
            deepEnrichAttempts: (cur?.deepEnrichAttempts ?? 0) + 1,
            dedupeEmbedding: null,
          };

          if (!hv.target) { update.target = data.target; newSources.target = source; }
          if (!hv.modality) { update.modality = data.modality; newSources.modality = source; }
          if (!hv.indication) { update.indication = data.indication; newSources.indication = source; }
          if (!hv.developmentStage) { update.developmentStage = data.developmentStage; newSources.developmentStage = source; }
          if (!hv.mechanismOfAction) { update.mechanismOfAction = data.mechanismOfAction || null; newSources.mechanismOfAction = source; }
          if (!hv.innovationClaim) { update.innovationClaim = data.innovationClaim || null; newSources.innovationClaim = source; }
          if (!hv.ipType) { update.ipType = data.ipType; newSources.ipType = source; }
          if (!hv.unmetNeed) { update.unmetNeed = data.unmetNeed || null; newSources.unmetNeed = source; }
          if (!hv.comparableDrugs) { update.comparableDrugs = data.comparableDrugs || null; newSources.comparableDrugs = source; }
          if (!hv.licensingReadiness) { update.licensingReadiness = data.licensingReadiness; newSources.licensingReadiness = source; }

          if (data.assetClass) { update.assetClass = data.assetClass; newSources.assetClass = source; }
          if (data.deviceAttributes !== undefined) update.deviceAttributes = data.deviceAttributes ?? null;

          update.enrichmentSources = newSources;

          await tx.update(ingestedAssets).set(update).where(eq(ingestedAssets.id, data.id));
          written++;
        } catch (e) {
          console.error(`[bulkUpdate] failed for asset ${data.id}:`, e);
        }
      }
    });
    return written;
  }

  async setHumanVerified(assetId: number, field: string, verified: boolean): Promise<void> {
    const [cur] = await db.select({ humanVerified: ingestedAssets.humanVerified })
      .from(ingestedAssets).where(eq(ingestedAssets.id, assetId));
    const existing: Record<string, boolean> = (cur?.humanVerified as Record<string, boolean>) ?? {};
    if (verified) {
      existing[field] = true;
    } else {
      delete existing[field];
    }
    await db.update(ingestedAssets)
      .set({ humanVerified: existing })
      .where(eq(ingestedAssets.id, assetId));
  }

  async getMiniEnrichBatch(limit: number): Promise<Array<{ id: number; assetName: string; summary: string; target: string; modality: string; indication: string; developmentStage: string }>> {
    // Same criteria as getMiniEnrichQueue: relevant, non-sparse, >150 chars, 3+ unknown key fields.
    // Capped by `limit` so each run is a bounded, cost-controlled cycle.
    const rows = await db.execute(sql`
      SELECT id, asset_name AS "assetName", summary,
             COALESCE(target, 'unknown') AS target,
             COALESCE(modality, 'unknown') AS modality,
             COALESCE(indication, 'unknown') AS indication,
             COALESCE(development_stage, 'unknown') AS "developmentStage"
      FROM ingested_assets
      WHERE relevant = true
        AND (data_sparse IS NULL OR data_sparse = false)
        AND char_length(COALESCE(summary, '') || COALESCE(abstract, '')) > 150
        AND (
          (CASE WHEN COALESCE(target, 'unknown') = 'unknown' THEN 1 ELSE 0 END) +
          (CASE WHEN COALESCE(modality, 'unknown') = 'unknown' THEN 1 ELSE 0 END) +
          (CASE WHEN COALESCE(indication, 'unknown') = 'unknown' THEN 1 ELSE 0 END) +
          (CASE WHEN development_stage = 'unknown' THEN 1 ELSE 0 END)
        ) >= 3
      ORDER BY COALESCE(enriched_at, '1970-01-01'::timestamptz) ASC
      LIMIT ${limit}
    `);
    return rows.rows as Array<{ id: number; assetName: string; summary: string; target: string; modality: string; indication: string; developmentStage: string }>;
  }

  async getMiniEnrichQueue(): Promise<{ count: number; costEstimate: number }> {
    // Select relevant, non-sparse assets with 3+ unknown key fields (target/modality/indication/developmentStage)
    // and sufficient description length (>150 chars) to be worth a mini pass.
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ingestedAssets)
      .where(sql`
        relevant = true
        AND (data_sparse IS NULL OR data_sparse = false)
        AND char_length(COALESCE(summary, '') || COALESCE(abstract, '')) > 150
        AND (
          (CASE WHEN COALESCE(target, 'unknown') = 'unknown' THEN 1 ELSE 0 END) +
          (CASE WHEN COALESCE(modality, 'unknown') = 'unknown' THEN 1 ELSE 0 END) +
          (CASE WHEN COALESCE(indication, 'unknown') = 'unknown' THEN 1 ELSE 0 END) +
          (CASE WHEN development_stage = 'unknown' THEN 1 ELSE 0 END)
        ) >= 3
      `);
    const count = row?.count ?? 0;
    return { count, costEstimate: count * 0.0003 };
  }

  async flagDataSparse(): Promise<number> {
    const result = await db.execute(sql`
      UPDATE ingested_assets
      SET data_sparse = true
      WHERE relevant = true
        AND (data_sparse IS NULL OR data_sparse = false)
        AND char_length(COALESCE(summary, '') || COALESCE(abstract, '')) < 150
    `);
    return (result as any).rowCount ?? 0;
  }

  async backfillCompletenessScores(): Promise<{ total: number; updated: number; unchanged: number }> {
    const rows = await db
      .select({
        id: ingestedAssets.id,
        target: ingestedAssets.target,
        modality: ingestedAssets.modality,
        indication: ingestedAssets.indication,
        developmentStage: ingestedAssets.developmentStage,
        summary: ingestedAssets.summary,
        abstract: ingestedAssets.abstract,
        categories: ingestedAssets.categories,
        innovationClaim: ingestedAssets.innovationClaim,
        mechanismOfAction: ingestedAssets.mechanismOfAction,
        unmetNeed: ingestedAssets.unmetNeed,
        comparableDrugs: ingestedAssets.comparableDrugs,
        licensingReadiness: ingestedAssets.licensingReadiness,
        inventors: ingestedAssets.inventors,
        patentStatus: ingestedAssets.patentStatus,
        completenessScore: ingestedAssets.completenessScore,
      })
      .from(ingestedAssets)
      .where(isNotNull(ingestedAssets.completenessScore));

    let updated = 0;
    let unchanged = 0;
    const toUpdate: Array<{ id: number; score: number }> = [];

    for (const row of rows) {
      const newScore = computeCompletenessScore({
        target: row.target,
        modality: row.modality,
        indication: row.indication,
        developmentStage: row.developmentStage,
        summary: row.summary,
        abstract: row.abstract,
        categories: row.categories,
        innovationClaim: row.innovationClaim,
        mechanismOfAction: row.mechanismOfAction,
        unmetNeed: row.unmetNeed,
        comparableDrugs: row.comparableDrugs,
        licensingReadiness: row.licensingReadiness,
        inventors: row.inventors,
        patentStatus: row.patentStatus,
      });
      const oldScore = row.completenessScore != null ? Number(row.completenessScore) : null;
      if (oldScore !== newScore) {
        toUpdate.push({ id: row.id, score: newScore });
      } else {
        unchanged++;
      }
    }

    const BATCH_SIZE = 500;
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE);
      await db.transaction(async (tx) => {
        for (const { id, score } of batch) {
          await tx.update(ingestedAssets)
            .set({ completenessScore: score })
            .where(eq(ingestedAssets.id, id));
          updated++;
        }
      });
    }

    return { total: rows.length, updated, unchanged };
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
        AND ss.status NOT IN ('pushed', 'skipped', 'quarantined')
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
        AND ss.status NOT IN ('pushed', 'skipped', 'quarantined')
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
        summary, categories, technology_id, stage_changed_at, previous_stage,
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
      stageChangedAt: r.stage_changed_at instanceof Date ? r.stage_changed_at : r.stage_changed_at ? new Date(String(r.stage_changed_at)) : null,
      previousStage: typeof r.previous_stage === "string" && r.previous_stage ? r.previous_stage : null,
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
        summary, categories, technology_id, stage_changed_at, previous_stage,
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
      stageChangedAt: r.stage_changed_at instanceof Date ? r.stage_changed_at : r.stage_changed_at ? new Date(String(r.stage_changed_at)) : null,
      previousStage: typeof r.previous_stage === "string" && r.previous_stage ? r.previous_stage : null,
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

  async createUserAlert(data: InsertUserAlert, userId?: string): Promise<UserAlert> {
    const values: any = { ...data };
    if (userId) values.userId = userId;
    const [row] = await db.insert(userAlerts).values(values).returning();
    return row;
  }

  async updateUserAlert(id: number, userId: string, data: Partial<InsertUserAlert>): Promise<UserAlert | null> {
    const [row] = await db.update(userAlerts).set(data)
      .where(and(eq(userAlerts.id, id), eq(userAlerts.userId, userId)))
      .returning();
    return row ?? null;
  }

  async listUserAlerts(userId?: string): Promise<UserAlert[]> {
    if (userId) {
      return db.select().from(userAlerts).where(eq(userAlerts.userId, userId)).orderBy(desc(userAlerts.createdAt));
    }
    return db.select().from(userAlerts).orderBy(desc(userAlerts.createdAt));
  }

  async deleteUserAlert(id: number, userId: string): Promise<void> {
    await db.delete(userAlerts).where(and(eq(userAlerts.id, id), eq(userAlerts.userId, userId)));
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

  async bulkUpdateAssetsFromCsv(rows: Array<{
    id: number; assetName?: string; institution?: string; summary?: string; abstract?: string;
    target?: string; modality?: string; indication?: string; developmentStage?: string;
    categories?: string[]; mechanismOfAction?: string; innovationClaim?: string;
    unmetNeed?: string; comparableDrugs?: string; licensingReadiness?: string;
    ipType?: string; completenessScore?: number;
  }>): Promise<{ updated: number; skipped: number; notFoundIds: number[] }> {
    let updated = 0;
    let skipped = 0;
    const notFoundIds: number[] = [];

    // Build (setObj, id) pairs first — skip rows with no effective writes
    const t = (s?: string) => s?.trim() || undefined;
    const workItems: Array<{ id: number; setObj: Partial<typeof ingestedAssets.$inferInsert> }> = [];
    for (const row of rows) {
      const { id, ...fields } = row;
      const setObj: Partial<typeof ingestedAssets.$inferInsert> = {};
      if (t(fields.assetName)) setObj.assetName = t(fields.assetName);
      if (t(fields.institution)) setObj.institution = t(fields.institution);
      if (t(fields.summary)) setObj.summary = t(fields.summary);
      if (t(fields.abstract)) setObj.abstract = t(fields.abstract);
      if (t(fields.target)) setObj.target = t(fields.target);
      if (t(fields.modality)) setObj.modality = t(fields.modality);
      if (t(fields.indication)) setObj.indication = t(fields.indication);
      if (t(fields.developmentStage)) setObj.developmentStage = t(fields.developmentStage);
      if (fields.categories?.length) setObj.categories = fields.categories;
      if (t(fields.mechanismOfAction)) setObj.mechanismOfAction = t(fields.mechanismOfAction);
      if (t(fields.innovationClaim)) setObj.innovationClaim = t(fields.innovationClaim);
      if (t(fields.unmetNeed)) setObj.unmetNeed = t(fields.unmetNeed);
      if (t(fields.comparableDrugs)) setObj.comparableDrugs = t(fields.comparableDrugs);
      if (t(fields.licensingReadiness)) setObj.licensingReadiness = t(fields.licensingReadiness);
      if (t(fields.ipType)) setObj.ipType = t(fields.ipType);
      if (fields.completenessScore !== undefined) setObj.completenessScore = fields.completenessScore;
      if (Object.keys(setObj).length === 0) { skipped++; continue; }
      workItems.push({ id, setObj });
    }

    // Execute all updates in a single transaction to reduce round-trip overhead
    if (workItems.length > 0) {
      await db.transaction(async (tx) => {
        for (const { id, setObj } of workItems) {
          const result = await tx.update(ingestedAssets).set(setObj).where(eq(ingestedAssets.id, id)).returning({ id: ingestedAssets.id });
          if (result.length > 0) { updated++; } else { skipped++; notFoundIds.push(id); }
        }
      });
    }

    return { updated, skipped, notFoundIds };
  }

  async getIndustryProfileByUserId(userId: string): Promise<IndustryProfileRow | undefined> {
    const [row] = await db.select().from(industryProfiles).where(eq(industryProfiles.userId, userId));
    return row;
  }

  async upsertIndustryProfile(userId: string, data: Omit<IndustryProfileRow, "userId" | "updatedAt" | "orgId" | "subscribedToDigest" | "lastAlertSentAt" | "alertLastAssetId" | "lastViewedAlertsAt">): Promise<IndustryProfileRow> {
    const [row] = await db
      .insert(industryProfiles)
      .values({ userId, ...data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: industryProfiles.userId,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    return row;
  }

  async setIndustryProfileOrg(userId: string, orgId: number | null): Promise<void> {
    await db
      .insert(industryProfiles)
      .values({ userId, orgId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: industryProfiles.userId,
        set: { orgId, updatedAt: new Date() },
      });
  }

  async getAllIndustryProfiles(): Promise<IndustryProfileRow[]> {
    return db.select().from(industryProfiles).orderBy(desc(industryProfiles.updatedAt));
  }

  async getSubscriberMatches(windowHours: number): Promise<SubscriberMatchEntry[]> {
    const assets = await this._getNewRelevantAssets(windowHours);
    const profiles = await this.getAllIndustryProfiles();
    return profiles
      .map((p) => {
        const scored = assets.map((a) => scoreAssetAgainstProfile(a, p));
        const matches = scored.filter((s) => s.score > 0);
        const sorted = matches.sort((a, b) => b.score - a.score);
        return {
          userId: p.userId,
          companyName: p.companyName,
          therapeuticAreas: p.therapeuticAreas,
          modalities: p.modalities,
          dealStages: p.dealStages,
          totalMatches: matches.length,
          top5AssetIds: sorted.slice(0, 5).map((s) => s.assetId),
        };
      })
      .sort((a, b) => b.totalMatches - a.totalMatches);
  }

  async getSubscriberSuggestions(userId: string, windowHours: number): Promise<AssetSuggestion[]> {
    const profile = await this.getIndustryProfileByUserId(userId);
    const assets = await this._getNewRelevantAssets(windowHours);
    if (!profile) {
      return assets.map((a) => ({ ...a, score: 0, matchedFields: [] }));
    }
    return assets
      .map((a) => {
        const { score, matchedFields } = scoreAssetAgainstProfile(a, profile);
        return { ...a, score, matchedFields };
      })
      .sort((a, b) => b.score - a.score);
  }

  async getAlertSubscribers(): Promise<IndustryProfileRow[]> {
    return db.select().from(industryProfiles).where(eq(industryProfiles.subscribedToDigest, true));
  }

  async updateAlertState(userId: string, lastAlertSentAt: Date, alertLastAssetId: number): Promise<void> {
    await db
      .update(industryProfiles)
      .set({ lastAlertSentAt, alertLastAssetId })
      .where(eq(industryProfiles.userId, userId));
  }

  async setIndustryProfileSubscription(userId: string, subscribedToDigest: boolean): Promise<void> {
    await db
      .insert(industryProfiles)
      .values({ userId, subscribedToDigest, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: industryProfiles.userId,
        set: { subscribedToDigest, updatedAt: new Date() },
      });
  }

  async getWindowAssetSummary(windowHours: number): Promise<{ totalCount: number; top5Ids: number[] }> {
    const assets = await this._getNewRelevantAssets(windowHours);
    return { totalCount: assets.length, top5Ids: assets.slice(0, 5).map((a) => a.id) };
  }

  async getAllInstitutionNames(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ institution: ingestedAssets.institution })
      .from(ingestedAssets)
      .where(and(
        eq(ingestedAssets.relevant, true),
        isNotNull(ingestedAssets.institution),
      ))
      .orderBy(ingestedAssets.institution);
    return rows
      .map((r) => r.institution)
      .filter((n): n is string => !!n && n.trim().length > 0)
      .sort((a, b) => a.localeCompare(b));
  }

  private async _getNewRelevantAssets(windowHours: number): Promise<Omit<AssetSuggestion, "score" | "matchedFields">[]> {
    const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000);
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
        categories: ingestedAssets.categories,
      })
      .from(ingestedAssets)
      .where(and(
        eq(ingestedAssets.relevant, true),
        gte(ingestedAssets.firstSeenAt, cutoff),
      ))
      .orderBy(desc(ingestedAssets.firstSeenAt))
      .limit(500);
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
      _categories: r.categories ?? [],
    }));
  }

  // ── Organizations ────────────────────────────────────────────────────────────

  async getAllOrganizations(): Promise<Organization[]> {
    return db.select().from(organizations).orderBy(organizations.name);
  }

  async getOrganization(id: number): Promise<Organization | undefined> {
    const [row] = await db.select().from(organizations).where(eq(organizations.id, id));
    return row;
  }

  async createOrganization(data: InsertOrganization): Promise<Organization> {
    const [row] = await db.insert(organizations).values({ ...data, updatedAt: new Date() }).returning();
    return row;
  }

  async updateOrganization(id: number, data: Partial<InsertOrganization>): Promise<Organization | undefined> {
    const [row] = await db
      .update(organizations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();
    return row;
  }

  async deleteOrganization(id: number): Promise<void> {
    await db.delete(organizations).where(eq(organizations.id, id));
  }

  async getOrgByStripeCustomer(stripeCustomerId: string): Promise<Organization | undefined> {
    const [row] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.stripeCustomerId, stripeCustomerId))
      .limit(1);
    return row;
  }

  async getOrgByStripeSubscriptionId(stripeSubscriptionId: string): Promise<Organization | undefined> {
    const [row] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.stripeSubscriptionId, stripeSubscriptionId))
      .limit(1);
    return row;
  }

  async claimOrgsForTrialReminder(windowHours: number): Promise<Organization[]> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowHours * 60 * 60 * 1000);
    // Atomic UPDATE … RETURNING: claims all eligible orgs in a single statement.
    // Any concurrent worker will find trialReminderSentAt already set and skip them,
    // eliminating the race window present in a separate SELECT then UPDATE.
    return db
      .update(organizations)
      .set({ trialReminderSentAt: now })
      .where(
        and(
          eq(organizations.stripeStatus, "trialing"),
          gt(organizations.stripeCurrentPeriodEnd, now),
          lte(organizations.stripeCurrentPeriodEnd, windowEnd),
          isNull(organizations.trialReminderSentAt),
        ),
      )
      .returning();
  }

  async applyStripeSubscription(
    orgId: number,
    data: { stripeCustomerId: string; stripeSubscriptionId: string; stripeStatus: string; stripePriceId: string; planTier: string; seatLimit?: number; stripeCurrentPeriodEnd?: Date | null; stripeCancelAt?: Date | null },
    eventType: string = "subscription_updated",
  ): Promise<Organization | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      const [row] = await tx
        .update(organizations)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(organizations.id, orgId))
        .returning();
      if (row) {
        await tx.insert(stripeBillingEvents).values({
          orgId,
          stripeSubscriptionId: data.stripeSubscriptionId || null,
          eventType,
          oldPriceId: existing?.stripePriceId ?? null,
          newPriceId: data.stripePriceId || null,
          oldPlanTier: existing?.planTier ?? null,
          newPlanTier: data.planTier || null,
          stripeStatus: data.stripeStatus || null,
        });
      }
      return row;
    });
  }

  async logBillingEvent(data: InsertStripeBillingEvent): Promise<StripeBillingEvent> {
    const [row] = await db.insert(stripeBillingEvents).values(data).returning();
    return row;
  }

  async getBillingHistory(orgId: number): Promise<StripeBillingEvent[]> {
    return db
      .select()
      .from(stripeBillingEvents)
      .where(eq(stripeBillingEvents.orgId, orgId))
      .orderBy(desc(stripeBillingEvents.createdAt));
  }

  async markWelcomeEmailSent(orgId: number, subId: string): Promise<boolean> {
    const rows = await db
      .update(organizations)
      .set({ welcomeEmailSentSubId: subId, updatedAt: new Date() })
      .where(and(
        eq(organizations.id, orgId),
        sql`welcome_email_sent_sub_id IS DISTINCT FROM ${subId}`,
      ))
      .returning({ id: organizations.id });
    return rows.length > 0;
  }

  async releaseWelcomeEmailClaim(orgId: number, subId: string): Promise<void> {
    await db
      .update(organizations)
      .set({ welcomeEmailSentSubId: null, updatedAt: new Date() })
      .where(and(
        eq(organizations.id, orgId),
        eq(organizations.welcomeEmailSentSubId, subId),
      ));
  }

  async markPaymentFailedEmailSent(orgId: number, invId: string): Promise<boolean> {
    const rows = await db
      .update(organizations)
      .set({ paymentFailedEmailSentInvId: invId, updatedAt: new Date() })
      .where(and(
        eq(organizations.id, orgId),
        sql`payment_failed_email_sent_inv_id IS DISTINCT FROM ${invId}`,
      ))
      .returning({ id: organizations.id });
    return rows.length > 0;
  }

  async releasePaymentFailedEmailClaim(orgId: number, invId: string): Promise<void> {
    await db
      .update(organizations)
      .set({ paymentFailedEmailSentInvId: null, updatedAt: new Date() })
      .where(and(
        eq(organizations.id, orgId),
        eq(organizations.paymentFailedEmailSentInvId, invId),
      ));
  }

  // ── Org Members ──────────────────────────────────────────────────────────────

  async getOrgMembers(orgId: number): Promise<OrgMember[]> {
    return db.select().from(orgMembers).where(eq(orgMembers.orgId, orgId)).orderBy(orgMembers.joinedAt);
  }

  async getOrgMemberCount(orgId: number): Promise<number> {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orgMembers)
      .where(eq(orgMembers.orgId, orgId));
    return count;
  }

  async addOrgMember(data: InsertOrgMember): Promise<OrgMember> {
    const [row] = await db.insert(orgMembers).values(data).returning();
    return row;
  }

  async removeOrgMember(orgId: number, userId: string): Promise<void> {
    await db.delete(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
    await this.setIndustryProfileOrg(userId, null);
  }

  async deleteUserAccount(userId: string): Promise<void> {
    await db.delete(orgMembers).where(eq(orgMembers.userId, userId));
    await db.delete(industryProfiles).where(eq(industryProfiles.userId, userId));
  }

  async updateOrgMemberRole(orgId: number, userId: string, role: string): Promise<void> {
    await db
      .update(orgMembers)
      .set({ role })
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
  }

  async updateOrgMemberInviteStatus(orgId: number, userId: string, status: string): Promise<void> {
    await db
      .update(orgMembers)
      .set({ inviteStatus: status })
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
  }

  async getOrgForUser(userId: string): Promise<Organization | undefined> {
    const [profile] = await db
      .select({ orgId: industryProfiles.orgId })
      .from(industryProfiles)
      .where(eq(industryProfiles.userId, userId))
      .limit(1);
    if (!profile?.orgId) return undefined;
    return this.getOrganization(profile.orgId);
  }

  async getOrgPlanByMembership(userId: string): Promise<{ plan: string; orgName: string; stripeStatus: string | null; stripeCurrentPeriodEnd: Date | null } | null> {
    const [row] = await db
      .select({
        plan: organizations.planTier,
        orgName: organizations.name,
        stripeStatus: organizations.stripeStatus,
        stripeCurrentPeriodEnd: organizations.stripeCurrentPeriodEnd,
      })
      .from(orgMembers)
      .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
      .where(eq(orgMembers.userId, userId))
      .limit(1);
    return row ?? null;
  }

  async createSharedLink(data: { type: string; entityId?: string; payload: Record<string, unknown>; createdBy?: string; expiresAt: Date; passwordHash?: string }): Promise<SharedLink> {
    const [row] = await db.insert(sharedLinks).values({
      type: data.type,
      entityId: data.entityId ?? null,
      payload: data.payload,
      createdBy: data.createdBy ?? null,
      expiresAt: data.expiresAt,
      passwordHash: data.passwordHash ?? null,
    }).returning();
    return row;
  }

  async getSharedLinkByToken(token: string): Promise<SharedLink | undefined> {
    const [row] = await db.select().from(sharedLinks).where(eq(sharedLinks.token, token)).limit(1);
    return row;
  }

  async getOrgMemberByUserId(orgId: number, userId: string): Promise<OrgMember | undefined> {
    const [row] = await db
      .select()
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
      .limit(1);
    return row;
  }

  async createTeamActivity(data: InsertTeamActivity): Promise<TeamActivity> {
    const [row] = await db.insert(teamActivities).values(data).returning();
    return row;
  }

  async getTeamActivities(orgId: number, limit = 20): Promise<TeamActivity[]> {
    return db
      .select()
      .from(teamActivities)
      .where(eq(teamActivities.orgId, orgId))
      .orderBy(desc(teamActivities.createdAt))
      .limit(limit);
  }

  async createSavedReport(data: InsertSavedReport): Promise<SavedReport> {
    const [row] = await db
      .insert(savedReports)
      .values({
        ...data,
        assetsJson: (data.assetsJson ?? []) as unknown as Record<string, unknown>[],
        reportJson: (data.reportJson ?? {}) as unknown as Record<string, unknown>,
      })
      .returning();
    return row;
  }

  async getSavedReports(userId: string): Promise<SavedReport[]> {
    return db
      .select()
      .from(savedReports)
      .where(eq(savedReports.userId, userId))
      .orderBy(desc(savedReports.createdAt));
  }

  async deleteSavedReport(id: number, userId: string): Promise<void> {
    await db
      .delete(savedReports)
      .where(and(eq(savedReports.id, id), eq(savedReports.userId, userId)));
  }
}

function scoreAssetAgainstProfile(
  asset: { id: number; indication: string; modality: string; target: string; developmentStage: string; _categories?: string[] },
  profile: { therapeuticAreas: string[]; modalities: string[]; dealStages: string[] }
): { assetId: number; score: number; matchedFields: string[] } {
  let score = 0;
  const matchedFields: string[] = [];
  const assetText = `${asset.indication} ${asset.target} ${(asset._categories ?? []).join(" ")}`.toLowerCase();
  for (const area of profile.therapeuticAreas) {
    if (assetText.includes(area.toLowerCase())) {
      score += 3;
      matchedFields.push(area);
    }
  }
  const assetModality = asset.modality.toLowerCase();
  for (const mod of profile.modalities) {
    const modL = mod.toLowerCase();
    if (assetModality.includes(modL) || modL.includes(assetModality)) {
      score += 2;
      matchedFields.push(mod);
      break;
    }
  }
  const assetStage = asset.developmentStage.toLowerCase();
  for (const stage of profile.dealStages) {
    if (assetStage.includes(stage.toLowerCase()) || stage.toLowerCase().includes(assetStage)) {
      score += 1;
      matchedFields.push(stage);
      break;
    }
  }
  return { assetId: asset.id, score, matchedFields };
}

export const storage = new DatabaseStorage();
