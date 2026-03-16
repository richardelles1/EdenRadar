import { useState, useEffect, useRef, Fragment } from "react";
import {
  Printer,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Lightbulb,
  FlaskConical,
  Sprout,
  ArrowRight,
  Database,
  Brain,
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
  ExternalLink,
  Sun,
  Moon,
  Zap,
  Link2,
  Lock,
  Workflow,
} from "lucide-react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import imgIdeation from "@assets/pexels-edmond-dantes-4347481_1773638670423.jpg";
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
  redDim: "rgba(248,81,73,0.14)",
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
  redDim: "rgba(207,34,46,0.10)",
};

type Colors = typeof DARK;

/* ─── Radar background anchored to LEFT quarter (doesn't hide behind photo) ─── */
function PitchLeftRadar({ color, opacity = 0.18 }: { color: string; opacity?: number }) {
  const hex = Math.round(opacity * 255).toString(16).padStart(2, "0");
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden style={{ zIndex: 0 }}>
      {/* spinning sweep anchored at 25% x, 50% y */}
      <div
        style={{
          position: "absolute",
          left: "25%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(70vw, 620px)",
          height: "min(70vw, 620px)",
          animation: "radar-bg-slow 22s linear infinite",
          transformOrigin: "center center",
          background: `conic-gradient(from 0deg, transparent 260deg, ${color}0d 310deg, ${color}${hex} 360deg)`,
          borderRadius: "50%",
        }}
      />
      {[190, 320, 440, 550].map((r, i) => (
        <div
          key={r}
          style={{
            position: "absolute",
            left: "25%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: r,
            height: r,
            borderRadius: "50%",
            border: `1px solid ${color}${Math.round((0.09 - i * 0.015) * 255).toString(16).padStart(2, "0")}`,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: "25%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: color,
          animation: "pulse-ring 3s ease-out infinite",
          opacity: 0,
        }}
      />
    </div>
  );
}

/* ─── Centered radar (for slides without a side photo panel) ─── */
function PitchCenterRadar({ color, opacity = 0.12 }: { color: string; opacity?: number }) {
  const hex = Math.round(opacity * 255).toString(16).padStart(2, "0");
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden style={{ zIndex: 0 }}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(70vw, 600px)",
          height: "min(70vw, 600px)",
          animation: "radar-bg-slow 22s linear infinite",
          transformOrigin: "center center",
          background: `conic-gradient(from 0deg, transparent 260deg, ${color}0d 310deg, ${color}${hex} 360deg)`,
          borderRadius: "50%",
        }}
      />
      {[180, 300, 420, 530].map((r, i) => (
        <div
          key={r}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: r,
            height: r,
            borderRadius: "50%",
            border: `1px solid ${color}${Math.round((0.09 - i * 0.015) * 255).toString(16).padStart(2, "0")}`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Floating dots ─── */
function PitchDots({ color, count = 8 }: { color: string; count?: number }) {
  const dots = Array.from({ length: count }, (_, i) => ({
    x: `${10 + (i * 71 + 29) % 82}%`,
    y: `${8 + (i * 53 + 17) % 80}%`,
    size: 1.2 + (i % 4) * 0.7,
    delay: `${i * 0.55}s`,
    dur: `${5.5 + (i % 5) * 1.1}s`,
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden style={{ zIndex: 0 }}>
      {dots.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: p.x, top: p.y,
            width: p.size * 2, height: p.size * 2,
            background: color,
            animation: `particle-drift ${p.dur} ease-in-out ${p.delay} infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Mycelium vine (cover only) ─── */
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
const SEC_TIPS: [number, number][][] = [
  [[290,478],[402,495]], [[418,502],[545,512]], [[615,495],[722,465]],
  [[292,205],[302,315]], [[335,172],[362,272]], [[708,218],[708,325]],
];
interface MycStrand { d: string; sw: number; so: number; delay: number; dur: number }
interface MycNode { cx: number; cy: number; r: number; delay: number }
function buildMycelium() {
  const strands: MycStrand[] = [], nodes: MycNode[] = [];
  const init = 1.2, pDur = 4, pGap = 0.9, sDur = 2.5;
  const pDel = (i: number) => init + i * pGap;
  const sDel = (pi: number) => pDel(pi) + pDur * 0.6;
  PRIMARY_PATHS.forEach((d, i) => { strands.push({ d, sw: 1.4, so: 0.22, delay: pDel(i), dur: pDur }); });
  SECONDARY_PATHS.forEach((pair, pi) => { pair.forEach((d) => { strands.push({ d, sw: 0.9, so: 0.15, delay: sDel(pi), dur: sDur }); }); });
  SEC_TIPS.forEach((pair, pi) => { pair.forEach(([cx, cy]) => { nodes.push({ cx, cy, r: 2.0, delay: sDel(pi) + sDur + 0.15 }); }); });
  return { strands, nodes };
}
const { strands: MYC_STRANDS, nodes: MYC_NODES } = buildMycelium();

function CoverVine({ color }: { color: string }) {
  return (
    <div className="absolute inset-0 pointer-events-none select-none hidden sm:block" style={{ zIndex: 1 }} aria-hidden>
      <svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
        {MYC_STRANDS.map((s, i) => (
          <motion.path key={`ms-${i}`} d={s.d} fill="none" stroke={color} strokeWidth={s.sw} strokeOpacity={s.so} strokeLinecap="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: s.delay, duration: s.dur, ease: "easeInOut" }} />
        ))}
        {MYC_NODES.map((n, i) => (
          <motion.circle key={`mn-${i}`} cx={n.cx} cy={n.cy} r={n.r} fill={color} fillOpacity={0.35}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: n.delay, duration: 0.5, type: "spring", stiffness: 160, damping: 18 }} />
        ))}
      </svg>
    </div>
  );
}

/* ─── Broken Pipeline SVG — two break points ─── */
function BrokenPipelineSVG({ color }: { color: string }) {
  return (
    <div className="w-full flex items-center justify-center" aria-hidden>
      <svg viewBox="0 0 820 200" className="w-full max-w-3xl" style={{ overflow: "visible" }}>
        <defs>
          <style>{`
            @keyframes pipe-break-a { 0%,35%{stroke-dashoffset:0;opacity:.5}55%,100%{stroke-dashoffset:48;opacity:.12} }
            @keyframes pipe-break-b { 0%,45%{stroke-dashoffset:0;opacity:.5}65%,100%{stroke-dashoffset:48;opacity:.12} }
            @keyframes node-dim { 0%,40%{opacity:.65}60%,100%{opacity:.22} }
            @keyframes node-steady { 0%,100%{opacity:.65} }
            @keyframes x-flash { 0%,20%{opacity:0}35%{opacity:.85}55%{opacity:0}75%,100%{opacity:0} }
            @keyframes x-flash-b { 0%,40%{opacity:0}55%{opacity:.85}75%{opacity:0}100%{opacity:0} }
          `}</style>
        </defs>

        {/* nodes: Concept, Research, Tech Transfer, Industry — evenly spaced */}
        {[
          { cx: 90, label: "Concept", steady: true },
          { cx: 300, label: "Research", steady: true },
          { cx: 510, label: "Tech Transfer", dim: true, fontSize: 10 },
          { cx: 720, label: "Industry", dim: true },
        ].map((n) => (
          <g key={n.label}>
            <circle cx={n.cx} cy={100} r={24} fill="none" stroke={color} strokeWidth="2"
              style={{ animation: n.dim ? "node-dim 4s ease-in-out infinite" : "node-steady 4s ease-in-out infinite" }} />
            <circle cx={n.cx} cy={100} r={5} fill={color} style={{ opacity: n.dim ? 0.3 : 0.65 }} />
            <text x={n.cx} y={146} textAnchor="middle" fill={color} fontSize={('fontSize' in n && n.fontSize) || 12} fontWeight="600"
              style={{ opacity: n.dim ? 0.35 : 0.72 }}>{n.label}</text>
          </g>
        ))}

        {/* Connector: Concept → Research (solid, working) */}
        <line x1="114" y1="100" x2="276" y2="100" stroke={color} strokeWidth="2" strokeDasharray="8 5" strokeOpacity="0.52" />

        {/* BREAK 1: Research → TTO */}
        <line x1="324" y1="100" x2="486" y2="100" stroke={color} strokeWidth="2.5" strokeDasharray="8 5"
          style={{ animation: "pipe-break-a 4.5s ease-in-out infinite" }} />
        {/* X mark on break 1 */}
        <line x1="375" y1="80" x2="435" y2="120" stroke={color} strokeWidth="3" strokeLinecap="round"
          style={{ animation: "x-flash 4.5s ease-in-out infinite" }} />
        <line x1="435" y1="80" x2="375" y2="120" stroke={color} strokeWidth="3" strokeLinecap="round"
          style={{ animation: "x-flash 4.5s ease-in-out infinite" }} />

        {/* BREAK 2: TTO → Industry */}
        <line x1="534" y1="100" x2="696" y2="100" stroke={color} strokeWidth="2.5" strokeDasharray="8 5"
          style={{ animation: "pipe-break-b 4.5s ease-in-out 0.8s infinite" }} />
        {/* X mark on break 2 */}
        <line x1="585" y1="80" x2="645" y2="120" stroke={color} strokeWidth="3" strokeLinecap="round"
          style={{ animation: "x-flash-b 4.5s ease-in-out 0.8s infinite" }} />
        <line x1="645" y1="80" x2="585" y2="120" stroke={color} strokeWidth="3" strokeLinecap="round"
          style={{ animation: "x-flash-b 4.5s ease-in-out 0.8s infinite" }} />

        <text x="410" y="180" textAnchor="middle" fill={color} fontSize="11" fontStyle="italic" opacity="0.45">
          Two breaks in the pipeline. Industry never sees what research produces.
        </text>
      </svg>
    </div>
  );
}

/* ─── Slide nav — right side on desktop, bottom bar on mobile ─── */
function SlideNav({ current, onJump, colors }: { current: number; onJump: (i: number) => void; colors: Colors }) {
  return (
    <>
      {/* Desktop: right side vertical */}
      <div className="pitch-nav hidden md:flex fixed right-5 top-1/2 -translate-y-1/2 z-50 flex-col items-center gap-2">
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

      {/* Mobile: bottom bar */}
      <div className="pitch-nav md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 rounded-full" style={{ background: `${colors.bgLight}ee`, border: `1px solid ${colors.border}` }} data-testid="pitch-nav-mobile">
        <button onClick={() => onJump(Math.max(0, current - 1))} className="p-1" aria-label="Previous slide">
          <ChevronLeft className="w-4 h-4" style={{ color: colors.textMuted }} />
        </button>
        {Array.from({ length: SLIDE_COUNT }, (_, i) => (
          <button key={i} onClick={() => onJump(i)} className="flex items-center justify-center" aria-label={`Go to slide ${i + 1}`}>
            <span className="block rounded-full transition-all duration-300" style={{ width: current === i ? 8 : 5, height: current === i ? 8 : 5, background: current === i ? colors.green : "rgba(128,128,128,0.4)", boxShadow: current === i ? `0 0 6px ${colors.green}` : "none" }} />
          </button>
        ))}
        <button onClick={() => onJump(Math.min(SLIDE_COUNT - 1, current + 1))} className="p-1" aria-label="Next slide">
          <ChevronRight className="w-4 h-4" style={{ color: colors.textMuted }} />
        </button>
      </div>
    </>
  );
}

function useCountUp(target: number, active: boolean, skip = false, duration = 1200): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) { setValue(0); return; }
    if (skip) { setValue(target); return; }
    const start = performance.now();
    let rafId: number;
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [active, target, skip, duration]);
  return value;
}

function Slide({
  index, section, accent, children, className = "", noPadding = false, colors,
}: {
  index: number; section: string; accent?: string; children: React.ReactNode; className?: string; noPadding?: boolean; colors: Colors;
}) {
  const accentColor = accent || colors.green;
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { once: true, amount: 0.3 });
  const reducedMotion = useReducedMotion();
  const skip = !!reducedMotion;
  return (
    <section
      ref={sectionRef}
      className={`pitch-slide relative w-full flex flex-col justify-center overflow-hidden ${className}`}
      style={{ minHeight: "100svh", background: colors.bg, scrollSnapAlign: "start" }}
      data-testid={`pitch-slide-${index}`}
    >
      <div className="absolute top-4 sm:top-6 left-4 sm:left-8 flex items-center gap-3" style={{ zIndex: 10 }}>
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: accentColor }}>{String(index).padStart(2, "0")}</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: colors.textMuted }}>{section}</span>
      </div>
      <motion.div
        className={`relative z-10 w-full max-w-6xl mx-auto pt-10 sm:pt-12 pb-12 sm:pb-0 ${noPadding ? "" : "px-5 sm:px-12 lg:px-20"}`}
        style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}
        initial={skip ? false : { opacity: 0, y: 20 }}
        animate={skip || inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={skip ? { duration: 0 } : { duration: 0.6, ease: "easeOut" }}
      >
        {children}
      </motion.div>
      <div className="absolute bottom-3 left-0 right-0 flex items-center justify-between px-5 sm:px-8" style={{ zIndex: 10 }}>
        <span className="text-xs font-semibold tracking-widest" style={{ color: `${colors.text}22` }}>EDENRADAR</span>
        <span className="text-xs" style={{ color: `${colors.text}22` }}>Confidential</span>
      </div>
    </section>
  );
}

/* ═══════════════════════ SLIDE 1 — COVER ═══════════════════════ */
function CoverSlide({ colors }: { colors: Colors }) {
  return (
    <section
      className="pitch-slide relative w-full overflow-hidden flex"
      style={{ minHeight: "100svh", background: colors.bg, scrollSnapAlign: "start" }}
      data-testid="pitch-slide-1"
    >
      {/* radar anchored left, behind everything */}
      <PitchLeftRadar color={colors.green} opacity={0.2} />
      {/* vine animation layer */}
      <CoverVine color={colors.green} />
      {/* dots above vine */}
      <PitchDots color={colors.green} count={12} />

      <div className="absolute top-4 sm:top-6 left-4 sm:left-8 flex items-center gap-3" style={{ zIndex: 10 }}>
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: colors.green }}>01</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: colors.textMuted }}>Cover</span>
      </div>

      <div className="flex flex-1 items-stretch">
        {/* text panel — z-10 so it's above vine/dots */}
        <div className="flex flex-col justify-center flex-1 px-5 sm:px-14 lg:px-20 py-10 sm:py-20 pb-14 sm:pb-20 relative z-10">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-3" style={{ color: colors.text }}>
            Eden<span style={{ color: colors.green }}>Radar</span>
          </h1>
          <p className="text-lg sm:text-xl font-semibold mb-4" style={{ color: colors.green }}>AI-Powered Biotech Asset Matchmaking</p>
          <p className="text-sm sm:text-base max-w-sm sm:max-w-md mb-8 sm:mb-10" style={{ color: colors.textMuted }}>
            The first platform to connect early-stage concept, development, structured labs, institutional research, and industry asset intelligence in a single ecosystem.
          </p>
          <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-xs" style={{ color: colors.textMuted }}>
            <span>Founded 2026</span>
            <span className="w-1 h-1 rounded-full" style={{ background: colors.green }} />
            <span>Pre-Seed</span>
            <span className="w-1 h-1 rounded-full" style={{ background: colors.green }} />
            <span>edenradar.com</span>
          </div>
        </div>

        {/* photo panel — z-20 so it sits IN FRONT of vine/dots/radar */}
        <div className="hidden md:block w-[40%] relative shrink-0" style={{ zIndex: 20 }}>
          <img
            src={imgLabWork}
            alt="Researchers at work"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: "right center" }}
          />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to right, ${colors.bg} 0%, transparent 28%), linear-gradient(to top, ${colors.bg}88 0%, transparent 50%)` }} />
          <div className="absolute inset-0" style={{ background: `${colors.green}0d` }} />
        </div>
      </div>

      <div className="absolute bottom-3 left-0 right-0 flex items-center justify-between px-5 sm:px-8" style={{ zIndex: 10 }}>
        <span className="text-xs font-semibold tracking-widest" style={{ color: `${colors.text}22` }}>EDENRADAR</span>
        <span className="text-xs" style={{ color: `${colors.text}22` }}>Confidential</span>
      </div>
    </section>
  );
}

/* ═══════════════════════ SLIDE 2 — PROBLEM ═══════════════════════ */
function ProblemSlide({ colors }: { colors: Colors }) {
  const problems = [
    { icon: AlertTriangle, title: "Innovation Gets Buried", desc: "Breakthrough concepts stall in university labs with no pathway to industry attention." },
    { icon: Search, title: "Industry Starts Too Late", desc: "Commercial discovery tools begin at the patent stage. The best assets are already locked, gone, or unfunded." },
    { icon: Layers, title: "No Shared Intelligence", desc: "Researchers, Technology Transfer Offices (TTOs), and Business Development teams use disconnected systems. The pipeline has no connective tissue." },
  ];

  return (
    <section
      className="pitch-slide relative w-full overflow-hidden flex"
      style={{ minHeight: "100svh", background: colors.bg, scrollSnapAlign: "start" }}
      data-testid="pitch-slide-2"
    >
      <PitchDots color={colors.red} count={8} />

      <div className="absolute top-4 sm:top-6 left-4 sm:left-8 flex items-center gap-3" style={{ zIndex: 10 }}>
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: colors.red }}>02</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: colors.textMuted }}>The Problem</span>
      </div>

      <div className="flex flex-col justify-center flex-1 px-5 sm:px-14 lg:px-20 py-10 sm:py-16 pb-14 sm:pb-16 relative z-10">
        <div className="mb-2 sm:mb-3 inline-block px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-widest w-fit" style={{ background: colors.redDim, color: colors.red }}>
          $2.6B average cost to bring a drug to market
        </div>
        <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-5" style={{ color: colors.text }}>
          The pipeline is <span style={{ color: colors.red }}>broken</span> before it begins.
        </h2>

        <div className="mb-4 sm:mb-8">
          <BrokenPipelineSVG color={colors.red} />
        </div>

        <div className="space-y-1.5 sm:space-y-3">
          {problems.map((p) => (
            <div key={p.title} className="flex items-start gap-3 sm:gap-4 rounded-xl p-3 sm:p-4" style={{ background: colors.bgLight, border: `1px solid ${colors.border}` }}>
              <p.icon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 mt-0.5" style={{ color: colors.red }} />
              <div>
                <p className="text-sm font-bold mb-0.5" style={{ color: colors.text }}>{p.title}</p>
                <p className="text-xs sm:text-sm" style={{ color: colors.textMuted }}>{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-3 left-0 right-0 flex items-center justify-between px-5 sm:px-8" style={{ zIndex: 10 }}>
        <span className="text-xs font-semibold tracking-widest" style={{ color: `${colors.text}22` }}>EDENRADAR</span>
        <span className="text-xs" style={{ color: `${colors.text}22` }}>Confidential</span>
      </div>
    </section>
  );
}

/* ═══════════════════════ SLIDE 3 — SOLUTION ═══════════════════════ */
function SolutionSlide({ colors }: { colors: Colors }) {
  const stages = [
    { label: "Concept Community", accent: "Discovery", color: colors.amber, dim: colors.amberDim, icon: Lightbulb, desc: "A creative community where biotech ideas are born. Submit hypotheses, get scored, and connect with collaborators before research begins." },
    { label: "Project-Based Research", accent: "Lab", color: colors.violet, dim: colors.violetDim, icon: FlaskConical, desc: "Structured project workspace with intuitive tools for literature review, AI synthesis, grants, and industry visibility." },
    { label: "Industry Intelligence", accent: "Radar", color: colors.green, dim: colors.greenDim, icon: Sprout, desc: "AI-enriched asset dossiers from 200+ monitored Technology Transfer Offices (TTOs) with real-time convergence signals." },
  ];
  return (
    <Slide index={3} section="Our Solution" accent={colors.green} colors={colors}>
      <PitchDots color={colors.green} count={6} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 30% 60%, ${colors.green}0a 0%, transparent 60%)` }} />
      <p className="text-[10px] sm:text-sm font-bold uppercase tracking-widest mb-2 sm:mb-3" style={{ color: colors.green }}>One platform. Three tiers. Continuous signal.</p>
      <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold mb-4 sm:mb-8" style={{ color: colors.text }}>
        EdenRadar <span style={{ color: colors.green }}>powers</span> the <span style={{ color: colors.green }}>full life cycle</span>.
      </h2>
      <div className="relative">
        <div className="absolute top-1/2 left-0 right-0 h-px hidden sm:block" style={{ background: `linear-gradient(to right, ${colors.amber}, ${colors.violet}, ${colors.green})`, opacity: 0.4, transform: "translateY(-50%)" }} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 relative">
          {stages.map((s, i) => (
            <div key={s.label} className="rounded-xl p-5 sm:p-6 relative" style={{ background: s.dim, border: `1px solid ${s.color}44`, borderTop: `3px solid ${s.color}` }}>
              <div className="flex sm:flex-col items-center sm:items-start gap-4 sm:gap-0 mb-3">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shrink-0 sm:mb-3" style={{ background: s.color }}>
                  <s.icon className="w-6 h-6 sm:w-7 sm:h-7" style={{ color: "#fff" }} />
                </div>
                <div>
                  <p className="text-lg sm:text-xl font-bold leading-tight" style={{ color: colors.text }}>
                    Eden<span style={{ color: s.color }}>{s.accent}</span>
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: colors.textMuted }}>{s.label}</p>
                </div>
              </div>
              <p className="text-xs sm:text-sm" style={{ color: colors.textMuted }}>{s.desc}</p>
              {i < 2 && <ArrowRight className="absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 hidden sm:block z-10" style={{ color: colors.textMuted }} />}
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}

/* ═══════════════════════ SLIDE 4 — THREE PORTALS ═══════════════════════ */
function PortalsSlide({ colors }: { colors: Colors }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const gridInView = useInView(gridRef, { once: true, amount: 0.2 });
  const reducedMotion = useReducedMotion();
  const skip = !!reducedMotion;
  const portals = [
    {
      title: "EdenDiscovery", tier: "Tier 1", tagline: "Creative concept community", color: colors.amber, dim: colors.amberDim, icon: Lightbulb,
      items: ["Submit hypotheses before research begins", "AI credibility scoring (0 to 100)", "Discovered by collaborators and funders"],
    },
    {
      title: "EdenLab", tier: "Tier 2", tagline: "Project-based research workspace", color: colors.violet, dim: colors.violetDim, icon: FlaskConical,
      items: ["Literature search across 40+ data sources", "Intuitive tools with AI synthesis and evidence extraction", "Structured 11-section project canvas"],
    },
    {
      title: "EdenRadar", tier: "Tier 3", tagline: "Industry intelligence platform", color: colors.green, dim: colors.greenDim, icon: Sprout,
      items: ["200+ Tech Transfer Offices monitored continuously", "AI-scored and enriched asset dossiers", "Competing asset cross-reference by target"],
    },
  ];
  return (
    <Slide index={4} section="Three Portals" accent={colors.green} colors={colors}>
      <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-7" style={{ color: colors.text }}>
        Three portals. One <span style={{ color: colors.green }}>ecosystem</span>.
      </h2>
      <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
        {portals.map((p, i) => (
          <motion.div
            key={p.title}
            className="rounded-xl p-3 sm:p-6 flex flex-col"
            style={{ background: p.dim, border: `1px solid ${p.color}44`, borderTop: `3px solid ${p.color}` }}
            initial={skip ? false : { x: -16 }}
            animate={skip || gridInView ? { x: 0 } : {}}
            transition={skip ? { duration: 0 } : { duration: 0.45, delay: i * 0.12, ease: "easeOut" }}
          >
            <div className="flex items-center gap-2.5 mb-1.5 sm:mb-2">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: p.color }}>
                <p.icon className="w-4 h-4" style={{ color: "#fff" }} />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest leading-none mb-0.5" style={{ color: p.color }}>{p.tier}</p>
                <h3 className="text-sm sm:text-base font-bold leading-tight" style={{ color: colors.text }}>{p.title}</h3>
              </div>
            </div>
            <p className="text-[10px] sm:text-xs mb-2 sm:mb-4 leading-snug" style={{ color: colors.textMuted }}>{p.tagline}</p>
            <ul className="space-y-1 sm:space-y-2 mt-auto">
              {p.items.map((item) => (
                <li key={item} className="flex items-start gap-1.5 sm:gap-2 text-[10px] sm:text-xs" style={{ color: colors.text }}>
                  <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 mt-0.5 shrink-0" style={{ color: p.color }} />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .pipeline-dash { animation: dash-flow 1.8s linear infinite; }
        }
        @keyframes dash-flow {
          0% { stroke-dashoffset: 20; }
          100% { stroke-dashoffset: 0; }
        }
      `}</style>
      <div className="hidden sm:flex items-center justify-center mt-5 gap-0">
        {portals.map((p, i) => (
          <Fragment key={p.title}>
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `${p.color}22`, border: `2px solid ${p.color}` }}>
                <p.icon className="w-3.5 h-3.5" style={{ color: p.color }} />
              </div>
              <span className="text-[9px] font-bold tracking-wider uppercase" style={{ color: p.color }}>{p.title.replace("Eden", "")}</span>
            </div>
            {i < 2 && (
              <svg width="80" height="12" viewBox="0 0 80 12" className="mx-2 mb-4" aria-hidden>
                <line x1="0" y1="6" x2="65" y2="6" stroke={`${portals[i + 1].color}33`} strokeWidth="2" strokeLinecap="round" />
                <line x1="0" y1="6" x2="65" y2="6" stroke={portals[i + 1].color} strokeWidth="2" strokeLinecap="round" strokeDasharray="12 8" strokeOpacity="0.6" className="pipeline-dash" />
                <polygon points="68,1.5 78,6 68,10.5" fill={portals[i + 1].color} fillOpacity="0.45" />
              </svg>
            )}
          </Fragment>
        ))}
      </div>
      <p className="sm:hidden mt-3 text-center text-[9px] font-bold uppercase tracking-widest" style={{ color: colors.textMuted }}>
        Discovery → Lab → Radar
      </p>
    </Slide>
  );
}

/* ═══════════════════════ SLIDE 5 — EDEN DISCOVERY ═══════════════════════ */
function DiscoverySlide({ colors }: { colors: Colors }) {
  const features = [
    { icon: Sparkles, label: "AI Credibility Scoring", desc: "0 to 100 scale with instant evaluation against existing literature" },
    { icon: Target, label: "Landscape Intelligence", desc: "Automated PubMed and bioRxiv scan at submission" },
    { icon: Users, label: "Interest Signals", desc: "Collaborators, funders, and advisors can flag and follow concepts" },
    { icon: Lock, label: "Active Community Connection", desc: "Privacy-protected information exchange between scientists, collaborators, and funders within a verified ecosystem" },
  ];
  return (
    <section
      className="pitch-slide relative w-full overflow-hidden flex"
      style={{ minHeight: "100svh", background: colors.bg, scrollSnapAlign: "start" }}
      data-testid="pitch-slide-5"
    >
      {/* dots only — no rings/sweep on Discovery */}
      <PitchDots color={colors.amber} count={16} />

      <div className="absolute top-4 sm:top-6 left-4 sm:left-8 flex items-center gap-3" style={{ zIndex: 10 }}>
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: colors.amber }}>05</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: colors.textMuted }}>EdenDiscovery</span>
      </div>

      <div className="flex flex-1 items-stretch">
        <div className="flex flex-col justify-center flex-1 px-5 sm:px-12 lg:px-16 py-10 sm:py-16 pb-14 sm:pb-16 relative z-10">
          <div className="flex items-center gap-3 mb-3 sm:mb-5">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center" style={{ background: colors.amberDim }}>
              <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: colors.amber }} />
            </div>
            <div>
              <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold" style={{ color: colors.text }}>
                Eden<span style={{ color: colors.amber }}>Discovery</span>
              </h2>
              <p className="text-[10px] sm:text-xs" style={{ color: colors.textMuted }}>Tier 1 — Creative concept community</p>
            </div>
          </div>
          <p className="text-xs sm:text-base mb-4 sm:mb-7 max-w-md" style={{ color: colors.textMuted }}>
            Where biotech concepts are born. Submit a hypothesis, get scored, and get discovered by collaborators and funders before anyone else sees it.
          </p>
          {/* 2-col grid for 4 boxes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            {features.map((f) => (
              <div key={f.label} className="flex items-start gap-2 sm:gap-3 rounded-xl p-2.5 sm:p-4" style={{ background: colors.bgLight, border: `1px solid ${colors.amber}33` }}>
                <f.icon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 mt-0.5" style={{ color: colors.amber }} />
                <div>
                  <p className="text-xs sm:text-sm font-semibold mb-0.5" style={{ color: colors.text }}>{f.label}</p>
                  <p className="text-[10px] sm:text-xs" style={{ color: colors.textMuted }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 sm:mt-5 inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-[10px] sm:text-xs font-semibold w-fit" style={{ background: colors.amberDim, color: colors.amber, border: `1px solid ${colors.amber}44` }}>
            <Globe className="w-3.5 h-3.5" />
            Public feed: no login required to browse
          </div>
        </div>

        <div className="hidden md:block w-[36%] relative shrink-0" style={{ zIndex: 20 }}>
          <img src={imgIdeation} alt="Team ideating" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: "center" }} />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to right, ${colors.bg} 0%, transparent 25%), linear-gradient(to top, ${colors.bg}cc 0%, transparent 50%)` }} />
          <div className="absolute inset-0" style={{ background: `${colors.amber}12` }} />
        </div>
      </div>

      <div className="absolute bottom-3 left-0 right-0 flex items-center justify-between px-5 sm:px-8" style={{ zIndex: 10 }}>
        <span className="text-xs font-semibold tracking-widest" style={{ color: `${colors.text}22` }}>EDENRADAR</span>
        <span className="text-xs" style={{ color: `${colors.text}22` }}>Confidential</span>
      </div>
    </section>
  );
}

/* ═══════════════════════ SLIDE 6 — EDEN LAB ═══════════════════════ */
function LabSlide({ colors }: { colors: Colors }) {
  const features = [
    { icon: BookOpen, label: "40+ Data Sources", desc: "PubMed, bioRxiv, ClinicalTrials.gov, Semantic Scholar, OpenAlex, CORE, Lens.org, Harvard Dataverse, Figshare, Dryad, EMBL-EBI BioStudies, Zenodo" },
    { icon: Workflow, label: "Intuitive Research Project Workflow", desc: "Structured 11-section canvas guiding research from hypothesis through publication" },
    { icon: Brain, label: "AI Synthesis", desc: "Structured summaries, key finding extraction, and evidence mapping across all sources" },
    { icon: Award, label: "Grants & Smart Alerts", desc: "NIH, NSF, and SBIR matched to your profile. Personalized alerts based on interests and expertise" },
    { icon: Link2, label: "Shared Ecosystem", desc: "Direct signal flow from EdenLab to EdenRadar, placing your work in front of industry partners seamlessly" },
  ];
  return (
    <section
      className="pitch-slide relative w-full overflow-hidden flex"
      style={{ minHeight: "100svh", background: colors.bg, scrollSnapAlign: "start" }}
      data-testid="pitch-slide-6"
    >
      <PitchCenterRadar color={colors.violet} opacity={0.08} />
      <PitchDots color={colors.violet} count={10} />

      <div className="absolute top-4 sm:top-6 left-4 sm:left-8 flex items-center gap-3" style={{ zIndex: 10 }}>
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: colors.violet }}>06</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: colors.textMuted }}>EdenLab</span>
      </div>

      <div className="flex flex-1 items-stretch">
        <div className="flex flex-col justify-center flex-1 px-5 sm:px-12 lg:px-16 py-10 sm:py-16 pb-14 sm:pb-16 relative z-10">
          <div className="flex items-center gap-3 mb-3 sm:mb-4">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center" style={{ background: colors.violetDim }}>
              <FlaskConical className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: colors.violet }} />
            </div>
            <div>
              <h2 className="text-xl sm:text-3xl font-bold" style={{ color: colors.text }}>
                Eden<span style={{ color: colors.violet }}>Lab</span>
              </h2>
              <p className="text-[10px] sm:text-xs" style={{ color: colors.textMuted }}>Tier 2 — Project-based research workspace</p>
            </div>
          </div>
          <p className="text-xs sm:text-sm mb-3 sm:mb-4 max-w-lg" style={{ color: colors.textMuted }}>
            A research workspace built for biotech. Literature, grants, and industry visibility in one AI-powered canvas, same ecosystem as EdenRadar, with seamless movement through the pipeline.
          </p>
          <div className="space-y-1.5 sm:space-y-2">
            {features.map((f) => (
              <div key={f.label} className="flex items-start gap-2 sm:gap-3 rounded-lg p-2.5 sm:p-3" style={{ background: colors.bgLight, border: `1px solid ${colors.violet}33` }}>
                <f.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 mt-0.5" style={{ color: colors.violet }} />
                <div>
                  <p className="text-[10px] sm:text-xs font-semibold mb-0.5" style={{ color: colors.text }}>{f.label}</p>
                  <p className="text-[10px] sm:text-xs leading-relaxed" style={{ color: colors.textMuted }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="hidden md:block w-[40%] relative shrink-0" style={{ zIndex: 20 }}>
          <img src={imgLabComp} alt="Researchers collaborating" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: "center 35%" }} />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to right, ${colors.bg} 0%, transparent 25%), linear-gradient(to top, ${colors.bg}88 0%, transparent 40%)` }} />
          <div className="absolute inset-0" style={{ background: `${colors.violet}12` }} />
        </div>
      </div>

      <div className="absolute bottom-3 left-0 right-0 flex items-center justify-between px-5 sm:px-8" style={{ zIndex: 10 }}>
        <span className="text-xs font-semibold tracking-widest" style={{ color: `${colors.text}22` }}>EDENRADAR</span>
        <span className="text-xs" style={{ color: `${colors.text}22` }}>Confidential</span>
      </div>
    </section>
  );
}

/* ═══════════════════════ SLIDE 7 — EDEN RADAR ═══════════════════════ */
function RadarSlide({ colors }: { colors: Colors }) {
  const features = [
    { icon: Building2, label: "200+ Tech Transfer Offices", desc: "Continuously scraped with bespoke and automated ingestion pipelines across major research universities" },
    { icon: FileBarChart2, label: "AI-Enriched Dossiers", desc: "Every asset classified by target, modality, indication, and development stage with supporting literature" },
    { icon: Zap, label: "First to Know", desc: "Real-time alerts on new listings, convergence signals, and rising activity clusters by therapy area" },
    { icon: TrendingUp, label: "Direct Lab Signals", desc: "Scored research signals from EdenLab and EdenDiscovery surface directly to industry teams" },
  ];
  return (
    <Slide index={7} section="EdenRadar" accent={colors.green} colors={colors}>
      <PitchCenterRadar color={colors.green} opacity={0.12} />
      <PitchDots color={colors.green} count={10} />
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center" style={{ background: colors.greenDim }}>
          <Sprout className="w-5 h-5" style={{ color: colors.green }} />
        </div>
        <div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold" style={{ color: colors.text }}>
            Eden<span style={{ color: colors.green }}>Radar</span>
          </h2>
          <p className="text-xs" style={{ color: colors.textMuted }}>Tier 3 — Industry intelligence</p>
        </div>
      </div>
      <p className="text-sm sm:text-base mb-5 sm:mb-7 max-w-2xl" style={{ color: colors.textMuted }}>
        The industry-facing layer. EdenRadar monitors 200+ Technology Transfer Offices, ingests new listings, and enriches every asset with classification, scoring, and supporting literature. Direct signals from EdenLab and EdenDiscovery ensure you see advancements directly from the labs and researchers themselves.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {features.map((f) => (
          <div key={f.label} className="rounded-xl p-4 sm:p-5 flex gap-3 sm:gap-4 items-start" style={{ background: colors.bgLight, border: `1px solid ${colors.green}33` }}>
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: colors.greenDim }}>
              <f.icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: colors.green }} />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-semibold mb-1" style={{ color: colors.text }}>{f.label}</p>
              <p className="text-xs" style={{ color: colors.textMuted }}>{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </Slide>
  );
}

/* ═══════════════════════ SLIDE 8 — TRACTION / PRICING ═══════════════════════ */
function StatCard({ num, suffix, text, label, icon: Icon, color, active, bgLight, border, textMuted }: {
  num?: number; suffix?: string; text?: string; label: string; icon: React.ElementType; color: string; active: boolean; bgLight: string; border: string; textMuted: string;
}) {
  const reducedMotion = useReducedMotion();
  const skip = !!reducedMotion;
  const count = useCountUp(num ?? 0, active && num !== undefined, skip);
  return (
    <div className="rounded-xl p-2 sm:p-4 flex flex-col items-center text-center" style={{ background: bgLight, border: `1px solid ${border}` }}>
      <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 mb-1" style={{ color }} />
      <motion.span
        className="text-sm sm:text-xl font-bold mb-0.5 leading-tight"
        style={{ color }}
        initial={skip ? false : { opacity: 0 }}
        animate={skip || active ? { opacity: 1 } : {}}
        transition={skip ? { duration: 0 } : { duration: 0.4, delay: 0.15 }}
      >
        {text ?? `${count}${suffix ?? ""}`}
      </motion.span>
      <span className="text-[8px] sm:text-[10px]" style={{ color: textMuted }}>{label}</span>
    </div>
  );
}

function TractionSlide({ colors }: { colors: Colors }) {
  const statsRef = useRef<HTMLDivElement>(null);
  const statsInView = useInView(statsRef, { once: true, amount: 0.3 });
  const stats: { num?: number; suffix?: string; text?: string; label: string; icon: React.ElementType; color: string }[] = [
    { num: 200, suffix: "+", label: "Tech Transfer Offices", icon: Building2, color: colors.green },
    { num: 40, suffix: "+", label: "Research Data Sources", icon: Database, color: colors.violet },
    { text: "Custom GPT-5", label: "Classifier & Enrichment", icon: Brain, color: colors.green },
    { num: 11, suffix: "-Step", label: "Research Workflow", icon: Workflow, color: colors.amber },
  ];
  const tiers = [
    { name: "EdenDiscovery", price: "$9.99", period: "/mo", color: colors.amber, dim: colors.amberDim, icon: Lightbulb, desc: "Concept community access, AI scoring, landscape intelligence" },
    { name: "EdenLab", price: "$24.99", period: "/mo", color: colors.violet, dim: colors.violetDim, icon: FlaskConical, desc: "Full research workspace, 40+ sources, intuitive project workflow, grants" },
    { name: "EdenRadar", price: "$44.99", period: "/mo", color: colors.green, dim: colors.greenDim, icon: Sprout, desc: "Industry intelligence, 200+ Tech Transfer Offices, AI dossiers, convergence signals, full ecosystem access" },
  ];
  return (
    <Slide index={8} section="What We've Built" accent={colors.green} colors={colors}>
      <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold mb-1 sm:mb-2" style={{ color: colors.text }}>
        Built, deployed, <span style={{ color: colors.green }}>running today</span>.
      </h2>
      <p className="text-[10px] sm:text-sm mb-3 sm:mb-6 max-w-2xl" style={{ color: colors.textMuted }}>
        This is not a roadmap. Every component below is processing real biotech data in production.
      </p>
      <div ref={statsRef} className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-3 mb-4 sm:mb-7">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} active={statsInView} bgLight={colors.bgLight} border={colors.border} textMuted={colors.textMuted} />
        ))}
      </div>
      <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-2 sm:mb-4" style={{ color: colors.green }}>Monthly Subscriptions</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-4">
        {tiers.map((t) => (
          <div key={t.name} className="rounded-xl p-2.5 sm:p-5 flex flex-row sm:flex-col items-center sm:items-center gap-2.5 sm:gap-0 text-left sm:text-center" style={{ background: t.dim, border: `1px solid ${t.color}44`, borderTop: `3px solid ${t.color}` }}>
            <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 sm:mb-3" style={{ background: `${t.color}22` }}>
              <t.icon className="w-3.5 h-3.5 sm:w-5 sm:h-5" style={{ color: t.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs sm:text-sm font-bold mb-0.5 sm:mb-1" style={{ color: colors.text }}>{t.name}</h3>
              <div className="mb-0.5 sm:mb-2">
                <span className="text-sm sm:text-2xl font-bold" style={{ color: t.color }}>{t.price}</span>
                <span className="text-[9px] sm:text-xs" style={{ color: colors.textMuted }}>{t.period}</span>
              </div>
              <p className="text-[9px] sm:text-xs leading-relaxed" style={{ color: colors.textMuted }}>{t.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </Slide>
  );
}

/* ═══════════════════════ SLIDE 9 — VISION ═══════════════════════ */
function VisionSlide({ colors }: { colors: Colors }) {
  return (
    <Slide index={9} section="The Vision" accent={colors.green} colors={colors}>
      <PitchDots color={colors.green} count={8} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 50% 50%, ${colors.green}0a 0%, transparent 60%)` }} />
      <div className="flex flex-col items-center text-center px-2 sm:px-8">
        <p className="text-xs font-bold uppercase tracking-widest mb-3 sm:mb-6" style={{ color: colors.green }}>Why this matters</p>
        <blockquote className="text-base sm:text-2xl lg:text-3xl xl:text-4xl font-bold leading-snug max-w-4xl mb-5 sm:mb-10" style={{ color: colors.text }}>
          "We accelerate pharmaceutical and biotech innovation by capturing research at its earliest possible moments in creating direct connections between scientists and the industry partners who can advance it."
        </blockquote>
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-6 mb-5 sm:mb-10">
          {[
            { label: "Concept", sublabel: "Early ideas matter", color: colors.amber },
            { label: "Research", sublabel: "Science needs reach", color: colors.violet },
            { label: "Industry", sublabel: "Business needs signal", color: colors.green },
          ].map((s, i) => (
            <div key={s.label} className="flex items-center gap-3 sm:gap-6">
              <div className="flex flex-col items-center gap-1.5 px-4 sm:px-5 py-3 rounded-xl" style={{ background: `${s.color}18`, border: `1px solid ${s.color}44` }}>
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                <span className="text-sm font-bold" style={{ color: s.color }}>{s.label}</span>
                <span className="text-xs" style={{ color: colors.textMuted }}>{s.sublabel}</span>
              </div>
              {i < 2 && <ArrowRight className="w-4 h-4 hidden sm:block" style={{ color: colors.textMuted }} />}
            </div>
          ))}
        </div>
        <p className="text-xs sm:text-sm max-w-xl" style={{ color: colors.textMuted }}>
          EdenRadar is building the connective tissue of biotech: an intelligence layer that makes the entire pipeline visible, searchable, and actionable from concept to commercialization.
        </p>
      </div>
    </Slide>
  );
}

/* ═══════════════════════ SLIDE 10 — CONTACT ═══════════════════════ */
function ContactSlide({ colors }: { colors: Colors }) {
  return (
    <Slide index={10} section="Contact" accent={colors.green} colors={colors}>
      <PitchCenterRadar color={colors.green} opacity={0.08} />
      <PitchDots color={colors.green} count={8} />
      <div className="flex flex-col items-center text-center px-2 sm:px-8">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mb-5 sm:mb-6" style={{ background: colors.greenDim, border: `2px solid ${colors.green}44` }}>
          <Sprout className="w-7 h-7 sm:w-8 sm:h-8" style={{ color: colors.green }} />
        </div>
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2" style={{ color: colors.text }}>
          Let's build the future of <span style={{ color: colors.green }}>biotech intelligence</span>.
        </h2>
        <p className="text-sm sm:text-base mb-6 sm:mb-8 max-w-lg" style={{ color: colors.textMuted }}>
          We're seeking advisors and early partners who believe the drug discovery pipeline should start earlier and move faster.
        </p>
        <a
          href="https://edenradar.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-3.5 rounded-full text-sm sm:text-base font-semibold transition-all hover:scale-105 mb-8 sm:mb-10"
          style={{ background: colors.green, color: "#fff" }}
          data-testid="pitch-cta-request-access"
        >
          Request Access
          <ExternalLink className="w-4 h-4" />
        </a>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 text-left max-w-sm sm:max-w-md w-full">
          <div className="rounded-xl p-4 sm:p-5" style={{ background: colors.bgLight, border: `1px solid ${colors.border}` }}>
            <p className="text-sm font-bold mb-0.5" style={{ color: colors.text }}>Wafick Mohamed</p>
            <p className="text-xs mb-1.5" style={{ color: colors.textMuted }}>Co-Founder & CEO</p>
            <p className="text-xs font-medium break-all" style={{ color: colors.accent }}>w.mohamed@edenradar.com</p>
          </div>
          <div className="rounded-xl p-4 sm:p-5" style={{ background: colors.bgLight, border: `1px solid ${colors.border}` }}>
            <p className="text-sm font-bold mb-0.5" style={{ color: colors.text }}>Richard Elles</p>
            <p className="text-xs mb-1.5" style={{ color: colors.textMuted }}>Co-Founder & COO</p>
            <p className="text-xs font-medium break-all" style={{ color: colors.accent }}>r.elles@edenradar.com</p>
          </div>
        </div>
      </div>
    </Slide>
  );
}

/* ═══════════════════════ ROOT ═══════════════════════ */
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
      style={{
        height: "100svh",
        overflowY: "auto",
        scrollSnapType: isPrint ? "none" : "y mandatory",
        scrollBehavior: "smooth",
        WebkitOverflowScrolling: "touch",
      } as React.CSSProperties}
      data-testid="pitch-deck"
    >
      {!isPrint && <SlideNav current={current} onJump={jumpTo} colors={colors} />}

      {!isPrint && (
        <div className="pitch-export fixed top-4 sm:top-6 right-14 sm:right-6 z-50 flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all hover:scale-105"
            style={{ background: colors.bgLight, color: colors.textMuted, border: `1px solid ${colors.border}` }}
            data-testid="pitch-theme-toggle"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => window.print()}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105"
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
