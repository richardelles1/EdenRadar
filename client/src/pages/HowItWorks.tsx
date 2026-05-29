import React, { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { Nav } from "@/components/Nav";
import { EdenNXBadge } from "@/components/EdenNXBadge";
import { EdenAvatar } from "@/components/EdenOrb";
import { Button } from "@/components/ui/button";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { RadarBackground } from "@/components/RadarBackground";
import {
  ArrowRight,
  TrendingUp,
  ShoppingBag,
  Check,
} from "lucide-react";

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

/* ─── EDEN Command Demo ──────────────────────────────────────── */

interface AssetCardData {
  id: number;
  title: string;
  institution: string;
  stage: string;
  score: number;
  modality: string;
  color: string;
}

interface ChatMessage {
  role: "eden" | "user";
  text: string;
  delay: number;
  assetCards?: AssetCardData[];
  scanning?: boolean;
  instant?: boolean;
}

interface DemoScenario {
  id: string;
  messages: ChatMessage[];
}

const BADGE_COLOR = "hsl(142 65% 48%)";

const DEMO_ASSETS_JHU: AssetCardData[] = [
  { id: 1, title: "CAR-T Cell Therapy Targeting CD19/CD22 Dual Antigen", institution: "Johns Hopkins", stage: "Preclinical", score: 91, modality: "Cell Therapy", color: BADGE_COLOR },
  { id: 2, title: "Bispecific Antibody Against PD-L1 and TIM-3 in Lymphoma", institution: "Johns Hopkins", stage: "IND-Enabling", score: 88, modality: "Antibody", color: BADGE_COLOR },
  { id: 3, title: "HDAC Inhibitor Platform for Solid Tumor Microenvironment", institution: "Johns Hopkins", stage: "Discovery", score: 85, modality: "Small Molecule", color: BADGE_COLOR },
];

const DEMO_ASSETS_CNS: AssetCardData[] = [
  { id: 4, title: "α-Synuclein Targeting Antibody for Parkinson's Disease", institution: "Mayo Clinic", stage: "Preclinical", score: 93, modality: "Antibody", color: BADGE_COLOR },
  { id: 5, title: "AAV9 Gene Therapy Targeting Motor Neurons in ALS", institution: "Columbia University", stage: "IND-Enabling", score: 89, modality: "Gene Therapy", color: BADGE_COLOR },
  { id: 6, title: "LRRK2 Kinase Inhibitor Platform for Neurodegeneration", institution: "Stanford University", stage: "Discovery", score: 87, modality: "Small Molecule", color: BADGE_COLOR },
];

const DEMO_ASSETS_ADC: AssetCardData[] = [
  { id: 7, title: "HER2-Targeted ADC with Novel Cleavable Linker Chemistry", institution: "MIT Koch Institute", stage: "IND-Enabling", score: 92, modality: "ADC", color: BADGE_COLOR },
  { id: 8, title: "TROP2-Directed ADC for Triple-Negative Breast Cancer", institution: "Mem. Sloan Kettering", stage: "Preclinical", score: 86, modality: "ADC", color: BADGE_COLOR },
  { id: 9, title: "CD33 ADC with Disulfide Linker for AML", institution: "Univ. of Washington", stage: "Discovery", score: 84, modality: "ADC", color: BADGE_COLOR },
];

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "institution",
    messages: [
      { role: "eden", text: "14 new programs indexed at Hopkins since Monday. Anything specific on your radar?", delay: 300, instant: true },
      { role: "user", text: "We're expanding our oncology pipeline. What's worth a look at Hopkins right now?", delay: 900 },
      { role: "eden", text: "14 JHU oncology programs indexed. Worth flagging before you dig in: the HDAC inhibitor's target space overlaps with Pfizer's recent Seagen integration territory, so that one's likely a dead end for most buyers. The CAR-T is different. PI has two prior licensings at this exact stage, both to top-10 pharma. I'd start there.", delay: 2600, scanning: true, assetCards: DEMO_ASSETS_JHU },
    ],
  },
  {
    id: "cross-tto",
    messages: [
      { role: "eden", text: "Good morning. I'm watching 22 active preclinical CNS programs this week, three with exclusivity windows under 90 days.", delay: 300, instant: true },
      { role: "user", text: "CNS startup, just closed our Series A. What preclinical assets are looking strong right now?", delay: 900 },
      { role: "eden", text: "Strong cluster at Mayo, Stanford, and Columbia. Mayo's alpha-synuclein program leads at 93. The PI has closed two prior licensings at preclinical stage, both above $40M upfront. Separate note: Columbia's ALS program has an exclusivity window closing in 60 days with no recorded LOIs on file. That one may be worth a call this week.", delay: 2600, scanning: true, assetCards: DEMO_ASSETS_CNS },
    ],
  },
  {
    id: "modality",
    messages: [
      { role: "eden", text: "Three new ADC programs cleared IND-enabling stage this month. Two are still open for exclusive licensing.", delay: 300, instant: true },
      { role: "user", text: "We need ADC platforms we can take exclusive. IND-enabling stage, ideally.", delay: 900 },
      { role: "eden", text: "Fourteen ADCs match. MIT HER2 leads at 92. One thing to know: the linker chemistry is covered by a separate patent, but both assets fall under a single exclusive license term sheet, so you're acquiring the full stack. I've already removed the three programs that only offered non-exclusive terms.", delay: 2600, scanning: true, assetCards: DEMO_ASSETS_ADC },
    ],
  },
];

/* ─── EDEN Intro ─────────────────────────────────────────────── */

function EdenIntro({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="absolute inset-0 z-20 rounded-2xl flex flex-col items-center justify-center gap-5"
      style={{
        background: "white",
        animation: "eden-intro-exit 0.45s cubic-bezier(0.4,0,0.2,1) 1.85s forwards",
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
          to   { opacity: 0; transform: translateY(-14px); pointer-events: none; }
        }
        @keyframes eden-ring {
          0%   { opacity: 0.55; transform: translate(-50%,-50%) scale(1); }
          100% { opacity: 0;    transform: translate(-50%,-50%) scale(2.4); }
        }
        @keyframes eden-pulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
        @keyframes fade-up { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes scan-slide { from { opacity:0; transform:translateX(-5px); } to { opacity:1; transform:translateX(0); } }
      `}</style>

      <div className="relative" style={{ width: 52, height: 52 }}>
        {[0, 0.35, 0.7].map((d, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              top: "50%", left: "50%", width: 52, height: 52,
              border: "1.5px solid hsl(142 52% 36% / 0.45)",
              animation: `eden-ring 1.8s ease-out ${d}s infinite`,
            }}
          />
        ))}
        <EdenAvatar size={52} />
      </div>

      <div className="flex items-end gap-2.5">
        {["E", "D", "E", "N"].map((letter, i) => (
          <span
            key={i}
            className="text-5xl font-black"
            style={{
              color: "hsl(222 20% 10%)",
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
          color: "hsl(142 52% 36%)",
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

/* ─── Streaming Text ─────────────────────────────────────────── */

function StreamingText({ text, speed = 55, onDone, cursorColor = "hsl(142 52% 36%)" }: { text: string; speed?: number; onDone?: () => void; cursorColor?: string }) {
  const [count, setCount] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    setCount(0);
    if (!text) return;
    let i = 0;
    const ms = Math.round(1000 / speed);
    const iv = setInterval(() => {
      i++;
      setCount(i);
      if (i >= text.length) { clearInterval(iv); onDoneRef.current?.(); }
    }, ms);
    return () => clearInterval(iv);
  }, [text, speed]);

  return (
    <>
      {text.slice(0, count)}
      {count < text.length && (
        <span
          className="inline-block ml-px align-middle"
          style={{ width: 2, height: "0.85em", background: cursorColor, animation: "eden-pulse 0.7s ease-in-out infinite" }}
        />
      )}
    </>
  );
}

/* ─── Scanning Animation + Result Card ──────────────────────── */

const SCAN_NAMES = ["MIT TTO", "Stanford OTL", "Johns Hopkins", "Mayo Clinic", "Max Planck", "Columbia", "UCSF", "Harvard OTD", "Yale TTO", "NIH", "Oxford TT", "Wellcome Trust"];

function ScanningAnimation({ onDone }: { onDone: () => void }) {
  const [nameIdx, setNameIdx] = useState(0);
  const [dots, setDots] = useState(1);

  useEffect(() => {
    let step = 0;
    const iv = setInterval(() => {
      step++;
      setNameIdx((p) => (p + 1) % SCAN_NAMES.length);
      setDots((p) => (p % 3) + 1);
      if (step >= 11) { clearInterval(iv); setTimeout(onDone, 120); }
    }, 130);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="flex items-center gap-2.5 py-1">
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: "hsl(142 52% 36%)", animation: "eden-pulse 0.6s ease-in-out infinite" }}
      />
      <span className="text-[11px] font-mono" style={{ color: "hsl(142 40% 40%)" }}>
        Scanning 358 institutions{".".repeat(dots)}{" "}
        <span key={nameIdx} style={{ animation: "scan-slide 0.12s ease-out forwards" }}>{SCAN_NAMES[nameIdx]}</span>
      </span>
    </div>
  );
}

function QueryResultCard({ asset }: { asset: AssetCardData }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4"
      style={{
        height: 58,
        background: "white",
        border: "1px solid hsl(220 13% 91%)",
        boxShadow: "0 3px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-lg font-bold tabular-nums"
        style={{
          width: 38,
          height: 38,
          background: asset.color.replace(")", " / 0.12)"),
          color: asset.color,
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

function EdenChatDemo({ messages, onComplete }: { messages: ChatMessage[]; onComplete?: () => void }) {
  const [phase, setPhase] = useState<"intro" | "chat">("intro");
  const [visibleCount, setVisibleCount] = useState(0);
  const [scanningIdx, setScanningIdx] = useState<number | null>(null);
  const [streamingIdx, setStreamingIdx] = useState<number | null>(null);
  const [doneSet, setDoneSet] = useState<Set<number>>(new Set());
  const chatRef = useRef<HTMLDivElement>(null);
  const tids = useRef<ReturnType<typeof setTimeout>[]>([]);

  const scrollBottom = () =>
    requestAnimationFrame(() => requestAnimationFrame(() => {
      chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
    }));

  useEffect(() => {
    tids.current.forEach(clearTimeout);
    tids.current = [];
    setVisibleCount(0);
    setScanningIdx(null);
    setStreamingIdx(null);
    setDoneSet(new Set());
  }, [messages]);

  useEffect(() => {
    if (phase !== "chat") return;
    tids.current.forEach(clearTimeout);
    tids.current = [];
    messages.forEach((msg, i) => {
      const t = setTimeout(() => {
        setVisibleCount(i + 1);
        scrollBottom();
        if (msg.role === "eden") {
          if (msg.instant) {
            setDoneSet((prev) => new Set(prev).add(i));
          } else if (msg.scanning) {
            setScanningIdx(i);
          } else {
            setStreamingIdx(i);
          }
        }
      }, msg.delay);
      tids.current.push(t);
    });
    return () => tids.current.forEach(clearTimeout);
  }, [phase, messages]);

  function handleScanDone(idx: number) {
    setScanningIdx(null);
    setStreamingIdx(idx);
    scrollBottom();
  }

  function handleStreamDone(idx: number) {
    setStreamingIdx(null);
    setDoneSet((prev) => new Set(prev).add(idx));
    scrollBottom();
    if (idx === messages.length - 1) {
      const t = setTimeout(() => onComplete?.(), 3500);
      tids.current.push(t);
    }
  }

  return (
    <div
      className="relative flex flex-col rounded-2xl overflow-hidden"
      style={{
        height: 460,
        background: "white",
        boxShadow: "0 32px 72px rgba(0,0,0,0.13), 0 8px 24px rgba(0,0,0,0.07), 0 2px 6px rgba(0,0,0,0.04)",
      }}
    >
      {phase === "intro" && <EdenIntro onDone={() => setPhase("chat")} />}

      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-3 border-b flex-shrink-0"
        style={{ background: "hsl(0 0% 99%)", borderColor: "hsl(220 13% 91%)" }}
      >
        <img src="/images/eden-nx-mark.png" alt="EDEN" className="w-7 h-7 object-contain flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight text-foreground">EDEN</p>
          <p className="text-[10px] text-primary">Research Intelligence</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" style={{ animation: "eden-pulse 2s ease-in-out infinite" }} />
          <span className="text-[10px] font-semibold text-primary">Live · 358 TTOs</span>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={chatRef}
        className="flex-1 overflow-y-auto px-4 py-5 space-y-4 min-h-0"
        style={{ background: "hsl(220 20% 98%)" }}
      >
        {messages.slice(0, visibleCount).map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            style={{ animation: "fade-up 0.28s ease-out forwards" }}
          >
            {msg.role === "eden" && <EdenAvatar size={26} />}
            <div className="flex flex-col gap-2 min-w-0" style={{ maxWidth: "88%" }}>
              {msg.role === "user" ? (
                <div
                  className="px-4 py-2.5 text-[12px] leading-relaxed font-medium"
                  style={{
                    background: "hsl(33 85% 44%)",
                    color: "white",
                    borderRadius: "16px 16px 4px 16px",
                    boxShadow: "0 3px 12px hsl(33 85% 44% / 0.28)",
                  }}
                >
                  {msg.text}
                </div>
              ) : (
                <>
                  {scanningIdx === i && <ScanningAnimation onDone={() => handleScanDone(i)} />}
                  {(streamingIdx === i || doneSet.has(i)) && (
                    <div
                      className="px-4 py-2.5 text-[12px] leading-relaxed"
                      style={{
                        background: "hsl(142 52% 36%)",
                        color: "white",
                        borderRadius: "4px 16px 16px 16px",
                        boxShadow: "0 3px 12px hsl(142 52% 36% / 0.3)",
                      }}
                    >
                      {doneSet.has(i) ? msg.text : (
                        <StreamingText text={msg.text} onDone={() => handleStreamDone(i)} cursorColor="rgba(255,255,255,0.7)" />
                      )}
                    </div>
                  )}
                  {msg.assetCards && doneSet.has(i) && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      {msg.assetCards.map((asset, idx) => (
                        <div key={asset.id} style={{ animation: "fade-up 0.32s ease-out forwards", animationDelay: `${idx * 110}ms`, opacity: 0 }}>
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
      </div>
    </div>
  );
}

/* ─── Portal Feature Lists ───────────────────────────────────── */

const SCOUT_FEATURES = [
  "Natural language queries across 358 TTOs",
  "EDEN-scored dossiers + competitive cross-reference",
  "Real-time alerts by email and in-product",
  "Pipeline tracking, CSV export, team sharing",
  "API access — integrate EDEN into your workflow",
  "MCP server — query EDEN from any AI assistant",
];

const MARKET_FEATURES = [
  "Anonymous listings (identity NDA-gated)",
  "Secure deal rooms with audit trail",
  "Success-fee aligned: free to list",
];

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
    title: "From match to deal-ready.",
    body: <>Build your pipeline, pull supporting literature, and construct your business case directly in <span className="text-primary font-semibold">EdenScout</span>. Every program arrives with competitive context, patent coverage, PI history, and a readiness score you can act on.</>,
  },
];

/* ─── Main Page ──────────────────────────────────────────────── */

export default function HowItWorks() {
  useDocumentMeta({
    title: "How It Works — EdenRadar Platform Walkthrough",
    description: "See how EDEN monitors 358 tech transfer offices, scores assets 0–100, and delivers structured intelligence to BD teams, researchers, and concept creators across four interconnected portals.",
  });
  const [, navigate] = useLocation();
  const [activeScenario, setActiveScenario] = useState(0);
  const stepsRef = useReveal();
  const tiersRef = useReveal();

  function handleScenarioComplete() {
    setActiveScenario((prev) => (prev + 1) % DEMO_SCENARIOS.length);
  }

  const scenario = DEMO_SCENARIOS[activeScenario];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Nav />

      <main className="flex-1">

        {/* Hero — light centered with radar + amber headline accents */}
        <section className="relative overflow-hidden" style={{ minHeight: "92vh" }}>
          <RadarBackground />

          <div
            className="relative z-10 flex flex-col items-center justify-center text-center px-4 sm:px-6"
            style={{ minHeight: "92vh", paddingTop: "7rem", paddingBottom: "5rem" }}
          >
            <h1
              className="font-black leading-[1.06] tracking-tight mb-5 max-w-2xl text-foreground"
              style={{ fontSize: "clamp(2.4rem, 5vw, 3.75rem)" }}
            >
              Most licensing deals are{" "}
              <span style={{ color: "hsl(33 85% 44%)" }}>missed</span>
              {", "}not{" "}
              <span style={{ color: "hsl(33 85% 44%)" }}>lost</span>.
            </h1>

            <div className="mb-10 space-y-1.5 max-w-md">
              <p className="text-base sm:text-lg leading-relaxed text-muted-foreground">
                The asset was indexed. The window was open. The team that closed the deal searched smarter.
              </p>
              <p className="text-base sm:text-lg font-semibold text-primary">
                EDEN makes sure that's you.
              </p>
            </div>

            {/* Chat demo — center stage */}
            <div className="w-full max-w-xl mb-10">
              <EdenChatDemo key={scenario.id} messages={scenario.messages} onComplete={handleScenarioComplete} />
            </div>

            <Button
              size="lg"
              onClick={() => navigate("/login")}
              data-testid="howitworks-cta-hero"
              className="h-11 px-8 font-semibold gap-2 border-0"
              style={{ background: "hsl(33 85% 44%)", color: "white" }}
            >
              Try EdenScout
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div
            className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent, hsl(var(--background)))" }}
          />
        </section>

        {/* How it works — sticky photo right bleeds to viewport edge */}
        <section
          ref={stepsRef}
          className="reveal-section overflow-clip py-16 sm:py-24"
        >
          <div className="max-w-screen-xl mx-auto pl-4 sm:pl-6 flex gap-16 xl:gap-20 items-start">

            {/* Left: four steps */}
            <div className="flex-1 min-w-0">
              <div style={{ borderTop: "1px solid hsl(var(--primary) / 0.22)", borderBottom: "1px solid hsl(var(--primary) / 0.22)" }}>
                {HOW_IT_WORKS.map((step, i) => (
                  <div
                    key={i}
                    className="flex gap-0 py-14 sm:py-16 items-center"
                    style={{
                      minHeight: 240,
                      borderBottom: i < HOW_IT_WORKS.length - 1 ? "1px solid hsl(var(--border) / 0.38)" : "none",
                    }}
                  >
                    {/* Number column */}
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

                    {/* Mobile number */}
                    <span
                      className="block sm:hidden text-4xl font-black tabular-nums mr-5 flex-shrink-0"
                      style={{ color: "hsl(var(--primary))", opacity: 0.45 }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0 sm:pl-10">
                      <h3 className="text-xl sm:text-2xl lg:text-[1.65rem] font-bold text-foreground mb-3 leading-snug">
                        {step.title}
                      </h3>
                      <p className="text-base sm:text-[1.0625rem] text-muted-foreground leading-relaxed">
                        {step.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: sticky photo — spills to right viewport edge */}
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

        {/* Portal section — Scout first */}
        <section
          ref={tiersRef}
          className="reveal-section max-w-screen-xl mx-auto px-4 sm:px-6 py-16 sm:py-20"
        >
          <div className="mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
              Built for deals.{" "}
              <span className="text-primary">Not just discovery.</span>
            </h2>
            <p className="text-muted-foreground max-w-xl">
              EdenScout is the full intelligence stack for BD teams. EdenMarket closes the deal.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 mb-6">

            {/* Scout — featured */}
            <div
              className="p-8 rounded-2xl"
              style={{
                background: "hsl(152 35% 7%)",
                border: "1px solid hsl(142 52% 36% / 0.28)",
              }}
            >
              <div className="flex items-center gap-3 mb-7">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "hsl(142 52% 36% / 0.15)" }}
                >
                  <TrendingUp className="w-5 h-5" style={{ color: "hsl(142 65% 55%)" }} />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-bold text-white text-lg leading-none">EdenScout</h3>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                      style={{ background: "hsl(142 52% 36% / 0.2)", color: "hsl(142 65% 58%)" }}
                    >
                      Subscription
                    </span>
                  </div>
                  <p className="text-sm mt-0.5" style={{ color: "hsl(142 15% 60%)" }}>
                    Intelligence platform for BD teams
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                {SCOUT_FEATURES.map((f) => (
                  <div key={f} className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "hsl(142 65% 55%)" }} />
                    <span className="text-sm" style={{ color: "hsl(0 0% 83%)" }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Market — secondary */}
            <div
              className="p-6 rounded-2xl bg-card"
              style={{ border: "1px solid hsl(var(--portal-market) / 0.22)" }}
            >
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "hsl(var(--portal-market) / 0.08)" }}
                >
                  <ShoppingBag className="w-4 h-4" style={{ color: "hsl(var(--portal-market))" }} />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm leading-none">EdenMarket</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Blind marketplace for licensable assets</p>
                </div>
              </div>
              <div className="space-y-2.5">
                {MARKET_FEATURES.map((f) => (
                  <div key={f} className="flex items-start gap-1.5">
                    <Check className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "hsl(var(--portal-market))" }} />
                    <span className="text-[12px] text-foreground">{f}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <p className="text-[12px] text-muted-foreground">
              Also free:{" "}
              <strong className="text-foreground font-semibold">EdenDiscovery</strong> for concept timestamping and{" "}
              <strong className="text-foreground font-semibold">EdenLab</strong> for researcher workspaces.
            </p>
            <Link href="/pricing">
              <button
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex-shrink-0"
                data-testid="howitworks-link-full-pricing"
              >
                See full pricing
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </Link>
          </div>
        </section>

        {/* Final CTA */}
        <section className="max-w-screen-xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
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
                onClick={() => navigate("/login")}
                data-testid="howitworks-cta-main"
                className="h-11 px-7 font-semibold"
                style={{ background: "hsl(38 25% 91%)", color: "hsl(25 80% 12%)", border: "none" }}
              >
                Get Started
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
              3-day free trial on EdenScout · No card required for researcher tiers
            </p>
          </div>
        </section>

      </main>

      <footer className="relative z-10 border-t border-border py-8 px-4 sm:px-6 text-xs text-muted-foreground">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6">
          <p>© {new Date().getFullYear()} EdenRadar. All rights reserved.</p>
          <div className="flex items-center gap-4">
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
