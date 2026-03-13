import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Shield, BarChart3, Lock, LogOut, Loader2, Download, Database, RefreshCw, ArrowUpCircle, AlertTriangle, CheckCircle2, ExternalLink, Zap, Sparkles, DollarSign, Activity, Building2, AlertCircle, XCircle, Microscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { IngestionRun } from "@shared/schema";

const ADMIN_KEY = "eden-admin-pw";

function PasswordGate({ onAuth }: { onAuth: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);

  const submit = () => {
    if (pw === "eden") {
      localStorage.setItem(ADMIN_KEY, pw);
      onAuth();
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background" data-testid="admin-gate">
      <div className="w-full max-w-sm space-y-6 p-8 border border-border rounded-xl bg-card">
        <div className="flex items-center gap-3">
          <Lock className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold text-foreground">Admin Access</h1>
        </div>
        <div className="space-y-3">
          <Input
            type="password"
            placeholder="Portal password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setError(false); }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            data-testid="input-admin-password"
            className={error ? "border-destructive" : ""}
          />
          {error && <p className="text-sm text-destructive">Incorrect password</p>}
          <Button onClick={submit} className="w-full" data-testid="button-admin-login">
            Enter
          </Button>
        </div>
      </div>
    </div>
  );
}


function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type HealthStatus = "ok" | "degraded" | "failing" | "stale" | "syncing" | "never";

interface CollectorHealthRow {
  institution: string;
  totalInDb: number;
  biotechRelevant: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  rawCount: number;
  newCount: number;
  relevantCount: number;
  phase: string | null;
  sessionId: string | null;
  health: HealthStatus;
}

interface SchedulerStatus {
  state: "idle" | "running" | "paused";
  currentInstitution: string | null;
  queuePosition: number;
  queueTotal: number;
  completedThisCycle: number;
  failedThisCycle: number;
  cycleStartedAt: string | null;
  lastActivityAt: string | null;
}

interface CollectorHealthData {
  rows: CollectorHealthRow[];
  totalInDb: number;
  totalBiotechRelevant: number;
  totalInstitutions: number;
  issueCount: number;
  syncingCount: number;
  scheduler: SchedulerStatus;
}

function HealthDot({ health }: { health: HealthStatus }) {
  if (health === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-500" data-testid="health-ok" />;
  if (health === "syncing") return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" data-testid="health-syncing" />;
  if (health === "degraded") return <AlertTriangle className="h-4 w-4 text-amber-500" data-testid="health-degraded" />;
  if (health === "stale") return <AlertCircle className="h-4 w-4 text-orange-500" data-testid="health-stale" />;
  if (health === "never") return <Database className="h-4 w-4 text-muted-foreground/40" data-testid="health-never" />;
  return <XCircle className="h-4 w-4 text-red-500" data-testid="health-failing" />;
}

function HealthLabel({ health }: { health: HealthStatus }) {
  if (health === "ok") return <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">Working</span>;
  if (health === "syncing") return <span className="text-blue-600 dark:text-blue-400 text-xs font-medium">Syncing</span>;
  if (health === "degraded") return <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">Degraded</span>;
  if (health === "stale") return <span className="text-orange-600 dark:text-orange-400 text-xs font-medium">Stale</span>;
  if (health === "never") return <span className="text-muted-foreground/50 text-xs font-medium">Never synced</span>;
  return <span className="text-red-500 dark:text-red-400 text-xs font-medium">Failing</span>;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function CollectorHealth({ pw }: { pw: string }) {
  const [issuesOnly, setIssuesOnly] = useState(false);
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<CollectorHealthData>({
    queryKey: ["/api/admin/collector-health", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/collector-health", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to load collector health");
      return res.json();
    },
    refetchInterval: (query) => {
      const d = query.state.data as CollectorHealthData | undefined;
      if (d?.syncingCount && d.syncingCount > 0) return 3_000;
      if (d?.scheduler?.state === "running") return 5_000;
      return 30_000;
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (institution: string) => {
      const res = await fetch(`/api/ingest/sync/${encodeURIComponent(institution)}`, {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Sync failed");
      }
      return res.json();
    },
    onSuccess: (_d, institution) => {
      toast({ title: "Sync started", description: `Syncing ${institution}...` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (institution: string) => {
      const res = await fetch(`/api/ingest/sync/${encodeURIComponent(institution)}/cancel`, {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Cancel failed");
      }
      return res.json();
    },
    onSuccess: (_d, institution) => {
      toast({ title: "Session cancelled", description: `Stale session for ${institution} cleared` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
      toast({ title: "Cancel failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="health-loading">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20 text-muted-foreground" data-testid="health-error">
        Failed to load collector health data.
      </div>
    );
  }

  const healthOrder: Record<HealthStatus, number> = { stale: 0, failing: 1, degraded: 2, syncing: 3, never: 4, ok: 5 };
  const sortedRows = [...data.rows].sort((a, b) => {
    const hDiff = healthOrder[a.health] - healthOrder[b.health];
    if (hDiff !== 0) return hDiff;
    return b.biotechRelevant - a.biotechRelevant;
  });

  const displayRows = issuesOnly ? sortedRows.filter((r) => r.health !== "ok" && r.health !== "syncing" && r.health !== "never") : sortedRows;

  function exportCsv() {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const headers = ["Institution", "Total In DB", "Biotech Relevant", "Health", "Last Sync", "Error"];
    const csvRows = sortedRows.map((row) => [
      escape(row.institution),
      String(row.totalInDb),
      String(row.biotechRelevant),
      row.health,
      row.lastSyncAt ? new Date(row.lastSyncAt).toISOString().slice(0, 10) : "never",
      escape(row.lastSyncError ?? ""),
    ]);
    const csv = [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `collector-health-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const sched = data.scheduler;

  return (
    <div data-testid="collector-health">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 px-4 py-4 border-b border-border" data-testid="health-summary">
        <div className="text-center">
          <div className="text-2xl font-bold text-foreground tabular-nums" data-testid="stat-total-in-db">{data.totalInDb.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Total in DB</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-primary tabular-nums" data-testid="stat-biotech-relevant">{data.totalBiotechRelevant.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Biotech Relevant</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-foreground tabular-nums" data-testid="stat-institutions">{data.totalInstitutions}</div>
          <div className="text-xs text-muted-foreground">Institutions</div>
        </div>
        <div className="text-center">
          <div className={`text-2xl font-bold tabular-nums ${data.issueCount > 0 ? "text-amber-500" : "text-emerald-500"}`} data-testid="stat-issues">{data.issueCount}</div>
          <div className="text-xs text-muted-foreground">Need Attention</div>
        </div>
        <div className="text-center">
          <div className={`text-2xl font-bold tabular-nums ${data.syncingCount > 0 ? "text-blue-500" : "text-muted-foreground/40"}`} data-testid="stat-syncing">{data.syncingCount}</div>
          <div className="text-xs text-muted-foreground">Currently Syncing</div>
        </div>
      </div>

      {sched.state !== "idle" && (
        <div className="px-4 py-3 border-b border-border bg-muted/20" data-testid="scheduler-strip">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              {sched.state === "running" ? (
                <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500" />
              )}
              <span className="font-medium text-foreground">
                Scheduler {sched.state === "running" ? "Running" : "Paused"}
              </span>
              <span className="text-muted-foreground">
                {sched.queuePosition}/{sched.queueTotal} institutions
              </span>
              {sched.currentInstitution && (
                <Badge variant="outline" className="text-xs gap-1 text-blue-600 border-blue-500/30 bg-blue-500/10">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {sched.currentInstitution}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-emerald-600 font-medium">{sched.completedThisCycle} ok</span>
              {sched.failedThisCycle > 0 && (
                <span className="text-red-500 font-medium">{sched.failedThisCycle} failed</span>
              )}
            </div>
          </div>
          <Progress value={sched.queueTotal > 0 ? (sched.queuePosition / sched.queueTotal) * 100 : 0} className="h-1.5 mt-2 bg-blue-500/10" data-testid="scheduler-progress" />
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          {data.issueCount > 0 && (
            <Button
              variant={issuesOnly ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setIssuesOnly((v) => !v)}
              data-testid="button-issues-filter"
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              {issuesOnly ? "Show All" : `${data.issueCount} Issues`}
            </Button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-csv">
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export CSV
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold text-foreground min-w-[200px]">Institution</th>
              <th className="text-center py-3 px-3 font-semibold text-foreground min-w-[90px]">Health</th>
              <th className="text-center py-3 px-3 font-semibold text-foreground min-w-[70px]" title="Total assets in database for this institution">Total</th>
              <th className="text-center py-3 px-3 font-semibold text-foreground min-w-[70px]" title="Biotech-relevant subset">Relevant</th>
              <th className="text-center py-3 px-3 font-semibold text-foreground min-w-[80px]">Last Sync</th>
              <th className="text-center py-3 px-3 font-semibold text-foreground min-w-[60px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => (
              <tr key={row.institution} className="border-b border-border/50 hover:bg-muted/20" data-testid={`health-row-${row.institution.replace(/\s+/g, "-").toLowerCase()}`}>
                <td className="py-2 px-4 font-medium text-foreground truncate max-w-[250px]" title={row.institution}>
                  <div className="flex items-center gap-1.5">
                    <span className="truncate">{row.institution}</span>
                    {row.lastSyncError && row.health === "failing" && (
                      <span className="shrink-0" title={row.lastSyncError}>
                        <AlertCircle className="h-3 w-3 text-red-400" />
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-center py-2 px-3">
                  <div className="flex items-center justify-center gap-1.5">
                    <HealthDot health={row.health} />
                    <HealthLabel health={row.health} />
                  </div>
                </td>
                <td className={`text-center py-2 px-3 tabular-nums ${row.totalInDb === 0 ? "text-muted-foreground/40" : "text-foreground font-medium"}`}>
                  {row.totalInDb > 0 ? row.totalInDb.toLocaleString() : "\u2014"}
                </td>
                <td className={`text-center py-2 px-3 tabular-nums ${row.biotechRelevant === 0 ? "text-muted-foreground/40" : "text-primary font-medium"}`}>
                  {row.biotechRelevant > 0 ? row.biotechRelevant.toLocaleString() : "\u2014"}
                </td>
                <td className={`text-center py-2 px-3 text-xs ${!row.lastSyncAt ? "text-muted-foreground/40" : "text-muted-foreground"}`} title={row.lastSyncError ?? undefined}>
                  {row.health === "syncing" ? (
                    <span className="text-blue-600 dark:text-blue-400 font-medium">{row.phase ?? "syncing"}</span>
                  ) : (
                    relativeTime(row.lastSyncAt)
                  )}
                </td>
                <td className="text-center py-2 px-3">
                  {row.health === "stale" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950"
                      onClick={() => cancelMutation.mutate(row.institution)}
                      disabled={cancelMutation.isPending}
                      title={`Cancel stale session for ${row.institution}`}
                      data-testid={`button-cancel-${row.institution.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      Cancel
                    </Button>
                  ) : row.health === "syncing" ? (
                    <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin mx-auto" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => syncMutation.mutate(row.institution)}
                      disabled={syncMutation.isPending}
                      title={`Sync ${row.institution}`}
                      data-testid={`button-sync-${row.institution.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface SyncSessionData {
  id: number;
  sessionId: string;
  institution: string;
  status: string;
  phase: string;
  rawCount: number;
  newCount: number;
  relevantCount: number;
  pushedCount: number;
  currentIndexed: number;
  createdAt: string;
  completedAt: string | null;
  lastRefreshedAt: string | null;
}

interface SyncStatusResponse {
  found: boolean;
  session?: SyncSessionData;
  newEntries?: Array<{
    assetName: string;
    sourceUrl: string | null;
    target: string;
    modality: string;
    indication: string;
    developmentStage: string;
    firstSeenAt: string;
  }>;
  syncRunning: boolean;
  syncRunningFor: string | null;
}

function InstitutionSync({ pw }: { pw: string }) {
  const [selectedInstitution, setSelectedInstitution] = useState("");
  const [polling, setPolling] = useState(false);
  const { toast } = useToast();

  const { data: institutionsData } = useQuery<{ institutions: string[] }>({
    queryKey: ["/api/scrapers/active"],
  });

  const { data: indexedCountsData } = useQuery<{ indexedCounts: Record<string, number> }>({
    queryKey: ["/api/admin/scan-matrix-counts", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/scan-matrix", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) return { indexedCounts: {} };
      const data = await res.json();
      return { indexedCounts: data.indexedCounts ?? {} };
    },
  });

  const indexedCounts = indexedCountsData?.indexedCounts ?? {};

  const { data: sessionsData, refetch: refetchSessions } = useQuery<{ sessions: SyncSessionData[] }>({
    queryKey: ["/api/ingest/sync/sessions", pw],
    queryFn: async () => {
      const res = await fetch("/api/ingest/sync/sessions", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to load sessions");
      return res.json();
    },
  });

  const { data: statusData, refetch: refetchStatus } = useQuery<SyncStatusResponse>({
    queryKey: ["/api/ingest/sync/status", selectedInstitution, pw],
    queryFn: async () => {
      if (!selectedInstitution) return { found: false, syncRunning: false, syncRunningFor: null };
      const res = await fetch(`/api/ingest/sync/${encodeURIComponent(selectedInstitution)}/status`, {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to load sync status");
      return res.json();
    },
    enabled: !!selectedInstitution,
    refetchInterval: polling ? 2000 : false,
  });

  useEffect(() => {
    if (statusData?.session?.status === "enriched" || statusData?.session?.status === "pushed" || statusData?.session?.status === "failed") {
      setPolling(false);
    }
  }, [statusData?.session?.status]);

  const syncMutation = useMutation({
    mutationFn: async (institution: string) => {
      const res = await fetch(`/api/ingest/sync/${encodeURIComponent(institution)}`, {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Sync failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setPolling(true);
      toast({ title: "Sync started", description: `Syncing ${selectedInstitution}...` });
    },
    onError: (err: Error) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const pushMutation = useMutation({
    mutationFn: async (institution: string) => {
      const res = await fetch(`/api/ingest/sync/${encodeURIComponent(institution)}/push`, {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Push failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Pushed to index", description: data.message });
      refetchStatus();
      refetchSessions();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scan-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scan-matrix-counts"] });
    },
    onError: (err: Error) => {
      toast({ title: "Push failed", description: err.message, variant: "destructive" });
    },
  });

  const institutions = institutionsData?.institutions ?? [];
  const sessionMap = new Map<string, SyncSessionData>();
  for (const s of sessionsData?.sessions ?? []) {
    sessionMap.set(s.institution, s);
  }

  const session = statusData?.session;
  const newEntries = statusData?.newEntries ?? [];
  const isRunning = session?.status === "running";
  const isEnriched = session?.status === "enriched";
  const isPushed = session?.status === "pushed";
  const isFailed = session?.status === "failed";
  const syncIsActive = statusData?.syncRunning ?? false;

  const rawCount = session?.rawCount ?? 0;
  const currentIndexed = session?.currentIndexed ?? 0;
  const zeroGuard = isEnriched && rawCount === 0;
  const softWarning = isEnriched && currentIndexed > 0 && rawCount > 0 && rawCount < currentIndexed * 0.5;

  const phaseLabel = session?.phase === "scraping" ? "Scraping..."
    : session?.phase === "comparing" ? "Comparing fingerprints..."
    : session?.phase === "enriching" ? "Enriching with AI..."
    : session?.phase === "done" ? "Done"
    : "";

  return (
    <div className="space-y-6" data-testid="sync-tab">
      <div className="flex items-center gap-4">
        <select
          className="flex-1 h-10 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          value={selectedInstitution}
          onChange={(e) => { setSelectedInstitution(e.target.value); setPolling(false); }}
          data-testid="select-institution"
        >
          <option value="">Select an institution...</option>
          {institutions.sort().map((inst) => {
            const s = sessionMap.get(inst);
            const idxCount = indexedCounts[inst] ?? 0;
            const parts: string[] = [];
            parts.push(`${idxCount} indexed`);
            const refreshTs = s?.lastRefreshedAt ?? s?.completedAt;
            if (refreshTs) parts.push(`synced ${timeAgo(refreshTs)}`);
            const suffix = parts.length > 0 ? ` — ${parts.join(", ")}` : "";
            return (
              <option key={inst} value={inst}>
                {inst}{suffix}
              </option>
            );
          })}
        </select>
        <Button
          onClick={() => syncMutation.mutate(selectedInstitution)}
          disabled={!selectedInstitution || syncMutation.isPending || isRunning || syncIsActive}
          data-testid="button-sync"
        >
          {syncMutation.isPending || isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Sync
        </Button>
      </div>

      {selectedInstitution && session && (
        <div className="border border-border rounded-xl bg-card overflow-hidden" data-testid="sync-results">
          <div className="px-5 py-4 border-b border-border bg-muted/20">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground text-base" data-testid="sync-institution-name">{session.institution}</h3>
                {(session.lastRefreshedAt || session.completedAt) && (
                  <p className="text-xs text-muted-foreground mt-0.5" data-testid="sync-last-refreshed">
                    Last refreshed: {formatDate(session.lastRefreshedAt ?? session.completedAt!)}
                  </p>
                )}
              </div>
              <Badge
                variant={isPushed ? "default" : isFailed ? "destructive" : isEnriched ? "secondary" : "outline"}
                data-testid="sync-status-badge"
              >
                {session.status}
              </Badge>
            </div>
          </div>

          {isRunning && (
            <div className="px-5 py-6" data-testid="sync-progress">
              <div className="flex items-center gap-3 mb-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm font-medium text-foreground">{phaseLabel}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-500 animate-pulse"
                  style={{ width: session.phase === "scraping" ? "33%" : session.phase === "comparing" ? "50%" : session.phase === "enriching" ? "75%" : "100%" }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {rawCount > 0 ? `${rawCount} raw listings scraped` : "Fetching listings from institution..."}
              </p>
            </div>
          )}

          {(isEnriched || isPushed || isFailed) && (
            <div className="px-5 py-4 space-y-4" data-testid="sync-result-details">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-currently-indexed">{currentIndexed}</div>
                  <div className="text-xs text-muted-foreground">Currently Indexed</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-raw-scraped">{session.rawCount}</div>
                  <div className="text-xs text-muted-foreground">Raw Scraped</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-new-found">{session.newCount}</div>
                  <div className="text-xs text-muted-foreground">New (Not in Index)</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <div className={`text-2xl font-bold tabular-nums ${session.relevantCount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`} data-testid="stat-relevant">
                    {session.relevantCount}
                  </div>
                  <div className="text-xs text-muted-foreground">New + Relevant (Biotech)</div>
                </div>
              </div>

              {zeroGuard && (
                <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30" data-testid="sync-zero-guard">
                  <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">Connection may be broken — 0 results returned</p>
                    <p className="text-xs text-red-600 dark:text-red-500 mt-1">The scraper returned no results. This could indicate a broken connection, website change, or temporary outage. Push is blocked.</p>
                  </div>
                </div>
              )}

              {softWarning && !zeroGuard && (
                <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30" data-testid="sync-soft-warning">
                  <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Results significantly below expected count</p>
                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                      Scraped {rawCount} results but {currentIndexed} are currently indexed. This is below 50% of the expected count — the scraper may only be returning partial results.
                    </p>
                  </div>
                </div>
              )}

              {isPushed && (
                <div className="flex items-start gap-3 p-4 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30" data-testid="sync-pushed-success">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      {session.pushedCount > 0 ? `${session.pushedCount} new assets pushed to index` : "No new relevant assets to push"}
                    </p>
                  </div>
                </div>
              )}

              {isFailed && (
                <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30" data-testid="sync-failed">
                  <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">Sync failed</p>
                    <p className="text-xs text-red-600 dark:text-red-500 mt-1">The scraper encountered an error. Check server logs for details.</p>
                  </div>
                </div>
              )}

              {isEnriched && !zeroGuard && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-foreground">
                      {session.relevantCount > 0 ? `New Relevant Entries (${newEntries.length})` : "Push to Index"}
                    </h4>
                    <Button
                      onClick={() => pushMutation.mutate(selectedInstitution)}
                      disabled={pushMutation.isPending || zeroGuard || session.relevantCount === 0}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      data-testid="button-push-to-index"
                    >
                      {pushMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <ArrowUpCircle className="h-4 w-4 mr-2" />
                      )}
                      {session.relevantCount > 0 ? "Push New Additions to Index" : "Nothing to Push"}
                    </Button>
                  </div>
                  {newEntries.length > 0 && (
                    <div className="border border-border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-3 font-medium text-foreground">Asset Name</th>
                            <th className="text-left py-2 px-3 font-medium text-foreground">Target</th>
                            <th className="text-left py-2 px-3 font-medium text-foreground">Modality</th>
                            <th className="text-left py-2 px-3 font-medium text-foreground">Indication</th>
                            <th className="text-left py-2 px-3 font-medium text-foreground">First Seen</th>
                            <th className="text-center py-2 px-3 font-medium text-foreground">Link</th>
                          </tr>
                        </thead>
                        <tbody>
                          {newEntries.map((entry, i) => (
                            <tr key={i} className="border-b border-border/50 hover:bg-muted/20" data-testid={`sync-entry-${i}`}>
                              <td className="py-2 px-3 font-medium text-foreground max-w-[300px] truncate" title={entry.assetName}>
                                {entry.assetName}
                              </td>
                              <td className="py-2 px-3 text-muted-foreground capitalize">{entry.target}</td>
                              <td className="py-2 px-3 text-muted-foreground capitalize">{entry.modality}</td>
                              <td className="py-2 px-3 text-muted-foreground capitalize">{entry.indication}</td>
                              <td className="py-2 px-3 text-muted-foreground text-xs" data-testid={`sync-entry-firstseen-${i}`}>
                                {entry.firstSeenAt ? formatDate(entry.firstSeenAt) : "—"}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {entry.sourceUrl ? (
                                  <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                    <ExternalLink className="h-3.5 w-3.5 inline" />
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {isEnriched && session.relevantCount === 0 && session.newCount === 0 && !isFailed && (
                <div className="text-center py-6 text-muted-foreground" data-testid="sync-no-new">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No new entries found — index is up to date.</p>
                </div>
              )}

              {isEnriched && session.relevantCount === 0 && session.newCount > 0 && (
                <div className="text-center py-6 text-muted-foreground" data-testid="sync-no-relevant">
                  <p className="text-sm">{session.newCount} new entries found, but none passed the biotech relevance filter.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!selectedInstitution && (
        <div className="text-center py-16 text-muted-foreground" data-testid="sync-empty-state">
          <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium">Select an institution to sync</p>
          <p className="text-sm mt-1">Test scraper connections and refresh individual sources</p>
        </div>
      )}
    </div>
  );
}

interface EnrichmentStats {
  total: number;
  unknownCount: number;
  byField: { target: number; modality: number; indication: number; developmentStage: number };
}

interface EnrichmentStatus {
  status: "idle" | "running" | "done" | "error";
  processed: number;
  total: number;
  improved: number;
  resumed?: boolean;
  jobId?: number;
  error?: string;
}

function Enrichment({ pw }: { pw: string }) {
  const [polling, setPolling] = useState(false);
  const { toast } = useToast();

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<EnrichmentStats>({
    queryKey: ["/api/admin/enrichment/stats", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/stats", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to load enrichment stats");
      return res.json();
    },
  });

  const { data: status, refetch: refetchStatus } = useQuery<EnrichmentStatus>({
    queryKey: ["/api/admin/enrichment/status", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/status", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to load enrichment status");
      return res.json();
    },
    refetchInterval: polling ? 1500 : false,
  });

  const prevStatusRef = useRef<string | undefined>();
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status?.status;
    if (status?.status === "running" && !polling) {
      setPolling(true);
    }
    if (prev === "running" && (status?.status === "done" || status?.status === "error")) {
      setPolling(false);
      refetchStats();
      if (status.status === "done") {
        toast({ title: "Enrichment complete", description: `${status.improved} assets improved out of ${status.total} processed` });
      } else {
        toast({ title: "Enrichment failed", description: status.error ?? "Unknown error", variant: "destructive" });
      }
    }
  }, [status?.status]);

  const runEnrichment = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/run", {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start");
      }
      return res.json();
    },
    onSuccess: () => {
      setPolling(true);
      refetchStatus();
      toast({ title: "Enrichment started", description: "Running GPT-4o-mini pass on incomplete assets..." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to start", description: err.message, variant: "destructive" });
    },
  });

  const isRunning = status?.status === "running";
  const isResumed = status?.resumed === true;
  const unknownCount = stats?.unknownCount ?? 0;
  const totalAssets = stats?.total ?? 0;

  const costEstimate = unknownCount * 0.0003;

  const progressPct = status && status.total > 0 ? Math.round((status.processed / status.total) * 100) : 0;

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="enrichment-loading">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="enrichment-tab">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-total-assets">{totalAssets.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Assets</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400" data-testid="stat-unknown-count">{unknownCount.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">With Unknown Fields</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-complete-count">{(totalAssets - unknownCount).toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">Fully Enriched</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-completion-rate">
            {totalAssets > 0 ? Math.round(((totalAssets - unknownCount) / totalAssets) * 100) : 0}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">Completion Rate</div>
        </div>
      </div>

      {stats && unknownCount > 0 && (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/20">
            <h3 className="text-sm font-semibold text-foreground">Per-Field Breakdown</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border">
            <div className="bg-card p-3 text-center">
              <div className="text-lg font-bold tabular-nums text-foreground" data-testid="stat-unknown-target">{stats.byField.target.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Target</div>
            </div>
            <div className="bg-card p-3 text-center">
              <div className="text-lg font-bold tabular-nums text-foreground" data-testid="stat-unknown-modality">{stats.byField.modality.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Modality</div>
            </div>
            <div className="bg-card p-3 text-center">
              <div className="text-lg font-bold tabular-nums text-foreground" data-testid="stat-unknown-indication">{stats.byField.indication.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Indication</div>
            </div>
            <div className="bg-card p-3 text-center">
              <div className="text-lg font-bold tabular-nums text-foreground" data-testid="stat-unknown-stage">{stats.byField.developmentStage.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Dev Stage</div>
            </div>
          </div>
        </div>
      )}

      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/20">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Estimated Cost
          </h3>
        </div>
        <div className="px-5 py-4">
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
            <div>
              <div className="text-sm font-medium text-foreground">GPT-4o-mini Enrichment</div>
              <div className="text-xs text-muted-foreground">{unknownCount.toLocaleString()} assets &times; ~$0.0003/asset</div>
            </div>
            <div className="text-lg font-bold tabular-nums text-foreground" data-testid="cost-estimate">
              ~${costEstimate.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => runEnrichment.mutate()}
          disabled={isRunning || unknownCount === 0 || runEnrichment.isPending}
          className="flex-1"
          data-testid="button-run-enrichment"
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          Run Enrichment (mini)
        </Button>
      </div>

      {isRunning && status && (
        <div className="border border-border rounded-xl bg-card p-5 space-y-3" data-testid="enrichment-progress">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium text-foreground">
                {isResumed ? "Resuming from checkpoint — " : ""}Processing...
              </span>
            </div>
            <span className="text-sm tabular-nums text-muted-foreground" data-testid="enrichment-progress-text">
              {status.processed.toLocaleString()}/{status.total.toLocaleString()} ({progressPct}%)
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-primary h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
              data-testid="enrichment-progress-bar"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {status.improved.toLocaleString()} assets improved so far
          </p>
        </div>
      )}

      {status?.status === "done" && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30" data-testid="enrichment-done">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              Enrichment complete
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">
              {status.improved} out of {status.total} assets improved
            </p>
          </div>
        </div>
      )}

      {status?.status === "error" && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30" data-testid="enrichment-error">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Enrichment failed</p>
            <p className="text-xs text-red-600 dark:text-red-500 mt-1">{status.error ?? "Unknown error"}</p>
          </div>
        </div>
      )}

      {unknownCount === 0 && totalAssets > 0 && (
        <div className="text-center py-10 text-muted-foreground" data-testid="enrichment-all-complete">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-base font-medium">All assets fully enriched</p>
          <p className="text-sm mt-1">No unknown fields remaining in the database.</p>
        </div>
      )}
    </div>
  );
}

type ScrapingProgress = { done: number; total: number; found: number; active?: string[] };
type IngestStatus = (IngestionRun & { status: string; enrichingCount?: number; scrapingProgress?: ScrapingProgress; upsertProgress?: { done: number; total: number }; syncRunning?: boolean; syncRunningFor?: string | null }) | { status: "never_run"; totalFound: 0; newCount: 0; ranAt: null };

function formatRelativeTime(dt: Date | string | null): string {
  if (!dt) return "unknown";
  const d = new Date(dt);
  const diff = Date.now() - d.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function DataRefresh({ pw }: { pw: string }) {
  const { toast } = useToast();

  const { data: statusData } = useQuery<IngestStatus>({
    queryKey: ["/api/ingest/status"],
    refetchInterval: (query) => {
      const d = query.state.data as IngestStatus | undefined;
      if (d?.status === "running") return 3000;
      if ((d as any)?.enrichingCount > 0) return 5000;
      return 30000;
    },
    staleTime: 0,
  });

  const { data: schedulerData, refetch: refetchScheduler } = useQuery<SchedulerStatus>({
    queryKey: ["/api/ingest/scheduler/status", pw],
    queryFn: async () => {
      const res = await fetch("/api/ingest/scheduler/status", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to fetch scheduler status");
      return res.json();
    },
    refetchInterval: (query) => {
      const d = query.state.data as SchedulerStatus | undefined;
      if (d?.state === "running") return 5_000;
      return 30_000;
    },
  });

  const { data: historyData, refetch: refetchHistory } = useQuery<IngestionRun[]>({
    queryKey: ["/api/ingest/history"],
    queryFn: async () => {
      const res = await fetch("/api/ingest/history", { headers: { "x-admin-password": pw } });
      return res.json();
    },
    staleTime: 30000,
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ingest/run", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ingest/status"] });
    },
    onError: (err: any) => {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    },
  });

  const schedulerStartMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ingest/scheduler/start", {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (d: any) => {
      if (d.ok) {
        toast({ title: "Scheduler started", description: "Sequential sync cycle is running" });
      } else {
        toast({ title: "Cannot start", description: d.message, variant: "destructive" });
      }
      refetchScheduler();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: any) => {
      toast({ title: "Start failed", description: err.message, variant: "destructive" });
    },
  });

  const schedulerPauseMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ingest/scheduler/pause", {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (d: any) => {
      if (d.ok) {
        toast({ title: "Scheduler paused" });
      } else {
        toast({ title: "Cannot pause", description: d.message, variant: "destructive" });
      }
      refetchScheduler();
    },
    onError: (err: any) => {
      toast({ title: "Pause failed", description: err.message, variant: "destructive" });
    },
  });

  const s = statusData as any;
  const syncIsRunning = s?.syncRunning ?? false;
  const syncRunningFor = s?.syncRunningFor ?? null;
  const isRunning = statusData?.status === "running" || scanMutation.isPending;
  const enrichingCount = s?.enrichingCount ?? 0;
  const scrapingProgress: ScrapingProgress = s?.scrapingProgress ?? { done: 0, total: 0, found: 0 };
  const upsertProgress = s?.upsertProgress ?? { done: 0, total: 0 };
  const isSaving = scrapingProgress.total > 0 && scrapingProgress.done >= scrapingProgress.total && upsertProgress.total > 0;
  const progressPct = scrapingProgress.total > 0 ? Math.round((scrapingProgress.done / scrapingProgress.total) * 100) : 0;
  const savePct = upsertProgress.total > 0 ? Math.round((upsertProgress.done / upsertProgress.total) * 100) : 0;

  const handleScan = () => {
    scanMutation.mutate();
  };

  const prevRunningRef = useRef(false);
  useEffect(() => {
    if (prevRunningRef.current && !isRunning) {
      refetchHistory();
    }
    prevRunningRef.current = isRunning;
  }, [isRunning, refetchHistory]);

  const sched = schedulerData;
  const schedRunning = sched?.state === "running";
  const schedPaused = sched?.state === "paused";

  return (
    <div className="space-y-6">
      <div className="border border-border rounded-xl bg-card p-5 space-y-4" data-testid="scheduler-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Sequential Sync Scheduler
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Syncs institutions one-by-one to avoid timeouts. Recommended over bulk scan.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {schedRunning ? (
              <Button
                size="sm"
                variant="outline"
                className="border-amber-500/30 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
                onClick={() => schedulerPauseMutation.mutate()}
                disabled={schedulerPauseMutation.isPending}
                data-testid="button-pause-scheduler"
              >
                <AlertCircle className="w-3.5 h-3.5 mr-1.5" />
                Pause
              </Button>
            ) : (
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => schedulerStartMutation.mutate()}
                disabled={schedulerStartMutation.isPending || isRunning}
                data-testid="button-start-scheduler"
              >
                {schedulerStartMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5 mr-1.5" />
                )}
                {schedPaused ? "Resume" : "Start Cycle"}
              </Button>
            )}
          </div>
        </div>

        {(schedRunning || schedPaused) && sched && (
          <div className="space-y-2" data-testid="scheduler-status">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                {schedRunning && sched.currentInstitution ? (
                  <Badge variant="outline" className="text-xs gap-1 text-blue-600 border-blue-500/30 bg-blue-500/10">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {sched.currentInstitution}
                  </Badge>
                ) : schedRunning ? (
                  <span className="text-blue-600 font-medium">Waiting for next...</span>
                ) : (
                  <span className="text-amber-600 font-medium">Paused</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums">{sched.queuePosition}/{sched.queueTotal} done</span>
                <span className="text-emerald-600 font-medium">{sched.completedThisCycle} ok</span>
                {sched.failedThisCycle > 0 && (
                  <span className="text-red-500 font-medium">{sched.failedThisCycle} failed</span>
                )}
              </div>
            </div>
            <Progress
              value={sched.queueTotal > 0 ? (sched.queuePosition / sched.queueTotal) * 100 : 0}
              className="h-2 bg-blue-500/10"
              data-testid="scheduler-cycle-progress"
            />
            {sched.cycleStartedAt && (
              <p className="text-[11px] text-muted-foreground/70">
                Cycle started {relativeTime(sched.cycleStartedAt)}
                {sched.lastActivityAt && <> · last activity {relativeTime(sched.lastActivityAt)}</>}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="border border-border rounded-xl bg-card p-5 space-y-4" data-testid="data-refresh-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              Legacy Bulk Scan
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Runs all scrapers concurrently. May cause timeouts with many institutions.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={handleScan}
            disabled={isRunning || syncIsRunning || schedRunning}
            data-testid="button-run-full-scan"
            title={syncIsRunning ? `Institution sync running for ${syncRunningFor}` : schedRunning ? "Scheduler is running" : undefined}
          >
            {isRunning && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            {isRunning ? "Running..." : syncIsRunning ? "Sync Active" : "Run Bulk Scan"}
          </Button>
        </div>

        {isRunning && (
          <div className="space-y-3" data-testid="scan-progress">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                <span className="text-sm text-primary font-medium">
                  {isSaving ? "Saving to database…" : "Scanning TTO sources…"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {isSaving ? (
                  <span data-testid="progress-saving">{upsertProgress.done.toLocaleString()} / {upsertProgress.total.toLocaleString()} listings saved</span>
                ) : scrapingProgress.total > 0 ? (
                  <>
                    <Building2 className="w-3.5 h-3.5" />
                    <span data-testid="progress-institutions">{scrapingProgress.done} / {scrapingProgress.total} institutions</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span data-testid="progress-listings">{scrapingProgress.found.toLocaleString()} found</span>
                  </>
                ) : (
                  <span>Starting up…</span>
                )}
              </div>
            </div>
            <Progress value={isSaving ? savePct : progressPct} className="h-2 bg-primary/10" data-testid="progress-bar" />
            {!isSaving && (scrapingProgress.active ?? []).length > 0 && (
              <p className="text-[11px] text-muted-foreground/70 truncate" data-testid="progress-active">
                <span className="font-medium text-muted-foreground">Now:</span>{" "}
                {(scrapingProgress.active ?? []).join(" · ")}
              </p>
            )}
          </div>
        )}

        {statusData && statusData.status === "completed" && !isRunning && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Last bulk scan: {formatRelativeTime((statusData as any).ranAt)}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>{(statusData as any).totalFound?.toLocaleString()} found</span>
            {enrichingCount > 0 && (
              <Badge variant="outline" className="ml-1 gap-1 text-amber-600 border-amber-500/30 bg-amber-500/10">
                <Loader2 className="w-3 h-3 animate-spin" />
                Enriching {enrichingCount.toLocaleString()}…
              </Badge>
            )}
          </div>
        )}

        {statusData && statusData.status === "failed" && !isRunning && (
          <div className="flex items-center gap-2 text-xs text-red-500">
            <XCircle className="w-3.5 h-3.5" />
            <span>Last bulk scan failed</span>
            {(statusData as any).errorMessage && (
              <span className="text-muted-foreground">— {(statusData as any).errorMessage}</span>
            )}
          </div>
        )}
      </div>

      <div data-testid="scan-history">
        <h3 className="text-sm font-semibold text-foreground mb-3">Recent Bulk Scans</h3>
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Date / Time</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Total Found</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">New Assets</th>
              </tr>
            </thead>
            <tbody>
              {!historyData && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-xs">
                    <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                    Loading…
                  </td>
                </tr>
              )}
              {historyData && historyData.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-xs">No scans recorded yet</td>
                </tr>
              )}
              {historyData?.map((run) => (
                <tr key={run.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors" data-testid={`scan-run-${run.id}`}>
                  <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                    {run.ranAt ? new Date(run.ranAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {run.status === "completed" && (
                      <Badge variant="outline" className="text-[10px] text-primary border-primary/30 bg-primary/5">Completed</Badge>
                    )}
                    {run.status === "running" && (
                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/30 bg-amber-500/5 gap-1">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />Running
                      </Badge>
                    )}
                    {run.status === "failed" && (
                      <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30 bg-destructive/5">Failed</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums font-medium text-foreground">
                    {run.totalFound?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums">
                    {run.newCount > 0 ? (
                      <span className="text-primary font-semibold">+{run.newCount.toLocaleString()}</span>
                    ) : (
                      <span className="text-muted-foreground">{run.newCount?.toLocaleString() ?? "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ResearchQueue({ pw }: { pw: string }) {
  const { toast } = useToast();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data, isLoading, refetch } = useQuery<{ cards: any[] }>({
    queryKey: ["/api/admin/research-queue"],
    queryFn: async () => {
      const res = await fetch("/api/admin/research-queue", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 0,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, adminStatus, adminNote }: { id: number; adminStatus: string; adminNote?: string }) => {
      const res = await fetch(`/api/admin/research-queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ adminStatus, adminNote }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: (_, vars) => {
      refetch();
      setRejectingId(null);
      setRejectNote("");
      const label = vars.adminStatus === "approved" ? "Approved" : vars.adminStatus === "rejected" ? "Rejected" : "Revoked";
      toast({ title: `${label}`, description: "Card status updated." });
    },
    onError: () => toast({ title: "Error", description: "Could not update status.", variant: "destructive" }),
  });

  const cards = data?.cards ?? [];
  const pending = cards.filter((c) => c.adminStatus === "pending");
  const approved = cards.filter((c) => c.adminStatus === "approved");
  const rejected = cards.filter((c) => c.adminStatus === "rejected");

  function CardRow({ card, actions }: { card: any; actions: ReactNode }) {
    return (
      <div className="p-4 border-b border-border last:border-0" data-testid={`research-queue-card-${card.id}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-semibold text-foreground">{card.title}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">{card.technologyType}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{card.developmentStage}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{card.ipStatus}</span>
            </div>
            <div className="text-xs text-muted-foreground mb-1.5">
              <span className="font-medium text-foreground">{card.institution}</span>
              {card.lab && <span> · {card.lab}</span>}
              <span className="mx-1">·</span>
              <span>{card.contactEmail}</span>
              <span className="mx-1">·</span>
              <span>{card.seeking}</span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{card.summary}</p>
            {card.adminNote && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Note: {card.adminNote}</p>
            )}
          </div>
          <div className="shrink-0 flex flex-col gap-2">{actions}</div>
        </div>
        {rejectingId === card.id && (
          <div className="mt-3 flex gap-2" data-testid={`reject-note-row-${card.id}`}>
            <input
              className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground placeholder:text-muted-foreground"
              placeholder="Optional rejection note…"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              data-testid={`input-reject-note-${card.id}`}
            />
            <Button
              size="sm"
              variant="destructive"
              className="text-xs"
              onClick={() => updateStatus.mutate({ id: card.id, adminStatus: "rejected", adminNote: rejectNote || undefined })}
              disabled={updateStatus.isPending}
              data-testid={`button-confirm-reject-${card.id}`}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => { setRejectingId(null); setRejectNote(""); }}
              data-testid={`button-cancel-reject-${card.id}`}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    );
  }

  function Panel({ title, count, color, children }: { title: string; count: number; color: string; children: ReactNode }) {
    return (
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{count}</span>
        </div>
        {count === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">No cards here.</p>
        ) : (
          <div>{children}</div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="research-queue-loading">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="research-queue-tab">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-amber-500" data-testid="stat-pending-count">{pending.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Pending Review</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400" data-testid="stat-approved-count">{approved.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Approved · Live in Scout</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-rejected-count">{rejected.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Rejected</div>
        </div>
      </div>

      <Panel title="Pending Review" count={pending.length} color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
        {pending.map((card) => (
          <CardRow
            key={card.id}
            card={card}
            actions={
              <>
                <Button
                  size="sm"
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => updateStatus.mutate({ id: card.id, adminStatus: "approved" })}
                  disabled={updateStatus.isPending}
                  data-testid={`button-approve-${card.id}`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
                  onClick={() => { setRejectingId(card.id); setRejectNote(""); }}
                  disabled={updateStatus.isPending}
                  data-testid={`button-reject-${card.id}`}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                </Button>
              </>
            }
          />
        ))}
      </Panel>

      <Panel title="Approved · Live in Scout" count={approved.length} color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
        {approved.map((card) => (
          <CardRow
            key={card.id}
            card={card}
            actions={
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => updateStatus.mutate({ id: card.id, adminStatus: "pending" })}
                disabled={updateStatus.isPending}
                data-testid={`button-revoke-${card.id}`}
              >
                Revoke
              </Button>
            }
          />
        ))}
      </Panel>

      <Panel title="Rejected" count={rejected.length} color="bg-muted text-muted-foreground">
        {rejected.map((card) => (
          <CardRow
            key={card.id}
            card={card}
            actions={
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => updateStatus.mutate({ id: card.id, adminStatus: "pending" })}
                disabled={updateStatus.isPending}
                data-testid={`button-requeue-${card.id}`}
              >
                Re-queue
              </Button>
            }
          />
        ))}
      </Panel>
    </div>
  );
}

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [activeTab, setActiveTab] = useState("scan-tracking");
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const stored = localStorage.getItem(ADMIN_KEY);
    if (stored === "eden") setAuthed(true);
  }, []);

  if (!authed) return <PasswordGate onAuth={() => setAuthed(true)} />;

  const pw = localStorage.getItem(ADMIN_KEY) ?? "";

  return <AdminPanel pw={pw} setAuthed={setAuthed} theme={theme} setTheme={setTheme} activeTab={activeTab} setActiveTab={setActiveTab} />;
}

function AdminPanel({ pw, setAuthed, theme, setTheme, activeTab, setActiveTab }: {
  pw: string;
  setAuthed: (v: boolean) => void;
  theme: string;
  setTheme: (v: string) => void;
  activeTab: string;
  setActiveTab: (v: string) => void;
}) {
  const { data: queueData } = useQuery<{ cards: any[] }>({
    queryKey: ["/api/admin/research-queue"],
    queryFn: async () => {
      const res = await fetch("/api/admin/research-queue", { headers: { "x-admin-password": pw } });
      if (!res.ok) return { cards: [] };
      return res.json();
    },
    staleTime: 30000,
    enabled: !!pw,
  });
  const pendingCount = (queueData?.cards ?? []).filter((c) => c.adminStatus === "pending").length;

  return (
    <div className="min-h-screen bg-background" data-testid="admin-panel">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">EdenRadar Admin</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              data-testid="button-toggle-theme"
            >
              {theme === "dark" ? "Light" : "Dark"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { localStorage.removeItem(ADMIN_KEY); setAuthed(false); }}
              data-testid="button-admin-logout"
            >
              <LogOut className="h-4 w-4 mr-1" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto flex">
        <aside className="w-56 border-r border-border min-h-[calc(100vh-57px)] p-4 shrink-0">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab("scan-tracking")}
              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "scan-tracking"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-scan-tracking"
            >
              <Activity className="h-4 w-4" />
              Collector Health
            </button>
            <button
              onClick={() => setActiveTab("institution-sync")}
              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "institution-sync"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-institution-sync"
            >
              <RefreshCw className="h-4 w-4" />
              Institution Sync
            </button>
            <button
              onClick={() => setActiveTab("data-refresh")}
              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "data-refresh"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-data-refresh"
            >
              <Activity className="h-4 w-4" />
              Data Refresh
            </button>
            <button
              onClick={() => setActiveTab("enrichment")}
              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "enrichment"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-enrichment"
            >
              <Sparkles className="h-4 w-4" />
              Enrichment
            </button>
            <button
              onClick={() => setActiveTab("research-queue")}
              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "research-queue"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-research-queue"
            >
              <Microscope className="h-4 w-4" />
              <span>Research Queue</span>
              {pendingCount > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-amber-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center" data-testid="badge-pending-count">
                  {pendingCount}
                </span>
              )}
            </button>
          </nav>
        </aside>

        <main className="flex-1 p-6 overflow-hidden">
          {activeTab === "scan-tracking" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Collector Health</h2>
                <p className="text-sm text-muted-foreground mt-1">Per-institution collector status, indexed assets, and scan history</p>
              </div>
              <div className="border border-border rounded-xl bg-card overflow-hidden">
                <CollectorHealth pw={pw} />
              </div>
            </>
          )}

          {activeTab === "institution-sync" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Institution Sync</h2>
                <p className="text-sm text-muted-foreground mt-1">Test scraper connections and refresh individual institution sources</p>
              </div>
              <InstitutionSync pw={pw} />
            </>
          )}

          {activeTab === "data-refresh" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Data Refresh</h2>
                <p className="text-sm text-muted-foreground mt-1">Trigger a full scan across all TTO sources and track recent scan history</p>
              </div>
              <DataRefresh pw={pw} />
            </>
          )}

          {activeTab === "enrichment" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Enrichment</h2>
                <p className="text-sm text-muted-foreground mt-1">AI enrichment for assets with unknown fields (resumable, auto-recovers after restart)</p>
              </div>
              <Enrichment pw={pw} />
            </>
          )}

          {activeTab === "research-queue" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Research Queue</h2>
                <p className="text-sm text-muted-foreground mt-1">Review researcher-submitted Discovery Cards. Approved cards enter Scout as the "Lab Discoveries" source.</p>
              </div>
              <ResearchQueue pw={pw} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
