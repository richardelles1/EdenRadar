import { useState, useEffect, useRef } from "react";
import {
  Printer,
  ChevronUp,
  ChevronDown,
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
  Microscope,
  ExternalLink,
  Sun,
  Moon,
  Zap,
  Bell,
  Link2,
} from "lucide-react";
import { motion } from "framer-motion";
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

function PitchRadarBg({ color, opacity = 0.18 }: { color: string; opacity?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: "min(70vw, 650px)",
          height: "min(70vw, 650px)",
          animation: "radar-bg-slow 22s linear infinite",
          transformOrigin: "center center",
          background: `conic-gradient(from 0deg, transparent 260deg, ${color}0d 310deg, ${color}${Math.round(opacity * 255).toString(16).padStart(2, "0")} 360deg)`,
          borderRadius: "50%",
        }}
      />
      {[200, 340, 460, 580].map((r, i) => (
        <div
          key={r}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{ width: r, height: r, borderColor: `${color}${Math.round((0.09 - i * 0.015) * 255).toString(16).padStart(2, "0")}` }}
        />
      ))}
      <div
        className="absolute left-1/2 top-1/2 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: color, animation: "pulse-ring 3s ease-out infinite", opacity: 0 }}
      />
    </div>
  );
}

function PitchDots({ color, count = 8 }: { color: string; count?: number }) {
  const dots = Array.from({ length: count }, (_, i) => ({
    x: `${12 + (i * 67 + 31) % 80}%`,
    y: `${10 + (i * 53 + 17) % 78}%`,
    size: 1.5 + (i % 3) * 0.8,
    delay: `${i * 0.6}s`,
    dur: `${5.5 + (i % 4) * 1.2}s`,
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
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

const MYC_COLOR_GREEN = "#3fb950";
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
  const strands: MycStrand[] = [];
  const nodes: MycNode[] = [];
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

function BrokenPipelineSVG({ color }: { color: string }) {
  const nodePositions = [
    { cx: 80, label: "Concept" },
    { cx: 260, label: "Research" },
    { cx: 440, label: "TTO" },
    { cx: 620, label: "Industry" },
  ];
  return (
    <div className="w-full flex items-center justify-center" aria-hidden>
      <svg viewBox="0 0 700 220" className="w-full max-w-lg" style={{ overflow: "visible" }}>
        <defs>
          <style>{`
            @keyframes pipe-break { 0%,40% { stroke-dashoffset: 0; opacity: 0.5; } 60%,100% { stroke-dashoffset: 40; opacity: 0.15; } }
            @keyframes node-fade { 0%,40% { opacity: 0.6; r: 22; } 55%,100% { opacity: 0.2; r: 18; } }
            @keyframes node-blink { 0%,30% { opacity: 0.8; } 50% { opacity: 0.3; } 70%,100% { opacity: 0.8; } }
            @keyframes gap-grow { 0%,40% { d: path("M 300 110 L 400 110"); } 60%,100% { d: path("M 280 110 L 420 110"); } }
          `}</style>
        </defs>
        <line x1="102" y1="110" x2="238" y2="110" stroke={color} strokeWidth="2" strokeDasharray="8 6" strokeOpacity="0.5" />
        <line x1="282" y1="110" x2="418" y2="110" stroke={color} strokeWidth="2.5" strokeDasharray="8 6"
          style={{ animation: "pipe-break 4s ease-in-out infinite" }} />
        <line x1="462" y1="110" x2="598" y2="110" stroke={color} strokeWidth="2" strokeDasharray="8 6" strokeOpacity="0.3" />
        <line x1="320" y1="90" x2="380" y2="130" stroke={color} strokeWidth="3" strokeOpacity="0.7" strokeLinecap="round">
          <animate attributeName="opacity" values="0;0.7;0" dur="4s" repeatCount="indefinite" />
        </line>
        <line x1="380" y1="90" x2="320" y2="130" stroke={color} strokeWidth="3" strokeOpacity="0.7" strokeLinecap="round">
          <animate attributeName="opacity" values="0;0.7;0" dur="4s" repeatCount="indefinite" />
        </line>
        {nodePositions.map((n, i) => (
          <g key={n.label}>
            <circle cx={n.cx} cy={110} r={22} fill="none" stroke={color} strokeWidth="2"
              style={{
                opacity: i === 1 || i === 2 ? undefined : 0.5,
                animation: i === 1 || i === 2 ? "node-fade 4s ease-in-out infinite" : "node-blink 5s ease-in-out infinite",
              }} />
            <circle cx={n.cx} cy={110} r={4} fill={color}
              style={{ opacity: i === 3 ? 0.2 : i === 2 ? 0.35 : 0.6 }} />
            <text x={n.cx} y={155} textAnchor="middle" fill={color} fontSize="11" fontWeight="600"
              style={{ opacity: i >= 2 ? 0.35 : 0.7 }}>{n.label}</text>
          </g>
        ))}
        <text x="350" y="195" textAnchor="middle" fill={color} fontSize="10" fontStyle="italic" opacity="0.5">
          Pipeline breaks before industry ever sees it
        </text>
      </svg>
    </div>
  );
}

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
      <PitchRadarBg color={colors.green} opacity={0.2} />
      <CoverVine color={colors.green} />
      <PitchDots color={colors.green} count={10} />

      <div className="absolute top-6 left-8 flex items-center gap-3" style={{ zIndex: 10 }}>
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: colors.green }}>01</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: colors.textMuted }}>Cover</span>
      </div>

      <div className="flex flex-1 items-stretch">
        <div className="flex flex-col justify-center flex-1 px-8 sm:px-16 lg:px-24 py-20 relative z-10">
          <div className="flex flex-col items-start gap-3 mb-6 w-fit">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: colors.amber }}>
                <Lightbulb className="w-3.5 h-3.5" style={{ color: "#fff" }} />
              </div>
              <span className="font-bold text-xs" style={{ color: colors.text }}>Eden<span style={{ color: colors.amber }}>Discovery</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: colors.violet }}>
                <FlaskConical className="w-3.5 h-3.5" style={{ color: "#fff" }} />
              </div>
              <span className="font-bold text-xs" style={{ color: colors.text }}>Eden<span style={{ color: colors.violet }}>Lab</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: colors.green }}>
                <Sprout className="w-3.5 h-3.5" style={{ color: "#fff" }} />
              </div>
              <span className="font-bold text-xs" style={{ color: colors.text }}>Eden<span style={{ color: colors.green }}>Radar</span></span>
            </div>
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-3" style={{ color: colors.text }}>
            Eden<span style={{ color: colors.green }}>Radar</span>
          </h1>
          <p className="text-xl font-semibold mb-4" style={{ color: colors.green }}>AI-Powered Biotech Asset Matchmaking</p>
          <p className="text-base max-w-md mb-10" style={{ color: colors.textMuted }}>
            The first platform to connect early-stage concept, development, structured labs, institutional research, and industry asset intelligence in a single ecosystem.
          </p>
          <div className="flex items-center gap-5 text-xs" style={{ color: colors.textMuted }}>
            <span>Founded 2025</span>
            <span className="w-1 h-1 rounded-full" style={{ background: colors.green }} />
            <span>Pre-Seed</span>
            <span className="w-1 h-1 rounded-full" style={{ background: colors.green }} />
            <span>edenradar.com</span>
          </div>
        </div>

        <div className="hidden md:block w-[42%] relative shrink-0">
          <img src={imgLabWork} alt="Researchers at work" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: "center" }} />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to right, ${colors.bg} 0%, transparent 30%), linear-gradient(to top, ${colors.bg}88 0%, transparent 50%)` }} />
          <div className="absolute inset-0" style={{ background: `${colors.green}0d` }} />
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
    { icon: Search, title: "Industry Starts Too Late", desc: "Commercial discovery tools begin at the patent stage. The best assets are already locked, gone, or unfunded." },
    { icon: Layers, title: "No Shared Intelligence", desc: "Researchers, TTOs, and BD teams use disconnected systems. The pipeline has no connective tissue." },
  ];

  return (
    <section
      className="pitch-slide relative w-full overflow-hidden flex"
      style={{ minHeight: "100vh", height: "100vh", background: colors.bg, scrollSnapAlign: "start" }}
      data-testid="pitch-slide-2"
    >
      <PitchDots color={colors.red} count={6} />

      <div className="absolute top-6 left-8 flex items-center gap-3" style={{ zIndex: 10 }}>
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: colors.red }}>02</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: colors.textMuted }}>The Problem</span>
      </div>

      <div className="flex flex-col justify-center flex-1 px-8 sm:px-16 lg:px-24 py-20 relative z-10">
        <div className="mb-3 inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest w-fit" style={{ background: colors.redDim, color: colors.red }}>
          $2.6B average cost to bring a drug to market
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold mb-6" style={{ color: colors.text }}>
          The pipeline is <span style={{ color: colors.red }}>broken</span> before it begins.
        </h2>

        <div className="mb-8">
          <BrokenPipelineSVG color={colors.red} />
        </div>

        <div className="space-y-3">
          {problems.map((p) => (
            <div key={p.title} className="flex items-start gap-4 rounded-xl p-4" style={{ background: colors.bgLight, border: `1px solid ${colors.border}` }}>
              <p.icon className="w-5 h-5 shrink-0 mt-0.5" style={{ color: colors.red }} />
              <div>
                <p className="text-sm font-bold mb-0.5" style={{ color: colors.text }}>{p.title}</p>
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
    {
      label: "Concept Community", sublabel: "EdenDiscovery", color: colors.amber, dim: colors.amberDim,
      icon: Lightbulb,
      desc: "A creative community where biotech ideas are born. Submit hypotheses, get scored, and connect with collaborators before research begins.",
    },
    {
      label: "Project-Based Research", sublabel: "EdenLab", color: colors.violet, dim: colors.violetDim,
      icon: FlaskConical,
      desc: "Structured project workspace with intuitive tools for literature review, AI synthesis, grants, and industry visibility.",
    },
    {
      label: "Industry Intelligence", sublabel: "EdenRadar", color: colors.green, dim: colors.greenDim,
      icon: Sprout,
      desc: "AI-enriched asset dossiers from 200+ monitored TTO institutions with real-time convergence signals.",
    },
  ];
  return (
    <Slide index={3} section="Our Solution" accent={colors.green} colors={colors}>
      <PitchDots color={colors.green} count={6} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 30% 60%, ${colors.green}0a 0%, transparent 60%)` }} />
      <p className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: colors.green }}>One platform. Three tiers. Continuous signal.</p>
      <h2 className="text-3xl sm:text-4xl font-bold mb-10" style={{ color: colors.text }}>
        EdenRadar <span style={{ color: colors.green }}>powers</span> the <span style={{ color: colors.green }}>full life cycle</span>.
      </h2>
      <div className="relative">
        <div className="absolute top-1/2 left-0 right-0 h-px" style={{ background: `linear-gradient(to right, ${colors.amber}, ${colors.violet}, ${colors.green})`, opacity: 0.4, transform: "translateY(-50%)" }} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 relative">
          {stages.map((s, i) => (
            <div key={s.label} className="rounded-xl p-6 relative" style={{ background: s.dim, border: `1px solid ${s.color}44`, borderTop: `3px solid ${s.color}` }}>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${s.color}22` }}>
                  <s.icon className="w-4 h-4" style={{ color: s.color }} />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: s.color }}>{s.sublabel}</span>
              </div>
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
      title: "EdenDiscovery", tier: "Tier 1", tagline: "Creative concept community", color: colors.amber, dim: colors.amberDim, icon: Lightbulb,
      items: ["Submit hypotheses before research begins", "AI credibility scoring (0 to 100)", "Discovered by collaborators and funders", "Landscape intelligence from PubMed and bioRxiv"],
    },
    {
      title: "EdenLab", tier: "Tier 2", tagline: "Project-based research workspace", color: colors.violet, dim: colors.violetDim, icon: FlaskConical,
      items: ["Literature search across 35+ data sources", "Intuitive tools with AI synthesis and evidence extraction", "Structured 11-section project canvas", "Grant discovery matched to research profile"],
    },
    {
      title: "EdenRadar", tier: "Tier 3", tagline: "Industry intelligence", color: colors.green, dim: colors.greenDim, icon: Sprout,
      items: ["200+ TTO institutions monitored continuously", "AI-scored and enriched asset dossiers", "Competing asset cross-reference by target", "Convergence signals and taxonomy tracking"],
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
      <PitchRadarBg color={colors.amber} opacity={0.12} />
      <PitchDots color={colors.amber} count={8} />

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
            <p className="text-xs" style={{ color: colors.textMuted }}>Tier 1 — Creative concept community</p>
          </div>
        </div>
        <p className="text-base mb-8 max-w-md" style={{ color: colors.textMuted }}>
          Where biotech concepts are born. Submit a hypothesis, get scored, and get discovered by collaborators and funders before anyone else sees it.
        </p>
        <div className="space-y-3">
          {features.map((f) => (
            <div key={f.label} className="flex items-start gap-4 rounded-xl p-4" style={{ background: colors.bgLight, border: `1px solid ${colors.amber}33`, minHeight: 72 }}>
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
          Public feed: no login required to browse
        </div>
      </div>

      <div className="hidden md:block w-[38%] relative shrink-0">
        <img src={imgIdeation} alt="Team ideating" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: "center" }} />
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
    { icon: BookOpen, label: "35+ Data Sources", desc: "PubMed, bioRxiv, clinical trials, patents, and more" },
    { icon: Layers, label: "Project Canvas", desc: "Structured 11-section workspace that guides research from hypothesis to publication" },
    { icon: Brain, label: "AI Synthesis", desc: "Structured summaries, key finding extraction, and evidence mapping across sources" },
    { icon: Award, label: "Grants & Alerts", desc: "NIH, NSF, and SBIR matched to your profile. Alerts based on interests and expertise" },
    { icon: Link2, label: "Shared Ecosystem", desc: "Direct signal flow from EdenLab to EdenRadar, placing your work in front of industry partners" },
  ];
  return (
    <section
      className="pitch-slide relative w-full overflow-hidden flex"
      style={{ minHeight: "100vh", height: "100vh", background: colors.bg, scrollSnapAlign: "start" }}
      data-testid="pitch-slide-6"
    >
      <PitchRadarBg color={colors.violet} opacity={0.10} />
      <PitchDots color={colors.violet} count={8} />

      <div className="absolute top-6 left-8 flex items-center gap-3" style={{ zIndex: 10 }}>
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: colors.violet }}>06</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: colors.textMuted }}>EdenLab</span>
      </div>

      <div className="flex flex-1 items-stretch">
        <div className="flex flex-col justify-center flex-1 px-8 sm:px-12 lg:px-16 py-20 relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: colors.violetDim }}>
              <FlaskConical className="w-5 h-5" style={{ color: colors.violet }} />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold" style={{ color: colors.text }}>
                Eden<span style={{ color: colors.violet }}>Lab</span>
              </h2>
              <p className="text-xs" style={{ color: colors.textMuted }}>Tier 2 — Project-based research workspace</p>
            </div>
          </div>
          <p className="text-sm mb-6 max-w-lg" style={{ color: colors.textMuted }}>
            A research workspace built for biotech. Literature, grants, and industry visibility in one AI-powered canvas. Same ecosystem as EdenRadar, seamless movement through the pipeline.
          </p>
          <div className="space-y-2.5">
            {features.map((f) => (
              <div key={f.label} className="flex items-start gap-3 rounded-lg p-3" style={{ background: colors.bgLight, border: `1px solid ${colors.violet}33` }}>
                <f.icon className="w-4 h-4 shrink-0 mt-0.5" style={{ color: colors.violet }} />
                <div>
                  <p className="text-xs font-semibold mb-0.5" style={{ color: colors.text }}>{f.label}</p>
                  <p className="text-xs" style={{ color: colors.textMuted }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="hidden md:block w-[40%] relative shrink-0">
          <img src={imgLabComp} alt="Researchers collaborating" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: "center 40%" }} />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to right, ${colors.bg} 0%, transparent 25%), linear-gradient(to top, ${colors.bg}88 0%, transparent 40%)` }} />
          <div className="absolute inset-0" style={{ background: `${colors.violet}12` }} />
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
    { icon: Building2, label: "200+ TTO Institutions", desc: "Continuously scraped with bespoke and automated ingestion pipelines across major research universities" },
    { icon: FileBarChart2, label: "AI-Enriched Dossiers", desc: "Every asset classified by target, modality, indication, and development stage with supporting literature" },
    { icon: Zap, label: "First to Know", desc: "Real-time alerts on new listings, convergence signals, and rising activity clusters by therapy area" },
    { icon: TrendingUp, label: "Direct Lab Signals", desc: "Scored research signals from EdenLab and EdenDiscovery surface directly to industry, from the labs and researchers themselves" },
  ];
  return (
    <Slide index={7} section="EdenRadar" accent={colors.green} colors={colors}>
      <PitchRadarBg color={colors.green} opacity={0.15} />
      <PitchDots color={colors.green} count={10} />
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: colors.greenDim }}>
          <Sprout className="w-5 h-5" style={{ color: colors.green }} />
        </div>
        <div>
          <h2 className="text-3xl sm:text-4xl font-bold" style={{ color: colors.text }}>
            Eden<span style={{ color: colors.green }}>Radar</span>
          </h2>
          <p className="text-xs" style={{ color: colors.textMuted }}>Tier 3 — Industry intelligence</p>
        </div>
      </div>
      <p className="text-base mb-8 max-w-2xl" style={{ color: colors.textMuted }}>
        The industry-facing layer. EdenRadar monitors 200+ technology transfer offices, ingests new listings, and enriches them with classification, scoring, and supporting literature to produce portfolio-grade dossiers. Direct signals from EdenLab and EdenDiscovery ensure you see advancements directly from the labs and researchers themselves.
      </p>
      <div className="grid grid-cols-2 gap-4">
        {features.map((f) => (
          <div key={f.label} className="rounded-xl p-5 flex gap-4 items-start" style={{ background: colors.bgLight, border: `1px solid ${colors.green}33` }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: colors.greenDim }}>
              <f.icon className="w-5 h-5" style={{ color: colors.green }} />
            </div>
            <div>
              <p className="text-sm font-semibold mb-1" style={{ color: colors.text }}>{f.label}</p>
              <p className="text-xs" style={{ color: colors.textMuted }}>{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </Slide>
  );
}

function TractionSlide({ colors }: { colors: Colors }) {
  const stats = [
    { value: "200+", label: "TTO Institutions", icon: Building2, color: colors.green },
    { value: "35+", label: "Research Data Sources", icon: Database, color: colors.violet },
    { value: "40+", label: "Including Grants", icon: Award, color: colors.amber },
    { value: "GPT-4", label: "Classifier & Enrichment", icon: Brain, color: colors.green },
  ];
  const tiers = [
    { name: "EdenDiscovery", price: "$9.99", period: "/mo", color: colors.amber, dim: colors.amberDim, icon: Lightbulb, desc: "Concept community access, AI scoring, landscape intelligence" },
    { name: "EdenLab", price: "$24.99", period: "/mo", color: colors.violet, dim: colors.violetDim, icon: FlaskConical, desc: "Full research workspace, 35+ sources, project canvas, grants" },
    { name: "EdenRadar", price: "$44.99", period: "/mo", color: colors.green, dim: colors.greenDim, icon: Sprout, desc: "Industry intelligence, 200+ TTOs, AI dossiers, convergence signals" },
  ];
  return (
    <Slide index={8} section="What We've Built" accent={colors.green} colors={colors}>
      <h2 className="text-3xl sm:text-4xl font-bold mb-2" style={{ color: colors.text }}>
        Built, deployed, <span style={{ color: colors.green }}>running today</span>.
      </h2>
      <p className="text-sm mb-6 max-w-2xl" style={{ color: colors.textMuted }}>
        This is not a roadmap. Every component below is processing real biotech data in production.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl p-4 flex flex-col items-center text-center" style={{ background: colors.bgLight, border: `1px solid ${colors.border}` }}>
            <s.icon className="w-4 h-4 mb-1.5" style={{ color: s.color }} />
            <span className="text-xl font-bold mb-0.5" style={{ color: s.color }}>{s.value}</span>
            <span className="text-[10px]" style={{ color: colors.textMuted }}>{s.label}</span>
          </div>
        ))}
      </div>
      <p className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: colors.green }}>Monthly Subscriptions</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {tiers.map((t) => (
          <div key={t.name} className="rounded-xl p-5 flex flex-col items-center text-center" style={{ background: t.dim, border: `1px solid ${t.color}44`, borderTop: `3px solid ${t.color}` }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: `${t.color}22` }}>
              <t.icon className="w-5 h-5" style={{ color: t.color }} />
            </div>
            <h3 className="text-sm font-bold mb-1" style={{ color: colors.text }}>{t.name}</h3>
            <div className="mb-2">
              <span className="text-2xl font-bold" style={{ color: t.color }}>{t.price}</span>
              <span className="text-xs" style={{ color: colors.textMuted }}>{t.period}</span>
            </div>
            <p className="text-xs" style={{ color: colors.textMuted }}>{t.desc}</p>
          </div>
        ))}
      </div>
    </Slide>
  );
}

function VisionSlide({ colors }: { colors: Colors }) {
  return (
    <Slide index={9} section="The Vision" accent={colors.green} colors={colors}>
      <PitchDots color={colors.green} count={6} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 50% 50%, ${colors.green}0a 0%, transparent 60%)` }} />
      <div className="flex flex-col items-center text-center px-8">
        <p className="text-xs font-bold uppercase tracking-widest mb-6" style={{ color: colors.green }}>Why this matters</p>
        <blockquote className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-snug max-w-4xl mb-10" style={{ color: colors.text }}>
          "We accelerate pharmaceutical and biotech innovation by capturing research at its earliest possible moments in creating direct connections between scientists and the industry partners who can advance it."
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
          EdenRadar is building the connective tissue of biotech: an intelligence layer that makes the entire pipeline visible, searchable, and actionable from concept to commercialization.
        </p>
      </div>
    </Slide>
  );
}

function ContactSlide({ colors }: { colors: Colors }) {
  return (
    <Slide index={10} section="Contact" accent={colors.green} colors={colors}>
      <PitchRadarBg color={colors.green} opacity={0.08} />
      <PitchDots color={colors.green} count={6} />
      <div className="flex flex-col items-center text-center px-8">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6" style={{ background: colors.greenDim, border: `2px solid ${colors.green}44` }}>
          <Sprout className="w-8 h-8" style={{ color: colors.green }} />
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold mb-2" style={{ color: colors.text }}>
          Let's build the future of <span style={{ color: colors.green }}>biotech intelligence</span>.
        </h2>
        <p className="text-base mb-8 max-w-lg" style={{ color: colors.textMuted }}>
          We're seeking advisors and early partners who believe the drug discovery pipeline should start earlier and move faster.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-left max-w-md">
          <div className="rounded-xl p-5" style={{ background: colors.bgLight, border: `1px solid ${colors.border}` }}>
            <p className="text-sm font-bold mb-0.5" style={{ color: colors.text }}>Wafick Mohamed</p>
            <p className="text-xs mb-1.5" style={{ color: colors.textMuted }}>Co-Founder & CEO</p>
            <p className="text-xs font-medium" style={{ color: colors.accent }}>w.mohamed@edenradar.com</p>
          </div>
          <div className="rounded-xl p-5" style={{ background: colors.bgLight, border: `1px solid ${colors.border}` }}>
            <p className="text-sm font-bold mb-0.5" style={{ color: colors.text }}>Richard Elles</p>
            <p className="text-xs mb-1.5" style={{ color: colors.textMuted }}>Co-Founder & COO</p>
            <p className="text-xs font-medium" style={{ color: colors.accent }}>r.elles@edenradar.com</p>
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
