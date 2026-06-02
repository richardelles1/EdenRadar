import { useState, useMemo, useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Building2, ExternalLink, FlaskConical, RefreshCw,
  ShieldOff, ChevronDown, ArrowUpDown, Dna, TrendingUp, X,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { IngestedAsset } from "@shared/schema";
import type { InstitutionsListResponse, InstitutionProfile } from "@/lib/institutions";

import {
  detectModality, detectStage, computeCommercialScore, formatRelativeTime,
} from "@/lib/titleSignals";
import { PipelinePicker, type PipelinePickerPayload } from "@/components/PipelinePicker";

// ── Stage & Biology config ────────────────────────────────────────────────────

// Stage chip classes encode maturity: neutral (early) → emerald (clinical) → primary (approved)
const STAGE_COLORS: Record<string, string> = {
  "discovery":   "bg-muted/80 text-muted-foreground",
  "preclinical": "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400",
  "phase 1":     "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-500",
  "phase 2":     "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-400",
  "phase 3":     "bg-emerald-200/80 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  "approved":    "bg-primary/15 text-primary",
};

const STAGE_ORDER = ["discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved"];

// Donut fill colors: solid emerald lightness ladder — light=early, dark=approved
const STAGE_DONUT_FILL: Record<string, string> = {
  "discovery":   "#6ee7b7",
  "preclinical": "#34d399",
  "phase 1":     "#10b981",
  "phase 2":     "#059669",
  "phase 3":     "#047857",
  "approved":    "#065f46",
};

// Biology chips are categorical labels — hierarchy comes from the bar, not chip color
const BIOLOGY_CHIP = "bg-muted/80 text-foreground/70 border-border/60";

type SortMode = "newest" | "commercial" | "az" | "za";

// ── Drawer types ──────────────────────────────────────────────────────────────

type DrawerFilter =
  | { type: "biology"; label: string }
  | { type: "stage"; stage: string }
  | { type: "indication"; indication: string }
  | { type: "asset"; asset: IngestedAsset }
  | null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/_/g, " ").trim();
}

// ── ScoreBadge ────────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 75 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
    score >= 55 ? "bg-primary/15 text-primary border-primary/20" :
    score >= 35 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" :
                  "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`text-[11px] font-bold px-2 py-0.5 rounded-full border tabular-nums ${color}`}
      data-testid="badge-commercial-score"
    >
      {score}
    </span>
  );
}

// ── AssetRow ──────────────────────────────────────────────────────────────────

function AssetRow({ asset, index, savedIngestedIds, onOpen }: {
  asset: IngestedAsset;
  index: number;
  savedIngestedIds: Set<number>;
  onOpen: (asset: IngestedAsset) => void;
}) {
  const modality = detectModality(asset.assetName);
  const stage = detectStage(asset.assetName, asset.developmentStage);
  const score = computeCommercialScore(asset);
  const isSaved = savedIngestedIds.has(asset.id);

  const pickerPayload: PipelinePickerPayload = {
    asset_name: asset.assetName,
    target: asset.target || "unknown",
    modality: modality || asset.modality || "unknown",
    development_stage: stage || asset.developmentStage || "unknown",
    disease_indication: asset.indication || "unknown",
    summary: asset.summary || "",
    source_title: asset.assetName,
    source_journal: asset.institution,
    publication_year: "",
    source_name: asset.sourceName || "tech_transfer",
    source_url: asset.sourceUrl ?? null,
    ingested_asset_id: asset.id,
  };

  return (
    <div
      className="flex items-center gap-3 p-3.5 rounded-lg border border-card-border bg-card cursor-pointer transition-colors hover:border-primary/25 hover:bg-accent/20"
      onClick={() => onOpen(asset)}
      data-testid={`asset-listing-${index}`}
    >
      <FlaskConical className="w-4 h-4 text-primary/60 shrink-0" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate leading-snug">
          {asset.assetName}
        </p>
        {modality && (
          <span className="text-[10px] text-muted-foreground">{modality}</span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        <PipelinePicker payload={pickerPayload} alreadySaved={isSaved} />
        {stage && (
          <span
            className={`hidden sm:inline text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
              STAGE_COLORS[stage.toLowerCase()] ?? "bg-muted text-muted-foreground"
            }`}
            data-testid={`badge-stage-${index}`}
          >
            {stage}
          </span>
        )}
        <ScoreBadge score={score} />
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" />
      </div>
    </div>
  );
}

// ── ResearchDnaPanel ──────────────────────────────────────────────────────────

function ResearchDnaPanel({
  profile,
  loading,
  onBiologyClick,
  onStageClick,
  onIndicationClick,
  onAssetClick,
  rawAssets,
}: {
  profile: InstitutionProfile | null;
  loading: boolean;
  onBiologyClick?: (label: string) => void;
  onStageClick?: (stage: string) => void;
  onIndicationClick?: (indication: string) => void;
  onAssetClick?: (asset: IngestedAsset) => void;
  rawAssets?: IngestedAsset[];
}) {
  const hasBiology    = (profile?.biologyBreakdown?.length ?? 0) > 0;
  const hasStage      = (profile?.stageBreakdown?.length ?? 0) > 0;
  const hasIndications = (profile?.topIndications?.length ?? 0) > 0;
  const hasStandout   = (profile?.standoutAssets?.length ?? 0) > 0;
  const hasAny        = hasBiology || hasStage || hasIndications || hasStandout;

  const maxBiologyCnt = profile?.biologyBreakdown?.[0]?.count ?? 1;
  const totalStageCnt = profile?.stageBreakdown?.reduce((s, r) => s + r.count, 0) ?? 1;

  const sortedStages = profile?.stageBreakdown
    ? [...profile.stageBreakdown].sort((a, b) => {
        const ai = STAGE_ORDER.indexOf(a.stage?.toLowerCase() ?? "");
        const bi = STAGE_ORDER.indexOf(b.stage?.toLowerCase() ?? "");
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      })
    : [];

  const panelHeader = (
    <div
      className="px-5 py-3.5 flex items-center gap-2"
      style={{ background: "linear-gradient(135deg, hsl(142 65% 36%) 0%, hsl(142 55% 27%) 100%)" }}
    >
      <Dna className="w-4 h-4 shrink-0" style={{ color: "hsl(0 0% 100% / 0.85)" }} />
      <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: "hsl(0 0% 100% / 0.97)" }}>
        Portfolio Profile
      </h2>
    </div>
  );

  if (!loading && !hasAny) {
    return (
      <div className="rounded-xl border border-card-border overflow-hidden" data-testid="research-dna-panel">
        {panelHeader}
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground/60 italic">
            No portfolio data indexed yet. Run a scan to build this institution&apos;s intelligence profile.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-card-border overflow-hidden" data-testid="research-dna-panel">
      {panelHeader}

      <div className="bg-card p-5 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Biology Drivers — proportional chip cloud */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Biology Drivers</p>
            {loading ? (
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-7 rounded-full" style={{ width: `${60 + i * 18}px` }} />)}
              </div>
            ) : hasBiology ? (
              <div className="flex flex-wrap gap-2 items-start">
                {profile!.biologyBreakdown.map((b, i) => {
                  const scale = b.count / maxBiologyCnt;
                  const fs = Math.round(10 + scale * 5);
                  const px = Math.round(8 + scale * 6);
                  const py = Math.round(3 + scale * 4);
                  return (
                    <button
                      key={b.label}
                      onClick={() => onBiologyClick?.(b.label)}
                      className="rounded-full border border-primary/25 bg-primary/5 hover:bg-primary/15 hover:border-primary/50 text-foreground/80 hover:text-foreground transition-all"
                      style={{ fontSize: `${fs}px`, padding: `${py}px ${px}px`, lineHeight: 1.35 }}
                      data-testid={`biology-bar-${i}`}
                    >
                      {b.label}
                      <span className="opacity-35 ml-1.5" style={{ fontSize: "9px" }}>{b.count}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/60 italic">No biology data yet</p>
            )}
          </div>

          {/* Stage Mix — donut */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stage Mix</p>
            {loading ? (
              <div className="flex justify-center py-4">
                <Skeleton className="h-44 w-44 rounded-full" />
              </div>
            ) : hasStage ? (
              <div className="flex flex-col items-center gap-3">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={sortedStages}
                      dataKey="count"
                      nameKey="stage"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={88}
                      paddingAngle={2}
                      strokeWidth={0}
                      onClick={(entry) => onStageClick?.(entry.stage ?? "")}
                      style={{ cursor: "pointer" }}
                    >
                      {sortedStages.map((s) => {
                        const key = s.stage?.toLowerCase() ?? "";
                        return (
                          <Cell key={s.stage ?? key} fill={STAGE_DONUT_FILL[key] ?? "#34d399"} />
                        );
                      })}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        const pct = Math.round((d.count / totalStageCnt) * 100);
                        return (
                          <div className="text-xs bg-popover border border-border rounded-md px-3 py-2 shadow-md">
                            <span className="font-semibold text-foreground capitalize">{d.stage}</span>
                            <span className="text-muted-foreground ml-2">{d.count} · {pct}%</span>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center">
                  {sortedStages.map((s) => {
                    const key = s.stage?.toLowerCase() ?? "";
                    const fill = STAGE_DONUT_FILL[key] ?? "#34d399";
                    const pct = Math.round((s.count / totalStageCnt) * 100);
                    return (
                      <button
                        key={s.stage}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => onStageClick?.(s.stage ?? "")}
                        data-testid={`stage-bar-${key}`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: fill }} />
                        <span className="capitalize">{s.stage}</span>
                        <span className="tabular-nums opacity-50">{pct}%</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/60 italic">No stage data yet</p>
            )}
          </div>
        </div>

        {(hasIndications || hasStandout || loading) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-card-border/60">
            {/* Top Indications */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Indication Focus</p>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-3/4 rounded" />)}
                </div>
              ) : hasIndications ? (
                <ul className="space-y-1.5">
                  {profile!.topIndications.map((ind, i) => (
                    <li
                      key={ind}
                      className="flex items-center gap-2 text-sm text-foreground rounded-md p-1 -mx-1 cursor-pointer hover:bg-accent/40 transition-colors"
                      onClick={() => onIndicationClick?.(ind)}
                      data-testid={`indication-${i}`}
                    >
                      <span className="w-4 h-4 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      {ind}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground/60 italic">No indication data yet</p>
              )}
            </div>

            {/* Standout Assets */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Standout Assets</p>
              </div>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
                </div>
              ) : hasStandout ? (
                <div className="space-y-2">
                  {profile!.standoutAssets.map((a) => {
                    const fullAsset = rawAssets?.find((r) => r.id === a.id);
                    return (
                      <div
                        key={a.id}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-card-border bg-background hover:border-primary/30 transition-colors group cursor-pointer"
                        data-testid={`standout-asset-${a.id}`}
                        onClick={() => fullAsset ? onAssetClick?.(fullAsset) : window.open(`/asset/${a.id}`, "_self")}
                      >
                        <span className="text-sm text-foreground truncate group-hover:text-primary transition-colors leading-snug">
                          {a.assetName}
                        </span>
                        <span className="text-xs font-bold tabular-nums text-primary shrink-0 bg-primary/10 px-2 py-0.5 rounded-full">
                          {Math.round(a.completenessScore)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/60 italic">No enriched assets yet</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CategoryDrawer ────────────────────────────────────────────────────────────

function DrawerAssetCard({ asset }: { asset: IngestedAsset }) {
  const modality = detectModality(asset.assetName);
  const stage    = detectStage(asset.assetName, asset.developmentStage);
  const score    = computeCommercialScore(asset);
  return (
    <div className="p-3 rounded-lg border border-border bg-background space-y-2">
      <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2">
        {asset.assetName}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        {modality && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted/80 text-muted-foreground">
            {modality}
          </span>
        )}
        {stage && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STAGE_COLORS[stage.toLowerCase()] ?? "bg-muted text-muted-foreground"}`}>
            {stage}
          </span>
        )}
        <span className="ml-auto"><ScoreBadge score={score} /></span>
      </div>
      <div className="flex items-center gap-3 pt-0.5">
        <Link
          href={`/asset/${asset.id}`}
          className="text-[11px] font-medium text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Full dossier →
        </Link>
        {asset.sourceUrl && (
          <a
            href={asset.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-2.5 h-2.5" />TTO source
          </a>
        )}
      </div>
      {asset.summary && (
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3 border-t border-border/60 pt-2">
          {asset.summary}
        </p>
      )}
    </div>
  );
}

function CategoryDrawer({
  filter,
  assets,
  onClose,
}: {
  filter: NonNullable<DrawerFilter>;
  assets: IngestedAsset[];
  onClose: () => void;
}) {
  const isSingle = filter.type === "asset";

  const title =
    filter.type === "biology"    ? filter.label :
    filter.type === "stage"      ? `${filter.stage} stage` :
    filter.type === "asset"      ? filter.asset.assetName :
                                   filter.indication;

  const subtitle =
    filter.type === "biology"    ? "Biology-matched assets" :
    filter.type === "stage"      ? "Assets at this development stage" :
    filter.type === "asset"      ? "Asset details" :
                                   "Assets targeting this indication";

  const displayAssets = isSingle ? [filter.asset] : assets;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/25 z-40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        className="fixed right-0 top-0 h-full w-[460px] max-w-full bg-card border-l border-border z-50 flex flex-col shadow-2xl"
        style={{ animation: "slide-in-right 220ms ease both" }}
      >
        {/* Drawer header */}
        <div className="flex items-start justify-between p-5 border-b border-border shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{subtitle}</p>
            <h3 className="text-sm font-bold text-foreground leading-tight capitalize line-clamp-2">{title}</h3>
            {!isSingle && (
              <p className="text-[10px] text-muted-foreground mt-1">
                {displayAssets.length} asset{displayAssets.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Asset list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {displayAssets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center px-4">
              <p className="text-sm text-muted-foreground">No assets matched in this category.</p>
              <p className="text-xs text-muted-foreground/60">
                Assets may not be enriched yet — run an enrich pass to populate category data.
              </p>
            </div>
          ) : (
            displayAssets.map((asset) => (
              <DrawerAssetCard key={asset.id} asset={asset} />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 rounded-lg text-sm font-medium text-muted-foreground border border-border hover:text-foreground hover:border-foreground/20 transition-all"
          >
            Back to profile
          </button>
        </div>
      </div>
    </>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SavedAssetsResponse = { assets: Array<{ ingestedAssetId: number | null }> };

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InstitutionDetail() {
  const { slug } = useParams<{ slug: string }>();
  const PAGE_SIZE = 20;
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [search, setSearch] = useState("");
  const [drawerFilter, setDrawerFilter] = useState<DrawerFilter>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: instListData } = useQuery<InstitutionsListResponse>({
    queryKey: ["/api/institutions"],
    staleTime: 5 * 60 * 1000,
  });
  const inst = instListData?.institutions.find((i) => i.slug === slug);

  const { data, isLoading } = useQuery<{ assets: IngestedAsset[]; institution: string }>({
    queryKey: ["/api/institutions", slug, "assets"],
    queryFn: () => fetch(`/api/institutions/${slug}/assets`).then((r) => r.json()),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  const { data: profile, isLoading: profileLoading } = useQuery<InstitutionProfile>({
    queryKey: ["/api/institutions", slug, "profile"],
    queryFn: () => fetch(`/api/institutions/${slug}/profile`).then((r) => r.json()),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  const { data: savedData } = useQuery<SavedAssetsResponse>({
    queryKey: ["/api/saved-assets"],
    staleTime: 30000,
  });
  const savedIngestedIds = new Set(
    (savedData?.assets ?? []).map((a) => a.ingestedAssetId).filter((id): id is number => id != null)
  );

  const slugTitle = slug
    ? slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
    : "Unknown Institution";

  const rawAssets = data?.assets ?? [];
  const isBlocked = inst?.accessRestricted ?? false;

  // Filter assets client-side based on what was clicked in the DNA panel
  const drawerAssets = useMemo(() => {
    if (!drawerFilter || !rawAssets.length) return [];
    if (drawerFilter.type === "biology") {
      const norm = normalizeLabel(drawerFilter.label);
      return rawAssets.filter((a) => normalizeLabel(a.biology ?? "") === norm);
    }
    if (drawerFilter.type === "stage") {
      const norm = drawerFilter.stage.toLowerCase();
      return rawAssets.filter((a) => detectStage(a.assetName, a.developmentStage)?.toLowerCase() === norm);
    }
    if (drawerFilter.type === "indication") {
      const norm = drawerFilter.indication.toLowerCase().trim();
      return rawAssets.filter((a) => (a.indication ?? "").toLowerCase().trim() === norm);
    }
    return [];
  }, [drawerFilter, rawAssets]);

  const filtered = search.trim()
    ? rawAssets.filter((a) => a.assetName.toLowerCase().includes(search.toLowerCase()))
    : rawAssets;

  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === "newest")     return new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime();
    if (sortMode === "commercial") return computeCommercialScore(b) - computeCommercialScore(a);
    if (sortMode === "az")         return a.assetName.localeCompare(b.assetName);
    if (sortMode === "za")         return b.assetName.localeCompare(a.assetName);
    return 0;
  });

  // Reset pagination when search or sort changes
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, sortMode]);

  const activeCount = isLoading ? null : rawAssets.length;

  const SORT_OPTIONS: { value: SortMode; label: string }[] = [
    { value: "newest",     label: "Newest First" },
    { value: "commercial", label: "Top Scoring" },
    { value: "az",         label: "A → Z" },
    { value: "za",         label: "Z → A" },
  ];

  return (
    <div className="min-h-full">
      <style>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
      {/* ── Header ── */}
      <div className="border-b border-border bg-card/30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
          <Link href="/institutions">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-xs text-muted-foreground hover:text-foreground -ml-2 mb-4"
              data-testid="button-back-institutions"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              All Institutions
            </Button>
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-foreground">{inst?.name ?? slugTitle}</h1>
                  {!inst && (
                    <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-0">
                      Not in directory
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <p className="text-sm text-muted-foreground">
                    {inst
                      ? [inst.city, inst.ttoName].filter(Boolean).join(" · ") || "Indexed by EdenRadar"
                      : "Institution not in curated directory"}
                  </p>
                  {(profile?.totalAssets ?? activeCount ?? 0) > 0 && (
                    <span className="text-sm text-muted-foreground/60">
                      · {(profile?.totalAssets ?? activeCount!).toLocaleString()} assets
                    </span>
                  )}
                </div>
                {inst?.specialties && inst.specialties.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {inst.specialties.map((s) => (
                      <Badge
                        key={s}
                        variant="outline"
                        className={`text-[10px] font-medium px-1.5 py-0.5 ${BIOLOGY_CHIP}`}
                      >
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {inst?.website && (
                <a href={inst.website} target="_blank" rel="noopener noreferrer">
                  <Button
                    variant="outline"
                    className="gap-2 border-card-border"
                    data-testid="button-view-tto-site"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View TTO Site
                  </Button>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Research DNA — first, every bar and indication is clickable */}
        <ResearchDnaPanel
          profile={profile ?? null}
          loading={profileLoading}
          rawAssets={rawAssets}
          onBiologyClick={(label) => setDrawerFilter({ type: "biology", label })}
          onStageClick={(stage) => setDrawerFilter({ type: "stage", stage })}
          onIndicationClick={(indication) => setDrawerFilter({ type: "indication", indication })}
          onAssetClick={(asset) => setDrawerFilter({ type: "asset", asset })}
        />

        {/* Active Listings */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Active Listings</h2>
            {rawAssets.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter listings…"
                  className="h-7 text-xs px-3 rounded-md border border-card-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 w-40"
                  data-testid="input-filter-listings"
                />
                <div className="flex items-center gap-1">
                  <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setSortMode(opt.value)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                        sortMode === opt.value
                          ? "border-primary bg-primary/15 text-primary font-semibold"
                          : "border-card-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30"
                      }`}
                      data-testid={`sort-${opt.value}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : rawAssets.length === 0 && isBlocked ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <ShieldOff className="w-8 h-8 text-amber-500/60" />
              <p className="text-sm font-medium text-foreground">Access Restricted</p>
              <p className="text-xs text-muted-foreground/70 max-w-sm">
                This institution&apos;s website blocks automated access from cloud hosting providers.
                Listings cannot be indexed automatically.
              </p>
              {inst?.website && (
                <a
                  href={inst.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Visit TTO website directly →
                </a>
              )}
            </div>
          ) : rawAssets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <RefreshCw className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No listings indexed yet</p>
              <p className="text-xs text-muted-foreground/70">
                Run a scan from the Scout page to pull real listings from this TTO.
              </p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-sm text-muted-foreground">No listings match &ldquo;{search}&rdquo;</p>
              <button
                onClick={() => setSearch("")}
                className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
              >
                <X className="w-3 h-3" />Clear filter
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.slice(0, visibleCount).map((asset, i) => (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  index={i}
                  savedIngestedIds={savedIngestedIds}
                  onOpen={(a) => setDrawerFilter({ type: "asset", asset: a })}
                />
              ))}
              {sorted.length > visibleCount && (
                <button
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="w-full py-2.5 text-xs font-medium text-muted-foreground border border-dashed border-border rounded-lg hover:text-foreground hover:border-border/80 transition-colors"
                  data-testid="button-load-more-assets"
                >
                  Show {Math.min(PAGE_SIZE, sorted.length - visibleCount)} more
                  <span className="text-muted-foreground/60 ml-1">({sorted.length - visibleCount} remaining)</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Category Drawer ── */}
      {drawerFilter && (
        <CategoryDrawer
          filter={drawerFilter}
          assets={drawerAssets}
          onClose={() => setDrawerFilter(null)}
        />
      )}
    </div>
  );
}
