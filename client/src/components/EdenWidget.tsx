import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles, X, Zap, Loader2, Mic, MicOff, ThumbsUp, ThumbsDown,
  ChevronDown, Clock, ChevronRight, ExternalLink, RotateCcw,
} from "lucide-react";
import { EdenAvatar, MarkdownContent, getFollowUpPills } from "@/components/EdenOrb";
import { PipelinePicker, type PipelinePickerPayload } from "@/components/PipelinePicker";
import { useEdenChat, type ChatAsset, type EdenSessionSummary, type EdenUserContext } from "@/hooks/useEdenChat";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useToast } from "@/hooks/use-toast";
import { getIndustryProfile } from "@/hooks/use-industry";

const SITE_PW = "quality";

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

function WidgetCitationCard({ asset, index, savedIngestedIds }: {
  asset: ChatAsset;
  index: number;
  savedIngestedIds: Set<number>;
}) {
  const { label, cls } = relevanceLabel(asset.similarity);
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
    <div className="rounded-lg border bg-card p-2.5 flex flex-col gap-1.5 hover:border-emerald-500/30 transition-all" data-testid={`widget-citation-${index}`}>
      <div className="flex items-start justify-between gap-1.5">
        <p className="text-[11px] font-semibold text-foreground leading-snug line-clamp-2 flex-1">{asset.assetName}</p>
        <div className="flex items-center gap-1 shrink-0">
          <PipelinePicker payload={payload} alreadySaved={isSaved} />
          <span className={`text-[9px] font-medium border rounded px-1 py-0.5 ${cls}`}>{label}</span>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground truncate">{asset.institution}</p>
      <div className="flex flex-wrap gap-1">
        {asset.modality && asset.modality !== "unknown" && (
          <span className={`text-[9px] font-medium border rounded px-1 py-0.5 ${modalityBadgeClass(asset.modality)}`}>
            {asset.modality.length > 20 ? asset.modality.slice(0, 20) + "…" : asset.modality}
          </span>
        )}
        {asset.developmentStage && asset.developmentStage !== "unknown" && (
          <span className="text-[9px] font-medium border rounded px-1 py-0.5 bg-muted text-muted-foreground border-border">
            {asset.developmentStage}
          </span>
        )}
      </div>
      {asset.sourceUrl && (
        <a href={asset.sourceUrl} target="_blank" rel="noopener noreferrer"
          className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
          data-testid={`widget-citation-link-${index}`}>
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          View source
        </a>
      )}
    </div>
  );
}

export function EdenWidget() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedCitations, setExpandedCitations] = useState<Record<number, boolean>>({});
  const [messageFeedback, setMessageFeedback] = useState<Record<number, "up" | "down">>({});

  const profile = useMemo(() => getIndustryProfile(), []);
  const userContext = useMemo((): EdenUserContext | undefined => {
    const hasData = profile.companyName || profile.companyType ||
      profile.therapeuticAreas?.length || profile.dealStages?.length || profile.modalities?.length;
    if (!hasData) return undefined;
    return {
      companyName: profile.companyName || undefined,
      companyType: profile.companyType || undefined,
      therapeuticAreas: profile.therapeuticAreas?.length ? profile.therapeuticAreas : undefined,
      dealStages: profile.dealStages?.length ? profile.dealStages : undefined,
      modalities: profile.modalities?.length ? profile.modalities : undefined,
    };
  }, [profile]);

  const { data: savedAssetsData } = useQuery<{ assets: Array<{ ingestedAssetId: number | null }> }>({
    queryKey: ["/api/saved-assets"],
    staleTime: 30000,
  });
  const savedIngestedIds: Set<number> = new Set(
    (savedAssetsData?.assets ?? [])
      .filter((a) => a.ingestedAssetId != null)
      .map((a) => a.ingestedAssetId as number)
  );

  const { data: embedData } = useQuery<{ embeddingCoverage: { totalEmbedded: number } }>({
    queryKey: ["/api/admin/eden/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/eden/stats", { headers: { "x-admin-password": "eden" } });
      if (!res.ok) return { embeddingCoverage: { totalEmbedded: 0 } };
      return res.json();
    },
    staleTime: 60000,
  });
  const totalIndexed = embedData?.embeddingCoverage?.totalEmbedded ?? 0;

  const {
    messages, input, setInput, streaming, sessionId, send, clearChat, loadSession,
  } = useEdenChat(SITE_PW, userContext);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: sessionsData, refetch: refetchSessions } = useQuery<EdenSessionSummary[]>({
    queryKey: ["/api/eden/sessions"],
    queryFn: async () => {
      const res = await fetch("/api/eden/sessions?limit=25", { headers: { "x-admin-password": SITE_PW } });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: historyOpen && open,
    staleTime: 10000,
  });

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/eden/feedback/${sessionId}`, { headers: { "x-admin-password": SITE_PW } })
      .then((r) => r.ok ? r.json() : [])
      .then((data: Array<{ messageIndex: number; sentiment: string }>) => {
        if (!Array.isArray(data)) return;
        const map: Record<number, "up" | "down"> = {};
        for (const item of data) {
          if (item.sentiment === "up" || item.sentiment === "down") {
            map[item.messageIndex] = item.sentiment as "up" | "down";
          }
        }
        setMessageFeedback(map);
      })
      .catch(() => {});
  }, [sessionId]);

  async function handleFeedback(msgIndex: number, sentiment: "up" | "down") {
    if (messageFeedback[msgIndex]) return;
    setMessageFeedback((prev) => ({ ...prev, [msgIndex]: sentiment }));
    try {
      const res = await fetch("/api/eden/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": SITE_PW },
        body: JSON.stringify({ sessionId, messageIndex: msgIndex, sentiment }),
      });
      if (!res.ok) throw new Error("server error");
      toast({ title: "Feedback noted", duration: 2000 });
    } catch {
      setMessageFeedback((prev) => { const n = { ...prev }; delete n[msgIndex]; return n; });
      toast({ title: "Couldn't save feedback", variant: "destructive" });
    }
  }

  function handleSend(q?: string) {
    send(q);
    inputRef.current?.focus();
  }

  function handleLoadSession(s: EdenSessionSummary) {
    loadSession(s);
    setExpandedCitations({});
    setMessageFeedback({});
    setHistoryOpen(false);
  }

  const { isListening, isSupported: speechSupported, toggle: toggleSpeech } = useSpeechRecognition(
    (transcript) => setInput(input ? `${input} ${transcript}` : transcript)
  );

  const hasMessages = messages.length > 0;

  return (
    <>
      <style>{`
        @keyframes eden-widget-in {
          from { opacity: 0; transform: scale(0.92) translateY(12px); transform-origin: bottom right; }
          to   { opacity: 1; transform: scale(1) translateY(0); transform-origin: bottom right; }
        }
        @keyframes eden-msg-user {
          from { opacity: 0; transform: translateX(16px) translateY(4px); }
          to   { opacity: 1; transform: translateX(0) translateY(0); }
        }
        @keyframes eden-msg-asst {
          from { opacity: 0; transform: translateX(-12px) translateY(4px); }
          to   { opacity: 1; transform: translateX(0) translateY(0); }
        }
        @keyframes eden-pill-in {
          from { opacity: 0; transform: translateY(6px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes eden-bubble-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
        }
      `}</style>

      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
        {/* Expanded panel */}
        {open && (
          <div
            ref={panelRef}
            className="w-[420px] h-[580px] rounded-2xl border border-border bg-background shadow-2xl flex flex-col overflow-hidden"
            style={{ animation: "eden-widget-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
            data-testid="eden-widget-panel"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border flex items-center gap-2.5 shrink-0 bg-gradient-to-r from-emerald-500/5 to-transparent">
              <EdenAvatar isThinking={streaming} size={26} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-foreground leading-none">Eden Intelligence</span>
                  <span className="flex items-center gap-1 text-[9px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-full px-1.5 py-0.5 border border-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    live
                  </span>
                </div>
                {totalIndexed > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">{totalIndexed.toLocaleString()} assets indexed</p>
                )}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {hasMessages && (
                  <button
                    onClick={() => { clearChat(); setExpandedCitations({}); setMessageFeedback({}); }}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                    title="New chat"
                    data-testid="widget-button-new-chat"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => { setHistoryOpen((v) => !v); if (!historyOpen) refetchSessions(); }}
                  className={`p-1.5 rounded-md transition-colors ${historyOpen ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" : "text-muted-foreground hover:text-foreground hover:bg-accent/60"}`}
                  title="Session history"
                  data-testid="widget-button-history"
                >
                  <Clock className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                  data-testid="widget-button-close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* History panel */}
            {historyOpen && (
              <div className="border-b border-border bg-muted/20 p-3 max-h-44 overflow-y-auto shrink-0" data-testid="widget-history-panel">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent Sessions</p>
                {!sessionsData && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                  </div>
                )}
                {sessionsData?.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">No sessions yet.</p>
                )}
                {sessionsData && sessionsData.length > 0 && (
                  <div className="space-y-0.5">
                    {sessionsData.map((s) => {
                      const firstQ = s.messages?.find((m) => m.role === "user")?.content ?? "Untitled";
                      const date = new Date(s.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                      return (
                        <button
                          key={s.sessionId}
                          onClick={() => handleLoadSession(s)}
                          className="w-full text-left rounded-md px-2.5 py-1.5 hover:bg-muted transition-colors flex items-center gap-2 group"
                          data-testid={`widget-session-item-${s.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium text-foreground truncate">{firstQ.slice(0, 55)}{firstQ.length > 55 ? "…" : ""}</p>
                            <p className="text-[10px] text-muted-foreground">{date} · {s.messages?.length ?? 0} msgs</p>
                          </div>
                          <ChevronRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto flex flex-col" data-testid="widget-messages">
              {!hasMessages ? (
                <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 text-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Ask Eden anything</p>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      Search 300+ TTO portfolios by modality, indication, stage, or institution.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 w-full max-w-[280px]">
                    {[
                      "Gene therapy assets for rare disease",
                      "Phase 2 oncology from Harvard or MIT",
                      "CAR-T licensing opportunities",
                    ].map((q, i) => (
                      <button
                        key={q}
                        onClick={() => handleSend(q)}
                        disabled={streaming}
                        className="text-[11px] px-3 py-2 rounded-lg border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all text-left disabled:opacity-40"
                        style={{ animation: `eden-pill-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both`, animationDelay: `${i * 60}ms` }}
                        data-testid={`widget-prompt-${i}`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="px-3 py-3 space-y-4">
                  {messages.map((msg, i) => {
                    const followUps = !msg.isStreaming && msg.role === "assistant" && msg.content
                      ? getFollowUpPills(msg.content, (msg.assets?.length ?? 0) > 0)
                      : [];
                    return (
                      <div
                        key={i}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        style={{ animation: msg.role === "user" ? "eden-msg-user 280ms cubic-bezier(0.16, 1, 0.3, 1) both" : "eden-msg-asst 280ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
                        data-testid={`widget-msg-${i}`}
                      >
                        {msg.role === "assistant" && (
                          <div className="shrink-0 mt-1 mr-1.5">
                            <EdenAvatar isThinking={!!(msg.isStreaming)} size={18} />
                          </div>
                        )}
                        <div className={`${msg.role === "user" ? "max-w-[80%]" : "flex-1 min-w-0"}`}>
                          <div className={`${
                            msg.role === "user"
                              ? "rounded-2xl rounded-tr-sm px-3 py-2 bg-emerald-600 text-white text-xs ml-auto w-fit shadow-sm"
                              : "rounded-2xl rounded-tl-sm px-3 py-2 bg-muted/50 border-l-2 border-l-emerald-500/40 text-foreground"
                          }`}>
                            {msg.role === "assistant" && msg.isStreaming && !msg.content && (
                              <div className="flex gap-1 items-center py-0.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 animate-bounce" style={{ animationDelay: "0ms" }} />
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 animate-bounce" style={{ animationDelay: "130ms" }} />
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 animate-bounce" style={{ animationDelay: "260ms" }} />
                              </div>
                            )}
                            {msg.role === "user" && <p className="text-xs leading-relaxed">{msg.content}</p>}
                            {msg.role === "assistant" && msg.content && (
                              <div className="text-xs [&_p]:leading-relaxed [&_ul]:pl-4 [&_ul]:space-y-0.5 [&_li]:text-xs [&_strong]:font-semibold">
                                <MarkdownContent text={msg.content} isStreaming={msg.isStreaming} />
                              </div>
                            )}
                          </div>

                          {msg.role === "assistant" && !msg.isStreaming && msg.content && (
                            <div className="flex items-center gap-0.5 mt-1 ml-0.5">
                              <button
                                onClick={() => handleFeedback(i, "up")}
                                className={`p-1 rounded-md transition-colors ${messageFeedback[i] === "up" ? "text-emerald-500" : "text-muted-foreground/30 hover:text-emerald-500"}`}
                                data-testid={`widget-feedback-up-${i}`}
                              >
                                <ThumbsUp className="h-3 w-3" fill={messageFeedback[i] === "up" ? "currentColor" : "none"} />
                              </button>
                              <button
                                onClick={() => handleFeedback(i, "down")}
                                className={`p-1 rounded-md transition-colors ${messageFeedback[i] === "down" ? "text-rose-400" : "text-muted-foreground/30 hover:text-rose-400"}`}
                                data-testid={`widget-feedback-down-${i}`}
                              >
                                <ThumbsDown className="h-3 w-3" fill={messageFeedback[i] === "down" ? "currentColor" : "none"} />
                              </button>
                            </div>
                          )}

                          {followUps.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5 ml-0.5" data-testid={`widget-follow-ups-${i}`}>
                              {followUps.map((pill, pi) => (
                                <button
                                  key={pill}
                                  onClick={() => handleSend(pill)}
                                  disabled={streaming}
                                  className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/25 bg-emerald-500/5 text-muted-foreground hover:text-foreground hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all disabled:opacity-40"
                                  style={{ animation: `eden-pill-in 240ms cubic-bezier(0.16, 1, 0.3, 1) both`, animationDelay: `${pi * 50}ms` }}
                                  data-testid={`widget-pill-${i}-${pi}`}
                                >
                                  {pill}
                                </button>
                              ))}
                            </div>
                          )}

                          {msg.role === "assistant" && msg.assets && msg.assets.length > 0 && !msg.isStreaming && (
                            <div className="mt-2" data-testid={`widget-citations-${i}`}>
                              {!expandedCitations[i] ? (
                                <button
                                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                                  onClick={() => setExpandedCitations((prev) => ({ ...prev, [i]: true }))}
                                  data-testid={`widget-show-citations-${i}`}
                                >
                                  <ChevronDown className="h-3 w-3 shrink-0" />
                                  {msg.assets.length} matched asset{msg.assets.length !== 1 ? "s" : ""}
                                </button>
                              ) : (
                                <>
                                  <button
                                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mb-1.5"
                                    onClick={() => setExpandedCitations((prev) => ({ ...prev, [i]: false }))}
                                    data-testid={`widget-hide-citations-${i}`}
                                  >
                                    <ChevronDown className="h-3 w-3 shrink-0 rotate-180" />
                                    Hide assets
                                  </button>
                                  <div className="flex flex-col gap-1.5">
                                    {sortAssetsByMention(msg.assets, msg.content).map((a, ci) => (
                                      <WidgetCitationCard key={a.id} asset={a} index={ci} savedIngestedIds={savedIngestedIds} />
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
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            {/* Input bar */}
            <div className="px-3 py-2.5 bg-background/95 backdrop-blur shrink-0 border-t border-border" data-testid="widget-input-area">
              <div className="flex gap-1.5 items-center rounded-xl border border-border bg-card px-2.5 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/30 focus-within:border-emerald-500/50 transition-all">
                <input
                  ref={inputRef}
                  className="flex-1 text-xs bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/60"
                  placeholder="Ask about targets, modalities, institutions…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  disabled={streaming}
                  data-testid="widget-input-chat"
                />
                {speechSupported && (
                  <button
                    type="button"
                    onClick={toggleSpeech}
                    disabled={streaming}
                    className={`shrink-0 p-1 rounded-md transition-colors ${isListening ? "text-red-500 bg-red-500/10 animate-pulse" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
                    data-testid="widget-button-mic"
                  >
                    {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  </button>
                )}
                <button
                  onClick={() => handleSend()}
                  disabled={streaming || !input.trim()}
                  className="shrink-0 h-6 w-6 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/30 text-white flex items-center justify-center transition-all"
                  data-testid="widget-button-send"
                >
                  {streaming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                </button>
              </div>
              {isListening && (
                <p className="text-[10px] text-red-500 mt-1 text-center flex items-center justify-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                  Listening…
                </p>
              )}
            </div>
          </div>
        )}

        {/* Trigger bubble */}
        <button
          onClick={() => setOpen((v) => !v)}
          className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 ${
            open
              ? "bg-foreground text-background"
              : "bg-emerald-600 text-white"
          }`}
          style={!open ? { animation: "eden-bubble-pulse 3s ease-in-out infinite" } : undefined}
          data-testid="widget-button-toggle"
          aria-label="Open Eden Intelligence"
        >
          {open ? (
            <X className="h-5 w-5" />
          ) : (
            <>
              <Sparkles className="h-5 w-5" />
              {messages.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-background" />
              )}
            </>
          )}
        </button>
      </div>
    </>
  );
}
