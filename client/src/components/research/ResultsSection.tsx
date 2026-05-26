import { useState } from "react";
import { Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ResearchProject } from "@shared/schema";

type ResultsData = {
  mainFindings: string;
  conclusions: string;
  limitations: string;
  implications: string;
};

interface Props {
  project: ResearchProject;
  onSave: (label: string, data: Partial<ResearchProject>) => Promise<void>;
  saving: string | null;
}

export function ResultsSection({ project, onSave, saving }: Props) {
  const stored = project.researchResults as ResultsData | null;
  const [data, setData] = useState<ResultsData>({
    mainFindings: stored?.mainFindings ?? "",
    conclusions: stored?.conclusions ?? "",
    limitations: stored?.limitations ?? "",
    implications: stored?.implications ?? "",
  });

  const fields: Array<{ key: keyof ResultsData; label: string; placeholder: string; rows: number; accent: string }> = [
    {
      key: "mainFindings",
      label: "Main Findings",
      placeholder: "Summarise the primary results of your research. What did the evidence show? State the effect size, direction, and statistical significance where applicable...",
      rows: 5,
      accent: "violet",
    },
    {
      key: "conclusions",
      label: "Conclusions",
      placeholder: "What do you conclude from the findings? Relate back to your research question and hypothesis...",
      rows: 4,
      accent: "emerald",
    },
    {
      key: "limitations",
      label: "Limitations",
      placeholder: "Describe methodological limitations, potential biases, gaps in the evidence base, and how they affect interpretation of results...",
      rows: 3,
      accent: "amber",
    },
    {
      key: "implications",
      label: "Implications",
      placeholder: "What are the clinical, policy, or research implications? Who should act on these findings and how?",
      rows: 3,
      accent: "sky",
    },
  ];

  const accentClasses: Record<string, string> = {
    violet: "border-l-violet-500",
    emerald: "border-l-emerald-500",
    amber: "border-l-amber-500",
    sky: "border-l-sky-500",
  };

  return (
    <div className="space-y-5">
      {fields.map((f) => (
        <div
          key={f.key}
          className={`pl-3 border-l-2 ${accentClasses[f.accent]} space-y-1.5`}
        >
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            {f.label}
          </label>
          <Textarea
            value={data[f.key]}
            onChange={(e) => setData((d) => ({ ...d, [f.key]: e.target.value }))}
            rows={f.rows}
            className="resize-none text-xs"
            placeholder={f.placeholder}
            data-testid={`input-${f.key}`}
          />
        </div>
      ))}

      <div className="flex justify-end">
        <Button
          size="sm"
          className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
          onClick={() => onSave("Results", { researchResults: data })}
          disabled={!!saving}
          data-testid="button-save-results"
        >
          {saving === "Results" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Results
        </Button>
      </div>
    </div>
  );
}
