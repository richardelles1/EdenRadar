/**
 * Modality Rule-Fill — Task #975
 *
 * Maps 12,439 relevant assets with null/unknown modality using a tiered
 * keyword rule engine. GPT-4o-mini fallback for unresolved residual.
 * Recomputes completeness scores for every asset that was updated.
 *
 * Usage:
 *   npx tsx scripts/modality-rule-fill.ts
 *   npx tsx scripts/modality-rule-fill.ts --dry-run
 *   npx tsx scripts/modality-rule-fill.ts --skip-gpt
 */

import { pool } from "../server/db";
import { computeCompletenessScore } from "../server/lib/pipeline/contentHash";
import OpenAI from "openai";

const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_GPT = process.argv.includes("--skip-gpt");
const GPT_BATCH_SIZE = 50;

const CANONICAL_MODALITIES = [
  "small molecule", "antibody", "adc", "biologic", "peptide",
  "gene therapy", "gene editing", "rna therapy", "cell therapy",
  "vaccine", "nanoparticle", "diagnostic", "medical device",
  "probiotic", "natural product", "platform technology",
  "research tool", "software/algorithm", "radiopharmaceutical", "protac",
];

// ── Tier 1: Very high confidence ─────────────────────────────────────────────
const TIER1_RULES: Array<{ pattern: RegExp; modality: string }> = [
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
const TIER2_RULES: Array<{ pattern: RegExp; modality: string }> = [
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
const TIER3_RULES: Array<{ pattern: RegExp; modality: string }> = [
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

// ── Name-only high-priority patterns (override full-text if matched) ──────────
const NAME_PRIORITY_RULES: Array<{ pattern: RegExp; modality: string }> = [
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

type AssetRow = {
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
};

function applyRules(asset: AssetRow): string | null {
  const name = asset.asset_name ?? "";
  const full = [
    name,
    asset.summary ?? "",
    asset.abstract ?? "",
  ].join(" ").toLowerCase();

  // Check name-priority rules first
  for (const rule of NAME_PRIORITY_RULES) {
    if (rule.pattern.test(name)) {
      // Special case: "Device" in name only matches if no drug-context words
      if (rule.modality === "medical device") {
        const hasDrugContext = /\binhibitor\b|\btherapy\b|\bdrug\b|\bcompound\b|\bantibody\b|\bvaccine\b|\bgene\b|\bpeptide\b|\bbiologic\b|\bmolecule\b/i.test(name);
        if (hasDrugContext) continue;
      }
      return rule.modality;
    }
  }

  // Tier 1
  for (const rule of TIER1_RULES) {
    if (rule.pattern.test(full)) return rule.modality;
  }
  // Tier 2
  for (const rule of TIER2_RULES) {
    if (rule.pattern.test(full)) return rule.modality;
  }
  // Tier 3
  for (const rule of TIER3_RULES) {
    if (rule.pattern.test(full)) return rule.modality;
  }

  return null;
}

async function gptFallback(
  batch: AssetRow[],
  openai: OpenAI,
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (batch.length === 0) return result;

  const items = batch.map((a, i) => {
    const text = [a.asset_name, a.summary ?? "", a.abstract ?? ""]
      .join(" ")
      .slice(0, 600);
    return `${i + 1}. [ID:${a.id}] ${text}`;
  });

  const prompt = `You are a biotech asset classifier. Classify each asset into exactly one modality from this list:
${CANONICAL_MODALITIES.join(", ")}

Reply with ONLY a JSON array of objects like: [{"id": 123, "modality": "small molecule"}, ...]
If truly unclear, use "unknown".

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
    try {
      parsed = JSON.parse(raw);
    } catch {
      return result;
    }

    const arr: Array<{ id: number; modality: string }> = Array.isArray(parsed)
      ? parsed
      : (parsed.results ?? parsed.assets ?? parsed.classifications ?? []);

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

async function main() {
  console.log(`[modality-fill] Starting${DRY_RUN ? " (DRY RUN)" : ""}…`);

  const client = await pool.connect();
  try {
    // ── Step 1: Normalize fragmented existing values ──────────────────────────
    console.log("[modality-fill] Step 1: Normalizing fragmented modality values…");
    if (!DRY_RUN) {
      const normalizeResult = await client.query(`
        UPDATE ingested_assets
        SET modality = CASE
          WHEN LOWER(modality) IN ('mrna', 'mrna therapy', 'sirna') THEN 'rna therapy'
          WHEN LOWER(modality) = 'car-t'                             THEN 'cell therapy'
          WHEN LOWER(modality) = 'bispecific antibody'               THEN 'antibody'
          ELSE modality
        END,
        updated_at = NOW()
        WHERE relevant = true
          AND modality IS NOT NULL
          AND LOWER(modality) IN ('mrna', 'mrna therapy', 'sirna', 'car-t', 'bispecific antibody')
      `);
      console.log(`[modality-fill] Step 1 done: ${normalizeResult.rowCount} existing values normalized.`);
    } else {
      const countRes = await client.query(`
        SELECT COUNT(*) FROM ingested_assets
        WHERE relevant = true
          AND modality IS NOT NULL
          AND LOWER(modality) IN ('mrna', 'mrna therapy', 'sirna', 'car-t', 'bispecific antibody')
      `);
      console.log(`[modality-fill] Step 1 (dry-run): would normalize ${countRes.rows[0].count} rows.`);
    }

    // ── Step 2: Fetch assets with null/unknown modality ───────────────────────
    console.log("[modality-fill] Step 2: Fetching assets with missing modality…");
    const { rows: assets } = await client.query<AssetRow>(`
      SELECT id, asset_name, summary, abstract, indication, development_stage,
             mechanism_of_action, ip_type, patent_status, source_type
      FROM ingested_assets
      WHERE relevant = true
        AND (modality IS NULL OR modality IN ('unknown', ''))
      ORDER BY id
    `);
    console.log(`[modality-fill] Found ${assets.length} assets to process.`);

    // ── Step 3: Apply rules ───────────────────────────────────────────────────
    const ruleMatches: Array<{ id: number; modality: string; asset: AssetRow }> = [];
    const unmatched: AssetRow[] = [];
    const tierCounts = { t1: 0, t2: 0, t3: 0 };

    for (const asset of assets) {
      const matched = applyRules(asset);
      if (matched) {
        ruleMatches.push({ id: asset.id, modality: matched, asset });
        // Count tier (approximate — name-priority counts as tier 1 context)
        const name = asset.asset_name ?? "";
        const full = [name, asset.summary ?? "", asset.abstract ?? ""].join(" ").toLowerCase();

        let tier = 3;
        for (const rule of TIER1_RULES) {
          if (rule.pattern.test(name) || rule.pattern.test(full)) { tier = 1; break; }
        }
        if (tier === 3) {
          for (const rule of TIER2_RULES) {
            if (rule.pattern.test(full)) { tier = 2; break; }
          }
        }
        if (tier === 1) tierCounts.t1++;
        else if (tier === 2) tierCounts.t2++;
        else tierCounts.t3++;
      } else {
        unmatched.push(asset);
      }
    }

    console.log(`[modality-fill] Rule matches: ${ruleMatches.length} (T1:${tierCounts.t1} T2:${tierCounts.t2} T3:${tierCounts.t3}), unmatched: ${unmatched.length}`);

    // ── Step 4: GPT fallback for unmatched ────────────────────────────────────
    const gptMatches: Array<{ id: number; modality: string; asset: AssetRow }> = [];

    if (!SKIP_GPT && unmatched.length > 0) {
      console.log(`[modality-fill] Step 3: GPT-4o-mini fallback for ${unmatched.length} unmatched assets…`);
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      for (let i = 0; i < unmatched.length; i += GPT_BATCH_SIZE) {
        const batch = unmatched.slice(i, i + GPT_BATCH_SIZE);
        const batchNum = Math.floor(i / GPT_BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(unmatched.length / GPT_BATCH_SIZE);
        process.stdout.write(`\r[modality-fill] GPT batch ${batchNum}/${totalBatches}…`);

        const gptResult = await gptFallback(batch, openai);
        for (const asset of batch) {
          const m = gptResult.get(asset.id);
          if (m) {
            gptMatches.push({ id: asset.id, modality: m, asset });
          }
        }

        // Small delay to avoid rate limits
        if (i + GPT_BATCH_SIZE < unmatched.length) {
          await new Promise(r => setTimeout(r, 200));
        }
      }
      console.log(`\n[modality-fill] GPT resolved ${gptMatches.length}/${unmatched.length} unmatched assets.`);
    } else if (SKIP_GPT) {
      console.log("[modality-fill] GPT fallback skipped (--skip-gpt flag).");
    }

    // ── Step 5: Apply updates ─────────────────────────────────────────────────
    const allUpdates = [...ruleMatches, ...gptMatches];
    let totalUpdated = 0;

    if (allUpdates.length === 0) {
      console.log("[modality-fill] No updates to apply.");
    } else if (DRY_RUN) {
      console.log(`[modality-fill] DRY RUN — would update ${allUpdates.length} assets.`);
      const sample = allUpdates.slice(0, 10);
      for (const u of sample) {
        console.log(`  [${u.id}] "${u.asset.asset_name}" → ${u.modality}`);
      }
      if (allUpdates.length > 10) console.log(`  … and ${allUpdates.length - 10} more`);
    } else {
      console.log(`[modality-fill] Applying ${allUpdates.length} modality updates + recomputing completeness scores…`);

      const BATCH = 500;
      for (let i = 0; i < allUpdates.length; i += BATCH) {
        const chunk = allUpdates.slice(i, i + BATCH);

        for (const u of chunk) {
          // Compute new completeness score with the filled modality
          const newScore = computeCompletenessScore({
            modality: u.modality,
            indication: u.asset.indication,
            developmentStage: u.asset.development_stage,
            mechanismOfAction: u.asset.mechanism_of_action,
            ipType: u.asset.ip_type,
            patentStatus: u.asset.patent_status,
            sourceType: u.asset.source_type,
            summary: u.asset.summary,
          });

          await client.query(
            `UPDATE ingested_assets
             SET modality = $1, completeness_score = $2, updated_at = NOW()
             WHERE id = $3`,
            [u.modality, newScore, u.id],
          );
        }

        totalUpdated += chunk.length;
        process.stdout.write(`\r[modality-fill] Updated ${totalUpdated}/${allUpdates.length}…`);
      }
      console.log(`\n[modality-fill] Done.`);
    }

    const unresolved = unmatched.length - gptMatches.length;

    console.log("\n─────────────────────────────────────────");
    console.log("[modality-fill] SUMMARY");
    console.log(`  Total assets processed  : ${assets.length}`);
    console.log(`  Step 1 normalizations   : (see above)`);
    console.log(`  Rule-matched (T1)       : ${tierCounts.t1}`);
    console.log(`  Rule-matched (T2)       : ${tierCounts.t2}`);
    console.log(`  Rule-matched (T3)       : ${tierCounts.t3}`);
    console.log(`  GPT-4o-mini resolved    : ${gptMatches.length}`);
    console.log(`  Total updated           : ${DRY_RUN ? "(dry run)" : totalUpdated}`);
    console.log(`  Unresolved (still null) : ${unresolved}`);
    console.log("─────────────────────────────────────────");

    return {
      total: assets.length,
      ruleMatched: ruleMatches.length,
      tierCounts,
      gptResolved: gptMatches.length,
      totalUpdated: DRY_RUN ? 0 : totalUpdated,
      unresolved,
    };
  } finally {
    client.release();
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("[modality-fill] Fatal error:", err);
    pool.end().finally(() => process.exit(1));
  });
