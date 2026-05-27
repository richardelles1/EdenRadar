import { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { Nav } from "@/components/Nav";
import { EdenNXBadge } from "@/components/EdenNXBadge";
import { EdenOrb, EdenAvatar } from "@/components/EdenOrb";
import { Button } from "@/components/ui/button";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { NumberTicker } from "@/components/ui/number-ticker";
import { WordRotate } from "@/components/ui/word-rotate";
import { AnimatedTabs } from "@/components/ui/animated-tabs";
import {
  ArrowRight,
  Lightbulb,
  FlaskConical,
  TrendingUp,
  ShoppingBag,
  Dna,
  Shield,
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

function PageBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: "min(80vw, 800px)",
          height: "min(80vw, 800px)",
          animation: "radar-bg-slow 28s linear infinite",
          transformOrigin: "center center",
          background: "conic-gradient(from 0deg, transparent 260deg, hsl(142 65% 48% / 0.03) 310deg, hsl(142 65% 48% / 0.08) 360deg)",
          borderRadius: "50%",
        }}
      />
      {[300, 450, 600].map((r, i) => (
        <div
          key={r}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{ width: r, height: r, borderColor: `hsl(142 55% 45% / ${0.04 - i * 0.006})` }}
        />
      ))}
    </div>
  );
}

/* ─── EDEN Chat Demo ─────────────────────────────────────────── */

interface AssetCardData {
  id: number;
  title: string;
  institution: string;
  area: string;
  stage: string;
  score: number;
  modality: string;
  color: string;
  icon: typeof Dna;
}

interface ChatMessage {
  role: "eden" | "user";
  text: string;
  delay: number;
  assetCards?: AssetCardData[];
}

interface DemoScenario {
  id: string;
  label: string;
  messages: ChatMessage[];
}

const DEMO_ASSETS_JHU: AssetCardData[] = [
  { id: 1, title: "CAR-T Cell Therapy Targeting CD19/CD22 Dual Antigen", institution: "Johns Hopkins", area: "Oncology", stage: "Preclinical", score: 91, modality: "Cell Therapy", color: "hsl(142 65% 48%)", icon: Dna },
  { id: 2, title: "HDAC Inhibitor Platform for Solid Tumor Microenvironment", institution: "Johns Hopkins", area: "Oncology", stage: "Discovery", score: 85, modality: "Small Molecule", color: "hsl(265 60% 60%)", icon: Shield },
  { id: 3, title: "Bispecific Antibody Against PD-L1 and TIM-3 in Lymphoma", institution: "Johns Hopkins", area: "Oncology", stage: "IND-Enabling", score: 88, modality: "Antibody", color: "hsl(38 92% 50%)", icon: TrendingUp },
];

const DEMO_ASSETS_CNS: AssetCardData[] = [
  { id: 4, title: "α-Synuclein Targeting Antibody for Parkinson's Disease", institution: "Mayo Clinic", area: "Neurology", stage: "Preclinical", score: 93, modality: "Antibody", color: "hsl(142 65% 48%)", icon: Dna },
  { id: 5, title: "LRRK2 Kinase Inhibitor Platform for Neurodegeneration", institution: "Stanford University", area: "Neurology", stage: "Discovery", score: 87, modality: "Small Molecule", color: "hsl(265 60% 60%)", icon: Shield },
  { id: 6, title: "AAV9 Gene Therapy Targeting Motor Neurons in ALS", institution: "Columbia University", area: "Neurology", stage: "IND-Enabling", score: 89, modality: "Gene Therapy", color: "hsl(38 92% 50%)", icon: TrendingUp },
];

const DEMO_ASSETS_ADC: AssetCardData[] = [
  { id: 7, title: "HER2-Targeted ADC with Novel Cleavable Linker Chemistry", institution: "MIT Koch Institute", area: "Oncology", stage: "IND-Enabling", score: 92, modality: "ADC", color: "hsl(142 65% 48%)", icon: Dna },
  { id: 8, title: "TROP2-Directed ADC for Triple-Negative Breast Cancer", institution: "Mem. Sloan Kettering", area: "Oncology", stage: "Preclinical", score: 86, modality: "ADC", color: "hsl(265 60% 60%)", icon: Shield },
  { id: 9, title: "CD33 ADC with Disulfide Linker for AML", institution: "Univ. of Washington", area: "Oncology", stage: "Discovery", score: 84, modality: "ADC", color: "hsl(38 92% 50%)", icon: TrendingUp },
];

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "institution",
    label: "Institution Search",
    messages: [
      { role: "eden", text: "I'm EDEN, EdenRadar's intelligence engine. I monitor 350+ tech transfer offices in real time, enriching every asset with target, modality, stage, and readiness data. What are you looking for?", delay: 400 },
      { role: "user", text: "Show me top-ranked oncology assets from Johns Hopkins.", delay: 1800 },
      { role: "eden", text: "Johns Hopkins Technology Ventures has one of the strongest oncology portfolios in the index, spanning cell therapy, small molecule, antibody, and gene therapy modalities. Top 3 by EDEN readiness score:", assetCards: DEMO_ASSETS_JHU, delay: 3200 },
    ],
  },
  {
    id: "cross-tto",
    label: "Cross-TTO Query",
    messages: [
      { role: "eden", text: "EDEN can query across all 350+ indexed institutions simultaneously. I'll rank results by readiness score regardless of which institution they come from. What are you searching for?", delay: 400 },
      { role: "user", text: "Find preclinical CNS assets with EDEN scores above 85 — any institution.", delay: 1800 },
      { role: "eden", text: "Searching 350+ institutions for CNS and neurodegenerative disease assets at preclinical or IND-enabling stage, filtered by EDEN readiness above 85. Strong cluster across Mayo Clinic, Stanford, and Columbia. Top results:", assetCards: DEMO_ASSETS_CNS, delay: 3200 },
    ],
  },
  {
    id: "modality",
    label: "Modality Filter",
    messages: [
      { role: "eden", text: "EDEN can filter by modality, stage, therapeutic area, institution type, or any combination across the full index. What modality or platform type are you focused on?", delay: 400 },
      { role: "user", text: "What ADC platforms are available at IND-enabling or preclinical stage?", delay: 1800 },
      { role: "eden", text: "Filtering for antibody-drug conjugate platforms at IND-enabling through preclinical stage. Prioritizing assets with validated linker-payload chemistry and preclinical proof-of-concept data. Top results by EDEN readiness:", assetCards: DEMO_ASSETS_ADC, delay: 3200 },
    ],
  },
];

function DemoAssetCard({ asset }: { asset: AssetCardData }) {
  return (
    <div
      className="rounded-lg p-3.5 flex flex-col gap-2"
      style={{
        background: "hsl(var(--background))",
        border: `1px solid ${asset.color.replace(")", " / 0.3)")}`,
        borderTop: `2px solid ${asset.color}`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-foreground leading-snug flex-1">{asset.title}</p>
        <span className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: asset.color.replace(")", " / 0.15)"), color: asset.color }}>
          {asset.score}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{asset.institution}</span>
        <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: asset.color.replace(")", " / 0.12)"), color: asset.color }}>{asset.area}</span>
        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{asset.stage}</span>
        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{asset.modality}</span>
      </div>
    </div>
  );
}

function EdenChatDemo({ messages }: { messages: ChatMessage[] }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const chatRef = useRef<HTMLDivElement>(null);
  const timeoutIds = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timeoutIds.current.forEach(clearTimeout);
    timeoutIds.current = [];
    setVisibleCount(0);

    const startChat = () => {
      messages.forEach((msg, i) => {
        const id = setTimeout(() => {
          setVisibleCount(i + 1);
          requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
            if (chatRef.current) chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
          })));
        }, msg.delay);
        timeoutIds.current.push(id);
      });
    };

    const el = chatRef.current?.closest(".chat-demo-wrapper") as HTMLElement | null;
    if (!el) { startChat(); return; }
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { startChat(); obs.disconnect(); } }, { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [messages]);

  useEffect(() => {
    return () => { timeoutIds.current.forEach(clearTimeout); };
  }, []);

  const visibleMessages = messages.slice(0, visibleCount);
  return (
    <div className="flex flex-col rounded-2xl overflow-hidden border border-border" style={{ background: "hsl(var(--card))", height: 420 }}>
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border bg-primary/[0.06]">
        <EdenAvatar size={28} />
        <div>
          <p className="text-sm font-semibold text-foreground leading-tight">EDEN</p>
          <p className="text-[10px] text-primary">Research Intelligence</p>
        </div>
        <div className="ml-auto flex gap-1" aria-hidden="true">
          {["bg-red-500/50", "bg-amber-500/50", "bg-green-500/50"].map((c, i) => (
            <div key={i} className={`w-2.5 h-2.5 rounded-full ${c}`} />
          ))}
        </div>
      </div>
      <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ scrollBehavior: "smooth" }}>
        {visibleMessages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`} style={{ animation: "fade-up 0.35s ease-out forwards" }}>
            {msg.role === "eden" && <EdenAvatar size={26} isThinking={false} />}
            <div className="flex flex-col gap-2 max-w-[85%]">
              <div
                className="px-3.5 py-2.5 rounded-xl text-xs leading-relaxed"
                style={msg.role === "user"
                  ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", borderRadius: "14px 14px 4px 14px" }
                  : { background: "hsl(var(--muted))", color: "hsl(var(--foreground))", borderRadius: "14px 14px 14px 4px" }}
              >
                {msg.text}
              </div>
              {msg.assetCards && (
                <div className="space-y-2">
                  {msg.assetCards.map((asset) => <DemoAssetCard key={asset.id} asset={asset} />)}
                </div>
              )}
            </div>
          </div>
        ))}
        {visibleCount < messages.length && (
          <div className="flex gap-2.5">
            <EdenAvatar size={26} isThinking />
            <div className="px-3.5 py-2.5 rounded-xl text-xs" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))", borderRadius: "14px 14px 14px 4px" }}>
              <span className="flex gap-1 items-center">
                {[0, 0.25, 0.5].map((delay, i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary" style={{ animation: `eden-pulse 1.2s ease-in-out ${delay}s infinite` }} />
                ))}
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-muted opacity-50">
          <span className="text-xs text-muted-foreground flex-1">Ask EDEN anything about biotech assets...</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
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
  { value: "350+", label: "Tech Transfer Offices" },
  { value: "33K+", label: "Scored Assets" },
  { value: "40+",  label: "Live Data Sources" },
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
  const demoRef = useReveal();
  const tiersRef = useReveal();

  const scenario = DEMO_SCENARIOS[activeScenario];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Nav />
      <PageBackground />

      <main className="relative z-10 flex-1">

        {/* Hero + Stats */}
        <section className="relative overflow-hidden pt-24 pb-16 px-4 sm:px-6 text-center max-w-screen-xl mx-auto">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
            <span className="block">The intelligence engine</span>
            <span className="text-primary block">
              for <WordRotate words={["BD teams.", "TTOs.", "researchers.", "deal flow."]} />
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
            EDEN monitors 350+ tech transfer offices around the clock, classifies every asset it finds, scores it 0–100 for licensing readiness, and delivers structured intelligence to the teams that need it, in plain English.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={() => navigate("/login")} data-testid="howitworks-cta-hero" className="h-11 px-8 font-semibold text-base">
              Get Started
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/pricing")} data-testid="howitworks-cta-pricing" className="h-11 px-8 font-semibold text-base">
              See Pricing
            </Button>
          </div>

          {/* Stats strip */}
          <div className="mt-16 grid grid-cols-3 gap-6 sm:gap-10 max-w-lg mx-auto">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-primary mb-1">
                  <NumberTicker value={s.value} />
                </div>
                <div className="text-xs tracking-wide font-semibold text-foreground/70">{s.label}</div>
              </div>
            ))}
          </div>
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
          <div className="divide-y divide-border/60">
            {INTEL_CHANNELS.map((ch, i) => (
              <div
                key={i}
                className="stagger-item grid grid-cols-[4rem_1fr] sm:grid-cols-[8rem_1fr] gap-6 sm:gap-10 py-8 items-start"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex flex-col items-start gap-3 pt-0.5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "hsl(var(--primary) / 0.10)" }}
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

        {/* EDEN Chat Demo */}
        <section
          ref={demoRef}
          className="reveal-section chat-demo-wrapper max-w-screen-xl mx-auto px-4 sm:px-6 py-16 sm:py-20"
        >
          <div className="text-center mb-10">
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">See Step 2 in Action</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Three ways to search with EDEN
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto mb-8">
              Every query runs across all 350+ indexed institutions simultaneously. Select a scenario to watch EDEN respond in real time.
            </p>

            <AnimatedTabs
              tabs={DEMO_SCENARIOS.map((s) => ({ id: s.id, label: s.label }))}
              activeIndex={activeScenario}
              onChange={setActiveScenario}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <div className="flex flex-col items-center justify-center order-2 lg:order-1">
              <div className="w-full max-w-[340px] mx-auto">
                <EdenOrb />
              </div>
              <div className="text-center mt-6 max-w-xs mx-auto space-y-2">
                <h3 className="font-bold text-foreground">EDEN Intelligence Engine</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Processes, classifies, and reasons over every asset in the database. Instant, accurate, cited answers in plain English.
                </p>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <EdenChatDemo key={scenario.id} messages={scenario.messages} />
            </div>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {TIER_OVERVIEW.map((tier, i) => (
              <div
                key={tier.name}
                className="flex flex-col rounded-xl overflow-hidden stagger-item"
                style={{ border: `1px solid ${tier.borderColor}`, borderTop: `3px solid ${tier.color}`, animationDelay: `${i * 80}ms` }}
              >
                <div className="px-5 py-4 bg-card border-b border-border">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: tier.colorDim }}>
                      <tier.icon className="w-4 h-4" style={{ color: tier.color }} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-foreground text-sm leading-tight">{tier.name}</h3>
                      <span className="text-sm font-bold" style={{ color: tier.color }}>{tier.price}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">{tier.tagline}</p>
                </div>
                <div className="flex-1 px-5 py-4 bg-card space-y-2">
                  {tier.features.map((f) => (
                    <div key={f} className="flex items-start gap-2">
                      <Check className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: tier.color }} />
                      <span className="text-[11px] text-foreground leading-snug">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
              background: "linear-gradient(135deg, hsl(222 47% 7%) 0%, hsl(142 45% 8%) 60%, hsl(155 40% 10%) 100%)",
              border: "1px solid hsl(var(--primary) / 0.2)",
            }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, hsl(142 65% 55% / 0.15) 0%, transparent 60%)" }} aria-hidden />
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              Ready to find your next licensing opportunity?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Join the biotech teams already using EdenRadar to surface hidden university assets and close deals faster.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                onClick={() => navigate("/login")}
                data-testid="howitworks-cta-main"
                className="h-11 px-7 font-semibold"
              >
                Start Free Trial
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/what-we-do")}
                data-testid="howitworks-cta-learn"
                className="h-11 px-7 font-semibold border-white/20 text-white/80 hover:text-white hover:bg-white/10"
              >
                Explore the Platform
              </Button>
            </div>
            <p className="text-xs text-muted-foreground/60 mt-6">
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
