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
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

export default function IndustrySettings() {
  const { user, session, signOut, role } = useAuth();
  const { toast } = useToast();

  const isIndustry = role === "industry";

  const [emailDigest, setEmailDigest] = useState(false);
  const [digestLoading, setDigestLoading] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [freqLoading, setFreqLoading] = useState(false);
  const [pwModalOpen, setPwModalOpen] = useState(false);

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
              <p className="text-xs text-muted-foreground mt-0.5">Therapeutic areas, modalities, deal stages — drives alerts and dashboard</p>
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
              <p className="text-sm font-medium text-foreground">Email digest</p>
              <p className="text-xs text-muted-foreground mt-0.5">Receive a summary of new TTO assets matching your interests</p>
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
      <div className="rounded-xl border border-card-border bg-card p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-foreground">EdenScout plan</p>
          <p className="text-xs text-muted-foreground mt-0.5">$799 / month</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary"
            className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs">
            Active
          </Badge>
          <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
            onClick={() => window.open("mailto:support@edennx.com?subject=Billing inquiry", "_blank")}
            data-testid="link-billing">
            Billing <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      <ChangePasswordModal open={pwModalOpen} onClose={() => setPwModalOpen(false)} />
    </div>
  );
}
