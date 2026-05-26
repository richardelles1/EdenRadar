import { useState } from "react";
import { Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ResearchProject } from "@shared/schema";

type SynthesisData = {
  narrative: string;
  heterogeneity: string;
  strengthOfEvidence: string;
  certaintyGrade: string;
};

const CERTAINTY_OPTIONS = [
  { value: "high", label: "High", description: "Very confident the true effect lies close to the estimate.", color: "emerald" },
  { value: "moderate", label: "Moderate", description: "Moderate confidence; true effect likely close but may be substantially different.", color: "sky" },
  { value: "low", label: "Low", description: "Limited confidence; true effect may be substantially different.", color: "amber" },
  { value: "very_low", label: "Very Low", description: "Very little confidence; true effect likely substantially different.", color: "red" },
];

const STRENGTH_OPTIONS = [
  "Conclusive — strong consistent evidence from multiple high-quality studies",
  "Suggestive — moderate evidence with some inconsistency",
  "Insufficient — limited evidence, high risk of bias, or conflicting results",
  "Emerging — promising early data, awaiting replication",
];

interface Props {
  project: ResearchProject;
  onSave: (label: string, data: Partial<ResearchProject>) => Promise<void>;
  saving: string | null;
}

export function EvidenceSynthesisSection({ project, onSave, saving }: Props) {
  const stored = project.evidenceSynthesisText as SynthesisData | null;
  const [data, setData] = useState<SynthesisData>({
    narrative: stored?.narrative ?? "",
    heterogeneity: stored?.heterogeneity ?? "",
    strengthOfEvidence: stored?.strengthOfEvidence ?? "",
    certaintyGrade: stored?.certaintyGrade ?? "",
  });

  const included = ((project.screeningPapers as any[] | null) ?? []).filter(
    (p: any) => p.fullTextDecision === "include"
  );
  const extracted = (project.extractedData as any[] | null) ?? [];
  const extractionFields = (project.extractionFields as any[] | null) ?? [];

  return (
    <div className="space-y-6">
      {/* Included studies summary */}
      {included.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/10 p-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="text-center">
              <p className="text-2xl font-bold tabular-nums text-foreground">{included.length}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Studies included</p>
            </div>
            {extracted.length > 0 && (
              <div className="text-center">
                <p className="text-2xl font-bold tabular-nums text-foreground">{extracted.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Extracted</p>
              </div>
            )}
            {extractionFields.length > 0 && (
              <div className="text-center">
                <p className="text-2xl font-bold tabular-nums text-foreground">{extractionFields.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Data fields</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Certainty grade */}
      <div className="space-y-2">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Certainty of Evidence (GRADE)
        </label>
        <div className="grid grid-cols-2 gap-2">
          {CERTAINTY_OPTIONS.map((opt) => {
            const active = data.certaintyGrade === opt.value;
            const colors: Record<string, string> = {
              emerald: active ? "border-emerald-500/50 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300" : "border-border hover:border-emerald-500/30",
              sky: active ? "border-sky-500/50 bg-sky-500/8 text-sky-700 dark:text-sky-300" : "border-border hover:border-sky-500/30",
              amber: active ? "border-amber-500/50 bg-amber-500/8 text-amber-700 dark:text-amber-300" : "border-border hover:border-amber-500/30",
              red: active ? "border-red-500/50 bg-red-500/8 text-red-700 dark:text-red-300" : "border-border hover:border-red-500/30",
            };
            return (
              <button
                key={opt.value}
                onClick={() => setData((d) => ({ ...d, certaintyGrade: opt.value }))}
                className={`text-left p-3 rounded-lg border transition-colors ${colors[opt.color]} ${!active ? "text-muted-foreground" : ""}`}
                data-testid={`certainty-${opt.value}`}
              >
                <p className="text-xs font-bold">{opt.label}</p>
                <p className="text-[10px] leading-relaxed mt-0.5">{opt.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Strength of evidence */}
      <div className="space-y-2">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Strength of Evidence</label>
        <div className="space-y-1.5">
          {STRENGTH_OPTIONS.map((opt) => {
            const active = data.strengthOfEvidence === opt;
            return (
              <button
                key={opt}
                onClick={() => setData((d) => ({ ...d, strengthOfEvidence: opt }))}
                className={`w-full text-left px-3 py-2 rounded-md text-xs border transition-colors ${
                  active
                    ? "bg-violet-500/10 border-violet-500/40 text-violet-700 dark:text-violet-300 font-semibold"
                    : "border-border text-muted-foreground hover:border-violet-500/20 hover:text-foreground"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Narrative synthesis */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Narrative Synthesis</label>
        <Textarea
          value={data.narrative}
          onChange={(e) => setData((d) => ({ ...d, narrative: e.target.value }))}
          rows={6}
          className="resize-none text-xs"
          placeholder="Describe how studies were combined, key patterns, convergent and divergent findings across the body of evidence..."
          data-testid="input-narrative"
        />
      </div>

      {/* Heterogeneity */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Heterogeneity & Subgroup Notes
        </label>
        <Textarea
          value={data.heterogeneity}
          onChange={(e) => setData((d) => ({ ...d, heterogeneity: e.target.value }))}
          rows={3}
          className="resize-none text-xs"
          placeholder="Describe variation across studies (clinical, methodological, statistical heterogeneity), subgroup analyses, sensitivity analyses..."
          data-testid="input-heterogeneity"
        />
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
          onClick={() => onSave("Evidence Synthesis", { evidenceSynthesisText: data })}
          disabled={!!saving}
          data-testid="button-save-synthesis"
        >
          {saving === "Evidence Synthesis" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Synthesis
        </Button>
      </div>
    </div>
  );
}
