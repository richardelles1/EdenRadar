import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { IndustrySidebar } from "@/components/IndustrySidebar";
import { IndustryOnboarding } from "@/components/IndustryOnboarding";
import { useAuth } from "@/hooks/use-auth";
import { getIndustryProfile, useIndustrySyncOnMount } from "@/hooks/use-industry";
import { useOrg } from "@/hooks/use-org";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AlertTriangle, Clock, X, ExternalLink, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

function pastDueDismissKey(orgId: number | undefined) {
  return `eden-past-due-banner-dismissed-${orgId ?? "unknown"}`;
}

function daysUntil(date: string | Date | null | undefined): number {
  if (!date) return 0;
  const ms = new Date(date).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function PastDueBanner({ onFixPayment, loading, onDismiss }: { onFixPayment: () => void; loading: boolean; onDismiss: () => void }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/30 text-amber-700 dark:text-amber-400 text-sm"
      data-testid="banner-past-due"
    >
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1 min-w-0">
        <strong>Payment failed.</strong>{" "}
        Your subscription is past due — please update your payment method to keep access.
      </span>
      <button
        onClick={onFixPayment}
        disabled={loading}
        className="shrink-0 flex items-center gap-1 text-xs font-semibold bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded px-2.5 py-1 transition-colors"
        data-testid="banner-past-due-fix-payment"
      >
        {loading ? "Opening…" : (
          <>
            Fix payment
            <ExternalLink className="w-3 h-3" />
          </>
        )}
      </button>
      <button
        onClick={onDismiss}
        className="shrink-0 p-0.5 rounded hover:bg-amber-500/20 transition-colors"
        aria-label="Dismiss"
        data-testid="banner-past-due-dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function NonOwnerPastDueBanner() {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/30 text-amber-700 dark:text-amber-400 text-sm"
      data-testid="banner-past-due-nonowner"
    >
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1 min-w-0">
        <strong>Your organization's payment has failed.</strong>{" "}
        Please ask your team owner to update the payment method to keep access.
      </span>
    </div>
  );
}

function TrialBanner({ daysLeft, periodEnd }: { daysLeft: number; periodEnd: string | Date | null | undefined }) {
  const label = daysLeft === 0 ? "less than 1 day" : `${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  const chargeDate = periodEnd
    ? new Date(periodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 bg-emerald-600/8 border-b border-emerald-600/20 text-emerald-700 dark:text-emerald-400 text-sm"
      data-testid="banner-trial"
    >
      <Clock className="w-4 h-4 shrink-0" />
      <span className="flex-1 min-w-0">
        <strong>{label} left on your free trial.</strong>
        {chargeDate && <span className="text-muted-foreground"> Your card will be charged on {chargeDate} unless you cancel.</span>}
      </span>
      <Link href="/pricing">
        <a
          className="shrink-0 flex items-center gap-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded px-2.5 py-1 transition-colors"
          data-testid="banner-trial-upgrade"
        >
          Upgrade now
          <ArrowRight className="w-3 h-3" />
        </a>
      </Link>
    </div>
  );
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [, navigate] = useLocation();
  const { session, role, loading } = useAuth();
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const { hydrated } = useIndustrySyncOnMount();
  const { data: org } = useOrg();
  const orgColor = org?.primaryColor ?? null;
  const { toast } = useToast();

  const [pastDueDismissed, setPastDueDismissed] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const isOwner = !!org?.members?.some(
    (m: { userId: string; role: string }) => m.userId === session?.user?.id && m.role === "owner"
  );

  const showPastDue = isOwner && org?.stripeStatus === "past_due" && !pastDueDismissed;
  const showNonOwnerPastDue = !isOwner && org?.stripeStatus === "past_due";
  const showTrial = isOwner && org?.stripeStatus === "trialing" && !showPastDue;
  const trialDaysLeft = showTrial ? daysUntil(org?.stripeCurrentPeriodEnd) : 0;

  useEffect(() => {
    if (org?.id) {
      setPastDueDismissed(sessionStorage.getItem(pastDueDismissKey(org.id)) === "1");
    }
  }, [org?.id]);

  function dismissPastDue() {
    sessionStorage.setItem(pastDueDismissKey(org?.id), "1");
    setPastDueDismissed(true);
  }

  async function handleFixPayment() {
    if (!session?.access_token) return;
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Could not open billing portal", description: data.error ?? "Please try again.", variant: "destructive" });
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      toast({ title: "Network error", description: "Failed to connect. Please try again.", variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate("/login", { replace: true });
    } else if (role === "researcher") {
      navigate("/research", { replace: true });
    } else if (role === "concept") {
      navigate("/discovery", { replace: true });
    } else if (role !== "industry") {
      navigate("/login", { replace: true });
    } else if (hydrated) {
      const profile = getIndustryProfile();
      if (!profile.onboardingDone) {
        setOnboardingOpen(true);
      }
    }
  }, [session, role, loading, hydrated, navigate]);

  if (loading || (!hydrated && session && role === "industry")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || role !== "industry") return null;

  return (
    <div
      className="flex min-h-screen bg-background relative"
      style={orgColor ? { "--org-accent": orgColor } as React.CSSProperties : {}}
    >
      <IndustrySidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {showPastDue && (
          <PastDueBanner
            onFixPayment={handleFixPayment}
            loading={portalLoading}
            onDismiss={dismissPastDue}
          />
        )}
        {showNonOwnerPastDue && <NonOwnerPastDueBanner />}
        {showTrial && (
          <TrialBanner
            daysLeft={trialDaysLeft}
            periodEnd={org?.stripeCurrentPeriodEnd}
          />
        )}
        <main className="flex-1 overflow-y-auto relative z-10">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
      <IndustryOnboarding
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
      />
    </div>
  );
}
