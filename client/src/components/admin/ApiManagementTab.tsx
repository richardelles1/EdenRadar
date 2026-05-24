import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";
import {
  Key, Shield, Activity, Building2, BarChart3, ClipboardList,
  AlertTriangle, CheckCircle2, XCircle, Clock, TrendingUp,
  Search, ChevronDown, Eye, Ban, RotateCcw, Trash2, Loader2, Copy, ChevronsUpDown, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ApiKey, ApiKeyAuditLog } from "@shared/schema";
import { API_SCOPE_LABELS, API_TIER_CONFIG } from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

type SubTab = "overview" | "keys" | "orgs" | "usage" | "tiers" | "grants" | "audit";

interface OverviewData {
  activeKeys: number;
  totalKeys: number;
  callsToday: number;
  callsMonth: number;
  topOrgs: { orgName: string | null; calls: number }[];
  sparkline: { day: string; calls: number }[];
}

interface KeyWithCalls extends ApiKey {
  callsToday: number;
}

interface OrgSummary {
  orgId: number | null;
  orgName: string | null;
  keyCount: number;
  activeKeys: number;
  tier: string;
  callsThisMonth: number;
}

interface UsageData {
  volumeByDay: { day: string; calls: number }[];
  byEndpoint: { endpoint: string; calls: number }[];
  byStatus: { statusCode: number; calls: number }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "Never";
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

function tierBadge(tier: string) {
  const map: Record<string, string> = {
    starter: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    professional: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
    enterprise: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  };
  return map[tier] ?? "bg-muted text-muted-foreground";
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    suspended: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    revoked: "bg-muted text-muted-foreground border-border",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
}

function actionBadge(action: string) {
  const map: Record<string, string> = {
    key_created: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    key_revoked: "bg-red-500/10 text-red-600 dark:text-red-400",
    key_suspended: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    key_restored: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    access_granted: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  };
  return map[action] ?? "bg-muted text-muted-foreground";
}

// ── Sub-nav ───────────────────────────────────────────────────────────────────

const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { id: "keys", label: "Keys", icon: <Key className="h-3.5 w-3.5" /> },
  { id: "orgs", label: "Organizations", icon: <Building2 className="h-3.5 w-3.5" /> },
  { id: "usage", label: "Usage", icon: <Activity className="h-3.5 w-3.5" /> },
  { id: "tiers", label: "Tier Config", icon: <Shield className="h-3.5 w-3.5" /> },
  { id: "grants", label: "Access Grants", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  { id: "audit", label: "Audit Log", icon: <ClipboardList className="h-3.5 w-3.5" /> },
];

// ── Main component ────────────────────────────────────────────────────────────

export function ApiManagementTab({ pw }: { pw: string }) {
  const [subTab, setSubTab] = useState<SubTab>("overview");

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Key className="h-6 w-6 text-violet-500" />
          API Management
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage API keys, monitor usage, configure tiers, and review audit history.
        </p>
      </div>

      {/* Sub-nav pills */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              subTab === t.id
                ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "overview"  && <OverviewPanel pw={pw} />}
      {subTab === "keys"      && <KeysPanel pw={pw} />}
      {subTab === "orgs"      && <OrgsPanel pw={pw} />}
      {subTab === "usage"     && <UsagePanel pw={pw} />}
      {subTab === "tiers"     && <TierConfigPanel />}
      {subTab === "grants"    && <AccessGrantsPanel pw={pw} />}
      {subTab === "audit"     && <AuditLogPanel pw={pw} />}
    </div>
  );
}

// ── 1. Overview ───────────────────────────────────────────────────────────────

function OverviewPanel({ pw }: { pw: string }) {
  const { data, isLoading } = useQuery<OverviewData>({
    queryKey: ["admin", "api-management", "overview"],
    queryFn: () =>
      fetch("/api/admin/api-management/overview", {
        headers: { Authorization: `Bearer ${pw}` },
      }).then(r => r.json()),
  });

  if (isLoading) return <LoadingState />;

  const d = data ?? { activeKeys: 0, totalKeys: 0, callsToday: 0, callsMonth: 0, topOrgs: [], sparkline: [] };

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Key className="h-4 w-4 text-emerald-500" />}
          label="Active Keys"
          value={d.activeKeys}
        />
        <StatCard
          icon={<Shield className="h-4 w-4 text-blue-500" />}
          label="Total Keys"
          value={d.totalKeys}
        />
        <StatCard
          icon={<Activity className="h-4 w-4 text-amber-500" />}
          label="Calls Today"
          value={d.callsToday.toLocaleString()}
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4 text-violet-500" />}
          label="Calls This Month"
          value={d.callsMonth.toLocaleString()}
        />
      </div>

      {/* 30-day sparkline */}
      <div className="border border-border bg-card rounded-lg p-4">
        <p className="text-sm font-medium text-foreground mb-3">30-Day Call Volume</p>
        {d.sparkline.length === 0 ? (
          <EmptyChartState label="No call data in the last 30 days" />
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={d.sparkline}>
              <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <RechartsTooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Line
                type="monotone"
                dataKey="calls"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top orgs */}
      <div className="border border-border bg-card rounded-lg p-4">
        <p className="text-sm font-medium text-foreground mb-3">Top Organizations This Month</p>
        {d.topOrgs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No organization data yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left pb-2 font-medium">Rank</th>
                <th className="text-left pb-2 font-medium">Organization</th>
                <th className="text-right pb-2 font-medium">Calls</th>
              </tr>
            </thead>
            <tbody>
              {d.topOrgs.map((org, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[10px] font-bold">
                      {i + 1}
                    </span>
                  </td>
                  <td className="py-2 text-foreground">{org.orgName ?? "—"}</td>
                  <td className="py-2 text-right font-mono text-xs">{org.calls.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── 2. Keys Directory ─────────────────────────────────────────────────────────

function KeysPanel({ pw }: { pw: string }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [detailKey, setDetailKey] = useState<KeyWithCalls | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ keys: KeyWithCalls[] }>({
    queryKey: ["admin", "api-management", "keys", search, status],
    queryFn: () =>
      fetch(`/api/admin/api-management/keys?search=${encodeURIComponent(search)}&status=${status}`, {
        headers: { Authorization: `Bearer ${pw}` },
      }).then(r => r.json()),
  });

  const suspend = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/api-management/keys/${id}/suspend`, {
        method: "POST",
        headers: { Authorization: `Bearer ${pw}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Admin action" }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "api-management"] });
      toast({ title: "Key suspended" });
    },
    onError: () => toast({ title: "Failed to suspend key", variant: "destructive" }),
  });

  const restore = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/api-management/keys/${id}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${pw}` },
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "api-management"] });
      toast({ title: "Key restored" });
    },
    onError: () => toast({ title: "Failed to restore key", variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/api-management/keys/${id}/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${pw}` },
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "api-management"] });
      toast({ title: "Key revoked" });
    },
    onError: () => toast({ title: "Failed to revoke key", variant: "destructive" }),
  });

  const keys = data?.keys ?? [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Search by prefix, label, email, or org…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px] h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : keys.length === 0 ? (
        <EmptyState icon={<Key className="h-8 w-8" />} label="No API keys found" sub="Keys will appear here once issued." />
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-xs text-muted-foreground">
                <th className="text-left px-4 py-2.5 font-medium">Prefix</th>
                <th className="text-left px-3 py-2.5 font-medium">Label</th>
                <th className="text-left px-3 py-2.5 font-medium hidden md:table-cell">Owner</th>
                <th className="text-left px-3 py-2.5 font-medium">Tier</th>
                <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell">Scopes</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="text-right px-3 py-2.5 font-medium hidden lg:table-cell">Last Used</th>
                <th className="text-right px-3 py-2.5 font-medium hidden lg:table-cell">Today</th>
                <th className="text-right px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.id} className="border-t border-border/60 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-foreground">{k.keyPrefix}…</span>
                  </td>
                  <td className="px-3 py-3 text-foreground max-w-[120px] truncate">{k.label}</td>
                  <td className="px-3 py-3 hidden md:table-cell">
                    <div className="text-xs text-foreground truncate max-w-[140px]">{k.userEmail ?? "—"}</div>
                    {k.orgName && <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">{k.orgName}</div>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${tierBadge(k.tier)}`}>
                        {k.tier}
                      </span>
                      {k.keyType && k.keyType !== "personal" && (
                        <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                          org
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 hidden lg:table-cell">
                    <ScopesCell scopes={k.scopes as string[]} />
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusBadge(k.status)} ${k.status === "revoked" ? "line-through" : ""}`}>
                      {k.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right hidden lg:table-cell">
                    <span className="text-xs text-muted-foreground">{relativeTime(k.lastUsedAt)}</span>
                  </td>
                  <td className="px-3 py-3 text-right hidden lg:table-cell">
                    <span className="font-mono text-xs">{k.callsToday.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/* Detail popover */}
                      <Popover open={detailKey?.id === k.id} onOpenChange={open => setDetailKey(open ? k : null)}>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="View details">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 text-sm" align="end">
                          <KeyDetailPopover k={k} />
                        </PopoverContent>
                      </Popover>

                      {/* Suspend (active only) */}
                      {k.status === "active" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-amber-500 hover:text-amber-600"
                          title="Suspend key"
                          onClick={() => suspend.mutate(k.id)}
                          disabled={suspend.isPending}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      )}

                      {/* Restore (suspended only) */}
                      {k.status === "suspended" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-blue-500 hover:text-blue-600"
                          title="Restore key"
                          onClick={() => restore.mutate(k.id)}
                          disabled={restore.isPending}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}

                      {/* Revoke (active or suspended) */}
                      {k.status !== "revoked" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-600"
                          title="Revoke key"
                          onClick={() => revoke.mutate(k.id)}
                          disabled={revoke.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ScopesCell({ scopes }: { scopes: string[] }) {
  if (!scopes || scopes.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground hover:bg-muted/80 transition-colors">
          {scopes.length} scope{scopes.length !== 1 ? "s" : ""}
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 text-xs" align="start">
        <p className="font-medium text-foreground mb-2">Granted Scopes</p>
        <ul className="space-y-1.5">
          {scopes.map(s => (
            <li key={s} className="flex flex-col">
              <span className="font-mono text-foreground">{s}</span>
              {API_SCOPE_LABELS[s] && (
                <span className="text-muted-foreground leading-tight">{API_SCOPE_LABELS[s]}</span>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function KeyDetailPopover({ k }: { k: KeyWithCalls }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="font-medium text-foreground">{k.label}</p>
        <p className="font-mono text-xs text-muted-foreground">{k.keyPrefix}…</p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Tier</p>
          <p className="font-medium capitalize">{k.tier}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Daily Limit</p>
          <p className="font-medium">{(k.limitOverride ?? k.dailyLimit).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Created</p>
          <p className="font-medium">{relativeTime(k.createdAt)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Last Used</p>
          <p className="font-medium">{relativeTime(k.lastUsedAt)}</p>
        </div>
        {k.orgName && (
          <div className="col-span-2">
            <p className="text-muted-foreground">Organization</p>
            <p className="font-medium">{k.orgName}</p>
          </div>
        )}
        {k.userEmail && (
          <div className="col-span-2">
            <p className="text-muted-foreground">Owner email</p>
            <p className="font-medium truncate">{k.userEmail}</p>
          </div>
        )}
        {k.revokedBy && (
          <div className="col-span-2">
            <p className="text-muted-foreground">Revoked by</p>
            <p className="font-medium text-red-500">{k.revokedBy}</p>
          </div>
        )}
        {k.suspendReason && (
          <div className="col-span-2">
            <p className="text-muted-foreground">Suspend reason</p>
            <p className="font-medium text-amber-600">{k.suspendReason}</p>
          </div>
        )}
      </div>
      {k.scopes && (k.scopes as string[]).length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Scopes</p>
          <div className="flex flex-wrap gap-1">
            {(k.scopes as string[]).map(s => (
              <span key={s} className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono text-foreground">{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 3. Organizations ──────────────────────────────────────────────────────────

function OrgsPanel({ pw }: { pw: string }) {
  const { data, isLoading } = useQuery<{ orgs: OrgSummary[] }>({
    queryKey: ["admin", "api-management", "orgs"],
    queryFn: () =>
      fetch("/api/admin/api-management/orgs", {
        headers: { Authorization: `Bearer ${pw}` },
      }).then(r => r.json()),
  });

  const orgs = data?.orgs ?? [];

  if (isLoading) return <LoadingState />;
  if (orgs.length === 0) {
    return <EmptyState icon={<Building2 className="h-8 w-8" />} label="No organizations with API access yet." />;
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr className="text-xs text-muted-foreground">
            <th className="text-left px-4 py-2.5 font-medium">Organization</th>
            <th className="text-right px-3 py-2.5 font-medium">Keys</th>
            <th className="text-right px-3 py-2.5 font-medium">Active</th>
            <th className="text-left px-3 py-2.5 font-medium">Tier</th>
            <th className="text-right px-3 py-2.5 font-medium hidden md:table-cell">Calls / Month</th>
            <th className="text-left px-4 py-2.5 font-medium hidden lg:table-cell w-48">Usage</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o, i) => {
            const tierCfg = API_TIER_CONFIG[o.tier as keyof typeof API_TIER_CONFIG];
            const monthlyEstimate = tierCfg ? tierCfg.dailyLimit * 30 : 15000;
            const pct = monthlyEstimate > 0 ? Math.min(100, Math.round((o.callsThisMonth / monthlyEstimate) * 100)) : 0;
            const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
            return (
              <tr key={i} className="border-t border-border/60 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{o.orgName ?? "—"}</td>
                <td className="px-3 py-3 text-right font-mono text-xs">{o.keyCount}</td>
                <td className="px-3 py-3 text-right font-mono text-xs text-emerald-600 dark:text-emerald-400">{o.activeKeys}</td>
                <td className="px-3 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${tierBadge(o.tier)}`}>
                    {o.tier}
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs hidden md:table-cell">
                  {o.callsThisMonth.toLocaleString()}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-8 text-right">{pct}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── 4. Usage Analytics ────────────────────────────────────────────────────────

function UsagePanel({ pw }: { pw: string }) {
  const { data, isLoading } = useQuery<UsageData>({
    queryKey: ["admin", "api-management", "usage"],
    queryFn: () =>
      fetch("/api/admin/api-management/usage", {
        headers: { Authorization: `Bearer ${pw}` },
      }).then(r => r.json()),
  });

  if (isLoading) return <LoadingState />;

  const d = data ?? { volumeByDay: [], byEndpoint: [], byStatus: [] };

  const s200 = d.byStatus.filter(x => x.statusCode >= 200 && x.statusCode < 300).reduce((a, b) => a + b.calls, 0);
  const s429 = d.byStatus.filter(x => x.statusCode === 429).reduce((a, b) => a + b.calls, 0);
  const s401 = d.byStatus.filter(x => x.statusCode === 401 || x.statusCode === 403).reduce((a, b) => a + b.calls, 0);
  const s500 = d.byStatus.filter(x => x.statusCode >= 500).reduce((a, b) => a + b.calls, 0);

  return (
    <div className="space-y-6">
      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Volume line chart */}
        <div className="border border-border bg-card rounded-lg p-4">
          <p className="text-sm font-medium text-foreground mb-3">30-Day Call Volume</p>
          {d.volumeByDay.length === 0 ? (
            <EmptyChartState label="No data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={d.volumeByDay}>
                <XAxis dataKey="day" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                <RechartsTooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                />
                <Line type="monotone" dataKey="calls" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top endpoints bar chart */}
        <div className="border border-border bg-card rounded-lg p-4">
          <p className="text-sm font-medium text-foreground mb-3">Top Endpoints This Month</p>
          {d.byEndpoint.length === 0 ? (
            <EmptyChartState label="No endpoint data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={d.byEndpoint} layout="vertical" margin={{ left: 8 }}>
                <XAxis type="number" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  type="category"
                  dataKey="endpoint"
                  tick={{ fontSize: 9 }}
                  stroke="hsl(var(--muted-foreground))"
                  width={120}
                />
                <RechartsTooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                />
                <Bar dataKey="calls" fill="hsl(var(--chart-2, 43 74% 49%))" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Status code breakdown */}
      <div className="border border-border bg-card rounded-lg p-4">
        <p className="text-sm font-medium text-foreground mb-3">Status Code Breakdown (This Month)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatusCodeCard code="2xx" label="Success" value={s200} colorClass="text-emerald-600 dark:text-emerald-400" dotClass="bg-emerald-500" />
          <StatusCodeCard code="429" label="Rate Limited" value={s429} colorClass="text-amber-600 dark:text-amber-400" dotClass="bg-amber-500" />
          <StatusCodeCard code="401/3" label="Unauthorized" value={s401} colorClass="text-red-500" dotClass="bg-red-500" />
          <StatusCodeCard code="5xx" label="Server Error" value={s500} colorClass="text-red-700 dark:text-red-400" dotClass="bg-red-700" />
        </div>
      </div>
    </div>
  );
}

function StatusCodeCard({
  code, label, value, colorClass, dotClass,
}: {
  code: string;
  label: string;
  value: number;
  colorClass: string;
  dotClass: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
      <div>
        <p className={`text-xl font-bold ${colorClass}`}>{value.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground font-mono">{code}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ── 5. Tier Configuration ─────────────────────────────────────────────────────

const ALL_SCOPES = [
  "read:assets",
  "read:institutions",
  "read:pipeline",
  "write:pipeline",
  "read:reports",
  "read:analytics",
] as const;

function TierConfigPanel() {
  return (
    <div className="space-y-6">
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-xs text-muted-foreground">
              <th className="text-left px-4 py-3 font-medium">Feature</th>
              <th className="text-center px-4 py-3 font-medium">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${tierBadge("starter")}`}>Starter</span>
              </th>
              <th className="text-center px-4 py-3 font-medium">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${tierBadge("professional")}`}>Professional</span>
              </th>
              <th className="text-center px-4 py-3 font-medium">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${tierBadge("enterprise")}`}>Enterprise</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Daily limit row */}
            <tr className="border-t border-border/60">
              <td className="px-4 py-3 font-medium text-foreground">Daily call limit</td>
              {(["starter", "professional", "enterprise"] as const).map(tier => (
                <td key={tier} className="px-4 py-3 text-center font-mono text-xs text-foreground">
                  {API_TIER_CONFIG[tier].dailyLimit.toLocaleString()}
                </td>
              ))}
            </tr>

            {/* Scope rows */}
            {ALL_SCOPES.map(scope => (
              <tr key={scope} className="border-t border-border/60 hover:bg-muted/10">
                <td className="px-4 py-2.5">
                  <div>
                    <span className="font-mono text-xs text-foreground">{scope}</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {API_SCOPE_LABELS[scope]?.split(" — ")[1] ?? ""}
                    </p>
                  </div>
                </td>
                {(["starter", "professional", "enterprise"] as const).map(tier => {
                  const included = API_TIER_CONFIG[tier].scopes.includes(scope);
                  return (
                    <td key={tier} className="px-4 py-2.5 text-center">
                      {included
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                        : <span className="text-muted-foreground text-base leading-none">—</span>
                      }
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Tier configuration is defined in <span className="font-mono">shared/schema.ts</span> → <span className="font-mono">API_TIER_CONFIG</span>.
      </p>
    </div>
  );
}

// ── User combobox ─────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
}

function UserCombobox({
  pw,
  value,
  onSelect,
}: {
  pw: string;
  value: string;
  onSelect: (user: AdminUser) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<{ users: AdminUser[] }>({
    queryKey: ["admin", "users-list"],
    queryFn: () =>
      fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${pw}` },
      }).then(r => r.json()),
    staleTime: 60_000,
  });

  const users = data?.users ?? [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return users;
    return users.filter(
      u =>
        u.email.toLowerCase().includes(q) ||
        (u.name ?? "").toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q),
    );
  }, [users, search]);

  const selected = users.find(u => u.id === value);
  const displayLabel = selected
    ? (selected.name ? `${selected.name} — ${selected.email}` : selected.email)
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 py-1 text-xs ring-offset-background",
            "hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate">{displayLabel ?? "Search users…"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground ml-1" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Name, email, or UUID…"
            value={search}
            onValueChange={setSearch}
            className="h-8 text-xs"
          />
          <CommandList>
            {isLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            <CommandEmpty>No users found.</CommandEmpty>
            <CommandGroup>
              {filtered.slice(0, 100).map(u => (
                <CommandItem
                  key={u.id}
                  value={u.id}
                  onSelect={() => {
                    onSelect(u);
                    setSearch("");
                    setOpen(false);
                  }}
                  className="flex items-start gap-2 py-2"
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 mt-0.5 shrink-0",
                      value === u.id ? "opacity-100 text-primary" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0">
                    {u.name && (
                      <p className="text-xs font-medium text-foreground truncate">{u.name}</p>
                    )}
                    <p className={cn("text-xs truncate", u.name ? "text-muted-foreground" : "text-foreground font-medium")}>
                      {u.email}
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground/60 truncate">{u.id}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── 6. Access Grants ──────────────────────────────────────────────────────────

function AccessGrantsPanel({ pw }: { pw: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Issue key form state
  const [grantUserId, setGrantUserId] = useState("");
  const [grantEmail, setGrantEmail] = useState("");
  const [grantTier, setGrantTier] = useState<"starter" | "professional" | "enterprise">("starter");
  const [grantNote, setGrantNote] = useState("");
  const [issuedRaw, setIssuedRaw] = useState<string | null>(null);
  const [issuedCopied, setIssuedCopied] = useState(false);

  const { data, isLoading } = useQuery<{ keys: KeyWithCalls[] }>({
    queryKey: ["admin", "api-management", "keys", "", "all"],
    queryFn: () =>
      fetch("/api/admin/api-management/keys", {
        headers: { Authorization: `Bearer ${pw}` },
      }).then(r => r.json()),
  });

  const issueKey = useMutation({
    mutationFn: () =>
      fetch("/api/admin/api-management/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${pw}` },
        body: JSON.stringify({ userId: grantUserId.trim(), userEmail: grantEmail.trim() || undefined, tier: grantTier, note: grantNote.trim() || undefined }),
      }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Failed"); return d as { ok: boolean; prefix: string; raw: string }; }),
    onSuccess: (d) => {
      setIssuedRaw(d.raw);
      setIssuedCopied(false);
      setGrantUserId(""); setGrantEmail(""); setGrantNote(""); setGrantTier("starter");
      qc.invalidateQueries({ queryKey: ["admin", "api-management"] });
      toast({ title: "Key issued" });
    },
    onError: (e: Error) => toast({ title: "Failed to issue key", description: e.message, variant: "destructive" }),
  });

  const restore = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/api-management/keys/${id}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${pw}` },
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "api-management"] });
      toast({ title: "Key restored" });
    },
    onError: () => toast({ title: "Failed to restore key", variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/api-management/keys/${id}/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${pw}` },
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "api-management"] });
      toast({ title: "Key revoked" });
    },
    onError: () => toast({ title: "Failed to revoke key", variant: "destructive" }),
  });

  if (isLoading) return <LoadingState />;

  const keys = data?.keys ?? [];
  const grantedKeys = keys.filter(k => k.grantedByAdmin != null);
  const suspendedKeys = keys.filter(k => k.status === "suspended");

  return (
    <div className="space-y-8">
      {/* Issue a new key */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Key className="h-4 w-4 text-violet-500" />
          Issue API Key
        </h3>
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">User <span className="text-destructive">*</span></p>
            <UserCombobox
              pw={pw}
              value={grantUserId}
              onSelect={u => { setGrantUserId(u.id); setGrantEmail(u.email); }}
            />
            {grantUserId && (
              <p className="text-[10px] font-mono text-muted-foreground/70 truncate">{grantUserId}</p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Tier</p>
              <Select value={grantTier} onValueChange={v => setGrantTier(v as typeof grantTier)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter (500/day)</SelectItem>
                  <SelectItem value="professional">Professional (5,000/day)</SelectItem>
                  <SelectItem value="enterprise">Enterprise (50,000/day)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Note (optional)</p>
              <Input placeholder="e.g. early access partner" value={grantNote} onChange={e => setGrantNote(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => issueKey.mutate()} disabled={issueKey.isPending || !grantUserId.trim()}>
            {issueKey.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
            Issue key
          </Button>
          {issuedRaw && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2 mt-2">
              <p className="text-xs font-semibold text-amber-600 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Share with user — not stored, won't be shown again
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-xs bg-background border border-border rounded px-2.5 py-1.5 break-all select-all">{issuedRaw}</code>
                <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs gap-1" onClick={() => {
                  navigator.clipboard.writeText(issuedRaw).then(() => { setIssuedCopied(true); setTimeout(() => setIssuedCopied(false), 2000); });
                }}>
                  {issuedCopied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {issuedCopied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Manual access grants */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-violet-500" />
          Manual Access Grants
        </h3>
        {grantedKeys.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="h-8 w-8" />} label="No manually granted keys" sub="Keys granted by an admin will appear here." />
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left px-4 py-2.5 font-medium">Key</th>
                  <th className="text-left px-3 py-2.5 font-medium">Granted to</th>
                  <th className="text-left px-3 py-2.5 font-medium">Granted by</th>
                  <th className="text-left px-3 py-2.5 font-medium hidden md:table-cell">Note</th>
                  <th className="text-right px-4 py-2.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {grantedKeys.map(k => (
                  <tr key={k.id} className="border-t border-border/60 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs">{k.keyPrefix}…</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{k.userEmail ?? k.orgName ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{k.grantedByAdmin ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground hidden md:table-cell max-w-[160px] truncate">
                      {k.accessGrantNote ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {k.status !== "revoked" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-red-500 hover:text-red-600"
                          onClick={() => revoke.mutate(k.id)}
                          disabled={revoke.isPending}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Revoke
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

      {/* Suspended keys */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <XCircle className="h-4 w-4 text-amber-500" />
          Suspended Keys
        </h3>
        {suspendedKeys.length === 0 ? (
          <EmptyState icon={<XCircle className="h-8 w-8" />} label="No suspended keys" sub="Suspended keys will appear here." />
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left px-4 py-2.5 font-medium">Key</th>
                  <th className="text-left px-3 py-2.5 font-medium">Owner</th>
                  <th className="text-left px-3 py-2.5 font-medium hidden md:table-cell">Reason</th>
                  <th className="text-left px-3 py-2.5 font-medium hidden md:table-cell">Suspended by</th>
                  <th className="text-right px-4 py-2.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {suspendedKeys.map(k => (
                  <tr key={k.id} className="border-t border-border/60 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs">{k.keyPrefix}…</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{k.userEmail ?? k.orgName ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground hidden md:table-cell">
                      {k.suspendReason ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground hidden md:table-cell">
                      {k.suspendedBy ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-blue-500 hover:text-blue-600"
                        onClick={() => restore.mutate(k.id)}
                        disabled={restore.isPending}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Restore
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 7. Audit Log ──────────────────────────────────────────────────────────────

function AuditLogPanel({ pw }: { pw: string }) {
  const { data, isLoading } = useQuery<{ events: ApiKeyAuditLog[] }>({
    queryKey: ["admin", "api-management", "audit"],
    queryFn: () =>
      fetch("/api/admin/api-management/audit", {
        headers: { Authorization: `Bearer ${pw}` },
      }).then(r => r.json()),
  });

  if (isLoading) return <LoadingState />;

  const events = data?.events ?? [];

  if (events.length === 0) {
    return <EmptyState icon={<ClipboardList className="h-8 w-8" />} label="No audit events yet" sub="Key actions will be logged here." />;
  }

  return (
    <div className="space-y-2">
      {events.map(ev => {
        const payloadStr = ev.payload
          ? Object.entries(ev.payload)
              .filter(([, v]) => v != null)
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join(" · ")
          : null;
        return (
          <div key={ev.id} className="flex items-start gap-3 p-3 border border-border rounded-lg hover:bg-muted/20 transition-colors">
            <div className="flex-shrink-0 mt-0.5">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${actionBadge(ev.action)}`}>
                {ev.action.replace(/_/g, " ")}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="text-xs text-foreground font-medium">{ev.actorId ?? ev.actorType ?? "admin"}</span>
                {ev.keyPrefix && (
                  <span className="font-mono text-[10px] text-muted-foreground">{ev.keyPrefix}…</span>
                )}
                {payloadStr && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-xs">{payloadStr}</span>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {relativeTime(ev.createdAt)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="border border-border bg-card rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-foreground tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</p>
    </div>
  );
}

function EmptyState({ icon, label, sub }: { icon: React.ReactNode; label: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <div className="mb-3 opacity-30">{icon}</div>
      <p className="text-sm font-medium">{label}</p>
      {sub && <p className="text-xs mt-1 opacity-70">{sub}</p>}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 text-primary animate-spin" />
    </div>
  );
}

function EmptyChartState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-muted-foreground">
      <p className="text-sm">{label}</p>
    </div>
  );
}
