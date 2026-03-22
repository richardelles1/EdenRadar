import { useState } from "react";
import { Lightbulb, X } from "lucide-react";

const STORAGE_KEY = "eden-orientation-dismissed";

function getDismissed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function markDismissed(hintId: string) {
  try {
    const current = getDismissed();
    current[hintId] = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {}
}

type AccentColor = "emerald" | "violet" | "amber";

interface OrientationHintProps {
  hintId: string;
  title: string;
  body: string;
  accent?: AccentColor;
}

const ACCENT_CLASSES: Record<AccentColor, { wrap: string; icon: string; title: string }> = {
  emerald: {
    wrap: "border-emerald-500/25 bg-emerald-500/5",
    icon: "text-emerald-500",
    title: "text-emerald-700 dark:text-emerald-400",
  },
  violet: {
    wrap: "border-violet-500/25 bg-violet-500/5",
    icon: "text-violet-500",
    title: "text-violet-700 dark:text-violet-400",
  },
  amber: {
    wrap: "border-amber-500/25 bg-amber-500/5",
    icon: "text-amber-500",
    title: "text-amber-700 dark:text-amber-400",
  },
};

export function OrientationHint({ hintId, title, body, accent = "emerald" }: OrientationHintProps) {
  const [visible, setVisible] = useState(() => !getDismissed()[hintId]);
  const cls = ACCENT_CLASSES[accent];

  if (!visible) return null;

  function dismiss() {
    markDismissed(hintId);
    setVisible(false);
  }

  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs animate-in fade-in duration-300 ${cls.wrap}`}
      data-testid={`orientation-hint-${hintId}`}
    >
      <Lightbulb className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cls.icon}`} />
      <div className="flex-1 min-w-0 leading-relaxed">
        <span className={`font-semibold ${cls.title}`}>{title} </span>
        <span className="text-muted-foreground">{body}</span>
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 mt-0.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        aria-label="Dismiss hint"
        data-testid={`button-dismiss-hint-${hintId}`}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
