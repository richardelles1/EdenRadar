import { useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Building2, ExternalLink, FlaskConical, RefreshCw,
  ShieldOff, ChevronDown, ChevronUp, ArrowUpDown,
} from "lucide-react";
import type { IngestedAsset } from "@shared/schema";
import { INSTITUTIONS, BLOCKED_SLUGS as _BLOCKED } from "@/lib/institutions";
import {
  detectModality, detectStage, computeCommercialScore, formatRelativeTime,
} from "@/lib/titleSignals";

const BLOCKED_SLUGS = new Set([
  "ucsf", "duke", "umich", "mayo", "ucolorado", "columbia",
]);

const STAGE_COLORS: Record<string, string> = {
  "discovery":   "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  "preclinical": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "phase 1":     "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  "phase 2":     "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  "phase 3":     "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "approved":    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

type SortMode = "newest" | "commercial" | "az" | "za";

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

function AssetRow({ asset, index }: { asset: IngestedAsset; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const modality = detectModality(asset.assetName);
  const stage = detectStage(asset.assetName, asset.developmentStage);
  const score = computeCommercialScore(asset);

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

        <div className="flex items-center gap-2 shrink-0">
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

          {asset.sourceUrl && (
            <a
              href={asset.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              data-testid={`link-view-tto-${index}`}
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-3 h-3" />
              Open at TTO →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function InstitutionDetail() {
  const { slug } = useParams<{ slug: string }>();
  const inst = INSTITUTIONS.find((i) => i.slug === slug);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<{ assets: IngestedAsset[]; institution: string }>({
    queryKey: ["/api/institutions", slug, "assets"],
    queryFn: () => fetch(`/api/institutions/${slug}/assets`).then((r) => r.json()),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  if (!inst) {
    return (
      <div className="min-h-full bg-background flex flex-col items-center justify-center py-24 text-center gap-4">
        <Building2 className="w-10 h-10 text-muted-foreground" />
        <h2 className="text-xl font-bold text-foreground">Institution not found</h2>
        <Link href="/institutions">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Institutions
          </Button>
        </Link>
      </div>
    );
  }

  const rawAssets = data?.assets ?? [];
  const isBlocked = BLOCKED_SLUGS.has(slug ?? "");

  const filtered = search.trim()
    ? rawAssets.filter((a) => a.assetName.toLowerCase().includes(search.toLowerCase()))
    : rawAssets;

  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === "newest") return new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime();
    if (sortMode === "commercial") return computeCommercialScore(b) - computeCommercialScore(a);
    if (sortMode === "az") return a.assetName.localeCompare(b.assetName);
    if (sortMode === "za") return b.assetName.localeCompare(a.assetName);
    return 0;
  });

  const activeCount = isLoading ? null : rawAssets.length;

  const SORT_OPTIONS: { value: SortMode; label: string }[] = [
    { value: "newest", label: "Newest First" },
    { value: "commercial", label: "Best Commercial" },
    { value: "az", label: "A → Z" },
    { value: "za", label: "Z → A" },
  ];

  return (
    <div className="min-h-full bg-background">
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
                <h1 className="text-2xl font-bold text-foreground">{inst.name}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">{inst.city} · {inst.ttoName}</p>
              </div>
            </div>
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
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border border-card-border bg-card">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">TTO Office</p>
            <p className="text-sm font-medium text-foreground">{inst.ttoName}</p>
          </div>
          <div className="p-4 rounded-lg border border-card-border bg-card">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Location</p>
            <p className="text-sm font-medium text-foreground">{inst.city}</p>
          </div>
          <div className="p-4 rounded-lg border border-card-border bg-card" data-testid="stat-active-listings">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Active Listings</p>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : activeCount !== null && activeCount > 0 ? (
              <p className="text-2xl font-bold text-primary">{activeCount}</p>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground">—</p>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Specialty Areas</h2>
          <div className="flex flex-wrap gap-2">
            {inst.specialties.map((s) => (
              <Badge key={s} variant="secondary" className="text-sm font-medium bg-primary/10 text-primary border-0 px-3 py-1">
                {s}
              </Badge>
            ))}
          </div>
        </div>

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
                This institution&apos;s website blocks automated access from cloud hosting providers. Listings cannot be indexed automatically.
              </p>
              <a href={inst.website} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                Visit TTO website directly →
              </a>
            </div>
          ) : rawAssets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <RefreshCw className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No listings indexed yet</p>
              <p className="text-xs text-muted-foreground/70">Run a scan from the Scout page to pull real listings from this TTO.</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">No listings match &ldquo;{search}&rdquo;</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map((asset, i) => (
                <AssetRow key={asset.id} asset={asset} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
