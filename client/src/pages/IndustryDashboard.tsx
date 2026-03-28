import { useState, useEffect } from "react";
import { OrientationHint } from "@/components/OrientationHint";
import { useQuery } from "@tanstack/react-query";
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
  Clock,
  Globe,
  Compass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getIndustryProfile } from "@/hooks/use-industry";
import { slugifyInstitutionName } from "@/lib/institutions";

const STORAGE_KEY = "edenLastSeenAlerts";
const TICKER_WINDOW = 4;
const TICKER_MS = 6000;
const TICKER_FADE_MS = 350;

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

interface DeltaInstitution {
  institution: string;
  count: number;
  sampleAssets: Array<{ id: number; name: string } | string>;
}

interface AlertDeltaResponse {
  newAssets: {
    total: number;
    byInstitution: DeltaInstitution[];
  };
  windowHours: number;
  since?: string;
}

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

function useWindowTicker<T>(items: T[], size = TICKER_WINDOW, ms = TICKER_MS) {
  const [page, setPage] = useState(0);
  const [faded, setFaded] = useState(false);
  const pages = Math.max(1, Math.ceil(items.length / size));

  useEffect(() => {
    setPage(0);
    setFaded(false);
  }, [items.length]);

  useEffect(() => {
    if (pages <= 1) return;
    let fadeTimeout: ReturnType<typeof setTimeout>;
    const timer = setInterval(() => {
      setFaded(true);
      fadeTimeout = setTimeout(() => {
        setPage((p) => (p + 1) % pages);
        setFaded(false);
      }, TICKER_FADE_MS);
    }, ms);
    return () => {
      clearInterval(timer);
      clearTimeout(fadeTimeout);
    };
  }, [pages, ms]);

  const slice = items.slice(page * size, (page + 1) * size);
  return { slice, faded, page, pages };
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  iconColor = "text-primary",
  bgColor = "bg-primary/10",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  iconColor?: string;
  bgColor?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3" data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}>
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

export default function IndustryDashboard() {
  const [, navigate] = useLocation();
  const profile = getIndustryProfile();

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

  const userInterests = profile.therapeuticAreas ?? [];
  const exploreUrl = userInterests.length > 0
    ? `/api/browse/assets?limit=16&${userInterests.map(a => `therapyAreas[]=${encodeURIComponent(a)}`).join("&")}`
    : "/api/browse/assets?limit=16";

  const { data: exploreData, isLoading: exploreLoading } = useQuery<{ assets: BrowseAsset[]; hasMore: boolean }>({
    queryKey: [exploreUrl],
    staleTime: 10 * 60 * 1000,
  });

  const stats = data?.stats;
  const therapyAreaCount = data?.therapyAreaCount ?? 0;
  const institutionCount = data?.institutionCount ?? institutionsData?.total ?? stats?.topInstitutions.length ?? 0;
  const weeklyNew = data?.weeklyNew ?? 0;
  const recentAssets = data?.recentAssets ?? [];
  const deltaTotal = deltaData?.newAssets.total ?? 0;
  const deltaInstitutions = deltaData?.newAssets.byInstitution ?? [];
  const exploreAssets = exploreData?.assets ?? [];

  const categoryAreas = (stats?.byTherapyArea && stats.byTherapyArea.length > 0)
    ? stats.byTherapyArea
    : (stats?.byModality ?? []).map((m) => ({ area: m.modality, count: m.count }));

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const firstName = profile.userName?.trim().split(/\s+/)[0] ?? "";

  const dynamicSubtitle = !deltaLoading && deltaTotal > 0
    ? `${deltaTotal.toLocaleString()} new asset${deltaTotal !== 1 ? "s" : ""} since your last visit`
    : (profile.companyName || "Your TTO asset intelligence dashboard");

  const matchedAssets = userInterests.length > 0
    ? recentAssets.filter((a) => {
        const ind = (a.indication ?? "").toLowerCase();
        const cats = Array.isArray(a.categories) ? a.categories.join(" ").toLowerCase() : "";
        return userInterests.some((interest) => {
          const lc = interest.toLowerCase();
          return ind.includes(lc) || cats.includes(lc);
        });
      })
    : [];

  const { slice: assetWindow, faded: assetsFaded } = useWindowTicker(recentAssets, TICKER_WINDOW, TICKER_MS);
  const { slice: instWindow, faded: instsFaded } = useWindowTicker(deltaInstitutions, TICKER_WINDOW, TICKER_MS);
  const { slice: exploreWindow, faded: exploreFaded } = useWindowTicker(exploreAssets, TICKER_WINDOW, TICKER_MS);

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
              {deltaLoading ? (profile.companyName || "Your TTO asset intelligence dashboard") : dynamicSubtitle}
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

        {/* ── SECTION 2: SINCE YOUR LAST VISIT ── */}
        <div
          className="rounded-xl border border-primary/15 p-5 space-y-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25"
          style={{
            background: "color-mix(in srgb, hsl(var(--primary)) 3%, hsl(var(--background)))",
            animation: "dash-fade-up 400ms ease 80ms both",
          }}
          data-testid="dashboard-since-last-visit"
        >
          <SectionHeader title="Since Your Last Visit" icon={Clock} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* ── New Assets panel ── */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3" data-testid="dashboard-recent-assets">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">New Assets</span>
                </div>
                <Link href="/scout">
                  <span className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors cursor-pointer">
                    Explore all <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              </div>

              <div
                className="space-y-1.5"
                style={{ opacity: assetsFaded ? 0 : 1, transition: `opacity ${TICKER_FADE_MS}ms ease` }}
              >
                {isLoading ? (
                  [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)
                ) : recentAssets.length === 0 ? (
                  <div className="py-6 text-center space-y-2">
                    <p className="text-xs text-muted-foreground">No assets indexed yet.</p>
                    <button onClick={() => navigate("/scout")} className="text-xs text-primary hover:underline">
                      Search in Scout
                    </button>
                  </div>
                ) : (
                  assetWindow.map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => navigate(`/asset/${asset.id}`)}
                      className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border/60 bg-background/50 hover:border-primary/30 hover:bg-primary/5 transition-all group"
                      data-testid={`dashboard-asset-${asset.id}`}
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

              {!isLoading && recentAssets.length > TICKER_WINDOW && (
                <div className="pt-1 border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground">
                    {recentAssets.length} recent assets — cycling every 6s
                  </span>
                </div>
              )}
            </div>

            {/* ── By Institution panel ── */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3" data-testid="dashboard-by-institution">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">By Institution</span>
                </div>
                <Link href="/alerts">
                  <span className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors cursor-pointer">
                    Alerts <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              </div>

              <div
                className="space-y-1.5"
                style={{ opacity: instsFaded ? 0 : 1, transition: `opacity ${TICKER_FADE_MS}ms ease` }}
              >
                {deltaLoading ? (
                  [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)
                ) : deltaInstitutions.length === 0 ? (
                  <div className="py-4 text-center space-y-2">
                    <p className="text-xs text-muted-foreground">No new institutional activity since your last visit.</p>
                    <Link href="/alerts">
                      <span className="text-xs text-primary hover:underline cursor-pointer">Set up alerts</span>
                    </Link>
                  </div>
                ) : (
                  instWindow.map((inst, i) => (
                    <button
                      key={`${inst.institution}-${i}`}
                      onClick={() => navigate(`/institutions/${slugifyInstitutionName(inst.institution)}`)}
                      className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border/60 bg-background/50 hover:border-primary/30 hover:bg-primary/5 transition-all group"
                      data-testid={`dashboard-inst-card-${i}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
                          <Building2 className="w-3 h-3 text-primary" />
                        </div>
                        <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {inst.institution}
                        </span>
                      </div>
                      <span className="text-[10px] text-primary font-semibold shrink-0 tabular-nums">
                        +{inst.count}
                      </span>
                    </button>
                  ))
                )}
              </div>

              {!deltaLoading && deltaInstitutions.length > TICKER_WINDOW && (
                <div className="pt-1 border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground">
                    {deltaInstitutions.length} active institutions — cycling
                  </span>
                </div>
              )}
            </div>

            {/* ── Explore for You panel ── */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3" data-testid="dashboard-explore-for-you">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Explore for You</span>
                </div>
                <Link href="/scout">
                  <span className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors cursor-pointer">
                    Scout <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              </div>

              {userInterests.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {userInterests.slice(0, 3).map((area) => (
                    <span key={area} className="text-[9px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/15 capitalize">
                      {area}
                    </span>
                  ))}
                  {userInterests.length > 3 && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border capitalize">
                      +{userInterests.length - 3}
                    </span>
                  )}
                </div>
              )}

              <div
                className="space-y-1.5"
                style={{ opacity: exploreFaded ? 0 : 1, transition: `opacity ${TICKER_FADE_MS}ms ease` }}
              >
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
                  exploreWindow.map((asset) => (
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
                      {asset.modality && asset.modality !== "unknown" && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/15 capitalize shrink-0 hidden sm:inline-block">
                          {asset.modality}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>

              {!exploreLoading && exploreAssets.length > TICKER_WINDOW && (
                <div className="pt-1 border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground">
                    {exploreAssets.length} assets — cycling every 6s
                  </span>
                </div>
              )}
            </div>

          </div>

          {/* Matched to Your Interests */}
          {userInterests.length === 0 ? (
            <div
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border/60 bg-card"
              data-testid="dashboard-interests-nudge"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Add therapeutic interest areas to see assets matched to your focus.
                </p>
              </div>
              <Link href="/industry/profile">
                <span className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer shrink-0">
                  Set interests <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            </div>
          ) : matchedAssets.length > 0 ? (
            <div
              className="rounded-xl border border-border bg-card p-5 space-y-3"
              data-testid="dashboard-matched-interests"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Matched to Your Interests</span>
                </div>
                <div className="flex items-center gap-2">
                  <Link href="/industry/profile">
                    <span className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors cursor-pointer ml-1">
                      Edit <ArrowRight className="w-3 h-3" />
                    </span>
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {matchedAssets.slice(0, 6).map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => navigate(`/asset/${asset.id}`)}
                    className="text-left flex flex-col gap-1 px-3 py-2.5 rounded-lg border border-border/60 bg-background/50 hover:border-primary/30 hover:bg-primary/5 transition-all group"
                    data-testid={`dashboard-matched-asset-${asset.id}`}
                  >
                    <p className="text-xs font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                      {asset.assetName}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">{asset.institution}</p>
                    {asset.indication && (
                      <span className="text-[9px] px-1 py-0.5 rounded-full bg-primary/10 text-primary capitalize w-fit">
                        {asset.indication}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
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

              {/* Delta alert chip */}
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

              {/* Pipeline stats — 3-box centered grid */}
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

              {weeklyNew > 0 && weeklyNew < (stats?.total ?? 1) * 0.8 && (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-primary/20 bg-primary/5" data-testid="pipeline-stat-weekly">
                  <span className="text-xs text-primary font-medium">New this week</span>
                  <span className="text-sm font-bold text-primary tabular-nums">+{weeklyNew}</span>
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
        </div>

        {/* ── SECTION 4: PLATFORM SNAPSHOT ── */}
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
                sub="universities & TTOs"
                iconColor="text-blue-500"
                bgColor="bg-blue-500/10"
              />
              <KpiCard
                icon={FlaskConical}
                label="Therapy Areas"
                value={therapyAreaCount > 0 ? therapyAreaCount : (categoryAreas.length || 0)}
                sub="indications covered"
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
                    onClick={() => navigate(`/scout?draft=${encodeURIComponent(a.area)}`)}
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
