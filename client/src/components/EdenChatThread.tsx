import { ChevronDown, ThumbsUp, ThumbsDown, ExternalLink, Download } from "lucide-react";
import { EdenAvatar, MarkdownContent, getFollowUpPills } from "@/components/EdenOrb";
import { PipelinePicker, type PipelinePickerPayload } from "@/components/PipelinePicker";
import type { ChatAsset, ChatMessage } from "@/hooks/useEdenChat";

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
  const headers = ["Asset Name", "Institution", "Modality", "Development Stage", "IP Type", "Source URL", "Relevance Score"];
  const rows = assets.map((a) => [
    a.assetName,
    a.institution,
    a.modality || "",
    a.developmentStage || "",
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

function CitationCard({ asset, index, savedIngestedIds, compact = false }: {
  asset: ChatAsset;
  index: number;
  savedIngestedIds: Set<number>;
  compact?: boolean;
}) {
  const { label, cls } = relevanceLabel(asset.similarity);
  const leftBorder = modalityLeftBorder(asset.modality);
  const isSaved = savedIngestedIds.has(asset.id);
  const payload: PipelinePickerPayload = {
    asset_name: asset.assetName,
    target: "unknown",
    modality: asset.modality || "unknown",
    development_stage: asset.developmentStage || "unknown",
    disease_indication: asset.indication || "unknown",
    summary: "",
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

      {/* Modality / stage / IP badges */}
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
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between mt-0.5 pt-1.5 border-t border-border/50">
        <PipelinePicker payload={payload} alreadySaved={isSaved} />
        {asset.sourceUrl && (
          <a
            href={asset.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 ${compact ? "text-[10px]" : "text-[11px]"}`}
            data-testid={`citation-link-${index}`}
          >
            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            View source
          </a>
        )}
      </div>
    </div>
  );
}

export type EdenChatThreadProps = {
  messages: ChatMessage[];
  streaming: boolean;
  messageFeedback: Record<number, "up" | "down">;
  expandedCitations: Record<number, boolean>;
  savedIngestedIds: Set<number>;
  onFeedback: (i: number, sentiment: "up" | "down") => void;
  onSend: (q: string) => void;
  onToggleCitations: (i: number, open: boolean) => void;
  compact?: boolean;
  chatEndRef?: React.RefObject<HTMLDivElement>;
};

export function EdenChatThread({
  messages,
  streaming,
  messageFeedback,
  expandedCitations,
  savedIngestedIds,
  onFeedback,
  onSend,
  onToggleCitations,
  compact = false,
  chatEndRef,
}: EdenChatThreadProps) {
  const avatarSize = compact ? 18 : 22;
  const gridCols = compact ? "flex flex-col gap-1.5" : "grid grid-cols-1 sm:grid-cols-2 gap-2";

  return (
    <div className={compact ? "px-3 py-3 space-y-4" : "px-4 sm:px-6 py-5 space-y-5 max-w-3xl w-full mx-auto"}>
      {messages.map((msg, i) => {
        const followUps = !msg.isStreaming && msg.role === "assistant" && msg.content
          ? getFollowUpPills(msg.content, (msg.assets?.length ?? 0) > 0)
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
              {followUps.length > 0 && (
                <div className={`flex flex-wrap gap-1.5 mt-2 ml-0.5`} data-testid={`follow-up-pills-${i}`}>
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

              {/* Citations */}
              {msg.role === "assistant" && msg.assets && msg.assets.length > 0 && !msg.isStreaming && (
                <div className="mt-2" data-testid={`chat-citations-${i}`}>
                  {!(expandedCitations[i] ?? msg.assets.length <= 3) ? (
                    <button
                      className={`flex items-center gap-1 ${compact ? "text-[10px]" : "text-[11px]"} text-muted-foreground hover:text-foreground transition-colors group`}
                      onClick={() => onToggleCitations(i, true)}
                      data-testid={`button-show-citations-${i}`}
                    >
                      <ChevronDown className="h-3 w-3 shrink-0" />
                      {compact ? `${msg.assets.length} matched asset${msg.assets.length !== 1 ? "s" : ""}` : `Show ${msg.assets.length} matched asset${msg.assets.length !== 1 ? "s" : ""}`}
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
                            <CitationCard asset={a} index={ci} savedIngestedIds={savedIngestedIds} compact={compact} />
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
