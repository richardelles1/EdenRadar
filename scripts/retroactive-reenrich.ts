/**
 * Retroactive re-enrichment script.
 *
 * For each target institution:
 *  1. Re-runs the scraper (with improved extraction code from Tasks #940/#944).
 *  2. Calls bulkRefreshScrapedFields to update stored fields (abstract, inventors, etc.)
 *     and auto-queues for AI re-enrichment when description grew >20%.
 *  3. After all scrapes, force-resets enriched_at=NULL for any remaining thin-summary
 *     assets so the AI pipeline gives them a fresh pass.
 *
 * Run: tsx scripts/retroactive-reenrich.ts
 */

import "dotenv/config";
import { storage } from "../server/storage";
import { makeFingerprint } from "../server/lib/ingestion";
import { normalizeLicensingStatus, normalizePatentStatus } from "../server/lib/pipeline/contentHash";
import {
  uclaScraper,
  ucDavisScraper,
  ucIrvineScraper,
  ucRiversideScraper,
  ucSantaBarbaraScraper,
  ucSantaCruzScraper,
  ucsfScraper,
  ucMercedScraper,
  techLinkScraper,
  techLinkVAScraper,
  llnlScraper,
} from "../server/lib/scrapers/new-institutions";
import { wustlScraper } from "../server/lib/scrapers/wustl";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const TARGET_SCRAPERS = [
  llnlScraper,
  wustlScraper,
  uclaScraper,
  ucDavisScraper,
  ucIrvineScraper,
  ucRiversideScraper,
  ucSantaBarbaraScraper,
  ucSantaCruzScraper,
  ucsfScraper,
  ucMercedScraper,
  techLinkScraper,
  techLinkVAScraper,
];

interface RunResult {
  institution: string;
  scraped: number;
  checked: number;
  fieldsUpdated: number;
  queuedTotal: number;
  queuedRelevant: number;
  thinReset?: number;
  error?: string;
  skipped?: boolean;
}

async function main() {
  const rows: RunResult[] = [];

  for (const scraper of TARGET_SCRAPERS) {
    const inst = scraper.institution;
    console.log(`\n━━━ [${inst}] scraping...`);

    try {
      const controller = new AbortController();
      const listings = await scraper.scrape(controller.signal, new Set<string>());
      console.log(`  scraped ${listings.length} listings`);

      if (!listings.length) {
        rows.push({ institution: inst, scraped: 0, checked: 0, fieldsUpdated: 0, queuedTotal: 0, queuedRelevant: 0, skipped: true });
        continue;
      }

      const normalized = listings
        .filter((l) => l.title && l.institution)
        .map((l) => ({
          fingerprint: makeFingerprint(l.title, l.institution!),
          abstract: l.abstract || null,
          inventors: l.inventors?.length ? l.inventors : null,
          patentStatus: normalizePatentStatus(l.patentStatus) || null,
          licensingStatus: normalizeLicensingStatus(l.licensingStatus) || null,
          categories: l.categories?.length ? l.categories : null,
          contactEmail: l.contactEmail || null,
          technologyId: l.technologyId || null,
          description: l.description || null,
        }));

      // Show a sample of description lengths so we can confirm richer content
      const sample = normalized
        .filter((n) => n.description)
        .slice(0, 3)
        .map((n) => `  • ${n.fingerprint.slice(0, 40)}… desc=${n.description!.length} chars`);
      if (sample.length) {
        console.log("  sample descriptions:");
        sample.forEach((s) => console.log(s));
      }

      const refreshResult = await storage.bulkRefreshScrapedFields(inst, normalized);

      // Force-reset enriched_at for assets at this institution with thin summaries
      // (those not caught by the >20% growth rule in bulkRefreshScrapedFields).
      const thinResult = await db.execute(sql`
        UPDATE ingested_assets
        SET    enriched_at = NULL,
               deep_enrich_attempts = 0
        WHERE  institution = ${inst}
          AND  (summary IS NULL OR char_length(summary) < 150)
      `);

      const thinReset = thinResult.rowCount ?? 0;
      console.log(`  checked=${refreshResult.checked} fieldsUpdated=${refreshResult.fieldsUpdated} queuedByGrowth=${refreshResult.queuedTotal} (relevant=${refreshResult.queuedRelevant}) thinReset=${thinReset}`);
      rows.push({ institution: inst, scraped: listings.length, ...refreshResult, thinReset });
    } catch (err: any) {
      console.error(`  ERROR: ${err.message}`);
      rows.push({ institution: inst, scraped: 0, checked: 0, fieldsUpdated: 0, queuedTotal: 0, queuedRelevant: 0, error: err.message });
    }
  }

  // ── Final summary ──────────────────────────────────────────────────────────

  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("RETROACTIVE RE-ENRICHMENT — RESULTS");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(
    "Institution".padEnd(42) +
    "Scraped".padStart(8) +
    "Checked".padStart(8) +
    "FldUpd".padStart(8) +
    "GrowthQ".padStart(9) +
    "ThinReset".padStart(11),
  );
  console.log("─".repeat(86));

  let totScraped = 0, totChecked = 0, totFields = 0, totGrowth = 0, totThin = 0;
  for (const r of rows) {
    if (r.error) {
      console.log(`${r.institution.padEnd(42)} ${"ERROR".padStart(8)} — ${r.error.slice(0, 40)}`);
      continue;
    }
    totScraped += r.scraped;
    totChecked += r.checked;
    totFields  += r.fieldsUpdated;
    totGrowth  += r.queuedTotal;
    totThin    += r.thinReset ?? 0;
    console.log(
      r.institution.padEnd(42) +
      String(r.scraped).padStart(8) +
      String(r.checked).padStart(8) +
      String(r.fieldsUpdated).padStart(8) +
      `${r.queuedTotal}(${r.queuedRelevant}r)`.padStart(9) +
      String(r.thinReset ?? 0).padStart(11),
    );
  }
  console.log("─".repeat(86));
  console.log(
    "TOTALS".padEnd(42) +
    String(totScraped).padStart(8) +
    String(totChecked).padStart(8) +
    String(totFields).padStart(8) +
    String(totGrowth).padStart(9) +
    String(totThin).padStart(11),
  );
  console.log("\nLegend:");
  console.log("  Scraped    — raw listings returned by the scraper");
  console.log("  Checked    — listings matched to existing DB assets");
  console.log("  FldUpd     — fields null-filled (abstract, patent, licensing, etc.)");
  console.log("  GrowthQ    — assets reset for re-enrichment (description grew >20%); format: total(relevantR)");
  console.log("  ThinReset  — assets with thin summaries (<150 chars) force-queued for re-enrichment");
  console.log("\nAll queued assets will be processed by the background AI enrichment pipeline.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
