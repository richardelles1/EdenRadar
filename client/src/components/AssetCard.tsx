import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { BookmarkCheck, Building2, FlaskConical, ExternalLink } from "lucide-react";
import { PipelinePicker } from "./PipelinePicker";
import type { ScoredAsset, ScoreBreakdown } from "@/lib/types";
import type { SavedAsset } from "@shared/schema";
import { useLocation } from "wouter";

type TierKey = "high" | "mid" | "low" | "none";

function scoreTier(score: number, isUnscored: boolean): TierKey {
  if (isUnscored || score === 0) return "none";
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

const TIER_TEXT: Record<TierKey, string> = {
  high: "text-emerald-600 dark:text-emerald-400",
  mid: "text-amber-600 dark:text-amber-400",
  low: "text-zinc-500 dark:text-zinc-400",
  none: "text-zinc-400 dark:text-zinc-500",
};

const TIER_BORDER: Record<TierKey, string> = {
  high: "border-emerald-500/60",
  mid: "border-amber-500/60",
  low: "border-zinc-400/40",
  none: "border-zinc-400/30",
};

const TIER_STRIP: Record<TierKey, string> = {
  high: "bg-emerald-500",
  mid: "bg-amber-500",
  low: "bg-zinc-400/60",
  none: "bg-zinc-400/30",
};

const TIER_GLOW: Record<TierKey, string> = {
  high: "rgba(34,197,94,0.18)",
  mid: "rgba(245,158,11,0.18)",
  low: "transparent",
  none: "transparent",
};

const SCORE_BREAKDOWN_KEYS = ["fit", "novelty", "readiness", "licensability"] as const;
type BreakdownKey = typeof SCORE_BREAKDOWN_KEYS[number];

const BREAKDOWN_LABELS: Record<BreakdownKey, string> = {
  fit: "Buyer Fit",
  novelty: "Novelty",
  readiness: "Readiness",
  licensability: "Licensability",
};

type AssetCardProps = {
  asset: ScoredAsset;
  isSaved?: boolean;
  onSave?: (asset: ScoredAsset) => void;
  onUnsave?: (id: string, assetName?: string) => void;
};

export function AssetCard({ asset, isSaved, onSave, onUnsave }: AssetCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [spotlight, setSpotlight] = useState({ x: 50, y: 30, visible: false });
  const [tilt, setTilt] = useState({ x: 0, y: 0, active: false });
  const [pressed, setPressed] = useState(false);
  const [, setLocation] = useLocation();

  const isUnscored = asset.score === 0 || (asset.score_breakdown?.signal_coverage ?? 0) === 0;
  const isResearcherPublished = asset.source_types?.includes("researcher");
  const tier = scoreTier(asset.score, isUnscored);
  const scoreDisplay = isUnscored ? null : Math.round(asset.score);

  const hasOwner = asset.owner_name && asset.owner_name !== "unknown";
  const hasInstitution = asset.institution && asset.institution !== "unknown";
  const institutionDisplay = hasOwner
    ? asset.owner_name
    : hasInstitution
    ? asset.institution
    : null;

  const handleViewDossier = () => {
    sessionStorage.setItem(`asset-${asset.id}`, JSON.stringify(asset));
    setLocation(`/asset/${asset.id}`);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    setSpotlight({ x: relX * 100, y: relY * 100, visible: true });
    setTilt({ x: (relY - 0.5) * -10, y: (relX - 0.5) * 10, active: true });
  };

  const handleMouseLeave = () => {
    setSpotlight((s) => ({ ...s, visible: false }));
    setTilt({ x: 0, y: 0, active: false });
    setPressed(false);
  };

  return (
    <div
      style={{ perspective: "1000px" }}
      className="cursor-pointer w-[190px] h-[254px] shrink-0"
      onClick={handleViewDossier}
      data-testid={`asset-card-wrapper-${asset.id}`}
    >
      <div
        ref={cardRef}
        className="relative w-full h-full rounded-[17px] overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.68)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          border: "1px solid rgba(255,255,255,0.82)",
          transformStyle: "preserve-3d",
          transform: pressed
            ? `perspective(1000px) rotateX(${-tilt.x * 0.3}deg) rotateY(${-tilt.y * 0.3}deg) scale(0.97) rotateZ(0.5deg)`
            : tilt.active
            ? `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.03)`
            : `perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)`,
          transition: pressed
            ? "transform 0.06s ease-in, box-shadow 0.1s"
            : tilt.active
            ? "transform 0.08s ease-out, box-shadow 0.2s"
            : "transform 0.5s cubic-bezier(0.23,1,0.32,1), box-shadow 0.4s",
          boxShadow: pressed
            ? "4px 8px 24px rgba(0,0,0,0.14)"
            : tilt.active
            ? "16px 22px 60px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.10)"
            : "12px 17px 51px rgba(0,0,0,0.18)",
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        data-testid={`asset-card-${asset.id}`}
      >
        {/* Dark-mode glass overlay */}
        <div
          className="absolute inset-0 dark:block hidden"
          style={{
            background: "rgba(24,24,27,0.78)",
            borderRadius: "inherit",
          }}
        />

        {/* Tier-colored left accent strip */}
        <div className={`absolute left-0 top-0 bottom-0 w-[3px] z-10 ${TIER_STRIP[tier]}`} />

        {/* Tier-colored radial glow — top-left, from score badge corner */}
        {TIER_GLOW[tier] !== "transparent" && (
          <div
            className="absolute pointer-events-none z-0"
            style={{
              width: "140px",
              height: "140px",
              background: `radial-gradient(circle, ${TIER_GLOW[tier]} 0%, transparent 70%)`,
              top: "-30px",
              left: "-20px",
            }}
          />
        )}

        {/* Cursor-following spotlight */}
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            opacity: spotlight.visible ? 1 : 0,
            transition: "opacity 0.35s",
            background: `radial-gradient(circle at ${spotlight.x}% ${spotlight.y}%, rgba(255,255,255,0.13) 0%, transparent 60%)`,
          }}
        />

        {/* Content */}
        <div className="absolute inset-0 z-10 flex flex-col pl-4 pr-3 pt-3 pb-3">

          {/* Top row: score pill + bookmark */}
          <div className="flex items-start justify-between gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`flex flex-col items-start px-2 py-1 rounded-lg border bg-transparent cursor-default select-none ${TIER_BORDER[tier]}`}
                  data-testid="score-badge"
                >
                  <span className="text-[7px] font-bold tracking-[0.15em] text-muted-foreground uppercase leading-none">
                    Match
                  </span>
                  <span className={`font-mono text-lg font-bold leading-tight tabular-nums ${TIER_TEXT[tier]}`}>
                    {scoreDisplay !== null ? scoreDisplay : <span className="opacity-40 text-sm">—</span>}
                  </span>
                </div>
              </TooltipTrigger>
              {asset.score_breakdown && !isUnscored && (
                <TooltipContent side="right" className="p-3 w-52 shadow-xl">
                  <p className="text-xs font-semibold mb-2">Signal Profile</p>
                  <div className="space-y-1.5">
                    {SCORE_BREAKDOWN_KEYS.map((k) => {
                      const val: number = asset.score_breakdown[k as keyof ScoreBreakdown] as number;
                      if (!val || val === 0) return null;
                      const t = val >= 75 ? "high" : val >= 50 ? "mid" : "low";
                      return (
                        <div key={k} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-20 shrink-0">{BREAKDOWN_LABELS[k]}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full ${t === "high" ? "bg-emerald-500/70" : t === "mid" ? "bg-amber-500/70" : "bg-muted-foreground/40"}`} style={{ width: `${val}%` }} />
                          </div>
                          <span className={`text-[10px] font-mono font-semibold w-6 text-right ${TIER_TEXT[t as TierKey]}`}>{val}</span>
                        </div>
                      );
                    })}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>

            {/* Bookmark */}
            <div onClick={(e) => e.stopPropagation()} className="-mt-0.5 -mr-0.5">
              {isSaved ? (
                <button
                  onClick={() => onUnsave?.(asset.id, asset.asset_name)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-red-500/10 hover:text-red-500 transition-all duration-150"
                  data-testid={`button-unsave-${asset.id}`}
                  title="Remove from saved"
                >
                  <BookmarkCheck className="w-3.5 h-3.5" />
                </button>
              ) : (
                <PipelinePicker asset={asset} variant="icon" iconClassName="w-8 h-8 rounded-lg" />
              )}
            </div>
          </div>

          {/* Researcher badge */}
          {isResearcherPublished && (
            <div className="flex items-center gap-1 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="text-[8px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide leading-none">
                Researcher
              </span>
            </div>
          )}

          {/* Middle: title + institution */}
          <div className="flex-1 flex flex-col justify-center gap-1.5 min-h-0 mt-2">
            <h3
              className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2"
              data-testid={`text-asset-name-${asset.id}`}
            >
              {asset.asset_name !== "unknown" ? asset.asset_name : "Unnamed Asset"}
            </h3>
            {institutionDisplay && (
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                <Building2 className="w-2.5 h-2.5 shrink-0 opacity-60" />
                <span className="truncate" data-testid={`text-institution-${asset.id}`}>
                  {institutionDisplay}
                </span>
              </p>
            )}
          </div>

          {/* Bottom: CTA */}
          <div className="mt-auto pt-2">
            <Button
              className="w-full h-7 text-[11px] font-semibold tracking-wide"
              onClick={(e) => {
                e.stopPropagation();
                handleViewDossier();
              }}
              data-testid={`button-dossier-${asset.id}`}
            >
              Asset Dossier
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SavedAssetCard({
  asset,
  onDelete,
}: {
  asset: SavedAsset;
  onDelete: (id: number) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, active: false });
  const [pressed, setPressed] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (relY - 0.5) * -8, y: (relX - 0.5) * 8, active: true });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0, active: false });
    setPressed(false);
  };

  return (
    <div style={{ perspective: "1000px" }}>
      <div
        ref={cardRef}
        className="relative rounded-[14px] overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.68)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          border: "1px solid rgba(255,255,255,0.82)",
          transformStyle: "preserve-3d",
          transform: pressed
            ? `perspective(1000px) scale(0.97)`
            : tilt.active
            ? `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.02)`
            : `perspective(1000px)`,
          transition: pressed
            ? "transform 0.06s ease-in"
            : tilt.active
            ? "transform 0.08s ease-out"
            : "transform 0.5s cubic-bezier(0.23,1,0.32,1)",
          boxShadow: tilt.active ? "12px 17px 40px rgba(0,0,0,0.18)" : "8px 12px 30px rgba(0,0,0,0.14)",
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        data-testid={`saved-card-${asset.id}`}
      >
        <div className="absolute inset-0 dark:block hidden" style={{ background: "rgba(24,24,27,0.78)", borderRadius: "inherit" }} />
        <div className="absolute left-0 top-0 bottom-0 w-[3px] z-10 bg-emerald-500/70" />
        <div className="relative z-10 pl-4 pr-3 pt-3 pb-3 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <FlaskConical className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-semibold text-sm text-foreground truncate">{asset.assetName}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 w-7 h-7 text-emerald-600 dark:text-emerald-400 hover:text-red-500 hover:bg-red-500/10"
              onClick={() => onDelete(asset.id)}
              data-testid={`button-delete-saved-${asset.id}`}
              title="Remove from saved"
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="text-xs space-y-1">
            <div className="flex gap-1.5">
              <span className="text-muted-foreground w-14 shrink-0">Target</span>
              <span className="text-foreground font-medium truncate">{asset.target}</span>
            </div>
            <div className="flex gap-1.5">
              <span className="text-muted-foreground w-14 shrink-0">Disease</span>
              <span className="text-foreground font-medium truncate">{asset.diseaseIndication}</span>
            </div>
          </div>
          {asset.sourceUrl && (
            <a
              href={asset.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              {asset.sourceJournal} · {asset.publicationYear}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
