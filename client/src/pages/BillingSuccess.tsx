import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { CheckCircle2, ArrowRight, Loader2, AlertTriangle, Sprout, UserPlus, Send, Mail, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface VerifyResult {
  planTier: string;
  planId: string;
  orgName: string | null;
  nextBillingAt: string | null;
  stripeStatus: string;
  stripeTrialEnd: string | null;
}

interface OrgMemberSummary {
  userId: string;
  memberName: string | null;
  email: string | null;
  role: string;
  inviteStatus: string | null;
}

interface OrgResponse {
  members: OrgMemberSummary[];
}

const PLAN_LABELS: Record<string, string> = {
  individual: "Individual",
  team5: "Team (5 seats)",
  team10: "Team (10 seats)",
};

const PLAN_MAX_INVITES: Record<string, number> = {
  team5: 4,
  team10: 9,
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function TeamInvitePanel({ accessToken, planId }: { accessToken: string; planId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const maxInvites = PLAN_MAX_INVITES[planId] ?? 0;
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: orgData } = useQuery<OrgResponse>({
    queryKey: ["/api/industry/org"],
    queryFn: () =>
      fetch("/api/industry/org", { headers: { Authorization: `Bearer ${accessToken}` } }).then((r) => r.json()),
    enabled: !!accessToken,
  });

  const invitedMembers = (orgData?.members ?? []).filter((m) => m.role !== "owner");
  const remaining = Math.max(0, maxInvites - invitedMembers.length);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !fullName.trim()) return;
    if (remaining <= 0) {
      toast({ title: "Seat limit reached", description: "All available seats are filled.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/org/members", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ email: email.trim(), fullName: fullName.trim(), role: "member" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Invite failed", description: data.error ?? "Something went wrong.", variant: "destructive" });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/industry/org"] });
      setEmail("");
      setFullName("");
      toast({ title: "Invite sent", description: `${fullName.trim()} will receive an email to set their password.` });
    } catch {
      toast({ title: "Network error", description: "Failed to send invite. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="rounded-xl border bg-card overflow-hidden mt-4"
      style={{ borderColor: "hsl(142 52% 36% / 0.25)" }}
      data-testid="section-team-invite"
    >
      <div
        className="px-6 py-4 flex items-center gap-3"
        style={{ background: "hsl(142 52% 36% / 0.05)", borderBottom: "1px solid hsl(142 52% 36% / 0.15)" }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "hsl(142 52% 36% / 0.12)" }}
        >
          <UserPlus className="w-4 h-4" style={{ color: "hsl(142 52% 36%)" }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Invite your team</p>
          <p className="text-xs text-muted-foreground">
            {remaining > 0
              ? `${remaining} seat${remaining !== 1 ? "s" : ""} remaining — invite colleagues now or later from Settings`
              : "All seats filled. Manage members in Settings."}
          </p>
        </div>
      </div>

      {remaining > 0 && (
        <form onSubmit={handleInvite} className="px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="invite-name" className="text-xs text-muted-foreground">Full name</Label>
              <Input
                id="invite-name"
                placeholder="Jane Smith"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loading}
                data-testid="input-invite-name"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-email" className="text-xs text-muted-foreground">Work email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="jane@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                data-testid="input-invite-email"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={loading || !email.trim() || !fullName.trim()}
            data-testid="button-send-invite"
            className="gap-1.5 w-full"
            style={{ background: "hsl(142 52% 36%)", color: "white", border: "none" }}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {loading ? "Sending…" : "Send invite"}
          </Button>
        </form>
      )}

      {invitedMembers.length > 0 && (
        <div className="px-6 pb-4 space-y-1.5" data-testid="list-sent-invites">
          {invitedMembers.map((m) => (
            <div
              key={m.userId}
              className="flex items-center gap-2 text-xs rounded-lg px-3 py-2"
              style={{ background: "hsl(142 52% 36% / 0.06)", border: "1px solid hsl(142 52% 36% / 0.15)" }}
              data-testid={`invite-row-${m.userId}`}
            >
              <Mail className="w-3 h-3 flex-shrink-0" style={{ color: "hsl(142 52% 36%)" }} />
              <span className="font-medium text-foreground truncate">{m.memberName ?? m.email}</span>
              {m.email && m.memberName && (
                <span className="text-muted-foreground truncate">{m.email}</span>
              )}
              <span className="ml-auto flex items-center gap-1">
                {m.inviteStatus === "pending" ? (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    <Clock className="w-2.5 h-2.5" />
                    Pending
                  </span>
                ) : (
                  <span className="text-[10px] font-medium" style={{ color: "hsl(142 52% 36%)" }}>Active</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="px-6 pb-4">
        <p className="text-[10px] text-muted-foreground">
          Invitees receive an email with a link to set their password and join your workspace. You can manage seats anytime from Settings.
        </p>
      </div>
    </div>
  );
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

    if (authLoading) return;

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

  const isTeamPlan = result?.planId === "team5" || result?.planId === "team10";

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
            <>
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
                    {isTrial ? "Your 3-day free trial has started!" : "You're subscribed!"}
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

              {/* Team invite panel — only for team plans */}
              {isTeamPlan && session?.access_token && (
                <TeamInvitePanel accessToken={session.access_token} planId={result.planId} />
              )}
            </>
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
