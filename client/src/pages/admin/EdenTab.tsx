import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Download, Database, RefreshCw, AlertTriangle, CheckCircle2, ExternalLink, Zap, Sparkles, Activity, AlertCircle, XCircle, Microscope, Trash2, ClipboardList, Lightbulb, Users, UserPlus, Copy, Check, Inbox, ChevronDown, ChevronRight, ChevronUp, Building2, Clock, PackagePlus, BrainCircuit, PlayCircle, BarChart3, Mic, MicOff, ThumbsUp, ThumbsDown, Bookmark, Layers, Plus, Upload, FileText, Image as ImageIcon, Pencil, BookOpen, X, CreditCard, Server, TrendingUp, Globe, MessageSquare, FlaskConical, Send, Eye, Tag, ArrowUp, ArrowDown, ChevronsUpDown, Square, Key, PowerOff, RotateCcw, ArrowUpCircle, Shield, ShieldCheck, Lock, LogOut, DollarSign, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { PORTAL_CONFIG, ALL_PORTAL_ROLES, getPortalConfig, type PortalRole } from "@shared/portals";
import type { ConceptCard } from "@shared/schema";
import { formatDate, timeAgo, relativeTime, getErrorType, HealthDot, HealthLabel } from "./_shared";
import type { HealthStatus, ErrorType, CollectorHealthRow, SchedulerStatus, ActiveSearchRow, CollectorHealthData, SyncSessionData, SyncStatusResponse } from "./_shared";
import { EdenAvatar, MarkdownContent, EdenIntro, PROMPT_CARDS, getFollowUpPills } from "@/components/EdenOrb";
import { useEdenChat, type ChatAsset, type ChatMessage, type EdenSessionSummary } from "@/hooks/useEdenChat";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

function EdenTab({ pw }: { pw: string }) {
  const { toast } = useToast();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedCitations, setExpandedCitations] = useState<Record<number, boolean>>({});
  const [introPlayed, setIntroPlayed] = useState(() => {
    try { return sessionStorage.getItem("eden-admin-intro-played") === "1"; } catch { return false; }
  });
  const handleIntroDone = () => setIntroPlayed(true);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const { data: savedAssetsData } = useQuery<{ assets: Array<{ ingestedAssetId: number | null }> }>({
    queryKey: ["/api/saved-assets"],
    staleTime: 30000,
  });
  const savedIngestedIds = React.useMemo(() => {
    const ids = new Set<number>();
    for (const a of savedAssetsData?.assets ?? []) {
      if (a.ingestedAssetId != null) ids.add(a.ingestedAssetId);
    }
    return ids;
  }, [savedAssetsData]);

  const {
    messages: chatMessages,
    input: chatInput,
    setInput: setChatInput,
    streaming: chatStreaming,
    sessionId: chatSessionId,
    send: sendChatMessage,
    clearChat,
    loadSession: loadSessionFromHook,
  } = useEdenChat(pw);
  const [messageFeedback, setMessageFeedback] = useState<Record<number, "up" | "down">>({});
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: stats } = useQuery<EdenStatsResponse>({
    queryKey: ["/api/admin/eden/stats", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/eden/stats", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load EDEN stats");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: sessionsData, refetch: refetchSessions } = useQuery<EdenSessionSummary[]>({
    queryKey: ["/api/eden/sessions"],
    queryFn: async () => {
      const res = await fetch("/api/eden/sessions?limit=25", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: historyOpen,
    staleTime: 10000,
  });

  function loadSession(s: EdenSessionSummary) {
    loadSessionFromHook(s);
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
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ sessionId: chatSessionId, messageIndex: msgIndex, sentiment }),
      });
      if (!res.ok) throw new Error("server error");
      toast({ title: "Feedback noted, thanks!", duration: 2000 });
    } catch {
      setMessageFeedback((prev) => { const n = { ...prev }; delete n[msgIndex]; return n; });
      toast({ title: "Couldn't save feedback", variant: "destructive" });
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (chatMessages.length > 0) {
      try { sessionStorage.setItem("eden-admin-intro-played", "1"); } catch {}
    }
  }, [chatMessages.length]);

  useEffect(() => {
    if (!chatSessionId) return;
    fetch(`/api/eden/feedback/${chatSessionId}`, { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } })
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
  }, [chatSessionId]);

  const { isListening, isSupported: speechSupported, toggle: toggleSpeech } = useSpeechRecognition(
    (transcript) => setChatInput(chatInput ? `${chatInput} ${transcript}` : transcript)
  );

  const emb = stats?.embeddingCoverage;
  const chatReady = emb && emb.totalEmbedded > 0;
  const institutionCount = 223;

  return (
    <div className="space-y-6" data-testid="eden-tab">

      {/* ── EDEN Chat (hero section) ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm" data-testid="card-eden-chat">

        {/* Identity header */}
        <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-emerald-500/5 to-transparent flex items-center gap-3" data-testid="eden-identity-header">
          <EdenAvatar isThinking={chatStreaming} size={36} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-foreground" data-testid="eden-name">EDEN</h3>
              {chatReady && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-full px-2 py-0.5 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  live
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5" data-testid="eden-descriptor">
              TTO Intelligence Analyst · {institutionCount} institutions · {emb?.totalEmbedded?.toLocaleString() ?? "—"} assets indexed
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {chatMessages.length > 0 && (
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

        {/* Session history dropdown */}
        {historyOpen && (
          <div className="border-b border-border bg-muted/30 p-3 max-h-52 overflow-y-auto" data-testid="session-history-panel">
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
                      onClick={() => loadSession(s)}
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

        {/* Not-ready banner — non-blocking */}
        {!chatReady && (
          <div className="mx-5 my-3 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20 flex items-center gap-2" data-testid="chat-not-ready">
            <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">EDEN is not yet active. Generate vector embeddings first using the Data Quality tab.</p>
          </div>
        )}

        {/* Chat area */}
        <>
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
            @keyframes em-dot-float {
              0%, 100% { transform: translateY(0px) translateX(0px); }
              33%       { transform: translateY(-10px) translateX(4px); }
              66%       { transform: translateY(-5px) translateX(-3px); }
            }
            @keyframes em-pill-in {
              from { opacity: 0; transform: translateY(6px) scale(0.95); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
          <div className="relative h-[580px] overflow-y-auto flex flex-col bg-gradient-to-b from-background to-emerald-500/[0.02]" data-testid="chat-messages">

            {/* Ambient dots */}
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
                    animation: `em-dot-float ${dot.d}s ease-in-out infinite`,
                    animationDelay: `${dot.dl}s`,
                  }}
                />
              ))}
            </div>

            {/* Empty state — EdenIntro animation or prompt card grid */}
            {chatMessages.length === 0 && (
              introPlayed ? (
                <div className="flex flex-col items-center justify-center flex-1 px-4 py-8" data-testid="chat-empty">
                  <div
                    className="flex flex-col items-center mb-6"
                    style={{ animation: "em-fade-up 400ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
                  >
                    <div className="relative mb-4">
                      <EdenAvatar isThinking={chatStreaming} size={52} />
                      {chatStreaming && (
                        <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-background animate-pulse" />
                      )}
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground leading-none">
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
                    {emb?.totalEmbedded != null && (
                      <p className="text-[11px] text-muted-foreground/60 mt-1">
                        {emb.totalEmbedded.toLocaleString()} assets indexed across {institutionCount} institutions
                      </p>
                    )}
                  </div>
                  <div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 w-full max-w-2xl"
                    style={{ animation: "em-fade-up 400ms cubic-bezier(0.16, 1, 0.3, 1) both", animationDelay: "120ms" }}
                  >
                    {PROMPT_CARDS.map((card, ci) => {
                      const Icon = card.icon;
                      return (
                        <button
                          key={card.q}
                          onClick={() => sendChatMessage(card.q)}
                          disabled={chatStreaming}
                          className={`group text-left rounded-xl border bg-gradient-to-br p-3 sm:p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${card.color}`}
                          style={{ animation: "em-fade-up 360ms cubic-bezier(0.16, 1, 0.3, 1) both", animationDelay: `${180 + ci * 45}ms` }}
                          data-testid={`prompt-card-${ci}`}
                        >
                          <Icon className={`h-4 w-4 sm:h-5 sm:w-5 mb-2 sm:mb-2.5 shrink-0 ${card.iconColor}`} />
                          <p className="text-[11px] sm:text-xs font-semibold text-foreground leading-tight">{card.label}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <EdenIntro onDone={handleIntroDone} />
              )
            )}

            {/* Message thread */}
            {chatMessages.length > 0 && (
              <div className="px-4 sm:px-5 py-5 space-y-5 max-w-3xl w-full mx-auto">
                {chatMessages.map((msg, i) => {
                  const followUps = !msg.isStreaming && msg.role === "assistant" && msg.content
                    ? getFollowUpPills(msg.content, (msg.assets?.length ?? 0) > 0)
                    : [];
                  return (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      style={{ animation: msg.role === "user" ? "em-slide-user 340ms cubic-bezier(0.16, 1, 0.3, 1) both" : "em-slide-assistant 340ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
                      data-testid={`chat-msg-${i}`}
                    >
                      {msg.role === "assistant" && (
                        <div className="shrink-0 mt-1 mr-2">
                          <EdenAvatar isThinking={!!(msg.isStreaming)} size={22} />
                        </div>
                      )}
                      <div className={`${msg.role === "user" ? "max-w-[78%]" : "flex-1 min-w-0"}`}>
                        <div className={`rounded-2xl px-4 py-3 ${
                          msg.role === "user"
                            ? "rounded-tr-sm bg-emerald-600 text-white text-sm ml-auto w-fit shadow-sm"
                            : "rounded-tl-sm bg-muted/60 border-l-2 border-l-emerald-500/40 text-foreground"
                        }`}>
                          {msg.role === "assistant" && msg.isStreaming && !msg.content && (
                            <div className="flex gap-1 items-center py-0.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 animate-bounce" style={{ animationDelay: "0ms" }} />
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 animate-bounce" style={{ animationDelay: "130ms" }} />
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 animate-bounce" style={{ animationDelay: "260ms" }} />
                            </div>
                          )}
                          {msg.role === "user" && (
                            <p className="text-sm leading-relaxed">{msg.content}</p>
                          )}
                          {msg.role === "assistant" && msg.content && (
                            <MarkdownContent text={msg.content} isStreaming={msg.isStreaming} />
                          )}
                        </div>

                        {/* Feedback buttons */}
                        {msg.role === "assistant" && !msg.isStreaming && msg.content && (
                          <div className="flex items-center gap-0.5 mt-1 ml-0.5">
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

                        {/* Follow-up pills */}
                        {followUps.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2 ml-0.5" data-testid={`follow-up-pills-${i}`}>
                            {followUps.map((pill, pi) => (
                              <button
                                key={pill}
                                onClick={() => { sendChatMessage(pill); inputRef.current?.focus(); }}
                                disabled={chatStreaming}
                                className="text-[11px] px-2.5 py-1 rounded-full border border-emerald-500/25 bg-emerald-500/5 text-muted-foreground hover:text-foreground hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all disabled:opacity-40"
                                style={{ animation: "em-pill-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both", animationDelay: `${pi * 60}ms` }}
                                data-testid={`pill-followup-${i}-${pi}`}
                              >
                                {pill}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Citation cards — deferred behind toggle */}
                        {msg.role === "assistant" && msg.assets && msg.assets.length > 0 && !msg.isStreaming && (
                          <div className="mt-2.5" data-testid={`chat-citations-${i}`}>
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
                                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-2 group"
                                  onClick={() => setExpandedCitations((prev) => ({ ...prev, [i]: false }))}
                                  data-testid={`button-hide-citations-${i}`}
                                >
                                  <ChevronDown className="h-3 w-3 shrink-0 rotate-180 group-hover:text-foreground transition-colors" />
                                  Hide assets
                                </button>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
                  );
                })}
                <div ref={chatEndRef} />
              </div>
            )}
            {chatMessages.length === 0 && <div ref={chatEndRef} />}
          </div>

          {/* Input bar — integrated pill style */}
          <div className="px-4 py-3 border-t border-border bg-background/95 backdrop-blur" data-testid="chat-input-area">
            <div className="flex gap-2 items-center rounded-2xl border border-border bg-card px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/30 focus-within:border-emerald-500/50 transition-all">
              <input
                ref={inputRef}
                className="flex-1 text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/60"
                placeholder="Ask about targets, mechanisms, institutions, licensing readiness…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                disabled={chatStreaming}
                data-testid="input-chat"
              />
              {speechSupported && (
                <button
                  type="button"
                  onClick={toggleSpeech}
                  disabled={chatStreaming}
                  className={`shrink-0 p-1.5 rounded-lg transition-colors ${isListening ? "text-red-500 bg-red-500/10 animate-pulse" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
                  title={isListening ? "Stop listening" : "Speak your question"}
                  data-testid="button-chat-mic"
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
              <button
                onClick={() => sendChatMessage()}
                disabled={chatStreaming || !chatInput.trim()}
                className="shrink-0 h-7 w-7 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/30 text-white flex items-center justify-center transition-all"
                data-testid="button-chat-send"
              >
                {chatStreaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              </button>
            </div>
            {isListening && (
              <p className="text-[11px] text-red-500 mt-1.5 flex items-center justify-center gap-1" data-testid="status-listening">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                Listening… speak now
              </p>
            )}
          </div>
        </>
      </div>

    </div>
  );
}

function MiniBackfillButton({ pw, onDone }: { pw: string; onDone: () => void }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function run() {
    if (!window.confirm("Seed mini_enrich_attempts=1 for assets already processed but still having unknown fields?\n\nThis prevents them from getting a fresh 3-attempt slate — they will still receive 2 more tries with the improved prompts.")) return;
    setPending(true);
    try {
      const res = await fetch("/api/admin/enrichment/mini-backfill", {
        method: "POST",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      const json = await res.json();
      setDone(true);
      onDone();
      window.alert(`Backfill complete — ${json.updated?.toLocaleString() ?? 0} assets seeded.`);
    } catch {
      window.alert("Backfill failed. Check server logs.");
    } finally {
      setPending(false);
    }
  }

  if (done) return null;
  return (
    <Button size="sm" variant="ghost"
      className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      onClick={run} disabled={pending} data-testid="button-mini-backfill">
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      Seed past attempts
    </Button>
  );
}

function AdminInner() {

export { EdenTab };
