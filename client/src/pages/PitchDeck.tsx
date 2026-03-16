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
} from "lucide-react";

const SLIDE_COUNT = 10;

const COLORS = {
  bg: "#0d1117",
  bgLight: "#161b22",
  border: "#21262d",
  text: "#e6edf3",
  textMuted: "#8b949e",
  green: "#3fb950",
  greenDim: "rgba(63,185,80,0.15)",
  amber: "#d29922",
  amberDim: "rgba(210,153,34,0.15)",
  violet: "#a371f7",
  violetDim: "rgba(163,113,247,0.15)",
  accent: "#58a6ff",
};

function SlideNav({
  current,
  onJump,
}: {
  current: number;
  onJump: (i: number) => void;
}) {
  return (
    <div
      className="pitch-nav fixed right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-2"
      data-testid="pitch-nav"
    >
      <button
        onClick={() => onJump(Math.max(0, current - 1))}
        className="p-1 rounded-full hover:bg-white/10 transition-colors"
        aria-label="Previous slide"
        data-testid="pitch-nav-prev"
      >
        <ChevronUp className="w-4 h-4" style={{ color: COLORS.textMuted }} />
      </button>
      {Array.from({ length: SLIDE_COUNT }, (_, i) => (
        <button
          key={i}
          onClick={() => onJump(i)}
          className="group relative flex items-center justify-center"
          aria-label={`Go to slide ${i + 1}`}
          data-testid={`pitch-dot-${i}`}
        >
          <span
            className="block rounded-full transition-all duration-300"
            style={{
              width: current === i ? 10 : 6,
              height: current === i ? 10 : 6,
              background:
                current === i ? COLORS.green : "rgba(255,255,255,0.25)",
              boxShadow:
                current === i ? `0 0 8px ${COLORS.green}` : "none",
            }}
          />
          <span
            className="absolute right-6 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ background: COLORS.bgLight, color: COLORS.text }}
          >
            {i + 1}
          </span>
        </button>
      ))}
      <button
        onClick={() => onJump(Math.min(SLIDE_COUNT - 1, current + 1))}
        className="p-1 rounded-full hover:bg-white/10 transition-colors"
        aria-label="Next slide"
        data-testid="pitch-nav-next"
      >
        <ChevronDown className="w-4 h-4" style={{ color: COLORS.textMuted }} />
      </button>
    </div>
  );
}

function Slide({
  index,
  section,
  accent,
  children,
  className = "",
  noPadding = false,
}: {
  index: number;
  section: string;
  accent?: string;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}) {
  const accentColor = accent || COLORS.green;
  return (
    <section
      className={`pitch-slide relative w-full flex flex-col justify-center overflow-hidden ${className}`}
      style={{
        minHeight: "100vh",
        height: "100vh",
        background: COLORS.bg,
        scrollSnapAlign: "start",
      }}
      data-testid={`pitch-slide-${index}`}
    >
      <div
        className="absolute top-6 left-8 flex items-center gap-3"
        style={{ zIndex: 10 }}
      >
        <span
          className="text-xs font-mono font-bold tracking-wider"
          style={{ color: accentColor }}
        >
          {String(index).padStart(2, "0")}
        </span>
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: COLORS.textMuted }}
        >
          {section}
        </span>
      </div>

      <div
        className={`relative z-10 w-full max-w-6xl mx-auto ${noPadding ? "" : "px-8 sm:px-16 lg:px-24"}`}
        style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}
      >
        {children}
      </div>

      <div
        className="absolute bottom-4 left-0 right-0 flex items-center justify-between px-8"
        style={{ zIndex: 10 }}
      >
        <span
          className="text-xs font-semibold tracking-widest"
          style={{ color: "rgba(255,255,255,0.12)" }}
        >
          EDENRADAR
        </span>
        <span
          className="text-xs"
          style={{ color: "rgba(255,255,255,0.12)" }}
        >
          Confidential
        </span>
      </div>
    </section>
  );
}

function PortalCard({
  title,
  tagline,
  color,
  colorDim,
  icon: Icon,
  items,
}: {
  title: string;
  tagline: string;
  color: string;
  colorDim: string;
  icon: React.ElementType;
  items: string[];
}) {
  return (
    <div
      className="rounded-xl p-6 flex flex-col h-full"
      style={{
        background: colorDim,
        border: `1px solid ${color}33`,
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: `${color}22` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <h3 className="text-lg font-bold" style={{ color }}>
          {title}
        </h3>
      </div>
      <p
        className="text-sm mb-4"
        style={{ color: COLORS.textMuted }}
      >
        {tagline}
      </p>
      <ul className="space-y-2 mt-auto">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-start gap-2 text-sm"
            style={{ color: COLORS.text }}
          >
            <span style={{ color }} className="mt-0.5">
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatBox({
  value,
  label,
  icon: Icon,
  color,
}: {
  value: string;
  label: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col items-center text-center"
      style={{
        background: COLORS.bgLight,
        border: `1px solid ${COLORS.border}`,
      }}
    >
      <Icon className="w-6 h-6 mb-2" style={{ color }} />
      <span className="text-3xl font-bold" style={{ color }}>
        {value}
      </span>
      <span className="text-xs mt-1" style={{ color: COLORS.textMuted }}>
        {label}
      </span>
    </div>
  );
}

function CoverSlide() {
  return (
    <Slide index={1} section="Cover" accent={COLORS.green}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(63,185,80,0.08) 0%, transparent 70%)",
        }}
      />
      <div className="flex flex-col items-center text-center px-8">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mb-8"
          style={{
            background: COLORS.greenDim,
            border: `2px solid ${COLORS.green}44`,
          }}
        >
          <Radar className="w-10 h-10" style={{ color: COLORS.green }} />
        </div>
        <h1
          className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-4"
          style={{ color: COLORS.text }}
        >
          Eden
          <span style={{ color: COLORS.green }}>Radar</span>
        </h1>
        <p
          className="text-xl sm:text-2xl font-medium mb-2"
          style={{ color: COLORS.green }}
        >
          From Idea to Impact
        </p>
        <p
          className="text-base max-w-lg mt-4"
          style={{ color: COLORS.textMuted }}
        >
          AI-powered biotech asset intelligence connecting early-stage
          research with the industry partners who can advance it.
        </p>
        <div
          className="mt-10 flex items-center gap-6 text-xs"
          style={{ color: COLORS.textMuted }}
        >
          <span>Founded 2024</span>
          <span
            className="w-1 h-1 rounded-full"
            style={{ background: COLORS.green }}
          />
          <span>Pre-Seed</span>
          <span
            className="w-1 h-1 rounded-full"
            style={{ background: COLORS.green }}
          />
          <span>edenradar.com</span>
        </div>
      </div>
    </Slide>
  );
}

function ProblemSlide() {
  const problems = [
    {
      icon: AlertTriangle,
      title: "Innovation Gets Lost",
      desc: "Breakthrough concepts die in university labs because there's no pathway from idea to industry attention.",
    },
    {
      icon: Search,
      title: "Discovery Starts Too Late",
      desc: "Industry tools begin at patent stage. By then, the best assets are locked in exclusive deals or undiscovered entirely.",
    },
    {
      icon: Layers,
      title: "Fragmented Pipeline",
      desc: "Researchers, TTOs, and industry teams use disconnected systems. There is no shared intelligence layer.",
    },
  ];

  return (
    <Slide index={2} section="The Problem" accent="#f85149">
      <h2
        className="text-3xl sm:text-4xl font-bold mb-3"
        style={{ color: COLORS.text }}
      >
        The drug discovery pipeline is{" "}
        <span style={{ color: "#f85149" }}>broken</span>.
      </h2>
      <p
        className="text-base mb-10 max-w-2xl"
        style={{ color: COLORS.textMuted }}
      >
        $2.6B average cost to bring a drug to market. Most innovations never
        get the chance — not because the science fails, but because the
        connections never happen.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {problems.map((p) => (
          <div
            key={p.title}
            className="rounded-xl p-6"
            style={{
              background: COLORS.bgLight,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <p.icon
              className="w-8 h-8 mb-4"
              style={{ color: "#f85149" }}
            />
            <h3
              className="text-base font-bold mb-2"
              style={{ color: COLORS.text }}
            >
              {p.title}
            </h3>
            <p className="text-sm" style={{ color: COLORS.textMuted }}>
              {p.desc}
            </p>
          </div>
        ))}
      </div>
    </Slide>
  );
}

function SolutionSlide() {
  return (
    <Slide index={3} section="Our Solution" accent={COLORS.green}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 30% 60%, rgba(63,185,80,0.06) 0%, transparent 60%)",
        }}
      />
      <h2
        className="text-3xl sm:text-4xl font-bold mb-4"
        style={{ color: COLORS.text }}
      >
        One platform captures the{" "}
        <span style={{ color: COLORS.green }}>full lifecycle</span>.
      </h2>
      <p
        className="text-base mb-10 max-w-2xl"
        style={{ color: COLORS.textMuted }}
      >
        EdenRadar is the first platform to connect pre-research concepts,
        active research projects, and commercial-stage biotech assets in a
        single AI-powered intelligence layer.
      </p>

      <div className="flex flex-col sm:flex-row items-stretch gap-4">
        {[
          {
            label: "Concept",
            color: COLORS.amber,
            desc: "Early-stage ideas scored for scientific credibility",
          },
          {
            label: "Research",
            color: COLORS.violet,
            desc: "Structured projects with literature + grant discovery",
          },
          {
            label: "Commercialization",
            color: COLORS.green,
            desc: "AI-enriched asset dossiers from 205 TTO sources",
          },
        ].map((stage, i) => (
          <div key={stage.label} className="flex items-center gap-4 flex-1">
            <div
              className="rounded-xl p-5 flex-1"
              style={{
                background: COLORS.bgLight,
                border: `1px solid ${stage.color}33`,
              }}
            >
              <span
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: stage.color }}
              >
                {stage.label}
              </span>
              <p
                className="text-sm mt-2"
                style={{ color: COLORS.text }}
              >
                {stage.desc}
              </p>
            </div>
            {i < 2 && (
              <ArrowRight
                className="w-5 h-5 shrink-0 hidden sm:block"
                style={{ color: COLORS.textMuted }}
              />
            )}
          </div>
        ))}
      </div>

      <p
        className="text-sm mt-8 text-center font-medium"
        style={{ color: COLORS.green }}
      >
        Three portals. One ecosystem. Continuous intelligence.
      </p>
    </Slide>
  );
}

function PortalsSlide() {
  return (
    <Slide index={4} section="The Three Portals" accent={COLORS.green}>
      <h2
        className="text-3xl sm:text-4xl font-bold mb-8 text-center"
        style={{ color: COLORS.text }}
      >
        Three portals, one{" "}
        <span style={{ color: COLORS.green }}>ecosystem</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_1fr] gap-3 items-stretch">
        <PortalCard
          title="EdenDiscovery"
          tagline="Tier 1 — Pre-research concept registry"
          color={COLORS.amber}
          colorDim={COLORS.amberDim}
          icon={Lightbulb}
          items={[
            "Submit hypotheses before research begins",
            "AI credibility scoring (0-100)",
            "Get discovered by collaborators & funders",
            "Landscape intelligence from PubMed + bioRxiv",
          ]}
        />
        <div className="hidden sm:flex items-center justify-center">
          <div className="flex flex-col items-center gap-1">
            <ArrowRight className="w-6 h-6" style={{ color: COLORS.textMuted }} />
            <span className="text-xs" style={{ color: COLORS.textMuted }}>Graduate</span>
          </div>
        </div>
        <PortalCard
          title="EdenLab"
          tagline="Tier 2 — Researcher workspace"
          color={COLORS.violet}
          colorDim={COLORS.violetDim}
          icon={FlaskConical}
          items={[
            "Literature search across 32 sources",
            "AI synthesis & evidence extraction",
            "Structured 11-section project canvas",
            "Grant discovery (NIH, NSF, SBIR)",
          ]}
        />
        <div className="hidden sm:flex items-center justify-center">
          <div className="flex flex-col items-center gap-1">
            <ArrowRight className="w-6 h-6" style={{ color: COLORS.textMuted }} />
            <span className="text-xs" style={{ color: COLORS.textMuted }}>Publish</span>
          </div>
        </div>
        <PortalCard
          title="EdenRadar"
          tagline="Tier 3 — Industry intelligence"
          color={COLORS.green}
          colorDim={COLORS.greenDim}
          icon={Radar}
          items={[
            "205 TTO institutions monitored",
            "AI-scored asset dossiers",
            "Competing asset analysis",
            "Convergence signals & taxonomy",
          ]}
        />
      </div>
    </Slide>
  );
}

function DiscoverySlide() {
  return (
    <Slide index={5} section="EdenDiscovery" accent={COLORS.amber}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 70% 40%, rgba(210,153,34,0.06) 0%, transparent 60%)",
        }}
      />
      <div className="flex items-start gap-4 mb-6">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: COLORS.amberDim }}
        >
          <Lightbulb className="w-6 h-6" style={{ color: COLORS.amber }} />
        </div>
        <div>
          <h2
            className="text-3xl sm:text-4xl font-bold"
            style={{ color: COLORS.text }}
          >
            Eden<span style={{ color: COLORS.amber }}>Discovery</span>
          </h2>
          <p className="text-sm mt-1" style={{ color: COLORS.textMuted }}>
            Tier 1 — Pre-research concept registry
          </p>
        </div>
      </div>
      <p
        className="text-base mb-8 max-w-2xl"
        style={{ color: COLORS.textMuted }}
      >
        The world's first platform for pre-research biotech concepts.
        Scientists submit a hypothesis, receive AI credibility scoring, and
        get discovered by collaborators and funders — all before formal
        research begins.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Sparkles, label: "AI Credibility Scoring", desc: "0-100 scale, instant evaluation" },
          { icon: Target, label: "Landscape Intelligence", desc: "PubMed + bioRxiv literature scan" },
          { icon: Users, label: "Interest Signals", desc: "Collaboration, funding, advisory" },
          { icon: Globe, label: "Public Feed", desc: "No login required to browse" },
        ].map((f) => (
          <div
            key={f.label}
            className="rounded-lg p-4"
            style={{
              background: COLORS.bgLight,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <f.icon className="w-5 h-5 mb-2" style={{ color: COLORS.amber }} />
            <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
              {f.label}
            </p>
            <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>
              {f.desc}
            </p>
          </div>
        ))}
      </div>
    </Slide>
  );
}

function LabSlide() {
  return (
    <Slide index={6} section="EdenLab" accent={COLORS.violet}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 30% 50%, rgba(163,113,247,0.06) 0%, transparent 60%)",
        }}
      />
      <div className="flex items-start gap-4 mb-6">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: COLORS.violetDim }}
        >
          <FlaskConical className="w-6 h-6" style={{ color: COLORS.violet }} />
        </div>
        <div>
          <h2
            className="text-3xl sm:text-4xl font-bold"
            style={{ color: COLORS.text }}
          >
            Eden<span style={{ color: COLORS.violet }}>Lab</span>
          </h2>
          <p className="text-sm mt-1" style={{ color: COLORS.textMuted }}>
            Tier 2 — Researcher workspace
          </p>
        </div>
      </div>
      <p
        className="text-base mb-8 max-w-2xl"
        style={{ color: COLORS.textMuted }}
      >
        A structured research workspace that takes scientists from
        literature review to publication. AI-powered search across 32 data
        sources, evidence extraction, grant discovery, and direct visibility
        to industry partners.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: BookOpen, label: "32 Data Sources", desc: "PubMed, bioRxiv, clinical trials, patents" },
          { icon: Brain, label: "AI Synthesis", desc: "Structured summaries & key findings" },
          { icon: Award, label: "Grant Discovery", desc: "NIH, NSF, SBIR matched to profile" },
          { icon: TrendingUp, label: "Publish to Industry", desc: "Scored signals reach BD teams" },
        ].map((f) => (
          <div
            key={f.label}
            className="rounded-lg p-4"
            style={{
              background: COLORS.bgLight,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <f.icon className="w-5 h-5 mb-2" style={{ color: COLORS.violet }} />
            <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
              {f.label}
            </p>
            <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>
              {f.desc}
            </p>
          </div>
        ))}
      </div>
    </Slide>
  );
}

function RadarSlide() {
  return (
    <Slide index={7} section="EdenRadar" accent={COLORS.green}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 60% 40%, rgba(63,185,80,0.06) 0%, transparent 60%)",
        }}
      />
      <div className="flex items-start gap-4 mb-6">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: COLORS.greenDim }}
        >
          <Radar className="w-6 h-6" style={{ color: COLORS.green }} />
        </div>
        <div>
          <h2
            className="text-3xl sm:text-4xl font-bold"
            style={{ color: COLORS.text }}
          >
            Eden<span style={{ color: COLORS.green }}>Radar</span>
          </h2>
          <p className="text-sm mt-1" style={{ color: COLORS.textMuted }}>
            Tier 3 — Industry intelligence
          </p>
        </div>
      </div>
      <p
        className="text-base mb-8 max-w-2xl"
        style={{ color: COLORS.textMuted }}
      >
        The industry-facing intelligence layer. EdenRadar continuously
        monitors 205 technology transfer offices, ingests new biotech
        listings, and enriches them with AI-powered classification, scoring,
        and supporting literature — creating portfolio-grade asset dossiers.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Building2, label: "205 Institutions", desc: "Monitored with automated scrapers" },
          { icon: FileBarChart2, label: "Asset Dossiers", desc: "AI-enriched with full-text analysis" },
          { icon: Microscope, label: "Competing Assets", desc: "Cross-reference by target & area" },
          { icon: TrendingUp, label: "Convergence Signals", desc: "Hot areas with rising activity" },
        ].map((f) => (
          <div
            key={f.label}
            className="rounded-lg p-4"
            style={{
              background: COLORS.bgLight,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <f.icon className="w-5 h-5 mb-2" style={{ color: COLORS.green }} />
            <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
              {f.label}
            </p>
            <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>
              {f.desc}
            </p>
          </div>
        ))}
      </div>
    </Slide>
  );
}

function TractionSlide() {
  return (
    <Slide index={8} section="What We've Built" accent={COLORS.green}>
      <h2
        className="text-3xl sm:text-4xl font-bold mb-3"
        style={{ color: COLORS.text }}
      >
        Real product,{" "}
        <span style={{ color: COLORS.green }}>real traction</span>
      </h2>
      <p
        className="text-base mb-10 max-w-2xl"
        style={{ color: COLORS.textMuted }}
      >
        This is not a pitch for a product we plan to build. EdenRadar is
        live, deployed, and processing real biotech data today.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatBox value="205" label="TTO Institutions Scraped" icon={Building2} color={COLORS.green} />
        <StatBox value="32" label="Research Data Sources" icon={Database} color={COLORS.violet} />
        <StatBox value="3" label="Distinct Portals Live" icon={Layers} color={COLORS.amber} />
        <StatBox value="AI" label="Classifier + Enrichment" icon={Brain} color={COLORS.green} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Server, label: "Production Deploy", desc: "Supabase + PostgreSQL" },
          { icon: Shield, label: "Role-Based Auth", desc: "Three auth tiers" },
          { icon: Beaker, label: "AI Pipeline", desc: "Classify, score, enrich, synthesize" },
          { icon: Globe, label: "Live Platform", desc: "edenradar.com" },
        ].map((f) => (
          <div
            key={f.label}
            className="rounded-lg p-4"
            style={{
              background: COLORS.bgLight,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <f.icon className="w-5 h-5 mb-2" style={{ color: COLORS.green }} />
            <p className="text-sm font-semibold" style={{ color: COLORS.text }}>
              {f.label}
            </p>
            <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>
              {f.desc}
            </p>
          </div>
        ))}
      </div>
    </Slide>
  );
}

function VisionSlide() {
  return (
    <Slide index={9} section="The Vision" accent={COLORS.green}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(63,185,80,0.08) 0%, transparent 60%)",
        }}
      />
      <div className="flex flex-col items-center text-center px-8">
        <blockquote
          className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-snug max-w-4xl mb-12"
          style={{ color: COLORS.text }}
        >
          "We accelerate pharmaceutical innovation by capturing early-stage
          research and creating seamless connections between scientists and
          the industry partners who can advance it."
        </blockquote>

        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6">
          {[
            { label: "Concept", color: COLORS.amber },
            { label: "Research", color: COLORS.violet },
            { label: "Industry", color: COLORS.green },
          ].map((s, i) => (
            <div key={s.label} className="flex items-center gap-3 sm:gap-6">
              <div
                className="flex items-center gap-2 px-5 py-2.5 rounded-full"
                style={{
                  background: `${s.color}22`,
                  border: `1px solid ${s.color}44`,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: s.color }}
                />
                <span
                  className="text-sm font-semibold"
                  style={{ color: s.color }}
                >
                  {s.label}
                </span>
              </div>
              {i < 2 && (
                <ArrowRight
                  className="w-4 h-4 hidden sm:block"
                  style={{ color: COLORS.textMuted }}
                />
              )}
            </div>
          ))}
        </div>

        <p
          className="text-sm mt-10 max-w-xl"
          style={{ color: COLORS.textMuted }}
        >
          EdenRadar is building the connective tissue between biotech
          discovery and commercialization — an intelligence layer that
          makes the entire pipeline visible, searchable, and actionable.
        </p>
      </div>
    </Slide>
  );
}

function ContactSlide() {
  return (
    <Slide index={10} section="Contact" accent={COLORS.green}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 60%, rgba(63,185,80,0.06) 0%, transparent 60%)",
        }}
      />
      <div className="flex flex-col items-center text-center px-8">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
          style={{
            background: COLORS.greenDim,
            border: `2px solid ${COLORS.green}44`,
          }}
        >
          <Radar className="w-8 h-8" style={{ color: COLORS.green }} />
        </div>
        <h2
          className="text-3xl sm:text-4xl font-bold mb-2"
          style={{ color: COLORS.text }}
        >
          Let's build the future of{" "}
          <span style={{ color: COLORS.green }}>biotech intelligence</span>
        </h2>
        <p
          className="text-base mb-10 max-w-lg"
          style={{ color: COLORS.textMuted }}
        >
          We're looking for co-founders, advisors, and early partners who
          believe the drug discovery pipeline should start earlier and move
          faster.
        </p>

        <a
          href="https://edenradar.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-base font-semibold transition-all hover:scale-105"
          style={{
            background: COLORS.green,
            color: COLORS.bg,
          }}
          data-testid="pitch-cta-request-access"
        >
          Request Access
          <ExternalLink className="w-4 h-4" />
        </a>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-8 text-left max-w-md">
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: COLORS.text }}>
              Ariel Boucheikhchoukh
            </p>
            <p className="text-xs" style={{ color: COLORS.textMuted }}>
              Founder & CEO
            </p>
            <p className="text-xs mt-1" style={{ color: COLORS.accent }}>
              ariel@edenradar.com
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: COLORS.text }}>
              EdenRadar
            </p>
            <p className="text-xs" style={{ color: COLORS.textMuted }}>
              edenradar.com
            </p>
            <p className="text-xs mt-1" style={{ color: COLORS.accent }}>
              hello@edenradar.com
            </p>
          </div>
        </div>
      </div>
    </Slide>
  );
}

export default function PitchDeck() {
  const [current, setCurrent] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isPrint =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("print");

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
    container.scrollTo({
      top: i * container.clientHeight,
      behavior: "smooth",
    });
  };

  return (
    <div
      ref={containerRef}
      className={`pitch-deck ${isPrint ? "pitch-print" : ""}`}
      style={{
        height: "100vh",
        overflowY: "auto",
        scrollSnapType: isPrint ? "none" : "y mandatory",
        scrollBehavior: "smooth",
      }}
      data-testid="pitch-deck"
    >
      {!isPrint && <SlideNav current={current} onJump={jumpTo} />}

      {!isPrint && (
        <button
          onClick={() => window.print()}
          className="pitch-export fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105"
          style={{
            background: COLORS.bgLight,
            color: COLORS.text,
            border: `1px solid ${COLORS.border}`,
          }}
          data-testid="pitch-export-pdf"
        >
          <Printer className="w-4 h-4" />
          Export PDF
        </button>
      )}

      <CoverSlide />
      <ProblemSlide />
      <SolutionSlide />
      <PortalsSlide />
      <DiscoverySlide />
      <LabSlide />
      <RadarSlide />
      <TractionSlide />
      <VisionSlide />
      <ContactSlide />
    </div>
  );
}
