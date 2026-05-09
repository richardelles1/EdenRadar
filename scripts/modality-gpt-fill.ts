/**
 * GPT-4o-mini modality fill — parallel, resumable.
 *
 * Fetches assets still missing modality, sends them to GPT-4o-mini
 * with CONCURRENCY parallel calls, writes results back.
 * Re-run as many times as needed; each run picks up unclassified assets.
 *
 * Usage:
 *   npx tsx scripts/modality-gpt-fill.ts            (default: 5 parallel, 30/batch)
 *   npx tsx scripts/modality-gpt-fill.ts --dry-run
 */

import { Pool } from "pg";
import OpenAI from "openai";
import { computeCompletenessScore } from "../server/lib/pipeline/contentHash";

const DRY_RUN    = process.argv.includes("--dry-run");
const BATCH_SIZE = 30;
const CONCURRENCY = 5;          // parallel GPT calls
const MAX_ASSETS  = 3000;       // cap per invocation — re-run to continue

const VALID_MODALITIES = [
  "small molecule","antibody","cell therapy","gene therapy","rna therapy",
  "protein/peptide","vaccine","diagnostic","device","platform","other",
];

const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface Asset {
  id: number;
  asset_name: string | null;
  summary: string | null;
  abstract: string | null;
  indication: string | null;
  development_stage: string | null;
  mechanism_of_action: string | null;
  ip_type: string | null;
  patent_status: string | null;
  source_type: string | null;
}

async function gptBatch(assets: Asset[]): Promise<Map<number, string>> {
  const items = assets.map((a, i) => ({
    idx: i,
    name: (a.asset_name ?? "").slice(0, 80),
    text: (a.summary ?? a.abstract ?? "").slice(0, 150),
  }));

  const prompt = `Biopharma expert. For each asset assign exactly one modality from: ${VALID_MODALITIES.join(", ")}. Use "other" if unclear. Respond JSON array: [{"idx":0,"modality":"small molecule"},...]

${items.map(it => `[${it.idx}] ${it.name}: ${it.text}`).join("\n")}`;

  const result = new Map<number, string>();
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed)
      ? parsed
      : (parsed.result ?? parsed.modalities ?? parsed.assignments ?? Object.values(parsed)[0] ?? []);
    for (const entry of (Array.isArray(arr) ? arr : [])) {
      const idx = Number(entry.idx ?? entry.index);
      const mod = (entry.modality ?? "").toLowerCase().trim();
      if (!isNaN(idx) && VALID_MODALITIES.includes(mod)) result.set(idx, mod);
    }
  } catch { /* skip batch */ }
  return result;
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows: countRows } = await client.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM ingested_assets WHERE relevant=true AND (modality IS NULL OR modality IN ('unknown',''))`
    );
    const remaining = Number(countRows[0]?.n ?? 0);
    console.log(`[gpt-fill] Remaining: ${remaining.toLocaleString()} | Fetching up to ${MAX_ASSETS.toLocaleString()}…`);
    if (remaining === 0) { console.log("[gpt-fill] Nothing to do."); return; }

    const { rows: assets } = await client.query<Asset>(
      `SELECT id, asset_name, summary, abstract, indication, development_stage,
              mechanism_of_action, ip_type, patent_status, source_type
       FROM ingested_assets
       WHERE relevant=true AND (modality IS NULL OR modality IN ('unknown',''))
       ORDER BY id LIMIT $1`,
      [Math.min(remaining, MAX_ASSETS)]
    );

    if (DRY_RUN) {
      console.log(`[gpt-fill] DRY RUN — would process ${assets.length} assets in ${Math.ceil(assets.length/BATCH_SIZE)} batches (${CONCURRENCY} parallel).`);
      return;
    }

    // Slice assets into batches
    const batches: Asset[][] = [];
    for (let i = 0; i < assets.length; i += BATCH_SIZE) batches.push(assets.slice(i, i + BATCH_SIZE));

    console.log(`[gpt-fill] ${assets.length} assets → ${batches.length} batches × ${CONCURRENCY} parallel…`);

    let resolved = 0;
    let batchsDone = 0;
    const start = Date.now();

    // Process in parallel windows
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const window = batches.slice(i, i + CONCURRENCY);
      const offsets = window.map((_, wi) => (i + wi) * BATCH_SIZE);

      const results = await Promise.all(window.map(b => gptBatch(b)));

      for (let wi = 0; wi < window.length; wi++) {
        const batch = window[wi];
        const modMap = results[wi];
        for (const [relIdx, modality] of modMap) {
          const asset = batch[relIdx];
          if (!asset) continue;
          const score = computeCompletenessScore({
            modality,
            indication: asset.indication,
            developmentStage: asset.development_stage,
            mechanismOfAction: asset.mechanism_of_action,
            ipType: asset.ip_type,
            patentStatus: asset.patent_status,
            sourceType: asset.source_type,
            summary: asset.summary,
          });
          await client.query(
            `UPDATE ingested_assets SET modality=$1, completeness_score=$2 WHERE id=$3`,
            [modality, score, asset.id]
          );
          resolved++;
        }
        batchsDone++;
      }

      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      process.stdout.write(`\r[gpt-fill] ${batchsDone}/${batches.length} batches | ${resolved} resolved | ${elapsed}s elapsed`);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const stillLeft = remaining - resolved;
    console.log(`\n[gpt-fill] DONE — resolved ${resolved} in ${elapsed}s | still unclassified: ${stillLeft.toLocaleString()}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("[gpt-fill] Fatal:", err);
  pool.end().finally(() => process.exit(1));
});
