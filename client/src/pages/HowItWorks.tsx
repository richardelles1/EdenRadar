import { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { Nav } from "@/components/Nav";
import { EdenNXBadge } from "@/components/EdenNXBadge";
import { EdenAvatar } from "@/components/EdenOrb";
import { Button } from "@/components/ui/button";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { RadarBackground } from "@/components/RadarBackground";
import {
  ArrowRight,
  Lightbulb,
  FlaskConical,
  TrendingUp,
  ShoppingBag,
  Check,
  Search,
  Sparkles,
  Bell,
  BarChart3,
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
}

interface DemoScenario {
  id: string;
  messages: ChatMessage[];
}

const DEMO_ASSETS_JHU: AssetCardData[] = [
  { id: 1, title: "CAR-T Cell Therapy Targeting CD19/CD22 Dual Antigen", institution: "Johns Hopkins", stage: "Preclinical", score: 91, modality: "Cell Therapy", color: "hsl(142 65% 48%)" },
  { id: 2, title: "HDAC Inhibitor Platform for Solid Tumor Microenvironment", institution: "Johns Hopkins", stage: "Discovery", score: 85, modality: "Small Molecule", color: "hsl(265 60% 60%)" },
  { id: 3, title: "Bispecific Antibody Against PD-L1 and TIM-3 in Lymphoma", institution: "Johns Hopkins", stage: "IND-Enabling", score: 88, modality: "Antibody", color: "hsl(38 92% 50%)" },
];

const DEMO_ASSETS_CNS: AssetCardData[] = [
  { id: 4, title: "α-Synuclein Targeting Antibody for Parkinson's Disease", institution: "Mayo Clinic", stage: "Preclinical", score: 93, modality: "Antibody", color: "hsl(142 65% 48%)" },
  { id: 5, title: "LRRK2 Kinase Inhibitor Platform for Neurodegeneration", institution: "Stanford University", stage: "Discovery", score: 87, modality: "Small Molecule", color: "hsl(265 60% 60%)" },
  { id: 6, title: "AAV9 Gene Therapy Targeting Motor Neurons in ALS", institution: "Columbia University", stage: "IND-Enabling", score: 89, modality: "Gene Therapy", color: "hsl(38 92% 50%)" },
];

const DEMO_ASSETS_ADC: AssetCardData[] = [
  { id: 7, title: "HER2-Targeted ADC with Novel Cleavable Linker Chemistry", institution: "MIT Koch Institute", stage: "IND-Enabling", score: 92, modality: "ADC", color: "hsl(142 65% 48%)" },
  { id: 8, title: "TROP2-Directed ADC for Triple-Negative Breast Cancer", institution: "Mem. Sloan Kettering", stage: "Preclinical", score: 86, modality: "ADC", color: "hsl(265 60% 60%)" },
  { id: 9, title: "CD33 ADC with Disulfide Linker for AML", institution: "Univ. of Washington", stage: "Discovery", score: 84, modality: "ADC", color: "hsl(38 92% 50%)" },
];

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "institution",
    messages: [
      { role: "user", text: "Show me top oncology assets from Johns Hopkins.", delay: 400 },
      { role: "eden", text: "14 JHU oncology programs indexed. Worth flagging before you dig in: the HDAC inhibitor's target space overlaps with Pfizer's recent Seagen integration territory, so that one's likely a dead end for most buyers. The CAR-T is different. PI has two prior licensings at this exact stage, both to top-10 pharma. I'd start there.", delay: 1600, scanning: true, assetCards: DEMO_ASSETS_JHU },
    ],
  },
  {
    id: "cross-tto",
    messages: [
      { role: "user", text: "Preclinical CNS assets scoring above 85, any institution.", delay: 400 },
      { role: "eden", text: "Strong cluster at Mayo, Stanford, and Columbia. Mayo's alpha-synuclein program leads at 93. The PI has closed two prior licensings at preclinical stage, both above $40M upfront. Separate note: Columbia's ALS program has an exclusivity window closing in 60 days with no recorded LOIs on file. That one may be worth a call this week.", delay: 1600, scanning: true, assetCards: DEMO_ASSETS_CNS },
    ],
  },
  {
    id: "modality",
    messages: [
      { role: "user", text: "ADC platforms available for exclusive license at IND-enabling stage.", delay: 400 },
      { role: "eden", text: "Fourteen ADCs match. MIT HER2 leads at 92. One thing to know: the linker chemistry is covered by a separate patent, but both assets fall under a single exclusive license term sheet, so you're acquiring the full stack. I've already removed the three programs that only offered non-exclusive terms.", delay: 1600, scanning: true, assetCards: DEMO_ASSETS_ADC },
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

function StreamingText({ text, speed = 55, onDone }: { text: string; speed?: number; onDone?: () => void }) {
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
          style={{ width: 2, height: "0.85em", background: "hsl(142 52% 36%)", animation: "eden-pulse 0.7s ease-in-out infinite" }}
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
        Scanning 350+ institutions{".".repeat(dots)}{" "}
        <span key={nameIdx} style={{ animation: "scan-slide 0.12s ease-out forwards" }}>{SCAN_NAMES[nameIdx]}</span>
      </span>
    </div>
  );
}

function QueryResultCard({ asset, delay }: { asset: AssetCardData; delay: number }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4"
      style={{
        height: 58,
        background: "white",
        border: "1px solid hsl(220 13% 91%)",
        boxShadow: "0 3px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)",
        animation: "fade-up 0.32s ease-out forwards",
        animationDelay: `${delay}ms`,
        opacity: 0,
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
          if (msg.scanning) setScanningIdx(i);
          else setStreamingIdx(i);
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
        <EdenAvatar size={26} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight text-foreground">EDEN</p>
          <p className="text-[10px] text-primary">Research Intelligence</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" style={{ animation: "eden-pulse 2s ease-in-out infinite" }} />
          <span className="text-[10px] font-semibold text-primary">Live · 350+ TTOs</span>
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
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "hsl(142 52% 36%)", letterSpacing: "0.18em" }}>EDEN</span>
                      <p className="text-[12px] leading-relaxed" style={{ color: "hsl(222 15% 22%)" }}>
                        {doneSet.has(i) ? msg.text : (
                          <StreamingText text={msg.text} onDone={() => handleStreamDone(i)} />
                        )}
                      </p>
                    </div>
                  )}
                  {msg.assetCards && doneSet.has(i) && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      {msg.assetCards.map((asset, idx) => (
                        <div key={asset.id} style={{ animation: "fade-up 0.32s ease-out forwards", animationDelay: `${idx * 110}ms`, opacity: 0 }}>
                          <QueryResultCard asset={asset} delay={0} />
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

/* ─── Portal Tier Overview ───────────────────────────────────── */

const TIER_OVERVIEW = [
  {
    icon: Lightbulb,
    name: "EdenDiscovery",
    tagline: "Concept registry for early-stage innovators",
    price: "Free",
    color: "hsl(var(--portal-discovery))",
    colorDim: "hsl(var(--portal-discovery) / 0.08)",
    borderColor: "hsl(var(--portal-discovery) / 0.3)",
    features: ["Submit and timestamp early-stage concepts", "EDEN credibility scoring (0–100)", "Surface to industry scouts"],
  },
  {
    icon: FlaskConical,
    name: "EdenLab",
    tagline: "Project workspace for academic researchers",
    price: "Free",
    color: "hsl(var(--portal-lab))",
    colorDim: "hsl(var(--portal-lab) / 0.08)",
    borderColor: "hsl(var(--portal-lab) / 0.3)",
    features: ["11-section structured research canvas", "Literature synthesis across 40+ sources", "Grants discovery matched to your profile"],
  },
  {
    icon: TrendingUp,
    name: "EdenScout",
    tagline: "Intelligence platform for BD teams",
    price: "Paid",
    color: "hsl(var(--portal-scout))",
    colorDim: "hsl(var(--portal-scout) / 0.08)",
    borderColor: "hsl(var(--portal-scout) / 0.3)",
    features: ["EDEN queries across 350+ TTOs", "EDEN-scored dossiers + competitive cross-reference", "Alerts, CSV export, pipeline tracking"],
  },
  {
    icon: ShoppingBag,
    name: "EdenMarket",
    tagline: "Blind marketplace for licensable assets",
    price: "Paid",
    color: "hsl(var(--portal-market))",
    colorDim: "hsl(var(--portal-market) / 0.08)",
    borderColor: "hsl(var(--portal-market) / 0.3)",
    features: ["Anonymous listings (identity NDA-gated)", "Secure deal rooms with audit trail", "Success-fee aligned: free to list"],
  },
];

/* ─── Intelligence Channels ──────────────────────────────────── */

const INTEL_CHANNELS = [
  {
    icon: Search,
    tag: "Active",
    title: "Natural language search",
    desc: "Ask in plain English across all 350+ indexed institutions simultaneously. Filter by modality, stage, therapeutic area, or geography — EDEN returns ranked, enriched results in seconds.",
  },
  {
    icon: Sparkles,
    tag: "Conversational",
    title: "EDEN intelligence engine",
    desc: "Go deeper with EDEN. Ask follow-up questions, request a full patent landscape, compare competing programs, or synthesize literature across 40+ live sources — all cited, all in plain English.",
  },
  {
    icon: Bell,
    tag: "Automated",
    title: "Standing alerts",
    desc: "Set your criteria once. The moment a new matching asset appears from any of the 350+ monitored institutions, your team is notified before it surfaces publicly. No manual scanning, no missed deals.",
  },
  {
    icon: BarChart3,
    tag: "Structured",
    title: "Landscape intelligence",
    desc: "Every asset arrives with an EDEN-compiled context layer: patent coverage, clinical trial cross-reference, competitive program mapping, inventor history, and a deal readiness score 0–100.",
  },
];

/* ─── Stats ──────────────────────────────────────────────────── */

const STATS = [
  { value: "0–100", label: "EDEN readiness score" },
  { value: "Daily", label: "Monitoring cadence" },
  { value: "4",     label: "Portals in ecosystem" },
];

/* ─── Main Page ──────────────────────────────────────────────── */

export default function HowItWorks() {
  useDocumentMeta({
    title: "How It Works — EdenRadar Platform Walkthrough",
    description: "See how EDEN monitors 350+ tech transfer offices, scores assets 0–100, and delivers structured intelligence to BD teams, researchers, and concept creators across four interconnected portals.",
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

            {/* Stats */}
            <div className="flex gap-10 sm:gap-14 mb-10">
              {STATS.map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-2xl font-bold mb-0.5 text-primary">{s.value}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-foreground/45">{s.label}</div>
                </div>
              ))}
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

        {/* Intelligence delivery channels */}
        <section
          ref={stepsRef}
          className="reveal-section max-w-screen-xl mx-auto px-4 sm:px-6 py-16 sm:py-20"
        >
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Intelligence Delivery</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
              How intelligence reaches your team
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Four distinct channels — each designed so the right asset finds you, whether you're actively searching or not.
            </p>
          </div>
          <div className="space-y-3">
            {INTEL_CHANNELS.map((ch, i) => (
              <div
                key={i}
                className="stagger-item grid grid-cols-[4.5rem_1fr] sm:grid-cols-[7rem_1fr] gap-6 sm:gap-8 p-6 rounded-2xl transition-shadow duration-200 hover:shadow-md"
                style={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                  animationDelay: `${i * 80}ms`,
                }}
              >
                <div className="flex flex-col items-start gap-3 pt-0.5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background: "hsl(var(--primary) / 0.10)",
                      boxShadow: "0 2px 8px hsl(var(--primary) / 0.12)",
                    }}
                  >
                    <ch.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-primary/50 leading-tight">
                    {ch.tag}
                  </span>
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-foreground mb-2 leading-snug">{ch.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{ch.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Portal tier overview */}
        <section
          ref={tiersRef}
          className="reveal-section max-w-screen-xl mx-auto px-4 sm:px-6 py-16 sm:py-20"
        >
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Choose Your Entry Point</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Four portals. One ecosystem.
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Every tier is purpose-built for a different side of the biotech deal. Start free, upgrade when your workflow demands it.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Free forever</p>
              {TIER_OVERVIEW.filter((t) => t.price === "Free").map((tier, i) => (
                <div
                  key={tier.name}
                  className="flex gap-4 p-4 rounded-xl bg-card stagger-item transition-shadow duration-200 hover:shadow-md"
                  style={{ border: `1px solid ${tier.borderColor}`, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", animationDelay: `${i * 80}ms` }}
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: tier.colorDim }}>
                    <tier.icon className="w-4 h-4" style={{ color: tier.color }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <h3 className="font-bold text-foreground text-sm">{tier.name}</h3>
                      <span className="text-xs font-bold" style={{ color: tier.color }}>{tier.price}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug mb-2">{tier.tagline}</p>
                    <div className="space-y-1">
                      {tier.features.map((f) => (
                        <div key={f} className="flex items-center gap-1.5">
                          <Check className="w-3 h-3 flex-shrink-0" style={{ color: tier.color }} />
                          <span className="text-[11px] text-foreground">{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Subscription</p>
              {TIER_OVERVIEW.filter((t) => t.price === "Paid").map((tier, i) => (
                <div
                  key={tier.name}
                  className="flex gap-4 p-4 rounded-xl bg-card stagger-item transition-shadow duration-200 hover:shadow-md"
                  style={{ border: `1px solid ${tier.borderColor}`, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", animationDelay: `${(i + 2) * 80}ms` }}
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: tier.colorDim }}>
                    <tier.icon className="w-4 h-4" style={{ color: tier.color }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <h3 className="font-bold text-foreground text-sm">{tier.name}</h3>
                      <span className="text-xs font-semibold" style={{ color: tier.color }}>{tier.price}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug mb-2">{tier.tagline}</p>
                    <div className="space-y-1">
                      {tier.features.map((f) => (
                        <div key={f} className="flex items-center gap-1.5">
                          <Check className="w-3 h-3 flex-shrink-0" style={{ color: tier.color }} />
                          <span className="text-[11px] text-foreground">{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center">
            <Link href="/pricing">
              <button
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                data-testid="howitworks-link-full-pricing"
              >
                See full pricing and plan details
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
