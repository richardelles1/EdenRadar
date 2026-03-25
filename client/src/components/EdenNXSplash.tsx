import { useEffect, useState } from "react";

type Phase = "entering" | "holding" | "exiting" | "done";

const ENTER_MS = 500;
const HOLD_MS = 1100;
const EXIT_MS = 500;

export function EdenNXSplash() {
  const [phase, setPhase] = useState<Phase>(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("edennx-splash-seen")) {
      return "done";
    }
    return "entering";
  });

  useEffect(() => {
    if (phase === "done") return;

    sessionStorage.setItem("edennx-splash-seen", "1");

    const t1 = setTimeout(() => setPhase("holding"), ENTER_MS);
    const t2 = setTimeout(() => setPhase("exiting"), ENTER_MS + HOLD_MS);
    const t3 = setTimeout(() => setPhase("done"), ENTER_MS + HOLD_MS + EXIT_MS);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  if (phase === "done") return null;

  const overlayOpacity = phase === "exiting" ? 0 : 1;
  const logoScale = phase === "entering" ? 0.8 : 1;
  const logoOpacity = phase === "entering" ? 0 : 1;

  return (
    <>
      <style>{`
        @keyframes edennx-glow-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50%       { opacity: 0.85; transform: scale(1.07); }
        }
        @keyframes edennx-ring-spin {
          from { transform: rotate(0deg) scale(1.18); }
          to   { transform: rotate(360deg) scale(1.18); }
        }
      `}</style>

      <div
        data-testid="edennx-splash-overlay"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          background: "hsl(0 0% 4%)",
          opacity: overlayOpacity,
          transition: `opacity ${phase === "exiting" ? EXIT_MS : ENTER_MS}ms ease`,
          pointerEvents: phase === "exiting" ? "none" : "all",
        }}
      >
        {/* Glow ring — only animates during hold phase */}
        <div
          style={{
            position: "absolute",
            width: 200,
            height: 200,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, hsl(142 65% 48% / 0.35) 0%, hsl(142 65% 48% / 0.08) 60%, transparent 80%)",
            animation:
              phase === "holding"
                ? `edennx-glow-pulse ${HOLD_MS * 0.9}ms ease-in-out infinite`
                : "none",
          }}
        />

        {/* Logo */}
        <img
          src="/edennx-logo.png"
          alt="EdenNX"
          style={{
            position: "relative",
            height: 160,
            width: "auto",
            objectFit: "contain",
            transform: `scale(${logoScale})`,
            opacity: logoOpacity,
            transition: `transform ${ENTER_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity ${ENTER_MS}ms ease`,
            filter: "drop-shadow(0 0 24px hsl(142 65% 48% / 0.5))",
          }}
        />

        {/* Wordmark */}
        <p
          style={{
            position: "relative",
            marginTop: 20,
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "hsl(142 65% 48%)",
            opacity: logoOpacity,
            transition: `opacity ${ENTER_MS}ms ease ${ENTER_MS * 0.4}ms`,
          }}
        >
          EdenNX
        </p>
      </div>
    </>
  );
}
