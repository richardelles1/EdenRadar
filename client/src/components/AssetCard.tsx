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

function scoreTextColor(score: number, isUnscored: boolean): string {
  if (isUnscored || score === 0) return "text-zinc-500";
  if (score >= 75) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-zinc-400";
}

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
  const scoreColor = scoreTextColor(asset.score, isUnscored);
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
    setTilt({ x: (relY - 0.5) * -12, y: (relX - 0.5) * 12, active: true });
  };

  const handleMouseLeave = () => {
    setSpotlight((s) => ({ ...s, visible: false }));
    setTilt({ x: 0, y: 0, active: false });
    setPressed(false);
  };

  return (
    <div
      style={{ perspective: "1000px" }}
      className="cursor-pointer w-[192px] h-56 shrink-0"
      onClick={handleViewDossier}
      data-testid={`asset-card-wrapper-${asset.id}`}
    >
      <div
        ref={cardRef}
        className="relative w-full h-full rounded-xl overflow-hidden"
        style={{
          background: "#3d3c3d",
          transformStyle: "preserve-3d",
          transform: pressed
            ? `perspective(1000px) rotateX(${-tilt.x * 0.4}deg) rotateY(${-tilt.y * 0.4}deg) scale(0.97)`
            : `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: pressed
            ? "transform 0.06s ease-in, box-shadow 0.1s"
            : tilt.active
            ? "transform 0.08s ease-out, box-shadow 0.2s"
            : "transform 0.45s ease-out, box-shadow 0.3s",
          boxShadow: tilt.active
            ? "0 20px 60px rgba(0,0,0,0.40), 0 6px 16px rgba(0,0,0,0.28)"
            : "0 4px 24px rgba(0,0,0,0.30)",
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        data-testid={`asset-card-${asset.id}`}
      >
        {/* Bezel inner panel — renders above outer bg, below content */}
        <div
          className="absolute inset-0.5 rounded-[10px] opacity-90"
          style={{ background: "#323132" }}
        />

        {/* White ambient glow — top-left corner */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: "224px",
            height: "192px",
            background: "white",
            filter: "blur(50px)",
            left: "-50%",
            top: "-50%",
            opacity: 0.05,
          }}
        />

        {/* Cursor-following spotlight */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: spotlight.visible ? 1 : 0,
            transition: "opacity 0.3s",
            background: `radial-gradient(circle at ${spotlight.x}% ${spotlight.y}%, rgba(255,255,255,0.07) 0%, transparent 65%)`,
          }}
        />

        {/* Content — z-10 above bezel and glows */}
        <div className="absolute inset-0 z-10 flex flex-col px-3 pt-3 pb-3">

          {/* Top: score + bookmark */}
          <div className="flex items-start justify-between">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col cursor-default select-none" data-testid="score-badge">
                  <span className="text-[8px] font-bold tracking-widest text-zinc-400 uppercase leading-none mb-0.5">
                    Match
                  </span>
                  <span className={`font-mono text-xl font-bold leading-none tabular-nums ${scoreColor}`}>
                    {scoreDisplay !== null ? scoreDisplay : <span className="opacity-30 text-base">—</span>}
                  </span>
                </div>
              </TooltipTrigger>
              {asset.score_breakdown && !isUnscored && (
                <TooltipContent side="right" className="p-3 w-52 bg-zinc-900 border border-zinc-700 shadow-xl">
                  <p className="text-xs font-semibold text-white mb-2">Signal Profile</p>
                  <div className="space-y-1.5">
                    {SCORE_BREAKDOWN_KEYS.map((k) => {
                      const val: number = asset.score_breakdown[k as keyof ScoreBreakdown] as number;
                      if (!val || val === 0) return null;
                      const barColor =
                        val >= 75 ? "bg-emerald-500/70" : val >= 50 ? "bg-amber-500/70" : "bg-zinc-500/60";
                      const textColor =
                        val >= 75 ? "text-emerald-400" : val >= 50 ? "text-amber-400" : "text-zinc-400";
                      return (
                        <div key={k} className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400 w-20 shrink-0">{BREAKDOWN_LABELS[k]}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${val}%` }} />
                          </div>
                          <span className={`text-[10px] font-mono font-semibold w-6 text-right ${textColor}`}>{val}</span>
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
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-emerald-400 bg-emerald-500/10 hover:bg-red-500/10 hover:text-red-400 transition-all duration-150"
                  data-testid={`button-unsave-${asset.id}`}
                  title="Remove from saved"
                >
                  <BookmarkCheck className="w-4 h-4" />
                </button>
              ) : (
                <PipelinePicker asset={asset} variant="icon" iconClassName="w-9 h-9 rounded-lg" />
              )}
            </div>
          </div>

          {/* Researcher indicator */}
          {isResearcherPublished && (
            <div className="flex items-center gap-1 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="text-[8px] text-amber-400 font-semibold uppercase tracking-wide leading-none">
                Researcher
              </span>
            </div>
          )}

          {/* Middle: title + institution */}
          <div className="flex-1 flex flex-col justify-center gap-1.5 min-h-0 mt-1.5">
            <h3
              className="text-[13px] font-semibold text-white/90 leading-snug line-clamp-2"
              data-testid={`text-asset-name-${asset.id}`}
            >
              {asset.asset_name !== "unknown" ? asset.asset_name : "Unnamed Asset"}
            </h3>
            {institutionDisplay && (
              <p className="flex items-center gap-1 text-[11px] text-zinc-400 truncate">
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
              className="w-full h-7 text-[11px] font-semibold tracking-wide bg-emerald-600 hover:bg-emerald-500 text-white border-0"
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
  const [spotlight, setSpotlight] = useState({ x: 50, y: 30, visible: false });
  const [tilt, setTilt] = useState({ x: 0, y: 0, active: false });
  const [pressed, setPressed] = useState(false);

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
    <div style={{ perspective: "1000px" }}>
      <div
        ref={cardRef}
        className="relative rounded-xl overflow-hidden"
        style={{
          background: "#3d3c3d",
          transformStyle: "preserve-3d",
          transform: pressed
            ? `perspective(1000px) rotateX(${-tilt.x * 0.4}deg) rotateY(${-tilt.y * 0.4}deg) scale(0.97)`
            : `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: pressed
            ? "transform 0.06s ease-in"
            : tilt.active
            ? "transform 0.08s ease-out"
            : "transform 0.45s ease-out",
          boxShadow: tilt.active ? "0 16px 48px rgba(0,0,0,0.36)" : "0 2px 12px rgba(0,0,0,0.24)",
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        data-testid={`saved-card-${asset.id}`}
      >
        <div className="absolute inset-0.5 rounded-[10px] opacity-90" style={{ background: "#323132" }} />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: spotlight.visible ? 1 : 0,
            transition: "opacity 0.3s",
            background: `radial-gradient(circle at ${spotlight.x}% ${spotlight.y}%, rgba(255,255,255,0.07) 0%, transparent 65%)`,
          }}
        />
        <div className="relative z-10 px-3 pt-3 pb-3 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-1">
                <FlaskConical className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="font-semibold text-sm text-white/90 truncate">{asset.assetName}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 w-7 h-7 hover:bg-red-500/10 text-emerald-400 hover:text-red-400"
              onClick={() => onDelete(asset.id)}
              data-testid={`button-delete-saved-${asset.id}`}
              title="Remove from saved"
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="text-xs space-y-1">
            <div className="flex gap-1.5">
              <span className="text-zinc-500 w-14 shrink-0">Target</span>
              <span className="text-zinc-200 font-medium truncate">{asset.target}</span>
            </div>
            <div className="flex gap-1.5">
              <span className="text-zinc-500 w-14 shrink-0">Disease</span>
              <span className="text-zinc-200 font-medium truncate">{asset.diseaseIndication}</span>
            </div>
          </div>
          {asset.sourceUrl && (
            <a
              href={asset.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
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
