import { useState } from "react";
import { Save, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ResearchProject } from "@shared/schema";

type RobEntry = {
  paperId: string;
  title: string;
  domains: Array<{ name: string; rating: string; rationale: string }>;
};

type ScreeningPaper = {
  id: string;
  title: string;
  year: string;
  fullTextDecision: "include" | "exclude" | null;
};

const ROB_TOOLS: Record<string, string[]> = {
  "RoB 2.0": [
    "Randomisation process",
    "Deviations from intended interventions",
    "Missing outcome data",
    "Measurement of the outcome",
    "Selection of the reported result",
  ],
  "ROBINS-I": [
    "Confounding",
    "Selection of participants",
    "Classification of interventions",
    "Deviations from intended interventions",
    "Missing data",
    "Measurement of outcomes",
    "Selection of the reported result",
  ],
  "Newcastle-Ottawa": ["Selection", "Comparability", "Outcome / Exposure"],
  GRADE: ["Risk of bias", "Inconsistency", "Indirectness", "Imprecision", "Publication bias"],
};

const RATING_CONFIG = {
  low: { label: "Low", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", dot: "bg-emerald-500" },
  some_concerns: { label: "Some Concerns", color: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30", dot: "bg-amber-500" },
  high: { label: "High", color: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30", dot: "bg-red-500" },
};

type Rating = keyof typeof RATING_CONFIG;

function RatingButton({
  rating,
  active,
  onClick,
}: {
  rating: Rating;
  active: boolean;
  onClick: () => void;
}) {
  const cfg = RATING_CONFIG[rating];
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold border transition-colors ${
        active ? cfg.color : "border-border text-muted-foreground hover:bg-muted/40"
      }`}
    >
      <div className={`w-2 h-2 rounded-full ${active ? cfg.dot : "bg-border"}`} />
      {cfg.label}
    </button>
  );
}

interface Props {
  project: ResearchProject;
  onSave: (label: string, data: Partial<ResearchProject>) => Promise<void>;
  saving: string | null;
}

export function RiskOfBiasSection({ project, onSave, saving }: Props) {
  const includedPapers = ((project.screeningPapers as ScreeningPaper[] | null) ?? []).filter(
    (p) => p.fullTextDecision === "include"
  );
  const storedTool = (project.robTool as string | null) ?? "RoB 2.0";
  const storedRob = (project.riskOfBias as RobEntry[] | null) ?? [];

  const [tool, setTool] = useState(storedTool);
  const [entries, setEntries] = useState<RobEntry[]>(() => {
    const existing = new Map(storedRob.map((e) => [e.paperId, e]));
    return includedPapers.map((p) => {
      const domains = ROB_TOOLS[storedTool].map((name) => {
        const existing_domain = existing.get(p.id)?.domains.find((d) => d.name === name);
        return existing_domain ?? { name, rating: "", rationale: "" };
      });
      return existing.get(p.id) ? { ...existing.get(p.id)!, domains } : { paperId: p.id, title: p.title, domains };
    });
  });
  const [expandedStudy, setExpandedStudy] = useState<string | null>(includedPapers[0]?.id ?? null);

  function switchTool(newTool: string) {
    setTool(newTool);
    setEntries((prev) =>
      prev.map((e) => ({
        ...e,
        domains: ROB_TOOLS[newTool].map((name) => {
          const existing = e.domains.find((d) => d.name === name);
          return existing ?? { name, rating: "", rationale: "" };
        }),
      }))
    );
  }

  function updateDomain(paperId: string, domainName: string, updates: Partial<{ rating: string; rationale: string }>) {
    setEntries((prev) =>
      prev.map((e) =>
        e.paperId === paperId
          ? { ...e, domains: e.domains.map((d) => d.name === domainName ? { ...d, ...updates } : d) }
          : e
      )
    );
  }

  function overallRating(entry: RobEntry): Rating | null {
    const ratings = entry.domains.map((d) => d.rating).filter(Boolean);
    if (ratings.length === 0) return null;
    if (ratings.includes("high")) return "high";
    if (ratings.includes("some_concerns")) return "some_concerns";
    return "low";
  }

  const domains = ROB_TOOLS[tool];

  return (
    <div className="space-y-4">
      {includedPapers.length === 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-center">
          <ShieldAlert className="w-6 h-6 text-amber-500 mx-auto mb-2" />
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">No included studies yet</p>
          <p className="text-[11px] text-muted-foreground mt-1">Complete screening in §5 to populate studies for RoB assessment.</p>
        </div>
      )}

      {/* Tool selector */}
      <div className="space-y-2">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Assessment Tool</label>
        <div className="flex flex-wrap gap-2">
          {Object.keys(ROB_TOOLS).map((t) => (
            <button
              key={t}
              onClick={() => switchTool(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                tool === t
                  ? "bg-violet-600/10 border-violet-500/40 text-violet-600 dark:text-violet-400"
                  : "border-border text-muted-foreground hover:border-violet-500/30"
              }`}
              data-testid={`tool-${t.toLowerCase().replace(/[\s.]+/g, "-")}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Traffic light summary table */}
      {entries.length > 0 && (
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide sticky left-0 bg-muted/30 min-w-[160px]">
                  Study
                </th>
                {domains.map((d) => (
                  <th key={d} className="text-center px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap min-w-[80px]">
                    {d.split(" ").slice(0, 2).join(" ")}
                  </th>
                ))}
                <th className="text-center px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide min-w-[80px]">
                  Overall
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const overall = overallRating(entry);
                return (
                  <tr
                    key={entry.paperId}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/10 cursor-pointer"
                    onClick={() => setExpandedStudy(expandedStudy === entry.paperId ? null : entry.paperId)}
                  >
                    <td className="px-3 py-2 font-medium text-foreground sticky left-0 bg-background">
                      <span className="line-clamp-1">{entry.title}</span>
                    </td>
                    {entry.domains.map((d) => {
                      const cfg = d.rating ? RATING_CONFIG[d.rating as Rating] : null;
                      return (
                        <td key={d.name} className="px-2 py-2 text-center">
                          {cfg ? (
                            <div className={`inline-block w-5 h-5 rounded-full ${cfg.dot}`} title={cfg.label} />
                          ) : (
                            <div className="inline-block w-5 h-5 rounded-full bg-border/40" />
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-center">
                      {overall ? (
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${RATING_CONFIG[overall].color}`}>
                          {RATING_CONFIG[overall].label}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[10px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Expanded study detail */}
      {expandedStudy && entries.find((e) => e.paperId === expandedStudy) && (
        <div className="border border-violet-500/20 rounded-lg p-4 space-y-4 bg-violet-500/3">
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
            {entries.find((e) => e.paperId === expandedStudy)!.title}
          </p>
          {entries.find((e) => e.paperId === expandedStudy)!.domains.map((domain) => (
            <div key={domain.name} className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{domain.name}</p>
              <div className="flex gap-2">
                {(["low", "some_concerns", "high"] as Rating[]).map((r) => (
                  <RatingButton
                    key={r}
                    rating={r}
                    active={domain.rating === r}
                    onClick={() => updateDomain(expandedStudy, domain.name, { rating: r })}
                  />
                ))}
              </div>
              <Textarea
                value={domain.rationale}
                onChange={(e) => updateDomain(expandedStudy, domain.name, { rationale: e.target.value })}
                rows={2}
                className="resize-none text-xs"
                placeholder={`Justification for ${domain.name} rating...`}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          size="sm"
          className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
          onClick={() => onSave("Risk of Bias", { riskOfBias: entries as any, robTool: tool })}
          disabled={!!saving}
          data-testid="button-save-rob"
        >
          {saving === "Risk of Bias" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Assessment
        </Button>
      </div>
    </div>
  );
}
