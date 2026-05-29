import { useEffect, useRef } from "react";

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

export function RadarBackground() {
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

      ctx.strokeStyle = "#065f46";
      ctx.lineWidth = 1;
      for (let i = 1; i <= ringCount; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, ringSpacing * i, 0, TWO_PI);
        ctx.globalAlpha = ringAlpha;
        ctx.stroke();
      }

      ctx.globalAlpha = isDark ? 0.045 : 0.022;
      ctx.strokeStyle = "#065f46";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, cy); ctx.lineTo(W, cy);
      ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
      ctx.stroke();

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

      ctx.globalAlpha = isDark ? 0.60 : 0.45;
      ctx.strokeStyle = "#c47d1a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
      ctx.stroke();

      for (let i = 0; i < BLIPS.length; i++) {
        const ba = ((BLIPS[i].a % TWO_PI) + TWO_PI) % TWO_PI;
        const normCur = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
        const normNext = (((angle + delta) % TWO_PI) + TWO_PI) % TWO_PI;
        const crosses = normNext >= normCur
          ? ba >= normCur && ba < normNext
          : ba >= normCur || ba < normNext;
        if (crosses) blipTimes[i] = now;
      }
      angle += delta;

      for (let i = 0; i < BLIPS.length; i++) {
        const age = now - blipTimes[i];
        if (age >= BLIP_LIFETIME) continue;
        let alpha: number;
        const fadeIn = 300, fadeOut = 700;
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

        const grd = ctx.createRadialGradient(bx, by, 0, bx, by, 11);
        grd.addColorStop(0, "rgba(52,211,153,0.55)");
        grd.addColorStop(1, "rgba(52,211,153,0)");
        ctx.globalAlpha = alpha * (isDark ? 0.75 : 0.45);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(bx, by, 11, 0, TWO_PI);
        ctx.fill();

        ctx.globalAlpha = alpha * (isDark ? 0.95 : 0.65);
        ctx.fillStyle = "#34d399";
        ctx.beginPath();
        ctx.arc(bx, by, 2.5, 0, TWO_PI);
        ctx.fill();

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
