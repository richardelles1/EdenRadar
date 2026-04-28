import { useState } from "react";
import { ExternalLink, FlaskConical, Calendar, Building2, GraduationCap, Copy, Check, Activity, FileText } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { ScoredAsset } from "@/lib/types";

type ClinicalTrialCardProps = {
  asset: ScoredAsset;
};

const PHASE_STYLES: Record<string, { label: string; className: string }> = {
  "phase 3":    { label: "Phase 3",    className: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  "phase 2":    { label: "Phase 2",    className: "text-violet-700 dark:text-violet-400 bg-violet-500/10 border-violet-500/30" },
  "phase 1":    { label: "Phase 1",    className: "text-sky-700 dark:text-sky-400 bg-sky-500/10 border-sky-500/30" },
  "approved":   { label: "Approved",   className: "text-emerald-800 dark:text-emerald-300 bg-emerald-600/10 border-emerald-600/30" },
  "preclinical":{ label: "Preclinical",className: "text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/30" },
};

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  RECRUITING:             { label: "Recruiting",  className: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  ACTIVE_NOT_RECRUITING:  { label: "Active",       className: "text-sky-700 dark:text-sky-400 bg-sky-500/10 border-sky-500/30" },
  COMPLETED:              { label: "Completed",    className: "text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/30" },
  TERMINATED:             { label: "Terminated",   className: "text-rose-700 dark:text-rose-400 bg-rose-500/10 border-rose-500/30" },
  WITHDRAWN:              { label: "Withdrawn",    className: "text-rose-700 dark:text-rose-400 bg-rose-500/10 border-rose-500/30" },
  SUSPENDED:              { label: "Suspended",    className: "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/30" },
  NOT_YET_RECRUITING:     { label: "Not Started",  className: "text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/30" },
};

export function ClinicalTrialCard({ asset }: ClinicalTrialCardProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const signal = asset.signals?.[0];
  const nctId: string | null = (signal?.metadata?.nct_id as string) || null;
  const rawStatus: string = (signal?.metadata?.status as string) ?? "";
  const rawPhase: string = (signal?.metadata?.phase as string) ?? "";
  const conditions: string[] = (signal?.metadata?.conditions as string[]) ?? [];
  const interventionName: string = (signal?.metadata?.interventions as string) ?? "";
  const ownerType: "university" | "company" | "unknown" =
    (signal?.metadata?.owner_type as "university" | "company" | "unknown") ?? "unknown";

  const displayTitle =
    signal?.title && signal.title !== "unknown"
      ? signal.title
      : asset.asset_name !== "unknown"
      ? asset.asset_name
      : "Untitled Trial";

  const sponsor =
    asset.institution && asset.institution !== "unknown"
      ? asset.institution
      : asset.owner_name && asset.owner_name !== "unknown"
      ? asset.owner_name
      : signal?.authors_or_owner || null;

  const developmentStage = (asset.development_stage ?? "").toLowerCase().trim();
  const phaseStyle = PHASE_STYLES[developmentStage] ?? PHASE_STYLES["preclinical"];

  const statusStyle = STATUS_STYLES[rawStatus] ?? {
    label: rawStatus.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "Unknown",
    className: "text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/30",
  };

  const startDateStr = (() => {
    const raw = signal?.date ?? asset.latest_signal_date;
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  })();

  const startDateFull = (() => {
    const raw = signal?.date ?? asset.latest_signal_date;
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  })();

  const excerpt = asset.summary
    ? asset.summary.length > 110 ? asset.summary.slice(0, 107) + "..." : asset.summary
    : signal?.text
    ? signal.text.length > 110 ? signal.text.slice(0, 107) + "..." : signal.text
    : null;

  const trialUrl = asset.source_urls?.[0] ?? signal?.url ?? "";
  const drugName =
    asset.asset_name && asset.asset_name !== "unknown" ? asset.asset_name : interventionName || null;
  const conditionsDisplay = conditions.length > 0
    ? conditions.slice(0, 2).join(", ") + (conditions.length > 2 ? ` +${conditions.length - 2}` : "")
    : asset.indication && asset.indication !== "unknown" ? asset.indication : null;

  const stripColor = "#0d9488";
  const bloomColor = "rgba(13, 148, 136, 0.55)";

  function handleCopyId(e: React.MouseEvent) {
    e.stopPropagation();
    if (!nctId) return;
    navigator.clipboard.writeText(nctId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }

  return (
    <>
      <div
        className="w-full h-[260px] shrink-0 cursor-pointer"
        data-testid={`trial-card-wrapper-${asset.id}`}
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
          data-testid={`trial-card-${asset.id}`}
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

            {/* Top row: Trial badge + phase badge + date */}
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <div className="flex items-center gap-1 min-w-0">
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-[0.12em] border text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/30 shrink-0"
                  data-testid={`trial-badge-${asset.id}`}
                >
                  <FlaskConical className="w-2.5 h-2.5" />
                  Trial
                </span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[8px] font-bold uppercase tracking-[0.1em] border shrink-0 ${phaseStyle.className}`}
                  data-testid={`trial-phase-badge-${asset.id}`}
                >
                  {phaseStyle.label}
                </span>
              </div>
              {startDateStr && (
                <span className="flex items-center gap-0.5 text-[9px] font-medium text-zinc-500 dark:text-zinc-400 shrink-0">
                  <Calendar className="w-2.5 h-2.5" />
                  {startDateStr}
                </span>
              )}
            </div>

            {/* NCT number */}
            {nctId && (
              <p className="text-[9px] font-mono font-semibold text-teal-600/80 dark:text-teal-400/80 mb-0.5 tracking-wide"
                data-testid={`trial-nct-id-${asset.id}`}
              >
                {nctId}
              </p>
            )}

            {/* Title */}
            <h3
              className="text-[12px] font-semibold leading-snug line-clamp-2 mb-1 text-foreground"
              data-testid={`text-trial-title-${asset.id}`}
            >
              {displayTitle}
            </h3>

            {/* Drug/intervention name */}
            {drugName && (
              <p className="text-[10px] font-medium text-teal-700 dark:text-teal-300 truncate mb-1"
                data-testid={`trial-drug-name-${asset.id}`}
              >
                {drugName}
              </p>
            )}

            {/* Sponsor */}
            {sponsor && (
              <div className="flex items-center gap-1 mb-1">
                {ownerType === "university" ? (
                  <GraduationCap className="w-2.5 h-2.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : ownerType === "company" ? (
                  <Building2 className="w-2.5 h-2.5 shrink-0 text-sky-600 dark:text-sky-400" />
                ) : (
                  <Activity className="w-2.5 h-2.5 shrink-0 text-zinc-500" />
                )}
                <p
                  className="text-[10px] truncate text-zinc-700 dark:text-zinc-200 font-medium"
                  data-testid={`text-trial-sponsor-${asset.id}`}
                >
                  {sponsor}
                </p>
              </div>
            )}

            {/* Status + conditions */}
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              {rawStatus && (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[8px] font-bold uppercase tracking-[0.1em] border ${statusStyle.className}`}
                  data-testid={`trial-status-badge-${asset.id}`}
                >
                  {statusStyle.label}
                </span>
              )}
              {conditionsDisplay && (
                <span className="text-[9px] text-zinc-500 dark:text-zinc-400 truncate"
                  data-testid={`trial-conditions-${asset.id}`}
                >
                  {conditionsDisplay}
                </span>
              )}
            </div>

            {/* Summary excerpt */}
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
              {trialUrl && (
                <a
                  href={trialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-0.5 text-[10px] font-semibold text-teal-600 hover:text-teal-500 dark:text-teal-400 dark:hover:text-teal-300 transition-colors shrink-0"
                  data-testid={`link-view-trial-${asset.id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  View Trial
                  <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Detail drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg overflow-y-auto"
          data-testid={`trial-drawer-${asset.id}`}
        >
          <SheetHeader className="pb-4 border-b border-border">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-[0.12em] border text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/30">
                <FlaskConical className="w-2.5 h-2.5" />
                Clinical Trial
              </span>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-[0.1em] border ${phaseStyle.className}`}
                data-testid={`trial-drawer-phase-${asset.id}`}
              >
                {phaseStyle.label}
              </span>
              {rawStatus && (
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-[0.1em] border ${statusStyle.className}`}
                  data-testid={`trial-drawer-status-${asset.id}`}
                >
                  {statusStyle.label}
                </span>
              )}
            </div>
            <SheetTitle className="text-base font-semibold leading-snug text-left pr-8" data-testid={`trial-drawer-title-${asset.id}`}>
              {displayTitle}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-5 space-y-5">

            {/* NCT ID */}
            {nctId && (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Trial ID</p>
                  <p className="text-sm font-mono font-semibold text-teal-600 dark:text-teal-400" data-testid={`trial-drawer-nctid-${asset.id}`}>
                    {nctId}
                  </p>
                </div>
                <button
                  onClick={handleCopyId}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`button-copy-trial-id-${asset.id}`}
                  title="Copy NCT ID"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}

            {/* Sponsor */}
            {sponsor && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Sponsor</p>
                <div className="flex items-center gap-2">
                  {ownerType === "university" ? (
                    <GraduationCap className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : ownerType === "company" ? (
                    <Building2 className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-400" />
                  ) : (
                    <Activity className="w-4 h-4 shrink-0 text-zinc-500" />
                  )}
                  <span className="text-sm font-medium text-foreground" data-testid={`trial-drawer-sponsor-${asset.id}`}>
                    {sponsor}
                  </span>
                  {ownerType !== "unknown" && (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[8px] font-bold uppercase tracking-[0.1em] border ${
                      ownerType === "university"
                        ? "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25"
                        : "text-sky-700 dark:text-sky-400 bg-sky-500/10 border-sky-500/25"
                    }`}>
                      {ownerType === "university" ? "University / NIH" : "Industry"}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Conditions */}
            {conditions.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Conditions</p>
                <ul className="space-y-0.5" data-testid={`trial-drawer-conditions-${asset.id}`}>
                  {conditions.map((c, i) => (
                    <li key={i} className="text-sm text-foreground">{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Intervention / drug */}
            {drugName && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Intervention</p>
                <p className="text-sm text-foreground font-medium" data-testid={`trial-drawer-intervention-${asset.id}`}>
                  {drugName}
                </p>
                {interventionName && interventionName !== drugName && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">{interventionName}</p>
                )}
              </div>
            )}

            {/* Start date */}
            {startDateFull && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Start Date</p>
                <div className="flex items-center gap-1.5 text-sm text-foreground">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <span data-testid={`trial-drawer-start-date-${asset.id}`}>{startDateFull}</span>
                </div>
              </div>
            )}

            {/* Brief summary */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                Brief Summary
              </p>
              {signal?.text && signal.text.length > 20 ? (
                <p className="text-sm text-foreground leading-relaxed" data-testid={`trial-drawer-summary-${asset.id}`}>
                  {signal.text}
                </p>
              ) : asset.summary && asset.summary.length > 20 ? (
                <p className="text-sm text-foreground leading-relaxed" data-testid={`trial-drawer-summary-${asset.id}`}>
                  {asset.summary}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No summary available for this trial.</p>
              )}
            </div>

            {/* ClinicalTrials.gov link */}
            {trialUrl && (
              <div className="pt-2 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-[12px] border-teal-500/30 text-teal-700 dark:text-teal-400 hover:bg-teal-500/5"
                  asChild
                  data-testid={`button-view-trial-${asset.id}`}
                >
                  <a href={trialUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5" />
                    View on ClinicalTrials.gov
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
