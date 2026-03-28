import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Nav } from "@/components/Nav";
import { EdenNXBadge } from "@/components/EdenNXBadge";
import { EdenOrb, EdenAvatar } from "@/components/EdenOrb";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Sprout,
  Check,
  Lightbulb,
  FlaskConical,
  TrendingUp,
  ChevronRight,
  Dna,
  Shield,
  Globe,
  Bell,
  FileText,
  GitMerge,
} from "lucide-react";

function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-visible");
          obs.disconnect();
        }
      },
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
          background:
            "conic-gradient(from 0deg, transparent 260deg, hsl(142 65% 48% / 0.03) 310deg, hsl(142 65% 48% / 0.08) 360deg)",
          borderRadius: "50%",
        }}
      />
    </div>
  );
}

const YEARLY_DISCOUNT = 0.95;

function derivedYearly(monthlyUsd: number): { yearlyPrice: string; yearlySavings: string } {
  const discounted = Math.floor(monthlyUsd * YEARLY_DISCOUNT);
  const savedPerYear = Math.round(monthlyUsd * 12 * (1 - YEARLY_DISCOUNT));
  return {
    yearlyPrice: `$${discounted}`,
    yearlySavings: `$${savedPerYear}`,
  };
}

const TIERS = [
  {
    name: "EdenDiscovery",
    tier: "Tier 1",
    icon: Lightbulb,
    color: "hsl(38 92% 50%)",
    colorDim: "hsl(38 92% 50% / 0.08)",
    borderColor: "hsl(38 92% 50% / 0.3)",
    headerBg: "hsl(38 92% 50%)",
    price: "Free",
    yearlyPrice: "",
    yearlySavings: "",
    period: "",
    tagline: "Ideal for early discovery and concept validation",
    popular: false,
    features: [
      "Submit early-stage concepts before research begins",
      "EDEN credibility scoring for concepts",
      "Browse the public concept community feed",
      "Save concepts to a personal watchlist",
      "Surface your concepts to industry collaborators",
    ],
  },
  {
    name: "EdenLab",
    tier: "Tier 2",
    icon: FlaskConical,
    color: "hsl(265 60% 60%)",
    colorDim: "hsl(265 60% 60% / 0.08)",
    borderColor: "hsl(265 60% 60% / 0.3)",
    headerBg: "hsl(265 60% 60%)",
    price: "Free",
    yearlyPrice: "",
    yearlySavings: "",
    period: "",
    tagline: "For research teams and active deal flow exploration",
    popular: false,
    features: [
      "Everything in EdenDiscovery",
      "11-section structured research project canvas",
      "Literature synthesis across 40+ academic sources",
      "Evidence extraction and citation management",
      "Grants discovery matched to your research profile",
      "Industry visibility for your published research",
    ],
  },
  {
    name: "EdenScout",
    tier: "Tier 3",
    icon: TrendingUp,
    color: "hsl(142 65% 48%)",
    colorDim: "hsl(142 65% 48% / 0.08)",
    borderColor: "hsl(142 65% 48% / 0.3)",
    headerBg: "hsl(142 52% 36%)",
    price: "$799",
    ...derivedYearly(799),
    period: "/mo",
    tagline: "Full platform access for serious BD teams",
    popular: true,
    features: [
      "EDEN natural language queries across 300+ TTOs",
      "Enriched asset dossiers with competitive cross-reference",
      "Therapy area, stage, and modality filters",
      "EDEN readiness scoring per asset (0-100)",
      "Institution intelligence and TTO profiles",
      "Saved asset lists and pipeline tracking",
      "Custom push alerts via email for up-to-the-minute knowledge",
      "Researcher contact information",
      "PDF and CSV pipeline export",
    ],
  },
];

function FreeTierCard({ tier }: { tier: typeof TIERS[0] }) {
  const [, navigate] = useLocation();
  return (
    <div
      className="rounded-2xl flex flex-col overflow-hidden"
      style={{ border: `1px solid ${tier.borderColor}`, borderTop: `3px solid ${tier.color}` }}
    >
      <div className="px-5 py-4" style={{ background: tier.headerBg }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              <tier.icon className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">{tier.tier}</p>
              <h3 className="text-sm font-bold text-white leading-tight">{tier.name}</h3>
            </div>
          </div>
          <span className="text-xl font-black text-white">Free</span>
        </div>
        <p className="text-[11px] text-white/70 leading-snug">{tier.tagline}</p>
      </div>

      <div className="flex-1 px-5 py-3 bg-card">
        <ul className="space-y-2">
          {tier.features.slice(0, 4).map((feature, fi) => {
            const isEscalator = feature.startsWith("Everything in");
            return (
              <li key={fi} className="flex items-start gap-2 text-xs">
                <span
                  className="flex-shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center mt-0.5"
                  style={{ background: isEscalator ? "hsl(var(--muted))" : tier.color.replace(")", " / 0.15)") }}
                >
                  {isEscalator
                    ? <ChevronRight className="w-2 h-2 text-muted-foreground" />
                    : <Check className="w-2 h-2" style={{ color: tier.color }} />}
                </span>
                <span className={isEscalator ? "text-muted-foreground font-medium italic" : "text-foreground"}>
                  {feature}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="px-5 py-4 bg-card border-t border-border">
        <Button
          className="w-full font-semibold h-9 text-sm"
          onClick={() => navigate("/login")}
          data-testid={`pricing-cta-${tier.tier.toLowerCase().replace(" ", "")}`}
          style={{ background: tier.color, color: "white", border: "none" }}
          variant="default"
        >
          Start Free
          <ChevronRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}

const SCOUT = TIERS[2];

const SCOUT_CATEGORIES = [
  {
    icon: Globe,
    label: "World-class intelligence database",
    items: [
      "EDEN natural language queries across 300+ TTOs",
      "Institution intelligence and TTO profiles",
      "Therapy area, stage, and modality filters",
    ],
  },
  {
    icon: Bell,
    label: "Custom email alerts for up-to-the-minute knowledge",
    items: [
      "Custom push alerts via email",
    ],
  },
  {
    icon: FileText,
    label: "AI-enriched Dossiers",
    items: [
      "Enriched asset dossiers with competitive cross-reference",
      "EDEN readiness scoring per asset",
      "Researcher contact information",
    ],
  },
  {
    icon: GitMerge,
    label: "Pipeline Builder",
    items: [
      "Saved asset lists and pipeline tracking",
      "PDF and CSV pipeline export",
    ],
  },
];

function ScoutCard({ isYearly }: { isYearly: boolean }) {
  const [, navigate] = useLocation();

  return (
    <div
      className="rounded-2xl flex flex-col overflow-hidden relative h-full"
      style={{
        border: `1px solid ${SCOUT.borderColor}`,
        borderTop: `3px solid ${SCOUT.headerBg}`,
      }}
    >
      <div className="px-7 py-6" style={{ background: SCOUT.headerBg }}>
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              <SCOUT.icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">{SCOUT.tier}</p>
                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/20 text-white">
                  Most Popular
                </span>
              </div>
              <h3 className="text-lg font-bold text-white leading-tight">{SCOUT.name}</h3>
              <p className="text-xs text-white/70 mt-0.5">{SCOUT.tagline}</p>
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            {isYearly ? (
              <>
                <div className="flex items-baseline gap-1.5 justify-end">
                  <span className="text-4xl font-black text-white">{SCOUT.yearlyPrice}</span>
                  <span className="text-sm text-white/70">/mo</span>
                  <span className="text-sm text-white/50 line-through">{SCOUT.price}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 justify-end">
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(255,255,255,0.2)", color: "white" }}
                  >
                    Save {SCOUT.yearlySavings}/yr
                  </span>
                  <span className="text-[10px] text-white/60">billed annually</span>
                </div>
              </>
            ) : (
              <div className="flex items-baseline gap-1 justify-end">
                <span className="text-4xl font-black text-white">{SCOUT.price}</span>
                <span className="text-sm text-white/70">{SCOUT.period}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 px-7 py-5 bg-card grid grid-cols-1 sm:grid-cols-2 gap-5">
        {SCOUT_CATEGORIES.map((cat) => (
          <div key={cat.label}>
            <div className="flex items-center gap-2 mb-2.5">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: SCOUT.colorDim }}
              >
                <cat.icon className="w-3.5 h-3.5" style={{ color: SCOUT.headerBg }} />
              </div>
              <p className="text-xs font-semibold text-foreground leading-snug">{cat.label}</p>
            </div>
            <ul className="space-y-1.5 pl-8">
              {cat.items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Check className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: SCOUT.headerBg }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="px-7 py-5 bg-card border-t border-border">
        <Button
          className="w-full font-semibold h-11 text-base"
          onClick={() => navigate("/login")}
          data-testid="pricing-cta-tier3"
          style={{ background: SCOUT.headerBg, color: "white", border: "none" }}
          variant="default"
        >
          Get Started with EdenScout
          <ChevronRight className="w-4 h-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}

function PricingCards() {
  const [isYearly, setIsYearly] = useState(false);
  const freeTiers = TIERS.slice(0, 2);

  return (
    <div className="mt-12">
      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <span
          className="text-sm font-medium"
          style={{ color: isYearly ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))" }}
        >
          Monthly
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isYearly}
          data-testid="pricing-billing-toggle"
          onClick={() => setIsYearly((v) => !v)}
          className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none"
          style={{ background: isYearly ? "hsl(142 65% 48%)" : "hsl(var(--muted))" }}
        >
          <span
            className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200"
            style={{ transform: isYearly ? "translateX(20px)" : "translateX(0px)" }}
          />
        </button>
        <span
          className="text-sm font-medium flex items-center gap-1.5"
          style={{ color: isYearly ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}
        >
          Yearly
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
            style={{ background: "hsl(142 65% 48% / 0.12)", color: "hsl(142 52% 36%)" }}
          >
            Save 5% on EdenScout
          </span>
        </span>
      </div>

      {/* Bento grid: free tiers stacked on left, Scout full-height on right */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr] gap-5">
        {/* Left column: Discovery + Lab stacked */}
        <div className="flex flex-col gap-5">
          {freeTiers.map((tier) => (
            <FreeTierCard key={tier.name} tier={tier} />
          ))}
        </div>
        {/* Right column: Scout spans full height */}
        <ScoutCard isYearly={isYearly} />
      </div>
    </div>
  );
}

/* ─── Eden Chat Demo ─────────────────────────────────────── */

interface ChatMessage {
  role: "user" | "eden";
  text: string;
  assetCards?: AssetCardData[];
  delay: number;
}

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

const DEMO_ASSETS: AssetCardData[] = [
  {
    id: 1,
    title: "CAR-T Cell Therapy Targeting CD19/CD22 Dual Antigen",
    institution: "Johns Hopkins University",
    area: "Oncology",
    stage: "Preclinical",
    score: 91,
    modality: "Cell Therapy",
    color: "hsl(142 65% 48%)",
    icon: Dna,
  },
  {
    id: 2,
    title: "HDAC Inhibitor Platform for Solid Tumor Microenvironment",
    institution: "Johns Hopkins University",
    area: "Oncology",
    stage: "Discovery",
    score: 85,
    modality: "Small Molecule",
    color: "hsl(265 60% 60%)",
    icon: Shield,
  },
  {
    id: 3,
    title: "Bispecific Antibody Against PD-L1 and TIM-3 in Lymphoma",
    institution: "Johns Hopkins University",
    area: "Oncology",
    stage: "IND-Enabling",
    score: 88,
    modality: "Antibody",
    color: "hsl(38 92% 50%)",
    icon: TrendingUp,
  },
];

const CHAT_MESSAGES: ChatMessage[] = [
  {
    role: "eden",
    text: "I'm EDEN, EdenRadar's research intelligence engine. I monitor and enrich biotech assets across 300+ tech transfer offices in real time. How can I help your team today?",
    delay: 400,
  },
  {
    role: "user",
    text: "How many total assets do you have indexed right now?",
    delay: 1800,
  },
  {
    role: "eden",
    text: "EdenRadar continuously monitors 300+ research institutions globally. All assets are EDEN-enriched and scored for licensing readiness. What would you like to explore?",
    delay: 3200,
  },
  {
    role: "user",
    text: "Interesting. How many of those are in oncology from Johns Hopkins specifically?",
    delay: 5000,
  },
  {
    role: "eden",
    text: "Johns Hopkins Technology Ventures has a significant oncology portfolio in the index, spanning cell therapy, small molecule, antibody, and gene therapy modalities. Would you like me to surface the top-ranked assets by EDEN readiness score?",
    delay: 6600,
  },
  {
    role: "user",
    text: "Yes, show me the top 3.",
    delay: 8400,
  },
  {
    role: "eden",
    text: "Here are the top 3 Johns Hopkins oncology assets ranked by EDEN readiness score:",
    assetCards: DEMO_ASSETS,
    delay: 9800,
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
        <span
          className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: asset.color.replace(")", " / 0.15)"), color: asset.color }}
        >
          {asset.score}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{asset.institution}</span>
        <span
          className="px-2 py-0.5 rounded-full font-medium"
          style={{ background: asset.color.replace(")", " / 0.12)"), color: asset.color }}
        >
          {asset.area}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{asset.stage}</span>
        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{asset.modality}</span>
      </div>
    </div>
  );
}

function EdenChatDemo() {
  const [visibleCount, setVisibleCount] = useState(0);
  const chatRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;

    const startChat = () => {
      hasStarted.current = true;
      CHAT_MESSAGES.forEach((msg, i) => {
        setTimeout(() => {
          setVisibleCount(i + 1);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (chatRef.current) {
                  chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
                }
              });
            });
          });
        }, msg.delay);
      });
    };

    const el = chatRef.current?.closest(".chat-demo-wrapper") as HTMLElement | null;
    if (!el) {
      startChat();
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          startChat();
          obs.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const visibleMessages = CHAT_MESSAGES.slice(0, visibleCount);

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: "hsl(var(--card))",
        height: 480,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-3.5 border-b border-border"
        style={{ background: "hsl(142 52% 36% / 0.06)" }}
      >
        <EdenAvatar size={28} />
        <div>
          <p className="text-sm font-semibold text-foreground leading-tight">EDEN</p>
          <p className="text-[10px] text-primary">Research Intelligence</p>
        </div>
        <div className="ml-auto flex gap-1">
          {["bg-red-500/50", "bg-amber-500/50", "bg-green-500/50"].map((c, i) => (
            <div key={i} className={`w-2.5 h-2.5 rounded-full ${c}`} />
          ))}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={chatRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        style={{ scrollBehavior: "smooth" }}
      >
        {visibleMessages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            style={{ animation: "fade-up 0.35s ease-out forwards" }}
          >
            {msg.role === "eden" && <EdenAvatar size={26} isThinking={false} />}
            <div className="flex flex-col gap-2 max-w-[80%]">
              <div
                className="px-3.5 py-2.5 rounded-xl text-xs leading-relaxed"
                style={
                  msg.role === "user"
                    ? {
                        background: "hsl(142 52% 36%)",
                        color: "white",
                        borderRadius: "14px 14px 4px 14px",
                      }
                    : {
                        background: "hsl(var(--muted))",
                        color: "hsl(var(--foreground))",
                        borderRadius: "14px 14px 14px 4px",
                      }
                }
              >
                {msg.text}
              </div>
              {msg.assetCards && (
                <div className="space-y-2">
                  {msg.assetCards.map((asset) => (
                    <DemoAssetCard key={asset.id} asset={asset} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {visibleCount < CHAT_MESSAGES.length && (
          <div className="flex gap-2.5">
            <EdenAvatar size={26} isThinking />
            <div
              className="px-3.5 py-2.5 rounded-xl text-xs"
              style={{
                background: "hsl(var(--muted))",
                color: "hsl(var(--muted-foreground))",
                borderRadius: "14px 14px 14px 4px",
              }}
            >
              <span className="flex gap-1 items-center">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-primary"
                  style={{ animation: "eden-pulse 1.2s ease-in-out infinite" }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-primary"
                  style={{ animation: "eden-pulse 1.2s ease-in-out 0.25s infinite" }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-primary"
                  style={{ animation: "eden-pulse 1.2s ease-in-out 0.5s infinite" }}
                />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input stub */}
      <div className="px-4 py-3 border-t border-border">
        <div
          className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl"
          style={{ background: "hsl(var(--muted))", opacity: 0.5 }}
        >
          <span className="text-xs text-muted-foreground flex-1">Ask EDEN anything about biotech assets...</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

const HOW_STEPS = [
  {
    number: "01",
    title: "Sign up and choose your tier",
    desc: "Create your account in under two minutes. Select the tier that fits your team, starting from EdenDiscovery for early exploration all the way to the full EdenScout intelligence suite.",
  },
  {
    number: "02",
    title: "Tell EDEN what you're looking for",
    desc: "Ask EDEN a plain English question. 'Show me CNS assets from MIT in preclinical stage.' EDEN searches across thousands of EDEN-enriched records instantly and presents ranked results.",
  },
  {
    number: "03",
    title: "Explore enriched dossiers",
    desc: "Drill into any asset to see the full EDEN-compiled dossier: scientific summary, competitive landscape, inventor details, patent coverage, and deal readiness score.",
  },
  {
    number: "04",
    title: "Save, export, and act",
    desc: "Save assets to watchlists, export pipeline reports to CSV or PDF, and set alerts for new matching assets. Your BD team is now running on intelligence, not guesswork.",
  },
];

export default function HowItWorks() {
  const [, navigate] = useLocation();
  const pricingRef = useReveal();
  const demoRef = useReveal();
  const stepsRef = useReveal();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Nav />
      <PageBackground />

      <main className="relative z-10 flex-1">

        {/* Hero */}
        <section className="relative overflow-hidden pt-24 pb-16 px-4 sm:px-6 text-center max-w-screen-xl mx-auto">
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border mb-8"
            style={{ background: "hsl(142 52% 36% / 0.08)", borderColor: "hsl(142 52% 36% / 0.25)" }}
          >
            <Sprout className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary tracking-widest uppercase">
              Pricing and How It Works
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
            Simple pricing.{" "}
            <span className="gradient-text">Powerful intelligence.</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Three tiers built for every stage of biotech discovery. Start exploring free-range assets today, or go all-in with the full EdenScout suite.
          </p>
        </section>

        {/* Pricing */}
        <section
          ref={pricingRef}
          className="reveal-section max-w-screen-xl mx-auto px-4 sm:px-6 py-10"
        >
          <div className="text-center mb-4">
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-2">Choose Your Tier</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Three portals. One ecosystem.
            </h2>
          </div>
          <PricingCards />

          <p className="text-center text-xs text-muted-foreground mt-6">
            EdenScout includes a 3-day free trial.
          </p>
        </section>

        {/* EDEN Chat Demo + Orb */}
        <section
          ref={demoRef}
          className="reveal-section chat-demo-wrapper max-w-screen-xl mx-auto px-4 sm:px-6 py-16"
        >
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Live Demo</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              See EDEN in action
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              A real conversation with EDEN, EdenRadar's intelligence layer, using the Johns Hopkins TTO as an example.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            {/* Orb */}
            <div className="flex flex-col items-center justify-center">
              <div className="w-full max-w-[420px] mx-auto">
                <EdenOrb />
              </div>
              <div className="text-center mt-6 max-w-xs mx-auto">
                <h3 className="font-bold text-foreground mb-2">EDEN Intelligence Engine</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The intelligence core of EdenRadar. EDEN processes, classifies, and reasons over every asset in the database, giving you instant, accurate, cited answers in plain English.
                </p>
              </div>
            </div>

            {/* Chat window */}
            <div>
              <EdenChatDemo />
            </div>
          </div>
        </section>

        {/* How it works steps */}
        <section
          ref={stepsRef}
          className="reveal-section max-w-screen-xl mx-auto px-4 sm:px-6 py-16"
        >
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Getting Started</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Up and running in four steps
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {HOW_STEPS.map((step, i) => (
              <div
                key={i}
                className="flex gap-5 p-6 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors duration-200"
              >
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg"
                  style={{ background: "hsl(142 52% 36% / 0.1)", color: "hsl(142 65% 55%)" }}
                >
                  {step.number}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1.5">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="max-w-screen-xl mx-auto px-4 sm:px-6 py-16">
          <div
            className="rounded-2xl p-10 text-center"
            style={{
              background: "linear-gradient(135deg, hsl(222 47% 7%) 0%, hsl(142 45% 8%) 60%, hsl(155 40% 10%) 100%)",
              border: "1px solid hsl(142 52% 36% / 0.2)",
            }}
          >
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
                style={{ background: "hsl(142 52% 36%)", color: "white", border: "none" }}
              >
                Start Free Trial
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/what-we-do")}
                data-testid="howitworks-cta-learn"
                className="h-11 px-7 font-semibold"
              >
                Learn More
              </Button>
            </div>
          </div>
        </section>

      </main>

      <footer className="relative z-10 border-t border-border py-8 px-4 sm:px-6 text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-4">
          <p>2026 EdenRadar. All rights reserved.</p>
          <EdenNXBadge />
        </div>
      </footer>
    </div>
  );
}
