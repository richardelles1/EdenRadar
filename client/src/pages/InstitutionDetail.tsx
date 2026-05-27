import { useState, useMemo } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Building2, ExternalLink, FlaskConical, RefreshCw,
  ShieldOff, ChevronDown, ChevronUp, ArrowUpDown, Dna, TrendingUp, X,
} from "lucide-react";
import type { IngestedAsset } from "@shared/schema";
import type { InstitutionsListResponse, InstitutionProfile } from "@/lib/institutions";
import { TtoContactCard } from "@/components/TtoContactCard";
import {
  detectModality, detectStage, computeCommercialScore, formatRelativeTime,
} from "@/lib/titleSignals";
import { PipelinePicker, type PipelinePickerPayload } from "@/components/PipelinePicker";

const ACCENT = "hsl(142 71% 45%)";

// ── Stage & Biology config ────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  "discovery":   "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  "preclinical": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "phase 1":     "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  "phase 2":     "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  "phase 3":     "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "approved":    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

const STAGE_ORDER = ["discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved"];

const STAGE_BAR_COLORS: Record<string, string> = {
  "discovery":   "bg-violet-500",
  "preclinical": "bg-amber-500",
  "phase 1":     "bg-cyan-500",
  "phase 2":     "bg-sky-500",
  "phase 3":     "bg-blue-500",
  "approved":    "bg-emerald-500",
};

const BIOLOGY_COLORS = [
  "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20",
  "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20",
  "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20",
  "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  "bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/20",
  "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20",
];

type SortMode = "newest" | "commercial" | "az" | "za";

// ── Drawer types ──────────────────────────────────────────────────────────────

type DrawerFilter =
  | { type: "biology"; label: string }
  | { type: "stage"; stage: string }
  | { type: "indication"; indication: string }
  | null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCategories(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p.map(String) : []; }
    catch { return [raw]; }
  }
  return [];
}

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

function AssetRow({ asset, index, savedIngestedIds }: {
  asset: IngestedAsset;
  index: number;
  savedIngestedIds: Set<number>;
}) {
  const [expanded, setExpanded] = useState(false);

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
      className="rounded-lg border border-card-border bg-card transition-colors hover:border-primary/20"
      data-testid={`asset-listing-${index}`}
    >
      <div
        className="flex items-center gap-3 p-4 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        data-testid={`asset-row-toggle-${index}`}
      >
        <FlaskConical className="w-4 h-4 text-primary shrink-0" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate leading-snug">
            {asset.assetName}
          </p>
          {modality && (
            <span className="text-[10px] text-primary/70 font-medium">{modality}</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <PipelinePicker payload={pickerPayload} alreadySaved={isSaved} />

          {stage && (
            <span
              className={`hidden sm:inline text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                STAGE_COLORS[stage.toLowerCase()] ?? "bg-muted text-muted-foreground"
              }`}
              data-testid={`badge-stage-${index}`}
            >
              {stage}
            </span>
          )}
          <ScoreBadge score={score} />
          <Link
            href={`/asset/${asset.id}`}
            className="hidden sm:inline text-[11px] font-medium text-primary hover:underline"
            data-testid={`link-dossier-header-${index}`}
          >
            Dossier →
          </Link>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          }
        </div>
      </div>

      {expanded && (
        <div
          className="px-4 pb-4 pt-0 border-t border-card-border/60 space-y-3"
          data-testid={`asset-detail-${index}`}
        >
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
            <div>
              <dt className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Modality</dt>
              <dd className="text-xs text-foreground mt-0.5">{modality ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Stage</dt>
              <dd className="text-xs text-foreground mt-0.5">{stage ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">First Indexed</dt>
              <dd className="text-xs text-foreground mt-0.5">{formatRelativeTime(asset.firstSeenAt)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Commercial Score</dt>
              <dd className="text-xs font-bold text-foreground mt-0.5">{score} / 100</dd>
            </div>
          </dl>

          {asset.developmentStage && asset.developmentStage !== "unknown" && (
            <div>
              <dt className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">DB Stage</dt>
              <dd className="text-xs text-foreground mt-0.5">{asset.developmentStage}</dd>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href={`/asset/${asset.id}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              data-testid={`link-dossier-${index}`}
              onClick={(e) => e.stopPropagation()}
            >
              Dossier →
            </Link>
            {asset.sourceUrl && (
              <a
                href={asset.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary hover:underline"
                data-testid={`link-view-tto-${index}`}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-3 h-3" />
                Open at TTO →
              </a>
            )}
          </div>
        </div>
      )}
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
}: {
  profile: InstitutionProfile | null;
  loading: boolean;
  onBiologyClick?: (label: string) => void;
  onStageClick?: (stage: string) => void;
  onIndicationClick?: (indication: string) => void;
}) {
  const hasBiology    = (profile?.biologyBreakdown?.length ?? 0) > 0;
  const hasStage      = (profile?.stageBreakdown?.length ?? 0) > 0;
  const hasIndications = (profile?.topIndications?.length ?? 0) > 0;
  const hasStandout   = (profile?.standoutAssets?.length ?? 0) > 0;
  const hasAny        = hasBiology || hasStage || hasIndications || hasStandout;

  if (!loading && !hasAny) {
    return (
      <div className="rounded-xl border border-card-border bg-card p-5" data-testid="research-dna-panel">
        <div className="flex items-center gap-2 mb-3">
          <Dna className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Research DNA</h2>
        </div>
        <p className="text-xs text-muted-foreground/60 italic">
          No portfolio data indexed yet. Run a scan to build this institution&apos;s intelligence profile.
        </p>
      </div>
    );
  }

  const maxBiologyCnt = profile?.biologyBreakdown?.[0]?.count ?? 1;
  const totalStageCnt = profile?.stageBreakdown?.reduce((s, r) => s + r.count, 0) ?? 1;

  const sortedStages = profile?.stageBreakdown
    ? [...profile.stageBreakdown].sort((a, b) => {
        const ai = STAGE_ORDER.indexOf(a.stage?.toLowerCase() ?? "");
        const bi = STAGE_ORDER.indexOf(b.stage?.toLowerCase() ?? "");
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      })
    : [];

  return (
    <div className="rounded-xl border border-card-border bg-card p-5 space-y-5" data-testid="research-dna-panel">
      <div className="flex items-center gap-2">
        <Dna className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Research DNA</h2>
        {!loading && hasAny && (
          <span className="text-[10px] text-muted-foreground/60 ml-auto">
            Click any item to see assets
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Biology Drivers */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Biology Drivers</p>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full rounded" />)}
            </div>
          ) : hasBiology ? (
            <div className="space-y-1.5">
              {profile!.biologyBreakdown.map((b, i) => (
                <div
                  key={b.label}
                  className="flex items-center gap-2 rounded-md p-1 -mx-1 cursor-pointer hover:bg-accent/40 group transition-colors"
                  onClick={() => onBiologyClick?.(b.label)}
                  data-testid={`biology-bar-${i}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border transition-all group-hover:ring-1 group-hover:ring-primary/30 ${BIOLOGY_COLORS[i % BIOLOGY_COLORS.length]}`}>
                        {b.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums ml-2 shrink-0">{b.count}</span>
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/40 transition-all"
                        style={{ width: `${Math.round((b.count / maxBiologyCnt) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 italic">No biology data yet</p>
          )}
        </div>

        {/* Stage Distribution */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Stage Mix</p>
          {loading ? (
            <div className="space-y-1.5">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full rounded" />)}
            </div>
          ) : hasStage ? (
            <div className="space-y-1.5">
              {sortedStages.map((s) => {
                const key = s.stage?.toLowerCase() ?? "";
                const pct = Math.round((s.count / totalStageCnt) * 100);
                const barColor = STAGE_BAR_COLORS[key] ?? "bg-muted-foreground/40";
                const labelColor = STAGE_COLORS[key] ?? "bg-muted text-muted-foreground";
                return (
                  <div
                    key={s.stage}
                    className="flex items-center gap-2 rounded-md p-1 -mx-1 cursor-pointer hover:bg-accent/40 group transition-colors"
                    onClick={() => onStageClick?.(s.stage ?? "")}
                    data-testid={`stage-bar-${key}`}
                  >
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 transition-all group-hover:ring-1 group-hover:ring-primary/30 ${labelColor}`}>
                      {s.stage}
                    </span>
                    <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{s.count}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 italic">No stage data yet</p>
          )}
        </div>
      </div>

      {(hasIndications || hasStandout || loading) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-3 border-t border-card-border/60">
          {/* Top Indications */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Indication Focus</p>
            {loading ? (
              <div className="space-y-1.5">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-4 w-3/4 rounded" />)}
              </div>
            ) : hasIndications ? (
              <ul className="space-y-1">
                {profile!.topIndications.map((ind, i) => (
                  <li
                    key={ind}
                    className="flex items-center gap-1.5 text-xs text-foreground rounded-md p-1 -mx-1 cursor-pointer hover:bg-accent/40 transition-colors"
                    onClick={() => onIndicationClick?.(ind)}
                    data-testid={`indication-${i}`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    {ind}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground/60 italic">No indication data yet</p>
            )}
          </div>

          {/* Standout Assets */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3 text-muted-foreground" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Standout Assets</p>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
              </div>
            ) : hasStandout ? (
              <div className="space-y-1.5">
                {profile!.standoutAssets.map((a) => (
                  <Link
                    key={a.id}
                    href={`/asset/${a.id}`}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg border border-card-border bg-background hover:border-primary/30 transition-colors group"
                    data-testid={`standout-asset-${a.id}`}
                  >
                    <span className="text-xs text-foreground truncate group-hover:text-primary transition-colors leading-snug">
                      {a.assetName}
                    </span>
                    <span className="text-[10px] font-bold tabular-nums text-primary shrink-0 bg-primary/10 px-1.5 py-0.5 rounded-full">
                      {Math.round(a.completenessScore)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/60 italic">No enriched assets yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CategoryDrawer ────────────────────────────────────────────────────────────

function CategoryDrawer({
  filter,
  assets,
  onClose,
}: {
  filter: NonNullable<DrawerFilter>;
  assets: IngestedAsset[];
  onClose: () => void;
}) {
  const title =
    filter.type === "biology"    ? filter.label :
    filter.type === "stage"      ? `${filter.stage} stage` :
                                   filter.indication;

  const subtitle =
    filter.type === "biology"    ? "Biology-matched assets from this institution" :
    filter.type === "stage"      ? "Assets at this development stage" :
                                   "Assets targeting this indication";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/25 z-40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        className="fixed right-0 top-0 h-full w-[440px] max-w-full bg-card border-l border-border z-50 flex flex-col shadow-2xl"
        style={{ animation: "slide-in-right 220ms ease both" }}
      >
        {/* Drawer header */}
        <div className="flex items-start justify-between p-5 border-b border-border shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <h3 className="text-sm font-bold text-foreground leading-tight capitalize">{title}</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">{subtitle}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {assets.length} asset{assets.length !== 1 ? "s" : ""}
            </p>
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
          {assets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center px-4">
              <p className="text-sm text-muted-foreground">No assets matched in this category.</p>
              <p className="text-xs text-muted-foreground/60">
                Assets may not be enriched yet — run an enrich pass to populate category data.
              </p>
            </div>
          ) : (
            assets.map((asset) => {
              const modality = detectModality(asset.assetName);
              const stage    = detectStage(asset.assetName, asset.developmentStage);
              const score    = computeCommercialScore(asset);
              return (
                <Link key={asset.id} href={`/asset/${asset.id}`}>
                  <div className="group p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-accent/20 transition-all cursor-pointer">
                    <p className="text-xs font-medium text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                      {asset.assetName}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {modality && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: "hsl(142 71% 45% / 0.10)", color: "hsl(142 71% 32%)" }}
                        >
                          {modality}
                        </span>
                      )}
                      {stage && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STAGE_COLORS[stage.toLowerCase()] ?? "bg-muted text-muted-foreground"}`}>
                          {stage}
                        </span>
                      )}
                      <span className="ml-auto">
                        <ScoreBadge score={score} />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* Footer CTA */}
        <div className="p-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: "hsl(142 71% 45% / 0.12)", color: ACCENT }}
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
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [search, setSearch] = useState("");
  const [drawerFilter, setDrawerFilter] = useState<DrawerFilter>(null);

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
      return rawAssets.filter((a) => {
        const cats = parseCategories((a as unknown as Record<string, unknown>).categories);
        return cats.some((c) => normalizeLabel(c) === norm);
      });
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

  const activeCount = isLoading ? null : rawAssets.length;

  const SORT_OPTIONS: { value: SortMode; label: string }[] = [
    { value: "newest",     label: "Newest First" },
    { value: "commercial", label: "Best Commercial" },
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
                  {activeCount !== null && activeCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-0">
                      {activeCount} listings
                    </Badge>
                  )}
                </div>
                {inst?.specialties && inst.specialties.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {inst.specialties.map((s) => (
                      <Badge
                        key={s}
                        variant="secondary"
                        className="text-[10px] font-medium bg-primary/8 text-primary/80 border-0 px-2 py-0.5"
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
              <TtoContactCard institution={inst?.name ?? slugTitle} compact className="max-w-xs" />
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
          onBiologyClick={(label) => setDrawerFilter({ type: "biology", label })}
          onStageClick={(stage) => setDrawerFilter({ type: "stage", stage })}
          onIndicationClick={(indication) => setDrawerFilter({ type: "indication", indication })}
        />

        {/* Active Listings */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Active Listings</h2>
              {activeCount !== null && activeCount > 0 && (
                <Badge variant="secondary" className="text-[11px] bg-primary/10 text-primary border-0">
                  {activeCount} listings
                </Badge>
              )}
            </div>
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
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">No listings match &ldquo;{search}&rdquo;</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map((asset, i) => (
                <AssetRow key={asset.id} asset={asset} index={i} savedIngestedIds={savedIngestedIds} />
              ))}
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
