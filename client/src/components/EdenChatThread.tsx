import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronDown, ThumbsUp, ThumbsDown, ExternalLink, Download, Bookmark, BookmarkCheck, FlaskConical, FileSearch, Library, Bell, CheckCircle2, Loader2, X, Pencil } from "lucide-react";
import { EdenAvatar, MarkdownContent, getFollowUpPills } from "@/components/EdenOrb";
import { PipelinePicker, type PipelinePickerPayload } from "@/components/PipelinePicker";
import { getAuthHeaders } from "@/lib/queryClient";
import type { ChatAsset, ChatMessage, ExternalResult, ActionOffer, AlertOfferConfig, WriteActionOffer } from "@/hooks/useEdenChat";

// Top-5 biology taxonomy values that cover 15k+ assets — too generic to be
// meaningful as a card badge. The values below signal "this is a cancer/infection/etc."
// rather than anything specific about THIS asset's mechanism.
const GENERIC_BIOLOGY = new Set([
  "pathogen replication",        // 5,700 assets
  "structural protein defect",   // 2,852
  "oncogenic transcription",     // 2,786
  "immune evasion",              // 2,631
  "gene expression deficiency",  // 2,267
]);

function sortAssetsByMention(assets: ChatAsset[], content: string): ChatAsset[] {
  if (!assets.length || !content) return assets;
  const lower = content.toLowerCase();
  const UNMENTIONED = 999999;
  return [...assets].sort((a, b) => {
    const posA = lower.indexOf(a.assetName.toLowerCase().slice(0, 30));
    const posB = lower.indexOf(b.assetName.toLowerCase().slice(0, 30));
    return (posA === -1 ? UNMENTIONED : posA) - (posB === -1 ? UNMENTIONED : posB);
  });
}

function relevanceLabel(sim: number): { label: string; cls: string } {
  if (sim >= 0.85) return { label: "Strong match", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" };
  if (sim >= 0.70) return { label: "Good match", cls: "bg-primary/10 text-primary border-primary/20" };
  if (sim >= 0.55) return { label: "Possible fit", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" };
  return { label: "Exploratory", cls: "bg-muted text-muted-foreground border-border" };
}

function modalityBadgeClass(m?: string): string {
  if (!m) return "bg-muted text-muted-foreground border-border";
  const lm = m.toLowerCase();
  if (lm.includes("antibody") || lm.includes("bispecific")) return "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20";
  if (lm.includes("small") || lm.includes("molecule")) return "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20";
  if (lm.includes("gene") || lm.includes("cell") || lm.includes("rna") || lm.includes("mrna")) return "bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/20";
  if (lm.includes("platform") || lm.includes("diagnostic") || lm.includes("device")) return "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20";
  return "bg-muted text-muted-foreground border-border";
}

function modalityLeftBorder(m?: string): string {
  if (!m) return "border-l-border/60";
  const lm = m.toLowerCase();
  if (lm.includes("antibody") || lm.includes("bispecific")) return "border-l-indigo-500/50";
  if (lm.includes("small") || lm.includes("molecule")) return "border-l-rose-500/50";
  if (lm.includes("gene") || lm.includes("cell") || lm.includes("rna") || lm.includes("mrna")) return "border-l-pink-500/50";
  if (lm.includes("platform") || lm.includes("diagnostic") || lm.includes("device")) return "border-l-teal-500/50";
  return "border-l-emerald-500/40";
}

function exportCitationsAsCsv(assets: ChatAsset[]): void {
  const headers = ["Asset Name", "Institution", "Indication", "Modality", "Development Stage", "Biology Class", "IP Type", "Source URL", "Relevance Score"];
  const rows = assets.map((a) => [
    a.assetName,
    a.institution,
    (a.indication && a.indication !== "unknown") ? a.indication : "",
    a.modality || "",
    a.developmentStage || "",
    a.biology || "",
    a.ipType || "",
    a.sourceUrl || "",
    a.similarity.toFixed(3),
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "eden-assets.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

const SOURCE_META: Record<string, { label: string; Icon: React.ComponentType<{ className?: string }>; pill: string; border: string }> = {
  clinicaltrials: { label: "ClinicalTrials.gov", Icon: FlaskConical, pill: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20", border: "border-l-blue-500/50" },
  patents:        { label: "Lens.org Patents",   Icon: FileSearch,   pill: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20", border: "border-l-violet-500/50" },
  harvard:        { label: "Harvard Library",    Icon: Library,      pill: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20", border: "border-l-amber-500/50" },
};

const STATUS_PILL: Record<string, string> = {
  RECRUITING:             "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  "NOT_YET_RECRUITING":   "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  ACTIVE_NOT_RECRUITING:  "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25",
  COMPLETED:              "bg-muted text-muted-foreground border-border",
  TERMINATED:             "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/25",
  WITHDRAWN:              "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/25",
};

function ExternalResultCard({
  result,
  bookmarkedIds,
  onBookmark,
  compact = false,
}: {
  result: ExternalResult;
  bookmarkedIds: Set<string>;
  onBookmark: (r: ExternalResult) => void;
  compact?: boolean;
}) {
  const meta = SOURCE_META[result.source] ?? SOURCE_META.clinicaltrials;
  const { Icon } = meta;
  const isBookmarked = bookmarkedIds.has(result.id);
  const statusKey = (result.status ?? "").toUpperCase().replace(/\s+/g, "_");
  const statusCls = STATUS_PILL[statusKey] ?? "bg-muted text-muted-foreground border-border";

  return (
    <div className={`rounded-xl border bg-card flex flex-col gap-1.5 hover:shadow-md transition-all border-l-[3px] ${meta.border} hover:border-current/30 ${compact ? "p-3" : "p-3.5"}`}>
      {/* Source badge + title */}
      <div className="flex items-start justify-between gap-2">
        <p className={`font-bold text-foreground leading-snug line-clamp-2 flex-1 ${compact ? "text-[11px]" : "text-xs"}`}>{result.title}</p>
        <span className={`font-medium border rounded px-1.5 py-0.5 shrink-0 flex items-center gap-1 ${meta.pill} ${compact ? "text-[9px]" : "text-[10px]"}`}>
          <Icon className="h-2.5 w-2.5 shrink-0" />
          {meta.label}
        </span>
      </div>

      {/* Sponsor */}
      {result.sponsor && (
        <p className={`text-muted-foreground leading-none truncate ${compact ? "text-[10px]" : "text-[11px]"}`}>{result.sponsor}</p>
      )}

      {/* Status + date badges */}
      <div className="flex flex-wrap gap-1 mt-0.5">
        {result.status && (
          <span className={`font-medium border rounded px-1.5 py-0.5 ${statusCls} ${compact ? "text-[9px]" : "text-[10px]"}`}>
            {result.status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
          </span>
        )}
        {result.date && (
          <span className={`font-medium border rounded px-1.5 py-0.5 bg-muted text-muted-foreground border-border ${compact ? "text-[9px]" : "text-[10px]"}`}>
            {result.date.slice(0, 7)}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mt-0.5 pt-1.5 border-t border-border/50">
        <button
          onClick={() => onBookmark(result)}
          title={isBookmarked ? "Bookmarked" : "Bookmark this result"}
          className={`flex items-center gap-1 transition-colors ${compact ? "text-[10px]" : "text-[11px]"} ${isBookmarked ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/60 hover:text-emerald-600 dark:hover:text-emerald-400"}`}
        >
          {isBookmarked
            ? <BookmarkCheck className="h-3 w-3 shrink-0" />
            : <Bookmark className="h-3 w-3 shrink-0" />}
          {isBookmarked ? "Saved" : "Save"}
        </button>
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 ${compact ? "text-[10px]" : "text-[11px]"}`}
        >
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          View source
        </a>
      </div>
    </div>
  );
}

function ExternalResultsPanel({
  results,
  source,
  bookmarkedIds,
  onBookmark,
  compact = false,
}: {
  results: ExternalResult[];
  source: string;
  bookmarkedIds: Set<string>;
  onBookmark: (r: ExternalResult) => void;
  compact?: boolean;
}) {
  if (!results.length) return null;
  const meta = SOURCE_META[source] ?? SOURCE_META.clinicaltrials;
  const { Icon } = meta;
  return (
    <div className="mt-3" data-testid="external-results-panel">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Live from {meta.label}</span>
        <span className="text-[10px] text-muted-foreground/50">· {results.length} result{results.length !== 1 ? "s" : ""}</span>
      </div>
      <div className={compact ? "flex flex-col gap-1.5" : "grid grid-cols-1 sm:grid-cols-2 gap-2"}>
        {results.map((r, i) => (
          <div key={r.id} style={{ animation: "em-fade-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both", animationDelay: `${i * 60}ms` }}>
            <ExternalResultCard result={r} bookmarkedIds={bookmarkedIds} onBookmark={onBookmark} compact={compact} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CitationCard({ asset, index, savedIngestedIds, onAssetSaved, compact = false }: {
  asset: ChatAsset;
  index: number;
  savedIngestedIds: Set<number>;
  onAssetSaved?: (asset: { modality?: string | null; indication?: string | null }) => void;
  compact?: boolean;
}) {
  const [, setLocation] = useLocation();
  const { label, cls } = relevanceLabel(asset.similarity);
  const leftBorder = modalityLeftBorder(asset.modality);
  const isSaved = savedIngestedIds.has(asset.id);
  const payload: PipelinePickerPayload = {
    asset_name: asset.assetName,
    target: asset.target || "unknown",
    modality: asset.modality || "unknown",
    development_stage: asset.developmentStage || "unknown",
    disease_indication: asset.indication || "unknown",
    summary: asset.summary || "",
    source_title: asset.assetName,
    source_journal: asset.institution,
    publication_year: "",
    source_name: asset.sourceName || "tto",
    source_url: asset.sourceUrl ?? null,
    ingested_asset_id: asset.id,
  };
  return (
    <div
      className={`rounded-xl border bg-card flex flex-col gap-1.5 hover:shadow-md transition-all border-l-[3px] ${leftBorder} hover:border-emerald-500/30 ${compact ? "p-3" : "p-3.5"}`}
      data-testid={`citation-card-${index}`}
    >
      {/* Title + relevance badge */}
      <div className="flex items-start justify-between gap-2">
        <p className={`font-bold text-foreground leading-snug line-clamp-2 flex-1 ${compact ? "text-[11px]" : "text-xs"}`}>{asset.assetName}</p>
        <span className={`font-medium border rounded px-1.5 py-0.5 shrink-0 ${cls} ${compact ? "text-[9px]" : "text-[10px]"}`}>{label}</span>
      </div>

      {/* Institution */}
      <p className={`text-muted-foreground leading-none ${compact ? "text-[10px]" : "text-[11px]"}`}>{asset.institution}</p>

      {/* Indication — the disease/area, most important contextual field */}
      {asset.indication && asset.indication !== "unknown" && (
        <p className={`text-foreground/70 leading-none truncate ${compact ? "text-[9px]" : "text-[10px]"}`} title={asset.indication}>
          {asset.indication.length > 48 ? asset.indication.slice(0, 48) + "…" : asset.indication}
        </p>
      )}

      {/* Modality / stage / IP / biology / rank badges */}
      <div className="flex flex-wrap gap-1 mt-0.5">
        {asset.modality && asset.modality !== "unknown" && (
          <span className={`font-medium border rounded px-1.5 py-0.5 ${modalityBadgeClass(asset.modality)} ${compact ? "text-[9px]" : "text-[10px]"}`}>
            {asset.modality.length > (compact ? 20 : 22) ? asset.modality.slice(0, compact ? 20 : 22) + "…" : asset.modality}
          </span>
        )}
        {asset.developmentStage && asset.developmentStage !== "unknown" && (
          <span className={`font-medium border rounded px-1.5 py-0.5 bg-muted text-muted-foreground border-border ${compact ? "text-[9px]" : "text-[10px]"}`}>
            {asset.developmentStage}
          </span>
        )}
        {!compact && asset.ipType && (
          <span className="text-[10px] font-medium border rounded px-1.5 py-0.5 bg-muted text-muted-foreground border-border">
            {asset.ipType}
          </span>
        )}
        {!compact && asset.biology && !GENERIC_BIOLOGY.has(asset.biology) && (
          <span className="text-[10px] font-medium border rounded px-1.5 py-0.5 bg-violet-500/8 text-violet-700 dark:text-violet-400 border-violet-500/20" title={asset.biology}>
            {asset.biology.length > 28 ? asset.biology.slice(0, 28) + "…" : asset.biology}
          </span>
        )}
        {asset.rankNote && (
          <span className="text-[9px] font-medium border rounded px-1.5 py-0.5 bg-emerald-500/8 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" title="Why this was ranked here">
            ↑ {asset.rankNote}
          </span>
        )}
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between mt-0.5 pt-1.5 border-t border-border/50">
        <div className="flex items-center gap-2">
          <PipelinePicker payload={payload} alreadySaved={isSaved} onSaved={() => onAssetSaved?.({ modality: asset.modality, indication: asset.indication })} />
          <button
            onClick={() => setLocation(`/asset/${asset.id}`)}
            className={`text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors ${compact ? "text-[10px]" : "text-[11px]"}`}
            data-testid={`citation-dossier-${index}`}
          >
            <FileSearch className="h-2.5 w-2.5 shrink-0" />
            Dossier
          </button>
        </div>
        {asset.sourceUrl && (
          <a
            href={asset.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 ${compact ? "text-[10px]" : "text-[11px]"}`}
            data-testid={`citation-link-${index}`}
          >
            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            Source
          </a>
        )}
      </div>
    </div>
  );
}

function ActionOffers({
  offers,
  savedIngestedIds,
  onCreateAlert,
  onAssetSaved,
  compact = false,
}: {
  offers: ActionOffer[];
  savedIngestedIds: Set<number>;
  onCreateAlert?: (config: AlertOfferConfig) => Promise<void>;
  onAssetSaved?: (asset: { modality?: string | null; indication?: string | null }) => void;
  compact?: boolean;
}) {
  const [alertStates, setAlertStates] = useState<Record<number, "idle" | "pending" | "creating" | "done" | "dismissed">>({});
  const [cadences, setCadences] = useState<Record<number, "daily" | "weekly">>({});
  const [writeStates, setWriteStates] = useState<Record<string, "idle" | "executing" | "done" | "error">>({});

  const saveOffers = offers.filter((o): o is Extract<ActionOffer, { type: "save" }> => o.type === "save");
  const alertOffers = offers.filter((o): o is Extract<ActionOffer, { type: "alert" }> => o.type === "alert");
  const writeOffers = offers.filter((o): o is WriteActionOffer => o.type === "status_update" || o.type === "note_add" || o.type === "move_pipeline");

  if (saveOffers.length === 0 && alertOffers.length === 0 && writeOffers.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 mt-2 ml-0.5" data-testid="action-offers">
      {saveOffers.map((offer, oi) => {
        const unsaved = offer.assets.filter((a) => !savedIngestedIds.has(a.id));
        if (unsaved.length === 0) return null;
        return (
          <div key={`save-${oi}`} className="flex flex-wrap items-center gap-1.5">
            <span className={`flex items-center gap-1 text-muted-foreground ${compact ? "text-[10px]" : "text-[11px]"}`}>
              <Bookmark className="h-3 w-3 shrink-0" />
              {offer.targetPipelineName ? `Save to "${offer.targetPipelineName}":` : "Save to pipeline:"}
            </span>
            {unsaved.map((a) => {
              const payload: PipelinePickerPayload = {
                asset_name: a.assetName,
                modality: a.modality || undefined,
                development_stage: a.developmentStage || undefined,
                disease_indication: (a.indication && a.indication !== "unknown") ? a.indication : undefined,
                source_name: "tto",
                source_url: a.sourceUrl ?? null,
                ingested_asset_id: a.id,
              };
              return (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5"
                  data-testid={`save-offer-asset-${a.id}`}
                >
                  <span className={`max-w-[130px] truncate text-foreground font-medium ${compact ? "text-[10px]" : "text-[11px]"}`}>{a.assetName}</span>
                  <PipelinePicker payload={payload} alreadySaved={savedIngestedIds.has(a.id)} defaultPipelineName={offer.targetPipelineName} onSaved={() => onAssetSaved?.({ modality: a.modality, indication: a.indication })} />
                </span>
              );
            })}
          </div>
        );
      })}

      {alertOffers.map((offer, oi) => {
        const state = alertStates[oi] ?? "idle";
        if (state === "dismissed") return null;
        const setOiState = (s: "idle" | "pending" | "creating" | "done" | "dismissed") => setAlertStates((prev) => ({ ...prev, [oi]: s }));
        const cadence = cadences[oi] ?? offer.config.cadence ?? "weekly";
        return (
          <div key={`alert-${oi}`} className="flex flex-wrap items-center gap-1.5" data-testid={`alert-offer-${oi}`}>
            {state === "idle" && (
              <button
                className={`flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/5 text-muted-foreground hover:text-foreground hover:border-amber-500/50 hover:bg-amber-500/10 px-2.5 py-1 transition-all ${compact ? "text-[10px]" : "text-[11px]"}`}
                onClick={() => setOiState("pending")}
                data-testid={`alert-offer-chip-${oi}`}
              >
                <Bell className="h-3 w-3 shrink-0" />
                Watch: {offer.label}
              </button>
            )}
            {state === "pending" && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5">
                <Bell className="h-3 w-3 text-amber-500 shrink-0" />
                <span className={`font-medium text-foreground ${compact ? "text-[10px]" : "text-[11px]"}`}>{offer.config.name}</span>
                {offer.config.institutions?.map((inst) => (
                  <span key={inst} className={`bg-muted rounded px-1.5 py-0.5 text-muted-foreground ${compact ? "text-[9px]" : "text-[10px]"}`}>{inst}</span>
                ))}
                {offer.config.modalities?.map((m) => (
                  <span key={m} className={`bg-muted rounded px-1.5 py-0.5 text-muted-foreground ${compact ? "text-[9px]" : "text-[10px]"}`}>{m}</span>
                ))}
                {offer.config.stages?.map((s) => (
                  <span key={s} className={`bg-muted rounded px-1.5 py-0.5 text-muted-foreground ${compact ? "text-[9px]" : "text-[10px]"}`}>{s}</span>
                ))}
                <div className={`flex items-center gap-0.5 border border-amber-500/20 rounded-full overflow-hidden ${compact ? "text-[9px]" : "text-[10px]"}`}>
                  {(["daily", "weekly"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCadences((prev) => ({ ...prev, [oi]: c }))}
                      className={`px-1.5 py-0.5 capitalize transition-colors ${cadence === c ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground hover:text-foreground"}`}
                      data-testid={`alert-offer-cadence-${c}-${oi}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <button
                  className={`font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 transition-colors ${compact ? "text-[10px]" : "text-[11px]"}`}
                  onClick={async () => {
                    if (!onCreateAlert) return;
                    setOiState("creating");
                    try { await onCreateAlert({ ...offer.config, cadence }); setOiState("done"); }
                    catch { setOiState("pending"); }
                  }}
                  data-testid={`alert-offer-create-${oi}`}
                >
                  Create alert
                </button>
                <button
                  className={`text-muted-foreground/50 hover:text-muted-foreground transition-colors ${compact ? "text-[9px]" : "text-[10px]"}`}
                  onClick={() => setOiState("dismissed")}
                  data-testid={`alert-offer-dismiss-${oi}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            {state === "creating" && (
              <div className={`flex items-center gap-1.5 text-muted-foreground ${compact ? "text-[10px]" : "text-[11px]"}`}>
                <Loader2 className="h-3 w-3 animate-spin" />
                Creating alert...
              </div>
            )}
            {state === "done" && (
              <div className={`flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 ${compact ? "text-[10px]" : "text-[11px]"}`}>
                <CheckCircle2 className="h-3 w-3" />
                Alert created
              </div>
            )}
          </div>
        );
      })}

      {writeOffers.map((offer, wi) => {
        const key = `${offer.type}-${offer.ingestedAssetId}-${wi}`;
        const wState = writeStates[key] ?? "idle";
        const isSaved = savedIngestedIds.has(offer.ingestedAssetId);
        if (!isSaved) return null; // only show for assets already in pipeline

        const execute = async () => {
          setWriteStates((prev) => ({ ...prev, [key]: "executing" }));
          try {
            const payload =
              offer.type === "status_update" ? { status: offer.status } :
              offer.type === "note_add" ? { content: offer.content } :
              { pipelineName: offer.pipelineName };
            const authHeaders = await getAuthHeaders();
            const res = await fetch("/api/eden/write-action", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders },
              body: JSON.stringify({ type: offer.type, ingestedAssetId: offer.ingestedAssetId, payload }),
            });
            setWriteStates((prev) => ({ ...prev, [key]: res.ok ? "done" : "error" }));
          } catch {
            setWriteStates((prev) => ({ ...prev, [key]: "error" }));
          }
        };

        return (
          <div key={key} className="flex flex-wrap items-center gap-1.5">
            <span className={`flex items-center gap-1 text-muted-foreground ${compact ? "text-[10px]" : "text-[11px]"}`}>
              <Pencil className="h-3 w-3 shrink-0" />
              {offer.type === "status_update" ? "Update status:" : offer.type === "note_add" ? "Add note:" : "Move to pipeline:"}
            </span>
            {wState === "idle" && (
              <button
                onClick={execute}
                className={`rounded-full border border-blue-500/30 bg-blue-500/8 text-blue-700 dark:text-blue-400 px-2.5 py-0.5 font-medium hover:bg-blue-500/15 transition-colors ${compact ? "text-[10px]" : "text-[11px]"}`}
              >
                {offer.label}
              </button>
            )}
            {wState === "executing" && (
              <span className={`flex items-center gap-1 text-muted-foreground ${compact ? "text-[10px]" : "text-[11px]"}`}>
                <Loader2 className="h-3 w-3 animate-spin" /> Working...
              </span>
            )}
            {wState === "done" && (
              <span className={`flex items-center gap-1 text-emerald-600 dark:text-emerald-400 ${compact ? "text-[10px]" : "text-[11px]"}`}>
                <CheckCircle2 className="h-3 w-3" /> Done
              </span>
            )}
            {wState === "error" && (
              <span className={`text-destructive ${compact ? "text-[10px]" : "text-[11px]"}`}>Failed — try again</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export type EdenChatThreadProps = {
  messages: ChatMessage[];
  streaming: boolean;
  messageFeedback: Record<number, "up" | "down">;
  expandedCitations: Record<number, boolean>;
  savedIngestedIds: Set<number>;
  bookmarkedIds: Set<string>;
  onFeedback: (i: number, sentiment: "up" | "down") => void;
  onBookmark: (result: ExternalResult) => void;
  onSend: (q: string) => void;
  onToggleCitations: (i: number, open: boolean) => void;
  onCreateAlert?: (config: AlertOfferConfig) => Promise<void>;
  onAssetSaved?: (asset: { modality?: string | null; indication?: string | null }) => void;
  compact?: boolean;
  chatEndRef?: React.RefObject<HTMLDivElement>;
};

export function EdenChatThread({
  messages,
  streaming,
  messageFeedback,
  expandedCitations,
  savedIngestedIds,
  bookmarkedIds,
  onFeedback,
  onBookmark,
  onSend,
  onToggleCitations,
  onCreateAlert,
  onAssetSaved,
  compact = false,
  chatEndRef,
}: EdenChatThreadProps) {
  const avatarSize = compact ? 18 : 22;
  const gridCols = compact ? "flex flex-col gap-1.5" : "grid grid-cols-1 sm:grid-cols-2 gap-2";

  return (
    <div className={compact ? "px-3 py-3 space-y-4" : "px-4 sm:px-6 py-5 space-y-5 max-w-3xl w-full mx-auto"}>
      {messages.map((msg, i) => {
        const followUps = !msg.isStreaming && msg.role === "assistant" && msg.content
          ? getFollowUpPills(msg.content, (msg.assets?.length ?? 0) > 0 || (msg.externalResults?.length ?? 0) > 0)
          : [];

        return (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            style={{
              animation: msg.role === "user"
                ? "em-slide-user 320ms cubic-bezier(0.16, 1, 0.3, 1) both"
                : "em-slide-assistant 320ms cubic-bezier(0.16, 1, 0.3, 1) both",
            }}
            data-testid={`chat-msg-${i}`}
          >
            {msg.role === "assistant" && (
              <div className={`shrink-0 mt-1 ${compact ? "mr-1.5" : "mr-2"}`}>
                <EdenAvatar isThinking={!!(msg.isStreaming)} size={avatarSize} />
              </div>
            )}

            <div className={`${msg.role === "user" ? "max-w-[78%]" : "flex-1 min-w-0"}`}>
              {/* Bubble */}
              <div className={`${
                msg.role === "user"
                  ? `rounded-2xl rounded-tr-sm px-${compact ? "3" : "4"} py-${compact ? "2" : "2.5"} bg-emerald-600 text-white ${compact ? "text-xs" : "text-sm"} ml-auto w-fit shadow-sm`
                  : `rounded-2xl rounded-tl-sm px-${compact ? "3" : "4"} py-${compact ? "2" : "3"} bg-muted/50 border-l-2 border-l-emerald-500/${compact ? "40" : "50"} text-foreground`
              }`}>
                {msg.role === "assistant" && msg.isStreaming && !msg.content && (
                  <div className="flex gap-1 items-center py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 animate-bounce" style={{ animationDelay: "130ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 animate-bounce" style={{ animationDelay: "260ms" }} />
                  </div>
                )}
                {msg.role === "user" && (
                  <p className={`leading-relaxed ${compact ? "text-xs" : "text-sm"}`}>{msg.content}</p>
                )}
                {msg.role === "assistant" && msg.content && (
                  <div className={compact ? "text-xs [&_p]:leading-relaxed [&_ul]:pl-4 [&_ul]:space-y-0.5 [&_li]:text-xs [&_strong]:font-semibold" : ""}>
                    <MarkdownContent text={msg.content} isStreaming={msg.isStreaming} />
                  </div>
                )}
              </div>

              {/* Feedback row */}
              {msg.role === "assistant" && !msg.isStreaming && msg.content && (
                <div className="flex items-center gap-1 mt-1.5 ml-0.5">
                  <button
                    onClick={() => onFeedback(i, "up")}
                    title="Good response"
                    className={`p-1 rounded-md transition-colors ${messageFeedback[i] === "up" ? "text-emerald-500" : "text-muted-foreground/50 hover:text-emerald-500"}`}
                    data-testid={`button-feedback-up-${i}`}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" fill={messageFeedback[i] === "up" ? "currentColor" : "none"} />
                  </button>
                  <button
                    onClick={() => onFeedback(i, "down")}
                    title="Bad response"
                    className={`p-1 rounded-md transition-colors ${messageFeedback[i] === "down" ? "text-rose-400" : "text-muted-foreground/50 hover:text-rose-400"}`}
                    data-testid={`button-feedback-down-${i}`}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" fill={messageFeedback[i] === "down" ? "currentColor" : "none"} />
                  </button>
                </div>
              )}

              {/* Follow-up pills */}
              {(followUps.length > 0 || msg.newArrivalsHint) && (
                <div className={`flex flex-wrap gap-1.5 mt-2 ml-0.5`} data-testid={`follow-up-pills-${i}`}>
                  {msg.newArrivalsHint && (
                    <button
                      onClick={() => onSend(msg.newArrivalsHint!.query)}
                      disabled={streaming}
                      className={`${compact ? "text-[10px] px-2 py-0.5" : "text-[11px] px-2.5 py-1"} rounded-full border border-amber-500/40 bg-amber-500/8 text-amber-700 dark:text-amber-400 font-medium hover:bg-amber-500/15 transition-all disabled:opacity-40`}
                      style={{ animation: `em-pill-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both` }}
                      data-testid={`pill-new-arrivals-${i}`}
                    >
                      ✦ {msg.newArrivalsHint.count} new {msg.newArrivalsHint.label}
                    </button>
                  )}
                  {followUps.map((pill, pi) => (
                    <button
                      key={pill}
                      onClick={() => onSend(pill)}
                      disabled={streaming}
                      className={`${compact ? "text-[10px] px-2 py-0.5" : "text-[11px] px-2.5 py-1"} rounded-full border border-emerald-500/25 bg-emerald-500/5 text-muted-foreground hover:text-foreground hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all disabled:opacity-40`}
                      style={{ animation: `em-pill-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both`, animationDelay: `${pi * 60}ms` }}
                      data-testid={`pill-followup-${i}-${pi}`}
                    >
                      {pill}
                    </button>
                  ))}
                </div>
              )}

              {/* Action offers — save to pipeline + set alert */}
              {msg.role === "assistant" && !msg.isStreaming && msg.actionOffers && msg.actionOffers.length > 0 && (
                <ActionOffers
                  offers={msg.actionOffers}
                  savedIngestedIds={savedIngestedIds}
                  onCreateAlert={onCreateAlert}
                  onAssetSaved={onAssetSaved}
                  compact={compact}
                />
              )}

              {/* External live results — rendered before TTO citations when present */}
              {msg.role === "assistant" && !msg.isStreaming && msg.externalResults && msg.externalResults.length > 0 && (
                <ExternalResultsPanel
                  results={msg.externalResults}
                  source={msg.activeSource ?? "clinicaltrials"}
                  bookmarkedIds={bookmarkedIds}
                  onBookmark={onBookmark}
                  compact={compact}
                />
              )}

              {/* No-results state — search ran but found nothing */}
              {msg.role === "assistant" && !msg.isStreaming && msg.activeSource !== undefined &&
                (!msg.assets || msg.assets.length === 0) && !(msg.externalResults?.length) && (
                <div className={`mt-2 flex items-center gap-1.5 ${compact ? "text-[10px]" : "text-[11px]"} text-muted-foreground/60`}>
                  <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground/40" />
                  No TTO corpus matches — try broadening the search or adjusting filters
                </div>
              )}

              {/* TTO corpus citations */}
              {msg.role === "assistant" && msg.assets && msg.assets.length > 0 && !msg.isStreaming && (
                <div className="mt-2" data-testid={`chat-citations-${i}`}>
                  {!(expandedCitations[i] ?? msg.assets.length <= 3) ? (
                    <button
                      className={`flex items-center gap-1 ${compact ? "text-[10px]" : "text-[11px]"} text-muted-foreground hover:text-foreground transition-colors group`}
                      onClick={() => onToggleCitations(i, true)}
                      data-testid={`button-show-citations-${i}`}
                    >
                      <ChevronDown className="h-3 w-3 shrink-0" />
                      {msg.externalResults?.length
                        ? `Also in TTO corpus — ${msg.assets.length} asset${msg.assets.length !== 1 ? "s" : ""}`
                        : compact ? `${msg.assets.length} matched asset${msg.assets.length !== 1 ? "s" : ""}` : `Show ${msg.assets.length} matched asset${msg.assets.length !== 1 ? "s" : ""}`}
                    </button>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-1.5">
                        <button
                          className={`flex items-center gap-1 ${compact ? "text-[10px]" : "text-[11px]"} text-muted-foreground hover:text-foreground transition-colors group`}
                          onClick={() => onToggleCitations(i, false)}
                          data-testid={`button-hide-citations-${i}`}
                        >
                          <ChevronDown className="h-3 w-3 shrink-0 rotate-180" />
                          Hide assets
                        </button>
                        {!compact && msg.assets.length > 0 && (
                          <button
                            className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                            onClick={() => exportCitationsAsCsv(sortAssetsByMention(msg.assets!, msg.content))}
                            title="Export assets as CSV"
                            data-testid={`button-export-csv-${i}`}
                          >
                            <Download className="h-3 w-3 shrink-0" />
                            Export CSV
                          </button>
                        )}
                      </div>
                      <div className={gridCols}>
                        {sortAssetsByMention(msg.assets, msg.content).map((a, ci) => (
                          <div
                            key={a.id}
                            style={{ animation: "em-fade-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both", animationDelay: `${ci * 50}ms` }}
                          >
                            <CitationCard asset={a} index={ci} savedIngestedIds={savedIngestedIds} onAssetSaved={onAssetSaved} compact={compact} />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {chatEndRef && <div ref={chatEndRef} />}
    </div>
  );
}
