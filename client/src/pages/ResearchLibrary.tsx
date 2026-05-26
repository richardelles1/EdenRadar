import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import {
  BookOpen, Trash2, ExternalLink, FolderOpen, Table2, Loader2,
  Download, Save, CheckSquare, Square, X, ChevronDown,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useResearcherId, useResearcherHeaders } from "@/hooks/use-researcher";
import { useToast } from "@/hooks/use-toast";
import { PORTAL_ACCENT, accentMix } from "@/components/sidebar-primitives";
import type { SavedReference, ResearchProject } from "@shared/schema";

const ACCENT = PORTAL_ACCENT.lab;

const SOURCE_TYPE_LABELS: Record<string, string> = {
  paper: "Paper",
  preprint: "Preprint",
  clinical_trial: "Clinical Trial",
  patent: "Patent",
  tech_transfer: "Tech Transfer",
  grant: "Grant",
  dataset: "Dataset",
  researcher: "Researcher",
};

const SOURCE_TINT: Record<string, { bg: string; strip: string; badge: string; badgeTxt: string }> = {
  paper:          { bg: "bg-violet-500/5 dark:bg-violet-950/20 border-violet-500/15", strip: "bg-violet-500", badge: "bg-violet-500/10 border-violet-500/20", badgeTxt: "text-violet-600 dark:text-violet-400" },
  preprint:       { bg: "bg-amber-500/5 dark:bg-amber-950/20 border-amber-500/15",   strip: "bg-amber-500",   badge: "bg-amber-500/10 border-amber-500/20",   badgeTxt: "text-amber-600 dark:text-amber-400" },
  clinical_trial: { bg: "bg-teal-500/5 dark:bg-teal-950/20 border-teal-500/15",     strip: "bg-teal-500",    badge: "bg-teal-500/10 border-teal-500/20",     badgeTxt: "text-teal-600 dark:text-teal-400" },
  patent:         { bg: "bg-amber-500/5 dark:bg-amber-950/20 border-amber-500/15",   strip: "bg-amber-500",   badge: "bg-amber-500/10 border-amber-500/20",   badgeTxt: "text-amber-600 dark:text-amber-400" },
  grant:          { bg: "bg-emerald-500/5 dark:bg-emerald-950/20 border-emerald-500/15", strip: "bg-emerald-500", badge: "bg-emerald-500/10 border-emerald-500/20", badgeTxt: "text-emerald-600 dark:text-emerald-400" },
  tech_transfer:  { bg: "bg-emerald-500/5 dark:bg-emerald-950/20 border-emerald-500/15", strip: "bg-emerald-500", badge: "bg-emerald-500/10 border-emerald-500/20", badgeTxt: "text-emerald-600 dark:text-emerald-400" },
  dataset:        { bg: "bg-sky-500/5 dark:bg-sky-950/20 border-sky-500/15",         strip: "bg-sky-500",     badge: "bg-sky-500/10 border-sky-500/20",       badgeTxt: "text-sky-600 dark:text-sky-400" },
  researcher:     { bg: "bg-sky-500/5 dark:bg-sky-950/20 border-sky-500/15",         strip: "bg-sky-500",     badge: "bg-sky-500/10 border-sky-500/20",       badgeTxt: "text-sky-600 dark:text-sky-400" },
};

const DEFAULT_TINT = { bg: "bg-card border-border", strip: "bg-gray-400", badge: "bg-gray-500/10 border-gray-500/20", badgeTxt: "text-gray-600 dark:text-gray-400" };

const STRENGTH_COLORS: Record<string, string> = {
  High: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  Moderate: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  Low: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  Insufficient: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
};

type EvidenceRow = {
  referenceId: number;
  title: string;
  studyType: string;
  sampleSize: string;
  population: string;
  interventionTarget: string;
  outcome: string;
  keyFindings: string;
  evidenceStrength: string;
};

export default function ResearchLibrary() {
  const researcherId = useResearcherId();
  const researcherHeaders = useResearcherHeaders();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [evidenceRows, setEvidenceRows] = useState<EvidenceRow[] | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const [showTable, setShowTable] = useState(false);
  const [saveProjectId, setSaveProjectId] = useState<string>("");

  const { data: refsData, isLoading: refsLoading } = useQuery<{ references: SavedReference[] }>({
    queryKey: ["/api/research/references", researcherId],
    queryFn: () => fetch("/api/research/references", { headers: researcherHeaders }).then((r) => r.json()),
    enabled: !!researcherId,
  });

  const { data: projectsData } = useQuery<{ projects: ResearchProject[] }>({
    queryKey: ["/api/research/projects", researcherId],
    queryFn: () => fetch("/api/research/projects", { headers: researcherHeaders }).then((r) => {
      if (!r.ok) throw new Error("Failed to load projects");
      return r.json();
    }),
    enabled: !!researcherId,
  });

  const deleteRef = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/research/references/${id}`, { method: "DELETE", headers: researcherHeaders }).then((r) => {
        if (!r.ok) throw new Error("Failed to delete");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/research/references", researcherId] });
      toast({ title: "Reference removed" });
    },
    onError: () => toast({ title: "Failed to remove reference", variant: "destructive" }),
  });

  const extractEvidence = useMutation({
    mutationFn: async (ids: number[]) => {
      setPendingIds(new Set(ids));
      setEvidenceRows([]);
      setShowTable(true);
      const r = await fetch("/api/research/library/extract-evidence", {
        method: "POST",
        headers: { ...researcherHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ referenceIds: ids }),
      });
      if (!r.ok) { const err = await r.json(); throw new Error(err.error ?? "Extraction failed"); }
      const data = await r.json() as { rows: EvidenceRow[] };
      setEvidenceRows(data.rows);
      setPendingIds(new Set());
      return data;
    },
    onSuccess: (data) => toast({ title: `Evidence extracted from ${data.rows.length} references` }),
    onError: (err: any) => {
      setPendingIds(new Set());
      toast({ title: "Evidence extraction failed", description: err.message, variant: "destructive" });
    },
  });

  const saveToProject = useMutation({
    mutationFn: async ({ projectId, rows }: { projectId: number; rows: EvidenceRow[] }) => {
      const r = await fetch(`/api/research/projects/${projectId}/evidence-table`, {
        method: "POST",
        headers: { ...researcherHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      if (!r.ok) { const err = await r.json(); throw new Error(err.error ?? "Save failed"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/research/projects", researcherId] });
      toast({ title: "Evidence table saved to project" });
      setSaveProjectId("");
    },
    onError: (err: any) => toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
  });

  const projectMap = useMemo(() => {
    const m: Record<number, string> = {};
    (projectsData?.projects ?? []).forEach((p) => { m[p.id] = p.title; });
    return m;
  }, [projectsData]);

  const allRefs = refsData?.references ?? [];

  const grouped = useMemo(() => {
    const groups: Record<string, SavedReference[]> = {};
    allRefs.forEach((ref) => {
      const key = ref.projectId ? String(ref.projectId) : "unsorted";
      if (!groups[key]) groups[key] = [];
      groups[key].push(ref);
    });
    return groups;
  }, [allRefs]);

  const groupKeys = Object.keys(grouped).sort((a, b) => {
    if (a === "unsorted") return 1;
    if (b === "unsorted") return -1;
    return (projectMap[Number(a)] ?? "").localeCompare(projectMap[Number(b)] ?? "");
  });

  const totalRefs = allRefs.length;

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(selectedIds.size === totalRefs ? new Set() : new Set(allRefs.map((r) => r.id)));
  }, [allRefs, selectedIds.size, totalRefs]);

  const exportCsv = useCallback(() => {
    if (!evidenceRows) return;
    const headers = ["Title", "Study Type", "Sample Size", "Population", "Intervention/Target", "Outcome", "Key Findings", "Evidence Strength"];
    const csvRows = [
      headers.join(","),
      ...evidenceRows.map((r) =>
        [r.title, r.studyType, r.sampleSize, r.population, r.interventionTarget, r.outcome, r.keyFindings, r.evidenceStrength]
          .map((v) => `"${(v ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evidence-table-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [evidenceRows]);

  const projects = projectsData?.projects ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div
        className="rounded-xl border border-border p-4 flex items-center justify-between gap-4"
        style={{ background: accentMix(ACCENT, 4) }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: ACCENT }}>
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">Saved Literature</h1>
            <p className="text-xs text-muted-foreground">
              {totalRefs > 0 ? `${totalRefs} reference${totalRefs !== 1 ? "s" : ""} · ${groupKeys.filter((k) => k !== "unsorted").length} project${groupKeys.filter((k) => k !== "unsorted").length !== 1 ? "s" : ""}` : "Build your research library from Database Search"}
            </p>
          </div>
        </div>
        {totalRefs >= 2 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={selectAll}
              className="gap-1.5 text-xs"
              data-testid="button-select-all"
            >
              {selectedIds.size === totalRefs ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              {selectedIds.size === totalRefs ? "Deselect All" : "Select All"}
            </Button>
            {selectedIds.size >= 2 && (
              <Button
                size="sm"
                className="gap-1.5 text-xs text-white"
                style={{ background: ACCENT }}
                disabled={extractEvidence.isPending}
                onClick={() => extractEvidence.mutate(Array.from(selectedIds))}
                data-testid="button-build-evidence-table"
              >
                {extractEvidence.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Table2 className="w-3.5 h-3.5" />}
                {extractEvidence.isPending ? `Extracting (${selectedIds.size})…` : `Build Evidence Table (${selectedIds.size})`}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Evidence table panel */}
      {showTable && evidenceRows && (
        <div
          className="rounded-xl border p-5 space-y-4"
          style={{ background: accentMix(ACCENT, 3), borderColor: accentMix(ACCENT, 25) }}
          data-testid="evidence-table-panel"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Table2 className="w-4 h-4" style={{ color: ACCENT }} />
              <h2 className="text-sm font-semibold text-foreground">Evidence Comparison Table</h2>
              {pendingIds.size > 0 ? (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: accentMix(ACCENT, 10), color: ACCENT }}
                >
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  Analyzing {pendingIds.size}…
                </span>
              ) : (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: accentMix(ACCENT, 10), color: ACCENT }}
                >
                  {evidenceRows.length} papers
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={exportCsv} data-testid="button-export-csv">
                <Download className="w-3 h-3" /> CSV
              </Button>
              {projects.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Select value={saveProjectId} onValueChange={setSaveProjectId}>
                    <SelectTrigger className="h-8 text-xs w-[160px]" data-testid="select-save-project">
                      <SelectValue placeholder="Save to project…" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {saveProjectId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-xs h-8"
                      disabled={saveToProject.isPending}
                      onClick={() => saveToProject.mutate({ projectId: parseInt(saveProjectId), rows: evidenceRows })}
                      data-testid="button-save-to-project"
                    >
                      <Save className="w-3 h-3" />
                      {saveToProject.isPending ? "Saving…" : "Save"}
                    </Button>
                  )}
                </div>
              )}
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowTable(false)} data-testid="button-close-evidence">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" data-testid="evidence-table">
              <thead>
                <tr className="border-b border-border">
                  {["Title", "Study Type", "Sample Size", "Population", "Intervention/Target", "Outcome", "Key Findings", "Strength"].map((h) => (
                    <th key={h} className="text-left p-2 font-semibold text-muted-foreground whitespace-nowrap text-[10px] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evidenceRows.map((row) => (
                  <tr key={row.referenceId} className="border-b border-border/50 hover:bg-muted/20" data-testid={`evidence-row-${row.referenceId}`}>
                    <td className="p-2 max-w-[180px] truncate font-medium text-foreground">{row.title}</td>
                    <td className="p-2 text-muted-foreground whitespace-nowrap">{row.studyType}</td>
                    <td className="p-2 text-muted-foreground whitespace-nowrap tabular-nums">{row.sampleSize}</td>
                    <td className="p-2 text-muted-foreground max-w-[120px] truncate">{row.population}</td>
                    <td className="p-2 text-muted-foreground max-w-[120px] truncate">{row.interventionTarget}</td>
                    <td className="p-2 text-muted-foreground max-w-[120px] truncate">{row.outcome}</td>
                    <td className="p-2 text-muted-foreground">{row.keyFindings}</td>
                    <td className="p-2 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STRENGTH_COLORS[row.evidenceStrength] ?? "bg-muted text-muted-foreground border-border"}`}>
                        {row.evidenceStrength}
                      </span>
                    </td>
                  </tr>
                ))}
                {pendingIds.size > 0 && Array.from(pendingIds)
                  .filter((id) => !evidenceRows.some((r) => r.referenceId === id))
                  .map((id) => {
                    const ref = allRefs.find((r) => r.id === id);
                    return (
                      <tr key={`pending-${id}`} className="border-b border-border/50" data-testid={`evidence-row-pending-${id}`}>
                        <td className="p-2 max-w-[180px] truncate font-medium text-foreground/60">
                          <div className="flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin shrink-0" style={{ color: ACCENT }} />
                            <span className="truncate">{ref?.title ?? `Reference #${id}`}</span>
                          </div>
                        </td>
                        {Array(7).fill(null).map((_, i) => (
                          <td key={i} className="p-2"><Skeleton className="h-3 w-14" /></td>
                        ))}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reference groups */}
      {refsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : totalRefs === 0 ? (
        <div
          className="rounded-lg border border-dashed border-border p-12 text-center"
          style={{ background: accentMix(ACCENT, 3) }}
          data-testid="library-empty-state"
        >
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm text-muted-foreground">
            No saved references yet. Bookmark results from the Database Search to build your library.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupKeys.map((key) => {
            const refs = grouped[key];
            const isUnsorted = key === "unsorted";
            const groupTitle = isUnsorted ? "Unsorted" : projectMap[Number(key)] ?? `Project #${key}`;

            return (
              <section key={key} data-testid={`library-group-${key}`}>
                {/* Group header with left-border label style */}
                <div className="flex items-center gap-2.5 pl-3 border-l-2 mb-3" style={{ borderColor: ACCENT }}>
                  <FolderOpen className="w-3.5 h-3.5" style={{ color: ACCENT }} />
                  <h2 className="text-sm font-semibold text-foreground">{groupTitle}</h2>
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums"
                    style={{ background: accentMix(ACCENT, 10), color: ACCENT }}
                  >
                    {refs.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {refs.map((ref) => {
                    const isSelected = selectedIds.has(ref.id);
                    const tint = SOURCE_TINT[ref.sourceType] ?? DEFAULT_TINT;

                    return (
                      <div
                        key={ref.id}
                        className={`group/item relative rounded-lg border flex items-start gap-3 cursor-pointer overflow-hidden transition-all ${
                          isSelected ? "border-opacity-60 ring-1 ring-inset" : tint.bg
                        }`}
                        style={
                          isSelected
                            ? { borderColor: ACCENT, ["--tw-ring-color" as string]: accentMix(ACCENT, 30), background: accentMix(ACCENT, 6) }
                            : {}
                        }
                        onClick={() => toggleSelect(ref.id)}
                        onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = ""; }}
                        data-testid={`library-item-${ref.id}`}
                      >
                        {/* Left accent strip */}
                        {!isSelected && (
                          <div className={`absolute left-0 inset-y-0 w-[3px] rounded-l-lg ${tint.strip}`} />
                        )}
                        {isSelected && (
                          <div className="absolute left-0 inset-y-0 w-[3px] rounded-l-lg" style={{ backgroundColor: ACCENT }} />
                        )}

                        {/* Checkbox */}
                        <div className={`shrink-0 mt-3 ml-4 transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover/item:opacity-100"}`}>
                          {isSelected
                            ? <CheckSquare className="w-4 h-4" style={{ color: ACCENT }} />
                            : <Square className="w-4 h-4 text-muted-foreground/40" />}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 py-3 space-y-1.5">
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-foreground hover:underline line-clamp-1 flex items-center gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`link-library-item-${ref.id}`}
                          >
                            {ref.title}
                            <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground" />
                          </a>
                          <div className="flex items-center gap-2 text-[10px] flex-wrap">
                            <span className={`px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide ${tint.badge} ${tint.badgeTxt}`}>
                              {SOURCE_TYPE_LABELS[ref.sourceType] ?? ref.sourceType}
                            </span>
                            {ref.date && <span className="text-muted-foreground">{ref.date}</span>}
                            {ref.institution && (
                              <span className="text-muted-foreground truncate max-w-[200px]">{ref.institution}</span>
                            )}
                          </div>
                          {ref.notes && (
                            <p className="text-[11px] text-muted-foreground italic line-clamp-1">"{ref.notes}"</p>
                          )}
                        </div>

                        {/* Delete */}
                        <button
                          className="text-muted-foreground/30 hover:text-red-500 transition-colors shrink-0 p-3 mt-0.5"
                          onClick={(e) => { e.stopPropagation(); deleteRef.mutate(ref.id); }}
                          data-testid={`button-delete-ref-${ref.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
