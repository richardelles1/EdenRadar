import { Sparkles, Clock, Activity, Key, Target, Shield } from "lucide-react";

interface ScoreBreakdown {
  novelty: number;
  freshness: number;
  readiness: number;
  licensability: number;
  fit: number;
  competition: number;
  total: number;
}

interface ScoreBreakdownCardProps {
  breakdown: ScoreBreakdown;
  className?: string;
}

const DIMS = [
  { key: "novelty" as const, label: "Novelty", icon: Sparkles, description: "How novel the mechanism/target appears", weight: "20%" },
  { key: "freshness" as const, label: "Freshness", icon: Clock, description: "Recency of latest signal", weight: "15%" },
  { key: "readiness" as const, label: "Readiness", icon: Activity, description: "Clinical development stage", weight: "15%" },
  { key: "licensability" as const, label: "Licensability", icon: Key, description: "Likelihood of licensing access", weight: "25%" },
  { key: "fit" as const, label: "Buyer Fit", icon: Target, description: "Alignment with your thesis", weight: "15%" },
  { key: "competition" as const, label: "Low Competition", icon: Shield, description: "Absence of competitive threat", weight: "10%" },
];

function scoreColor(score: number) {
  if (score >= 75) return { bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" };
  if (score >= 55) return { bar: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" };
  if (score >= 35) return { bar: "bg-orange-500", text: "text-orange-700 dark:text-orange-400" };
  return { bar: "bg-rose-500", text: "text-rose-700 dark:text-rose-400" };
}

export function ScoreBreakdownCard({ breakdown, className = "" }: ScoreBreakdownCardProps) {
  return (
    <div className={`rounded-lg border border-card-border bg-card/50 p-4 ${className}`} data-testid="score-breakdown-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Score Breakdown</h3>
        <div className="text-xs text-muted-foreground">
          Total: <span className="font-bold text-foreground">{Math.round(breakdown.total)}</span>/100
        </div>
      </div>
      <div className="space-y-3">
        {DIMS.map(({ key, label, icon: Icon, description, weight }) => {
          const val = breakdown[key];
          const { bar, text } = scoreColor(val);
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon className={`w-3 h-3 ${text}`} />
                  <span className="text-xs font-medium text-foreground">{label}</span>
                  <span className="text-[10px] text-muted-foreground">({weight})</span>
                </div>
                <span className={`text-xs font-mono font-bold ${text}`}>{Math.round(val)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-card-border overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${bar} opacity-75`}
                  style={{ width: `${val}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground/70">{description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
