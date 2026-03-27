import { useState, useRef } from "react";
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

const TIER_SCORE_TEXT: Record<TierKey, string> = {
  high: "text-emerald-600 dark:text-emerald-400",
  mid: "text-amber-600 dark:text-amber-400",
  low: "text-zinc-500 dark:text-zinc-400",
  none: "text-zinc-400 dark:text-zinc-500",
};

const TIER_BORDER: Record<TierKey, string> = {
  high: "border-emerald-500/70 dark:border-emerald-400/50",
  mid: "border-amber-500/70 dark:border-amber-400/50",
  low: "border-zinc-400/50",
  none: "border-zinc-300/50 dark:border-zinc-600/40",
};

const TIER_STRIP_BG: Record<TierKey, string> = {
  high: "#22c55e",
  mid: "#f59e0b",
  low: "#a1a1aa",
  none: "#71717a",
};

const TIER_FILL_GRADIENT: Record<TierKey, string> = {
  high: "linear-gradient(135deg, #166534, #052e16)",
  mid: "linear-gradient(135deg, #92400e, #451a03)",
  low: "linear-gradient(135deg, #3f3f46, #18181b)",
  none: "linear-gradient(135deg, #3f3f46, #18181b)",
};

const TIER_CORNER_GRADIENT: Record<TierKey, string> = {
  high: "linear-gradient(135deg, #16a34a, #14532d)",
  mid: "linear-gradient(135deg, #d97706, #78350f)",
  low: "linear-gradient(135deg, #71717a, #3f3f46)",
  none: "linear-gradient(135deg, #71717a, #3f3f46)",
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
  const [tilt, setTilt] = useState({ x: 0, y: 0, active: false });
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [, setLocation] = useLocation();

  const isUnscored = asset.score === 0 || (asset.score_breakdown?.signal_coverage ?? 0) === 0;
  const isResearcherPublished = asset.source_types?.includes("researcher");
  const tier = scoreTier(asset.score, isUnscored);

  const rawScore = isUnscored ? null : Math.round(asset.score);
  const scoreDisplay = rawScore !== null ? Math.max(1, Math.round(rawScore / 10)) : null;

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
    if (!cardRef.current || hovered) return;
    const rect = cardRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (relY - 0.5) * -8, y: (relX - 0.5) * 8, active: true });
  };

  const handleMouseEnter = () => {
    setHovered(true);
    setTilt({ x: 0, y: 0, active: false });
  };

  const handleMouseLeave = () => {
    setHovered(false);
    setTilt({ x: 0, y: 0, active: false });
    setPressed(false);
  };

  return (
    <div
      style={{ perspective: "1000px" }}
      className="cursor-pointer w-full h-[260px] shrink-0"
      onClick={handleViewDossier}
      data-testid={`asset-card-wrapper-${asset.id}`}
    >
      <div
        ref={cardRef}
        className="relative w-full h-full rounded-[17px] overflow-hidden bg-white/80 dark:bg-zinc-900/85 border border-white/90 dark:border-white/10"
        style={{
          willChange: "transform",
          transformStyle: "preserve-3d",
          transform: pressed
            ? `perspective(1000px) scale(0.96) rotateZ(0.4deg)`
            : tilt.active && !hovered
            ? `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`
            : `perspective(1000px)`,
          transition: pressed
            ? "transform 0.07s ease-in, box-shadow 0.1s"
            : hovered
            ? "transform 0.3s ease-out, box-shadow 0.3s"
            : tilt.active
            ? "transform 0.08s ease-out"
            : "transform 0.5s cubic-bezier(0.23,1,0.32,1), box-shadow 0.4s",
          boxShadow: hovered
            ? "0 20px 60px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.12)"
            : "0 4px 20px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)",
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        data-testid={`asset-card-${asset.id}`}
      >
        {/* Corner-fill circle — expands from top-right on hover */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            background: TIER_FILL_GRADIENT[tier],
            top: "-22px",
            right: "-22px",
            transform: hovered ? "scale(30)" : "scale(1)",
            transformOrigin: "center center",
            transition: "transform 0.4s cubic-bezier(0.4,0,0.2,1)",
            zIndex: 1,
          }}
        />

        {/* Go-corner decorative cap at top-right */}
        <div
          className="absolute top-0 right-0 z-[2] w-8 h-8 flex items-center justify-center overflow-hidden pointer-events-none select-none"
          style={{
            borderRadius: "0 17px 0 28px",
            background: TIER_CORNER_GRADIENT[tier],
          }}
        >
          <span
            className="text-white/80 text-[11px] font-bold"
            style={{ marginTop: "-4px", marginRight: "-4px", lineHeight: 1 }}
          >
            →
          </span>
        </div>

        {/* Left accent strip */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] z-[3]"
          style={{ background: TIER_STRIP_BG[tier] }}
        />

        {/* Content */}
        <div className="absolute inset-0 z-[4] flex flex-col pl-4 pr-3 pt-3 pb-3">

          {/* Top row: score pill + bookmark (above corner) */}
          <div className="flex items-start gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`flex flex-col items-start px-2 py-1 rounded-lg border bg-transparent cursor-default select-none transition-colors duration-500 ${
                    hovered ? "border-white/50" : TIER_BORDER[tier]
                  }`}
                  data-testid="score-badge"
                >
                  <span
                    className="text-[7px] font-bold tracking-[0.14em] uppercase leading-none transition-colors duration-500"
                    style={{ color: hovered ? "rgba(255,255,255,0.65)" : undefined }}
                  >
                    {isUnscored ? <span className="text-muted-foreground">Score</span> : "Score"}
                  </span>
                  <span
                    className={`font-mono text-xl font-bold leading-tight tabular-nums transition-colors duration-500 ${
                      hovered ? "" : TIER_SCORE_TEXT[tier]
                    }`}
                    style={{ color: hovered ? "#ffffff" : undefined }}
                  >
                    {scoreDisplay !== null ? scoreDisplay : <span className="opacity-40 text-base">—</span>}
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
                      const t: TierKey = val >= 75 ? "high" : val >= 50 ? "mid" : "low";
                      return (
                        <div key={k} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-20 shrink-0">{BREAKDOWN_LABELS[k]}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${t === "high" ? "bg-emerald-500/70" : t === "mid" ? "bg-amber-500/70" : "bg-muted-foreground/40"}`}
                              style={{ width: `${val}%` }}
                            />
                          </div>
                          <span className={`text-[10px] font-mono font-semibold w-6 text-right ${TIER_SCORE_TEXT[t]}`}>{val}</span>
                        </div>
                      );
                    })}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>

            {/* Spacer pushes bookmark away from corner cap */}
            <div className="flex-1" />

            {/* Bookmark — right of score, not in corner cap */}
            <div onClick={(e) => e.stopPropagation()} className="mt-0.5 mr-8 z-[5] relative">
              {isSaved ? (
                <button
                  onClick={() => onUnsave?.(asset.id, asset.asset_name)}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 ${
                    hovered
                      ? "text-white/80 hover:text-red-300 bg-white/10 hover:bg-red-500/20"
                      : "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-red-500/10 hover:text-red-500"
                  }`}
                  data-testid={`button-unsave-${asset.id}`}
                  title="Remove from saved"
                >
                  <BookmarkCheck className="w-3.5 h-3.5" />
                </button>
              ) : (
                <div className={hovered ? "text-white/80" : ""}>
                  <PipelinePicker asset={asset} variant="icon" iconClassName="w-7 h-7 rounded-lg" />
                </div>
              )}
            </div>
          </div>

          {/* Researcher badge */}
          {isResearcherPublished && (
            <div className="flex items-center gap-1 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              <span
                className="text-[8px] font-semibold uppercase tracking-wide leading-none transition-colors duration-500"
                style={{ color: hovered ? "rgba(255,255,255,0.7)" : undefined }}
              >
                <span className={hovered ? "" : "text-amber-600 dark:text-amber-400"}>Researcher</span>
              </span>
            </div>
          )}

          {/* Title */}
          <div className="mt-2 flex-1 min-h-0">
            <h3
              className="text-[13px] font-semibold leading-snug line-clamp-3 transition-colors duration-500"
              style={{ color: hovered ? "#ffffff" : undefined }}
              data-testid={`text-asset-name-${asset.id}`}
            >
              {!hovered && <span className="text-foreground" />}
              {asset.asset_name !== "unknown" ? asset.asset_name : "Unnamed Asset"}
            </h3>
          </div>

          {/* Institution — below title */}
          {institutionDisplay && (
            <div className="mt-1.5 mb-1">
              <p
                className="flex items-start gap-1 text-[11px] leading-snug line-clamp-2 transition-colors duration-500"
                style={{ color: hovered ? "rgba(255,255,255,0.65)" : undefined }}
              >
                <Building2 className="w-2.5 h-2.5 shrink-0 opacity-60 mt-0.5" />
                <span
                  className={hovered ? "" : "text-muted-foreground"}
                  data-testid={`text-institution-${asset.id}`}
                >
                  {institutionDisplay}
                </span>
              </p>
            </div>
          )}

          {/* CTA */}
          <div className="mt-auto pt-1.5">
            <button
              className={`w-full h-7 rounded-md text-[11px] font-semibold tracking-wide transition-all duration-200
                active:scale-95 active:brightness-90
                ${hovered
                  ? "bg-white text-zinc-900 hover:bg-white/90 shadow-sm"
                  : "bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white hover:shadow-md hover:scale-[1.02]"
                }`}
              onClick={(e) => {
                e.stopPropagation();
                handleViewDossier();
              }}
              data-testid={`button-dossier-${asset.id}`}
            >
              Asset Dossier
            </button>
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
  const [hovered, setHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current || hovered) return;
    const rect = cardRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (relY - 0.5) * -6, y: (relX - 0.5) * 6, active: true });
  };

  const handleMouseLeave = () => {
    setHovered(false);
    setTilt({ x: 0, y: 0, active: false });
    setPressed(false);
  };

  return (
    <div style={{ perspective: "1000px" }}>
      <div
        ref={cardRef}
        className="relative rounded-[14px] overflow-hidden bg-white/80 dark:bg-zinc-900/85 border border-white/90 dark:border-white/10"
        style={{
          willChange: "transform",
          transformStyle: "preserve-3d",
          transform: pressed
            ? "perspective(1000px) scale(0.97)"
            : tilt.active && !hovered
            ? `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`
            : "perspective(1000px)",
          transition: pressed
            ? "transform 0.07s ease-in"
            : tilt.active
            ? "transform 0.08s ease-out"
            : "transform 0.5s cubic-bezier(0.23,1,0.32,1)",
          boxShadow: hovered
            ? "0 16px 40px rgba(0,0,0,0.18)"
            : "0 4px 16px rgba(0,0,0,0.10)",
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={handleMouseLeave}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        data-testid={`saved-card-${asset.id}`}
      >
        {/* Corner fill */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #166534, #052e16)",
            top: "-18px",
            right: "-18px",
            transform: hovered ? "scale(28)" : "scale(1)",
            transition: "transform 0.4s cubic-bezier(0.4,0,0.2,1)",
            zIndex: 1,
          }}
        />
        {/* Left strip */}
        <div className="absolute left-0 top-0 bottom-0 w-[3px] z-[3]" style={{ background: "#22c55e" }} />

        <div className="relative z-[4] pl-4 pr-3 pt-3 pb-3 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <FlaskConical
                  className="w-3 h-3 shrink-0 transition-colors duration-500"
                  style={{ color: hovered ? "rgba(255,255,255,0.8)" : "#22c55e" }}
                />
                <span
                  className="font-semibold text-sm truncate transition-colors duration-500"
                  style={{ color: hovered ? "#ffffff" : undefined }}
                >
                  {!hovered && <span className="text-foreground" />}
                  {asset.assetName}
                </span>
              </div>
            </div>
            <button
              className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-all duration-150 active:scale-90"
              style={{
                color: hovered ? "rgba(255,255,255,0.7)" : "#22c55e",
                background: "transparent",
              }}
              onClick={() => onDelete(asset.id)}
              data-testid={`button-delete-saved-${asset.id}`}
              title="Remove from saved"
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-xs space-y-1">
            <div className="flex gap-1.5">
              <span
                className="w-14 shrink-0 transition-colors duration-500"
                style={{ color: hovered ? "rgba(255,255,255,0.5)" : undefined }}
              >
                {!hovered && <span className="text-muted-foreground" />}
                Target
              </span>
              <span
                className="font-medium truncate transition-colors duration-500"
                style={{ color: hovered ? "#ffffff" : undefined }}
              >
                {!hovered && <span className="text-foreground" />}
                {asset.target}
              </span>
            </div>
            <div className="flex gap-1.5">
              <span
                className="w-14 shrink-0 transition-colors duration-500"
                style={{ color: hovered ? "rgba(255,255,255,0.5)" : undefined }}
              >
                {!hovered && <span className="text-muted-foreground" />}
                Disease
              </span>
              <span
                className="font-medium truncate transition-colors duration-500"
                style={{ color: hovered ? "#ffffff" : undefined }}
              >
                {!hovered && <span className="text-foreground" />}
                {asset.diseaseIndication}
              </span>
            </div>
          </div>
          {asset.sourceUrl && (
            <a
              href={asset.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 transition-colors text-[11px] font-medium"
              style={{ color: hovered ? "rgba(255,255,255,0.75)" : undefined }}
            >
              {!hovered && <span className="text-primary" />}
              <ExternalLink className="w-3 h-3" />
              {asset.sourceJournal} · {asset.publicationYear}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
