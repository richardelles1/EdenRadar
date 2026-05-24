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
    search_relevance?: number;
    record_quality?: number;
    availability?: number;
    fit_bonus?: number;
    total: number;
    signal_coverage?: number;
    scored_dimensions?: string[];
  };
  size?: "sm" | "md" | "lg";
  /** Display score as X / 10 instead of raw / 100 */
  tenScale?: boolean;
}

function scoreColor(score: number): { bg: string; text: string; ring: string } {
  if (score >= 75) return { bg: "bg-emerald-500", text: "text-white", ring: "ring-emerald-600/50" };
  if (score >= 55) return { bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-400", ring: "ring-emerald-500/30" };
  return { bg: "bg-muted", text: "text-muted-foreground", ring: "ring-border" };
}

const BREAKDOWN_LABELS: Record<string, string> = {
  search_relevance: "Query Match",
  record_quality:   "Data Quality",
  availability:     "Availability",
  novelty:          "Novelty",
  readiness:        "Readiness",
  licensability:    "Licensability",
  freshness:        "Freshness",
};

// Dimensions shown as bars in the TTO tooltip
const TTO_DIMS    = ["search_relevance", "record_quality", "availability"] as const;
// Dimensions shown as bars in the legacy (non-TTO) tooltip
const LEGACY_DIMS = ["novelty", "readiness", "licensability"] as const;

export function ScoreBadge({ score, breakdown, size = "md", tenScale = false }: ScoreBadgeProps) {
  const isUnscored = score === 0 || (breakdown?.signal_coverage ?? 0) === 0;
  const { bg, text, ring } = isUnscored
    ? { bg: "bg-muted", text: "text-muted-foreground", ring: "ring-border" }
    : scoreColor(score);
  const sizeClass = size === "sm" ? "text-[10px] px-1.5 py-0.5" : size === "lg" ? "text-sm px-3 py-1.5" : "text-xs px-2 py-1";
  const displayScore = tenScale ? Math.max(1, Math.round(score / 10)) : Math.round(score);
  const displayMax = tenScale ? "/ 10" : "/ 100";

  const badge = (
    <div
      className={`inline-flex items-center gap-1 rounded-md font-bold ring-1 ${bg} ${text} ${ring} ${sizeClass} cursor-default`}
      data-testid="score-badge"
    >
      {isUnscored ? (
        <span className="font-mono opacity-60">–</span>
      ) : (
        <>
          <span className="font-mono">{displayScore}</span>
          <span className="opacity-60 font-normal text-[0.7em]">{displayMax}</span>
        </>
      )}
    </div>
  );

  if (!breakdown) return badge;

  const scoredDims = breakdown.scored_dimensions ?? [];
  const isTTO = scoredDims.includes("record_quality") || scoredDims.includes("search_relevance");
  const preferredDims: readonly string[] = isTTO ? TTO_DIMS : LEGACY_DIMS;
  const fitBonus = breakdown.fit_bonus ?? 0;

  const dims = preferredDims.filter(
    (k) => k in breakdown && (breakdown as unknown as Record<string, number>)[k] > 0
  );

  if (dims.length === 0 && fitBonus === 0) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="bottom" className="p-3 w-56 bg-card border border-card-border shadow-xl">
        <p className="text-xs font-semibold text-foreground mb-2">Signal Profile</p>
        <div className="space-y-1.5">
          {dims.map((k) => {
            const val = (breakdown as unknown as Record<string, number>)[k];
            const { text: t, bg: b } = scoreColor(val);
            return (
              <div key={k} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-24 shrink-0">{BREAKDOWN_LABELS[k] ?? k}</span>
                <div className="flex-1 h-1.5 rounded-full bg-card-border overflow-hidden">
                  <div className={`h-full rounded-full ${b.replace("/15", "/60")}`} style={{ width: `${val}%` }} />
                </div>
                <span className={`text-[10px] font-mono font-semibold w-7 text-right ${t}`}>{val}</span>
              </div>
            );
          })}
        </div>
        {fitBonus > 0 && (
          <div className="mt-2 pt-2 border-t border-card-border flex items-center gap-1.5">
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
              +{fitBonus} thesis match
            </span>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
