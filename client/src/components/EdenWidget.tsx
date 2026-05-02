import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles, X, Zap, Loader2, Mic, MicOff,
  Clock, ChevronRight, RotateCcw,
} from "lucide-react";
import { EdenAvatar } from "@/components/EdenOrb";
import { EdenChatThread } from "@/components/EdenChatThread";
import { useEdenChat, type EdenSessionSummary, type EdenUserContext } from "@/hooks/useEdenChat";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getIndustryProfile } from "@/hooks/use-industry";

export function EdenWidget() {
  const { role, session } = useAuth();
  const pw = session?.access_token ?? "";
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
    enabled: role === "industry",
  });
  const savedIngestedIds: Set<number> = new Set(
    (savedAssetsData?.assets ?? [])
      .filter((a) => a.ingestedAssetId != null)
      .map((a) => a.ingestedAssetId as number)
  );

  const { data: embedData } = useQuery<{ embeddingCoverage: { totalEmbedded: number } }>({
    queryKey: ["/api/admin/eden/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/eden/stats", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) return { embeddingCoverage: { totalEmbedded: 0 } };
      return res.json();
    },
    staleTime: 60000,
    enabled: role === "industry",
  });
  const totalIndexed = embedData?.embeddingCoverage?.totalEmbedded ?? 0;

  const {
    messages, input, setInput, streaming, sessionId, send, clearChat, loadSession,
  } = useEdenChat(pw, userContext);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: sessionsData, refetch: refetchSessions } = useQuery<EdenSessionSummary[]>({
    queryKey: ["/api/eden/sessions"],
    queryFn: async () => {
      const res = await fetch("/api/eden/sessions?limit=25", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: historyOpen && open && role === "industry",
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
    fetch(`/api/eden/feedback/${sessionId}`, { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } })
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
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
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

  if (role !== "industry") return null;

  return (
    <>
      <style>{`
        @keyframes eden-widget-in {
          from { opacity: 0; transform: scale(0.92) translateY(12px); transform-origin: bottom right; }
          to   { opacity: 1; transform: scale(1) translateY(0); transform-origin: bottom right; }
        }
        @keyframes em-slide-user {
          from { opacity: 0; transform: translateX(16px) translateY(4px); }
          to   { opacity: 1; transform: translateX(0) translateY(0); }
        }
        @keyframes em-slide-assistant {
          from { opacity: 0; transform: translateX(-12px) translateY(4px); }
          to   { opacity: 1; transform: translateX(0) translateY(0); }
        }
        @keyframes em-fade-in {
          from { opacity: 0; transform: translateY(6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes em-pill-in {
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
                {messages.length > 0 && (
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
              {messages.length === 0 ? (
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
                        style={{ animation: `em-pill-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both`, animationDelay: `${i * 60}ms` }}
                        data-testid={`widget-prompt-${i}`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <EdenChatThread
                  messages={messages}
                  streaming={streaming}
                  messageFeedback={messageFeedback}
                  expandedCitations={expandedCitations}
                  savedIngestedIds={savedIngestedIds}
                  onFeedback={handleFeedback}
                  onSend={handleSend}
                  onToggleCitations={(i, open) => setExpandedCitations((prev) => ({ ...prev, [i]: open }))}
                  compact
                  chatEndRef={chatEndRef as React.RefObject<HTMLDivElement>}
                />
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

        {/* Trigger — pill when closed, circle when open */}
        <button
          onClick={() => setOpen((v) => !v)}
          className={`relative flex items-center transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 ${
            open
              ? "w-11 h-11 rounded-full justify-center bg-foreground text-background"
              : "h-11 pl-2.5 pr-4 rounded-full gap-2.5 bg-emerald-600 hover:bg-emerald-500 text-white"
          }`}
          style={!open ? { animation: "eden-bubble-pulse 3s ease-in-out infinite" } : undefined}
          data-testid="widget-button-toggle"
          aria-label="Open Eden Intelligence"
        >
          {open ? (
            <X className="h-5 w-5" />
          ) : (
            <>
              {/* EdenNX logomark — small orb container */}
              <div className="w-7 h-7 rounded-full bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              {/* Label */}
              <span className="text-xs font-bold tracking-wide text-white">Ask EDEN</span>
              {/* Unread dot */}
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
