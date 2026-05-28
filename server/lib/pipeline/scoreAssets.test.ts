import { describe, it, expect, vi } from "vitest";

vi.mock("../llm", () => ({
  generateWhyItMatters: vi.fn(),
  isFatalOpenAIError: vi.fn(),
}));

import {
  clamp,
  scoreFreshness,
  scoreNovelty,
  scoreReadiness,
  scoreLicensability,
  scoreFit,
  computeFitBonus,
  scoreCompetition,
  scoreCompleteness,
  scoreAvailability,
  scoreSearchRelevance,
  computeTotal,
  applyTopKConfidenceGate,
  TTO_WEIGHTS,
  CONFIDENCE_FLOOR,
  CONFIDENCE_AWARE_RANKING_ENABLED,
  type DimensionResult,
} from "./scoreAssets";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

// ── clamp ──────────────────────────────────────────────────────────────────────

describe("clamp", () => {
  it("clamps negative values to 0", () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(-100)).toBe(0);
  });

  it("clamps values above 100 to 100", () => {
    expect(clamp(101)).toBe(100);
    expect(clamp(200)).toBe(100);
  });

  it("passes through values within range", () => {
    expect(clamp(0)).toBe(0);
    expect(clamp(50)).toBe(50);
    expect(clamp(100)).toBe(100);
  });

  it("rounds to nearest integer", () => {
    expect(clamp(50.4)).toBe(50);
    expect(clamp(50.5)).toBe(51);
    expect(clamp(99.9)).toBe(100);
  });
});

// ── scoreFreshness ─────────────────────────────────────────────────────────────

describe("scoreFreshness", () => {
  it("returns hasData:false score 50 when no date", () => {
    const r = scoreFreshness({});
    expect(r.hasData).toBe(false);
    expect(r.score).toBe(50);
  });

  it("scores 100 within 30 days", () => {
    expect(scoreFreshness({ latest_signal_date: daysAgo(0) }).score).toBe(100);
    expect(scoreFreshness({ latest_signal_date: daysAgo(30) }).score).toBe(100);
  });

  it("scores 90 between 31 and 90 days", () => {
    expect(scoreFreshness({ latest_signal_date: daysAgo(31) }).score).toBe(90);
    expect(scoreFreshness({ latest_signal_date: daysAgo(90) }).score).toBe(90);
  });

  it("scores 75 between 91 and 180 days", () => {
    expect(scoreFreshness({ latest_signal_date: daysAgo(91) }).score).toBe(75);
    expect(scoreFreshness({ latest_signal_date: daysAgo(180) }).score).toBe(75);
  });

  it("scores 55 between 181 and 365 days", () => {
    expect(scoreFreshness({ latest_signal_date: daysAgo(200) }).score).toBe(55);
    expect(scoreFreshness({ latest_signal_date: daysAgo(365) }).score).toBe(55);
  });

  it("scores 35 between 366 and 730 days", () => {
    expect(scoreFreshness({ latest_signal_date: daysAgo(366) }).score).toBe(35);
    expect(scoreFreshness({ latest_signal_date: daysAgo(730) }).score).toBe(35);
  });

  it("scores 15 beyond 730 days", () => {
    // Stay below daysSince's 999-day fallback threshold
    expect(scoreFreshness({ latest_signal_date: daysAgo(731) }).score).toBe(15);
    expect(scoreFreshness({ latest_signal_date: daysAgo(900) }).score).toBe(15);
  });

  it("returns hasData:true for valid dates", () => {
    expect(scoreFreshness({ latest_signal_date: daysAgo(10) }).hasData).toBe(true);
  });
});

// ── scoreNovelty ───────────────────────────────────────────────────────────────

describe("scoreNovelty", () => {
  it("returns hasData:false score 50 when no source types or owner", () => {
    const r = scoreNovelty({});
    expect(r.hasData).toBe(false);
    expect(r.score).toBe(50);
  });

  it("adds 20 for preprint source type", () => {
    expect(scoreNovelty({ source_types: ["preprint"] }).score).toBe(70);
  });

  it("adds 15 for tech_transfer source type", () => {
    expect(scoreNovelty({ source_types: ["tech_transfer"] }).score).toBe(65);
  });

  it("adds 10 for patent source type", () => {
    expect(scoreNovelty({ source_types: ["patent"] }).score).toBe(60);
  });

  it("adds 15 for university owner", () => {
    expect(scoreNovelty({ source_types: ["tech_transfer"], owner_type: "university" }).score).toBe(80);
  });

  it("adds 10 for evidence_count 1", () => {
    expect(scoreNovelty({ source_types: ["tech_transfer"], evidence_count: 1 }).score).toBe(75);
  });

  it("adds 10 for evidence_count 2", () => {
    expect(scoreNovelty({ source_types: ["tech_transfer"], evidence_count: 2 }).score).toBe(75);
  });

  it("does not adjust for evidence_count 3 or 4", () => {
    expect(scoreNovelty({ source_types: ["tech_transfer"], evidence_count: 3 }).score).toBe(65);
    expect(scoreNovelty({ source_types: ["tech_transfer"], evidence_count: 4 }).score).toBe(65);
  });

  it("subtracts 10 for evidence_count >= 5 (well-studied)", () => {
    expect(scoreNovelty({ source_types: ["tech_transfer"], evidence_count: 5 }).score).toBe(55);
  });

  it("clamps score at 100", () => {
    // preprint(+20) + tech_transfer(+15) + university(+15) + evidence 1(+10) = 50+60 = 110 → 100
    const r = scoreNovelty({
      source_types: ["preprint", "tech_transfer"],
      owner_type: "university",
      evidence_count: 1,
    });
    expect(r.score).toBe(100);
  });

  it("returns hasData:true when owner_type is known (even with no source types)", () => {
    expect(scoreNovelty({ owner_type: "university" }).hasData).toBe(true);
  });

  it("capitalises signal labels in basis", () => {
    expect(scoreNovelty({ source_types: ["preprint"] }).basis).toContain("Preprint");
  });
});

// ── scoreReadiness ─────────────────────────────────────────────────────────────

describe("scoreReadiness", () => {
  it("returns hasData:false score 50 when stage is missing", () => {
    expect(scoreReadiness({}).hasData).toBe(false);
    expect(scoreReadiness({}).score).toBe(50);
  });

  it("returns hasData:false score 50 when stage is 'unknown'", () => {
    expect(scoreReadiness({ development_stage: "unknown" }).hasData).toBe(false);
  });

  it("scores 90 for Phase 3", () => {
    expect(scoreReadiness({ development_stage: "Phase 3" }).score).toBe(90);
  });

  it("scores 80 for Phase 2", () => {
    expect(scoreReadiness({ development_stage: "Phase 2 clinical trial" }).score).toBe(80);
  });

  it("scores 65 for Phase 1", () => {
    expect(scoreReadiness({ development_stage: "Phase 1" }).score).toBe(65);
  });

  it("scores 50 for preclinical", () => {
    expect(scoreReadiness({ development_stage: "preclinical" }).score).toBe(50);
  });

  it("scores 30 for discovery", () => {
    expect(scoreReadiness({ development_stage: "discovery" }).score).toBe(30);
  });

  it("scores 30 for 'early stage'", () => {
    expect(scoreReadiness({ development_stage: "early stage" }).score).toBe(30);
  });

  it("scores 60 for approved", () => {
    expect(scoreReadiness({ development_stage: "approved" }).score).toBe(60);
  });

  it("adds 10 for patent source type", () => {
    expect(scoreReadiness({ development_stage: "Phase 1", source_types: ["patent"] }).score).toBe(75);
  });

  it("adds 10 for patent_status 'patented'", () => {
    expect(scoreReadiness({ development_stage: "Phase 1", patent_status: "patented" }).score).toBe(75);
  });

  it("adds 10 for patent_status 'patent pending'", () => {
    expect(scoreReadiness({ development_stage: "Phase 1", patent_status: "patent pending" }).score).toBe(75);
  });

  it("adds 8 for clinical_trial source type", () => {
    expect(scoreReadiness({ development_stage: "Phase 1", source_types: ["clinical_trial"] }).score).toBe(73);
  });

  it("clamps at 100 when bonuses overflow", () => {
    // Phase 3 (90) + patent (+10) + clinical_trial (+8) = 108 → 100
    const r = scoreReadiness({
      development_stage: "Phase 3",
      source_types: ["patent", "clinical_trial"],
    });
    expect(r.score).toBe(100);
  });

  it("includes stage label and extras in basis", () => {
    const r = scoreReadiness({ development_stage: "Phase 2", source_types: ["patent"] });
    expect(r.basis).toContain("Phase 2");
    expect(r.basis).toContain("patent protection");
  });
});

// ── scoreLicensability ─────────────────────────────────────────────────────────

describe("scoreLicensability", () => {
  it("returns hasData:false score 50 when no owner, TTO, or licensing data", () => {
    const r = scoreLicensability({});
    expect(r.hasData).toBe(false);
    expect(r.score).toBe(50);
  });

  it("scores 70 for university owner (30 base + 35 university + 5 non-company)", () => {
    expect(scoreLicensability({ owner_type: "university" }).score).toBe(70);
  });

  it("scores 55 for tech_transfer source only (30 + 25, no owner bonus)", () => {
    // No owner_type → non-company +5 doesn't apply
    expect(scoreLicensability({ source_types: ["tech_transfer"] }).score).toBe(55);
  });

  it("adds 20 for 'available' licensing status", () => {
    // university: 30+35+5=70, available: +20 → 90
    const r = scoreLicensability({ owner_type: "university", licensing_status: "license available" });
    expect(r.score).toBe(90);
  });

  it("subtracts 10 for 'licensed' licensing status", () => {
    // university: 70, licensed: -10 → 60
    const r = scoreLicensability({ owner_type: "university", licensing_status: "exclusively licensed" });
    expect(r.score).toBe(60);
  });

  it("returns hasData:true when licensing_status is non-empty and non-unknown", () => {
    expect(scoreLicensability({ licensing_status: "available for licensing" }).hasData).toBe(true);
  });

  it("returns hasData:false when licensing_status is 'unknown'", () => {
    expect(scoreLicensability({ licensing_status: "unknown" }).hasData).toBe(false);
  });

  it("clamps score at 100", () => {
    // university(70) + TTO(+25) + available(+20) = 115 → 100
    const r = scoreLicensability({
      owner_type: "university",
      source_types: ["tech_transfer"],
      licensing_status: "available for licensing",
    });
    expect(r.score).toBe(100);
  });
});

// ── scoreFit (legacy 6-dim) ────────────────────────────────────────────────────

describe("scoreFit", () => {
  const emptyProfile = {
    therapeutic_areas: [] as string[],
    modalities: [] as string[],
    preferred_stages: [] as string[],
    indication_keywords: [] as string[],
    target_keywords: [] as string[],
    excluded_stages: [] as string[],
  };

  it("returns hasData:false score 50 with no buyer profile", () => {
    const r = scoreFit({});
    expect(r.hasData).toBe(false);
    expect(r.score).toBe(50);
  });

  it("returns hasData:false score 50 with empty profile (no criteria)", () => {
    const r = scoreFit({}, emptyProfile);
    expect(r.hasData).toBe(false);
    expect(r.score).toBe(50);
  });

  it("awards 40 pts for therapeutic area match → clamp(25+40)=65", () => {
    const r = scoreFit({ indication: "oncology trials" }, { ...emptyProfile, therapeutic_areas: ["oncology"] });
    expect(r.score).toBe(65);
    expect(r.basis).toContain("therapeutic area");
  });

  it("scores 25 when therapeutic area does not match → clamp(25+0)=25", () => {
    const r = scoreFit({ indication: "oncology" }, { ...emptyProfile, therapeutic_areas: ["cardiology"] });
    expect(r.score).toBe(25);
  });

  it("awards 30 pts for modality match → clamp(25+30)=55", () => {
    const r = scoreFit({ modality: "monoclonal antibody" }, { ...emptyProfile, modalities: ["antibody"] });
    expect(r.score).toBe(55);
  });

  it("awards 20 pts for preferred stage match → clamp(25+20)=45", () => {
    const r = scoreFit(
      { development_stage: "Phase 2 clinical trial" },
      { ...emptyProfile, preferred_stages: ["Phase 2"] },
    );
    expect(r.score).toBe(45);
  });

  it("deducts 50 for excluded stage (net: clamp(25 + 40 - 50) = 15)", () => {
    const profile = { ...emptyProfile, therapeutic_areas: ["oncology"], excluded_stages: ["Phase 3"] };
    const r = scoreFit({ indication: "oncology", development_stage: "Phase 3" }, profile);
    expect(r.score).toBe(15);
  });

  it("proportional keyword score: 1 of 2 keywords matched → clamp(25+15)=40", () => {
    const profile = { ...emptyProfile, indication_keywords: ["EGFR", "lung"] };
    const r = scoreFit({ indication: "EGFR mutation" }, profile);
    // hits=1/2 → (1/2)*30=15; total = clamp(25+15) = 40
    expect(r.score).toBe(40);
  });
});

// ── computeFitBonus ────────────────────────────────────────────────────────────

describe("computeFitBonus", () => {
  const emptyProfile = {
    therapeutic_areas: [] as string[],
    modalities: [] as string[],
    preferred_stages: [] as string[],
    indication_keywords: [] as string[],
    target_keywords: [] as string[],
    excluded_stages: [] as string[],
  };

  it("returns 0 with no buyer profile", () => {
    expect(computeFitBonus({}, undefined)).toBe(0);
  });

  it("returns 0 with empty profile (no criteria)", () => {
    expect(computeFitBonus({}, emptyProfile)).toBe(0);
  });

  it("returns 0 for excluded stage even when criteria match", () => {
    const profile = { ...emptyProfile, therapeutic_areas: ["oncology"], excluded_stages: ["Phase 3"] };
    expect(computeFitBonus({ development_stage: "Phase 3", indication: "oncology" }, profile)).toBe(0);
  });

  it("returns 0 when no criteria match", () => {
    const profile = { ...emptyProfile, therapeutic_areas: ["cardiology"] };
    expect(computeFitBonus({ indication: "oncology" }, profile)).toBe(0);
  });

  it("returns 8 for weak partial match (1 of 4 criteria hit)", () => {
    const profile = {
      ...emptyProfile,
      therapeutic_areas: ["oncology"],
      modalities: ["antibody"],
      preferred_stages: ["Phase 2"],
      indication_keywords: ["EGFR"],
    };
    // Only oncology hits → 1/4 = 0.25 > 0 → 8
    expect(computeFitBonus({ indication: "oncology" }, profile)).toBe(8);
  });

  it("returns 15 for good match (2 of 4 criteria hit)", () => {
    const profile = {
      ...emptyProfile,
      therapeutic_areas: ["oncology"],
      modalities: ["antibody"],
      preferred_stages: ["Phase 2"],
      indication_keywords: ["EGFR"],
    };
    // oncology + antibody → 2/4 = 0.5 → 15
    expect(computeFitBonus({ indication: "oncology", modality: "monoclonal antibody" }, profile)).toBe(15);
  });

  it("returns 20 for strong match (3 of 4 criteria hit)", () => {
    const profile = {
      ...emptyProfile,
      therapeutic_areas: ["oncology"],
      modalities: ["antibody"],
      preferred_stages: ["Phase 2"],
      indication_keywords: ["EGFR"],
    };
    // oncology + antibody + EGFR → 3/4 = 0.75 → 20
    expect(computeFitBonus({ indication: "oncology EGFR", modality: "antibody" }, profile)).toBe(20);
  });

  it("returns 20 for all criteria hit (1/1)", () => {
    const profile = { ...emptyProfile, therapeutic_areas: ["oncology"] };
    expect(computeFitBonus({ indication: "oncology" }, profile)).toBe(20);
  });

  it("matches via summary text (full-text search)", () => {
    const profile = { ...emptyProfile, therapeutic_areas: ["oncology"] };
    expect(computeFitBonus({ summary: "novel oncology drug candidate" }, profile)).toBe(20);
  });

  it("matches via biology field", () => {
    const profile = { ...emptyProfile, therapeutic_areas: ["immunotherapy"] };
    expect(computeFitBonus({ biology: "immunotherapy checkpoint pathway" }, profile)).toBe(20);
  });

  it("matches via matching_tags", () => {
    const profile = { ...emptyProfile, therapeutic_areas: ["oncology"] };
    expect(computeFitBonus({ matching_tags: ["oncology", "EGFR"] }, profile)).toBe(20);
  });

  it("is case-insensitive", () => {
    const profile = { ...emptyProfile, therapeutic_areas: ["Oncology"] };
    expect(computeFitBonus({ indication: "ONCOLOGY" }, profile)).toBe(20);
  });
});

// ── scoreCompetition ───────────────────────────────────────────────────────────

describe("scoreCompetition", () => {
  it("returns hasData:false score 50 when no owner or stage known", () => {
    const r = scoreCompetition({});
    expect(r.hasData).toBe(false);
    expect(r.score).toBe(50);
  });

  it("starts at 80 with a known owner (no deductions)", () => {
    expect(scoreCompetition({ owner_name: "SomeSmallBiotech" }).score).toBe(80);
  });

  it("deducts 25 for a large pharma owner", () => {
    const r = scoreCompetition({ owner_name: "Pfizer" });
    expect(r.score).toBe(55); // 80 - 25
    expect(r.basis).toContain("Large pharma");
  });

  it("recognises large pharma case-insensitively", () => {
    expect(scoreCompetition({ owner_name: "pfizer" }).score).toBe(55);
    expect(scoreCompetition({ owner_name: "NOVARTIS" }).score).toBe(55);
  });

  it("deducts 15 for company-sponsored clinical trial", () => {
    const r = scoreCompetition({
      owner_name: "SmallBio",
      source_types: ["clinical_trial"],
      owner_type: "company",
    });
    expect(r.score).toBe(65); // 80 - 15
  });

  it("deducts 10 for Phase 3 stage", () => {
    expect(scoreCompetition({ owner_name: "SmallBio", development_stage: "Phase 3" }).score).toBe(70);
  });

  it("deducts 20 for approved stage", () => {
    expect(scoreCompetition({ owner_name: "SmallBio", development_stage: "approved" }).score).toBe(60);
  });

  it("deducts 10 for evidence_count >= 5", () => {
    expect(scoreCompetition({ owner_name: "SmallBio", evidence_count: 5 }).score).toBe(70);
    expect(scoreCompetition({ owner_name: "SmallBio", evidence_count: 10 }).score).toBe(70);
  });

  it("does not deduct for evidence_count < 5", () => {
    expect(scoreCompetition({ owner_name: "SmallBio", evidence_count: 4 }).score).toBe(80);
  });

  it("uses university basis string when owner is university with no negative signals", () => {
    const r = scoreCompetition({ owner_name: "MIT", owner_type: "university" });
    expect(r.basis).toContain("University");
    expect(r.score).toBe(80);
  });

  it("clamps deductions at 0", () => {
    const r = scoreCompetition({
      owner_name: "pfizer",
      owner_type: "company",
      source_types: ["clinical_trial"],
      development_stage: "phase 3 approved",
      evidence_count: 7,
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});

// ── scoreCompleteness ──────────────────────────────────────────────────────────

describe("scoreCompleteness", () => {
  it("returns hasData:false score 55 when completeness_score is null", () => {
    const r = scoreCompleteness({});
    expect(r.hasData).toBe(false);
    expect(r.score).toBe(55);
  });

  it("returns hasData:false for NaN completeness_score", () => {
    expect(scoreCompleteness({ completeness_score: NaN }).hasData).toBe(false);
  });

  it("maps >= 80 → 'complete' label", () => {
    const r = scoreCompleteness({ completeness_score: 85 });
    expect(r.score).toBe(85);
    expect(r.basis).toContain("complete");
    expect(r.hasData).toBe(true);
  });

  it("boundary: 80 → complete, 79 → good", () => {
    expect(scoreCompleteness({ completeness_score: 80 }).basis).toContain("complete");
    expect(scoreCompleteness({ completeness_score: 79 }).basis).toContain("good");
  });

  it("maps 60-79 → 'good' label", () => {
    expect(scoreCompleteness({ completeness_score: 65 }).basis).toContain("good");
  });

  it("boundary: 60 → good, 59 → partial", () => {
    expect(scoreCompleteness({ completeness_score: 60 }).basis).toContain("good");
    expect(scoreCompleteness({ completeness_score: 59 }).basis).toContain("partial");
  });

  it("maps 40-59 → 'partial' label", () => {
    expect(scoreCompleteness({ completeness_score: 45 }).basis).toContain("partial");
  });

  it("boundary: 40 → partial, 39 → thin", () => {
    expect(scoreCompleteness({ completeness_score: 40 }).basis).toContain("partial");
    expect(scoreCompleteness({ completeness_score: 39 }).basis).toContain("thin");
  });

  it("maps < 40 → 'thin record' label", () => {
    expect(scoreCompleteness({ completeness_score: 20 }).basis).toContain("thin");
  });

  it("clamps raw value to 0-100 range", () => {
    expect(scoreCompleteness({ completeness_score: 150 }).score).toBe(100);
    expect(scoreCompleteness({ completeness_score: -10 }).score).toBe(0);
  });
});

// ── scoreAvailability ──────────────────────────────────────────────────────────

describe("scoreAvailability", () => {
  it("scores 35 hasData:true when no date is present (absent = stale, not exempt)", () => {
    const r = scoreAvailability({});
    expect(r.score).toBe(35);
    expect(r.hasData).toBe(true);
  });

  it("scores 90 within 30 days", () => {
    expect(scoreAvailability({ last_seen_at: daysAgo(0) }).score).toBe(90);
    expect(scoreAvailability({ last_seen_at: daysAgo(30) }).score).toBe(90);
  });

  it("scores 80 between 31 and 90 days", () => {
    expect(scoreAvailability({ last_seen_at: daysAgo(31) }).score).toBe(80);
    expect(scoreAvailability({ last_seen_at: daysAgo(90) }).score).toBe(80);
  });

  it("scores 65 between 91 and 180 days", () => {
    expect(scoreAvailability({ last_seen_at: daysAgo(120) }).score).toBe(65);
  });

  it("scores 45 between 181 and 365 days", () => {
    expect(scoreAvailability({ last_seen_at: daysAgo(200) }).score).toBe(45);
  });

  it("scores 35 beyond 365 days", () => {
    expect(scoreAvailability({ last_seen_at: daysAgo(400) }).score).toBe(35);
  });

  it("prefers last_seen_at over latest_signal_date", () => {
    // recent last_seen_at (→90) should win over stale latest_signal_date (→35)
    const r = scoreAvailability({ last_seen_at: daysAgo(10), latest_signal_date: daysAgo(400) });
    expect(r.score).toBe(90);
  });

  it("falls back to latest_signal_date when last_seen_at is absent", () => {
    expect(scoreAvailability({ latest_signal_date: daysAgo(10) }).score).toBe(90);
  });
});

// ── scoreSearchRelevance ───────────────────────────────────────────────────────

describe("scoreSearchRelevance", () => {
  it("returns hasData:false score 50 when normalizedScore is undefined", () => {
    const r = scoreSearchRelevance(undefined);
    expect(r.hasData).toBe(false);
    expect(r.score).toBe(50);
  });

  it("returns hasData:false score 50 when normalizedScore is null", () => {
    const r = scoreSearchRelevance(null as unknown as number);
    expect(r.hasData).toBe(false);
    expect(r.score).toBe(50);
  });

  it("passes through a valid score with hasData:true", () => {
    expect(scoreSearchRelevance(95).score).toBe(95);
    expect(scoreSearchRelevance(95).hasData).toBe(true);
    expect(scoreSearchRelevance(40).score).toBe(40);
  });

  it("uses basisOverride when provided", () => {
    const r = scoreSearchRelevance(85, "asset name match");
    expect(r.basis).toBe("asset name match");
  });

  it("uses tier-band labels when no override is given", () => {
    expect(scoreSearchRelevance(95).basis).toContain("asset name");
    expect(scoreSearchRelevance(82).basis).toContain("indication or target");
    expect(scoreSearchRelevance(72).basis).toContain("mechanism or modality");
    expect(scoreSearchRelevance(62).basis).toContain("description");
    expect(scoreSearchRelevance(52).basis).toContain("secondary fields");
    expect(scoreSearchRelevance(40).basis).toContain("Semantic");
  });

  it("clamps score to 0-100", () => {
    expect(scoreSearchRelevance(-10).score).toBe(0);
    expect(scoreSearchRelevance(110).score).toBe(100);
  });
});

// ── computeTotal ──────────────────────────────────────────────────────────────

describe("computeTotal", () => {
  function dim(score: number, hasData: boolean, basis = "test"): DimensionResult {
    return { score, hasData, basis };
  }

  it("returns total 50 and signal_coverage 0 when no hasData dimensions", () => {
    const r = computeTotal({
      freshness: dim(50, false),
      novelty: dim(50, false),
    });
    expect(r.total).toBe(50);
    expect(r.signal_coverage).toBe(0);
  });

  it("computes weighted average across all hasData dimensions (TTO weights)", () => {
    // search_relevance=100 at 80% → total 80
    const r = computeTotal(
      {
        search_relevance: dim(100, true),
        record_quality: dim(0, true),
        availability: dim(0, true),
      },
      TTO_WEIGHTS,
    );
    expect(r.total).toBe(80);
    expect(r.signal_coverage).toBe(100);
  });

  it("redistributes weight from hasData:false dimensions to remaining ones", () => {
    // search_relevance (0.80) is hasData:false → its weight redistributes
    // record_quality (0.12) + availability (0.08) = 0.20 total available
    // total = 100*(0.12/0.20) + 0*(0.08/0.20) = 60
    const r = computeTotal(
      {
        search_relevance: dim(50, false),
        record_quality: dim(100, true),
        availability: dim(0, true),
      },
      TTO_WEIGHTS,
    );
    expect(r.total).toBe(60);
    expect(r.signal_coverage).toBe(20); // (0.12+0.08)*100 = 20
  });

  it("dimension_basis includes both hasData and non-hasData dimensions", () => {
    const r = computeTotal(
      { search_relevance: dim(50, false), record_quality: dim(80, true) },
      TTO_WEIGHTS,
    );
    expect("search_relevance" in r.dimension_basis).toBe(true);
    expect("record_quality" in r.dimension_basis).toBe(true);
  });

  it("scored_dimensions only contains hasData:true dimension names", () => {
    const r = computeTotal(
      { search_relevance: dim(50, false), record_quality: dim(80, true) },
      TTO_WEIGHTS,
    );
    expect(r.scored_dimensions).not.toContain("search_relevance");
    expect(r.scored_dimensions).toContain("record_quality");
  });

  it("clamps total at 100", () => {
    const r = computeTotal({ search_relevance: dim(110, true) }, TTO_WEIGHTS);
    expect(r.total).toBe(100);
  });

  it("uses default WEIGHTS when no weights argument is given", () => {
    // All 6 default dimensions at 100 → weighted sum = 100
    const r = computeTotal({
      freshness:     dim(100, true),
      novelty:       dim(100, true),
      readiness:     dim(100, true),
      licensability: dim(100, true),
      fit:           dim(100, true),
      competition:   dim(100, true),
    });
    expect(r.total).toBe(100);
    expect(r.signal_coverage).toBe(100);
  });

  it("signal_coverage reflects proportion of weight covered by hasData dims", () => {
    // Only search_relevance (0.80) hasData → signal_coverage = 80
    const r = computeTotal(
      { search_relevance: dim(50, true), record_quality: dim(50, false), availability: dim(50, false) },
      TTO_WEIGHTS,
    );
    expect(r.signal_coverage).toBe(80);
  });
});

// ── applyTopKConfidenceGate ────────────────────────────────────────────────────

describe("applyTopKConfidenceGate", () => {
  // CONFIDENCE_AWARE_RANKING_ENABLED is false in test env (requires
  // EDEN_CONFIDENCE_AWARE_RANKING=true env var at module load time). All calls
  // therefore return the input unchanged — the pass-through is what we verify here.

  function item(score: number, factor: number) {
    return { score, score_breakdown: { confidence_factor: factor } };
  }

  it("returns input unchanged when flag is disabled (default in test env)", () => {
    const items = [item(90, 0.1), item(80, 0.9), item(70, 0.3)];
    expect(applyTopKConfidenceGate(items, 5)).toStrictEqual(items);
  });

  it("returns input unchanged when items.length <= k", () => {
    const items = [item(90, 0.1), item(80, 0.9)];
    expect(applyTopKConfidenceGate(items, 5)).toStrictEqual(items);
  });

  it("accepts an empty array without throwing", () => {
    expect(applyTopKConfidenceGate([], 5)).toStrictEqual([]);
  });

  it("k defaults to 5 (short arrays pass through unchanged)", () => {
    const items = Array.from({ length: 4 }, (_, i) => item(100 - i * 10, 0.9));
    expect(applyTopKConfidenceGate(items)).toHaveLength(4);
  });
});

// ── exported constants ─────────────────────────────────────────────────────────

describe("exported constants", () => {
  it("TTO_WEIGHTS sums to 1.0", () => {
    const sum = Object.values(TTO_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it("CONFIDENCE_FLOOR is 0.4", () => {
    expect(CONFIDENCE_FLOOR).toBe(0.4);
  });

  it("CONFIDENCE_AWARE_RANKING_ENABLED is false in test env (off by default, requires opt-in)", () => {
    expect(CONFIDENCE_AWARE_RANKING_ENABLED).toBe(false);
  });
});
