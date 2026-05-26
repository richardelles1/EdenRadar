import { useState } from "react";
import { Plus, X, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ResearchProject } from "@shared/schema";

type DisseminationData = {
  targetJournals: string[];
  conferenceTargets: string[];
  preprintStrategy: string;
  timelineToSubmit: string;
  openAccessPlan: string;
  dataSharePlan: string;
};

const TIMELINE_OPTIONS = ["< 3 months", "3–6 months", "6–12 months", "12–18 months", "18+ months"];
const OPEN_ACCESS_OPTIONS = [
  "Gold OA — publish in fully OA journal",
  "Green OA — self-archive in repository",
  "Hybrid OA — pay APC in subscription journal",
  "Diamond OA — no cost to author or reader",
  "Not planned",
];

function TagList({
  tags,
  onChange,
  placeholder,
  testId,
}: {
  tags: string[];
  onChange: (t: string[]) => void;
  placeholder: string;
  testId: string;
}) {
  const [input, setInput] = useState("");
  function add() {
    const v = input.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput("");
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="text-xs flex-1"
          data-testid={testId}
        />
        <Button variant="outline" size="sm" onClick={add} disabled={!input.trim()} className="px-2">
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t, i) => (
            <span
              key={i}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-muted/60 border border-border text-xs text-foreground"
            >
              {t}
              <button onClick={() => onChange(tags.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  project: ResearchProject;
  onSave: (label: string, data: Partial<ResearchProject>) => Promise<void>;
  saving: string | null;
}

export function DisseminationSection({ project, onSave, saving }: Props) {
  const stored = project.disseminationPlan as DisseminationData | null;
  const [data, setData] = useState<DisseminationData>({
    targetJournals: stored?.targetJournals ?? [],
    conferenceTargets: stored?.conferenceTargets ?? [],
    preprintStrategy: stored?.preprintStrategy ?? "",
    timelineToSubmit: stored?.timelineToSubmit ?? "",
    openAccessPlan: stored?.openAccessPlan ?? "",
    dataSharePlan: stored?.dataSharePlan ?? "",
  });

  return (
    <div className="space-y-6">
      {/* Target journals */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Target Journals</label>
        <TagList
          tags={data.targetJournals}
          onChange={(t) => setData((d) => ({ ...d, targetJournals: t }))}
          placeholder="e.g. Nature Medicine, NEJM, JAMA... press Enter"
          testId="input-target-journals"
        />
      </div>

      {/* Conference targets */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Conference Targets</label>
        <TagList
          tags={data.conferenceTargets}
          onChange={(t) => setData((d) => ({ ...d, conferenceTargets: t }))}
          placeholder="e.g. ASCO 2025, ASHP Midyear... press Enter"
          testId="input-conference-targets"
        />
      </div>

      {/* Preprint strategy */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Preprint Strategy</label>
        <Textarea
          value={data.preprintStrategy}
          onChange={(e) => setData((d) => ({ ...d, preprintStrategy: e.target.value }))}
          rows={3}
          className="resize-none text-xs"
          placeholder="Will you post a preprint? Where (bioRxiv, medRxiv, SSRN)? Before or after peer review?"
          data-testid="input-preprint-strategy"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Timeline */}
        <div className="space-y-2">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Timeline to First Submission</label>
          <div className="space-y-1.5">
            {TIMELINE_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setData((d) => ({ ...d, timelineToSubmit: opt }))}
                className={`w-full text-left px-3 py-2 rounded-md text-xs border transition-colors ${
                  data.timelineToSubmit === opt
                    ? "bg-violet-600/10 border-violet-500/40 text-violet-700 dark:text-violet-300 font-semibold"
                    : "border-border text-muted-foreground hover:border-violet-500/20 hover:text-foreground"
                }`}
                data-testid={`timeline-${opt.replace(/[<>–\s]+/g, "-").toLowerCase()}`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Open access plan */}
        <div className="space-y-2">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Open Access Plan</label>
          <div className="space-y-1.5">
            {OPEN_ACCESS_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setData((d) => ({ ...d, openAccessPlan: opt }))}
                className={`w-full text-left px-3 py-2 rounded-md text-xs border transition-colors ${
                  data.openAccessPlan === opt
                    ? "bg-emerald-600/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-semibold"
                    : "border-border text-muted-foreground hover:border-emerald-500/20 hover:text-foreground"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Data sharing plan */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Data Sharing Plan</label>
        <Textarea
          value={data.dataSharePlan}
          onChange={(e) => setData((d) => ({ ...d, dataSharePlan: e.target.value }))}
          rows={3}
          className="resize-none text-xs"
          placeholder="Will de-identified data be shared? Where (Zenodo, OSF, Dryad)? Under what license? Any embargo period?"
          data-testid="input-data-share-plan"
        />
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
          onClick={() => onSave("Dissemination", { disseminationPlan: data })}
          disabled={!!saving}
          data-testid="button-save-dissemination"
        >
          {saving === "Dissemination" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Plan
        </Button>
      </div>
    </div>
  );
}
