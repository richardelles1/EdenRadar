/**
 * scripts/backfill-abstracts.ts
 *
 * Backfills full abstract text for text-sparse relevant assets that have
 * source URLs but < 120 chars of combined summary+abstract text.
 *
 * Platform strategies:
 *  1. TechLink (DoD + VA) — public REST API https://techlinkcenter.org/api/v2/projects/{id}
 *     where {id} is the slug parsed from source_url. Non-JSON (HTML SPA) responses are
 *     classified as `failed` and logged per asset.
 *  2. TechnologyPublisher — detail-page re-fetch by source_url (slug/numeric-ID endpoint)
 *     → .c_tp_description extraction (mirrors techpublisher-retroactive-refetch.ts pattern).
 *  3. Flintbox — credential discovery per subdomain + JSON API per UUID.
 *  4. Generic HTML — cheerio fetch → DESCRIPTION_SELECTORS cascade + Next.js dehydrated state.
 *
 * DB write-back:
 *   Per success: abstract, data_sparse=false, mini_enrich_attempts=0, enriched_at=NULL.
 *   Batched in groups of 50 via a single VALUES table UPDATE per batch.
 *
 * Usage:
 *   npx tsx scripts/backfill-abstracts.ts [--dry-run] [--platform=<p>] [--limit=N]
 *
 *   --dry-run            Fetch + parse but do not write to DB.
 *   --platform=<name>    Process only one platform: techlink | techpublisher | flintbox | generic
 *   --limit=N            Cap the total assets processed (useful for testing).
 *
 * Environment:
 *   SUPABASE_DATABASE_URL  (required)
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";
import { load } from "cheerio";

// ── CLI args ──────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const platformArg = process.argv.find((a) => a.startsWith("--platform="));
const ONLY_PLATFORM = platformArg ? platformArg.split("=")[1] : null;
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const GLOBAL_LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

// ── Constants ─────────────────────────────────────────────────────────────────
const TEXT_THIN_THRESHOLD = 120;  // assets below this are candidates
const MIN_USEFUL_LENGTH = 50;     // minimum text length to count as "found"
const CONCURRENCY = 8;
const DELAY_MS = 200;
const FETCH_TIMEOUT_MS = 15_000;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

// Matches the <script id="__NEXT_DATA__"> block used by Next.js SSR pages
const NEXT_DATA_RE = /<script id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/;

// ── DB setup ──────────────────────────────────────────────────────────────────
const DB_URL = process.env.SUPABASE_DATABASE_URL;
if (!DB_URL) { console.error("ERROR: SUPABASE_DATABASE_URL is not set."); process.exit(1); }

const pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool);

// ── Types ─────────────────────────────────────────────────────────────────────
interface AssetRow {
  id: number;
  source_url: string;
  institution: string;
  asset_name: string | null;
}

interface FetchResult {
  abstract: string;
  summary?: string;
}

// ── Shared utilities ──────────────────────────────────────────────────────────
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}

function cleanText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html.length > 500 ? html : null;
  } catch {
    return null;
  }
}

// ── Batch write system ────────────────────────────────────────────────────────
const WRITE_BATCH_SIZE = 50;
const pendingWrites: Array<{ id: number; result: FetchResult }> = [];

async function flushWriteBatch(): Promise<void> {
  if (DRY_RUN || pendingWrites.length === 0) { pendingWrites.length = 0; return; }
  const batch = pendingWrites.splice(0, pendingWrites.length);
  // Single VALUES table UPDATE — one round-trip for up to 50 rows
  // abstract = the raw field text; summary = aggregated text (or same as abstract if no summary)
  const valuePlaceholders = batch.map((_, i) =>
    `($${i * 3 + 1}::int, $${i * 3 + 2}::text, $${i * 3 + 3}::text)`
  ).join(", ");
  const params: (number | string)[] = batch.flatMap(({ id, result }) => [
    id,
    result.abstract.slice(0, 8000),
    (result.summary ?? result.abstract).slice(0, 8000),
  ]);
  await pool.query(
    `UPDATE ingested_assets
     SET abstract             = tmp.abst,
         summary              = tmp.summ,
         data_sparse          = false,
         mini_enrich_attempts = 0,
         enriched_at          = NULL
     FROM (VALUES ${valuePlaceholders}) AS tmp(id, abst, summ)
     WHERE ingested_assets.id = tmp.id`,
    params,
  );
}

async function queueWrite(id: number, result: FetchResult): Promise<void> {
  if (DRY_RUN) return;
  pendingWrites.push({ id, result });
  if (pendingWrites.length >= WRITE_BATCH_SIZE) await flushWriteBatch();
}

// ── Per-institution tracking ──────────────────────────────────────────────────
interface InstitutionStats { fetched: number; skipped: number; failed: number }
const instStats = new Map<string, InstitutionStats>();

function trackInst(institution: string, outcome: keyof InstitutionStats): void {
  const s = instStats.get(institution) ?? { fetched: 0, skipped: 0, failed: 0 };
  s[outcome]++;
  instStats.set(institution, s);
}

// ── Platform-level progress tracker ──────────────────────────────────────────
interface PlatformStats {
  total: number;
  fetched: number;
  skipped: number;
  failed: number;
}

const stats: Record<string, PlatformStats> = {};

function initStats(platform: string, total: number) {
  stats[platform] = { total, fetched: 0, skipped: 0, failed: 0 };
}

function logProgress(platform: string) {
  const s = stats[platform];
  if (!s) return;
  const done = s.fetched + s.skipped + s.failed;
  const pct = s.total > 0 ? Math.round((done / s.total) * 100) : 100;
  process.stdout.write(
    `\r  [${platform}] ${done}/${s.total} (${pct}%) — ✓${s.fetched} skip${s.skipped} ✗${s.failed}`.padEnd(100)
  );
}

// ── DESCRIPTION_SELECTORS (same as detailFetcher.ts) ─────────────────────────
const DESCRIPTION_SELECTORS = [
  ".c_tp_description", ".tech-description",
  ".ncd-data", ".ncd-main-right-panel",
  ".field--name-body", ".field--body",
  ".tech-detail__description", ".technology-description",
  "#description", ".description",
  "article .content", ".entry-content",
  ".field--name-field-abstract", ".tech-detail__abstract",
  ".technology-abstract", "#abstract", ".abstract",
  ".et_pb_text_inner",
  "main p",
];

// ══════════════════════════════════════════════════════════════════════════════
// Platform 1: TechLink (DoD + VA) — public REST API /api/v2/projects/{id}
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Calls the TechLink public REST API for a single project.
 * API endpoint: https://techlinkcenter.org/api/v2/projects/{id}
 * The {id} is the slug parsed from the source URL (last path segment before any UUID).
 *
 * Returns an object with the concatenated description text, or throws on network failure.
 * Returns null if the API response is non-JSON, empty, or yields insufficient text.
 */
async function fetchTechLinkProject(slug: string): Promise<FetchResult | null> {
  const apiUrl = `https://techlinkcenter.org/api/v2/projects/${encodeURIComponent(slug)}`;
  const res = await fetch(apiUrl, {
    headers: {
      "Accept": "application/json",
      "User-Agent": UA,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  // Treat non-2xx as a hard failure (caller will log it)
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${apiUrl}`);

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json") && !ct.includes("text/json")) {
    // API returned HTML (React SPA shell) — no data available
    throw new Error(`Non-JSON response (${ct}) from ${apiUrl}`);
  }

  const json = await res.json() as Record<string, unknown>;

  // Extract all text-bearing fields; concatenate for a rich abstract
  const fields = [
    json?.description, json?.objectives, json?.benefits,
    json?.abstract, json?.summary, json?.body,
    (json?.data as Record<string, unknown>)?.description,
    (json?.data as Record<string, unknown>)?.abstract,
  ];
  const combined = fields
    .map((f) => cleanText(stripHtml(String(f ?? ""))))
    .filter((s) => s.length >= 10)
    .join(" ")
    .slice(0, 5000);

  return combined.length >= MIN_USEFUL_LENGTH ? { abstract: combined } : null;
}

/**
 * Parses the stable project ID (slug) from a TechLink source URL.
 *
 * URL formats:
 *   /technologies/{slug}
 *   /technologies/{slug}/{uuid}
 *   /va-technologies/{slug}/{numeric-id}
 *
 * Returns the slug segment (the first non-UUID, non-numeric-id path segment
 * after "/technologies/" or "/va-technologies/").
 */
function parseTechLinkId(url: string): string | null {
  const m = url.match(/\/(?:va-)?technologies\/([^/?#]+)/);
  if (!m) return null;
  const candidate = m[1];
  // If this segment IS a UUID or numeric-only, the slug is not in the URL
  if (/^[0-9a-f]{8}-/i.test(candidate) || /^\d+$/.test(candidate)) return null;
  return candidate;
}

async function processTechLink(assets: AssetRow[]): Promise<void> {
  const platform = "techlink";
  initStats(platform, assets.length);
  if (assets.length === 0) return;

  console.log(`\n[${platform}] ${assets.length} thin assets — calling /api/v2/projects/{id}`);

  for (let i = 0; i < assets.length; i += CONCURRENCY) {
    const batch = assets.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (row) => {
      const id = parseTechLinkId(row.source_url);
      if (!id) {
        // URL has no parseable slug — log and count as failed
        console.warn(`\n  [${platform}] FAIL id=${row.id}: cannot parse slug from ${row.source_url}`);
        stats[platform].failed++;
        trackInst(row.institution, "failed");
        logProgress(platform);
        return;
      }

      try {
        const result = await fetchTechLinkProject(id);
        if (result) {
          await queueWrite(row.id, result);
          stats[platform].fetched++;
          trackInst(row.institution, "fetched");
        } else {
          // API responded but returned no usable text
          stats[platform].skipped++;
          trackInst(row.institution, "skipped");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`\n  [${platform}] FAIL id=${row.id} slug=${id}: ${msg}`);
        stats[platform].failed++;
        trackInst(row.institution, "failed");
      }
      logProgress(platform);
    }));
    if (i + CONCURRENCY < assets.length) await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  await flushWriteBatch();
  console.log(`\n  [${platform}] Done.`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Platform 2: TechnologyPublisher — detail-page re-fetch by slug/ID
//
// TechnologyPublisher sites serve individual technology pages at:
//   https://{subdomain}.technologypublisher.com/technology/{numeric-id}
//   https://{subdomain}.technologypublisher.com/tech/{slug}
//
// Each source URL stored in the DB IS the per-record detail endpoint. Fetching
// it and parsing the `.c_tp_description` selector retrieves the full abstract
// (same approach used by the production techpublisher-retroactive-refetch.ts).
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fetches a TechnologyPublisher detail page (URL = the slug-based record endpoint
 * stored in source_url) and extracts the description.
 *
 * Throws on HTTP errors → caller classifies as `failed`.
 * Returns null when the page loads but yields no description → caller classifies as `skipped`.
 */
async function fetchTechPublisherAbstract(url: string): Promise<FetchResult | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);

  const html = await res.text();
  if (html.length < 500) throw new Error(`Response too short (${html.length} bytes) for ${url}`);

  const $ = load(html);

  // .c_tp_description is the canonical TechnologyPublisher description field
  const descText = cleanText(stripHtml($(".c_tp_description").first().html() ?? ""));
  if (descText.length >= MIN_USEFUL_LENGTH) return { abstract: descText.slice(0, 5000) };

  return null; // page loaded but .c_tp_description absent or empty → caller counts as skipped
}

async function processTechPublisher(assets: AssetRow[]): Promise<void> {
  const platform = "techpublisher";
  initStats(platform, assets.length);
  if (assets.length === 0) return;

  console.log(`\n[${platform}] ${assets.length} thin assets`);

  for (let i = 0; i < assets.length; i += CONCURRENCY) {
    const batch = assets.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (row) => {
      try {
        const result = await fetchTechPublisherAbstract(row.source_url);
        if (result) {
          await queueWrite(row.id, result);
          stats[platform].fetched++;
          trackInst(row.institution, "fetched");
        } else {
          stats[platform].skipped++;
          trackInst(row.institution, "skipped");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`\n  [${platform}] FAIL id=${row.id} url=${row.source_url}: ${msg}`);
        stats[platform].failed++;
        trackInst(row.institution, "failed");
      }
      logProgress(platform);
    }));
    if (i + CONCURRENCY < assets.length) await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  await flushWriteBatch();
  console.log(`\n  [${platform}] Done.`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Platform 3: Flintbox — credential discovery + JSON API per UUID
// ══════════════════════════════════════════════════════════════════════════════

const flintboxCredCache = new Map<string, { orgId: number; accessKey: string } | null>();

async function discoverFlintboxCreds(
  slug: string,
): Promise<{ orgId: number; accessKey: string } | null> {
  if (flintboxCredCache.has(slug)) return flintboxCredCache.get(slug)!;
  try {
    const res = await fetch(`https://${slug}.flintbox.com`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) { flintboxCredCache.set(slug, null); return null; }
    const html = await res.text();
    const idM = html.match(/data-organization-id=["'](\d+)["']/);
    const keyM = html.match(/data-organization-access-key=["']([a-f0-9-]{36})["']/);
    if (!idM || !keyM) { flintboxCredCache.set(slug, null); return null; }
    const creds = { orgId: parseInt(idM[1], 10), accessKey: keyM[1] };
    if (isNaN(creds.orgId)) { flintboxCredCache.set(slug, null); return null; }
    flintboxCredCache.set(slug, creds);
    return creds;
  } catch {
    flintboxCredCache.set(slug, null);
    return null;
  }
}

async function fetchFlintboxAbstract(url: string): Promise<FetchResult | null> {
  const m = url.match(/^https?:\/\/([^.]+)\.flintbox\.com\/technologies\/([^/?#]+)/);
  if (!m) return null;
  const [, slug, uuid] = m;

  const creds = await discoverFlintboxCreds(slug);
  if (!creds) throw new Error(`Credential discovery failed for ${slug}.flintbox.com`);

  const apiUrl =
    `https://${slug}.flintbox.com/api/v1/technologies/${uuid}` +
    `?organizationId=${creds.orgId}&organizationAccessKey=${creds.accessKey}`;
  const res = await fetch(apiUrl, {
    headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest", "User-Agent": UA },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${apiUrl}`);

  const json = await res.json() as Record<string, unknown>;
  const attrs = (json?.data as Record<string, unknown>)?.attributes
    ?? (json?.attributes as Record<string, unknown>)
    ?? json as Record<string, unknown>;

  const descRaw = cleanText(stripHtml(
    String(attrs?.description ?? attrs?.fullDescription ?? attrs?.abstract
           ?? attrs?.briefDescription ?? attrs?.brief_description ?? ""),
  ));
  const benefitRaw = cleanText(stripHtml(String(attrs?.benefit ?? "")));
  const marketRaw  = cleanText(stripHtml(String(attrs?.marketApplication ?? "")));
  const kp1 = cleanText(stripHtml(String(attrs?.keyPoint1 ?? "")));
  const kp2 = cleanText(stripHtml(String(attrs?.keyPoint2 ?? "")));
  const kp3 = cleanText(stripHtml(String(attrs?.keyPoint3 ?? "")));
  const otherRaw = cleanText(stripHtml(String(attrs?.other ?? "")));

  const combined = [descRaw, benefitRaw, marketRaw, kp1, kp2, kp3, otherRaw]
    .filter((s) => s.length > 0).join(" ").slice(0, 5000);
  if (combined.length < MIN_USEFUL_LENGTH) return null;

  const abstractText = descRaw.length >= MIN_USEFUL_LENGTH ? descRaw.slice(0, 5000) : combined;
  return { abstract: abstractText, summary: combined };
}

async function processFlintbox(assets: AssetRow[]): Promise<void> {
  const platform = "flintbox";
  initStats(platform, assets.length);
  if (assets.length === 0) return;

  console.log(`\n[${platform}] ${assets.length} thin assets`);

  // Pre-discover credentials for all slugs
  const slugSet = new Set<string>();
  for (const row of assets) {
    const m = row.source_url.match(/^https?:\/\/([^.]+)\.flintbox\.com/);
    if (m) slugSet.add(m[1]);
  }
  console.log(`  [${platform}] Discovering credentials for ${slugSet.size} orgs...`);
  for (const slug of slugSet) {
    const creds = await discoverFlintboxCreds(slug);
    process.stdout.write(`  ${slug}: ${creds ? `orgId=${creds.orgId} ✓` : "FAILED"}\n`);
  }

  for (let i = 0; i < assets.length; i += CONCURRENCY) {
    const batch = assets.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (row) => {
      try {
        const result = await fetchFlintboxAbstract(row.source_url);
        if (result) {
          await queueWrite(row.id, result);
          stats[platform].fetched++;
          trackInst(row.institution, "fetched");
        } else {
          stats[platform].skipped++;
          trackInst(row.institution, "skipped");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`\n  [${platform}] FAIL id=${row.id} url=${row.source_url}: ${msg}`);
        stats[platform].failed++;
        trackInst(row.institution, "failed");
      }
      logProgress(platform);
    }));
    if (i + CONCURRENCY < assets.length) await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  await flushWriteBatch();
  console.log(`\n  [${platform}] Done.`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Platform 4: Generic HTML — cheerio with DESCRIPTION_SELECTORS cascade
// ══════════════════════════════════════════════════════════════════════════════

async function fetchGenericAbstract(url: string): Promise<FetchResult | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const html = await res.text();
  if (html.length < 500) throw new Error(`Response too short (${html.length} bytes) for ${url}`);
  const $ = load(html);

  // Pass 1: well-known TTO selectors — pick the LONGEST text from all matching elements
  for (const sel of DESCRIPTION_SELECTORS) {
    let bestMatch = "";
    $(sel).each((_, el) => {
      const text = cleanText(stripHtml($(el).html() ?? $(el).text()));
      // Ignore obvious navigation / boilerplate (short, or contains nav keywords)
      if (text.length > bestMatch.length && text.length >= MIN_USEFUL_LENGTH) {
        bestMatch = text;
      }
    });
    if (bestMatch.length >= MIN_USEFUL_LENGTH) return { abstract: bestMatch.slice(0, 5000) };
  }

  // Pass 2: Next.js dehydrated state
  const ndm = NEXT_DATA_RE.exec(html);
  if (ndm) {
    try {
      const nd = JSON.parse(ndm[1]) as Record<string, unknown>;
      const queries: Record<string, unknown>[] =
        (((nd?.props as Record<string, unknown>)?.pageProps as Record<string, unknown>)
          ?.dehydratedState as Record<string, unknown>)?.queries as Record<string, unknown>[] ?? [];
      for (const q of queries) {
        const data = (q?.state as Record<string, unknown>)?.data as Record<string, unknown>;
        if (!data) continue;
        const details = (data?.details ?? data) as Record<string, unknown>;
        const desc = String(
          details?.description ?? details?.abstract ?? details?.body ?? details?.precis ?? ""
        ).trim();
        if (desc.length >= MIN_USEFUL_LENGTH) return { abstract: desc.slice(0, 5000) };
      }
    } catch {}
  }

  // Pass 3: concatenate all <p> tags inside #content / main — covers most TTO page layouts
  const contentParas: string[] = [];
  $("#content p, #main-content p, main p, article p").each((_, el) => {
    const t = cleanText($(el).text());
    if (t.length >= 30) contentParas.push(t);
  });
  if (contentParas.length > 0) {
    const combined = contentParas.join(" ").slice(0, 5000);
    if (combined.length >= MIN_USEFUL_LENGTH) return { abstract: combined };
  }

  // Pass 4: largest single <p> anywhere on the page
  let bestPara = "";
  $("p").each((_, el) => {
    const t = cleanText($(el).text());
    if (t.length > bestPara.length) bestPara = t;
  });
  if (bestPara.length >= MIN_USEFUL_LENGTH) return { abstract: bestPara.slice(0, 5000) };

  return null;
}

async function processGeneric(assets: AssetRow[]): Promise<void> {
  const platform = "generic";
  initStats(platform, assets.length);
  if (assets.length === 0) return;

  // Group by domain for progress clarity
  const domainCounts: Record<string, number> = {};
  for (const row of assets) {
    try {
      const domain = new URL(row.source_url).hostname;
      domainCounts[domain] = (domainCounts[domain] ?? 0) + 1;
    } catch {}
  }
  const topDomains = Object.entries(domainCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([d, c]) => `${d} (${c})`)
    .join(", ");
  console.log(`\n[${platform}] ${assets.length} thin assets across domains: ${topDomains}`);

  for (let i = 0; i < assets.length; i += CONCURRENCY) {
    const batch = assets.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (row) => {
      try {
        const result = await fetchGenericAbstract(row.source_url);
        if (result) {
          await queueWrite(row.id, result);
          stats[platform].fetched++;
          trackInst(row.institution, "fetched");
        } else {
          stats[platform].skipped++;
          trackInst(row.institution, "skipped");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`\n  [${platform}] FAIL id=${row.id} url=${row.source_url}: ${msg}`);
        stats[platform].failed++;
        trackInst(row.institution, "failed");
      }
      logProgress(platform);
    }));
    if (i + CONCURRENCY < assets.length) await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  await flushWriteBatch();
  console.log(`\n  [${platform}] Done.`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Summary report
// ══════════════════════════════════════════════════════════════════════════════

async function printInstitutionSummary(): Promise<void> {
  const rows = await db.execute<{ institution: string; thin_count: string; has_text: string }>(sql`
    SELECT institution,
      SUM(CASE WHEN char_length(COALESCE(abstract,'') || COALESCE(summary,'')) < 50 THEN 1 ELSE 0 END)::int AS thin_count,
      SUM(CASE WHEN char_length(COALESCE(abstract,'') || COALESCE(summary,'')) >= 50 THEN 1 ELSE 0 END)::int AS has_text
    FROM ingested_assets
    WHERE relevant = true
      AND source_url IS NOT NULL AND source_url != ''
    GROUP BY institution
    HAVING SUM(CASE WHEN char_length(COALESCE(abstract,'') || COALESCE(summary,'')) < 50 THEN 1 ELSE 0 END) > 0
    ORDER BY 2 DESC
    LIMIT 20
  `);

  console.log("\nTop institutions still with thin assets after backfill:");
  for (const r of rows.rows) {
    console.log(`  ${r.institution}: ${r.thin_count} thin remaining (${r.has_text} have text)`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("=== Abstract Backfill Script ===");
  if (DRY_RUN) console.log("DRY RUN — no writes to DB");
  if (ONLY_PLATFORM) console.log(`Platform filter: ${ONLY_PLATFORM}`);
  if (GLOBAL_LIMIT !== Infinity) console.log(`Global limit: ${GLOBAL_LIMIT}`);

  // Count candidates before
  const beforeRow = await db.execute<{ total: string }>(sql`
    SELECT COUNT(*)::int AS total
    FROM ingested_assets
    WHERE relevant = true
      AND char_length(COALESCE(summary,'') || COALESCE(abstract,'')) < ${TEXT_THIN_THRESHOLD}
      AND source_url IS NOT NULL AND source_url != ''
  `);
  const totalBefore = Number(beforeRow.rows[0]?.total ?? 0);
  console.log(`\nThin assets (< ${TEXT_THIN_THRESHOLD} chars) with source URL: ${totalBefore}`);

  // Build platform filter clause for SQL (avoids loading irrelevant platforms when --platform is set)
  const platformFilter =
    ONLY_PLATFORM === "techlink"      ? sql`AND source_url ILIKE '%techlinkcenter%'` :
    ONLY_PLATFORM === "techpublisher" ? sql`AND source_url ILIKE '%technologypublisher%'` :
    ONLY_PLATFORM === "flintbox"      ? sql`AND source_url ILIKE '%flintbox%'` :
    ONLY_PLATFORM === "generic"       ? sql`AND source_url NOT ILIKE '%techlinkcenter%'
                                            AND source_url NOT ILIKE '%technologypublisher%'
                                            AND source_url NOT ILIKE '%flintbox%'` :
    sql``;

  // Load all thin assets
  const allRows = await db.execute<AssetRow>(sql`
    SELECT id, source_url, institution, asset_name
    FROM ingested_assets
    WHERE relevant = true
      AND char_length(COALESCE(summary,'') || COALESCE(abstract,'')) < ${TEXT_THIN_THRESHOLD}
      AND source_url IS NOT NULL AND source_url != ''
      ${platformFilter}
    ORDER BY COALESCE(completeness_score, 0) DESC, institution
    LIMIT ${GLOBAL_LIMIT === Infinity ? 100000 : GLOBAL_LIMIT}
  `);

  const all = allRows.rows;

  // Classify by platform
  const techlink    = all.filter(r => /techlinkcenter/i.test(r.source_url));
  const techpub     = all.filter(r => /technologypublisher/i.test(r.source_url));
  const flintbox    = all.filter(r => /flintbox/i.test(r.source_url));
  const generic     = all.filter(r =>
    !/techlinkcenter|technologypublisher|flintbox/i.test(r.source_url)
  );

  console.log(`\nPlatform breakdown:`);
  console.log(`  TechLink:          ${techlink.length}`);
  console.log(`  TechnologyPublisher: ${techpub.length}`);
  console.log(`  Flintbox:          ${flintbox.length}`);
  console.log(`  Generic HTML:      ${generic.length}`);
  console.log(`  Total:             ${all.length}`);

  const startMs = Date.now();

  if (!ONLY_PLATFORM || ONLY_PLATFORM === "techlink")    await processTechLink(techlink);
  if (!ONLY_PLATFORM || ONLY_PLATFORM === "techpublisher") await processTechPublisher(techpub);
  if (!ONLY_PLATFORM || ONLY_PLATFORM === "flintbox")    await processFlintbox(flintbox);
  if (!ONLY_PLATFORM || ONLY_PLATFORM === "generic")     await processGeneric(generic);

  const durationS = ((Date.now() - startMs) / 1000).toFixed(1);

  // Platform-level summary
  console.log("\n\n=== Final Summary ===");
  let totalFetched = 0;
  let totalSkipped = 0;
  let totalFailed  = 0;
  for (const [platform, s] of Object.entries(stats)) {
    console.log(`  [${platform}]  ✓ fetched=${s.fetched}  skip=${s.skipped}  ✗ failed=${s.failed}  total=${s.total}`);
    totalFetched += s.fetched;
    totalSkipped += s.skipped;
    totalFailed  += s.failed;
  }
  console.log(`\n  Total fetched: ${totalFetched}`);
  console.log(`  Total skipped: ${totalSkipped}`);
  console.log(`  Total failed:  ${totalFailed}`);
  console.log(`  Duration:      ${durationS}s`);
  if (DRY_RUN) console.log("  (DRY RUN — no writes made)");

  // Per-institution summary (requested: fetched / skipped / failed per institution)
  if (instStats.size > 0) {
    console.log("\n=== Per-Institution Results ===");
    // Sort by fetched desc, then by institution name
    const sorted = [...instStats.entries()].sort(([, a], [, b]) => {
      const aTotal = a.fetched + a.skipped + a.failed;
      const bTotal = b.fetched + b.skipped + b.failed;
      if (b.fetched !== a.fetched) return b.fetched - a.fetched;
      return bTotal - aTotal;
    });
    for (const [inst, s] of sorted) {
      const parts = [`✓ ${s.fetched}`, `skip ${s.skipped}`];
      if (s.failed > 0) parts.push(`✗ ${s.failed}`);
      console.log(`  ${inst}: ${parts.join("  ")}`);
    }
  }

  if (!DRY_RUN) {
    // Count remaining thin assets
    const afterRow = await db.execute<{ total: string }>(sql`
      SELECT COUNT(*)::int AS total
      FROM ingested_assets
      WHERE relevant = true
        AND char_length(COALESCE(summary,'') || COALESCE(abstract,'')) < ${TEXT_THIN_THRESHOLD}
        AND source_url IS NOT NULL AND source_url != ''
    `);
    const totalAfter = Number(afterRow.rows[0]?.total ?? 0);
    const pct = totalBefore > 0 ? Math.round(((totalBefore - totalAfter) / totalBefore) * 100) : 0;
    console.log(`\n  Thin assets BEFORE: ${totalBefore}`);
    console.log(`  Thin assets AFTER:  ${totalAfter}`);
    console.log(`  Improvement:        ${totalBefore - totalAfter} assets upgraded (${pct}%)`);

    await printInstitutionSummary();
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[backfill-abstracts] Fatal:", err);
  pool.end().catch(() => {});
  process.exit(1);
});
