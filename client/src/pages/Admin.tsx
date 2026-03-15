import React, { useState, useEffect, useRef, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Shield, Lock, LogOut, Loader2, Download, Database, RefreshCw, ArrowUpCircle, AlertTriangle, CheckCircle2, ExternalLink, Zap, Sparkles, DollarSign, Activity, AlertCircle, XCircle, Microscope, Trash2, ClipboardList, Lightbulb, Users, UserPlus, Copy, Check } from "lucide-react";
import type { ConceptCard } from "@shared/schema";
import { PORTAL_CONFIG, ALL_PORTAL_ROLES, getPortalConfig, type PortalRole } from "@shared/portals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  consecutiveFailures: number;
  health: HealthStatus;
}

interface SchedulerStatus {
  state: "idle" | "running" | "paused";
  currentInstitution: string | null;
  nextInstitution: string | null;
  queuePosition: number;
  queueTotal: number;
  completedThisCycle: number;
  failedThisCycle: number;
  cycleStartedAt: string | null;
  lastActivityAt: string | null;
  cycleCount: number;
  priorityQueue: string[];
  delayMs: number;
  avgSyncMs: number | null;
  estimatedRemainingMs: number | null;
  lastCycleCompletedAt: string | null;
}

interface CollectorHealthData {
  rows: CollectorHealthRow[];
  totalInDb: number;
  totalBiotechRelevant: number;
  totalInstitutions: number;
  issueCount: number;
  syncingCount: number;
  syncedToday: number;
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

function ExpandedSyncPanel({ institution, pw, onCollapse }: { institution: string; pw: string; onCollapse: () => void }) {
  const [polling, setPolling] = useState(true);
  const { toast } = useToast();

  const { data: statusData, refetch: refetchStatus } = useQuery<SyncStatusResponse>({
    queryKey: ["/api/ingest/sync/status", institution, pw],
    queryFn: async () => {
      const res = await fetch(`/api/ingest/sync/${encodeURIComponent(institution)}/status`, {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to load sync status");
      return res.json();
    },
    refetchInterval: polling ? 2000 : false,
  });

  useEffect(() => {
    if (statusData?.session?.status === "enriched" || statusData?.session?.status === "pushed" || statusData?.session?.status === "failed") {
      setPolling(false);
    }
  }, [statusData?.session?.status]);

  const cancelStaleMutation = useMutation({
    mutationFn: async () => {
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
    onSuccess: () => {
      toast({ title: "Session cleared", description: `Stale session for ${institution} reset` });
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
      toast({ title: "Cancel failed", description: err.message, variant: "destructive" });
    },
  });

  const pushMutation = useMutation({
    mutationFn: async () => {
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
      toast({ title: "Push failed", description: err.message, variant: "destructive" });
    },
  });

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

  if (!session) {
    return (
      <tr>
        <td colSpan={7} className="p-4 bg-muted/10 border-b border-border">
          <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading sync status for {institution}...</span>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={7} className="p-0 border-b border-border">
        <div className="bg-muted/10 border-t border-border" data-testid={`sync-panel-${institution.replace(/\s+/g, "-").toLowerCase()}`}>
          <div className="px-5 py-3 border-b border-border/50 bg-muted/20 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground text-sm" data-testid="sync-institution-name">{institution}</h3>
              {(session.lastRefreshedAt || session.completedAt) && (
                <p className="text-[11px] text-muted-foreground mt-0.5" data-testid="sync-last-refreshed">
                  Last refreshed: {formatDate(session.lastRefreshedAt ?? session.completedAt!)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={isPushed ? "default" : isFailed ? "destructive" : isEnriched ? "secondary" : "outline"}
                data-testid="sync-status-badge"
              >
                {session.status}
              </Badge>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onCollapse} data-testid="button-collapse-sync">
                <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          </div>

          {isRunning && (
            <div className="px-5 py-5" data-testid="sync-progress">
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
              {!syncIsActive && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => cancelStaleMutation.mutate()}
                  disabled={cancelStaleMutation.isPending}
                  data-testid="button-clear-stale"
                >
                  {cancelStaleMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Clear stale session
                </Button>
              )}
            </div>
          )}

          {(isEnriched || isPushed || isFailed) && (
            <div className="px-5 py-4 space-y-4" data-testid="sync-result-details">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <div className="text-xl font-bold tabular-nums text-foreground" data-testid="stat-currently-indexed">{currentIndexed}</div>
                  <div className="text-xs text-muted-foreground">Currently Indexed</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <div className="text-xl font-bold tabular-nums text-foreground" data-testid="stat-raw-scraped">{session.rawCount}</div>
                  <div className="text-xs text-muted-foreground">Raw Scraped</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <div className="text-xl font-bold tabular-nums text-foreground" data-testid="stat-new-found">{session.newCount}</div>
                  <div className="text-xs text-muted-foreground">New (Not in Index)</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <div className={`text-xl font-bold tabular-nums ${session.relevantCount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`} data-testid="stat-relevant">
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
                      onClick={() => pushMutation.mutate()}
                      disabled={pushMutation.isPending || zeroGuard || session.relevantCount === 0}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      size="sm"
                      data-testid="button-push-to-index"
                    >
                      {pushMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <ArrowUpCircle className="h-4 w-4 mr-2" />
                      )}
                      {session.relevantCount > 0 ? "Push to Index" : "Nothing to Push"}
                    </Button>
                  </div>
                  {newEntries.length > 0 && (
                    <div className="border border-border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
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
                <div className="text-center py-4 text-muted-foreground" data-testid="sync-no-new">
                  <CheckCircle2 className="h-6 w-6 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No new entries found — index is up to date.</p>
                </div>
              )}

              {isEnriched && session.relevantCount === 0 && session.newCount > 0 && (
                <div className="text-center py-4 text-muted-foreground" data-testid="sync-no-relevant">
                  <p className="text-sm">{session.newCount} new entries found, but none passed the biotech relevance filter.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function DataHealth({ pw }: { pw: string }) {
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [expandedInstitution, setExpandedInstitution] = useState<string | null>(null);
  const [schedulerOpen, setSchedulerOpen] = useState(true);
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

  const bumpMutation = useMutation({
    mutationFn: async (institution: string) => {
      const res = await fetch("/api/ingest/scheduler/bump", {
        method: "POST",
        headers: { "x-admin-password": pw, "Content-Type": "application/json" },
        body: JSON.stringify({ institution }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(d.error || "Bump failed");
      }
      return res.json();
    },
    onSuccess: (_d, institution) => {
      toast({ title: "Priority queued", description: `${institution} will sync next` });
    },
    onError: (err: Error) => {
      toast({ title: "Bump failed", description: err.message, variant: "destructive" });
    },
  });

  const syncingRows = (data?.rows ?? []).filter((r) => r.health === "syncing");
  useEffect(() => {
    if (syncingRows.length > 0 && !expandedInstitution) {
      setExpandedInstitution(syncingRows[0].institution);
    }
  }, [syncingRows.length]);

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
  const syncedToday = data.syncedToday ?? 0;

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
    onSuccess: (d: { ok: boolean; message?: string }) => {
      if (d.ok) {
        toast({ title: "Scheduler started", description: "Sequential sync cycle is running" });
      } else {
        toast({ title: "Cannot start", description: d.message, variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
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
    onSuccess: (d: { ok: boolean; message?: string }) => {
      if (d.ok) {
        toast({ title: "Scheduler paused" });
      } else {
        toast({ title: "Cannot pause", description: d.message, variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
      toast({ title: "Pause failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSyncClick = (institution: string) => {
    setExpandedInstitution(institution);
    syncMutation.mutate(institution);
  };

  const handleRowClick = (institution: string) => {
    setExpandedInstitution((prev) => prev === institution ? null : institution);
  };

  const schedRunning = sched.state === "running";
  const schedPaused = sched.state === "paused";

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Data Health</h2>
        <p className="text-sm text-muted-foreground mt-1">Monitor collector status, run institution syncs, and manage the sync scheduler</p>
      </div>

      <div className="border border-border rounded-xl bg-card overflow-hidden">
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
            <div className="text-2xl font-bold text-foreground tabular-nums" data-testid="stat-synced-today">{syncedToday}</div>
            <div className="text-xs text-muted-foreground">Synced Today</div>
            <div className="text-[10px] text-muted-foreground/60">of {data.totalInstitutions} institutions</div>
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

        <div className="px-4 py-3 border-b border-border bg-muted/20" data-testid="scheduler-strip">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setSchedulerOpen((v) => !v)} className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity">
                <Activity className="w-4 h-4 text-primary" />
                <span className="font-semibold text-foreground text-sm">Sequential Sync</span>
              </button>
              {sched.state === "idle" && sched.lastCycleCompletedAt && (
                <span className="text-[11px] text-muted-foreground/60">Last full cycle: {relativeTime(sched.lastCycleCompletedAt)}</span>
              )}
              {sched.state === "idle" && !sched.lastCycleCompletedAt && (
                <span className="text-[11px] text-muted-foreground/60">No cycles completed yet</span>
              )}
              {schedRunning && sched.currentInstitution && (
                <Badge variant="outline" className="text-xs gap-1 text-blue-600 border-blue-500/30 bg-blue-500/10">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {sched.currentInstitution}
                </Badge>
              )}
              {schedRunning && !sched.currentInstitution && (
                <span className="text-xs text-blue-600 font-medium">Waiting for next...</span>
              )}
              {schedPaused && (
                <span className="text-xs text-amber-600 font-medium">Paused at {sched.queuePosition}/{sched.queueTotal}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {schedRunning ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-amber-500/30 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
                  onClick={() => schedulerPauseMutation.mutate()}
                  disabled={schedulerPauseMutation.isPending}
                  data-testid="button-pause-scheduler"
                >
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Pause
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => schedulerStartMutation.mutate()}
                  disabled={schedulerStartMutation.isPending}
                  data-testid="button-start-scheduler"
                >
                  {schedulerStartMutation.isPending ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Zap className="w-3 h-3 mr-1" />
                  )}
                  {schedPaused ? "Resume" : "Start Cycle"}
                </Button>
              )}
            </div>
          </div>

          {schedulerOpen && (schedRunning || schedPaused) && sched && (
            <div className="mt-2 space-y-2" data-testid="scheduler-status">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">{sched.queuePosition}/{sched.queueTotal} done{sched.cycleCount > 1 && ` (cycle #${sched.cycleCount})`}</span>
                  <span className="text-emerald-600 font-medium">{sched.completedThisCycle} ok</span>
                  {sched.failedThisCycle > 0 && (
                    <span className="text-red-500 font-medium">{sched.failedThisCycle} failed</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {sched.estimatedRemainingMs != null && (
                    <span>ETA: <span className="font-medium text-foreground/70">{Math.ceil(sched.estimatedRemainingMs / 60000)}m</span></span>
                  )}
                  {sched.priorityQueue.length > 0 && (
                    <span className="text-blue-500">{sched.priorityQueue.length} priority queued</span>
                  )}
                  <span className="text-muted-foreground/50">Delay: {(sched.delayMs / 1000).toFixed(0)}s</span>
                </div>
              </div>
              <Progress
                value={sched.queueTotal > 0 ? (sched.queuePosition / sched.queueTotal) * 100 : 0}
                className="h-1.5 bg-blue-500/10"
                data-testid="scheduler-cycle-progress"
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/70">
                {sched.cycleStartedAt && (
                  <span>Cycle started {relativeTime(sched.cycleStartedAt)}</span>
                )}
                {sched.lastActivityAt && <span>Last activity {relativeTime(sched.lastActivityAt)}</span>}
                {sched.nextInstitution && (
                  <span>Next: <span className="font-medium text-foreground/70">{sched.nextInstitution}</span></span>
                )}
                {sched.lastCycleCompletedAt && (
                  <span>Last cycle completed {relativeTime(sched.lastCycleCompletedAt)}</span>
                )}
              </div>
            </div>
          )}
        </div>

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
                <th className="text-left py-3 px-3 font-semibold text-foreground min-w-[120px]">Error</th>
                <th className="text-center py-3 px-3 font-semibold text-foreground min-w-[60px]">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => {
                const isExpanded = expandedInstitution === row.institution;
                const instSlug = row.institution.replace(/\s+/g, "-").toLowerCase();
                return (
                  <React.Fragment key={row.institution}>
                    <tr
                      className={`border-b border-border/50 hover:bg-muted/20 cursor-pointer ${row.consecutiveFailures >= 3 ? "bg-red-500/5" : ""} ${isExpanded ? "bg-primary/5 border-b-0" : ""}`}
                      data-testid={`health-row-${instSlug}`}
                      onClick={() => handleRowClick(row.institution)}
                    >
                      <td className="py-2 px-4 font-medium text-foreground truncate max-w-[250px]" title={row.institution}>
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{row.institution}</span>
                          {row.consecutiveFailures >= 3 && (
                            <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-red-500 border-red-500/30 bg-red-500/5" data-testid={`badge-needs-attention-${instSlug}`}>
                              Broken Connection
                            </Badge>
                          )}
                          {row.consecutiveFailures >= 1 && row.consecutiveFailures < 3 && (
                            <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-amber-500 border-amber-500/30 bg-amber-500/5">
                              {row.consecutiveFailures}x failed
                            </Badge>
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
                      <td className={`text-center py-2 px-3 text-xs ${!row.lastSyncAt ? "text-muted-foreground/40" : "text-muted-foreground"}`}>
                        {row.health === "syncing" ? (
                          <span className="text-blue-600 dark:text-blue-400 font-medium">{row.phase ?? "syncing"}</span>
                        ) : (
                          relativeTime(row.lastSyncAt)
                        )}
                      </td>
                      <td className="text-left py-2 px-3" data-testid={`error-${instSlug}`}>
                        {row.lastSyncError ? (
                          <span className="text-xs text-red-500 truncate block max-w-[200px]" title={row.lastSyncError}>
                            {row.lastSyncError.length > 60 ? row.lastSyncError.slice(0, 60) + "..." : row.lastSyncError}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">&mdash;</span>
                        )}
                      </td>
                      <td className="text-center py-2 px-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {row.health === "stale" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950"
                              onClick={() => cancelMutation.mutate(row.institution)}
                              disabled={cancelMutation.isPending}
                              title={`Cancel stale session for ${row.institution}`}
                              data-testid={`button-cancel-${instSlug}`}
                            >
                              <XCircle className="h-3.5 w-3.5 mr-1" />
                              Cancel
                            </Button>
                          ) : row.health === "syncing" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-blue-600"
                              onClick={() => handleRowClick(row.institution)}
                              data-testid={`button-view-sync-${instSlug}`}
                            >
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                              View
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleSyncClick(row.institution)}
                                disabled={syncMutation.isPending}
                                title={`Sync ${row.institution}`}
                                data-testid={`button-sync-${instSlug}`}
                              >
                                <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                              </Button>
                              {sched.state === "running" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-blue-500 hover:text-blue-600"
                                  onClick={() => bumpMutation.mutate(row.institution)}
                                  disabled={bumpMutation.isPending}
                                  title={`Bump ${row.institution} to front of scheduler queue`}
                                  data-testid={`button-bump-${instSlug}`}
                                >
                                  <ArrowUpCircle className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <ExpandedSyncPanel
                        key={`panel-${row.institution}`}
                        institution={row.institution}
                        pw={pw}
                        onCollapse={() => setExpandedInstitution(null)}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
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

function PipelineReviewQueue({ pw }: { pw: string }) {
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<{ items: any[] }>({
    queryKey: ["/api/admin/review-queue"],
    queryFn: async () => {
      const res = await fetch("/api/admin/review-queue", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 0,
  });

  const resolve = useMutation({
    mutationFn: async ({ id, note }: { id: number; note: string }) => {
      const res = await fetch(`/api/admin/review-queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Resolved", description: "Review item resolved." });
    },
  });

  const wipeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/wipe-assets", {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to wipe");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scan-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/review-queue"] });
      toast({ title: "Wiped", description: "All ingested assets have been removed. Run a sync to re-collect." });
    },
    onError: () => toast({ title: "Error", description: "Wipe failed.", variant: "destructive" }),
  });

  const [confirmWipe, setConfirmWipe] = useState(false);

  const items = data?.items ?? [];

  return (
    <div className="space-y-6" data-testid="pipeline-review-tab">
      <div className="border border-border rounded-xl bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Asset Review Queue</h3>
            <p className="text-sm text-muted-foreground">Ambiguous assets flagged by the pre-filter for manual review</p>
          </div>
          <Badge variant="secondary" data-testid="badge-review-count">{items.length} pending</Badge>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No items pending review</div>
        ) : (
          <div className="space-y-2">
            {items.slice(0, 20).map((item: any) => (
              <div key={item.id} className="flex items-center justify-between p-3 border border-border rounded-lg" data-testid={`review-item-${item.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{item.fingerprint}</div>
                  <div className="text-xs text-muted-foreground">{item.reason}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolve.mutate({ id: item.id, note: "reviewed" })}
                  disabled={resolve.isPending}
                  data-testid={`button-resolve-${item.id}`}
                >
                  Resolve
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-destructive/30 rounded-xl bg-card p-5">
        <div className="flex items-center gap-3 mb-3">
          <Trash2 className="h-5 w-5 text-destructive" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">Wipe & Re-collect</h3>
            <p className="text-sm text-muted-foreground">Delete all ingested assets and start fresh. This is irreversible.</p>
          </div>
        </div>

        {!confirmWipe ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmWipe(true)}
            data-testid="button-wipe-start"
          >
            <Trash2 className="h-4 w-4 mr-1" /> Wipe All Assets
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-destructive font-medium">Are you sure? This deletes everything.</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { wipeMutation.mutate(); setConfirmWipe(false); }}
              disabled={wipeMutation.isPending}
              data-testid="button-wipe-confirm"
            >
              {wipeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, Wipe"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmWipe(false)}
              data-testid="button-wipe-cancel"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConceptQueue({ pw }: { pw: string }) {
  const { data, isLoading } = useQuery<{ concepts: ConceptCard[] }>({
    queryKey: ["/api/admin/concepts"],
    queryFn: async () => {
      const res = await fetch("/api/admin/concepts", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 0,
  });

  const concepts = data?.concepts ?? [];

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading concepts...</div>;
  if (concepts.length === 0) return <p className="text-sm text-muted-foreground">No concept cards submitted yet.</p>;

  return (
    <div className="space-y-3">
      {concepts.map((c) => (
        <div key={c.id} className="border border-border rounded-lg p-4 bg-card" data-testid={`admin-concept-${c.id}`}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-sm">{c.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{c.oneLiner}</p>
            </div>
            {c.credibilityScore !== null && (
              <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                c.credibilityScore >= 70
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : c.credibilityScore >= 40
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              }`}>
                <Sparkles className="w-3 h-3" />
                {c.credibilityScore}/100
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">{c.therapeuticArea}</span>
            <span className="px-2 py-0.5 rounded-full bg-muted font-medium">{c.modality}</span>
            <span className="px-2 py-0.5 rounded-full bg-muted font-medium">Stage {c.stage}</span>
            <span>by {c.submitterName}</span>
            <span className="ml-auto">
            {((c.interestCollaborating ?? 0) + (c.interestFunding ?? 0) + (c.interestAdvising ?? 0))} interest · {new Date(c.createdAt).toLocaleDateString()}
          </span>
          </div>
          {c.credibilityRationale && (
            <p className="text-xs text-muted-foreground italic mt-2 border-t border-border pt-2">AI: {c.credibilityRationale}</p>
          )}
        </div>
      ))}
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

interface AdminUser {
  id: string;
  email: string;
  role: PortalRole | null;
  createdAt: string;
  lastSignInAt: string | null;
}

function AccountCenter({ pw }: { pw: string }) {
  const { toast } = useToast();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<PortalRole>("concept");
  const [copiedRole, setCopiedRole] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ users: AdminUser[] }>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users", { headers: { "x-admin-password": pw } });
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
    staleTime: 30000,
    enabled: !!pw,
  });

  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: PortalRole }) => {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to update role");
      }
      return res.json();
    },
    onMutate: async ({ userId, role }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/admin/users"] });
      const prev = queryClient.getQueryData<{ users: AdminUser[] }>(["/api/admin/users"]);
      queryClient.setQueryData<{ users: AdminUser[] }>(["/api/admin/users"], (old) => {
        if (!old) return old;
        return { users: old.users.map((u) => u.id === userId ? { ...u, role } : u) };
      });
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated" });
    },
    onError: (err: Error, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(["/api/admin/users"], context.prev);
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const inviteUser = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ email: inviteEmail, password: invitePassword, role: inviteRole }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User created", description: `${inviteEmail} added as ${PORTAL_CONFIG[inviteRole].label}` });
      setShowInvite(false);
      setInviteEmail("");
      setInvitePassword("");
      setInviteRole("concept");
    },
    onError: (err: Error) => {
      toast({ title: "Invite failed", description: err.message, variant: "destructive" });
    },
  });

  const users = data?.users ?? [];

  const portalCounts: Record<string, number> = {};
  let unassignedCount = 0;
  for (const u of users) {
    if (u.role) {
      portalCounts[u.role] = (portalCounts[u.role] ?? 0) + 1;
    } else {
      unassignedCount++;
    }
  }

  function copyInviteLink(role: PortalRole) {
    const origin = window.location.origin;
    const cfg = PORTAL_CONFIG[role];
    navigator.clipboard.writeText(`${origin}${cfg.registerPath}`);
    setCopiedRole(role);
    setTimeout(() => setCopiedRole(null), 2000);
    toast({ title: "Link copied", description: `Registration link for ${cfg.label} copied to clipboard` });
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function timeAgoShort(iso: string | null) {
    if (!iso) return "Never";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <div className="space-y-6" data-testid="account-center-tab">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-total-users">{users.length}</div>
            <span className="text-sm text-muted-foreground">total users</span>
          </div>
          {unassignedCount > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1" data-testid="text-unassigned-count">
              {unassignedCount} user{unassignedCount !== 1 ? "s" : ""} without a portal assignment
            </p>
          )}
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setShowInvite(true)}
          data-testid="button-invite-user"
        >
          <UserPlus className="w-4 h-4" />
          Invite User
        </Button>
      </div>

      {showInvite && (
        <div className="border border-border rounded-xl bg-card p-5" data-testid="invite-modal">
          <h3 className="font-semibold text-sm text-foreground mb-4">Create New User</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Email</label>
              <Input
                type="email"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                data-testid="input-invite-email"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Password</label>
              <Input
                type="password"
                placeholder="Min 8 characters"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                data-testid="input-invite-password"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Portal</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as PortalRole)}
                data-testid="select-invite-role"
              >
                {ALL_PORTAL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {PORTAL_CONFIG[r].label} (Tier {PORTAL_CONFIG[r].tier})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => inviteUser.mutate()}
              disabled={!inviteEmail || invitePassword.length < 8 || inviteUser.isPending}
              data-testid="button-confirm-invite"
            >
              {inviteUser.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Create User
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowInvite(false); setInviteEmail(""); setInvitePassword(""); }}
              data-testid="button-cancel-invite"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 font-semibold text-foreground">Email</th>
                <th className="text-left py-3 px-4 font-semibold text-foreground min-w-[160px]">Portal</th>
                <th className="text-center py-3 px-4 font-semibold text-foreground">Joined</th>
                <th className="text-center py-3 px-4 font-semibold text-foreground">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const portal = getPortalConfig(user.role);
                return (
                  <tr key={user.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors" data-testid={`row-user-${user.id}`}>
                    <td className="py-2.5 px-4 text-foreground font-medium" data-testid={`text-email-${user.id}`}>
                      {user.email}
                    </td>
                    <td className="py-2.5 px-4">
                      <select
                        className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                        value={user.role ?? ""}
                        onChange={(e) => {
                          if (e.target.value) {
                            updateRole.mutate({ userId: user.id, role: e.target.value as PortalRole });
                          }
                        }}
                        data-testid={`select-role-${user.id}`}
                      >
                        {!user.role && <option value="">No portal assigned</option>}
                        {ALL_PORTAL_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {PORTAL_CONFIG[r].label} (Tier {PORTAL_CONFIG[r].tier})
                          </option>
                        ))}
                      </select>
                      {portal && (
                        <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${portal.badgeClass}`} data-testid={`badge-portal-${user.id}`}>
                          {portal.label}
                        </span>
                      )}
                      {!portal && user.role === null && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground" data-testid={`badge-unassigned-${user.id}`}>
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="text-center py-2.5 px-4 text-xs text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="text-center py-2.5 px-4 text-xs text-muted-foreground">
                      {timeAgoShort(user.lastSignInAt)}
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-muted-foreground">No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h3 className="font-semibold text-sm text-foreground mb-3">Portal Directory</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ALL_PORTAL_ROLES.map((role) => {
            const cfg = PORTAL_CONFIG[role];
            const count = portalCounts[role] ?? 0;
            return (
              <div
                key={role}
                className="border border-border rounded-xl bg-card p-4 space-y-3"
                data-testid={`card-portal-${role}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cfg.badgeClass}`}>
                      Tier {cfg.tier}
                    </span>
                    <h4 className="font-semibold text-foreground mt-1">{cfg.label}</h4>
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-foreground" data-testid={`stat-portal-count-${role}`}>
                    {count}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{cfg.description}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs gap-1.5"
                  onClick={() => copyInviteLink(role)}
                  data-testid={`button-copy-link-${role}`}
                >
                  {copiedRole === role ? (
                    <><Check className="w-3 h-3 text-emerald-500" /> Copied!</>
                  ) : (
                    <><Copy className="w-3 h-3" /> Copy invite link</>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [activeTab, setActiveTab] = useState("data-health");
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
  setTheme: (v: "light" | "dark") => void;
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
              onClick={() => setActiveTab("data-health")}
              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "data-health"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-data-health"
            >
              <Activity className="h-4 w-4" />
              Data Health
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
              onClick={() => setActiveTab("pipeline-review")}
              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "pipeline-review"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-pipeline-review"
            >
              <ClipboardList className="h-4 w-4" />
              Pipeline Review
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
            <button
              onClick={() => setActiveTab("concept-queue")}
              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "concept-queue"
                  ? "bg-amber-500/10 text-amber-600"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-concept-queue"
            >
              <Lightbulb className="h-4 w-4" />
              Concept Queue
            </button>

            <div className="border-t border-border my-2" />

            <button
              onClick={() => setActiveTab("account-center")}
              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "account-center"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-account-center"
            >
              <Users className="h-4 w-4" />
              Account Center
            </button>
          </nav>
        </aside>

        <main className="flex-1 p-6 overflow-hidden">
          {activeTab === "data-health" && (
            <DataHealth pw={pw} />
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

          {activeTab === "pipeline-review" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Pipeline Review</h2>
                <p className="text-sm text-muted-foreground mt-1">Review ambiguous assets, manage the review queue, and wipe/re-collect data</p>
              </div>
              <PipelineReviewQueue pw={pw} />
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

          {activeTab === "concept-queue" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Concept Queue</h2>
                <p className="text-sm text-muted-foreground mt-1">View all submitted concepts from the Eden Discovery portal with AI credibility scores.</p>
              </div>
              <ConceptQueue pw={pw} />
            </>
          )}

          {activeTab === "account-center" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Account Center</h2>
                <p className="text-sm text-muted-foreground mt-1">Manage user accounts, assign portal roles, and invite new users to the platform.</p>
              </div>
              <AccountCenter pw={pw} />
            </>
          )}

        </main>
      </div>
    </div>
  );
}
