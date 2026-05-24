import { useState, useEffect, useRef, useMemo } from "react";
import { OrientationHint } from "@/components/OrientationHint";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Zap, Mic, MicOff, ChevronRight, PanelLeft, Plus } from "lucide-react";
import { EdenAvatar, EdenOrb, EdenIntro, getPersonalizedCards } from "@/components/EdenOrb";
import { EdenChatThread } from "@/components/EdenChatThread";
import { useEdenChat, type EdenSessionSummary, type EdenUserContext, type StreamingStage } from "@/hooks/useEdenChat";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useToast } from "@/hooks/use-toast";
import { getIndustryProfile } from "@/hooks/use-industry";
import { useAuth } from "@/hooks/use-auth";

const SLASH_COMMANDS = [
  { cmd: "/thesis-match", desc: "Match assets to your deal criteria" },
  { cmd: "/compare", desc: "Compare institutions or asset classes" },
  { cmd: "/filter", desc: "Filter by stage, modality, or institution" },
  { cmd: "/explain", desc: "Explain a technology or mechanism of action" },
  { cmd: "/summarize", desc: "Summarize findings from this session" },
  { cmd: "/top-institutions", desc: "Rank TTOs in a therapeutic area" },
] as const;

const STAGE_LABELS: Record<StreamingStage, string> = {
  idle: "",
  searching: "Searching corpus…",
  ranking: "Ranking results…",
  generating: "Generating response…",
};

// ── Empty state with personalized prompt cards ────────────────────────────
function EmptyState({
  onSend,
  streaming,
  totalIndexed,
  profile,
  introPlayed,
  onIntroDone,
}: {
  onSend: (q: string) => void;
  streaming: boolean;
  totalIndexed: number;
  profile: ReturnType<typeof getIndustryProfile>;
  introPlayed: boolean;
  onIntroDone: () => void;
}) {
  if (!introPlayed) {
    return <EdenIntro onDone={onIntroDone} />;
  }

  const cards = getPersonalizedCards(profile);
  const greetName = profile.companyName || null;

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-4" data-testid="chat-empty">
      <div
        className="flex flex-col items-center mb-4 w-full"
        style={{ animation: "ie-fade-up 400ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
      >
        <div className="relative w-full max-w-[320px] sm:max-w-[560px] mx-auto mb-1">
          <EdenOrb isThinking={streaming} />
          {streaming && (
            <span className="absolute bottom-6 right-8 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-background animate-pulse" />
          )}
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground leading-none mt-1">
          <span style={{
            background: "linear-gradient(135deg, hsl(var(--foreground)) 0%, #10b981 60%, #6ee7b7 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            E · D · E · N
          </span>
        </h1>
        <p className="text-[11px] text-muted-foreground mt-1 tracking-widest uppercase">
          Engine for Discovery &amp; Emerging Networks
        </p>
        {greetName && (
          <p className="text-xs text-muted-foreground mt-2" style={{ animation: "ie-fade-up 400ms cubic-bezier(0.16, 1, 0.3, 1) both", animationDelay: "80ms" }}>
            Welcome back, <span className="font-semibold text-foreground">{greetName}</span>
            {profile.therapeuticAreas.length > 0 && (
              <> · focused on <span className="text-emerald-600 dark:text-emerald-400 font-medium">{profile.therapeuticAreas.slice(0, 2).join(" & ")}</span></>
            )}
          </p>
        )}
        {totalIndexed > 0 && (
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            {totalIndexed.toLocaleString()} assets indexed across 220+ institutions
          </p>
        )}
      </div>

      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 w-full max-w-2xl"
        style={{ animation: "ie-fade-up 400ms cubic-bezier(0.16, 1, 0.3, 1) both", animationDelay: "120ms" }}
      >
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <button
              key={card.q}
              onClick={() => onSend(card.q)}
              disabled={streaming}
              className={`group text-left rounded-xl border bg-gradient-to-br p-3 sm:p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${card.color}`}
              style={{ animation: `ie-fade-up 360ms cubic-bezier(0.16, 1, 0.3, 1) both`, animationDelay: `${180 + i * 45}ms` }}
              data-testid={`prompt-card-${i}`}
            >
              <Icon className={`h-4 w-4 sm:h-5 sm:w-5 mb-2 sm:mb-2.5 shrink-0 ${card.iconColor}`} />
              <p className="text-[11px] sm:text-xs font-semibold text-foreground leading-tight">{card.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function IndustryEden() {
  const { toast } = useToast();
  const { session } = useAuth();
  const pw = session?.access_token ?? "";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [expandedCitations, setExpandedCitations] = useState<Record<number, boolean>>({});
  const [messageFeedback, setMessageFeedback] = useState<Record<number, "up" | "down">>({});

  const [introPlayed, setIntroPlayed] = useState(() => {
    try { return sessionStorage.getItem("eden-intro-played") === "1"; } catch { return false; }
  });
  const handleIntroDone = () => setIntroPlayed(true);

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
      const res = await fetch("/api/admin/eden/stats", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) return { embeddingCoverage: { totalEmbedded: 0 } };
      return res.json();
    },
    staleTime: 60000,
  });
  const totalIndexed = embedData?.embeddingCoverage?.totalEmbedded ?? 0;

  const {
    messages,
    input,
    setInput,
    streaming,
    streamingStage,
    sessionId,
    send,
    clearChat,
    loadSession,
  } = useEdenChat(pw, userContext);

  useEffect(() => {
    if (messages.length > 0) {
      try { sessionStorage.setItem("eden-intro-played", "1"); } catch {}
    }
  }, [messages.length]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  // Reset slash palette selection when input changes
  useEffect(() => {
    setSlashIndex(0);
  }, [input]);

  const { data: sessionsData, refetch: refetchSessions } = useQuery<EdenSessionSummary[]>({
    queryKey: ["/api/eden/sessions"],
    queryFn: async () => {
      const res = await fetch("/api/eden/sessions?limit=25", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: sidebarOpen,
    staleTime: 10000,
  });

  function handleNewChat() {
    clearChat();
    setExpandedCitations({});
    setMessageFeedback({});
  }

  function handleLoadSession(s: EdenSessionSummary) {
    loadSession(s);
    setExpandedCitations({});
    setMessageFeedback({});
    setSidebarOpen(false);
  }

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
      toast({ title: "Feedback noted, thanks!", duration: 2000 });
    } catch {
      setMessageFeedback((prev) => { const n = { ...prev }; delete n[msgIndex]; return n; });
      toast({ title: "Couldn't save feedback", variant: "destructive" });
    }
  }

  function handleSend(q?: string) {
    send(q);
    textareaRef.current?.focus();
  }

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

  // Refetch sessions when sidebar opens and a new message was sent
  useEffect(() => {
    if (sidebarOpen) refetchSessions();
  }, [sidebarOpen, sessionId]);

  const { isListening, isSupported: speechSupported, toggle: toggleSpeech } = useSpeechRecognition(
    (transcript) => setInput(input ? `${input} ${transcript}` : transcript)
  );

  // Slash command palette state
  const showSlashPalette = input.startsWith("/") && !input.includes(" ");
  const filteredCommands = [...SLASH_COMMANDS].filter((c) => c.cmd.startsWith(input.toLowerCase()));

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showSlashPalette && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIndex((i) => Math.min(i + 1, filteredCommands.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        setInput(filteredCommands[slashIndex].cmd + " ");
        setSlashIndex(0);
        return;
      }
      if (e.key === "Escape") { setInput(""); setSlashIndex(0); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="min-h-full bg-background flex flex-col" data-testid="industry-eden-page">
      <style>{`
        @keyframes em-slide-user {
          from { opacity: 0; transform: translateX(20px) translateY(4px); }
          to   { opacity: 1; transform: translateX(0) translateY(0); }
        }
        @keyframes em-slide-assistant {
          from { opacity: 0; transform: translateX(-16px) translateY(4px); }
          to   { opacity: 1; transform: translateX(0) translateY(0); }
        }
        @keyframes em-fade-in {
          from { opacity: 0; transform: translateY(6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ie-fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ie-dot-float {
          0%, 100% { transform: translateY(0px) translateX(0px); }
          33%      { transform: translateY(-10px) translateX(4px); }
          66%      { transform: translateY(-5px) translateX(-3px); }
        }
        @keyframes em-pill-in {
          from { opacity: 0; transform: translateY(6px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="px-3 sm:px-4 py-2.5 border-b border-border flex items-center gap-2 sm:gap-2.5 shrink-0"
        style={{ background: "linear-gradient(to right, hsl(var(--emerald-500) / 0.04), transparent)" }}
        data-testid="eden-identity-header"
      >
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className={`p-1.5 rounded-md hover:bg-muted transition-colors shrink-0 ${sidebarOpen ? "text-foreground bg-muted" : "text-muted-foreground"}`}
          title={sidebarOpen ? "Close sessions" : "View sessions"}
          data-testid="button-sidebar-toggle"
        >
          <PanelLeft className="h-4 w-4" />
        </button>

        <EdenAvatar isThinking={streaming} size={26} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-foreground leading-none" data-testid="eden-name">Eden Intelligence</h2>
            <span
              className="text-[10px] text-muted-foreground/80 bg-muted/70 border border-border/60 rounded-full px-2 py-0.5 font-mono shrink-0"
              data-testid="eden-descriptor"
            >
              Claude · {totalIndexed > 0 ? `${(totalIndexed / 1000).toFixed(0)}k assets` : "…"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2"
              onClick={handleNewChat}
              data-testid="button-chat-clear"
            >
              New chat
            </Button>
          )}
        </div>
      </div>

      {/* ── Body: sidebar + main ─────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT SIDEBAR */}
        <div
          className={`${sidebarOpen ? "w-56 sm:w-64" : "w-0"} transition-[width] duration-200 overflow-hidden border-r border-border flex flex-col bg-card/30 shrink-0`}
          data-testid="session-sidebar"
        >
          {/* Inner fixed-width wrapper prevents content collapsing during transition */}
          <div className="w-56 sm:w-64 flex flex-col h-full">
            <div className="px-3 py-2.5 border-b border-border flex items-center justify-between shrink-0">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Sessions</p>
              <button
                onClick={handleNewChat}
                className="p-1 hover:bg-muted rounded transition-colors"
                title="New chat"
                data-testid="button-sidebar-new-chat"
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-1" data-testid="session-history-panel">
              {!sessionsData && sidebarOpen && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> Loading…
                </div>
              )}
              {sessionsData?.length === 0 && (
                <p className="text-xs text-muted-foreground px-3 py-3">No sessions yet.</p>
              )}
              {sessionsData && sessionsData.length > 0 && (
                <div className="space-y-0.5 px-1">
                  {sessionsData.map((s) => {
                    const firstQ = s.messages?.find((m) => m.role === "user")?.content ?? "Untitled session";
                    const date = new Date(s.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                    const msgCount = s.messages?.length ?? 0;
                    return (
                      <button
                        key={s.sessionId}
                        onClick={() => handleLoadSession(s)}
                        className="w-full text-left rounded-md px-2 py-2 hover:bg-muted transition-colors flex items-center gap-1.5 group"
                        data-testid={`session-item-${s.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{firstQ.slice(0, 55)}{firstQ.length > 55 ? "…" : ""}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 whitespace-nowrap">{date} · {msgCount} msg{msgCount !== 1 ? "s" : ""}</p>
                        </div>
                        <ChevronRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Ambient background dots */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            {[
              { s: 5,  x: "6%",  y: "18%", c: "#10b981", o: 0.07, d: 7.2,  dl: 0.0 },
              { s: 4,  x: "17%", y: "78%", c: "#10b981", o: 0.06, d: 9.8,  dl: 2.3 },
              { s: 6,  x: "58%", y: "9%",  c: "#6ee7b7", o: 0.07, d: 11.5, dl: 4.7 },
              { s: 3,  x: "86%", y: "72%", c: "#10b981", o: 0.06, d: 8.1,  dl: 6.2 },
              { s: 5,  x: "3%",  y: "48%", c: "#6ee7b7", o: 0.05, d: 10.3, dl: 1.1 },
              { s: 7,  x: "91%", y: "22%", c: "#10b981", o: 0.07, d: 8.7,  dl: 3.4 },
              { s: 4,  x: "44%", y: "88%", c: "#6ee7b7", o: 0.05, d: 12.0, dl: 5.9 },
            ].map((dot, i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: dot.s, height: dot.s,
                  left: dot.x, top: dot.y,
                  background: dot.c, opacity: dot.o,
                  animation: `ie-dot-float ${dot.d}s ease-in-out infinite`,
                  animationDelay: `${dot.dl}s`,
                }}
              />
            ))}
          </div>

          {/* Messages scroll area */}
          <div
            className="relative flex-1 overflow-y-auto flex flex-col"
            data-testid="chat-messages"
          >
            {messages.length === 0 && (
              <EmptyState
                onSend={handleSend}
                streaming={streaming}
                totalIndexed={totalIndexed}
                profile={profile}
                introPlayed={introPlayed}
                onIntroDone={handleIntroDone}
              />
            )}

            {messages.length > 0 && (
              <EdenChatThread
                messages={messages}
                streaming={streaming}
                messageFeedback={messageFeedback}
                expandedCitations={expandedCitations}
                savedIngestedIds={savedIngestedIds}
                onFeedback={handleFeedback}
                onSend={handleSend}
                onToggleCitations={(i, open) => setExpandedCitations((prev) => ({ ...prev, [i]: open }))}
                compact={false}
                chatEndRef={chatEndRef as React.RefObject<HTMLDivElement>}
              />
            )}
          </div>

          {/* Input area */}
          <div className="px-4 sm:px-6 pb-3 pt-2 bg-background/95 backdrop-blur shrink-0" data-testid="chat-input-area">
            {messages.length === 0 && (
              <div className="max-w-3xl mx-auto mb-2">
                <OrientationHint
                  hintId="eden-thesis-matching"
                  title="Thesis matching."
                  body="Describe your deal criteria (modality, stage, indication, deal structure) and EDEN will cross-reference the entire network against your requirements."
                  accent="emerald"
                />
              </div>
            )}

            <div className="max-w-3xl mx-auto relative">
              {/* Slash command palette */}
              {showSlashPalette && filteredCommands.length > 0 && (
                <div
                  className="absolute bottom-full mb-1.5 left-0 right-0 bg-popover border border-border rounded-xl shadow-xl overflow-hidden z-50"
                  data-testid="slash-palette"
                >
                  {filteredCommands.map((cmd, ci) => (
                    <button
                      key={cmd.cmd}
                      className={`w-full text-left px-3 py-2.5 flex items-baseline gap-2 transition-colors border-b border-border/50 last:border-0 ${ci === slashIndex ? "bg-emerald-500/10" : "hover:bg-muted"}`}
                      onMouseDown={(e) => { e.preventDefault(); setInput(cmd.cmd + " "); textareaRef.current?.focus(); setSlashIndex(0); }}
                      data-testid={`slash-cmd-${ci}`}
                    >
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs shrink-0">{cmd.cmd}</span>
                      <span className="text-muted-foreground text-[11px] truncate">{cmd.desc}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Input row */}
              <div className="flex gap-2 items-end rounded-2xl border border-border bg-card px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/30 focus-within:border-emerald-500/50 transition-all">
                <textarea
                  ref={textareaRef}
                  className="flex-1 text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/60 resize-none overflow-hidden leading-relaxed py-0.5"
                  placeholder="Ask about targets, mechanisms, institutions… or / for commands"
                  value={input}
                  rows={1}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={streaming}
                  data-testid="input-chat"
                  style={{ minHeight: "24px", maxHeight: "160px" }}
                />
                {speechSupported && (
                  <button
                    type="button"
                    onClick={toggleSpeech}
                    disabled={streaming}
                    className={`shrink-0 p-1.5 rounded-lg transition-colors self-end mb-0.5 ${isListening ? "text-red-500 bg-red-500/10 animate-pulse" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
                    title={isListening ? "Stop listening" : "Speak your question"}
                    data-testid="button-chat-mic"
                  >
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                )}
                <button
                  onClick={() => handleSend()}
                  disabled={streaming || !input.trim()}
                  className="shrink-0 h-7 w-7 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/30 text-white flex items-center justify-center transition-all self-end mb-0.5"
                  data-testid="button-chat-send"
                >
                  {streaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                </button>
              </div>

              {/* Streaming stage indicator */}
              {streaming && streamingStage !== "idle" && (
                <div className="flex items-center gap-1.5 mt-1.5" data-testid="streaming-stage">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="text-[11px] text-muted-foreground/70">{STAGE_LABELS[streamingStage]}</span>
                </div>
              )}

              {/* Listening indicator */}
              {isListening && (
                <p className="text-[11px] text-red-500 mt-1.5 flex items-center gap-1" data-testid="status-listening">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                  Listening… speak now
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
