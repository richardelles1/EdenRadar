import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Download, Database, RefreshCw, AlertTriangle, CheckCircle2, ExternalLink, Zap, Sparkles, Activity, AlertCircle, XCircle, Microscope, Trash2, ClipboardList, Lightbulb, Users, UserPlus, Copy, Check, Inbox, ChevronDown, ChevronRight, ChevronUp, Building2, Clock, PackagePlus, BrainCircuit, PlayCircle, BarChart3, Mic, MicOff, ThumbsUp, ThumbsDown, Bookmark, Layers, Plus, Upload, FileText, Image as ImageIcon, Pencil, BookOpen, X, CreditCard, Server, TrendingUp, Globe, MessageSquare, FlaskConical, Send, Eye, Tag, ArrowUp, ArrowDown, ChevronsUpDown, Square, Key, PowerOff, RotateCcw, ArrowUpCircle, Shield, ShieldCheck, Lock, LogOut, DollarSign, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { PORTAL_CONFIG, ALL_PORTAL_ROLES, getPortalConfig, type PortalRole } from "@shared/portals";
import type { ConceptCard } from "@shared/schema";
import { formatDate, timeAgo, relativeTime, getErrorType, HealthDot, HealthLabel } from "./_shared";
import type { HealthStatus, ErrorType, CollectorHealthRow, SchedulerStatus, ActiveSearchRow, CollectorHealthData, SyncSessionData, SyncStatusResponse } from "./_shared";

function ExpandedSyncPanel({ institution, pw, onCollapse, liveInDb }: { institution: string; pw: string; onCollapse: () => void; liveInDb?: number }) {
  const [polling, setPolling] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const { toast } = useToast();

  const { data: statusData, refetch: refetchStatus } = useQuery<SyncStatusResponse>({
    queryKey: ["/api/ingest/sync/status", institution, pw],
    queryFn: async () => {
      const res = await fetch(`/api/ingest/sync/${encodeURIComponent(institution)}/status`, {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) throw new Error("Failed to load sync status");
      return res.json();
    },
    refetchInterval: polling ? 2000 : 8000,
  });

  const { data: historyData } = useQuery<{ sessions: SyncSessionData[] }>({
    queryKey: ["/api/ingest/sync/history", institution, pw],
    queryFn: async () => {
      const res = await fetch(`/api/ingest/sync/${encodeURIComponent(institution)}/history`, {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) return { sessions: [] };
      return res.json();
    },
    staleTime: 30000,
  });

  const syncForThisInst = !!(statusData?.syncRunning && statusData?.syncRunningFor === institution);

  useEffect(() => {
    const status = statusData?.session?.status;
    const isTerminal = status === "enriched" || status === "pushed" || status === "failed" || status === "anomalous";
    if (isTerminal) {
      setPolling(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ingest/sync/history", institution, pw] });
    } else if ((syncForThisInst || status === "running") && !polling) {
      setPolling(true);
    }
  }, [statusData?.session?.status, syncForThisInst]);

  const cancelStaleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/ingest/sync/${encodeURIComponent(institution)}/cancel`, {
        method: "POST",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
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
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
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

  type RefreshResult = { checked: number; fieldsUpdated: number; queuedTotal: number; queuedRelevant: number; message: string };
  type InstitutionQuality = { relevantCount: number; avgCompletenessScore: number | null; enrichQueueCount: number; enrichedLast24h: number; biologyFillPct: number | null };
  type EnrichStatus = { status: string; processed?: number; total?: number; improved?: number };
  type EnrichJobRow = { id: number; status: string; total: number; processed: number; improved: number; startedAt: string; completedAt: string | null; filters: Record<string, string> | null; completenessBeforeRun: number | null; completenessAfterRun: number | null };
  type QualitySnapshot = { id: number; institution: string; capturedAt: string; relevantCount: number; avgCompleteness: number | null; enrichQueueCount: number; enrichedLast24h: number };

  function fmtDuration(startedAt: string, completedAt: string | null): string {
    if (!completedAt) return "—";
    const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    if (ms < 0) return "—";
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60), rem = s % 60;
    return `${m}m ${rem}s`;
  }
  function fmtHitRate(improved: number, processed: number): string {
    if (!processed) return "—";
    return `${Math.round((improved / processed) * 100)}%`;
  }
  function fmtAgo(ts: string): string {
    const ms = Date.now() - new Date(ts).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  const { data: qualityData, isLoading: qualityLoading, refetch: refetchQuality } = useQuery<InstitutionQuality>({
    queryKey: ["/api/admin/enrichment/institution-quality", institution],
    queryFn: async () => {
      const res = await fetch(`/api/admin/enrichment/institution-quality?institution=${encodeURIComponent(institution)}`, {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) throw new Error("Failed to fetch quality");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: enrichStatus } = useQuery<EnrichStatus>({
    queryKey: ["/api/admin/enrichment/status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/status", {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) throw new Error("Failed to fetch enrichment status");
      return res.json();
    },
    refetchInterval: (query) => query.state.data?.status === "running" ? 3_000 : 30_000,
  });

  const { data: qualityHistory } = useQuery<QualitySnapshot[]>({
    queryKey: ["/api/admin/enrichment/institution-quality/history", institution],
    queryFn: async () => {
      const res = await fetch(`/api/admin/enrichment/institution-quality/history?institution=${encodeURIComponent(institution)}`, {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  const snapshotMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/enrichment/institution-quality/snapshot?institution=${encodeURIComponent(institution)}`, {
        method: "POST",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) throw new Error("Snapshot failed");
    },
    onSuccess: () => {
      clearImprovementBadge();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrichment/institution-quality/history", institution] });
    },
  });

  const [completenessImprovement, setCompletenessImprovement] = useState<number | null>(null);
  const [improvementFading, setImprovementFading] = useState(false);
  const improvementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const improvementFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justCompletedRef = useRef(false);

  function clearImprovementBadge() {
    if (improvementTimerRef.current) clearTimeout(improvementTimerRef.current);
    if (improvementFadeTimerRef.current) clearTimeout(improvementFadeTimerRef.current);
    setCompletenessImprovement(null);
    setImprovementFading(false);
  }

  useEffect(() => {
    return () => {
      if (improvementTimerRef.current) clearTimeout(improvementTimerRef.current);
      if (improvementFadeTimerRef.current) clearTimeout(improvementFadeTimerRef.current);
    };
  }, [institution]);

  const prevEnrichStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevEnrichStatusRef.current === "running" && enrichStatus?.status !== "running") {
      justCompletedRef.current = true;
      refetchQuality();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrichment/jobs", institution] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrichment/institution-quality/history", institution] });
    }
    prevEnrichStatusRef.current = enrichStatus?.status;
  }, [enrichStatus?.status]);

  useEffect(() => {
    if (!justCompletedRef.current) return;
    if (!qualityHistory || qualityHistory.length < 2) {
      justCompletedRef.current = false;
      return;
    }
    justCompletedRef.current = false;
    const newest = qualityHistory[0];
    const previous = qualityHistory[1];
    if (newest.avgCompleteness !== null && previous.avgCompleteness !== null) {
      const delta = Math.round(newest.avgCompleteness - previous.avgCompleteness);
      if (delta > 0) {
        clearImprovementBadge();
        setCompletenessImprovement(delta);
        setImprovementFading(false);
        improvementFadeTimerRef.current = setTimeout(() => setImprovementFading(true), 9_000);
        improvementTimerRef.current = setTimeout(() => {
          setCompletenessImprovement(null);
          setImprovementFading(false);
        }, 10_000);
      }
    }
  }, [qualityHistory]);

  const { data: jobHistory } = useQuery<EnrichJobRow[]>({
    queryKey: ["/api/admin/enrichment/jobs", institution],
    queryFn: async () => {
      const res = await fetch(`/api/admin/enrichment/jobs?institution=${encodeURIComponent(institution)}`, {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  const enrichNowMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ institution }),
      });
      const data = await res.json();
      if (res.status === 409) return { alreadyRunning: true, message: data.error ?? "Enrichment already running", total: 0, jobId: null };
      if (!res.ok) throw new Error(data.error || "Failed to start enrichment");
      return { alreadyRunning: false, message: data.message as string, total: (data.total as number) ?? 0, deferred: (data.deferred as number) ?? 0, jobId: (data.jobId as number) ?? null };
    },
    onSuccess: (data) => {
      if (data.alreadyRunning) {
        toast({ title: "Enrichment already running", description: "A job is in progress — check the Data Quality tab to monitor it." });
      } else if (!data.total || !data.jobId) {
        toast({ title: "No eligible assets", description: "All assets for this institution already meet enrichment criteria or are at the attempt cap." });
      } else {
        const deferredNote = (data.deferred ?? 0) > 0
          ? ` (${data.deferred} deferred — run again after this batch finishes)`
          : "";
        toast({
          title: "Enrichment started",
          description: `${data.total} asset${data.total !== 1 ? "s" : ""} queued for AI enrichment (job #${data.jobId})${deferredNote}`,
        });
      }
      refetchQuality();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrichment/status"] });
    },
    onError: (err: Error) => {
      toast({ title: "Enrichment failed to start", description: err.message, variant: "destructive" });
    },
  });

  const refreshScrapedFieldsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/ingest/sync/${encodeURIComponent(institution)}/refresh-scraped-fields`, {
        method: "POST",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Refresh failed");
      }
      return res.json() as Promise<RefreshResult>;
    },
    onSuccess: (data) => {
      refetchQuality();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrichment/health", pw] });
      snapshotMutation.mutate();
      toast({
        title: "Fields refreshed",
        description: data.message,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" });
    },
  });

  const session = statusData?.session;
  const newEntries = statusData?.newEntries ?? [];
  const isRunning = session?.status === "running" || syncForThisInst;
  const isEnriched = session?.status === "enriched" && !syncForThisInst;
  const isPushed = session?.status === "pushed" && !syncForThisInst;
  const isFailed = session?.status === "failed" && !syncForThisInst;
  const isInterrupted = isFailed && session?.errorMessage === "Server restarted during sync";
  const isAnomalous = session?.status === "anomalous" && !syncForThisInst;
  const syncIsActive = statusData?.syncRunning ?? false;

  const rawCount = session?.rawCount ?? 0;
  const currentInDb = liveInDb ?? session?.currentIndexed ?? 0;
  // zeroGuard fires only when the session has an error message (HTTP error, block, rate-limit)
  // OR when the DB is empty — meaning the scraper genuinely couldn't collect anything.
  // A clean enriched+0 with no error message and existing DB rows means "index is current."
  const zeroGuard = isEnriched && rawCount === 0 && (!!session?.errorMessage || currentInDb === 0);
  const upToDate = isEnriched && rawCount === 0 && !session?.errorMessage && currentInDb > 0;
  const softWarning = isEnriched && currentInDb > 0 && rawCount > 0 && rawCount < currentInDb * 0.5;

  const phaseLabel = syncForThisInst && session?.status !== "running" ? "Starting sync..."
    : session?.phase === "scraping" ? "Collecting..."
    : session?.phase === "comparing" ? "Comparing fingerprints..."
    : session?.phase === "enriching" ? "Enriching with AI..."
    : session?.phase === "done" ? "Done"
    : "";

  const recentHistory = (historyData?.sessions ?? []).filter(
    (s) => s.status === "pushed" || s.status === "failed" || s.status === "enriched"
  ).slice(0, 4);

  if (!statusData) {
    return (
      <tr>
        <td colSpan={7} className="p-4 bg-muted/10 border-b border-border">
          <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground" data-testid="sync-panel-loading">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading sync status for {institution}...</span>
          </div>
        </td>
      </tr>
    );
  }

  if (!statusData.found || !session) {
    return (
      <tr>
        <td colSpan={7} className="p-0 border-b border-border">
          <div className="bg-muted/10 border-t border-border px-5 py-5" data-testid={`sync-panel-empty-${institution.replace(/\s+/g, "-").toLowerCase()}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Database className="h-5 w-5 opacity-40" />
                <div>
                  <p className="text-sm font-medium text-foreground">{institution}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">No sync session found. This institution has not been synced yet.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onCollapse} data-testid="button-collapse-sync-empty">
                  <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            </div>
            {recentHistory.length > 0 && (
              <div className="mt-4 border-t border-border/40 pt-3" data-testid="sync-history-only">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Past Sessions</h4>
                <div className="space-y-1">
                  {recentHistory.map((s, i) => (
                    <div key={s.sessionId} className="flex items-center justify-between py-1.5 px-3 rounded-md bg-muted/30 text-xs" data-testid={`history-row-empty-${i}`}>
                      <div className="flex items-center gap-2">
                        {s.status === "pushed" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-label="Pushed to pipeline" />
                        ) : s.status === "failed" ? (
                          <XCircle className="h-3.5 w-3.5 text-red-500" aria-label="Collection failed" />
                        ) : s.status === "enriched" && (s.rawCount ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 text-blue-500"><Clock className="h-3.5 w-3.5 shrink-0" aria-label="Ready to push" /><span className="text-[10px] font-medium">ready</span></span>
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-amber-500" aria-label="Collected 0 results: site may have been unreachable" />
                        )}
                        <span className="text-muted-foreground">{s.completedAt ? formatDate(s.completedAt) : "In progress"}</span>
                      </div>
                      <div className="flex items-center gap-3 text-muted-foreground/70">
                        <span>{s.rawCount} collected</span>
                        <span className={s.relevantCount > 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}>{s.relevantCount} relevant</span>
                        {s.pushedCount > 0 && <span className="text-primary font-medium">{s.pushedCount} pushed</span>}
                        <span className={(s.contentUpdated ?? 0) > 0 ? "text-blue-600 dark:text-blue-400 font-medium" : ""}>{s.contentUpdated ?? 0} updated</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                variant={isPushed ? "default" : (isFailed && !isInterrupted) ? "destructive" : isAnomalous ? "destructive" : isEnriched ? "secondary" : "outline"}
                className={isRunning ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800" : isInterrupted ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800" : isAnomalous ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800" : ""}
                data-testid="sync-status-badge"
              >
                {syncForThisInst && session?.status !== "running" ? "starting…" : session.status}
              </Badge>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onCollapse} data-testid="button-collapse-sync">
                <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          </div>

          {isAnomalous && (
            <div className="px-5 py-4" data-testid="sync-anomaly-warning">
              <div className="flex items-start gap-3 p-4 rounded-lg border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/30">
                <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-orange-700 dark:text-orange-400">Anomaly detected: sync halted</p>
                  <p className="text-xs text-orange-600 dark:text-orange-500 mt-1">
                    Too many new assets relative to the existing index, suspected dedup failure. New rows quarantined. Go to the Indexing Queue to release (then re-sync to classify) or discard them.
                  </p>
                </div>
              </div>
            </div>
          )}

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
                {rawCount > 0 ? `${rawCount} raw listings collected` : "Fetching listings from institution..."}
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
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <div className="text-xl font-bold tabular-nums text-foreground" data-testid="stat-currently-indexed">{currentInDb}</div>
                  <div className="text-xs text-muted-foreground">In DB Now</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <div className="text-xl font-bold tabular-nums text-foreground" data-testid="stat-raw-scraped">{session.rawCount}</div>
                  <div className="text-xs text-muted-foreground">Raw Collected</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <div className="text-xl font-bold tabular-nums text-foreground" data-testid="stat-new-found">{session.newCount}</div>
                  <div className="text-xs text-muted-foreground">New (Not in Index)</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <div className={`text-xl font-bold tabular-nums ${session.relevantCount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`} data-testid="stat-relevant">
                    {session.relevantCount}
                  </div>
                  <div className="text-xs text-muted-foreground">New + Relevant</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <div className={`text-xl font-bold tabular-nums ${(session.contentUpdated ?? 0) > 0 ? "text-blue-600 dark:text-blue-400" : "text-foreground"}`} data-testid="stat-content-updated">
                    {session.contentUpdated ?? 0}
                  </div>
                  <div className="text-xs text-muted-foreground">Descriptions Updated</div>
                </div>
              </div>

              {isFailed && session?.errorMessage && (
                <div className={`flex items-start gap-3 p-4 rounded-lg border ${isInterrupted ? "border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30" : "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30"}`} data-testid="sync-fail-reason">
                  {isInterrupted
                    ? <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    : <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />}
                  <div>
                    <p className={`text-sm font-medium ${isInterrupted ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400"}`}>
                      {isInterrupted ? "Interrupted by server restart" : "Collection failed"}
                    </p>
                    <p className={`text-xs mt-1 font-mono break-all ${isInterrupted ? "text-amber-600 dark:text-amber-500" : "text-red-600 dark:text-red-500"}`}>{session.errorMessage}</p>
                  </div>
                </div>
              )}

              {upToDate && (
                <div className="flex items-start gap-3 p-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" data-testid="sync-up-to-date">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Index is current — no new listings found</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">The collector ran successfully. All {currentInDb} known listings are already indexed.</p>
                  </div>
                </div>
              )}

              {zeroGuard && (() => {
                const errMsg = session?.errorMessage ?? null;
                const m = (errMsg ?? "").toLowerCase();
                const isSiteDown = m.includes(" 503") || m.includes(" 502") || m.includes(" 500") || m.includes("service unavailable") || m.includes("maintenance");
                const isRateLimited = m.includes(" 429") || m.includes("rate limit") || m.includes("too many request");
                const isBlocked = m.includes(" 403") || m.includes("cloudflare") || m.includes("bot challenge") || m.includes("access denied");
                const isParserFailure = !errMsg;
                const borderCls = isSiteDown ? "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30" : isRateLimited ? "border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/30" : isBlocked ? "border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30" : "border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/30";
                const textCls = isSiteDown ? "text-red-700 dark:text-red-400" : isRateLimited ? "text-orange-700 dark:text-orange-400" : isBlocked ? "text-amber-700 dark:text-amber-400" : "text-violet-700 dark:text-violet-400";
                const detailCls = isSiteDown ? "text-red-600 dark:text-red-500" : isRateLimited ? "text-orange-600 dark:text-orange-500" : isBlocked ? "text-amber-600 dark:text-amber-500" : "text-violet-600 dark:text-violet-500";
                const iconCls = isSiteDown ? "text-red-500" : isRateLimited ? "text-orange-500" : isBlocked ? "text-amber-500" : "text-violet-500";
                const title = isSiteDown ? "Site is down or in maintenance" : isRateLimited ? "Collector was rate-limited" : isBlocked ? "Access blocked (WAF / bot protection)" : "Parser failure — collector returned 0 results";
                const detail = errMsg ?? "The collector ran without an HTTP error but found no listings. A CSS selector change or site layout update likely broke the parser.";
                return (
                  <div className={`flex items-start gap-3 p-4 rounded-lg border ${borderCls}`} data-testid="sync-zero-guard">
                    <AlertTriangle className={`h-5 w-5 ${iconCls} flex-shrink-0 mt-0.5`} />
                    <div>
                      <p className={`text-sm font-medium ${textCls}`}>{title} — push blocked</p>
                      <p className={`text-xs ${detailCls} mt-1 font-mono break-all`}>{detail}</p>
                    </div>
                  </div>
                );
              })()}

              {softWarning && !zeroGuard && (
                <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30" data-testid="sync-soft-warning">
                  <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Results significantly below expected count</p>
                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                      Collected {rawCount} results but {currentInDb} are currently in DB. This is below 50% of the expected count; the collector may only be returning partial results.
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

              {isFailed && !session?.errorMessage && (
                <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30" data-testid="sync-failed">
                  <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">Sync failed</p>
                    <p className="text-xs text-red-600 dark:text-red-500 mt-1">The collector encountered an error. Check server logs for details.</p>
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
                    <div className="border border-border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto" data-testid="sync-new-entries">
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
                            <tr
                              key={i}
                              className="border-b border-border/50 hover:bg-muted/20 opacity-0"
                              style={{
                                animation: `syncEntryIn 0.25s ease forwards`,
                                animationDelay: `${i * 60}ms`,
                              }}
                              data-testid={`sync-entry-${i}`}
                            >
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
                  <p className="text-sm">No new entries found. Index is up to date.</p>
                </div>
              )}

              {isEnriched && session.relevantCount === 0 && session.newCount > 0 && (
                <div className="text-center py-4 text-muted-foreground" data-testid="sync-no-relevant">
                  <p className="text-sm">{session.newCount} new entries found, but none passed the biotech relevance filter.</p>
                </div>
              )}
            </div>
          )}

          {recentHistory.length > 0 && (
            <div className="px-5 pb-4 pt-2 border-t border-border/40" data-testid="sync-session-history">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent Sessions</h4>
              <div className="space-y-1">
                {recentHistory.map((s, i) => (
                  <div
                    key={s.sessionId}
                    className="flex items-center justify-between py-1.5 px-3 rounded-md bg-muted/30 text-xs"
                    style={{ animation: `syncEntryIn 0.2s ease forwards`, animationDelay: `${i * 40}ms`, opacity: 0 }}
                    data-testid={`history-row-${i}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {s.status === "pushed" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" aria-label="Pushed to pipeline" />
                      ) : s.status === "failed" ? (
                        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" aria-label="Collection failed" />
                      ) : s.status === "enriched" && (s.rawCount ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-blue-500 shrink-0"><Clock className="h-3.5 w-3.5" aria-label="Ready to push" /><span className="text-[10px] font-medium">ready</span></span>
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-label="Collected 0 results: site may have been unreachable" />
                      )}
                      <span className="text-muted-foreground truncate">
                        {s.completedAt ? formatDate(s.completedAt) : "In progress"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground/70 shrink-0 ml-3">
                      <span>{s.rawCount} collected</span>
                      <span className={s.relevantCount > 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}>{s.relevantCount} relevant</span>
                      {s.pushedCount > 0 && <span className="text-primary font-medium">{s.pushedCount} pushed</span>}
                      <span className={(s.contentUpdated ?? 0) > 0 ? "text-blue-600 dark:text-blue-400 font-medium" : ""}>{s.contentUpdated ?? 0} updated</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isRunning && (
            <div className="px-5 pb-4 pt-3 border-t border-border/40" data-testid="enrichment-quality-panel">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">Enrichment Quality</h4>
              {qualityLoading && !qualityData ? (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" data-testid="quality-skeleton">
                  {[0,1,2,3,4].map((i) => (
                    <div key={i} className="rounded-lg border border-border bg-muted/40 p-2.5 text-center animate-pulse">
                      <div className="h-6 w-12 bg-muted rounded mx-auto mb-1" />
                      <div className="h-2.5 w-16 bg-muted rounded mx-auto" />
                    </div>
                  ))}
                </div>
              ) : qualityData ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <div className="rounded-lg border border-border bg-background p-2.5 text-center" data-testid="quality-relevant-count">
                      <div className="text-lg font-bold tabular-nums text-foreground">{qualityData.relevantCount}</div>
                      <div className="text-[10px] text-muted-foreground">Relevant Assets</div>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-2.5 text-center" data-testid="quality-avg-completeness">
                      <div className={`text-lg font-bold tabular-nums flex items-center justify-center gap-1 ${qualityData.avgCompletenessScore == null ? "text-muted-foreground" : qualityData.avgCompletenessScore >= 20 ? "text-emerald-600 dark:text-emerald-400" : qualityData.avgCompletenessScore >= 10 ? "text-amber-600 dark:text-amber-400" : "text-red-500"}`}>
                        {qualityData.avgCompletenessScore != null ? qualityData.avgCompletenessScore : "—"}
                        {completenessImprovement !== null && (
                          <span
                            data-testid="completeness-improvement-badge"
                            className={`inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 transition-opacity duration-1000 ${improvementFading ? "opacity-0" : "opacity-100"}`}
                          >
                            +{completenessImprovement} pts
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Avg Completeness</div>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-2.5 text-center" data-testid="quality-enriched-24h">
                      <div className={`text-lg font-bold tabular-nums ${qualityData.enrichedLast24h > 0 ? "text-blue-600 dark:text-blue-400" : "text-foreground"}`}>{qualityData.enrichedLast24h}</div>
                      <div className="text-[10px] text-muted-foreground">Enriched (24 h)</div>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-2.5 text-center" data-testid="quality-enrich-queue">
                      {enrichStatus?.status === "running" ? (
                        <>
                          <div className="text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400 flex items-center justify-center gap-1">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {enrichStatus.processed ?? 0}/{enrichStatus.total ?? "?"}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Enriching...</div>
                        </>
                      ) : (
                        <>
                          <div className={`text-lg font-bold tabular-nums ${qualityData.enrichQueueCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>{qualityData.enrichQueueCount}</div>
                          <div className="text-[10px] text-muted-foreground">Ready to Enrich</div>
                        </>
                      )}
                    </div>
                    <div className="rounded-lg border border-border bg-background p-2.5 text-center" data-testid="quality-biology-fill">
                      <div className={`text-lg font-bold tabular-nums ${qualityData.biologyFillPct == null ? "text-muted-foreground" : qualityData.biologyFillPct >= 80 ? "text-teal-600 dark:text-teal-400" : qualityData.biologyFillPct >= 30 ? "text-amber-600 dark:text-amber-400" : "text-red-500"}`}>
                        {qualityData.biologyFillPct != null ? `${qualityData.biologyFillPct}%` : "—"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Biology Fill %</div>
                    </div>
                  </div>
                  {(qualityData.enrichQueueCount > 0 || enrichStatus?.status === "running") && (
                    <div className="mt-2.5" data-testid="quality-enrich-action">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-block">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1.5 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50"
                              onClick={() => enrichNowMutation.mutate()}
                              disabled={enrichNowMutation.isPending || enrichStatus?.status === "running"}
                              data-testid="button-enrich-now"
                            >
                              {enrichNowMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : enrichStatus?.status === "running" ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Zap className="h-3 w-3" />
                              )}
                              {qualityData.enrichQueueCount > 500
                                ? `Enrich 500 of ${qualityData.enrichQueueCount} assets now (first batch)`
                                : `Enrich ${qualityData.enrichQueueCount} asset${qualityData.enrichQueueCount !== 1 ? "s" : ""} now`}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs max-w-xs">
                          {enrichStatus?.status === "running"
                            ? `Enrichment already running (${enrichStatus.processed ?? 0}/${enrichStatus.total ?? 0} processed globally) — wait for it to finish.`
                            : `Starts GPT-4o-mini enrichment for the ${qualityData.enrichQueueCount} relevant assets from ${institution} that still have missing or incomplete fields.`}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                  {jobHistory && jobHistory.length > 0 && enrichStatus?.status !== "running" && qualityData.enrichQueueCount > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-400" data-testid="enrich-queue-remaining-notice">
                      <span>↻ {qualityData.enrichQueueCount} asset{qualityData.enrichQueueCount !== 1 ? "s" : ""} still in queue — run again to continue</span>
                      <button
                        type="button"
                        className="underline underline-offset-2 font-medium hover:text-amber-900 dark:hover:text-amber-200 transition-colors disabled:opacity-50"
                        onClick={() => enrichNowMutation.mutate()}
                        disabled={enrichNowMutation.isPending}
                        data-testid="button-enrich-run-again"
                      >
                        Run again
                      </button>
                    </div>
                  )}
                  {jobHistory && jobHistory.length > 0 && (
                    <div className="mt-3 border-t border-border/30 pt-3" data-testid="enrichment-job-history">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors w-full text-left"
                        onClick={() => setShowHistory((v) => !v)}
                        data-testid="toggle-enrichment-history"
                      >
                        <span className="text-[9px]">{showHistory ? "▾" : "▸"}</span>
                        Recent enrichment runs ({jobHistory.length})
                      </button>
                      {showHistory && (
                        <table className="w-full text-[11px] mt-1.5">
                          <thead>
                            <tr className="text-muted-foreground">
                              <th className="text-left font-medium pb-1 pr-3">Started</th>
                              <th className="text-right font-medium pb-1 pr-3">Processed</th>
                              <th className="text-right font-medium pb-1 pr-3">Improved</th>
                              <th className="text-right font-medium pb-1 pr-3">Hit rate</th>
                              <th className="text-right font-medium pb-1 pr-3">Δ Score</th>
                              <th className="text-right font-medium pb-1">Duration</th>
                            </tr>
                          </thead>
                          <tbody>
                            {jobHistory.slice(0, 5).map((job) => {
                              const delta = job.completenessAfterRun !== null && job.completenessBeforeRun !== null
                                ? job.completenessAfterRun - job.completenessBeforeRun
                                : null;
                              return (
                                <tr key={job.id} className="border-t border-border/20" data-testid={`enrichment-job-row-${job.id}`}>
                                  <td className="py-1 pr-3 text-muted-foreground">{fmtAgo(job.startedAt)}</td>
                                  <td className="py-1 pr-3 text-right tabular-nums">{job.processed}</td>
                                  <td className="py-1 pr-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{job.improved}</td>
                                  <td className={`py-1 pr-3 text-right tabular-nums font-medium ${job.processed > 0 && (job.improved / job.processed) >= 0.7 ? "text-emerald-600 dark:text-emerald-400" : job.processed > 0 && (job.improved / job.processed) >= 0.4 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                                    {fmtHitRate(job.improved, job.processed)}
                                  </td>
                                  <td className={`py-1 pr-3 text-right tabular-nums font-medium ${delta !== null && delta > 0 ? "text-emerald-600 dark:text-emerald-400" : delta !== null && delta < 0 ? "text-red-500 dark:text-red-400" : "text-muted-foreground"}`} data-testid={`enrichment-job-delta-${job.id}`}>
                                    {delta !== null && delta !== 0 ? (delta > 0 ? `+${delta} pts` : `${delta} pts`) : "—"}
                                  </td>
                                  <td className="py-1 text-right tabular-nums text-muted-foreground">{fmtDuration(job.startedAt, job.completedAt)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                  <div className="mt-3 border-t border-border/30 pt-3" data-testid="completeness-trend-panel">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Completeness trend</div>
                    {!qualityHistory || qualityHistory.length < 2 ? (
                      <div className="text-[11px] text-muted-foreground italic">No trend data yet — appears after the first enrichment run</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={80}>
                        <LineChart data={[...qualityHistory].reverse().map(s => ({
                          ...s,
                          label: new Date(s.capturedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                          score: s.avgCompleteness,
                        }))}>
                          <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                          <YAxis hide domain={["auto", "auto"]} />
                          <RechartsTooltip
                            contentStyle={{ fontSize: 11, padding: "4px 8px" }}
                            formatter={(value: number, _name: string, props: { payload?: QualitySnapshot }) => {
                              const s = props.payload;
                              if (!s) return [value, "Completeness"];
                              return [`${value} completeness · ${s.enrichQueueCount} queued`, new Date(s.capturedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })];
                            }}
                            labelFormatter={() => ""}
                          />
                          <Line
                            type="monotone"
                            dataKey="score"
                            stroke="var(--color-primary, #6366f1)"
                            strokeWidth={1.5}
                            dot={<Dot r={2} />}
                            activeDot={{ r: 3 }}
                            connectNulls
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}

          {!isRunning && (
            <div className="px-5 pb-3 pt-2 border-t border-border/30 flex items-center gap-2" data-testid="sync-maintenance-tools">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground text-xs h-7 px-2"
                onClick={() => refreshScrapedFieldsMutation.mutate()}
                disabled={refreshScrapedFieldsMutation.isPending}
                data-testid="button-refresh-scraped-fields"
              >
                {refreshScrapedFieldsMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1.5" />
                )}
                Refresh scraped fields
              </Button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

type SortKey = "institution" | "health" | "totalInDb" | "biotechRelevant" | "lastSyncAt";

function DataHealth({ pw }: { pw: string }) {
  const [statusFilter, setStatusFilter] = useState<"all" | HealthStatus>("all");
  const [errorTypeFilter, setErrorTypeFilter] = useState<ErrorType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedInstitution, setExpandedInstitution] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("health");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [liveOpen, setLiveOpen] = useState(true);
  const [activeSearchOpen, setActiveSearchOpen] = useState(false);
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [healthPanelOpen, setHealthPanelOpen] = useState(false);
  const lastStableOrder = useRef<string[]>([]);
  const userCollapsedRef = useRef<string | null>(null);
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<CollectorHealthData>({
    queryKey: ["/api/admin/collector-health", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/collector-health", {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
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

  const [pendingSyncInst, setPendingSyncInst] = useState<string | null>(null);
  const [cancellingInstitution, setCancellingInstitution] = useState<string | null>(null);

  const syncMutation = useMutation({
    mutationFn: async (institution: string) => {
      const res = await fetch(`/api/ingest/sync/${encodeURIComponent(institution)}`, {
        method: "POST",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Sync failed");
      }
      return res.json();
    },
    onSuccess: (_d, institution) => {
      toast({ title: "Sync started", description: `Syncing ${institution}...` });
      setPendingSyncInst(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
      setPendingSyncInst(null);
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (institution: string) => {
      const res = await fetch(`/api/ingest/sync/${encodeURIComponent(institution)}/cancel`, {
        method: "POST",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Cancel failed");
      }
      return res.json();
    },
    onMutate: (institution) => { setCancellingInstitution(institution); },
    onSettled: () => { setCancellingInstitution(null); },
    onSuccess: (_d, institution) => {
      toast({ title: "Sync cancelled", description: `Sync for ${institution} cancelled` });
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
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}), "Content-Type": "application/json" },
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

  const schedulerStartMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ingest/scheduler/start", {
        method: "POST",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
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
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
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

  const [resetConfirm, setResetConfirm] = useState(false);
  const resetConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedulerResetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ingest/scheduler/reset", {
        method: "POST",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (d: { ok: boolean; message?: string }) => {
      setResetConfirm(false);
      if (d.ok) {
        toast({ title: "Restarted from scratch", description: d.message });
      } else {
        toast({ title: "Cannot reset", description: d.message, variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
      setResetConfirm(false);
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    },
  });

  const handleResetClick = () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      if (resetConfirmTimer.current) clearTimeout(resetConfirmTimer.current);
      resetConfirmTimer.current = setTimeout(() => setResetConfirm(false), 4000);
    } else {
      if (resetConfirmTimer.current) clearTimeout(resetConfirmTimer.current);
      schedulerResetMutation.mutate();
    }
  };

  const [pendingTier, setPendingTier] = useState<1 | 2 | 3 | 4 | null>(null);
  const tierConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedulerTierMutation = useMutation({
    mutationFn: async (tier: 1 | 2 | 3 | 4) => {
      const res = await fetch("/api/ingest/scheduler/run-tier", {
        method: "POST",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}), "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (d: { ok: boolean; message?: string }, tier) => {
      setPendingTier(null);
      if (d.ok) {
        toast({ title: `Tier ${tier} sync started`, description: d.message });
      } else {
        toast({ title: `Cannot start T${tier}`, description: d.message, variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
      setPendingTier(null);
      toast({ title: "Tier sync failed", description: err.message, variant: "destructive" });
    },
  });

  const [stalenessFirstConfirm, setStalenessFirstConfirm] = useState(false);
  const stalenessFirstConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dailySweepConfirm, setDailySweepConfirm] = useState(false);
  const dailySweepConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedulerDailySweepMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ingest/scheduler/daily-sweep", {
        method: "POST",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (d: { ok: boolean; message?: string }) => {
      setDailySweepConfirm(false);
      if (d.ok) {
        toast({ title: "Daily sweep started", description: d.message });
      } else {
        toast({ title: "Cannot start", description: d.message, variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
      setDailySweepConfirm(false);
      toast({ title: "Daily sweep failed", description: err.message, variant: "destructive" });
    },
  });

  const handleDailySweepClick = () => {
    if (schedPaused && sched.dailySweep) {
      schedulerStartMutation.mutate();
      return;
    }
    if (!dailySweepConfirm) {
      setDailySweepConfirm(true);
      if (dailySweepConfirmTimer.current) clearTimeout(dailySweepConfirmTimer.current);
      dailySweepConfirmTimer.current = setTimeout(() => setDailySweepConfirm(false), 4000);
    } else {
      if (dailySweepConfirmTimer.current) clearTimeout(dailySweepConfirmTimer.current);
      schedulerDailySweepMutation.mutate();
      setDailySweepConfirm(false);
    }
  };

  const schedulerStalenessFirstMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ingest/scheduler/stale-first", {
        method: "POST",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (d: { ok: boolean; message?: string }) => {
      setStalenessFirstConfirm(false);
      if (d.ok) {
        toast({ title: "Oldest-first scan started", description: d.message });
      } else {
        toast({ title: "Cannot start", description: d.message, variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
      setStalenessFirstConfirm(false);
      toast({ title: "Staleness scan failed", description: err.message, variant: "destructive" });
    },
  });

  const handleStalenessFirstClick = () => {
    if (!stalenessFirstConfirm) {
      setStalenessFirstConfirm(true);
      if (stalenessFirstConfirmTimer.current) clearTimeout(stalenessFirstConfirmTimer.current);
      stalenessFirstConfirmTimer.current = setTimeout(() => setStalenessFirstConfirm(false), 4000);
    } else {
      if (stalenessFirstConfirmTimer.current) clearTimeout(stalenessFirstConfirmTimer.current);
      if (schedPaused && sched.stalenessFirst) {
        schedulerStartMutation.mutate();
      } else {
        schedulerStalenessFirstMutation.mutate();
      }
      setStalenessFirstConfirm(false);
    }
  };

  const handleTierClick = (tier: 1 | 2 | 3 | 4) => {
    if (pendingTier !== tier) {
      setPendingTier(tier);
      if (tierConfirmTimer.current) clearTimeout(tierConfirmTimer.current);
      tierConfirmTimer.current = setTimeout(() => setPendingTier(null), 4000);
    } else {
      if (tierConfirmTimer.current) clearTimeout(tierConfirmTimer.current);
      // If paused mid-way through this exact tier scan, resume; otherwise start fresh.
      if (schedPaused && sched.tierOnly === tier) {
        schedulerStartMutation.mutate();
      } else {
        schedulerTierMutation.mutate(tier);
      }
      setPendingTier(null);
    }
  };

  const setConcurrencyMutation = useMutation({
    mutationFn: async (concurrency: 1 | 2 | 3) => {
      const res = await fetch("/api/ingest/scheduler/concurrency", {
        method: "POST",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}), "Content-Type": "application/json" },
        body: JSON.stringify({ concurrency }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (d: { ok: boolean; concurrency: number }) => {
      const desc = d.concurrency === 1 ? "Serial mode: one institution at a time" : d.concurrency === 2 ? "Parallel mode: two simultaneous syncs" : "High-speed mode: three simultaneous syncs";
      toast({ title: `Concurrency set to ${d.concurrency}`, description: desc });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to set concurrency", description: err.message, variant: "destructive" });
    },
  });

  type ScraperHealthRow = {
    institution: string;
    consecutiveFailures: number;
    lastFailureReason: string | null;
    lastFailureAt: string | null;
    lastSuccessAt: string | null;
    backoffUntil: string | null;
    inBackoff: boolean;
  };

  const { data: scraperHealthData, refetch: refetchScraperHealth } = useQuery<{ rows: ScraperHealthRow[]; total: number; inBackoff: number }>({
    queryKey: ["/api/admin/scraper-health", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/scraper-health", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load scraper health");
      return res.json();
    },
    enabled: healthPanelOpen,
    refetchInterval: healthPanelOpen ? 30_000 : false,
  });

  const clearBackoffMutation = useMutation({
    mutationFn: async (institution: string) => {
      const res = await fetch(`/api/admin/scraper-health/${encodeURIComponent(institution)}/clear-backoff`, {
        method: "POST",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(d.error || "Clear backoff failed");
      }
      return res.json();
    },
    onSuccess: (_d, institution) => {
      toast({ title: "Backoff cleared", description: `${institution} will be included in the next cycle` });
      refetchScraperHealth();
    },
    onError: (err: Error) => {
      toast({ title: "Clear backoff failed", description: err.message, variant: "destructive" });
    },
  });

  const healthOrder: Record<HealthStatus, number> = { stale: 0, failing: 1, site_down: 1, rate_limited: 2, degraded: 2, parser_failure: 2, network_blocked: 2, empty_response: 2, warning: 3, blocked: 3, syncing: 4, never: 5, ok: 6 };

  const sortedRowsForFreeze = React.useMemo(() => {
    if (!data) return [];
    const rows = [...data.rows];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case "institution": return dir * a.institution.localeCompare(b.institution);
        case "health": {
          const hDiff = healthOrder[a.health] - healthOrder[b.health];
          return dir * (hDiff !== 0 ? hDiff : b.biotechRelevant - a.biotechRelevant);
        }
        case "totalInDb": return dir * (a.totalInDb - b.totalInDb);
        case "biotechRelevant": return dir * (a.biotechRelevant - b.biotechRelevant);
        case "lastSyncAt": {
          const aT = a.lastSyncAt ? new Date(a.lastSyncAt).getTime() : 0;
          const bT = b.lastSyncAt ? new Date(b.lastSyncAt).getTime() : 0;
          return dir * (aT - bT);
        }
        default: return 0;
      }
    });
    return rows;
  }, [data?.rows, sortKey, sortDir]);

  const sortedRows = React.useMemo(() => {
    if (!data?.syncingCount || data.syncingCount === 0) {
      lastStableOrder.current = sortedRowsForFreeze.map((r) => r.institution);
      return sortedRowsForFreeze;
    }
    const order = lastStableOrder.current;
    if (!order.length) return sortedRowsForFreeze;
    return [...data.rows].sort(
      (a, b) => order.indexOf(a.institution) - order.indexOf(b.institution)
    );
  }, [sortedRowsForFreeze, data?.syncingCount, data?.rows]);

  const syncingRows = (data?.rows ?? []).filter((r) => r.health === "syncing");
  const firstSyncingInstitution = syncingRows[0]?.institution ?? null;
  useEffect(() => {
    if (firstSyncingInstitution && !expandedInstitution && userCollapsedRef.current !== firstSyncingInstitution) {
      setExpandedInstitution(firstSyncingInstitution);
    }
  }, [firstSyncingInstitution]);

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

  const lastScanAt = data.rows.reduce((max: string | null, r) => {
    if (!r.lastSyncAt) return max;
    if (!max) return r.lastSyncAt;
    return new Date(r.lastSyncAt).getTime() > new Date(max).getTime() ? r.lastSyncAt : max;
  }, null as string | null);

  const displayRows = sortedRows.filter((r) => {
    if (statusFilter !== "all" && r.health !== statusFilter) return false;
    if (errorTypeFilter !== "all") {
      if (!r.lastSyncError) return false;
      if (getErrorType(r.lastSyncError) !== errorTypeFilter) return false;
    }
    if (searchQuery.trim()) {
      return r.institution.toLowerCase().includes(searchQuery.toLowerCase().trim());
    }
    return true;
  });

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    // Clear freeze ref so the new sort applies immediately even during an active sync.
    // Without this, the sort arrow updates but the table stays frozen until sync ends.
    lastStableOrder.current = [];
  }

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

  const handleSyncClick = (institution: string) => {
    if (data?.rows.find((r) => r.institution === institution)?.health === "syncing") return;
    setPendingSyncInst(institution);
    setExpandedInstitution(institution);
    syncMutation.mutate(institution);
  };

  const handleRowClick = (institution: string) => {
    setExpandedInstitution((prev) => {
      if (prev === institution) {
        userCollapsedRef.current = institution;
        return null;
      }
      if (userCollapsedRef.current === institution) userCollapsedRef.current = null;
      return institution;
    });
  };

  const schedRunning = sched.state === "running";
  const schedPaused = sched.state === "paused";

  return (
    <>
      <div className="mb-6">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Data Health</h2>
            <p className="text-sm text-muted-foreground mt-1">Monitor collector status, run institution syncs, and manage the sync scheduler</p>
          </div>
          {lastScanAt && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 border border-border rounded-full px-3 py-1.5 shrink-0" data-testid="badge-last-scan">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Last full scan: <span className="font-medium text-foreground">{relativeTime(lastScanAt)}</span>
            </span>
          )}
        </div>
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
            <div className="text-[10px] text-muted-foreground/60">same count as Relevant Assets</div>
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
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-2 flex-shrink-0">
                <Activity className="w-4 h-4 text-primary" />
                <span className="font-semibold text-foreground text-sm">Scheduler</span>
              </div>

              {schedRunning ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1 flex-shrink-0" data-testid="badge-scheduler-running">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {sched.stalenessFirst ? "Staleness Scan" : sched.tierOnly != null ? `T${sched.tierOnly} Scan` : "Running"}
                </span>
              ) : schedPaused ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1 flex-shrink-0" data-testid="badge-scheduler-paused">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Paused
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted/50 border border-border rounded-full px-2.5 py-1 flex-shrink-0" data-testid="badge-scheduler-idle">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                  Idle
                </span>
              )}

              {schedRunning && sched.resumedAtPosition != null && !sched.tierOnly && !sched.stalenessFirst && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-700 dark:text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-full px-2 py-0.5 flex-shrink-0" data-testid="badge-scheduler-resumed" title={`Scheduler resumed mid-cycle at position ${sched.resumedAtPosition} of ${sched.queueTotal}. Cycle stamps will skip already-completed institutions.`}>
                  <ArrowUp className="w-2.5 h-2.5" />
                  Resumed cycle #{sched.cycleCount} at pos {sched.resumedAtPosition}/{sched.queueTotal}
                </span>
              )}

              {schedRunning && (sched.currentInstitutions ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1 min-w-0">
                  {(sched.currentInstitutions ?? [sched.currentInstitution]).filter(Boolean).map((inst) => (
                    <Badge key={inst} variant="outline" className="text-xs gap-1 text-blue-600 border-blue-500/30 bg-blue-500/10 max-w-[200px] pr-0.5 flex items-center">
                      <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                      <span className="truncate">{inst}</span>
                      <button
                        className="ml-1 flex-shrink-0 rounded-sm text-blue-600/60 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors p-0.5"
                        onClick={() => cancelMutation.mutate(inst as string)}
                        disabled={cancellingInstitution === (inst as string)}
                        title={`Cancel sync for ${inst}`}
                        data-testid={`button-cancel-scheduler-${(inst as string).toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <XCircle className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {schedRunning && (sched.currentInstitutions ?? []).length === 0 && !sched.currentInstitution && (
                <span className="text-xs text-blue-600/70">Waiting for next...</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {schedRunning ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-amber-400/50 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 font-medium"
                  onClick={() => schedulerPauseMutation.mutate()}
                  disabled={schedulerPauseMutation.isPending}
                  data-testid="button-pause-scheduler"
                >
                  {schedulerPauseMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <AlertCircle className="w-3 h-3 mr-1" />}
                  Pause
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-transform font-medium"
                  onClick={() => schedulerStartMutation.mutate()}
                  disabled={schedulerStartMutation.isPending}
                  data-testid="button-start-scheduler"
                >
                  {schedulerStartMutation.isPending ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Zap className="w-3 h-3 mr-1" />
                  )}
                  {schedPaused ? (sched.tierOnly != null ? `Resume T${sched.tierOnly}` : sched.stalenessFirst ? "Resume Oldest" : "Resume") : "Start"}
                </Button>
              )}
              <div className="flex items-center border border-border rounded-md overflow-hidden h-8 text-xs flex-shrink-0" data-testid="concurrency-selector">
                <button
                  className={`px-2.5 h-full font-medium transition-colors ${(sched.maxConcurrency ?? 1) === 1 ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  onClick={() => setConcurrencyMutation.mutate(1)}
                  disabled={setConcurrencyMutation.isPending || (sched.maxConcurrency ?? 1) === 1}
                  title="Serial: one institution at a time (recommended)"
                  data-testid="button-concurrency-1"
                >1x</button>
                <button
                  className={`px-2.5 h-full font-medium border-l border-border transition-colors ${(sched.maxConcurrency ?? 1) === 2 ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  onClick={() => setConcurrencyMutation.mutate(2)}
                  disabled={setConcurrencyMutation.isPending || (sched.maxConcurrency ?? 1) === 2}
                  title="Parallel: two simultaneous syncs"
                  data-testid="button-concurrency-2"
                >2x</button>
                <button
                  className={`px-2.5 h-full font-medium border-l border-border transition-colors ${(sched.maxConcurrency ?? 1) === 3 ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  onClick={() => setConcurrencyMutation.mutate(3)}
                  disabled={setConcurrencyMutation.isPending || (sched.maxConcurrency ?? 1) === 3}
                  title="High-speed: three simultaneous syncs"
                  data-testid="button-concurrency-3"
                >3x</button>
              </div>
              <Button
                size="sm"
                variant="outline"
                className={`h-8 text-xs font-medium transition-colors ${resetConfirm
                  ? "border-red-500 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-red-400/60"}`}
                onClick={handleResetClick}
                disabled={schedulerResetMutation.isPending}
                data-testid="button-reset-scheduler"
              >
                {schedulerResetMutation.isPending
                  ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  : <RefreshCw className="w-3 h-3 mr-1" />
                }
                {resetConfirm ? "Confirm Reset & Restart?" : "Reset & Restart"}
              </Button>
            </div>
          </div>

          {/* ── Tier sync buttons ───────────────────────────── */}
          <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-border/40 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium flex-shrink-0 mr-0.5">Sync tier:</span>
            {([1, 2, 3, 4] as const).map((tier) => {
              const isConfirming = pendingTier === tier;
              const isThisTierRunning = schedRunning && sched.currentTier === tier;
              const isThisTierPaused = schedPaused && sched.tierOnly === tier;
              const anyRunning = schedRunning || schedulerTierMutation.isPending;
              return (
                <Button
                  key={tier}
                  size="sm"
                  variant="outline"
                  className={`h-7 text-xs font-medium px-3 transition-colors ${
                    isThisTierRunning
                      ? "border-emerald-400/60 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
                      : isThisTierPaused
                      ? "border-amber-400/60 text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                      : isConfirming
                      ? "border-amber-400/60 text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                  }`}
                  onClick={() => handleTierClick(tier)}
                  disabled={anyRunning}
                  data-testid={`button-sync-tier-${tier}`}
                  title={isThisTierRunning ? `Tier ${tier} is currently syncing` : isThisTierPaused ? `Resume the paused Tier ${tier} scan` : `Start a sequential sync of all Tier ${tier} institutions only`}
                >
                  {isThisTierRunning ? (
                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" />T{tier} running</>
                  ) : isThisTierPaused ? (
                    `Resume T${tier}`
                  ) : isConfirming && schedPaused && sched.tierOnly !== null && sched.tierOnly !== tier ? (
                    `Discard T${sched.tierOnly} & run T${tier}?`
                  ) : isConfirming ? (
                    `Confirm T${tier}?`
                  ) : (
                    `Sync T${tier}`
                  )}
                </Button>
              );
            })}
            {sched.tierOnly != null && schedRunning && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs font-medium px-3 border-amber-400/50 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 transition-colors ml-auto"
                onClick={() => schedulerPauseMutation.mutate()}
                disabled={schedulerPauseMutation.isPending}
                data-testid="button-pause-tier-scan"
                title={`Pause the Tier ${sched.tierOnly} scan`}
              >
                {schedulerPauseMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <AlertCircle className="w-3 h-3 mr-1" />}
                Pause T{sched.tierOnly}
              </Button>
            )}
          </div>

          {/* ── Daily Sweep button ───────────────────────────── */}
          <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-border/40 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium flex-shrink-0 mr-0.5">Daily Sweep:</span>
            {(() => {
              const anyRunning = schedRunning || schedulerDailySweepMutation.isPending;
              const isDailySweepPaused = schedPaused && sched.dailySweep;
              return (
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-7 text-xs font-medium px-3 transition-colors ${
                    schedulerDailySweepMutation.isPending || (schedulerStartMutation.isPending && isDailySweepPaused)
                      ? "border-emerald-400/60 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
                      : isDailySweepPaused
                      ? "border-amber-400/60 text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                      : dailySweepConfirm
                      ? "border-amber-400/60 text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                  }`}
                  onClick={handleDailySweepClick}
                  disabled={anyRunning && !isDailySweepPaused}
                  data-testid="button-daily-sweep"
                  title="Run a full daily sweep: all standard institutions staleness-ordered, then complex institutions sequentially"
                >
                  {schedulerDailySweepMutation.isPending || schedulerStartMutation.isPending ? (
                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Sweep running</>
                  ) : schedPaused && sched.dailySweep ? (
                    "Resume Daily Sweep"
                  ) : dailySweepConfirm ? (
                    "Confirm Daily Sweep?"
                  ) : (
                    "Daily Sweep"
                  )}
                </Button>
              );
            })()}
          </div>

          {/* ── Staleness-first scan button ──────────────────── */}
          <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-border/40 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium flex-shrink-0 mr-0.5">Staleness:</span>
            {(() => {
              const isRunning = schedRunning && sched.stalenessFirst;
              const isPaused = schedPaused && sched.stalenessFirst;
              const anyRunning = schedRunning || schedulerStalenessFirstMutation.isPending;
              return (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className={`h-7 text-xs font-medium px-3 transition-colors ${
                      isRunning
                        ? "border-emerald-400/60 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
                        : isPaused
                        ? "border-amber-400/60 text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                        : stalenessFirstConfirm
                        ? "border-amber-400/60 text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                    }`}
                    onClick={handleStalenessFirstClick}
                    disabled={anyRunning}
                    data-testid="button-scan-staleness-first"
                    title={isRunning ? "Staleness-first scan is running" : isPaused ? "Resume the paused staleness-first scan" : "Scan all institutions sorted oldest-synced first"}
                  >
                    {isRunning ? (
                      <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Oldest First running</>
                    ) : isPaused ? (
                      "Resume Oldest First"
                    ) : stalenessFirstConfirm ? (
                      "Confirm Oldest First?"
                    ) : (
                      "Oldest First"
                    )}
                  </Button>
                  {isRunning && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs font-medium px-3 border-amber-400/50 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 transition-colors ml-auto"
                      onClick={() => schedulerPauseMutation.mutate()}
                      disabled={schedulerPauseMutation.isPending}
                      data-testid="button-pause-staleness-scan"
                      title="Pause the staleness-first scan"
                    >
                      {schedulerPauseMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <AlertCircle className="w-3 h-3 mr-1" />}
                      Pause Oldest First
                    </Button>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* ── Live Connections section ───────────────────────── */}
        <button
          className="w-full flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10 hover:bg-muted/20 transition-colors text-left"
          onClick={() => setLiveOpen((v) => !v)}
          data-testid="section-live-connections"
        >
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground text-sm">Live Connections</span>
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{data.totalInstitutions}</span>
            {schedRunning && !sched.tierOnly && !sched.stalenessFirst && !sched.dailySweep && (
              <span className="text-[11px] text-muted-foreground/60">Sequence scan active</span>
            )}
          </div>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${liveOpen ? "rotate-90" : ""}`} />
        </button>

        {liveOpen && (
          <>
            <div className="flex flex-col gap-2 px-4 py-3 border-b border-border">
              <div className="flex flex-wrap items-center gap-1.5">
                {(([
                  { key: "all",             label: "All",             activeClass: "bg-primary text-primary-foreground border-primary",       always: true },
                  { key: "ok",              label: "Working",         activeClass: "bg-emerald-600 text-white border-emerald-600",            always: true },
                  { key: "warning",         label: "Warning",         activeClass: "bg-yellow-500 text-white border-yellow-500",             always: true },
                  { key: "degraded",        label: "Degraded",        activeClass: "bg-amber-500 text-white border-amber-500",               always: true },
                  { key: "stale",           label: "Stale",           activeClass: "bg-orange-500 text-white border-orange-500",             always: true },
                  { key: "failing",         label: "Failing",         activeClass: "bg-red-600 text-white border-red-600",                   always: true },
                  { key: "site_down",       label: "Site down",       activeClass: "bg-amber-600 text-white border-amber-600",               always: false },
                  { key: "rate_limited",    label: "Rate limited",    activeClass: "bg-orange-600 text-white border-orange-600",             always: false },
                  { key: "blocked",         label: "Blocked",         activeClass: "bg-amber-500 text-white border-amber-500",               always: false },
                  { key: "network_blocked", label: "Network blocked", activeClass: "bg-orange-600 text-white border-orange-600",             always: true },
                  { key: "parser_failure",  label: "Parser failure",  activeClass: "bg-red-500 text-white border-red-500",                   always: false },
                  { key: "empty_response",  label: "Empty response",  activeClass: "bg-yellow-600 text-white border-yellow-600",             always: false },
                  { key: "never",           label: "Never synced",    activeClass: "bg-muted text-foreground border-border",                 always: true },
                ] as { key: "all" | HealthStatus; label: string; activeClass: string; always: boolean }[]).map(({ key, label, activeClass, always }) => {
                  const count = key === "all" ? sortedRows.length : sortedRows.filter((r) => r.health === key).length;
                  if (!always && count === 0) return null;
                  return (
                    <button
                      key={key}
                      onClick={() => setStatusFilter(key)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        statusFilter === key
                          ? activeClass
                          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                      data-testid={`filter-status-${key}`}
                    >
                      {label} ({count})
                    </button>
                  );
                }))}
              </div>
              {/* Error type filter — only visible when there are failing/degraded rows */}
              {sortedRows.some((r) => r.lastSyncError) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold">Error type:</span>
                  {(["all", "Timeout", "Blocked", "Network", "Parsing", "Unknown"] as ErrorType[]).map((et) => {
                    const count = et === "all"
                      ? sortedRows.filter((r) => r.lastSyncError).length
                      : sortedRows.filter((r) => r.lastSyncError && getErrorType(r.lastSyncError) === et).length;
                    if (et !== "all" && count === 0) return null;
                    const activeClass =
                      et === "Timeout" ? "bg-orange-500 text-white border-orange-500" :
                      et === "Blocked" ? "bg-red-600 text-white border-red-600" :
                      et === "Network" ? "bg-rose-500 text-white border-rose-500" :
                      et === "Parsing" ? "bg-amber-500 text-white border-amber-500" :
                      et === "Unknown" ? "bg-slate-500 text-white border-slate-500" :
                      "bg-muted text-foreground border-border";
                    return (
                      <button
                        key={et}
                        onClick={() => setErrorTypeFilter(et)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          errorTypeFilter === et
                            ? activeClass
                            : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                        data-testid={`filter-error-${et}`}
                      >
                        {et === "all" ? "All errors" : et} {et !== "all" && `(${count})`}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <Input
                  placeholder="Search institutions…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 text-xs max-w-[220px]"
                  data-testid="input-institution-search"
                />
                <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-csv">
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Export CSV
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    {(["institution", "health", "totalInDb", "biotechRelevant", "lastSyncAt"] as SortKey[]).map((col) => {
                      const label = col === "institution" ? "Institution" : col === "health" ? "Health" : col === "totalInDb" ? "Total" : col === "biotechRelevant" ? "Relevant" : "Last Sync";
                      const align = col === "institution" ? "text-left" : "text-center";
                      const minW = col === "institution" ? "min-w-[200px]" : col === "health" ? "min-w-[90px]" : col === "lastSyncAt" ? "min-w-[80px]" : "min-w-[70px]";
                      const title = col === "totalInDb" ? "Total assets in database" : col === "biotechRelevant" ? "Biotech-relevant subset" : undefined;
                      const active = sortKey === col;
                      return (
                        <th key={col} className={`${align} py-3 px-4 font-semibold text-foreground ${minW}`} title={title}>
                          <button
                            onClick={() => handleSort(col)}
                            className={`inline-flex items-center gap-1 hover:text-primary transition-colors ${active ? "text-primary" : ""}`}
                            data-testid={`sort-${col}`}
                          >
                            {label}
                            <span className="text-[10px] opacity-60 w-3">
                              {active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                            </span>
                          </button>
                        </th>
                      );
                    })}
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
                          className={`border-b border-border/50 hover:bg-muted/20 cursor-pointer ${row.consecutiveFailures >= 4 ? "bg-red-500/5" : row.consecutiveFailures >= 2 ? "bg-amber-500/5" : row.consecutiveFailures >= 1 ? "bg-yellow-500/5" : ""} ${isExpanded ? "bg-primary/5 border-b-0" : ""}`}
                          data-testid={`health-row-${instSlug}`}
                          onClick={() => handleRowClick(row.institution)}
                        >
                          <td className="py-2 px-4 font-medium text-foreground max-w-[250px]" title={row.institution}>
                            <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate">{row.institution}</span>
                              {row.tier === 1 && (
                                <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-sky-600 border-sky-500/30 bg-sky-500/5" title="Tier 1: API/RSS (fastest)">T1</Badge>
                              )}
                              {row.tier === 2 && (
                                <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-violet-600 border-violet-500/30 bg-violet-500/5" title="Tier 2: Platform factory (TechPublisher/Flintbox)">T2</Badge>
                              )}
                              {row.tier === 3 && (
                                <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-500/30 bg-emerald-500/5" title="Tier 3: Custom bespoke HTML">T3</Badge>
                              )}
                              {row.tier === 4 && (
                                <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-orange-600 border-orange-500/30 bg-orange-500/5" title="Tier 4: Playwright (headless browser)">T4</Badge>
                              )}
                              {row.consecutiveFailures >= 4 && (
                                <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-red-500 border-red-500/30 bg-red-500/5" data-testid={`badge-needs-attention-${instSlug}`}>
                                  Sync Error
                                </Badge>
                              )}
                              {row.consecutiveFailures >= 2 && row.consecutiveFailures < 4 && (
                                <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-amber-500 border-amber-500/30 bg-amber-500/5">
                                  {row.consecutiveFailures}x failed
                                </Badge>
                              )}
                              {row.consecutiveFailures === 1 && (
                                <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-yellow-600 border-yellow-500/30 bg-yellow-500/5">
                                  1x failed
                                </Badge>
                              )}
                            </div>
                            {row.lastSyncError && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className="text-[10px] text-red-500/80 truncate block max-w-[230px] cursor-help leading-tight"
                                    data-testid={`error-snippet-${instSlug}`}
                                  >
                                    {row.lastSyncError.length > 55 ? row.lastSyncError.slice(0, 55) + "…" : row.lastSyncError}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" align="start" className="max-w-[360px] break-words text-xs">
                                  {row.lastSyncError}
                                </TooltipContent>
                              </Tooltip>
                            )}
                            </div>
                          </td>
                          <td className="text-center py-2 px-3">
                            <div className="inline-flex items-center gap-1.5 min-w-[7.5rem] justify-center">
                              <HealthDot health={row.health} />
                              <HealthLabel health={row.health} />
                            </div>
                          </td>
                          <td className={`text-center py-2 px-3 tabular-nums ${row.totalInDb === 0 ? "text-muted-foreground/40" : "text-foreground font-medium"}`}>
                            {row.totalInDb > 0 ? row.totalInDb.toLocaleString() : row.health === "never" ? "\u2014" : "0"}
                          </td>
                          <td className={`text-center py-2 px-3 tabular-nums ${row.biotechRelevant === 0 ? "text-muted-foreground/40" : "text-primary font-medium"}`}>
                            {row.biotechRelevant > 0 ? row.biotechRelevant.toLocaleString() : row.health === "never" ? "\u2014" : "0"}
                          </td>
                          <td className={`text-center py-2 px-3 text-xs ${!row.lastSyncAt ? "text-muted-foreground/40" : "text-muted-foreground"}`}>
                            {row.health === "syncing" ? (
                              <span className="text-blue-600 dark:text-blue-400 font-medium">{(row.phase === "scraping" ? "collecting" : row.phase) ?? "syncing"}</span>
                            ) : (
                              relativeTime(row.lastSyncAt)
                            )}
                          </td>
                          <td className="text-left py-2 px-3" data-testid={`error-${instSlug}`}>
                            {row.health === "syncing" ? (
                              <div className="w-full max-w-[180px]">
                                <div className="text-[10px] text-blue-500 font-medium mb-1">{(row.phase === "scraping" ? "Collecting..." : row.phase) ?? "starting…"}</div>
                                <div className="h-1.5 rounded-full bg-blue-500/15 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-blue-500 animate-pulse transition-all duration-700"
                                    style={{ width: row.phase === "scraping" ? "33%" : row.phase === "comparing" ? "55%" : row.phase === "enriching" ? "75%" : row.phase === "done" ? "95%" : "12%" }}
                                  />
                                </div>
                              </div>
                            ) : row.lastSyncError ? (
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
                                  disabled={cancellingInstitution === row.institution}
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
                                  className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                                  onClick={() => cancelMutation.mutate(row.institution)}
                                  disabled={cancellingInstitution === row.institution}
                                  title={`Cancel running sync for ${row.institution}`}
                                  data-testid={`button-cancel-sync-${instSlug}`}
                                >
                                  <XCircle className="h-3.5 w-3.5 mr-1" />
                                  Cancel
                                </Button>
                              ) : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => handleSyncClick(row.institution)}
                                    disabled={pendingSyncInst === row.institution}
                                    title={`Sync ${row.institution}`}
                                    data-testid={`button-sync-${instSlug}`}
                                  >
                                    <RefreshCw className={`h-3.5 w-3.5 ${pendingSyncInst === row.institution ? "animate-spin" : ""}`} />
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
                            liveInDb={row.totalInDb}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Active Search section ──────────────────────────── */}
        <button
          className="w-full flex items-center justify-between px-4 py-3 border-t border-border bg-muted/10 hover:bg-muted/20 transition-colors text-left"
          onClick={() => setActiveSearchOpen((v) => !v)}
          data-testid="section-active-search"
        >
          <div className="flex items-center gap-2">
            <PackagePlus className="h-4 w-4 text-violet-500" />
            <span className="font-semibold text-foreground text-sm">Active Search</span>
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{data.totalActiveSearch ?? 0}</span>
            <span className="text-[11px] text-muted-foreground/60">Manually imported, not sequence scanned</span>
          </div>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${activeSearchOpen ? "rotate-90" : ""}`} />
        </button>

        {activeSearchOpen && (
          <>
            <div className="px-4 py-3 border-b border-border">
              <Input
                placeholder="Search active search institutions…"
                value={activeSearchQuery}
                onChange={(e) => setActiveSearchQuery(e.target.value)}
                className="h-7 text-xs max-w-[260px]"
                data-testid="input-active-search-filter"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold text-foreground min-w-[200px]">Institution</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground min-w-[70px]" title="Total assets in database">Total</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground min-w-[70px]" title="Biotech-relevant subset">Relevant</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground min-w-[90px]">Status</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground min-w-[60px]">TTO Link</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.activeSearchRows ?? [])
                    .filter((r) => !activeSearchQuery.trim() || r.institution.toLowerCase().includes(activeSearchQuery.toLowerCase().trim()))
                    .map((row) => {
                      const instSlug = row.institution.replace(/\s+/g, "-").toLowerCase();
                      return (
                        <tr key={row.institution} className="border-b border-border/50 hover:bg-muted/20" data-testid={`active-search-row-${instSlug}`}>
                          <td className="py-2 px-4 font-medium text-foreground truncate max-w-[250px]" title={row.institution}>
                            {row.institution}
                          </td>
                          <td className={`text-center py-2 px-4 tabular-nums ${row.totalInDb === 0 ? "text-muted-foreground/40" : "text-foreground font-medium"}`}>
                            {row.totalInDb > 0 ? row.totalInDb.toLocaleString() : "\u2014"}
                          </td>
                          <td className={`text-center py-2 px-4 tabular-nums ${row.biotechRelevant === 0 ? "text-muted-foreground/40" : "text-primary font-medium"}`}>
                            {row.biotechRelevant > 0 ? row.biotechRelevant.toLocaleString() : "\u2014"}
                          </td>
                          <td className="text-center py-2 px-4">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-violet-600 border-violet-500/30 bg-violet-500/5">
                              Imported
                            </Badge>
                          </td>
                          <td className="text-center py-2 px-4">
                            {row.ttoUrl ? (
                              <a
                                href={row.ttoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                                title={row.ttoUrl}
                                data-testid={`link-tto-${instSlug}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground/40 text-xs">&mdash;</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  {(data.activeSearchRows ?? []).filter((r) => !activeSearchQuery.trim() || r.institution.toLowerCase().includes(activeSearchQuery.toLowerCase().trim())).length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                        {activeSearchQuery.trim()
                          ? "No institutions match your search."
                          : "No Active Search institutions yet. Use Manual Import to add one."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Collector Health section ─────────────────────────── */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setHealthPanelOpen((v) => !v)}
        data-testid="section-scraper-health"
      >
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-primary" />
          <span className="font-semibold text-foreground text-sm">Collector Health</span>
          {scraperHealthData?.inBackoff ? (
            <span className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">
              {scraperHealthData.inBackoff} in backoff
            </span>
          ) : scraperHealthData ? (
            <span className="text-[11px] text-emerald-600/70">all active</span>
          ) : null}
        </div>
        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${healthPanelOpen ? "rotate-90" : ""}`} />
      </button>

      {healthPanelOpen && (
        <div className="px-4 py-3" data-testid="scraper-health-panel">
          {!scraperHealthData ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : scraperHealthData.rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No failure data recorded yet. Collectors will appear here after their first run.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Institution</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Failures</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Last Success</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Last Error</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Backoff Until</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {scraperHealthData.rows.map((row) => (
                    <tr
                      key={row.institution}
                      className={`border-b border-border/40 last:border-0 ${row.inBackoff ? "bg-red-500/5" : row.consecutiveFailures >= 1 ? "bg-amber-500/5" : ""}`}
                      data-testid={`scraper-health-row-${row.institution}`}
                    >
                      <td className="px-3 py-2 font-medium text-foreground max-w-[180px] truncate">{row.institution}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`font-bold tabular-nums ${row.consecutiveFailures >= 5 ? "text-red-500" : row.consecutiveFailures >= 1 ? "text-amber-500" : "text-muted-foreground"}`}>
                          {row.consecutiveFailures}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap" data-testid={`last-success-${row.institution}`}>
                        {row.lastSuccessAt
                          ? new Date(row.lastSuccessAt).toLocaleDateString()
                          : <span className="text-muted-foreground/40">never</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[260px] truncate" title={row.lastFailureReason ?? ""}>
                        {row.lastFailureReason ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {row.inBackoff && row.backoffUntil
                          ? <span className="text-red-500 font-medium">{new Date(row.backoffUntil).toLocaleDateString()}</span>
                          : row.backoffUntil
                            ? <span className="text-emerald-600">Expired</span>
                            : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {(row.inBackoff || row.consecutiveFailures > 0) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[11px] px-2 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                            onClick={() => clearBackoffMutation.mutate(row.institution)}
                            disabled={clearBackoffMutation.isPending && clearBackoffMutation.variables === row.institution}
                            data-testid={`button-clear-backoff-${row.institution}`}
                          >
                            {clearBackoffMutation.isPending && clearBackoffMutation.variables === row.institution
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : "Clear"}
                          </Button>
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
    </>
  );
}


interface EnrichmentStats {
  total: number;
  relevantAssets: number;
  unknownCount: number;
  byField: { target: number; modality: number; indication: number; developmentStage: number };
}

interface EnrichmentStatus {
  status: "idle" | "running" | "done" | "error" | "interrupted";
  processed: number;
  total: number;
  improved: number;
  resumed?: boolean;
  jobId?: number;
  error?: string;
  tokenCost?: number;
  filters?: { institution?: string; modality?: string; tier?: string; missingField?: string; stage?: string; indication?: string };
}

interface BandInfo {
  id: "rich" | "decent" | "sparse" | "very_sparse" | "bare";
  count: number;
  gapFillCount: number;
  missingTarget: number;
  missingModality: number;
  missingIndication: number;
  missingStage: number;
  missingMoa: number;
  missingUnmet: number;
  missingComparable: number;
  missingInnovation: number;
  totalMissingFields: number;
  estCostFull: number;
  estCostGapFill: number;
  needsRescrape: boolean;
  populationB: number;
}

interface BandStatusResponse {
  running: boolean;
  band: string | null;
  gapFill: boolean;
  processed: number;
  total: number;
  succeeded: number;
  failed: number;
  liveCostUsd: number;
  liveProjectedTotalUsd: number;
  liveInputTokens: number;
  liveOutputTokens: number;
  liveFieldCounts: Record<string, number>;
  targetFields: string[];
  lastSummary: {
    band: string; gapFill: boolean; total: number; succeeded: number; failed: number;
    inputTokens: number; outputTokens: number; costUsd: number; durationMs: number;
    fieldsFilledNames: string[];
    fieldFillCounts: Record<string, number>;
    avgScoreBefore: number | null;
    avgScoreAfter: number | null;
    bandMovements: Record<string, number>;
    completedAt: string;
  } | null;
}

interface DatasetQualityGlobal {
  total_relevant: number;
  scored_count: number;
  avg_score: number | null;
  tier_excellent: number;
  tier_good: number;
  tier_partial: number;
  tier_poor: number;
  tier_unscored: number;
  fill_target: number | null;
  fill_indication: number | null;
  fill_modality: number | null;
  fill_stage: number | null;
  fill_licensing: number | null;
  fill_patent: number | null;
  fill_biology: number | null;
  fill_moa: number | null;
  added_7d: number;
  added_30d: number;
}

interface InstitutionRow {
  institution: string;
  relevant_count: number;
  avg_completeness: number | null;
  fill_target: number | null;
  fill_indication: number | null;
  fill_biology: number | null;
  fill_moa: number | null;
}

interface ClassRow {
  asset_class: string;
  count: number;
  avg_score: number | null;
  fill_target: number | null;
  fill_modality: number | null;
  fill_indication: number | null;
  fill_stage: number | null;
  sparse_count: number;
}

interface DatasetQualityResponse {
  global: DatasetQualityGlobal;
  institutions: InstitutionRow[];
}

interface DrilldownAsset {
  id: number;
  asset_name: string;
  target: string | null;
  indication: string | null;
  modality: string | null;
  development_stage: string | null;
  completeness_score: number | null;
}

interface DimRow {
  value: string;
  count: number;
  avg_completeness: number | null;
  fill_target: number | null;
  fill_indication: number | null;
  fill_biology: number | null;
}

interface BrowsedAsset {
  id: number;
  asset_name: string;
  institution: string | null;
  target: string | null;
  indication: string | null;
  modality: string | null;
  development_stage: string | null;
  ip_type: string | null;
  licensing_readiness: string | null;
  completeness_score: number | null;
  mechanism_of_action: string | null;
  innovation_claim: string | null;
  unmet_need: string | null;
  comparable_drugs: string | null;
  source_url: string | null;
  abstract: string | null;
  summary: string | null;
  first_seen_at: string | null;
  enriched_at: string | null;
  patent_status: string | null;
  categories: string[] | null;
  inventors: string[] | null;
  human_verified: Record<string, boolean> | null;
  enrichment_sources: Record<string, string> | null;
}

type AssetBrowserInit = { dim: "modality" | "stage" | "indication" | "biology" | "missing"; value: string } | null;

function computeLocalScore(
  fields: { target?: string; modality?: string; indication?: string; development_stage?: string; summary?: string; abstract?: string; innovation_claim?: string; mechanism_of_action?: string },
  nonEditablePts: number
): number {
  const pts = (v?: string, w = 0) => (v && v !== "unknown" && v.length >= 3 ? w : 0);
  return nonEditablePts +
    pts(fields.target, 15) + pts(fields.modality, 15) + pts(fields.indication, 15) +
    pts(fields.development_stage, 10) + pts(fields.summary, 10) + pts(fields.abstract, 10) +
    pts(fields.innovation_claim, 5) + pts(fields.mechanism_of_action, 5);
}

function getNonEditablePts(asset: BrowsedAsset): number {
  let pts = 0;
  if (asset.categories && asset.categories.length > 0) pts += 5;
  if (asset.inventors && asset.inventors.length > 0) pts += 5;
  if (asset.patent_status && asset.patent_status !== "unknown" && asset.patent_status.length >= 3) pts += 5;
  return pts;
}

function DimensionBreakdown({ pw, onFilterSelect }: { pw: string; onFilterSelect: (dim: "modality" | "stage" | "indication" | "biology", value: string) => void }) {

export { DataHealth };
