/**
 * scripts/fill-dev-stage.ts
 *
 * Two-phase development stage fill for relevant assets missing `development_stage`.
 *
 * Phase 1 (regex, zero API cost):
 *   Runs a single SQL CTE over summary+abstract. Patterns are explicit and
 *   unambiguous — no fuzzy matching. Updates development_stage + enrichment_sources,
 *   then rescores completeness_score for every touched row.
 *
 * Phase 2 (LLM — gpt-4o-mini, temperature=0):
 *   For assets still missing stage with ≥120 chars of text, calls OpenAI with a
 *   tightly constrained system prompt that enumerates the exact allowed values.
 *   Only non-"unknown" responses are written. Rescores every touched row.
 *
 * Usage:
 *   npx tsx scripts/fill-dev-stage.ts [--dry-run] [--phase=1|2] [--cap=N]
 *
 * Environment: SUPABASE_DATABASE_URL, OPENAI_API_KEY
 */

import pg from "pg";
import OpenAI from "openai";
import { computeCompletenessScore } from "../server/lib/pipeline/contentHash.js";

// ── CLI ───────────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const phaseArg = process.argv.find((a) => a.startsWith("--phase="));
const ONLY_PHASE = phaseArg ? parseInt(phaseArg.split("=")[1], 10) : null;
const capArg = process.argv.find((a) => a.startsWith("--cap="));
const CAP = capArg ? parseInt(capArg.split("=")[1], 10) : 5000;

// ── DB ────────────────────────────────────────────────────────────────────────
const DB_URL = process.env.SUPABASE_DATABASE_URL;
if (!DB_URL) { console.error("ERROR: SUPABASE_DATABASE_URL not set"); process.exit(1); }
const pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

// ── Stage enum ────────────────────────────────────────────────────────────────
export const STAGE_ENUM = [
  "discovery", "preclinical", "IND filed",
  "phase 1", "phase 2", "phase 3", "commercial",
] as const;
export type StageValue = typeof STAGE_ENUM[number];

// ── Regex extraction (Node-side, for script summary; SQL-side for Phase 1 write) ─
const STAGE_PATTERNS: Array<{ pattern: RegExp; stage: StageValue }> = [
  // Commercial first (highest confidence)
  { pattern: /\bFDA[- ]approved\b|\bFDA[- ]cleared\b|\bcommercially available\b|\bmarketed drug\b|\bon the market\b|\bapproved for sale\b|\bpost[- ]market\b/i, stage: "commercial" },
  // Phase 3 before 2 before 1 (to avoid partial substring matches)
  { pattern: /\bphase\s*(?:III|3)\b(?!\s*\/)/i, stage: "phase 3" },
  { pattern: /\bphase\s*(?:II|2)\s*\/\s*(?:III|3)\b/i, stage: "phase 2" },
  { pattern: /\bphase\s*(?:II|2)\b(?!\s*\/)/i, stage: "phase 2" },
  { pattern: /\bphase\s*(?:I|1)\b|\bphase\s*(?:I|1)\s*\/\s*(?:II|2)\b/i, stage: "phase 1" },
  // IND
  { pattern: /\bIND\s+(?:filed|application|submitted|approved|enabling)\b|\bIND-enabling\b/i, stage: "IND filed" },
  // Discovery checked BEFORE preclinical's lead-optimization so "hit-to-lead optimization" → discovery
  { pattern: /\bdiscovery stage\b|\bearly[- ]stage discovery\b|\bhit[- ]to[- ]lead\b|\bhit identification\b|\btarget validation\b|\btarget discovery\b/i, stage: "discovery" },
  // Preclinical (lead opt + pre-clinical synonyms — after discovery to avoid overlap)
  { pattern: /\bpreclinical\b|\bpre[- ]clinical\b|\blead[- ]optimi[sz]ation\b/i, stage: "preclinical" },
];

export function extractStageByRegex(text: string): StageValue | null {
  for (const { pattern, stage } of STAGE_PATTERNS) {
    if (pattern.test(text)) return stage;
  }
  return null;
}

// ── LLM extraction ────────────────────────────────────────────────────────────
const STAGE_ENUM_STR = STAGE_ENUM.join(", ");
const SYSTEM_PROMPT = `You are a biotech development stage classifier.

Given a technology description, identify the development stage. You MUST respond with exactly one value from this list:
${STAGE_ENUM_STR}

Rules:
- Only return a stage that is EXPLICITLY and UNAMBIGUOUSLY stated in the text.
- If no clear stage signal exists, respond with: unknown
- Do not infer from indirect signals. "Animal studies" alone is not preclinical unless the text says preclinical.
- Do not respond with anything other than one of the listed values or "unknown".`;

export async function extractStageByLLM(
  text: string,
  openai: OpenAI,
): Promise<StageValue | "unknown" | null> {
  const truncated = text.slice(0, 1000);
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 20,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: truncated },
      ],
    });
    const raw = (resp.choices[0]?.message?.content ?? "").trim().toLowerCase();
    const matched = STAGE_ENUM.find((s) => s.toLowerCase() === raw);
    if (matched) return matched;
    if (raw === "unknown") return "unknown";
    return null; // invalid response — treat as skipped
  } catch {
    return null;
  }
}

// ── Rescore helper ────────────────────────────────────────────────────────────
interface ScoreRow {
  id: number;
  modality: string | null;
  indication: string | null;
  development_stage: string | null;
  summary: string | null;
  mechanism_of_action: string | null;
  ip_type: string | null;
  patent_status: string | null;
}

async function rescoreAssets(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { rows } = await pool.query<ScoreRow>(
    `SELECT id, modality, indication, development_stage, summary,
            mechanism_of_action, ip_type, patent_status
     FROM ingested_assets WHERE id = ANY($1)`,
    [ids],
  );

  if (rows.length === 0) return 0;

  const updates: Array<{ id: number; score: number }> = rows.map((r) => ({
    id: r.id,
    score: computeCompletenessScore({
      modality: r.modality,
      indication: r.indication,
      developmentStage: r.development_stage,
      summary: r.summary,
      mechanismOfAction: r.mechanism_of_action,
      ipType: r.ip_type,
      patentStatus: r.patent_status,
    }) ?? 0,
  }));

  if (DRY_RUN) return updates.length;

  // Batch UPDATE via VALUES table
  const placeholders = updates.map((_, i) => `($${i * 2 + 1}::int, $${i * 2 + 2}::real)`).join(", ");
  const params = updates.flatMap(({ id, score }) => [id, score]);
  await pool.query(
    `UPDATE ingested_assets ia
     SET completeness_score = tmp.score
     FROM (VALUES ${placeholders}) AS tmp(id, score)
     WHERE ia.id = tmp.id`,
    params,
  );
  return updates.length;
}

// ── Phase 1: SQL regex ────────────────────────────────────────────────────────
async function runPhase1(): Promise<{ filled: number; rescored: number }> {
  console.log("\n── Phase 1: SQL regex extraction ──");

  // Use a PostgreSQL CTE to classify and update in one round-trip.
  // We ordered the CASE branches to match the same priority as STAGE_PATTERNS above.
  const estimateRes = await pool.query<{ total: string }>(`
    SELECT COUNT(*)::int AS total
    FROM ingested_assets
    WHERE relevant = true
      AND (development_stage IS NULL OR development_stage IN ('unknown', ''))
      AND char_length(COALESCE(summary, '') || COALESCE(abstract, '')) >= 50
  `);
  const eligible = Number(estimateRes.rows[0]?.total ?? 0);
  console.log(`  Eligible assets: ${eligible.toLocaleString()}`);
  if (eligible === 0) return { filled: 0, rescored: 0 };

  if (DRY_RUN) {
    const dryRes = await pool.query<{ new_stage: string; cnt: string }>(`
      WITH classified AS (
        SELECT
          CASE
            WHEN txt ~* '\\mFDA[- ]approved\\M|\\mFDA[- ]cleared\\M|commercially available|marketed drug|on the market|approved for sale|post[- ]market'
              THEN 'commercial'
            WHEN txt ~* '\\mphase\\s*(?:III|3)\\M(?!\\s*/)'
              THEN 'phase 3'
            WHEN txt ~* '\\mphase\\s*(?:II|2)\\s*/\\s*(?:III|3)\\M'
              THEN 'phase 2'
            WHEN txt ~* '\\mphase\\s*(?:II|2)\\M(?!\\s*/)'
              THEN 'phase 2'
            WHEN txt ~* '\\mphase\\s*(?:I|1)\\M|\\mphase\\s*(?:I|1)\\s*/\\s*(?:II|2)\\M'
              THEN 'phase 1'
            WHEN txt ~* '\\mIND\\s+(?:filed|application|submitted|approved|enabling)\\M|\\mIND-enabling\\M'
              THEN 'IND filed'
            WHEN txt ~* '\\mpreclinical\\M|\\mpre[- ]clinical\\M|\\mlead[- ]optimi[sz]ation\\M'
              THEN 'preclinical'
            WHEN txt ~* '\\mdiscovery stage\\M|\\mearly[- ]stage discovery\\M|\\mhit[- ]to[- ]lead\\M|\\mhit identification\\M|\\mtarget validation\\M'
              THEN 'discovery'
          END AS new_stage
        FROM (
          SELECT LOWER(COALESCE(summary, '') || ' ' || COALESCE(abstract, '')) AS txt
          FROM ingested_assets
          WHERE relevant = true
            AND (development_stage IS NULL OR development_stage IN ('unknown', ''))
            AND char_length(COALESCE(summary, '') || COALESCE(abstract, '')) >= 50
        ) t
      )
      SELECT new_stage, COUNT(*)::int AS cnt
      FROM classified
      WHERE new_stage IS NOT NULL
      GROUP BY new_stage ORDER BY cnt DESC
    `);
    const total = dryRes.rows.reduce((s, r) => s + Number(r.cnt), 0);
    console.log(`  [DRY RUN] Would fill ${total} assets:`);
    dryRes.rows.forEach((r) => console.log(`    ${r.new_stage}: ${r.cnt}`));
    return { filled: total, rescored: 0 };
  }

  const res = await pool.query<{ id: number }>(`
    WITH fills AS (
      SELECT id,
        CASE
          WHEN txt ~* '\\mFDA[- ]approved\\M|\\mFDA[- ]cleared\\M|commercially available|marketed drug|on the market|approved for sale|post[- ]market'
            THEN 'commercial'
          WHEN txt ~* '\\mphase\\s*(?:III|3)\\M(?!\\s*/)'
            THEN 'phase 3'
          WHEN txt ~* '\\mphase\\s*(?:II|2)\\s*/\\s*(?:III|3)\\M'
            THEN 'phase 2'
          WHEN txt ~* '\\mphase\\s*(?:II|2)\\M(?!\\s*/)'
            THEN 'phase 2'
          WHEN txt ~* '\\mphase\\s*(?:I|1)\\M|\\mphase\\s*(?:I|1)\\s*/\\s*(?:II|2)\\M'
            THEN 'phase 1'
          WHEN txt ~* '\\mIND\\s+(?:filed|application|submitted|approved|enabling)\\M|\\mIND-enabling\\M'
            THEN 'IND filed'
          WHEN txt ~* '\\mpreclinical\\M|\\mpre[- ]clinical\\M|\\mlead[- ]optimi[sz]ation\\M'
            THEN 'preclinical'
          WHEN txt ~* '\\mdiscovery stage\\M|\\mearly[- ]stage discovery\\M|\\mhit[- ]to[- ]lead\\M|\\mhit identification\\M|\\mtarget validation\\M'
            THEN 'discovery'
        END AS new_stage,
        id AS asset_id
      FROM (
        SELECT id, LOWER(COALESCE(summary, '') || ' ' || COALESCE(abstract, '')) AS txt
        FROM ingested_assets
        WHERE relevant = true
          AND (development_stage IS NULL OR development_stage IN ('unknown', ''))
          AND char_length(COALESCE(summary, '') || COALESCE(abstract, '')) >= 50
      ) t
    )
    UPDATE ingested_assets ia
    SET
      development_stage = f.new_stage,
      enrichment_sources = COALESCE(enrichment_sources, '{}'::jsonb) || '{"development_stage":"regex"}'::jsonb
    FROM fills f
    WHERE ia.id = f.asset_id
      AND f.new_stage IS NOT NULL
    RETURNING ia.id
  `);

  const filled = res.rows.length;
  console.log(`  Regex-filled: ${filled} assets`);

  const rescored = await rescoreAssets(res.rows.map((r) => r.id));
  console.log(`  Rescored: ${rescored} assets`);

  return { filled, rescored };
}

// ── Phase 2: LLM ─────────────────────────────────────────────────────────────
const LLM_CONCURRENCY = 5;
const COST_PER_INPUT_TOKEN = 0.15 / 1_000_000;  // gpt-4o-mini
const COST_PER_OUTPUT_TOKEN = 0.60 / 1_000_000;

async function runPhase2(
  cap = CAP,
): Promise<{ processed: number; filled: number; unknown_: number; skipped: number; costUsd: number }> {
  console.log("\n── Phase 2: LLM extraction (gpt-4o-mini) ──");

  if (!process.env.OPENAI_API_KEY) {
    console.warn("  OPENAI_API_KEY not set — skipping Phase 2");
    return { processed: 0, filled: 0, unknown_: 0, skipped: 0, costUsd: 0 };
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const { rows } = await pool.query<{
    id: number; summary: string; abstract: string | null;
    modality: string | null; indication: string | null;
    mechanism_of_action: string | null; ip_type: string | null; patent_status: string | null;
  }>(
    `SELECT id, summary, abstract, modality, indication, mechanism_of_action, ip_type, patent_status
     FROM ingested_assets
     WHERE relevant = true
       AND (development_stage IS NULL OR development_stage IN ('unknown', ''))
       AND char_length(COALESCE(summary, '') || COALESCE(abstract, '')) >= 120
     ORDER BY COALESCE(completeness_score, 0) DESC
     LIMIT $1`,
    [Math.min(cap, 10000)],
  );

  console.log(`  Eligible for LLM: ${rows.length} assets (cap=${cap})`);
  if (rows.length === 0) return { processed: 0, filled: 0, unknown_: 0, skipped: 0, costUsd: 0 };

  const estCost = rows.length * (700 * COST_PER_INPUT_TOKEN + 5 * COST_PER_OUTPUT_TOKEN);
  console.log(`  Estimated cost: $${estCost.toFixed(3)}`);

  let processed = 0;
  let filled = 0;
  let unknown_ = 0;
  let skipped = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const filledIds: number[] = [];

  async function processOne(row: typeof rows[0]): Promise<void> {
    const text = `${row.summary ?? ""} ${row.abstract ?? ""}`.trim();
    const stage = await extractStageByLLM(text, openai);
    processed++;

    if (stage === null) { skipped++; return; }
    if (stage === "unknown") { unknown_++; return; }

    if (!DRY_RUN) {
      await pool.query(
        `UPDATE ingested_assets
         SET development_stage = $1,
             enrichment_sources = COALESCE(enrichment_sources, '{}'::jsonb) || '{"development_stage":"llm"}'::jsonb
         WHERE id = $2`,
        [stage, row.id],
      );
    }
    filled++;
    filledIds.push(row.id);

    if (processed % 50 === 0) {
      const pct = ((processed / rows.length) * 100).toFixed(0);
      process.stdout.write(`\r  [${pct}%] processed=${processed} filled=${filled} unknown=${unknown_} skip=${skipped}`);
    }
  }

  // Bounded concurrency pool
  const queue = [...rows];
  const workers = Array.from({ length: Math.min(LLM_CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const row = queue.shift()!;
      await processOne(row);
    }
  });
  await Promise.all(workers);

  process.stdout.write("\n");

  const costUsd = (inputTokens * COST_PER_INPUT_TOKEN) + (outputTokens * COST_PER_OUTPUT_TOKEN);
  const estActualCost = filled * (700 * COST_PER_INPUT_TOKEN + 5 * COST_PER_OUTPUT_TOKEN) +
    (processed - filled - unknown_) * (200 * COST_PER_INPUT_TOKEN + 5 * COST_PER_OUTPUT_TOKEN);

  console.log(`  Filled: ${filled}  Unknown: ${unknown_}  Skipped: ${skipped}`);
  console.log(`  Est. actual cost: $${estActualCost.toFixed(4)}`);

  const rescored = await rescoreAssets(filledIds);
  console.log(`  Rescored: ${rescored} assets`);

  return { processed, filled, unknown_, skipped, costUsd: estActualCost };
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const t0 = Date.now();
  const dryTag = DRY_RUN ? " [DRY RUN]" : "";
  console.log(`\n╔═══════════════════════════════════╗`);
  console.log(`║  fill-dev-stage.ts${dryTag.padEnd(16)} ║`);
  console.log(`╚═══════════════════════════════════╝`);
  if (ONLY_PHASE) console.log(`Phase filter: ${ONLY_PHASE}`);

  let p1 = { filled: 0, rescored: 0 };
  let p2 = { processed: 0, filled: 0, unknown_: 0, skipped: 0, costUsd: 0 };

  if (!ONLY_PHASE || ONLY_PHASE === 1) p1 = await runPhase1();
  if (!ONLY_PHASE || ONLY_PHASE === 2) p2 = await runPhase2();

  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n══ Summary ════════════════════════`);
  console.log(`  Phase 1 regex filled : ${p1.filled}`);
  console.log(`  Phase 2 LLM filled   : ${p2.filled}  (${p2.unknown_} unknown, ${p2.skipped} skipped)`);
  console.log(`  Total filled         : ${p1.filled + p2.filled}`);
  console.log(`  Est. LLM cost        : $${p2.costUsd.toFixed(4)}`);
  console.log(`  Duration             : ${dur}s`);

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
