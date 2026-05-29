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
  Check,
  ShoppingBag,
} from "lucide-react";
import { motion, AnimatePresence, useInView, useReducedMotion } from "framer-motion";
import wafickPhoto from "@assets/WM_phot_1774028682960.jpg";
import richardPhoto from "@assets/Headshot1_1774028710682.jpg";
import { EdenAvatar } from "@/components/EdenOrb";
import { ExportMenu } from "@/components/ExportMenu";
import { useDocumentMeta } from "@/hooks/use-document-meta";

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
  indigo: "#7c89f9",
  indigoDim: "rgba(124,137,249,0.14)",
  accent: "#58a6ff",
  red: "#f85149",
  redDim: "rgba(248,81,73,0.14)",
};

const LIGHT = {
  bg: "hsl(210,25%,97%)",
  bgLight: "hsl(210,25%,93%)",
  border: "hsl(142,28%,87%)",
  text: "hsl(222,47%,12%)",
  textMuted: "hsl(215,18%,48%)",
  green: "hsl(142,52%,36%)",
  greenDim: "hsl(142,52%,36%,0.08)",
  amber: "hsl(33,85%,44%)",
  amberDim: "hsl(33,85%,44%,0.08)",
  violet: "hsl(265,55%,48%)",
  violetDim: "hsl(265,55%,48%,0.08)",
  indigo: "hsl(232,60%,52%)",
  indigoDim: "hsl(232,60%,52%,0.08)",
  accent: "hsl(222,70%,45%)",
  red: "hsl(0,70%,52%)",
  redDim: "hsl(0,70%,52%,0.08)",
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
      const sweepPeak = dark ? 0.15 : 0.09;
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
        ctx.fillStyle = "#c47d1a";
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
          { cx: 510, label: "Tech Transfer", dim: true },
          { cx: 720, label: "Industry", dim: true },
        ].map((n) => (
          <g key={n.label}>
            <circle cx={n.cx} cy={100} r={24} fill="none" stroke={color} strokeWidth="2"
              style={{ animation: n.dim ? "node-dim 4s ease-in-out infinite" : "node-steady 4s ease-in-out infinite" }} />
            <circle cx={n.cx} cy={100} r={5} fill={color} style={{ opacity: n.dim ? 0.3 : 0.65 }} />
            <text x={n.cx} y={148} textAnchor="middle" fill={color} fontSize={16} fontWeight="700"
              style={{ opacity: n.dim ? 0.75 : 0.9 }}>{n.label}</text>
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
        <text x="410" y="182" textAnchor="middle" fill={color} fontSize="13" fontStyle="italic" opacity="0.72">
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
        <div className="flex flex-col justify-center flex-1 px-5 sm:px-8 lg:px-8 py-10 sm:py-20 pb-14 sm:pb-20 relative z-10">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight mb-3" style={{ color: colors.text }}>
            Eden<span style={{ color: colors.green }}>Radar</span>
          </h1>
          <p className="text-lg sm:text-xl lg:text-2xl font-semibold mb-4" style={{ color: colors.green }}>Biotech Intelligence Platform</p>
          <p className="text-sm sm:text-base lg:text-lg max-w-sm sm:max-w-md lg:max-w-xl mb-8 sm:mb-10" style={{ color: colors.textMuted }}>
            350+ tech transfer offices. 33,000+ scored assets. 40+ live data sources. The intelligence layer that gets BD teams{" "}
            <span style={{ color: colors.amber, fontWeight: 600 }}>upstream of the patent.</span>
          </p>
          <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-xs" style={{ color: colors.textMuted }}>
            <span>Founded 2026</span>
            <span className="w-1 h-1 rounded-full" style={{ background: colors.green }} />
            <span>edenradar.com</span>
          </div>
        </div>

        {/* Right panel: live product preview */}
        <div className="hidden md:flex w-[42%] shrink-0 flex-col justify-center gap-2.5 pr-8 lg:pr-12 relative" style={{ zIndex: 20 }}>
          {[
            { score: 93, title: "α-Synuclein Targeting Antibody for Parkinson's Disease", institution: "Mayo Clinic", stage: "Preclinical", modality: "Antibody" },
            { score: 92, title: "HER2-Targeted ADC with Novel Cleavable Linker Chemistry", institution: "MIT Koch Institute", stage: "IND-Enabling", modality: "ADC" },
            { score: 91, title: "CAR-T Cell Therapy Targeting CD19/CD22 Dual Antigen", institution: "Johns Hopkins", stage: "Preclinical", modality: "Cell Therapy" },
          ].map((a, i) => (
            <div
              key={a.score}
              className="flex items-center gap-3 rounded-xl px-4"
              style={{
                height: 60,
                background: colors.bgLight,
                border: `1px solid ${colors.border}`,
                boxShadow: "0 4px 16px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
                opacity: 1 - i * 0.08,
                transform: `scale(${1 - i * 0.015})`,
                transformOrigin: "center right",
              }}
            >
              <div
                className="flex-shrink-0 flex items-center justify-center rounded-lg font-bold tabular-nums"
                style={{ width: 38, height: 38, background: colors.amberDim, color: colors.amber, fontSize: 14 }}
              >
                {a.score}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold leading-snug truncate" style={{ color: colors.text }}>{a.title}</p>
                <p className="text-[10px] mt-0.5" style={{ color: colors.textMuted }}>{a.institution} · {a.stage} · {a.modality}</p>
              </div>
            </div>
          ))}
          <p className="text-[10px] font-semibold uppercase tracking-widest text-right mt-1" style={{ color: colors.textMuted }}>
            Live from 358 monitored institutions
          </p>
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
      role: "Co-Founder",
      bio: "Biotech executive, entrepreneur, and professor with extensive global pharma and quality systems experience.",
      color: colors.amber,
    },
    {
      photo: richardPhoto,
      name: "Richard Elles",
      role: "Co-Founder",
      bio: "Healthcare strategist and PMP-certified leader with deep healthtech startup and academic research experience.",
      color: colors.green,
    },
  ];

  return (
    <Slide index={2} section="Who We Are" accent={colors.green} colors={colors} waves>
      <PitchDots color={colors.green} count={10} />
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 items-start lg:items-center">

        {/* LEFT: mission + vision text */}
        <div className="flex-1 min-w-0">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-3"
            style={{ background: colors.greenDim, color: colors.green, border: `1px solid ${colors.green}44` }}
          >
            Founded 2026
          </div>
          <h2 className="text-xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold mb-4 leading-tight" style={{ color: colors.text }}>
            The team building the{" "}
            <span style={{ color: colors.green }}>connective tissue of research & biotech.</span>
          </h2>
          <blockquote
            className="text-base sm:text-lg lg:text-xl italic mb-4 max-w-lg leading-relaxed"
            style={{ color: colors.textMuted }}
          >
            "We accelerate pharmaceutical and biotech innovation by capturing research at its earliest possible moments, creating direct connections between scientists and the industry partners who can advance it."
          </blockquote>
          <p className="text-sm sm:text-base max-w-lg leading-relaxed" style={{ color: colors.green }}>
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
    { icon: AlertTriangle, title: "Innovation Gets Buried", desc: "Breakthrough concepts stall in university labs with no path to industry." },
    { icon: Search, title: "Industry Starts Too Late", desc: "By the patent stage, the best assets are already locked, gone, or unfunded." },
    { icon: Layers, title: "No Shared Intelligence", desc: "Researchers, TTOs, and BD teams operate in disconnected silos with no shared intelligence." },
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

/* ═══════════════════════ SLIDE 4 — SOLUTION + PORTALS (INDUSTRY-FORWARD) ═══════════════════════ */
function SolutionPortalsSlide({ colors }: { colors: Colors }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const gridInView = useInView(gridRef, { once: false, amount: 0.2 });
  const reducedMotion = useReducedMotion();
  const skip = !!reducedMotion;

  const industryPortals = [
    {
      title: "EdenRadar", tagline: "Industry intelligence across 350+ TTOs", money: "Industry SaaS subscription",
      color: colors.green, dim: colors.greenDim, icon: Search,
      items: [
        "EDEN-scored and enriched asset dossiers",
        "Personalised alerts and live TTO feeds",
        "Direct lab signals from EdenLab + Discovery",
      ],
      featured: true,
    },
    {
      title: "EdenMarket", tagline: "Blind marketplace for licensable biotech assets", money: "Transactional · listing & deal-room access",
      color: colors.indigo, dim: colors.indigoDim, icon: ShoppingBag,
      items: [
        "NDA-gated deal rooms close the loop on Scout finds",
        "Confidential EOIs between buyers and sellers",
        "Where industry transacts on what Scout discovers",
      ],
      featured: false,
    },
  ];


  return (
    <Slide index={4} section="Our Solution" accent={colors.green} colors={colors}>
      <PitchDots color={colors.green} count={4} seed={0} />
      <PitchDots color={colors.indigo} count={4} seed={1} />
      <PitchDots color={colors.amber} count={3} seed={2} />
      <p className="text-xs sm:text-sm font-bold uppercase tracking-widest mb-2" style={{ color: colors.green }}>Two tracks. One ecosystem. Industry pays. Researchers supply.</p>
      <h2 className="text-xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold mb-3 sm:mb-4" style={{ color: colors.text }}>
        EdenRadar <span style={{ color: colors.green }}>powers</span> the <span style={{ color: colors.green }}>full life cycle</span>.
      </h2>

      {/* ── FOR INDUSTRY (top, dominant) ── */}
      <div ref={gridRef} className="mb-3 sm:mb-4">
        <div className="flex items-center gap-2 mb-2 sm:mb-2.5">
          <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{ color: colors.green }} />
          <p className="text-xs sm:text-xs font-bold uppercase tracking-widest" style={{ color: colors.green }}>For Industry · Revenue Engines</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          {industryPortals.map((p, i) => (
            <motion.div
              key={p.title}
              className="rounded-2xl p-3 sm:p-4 flex flex-col relative overflow-hidden"
              style={{
                background: p.featured
                  ? `linear-gradient(135deg, ${p.dim} 0%, ${colors.bgLight} 100%)`
                  : p.dim,
                border: `2px solid ${p.color}${p.featured ? "88" : "55"}`,
                borderTop: `3px solid ${p.color}`,
                boxShadow: p.featured ? `0 0 32px ${p.color}22` : "none",
              }}
              initial={skip ? false : { opacity: 0, y: -8 }}
              animate={skip || gridInView ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
              transition={skip ? { duration: 0 } : { duration: 0.4, delay: i * 0.1, ease: "easeOut" }}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: p.color }}>
                  <p.icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: "#fff" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm sm:text-lg font-bold leading-tight" style={{ color: colors.text }}>
                    Eden<span style={{ color: p.color }}>{p.title.replace("Eden", "")}</span>
                  </h3>
                  <p className="text-xs sm:text-xs leading-snug" style={{ color: colors.textMuted }}>{p.tagline}</p>
                </div>
              </div>
              <div
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs sm:text-xs font-bold uppercase tracking-wider w-fit mb-2"
                style={{ background: `${p.color}22`, color: p.color, border: `1px solid ${p.color}55` }}
              >
                {p.money}
              </div>
              <ul className="space-y-1 mt-auto">
                {p.items.map((item) => (
                  <li key={item} className="flex items-start gap-1.5 text-xs sm:text-xs" style={{ color: colors.text }}>
                    <Check className="w-3 h-3 mt-0.5 shrink-0" style={{ color: p.color }} />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Supply side footnote ── */}
      <div className="mt-2 sm:mt-3 flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: colors.bgLight, border: `1px solid ${colors.border}` }}>
        <FlaskConical className="w-3.5 h-3.5 shrink-0" style={{ color: colors.textMuted }} />
        <p className="text-xs" style={{ color: colors.textMuted }}>
          <span className="font-semibold" style={{ color: colors.amber }}>EdenDiscovery</span> and{" "}
          <span className="font-semibold" style={{ color: colors.violet }}>EdenLab</span>
          {" "}are free researcher tools that feed the data network — concepts and research projects become scored assets visible to Scout subscribers.
        </p>
        <ArrowRight className="w-3.5 h-3.5 shrink-0" style={{ color: colors.green }} />
      </div>
    </Slide>
  );
}

/* ═══════════════════════ SLIDE 8 — EDEN ENGINE (SCENARIO CHAT DEMO) ═══════════════════════ */

interface PitchChatMsg {
  role: "eden" | "user";
  text: string;
  delay: number;
  instant?: boolean;
  scanning?: boolean;
  assets?: { id: number; title: string; institution: string; stage: string; score: number; modality: string }[];
}

interface PitchScenario {
  id: string;
  number: string;
  eyebrow: string;
  title: string;
  messages: PitchChatMsg[];
}

const PITCH_SCAN_NAMES = ["MIT TTO", "Stanford OTL", "Johns Hopkins", "Mayo Clinic", "Max Planck", "Columbia", "UCSF", "Harvard OTD", "Yale TTO", "NIH", "Oxford TT", "Penn TTO", "Duke OLV", "Broad Institute", "Rockefeller"];

const JHU_PITCH_ASSETS = [
  { id: 1, title: "CAR-T Cell Therapy Targeting CD19/CD22 Dual Antigen", institution: "Johns Hopkins", stage: "Preclinical", score: 91, modality: "Cell Therapy" },
  { id: 2, title: "Bispecific Antibody Against PD-L1 and TIM-3 in Lymphoma", institution: "Johns Hopkins", stage: "IND-Enabling", score: 88, modality: "Antibody" },
  { id: 3, title: "HDAC Inhibitor Platform for Solid Tumor Microenvironment", institution: "Johns Hopkins", stage: "Discovery", score: 85, modality: "Small Molecule" },
];

const CNS_PITCH_ASSETS = [
  { id: 4, title: "α-Synuclein Targeting Antibody for Parkinson's Disease", institution: "Mayo Clinic", stage: "Preclinical", score: 93, modality: "Antibody" },
  { id: 5, title: "AAV9 Gene Therapy Targeting Motor Neurons in ALS", institution: "Columbia University", stage: "IND-Enabling", score: 89, modality: "Gene Therapy" },
  { id: 6, title: "LRRK2 Kinase Inhibitor Platform for Neurodegeneration", institution: "Stanford University", stage: "Discovery", score: 87, modality: "Small Molecule" },
];

const ADC_PITCH_ASSETS = [
  { id: 7, title: "HER2-Targeted ADC with Novel Cleavable Linker Chemistry", institution: "MIT Koch Institute", stage: "IND-Enabling", score: 92, modality: "ADC" },
  { id: 8, title: "TROP2-Directed ADC for Triple-Negative Breast Cancer", institution: "Mem. Sloan Kettering", stage: "Preclinical", score: 86, modality: "ADC" },
  { id: 9, title: "CD33 ADC with Disulfide Linker for AML", institution: "Univ. of Washington", stage: "Discovery", score: 84, modality: "ADC" },
];

const PITCH_SCENARIOS: PitchScenario[] = [
  {
    id: "institution", number: "01", eyebrow: "Institution Focus", title: "Oncology pipeline at Hopkins.",
    messages: [
      { role: "eden", text: "14 new programs indexed at Hopkins since Monday. Anything specific on your radar?", delay: 600, instant: true },
      { role: "user", text: "We're expanding our oncology pipeline. What's worth a look at Hopkins right now?", delay: 1200 },
      { role: "eden", text: "14 JHU oncology programs indexed. Worth flagging: the HDAC inhibitor overlaps with Pfizer's Seagen integration territory — likely a dead end for most buyers. The CAR-T is different. PI has two prior licensings at this exact stage, both to top-10 pharma. I'd start there.", delay: 3000, scanning: true, assets: JHU_PITCH_ASSETS },
    ],
  },
  {
    id: "cross-tto", number: "02", eyebrow: "Cross-TTO Discovery", title: "Preclinical CNS across 22 institutions.",
    messages: [
      { role: "eden", text: "Good morning. I'm watching 22 active preclinical CNS programs this week, three with exclusivity windows under 90 days.", delay: 600, instant: true },
      { role: "user", text: "CNS startup, just closed our Series A. What preclinical assets are looking strong right now?", delay: 1200 },
      { role: "eden", text: "Strong cluster at Mayo, Stanford, and Columbia. Mayo's alpha-synuclein program leads at 93. The PI has closed two prior licensings at preclinical stage, both above $40M upfront. Columbia's ALS program has an exclusivity window closing in 60 days with no recorded LOIs on file.", delay: 3000, scanning: true, assets: CNS_PITCH_ASSETS },
    ],
  },
  {
    id: "modality", number: "03", eyebrow: "Modality Filter", title: "ADC platforms open for exclusive licensing.",
    messages: [
      { role: "eden", text: "Three new ADC programs cleared IND-enabling stage this month. Two are still open for exclusive licensing.", delay: 600, instant: true },
      { role: "user", text: "We need ADC platforms we can take exclusive. IND-enabling stage, ideally.", delay: 1200 },
      { role: "eden", text: "Fourteen ADCs match. MIT HER2 leads at 92. The linker chemistry is covered by a separate patent, but both assets fall under a single exclusive license term sheet — you're acquiring the full stack. I've already removed programs that only offered non-exclusive terms.", delay: 3000, scanning: true, assets: ADC_PITCH_ASSETS },
    ],
  },
];

function PitchScanAnim({ onDone, colors }: { onDone: () => void; colors: Colors }) {
  const [nameIdx, setNameIdx] = useState(0);
  const [dots, setDots] = useState(1);

  useEffect(() => {
    let step = 0;
    const iv = setInterval(() => {
      step++;
      setNameIdx(p => (p + 1) % PITCH_SCAN_NAMES.length);
      setDots(p => (p % 3) + 1);
      if (step >= 14) { clearInterval(iv); setTimeout(onDone, 120); }
    }, 140);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: colors.green, animation: "eden-pulse 0.6s ease-in-out infinite" }} />
      <span className="text-[11px] font-mono" style={{ color: `${colors.green}cc` }}>
        Scanning 358 institutions{".".repeat(dots)}{" "}
        <span key={nameIdx} style={{ animation: "scan-slide 0.12s ease-out forwards" }}>{PITCH_SCAN_NAMES[nameIdx]}</span>
      </span>
    </div>
  );
}

function PitchQueryResultCard({ asset, colors }: { asset: { id: number; title: string; institution: string; stage: string; score: number; modality: string }; colors: Colors }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4"
      style={{
        height: 54,
        background: colors.bgLight,
        border: `1px solid ${colors.border}`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-lg font-bold tabular-nums"
        style={{ width: 36, height: 36, background: colors.greenDim, color: colors.green, fontSize: 13 }}
      >
        {asset.score}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold leading-snug truncate" style={{ color: colors.text }}>{asset.title}</p>
        <p className="text-[10px] mt-0.5" style={{ color: colors.textMuted }}>
          {asset.institution} · {asset.stage} · {asset.modality}
        </p>
      </div>
    </div>
  );
}

function PitchScenarioChat({ scenario, colors }: { scenario: PitchScenario; colors: Colors }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [scanningIdx, setScanningIdx] = useState<number | null>(null);
  const [doneSet, setDoneSet] = useState<Set<number>>(new Set());
  const chatRef = useRef<HTMLDivElement>(null);
  const tids = useRef<ReturnType<typeof setTimeout>[]>([]);
  const reducedMotion = useReducedMotion();

  const scrollBottom = () =>
    requestAnimationFrame(() => requestAnimationFrame(() => {
      chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
    }));

  useEffect(() => {
    tids.current.forEach(clearTimeout);
    tids.current = [];
    setVisibleCount(0);
    setScanningIdx(null);
    setDoneSet(new Set());

    scenario.messages.forEach((msg, i) => {
      const t = setTimeout(() => {
        setVisibleCount(i + 1);
        scrollBottom();
        if (msg.role === "eden") {
          if (msg.instant) {
            setDoneSet(prev => new Set(prev).add(i));
          } else if (msg.scanning) {
            setScanningIdx(i);
          } else {
            setDoneSet(prev => new Set(prev).add(i));
          }
        }
      }, reducedMotion ? i * 300 : msg.delay);
      tids.current.push(t);
    });

    return () => tids.current.forEach(clearTimeout);
  }, [scenario]);

  function handleScanDone(idx: number) {
    setScanningIdx(null);
    const t = setTimeout(() => {
      setDoneSet(prev => new Set(prev).add(idx));
      scrollBottom();
    }, reducedMotion ? 0 : 300);
    tids.current.push(t);
  }

  const msgs = scenario.messages;

  return (
    <div
      className="relative flex flex-col rounded-2xl overflow-hidden"
      style={{
        height: "clamp(340px, 52vh, 460px)",
        background: colors.bgLight,
        border: `1px solid ${colors.border}`,
        boxShadow: "0 20px 56px rgba(0,0,0,0.09), 0 4px 16px rgba(0,0,0,0.05)",
      }}
    >
      <style>{`
        @keyframes eden-pulse { 0%,100%{opacity:1}50%{opacity:0.35} }
        @keyframes fade-up { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes scan-slide { from{opacity:0;transform:translateX(-5px)} to{opacity:1;transform:translateX(0)} }
      `}</style>

      {/* Chrome bar */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0"
        style={{ background: colors.bg, borderBottom: `1px solid ${colors.border}` }}
      >
        <img src="/images/eden-nx-mark.png" alt="EDEN" className="w-6 h-6 object-contain flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold leading-tight" style={{ color: colors.text }}>EDEN</p>
          <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: colors.green }}>Research Intelligence</p>
        </div>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.green, animation: "eden-pulse 2s ease-in-out infinite" }} />
      </div>

      {/* Messages */}
      <div
        ref={chatRef}
        className="flex flex-col gap-3 overflow-y-auto flex-1 p-4"
        style={{ scrollbarWidth: "none" } as CSSProperties}
      >
        {msgs.slice(0, visibleCount).map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            style={{ animation: "fade-up 0.3s ease-out forwards" }}
          >
            {msg.role === "eden" && <EdenAvatar size={24} />}
            <div className="max-w-[85%] flex flex-col gap-2">
              {doneSet.has(i) ? (
                <div
                  className="px-3.5 py-2.5 text-xs leading-relaxed"
                  style={msg.role === "user"
                    ? { background: colors.green, color: "#fff", borderRadius: "12px 12px 4px 12px" }
                    : { background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: "12px 12px 12px 4px" }
                  }
                >
                  {msg.text}
                </div>
              ) : scanningIdx === i ? (
                <div
                  className="px-3.5 py-2.5"
                  style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: "12px 12px 12px 4px" }}
                >
                  <PitchScanAnim onDone={() => handleScanDone(i)} colors={colors} />
                </div>
              ) : (
                <div className="flex gap-1 items-center px-3.5 py-2.5 rounded-xl" style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
                  {[0, 0.3, 0.6].map(d => (
                    <span key={d} className="w-1.5 h-1.5 rounded-full" style={{ background: colors.green, animation: `bounce 1.2s ease-in-out ${d}s infinite` }} />
                  ))}
                </div>
              )}
              {doneSet.has(i) && msg.assets && (
                <div className="space-y-1.5">
                  {msg.assets.map(a => <PitchQueryResultCard key={a.id} asset={a} colors={colors} />)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PitchEdenChatSlide({ colors }: { colors: Colors }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [chatKey, setChatKey] = useState(0);

  function switchTo(idx: number) {
    setActiveIdx(idx);
    setChatKey(k => k + 1);
  }

  const scenario = PITCH_SCENARIOS[activeIdx];

  return (
    <Slide index={8} section="EDEN" accent={colors.green} colors={colors}>
      <div className="flex items-start justify-between mb-3 sm:mb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: colors.green }}>EDEN in action</p>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold leading-tight" style={{ color: colors.text }}>
            The Intelligence Engine.
          </h2>
        </div>
        <EdenAvatar size={44} />
      </div>

      {/* Scenario tabs */}
      <div className="flex gap-2 mb-2 flex-wrap">
        {PITCH_SCENARIOS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => switchTo(i)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200"
            style={{
              background: activeIdx === i ? colors.green : colors.bgLight,
              color: activeIdx === i ? "#fff" : colors.textMuted,
              border: `1px solid ${activeIdx === i ? colors.green : colors.border}`,
            }}
          >
            <span className="font-mono text-[9px] opacity-60">{s.number}</span>
            {s.eyebrow}
          </button>
        ))}
      </div>

      <p className="text-sm sm:text-base font-semibold mb-3" style={{ color: colors.text }}>{scenario.title}</p>

      <PitchScenarioChat key={chatKey} scenario={scenario} colors={colors} />
    </Slide>
  );
}

/* ═══════════════════════ SLIDE 7 — EDEN RADAR ═══════════════════════ */
function RadarSlide({ colors }: { colors: Colors }) {
  const features = [
    { icon: Building2, label: "350+ Tech Transfer Offices", desc: "Continuously collected with bespoke and automated ingestion pipelines across major research universities" },
    { icon: FileBarChart2, label: "EDEN-Enriched Dossiers", desc: "Every asset classified by target, modality, indication, and development stage with supporting literature" },
    { icon: Zap, label: "First to Know", desc: "Real-time alerts on new listings, convergence signals, and rising activity clusters by therapy area" },
    { icon: TrendingUp, label: "Direct Lab Signals", desc: "Scored research signals from EdenLab and EdenDiscovery surface directly to industry teams" },
  ];
  return (
    <Slide index={6} section="EdenRadar" accent={colors.green} colors={colors} waves>
      <PitchDots color={colors.green} count={10} />
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center" style={{ background: colors.greenDim }}>
          <Search className="w-5 h-5" style={{ color: colors.green }} />
        </div>
        <div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold" style={{ color: colors.text }}>
            Eden<span style={{ color: colors.green }}>Scout</span>
          </h2>
        </div>
      </div>
      <p className="text-sm sm:text-base lg:text-lg mb-5 sm:mb-7 max-w-2xl" style={{ color: colors.textMuted }}>
        The industry-facing layer. EdenRadar monitors 350+ Technology Transfer Offices, ingests new listings, and enriches every asset with classification, scoring, and supporting literature. Direct signals from EdenLab and EdenDiscovery ensure you see advancements directly from the labs and researchers themselves.
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

      {/* Sample assets from the network */}
      <div className="mt-3 sm:mt-4 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: colors.textMuted }}>Live from the network</p>
        {[
          { id: 1, title: "CAR-T Cell Therapy Targeting CD19/CD22 Dual Antigen", institution: "Johns Hopkins", stage: "Preclinical", score: 91, modality: "Cell Therapy" },
          { id: 2, title: "α-Synuclein Targeting Antibody for Parkinson's Disease", institution: "Mayo Clinic", stage: "Preclinical", score: 93, modality: "Antibody" },
          { id: 3, title: "HER2-Targeted ADC with Novel Cleavable Linker Chemistry", institution: "MIT Koch Institute", stage: "IND-Enabling", score: 92, modality: "ADC" },
        ].map(a => (
          <div key={a.id} className="flex items-center gap-3 rounded-xl px-4" style={{ height: 52, background: colors.bgLight, border: `1px solid ${colors.border}` }}>
            <div className="flex-shrink-0 flex items-center justify-center rounded-lg font-bold tabular-nums" style={{ width: 34, height: 34, background: colors.amberDim, color: colors.amber, fontSize: 12 }}>
              {a.score}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold leading-snug truncate" style={{ color: colors.text }}>{a.title}</p>
              <p className="text-[10px] mt-0.5" style={{ color: colors.textMuted }}>{a.institution} · {a.stage} · {a.modality}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Industry handoff to Market */}
      <div
        className="mt-4 sm:mt-5 rounded-xl p-3 sm:p-3.5 flex items-center gap-2.5 sm:gap-3"
        style={{ background: colors.indigoDim, border: `2px solid ${colors.indigo}55` }}
      >
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: colors.indigo }}>
          <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color: colors.indigo }}>The Industry track continues →</p>
          <p className="text-xs sm:text-sm leading-snug" style={{ color: colors.text }}>
            …and when industry is ready to transact, <span className="font-bold" style={{ color: colors.indigo }}>EdenMarket</span> closes the loop with NDA-gated deal rooms.
          </p>
        </div>
        <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 hidden sm:block" style={{ color: colors.indigo }} />
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
    { icon: Link2, text: "Signals flow directly to EdenRadar subscribers" },
  ];

  return (
    <Slide index={5} section="Supply Side" accent={colors.green} colors={colors}>
      <PitchDots color={colors.amber} count={5} seed={0} />
      <PitchDots color={colors.violet} count={5} seed={2} />
      <p className="text-xs sm:text-sm font-bold uppercase tracking-widest mb-2 sm:mb-3" style={{ color: colors.green }}>The supply side of the ecosystem</p>
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
              <p className="text-xs sm:text-xs" style={{ color: colors.textMuted }}>Tier 1 · Concept Community</p>
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
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold w-fit"
            style={{ background: `${colors.amber}22`, color: colors.amber, border: `1px solid ${colors.amber}44` }}
          >
            <Globe className="w-3 h-3" />
            Public feed · No login required
          </div>
        </div>

        {/* Connector: concept → research → signal to industry */}
        {/* Desktop: vertical dashed line + label + arrow */}
        <div className="hidden sm:flex flex-col items-center justify-center shrink-0 w-20 px-2 gap-1">
          <div className="w-px flex-1 max-h-12" style={{ background: `linear-gradient(to bottom, ${colors.amber}77, ${colors.violet}77)` }} />
          <div className="text-center leading-tight py-2">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.amber }}>Concept</p>
            <ChevronRight className="w-5 h-5 rotate-90 mx-auto my-1" style={{ color: colors.green }} />
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.violet }}>Research</p>
            <ChevronRight className="w-5 h-5 rotate-90 mx-auto my-1" style={{ color: colors.green }} />
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.green }}>Signal</p>
          </div>
          <div className="w-px flex-1 max-h-12" style={{ background: `linear-gradient(to bottom, ${colors.violet}77, ${colors.green}77)` }} />
        </div>
        {/* Mobile: horizontal arrow separator */}
        <div className="sm:hidden flex items-center gap-2">
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${colors.amber}55, ${colors.violet}55)` }} />
          <div className="text-center shrink-0">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>concept → research → signal</p>
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
              <p className="text-xs sm:text-xs" style={{ color: colors.textMuted }}>Tier 2 · Research Workspace</p>
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
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold w-fit"
            style={{ background: `${colors.violet}22`, color: colors.violet, border: `1px solid ${colors.violet}44` }}
          >
            <ArrowRight className="w-3 h-3" />
            Signals flow directly to EdenRadar
          </div>
        </div>
      </div>

      {/* Funnel: Discovery → Lab → Scout → Market (terminates at the revenue endpoint) */}
      <div className="mt-4 sm:mt-5 max-w-3xl mx-auto">
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap text-xs sm:text-xs font-bold uppercase tracking-wider">
          <span className="px-2 py-1 rounded-md" style={{ background: `${colors.amber}22`, color: colors.amber, border: `1px solid ${colors.amber}55` }}>Discovery</span>
          <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" style={{ color: colors.textMuted }} />
          <span className="px-2 py-1 rounded-md" style={{ background: `${colors.violet}22`, color: colors.violet, border: `1px solid ${colors.violet}55` }}>Lab</span>
          <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" style={{ color: colors.textMuted }} />
          <span className="px-2 py-1 rounded-md" style={{ background: `${colors.green}22`, color: colors.green, border: `1px solid ${colors.green}55` }}>Scout</span>
          <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" style={{ color: colors.indigo }} />
          <span className="px-2 py-1 rounded-md inline-flex items-center gap-1" style={{ background: `${colors.indigo}33`, color: colors.indigo, border: `2px solid ${colors.indigo}` }}>
            <ShoppingBag className="w-3 h-3" /> Market
          </span>
        </div>
        <p className="text-xs sm:text-xs text-center mt-2.5 max-w-2xl mx-auto leading-relaxed" style={{ color: colors.textMuted }}>
          Every concept and research project becomes an enriched, scored signal — funneled into Scout, transacted in <span className="font-semibold" style={{ color: colors.indigo }}>Market</span>.
        </p>
      </div>
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
      <span className="text-xs sm:text-xs" style={{ color: textMuted }}>{label}</span>
    </div>
  );
}

function TractionSlide({ colors }: { colors: Colors }) {
  const statsRef = useRef<HTMLDivElement>(null);
  const statsInView = useInView(statsRef, { once: false, amount: 0.3 });
  const stats: { num?: number; suffix?: string; text?: string; label: string; icon: ElementType; color: string }[] = [
    { num: 350, suffix: "+", label: "Tech Transfer Offices", icon: Building2, color: colors.green },
    { num: 40, suffix: "+", label: "Research Data Sources", icon: Database, color: colors.violet },
    { text: "Custom GPT-5", label: "Classifier & Enrichment", icon: Brain, color: colors.green },
    { num: 11, suffix: "-Step", label: "Research Workflow", icon: Workflow, color: colors.amber },
  ];

  const discoveryFeatures = [
    "Submit early-stage concepts before research begins",
    "EDEN credibility scoring for concepts",
    "Browse the public concept community feed",
    "Save concepts to a personal watchlist",
  ];
  const labFeatures = [
    "Everything in EdenDiscovery",
    "11-section structured research project canvas",
    "Literature synthesis across 40+ academic sources",
    "Evidence extraction and citation management",
  ];
  const scoutFeatures = [
    "EDEN queries across 350+ TTOs",
    "Custom push alerts via email",
    "Institution intelligence and TTO profiles",
    "Enriched dossiers with competitive cross-reference",
    "Therapy area, stage, and modality filters",
    "EDEN readiness scoring per asset",
    "Researcher contact information",
    "Saved asset lists and pipeline tracking",
    "PDF and CSV pipeline export",
  ];

  return (
    <Slide index={9} section="Pricing" accent={colors.green} colors={colors}>
      <h2 className="text-xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold mb-1 sm:mb-2" style={{ color: colors.text }}>
        Simple, transparent <span style={{ color: colors.green }}>pricing</span>.
      </h2>
      <p className="text-xs sm:text-sm lg:text-base mb-3 sm:mb-5 max-w-2xl" style={{ color: colors.textMuted }}>
        All plans include a 3-day free trial. No lock-in.
      </p>
      <div ref={statsRef} className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-3 mb-4 sm:mb-6">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} active={statsInView} bgLight={colors.bgLight} border={colors.border} textMuted={colors.textMuted} />
        ))}
      </div>

      {/* Section divider — paid revenue engines */}
      <div className="flex items-center gap-2 mb-2 sm:mb-3">
        <div className="w-1.5 h-4 rounded-sm" style={{ background: colors.green }} />
        <p className="text-xs sm:text-xs font-bold uppercase tracking-widest" style={{ color: colors.green }}>Paid Revenue Engines · For Industry</p>
        <div className="flex-1 h-px" style={{ background: colors.border }} />
      </div>

      {/* Pricing — Scout + Market headline tiers, side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">

        {/* EdenRadar — paid SaaS */}
        <div className="rounded-xl p-4 sm:p-5 flex flex-col" style={{ background: `linear-gradient(135deg, ${colors.greenDim} 0%, ${colors.bgLight} 100%)`, border: `2px solid ${colors.green}88`, boxShadow: `0 0 32px ${colors.green}1a` }}>
          <div className="flex items-start justify-between mb-2.5 sm:mb-3">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center" style={{ background: colors.green }}>
                <Search className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.green }}>Industry SaaS</p>
                  <span className="px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider" style={{ background: colors.green, color: "#fff" }}>Most Popular</span>
                </div>
                <h3 className="text-base sm:text-lg font-bold leading-tight" style={{ color: colors.text }}>EdenRadar</h3>
                <p className="text-xs" style={{ color: colors.text }}>Subscription intelligence for BD teams</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-baseline gap-0.5">
                <span className="text-2xl sm:text-3xl font-extrabold tabular-nums" style={{ color: colors.green }}>$1,999</span>
                <span className="text-xs" style={{ color: colors.text }}>/mo</span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: colors.textMuted }}>starting at</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 mt-1">
            {scoutFeatures.slice(0, 6).map((f) => (
              <div key={f} className="flex items-start gap-1.5 text-xs sm:text-xs" style={{ color: colors.text }}>
                <Check className="w-3 h-3 mt-0.5 shrink-0" style={{ color: colors.green }} />
                {f}
              </div>
            ))}
          </div>
        </div>

        {/* EdenMarket — transactional */}
        <div className="rounded-xl p-4 sm:p-5 flex flex-col" style={{ background: `linear-gradient(135deg, ${colors.indigoDim} 0%, ${colors.bgLight} 100%)`, border: `2px solid ${colors.indigo}88`, boxShadow: `0 0 32px ${colors.indigo}1a` }}>
          <div className="flex items-start justify-between mb-2.5 sm:mb-3">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center" style={{ background: colors.indigo }}>
                <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.indigo }}>Deal Marketplace</p>
                  <span className="px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider" style={{ background: colors.indigo, color: "#fff" }}>Deal-Driven</span>
                </div>
                <h3 className="text-base sm:text-lg font-bold leading-tight" style={{ color: colors.text }}>EdenMarket</h3>
                <p className="text-xs" style={{ color: colors.text }}>Confidential biopharma deal marketplace</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-baseline gap-0.5 justify-end">
                <span className="text-2xl sm:text-3xl font-extrabold tabular-nums" style={{ color: colors.indigo }}>$1,000</span>
                <span className="text-xs" style={{ color: colors.text }}>/mo</span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: colors.textMuted }}>buyer access</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-y-1.5 mt-1 mb-3">
            {[
              "Confidential, NDA-gated deal rooms",
              "Blind listings for licensable assets",
              "Buyer–seller EOI workflow",
              "Closes the loop on Scout discoveries",
            ].map((f) => (
              <div key={f} className="flex items-start gap-1.5 text-xs sm:text-xs" style={{ color: colors.text }}>
                <Check className="w-3 h-3 mt-0.5 shrink-0" style={{ color: colors.indigo }} />
                {f}
              </div>
            ))}
          </div>
          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.indigo}33` }}>
            <div className="px-3 py-1.5" style={{ background: colors.indigoDim }}>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.indigo }}>Success Fees · Paid at close</p>
            </div>
            <div className="grid grid-cols-3 text-center" style={{ borderTop: `1px solid ${colors.border}` }}>
              {[
                { label: "Pre-clinical", fee: "$10K" },
                { label: "Clinical", fee: "$30K" },
                { label: "Late-stage", fee: "$50K" },
              ].map((tier) => (
                <div key={tier.label} className="px-2 py-2" style={{ background: colors.bgLight }}>
                  <p className="text-xs font-extrabold" style={{ color: colors.indigo }}>{tier.fee}</p>
                  <p className="text-[10px]" style={{ color: colors.textMuted }}>{tier.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Supply-side context — Discovery + Lab as free researcher tools that fuel the engines */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1.5 h-4 rounded-sm" style={{ background: colors.amber }} />
        <p className="text-xs sm:text-xs font-bold uppercase tracking-widest" style={{ color: colors.textMuted }}>Supply-Side Context · Free for Researchers</p>
        <div className="flex-1 h-px" style={{ background: colors.border }} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
        <div className="rounded-lg p-2.5 sm:p-3 flex items-center gap-2.5" style={{ background: colors.amberDim, border: `1px solid ${colors.amber}33` }}>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center shrink-0" style={{ background: colors.amber }}>
            <Lightbulb className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <h3 className="text-xs sm:text-sm font-bold leading-tight truncate" style={{ color: colors.text }}>EdenDiscovery</h3>
              <span className="text-xs sm:text-xs font-extrabold" style={{ color: colors.amber }}>Free</span>
            </div>
            <p className="text-xs sm:text-xs leading-snug" style={{ color: colors.textMuted }}>Concept community → feeds Scout</p>
          </div>
        </div>
        <div className="rounded-lg p-2.5 sm:p-3 flex items-center gap-2.5" style={{ background: colors.violetDim, border: `1px solid ${colors.violet}33` }}>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center shrink-0" style={{ background: colors.violet }}>
            <FlaskConical className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <h3 className="text-xs sm:text-sm font-bold leading-tight truncate" style={{ color: colors.text }}>EdenLab</h3>
              <span className="text-xs sm:text-xs font-extrabold" style={{ color: colors.violet }}>Free</span>
            </div>
            <p className="text-xs sm:text-xs leading-snug" style={{ color: colors.textMuted }}>Research workspace → feeds Scout</p>
          </div>
        </div>
        <div className="rounded-lg p-2.5 sm:p-3 flex items-center gap-2.5" style={{ background: colors.indigoDim, border: `1px solid ${colors.indigo}33` }}>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center shrink-0" style={{ background: colors.indigo }}>
            <ShoppingBag className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <h3 className="text-xs sm:text-sm font-bold leading-tight truncate" style={{ color: colors.text }}>EdenMarket</h3>
              <span className="text-xs sm:text-xs font-extrabold" style={{ color: colors.indigo }}>$1K/mo</span>
            </div>
            <p className="text-xs sm:text-xs leading-snug" style={{ color: colors.textMuted }}>Blind marketplace → closes Scout deals</p>
          </div>
        </div>
      </div>
    </Slide>
  );
}

/* ═══════════════════════ SLIDE 7 — EDEN MARKET PORTAL ═══════════════════════ */
function EdenMarketSlide({ colors }: { colors: Colors }) {
  const features = [
    {
      icon: ShoppingBag,
      title: "Confidential Listings",
      desc: "Assets listed with therapeutic area, modality, stage, and IP profile visible upfront. Seller identity stays hidden until NDA is signed.",
    },
    {
      icon: Lock,
      title: "NDA-gated Deal Rooms",
      desc: "Once both parties engage, a secure deal room opens with document vault, encrypted messaging, and a complete audit trail.",
    },
    {
      icon: Users,
      title: "EOI Submission",
      desc: "Buyers submit structured Expressions of Interest directly from the listing. No cold outreach. No missed connections.",
    },
    {
      icon: Check,
      title: "Success-fee Aligned",
      desc: "Listing is free for sellers. EdenMarket earns only when a deal closes — incentives stay perfectly aligned with both sides.",
    },
  ];

  return (
    <Slide index={7} section="EdenMarket" accent={colors.indigo} colors={colors}>
      <PitchDots color={colors.indigo} count={8} />
      <div className="flex items-center gap-3 mb-3 sm:mb-4">
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center" style={{ background: colors.indigoDim }}>
          <ShoppingBag className="w-5 h-5" style={{ color: colors.indigo }} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: colors.indigo }}>The deal layer</p>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold" style={{ color: colors.text }}>
            Eden<span style={{ color: colors.indigo }}>Market</span>
          </h2>
        </div>
      </div>
      <p className="text-sm sm:text-base lg:text-lg mb-4 sm:mb-6 max-w-2xl" style={{ color: colors.textMuted }}>
        The industry's first confidential marketplace for licensable biotech assets. Buyers browse anonymously, sign an NDA inside a secure deal room, and unlock the full asset. EdenMarket only earns when a deal closes.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-5">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-xl p-4 sm:p-5 flex gap-3 sm:gap-4 items-start"
            style={{ background: colors.bgLight, border: `1px solid ${colors.indigo}33` }}
          >
            <div
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: colors.indigoDim }}
            >
              <f.icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: colors.indigo }} />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-semibold mb-1" style={{ color: colors.text }}>{f.title}</p>
              <p className="text-xs" style={{ color: colors.textMuted }}>{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Pricing model */}
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.indigo}44` }}>
        <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: colors.indigoDim }}>
          <ShoppingBag className="w-3.5 h-3.5" style={{ color: colors.indigo }} />
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.indigo }}>Pricing Model · Membership + Success Fee</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4" style={{ borderTop: `1px solid ${colors.indigo}22` }}>
          <div className="px-4 py-3 flex flex-col items-center text-center" style={{ background: colors.bgLight, borderRight: `1px solid ${colors.border}` }}>
            <p className="text-xs font-semibold mb-1" style={{ color: colors.textMuted }}>Buyer Access</p>
            <p className="text-lg sm:text-xl font-extrabold tabular-nums" style={{ color: colors.indigo }}>$1,000</p>
            <p className="text-xs" style={{ color: colors.textMuted }}>/month</p>
          </div>
          {[
            { label: "Pre-clinical", fee: "$10K" },
            { label: "Clinical", fee: "$30K" },
            { label: "Late-stage", fee: "$50K" },
          ].map((tier) => (
            <div key={tier.label} className="px-4 py-3 flex flex-col items-center text-center" style={{ background: colors.bgLight, borderLeft: `1px solid ${colors.border}` }}>
              <p className="text-xs font-semibold mb-1" style={{ color: colors.textMuted }}>{tier.label}</p>
              <p className="text-lg sm:text-xl font-extrabold" style={{ color: colors.indigo }}>{tier.fee}</p>
              <p className="text-xs" style={{ color: colors.textMuted }}>success fee</p>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 text-center" style={{ background: `${colors.indigo}08` }}>
          <p className="text-xs" style={{ color: colors.textMuted }}>Listing is free. Sellers pay nothing unless a deal closes.</p>
        </div>
      </div>
    </Slide>
  );
}

/* ═══════════════════════ SLIDE 10 — CONTACT ═══════════════════════ */
function ContactSlide({ colors }: { colors: Colors }) {
  return (
    <Slide index={10} section="Contact" accent={colors.green} colors={colors} waves>
      <PitchDots color={colors.green} count={8} />
      <div className="flex flex-col items-center text-center px-2 sm:px-8">
        <div className="flex flex-row flex-wrap items-center justify-center gap-x-6 sm:gap-x-8 gap-y-3 mb-6">
          {[
            { label: "Discovery", color: colors.amber,  Icon: Lightbulb },
            { label: "Lab",       color: colors.violet, Icon: FlaskConical },
            { label: "Scout",     color: colors.green,  Icon: Search },
            { label: "Market",    color: colors.indigo, Icon: ShoppingBag },
          ].map(({ label, color, Icon }) => (
            <div key={label} className="flex items-center gap-2.5">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color }}>
                <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <span className="text-sm sm:text-base font-semibold" style={{ color: colors.text }}>
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
            <p className="text-xs mb-1.5" style={{ color: colors.textMuted }}>Co-Founder</p>
            <p className="text-xs font-medium break-all" style={{ color: colors.accent }}>wmohamed@edennx.com</p>
          </div>
          <div className="rounded-xl p-4 sm:p-5" style={{ background: colors.bgLight, border: `1px solid ${colors.border}` }}>
            <p className="text-sm font-bold mb-0.5" style={{ color: colors.text }}>Richard Elles</p>
            <p className="text-xs mb-1.5" style={{ color: colors.textMuted }}>Co-Founder</p>
            <p className="text-xs font-medium break-all" style={{ color: colors.accent }}>relles@edennx.com</p>
          </div>
        </div>
      </div>
    </Slide>
  );
}

/* ═══════════════════════ ROOT ═══════════════════════ */
export default function PitchDeck() {
  useDocumentMeta({
    title: "EdenRadar Pitch Deck — Biotech Asset Discovery Platform",
    description:
      "EdenRadar's investor pitch: a 3-sided biotech ecosystem connecting industry BD, university research, and concept founders through AI-powered asset discovery and a confidential deal marketplace.",
  });
  const [current, setCurrent] = useState(0);
  const [isDark, setIsDark] = useState(() => localStorage.getItem("eden-theme") === "dark");

  useEffect(() => {
    const id = "barlow-font-pitch";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id; link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&family=Barlow+Semi+Condensed:wght@600;700;800&display=swap";
      document.head.appendChild(link);
    }
    const style = document.getElementById("pitch-font-override") ?? (() => {
      const s = document.createElement("style");
      s.id = "pitch-font-override";
      document.head.appendChild(s);
      return s;
    })();
    style.textContent = `.pitch-deck { font-family: 'Barlow', system-ui, sans-serif; } .pitch-deck h1, .pitch-deck h2, .pitch-deck h3 { font-family: 'Barlow Semi Condensed', system-ui, sans-serif; letter-spacing: -0.025em; }`;
  }, []);
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
          <span data-export-control className="no-print">
            <ExportMenu
              label="Save to Cloud"
              getContent={async () => {
                const { captureCurrentPageAsHtml, utf8ToBase64 } = await import("@/components/ExportMenu");
                const html = captureCurrentPageAsHtml();
                return {
                  content: utf8ToBase64(html),
                  filename: `EdenRadar_Pitch_Deck_${new Date().toISOString().slice(0, 10)}.html`,
                  fileType: "html",
                };
              }}
            />
          </span>
        </div>
      )}

      <CoverSlide colors={colors} />
      <WhoWeAreSlide colors={colors} />
      <ProblemSlide colors={colors} />
      <SolutionPortalsSlide colors={colors} />
      <EarlySignalSlide colors={colors} />
      <RadarSlide colors={colors} />
      <EdenMarketSlide colors={colors} />
      <PitchEdenChatSlide colors={colors} />
      <TractionSlide colors={colors} />
      <ContactSlide colors={colors} />
    </div>
  );
}