import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search, TrendingUp, Building2, FlaskConical, Clock, ArrowRight, Flame, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getIndustryProfile } from "@/hooks/use-industry";

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
  recentAssets: Array<{ id: number; assetName: string; institution: string; modality: string; indication: string; firstSeenAt: string }>;
};

type ConvergenceSignal = {
  therapyArea: string;
  targetOrMechanism: string;
  institutionCount: number;
  score: number;
  institutions: string[];
  assetCount: number;
};

interface DeltaInstitution {
  institution: string;
  count: number;
  sampleAssets: string[];
}

interface AlertDeltaResponse {
  newAssets: {
    total: number;
    byInstitution: DeltaInstitution[];
  };
  windowHours: number;
  since?: string;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">{label}</p>
      <p className="text-3xl font-bold text-foreground tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function MiniBar({ label, count, max, color = "bg-primary" }: { label: string; count: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground capitalize w-28 truncate shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-10 text-right shrink-0">{count.toLocaleString()}</span>
    </div>
  );
}

function useRotatingTicker<T>(items: T[], intervalMs = 5000) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % items.length);
        setVisible(true);
      }, 250);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [items.length, intervalMs]);

  return { item: items[idx] ?? null, idx, visible };
}

function NewlyIndexedCard({
  assets,
  onViewAll,
}: {
  assets: Array<{ id: number; assetName: string; institution: string; modality: string; indication: string; firstSeenAt: string }>;
  onViewAll: () => void;
}) {
  const { item, idx, visible } = useRotatingTicker(assets, 5000);

  if (assets.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3 min-h-[200px] flex flex-col" data-testid="dashboard-recent-assets">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Newly Indexed</h2>
        </div>
        <button
          onClick={onViewAll}
          className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
        >
          View all <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center min-h-[100px]">
        {item ? (
          <div
            className="transition-opacity duration-200"
            style={{ opacity: visible ? 1 : 0 }}
            data-testid={`dashboard-asset-${item.id}`}
          >
            <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{item.assetName}</p>
            <p className="text-xs text-muted-foreground mt-1 truncate">{item.institution}</p>
            {item.modality && item.modality !== "unknown" && (
              <span className="inline-block mt-2 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 capitalize">
                {item.modality}
              </span>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-border/50">
        <span className="text-[10px] text-muted-foreground">
          {idx + 1} of {assets.length} new assets
        </span>
        <div className="flex gap-1">
          {assets.slice(0, Math.min(assets.length, 8)).map((_, i) => (
            <span
              key={i}
              className={`w-1 h-1 rounded-full transition-colors ${i === idx ? "bg-primary" : "bg-muted-foreground/30"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function NewAlertsCard({ onViewAll }: { onViewAll: () => void }) {
  const sinceParam = typeof window !== "undefined"
    ? (localStorage.getItem(STORAGE_KEY) ?? "")
    : "";

  const { data, isLoading } = useQuery<AlertDeltaResponse>({
    queryKey: ["/api/industry/alerts/delta", sinceParam],
    staleTime: 5 * 60 * 1000,
  });

  const institutions = data?.newAssets.byInstitution ?? [];
  const { item, idx, visible } = useRotatingTicker(institutions, 5000);
  const total = data?.newAssets.total ?? 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3 min-h-[200px] flex flex-col" data-testid="dashboard-new-alerts">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">New Alerts</h2>
        </div>
        <button
          onClick={onViewAll}
          className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
        >
          View all <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center min-h-[100px]">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ) : total === 0 ? (
          <p className="text-xs text-muted-foreground">No new activity since your last visit.</p>
        ) : item ? (
          <div
            className="transition-opacity duration-200"
            style={{ opacity: visible ? 1 : 0 }}
          >
            <div className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <p className="text-sm font-medium text-foreground truncate">{item.institution}</p>
            </div>
            <p className="text-xs text-primary font-semibold mt-1">+{item.count} new assets</p>
            {item.sampleAssets[0] && (
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{item.sampleAssets[0]}</p>
            )}
          </div>
        ) : null}
      </div>

      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <span className="text-[10px] text-muted-foreground">
            {institutions.length} institution{institutions.length !== 1 ? "s" : ""} with new activity
          </span>
          <div className="flex gap-1">
            {institutions.slice(0, Math.min(institutions.length, 8)).map((_, i) => (
              <span
                key={i}
                className={`w-1 h-1 rounded-full transition-colors ${i === idx ? "bg-primary" : "bg-muted-foreground/30"}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const profile = getIndustryProfile();

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard/stats"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: convergenceData } = useQuery<{ signals: ConvergenceSignal[] }>({
    queryKey: ["/api/taxonomy/convergence"],
    staleTime: 60000,
  });

  const stats = data?.stats;
  const recentSearches = data?.recentSearches ?? [];
  const recentAssets = data?.recentAssets ?? [];
  const hotSignals = (convergenceData?.signals ?? []).slice(0, 5);

  const uniqueInstitutions = stats?.topInstitutions.length ?? 0;
  const topModality = stats?.byModality[0];
  const topModalityMax = stats?.byModality[0]?.count ?? 1;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/scout?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  }

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">
            {greeting}{profile.companyName ? `, ${profile.companyName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            Your TTO asset intelligence dashboard
          </p>
        </div>

        <form onSubmit={handleSearch} className="relative" data-testid="dashboard-search-form">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search TTO assets across 138+ institutions..."
            className="w-full h-11 pl-10 pr-24 rounded-xl border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-all"
            data-testid="dashboard-search-input"
          />
          <Button
            type="submit"
            size="sm"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 px-3 text-xs"
            data-testid="dashboard-search-submit"
          >
            Search
          </Button>
        </form>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse h-24" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" data-testid="dashboard-stats-grid">
            <StatCard label="Assets Indexed" value={stats.total} sub="relevant TTO assets" />
            <StatCard label="Institutions" value={uniqueInstitutions} sub="top coverage" />
            <StatCard label="Therapy Areas" value={stats.byTherapyArea.filter((a) => a.count > 0).length} sub="covered" />
            <StatCard label="Top Modality" value={topModality?.modality ?? "—"} sub={topModality ? `${topModality.count.toLocaleString()} assets` : ""} />
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {stats && stats.byModality.length > 0 && (
            <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 space-y-4" data-testid="dashboard-modality-chart">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Assets by Modality</h2>
                </div>
              </div>
              <div className="space-y-2.5">
                {stats.byModality.slice(0, 8).map((m) => (
                  <MiniBar
                    key={m.modality}
                    label={m.modality}
                    count={m.count}
                    max={topModalityMax}
                    color="bg-primary"
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {hotSignals.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5 space-y-3" data-testid="dashboard-hot-areas">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <h2 className="text-sm font-semibold text-foreground">Converging Areas</h2>
                </div>
                <div className="space-y-2">
                  {hotSignals.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => navigate(`/scout?q=${encodeURIComponent(s.targetOrMechanism + " " + s.therapyArea)}`)}
                      className="w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors group"
                      data-testid={`dashboard-hot-${i}`}
                    >
                      <p className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                        {s.targetOrMechanism}
                      </p>
                      <p className="text-[10px] text-muted-foreground capitalize mt-0.5">
                        {s.therapyArea} · {s.institutionCount} institutions · {s.assetCount} assets
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {stats && stats.byTherapyArea.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5 space-y-3" data-testid="dashboard-therapy-areas">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Top Therapy Areas</h2>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {stats.byTherapyArea.slice(0, 10).map((a) => (
                    <button
                      key={a.area}
                      onClick={() => navigate(`/scout?q=${encodeURIComponent(a.area)}`)}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors capitalize"
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {recentAssets.length > 0 && (
            <NewlyIndexedCard
              assets={recentAssets}
              onViewAll={() => navigate("/scout")}
            />
          )}
          <NewAlertsCard onViewAll={() => navigate("/alerts")} />
        </div>

        {recentSearches.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-3" data-testid="dashboard-recent-searches">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Recent Searches</h2>
            </div>
            <div className="space-y-1.5">
              {recentSearches
                .filter((s) => s.query && s.query !== "scout_tto")
                .slice(0, 8)
                .map((s) => (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/scout?q=${encodeURIComponent(s.query)}`)}
                    className="w-full text-left flex items-center justify-between gap-3 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors group"
                    data-testid={`dashboard-search-${s.id}`}
                  >
                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors truncate">
                      {s.query}
                    </span>
                    {s.resultCount > 0 && (
                      <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                        {s.resultCount} results
                      </span>
                    )}
                  </button>
                ))}
            </div>
          </div>
        )}

        {stats && stats.topInstitutions.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-3" data-testid="dashboard-top-institutions">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Top Institutions by Asset Count</h2>
              </div>
              <button
                onClick={() => navigate("/institutions")}
                className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
              >
                All institutions <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {stats.topInstitutions.slice(0, 9).map((inst) => (
                <button
                  key={inst.institution}
                  onClick={() => navigate(`/scout?q=${encodeURIComponent(inst.institution)}`)}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left"
                  data-testid={`dashboard-inst-${inst.institution}`}
                >
                  <span className="text-xs text-foreground truncate">{inst.institution}</span>
                  <span className="text-xs tabular-nums text-muted-foreground shrink-0">{inst.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
