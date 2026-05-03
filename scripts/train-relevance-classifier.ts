/**
 * Offline trainer for the v2 relevance classifier (Task #699).
 *
 * Usage:
 *   npx tsx scripts/train-relevance-classifier.ts            # dry-run, prints fitted weights + F1
 *   npx tsx scripts/train-relevance-classifier.ts --persist  # also writes weights+threshold to DB
 *   npx tsx scripts/train-relevance-classifier.ts --persist --force  # persist even if F1 didn't improve
 *
 * Strict train/eval discipline: only rows with split='train' are used to fit;
 * only rows with split='eval' are used to evaluate. The split is assigned at
 * insert time by buildRelevanceHoldout() (deterministic by asset id), so
 * re-running the trainer is reproducible and the eval split is never leaked.
 */
import { storage } from "../server/storage";
import {
  DEFAULT_WEIGHTS,
  invalidateWeightsCache,
  invalidateThresholdCache,
} from "../server/lib/pipeline/relevanceClassifier";
import { fitAndEvaluate } from "../server/lib/pipeline/relevanceTrainer";

async function main() {
  const persist = process.argv.includes("--persist");
  const force = process.argv.includes("--force");

  const [trainRows, evalRows, currentTuned] = await Promise.all([
    storage.listRelevanceHoldout(20000, "train"),
    storage.listRelevanceHoldout(20000, "eval"),
    storage.getTunedClassifierWeights(),
  ]);
  if (trainRows.length === 0 || evalRows.length === 0) {
    console.error(`Holdout is empty (train=${trainRows.length}, eval=${evalRows.length}). Run POST /api/admin/relevance/holdout/build first.`);
    process.exit(1);
  }

  // Compare against whatever's live (tuned-from-DB if present, else default).
  const baseline = currentTuned?.weights ?? DEFAULT_WEIGHTS;
  console.log(`Baseline weights:`, baseline, currentTuned ? `(tuned ${currentTuned.computedAt.toISOString()})` : "(default)");
  console.log(`Train rows: ${trainRows.length}  Eval rows: ${evalRows.length}`);

  const result = fitAndEvaluate(
    trainRows.map((r) => ({ text: r.text || "", label: !!r.label })),
    evalRows.map((r) => ({ text: r.text || "", label: !!r.label })),
    baseline,
  );

  console.log(`\nTrain: iter=${result.trainResult.iterations} loss=${result.trainResult.finalLoss.toFixed(4)} converged=${result.trainResult.converged} pos%=${(result.trainResult.positiveRate * 100).toFixed(1)}`);
  console.log(`\nFitted weights:`, result.fitted);
  console.log(`Best threshold: ${result.threshold}`);
  console.log(`\nEval (fitted @ t=${result.threshold}): P=${(result.fittedEval.precision * 100).toFixed(1)}% R=${(result.fittedEval.recall * 100).toFixed(1)}% F1=${(result.fittedEval.f1 * 100).toFixed(1)}%`);
  console.log(`Eval (baseline @ t=${result.baselineThreshold}): P=${(result.baselineEval.precision * 100).toFixed(1)}% R=${(result.baselineEval.recall * 100).toFixed(1)}% F1=${(result.baselineEval.f1 * 100).toFixed(1)}%`);
  console.log(`\nThreshold sweep (fitted):`);
  for (const s of result.sweep) {
    console.log(`  t=${s.threshold.toFixed(2)}  P=${(s.precision * 100).toFixed(1)}%  R=${(s.recall * 100).toFixed(1)}%  F1=${(s.f1 * 100).toFixed(1)}%  (TP=${s.tp} FP=${s.fp} FN=${s.fn})`);
  }

  const improved = result.fittedEval.f1 > result.baselineEval.f1;
  if (!persist) {
    console.log(`\nDry-run only. ${improved ? "Fitted F1 beats baseline — re-run with --persist to write." : "Fitted F1 did NOT beat baseline."}`);
    return;
  }
  if (!improved && !force) {
    console.log(`\nFitted F1 (${(result.fittedEval.f1 * 100).toFixed(1)}%) did not beat baseline (${(result.baselineEval.f1 * 100).toFixed(1)}%). Skipping persist (use --force to override).`);
    return;
  }
  await storage.setTunedClassifierWeights(result.fitted, result.fittedEval.f1);
  await storage.setTunedClassifierThreshold(result.threshold, result.fittedEval.f1);
  invalidateWeightsCache();
  invalidateThresholdCache();
  console.log(`\nPersisted fitted weights and threshold=${result.threshold}.`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
