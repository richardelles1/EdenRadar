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
  Lightbulb,
  Sparkles,
  Target,
  Rocket,
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

/* ────────────── Mycelium Network — radiates from radar center ─── */

const MYC_INIT = 1.2;
const MYC_P_DUR = 4;
const MYC_P_GAP = 0.9;
const MYC_S_DUR = 2.5;
const MYC_T_DUR = 1.8;
const MYC_COLOR = "hsl(142 60% 48%)";

function pDel(i: number) { return MYC_INIT + i * MYC_P_GAP; }
function sDel(pi: number) { return pDel(pi) + MYC_P_DUR * 0.6; }
function tDel(pi: number) { return sDel(pi) + MYC_S_DUR * 0.6; }

const PRIMARY_PATHS = [
  "M 500 300 C 470 330, 420 380, 360 420 C 310 450, 250 485, 180 520",
  "M 500 300 C 496 350, 490 400, 484 445 C 480 475, 476 520, 470 565",
  "M 500 300 C 535 330, 585 375, 640 415 C 680 440, 725 468, 775 495",
  "M 500 300 C 460 293, 400 280, 340 264 C 290 252, 240 238, 185 225",
  "M 500 300 C 470 278, 430 250, 390 218 C 360 196, 330 172, 295 148",
  "M 500 300 C 545 296, 600 285, 660 272 C 710 262, 760 252, 815 242",
];

const SECONDARY_PATHS: [string, string][] = [
  ["M 360 420 C 340 438, 315 458, 290 478", "M 360 420 C 378 442, 392 468, 402 495"],
  ["M 484 445 C 462 462, 438 482, 418 502", "M 484 445 C 506 465, 528 488, 545 512"],
  ["M 640 415 C 632 440, 622 468, 615 495", "M 640 415 C 665 432, 695 448, 722 465"],
  ["M 340 264 C 325 245, 308 224, 292 205", "M 340 264 C 328 280, 314 298, 302 315"],
  ["M 390 218 C 372 205, 352 188, 335 172", "M 390 218 C 382 235, 370 255, 362 272"],
  ["M 660 272 C 675 255, 692 235, 708 218", "M 660 272 C 675 288, 692 308, 708 325"],
];

const TERTIARY_PATHS: [string, string][] = [
  ["M 315 458 C 300 470, 285 485, 272 498", "M 392 468 C 402 480, 412 495, 418 508"],
  ["M 438 482 C 422 495, 408 510, 395 524", "M 528 488 C 540 500, 555 515, 565 528"],
  ["M 622 468 C 612 482, 605 498, 598 512", "M 695 448 C 708 460, 722 475, 732 488"],
  ["M 308 224 C 296 214, 282 200, 272 190", "M 314 298 C 302 308, 290 322, 280 335"],
  ["M 352 188 C 340 178, 326 165, 315 155", "M 370 255 C 362 266, 352 280, 345 292"],
  ["M 692 235 C 702 225, 715 212, 725 202", "M 692 308 C 702 318, 715 332, 725 342"],
];

const SEC_TIPS: [number, number][][] = [
  [[290,478],[402,495]], [[418,502],[545,512]], [[615,495],[722,465]],
  [[292,205],[302,315]], [[335,172],[362,272]], [[708,218],[708,325]],
];
const TER_TIPS: [number, number][][] = [
  [[272,498],[418,508]], [[395,524],[565,528]], [[598,512],[732,488]],
  [[272,190],[280,335]], [[315,155],[345,292]], [[725,202],[725,342]],
];

interface MycStrand { d: string; sw: number; so: number; delay: number; dur: number }
interface MycNode { cx: number; cy: number; r: number; delay: number }

function buildMycelium() {
  const strands: MycStrand[] = [];
  const nodes: MycNode[] = [];

  PRIMARY_PATHS.forEach((d, i) => {
    strands.push({ d, sw: 1.4, so: 0.22, delay: pDel(i), dur: MYC_P_DUR });
  });

  SECONDARY_PATHS.forEach((pair, pi) => {
    pair.forEach((d) => {
      strands.push({ d, sw: 0.9, so: 0.15, delay: sDel(pi), dur: MYC_S_DUR });
    });
  });

  TERTIARY_PATHS.forEach((pair, pi) => {
    pair.forEach((d) => {
      strands.push({ d, sw: 0.6, so: 0.10, delay: tDel(pi), dur: MYC_T_DUR });
    });
  });

  SEC_TIPS.forEach((pair, pi) => {
    pair.forEach(([cx, cy]) => {
      nodes.push({ cx, cy, r: 2.0, delay: sDel(pi) + MYC_S_DUR + 0.15 });
    });
  });

  TER_TIPS.forEach((pair, pi) => {
    pair.forEach(([cx, cy]) => {
      nodes.push({ cx, cy, r: 1.6, delay: tDel(pi) + MYC_T_DUR + 0.15 });
    });
  });

  return { strands, nodes };
}

const { strands: MYC_STRANDS, nodes: MYC_NODES } = buildMycelium();

function HeroVine() {
  return (
    <div
      className="absolute inset-0 pointer-events-none select-none hidden sm:block"
      style={{ zIndex: 1 }}
      aria-hidden
    >
      <svg
        viewBox="0 0 1000 600"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
      >
        {MYC_STRANDS.map((s, i) => (
          <motion.path
            key={`ms-${i}`}
            d={s.d}
            fill="none"
            stroke={MYC_COLOR}
            strokeWidth={s.sw}
            strokeOpacity={s.so}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: s.delay, duration: s.dur, ease: "easeInOut" }}
          />
        ))}

        {MYC_NODES.map((n, i) => (
          <motion.circle
            key={`mn-${i}`}
            cx={n.cx}
            cy={n.cy}
            r={n.r}
            fill="hsl(142 65% 55%)"
            fillOpacity={0.35}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              delay: n.delay,
              duration: 0.5,
              type: "spring",
              stiffness: 160,
              damping: 18,
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

const DISCOVERY_TILES = [
  {
    icon: Lightbulb,
    title: "Pre-Research Concept Registry",
    desc: "Submit early-stage ideas before formal research begins. Capture the spark that could become the next breakthrough.",
  },
  {
    icon: Sparkles,
    title: "AI Credibility Scoring",
    desc: "Every concept is automatically evaluated by AI for scientific plausibility, feasibility, and biotech relevance on a 0-100 scale.",
  },
  {
    icon: Target,
    title: "Signal to Industry & Labs",
    desc: "Concepts that score well surface to industry scouts and research labs, creating early connections before the science starts.",
  },
  {
    icon: Rocket,
    title: "From Idea to Research",
    desc: "Graduate promising concepts into structured EdenLab research projects with one click when you're ready to build.",
  },
];

function PortalToggle({ onLogin }: { onLogin: () => void }) {
  const [active, setActive] = useState<"industry" | "research" | "discovery">("industry");
  const ref = useReveal();

  const tiles = active === "industry" ? INDUSTRY_TILES : active === "research" ? RESEARCH_TILES : DISCOVERY_TILES;

  return (
    <section ref={ref} className="reveal-section max-w-screen-xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
      <div className="text-center mb-10 sm:mb-14">
        <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-4">
          Built for Both Sides
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 leading-tight">
          One platform. Three powerful portals.
        </h2>
        <p className="text-muted-foreground max-w-lg mx-auto text-base">
          Whether you're sourcing pipeline or building science, EdenRadar is engineered for you.
        </p>

        <div className="inline-flex items-center mt-8 p-1 rounded-full border border-border bg-card shadow-sm">
          {(["industry", "research", "discovery"] as const).map((tab) => {
            const label = tab === "industry" ? "Industry" : tab === "research" ? "Research" : "Discovery";
            const activeStyle = tab === "discovery"
              ? { background: "hsl(38 92% 50%)", color: "white", boxShadow: "0 2px 12px hsl(38 92% 50% / 0.35)" }
              : { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", boxShadow: "0 2px 12px hsl(142 52% 36% / 0.35)" };
            return (
              <button
                key={tab}
                onClick={() => setActive(tab)}
                data-testid={`toggle-${tab}`}
                className="relative px-4 sm:px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 min-h-[44px]"
                style={active === tab ? activeStyle : { color: "hsl(var(--muted-foreground))" }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6" key={active}>
        {tiles.map((tile, i) => (
          <div
            key={tile.title}
            className={`group flex gap-4 p-5 sm:p-6 rounded-xl border border-border bg-card transition-all duration-200 hover:shadow-md ${active === "discovery" ? "hover:border-amber-500/40" : "hover:border-primary/40"}`}
            style={{ animationDelay: `${i * 80}ms`, animation: "fade-up 0.5s ease-out forwards" }}
            data-testid={`tile-${active}-${i}`}
          >
            <div className={`flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center transition-colors duration-200 ${active === "discovery" ? "bg-amber-500/10 group-hover:bg-amber-500/20" : "bg-primary/10 group-hover:bg-primary/20"}`}>
              <tile.icon className={`w-5 h-5 ${active === "discovery" ? "text-amber-500" : "text-primary"}`} />
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
          <Button
            size="lg"
            variant="outline"
            onClick={onLogin}
            data-testid="cta-bottom-discovery"
            className="w-full sm:w-auto h-12 px-7 font-semibold text-base gap-2"
            style={{
              borderColor: "hsl(38 92% 50% / 0.5)",
              color: "hsl(38 92% 60%)",
              background: "transparent",
            }}
          >
            <Lightbulb className="w-4 h-4" />
            For Concepts
          </Button>
        </div>

        <p className="mt-6 text-xs" style={{ color: "hsl(210 15% 45%)" }}>
          All portals share the same secure login. Choose your path once you're in.
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
  { value: "3-Sided", label: "Ecosystem" },
];

export default function Landing() {
  const [, navigate] = useLocation();
  const { session, role, loading } = useAuth();
  const statsRef = useReveal();

  useEffect(() => {
    if (!loading && session && role) {
      const dest = role === "industry" ? "/scout" : role === "researcher" ? "/research" : "/discovery";
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
              <Button
                size="lg"
                variant="outline"
                onClick={handleLogin}
                data-testid="button-cta-discovery"
                className="w-full sm:w-auto h-12 px-7 text-base font-semibold gap-2 border-amber-500/40 hover:border-amber-500/70 hover:bg-amber-500/5 text-amber-500"
              >
                <Lightbulb className="w-4 h-4" />
                For Concepts
                <ArrowRight className="w-3.5 h-3.5 opacity-70" />
              </Button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              All portals share the same secure login. Choose your path once you're in.
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
