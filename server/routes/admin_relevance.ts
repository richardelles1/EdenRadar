import type { Express } from "express";
import { storage } from "../storage";

// Admin /relevance/eval per-row probability cache
type RelevanceEvalCache = {
  key: string;
  scored: Array<{ label: boolean; prob: number; v1Kept: boolean }>;
  holdoutSize: number;
};
let relevanceEvalCache: RelevanceEvalCache | null = null;
function relevanceEvalCacheKey(classifierVersion: string, weightsSig: string): string {
  return `cv=${classifierVersion}|w=${weightsSig}`;
}
function invalidateRelevanceEvalCache(): void {
  relevanceEvalCache = null;
}

export function registerRelevanceRoutes(app: Express): void {
  app.post("/api/admin/relevance/holdout/build", async (_req, res) => {
    try {
      const result = await storage.buildRelevanceHoldout();
      const stats = await storage.getRelevanceHoldoutStats();
      // Holdout membership changed → drop cached per-row scores so the next
      // /relevance/eval call rescores against the new row set.
      invalidateRelevanceEvalCache();
      res.json({ ...result, stats });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to build holdout" });
    }
  });

  app.get("/api/admin/relevance/eval", async (_req, res) => {
    try {
      const preFilterMod = await import("../lib/pipeline/relevancePreFilter");
      const classifierMod = await import("../lib/pipeline/relevanceClassifier");
      const { preFilterRelevance } = preFilterMod;
      const {
        scoreText,
        CLASSIFIER_THRESHOLD,
        CLASSIFIER_V2_ENABLED,
        CLASSIFIER_VERSION,
        getActiveThreshold,
        getActiveWeights,
        weightsSignature,
      } = classifierMod;
      const [activeThreshold, activeWeights] = await Promise.all([
        getActiveThreshold(),
        getActiveWeights(),
      ]);
      const activeWeightsSig = weightsSignature(activeWeights);

      // Production pipeline keeps anything that isn't an explicit reject:
      // both `pass` and `ambiguous` flow forward into the rest of ingestion.
      const decisionToKept = (d: "pass" | "reject" | "ambiguous") => d !== "reject";

      // Per-row cache: keyed by (eval row count, classifier version). The
      // probability vector + v1 decision are both pure functions of the row
      // text and the classifier weights, so they don't need to be recomputed
      // on every admin click. Invalidated when buildRelevanceHoldout runs
      // (route handler above) or when CLASSIFIER_VERSION is bumped (engineers
      // bump the constant when weights/keywords change).
      type ScoredRow = { label: boolean; prob: number; v1Kept: boolean };
      let scored: ScoredRow[];
      let holdoutSize: number;
      const cacheKey = relevanceEvalCacheKey(CLASSIFIER_VERSION, activeWeightsSig);
      if (relevanceEvalCache && relevanceEvalCache.key === cacheKey) {
        scored = relevanceEvalCache.scored;
        holdoutSize = relevanceEvalCache.holdoutSize;
      } else {
        // Eval split only — train/eval partitioning is enforced by
        // buildRelevanceHoldout.
        const rows = await storage.listRelevanceHoldout(20000, "eval");
        type Listing = Parameters<typeof preFilterRelevance>[0];
        const buildListing = (r: typeof rows[number]): Listing => ({
          title: r.text || "",
          description: "",
          url: "",
          institution: r.sourceName || "unknown",
        });
        scored = rows.map((r) => {
          const listing = buildListing(r);
          const text = `${listing.title} ${listing.description ?? ""}`;
          return {
            label: !!r.label,
            // Score with the *active* (possibly tuned) weights so the cached
            // probability vector reflects whatever production is using right
            // now. The cache key above includes the weights signature, so a
            // tune call invalidates this cache automatically.
            prob: scoreText(text, activeWeights).prob,
            v1Kept: decisionToKept(preFilterRelevance(listing)),
          };
        });
        holdoutSize = rows.length;
        relevanceEvalCache = { key: cacheKey, scored, holdoutSize };
      }

      if (holdoutSize === 0) {
        return res.json({
          holdoutSize: 0,
          threshold: CLASSIFIER_THRESHOLD,
          activeThreshold,
          currentVariant: CLASSIFIER_V2_ENABLED ? "v2_classifier" : "v1_keyword",
          v1: null,
          v2: null,
          current: null,
          sweep: [],
          bestThreshold: null,
        });
      }

      const tally = (preds: Array<{ label: boolean; pred: boolean }>) => {
        let tp = 0, fp = 0, tn = 0, fn = 0;
        for (const p of preds) {
          if (p.pred && p.label) tp++;
          else if (p.pred && !p.label) fp++;
          else if (!p.pred && p.label) fn++;
          else tn++;
        }
        const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
        const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
        const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
        return { tp, fp, tn, fn, precision, recall, f1 };
      };

      // preFilterRelevanceV2 only depends on the cached probability:
      //   prob >= t + 0.15 → pass, prob <= t - 0.15 → reject, else ambiguous.
      // We inline that here so the threshold sweep is O(N) over a number[]
      // instead of re-running scoreText/extractFeatures per row per threshold.
      const v2KeptAt = (t: number, prob: number) => prob > t - 0.15;

      const v1Stats = tally(scored.map((s) => ({ label: s.label, pred: s.v1Kept })));
      const evalV2At = (t: number) => tally(scored.map((s) => ({
        label: s.label,
        pred: v2KeptAt(t, s.prob),
      })));
      // v2 stats are evaluated at the *active* threshold (env > tuned > default),
      // not the bare CLASSIFIER_THRESHOLD constant. That way the v2 card and
      // the "Current pipeline" card always tell the same story after a tune,
      // and the head-to-head with v1 reflects what production actually runs.
      const v2Stats = evalV2At(activeThreshold);
      const sweep = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7].map((t) => ({
        threshold: t,
        ...evalV2At(t),
      }));
      // currentPipeline = whichever pre-filter actually runs in production
      // right now (v1 keyword OR v2 classifier at the active threshold).
      const currentStats = CLASSIFIER_V2_ENABLED ? evalV2At(activeThreshold) : v1Stats;
      // bestThreshold = sweep entry with the highest F1 — used by
      // POST /api/admin/relevance/threshold/tune to persist the choice.
      const best = sweep.reduce((acc, s) => (s.f1 > acc.f1 ? s : acc), sweep[0]);

      res.json({
        holdoutSize,
        threshold: CLASSIFIER_THRESHOLD,
        activeThreshold,
        currentVariant: CLASSIFIER_V2_ENABLED ? "v2_classifier" : "v1_keyword",
        v1: v1Stats,
        v2: v2Stats,
        current: currentStats,
        sweep,
        bestThreshold: best ? { threshold: best.threshold, f1: best.f1 } : null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to evaluate";
      res.status(500).json({ error: msg });
    }
  });

  // POST → picks the best-F1 threshold from the sweep and persists it via
  // storage.setTunedClassifierThreshold. The classifier reads it lazily
  // (cached for 5 min) so production switches over without a restart.
  app.post("/api/admin/relevance/threshold/tune", async (_req, res) => {
    try {
      const classifierMod = await import("../lib/pipeline/relevanceClassifier");
      const { preFilterRelevanceV2, invalidateThresholdCache } = classifierMod;
      const rows = await storage.listRelevanceHoldout(20000, "eval");
      if (rows.length === 0) return res.status(400).json({ error: "Holdout is empty — build it first" });
      // Tune against the *real* v2 decision function (preFilterRelevanceV2),
      // so the chosen threshold optimizes the same pass/ambiguous/reject
      // routing that ingestion uses — not a proxy probability cutoff.
      type Listing = Parameters<typeof preFilterRelevanceV2>[0];
      const listings: Array<{ label: boolean; listing: Listing }> = rows.map((r) => ({
        label: !!r.label,
        listing: { title: r.text || "", description: "", url: "", institution: r.sourceName || "unknown" },
      }));
      let best = { threshold: 0.5, f1: -1 };
      for (const t of [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70]) {
        let tp = 0, fp = 0, fn = 0;
        for (const p of listings) {
          const decision = preFilterRelevanceV2(p.listing, t);
          const pred = decision !== "reject"; // pass + ambiguous both flow forward
          if (pred && p.label) tp++;
          else if (pred && !p.label) fp++;
          else if (!pred && p.label) fn++;
        }
        const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
        const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
        const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
        if (f1 > best.f1) best = { threshold: t, f1 };
      }
      await storage.setTunedClassifierThreshold(best.threshold, best.f1);
      invalidateThresholdCache();
      res.json({ tuned: best, holdoutSize: rows.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to tune threshold";
      res.status(500).json({ error: msg });
    }
  });

  // Task #699: fit logistic-regression weights from the train split, choose
  // the threshold on the eval split, persist both — but only if the fitted
  // model strictly beats the current persisted/baseline F1 on eval. This
  // satisfies the task's "v2 strictly ≥ v1 on F1 before flag default flips
  // ON" gate. Pass ?force=1 to persist regardless (useful when iterating).
  app.post("/api/admin/relevance/weights/tune", async (req, res) => {
    try {
      const force = req.query.force === "1" || req.query.force === "true";
      const trainerMod = await import("../lib/pipeline/relevanceTrainer");
      const classifierMod = await import("../lib/pipeline/relevanceClassifier");
      const { fitAndEvaluate } = trainerMod;
      const {
        DEFAULT_WEIGHTS,
        getActiveWeights,
        invalidateWeightsCache,
        invalidateThresholdCache,
      } = classifierMod;

      const [trainRowsRaw, evalRowsRaw, currentActive] = await Promise.all([
        storage.listRelevanceHoldout(20000, "train"),
        storage.listRelevanceHoldout(20000, "eval"),
        getActiveWeights(),
      ]);
      if (trainRowsRaw.length < 50) {
        return res.status(400).json({
          error: `Train split too small (${trainRowsRaw.length} rows). Build holdout and collect more save/dismiss feedback first.`,
        });
      }
      if (evalRowsRaw.length < 20) {
        return res.status(400).json({
          error: `Eval split too small (${evalRowsRaw.length} rows). Build holdout first.`,
        });
      }

      const trainRows = trainRowsRaw.map((r) => ({ text: r.text || "", label: !!r.label }));
      const evalRows = evalRowsRaw.map((r) => ({ text: r.text || "", label: !!r.label }));

      // Baseline = whatever's currently live (DEFAULT_WEIGHTS if nothing has
      // ever been tuned). This is what the new weights have to beat.
      const result = fitAndEvaluate(trainRows, evalRows, currentActive);

      const improvedF1 = result.fittedEval.f1 > result.baselineEval.f1;
      const persisted = force || improvedF1;

      if (persisted) {
        await storage.setTunedClassifierWeights(result.fitted, result.fittedEval.f1);
        // Tuning weights also implies the chosen threshold — persist it too
        // so the active threshold reflects the same fit.
        await storage.setTunedClassifierThreshold(result.threshold, result.fittedEval.f1);
        invalidateWeightsCache();
        invalidateThresholdCache();
        invalidateRelevanceEvalCache();
      }

      res.json({
        persisted,
        improvedF1,
        forced: force,
        defaultWeights: DEFAULT_WEIGHTS,
        currentActiveWeights: currentActive,
        fitted: {
          weights: result.fitted,
          threshold: result.threshold,
          eval: result.fittedEval,
        },
        baseline: {
          // What the live weights score on the eval split *right now* (at the
          // best sweep threshold) — so the UI can render a fair head-to-head.
          weights: currentActive,
          threshold: result.baselineThreshold,
          eval: result.baselineEval,
        },
        trainSize: trainRows.length,
        evalSize: evalRows.length,
        trainResult: {
          iterations: result.trainResult.iterations,
          finalLoss: result.trainResult.finalLoss,
          positiveRate: result.trainResult.positiveRate,
          converged: result.trainResult.converged,
        },
        sweep: result.sweep,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to tune weights";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/admin/relevance/metrics", async (_req, res) => {
    try {
      const rows = await storage.getLatestRelevanceMetrics(500);
      const lastAt = await storage.getLastRelevanceMetricsAt();
      res.json({ rows, lastComputedAt: lastAt });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch metrics" });
    }
  });

  app.post("/api/admin/relevance/metrics/refresh", async (_req, res) => {
    try {
      const result = await storage.computeRelevanceMetrics(7);
      res.json({ inserted: result.inserted });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to refresh metrics" });
    }
  });

}