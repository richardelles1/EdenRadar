import { useState, useEffect, useRef } from "react";
import { OrientationHint } from "@/components/OrientationHint";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import {
  Building2,
  Layers,
  ArrowRight,
  Package,
  FlaskConical,
  Plus,
  BookOpen,
  Bell,
  Settings,
  Newspaper,
  Globe,
  Compass,
  Radar,
  TrendingUp,
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
  ingestedAssetId: number | null;
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

function getDominantLabel(assets: BrowseAsset[]): string | null {
  const counts: Record<string, number> = {};
  for (const a of assets) {
    const label =
      (a.categories?.[0] ?? null) ||
      (a.modality && a.modality.toLowerCase() !== "unknown" ? a.modality : null);
    if (label) counts[label] = (counts[label] ?? 0) + 1;
  }
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
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

  const [showWelcome, setShowWelcome] = useState(true);
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const minTimePassedRef = useRef(false);
  const loadingDoneRef = useRef(false);
  const dismissCalledRef = useRef(false);

  const [exploreOffset, setExploreOffset] = useState(0);
  const [exploreFade, setExploreFade] = useState(true);
  const [newAssetsPage, setNewAssetsPage] = useState(0);
  const [newAssetsFade, setNewAssetsFade] = useState(true);

  const sharedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const swapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    queryKey: ["/api/browse/new-arrivals?window=7d&limit=12"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: exploreData, isLoading: exploreLoading } = useQuery<{ assets: BrowseAsset[]; hasMore: boolean }>({
    queryKey: ["/api/browse/assets?limit=24&sortBy=completeness"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: topAreasData, isLoading: topAreasLoading } = useQuery<{ areas: { name: string; count: number }[] }>({
    queryKey: ["/api/dashboard/top-therapy-areas?limit=6"],
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

  const EXPLORE_PAGE_SIZE = 6;

  const allNewArrivals = newArrivalsData?.assets ?? [];
  const totalNewAssetsPages = Math.max(1, Math.ceil(allNewArrivals.length / EXPLORE_PAGE_SIZE));
  const visibleNewArrivals = allNewArrivals.slice(
    newAssetsPage * EXPLORE_PAGE_SIZE,
    (newAssetsPage + 1) * EXPLORE_PAGE_SIZE
  );

  const allExploreAssets = exploreData?.assets ?? [];
  const visibleExploreAssets = allExploreAssets.length > 0
    ? Array.from(
        { length: Math.min(EXPLORE_PAGE_SIZE, allExploreAssets.length) },
        (_, i) => allExploreAssets[(exploreOffset + i) % allExploreAssets.length]
      )
    : [];

  const exploreCategory = getDominantLabel(visibleExploreAssets);

  const newestFirstSeenAt = allNewArrivals[0]?.firstSeenAt ?? null;
  const freshnessText = newestFirstSeenAt ? timeAgo(newestFirstSeenAt) : null;

  function triggerWelcomeDismiss() {
    if (dismissCalledRef.current) return;
    dismissCalledRef.current = true;
    setWelcomeVisible(false);
    setTimeout(() => setShowWelcome(false), 800);
  }

  useEffect(() => {
    const minTimer = setTimeout(() => {
      minTimePassedRef.current = true;
      if (loadingDoneRef.current) triggerWelcomeDismiss();
    }, 900);
    return () => clearTimeout(minTimer);
  }, []);

  useEffect(() => {
    if (!isLoading) {
      loadingDoneRef.current = true;
      if (minTimePassedRef.current) triggerWelcomeDismiss();
    }
  }, [isLoading]);

  useEffect(() => {
    const hasEnoughNew = allNewArrivals.length > EXPLORE_PAGE_SIZE;
    const hasEnoughExplore = allExploreAssets.length > EXPLORE_PAGE_SIZE;
    if (!hasEnoughNew && !hasEnoughExplore) return;

    sharedTimerRef.current = setInterval(() => {
      setExploreFade(false);
      setNewAssetsFade(false);
      swapTimerRef.current = setTimeout(() => {
        if (hasEnoughExplore) {
          setExploreOffset(Math.floor(Math.random() * allExploreAssets.length));
        }
        if (hasEnoughNew) {
          setNewAssetsPage((p) => (p + 1) % totalNewAssetsPages);
        }
        setExploreFade(true);
        setNewAssetsFade(true);
      }, 700);
    }, 6000);

    return () => {
      if (sharedTimerRef.current) clearInterval(sharedTimerRef.current);
      if (swapTimerRef.current) clearTimeout(swapTimerRef.current);
    };
  }, [allNewArrivals.length, allExploreAssets.length, totalNewAssetsPages]);

  const stats = data?.stats;
  const institutionCount = data?.institutionCount ?? institutionsData?.total ?? stats?.topInstitutions.length ?? 0;
  const weeklyNew = data?.weeklyNew ?? 0;
  const topAreas = topAreasData?.areas ?? [];

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

  const recentSaved = (recentSavedData?.assets ?? []).slice(0, 5) as SavedAssetRow[];

  return (
    <div className="min-h-full relative overflow-hidden">
      <style>{`
        @keyframes dash-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── WELCOME ANIMATION OVERLAY ── */}
      {showWelcome && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 pointer-events-none"
          style={{
            opacity: welcomeVisible ? 1 : 0,
            transition: "opacity 700ms ease-in-out",
            background: "color-mix(in srgb, hsl(var(--background)) 97%, hsl(var(--primary)))",
          }}
          data-testid="dashboard-welcome-overlay"
        >
          <div
            className="flex flex-col items-center gap-4"
            style={{ animation: "dash-fade-up 0.4s ease-out both" }}
          >
            <div className="w-14 h-14 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg">
              <Radar className="w-7 h-7 text-white" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-xl font-bold text-foreground tracking-tight">
                Eden<span className="text-emerald-500">Radar</span>
              </p>
              <p className="text-sm text-muted-foreground">Preparing your intelligence...</p>
            </div>
          </div>
        </div>
      )}

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
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">

            {/* ── Left: New Assets (60%) ── */}
            <div className="lg:col-span-3 rounded-xl border border-border bg-card p-5 flex flex-col gap-3" data-testid="dashboard-new-assets">
              {/* Header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Newspaper className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">New Assets</span>
                  {freshnessText && (
                    <span className="text-[10px] text-muted-foreground/50 tabular-nums hidden sm:inline">
                      Updated {freshnessText}
                    </span>
                  )}
                </div>
                <Link href="/industry/new-arrivals">
                  <span className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap">
                    See all <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              </div>

              {/* Cycling list */}
              <div
                className="space-y-1.5 flex-1"
                style={{ opacity: newAssetsFade ? 1 : 0, transition: "opacity 700ms ease-in-out" }}
              >
                {newArrivalsLoading ? (
                  [1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)
                ) : visibleNewArrivals.length === 0 ? (
                  <div className="py-6 text-center space-y-2">
                    <p className="text-xs text-muted-foreground">No new assets in the last 7 days.</p>
                    <Link href="/industry/new-arrivals">
                      <span className="text-xs text-primary hover:underline cursor-pointer">View all arrivals</span>
                    </Link>
                  </div>
                ) : (
                  visibleNewArrivals.map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => navigate(`/asset/${asset.id}`)}
                      className="w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background/50 hover:border-primary/30 hover:bg-primary/5 transition-all group"
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

              {!newArrivalsLoading && newArrivalsData && newArrivalsData.total > 12 && (
                <div className="pt-1 border-t border-border/50">
                  <Link href="/industry/new-arrivals">
                    <span className="text-[10px] text-primary hover:underline cursor-pointer">
                      {newArrivalsData.total.toLocaleString()} total new arrivals
                    </span>
                  </Link>
                </div>
              )}
            </div>

            {/* ── Right: Explore (40%) ── */}
            <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 flex flex-col gap-3" data-testid="dashboard-explore">
              {/* Three-column header */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 shrink-0">
                  <Compass className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Explore</span>
                </div>
                <div className="flex-1 flex justify-center">
                  {exploreCategory && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary/70 border border-primary/15 capitalize font-medium">
                      {exploreCategory}
                    </span>
                  )}
                </div>
                <Link href="/scout">
                  <span className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors cursor-pointer shrink-0">
                    Scout <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              </div>

              {/* Cycling list */}
              <div
                className="space-y-1.5 flex-1"
                style={{ opacity: exploreFade ? 1 : 0, transition: "opacity 700ms ease-in-out" }}
              >
                {exploreLoading ? (
                  [1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)
                ) : visibleExploreAssets.length === 0 ? (
                  <div className="py-4 text-center">
                    <p className="text-xs text-muted-foreground">No assets indexed yet.</p>
                  </div>
                ) : (
                  visibleExploreAssets.map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => navigate(`/asset/${asset.id}`)}
                      className="w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border/60 bg-background/50 hover:border-primary/30 hover:bg-primary/5 transition-all group"
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
                          {Math.round(asset.completenessScore)}%
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
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
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-primary/20 bg-primary/5 hover:border-primary/35 hover:bg-primary/10 transition-all cursor-pointer group"
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
                      onClick={() => navigate(`/asset/${asset.ingestedAssetId ?? asset.id}`)}
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
                icon={TrendingUp}
                label="New This Week"
                value={weeklyNew}
                sub="assets added recently"
                iconColor="text-emerald-500"
                bgColor="bg-emerald-500/10"
                href="/industry/new-arrivals"
              />
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-5" data-testid="dashboard-therapy-areas">
            <SectionHeader title="Top Therapy Areas" icon={FlaskConical} href="/scout" linkLabel="Search all" />
            {topAreasLoading ? (
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-6 w-20 rounded-full" />)}
              </div>
            ) : topAreas.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60 italic">Categorization pending — enrich assets in Admin to populate.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {topAreas.map((a) => (
                  <button
                    key={a.name}
                    onClick={() => navigate(`/browse?therapyArea=${encodeURIComponent(a.name)}`)}
                    className="text-[10px] px-2.5 py-1 rounded-full border border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors capitalize"
                    data-testid={`dashboard-area-${a.name}`}
                  >
                    {a.name} <span className="text-muted-foreground/50 tabular-nums">{a.count.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
