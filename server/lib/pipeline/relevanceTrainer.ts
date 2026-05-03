import { extractFeatures, type ClassifierFeatures } from "./relevanceClassifier";

/**
 * Logistic regression trainer for the v2 relevance classifier (Task #699).
 *
 * Inputs are rows from `relevance_holdout` (split='train'). Features are the
 * exact same vector that production extracts (extractFeatures), so the fitted
 * weights drop straight into scoreText() without any feature drift.
 *
 * We keep this in plain TS so it can run from a `tsx scripts/...` CLI, from
 * the admin endpoint, and unit-tested without pulling in a numerical library.
 */

export type WeightVector = {
  wBiotech: number;
  wNonBiotech: number;
  wLength: number;
  bias: number;
};

export type LabelledRow = { text: string; label: boolean };

export type ScoredRow = { features: ClassifierFeatures; label: boolean };

function sigmoid(z: number): number {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

function predict(features: ClassifierFeatures, w: WeightVector): number {
  const z = w.bias
    + w.wBiotech * features.biotechHits
    + w.wNonBiotech * features.nonBiotechHits
    + w.wLength * features.lengthFactor;
  return sigmoid(z);
}

export type TrainOptions = {
  /** L2 regularization strength. Default 0.01 (gentle). */
  l2?: number;
  /** Learning rate. Default 0.1 — features are small ints / [0,1]. */
  lr?: number;
  /** Number of full-batch gradient steps. Default 800. */
  iterations?: number;
  /** Re-weight positives so class imbalance doesn't collapse the model. */
  classBalance?: boolean;
  /** Initial weights (defaults to zeros — bias seeded from class prior). */
  initial?: WeightVector;
};

export type TrainResult = {
  weights: WeightVector;
  iterations: number;
  finalLoss: number;
  trainSize: number;
  positiveRate: number;
  converged: boolean;
};

/**
 * Fit logistic regression weights via batch gradient descent.
 *
 * The trainer handles class imbalance by up-weighting the minority class so
 * an "all-negative" or "all-positive" trivial classifier doesn't win. The
 * loss function is the standard binary cross-entropy with L2 on the
 * non-bias weights only (we don't penalize the bias — it's the class prior).
 */
export function trainWeights(
  rows: LabelledRow[],
  options: TrainOptions = {},
): TrainResult {
  const lr = options.lr ?? 0.1;
  const l2 = options.l2 ?? 0.01;
  const iterations = options.iterations ?? 800;
  const classBalance = options.classBalance ?? true;

  if (rows.length === 0) {
    return {
      weights: { wBiotech: 0, wNonBiotech: 0, wLength: 0, bias: 0 },
      iterations: 0,
      finalLoss: 0,
      trainSize: 0,
      positiveRate: 0,
      converged: false,
    };
  }

  const scored: ScoredRow[] = rows.map((r) => ({
    features: extractFeatures(r.text),
    label: r.label,
  }));

  let positives = 0;
  for (const s of scored) if (s.label) positives++;
  const positiveRate = positives / scored.length;

  // Per-row weight: 1.0 for the majority class, (n_majority / n_minority) for
  // the minority. Caps at 5x so a 99/1 split doesn't completely overwhelm the
  // gradient.
  const negatives = scored.length - positives;
  const wPos = classBalance && positives > 0 && negatives > 0
    ? Math.min(5, negatives / positives)
    : 1;
  const wNeg = classBalance && positives > 0 && negatives > 0
    ? Math.min(5, positives / negatives)
    : 1;
  const sampleWeight = (label: boolean) =>
    label ? Math.max(1, wPos) : Math.max(1, wNeg);

  // Seed bias from the class prior (logit of the positive rate) so descent
  // doesn't waste the first ~50 iterations just shifting the bias.
  const seedBias = positiveRate > 0 && positiveRate < 1
    ? Math.log(positiveRate / (1 - positiveRate))
    : 0;
  const w: WeightVector = options.initial ?? {
    wBiotech: 0,
    wNonBiotech: 0,
    wLength: 0,
    bias: seedBias,
  };

  let lastLoss = Infinity;
  let converged = false;
  let iter = 0;
  for (; iter < iterations; iter++) {
    let dB = 0, dN = 0, dL = 0, dBias = 0;
    let loss = 0;
    let totalWeight = 0;
    for (const s of scored) {
      const sw = sampleWeight(s.label);
      const p = predict(s.features, w);
      const y = s.label ? 1 : 0;
      const err = (p - y) * sw;
      dB += err * s.features.biotechHits;
      dN += err * s.features.nonBiotechHits;
      dL += err * s.features.lengthFactor;
      dBias += err;
      // Cross-entropy with epsilon to avoid log(0).
      const eps = 1e-9;
      loss -= sw * (y * Math.log(p + eps) + (1 - y) * Math.log(1 - p + eps));
      totalWeight += sw;
    }
    const n = totalWeight || 1;
    // L2 reg on the three feature weights only.
    w.wBiotech    -= lr * (dB / n + l2 * w.wBiotech);
    w.wNonBiotech -= lr * (dN / n + l2 * w.wNonBiotech);
    w.wLength     -= lr * (dL / n + l2 * w.wLength);
    w.bias        -= lr * (dBias / n);

    const meanLoss = loss / n;
    if (Math.abs(lastLoss - meanLoss) < 1e-6) {
      converged = true;
      iter++;
      break;
    }
    lastLoss = meanLoss;
  }

  return {
    weights: w,
    iterations: iter,
    finalLoss: lastLoss,
    trainSize: scored.length,
    positiveRate,
    converged,
  };
}

export type EvalStats = {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
};

function tally(items: Array<{ label: boolean; pred: boolean }>): EvalStats {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const it of items) {
    if (it.pred && it.label) tp++;
    else if (it.pred && !it.label) fp++;
    else if (!it.pred && !it.label) tn++;
    else fn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, fp, tn, fn, precision, recall, f1 };
}

/**
 * Evaluate a weight vector on the eval split by sweeping the threshold and
 * picking the best-F1 entry. Mirrors the routing used by preFilterRelevanceV2:
 * a row "passes" iff prob > threshold - 0.15 (i.e. pass + ambiguous → kept).
 */
export function evaluateOnHoldout(
  rows: LabelledRow[],
  weights: WeightVector,
  thresholds: number[] = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70],
): { sweep: Array<{ threshold: number } & EvalStats>; best: { threshold: number } & EvalStats } {
  const probs = rows.map((r) => ({
    label: r.label,
    prob: predict(extractFeatures(r.text), weights),
  }));
  const sweep = thresholds.map((t) => ({
    threshold: t,
    ...tally(probs.map((p) => ({ label: p.label, pred: p.prob > t - 0.15 }))),
  }));
  const best = sweep.reduce((acc, s) => (s.f1 > acc.f1 ? s : acc), sweep[0]);
  return { sweep, best };
}

/**
 * End-to-end: fit on `train`, sweep threshold on `eval`, return the new
 * weights, the chosen threshold, and the F1 numbers vs a baseline weight
 * vector (so callers can decide whether to persist the result).
 */
export function fitAndEvaluate(
  trainRows: LabelledRow[],
  evalRows: LabelledRow[],
  baseline: WeightVector,
  options?: TrainOptions,
): {
  fitted: WeightVector;
  threshold: number;
  fittedEval: EvalStats;
  baselineEval: EvalStats;
  baselineThreshold: number;
  trainResult: TrainResult;
  sweep: Array<{ threshold: number } & EvalStats>;
} {
  const trainResult = trainWeights(trainRows, options);
  const fittedEvaluation = evaluateOnHoldout(evalRows, trainResult.weights);
  const baselineEvaluation = evaluateOnHoldout(evalRows, baseline);
  return {
    fitted: trainResult.weights,
    threshold: fittedEvaluation.best.threshold,
    fittedEval: fittedEvaluation.best,
    baselineEval: baselineEvaluation.best,
    baselineThreshold: baselineEvaluation.best.threshold,
    trainResult,
    sweep: fittedEvaluation.sweep,
  };
}
