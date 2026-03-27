import { useState } from "react";
import { ExternalLink, BookOpen, FlaskConical, Calendar } from "lucide-react";
import type { ScoredAsset, SourceType } from "@/lib/types";

type SourceConfig = {
  label: string;
  stripClass: string;
  badgeClass: string;
  icon: React.ReactNode;
};

const SOURCE_CONFIG: Record<string, SourceConfig> = {
  paper: {
    label: "Paper",
    stripClass: "bg-blue-500",
    badgeClass: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30",
    icon: <BookOpen className="w-2.5 h-2.5" />,
  },
  preprint: {
    label: "Preprint",
    stripClass: "bg-violet-500",
    badgeClass: "text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/30",
    icon: <BookOpen className="w-2.5 h-2.5" />,
  },
  clinical_trial: {
    label: "Trial",
    stripClass: "bg-cyan-500",
    badgeClass: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
    icon: <FlaskConical className="w-2.5 h-2.5" />,
  },
  patent: {
    label: "Patent",
    stripClass: "bg-amber-500",
    badgeClass: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
    icon: <BookOpen className="w-2.5 h-2.5" />,
  },
  researcher: {
    label: "Researcher",
    stripClass: "bg-amber-400",
    badgeClass: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
    icon: <BookOpen className="w-2.5 h-2.5" />,
  },
  tech_transfer: {
    label: "TT Office",
    stripClass: "bg-emerald-500",
    badgeClass: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    icon: <FlaskConical className="w-2.5 h-2.5" />,
  },
};

const FALLBACK_SOURCE: SourceConfig = {
  label: "Signal",
  stripClass: "bg-zinc-400",
  badgeClass: "text-muted-foreground bg-muted border-border",
  icon: <BookOpen className="w-2.5 h-2.5" />,
};

type ResearchCardProps = {
  asset: ScoredAsset;
};

export function ResearchCard({ asset }: ResearchCardProps) {
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

  const excerpt = asset.summary
    ? asset.summary.length > 110
      ? asset.summary.slice(0, 107) + "..."
      : asset.summary
    : null;

  return (
    <div
      className="w-[190px] h-[254px] shrink-0 cursor-default"
      data-testid={`research-card-wrapper-${asset.id}`}
    >
      <div
        className="relative w-full h-full rounded-[17px] overflow-hidden"
        style={{
          background: "rgba(248,250,252,0.75)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          border: "1px solid rgba(226,232,240,0.90)",
          transform: pressed
            ? "scale(0.97)"
            : hovered
            ? "scale(1.02)"
            : "scale(1)",
          transition: pressed
            ? "transform 0.07s ease-in, box-shadow 0.1s"
            : "transform 0.4s cubic-bezier(0.23,1,0.32,1), box-shadow 0.35s",
          boxShadow: hovered
            ? "10px 14px 44px rgba(0,0,0,0.14)"
            : "6px 10px 28px rgba(0,0,0,0.10)",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setPressed(false); }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        data-testid={`research-card-${asset.id}`}
      >
        {/* Dark-mode glass overlay */}
        <div
          className="absolute inset-0 dark:block hidden"
          style={{
            background: "rgba(15,23,42,0.80)",
            borderRadius: "inherit",
          }}
        />

        {/* Source-type left accent strip */}
        <div className={`absolute left-0 top-0 bottom-0 w-[3px] z-10 ${config.stripClass}`} />

        {/* Content */}
        <div className="absolute inset-0 z-10 flex flex-col pl-4 pr-3 pt-3 pb-3">

          {/* Source type badge + year */}
          <div className="flex items-center justify-between gap-1 mb-2">
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-[0.12em] border ${config.badgeClass}`}
              data-testid={`research-source-type-${asset.id}`}
            >
              {config.icon}
              {config.label}
            </span>
            {yearStr && (
              <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground font-medium">
                <Calendar className="w-2.5 h-2.5" />
                {yearStr}
              </span>
            )}
          </div>

          {/* Title */}
          <h3
            className="text-[12px] font-semibold text-foreground leading-snug line-clamp-3 mb-1"
            data-testid={`text-research-title-${asset.id}`}
          >
            {displayTitle}
          </h3>

          {/* Institution */}
          {institution && (
            <p
              className="text-[10px] text-muted-foreground truncate mb-1"
              data-testid={`text-research-institution-${asset.id}`}
            >
              {institution}
            </p>
          )}

          {/* Excerpt */}
          {excerpt && (
            <p className="text-[10px] text-muted-foreground/80 leading-relaxed line-clamp-2 flex-1">
              {excerpt}
            </p>
          )}

          {/* Footer: target chip + link */}
          <div className="mt-auto pt-2 flex items-center justify-between gap-1">
            {asset.target && asset.target !== "unknown" && (
              <span className="text-[9px] bg-muted/60 dark:bg-muted/20 border border-border text-muted-foreground rounded px-1.5 py-0.5 truncate max-w-[90px] font-mono">
                {asset.target}
              </span>
            )}
            {rawUrl ? (
              <a
                href={rawUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-0.5 text-[10px] text-primary hover:text-primary/80 font-semibold transition-colors shrink-0"
                data-testid={`link-read-paper-${asset.id}`}
                onClick={(e) => e.stopPropagation()}
              >
                Read
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
