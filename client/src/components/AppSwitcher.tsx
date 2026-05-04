import { useLocation } from "wouter";
import { Radar, ShoppingBag, FlaskConical, Lightbulb } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type AppKey = "lab" | "discovery" | "scout" | "market";

type PortalDef = {
  key: AppKey;
  label: string;
  href: string;
  Icon: typeof Radar;
  accent: string;
};

const PORTALS: PortalDef[] = [
  // { key: "lab",       label: "Lab",       href: "/research",           Icon: FlaskConical, accent: "hsl(262 80% 60%)" },
  // { key: "discovery", label: "Discovery", href: "/discovery",          Icon: Lightbulb,    accent: "hsl(38 92% 50%)"  },
  { key: "scout",     label: "Scout",     href: "/industry/dashboard", Icon: Radar,        accent: "hsl(142 52% 36%)" },
  { key: "market",    label: "Market",    href: "/market",             Icon: ShoppingBag,  accent: "hsl(234 80% 58%)" },
];

export function AppSwitcher({ active }: { active: AppKey }) {
  const [, setLocation] = useLocation();
  const { session, role } = useAuth();

  const { data: marketAccess } = useQuery<{ access: boolean }>({
    queryKey: ["/api/market/access"],
    enabled: !!session?.access_token,
    staleTime: 5 * 60 * 1000,
  });

  function canAccess(key: AppKey): { allowed: boolean; reason?: string } {
    switch (key) {
      case "lab":
        if (role === "researcher") return { allowed: true };
        return { allowed: false, reason: "EdenLab is for researcher accounts." };
      case "discovery":
        return { allowed: true };
      case "scout":
        if (role === "industry") return { allowed: true };
        return { allowed: false, reason: "EdenScout is for industry accounts." };
      case "market":
        // Task #752 — any user with a Market entitlement (per-user grant or
        // org subscription) can enter EdenMarket regardless of portal role.
        if (marketAccess?.access) return { allowed: true };
        return { allowed: true, reason: "Subscribe to EdenMarket to unlock listings." };
    }
  }

  function go(p: PortalDef) {
    if (p.key === active) return;
    setLocation(p.href);
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div
        role="tablist"
        aria-label="Switch between EdenRadar portals"
        className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/40 p-0.5 text-xs font-medium"
        data-testid="app-switcher"
      >
        {PORTALS.map((p) => {
          const isActive = p.key === active;
          const { allowed, reason } = canAccess(p.key);
          const button = (
            <button
              key={p.key}
              role="tab"
              aria-selected={isActive}
              disabled={!allowed}
              onClick={() => go(p)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-background shadow-sm"
                  : allowed
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-muted-foreground/40 cursor-not-allowed"
              )}
              style={isActive ? { color: p.accent } : {}}
              data-testid={`app-switcher-${p.key}`}
            >
              <p.Icon className="w-3.5 h-3.5" />
              <span>{p.label}</span>
            </button>
          );
          if (!reason || isActive) return button;
          return (
            <Tooltip key={p.key}>
              <TooltipTrigger asChild>
                <span tabIndex={allowed ? -1 : 0}>{button}</span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">{reason}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
