import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  LogOut,
  Activity,
  ClipboardList,
  Building2,
  BarChart3,
  Play,
  Pause,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Database,
  Users,
  TrendingUp,
  Microscope,
  Lightbulb,
  RefreshCw,
  ChevronRight,
} from "lucide-react";

const ADMIN_KEY = "eden-admin-pw";

// ── Types ──────────────────────────────────────────────────────────────────────

type HealthStatus =
  | "ok"
  | "warning"
  | "degraded"
  | "failing"
  | "stale"
  | "syncing"
  | "never"
  | "blocked"
  | "network_blocked"
  | "site_down"
  | "rate_limited"
  | "parser_failure";

interface HealthRow {
  institution: string;
  health: HealthStatus;
  lastSyncAt: string | null;
  totalInDb: number;
  biotechRelevant: number;
  consecutiveFailures: number;
}

interface SchedulerStatus {
  state: "idle" | "running" | "paused";
  currentInstitutions: string[];
  currentInstitution: string | null;
  nextInstitution: string | null;
  queuePosition: number;
  queueTotal: number;
  completedThisCycle: number;
  failedThisCycle: number;
  cycleCount: number;
  avgSyncMs: number | null;
  estimatedRemainingMs: number | null;
}

interface CollectorHealth {
  rows: HealthRow[];
  totalInDb: number;
  totalBiotechRelevant: number;
  totalInstitutions: number;
  issueCount: number;
  syncingCount: number;
  syncedToday: number;
  scheduler: SchedulerStatus;
}

interface ResearchCard {
  id: number;
  assetName: string;
  institution: string;
  adminStatus: "pending" | "approved" | "rejected";
}

interface ConceptCard {
  id: number;
  title: string;
  oneLiner: string;
  credibilityScore: number | null;
  submitterName: string;
  submitterAffiliation: string | null;
}

interface Organization {
  id: number;
  name: string;
  planTier: string;
  seatLimit: number;
  billingEmail: string | null;
  stripeStatus: string | null;
  memberCount: number;
}

interface PlatformStats {
  totalUsers: number;
  totalAssets: number;
  relevantAssets: number;
  totalInstitutions: number;
  edenSessions24h: number;
  edenSessions7d: number;
  conceptCards: number;
  researchProjects: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function adminFetch(url: string, pw: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: {
      "x-admin-password": pw,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatMs(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function healthDot(status: HealthStatus): string {
  switch (status) {
    case "ok": return "bg-emerald-500";
    case "syncing": return "bg-blue-500 animate-pulse";
    case "never": return "bg-muted-foreground/30";
    case "stale": return "bg-amber-400";
    case "warning": return "bg-amber-500";
    case "degraded": return "bg-orange-500";
    case "failing":
    case "site_down":
    case "blocked":
    case "network_blocked":
    case "rate_limited":
    case "parser_failure": return "bg-red-500";
    default: return "bg-muted-foreground/30";
  }
}

function healthIsIssue(status: HealthStatus): boolean {
  return !["ok", "syncing", "never"].includes(status);
}

function planLabel(tier: string): { label: string; color: string } {
  switch (tier) {
    case "individual": return { label: "Individual", color: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300" };
    case "team5": return { label: "Team 5", color: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300" };
    case "team10": return { label: "Team 10", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" };
    case "enterprise": return { label: "Enterprise", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" };
    default: return { label: tier || "None", color: "bg-muted text-muted-foreground" };
  }
}

function stripeStatusBadge(status: string | null): { label: string; color: string } {
  switch (status) {
    case "active": return { label: "Active", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" };
    case "trialing": return { label: "Trial", color: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300" };
    case "past_due": return { label: "Past Due", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" };
    case "canceled": return { label: "Canceled", color: "bg-muted text-muted-foreground" };
    default: return { label: "No Sub", color: "bg-muted text-muted-foreground" };
  }
}

// ── Password Gate ──────────────────────────────────────────────────────────────

function PasswordGate({ onAuth }: { onAuth: () => void }) {
  const [pw, setPw] = useState(() => localStorage.getItem(ADMIN_KEY) ?? "");
  const [error, setError] = useState(false);

  function attempt() {
    if (pw === "eden") {
      localStorage.setItem(ADMIN_KEY, pw);
      onAuth();
    } else {
      setError(true);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex items-center gap-2 justify-center">
          <Shield className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold text-foreground">EdenRadar Admin</span>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); attempt(); }} className="space-y-3">
          <input
            type="password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setError(false); }}
            placeholder="Admin password"
            className={`w-full rounded-xl border px-4 py-3 text-base bg-background focus:outline-none focus:ring-2 focus:ring-primary ${
              error ? "border-destructive focus:ring-destructive" : "border-border"
            }`}
            data-testid="input-mobile-admin-password"
            autoFocus
          />
          {error && <p className="text-sm text-destructive text-center">Incorrect password</p>}
          <button
            type="submit"
            className="w-full rounded-xl bg-primary text-primary-foreground py-3 text-base font-semibold active:opacity-80"
            data-testid="button-mobile-admin-login"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Sync Tab ───────────────────────────────────────────────────────────────────

function SyncTab({ pw }: { pw: string }) {
  const qc = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery<CollectorHealth>({
    queryKey: ["/api/admin/collector-health-mobile", pw],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/collector-health", pw);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 30000,
    refetchInterval: 30000,
    enabled: !!pw,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch("/api/ingest/scheduler/start", pw, { method: "POST" });
      if (!res.ok) throw new Error("Failed to start");
      return res.json();
    },
    onSuccess: () => refetch(),
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch("/api/ingest/scheduler/pause", pw, { method: "POST" });
      if (!res.ok) throw new Error("Failed to pause");
      return res.json();
    },
    onSuccess: () => refetch(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading sync status…</span>
      </div>
    );
  }

  const scheduler = data?.scheduler;
  const rows = data?.rows ?? [];
  const issueRows = rows.filter((r) => healthIsIssue(r.health)).sort((a, b) => b.consecutiveFailures - a.consecutiveFailures);
  const syncingRows = rows.filter((r) => r.health === "syncing");
  const okRows = rows.filter((r) => r.health === "ok").sort((a, b) =>
    (b.lastSyncAt ? new Date(b.lastSyncAt).getTime() : 0) - (a.lastSyncAt ? new Date(a.lastSyncAt).getTime() : 0)
  );
  const sortedRows = [...issueRows, ...syncingRows, ...okRows, ...rows.filter((r) => r.health === "never")];

  const stateColor =
    scheduler?.state === "running" ? "text-emerald-600 dark:text-emerald-400"
    : scheduler?.state === "paused" ? "text-amber-600 dark:text-amber-400"
    : "text-muted-foreground";

  const stateLabel =
    scheduler?.state === "running" ? "Running"
    : scheduler?.state === "paused" ? "Paused"
    : "Idle";

  const isActing = startMutation.isPending || pauseMutation.isPending;

  return (
    <div className="space-y-4 px-4 pt-4">
      {/* Scheduler card */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Scheduler</p>
            <p className={`text-lg font-bold mt-0.5 ${stateColor}`} data-testid="text-scheduler-state">{stateLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              className="p-2 rounded-xl text-muted-foreground hover:bg-muted active:opacity-60"
              data-testid="button-refresh-sync"
            >
              <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            </button>
            {scheduler?.state === "running" ? (
              <button
                onClick={() => pauseMutation.mutate()}
                disabled={isActing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-semibold text-sm active:opacity-70"
                data-testid="button-pause-scheduler"
              >
                {isActing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                Pause
              </button>
            ) : (
              <button
                onClick={() => startMutation.mutate()}
                disabled={isActing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-semibold text-sm active:opacity-70"
                data-testid="button-start-scheduler"
              >
                {isActing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Start
              </button>
            )}
          </div>
        </div>

        {scheduler?.state === "running" && (
          <div className="space-y-1.5">
            {(scheduler.currentInstitutions.length > 0 || scheduler.currentInstitution) && (
              <div className="flex items-center gap-2 text-sm">
                <Zap className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span className="text-foreground font-medium truncate">
                  {scheduler.currentInstitutions.length > 0
                    ? scheduler.currentInstitutions.join(", ")
                    : scheduler.currentInstitution}
                </span>
              </div>
            )}
            {scheduler.nextInstitution && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ChevronRight className="h-3 w-3 shrink-0" />
                Next: {scheduler.nextInstitution}
              </div>
            )}
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-0.5">
              <span>{scheduler.queuePosition}/{scheduler.queueTotal} in queue</span>
              <span>{scheduler.completedThisCycle} done</span>
              {scheduler.failedThisCycle > 0 && <span className="text-red-500">{scheduler.failedThisCycle} failed</span>}
              {scheduler.avgSyncMs && <span>~{formatMs(scheduler.avgSyncMs)}/sync</span>}
            </div>
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-border bg-card p-3 text-center" data-testid="stat-mobile-total">
          <Database className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
          <p className="text-xl font-bold text-foreground tabular-nums">{(data?.totalInDb ?? 0).toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">Total in DB</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 text-center" data-testid="stat-mobile-today">
          <Activity className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
          <p className="text-xl font-bold text-foreground tabular-nums">{data?.syncedToday ?? 0}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">Synced today</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 text-center" data-testid="stat-mobile-issues">
          <AlertTriangle className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
          <p className={`text-xl font-bold tabular-nums ${(data?.issueCount ?? 0) > 0 ? "text-red-500" : "text-foreground"}`}>
            {data?.issueCount ?? 0}
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">Issues</p>
        </div>
      </div>

      {/* Institution health list */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Institution Health</p>
          <p className="text-xs text-muted-foreground">{rows.length} institutions</p>
        </div>
        <div className="divide-y divide-border">
          {sortedRows.slice(0, 50).map((row) => (
            <div key={row.institution} className="flex items-center gap-3 px-4 py-2.5" data-testid={`row-health-${row.institution.replace(/\s+/g, "-").toLowerCase()}`}>
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${healthDot(row.health)}`} />
              <span className="flex-1 text-sm text-foreground truncate">{row.institution}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">{formatRelative(row.lastSyncAt)}</span>
            </div>
          ))}
          {sortedRows.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">No data yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Queues Tab ─────────────────────────────────────────────────────────────────

function QueuesTab({ pw }: { pw: string }) {
  const [showResearch, setShowResearch] = useState(false);
  const [showConcept, setShowConcept] = useState(false);

  const { data: researchData, isLoading: researchLoading } = useQuery<{ cards: ResearchCard[] }>({
    queryKey: ["/api/admin/research-queue-mobile", pw],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/research-queue", pw);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const { data: conceptData, isLoading: conceptLoading } = useQuery<{ concepts: ConceptCard[] }>({
    queryKey: ["/api/admin/concepts-mobile", pw],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/concepts", pw);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const researchCards = researchData?.cards ?? [];
  const pendingResearch = researchCards.filter((c) => c.adminStatus === "pending");
  const concepts = conceptData?.concepts ?? [];
  const unreviewedConcepts = concepts.filter((c) => c.credibilityScore === null);

  return (
    <div className="space-y-4 px-4 pt-4">
      {/* Research Review */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-4 active:bg-muted/50"
          onClick={() => setShowResearch((v) => !v)}
          data-testid="button-toggle-research-queue"
        >
          <div className="flex items-center gap-3">
            <Microscope className="h-5 w-5 text-primary" />
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">Research Review</p>
              <p className="text-xs text-muted-foreground">Discovery cards awaiting admin review</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {researchLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${pendingResearch.length > 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-muted text-muted-foreground"}`} data-testid="badge-research-pending">
                {pendingResearch.length} pending
              </span>
            )}
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${showResearch ? "rotate-90" : ""}`} />
          </div>
        </button>

        {showResearch && (
          <div className="border-t border-border divide-y divide-border">
            {pendingResearch.length === 0 ? (
              <div className="px-4 py-5 text-center text-sm text-muted-foreground">No pending items</div>
            ) : (
              pendingResearch.map((card) => (
                <div key={card.id} className="px-4 py-3" data-testid={`card-research-${card.id}`}>
                  <p className="text-sm font-medium text-foreground line-clamp-1">{card.assetName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{card.institution}</p>
                </div>
              ))
            )}
            {pendingResearch.length > 0 && (
              <div className="px-4 py-3 bg-muted/30 text-center">
                <a href="/admin" className="text-xs text-primary font-medium underline underline-offset-2">
                  Open desktop admin to approve or reject →
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Concept Review */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-4 active:bg-muted/50"
          onClick={() => setShowConcept((v) => !v)}
          data-testid="button-toggle-concept-queue"
        >
          <div className="flex items-center gap-3">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">Concept Review</p>
              <p className="text-xs text-muted-foreground">Concept cards submitted by researchers</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {conceptLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${unreviewedConcepts.length > 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-muted text-muted-foreground"}`} data-testid="badge-concept-pending">
                {unreviewedConcepts.length} unreviewed
              </span>
            )}
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${showConcept ? "rotate-90" : ""}`} />
          </div>
        </button>

        {showConcept && (
          <div className="border-t border-border divide-y divide-border">
            {unreviewedConcepts.length === 0 ? (
              <div className="px-4 py-5 text-center text-sm text-muted-foreground">All concepts reviewed</div>
            ) : (
              unreviewedConcepts.slice(0, 10).map((c) => (
                <div key={c.id} className="px-4 py-3" data-testid={`card-concept-${c.id}`}>
                  <p className="text-sm font-medium text-foreground line-clamp-1">{c.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {c.submitterName}{c.submitterAffiliation ? ` · ${c.submitterAffiliation}` : ""}
                  </p>
                </div>
              ))
            )}
            {unreviewedConcepts.length > 10 && (
              <div className="px-4 py-2.5 text-center text-xs text-muted-foreground bg-muted/30">
                +{unreviewedConcepts.length - 10} more — see desktop admin
              </div>
            )}
            {unreviewedConcepts.length > 0 && (
              <div className="px-4 py-3 bg-muted/30 text-center">
                <a href="/admin" className="text-xs text-primary font-medium underline underline-offset-2">
                  Open desktop admin to review →
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4 text-center">
          <ClipboardList className="h-5 w-5 text-muted-foreground mx-auto mb-1.5" />
          <p className="text-2xl font-bold text-foreground tabular-nums" data-testid="stat-pending-research">{pendingResearch.length}</p>
          <p className="text-xs text-muted-foreground">Pending research</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 text-center">
          <Lightbulb className="h-5 w-5 text-muted-foreground mx-auto mb-1.5" />
          <p className="text-2xl font-bold text-foreground tabular-nums" data-testid="stat-unreviewed-concepts">{unreviewedConcepts.length}</p>
          <p className="text-xs text-muted-foreground">Unreviewed concepts</p>
        </div>
      </div>
    </div>
  );
}

// ── Subscribers Tab ────────────────────────────────────────────────────────────

function SubscribersTab({ pw }: { pw: string }) {
  const { data: orgs, isLoading } = useQuery<Organization[]>({
    queryKey: ["/api/admin/organizations-mobile", pw],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/organizations", pw);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading subscribers…</span>
      </div>
    );
  }

  const sortedOrgs = [...(orgs ?? [])].sort((a, b) => {
    const statusOrder = (s: string | null) =>
      s === "active" ? 0 : s === "trialing" ? 1 : s === "past_due" ? 2 : 3;
    return statusOrder(a.stripeStatus) - statusOrder(b.stripeStatus) || a.name.localeCompare(b.name);
  });

  const activeCount = sortedOrgs.filter((o) => o.stripeStatus === "active" || o.stripeStatus === "trialing").length;

  return (
    <div className="space-y-4 px-4 pt-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-border bg-card p-3 text-center">
          <Building2 className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
          <p className="text-xl font-bold text-foreground tabular-nums" data-testid="stat-total-orgs">{sortedOrgs.length}</p>
          <p className="text-[10px] text-muted-foreground">Total orgs</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 text-center">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-foreground tabular-nums" data-testid="stat-active-subs">{activeCount}</p>
          <p className="text-[10px] text-muted-foreground">Active subs</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 text-center">
          <AlertTriangle className="h-4 w-4 text-red-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-foreground tabular-nums" data-testid="stat-past-due">
            {sortedOrgs.filter((o) => o.stripeStatus === "past_due").length}
          </p>
          <p className="text-[10px] text-muted-foreground">Past due</p>
        </div>
      </div>

      {/* Org list */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Organizations</p>
        </div>
        <div className="divide-y divide-border">
          {sortedOrgs.map((org) => {
            const plan = planLabel(org.planTier);
            const stripe = stripeStatusBadge(org.stripeStatus);
            return (
              <div key={org.id} className="px-4 py-3 space-y-1.5" data-testid={`card-org-${org.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground truncate flex-1">{org.name}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${stripe.color}`}>
                    {stripe.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${plan.color}`}>
                    {plan.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <Users className="h-3 w-3 inline mr-0.5" />{org.memberCount}/{org.seatLimit} seats
                  </span>
                  {org.billingEmail && (
                    <span className="text-xs text-muted-foreground truncate">{org.billingEmail}</span>
                  )}
                </div>
              </div>
            );
          })}
          {sortedOrgs.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">No organizations yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stats Tab ──────────────────────────────────────────────────────────────────

function StatsTab({ pw }: { pw: string }) {
  const { data: stats, isLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/admin/platform-stats-mobile", pw],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/platform-stats", pw);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const { data: healthData } = useQuery<CollectorHealth>({
    queryKey: ["/api/admin/collector-health-mobile", pw],
    staleTime: 30000,
    enabled: !!pw,
    queryFn: async () => {
      const res = await adminFetch("/api/admin/collector-health", pw);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading stats…</span>
      </div>
    );
  }

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const institutionsSynced7d = (healthData?.rows ?? []).filter(
    (r) => r.lastSyncAt && new Date(r.lastSyncAt).getTime() > sevenDaysAgo
  ).length;
  const pendingIssues = healthData?.issueCount ?? 0;

  return (
    <div className="space-y-4 px-4 pt-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4" data-testid="stat-total-assets">
          <Database className="h-4 w-4 mb-2 text-foreground" />
          <p className="text-2xl font-bold tabular-nums text-foreground">{(stats?.totalAssets ?? 0).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-tight">Total Assets</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4" data-testid="stat-biotech-relevant">
          <TrendingUp className="h-4 w-4 mb-2 text-primary" />
          <p className="text-2xl font-bold tabular-nums text-primary">{(stats?.relevantAssets ?? 0).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-tight">Biotech-Relevant</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4" data-testid="stat-institutions-synced-7d">
          <Activity className="h-4 w-4 mb-2 text-foreground" />
          <p className="text-2xl font-bold tabular-nums text-foreground">{institutionsSynced7d.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-tight">Institutions Synced (7d)</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4" data-testid="stat-pending-issues">
          <AlertTriangle className="h-4 w-4 mb-2 text-foreground" />
          <p className={`text-2xl font-bold tabular-nums ${pendingIssues > 0 ? "text-red-500" : "text-foreground"}`}>
            {pendingIssues.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-tight">Pending Issues</p>
        </div>
      </div>
    </div>
  );
}

// ── Bottom Tab Nav ─────────────────────────────────────────────────────────────

type Tab = "sync" | "queues" | "subscribers" | "stats";

interface TabConfig {
  id: Tab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabConfig[] = [
  { id: "sync", label: "Sync", icon: Activity },
  { id: "queues", label: "Queues", icon: ClipboardList },
  { id: "subscribers", label: "Subscribers", icon: Building2 },
  { id: "stats", label: "Stats", icon: BarChart3 },
];

// ── Main Mobile Admin ──────────────────────────────────────────────────────────

function MobileAdminPanel({ pw, onLogout }: { pw: string; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("sync");

  const { data: queueData } = useQuery<{ cards: ResearchCard[] }>({
    queryKey: ["/api/admin/research-queue-mobile", pw],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/research-queue", pw);
      if (!res.ok) return { cards: [] };
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });
  const pendingCount = (queueData?.cards ?? []).filter((c) => c.adminStatus === "pending").length;

  return (
    <div className="min-h-screen bg-background" data-testid="mobile-admin-panel">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">EdenRadar Admin</span>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-1.5 rounded-lg hover:bg-muted active:opacity-60"
            data-testid="button-mobile-admin-logout"
          >
            <LogOut className="h-3.5 w-3.5" />
            Logout
          </button>
        </div>
      </header>

      {/* Tab content — padded bottom for fixed tab bar */}
      <main className="pb-24 overflow-y-auto">
        {activeTab === "sync" && <SyncTab pw={pw} />}
        {activeTab === "queues" && <QueuesTab pw={pw} />}
        {activeTab === "subscribers" && <SubscribersTab pw={pw} />}
        {activeTab === "stats" && <StatsTab pw={pw} />}
      </main>

      {/* Fixed bottom tab bar */}
      <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur-sm" data-testid="mobile-admin-tab-bar">
        <div className="flex items-center safe-area-inset-bottom">
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            const showBadge = id === "queues" && pendingCount > 0;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 relative transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
                data-testid={`nav-mobile-${id}`}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-amber-500 text-white rounded-full px-1" data-testid="badge-mobile-pending">
                      {pendingCount > 99 ? "99+" : pendingCount}
                    </span>
                  )}
                </span>
                <span className={`text-[10px] font-medium leading-none ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                  {label}
                </span>
                {isActive && (
                  <span className="absolute top-0 inset-x-0 h-0.5 bg-primary rounded-b-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// ── Default Export ─────────────────────────────────────────────────────────────

export default function AdminMobile() {
  const [authed, setAuthed] = useState(() => localStorage.getItem(ADMIN_KEY) === "eden");

  function handleLogout() {
    localStorage.removeItem(ADMIN_KEY);
    setAuthed(false);
  }

  if (!authed) return <PasswordGate onAuth={() => setAuthed(true)} />;

  const pw = localStorage.getItem(ADMIN_KEY) ?? "";

  return <MobileAdminPanel pw={pw} onLogout={handleLogout} />;
}
