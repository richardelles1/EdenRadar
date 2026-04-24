import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Bell,
  Shield,
  LogOut,
  KeyRound,
  CheckCircle2,
  Settings,
  Building2,
  TriangleAlert,
  ExternalLink,
  ChevronRight,
  Users,
  CreditCard,
  Loader2,
  UserPlus,
  Send,
  Trash2,
  RotateCcw,
  Clock,
  Receipt,
  XCircle,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { StripeBillingEvent } from "@shared/schema";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useOrg, planTierLabel, billingMethodLabel } from "@/hooks/use-org";

type Frequency = "realtime" | "daily" | "weekly";

const FREQUENCY_OPTIONS: { value: Frequency; label: string; description: string }[] = [
  { value: "realtime", label: "Real-time", description: "As new matching assets are indexed" },
  { value: "daily", label: "Daily digest", description: "Summary once per day" },
  { value: "weekly", label: "Weekly digest", description: "Summary once per week" },
];

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-emerald-500" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  function reset() {
    setNewPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      toast({ title: "Password too short", description: "Minimum 8 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setPwLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwLoading(false);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password updated", description: "Your password has been changed." });
      reset();
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md" data-testid="modal-change-password">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Enter a new password for your account. Must be at least 8 characters.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1">
            <Label htmlFor="new-password" className="text-xs text-muted-foreground">New password</Label>
            <Input id="new-password" type="password" placeholder="Min. 8 characters" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} data-testid="input-new-password" autoFocus />
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm-password" className="text-xs text-muted-foreground">Confirm new password</Label>
            <Input id="confirm-password" type="password" placeholder="Repeat new password" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} data-testid="input-confirm-password" />
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }} disabled={pwLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={pwLoading || !newPassword} data-testid="button-save-password" className="gap-1.5">
              {pwLoading ? "Updating..." : <><KeyRound className="w-3.5 h-3.5" /> Update password</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SimplifiedSettings() {
  const { user, signOut } = useAuth();
  const [pwModalOpen, setPwModalOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    window.location.href = "/login";
  }

  return (
    <div className="max-w-xl mx-auto px-5 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground tracking-tight">Settings</h1>
          <p className="text-xs text-muted-foreground">Manage your account and session</p>
        </div>
      </div>

      <div className="rounded-xl border border-card-border bg-card p-5">
        <SectionHeader icon={Shield} title="Account" description="Manage your credentials and session" />
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold text-foreground mb-1.5">Email address</p>
            <p className="text-sm text-muted-foreground" data-testid="text-account-email">
              {user?.email ?? "—"}
            </p>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Password</p>
              <p className="text-xs text-muted-foreground mt-0.5">Update your account password</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setPwModalOpen(true)}
              data-testid="button-change-password" className="gap-1.5">
              <KeyRound className="w-3.5 h-3.5" /> Change password
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Sign out</p>
              <p className="text-xs text-muted-foreground mt-0.5">End your current session on this device</p>
            </div>
            <Button size="sm" variant="ghost" onClick={handleSignOut} data-testid="button-sign-out"
              className="text-muted-foreground hover:text-red-500 hover:bg-red-500/10 gap-1.5">
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </Button>
          </div>
          <Separator />
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TriangleAlert className="w-3.5 h-3.5 text-destructive" />
              <p className="text-xs font-semibold text-destructive">Danger zone</p>
            </div>
            <p className="text-xs text-muted-foreground">
              To delete your account, contact{" "}
              <a href="mailto:support@edennx.com" className="text-primary hover:underline"
                data-testid="link-account-deletion">support@edennx.com</a>.
              Account deletion is permanent and cannot be undone.
            </p>
          </div>
        </div>
      </div>

      <ChangePasswordModal open={pwModalOpen} onClose={() => setPwModalOpen(false)} />
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const ts = new Date(dateStr).getTime();
  if (!Number.isFinite(ts)) return "";
  const elapsed = Date.now() - ts;
  const mins = Math.floor(elapsed / 60000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks !== 1 ? "s" : ""} ago`;
}

function formatJoinDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function roleBadgeClass(role: string): string {
  if (role === "owner") return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
  if (role === "admin") return "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30";
  return "bg-muted text-muted-foreground border-border";
}

export default function IndustrySettings() {
  const { user, session, signOut, role } = useAuth();
  const { toast } = useToast();
  const { data: org } = useOrg();
  const queryClient = useQueryClient();

  const isIndustry = role === "industry";

  const [emailDigest, setEmailDigest] = useState(false);
  const [digestLoading, setDigestLoading] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [freqLoading, setFreqLoading] = useState(false);
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [lastAlertSentAt, setLastAlertSentAt] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  // Team invite modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { data: billingHistory = [], isLoading: billingLoading } = useQuery<StripeBillingEvent[]>({
    queryKey: ["/api/billing/history"],
    queryFn: async () => {
      const res = await fetch("/api/billing/history", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch billing history");
      return res.json();
    },
    enabled: !!session?.access_token && isIndustry,
  });

  const isOwner = org?.members?.some((m: any) => m.userId === user?.id && m.role === "owner") ?? false;
  const isTeamPlan = org?.planTier === "team5" || org?.planTier === "team10";
  const seatsUsed = org?.seatCount ?? 0;
  const seatLimit = org?.seatLimit ?? 1;
  const canInvite = isOwner && isTeamPlan && seatsUsed < seatLimit;

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.access_token || !inviteEmail.trim()) return;
    setInviteLoading(true);
    try {
      const res = await fetch("/api/org/members", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ email: inviteEmail.trim(), fullName: inviteFullName.trim(), role: "member" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Invite failed", description: data.error ?? "Something went wrong.", variant: "destructive" });
        return;
      }
      toast({ title: "Invite sent", description: `${inviteFullName.trim()} will receive an email to set their password.` });
      setInviteEmail("");
      setInviteFullName("");
      setInviteOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/industry/org"] });
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleResend(memberId: string) {
    if (!session?.access_token) return;
    setResendingId(memberId);
    try {
      const res = await fetch(`/api/org/members/${memberId}/resend`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Resend failed", description: data.error ?? "Something went wrong.", variant: "destructive" });
      } else {
        toast({ title: "Invite resent", description: `Resent invite to ${data.email}.` });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setResendingId(null);
    }
  }

  async function handleRemove(memberId: string, memberName: string) {
    if (!session?.access_token) return;
    setRemovingId(memberId);
    try {
      const res = await fetch(`/api/org/members/${memberId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Remove failed", description: data.error ?? "Something went wrong.", variant: "destructive" });
      } else {
        toast({ title: "Member removed", description: `${memberName} has been removed from the team.` });
        queryClient.invalidateQueries({ queryKey: ["/api/industry/org"] });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setRemovingId(null);
    }
  }

  useEffect(() => {
    setEmailDigest(user?.user_metadata?.subscribedToDigest === true);
  }, [user?.user_metadata?.subscribedToDigest]);

  useEffect(() => {
    if (!isIndustry || !session?.access_token) return;
    fetch("/api/industry/profile", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then(({ profile: p }) => {
        if (p?.notificationPrefs?.frequency) {
          const freq = p.notificationPrefs.frequency;
          if (freq === "realtime" || freq === "daily" || freq === "weekly") {
            setFrequency(freq as Frequency);
          }
        }
        setLastAlertSentAt(p?.lastAlertSentAt ?? null);
      })
      .catch(() => {});
  }, [session?.access_token, isIndustry]);

  async function handleSignOut() {
    await signOut();
    window.location.href = "/login";
  }

  async function handleDigestToggle(value: boolean) {
    if (!session?.access_token) return;
    setDigestLoading(true);
    try {
      const res = await fetch("/api/users/subscribe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ subscribedToDigest: value }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({ title: "Update failed", description: body.error ?? "Unknown error", variant: "destructive" });
      } else {
        setEmailDigest(body.subscribedToDigest);
        toast({ title: value ? "Email digest enabled" : "Email digest disabled" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setDigestLoading(false);
    }
  }

  async function handleFrequencyChange(value: Frequency) {
    if (!session?.access_token) return;
    setFrequency(value);
    setFreqLoading(true);
    try {
      const res = await fetch("/api/users/notification-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ frequency: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Save failed", description: body.error ?? "Unknown error", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setFreqLoading(false);
    }
  }

  async function handleManageBilling() {
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
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast({ title: "Network error", description: "Failed to connect. Please try again.", variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleUpgradePlan() {
    if (!session?.access_token) return;
    setUpgradeLoading(true);
    try {
      const res = await fetch("/api/stripe/upgrade-plan", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Upgrade failed", description: data.error ?? "Please try again.", variant: "destructive" });
        return;
      }
      toast({ title: "Plan upgraded", description: "You're now on the 10-seat plan. Your team limit has been increased." });
      queryClient.invalidateQueries({ queryKey: ["/api/industry/org"] });
    } catch {
      toast({ title: "Network error", description: "Failed to connect. Please try again.", variant: "destructive" });
    } finally {
      setUpgradeLoading(false);
    }
  }

  if (role && !isIndustry) {
    return <SimplifiedSettings />;
  }

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground tracking-tight">Settings</h1>
          <p className="text-xs text-muted-foreground">Notifications and account management</p>
        </div>
      </div>

      {/* Profile link card */}
      <Link href="/industry/profile">
        <div
          className="rounded-xl border border-primary/15 bg-card p-4 flex items-center justify-between hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer"
          data-testid="link-profile-card"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Company Profile & Interests</p>
              <p className="text-xs text-muted-foreground mt-0.5">Therapeutic areas, modalities, deal stages: drives alerts and dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>
      </Link>

      {/* Notifications */}
      <div className="rounded-xl border border-card-border bg-card p-5">
        <SectionHeader icon={Bell} title="Notifications" description="Control how EdenRadar notifies you about new activity" />
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Email alerts when new assets match your focus areas</p>
              <p className="text-xs text-muted-foreground mt-0.5">Get a digest of newly indexed TTO assets that match your therapeutic areas and modalities</p>
              {lastAlertSentAt && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1" data-testid="text-last-alert-sent">
                  Last sent: {formatRelativeTime(lastAlertSentAt)}
                </p>
              )}
            </div>
            <Switch checked={emailDigest} onCheckedChange={handleDigestToggle}
              disabled={digestLoading} data-testid="toggle-email-digest" />
          </div>
          {emailDigest && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-foreground mb-2">Digest frequency</p>
                <div className="space-y-2">
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <button key={opt.value} type="button"
                      onClick={() => handleFrequencyChange(opt.value)}
                      disabled={freqLoading}
                      data-testid={`freq-${opt.value}`}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-all duration-150",
                        frequency === opt.value
                          ? "border-emerald-500/40 bg-emerald-500/5 text-foreground"
                          : "border-border text-muted-foreground hover:border-emerald-500/20 hover:text-foreground"
                      )}>
                      <span className="flex flex-col">
                        <span className="text-sm font-medium">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.description}</span>
                      </span>
                      {frequency === opt.value && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Account */}
      <div className="rounded-xl border border-card-border bg-card p-5">
        <SectionHeader icon={Shield} title="Account" description="Manage your credentials and session" />
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold text-foreground mb-1.5">Email address</p>
            <p className="text-sm text-muted-foreground" data-testid="text-account-email">
              {user?.email ?? "—"}
            </p>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Password</p>
              <p className="text-xs text-muted-foreground mt-0.5">Update your account password</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setPwModalOpen(true)}
              data-testid="button-change-password" className="gap-1.5">
              <KeyRound className="w-3.5 h-3.5" /> Change password
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Sign out</p>
              <p className="text-xs text-muted-foreground mt-0.5">End your current session on this device</p>
            </div>
            <Button size="sm" variant="ghost" onClick={handleSignOut} data-testid="button-sign-out"
              className="text-muted-foreground hover:text-red-500 hover:bg-red-500/10 gap-1.5">
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </Button>
          </div>
          <Separator />
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TriangleAlert className="w-3.5 h-3.5 text-destructive" />
              <p className="text-xs font-semibold text-destructive">Danger zone</p>
            </div>
            <p className="text-xs text-muted-foreground">
              To delete your account, contact{" "}
              <a href="mailto:support@edennx.com" className="text-primary hover:underline"
                data-testid="link-account-deletion">support@edennx.com</a>.
              Account deletion is permanent and cannot be undone.
            </p>
          </div>
        </div>
      </div>

      {/* Plan */}
      <div className="rounded-xl border border-card-border bg-card p-4" data-testid="section-plan">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <CreditCard className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">EdenScout</p>
              <Badge variant="secondary" className={cn(
                "border text-xs px-1.5 py-0 h-4",
                org?.planTier === "enterprise"
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                  : org?.planTier === "individual" || !org
                    ? "bg-muted text-muted-foreground border-border"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              )}>
                {planTierLabel(org?.planTier ?? "individual")}
              </Badge>
            </div>
            {org && (
              <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-org-name">{org.name}</p>
            )}
            {org && org.planTier !== "individual" ? (
              <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-seat-count">
                {org.seatCount} of {org.seatLimit} seat{org.seatLimit !== 1 ? "s" : ""} used
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-seat-count">
                1 seat
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-billing-method">
              {billingMethodLabel(org?.billingMethod ?? "stripe")}
            </p>
            {org?.stripeCancelAt ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5" data-testid="text-cancel-at">
                Cancels on {new Date(org.stripeCancelAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            ) : org?.stripeCurrentPeriodEnd && org.stripeStatus === "trialing" ? (
              <>
                <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-trial-ends-on">
                  Trial ends {new Date(org.stripeCurrentPeriodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
                <p className="text-xs text-muted-foreground" data-testid="text-trial-charge-note">
                  You'll be charged on {new Date(org.stripeCurrentPeriodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} unless you cancel
                </p>
              </>
            ) : org?.stripeCurrentPeriodEnd && (org.stripeStatus === "active" || org.stripeStatus === "past_due") ? (
              <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-renews-on">
                Renews on {new Date(org.stripeCurrentPeriodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            ) : null}
          </div>
          {org?.stripeCustomerId && (org.stripeStatus === "active" || org.stripeStatus === "trialing" || org.stripeStatus === "past_due") ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleManageBilling}
              disabled={portalLoading}
              data-testid="button-manage-billing"
              className="gap-1.5 shrink-0"
            >
              {portalLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ExternalLink className="w-3.5 h-3.5" />
              )}
              {portalLoading ? "Opening…" : "Manage Billing"}
            </Button>
          ) : (
            <Link href="/pricing">
              <button
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors shrink-0"
                data-testid="link-upgrade-plan"
              >
                Upgrade <ChevronRight className="w-3 h-3" />
              </button>
            </Link>
          )}
        </div>

        {/* Upgrade CTA — visible only to team5 org owners with an active subscription */}
        {isOwner && org?.planTier === "team5" && org?.stripeSubscriptionId && (org.stripeStatus === "active" || org.stripeStatus === "trialing") && (
          <>
            <Separator className="my-3" />
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Need more seats?</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Upgrade to 10 seats — you'll only pay the prorated difference for the rest of your billing cycle.
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleUpgradePlan}
                disabled={upgradeLoading}
                data-testid="button-upgrade-to-team10"
                className="gap-1.5 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {upgradeLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : null}
                {upgradeLoading ? "Upgrading…" : "Upgrade to 10 seats"}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Billing History */}
      {isIndustry && (
        <div className="rounded-xl border border-card-border bg-card p-4" data-testid="section-billing-history">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <Receipt className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Billing History</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Your recent payment activity</p>
            </div>
          </div>
          {billingLoading ? (
            <div className="flex items-center justify-center py-6" data-testid="billing-history-loading">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : billingHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2 text-center" data-testid="billing-history-empty">
              <Receipt className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No payment history yet</p>
              <p className="text-xs text-muted-foreground/70">Payments will appear here once your subscription is active.</p>
            </div>
          ) : (
            <div className="divide-y divide-border" data-testid="billing-history-list">
              {billingHistory
                .filter((e) => e.eventType === "payment_succeeded" || e.eventType === "payment_failed")
                .slice(0, 10)
                .map((event) => {
                  const isPaid = event.eventType === "payment_succeeded";
                  const date = new Date(event.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });
                  const planLabel = event.newPlanTier
                    ? planTierLabel(event.newPlanTier)
                    : event.oldPlanTier
                    ? planTierLabel(event.oldPlanTier)
                    : null;
                  const amountFormatted = event.amountCents != null
                    ? new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: event.currency ?? "usd",
                        maximumFractionDigits: 2,
                      }).format(event.amountCents / 100)
                    : null;
                  return (
                    <div
                      key={event.id}
                      className="flex items-center justify-between py-2.5 gap-3"
                      data-testid={`billing-event-${event.id}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isPaid ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-destructive shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground" data-testid={`billing-event-type-${event.id}`}>
                            {isPaid ? "Payment successful" : "Payment failed"}
                          </p>
                          {planLabel && (
                            <p className="text-xs text-muted-foreground truncate" data-testid={`billing-event-plan-${event.id}`}>
                              {planLabel}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {amountFormatted && (
                          <p className="text-sm font-semibold text-foreground" data-testid={`billing-event-amount-${event.id}`}>
                            {amountFormatted}
                          </p>
                        )}
                        {event.stripeStatus && (
                          <Badge
                            variant="secondary"
                            className={cn(
                              "border text-xs px-1.5 py-0 h-4 capitalize",
                              isPaid
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                : "bg-destructive/10 text-destructive border-destructive/20"
                            )}
                            data-testid={`billing-event-status-${event.id}`}
                          >
                            {event.stripeStatus}
                          </Badge>
                        )}
                        <p className="text-xs text-muted-foreground" data-testid={`billing-event-date-${event.id}`}>
                          {date}
                        </p>
                      </div>
                    </div>
                  );
                })}
              {billingHistory.filter((e) => e.eventType === "payment_succeeded" || e.eventType === "payment_failed").length === 0 && (
                <div className="flex flex-col items-center justify-center py-6 gap-2 text-center" data-testid="billing-history-no-payments">
                  <Receipt className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No payment history yet</p>
                  <p className="text-xs text-muted-foreground/70">Payments will appear here once your subscription is active.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Team */}
      {org && isTeamPlan && (
        <div className="rounded-xl border border-card-border bg-card p-5" data-testid="section-team">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Users className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Your Team</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {seatsUsed} of {seatLimit} seat{seatLimit !== 1 ? "s" : ""} used
                </p>
              </div>
            </div>
            {isOwner && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 shrink-0"
                onClick={() => setInviteOpen(true)}
                disabled={!canInvite}
                data-testid="button-invite-member"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {canInvite ? "Invite member" : "Seats full"}
              </Button>
            )}
          </div>

          {seatsUsed > seatLimit && (
            <div
              className="rounded-lg px-3 py-2.5 flex items-start gap-2.5 mb-4"
              style={{ background: "hsl(38 92% 50% / 0.07)", border: "1px solid hsl(38 92% 50% / 0.25)" }}
              data-testid="banner-seat-overflow"
            >
              <div
                className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: "hsl(38 92% 50% / 0.15)" }}
              >
                <span className="text-[9px] font-bold" style={{ color: "hsl(38 92% 50%)" }}>!</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "hsl(38 70% 45%)" }}>
                <span className="font-semibold">Seat limit exceeded.</span>{" "}
                Your plan supports {seatLimit} seat{seatLimit !== 1 ? "s" : ""} but you currently have {seatsUsed} active members.
                Remove members to stay within your plan, or upgrade to add more seats.
              </p>
            </div>
          )}

          <div className="space-y-2">
            {org.members.map((member: any) => {
              const initials = (member.memberName ?? member.email ?? "?").trim().slice(0, 2).toUpperCase();
              const displayName = member.memberName ?? member.email ?? "Unknown";
              const isSelf = member.userId === user?.id;
              const isBeingRemoved = removingId === member.userId;
              const isBeingResent = resendingId === member.userId;
              return (
                <div
                  key={member.userId}
                  className="flex items-center gap-3 py-1.5"
                  data-testid={`team-member-${member.userId}`}
                >
                  <div className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-semibold text-muted-foreground">{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                    {member.joinedAt && (
                      <p className="text-[10px] text-muted-foreground">
                        Joined {formatJoinDate(String(member.joinedAt))}
                      </p>
                    )}
                  </div>
                  {member.inviteStatus === "pending" && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0 rounded text-[10px] font-medium bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 shrink-0"
                      data-testid={`badge-pending-${member.userId}`}
                    >
                      <Clock className="w-2.5 h-2.5" />
                      Pending
                    </span>
                  )}
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] px-1.5 py-0 h-4 border capitalize", roleBadgeClass(member.role))}
                    data-testid={`badge-role-${member.userId}`}
                  >
                    {member.role}
                  </Badge>
                  {isOwner && !isSelf && (
                    <div className="flex items-center gap-1 shrink-0">
                      {member.inviteStatus === "pending" && (
                        <button
                          onClick={() => handleResend(member.userId)}
                          disabled={isBeingResent || isBeingRemoved}
                          title="Resend invite"
                          data-testid={`button-resend-${member.userId}`}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          {isBeingResent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button
                        onClick={() => handleRemove(member.userId, displayName)}
                        disabled={isBeingRemoved || isBeingResent}
                        title="Remove member"
                        data-testid={`button-remove-${member.userId}`}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        {isBeingRemoved ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invite member modal */}
      <Dialog open={inviteOpen} onOpenChange={(v) => { if (!v) { setInviteEmail(""); setInviteFullName(""); } setInviteOpen(v); }}>
        <DialogContent className="sm:max-w-md" data-testid="modal-invite-member">
          <DialogHeader>
            <DialogTitle>Invite a team member</DialogTitle>
            <DialogDescription>
              They'll receive an email with a link to set their password and join your workspace.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4 pt-1">
            <div className="space-y-1">
              <Label htmlFor="invite-name" className="text-xs text-muted-foreground">Full name (optional)</Label>
              <Input
                id="invite-name"
                placeholder="Jane Smith"
                value={inviteFullName}
                onChange={(e) => setInviteFullName(e.target.value)}
                disabled={inviteLoading}
                data-testid="input-invite-name"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-email" className="text-xs text-muted-foreground">Work email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="jane@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={inviteLoading}
                data-testid="input-invite-email"
              />
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)} disabled={inviteLoading}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={inviteLoading || !inviteEmail.trim()}
                data-testid="button-send-invite-modal"
                className="gap-1.5"
              >
                {inviteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {inviteLoading ? "Sending…" : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ChangePasswordModal open={pwModalOpen} onClose={() => setPwModalOpen(false)} />
    </div>
  );
}
