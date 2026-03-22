import { Sparkles, Clock, Activity, Key, Target, Shield, AlertCircle } from "lucide-react";

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
  { key: "novelty" as const,      label: "Novelty",          icon: Sparkles,  weight: "20%", fallback: "How novel the mechanism/target appears" },
  { key: "freshness" as const,    label: "Freshness",         icon: Clock,     weight: "15%", fallback: "Recency of latest signal" },
  { key: "readiness" as const,    label: "Readiness",         icon: Activity,  weight: "15%", fallback: "Clinical development stage" },
  { key: "licensability" as const,label: "Licensability",     icon: Key,       weight: "25%", fallback: "Likelihood of licensing access" },
  { key: "fit" as const,          label: "Buyer Fit",         icon: Target,    weight: "15%", fallback: "Alignment with your thesis" },
  { key: "competition" as const,  label: "Low Competition",   icon: Shield,    weight: "10%", fallback: "Absence of competitive threat" },
];

function scoreColor(score: number) {
  if (score >= 75) return { bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" };
  if (score >= 55) return { bar: "bg-amber-500",   text: "text-amber-700 dark:text-amber-400" };
  if (score >= 35) return { bar: "bg-orange-500",  text: "text-orange-700 dark:text-orange-400" };
  return            { bar: "bg-rose-500",           text: "text-rose-700 dark:text-rose-400" };
}

function coverageLabel(pct: number): { label: string; color: string } {
  if (pct >= 75) return { label: "High signal coverage",    color: "text-emerald-600 dark:text-emerald-400" };
  if (pct >= 50) return { label: "Moderate signal coverage", color: "text-amber-600 dark:text-amber-400" };
  return               { label: "Limited signal coverage",   color: "text-rose-600 dark:text-rose-400" };
}

export function ScoreBreakdownCard({ breakdown, className = "" }: ScoreBreakdownCardProps) {
  const coverage = breakdown.signal_coverage ?? 100;
  const scoredDims = breakdown.scored_dimensions ?? DIMS.map((d) => d.key);
  const basis = breakdown.dimension_basis ?? {};
  const { label: covLabel, color: covColor } = coverageLabel(coverage);

  return (
    <div className={`rounded-lg border border-card-border bg-card/50 p-4 ${className}`} data-testid="score-breakdown-card">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-foreground">Signal Profile</h3>
        <div className="text-xs text-muted-foreground">
          Score: <span className="font-bold text-foreground">{Math.round(breakdown.total)}</span>/100
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-4">
        <div className="flex-1 h-1 rounded-full bg-card-border overflow-hidden">
          <div
            className="h-full rounded-full bg-primary/40 transition-all duration-700"
            style={{ width: `${coverage}%` }}
          />
        </div>
        <span className={`text-[10px] font-medium ${covColor}`}>
          {covLabel} ({Math.round(coverage)}%)
        </span>
      </div>

      <div className="space-y-3">
        {DIMS.map(({ key, label, icon: Icon, weight, fallback }) => {
          const scored = scoredDims.includes(key);
          const val = breakdown[key];
          const { bar, text } = scoreColor(val);
          const basisText = basis[key] ?? fallback;

          if (!scored) {
            return (
              <div key={key} className="space-y-1 opacity-45">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">{label}</span>
                    <span className="text-[10px] text-muted-foreground/60">({weight})</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground italic">not scored</span>
                </div>
                <div className="h-1.5 rounded-full bg-card-border" />
                <p className="text-[10px] text-muted-foreground/60">{basisText}</p>
              </div>
            );
          }

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
              <p className="text-[10px] text-muted-foreground/70">{basisText}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
