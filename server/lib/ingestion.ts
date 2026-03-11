import { storage } from "../storage";
import { runAllScrapers } from "./scrapers/index";
import { enrichBatch } from "./scrapers/enrichAsset";

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

    // Mark run completed BEFORE enrichment so UI unlocks immediately
    await storage.updateIngestionRun(run.id, {
      status: "completed",
      totalFound: listings.length,
      newCount,
    });

    console.log(`[ingestion] Run #${run.id} complete: ${listings.length} found, ${newCount} new`);

    scrapingProgress = { done: 0, total: 0, found: 0, active: [] };
    upsertProgress = { done: 0, total: 0 };
    ingestionRunning = false;

    // Enrich in background — non-blocking, counter decrements per-asset in real time
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
      }).then(() => {
        enrichingCount = 0;
        console.log(`[ingestion] Enrichment complete: ${enrichedCount} relevant, ${removedCount} removed`);
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
