/**
 * Targeted mini-enrichment for priority institutions.
 * Mirrors the runEnrichmentWorker logic in routes.ts exactly — same
 * buildEnrichWhere criteria, same classifyAsset call, same non-downgrade
 * write guard in updateIngestedAssetEnrichment.
 *
 * Institutions processed in order (highest queue count first):
 *   1. TechLink (VA Technology Transfer)   — 339 eligible
 *   2. Washington University in St. Louis  — 244 eligible
 *   3. KAIST                               — 135 eligible
 *   4. UC Irvine                           — 132 eligible
 *   5. Columbia University                 —  21 eligible
 *   6. UC Davis                            —   9 eligible
 *   7. University of Cincinnati            —   8 eligible
 *
 * Run: tsx scripts/enrich-priority-institutions.ts
 */

import "dotenv/config";
import { storage } from "../server/storage";
import { classifyAsset } from "../server/lib/pipeline/classifyAsset";
import { computeCompletenessScore } from "../server/lib/pipeline/contentHash";

const CONCURRENCY = 20;
const BATCH_CAP = 9999; // drain all — buildEnrichWhere handles the cap logic

const INSTITUTIONS = [
  "TechLink (VA Technology Transfer)",
  "Washington University in St. Louis",
  "KAIST",
  "UC Irvine",
  "Columbia University",
  "UC Davis",
  "University of Cincinnati",
];

interface RunStats {
  institution: string;
  total: number;
  processed: number;
  improved: number;
  failed: number;
  durationSec: number;
  error?: string;
}

async function processInstitution(institution: string): Promise<RunStats> {
  const start = Date.now();
  const assets = await storage.getMiniEnrichBatch(BATCH_CAP, { institution });

  if (assets.length === 0) {
    return { institution, total: 0, processed: 0, improved: 0, failed: 0, durationSec: 0 };
  }

  console.log(`  → ${assets.length} assets queued`);

  let idx = 0;
  let processed = 0;
  let improved = 0;
  let failed = 0;

  const isKnown = (v: string | null | undefined) =>
    v != null && v !== "" && v !== "unknown";

  async function worker() {
    while (idx < assets.length) {
      const asset = assets[idx++];
      if (!asset) continue;

      try {
        const classification = await classifyAsset(
          asset.assetName,
          asset.summary,
          asset.abstract ?? undefined,
          "gpt-4o-mini",
          false,
          {
            categories: asset.categories,
            patentStatus: asset.patentStatus,
            licensingStatus: asset.licensingStatus,
            inventors: asset.inventors,
            sourceUrl: asset.sourceUrl,
            currentValues: {
              target: asset.target,
              modality: asset.modality,
              indication: asset.indication,
              developmentStage: asset.developmentStage,
            },
          },
        );

        const score = computeCompletenessScore({
          assetClass: classification.assetClass,
          target: classification.target,
          modality: classification.modality,
          indication: classification.indication,
          developmentStage: classification.developmentStage,
          mechanismOfAction: classification.mechanismOfAction,
          innovationClaim: classification.innovationClaim,
          unmetNeed: classification.unmetNeed,
          comparableDrugs: classification.comparableDrugs,
          licensingReadiness: classification.licensingReadiness,
          deviceAttributes: classification.deviceAttributes,
          sourceType: "tech_transfer", // all priority institutions are TTO assets — earns automatic IP credit
          biology: asset.biology,
        });

        await storage.updateIngestedAssetEnrichment(asset.id, {
          ...classification,
          completenessScore: score,
        });

        const wasImproved =
          ((!asset.target || asset.target === "unknown") && isKnown(classification.target)) ||
          ((!asset.modality || asset.modality === "unknown") && isKnown(classification.modality)) ||
          ((!asset.indication || asset.indication === "unknown") && isKnown(classification.indication)) ||
          (asset.developmentStage === "unknown" && isKnown(classification.developmentStage));

        if (wasImproved) improved++;
        await storage.stampEnrichedAt(asset.id);
      } catch (e: any) {
        failed++;
        await storage.incrementMiniEnrichAttempts(asset.id);
      }

      processed++;
      if (processed % 50 === 0) {
        process.stdout.write(`    ${processed}/${assets.length} processed (${improved} improved, ${failed} failed)\r`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, assets.length) }, worker);
  await Promise.all(workers);

  const durationSec = Math.round((Date.now() - start) / 1000);
  return { institution, total: assets.length, processed, improved, failed, durationSec };
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("PRIORITY INSTITUTION ENRICHMENT");
  console.log("═══════════════════════════════════════════════════════════\n");

  const results: RunStats[] = [];

  for (let i = 0; i < INSTITUTIONS.length; i++) {
    const institution = INSTITUTIONS[i];
    console.log(`[${i + 1}/${INSTITUTIONS.length}] ${institution}`);

    try {
      const stats = await processInstitution(institution);
      results.push(stats);
      if (stats.total === 0) {
        console.log(`  → nothing in queue, skipping\n`);
      } else {
        console.log(`  ✓ done in ${stats.durationSec}s — ${stats.improved}/${stats.processed} improved, ${stats.failed} failed\n`);
      }
    } catch (err: any) {
      console.error(`  ✗ ERROR: ${err.message}\n`);
      results.push({ institution, total: 0, processed: 0, improved: 0, failed: 0, durationSec: 0, error: err.message });
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("SUMMARY");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("Institution".padEnd(42) + "Queue".padStart(7) + "Done".padStart(7) + "Impr".padStart(7) + "Fail".padStart(7) + "Secs".padStart(7));
  console.log("─".repeat(70));

  let totQueue = 0, totDone = 0, totImpr = 0, totFail = 0;
  for (const r of results) {
    if (r.error) {
      console.log(`${r.institution.padEnd(42)} ERROR: ${r.error.slice(0, 25)}`);
      continue;
    }
    totQueue += r.total; totDone += r.processed; totImpr += r.improved; totFail += r.failed;
    console.log(
      r.institution.padEnd(42) +
      String(r.total).padStart(7) +
      String(r.processed).padStart(7) +
      String(r.improved).padStart(7) +
      String(r.failed).padStart(7) +
      String(r.durationSec).padStart(7),
    );
  }

  console.log("─".repeat(70));
  console.log("TOTALS".padEnd(42) + String(totQueue).padStart(7) + String(totDone).padStart(7) + String(totImpr).padStart(7) + String(totFail).padStart(7));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
