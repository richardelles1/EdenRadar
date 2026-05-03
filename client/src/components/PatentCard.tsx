import { useState } from "react";
import { ExternalLink, ScrollText, Calendar, Building2, GraduationCap, Copy, Check, Users, FileText, Bookmark } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PipelinePicker } from "@/components/PipelinePicker";
import type { ScoredAsset } from "@/lib/types";

type PatentCardProps = {
  asset: ScoredAsset;
  isSaved?: boolean;
  onSave?: () => void;
  onUnsave?: () => void;
};

export function PatentCard({ asset, isSaved, onSave, onUnsave }: PatentCardProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const signal = asset.signals?.[0];
  const patentId: string | null = (signal?.metadata?.patent_id as string) ?? null;
  const ownerType: "university" | "company" | "unknown" =
    (signal?.metadata?.owner_type as "university" | "company" | "unknown") ?? "unknown";
  const filingDate: string | null = (signal?.metadata?.filing_date as string) ?? null;
  const patentStatus: "patented" | "pending" | null =
    (signal?.metadata?.patent_status as "patented" | "pending") ?? null;
  const abstract: string | null =
    (signal?.metadata?.abstract as string) ??
    (signal?.text && signal.text !== signal?.title ? signal.text : null) ??
    null;

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

  const inventors: string[] = signal?.authors_or_owner
    ? signal.authors_or_owner.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const grantDateStr = (() => {
    const raw = asset.latest_signal_date || filingDate;
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  })();

  const filingDateStr = (() => {
    if (!filingDate) return null;
    const d = new Date(filingDate);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
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

  function handleCopyId(e: React.MouseEvent) {
    e.stopPropagation();
    if (!patentId) return;
    navigator.clipboard.writeText(`US${patentId}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }

  return (
    <>
      <div
        className="w-full h-[260px] shrink-0 cursor-pointer"
        data-testid={`patent-card-wrapper-${asset.id}`}
        onClick={() => setOpen(true)}
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
            <div className="mt-auto pt-1.5 flex items-center justify-between gap-1">
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500 italic">
                Click to expand
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <div onClick={(e) => e.stopPropagation()}>
                  <PipelinePicker
                    payload={{
                      asset_name: asset.asset_name,
                      target: asset.target,
                      modality: asset.modality,
                      development_stage: asset.development_stage,
                      disease_indication: asset.indication,
                      summary: asset.summary,
                      source_title: signal?.title ?? asset.asset_name,
                      source_journal: asset.institution !== "unknown" ? asset.institution : "Unknown",
                      publication_year: asset.latest_signal_date?.slice(0, 4) ?? "Unknown",
                      source_name: "patent",
                      source_url: asset.source_urls?.[0] ?? null,
                      pmid: patentId ?? asset.id,
                    }}
                    alreadySaved={isSaved}
                    iconClassName="w-5 h-5 rounded"
                  />
                </div>
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
    </div>

      {/* Detail drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg overflow-y-auto"
          data-testid={`patent-drawer-${asset.id}`}
        >
          <SheetHeader className="pb-4 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-[0.12em] border text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30">
                <ScrollText className="w-2.5 h-2.5" />
                Patent
              </span>
              {patentStatus && (
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-[0.1em] border ${
                  patentStatus === "patented"
                    ? "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25"
                    : "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/25"
                }`}
                  data-testid={`patent-drawer-status-${asset.id}`}
                >
                  {patentStatus === "patented" ? "Granted" : "Pending"}
                </span>
              )}
            </div>
            <SheetTitle className="text-base font-semibold leading-snug text-left pr-8" data-testid={`patent-drawer-title-${asset.id}`}>
              {displayTitle}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-5 space-y-5">

            {/* Application number */}
            {patentId && (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Application Number</p>
                  <p className="text-sm font-mono font-semibold text-amber-600 dark:text-amber-400" data-testid={`patent-drawer-appnum-${asset.id}`}>
                    US{patentId}
                  </p>
                </div>
                <button
                  onClick={handleCopyId}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`button-copy-patent-id-${asset.id}`}
                  title="Copy application number"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}

            {/* Assignee */}
            {assignee && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Assignee</p>
                <div className="flex items-center gap-2">
                  {ownerType === "university" ? (
                    <GraduationCap className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : ownerType === "company" ? (
                    <Building2 className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-400" />
                  ) : null}
                  <span className="text-sm font-medium text-foreground" data-testid={`patent-drawer-assignee-${asset.id}`}>
                    {assignee}
                  </span>
                  {ownerType !== "unknown" && (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[8px] font-bold uppercase tracking-[0.1em] border ${
                      ownerType === "university"
                        ? "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25"
                        : "text-sky-700 dark:text-sky-400 bg-sky-500/10 border-sky-500/25"
                    }`}>
                      {ownerType === "university" ? "University" : "Company"}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Filing date */}
            {filingDateStr && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Filing Date</p>
                <div className="flex items-center gap-1.5 text-sm text-foreground">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <span data-testid={`patent-drawer-filing-date-${asset.id}`}>{filingDateStr}</span>
                </div>
              </div>
            )}

            {/* Inventors */}
            {inventors.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Inventor{inventors.length !== 1 ? "s" : ""}
                </p>
                <div className="flex items-start gap-1.5">
                  <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <ul className="space-y-0.5" data-testid={`patent-drawer-inventors-${asset.id}`}>
                    {inventors.map((inv, i) => (
                      <li key={i} className="text-sm text-foreground">{inv}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Abstract */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                Abstract
              </p>
              {abstract ? (
                <p className="text-sm text-foreground leading-relaxed" data-testid={`patent-drawer-abstract-${asset.id}`}>
                  {abstract}
                </p>
              ) : asset.summary && asset.summary.length > 20 ? (
                <p className="text-sm text-foreground leading-relaxed" data-testid={`patent-drawer-abstract-${asset.id}`}>
                  {asset.summary}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic">Abstract not available for this application.</p>
              )}
            </div>

            {/* USPTO link */}
            {patentUrl && (
              <div className="pt-2 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-[12px] border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/5"
                  asChild
                  data-testid={`button-view-uspto-${asset.id}`}
                >
                  <a href={patentUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5" />
                    View on USPTO PatentCenter
                  </a>
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
