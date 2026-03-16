import { useState, useEffect } from "react";
import {
  Plus, X, Save, Loader2, Check, Clock, AlertTriangle,
  Lightbulb, GitBranch, Calendar, Copy, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { ResearchProject } from "@shared/schema";

type Hypothesis = {
  id: string;
  statement: string;
  independentVars: string;
  dependentVars: string;
  expectedOutcome: string;
  nullHypothesis: string;
  evidenceNotes: string;
  status: string;
  confidence: string;
};

type FishboneData = {
  effect: string;
  branches: Record<string, string[]>;
};

type Milestone = {
  id: string;
  label: string;
  targetDate: string;
  completed: boolean;
};

const HYPOTHESIS_STATUSES = ["Draft", "Testing", "Supported", "Refuted", "Revised"];
const CONFIDENCE_LEVELS = ["Low", "Medium", "High"];
const FISHBONE_BRANCHES = ["Methods", "Materials", "Machines", "Measurement", "People", "Environment"];

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30",
  Testing: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
  Supported: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  Refuted: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
  Revised: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
};

interface ResearchToolsProps {
  project: ResearchProject;
  onSave: (label: string, data: Partial<ResearchProject>) => Promise<void>;
  saving: string | null;
}

export default function ResearchTools({ project, onSave, saving }: ResearchToolsProps) {
  const [activeTab, setActiveTab] = useState<"hypotheses" | "fishbone" | "timeline">("hypotheses");

  const tabs = [
    { key: "hypotheses" as const, label: "Hypotheses", icon: Lightbulb },
    { key: "fishbone" as const, label: "Fishbone", icon: GitBranch },
    { key: "timeline" as const, label: "Timeline", icon: Calendar },
  ];

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden" data-testid="section-research-tools">
      <div className="px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-5 h-5 rounded-full bg-violet-600/10 text-violet-600 dark:text-violet-400 text-[10px] font-bold flex items-center justify-center shrink-0">
            T
          </span>
          <span className="text-sm font-semibold text-foreground">Research Tools</span>
        </div>
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              data-testid={`tab-${t.key}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === t.key
                  ? "bg-violet-600/10 text-violet-600 dark:text-violet-400 border border-violet-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-transparent"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-4 pt-3">
        {activeTab === "hypotheses" && (
          <HypothesesTab project={project} onSave={onSave} saving={saving} />
        )}
        {activeTab === "fishbone" && (
          <FishboneTab project={project} onSave={onSave} saving={saving} />
        )}
        {activeTab === "timeline" && (
          <TimelineTab project={project} onSave={onSave} saving={saving} />
        )}
      </div>
    </div>
  );
}

function ToolSaveButton({ label, saving, onClick }: { label: string; saving: string | null; onClick: () => void }) {
  const isSaving = saving === label;
  return (
    <div className="flex justify-end pt-2">
      <Button
        size="sm"
        className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
        onClick={onClick}
        disabled={!!saving}
        data-testid={`button-save-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        Save {label}
      </Button>
    </div>
  );
}

function HypothesesTab({ project, onSave, saving }: ResearchToolsProps) {
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setHypotheses((project.hypotheses as Hypothesis[] | null) ?? []);
  }, [project.hypotheses]);

  function addHypothesis() {
    const h: Hypothesis = {
      id: crypto.randomUUID(),
      statement: "",
      independentVars: "",
      dependentVars: "",
      expectedOutcome: "",
      nullHypothesis: "",
      evidenceNotes: "",
      status: "Draft",
      confidence: "Low",
    };
    setHypotheses((prev) => [...prev, h]);
    setExpanded(h.id);
  }

  function updateHypothesis(id: string, updates: Partial<Hypothesis>) {
    setHypotheses((prev) => prev.map((h) => h.id === id ? { ...h, ...updates } : h));
  }

  function removeHypothesis(id: string) {
    setHypotheses((prev) => prev.filter((h) => h.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Build and track structured hypotheses for your research.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={addHypothesis}
          disabled={!!saving}
          data-testid="button-add-hypothesis"
        >
          <Plus className="w-3.5 h-3.5" /> Add Hypothesis
        </Button>
      </div>

      {hypotheses.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No hypotheses yet. Click "Add Hypothesis" to create your first one.
        </div>
      )}

      {hypotheses.map((h, i) => {
        const isExpanded = expanded === h.id;
        return (
          <div
            key={h.id}
            className="border border-border rounded-md bg-background overflow-hidden"
            data-testid={`hypothesis-${i}`}
          >
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-accent/40 transition-colors"
              onClick={() => setExpanded(isExpanded ? null : h.id)}
              data-testid={`toggle-hypothesis-${i}`}
            >
              <span className="text-xs font-bold text-muted-foreground w-5">H{i + 1}</span>
              <span className="flex-1 text-left text-sm text-foreground truncate">
                {h.statement || "Untitled hypothesis"}
              </span>
              <Badge className={`text-[10px] shrink-0 ${STATUS_COLORS[h.status] ?? STATUS_COLORS.Draft}`}>
                {h.status}
              </Badge>
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
            {isExpanded && (
              <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/50">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Statement</label>
                  <Textarea
                    value={h.statement}
                    onChange={(e) => updateHypothesis(h.id, { statement: e.target.value })}
                    rows={2}
                    className="resize-none text-xs"
                    placeholder="If X, then Y because Z..."
                    data-testid={`input-hypothesis-statement-${i}`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Independent Variables</label>
                    <Input
                      value={h.independentVars}
                      onChange={(e) => updateHypothesis(h.id, { independentVars: e.target.value })}
                      className="text-xs"
                      placeholder="e.g., Drug concentration"
                      data-testid={`input-hypothesis-iv-${i}`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Dependent Variables</label>
                    <Input
                      value={h.dependentVars}
                      onChange={(e) => updateHypothesis(h.id, { dependentVars: e.target.value })}
                      className="text-xs"
                      placeholder="e.g., Cell viability"
                      data-testid={`input-hypothesis-dv-${i}`}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Expected Outcome</label>
                  <Textarea
                    value={h.expectedOutcome}
                    onChange={(e) => updateHypothesis(h.id, { expectedOutcome: e.target.value })}
                    rows={2}
                    className="resize-none text-xs"
                    placeholder="We expect to observe..."
                    data-testid={`input-hypothesis-outcome-${i}`}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Null Hypothesis</label>
                  <Input
                    value={h.nullHypothesis}
                    onChange={(e) => updateHypothesis(h.id, { nullHypothesis: e.target.value })}
                    className="text-xs"
                    placeholder="H₀: There is no significant effect..."
                    data-testid={`input-hypothesis-null-${i}`}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Evidence Notes</label>
                  <Textarea
                    value={h.evidenceNotes}
                    onChange={(e) => updateHypothesis(h.id, { evidenceNotes: e.target.value })}
                    rows={2}
                    className="resize-none text-xs"
                    placeholder="Key evidence or references supporting this hypothesis..."
                    data-testid={`input-hypothesis-evidence-${i}`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Status</label>
                    <Select value={h.status} onValueChange={(v) => updateHypothesis(h.id, { status: v })}>
                      <SelectTrigger className="text-xs" data-testid={`select-hypothesis-status-${i}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HYPOTHESIS_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Confidence</label>
                    <Select value={h.confidence} onValueChange={(v) => updateHypothesis(h.id, { confidence: v })}>
                      <SelectTrigger className="text-xs" data-testid={`select-hypothesis-confidence-${i}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONFIDENCE_LEVELS.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => removeHypothesis(h.id)}
                    data-testid={`button-remove-hypothesis-${i}`}
                  >
                    <X className="w-3.5 h-3.5" /> Remove
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <ToolSaveButton label="Hypotheses" saving={saving} onClick={() => onSave("Hypotheses", { hypotheses })} />
    </div>
  );
}

function FishboneTab({ project, onSave, saving }: ResearchToolsProps) {
  const { toast } = useToast();
  const [fishbone, setFishbone] = useState<FishboneData>({
    effect: "",
    branches: Object.fromEntries(FISHBONE_BRANCHES.map((b) => [b, []])),
  });
  const [causeInputs, setCauseInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    const fb = project.fishbone as FishboneData | null;
    if (fb) {
      setFishbone(fb);
    } else {
      setFishbone({
        effect: "",
        branches: Object.fromEntries(FISHBONE_BRANCHES.map((b) => [b, []])),
      });
    }
  }, [project.fishbone]);

  function addCause(branch: string) {
    const val = (causeInputs[branch] ?? "").trim();
    if (!val) return;
    const causes = fishbone.branches[branch] ?? [];
    if (causes.includes(val)) return;
    setFishbone((prev) => ({
      ...prev,
      branches: { ...prev.branches, [branch]: [...(prev.branches[branch] ?? []), val] },
    }));
    setCauseInputs((prev) => ({ ...prev, [branch]: "" }));
  }

  function removeCause(branch: string, index: number) {
    setFishbone((prev) => ({
      ...prev,
      branches: { ...prev.branches, [branch]: (prev.branches[branch] ?? []).filter((_, i) => i !== index) },
    }));
  }

  function exportMarkdown() {
    let md = `# Fishbone Diagram\n\n**Effect:** ${fishbone.effect || "(not set)"}\n\n`;
    for (const branch of FISHBONE_BRANCHES) {
      const causes = fishbone.branches[branch] ?? [];
      md += `## ${branch}\n`;
      if (causes.length === 0) {
        md += "- (none)\n";
      } else {
        causes.forEach((c) => { md += `- ${c}\n`; });
      }
      md += "\n";
    }
    navigator.clipboard.writeText(md);
    toast({ title: "Fishbone copied to clipboard as Markdown" });
  }

  const totalCauses = FISHBONE_BRANCHES.reduce((sum, b) => sum + (fishbone.branches[b]?.length ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Ishikawa cause-and-effect analysis for your research problem.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={exportMarkdown}
          data-testid="button-export-fishbone"
        >
          <Copy className="w-3.5 h-3.5" /> Copy Markdown
        </Button>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Effect / Problem</label>
        <Input
          value={fishbone.effect}
          onChange={(e) => setFishbone((prev) => ({ ...prev, effect: e.target.value }))}
          placeholder="What outcome or problem are you investigating?"
          className="text-xs"
          data-testid="input-fishbone-effect"
        />
      </div>

      <div className="relative overflow-x-auto" data-testid="fishbone-diagram">
        <div className="min-w-[600px]">
          <div className="grid grid-cols-3 gap-x-4 gap-y-1 mb-2">
            {FISHBONE_BRANCHES.slice(0, 3).map((branch) => {
              const causes = fishbone.branches[branch] ?? [];
              return (
                <div key={branch} className="text-center" data-testid={`fishbone-branch-${branch.toLowerCase()}`}>
                  <div className="inline-block px-2.5 py-1 rounded-md bg-violet-600/10 border border-violet-500/30 mb-1.5">
                    <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">{branch}</span>
                  </div>
                  <div className="space-y-0.5 mb-1.5">
                    {causes.map((cause, ci) => (
                      <div key={ci} className="flex items-center justify-center gap-1 group">
                        <span className="text-[10px] text-muted-foreground">{cause}</span>
                        <button
                          onClick={() => removeCause(branch, ci)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                          data-testid={`remove-cause-${branch.toLowerCase()}-${ci}`}
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="h-4 border-l-2 border-violet-500/40 mx-auto w-0" />
                  <div className="h-0 border-t-[6px] border-l-[4px] border-r-[4px] border-t-violet-500/40 border-l-transparent border-r-transparent mx-auto w-0" />
                </div>
              );
            })}
          </div>

          <div className="relative flex items-center mx-4">
            <div className="flex-1 h-[3px] bg-violet-500/40 rounded-l-full" />
            {fishbone.effect ? (
              <div className="shrink-0 px-4 py-1.5 rounded-md bg-violet-600 text-white text-xs font-semibold mx-1 shadow-sm">
                {fishbone.effect}
              </div>
            ) : (
              <div className="shrink-0 px-4 py-1.5 rounded-md border-2 border-dashed border-violet-500/30 text-muted-foreground text-xs mx-1">
                Effect
              </div>
            )}
            <div className="w-0 h-0 border-t-[8px] border-b-[8px] border-l-[10px] border-l-violet-500/40 border-t-transparent border-b-transparent" />
          </div>

          <div className="grid grid-cols-3 gap-x-4 gap-y-1 mt-2">
            {FISHBONE_BRANCHES.slice(3).map((branch) => {
              const causes = fishbone.branches[branch] ?? [];
              return (
                <div key={branch} className="text-center" data-testid={`fishbone-branch-${branch.toLowerCase()}`}>
                  <div className="h-0 border-b-[6px] border-l-[4px] border-r-[4px] border-b-violet-500/40 border-l-transparent border-r-transparent mx-auto w-0" />
                  <div className="h-4 border-l-2 border-violet-500/40 mx-auto w-0" />
                  <div className="inline-block px-2.5 py-1 rounded-md bg-violet-600/10 border border-violet-500/30 mb-1.5">
                    <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">{branch}</span>
                  </div>
                  <div className="space-y-0.5">
                    {causes.map((cause, ci) => (
                      <div key={ci} className="flex items-center justify-center gap-1 group">
                        <span className="text-[10px] text-muted-foreground">{cause}</span>
                        <button
                          onClick={() => removeCause(branch, ci)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                          data-testid={`remove-cause-${branch.toLowerCase()}-${ci}`}
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {totalCauses > 0 && (
          <div className="mt-3 text-center text-[10px] text-muted-foreground">
            {totalCauses} cause{totalCauses !== 1 ? "s" : ""} across {FISHBONE_BRANCHES.filter((b) => (fishbone.branches[b]?.length ?? 0) > 0).length} categories
          </div>
        )}
      </div>

      <div className="border-t border-border/50 pt-3 mt-3">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Add Causes</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {FISHBONE_BRANCHES.map((branch) => (
            <div key={branch} className="flex gap-1.5 items-center">
              <span className="text-[10px] font-medium text-muted-foreground w-20 shrink-0 truncate">{branch}</span>
              <Input
                value={causeInputs[branch] ?? ""}
                onChange={(e) => setCauseInputs((p) => ({ ...p, [branch]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCause(branch); } }}
                placeholder="Add cause..."
                className="text-xs flex-1"
                data-testid={`input-cause-${branch.toLowerCase()}`}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addCause(branch)}
                disabled={!(causeInputs[branch] ?? "").trim()}
                className="px-2 shrink-0"
                data-testid={`button-add-cause-${branch.toLowerCase()}`}
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <ToolSaveButton label="Fishbone" saving={saving} onClick={() => onSave("Fishbone", { fishbone })} />
    </div>
  );
}

function TimelineTab({ project, onSave, saving }: ResearchToolsProps) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    setMilestones((project.milestones as Milestone[] | null) ?? []);
  }, [project.milestones]);

  const sorted = [...milestones].sort((a, b) => a.targetDate.localeCompare(b.targetDate));

  function addMilestone() {
    const m: Milestone = {
      id: crypto.randomUUID(),
      label: "",
      targetDate: today,
      completed: false,
    };
    setMilestones((prev) => [...prev, m]);
  }

  function updateMilestone(id: string, updates: Partial<Milestone>) {
    setMilestones((prev) => prev.map((m) => m.id === id ? { ...m, ...updates } : m));
  }

  function removeMilestone(id: string) {
    setMilestones((prev) => prev.filter((m) => m.id !== id));
  }

  function toggleComplete(id: string) {
    setMilestones((prev) => prev.map((m) => m.id === id ? { ...m, completed: !m.completed } : m));
  }

  function getStatus(m: Milestone): { color: string; icon: typeof Check; label: string } {
    if (m.completed) return { color: "text-emerald-500", icon: Check, label: "Completed" };
    if (m.targetDate < today) return { color: "text-amber-500", icon: AlertTriangle, label: "Overdue" };
    return { color: "text-muted-foreground", icon: Clock, label: "Upcoming" };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Visual timeline of project milestones.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={addMilestone}
          disabled={!!saving}
          data-testid="button-add-milestone"
        >
          <Plus className="w-3.5 h-3.5" /> Add Milestone
        </Button>
      </div>

      {sorted.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No milestones yet. Click "Add Milestone" to start building your timeline.
        </div>
      )}

      {sorted.length > 0 && (
        <>
          <div className="overflow-x-auto pb-2" data-testid="timeline-visual">
            <div className="relative min-w-[400px]">
              <div className="h-1 bg-border rounded-full w-full absolute top-4" />

              {(() => {
                const dates = sorted.map((m) => new Date(m.targetDate).getTime());
                const minDate = Math.min(...dates);
                const maxDate = Math.max(...dates);
                const range = maxDate - minDate || 1;

                const todayPos = Math.max(0, Math.min(100, ((new Date(today).getTime() - minDate) / range) * 100));

                return (
                  <>
                    <div
                      className="absolute top-0 h-8 border-l-2 border-dashed border-violet-500/60 z-10"
                      style={{ left: `${todayPos}%` }}
                      data-testid="timeline-today-marker"
                    >
                      <span className="absolute -top-4 left-1 text-[9px] font-medium text-violet-500 whitespace-nowrap">
                        Today
                      </span>
                    </div>

                    <div className="flex relative" style={{ height: "80px" }}>
                      {sorted.map((m, i) => {
                        const pos = ((new Date(m.targetDate).getTime() - minDate) / range) * 100;
                        const st = getStatus(m);
                        return (
                          <div
                            key={m.id}
                            className="absolute flex flex-col items-center"
                            style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
                            data-testid={`timeline-dot-${i}`}
                          >
                            <button
                              onClick={() => toggleComplete(m.id)}
                              className={`w-3 h-3 rounded-full border-2 transition-colors z-10 ${
                                m.completed
                                  ? "bg-emerald-500 border-emerald-500"
                                  : m.targetDate < today
                                  ? "bg-amber-500 border-amber-500"
                                  : "bg-background border-border hover:border-violet-500"
                              }`}
                              title={`Click to toggle: ${st.label}`}
                            />
                            <div className="mt-1.5 text-center max-w-[80px]">
                              <p className="text-[9px] text-muted-foreground">{m.targetDate}</p>
                              <p className={`text-[10px] font-medium truncate ${st.color}`}>
                                {m.label || "—"}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="space-y-2" data-testid="milestones-list">
            {sorted.map((m, i) => {
              const st = getStatus(m);
              const Icon = st.icon;
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-2.5 p-2.5 rounded-md border border-border bg-background"
                  data-testid={`milestone-${i}`}
                >
                  <button
                    onClick={() => toggleComplete(m.id)}
                    className={`shrink-0 ${st.color}`}
                    data-testid={`toggle-milestone-${i}`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                  <Input
                    value={m.label}
                    onChange={(e) => updateMilestone(m.id, { label: e.target.value })}
                    placeholder="Milestone name"
                    className={`text-xs flex-1 ${m.completed ? "line-through text-muted-foreground" : ""}`}
                    data-testid={`input-milestone-label-${i}`}
                  />
                  <Input
                    type="date"
                    value={m.targetDate}
                    onChange={(e) => updateMilestone(m.id, { targetDate: e.target.value })}
                    className="text-xs w-36"
                    data-testid={`input-milestone-date-${i}`}
                  />
                  <Badge className={`text-[10px] shrink-0 ${
                    m.completed ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    : m.targetDate < today ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                    : "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30"
                  }`}>
                    {st.label}
                  </Badge>
                  <button
                    onClick={() => removeMilestone(m.id)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    data-testid={`remove-milestone-${i}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      <ToolSaveButton label="Timeline" saving={saving} onClick={() => onSave("Timeline", { milestones })} />
    </div>
  );
}
