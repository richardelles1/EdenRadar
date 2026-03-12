import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Shield, BarChart3, Lock, LogOut, Loader2, Download, Database, RefreshCw, ArrowUpCircle, AlertTriangle, CheckCircle2, ExternalLink, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

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

interface RunMeta {
  id: number;
  ranAt: string;
  totalFound: number;
  newCount: number;
  status: string;
}

interface ScanMatrixData {
  runs: RunMeta[];
  matrix: Array<{ institution: string; counts: number[] }>;
  totalInSystem: number;
  indexedCounts: Record<string, number>;
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

function DeltaCell({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff === 0) return <span className="text-muted-foreground" data-testid="delta-unchanged">&mdash;</span>;
  if (diff > 0) return <span className="text-emerald-600 dark:text-emerald-400 font-medium" data-testid="delta-increase">+{diff}</span>;
  return <span className="text-red-500 dark:text-red-400 font-medium" data-testid="delta-decrease">{diff}</span>;
}

function ScanTracking({ pw }: { pw: string }) {
  const { data, isLoading, error } = useQuery<ScanMatrixData>({
    queryKey: ["/api/admin/scan-matrix", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/scan-matrix", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to load scan data");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="scan-loading">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20 text-muted-foreground" data-testid="scan-error">
        Failed to load scan data. Check backend connection.
      </div>
    );
  }

  if (data.runs.length === 0) {
    return (
      <div data-testid="scan-empty">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border" data-testid="total-in-system">
          <Database className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">{data.totalInSystem.toLocaleString()}</span>
          <span className="text-sm text-muted-foreground">total unique TTO entries in system</span>
        </div>
        <div className="text-center py-20 text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium">No completed scan runs yet</p>
          <p className="text-sm mt-2">Run the ingestion pipeline to see scan data here.</p>
        </div>
      </div>
    );
  }

  const { runs, matrix, totalInSystem, indexedCounts } = data;
  const totalIndexed = Object.values(indexedCounts).reduce((s, c) => s + c, 0);

  function exportCsv() {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const headers = [
      "Institution",
      "Indexed",
      ...(runs.length >= 2 ? ["Delta"] : []),
      ...runs.map((r) => `Run #${r.id} ${formatDate(r.ranAt)} (${r.totalFound} found, ${r.status})`),
    ];
    const totalRow = [
      "Total",
      String(totalIndexed),
      ...(runs.length >= 2 ? [String(runs[0].totalFound - runs[1].totalFound)] : []),
      ...runs.map((r) => String(r.totalFound)),
    ];
    const rows = matrix.map((row) => [
      escape(row.institution),
      String(indexedCounts[row.institution] ?? 0),
      ...(runs.length >= 2 ? [String((row.counts[0] ?? 0) - (row.counts[1] ?? 0))] : []),
      ...row.counts.map((c) => String(c)),
    ]);
    const csv = [headers.join(","), totalRow.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scan-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div data-testid="scan-tracking-table">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2" data-testid="total-in-system">
          <Database className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">{totalInSystem.toLocaleString()}</span>
          <span className="text-sm text-muted-foreground">total unique TTO entries in system</span>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-csv">
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export CSV
        </Button>
      </div>
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-muted/20 text-xs text-muted-foreground" data-testid="scan-legend">
        <span><strong>Raw (Scraped)</strong> = total listings found by scraper before AI filter</span>
        <span><strong>Indexed</strong> = currently stored in database after AI filter</span>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 font-semibold text-foreground sticky left-0 bg-card z-10 min-w-[200px]">
              Institution
            </th>
            <th className="text-center py-3 px-3 font-semibold text-foreground min-w-[70px]" title="Currently stored in database after AI filter" data-testid="header-indexed">
              Indexed
            </th>
            {runs.length >= 2 && (
              <th className="text-center py-3 px-3 font-semibold text-foreground min-w-[60px]">
                &Delta;
              </th>
            )}
            {runs.map((run, i) => (
              <th key={run.id} className="text-center py-2 px-3 font-normal min-w-[90px]">
                <div className="text-xs font-semibold text-foreground">Run #{run.id}</div>
                <div className="text-xs text-muted-foreground">{formatDate(run.ranAt)}</div>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <Badge variant={i === 0 ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                    {run.totalFound.toLocaleString()} found
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize" data-testid={`status-run-${run.id}`}>
                    {run.status}
                  </Badge>
                </div>
              </th>
            ))}
          </tr>
          <tr className="border-b-2 border-border bg-muted/30">
            <td className="py-2 px-4 font-semibold text-foreground sticky left-0 bg-muted/30 z-10">
              Total
            </td>
            <td className="text-center py-2 px-3 font-semibold text-foreground" data-testid="total-indexed">
              {totalIndexed.toLocaleString()}
            </td>
            {runs.length >= 2 && (
              <td className="text-center py-2 px-3 font-semibold">
                <DeltaCell
                  current={runs[0].totalFound}
                  previous={runs[1].totalFound}
                />
              </td>
            )}
            {runs.map((run, i) => (
              <td key={i} className="text-center py-2 px-3 font-semibold text-foreground">
                {run.totalFound.toLocaleString()}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row) => (
            <tr key={row.institution} className="border-b border-border/50 hover:bg-muted/20" data-testid={`scan-row-${row.institution.replace(/\s+/g, "-").toLowerCase()}`}>
              <td className="py-2 px-4 font-medium text-foreground sticky left-0 bg-card z-10 truncate max-w-[250px]" title={row.institution}>
                {row.institution}
              </td>
              <td className={`text-center py-2 px-3 tabular-nums ${(indexedCounts[row.institution] ?? 0) === 0 ? "text-muted-foreground/40" : "text-foreground font-medium"}`} data-testid={`indexed-${row.institution.replace(/\s+/g, "-").toLowerCase()}`}>
                {(indexedCounts[row.institution] ?? 0) > 0 ? (indexedCounts[row.institution]).toLocaleString() : "\u2014"}
              </td>
              {runs.length >= 2 && (
                <td className="text-center py-2 px-3">
                  <DeltaCell current={row.counts[0] ?? 0} previous={row.counts[1] ?? 0} />
                </td>
              )}
              {row.counts.map((count, i) => (
                <td key={i} className={`text-center py-2 px-3 tabular-nums ${count === 0 ? "text-muted-foreground/40" : "text-foreground"}`}>
                  {count > 0 ? count.toLocaleString() : "\u2014"}
                </td>
              ))}
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
            if (idxCount > 0) parts.push(`${idxCount} indexed`);
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

              {isEnriched && session.relevantCount > 0 && !zeroGuard && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-foreground">New Relevant Entries ({newEntries.length})</h4>
                    <Button
                      onClick={() => pushMutation.mutate(selectedInstitution)}
                      disabled={pushMutation.isPending || zeroGuard}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      data-testid="button-push-to-index"
                    >
                      {pushMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <ArrowUpCircle className="h-4 w-4 mr-2" />
                      )}
                      Push New Additions to Index
                    </Button>
                  </div>
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
              <BarChart3 className="h-4 w-4" />
              Scan Tracking
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
          </nav>
        </aside>

        <main className="flex-1 p-6 overflow-hidden">
          {activeTab === "scan-tracking" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Scan Tracking</h2>
                <p className="text-sm text-muted-foreground mt-1">Per-institution asset counts across scan runs</p>
              </div>
              <div className="border border-border rounded-xl bg-card overflow-hidden">
                <ScanTracking pw={pw} />
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
        </main>
      </div>
    </div>
  );
}
