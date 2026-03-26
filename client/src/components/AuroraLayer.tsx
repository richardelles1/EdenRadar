interface AuroraLayerProps {
  opacity?: number;
  intensity?: number;
  isDark?: boolean;
}

export function AuroraLayer({ opacity = 1, intensity = 1, isDark = true }: AuroraLayerProps) {
  const base = isDark ? 1 : 0.5;
  const emeraldA = 0.30 * intensity * base * opacity;
  const emeraldB = 0.13 * intensity * base * opacity;
  const amberA   = 0.22 * intensity * base * opacity;
  const amberB   = 0.09 * intensity * base * opacity;
  const violetA  = 0.18 * intensity * base * opacity;
  const violetB  = 0.07 * intensity * base * opacity;

  return (
    <>
      <div
        className="aurora-blob-1 absolute pointer-events-none rounded-full"
        style={{
          top: "-18%", right: "-12%",
          width: "clamp(280px, 55vw, 640px)",
          height: "clamp(280px, 55vw, 640px)",
          background: `radial-gradient(circle at center,
            rgba(34,197,94,${emeraldA}) 0%,
            rgba(16,185,129,${emeraldB}) 40%,
            transparent 70%)`,
          filter: "blur(64px)",
        }}
      />
      <div
        className="aurora-blob-2 absolute pointer-events-none rounded-full"
        style={{
          bottom: "-12%", left: "-10%",
          width: "clamp(240px, 50vw, 580px)",
          height: "clamp(240px, 50vw, 580px)",
          background: `radial-gradient(circle at center,
            rgba(245,158,11,${amberA}) 0%,
            rgba(251,191,36,${amberB}) 45%,
            transparent 70%)`,
          filter: "blur(72px)",
        }}
      />
      <div
        className="aurora-blob-3 absolute pointer-events-none rounded-full"
        style={{
          top: "30%", left: "8%",
          width: "clamp(200px, 40vw, 480px)",
          height: "clamp(200px, 40vw, 480px)",
          background: `radial-gradient(circle at center,
            rgba(139,92,246,${violetA}) 0%,
            rgba(167,139,250,${violetB}) 45%,
            transparent 70%)`,
          filter: "blur(68px)",
        }}
      />
    </>
  );
}
