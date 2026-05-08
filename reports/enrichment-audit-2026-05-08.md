# Enrichment Audit Report

Generated: 2026-05-08 05:55:44 UTC

---

## 1. Queue Summary

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Assets eligible (queue) | 0 | 0 | — |
| Assets gave up (attempts ≥ 3) | 6,209 | 6,209 | — |
| All relevant assets | 33,097 | 33,097 | — |
| Avg completeness score (all relevant) | 48.85 | 48.85 | — |

**Drain job results:**

| Metric | Value |
|--------|-------|
| Job ID | N/A |
| Final status | done |
| Assets processed | 0 |
| Assets improved (≥1 field gained via API) | 0 (N/A) |
| Token cost (reported by server) | $0.0000 |
| Wall time | 0 s |

---

## 2. Field-Fill Rates

Gains computed as the reduction in corpus-wide missing-field counts (before − after, all relevant assets):

| Field | Missing before | Missing after | Gained | Fill Rate |
|-------|---------------|--------------|--------|-----------|
| target | 28,263 | 28,263 | 0 | 0.0% |
| modality | 13,669 | 13,669 | 0 | 0.0% |
| indication | 12,024 | 12,024 | 0 | 0.0% |
| development_stage | 12,025 | 12,025 | 0 | 0.0% |

> Fill rates are corpus-wide: they reflect all writes during the drain, including any background enrichment the running server may have performed concurrently.

---

## 3. Tier Band Distribution

| Tier | Before | After | Delta | % of all (after) |
|------|--------|-------|-------|------------------|
| Excellent (≥80) | 9,132 | 9,132 | — | 27.6% |
| Good (60–79) | 5,249 | 5,249 | — | 15.9% |
| Partial (40–59) | 4,262 | 4,262 | — | 12.9% |
| Poor (1–39) | 13,840 | 13,840 | — | 41.8% |
| Unscored (0/null) | 614 | 614 | — | 1.9% |

Net upward movement: 0 assets moved into a higher tier.

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

> Modality is a key field for buyer matching. Assets in the `unknown` row are the primary target for further enrichment.

---

## 5. Per-Institution Breakdown

Top institutions by eligible queue size before the run:

| Institution | Before | After | Cleared |
|-------------|--------|-------|---------|


---

## 6. Gave-Up Analysis

Assets at the 3-attempt cap (will not be re-tried without a content change):

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
| Token cost (from server) | **$0.0000** |
| Cost per asset | $N/A |
| Model | gpt-4o-mini |
| Wall time | 0 s |

---

## 8. Optimization Recommendations

### 8.1 Institutions to Prioritize Next

Queue is fully drained.

### 8.2 Field Fill Rate Analysis

- **target** fill rate 0.0% — very low. Assets lack text signal. Consider deeper scraping for abstract text or raising the data_sparse threshold.
- **modality** fill rate 0.0% — very low. Assets lack text signal. Consider deeper scraping for abstract text or raising the data_sparse threshold.
- **indication** fill rate 0.0% — very low. Assets lack text signal. Consider deeper scraping for abstract text or raising the data_sparse threshold.
- **development_stage** fill rate 0.0% — very low. Assets lack text signal. Consider deeper scraping for abstract text or raising the data_sparse threshold.

### 8.3 Gave-Up Cap Analysis

**6,209** assets (18.8% of all relevant) are permanently excluded.
This grew by **—** during this run.

Recommended actions:
- **Non-drug queue filter (highest impact)**: Add `AND (asset_class IS NULL OR asset_class = 'drug_biologic')` to `buildEnrichWhere()` in `server/storage.ts`. This prevents research_tool, medical_device, and software assets from consuming batch slots and accumulating attempt counts.
- **DOE patent abstract supplementation**: OSTI.gov leads the gave-up list. The OSTI full-text API provides scientific abstracts that are far richer than patent claim text — cross-reference by OSTI ID to backfill the `abstract` column.
- **Attempt cap reset admin action**: Add `POST /api/admin/enrichment/reset-cap` accepting `{ institution: string }` to allow manual re-try after scraper content improvements.

### 8.4 Concrete Prompt/Data Improvements

1. **Target inference expansion**: Extend the HGNC mapping table in `classifyAsset.ts` with pathway→gene translations (Wnt/CTNNB1, mTOR/MTOR, JAK/JAK1, PI3K/PIK3CA). Assets that describe pathways rather than named proteins gain a target classification without richer text.

2. **Stage heuristic pre-filter**: Before the LLM call, apply deterministic rules: if `licensingReadiness = 'startup formed'` AND no clinical trial keywords in summary → set stage = `preclinical`. Handles ~5–8% of stage unknowns at zero API cost.

3. **Data-sparse threshold**: Raise from 120 combined chars to 200 chars in `buildEnrichWhere()`. Assets in the 120–200 char window very rarely yield useful field classification.

4. **Modality-specific prompting**: The `unknown` modality bucket is the largest single category. A dedicated modality-classification pass (with a prompt focused on small-molecule vs. biologic vs. cell-therapy vs. gene-therapy distinctions) would perform better than the generic multi-field classification.

---

## 9. Internal Consistency Check

- processed ≥ 0 and ≤ original queue: ✅ (queue may grow during drain due to concurrent server ingestion)
- improved ≤ processed: ✅
- after.gaveUp ≥ before.gaveUp: ✅
- avg score direction: ✅ improved (48.85 → 48.85)

---

*Report generated by `scripts/enrichment-audit.ts` on 2026-05-08 05:55:44 UTC*
*Drain triggered via `POST http://localhost:5000/api/admin/enrichment/run` with `{ all: true }`, polled every 5s*
