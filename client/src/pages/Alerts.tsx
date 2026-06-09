import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Bell,
  Plus,
  Package,
  Clock,
  Trash2,
  Check,
  ChevronsUpDown,
  Pencil,
  Loader2,
  ArrowRight,
  ToggleLeft,
  ToggleRight,
  Zap,
  Bookmark,
  Search,
  TrendingUp,
} from "lucide-react";
import type { ScoutSavedSearch } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getAuthHeaders } from "@/lib/queryClient";
import type { UserAlert } from "@shared/schema";

const STORAGE_KEY = "edenLastSeenAlerts";
// Per-tab session cache for the captured sinceParam. Set on the first mount
// of the Alerts page in this browser session; subsequent refreshes/navigations
// within the same tab read from this cache so the "Since last visit" counts
// stay stable until the tab is closed (or the user clicks "Mark all seen").
const SESSION_SINCE_KEY = "edenAlertsSessionSince";

function defaultSince(): string {
  return new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
}

function formatSinceLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return "the last 48 hours";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface DeltaInstitution {
  institution: string;
  count: number;
  matchedCount: number;
  matchedBy: string | null;
  sampleAssets: Array<{ id: number; name: string }>;
  matchedSampleAssets: Array<{ id: number; name: string }>;
}

interface IndustryDeltaResponse {
  newAssets: {
    total: number;
    hasAlerts: boolean;
    byInstitution: DeltaInstitution[];
  };
  windowHours: number;
  since?: string;
}

interface PipelineUpdate {
  assetId: number;
  assetName: string;
  institution: string;
  stageFrom: string | null;
  stageTo: string | null;
  occurredAt: string;
}

interface PipelineUpdatesResponse {
  updates: PipelineUpdate[];
  totalSaved: number;
}

interface AlertDeltaBucket {
  alertId: number;
  alertName: string;
  matchCount: number;
  samples: Array<{ id: number; assetName: string; institution: string; modality: string; developmentStage: string }>;
}

interface AlertsDeltaResponse {
  byAlert: AlertDeltaBucket[];
  total: number;
  distinctTotal: number;
  since: string;
}

interface PreviewResponse {
  count: number | string;
  samples: Array<{ id: number; assetName: string; institution: string; modality: string; developmentStage: string }>;
}

interface IndustryProfileBrief {
  notificationPrefs: { frequency: "realtime" | "daily" | "weekly" } | null;
  subscribedToDigest: boolean;
}

function normalizeModality(m: string): string {
  return m.toLowerCase();
}

function normalizeStage(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ");
}

function toDisplayModality(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function toDisplayStage(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function AssetRow({ id, name, institution, modality, stage, index }: {
  id: number; name: string; institution?: string; modality?: string; stage?: string; index: number;
}) {
  return (
    <Link href={`/asset/${id}`}>
      <div
        className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/60 transition-colors cursor-pointer group border border-transparent hover:border-border"
        data-testid={`asset-row-${index}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{name}</p>
          {(institution || modality || stage) && (
            <p className="text-[10px] text-muted-foreground truncate">
              {[institution, modality, stage].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <ArrowRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 transition-colors" />
      </div>
    </Link>
  );
}

function AlertCard({ alert, onDelete, onEdit, onToggleEnabled, isPending, matchCount = 0 }: {
  alert: UserAlert; onDelete: (id: number) => void; onEdit: (a: UserAlert) => void; onToggleEnabled: (id: number, enabled: boolean) => void; isPending: boolean; matchCount?: number;
}) {
  const isAllNew = alert.criteriaType === "all_new";
  const isEnabled = alert.enabled !== false;
  const criteriaChips: { label: string; colorClass: string }[] = [];
  if (alert.query) criteriaChips.push({ label: `"${alert.query}"`, colorClass: "bg-primary/10 text-primary border-primary/20" });
  for (const m of (alert.modalities ?? [])) criteriaChips.push({ label: toDisplayModality(m), colorClass: "bg-primary/10 text-primary border-primary/20" });
  for (const s of (alert.stages ?? [])) criteriaChips.push({ label: toDisplayStage(s), colorClass: "bg-violet-500/10 text-violet-500 border-violet-500/20" });
  for (const inst of (alert.institutions ?? [])) criteriaChips.push({ label: inst, colorClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" });
  for (const c of (alert.continents ?? [])) criteriaChips.push({ label: c, colorClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20" });
  for (const t of (alert.targets ?? [])) criteriaChips.push({ label: t, colorClass: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20" });

  // Build a structured Scout URL that preserves the alert's actual criteria
  // (canonical slugs for modalities/stages, full names for institutions, optional
  // free-text query). Scout reads these params and applies them as filters
  // instead of dumping a flattened display string into the search box.
  const exploreParams = new URLSearchParams();
  if (alert.query?.trim()) exploreParams.set("q", alert.query.trim());
  if ((alert.modalities ?? []).length > 0) exploreParams.set("modalities", (alert.modalities ?? []).join(","));
  if ((alert.stages ?? []).length > 0) exploreParams.set("stages", (alert.stages ?? []).join(","));
  if ((alert.institutions ?? []).length > 0) exploreParams.set("institutions", (alert.institutions ?? []).join(","));
  if ((alert.continents ?? []).length > 0) exploreParams.set("continents", (alert.continents ?? []).join(","));
  if ((alert.targets ?? []).length > 0) exploreParams.set("targets", (alert.targets ?? []).join(","));
  const hasExploreCriteria = exploreParams.toString().length > 0;
  const exploreUrl = `/scout?${exploreParams.toString()}`;

  return (
    <div
      className={`flex items-start gap-3 rounded-md border bg-card px-3 py-2.5 transition-colors ${isEnabled ? "border-border hover:border-primary/30" : "border-border/40 opacity-60"}`}
      data-testid={`alert-card-${alert.id}`}
    >
      <Bell className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${isEnabled ? "text-emerald-500" : "text-muted-foreground"}`} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate" data-testid={`alert-title-${alert.id}`}>
            {alert.name || (isAllNew ? "All New Assets" : alert.query || "Untitled alert")}
          </p>
          {!isEnabled && (
            <span className="text-[10px] px-1.5 py-0 rounded-full bg-muted text-muted-foreground border border-border shrink-0">paused</span>
          )}
          {isEnabled && matchCount > 0 && (
            <Badge
              variant="secondary"
              className="shrink-0 text-[11px] tabular-nums px-1.5 py-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              data-testid={`alert-match-count-${alert.id}`}
            >
              +{matchCount} new
            </Badge>
          )}
        </div>
        {isAllNew ? (
          <p className="text-[11px] text-muted-foreground">Matches all new TTO assets</p>
        ) : criteriaChips.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {criteriaChips.slice(0, 6).map((chip, i) => (
              <span key={i} className={`text-[11px] px-1.5 py-0.5 rounded-full border truncate max-w-[140px] ${chip.colorClass}`}>{chip.label}</span>
            ))}
            {criteriaChips.length > 6 && (
              <span className="text-[11px] text-muted-foreground">+{criteriaChips.length - 6} more</span>
            )}
          </div>
        ) : null}
        {!isAllNew && hasExploreCriteria && (
          <Link href={exploreUrl}>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer" data-testid={`alert-explore-${alert.id}`}>
              Explore matches →
            </span>
          </Link>
        )}
        {alert.lastAlertSentAt ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`alert-last-triggered-${alert.id}`}>
            <Clock className="w-2.5 h-2.5 shrink-0" />
            Last triggered {new Date(alert.lastAlertSentAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/60 flex items-center gap-1" data-testid={`alert-last-triggered-${alert.id}`}>
            <Clock className="w-2.5 h-2.5 shrink-0" />
            Never triggered
          </p>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => onToggleEnabled(alert.id, !isEnabled)}
          className={`transition-colors w-6 h-6 flex items-center justify-center rounded ${isEnabled ? "text-emerald-500 hover:text-muted-foreground hover:bg-muted/60" : "text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10"}`}
          data-testid={`button-toggle-alert-${alert.id}`}
          disabled={isPending}
          title={isEnabled ? "Pause alert" : "Resume alert"}
        >
          {isEnabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
        </button>
        <button
          onClick={() => onEdit(alert)}
          className="text-muted-foreground hover:text-primary transition-colors w-6 h-6 flex items-center justify-center rounded hover:bg-primary/10"
          data-testid={`button-edit-alert-${alert.id}`}
          disabled={isPending}
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={() => onDelete(alert.id)}
          className="text-muted-foreground hover:text-destructive transition-colors w-6 h-6 flex items-center justify-center rounded hover:bg-destructive/10"
          data-testid={`button-delete-alert-${alert.id}`}
          disabled={isPending}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function DeliveryStatusBanner({ profile }: { profile: IndustryProfileBrief | null | undefined }) {
  const frequency = profile?.notificationPrefs?.frequency ?? "daily";
  const subscribed = profile?.subscribedToDigest ?? false;
  const freqLabel = frequency === "weekly" ? "Weekly" : frequency === "realtime" ? "As discovered" : "Daily";

  if (!subscribed) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
        <Bell className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <p className="text-xs text-amber-700 dark:text-amber-400 flex-1">
          Email alerts are disabled.{" "}
          <Link href="/industry/settings" className="underline font-medium">Enable in Settings</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
      <Clock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
      <p className="text-xs text-muted-foreground flex-1">
        Delivering <span className="font-medium text-foreground">{freqLabel}</span> via email · 6am–10pm ET delivery window ·{" "}
        <Link href="/industry/settings" className="text-primary hover:underline">Manage frequency</Link>
      </p>
    </div>
  );
}

function MyAlertsSection({ onCreateAlert, matchCounts = {}, profile }: { onCreateAlert: () => void; matchCounts?: Record<number, number>; profile?: IndustryProfileBrief | null }) {
  const [editingAlert, setEditingAlert] = useState<UserAlert | null>(null);
  const { data: alerts = [], isLoading } = useQuery<UserAlert[]>({ queryKey: ["/api/alerts"] });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/alerts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/delta"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/unread-count"] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiRequest("PATCH", `/api/alerts/${id}/enabled`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/delta"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/unread-count"] });
    },
  });

  const activeAlerts = alerts.filter((a) => a.enabled !== false);
  const pausedAlerts = alerts.filter((a) => a.enabled === false);

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald-500" />
            My Saved Alerts
            {alerts.length > 0 && (
              <Badge variant="secondary" className="text-[11px] tabular-nums">{alerts.length}</Badge>
            )}
          </h2>
          <button
            onClick={onCreateAlert}
            className="text-xs text-primary hover:underline flex items-center gap-1"
            data-testid="button-create-alert-inline"
          >
            <Plus className="w-3 h-3" /> Add alert
          </button>
        </div>

        <DeliveryStatusBanner profile={profile} />

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-5 text-center space-y-2" data-testid="alerts-empty-state">
            <p className="text-xs text-muted-foreground">No saved alerts yet. Create one to personalise your TTO asset feed.</p>
            <button
              onClick={onCreateAlert}
              className="text-xs text-primary hover:underline"
              data-testid="button-create-first-alert"
            >
              + Create your first alert
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {activeAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onDelete={(id) => deleteMutation.mutate(id)}
                onEdit={(a) => setEditingAlert(a)}
                onToggleEnabled={(id, enabled) => toggleMutation.mutate({ id, enabled })}
                isPending={deleteMutation.isPending || toggleMutation.isPending}
                matchCount={matchCounts[alert.id] ?? 0}
              />
            ))}
            {pausedAlerts.length > 0 && (
              <div className="pt-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium px-0.5 pb-1.5">Paused</p>
                <div className="space-y-2">
                  {pausedAlerts.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onDelete={(id) => deleteMutation.mutate(id)}
                      onEdit={(a) => setEditingAlert(a)}
                      onToggleEnabled={(id, enabled) => toggleMutation.mutate({ id, enabled })}
                      isPending={deleteMutation.isPending || toggleMutation.isPending}
                      matchCount={0}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {editingAlert && (
        <EditAlertSheet alert={editingAlert} onClose={() => setEditingAlert(null)} />
      )}
    </>
  );
}

function AlertBucketRows({ bucket }: { bucket: AlertDeltaBucket }) {
  return (
    <div className="space-y-0.5" data-testid={`alert-bucket-${bucket.alertId}`}>
      <div className="flex items-center gap-2 px-1 pb-1">
        <Bell className="w-3 h-3 text-emerald-500 shrink-0" />
        <span className="text-[11px] font-semibold text-foreground truncate">{bucket.alertName}</span>
        <Badge variant="secondary" className="text-[10px] tabular-nums shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          +{bucket.matchCount}
        </Badge>
      </div>
      {bucket.samples.map((asset, j) => (
        <AssetRow
          key={asset.id}
          id={asset.id}
          name={asset.assetName}
          institution={asset.institution}
          modality={asset.modality}
          stage={asset.developmentStage}
          index={j}
        />
      ))}
      {bucket.matchCount > bucket.samples.length && (
        <p className="text-[10px] text-muted-foreground px-3 pt-0.5">
          +{bucket.matchCount - bucket.samples.length} more in this alert
        </p>
      )}
    </div>
  );
}

const FLAT_LIST_MAX = 30;

function PipelineUpdatesSection({ sinceParam }: { sinceParam: string }) {
  const url = `/api/alerts/pipeline-updates?since=${encodeURIComponent(sinceParam)}`;
  const { data, isLoading } = useQuery<PipelineUpdatesResponse>({
    queryKey: [url],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const r = await fetch(url, { credentials: "include", headers });
      if (!r.ok) return { updates: [], totalSaved: 0 };
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const updates = data?.updates ?? [];
  const totalSaved = data?.totalSaved ?? 0;

  if (!isLoading && totalSaved === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          Pipeline Updates
          {updates.length > 0 && (
            <Badge variant="secondary" className="text-[11px] tabular-nums bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              {updates.length} stage {updates.length === 1 ? "change" : "changes"}
            </Badge>
          )}
        </h2>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
        </div>
      ) : updates.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1 px-1">
          No stage changes in your {totalSaved} tracked asset{totalSaved !== 1 ? "s" : ""} since your last visit.
        </p>
      ) : (
        <div className="space-y-1.5">
          {updates.map((u) => (
            <Link key={`${u.assetId}-${u.occurredAt}`} href={`/asset/${u.assetId}`}>
              <div className="flex items-start gap-3 px-3 py-2.5 rounded-md border border-border bg-card hover:border-primary/30 transition-colors cursor-pointer group">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                    {u.assetName}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">{u.institution}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-medium">
                  <span className="text-muted-foreground capitalize">{u.stageFrom ?? "—"}</span>
                  <ArrowRight className="w-3 h-3 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400 capitalize">{u.stageTo ?? "—"}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NewTtoAssetsSection({
  industryData,
  alertsDelta,
  alertsDeltaLoading,
  hasAlerts,
  onCreateAlert,
}: {
  industryData: IndustryDeltaResponse["newAssets"] | undefined;
  alertsDelta: AlertsDeltaResponse | undefined;
  alertsDeltaLoading: boolean;
  hasAlerts: boolean;
  onCreateAlert: () => void;
}) {
  const hasMatchedAlerts = !!(alertsDelta && alertsDelta.byAlert.length > 0);
  const totalUnfiltered = industryData?.total ?? 0;

  const flatAssets: Array<{ id: number; name: string; institution: string }> =
    (industryData?.byInstitution ?? []).flatMap((inst) =>
      inst.sampleAssets.map((a) => ({ id: a.id, name: a.name, institution: inst.institution }))
    );
  const flatVisible = flatAssets.slice(0, FLAT_LIST_MAX);
  const flatHidden = flatAssets.length - flatVisible.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Package className="w-4 h-4 text-emerald-500" />
          New TTO Assets
          {hasMatchedAlerts && (
            <Badge variant="secondary" className="text-[11px] tabular-nums bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              +{alertsDelta!.distinctTotal ?? alertsDelta!.total}
            </Badge>
          )}
          {!hasMatchedAlerts && totalUnfiltered > 0 && (
            <Badge variant="secondary" className="text-[11px] tabular-nums">+{totalUnfiltered}</Badge>
          )}
        </h2>
      </div>

      {!hasAlerts && (
        <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 px-4 py-3 flex items-start gap-3" data-testid="alerts-setup-prompt">
          <Bell className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground">Set up an alert to personalise this feed</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">All new assets are shown below — create a saved alert to filter by modality, stage, or institution.</p>
            <button onClick={onCreateAlert} className="text-xs text-primary hover:underline mt-1" data-testid="button-create-alert-from-tto">
              + Create an alert →
            </button>
          </div>
        </div>
      )}

      {alertsDeltaLoading ? (
        <div className="space-y-1">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
        </div>
      ) : hasMatchedAlerts ? (
        <div className="space-y-4" data-testid="alert-matched-buckets">
          {alertsDelta!.byAlert.map((bucket) => (
            <AlertBucketRows key={bucket.alertId} bucket={bucket} />
          ))}
        </div>
      ) : hasAlerts ? (
        // User has alerts but none matched — show focused message, not a raw dump
        <p className="text-xs text-muted-foreground py-2 px-1" data-testid="no-alert-matches">
          No new assets matched your alert criteria since your last visit.{" "}
          <Link href="/scout" className="text-primary hover:underline">Search in Scout →</Link>
        </p>
      ) : (
        // No alerts set — show unfiltered discovery feed
        <>
          {flatVisible.length > 0 ? (
            <div className="space-y-0.5" data-testid="flat-asset-list">
              {flatVisible.map((asset, i) => (
                <AssetRow key={asset.id} id={asset.id} name={asset.name} institution={asset.institution} index={i} />
              ))}
              {flatHidden > 0 && (
                <p className="text-[10px] text-muted-foreground px-3 pt-1">
                  +{flatHidden} more · <Link href="/scout" className="text-primary hover:underline">search in Scout</Link>
                </p>
              )}
              {totalUnfiltered > flatAssets.length && (
                <p className="text-[10px] text-muted-foreground px-3">
                  {totalUnfiltered - flatAssets.length} additional assets not sampled · <Link href="/scout" className="text-primary hover:underline">search in Scout</Link>
                </p>
              )}
            </div>
          ) : !alertsDeltaLoading && (
            <p className="text-xs text-muted-foreground py-3 px-1" data-testid="no-new-assets">
              No new TTO assets since your last visit. Check back soon.
            </p>
          )}
        </>
      )}
    </div>
  );
}


const MODALITY_OPTIONS = [
  "Small Molecule", "Antibody", "CAR-T", "Gene Therapy",
  "mRNA Therapy", "Peptide", "Bispecific Antibody", "ADC", "PROTAC",
];
const STAGE_OPTIONS = ["Discovery", "Preclinical", "Phase 1", "Phase 2", "Phase 3"];
const CONTINENT_OPTIONS = ["North America", "Europe", "Asia-Pacific", "Latin America"];

function MultiSelectCombobox({
  options,
  selected,
  onToggle,
  placeholder,
  searchPlaceholder,
  testId,
}: {
  options: string[];
  selected: string[];
  onToggle: (val: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = options.filter((o) => o.toLowerCase().includes(search.toLowerCase()));
  const label = selected.length === 0 ? placeholder : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm text-left hover:bg-accent/20 transition-colors"
          data-testid={testId}
        >
          <span className={selected.length === 0 ? "text-muted-foreground" : "text-foreground truncate"}>{label}</span>
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No options found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((opt) => (
                <CommandItem key={opt} onSelect={() => onToggle(opt)} className="flex items-center gap-2">
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${selected.includes(opt) ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                    {selected.includes(opt) && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                  </div>
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function TargetCombobox({ selected, onToggle }: { selected: string[]; onToggle: (val: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: allTargets = [] } = useQuery<string[]>({
    queryKey: ["/api/alerts/targets"],
    staleTime: 10 * 60 * 1000,
  });
  const filtered = allTargets.filter((t) => t.toLowerCase().includes(search.toLowerCase())).slice(0, 80);
  const label = selected.length === 0 ? "Any target" : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm text-left hover:bg-accent/20 transition-colors"
          data-testid="select-alert-targets"
        >
          <span className={selected.length === 0 ? "text-muted-foreground" : "text-foreground truncate"}>{label}</span>
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search targets (KRAS, EGFR…)" value={search} onValueChange={setSearch} />
          <CommandList className="max-h-60">
            <CommandEmpty>No targets found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((t) => (
                <CommandItem key={t} onSelect={() => onToggle(t)} className="flex items-center gap-2">
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${selected.includes(t) ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                    {selected.includes(t) && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                  </div>
                  <span className="truncate text-sm">{t}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function InstitutionCombobox({ selected, onToggle }: { selected: string[]; onToggle: (val: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: allInstitutions = [] } = useQuery<string[]>({
    queryKey: ["/api/ingest/institutions/names"],
    staleTime: 10 * 60 * 1000,
  });
  const filtered = allInstitutions.filter((inst) => inst.toLowerCase().includes(search.toLowerCase())).slice(0, 100);
  const label = selected.length === 0 ? "All institutions" : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm text-left hover:bg-accent/20 transition-colors"
          data-testid="select-alert-institutions"
        >
          <span className={selected.length === 0 ? "text-muted-foreground" : "text-foreground truncate"}>{label}</span>
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Type to search institutions..." value={search} onValueChange={setSearch} />
          <CommandList className="max-h-60">
            <CommandEmpty>No institutions found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((inst) => (
                <CommandItem key={inst} onSelect={() => onToggle(inst)} className="flex items-center gap-2">
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${selected.includes(inst) ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                    {selected.includes(inst) && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                  </div>
                  <span className="truncate text-sm">{inst}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AlertPreviewSection({ query, modalities, stages, institutions, continents, targets }: {
  query: string; modalities: string[]; stages: string[]; institutions: string[]; continents: string[]; targets: string[];
}) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const hasAnyFilter = !!(query.trim()) || modalities.length > 0 || stages.length > 0 || institutions.length > 0 || continents.length > 0 || targets.length > 0;

  useEffect(() => {
    if (!hasAnyFilter) { setPreview(null); return; }
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await apiRequest("POST", "/api/alerts/preview", {
          query: query.trim() || null,
          modalities: modalities.map(normalizeModality),
          stages: stages.map(normalizeStage),
          institutions,
          continents,
          targets,
        });
        const data = await res.json();
        setPreview(data);
      } catch { setPreview(null); }
      finally { setIsLoading(false); }
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, modalities.join(","), stages.join(","), institutions.join(","), continents.join(","), targets.join(","), hasAnyFilter]);

  if (!hasAnyFilter) return null;

  return (
    <div className="rounded-md border border-card-border bg-muted/30 p-3 space-y-1.5" data-testid="alert-preview">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-foreground">Preview matches</span>
        {isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        {!isLoading && preview && (
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium" data-testid="preview-count">
            ~{preview.count} existing asset{preview.count === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {!isLoading && preview && preview.samples.length > 0 && (
        <div className="space-y-1">
          {preview.samples.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-[11px] text-muted-foreground truncate">{s.assetName}</span>
              <span className="text-[10px] text-muted-foreground/60 shrink-0">— {s.institution}</span>
            </div>
          ))}
        </div>
      )}
      {!isLoading && preview && preview.count === 0 && (
        <p className="text-[11px] text-muted-foreground">No existing assets match these criteria yet.</p>
      )}
    </div>
  );
}

function AlertFormFields({
  query, setQuery,
  modalities, stages, institutions, continents, targets,
  toggleModality, toggleStage, toggleInstitution, toggleContinent, toggleTarget,
  idPrefix,
}: {
  query: string; setQuery: (v: string) => void;
  modalities: string[]; stages: string[]; institutions: string[]; continents: string[]; targets: string[];
  toggleModality: (v: string) => void; toggleStage: (v: string) => void;
  toggleInstitution: (v: string) => void; toggleContinent: (v: string) => void; toggleTarget: (v: string) => void;
  idPrefix: string;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-query`}>Query</Label>
        <Input
          id={`${idPrefix}-query`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. CAR-T solid tumor preclinical"
          data-testid={`input-${idPrefix}-query`}
        />
      </div>
      <div className="space-y-2">
        <Label>Modality</Label>
        <MultiSelectCombobox options={MODALITY_OPTIONS} selected={modalities} onToggle={toggleModality} placeholder="Any modality" searchPlaceholder="Search modalities..." testId={`select-${idPrefix}-modality`} />
        {modalities.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {modalities.map((m) => (
              <span key={m} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
                {m}<button onClick={() => toggleModality(m)} className="hover:text-destructive">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>Target</Label>
        <TargetCombobox selected={targets} onToggle={toggleTarget} />
        {targets.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {targets.map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-500/10 text-teal-600 border border-teal-500/20 flex items-center gap-1">
                {t}<button onClick={() => toggleTarget(t)} className="hover:text-destructive">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>Stage</Label>
        <MultiSelectCombobox options={STAGE_OPTIONS} selected={stages} onToggle={toggleStage} placeholder="Any stage" searchPlaceholder="Search stages..." testId={`select-${idPrefix}-stage`} />
        {stages.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {stages.map((s) => (
              <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500 border border-violet-500/20 flex items-center gap-1">
                {s}<button onClick={() => toggleStage(s)} className="hover:text-destructive">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>Geography</Label>
        <MultiSelectCombobox options={CONTINENT_OPTIONS} selected={continents} onToggle={toggleContinent} placeholder="All regions" searchPlaceholder="Search regions..." testId={`select-${idPrefix}-continent`} />
        {continents.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {continents.map((c) => (
              <span key={c} className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-600 border border-sky-500/20 flex items-center gap-1">
                {c}<button onClick={() => toggleContinent(c)} className="hover:text-destructive">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>Institutions</Label>
        <InstitutionCombobox selected={institutions} onToggle={toggleInstitution} />
        {institutions.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {institutions.map((inst) => (
              <span key={inst} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center gap-1 max-w-[150px]">
                <span className="truncate">{inst}</span>
                <button onClick={() => toggleInstitution(inst)} className="hover:text-destructive shrink-0">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <AlertPreviewSection query={query} modalities={modalities} stages={stages} institutions={institutions} continents={continents} targets={targets} />
    </>
  );
}

function EditAlertSheet({ alert, onClose }: { alert: UserAlert; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(alert.name ?? "");
  const [query, setQuery] = useState(alert.query ?? "");
  const [modalities, setModalities] = useState<string[]>((alert.modalities ?? []).map(toDisplayModality));
  const [stages, setStages] = useState<string[]>((alert.stages ?? []).map(toDisplayStage));
  const [institutions, setInstitutions] = useState<string[]>(alert.institutions ?? []);
  const [continents, setContinents] = useState<string[]>(alert.continents ?? []);
  const [targets, setTargets] = useState<string[]>(alert.targets ?? []);
  const isAllNew = alert.criteriaType === "all_new";

  function toggle<T>(arr: T[], setArr: (v: T[]) => void, val: T) {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  }

  const editMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/alerts/${alert.id}`, {
        name: name.trim(),
        query: isAllNew ? null : (query.trim() || null),
        modalities: isAllNew ? null : modalities.map(normalizeModality),
        stages: isAllNew ? null : stages.map(normalizeStage),
        institutions: isAllNew ? null : institutions,
        continents: isAllNew ? null : continents,
        targets: isAllNew ? null : targets,
        criteriaType: alert.criteriaType ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/delta"] });
      toast({ title: "Alert updated" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Error updating alert", description: err.message, variant: "destructive" });
    },
  });

  function handleSave() {
    if (!name.trim()) {
      toast({ title: "Alert name is required", variant: "destructive" });
      return;
    }
    if (!isAllNew && !query.trim() && modalities.length === 0 && stages.length === 0 && institutions.length === 0 && continents.length === 0 && targets.length === 0) {
      toast({ title: "Set at least one filter", variant: "destructive" });
      return;
    }
    editMutation.mutate();
  }

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Alert</SheetTitle>
          <SheetDescription>Update your saved alert criteria.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="edit-alert-name">Alert Name <span className="text-destructive">*</span></Label>
            <Input
              id="edit-alert-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CAR-T Watch, Phase 2+ Oncology"
              data-testid="input-edit-alert-name"
            />
          </div>
          {!isAllNew && (
            <AlertFormFields
              query={query} setQuery={setQuery}
              modalities={modalities} stages={stages} institutions={institutions} continents={continents} targets={targets}
              toggleModality={(v) => toggle(modalities, setModalities, v)}
              toggleStage={(v) => toggle(stages, setStages, v)}
              toggleInstitution={(v) => toggle(institutions, setInstitutions, v)}
              toggleContinent={(v) => toggle(continents, setContinents, v)}
              toggleTarget={(v) => toggle(targets, setTargets, v)}
              idPrefix="edit-alert"
            />
          )}
          {isAllNew && (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5">
              <p className="text-xs text-primary font-medium flex items-center gap-1.5">
                <Zap className="w-3 h-3" /> All New Assets
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">This alert matches every new relevant TTO asset — no filters applied.</p>
            </div>
          )}
          <div className="pt-2 flex gap-3">
            <Button className="flex-1" onClick={handleSave} disabled={editMutation.isPending} data-testid="button-update-alert">
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
            <Button variant="outline" onClick={onClose} data-testid="button-cancel-edit-alert">Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const QUICK_TEMPLATES = [
  {
    id: "therapeutic_focus",
    label: "My Therapeutic Focus",
    description: "New assets in your therapeutic area (e.g. oncology, rare disease)",
    criteriaType: null,
    query: "", modalities: [] as string[], stages: [] as string[], institutions: [] as string[],
    queryPlaceholder: "e.g. oncology, rare disease, immunology",
  },
  {
    id: "phase2plus",
    label: "New Phase 2+ Assets",
    description: "Clinical-stage assets ready for partnership",
    criteriaType: null,
    query: "", modalities: [] as string[], stages: ["Phase 2", "Phase 3"] as string[], institutions: [] as string[],
  },
  {
    id: "antibody",
    label: "New Antibody Assets",
    description: "Monoclonal and bispecific antibody programs",
    criteriaType: null,
    query: "", modalities: ["Antibody", "Bispecific Antibody"] as string[], stages: [] as string[], institutions: [] as string[],
  },
  {
    id: "gene_therapy",
    label: "Gene & Cell Therapy",
    description: "Gene therapy, CAR-T, and cell-based programs",
    criteriaType: null,
    query: "", modalities: ["Gene Therapy", "CAR-T"] as string[], stages: [] as string[], institutions: [] as string[],
  },
];

function CreateAlertSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [modalities, setModalities] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [institutions, setInstitutions] = useState<string[]>([]);
  const [continents, setContinents] = useState<string[]>([]);
  const [targets, setTargets] = useState<string[]>([]);
  const [criteriaType, setCriteriaType] = useState<string | null>(null);

  function toggle<T>(arr: T[], setArr: (v: T[]) => void, val: T) {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  }

  function applyTemplate(tmpl: typeof QUICK_TEMPLATES[number]) {
    setCriteriaType(tmpl.criteriaType);
    setName(tmpl.label);
    setQuery(tmpl.query);
    setModalities([...tmpl.modalities]);
    setStages([...tmpl.stages]);
    setInstitutions([...tmpl.institutions]);
    setContinents([]);
    setTargets([]);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/alerts", {
        name: name.trim(),
        query: criteriaType === "all_new" ? null : (query.trim() || null),
        modalities: criteriaType === "all_new" ? null : modalities.map(normalizeModality),
        stages: criteriaType === "all_new" ? null : stages.map(normalizeStage),
        institutions: criteriaType === "all_new" ? null : institutions,
        continents: criteriaType === "all_new" ? null : continents,
        targets: criteriaType === "all_new" ? null : targets,
        criteriaType: criteriaType ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/delta"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/unread-count"] });
      toast({ title: "Alert saved", description: "You'll see it in My Saved Alerts." });
      setName(""); setQuery(""); setModalities([]); setStages([]); setInstitutions([]); setContinents([]); setTargets([]); setCriteriaType(null);
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Error saving alert", description: err.message, variant: "destructive" });
    },
  });

  function handleSave() {
    if (!name.trim()) {
      toast({ title: "Alert name is required", variant: "destructive" });
      return;
    }
    if (criteriaType !== "all_new" && !query.trim() && modalities.length === 0 && stages.length === 0 && institutions.length === 0 && continents.length === 0 && targets.length === 0) {
      toast({ title: "Set at least one filter", variant: "destructive" });
      return;
    }
    saveMutation.mutate();
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Create Alert</SheetTitle>
          <SheetDescription>Set up a saved search that notifies you when new matching assets are found.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-5">
          {/* Quick start templates */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick Start</p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => applyTemplate(tmpl)}
                  className={`text-left rounded-md border px-2.5 py-2 transition-colors hover:border-primary/40 hover:bg-primary/5 ${name === tmpl.label && criteriaType === tmpl.criteriaType ? "border-primary/50 bg-primary/10" : "border-border bg-muted/20"}`}
                  data-testid={`template-${tmpl.id}`}
                >
                  <p className="text-[11px] font-semibold text-foreground">{tmpl.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{tmpl.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-border/40 pt-4 space-y-5">
            {/* Name field — always visible */}
            <div className="space-y-2">
              <Label htmlFor="alert-name">Alert Name <span className="text-destructive">*</span></Label>
              <Input
                id="alert-name"
                value={name}
                onChange={(e) => { setName(e.target.value); }}
                placeholder="e.g. CAR-T Watch, Phase 2+ Oncology"
                data-testid="input-alert-name"
              />
            </div>

            {criteriaType === "all_new" ? (
              <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5">
                <p className="text-xs text-primary font-medium flex items-center gap-1.5">
                  <Zap className="w-3 h-3" /> All New Assets
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">This alert matches every new relevant TTO asset — no filters applied.</p>
                <button
                  className="text-[11px] text-muted-foreground hover:text-foreground underline mt-2"
                  onClick={() => { setCriteriaType(null); setModalities([]); setStages([]); setQuery(""); setContinents([]); setTargets([]); }}
                >
                  Switch to filtered criteria
                </button>
              </div>
            ) : (
              <AlertFormFields
                query={query} setQuery={setQuery}
                modalities={modalities} stages={stages} institutions={institutions} continents={continents} targets={targets}
                toggleModality={(v) => toggle(modalities, setModalities, v)}
                toggleStage={(v) => toggle(stages, setStages, v)}
                toggleInstitution={(v) => toggle(institutions, setInstitutions, v)}
                toggleContinent={(v) => toggle(continents, setContinents, v)}
                toggleTarget={(v) => toggle(targets, setTargets, v)}
                idPrefix="alert"
              />
            )}
          </div>

          <div className="pt-2 flex gap-3">
            <Button className="flex-1" onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-alert">
              {saveMutation.isPending ? "Saving..." : "Save Alert"}
            </Button>
            <Button variant="outline" onClick={onClose} data-testid="button-cancel-alert">Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SavedSearchesSection() {
  const { toast } = useToast();

  const { data: savedSearches = [], isLoading } = useQuery<ScoutSavedSearch[]>({
    queryKey: ["/api/scout/saved-searches"],
    staleTime: 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/scout/saved-searches/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scout/saved-searches"] });
      toast({ title: "Saved search removed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleEmailMutation = useMutation({
    mutationFn: ({ id, notifyByEmail }: { id: number; notifyByEmail: boolean }) =>
      apiRequest("PATCH", `/api/scout/saved-searches/${id}`, { notifyByEmail }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/scout/saved-searches"] }),
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return null;
  if (savedSearches.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Bookmark className="w-3.5 h-3.5 text-muted-foreground" />
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Saved Searches</h2>
      </div>
      <div className="space-y-2">
        {savedSearches.map((s) => {
          const filters = (s.filters ?? {}) as Record<string, unknown>;
          const chips: string[] = [];
          if (s.query) chips.push(`"${s.query}"`);
          for (const m of ((filters.modalities ?? []) as string[])) chips.push(m);
          for (const st of ((filters.stages ?? []) as string[])) chips.push(st);

          const params = new URLSearchParams();
          if (s.query) params.set("q", s.query);
          if (((filters.modalities ?? []) as string[]).length > 0)
            params.set("modalities", ((filters.modalities ?? []) as string[]).join(","));
          if (((filters.stages ?? []) as string[]).length > 0)
            params.set("stages", ((filters.stages ?? []) as string[]).join(","));

          return (
            <div
              key={s.id}
              className="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2.5 group hover:border-primary/30 transition-colors"
              data-testid={`saved-search-${s.id}`}
            >
              <Search className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-xs font-semibold text-foreground truncate">{s.name}</p>
                {chips.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {chips.slice(0, 4).map((c) => (
                      <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">{c}</span>
                    ))}
                    {chips.length > 4 && (
                      <span className="text-[10px] text-muted-foreground">+{chips.length - 4} more</span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-3 pt-0.5">
                  <a
                    href={`/scout?${params.toString()}`}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1"
                  >
                    <ArrowRight className="w-3 h-3" />
                    Run search
                  </a>
                  <button
                    onClick={() => toggleEmailMutation.mutate({ id: s.id, notifyByEmail: !s.notifyByEmail })}
                    className={`text-[11px] flex items-center gap-1 transition-colors ${s.notifyByEmail ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground hover:text-foreground"}`}
                    title={s.notifyByEmail ? "Email alerts on" : "Email alerts off"}
                  >
                    <Bell className="w-3 h-3" />
                    {s.notifyByEmail ? "Alerting" : "Alert me"}
                  </button>
                </div>
              </div>
              <button
                onClick={() => deleteMutation.mutate(s.id)}
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                data-testid={`delete-saved-search-${s.id}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Alerts() {
  const [sheetOpen, setSheetOpen] = useState(false);
  // sinceParam: initialised from DB lastViewedAlertsAt so badge and page counts agree.
  // Falls back to localStorage, then to 7-days-ago default.
  const [sinceParam, setSinceParam] = useState<string>(() => {
    if (typeof window !== "undefined") {
      // Per-session cache wins so refreshes within the same tab keep the same
      // "Since last visit" baseline even after mark-read advances the DB.
      return sessionStorage.getItem(SESSION_SINCE_KEY)
        ?? localStorage.getItem(STORAGE_KEY)
        ?? defaultSince();
    }
    return defaultSince();
  });

  const { data: alerts = [] } = useQuery<UserAlert[]>({ queryKey: ["/api/alerts"] });

  const { data: profileData } = useQuery<{ profile: IndustryProfileBrief | null }>({
    queryKey: ["/api/industry/profile"],
    staleTime: 10 * 60 * 1000,
  });
  const profile = profileData?.profile;

  // Per-visit snapshot lifecycle:
  //   - "Visit" = one Alerts route instance. Refreshes (full page reload) do
  //     NOT fire React's cleanup, so the sessionStorage cache survives and
  //     keeps the snapshot stable across reloads within the same visit.
  //   - Navigating away (wouter route change) DOES fire cleanup, which clears
  //     the cache. The next entry to /alerts is a new visit and re-snapshots.
  //   - On every mount: always call mark-read so the sidebar badge clears.
  //   - First mount of a visit: read DB viewed-since BEFORE mark-read so the
  //     snapshot reflects the *previous* visit boundary.
  useEffect(() => {
    let cancelled = false;
    const fireMarkRead = () => {
      apiRequest("POST", "/api/alerts/mark-read").then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/alerts/unread-count"] });
      }).catch(() => {});
    };
    const cached = sessionStorage.getItem(SESSION_SINCE_KEY);
    if (cached) {
      // This is a refresh within the current visit — keep snapshot stable.
      fireMarkRead();
    } else {
      getAuthHeaders().then(async (authHeaders) => {
        let captured: string | null = null;
        try {
          const r = await fetch("/api/alerts/viewed-since", { credentials: "include", headers: authHeaders });
          if (r.ok) {
            const { since } = await r.json();
            if (since) captured = since as string;
          }
        } catch { /* ignore */ }
        if (cancelled) return;
        const lockedSince = captured ?? sinceParam;
        sessionStorage.setItem(SESSION_SINCE_KEY, lockedSince);
        if (captured) {
          setSinceParam(captured);
          localStorage.setItem(STORAGE_KEY, captured);
        }
        fireMarkRead();
      });
    }
    return () => {
      cancelled = true;
      // Clear the per-visit snapshot when leaving Alerts via in-app
      // navigation. Page reloads/closes don't fire this cleanup, so the
      // cache survives a refresh (intended).
      sessionStorage.removeItem(SESSION_SINCE_KEY);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deltaUrl = `/api/industry/alerts/delta?since=${encodeURIComponent(sinceParam)}`;
  const alertsDeltaUrl = `/api/alerts/delta?since=${encodeURIComponent(sinceParam)}`;

  const { data, isLoading } = useQuery<IndustryDeltaResponse>({
    queryKey: [deltaUrl],
    staleTime: 5 * 60 * 1000,
  });

  const { data: alertsDelta, isLoading: alertsDeltaLoading } = useQuery<AlertsDeltaResponse>({
    queryKey: ["/api/alerts/delta", sinceParam],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const r = await fetch(alertsDeltaUrl, { credentials: "include", headers: authHeaders });
      if (!r.ok) return { byAlert: [], total: 0, distinctTotal: 0, since: "" } as AlertsDeltaResponse;
      const json = await r.json();
      // Guard: ensure shape is correct even if server returns unexpected payload
      if (!Array.isArray(json?.byAlert)) return { byAlert: [], total: 0, distinctTotal: 0, since: "" } as AlertsDeltaResponse;
      return json as AlertsDeltaResponse;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch unread count from the same backend endpoint as the sidebar badge.
  // This guarantees the Alerts-tab TTO count is always identical to the badge count.
  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/alerts/unread-count"],
    staleTime: 5 * 60 * 1000,
  });

  const hasAlerts = alerts.length > 0;
  const alertMatchCounts: Record<number, number> = Object.fromEntries(
    (alertsDelta?.byAlert ?? []).map((b) => [b.alertId, b.matchCount])
  );
  // alertsDelta reflects the pre-visit snapshot (sinceParam) and is the right
  // source for "since last visit" counts. unreadData is zeroed by mark-read on
  // mount, so using it first produces +0 even when there are new assets.
  const sidebarTtoCount = hasAlerts
    ? (alertsDelta?.distinctTotal ?? alertsDelta?.total ?? unreadData?.count ?? 0)
    : (data?.newAssets.total ?? 0);
  const totalNew = sidebarTtoCount;

  const sinceLabel = formatSinceLabel(sinceParam);

  function handleMarkAllSeen() {
    const now = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, now);
    // Refresh the per-session snapshot too so the page deltas zero out
    // immediately on this explicit click (rather than waiting for the next
    // session). Without this, the locked sessionStorage value would keep the
    // old "+N" counts visible after the user said "Mark all seen".
    sessionStorage.setItem(SESSION_SINCE_KEY, now);
    setSinceParam(now);
    window.dispatchEvent(new CustomEvent("eden-alerts-seen"));
    // Sync DB lastViewedAlertsAt so badge stays consistent
    apiRequest("POST", "/api/alerts/mark-read").then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/unread-count"] });
    }).catch(() => {});
  }

  return (
    <div className="min-h-full">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-foreground">Alerts</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                New TTO assets since {sinceLabel}. Alerts deliver by email when new matches are found.
              </p>
            </div>
            <Button className="gap-2 shrink-0" onClick={() => setSheetOpen(true)} data-testid="button-create-alert">
              <Plus className="w-4 h-4" />
              Create Alert
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
        {isLoading && alertsDeltaLoading ? (
          <div className="space-y-3 max-w-2xl">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : !data ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Bell className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">Could not load alerts</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
              <MyAlertsSection onCreateAlert={() => setSheetOpen(true)} matchCounts={alertMatchCounts} profile={profile} />

              <div className="border-t border-border/40" />

              <PipelineUpdatesSection sinceParam={sinceParam} />

              <NewTtoAssetsSection
                industryData={data.newAssets}
                alertsDelta={alertsDelta}
                alertsDeltaLoading={alertsDeltaLoading}
                hasAlerts={hasAlerts}
                onCreateAlert={() => setSheetOpen(true)}
              />

              <SavedSearchesSection />
            </div>

            <div className="lg:col-span-1">
              <div className="rounded-lg border border-border bg-card p-5 space-y-3 sticky top-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs font-medium">Since last visit</span>
                </div>
                <p className="text-[11px] text-muted-foreground/70 -mt-1" data-testid="text-since-label">
                  {sinceLabel}
                </p>
                <div className="border-t border-border/60 pt-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">New TTO assets</span>
                  <span className="text-xl font-bold text-primary tabular-nums" data-testid="sidebar-tto-count">+{totalNew}</span>
                </div>
                {totalNew > 0 && (
                  <button
                    onClick={handleMarkAllSeen}
                    className="w-full text-[11px] text-muted-foreground hover:text-foreground border border-border rounded-md py-1.5 transition-colors flex items-center justify-center gap-1.5"
                    data-testid="button-mark-all-seen"
                  >
                    <Check className="w-3 h-3" />
                    Mark all as seen
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <CreateAlertSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
