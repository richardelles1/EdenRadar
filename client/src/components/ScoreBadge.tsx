import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ScoreBadgeProps {
  score: number;
  breakdown?: {
    novelty: number;
    freshness: number;
    readiness: number;
    licensability: number;
    fit: number;
    competition: number;
    total: number;
    signal_coverage?: number;
    scored_dimensions?: string[];
  };
  size?: "sm" | "md" | "lg";
}

function scoreColor(score: number): { bg: string; text: string; ring: string } {
  if (score >= 75) return { bg: "bg-emerald-500", text: "text-white", ring: "ring-emerald-600/50" };
  if (score >= 55) return { bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-400", ring: "ring-emerald-500/30" };
  return { bg: "bg-muted", text: "text-muted-foreground", ring: "ring-border" };
}

const BREAKDOWN_LABELS: Record<string, string> = {
  fit: "Buyer Fit",
  novelty: "Novelty",
  readiness: "Readiness",
  licensability: "Licensability",
};

const MEANINGFUL_DIMS = ["fit", "novelty", "readiness", "licensability"] as const;
type MeaningfulDim = typeof MEANINGFUL_DIMS[number];

export function ScoreBadge({ score, breakdown, size = "md" }: ScoreBadgeProps) {
  const isUnscored = score === 0 && (breakdown?.signal_coverage ?? 0) === 0 && (breakdown?.scored_dimensions?.length ?? 0) === 0;
  const { bg, text, ring } = isUnscored
    ? { bg: "bg-muted", text: "text-muted-foreground", ring: "ring-border" }
    : scoreColor(score);
  const sizeClass = size === "sm" ? "text-[10px] px-1.5 py-0.5" : size === "lg" ? "text-sm px-3 py-1.5" : "text-xs px-2 py-1";

  const badge = (
    <div
      className={`inline-flex items-center gap-1 rounded-md font-bold ring-1 ${bg} ${text} ${ring} ${sizeClass} cursor-default`}
      data-testid="score-badge"
    >
      {isUnscored ? (
        <span className="font-mono opacity-60">–</span>
      ) : (
        <>
          <span className="font-mono">{Math.round(score)}</span>
          <span className="opacity-60 font-normal text-[0.7em]">/ 100</span>
        </>
      )}
    </div>
  );

  if (!breakdown) return badge;

  const scoredDims = breakdown.scored_dimensions ?? MEANINGFUL_DIMS.slice();
  const dims = MEANINGFUL_DIMS.filter(
    (k): k is MeaningfulDim =>
      k in breakdown &&
      scoredDims.includes(k) &&
      (breakdown as unknown as Record<string, number>)[k] > 0
  );

  if (dims.length === 0) return badge;

  const coverage = breakdown.signal_coverage ?? 0;
  const scoredCount = (breakdown.scored_dimensions ?? Object.keys(breakdown).filter((k) => k !== "total" && k !== "signal_coverage" && k !== "scored_dimensions" && k !== "dimension_basis")).length;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="bottom" className="p-3 w-56 bg-card border border-card-border shadow-xl">
        <p className="text-xs font-semibold text-foreground mb-1">Signal Profile</p>
        <p className="text-[10px] text-muted-foreground mb-2">
          {scoredCount} of 6 dimensions scored &middot; {Math.round(coverage)}% coverage
        </p>
        <div className="space-y-1.5">
          {dims.map((k) => {
            const val = (breakdown as unknown as Record<string, number>)[k];
            const { text: t, bg: b } = scoreColor(val);
            return (
              <div key={k} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-24 shrink-0">{BREAKDOWN_LABELS[k]}</span>
                <div className="flex-1 h-1.5 rounded-full bg-card-border overflow-hidden">
                  <div className={`h-full rounded-full ${b.replace("/15", "/60")}`} style={{ width: `${val}%` }} />
                </div>
                <span className={`text-[10px] font-mono font-semibold w-7 text-right ${t}`}>{val}</span>
              </div>
            );
          })}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
