import { useState, useEffect, useRef, Children } from "react";
import type { ReactNode, ElementType, CSSProperties } from "react";
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
  Dna,
  Shield,
} from "lucide-react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import imgLabWork from "@assets/pexels-yaroslav-shuraev-8515114_1773638670424.jpg";
import wafickPhoto from "@assets/WM_phot_1774028682960.jpg";
import richardPhoto from "@assets/Headshot1_1774028710682.jpg";
import { EdenOrb, EdenAvatar } from "@/components/EdenOrb";

const SLIDE_COUNT = 9;

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

/* ─── Canvas radar anchored to left quarter ─── */
function PitchLeftRadar({ bg }: { bg: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dark = bg !== "#ffffff";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let angle = 0;
    let lastTime = performance.now();

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
      const ringAlpha = dark ? 0.08 : 0.03;
      const sweepPeak = dark ? 0.15 : 0.05;
      const sweepAngle = Math.PI / 2;
      const sweepSteps = 24;

      ctx.clearRect(0, 0, W, H);

      ctx.strokeStyle = "#065f46";
      ctx.lineWidth = 1;
      for (let i = 1; i <= ringCount; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, ringSpacing * i, 0, Math.PI * 2);
        ctx.globalAlpha = ringAlpha;
        ctx.stroke();
      }

      for (let i = 0; i < sweepSteps; i++) {
        const t = (i + 1) / sweepSteps;
        const startA = angle - sweepAngle + (i / sweepSteps) * sweepAngle;
        const endA = angle - sweepAngle + ((i + 1) / sweepSteps) * sweepAngle;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, maxR, startA, endA);
        ctx.closePath();
        ctx.fillStyle = "#065f46";
        ctx.globalAlpha = t * sweepPeak;
        ctx.fill();
      }

      ctx.globalAlpha = 1;

      // Fade rings out before they hit the canvas edge (no hard clip)
      const fadeGrad = ctx.createRadialGradient(cx, cy, maxR * 0.60, cx, cy, maxR * 1.02);
      fadeGrad.addColorStop(0, "rgba(0,0,0,0)");
      fadeGrad.addColorStop(1, "rgba(0,0,0,1)");
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = fadeGrad;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";

      angle += (Math.PI * 2) * (dt / 25000);
      animId = requestAnimationFrame(draw);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    draw(performance.now());

    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, [dark]);

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      aria-hidden
      style={{ zIndex: 0 }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          left: "25%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(80vh, 700px)",
          height: "min(80vh, 700px)",
        }}
      />
    </div>
  );
}

/* ─── Floating dots ─── */
function PitchDots({ color, count = 8, seed = 0 }: { color: string; count?: number; seed?: number }) {
  const dots = Array.from({ length: count }, (_, i) => {
    const k = i + seed * 7;
    return {
      x: `${10 + (k * 71 + 29) % 82}%`,
      y: `${8 + (k * 53 + 17) % 80}%`,
      size: 1.2 + (k % 4) * 0.7,
      delay: `${(i + seed * 3) * 0.55}s`,
      dur: `${5.5 + (k % 5) * 1.1}s`,
    };
  });
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

/* ─── Canvas wave background ─── */
const DEFAULT_WAVE_PALETTE: [string, string, string, string] = ["#065f46", "#10b981", "#059669", "#34d399"];

function PitchWaves({ bg, palette }: { bg: string; palette?: [string, string, string, string] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dark = bg !== "#ffffff";
  const palRef = useRef(palette ?? DEFAULT_WAVE_PALETTE);
  palRef.current = palette ?? DEFAULT_WAVE_PALETTE;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let frame = 0;

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    function draw() {
      if (!canvas || !ctx) return;
      const p = palRef.current;
      const WAVES = [
        { color: p[0], aDark: 0.22, aLight: 0.05, amp: 80, freq: 0.0018, spd: 0.007, yr: 0.52 },
        { color: p[1], aDark: 0.16, aLight: 0.04, amp: 58, freq: 0.0026, spd: 0.012, yr: 0.65 },
        { color: p[2], aDark: 0.12, aLight: 0.03, amp: 42, freq: 0.0036, spd: 0.018, yr: 0.76 },
        { color: p[3], aDark: 0.08, aLight: 0.03, amp: 26, freq: 0.0048, spd: 0.025, yr: 0.86 },
      ];
      const W = canvas.width;
      const H = canvas.height;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      for (const w of WAVES) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 2) {
          const y =
            w.yr * H +
            Math.sin(x * w.freq + frame * w.spd) * w.amp +
            Math.sin(x * w.freq * 1.8 + frame * w.spd * 0.65) * w.amp * 0.3;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();
        ctx.globalAlpha = dark ? w.aDark : w.aLight;
        ctx.fillStyle = w.color;
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

    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, [bg, dark]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full block"
      style={{ zIndex: 0 }}
      aria-hidden
    />
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

/* ─── Broken Pipeline SVG ─── */
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
        <line x1="114" y1="100" x2="276" y2="100" stroke={color} strokeWidth="2" strokeDasharray="8 5" strokeOpacity="0.52" />
        <line x1="324" y1="100" x2="486" y2="100" stroke={color} strokeWidth="2.5" strokeDasharray="8 5"
          style={{ animation: "pipe-break-a 4.5s ease-in-out infinite" }} />
        <line x1="375" y1="80" x2="435" y2="120" stroke={color} strokeWidth="3" strokeLinecap="round"
          style={{ animation: "x-flash 4.5s ease-in-out infinite" }} />
        <line x1="435" y1="80" x2="375" y2="120" stroke={color} strokeWidth="3" strokeLinecap="round"
          style={{ animation: "x-flash 4.5s ease-in-out infinite" }} />
        <line x1="534" y1="100" x2="696" y2="100" stroke={color} strokeWidth="2.5" strokeDasharray="8 5"
          style={{ animation: "pipe-break-b 4.5s ease-in-out 0.8s infinite" }} />
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

/* ─── Slide nav ─── */
function SlideNav({ current, onJump, colors }: { current: number; onJump: (i: number) => void; colors: Colors }) {
  return (
    <>
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

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const childVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

function Slide({
  index, section, accent, children, className = "", noPadding = false, colors, waves = false, wavePalette,
}: {
  index: number; section: string; accent?: string; children: ReactNode; className?: string; noPadding?: boolean; colors: Colors; waves?: boolean; wavePalette?: [string, string, string, string];
}) {
  const accentColor = accent || colors.green;
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { once: false, amount: 0.3 });
  const reducedMotion = useReducedMotion();
  const skip = !!reducedMotion;
  return (
    <section
      ref={sectionRef}
      className={`pitch-slide relative w-full flex flex-col justify-center overflow-hidden ${className}`}
      style={{ minHeight: "100svh", background: colors.bg, scrollSnapAlign: "start" }}
      data-testid={`pitch-slide-${index}`}
    >
      {waves && <PitchWaves bg={colors.bg} palette={wavePalette} />}
      <div className="absolute top-4 sm:top-6 left-4 sm:left-8 flex items-center gap-3" style={{ zIndex: 10 }}>
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: accentColor }}>{String(index).padStart(2, "0")}</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: colors.textMuted }}>{section}</span>
      </div>
      <motion.div
        className={`relative z-10 w-full max-w-7xl mx-auto pt-10 sm:pt-12 pb-12 sm:pb-0 ${noPadding ? "" : "px-5 sm:px-12 lg:px-12"}`}
        style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}
        variants={skip ? undefined : containerVariants}
        initial={skip ? undefined : "hidden"}
        animate={skip ? { opacity: 1, y: 0 } : inView ? "visible" : "hidden"}
      >
        {Children.map(children, (child, i) =>
          child != null ? (
            <motion.div key={i} variants={skip ? undefined : childVariants}>
              {child}
            </motion.div>
          ) : null,
        )}
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
      <PitchLeftRadar bg={colors.bg} />
      <PitchDots color={colors.green} count={12} />

      <div className="absolute top-4 sm:top-6 left-4 sm:left-8 flex items-center gap-3" style={{ zIndex: 10 }}>
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: colors.green }}>01</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: colors.textMuted }}>Cover</span>
      </div>

      <div className="flex flex-1 items-stretch">
        <div className="flex flex-col justify-center flex-1 px-5 sm:px-14 lg:px-12 py-10 sm:py-20 pb-14 sm:pb-20 relative z-10">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight mb-3" style={{ color: colors.text }}>
            Eden<span style={{ color: colors.green }}>Radar</span>
          </h1>
          <p className="text-lg sm:text-xl lg:text-2xl font-semibold mb-4" style={{ color: colors.green }}>Biotech Intelligence Platform</p>
          <p className="text-sm sm:text-base lg:text-lg max-w-sm sm:max-w-md lg:max-w-xl mb-8 sm:mb-10" style={{ color: colors.textMuted }}>
            The first platform to connect early-stage concept, development, structured labs, institutional research, and industry asset intelligence in a single ecosystem.
          </p>
          <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-xs" style={{ color: colors.textMuted }}>
            <span>Founded 2026</span>
            <span className="w-1 h-1 rounded-full" style={{ background: colors.green }} />
            <span>edenradar.com</span>
          </div>
        </div>

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

/* ═══════════════════════ SLIDE 2 — WHO WE ARE ═══════════════════════ */
function WhoWeAreSlide({ colors }: { colors: Colors }) {
  const founders = [
    {
      photo: wafickPhoto,
      name: "Wafick Mohamed",
      role: "Co-Founder & CEO",
      bio: "Biotech executive, entrepreneur, and professor with extensive global pharma and quality systems experience.",
      color: colors.amber,
    },
    {
      photo: richardPhoto,
      name: "Richard Elles",
      role: "Co-Founder & COO",
      bio: "Healthcare strategist and PMP-certified leader with deep healthtech startup and academic research experience.",
      color: colors.green,
    },
  ];

  return (
    <Slide index={2} section="Who We Are" accent={colors.green} colors={colors} waves>
      <PitchDots color={colors.green} count={10} />
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-14 items-start lg:items-center">

        {/* LEFT: mission + vision text */}
        <div className="flex-1 min-w-0">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-5"
            style={{ background: colors.greenDim, color: colors.green, border: `1px solid ${colors.green}44` }}
          >
            Founded 2026
          </div>
          <h2 className="text-xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold mb-5 leading-tight" style={{ color: colors.text }}>
            The team building the{" "}
            <span style={{ color: colors.green }}>connective tissue of research & biotech.</span>
          </h2>
          <blockquote
            className="text-sm sm:text-base lg:text-lg italic mb-5 max-w-lg leading-relaxed pl-4"
            style={{ color: colors.textMuted, borderLeft: `3px solid ${colors.green}44` }}
          >
            "We accelerate pharmaceutical and biotech innovation by capturing research at its earliest possible moments, creating direct connections between scientists and the industry partners who can advance it."
          </blockquote>
          <p className="text-xs sm:text-sm max-w-lg leading-relaxed" style={{ color: colors.green }}>
            EdenRadar is building the connective tissue of biotech: an intelligence layer that makes the entire pipeline visible, searchable, and actionable from concept to commercialization.
          </p>
        </div>

        {/* RIGHT: founder cards */}
        <div className="flex flex-col sm:flex-row lg:flex-col gap-4 shrink-0 w-full lg:w-72">
          {founders.map((f) => (
            <div
              key={f.name}
              className="rounded-xl p-4 flex items-center gap-4 flex-1 lg:flex-none"
              style={{ background: colors.bgLight, border: `1px solid ${colors.border}` }}
            >
              <img
                src={f.photo}
                alt={f.name}
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: "50%",
                  objectFit: "cover",
                  objectPosition: "center top",
                  border: `2px solid ${f.color}`,
                  flexShrink: 0,
                  boxShadow: `0 0 12px ${f.color}40`,
                }}
              />
              <div className="min-w-0">
                <p className="text-sm font-bold" style={{ color: colors.text }}>{f.name}</p>
                <p className="text-[10px] sm:text-xs mb-1.5 font-semibold" style={{ color: f.color }}>{f.role}</p>
                <p className="text-[10px] sm:text-xs leading-relaxed" style={{ color: colors.textMuted }}>{f.bio}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}

/* ═══════════════════════ SLIDE 3 — PROBLEM ═══════════════════════ */
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
      data-testid="pitch-slide-3"
    >
      <PitchWaves bg={colors.bg} palette={["#7f1d1d", "#ef4444", "#dc2626", "#fca5a5"]} />
      <PitchDots color={colors.red} count={8} />

      <div className="absolute top-4 sm:top-6 left-4 sm:left-8 flex items-center gap-3" style={{ zIndex: 10 }}>
        <span className="text-xs font-mono font-bold tracking-wider" style={{ color: colors.red }}>03</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: colors.textMuted }}>The Problem</span>
      </div>

      <div className="flex flex-col justify-center flex-1 px-5 sm:px-14 lg:px-12 py-10 sm:py-16 pb-14 sm:pb-16 relative z-10">
        <div className="mb-2 sm:mb-3 inline-block px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-widest w-fit" style={{ background: colors.redDim, color: colors.red }}>
          $2.6B average cost to bring a drug to market
        </div>
        <h2 className="text-xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold mb-3 sm:mb-5" style={{ color: colors.text }}>
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

/* ═══════════════════════ SLIDE 6 — SOLUTION + PORTALS (COMBINED) ═══════════════════════ */
function SolutionPortalsSlide({ colors }: { colors: Colors }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const gridInView = useInView(gridRef, { once: false, amount: 0.2 });
  const reducedMotion = useReducedMotion();
  const skip = !!reducedMotion;
  const portals = [
    {
      title: "EdenDiscovery", tier: "Tier 1", tagline: "Creative concept community", color: colors.amber, dim: colors.amberDim, icon: Lightbulb,
      items: ["Submit hypotheses before research begins", "EDEN AI scoring and credibility scoring (0 to 100)", "Discovered by collaborators and funders"],
    },
    {
      title: "EdenLab", tier: "Tier 2", tagline: "Project-based research workspace", color: colors.violet, dim: colors.violetDim, icon: FlaskConical,
      items: ["Literature search across 40+ data sources", "Structured 11-section project canvas", "AI synthesis and evidence extraction"],
    },
    {
      title: "EdenScout", tier: "Tier 3", tagline: "Industry intelligence platform", color: colors.green, dim: colors.greenDim, icon: Sprout,
      items: ["300+ TTOs monitored continuously", "EDEN-scored and enriched asset dossiers", "Competing asset cross-reference by target"],
    },
  ];
  return (
    <Slide index={4} section="Our Solution" accent={colors.green} colors={colors}>
      <PitchDots color={colors.amber} count={4} seed={0} />
      <PitchDots color={colors.violet} count={4} seed={1} />
      <PitchDots color={colors.green} count={4} seed={2} />
      <p className="text-[10px] sm:text-sm font-bold uppercase tracking-widest mb-2 sm:mb-3" style={{ color: colors.green }}>One platform. Three tiers. Continuous signal.</p>
      <h2 className="text-xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold mb-3 sm:mb-6" style={{ color: colors.text }}>
        EdenRadar <span style={{ color: colors.green }}>powers</span> the <span style={{ color: colors.green }}>full life cycle</span>.
      </h2>
      <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
        {portals.map((p, i) => (
          <motion.div
            key={p.title}
            className="rounded-xl p-3 sm:p-6 flex flex-col relative"
            style={{ background: p.dim, border: `1px solid ${p.color}44`, borderTop: `3px solid ${p.color}` }}
            initial={skip ? false : { opacity: 0, x: -12 }}
            animate={skip || gridInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
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
      <div className="mt-4 sm:mt-5 relative flex items-center rounded-lg overflow-hidden" style={{ height: 36, background: `linear-gradient(to right, ${colors.amber}33, ${colors.violet}33, ${colors.green}33)`, border: "1px solid transparent" }}>
        <div className="absolute inset-0" style={{ background: `linear-gradient(to right, ${colors.amber}22, ${colors.violet}22, ${colors.green}22)` }} />
        <span className="relative z-10 flex-1 text-center text-xs font-bold uppercase tracking-widest" style={{ color: "#ffffff", letterSpacing: "0.15em" }}>
          One Pipeline of Innovation
        </span>
        <div className="relative z-10 flex items-center justify-center w-9 h-full shrink-0" style={{ background: `linear-gradient(to right, ${colors.green}44, ${colors.green}88)` }}>
          <ChevronRight className="w-5 h-5" style={{ color: colors.green }} />
        </div>
      </div>
    </Slide>
  );
}

/* ═══════════════════════ SLIDE 6 — EDEN CHAT DEMO ═══════════════════════ */

interface PitchChatMessage {
  role: "user" | "eden";
  text: string;
  delay: number;
  showCards?: boolean;
  showCrisprCards?: boolean;
}

interface PitchAssetCard {
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

const PITCH_CHAT_MESSAGES: PitchChatMessage[] = [
  {
    role: "eden",
    delay: 500,
    text: "Welcome. I'm EDEN — EdenRadar's research intelligence engine. I monitor, classify, and enrich biotech assets across 300+ tech transfer offices in real time. I also surface signals directly from active research labs before they reach the patent stage. What would you like to explore?",
  },
  {
    role: "user",
    delay: 5500,
    text: "What's the hottest area in oncology right now across all TTOs?",
  },
  {
    role: "eden",
    delay: 7500,
    text: "Solid tumor immunotherapy is showing the highest new-listing velocity in the past 30 days — particularly next-generation PD-1/PD-L1 combinations and bispecific antibody platforms. I'm detecting convergence signals across 14 institutions. Here are the top-ranked new listings:",
    showCards: true,
  },
  {
    role: "user",
    delay: 17000,
    text: "Show me CRISPR-based assets targeting rare disease — any university stage.",
  },
  {
    role: "eden",
    delay: 19000,
    text: "Found 52 CRISPR-related rare disease assets across the monitored TTO network. The highest-scored cluster is ex vivo HSC editing for hemoglobinopathies — 6 institutions active, no approved competitors. Here are the top results:",
    showCrisprCards: true,
  },
  {
    role: "user",
    delay: 30000,
    text: "Compare the competitive landscape for the top HDAC inhibitor asset.",
  },
  {
    role: "eden",
    delay: 32000,
    text: "Commercial HDAC inhibitors — Vorinostat, Romidepsin, Panobinostat — are approved only in hematologic malignancies. In solid tumor microenvironments, no approved agent exists. The Johns Hopkins HDAC platform targets this gap directly. No direct commercial competition. EDEN readiness score: 85. White space: confirmed.",
  },
  {
    role: "user",
    delay: 45000,
    text: "What else is EDEN watching that we should know about?",
  },
  {
    role: "eden",
    delay: 47000,
    text: "Three rising signals worth your attention: (1) RNA-targeted platforms for CNS disorders — 8 new TTO listings in 60 days. (2) Microbiome-oncology crossover assets — activity spiking at 5 major research universities. (3) A pre-patent concept in EdenDiscovery for a novel kinase inhibitor just crossed 90 on the EDEN credibility scale. The pipeline never stops moving.",
  },
];

const PITCH_DEMO_ASSETS: PitchAssetCard[] = [
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

const PITCH_CRISPR_ASSETS: PitchAssetCard[] = [
  {
    id: 4,
    title: "Ex Vivo HSC Editing for Sickle Cell Disease via Base Editing",
    institution: "MIT — Koch Institute",
    area: "Rare Disease",
    stage: "Preclinical",
    score: 94,
    modality: "Gene Editing",
    color: "hsl(142 65% 48%)",
    icon: Dna,
  },
  {
    id: 5,
    title: "CRISPR-Cas12a Knockin for Spinal Muscular Atrophy (SMA)",
    institution: "Stanford University",
    area: "Rare Disease",
    stage: "Discovery",
    score: 88,
    modality: "Gene Therapy",
    color: "hsl(265 60% 60%)",
    icon: Brain,
  },
];

function PitchDemoAssetCard({ asset, colors }: { asset: PitchAssetCard; colors: Colors }) {
  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-1.5"
      style={{
        background: colors.bg,
        border: `1px solid ${asset.color.replace(")", " / 0.3)")}`,
        borderTop: `2px solid ${asset.color}`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] sm:text-xs font-semibold leading-snug flex-1" style={{ color: colors.text }}>{asset.title}</p>
        <span
          className="flex-shrink-0 text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: asset.color.replace(")", " / 0.15)"), color: asset.color }}
        >
          {asset.score}
        </span>
      </div>
      <div className="flex flex-wrap gap-1 text-[9px] sm:text-[10px]">
        <span className="px-1.5 py-0.5 rounded-full font-medium" style={{ background: colors.bgLight, color: colors.textMuted }}>{asset.institution}</span>
        <span className="px-1.5 py-0.5 rounded-full font-medium" style={{ background: asset.color.replace(")", " / 0.12)"), color: asset.color }}>{asset.area}</span>
        <span className="px-1.5 py-0.5 rounded-full font-medium" style={{ background: colors.bgLight, color: colors.textMuted }}>{asset.stage}</span>
        <span className="px-1.5 py-0.5 rounded-full font-medium" style={{ background: colors.bgLight, color: colors.textMuted }}>{asset.modality}</span>
      </div>
    </div>
  );
}

function PitchEdenChat({ colors, mobile = false }: { colors: Colors; mobile?: boolean }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const chatRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    const el = wrapperRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          started.current = true;
          PITCH_CHAT_MESSAGES.forEach((msg, i) => {
            setTimeout(() => {
              setVisibleCount(i + 1);
              requestAnimationFrame(() =>
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
                  })
                )
              );
            }, msg.delay);
          });
          obs.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={wrapperRef} className={mobile ? "h-full flex flex-col min-h-0" : ""}>
      <div
        ref={chatRef}
        className="pitch-chat-scroll flex flex-col gap-3 overflow-y-auto"
        style={mobile
          ? { flex: 1, minHeight: 0, scrollbarWidth: "none", msOverflowStyle: "none" }
          : { maxHeight: "62vh", scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {PITCH_CHAT_MESSAGES.slice(0, visibleCount).map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            style={{ animation: "fade-up 0.35s ease-out forwards" }}
          >
            {msg.role === "eden" && <EdenAvatar size={26} />}
            <div className="max-w-[84%] flex flex-col gap-2">
              <div
                className="px-3.5 py-2.5 rounded-xl text-[11px] sm:text-xs leading-relaxed"
                style={
                  msg.role === "user"
                    ? { background: colors.green, color: "#fff", borderRadius: "14px 14px 4px 14px" }
                    : { background: colors.bgLight, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: "14px 14px 14px 4px" }
                }
              >
                {msg.text}
              </div>
              {msg.showCards && (
                <div className="space-y-2">
                  {PITCH_DEMO_ASSETS.map((a) => (
                    <PitchDemoAssetCard key={a.id} asset={a} colors={colors} />
                  ))}
                </div>
              )}
              {msg.showCrisprCards && (
                <div className="space-y-2">
                  {PITCH_CRISPR_ASSETS.map((a) => (
                    <PitchDemoAssetCard key={a.id} asset={a} colors={colors} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {visibleCount > 0 && visibleCount < PITCH_CHAT_MESSAGES.length && (
          <div className="flex gap-2.5">
            <EdenAvatar size={26} isThinking />
            <div
              className="px-3.5 py-2.5 rounded-xl text-xs"
              style={{ background: colors.bgLight, color: colors.textMuted, border: `1px solid ${colors.border}`, borderRadius: "14px 14px 14px 4px" }}
            >
              <span className="flex gap-1 items-center">
                {[0, 0.3, 0.6].map((d) => (
                  <span
                    key={d}
                    className="w-1.5 h-1.5 rounded-full inline-block"
                    style={{ background: colors.green, animation: `bounce 1.2s ease-in-out ${d}s infinite` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PitchEdenChatSlide({ colors }: { colors: Colors }) {
  return (
    <Slide index={7} section="EDEN" accent={colors.green} colors={colors}>

      {/* ── MOBILE LAYOUT: absolute-fill so chat uses all remaining screen space ── */}
      <div className="lg:hidden absolute inset-0 flex flex-col pt-14 pb-14 px-5" style={{ zIndex: 11 }}>
        <h2 className="text-xl font-bold mb-3 shrink-0" style={{ color: colors.text }}>
          Ask EDEN anything about the biotech landscape.
        </h2>
        {/* Compact identity bar replaces the giant orb */}
        <div
          className="flex items-center gap-3 mb-4 p-3 rounded-xl shrink-0"
          style={{ background: colors.bgLight, border: `1px solid ${colors.border}` }}
        >
          <EdenAvatar size={34} />
          <div>
            <p className="text-sm font-bold" style={{ color: colors.green }}>EDEN Intelligence Engine</p>
            <p className="text-[10px] leading-relaxed" style={{ color: colors.textMuted }}>
              300+ tech transfer offices · Scored · Enriched · Actionable
            </p>
          </div>
        </div>
        {/* Chat fills all remaining height */}
        <div className="flex-1 min-h-0">
          <PitchEdenChat colors={colors} mobile />
        </div>
      </div>

      {/* ── DESKTOP LAYOUT: giant orb left, chat right ── */}
      <div className="hidden lg:block">
        <h2 className="text-2xl lg:text-3xl xl:text-4xl font-bold mb-7" style={{ color: colors.text }}>
          Ask EDEN anything about the biotech landscape.
        </h2>
        <div className="flex flex-row gap-10 items-center">
          <div className="flex flex-col items-center shrink-0 w-[40%]">
            <div className="w-full max-w-[380px]">
              <EdenOrb />
            </div>
            <p className="text-sm font-bold mt-1" style={{ color: colors.green }}>EDEN Intelligence Engine</p>
            <p className="text-xs text-center max-w-xs mt-1 leading-relaxed" style={{ color: colors.textMuted }}>
              Natural language queries across 300+ tech transfer offices. Scored. Enriched. Actionable.
            </p>
          </div>
          <div className="flex-1 min-w-0">
            <PitchEdenChat colors={colors} />
          </div>
        </div>
      </div>
    </Slide>
  );
}

/* ═══════════════════════ SLIDE 7 — EDEN RADAR ═══════════════════════ */
function RadarSlide({ colors }: { colors: Colors }) {
  const features = [
    { icon: Building2, label: "300+ Tech Transfer Offices", desc: "Continuously scraped with bespoke and automated ingestion pipelines across major research universities" },
    { icon: FileBarChart2, label: "EDEN-Enriched Dossiers", desc: "Every asset classified by target, modality, indication, and development stage with supporting literature" },
    { icon: Zap, label: "First to Know", desc: "Real-time alerts on new listings, convergence signals, and rising activity clusters by therapy area" },
    { icon: TrendingUp, label: "Direct Lab Signals", desc: "Scored research signals from EdenLab and EdenDiscovery surface directly to industry teams" },
  ];
  return (
    <Slide index={6} section="EdenScout" accent={colors.green} colors={colors} waves>
      <PitchDots color={colors.green} count={10} />
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center" style={{ background: colors.greenDim }}>
          <Sprout className="w-5 h-5" style={{ color: colors.green }} />
        </div>
        <div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold" style={{ color: colors.text }}>
            Eden<span style={{ color: colors.green }}>Scout</span>
          </h2>
        </div>
      </div>
      <p className="text-sm sm:text-base lg:text-lg mb-5 sm:mb-7 max-w-2xl" style={{ color: colors.textMuted }}>
        The industry-facing layer. EdenScout monitors 300+ Technology Transfer Offices, ingests new listings, and enriches every asset with classification, scoring, and supporting literature. Direct signals from EdenLab and EdenDiscovery ensure you see advancements directly from the labs and researchers themselves.
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

/* ═══════════════════════ SLIDE 8 — EARLY SIGNAL PIPELINE ═══════════════════════ */
function EarlySignalSlide({ colors }: { colors: Colors }) {
  const discoveryFeatures = [
    { icon: Sparkles, text: "Submit ideas before formal research begins" },
    { icon: Target, text: "EDEN AI scoring and credibility scoring (0-100 scale)" },
    { icon: Users, text: "Discovered by industry scouts and collaborators" },
    { icon: Lock, text: "Timestamped concept provenance" },
  ];
  const labFeatures = [
    { icon: Workflow, text: "11-section structured research project canvas" },
    { icon: BookOpen, text: "Literature synthesis across 40+ academic sources" },
    { icon: Award, text: "Grants matched to your research profile" },
    { icon: Link2, text: "Signals flow directly to EdenScout subscribers" },
  ];

  return (
    <Slide index={5} section="Supply Side" accent={colors.green} colors={colors}>
      <PitchDots color={colors.amber} count={5} seed={0} />
      <PitchDots color={colors.violet} count={5} seed={2} />
      <p className="text-[10px] sm:text-sm font-bold uppercase tracking-widest mb-2 sm:mb-3" style={{ color: colors.green }}>The supply side of the ecosystem</p>
      <h2 className="text-xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold mb-4 sm:mb-7" style={{ color: colors.text }}>
        Early Signal <span style={{ color: colors.green }}>Pipeline</span>.
      </h2>

      <div className="flex flex-col sm:flex-row items-stretch gap-4 sm:gap-0">
        {/* EdenDiscovery — amber */}
        <div className="flex-1 rounded-xl p-4 sm:p-6 flex flex-col" style={{ background: colors.amberDim, border: `1px solid ${colors.amber}44`, borderTop: `3px solid ${colors.amber}` }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: colors.amber }}>
              <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold leading-tight" style={{ color: colors.text }}>
                Eden<span style={{ color: colors.amber }}>Discovery</span>
              </h3>
              <p className="text-[10px] sm:text-xs" style={{ color: colors.textMuted }}>Tier 1 · Concept Community</p>
            </div>
          </div>
          <ul className="space-y-2 flex-1 mb-4">
            {discoveryFeatures.map((f) => (
              <li key={f.text} className="flex items-start gap-2 text-xs sm:text-sm" style={{ color: colors.text }}>
                <f.icon className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: colors.amber }} />
                {f.text}
              </li>
            ))}
          </ul>
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold w-fit"
            style={{ background: `${colors.amber}22`, color: colors.amber, border: `1px solid ${colors.amber}44` }}
          >
            <Globe className="w-3 h-3" />
            Public feed · No login required
          </div>
        </div>

        {/* Connector: concept → research → signal to industry */}
        {/* Desktop: vertical dashed line + label + arrow */}
        <div className="hidden sm:flex flex-col items-center justify-center shrink-0 w-14 px-1 gap-1">
          <div className="w-px flex-1 max-h-12" style={{ background: `linear-gradient(to bottom, ${colors.amber}77, ${colors.violet}77)` }} />
          <div className="text-center leading-tight py-1">
            <p className="text-[8px] font-bold uppercase tracking-wider" style={{ color: colors.amber }}>concept</p>
            <ChevronRight className="w-3.5 h-3.5 rotate-90 mx-auto my-0.5" style={{ color: colors.green }} />
            <p className="text-[8px] font-bold uppercase tracking-wider" style={{ color: colors.violet }}>research</p>
            <ChevronRight className="w-3.5 h-3.5 rotate-90 mx-auto my-0.5" style={{ color: colors.green }} />
            <p className="text-[8px] font-bold uppercase tracking-wider" style={{ color: colors.green }}>signal</p>
          </div>
          <div className="w-px flex-1 max-h-12" style={{ background: `linear-gradient(to bottom, ${colors.violet}77, ${colors.green}77)` }} />
        </div>
        {/* Mobile: horizontal arrow separator */}
        <div className="sm:hidden flex items-center gap-2">
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${colors.amber}55, ${colors.violet}55)` }} />
          <div className="text-center shrink-0">
            <p className="text-[8px] font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>concept → research → signal</p>
          </div>
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${colors.violet}55, ${colors.green}55)` }} />
        </div>

        {/* EdenLab — violet */}
        <div className="flex-1 rounded-xl p-4 sm:p-6 flex flex-col" style={{ background: colors.violetDim, border: `1px solid ${colors.violet}44`, borderTop: `3px solid ${colors.violet}` }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: colors.violet }}>
              <FlaskConical className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold leading-tight" style={{ color: colors.text }}>
                Eden<span style={{ color: colors.violet }}>Lab</span>
              </h3>
              <p className="text-[10px] sm:text-xs" style={{ color: colors.textMuted }}>Tier 2 · Research Workspace</p>
            </div>
          </div>
          <ul className="space-y-2 flex-1 mb-4">
            {labFeatures.map((f) => (
              <li key={f.text} className="flex items-start gap-2 text-xs sm:text-sm" style={{ color: colors.text }}>
                <f.icon className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: colors.violet }} />
                {f.text}
              </li>
            ))}
          </ul>
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold w-fit"
            style={{ background: `${colors.violet}22`, color: colors.violet, border: `1px solid ${colors.violet}44` }}
          >
            <ArrowRight className="w-3 h-3" />
            Signals flow directly to EdenScout
          </div>
        </div>
      </div>

      <p className="text-[10px] sm:text-xs text-center mt-4 sm:mt-5 max-w-2xl mx-auto leading-relaxed" style={{ color: colors.textMuted }}>
        Every concept submitted and every research project published becomes an enriched, scored signal visible to EdenScout subscribers.
      </p>
    </Slide>
  );
}

/* ═══════════════════════ SLIDE 9 — WHAT WE'VE BUILT ═══════════════════════ */
function StatCard({ num, suffix, text, label, icon: Icon, color, active, bgLight, border, textMuted }: {
  num?: number; suffix?: string; text?: string; label: string; icon: ElementType; color: string; active: boolean; bgLight: string; border: string; textMuted: string;
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
  const statsInView = useInView(statsRef, { once: false, amount: 0.3 });
  const stats: { num?: number; suffix?: string; text?: string; label: string; icon: ElementType; color: string }[] = [
    { num: 300, suffix: "+", label: "Tech Transfer Offices", icon: Building2, color: colors.green },
    { num: 40, suffix: "+", label: "Research Data Sources", icon: Database, color: colors.violet },
    { text: "Custom GPT-5", label: "Classifier & Enrichment", icon: Brain, color: colors.green },
    { num: 11, suffix: "-Step", label: "Research Workflow", icon: Workflow, color: colors.amber },
  ];
  const tiers = [
    { name: "EdenDiscovery", price: "Free", period: "", color: colors.amber, dim: colors.amberDim, icon: Lightbulb, desc: "Concept community access, EDEN AI scoring, landscape intelligence" },
    { name: "EdenLab", price: "Free", period: "", color: colors.violet, dim: colors.violetDim, icon: FlaskConical, desc: "Full research workspace, 40+ sources, intuitive project workflow, grants" },
    { name: "EdenScout", price: "$799", period: "/mo", color: colors.green, dim: colors.greenDim, icon: Sprout, desc: "Full-access industry intelligence platform — 300+ TTOs, EDEN dossiers, convergence signals, deal flow alerts, and pipeline export" },
  ];
  return (
    <Slide index={8} section="What We've Built" accent={colors.green} colors={colors}>
      <h2 className="text-xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold mb-1 sm:mb-2" style={{ color: colors.text }}>
        Built, deployed, <span style={{ color: colors.green }}>running today</span>.
      </h2>
      <p className="text-[10px] sm:text-sm lg:text-base mb-3 sm:mb-6 max-w-2xl" style={{ color: colors.textMuted }}>
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

/* ═══════════════════════ SLIDE 10 — CONTACT ═══════════════════════ */
function ContactSlide({ colors }: { colors: Colors }) {
  return (
    <Slide index={9} section="Contact" accent={colors.green} colors={colors} waves>
      <PitchDots color={colors.green} count={8} />
      <div className="flex flex-col items-center text-center px-2 sm:px-8">
        <div className="flex flex-col items-start gap-3 mb-6">
          {[
            { label: "Discovery", color: colors.amber, dim: colors.amberDim, Icon: Lightbulb },
            { label: "Lab",       color: colors.violet, dim: colors.violetDim, Icon: FlaskConical },
            { label: "Scout",     color: colors.green,  dim: colors.greenDim,  Icon: Search },
          ].map(({ label, color, dim, Icon }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color }}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <span className="text-base font-semibold" style={{ color: colors.text }}>
                Eden<span style={{ color }}>{label}</span>
              </span>
            </div>
          ))}
        </div>
        <h2 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold mb-2" style={{ color: colors.text }}>
          Let's build the future of <span style={{ color: colors.green }}>biotech intelligence</span>.
        </h2>
        <p className="text-sm sm:text-base lg:text-lg mb-6 sm:mb-8 max-w-lg" style={{ color: colors.textMuted }}>
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
            <p className="text-xs font-medium break-all" style={{ color: colors.accent }}>wmohamed@edennx.com</p>
          </div>
          <div className="rounded-xl p-4 sm:p-5" style={{ background: colors.bgLight, border: `1px solid ${colors.border}` }}>
            <p className="text-sm font-bold mb-0.5" style={{ color: colors.text }}>Richard Elles</p>
            <p className="text-xs mb-1.5" style={{ color: colors.textMuted }}>Co-Founder & COO</p>
            <p className="text-xs font-medium break-all" style={{ color: colors.accent }}>relles@edennx.com</p>
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
      } as CSSProperties}
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
      <WhoWeAreSlide colors={colors} />
      <ProblemSlide colors={colors} />
      <SolutionPortalsSlide colors={colors} />
      <EarlySignalSlide colors={colors} />
      <RadarSlide colors={colors} />
      <PitchEdenChatSlide colors={colors} />
      <TractionSlide colors={colors} />
      <ContactSlide colors={colors} />
    </div>
  );
}
