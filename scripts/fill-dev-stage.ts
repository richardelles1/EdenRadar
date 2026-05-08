/**
 * scripts/fill-dev-stage.ts
 *
 * Two-phase development stage fill for relevant drug/biologic assets missing
 * `development_stage`. Non-drug asset classes (medical_device, research_tool,
 * software) are excluded — their stage semantics differ.
 *
 * Phase 1 (regex, zero API cost):
 *   Single SQL CTE that simultaneously writes development_stage AND recomputes
 *   completeness_score in one atomic UPDATE — no separate rescore pass needed.
 *
 * Phase 2 (LLM — gpt-4o-mini, temperature=0):
 *   Collects all LLM results first, then applies a single atomic batch UPDATE
 *   that writes both development_stage and completeness_score together.
 *   Any response not in the enum (including "unknown") is not written.
 *
 * Usage:
 *   npx tsx scripts/fill-dev-stage.ts [--dry-run] [--phase=1|2] [--cap=N]
 *
 * Prints: total scanned / regex hits / LLM hits / LLM unknown /
 *         skipped (insufficient text) / estimated cost.
 *
 * Environment: SUPABASE_DATABASE_URL, OPENAI_API_KEY
 */

import pg from "pg";
import OpenAI from "openai";

// ── CLI ───────────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const phaseArg = process.argv.find((a) => a.startsWith("--phase="));
const ONLY_PHASE = phaseArg ? parseInt(phaseArg.split("=")[1], 10) : null;
const capArg = process.argv.find((a) => a.startsWith("--cap="));
const CAP_RAW = capArg ? parseInt(capArg.split("=")[1], 10) : 5000;
if (capArg && (isNaN(CAP_RAW) || CAP_RAW < 1)) { console.error("ERROR: --cap must be a positive integer"); process.exit(1); }
const CAP = CAP_RAW;
const minTextArg = process.argv.find((a) => a.startsWith("--min-text="));
const LLM_MIN_TEXT_RAW = minTextArg ? parseInt(minTextArg.split("=")[1], 10) : 120;
if (minTextArg && (isNaN(LLM_MIN_TEXT_RAW) || LLM_MIN_TEXT_RAW < 1 || LLM_MIN_TEXT_RAW > 10000)) { console.error("ERROR: --min-text must be a positive integer between 1 and 10000"); process.exit(1); }
const LLM_MIN_TEXT = LLM_MIN_TEXT_RAW;
// --all-fields: use summary+abstract+innovation_claim+mechanism_of_action+unmet_need for text
const ALL_FIELDS = process.argv.includes("--all-fields");
const TEXT_SQL = ALL_FIELDS
  ? `COALESCE(summary,'') || ' ' || COALESCE(abstract,'') || ' ' || COALESCE(innovation_claim,'') || ' ' || COALESCE(mechanism_of_action,'') || ' ' || COALESCE(unmet_need,'')`
  : `COALESCE(summary,'') || COALESCE(abstract,'')`;
const TEXT_LABEL = ALL_FIELDS ? "summary+abstract+innovation_claim+moa+unmet_need" : "summary+abstract";
// --permissive: allow LLM to infer stage from indirect signals (in vitro, animal models, etc.)
const PERMISSIVE = process.argv.includes("--permissive");

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

// Asset-class filter (non-drug classes excluded — their stage semantics differ)
const ASSET_CLASS_FILTER =
  `AND (asset_class IS NULL OR asset_class NOT IN ('medical_device', 'research_tool', 'software'))`;

// ── Inline SQL completeness-score expression ───────────────────────────────────
// Mirrors computeCompletenessScore() formula exactly. Used in UPDATE CTEs so
// the stage write and score update are a single atomic SQL statement.
// Assumes development_stage is the value we are about to write (passed as new_stage).
const SCORE_SQL = (newStageExpr: string) => `
  LEAST(100,
    CASE WHEN ia.indication IS NOT NULL
              AND length(ia.indication) >= 3
              AND ia.indication NOT IN ('unknown','')
         THEN 25 ELSE 0 END +
    CASE WHEN ia.modality IS NOT NULL
              AND length(ia.modality) >= 3
              AND ia.modality NOT IN ('unknown','')
         THEN 20 ELSE 0 END +
    CASE WHEN (${newStageExpr}) IS NOT NULL
              AND length(${newStageExpr}) >= 3
              AND (${newStageExpr}) NOT IN ('unknown','')
         THEN 20 ELSE 0 END +
    CASE WHEN length(COALESCE(ia.summary,'')) >= 300 THEN 15
         WHEN length(COALESCE(ia.summary,'')) >= 150 THEN 10
         WHEN length(COALESCE(ia.summary,'')) >= 50  THEN 5
         ELSE 0 END +
    CASE WHEN ia.mechanism_of_action IS NOT NULL
              AND length(ia.mechanism_of_action) >= 3
              AND ia.mechanism_of_action NOT IN ('unknown','')
         THEN 12 ELSE 0 END +
    CASE WHEN (ia.ip_type IS NOT NULL AND length(ia.ip_type) >= 3
               AND ia.ip_type NOT IN ('unknown',''))
           OR (ia.patent_status IS NOT NULL AND length(ia.patent_status) >= 3
               AND ia.patent_status NOT IN ('unknown',''))
           OR ia.source_type = 'tech_transfer'
         THEN 8 ELSE 0 END
  )`;

// ── Canonical regex patterns ────────────────────────────────────────────────
// Order matters: first match wins. Discovery checked BEFORE preclinical so that
// "hit-to-lead optimization" maps to discovery, not preclinical.
export const STAGE_PATTERNS: Array<{ pattern: RegExp; stage: StageValue }> = [
  { pattern: /\bFDA[- ]approved\b|\bFDA[- ]cleared\b|\bcommercially available\b|\bmarketed drug\b|\bon the market\b|\bapproved for sale\b|\bpost[- ]market\b/i, stage: "commercial" },
  { pattern: /\bphase\s*(?:III|3)\b(?!\s*\/)/i, stage: "phase 3" },
  { pattern: /\bphase\s*(?:II|2)\s*\/\s*(?:III|3)\b/i, stage: "phase 2" },
  { pattern: /\bphase\s*(?:II|2)\b(?!\s*\/)/i, stage: "phase 2" },
  { pattern: /\bphase\s*(?:I|1)\b|\bphase\s*(?:I|1)\s*\/\s*(?:II|2)\b/i, stage: "phase 1" },
  { pattern: /\bIND\s+(?:filed|application|submitted|approved|enabling)\b|\bIND-enabling\b/i, stage: "IND filed" },
  // Discovery before preclinical to win on "hit-to-lead optimization"
  { pattern: /\bdiscovery stage\b|\bearly[- ]stage discovery\b|\bhit[- ]to[- ]lead\b|\bhit identification\b|\btarget validation\b|\btarget discovery\b/i, stage: "discovery" },
  { pattern: /\bpreclinical\b|\bpre[- ]clinical\b|\blead[- ]optimi[sz]ation\b/i, stage: "preclinical" },
];

export function extractStageByRegex(text: string): StageValue | null {
  for (const { pattern, stage } of STAGE_PATTERNS) {
    if (pattern.test(text)) return stage;
  }
  return null;
}

// ── SQL CASE expression matching STAGE_PATTERNS order exactly ────────────────
// Discovery before preclinical — same ordering guarantee as regex above.
export const STAGE_SQL_CASE = `
  CASE
    WHEN txt ~* '\\mFDA[- ]approved\\M|\\mFDA[- ]cleared\\M|commercially available|marketed drug|on the market|approved for sale|post[- ]market'
      THEN 'commercial'
    WHEN txt ~* '\\mphase\\s*(III|3)\\M(?!\\s*/)'
      THEN 'phase 3'
    WHEN txt ~* '\\mphase\\s*(II|2)\\s*/\\s*(III|3)\\M'
      THEN 'phase 2'
    WHEN txt ~* '\\mphase\\s*(II|2)\\M(?!\\s*/)'
      THEN 'phase 2'
    WHEN txt ~* '\\mphase\\s*(I|1)\\M|\\mphase\\s*(I|1)\\s*/\\s*(II|2)\\M'
      THEN 'phase 1'
    WHEN txt ~* '\\mIND\\s+(filed|application|submitted|approved|enabling)\\M|\\mIND-enabling\\M'
      THEN 'IND filed'
    WHEN txt ~* '\\mdiscovery stage\\M|\\mearly[- ]stage discovery\\M|\\mhit[- ]to[- ]lead\\M|\\mhit identification\\M|\\mtarget validation\\M'
      THEN 'discovery'
    WHEN txt ~* '\\mpreclinical\\M|\\mpre[- ]clinical\\M|\\mlead[- ]optimi.ation\\M'
      THEN 'preclinical'
  END`;

// ── LLM extraction ────────────────────────────────────────────────────────────
const STAGE_ENUM_STR = STAGE_ENUM.join(", ");
const SYSTEM_PROMPT_STRICT = `You are a biotech development stage classifier.

Given a technology description, identify the development stage. You MUST respond with exactly one value from this list:
${STAGE_ENUM_STR}

Rules:
- Only return a stage that is EXPLICITLY and UNAMBIGUOUSLY stated in the text.
- If no clear stage signal exists, respond with: unknown
- Do not infer from indirect signals.
- Do not respond with anything other than one of the listed values or "unknown".`;

const SYSTEM_PROMPT_PERMISSIVE = `You are a biotech development stage classifier.

Given a technology description, classify the development stage. You MUST respond with exactly one value from this list:
${STAGE_ENUM_STR}

Rules:
- Use explicit stage mentions when available (e.g. "Phase 2", "IND filed", "preclinical").
- Also infer stage from contextual clues:
  - In vitro only / cell-based assays / no animal data → "discovery"
  - Animal efficacy studies / rodent/primate models / lead optimization → "preclinical"
  - IND filing mentioned or enabling studies complete → "IND filed"
  - Human clinical studies mentioned → use the appropriate phase
  - FDA-approved / marketed / on the market → "commercial"
- If genuinely no stage signal exists even with inference, respond with: unknown
- Do not respond with anything other than one of the listed values or "unknown".`;

const SYSTEM_PROMPT = PERMISSIVE ? SYSTEM_PROMPT_PERMISSIVE : SYSTEM_PROMPT_STRICT;

export async function extractStageByLLM(
  text: string,
  openai: OpenAI,
): Promise<StageValue | "unknown"> {
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 20,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text.slice(0, 1000) },
      ],
    });
    const raw = (resp.choices[0]?.message?.content ?? "").trim().toLowerCase();
    const matched = STAGE_ENUM.find((s) => s.toLowerCase() === raw);
    if (matched) return matched;
    // Any response not in the enum (including explicit "unknown") → not written
    return "unknown";
  } catch {
    return "unknown";
  }
}

// ── Phase 1: atomic SQL regex + rescore ───────────────────────────────────────
async function runPhase1(): Promise<{ filled: number; scanned: number; skippedInsufficient: number }> {
  console.log("\n── Phase 1: SQL regex + atomic rescore ──");
  console.log(`  Scope: relevant assets (asset_class IS NULL or drug_biologic)`);

  const countRes = await pool.query<{ scanned: string; insufficient: string }>(`
    SELECT
      COUNT(*) FILTER (WHERE char_length(COALESCE(summary,'') || COALESCE(abstract,'')) >= 50)::int AS scanned,
      COUNT(*) FILTER (WHERE char_length(COALESCE(summary,'') || COALESCE(abstract,'')) < 50)::int  AS insufficient
    FROM ingested_assets
    WHERE relevant = true
      AND (development_stage IS NULL OR development_stage IN ('unknown',''))
      ${ASSET_CLASS_FILTER}
  `);
  const scanned = Number(countRes.rows[0]?.scanned ?? 0);
  const skippedInsufficient = Number(countRes.rows[0]?.insufficient ?? 0);
  console.log(`  Scanned (≥50 chars)   : ${scanned.toLocaleString()}`);
  console.log(`  Skipped (< 50 chars)  : ${skippedInsufficient.toLocaleString()}`);
  if (scanned === 0) return { filled: 0, scanned, skippedInsufficient };

  if (DRY_RUN) {
    const dryRes = await pool.query<{ new_stage: string; cnt: string }>(`
      WITH classified AS (
        SELECT ${STAGE_SQL_CASE} AS new_stage
        FROM (
          SELECT LOWER(COALESCE(summary,'') || ' ' || COALESCE(abstract,'')) AS txt
          FROM ingested_assets
          WHERE relevant = true
            AND (development_stage IS NULL OR development_stage IN ('unknown',''))
            AND char_length(COALESCE(summary,'') || COALESCE(abstract,'')) >= 50
            ${ASSET_CLASS_FILTER}
        ) t
      )
      SELECT new_stage, COUNT(*)::int AS cnt
      FROM classified
      WHERE new_stage IS NOT NULL
      GROUP BY new_stage ORDER BY cnt DESC
    `);
    const total = dryRes.rows.reduce((s, r) => s + Number(r.cnt), 0);
    console.log(`  [DRY RUN] Would fill ${total} assets atomically (stage + score):`);
    dryRes.rows.forEach((r) => console.log(`    ${r.new_stage}: ${r.cnt}`));
    return { filled: total, scanned, skippedInsufficient };
  }

  // Single atomic CTE: classify stage + write stage + write completeness_score together
  const res = await pool.query<{ id: number }>(`
    WITH source AS (
      SELECT id, ${STAGE_SQL_CASE} AS new_stage
      FROM (
        SELECT id, LOWER(COALESCE(summary,'') || ' ' || COALESCE(abstract,'')) AS txt
        FROM ingested_assets
        WHERE relevant = true
          AND (development_stage IS NULL OR development_stage IN ('unknown',''))
          AND char_length(COALESCE(summary,'') || COALESCE(abstract,'')) >= 50
          ${ASSET_CLASS_FILTER}
      ) t
    )
    UPDATE ingested_assets ia
    SET
      development_stage  = s.new_stage,
      completeness_score = ${SCORE_SQL("s.new_stage")},
      enrichment_sources = COALESCE(enrichment_sources, '{}'::jsonb)
        || '{"development_stage":"regex"}'::jsonb
    FROM source s
    WHERE ia.id = s.id
      AND s.new_stage IS NOT NULL
    RETURNING ia.id
  `);

  const filled = res.rows.length;
  console.log(`  Filled (stage + score written atomically): ${filled}`);
  return { filled, scanned, skippedInsufficient };
}

// ── Phase 2: LLM + atomic batch rescore ───────────────────────────────────────
const LLM_CONCURRENCY = 5;
const COST_PER_INPUT_TOKEN = 0.15 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 0.60 / 1_000_000;

interface Phase2Result {
  llmEligible: number;
  processed: number;
  filled: number;
  unknown_: number;
  skippedInsufficient: number;
  costUsd: number;
}

async function runPhase2(cap = CAP): Promise<Phase2Result> {
  console.log("\n── Phase 2: LLM extraction + atomic batch rescore ──");

  if (!process.env.OPENAI_API_KEY) {
    console.warn("  OPENAI_API_KEY not set — skipping Phase 2");
    return { llmEligible: 0, processed: 0, filled: 0, unknown_: 0, skippedInsufficient: 0, costUsd: 0 };
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Count assets by text-length eligibility for reporting
  const countRes = await pool.query<{ llm_eligible: string; insufficient: string }>(`
    SELECT
      COUNT(*) FILTER (WHERE char_length(${TEXT_SQL}) >= ${LLM_MIN_TEXT})::int AS llm_eligible,
      COUNT(*) FILTER (WHERE char_length(${TEXT_SQL}) >= 50
                         AND char_length(${TEXT_SQL}) < ${LLM_MIN_TEXT})::int  AS insufficient
    FROM ingested_assets
    WHERE relevant = true
      AND (development_stage IS NULL OR development_stage IN ('unknown',''))
      ${ASSET_CLASS_FILTER}
  `);
  const llmEligible = Number(countRes.rows[0]?.llm_eligible ?? 0);
  const skippedInsufficient = Number(countRes.rows[0]?.insufficient ?? 0);
  console.log(`  Text fields      : ${TEXT_LABEL}`);
  console.log(`  Eligible (≥${LLM_MIN_TEXT} chars) : ${llmEligible.toLocaleString()} (cap=${cap})`);
  console.log(`  Skipped (50–${LLM_MIN_TEXT - 1} chars): ${skippedInsufficient.toLocaleString()}`);
  if (llmEligible === 0) return { llmEligible, processed: 0, filled: 0, unknown_: 0, skippedInsufficient, costUsd: 0 };

  const { rows } = await pool.query<{ id: number; summary: string | null; abstract: string | null; innovation_claim: string | null; mechanism_of_action: string | null; unmet_need: string | null }>(
    `SELECT id, summary, abstract, innovation_claim, mechanism_of_action, unmet_need
     FROM ingested_assets
     WHERE relevant = true
       AND (development_stage IS NULL OR development_stage IN ('unknown',''))
       AND char_length(${TEXT_SQL}) >= ${LLM_MIN_TEXT}
       ${ASSET_CLASS_FILTER}
     ORDER BY COALESCE(completeness_score, 0) DESC
     LIMIT $1`,
    [Math.min(cap, 10000)],
  );

  const estCost = rows.length * (700 * COST_PER_INPUT_TOKEN + 5 * COST_PER_OUTPUT_TOKEN);
  console.log(`  Estimated cost: $${estCost.toFixed(3)}`);

  // Collect all LLM results first, then apply a single atomic batch UPDATE
  const results = new Map<number, StageValue>(); // id → stage to write
  let unknown_ = 0;
  let processed = 0;

  const queue = [...rows];
  const workers = Array.from({ length: Math.min(LLM_CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const row = queue.shift()!;
      const text = ALL_FIELDS
        ? `${row.summary ?? ""} ${row.abstract ?? ""} ${row.innovation_claim ?? ""} ${row.mechanism_of_action ?? ""} ${row.unmet_need ?? ""}`.trim()
        : `${row.summary ?? ""} ${row.abstract ?? ""}`.trim();
      const stage = await extractStageByLLM(text, openai);
      processed++;
      if (stage === "unknown") {
        unknown_++;
      } else {
        results.set(row.id, stage);
      }
      if (processed % 50 === 0) {
        const pct = ((processed / rows.length) * 100).toFixed(0);
        process.stdout.write(`\r  [${pct}%] processed=${processed} filled=${results.size} unknown=${unknown_}`);
      }
    }
  });
  await Promise.all(workers);
  process.stdout.write("\n");

  const filled = results.size;
  console.log(`  Filled: ${filled}  Unknown: ${unknown_}`);
  if (filled === 0 || DRY_RUN) {
    if (DRY_RUN) console.log(`  [DRY RUN] Would write ${filled} stage values atomically`);
    const costUsd = processed * (700 * COST_PER_INPUT_TOKEN + 5 * COST_PER_OUTPUT_TOKEN);
    return { llmEligible, processed, filled, unknown_, skippedInsufficient, costUsd };
  }

  // Single atomic batch UPDATE: write development_stage + completeness_score together
  // Uses unnest($1::int[], $2::text[]) to avoid N individual UPDATEs
  const ids = Array.from(results.keys());
  const stages = ids.map((id) => results.get(id)!);

  await pool.query(`
    WITH updates AS (
      SELECT unnest($1::int[]) AS id, unnest($2::text[]) AS new_stage
    )
    UPDATE ingested_assets ia
    SET
      development_stage  = u.new_stage,
      completeness_score = ${SCORE_SQL("u.new_stage")},
      enrichment_sources = COALESCE(enrichment_sources, '{}'::jsonb)
        || '{"development_stage":"llm"}'::jsonb
    FROM updates u
    WHERE ia.id = u.id
  `, [ids, stages]);

  console.log(`  Stage + score written atomically for ${filled} assets`);

  const costUsd = processed * (700 * COST_PER_INPUT_TOKEN + 5 * COST_PER_OUTPUT_TOKEN);
  return { llmEligible, processed, filled, unknown_, skippedInsufficient, costUsd };
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const t0 = Date.now();
  const dryTag = DRY_RUN ? " [DRY RUN]" : "";
  console.log(`\n╔═══════════════════════════════════╗`);
  console.log(`║  fill-dev-stage.ts${dryTag.padEnd(16)} ║`);
  console.log(`╚═══════════════════════════════════╝`);
  if (ONLY_PHASE) console.log(`Phase filter: ${ONLY_PHASE}`);

  let p1 = { filled: 0, scanned: 0, skippedInsufficient: 0 };
  let p2: Phase2Result = { llmEligible: 0, processed: 0, filled: 0, unknown_: 0, skippedInsufficient: 0, costUsd: 0 };

  if (!ONLY_PHASE || ONLY_PHASE === 1) p1 = await runPhase1();
  if (!ONLY_PHASE || ONLY_PHASE === 2) p2 = await runPhase2();

  const totalScanned = p1.scanned + p1.skippedInsufficient;
  const skippedInsuffText = p1.skippedInsufficient + p2.skippedInsufficient;

  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n══ Summary ════════════════════════`);
  console.log(`  Total scanned        : ${totalScanned.toLocaleString()}`);
  console.log(`  Phase 1 regex filled : ${p1.filled}`);
  console.log(`  Phase 2 LLM filled   : ${p2.filled}`);
  console.log(`  LLM unknown / no-sig : ${p2.unknown_}`);
  console.log(`  Skipped (insuff. txt): ${skippedInsuffText}`);
  console.log(`  Total filled         : ${p1.filled + p2.filled}`);
  console.log(`  Est. LLM cost        : $${p2.costUsd.toFixed(4)}`);
  console.log(`  Duration             : ${dur}s`);

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
