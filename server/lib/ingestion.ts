import { storage } from "../storage";
import { runAllScrapers, ALL_SCRAPERS, type ScrapedListing } from "./scrapers/index";
import { enrichBatch } from "./scrapers/enrichAsset";
import { preFilterBatch } from "./pipeline/relevancePreFilter";
import { classifyBatch, type AssetClassification } from "./pipeline/classifyAsset";
import { computeContentHash, computeCompletenessScore, normalizeLicensingStatus, normalizePatentStatus } from "./pipeline/contentHash";
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
  if (activeSyncs.size > 0) {
    const first = activeSyncs.keys().next().value;
    console.log(`[ingestion] Institution sync running for ${first}, skipping full ingestion.`);
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

    const { passed, rejected, ambiguous } = preFilterBatch(listings);
    console.log(`[ingestion] Pre-filter: ${passed.length} passed, ${rejected.length} rejected, ${ambiguous.length} ambiguous`);

    const filteredListings = [...passed, ...ambiguous];

    const seen = new Set<string>();
    const toUpsert = filteredListings
      .filter((l) => l.title && l.institution)
      .map((l) => {
        const hash = computeContentHash(l.title, l.description || "", l.abstract);
        return {
          fingerprint: makeFingerprint(l.title, l.institution),
          assetName: l.title,
          institution: l.institution,
          summary: l.description || l.title,
          sourceUrl: l.url || null,
          sourceType: "tech_transfer" as const,
          developmentStage: l.stage ?? "unknown",
          runId: run.id,
          contentHash: hash,
          abstract: l.abstract || null,
          inventors: l.inventors || null,
          patentStatus: normalizePatentStatus(l.patentStatus) || null,
          licensingStatus: normalizeLicensingStatus(l.licensingStatus) || null,
          categories: l.categories || null,
          contactEmail: l.contactEmail || null,
          technologyId: l.technologyId || null,
        };
      })
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
      console.log(`[ingestion] Classifying ${newAssets.length} new assets with AI (concurrency: 30)...`);

      let classifiedCount = 0;
      let removedCount = 0;

      const upsertLookup = new Map(toUpsert.map((u) => [u.fingerprint, u]));
      classifyBatch(
        newAssets.map((a) => {
          const orig = upsertLookup.get(a.fingerprint);
          return { id: a.id, title: a.assetName, description: orig?.summary || a.assetName, abstract: orig?.abstract || undefined };
        }),
        30,
        async (id, classification) => {
          const orig = newAssets.find((na) => na.id === id);
          const origData = orig ? upsertLookup.get(orig.fingerprint) : undefined;
          try {
            if (!classification.biotechRelevant && classification.categoryConfidence >= 0.7) {
              await storage.deleteIngestedAsset(id);
              removedCount++;
            } else if (!classification.biotechRelevant) {
              await storage.addToReviewQueue(id, orig?.fingerprint || String(id), "low-confidence non-biotech classification");
              classifiedCount++;
            } else {
              const score = computeCompletenessScore({
                target: classification.target,
                modality: classification.modality,
                indication: classification.indication,
                developmentStage: classification.developmentStage,
                summary: origData?.summary,
                abstract: origData?.abstract,
                categories: classification.categories,
                innovationClaim: classification.innovationClaim,
                mechanismOfAction: classification.mechanismOfAction,
                inventors: origData?.inventors,
                patentStatus: origData?.patentStatus,
              });
              await storage.updateIngestedAssetEnrichment(id, {
                ...classification,
                completenessScore: score,
              });
              classifiedCount++;
            }
          } catch (err: any) {
            console.error(`[ingestion] Classification failed for id ${id}: ${err?.message}`);
            try {
              await storage.addToReviewQueue(id, orig?.fingerprint || String(id), `classifier error: ${err?.message?.slice(0, 200)}`);
            } catch {}
          }
          enrichingCount = Math.max(0, enrichingCount - 1);
        }
      ).then(async () => {
        enrichingCount = 0;
        console.log(`[ingestion] Classification complete: ${classifiedCount} relevant, ${removedCount} removed`);
        try {
          await storage.updateIngestionRun(run.id, { relevantNewCount: classifiedCount });
        } catch (err: any) {
          console.error(`[ingestion] Failed to update relevantNewCount: ${err?.message}`);
        }
      }).catch((err: any) => {
        enrichingCount = 0;
        console.error(`[ingestion] Classification batch failed: ${err?.message}`);
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

// ── Concurrent sync lock ──────────────────────────────────────────────────────
// Tracks all currently active institution syncs.
// Playwright scrapers require full exclusivity (activeSyncs.size === 0).
// HTTP/API scrapers allow up to MAX_HTTP_CONCURRENT concurrent instances.

const activeSyncs: Map<string, "playwright" | "http" | "api"> = new Map();

function hasPlaywrightSync(): boolean {
  for (const type of activeSyncs.values()) {
    if (type === "playwright") return true;
  }
  return false;
}

export function isSyncRunning(): boolean {
  return activeSyncs.size > 0;
}

export function getSyncRunningFor(): string | null {
  const first = activeSyncs.keys().next();
  return first.done ? null : first.value;
}

export function getActiveSyncs(): string[] {
  return Array.from(activeSyncs.keys());
}

export function tryAcquireSyncLock(institution: string, scraperType: "playwright" | "http" | "api" = "http"): boolean {
  if (ingestionRunning) return false;
  if (activeSyncs.has(institution)) return false;

  if (scraperType === "playwright") {
    if (activeSyncs.size > 0) return false;
  } else {
    if (hasPlaywrightSync()) return false;
    if (activeSyncs.size >= 2) return false;
  }

  activeSyncs.set(institution, scraperType);
  return true;
}

export function releaseSyncLock(institution?: string): void {
  if (institution) {
    activeSyncs.delete(institution);
  } else {
    activeSyncs.clear();
  }
}

const TIMEOUT_BY_TYPE: Record<string, number> = {
  playwright: 12 * 60 * 1000,
  api: 5 * 60 * 1000,
  http: 10 * 60 * 1000,
};
const SCRAPE_RETRY_DELAY_MS = 20_000;
const SCRAPE_MAX_ATTEMPTS = 2;

export interface SyncResult {
  sessionId: string;
  rawCount: number;
  newCount: number;
  relevantCount: number;
}

export async function runInstitutionSync(institutionName: string, providedSessionId?: string): Promise<SyncResult> {
  if (ingestionRunning) throw new Error("Full ingestion is running — cannot sync");

  const alreadyLocked = activeSyncs.has(institutionName);
  if (!alreadyLocked && activeSyncs.size > 0 && hasPlaywrightSync()) {
    throw new Error(`A Playwright sync is running — cannot start concurrent sync`);
  }

  const scraper = ALL_SCRAPERS.find((s) => s.institution === institutionName);
  if (!scraper) throw new Error(`No scraper found for institution: ${institutionName}`);

  const scraperType = scraper.scraperType ?? "http";

  if (!alreadyLocked) {
    if (!tryAcquireSyncLock(institutionName, scraperType)) {
      const first = getSyncRunningFor();
      throw new Error(`Sync lock unavailable — active: ${first ?? "unknown"}`);
    }
  }

  const sessionId = providedSessionId ?? crypto.randomUUID();
  const SCRAPER_TIMEOUT_MS = TIMEOUT_BY_TYPE[scraperType] ?? TIMEOUT_BY_TYPE.http;

  try {
    const currentIndexed = await storage.getInstitutionIndexedCount(institutionName);
    const session = await storage.createSyncSession(sessionId, institutionName, currentIndexed);

    console.log(`[sync] ${institutionName}: starting sync (type=${scraperType}, timeout=${Math.round(SCRAPER_TIMEOUT_MS / 1000)}s, ${currentIndexed} currently indexed)...`);

    let listings: ScrapedListing[] | undefined;
    let lastScrapeError: Error | null = null;
    for (let attempt = 1; attempt <= SCRAPE_MAX_ATTEMPTS; attempt++) {
      try {
        listings = await Promise.race([
          scraper.scrape(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`scraper timeout (${Math.round(SCRAPER_TIMEOUT_MS / 1000)}s)`)), SCRAPER_TIMEOUT_MS)
          ),
        ]);
        lastScrapeError = null;
        break;
      } catch (err: any) {
        lastScrapeError = err;
        if (attempt < SCRAPE_MAX_ATTEMPTS) {
          console.log(`[sync] ${institutionName}: attempt ${attempt} failed (${err?.message}) — retrying in ${SCRAPE_RETRY_DELAY_MS / 1000}s...`);
          await new Promise((resolve) => setTimeout(resolve, SCRAPE_RETRY_DELAY_MS));
        }
      }
    }
    if (lastScrapeError || !listings) {
      const errMsg = lastScrapeError?.message ?? "Unknown scraper error";
      console.log(`[sync] ${institutionName}: scrape failed after ${SCRAPE_MAX_ATTEMPTS} attempt(s) — ${errMsg}`);
      await storage.updateSyncSession(sessionId, {
        status: "failed",
        phase: "done",
        completedAt: new Date(),
        errorMessage: errMsg,
      });
      throw new Error(`Scraper failed: ${errMsg}`);
    }

    const rawCount: number = listings.length;
    console.log(`[sync] ${institutionName}: scraped ${rawCount} raw listings`);

    await storage.updateSyncSession(sessionId, { rawCount, phase: "comparing", lastRefreshedAt: new Date() });

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
      lastRefreshedAt: new Date(),
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
        errorMessage: err?.message ?? "Unknown error",
      }).catch(() => {});
    }
    throw err;
  } finally {
    activeSyncs.delete(institutionName);
  }
}
