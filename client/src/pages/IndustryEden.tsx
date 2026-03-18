import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Loader2, Zap, Mic, MicOff, ThumbsUp, ThumbsDown,
  ChevronDown, ChevronRight, Clock, ExternalLink,
} from "lucide-react";
import { EdenAvatar, EdenOrb, MarkdownContent } from "@/components/EdenOrb";
import { PipelinePicker, type PipelinePickerPayload } from "@/components/PipelinePicker";
import { useEdenChat, type ChatAsset, type EdenSessionSummary } from "@/hooks/useEdenChat";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useToast } from "@/hooks/use-toast";

const SITE_PW = "quality";

const STARTER_QUESTIONS = [
  { label: "Oncology licensing opportunities",   q: "What oncology assets at preclinical or Phase 1 stage are currently available for licensing?" },
  { label: "CRISPR gene editing platforms",      q: "Find CRISPR or gene editing platform technologies from leading research institutions" },
  { label: "CNS assets with clear MoA",          q: "Show CNS therapeutics with a well-defined mechanism of action suitable for partnership" },
  { label: "Rare disease antibody programs",     q: "What antibody-based therapeutics are available for rare disease indications?" },
];

const PORTAL_DOTS = [
  { s: 5,  x: "6%",  y: "12%", c: "#10b981", o: 0.10, d: 7.2,  dl: 0.0 },
  { s: 4,  x: "18%", y: "80%", c: "#10b981", o: 0.08, d: 9.8,  dl: 2.3 },
  { s: 6,  x: "58%", y: "7%",  c: "#6ee7b7", o: 0.09, d: 11.5, dl: 4.7 },
  { s: 3,  x: "87%", y: "74%", c: "#10b981", o: 0.08, d: 8.1,  dl: 6.2 },
  { s: 5,  x: "3%",  y: "50%", c: "#6ee7b7", o: 0.07, d: 10.3, dl: 1.1 },
  { s: 7,  x: "90%", y: "20%", c: "#10b981", o: 0.09, d: 8.7,  dl: 3.4 },
  { s: 4,  x: "44%", y: "90%", c: "#6ee7b7", o: 0.07, d: 12.0, dl: 5.9 },
  { s: 5,  x: "72%", y: "58%", c: "#10b981", o: 0.06, d: 9.1,  dl: 7.8 },
];

function relevanceLabel(sim: number): { label: string; cls: string } {
  if (sim >= 0.85) return { label: "Strong match",  cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" };
  if (sim >= 0.70) return { label: "Good match",    cls: "bg-primary/10 text-primary border-primary/20" };
  if (sim >= 0.55) return { label: "Possible fit",  cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" };
  return             { label: "Exploratory",        cls: "bg-muted text-muted-foreground border-border" };
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

function CitationCard({ asset, index, savedIngestedIds }: {
  asset: ChatAsset;
  index: number;
  savedIngestedIds: Set<number>;
}) {
  const { label, cls } = relevanceLabel(asset.similarity);
  const isSaved = savedIngestedIds.has(asset.id);

  const pickerPayload: PipelinePickerPayload = {
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
      className="rounded-lg border border-border bg-card p-3 flex flex-col gap-1.5 hover:border-emerald-500/30 transition-colors"
      data-testid={`citation-card-${index}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2 flex-1">{asset.assetName}</p>
        <div className="flex items-center gap-1 shrink-0">
          <PipelinePicker payload={pickerPayload} alreadySaved={isSaved} />
          <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${cls}`}>{label}</span>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground truncate">{asset.institution}</p>
      <div className="flex flex-wrap gap-1 mt-0.5">
        {asset.modality && asset.modality !== "unknown" && (
          <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${modalityBadgeClass(asset.modality)}`}>
            {asset.modality.length > 22 ? asset.modality.slice(0, 22) + "…" : asset.modality}
          </span>
        )}
        {asset.developmentStage && asset.developmentStage !== "unknown" && (
          <span className="text-[10px] font-medium border rounded px-1.5 py-0.5 bg-muted text-muted-foreground border-border">
            {asset.developmentStage}
          </span>
        )}
        {asset.ipType && (
          <span className="text-[10px] font-medium border rounded px-1.5 py-0.5 bg-muted text-muted-foreground border-border">
            {asset.ipType}
          </span>
        )}
      </div>
      {asset.sourceUrl && (
        <a
          href={asset.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 mt-0.5"
          data-testid={`citation-link-${index}`}
        >
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          View source
        </a>
      )}
    </div>
  );
}

export default function IndustryEden() {
  const { toast } = useToast();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedCitations, setExpandedCitations] = useState<Record<number, boolean>>({});
  const [messageFeedback, setMessageFeedback] = useState<Record<number, "up" | "down">>({});

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
  const chatReady = totalIndexed > 0;

  const {
    messages,
    input,
    setInput,
    streaming,
    sessionId,
    send,
    clearChat,
    loadSession,
  } = useEdenChat(SITE_PW);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: sessionsData, refetch: refetchSessions } = useQuery<EdenSessionSummary[]>({
    queryKey: ["/api/eden/sessions"],
    queryFn: async () => {
      const res = await fetch("/api/eden/sessions?limit=25", { headers: { "x-admin-password": SITE_PW } });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: historyOpen,
    staleTime: 10000,
  });

  function handleLoadSession(s: EdenSessionSummary) {
    loadSession(s);
    setExpandedCitations({});
    setMessageFeedback({});
    setHistoryOpen(false);
  }

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
      toast({ title: "Feedback noted — thanks!", duration: 2000 });
    } catch {
      setMessageFeedback((prev) => { const n = { ...prev }; delete n[msgIndex]; return n; });
      toast({ title: "Couldn't save feedback", variant: "destructive" });
    }
  }

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

  const { isListening, isSupported: speechSupported, toggle: toggleSpeech } = useSpeechRecognition(
    (transcript) => setInput(input ? `${input} ${transcript}` : transcript)
  );

  return (
    <div className="min-h-full bg-background flex flex-col">
      <style>{`
        @keyframes em-slide-user {
          from { opacity: 0; transform: translateX(20px) translateY(4px); }
          to   { opacity: 1; transform: translateX(0) translateY(0); }
        }
        @keyframes em-slide-assistant {
          from { opacity: 0; transform: translateX(-20px) translateY(4px); }
          to   { opacity: 1; transform: translateX(0) translateY(0); }
        }
        @keyframes em-fade-in {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes em-fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes eden-dot-float {
          0%, 100% { transform: translateY(0px) translateX(0px); }
          30%      { transform: translateY(-14px) translateX(5px); }
          70%      { transform: translateY(-7px) translateX(-4px); }
        }
      `}</style>

      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Header */}
        <div
          className="px-5 py-3.5 border-b border-border bg-gradient-to-r from-emerald-500/5 to-transparent flex items-center gap-3 shrink-0"
          data-testid="eden-identity-header"
        >
          <EdenAvatar isThinking={streaming} size={34} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-foreground" data-testid="eden-name">Eden Intelligence</h2>
              {chatReady && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-full px-2 py-0.5 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  live
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5" data-testid="eden-descriptor">
              AI deal intelligence · {totalIndexed > 0 ? `${totalIndexed.toLocaleString()} assets indexed` : "loading…"}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => { clearChat(); setExpandedCitations({}); setMessageFeedback({}); }}
                data-testid="button-chat-clear"
              >
                New chat
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2 gap-1"
              onClick={() => { setHistoryOpen((v) => !v); if (!historyOpen) refetchSessions(); }}
              data-testid="button-chat-history"
            >
              <Clock className="h-3.5 w-3.5" />
              History
            </Button>
          </div>
        </div>

        {/* Session history */}
        {historyOpen && (
          <div className="border-b border-border bg-muted/30 p-3 max-h-52 overflow-y-auto shrink-0" data-testid="session-history-panel">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent Sessions</p>
            {!sessionsData && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            )}
            {sessionsData && sessionsData.length === 0 && (
              <p className="text-xs text-muted-foreground">No sessions yet.</p>
            )}
            {sessionsData && sessionsData.length > 0 && (
              <div className="space-y-1">
                {sessionsData.map((s) => {
                  const firstQ = s.messages?.find((m) => m.role === "user")?.content ?? "Untitled session";
                  const date = new Date(s.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                  const msgCount = s.messages?.length ?? 0;
                  return (
                    <button
                      key={s.sessionId}
                      onClick={() => handleLoadSession(s)}
                      className="w-full text-left rounded-md px-3 py-2 hover:bg-muted transition-colors flex items-center gap-2 group"
                      data-testid={`session-item-${s.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{firstQ.slice(0, 70)}{firstQ.length > 70 ? "…" : ""}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{date} · {msgCount} message{msgCount !== 1 ? "s" : ""}</p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Not-ready gate */}
        {!chatReady && (
          <div className="flex-1 flex items-center justify-center p-10 text-center" data-testid="chat-not-ready">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                <EdenAvatar size={32} />
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">Eden Intelligence is initialising</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                The AI knowledge base is being built. This typically takes a few minutes on first run.
              </p>
            </div>
          </div>
        )}

        {/* Chat area */}
        {chatReady && (
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Message scroll area */}
            <div
              className="relative flex-1 overflow-y-auto p-5 space-y-5 bg-gradient-to-b from-background to-emerald-500/[0.02]"
              data-testid="chat-messages"
            >
              {/* Floating dots */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {PORTAL_DOTS.map((dot, i) => (
                  <div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                      width: dot.s, height: dot.s,
                      left: dot.x, top: dot.y,
                      background: dot.c, opacity: dot.o,
                      animation: `eden-dot-float ${dot.d}s ease-in-out infinite`,
                      animationDelay: `${dot.dl}s`,
                    }}
                  />
                ))}
              </div>

              {/* Empty state — orb + chips */}
              {messages.length === 0 && (
                <div className="relative h-full flex flex-col items-center justify-center" data-testid="chat-empty">
                  {STARTER_QUESTIONS.map((sq, qi) => {
                    const corners = [
                      "absolute top-0 left-0",
                      "absolute top-0 right-0",
                      "absolute bottom-0 left-0",
                      "absolute bottom-0 right-0",
                    ];
                    const aligns = ["text-left", "text-right", "text-left", "text-right"];
                    return (
                      <button
                        key={sq.q}
                        onClick={() => send(sq.q)}
                        className={`${corners[qi]} ${aligns[qi]} text-[10px] rounded-lg border border-border/50 bg-card/80 backdrop-blur-sm hover:bg-muted/80 px-2.5 py-1.5 text-muted-foreground/70 hover:text-foreground shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 font-medium max-w-[148px] leading-tight`}
                        style={{ animation: "em-fade-up 280ms cubic-bezier(0.16, 1, 0.3, 1) both", animationDelay: `${240 + qi * 50}ms` }}
                        data-testid={`chip-starter-${qi}`}
                      >
                        {sq.label}
                      </button>
                    );
                  })}

                  <EdenOrb isThinking={streaming} />
                  <p
                    className="text-base font-semibold text-foreground mb-1 -mt-2"
                    style={{ animation: "em-fade-up 400ms cubic-bezier(0.16, 1, 0.3, 1) both", animationDelay: "60ms" }}
                  >
                    Ask Eden anything
                  </p>
                  <p
                    className="text-xs text-muted-foreground text-center max-w-xs leading-relaxed"
                    style={{ animation: "em-fade-up 400ms cubic-bezier(0.16, 1, 0.3, 1) both", animationDelay: "120ms" }}
                  >
                    Your AI analyst for {totalIndexed.toLocaleString()} TTO assets across leading research institutions.
                  </p>
                </div>
              )}

              {/* Message thread */}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  style={{
                    animation: msg.role === "user"
                      ? "em-slide-user 340ms cubic-bezier(0.16, 1, 0.3, 1) both"
                      : "em-slide-assistant 340ms cubic-bezier(0.16, 1, 0.3, 1) both"
                  }}
                  data-testid={`chat-msg-${i}`}
                >
                  {msg.role === "assistant" && (
                    <div className="shrink-0 mt-1 mr-2">
                      <EdenAvatar isThinking={!!(msg.isStreaming)} size={24} />
                    </div>
                  )}

                  <div className={`max-w-[80%] ${msg.role === "user" ? "" : (msg.isStreaming && !msg.content ? "w-auto" : "flex-1")}`}>
                    <div className={`rounded-2xl px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-gradient-to-br from-emerald-600 to-emerald-700 text-white text-sm ml-auto w-fit shadow-sm"
                        : "bg-muted/60 border border-border border-l-2 border-l-emerald-500/40 text-foreground"
                    }`}>
                      {msg.role === "assistant" && msg.isStreaming && !msg.content && (
                        <div className="flex gap-1 items-center py-0.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/60 animate-bounce" style={{ animationDelay: "120ms" }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/60 animate-bounce" style={{ animationDelay: "240ms" }} />
                        </div>
                      )}
                      {msg.role === "user" && (
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      )}
                      {msg.role === "assistant" && msg.content && (
                        <>
                          <MarkdownContent text={msg.content} isStreaming={msg.isStreaming} />
                          {msg.isStreaming && <span className="animate-pulse text-emerald-400 font-light ml-0.5 select-none">|</span>}
                        </>
                      )}
                    </div>

                    {/* Feedback */}
                    {msg.role === "assistant" && !msg.isStreaming && msg.content && (
                      <div className="flex items-center gap-0.5 mt-1.5 ml-0.5">
                        <button
                          onClick={() => handleFeedback(i, "up")}
                          className={`p-1 rounded-md transition-colors ${messageFeedback[i] === "up" ? "text-emerald-500" : "text-muted-foreground/30 hover:text-emerald-500"}`}
                          title="Good response"
                          data-testid={`button-feedback-up-${i}`}
                        >
                          <ThumbsUp className="h-3 w-3" fill={messageFeedback[i] === "up" ? "currentColor" : "none"} />
                        </button>
                        <button
                          onClick={() => handleFeedback(i, "down")}
                          className={`p-1 rounded-md transition-colors ${messageFeedback[i] === "down" ? "text-rose-400" : "text-muted-foreground/30 hover:text-rose-400"}`}
                          title="Bad response"
                          data-testid={`button-feedback-down-${i}`}
                        >
                          <ThumbsDown className="h-3 w-3" fill={messageFeedback[i] === "down" ? "currentColor" : "none"} />
                        </button>
                      </div>
                    )}

                    {/* Citation cards */}
                    {msg.role === "assistant" && msg.assets && msg.assets.length > 0 && !msg.isStreaming && (
                      <div className="mt-2" data-testid={`chat-citations-${i}`}>
                        {!expandedCitations[i] ? (
                          <button
                            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors group"
                            onClick={() => setExpandedCitations((prev) => ({ ...prev, [i]: true }))}
                            data-testid={`button-show-citations-${i}`}
                          >
                            <ChevronDown className="h-3 w-3 shrink-0 group-hover:text-foreground transition-colors" />
                            Show {msg.assets.length} matched asset{msg.assets.length !== 1 ? "s" : ""}
                          </button>
                        ) : (
                          <>
                            <button
                              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-1.5 group"
                              onClick={() => setExpandedCitations((prev) => ({ ...prev, [i]: false }))}
                              data-testid={`button-hide-citations-${i}`}
                            >
                              <ChevronDown className="h-3 w-3 shrink-0 rotate-180 group-hover:text-foreground transition-colors" />
                              Hide assets
                            </button>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {msg.assets.map((a, ci) => (
                                <div
                                  key={a.id}
                                  style={{ animation: "em-fade-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both", animationDelay: `${ci * 55}ms` }}
                                >
                                  <CitationCard asset={a} index={ci} savedIngestedIds={savedIngestedIds} />
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Input bar */}
            <div className="px-4 py-3 border-t border-border bg-card shrink-0" data-testid="chat-input-area">
              <div className="flex gap-2">
                <input
                  className="flex-1 text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 text-foreground placeholder:text-muted-foreground"
                  placeholder="Ask about targets, mechanisms, institutions, licensing readiness…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  disabled={streaming}
                  data-testid="input-chat"
                />
                {speechSupported && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={toggleSpeech}
                    disabled={streaming}
                    className={`shrink-0 transition-colors ${isListening ? "border-red-500 text-red-500 bg-red-500/5 hover:bg-red-500/10" : "text-muted-foreground hover:text-foreground"}`}
                    title={isListening ? "Stop listening" : "Speak your question"}
                    data-testid="button-chat-mic"
                  >
                    {isListening ? <MicOff className="h-4 w-4 animate-pulse" /> : <Mic className="h-4 w-4" />}
                  </Button>
                )}
                <Button
                  onClick={() => send()}
                  disabled={streaming || !input.trim()}
                  size="sm"
                  className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                  data-testid="button-chat-send"
                >
                  {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                </Button>
              </div>
              {isListening && (
                <p className="text-[11px] text-red-500 mt-1.5 flex items-center gap-1" data-testid="status-listening">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                  Listening… speak now
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
