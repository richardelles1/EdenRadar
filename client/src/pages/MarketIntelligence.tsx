import { Fragment, useState, useEffect } from "react";
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
  { value: "all", short: "All time", label: "all time" },
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
  recentDeltaWindow: string;
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
  | { type: "biology"; biology: string; count: number }
  | { type: "modality"; modality: string; count: number }
  | { type: "institution"; institution: string; count: number }
  | null;

type CellTooltip = { title: string; sub: string; x: number; y: number } | null;

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT = "hsl(142 71% 45%)";
const ACCENT_FAINT = "hsl(142 71% 45% / 0.08)";
const WHITESPACE_MAX_BIO = 8;
const WHITESPACE_MAX_MOD = 6;
const DRAWER_PAGE = 20;

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

function forLabel(opt: { value: RangeOption; label: string }): string {
  return opt.value === "all" ? "for all time" : `for the ${opt.label}`;
}

function calcTooltipPos(e: React.MouseEvent): { x: number; y: number } {
  const PAD = 12;
  const TIP_HALF_W = 140;
  const TIP_MIN_SPACE_ABOVE = 75;
  const x = Math.max(
    TIP_HALF_W + PAD,
    Math.min(e.clientX, window.innerWidth - TIP_HALF_W - PAD),
  );
  const y = Math.max(TIP_MIN_SPACE_ABOVE, e.clientY);
  return { x, y };
}

function buildDrawerParams(ctx: DrawerContext, pageOffset: number): string {
  const p = new URLSearchParams({ limit: String(DRAWER_PAGE), offset: String(pageOffset) });
  if (!ctx) return p.toString();
  if (ctx.type === "whitespace") {
    p.set("biology", ctx.biology);
    p.set("modality", ctx.modality);
  } else if (ctx.type === "weekly") {
    p.set("after", ctx.after);
    p.set("before", ctx.before);
  } else if (ctx.type === "biology") {
    p.set("biology", ctx.biology);
  } else if (ctx.type === "modality") {
    p.set("modality", ctx.modality);
  } else if (ctx.type === "institution") {
    p.set("institution", ctx.institution);
  }
  return p.toString();
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

function BiologyLandscapePanel({
  data,
  onRowClick,
}: {
  data: BiologyEntry[];
  onRowClick: (entry: BiologyEntry) => void;
}) {
  if (!data.length) {
    return (
      <EmptyState message="Biology data is being populated by the AI enrichment pipeline." />
    );
  }
  return (
    <div className="overflow-y-auto h-full space-y-1 pr-1">
      {data.map((entry, i) => (
        <button
          key={entry.biology}
          className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent/30 transition-colors group"
          onClick={() => onRowClick(entry)}
          data-testid={`bio-row-${i}`}
        >
          <span className="text-[10px] text-muted-foreground tabular-nums w-5 shrink-0 text-right">{i + 1}</span>
          <span className="flex-1 min-w-0 text-xs text-foreground font-medium leading-tight group-hover:text-primary transition-colors truncate">
            {capitalize(entry.biology)}
          </span>
          <span className="text-xs text-foreground tabular-nums shrink-0 font-semibold">
            {entry.count.toLocaleString()}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── ModalityMomentumPanel ─────────────────────────────────────────────────────

function ModalityMomentumPanel({
  data,
  recentDeltaWindow,
  onRowClick,
}: {
  data: ModalityEntry[];
  recentDeltaWindow: string;
  onRowClick: (entry: ModalityEntry) => void;
}) {
  if (!data.length) {
    return <EmptyState message="No modality data available." />;
  }
  return (
    <div className="overflow-y-auto h-full space-y-1 pr-0.5">
      {data.map((entry, i) => (
        <button
          key={entry.modality}
          className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent/30 transition-colors group"
          onClick={() => onRowClick(entry)}
          data-testid={`modality-row-${entry.modality}`}
        >
          <span className="text-[10px] text-muted-foreground tabular-nums w-5 shrink-0 text-right">{i + 1}</span>
          <span className="flex-1 min-w-0 text-xs text-foreground font-medium leading-tight group-hover:text-primary transition-colors truncate">
            {capitalize(entry.modality)}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {recentDeltaWindow && entry.recentDelta > 0 && (
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded text-emerald-600 dark:text-emerald-400"
                style={{ background: "hsl(142 71% 45% / 0.10)" }}
              >
                +{entry.recentDelta.toLocaleString()}
              </span>
            )}
            <span className="text-xs text-foreground tabular-nums font-semibold">
              {entry.total.toLocaleString()}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── InstitutionVelocityPanel ──────────────────────────────────────────────────

function InstitutionVelocityPanel({
  data,
  range,
  onRowClick,
}: {
  data: VelocityEntry[];
  range: RangeOption;
  onRowClick: (entry: VelocityEntry) => void;
}) {
  if (!data.length) {
    return <EmptyState message="No institution activity in the selected period." />;
  }
  const rangeLabel = range === "all" ? "all time" : `last ${range.replace("d", "")} days`;
  return (
    <div className="overflow-y-auto h-full flex flex-col">
      <div className="space-y-1 pr-0.5 flex-1">
        {data.map((entry, i) => (
          <button
            key={entry.institution}
            className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent/30 transition-colors group"
            onClick={() => onRowClick(entry)}
            data-testid={`institution-velocity-${i}`}
          >
            <span className="text-[10px] text-muted-foreground tabular-nums w-5 shrink-0 text-right">{i + 1}</span>
            <span className="flex-1 min-w-0 text-xs text-foreground font-medium leading-tight group-hover:text-primary transition-colors truncate">
              {entry.institution}
            </span>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 tabular-nums"
              style={{ background: "hsl(142 71% 45% / 0.10)", color: "hsl(142 71% 32%)" }}
            >
              +{entry.count.toLocaleString()}
            </span>
          </button>
        ))}
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
            transform: "translate(-50%, calc(-100% - 10px))",
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
          gridTemplateColumns: `minmax(160px, 190px) repeat(${rawModalities.length}, minmax(0, 1fr))`,
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
                  className="h-12 rounded-[10px] flex items-center justify-center font-bold transition-all duration-150 select-none"
                  style={{
                    fontSize: "0.85rem",
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
                    const pos = calcTooltipPos(e);
                    setTooltip({
                      title: `${capitalize(bio)} × ${capitalize(mod)}`,
                      sub: framing,
                      x: pos.x,
                      y: pos.y,
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
          Click any cell to explore those assets
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
  const MIN_BAR_H = 10;

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
            transform: "translate(-50%, calc(-100% - 10px))",
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
            const scaledH = Math.round(Math.sqrt(entry.count / maxCount) * BAR_H);
            const h = entry.count > 0 ? Math.max(MIN_BAR_H, scaledH) : 0;
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
                  minHeight: entry.count > 0 ? `${MIN_BAR_H}px` : "0px",
                }}
                onMouseEnter={(e) => {
                  const pos = calcTooltipPos(e);
                  setTooltip({
                    title: weekLabel,
                    sub: `${entry.count.toLocaleString()} assets added`,
                    x: pos.x,
                    y: pos.y,
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
  const [assets, setAssets] = useState<DrawerAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const currentCtxRef = { current: ctx };

  useEffect(() => {
    if (!ctx) {
      setAssets([]);
      setTotal(0);
      setOffset(0);
      setFetchError(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setAssets([]);
    setTotal(0);
    setOffset(0);
    setFetchError(false);
    (async () => {
      try {
        const authHeaders = await getAuthHeaders();
        const res = await fetch(`/api/intelligence/assets?${buildDrawerParams(ctx, 0)}`, {
          credentials: "include",
          headers: authHeaders,
        });
        if (cancelled) return;
        if (!res.ok) { setFetchError(true); return; }
        const data = await res.json();
        if (cancelled) return;
        setAssets(data.assets ?? []);
        setTotal(data.total ?? 0);
        setOffset(data.assets?.length ?? 0);
      } catch {
        if (!cancelled) setFetchError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ctx]);

  async function loadMore() {
    if (!ctx || loadingMore) return;
    const ctxAtCall = currentCtxRef.current;
    setLoadingMore(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/intelligence/assets?${buildDrawerParams(ctx, offset)}`, {
        credentials: "include",
        headers: authHeaders,
      });
      if (!res.ok || currentCtxRef.current !== ctxAtCall) return;
      const data = await res.json();
      if (currentCtxRef.current !== ctxAtCall) return;
      setAssets((prev) => [...prev, ...(data.assets ?? [])]);
      setTotal(data.total ?? total);
      setOffset((prev) => prev + (data.assets?.length ?? 0));
    } finally {
      setLoadingMore(false);
    }
  }

  if (!ctx) return null;

  const drawerTitle =
    ctx.type === "whitespace"
      ? `${capitalize(ctx.biology)} × ${capitalize(ctx.modality)}`
      : ctx.type === "weekly"
      ? ctx.weekLabel
      : ctx.type === "biology"
      ? capitalize(ctx.biology)
      : ctx.type === "modality"
      ? capitalize(ctx.modality)
      : ctx.institution;

  const drawerSub =
    ctx.type === "whitespace"
      ? ctx.framing
      : ctx.type === "weekly"
      ? `${ctx.count.toLocaleString()} assets added during this period`
      : ctx.type === "biology"
      ? `All assets in ${capitalize(ctx.biology)}`
      : ctx.type === "modality"
      ? `All ${capitalize(ctx.modality)} assets`
      : `All assets from ${ctx.institution}`;

  const scoutHref =
    ctx.type === "whitespace"
      ? `/scout?biology=${encodeURIComponent(ctx.biology)}&modality=${encodeURIComponent(ctx.modality)}`
      : ctx.type === "weekly"
      ? `/scout?after=${ctx.after}&before=${ctx.before}`
      : ctx.type === "biology"
      ? `/scout?biology=${encodeURIComponent(ctx.biology)}`
      : ctx.type === "modality"
      ? `/scout?modality=${encodeURIComponent(ctx.modality)}`
      : `/institutions/${ctx.institution.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;

  const scoutCtaLabel = ctx.type === "institution" ? "View Institution Profile" : "Explore all in Scout";

  const hasMore = assets.length > 0 && assets.length < total;

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
            {total > 0 && !loading && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Showing {assets.length.toLocaleString()} of {total.toLocaleString()}
              </p>
            )}
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
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="p-3 rounded-lg border border-border space-y-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
            ))
          ) : fetchError ? (
            <EmptyState message="Failed to load assets. Please close and try again." />
          ) : !assets.length ? (
            <EmptyState message="No assets found for this filter. Try exploring in Scout." />
          ) : (
            <>
              {assets.map((asset) => (
                <Link key={asset.id} href={`/asset/${asset.id}`}>
                  <div
                    className="p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-accent/20 transition-all cursor-pointer"
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
                </Link>
              ))}

              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-2.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all disabled:opacity-50"
                  data-testid="button-drawer-load-more"
                >
                  {loadingMore ? "Loading…" : `Load ${Math.min(DRAWER_PAGE, total - assets.length)} more`}
                </button>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-border shrink-0">
          <Link href={scoutHref}>
            <button
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: "hsl(142 71% 45% / 0.12)", color: ACCENT }}
              data-testid="button-drawer-scout"
            >
              {scoutCtaLabel}
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
      <div className="space-y-2 pt-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-3 w-4 shrink-0" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-10 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MarketIntelligence ────────────────────────────────────────────────────────

export default function MarketIntelligence() {
  const [range, setRange] = useState<RangeOption>("all");
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
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: "hsl(142 71% 45% / 0.12)" }}
                >
                  <BarChart2 className="w-4 h-4" style={{ color: ACCENT }} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">Landscape Intelligence</h1>
                    <span
                      className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                      style={{ background: "hsl(142 71% 45% / 0.12)", color: ACCENT }}
                    >
                      Live
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Signal-level view of the TTO asset index.
                  </p>
                </div>
              </div>
            </div>

            {/* Range toggle — prominent segment control */}
            <div
              className="flex items-center gap-1 p-1 rounded-xl w-fit"
              style={{
                background: "hsl(var(--muted) / 0.8)",
                border: "1px solid hsl(var(--border))",
              }}
              data-testid="range-toggle-group"
            >
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRange(opt.value)}
                  className="text-sm font-semibold px-4 py-1.5 rounded-lg transition-all whitespace-nowrap"
                  style={
                    range === opt.value
                      ? {
                          background: "hsl(var(--card))",
                          color: ACCENT,
                          boxShadow: "0 1px 4px hsl(0 0% 0% / 0.12)",
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
        </div>

        {isError && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5 text-center">
            <p className="text-sm text-destructive">
              Failed to load landscape intelligence. Please refresh the page.
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
              <SkeletonBlock className="min-h-[460px]" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SkeletonBlock className="min-h-[560px]" />
                <div className="space-y-4">
                  <SkeletonBlock className="min-h-[260px]" />
                  <SkeletonBlock className="min-h-[290px]" />
                </div>
              </div>
              <SkeletonBlock className="min-h-[130px]" />
            </>
          ) : data ? (
            <>
              {/* Row 1: Therapeutic Whitespace — full width, most differentiated view */}
              <SectionPanel
                icon={Layers}
                title="Therapeutic Whitespace"
                subtitle={`Biology × modality density ${forLabel(rangeOpt)}. Darker = more assets, dashed = gap. Click any cell to explore assets.`}
                delay={60}
                className="min-h-[460px]"
              >
                <WhitespacePanel
                  matrix={data.whitespaceMatrix}
                  onCellClick={(bio, mod, count, framing) =>
                    setDrawerCtx({ type: "whitespace", biology: bio, modality: mod, count, framing })
                  }
                />
              </SectionPanel>

              {/* Row 2: Biology (left) | Modality + Institution stacked (right) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <SectionPanel
                  icon={Dna}
                  title="Biology Landscape"
                  subtitle={`Top biology drivers ${forLabel(rangeOpt)} — click a row to explore assets`}
                  delay={90}
                  className="min-h-[560px]"
                >
                  <BiologyLandscapePanel
                    data={data.biologyLandscape}
                    onRowClick={(entry) =>
                      setDrawerCtx({ type: "biology", biology: entry.biology, count: entry.count })
                    }
                  />
                </SectionPanel>

                <div className="flex flex-col gap-4">
                  <SectionPanel
                    icon={TrendingUp}
                    title="Modality Momentum"
                    subtitle={
                      range !== "all"
                        ? `Assets by modality ${forLabel(rangeOpt)} — click a row to explore assets`
                        : "All assets by modality — click a row to explore assets"
                    }
                    delay={120}
                    className="min-h-[260px]"
                  >
                    <ModalityMomentumPanel
                      data={data.modalityMomentum}
                      recentDeltaWindow={data.recentDeltaWindow}
                      onRowClick={(entry) =>
                        setDrawerCtx({ type: "modality", modality: entry.modality, count: entry.total })
                      }
                    />
                  </SectionPanel>

                  <SectionPanel
                    icon={Building2}
                    title="Institution Momentum"
                    subtitle={`Most active institutions ${forLabel(rangeOpt)} — click a row to explore assets`}
                    delay={150}
                    className="min-h-[290px]"
                  >
                    <InstitutionVelocityPanel
                      data={data.institutionVelocity}
                      range={range}
                      onRowClick={(entry) =>
                        setDrawerCtx({ type: "institution", institution: entry.institution, count: entry.count })
                      }
                    />
                  </SectionPanel>
                </div>
              </div>

              {/* Row 3: Weekly Asset Velocity — full width */}
              <SectionPanel
                icon={BarChart2}
                title="Weekly Velocity"
                subtitle="New assets indexed per week. Click any bar to explore that week's additions."
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
