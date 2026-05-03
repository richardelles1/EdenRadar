import { useQuery } from "@tanstack/react-query";
import { MarketSidebar } from "@/components/MarketSidebar";
import { AppSwitcher } from "@/components/AppSwitcher";
import { PortalBackground } from "@/components/PortalBackground";
import { useAuth } from "@/hooks/use-auth";
import { useOrg } from "@/hooks/use-org";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useMarketSubscribe } from "@/hooks/use-market-subscribe";

type MarketAccessResponse = {
  access: boolean;
  orgId: number | null;
  fullAccess?: boolean;
  inGrace?: boolean;
  marketAccessExpiresAt?: string | null;
};

function MarketGraceBanner() {
  const { session } = useAuth();
  const { data } = useQuery<MarketAccessResponse>({
    queryKey: ["/api/market/access"],
    enabled: !!session?.access_token,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch("/api/market/access", {
        headers: { Authorization: `Bearer ${session!.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to check access");
      return res.json();
    },
  });
  const { subscribe, isLoading: subLoading } = useMarketSubscribe();

  if (!data?.inGrace || !data.marketAccessExpiresAt) return null;
  const endsAt = new Date(data.marketAccessExpiresAt);
  const dateStr = endsAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const daysLeft = Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <div
      className="px-4 py-2.5 border-b border-amber-500/30 bg-amber-500/10 flex items-center justify-between gap-3 text-sm"
      data-testid="banner-market-grace"
    >
      <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>
          <strong>EdenMarket subscription cancelled.</strong> You have{" "}
          <strong>{daysLeft} day{daysLeft === 1 ? "" : "s"}</strong> of grace access until {dateStr}.
          You can keep browsing listings and continue messaging + document exchange in your existing
          deal rooms. Creating new listings and starting or accepting EOIs is paused until you reactivate.
        </span>
      </div>
      <Button
        size="sm"
        className="text-white shrink-0"
        style={{ background: "hsl(234 80% 58%)" }}
        onClick={() => subscribe()}
        disabled={subLoading}
        data-testid="button-market-grace-reactivate"
      >
        {subLoading ? (<><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Redirecting…</>) : "Reactivate"}
      </Button>
    </div>
  );
}

type MarketLayoutProps = {
  children: React.ReactNode;
};

export function MarketLayout({ children }: MarketLayoutProps) {
  useDocumentMeta({ title: "EdenMarket | EdenRadar", noindex: true });
  const { session, loading } = useAuth();
  const { data: org } = useOrg();
  const orgColor = org?.primaryColor ?? null;

  // Task #752 — /market is now a public front door. Unauthenticated users
  // see the MarketGate paywall (with sign-in / sign-up CTAs) rendered as
  // children; only the chrome is hidden so the page reads as a marketing
  // landing rather than an empty app shell. MarketLogin/MarketSignup are
  // still the dedicated entry points and are linked from the paywall.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background relative">
        <PortalBackground variant="market" />
        <main className="relative z-10">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    );
  }
  return (
    <div
      className="flex min-h-screen bg-background relative"
      style={orgColor ? ({ "--org-accent": orgColor } as React.CSSProperties) : {}}
    >
      <PortalBackground variant="market" />
      <MarketSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-12 flex items-center justify-end px-4 border-b border-border bg-background/60 backdrop-blur-sm shrink-0">
          <AppSwitcher active="market" />
        </div>
        <MarketGraceBanner />
        <main className="flex-1 overflow-y-auto relative z-10">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
