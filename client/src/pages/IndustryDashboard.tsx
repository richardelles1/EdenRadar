import { useState, useEffect, useMemo } from "react";
import { OrientationHint } from "@/components/OrientationHint";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import {
  Search,
  Building2,
  Layers,
  ArrowRight,
  Package,
  FlaskConical,
  Sparkles,
  Plus,
  BarChart3,
  BookOpen,
  Bell,
  Settings,
  Newspaper,
  Globe,
  Compass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getIndustryProfile } from "@/hooks/use-industry";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "edenLastSeenAlerts";

type PortfolioStats = {
  total: number;
  byModality: { modality: string; count: number }[];
  byStage: { stage: string; count: number }[];
  byTherapyArea: { area: string; count: number }[];
  topInstitutions: { institution: string; count: number }[];
  lastFetched: number;
};

type DashboardData = {
  stats: PortfolioStats;
  recentSearches: Array<{ id: number; query: string; resultCount: number; searchedAt: string }>;
  recentAssets: Array<{ id: number; assetName: string; institution: string; modality: string; indication: string; categories: string[] | null; firstSeenAt: string }>;
  therapyAreaCount: number;
  institutionCount: number;
  assetsInReview: number;
  weeklyNew: number;
};

type PipelineSummaryData = {
  lists: Array<{ id: number; name: string; assetCount: number }>;
  totalPipelines: number;
  totalSavedAssets: number;
  institutionCount: number;
};

type NewArrivalsAsset = {
  id: number;
  assetName: string;
  institution: string;
  modality: string | null;
  indication: string | null;
  completenessScore: number | null;
  firstSeenAt: string;
};

type NewArrivalsResponse = {
  assets: NewArrivalsAsset[];
  institutions: { institution: string; count: number }[];
  total: number;
  window: string;
};

type BrowseAsset = {
  id: number;
  assetName: string;
  institution: string;
  modality: string | null;
  indication: string | null;
  developmentStage: string | null;
  categories: string[] | null;
  completenessScore: number | null;
  firstSeenAt: string;
};

type SavedAssetRow = {
  id: number;
  assetName: string;
  pipelineListId: number | null;
  status: string | null;
  savedAt: string;
};

type AlertDeltaResponse = {
  newAssets: { total: number; byInstitution: Array<{ institution: string; count: number }> };
  windowHours: number;
  since?: string;
};

const STATUS_CYCLE: Array<string | null> = [null, "viewing", "evaluating", "contacted"];

const STATUS_LABELS: Record<string, string> = {
  viewing: "Viewing",
  evaluating: "Evaluating",
  contacted: "Contacted",
};

const STATUS_COLORS: Record<string, string> = {
  viewing: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  evaluating: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  contacted: "bg-green-500/10 text-green-600 border-green-500/20",
};

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(ms / 3600000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(ms / 86400000);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function stripEmDashes(str: string): string {
  return str.replace(/\u2014|\u2013/g, "-").replace(/\s+-\s+/g, " - ");
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  iconColor = "text-primary",
  bgColor = "bg-primary/10",
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  iconColor?: string;
  bgColor?: string;
  href?: string;
}) {
  const inner = (
    <div
      className={`rounded-xl border border-border bg-card p-4 flex items-start gap-3${href ? " hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer" : ""}`}
      data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${bgColor}`}>
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
        <p className="text-xl font-bold text-foreground tabular-nums leading-tight mt-0.5">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

function SectionHeader({
  title,
  icon: Icon,
  href,
  linkLabel,
  muted = false,
}: {
  title: string;
  icon: React.ElementType;
  href?: string;
  linkLabel?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${muted ? "text-muted-foreground/60" : "text-muted-foreground"}`} />
        <h2 className={`text-sm font-semibold ${muted ? "text-muted-foreground" : "text-foreground"}`}>{title}</h2>
      </div>
      {href && linkLabel && (
        <Link href={href}>
          <span className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors cursor-pointer">
            {linkLabel} <ArrowRight className="w-3 h-3" />
          </span>
        </Link>
      )}
    </div>
  );
}

function StatusBadge({ status, onCycle }: { status: string | null; onCycle: () => void }) {
  if (!status) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onCycle(); }}
        className="text-[9px] px-1.5 py-0.5 rounded-full border border-border/60 text-muted-foreground/50 hover:border-primary/30 hover:text-primary transition-colors"
        data-testid="status-badge-unset"
      >
        + status
      </button>
    );
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onCycle(); }}
      className={`text-[9px] px-1.5 py-0.5 rounded-full border capitalize font-medium ${STATUS_COLORS[status] ?? "bg-muted text-muted-foreground border-border"}`}
      data-testid={`status-badge-${status}`}
      title="Click to change status"
    >
      {STATUS_LABELS[status] ?? status}
    </button>
  );
}

export default function IndustryDashboard() {
  const [, navigate] = useLocation();
  const profile = getIndustryProfile();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [newAssetsWindow, setNewAssetsWindow] = useState<"7d" | "30d">("7d");

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard/stats"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: pipelineData, isLoading: pipelineLoading } = useQuery<PipelineSummaryData>({
    queryKey: ["/api/pipeline-lists/summary"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: institutionsData } = useQuery<{ institutions: { institution: string; count: number }[]; total: number }>({
    queryKey: ["/api/scout/institutions"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: recentSavedData, isLoading: recentSavedLoading } = useQuery<{ assets: SavedAssetRow[] }>({
    queryKey: ["/api/saved-assets"],
    staleTime: 2 * 60 * 1000,
  });

  const sinceParam = typeof window !== "undefined"
    ? (localStorage.getItem(STORAGE_KEY) ?? "")
    : "";
  const deltaUrl = sinceParam
    ? `/api/industry/alerts/delta?since=${encodeURIComponent(sinceParam)}`
    : "/api/industry/alerts/delta";

  const { data: deltaData, isLoading: deltaLoading } = useQuery<AlertDeltaResponse>({
    queryKey: [deltaUrl],
    staleTime: 5 * 60 * 1000,
  });

  const { data: newArrivalsData, isLoading: newArrivalsLoading } = useQuery<NewArrivalsResponse>({
    queryKey: [`/api/browse/new-arrivals?window=${newAssetsWindow}&limit=8`],
    staleTime: 5 * 60 * 1000,
  });

  const userInterests = profile.therapeuticAreas ?? [];

  const featuredInterest = useMemo(() => {
    if (userInterests.length === 0) return null;
    return userInterests[Math.floor(Math.random() * userInterests.length)];
  }, []); // intentionally empty: pick once per mount

  const exploreUrl = featuredInterest
    ? `/api/browse/assets?limit=8&sortBy=completeness&therapyArea=${encodeURIComponent(featuredInterest)}`
    : "/api/browse/assets?limit=8&sortBy=completeness";

  const { data: exploreData, isLoading: exploreLoading } = useQuery<{ assets: BrowseAsset[]; hasMore: boolean }>({
    queryKey: [exploreUrl],
    staleTime: 10 * 60 * 1000,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string | null }) => {
      await apiRequest("PATCH", `/api/saved-assets/${id}/status`, { status });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  function cycleStatus(asset: SavedAssetRow) {
    const idx = STATUS_CYCLE.indexOf(asset.status ?? null);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length] ?? null;
    statusMutation.mutate({ id: asset.id, status: next });
  }

  const stats = data?.stats;
  const therapyAreaCount = data?.therapyAreaCount ?? 0;
  const institutionCount = data?.institutionCount ?? institutionsData?.total ?? stats?.topInstitutions.length ?? 0;

  const categoryAreas = (stats?.byTherapyArea && stats.byTherapyArea.length > 0)
    ? stats.byTherapyArea
    : [];

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const firstName = profile.userName?.trim().split(/\s+/)[0] ?? "";

  const deltaTotal = deltaData?.newAssets.total ?? 0;

  const rawSubtitle = deltaTotal > 0
    ? `${deltaTotal.toLocaleString()} new asset${deltaTotal !== 1 ? "s" : ""} since your last visit`
    : (profile.companyName || "Your TTO asset intelligence dashboard");
  const dynamicSubtitle = stripEmDashes(rawSubtitle);

  const newArrivals = newArrivalsData?.assets ?? [];
  const exploreAssets = exploreData?.assets ?? [];
  const recentSaved = (recentSavedData?.assets ?? []).slice(0, 5) as SavedAssetRow[];

  return (
    <div className="min-h-full relative overflow-hidden">
      <style>{`
        @keyframes dash-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── SECTION 1: WELCOME ── */}
        <div
          className="rounded-xl border border-primary/15 p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25"
          style={{
            background: "color-mix(in srgb, hsl(var(--primary)) 3%, hsl(var(--background)))",
            animation: "dash-fade-up 400ms ease both",
          }}
          data-testid="dashboard-welcome"
        >
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground" data-testid="dashboard-greeting">
              {greeting}{firstName ? (
                <>{", "}<span className="gradient-text">{firstName}</span>!</>
              ) : "!"}
            </h1>
            <p className="text-sm text-muted-foreground" data-testid="dashboard-subtitle">
              {deltaLoading ? stripEmDashes(profile.companyName || "Your TTO asset intelligence dashboard") : dynamicSubtitle}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => navigate("/settings")}
              data-testid="button-dashboard-settings"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* ── SECTION 2: SIGNAL ROW ── */}
        <div
          className="rounded-xl border border-primary/15 p-5 space-y-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25"
          style={{
            background: "color-mix(in srgb, hsl(var(--primary)) 3%, hsl(var(--background)))",
            animation: "dash-fade-up 400ms ease 80ms both",
          }}
          data-testid="dashboard-signal-row"
        >
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

            {/* ── Left: New Assets (60%) ── */}
            <div className="lg:col-span-3 rounded-xl border border-border bg-card p-5 space-y-3" data-testid="dashboard-new-assets">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Newspaper className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">New Assets</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                    <button
                      onClick={() => setNewAssetsWindow("7d")}
                      className={`text-[10px] px-2 py-0.5 rounded-md transition-colors ${newAssetsWindow === "7d" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
                      data-testid="toggle-7d"
                    >
                      7d
                    </button>
                    <button
                      onClick={() => setNewAssetsWindow("30d")}
                      className={`text-[10px] px-2 py-0.5 rounded-md transition-colors ${newAssetsWindow === "30d" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
                      data-testid="toggle-30d"
                    >
                      30d
                    </button>
                  </div>
                  <Link href="/industry/new-arrivals">
                    <span className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors cursor-pointer">
                      See all new arrivals <ArrowRight className="w-3 h-3" />
                    </span>
                  </Link>
                </div>
              </div>

              <div className="space-y-1.5">
                {newArrivalsLoading ? (
                  [1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-11 rounded-lg" />)
                ) : newArrivals.length === 0 ? (
                  <div className="py-6 text-center space-y-2">
                    <p className="text-xs text-muted-foreground">No new assets in the last {newAssetsWindow === "7d" ? "7 days" : "30 days"}.</p>
                    <Link href="/industry/new-arrivals">
                      <span className="text-xs text-primary hover:underline cursor-pointer">View all arrivals</span>
                    </Link>
                  </div>
                ) : (
                  newArrivals.map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => navigate(`/asset/${asset.id}`)}
                      className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border/60 bg-background/50 hover:border-primary/30 hover:bg-primary/5 transition-all group"
                      data-testid={`dashboard-new-asset-${asset.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {asset.assetName}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{asset.institution}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {asset.modality && asset.modality !== "unknown" && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/15 capitalize hidden sm:inline-block">
                            {asset.modality}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                          {timeAgo(asset.firstSeenAt)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {!newArrivalsLoading && newArrivalsData && newArrivalsData.total > 8 && (
                <div className="pt-1 border-t border-border/50">
                  <Link href="/industry/new-arrivals">
                    <span className="text-[10px] text-primary hover:underline cursor-pointer">
                      See all new arrivals ({newArrivalsData.total})
                    </span>
                  </Link>
                </div>
              )}
            </div>

            {/* ── Right: Recommended for You (40%) ── */}
            <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 space-y-3" data-testid="dashboard-recommended">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Recommended</span>
                </div>
                {featuredInterest && (
                  <Link href={`/scout?q=${encodeURIComponent(featuredInterest)}`}>
                    <span className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors cursor-pointer">
                      Scout <ArrowRight className="w-3 h-3" />
                    </span>
                  </Link>
                )}
              </div>

              {featuredInterest ? (
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-primary/60" />
                  <span className="text-[10px] text-muted-foreground">
                    Featuring: <span className="text-primary font-medium capitalize">{featuredInterest}</span>
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">High-quality assets from the library</span>
                </div>
              )}

              <div className="space-y-1.5">
                {exploreLoading ? (
                  [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)
                ) : exploreAssets.length === 0 ? (
                  <div className="py-4 text-center space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {userInterests.length > 0 ? "No matching assets indexed yet." : "No assets indexed yet."}
                    </p>
                    {userInterests.length === 0 && (
                      <Link href="/industry/profile">
                        <span className="text-xs text-primary hover:underline cursor-pointer">Set your interests</span>
                      </Link>
                    )}
                  </div>
                ) : (
                  exploreAssets.map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => navigate(`/asset/${asset.id}`)}
                      className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border/60 bg-background/50 hover:border-primary/30 hover:bg-primary/5 transition-all group"
                      data-testid={`dashboard-explore-asset-${asset.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {asset.assetName}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{asset.institution}</p>
                      </div>
                      {asset.completenessScore !== null && asset.completenessScore > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20 tabular-nums shrink-0 hidden sm:inline-block">
                          {Math.round(asset.completenessScore * 100)}%
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>

              {userInterests.length === 0 && (
                <div className="pt-1 border-t border-border/50">
                  <Link href="/industry/profile">
                    <span className="text-[10px] text-primary hover:underline cursor-pointer">
                      Add interests to personalize
                    </span>
                  </Link>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ── SECTION 3: CONTINUE YOUR WORK ── */}
        <div
          className="rounded-xl border border-primary/15 p-5 space-y-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25"
          style={{
            background: "color-mix(in srgb, hsl(var(--primary)) 3%, hsl(var(--background)))",
            animation: "dash-fade-up 400ms ease 160ms both",
          }}
          data-testid="dashboard-continue"
        >
          <SectionHeader title="Continue Your Work" icon={Layers} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

            {/* Pipelines */}
            <div className="space-y-2" data-testid="pipeline-list-cards">
              <p className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground mb-2">Your Pipelines</p>
              {pipelineLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
                </div>
              ) : !pipelineData?.lists.length ? (
                <Link href="/assets">
                  <div className="flex items-center gap-2 px-3 py-3 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer group" data-testid="pipeline-create-cta">
                    <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <Plus className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">
                      Create your first pipeline
                    </span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground group-hover:text-primary ml-auto transition-colors" />
                  </div>
                </Link>
              ) : (
                <>
                  {pipelineData.lists.slice(0, 5).map((pl) => (
                    <Link key={pl.id} href="/assets">
                      <div
                        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border/60 bg-background/50 hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer group"
                        data-testid={`pipeline-card-${pl.id}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
                            <BookOpen className="w-3 h-3 text-primary" />
                          </div>
                          <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                            {pl.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                          {pl.assetCount} asset{pl.assetCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </Link>
                  ))}
                  {pipelineData.lists.length > 5 && (
                    <Link href="/assets">
                      <p className="text-[11px] text-primary hover:underline cursor-pointer text-center pt-0.5">
                        +{pipelineData.lists.length - 5} more pipelines
                      </p>
                    </Link>
                  )}
                </>
              )}
            </div>

            {/* Actions + Alerts */}
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground mb-2">Actions</p>

              {!deltaLoading && deltaTotal > 0 && (
                <Link href="/alerts">
                  <div
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-primary/20 bg-primary/5 hover:border-primary/35 hover:bg-primary/8 transition-all cursor-pointer group"
                    data-testid="dashboard-alerts-chip"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Bell className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                        {deltaTotal} new alert{deltaTotal !== 1 ? "s" : ""} to review
                      </span>
                    </div>
                    <ArrowRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                  </div>
                </Link>
              )}

              {!pipelineLoading && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col items-center justify-center gap-0.5 p-3 rounded-lg border border-border/60 bg-background/50 text-center" data-testid="pipeline-stat-saved">
                    <span className="text-[10px] text-muted-foreground">Saved Assets</span>
                    <span className="text-base font-bold text-foreground tabular-nums">{pipelineData?.totalSavedAssets ?? 0}</span>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-0.5 p-3 rounded-lg border border-border/60 bg-background/50 text-center" data-testid="pipeline-stat-institutions">
                    <span className="text-[10px] text-muted-foreground">Institutions</span>
                    <span className="text-base font-bold text-foreground tabular-nums">{pipelineData?.institutionCount ?? 0}</span>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-0.5 p-3 rounded-lg border border-border/60 bg-background/50 text-center" data-testid="pipeline-stat-pipelines">
                    <span className="text-[10px] text-muted-foreground">Pipelines</span>
                    <span className="text-base font-bold text-foreground tabular-nums">{pipelineData?.totalPipelines ?? pipelineData?.lists.length ?? 0}</span>
                  </div>
                </div>
              )}

              {pipelineData !== undefined && pipelineData.lists.length === 0 && (
                <OrientationHint
                  hintId="dashboard-continue"
                  title="Build your pipeline."
                  body="Save assets to pipelines as you discover them in Scout. Use Quick Print to generate a brief for any pipeline."
                  accent="emerald"
                />
              )}

              <Link href="/scout">
                <Button size="sm" className="w-full gap-2 mt-1" data-testid="button-start-discovery">
                  <Search className="w-3.5 h-3.5" />
                  Search Assets in Scout
                </Button>
              </Link>
            </div>
          </div>

          {/* Recently Saved Assets with Status */}
          {!recentSavedLoading && recentSaved.length > 0 && (
            <div className="pt-4 border-t border-border/50 space-y-2" data-testid="dashboard-recent-saved">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">Recently Saved</p>
                <Link href="/assets">
                  <span className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors cursor-pointer">
                    All assets <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              </div>
              <div className="space-y-1.5">
                {recentSaved.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background/50"
                    data-testid={`recent-saved-${asset.id}`}
                  >
                    <button
                      onClick={() => navigate(`/asset/${asset.id}`)}
                      className="min-w-0 flex-1 text-left group"
                    >
                      <p className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                        {asset.assetName}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">{timeAgo(asset.savedAt)}</p>
                    </button>
                    <StatusBadge status={asset.status ?? null} onCycle={() => cycleStatus(asset)} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION 4: NETWORK COVERAGE ── */}
        <div
          className="rounded-xl border border-primary/15 p-5 space-y-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25"
          style={{
            background: "color-mix(in srgb, hsl(var(--primary)) 3%, hsl(var(--background)))",
            animation: "dash-fade-up 400ms ease 240ms both",
          }}
          data-testid="dashboard-platform-snapshot"
        >
          <SectionHeader title="Network Coverage" icon={Globe} muted />

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="dashboard-kpi-row">
              <KpiCard
                icon={Package}
                label="TTO Assets"
                value={stats?.total ?? 0}
                sub="indexed across network"
                iconColor="text-primary"
                bgColor="bg-primary/10"
              />
              <KpiCard
                icon={Building2}
                label="Institutions"
                value={institutionCount}
                sub="universities and TTOs"
                iconColor="text-blue-500"
                bgColor="bg-blue-500/10"
                href="/institutions"
              />
              <KpiCard
                icon={FlaskConical}
                label="Therapy Areas"
                value={therapyAreaCount}
                sub="across taxonomy"
                iconColor="text-violet-500"
                bgColor="bg-violet-500/10"
              />
            </div>
          )}

          {categoryAreas.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5" data-testid="dashboard-therapy-areas">
              <SectionHeader title="Browse by Therapy Area" icon={BarChart3} href="/scout" linkLabel="All areas" />
              <div className="flex flex-wrap gap-1.5">
                {categoryAreas.slice(0, 12).map((a) => (
                  <button
                    key={a.area}
                    onClick={() => navigate(`/scout?q=${encodeURIComponent(a.area)}`)}
                    className="text-[10px] px-2.5 py-1 rounded-full border border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors capitalize"
                    data-testid={`dashboard-area-${a.area}`}
                  >
                    {a.area} <span className="text-muted-foreground/50">{a.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
