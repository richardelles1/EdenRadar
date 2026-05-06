/**
 * Retroactively upgrades thin InPart assets in the DB by fetching each
 * asset's source_url page and parsing the __NEXT_DATA__ hydration JSON.
 *
 * InPart portals are Next.js SPAs — CSS selectors yield nothing.
 * The real description lives in:
 *   __NEXT_DATA__.props.pageProps.dehydratedState.queries[0].state.data
 *     .details.precis  (short summary)
 *     .details.contentV2  (rich text blocks)
 *
 * Run with:
 *   npx tsx scripts/inpart-retroactive-refetch.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";

const CONCURRENCY = 5;
const TIMEOUT_MS = 12_000;
const MIN_DESC_LENGTH = 50;
const NEXT_DATA_RE = /<script id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/;

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
    WHERE source_url LIKE '%.portals.in-part.com%'
      AND length(COALESCE(summary, '')) < 50
  `);
  const beforeCount = Number(before.rows[0]?.total ?? 0);
  console.log(`Thin InPart assets before: ${beforeCount}`);

  // Load all thin InPart assets
  const rows = await db.execute<{ id: number; source_url: string; asset_name: string | null }>(sql`
    SELECT id, source_url, asset_name
    FROM ingested_assets
    WHERE source_url LIKE '%.portals.in-part.com%'
      AND length(COALESCE(summary, '')) < 50
      AND source_url IS NOT NULL
    ORDER BY COALESCE(completeness_score, 0) DESC
  `);

  const total = rows.rows.length;
  console.log(`Fetching ${total} pages with concurrency=${CONCURRENCY}…\n`);

  let enriched = 0;
  let skipped = 0;
  let idx = 0;
  const startMs = Date.now();

  async function worker(workerId: number) {
    while (idx < rows.rows.length) {
      const row = rows.rows[idx++];
      if (!row?.source_url) { skipped++; continue; }

      try {
        const res = await fetch(row.source_url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) { skipped++; continue; }

        const html = await res.text();
        if (html.length < 1_000) { skipped++; continue; }

        const m = NEXT_DATA_RE.exec(html);
        if (!m) { skipped++; continue; }

        const nd = JSON.parse(m[1]);
        const queries: any[] = nd?.props?.pageProps?.dehydratedState?.queries ?? [];
        if (queries.length === 0) { skipped++; continue; }

        const data: any = queries[0]?.state?.data;
        const details: any = data?.details ?? {};

        const precis = typeof details.precis === "string" ? details.precis.trim() : "";
        let bodyText = "";
        if (Array.isArray(details.contentV2)) {
          bodyText = (details.contentV2 as any[])
            .map((block: any) =>
              typeof block.value === "string"
                ? block.value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
                : ""
            )
            .filter((s: string) => s.length > 0)
            .join(" ")
            .slice(0, 1_000);
        }

        const description = precis || bodyText;
        if (description.length >= MIN_DESC_LENGTH) {
          await db.execute(sql`
            UPDATE ingested_assets
            SET summary = ${description.slice(0, 5_000)},
                enriched_at = NULL
            WHERE id = ${row.id}
          `);
          enriched++;
          const processed = enriched + skipped;
          const pct = Math.round((processed / total) * 100);
          process.stdout.write(
            `\r  [W${workerId}] ${processed}/${total} (${pct}%) — ${enriched} upgraded, ${skipped} skipped — "${(row.asset_name ?? "").slice(0, 40)}"`.padEnd(120)
          );
        } else {
          skipped++;
        }
      } catch (err: any) {
        skipped++;
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  const durationS = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`\n\nDone in ${durationS}s`);
  console.log(`  Upgraded:  ${enriched}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  Total:     ${total}`);

  // After count
  const after = await db.execute<{ total: string }>(sql`
    SELECT COUNT(*)::int AS total
    FROM ingested_assets
    WHERE source_url LIKE '%.portals.in-part.com%'
      AND length(COALESCE(summary, '')) < 50
  `);
  const afterCount = Number(after.rows[0]?.total ?? 0);
  console.log(`\nThin InPart assets after:  ${afterCount} (was ${beforeCount})`);
  console.log(`Net improvement:           ${beforeCount - afterCount} assets upgraded`);

  // Institution breakdown of remaining thin
  if (afterCount > 0) {
    const remaining = await db.execute<{ institution: string; thin: string }>(sql`
      SELECT institution, COUNT(*)::int AS thin
      FROM ingested_assets
      WHERE source_url LIKE '%.portals.in-part.com%'
        AND length(COALESCE(summary, '')) < 50
      GROUP BY institution
      ORDER BY thin DESC
      LIMIT 20
    `);
    console.log("\nRemaining thin by institution:");
    for (const r of remaining.rows) {
      console.log(`  ${r.institution}: ${r.thin}`);
    }
  }

  // Sample upgraded descriptions
  const samples = await db.execute<{ asset_name: string | null; summary: string | null; institution: string }>(sql`
    SELECT asset_name, LEFT(summary, 200) AS summary, institution
    FROM ingested_assets
    WHERE source_url LIKE '%.portals.in-part.com%'
      AND length(COALESCE(summary, '')) >= 50
      AND enriched_at IS NULL
    ORDER BY last_seen_at DESC NULLS LAST
    LIMIT 5
  `);
  if (samples.rows.length > 0) {
    console.log("\nSample upgraded descriptions:");
    for (const s of samples.rows) {
      console.log(`  [${s.institution}] "${s.asset_name?.slice(0, 50)}" → ${s.summary?.slice(0, 120)}…`);
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
