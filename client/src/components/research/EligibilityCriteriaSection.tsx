import { useState } from "react";
import { Plus, X, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ResearchProject } from "@shared/schema";

type EligibilityData = {
  inclusion: string[];
  exclusion: string[];
  studyDesigns: string[];
  populationCriteria: string;
  mechanismTags: string[];
};

const STUDY_DESIGN_OPTIONS = [
  "Randomised Controlled Trial (RCT)",
  "Systematic Review / Meta-analysis",
  "Cohort Study",
  "Case-Control Study",
  "Cross-sectional Study",
  "Case Series / Case Report",
  "Qualitative Study",
  "Animal Study",
  "In Vitro Study",
  "Other",
];

const MECHANISM_TAGS = [
  "aberrant kinase signaling", "cell cycle dysregulation", "epigenetic dysregulation",
  "dna damage response deficiency", "immune evasion", "apoptosis resistance",
  "oncogenic transcription", "angiogenesis", "tumor microenvironment",
  "protein aggregation", "neuroinflammation", "synaptic dysfunction",
  "mitochondrial dysfunction", "myelin disruption", "neuronal excitotoxicity",
  "autoimmune dysregulation", "cytokine dysregulation", "complement dysregulation",
  "allergic dysregulation", "immune deficiency",
  "insulin resistance", "lipid metabolism dysfunction", "enzyme deficiency", "hormonal dysregulation",
  "gene expression deficiency", "ion channel dysfunction", "structural protein defect", "rna splicing defect",
  "pathogen replication", "antimicrobial resistance",
  "fibrosis", "ischemia and oxidative stress",
];

interface Props {
  project: ResearchProject;
  onSave: (label: string, data: Partial<ResearchProject>) => Promise<void>;
  saving: string | null;
}

export function EligibilityCriteriaSection({ project, onSave, saving }: Props) {
  const stored = project.eligibilityCriteria as EligibilityData | null;
  const [data, setData] = useState<EligibilityData>({
    inclusion: stored?.inclusion ?? [],
    exclusion: stored?.exclusion ?? [],
    studyDesigns: stored?.studyDesigns ?? [],
    populationCriteria: stored?.populationCriteria ?? "",
    mechanismTags: stored?.mechanismTags ?? [],
  });
  const [inclusionInput, setInclusionInput] = useState("");
  const [exclusionInput, setExclusionInput] = useState("");

  function addCriterion(type: "inclusion" | "exclusion", input: string, setInput: (v: string) => void) {
    const v = input.trim();
    if (!v) return;
    setData((d) => ({ ...d, [type]: [...d[type], v] }));
    setInput("");
  }

  function removeCriterion(type: "inclusion" | "exclusion", i: number) {
    setData((d) => ({ ...d, [type]: d[type].filter((_, j) => j !== i) }));
  }

  function toggleStudyDesign(design: string) {
    setData((d) => ({
      ...d,
      studyDesigns: d.studyDesigns.includes(design) ? d.studyDesigns.filter((s) => s !== design) : [...d.studyDesigns, design],
    }));
  }

  function toggleMechanism(tag: string) {
    setData((d) => ({
      ...d,
      mechanismTags: d.mechanismTags.includes(tag) ? d.mechanismTags.filter((t) => t !== tag) : [...d.mechanismTags, tag],
    }));
  }

  return (
    <div className="space-y-6">
      {/* Inclusion / Exclusion split */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Inclusion */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Inclusion Criteria</span>
          </div>
          <div className="space-y-1.5">
            {data.inclusion.map((c, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-emerald-500/5 border border-emerald-500/15 group">
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0">I{i + 1}</span>
                <span className="flex-1 text-xs text-foreground">{c}</span>
                <button onClick={() => removeCriterion("inclusion", i)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={inclusionInput}
              onChange={(e) => setInclusionInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCriterion("inclusion", inclusionInput, setInclusionInput); } }}
              placeholder="Add inclusion criterion..."
              className="text-xs flex-1"
              data-testid="input-inclusion"
            />
            <Button variant="outline" size="sm" onClick={() => addCriterion("inclusion", inclusionInput, setInclusionInput)} disabled={!inclusionInput.trim()} className="border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 px-2">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Exclusion */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest">Exclusion Criteria</span>
          </div>
          <div className="space-y-1.5">
            {data.exclusion.map((c, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-red-500/5 border border-red-500/15 group">
                <span className="text-[10px] font-bold text-red-500 dark:text-red-400 mt-0.5 shrink-0">E{i + 1}</span>
                <span className="flex-1 text-xs text-foreground">{c}</span>
                <button onClick={() => removeCriterion("exclusion", i)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={exclusionInput}
              onChange={(e) => setExclusionInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCriterion("exclusion", exclusionInput, setExclusionInput); } }}
              placeholder="Add exclusion criterion..."
              className="text-xs flex-1"
              data-testid="input-exclusion"
            />
            <Button variant="outline" size="sm" onClick={() => addCriterion("exclusion", exclusionInput, setExclusionInput)} disabled={!exclusionInput.trim()} className="border-red-500/30 text-red-500 hover:bg-red-500/10 px-2">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Study designs */}
      <div className="space-y-2">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Eligible Study Designs</label>
        <div className="flex flex-wrap gap-2" data-testid="study-designs">
          {STUDY_DESIGN_OPTIONS.map((design) => {
            const active = data.studyDesigns.includes(design);
            return (
              <button
                key={design}
                onClick={() => toggleStudyDesign(design)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  active ? "bg-violet-600/10 border-violet-500/40 text-violet-600 dark:text-violet-400"
                  : "border-border text-muted-foreground hover:border-violet-500/30 hover:text-foreground"
                }`}
                data-testid={`design-${design.toLowerCase().replace(/[\s/()]+/g, "-")}`}
              >
                {design}
              </button>
            );
          })}
        </div>
      </div>

      {/* Population criteria */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Population / Setting Criteria</label>
        <Textarea
          value={data.populationCriteria}
          onChange={(e) => setData((d) => ({ ...d, populationCriteria: e.target.value }))}
          rows={3}
          className="resize-none text-xs"
          placeholder="Describe the target population, clinical setting, age range, geographic restrictions..."
          data-testid="input-population-criteria"
        />
      </div>

      {/* Mechanism / Biology tags */}
      <div className="space-y-2 pt-1 border-t border-border/50">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Mechanism / Biology Tags</label>
          {data.mechanismTags.length > 0 && (
            <span className="text-[10px] font-semibold text-sky-600 dark:text-sky-400">{data.mechanismTags.length} selected</span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Tag the biological mechanisms relevant to your PICO. Shared with EdenRadar's canonical biology taxonomy for cross-platform discoverability.
        </p>
        <div className="flex flex-wrap gap-1.5" data-testid="mechanism-tags">
          {MECHANISM_TAGS.map((tag) => {
            const active = data.mechanismTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleMechanism(tag)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors capitalize ${
                  active
                    ? "bg-sky-500/10 border-sky-500/40 text-sky-700 dark:text-sky-300"
                    : "border-border/60 text-muted-foreground hover:border-sky-500/30 hover:text-foreground"
                }`}
                data-testid={`tag-${tag.replace(/\s+/g, "-")}`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => onSave("Eligibility Criteria", { eligibilityCriteria: data as any })} disabled={!!saving} data-testid="button-save-eligibility">
          {saving === "Eligibility Criteria" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Criteria
        </Button>
      </div>
    </div>
  );
}
