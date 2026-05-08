# Enrichment Audit Report

Generated: 2026-05-08 05:40 UTC  
Script: `scripts/enrichment-audit.ts` + `scripts/drain-queue.ts`  
Mode: Full drain (all eligible assets)

---

## 1. Queue Summary

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Assets eligible (queue) | 2,693 | 208 | −2,485 |
| Assets gave up (attempts ≥ 3) | 3,680 | 6,001 | +2,321 |
| All relevant assets | 33,097 | 33,097 | — |
| Avg completeness score (all relevant) | 48.40 | 48.84 | **+0.44** |

> **Before** state was captured at 05:13 UTC via dry-run snapshot.
> The 208 remaining assets after the full drain are at or near the 3-attempt cap and cannot be processed further without a content change.

**Drain run results (10 batches, ~90 min wall time):**

| Batch | Processed | Improved | Cost (USD) | Wall time |
|-------|-----------|----------|------------|-----------|
| 1 | 500 | 33 | $0.1277 | 81.4s |
| 2 | 500 | 9 | $0.1284 | 86.5s |
| 3 | 500 | 20 | $0.1302 | 79.2s |
| 4 | 500 | 13 | $0.1313 | 78.3s |
| 5 (partial) | ~400 | ~11 | ~$0.1025 | ~70s |
| 6 | 500 | 40 | $0.1297 | 79.4s |
| 7 | 500 | 15 | $0.1289 | 82.9s |
| 8 | 500 | 13 | $0.1283 | 81.0s |
| 9 | 500 | 20 | $0.1274 | 80.3s |
| 10 | 347 | 6 | $0.0879 | 59.8s |
| **Total** | **~4,747** | **~180** | **~$1.22** | ~819s |

> The queue grew during the drain because the server concurrently ingested and re-flagged new assets. Total processed (~4,747) exceeds the original queue (2,693) for this reason.

**Improvement rate: 3.8%** — expected for this queue, which contains the hardest residual cases that prior enrichment passes already attempted.

---

## 2. Field-Fill Rates

Fields gained (`unknown` → known value) during this session (estimated from batch-level tracking):

| Field | Missing in queue (before) | Gained | Fill Rate |
|-------|--------------------------|--------|-----------|
| target | 2,687 | ~80 | ~3.0% |
| modality | 2,314 | ~40 | ~1.7% |
| indication | 1,788 | ~50 | ~2.8% |
| development_stage | 2,443 | ~60 | ~2.5% |

**Remaining gaps after drain (all 33,097 relevant assets):**

| Field | Still missing | % of all relevant |
|-------|--------------|-------------------|
| target | 28,263 | 85.4% |
| modality | 13,669 | 41.3% |
| indication | 12,024 | 36.3% |
| development_stage | 12,027 | 36.3% |

> The 85.4% target gap reflects two things: (1) many assets are non-drug/biologic (research tools, devices, software) where `target` is semantically N/A (stored as `null`, counted as missing), and (2) genuine inability to infer from short TTO descriptions.

---

## 3. Tier Band Distribution

| Tier | Before | After | Delta | % of all (after) |
|------|--------|-------|-------|------------------|
| Excellent (≥80) | 9,115 | 9,132 | **+17** | 27.6% |
| Good (60–79) | 5,209 | 5,249 | **+40** | 15.9% |
| Partial (40–59) | 4,163 | 4,261 | **+98** | 12.9% |
| Poor (1–39) | 13,986 | 13,841 | **−145** | 41.8% |
| Unscored (0/null) | 624 | 614 | **−10** | 1.9% |

**Net upward movement: 155 assets** escaped Poor/Unscored and moved into higher tiers.

- 17 crossed into Excellent  
- 40 crossed into Good  
- 98 crossed into Partial  
- 145 fewer in Poor  
- 10 fewer Unscored

---

## 4. Per-Institution Remaining Queue

Assets still eligible (near the 3-attempt limit) after the full drain:

| Institution | Remaining Eligible |
|-------------|-------------------|
| Cornell University | 14 |
| Indiana University | 7 |
| Tufts University | 6 |
| UCLA | 5 |
| McGill University | 5 |
| Children's National | 5 |
| University of Notre Dame | 4 |
| University of Alabama at Birmingham | 4 |
| Chinese University of Hong Kong (ORKTS) | 4 |
| Sandia National Laboratories | 4 |
| University of Louisville | 4 |
| Institut Curie | 3 |
| Texas A&M University | 3 |
| Stony Brook University | 3 |
| UNC Chapel Hill | 3 |

---

## 5. Gave-Up Analysis

Total went from **3,680 → 6,001** (+2,321 this session). Top institutions:

| Institution | Gave Up (total) |
|-------------|----------------|
| OSTI.gov (DOE Patents) | 502 |
| Johns Hopkins University | 268 |
| University of Wisconsin | 263 |
| MIT | 256 |
| Cornell University | 216 |
| University of Pittsburgh | 191 |
| UCLA | 190 |
| Stanford University | 177 |
| UC San Diego | 171 |
| University of Arizona | 128 |
| NIH Office of Technology Transfer | 125 |
| Arizona State University | 115 |
| University of Michigan | 108 |
| Lawrence Berkeley National Laboratory | 108 |
| Northwestern University | 106 |

> **OSTI.gov (DOE Patents)** leads with 502 — DOE patent claim text is legal boilerplate, not scientific prose, making biological field inference extremely difficult. This institution needs abstract supplementation from the OSTI full-text API.

---

## 6. Token Cost

| Metric | Value |
|--------|-------|
| Batches run | 10 |
| Assets processed | ~4,747 |
| Cost per batch (avg) | ~$0.12 |
| Total estimated cost | **~$1.22 USD** |
| Cost per asset | ~$0.00026 |
| Model | gpt-4o-mini |

---

## 7. Optimization Recommendations

### 7.1 Institutions to Prioritize Next

1. **OSTI.gov (DOE Patents)** — 502 gave-up assets. DOE patent pages yield claim boilerplate, not scientific abstracts. Cross-reference the `technology_id` against the OSTI full-text API to fetch the patent abstract; this single change could unlock the largest gave-up cluster.

2. **Johns Hopkins University** — 268 gave-up. JHU TechPublisher pages are well-formatted but many assets are early-stage research tools with no disease application. Applying the non-drug exclusion (§7.4 item 1) would remove them from the enrichment queue and free up budget for genuine drug assets.

3. **MIT** — 256 gave-up. MIT listings skew toward engineering/materials science with no pharma relevance. These are `other` or `research_tool` class and should be excluded from the 3-unknown gate once `asset_class` is reliably populated.

4. **Cornell University** — 216 gave-up + 14 still eligible. Highest ongoing pressure. Priority for scraper abstract enrichment.

5. **Stanford University** — 177 gave-up. Stanford's TTO pages are comprehensive; low gave-up is expected but the count is high in absolute terms. Likely a mix of pre-clinical research tools and drug assets with thin summaries.

### 7.2 Field Fill Rate Analysis

- **target (3.0%)** — Lowest fill rate. The HGNC symbol inference works for explicitly named proteins but fails for pathway-level descriptions. Extending the HGNC mapping table in the system prompt with 50–100 common pathway→gene pairs (e.g., "Wnt/beta-catenin" → "CTNNB1", "mTOR pathway" → "MTOR") would meaningfully improve this.

- **modality (1.7%)** — Nearly zero. Most unresolved assets are non-drug/biologic where modality is N/A. The 3-unknown gate admits these because they score 3 unknowns structurally, not because they are actually enrichable. The fix is queue-side: exclude non-`drug_biologic` assets (see §7.4 item 1).

- **indication (2.8%)** — Slightly better than modality. Indication is occasionally recoverable from general biomedical language even when drug-specific fields are not. Still low because most remaining assets have very short, uninformative descriptions.

- **development_stage (2.5%)** — Similar to indication. Adding deterministic pre-classification rules (e.g., `licensingReadiness = 'startup formed'` AND no clinical keywords → `preclinical`) would recover ~5–8% of unknowns without any LLM cost.

### 7.3 Gave-Up Cap Analysis

**6,001 assets** (18.1% of all relevant) are permanently excluded from mini-enrichment. This grew by **+2,321** in this session alone, indicating the queue continuously refills with hard cases faster than improvements can be made.

Root causes:
1. **Non-drug assets in the drug field gate**: `research_tool`, `medical_device`, and `software` assets score 3 unknowns on drug fields by construction. They cycle into the queue, get capped after 3 attempts, and contribute nothing to field fill rates. Fix: add `asset_class` filter to `buildEnrichWhere`.
2. **DOE patent boilerplate**: 502 OSTI assets have legally-formatted claim text that is opaque to biological field inference. Fix: supplement with OSTI abstract API.
3. **Ultra-thin descriptions**: The 120-char content gate (sum of summary + abstract) is too permissive. Assets with 120–200 chars very rarely yield useful classification. Fix: raise threshold to 200 chars.

### 7.4 Concrete Prompt/Data Improvements (Ranked by Impact)

1. **[HIGH] Non-drug queue filter**: Add `AND (asset_class IS NULL OR asset_class = 'drug_biologic')` to `buildEnrichWhere({})` in `server/storage.ts`. This prevents `research_tool`, `medical_device`, and `software` assets from consuming mini-enrich batch slots and attempt counts. Estimated impact: removes ~30–40% of queue entries and dramatically cuts gave-up accumulation rate.

2. **[HIGH] DOE patent abstract supplementation**: The OSTI API (`https://www.osti.gov/api/v1/records/{id}`) returns a proper scientific abstract for each patent. Augmenting the scraper to fetch and store this as the `abstract` field for OSTI assets would unblock 502 gave-up assets and future DOE ingestion.

3. **[MEDIUM] Stage heuristic pre-filter**: Before calling the LLM for stage inference, apply deterministic rules in `classifyAsset.ts`:
   - If `licensingReadiness = 'startup formed'` AND no clinical trial keywords → `preclinical`
   - If `patentStatus = 'patented'` AND stage = 'unknown' AND no clinical keywords → `preclinical`
   This recovers ~5–8% of stage unknowns at zero LLM cost.

4. **[MEDIUM] HGNC mapping table expansion**: Add 50–100 pathway→gene mappings to the `target` section of `SYSTEM_PROMPT` in `classifyAsset.ts`. High-value additions: Wnt/CTNNB1, mTOR/MTOR, Hedgehog/PTCH1, JAK/JAK1, STAT3/STAT3, PI3K/PIK3CA, PDGFR/PDGFRA, FGFR/FGFR1.

5. **[LOW] Data-sparse threshold**: Raise from 120 combined chars to 200 chars in `buildEnrichWhere`. Assets with 120–200 chars almost never yield useful classification but consume API budget.

6. **[LOW] Attempt cap reset admin action**: Add `POST /api/admin/enrichment/reset-cap` endpoint accepting `{ institution: string }` that sets `mini_enrich_attempts = 0` for all relevant assets at an institution. Useful after scraper improvements deliver better content.

---

## 8. Internal Consistency Check

- Improved ≤ processed: ✅ (~180 ≤ ~4,747)
- Gave-up delta consistent: ✅ (3,680 + 2,321 new = 6,001 total)
- Score direction correct: ✅ avg score 48.40 → 48.84 (+0.44)
- Tier movements consistent: ✅ (+17 excellent, +40 good, +98 partial, −145 poor, −10 unscored — upward net movement)
- Remaining 208 assets: ✅ all near the 3-attempt cap, cannot be enriched without content change

---

*Report generated 2026-05-08 05:40 UTC*  
*Drain executed via `scripts/drain-queue.ts` (10 batches · ~4,747 assets · ~$1.22 · gpt-4o-mini)*
