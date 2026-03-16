import { useEffect, useState } from "react";

type Variant = "radar" | "lab" | "discovery";

interface Props {
  variant: Variant;
}

const RADAR_PARTICLES = [
  { x: "8%",  y: "15%", size: 3,   delay: "0s",   dur: "7s" },
  { x: "82%", y: "10%", size: 2,   delay: "1.6s", dur: "9s" },
  { x: "91%", y: "52%", size: 2.5, delay: "3.1s", dur: "6s" },
  { x: "60%", y: "80%", size: 2,   delay: "0.8s", dur: "8s" },
  { x: "18%", y: "70%", size: 3,   delay: "4.2s", dur: "7s" },
  { x: "44%", y: "6%",  size: 2,   delay: "2.2s", dur: "10s" },
];

const DISCOVERY_PARTICLES = [
  { x: "6%",  y: "20%", size: 4,   delay: "0s",   dur: "8s" },
  { x: "75%", y: "8%",  size: 2.5, delay: "1.5s", dur: "10s" },
  { x: "88%", y: "48%", size: 3,   delay: "3.0s", dur: "7s" },
  { x: "55%", y: "78%", size: 2,   delay: "0.5s", dur: "9s" },
  { x: "20%", y: "65%", size: 3.5, delay: "4.5s", dur: "6.5s" },
  { x: "40%", y: "4%",  size: 2,   delay: "2.0s", dur: "11s" },
  { x: "92%", y: "25%", size: 1.5, delay: "5.0s", dur: "8.5s" },
  { x: "30%", y: "88%", size: 2.5, delay: "1.0s", dur: "7.5s" },
  { x: "65%", y: "55%", size: 2,   delay: "3.8s", dur: "9.5s" },
  { x: "12%", y: "42%", size: 3,   delay: "2.8s", dur: "6s" },
  { x: "50%", y: "92%", size: 1.5, delay: "0.3s", dur: "10.5s" },
  { x: "78%", y: "35%", size: 2.5, delay: "6.0s", dur: "7s" },
];

function RadarPortalBg({ reduced }: { reduced: boolean }) {
  const color = "142 65% 48%";
  return (
    <>
      <div
        className={`absolute portal-bg-anim ${reduced ? "" : ""}`}
        style={{
          left: "50%",
          top: "33%",
          width: "min(70vw, 640px)",
          height: "min(70vw, 640px)",
          transform: "translate(-50%, -50%)",
          transformOrigin: "center center",
          borderRadius: "50%",
          background: `conic-gradient(from 0deg, transparent 255deg, hsl(${color} / 0.04) 305deg, hsl(${color} / 0.14) 360deg)`,
          animation: reduced ? "none" : "radar-bg-slow 30s linear infinite",
        }}
      />
      {[180, 300, 420, 540].map((r, i) => (
        <div
          key={r}
          className="absolute rounded-full border"
          style={{
            left: "50%",
            top: "33%",
            width: r,
            height: r,
            transform: "translate(-50%, -50%)",
            borderColor: `hsl(${color} / ${0.07 - i * 0.01})`,
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
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <pattern id="lab-dot-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill={`hsl(${color} / 0.06)`} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#lab-dot-grid)" />
      </svg>

      {!reduced && [0, 3, 6].map((delay, i) => (
        <div
          key={i}
          className="absolute portal-bg-anim"
          style={{
            left: "60%",
            top: "28%",
            width: 140,
            height: 140,
            marginLeft: -70,
            marginTop: -70,
            borderRadius: "50%",
            border: `1.5px solid hsl(${color} / 0.18)`,
            animation: `lab-ring-expand 9s ease-out ${delay}s infinite`,
          }}
        />
      ))}

      {[200, 340, 480].map((r, i) => (
        <div
          key={r}
          className="absolute rounded-full border"
          style={{
            left: "60%",
            top: "28%",
            width: r,
            height: r,
            transform: "translate(-50%, -50%)",
            borderColor: `hsl(${color} / ${0.06 - i * 0.015})`,
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
      {[260, 400, 520].map((r, i) => (
        <div
          key={r}
          className="absolute rounded-full border"
          style={{
            left: "-5%",
            bottom: "-10%",
            width: r,
            height: r,
            borderColor: `hsl(${color} / ${0.07 - i * 0.018})`,
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
