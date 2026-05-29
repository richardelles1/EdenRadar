import { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Nav } from "@/components/Nav";
import { EdenNXBadge } from "@/components/EdenNXBadge";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { NumberTicker } from "@/components/ui/number-ticker";
import { MovingBorder } from "@/components/ui/moving-border";
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
  Bookmark,
  BookmarkCheck,
  Zap,
  Lightbulb,
  Sparkles,
  Target,
  Rocket,
  ShoppingBag,
  Lock,
  Handshake,
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

const BLIPS: { ring: number; a: number; label: string | null }[] = [
  { ring: 2, a: 0.40, label: "MIT TTO" },
  { ring: 4, a: 1.10, label: "Stanford OTL" },
  { ring: 1, a: 2.30, label: null },
  { ring: 5, a: 3.00, label: "Max Planck" },
  { ring: 3, a: 3.80, label: "UCSF QB3" },
  { ring: 6, a: 4.50, label: null },
  { ring: 2, a: 5.10, label: "Oxford TT" },
  { ring: 4, a: 5.80, label: null },
  { ring: 1, a: 0.90, label: null },
  { ring: 5, a: 2.00, label: "Harvard OTD" },
  { ring: 3, a: 2.90, label: null },
  { ring: 6, a: 1.70, label: "Broad Inst." },
  { ring: 2, a: 4.10, label: null },
  { ring: 4, a: 3.30, label: "CNRS TTT" },
  { ring: 1, a: 5.50, label: null },
];
const BLIP_LIFETIME = 4800;

function RadarBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let angle = 0;
    let lastTime = performance.now();
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const blipTimes = new Array(BLIPS.length).fill(-BLIP_LIFETIME);
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

    function draw(now: number) {
      if (!canvas || !ctx) return;
      const dt = now - lastTime;
      lastTime = now;
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;
      const maxR = Math.sqrt(cx * cx + cy * cy) * 1.05;
      const ringCount = 7;
      const ringSpacing = maxR / ringCount;
      const ringAlpha = isDark ? 0.10 : 0.06;
      const sweepPeak = isDark ? 0.18 : 0.10;
      const sweepAngle = Math.PI / 2;
      const sweepSteps = 24;
      const TWO_PI = Math.PI * 2;
      const delta = TWO_PI * (dt / 25000);

      ctx.fillStyle = isDark ? "#060a06" : "#f3fef6";
      ctx.fillRect(0, 0, W, H);

      // rings
      ctx.strokeStyle = "#065f46";
      ctx.lineWidth = 1;
      for (let i = 1; i <= ringCount; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, ringSpacing * i, 0, TWO_PI);
        ctx.globalAlpha = ringAlpha;
        ctx.stroke();
      }

      // crosshairs
      ctx.globalAlpha = isDark ? 0.045 : 0.022;
      ctx.strokeStyle = "#065f46";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(W, cy);
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, H);
      ctx.stroke();

      // sweep
      for (let i = 0; i < sweepSteps; i++) {
        const t = (i + 1) / sweepSteps;
        const startA = angle - sweepAngle + (i / sweepSteps) * sweepAngle;
        const endA = angle - sweepAngle + ((i + 1) / sweepSteps) * sweepAngle;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, maxR, startA, endA);
        ctx.closePath();
        ctx.fillStyle = "#c47d1a";
        ctx.globalAlpha = t * sweepPeak;
        ctx.fill();
      }

      // leading edge sweep arm
      ctx.globalAlpha = isDark ? 0.60 : 0.45;
      ctx.strokeStyle = "#c47d1a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
      ctx.stroke();

      // detect sweep crossings then advance angle
      for (let i = 0; i < BLIPS.length; i++) {
        const ba = ((BLIPS[i].a % TWO_PI) + TWO_PI) % TWO_PI;
        const normCur = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
        const normNext = (((angle + delta) % TWO_PI) + TWO_PI) % TWO_PI;
        const crosses =
          normNext >= normCur
            ? ba >= normCur && ba < normNext
            : ba >= normCur || ba < normNext;
        if (crosses) blipTimes[i] = now;
      }
      angle += delta;

      // blips
      for (let i = 0; i < BLIPS.length; i++) {
        const age = now - blipTimes[i];
        if (age >= BLIP_LIFETIME) continue;

        let alpha: number;
        const fadeIn = 300;
        const fadeOut = 700;
        if (age < fadeIn) {
          alpha = age / fadeIn;
        } else if (age < BLIP_LIFETIME - fadeOut) {
          alpha = 0.82 + 0.18 * Math.sin((age - fadeIn) / 380);
        } else {
          alpha = Math.max(0, 1 - (age - (BLIP_LIFETIME - fadeOut)) / fadeOut);
        }

        const r = ringSpacing * BLIPS[i].ring;
        const bx = cx + r * Math.cos(BLIPS[i].a);
        const by = cy + r * Math.sin(BLIPS[i].a);

        // glow halo
        const grd = ctx.createRadialGradient(bx, by, 0, bx, by, 11);
        grd.addColorStop(0, "rgba(52,211,153,0.55)");
        grd.addColorStop(1, "rgba(52,211,153,0)");
        ctx.globalAlpha = alpha * (isDark ? 0.75 : 0.45);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(bx, by, 11, 0, TWO_PI);
        ctx.fill();

        // core dot
        ctx.globalAlpha = alpha * (isDark ? 0.95 : 0.65);
        ctx.fillStyle = "#34d399";
        ctx.beginPath();
        ctx.arc(bx, by, 2.5, 0, TWO_PI);
        ctx.fill();

        // institution label
        if (BLIPS[i].label && alpha > 0.35) {
          ctx.globalAlpha = alpha * 0.65 * (isDark ? 1 : 0.65);
          ctx.fillStyle = "#34d399";
          ctx.font = "9px ui-monospace, 'SF Mono', monospace";
          ctx.textAlign = "left";
          ctx.fillText(BLIPS[i].label!, bx + 7, by + 3);
        }
      }

      ctx.globalAlpha = 1;
      if (!prefersReducedMotion) animId = requestAnimationFrame(draw);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    draw(performance.now());

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
    desc: "EDEN-enriched signals from 350+ TTOs, patent filings, and live academic publications, structured and scored.",
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

const EDENMARKET_TILES = [
  {
    icon: ShoppingBag,
    title: "Blind Asset Marketplace",
    desc: "Browse licensable biotech assets anonymously — therapeutic area, modality, stage, and IP profile visible upfront. Seller identity revealed only after NDA.",
  },
  {
    icon: Lock,
    title: "NDA-gated Deal Rooms",
    desc: "Once both sides engage, a secure deal room opens: document vault, encrypted messaging, and a full audit trail inside EdenRadar.",
  },
  {
    icon: Handshake,
    title: "Success-fee Aligned",
    desc: "Listing is free. EdenMarket earns only when a deal closes — our incentives stay perfectly aligned with your outcome.",
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
  const [active, setActive] = useState<"discovery" | "research" | "industry">("industry");
  const ref = useReveal();

  const tiles = active === "discovery" ? DISCOVERY_TILES : active === "research" ? RESEARCH_TILES : INDUSTRY_TILES;

  const TAB_STYLE: Record<string, { bg: string; shadow: string }> = {
    discovery: { bg: "hsl(var(--portal-discovery))", shadow: "0 2px 12px hsl(var(--portal-discovery) / 0.35)" },
    research: { bg: "hsl(var(--portal-lab))", shadow: "0 2px 12px hsl(var(--portal-lab) / 0.35)" },
    industry: { bg: "hsl(var(--portal-scout))", shadow: "0 2px 12px hsl(var(--portal-scout) / 0.35)" },
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

        <div className="inline-flex items-center mt-8 p-1 rounded-full border border-border bg-card shadow-sm" role="tablist" aria-label="Portal">
          {(["discovery", "research", "industry"] as const).map((tab) => {
            const label = tab === "discovery" ? "Discovery" : tab === "research" ? "Research" : "Industry";
            const style = TAB_STYLE[tab];
            return (
              <button
                key={tab}
                id={`portal-tab-${tab}`}
                role="tab"
                aria-selected={active === tab}
                aria-controls={`portal-panel-${tab}`}
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

      {active === "industry" ? (
        <div className="space-y-6" key="industry" id="portal-panel-industry" role="tabpanel" aria-labelledby="portal-tab-industry">
          {/* EdenRadar sub-section */}
          <div className="space-y-3">
            <p className="text-[10px] font-mono font-bold uppercase tracking-[0.15em] text-primary/60">
              EdenRadar: Pipeline Intelligence
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {INDUSTRY_TILES.map((tile, i) => (
                <div
                  key={tile.title}
                  className="group flex gap-4 p-5 rounded-xl border border-border bg-card transition-colors duration-200 hover:shadow-md hover:border-primary/40 stagger-item"
                  style={{ animationDelay: `${i * 80}ms` }}
                  data-testid={`tile-industry-scout-${i}`}
                >
                  <div className="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center transition-colors duration-200 bg-primary/10 group-hover:bg-primary/20">
                    <tile.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1.5 text-sm sm:text-base">{tile.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{tile.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* EdenMarket sub-section */}
          <div className="space-y-3">
            <p className="text-[10px] font-mono font-bold uppercase tracking-[0.15em]"
              style={{ color: "hsl(var(--portal-market) / 0.7)" }}
            >
              EdenMarket: Blind Asset Marketplace
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {EDENMARKET_TILES.map((tile, i) => (
                <div
                  key={tile.title}
                  className="group flex gap-4 p-5 rounded-xl border border-border bg-card transition-colors duration-200 hover:shadow-md stagger-item"
                  style={{ borderColor: "hsl(var(--portal-market) / 0.15)", animationDelay: `${(i + 4) * 80}ms` }}
                  data-testid={`tile-industry-market-${i}`}
                >
                  <div
                    className="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center transition-colors duration-200"
                    style={{ background: "hsl(var(--portal-market) / 0.10)" }}
                  >
                    <tile.icon className="w-5 h-5" style={{ color: "hsl(var(--portal-market))" }} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1.5 text-sm sm:text-base">{tile.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{tile.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dual CTA */}
          <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
            <button
              onClick={onLogin}
              className="text-sm text-primary hover:text-primary/80 font-semibold transition-colors duration-150 flex items-center gap-1"
              data-testid="button-toggle-scout-cta"
            >
              Explore EdenRadar
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <span className="hidden sm:block text-border" aria-hidden="true">|</span>
            <Link href="/market">
              <span
                className="text-sm font-semibold transition-colors duration-150 flex items-center gap-1 cursor-pointer"
                style={{ color: "hsl(var(--portal-market))" }}
                data-testid="button-toggle-market-cta"
              >
                Browse EdenMarket
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
        </div>
      ) : (
        <div id={`portal-panel-${active}`} role="tabpanel" aria-labelledby={`portal-tab-${active}`} key={active}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {tiles.map((tile, i) => (
              <div
                key={tile.title}
                className={`group flex gap-4 p-5 sm:p-6 rounded-xl border border-border bg-card transition-colors duration-200 hover:shadow-md stagger-item ${accent.hover}`}
                style={{ animationDelay: `${i * 80}ms` }}
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
                style={{ color: "hsl(var(--portal-discovery))" }}
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
                Explore the Research portal
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
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
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 30% 0%, hsl(142 65% 55% / 0.12) 0%, transparent 55%)" }} aria-hidden />

      <div className="relative max-w-screen-xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
        <p className="text-xs font-mono font-semibold uppercase tracking-[0.15em] mb-6" style={{ color: "hsl(142 65% 55%)" }}>
          Join EdenRadar Today
        </p>

        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-5 leading-tight text-white">
          Get started with{" "}
          <span style={{ color: "hsl(142 65% 62%)" }}>
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
            className="w-full sm:w-auto h-11 px-7 font-semibold text-base gap-2"
          >
            <Building2 className="w-4 h-4" />
            EdenRadar
          </Button>
          <Link href="/market" className="w-full sm:w-auto">
            <Button
              size="lg"
              data-testid="cta-bottom-edenmarket"
              className="w-full sm:w-auto h-11 px-7 font-semibold text-base gap-2"
              style={{ background: "hsl(var(--portal-market))", color: "white", border: "none" }}
            >
              <ShoppingBag className="w-4 h-4" />
              EdenMarket
            </Button>
          </Link>
        </div>

      </div>
    </section>
  );
}

/* ─────────────────────────── InstitutionMarquee ──────────────── */

const INSTITUTION_ROWS = [
  [
    "MIT", "Stanford", "Harvard", "Johns Hopkins", "UCSF", "UCLA", "Columbia", "Yale",
    "Cornell", "Penn", "Duke", "Michigan", "Wisconsin-Madison", "UNC Chapel Hill",
    "UC Berkeley", "Northwestern", "NYU", "Vanderbilt", "Emory", "Pittsburgh",
  ],
  [
    "Ohio State", "Penn State", "Texas", "USC", "UCSD", "UC Davis", "Wash U St. Louis",
    "Mayo Clinic", "Mass General Hospital", "Brigham and Women's", "Memorial Sloan Kettering",
    "MD Anderson", "Cleveland Clinic", "Mount Sinai", "CHOP", "Boston Children's",
    "Dartmouth", "Brown", "Tufts", "Georgetown",
  ],
  [
    "Georgia Tech", "Purdue", "Illinois", "Minnesota", "Texas A&M", "Virginia", "Arizona State",
    "Michigan State", "Colorado", "Oregon", "Washington", "Iowa", "Indiana", "Rutgers",
    "Case Western", "BU", "Northeastern", "GWU", "Temple", "Drexel",
  ],
  [
    "Wake Forest", "Miami", "Rochester", "Delaware", "Maryland", "Virginia Tech",
    "Cincinnati", "Louisville", "Kentucky", "Caltech", "Rice", "Baylor",
    "Lawrence Berkeley Lab", "Argonne National Lab", "NIH", "Nebraska", "Oklahoma",
    "South Carolina", "Tennessee", "Alabama",
  ],
];

function InstitutionMarquee() {
  const speeds = [34, 42, 50, 38];
  const directions = ["marquee-left", "marquee-right", "marquee-left", "marquee-right"] as const;

  return (
    <section className="py-12 overflow-hidden border-y border-border/40">
      <div className="mb-7 text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-primary">350+ Institutions Indexed</p>
      </div>

      <div className="space-y-2.5">
        {INSTITUTION_ROWS.map((row, ri) => {
          const doubled = [...row, ...row];
          return (
            <div
              key={ri}
              className="relative overflow-hidden"
              style={{
                maskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
              }}
            >
              <div
                className="flex w-max"
                style={{ animation: `${directions[ri]} ${speeds[ri]}s linear infinite` }}
              >
                {doubled.map((name, i) => (
                  <span
                    key={i}
                    className="flex-shrink-0 whitespace-nowrap text-[11px] font-semibold tracking-wider"
                    style={{ color: "hsl(var(--foreground) / 0.50)" }}
                  >
                    {name}
                    <span
                      className="mx-4"
                      style={{ color: "hsl(var(--foreground) / 0.18)" }}
                    >
                      ·
                    </span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─────────────────────────── HeroCardDeck ────────────────────── */

const HERO_CARDS: Array<{
  type: "tto" | "trial" | "patent" | "research";
  score: number;
  name: string;
  indication: string;
  summary: string;
  stage: string;
  modality: string;
  rising: boolean;
  sources: number;
  institution: string;
}> = [
  {
    type: "tto",
    score: 9,
    name: "GLP-1/GIP dual receptor agonist with enhanced CNS penetration for obesity and metabolic syndrome",
    indication: "Obesity · Metabolic syndrome",
    summary: "Dual agonism achieves 40% greater weight reduction than semaglutide in HFD mouse models. CNS penetration confirmed by PET imaging. Exclusive licensing available; Phase 1 IND submission in preparation.",
    stage: "Pre-clinical",
    modality: "Peptide",
    rising: true,
    sources: 3,
    institution: "UT Southwestern Medical Center",
  },
  {
    type: "trial",
    score: 0,
    name: "Phase I safety and dose-finding study of dual GLP-1/GIP receptor agonist in adults with obesity",
    indication: "Obesity · BMI ≥ 30 · NCT05891432",
    summary: "Open-label, dose-escalation study across 6 cohorts (n=48). Primary endpoint: MTD and 12-week PK profile. Secondary endpoints include neuroinflammatory biomarkers and HOMA-IR.",
    stage: "Phase 1",
    modality: "Peptide",
    rising: false,
    sources: 2,
    institution: "UT Southwestern Medical Center",
  },
  {
    type: "patent",
    score: 0,
    name: "Modified GLP-1/GIP co-agonist peptides with improved metabolic half-life and CNS bioavailability",
    indication: "Obesity · Type 2 diabetes",
    summary: "PCT/US2024/038291 covers 23 fatty acid-modified variants with 96h plasma half-life. National phase entry across 42 jurisdictions in Q1 2025. Sub-licensing discussions open.",
    stage: "Pre-clinical",
    modality: "Peptide",
    rising: false,
    sources: 1,
    institution: "UT Southwestern Medical Center",
  },
  {
    type: "research",
    score: 0,
    name: "CNS-penetrant GLP-1/GIP co-agonism drives weight loss and reduces neuroinflammation in diet-induced obese mice",
    indication: "Obesity · Neuroinflammation",
    summary: "Hypothalamic co-stimulation cut body weight 28% and NLRP3 inflammasome activation 67% in HFD mice (n=24, p<0.001). Open access. Nature Metabolism, March 2024.",
    stage: "Pre-clinical",
    modality: "Peptide",
    rising: true,
    sources: 2,
    institution: "PubMed · Nature Metabolism",
  },
];

const DECK_TINTS: Record<"tto" | "trial" | "patent" | "research", {
  bg: string; border: string; strip: string;
  scoreColor: string; badgeBg: string; badgeBorderColor: string;
}> = {
  tto:      { bg: "#f0fdf4", border: "#a7f3d0", strip: "#10b981", scoreColor: "#059669", badgeBg: "white", badgeBorderColor: "rgba(16,185,129,0.4)" },
  trial:    { bg: "#f0fdfa", border: "#99f6e4", strip: "#0d9488", scoreColor: "#059669", badgeBg: "white", badgeBorderColor: "rgba(16,185,129,0.4)" },
  patent:   { bg: "#fffbeb", border: "#fde68a", strip: "#d97706", scoreColor: "#059669", badgeBg: "white", badgeBorderColor: "rgba(16,185,129,0.4)" },
  research: { bg: "#f0f9ff", border: "#bae6fd", strip: "#0ea5e9", scoreColor: "#059669", badgeBg: "white", badgeBorderColor: "rgba(16,185,129,0.4)" },
};

const DECK_STACK = [
  { tx: 0,  ty: 0,  scale: 1.00, opacity: 1.00 },
  { tx: 18, ty: 18, scale: 0.97, opacity: 0.88 },
  { tx: 36, ty: 36, scale: 0.94, opacity: 0.72 },
  { tx: 54, ty: 54, scale: 0.91, opacity: 0.55 },
];

function deckStagePillClass(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes("phase 1") || s.includes("phase i/ii")) return "bg-sky-50 border border-sky-200/70 border-l-sky-400/90 text-sky-700";
  if (s.includes("phase 2") || s.includes("phase ii")) return "bg-violet-50 border border-violet-200/70 border-l-violet-400/90 text-violet-700";
  if (s.includes("phase 3") || s.includes("approved")) return "bg-emerald-50 border border-emerald-300/70 border-l-emerald-600 text-emerald-700";
  return "bg-emerald-50 border border-emerald-200/60 border-l-emerald-400/80 text-emerald-700";
}

function HeroCardDeck() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [bookmarked, setBookmarked] = useState<Set<number>>(new Set());
  const [frontHovered, setFrontHovered] = useState(false);
  const paused = useRef(false);

  useEffect(() => {
    const iv = setInterval(() => {
      if (!paused.current) setActiveIdx(i => (i + 1) % HERO_CARDS.length);
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div
      className="hidden lg:block select-none"
      style={{ position: "relative", width: "500px", height: "480px", margin: "0 auto" }}
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
    >
      {HERO_CARDS.map((card, cardIdx) => {
        const pos = (cardIdx - activeIdx + HERO_CARDS.length) % HERO_CARDS.length;
        const isFront = pos === 0;
        const tint = DECK_TINTS[card.type];
        const sp = DECK_STACK[pos];
        const isBookmarked = bookmarked.has(cardIdx);

        return (
          <div
            key={cardIdx}
            className="absolute rounded-[17px] overflow-hidden"
            style={{
              top: 0, left: 0,
              width: "480px", height: "445px",
              transform: `translate(${sp.tx}px, ${sp.ty + (isFront && frontHovered ? -7 : 0)}px) scale(${isFront && frontHovered ? 1.015 : sp.scale})`,
              transformOrigin: "top left",
              zIndex: 4 - pos,
              opacity: sp.opacity,
              background: tint.bg,
              border: `1px solid ${tint.border}`,
              boxShadow: isFront
                ? frontHovered
                  ? "0 28px 60px rgba(0,0,0,0.22), 0 8px 24px rgba(0,0,0,0.10)"
                  : "0 20px 48px rgba(0,0,0,0.16), 0 4px 12px rgba(0,0,0,0.08)"
                : "0 4px 12px rgba(0,0,0,0.06)",
              transition: "transform 0.38s cubic-bezier(0.23,1,0.32,1), opacity 0.35s ease, box-shadow 0.35s ease",
              cursor: isFront ? "pointer" : "default",
            }}
            onMouseEnter={() => { if (isFront) setFrontHovered(true); }}
            onMouseLeave={() => { if (isFront) setFrontHovered(false); }}
            onClick={isFront ? () => setActiveIdx(i => (i + 1) % HERO_CARDS.length) : undefined}
          >
            {/* Left strip */}
            <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: tint.strip }} />

            {/* Tinted header zone */}
            <div
              className="absolute top-0 left-0 right-0 z-[3]"
              style={{
                height: "80px",
                background: `${tint.strip}0d`,
                borderBottom: `1px solid ${tint.strip}26`,
              }}
            />

            {/* Score badge — TTO only */}
            {card.type === "tto" && (
              <div
                className="absolute top-0 left-0 z-[5] flex flex-col items-center justify-center px-3 py-1.5"
                style={{
                  borderRadius: "17px 0 10px 0",
                  minWidth: "80px",
                  background: tint.badgeBg,
                  borderBottom: `1px solid ${tint.badgeBorderColor}`,
                  borderRight: `1px solid ${tint.badgeBorderColor}`,
                  boxShadow: isFront ? `0 4px 20px ${tint.strip}40` : "none",
                }}
              >
                <span className="text-[11px] font-bold tracking-[0.15em] uppercase leading-none" style={{ color: "#71717a" }}>Score</span>
                <span className="font-mono text-[40px] font-bold leading-tight tabular-nums mt-0.5" style={{ color: tint.scoreColor }}>
                  {card.score}
                </span>
              </div>
            )}

            {/* Type label — centered in top strip between score badge and bookmark */}
            <div
              className="absolute z-[4] flex items-center justify-center pointer-events-none"
              style={{
                top: 0,
                left: card.type === "tto" ? "80px" : 0,
                right: "68px",
                height: "80px",
              }}
            >
              <span className="text-[22px] font-bold uppercase tracking-[0.06em]" style={{ color: tint.strip }}>
                {card.type === "tto" ? "TTO Asset" : card.type === "trial" ? "Clinical Trial" : card.type === "patent" ? "Patent" : "Research"}
              </span>
            </div>

            {/* Bookmark — front card only */}
            {isFront && (
              <div
                className="absolute top-2 right-2 z-[5]"
                onClick={(e) => {
                  e.stopPropagation();
                  setBookmarked(prev => {
                    const next = new Set(prev);
                    next.has(cardIdx) ? next.delete(cardIdx) : next.add(cardIdx);
                    return next;
                  });
                }}
              >
                <button
                  className={`w-14 h-14 rounded-lg flex items-center justify-center transition-all duration-200 ${
                    isBookmarked
                      ? "text-emerald-600 bg-emerald-500/10"
                      : "text-zinc-400 hover:text-emerald-600 hover:bg-emerald-500/10"
                  }`}
                >
                  {isBookmarked
                    ? <BookmarkCheck className="w-8 h-8" />
                    : <Bookmark className="w-8 h-8" />
                  }
                </button>
              </div>
            )}

            {/* Content */}
            <div className="absolute inset-0 z-[4] flex flex-col pl-6 pr-5 pt-[84px] pb-5">
              <h3 className="text-[20px] font-semibold text-foreground leading-snug line-clamp-3 mt-2">
                {card.name}
              </h3>
              <p className="text-[15px] text-zinc-500 leading-snug mt-3 line-clamp-1">
                {card.indication}
              </p>
              <p className="text-[14px] text-zinc-600 leading-relaxed mt-3 line-clamp-3">
                {card.summary}
              </p>
              <div className="flex flex-wrap gap-2.5 mt-4">
                <span className={`text-[13px] font-medium px-3 py-1.5 rounded border-l-2 ${deckStagePillClass(card.stage)}`}>
                  {card.stage}
                </span>
                <span className="text-[13px] font-medium px-3 py-1.5 rounded text-emerald-700 bg-emerald-50 border border-emerald-200/70">
                  {card.modality}
                </span>
                {card.rising && (
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded bg-emerald-50 border border-emerald-200/70 text-emerald-600">
                    <TrendingUp className="w-3.5 h-3.5" /> Rising
                  </span>
                )}
                {card.sources >= 2 && (
                  <span className="text-[13px] font-semibold px-3 py-1.5 rounded bg-sky-50 border border-sky-200/70 text-sky-600">
                    {card.sources} sources
                  </span>
                )}
              </div>
              <div className="flex-1" />
              <p className="flex items-center gap-2 text-[14px] text-zinc-700 font-medium leading-snug mb-4 line-clamp-1">
                <Building2 className="w-3.5 h-3.5 shrink-0 opacity-50" />
                {card.institution}
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="flex-1 h-11 rounded-md text-[14px] font-semibold tracking-wide bg-emerald-600 text-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  Asset Dossier
                </button>
                <button
                  className="h-11 px-4 rounded-md text-[12px] font-medium text-zinc-400"
                  onClick={(e) => e.stopPropagation()}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── Main Landing ────────────────────── */

const STATS = [
  { value: "350+",  label: "Tech Transfer Offices" },
  { value: "33K+",  label: "Scored Assets" },
  { value: "40+",   label: "Live Data Sources" },
  { value: "Daily", label: "Updates & Alerts", raw: true },
];

export default function Landing() {
  useDocumentMeta({
    title: "EdenRadar — Where Biotech Research Meets Industry Intelligence",
    description:
      "AI-powered biotech asset discovery across 350+ tech transfer offices. EDEN queries 40+ live data sources — patents, clinical trials, literature — to score and surface licensable assets for industry BD teams.",
  });
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

  function handleLogin() { navigate("/demo"); }
  function handleGetStarted() {
    document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Nav />

      <main className="flex-1">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden" style={{ minHeight: "92vh" }}>
          <RadarBackground />

          <div className="relative z-10 max-w-screen-xl mx-auto px-4 sm:px-6"
            style={{ minHeight: "92vh", paddingTop: "6rem", paddingBottom: "5rem", display: "flex", flexDirection: "column", justifyContent: "center" }}>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Left: copy + stats */}
              <div className="flex flex-col items-start text-left">
                <h1 className="mb-6 font-black tracking-tight leading-[1.0] text-primary"
                  style={{ fontSize: "clamp(2.25rem, 5vw, 4.5rem)", textWrap: "balance" } as React.CSSProperties}>
                  The next biotech breakthrough is already published.
                </h1>
                <p className="text-base sm:text-lg max-w-lg leading-relaxed mb-10 text-foreground/65 dark:text-white/65">
                  Published assets sit undiscovered for months. Being first isn't about searching harder. Real-time institutional monitoring means the right assets find you first.
                </p>
                <Button
                  size="lg"
                  onClick={handleGetStarted}
                  data-testid="button-cta-get-started"
                  className="h-11 px-8 font-semibold gap-2"
                  style={{ background: "hsl(33 85% 44%)", border: "none", color: "white" }}
                >
                  Get started
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
                <div ref={statsRef} className="reveal-section grid grid-cols-2 gap-x-10 gap-y-5 mt-12 w-full max-w-sm">
                  {STATS.map((s) => (
                    <div key={s.label} data-testid={`stat-${s.label.replace(/\s+/g, "-").toLowerCase()}`}>
                      <div className="text-2xl font-bold mb-0.5" style={{ color: s.value === "350+" ? "hsl(33 85% 42%)" : "hsl(var(--primary))" }}>
                        {(s as { raw?: boolean }).raw ? s.value : <NumberTicker value={s.value} />}
                      </div>
                      <div className="text-[11px] tracking-wide font-semibold text-foreground/60 dark:text-white/60">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: interactive card deck */}
              <HeroCardDeck />
            </div>
          </div>

          <div
            className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent, hsl(var(--background)))" }}
          />
        </section>

        {/* ── Institution marquee ── */}
        <InstitutionMarquee />

        {/* ── What we do strip ── */}
        <section className="border-y border-border bg-card/50">
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-10">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary text-center sm:text-left mb-6">How it works</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center sm:text-left">
              {[
                {
                  icon: TrendingUp,
                  title: "Discover before the crowd",
                  desc: "Surface pre-clinical assets from 350+ tech transfer offices the moment they're published, EDEN-enriched with target, modality, and stage.",
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
        <div id="explore">
          <PortalToggle onLogin={handleLogin} />
        </div>

        {/* ── EdenMarket section ── */}
        <section className="border-t border-border bg-background">
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
              <div className="space-y-5">
                <p className="text-[10px] font-mono font-bold uppercase tracking-[0.15em]"
                  style={{ color: "hsl(var(--portal-market) / 0.7)" }}
                >
                  EdenMarket
                </p>
                <h2 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight">
                  The blind marketplace for{" "}
                  <span style={{ color: "hsl(var(--portal-market))" }}>licensable biotech assets</span>
                </h2>
                <p className="text-base text-muted-foreground leading-relaxed">
                  Buyers see structured listings — therapeutic area, modality, stage, IP profile — without seller identities. Engage anonymously, sign an NDA inside the deal room, and unlock the full asset only when both sides agree.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="flex items-start gap-2.5">
                    <Lock className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "hsl(var(--portal-market))" }} />
                    <div>
                      <p className="text-xs font-semibold text-foreground">Blind by default</p>
                      <p className="text-[11px] text-muted-foreground leading-snug">Identity hidden until NDA signed.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Handshake className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "hsl(var(--portal-market))" }} />
                    <div>
                      <p className="text-xs font-semibold text-foreground">NDA-gated deal room</p>
                      <p className="text-[11px] text-muted-foreground leading-snug">Documents, messages, audit trail.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "hsl(var(--portal-market))" }} />
                    <div>
                      <p className="text-xs font-semibold text-foreground">Success-fee aligned</p>
                      <p className="text-[11px] text-muted-foreground leading-snug">Pay only when a deal closes — see pricing.</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 pt-3">
                  <Link href="/market">
                    <Button
                      className="h-10 px-5 font-semibold gap-2 w-full sm:w-auto"
                      style={{ background: "hsl(var(--portal-market))", color: "white", border: "none" }}
                      data-testid="button-landing-edenmarket-buyer"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      Browse EdenMarket
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                  <Link href="/market/list">
                    <Button
                      variant="outline"
                      className="h-10 px-5 font-semibold gap-2 w-full sm:w-auto"
                      style={{ borderColor: "hsl(var(--portal-market) / 0.4)", color: "hsl(var(--portal-market))" }}
                      data-testid="button-landing-edenmarket-seller"
                    >
                      List your assets
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">
                  Already a buyer?{" "}
                  <Link href="/market/login" className="font-medium hover:underline" style={{ color: "hsl(var(--portal-market))" }} data-testid="link-landing-market-signin">
                    Sign in to EdenMarket
                  </Link>
                </p>
              </div>

              <div className="rounded-2xl p-6 sm:p-8 space-y-4" style={{ background: "linear-gradient(135deg, hsl(var(--portal-market) / 0.08), hsl(var(--portal-market) / 0.02))", border: "1px solid hsl(var(--portal-market) / 0.20)" }}>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sample listing</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "hsl(var(--portal-market) / 0.15)", color: "hsl(var(--portal-market))" }}>BLIND</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-bold text-foreground">Pre-clinical oncology asset · ADC platform</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Solid-tumor indication · IND-enabling studies underway</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border/50">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Modality</p>
                      <p className="text-xs font-semibold text-foreground mt-0.5">ADC</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Stage</p>
                      <p className="text-xs font-semibold text-foreground mt-0.5">Pre-clinical</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">IP</p>
                      <p className="text-xs font-semibold text-foreground mt-0.5">PCT filed</p>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-border/50 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Seller identity revealed after NDA</span>
                    <Lock className="w-3.5 h-3.5" style={{ color: "hsl(var(--portal-market))" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Bottom CTA ── */}
        <BottomCTA onLogin={handleLogin} />
      </main>

      <footer className="border-t border-border py-10 bg-background">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">For Researchers</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/research" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-edenlab">
                    EdenLab
                  </Link>
                </li>
                <li>
                  <Link href="/discovery" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-edendiscovery">
                    EdenDiscovery
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">For Industry</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/scout" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-EdenRadar">
                    EdenRadar
                  </Link>
                </li>
                <li>
                  <Link href="/market" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-edenmarket">
                    EdenMarket
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Company</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/about" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-about">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/how-it-works" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-how-it-works">
                    How It Works
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-pricing">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/demo" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-demo">
                    Request Access
                  </Link>
                </li>
                <li>
                  <Link href="/one-pager" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-one-pager">
                    EdenRadar One-Pager
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Legal</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/privacy" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-privacy">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/tos" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-tos">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <button
                    onClick={() => navigate("/login")}
                    className="text-xs text-foreground hover:text-primary transition-colors text-left"
                    data-testid="footer-link-login"
                  >
                    Log In
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground text-sm">
                Eden<span className="text-primary">Radar</span>
              </span>
              <span className="text-muted-foreground text-xs">· AI Biotech Asset Intelligence</span>
              <span className="text-muted-foreground text-xs">· © {new Date().getFullYear()}</span>
            </div>
            <EdenNXBadge />
          </div>
        </div>
      </footer>
    </div>
  );
}
