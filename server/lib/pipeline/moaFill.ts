/**
 * MOA Fill — assigns a concise "mechanism_of_action" value to each asset.
 *
 * Two passes run in order:
 *   Pass 1 (free, synchronous): biology → MOA deterministic lookup table.
 *     Covers assets that already have biology but lack MOA.
 *   Pass 2 (GPT-4o-mini, async batched): AI extraction for assets with
 *     a rich summary, abstract, or innovation_claim (>200 chars combined)
 *     but still no MOA after Pass 1.
 */

import OpenAI from "openai";
import { computeCompletenessScore } from "./contentHash";

// ── Biology → MOA deterministic lookup ────────────────────────────────────────
// One entry per canonical biology value (32 total).
export const BIOLOGY_TO_MOA: Record<string, string> = {
  // Oncology
  "aberrant kinase signaling":
    "Kinase inhibition (targeting dysregulated kinase or RTK pathway)",
  "cell cycle dysregulation":
    "Cell cycle arrest via CDK/cyclin pathway inhibition",
  "epigenetic dysregulation":
    "Epigenetic enzyme inhibition (HDAC, EZH2, DNMT, or BET bromodomain)",
  "dna damage response deficiency":
    "DNA damage response exploitation via PARP inhibition or synthetic lethality",
  "immune evasion":
    "Immune checkpoint blockade (PD-1/PD-L1, CTLA-4, or co-inhibitory axis)",
  "apoptosis resistance":
    "Pro-apoptotic pathway restoration (BCL-2 family or MDM2-p53 axis modulation)",
  "oncogenic transcription":
    "Oncogenic transcription factor inhibition or oncogene suppression (MYC, NF-κB)",
  "angiogenesis":
    "Anti-angiogenic therapy via VEGF/VEGFR pathway inhibition",
  "tumor microenvironment":
    "Tumor microenvironment remodeling to restore anti-tumor immune activity",
  // Neurological
  "protein aggregation":
    "Inhibition or clearance of pathological protein aggregates (amyloid, tau, or α-synuclein)",
  "neuroinflammation":
    "Neuroinflammation suppression via microglial or astrocyte modulation",
  "synaptic dysfunction":
    "Neurotransmitter or synaptic receptor modulation to restore signaling balance",
  "mitochondrial dysfunction":
    "Mitochondrial function restoration via ETC complex support or ROS reduction",
  "myelin disruption":
    "Remyelination promotion or oligodendrocyte neuroprotection",
  "neuronal excitotoxicity":
    "Excitotoxicity blockade via NMDA receptor antagonism or glutamate modulation",
  // Immunological
  "autoimmune dysregulation":
    "Immune tolerance restoration or autoreactive T/B-cell suppression",
  "cytokine dysregulation":
    "Cytokine signaling neutralization via anti-cytokine antibody or JAK-STAT inhibition",
  "complement dysregulation":
    "Complement cascade inhibition (C3, C5, or factor B/D blockade)",
  "allergic dysregulation":
    "IgE-mediated or mast cell/eosinophil pathway blockade (anti-IgE or IL-4/IL-13 inhibition)",
  "immune deficiency":
    "Immune reconstitution or enzyme/protein replacement to restore immune competence",
  // Metabolic / Endocrine
  "insulin resistance":
    "Insulin sensitization or incretin pathway activation (GLP-1R agonism or SGLT2 inhibition)",
  "lipid metabolism dysfunction":
    "Lipid-lowering via PCSK9, HMG-CoA reductase, or CETP inhibition",
  "enzyme deficiency":
    "Enzyme replacement or substrate reduction therapy",
  "hormonal dysregulation":
    "Hormone receptor modulation or correction of dysregulated hormone levels",
  // Genetic / Structural
  "gene expression deficiency":
    "Gene expression restoration via gene therapy, ASO, or nonsense read-through",
  "ion channel dysfunction":
    "Ion channel correction or potentiation (e.g., CFTR modulator, Nav/Kv modulator)",
  "structural protein defect":
    "Structural protein replacement or exon-skipping to restore protein function",
  "rna splicing defect":
    "Splice-switching or SMN2 splicing correction via ASO or small molecule",
  // Infectious
  "pathogen replication":
    "Antiviral or antibacterial inhibition of pathogen replication machinery",
  "antimicrobial resistance":
    "Resistance mechanism circumvention via novel antibiotic class or β-lactamase inhibition",
  // General
  "fibrosis":
    "Anti-fibrotic signaling inhibition (TGF-β, myofibroblast activation, or collagen crosslinking)",
  "ischemia and oxidative stress":
    "Cytoprotection or reperfusion injury mitigation via antioxidant, ROS scavenging, or vasodilation",
};

// ── Types ──────────────────────────────────────────────────────────────────────

export type MoaFillProgress = {
  phase: "pass1" | "pass2" | "done" | "idle";
  processed: number;
  total: number;
  pass1Filled: number;
  aiFilled: number;
  failed: number;
  done: boolean;
};

export type MoaFillSummary = {
  pass1Total: number;
  pass1Filled: number;
  pass2Total: number;
  aiFilled: number;
  failed: number;
  totalWritten: number;
};

export type MoaFillOptions = {
  cap?: number;
  signal?: AbortSignal;
  onProgress?: (p: MoaFillProgress) => void;
};

type MoaAsset = {
  id: number;
  asset_name: string;
  summary: string | null;
  abstract: string | null;
  innovation_claim: string | null;
  indication: string | null;
  modality: string | null;
  target: string | null;
  biology: string | null;
  source_type: string | null;
  ip_type: string | null;
  patent_status: string | null;
  development_stage: string | null;
};

// ── DB flush helper ────────────────────────────────────────────────────────────

async function flushMoaToDB(
  dbClient: import("pg").PoolClient,
  updates: Array<{ id: number; moa: string; completenessScore?: number | null }>,
): Promise<void> {
  if (updates.length === 0) return;
  const values: unknown[] = [];
  const rows = updates.map((u, j) => {
    const base = j * 3;
    values.push(u.id, u.moa, u.completenessScore ?? null);
    return `($${base + 1}::int, $${base + 2}::text, $${base + 3}::numeric)`;
  });
  await dbClient.query(
    `UPDATE ingested_assets AS t
     SET mechanism_of_action = v.moa,
         completeness_score   = COALESCE(v.cs, t.completeness_score)
     FROM (VALUES ${rows.join(", ")}) AS v(id, moa, cs)
     WHERE t.id = v.id`,
    values,
  );
}

// ── Context builder for AI prompt ─────────────────────────────────────────────
// Uses summary, abstract, AND innovation_claim, prioritising the richest available.

function buildAssetContext(a: MoaAsset): string {
  const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const parts = [
    a.abstract ? stripHtml(a.abstract) : "",
    a.innovation_claim ? stripHtml(a.innovation_claim) : "",
    a.summary ? stripHtml(a.summary) : "",
    a.indication ?? "",
    a.biology ?? "",
  ].filter(Boolean);
  return parts.join(" ").slice(0, 900);
}

// ── GPT-4o-mini MOA extraction ─────────────────────────────────────────────────

async function gptMoaBatch(
  batch: MoaAsset[],
  openai: OpenAI,
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (batch.length === 0) return result;

  const idxToId = new Map<number, number>();
  const items = batch.map((a, i) => {
    idxToId.set(i + 1, a.id);
    const ctx = buildAssetContext(a);
    return `${i + 1}. ${a.asset_name} | Modality: ${a.modality ?? "unknown"} | Biology: ${a.biology ?? "unknown"} | Target: ${a.target ?? "unknown"} | ${ctx}`;
  });

  const prompt = `You are a biotech asset classifier. For each asset below, write a single concise "mechanism_of_action" phrase (10–25 words) that describes HOW the therapy works at the molecular/cellular level — not what disease it treats.

Examples of good MOA phrases:
- "Selective inhibition of BCL-2 anti-apoptotic protein, releasing sequestered pro-apoptotic factors"
- "Competitive antagonism at the GLP-1 receptor to stimulate insulin secretion and suppress glucagon"
- "Splice-switching antisense oligonucleotide that redirects SMN2 pre-mRNA splicing to include exon 7"

Reply ONLY with a JSON object:
{"results": [{"idx": 1, "moa": "..."}, {"idx": 2, "moa": "..."}, ...]}

Rules:
- Be specific but concise (10–25 words max)
- Use "unknown" only if genuinely impossible to determine
- Never use brand names, company names, or institution names
- Focus on molecular mechanism, not clinical indication

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

    const arr: Array<{ idx?: number; moa: string }> =
      Array.isArray(parsed) ? parsed : (parsed.results ?? []);

    for (const item of arr) {
      if (typeof item.moa !== "string") continue;
      const moa = item.moa.trim();
      if (!moa || moa.toLowerCase() === "unknown" || moa.length < 5) continue;
      const listPos = typeof item.idx === "number" ? item.idx : null;
      if (listPos === null) continue;
      const dbId = idxToId.get(listPos);
      if (dbId !== undefined) result.set(dbId, moa);
    }
  } catch (err: any) {
    console.error("[moa-fill] GPT batch error:", err.message);
  }

  return result;
}

// ── Rich-text qualification helper ────────────────────────────────────────────
// An asset qualifies for Pass 2 AI enrichment when its combined text content
// (summary + abstract + innovation_claim) is at least 200 characters.

function hasRichText(a: MoaAsset): boolean {
  const combined = [a.summary ?? "", a.abstract ?? "", a.innovation_claim ?? ""].join(" ");
  return combined.trim().length > 200;
}

// ── Main pipeline ──────────────────────────────────────────────────────────────

export async function runMoaFill(
  dbClient: import("pg").PoolClient,
  opts: MoaFillOptions = {},
): Promise<MoaFillSummary> {
  const { cap, signal, onProgress } = opts;

  const emit = (p: MoaFillProgress) => onProgress?.(p);

  // ── Pass 1 (synchronous): biology → MOA lookup ─────────────────────────────
  emit({ phase: "pass1", processed: 0, total: 0, pass1Filled: 0, aiFilled: 0, failed: 0, done: false });

  const { rows: pass1Assets } = await dbClient.query<MoaAsset>(
    `SELECT id, asset_name, summary, abstract, innovation_claim, indication, modality, target, biology,
            source_type, ip_type, patent_status, development_stage
     FROM ingested_assets
     WHERE relevant = true
       AND biology IS NOT NULL AND biology != '' AND biology != 'unknown'
       AND (mechanism_of_action IS NULL OR mechanism_of_action = '' OR mechanism_of_action = 'unknown')
     ORDER BY completeness_score DESC NULLS LAST, id
     ${cap ? `LIMIT ${cap}` : ""}`,
  );

  const pass1Total = pass1Assets.length;
  let pass1Filled = 0;
  const pass1Updates: Array<{ id: number; moa: string; completenessScore?: number | null }> = [];

  for (const asset of pass1Assets) {
    if (signal?.aborted) break;
    const moa = asset.biology ? BIOLOGY_TO_MOA[asset.biology.toLowerCase()] : undefined;
    if (moa) {
      pass1Updates.push({
        id: asset.id,
        moa,
        completenessScore: computeCompletenessScore({
          modality: asset.modality,
          indication: asset.indication,
          developmentStage: asset.development_stage,
          mechanismOfAction: moa,
          ipType: asset.ip_type,
          patentStatus: asset.patent_status,
          sourceType: asset.source_type,
          summary: asset.summary,
          biology: asset.biology,
        }),
      });
      pass1Filled++;
    }
  }

  if (pass1Updates.length > 0) {
    await flushMoaToDB(dbClient, pass1Updates);
  }

  // Emit pass1 completion clearly before starting pass2
  emit({ phase: "pass1", processed: pass1Total, total: pass1Total, pass1Filled, aiFilled: 0, failed: 0, done: false });

  if (signal?.aborted) {
    return { pass1Total, pass1Filled, pass2Total: 0, aiFilled: 0, failed: 0, totalWritten: pass1Filled };
  }

  // ── Pass 2 (async GPT): AI extraction for richly-described assets ──────────
  // Qualify assets where summary OR abstract OR innovation_claim provides
  // enough combined text (>200 chars) for the model to extract a meaningful MOA.
  const pass2Cap = cap ? Math.max(0, cap - pass1Assets.length) : undefined;

  const { rows: pass2CandidateAssets } = await dbClient.query<MoaAsset>(
    `SELECT id, asset_name, summary, abstract, innovation_claim, indication, modality, target, biology,
            source_type, ip_type, patent_status, development_stage
     FROM ingested_assets
     WHERE relevant = true
       AND (mechanism_of_action IS NULL OR mechanism_of_action = '' OR mechanism_of_action = 'unknown')
       AND (
         LENGTH(COALESCE(summary, '')) > 200
         OR LENGTH(COALESCE(abstract, '')) > 200
         OR LENGTH(COALESCE(innovation_claim, '')) > 200
         OR (LENGTH(COALESCE(summary, '')) + LENGTH(COALESCE(abstract, '')) + LENGTH(COALESCE(innovation_claim, ''))) > 200
       )
     ORDER BY completeness_score DESC NULLS LAST, id
     ${pass2Cap !== undefined ? `LIMIT ${pass2Cap}` : ""}`,
  );

  // Further filter in-memory using the combined-length check (avoids SQL edge cases)
  const pass2Assets = pass2CandidateAssets.filter(hasRichText);
  const pass2Total = pass2Assets.length;
  let aiFilled = 0;
  let failed = 0;

  emit({ phase: "pass2", processed: 0, total: pass2Total, pass1Filled, aiFilled: 0, failed: 0, done: false });

  if (pass2Total > 0 && !signal?.aborted) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const BATCH_SIZE = 20;

    for (let i = 0; i < pass2Assets.length; i += BATCH_SIZE) {
      if (signal?.aborted) break;
      const batch = pass2Assets.slice(i, i + BATCH_SIZE);
      const gptResult = await gptMoaBatch(batch, openai);

      const batchWrites: Array<{ id: number; moa: string; completenessScore?: number | null }> = [];
      for (const asset of batch) {
        const moa = gptResult.get(asset.id);
        if (moa) {
          batchWrites.push({
            id: asset.id,
            moa,
            completenessScore: computeCompletenessScore({
              modality: asset.modality,
              indication: asset.indication,
              developmentStage: asset.development_stage,
              mechanismOfAction: moa,
              ipType: asset.ip_type,
              patentStatus: asset.patent_status,
              sourceType: asset.source_type,
              summary: asset.summary,
              biology: asset.biology,
            }),
          });
          aiFilled++;
        } else {
          failed++;
        }
      }

      if (batchWrites.length > 0) {
        await flushMoaToDB(dbClient, batchWrites);
      }

      emit({
        phase: "pass2",
        processed: Math.min(i + BATCH_SIZE, pass2Total),
        total: pass2Total,
        pass1Filled,
        aiFilled,
        failed,
        done: false,
      });

      if (i + BATCH_SIZE < pass2Assets.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
  }

  const totalWritten = pass1Filled + aiFilled;
  emit({ phase: "done", processed: pass2Total, total: pass2Total, pass1Filled, aiFilled, failed, done: true });

  return { pass1Total, pass1Filled, pass2Total, aiFilled, failed, totalWritten };
}
