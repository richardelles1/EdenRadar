import { useState } from "react";
import { Plus, X, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ResearchProject } from "@shared/schema";

type Deviation = {
  id: string;
  date: string;
  nature: string;
  impact: "minor" | "major";
  rationale: string;
  createdAt: string;
};

interface Props {
  project: ResearchProject;
  onSave: (label: string, data: Partial<ResearchProject>) => Promise<void>;
  saving: string | null;
}

export function ProtocolDeviationLog({ project, onSave, saving }: Props) {
  const stored = ((project as any).protocolDeviations ?? []) as Deviation[];
  const [deviations, setDeviations] = useState<Deviation[]>(stored);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Omit<Deviation, "id" | "createdAt">>({
    date: new Date().toISOString().slice(0, 10),
    nature: "",
    impact: "minor",
    rationale: "",
  });

  function addDeviation() {
    if (!form.nature.trim()) return;
    const next = [
      ...deviations,
      { ...form, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
    ];
    setDeviations(next);
    onSave("Protocol Deviations", { protocolDeviations: next } as any);
    setForm({ date: new Date().toISOString().slice(0, 10), nature: "", impact: "minor", rationale: "" });
    setAdding(false);
  }

  function remove(id: string) {
    const next = deviations.filter((d) => d.id !== id);
    setDeviations(next);
    onSave("Protocol Deviations", { protocolDeviations: next } as any);
  }

  return (
    <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Protocol Deviation Log</span>
          {deviations.length > 0 && (
            <span className="text-[9px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full tabular-nums">
              {deviations.length}
            </span>
          )}
        </div>
        {!adding && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5 h-7 border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
            onClick={() => setAdding(true)}
          >
            <Plus className="w-3 h-3" /> Log Deviation
          </Button>
        )}
      </div>

      {deviations.length === 0 && !adding && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-muted/20 border border-border/50">
          <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Any deviation from the locked protocol should be documented here with the date, nature, and justification.
          </p>
        </div>
      )}

      {deviations.length > 0 && (
        <div className="space-y-2">
          {deviations.map((d) => (
            <div
              key={d.id}
              className={`flex items-start gap-3 p-3 rounded-lg border text-xs ${
                d.impact === "major"
                  ? "border-red-500/20 bg-red-500/5"
                  : "border-amber-500/15 bg-amber-500/5"
              }`}
            >
              <div
                className={`mt-0.5 shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                  d.impact === "major"
                    ? "border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/10"
                    : "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                }`}
              >
                {d.impact}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-foreground">{d.nature}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{d.date}</span>
                </div>
                {d.rationale && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{d.rationale}</p>
                )}
              </div>
              <button
                onClick={() => remove(d.id)}
                className="text-muted-foreground hover:text-destructive shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="border border-amber-500/20 rounded-lg p-3 space-y-3 bg-amber-500/5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Date</label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Impact Level</label>
              <div className="flex gap-2 pt-0.5">
                {(["minor", "major"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setForm((f) => ({ ...f, impact: lvl }))}
                    className={`flex-1 py-1.5 rounded-md text-xs font-semibold border transition-colors capitalize ${
                      form.impact === lvl
                        ? lvl === "major"
                          ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
                          : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "border-border text-muted-foreground hover:border-amber-500/30"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Nature of Deviation *</label>
            <Input
              value={form.nature}
              onChange={(e) => setForm((f) => ({ ...f, nature: e.target.value }))}
              placeholder="Briefly describe what changed..."
              className="text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Justification</label>
            <Textarea
              value={form.rationale}
              onChange={(e) => setForm((f) => ({ ...f, rationale: e.target.value }))}
              rows={2}
              className="resize-none text-xs"
              placeholder="Why was this deviation necessary?"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              size="sm"
              className="text-xs bg-amber-600 hover:bg-amber-700 text-white"
              onClick={addDeviation}
              disabled={!form.nature.trim() || !!saving}
            >
              Log Deviation
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
