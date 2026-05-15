import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  BarChart2, Dna, Layers, TrendingUp, Building2, ArrowRight, Info,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type BiologyEntry = { biology: string; count: number };
type ModalityEntry = { modality: string; total: number; recent90d: number };
type WeekEntry = { week: string; count: number };
type VelocityEntry = { institution: string; count: number };
type WhitespaceMatrix = {
  biologies: string[];
  modalities: string[];
  cells: Record<string, number>;
};

type MarketIntelligenceData = {
  biologyLandscape: BiologyEntry[];
  whitespaceMatrix: WhitespaceMatrix;
  modalityMomentum: ModalityEntry[];
  weeklyTrend: WeekEntry[];
  institutionVelocity: VelocityEntry[];
};

const ACCENT = "hsl(142 71% 45%)";
const ACCENT_FAINT = "hsl(142 71% 45% / 0.08)";

function capitalize(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatWeek(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SectionPanel({
  icon: Icon,
  title,
  subtitle,
  children,
  delay = 0,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-5"
      style={{ animation: `dash-fade-up 400ms ease ${delay}ms both` }}
    >
      <div className="flex items-start gap-2 mb-4">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: "hsl(142 71% 45% / 0.12)" }}
        >
          <Icon className="w-4 h-4" style={{ color: ACCENT }} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground leading-tight">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <Info className="w-5 h-5 text-muted-foreground/40" />
      <p className="text-xs text-muted-foreground text-center max-w-xs">{message}</p>
    </div>
  );
}

function BiologyLandscapePanel({ data }: { data: BiologyEntry[] }) {
  if (!data.length) {
    return (
      <EmptyState message="Biology data is still being populated by the AI enrichment pipeline. Check back soon." />
    );
  }
  const max = data[0].count;
  return (
    <div className="space-y-1.5">
      {data.map((entry, i) => {
        const pct = max > 0 ? Math.round((entry.count / max) * 100) : 0;
        return (
          <div key={entry.biology} className="flex items-center gap-2.5 group" data-testid={`bio-row-${i}`}>
            <span className="text-[10px] text-muted-foreground tabular-nums w-4 shrink-0 text-right">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-foreground truncate font-medium">{capitalize(entry.biology)}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums ml-2 shrink-0">{entry.count.toLocaleString()}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: ACCENT, opacity: 0.6 + 0.4 * (pct / 100) }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WhitespacePanel({ matrix }: { matrix: WhitespaceMatrix }) {
  const { biologies, modalities, cells } = matrix;
  if (!biologies.length || !modalities.length) {
    return (
      <EmptyState message="Whitespace data requires biology and modality fields — more assets are being enriched now." />
    );
  }

  const allCounts = Object.values(cells);
  const maxCount = allCounts.length ? Math.max(...allCounts) : 1;

  function cellOpacity(count: number): number {
    if (count === 0) return 0;
    return 0.12 + 0.72 * Math.sqrt(count / maxCount);
  }

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="min-w-[480px]">
        <div
          className="grid gap-px"
          style={{ gridTemplateColumns: `120px repeat(${modalities.length}, 1fr)` }}
        >
          <div />
          {modalities.map((m) => (
            <div
              key={m}
              className="text-[9px] text-muted-foreground font-medium text-center pb-1.5 truncate px-0.5"
              title={capitalize(m)}
            >
              {capitalize(m).split(" ").slice(0, 2).join(" ")}
            </div>
          ))}

          {biologies.map((bio) => (
            <>
              <div
                key={`label-${bio}`}
                className="text-[10px] text-foreground font-medium truncate pr-2 flex items-center"
                title={capitalize(bio)}
              >
                {capitalize(bio)}
              </div>
              {modalities.map((mod) => {
                const count = cells[`${bio}|${mod}`] ?? 0;
                const opacity = cellOpacity(count);
                const isEmpty = count === 0;
                return (
                  <div
                    key={`${bio}|${mod}`}
                    className="h-7 rounded flex items-center justify-center text-[9px] font-bold transition-all"
                    style={{
                      background: isEmpty
                        ? "hsl(var(--muted) / 0.4)"
                        : `hsl(142 71% 45% / ${opacity})`,
                      color: isEmpty ? "hsl(var(--muted-foreground) / 0.3)" : opacity > 0.5 ? "hsl(142 71% 20%)" : "hsl(142 71% 35%)",
                      border: isEmpty ? "1px dashed hsl(var(--border))" : "1px solid transparent",
                    }}
                    title={`${capitalize(bio)} × ${capitalize(mod)}: ${count} asset${count !== 1 ? "s" : ""}`}
                    data-testid={`whitespace-cell-${bio.replace(/\s/g, "-")}-${mod.replace(/\s/g, "-")}`}
                  >
                    {count > 0 ? count : "—"}
                  </div>
                );
              })}
            </>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded border border-dashed border-border" />
            <span className="text-[9px] text-muted-foreground">Whitespace (0 assets)</span>
          </div>
          <div className="flex items-center gap-1 ml-3">
            <div className="w-3 h-3 rounded" style={{ background: "hsl(142 71% 45% / 0.7)" }} />
            <span className="text-[9px] text-muted-foreground">High density</span>
          </div>
          <span className="text-[9px] text-muted-foreground ml-auto italic">Click cell for count</span>
        </div>
      </div>
    </div>
  );
}

function ModalityMomentumPanel({ data }: { data: ModalityEntry[] }) {
  if (!data.length) {
    return <EmptyState message="No modality data yet." />;
  }
  const maxTotal = data[0].total;
  return (
    <div className="space-y-2">
      {data.map((entry) => {
        const pct = maxTotal > 0 ? Math.round((entry.total / maxTotal) * 100) : 0;
        const deltaColor = entry.recent90d > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground";
        return (
          <div key={entry.modality} className="flex items-center gap-2" data-testid={`modality-row-${entry.modality}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5 gap-1">
                <span className="text-xs text-foreground font-medium truncate">{capitalize(entry.modality)}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {entry.recent90d > 0 && (
                    <span
                      className={`text-[9px] font-bold px-1 py-0.5 rounded ${deltaColor}`}
                      style={{ background: "hsl(142 71% 45% / 0.10)" }}
                    >
                      +{entry.recent90d} (90d)
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground tabular-nums">{entry.total.toLocaleString()}</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: ACCENT, opacity: 0.55 }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeeklyVelocityPanel({ data }: { data: WeekEntry[] }) {
  if (!data.length) {
    return <EmptyState message="No weekly ingestion data yet." />;
  }
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const totalNew = data.reduce((s, d) => s + d.count, 0);
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-lg px-3 py-2 text-center" style={{ background: ACCENT_FAINT, border: "1px solid hsl(142 71% 45% / 0.15)" }}>
          <p className="text-lg font-black tabular-nums text-foreground">{totalNew.toLocaleString()}</p>
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Total (12 wks)</p>
        </div>
        <div className="rounded-lg px-3 py-2 text-center" style={{ background: ACCENT_FAINT, border: "1px solid hsl(142 71% 45% / 0.15)" }}>
          <p className="text-lg font-black tabular-nums text-foreground">{Math.round(totalNew / Math.max(data.length, 1)).toLocaleString()}</p>
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Avg / week</p>
        </div>
      </div>
      <div className="flex items-end gap-1 h-20" data-testid="weekly-velocity-chart">
        {data.map((entry) => {
          const heightPct = maxCount > 0 ? (entry.count / maxCount) * 100 : 0;
          const isRecent = data.indexOf(entry) >= data.length - 2;
          return (
            <div
              key={entry.week}
              className="flex-1 flex flex-col items-center gap-0.5 group"
              title={`${formatWeek(entry.week)}: ${entry.count.toLocaleString()} assets`}
            >
              <div className="w-full flex items-end justify-center" style={{ height: "64px" }}>
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${Math.max(4, heightPct)}%`,
                    background: isRecent ? ACCENT : "hsl(142 71% 45% / 0.45)",
                  }}
                />
              </div>
              <span className="text-[8px] text-muted-foreground/60 group-hover:text-muted-foreground transition-colors hidden sm:block truncate w-full text-center">
                {formatWeek(entry.week).split(" ")[0]}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-muted-foreground">{data.length > 0 ? formatWeek(data[0].week) : ""}</span>
        <span className="text-[9px] text-muted-foreground">{data.length > 0 ? formatWeek(data[data.length - 1].week) : ""}</span>
      </div>
    </div>
  );
}

function InstitutionVelocityPanel({ data }: { data: VelocityEntry[] }) {
  if (!data.length) {
    return <EmptyState message="No institution activity in the last 90 days." />;
  }
  const max = data[0].count;
  return (
    <div className="space-y-2">
      {data.map((entry, i) => {
        const pct = max > 0 ? Math.round((entry.count / max) * 100) : 0;
        return (
          <div key={entry.institution} className="group" data-testid={`institution-velocity-${i}`}>
            <div className="flex items-center justify-between mb-0.5 gap-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] text-muted-foreground tabular-nums w-4 shrink-0 text-right">{i + 1}</span>
                <Link href={`/institutions/${encodeURIComponent(entry.institution.toLowerCase().replace(/\s+/g, "-"))}`}>
                  <span className="text-xs text-foreground font-medium truncate hover:text-primary transition-colors cursor-pointer">
                    {entry.institution}
                  </span>
                </Link>
              </div>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                style={{ background: "hsl(142 71% 45% / 0.10)", color: "hsl(142 71% 32%)" }}
              >
                +{entry.count}
              </span>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden ml-5">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: ACCENT, opacity: 0.5 }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-[9px] text-muted-foreground mt-2 pt-2 border-t border-border/50">
        Assets added in the last 90 days per institution
      </p>
    </div>
  );
}

function SkeletonPanel() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="w-7 h-7 rounded-md" />
        <div className="space-y-1">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-2.5 w-48" />
        </div>
      </div>
      <div className="space-y-2 pt-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MarketIntelligence() {
  const { data, isLoading, isError } = useQuery<MarketIntelligenceData>({
    queryKey: ["/api/intelligence/market"],
    staleTime: 10 * 60 * 1000,
  });

  return (
    <div
      className="min-h-screen relative"
      style={{ background: "hsl(var(--background))" }}
      data-testid="market-intelligence-page"
    >
      <style>{`
        @keyframes dash-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div
          className="rounded-xl border border-primary/15 p-5"
          style={{
            background: "color-mix(in srgb, hsl(var(--primary)) 3%, hsl(var(--background)))",
            animation: "dash-fade-up 400ms ease both",
          }}
          data-testid="intelligence-header"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: "hsl(142 71% 45% / 0.12)" }}
                >
                  <BarChart2 className="w-4 h-4" style={{ color: ACCENT }} />
                </div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">Market Landscape</h1>
                <span
                  className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full hidden sm:inline"
                  style={{ background: "hsl(142 71% 45% / 0.12)", color: ACCENT }}
                >
                  Live
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Cross-portfolio signals across {data ? "the entire TTO corpus" : "23,000+ TTO assets"} — biology drivers, therapeutic whitespace, modality momentum, and institution velocity.
              </p>
            </div>
            <Link href="/scout">
              <button
                className="shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors mt-1"
                data-testid="button-intelligence-scout"
              >
                Scout <ArrowRight className="w-3 h-3" />
              </button>
            </Link>
          </div>
        </div>

        {isError && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5 text-center">
            <p className="text-sm text-destructive">Failed to load market intelligence. Please refresh the page.</p>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {[1, 2, 3, 4].map((i) => <SkeletonPanel key={i} />)}
          </div>
        ) : data && (
          <>
            {/* Row 1: Biology Landscape + Whitespace Matrix */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <SectionPanel
                icon={Dna}
                title="Biology Landscape"
                subtitle="Top biology drivers across the TTO corpus"
                delay={60}
              >
                <BiologyLandscapePanel data={data.biologyLandscape} />
              </SectionPanel>

              <SectionPanel
                icon={Layers}
                title="Therapeutic Whitespace"
                subtitle="Biology × modality density — darker = more assets, dashed = gap"
                delay={90}
              >
                <WhitespacePanel matrix={data.whitespaceMatrix} />
              </SectionPanel>
            </div>

            {/* Row 2: Modality Momentum + Weekly Velocity */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <SectionPanel
                icon={TrendingUp}
                title="Modality Momentum"
                subtitle="All assets by modality with 90-day new-asset delta"
                delay={120}
              >
                <ModalityMomentumPanel data={data.modalityMomentum} />
              </SectionPanel>

              <SectionPanel
                icon={BarChart2}
                title="Weekly Ingestion Velocity"
                subtitle="New TTO assets indexed per week (last 12 weeks)"
                delay={150}
              >
                <WeeklyVelocityPanel data={data.weeklyTrend} />
              </SectionPanel>
            </div>

            {/* Row 3: Institution Momentum (full width) */}
            <SectionPanel
              icon={Building2}
              title="Institution Momentum"
              subtitle="Top 10 institutions by new assets added in the last 90 days"
              delay={180}
            >
              <InstitutionVelocityPanel data={data.institutionVelocity} />
            </SectionPanel>
          </>
        )}

      </div>
    </div>
  );
}
