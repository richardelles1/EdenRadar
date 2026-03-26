interface RadarRingsProps {
  isDark?: boolean;
}

export function RadarRings({ isDark = true }: RadarRingsProps) {
  const ringAlpha   = isDark ? 0.20 : 0.12;
  const sweepAlpha1 = isDark ? 0.06 : 0.04;
  const sweepAlpha2 = isDark ? 0.24 : 0.15;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: "clamp(320px, 68vw, 680px)",
          height: "clamp(320px, 68vw, 680px)",
          animation: "radar-bg-slow 18s linear infinite",
          transformOrigin: "center center",
          background: `conic-gradient(from 0deg, transparent 260deg,
            hsl(142 65% 48% / ${sweepAlpha1}) 310deg,
            hsl(142 65% 48% / ${sweepAlpha2}) 360deg)`,
          borderRadius: "50%",
        }}
      />
      {([0.37, 0.56, 0.74, 0.92] as const).map((frac, i) => (
        <div
          key={frac}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{
            width: `clamp(${Math.round(320 * frac)}px, ${Math.round(68 * frac)}vw, ${Math.round(680 * frac)}px)`,
            height: `clamp(${Math.round(320 * frac)}px, ${Math.round(68 * frac)}vw, ${Math.round(680 * frac)}px)`,
            borderColor: `hsl(142 55% 45% / ${Math.max(0, ringAlpha - i * 0.04)})`,
          }}
        />
      ))}
      <div
        className="absolute left-1/2 top-1/2 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: "hsl(142 65% 55%)",
          animation: "pulse-ring 3s ease-out infinite",
          opacity: 0,
        }}
      />
    </div>
  );
}
