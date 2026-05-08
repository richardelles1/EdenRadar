# Development Stage Fill Audit — 2026-05-08

## Run summary

| Metric | Value |
|---|---|
| Script | `scripts/fill-dev-stage.ts` |
| Run date | 2026-05-08 |
| Scope | Relevant assets with `asset_class` NOT IN (medical_device, research_tool, software) |

## Before / After

| Metric | Before | After | Δ |
|---|---|---|---|
| Total relevant assets | 33,106 | 33,106 | — |
| Assets with `development_stage` | 21,087 | 23,802 | **+2,715** |
| Fill rate | 63.7% | **71.9%** | **+8.2 pp** |
| Missing stage | 12,019 | 9,304 | −2,715 |
| Avg `completeness_score` | 58.19 | **59.83** | +1.64 |

## Score tier distribution (before → after)

| Tier | Before | After | Δ |
|---|---|---|---|
| Excellent (≥80) | 11,228 | 11,720 | +492 |
| Good (60–79) | 6,979 | 6,838 | −141 |
| Partial (40–59) | 5,552 | 6,087 | +535 |
| Poor (1–39) | 8,773 | 8,034 | −739 |
| Unscored (0/NULL) | 574 | 427 | −147 |

## Phase breakdown

### Phase 1 — SQL regex (zero LLM cost)
- Scanned: 2,819 assets (≥50 chars of summary+abstract)
- Skipped (< 50 chars): 1,170
- **Filled: 24** (stage + completeness_score written atomically)
- Top hits: commercial (23), preclinical (1)
- Cost: $0.00

### Phase 2a — LLM strict mode (`gpt-4o-mini`, summary+abstract ≥120 chars)
- Eligible: 1,539
- **Filled: 174**
- LLM "unknown": 1,365
- Estimated cost: ~$0.17

### Phase 2b — LLM strict mode (`--min-text=50`, summary+abstract ≥50 chars)
- Eligible: 2,621 (added 50–119 char assets)
- **Filled: 17**
- LLM "unknown": 2,604
- Estimated cost: ~$0.28

### Phase 2c — LLM strict mode + all fields (`--all-fields --min-text=50`)
- Eligible: 3,352 (summary+abstract+innovation_claim+moa+unmet_need ≥50 chars)
- **Filled: 139**
- LLM "unknown": 3,213
- Estimated cost: ~$0.36

### Phase 2d — LLM permissive mode + all fields (`--permissive --all-fields --min-text=50`)
- Eligible: 3,213
- **Filled: 2,361**
- LLM "unknown": 852
- Estimated cost: ~$0.35
- Note: permissive prompt allows contextual inference (e.g. "animal models" → preclinical, "in vitro only" → discovery)

## Total

- **Total fills: 2,715**
- **Fill rate: 63.7% → 71.9% (+8.2 pp)** ✓ Exceeds ≥65% target
- **Total estimated LLM cost: ~$1.16**
- **Avg completeness_score: 58.19 → 59.83 (+1.64 points)**

## Script enhancements added during this run

Three new CLI flags added to `scripts/fill-dev-stage.ts`:

| Flag | Default | Effect |
|---|---|---|
| `--min-text=N` | 120 | Minimum combined text length for LLM eligibility |
| `--all-fields` | false | Include `innovation_claim + mechanism_of_action + unmet_need` in text |
| `--permissive` | false | Allow LLM to infer stage from indirect signals (animal models, in vitro, etc.) |

## Notes

- The task description referenced a starting fill rate of ~48% with 10,516 missing assets; actual start was 63.7% / 12,019 missing — prior fills had already run.
- The permissive pass drove the majority of new fills (+2,361). These are inferred stages, not explicit textual mentions — appropriate for completeness scoring and ranking but should be interpreted with that caveat.
- `enrichment_sources` JSONB column updated per asset: `{"development_stage":"regex"}` or `{"development_stage":"llm"}` for provenance.
- Remaining 9,304 assets without stage largely have no classifiable text even under permissive inference.
