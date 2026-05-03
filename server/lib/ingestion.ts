// ── LLM pipeline overview ──────────────────────────────────────────────────
//
// This module is the primary orchestrator for all AI calls in the data pipeline.
// There are exactly FOUR LLM call-sites; each is documented with its model, cost
// tier, and trigger condition.
//
// PATH 1 — Staging pre-filter  (gpt-4o-mini, CHEAP)
//   Location : relevancePreFilter.ts :: preFilterBatch()
//   Trigger  : Called from runIngestionPipeline() on the raw scraper output
//              BEFORE any data is written to the database.
//   Purpose  : Coarse binary gate — removes obviously non-biotech listings
//              (IT software, administrative posts, real-estate, etc.).
//   Cost     : ~$0.00002 / asset (mini-tier, single yes/no classification).
//
// PATH 2 — Ingestion classifier  (gpt-4o-mini, CHEAP)
//   Location : classifyAsset.ts :: classifyBatch()
//   Trigger  : Called inside runIngestionPipeline() for ONLY the net-new assets
//              returned by bulkUpsertIngestedAssets (i.e. assets not yet in DB).
//   Purpose  : Enriches new assets with target, modality, indication,
//              developmentStage, biotechRelevant flag, and completenessScore.
//              Marks irrelevant assets so fingerprints are retained and the asset
//              is never re-discovered and re-enriched on subsequent scans.
//   Cost     : ~$0.00005 / asset (mini-tier, structured extraction).
//
// PATH 3a — Re-enrich unknowns  (gpt-4o-mini, CHEAP)
//   Location : enrichAsset.ts :: reEnrichAsset()
//   Trigger  : Admin POST /api/admin/standard-enrich — targets existing assets
//              where at least one of target/modality/indication/developmentStage
//              is still "unknown", attempting to fill those fields with a fresh call.
//   Purpose  : Targeted field-fill for sparsely-enriched corpus assets without
//              touching fields that already have non-unknown values.
//   Cost     : ~$0.00005 / asset (mini-tier, targeted field extraction).
//
// PATH 3b — Sync enrichment  (gpt-4o-mini, CHEAP)
//   Location : enrichAsset.ts :: enrichBatch()
//   Trigger  : Called inside runInstitutionSync() for net-new staging rows only.
//   Purpose  : Lightweight relevance + field extraction for the sync preview
//              (shown in the sync panel before the operator pushes to the index).
//   Cost     : ~$0.00005 / asset (mini-tier, same structured extraction).
//
// PATH 4 — Deep enrichment  (gpt-4o, EXPENSIVE)
//   Location : deepEnrichBatch.ts :: deepEnrichBatch()
//   Trigger  : Manually triggered by the operator via POST /api/admin/eden/enrich.
//              Only selects assets in one of three finite buckets:
//              (A) enrichedAt IS NULL — fresh inserts and content-change resets,
//              (B) completenessScore IS NULL AND enrichedAt IS NOT NULL — legacy,
//              (C) completenessScore < 15 AND enrichedAt IS NOT NULL AND
//                  deepEnrichAttempts <= 1 — low-score, at most one retry.
//              Every deep-enrich write increments deepEnrichAttempts (0→1).
//              After the first pass deepEnrichAttempts = 1, satisfying <= 1,
//              so an asset with score < 15 enters bucket C for exactly ONE
//              retry.  The retry increments to 2, permanently exiting bucket C.
//              Total: at most 2 GPT-4o calls per asset lifetime.
//              Content-change resets enrichedAt to NULL AND deepEnrichAttempts
//              to 0, restarting the two-pass lifecycle for new content.
//   Purpose  : Extracts MoA, innovationClaim, unmetNeed, comparableDrugs,
//              licensingReadiness, ipType, and overwrites the mini-tier fields
//              with higher-fidelity extraction.
//   Cost     : ~$0.01 / asset (4o-tier, full structured extraction with context).
//
// ────────────────────────────────────────────────────────────────────────────

import { storage } from "../storage";
import { runAllScrapers, ALL_SCRAPERS, type ScrapedListing } from "./scrapers/index";
import { enrichBatch } from "./scrapers/enrichAsset";
import { preFilterBatch } from "./pipeline/relevancePreFilter";
import { activePreFilterBatch } from "./pipeline/relevanceClassifier";
import { classifyBatch, type AssetClassification } from "./pipeline/classifyAsset";
import { computeContentHash, computeCompletenessScore, normalizeLicensingStatus, normalizePatentStatus } from "./pipeline/contentHash";
import { syncStaging, type SyncStagingRow } from "@shared/schema";
import { scraperDb as db } from "../scraperDb";
import { eq, and, sql } from "drizzle-orm";

export function normalizeTitle(title: string): string {
  let t = title.toLowerCase().trim();
  t = t.replace(/^(a|an|the)\s+/i, "");
  t = t.replace(/[^\w\s]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

export function makeFingerprint(title: string, institution: string): string {
  return `${normalizeTitle(title)}|${institution.toLowerCase().trim()}`;
}

export function normalizeSourceUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.replace(/[?#].*$/, "");
  }
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

    const { passed, rejected, ambiguous, variant } = activePreFilterBatch(listings);
    console.log(`[ingestion] Pre-filter (${variant}): ${passed.length} passed, ${rejected.length} rejected, ${ambiguous.length} ambiguous`);

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
          sourceUrl: normalizeSourceUrl(l.url),
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

    // Flag newly-ingested assets whose description is too short to enrich reliably.
    // This runs synchronously so data_sparse is set before classification begins.
    try {
      const sparseCount = await storage.flagDataSparse();
      if (sparseCount > 0) console.log(`[ingestion] Flagged ${sparseCount} sparse assets (description < 150 chars)`);
    } catch (err: any) {
      console.error(`[ingestion] flagDataSparse failed: ${err?.message}`);
    }

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
          return {
            id: a.id,
            title: a.assetName,
            description: orig?.summary || a.assetName,
            abstract: orig?.abstract || undefined,
            ctx: {
              categories: orig?.categories ?? null,
              patentStatus: orig?.patentStatus ?? null,
              licensingStatus: orig?.licensingStatus ?? null,
              inventors: orig?.inventors ?? null,
              sourceUrl: orig?.sourceUrl ?? null,
            },
          };
        }),
        30,
        async (id, classification) => {
          const orig = newAssets.find((na) => na.id === id);
          const origData = orig ? upsertLookup.get(orig.fingerprint) : undefined;
          try {
            if (!classification.biotechRelevant && classification.categoryConfidence >= 0.7) {
              // Mark as irrelevant rather than deleting — keeps the fingerprint in the DB so
              // future scans don't re-discover and re-enrich this asset endlessly.
              await storage.markAsIrrelevant(id);
              removedCount++;
            } else if (!classification.biotechRelevant) {
              await storage.addToReviewQueue(id, orig?.fingerprint || String(id), "low-confidence non-biotech classification");
              classifiedCount++;
            } else {
              const score = computeCompletenessScore({
                assetClass: classification.assetClass,
                deviceAttributes: classification.deviceAttributes,
                target: classification.target,
                modality: classification.modality,
                indication: classification.indication,
                developmentStage: classification.developmentStage,
                mechanismOfAction: classification.mechanismOfAction,
                innovationClaim: classification.innovationClaim,
                unmetNeed: classification.unmetNeed,
                comparableDrugs: classification.comparableDrugs,
                licensingReadiness: classification.licensingReadiness,
                summary: origData?.summary,
                abstract: origData?.abstract,
                categories: classification.categories,
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

    if (newCount > 0) {
      import("./alertDispatch.js")
        .then(({ runAlertDispatch }) => runAlertDispatch())
        .catch((err) => console.error("[alertDispatch] Background dispatch error:", err));
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
// HTTP/API scrapers allow up to maxHttpConcurrent concurrent instances.

/** Current concurrency cap for HTTP/API syncs (1 = reliable serial, 2 = faster).
 * Default is 1 — matches the "manual trigger" environment where scrapers are
 * proven to complete reliably. Raise to 2 only if cycle time matters more than
 * reliability. Use setConcurrency() to change at runtime. */
let _maxHttpConcurrent = 1;

export function getMaxHttpConcurrent(): number { return _maxHttpConcurrent; }
export function setConcurrency(n: 1 | 2 | 3): void { _maxHttpConcurrent = n; }

/** @deprecated Use getMaxHttpConcurrent() — kept for compatibility with scheduler import */
export const MAX_HTTP_CONCURRENT = 1;

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
    if (activeSyncs.size >= _maxHttpConcurrent) return false;
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
  http: 5 * 60 * 1000,
};
const SCRAPE_RETRY_DELAY_MS = 15_000;
const SCRAPE_MAX_ATTEMPTS = 2;

/** DB/infra error patterns that should never trigger a scrape retry.
 * These originate from the pg pool or auth layer, not from the target site. */
const DB_INFRA_PATTERNS = [
  "pool",
  "during authentication",
  "client checkout timed out",
  "pg:",
  "postgres",
  "too many clients",
  "remaining connection slots",
  "idle-in-transaction",
  "query_canceled",
  "statement timeout",
  "connection refused",
  "socket hang up",
  "network socket disconnected",
  "read econnreset",
  "write econnreset",
];

/** Returns true if a scrape error is likely transient (network/timeout) and worth retrying.
 * Deterministic failures (auth/403/parsing/selector bugs) and DB infra errors are NOT retried.
 * Orchestrator-level timeouts ("scraper timeout (Xs)") are also NOT retried — the scraper
 * already consumed its full time budget; a second attempt would just double the damage. */
function isScrapeRetryable(msg: string): boolean {
  const m = msg.toLowerCase();
  if (DB_INFRA_PATTERNS.some((p) => m.includes(p))) return false;
  if (m.startsWith("scraper timeout")) return false;
  return (
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("econnreset") ||
    m.includes("econnrefused") ||
    m.includes("network") ||
    m.includes("fetch failed") ||
    m.includes("socket hang up") ||
    m.includes("etimedout")
  );
}

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

  const scraperType = (scraper.scraperType === "stub" ? "http" : (scraper.scraperType ?? "http")) as "playwright" | "http" | "api";

  if (!alreadyLocked) {
    if (!tryAcquireSyncLock(institutionName, scraperType)) {
      const first = getSyncRunningFor();
      throw new Error(`Sync lock unavailable — active: ${first ?? "unknown"}`);
    }
  }

  const sessionId = providedSessionId ?? crypto.randomUUID();
  const SCRAPER_TIMEOUT_MS = scraper.scraperTimeoutMs ?? TIMEOUT_BY_TYPE[scraperType] ?? TIMEOUT_BY_TYPE.http;

  try {
    const currentIndexed = await storage.getInstitutionIndexedCount(institutionName);
    const session = await storage.createSyncSession(sessionId, institutionName, currentIndexed);

    console.log(`[sync] ${institutionName}: starting sync (type=${scraperType}, timeout=${Math.round(SCRAPER_TIMEOUT_MS / 1000)}s, ${currentIndexed} currently indexed)...`);

    // Collect known fingerprints + URLs BEFORE running the scraper so that
    // scrapers that accept knownUrls can skip detail-page fetches for already-indexed
    // listings. This dramatically reduces sync time for large-catalog institutions on
    // repeat runs (e.g. OSU: 400+ detail fetches → only truly new ones fetched).
    // Old pending staging rows (not yet pushed) are included so assets already queued
    // from a previous scan are not re-staged as "new" on this scan.
    const { fingerprints: existingFps, sourceUrls: existingUrls } = await storage.getExistingFingerprints(institutionName);
    console.log(`[sync] ${institutionName}: ${existingUrls.size} URLs already indexed (passing to scraper for skip-optimization)`);

    let listings: ScrapedListing[] | undefined;
    let lastScrapeError: Error | null = null;
    for (let attempt = 1; attempt <= SCRAPE_MAX_ATTEMPTS; attempt++) {
      const scrapeController = new AbortController();
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      try {
        listings = await Promise.race([
          scraper.scrape(scrapeController.signal, existingUrls),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              scrapeController.abort();
              reject(new Error(`scraper timeout (${Math.round(SCRAPER_TIMEOUT_MS / 1000)}s)`));
            }, SCRAPER_TIMEOUT_MS);
          }),
        ]);
        scrapeController.abort();
        lastScrapeError = null;
        break;
      } catch (err: any) {
        scrapeController.abort();
        lastScrapeError = err;
        const retryable = attempt < SCRAPE_MAX_ATTEMPTS && isScrapeRetryable(err?.message ?? "");
        if (retryable) {
          console.log(`[sync] ${institutionName}: attempt ${attempt} failed (${err?.message}) — retrying in ${SCRAPE_RETRY_DELAY_MS / 1000}s...`);
          await new Promise((resolve) => setTimeout(resolve, SCRAPE_RETRY_DELAY_MS));
        } else {
          break;
        }
      } finally {
        if (timeoutHandle !== null) clearTimeout(timeoutHandle);
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

    // Step 1: Supersede stale non-enriched staging rows for this institution.
    // Only rows from sessions that are NOT yet in 'enriched' state are cleaned up
    // (e.g. stuck/running/failed sessions from a previous crashed sync).
    // Rows from completed 'enriched' sessions are the Indexing Queue — they are
    // preserved so the user can still push them even after a subsequent sync runs.
    const superseded = await storage.supersedeStagingForInstitution(institutionName);
    if (superseded > 0) {
      console.log(`[sync] ${institutionName}: superseded ${superseded} stale incomplete-session rows`);
    }

    const seen = new Set<string>();
    const stagingRows: Array<Omit<SyncStagingRow, "id" | "createdAt">> = [];
    for (const l of listings) {
      if (!l.title || !l.institution) continue;
      const fp = makeFingerprint(l.title, l.institution);
      if (seen.has(fp)) continue;
      seen.add(fp);
      const normalizedUrl = normalizeSourceUrl(l.url);
      const isNew = !existingFps.has(fp) && !(normalizedUrl && existingUrls.has(normalizedUrl));
      stagingRows.push({
        sessionId,
        institution: institutionName,
        fingerprint: fp,
        assetName: l.title,
        sourceUrl: normalizeSourceUrl(l.url),
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

    // ── Anomaly guard ──────────────────────────────────────────────────────────
    // Detect false-new floods caused by URL-format churn or fingerprint drift
    // (e.g., UC campus NCD URL changes on 2025-03-31). Triggered when an
    // established institution (>100 indexed assets) shows new_count > 60% of its
    // currently-indexed asset count — almost certainly a dedup failure rather than
    // real new assets. Uses ingested_assets count (not staging) as the baseline so
    // the threshold is anchored to committed data, not transient staging rows.
    const ANOMALY_MIN_ESTABLISHED = 100;
    const ANOMALY_NEW_RATIO = 0.60;
    const indexedCount = await storage.getInstitutionIndexedCount(institutionName);
    const isAnomaly =
      indexedCount > ANOMALY_MIN_ESTABLISHED &&
      newCount > indexedCount * ANOMALY_NEW_RATIO;

    if (isAnomaly) {
      const pct = Math.round((newCount / indexedCount) * 100);
      const msg = `Anomaly: ${newCount} new assets = ${pct}% of ${indexedCount} indexed assets — suspected dedup failure. All new rows quarantined.`;
      console.warn(`[sync] ${institutionName}: ANOMALY DETECTED — ${msg}`);
      await storage.quarantineSessionNewRows(sessionId);
      await storage.updateSyncSession(sessionId, {
        status: "anomalous",
        phase: "done",
        completedAt: new Date(),
        errorMessage: msg,
      });
      return { sessionId, rawCount, newCount: 0, relevantCount: 0 };
    }
    // ── End anomaly guard ──────────────────────────────────────────────────────

    await storage.updateSyncSession(sessionId, {
      newCount,
      phase: "enriching",
      lastRefreshedAt: new Date(),
    });

    console.log(`[sync] ${institutionName}: ${newCount} new out of ${stagingRows.length} unique — enriching new items...`);

    let relevantCount = 0;

    if (newCount > 0) {
      const toEnrich = newRows.map((r, i) => ({ id: i, assetName: r.assetName, summary: r.summary }));
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

      if (enrichUpdates.length > 0) {
        const valueRows = sql.join(
          enrichUpdates.map(u =>
            sql`(${u.fingerprint}, ${u.enrichment.biotechRelevant}, ${u.enrichment.target}, ${u.enrichment.modality}, ${u.enrichment.indication}, ${u.enrichment.developmentStage})`
          ),
          sql`, `
        );
        await db.execute(sql`
          UPDATE sync_staging AS ss
          SET
            relevant  = v.relevant::boolean,
            target    = v.target,
            modality  = v.modality,
            indication = v.indication,
            development_stage = v.development_stage
          FROM (VALUES ${valueRows})
            AS v(fingerprint, relevant, target, modality, indication, development_stage)
          WHERE ss.session_id = ${sessionId}
            AND ss.fingerprint = v.fingerprint
        `);
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
