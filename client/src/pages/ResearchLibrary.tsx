import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import {
  BookOpen, Trash2, ExternalLink, FolderOpen, Table2, Loader2,
  Download, Save, CheckSquare, Square, X, ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useResearcherId, useResearcherHeaders } from "@/hooks/use-researcher";
import { useToast } from "@/hooks/use-toast";
import type { SavedReference, ResearchProject } from "@shared/schema";

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
  const [showTable, setShowTable] = useState(false);
  const [saveProjectId, setSaveProjectId] = useState<string>("");

  const { data: refsData, isLoading: refsLoading } = useQuery<{ references: SavedReference[] }>({
    queryKey: ["/api/research/references", researcherId],
    queryFn: () =>
      fetch("/api/research/references", { headers: researcherHeaders }).then((r) => r.json()),
    enabled: !!researcherId,
  });

  const { data: projectsData } = useQuery<{ projects: ResearchProject[] }>({
    queryKey: ["/api/research/projects", researcherId],
    queryFn: () =>
      fetch("/api/research/projects", { headers: researcherHeaders }).then((r) => {
        if (!r.ok) throw new Error("Failed to load projects");
        return r.json();
      }),
    enabled: !!researcherId,
  });

  const deleteRef = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/research/references/${id}`, {
        method: "DELETE",
        headers: researcherHeaders,
      }).then((r) => {
        if (!r.ok) throw new Error("Failed to delete");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/research/references", researcherId] });
      toast({ title: "Reference removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove reference", variant: "destructive" });
    },
  });

  const extractEvidence = useMutation({
    mutationFn: async (ids: number[]) => {
      const r = await fetch("/api/research/library/extract-evidence", {
        method: "POST",
        headers: { ...researcherHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ referenceIds: ids }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error ?? "Extraction failed");
      }
      return r.json() as Promise<{ rows: EvidenceRow[] }>;
    },
    onSuccess: (data) => {
      setEvidenceRows(data.rows);
      setShowTable(true);
      toast({ title: `Evidence extracted from ${data.rows.length} references` });
    },
    onError: (err: any) => {
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
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error ?? "Save failed");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/research/projects", researcherId] });
      toast({ title: "Evidence table saved to project" });
      setSaveProjectId("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
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
    if (selectedIds.size === totalRefs) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allRefs.map((r) => r.id)));
    }
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Library</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your saved references and bookmarks
          </p>
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
              {selectedIds.size === totalRefs ? (
                <CheckSquare className="w-3.5 h-3.5" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              {selectedIds.size === totalRefs ? "Deselect All" : "Select All"}
            </Button>
            {selectedIds.size >= 2 && (
              <Button
                size="sm"
                className="gap-1.5 text-xs"
                disabled={extractEvidence.isPending}
                onClick={() => extractEvidence.mutate(Array.from(selectedIds))}
                data-testid="button-build-evidence-table"
              >
                {extractEvidence.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Table2 className="w-3.5 h-3.5" />
                )}
                {extractEvidence.isPending
                  ? `Extracting (${selectedIds.size})...`
                  : `Build Evidence Table (${selectedIds.size})`}
              </Button>
            )}
          </div>
        )}
      </div>

      {showTable && evidenceRows && (
        <div className="rounded-xl border border-primary/20 bg-card p-5 space-y-4" data-testid="evidence-table-panel">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Table2 className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Evidence Comparison Table</h2>
              <Badge variant="secondary" className="text-[10px]">{evidenceRows.length} papers</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportCsv} data-testid="button-export-csv">
                <Download className="w-3 h-3" /> CSV
              </Button>
              {projects.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Select value={saveProjectId} onValueChange={setSaveProjectId}>
                    <SelectTrigger className="h-8 text-xs w-[160px]" data-testid="select-save-project">
                      <SelectValue placeholder="Save to project..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
                      ))}
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
                      {saveToProject.isPending ? "Saving..." : "Save"}
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
                  <th className="text-left p-2 font-semibold text-muted-foreground whitespace-nowrap">Title</th>
                  <th className="text-left p-2 font-semibold text-muted-foreground whitespace-nowrap">Study Type</th>
                  <th className="text-left p-2 font-semibold text-muted-foreground whitespace-nowrap">Sample Size</th>
                  <th className="text-left p-2 font-semibold text-muted-foreground whitespace-nowrap">Population</th>
                  <th className="text-left p-2 font-semibold text-muted-foreground whitespace-nowrap">Intervention/Target</th>
                  <th className="text-left p-2 font-semibold text-muted-foreground whitespace-nowrap">Outcome</th>
                  <th className="text-left p-2 font-semibold text-muted-foreground whitespace-nowrap min-w-[200px]">Key Findings</th>
                  <th className="text-left p-2 font-semibold text-muted-foreground whitespace-nowrap">Strength</th>
                </tr>
              </thead>
              <tbody>
                {evidenceRows.map((row) => (
                  <tr key={row.referenceId} className="border-b border-border/50 hover:bg-muted/30" data-testid={`evidence-row-${row.referenceId}`}>
                    <td className="p-2 max-w-[180px] truncate font-medium text-foreground">{row.title}</td>
                    <td className="p-2 text-muted-foreground whitespace-nowrap">{row.studyType}</td>
                    <td className="p-2 text-muted-foreground whitespace-nowrap">{row.sampleSize}</td>
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
              </tbody>
            </table>
          </div>
        </div>
      )}

      {refsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : totalRefs === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center space-y-3" data-testid="library-empty-state">
          <BookOpen className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            No saved references yet. Bookmark results from the Data Sources page to build your library.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupKeys.map((key) => {
            const refs = grouped[key];
            const isUnsorted = key === "unsorted";
            const groupTitle = isUnsorted ? "Unsaved bookmarks" : projectMap[Number(key)] ?? `Project #${key}`;

            return (
              <section key={key} data-testid={`library-group-${key}`}>
                <div className="flex items-center gap-2 mb-3">
                  <FolderOpen className="w-4 h-4 text-violet-500" />
                  <h2 className="text-sm font-semibold text-foreground">{groupTitle}</h2>
                  <Badge variant="secondary" className="text-[10px]">{refs.length}</Badge>
                </div>
                <div className="space-y-2">
                  {refs.map((ref) => {
                    const isSelected = selectedIds.has(ref.id);
                    return (
                      <div
                        key={ref.id}
                        className={`border rounded-lg p-3 bg-card transition-colors flex items-start gap-3 cursor-pointer ${
                          isSelected
                            ? "border-primary/40 bg-primary/5"
                            : "border-border hover:border-violet-500/20"
                        }`}
                        onClick={() => toggleSelect(ref.id)}
                        data-testid={`library-item-${ref.id}`}
                      >
                        <div className="shrink-0 mt-0.5">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4 text-muted-foreground/40" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-foreground hover:text-violet-500 transition-colors line-clamp-1 flex items-center gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`link-library-item-${ref.id}`}
                          >
                            {ref.title}
                            <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground" />
                          </a>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <Badge variant="secondary" className="text-[10px] py-0">
                              {SOURCE_TYPE_LABELS[ref.sourceType] ?? ref.sourceType}
                            </Badge>
                            {ref.date && <span>{ref.date}</span>}
                            {ref.institution && (
                              <>
                                <span>·</span>
                                <span className="truncate max-w-[200px]">{ref.institution}</span>
                              </>
                            )}
                          </div>
                          {ref.notes && (
                            <p className="text-xs text-muted-foreground italic line-clamp-2">"{ref.notes}"</p>
                          )}
                        </div>
                        <button
                          className="text-muted-foreground hover:text-red-500 transition-colors shrink-0 p-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRef.mutate(ref.id);
                          }}
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
