import { useState, useEffect, useCallback } from "react";
import { X, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export const SCOUT_TOUR_STORAGE_KEY = "scout-tour-done-v1";

interface TourStep {
  testId: string | null;
  title: string;
  body: string;
  tooltipSide?: "bottom" | "right";
}

const STEPS: TourStep[] = [
  {
    testId: null,
    title: "Welcome to EdenRadar",
    body: "EdenRadar searches tens of thousands of TTO assets across 350+ institutions — ranked by fit to your deal thesis in real time.",
  },
  {
    testId: "input-search",
    title: "Search anything",
    body: 'Use plain language — indication, target, modality, or mechanism. Try "KRAS inhibitor" or "GLP-1 obesity".',
    tooltipSide: "bottom",
  },
  {
    testId: "button-toggle-buyer-profile",
    title: "Your deal focus",
    body: "Your selections here personalise every score. Adjust therapeutic areas, modalities, or stages at any time to refine results.",
    tooltipSide: "bottom",
  },
  {
    testId: null,
    title: "You're all set",
    body: "Results are scored 1–10 for fit. Hover any score badge to see the breakdown across Query Match, Record Quality, and Availability.",
  },
];

function Spotlight({ rect, padding = 8 }: { rect: DOMRect; padding?: number }) {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
        boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
        borderRadius: 10,
        zIndex: 200,
        pointerEvents: "none",
        transition: "top 0.2s, left 0.2s, width 0.2s, height 0.2s",
      }}
    />
  );
}

interface ScoutTourProps {
  onClose: () => void;
}

export function ScoutTour({ onClose }: ScoutTourProps) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const isLastStep = step === STEPS.length - 1;
  const currentStep = STEPS[step];

  const measureTarget = useCallback((testId: string | null) => {
    if (!testId) { setTargetRect(null); return; }
    const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
      el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    } else {
      setTargetRect(null);
    }
  }, []);

  useEffect(() => {
    measureTarget(currentStep.testId);
    const onResize = () => measureTarget(currentStep.testId);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [step, currentStep.testId, measureTarget]);

  function advance() {
    if (isLastStep) finish();
    else setStep((s) => s + 1);
  }

  function finish() {
    localStorage.setItem(SCOUT_TOUR_STORAGE_KEY, "1");
    onClose();
  }

  const cardStyle = (): React.CSSProperties => {
    if (!targetRect) {
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 202,
        width: 320,
      };
    }
    const gap = 14;
    const cardW = 300;
    const side = currentStep.tooltipSide ?? "bottom";
    if (side === "bottom") {
      const left = Math.max(16, Math.min(targetRect.left, window.innerWidth - cardW - 16));
      return { position: "fixed", top: targetRect.bottom + gap, left, width: cardW, zIndex: 202 };
    }
    return { position: "fixed", top: targetRect.top, left: targetRect.right + gap, width: cardW, zIndex: 202 };
  };

  return (
    <>
      {!targetRect && (
        <div
          className="fixed inset-0"
          style={{ background: "rgba(0,0,0,0.62)", zIndex: 199 }}
          onClick={finish}
          aria-hidden
        />
      )}
      {targetRect && <Spotlight rect={targetRect} />}

      <div
        style={cardStyle()}
        role="dialog"
        aria-modal="true"
        aria-label={currentStep.title}
        className="bg-card border border-border rounded-xl shadow-2xl p-5"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-200 ${
                  i === step
                    ? "w-4 h-1.5 bg-primary"
                    : i < step
                    ? "w-1.5 h-1.5 bg-primary/40"
                    : "w-1.5 h-1.5 bg-border"
                }`}
              />
            ))}
          </div>
          <button
            onClick={finish}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close tour"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <h3 className="text-sm font-semibold text-foreground mb-1.5">{currentStep.title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">{currentStep.body}</p>

        <div className="flex items-center justify-between">
          <button
            onClick={finish}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {step === 0 ? "Skip tour" : "Exit tour"}
          </button>
          <Button size="sm" className="h-7 text-xs gap-1.5" onClick={advance}>
            {isLastStep ? (
              <><Check className="w-3 h-3" /> Done</>
            ) : step === 0 ? (
              <>Show me around <ChevronRight className="w-3 h-3" /></>
            ) : (
              <>Next <ChevronRight className="w-3 h-3" /></>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}

export function useScoutTour() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(SCOUT_TOUR_STORAGE_KEY);
    if (!done) {
      const t = setTimeout(() => setShow(true), 900);
      return () => clearTimeout(t);
    }
  }, []);

  return {
    show,
    retrigger: () => { localStorage.removeItem(SCOUT_TOUR_STORAGE_KEY); setShow(true); },
    close: () => setShow(false),
  };
}
