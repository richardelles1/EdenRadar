import { Fragment, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  BarChart2, Dna, Layers, TrendingUp, Building2, ArrowRight, Info, X,
  Zap, GitBranch, Crosshair, Activity,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTip, ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { getAuthHeaders } from "@/lib/queryClient";
import { PipelinePicker } from "@/components/PipelinePicker";
import type { PipelinePickerPayload } from "@/components/PipelinePicker";

// ── Types ─────────────────────────────────────────────────────────────────────

type RangeOption = "30d" | "60d" | "90d" | "all";

const RANGE_OPTIONS: { value: RangeOption; short: string; label: string }[] = [
  { value: "30d", short: "30d", label: "last 30 days" },
  { value: "60d", short: "60d", label: "last 60 days" },
  { value: "90d", short: "90d", label: "last 90 days" },
  { value: "all", short: "All time", label: "all time" },
];

type BiologyEntry = { biology: string; count: number; recentDelta?: number };
type ModalityEntry = { modality: string; total: number; recentDelta: number };
type WeekEntry = { week: string; count: number };
type VelocityEntry = { institution: string; count: number };
type WhitespaceMatrix = { biologies: string[]; modalities: string[]; cells: Record<string, number> };
type StageFunnelEntry = { stage: string; count: number };
type WhitespaceOpportunityEntry = { biology: string; assetCount: number; avgUnmetNeed: number };
type RisingAsset = {
  id: number; title: string; institution: string;
  biology: string; modality: string; developmentStage: string; momentumScore: number;
};
type InstitutionPipelineEntry = {
  institution: string; total: number;
  discovery: number; earlyStage: number; preclinical: number;
  phase1: number; phase2: number; phase3: number; approved: number; commercial: number;
};

type MarketIntelligenceData = {
  biologyLandscape: BiologyEntry[];
  whitespaceMatrix: WhitespaceMatrix;
  modalityMomentum: ModalityEntry[];
  weeklyTrend: WeekEntry[];
  institutionVelocity: VelocityEntry[];
  totalAssetsIndexed: number;
  recentDeltaWindow: string;
  stageFunnel: StageFunnelEntry[];
  whitespaceOpportunity: WhitespaceOpportunityEntry[];
  risingAssets: RisingAsset[];
  institutionPipeline: InstitutionPipelineEntry[];
};

type DrawerAsset = {
  id: number; title: string; institution: string; modality: string; biology: string; score: number | null;
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

const STAGE_ORDER = ["discovery", "early stage", "preclinical", "phase 1", "phase 2", "phase 3", "approved", "commercial"];

const STAGE_LABELS: Record<string, string> = {
  "discovery": "Discovery", "early stage": "Early Stage", "preclinical": "Preclinical",
  "phase 1": "Phase 1", "phase 2": "Phase 2", "phase 3": "Phase 3",
  "approved": "Approved", "commercial": "Commercial",
  "earlyStage": "Early Stage", "phase1": "Phase 1", "phase2": "Phase 2",
  "phase3": "Phase 3",
};

const STAGE_COLORS: Record<string, string> = {
  "discovery": "#6b7280",
  "early stage": "#4b90d4",
  "earlyStage": "#4b90d4",
  "preclinical": "#3b82f6",
  "phase 1": "#34d399",
  "phase1": "#34d399",
  "phase 2": "#10b981",
  "phase2": "#10b981",
  "phase 3": "#059669",
  "phase3": "#059669",
  "approved": "#f59e0b",
  "commercial": "#f97316",
};

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
  const PAD = 12, TIP_HALF_W = 140, TIP_MIN_SPACE_ABOVE = 75;
  const x = Math.max(TIP_HALF_W + PAD, Math.min(e.clientX, window.innerWidth - TIP_HALF_W - PAD));
  const y = Math.max(TIP_MIN_SPACE_ABOVE, e.clientY);
  return { x, y };
}

function buildDrawerParams(ctx: DrawerContext, pageOffset: number, range?: RangeOption): string {
  const p = new URLSearchParams({ limit: String(DRAWER_PAGE), offset: String(pageOffset) });
  if (!ctx) return p.toString();
  if (ctx.type === "whitespace") { p.set("biology", ctx.biology); p.set("modality", ctx.modality); }
  else if (ctx.type === "weekly") { p.set("after", ctx.after); p.set("before", ctx.before); }
  else if (ctx.type === "biology") { p.set("biology", ctx.biology); }
  else if (ctx.type === "modality") { p.set("modality", ctx.modality); }
  else if (ctx.type === "institution") { p.set("institution", ctx.institution); }
  if (range && range !== "all" && ctx.type !== "weekly") p.set("range", range);
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
  icon: Icon, title, subtitle, children, delay = 0, className = "", headerRight,
}: {
  icon: React.ElementType; title: string; subtitle?: string; children: React.ReactNode;
  delay?: number; className?: string; headerRight?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-card p-5 flex flex-col ${className}`}
      style={{ animation: `dash-fade-up 400ms ease ${delay}ms both` }}
    >
      <div className="flex items-stretch gap-2.5 mb-4 shrink-0">
        <div className="w-9 rounded-md flex items-center justify-center shrink-0"
          style={{ background: "hsl(142 71% 45% / 0.12)" }}>
          <Icon className="w-4 h-4" style={{ color: ACCENT }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-foreground leading-tight">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{subtitle}</p>}
        </div>
        {headerRight && <div className="shrink-0 ml-2 flex items-center">{headerRight}</div>}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

// ── StageFunnelPanel ──────────────────────────────────────────────────────────

function StageFunnelPanel({ data }: { data: StageFunnelEntry[] }) {
  const ordered = STAGE_ORDER
    .map((s) => data.find((d) => d.stage === s))
    .filter(Boolean) as StageFunnelEntry[];

  if (!ordered.length) return <EmptyState message="Stage data is being populated." />;

  const maxCount = Math.max(...ordered.map((s) => s.count), 1);
  const total = ordered.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-2.5">
      {ordered.map((entry) => {
        const pct = total > 0 ? Math.round((entry.count / total) * 100) : 0;
        const barWidth = Math.max(4, Math.sqrt(entry.count / maxCount) * 100);
        const color = STAGE_COLORS[entry.stage] ?? ACCENT;
        return (
          <div key={entry.stage} className="flex items-center gap-3">
            <div className="w-[90px] text-right shrink-0">
              <span className="text-xs font-semibold text-foreground">{STAGE_LABELS[entry.stage] ?? capitalize(entry.stage)}</span>
            </div>
            <div className="flex-1 min-w-0 h-7 rounded-md overflow-hidden" style={{ background: "hsl(var(--muted) / 0.25)" }}>
              <div
                className="h-full rounded-md flex items-center px-2.5 transition-all duration-700"
                style={{ width: `${barWidth}%`, background: color, minWidth: 50 }}
              >
                <span className="text-[10px] font-bold text-white/95 tabular-nums">
                  {entry.count.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="w-8 text-right shrink-0">
              <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/50 flex-wrap">
        {STAGE_ORDER.filter((s) => data.some((d) => d.stage === s)).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: STAGE_COLORS[s] ?? ACCENT }} />
            <span className="text-[9px] text-muted-foreground">{STAGE_LABELS[s]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── WhiteSpaceFinderPanel ─────────────────────────────────────────────────────

function WhiteSpaceFinderPanel({
  data, onRowClick,
}: { data: WhitespaceOpportunityEntry[]; onRowClick: (biology: string, count: number) => void }) {
  if (!data.length) return <EmptyState message="Enriching unmet need data — check back shortly." />;

  const withScore = data.map((d) => ({
    ...d,
    oppScore: d.avgUnmetNeed / Math.log2(d.assetCount + 2),
  }));
  const maxScore = Math.max(...withScore.map((d) => d.oppScore), 1);
  const maxCount = Math.max(...data.map((d) => d.assetCount), 1);
  const sorted = [...withScore].sort((a, b) => b.oppScore - a.oppScore);

  function badge(oppScore: number) {
    const pct = oppScore / maxScore;
    if (pct >= 0.6) return { label: "High Opp", color: ACCENT, bg: "hsl(142 71% 45% / 0.12)" };
    if (pct >= 0.3) return { label: "Growing", color: "hsl(210 70% 55%)", bg: "hsl(210 70% 55% / 0.10)" };
    return { label: "Monitor", color: "hsl(var(--muted-foreground))", bg: "hsl(var(--muted) / 0.45)" };
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className="grid text-[9px] uppercase tracking-wide text-muted-foreground font-semibold pb-1.5 mb-1 border-b border-border/50 shrink-0"
        style={{ gridTemplateColumns: "1fr 52px 90px 68px" }}
      >
        <span>Biology</span>
        <span className="text-center">Need</span>
        <span className="text-center">Assets</span>
        <span className="text-right">Signal</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5 min-h-0">
        {sorted.map((entry) => {
          const b = badge(entry.oppScore);
          const barPct = (entry.assetCount / maxCount) * 100;
          const dots = Math.round(entry.avgUnmetNeed);
          return (
            <button
              key={entry.biology}
              className="w-full grid items-center py-1.5 px-1 rounded-lg hover:bg-accent/20 transition-colors text-left gap-2"
              style={{ gridTemplateColumns: "1fr 52px 90px 68px" }}
              onClick={() => onRowClick(entry.biology, entry.assetCount)}
            >
              <span className="text-xs font-medium text-foreground truncate leading-snug">
                {capitalize(entry.biology)}
              </span>
              <div className="flex justify-center gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full"
                    style={{ background: i <= dots ? ACCENT : "hsl(var(--muted) / 0.45)" }} />
                ))}
              </div>
              <div className="flex items-center gap-1.5 px-1">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(var(--muted) / 0.3)" }}>
                  <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: "hsl(142 71% 45% / 0.55)" }} />
                </div>
                <span className="text-[9px] text-muted-foreground tabular-nums w-10 text-right">
                  {entry.assetCount.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-end">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
                  style={{ color: b.color, background: b.bg }}>
                  {b.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[9px] text-muted-foreground mt-2 pt-2 border-t border-border/50 shrink-0 italic">
        Ranked by unmet need ÷ asset density — High Opp = urgent gap with few assets indexed
      </p>
    </div>
  );
}

// ── RisingAssetsPanel ─────────────────────────────────────────────────────────

function RisingAssetsPanel({ data }: { data: RisingAsset[] }) {
  if (!data.length) return <EmptyState message="No momentum signals detected yet." />;

  return (
    <div className="overflow-y-auto space-y-2 pr-0.5" style={{ maxHeight: 480 }}>
      {data.map((asset) => {
        const isRising = asset.momentumScore >= 40;
        return (
          <Link key={asset.id} href={`/asset/${asset.id}`}>
            <div className="group p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-accent/20 transition-all cursor-pointer">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className="text-xs font-medium text-foreground leading-snug line-clamp-2 flex-1 group-hover:text-primary transition-colors">
                  {asset.title}
                </p>
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap"
                  style={
                    isRising
                      ? { background: "hsl(142 71% 45% / 0.12)", color: ACCENT }
                      : { background: "hsl(var(--muted) / 0.5)", color: "hsl(var(--muted-foreground))" }
                  }
                >
                  {isRising ? "↑ Rising" : `Score ${asset.momentumScore}`}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-muted-foreground truncate max-w-[160px]">{asset.institution}</span>
                {asset.modality && asset.modality !== "unknown" && (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: "hsl(142 71% 45% / 0.08)", color: "hsl(142 71% 32%)" }}>
                    {capitalize(asset.modality)}
                  </span>
                )}
                {asset.developmentStage && asset.developmentStage !== "unknown" && (
                  <span className="text-[9px] text-muted-foreground">{capitalize(asset.developmentStage)}</span>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ── InstitutionPipelinePanel ──────────────────────────────────────────────────

function InstitutionPipelinePanel({
  data, onRowClick,
}: { data: InstitutionPipelineEntry[]; onRowClick: (institution: string, total: number) => void }) {
  if (!data.length) return <EmptyState message="Pipeline data is loading." />;

  const chartHeight = Math.max(320, data.length * 46);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const visible = payload.filter((p: any) => p.value > 0);
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-xl text-xs space-y-1 max-w-[220px]">
        <p className="font-semibold text-foreground mb-2 leading-snug">{label}</p>
        {visible.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.fill }} />
            <span className="text-muted-foreground">{STAGE_LABELS[p.dataKey] ?? capitalize(p.dataKey)}:</span>
            <span className="font-semibold text-foreground ml-auto">{p.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
            onClick={(e) => {
              if (e?.activePayload?.[0]?.payload) {
                const row = e.activePayload[0].payload as InstitutionPipelineEntry;
                onRowClick(row.institution, row.total);
              }
            }}
            style={{ cursor: "pointer" }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="institution"
              width={205}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.2)" horizontal={false} />
            <RechartsTip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--accent) / 0.15)" }} />
            <Bar dataKey="discovery"   stackId="a" fill={STAGE_COLORS["discovery"]}   name="discovery" />
            <Bar dataKey="earlyStage"  stackId="a" fill={STAGE_COLORS["earlyStage"]}  name="earlyStage" />
            <Bar dataKey="preclinical" stackId="a" fill={STAGE_COLORS["preclinical"]} name="preclinical" />
            <Bar dataKey="phase1"      stackId="a" fill={STAGE_COLORS["phase1"]}      name="phase1" />
            <Bar dataKey="phase2"      stackId="a" fill={STAGE_COLORS["phase2"]}      name="phase2" />
            <Bar dataKey="phase3"      stackId="a" fill={STAGE_COLORS["phase3"]}      name="phase3" />
            <Bar dataKey="approved"    stackId="a" fill={STAGE_COLORS["approved"]}    name="approved" />
            <Bar dataKey="commercial"  stackId="a" fill={STAGE_COLORS["commercial"]}  name="commercial" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/50 flex-wrap">
        {(["discovery", "earlyStage", "preclinical", "phase1", "phase2", "phase3", "approved", "commercial"] as const).map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: STAGE_COLORS[k] }} />
            <span className="text-[9px] text-muted-foreground">{STAGE_LABELS[k]}</span>
          </div>
        ))}
        <span className="text-[9px] text-muted-foreground ml-auto italic">Click a bar to explore assets</span>
      </div>
    </div>
  );
}

// ── ModalityMomentumPanel ─────────────────────────────────────────────────────

function ModalityMomentumPanel({
  data, recentDeltaWindow, onRowClick,
}: { data: ModalityEntry[]; recentDeltaWindow: string; onRowClick: (entry: ModalityEntry) => void }) {
  if (!data.length) return <EmptyState message="No modality data available." />;
  return (
    <div className="overflow-y-auto space-y-1 pr-0.5" style={{ maxHeight: 320 }}>
      {data.map((entry, i) => (
        <button
          key={entry.modality}
          className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent/30 transition-colors group"
          onClick={() => onRowClick(entry)}
        >
          <span className="text-[10px] text-muted-foreground tabular-nums w-5 shrink-0 text-right">{i + 1}</span>
          <span className="flex-1 min-w-0 text-xs text-foreground font-medium leading-tight group-hover:text-primary transition-colors truncate">
            {capitalize(entry.modality)}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {recentDeltaWindow && entry.recentDelta > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-emerald-600 dark:text-emerald-400"
                style={{ background: "hsl(142 71% 45% / 0.10)" }}>
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

// ── BiologyLandscapePanel ─────────────────────────────────────────────────────

function BiologyLandscapePanel({ data, onRowClick }: { data: BiologyEntry[]; onRowClick: (entry: BiologyEntry) => void }) {
  if (!data.length) return <EmptyState message="Biology data is being populated by the AI enrichment pipeline." />;
  return (
    <div className="overflow-y-auto space-y-1 pr-0.5" style={{ maxHeight: 320 }}>
      {data.map((entry, i) => (
        <button
          key={entry.biology}
          className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent/30 transition-colors group"
          onClick={() => onRowClick(entry)}
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

// ── WhitespacePanel ───────────────────────────────────────────────────────────

function WhitespacePanel({ matrix, onCellClick, setTooltip }: {
  matrix: WhitespaceMatrix;
  onCellClick: (bio: string, mod: string, count: number, framing: string) => void;
  setTooltip: (t: CellTooltip) => void;
}) {
  const rawBiologies = matrix.biologies.slice(0, WHITESPACE_MAX_BIO);
  const rawModalities = matrix.modalities.slice(0, WHITESPACE_MAX_MOD);
  const cells = matrix.cells;

  if (!rawBiologies.length || !rawModalities.length) {
    return <EmptyState message="Whitespace data requires biology and modality fields. More assets are being enriched now." />;
  }

  const allCounts = Object.values(cells);
  const maxCount = allCounts.length ? Math.max(...allCounts) : 1;

  function cellOpacity(count: number): number {
    if (count === 0) return 0;
    return 0.13 + 0.70 * Math.sqrt(count / maxCount);
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className="grid gap-2 flex-1"
        style={{ gridTemplateColumns: `minmax(160px, 190px) repeat(${rawModalities.length}, minmax(0, 1fr))` }}
      >
        <div />
        {rawModalities.map((m) => (
          <div key={m} className="text-xs text-muted-foreground font-semibold text-center pb-2 leading-tight">
            {capitalize(m)}
          </div>
        ))}
        {rawBiologies.map((bio) => (
          <Fragment key={bio}>
            <div className="text-[12px] text-foreground font-medium pr-3 flex items-center">{capitalize(bio)}</div>
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
                    fontSize: "1rem",
                    background: isEmpty
                      ? "hsl(var(--muted) / 0.28)"
                      : `linear-gradient(155deg, hsl(142 71% 54% / ${op}), hsl(142 71% 36% / ${Math.min(op + 0.12, 1)}))`,
                    color: isEmpty ? "transparent" : op > 0.55 ? "hsl(142 71% 14%)" : "hsl(142 71% 28%)",
                    border: isEmpty ? "1px dashed hsl(var(--border) / 0.5)" : "1px solid hsl(142 71% 45% / 0.18)",
                    boxShadow: isEmpty ? "none" : `0 1px 4px hsl(142 71% 45% / ${op * 0.25})`,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    const pos = calcTooltipPos(e);
                    setTooltip({ title: `${capitalize(bio)} × ${capitalize(mod)}`, sub: framing, x: pos.x, y: pos.y });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => { setTooltip(null); onCellClick(bio, mod, count, framing); }}
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
          <div className="w-4 h-4 rounded-md"
            style={{ border: "1px dashed hsl(var(--border) / 0.5)", background: "hsl(var(--muted) / 0.28)" }} />
          <span className="text-xs text-muted-foreground">Whitespace</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-md"
            style={{ background: "linear-gradient(155deg, hsl(142 71% 54% / 0.85), hsl(142 71% 36% / 0.97))" }} />
          <span className="text-xs text-muted-foreground">High density</span>
        </div>
        <span className="text-[10px] text-muted-foreground ml-auto italic">Click any cell to explore those assets</span>
      </div>
    </div>
  );
}

// ── WeeklyVelocityPanel ───────────────────────────────────────────────────────

function WeeklyVelocityPanel({ data, totalIndexed, onBarClick, setTooltip }: {
  data: WeekEntry[];
  totalIndexed: number;
  onBarClick: (after: string, before: string, weekLabel: string, count: number) => void;
  setTooltip: (t: CellTooltip) => void;
}) {
  if (!data.length) return <EmptyState message="No weekly data available." />;

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const avgPerWeek = Math.round(data.reduce((s, d) => s + d.count, 0) / Math.max(data.length, 1));
  const BAR_H = 80;

  return (
    <div className="flex items-center gap-6 h-full">
      <div className="flex gap-3 shrink-0">
        <div className="rounded-lg px-4 py-3 text-center" style={{ background: ACCENT_FAINT, border: "1px solid hsl(142 71% 45% / 0.15)" }}>
          <p className="text-xl font-black tabular-nums text-foreground">{totalIndexed.toLocaleString()}</p>
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">Total indexed</p>
        </div>
        <div className="rounded-lg px-4 py-3 text-center" style={{ background: ACCENT_FAINT, border: "1px solid hsl(142 71% 45% / 0.15)" }}>
          <p className="text-xl font-black tabular-nums text-foreground">{avgPerWeek.toLocaleString()}</p>
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">Avg / week</p>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-end gap-1.5" style={{ height: BAR_H }}>
          {data.map((entry, i) => {
            const scaledH = Math.round(Math.sqrt(entry.count / maxCount) * BAR_H);
            const h = entry.count > 0 ? Math.max(8, scaledH) : 0;
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
                  background: "linear-gradient(to bottom, hsl(142 71% 52%), hsl(142 71% 36%))",
                  opacity,
                  cursor: entry.count > 0 ? "pointer" : "default",
                  minHeight: entry.count > 0 ? "8px" : "0px",
                }}
                onMouseEnter={(e) => {
                  const pos = calcTooltipPos(e);
                  setTooltip({ title: weekLabel, sub: `${entry.count.toLocaleString()} assets added`, x: pos.x, y: pos.y });
                }}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => { if (entry.count > 0) { setTooltip(null); onBarClick(after, before, weekLabel, entry.count); } }}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-muted-foreground">{data.length > 0 ? formatWeek(data[0].week) : ""}</span>
          <span className="text-[9px] text-muted-foreground">{data.length > 0 ? formatWeek(data[data.length - 1].week) : ""}</span>
        </div>
      </div>
    </div>
  );
}

// ── AssetDrawer ───────────────────────────────────────────────────────────────

function AssetDrawer({ ctx, range, onClose }: { ctx: DrawerContext; range: RangeOption; onClose: () => void }) {
  const [assets, setAssets] = useState<DrawerAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const currentCtxRef = { current: ctx };

  useEffect(() => {
    if (!ctx) { setAssets([]); setTotal(0); setOffset(0); setFetchError(false); return; }
    let cancelled = false;
    setLoading(true); setAssets([]); setTotal(0); setOffset(0); setFetchError(false);
    (async () => {
      try {
        const authHeaders = await getAuthHeaders();
        const res = await fetch(`/api/intelligence/assets?${buildDrawerParams(ctx, 0, range)}`, {
          credentials: "include", headers: authHeaders,
        });
        if (cancelled) return;
        if (!res.ok) { setFetchError(true); return; }
        const data = await res.json();
        if (cancelled) return;
        setAssets(data.assets ?? []); setTotal(data.total ?? 0); setOffset(data.assets?.length ?? 0);
      } catch { if (!cancelled) setFetchError(true); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [ctx]);

  async function loadMore() {
    if (!ctx || loadingMore) return;
    const ctxAtCall = currentCtxRef.current;
    setLoadingMore(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/intelligence/assets?${buildDrawerParams(ctx, offset, range)}`, {
        credentials: "include", headers: authHeaders,
      });
      if (!res.ok || currentCtxRef.current !== ctxAtCall) return;
      const data = await res.json();
      if (currentCtxRef.current !== ctxAtCall) return;
      setAssets((prev) => [...prev, ...(data.assets ?? [])]);
      setTotal(data.total ?? total);
      setOffset((prev) => prev + (data.assets?.length ?? 0));
    } finally { setLoadingMore(false); }
  }

  if (!ctx) return null;

  const drawerTitle =
    ctx.type === "whitespace" ? `${capitalize(ctx.biology)} × ${capitalize(ctx.modality)}`
    : ctx.type === "weekly" ? ctx.weekLabel
    : ctx.type === "biology" ? capitalize(ctx.biology)
    : ctx.type === "modality" ? capitalize(ctx.modality)
    : ctx.institution;

  const drawerSub =
    ctx.type === "whitespace" ? ctx.framing
    : ctx.type === "weekly" ? `${ctx.count.toLocaleString()} assets added during this period`
    : ctx.type === "biology" ? `All assets in ${capitalize(ctx.biology)}`
    : ctx.type === "modality" ? `All ${capitalize(ctx.modality)} assets`
    : `All assets from ${ctx.institution}`;

  const scoutHref =
    ctx.type === "whitespace" ? `/scout?biology=${encodeURIComponent(ctx.biology)}&modality=${encodeURIComponent(ctx.modality)}`
    : ctx.type === "weekly" ? `/scout?after=${ctx.after}&before=${ctx.before}`
    : ctx.type === "biology" ? `/scout?biology=${encodeURIComponent(ctx.biology)}`
    : ctx.type === "modality" ? `/scout?modality=${encodeURIComponent(ctx.modality)}`
    : `/institutions/${ctx.institution.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;

  const scoutCtaLabel = ctx.type === "institution" ? "View Institution Profile" : "Explore all in Scout";
  const hasMore = assets.length > 0 && assets.length < total;

  return (
    <>
      <div className="fixed inset-0 bg-black/25 z-40 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className="fixed right-0 top-0 h-full w-[420px] max-w-full bg-card border-l border-border z-50 flex flex-col shadow-2xl"
        style={{ animation: "slide-in-right 220ms ease both" }}
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
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5">
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
              {assets.map((asset) => {
                const pickerPayload: PipelinePickerPayload = {
                  asset_name: asset.title, modality: asset.modality !== "unknown" ? asset.modality : undefined,
                  source_journal: asset.institution || undefined, ingested_asset_id: asset.id, pmid: String(asset.id),
                };
                return (
                  <div key={asset.id} className="group relative p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-accent/20 transition-all">
                    <div className="absolute top-2.5 right-2.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <PipelinePicker payload={pickerPayload} bare />
                    </div>
                    <Link href={`/asset/${asset.id}`}>
                      <div className="cursor-pointer pr-6">
                        <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">{asset.title}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-[10px] text-muted-foreground">{asset.institution}</span>
                          {asset.modality && asset.modality !== "unknown" && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                              style={{ background: "hsl(142 71% 45% / 0.10)", color: "hsl(142 71% 32%)" }}>
                              {capitalize(asset.modality)}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </div>
                );
              })}
              {hasMore && (
                <button
                  onClick={loadMore} disabled={loadingMore}
                  className="w-full py-2.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all disabled:opacity-50"
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
        <Skeleton className="w-9 h-9 rounded-md shrink-0" />
        <div className="space-y-1 flex-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-2.5 w-48" />
        </div>
      </div>
      <div className="space-y-2 pt-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
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
  const [tooltip, setTooltip] = useState<CellTooltip>(null);

  const { data, isLoading, isError } = useQuery<MarketIntelligenceData>({
    queryKey: ["/api/intelligence/market", range],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/intelligence/market?range=${range}`, {
        credentials: "include", headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const rangeOpt = RANGE_OPTIONS.find((o) => o.value === range)!;
  const risingCount = data?.risingAssets?.filter((a) => a.momentumScore >= 40).length ?? 0;
  const topBiology = data?.biologyLandscape?.[0]?.biology ?? null;

  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--background))" }}>
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

      {tooltip && (
        <div
          className="fixed z-[9999] bg-popover border border-border rounded-lg px-3 py-2 shadow-xl pointer-events-none text-center"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, calc(-100% - 10px))", maxWidth: "260px" }}
        >
          <p className="text-[11px] font-semibold text-foreground leading-snug">{tooltip.title}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{tooltip.sub}</p>
        </div>
      )}

      <AssetDrawer ctx={drawerCtx} range={range} onClose={() => setDrawerCtx(null)} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-5">

        {/* Page header */}
        <div
          className="rounded-xl border border-primary/15 p-5"
          style={{
            background: "color-mix(in srgb, hsl(var(--primary)) 3%, hsl(var(--background)))",
            animation: "dash-fade-up 400ms ease both",
          }}
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                style={{ background: "hsl(142 71% 45% / 0.12)" }}>
                <BarChart2 className="w-4 h-4" style={{ color: ACCENT }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-foreground tracking-tight">Landscape Intelligence</h1>
                  <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                    style={{ background: "hsl(142 71% 45% / 0.12)", color: ACCENT }}>
                    Live
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Signal-level view of the pre-commercial TTO asset index.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Stat pills */}
              {data && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs"
                    style={{ background: ACCENT_FAINT, border: "1px solid hsl(142 71% 45% / 0.15)" }}>
                    <span className="font-black tabular-nums text-foreground">{data.totalAssetsIndexed.toLocaleString()}</span>
                    <span className="text-muted-foreground">indexed</span>
                  </div>
                  {risingCount > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs"
                      style={{ background: "hsl(142 71% 45% / 0.08)", border: "1px solid hsl(142 71% 45% / 0.15)" }}>
                      <Zap className="w-3 h-3" style={{ color: ACCENT }} />
                      <span className="font-black tabular-nums text-foreground">{risingCount}</span>
                      <span className="text-muted-foreground">rising</span>
                    </div>
                  )}
                  {topBiology && (
                    <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs"
                      style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
                      <span className="text-muted-foreground">Top:</span>
                      <span className="font-semibold text-foreground">{capitalize(topBiology)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Range toggle */}
              <div
                className="flex items-center gap-1 p-1 rounded-xl shrink-0"
                style={{ background: "hsl(var(--muted) / 0.8)", border: "1px solid hsl(var(--border))" }}
              >
                {RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setRange(opt.value)}
                    className="text-sm font-semibold px-4 py-1.5 rounded-lg transition-all whitespace-nowrap"
                    style={
                      range === opt.value
                        ? { background: "hsl(var(--card))", color: ACCENT, boxShadow: "0 1px 4px hsl(0 0% 0% / 0.12)" }
                        : { color: "hsl(var(--muted-foreground))" }
                    }
                  >
                    {opt.short}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {isError && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5 text-center">
            <p className="text-sm text-destructive">Failed to load landscape intelligence. Please refresh the page.</p>
          </div>
        )}

        {/* Bento ring */}
        <div
          className="rounded-2xl p-4 space-y-4"
          style={{
            border: "1px solid hsl(142 71% 45% / 0.15)",
            background: "hsl(142 71% 45% / 0.04)",
            animation: "dash-fade-up 400ms ease 50ms both",
          }}
        >
          {isLoading ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SkeletonBlock className="min-h-[280px]" />
                <SkeletonBlock className="min-h-[280px]" />
              </div>
              <SkeletonBlock className="min-h-[460px]" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SkeletonBlock className="min-h-[520px]" />
                <SkeletonBlock className="min-h-[520px]" />
              </div>
              <SkeletonBlock className="min-h-[420px]" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SkeletonBlock className="min-h-[320px]" />
                <SkeletonBlock className="min-h-[320px]" />
              </div>
              <SkeletonBlock className="min-h-[160px]" />
            </>
          ) : data ? (
            <>
              {/* Row 1: Stage Funnel | Whitespace Opportunity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SectionPanel
                  icon={GitBranch}
                  title="Pre-Commercial Pipeline"
                  subtitle="Stage distribution across all relevant TTO assets. Indexed by ingestion date."
                  delay={60}
                  className="min-h-[280px]"
                >
                  <StageFunnelPanel data={data.stageFunnel} />
                </SectionPanel>

                <SectionPanel
                  icon={Crosshair}
                  title="White Space Finder"
                  subtitle="High unmet need × low asset density = opportunity. Click any row to explore."
                  delay={80}
                  className="min-h-[280px]"
                >
                  <WhiteSpaceFinderPanel
                    data={data.whitespaceOpportunity}
                    onRowClick={(biology, count) =>
                      setDrawerCtx({ type: "biology", biology, count })
                    }
                  />
                </SectionPanel>
              </div>

              {/* Row 2: Therapeutic Whitespace heatmap — full width */}
              <SectionPanel
                icon={Layers}
                title="Therapeutic Whitespace"
                subtitle={`Biology × modality density ${forLabel(rangeOpt)}. Non-therapeutic modalities excluded. Darker = more assets, dashed = gap.`}
                delay={100}
                className="min-h-[460px]"
              >
                <WhitespacePanel
                  matrix={data.whitespaceMatrix}
                  onCellClick={(bio, mod, count, framing) =>
                    setDrawerCtx({ type: "whitespace", biology: bio, modality: mod, count, framing })
                  }
                  setTooltip={setTooltip}
                />
              </SectionPanel>

              {/* Row 3: Rising Assets | Institution Pipeline */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SectionPanel
                  icon={Zap}
                  title="Rising Assets"
                  subtitle="Top assets by momentum signal — recent stage changes, content updates, and new discoveries."
                  delay={120}
                  className="min-h-[520px]"
                >
                  <RisingAssetsPanel data={data.risingAssets} />
                </SectionPanel>

                <SectionPanel
                  icon={Building2}
                  title="Institution Pipeline Depth"
                  subtitle="Top 10 institutions by total assets — stage distribution shows pipeline maturity. Click to explore."
                  delay={140}
                  className="min-h-[520px]"
                >
                  <InstitutionPipelinePanel
                    data={data.institutionPipeline}
                    onRowClick={(institution, total) =>
                      setDrawerCtx({ type: "institution", institution, count: total })
                    }
                  />
                </SectionPanel>
              </div>

              {/* Row 4: Biology | Modality */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SectionPanel
                  icon={Dna}
                  title="Biology Landscape"
                  subtitle={`Top biology drivers ${forLabel(rangeOpt)}`}
                  delay={160}
                >
                  <BiologyLandscapePanel
                    data={data.biologyLandscape}
                    onRowClick={(entry) =>
                      setDrawerCtx({ type: "biology", biology: entry.biology, count: entry.count })
                    }
                  />
                </SectionPanel>

                <SectionPanel
                  icon={TrendingUp}
                  title="Modality Momentum"
                  subtitle={range !== "all" ? `Assets by modality ${forLabel(rangeOpt)}` : "All assets by modality — non-therapeutic categories excluded"}
                  delay={180}
                >
                  <ModalityMomentumPanel
                    data={data.modalityMomentum}
                    recentDeltaWindow={data.recentDeltaWindow}
                    onRowClick={(entry) =>
                      setDrawerCtx({ type: "modality", modality: entry.modality, count: entry.total })
                    }
                  />
                </SectionPanel>
              </div>

              {/* Row 5: Weekly Velocity — full width, compact */}
              <SectionPanel
                icon={Activity}
                title="Weekly Velocity"
                subtitle="New assets indexed per week. Click any bar to explore that week's additions."
                delay={200}
                className="min-h-[160px]"
              >
                <WeeklyVelocityPanel
                  data={data.weeklyTrend}
                  totalIndexed={data.totalAssetsIndexed}
                  onBarClick={(after, before, weekLabel, count) =>
                    setDrawerCtx({ type: "weekly", after, before, weekLabel, count })
                  }
                  setTooltip={setTooltip}
                />
              </SectionPanel>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
