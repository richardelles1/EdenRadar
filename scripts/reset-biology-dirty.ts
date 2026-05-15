/**
 * reset-biology-dirty.ts
 *
 * Auditable remediation script for known biology misclassification patterns.
 * Nulls biology on assets that are demonstrably mislabeled by the old rules,
 * so the background enrichment pipeline can re-classify them with the corrected
 * biologyFill logic (device guard, viral-vector guard, AKI/CKD split, etc.).
 *
 * Usage:
 *   tsx scripts/reset-biology-dirty.ts [--dry-run]
 *
 * Always runs against SUPABASE_DATABASE_URL. Never touches DATABASE_URL (local).
 *
 * Categories reset:
 *   1. Device assets with biology set — devices have no molecular target
 *   2. Gene therapy / nanoparticle assets labeled "pathogen replication" whose
 *      indication lacks genuine infectious context (viral-vector false positives)
 *   3. Autoimmune-indication assets labeled "immune evasion" (should be
 *      "autoimmune dysregulation")
 */

import { Pool } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const DB_URL = process.env.SUPABASE_DATABASE_URL;
if (!DB_URL) {
  console.error("SUPABASE_DATABASE_URL is not set — aborting.");
  process.exit(1);
}

const pool = new Pool({ connectionString: DB_URL });

async function run() {
  const client = await pool.connect();
  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Biology Dirty-Data Reset — ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
    console.log(`${"=".repeat(60)}\n`);

    // ── Category 1: Device assets with any biology value ──────────────────────
    // Devices have no molecular target; biology should always be null.
    const deviceQuery = `
      SELECT id, asset_name, biology, modality
      FROM ingested_assets
      WHERE relevant = true
        AND biology IS NOT NULL
        AND (
          LOWER(modality) ~ '\\m(medical device|device|diagnostic|imaging|catheter|implant|stent|scaffold|endoscope|surgical|prosthetic|sensor|wearable|in vitro diagnostic|IVD)\\M'
          OR (
            LOWER(modality) ~ '\\m(device|diagnostic|imaging)\\M'
            AND target IS NULL
          )
        )
    `;
    const deviceResult = await client.query(deviceQuery);
    console.log(`Category 1 — Device assets with biology set: ${deviceResult.rows.length}`);
    if (!DRY_RUN && deviceResult.rows.length > 0) {
      const ids = deviceResult.rows.map((r: { id: number }) => r.id);
      await client.query(
        `UPDATE ingested_assets SET biology = NULL, enriched_at = NULL WHERE id = ANY($1)`,
        [ids]
      );
      console.log(`  → Nulled biology + reset enriched_at for ${ids.length} device assets`);
    } else if (DRY_RUN) {
      deviceResult.rows.slice(0, 5).forEach((r: { id: number; asset_name: string; biology: string; modality: string }) =>
        console.log(`  [DRY] id=${r.id} biology="${r.biology}" modality="${r.modality}" — ${r.asset_name?.slice(0, 60)}`)
      );
    }

    // ── Category 2: Gene therapy / nanoparticle assets with "pathogen replication" ──
    // Old viral-vector guard checked full text; new guard checks indication only.
    // Assets whose indication lacks infectious keywords need re-classification.
    const infectiousKw = [
      "infect", "viral disease", "bacterial disease", "pathogen", "SARS", "COVID",
      "HIV", "HCV", "HBV", "RSV", "CMV", "EBV", "HSV", "influenza", "malaria",
      "tuberculosis", "TB", "antimicrobial", "antibiotic", "sepsis",
    ];
    const infectiousPattern = infectiousKw.map((k) => k.toLowerCase()).join("|");

    const vectorQuery = `
      SELECT id, asset_name, biology, modality, indication
      FROM ingested_assets
      WHERE relevant = true
        AND biology = 'pathogen replication'
        AND LOWER(modality) ~ '\\m(gene therapy|gene editing|nanoparticle|lipid nanoparticle|LNP|AAV|lentiviral vector|viral vector|mRNA therapy|mRNA vaccine)\\M'
        AND (
          indication IS NULL
          OR NOT (LOWER(indication) ~* $1)
        )
    `;
    const vectorResult = await client.query(vectorQuery, [infectiousPattern]);
    console.log(`\nCategory 2 — Gene therapy / nanoparticle falsely labeled "pathogen replication": ${vectorResult.rows.length}`);
    if (!DRY_RUN && vectorResult.rows.length > 0) {
      const ids = vectorResult.rows.map((r: { id: number }) => r.id);
      await client.query(
        `UPDATE ingested_assets SET biology = NULL, enriched_at = NULL WHERE id = ANY($1)`,
        [ids]
      );
      console.log(`  → Nulled biology + reset enriched_at for ${ids.length} gene therapy assets`);
    } else if (DRY_RUN) {
      vectorResult.rows.slice(0, 5).forEach((r: { id: number; asset_name: string; modality: string; indication: string }) =>
        console.log(`  [DRY] id=${r.id} modality="${r.modality}" indication="${(r.indication ?? "").slice(0, 60)}" — ${r.asset_name?.slice(0, 60)}`)
      );
    }

    // ── Category 3: Autoimmune-indication assets labeled "immune evasion" ─────
    // Guard 3 now downgrades these; nulling forces re-classification.
    const autoimmuneKw = [
      "autoimmune", "autoantibody", "rheumatoid", "lupus", "multiple sclerosis",
      "inflammatory bowel", "Crohn", "psoriatic", "ankylosing spondylitis",
      "myasthenia", "vasculitis", "celiac",
    ];
    const autoimmunePattern = autoimmuneKw.join("|");

    const autoimmuneQuery = `
      SELECT id, asset_name, biology, indication
      FROM ingested_assets
      WHERE relevant = true
        AND biology = 'immune evasion'
        AND (
          LOWER(indication) ~* $1
          OR LOWER(summary) ~* $1
        )
    `;
    const autoimmuneResult = await client.query(autoimmuneQuery, [autoimmunePattern]);
    console.log(`\nCategory 3 — Autoimmune assets mislabeled "immune evasion": ${autoimmuneResult.rows.length}`);
    if (!DRY_RUN && autoimmuneResult.rows.length > 0) {
      const ids = autoimmuneResult.rows.map((r: { id: number }) => r.id);
      await client.query(
        `UPDATE ingested_assets SET biology = NULL, enriched_at = NULL WHERE id = ANY($1)`,
        [ids]
      );
      console.log(`  → Nulled biology + reset enriched_at for ${ids.length} autoimmune assets`);
    } else if (DRY_RUN) {
      autoimmuneResult.rows.slice(0, 5).forEach((r: { id: number; asset_name: string; indication: string }) =>
        console.log(`  [DRY] id=${r.id} indication="${(r.indication ?? "").slice(0, 60)}" — ${r.asset_name?.slice(0, 60)}`)
      );
    }

    // ── Category 4: Software / algorithm / research tool assets with biology ──
    // These describe computational methods or assays — not therapeutic interventions.
    // The new isToolModality() guard in biologyFill.ts ensures they return null
    // on re-enrichment, so we only need to clear their current biology value.
    const toolQuery = `
      SELECT id, asset_name, biology, modality
      FROM ingested_assets
      WHERE relevant = true
        AND biology IS NOT NULL
        AND (
          LOWER(modality) ~ '\\m(software|algorithm|research tool|assay|software/algorithm|computational|in silico)\\M'
        )
    `;
    const toolResult = await client.query(toolQuery);
    console.log(`\nCategory 4 — Software/algorithm/research tool assets with biology set: ${toolResult.rows.length}`);
    if (!DRY_RUN && toolResult.rows.length > 0) {
      const ids = toolResult.rows.map((r: { id: number }) => r.id);
      await client.query(
        `UPDATE ingested_assets SET biology = NULL, enriched_at = NULL WHERE id = ANY($1)`,
        [ids]
      );
      console.log(`  → Nulled biology + reset enriched_at for ${ids.length} tool assets`);
    } else if (DRY_RUN) {
      toolResult.rows.slice(0, 5).forEach((r: { id: number; asset_name: string; biology: string; modality: string }) =>
        console.log(`  [DRY] id=${r.id} biology="${r.biology}" modality="${r.modality}" — ${r.asset_name?.slice(0, 60)}`)
      );
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const totalReset = deviceResult.rows.length + vectorResult.rows.length + autoimmuneResult.rows.length + toolResult.rows.length;
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Total assets ${DRY_RUN ? "would be" : ""} reset: ${totalReset}`);
    console.log(`  Category 1 (device):             ${deviceResult.rows.length}`);
    console.log(`  Category 2 (viral-vector guard): ${vectorResult.rows.length}`);
    console.log(`  Category 3 (autoimmune guard):   ${autoimmuneResult.rows.length}`);
    console.log(`  Category 4 (software/tool):      ${toolResult.rows.length}`);
    if (!DRY_RUN && totalReset > 0) {
      console.log(`\nAll reset assets have enriched_at = NULL and will be picked up`);
      console.log(`by the next background biology fill run.`);
      console.log(`Run: POST /api/admin/enrich/biology-fill  (Admin panel → Enrich tab)`);
    } else if (DRY_RUN) {
      console.log(`\nRe-run without --dry-run to apply changes.`);
    }
    console.log(`${"=".repeat(60)}\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
