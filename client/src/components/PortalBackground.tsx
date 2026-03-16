import { useEffect, useState } from "react";

type Variant = "radar" | "lab" | "discovery";

interface Props {
  variant: Variant;
}

const RADAR_PARTICLES = [
  { x: "8%",  y: "15%", size: 4,   delay: "0s",    dur: "7s" },
  { x: "82%", y: "10%", size: 3,   delay: "1.6s",  dur: "9s" },
  { x: "91%", y: "52%", size: 3.5, delay: "3.1s",  dur: "6s" },
  { x: "60%", y: "80%", size: 3,   delay: "0.8s",  dur: "8s" },
  { x: "18%", y: "70%", size: 4,   delay: "4.2s",  dur: "7s" },
  { x: "44%", y: "6%",  size: 3,   delay: "2.2s",  dur: "10s" },
  { x: "70%", y: "35%", size: 5,   delay: "5.0s",  dur: "8s" },
  { x: "28%", y: "28%", size: 3.5, delay: "1.0s",  dur: "11s" },
  { x: "52%", y: "60%", size: 4,   delay: "3.8s",  dur: "7.5s" },
  { x: "14%", y: "48%", size: 3,   delay: "6.1s",  dur: "9s" },
  { x: "78%", y: "68%", size: 5,   delay: "2.7s",  dur: "6.5s" },
  { x: "36%", y: "88%", size: 3.5, delay: "0.4s",  dur: "8.5s" },
  { x: "62%", y: "22%", size: 4,   delay: "4.8s",  dur: "10s" },
  { x: "88%", y: "82%", size: 3,   delay: "1.9s",  dur: "7s" },
  { x: "22%", y: "92%", size: 3.5, delay: "3.3s",  dur: "9.5s" },
  { x: "48%", y: "42%", size: 7,   delay: "5.5s",  dur: "12s" },
];

const LAB_PARTICLES = [
  { x: "12%", y: "20%", size: 3.5, delay: "0s",    dur: "8s" },
  { x: "76%", y: "12%", size: 3,   delay: "2.0s",  dur: "10s" },
  { x: "90%", y: "45%", size: 4,   delay: "1.2s",  dur: "7s" },
  { x: "58%", y: "75%", size: 3,   delay: "4.0s",  dur: "9s" },
  { x: "24%", y: "60%", size: 4.5, delay: "3.5s",  dur: "6.5s" },
  { x: "42%", y: "8%",  size: 3,   delay: "1.8s",  dur: "11s" },
  { x: "68%", y: "50%", size: 5,   delay: "5.2s",  dur: "8s" },
  { x: "32%", y: "85%", size: 3.5, delay: "0.7s",  dur: "9.5s" },
  { x: "84%", y: "28%", size: 3,   delay: "6.0s",  dur: "7.5s" },
  { x: "16%", y: "38%", size: 6,   delay: "2.5s",  dur: "13s" },
];

const DISCOVERY_PARTICLES = [
  { x: "6%",  y: "20%", size: 5,   delay: "0s",    dur: "8s" },
  { x: "75%", y: "8%",  size: 3.5, delay: "1.5s",  dur: "10s" },
  { x: "88%", y: "48%", size: 4,   delay: "3.0s",  dur: "7s" },
  { x: "55%", y: "78%", size: 3,   delay: "0.5s",  dur: "9s" },
  { x: "20%", y: "65%", size: 5,   delay: "4.5s",  dur: "6.5s" },
  { x: "40%", y: "4%",  size: 3,   delay: "2.0s",  dur: "11s" },
  { x: "92%", y: "25%", size: 2.5, delay: "5.0s",  dur: "8.5s" },
  { x: "30%", y: "88%", size: 3.5, delay: "1.0s",  dur: "7.5s" },
  { x: "65%", y: "55%", size: 3,   delay: "3.8s",  dur: "9.5s" },
  { x: "12%", y: "42%", size: 4,   delay: "2.8s",  dur: "6s" },
  { x: "50%", y: "92%", size: 2.5, delay: "0.3s",  dur: "10.5s" },
  { x: "78%", y: "35%", size: 3.5, delay: "6.0s",  dur: "7s" },
  { x: "34%", y: "18%", size: 4.5, delay: "1.3s",  dur: "8s" },
  { x: "72%", y: "72%", size: 5,   delay: "4.0s",  dur: "11s" },
  { x: "46%", y: "50%", size: 3,   delay: "5.8s",  dur: "9s" },
  { x: "18%", y: "82%", size: 4,   delay: "2.2s",  dur: "7.5s" },
  { x: "60%", y: "15%", size: 3.5, delay: "0.9s",  dur: "8s" },
  { x: "84%", y: "62%", size: 4.5, delay: "3.5s",  dur: "10s" },
  { x: "26%", y: "32%", size: 7,   delay: "6.5s",  dur: "14s" },
  { x: "95%", y: "90%", size: 3,   delay: "1.7s",  dur: "9s" },
];

function DotGrid({ color, opacity = 0.09, spacing = 24 }: { color: string; opacity?: number; spacing?: number }) {
  return (
    <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <pattern id={`dot-grid-${color.replace(/\s/g, "-")}`} x="0" y="0" width={spacing} height={spacing} patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.5" fill={`hsl(${color} / ${opacity})`} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#dot-grid-${color.replace(/\s/g, "-")})`} />
    </svg>
  );
}

function RadarPortalBg({ reduced }: { reduced: boolean }) {
  const color = "142 65% 48%";
  return (
    <>
      <DotGrid color={color} opacity={0.10} />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "33%",
          width: "min(75vw, 720px)",
          height: "min(75vw, 720px)",
          transform: "translate(-50%, -50%)",
          transformOrigin: "center center",
          borderRadius: "50%",
          background: `conic-gradient(from 0deg, transparent 255deg, hsl(${color} / 0.05) 305deg, hsl(${color} / 0.18) 360deg)`,
          animation: reduced ? "none" : "radar-bg-slow 30s linear infinite",
        }}
      />
      {[260, 420, 580, 720].map((r, i) => (
        <div
          key={r}
          className="absolute rounded-full border"
          style={{
            left: "50%",
            top: "33%",
            width: r,
            height: r,
            transform: "translate(-50%, -50%)",
            borderColor: `hsl(${color} / ${0.14 - i * 0.02})`,
          }}
        />
      ))}
      {!reduced && RADAR_PARTICLES.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full portal-bg-anim"
          style={{
            left: p.x,
            top: p.y,
            width: p.size * 2,
            height: p.size * 2,
            background: `hsl(${color})`,
            animation: `portal-particle-drift ${p.dur} ease-in-out ${p.delay} infinite`,
          }}
        />
      ))}
    </>
  );
}

function LabPortalBg({ reduced }: { reduced: boolean }) {
  const color = "262 80% 65%";
  return (
    <>
      <DotGrid color={color} opacity={0.09} />
      {!reduced && [0, 3, 6].map((delay, i) => (
        <div
          key={i}
          className="absolute portal-bg-anim"
          style={{
            left: "60%",
            top: "28%",
            width: 200,
            height: 200,
            marginLeft: -100,
            marginTop: -100,
            borderRadius: "50%",
            border: `1.5px solid hsl(${color} / 0.22)`,
            animation: `lab-ring-expand 9s ease-out ${delay}s infinite`,
          }}
        />
      ))}
      {[280, 460, 640].map((r, i) => (
        <div
          key={r}
          className="absolute rounded-full border"
          style={{
            left: "60%",
            top: "28%",
            width: r,
            height: r,
            transform: "translate(-50%, -50%)",
            borderColor: `hsl(${color} / ${0.14 - i * 0.03})`,
          }}
        />
      ))}
      {!reduced && LAB_PARTICLES.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full portal-bg-anim"
          style={{
            left: p.x,
            top: p.y,
            width: p.size * 2,
            height: p.size * 2,
            background: `hsl(${color})`,
            animation: `portal-particle-drift ${p.dur} ease-in-out ${p.delay} infinite`,
          }}
        />
      ))}
    </>
  );
}

function DiscoveryPortalBg({ reduced }: { reduced: boolean }) {
  const color = "38 95% 55%";
  return (
    <>
      <DotGrid color={color} opacity={0.10} />
      {[360, 540, 700].map((r, i) => (
        <div
          key={r}
          className="absolute rounded-full border"
          style={{
            left: "-5%",
            bottom: "-10%",
            width: r,
            height: r,
            borderColor: `hsl(${color} / ${0.14 - i * 0.03})`,
          }}
        />
      ))}
      {!reduced && DISCOVERY_PARTICLES.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full portal-bg-anim"
          style={{
            left: p.x,
            top: p.y,
            width: p.size * 2,
            height: p.size * 2,
            background: `hsl(${color})`,
            animation: `portal-particle-drift ${p.dur} ease-in-out ${p.delay} infinite`,
          }}
        />
      ))}
    </>
  );
}

export function PortalBackground({ variant }: Props) {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div
      aria-hidden
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 0 }}
    >
      {variant === "radar"     && <RadarPortalBg     reduced={reduced} />}
      {variant === "lab"       && <LabPortalBg       reduced={reduced} />}
      {variant === "discovery" && <DiscoveryPortalBg reduced={reduced} />}
    </div>
  );
}
