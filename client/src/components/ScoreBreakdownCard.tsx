import { Sparkles, Clock, Activity, Key, Target, Shield } from "lucide-react";

interface ScoreBreakdown {
  novelty: number;
  freshness: number;
  readiness: number;
  licensability: number;
  fit: number;
  competition: number;
  total: number;
  signal_coverage?: number;
  scored_dimensions?: string[];
  dimension_basis?: Record<string, string>;
}

interface ScoreBreakdownCardProps {
  breakdown: ScoreBreakdown;
  className?: string;
}

const DIMS = [
  { key: "novelty" as const,       label: "Novelty",        icon: Sparkles, weight: "20%", fallback: "How novel the mechanism/target appears" },
  { key: "freshness" as const,     label: "Freshness",      icon: Clock,    weight: "15%", fallback: "Recency of latest signal" },
  { key: "readiness" as const,     label: "Readiness",      icon: Activity, weight: "15%", fallback: "Clinical development stage" },
  { key: "licensability" as const, label: "Licensability",  icon: Key,      weight: "25%", fallback: "Likelihood of licensing access" },
  { key: "fit" as const,           label: "Buyer Fit",      icon: Target,   weight: "15%", fallback: "Alignment with your thesis" },
  { key: "competition" as const,   label: "Low Competition",icon: Shield,   weight: "10%", fallback: "Absence of competitive threat" },
];

function scoreColor(score: number) {
  if (score >= 75) return { bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" };
  if (score >= 55) return { bar: "bg-amber-500",   text: "text-amber-700 dark:text-amber-400" };
  if (score >= 35) return { bar: "bg-orange-500",  text: "text-orange-700 dark:text-orange-400" };
  return            { bar: "bg-rose-500",           text: "text-rose-700 dark:text-rose-400" };
}

export function ScoreBreakdownCard({ breakdown, className = "" }: ScoreBreakdownCardProps) {
  const scoredDimsRaw = breakdown.scored_dimensions;
  const scoredDims = scoredDimsRaw ?? [];
  const isLegacyPayload = scoredDimsRaw === undefined;
  const basis = breakdown.dimension_basis ?? {};
  const hasScore = breakdown.total > 0 || scoredDims.length > 0;

  const scoredRows = isLegacyPayload
    ? DIMS
    : DIMS.filter(({ key }) => scoredDims.includes(key));

  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className}`} data-testid="score-breakdown-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Signal Profile</h3>
        {hasScore ? (
          <div className="text-xs text-muted-foreground">
            <span className="font-bold text-foreground">{Math.round(breakdown.total)}</span>
            <span className="text-muted-foreground/60"> / 100</span>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground italic">not scored</span>
        )}
      </div>

      {!hasScore && (
        <p className="text-[11px] text-muted-foreground py-2">
          Run a search to generate the Signal Profile for this asset.
        </p>
      )}

      {hasScore && scoredRows.length === 0 && (
        <p className="text-[11px] text-muted-foreground py-2">
          Signal profile will generate after your first search.
        </p>
      )}

      {hasScore && scoredRows.length > 0 && (
        <div className="space-y-3">
          {scoredRows.map(({ key, label, icon: Icon, fallback }) => {
            const val = breakdown[key];
            const { bar, text } = scoreColor(val);
            const basisText = basis[key] ?? fallback;

            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-3 h-3 ${text}`} />
                    <span className="text-xs font-medium text-foreground">{label}</span>
                  </div>
                  <span className={`text-xs font-mono font-bold ${text}`}>{Math.round(val)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-border overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${bar} opacity-80`}
                    style={{ width: `${val}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/70">{basisText}</p>
              </div>
            );
          })}

          {!isLegacyPayload && scoredRows.length < DIMS.length && scoredRows.length <= 2 && (
            <p className="text-[10px] text-muted-foreground/60 pt-1 border-t border-border">
              {scoredRows.length} of 6 signals available
            </p>
          )}
        </div>
      )}
    </div>
  );
}
