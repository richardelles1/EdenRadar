import { useState } from "react";
import { ExternalLink, BookOpen, FlaskConical, Calendar } from "lucide-react";
import type { ScoredAsset, SourceType } from "@/lib/types";
import { SCOUT_CARD_TINTS } from "@/lib/scoutCardTints";
import { PipelinePicker } from "@/components/PipelinePicker";

type SourceConfig = {
  label: string;
  stripColor: string;
  bloomColor: string;
  badgeClass: string;
  icon: React.ReactNode;
};

const SOURCE_CONFIG: Record<string, SourceConfig> = {
  paper: {
    label: "Paper",
    stripColor: "#8b5cf6",
    bloomColor: "rgba(139, 92, 246, 0.55)",
    badgeClass: "text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/30",
    icon: <BookOpen className="w-2.5 h-2.5" />,
  },
  preprint: {
    label: "Preprint",
    stripColor: "#f59e0b",
    bloomColor: "rgba(245, 158, 11, 0.55)",
    badgeClass: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
    icon: <BookOpen className="w-2.5 h-2.5" />,
  },
  clinical_trial: {
    label: "Trial",
    stripColor: "#3b82f6",
    bloomColor: "rgba(59, 130, 246, 0.55)",
    badgeClass: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30",
    icon: <FlaskConical className="w-2.5 h-2.5" />,
  },
  patent: {
    label: "Patent",
    stripColor: "#f59e0b",
    bloomColor: "rgba(245, 158, 11, 0.55)",
    badgeClass: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
    icon: <BookOpen className="w-2.5 h-2.5" />,
  },
  researcher: {
    label: "Researcher",
    stripColor: "#f59e0b",
    bloomColor: "rgba(245, 158, 11, 0.55)",
    badgeClass: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
    icon: <BookOpen className="w-2.5 h-2.5" />,
  },
  tech_transfer: {
    label: "TT Office",
    stripColor: "#22c55e",
    bloomColor: "rgba(38, 122, 70, 0.55)",
    badgeClass: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    icon: <FlaskConical className="w-2.5 h-2.5" />,
  },
};

const FALLBACK_SOURCE: SourceConfig = {
  label: "Signal",
  stripColor: "#71717a",
  bloomColor: "rgba(113, 113, 122, 0.55)",
  badgeClass: "text-muted-foreground bg-muted border-border",
  icon: <BookOpen className="w-2.5 h-2.5" />,
};

type ResearchCardProps = {
  asset: ScoredAsset;
  isSaved?: boolean;
  hidePicker?: boolean;
  pipelineMode?: boolean;
};

export function ResearchCard({ asset, isSaved, hidePicker, pipelineMode }: ResearchCardProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const primarySourceType: string =
    asset.source_types?.find((t: SourceType) => t !== "tech_transfer") ??
    asset.source_types?.[0] ??
    "paper";

  const config = SOURCE_CONFIG[primarySourceType] ?? FALLBACK_SOURCE;

  const rawUrl = asset.source_urls?.[0] ?? asset.signals?.[0]?.url ?? "";

  const yearStr = asset.latest_signal_date
    ? new Date(asset.latest_signal_date).getFullYear().toString()
    : null;

  const institution =
    asset.institution && asset.institution !== "unknown"
      ? asset.institution
      : asset.owner_name && asset.owner_name !== "unknown"
      ? asset.owner_name
      : null;

  const displayTitle =
    asset.signals?.[0]?.title && asset.signals[0].title !== "unknown"
      ? asset.signals[0].title
      : asset.asset_name !== "unknown"
      ? asset.asset_name
      : "Untitled Signal";

  const journalName: string | null =
    (asset.signals?.[0]?.metadata?.journal as string) ??
    (asset.signals?.[0]?.metadata?.source as string) ??
    null;

  const excerpt = asset.summary
    ? asset.summary.length > 110
      ? asset.summary.slice(0, 107) + "..."
      : asset.summary
    : null;

  return (
    <div
      className="w-full h-[260px] shrink-0"
      data-testid={`research-card-wrapper-${asset.id}`}
    >
      <div
        className={`relative w-full h-full ${pipelineMode ? "rounded-t-[17px] rounded-b-none" : "rounded-[17px]"} overflow-hidden ${SCOUT_CARD_TINTS.research.containerBg} border border-white/90 dark:border-white/10`}
        style={{
          willChange: "transform",
          transform: pressed ? "scale(0.97)" : hovered ? "scale(1.01)" : "scale(1)",
          transition: pressed
            ? "transform 0.07s ease-in, box-shadow 0.1s"
            : "transform 0.35s cubic-bezier(0.23,1,0.32,1), box-shadow 0.35s",
          boxShadow: hovered
            ? "0 14px 40px rgba(0,0,0,0.16), 0 3px 10px rgba(0,0,0,0.10)"
            : "0 4px 20px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setPressed(false); }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        data-testid={`research-card-${asset.id}`}
      >
        {/* Subtle bloom — same transparent treatment as TTO cards */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: config.bloomColor,
            top: "-28px",
            left: "-28px",
            transform: hovered ? "scale(26)" : "scale(1)",
            transformOrigin: "center center",
            opacity: hovered ? 0.13 : 0,
            transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
            zIndex: 1,
          }}
        />

        {/* Source-type left accent strip */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] z-[3]"
          style={{ background: SCOUT_CARD_TINTS.research.stripColor }}
        />

        {/* Tinted header zone */}
        <div
          className="absolute top-0 left-0 right-0 z-[2]"
          style={{ height: "56px", background: `${SCOUT_CARD_TINTS.research.stripColor}0d`, borderBottom: `1px solid ${SCOUT_CARD_TINTS.research.stripColor}26` }}
        />

        {/* Type label in header */}
        <div className="absolute top-0 left-[10px] right-10 z-[4] h-[56px] flex items-center gap-1.5 pointer-events-none">
          <BookOpen className={`w-3.5 h-3.5 ${config.badgeClass.split(" ").filter(c => c.startsWith("text-")).join(" ")}`} />
          <span className={`text-[11px] font-bold uppercase tracking-[0.1em] ${config.badgeClass.split(" ").filter(c => c.startsWith("text-")).join(" ")}`}>
            {config.label}
          </span>
        </div>

        {/* PipelinePicker — top-right */}
        {!hidePicker && (
          <div
            className="absolute top-2.5 right-2.5 z-[5]"
            onClick={(e) => e.stopPropagation()}
          >
            <PipelinePicker
              payload={{
                asset_name: asset.asset_name,
                target: asset.target,
                modality: asset.modality,
                development_stage: asset.development_stage,
                disease_indication: asset.indication,
                summary: asset.summary,
                source_title: asset.signals?.[0]?.title ?? asset.asset_name,
                source_journal: journalName ?? (asset.institution !== "unknown" ? asset.institution : "Unknown"),
                publication_year: asset.latest_signal_date?.slice(0, 4) ?? "Unknown",
                source_name: primarySourceType,
                source_url: rawUrl || null,
                pmid: asset.id,
              }}
              alreadySaved={isSaved}
              iconClassName="w-8 h-8 rounded-lg"
            />
          </div>
        )}

        {/* Content */}
        <div className="absolute inset-0 z-[4] flex flex-col gap-2 pl-4 pr-8 pt-[62px] pb-3">

          {/* Title */}
          <h3
            className="text-[13px] font-semibold leading-snug line-clamp-3 text-foreground"
            data-testid={`text-research-title-${asset.id}`}
          >
            {displayTitle}
          </h3>

          {/* Journal name */}
          {journalName && (
            <p className="text-[11px] font-medium truncate text-zinc-500 dark:text-zinc-400">
              {journalName}
            </p>
          )}

          {/* Institution */}
          {institution && (
            <p
              className="text-[11px] truncate text-zinc-700 dark:text-zinc-200 font-medium"
              data-testid={`text-research-institution-${asset.id}`}
            >
              {institution}
            </p>
          )}

          {/* Excerpt */}
          <p className="text-[11px] leading-relaxed line-clamp-2 text-zinc-500 dark:text-zinc-400" style={{ minHeight: "40px" }}>
            {excerpt ?? ""}
          </p>

          {/* Footer */}
          <div className="mt-auto pt-1 flex items-center justify-between gap-1">
            {yearStr ? (
              <span className="flex items-center gap-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
                <Calendar className="w-3 h-3" />
                {yearStr}
              </span>
            ) : asset.target && asset.target !== "unknown" ? (
              <span className="text-[10px] rounded px-1.5 py-0.5 truncate max-w-[90px] font-mono bg-muted/60 dark:bg-muted/20 border border-border text-zinc-500 dark:text-zinc-400">
                {asset.target}
              </span>
            ) : null}
            {rawUrl && (
              <a
                href={rawUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-0.5 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors shrink-0"
                data-testid={`link-read-paper-${asset.id}`}
                onClick={(e) => e.stopPropagation()}
              >
                Read Paper
                <ExternalLink className="w-3 h-3 ml-0.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
