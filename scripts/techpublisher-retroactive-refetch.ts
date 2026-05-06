/**
 * Retroactively upgrades thin TechPublisher assets in the DB by fetching
 * each detail page and extracting:
 *   - description  from div.c_tp_description  → summary
 *   - patent status from table.c_tp_patent rows → patent_status
 *   - inventors    from inline JS finalPathInventors → inventors[]
 *
 * Covers ~3,793 thin records across JHU, UArizona, SUNY, USF, Emory and 50+ institutions.
 *
 * Run with:
 *   npx tsx scripts/techpublisher-retroactive-refetch.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";
import { load } from "cheerio";

const CONCURRENCY = 5;
const TIMEOUT_MS = 15_000;
const DELAY_MS = 300;
const MIN_DESC_LENGTH = 50;

function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.SUPABASE_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const db = drizzle(pool);

  // Before count
  const before = await db.execute<{ total: string }>(sql`
    SELECT COUNT(*)::int AS total
    FROM ingested_assets
    WHERE source_url ILIKE '%technologypublisher.com%'
      AND length(COALESCE(summary, '')) < 50
  `);
  const beforeCount = Number(before.rows[0]?.total ?? 0);
  console.log(`Thin TechPublisher assets before: ${beforeCount}`);

  // Institution breakdown before
  const breakdownBefore = await db.execute<{ institution: string; thin: string }>(sql`
    SELECT institution, COUNT(*)::int AS thin
    FROM ingested_assets
    WHERE source_url ILIKE '%technologypublisher.com%'
      AND length(COALESCE(summary, '')) < 50
    GROUP BY institution
    ORDER BY thin DESC
    LIMIT 15
  `);
  console.log("\nTop institutions (thin before):");
  for (const r of breakdownBefore.rows) {
    console.log(`  ${r.institution}: ${r.thin}`);
  }

  // Load all thin records
  const rows = await db.execute<{ id: number; source_url: string; institution: string }>(sql`
    SELECT id, source_url, institution
    FROM ingested_assets
    WHERE source_url ILIKE '%technologypublisher.com%'
      AND length(COALESCE(summary, '')) < 50
      AND source_url IS NOT NULL
    ORDER BY COALESCE(completeness_score, 0) DESC
  `);

  const total = rows.rows.length;
  console.log(`\nProcessing ${total} thin assets with concurrency=${CONCURRENCY}\n`);

  let enriched = 0;
  let skipped = 0;
  let patentHits = 0;
  let inventorHits = 0;
  const startMs = Date.now();

  for (let batchStart = 0; batchStart < rows.rows.length; batchStart += CONCURRENCY) {
    const batch = rows.rows.slice(batchStart, batchStart + CONCURRENCY);

    await Promise.all(batch.map(async (row) => {
      if (!row?.source_url) { skipped++; return; }

      try {
        const res = await fetch(row.source_url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml",
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (!res.ok) { skipped++; return; }
        const html = await res.text();
        if (html.length < 1_000) { skipped++; return; }

        const $ = load(html);

        // Description from .c_tp_description
        const descHtml = $(".c_tp_description").first().html() ?? "";
        const summary = stripHtml(descHtml).slice(0, 5_000);
        if (summary.length < MIN_DESC_LENGTH) { skipped++; return; }

        // Patent status from .c_tp_patent table first data row
        let patentStatus: string | null = null;
        const patentRows = $(".c_tp_patent tr").slice(1);
        if (patentRows.length > 0) {
          const cells = patentRows.first().find("td");
          const appType = cells.eq(1).text().trim();
          const patTitle = cells.eq(0).text().trim();
          if (appType || patTitle) {
            patentStatus = [appType, patTitle].filter(Boolean).join(" — ").slice(0, 200);
            patentHits++;
          }
        }

        // Inventors from inline JS finalPathInventors
        const invMatch = html.match(/finalPathInventors:\s*'([^']+)'/);
        const inventors: string[] = invMatch
          ? invMatch[1].split(",").map((s) => s.trim()).filter((s) => s.length > 2)
          : [];
        if (inventors.length > 0) inventorHits++;

        await db.execute(sql`
          UPDATE ingested_assets
          SET summary       = ${summary},
              abstract      = ${summary},
              patent_status = COALESCE(${patentStatus}, patent_status),
              inventors     = COALESCE(${inventors.length > 0 ? inventors : null}, inventors),
              enriched_at   = NULL
          WHERE id = ${row.id}
        `);
        enriched++;
      } catch {
        skipped++;
      }

      const processed = enriched + skipped;
      const pct = Math.round((processed / total) * 100);
      process.stdout.write(
        `\r  ${processed}/${total} (${pct}%) — ${enriched} upgraded, ${skipped} skipped — batch ${Math.floor(batchStart / CONCURRENCY) + 1}`.padEnd(130)
      );
    }));

    if (batchStart + CONCURRENCY < rows.rows.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  const durationS = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`\n\nDone in ${durationS}s`);
  console.log(`  Upgraded:      ${enriched}`);
  console.log(`  Skipped:       ${skipped}`);
  console.log(`  Total:         ${total}`);
  console.log(`  Patent hits:   ${patentHits}`);
  console.log(`  Inventor hits: ${inventorHits}`);

  // After count
  const after = await db.execute<{ total: string }>(sql`
    SELECT COUNT(*)::int AS total
    FROM ingested_assets
    WHERE source_url ILIKE '%technologypublisher.com%'
      AND length(COALESCE(summary, '')) < 50
  `);
  const afterCount = Number(after.rows[0]?.total ?? 0);
  const reduction = beforeCount > 0 ? Math.round(((beforeCount - afterCount) / beforeCount) * 100) : 0;
  console.log(`\nThin TechPublisher assets after:  ${afterCount} (was ${beforeCount})`);
  console.log(`Net improvement:                  ${beforeCount - afterCount} assets upgraded (${reduction}% reduction)`);

  if (reduction >= 60) {
    console.log(`\n✓ VALIDATION PASSED: ${reduction}% ≥ 60% thin count reduction target`);
  } else {
    console.log(`\n✗ VALIDATION FAILED: ${reduction}% < 60% thin count reduction target`);
  }

  // Remaining thin by institution
  if (afterCount > 0) {
    const remaining = await db.execute<{ institution: string; thin: string }>(sql`
      SELECT institution, COUNT(*)::int AS thin
      FROM ingested_assets
      WHERE source_url ILIKE '%technologypublisher.com%'
        AND length(COALESCE(summary, '')) < 50
      GROUP BY institution
      ORDER BY thin DESC
      LIMIT 15
    `);
    console.log("\nRemaining thin by institution:");
    for (const r of remaining.rows) {
      console.log(`  ${r.institution}: ${r.thin}`);
    }
  }

  // Sample upgraded descriptions (≥100 chars)
  const samples = await db.execute<{ asset_name: string | null; summary: string | null; institution: string; patent_status: string | null; inventors: unknown }>(sql`
    SELECT asset_name, LEFT(summary, 200) AS summary, institution, patent_status, inventors
    FROM ingested_assets
    WHERE source_url ILIKE '%technologypublisher.com%'
      AND length(COALESCE(summary, '')) >= 100
      AND enriched_at IS NULL
    ORDER BY last_seen_at DESC NULLS LAST
    LIMIT 5
  `);
  if (samples.rows.length > 0) {
    console.log("\nSample upgraded descriptions:");
    for (const s of samples.rows) {
      console.log(`  [${s.institution}] "${s.asset_name?.slice(0, 50)}"`);
      console.log(`    desc (${s.summary?.length ?? 0} chars): ${s.summary?.slice(0, 120)}…`);
      if (s.patent_status) console.log(`    patent_status: ${s.patent_status}`);
      if (Array.isArray(s.inventors) && s.inventors.length > 0) console.log(`    inventors: ${(s.inventors as string[]).join(", ")}`);
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
