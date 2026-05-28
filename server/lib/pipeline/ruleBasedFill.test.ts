import { describe, it, expect, vi } from "vitest";

// applyRulesToAsset is pure-synchronous. The module-level db import exists only
// for runRuleBasedFill / estimateRuleBasedFill — mock it so the test has no DB dep.
vi.mock("../../db", () => ({ db: {} }));
vi.mock("@shared/schema", () => ({ ingestedAssets: {} }));

import { applyRulesToAsset } from "./ruleBasedFill";

// ── helpers ───────────────────────────────────────────────────────────────────

// Minimal asset with all fields set to "no data" values and summary long enough
// to pass the 150-char dataSparse gate (so text-based rules fire by default).
function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    assetName: null,
    summary: "X".repeat(200),
    abstract: null,
    developmentStage: "unknown",
    ipType: null,
    licensingReadiness: null,
    indication: null,
    modality: null,
    target: null,
    categories: null,
    humanVerified: null,
    sourceType: null,
    deepEnrichAttempts: null,
    comparableDrugs: null,
    unmetNeed: null,
    patentStatus: null,
    mechanismOfAction: null,
    biology: null,
    targetClass: null,
    unmetNeedSeverity: null,
    ...overrides,
  };
}

// ── dataSparse flag ───────────────────────────────────────────────────────────

describe("dataSparse flag", () => {
  it("returns dataSparse=false when summary >= 150 chars", () => {
    const { dataSparse } = applyRulesToAsset(asset({ summary: "A".repeat(150) }));
    expect(dataSparse).toBe(false);
  });

  it("returns dataSparse=true when combined text < 150 chars", () => {
    const { dataSparse } = applyRulesToAsset(asset({ summary: "short" }));
    expect(dataSparse).toBe(true);
  });
});

// ── developmentStage rules ────────────────────────────────────────────────────

describe("developmentStage rules", () => {
  // Pad with 'X' (not spaces) so text.trim() stays >= 150 chars (the dataSparse threshold).
  const s = (text: string) => asset({ summary: text + "X".repeat(Math.max(0, 200 - text.length)) });

  it("detects phase 2", () => {
    expect(applyRulesToAsset(s("Phase 2 clinical trial for NSCLC.")).fields.developmentStage).toBe("phase 2");
  });

  it("detects phase 3", () => {
    expect(applyRulesToAsset(s("Phase 3 randomized controlled trial.")).fields.developmentStage).toBe("phase 3");
  });

  it("detects phase 1 via first-in-human", () => {
    expect(applyRulesToAsset(s("First-in-human study initiated.")).fields.developmentStage).toBe("phase 1");
  });

  it("detects preclinical via in vivo", () => {
    expect(applyRulesToAsset(s("Efficacy demonstrated in a mouse model in vivo.")).fields.developmentStage).toBe("preclinical");
  });

  it("detects preclinical via proof-of-concept", () => {
    expect(applyRulesToAsset(s("Proof-of-concept study shows efficacy.")).fields.developmentStage).toBe("preclinical");
  });

  it("detects approved via FDA-approved", () => {
    expect(applyRulesToAsset(s("FDA-approved small molecule therapy.")).fields.developmentStage).toBe("approved");
  });

  it("detects discovery via lead identification", () => {
    expect(applyRulesToAsset(s("Lead identification campaign targeting KRAS.")).fields.developmentStage).toBe("discovery");
  });

  it("does not overwrite a known stage", () => {
    const result = applyRulesToAsset(asset({ developmentStage: "phase 2", summary: "Phase 3 trial started." + "X".repeat(200) }));
    expect(result.fields.developmentStage).toBeUndefined();
  });

  it("does not overwrite when humanVerified.developmentStage is true", () => {
    const result = applyRulesToAsset(asset({
      developmentStage: "unknown",
      humanVerified: { developmentStage: true },
      summary: "Phase 2 trial." + "X".repeat(200),
    }));
    expect(result.fields.developmentStage).toBeUndefined();
  });
});

// ── ipType rules ──────────────────────────────────────────────────────────────

describe("ipType rules", () => {
  const s = (text: string) => asset({ summary: text + "X".repeat(Math.max(0, 200 - text.length)) });

  it("detects patent pending", () => {
    expect(applyRulesToAsset(s("Patent pending application filed.")).fields.ipType).toBe("patent pending");
  });

  it("detects patented via issued patent", () => {
    expect(applyRulesToAsset(s("Issued patent covering the core composition.")).fields.ipType).toBe("patented");
  });

  it("detects provisional", () => {
    expect(applyRulesToAsset(s("A provisional patent application has been filed.")).fields.ipType).toBe("provisional");
  });

  it("detects trade secret", () => {
    expect(applyRulesToAsset(s("Proprietary know-how protected as trade secret.")).fields.ipType).toBe("trade secret");
  });

  it("derives ipType from patentStatus='patented' (structural signal)", () => {
    const result = applyRulesToAsset(asset({ patentStatus: "patented", summary: "X".repeat(200) }));
    expect(result.fields.ipType).toBe("patented");
    expect(result.provenance.ipType).toBe("rule:patent_status");
  });

  it("derives ipType from patentStatus='pending'", () => {
    expect(applyRulesToAsset(asset({ patentStatus: "pending", summary: "X".repeat(200) })).fields.ipType).toBe("patent pending");
  });
});

// ── licensingReadiness rules ──────────────────────────────────────────────────

describe("licensingReadiness rules", () => {
  const s = (text: string) => asset({ summary: text + "X".repeat(Math.max(0, 200 - text.length)) });

  it("detects available for licensing", () => {
    expect(applyRulesToAsset(s("Available for licensing.")).fields.licensingReadiness).toBe("available");
  });

  it("detects exclusively licensed", () => {
    expect(applyRulesToAsset(s("Technology has been exclusively licensed.")).fields.licensingReadiness).toBe("exclusively licensed");
  });

  it("detects non-exclusively licensed", () => {
    expect(applyRulesToAsset(s("Non-exclusively licensed to multiple companies.")).fields.licensingReadiness).toBe("non-exclusively licensed");
  });

  it("detects startup formed via spin-out", () => {
    expect(applyRulesToAsset(s("A spin-out company was formed to commercialise.")).fields.licensingReadiness).toBe("startup formed");
  });

  it("TTO source sets licensingReadiness=available regardless of text length", () => {
    const result = applyRulesToAsset(asset({ sourceType: "tech_transfer", summary: "short" }));
    expect(result.fields.licensingReadiness).toBe("available");
    expect(result.provenance.licensingReadiness).toBe("rule:tto_source");
  });

  it("TTO source rule does not overwrite an existing value", () => {
    const result = applyRulesToAsset(asset({
      sourceType: "tech_transfer",
      licensingReadiness: "exclusively licensed",
    }));
    expect(result.fields.licensingReadiness).toBeUndefined();
  });
});

// ── modality rules ────────────────────────────────────────────────────────────

describe("modality rules", () => {
  const s = (text: string) => asset({ summary: text + "X".repeat(Math.max(0, 200 - text.length)) });

  it("detects gene editing via CRISPR-Cas", () => {
    expect(applyRulesToAsset(s("A CRISPR-Cas9-based gene editing approach.")).fields.modality).toBe("gene editing");
  });

  it("detects cell therapy via CAR-T", () => {
    expect(applyRulesToAsset(s("CAR-T cell therapy targeting CD19.")).fields.modality).toBe("cell therapy");
  });

  it("detects gene therapy via AAV", () => {
    expect(applyRulesToAsset(s("AAV-mediated gene delivery to the liver.")).fields.modality).toBe("gene therapy");
  });

  it("detects rna therapy via siRNA", () => {
    expect(applyRulesToAsset(s("siRNA targeting KRAS mRNA for silencing.")).fields.modality).toBe("rna therapy");
  });

  it("detects antibody via monoclonal antibody", () => {
    expect(applyRulesToAsset(s("A monoclonal antibody blocking PD-L1.")).fields.modality).toBe("antibody");
  });

  it("detects small molecule via kinase inhibitor", () => {
    expect(applyRulesToAsset(s("Kinase inhibitor targeting EGFR for NSCLC.")).fields.modality).toBe("small molecule");
  });

  it("normalizes bare 'device' to 'medical device'", () => {
    // 'device' from LLM output should map to canonical 'medical device'
    const result = applyRulesToAsset(asset({ modality: "device", summary: "X".repeat(200) }));
    expect(result.fields.modality).toBe("medical device");
  });

  it("fills modality from categories even when text is sparse", () => {
    const result = applyRulesToAsset(asset({
      summary: "short",
      categories: ["gene therapy", "oncology"],
    }));
    expect(result.fields.modality).toBe("gene therapy");
  });

  it("does not overwrite existing modality", () => {
    const result = applyRulesToAsset(asset({
      modality: "antibody",
      summary: "siRNA kinase inhibitor gene therapy." + "X".repeat(200),
    }));
    expect(result.fields.modality).toBeUndefined();
  });
});

// ── target rules ──────────────────────────────────────────────────────────────

describe("target rules", () => {
  const s = (text: string) => asset({ summary: text + "X".repeat(Math.max(0, 200 - text.length)) });

  it("detects EGFR", () => {
    expect(applyRulesToAsset(s("EGFR inhibitor for non-small cell lung cancer.")).fields.target).toBe("EGFR");
  });

  it("detects PD-L1", () => {
    expect(applyRulesToAsset(s("PD-L1 checkpoint blockade immunotherapy.")).fields.target).toBe("PD-L1");
  });

  it("detects KRAS", () => {
    expect(applyRulesToAsset(s("KRAS G12C mutation targeted therapy.")).fields.target).toBe("KRAS");
  });

  it("detects BCR-ABL", () => {
    expect(applyRulesToAsset(s("BCR-ABL kinase inhibitor for CML.")).fields.target).toBe("BCR-ABL");
  });

  it("does not assign target to diagnostic modality assets", () => {
    const result = applyRulesToAsset(asset({
      modality: "diagnostic",
      summary: "EGFR diagnostic assay for biomarker detection." + "X".repeat(150),
    }));
    expect(result.fields.target).toBeUndefined();
  });
});

// ── biology cascade (critical: must use mechanism terms, never clinical specialty) ──

describe("biology fill cascade", () => {
  it("priority 1: fills biology from indication (disease-specific)", () => {
    const result = applyRulesToAsset(asset({
      indication: "alzheimer's disease",
      summary: "X".repeat(200),
    }));
    expect(result.fields.biology).toBe("protein aggregation");
    expect(result.provenance.biology).toBe("rule:indication");
  });

  it("maps breast cancer to oncogenic transcription (not a clinical specialty name)", () => {
    const result = applyRulesToAsset(asset({
      indication: "breast cancer",
      summary: "X".repeat(200),
    }));
    expect(result.fields.biology).toBe("oncogenic transcription");
  });

  it("maps multiple sclerosis to myelin disruption", () => {
    const result = applyRulesToAsset(asset({
      indication: "multiple sclerosis",
      summary: "X".repeat(200),
    }));
    expect(result.fields.biology).toBe("myelin disruption");
  });

  it("priority 2: falls back to target biology when indication is absent", () => {
    const result = applyRulesToAsset(asset({
      indication: null,
      target: "BRCA1",
      summary: "X".repeat(200),
    }));
    expect(result.fields.biology).toBe("dna damage response deficiency");
    expect(result.provenance.biology).toBe("rule:target");
  });

  it("priority 3: falls back to modality biology when indication and target are absent", () => {
    const result = applyRulesToAsset(asset({
      indication: null,
      target: null,
      modality: "gene therapy",
      summary: "X".repeat(200),
    }));
    expect(result.fields.biology).toBe("gene expression deficiency");
    expect(result.provenance.biology).toBe("rule:modality");
  });

  it("does not overwrite an existing biology value", () => {
    const result = applyRulesToAsset(asset({
      indication: "alzheimer's disease",
      biology: "existing value",
      summary: "X".repeat(200),
    }));
    expect(result.fields.biology).toBeUndefined();
  });

  it("does not overwrite when humanVerified.biology is true", () => {
    const result = applyRulesToAsset(asset({
      indication: "alzheimer's disease",
      biology: null,
      humanVerified: { biology: true },
      summary: "X".repeat(200),
    }));
    expect(result.fields.biology).toBeUndefined();
  });
});

// ── target → indication reverse lookup ───────────────────────────────────────

describe("target → indication reverse lookup", () => {
  it("fills indication from BTK target", () => {
    const result = applyRulesToAsset(asset({
      target: "BTK",
      summary: "X".repeat(200),
    }));
    expect(result.fields.indication).toBe("chronic lymphocytic leukemia");
    expect(result.provenance.indication).toBe("rule:target");
  });

  it("fills indication from PCSK9 target", () => {
    expect(applyRulesToAsset(asset({ target: "PCSK9", summary: "X".repeat(200) })).fields.indication).toBe("atherosclerosis");
  });

  it("does not overwrite existing indication", () => {
    const result = applyRulesToAsset(asset({
      target: "BTK",
      indication: "lymphoma",
      summary: "X".repeat(200),
    }));
    expect(result.fields.indication).toBeUndefined();
  });
});

// ── comparable drugs ──────────────────────────────────────────────────────────

describe("comparable drugs lookup", () => {
  it("fills comparableDrugs from indication", () => {
    const result = applyRulesToAsset(asset({
      indication: "glioblastoma",
      summary: "X".repeat(200),
    }));
    expect(result.fields.comparableDrugs).toContain("temozolomide");
  });

  it("fills comparableDrugs from target when indication is absent", () => {
    const result = applyRulesToAsset(asset({
      target: "EGFR",
      summary: "X".repeat(200),
    }));
    expect(result.fields.comparableDrugs).toContain("osimertinib");
  });

  it("does not overwrite existing comparableDrugs", () => {
    const result = applyRulesToAsset(asset({
      indication: "glioblastoma",
      comparableDrugs: "already filled",
      summary: "X".repeat(200),
    }));
    expect(result.fields.comparableDrugs).toBeUndefined();
  });
});

// ── early stage TTO default ───────────────────────────────────────────────────

describe("early stage TTO default", () => {
  it("sets 'early stage' for TTO asset with thin text and unknown stage", () => {
    const result = applyRulesToAsset(asset({
      sourceType: "tech_transfer",
      summary: "short",
    }));
    expect(result.fields.developmentStage).toBe("early stage");
    expect(result.provenance.developmentStage).toBe("rule:tto_early_stage");
  });

  it("does not set early stage when clinical keywords are present", () => {
    const result = applyRulesToAsset(asset({
      sourceType: "tech_transfer",
      summary: "Phase 1 clinical trial in progress",
    }));
    expect(result.fields.developmentStage).toBeUndefined();
  });

  it("does not set early stage for non-TTO asset", () => {
    const result = applyRulesToAsset(asset({
      sourceType: "patent",
      summary: "short",
    }));
    expect(result.fields.developmentStage).toBeUndefined();
  });

  it("sets early stage for TTO asset with >=2 deep enrich attempts (stage still unknown)", () => {
    const result = applyRulesToAsset(asset({
      sourceType: "tech_transfer",
      deepEnrichAttempts: 2,
      summary: "X".repeat(200),
    }));
    expect(result.fields.developmentStage).toBe("early stage");
  });
});

// ── category-based fills ──────────────────────────────────────────────────────

describe("category-based fills", () => {
  it("fills modality from categories even for sparse text", () => {
    const result = applyRulesToAsset(asset({
      summary: "short",
      categories: ["CAR-T", "immunotherapy"],
    }));
    expect(result.fields.modality).toBe("cell therapy");
  });

  it("fills indication from categories even for sparse text", () => {
    const result = applyRulesToAsset(asset({
      summary: "short",
      categories: ["oncology", "lung cancer"],
    }));
    expect(result.fields.indication).toBe("cancer");
  });

  it("text rule can override category-based modality fill (more specific)", () => {
    const result = applyRulesToAsset(asset({
      summary: "CRISPR-Cas9 gene editing approach for oncology." + "X".repeat(150),
      categories: ["gene therapy"],
    }));
    // category → gene therapy, but text rule → gene editing (more specific, runs after)
    expect(result.fields.modality).toBe("gene editing");
  });
});

// ── provenance tracking ───────────────────────────────────────────────────────

describe("provenance tracking", () => {
  it("records provenance for TTO licensing rule", () => {
    const { provenance } = applyRulesToAsset(asset({
      sourceType: "tech_transfer",
      summary: "short",
    }));
    expect(provenance.licensingReadiness).toBe("rule:tto_source");
  });

  it("records provenance for biology fill", () => {
    const { provenance } = applyRulesToAsset(asset({
      indication: "parkinson's disease",
      summary: "X".repeat(200),
    }));
    expect(provenance.biology).toBe("rule:indication");
  });

  it("returns empty provenance when nothing is filled", () => {
    // All fillable fields already populated — nothing for the function to write.
    // targetClass and unmetNeedSeverity must also be set or they get filled from target/indication.
    const result = applyRulesToAsset(asset({
      developmentStage: "phase 2",
      ipType: "patented",
      licensingReadiness: "available",
      indication: "lung cancer",
      modality: "antibody",
      target: "EGFR",
      biology: "oncogenic transcription",
      comparableDrugs: "osimertinib",
      unmetNeed: "existing unmet need",
      targetClass: "receptor tyrosine kinase",
      unmetNeedSeverity: 2,
    }));
    expect(Object.keys(result.provenance).length).toBe(0);
  });
});
