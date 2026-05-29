import React, { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { Nav } from "@/components/Nav";
import { EdenNXBadge } from "@/components/EdenNXBadge";
import { EdenAvatar } from "@/components/EdenOrb";
import { Button } from "@/components/ui/button";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { RadarBackground } from "@/components/RadarBackground";
import { ArrowRight } from "lucide-react";

function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("is-visible"); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return ref;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

/* ─── SVG radar mark (avoids Canva white-bg artifact) ─────────── */

function RadarMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden
      style={{ color: "hsl(var(--primary))", flexShrink: 0 }}
    >
      <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="14" cy="14" r="7.5" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.55" />
      <circle cx="14" cy="14" r="3" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.35" />
      <line x1="2" y1="14" x2="5" y2="14" stroke="currentColor" strokeWidth="1.2" />
      <line x1="23" y1="14" x2="26" y2="14" stroke="currentColor" strokeWidth="1.2" />
      <line x1="14" y1="2" x2="14" y2="5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="14" y1="23" x2="14" y2="26" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/* ─── Data types ─────────────────────────────────────────────── */

interface AssetCardData {
  id: number;
  title: string;
  institution: string;
  stage: string;
  score: number;
  modality: string;
}

interface ChatMessage {
  role: "eden" | "user";
  text: string;
  delay: number;
  typingFor?: number;
  assetCards?: AssetCardData[];
  scanning?: boolean;
  instant?: boolean;
}

/* ─── Asset data ─────────────────────────────────────────────── */

const DEMO_ASSETS_JHU: AssetCardData[] = [
  { id: 1, title: "CAR-T Cell Therapy Targeting CD19/CD22 Dual Antigen", institution: "Johns Hopkins", stage: "Preclinical", score: 91, modality: "Cell Therapy" },
  { id: 2, title: "Bispecific Antibody Against PD-L1 and TIM-3 in Lymphoma", institution: "Johns Hopkins", stage: "IND-Enabling", score: 88, modality: "Antibody" },
  { id: 3, title: "HDAC Inhibitor Platform for Solid Tumor Microenvironment", institution: "Johns Hopkins", stage: "Discovery", score: 85, modality: "Small Molecule" },
];

const DEMO_ASSETS_CNS: AssetCardData[] = [
  { id: 4, title: "α-Synuclein Targeting Antibody for Parkinson's Disease", institution: "Mayo Clinic", stage: "Preclinical", score: 93, modality: "Antibody" },
  { id: 5, title: "AAV9 Gene Therapy Targeting Motor Neurons in ALS", institution: "Columbia University", stage: "IND-Enabling", score: 89, modality: "Gene Therapy" },
  { id: 6, title: "LRRK2 Kinase Inhibitor Platform for Neurodegeneration", institution: "Stanford University", stage: "Discovery", score: 87, modality: "Small Molecule" },
];

const DEMO_ASSETS_ADC: AssetCardData[] = [
  { id: 7, title: "HER2-Targeted ADC with Novel Cleavable Linker Chemistry", institution: "MIT Koch Institute", stage: "IND-Enabling", score: 92, modality: "ADC" },
  { id: 8, title: "TROP2-Directed ADC for Triple-Negative Breast Cancer", institution: "Mem. Sloan Kettering", stage: "Preclinical", score: 86, modality: "ADC" },
  { id: 9, title: "CD33 ADC with Disulfide Linker for AML", institution: "Univ. of Washington", stage: "Discovery", score: 84, modality: "ADC" },
];

/* ─── Single continuous conversation ─────────────────────────── */

const FULL_CONVERSATION: ChatMessage[] = [
  {
    role: "user",
    text: "Good morning. We're building out an oncology pipeline and want to see what's active at Hopkins. Where should we start?",
    delay: 1200,
  },
  {
    role: "eden",
    text: "14 JHU oncology programs in your focus area. The HDAC inhibitor's target space overlaps with Pfizer's recent Seagen territory, so worth flagging before you invest time. The CAR-T is different: dual-antigen targeting, listed as available for licensing on the JHU TTO portal. I'd start there.",
    delay: 3200,
    scanning: true,
    assetCards: DEMO_ASSETS_JHU,
  },
  {
    role: "user",
    text: "Tell me more about the CAR-T. What makes it stand out?",
    delay: 11500,
  },
  {
    role: "eden",
    text: "It targets CD19 and CD22 simultaneously, addressing the single-antigen resistance that has limited earlier CAR-T programs. Patent is pending. The innovation claim flags the dual-targeting approach as not yet replicated in the current competitive landscape. Three supporting publications are indexed. Licensing readiness is marked active on the JHU portal.",
    delay: 15200,
    typingFor: 1800,
  },
  {
    role: "user",
    text: "The 91 is the highest there. Can you pull preclinical CNS across all institutions?",
    delay: 21000,
  },
  {
    role: "eden",
    text: "Strong programs at Mayo, Stanford, and Columbia. Mayo's alpha-synuclein antibody leads: recently indexed, mechanism well-documented, listed as available. Columbia's ALS gene therapy is IND-enabling and still available. Two are showing rising momentum this month, meaning new activity has been indexed since we last scored them.",
    delay: 23000,
    scanning: true,
    assetCards: DEMO_ASSETS_CNS,
  },
  {
    role: "user",
    text: "The Columbia ALS program: is it already in discussion somewhere or still open?",
    delay: 33000,
  },
  {
    role: "eden",
    text: "Listed as available on the Columbia TTO portal. No competing programs in the ALS space are indexed past discovery stage right now. The competing assets panel shows three others in this space, none close in development or coverage.",
    delay: 36800,
    typingFor: 1800,
  },
  {
    role: "user",
    text: "Let's add Columbia ALS and Hopkins CAR-T to the pipeline.",
    delay: 42500,
  },
  {
    role: "eden",
    text: "Added. Columbia ALS and Hopkins CAR-T are in your CAR-T pipeline under Watching. You can move them through stages as your process develops: Evaluating, In Discussion, On Hold, or Passed.",
    delay: 46200,
    typingFor: 1800,
  },
  {
    role: "user",
    text: "Set an alert for gene therapy, anything new that looks strong.",
    delay: 52000,
  },
  {
    role: "eden",
    text: "How often do you want to hear from me: real-time as programs are discovered, daily digest, or weekly summary?",
    delay: 55500,
    typingFor: 1800,
  },
  {
    role: "user",
    text: "Real-time.",
    delay: 61000,
  },
  {
    role: "eden",
    text: "Alert is live across gene therapy, all institutions, as discovered. You'll hear from me the moment something new is indexed. When you're ready to go deeper on either program, the full dossier is one click away: supporting literature, competing assets, and enrichment data are all in there. Good session. What's next?",
    delay: 64000,
    typingFor: 1800,
  },
];

/* ─── EDEN Intro splash ──────────────────────────────────────── */

function EdenIntro({ onDone }: { onDone: () => void }) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const t = setTimeout(onDone, reducedMotion ? 100 : 2300);
    return () => clearTimeout(t);
  }, [reducedMotion, onDone]);

  if (reducedMotion) return null;

  return (
    <div
      className="absolute inset-0 z-20 rounded-2xl flex flex-col items-center justify-center gap-5"
      style={{
        background: "hsl(var(--card))",
        animation: "eden-intro-exit 0.45s cubic-bezier(0.4,0,0.2,1) 1.85s forwards",
        willChange: "opacity, transform",
        pointerEvents: "none",
      }}
    >
      <style>{`
        @keyframes eden-letter-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes eden-sub-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes eden-intro-exit {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(-14px); }
        }
        @keyframes eden-ring {
          0%   { opacity: 0.55; transform: translate(-50%,-50%) scale(1); }
          100% { opacity: 0;    transform: translate(-50%,-50%) scale(2.4); }
        }
      `}</style>

      <div className="relative flex items-center justify-center" style={{ width: 64, height: 64 }}>
        {[0, 0.35, 0.7].map((d, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              top: "50%", left: "50%", width: 64, height: 64,
              border: "1.5px solid hsl(var(--primary) / 0.4)",
              animation: `eden-ring 1.8s ease-out ${d}s infinite`,
            }}
          />
        ))}
        <div style={{ position: "relative", zIndex: 1 }}>
          <RadarMark size={38} />
        </div>
      </div>

      <div className="flex items-end gap-2.5">
        {["E", "D", "E", "N"].map((letter, i) => (
          <span
            key={i}
            className="text-5xl font-black"
            style={{
              color: "hsl(var(--foreground))",
              opacity: 0,
              animation: `eden-letter-in 0.38s cubic-bezier(0.2,0,0,1) ${i * 75 + 120}ms forwards`,
              letterSpacing: "0.06em",
            }}
          >
            {letter}
          </span>
        ))}
      </div>

      <p
        className="text-[10px] font-semibold uppercase text-center"
        style={{
          color: "hsl(var(--primary))",
          opacity: 0,
          animation: "eden-sub-in 0.5s ease-out 580ms forwards",
          letterSpacing: "0.2em",
          maxWidth: 260,
        }}
      >
        Engine for Discovery &amp; Emerging Networks
      </p>
    </div>
  );
}

/* ─── Scanning animation ─────────────────────────────────────── */

const SCAN_NAMES = ["MIT TTO", "Stanford OTL", "Johns Hopkins", "Mayo Clinic", "Max Planck", "Columbia", "UCSF", "Harvard OTD", "Yale TTO", "NIH", "Oxford TT", "Wellcome Trust", "Penn TTO", "Duke OLV", "Broad Institute", "Rockefeller"];

function ScanningAnimation({ onDone }: { onDone: () => void }) {
  const reducedMotion = useReducedMotion();
  const [nameIdx, setNameIdx] = useState(0);
  const [dots, setDots] = useState(1);

  useEffect(() => {
    if (reducedMotion) {
      const t = setTimeout(onDone, 80);
      return () => clearTimeout(t);
    }
    let step = 0;
    const iv = setInterval(() => {
      step++;
      setNameIdx((p) => (p + 1) % SCAN_NAMES.length);
      setDots((p) => (p % 3) + 1);
      if (step >= 16) { clearInterval(iv); setTimeout(onDone, 160); }
    }, 150);
    return () => clearInterval(iv);
  }, [reducedMotion, onDone]);

  return (
    <div className="flex items-center gap-2.5 py-1">
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: "hsl(var(--primary))", animation: reducedMotion ? undefined : "eden-pulse 0.6s ease-in-out infinite" }}
      />
      <span className="text-[11px] font-mono" style={{ color: "hsl(var(--primary) / 0.75)" }}>
        Scanning 358 institutions{".".repeat(dots)}{" "}
        <span key={nameIdx} style={{ animation: reducedMotion ? undefined : "scan-slide 0.12s ease-out forwards" }}>{SCAN_NAMES[nameIdx]}</span>
      </span>
    </div>
  );
}

/* ─── Query result card ──────────────────────────────────────── */

function QueryResultCard({ asset }: { asset: AssetCardData }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4"
      style={{
        height: 58,
        background: "hsl(var(--background))",
        border: "1px solid hsl(var(--border))",
        boxShadow: "0 3px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-lg font-bold tabular-nums"
        style={{
          width: 38, height: 38,
          background: "hsl(var(--primary) / 0.12)",
          color: "hsl(var(--primary))",
          fontSize: 13,
        }}
      >
        {asset.score}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-foreground leading-snug truncate">{asset.title}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {asset.institution} · {asset.stage} · {asset.modality}
        </p>
      </div>
    </div>
  );
}

/* ─── EDEN Chat Demo ─────────────────────────────────────────── */

function EdenChatDemo({ messages }: { messages: ChatMessage[] }) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<"intro" | "chat">("intro");
  const [visibleCount, setVisibleCount] = useState(0);
  const [scanningIdx, setScanningIdx] = useState<number | null>(null);
  const [typingIdx, setTypingIdx] = useState<number | null>(null);
  const [doneSet, setDoneSet] = useState<Set<number>>(new Set());
  const chatRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const tids = useRef<ReturnType<typeof setTimeout>[]>([]);

  const scrollBottom = useCallback(() => {
    if (userScrolledUp.current) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
    }));
  }, []);

  const handleScroll = useCallback(() => {
    if (!chatRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatRef.current;
    userScrolledUp.current = scrollHeight - scrollTop - clientHeight > 80;
  }, []);

  useEffect(() => {
    if (phase !== "chat") return;
    tids.current.forEach(clearTimeout);
    tids.current = [];

    messages.forEach((msg, i) => {
      const delay = reducedMotion ? Math.min(i * 500, 5000) : msg.delay;
      const typingFor = !reducedMotion && !msg.instant && !msg.scanning && msg.typingFor ? msg.typingFor : 0;

      if (typingFor > 0 && msg.role === "eden") {
        const tTyping = setTimeout(() => {
          setTypingIdx(i);
          scrollBottom();
        }, Math.max(0, delay - typingFor));
        tids.current.push(tTyping);
      }

      const t = setTimeout(() => {
        if (msg.role === "eden") setTypingIdx(null);
        setVisibleCount(i + 1);
        scrollBottom();

        if (msg.role === "eden") {
          if (msg.instant || !msg.scanning) {
            setDoneSet(prev => new Set(prev).add(i));
          } else if (msg.scanning) {
            setScanningIdx(i);
          }
        }
      }, delay);
      tids.current.push(t);
    });

    return () => tids.current.forEach(clearTimeout);
  }, [phase, messages, reducedMotion, scrollBottom]);

  function handleScanDone(idx: number) {
    setScanningIdx(null);
    const pauseT = setTimeout(() => {
      setDoneSet(prev => new Set(prev).add(idx));
      scrollBottom();
    }, reducedMotion ? 0 : 380);
    tids.current.push(pauseT);
  }

  return (
    <div
      className="relative flex flex-col rounded-2xl overflow-hidden"
      style={{
        height: "clamp(440px, 66vh, 560px)",
        background: "hsl(var(--card))",
        boxShadow: "0 32px 72px rgba(0,0,0,0.13), 0 8px 24px rgba(0,0,0,0.07), 0 2px 6px rgba(0,0,0,0.04)",
      }}
    >
      <style>{`
        @keyframes eden-pulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
        @keyframes fade-up { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes scan-slide { from { opacity:0; transform:translateX(-5px); } to { opacity:1; transform:translateX(0); } }
        @keyframes typing-dot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
        .eden-chat-scroll::-webkit-scrollbar { width: 3px; }
        .eden-chat-scroll::-webkit-scrollbar-track { background: transparent; }
        .eden-chat-scroll::-webkit-scrollbar-thumb { background: hsl(var(--border)); border-radius: 2px; }
        .eden-chat-scroll::-webkit-scrollbar-thumb:hover { background: hsl(var(--muted-foreground) / 0.3); }
        .eden-chat-scroll { scrollbar-width: thin; scrollbar-color: hsl(var(--border)) transparent; }
      `}</style>

      {phase === "intro" && <EdenIntro onDone={() => setPhase("chat")} />}

      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-3 border-b flex-shrink-0"
        style={{ background: "hsl(var(--background))", borderColor: "hsl(var(--border))" }}
      >
        <RadarMark size={26} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight text-foreground">EDEN</p>
          <p className="text-[10px] text-primary">Research Intelligence</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            className="w-1.5 h-1.5 rounded-full bg-primary"
            style={{ animation: reducedMotion ? undefined : "eden-pulse 2s ease-in-out infinite" }}
          />
          <span className="text-[10px] font-semibold text-primary">Live · 358 TTOs</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 relative min-h-0">
        <div
          ref={chatRef}
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
          aria-atomic="false"
          aria-label="EDEN conversation"
          className="eden-chat-scroll absolute inset-0 overflow-y-auto px-4 py-5 space-y-4"
          style={{ background: "hsl(var(--background))" }}
        >
          {messages.slice(0, visibleCount).map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              style={{ animation: reducedMotion ? undefined : "fade-up 0.38s ease-out forwards" }}
            >
              {msg.role === "eden" && <EdenAvatar size={26} />}
              <div className="flex flex-col gap-2 min-w-0" style={{ maxWidth: "88%" }}>
                {msg.role === "user" ? (
                  <div
                    className="px-4 py-2.5 text-[12px] leading-relaxed font-medium text-left"
                    style={{
                      background: "hsl(33 85% 44%)",
                      color: "white",
                      borderRadius: "16px 16px 4px 16px",
                      boxShadow: "0 3px 12px hsl(33 85% 44% / 0.28)",
                      textWrap: "pretty",
                    } as React.CSSProperties}
                  >
                    {msg.text}
                  </div>
                ) : (
                  <>
                    {scanningIdx === i && <ScanningAnimation onDone={() => handleScanDone(i)} />}
                    {doneSet.has(i) && (
                      <div
                        className="px-4 py-2.5 text-[12px] leading-relaxed text-left"
                        style={{
                          background: "hsl(var(--primary))",
                          color: "white",
                          borderRadius: "4px 16px 16px 16px",
                          boxShadow: "0 3px 12px hsl(var(--primary) / 0.3)",
                          animation: reducedMotion ? undefined : "fade-up 0.38s ease-out forwards",
                          textWrap: "pretty",
                        } as React.CSSProperties}
                      >
                        {msg.text}
                      </div>
                    )}
                    {msg.assetCards && doneSet.has(i) && (
                      <div className="flex flex-col gap-2 mt-0.5">
                        {msg.assetCards.map((asset, idx) => (
                          <div
                            key={asset.id}
                            style={{
                              animation: reducedMotion ? undefined : "fade-up 0.38s ease-out forwards",
                              animationDelay: reducedMotion ? undefined : `${idx * 200}ms`,
                              opacity: reducedMotion ? 1 : 0,
                            }}
                          >
                            <QueryResultCard asset={asset} />
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {typingIdx !== null && (
            <div
              className="flex gap-2.5"
              style={{ animation: reducedMotion ? undefined : "fade-up 0.3s ease-out forwards" }}
            >
              <EdenAvatar size={26} />
              <div
                className="px-4 py-3"
                style={{
                  background: "hsl(var(--primary))",
                  borderRadius: "4px 16px 16px 16px",
                  boxShadow: "0 3px 12px hsl(var(--primary) / 0.3)",
                }}
              >
                <div className="flex gap-1.5 items-center" style={{ height: 16 }}>
                  {[0, 1, 2].map(d => (
                    <span
                      key={d}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background: "rgba(255,255,255,0.65)",
                        animation: reducedMotion ? undefined : `typing-dot 1.1s ease-in-out ${d * 0.16}s infinite`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── How It Works Steps ─────────────────────────────────────── */

const HOW_IT_WORKS: { title: React.ReactNode; body: React.ReactNode }[] = [
  {
    title: <>You tell <span className="text-primary">EDEN</span> what matters most.</>,
    body: "Your therapeutic focus, target modalities, deal stage, geography. EDEN takes this as its operating brief and calibrates everything it surfaces around your priorities.",
  },
  {
    title: <>The global tech transfer market, <span className="text-primary">under continuous watch</span>.</>,
    body: "Every major research institution worldwide, indexed as new programs emerge. Assets classified, scored 0–100, and cross-referenced against known market activity the moment they appear.",
  },
  {
    title: <>Matches reach you and <span className="text-primary">your team</span> before you go looking.</>,
    body: <>When a program fits your criteria, an alert goes out by email and in-product, in <span style={{ color: "hsl(33 85% 44%)", fontWeight: 600 }}>real time</span>, to everyone on your team. Some exclusivity windows close fast. EDEN makes sure you are never the last to know.</>,
  },
  {
    title: "From signal to term sheet.",
    body: <>Build your pipeline, pull supporting literature, and construct your business case directly in <span className="text-primary font-semibold">EdenRadar</span>. Every program arrives with competitive context, patent coverage, PI history, and a readiness score you can act on.</>,
  },
];

/* ─── Main Page ──────────────────────────────────────────────── */

export default function HowItWorks() {
  useDocumentMeta({
    title: "How It Works — EdenRadar Platform Walkthrough",
    description: "See how EDEN monitors 358 tech transfer offices, scores assets 0–100, and delivers structured intelligence to BD teams, researchers, and concept creators across four interconnected portals.",
  });
  const [, navigate] = useLocation();
  const stepsRef = useReveal();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Nav />

      <main className="flex-1">

        {/* Hero */}
        <section aria-label="Product demo" className="relative overflow-hidden" style={{ minHeight: "92vh" }}>
          <RadarBackground />

          <div
            className="relative z-10 flex flex-col items-center justify-center px-4 sm:px-6"
            style={{ minHeight: "92vh", paddingTop: "7rem", paddingBottom: "5rem" }}
          >
            <h1
              className="font-black leading-[1.06] tracking-tight mb-10 max-w-2xl text-foreground text-center"
              style={{ fontSize: "clamp(2.4rem, 5vw, 3.75rem)" }}
            >
              Most licensing deals are{" "}
              <span style={{ color: "hsl(33 85% 44%)" }}>missed</span>
              {", "}not{" "}
              <span style={{ color: "hsl(33 85% 44%)" }}>lost</span>.
            </h1>

            <div className="w-full max-w-xl">
              <EdenChatDemo messages={FULL_CONVERSATION} />
            </div>

            <p
              className="text-base sm:text-lg font-semibold tracking-tight text-center mt-7 mb-8"
              style={{ color: "hsl(var(--foreground))", letterSpacing: "-0.01em" }}
            >
              Before the patent.{" "}
              <span style={{ color: "hsl(var(--primary))" }}>Before the competition.</span>
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                onClick={() => navigate("/demo")}
                data-testid="howitworks-cta-hero"
                className="h-11 px-8 font-semibold gap-2 border-0 w-full sm:w-auto"
                style={{ background: "hsl(33 85% 44%)", color: "white" }}
              >
                Request Access
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/one-pager")}
                data-testid="howitworks-cta-onepager"
                className="h-11 px-8 font-semibold w-full sm:w-auto"
                style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
              >
                View One-Pager
              </Button>
            </div>
          </div>

          <div
            className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent, hsl(var(--background)))" }}
          />
        </section>

        {/* How it works */}
        <section
          aria-label="How it works"
          ref={stepsRef}
          className="reveal-section overflow-clip py-16 sm:py-24"
        >
          <div className="max-w-screen-xl mx-auto pl-4 sm:pl-6 flex gap-16 xl:gap-20 items-start">

            <div className="flex-1 min-w-0">
              <div style={{ borderTop: "1px solid hsl(var(--primary) / 0.22)", borderBottom: "1px solid hsl(var(--primary) / 0.22)" }}>
                {HOW_IT_WORKS.map((step, i) => (
                  <React.Fragment key={i}>
                  <div
                    className="flex gap-0 py-14 sm:py-16 items-center"
                    style={{
                      minHeight: 240,
                      borderBottom: i < HOW_IT_WORKS.length - 1 ? "1px solid hsl(var(--border) / 0.38)" : "none",
                    }}
                  >
                    <div
                      className="hidden sm:flex flex-shrink-0 justify-end"
                      style={{
                        width: 88,
                        paddingRight: 32,
                        borderRight: "1px solid hsl(var(--primary) / 0.15)",
                      }}
                    >
                      <span
                        className="font-black tabular-nums"
                        style={{
                          fontSize: "clamp(48px, 5.5vw, 68px)",
                          color: "hsl(var(--primary))",
                          opacity: 0.55,
                          lineHeight: 0.88,
                          letterSpacing: "-0.04em",
                        }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>

                    <span
                      className="block sm:hidden text-4xl font-black tabular-nums mr-5 flex-shrink-0"
                      style={{ color: "hsl(var(--primary))", opacity: 0.45 }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>

                    <div className="flex-1 min-w-0 sm:pl-10">
                      <h2 className="text-xl sm:text-2xl lg:text-[1.65rem] font-bold text-foreground mb-3 leading-snug">
                        {step.title}
                      </h2>
                      <p className="text-base sm:text-[1.0625rem] text-muted-foreground leading-relaxed">
                        {step.body}
                      </p>
                    </div>
                  </div>
                  {i === 1 && (
                    <div className="block lg:hidden overflow-hidden" style={{ borderRadius: 16, margin: "4px 0 8px" }}>
                      <img
                        src="/images/bd-conversation.jpg"
                        alt=""
                        loading="lazy"
                        className="w-full object-cover block"
                        style={{ height: 220, objectPosition: "50% 22%" }}
                      />
                    </div>
                  )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div
              className="hidden lg:block flex-shrink-0 sticky self-start"
              style={{ width: 420, top: "5.5rem" }}
            >
              <img
                src="/images/bd-conversation.jpg"
                alt=""
                className="block object-cover"
                style={{
                  width: 420,
                  height: "max(820px, 90vh)",
                  objectPosition: "50% 22%",
                  borderRadius: "20px 0 0 20px",
                  boxShadow: "-12px 0 48px rgba(0,0,0,0.10), -4px 0 16px rgba(0,0,0,0.06)",
                }}
              />
            </div>

          </div>
        </section>

        {/* CTA */}
        <section aria-label="Get started" className="max-w-screen-xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div
            className="rounded-2xl p-10 sm:p-14 text-center relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, hsl(25 80% 6%) 0%, hsl(33 75% 9%) 60%, hsl(38 70% 7%) 100%)",
              border: "1px solid hsl(33 85% 44% / 0.25)",
            }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, hsl(33 85% 44% / 0.12) 0%, transparent 60%)" }} aria-hidden />
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              Your next deal is already indexed.
            </h2>
            <p className="mb-8 max-w-md mx-auto" style={{ color: "hsl(33 40% 68%)" }}>
              Join the BD teams using EdenRadar to find, evaluate, and close licensing deals before the competition does.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                onClick={() => navigate("/demo")}
                data-testid="howitworks-cta-main"
                className="h-11 px-7 font-semibold"
                style={{ background: "hsl(38 25% 91%)", color: "hsl(25 80% 12%)", border: "none" }}
              >
                Request Access
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                size="lg"
                onClick={() => navigate("/pricing")}
                data-testid="howitworks-cta-pricing"
                className="h-11 px-7 font-semibold"
                style={{ background: "transparent", border: "1px solid hsl(33 85% 44% / 0.3)", color: "hsl(33 60% 68%)" }}
              >
                See Pricing
              </Button>
            </div>
            <p className="text-xs mt-6" style={{ color: "hsl(33 30% 48%)" }}>
              3-day free trial on EdenRadar · No card required for researcher tiers
            </p>
          </div>
        </section>

      </main>

      <footer className="relative z-10 border-t border-border py-8 px-4 sm:px-6 text-xs text-muted-foreground">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6">
          <p>© {new Date().getFullYear()} EdenRadar. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/demo" className="hover:text-foreground transition-colors" data-testid="footer-link-demo">Request Access</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors" data-testid="footer-link-pricing">Pricing</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="footer-link-privacy">Privacy Policy</Link>
            <Link href="/tos" className="hover:text-foreground transition-colors" data-testid="footer-link-tos">Terms of Service</Link>
            <EdenNXBadge />
          </div>
        </div>
      </footer>
    </div>
  );
}
