import { useState } from "react";
import { ExternalLink, BookOpen, FlaskConical, Calendar } from "lucide-react";
import type { ScoredAsset, SourceType } from "@/lib/types";

type SourceConfig = {
  label: string;
  stripColor: string;
  fillGradient: string;
  badgeClass: string;
  icon: React.ReactNode;
};

// Colors: paper=violet, preprint=amber, clinical_trial=blue, patent=amber, researcher=amber, tech_transfer=emerald
const SOURCE_CONFIG: Record<string, SourceConfig> = {
  paper: {
    label: "Paper",
    stripColor: "#8b5cf6",
    fillGradient: "linear-gradient(135deg, #4c1d95, #2e1065)",
    badgeClass: "text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/30",
    icon: <BookOpen className="w-2.5 h-2.5" />,
  },
  preprint: {
    label: "Preprint",
    stripColor: "#f59e0b",
    fillGradient: "linear-gradient(135deg, #92400e, #451a03)",
    badgeClass: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
    icon: <BookOpen className="w-2.5 h-2.5" />,
  },
  clinical_trial: {
    label: "Trial",
    stripColor: "#3b82f6",
    fillGradient: "linear-gradient(135deg, #1e3a8a, #0f172a)",
    badgeClass: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30",
    icon: <FlaskConical className="w-2.5 h-2.5" />,
  },
  patent: {
    label: "Patent",
    stripColor: "#f59e0b",
    fillGradient: "linear-gradient(135deg, #92400e, #451a03)",
    badgeClass: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
    icon: <BookOpen className="w-2.5 h-2.5" />,
  },
  researcher: {
    label: "Researcher",
    stripColor: "#f59e0b",
    fillGradient: "linear-gradient(135deg, #92400e, #451a03)",
    badgeClass: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
    icon: <BookOpen className="w-2.5 h-2.5" />,
  },
  tech_transfer: {
    label: "TT Office",
    stripColor: "#22c55e",
    fillGradient: "linear-gradient(135deg, #267a46, #0f3d22)",
    badgeClass: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    icon: <FlaskConical className="w-2.5 h-2.5" />,
  },
};

const FALLBACK_SOURCE: SourceConfig = {
  label: "Signal",
  stripColor: "#71717a",
  fillGradient: "linear-gradient(135deg, #3f3f46, #18181b)",
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

  // Journal from signal metadata or institution fallback
  const journalName: string | null =
    (asset.signals?.[0]?.metadata?.journal as string) ??
    (asset.signals?.[0]?.metadata?.source as string) ??
    null;

  const excerpt = asset.summary
    ? asset.summary.length > 100
      ? asset.summary.slice(0, 97) + "..."
      : asset.summary
    : null;

  return (
    <div
      className="w-full h-[260px] shrink-0"
      data-testid={`research-card-wrapper-${asset.id}`}
    >
      <div
        className="relative w-full h-full rounded-[17px] overflow-hidden bg-white/80 dark:bg-zinc-900/85 border border-white/90 dark:border-white/10"
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
        {/* Fill circle — from top-left */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            background: config.fillGradient,
            top: "-24px",
            left: "-24px",
            transform: hovered ? "scale(28)" : "scale(1)",
            transformOrigin: "center center",
            transition: "transform 0.4s cubic-bezier(0.4,0,0.2,1)",
            zIndex: 1,
          }}
        />

        {/* Source-type left accent strip */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] z-[3]"
          style={{ background: config.stripColor }}
        />

        {/* Content */}
        <div className="absolute inset-0 z-[4] flex flex-col pl-4 pr-3 pt-3 pb-3">

          {/* Source badge + year */}
          <div className="flex items-center justify-between gap-1 mb-2">
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-[0.12em] border transition-colors duration-500 ${
                hovered ? "border-white/30 bg-white/10 text-white/80" : config.badgeClass
              }`}
              data-testid={`research-source-type-${asset.id}`}
            >
              {config.icon}
              {config.label}
            </span>
            {yearStr && (
              <span
                className={`flex items-center gap-0.5 text-[9px] font-medium transition-colors duration-500 ${
                  hovered ? "" : "text-muted-foreground"
                }`}
                style={{ color: hovered ? "rgba(255,255,255,0.55)" : undefined }}
              >
                <Calendar className="w-2.5 h-2.5" />
                {yearStr}
              </span>
            )}
          </div>

          {/* Title */}
          <h3
            className={`text-[12px] font-semibold leading-snug line-clamp-3 mb-1 transition-colors duration-500 ${
              hovered ? "" : "text-foreground"
            }`}
            style={{ color: hovered ? "#ffffff" : undefined }}
            data-testid={`text-research-title-${asset.id}`}
          >
            {displayTitle}
          </h3>

          {/* Journal name */}
          {journalName && (
            <p
              className={`text-[9px] font-semibold uppercase tracking-wide truncate mb-0.5 transition-colors duration-500 ${
                hovered ? "" : "text-muted-foreground/60"
              }`}
              style={{ color: hovered ? "rgba(255,255,255,0.45)" : undefined }}
            >
              {journalName}
            </p>
          )}

          {/* Institution */}
          {institution && (
            <p
              className={`text-[10px] truncate mb-1 transition-colors duration-500 ${
                hovered ? "" : "text-muted-foreground"
              }`}
              style={{ color: hovered ? "rgba(255,255,255,0.60)" : undefined }}
              data-testid={`text-research-institution-${asset.id}`}
            >
              {institution}
            </p>
          )}

          {/* Excerpt */}
          {excerpt && (
            <p
              className={`text-[10px] leading-relaxed line-clamp-2 flex-1 transition-colors duration-500 ${
                hovered ? "" : "text-muted-foreground/75"
              }`}
              style={{ color: hovered ? "rgba(255,255,255,0.50)" : undefined }}
            >
              {excerpt}
            </p>
          )}

          {/* Footer */}
          <div className="mt-auto pt-2 flex items-center justify-between gap-1">
            {asset.target && asset.target !== "unknown" && (
              <span
                className={`text-[9px] rounded px-1.5 py-0.5 truncate max-w-[90px] font-mono transition-colors duration-500 ${
                  hovered
                    ? "bg-white/15 text-white/70 border border-white/20"
                    : "bg-muted/60 dark:bg-muted/20 border border-border text-muted-foreground"
                }`}
              >
                {asset.target}
              </span>
            )}
            {rawUrl && (
              <a
                href={rawUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`ml-auto flex items-center gap-0.5 text-[10px] font-semibold transition-colors shrink-0 ${
                  hovered ? "" : "text-primary hover:text-primary/80"
                }`}
                style={{ color: hovered ? "rgba(255,255,255,0.85)" : undefined }}
                data-testid={`link-read-paper-${asset.id}`}
                onClick={(e) => e.stopPropagation()}
              >
                Read Paper
                <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
