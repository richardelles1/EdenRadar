import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import {
  Search,
  Building2,
  Database,
  Flame,
  Bell,
  Layers,
  ArrowRight,
  Package,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getIndustryProfile } from "@/hooks/use-industry";

type PortfolioStats = {
  total: number;
  byModality: { modality: string; count: number }[];
  byTherapyArea: { area: string; count: number }[];
  topInstitutions: { institution: string; count: number }[];
  lastFetched: number;
};

type DashboardData = {
  stats: PortfolioStats;
  recentSearches: Array<{ id: number; query: string; resultCount: number; searchedAt: string }>;
  recentAssets: Array<{ id: number; assetName: string; institution: string; modality: string; indication: string; firstSeenAt: string }>;
  sourcesCount: number;
  assetsInReview: number;
};

type ConvergenceSignal = {
  therapyArea: string;
  targetOrMechanism: string;
  institutionCount: number;
  score: number;
  institutions: string[];
  assetCount: number;
};

type DeltaInstitution = {
  institution: string;
  count: number;
  sampleAssets: string[];
};

type AlertsData = {
  newAssets: { total: number; byInstitution: DeltaInstitution[] };
  newConcepts: { total: number; items: Array<{ id: number; title: string; therapeuticArea: string }> };
  newProjects: { total: number; items: Array<{ id: number; title: string; researchArea?: string }> };
  windowHours: number;
};

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
    <div className="rounded-xl border border-border bg-card p-5 flex items-start gap-4" data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${bgColor}`}>
        <Icon className={`w-4.5 h-4.5 ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
        <p className="text-2xl font-bold text-foreground tabular-nums leading-tight mt-0.5">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionHeader({ title, icon: Icon, href, linkLabel }: { title: string; icon: React.ElementType; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
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

  const { data: convergenceData } = useQuery<{ signals: ConvergenceSignal[] }>({
    queryKey: ["/api/taxonomy/convergence"],
    staleTime: 60000,
  });

  const { data: alertsData } = useQuery<AlertsData>({
    queryKey: ["/api/industry/alerts/delta"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: institutionsData } = useQuery<{ total: number }>({
    queryKey: ["/api/scout/institutions"],
    staleTime: 10 * 60 * 1000,
  });

  const stats = data?.stats;
  const hotSignals = (convergenceData?.signals ?? []).slice(0, 4);
  const recentAssets = data?.recentAssets ?? [];
  const sourcesCount = data?.sourcesCount ?? 0;
  const assetsInReview = data?.assetsInReview ?? 0;
  const institutionCount = institutionsData?.total ?? stats?.topInstitutions.length ?? 0;
  const totalAlerts =
    (alertsData?.newAssets.total ?? 0) +
    (alertsData?.newConcepts.total ?? 0) +
    (alertsData?.newProjects.total ?? 0);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground" data-testid="dashboard-greeting">
              {greeting}{profile.companyName ? `, ${profile.companyName}` : ""}
            </h1>
            <p className="text-sm text-muted-foreground">
              Your TTO asset intelligence dashboard
            </p>
          </div>
          <Button
            size="sm"
            className="gap-2 shrink-0"
            onClick={() => navigate("/scout")}
            data-testid="button-start-discovery"
          >
            <Search className="w-4 h-4" />
            Start Discovery
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="dashboard-kpi-row">
            <KpiCard
              icon={Package}
              label="TTO Assets"
              value={stats?.total ?? 0}
              sub="indexed &amp; relevant"
              iconColor="text-primary"
              bgColor="bg-primary/10"
            />
            <KpiCard
              icon={Building2}
              label="Institutions"
              value={institutionCount}
              sub="universities &amp; TTOs"
              iconColor="text-blue-500"
              bgColor="bg-blue-500/10"
            />
            <KpiCard
              icon={Database}
              label="Data Sources"
              value={sourcesCount}
              sub="active scrapers"
              iconColor="text-violet-500"
              bgColor="bg-violet-500/10"
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <div className="rounded-xl border border-border bg-card p-5" data-testid="dashboard-hot-areas">
            <SectionHeader title="Hot Convergence Areas" icon={Flame} href="/scout" linkLabel="Explore" />
            {hotSignals.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No convergence signals yet. Run taxonomy refresh in Admin.</p>
            ) : (
              <div className="space-y-2">
                {hotSignals.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => navigate(`/scout?q=${encodeURIComponent(s.targetOrMechanism + " " + s.therapyArea)}`)}
                    className="w-full text-left p-2.5 rounded-lg hover:bg-muted/50 border border-border/60 hover:border-primary/20 transition-all group"
                    data-testid={`dashboard-hot-${i}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-foreground group-hover:text-primary transition-colors leading-snug">
                        {s.targetOrMechanism}
                      </p>
                      <span className="text-[10px] text-orange-500 font-semibold shrink-0">{s.score}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground capitalize mt-0.5">
                      {s.therapyArea} · {s.institutionCount} institutions · {s.assetCount} assets
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5" data-testid="dashboard-recent-alerts">
            <SectionHeader title="Recent Alerts" icon={Bell} href="/alerts" linkLabel="View all" />
            {!alertsData ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-md" />)}
              </div>
            ) : totalAlerts === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No new alerts in the last 48 hours.</p>
            ) : (() => {
                type AlertItem = { key: string; icon: React.ElementType; iconBg: string; iconColor: string; title: string; sub: string; href?: string };
                const items: AlertItem[] = [];
                for (const inst of alertsData.newAssets.byInstitution) {
                  items.push({
                    key: `asset-${inst.institution}`,
                    icon: Package,
                    iconBg: "bg-primary/10",
                    iconColor: "text-primary",
                    title: inst.institution,
                    sub: `+${inst.count} new TTO asset${inst.count !== 1 ? "s" : ""}`,
                  });
                }
                for (const c of alertsData.newConcepts.items) {
                  items.push({
                    key: `concept-${c.id}`,
                    icon: Flame,
                    iconBg: "bg-amber-500/10",
                    iconColor: "text-amber-500",
                    title: c.title,
                    sub: c.therapeuticArea ?? "New concept",
                    href: `/discovery/concept/${c.id}`,
                  });
                }
                for (const p of alertsData.newProjects.items) {
                  items.push({
                    key: `project-${p.id}`,
                    icon: Bell,
                    iconBg: "bg-violet-500/10",
                    iconColor: "text-violet-500",
                    title: (p as any).discoveryTitle ?? p.title,
                    sub: (p as any).researchArea ?? "New research project",
                    href: `/industry/projects`,
                  });
                }
                const shown = items.slice(0, 3);
                const remaining = totalAlerts - shown.length;
                return (
                  <div className="space-y-2">
                    {shown.map((item) => {
                      const Icon = item.icon;
                      const inner = (
                        <div
                          className={`flex items-start gap-2 p-2.5 rounded-lg border border-border/60 bg-background/50 ${item.href ? "hover:border-primary/20 cursor-pointer" : ""}`}
                          data-testid={`dashboard-alert-${item.key}`}
                        >
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${item.iconBg}`}>
                            <Icon className={`w-3 h-3 ${item.iconColor}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
                            <p className="text-[10px] text-muted-foreground">{item.sub}</p>
                          </div>
                        </div>
                      );
                      return item.href ? (
                        <Link key={item.key} href={item.href}>{inner}</Link>
                      ) : (
                        <div key={item.key}>{inner}</div>
                      );
                    })}
                    {remaining > 0 && (
                      <Link href="/alerts">
                        <p className="text-[11px] text-primary hover:underline cursor-pointer text-center pt-1">
                          +{remaining} more alerts →
                        </p>
                      </Link>
                    )}
                  </div>
                );
              })()}
          </div>

        </div>

        <div className="rounded-xl border border-border bg-card p-5" data-testid="dashboard-pipeline-summary">
          <SectionHeader title="Pipeline Summary" icon={Layers} href="/assets" linkLabel="Manage pipeline" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Recently Added</p>
              {isLoading ? (
                <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 rounded-md" />)}</div>
              ) : recentAssets.length === 0 ? (
                <p className="text-xs text-muted-foreground">No assets indexed yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {recentAssets.slice(0, 5).map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0"
                      data-testid={`pipeline-asset-${asset.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground leading-snug line-clamp-1">{asset.assetName}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{asset.institution}</p>
                      </div>
                      {asset.modality && asset.modality !== "unknown" && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0 capitalize">
                          {asset.modality}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Status</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-background/50" data-testid="pipeline-stat-total">
                  <span className="text-xs text-muted-foreground">Total indexed</span>
                  <span className="text-sm font-bold text-foreground tabular-nums">
                    {isLoading ? "—" : (stats?.total ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-background/50" data-testid="pipeline-stat-review">
                  <span className="text-xs text-muted-foreground">In review queue</span>
                  <span className={`text-sm font-bold tabular-nums ${assetsInReview > 0 ? "text-amber-500" : "text-foreground"}`}>
                    {isLoading ? "—" : assetsInReview}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-background/50" data-testid="pipeline-stat-sources">
                  <span className="text-xs text-muted-foreground">Active sources</span>
                  <span className="text-sm font-bold text-foreground tabular-nums">
                    {isLoading ? "—" : sourcesCount}
                  </span>
                </div>
                <Link href="/scout">
                  <Button size="sm" variant="outline" className="w-full mt-1 gap-2 text-xs" data-testid="pipeline-cta-scout">
                    <Search className="w-3.5 h-3.5" />
                    Search Assets in Scout
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {stats && stats.byTherapyArea.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5" data-testid="dashboard-therapy-areas">
            <SectionHeader title="Browse by Therapy Area" icon={Clock} href="/scout" linkLabel="All areas" />
            <div className="flex flex-wrap gap-1.5">
              {stats.byTherapyArea.slice(0, 12).map((a) => (
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
  );
}
