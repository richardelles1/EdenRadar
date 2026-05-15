/**
 * Deal Comparables Ingestion Script — SEC EDGAR 8-K Filings
 *
 * Scrapes SEC EDGAR full-text search for biotech/pharma licensing & acquisition
 * deals from the past 5 years, extracts structured deal fields via GPT-4o-mini,
 * and upserts to the deal_comparables table in Supabase.
 *
 * Architecture: offline job → Supabase archive → fast product read
 * Run: tsx scripts/ingest-deal-comparables.ts
 * Safe to re-run: skips accession numbers already in DB.
 */

import "dotenv/config";
import { Pool } from "pg";
import OpenAI from "openai";

// ── Config ────────────────────────────────────────────────────────────────────

const START_DATE = "2021-01-01";
const END_DATE = new Date().toISOString().slice(0, 10);
const GPT_BATCH_SIZE = 50;
const REQUEST_DELAY_MS = 200; // 5 req/sec — well within EDGAR's 10 req/sec limit
const SIC_DELAY_MS = 50; // lighter rate for metadata lookups
const SIC_CONCURRENCY = 8; // parallel SIC lookups

// Search queries targeting pharma/biotech licensing deals specifically
const SEARCH_QUERIES = [
  '"license agreement" "milestone" "clinical" "therapeutic"',
  '"exclusive license" "upfront payment" "royalt"',
  '"collaboration agreement" "license" "FDA" "IND" "milestone"',
  '"co-development" "license" "milestone payments" "pharma"',
];

// EDGAR SIC codes for pharma/biotech companies
// 2836 = pharmaceutical preparations / biologics
// 2835 = in-vitro/in-vivo diagnostic substances
// 2830 = drugs
// 2833 = medicinal chemicals & botanicals
// 2834 = pharmaceutical preparations (alt)
// 8731 = commercial physical & biological research
const PHARMA_BIOTECH_SIC = new Set([2836, 2835, 2830, 2833, 2834, 8731]);

// Canonical modality values matching our ingested_assets taxonomy
const CANONICAL_MODALITIES = [
  "small molecule", "antibody", "gene therapy", "cell therapy", "RNA/siRNA",
  "peptide", "protein/biologics", "vaccine", "diagnostic", "medical device",
  "platform", "bispecific antibody", "CAR-T cell therapy", "oligonucleotide", "other",
];

// Canonical biology values (32-value closed taxonomy)
const CANONICAL_BIOLOGY = [
  "oncogenic transcription", "immune evasion", "pathogen replication", "angiogenesis",
  "DNA damage repair", "inflammation", "receptor signaling", "metabolic dysregulation",
  "protein aggregation", "cell cycle dysregulation", "apoptosis resistance",
  "epigenetic dysregulation", "ion channel dysfunction", "fibrosis", "neurodegeneration",
  "viral entry", "bacterial membrane disruption", "hormone dysregulation",
  "autophagy dysregulation", "complement activation", "oxidative stress",
  "mitochondrial dysfunction", "lysosomal storage", "coagulation dysregulation",
  "microbiome dysbiosis", "bone remodeling", "vascular inflammation",
  "tumor microenvironment", "immune checkpoint", "mTOR pathway", "Wnt pathway", "MAPK pathway",
];

const EDGAR_BASE = "https://efts.sec.gov/EDGAR/search-api/v2/hits";
const SEC_BASE = "https://www.sec.gov";
const USER_AGENT = "EdenRadar info@edenradar.com";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EdgarHit {
  _source: {
    entity_id: string;
    accession_no: string;
    file_date: string;
    display_names?: Array<{ name: string }>;
    form_type: string;
  };
}

interface ExtractedDeal {
  licensor: string | null;
  licensee: string | null;
  asset_name: string | null;
  indication: string | null;
  modality: string | null;
  biology: string | null;
  therapeutic_area: string | null;
  deal_type: string | null;
  development_stage: string | null;
  upfront_usd: number | null;
  total_value_usd: number | null;
  milestone_details: string | null;
  geography: string | null;
  is_pharma_deal: boolean;
}

interface FilingInput {
  entityId: string;
  accNo: string;
  filingDate: string;
  entityName: string;
  excerpt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url: string, opts: RequestInit = {}, retries = 3): Promise<Response> {
  const headers = { "User-Agent": USER_AGENT, ...((opts.headers as Record<string, string>) ?? {}) };
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { ...opts, headers });
      if (res.status === 429) {
        console.warn(`[edgar] Rate limited — backing off 5s`);
        await sleep(5000);
        continue;
      }
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(1000 * (i + 1));
    }
  }
  throw new Error(`fetchWithRetry exhausted for ${url}`);
}

// ── EDGAR Search ──────────────────────────────────────────────────────────────

async function searchEdgar(query: string, from: number): Promise<{ hits: EdgarHit[]; total: number }> {
  const url = new URL(EDGAR_BASE);
  url.searchParams.set("q", query);
  url.searchParams.set("forms", "8-K");
  url.searchParams.set("dateRange", "custom");
  url.searchParams.set("startdt", START_DATE);
  url.searchParams.set("enddt", END_DATE);
  url.searchParams.set("from", String(from));

  await sleep(REQUEST_DELAY_MS);
  const res = await fetchWithRetry(url.toString());
  if (!res.ok) throw new Error(`EDGAR EFTS ${res.status} for query: ${query}`);
  const data = await res.json();
  return {
    hits: data.hits?.hits ?? [],
    total: data.hits?.total?.value ?? 0,
  };
}

// ── SIC Filter ────────────────────────────────────────────────────────────────

const sicCache = new Map<string, number | null>(); // CIK → SIC code

async function getCompanySic(entityId: string): Promise<number | null> {
  if (sicCache.has(entityId)) return sicCache.get(entityId)!;
  const padded = entityId.padStart(10, "0");
  await sleep(SIC_DELAY_MS);
  try {
    const res = await fetchWithRetry(`https://data.sec.gov/submissions/CIK${padded}.json`);
    if (!res.ok) { sicCache.set(entityId, null); return null; }
    const data = await res.json();
    const sic = typeof data.sic === "string" ? parseInt(data.sic, 10) : typeof data.sic === "number" ? data.sic : null;
    sicCache.set(entityId, Number.isFinite(sic as number) ? (sic as number) : null);
    return sicCache.get(entityId)!;
  } catch {
    sicCache.set(entityId, null);
    return null;
  }
}

/** Filter a map of entity→hit-meta to only pharma/biotech SIC codes. */
async function filterToPharma(
  hits: Map<string, { entityId: string; filingDate: string; entityName: string; filingUrl: string }>,
): Promise<Map<string, { entityId: string; filingDate: string; entityName: string; filingUrl: string }>> {
  const entries = Array.from(hits.entries());
  const result = new Map<string, { entityId: string; filingDate: string; entityName: string; filingUrl: string }>();

  // Unique company IDs to look up
  const uniqueEntityIds = [...new Set(entries.map(([, v]) => v.entityId))];
  console.log(`[sic] Looking up SIC codes for ${uniqueEntityIds.length} unique companies…`);

  // Batch concurrent SIC lookups
  for (let i = 0; i < uniqueEntityIds.length; i += SIC_CONCURRENCY) {
    const batch = uniqueEntityIds.slice(i, i + SIC_CONCURRENCY);
    await Promise.all(batch.map(eid => getCompanySic(eid)));
    if ((i + SIC_CONCURRENCY) % 200 === 0) {
      process.stdout.write(`  [${Math.min(i + SIC_CONCURRENCY, uniqueEntityIds.length)}/${uniqueEntityIds.length}]\r`);
    }
  }

  // Apply SIC filter
  let kept = 0, dropped = 0;
  for (const [accNo, meta] of entries) {
    const sic = sicCache.get(meta.entityId) ?? null;
    if (sic !== null && PHARMA_BIOTECH_SIC.has(sic)) {
      result.set(accNo, meta);
      kept++;
    } else {
      dropped++;
    }
  }
  console.log(`[sic] Filter result: ${kept} pharma/biotech filings kept, ${dropped} dropped (non-pharma SIC or unknown)`);
  return result;
}

// ── Filing Document Fetcher ───────────────────────────────────────────────────

function parseIndexForDocs(html: string, accNoDash: string, entityId: string): { primary: string | null; pressRelease: string | null } {
  let primary: string | null = null;
  let pressRelease: string | null = null;

  const base = `${SEC_BASE}/Archives/edgar/data/${entityId}/${accNoDash}/`;

  // Parse rows from the EDGAR filing index table
  // Each row: <tr><td>seq</td><td>desc</td><td><a href="...">filename</a></td><td>type</td>...</tr>
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowPattern.exec(html)) !== null) {
    const row = m[1];
    const hrefMatch = row.match(/href="([^"]*\.htm[^"]*)"/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    const docUrl = href.startsWith("http") ? href : new URL(href, base).href;

    if (/ex-99\.1|ex99-1|ex99_1|press/i.test(row) && !pressRelease) {
      pressRelease = docUrl;
    } else if (/8-k|8k/i.test(row) && !primary) {
      primary = docUrl;
    }
  }

  // Fallback: any .htm link in the document
  if (!primary) {
    const anyHref = html.match(/href="([^"]*\.htm[^"]*)"/i);
    if (anyHref) primary = anyHref[1].startsWith("http") ? anyHref[1] : new URL(anyHref[1], base).href;
  }

  return { primary, pressRelease };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#[0-9]+;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractItem101(text: string): string {
  // Try to isolate Item 1.01 section
  const m = text.match(/item\s+1\.01[\s\S]{0,30}([\s\S]{200,}?)(?=item\s+[0-9]|signatures?|$)/i);
  if (m) return m[1].slice(0, 3500).trim();
  return text.slice(0, 3500).trim();
}

async function fetchFilingExcerpt(entityId: string, accNo: string): Promise<string | null> {
  const accNoDash = accNo.replace(/-/g, "");
  const indexUrl = `${SEC_BASE}/Archives/edgar/data/${entityId}/${accNoDash}/${accNo}-index.htm`;

  await sleep(REQUEST_DELAY_MS);
  let indexHtml: string;
  try {
    const res = await fetchWithRetry(indexUrl);
    if (!res.ok) return null;
    indexHtml = await res.text();
  } catch {
    return null;
  }

  const { primary, pressRelease } = parseIndexForDocs(indexHtml, accNoDash, entityId);

  // Prefer press release (more often has financial terms in plain English)
  const targetUrl = pressRelease ?? primary;
  if (!targetUrl) return null;

  await sleep(REQUEST_DELAY_MS);
  let docText: string;
  try {
    const res = await fetchWithRetry(targetUrl, {
      headers: { "Range": "bytes=0-80000" },
    });
    if (!res.ok) return null;
    docText = await res.text();
  } catch {
    return null;
  }

  const clean = stripHtml(docText);
  return extractItem101(clean);
}

// ── GPT Extraction ────────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM = `You are a biotech deal analyst. Extract structured information from SEC 8-K filing excerpts describing pharma/biotech licensing, acquisition, or collaboration deals.
Return a JSON array where each element corresponds to one filing input (in order). If a filing is not a pharma/biotech deal, set is_pharma_deal: false and leave other fields null.

Canonical modalities (use exact values or null): ${CANONICAL_MODALITIES.join(", ")}
Canonical biology (use exact values or null): ${CANONICAL_BIOLOGY.join(", ")}
Deal types (use exact): exclusive_license, non_exclusive_license, acquisition, co_development, option, other
Development stages (use exact): discovery, preclinical, phase 1, phase 2, phase 3, approved
Therapeutic areas (use standard): oncology, immunology, neurology, cardiology, rare disease, infectious disease, metabolic, ophthalmology, dermatology, respiratory, gastroenterology, hematology, musculoskeletal, psychiatry, other

For financial fields: upfront_usd and total_value_usd are integers in USD (e.g. "$50M upfront" → 50000000). If not disclosed, use null.
For milestone_details: brief plain-English summary of milestone structure (max 120 chars), or null.`;

async function extractDealsFromBatch(
  batch: FilingInput[],
  openai: OpenAI,
): Promise<(ExtractedDeal | null)[]> {
  const userContent = batch
    .map((f, i) => `[${i}] Company: ${f.entityName} | Date: ${f.filingDate}\n${f.excerpt}`)
    .join("\n\n---\n\n");

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM },
        {
          role: "user",
          content: `Extract deal information from these ${batch.length} filings. Return JSON: {"results": [...array of ${batch.length} objects...]}\n\n${userContent}`,
        },
      ],
      max_tokens: 4000,
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const results: ExtractedDeal[] = Array.isArray(parsed.results)
      ? parsed.results
      : Array.isArray(parsed) ? parsed : [];

    // Pad with nulls if GPT returned fewer items than batch size
    while (results.length < batch.length) results.push(null as unknown as ExtractedDeal);
    return results.slice(0, batch.length);
  } catch (err) {
    console.error(`[gpt] Batch extraction error:`, err instanceof Error ? err.message : err);
    return batch.map(() => null);
  }
}

// ── DB Upsert ─────────────────────────────────────────────────────────────────

async function getExistingAccessions(pool: Pool, accNos: string[]): Promise<Set<string>> {
  if (accNos.length === 0) return new Set();
  const placeholders = accNos.map((_, i) => `$${i + 1}`).join(", ");
  const res = await pool.query(
    `SELECT accession_number FROM deal_comparables WHERE accession_number IN (${placeholders})`,
    accNos,
  );
  return new Set(res.rows.map((r: { accession_number: string }) => r.accession_number));
}

async function upsertDeals(
  pool: Pool,
  records: Array<{ accNo: string; filingDate: string; filingUrl: string; excerpt: string; deal: ExtractedDeal }>,
): Promise<number> {
  let written = 0;
  for (const r of records) {
    try {
      await pool.query(
        `INSERT INTO deal_comparables (
          accession_number, filing_date, licensor, licensee, asset_name, indication,
          modality, biology, therapeutic_area, deal_type, development_stage,
          upfront_usd, total_value_usd, milestone_details, geography,
          filing_url, raw_excerpt
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (accession_number) DO NOTHING`,
        [
          r.accNo,
          r.filingDate || null,
          r.deal.licensor,
          r.deal.licensee,
          r.deal.asset_name,
          r.deal.indication,
          r.deal.modality,
          r.deal.biology,
          r.deal.therapeutic_area,
          r.deal.deal_type,
          r.deal.development_stage,
          r.deal.upfront_usd,
          r.deal.total_value_usd,
          r.deal.milestone_details,
          r.deal.geography,
          r.filingUrl,
          r.excerpt.slice(0, 1000),
        ],
      );
      written++;
    } catch (err) {
      console.error(`[db] Upsert failed for ${r.accNo}:`, err instanceof Error ? err.message : err);
    }
  }
  return written;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dbUrl = process.env.SUPABASE_DATABASE_URL;
  if (!dbUrl) throw new Error("SUPABASE_DATABASE_URL not set");
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) throw new Error("OPENAI_API_KEY not set");

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const openai = new OpenAI({ apiKey: openaiKey });

  let totalFetched = 0;
  let totalSkipped = 0;
  let totalExcerptFailed = 0;
  let totalGptBatches = 0;
  let totalGptFailed = 0;
  let totalNotPharma = 0;
  let totalWritten = 0;

  // Collect all unique hits across all search queries (deduplicated by accession_no)
  const allHits = new Map<string, { entityId: string; filingDate: string; entityName: string; filingUrl: string }>();

  console.log(`[ingest] Collecting filings from EDGAR (${START_DATE} → ${END_DATE})…`);

  for (const query of SEARCH_QUERIES) {
    console.log(`[ingest] Query: ${query}`);
    let from = 0;
    let total = Infinity;

    while (from < total && from < 5000) { // cap at 5000 per query to stay reasonable
      try {
        const { hits, total: t } = await searchEdgar(query, from);
        if (from === 0) {
          total = Math.min(t, 5000);
          console.log(`  → ${t.toLocaleString()} total hits (capping at 5,000)`);
        }
        if (hits.length === 0) break; // no more results
        for (const hit of hits) {
          const accNo = hit._source.accession_no;
          if (!allHits.has(accNo)) {
            const entityId = hit._source.entity_id;
            const accNoDash = accNo.replace(/-/g, "");
            allHits.set(accNo, {
              entityId,
              filingDate: hit._source.file_date,
              entityName: hit._source.display_names?.[0]?.name ?? "Unknown Company",
              filingUrl: `${SEC_BASE}/Archives/edgar/data/${entityId}/${accNoDash}/${accNo}-index.htm`,
            });
          }
        }
        from += hits.length; // advance by actual returned count, not assumed page size
        process.stdout.write(`  [${from}/${total}]\r`);
      } catch (err) {
        console.error(`[edgar] Search error at from=${from}:`, err instanceof Error ? err.message : err);
        break;
      }
    }
    console.log(`  → Collected ${allHits.size} unique filings so far`);
  }

  // Apply SIC filter — keep only pharma/biotech companies
  const pharmaHits = await filterToPharma(allHits);
  const allAccNos = Array.from(pharmaHits.keys());
  totalFetched = allAccNos.length;
  console.log(`\n[ingest] ${totalFetched.toLocaleString()} unique filings to process`);

  // Check existing accessions in DB (in chunks to avoid huge IN clauses)
  const CHUNK = 500;
  const existingSet = new Set<string>();
  for (let i = 0; i < allAccNos.length; i += CHUNK) {
    const chunk = allAccNos.slice(i, i + CHUNK);
    const existing = await getExistingAccessions(pool, chunk);
    for (const a of existing) existingSet.add(a);
  }
  totalSkipped = existingSet.size;

  const newAccNos = allAccNos.filter(a => !existingSet.has(a));
  console.log(`[ingest] ${totalSkipped} already in DB → ${newAccNos.length} new pharma filings to fetch`);

  if (newAccNos.length === 0) {
    console.log("[ingest] Nothing new to ingest. Done.");
    await pool.end();
    return;
  }

  // Process in batches: fetch excerpts, then GPT extraction
  const processBatch: FilingInput[] = [];

  async function flushGptBatch() {
    if (processBatch.length === 0) return;
    totalGptBatches++;
    const results = await extractDealsFromBatch(processBatch, openai);

    const toWrite: typeof pendingUpserts = [];
    for (let i = 0; i < processBatch.length; i++) {
      const deal = results[i];
      const input = processBatch[i];
      if (!deal) { totalGptFailed++; continue; }
      if (!deal.is_pharma_deal) { totalNotPharma++; continue; }
      toWrite.push({
        accNo: input.accNo,
        filingDate: input.filingDate,
        filingUrl: `${SEC_BASE}/Archives/edgar/data/${input.entityId}/${input.accNo.replace(/-/g, "")}/${input.accNo}-index.htm`,
        excerpt: input.excerpt,
        deal,
      });
    }

    const written = await upsertDeals(pool, toWrite);
    totalWritten += written;
    processBatch.length = 0;

    console.log(
      `[ingest] Batch ${totalGptBatches} — GPT extracted: ${results.filter(Boolean).length}, pharma: ${toWrite.length}, written: ${written}` +
      ` | Total written: ${totalWritten} | Skipped: ${totalSkipped} | Not pharma: ${totalNotPharma}`,
    );
  }

  let processed = 0;
  for (const accNo of newAccNos) {
    const meta = pharmaHits.get(accNo)!;
    processed++;

    if (processed % 100 === 0) {
      console.log(`[ingest] Progress: ${processed}/${newAccNos.length} — fetching excerpts…`);
    }

    const excerpt = await fetchFilingExcerpt(meta.entityId, accNo);
    if (!excerpt || excerpt.length < 100) {
      totalExcerptFailed++;
      continue;
    }

    processBatch.push({
      entityId: meta.entityId,
      accNo,
      filingDate: meta.filingDate,
      entityName: meta.entityName,
      excerpt,
    });

    if (processBatch.length >= GPT_BATCH_SIZE) {
      await flushGptBatch();
    }
  }

  // Flush remaining
  await flushGptBatch();

  await pool.end();

  console.log(`
╔═══════════════════════════════════════════════════════╗
║           Deal Comparables Ingestion Complete          ║
╠═══════════════════════════════════════════════════════╣
║  EDGAR filings collected:   ${String(totalFetched).padStart(8)}                ║
║  Already in DB (skipped):   ${String(totalSkipped).padStart(8)}                ║
║  New filings processed:     ${String(newAccNos.length).padStart(8)}                ║
║  Excerpt fetch failed:      ${String(totalExcerptFailed).padStart(8)}                ║
║  GPT batches run:           ${String(totalGptBatches).padStart(8)}                ║
║  GPT extraction failed:     ${String(totalGptFailed).padStart(8)}                ║
║  Not pharma (skipped):      ${String(totalNotPharma).padStart(8)}                ║
║  Written to DB:             ${String(totalWritten).padStart(8)}                ║
╚═══════════════════════════════════════════════════════╝
`);
}

main().catch(err => {
  console.error("[ingest] Fatal error:", err);
  process.exit(1);
});
