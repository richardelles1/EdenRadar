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
let scrapingProgress = { done: 0, total: 0, found: 0 };

export function isIngestionRunning(): boolean {
  return ingestionRunning;
}

export function getEnrichingCount(): number {
  return enrichingCount;
}

export function getScrapingProgress(): { done: number; total: number; found: number } {
  return { ...scrapingProgress };
}

export async function runIngestionPipeline(): Promise<IngestionResult> {
  if (ingestionRunning) {
    console.log("[ingestion] Already running, skipping.");
    const lastRun = await storage.getLastIngestionRun();
    return { totalFound: lastRun?.totalFound ?? 0, newCount: lastRun?.newCount ?? 0, runId: lastRun?.id ?? 0 };
  }

  ingestionRunning = true;
  scrapingProgress = { done: 0, total: 0, found: 0 };
  const run = await storage.createIngestionRun();
  console.log(`[ingestion] Run #${run.id} started`);

  try {
    const listings = await runAllScrapers((done, total, found) => {
      scrapingProgress = { done, total, found };
    });
    console.log(`[ingestion] Scraped ${listings.length} total listings`);

    let newCount = 0;
    const newAssets: { id: number; assetName: string }[] = [];

    for (const listing of listings) {
      if (!listing.title || !listing.institution) continue;
      const fingerprint = makeFingerprint(listing.title, listing.institution);
      try {
        const { asset, isNew } = await storage.upsertIngestedAsset(fingerprint, {
          assetName: listing.title,
          institution: listing.institution,
          summary: listing.description || listing.title,
          sourceUrl: listing.url || null,
          sourceType: "tech_transfer",
          developmentStage: listing.stage ?? "unknown",
          runId: run.id,
        });
        if (isNew) {
          newCount++;
          newAssets.push({ id: asset.id, assetName: asset.assetName });
        }
      } catch (err: any) {
        console.error(`[ingestion] Failed to upsert asset "${listing.title}": ${err?.message}`);
      }
    }

    // Mark run completed BEFORE enrichment so UI unlocks immediately
    await storage.updateIngestionRun(run.id, {
      status: "completed",
      totalFound: listings.length,
      newCount,
    });

    console.log(`[ingestion] Run #${run.id} complete: ${listings.length} found, ${newCount} new`);

    scrapingProgress = { done: 0, total: 0, found: 0 };
    ingestionRunning = false;

    // Enrich in background — non-blocking
    if (newAssets.length > 0) {
      enrichingCount = newAssets.length;
      console.log(`[ingestion] Enriching ${newAssets.length} new assets with AI (irrelevant assets will be removed)...`);

      enrichBatch(newAssets, 25).then(async (enrichments) => {
        let enrichedCount = 0;
        let removedCount = 0;
        const enrichmentEntries = Array.from(enrichments.entries());
        for (const [id, data] of enrichmentEntries) {
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
        }
        enrichingCount = 0;
        console.log(`[ingestion] Enrichment complete: ${enrichedCount} relevant assets kept, ${removedCount} non-biotech assets removed`);
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
  }
}
