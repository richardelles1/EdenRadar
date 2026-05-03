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

const TIER_BORDER_BOTTOM_RIGHT: Record<TierKey, string> = {
  high: "border-emerald-500/50 dark:border-emerald-500/30",
  mid: "border-amber-500/50 dark:border-amber-500/30",
  low: "border-zinc-300/60 dark:border-zinc-600/40",
  none: "border-zinc-200/60 dark:border-zinc-700/40",
};

const TIER_STRIP_BG: Record<TierKey, string> = {
  high: "#22c55e",
  mid: "#f59e0b",
  low: "#a1a1aa",
  none: "#71717a",
};

const SCORE_BREAKDOWN_KEYS = ["fit", "novelty", "readiness", "licensability"] as const;
type BreakdownKey = typeof SCORE_BREAKDOWN_KEYS[number];

const BREAKDOWN_LABELS: Record<BreakdownKey, string> = {
  fit: "Buyer Fit",
  novelty: "Novelty",
  readiness: "Readiness",
  licensability: "Licensability",
};

const BIOTECH_ACRONYM_MAP: Record<string, string> = {
  "adc": "ADC", "cart": "CAR-T", "carnk": "CAR-NK",
  "glp1": "GLP-1", "glp2": "GLP-2",
  "mrna": "mRNA", "sirna": "siRNA", "shrna": "shRNA", "mirna": "miRNA",
  "crispr": "CRISPR", "her2": "HER2", "egfr": "EGFR", "vegf": "VEGF",
  "pd1": "PD-1", "pdl1": "PD-L1", "ctla4": "CTLA-4",
  "bite": "BiTE", "mab": "mAb", "aav": "AAV", "lnp": "LNP",
  "tcr": "TCR", "nk": "NK", "nkcel": "NK Cell", "rnai": "RNAi",
  "aso": "ASO", "tki": "TKI", "adc1": "ADC",
};

function normalizePillValue(val: string | undefined | null): string | null {
  if (!val) return null;
  const v = val.trim();
  if (!v || v.toLowerCase() === "unknown" || v.toLowerCase() === "n/a") return null;
  const key = v.toLowerCase().replace(/[-\s]/g, "");
  if (BIOTECH_ACRONYM_MAP[key]) return BIOTECH_ACRONYM_MAP[key];
  return v.charAt(0).toUpperCase() + v.slice(1);
}

const PILL_MUTED_TEXT = "text-zinc-500 dark:text-zinc-400";

function stagePillClass(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes("phase 3") || s.includes("phase iii") || s.includes("approved") || s.includes("marketed")) {
    return `bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-700/30 ${PILL_MUTED_TEXT}`;
  }
  if (s.includes("phase 2") || s.includes("phase ii")) {
    return `bg-violet-50 dark:bg-violet-950/40 border border-violet-200/70 dark:border-violet-700/30 ${PILL_MUTED_TEXT}`;
  }
  if (s.includes("phase 1") || s.includes("phase i") || s.includes("phase i/ii")) {
    return `bg-sky-50 dark:bg-sky-950/40 border border-sky-200/70 dark:border-sky-700/30 ${PILL_MUTED_TEXT}`;
  }
  return `bg-zinc-100 dark:bg-zinc-700/50 border border-zinc-200/80 dark:border-zinc-600/50 ${PILL_MUTED_TEXT}`;
}

const MODALITY_PILL_CLASS = "bg-zinc-100 dark:bg-zinc-700/50 border border-zinc-200/80 dark:border-zinc-600/50 text-zinc-500 dark:text-zinc-400";

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

  // Confidence factor (combined classifier + coverage); surfaced in the score
  // tooltip so we don't clutter the card grid.
  const confFactor = asset.score_breakdown?.confidence_factor;

  const rawScore = isUnscored ? null : Math.round(asset.score);
  const scoreDisplay = rawScore !== null ? Math.max(1, Math.round(rawScore / 10)) : null;

  const hasOwner = asset.owner_name && asset.owner_name !== "unknown";
  const hasInstitution = asset.institution && asset.institution !== "unknown";
  const institutionDisplay = hasOwner
    ? asset.owner_name
    : hasInstitution
    ? asset.institution
    : null;

  const stageLabel = normalizePillValue(asset.development_stage);
  const modalityLabel = normalizePillValue(asset.modality);
  const hasPills = stageLabel || modalityLabel;

  const handleViewDossier = () => {
    sessionStorage.setItem(`asset-${asset.id}`, JSON.stringify(asset));
    setLocation(`/asset/${asset.id}`);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (relY - 0.5) * -10, y: (relX - 0.5) * 10, active: true });
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
            : tilt.active
            ? `perspective(1000px) scale(1.015) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`
            : `perspective(1000px)`,
          transition: pressed
            ? "transform 0.07s ease-in, box-shadow 0.1s"
            : tilt.active
            ? "transform 0.08s ease-out, box-shadow 0.2s"
            : "transform 0.5s cubic-bezier(0.23,1,0.32,1), box-shadow 0.4s",
          boxShadow: hovered
            ? "0 16px 48px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.10)"
            : "0 4px 20px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)",
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={handleMouseLeave}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        data-testid={`asset-card-${asset.id}`}
      >
        {/* Subtle tint bloom — erupts from score-badge corner */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "rgba(38, 122, 70, 0.55)",
            top: "-28px",
            left: "-28px",
            transform: hovered ? "scale(26)" : "scale(1)",
            transformOrigin: "center center",
            opacity: hovered ? 0.13 : 0,
            transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
            zIndex: 1,
          }}
        />

        {/* Left accent strip — z-[3], sibling of badge at z-[5] */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] z-[3]"
          style={{ background: TIER_STRIP_BG[tier] }}
        />

        {/* Score badge — flush top-left, NO backdrop-filter (causes z-index break) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`
                absolute top-0 left-0 z-[5]
                flex flex-col items-center justify-center
                px-3 py-1.5
                border-b border-r
                bg-white dark:bg-zinc-900
                ${TIER_BORDER_BOTTOM_RIGHT[tier]}
              `}
              style={{
                borderRadius: "17px 0 10px 0",
                minWidth: "52px",
              }}
              data-testid="score-badge"
            >
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase leading-none text-muted-foreground">
                Score
              </span>
              <span className={`font-mono text-2xl font-bold leading-tight tabular-nums mt-0.5 ${TIER_SCORE_TEXT[tier]}`}>
                {scoreDisplay !== null ? scoreDisplay : <span className="opacity-40 text-lg">—</span>}
              </span>
            </div>
          </TooltipTrigger>
          {asset.score_breakdown && !isUnscored && (
            <TooltipContent side="right" className="p-3 w-52 shadow-xl">
              <p className="text-xs font-semibold mb-2">Signal Profile</p>
              {typeof confFactor === "number" && (
                <p className="text-[10px] text-muted-foreground mb-2" data-testid={`text-confidence-${asset.id}`}>
                  Confidence: <span className="font-semibold text-foreground">{Math.round(confFactor * 100)}%</span>
                  {typeof asset.score_breakdown.category_confidence === "number" &&
                    ` · class ${Math.round(asset.score_breakdown.category_confidence * 100)}%`}
                </p>
              )}
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

        {/* Bookmark — top-right */}
        <div
          className="absolute top-1.5 right-1.5 z-[5]"
          onClick={(e) => e.stopPropagation()}
        >
          {isSaved ? (
            <button
              onClick={() => onUnsave?.(asset.id, asset.asset_name)}
              className="w-9 h-9 md:w-7 md:h-7 rounded-lg flex items-center justify-center text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-red-500/10 hover:text-red-500 transition-all duration-150"
              data-testid={`button-unsave-${asset.id}`}
              title="Remove from saved"
            >
              <BookmarkCheck className="w-4 h-4 md:w-3.5 md:h-3.5" />
            </button>
          ) : (
            <PipelinePicker asset={asset} variant="icon" iconClassName="w-9 h-9 md:w-7 md:h-7 rounded-lg" />
          )}
        </div>

        {/* Main content — below badge */}
        <div className="absolute inset-0 z-[4] flex flex-col pl-4 pr-3 pt-[56px] pb-3">

          {/* Researcher label */}
          {isResearcherPublished && (
            <div className="flex items-center gap-1 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              <span className="text-[8px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide leading-none">
                Researcher
              </span>
            </div>
          )}

          {/* Title — natural height, mt-2 for breathing room below badge */}
          <h3
            className="text-[13px] font-semibold text-foreground leading-snug line-clamp-3 mt-2"
            data-testid={`text-asset-name-${asset.id}`}
          >
            {asset.asset_name !== "unknown" ? asset.asset_name : "Unnamed Asset"}
          </h3>

          {/* Sparse data warning */}
          {asset.dataSparse && (
            <p
              className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1"
              data-testid={`text-sparse-${asset.id}`}
            >
              <span aria-hidden="true">⚠</span> Insufficient source data
            </p>
          )}

          {/* Metadata pill row — stage + modality */}
          {hasPills && (
            <div className="flex flex-wrap gap-1 mt-2">
              {stageLabel && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full select-none ${stagePillClass(stageLabel)} ${asset.stage_changed_at ? "ring-1 ring-amber-400/60" : ""}`}
                      data-testid={`pill-stage-${asset.id}`}
                    >
                      {stageLabel}
                      {asset.stage_changed_at && (
                        <span className="ml-1 text-amber-500 dark:text-amber-400" aria-label="stage changed">&#8593;</span>
                      )}
                    </span>
                  </TooltipTrigger>
                  {asset.stage_changed_at && asset.previous_stage && (
                    <TooltipContent side="bottom" className="text-xs">
                      Advanced from <span className="font-medium">{asset.previous_stage}</span>
                    </TooltipContent>
                  )}
                </Tooltip>
              )}
              {modalityLabel && (
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full select-none ${MODALITY_PILL_CLASS}`}
                  data-testid={`pill-modality-${asset.id}`}
                >
                  {modalityLabel}
                </span>
              )}
            </div>
          )}

          {/* Spacer — shorter now that pills fill center */}
          <div className="flex-1" />

          {/* Institution — bottom-aligned, legible secondary */}
          {institutionDisplay && (
            <p className="flex items-center gap-1 text-[11px] text-zinc-700 dark:text-zinc-200 font-medium leading-snug mb-2 line-clamp-1">
              <Building2 className="w-2.5 h-2.5 shrink-0 opacity-50" />
              <span data-testid={`text-institution-${asset.id}`}>{institutionDisplay}</span>
            </p>
          )}

          {/* CTA */}
          <button
            className="w-full h-7 rounded-md text-[11px] font-semibold tracking-wide bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-200 active:scale-95 hover:shadow-md hover:shadow-emerald-500/20"
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
  );
}

const STAGE_ABBREV: Record<string, string> = {
  discovery: "DI",
  preclinical: "PC",
  "phase 1": "P1",
  "phase 2": "P2",
  "phase 3": "P3",
  approved: "AP",
};

function stageAbbrev(stage: string): string {
  return STAGE_ABBREV[stage?.toLowerCase().trim()] ?? "—";
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

  const abbrev = stageAbbrev(asset.developmentStage);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (relY - 0.5) * -7, y: (relX - 0.5) * 7, active: true });
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
        className="relative rounded-[14px] overflow-hidden bg-white dark:bg-zinc-900 border border-white/90 dark:border-white/10"
        style={{
          willChange: "transform",
          transformStyle: "preserve-3d",
          transform: pressed
            ? "perspective(1000px) scale(0.97)"
            : tilt.active
            ? `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`
            : "perspective(1000px)",
          transition: pressed
            ? "transform 0.07s ease-in"
            : tilt.active
            ? "transform 0.08s ease-out"
            : "transform 0.5s cubic-bezier(0.23,1,0.32,1)",
          boxShadow: hovered
            ? "0 16px 48px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.10)"
            : "0 4px 20px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)",
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={handleMouseLeave}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        data-testid={`saved-card-${asset.id}`}
      >
        <div
          className="absolute pointer-events-none"
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "rgba(38, 122, 70, 0.55)",
            top: "-28px",
            left: "-28px",
            transform: hovered ? "scale(26)" : "scale(1)",
            opacity: hovered ? 0.13 : 0,
            transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
            zIndex: 1,
          }}
        />

        <div className="absolute left-0 top-0 bottom-0 w-[3px] z-[3]" style={{ background: "#22c55e" }} />

        <div
          className="absolute top-0 left-0 z-[5] flex flex-col items-center justify-center px-2 py-1 border-b border-r border-emerald-500/40 bg-white dark:bg-zinc-900"
          style={{ borderRadius: "17px 0 10px 0", minWidth: "36px" }}
          data-testid={`saved-stage-badge-${asset.id}`}
        >
          <span className="text-[8px] font-bold tracking-[0.15em] uppercase leading-none text-muted-foreground">Stage</span>
          <span className="font-mono text-xs font-bold leading-tight tabular-nums mt-0.5 text-emerald-600 dark:text-emerald-400">
            {abbrev !== "—" ? abbrev : <span className="opacity-40">—</span>}
          </span>
        </div>

        {/* Remove button */}
        <button
          className="absolute top-2 right-2 z-[5] w-6 h-6 rounded-md flex items-center justify-center bg-transparent text-emerald-600 dark:text-emerald-400 hover:text-red-500 hover:bg-red-500/10 transition-all duration-150 active:scale-90"
          onClick={() => onDelete(asset.id)}
          data-testid={`button-delete-saved-${asset.id}`}
          title="Remove from saved"
        >
          <BookmarkCheck className="w-3.5 h-3.5" />
        </button>

        <div className="relative z-[4] pt-8 pb-3 pl-4 pr-3 flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <FlaskConical className="w-3 h-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="font-semibold text-sm text-foreground truncate">{asset.assetName}</span>
          </div>

          {/* Institution chip */}
          {asset.sourceName && asset.sourceName !== "pubmed" && (
            <span className="self-start text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 truncate max-w-full">
              {asset.sourceName}
            </span>
          )}

          <div className="text-xs space-y-1">
            <div className="flex gap-1.5">
              <span className="text-muted-foreground w-14 shrink-0">Target</span>
              <span className="font-medium text-foreground truncate">{asset.target !== "unknown" ? asset.target : "—"}</span>
            </div>
            <div className="flex gap-1.5">
              <span className="text-muted-foreground w-14 shrink-0">Disease</span>
              <span className="font-medium text-foreground truncate">{asset.diseaseIndication !== "unknown" ? asset.diseaseIndication : "—"}</span>
            </div>
          </div>
          {asset.sourceUrl && (
            <a
              href={asset.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
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
