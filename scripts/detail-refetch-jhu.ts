/**
 * Targeted detail re-fetch for a single institution.
 * Usage: tsx scripts/detail-refetch-jhu.ts [institution name]
 * Default: "Johns Hopkins University"
 */

import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { fetchHtml, cleanText, extractText } from "../server/lib/scrapers/utils";
import { DESCRIPTION_SELECTORS } from "../server/lib/scrapers/detailFetcher";
import { computeContentHash } from "../server/lib/pipeline/contentHash";

const INSTITUTION = process.argv[2] ?? "Johns Hopkins University";
const CONCURRENCY = 6;
const TIMEOUT_MS = 14_000;

async function main() {
  console.log(`[detail-refetch] Institution: ${INSTITUTION}`);

  const rows = await db.execute<{ id: number; asset_name: string | null; source_url: string | null }>(sql`
    SELECT id, asset_name, source_url
    FROM ingested_assets
    WHERE relevant = true
      AND source_name = 'tech_transfer'
      AND length(COALESCE(summary, '')) < 120
      AND source_url IS NOT NULL
      AND institution = ${INSTITUTION}
    ORDER BY COALESCE(completeness_score, 0) DESC
  `);

  const assets = rows.rows;
  console.log(`[detail-refetch] Found ${assets.length} thin assets to process`);
  if (assets.length === 0) { process.exit(0); }

  let enriched = 0, skipped = 0, processed = 0;
  const startMs = Date.now();
  let idx = 0;

  async function worker(wid: number) {
    while (idx < assets.length) {
      const row = assets[idx++];
      if (!row?.source_url) { processed++; skipped++; continue; }
      try {
        const $ = await fetchHtml(row.source_url, TIMEOUT_MS, undefined, 1);
        if (!$) { processed++; skipped++; continue; }
        const content = extractText($, DESCRIPTION_SELECTORS);
        if (content && content.length > 120) {
          const newHash = computeContentHash(row.asset_name ?? "", content, "");
          await db.execute(sql`
            UPDATE ingested_assets
            SET summary      = ${content.slice(0, 5000)},
                content_hash = ${newHash},
                enriched_at  = NULL
            WHERE id = ${row.id}
          `);
          enriched++;
          if (enriched % 20 === 0 || enriched <= 3) {
            const rate = (enriched / ((Date.now() - startMs) / 1000)).toFixed(1);
            console.log(`[w${wid}] ${processed}/${assets.length} processed, ${enriched} enriched, ${skipped} skipped (${rate}/s)`);
          }
        } else {
          skipped++;
        }
      } catch (err: any) {
        skipped++;
        if (skipped <= 5 || skipped % 100 === 0)
          console.warn(`[w${wid}] skip id=${row.id}: ${String(err.message ?? err).slice(0, 80)}`);
      }
      processed++;
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));

  const dur = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`\n[detail-refetch] DONE — ${enriched} enriched, ${skipped} skipped of ${assets.length} total (${dur}s)`);
  console.log(`[detail-refetch] ${enriched} assets have enriched_at=NULL — queued for mini-enrich pipeline.`);
  process.exit(0);
}

main().catch(err => { console.error("[detail-refetch] Fatal:", err); process.exit(1); });
