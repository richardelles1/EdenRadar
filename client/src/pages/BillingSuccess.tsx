import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { CheckCircle2, ArrowRight, Loader2, AlertTriangle, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

interface VerifyResult {
  planTier: string;
  planId: string;
  orgName: string | null;
  nextBillingAt: string | null;
  stripeStatus: string;
  stripeTrialEnd: string | null;
}

const PLAN_LABELS: Record<string, string> = {
  individual: "Individual",
  team5: "Team (5 seats)",
  team10: "Team (10 seats)",
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function BillingSuccess() {
  const { session, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");

    if (!sessionId) {
      setErrorMsg("No checkout session found in the URL.");
      setState("error");
      return;
    }

    // Auth is still loading — wait
    if (authLoading) return;

    // Auth done but no session — redirect to login preserving the return path
    if (!session?.access_token) {
      navigate(`/login?redirect=/billing/success${encodeURIComponent("?session_id=" + sessionId)}`);
      return;
    }

    const accessToken: string = session.access_token;

    const verify = async () => {
      try {
        const res = await fetch(`/api/stripe/verify-session?session_id=${encodeURIComponent(sessionId)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = (await res.json()) as { error?: string } & Partial<VerifyResult>;

        if (!res.ok) {
          setErrorMsg(data.error ?? "Payment could not be verified.");
          setState("error");
          return;
        }

        setResult(data as VerifyResult);
        setState("success");
      } catch {
        setErrorMsg("Network error. Please contact support.");
        setState("error");
      }
    };

    verify();
  }, [session?.access_token, authLoading]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">

        {/* Logo */}
        <div className="flex items-center gap-2 justify-center mb-2">
          <div className="w-7 h-7 rounded bg-emerald-600 flex items-center justify-center">
            <Sprout className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg text-foreground">
            Eden<span className="text-emerald-600">Radar</span>
          </span>
        </div>

        {/* Loading */}
        {state === "loading" && (
          <div
            className="rounded-xl border border-border bg-card p-8 text-center space-y-4"
            data-testid="billing-success-loading"
          >
            <Loader2 className="w-10 h-10 text-emerald-600 mx-auto animate-spin" />
            <p className="text-sm text-muted-foreground">Verifying your payment…</p>
          </div>
        )}

        {/* Success */}
        {state === "success" && result && (() => {
          const isTrial = result.stripeStatus === "trialing";
          const trialEndDate = formatDate(result.stripeTrialEnd);
          const billingDate = formatDate(result.nextBillingAt);
          return (
            <div
              className="rounded-xl border bg-card overflow-hidden"
              style={{ borderColor: "hsl(142 52% 36% / 0.4)", boxShadow: "0 0 0 4px hsl(142 52% 36% / 0.06)" }}
              data-testid="billing-success-card"
            >
              <div
                className="px-7 py-6 text-center space-y-2"
                style={{ background: "linear-gradient(135deg, hsl(142 52% 36% / 0.08), hsl(142 52% 36% / 0.03))" }}
              >
                <div className="flex justify-center">
                  <CheckCircle2 className="w-12 h-12" style={{ color: "hsl(142 52% 36%)" }} />
                </div>
                <h1 className="text-2xl font-bold text-foreground" data-testid="text-billing-success-title">
                  {isTrial ? "Your free trial has started!" : "You're subscribed!"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {isTrial
                    ? `Full access for 3 days, free of charge${result.orgName ? ` — ${result.orgName}` : ""}.`
                    : `Welcome to EdenScout${result.orgName ? ` — ${result.orgName}` : ""}.`}
                </p>
              </div>

              <div className="px-7 py-5 space-y-3 border-t border-border">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-semibold text-foreground" data-testid="text-billing-plan">
                    {PLAN_LABELS[result.planId] ?? result.planTier}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "hsl(142 52% 36% / 0.12)", color: "hsl(142 52% 36%)" }}
                    data-testid="text-billing-status"
                  >
                    {isTrial ? "Free trial" : result.stripeStatus === "active" ? "Active" : result.stripeStatus}
                  </span>
                </div>
                {isTrial && trialEndDate ? (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Trial ends</span>
                    <span className="font-medium text-foreground" data-testid="text-billing-trial-end">
                      {trialEndDate}
                    </span>
                  </div>
                ) : billingDate ? (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Next billing</span>
                    <span className="font-medium text-foreground" data-testid="text-billing-next-date">
                      {billingDate}
                    </span>
                  </div>
                ) : null}
                {isTrial && (
                  <p className="text-[11px] text-muted-foreground pt-1 leading-relaxed border-t border-border/60">
                    You won't be charged until {trialEndDate ?? "your trial ends"}. Cancel anytime from your billing settings.
                  </p>
                )}
              </div>

              <div className="px-7 pb-7 pt-2 space-y-2">
                <Link href="/industry/dashboard">
                  <Button
                    className="w-full font-semibold"
                    style={{ background: "hsl(142 52% 36%)", color: "white", border: "none" }}
                    data-testid="button-billing-go-to-app"
                  >
                    {isTrial ? "Explore the platform" : "Go to dashboard"}
                    <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </Link>
                <Link href="/pricing">
                  <Button variant="ghost" className="w-full text-sm text-muted-foreground">
                    View plans
                  </Button>
                </Link>
              </div>
            </div>
          );
        })()}

        {/* Error */}
        {state === "error" && (
          <div
            className="rounded-xl border border-border bg-card p-8 text-center space-y-4"
            data-testid="billing-success-error"
          >
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
            <div className="space-y-1">
              <h2 className="font-semibold text-foreground">Verification issue</h2>
              <p className="text-sm text-muted-foreground">{errorMsg}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              If your payment went through but this page shows an error, please contact{" "}
              <a href="mailto:support@edenradar.com" className="text-emerald-600 underline">
                support@edenradar.com
              </a>
              .
            </p>
            <div className="flex gap-2 justify-center">
              <Link href="/pricing">
                <Button variant="outline" className="text-sm" data-testid="button-billing-error-back">
                  Back to pricing
                </Button>
              </Link>
              <Link href="/industry/dashboard">
                <Button
                  className="text-sm"
                  style={{ background: "hsl(142 52% 36%)", color: "white", border: "none" }}
                  data-testid="button-billing-error-app"
                >
                  Go to dashboard
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
