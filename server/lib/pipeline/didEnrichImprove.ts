type BeforeFields = {
  target: string;
  modality: string;
  indication: string;
  developmentStage: string;
};

type AfterFields = {
  target?: string | null;
  modality?: string | null;
  indication?: string | null;
  developmentStage?: string | null;
};

function isKnown(v: string | null | undefined): boolean {
  return v != null && v !== "" && v !== "unknown";
}

/**
 * Returns true if the classification result filled at least one previously
 * unknown pharma-style field. This is the counter used by the enrichment job
 * to report how many assets were meaningfully improved (not just re-classified).
 *
 * Note: developmentStage is only counted when it was exactly "unknown" (not
 * empty). target/modality/indication also count empty-string as unknown.
 */
export function didEnrichImprove(before: BeforeFields, after: AfterFields): boolean {
  return (
    ((!before.target || before.target === "unknown") && isKnown(after.target)) ||
    ((!before.modality || before.modality === "unknown") && isKnown(after.modality)) ||
    ((!before.indication || before.indication === "unknown") && isKnown(after.indication)) ||
    (before.developmentStage === "unknown" && isKnown(after.developmentStage))
  );
}
