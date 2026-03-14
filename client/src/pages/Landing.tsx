import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Nav } from "@/components/Nav";
import { useAuth } from "@/hooks/use-auth";
import {
  Building2,
  FlaskConical,
  TrendingUp,
  GitMerge,
  FileBarChart2,
  Users,
  Layers,
  Eye,
  BookOpen,
  Award,
  ArrowRight,
  Zap,
} from "lucide-react";

/* ─────────────────────────── helpers ─────────────────────────── */

function useReveal(threshold = 0.18) {
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

/* ─────────────────────────── RadarBackground ─────────────────── */

function RadarBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: "min(75vw, 700px)",
          height: "min(75vw, 700px)",
          animation: "radar-bg-slow 18s linear infinite",
          transformOrigin: "center center",
          background:
            "conic-gradient(from 0deg, transparent 260deg, hsl(142 65% 48% / 0.05) 310deg, hsl(142 65% 48% / 0.22) 360deg)",
          borderRadius: "50%",
        }}
      />
      {[220, 360, 480, 600].map((r, i) => (
        <div
          key={r}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{
            width: r,
            height: r,
            borderColor: `hsl(142 55% 45% / ${0.08 - i * 0.012})`,
          }}
        />
      ))}
      <div
        className="absolute left-1/2 top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "hsl(142 65% 55%)", animation: "pulse-ring 3s ease-out infinite", opacity: 0 }}
      />
    </div>
  );
}

/* ─────────────────── Mycelium Root Network (Framer Motion) ──── */

const P_DUR = 3;
const S_DUR = 2.2;
const T_DUR = 1.6;

interface Strand { d: string; sw: number; so: number; delay: number; dur: number; color: string }
interface NodeDot { cx: number; cy: number; r: number; delay: number }

const STRANDS: Strand[] = [
  { d: "M 20 395 C 18 365, 22 330, 30 300 C 35 278, 40 252, 42 225",                        sw: 1.8, so: 0.65, delay: 0,    dur: P_DUR, color: "hsl(142 62% 50%)" },
  { d: "M 20 395 C 28 360, 45 325, 65 295 C 78 275, 85 250, 85 218",                        sw: 1.8, so: 0.65, delay: 0.8,  dur: P_DUR, color: "hsl(142 60% 48%)" },
  { d: "M 20 395 C 40 370, 70 340, 105 310 C 128 292, 155 268, 175 240",                     sw: 1.8, so: 0.62, delay: 1.6,  dur: P_DUR, color: "hsl(148 58% 46%)" },
  { d: "M 20 395 C 50 383, 95 368, 140 348 C 170 335, 205 315, 235 288",                     sw: 1.8, so: 0.58, delay: 2.4,  dur: P_DUR, color: "hsl(155 55% 45%)" },
  { d: "M 30 300 C 22 282, 15 262, 12 240",      sw: 1.2, so: 0.55, delay: 1.8,  dur: S_DUR, color: "hsl(142 60% 50%)" },
  { d: "M 30 300 C 42 285, 55 268, 62 248",      sw: 1.2, so: 0.55, delay: 1.8,  dur: S_DUR, color: "hsl(142 62% 48%)" },
  { d: "M 65 295 C 55 278, 48 258, 45 238",      sw: 1.2, so: 0.52, delay: 2.6,  dur: S_DUR, color: "hsl(148 58% 48%)" },
  { d: "M 65 295 C 80 282, 100 265, 112 248",    sw: 1.2, so: 0.52, delay: 2.6,  dur: S_DUR, color: "hsl(148 60% 46%)" },
  { d: "M 105 310 C 98 295, 88 278, 82 258",     sw: 1.2, so: 0.50, delay: 3.4,  dur: S_DUR, color: "hsl(148 58% 46%)" },
  { d: "M 105 310 C 120 298, 138 280, 150 262",  sw: 1.2, so: 0.50, delay: 3.4,  dur: S_DUR, color: "hsl(155 55% 45%)" },
  { d: "M 140 348 C 135 332, 128 315, 125 295",  sw: 1.2, so: 0.48, delay: 4.2,  dur: S_DUR, color: "hsl(155 55% 45%)" },
  { d: "M 140 348 C 160 338, 182 322, 200 305",  sw: 1.2, so: 0.48, delay: 4.2,  dur: S_DUR, color: "hsl(155 52% 44%)" },
  { d: "M 62 248 C 68 238, 75 228, 78 215",      sw: 0.8, so: 0.42, delay: 3.12, dur: T_DUR, color: "hsl(142 60% 50%)" },
  { d: "M 112 248 C 118 238, 125 228, 130 215",  sw: 0.8, so: 0.42, delay: 3.92, dur: T_DUR, color: "hsl(148 58% 48%)" },
  { d: "M 150 262 C 158 252, 165 240, 168 225",  sw: 0.8, so: 0.40, delay: 4.72, dur: T_DUR, color: "hsl(155 55% 45%)" },
];

const NODES: NodeDot[] = [
  { cx: 20,  cy: 395, r: 3.5, delay: 0.1 },
  { cx: 30,  cy: 300, r: 3.0, delay: 1.7 },
  { cx: 65,  cy: 295, r: 3.0, delay: 2.5 },
  { cx: 105, cy: 310, r: 3.0, delay: 3.3 },
  { cx: 140, cy: 348, r: 3.0, delay: 4.1 },
  { cx: 42,  cy: 225, r: 3.2, delay: 3.15 },
  { cx: 85,  cy: 218, r: 3.2, delay: 3.95 },
  { cx: 175, cy: 240, r: 3.2, delay: 4.75 },
  { cx: 235, cy: 288, r: 3.2, delay: 5.55 },
  { cx: 12,  cy: 240, r: 2.8, delay: 4.15 },
  { cx: 62,  cy: 248, r: 2.8, delay: 4.15 },
  { cx: 45,  cy: 238, r: 2.8, delay: 4.95 },
  { cx: 112, cy: 248, r: 2.8, delay: 4.95 },
  { cx: 82,  cy: 258, r: 2.8, delay: 5.75 },
  { cx: 150, cy: 262, r: 2.8, delay: 5.75 },
  { cx: 125, cy: 295, r: 2.8, delay: 6.55 },
  { cx: 200, cy: 305, r: 2.8, delay: 6.55 },
  { cx: 78,  cy: 215, r: 2.5, delay: 4.87 },
  { cx: 130, cy: 215, r: 2.5, delay: 5.67 },
  { cx: 168, cy: 225, r: 2.5, delay: 6.47 },
];

function HeroVine() {
  return (
    <div
      className="absolute bottom-0 left-0 pointer-events-none select-none hidden sm:block"
      style={{ width: 280, height: 400, zIndex: 1 }}
      aria-hidden
    >
      <svg
        viewBox="0 0 280 420"
        preserveAspectRatio="xMinYMax meet"
        className="w-full h-full"
        style={{ overflow: "visible" }}
      >
        <defs>
          <radialGradient id="leafGrad2" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="hsl(142 80% 72%)" stopOpacity="1" />
            <stop offset="55%"  stopColor="hsl(142 68% 52%)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="hsl(142 55% 38%)" stopOpacity="0.45" />
          </radialGradient>
          <filter id="strandGlow">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="nodeGlow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {STRANDS.map((s, i) => (
          <motion.path
            key={`s-${i}`}
            d={s.d}
            fill="none"
            stroke={s.color}
            strokeWidth={s.sw}
            strokeOpacity={s.so}
            strokeLinecap="round"
            filter="url(#strandGlow)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: s.delay, duration: s.dur, ease: "easeInOut" }}
          />
        ))}

        {NODES.map((n, i) => (
          <motion.circle
            key={`n-${i}`}
            cx={n.cx}
            cy={n.cy}
            r={n.r}
            fill="url(#leafGrad2)"
            filter="url(#nodeGlow)"
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              delay: n.delay,
              duration: 0.5,
              type: "spring",
              stiffness: 180,
              damping: 14,
            }}
          />
        ))}
      </svg>
    </div>
  );
}

/* ─────────────────────────── FloatingParticles ───────────────── */

const PARTICLES = [
  { x: "12%", y: "18%", size: 3, delay: "0s",    dur: "6s" },
  { x: "78%", y: "12%", size: 2, delay: "1.4s",  dur: "7.5s" },
  { x: "88%", y: "55%", size: 2.5, delay: "2.8s", dur: "5.5s" },
  { x: "65%", y: "82%", size: 2, delay: "0.7s",  dur: "8s" },
  { x: "22%", y: "72%", size: 3, delay: "3.2s",  dur: "6.5s" },
  { x: "48%", y: "8%",  size: 2, delay: "1.8s",  dur: "7s" },
  { x: "92%", y: "28%", size: 1.5, delay: "4s",  dur: "9s" },
  { x: "35%", y: "90%", size: 2.5, delay: "2s",  dur: "6s" },
];

function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: p.x,
            top: p.y,
            width: p.size * 2,
            height: p.size * 2,
            background: "hsl(142 65% 55%)",
            animation: `particle-drift ${p.dur} ease-in-out ${p.delay} infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────── PortalToggle ────────────────────── */

const INDUSTRY_TILES = [
  {
    icon: TrendingUp,
    title: "Market Intelligence",
    desc: "AI-scanned signals from 150+ TTOs, patent filings, and live academic publications, structured and scored.",
  },
  {
    icon: GitMerge,
    title: "Early-Stage Deal Flow",
    desc: "Surface pre-clinical and discovery-phase assets before they hit the market with enriched target, modality, and stage data.",
  },
  {
    icon: FileBarChart2,
    title: "World-Class Reporting",
    desc: "Portfolio-grade dossiers, pipeline CSVs, and scored asset breakdowns ready for BD and board-level review.",
  },
  {
    icon: Users,
    title: "Research Team Access",
    desc: "Connect directly with university researchers behind the science to build relationships that convert into real pipeline.",
  },
];

const RESEARCH_TILES = [
  {
    icon: Layers,
    title: "Structured Project Workspace",
    desc: "An 11-section project canvas guiding your work from hypothesis through publication. Organized, versioned, and shareable.",
  },
  {
    icon: Eye,
    title: "Visibility to Industry",
    desc: "Your research surfaces as scored asset signals to industry teams actively seeking your areas of expertise.",
  },
  {
    icon: BookOpen,
    title: "AI Literature Review",
    desc: "Query millions of papers and receive AI-structured summaries, key findings, and citation-ready insights.",
  },
  {
    icon: Award,
    title: "Grants Discovery",
    desc: "Track NIH, NSF, SBIR, and foundation grant opportunities matched to your research profile in real time.",
  },
];

function PortalToggle({ onLogin }: { onLogin: () => void }) {
  const [active, setActive] = useState<"industry" | "research">("industry");
  const ref = useReveal();

  const tiles = active === "industry" ? INDUSTRY_TILES : RESEARCH_TILES;

  return (
    <section ref={ref} className="reveal-section max-w-screen-xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
      <div className="text-center mb-10 sm:mb-14">
        <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-4">
          Built for Both Sides
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 leading-tight">
          One platform. Two powerful portals.
        </h2>
        <p className="text-muted-foreground max-w-lg mx-auto text-base">
          Whether you're sourcing pipeline or building science, EdenRadar is engineered for you.
        </p>

        <div className="inline-flex items-center mt-8 p-1 rounded-full border border-border bg-card shadow-sm">
          {(["industry", "research"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              data-testid={`toggle-${tab}`}
              className="relative px-5 sm:px-8 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 min-h-[44px]"
              style={
                active === tab
                  ? {
                      background: "hsl(var(--primary))",
                      color: "hsl(var(--primary-foreground))",
                      boxShadow: "0 2px 12px hsl(142 52% 36% / 0.35)",
                    }
                  : { color: "hsl(var(--muted-foreground))" }
              }
            >
              {tab === "industry" ? "Industry Intelligence" : "Research Portal"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6" key={active}>
        {tiles.map((tile, i) => (
          <div
            key={tile.title}
            className="group flex gap-4 p-5 sm:p-6 rounded-xl border border-border bg-card hover:border-primary/40 transition-all duration-200 hover:shadow-md"
            style={{ animationDelay: `${i * 80}ms`, animation: "fade-up 0.5s ease-out forwards" }}
            data-testid={`tile-${active}-${i}`}
          >
            <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors duration-200">
              <tile.icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1.5 text-sm sm:text-base">{tile.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{tile.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center mt-10">
        <button
          onClick={onLogin}
          className="text-sm text-primary hover:text-primary/80 font-medium transition-colors duration-150 flex items-center gap-1 mx-auto"
          data-testid="button-toggle-cta"
        >
          Explore the {active === "industry" ? "Industry" : "Research"} portal
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </section>
  );
}

/* ─────────────────────────── BottomCTA ──────────────────────── */

function BottomCTA({ onLogin }: { onLogin: () => void }) {
  const ref = useReveal();
  return (
    <section
      ref={ref}
      className="reveal-section relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, hsl(222 47% 7%) 0%, hsl(142 45% 10%) 60%, hsl(155 40% 12%) 100%)",
      }}
    >
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background:
              "conic-gradient(from 200deg at 80% 50%, transparent 0deg, hsl(142 65% 48% / 0.06) 60deg, transparent 120deg)",
          }}
        />
        <div className="absolute bottom-0 right-0 w-64 h-64 opacity-20" style={{ pointerEvents: "none" }}>
          <svg viewBox="0 0 200 400" className="w-full h-full" aria-hidden>
            <defs>
              <linearGradient id="ctaVineGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="hsl(142 65% 52%)" stopOpacity="0" />
                <stop offset="100%" stopColor="hsl(142 65% 52%)" stopOpacity="0.8" />
              </linearGradient>
            </defs>
            <path
              d="M 100 400 C 80 340, 120 280, 100 220 C 80 160, 120 100, 100 40"
              fill="none" stroke="url(#ctaVineGrad)" strokeWidth="2"
            />
            {[380, 310, 240, 170, 100, 50].map((y, i) => (
              <circle key={y} cx={100} cy={y} r={i % 2 === 0 ? 5 : 4}
                fill="hsl(142 65% 55%)" fillOpacity={0.5 - i * 0.05} />
            ))}
          </svg>
        </div>
      </div>

      <div className="relative max-w-screen-xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6"
          style={{ background: "hsl(142 52% 36% / 0.2)", border: "1px solid hsl(142 52% 36% / 0.35)" }}
        >
          <Zap className="w-3.5 h-3.5" style={{ color: "hsl(142 65% 60%)" }} />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "hsl(142 65% 60%)" }}>
            Join EdenRadar Today
          </span>
        </div>

        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-5 leading-tight text-white">
          Get started with{" "}
          <span style={{
            background: "linear-gradient(135deg, hsl(142 70% 62%) 0%, hsl(155 65% 58%) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            EdenRadar
          </span>{" "}
          today.
        </h2>
        <p className="text-base sm:text-lg mb-10 max-w-xl mx-auto leading-relaxed" style={{ color: "hsl(210 15% 70%)" }}>
          The platform where world-class university research meets the industry teams ready to build the next breakthrough therapy.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            size="lg"
            onClick={onLogin}
            data-testid="cta-bottom-industry"
            className="w-full sm:w-auto h-12 px-7 font-semibold text-base gap-2"
            style={{
              background: "hsl(142 52% 36%)",
              color: "white",
              border: "none",
            }}
          >
            <Building2 className="w-4 h-4" />
            For Industry
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={onLogin}
            data-testid="cta-bottom-research"
            className="w-full sm:w-auto h-12 px-7 font-semibold text-base gap-2"
            style={{
              borderColor: "hsl(142 52% 36% / 0.5)",
              color: "hsl(142 65% 62%)",
              background: "transparent",
            }}
          >
            <FlaskConical className="w-4 h-4" />
            For Researchers
          </Button>
        </div>

        <p className="mt-6 text-xs" style={{ color: "hsl(210 15% 45%)" }}>
          Both portals share the same secure login. Choose your path once you're in.
        </p>
      </div>
    </section>
  );
}

/* ─────────────────────────── Main Landing ────────────────────── */

const STATS = [
  { value: "150+",   label: "Tech Transfer Offices" },
  { value: "10M+",   label: "Papers Indexed" },
  { value: "AI",     label: "Enriched Signals" },
  { value: "2-Sided", label: "Ecosystem" },
];

export default function Landing() {
  const [, navigate] = useLocation();
  const { session, role, loading } = useAuth();
  const statsRef = useReveal();

  useEffect(() => {
    if (!loading && session && role) {
      const dest = role === "industry" ? "/scout" : "/research";
      navigate(dest, { replace: true });
    }
  }, [loading, session, role, navigate]);

  if (!loading && session && role) return null;

  function handleLogin() { navigate("/login"); }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Nav />

      <main className="flex-1">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden" style={{ minHeight: "92vh" }}>
          <RadarBackground />
          <FloatingParticles />
          <HeroVine />

          <div
            className="absolute inset-0 pointer-events-none"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse at 70% 0%, hsl(142 52% 36% / 0.06) 0%, transparent 55%)",
            }}
          />

          <div className="relative z-10 max-w-screen-xl mx-auto px-4 sm:px-6 flex flex-col items-center justify-center text-center"
            style={{ minHeight: "92vh", paddingTop: "6rem", paddingBottom: "5rem" }}>

            <div
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/30 bg-primary/5 mb-8"
            >
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary tracking-widest uppercase">
                AI-Powered Biotech Asset Matchmaking
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight leading-[1.06] mb-6 max-w-4xl">
              <span className="text-foreground">Where Biotech Research</span>
              <br />
              <span className="gradient-text dark:gradient-text gradient-text-light">
                Meets Industry Intelligence.
              </span>
            </h1>

            <p className="text-base sm:text-lg lg:text-xl text-muted-foreground max-w-2xl leading-relaxed mb-10">
              EdenRadar connects world-class university innovations with the industry teams building tomorrow's therapies, powered by AI that reads the science so you don't have to.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full max-w-sm sm:max-w-none sm:w-auto">
              <Button
                size="lg"
                onClick={handleLogin}
                data-testid="button-cta-industry"
                className="w-full sm:w-auto h-12 px-7 text-base font-semibold gap-2 shadow-lg"
              >
                <Building2 className="w-4 h-4" />
                For Industry
                <ArrowRight className="w-3.5 h-3.5 opacity-70" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={handleLogin}
                data-testid="button-cta-research"
                className="w-full sm:w-auto h-12 px-7 text-base font-semibold gap-2 border-primary/40 hover:border-primary/70 hover:bg-primary/5 text-primary"
              >
                <FlaskConical className="w-4 h-4" />
                For Researchers
                <ArrowRight className="w-3.5 h-3.5 opacity-70" />
              </Button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Both portals share the same secure login. Choose your path once you're in.
            </p>

            <div
              ref={statsRef}
              className="reveal-section mt-16 sm:mt-20 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-10"
            >
              {STATS.map((s) => (
                <div key={s.label} className="text-center" data-testid={`stat-${s.label.replace(/\s+/g, "-").toLowerCase()}`}>
                  <div className="text-2xl sm:text-3xl font-bold gradient-text dark:gradient-text gradient-text-light mb-1">
                    {s.value}
                  </div>
                  <div className="text-xs text-muted-foreground tracking-wide">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent, hsl(var(--background)))" }}
          />
        </section>

        {/* ── What we do strip ── */}
        <section className="border-y border-border bg-card/50">
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-10">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center sm:text-left">
              {[
                {
                  icon: TrendingUp,
                  title: "Discover before the crowd",
                  desc: "Surface pre-clinical assets from 150+ tech transfer offices the moment they're published, enriched by AI with target, modality, and stage.",
                },
                {
                  icon: Layers,
                  title: "Structure your science",
                  desc: "EdenLab gives researchers an 11-section project workspace, grants tracker, and literature review tool, all in one place.",
                },
                {
                  icon: Users,
                  title: "Close the loop",
                  desc: "Industry teams connect directly with research leads. Researchers gain visibility. The gap between lab and pipeline disappears.",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4"
                  data-testid={`feature-strip-${f.title.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                    <f.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm mb-1">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Toggle value section ── */}
        <PortalToggle onLogin={handleLogin} />

        {/* ── Bottom CTA ── */}
        <BottomCTA onLogin={handleLogin} />
      </main>

      <footer className="border-t border-border py-6 bg-background">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground text-sm">
              Eden<span className="text-primary">Radar</span>
            </span>
            <span className="text-muted-foreground text-xs">· AI Biotech Asset Intelligence</span>
          </div>
          <nav className="flex items-center gap-4">
            <button
              onClick={handleLogin}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="footer-link-login"
            >
              Log In
            </button>
          </nav>
        </div>
      </footer>
    </div>
  );
}
