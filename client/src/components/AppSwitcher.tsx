import { useLocation } from "wouter";
import { Radar, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

type AppKey = "scout" | "market";

const SCOUT_ACCENT = "var(--org-accent, hsl(142 52% 36%))";
const MARKET_ACCENT = "hsl(271 81% 55%)";

export function AppSwitcher({ active }: { active: AppKey }) {
  const [, setLocation] = useLocation();

  function go(target: AppKey) {
    if (target === active) return;
    setLocation(target === "scout" ? "/industry/dashboard" : "/market");
  }

  const scoutActive = active === "scout";
  const marketActive = active === "market";

  return (
    <div
      role="tablist"
      aria-label="Switch between EdenScout and EdenMarket"
      className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/40 p-0.5 text-xs font-medium"
      data-testid="app-switcher"
    >
      <button
        role="tab"
        aria-selected={scoutActive}
        onClick={() => go("scout")}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          scoutActive
            ? "bg-background shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
        style={scoutActive ? { color: SCOUT_ACCENT } : {}}
        data-testid="app-switcher-scout"
      >
        <Radar className="w-3.5 h-3.5" />
        <span>Scout</span>
      </button>
      <button
        role="tab"
        aria-selected={marketActive}
        onClick={() => go("market")}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          marketActive
            ? "bg-background shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
        style={marketActive ? { color: MARKET_ACCENT } : {}}
        data-testid="app-switcher-market"
      >
        <ShoppingBag className="w-3.5 h-3.5" />
        <span>Market</span>
      </button>
    </div>
  );
}
