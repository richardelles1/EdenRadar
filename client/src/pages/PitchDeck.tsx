import { useState, useEffect, useRef } from "react";
import {
  Printer,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Lightbulb,
  FlaskConical,
  Radar,
  ArrowRight,
  Database,
  Brain,
  Server,
  Shield,
  Globe,
  Layers,
  Sparkles,
  TrendingUp,
  Target,
  Search,
  BookOpen,
  Award,
  Users,
  Building2,
  FileBarChart2,
  Beaker,
  Microscope,
  ExternalLink,
  Sun,
  Moon,
} from "lucide-react";
import imgIdeation from "@assets/pexels-edmond-dantes-4347481_1773638670423.jpg";
import imgMeeting from "@assets/pexels-pavel-danilyuk-6340656_1773638670420.jpg";
import imgLabComp from "@assets/pexels-edward-jenner-4033150_1773638670422.jpg";
import imgLabWork from "@assets/pexels-yaroslav-shuraev-8515114_1773638670424.jpg";

const SLIDE_COUNT = 10;

const DARK = {
  bg: "#0d1117",
  bgLight: "#161b22",
  border: "#21262d",
  text: "#e6edf3",
  textMuted: "#8b949e",
  green: "#3fb950",
  greenDim: "rgba(63,185,80,0.14)",
  amber: "#d29922",
  amberDim: "rgba(210,153,34,0.14)",
  violet: "#a371f7",
  violetDim: "rgba(163,113,247,0.14)",
  accent: "#58a6ff",
  red: "#f85149",
};

const LIGHT = {
  bg: "#ffffff",
  bgLight: "#f6f8fa",
  border: "#d0d7de",
  text: "#1c2128",
  textMuted: "#57606a",
  green: "#1a7f37",
  greenDim: "rgba(26,127,55,0.10)",
  amber: "#9a6700",
  amberDim: "rgba(154,103,0,0.10)",
  violet: "#6e40c9",
  violetDim: "rgba(110,64,201,0.10)",
  accent: "#0969da",
  red: "#cf222e",
};

type Colors = typeof DARK;

function SlideNav({ current, onJump, colors }: { current: number; onJump: (i: number) => void; colors: Colors }) {
  return (
    <div className="pitch-nav fixed right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-2" data-testid="pitch-nav">
      <button onClick={() => onJump(Math.max(0, current - 1))} className="p-1 rounded-full hover:bg-white/10 transition-colors" aria-label="Previous slide" data-testid="pitch-nav-prev">
        <ChevronUp className="w-4 h-4" style={{ color: colors.textMuted }} />
      </button>
      {Array.from({ length: SLIDE_COUNT }, (_, i) => (
        <button key={i} onClick={() => onJump(i)} className="group relative flex items-center justify-center" aria-label={`Go to slide ${i + 1}`} data-testid={`pitch-dot-${i}`}>
          <span className="block rounded-full transition-all duration-300" style={{ width: current === i ? 10 : 6, height: current === i ? 10 : 6, background: current === i ? colors.green : "rgba(128,128,128,0.35)", boxShadow: current === i ? `0 0 8px ${colors.green}` : "none" }} />
          <span className="absolute right-6 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ background: colors.bgLight, color: colors.text, border: `1px solid ${colors.border}` }}>{i + 1}</span>
        </button>
      ))}
      <button onClick={() => onJump(Math.min(SLIDE_COUNT - 1, current + 1))} className="p-1 rounded-full hover:bg-white/10 transition-colors" aria-label="Next slide" data-testid="pitch-nav-next">
        <ChevronDown className="w-4 h-4" style={{ color: colors.textMuted }} />
      </button>
    </div>
  );
}

function Slide({
  index, section, accent, children, className = "", noPadding = false, colors,
}: {
  index: number; section: string; accent?: string; children: React.ReactNode; className?: string; noPadding?: boolean; colors: Colors;
}) {
  const accentColor = accent || colors.green;
  return (
    <section
      className={`pitch-slide relative w-full flex flex-col justify-center overflow-hidden ${className}`}
      style={{ minHeight: "100vh", height: "100vh", background: colors.bg, scrollSnapAlign: "start" }}
      data-testid={`pitch-slide-${index}`}
    >
      <div className="absolute top-6 left-8 flex items-center gap-3" style={{ zIndex: 10 }}>
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: accentColor }}>{String(index).padStart(2, "0")}</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: colors.textMuted }}>{section}</span>
      </div>
      <div className={`relative z-10 w-full max-w-6xl mx-auto ${noPadding ? "" : "px-8 sm:px-16 lg:px-24"}`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {children}
      </div>
      <div className="absolute bottom-4 left-0 right-0 flex items-center justify-between px-8" style={{ zIndex: 10 }}>
        <span className="text-xs font-semibold tracking-widest" style={{ color: `${colors.text}22` }}>EDENRADAR</span>
        <span className="text-xs" style={{ color: `${colors.text}22` }}>Confidential</span>
      </div>
    </section>
  );
}

function CoverSlide({ colors }: { colors: Colors }) {
  return (
    <section
      className="pitch-slide relative w-full overflow-hidden flex"
      style={{ minHeight: "100vh", height: "100vh", background: colors.bg, scrollSnapAlign: "start" }}
      data-testid="pitch-slide-1"
    >
      <div className="absolute top-6 left-8 flex items-center gap-3" style={{ zIndex: 10 }}>
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: colors.green }}>01</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: colors.textMuted }}>Cover</span>
      </div>

      <div className="flex flex-1 items-stretch">
        <div className="flex flex-col justify-center flex-1 px-8 sm:px-16 lg:px-24 py-20 relative z-10">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8" style={{ background: colors.greenDim, border: `2px solid ${colors.green}44` }}>
            <Radar className="w-8 h-8" style={{ color: colors.green }} />
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-3" style={{ color: colors.text }}>
            Eden<span style={{ color: colors.green }}>Radar</span>
          </h1>
          <p className="text-xl font-semibold mb-4" style={{ color: colors.green }}>Where biotech goes from idea to impact.</p>
          <p className="text-base max-w-sm mb-10" style={{ color: colors.textMuted }}>
            The first platform to connect early-stage research, structured labs, and industry asset intelligence in a single ecosystem.
          </p>
          <div className="flex items-center gap-5 text-xs" style={{ color: colors.textMuted }}>
            <span>Founded 2024</span>
            <span className="w-1 h-1 rounded-full" style={{ background: colors.green }} />
            <span>Pre-Seed</span>
            <span className="w-1 h-1 rounded-full" style={{ background: colors.green }} />
            <span>edenradar.com</span>
          </div>
        </div>

        <div className="hidden md:block w-[42%] relative shrink-0">
          <img src={imgIdeation} alt="Team ideating" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: "center" }} />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to right, ${colors.bg} 0%, transparent 30%), linear-gradient(to top, ${colors.bg}88 0%, transparent 50%)` }} />
          <div className="absolute inset-0" style={{ background: `${colors.amber}0d` }} />
        </div>
      </div>

      <div className="absolute bottom-4 left-0 right-0 flex items-center justify-between px-8" style={{ zIndex: 10 }}>
        <span className="text-xs font-semibold tracking-widest" style={{ color: `${colors.text}22` }}>EDENRADAR</span>
        <span className="text-xs" style={{ color: `${colors.text}22` }}>Confidential</span>
      </div>
    </section>
  );
}

function ProblemSlide({ colors }: { colors: Colors }) {
  const problems = [
    { icon: AlertTriangle, title: "Innovation Gets Buried", desc: "Breakthrough concepts stall in university labs with no pathway to industry attention." },
    { icon: Search, title: "Industry Starts Too Late", desc: "Commercial discovery tools begin at the patent stage. The best assets are already locked or gone." },
    { icon: Layers, title: "No Shared Intelligence", desc: "Researchers, TTOs, and BD teams use disconnected systems. The pipeline has no connective tissue." },
  ];

  return (
    <section
      className="pitch-slide relative w-full overflow-hidden flex"
      style={{ minHeight: "100vh", height: "100vh", background: colors.bg, scrollSnapAlign: "start" }}
      data-testid="pitch-slide-2"
    >
      <div className="absolute top-6 left-8 flex items-center gap-3" style={{ zIndex: 10 }}>
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: colors.red }}>02</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: colors.textMuted }}>The Problem</span>
      </div>

      <div className="hidden md:block w-[40%] relative shrink-0">
        <img src={imgMeeting} alt="Industry meeting" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: `linear-gradient(to right, transparent 60%, ${colors.bg} 100%), linear-gradient(to top, ${colors.bg}cc 0%, transparent 40%)` }} />
        <div className="absolute inset-0" style={{ background: `${colors.red}0a` }} />
      </div>

      <div className="flex flex-col justify-center flex-1 px-8 sm:px-12 lg:px-16 py-20 relative z-10">
        <div className="mb-3 inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest" style={{ background: `${colors.red}18`, color: colors.red }}>
          $2.6B average cost to bring a drug to market
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold mb-8" style={{ color: colors.text }}>
          The pipeline is <span style={{ color: colors.red }}>broken</span> before it begins.
        </h2>
        <div className="space-y-4">
          {problems.map((p) => (
            <div key={p.title} className="flex items-start gap-4 rounded-xl p-5" style={{ background: colors.bgLight, border: `1px solid ${colors.border}` }}>
              <p.icon className="w-5 h-5 shrink-0 mt-0.5" style={{ color: colors.red }} />
              <div>
                <p className="text-sm font-bold mb-1" style={{ color: colors.text }}>{p.title}</p>
                <p className="text-sm" style={{ color: colors.textMuted }}>{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-4 left-0 right-0 flex items-center justify-between px-8" style={{ zIndex: 10 }}>
        <span className="text-xs font-semibold tracking-widest" style={{ color: `${colors.text}22` }}>EDENRADAR</span>
        <span className="text-xs" style={{ color: `${colors.text}22` }}>Confidential</span>
      </div>
    </section>
  );
}

function SolutionSlide({ colors }: { colors: Colors }) {
  const stages = [
    { label: "Concept", sublabel: "EdenDiscovery", color: colors.amber, dim: colors.amberDim, desc: "Early ideas scored for scientific credibility before research begins." },
    { label: "Research", sublabel: "EdenLab", color: colors.violet, dim: colors.violetDim, desc: "Structured projects with literature, grants, and AI synthesis." },
    { label: "Industry", sublabel: "EdenRadar", color: colors.green, dim: colors.greenDim, desc: "AI-enriched asset dossiers from 205 monitored TTO institutions." },
  ];
  return (
    <Slide index={3} section="Our Solution" accent={colors.green} colors={colors}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 30% 60%, ${colors.green}0a 0%, transparent 60%)` }} />
      <p className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: colors.green }}>One platform. Three tiers. Continuous signal.</p>
      <h2 className="text-3xl sm:text-4xl font-bold mb-10" style={{ color: colors.text }}>
        EdenRadar captures the <span style={{ color: colors.green }}>full lifecycle</span>.
      </h2>
      <div className="relative">
        <div className="absolute top-1/2 left-0 right-0 h-px" style={{ background: `linear-gradient(to right, ${colors.amber}, ${colors.violet}, ${colors.green})`, opacity: 0.4, transform: "translateY(-50%)" }} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 relative">
          {stages.map((s, i) => (
            <div key={s.label} className="rounded-xl p-6 relative" style={{ background: s.dim, border: `1px solid ${s.color}44`, borderTop: `3px solid ${s.color}` }}>
              <span className="text-xs font-bold uppercase tracking-widest mb-1 block" style={{ color: s.color }}>{s.sublabel}</span>
              <h3 className="text-lg font-bold mb-2" style={{ color: colors.text }}>{s.label}</h3>
              <p className="text-sm" style={{ color: colors.textMuted }}>{s.desc}</p>
              {i < 2 && <ArrowRight className="absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 hidden sm:block z-10" style={{ color: colors.textMuted }} />}
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}

function PortalsSlide({ colors }: { colors: Colors }) {
  const portals = [
    {
      title: "EdenDiscovery", tier: "Tier 1", tagline: "Pre-research concept registry", color: colors.amber, dim: colors.amberDim, icon: Lightbulb,
      items: ["Submit hypotheses before research begins", "AI credibility scoring (0 to 100)", "Discovered by collaborators and funders", "Landscape intelligence from PubMed and bioRxiv"],
    },
    {
      title: "EdenLab", tier: "Tier 2", tagline: "Researcher workspace", color: colors.violet, dim: colors.violetDim, icon: FlaskConical,
      items: ["Literature search across 32 data sources", "AI synthesis and evidence extraction", "Structured 11-section project canvas", "Grant discovery matched to research profile"],
    },
    {
      title: "EdenRadar", tier: "Tier 3", tagline: "Industry intelligence", color: colors.green, dim: colors.greenDim, icon: Radar,
      items: ["205 TTO institutions monitored continuously", "AI-scored and enriched asset dossiers", "Competing asset cross-reference by target", "Convergence signals and taxonomy tracking"],
    },
  ];
  return (
    <Slide index={4} section="Three Portals" accent={colors.green} colors={colors}>
      <h2 className="text-3xl sm:text-4xl font-bold mb-8" style={{ color: colors.text }}>
        Three portals. One <span style={{ color: colors.green }}>ecosystem</span>.
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {portals.map((p) => (
          <div key={p.title} className="rounded-xl p-6 flex flex-col" style={{ background: p.dim, border: `1px solid ${p.color}44`, borderTop: `3px solid ${p.color}` }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${p.color}22` }}>
                <p.icon className="w-4.5 h-4.5" style={{ color: p.color }} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: p.color }}>{p.tier}</p>
                <h3 className="text-base font-bold leading-tight" style={{ color: colors.text }}>{p.title}</h3>
              </div>
            </div>
            <p className="text-xs mb-4" style={{ color: colors.textMuted }}>{p.tagline}</p>
            <ul className="space-y-2 mt-auto">
              {p.items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs" style={{ color: colors.text }}>
                  <ArrowRight className="w-3 h-3 mt-0.5 shrink-0" style={{ color: p.color }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Slide>
  );
}

function DiscoverySlide({ colors }: { colors: Colors }) {
  const features = [
    { icon: Sparkles, label: "AI Credibility Scoring", desc: "0 to 100 scale with instant evaluation against existing literature" },
    { icon: Target, label: "Landscape Intelligence", desc: "Automated PubMed and bioRxiv scan at submission" },
    { icon: Users, label: "Interest Signals", desc: "Collaborators, funders, and advisors can flag concepts" },
  ];
  return (
    <section
      className="pitch-slide relative w-full overflow-hidden flex"
      style={{ minHeight: "100vh", height: "100vh", background: colors.bg, scrollSnapAlign: "start" }}
      data-testid="pitch-slide-5"
    >
      <div className="absolute top-6 left-8 flex items-center gap-3" style={{ zIndex: 10 }}>
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: colors.amber }}>05</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: colors.textMuted }}>EdenDiscovery</span>
      </div>

      <div className="flex flex-col justify-center flex-1 px-8 sm:px-12 lg:px-16 py-20 relative z-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: colors.amberDim }}>
            <Lightbulb className="w-5 h-5" style={{ color: colors.amber }} />
          </div>
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold" style={{ color: colors.text }}>
              Eden<span style={{ color: colors.amber }}>Discovery</span>
            </h2>
            <p className="text-xs" style={{ color: colors.textMuted }}>Tier 1 — Pre-research concept registry</p>
          </div>
        </div>
        <p className="text-base mb-8 max-w-md" style={{ color: colors.textMuted }}>
          Where biotech concepts are born. Submit a hypothesis, get scored, and get discovered by collaborators and funders before anyone else sees it.
        </p>
        <div className="space-y-4">
          {features.map((f) => (
            <div key={f.label} className="flex items-start gap-4 rounded-xl p-4" style={{ background: colors.bgLight, border: `1px solid ${colors.amber}33` }}>
              <f.icon className="w-5 h-5 shrink-0 mt-0.5" style={{ color: colors.amber }} />
              <div>
                <p className="text-sm font-semibold mb-0.5" style={{ color: colors.text }}>{f.label}</p>
                <p className="text-xs" style={{ color: colors.textMuted }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold w-fit" style={{ background: colors.amberDim, color: colors.amber, border: `1px solid ${colors.amber}44` }}>
          <Globe className="w-3.5 h-3.5" />
          Public feed — no login required to browse
        </div>
      </div>

      <div className="hidden md:block w-[38%] relative shrink-0">
        <img src={imgLabWork} alt="Researchers at work" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: "center top" }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(to right, ${colors.bg} 0%, transparent 25%), linear-gradient(to top, ${colors.bg}cc 0%, transparent 50%)` }} />
        <div className="absolute inset-0" style={{ background: `${colors.amber}12` }} />
      </div>

      <div className="absolute bottom-4 left-0 right-0 flex items-center justify-between px-8" style={{ zIndex: 10 }}>
        <span className="text-xs font-semibold tracking-widest" style={{ color: `${colors.text}22` }}>EDENRADAR</span>
        <span className="text-xs" style={{ color: `${colors.text}22` }}>Confidential</span>
      </div>
    </section>
  );
}

function LabSlide({ colors }: { colors: Colors }) {
  const features = [
    { icon: BookOpen, label: "32 Data Sources", desc: "PubMed, bioRxiv, clinical trials, patents" },
    { icon: Brain, label: "AI Synthesis", desc: "Structured summaries and key finding extraction" },
    { icon: Award, label: "Grant Discovery", desc: "NIH, NSF, and SBIR matched to research profile" },
    { icon: TrendingUp, label: "Industry Visibility", desc: "Scored signals surface to BD teams automatically" },
  ];
  return (
    <section
      className="pitch-slide relative w-full overflow-hidden flex flex-col"
      style={{ minHeight: "100vh", height: "100vh", background: colors.bg, scrollSnapAlign: "start" }}
      data-testid="pitch-slide-6"
    >
      <div className="absolute top-6 left-8 flex items-center gap-3" style={{ zIndex: 10 }}>
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: colors.violet }}>06</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: colors.textMuted }}>EdenLab</span>
      </div>

      <div className="h-[32%] relative shrink-0 overflow-hidden">
        <img src={imgLabComp} alt="Researchers collaborating" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: "center 30%" }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, transparent 40%, ${colors.bg} 100%)` }} />
        <div className="absolute inset-0" style={{ background: `${colors.violet}15` }} />
      </div>

      <div className="flex flex-col justify-center flex-1 px-8 sm:px-16 lg:px-24 py-6 relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: colors.violetDim }}>
            <FlaskConical className="w-5 h-5" style={{ color: colors.violet }} />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold" style={{ color: colors.text }}>
              Eden<span style={{ color: colors.violet }}>Lab</span>
            </h2>
            <p className="text-xs" style={{ color: colors.textMuted }}>Tier 2 — Researcher workspace</p>
          </div>
        </div>
        <p className="text-sm mb-6 max-w-2xl" style={{ color: colors.textMuted }}>
          A research workspace built for biotech. Literature, grants, and industry visibility in one AI-powered canvas.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {features.map((f) => (
            <div key={f.label} className="rounded-lg p-4" style={{ background: colors.bgLight, border: `1px solid ${colors.violet}33` }}>
              <f.icon className="w-4.5 h-4.5 mb-2" style={{ color: colors.violet }} />
              <p className="text-xs font-semibold mb-0.5" style={{ color: colors.text }}>{f.label}</p>
              <p className="text-xs" style={{ color: colors.textMuted }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-4 left-0 right-0 flex items-center justify-between px-8" style={{ zIndex: 10 }}>
        <span className="text-xs font-semibold tracking-widest" style={{ color: `${colors.text}22` }}>EDENRADAR</span>
        <span className="text-xs" style={{ color: `${colors.text}22` }}>Confidential</span>
      </div>
    </section>
  );
}

function RadarSlide({ colors }: { colors: Colors }) {
  const features = [
    { icon: Building2, stat: "205", label: "TTO Institutions", desc: "Continuously scraped with bespoke and automated ingestion pipelines" },
    { icon: FileBarChart2, stat: "Full", label: "Asset Dossiers", desc: "AI-enriched with target, modality, disease indication, and supporting literature" },
    { icon: Microscope, stat: "Live", label: "Competing Analysis", desc: "Cross-reference assets by target and therapy area across the entire catalog" },
    { icon: TrendingUp, stat: "Hot", label: "Convergence Signals", desc: "Taxonomy-driven detection of rising activity clusters by therapy area" },
  ];
  return (
    <Slide index={7} section="EdenRadar" accent={colors.green} colors={colors}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 60% 40%, ${colors.green}08 0%, transparent 60%)` }} />
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: colors.greenDim }}>
          <Radar className="w-5 h-5" style={{ color: colors.green }} />
        </div>
        <div>
          <h2 className="text-3xl sm:text-4xl font-bold" style={{ color: colors.text }}>
            Eden<span style={{ color: colors.green }}>Radar</span>
          </h2>
          <p className="text-xs" style={{ color: colors.textMuted }}>Tier 3 — Industry intelligence</p>
        </div>
      </div>
      <p className="text-base mb-8 max-w-2xl" style={{ color: colors.textMuted }}>
        The industry-facing layer. EdenRadar monitors 205 technology transfer offices, ingests new listings, and enriches them with classification, scoring, and supporting literature to produce portfolio-grade dossiers.
      </p>
      <div className="grid grid-cols-2 gap-4">
        {features.map((f) => (
          <div key={f.label} className="rounded-xl p-5 flex gap-4 items-start" style={{ background: colors.bgLight, border: `1px solid ${colors.green}33` }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: colors.greenDim }}>
              <f.icon className="w-5 h-5" style={{ color: colors.green }} />
            </div>
            <div>
              <span className="text-xl font-bold block" style={{ color: colors.green }}>{f.stat}</span>
              <p className="text-sm font-semibold" style={{ color: colors.text }}>{f.label}</p>
              <p className="text-xs mt-1" style={{ color: colors.textMuted }}>{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </Slide>
  );
}

function TractionSlide({ colors }: { colors: Colors }) {
  const stats = [
    { value: "205", label: "TTO Institutions Scraped", icon: Building2, color: colors.green },
    { value: "32", label: "Research Data Sources", icon: Database, color: colors.violet },
    { value: "3", label: "Distinct Portals Live", icon: Layers, color: colors.amber },
    { value: "GPT-4", label: "Classifier and Enrichment", icon: Brain, color: colors.green },
  ];
  const milestones = [
    { label: "Data Pipeline", desc: "Scrapers live" },
    { label: "AI Layer", desc: "Classify, score, enrich" },
    { label: "3 Portals", desc: "Discovery, Lab, Radar" },
    { label: "Production", desc: "Deployed at edenradar.com" },
  ];
  return (
    <Slide index={8} section="What We've Built" accent={colors.green} colors={colors}>
      <h2 className="text-3xl sm:text-4xl font-bold mb-2" style={{ color: colors.text }}>
        Built, deployed, <span style={{ color: colors.green }}>running today</span>.
      </h2>
      <p className="text-base mb-8 max-w-2xl" style={{ color: colors.textMuted }}>
        This is not a roadmap. Every component below is processing real biotech data in production.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl p-5 flex flex-col items-center text-center" style={{ background: colors.bgLight, border: `1px solid ${colors.border}` }}>
            <s.icon className="w-5 h-5 mb-2" style={{ color: s.color }} />
            <span className="text-2xl font-bold mb-1" style={{ color: s.color }}>{s.value}</span>
            <span className="text-xs" style={{ color: colors.textMuted }}>{s.label}</span>
          </div>
        ))}
      </div>
      <div className="rounded-xl p-5" style={{ background: colors.bgLight, border: `1px solid ${colors.border}` }}>
        <div className="flex items-center gap-0 relative">
          {milestones.map((m, i) => (
            <div key={m.label} className="flex-1 flex flex-col items-center text-center relative">
              <div className="w-3 h-3 rounded-full mb-2 relative z-10" style={{ background: colors.green, boxShadow: `0 0 8px ${colors.green}88` }} />
              {i < milestones.length - 1 && <div className="absolute top-1.5 left-1/2 right-0 h-px" style={{ background: `${colors.green}44` }} />}
              <p className="text-xs font-bold mb-0.5" style={{ color: colors.text }}>{m.label}</p>
              <p className="text-[10px]" style={{ color: colors.textMuted }}>{m.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}

function VisionSlide({ colors }: { colors: Colors }) {
  return (
    <Slide index={9} section="The Vision" accent={colors.green} colors={colors}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 50% 50%, ${colors.green}0a 0%, transparent 60%)` }} />
      <div className="flex flex-col items-center text-center px-8">
        <p className="text-xs font-bold uppercase tracking-widest mb-6" style={{ color: colors.green }}>Why this matters</p>
        <blockquote className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-snug max-w-4xl mb-10" style={{ color: colors.text }}>
          "We accelerate pharmaceutical innovation by capturing early-stage research and creating direct connections between scientists and the industry partners who can advance it."
        </blockquote>
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6 mb-10">
          {[
            { label: "Concept", sublabel: "Early ideas matter", color: colors.amber },
            { label: "Research", sublabel: "Science needs reach", color: colors.violet },
            { label: "Industry", sublabel: "Business needs signal", color: colors.green },
          ].map((s, i) => (
            <div key={s.label} className="flex items-center gap-3 sm:gap-6">
              <div className="flex flex-col items-center gap-1.5 px-5 py-3 rounded-xl" style={{ background: `${s.color}18`, border: `1px solid ${s.color}44` }}>
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                <span className="text-sm font-bold" style={{ color: s.color }}>{s.label}</span>
                <span className="text-xs" style={{ color: colors.textMuted }}>{s.sublabel}</span>
              </div>
              {i < 2 && <ArrowRight className="w-4 h-4 hidden sm:block" style={{ color: colors.textMuted }} />}
            </div>
          ))}
        </div>
        <p className="text-sm max-w-xl" style={{ color: colors.textMuted }}>
          EdenRadar is building the connective tissue of biotech — an intelligence layer that makes the entire pipeline visible, searchable, and actionable from concept to commercialization.
        </p>
      </div>
    </Slide>
  );
}

function ContactSlide({ colors }: { colors: Colors }) {
  return (
    <Slide index={10} section="Contact" accent={colors.green} colors={colors}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 50% 60%, ${colors.green}08 0%, transparent 60%)` }} />
      <div className="flex flex-col items-center text-center px-8">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6" style={{ background: colors.greenDim, border: `2px solid ${colors.green}44` }}>
          <Radar className="w-8 h-8" style={{ color: colors.green }} />
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold mb-2" style={{ color: colors.text }}>
          Let's build the future of <span style={{ color: colors.green }}>biotech intelligence</span>.
        </h2>
        <p className="text-base mb-8 max-w-lg" style={{ color: colors.textMuted }}>
          We're seeking co-founders, advisors, and early partners who believe the drug discovery pipeline should start earlier and move faster.
        </p>
        <a
          href="https://edenradar.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-base font-semibold transition-all hover:scale-105 mb-10"
          style={{ background: colors.green, color: "#fff" }}
          data-testid="pitch-cta-request-access"
        >
          Request Access
          <ExternalLink className="w-4 h-4" />
        </a>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-left max-w-sm">
          <div className="rounded-xl p-4" style={{ background: colors.bgLight, border: `1px solid ${colors.border}` }}>
            <p className="text-sm font-bold mb-0.5" style={{ color: colors.text }}>Ariel Boucheikhchoukh</p>
            <p className="text-xs mb-1" style={{ color: colors.textMuted }}>Founder and CEO</p>
            <p className="text-xs font-medium" style={{ color: colors.accent }}>ariel@edenradar.com</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: colors.bgLight, border: `1px solid ${colors.border}` }}>
            <p className="text-sm font-bold mb-0.5" style={{ color: colors.text }}>EdenRadar</p>
            <p className="text-xs mb-1" style={{ color: colors.textMuted }}>edenradar.com</p>
            <p className="text-xs font-medium" style={{ color: colors.accent }}>hello@edenradar.com</p>
          </div>
        </div>
      </div>
    </Slide>
  );
}

export default function PitchDeck() {
  const [current, setCurrent] = useState(0);
  const [isDark, setIsDark] = useState(() => localStorage.getItem("eden-theme") !== "light");
  const containerRef = useRef<HTMLDivElement>(null);
  const isPrint = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("print");

  const colors = isDark ? DARK : LIGHT;

  function toggleTheme() {
    setIsDark((d) => {
      const next = !d;
      localStorage.setItem("eden-theme", next ? "dark" : "light");
      return next;
    });
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const slideHeight = container.clientHeight;
      const index = Math.round(scrollTop / slideHeight);
      setCurrent(Math.min(index, SLIDE_COUNT - 1));
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  const jumpTo = (i: number) => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: i * container.clientHeight, behavior: "smooth" });
  };

  return (
    <div
      ref={containerRef}
      className={`pitch-deck ${isPrint ? "pitch-print" : ""}`}
      style={{ height: "100vh", overflowY: "auto", scrollSnapType: isPrint ? "none" : "y mandatory", scrollBehavior: "smooth" }}
      data-testid="pitch-deck"
    >
      {!isPrint && <SlideNav current={current} onJump={jumpTo} colors={colors} />}

      {!isPrint && (
        <div className="pitch-export fixed top-6 right-6 z-50 flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105"
            style={{ background: colors.bgLight, color: colors.textMuted, border: `1px solid ${colors.border}` }}
            data-testid="pitch-theme-toggle"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105"
            style={{ background: colors.bgLight, color: colors.text, border: `1px solid ${colors.border}` }}
            data-testid="pitch-export-pdf"
          >
            <Printer className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      )}

      <CoverSlide colors={colors} />
      <ProblemSlide colors={colors} />
      <SolutionSlide colors={colors} />
      <PortalsSlide colors={colors} />
      <DiscoverySlide colors={colors} />
      <LabSlide colors={colors} />
      <RadarSlide colors={colors} />
      <TractionSlide colors={colors} />
      <VisionSlide colors={colors} />
      <ContactSlide colors={colors} />
    </div>
  );
}
