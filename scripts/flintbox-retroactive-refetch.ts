/**
 * Retroactively upgrades thin Flintbox assets in the DB by calling the
 * single-technology Flintbox API endpoint for each thin asset.
 *
 * The Flintbox bulk API returns only keyPoint1/2/3 (short keyword tags).
 * The per-technology endpoint at /api/v1/technologies/{uuid} returns the
 * full `abstract` and `marketApplication` fields with paragraph-length text.
 *
 * Run with:
 *   npx tsx scripts/flintbox-retroactive-refetch.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";

const CONCURRENCY = 10;
const TIMEOUT_MS = 10_000;
const MIN_DESC_LENGTH = 50;

function stripHtml(s: string): string {
  return s
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

async function discoverCredentials(
  slug: string,
): Promise<{ orgId: number; accessKey: string } | null> {
  try {
    const res = await fetch(`https://${slug}.flintbox.com`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const idMatch = html.match(/data-organization-id="(\d+)"/);
    const keyMatch = html.match(/data-organization-access-key="([^"]+)"/);
    if (!idMatch || !keyMatch) return null;
    const orgId = parseInt(idMatch[1], 10);
    if (isNaN(orgId)) return null;
    return { orgId, accessKey: keyMatch[1] };
  } catch {
    return null;
  }
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
    WHERE source_url LIKE '%.flintbox.com%'
      AND length(COALESCE(summary, '')) < 50
  `);
  const beforeCount = Number(before.rows[0]?.total ?? 0);
  console.log(`Thin Flintbox assets before: ${beforeCount}`);

  // Load all thin Flintbox assets
  const rows = await db.execute<{ id: number; source_url: string; asset_name: string | null; institution: string }>(sql`
    SELECT id, source_url, asset_name, institution
    FROM ingested_assets
    WHERE source_url LIKE '%.flintbox.com%'
      AND length(COALESCE(summary, '')) < 50
      AND source_url IS NOT NULL
    ORDER BY institution, COALESCE(completeness_score, 0) DESC
  `);

  const total = rows.rows.length;
  console.log(`Processing ${total} thin assets with concurrency=${CONCURRENCY}\n`);

  // Pre-discover credentials per slug (grouped to avoid stampede)
  const credCache = new Map<string, { orgId: number; accessKey: string } | null>();
  const slugs = new Set<string>();
  for (const row of rows.rows) {
    const m = row.source_url.match(/^https?:\/\/([^.]+)\.flintbox\.com/);
    if (m) slugs.add(m[1]);
  }
  console.log(`Discovering credentials for ${slugs.size} Flintbox orgs…`);
  for (const slug of slugs) {
    const creds = await discoverCredentials(slug);
    credCache.set(slug, creds);
    if (creds) {
      process.stdout.write(`  ${slug}: orgId=${creds.orgId} ✓\n`);
    } else {
      process.stdout.write(`  ${slug}: FAILED\n`);
    }
  }
  console.log();

  let enriched = 0;
  let skipped = 0;
  let idx = 0;
  const startMs = Date.now();

  async function worker(workerId: number) {
    while (idx < rows.rows.length) {
      const row = rows.rows[idx++];
      if (!row?.source_url) { skipped++; continue; }

      const urlMatch = row.source_url.match(/^https?:\/\/([^.]+)\.flintbox\.com\/technologies\/([^/?#]+)/);
      if (!urlMatch) { skipped++; continue; }
      const [, slug, uuid] = urlMatch;

      const creds = credCache.get(slug);
      if (!creds) { skipped++; continue; }

      try {
        const apiUrl =
          `https://${slug}.flintbox.com/api/v1/technologies/${uuid}` +
          `?organizationId=${creds.orgId}&organizationAccessKey=${creds.accessKey}`;
        const res = await fetch(apiUrl, {
          headers: {
            Accept: "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Mozilla/5.0",
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) { skipped++; continue; }
        const json = await res.json() as any;
        const attrs = json?.data?.attributes ?? json?.attributes ?? json;
        const abstractRaw = stripHtml(attrs?.abstract ?? "");
        const marketRaw = stripHtml(attrs?.marketApplication ?? "");
        const combined = [abstractRaw, marketRaw].filter((s) => s.length > 0).join(" ").slice(0, 5_000);

        if (combined.length >= MIN_DESC_LENGTH) {
          await db.execute(sql`
            UPDATE ingested_assets
            SET summary = ${combined},
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
      } catch {
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
    WHERE source_url LIKE '%.flintbox.com%'
      AND length(COALESCE(summary, '')) < 50
  `);
  const afterCount = Number(after.rows[0]?.total ?? 0);
  console.log(`\nThin Flintbox assets after:  ${afterCount} (was ${beforeCount})`);
  console.log(`Net improvement:             ${beforeCount - afterCount} assets upgraded`);

  // Institution breakdown of remaining thin
  if (afterCount > 0) {
    const remaining = await db.execute<{ institution: string; thin: string }>(sql`
      SELECT institution, COUNT(*)::int AS thin
      FROM ingested_assets
      WHERE source_url LIKE '%.flintbox.com%'
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
    WHERE source_url LIKE '%.flintbox.com%'
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
