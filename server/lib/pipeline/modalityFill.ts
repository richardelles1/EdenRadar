/**
 * Modality Rule-Fill — shared engine used by both the CLI script and the
 * admin route handler.
 *
 * Canonical modality taxonomy (20 values):
 *   small molecule | antibody | adc | biologic | peptide | gene therapy |
 *   gene editing | rna therapy | cell therapy | vaccine | nanoparticle |
 *   diagnostic | medical device | probiotic | natural product |
 *   platform technology | research tool | software/algorithm |
 *   radiopharmaceutical | protac
 */

import { computeCompletenessScore } from "./contentHash";
import OpenAI from "openai";

export const CANONICAL_MODALITIES: string[] = [
  "small molecule", "antibody", "adc", "biologic", "peptide",
  "gene therapy", "gene editing", "rna therapy", "cell therapy",
  "vaccine", "nanoparticle", "diagnostic", "medical device",
  "probiotic", "natural product", "platform technology",
  "research tool", "software/algorithm", "radiopharmaceutical", "protac",
];

// ── Tier 1: Very high confidence ─────────────────────────────────────────────
const TIER1: Array<{ pattern: RegExp; modality: string }> = [
  { pattern: /protac|protein\s+degrader|molecular\s+glue|targeted\s+protein\s+degradation|lytac/i, modality: "protac" },
  { pattern: /antibody[\s-]drug\s+conjugate|adc\s|drug[\s-]conjugated\s+antibody/i, modality: "adc" },
  { pattern: /crispr|cas9|cas12|cas13|zinc\s+finger\s+nuclease|talen|base\s+edit|prime\s+edit|epigenome\s+edit/i, modality: "gene editing" },
  { pattern: /car[\s-]t|chimeric\s+antigen\s+receptor|car\s+t[\s-]cell|adoptive\s+cell|treg\s+therap|regulatory\s+t[\s-]cell\s+therap|t\s+cell\s+engag|exosom|extracellular\s+vesicle/i, modality: "cell therapy" },
  { pattern: /\bgene\s+therapy\b|gene\s+deliver|\baav\b|adeno[\s-]associated\s+vir|lentivir.*vector|retrovir.*vector|viral\s+vector|gene\s+transfer/i, modality: "gene therapy" },
  { pattern: /\bsirna\b|\bshRNA\b|\brnai\b|rna\s+interference|antisense\s+oligonucleotide|\bash\b.*oligo|oligonucleotide\s+inhibitor|\bmirna\b.*therap|\bmrna\b/i, modality: "rna therapy" },
  { pattern: /radiopharmaceutical|radiolabeled|radiotracer|\bpet\s+probe\b|radio[\s-]therap|nuclear\s+medicine\s+imaging/i, modality: "radiopharmaceutical" },
  { pattern: /probiotic|lactobacillus|lacticaseibacillus|lactocaseibacillus|bifidobacterium|live\s+biotherapeutic|live\s+bacterial/i, modality: "probiotic" },
];

// ── Tier 2: High confidence ───────────────────────────────────────────────────
const TIER2: Array<{ pattern: RegExp; modality: string }> = [
  { pattern: /monoclonal\s+antibody|\bmab\b|anti-.*antibody|nanobody|immunoglobulin|\bscfv\b|\bfab\s+fragment\b|antibody[\s-]based\s+therap|bispecific/i, modality: "antibody" },
  { pattern: /enzyme\s+therap|enzyme\s+replacement|enzyme\s+supplem|collagenase|chondroitinase|hyaluronidase|lysosomal\s+enzyme|endolysin/i, modality: "biologic" },
  { pattern: /recombinant\s+protein|recombinant.*enzyme|recombinant.*factor|fusion\s+protein|engineered\s+protein|modified.*stable.*protein/i, modality: "biologic" },
  { pattern: /growth\s+factor|\bgm[\s-]csf\b|\bbdnf\b|\bngf\b|\bfgf\b|\begf\b|\bvegf\b|erythropoietin|thrombopoietin/i, modality: "biologic" },
  { pattern: /\bpeptide\b|cyclic\s+peptide|stapled\s+peptide|peptidomimetic/i, modality: "peptide" },
  { pattern: /\bvaccine\b|vaccination|immunization|prophylactic.*immun/i, modality: "vaccine" },
  { pattern: /nanoparticle|lipid\s+nanoparticle|\blnp\b|liposom|polymeric\s+nano|nanocarrier/i, modality: "nanoparticle" },
  { pattern: /medical\s+device|\bimplant\b|surgical\s+device|wearable.*health|\bcatheter\b|\bstent\b|tissue\s+scaffold/i, modality: "medical device" },
  { pattern: /phytochemical|plant\s+extract|botanical|herbal.*extract|\bcannabin\b|natural\s+product|phenolic\s+compound/i, modality: "natural product" },
  { pattern: /\bbiomarker\b|companion\s+diagnostic|imaging\s+agent|\bpet\s+scan\b|biomarker[\s-]based\s+test/i, modality: "diagnostic" },
  { pattern: /\bsoftware\b|\balgorithm\b|machine\s+learning.*health|digital\s+therap|digital\s+health/i, modality: "software/algorithm" },
];

// ── Tier 3: Good confidence (broader) ────────────────────────────────────────
const TIER3: Array<{ pattern: RegExp; modality: string }> = [
  { pattern: /small\s+molecule|compound.*inhibitor|\binhibitor\b.*drug|\bagonist\b.*drug|oral\s+drug\s+candidate|drug\s+candidate.*compound/i, modality: "small molecule" },
  { pattern: /therapeutic\s+protein|\bFc\s+fusion\b|lectin\s+therap|hydrolase\s+therap|lipase\s+therap|cholinesterase|synthetic\s+protein|engineered\s+enzyme/i, modality: "biologic" },
  { pattern: /\bdiagnostic\b|\bdiagnos\b.*method|point[\s-]of[\s-]care|clinical\s+assay/i, modality: "diagnostic" },
  { pattern: /\bplatform\b.*technolog|discovery\s+platform|technology\s+platform/i, modality: "platform technology" },
  { pattern: /research\s+tool|\bassay\s+kit\b|\breagent\b.*research|laboratory\s+tool/i, modality: "research tool" },
  { pattern: /gene[\s-]based\s+therap|nucleic\s+acid\s+therap|dna\s+therap/i, modality: "gene therapy" },
  { pattern: /payload.*antibody|conjugate.*antibody/i, modality: "adc" },
  { pattern: /microbial.*extract|fermentation.*product/i, modality: "probiotic" },
  { pattern: /\binhibitor\b/i, modality: "small molecule" },
];

// ── Name-only high-priority patterns ─────────────────────────────────────────
const NAME_PRIORITY: Array<{ pattern: RegExp; modality: string }> = [
  { pattern: /\bAntibody\b/i, modality: "antibody" },
  { pattern: /\bmAb\b/i, modality: "antibody" },
  { pattern: /\bPeptide\b/i, modality: "peptide" },
  { pattern: /Enzyme\s+Therapy/i, modality: "biologic" },
  { pattern: /Gene\s+Therapy/i, modality: "gene therapy" },
  { pattern: /\bVaccine\b/i, modality: "vaccine" },
  { pattern: /\bCAR[-\s]?T\b/i, modality: "cell therapy" },
  { pattern: /\bCRISPR\b/i, modality: "gene editing" },
  { pattern: /\bNanoparticle\b/i, modality: "nanoparticle" },
  { pattern: /\bProbiotic\b/i, modality: "probiotic" },
  { pattern: /\bOligonucleotide\b/i, modality: "rna therapy" },
  { pattern: /\bsiRNA\b|\bshRNA\b|\bmRNA\b/i, modality: "rna therapy" },
  { pattern: /\bPROTAC\b/i, modality: "protac" },
  { pattern: /\bDiagnostic\b|\bBiomarker\b/i, modality: "diagnostic" },
  { pattern: /\bDevice\b/i, modality: "medical device" },
];

export type ModalityAsset = {
  id: number;
  asset_name: string;
  summary: string | null;
  abstract: string | null;
  indication: string | null;
  development_stage: string | null;
  mechanism_of_action: string | null;
  ip_type: string | null;
  patent_status: string | null;
  source_type: string | null;
  biology: string | null;
};

export type ModalityFillSummary = {
  total: number;
  normalized: number;
  ruleMatched: number;
  tierCounts: { t1: number; t2: number; t3: number };
  gptSent: number;
  gptResolved: number;
  totalUpdated: number;
  unresolved: number;
};

/**
 * Applies name-priority + Tier1/Tier2/Tier3 rules to a single asset.
 * Returns the matched modality or null if nothing matched.
 */
export function applyModalityRules(asset: ModalityAsset): string | null {
  const name = asset.asset_name ?? "";
  const full = [name, asset.summary ?? "", asset.abstract ?? ""].join(" ").toLowerCase();

  // Name-priority rules checked first
  for (const rule of NAME_PRIORITY) {
    if (rule.pattern.test(name)) {
      if (rule.modality === "medical device") {
        // Only tag as device if there is no drug-context in the name
        if (/\binhibitor\b|\btherapy\b|\bdrug\b|\bcompound\b|\bantibody\b|\bvaccine\b|\bgene\b|\bpeptide\b|\bbiologic\b|\bmolecule\b/i.test(name)) {
          continue;
        }
      }
      return rule.modality;
    }
  }

  for (const rule of TIER1) { if (rule.pattern.test(full)) return rule.modality; }
  for (const rule of TIER2) { if (rule.pattern.test(full)) return rule.modality; }
  for (const rule of TIER3) { if (rule.pattern.test(full)) return rule.modality; }

  return null;
}

/** Determines which tier matched (1, 2, or 3) for counting purposes. */
function detectTier(asset: ModalityAsset): 1 | 2 | 3 {
  const name = asset.asset_name ?? "";
  const full = [name, asset.summary ?? "", asset.abstract ?? ""].join(" ").toLowerCase();
  for (const rule of TIER1) { if (rule.pattern.test(full) || rule.pattern.test(name)) return 1; }
  for (const rule of TIER2) { if (rule.pattern.test(full)) return 2; }
  return 3;
}

/**
 * Runs the GPT-4o-mini fallback for a batch of unmatched assets.
 * Provides asset_name + first 400 chars of summary/abstract as context.
 */
async function gptFallback(
  batch: ModalityAsset[],
  openai: OpenAI,
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (batch.length === 0) return result;

  const items = batch.map((a, i) => {
    // Spec: asset_name + first 400 chars of summary/abstract
    const context = [a.summary ?? "", a.abstract ?? ""].join(" ").slice(0, 400);
    return `${i + 1}. [ID:${a.id}] ${a.asset_name} — ${context}`;
  });

  const prompt = `You are a biotech asset classifier. Classify each asset into exactly one modality from this list:
${CANONICAL_MODALITIES.join(", ")}

Reply with ONLY a JSON object: {"results": [{"id": N, "modality": "..."},...]}
Use "unknown" if truly unclear. Do not invent new modality names.

Assets:
${items.join("\n")}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { return result; }

    const arr: Array<{ id: number; modality: string }> =
      Array.isArray(parsed) ? parsed : (parsed.results ?? parsed.assets ?? parsed.classifications ?? []);

    for (const item of arr) {
      if (typeof item.id === "number" && typeof item.modality === "string") {
        const m = item.modality.toLowerCase().trim();
        if (m !== "unknown" && CANONICAL_MODALITIES.includes(m)) {
          result.set(item.id, m);
        }
      }
    }
  } catch (err: any) {
    console.error("[modality-fill] GPT batch error:", err.message);
  }

  return result;
}

export type ModalityFillOptions = {
  /** When true, no writes are performed — only counts are reported. */
  dryRun?: boolean;
  /** When true, the GPT-4o-mini fallback step is skipped. */
  skipGpt?: boolean;
  /** Batch size for GPT calls. Defaults to 50. */
  gptBatchSize?: number;
  /** Called after each update batch for progress reporting. */
  onProgress?: (processed: number, total: number) => void;
};

/**
 * Full modality rule-fill pipeline.
 *
 * 1. Normalize fragmented existing values (mrna → rna therapy, etc.)
 * 2. Fetch relevant assets with null/unknown modality
 * 3. Apply name-priority + Tier1/2/3 rules
 * 4. GPT-4o-mini fallback for unmatched residual
 * 5. UPDATE modality + recompute completeness_score for every changed row
 *
 * @param dbClient  A connected pg.PoolClient (caller is responsible for release)
 * @param opts      Optional flags and callbacks
 * @returns         A summary object with counts for each stage
 */
export async function runModalityFill(
  dbClient: import("pg").PoolClient,
  opts: ModalityFillOptions = {},
): Promise<ModalityFillSummary> {
  const { dryRun = false, skipGpt = false, gptBatchSize = 50, onProgress } = opts;

  // ── Step 1: Normalize fragmented existing values ──────────────────────────
  // Note: ingested_assets does not have an updated_at column; row recency is
  // tracked via last_seen_at (set by the ingestion pipeline on each scrape).
  // These UPDATE statements intentionally omit any timestamp column.
  let normalized = 0;
  if (!dryRun) {
    const r = await dbClient.query(`
      UPDATE ingested_assets
      SET modality = CASE
        WHEN LOWER(modality) IN ('mrna', 'mrna therapy', 'sirna') THEN 'rna therapy'
        WHEN LOWER(modality) = 'car-t'                             THEN 'cell therapy'
        WHEN LOWER(modality) = 'bispecific antibody'               THEN 'antibody'
        WHEN LOWER(modality) = 'device'                            THEN 'medical device'
        ELSE modality
      END
      WHERE relevant = true
        AND modality IS NOT NULL
        AND LOWER(modality) IN ('mrna', 'mrna therapy', 'sirna', 'car-t', 'bispecific antibody', 'device')
    `);
    normalized = r.rowCount ?? 0;
  } else {
    const r = await dbClient.query(`
      SELECT COUNT(*) AS n FROM ingested_assets
      WHERE relevant = true
        AND modality IS NOT NULL
        AND LOWER(modality) IN ('mrna', 'mrna therapy', 'sirna', 'car-t', 'bispecific antibody', 'device')
    `);
    normalized = Number(r.rows[0]?.n ?? 0);
  }

  // ── Step 2: Fetch assets with null/unknown modality ───────────────────────
  const { rows: assets } = await dbClient.query<ModalityAsset>(`
    SELECT id, asset_name, summary, abstract, indication, development_stage,
           mechanism_of_action, ip_type, patent_status, source_type, biology
    FROM ingested_assets
    WHERE relevant = true
      AND (modality IS NULL OR modality IN ('unknown', ''))
    ORDER BY id
  `);

  // ── Step 3: Apply rules ───────────────────────────────────────────────────
  const ruleMatches: Array<{ id: number; modality: string; asset: ModalityAsset }> = [];
  const unmatched: ModalityAsset[] = [];
  const tierCounts = { t1: 0, t2: 0, t3: 0 };

  for (const asset of assets) {
    const m = applyModalityRules(asset);
    if (m) {
      ruleMatches.push({ id: asset.id, modality: m, asset });
      const tier = detectTier(asset);
      if (tier === 1) tierCounts.t1++;
      else if (tier === 2) tierCounts.t2++;
      else tierCounts.t3++;
    } else {
      unmatched.push(asset);
    }
  }

  // ── Step 4: GPT-4o-mini fallback ─────────────────────────────────────────
  const gptMatches: Array<{ id: number; modality: string; asset: ModalityAsset }> = [];

  if (!skipGpt && unmatched.length > 0) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    for (let i = 0; i < unmatched.length; i += gptBatchSize) {
      const batch = unmatched.slice(i, i + gptBatchSize);
      const gptResult = await gptFallback(batch, openai);
      for (const asset of batch) {
        const m = gptResult.get(asset.id);
        if (m) gptMatches.push({ id: asset.id, modality: m, asset });
      }
      if (i + gptBatchSize < unmatched.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }

  // ── Step 5: Apply updates ─────────────────────────────────────────────────
  const allUpdates = [...ruleMatches, ...gptMatches];
  let totalUpdated = 0;

  if (!dryRun) {
    for (let i = 0; i < allUpdates.length; i++) {
      const u = allUpdates[i];
      const score = computeCompletenessScore({
        modality: u.modality,
        indication: u.asset.indication,
        developmentStage: u.asset.development_stage,
        mechanismOfAction: u.asset.mechanism_of_action,
        ipType: u.asset.ip_type,
        patentStatus: u.asset.patent_status,
        sourceType: u.asset.source_type,
        summary: u.asset.summary,
        biology: u.asset.biology,
      });
      await dbClient.query(
        `UPDATE ingested_assets SET modality = $1, completeness_score = $2 WHERE id = $3`,
        [u.modality, score, u.id],
      );
      totalUpdated++;
      if (onProgress && (i % 100 === 0 || i === allUpdates.length - 1)) {
        onProgress(totalUpdated, allUpdates.length);
      }
    }
  }

  return {
    total: assets.length,
    normalized,
    ruleMatched: ruleMatches.length,
    tierCounts,
    gptSent: unmatched.length,
    gptResolved: gptMatches.length,
    totalUpdated,
    unresolved: unmatched.length - gptMatches.length,
  };
}
