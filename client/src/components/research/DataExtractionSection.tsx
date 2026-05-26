import { useState } from "react";
import { Plus, X, Save, Loader2, Settings2, Table2, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResearchProject } from "@shared/schema";

type ExtractionField = { id: string; name: string; type: "text" | "number" | "select"; options?: string[] };
type ExtractedRow = { paperId: string; data: Record<string, string> };
type ScreeningPaper = { id: string; title: string; authors: string; year: string; fullTextDecision: "include" | "exclude" | null };
type ViewMode = "table" | "form" | "forest";

const DEFAULT_FIELDS: ExtractionField[] = [
  { id: "study_design", name: "Study Design", type: "select", options: ["RCT", "Cohort", "Case-control", "Cross-sectional", "Other"] },
  { id: "sample_size",  name: "Sample Size (N)",    type: "number" },
  { id: "population",   name: "Population",         type: "text" },
  { id: "intervention", name: "Intervention / Exposure", type: "text" },
  { id: "comparator",   name: "Comparator",         type: "text" },
  { id: "primary_outcome", name: "Primary Outcome", type: "text" },
  { id: "effect_size",  name: "Effect Size",        type: "number" },
  { id: "ci_lower",     name: "CI Lower (95%)",     type: "number" },
  { id: "ci_upper",     name: "CI Upper (95%)",     type: "number" },
  { id: "key_finding",  name: "Key Finding",        type: "text" },
];

// ── Forest plot ───────────────────────────────────────────────────────────────

function ForestPlot({ fields, rows, papers }: { fields: ExtractionField[]; rows: ExtractedRow[]; papers: ScreeningPaper[] }) {
  const numFields = fields.filter((f) => f.type === "number");
  const effectField = numFields.find((f) => /effect|estimate|^or$|^rr$|^hr$|^md$|^smd$|^rd$/i.test(f.name)) ?? numFields.find((f) => /size/i.test(f.name));
  const ciLowField  = numFields.find((f) => /low|lower/i.test(f.name));
  const ciHighField = numFields.find((f) => /high|upper/i.test(f.name));

  if (!effectField) {
    return (
      <div className="rounded-lg border border-border bg-muted/10 p-8 text-center space-y-2">
        <BarChart2 className="w-8 h-8 text-muted-foreground mx-auto" />
        <p className="text-sm font-semibold text-foreground">No numeric effect field found</p>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
          Add numeric extraction fields named <strong>Effect Size</strong>, <strong>CI Lower (95%)</strong>, and <strong>CI Upper (95%)</strong> to enable the forest plot. The default template includes these — they appear after you run full-text screening.
        </p>
      </div>
    );
  }

  type Point = { study: string; year: string; effect: number; ciLow: number | null; ciHigh: number | null };
  const points: Point[] = rows.map((r) => {
    const p = papers.find((x) => x.id === r.paperId);
    return {
      study: p ? `${p.authors?.split(";")[0]?.split(",")[0]?.trim() || p.title.slice(0, 20)} (${p.year})` : r.paperId,
      year: p?.year ?? "",
      effect: parseFloat(r.data[effectField.id] ?? ""),
      ciLow:  ciLowField  ? parseFloat(r.data[ciLowField.id]  ?? "") : null,
      ciHigh: ciHighField ? parseFloat(r.data[ciHighField.id] ?? "") : null,
    };
  }).filter((p) => !isNaN(p.effect));

  if (points.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/10 p-8 text-center">
        <p className="text-sm font-semibold text-foreground">No effect size values entered yet</p>
        <p className="text-xs text-muted-foreground mt-1">Fill in the {effectField.name} column in Table or Form view.</p>
      </div>
    );
  }

  const allVals = points.flatMap((p) => [p.effect, p.ciLow, p.ciHigh].filter((v): v is number => v !== null && !isNaN(v)));
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const pad = (maxVal - minVal) * 0.15 || 0.5;
  const domMin = minVal - pad;
  const domMax = maxVal + pad;
  const domRange = domMax - domMin;

  const ROW_H = 32;
  const LABEL_W = 160;
  const PLOT_W = 280;
  const VAL_W = 80;
  const svgW = LABEL_W + PLOT_W + VAL_W;
  const svgH = (points.length + 2) * ROW_H + 40;

  const toX = (v: number) => LABEL_W + ((v - domMin) / domRange) * PLOT_W;
  const nullX = toX(0);
  const isNullInRange = nullX >= LABEL_W && nullX <= LABEL_W + PLOT_W;
  const mean = points.reduce((s, p) => s + p.effect, 0) / points.length;

  return (
    <div className="space-y-2 overflow-x-auto">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Forest Plot — {effectField.name}
          {ciLowField && ciHighField ? " with 95% CI" : ""}
        </p>
        <span className="text-[10px] text-muted-foreground">{points.length} stud{points.length !== 1 ? "ies" : "y"}</span>
      </div>
      <div className="min-w-[520px]">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" style={{ fontFamily: "system-ui, sans-serif" }}>
          {/* Header */}
          <text x={LABEL_W - 8} y={16} textAnchor="end" fontSize={9} fill="#94a3b8" fontWeight="600">Study</text>
          <text x={LABEL_W + PLOT_W / 2} y={16} textAnchor="middle" fontSize={9} fill="#94a3b8" fontWeight="600">{effectField.name}</text>
          <text x={LABEL_W + PLOT_W + VAL_W - 4} y={16} textAnchor="end" fontSize={9} fill="#94a3b8" fontWeight="600">Value [95% CI]</text>

          {/* Grid & null line */}
          {isNullInRange && (
            <line x1={nullX} y1={24} x2={nullX} y2={svgH - 16} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="3,3" />
          )}

          {/* Studies */}
          {points.map((p, i) => {
            const cy = 24 + (i + 1) * ROW_H;
            const cx = toX(p.effect);
            const hasCI = p.ciLow !== null && p.ciHigh !== null && !isNaN(p.ciLow) && !isNaN(p.ciHigh);
            const x1 = hasCI ? toX(p.ciLow!) : cx;
            const x2 = hasCI ? toX(p.ciHigh!) : cx;
            const ciStr = hasCI ? ` [${p.ciLow!.toFixed(2)}, ${p.ciHigh!.toFixed(2)}]` : "";

            return (
              <g key={p.study}>
                {/* Row bg */}
                <rect x={0} y={cy - ROW_H / 2} width={svgW} height={ROW_H} fill={i % 2 === 0 ? "#f8fafc" : "white"} />
                {/* Study label */}
                <text x={LABEL_W - 8} y={cy + 4} textAnchor="end" fontSize={10} fill="#334155">
                  {p.study.length > 22 ? p.study.slice(0, 22) + "…" : p.study}
                </text>
                {/* CI line */}
                {hasCI && <line x1={Math.max(x1, LABEL_W)} y1={cy} x2={Math.min(x2, LABEL_W + PLOT_W)} y2={cy} stroke="#8b5cf6" strokeWidth={1.5} />}
                {hasCI && <line x1={Math.max(x1, LABEL_W)} y1={cy - 5} x2={Math.max(x1, LABEL_W)} y2={cy + 5} stroke="#8b5cf6" strokeWidth={1.5} />}
                {hasCI && <line x1={Math.min(x2, LABEL_W + PLOT_W)} y1={cy - 5} x2={Math.min(x2, LABEL_W + PLOT_W)} y2={cy + 5} stroke="#8b5cf6" strokeWidth={1.5} />}
                {/* Point */}
                {cx >= LABEL_W && cx <= LABEL_W + PLOT_W && (
                  <rect x={cx - 5} y={cy - 5} width={10} height={10} fill="#7c3aed" rx={1} />
                )}
                {/* Value label */}
                <text x={LABEL_W + PLOT_W + VAL_W - 4} y={cy + 4} textAnchor="end" fontSize={9} fill="#475569" fontFamily="monospace">
                  {p.effect.toFixed(2)}{ciStr}
                </text>
              </g>
            );
          })}

          {/* Overall mean diamond */}
          {(() => {
            const cy = 24 + (points.length + 1) * ROW_H;
            const cx = toX(mean);
            const hw = ciLowField && ciHighField ? Math.abs(toX(mean + (maxVal - minVal) * 0.05) - cx) : 8;
            const diamond = `${cx},${cy - 8} ${Math.min(cx + hw, LABEL_W + PLOT_W)},${cy} ${cx},${cy + 8} ${Math.max(cx - hw, LABEL_W)},${cy}`;
            return (
              <g>
                <line x1={0} y1={cy - ROW_H / 2} x2={svgW} y2={cy - ROW_H / 2} stroke="#e2e8f0" strokeWidth={1} />
                <text x={LABEL_W - 8} y={cy + 4} textAnchor="end" fontSize={10} fill="#1e293b" fontWeight="700">Overall mean</text>
                <polygon points={diamond} fill="#7c3aed" opacity={0.8} />
                <text x={LABEL_W + PLOT_W + VAL_W - 4} y={cy + 4} textAnchor="end" fontSize={9} fill="#1e293b" fontWeight="600" fontFamily="monospace">
                  {mean.toFixed(2)}
                </text>
              </g>
            );
          })()}

          {/* X-axis */}
          {(() => {
            const y = svgH - 8;
            const ticks = 5;
            return (
              <g>
                <line x1={LABEL_W} y1={y - 4} x2={LABEL_W + PLOT_W} y2={y - 4} stroke="#cbd5e1" strokeWidth={1} />
                {Array.from({ length: ticks }, (_, i) => {
                  const v = domMin + (domRange / (ticks - 1)) * i;
                  const x = toX(v);
                  return (
                    <g key={i}>
                      <line x1={x} y1={y - 8} x2={x} y2={y - 4} stroke="#cbd5e1" strokeWidth={1} />
                      <text x={x} y={y + 4} textAnchor="middle" fontSize={8} fill="#94a3b8">{v.toFixed(1)}</text>
                    </g>
                  );
                })}
              </g>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  project: ResearchProject;
  onSave: (label: string, data: Partial<ResearchProject>) => Promise<void>;
  saving: string | null;
}

export function DataExtractionSection({ project, onSave, saving }: Props) {
  const storedFields = (project.extractionFields as ExtractionField[] | null) ?? DEFAULT_FIELDS;
  const storedData   = (project.extractedData   as ExtractedRow[]    | null) ?? [];
  const includedPapers = ((project.screeningPapers as ScreeningPaper[] | null) ?? []).filter((p) => p.fullTextDecision === "include");

  const [fields, setFields] = useState<ExtractionField[]>(storedFields);
  const [rows, setRows] = useState<ExtractedRow[]>(() => {
    const existing = new Set(storedData.map((r) => r.paperId));
    const newRows = includedPapers.filter((p) => !existing.has(p.id)).map((p) => ({ paperId: p.id, data: {} }));
    return [...storedData, ...newRows];
  });
  const [view, setView] = useState<ViewMode>("table");
  const [activeRow, setActiveRow] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState("");

  function getPaperTitle(paperId: string) {
    const p = includedPapers.find((p) => p.id === paperId);
    return p ? `${p.title}${p.year ? ` (${p.year})` : ""}` : paperId;
  }

  function updateCell(paperId: string, fieldId: string, value: string) {
    setRows((prev) => prev.map((r) => r.paperId === paperId ? { ...r, data: { ...r.data, [fieldId]: value } } : r));
  }

  function addField() {
    const name = newFieldName.trim();
    if (!name) return;
    setFields((f) => [...f, { id: crypto.randomUUID(), name, type: "text" }]);
    setNewFieldName("");
  }

  function removeField(id: string) {
    setFields((f) => f.filter((x) => x.id !== id));
  }

  const activeRowData = rows.find((r) => r.paperId === activeRow);

  return (
    <div className="space-y-4">
      {includedPapers.length === 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-center">
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">No included papers yet</p>
          <p className="text-[11px] text-muted-foreground mt-1">Complete full-text screening in §5 to populate studies for extraction.</p>
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center gap-2 justify-between flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/40">
          {([
            { v: "table"  as ViewMode, icon: <Table2  className="w-3.5 h-3.5" />, label: "Table"       },
            { v: "form"   as ViewMode, icon: <Settings2 className="w-3.5 h-3.5" />, label: "Form"      },
            { v: "forest" as ViewMode, icon: <BarChart2 className="w-3.5 h-3.5" />, label: "Forest Plot" },
          ]).map(({ v, icon, label }) => (
            <button key={v} onClick={() => setView(v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {icon} {label}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {includedPapers.length} stud{includedPapers.length !== 1 ? "ies" : "y"} · {fields.length} fields
        </span>
      </div>

      {/* Field management */}
      <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/10">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Extraction Fields</p>
        <div className="flex flex-wrap gap-2">
          {fields.map((f) => (
            <div key={f.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-violet-500/8 border border-violet-500/20 text-xs font-medium text-violet-700 dark:text-violet-300">
              <span className="text-[9px] text-violet-400/70 uppercase">{f.type}</span>
              {f.name}
              <button onClick={() => removeField(f.id)} className="text-violet-400 hover:text-red-500 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addField(); } }} placeholder="Add custom field..." className="text-xs flex-1" data-testid="input-new-field" />
          <Button variant="outline" size="sm" onClick={addField} disabled={!newFieldName.trim()} className="px-2"><Plus className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      {/* Forest plot */}
      {view === "forest" && <ForestPlot fields={fields} rows={rows} papers={includedPapers} />}

      {/* Table view */}
      {view === "table" && rows.length > 0 && (
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-xs min-w-[600px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide sticky left-0 bg-muted/30 min-w-[180px]">Study</th>
                {fields.map((f) => (
                  <th key={f.id} className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap min-w-[120px]">{f.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.paperId} className="border-b border-border/50 last:border-0 hover:bg-muted/10">
                  <td className="px-3 py-2 font-medium text-foreground sticky left-0 bg-background max-w-[180px]">
                    <button onClick={() => { setActiveRow(row.paperId); setView("form"); }} className="text-left text-violet-600 dark:text-violet-400 hover:underline line-clamp-2 w-full">
                      {getPaperTitle(row.paperId)}
                    </button>
                  </td>
                  {fields.map((f) => (
                    <td key={f.id} className="px-3 py-2 text-muted-foreground">
                      <input
                        type={f.type === "number" ? "number" : "text"}
                        value={row.data[f.id] ?? ""}
                        onChange={(e) => updateCell(row.paperId, f.id, e.target.value)}
                        className="w-full text-xs bg-transparent border-b border-transparent hover:border-border focus:border-violet-500 focus:outline-none py-0.5 transition-colors text-foreground"
                        placeholder="—"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form view */}
      {view === "form" && (
        <div className="flex flex-col sm:grid sm:grid-cols-[200px,1fr] gap-4">
          <div className="border border-border rounded-lg overflow-hidden bg-muted/10">
            <div className="px-3 py-2 border-b border-border/50 bg-muted/20">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Studies</p>
            </div>
            <div className="overflow-y-auto max-h-64 sm:max-h-none">
              {rows.map((row) => {
                const filled = fields.filter((f) => row.data[f.id]?.trim()).length;
                return (
                  <button key={row.paperId} onClick={() => setActiveRow(row.paperId)}
                    className={`w-full text-left px-3 py-2.5 border-b border-border/30 last:border-0 transition-colors ${activeRow === row.paperId ? "bg-violet-500/10" : "hover:bg-muted/40"}`}
                  >
                    <p className={`text-xs font-medium line-clamp-2 ${activeRow === row.paperId ? "text-violet-600 dark:text-violet-400" : "text-foreground"}`}>
                      {getPaperTitle(row.paperId)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{filled}/{fields.length} filled</p>
                  </button>
                );
              })}
            </div>
          </div>
          {activeRowData ? (
            <div className="border border-border rounded-lg p-4 space-y-4">
              <p className="text-sm font-semibold text-foreground line-clamp-2">{getPaperTitle(activeRowData.paperId)}</p>
              <div className="space-y-3">
                {fields.map((f) => (
                  <div key={f.id} className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{f.name}</label>
                    {f.type === "select" && f.options ? (
                      <select value={activeRowData.data[f.id] ?? ""} onChange={(e) => updateCell(activeRowData.paperId, f.id, e.target.value)} className="w-full text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground">
                        <option value="">Select...</option>
                        {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <Input type={f.type === "number" ? "number" : "text"} value={activeRowData.data[f.id] ?? ""} onChange={(e) => updateCell(activeRowData.paperId, f.id, e.target.value)} className="text-xs" placeholder={`Enter ${f.name.toLowerCase()}...`} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="border border-border rounded-lg p-8 text-center text-muted-foreground">
              <p className="text-sm">Select a study to fill in extraction data</p>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => onSave("Data Extraction", { extractionFields: fields as any, extractedData: rows as any })} disabled={!!saving} data-testid="button-save-extraction">
          {saving === "Data Extraction" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Extraction
        </Button>
      </div>
    </div>
  );
}
