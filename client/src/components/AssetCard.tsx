import { useState, useRef } from "react";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { BookmarkCheck, Building2, FlaskConical, ExternalLink, TrendingUp, Info } from "lucide-react";
import { PipelinePicker } from "./PipelinePicker";
import type { ScoredAsset, ScoreBreakdown } from "@/lib/types";
import type { SavedAsset } from "@shared/schema";
import { useLocation } from "wouter";
import { SCOUT_CARD_TINTS } from "@/lib/scoutCardTints";
import type { ScoutCardCategory } from "@/lib/scoutCardTints";
import { useIsMobile } from "@/hooks/use-mobile";

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

const SCORE_BREAKDOWN_KEYS = ["search_relevance", "fit", "record_quality", "availability"] as const;
type BreakdownKey = typeof SCORE_BREAKDOWN_KEYS[number];

const BREAKDOWN_LABELS: Record<BreakdownKey, string> = {
  search_relevance: "Query Match",
  fit: "Fit",
  record_quality: "Record Quality",
  availability: "Availability",
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

function ScoreBreakdownRows({
  breakdown,
  isUnscored,
}: {
  breakdown: ScoreBreakdown | null | undefined;
  isUnscored: boolean;
}) {
  if (isUnscored || !breakdown) {
    return <p className="text-[11px] text-muted-foreground">No score data available for this asset.</p>;
  }
  // TTO assets use search_relevance (query match) as primary dimension — fit is zero and meaningless for them.
  // Legacy assets (papers, patents, trials) use fit instead.
  const isTTO = breakdown.dimension_basis != null && "search_relevance" in breakdown.dimension_basis;
  const visibleKeys: BreakdownKey[] = isTTO
    ? ["search_relevance", "record_quality", "availability"]
    : ["fit", "record_quality", "availability"];
  return (
    <div className="space-y-2.5">
      {visibleKeys.map((k) => {
        const val = breakdown[k as keyof ScoreBreakdown] as number | undefined;
        const basis = breakdown.dimension_basis?.[k];
        const displayVal = typeof val === "number" ? Math.round(val) : null;
        const t: TierKey = displayVal !== null && displayVal >= 75 ? "high" : displayVal !== null && displayVal >= 50 ? "mid" : "low";
        return (
          <div key={k} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-foreground w-24 shrink-0">{BREAKDOWN_LABELS[k]}</span>
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${t === "high" ? "bg-emerald-500/70" : t === "mid" ? "bg-amber-500/70" : "bg-muted-foreground/40"}`}
                  style={{ width: displayVal !== null ? `${displayVal}%` : "0%" }}
                />
              </div>
              <span className={`text-[11px] font-mono font-semibold w-7 text-right tabular-nums ${displayVal !== null ? TIER_SCORE_TEXT[t] : "text-muted-foreground"}`}>
                {displayVal !== null ? `${displayVal}%` : "—"}
              </span>
            </div>
            {basis && (
              <p className="text-[10px] text-muted-foreground leading-snug pl-0.5">{basis}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

const PILL_MUTED_TEXT = "text-zinc-500 dark:text-zinc-400";

function stagePillClass(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes("phase 3") || s.includes("phase iii") || s.includes("approved") || s.includes("marketed")) {
    return `bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-700/30 border-l-emerald-400/90 dark:border-l-emerald-500/60 ${PILL_MUTED_TEXT}`;
  }
  if (s.includes("phase 2") || s.includes("phase ii")) {
    return `bg-violet-50 dark:bg-violet-950/40 border border-violet-200/70 dark:border-violet-700/30 border-l-violet-400/90 dark:border-l-violet-500/60 ${PILL_MUTED_TEXT}`;
  }
  if (s.includes("phase 1") || s.includes("phase i") || s.includes("phase i/ii")) {
    return `bg-sky-50 dark:bg-sky-950/40 border border-sky-200/70 dark:border-sky-700/30 border-l-sky-400/90 dark:border-l-sky-500/60 ${PILL_MUTED_TEXT}`;
  }
  return `bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-700/30 border-l-emerald-400/80 dark:border-l-emerald-500/50 text-emerald-700 dark:text-emerald-400`;
}

const MODALITY_PILL_CLASS = "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-700/40 text-emerald-700 dark:text-emerald-400";

function getCardCategory(sourceTypes?: string[]): ScoutCardCategory {
  if (!sourceTypes?.length) return "research";
  if (sourceTypes.includes("tech_transfer")) return "tto";
  if (sourceTypes.includes("clinical_trial")) return "trial";
  if (sourceTypes.includes("patent")) return "patent";
  return "research";
}

const CATEGORY_BLOOM: Record<ScoutCardCategory, string> = {
  tto:      "rgba(16, 185, 129, 0.55)",
  trial:    "rgba(13, 148, 136, 0.55)",
  patent:   "rgba(217, 119, 6, 0.55)",
  research: "rgba(14, 165, 233, 0.55)",
};

const CATEGORY_LABEL: Record<ScoutCardCategory, string> = {
  tto:      "TTO Asset",
  trial:    "Clinical Trial",
  patent:   "Patent",
  research: "Research Paper",
};

const CATEGORY_LABEL_COLOR: Record<ScoutCardCategory, string> = {
  tto:      "text-emerald-600 dark:text-emerald-400",
  trial:    "text-teal-600 dark:text-teal-400",
  patent:   "text-amber-600 dark:text-amber-400",
  research: "text-sky-600 dark:text-sky-400",
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
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();

  const isUnscored = asset.score === 0 || (asset.score_breakdown?.signal_coverage ?? 0) === 0;
  const isResearcherPublished = asset.source_types?.includes("researcher");
  const cardCategory = getCardCategory(asset.source_types);
  const tint = SCOUT_CARD_TINTS[cardCategory];
  const tier = scoreTier(asset.score, isUnscored);
  const isLimitedData = asset.dataSparse === true ||
    (asset.completeness_score !== null && asset.completeness_score !== undefined && asset.completeness_score <= 40);

  const classUnknown = false; // suppressed — fires on ~80% of cards, adds noise not signal

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
  const indicationLabel = asset.indication && asset.indication !== "unknown" ? asset.indication : null;
  const hasPills = stageLabel || modalityLabel || classUnknown;

  const handleViewDossier = () => {
    sessionStorage.setItem(`asset-${asset.id}`, JSON.stringify(asset));
    setLocation(`/asset/${asset.id}`);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current || breakdownOpen) return;
    const rect = cardRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    const x = Math.max(-2.5, Math.min(2.5, (relY - 0.5) * -4));
    const y = Math.max(-2.5, Math.min(2.5, (relX - 0.5) * 4));
    setTilt({ x, y, active: true });
  };

  const handleMouseLeave = () => {
    setHovered(false);
    setTilt({ x: 0, y: 0, active: false });
    setPressed(false);
  };

  return (
    <div
      style={{ perspective: "1000px" }}
      className="cursor-pointer w-full h-[320px] shrink-0"
      onClick={handleViewDossier}
      data-testid={`asset-card-wrapper-${asset.id}`}
    >
      <div
        ref={cardRef}
        className={`relative w-full h-full rounded-[17px] overflow-hidden ${tint.containerBg} border border-white/90 dark:border-white/10`}
        style={{
          willChange: "transform",
          transformStyle: "preserve-3d",
          transform: pressed
            ? `perspective(1000px) scale(0.96) rotateZ(0.4deg)`
            : (tilt.active && !breakdownOpen)
            ? `perspective(1000px) scale(1.015) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`
            : `perspective(1000px)`,
          transition: pressed
            ? "transform 0.07s ease-in, box-shadow 0.1s"
            : (tilt.active && !breakdownOpen)
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
            background: CATEGORY_BLOOM[cardCategory],
            top: "-28px",
            left: "-28px",
            transform: hovered ? "scale(26)" : "scale(1)",
            transformOrigin: "center center",
            opacity: hovered ? 0.13 : 0,
            transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
            zIndex: 1,
          }}
        />

        {/* Tinted header zone */}
        <div
          className="absolute top-0 left-0 right-0 z-[2]"
          style={{ height: "56px", background: `${tint.stripColor}0d`, borderBottom: `1px solid ${tint.stripColor}26` }}
        />

        {/* Left accent strip — z-[3], sibling of badge at z-[5] */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] z-[3]"
          style={{ background: tint.stripColor }}
        />

        {/* Source type label — centered in top strip between score badge and bookmark */}
        <div className="absolute top-0 left-[52px] right-10 z-[4] h-[52px] flex items-center justify-center pointer-events-none">
          <span className={`text-[11px] font-bold uppercase tracking-[0.08em] ${CATEGORY_LABEL_COLOR[cardCategory]}`}>
            {CATEGORY_LABEL[cardCategory]}{isResearcherPublished ? " · Researcher" : ""}
          </span>
        </div>

        {/* Score badge — flush top-left. Click/hover → breakdown popover (desktop) or bottom sheet (mobile). */}
        {isMobile ? (
          <>
            <div
              className={`
                absolute top-0 left-0 z-[5]
                flex flex-col items-center justify-center
                px-3 py-1.5
                border-b border-r
                bg-white dark:bg-zinc-900
                ${TIER_BORDER_BOTTOM_RIGHT[tier]}
                cursor-pointer select-none
              `}
              style={{ borderRadius: "17px 0 10px 0", minWidth: "52px" }}
              data-testid="score-badge"
              onClick={(e) => { e.stopPropagation(); setBreakdownOpen(true); }}
            >
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase leading-none text-muted-foreground">Score</span>
              <span className={`font-mono text-2xl font-bold leading-tight tabular-nums mt-0.5 ${TIER_SCORE_TEXT[tier]}`}>
                {scoreDisplay !== null ? scoreDisplay : <span className="opacity-40 text-lg">—</span>}
              </span>
            </div>
            <Sheet open={breakdownOpen} onOpenChange={setBreakdownOpen}>
              <SheetContent side="bottom" className="px-4 pt-4 pb-8 rounded-t-2xl" onClick={(e) => e.stopPropagation()} data-testid="score-breakdown-sheet">
                <SheetHeader className="mb-4">
                  <SheetTitle className="flex items-center gap-2 text-sm">
                    <Info className="w-4 h-4 text-muted-foreground" />
                    Score breakdown
                  </SheetTitle>
                </SheetHeader>
                <ScoreBreakdownRows breakdown={asset.score_breakdown} isUnscored={isUnscored} />
              </SheetContent>
            </Sheet>
          </>
        ) : (
          <Popover open={breakdownOpen} onOpenChange={setBreakdownOpen}>
            <PopoverTrigger asChild>
              <div
                className={`
                  absolute top-0 left-0 z-[5]
                  flex flex-col items-center justify-center
                  px-3 py-1.5
                  border-b border-r
                  bg-white dark:bg-zinc-900
                  ${TIER_BORDER_BOTTOM_RIGHT[tier]}
                  cursor-pointer select-none
                `}
                style={{ borderRadius: "17px 0 10px 0", minWidth: "52px" }}
                data-testid="score-badge"
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={() => setBreakdownOpen(true)}
                onMouseLeave={() => setBreakdownOpen(false)}
              >
                <span className="text-[9px] font-bold tracking-[0.15em] uppercase leading-none text-muted-foreground">Score</span>
                <span className={`font-mono text-2xl font-bold leading-tight tabular-nums mt-0.5 ${TIER_SCORE_TEXT[tier]}`}>
                  {scoreDisplay !== null ? scoreDisplay : <span className="opacity-40 text-lg">—</span>}
                </span>
              </div>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="start"
              className="p-3 w-64 shadow-xl z-[50]"
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={() => setBreakdownOpen(true)}
              onMouseLeave={() => setBreakdownOpen(false)}
              data-testid="score-breakdown-popover"
            >
              <div className="flex items-center gap-1.5 mb-2.5">
                <Info className="w-3 h-3 text-muted-foreground shrink-0" />
                <p className="text-xs font-semibold">Score breakdown</p>
              </div>
              <ScoreBreakdownRows breakdown={asset.score_breakdown} isUnscored={isUnscored} />
            </PopoverContent>
          </Popover>
        )}

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
        <div className="absolute inset-0 z-[4] flex flex-col gap-3 pl-4 pr-3 pt-[56px] pb-3">


          {/* Title — natural height, mt-2 for breathing room below badge */}
          <h3
            className="text-[13px] font-semibold text-foreground leading-snug line-clamp-3 mt-2"
            data-testid={`text-asset-name-${asset.id}`}
          >
            {asset.asset_name !== "unknown" ? asset.asset_name : "Unnamed Asset"}
          </h3>

          {/* Indication — what disease this targets; content-level info, sits below title as text not a pill */}
          {indicationLabel && (
            <p
              className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug line-clamp-1"
              data-testid={`text-indication-${asset.id}`}
            >
              {indicationLabel}
            </p>
          )}

          {/* Description — 2 lines always; cascade summary → why_it_matters → fallback */}
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 leading-snug line-clamp-3" style={{ minHeight: "52px" }}>
            {(asset.summary?.length ?? 0) > 80
              ? asset.summary
              : (asset.why_it_matters?.length ?? 0) > 50
              ? asset.why_it_matters
              : "Full detail on mechanism, IP status, and licensing readiness is available in the dossier."}
          </p>

          {/* Metadata pill row — stage + modality + status signals */}
          {hasPills && (
            <div className="flex flex-wrap gap-1.5">
              {stageLabel && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-sm border-l-2 select-none ${stagePillClass(stageLabel)} ${asset.stage_changed_at ? "ring-1 ring-amber-400/60" : ""}`}
                      data-testid={`pill-stage-${asset.id}`}
                    >
                      {stageLabel}
                      {asset.stage_changed_at && (
                        <span className="ml-1 text-amber-500 dark:text-amber-400" aria-label="stage changed">&#8593;</span>
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {asset.stage_changed_at && asset.previous_stage
                      ? <>Advanced from <span className="font-medium">{asset.previous_stage}</span></>
                      : "Development stage — from early discovery through clinical trials"}
                  </TooltipContent>
                </Tooltip>
              )}
              {modalityLabel && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-sm select-none ${MODALITY_PILL_CLASS}`}
                      data-testid={`pill-modality-${asset.id}`}
                    >
                      {modalityLabel}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Drug delivery format — how the therapeutic is administered or engineered
                  </TooltipContent>
                </Tooltip>
              )}
              {classUnknown && (
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-sm select-none bg-zinc-100 dark:bg-zinc-700/50 border border-zinc-200/80 dark:border-zinc-600/50 text-zinc-500 dark:text-zinc-400`}
                  title="Asset class unknown — partial data"
                  data-testid={`pill-class-unknown-${asset.id}`}
                >
                  Class unknown
                </span>
              )}
              {isLimitedData && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-sm select-none bg-amber-50 dark:bg-amber-900/20 border border-amber-200/70 dark:border-amber-700/40 text-amber-600 dark:text-amber-400"
                      data-testid={`pill-limited-data-${asset.id}`}
                    >
                      Limited data
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                    Partial enrichment — indication, modality, or mechanism may be incomplete.
                  </TooltipContent>
                </Tooltip>
              )}
              {(asset.momentum_score ?? 0) >= 40 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-sm select-none bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/70 dark:border-emerald-700/40 text-emerald-600 dark:text-emerald-400"
                      data-testid={`pill-rising-${asset.id}`}
                    >
                      <TrendingUp className="w-2.5 h-2.5" />
                      Rising
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[220px]">
                    {asset.stage_changed_at
                      ? `Stage advanced${asset.previous_stage ? ` from ${asset.previous_stage}` : ""} · `
                      : ""}
                    Gaining traction — momentum score {asset.momentum_score}/100
                  </TooltipContent>
                </Tooltip>
              )}
              {(asset.source_types?.length ?? 0) >= 2 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-sm select-none cursor-default ${
                        (asset.source_types?.length ?? 0) >= 4
                          ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/70 dark:border-emerald-700/40 text-emerald-600 dark:text-emerald-400"
                          : "bg-sky-50 dark:bg-sky-900/20 border border-sky-200/70 dark:border-sky-700/40 text-sky-600 dark:text-sky-400"
                      }`}
                      data-testid={`pill-multisource-${asset.id}`}
                    >
                      {asset.source_types!.length} sources
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[220px]">
                    Corroborated across {asset.source_types!.length} source types — stronger evidence signal
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          )}


          {/* Institution — pushed to bottom, legible secondary */}
          {institutionDisplay && (
            <p className="flex items-center gap-1.5 text-[11px] text-zinc-700 dark:text-zinc-200 font-medium leading-snug line-clamp-1">
              <Building2 className="w-2.5 h-2.5 shrink-0 opacity-50" />
              <span data-testid={`text-institution-${asset.id}`}>{institutionDisplay}</span>
              {(asset.institutions?.length ?? 0) > 1 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="ml-0.5 inline-flex items-center px-1.5 py-0 rounded-sm text-[9px] font-semibold bg-zinc-100 dark:bg-zinc-700/60 text-zinc-500 dark:text-zinc-300 border border-zinc-200/70 dark:border-zinc-600/50 select-none cursor-default leading-4"
                      data-testid={`badge-institutions-${asset.id}`}
                    >
                      +{asset.institutions!.length - 1}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[260px]">
                    Also available from: {asset.institutions!.filter((inst) => inst !== institutionDisplay).join(", ")}
                  </TooltipContent>
                </Tooltip>
              )}
            </p>
          )}

          {/* CTA */}
          <div className="flex items-center gap-1">
            <button
              className="flex-1 h-7 rounded-md text-[11px] font-semibold tracking-wide bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-200 active:scale-95 hover:shadow-md hover:shadow-emerald-500/20"
              onClick={(e) => {
                e.stopPropagation();
                handleViewDossier();
              }}
              data-testid={`button-dossier-${asset.id}`}
            >
              Asset Dossier
            </button>
            <button
              className="h-7 px-2 rounded-md text-[10px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
              title="Mark not relevant — improves your future ranking"
              onClick={(e) => {
                e.stopPropagation();
                const numericId = Number(asset.id);
                if (!Number.isFinite(numericId)) return;
                fetch("/api/feedback", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ assetId: numericId, action: "dismiss", source: "scout" }),
                  credentials: "include",
                }).catch(() => {});
              }}
              data-testid={`button-dismiss-${asset.id}`}
            >
              ✕
            </button>
          </div>
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
    const x = Math.max(-2.5, Math.min(2.5, (relY - 0.5) * -4));
    const y = Math.max(-2.5, Math.min(2.5, (relX - 0.5) * 4));
    setTilt({ x, y, active: true });
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
            background: CATEGORY_BLOOM[cardCategory],
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
            <span className="self-start text-[10px] px-1.5 py-0.5 rounded-sm bg-transparent text-emerald-700 dark:text-emerald-300 border border-primary/20 truncate max-w-full">
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
