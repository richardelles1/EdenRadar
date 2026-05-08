# Enrichment Audit Report

Generated: 2026-05-08 06:07:43 UTC
**MODE: DRY RUN — drain was not triggered**

---

## 1. Queue Summary

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Assets eligible (queue) | 0 | 0 | — |
| Assets gave up (attempts ≥ 3) | 6,209 | 6,209 | — |
| All relevant assets | 33,097 | 33,097 | — |
| Avg completeness score (all relevant) | 48.85 | 48.85 | — |

**Drain job results (from server API):**

| Metric | Value |
|--------|-------|
| Job ID | N/A |
| Final status | skipped |
| Processed | 0 |
| Improved (≥1 field gained) | 0 (N/A) |
| No gain (error + no new info) | 0 |
| Token cost (reported by server) | $0.0000 |
| Wall time | 0 s |

> **"No gain"** counts assets that were processed but gained no new field values.
> This bucket is a union of LLM errors (classifyAsset threw) and assets where the model
> ran successfully but could not infer any new field from the available text.
> The server does not separately track these two cases.

**Per-asset snapshot cross-check** (from before/after DB diff on eligible-set IDs):

| Metric | Value |
|--------|-------|
| Assets touched (attempts increased) | 0 |
| Assets improved (score increased) | 0 |
| Assets processed with no score gain | 0 |

---

## 2. Field-Fill Rates

Gains computed as corpus-wide reduction in missing-field counts (before − after, all relevant assets):

| Field | Missing before | Missing after | Gained | Fill Rate |
|-------|---------------|--------------|--------|-----------|
| target | 28,263 | 28,263 | 0 | 0.0% |
| modality | 13,669 | 13,669 | 0 | 0.0% |
| indication | 12,024 | 12,024 | 0 | 0.0% |
| development_stage | 12,025 | 12,025 | 0 | 0.0% |

---

## 3. Tier Band Distribution

| Tier | Before | After | Delta | % of all (after) |
|------|--------|-------|-------|------------------|
| Excellent (≥80) | 9,132 | 9,132 | — | 27.6% |
| Good (60–79) | 5,249 | 5,249 | — | 15.9% |
| Partial (40–59) | 4,262 | 4,262 | — | 12.9% |
| Poor (1–39) | 13,840 | 13,840 | — | 41.8% |
| Unscored (0/null) | 614 | 614 | — | 1.9% |

### Tier Transition Matrix (per-asset before→after on the eligible set)

Counts assets from the before-eligible snapshot that crossed tier boundaries after the drain:

| Transition | Count |
|-----------|-------|
| (no tier transitions observed) | — |

> Assets that stayed in the same tier are not listed. Transitions are computed from the
> per-asset completeness_score snapshot taken immediately before and after the drain.

---

## 4. Modality Distribution

Before/after breakdown of the `modality` field across all relevant assets:

| Modality | Before | After | Delta |
|----------|--------|-------|-------|
| unknown | 13,669 | 13,669 | — |
| small molecule | 4,435 | 4,435 | — |
| diagnostic | 4,182 | 4,182 | — |
| antibody | 2,275 | 2,275 | — |
| nanoparticle | 1,127 | 1,127 | — |
| peptide | 997 | 997 | — |
| platform technology | 978 | 978 | — |
| gene therapy | 930 | 930 | — |
| medical device | 863 | 863 | — |
| cell therapy | 744 | 744 | — |
| vaccine | 667 | 667 | — |
| gene editing | 648 | 648 | — |
| research tool | 361 | 361 | — |
| car-t | 319 | 319 | — |
| biologic | 233 | 233 | — |
| sirna | 204 | 204 | — |
| mrna therapy | 175 | 175 | — |
| rna therapy | 69 | 69 | — |
| bispecific antibody | 62 | 62 | — |
| protac | 60 | 60 | — |

> Assets in the `unknown` modality row are the primary target for further enrichment.

---

## 5. Per-Institution Breakdown

Top institutions by eligible queue size before the run:

| Institution | Before | After | Cleared |
|-------------|--------|-------|---------|


---

## 6. Gave-Up Analysis

Assets permanently at the 3-attempt cap:

**Before:** 6,209 · **After:** 6,209 · **New this run:** —

Top institutions by gave-up count:

1. **OSTI.gov (DOE Patents)** — 503 assets
2. **Johns Hopkins University** — 270 assets
3. **University of Wisconsin** — 264 assets
4. **MIT** — 257 assets
5. **Cornell University** — 230 assets
6. **UCLA** — 195 assets
7. **University of Pittsburgh** — 191 assets
8. **Stanford University** — 179 assets
9. **UC San Diego** — 173 assets
10. **University of Arizona** — 131 assets

---

## 7. Token Cost

| Metric | Value |
|--------|-------|
| Assets processed | 0 |
| Token cost (server-reported) | **$0.0000** |
| Cost per asset | $N/A |
| Model | gpt-4o-mini |
| Wall time | 0 s |

---

## 8. Optimization Recommendations

### 8.1 Institutions to Prioritize Next

Queue is fully drained — no remaining eligible assets.

### 8.2 Field Fill Rate Analysis

- **target** fill rate 0.0% — very low. Assets lack sufficient text signal. Consider deeper scraping for abstract text or raising the data_sparse char threshold.
- **modality** fill rate 0.0% — very low. Assets lack sufficient text signal. Consider deeper scraping for abstract text or raising the data_sparse char threshold.
- **indication** fill rate 0.0% — very low. Assets lack sufficient text signal. Consider deeper scraping for abstract text or raising the data_sparse char threshold.
- **development_stage** fill rate 0.0% — very low. Assets lack sufficient text signal. Consider deeper scraping for abstract text or raising the data_sparse char threshold.

### 8.3 Gave-Up Cap Analysis

**6,209** assets (18.8% of all relevant) are at the 3-attempt cap.
New this run: **—**.

Recommended actions:
- **Non-drug queue filter (highest impact)**: Add `AND (asset_class IS NULL OR asset_class = 'drug_biologic')` to `buildEnrichWhere()` in `server/storage.ts`. Assets classified as research_tool/medical_device/software always score 3 unknowns on drug fields, consuming batch slots and accumulating cap counts.
- **DOE patent abstract supplementation**: OSTI.gov leads the gave-up list. Supplement the scraper with the OSTI full-text API to backfill scientific abstracts into the `abstract` column, then reset `mini_enrich_attempts = 0` for those assets.
- **Attempt cap reset endpoint**: Add `POST /api/admin/enrichment/reset-cap` accepting `{ institution: string }` to allow manual re-try after scraper content improvements.

### 8.4 Concrete Prompt/Data Improvements

1. **Target inference expansion**: Extend the HGNC pathway→gene mapping table in the `classifyAsset` prompt. High-value additions: Wnt→CTNNB1, mTOR→MTOR, JAK→JAK1, PI3K→PIK3CA, VEGF→VEGFA.
2. **Stage heuristic pre-filter**: If `licensingReadiness = 'startup formed'` AND no clinical keywords → set stage = `preclinical` before the LLM call. Zero API cost.
3. **Data-sparse threshold**: Raise from 120 combined chars to 200 chars in `buildEnrichWhere`. Assets in the 120–200 char window very rarely yield useful classification.
4. **Modality-specific prompting**: The `unknown` modality bucket (13,669 assets) is the largest single gap. A dedicated modality-classification prompt pass (small-molecule vs. biologic vs. cell-therapy vs. gene-therapy) would outperform the generic multi-field prompt.

---

## 9. Internal Consistency Check

- improved ≤ processed: ✅
- improved + no_gain = processed: ✅ (0 + 0 = 0)
- after.gaveUp ≥ before.gaveUp: ✅
- avg score direction: ✅ improved or flat (48.85 → 48.85)

---

*Report generated by `scripts/enrichment-audit.ts` on 2026-05-08 06:07:43 UTC*
*Drain triggered via `POST http://localhost:5000/api/internal/enrichment/run` with `{ all: true }`, polled every 5 s*
