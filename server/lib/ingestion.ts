import { storage } from "../storage";
import { runAllScrapers, ALL_SCRAPERS } from "./scrapers/index";
import { enrichBatch } from "./scrapers/enrichAsset";
import { syncStaging, type SyncStagingRow } from "@shared/schema";
import { db } from "../db";
import { eq, and } from "drizzle-orm";

export function makeFingerprint(title: string, institution: string): string {
  return `${title.toLowerCase().trim()}|${institution.toLowerCase().trim()}`;
}

export interface IngestionResult {
  totalFound: number;
  newCount: number;
  runId: number;
}

let ingestionRunning = false;
let enrichingCount = 0;
let scrapingProgress = { done: 0, total: 0, found: 0, active: [] as string[] };
let upsertProgress = { done: 0, total: 0 };

export function isIngestionRunning(): boolean {
  return ingestionRunning;
}

export function getEnrichingCount(): number {
  return enrichingCount;
}

export function getScrapingProgress(): { done: number; total: number; found: number; active: string[] } {
  return { ...scrapingProgress };
}

export function getUpsertProgress(): { done: number; total: number } {
  return { ...upsertProgress };
}

export async function runIngestionPipeline(): Promise<IngestionResult> {
  if (ingestionRunning || enrichingCount > 0) {
    console.log("[ingestion] Already running or enrichment in progress, skipping.");
    const lastRun = await storage.getLastIngestionRun();
    return { totalFound: lastRun?.totalFound ?? 0, newCount: lastRun?.newCount ?? 0, runId: lastRun?.id ?? 0 };
  }
  if (syncRunning) {
    console.log(`[ingestion] Institution sync running for ${syncInstitution}, skipping full ingestion.`);
    const lastRun = await storage.getLastIngestionRun();
    return { totalFound: lastRun?.totalFound ?? 0, newCount: lastRun?.newCount ?? 0, runId: lastRun?.id ?? 0 };
  }

  ingestionRunning = true;
  scrapingProgress = { done: 0, total: 0, found: 0, active: [] };
  upsertProgress = { done: 0, total: 0 };
  const run = await storage.createIngestionRun();
  console.log(`[ingestion] Run #${run.id} started`);

  try {
    const listings = await runAllScrapers((done, total, found, active) => {
      scrapingProgress = { done, total, found, active };
    });
    console.log(`[ingestion] Scraped ${listings.length} total listings`);

    // Build deduplicated listing records for bulk upsert
    const seen = new Set<string>();
    const toUpsert = listings
      .filter((l) => l.title && l.institution)
      .map((l) => ({
        fingerprint: makeFingerprint(l.title, l.institution),
        assetName: l.title,
        institution: l.institution,
        summary: l.description || l.title,
        sourceUrl: l.url || null,
        sourceType: "tech_transfer" as const,
        developmentStage: l.stage ?? "unknown",
        runId: run.id,
      }))
      .filter((l) => {
        if (seen.has(l.fingerprint)) return false;
        seen.add(l.fingerprint);
        return true;
      });

    upsertProgress = { done: 0, total: toUpsert.length };
    console.log(`[ingestion] Saving ${toUpsert.length} unique listings to database...`);

    const { newAssets, totalProcessed } = await storage.bulkUpsertIngestedAssets(toUpsert, (done, total) => {
      upsertProgress = { done, total };
    });

    const newCount = newAssets.length;
    console.log(`[ingestion] Saved ${totalProcessed} listings (${newCount} new)`);

    const instCounts: Record<string, number> = {};
    for (const l of toUpsert) {
      instCounts[l.institution] = (instCounts[l.institution] ?? 0) + 1;
    }
    await storage.recordScanCounts(run.id, instCounts);
    console.log(`[ingestion] Recorded scan counts for ${Object.keys(instCounts).length} institutions`);

    await storage.updateIngestionRun(run.id, {
      status: "completed",
      totalFound: listings.length,
      newCount,
    });

    console.log(`[ingestion] Run #${run.id} complete: ${listings.length} found, ${newCount} new`);

    scrapingProgress = { done: 0, total: 0, found: 0, active: [] };
    upsertProgress = { done: 0, total: 0 };
    ingestionRunning = false;

    if (newAssets.length > 0) {
      enrichingCount = newAssets.length;
      console.log(`[ingestion] Enriching ${newAssets.length} new assets with AI (concurrency: 50)...`);

      let enrichedCount = 0;
      let removedCount = 0;

      enrichBatch(newAssets, 50, async (id, data) => {
        try {
          if (!data.biotechRelevant) {
            await storage.deleteIngestedAsset(id);
            removedCount++;
          } else {
            await storage.updateIngestedAssetEnrichment(id, data);
            enrichedCount++;
          }
        } catch (err: any) {
          console.error(`[ingestion] Enrichment update failed for id ${id}: ${err?.message}`);
        }
        enrichingCount = Math.max(0, enrichingCount - 1);
      }).then(async () => {
        enrichingCount = 0;
        console.log(`[ingestion] Enrichment complete: ${enrichedCount} relevant, ${removedCount} removed`);
        try {
          await storage.updateIngestionRun(run.id, { relevantNewCount: enrichedCount });
        } catch (err: any) {
          console.error(`[ingestion] Failed to update relevantNewCount: ${err?.message}`);
        }
      }).catch((err: any) => {
        enrichingCount = 0;
        console.error(`[ingestion] Enrichment batch failed: ${err?.message}`);
      });
    }

    return { totalFound: listings.length, newCount, runId: run.id };
  } catch (err: any) {
    console.error(`[ingestion] Run #${run.id} failed:`, err);
    await storage.updateIngestionRun(run.id, {
      status: "failed",
      errorMessage: err?.message ?? "Unknown error",
    });
    return { totalFound: 0, newCount: 0, runId: run.id };
  } finally {
    ingestionRunning = false;
    scrapingProgress = { done: 0, total: 0, found: 0, active: [] };
    upsertProgress = { done: 0, total: 0 };
  }
}

let syncRunning = false;
let syncInstitution: string | null = null;

export function isSyncRunning(): boolean {
  return syncRunning;
}

export function getSyncRunningFor(): string | null {
  return syncInstitution;
}

export function tryAcquireSyncLock(institution: string): boolean {
  if (ingestionRunning || syncRunning) return false;
  syncRunning = true;
  syncInstitution = institution;
  return true;
}

export interface SyncResult {
  sessionId: string;
  rawCount: number;
  newCount: number;
  relevantCount: number;
}

export async function runInstitutionSync(institutionName: string, providedSessionId?: string): Promise<SyncResult> {
  if (ingestionRunning) throw new Error("Full ingestion is running — cannot sync");

  const alreadyLocked = syncRunning && syncInstitution === institutionName;
  if (syncRunning && !alreadyLocked) throw new Error(`Sync already running for ${syncInstitution}`);

  const scraper = ALL_SCRAPERS.find((s) => s.institution === institutionName);
  if (!scraper) throw new Error(`No scraper found for institution: ${institutionName}`);

  if (!alreadyLocked) {
    syncRunning = true;
    syncInstitution = institutionName;
  }

  const sessionId = providedSessionId ?? crypto.randomUUID();

  try {
    const currentIndexed = await storage.getInstitutionIndexedCount(institutionName);
    const session = await storage.createSyncSession(sessionId, institutionName, currentIndexed);

    console.log(`[sync] ${institutionName}: starting sync (${currentIndexed} currently indexed)...`);

    const SCRAPER_TIMEOUT_MS = 5 * 60 * 1000;
    let listings;
    try {
      listings = await Promise.race([
        scraper.scrape(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("scraper timeout (5 min)")), SCRAPER_TIMEOUT_MS)
        ),
      ]);
    } catch (err: any) {
      console.error(`[sync] ${institutionName}: scrape failed — ${err?.message}`);
      await storage.updateSyncSession(sessionId, {
        status: "failed",
        phase: "done",
        completedAt: new Date(),
      });
      throw new Error(`Scraper failed: ${err?.message}`);
    }

    const rawCount = listings.length;
    console.log(`[sync] ${institutionName}: scraped ${rawCount} raw listings`);

    await storage.updateSyncSession(sessionId, { rawCount, phase: "comparing" });

    const existingFps = await storage.getExistingFingerprints(institutionName);

    const seen = new Set<string>();
    const stagingRows: Array<Omit<SyncStagingRow, "id" | "createdAt">> = [];
    for (const l of listings) {
      if (!l.title || !l.institution) continue;
      const fp = makeFingerprint(l.title, l.institution);
      if (seen.has(fp)) continue;
      seen.add(fp);
      const isNew = !existingFps.has(fp);
      stagingRows.push({
        sessionId,
        institution: institutionName,
        fingerprint: fp,
        assetName: l.title,
        sourceUrl: l.url || null,
        summary: l.description || l.title,
        isNew,
        relevant: null,
        target: "unknown",
        modality: "unknown",
        indication: "unknown",
        developmentStage: l.stage ?? "unknown",
        status: "scraped",
      });
    }

    await storage.insertSyncStagingBatch(stagingRows);

    const newRows = stagingRows.filter((r) => r.isNew);
    const newCount = newRows.length;

    await storage.updateSyncSession(sessionId, {
      newCount,
      phase: "enriching",
    });

    console.log(`[sync] ${institutionName}: ${newCount} new out of ${stagingRows.length} unique — enriching new items...`);

    let relevantCount = 0;

    if (newCount > 0) {
      const toEnrich = newRows.map((r, i) => ({ id: i, assetName: r.assetName }));
      const enrichResults = await enrichBatch(toEnrich, 30);

      const enrichUpdates: Array<{ fingerprint: string; enrichment: { biotechRelevant: boolean; target: string; modality: string; indication: string; developmentStage: string } }> = [];
      for (const [idx, enrichment] of enrichResults) {
        const row = newRows[idx];
        enrichUpdates.push({
          fingerprint: row.fingerprint,
          enrichment: {
            biotechRelevant: enrichment.biotechRelevant ?? false,
            target: enrichment.target ?? "unknown",
            modality: enrichment.modality ?? "unknown",
            indication: enrichment.indication ?? "unknown",
            developmentStage: enrichment.developmentStage ?? "unknown",
          },
        });
        if (enrichment.biotechRelevant) relevantCount++;
      }

      for (const { fingerprint, enrichment: e } of enrichUpdates) {
        await db
          .update(syncStaging)
          .set({
            relevant: e.biotechRelevant,
            target: e.target,
            modality: e.modality,
            indication: e.indication,
            developmentStage: e.developmentStage,
          })
          .where(and(
            eq(syncStaging.sessionId, sessionId),
            eq(syncStaging.fingerprint, fingerprint)
          ));
      }
    }

    const now = new Date();
    await storage.updateSyncSession(sessionId, {
      relevantCount,
      status: "enriched",
      phase: "done",
      completedAt: now,
      lastRefreshedAt: now,
    });

    console.log(`[sync] ${institutionName}: sync complete — ${rawCount} raw, ${newCount} new, ${relevantCount} relevant`);

    return { sessionId, rawCount, newCount, relevantCount };
  } catch (err: any) {
    if (!(await storage.getSyncSession(sessionId))?.completedAt) {
      await storage.updateSyncSession(sessionId, {
        status: "failed",
        phase: "done",
        completedAt: new Date(),
      }).catch(() => {});
    }
    throw err;
  } finally {
    syncRunning = false;
    syncInstitution = null;
  }
}
