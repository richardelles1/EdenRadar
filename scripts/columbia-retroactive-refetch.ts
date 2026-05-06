/**
 * columbia-retroactive-refetch.ts
 *
 * Standalone script to retroactively fetch real descriptions for all thin
 * Columbia University records in the DB using the c8e.ai .json API endpoint.
 *
 * Strategy:
 *   1. Fetch sitemap.xml → build fileNumber → canonical URL map.
 *   2. Load all thin Columbia DB records (summary < 50 chars).
 *   3. For each, extract file number from source_url slug (part after --).
 *   4. Look up the current canonical URL (handles stale slugs).
 *   5. GET {canonicalUrl}.json → parse via typed helpers (fetchColumbiaJson,
 *      columbiaJsonToListing) — no any casts, no duplicated logic.
 *   6. UPDATE ingested_assets: summary, abstract, inventors, patent_status,
 *      licensing_status, technology_id, corrected source_url, enriched_at=NULL.
 *
 * Usage:
 *   npx tsx scripts/columbia-retroactive-refetch.ts [--dry-run] [--limit=N]
 *
 * Environment:
 *   SUPABASE_DATABASE_URL  (PostgreSQL connection string)
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";
import {
  fetchColumbiaSitemapUrls,
  fetchColumbiaJson,
  columbiaJsonToListing,
} from "../server/lib/scrapers/columbia";

const DRY_RUN = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;
const CONCURRENCY = 5;
const DELAY_MS = 350;

const DB_URL = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("ERROR: SUPABASE_DATABASE_URL (or DATABASE_URL) not set.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DB_URL });
const db = drizzle(pool);

async function countThinColumbiaRecords(): Promise<number> {
  const r = await db.execute<{ total: string }>(sql`
    SELECT COUNT(*)::int AS total
    FROM ingested_assets
    WHERE institution = 'Columbia University'
      AND length(COALESCE(summary, '')) < 50
  `);
  return Number(r.rows[0]?.total ?? 0);
}

async function main() {
  console.log(`[columbia-refetch] Starting${DRY_RUN ? " (DRY RUN)" : ""}…`);
  const t0 = Date.now();

  // Before count
  const thinBefore = await countThinColumbiaRecords();
  console.log(`[columbia-refetch] Thin Columbia records BEFORE: ${thinBefore}`);

  // Step 1: Build fileNumber → canonical URL from sitemap (optional — null on 429)
  console.log("[columbia-refetch] Fetching sitemap…");
  const sitemapUrls = await fetchColumbiaSitemapUrls();
  const fileNumToUrl = new Map<string, string>();
  if (sitemapUrls) {
    for (const url of sitemapUrls) {
      const slug = url.split("/technologies/")[1] ?? "";
      const m = slug.match(/--([A-Z0-9]+)$/i);
      if (m) fileNumToUrl.set(m[1].toUpperCase(), url);
    }
    console.log(
      `[columbia-refetch] Sitemap: ${sitemapUrls.length} URLs, ${fileNumToUrl.size} file-number mappings`,
    );
  } else {
    console.warn(
      "[columbia-refetch] Sitemap unavailable (rate-limited) — using DB slugs directly; stale slugs will be skipped",
    );
  }

  // Step 2: Load thin Columbia records
  const rows = await db.execute<{ id: number; source_url: string }>(sql`
    SELECT id, source_url
    FROM ingested_assets
    WHERE institution = 'Columbia University'
      AND length(COALESCE(summary, '')) < 50
      AND source_url IS NOT NULL
    ORDER BY COALESCE(completeness_score, 0) DESC
  `);

  const workList = rows.rows.slice(
    0,
    LIMIT === Infinity ? rows.rows.length : LIMIT,
  );
  console.log(`[columbia-refetch] ${workList.length} thin Columbia records to process`);

  let processed = 0;
  let enriched = 0;
  let skipped = 0;
  let noJson = 0;
  const samples: string[] = [];

  for (let i = 0; i < workList.length; i += CONCURRENCY) {
    const batch = workList.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (row) => {
        if (!row?.source_url) {
          processed++;
          skipped++;
          return;
        }

        const slug = row.source_url.split("/technologies/")[1] ?? "";
        const fileNumMatch = slug.match(/--([A-Z0-9]+)$/i);
        const fileNum = fileNumMatch ? fileNumMatch[1].toUpperCase() : null;
        const canonicalUrl = fileNum
          ? (fileNumToUrl.get(fileNum) ?? row.source_url)
          : row.source_url;

        // Use typed helpers — no any casts, no duplicated parsing
        const json = await fetchColumbiaJson(canonicalUrl);
        if (!json) {
          processed++;
          noJson++;
          skipped++;
          return;
        }

        const listing = columbiaJsonToListing(canonicalUrl, json);
        if (!listing || listing.description.length < 50) {
          processed++;
          skipped++;
          return;
        }

        if (!DRY_RUN) {
          await db.execute(sql`
            UPDATE ingested_assets
            SET summary          = ${listing.description},
                abstract         = ${listing.abstract ?? null},
                inventors        = ${listing.inventors && listing.inventors.length > 0 ? listing.inventors : null},
                patent_status    = COALESCE(${listing.patentStatus ?? null}, patent_status),
                licensing_status = COALESCE(${listing.licensingStatus ?? null}, licensing_status),
                technology_id    = COALESCE(${listing.technologyId ?? null}, technology_id),
                source_url       = ${canonicalUrl},
                enriched_at      = NULL
            WHERE id = ${row.id}
          `);
        }

        if (samples.length < 3) {
          samples.push(
            `  id=${row.id} "${listing.title.slice(0, 55)}" — ${listing.description.length} chars${listing.patentStatus ? ", patent: " + listing.patentStatus.slice(0, 40) : ""}${listing.licensingStatus ? ", licensing: " + listing.licensingStatus.slice(0, 40) : ""}`,
          );
        }
        enriched++;
        processed++;
      }),
    );

    if (processed % 50 === 0 || processed === workList.length) {
      const pct =
        workList.length > 0
          ? Math.round((processed / workList.length) * 100)
          : 100;
      console.log(
        `[columbia-refetch] ${pct}% — processed ${processed}/${workList.length}, enriched ${enriched}, skipped ${skipped} (${noJson} no-json)`,
      );
    }

    if (i + CONCURRENCY < workList.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  // After count
  const thinAfter = DRY_RUN ? thinBefore : await countThinColumbiaRecords();

  const durationSec = Math.round((Date.now() - t0) / 1000);
  console.log(`\n[columbia-refetch] Done in ${durationSec}s:`);
  console.log(`  enriched   : ${enriched}`);
  console.log(`  skipped    : ${skipped} (${noJson} could not fetch JSON)`);
  console.log(`  total      : ${processed}`);
  console.log(`  thin BEFORE: ${thinBefore}`);
  console.log(`  thin AFTER : ${thinAfter}`);
  console.log(`  improvement: ${thinBefore - thinAfter} records upgraded`);

  if (samples.length > 0) {
    console.log("\n  Sample upgraded descriptions:");
    for (const s of samples) console.log(s);
  }

  if (!DRY_RUN && enriched > 0) {
    console.log(
      `\n  enriched_at reset to NULL for ${enriched} records → picked up by next AI enrichment run.`,
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[columbia-refetch] Fatal:", err);
  process.exit(1);
});
