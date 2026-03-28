import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Nav } from "@/components/Nav";
import { EdenNXBadge } from "@/components/EdenNXBadge";
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

/* ─────────────────────────── WavyBackground ──────────────────── */

const HERO_WAVES = [
  { color: "#065f46", alphaDark: 0.28, alphaLight: 0.05, amp: 80, freq: 0.0018, spd: 0.008, yr: 0.55 },
  { color: "#10b981", alphaDark: 0.20, alphaLight: 0.04, amp: 58, freq: 0.0026, spd: 0.014, yr: 0.68 },
  { color: "#059669", alphaDark: 0.15, alphaLight: 0.03, amp: 42, freq: 0.0036, spd: 0.020, yr: 0.78 },
  { color: "#34d399", alphaDark: 0.10, alphaLight: 0.03, amp: 26, freq: 0.0048, spd: 0.028, yr: 0.87 },
];

function WavyBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let frame = 0;
    let isDark = document.documentElement.classList.contains("dark");

    const mo = new MutationObserver(() => {
      isDark = document.documentElement.classList.contains("dark");
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    function draw() {
      if (!canvas || !ctx) return;
      const W = canvas.width;
      const H = canvas.height;

      ctx.fillStyle = isDark ? "#060a06" : "#f3fef6";
      ctx.fillRect(0, 0, W, H);

      for (const wave of HERO_WAVES) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 2) {
          const y =
            wave.yr * H +
            Math.sin(x * wave.freq + frame * wave.spd) * wave.amp +
            Math.sin(x * wave.freq * 1.8 + frame * wave.spd * 0.65) * wave.amp * 0.3;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();
        ctx.globalAlpha = isDark ? wave.alphaDark : wave.alphaLight;
        ctx.fillStyle = wave.color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      frame++;
      animId = requestAnimationFrame(draw);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    draw();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full block"
      aria-hidden
    />
  );
}

/* ─────────────────────────── PortalToggle ────────────────────── */

const INDUSTRY_TILES = [
  {
    icon: TrendingUp,
    title: "Market Intelligence",
    desc: "EDEN-enriched signals from 300+ TTOs, patent filings, and live academic publications, structured and scored.",
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
    title: "Literature Synthesis",
    desc: "Query millions of papers and receive structured summaries, key findings, and citation-ready insights.",
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
    title: "Concept Registry",
    desc: "Submit early-stage ideas before formal research begins. Capture the spark that could become the next breakthrough.",
  },
  {
    icon: Sparkles,
    title: "EDEN Credibility Scoring",
    desc: "Every concept is automatically evaluated by EDEN for scientific plausibility, feasibility, and biotech relevance on a 0-100 scale.",
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
  const [active, setActive] = useState<"discovery" | "research" | "industry">("discovery");
  const ref = useReveal();

  const tiles = active === "discovery" ? DISCOVERY_TILES : active === "research" ? RESEARCH_TILES : INDUSTRY_TILES;

  const TAB_STYLE: Record<string, { bg: string; shadow: string }> = {
    discovery: { bg: "hsl(38 92% 50%)", shadow: "0 2px 12px hsl(38 92% 50% / 0.35)" },
    research: { bg: "hsl(265 60% 55%)", shadow: "0 2px 12px hsl(265 60% 55% / 0.35)" },
    industry: { bg: "hsl(142 52% 36%)", shadow: "0 2px 12px hsl(142 52% 36% / 0.35)" },
  };

  const TILE_ACCENT: Record<string, { hover: string; iconBg: string; iconBgHover: string; iconColor: string }> = {
    discovery: { hover: "hover:border-amber-500/40", iconBg: "bg-amber-500/10", iconBgHover: "group-hover:bg-amber-500/20", iconColor: "text-amber-500" },
    research: { hover: "hover:border-violet-500/40", iconBg: "bg-violet-500/10", iconBgHover: "group-hover:bg-violet-500/20", iconColor: "text-violet-500" },
    industry: { hover: "hover:border-primary/40", iconBg: "bg-primary/10", iconBgHover: "group-hover:bg-primary/20", iconColor: "text-primary" },
  };

  const accent = TILE_ACCENT[active];

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
          {(["discovery", "research", "industry"] as const).map((tab) => {
            const label = tab === "discovery" ? "Discovery" : tab === "research" ? "Research" : "Industry";
            const style = TAB_STYLE[tab];
            return (
              <button
                key={tab}
                onClick={() => setActive(tab)}
                data-testid={`toggle-${tab}`}
                className="relative px-4 sm:px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 min-h-[44px]"
                style={active === tab ? { background: style.bg, color: "white", boxShadow: style.shadow } : { color: "hsl(var(--muted-foreground))" }}
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
            className={`group flex gap-4 p-5 sm:p-6 rounded-xl border border-border bg-card transition-all duration-200 hover:shadow-md ${accent.hover}`}
            style={{ animationDelay: `${i * 80}ms`, animation: "fade-up 0.5s ease-out forwards" }}
            data-testid={`tile-${active}-${i}`}
          >
            <div className={`flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center transition-colors duration-200 ${accent.iconBg} ${accent.iconBgHover}`}>
              <tile.icon className={`w-5 h-5 ${accent.iconColor}`} />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1.5 text-sm sm:text-base">{tile.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{tile.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center mt-10">
        {active === "discovery" ? (
          <a
            href="/discovery"
            className="text-sm font-semibold transition-colors duration-150 flex items-center gap-1 mx-auto w-fit"
            style={{ color: "hsl(38 92% 50%)" }}
            data-testid="button-discovery-cta"
          >
            Browse EdenDiscovery
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        ) : (
          <button
            onClick={onLogin}
            className="text-sm text-primary hover:text-primary/80 font-medium transition-colors duration-150 flex items-center gap-1 mx-auto"
            data-testid="button-toggle-cta"
          >
            Explore the {active === "industry" ? "Industry" : "Research"} portal
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
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
            For Discovery
          </Button>
        </div>

      </div>
    </section>
  );
}

/* ─────────────────────────── Main Landing ────────────────────── */

const STATS = [
  { value: "300+",    label: "Tech Transfer Offices" },
  { value: "10M+",    label: "Papers Indexed" },
  { value: "EDEN",    label: "Enriched Signals" },
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
          <WavyBackground />

          <div className="relative z-10 max-w-screen-xl mx-auto px-4 sm:px-6 flex flex-col items-center justify-center text-center"
            style={{ minHeight: "92vh", paddingTop: "6rem", paddingBottom: "5rem" }}>

            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight leading-[1.06] mb-6 max-w-4xl text-foreground dark:text-white">
              Where Biotech Research
              <br />
              <span className="gradient-text">
                Meets Industry Intelligence.
              </span>
            </h1>

            <p className="text-base sm:text-lg lg:text-xl max-w-2xl leading-relaxed mb-10 text-foreground/70 dark:text-white/72">
              EdenRadar connects world-class university innovations with the industry teams building tomorrow's therapies, powered by EDEN, the intelligence engine that reads the science so you don't have to.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full max-w-sm sm:max-w-none sm:w-auto">
              <div className="glass-btn-wrap w-full sm:w-auto">
                <button
                  onClick={handleLogin}
                  data-testid="button-cta-discovery"
                  className="glass-btn-inner w-full sm:w-auto"
                >
                  <Lightbulb className="w-4 h-4" />
                  For Discovery
                  <ArrowRight className="w-3.5 h-3.5 opacity-70" />
                </button>
              </div>
              <div className="glass-btn-wrap w-full sm:w-auto">
                <button
                  onClick={handleLogin}
                  data-testid="button-cta-research"
                  className="glass-btn-inner w-full sm:w-auto"
                >
                  <FlaskConical className="w-4 h-4" />
                  For Researchers
                  <ArrowRight className="w-3.5 h-3.5 opacity-70" />
                </button>
              </div>
              <div className="glass-btn-wrap w-full sm:w-auto">
                <button
                  onClick={handleLogin}
                  data-testid="button-cta-industry"
                  className="glass-btn-inner w-full sm:w-auto"
                >
                  <Building2 className="w-4 h-4" />
                  For Industry
                  <ArrowRight className="w-3.5 h-3.5 opacity-70" />
                </button>
              </div>
            </div>

            <div
              ref={statsRef}
              className="reveal-section mt-16 sm:mt-20 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-10"
            >
              {STATS.map((s) => (
                <div key={s.label} className="text-center" data-testid={`stat-${s.label.replace(/\s+/g, "-").toLowerCase()}`}>
                  <div className="text-2xl sm:text-3xl font-bold gradient-text mb-1">
                    {s.value}
                  </div>
                  <div className="text-xs tracking-wide text-foreground/50 dark:text-white/55">{s.label}</div>
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
                  desc: "Surface pre-clinical assets from 300+ tech transfer offices the moment they're published, EDEN-enriched with target, modality, and stage.",
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
            <EdenNXBadge />
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
