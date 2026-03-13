import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { BookOpen, Trash2, ExternalLink, FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

export default function ResearchLibrary() {
  const researcherId = useResearcherId();
  const researcherHeaders = useResearcherHeaders();
  const { toast } = useToast();
  const qc = useQueryClient();

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

  const projectMap = useMemo(() => {
    const m: Record<number, string> = {};
    (projectsData?.projects ?? []).forEach((p) => { m[p.id] = p.title; });
    return m;
  }, [projectsData]);

  const grouped = useMemo(() => {
    const refs = refsData?.references ?? [];
    const groups: Record<string, SavedReference[]> = {};
    refs.forEach((ref) => {
      const key = ref.projectId ? String(ref.projectId) : "unsorted";
      if (!groups[key]) groups[key] = [];
      groups[key].push(ref);
    });
    return groups;
  }, [refsData]);

  const groupKeys = Object.keys(grouped).sort((a, b) => {
    if (a === "unsorted") return 1;
    if (b === "unsorted") return -1;
    return (projectMap[Number(a)] ?? "").localeCompare(projectMap[Number(b)] ?? "");
  });

  const totalRefs = refsData?.references?.length ?? 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Library</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your saved references and bookmarks
        </p>
      </div>

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
                  {refs.map((ref) => (
                    <div
                      key={ref.id}
                      className="border border-border rounded-lg p-3 bg-card hover:border-violet-500/20 transition-colors flex items-start gap-3"
                      data-testid={`library-item-${ref.id}`}
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <a
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-foreground hover:text-violet-500 transition-colors line-clamp-1 flex items-center gap-1.5"
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
                          <p className="text-xs text-muted-foreground italic">"{ref.notes}"</p>
                        )}
                      </div>
                      <button
                        className="text-muted-foreground hover:text-red-500 transition-colors shrink-0 p-1"
                        onClick={() => deleteRef.mutate(ref.id)}
                        data-testid={`button-delete-ref-${ref.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
