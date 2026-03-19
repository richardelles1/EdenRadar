import { useState, useEffect } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getIndustryProfile } from "@/hooks/use-industry";
import { INSTITUTIONS } from "@/lib/institutions";

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

function useRotatingTicker<T>(items: T[], intervalMs = 8000, fadeDurationMs = 600) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % items.length);
        setVisible(true);
      }, fadeDurationMs);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [items.length, intervalMs, fadeDurationMs]);

  return { item: items[idx] ?? null, idx, visible };
}

function slugifyInstitutionName(name: string): string {
  const found = INSTITUTIONS.find(
    (inst) => inst.name.toLowerCase() === name.toLowerCase()
  );
  if (found) return found.slug;
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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

function SectionHeader({
  title,
  icon: Icon,
  href,
  linkLabel,
}: {
  title: string;
  icon: React.ElementType;
  href?: string;
  linkLabel?: string;
}) {
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

function SegmentedTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden mb-4">
      {tabs.map((tab, i) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`px-3 py-1.5 text-[11px] font-semibold transition-colors ${
            i > 0 ? "border-l border-border" : ""
          } ${
            active === tab.key
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
          data-testid={`tab-${tab.key}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function RotatingInstitutionCards({
  institutions,
  onNavigate,
}: {
  institutions: { institution: string; count: number }[];
  onNavigate: (slug: string) => void;
}) {
  const [windowStart, setWindowStart] = useState(0);
  const [visible, setVisible] = useState(true);

  const WINDOW = 3;
  const total = institutions.length;

  useEffect(() => {
    if (total <= WINDOW) return;
    const iv = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setWindowStart((prev) => (prev + WINDOW) % total);
        setVisible(true);
      }, 700);
    }, 8000);
    return () => clearInterval(iv);
  }, [total]);

  const shown = institutions.slice(windowStart, windowStart + WINDOW);
  if (shown.length < WINDOW && total > WINDOW) {
    shown.push(...institutions.slice(0, WINDOW - shown.length));
  }

  return (
    <div
      className="space-y-2"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 0.7s ease",
      }}
    >
      {shown.map((inst, i) => (
        <button
          key={`${inst.institution}-${windowStart}-${i}`}
          onClick={() => onNavigate(slugifyInstitutionName(inst.institution))}
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
          <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
            {inst.count.toLocaleString()} assets
          </span>
        </button>
      ))}
      {total > WINDOW && (
        <p className="text-[10px] text-muted-foreground/60 text-center pt-0.5">
          {total} institutions with new assets this week
        </p>
      )}
    </div>
  );
}

function CategoryRows({
  areas,
  label,
  onDraft,
}: {
  areas: { area: string; count: number }[];
  label?: string;
  onDraft: (q: string) => void;
}) {
  if (areas.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        No category data yet. Start Discovery to index assets.
      </p>
    );
  }

  const maxCount = areas[0]?.count || 1;

  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide font-medium mb-2">{label}</p>
      )}
      {areas.slice(0, 6).map((area) => (
        <button
          key={area.area}
          onClick={() => onDraft(area.area)}
          className="w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 hover:border-primary/20 border border-border/40 transition-all group"
          data-testid={`dashboard-category-${area.area}`}
        >
          <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors capitalize truncate">
            {area.area}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-1 w-16 rounded-full bg-border overflow-hidden">
              <div
                className="h-full bg-primary/60 rounded-full"
                style={{
                  width: `${Math.min(100, Math.round((area.count / maxCount) * 100))}%`,
                }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">{area.count.toLocaleString()}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function NewlyIndexedCard({
  assets,
  onViewAll,
}: {
  assets: Array<{ id: number; assetName: string; institution: string; modality: string; indication: string; firstSeenAt: string }>;
  onViewAll: () => void;
}) {
  const { item, idx, visible } = useRotatingTicker(assets, 8000, 600);

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
        {assets.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">No new assets indexed yet.</p>
            <button onClick={onViewAll} className="text-xs text-primary hover:underline">
              Search in Scout →
            </button>
          </div>
        ) : item ? (
          <div
            style={{ opacity: visible ? 1 : 0, transition: "opacity 600ms ease" }}
            data-testid={`dashboard-asset-${item.id}`}
          >
            <p className="text-sm font-medium text-foreground leading-snug line-clamp-1">{item.assetName}</p>
            <p className="text-xs text-muted-foreground mt-1 truncate">{item.institution}</p>
            {item.modality && item.modality !== "unknown" && (
              <span className="inline-block mt-2 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 capitalize">
                {item.modality}
              </span>
            )}
          </div>
        ) : null}
      </div>

      {assets.length > 0 && (
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
      )}
    </div>
  );
}

function NewAlertsCard({ onViewAll }: { onViewAll: () => void }) {
  const sinceParam = typeof window !== "undefined"
    ? (localStorage.getItem(STORAGE_KEY) ?? "")
    : "";

  const deltaUrl = sinceParam
    ? `/api/industry/alerts/delta?since=${encodeURIComponent(sinceParam)}`
    : "/api/industry/alerts/delta";

  const { data, isLoading } = useQuery<AlertDeltaResponse>({
    queryKey: [deltaUrl],
    staleTime: 5 * 60 * 1000,
  });

  const institutions = data?.newAssets.byInstitution ?? [];
  const { item, idx, visible } = useRotatingTicker(institutions, 8000, 600);
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
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">No new activity since your last visit.</p>
            <Link href="/alerts">
              <span className="text-xs text-primary hover:underline cursor-pointer">Set up alerts →</span>
            </Link>
          </div>
        ) : item ? (
          <div
            style={{ opacity: visible ? 1 : 0, transition: "opacity 600ms ease" }}
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
            {idx + 1} of {institutions.length} institution{institutions.length !== 1 ? "s" : ""} with new activity
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

const PARTICLES = [
  { top: "8%",  left: "5%",  size: 8,  dur: 28, delay: 0   },
  { top: "15%", left: "88%", size: 5,  dur: 34, delay: 3   },
  { top: "22%", left: "42%", size: 10, dur: 22, delay: 7   },
  { top: "35%", left: "72%", size: 6,  dur: 38, delay: 1   },
  { top: "48%", left: "12%", size: 7,  dur: 26, delay: 5   },
  { top: "55%", left: "60%", size: 4,  dur: 32, delay: 9   },
  { top: "62%", left: "28%", size: 9,  dur: 30, delay: 2   },
  { top: "70%", left: "80%", size: 5,  dur: 40, delay: 6   },
  { top: "78%", left: "50%", size: 12, dur: 24, delay: 4   },
  { top: "85%", left: "18%", size: 6,  dur: 36, delay: 8   },
  { top: "90%", left: "90%", size: 8,  dur: 29, delay: 11  },
  { top: "5%",  left: "65%", size: 5,  dur: 33, delay: 13  },
  { top: "30%", left: "95%", size: 7,  dur: 27, delay: 15  },
  { top: "42%", left: "35%", size: 4,  dur: 37, delay: 10  },
  { top: "58%", left: "7%",  size: 6,  dur: 23, delay: 12  },
  { top: "73%", left: "55%", size: 11, dur: 31, delay: 16  },
  { top: "18%", left: "22%", size: 5,  dur: 35, delay: 14  },
  { top: "92%", left: "40%", size: 7,  dur: 25, delay: 17  },
];

export default function IndustryDashboard() {
  const [, navigate] = useLocation();
  const profile = getIndustryProfile();
  const [activeTab, setActiveTab] = useState<"institution" | "category">("institution");

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

  const stats = data?.stats;
  const therapyAreaCount = data?.therapyAreaCount ?? 0;
  const institutionCount = data?.institutionCount ?? institutionsData?.total ?? stats?.topInstitutions.length ?? 0;
  const weeklyNew = data?.weeklyNew ?? 0;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const firstName = profile.userName?.trim().split(/\s+/)[0] ?? "";
  const greetingLine = firstName
    ? `${greeting}, ${firstName}!`
    : `${greeting}!`;
  const subtitleLine = profile.companyName || "Your TTO asset intelligence dashboard";

  const topInstitutions = stats?.topInstitutions ?? institutionsData?.institutions ?? [];
  const categoryAreas = (stats?.byTherapyArea && stats.byTherapyArea.length > 0)
    ? stats.byTherapyArea
    : (stats?.byModality ?? []).map((m) => ({ area: m.modality, count: m.count }));
  const categoryLabel = (stats?.byTherapyArea && stats.byTherapyArea.length > 0) ? undefined : "By Modality";

  const recentAssets = data?.recentAssets ?? [];

  return (
    <div className="min-h-full bg-background relative overflow-hidden">
      <style>{`
        @keyframes dash-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes particle-float {
          0%   { transform: translateY(0px) translateX(0px); opacity: var(--p-op-start); }
          33%  { transform: translateY(-18px) translateX(8px); }
          66%  { transform: translateY(-8px) translateX(-6px); }
          100% { transform: translateY(0px) translateX(0px); opacity: var(--p-op-start); }
        }
      `}</style>

      {/* Green dot particle background */}
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            position: "absolute",
            top: p.top,
            left: p.left,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: "hsl(var(--primary))",
            opacity: 0.08 + (i % 5) * 0.015,
            animation: `particle-float ${p.dur}s ease-in-out ${p.delay}s infinite`,
            zIndex: 0,
            pointerEvents: "none",
          }}
        />
      ))}

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Header */}
        <div
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
          style={{ animation: "dash-fade-up 400ms ease both" }}
        >
          <div className="space-y-0.5">
            <h1 className="text-2xl font-bold text-foreground" data-testid="dashboard-greeting">
              {greetingLine}
            </h1>
            <p className="text-sm text-muted-foreground">
              {subtitleLine}
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

        {/* KPI row */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : (
          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
            data-testid="dashboard-kpi-row"
            style={{ animation: "dash-fade-up 400ms ease 80ms both" }}
          >
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

        {/* New by Institution / New by Category two-tab panel */}
        <div
          className="rounded-xl border border-border bg-card p-5"
          data-testid="dashboard-new-assets-panel"
          style={{ animation: "dash-fade-up 400ms ease 140ms both" }}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">New Assets</h2>
            </div>
            <Link href="/scout">
              <span className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors cursor-pointer">
                Explore <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          </div>

          <SegmentedTabs
            tabs={[
              { key: "institution", label: "By Institution" },
              { key: "category", label: "By Therapy Area" },
            ]}
            active={activeTab}
            onChange={(k) => setActiveTab(k as "institution" | "category")}
          />

          {activeTab === "institution" ? (
            topInstitutions.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No institution data yet. Run a scraper from Admin to index assets.
              </p>
            ) : (
              <RotatingInstitutionCards
                institutions={topInstitutions}
                onNavigate={(slug) => navigate(`/institutions/${slug}`)}
              />
            )
          ) : (
            <CategoryRows
              areas={categoryAreas}
              label={categoryLabel}
              onDraft={(q) => navigate(`/scout?draft=${encodeURIComponent(q)}`)}
            />
          )}
        </div>

        {/* Pipeline Summary */}
        <div
          className="rounded-xl border border-border bg-card p-5"
          data-testid="dashboard-pipeline-summary"
          style={{ animation: "dash-fade-up 400ms ease 180ms both" }}
        >
          <SectionHeader title="Your Pipelines" icon={Layers} href="/assets" linkLabel="Manage pipelines" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Left: Pipeline list cards */}
            <div className="space-y-2" data-testid="pipeline-list-cards">
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
                      Create your first pipeline →
                    </span>
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
                        +{pipelineData.lists.length - 5} more pipelines →
                      </p>
                    </Link>
                  )}
                </>
              )}
            </div>

            {/* Right: Pipeline stats (no "Status" heading) */}
            <div className="space-y-2.5">
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-background/50" data-testid="pipeline-stat-pipelines">
                  <span className="text-xs text-muted-foreground">Total pipelines</span>
                  <span className="text-sm font-bold text-foreground tabular-nums">
                    {pipelineLoading ? "—" : (pipelineData?.totalPipelines ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-background/50" data-testid="pipeline-stat-saved">
                  <span className="text-xs text-muted-foreground">Assets in pipelines</span>
                  <span className="text-sm font-bold text-foreground tabular-nums">
                    {pipelineLoading ? "—" : (pipelineData?.totalSavedAssets ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-background/50" data-testid="pipeline-stat-institutions">
                  <span className="text-xs text-muted-foreground">Institutions covered</span>
                  <span className="text-sm font-bold text-foreground tabular-nums">
                    {pipelineLoading ? "—" : (pipelineData?.institutionCount ?? 0)}
                  </span>
                </div>
                {weeklyNew > 0 && weeklyNew < (stats?.total ?? 1) * 0.8 && (
                  <div className="flex items-center justify-between p-3 rounded-lg border border-primary/20 bg-primary/5" data-testid="pipeline-stat-weekly">
                    <span className="text-xs text-primary font-medium">New this week</span>
                    <span className="text-sm font-bold text-primary tabular-nums">+{weeklyNew}</span>
                  </div>
                )}
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

        {/* Newly Indexed + New Alerts rotating ticker row */}
        <div
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
          style={{ animation: "dash-fade-up 400ms ease 200ms both" }}
          data-testid="dashboard-ticker-row"
        >
          <NewlyIndexedCard
            assets={recentAssets}
            onViewAll={() => navigate("/scout")}
          />
          <NewAlertsCard onViewAll={() => navigate("/alerts")} />
        </div>

        {/* Browse by Therapy Area */}
        {categoryAreas.length > 0 && (
          <div
            className="rounded-xl border border-border bg-card p-5"
            data-testid="dashboard-therapy-areas"
            style={{ animation: "dash-fade-up 400ms ease 220ms both" }}
          >
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
  );
}
