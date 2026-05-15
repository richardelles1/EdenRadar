/**
 * Deal Comparables Ingestion Script — SEC EDGAR (v2, Item 1.01 pre-filter)
 *
 * Key improvements over v1:
 *  - Filters for Item 1.01 ("Entry into Material Definitive Agreement") using
 *    the items[] array already present in the submissions JSON — NO extra HTTP
 *    request per filing needed. Cuts 90%+ of HTML fetches.
 *  - Fetches Exhibit 99.1 press releases first (full deal details) instead of
 *    the terse 8-K body text.
 *  - Passes filing company name to GPT so licensor/licensee fields are populated.
 *  - Rejects records where both licensor AND licensee are null (garbage records).
 *  - Smaller company set, faster runtime, lower cost.
 *
 * Run: tsx scripts/ingest-deal-comparables.ts
 * Safe to re-run: skips accession numbers already in DB.
 */

import "dotenv/config";
import { Pool } from "pg";
import OpenAI from "openai";

// ── Config ────────────────────────────────────────────────────────────────────

const START_DATE = "2020-01-01";
const GPT_BATCH_SIZE = 15;
const REQUEST_DELAY_MS = 220;

// Fewer SIC codes, more companies per SIC — pharma heavy-hitters
const PHARMA_BIOTECH_SIC = [2836, 8731, 2835];
const MAX_CIKS_PER_SIC = 400;
const CIK_PAGE_SIZE = 100;

const SEC_BASE = "https://www.sec.gov";
const DATA_SEC_BASE = "https://data.sec.gov";
const USER_AGENT = "EdenRadar info@edenradar.com";

const CANONICAL_MODALITIES = [
  "small molecule", "antibody", "gene therapy", "cell therapy", "RNA/siRNA",
  "peptide", "protein/biologics", "vaccine", "diagnostic", "medical device",
  "platform", "bispecific antibody", "CAR-T cell therapy", "oligonucleotide", "other",
];

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

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface FilingMeta {
  accNo: string;
  filingDate: string;
  items: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url: string, opts: RequestInit = {}, retries = 3): Promise<Response> {
  const headers = { "User-Agent": USER_AGENT, ...((opts.headers as Record<string, string>) ?? {}) };
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { ...opts, headers });
      if (res.status === 429) {
        console.warn(`[sec] Rate limited — backing off 15s`);
        await sleep(15000);
        continue;
      }
      if (res.status === 403 || res.status === 404) return res; // don't retry 4xx
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(1500 * (i + 1));
    }
  }
  throw new Error(`fetchWithRetry exhausted for ${url}`);
}

// ── CIK Collection ────────────────────────────────────────────────────────────

async function getCiksBySic(sic: number, max = MAX_CIKS_PER_SIC): Promise<string[]> {
  const results: string[] = [];
  let start = 0;

  while (results.length < max) {
    await sleep(REQUEST_DELAY_MS);
    const url = `${SEC_BASE}/cgi-bin/browse-edgar?action=getcompany&SIC=${sic}&type=&dateb=&owner=include&count=${CIK_PAGE_SIZE}&search_text=&start=${start}&output=atom`;
    try {
      const res = await fetchWithRetry(url);
      if (!res.ok) break;
      const xml = await res.text();
      const cikMatches = [...xml.matchAll(/<cik>(\d+)<\/cik>/g)];
      if (cikMatches.length === 0) break;
      for (const m of cikMatches) {
        results.push(m[1].padStart(10, "0"));
      }
      if (cikMatches.length < CIK_PAGE_SIZE) break;
      start += CIK_PAGE_SIZE;
    } catch (err) {
      console.error(`[browse-edgar] SIC=${sic}:`, err instanceof Error ? err.message : err);
      break;
    }
  }

  return results.slice(0, max);
}

// ── Submissions API: collect Item 1.01 8-K filings (no HTML fetch needed) ────

async function getItem101FilingsForCik(
  cik: string,
  since: string,
): Promise<{ name: string; filings: FilingMeta[] }> {
  await sleep(REQUEST_DELAY_MS);
  const url = `${DATA_SEC_BASE}/submissions/CIK${cik}.json`;
  try {
    const res = await fetchWithRetry(url);
    if (!res.ok) return { name: "", filings: [] };
    const data = await res.json();
    const name: string = data.name ?? "";
    const filings: FilingMeta[] = [];

    function extractFrom(block: Record<string, string[]>) {
      const forms: string[] = block.form ?? [];
      const dates: string[] = block.filingDate ?? [];
      const accNos: string[] = block.accessionNumber ?? [];
      const items: string[] = block.items ?? [];

      for (let i = 0; i < forms.length; i++) {
        if (forms[i] !== "8-K") continue;
        const filingDate = dates[i] ?? "";
        if (filingDate < since) continue;

        // KEY FILTER: only keep if Item 1.01 is reported
        // items[i] is a comma-separated string like "1.01,2.02,9.01"
        const itemStr = items[i] ?? "";
        if (!itemStr.includes("1.01")) continue;

        filings.push({
          accNo: accNos[i],
          filingDate,
          items: itemStr,
        });
      }
    }

    if (data.filings?.recent) {
      extractFrom(data.filings.recent);
    }

    // Also check archived filings that overlap our window
    const archiveFiles: Array<{ name: string; filingFrom: string; filingTo: string }> =
      data.filings?.files ?? [];

    for (const archiveFile of archiveFiles) {
      if (archiveFile.filingTo < since) continue;
      await sleep(REQUEST_DELAY_MS);
      try {
        const archRes = await fetchWithRetry(`${DATA_SEC_BASE}/submissions/${archiveFile.name}`);
        if (!archRes.ok) continue;
        const archData = await archRes.json();
        extractFrom(archData);
      } catch {
        // ignore individual archive failures
      }
    }

    return { name, filings };
  } catch (err) {
    console.error(`[submissions] CIK=${cik}:`, err instanceof Error ? err.message : err);
    return { name: "", filings: [] };
  }
}

// ── Filing Document Fetcher: prioritize Exhibit 99.1 press releases ───────────

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

function extractRelevantSection(text: string): string {
  // Try to find Item 1.01 section first
  const item101 = text.match(/item\s+1\.01[\s\S]{0,50}([\s\S]{200,}?)(?=item\s+[0-9]|signatures?|\*{3}|$)/i);
  if (item101) return item101[1].slice(0, 4000).trim();
  return text.slice(0, 4000).trim();
}

async function fetchFilingContent(cikNumeric: number, accNo: string): Promise<string | null> {
  const accNoDash = accNo.replace(/-/g, "");
  const indexUrl = `${SEC_BASE}/Archives/edgar/data/${cikNumeric}/${accNoDash}/${accNo}-index.htm`;

  await sleep(REQUEST_DELAY_MS);
  let indexHtml: string;
  try {
    const res = await fetchWithRetry(indexUrl);
    if (!res.ok) return null;
    indexHtml = await res.text();
  } catch {
    return null;
  }

  // Parse index for Exhibit 99.1 (press release) and 8-K body
  const base = `${SEC_BASE}/Archives/edgar/data/${cikNumeric}/${accNoDash}/`;
  let exhibit99: string | null = null;
  let mainDoc: string | null = null;

  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowPattern.exec(indexHtml)) !== null) {
    const row = m[1];
    const hrefMatch = row.match(/href="([^"]*\.htm[l]?)"/i);
    if (!hrefMatch) continue;
    const raw = hrefMatch[1];
    const docUrl = raw.startsWith("http") ? raw : new URL(raw, base).href;

    // Exhibit 99.1 / press release — highest priority
    if (/ex-99\.1|ex99[-_]1|exh?ibit\s*99\.1|press.?release|ex99\.1/i.test(row) && !exhibit99) {
      exhibit99 = docUrl;
    }
    // Main 8-K body
    if (/8-k|8k/i.test(row) && !mainDoc) {
      mainDoc = docUrl;
    }
  }

  // Prefer press release over 8-K body
  const targetUrl = exhibit99 ?? mainDoc;
  if (!targetUrl) return null;

  await sleep(REQUEST_DELAY_MS);
  try {
    const res = await fetchWithRetry(targetUrl, {
      headers: { "Range": "bytes=0-100000" },
    });
    if (!res.ok) return null;
    const raw = await res.text();
    const clean = stripHtml(raw);
    return extractRelevantSection(clean);
  } catch {
    return null;
  }
}

// ── GPT Extraction ────────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM = `You are a biotech deal analyst. Extract deal information from SEC 8-K filings.

IMPORTANT: Each filing input tells you the company that filed the 8-K. That company is ALWAYS one of the parties to the deal (either licensor or licensee). Use the company name for whichever role fits.

Return a JSON array (one object per filing). If a filing is NOT a pharma/biotech licensing, collaboration, or acquisition deal, set is_pharma_deal: false.

Fields to extract:
- licensor: company granting rights (string, required if deal exists — use filing company if they're the licensor)
- licensee: company receiving rights (string, required if deal exists — use filing company if they're the licensee)
- asset_name: drug/compound/program name if mentioned (string or null)
- indication: disease/condition (string or null)
- modality: one of [${CANONICAL_MODALITIES.join(", ")}] or null
- biology: one of [${CANONICAL_BIOLOGY.join(", ")}] or null
- therapeutic_area: oncology|immunology|neurology|cardiology|rare disease|infectious disease|metabolic|ophthalmology|dermatology|respiratory|gastroenterology|hematology|musculoskeletal|psychiatry|other
- deal_type: exclusive_license|non_exclusive_license|acquisition|co_development|option|other
- development_stage: discovery|preclinical|phase 1|phase 2|phase 3|approved or null
- upfront_usd: integer in USD (e.g. $50M → 50000000) or null
- total_value_usd: integer in USD or null
- milestone_details: brief summary of milestone structure (max 100 chars) or null
- geography: e.g. "worldwide", "US and Canada", "Asia-Pacific" or null
- is_pharma_deal: true/false

For licensor/licensee: if you cannot determine which role each company plays, set licensor to the filing company and licensee to the counterparty.`;

async function extractDealsFromBatch(
  batch: FilingInput[],
  openai: OpenAI,
): Promise<(ExtractedDeal | null)[]> {
  const userContent = batch
    .map((f, i) => `[${i}] Filing company: ${f.entityName} | Date: ${f.filingDate}\n${f.excerpt}`)
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
          content: `Extract deals from these ${batch.length} 8-K filings. Return JSON: {"results": [/* ${batch.length} objects */]}\n\n${userContent}`,
        },
      ],
      max_tokens: 3000,
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const results: ExtractedDeal[] = Array.isArray(parsed.results)
      ? parsed.results
      : Array.isArray(parsed) ? parsed : [];

    while (results.length < batch.length) results.push(null as unknown as ExtractedDeal);
    return results.slice(0, batch.length);
  } catch (err) {
    console.error(`[gpt] Batch error:`, err instanceof Error ? err.message : err);
    return batch.map(() => null);
  }
}

// ── DB ─────────────────────────────────────────────────────────────────────────

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
    // Reject records with no party names at all — they're useless
    if (!r.deal.licensor && !r.deal.licensee) continue;
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
          r.deal.upfront_usd ? BigInt(Math.round(Number(r.deal.upfront_usd))) : null,
          r.deal.total_value_usd ? BigInt(Math.round(Number(r.deal.total_value_usd))) : null,
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

  let totalWritten = 0;
  let totalGptBatches = 0;
  let totalNotPharma = 0;
  let totalNoParties = 0;
  let totalExcerptFailed = 0;

  // ── Phase 1: Collect CIKs ──────────────────────────────────────────────────
  console.log(`[ingest] Phase 1: collecting company CIKs…`);
  const cikSet = new Set<string>();

  for (const sic of PHARMA_BIOTECH_SIC) {
    const ciks = await getCiksBySic(sic);
    for (const c of ciks) cikSet.add(c);
    console.log(`  SIC ${sic} → ${ciks.length} companies (${cikSet.size} unique total)`);
  }
  console.log(`[ingest] ${cikSet.size} unique companies\n`);

  // ── Phase 2: Collect Item 1.01 8-K filings (no HTML fetch!) ───────────────
  console.log(`[ingest] Phase 2: finding Item 1.01 8-K filings since ${START_DATE}…`);
  const allFilings = new Map<string, { cik: string; name: string; filing: FilingMeta }>();

  let cikProgress = 0;
  for (const cik of cikSet) {
    cikProgress++;
    if (cikProgress % 100 === 0) {
      console.log(`  [${cikProgress}/${cikSet.size}] Item 1.01 filings found: ${allFilings.size}`);
    }
    const { name, filings } = await getItem101FilingsForCik(cik, START_DATE);
    for (const filing of filings) {
      if (!allFilings.has(filing.accNo)) {
        allFilings.set(filing.accNo, { cik, name, filing });
      }
    }
  }

  const allAccNos = Array.from(allFilings.keys());
  console.log(`[ingest] ${allAccNos.length.toLocaleString()} Item 1.01 filings found\n`);

  // ── Phase 3: Skip already-processed ───────────────────────────────────────
  const CHUNK = 500;
  const existingSet = new Set<string>();
  for (let i = 0; i < allAccNos.length; i += CHUNK) {
    const chunk = allAccNos.slice(i, i + CHUNK);
    const existing = await getExistingAccessions(pool, chunk);
    for (const a of existing) existingSet.add(a);
  }
  const newAccNos = allAccNos.filter(a => !existingSet.has(a));
  console.log(`[ingest] ${existingSet.size} already in DB → ${newAccNos.length} to process\n`);

  if (newAccNos.length === 0) {
    console.log("[ingest] Nothing new. Done.");
    await pool.end();
    return;
  }

  // ── Phase 4: Fetch content & GPT extract ──────────────────────────────────
  console.log(`[ingest] Phase 4: fetching press releases + GPT extraction…`);

  const processBatch: FilingInput[] = [];

  async function flushBatch() {
    if (processBatch.length === 0) return;
    totalGptBatches++;
    const results = await extractDealsFromBatch(processBatch, openai);

    const toWrite: Array<{ accNo: string; filingDate: string; filingUrl: string; excerpt: string; deal: ExtractedDeal }> = [];
    for (let i = 0; i < processBatch.length; i++) {
      const deal = results[i];
      const input = processBatch[i];
      if (!deal) continue;
      if (!deal.is_pharma_deal) { totalNotPharma++; continue; }
      const cikNum = parseInt(input.entityId, 10);
      toWrite.push({
        accNo: input.accNo,
        filingDate: input.filingDate,
        filingUrl: `${SEC_BASE}/Archives/edgar/data/${cikNum}/${input.accNo.replace(/-/g, "")}/${input.accNo}-index.htm`,
        excerpt: input.excerpt,
        deal,
      });
    }

    const written = await upsertDeals(pool, toWrite);
    totalNoParties += toWrite.length - written;
    totalWritten += written;
    processBatch.length = 0;

    console.log(
      `[ingest] Batch ${totalGptBatches} — written: ${written} | Total: ${totalWritten} ` +
      `(not pharma: ${totalNotPharma}, no parties: ${totalNoParties})`,
    );
  }

  let processed = 0;
  for (const accNo of newAccNos) {
    const meta = allFilings.get(accNo)!;
    processed++;

    if (processed % 100 === 0) {
      console.log(`[ingest] Progress: ${processed}/${newAccNos.length} — DB total: ${totalWritten}`);
    }

    const cikNumeric = parseInt(meta.cik, 10);
    const excerpt = await fetchFilingContent(cikNumeric, accNo);
    if (!excerpt || excerpt.length < 80) {
      totalExcerptFailed++;
      continue;
    }

    processBatch.push({
      entityId: meta.cik,
      accNo,
      filingDate: meta.filing.filingDate,
      entityName: meta.name || "Unknown Company",
      excerpt,
    });

    if (processBatch.length >= GPT_BATCH_SIZE) {
      await flushBatch();
    }
  }

  await flushBatch();
  await pool.end();

  // Final count
  const pool2 = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const finalRow = await pool2.query("SELECT COUNT(*) FROM deal_comparables");
  await pool2.end();
  const finalCount = parseInt(finalRow.rows[0].count, 10);

  console.log(`
╔═══════════════════════════════════════════════════════╗
║       Deal Comparables Ingestion Complete (v2)        ║
╠═══════════════════════════════════════════════════════╣
║  Item 1.01 filings processed: ${String(newAccNos.length).padStart(6)}                ║
║  Excerpt fetch failures:      ${String(totalExcerptFailed).padStart(6)}                ║
║  GPT batches:                 ${String(totalGptBatches).padStart(6)}                ║
║  Not pharma deals:            ${String(totalNotPharma).padStart(6)}                ║
║  Records written this run:    ${String(totalWritten).padStart(6)}                ║
║  Total in DB:                 ${String(finalCount).padStart(6)}                ║
╚═══════════════════════════════════════════════════════╝`);

  if (finalCount < 500) {
    console.log(`\n⚠  Target is 500 — re-run to continue ingesting (safe to re-run, skips existing).`);
  } else {
    console.log(`\n✓  Target of 500 records met!`);
  }
}

main().catch(err => {
  console.error("[ingest] Fatal:", err);
  process.exit(1);
});
