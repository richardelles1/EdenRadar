import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Plus, Search, Trash2, Calendar, Building2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SavedReport } from "@shared/schema";
import type { ReportPayload } from "@/lib/types";

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function topInstitutions(assetsJson: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const a of assetsJson) {
    const inst = (a.institution ?? a.owner_name) as string | undefined;
    if (inst && inst !== "unknown" && !seen.has(inst)) {
      seen.add(inst);
      result.push(inst);
      if (result.length >= 3) break;
    }
  }
  return result;
}

function ReportCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-5 rounded-lg border border-card-border bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <Skeleton className="w-9 h-9 rounded-md shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
        <Skeleton className="h-5 w-16 shrink-0" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
    </div>
  );
}

export default function Reports() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: reports, isLoading } = useQuery<SavedReport[]>({
    queryKey: ["/api/saved-reports"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/saved-reports/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/saved-reports"] });
      toast({ title: "Report deleted" });
    },
    onError: () => {
      toast({ title: "Delete failed", variant: "destructive" });
    },
  });

  function openReport(report: SavedReport) {
    try {
      const payload = report.reportJson as unknown as ReportPayload;
      sessionStorage.setItem("current-report", JSON.stringify(payload));
      setLocation("/report");
    } catch {
      toast({ title: "Could not load report", variant: "destructive" });
    }
  }

  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Reports</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Opportunity briefs and buyer intelligence reports generated from Scout searches.
              </p>
            </div>
            <Button
              className="gap-2"
              onClick={() => setLocation("/scout")}
              data-testid="button-generate-new-report"
            >
              <Plus className="w-4 h-4" />
              Generate New
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3].map((i) => <ReportCardSkeleton key={i} />)}
          </div>
        ) : !reports || reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <FileText className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">No reports yet</h2>
              <p className="text-muted-foreground max-w-sm">
                Run a Scout search and click "Generate Report" to create your first buyer intelligence report.
              </p>
            </div>
            <Button
              className="gap-2 mt-2"
              onClick={() => setLocation("/scout")}
              data-testid="button-reports-go-scout"
            >
              <Search className="w-4 h-4" />
              Go to Scout
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reports.map((report) => {
              const assets = (report.assetsJson ?? []) as Record<string, unknown>[];
              const institutions = topInstitutions(assets);
              return (
                <div
                  key={report.id}
                  className="flex flex-col gap-4 p-5 rounded-lg border border-card-border bg-card hover:border-primary/30 transition-colors duration-200"
                  data-testid={`report-card-${report.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <FileText className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground leading-snug line-clamp-2">{report.title}</h3>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(report.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className="shrink-0 text-[11px] font-semibold bg-primary/10 text-primary border-0"
                      data-testid={`badge-asset-count-${report.id}`}
                    >
                      {assets.length} assets
                    </Badge>
                  </div>

                  {report.query && (
                    <p className="text-xs text-muted-foreground italic truncate">
                      Query: "{report.query}"
                    </p>
                  )}

                  {institutions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {institutions.map((inst) => (
                        <span
                          key={inst}
                          className="text-[10px] px-2 py-0.5 rounded-full border border-card-border bg-muted/30 text-muted-foreground flex items-center gap-1"
                        >
                          <Building2 className="w-2.5 h-2.5" />
                          {inst}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1 border-t border-card-border">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-2 h-8 text-xs border-card-border"
                      onClick={() => openReport(report)}
                      data-testid={`button-view-report-${report.id}`}
                    >
                      View Report
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      title="Delete report"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(report.id)}
                      data-testid={`button-delete-report-${report.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
