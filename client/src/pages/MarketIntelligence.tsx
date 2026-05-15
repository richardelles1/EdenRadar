import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  BarChart2, Dna, Layers, TrendingUp, Building2, ArrowRight, Info, X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getAuthHeaders } from "@/lib/queryClient";

// ── Types ─────────────────────────────────────────────────────────────────────

type RangeOption = "30d" | "60d" | "90d" | "all";

const RANGE_OPTIONS: { value: RangeOption; short: string; label: string }[] = [
  { value: "30d", short: "30d", label: "last 30 days" },
  { value: "60d", short: "60d", label: "last 60 days" },
  { value: "90d", short: "90d", label: "last 90 days" },
  { value: "all", short: "all time", label: "all time" },
];

type BiologyEntry = { biology: string; count: number };
type ModalityEntry = { modality: string; total: number; recentDelta: number };
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
  totalAssetsIndexed: number;
};

type DrawerAsset = {
  id: number;
  title: string;
  institution: string;
  modality: string;
  biology: string;
  score: number | null;
};

type DrawerContext =
  | { type: "whitespace"; biology: string; modality: string; count: number; framing: string }
  | { type: "weekly"; after: string; before: string; weekLabel: string; count: number }
  | null;

type CellTooltip = { title: string; sub: string; x: number; y: number } | null;

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT = "hsl(142 71% 45%)";
const ACCENT_FAINT = "hsl(142 71% 45% / 0.08)";
const WHITESPACE_MAX_BIO = 8;
const WHITESPACE_MAX_MOD = 6;

// ── Helpers ───────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatWeek(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function weekBefore(isoWeekStart: string): string {
  const d = new Date(isoWeekStart);
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}

function opportunityLabel(count: number, maxCount: number): string {
  if (count === 0) return "No assets indexed in this intersection.";
  const ratio = count / Math.max(maxCount, 1);
  if (ratio < 0.15) return `${count.toLocaleString()} assets. Emerging space with limited competition.`;
  if (ratio < 0.40) return `${count.toLocaleString()} assets. Growing field with moderate coverage.`;
  return `${count.toLocaleString()} assets. Crowded field with high scientific activity.`;
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <Info className="w-5 h-5 text-muted-foreground/40" />
      <p className="text-xs text-muted-foreground text-center max-w-xs">{message}</p>
    </div>
  );
}

// ── SectionPanel ──────────────────────────────────────────────────────────────

function SectionPanel({
  icon: Icon,
  title,
  subtitle,
  children,
  delay = 0,
  className = "",
  headerRight,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  delay?: number;
  className?: string;
  headerRight?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-card p-5 flex flex-col ${className}`}
      style={{ animation: `dash-fade-up 400ms ease ${delay}ms both` }}
    >
      <div className="flex items-start gap-2 mb-4 shrink-0">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: "hsl(142 71% 45% / 0.12)" }}
        >
          <Icon className="w-4 h-4" style={{ color: ACCENT }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-foreground leading-tight">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{subtitle}</p>}
        </div>
        {headerRight && <div className="shrink-0 ml-2">{headerRight}</div>}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

// ── BiologyLandscapePanel ─────────────────────────────────────────────────────

function BiologyLandscapePanel({ data }: { data: BiologyEntry[] }) {
  if (!data.length) {
    return (
      <EmptyState message="Biology data is being populated by the AI enrichment pipeline." />
    );
  }
  const max = data[0].count;
  return (
    <div className="overflow-y-auto h-full space-y-2 pr-1">
      {data.map((entry, i) => {
        const pct = max > 0 ? Math.round((entry.count / max) * 100) : 0;
        return (
          <div
            key={entry.biology}
            className="flex items-center gap-2.5"
            style={{ minHeight: "36px" }}
            data-testid={`bio-row-${i}`}
          >
            <span className="text-[10px] text-muted-foreground tabular-nums w-4 shrink-0 text-right">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-foreground font-medium leading-tight">{capitalize(entry.biology)}</span>
                <span className="text-[11px] text-foreground tabular-nums ml-2 shrink-0 font-semibold">{entry.count.toLocaleString()}</span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, hsl(142 71% 40%), hsl(142 71% 52%))`,
                    opacity: 0.60 + 0.40 * (pct / 100),
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── ModalityMomentumPanel ─────────────────────────────────────────────────────

function ModalityMomentumPanel({ data, range }: { data: ModalityEntry[]; range: RangeOption }) {
  if (!data.length) {
    return <EmptyState message="No modality data available." />;
  }
  const maxTotal = data[0].total;
  return (
    <div className="overflow-y-auto h-full space-y-2.5 pr-0.5">
      {data.map((entry) => {
        const pct = maxTotal > 0 ? Math.round((entry.total / maxTotal) * 100) : 0;
        return (
          <div key={entry.modality} style={{ minHeight: "36px" }} data-testid={`modality-row-${entry.modality}`}>
            <div className="flex items-center justify-between mb-1 gap-1">
              <span className="text-xs text-foreground font-medium">{capitalize(entry.modality)}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {entry.recentDelta > 0 && (
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded text-emerald-600 dark:text-emerald-400"
                    style={{ background: "hsl(142 71% 45% / 0.10)" }}
                  >
                    +{entry.recentDelta.toLocaleString()} ({range === "all" ? "90d" : range})
                  </span>
                )}
                <span className="text-[11px] text-foreground tabular-nums font-semibold">{entry.total.toLocaleString()}</span>
              </div>
            </div>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, hsl(142 71% 40%), hsl(142 71% 52%))`,
                  opacity: 0.60,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── InstitutionVelocityPanel ──────────────────────────────────────────────────

function InstitutionVelocityPanel({ data, range }: { data: VelocityEntry[]; range: RangeOption }) {
  if (!data.length) {
    return <EmptyState message="No institution activity in the selected period." />;
  }
  const max = data[0].count;
  const rangeLabel = range === "all" ? "all time" : `last ${range.replace("d", "")} days`;
  return (
    <div className="overflow-y-auto h-full flex flex-col">
      <div className="space-y-2 pr-0.5 flex-1">
        {data.map((entry, i) => {
          const pct = max > 0 ? Math.round((entry.count / max) * 100) : 0;
          return (
            <div
              key={entry.institution}
              className="flex items-center gap-2"
              style={{ minHeight: "36px" }}
              data-testid={`institution-velocity-${i}`}
            >
              <span className="text-[10px] text-muted-foreground tabular-nums w-4 shrink-0 text-right">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <Link
                    href={`/institutions/${entry.institution.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`}
                    className="min-w-0 overflow-hidden"
                  >
                    <span className="text-xs text-foreground font-medium block truncate hover:text-primary transition-colors cursor-pointer">
                      {entry.institution}
                    </span>
                  </Link>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 tabular-nums"
                    style={{ background: "hsl(142 71% 45% / 0.10)", color: "hsl(142 71% 32%)" }}
                  >
                    +{entry.count.toLocaleString()}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, hsl(142 71% 40%), hsl(142 71% 52%))`,
                      opacity: 0.55,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-muted-foreground mt-3 pt-2 border-t border-border/50 shrink-0">
        Assets added in the {rangeLabel} per institution
      </p>
    </div>
  );
}

// ── WhitespacePanel ───────────────────────────────────────────────────────────

function WhitespacePanel({
  matrix,
  onCellClick,
}: {
  matrix: WhitespaceMatrix;
  onCellClick: (bio: string, mod: string, count: number, framing: string) => void;
}) {
  const rawBiologies = matrix.biologies.slice(0, WHITESPACE_MAX_BIO);
  const rawModalities = matrix.modalities.slice(0, WHITESPACE_MAX_MOD);
  const cells = matrix.cells;
  const [tooltip, setTooltip] = useState<CellTooltip>(null);

  if (!rawBiologies.length || !rawModalities.length) {
    return (
      <EmptyState message="Whitespace data requires biology and modality fields. More assets are being enriched now." />
    );
  }

  const allCounts = Object.values(cells);
  const maxCount = allCounts.length ? Math.max(...allCounts) : 1;

  function cellOpacity(count: number): number {
    if (count === 0) return 0;
    return 0.13 + 0.70 * Math.sqrt(count / maxCount);
  }

  return (
    <div className="flex flex-col h-full">
      {tooltip && (
        <div
          className="fixed z-[9999] bg-popover border border-border rounded-lg px-3 py-2 shadow-xl pointer-events-none text-center"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, -115%)",
            maxWidth: "260px",
          }}
        >
          <p className="text-[11px] font-semibold text-foreground leading-snug">{tooltip.title}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{tooltip.sub}</p>
        </div>
      )}

      <div
        className="grid gap-2 flex-1"
        style={{
          gridTemplateColumns: `minmax(170px, 200px) repeat(${rawModalities.length}, minmax(0, 1fr))`,
        }}
      >
        <div />
        {rawModalities.map((m) => (
          <div
            key={m}
            className="text-[10px] text-muted-foreground font-semibold text-center pb-2 leading-tight"
          >
            {capitalize(m)}
          </div>
        ))}

        {rawBiologies.map((bio) => (
          <Fragment key={bio}>
            <div className="text-[11px] text-foreground font-medium pr-3 flex items-center">
              {capitalize(bio)}
            </div>
            {rawModalities.map((mod) => {
              const count = cells[`${bio}|${mod}`] ?? 0;
              const op = cellOpacity(count);
              const isEmpty = count === 0;
              const framing = opportunityLabel(count, maxCount);
              return (
                <div
                  key={`${bio}|${mod}`}
                  className="h-12 rounded-[10px] flex items-center justify-center text-[11px] font-bold transition-all duration-150 select-none"
                  style={{
                    background: isEmpty
                      ? "hsl(var(--muted) / 0.28)"
                      : `linear-gradient(155deg, hsl(142 71% 54% / ${op}), hsl(142 71% 36% / ${Math.min(op + 0.12, 1)}))`,
                    color: isEmpty
                      ? "transparent"
                      : op > 0.55
                        ? "hsl(142 71% 14%)"
                        : "hsl(142 71% 28%)",
                    border: isEmpty
                      ? "1px dashed hsl(var(--border) / 0.5)"
                      : "1px solid hsl(142 71% 45% / 0.18)",
                    boxShadow: isEmpty ? "none" : `0 1px 4px hsl(142 71% 45% / ${op * 0.25})`,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltip({
                      title: `${capitalize(bio)} x ${capitalize(mod)}`,
                      sub: framing,
                      x: rect.left + rect.width / 2,
                      y: rect.top,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => {
                    setTooltip(null);
                    onCellClick(bio, mod, count, framing);
                  }}
                  data-testid={`whitespace-cell-${bio.replace(/\s/g, "-")}-${mod.replace(/\s/g, "-")}`}
                >
                  {count > 0 ? count.toLocaleString() : ""}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border/50 shrink-0">
        <div className="flex items-center gap-1.5">
          <div
            className="w-4 h-4 rounded-md"
            style={{
              border: "1px dashed hsl(var(--border) / 0.5)",
              background: "hsl(var(--muted) / 0.28)",
            }}
          />
          <span className="text-[10px] text-muted-foreground">Whitespace</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="w-4 h-4 rounded-md"
            style={{
              background: "linear-gradient(155deg, hsl(142 71% 54% / 0.85), hsl(142 71% 36% / 0.97))",
            }}
          />
          <span className="text-[10px] text-muted-foreground">High density</span>
        </div>
        <span className="text-[10px] text-muted-foreground ml-auto italic">
          Click a cell to explore those assets
        </span>
      </div>
    </div>
  );
}

// ── WeeklyVelocityPanel ───────────────────────────────────────────────────────

function WeeklyVelocityPanel({
  data,
  totalIndexed,
  onBarClick,
}: {
  data: WeekEntry[];
  totalIndexed: number;
  onBarClick: (after: string, before: string, weekLabel: string, count: number) => void;
}) {
  const [tooltip, setTooltip] = useState<CellTooltip>(null);

  if (!data.length) {
    return <EmptyState message="No weekly data available." />;
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const avgPerWeek = Math.round(data.reduce((s, d) => s + d.count, 0) / Math.max(data.length, 1));
  const BAR_H = 64;

  return (
    <div className="flex items-center gap-6 h-full">
      <div className="flex gap-3 shrink-0">
        <div
          className="rounded-lg px-4 py-3 text-center"
          style={{ background: ACCENT_FAINT, border: "1px solid hsl(142 71% 45% / 0.15)" }}
        >
          <p className="text-xl font-black tabular-nums text-foreground">{totalIndexed.toLocaleString()}</p>
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">Total indexed</p>
        </div>
        <div
          className="rounded-lg px-4 py-3 text-center"
          style={{ background: ACCENT_FAINT, border: "1px solid hsl(142 71% 45% / 0.15)" }}
        >
          <p className="text-xl font-black tabular-nums text-foreground">{avgPerWeek.toLocaleString()}</p>
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">Avg / week</p>
        </div>
      </div>

      {tooltip && (
        <div
          className="fixed z-[9999] bg-popover border border-border rounded-lg px-3 py-2 shadow-xl pointer-events-none text-center"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, -115%)",
            minWidth: "140px",
          }}
        >
          <p className="text-[11px] font-semibold text-foreground">{tooltip.title}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{tooltip.sub}</p>
        </div>
      )}

      <div className="flex-1 min-w-0" data-testid="weekly-velocity-chart">
        <div className="flex items-end gap-1.5" style={{ height: `${BAR_H}px` }}>
          {data.map((entry, i) => {
            const h = Math.max(4, Math.round((entry.count / maxCount) * BAR_H));
            const after = entry.week;
            const before = weekBefore(entry.week);
            const weekLabel = `Week of ${formatWeek(entry.week)}`;
            const opacity = 0.45 + 0.55 * (i / Math.max(data.length - 1, 1));
            return (
              <div
                key={entry.week}
                className="flex-1 min-w-0 rounded-t-md transition-all duration-150"
                style={{
                  height: `${h}px`,
                  background: `linear-gradient(to bottom, hsl(142 71% 52%), hsl(142 71% 36%))`,
                  opacity,
                  cursor: entry.count > 0 ? "pointer" : "default",
                }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    title: weekLabel,
                    sub: `${entry.count.toLocaleString()} assets added`,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => {
                  if (entry.count > 0) {
                    setTooltip(null);
                    onBarClick(after, before, weekLabel, entry.count);
                  }
                }}
                data-testid={`weekly-bar-${i}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[9px] text-muted-foreground">
            {data.length > 0 ? formatWeek(data[0].week) : ""}
          </span>
          <span className="text-[9px] text-muted-foreground">
            {data.length > 0 ? formatWeek(data[data.length - 1].week) : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── AssetDrawer ───────────────────────────────────────────────────────────────

function AssetDrawer({ ctx, onClose }: { ctx: DrawerContext; onClose: () => void }) {
  const queryParams =
    ctx?.type === "whitespace"
      ? `biology=${encodeURIComponent(ctx.biology)}&modality=${encodeURIComponent(ctx.modality)}`
      : ctx?.type === "weekly"
      ? `after=${ctx.after}&before=${ctx.before}`
      : "";

  const { data, isLoading } = useQuery<{ assets: DrawerAsset[] }>({
    queryKey: ["/api/intelligence/assets", queryParams],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/intelligence/assets?${queryParams}`, {
        credentials: "include",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to fetch assets");
      return res.json();
    },
    enabled: !!ctx && !!queryParams,
    staleTime: 5 * 60 * 1000,
  });

  if (!ctx) return null;

  const assets = data?.assets ?? [];

  const drawerTitle =
    ctx.type === "whitespace"
      ? `${capitalize(ctx.biology)} x ${capitalize(ctx.modality)}`
      : ctx.weekLabel;

  const drawerSub =
    ctx.type === "whitespace"
      ? ctx.framing
      : `${ctx.count.toLocaleString()} assets added during this period`;

  const scoutHref =
    ctx.type === "whitespace"
      ? `/scout?biology=${encodeURIComponent(ctx.biology)}&modality=${encodeURIComponent(ctx.modality)}`
      : `/scout?after=${ctx.after}&before=${ctx.before}`;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/25 z-40 backdrop-blur-[1px]"
        onClick={onClose}
        data-testid="drawer-backdrop"
      />
      <div
        className="fixed right-0 top-0 h-full w-[420px] max-w-full bg-card border-l border-border z-50 flex flex-col shadow-2xl"
        style={{ animation: "slide-in-right 220ms ease both" }}
        data-testid="asset-drawer"
      >
        <div className="flex items-start justify-between p-5 border-b border-border shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <h3 className="text-sm font-bold text-foreground leading-tight">{drawerTitle}</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">{drawerSub}</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
            data-testid="button-drawer-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="p-3 rounded-lg border border-border space-y-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
            ))
          ) : !assets.length ? (
            <EmptyState message="No assets found for this filter. Try exploring in Scout." />
          ) : (
            assets.map((asset) => (
              <div
                key={asset.id}
                className="p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-accent/20 transition-all"
                data-testid={`drawer-asset-${asset.id}`}
              >
                <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
                  {asset.title}
                </p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[10px] text-muted-foreground">{asset.institution}</span>
                  {asset.modality && asset.modality !== "unknown" && (
                    <span
                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ background: "hsl(142 71% 45% / 0.10)", color: "hsl(142 71% 32%)" }}
                    >
                      {capitalize(asset.modality)}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-border shrink-0">
          <Link href={scoutHref}>
            <button
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: "hsl(142 71% 45% / 0.12)", color: ACCENT }}
              data-testid="button-drawer-scout"
            >
              Explore all in Scout
              <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
        </div>
      </div>
    </>
  );
}

// ── SkeletonBlock ─────────────────────────────────────────────────────────────

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 space-y-3 ${className}`}>
      <div className="flex items-center gap-2">
        <Skeleton className="w-7 h-7 rounded-md shrink-0" />
        <div className="space-y-1 flex-1">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-2.5 w-48" />
        </div>
      </div>
      <div className="space-y-2.5 pt-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-2.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MarketIntelligence ────────────────────────────────────────────────────────

export default function MarketIntelligence() {
  const [range, setRange] = useState<RangeOption>("90d");
  const [drawerCtx, setDrawerCtx] = useState<DrawerContext>(null);

  const { data, isLoading, isError } = useQuery<MarketIntelligenceData>({
    queryKey: ["/api/intelligence/market", range],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/intelligence/market?range=${range}`, {
        credentials: "include",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const rangeOpt = RANGE_OPTIONS.find((o) => o.value === range)!;

  return (
    <div
      className="min-h-screen"
      style={{ background: "hsl(var(--background))" }}
      data-testid="market-intelligence-page"
    >
      <style>{`
        @keyframes dash-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>

      <AssetDrawer ctx={drawerCtx} onClose={() => setDrawerCtx(null)} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-5">

        {/* Page header */}
        <div
          className="rounded-xl border border-primary/15 p-5"
          style={{
            background: "color-mix(in srgb, hsl(var(--primary)) 3%, hsl(var(--background)))",
            animation: "dash-fade-up 400ms ease both",
          }}
          data-testid="intelligence-header"
        >
          <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: "hsl(142 71% 45% / 0.12)" }}
                >
                  <BarChart2 className="w-4 h-4" style={{ color: ACCENT }} />
                </div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">Market Landscape</h1>
                <span
                  className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                  style={{ background: "hsl(142 71% 45% / 0.12)", color: ACCENT }}
                >
                  Live
                </span>

                {/* Global range toggle */}
                <div
                  className="flex items-center gap-0.5 rounded-lg p-0.5"
                  style={{
                    background: "hsl(var(--muted) / 0.7)",
                    border: "1px solid hsl(var(--border) / 0.6)",
                  }}
                  data-testid="range-toggle-group"
                >
                  {RANGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setRange(opt.value)}
                      className="text-[10px] font-semibold px-2.5 py-1 rounded-md transition-all whitespace-nowrap"
                      style={
                        range === opt.value
                          ? {
                              background: "hsl(var(--card))",
                              color: ACCENT,
                              boxShadow: "0 1px 3px hsl(0 0% 0% / 0.10)",
                            }
                          : { color: "hsl(var(--muted-foreground))" }
                      }
                      data-testid={`range-toggle-${opt.value}`}
                    >
                      {opt.short}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Cross-portfolio signals across the TTO index for the {rangeOpt.label}: biology
                drivers, therapeutic whitespace, modality momentum, and institution velocity.
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
            <p className="text-sm text-destructive">
              Failed to load market intelligence. Please refresh the page.
            </p>
          </div>
        )}

        {/* Outer bento ring */}
        <div
          className="rounded-2xl p-4 space-y-4"
          style={{
            border: "1px solid hsl(var(--border) / 0.7)",
            background: "hsl(var(--muted) / 0.18)",
            animation: "dash-fade-up 400ms ease 50ms both",
          }}
          data-testid="bento-outer-ring"
        >
          {isLoading ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SkeletonBlock className="min-h-[380px]" />
                <SkeletonBlock className="min-h-[380px]" />
                <SkeletonBlock className="min-h-[380px]" />
              </div>
              <SkeletonBlock className="min-h-[460px]" />
              <SkeletonBlock className="min-h-[130px]" />
            </>
          ) : data ? (
            <>
              {/* Row 1: Biology, Modality, Institution — three equal columns */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SectionPanel
                  icon={Dna}
                  title="Biology Landscape"
                  subtitle={`Top biology drivers across the TTO index for the ${rangeOpt.label}`}
                  delay={60}
                  className="min-h-[380px]"
                >
                  <BiologyLandscapePanel data={data.biologyLandscape} />
                </SectionPanel>

                <SectionPanel
                  icon={TrendingUp}
                  title="Modality Momentum"
                  subtitle={
                    range !== "all"
                      ? `Assets by modality added in the ${rangeOpt.label}`
                      : "All assets by modality, all time"
                  }
                  delay={90}
                  className="min-h-[380px]"
                >
                  <ModalityMomentumPanel data={data.modalityMomentum} range={range} />
                </SectionPanel>

                <SectionPanel
                  icon={Building2}
                  title="Institution Momentum"
                  subtitle={`Most active institutions in the ${rangeOpt.label}`}
                  delay={120}
                  className="min-h-[380px]"
                >
                  <InstitutionVelocityPanel data={data.institutionVelocity} range={range} />
                </SectionPanel>
              </div>

              {/* Row 2: Therapeutic Whitespace — full width */}
              <SectionPanel
                icon={Layers}
                title="Therapeutic Whitespace"
                subtitle={`Biology x modality density for the ${rangeOpt.label}. Darker = more assets, dashed = gap. Click any cell to explore those assets.`}
                delay={150}
                className="min-h-[500px]"
              >
                <WhitespacePanel
                  matrix={data.whitespaceMatrix}
                  onCellClick={(bio, mod, count, framing) =>
                    setDrawerCtx({ type: "whitespace", biology: bio, modality: mod, count, framing })
                  }
                />
              </SectionPanel>

              {/* Row 3: Weekly Asset Velocity — full width */}
              <SectionPanel
                icon={BarChart2}
                title="Weekly Velocity"
                subtitle="New assets indexed per week across the TTO index. Click any bar to explore that week's additions."
                delay={180}
                className="min-h-[130px]"
              >
                <WeeklyVelocityPanel
                  data={data.weeklyTrend}
                  totalIndexed={data.totalAssetsIndexed}
                  onBarClick={(after, before, weekLabel, count) =>
                    setDrawerCtx({ type: "weekly", after, before, weekLabel, count })
                  }
                />
              </SectionPanel>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
