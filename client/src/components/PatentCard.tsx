import { useState } from "react";
import { ExternalLink, ScrollText, Calendar, Building2, GraduationCap } from "lucide-react";
import type { ScoredAsset } from "@/lib/types";

type PatentCardProps = {
  asset: ScoredAsset;
};

export function PatentCard({ asset }: PatentCardProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const signal = asset.signals?.[0];
  const patentId: string | null = (signal?.metadata?.patent_id as string) ?? null;
  const ownerType: "university" | "company" | "unknown" =
    (signal?.metadata?.owner_type as "university" | "company" | "unknown") ?? "unknown";
  const filingDate: string | null = (signal?.metadata?.filing_date as string) ?? null;

  const displayTitle =
    signal?.title && signal.title !== "unknown"
      ? signal.title
      : asset.asset_name !== "unknown"
      ? asset.asset_name
      : "Untitled Patent";

  const assignee =
    asset.institution && asset.institution !== "unknown"
      ? asset.institution
      : asset.owner_name && asset.owner_name !== "unknown"
      ? asset.owner_name
      : null;

  const grantDateStr = (() => {
    const raw = asset.latest_signal_date || filingDate;
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  })();

  const excerpt = asset.summary
    ? asset.summary.length > 110
      ? asset.summary.slice(0, 107) + "..."
      : asset.summary
    : signal?.text
    ? signal.text.length > 110
      ? signal.text.slice(0, 107) + "..."
      : signal.text
    : null;

  const patentUrl = asset.source_urls?.[0] ?? signal?.url ?? "";

  const stripColor = "#d97706";
  const bloomColor = "rgba(217, 119, 6, 0.55)";

  return (
    <div
      className="w-full h-[260px] shrink-0"
      data-testid={`patent-card-wrapper-${asset.id}`}
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
        data-testid={`patent-card-${asset.id}`}
      >
        {/* Bloom */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: bloomColor,
            top: "-28px",
            left: "-28px",
            transform: hovered ? "scale(26)" : "scale(1)",
            transformOrigin: "center center",
            opacity: hovered ? 0.13 : 0,
            transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
            zIndex: 1,
          }}
        />

        {/* Left accent strip */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] z-[3]"
          style={{ background: stripColor }}
        />

        {/* Content */}
        <div className="absolute inset-0 z-[4] flex flex-col pl-4 pr-3 pt-3 pb-3">

          {/* Top row: Patent badge + year */}
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-[0.12em] border text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30"
              data-testid={`patent-badge-${asset.id}`}
            >
              <ScrollText className="w-2.5 h-2.5" />
              Patent
            </span>
            {grantDateStr && (
              <span className="flex items-center gap-0.5 text-[9px] font-medium text-zinc-500 dark:text-zinc-400">
                <Calendar className="w-2.5 h-2.5" />
                {grantDateStr}
              </span>
            )}
          </div>

          {/* Patent number */}
          {patentId && (
            <p className="text-[9px] font-mono font-semibold text-amber-600/80 dark:text-amber-400/80 mb-0.5 tracking-wide"
              data-testid={`patent-id-${asset.id}`}
            >
              US{patentId}
            </p>
          )}

          {/* Title */}
          <h3
            className="text-[12px] font-semibold leading-snug line-clamp-3 mb-1.5 text-foreground"
            data-testid={`text-patent-title-${asset.id}`}
          >
            {displayTitle}
          </h3>

          {/* Assignee */}
          {assignee && (
            <div className="flex items-center gap-1 mb-1">
              {ownerType === "university" ? (
                <GraduationCap className="w-2.5 h-2.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : ownerType === "company" ? (
                <Building2 className="w-2.5 h-2.5 shrink-0 text-sky-600 dark:text-sky-400" />
              ) : null}
              <p
                className="text-[10px] truncate text-zinc-700 dark:text-zinc-200 font-medium"
                data-testid={`text-patent-assignee-${asset.id}`}
              >
                {assignee}
              </p>
            </div>
          )}

          {/* Owner type badge */}
          {ownerType !== "unknown" && (
            <span
              className={`self-start inline-flex items-center px-1.5 py-0.5 rounded-sm text-[8px] font-bold uppercase tracking-[0.1em] border mb-1 ${
                ownerType === "university"
                  ? "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25"
                  : "text-sky-700 dark:text-sky-400 bg-sky-500/10 border-sky-500/25"
              }`}
              data-testid={`patent-owner-type-${asset.id}`}
            >
              {ownerType === "university" ? "University" : "Company"}
            </span>
          )}

          {/* Abstract excerpt */}
          {excerpt && (
            <p className="text-[10px] leading-relaxed line-clamp-2 flex-1 text-zinc-500 dark:text-zinc-400">
              {excerpt}
            </p>
          )}

          {/* Footer */}
          <div className="mt-auto pt-1.5 flex items-center justify-end gap-1">
            {patentUrl && (
              <a
                href={patentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300 transition-colors shrink-0"
                data-testid={`link-view-patent-${asset.id}`}
                onClick={(e) => e.stopPropagation()}
              >
                View Patent
                <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
