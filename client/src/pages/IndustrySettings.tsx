import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Copy,
  Terminal,
  RefreshCw,
  Bot,
  Plug,
  ArrowRight,
  Save,
} from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import type { StripeBillingEvent } from "@shared/schema";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useOrg, planTierLabel, billingMethodLabel } from "@/hooks/use-org";
import { getIndustryProfile, saveIndustryProfile } from "@/hooks/use-industry";

// ── Profile constants ──────────────────────────────────────────────────────────

const COMPANY_TYPES = [
  "Large Pharma",
  "Mid-size Pharma",
  "Biotech Startup",
  "Venture Capital / Investment",
  "Private Equity",
  "Corporate Venture",
  "Contract Research Organization",
  "Academic / Non-profit",
  "Other",
];

const THERAPEUTIC_AREA_OPTIONS = [
  "Oncology", "Immunology", "Neurology", "Rare Disease", "Cardiology",
  "Infectious Disease", "Metabolic Disease", "Ophthalmology", "Dermatology",
  "Respiratory", "Hematology", "Gastroenterology", "Musculoskeletal",
  "Endocrinology", "Psychiatry",
];

const MODALITY_OPTIONS = [
  "Small Molecule", "Antibody", "ADC", "CAR-T", "Gene Therapy",
  "mRNA Therapy", "Peptide", "Bispecific Antibody", "Cell Therapy",
];

const STAGE_OPTIONS = ["Discovery", "Preclinical", "Phase 1", "Phase 2", "Phase 3", "Approved"];

const profileFormSchema = z.object({
  userName: z.string().optional(),
  companyName: z.string().min(1, "Required"),
  companyType: z.string().optional(),
});
type ProfileFormValues = z.infer<typeof profileFormSchema>;

// ── Notifications constants ────────────────────────────────────────────────────

type MatchAlerts = "off" | "daily" | "frequent";

const MATCH_ALERT_OPTIONS: { value: MatchAlerts; label: string; description: string; badge?: string }[] = [
  { value: "frequent", label: "Frequent", description: "Up to 4× per day — fires within hours of each indexing run when new matches exist", badge: "Fastest" },
  { value: "daily", label: "Daily digest", description: "Once per day, delivered between 6am–10pm ET" },
  { value: "off", label: "Off", description: "No match alert emails" },
];

// ── Tab config ─────────────────────────────────────────────────────────────────

type TabId = "profile" | "notifications" | "team" | "billing" | "developer" | "account";

const ALL_TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }>; teamOnly?: boolean }[] = [
  { id: "profile",       label: "Profile",       icon: Building2 },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "team",          label: "Team",          icon: Users, teamOnly: true },
  { id: "billing",       label: "Billing",       icon: CreditCard },
  { id: "developer",     label: "Developer",     icon: Terminal },
  { id: "account",       label: "Account",       icon: Shield },
];

// ── Utility ────────────────────────────────────────────────────────────────────

function getPasswordStrength(pwd: string): { score: 0 | 1 | 2; label: string; color: string } {
  if (pwd.length < 8) return { score: 0, label: "Too short", color: "#ef4444" };
  let pts = 0;
  if (pwd.length >= 12) pts++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) pts++;
  if (/[0-9!@#$%^&*_\-]/.test(pwd)) pts++;
  if (pts <= 1) return { score: 0, label: "Weak", color: "#ef4444" };
  if (pts === 2) return { score: 1, label: "Fair", color: "#f59e0b" };
  return { score: 2, label: "Strong", color: "#10b981" };
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
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function roleBadgeClass(role: string): string {
  if (role === "owner") return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
  if (role === "admin") return "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30";
  return "bg-muted text-muted-foreground border-border";
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
      {children}
    </p>
  );
}

function ToggleChip({
  label, active, onClick, testId,
  color = "emerald",
}: {
  label: string; active: boolean; onClick: () => void;
  testId?: string; color?: "emerald" | "blue" | "violet";
}) {
  const activeClass = {
    emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
    blue: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40",
    violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/40",
  }[color];

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId ?? `chip-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className={cn(
        "px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-150 select-none flex items-center gap-1",
        active
          ? activeClass
          : "bg-transparent text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
      )}
    >
      {active && <CheckCircle2 className="w-3 h-3 shrink-0" />}
      {label}
    </button>
  );
}

function ChipGroup({
  label, description, options, selected, onToggle,
  color = "emerald", testIdPrefix,
}: {
  label: string; description?: string; options: string[];
  selected: string[]; onToggle: (item: string) => void;
  color?: "emerald" | "blue" | "violet"; testIdPrefix: string;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {options.map((opt) => (
          <ToggleChip
            key={opt}
            label={opt}
            active={selected.includes(opt)}
            onClick={() => onToggle(opt)}
            color={color}
            testId={`chip-${testIdPrefix}-${opt.toLowerCase().replace(/\s+/g, "-")}`}
          />
        ))}
      </div>
    </div>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const strength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);

  function reset() { setNewPassword(""); setConfirmPassword(""); }

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
            {newPassword.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-1 flex-1 rounded-full transition-colors"
                      style={{ background: i <= strength.score ? strength.color : "hsl(var(--border))" }} />
                  ))}
                </div>
                <p className="text-[10px]" style={{ color: strength.color }}>{strength.label}</p>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm-password" className="text-xs text-muted-foreground">Confirm new password</Label>
            <Input id="confirm-password" type="password" placeholder="Repeat new password" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} data-testid="input-confirm-password" />
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }} disabled={pwLoading}>Cancel</Button>
            <Button type="submit" disabled={pwLoading || !newPassword} data-testid="button-save-password" className="gap-1.5">
              {pwLoading ? "Updating..." : <><KeyRound className="w-3.5 h-3.5" /> Update password</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── SimplifiedSettings — for non-industry users ────────────────────────────────

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
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">Account</p>
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold text-foreground mb-1.5">Email address</p>
            <p className="text-sm text-muted-foreground" data-testid="text-account-email">{user?.email ?? "—"}</p>
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
              <LogOut className="w-3.5 h-3.5" /> Sign out
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

// ── Main settings page ─────────────────────────────────────────────────────────

export default function IndustrySettings() {
  const { user, session, signOut, role } = useAuth();
  const { toast } = useToast();
  const { data: org } = useOrg();
  const settingsProfile = getIndustryProfile();
  const queryClient = useQueryClient();

  const isIndustry = role === "industry";
  const isOwner = org?.members?.some((m: any) => m.userId === user?.id && m.role === "owner") ?? false;
  const isAdminOrOwner = org?.members?.some((m: any) => m.userId === user?.id && (m.role === "owner" || m.role === "admin")) ?? false;
  const isTeamPlan = org?.planTier === "team5" || org?.planTier === "team10";
  const seatsUsed = org?.seatCount ?? 0;
  const seatLimit = org?.seatLimit ?? 1;
  const ownerCount = org?.members?.filter((m: any) => m.role === "owner").length ?? 0;
  const canInvite = isAdminOrOwner && isTeamPlan && seatsUsed < seatLimit;

  // ── Tab state ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const visibleTabs = ALL_TABS.filter((t) => !t.teamOnly || isTeamPlan);

  // ── Profile state ────────────────────────────────────────────────────────────
  const profile = getIndustryProfile();
  const [therapeuticAreas, setTherapeuticAreas] = useState<string[]>(profile.therapeuticAreas);
  const [modalities, setModalities] = useState<string[]>(profile.modalities);
  const [dealStages, setDealStages] = useState<string[]>(profile.dealStages);
  const [profileSaved, setProfileSaved] = useState(false);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      userName: profile.userName ?? "",
      companyName: profile.companyName,
      companyType: profile.companyType || "",
    },
  });

  function toggleChip(item: string, setter: (fn: (prev: string[]) => string[]) => void) {
    setter((prev) => prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item]);
    setProfileSaved(false);
  }

  function handleProfileSubmit(values: ProfileFormValues) {
    saveIndustryProfile({
      userName: values.userName ?? "",
      companyName: values.companyName,
      companyType: values.companyType ?? "",
      therapeuticAreas,
      dealStages,
      modalities,
    });
    setProfileSaved(true);
    toast({ title: "Profile saved" });
    setTimeout(() => setProfileSaved(false), 2500);
  }

  // ── Notifications state ──────────────────────────────────────────────────────
  const [matchAlerts, setMatchAlerts] = useState<MatchAlerts>("daily");
  const [weeklyRecapEnabled, setWeeklyRecapEnabled] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [lastAlertSentAt, setLastAlertSentAt] = useState<string | null>(null);

  useEffect(() => {
    if (!isIndustry || !session?.access_token) return;
    fetch("/api/industry/profile", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then(({ profile: p }) => {
        const prefs = p?.notificationPrefs as { matchAlerts?: string; frequency?: string; weeklyRecap?: boolean } | null;
        if (prefs?.matchAlerts !== undefined) {
          if (prefs.matchAlerts === "off" || prefs.matchAlerts === "daily" || prefs.matchAlerts === "frequent") {
            setMatchAlerts(prefs.matchAlerts as MatchAlerts);
          }
        } else if (prefs?.frequency) {
          setMatchAlerts(prefs.frequency === "realtime" ? "frequent" : "daily");
        } else if (p && !p.subscribedToDigest) {
          setMatchAlerts("off");
        }
        setWeeklyRecapEnabled(prefs?.weeklyRecap === true);
        setLastAlertSentAt(p?.lastAlertSentAt ?? null);
      })
      .catch(() => {});
  }, [session?.access_token, isIndustry]);

  async function handleNotifPrefsChange(newMatchAlerts: MatchAlerts, newWeeklyRecap: boolean) {
    if (!session?.access_token) return;
    setMatchAlerts(newMatchAlerts);
    setWeeklyRecapEnabled(newWeeklyRecap);
    setNotifLoading(true);
    try {
      const res = await fetch("/api/users/notification-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ matchAlerts: newMatchAlerts, weeklyRecap: newWeeklyRecap }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Save failed", description: body.error ?? "Unknown error", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setNotifLoading(false);
    }
  }

  // ── Team / org state ─────────────────────────────────────────────────────────
  const [orgName, setOrgName] = useState(org?.name ?? "");
  const [orgBillingEmail, setOrgBillingEmail] = useState(org?.billingEmail ?? "");
  const [orgSaving, setOrgSaving] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [transferToId, setTransferToId] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    if (org) {
      setOrgName(org.name ?? "");
      setOrgBillingEmail(org.billingEmail ?? "");
    }
  }, [org?.id]);

  async function handleSaveOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.access_token || !orgName.trim()) return;
    setOrgSaving(true);
    try {
      const res = await fetch("/api/industry/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ name: orgName.trim(), billingEmail: orgBillingEmail.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Save failed", description: data.error ?? "Something went wrong.", variant: "destructive" });
      } else {
        toast({ title: "Organization updated" });
        queryClient.invalidateQueries({ queryKey: ["/api/industry/org"] });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setOrgSaving(false);
    }
  }

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

  async function handleTransferOwnership(targetId: string) {
    if (!session?.access_token) return;
    setTransferring(true);
    try {
      const res = await fetch(`/api/org/members/${targetId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ role: "owner" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Transfer failed", description: data.error ?? "Something went wrong.", variant: "destructive" });
      } else {
        toast({ title: "Ownership transferred", description: "You are now an admin." });
        queryClient.invalidateQueries({ queryKey: ["/api/industry/org"] });
        setTransferToId(null);
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setTransferring(false);
    }
  }

  // ── Billing state ────────────────────────────────────────────────────────────
  const [portalLoading, setPortalLoading] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);

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
      if (data.url) window.open(data.url, "_blank");
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

  // ── Developer / API key state ────────────────────────────────────────────────
  const [apiKeyNewRaw, setApiKeyNewRaw] = useState<string | null>(null);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [mcpConfigCopied, setMcpConfigCopied] = useState(false);
  const [mcpCodeCopied, setMcpCodeCopied] = useState(false);

  const { data: apiKeyData, refetch: refetchApiKey } = useQuery<{
    key: { id: number; prefix: string; tier: string; status: string; scopes: string[]; dailyLimit: number; callsToday: number; createdAt: string; lastUsedAt: string | null } | null;
  }>({
    queryKey: ["/api/user/api-key"],
    queryFn: async () => {
      const res = await fetch("/api/user/api-key", {
        headers: { Authorization: `Bearer ${session?.access_token}`, "x-user-id": user?.id ?? "" },
      });
      return res.json();
    },
    enabled: !!session?.access_token && !!user?.id,
  });

  const generateKey = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/user/api-key", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}`, "x-user-id": user?.id ?? "", "x-user-email": user?.email ?? "" },
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json() as Promise<{ raw: string; prefix: string; tier: string; scopes: string[]; dailyLimit: number }>;
    },
    onSuccess: (data) => {
      setApiKeyNewRaw(data.raw);
      setApiKeyCopied(false);
      refetchApiKey();
    },
    onError: () => toast({ title: "Could not generate key", variant: "destructive" }),
  });

  const revokeKey = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/user/api-key", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}`, "x-user-id": user?.id ?? "" },
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => { refetchApiKey(); toast({ title: "API key revoked" }); },
    onError: () => toast({ title: "Could not revoke key", variant: "destructive" }),
  });

  function handleCopyKey() {
    if (!apiKeyNewRaw) return;
    navigator.clipboard.writeText(apiKeyNewRaw).then(() => {
      setApiKeyCopied(true);
      setTimeout(() => setApiKeyCopied(false), 2000);
    });
  }

  function buildMcpConfig(rawKey: string | null, prefix: string) {
    const keyValue = rawKey ?? `eden_${prefix}_<your-key>`;
    return JSON.stringify(
      { mcpServers: { "eden-scout": { url: `${window.location.origin}/mcp`, headers: { Authorization: `Bearer ${keyValue}` } } } },
      null, 2,
    );
  }

  function handleCopyMcpConfig(prefix: string) {
    navigator.clipboard.writeText(buildMcpConfig(apiKeyNewRaw, prefix)).then(() => {
      setMcpConfigCopied(true);
      setTimeout(() => setMcpConfigCopied(false), 2000);
    });
  }

  function handleCopyMcpCode(prefix: string) {
    const keyValue = apiKeyNewRaw ?? `eden_${prefix}_<your-key>`;
    const cmd = `claude mcp add eden-scout --transport http ${window.location.origin}/mcp --header "Authorization: Bearer ${keyValue}"`;
    navigator.clipboard.writeText(cmd).then(() => {
      setMcpCodeCopied(true);
      setTimeout(() => setMcpCodeCopied(false), 2000);
    });
  }

  // ── Account state ────────────────────────────────────────────────────────────
  const [pwModalOpen, setPwModalOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    window.location.href = "/login";
  }

  // ── Non-industry fallback ────────────────────────────────────────────────────
  if (role && !isIndustry) return <SimplifiedSettings />;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-lg font-bold text-foreground tracking-tight">Settings</h1>
      </div>

      {/* Tab nav */}
      <div className="border-b border-border -mx-5 px-5 mb-7">
        <nav className="flex overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors duration-150 shrink-0",
                  isActive
                    ? "border-emerald-500 text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
                data-testid={`settings-tab-${tab.id}`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Profile tab ─────────────────────────────────────────────────────── */}
      {activeTab === "profile" && (
        <div className="space-y-5">
          <Form {...profileForm}>
            <form onSubmit={profileForm.handleSubmit(handleProfileSubmit)} className="space-y-5">
              <div className="rounded-xl border border-card-border bg-card p-5 space-y-5">
                <SectionLabel>Company</SectionLabel>
                <FormField
                  control={profileForm.control}
                  name="userName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your name <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Alex" {...field} data-testid="input-user-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Acme Therapeutics" {...field} data-testid="input-company-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="companyType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company type <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-company-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {COMPANY_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="rounded-xl border border-card-border bg-card p-5 space-y-5">
                <div>
                  <SectionLabel>Interests</SectionLabel>
                  <p className="text-xs text-muted-foreground -mt-3 mb-4">
                    These drive your "Explore for You" panel, alert scoring, and email digest content.
                  </p>
                </div>
                <ChipGroup
                  label="Therapeutic focus areas"
                  description="Areas you actively watch for new assets."
                  options={THERAPEUTIC_AREA_OPTIONS}
                  selected={therapeuticAreas}
                  onToggle={(item) => toggleChip(item, setTherapeuticAreas)}
                  color="emerald"
                  testIdPrefix="ta"
                />
                <ChipGroup
                  label="Modalities of interest"
                  description="Drug modality types you actively evaluate."
                  options={MODALITY_OPTIONS}
                  selected={modalities}
                  onToggle={(item) => toggleChip(item, setModalities)}
                  color="blue"
                  testIdPrefix="modality"
                />
                <ChipGroup
                  label="Preferred deal stages"
                  description="Development stages you actively pursue."
                  options={STAGE_OPTIONS}
                  selected={dealStages}
                  onToggle={(item) => toggleChip(item, setDealStages)}
                  color="violet"
                  testIdPrefix="stage"
                />
              </div>

              <Button type="submit" className="w-full gap-2" data-testid="button-save-industry-profile">
                {profileSaved
                  ? <><CheckCircle2 className="w-4 h-4" /> Saved</>
                  : <><Save className="w-4 h-4" /> Save profile</>}
              </Button>
            </form>
          </Form>
        </div>
      )}

      {/* ── Notifications tab ────────────────────────────────────────────────── */}
      {activeTab === "notifications" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-card-border bg-card p-5 space-y-5">
            <div>
              <SectionLabel>Match alerts</SectionLabel>
              <p className="text-xs text-muted-foreground -mt-3 mb-4">Email when new assets match your saved criteria</p>
              <div className="space-y-2">
                {MATCH_ALERT_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button"
                    onClick={() => handleNotifPrefsChange(opt.value, weeklyRecapEnabled)}
                    disabled={notifLoading}
                    data-testid={`match-alert-${opt.value}`}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-all duration-150",
                      matchAlerts === opt.value
                        ? "border-emerald-500/40 bg-emerald-500/5 text-foreground"
                        : "border-border text-muted-foreground hover:border-emerald-500/20 hover:text-foreground"
                    )}>
                    <span className="flex flex-col">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-medium">{opt.label}</span>
                        {opt.badge && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-semibold tracking-wide leading-none">
                            {opt.badge}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">{opt.description}</span>
                    </span>
                    {matchAlerts === opt.value && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                  </button>
                ))}
              </div>
              {lastAlertSentAt && matchAlerts !== "off" && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2" data-testid="text-last-alert-sent">
                  Last sent: {formatRelativeTime(lastAlertSentAt)}
                </p>
              )}
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Weekly recap</p>
                <p className="text-xs text-muted-foreground mt-0.5">Monday morning summary of last week — new assets, team activity, top searches</p>
              </div>
              <Switch
                checked={weeklyRecapEnabled}
                onCheckedChange={(v) => handleNotifPrefsChange(matchAlerts, v)}
                disabled={notifLoading}
                data-testid="toggle-weekly-recap"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Team tab ─────────────────────────────────────────────────────────── */}
      {activeTab === "team" && (
        <div className="space-y-5">
          {/* Org info */}
          {org && (
            <div className="rounded-xl border border-card-border bg-card p-5">
              <SectionLabel>Workspace</SectionLabel>
              <form onSubmit={handleSaveOrg} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="org-name" className="text-xs font-semibold text-foreground">Organization name</Label>
                  {isOwner ? (
                    <Input
                      id="org-name"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="e.g., Acme Therapeutics"
                      data-testid="input-org-name"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">{org.name}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="org-billing-email" className="text-xs font-semibold text-foreground">
                    Billing email <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  {isOwner ? (
                    <Input
                      id="org-billing-email"
                      type="email"
                      value={orgBillingEmail}
                      onChange={(e) => setOrgBillingEmail(e.target.value)}
                      placeholder="billing@company.com"
                      data-testid="input-org-billing-email"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">{org.billingEmail ?? "—"}</p>
                  )}
                </div>
                {isOwner && (
                  <Button type="submit" size="sm" disabled={orgSaving || !orgName.trim()} className="gap-1.5" data-testid="button-save-org">
                    {orgSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    {orgSaving ? "Saving…" : "Save"}
                  </Button>
                )}
              </form>
            </div>
          )}

          {/* Member list */}
          {org && isTeamPlan && (
            <div className="rounded-xl border border-card-border bg-card p-5" data-testid="section-team">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <SectionLabel>Members</SectionLabel>
                  <p className="text-xs text-muted-foreground -mt-3">
                    {seatsUsed} of {seatLimit} seat{seatLimit !== 1 ? "s" : ""} used
                  </p>
                </div>
                {isAdminOrOwner && (
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
                  <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "hsl(38 92% 50% / 0.15)" }}>
                    <span className="text-[9px] font-bold" style={{ color: "hsl(38 92% 50%)" }}>!</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "hsl(38 70% 45%)" }}>
                    <span className="font-semibold">Seat limit exceeded.</span>{" "}
                    Your plan supports {seatLimit} seat{seatLimit !== 1 ? "s" : ""} but you currently have {seatsUsed} active members.
                    Remove members to stay within your plan, or upgrade to add more seats.
                  </p>
                </div>
              )}

              <div className="space-y-1">
                {org.members.map((member: any) => {
                  const initials = (member.memberName ?? member.email ?? "?").trim().slice(0, 2).toUpperCase();
                  const displayName = member.memberName ?? member.email ?? "Unknown";
                  const isSelf = member.userId === user?.id;
                  const isBeingRemoved = removingId === member.userId;
                  const isBeingResent = resendingId === member.userId;
                  const isLastOwner = member.role === "owner" && ownerCount <= 1;
                  return (
                    <div key={member.userId} className="flex items-center gap-3 py-2" data-testid={`team-member-${member.userId}`}>
                      <div className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-semibold text-muted-foreground">{initials}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                        {member.joinedAt && (
                          <p className="text-[10px] text-muted-foreground">Joined {formatJoinDate(String(member.joinedAt))}</p>
                        )}
                      </div>
                      {member.inviteStatus === "pending" && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded text-[10px] font-medium bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 shrink-0"
                          data-testid={`badge-pending-${member.userId}`}>
                          <Clock className="w-2.5 h-2.5" /> Pending
                        </span>
                      )}
                      <Badge variant="outline"
                        className={cn("text-[10px] px-1.5 py-0 h-4 border capitalize", roleBadgeClass(member.role))}
                        data-testid={`badge-role-${member.userId}`}>
                        {member.role}
                      </Badge>
                      {isAdminOrOwner && !isSelf && (
                        <div className="flex items-center gap-1 shrink-0">
                          {member.inviteStatus === "pending" && (
                            <button onClick={() => handleResend(member.userId)}
                              disabled={isBeingResent || isBeingRemoved}
                              title="Resend invite"
                              data-testid={`button-resend-${member.userId}`}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                              {isBeingResent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {isOwner && member.role !== "owner" && (
                            <button onClick={() => setTransferToId(member.userId)}
                              disabled={isBeingRemoved || isBeingResent}
                              title="Transfer ownership"
                              data-testid={`button-transfer-${member.userId}`}
                              className="p-1 rounded text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors">
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isOwner && (
                            <button
                              onClick={() => !isLastOwner && handleRemove(member.userId, displayName)}
                              disabled={isBeingRemoved || isBeingResent || isLastOwner}
                              title={isLastOwner ? "Transfer ownership before removing this member" : "Remove member"}
                              data-testid={`button-remove-${member.userId}`}
                              className={cn("p-1 rounded transition-colors",
                                isLastOwner
                                  ? "text-muted-foreground/30 cursor-not-allowed"
                                  : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              )}>
                              {isBeingRemoved ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Billing tab ──────────────────────────────────────────────────────── */}
      {activeTab === "billing" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-card-border bg-card p-5" data-testid="section-plan">
            <SectionLabel>Plan</SectionLabel>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">EdenRadar</p>
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
                  <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-org-name">
                    {org.planTier === "individual" && settingsProfile.companyName
                      ? settingsProfile.companyName
                      : org.name}
                  </p>
                )}
                {org && org.planTier !== "individual" ? (
                  <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-seat-count">
                    {org.seatCount} of {org.seatLimit} seat{org.seatLimit !== 1 ? "s" : ""} used
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-seat-count">1 seat</p>
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
              {(org?.stripeStatus === "active" || org?.stripeStatus === "trialing" || org?.stripeStatus === "past_due") ? (
                <Button size="sm" variant="outline" onClick={handleManageBilling} disabled={portalLoading}
                  data-testid="button-manage-billing" className="gap-1.5 shrink-0">
                  {portalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                  {portalLoading ? "Opening…" : "Manage billing"}
                </Button>
              ) : (
                <Link href="/pricing">
                  <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors shrink-0"
                    data-testid="link-upgrade-plan">
                    Upgrade <ChevronRight className="w-3 h-3" />
                  </button>
                </Link>
              )}
            </div>

            {isOwner && org?.planTier === "team5" && org?.stripeSubscriptionId && (org.stripeStatus === "active" || org.stripeStatus === "trialing") && (
              <>
                <Separator className="my-4" />
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Need more seats?</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Upgrade to 10 seats — you'll only pay the prorated difference for the rest of your billing cycle.
                    </p>
                  </div>
                  <Button size="sm" onClick={handleUpgradePlan} disabled={upgradeLoading}
                    data-testid="button-upgrade-to-team10" className="gap-1.5 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white">
                    {upgradeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {upgradeLoading ? "Upgrading…" : "Upgrade to 10 seats"}
                  </Button>
                </div>
              </>
            )}
          </div>

          {isIndustry && (
            <div className="rounded-xl border border-card-border bg-card p-5" data-testid="section-billing-history">
              <SectionLabel>Payment history</SectionLabel>
              {billingLoading ? (
                <div className="flex items-center justify-center py-6" data-testid="billing-history-loading">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : billingHistory.filter((e) => e.eventType === "payment_succeeded" || e.eventType === "payment_failed").length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-center" data-testid="billing-history-empty">
                  <Receipt className="w-7 h-7 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No payment history yet</p>
                  <p className="text-xs text-muted-foreground/60">Payments will appear here once your subscription is active.</p>
                </div>
              ) : (
                <div className="divide-y divide-border" data-testid="billing-history-list">
                  {billingHistory
                    .filter((e) => e.eventType === "payment_succeeded" || e.eventType === "payment_failed")
                    .slice(0, 10)
                    .map((event) => {
                      const isPaid = event.eventType === "payment_succeeded";
                      const date = new Date(event.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                      const planLabel = event.newPlanTier ? planTierLabel(event.newPlanTier) : event.oldPlanTier ? planTierLabel(event.oldPlanTier) : null;
                      const amountFormatted = event.amountCents != null
                        ? new Intl.NumberFormat("en-US", { style: "currency", currency: event.currency ?? "usd", maximumFractionDigits: 2 }).format(event.amountCents / 100)
                        : null;
                      return (
                        <div key={event.id} className="flex items-center justify-between py-2.5 gap-3" data-testid={`billing-event-${event.id}`}>
                          <div className="flex items-center gap-2.5 min-w-0">
                            {isPaid
                              ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                              : <XCircle className="w-4 h-4 text-destructive shrink-0" />}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground" data-testid={`billing-event-type-${event.id}`}>
                                {isPaid ? "Payment successful" : "Payment failed"}
                              </p>
                              {planLabel && (
                                <p className="text-xs text-muted-foreground truncate" data-testid={`billing-event-plan-${event.id}`}>{planLabel}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {amountFormatted && (
                              <p className="text-sm font-semibold text-foreground" data-testid={`billing-event-amount-${event.id}`}>{amountFormatted}</p>
                            )}
                            {event.stripeStatus && (
                              <Badge variant="secondary"
                                className={cn("border text-xs px-1.5 py-0 h-4 capitalize",
                                  isPaid
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                    : "bg-destructive/10 text-destructive border-destructive/20"
                                )}
                                data-testid={`billing-event-status-${event.id}`}>
                                {event.stripeStatus}
                              </Badge>
                            )}
                            <p className="text-xs text-muted-foreground" data-testid={`billing-event-date-${event.id}`}>{date}</p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Developer tab ────────────────────────────────────────────────────── */}
      {activeTab === "developer" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-card-border bg-card p-5">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <SectionLabel>API key</SectionLabel>
                <p className="text-xs text-muted-foreground -mt-3">Use your key in the <code className="font-mono text-[11px]">Authorization: Bearer</code> header</p>
              </div>
              <Link href="/developers">
                <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  API reference <ExternalLink className="w-3 h-3" />
                </button>
              </Link>
            </div>

            {apiKeyData?.key ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-foreground">eden_{apiKeyData.key.prefix}_••••••••••••••••</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 capitalize border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                        {apiKeyData.key.tier}
                      </Badge>
                    </div>
                    <Badge variant="outline"
                      className={cn("text-[10px] px-1.5 py-0 h-4 capitalize",
                        apiKeyData.key.status === "active"
                          ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                          : "border-red-500/40 text-red-600"
                      )}>
                      {apiKeyData.key.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{apiKeyData.key.callsToday.toLocaleString()} / {apiKeyData.key.dailyLimit.toLocaleString()} calls today</span>
                    {apiKeyData.key.lastUsedAt && <span>Last used {formatRelativeTime(apiKeyData.key.lastUsedAt)}</span>}
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all",
                        apiKeyData.key.callsToday / apiKeyData.key.dailyLimit >= 0.9 ? "bg-red-500" : "bg-emerald-500")}
                      style={{ width: `${Math.min(100, Math.round(apiKeyData.key.callsToday / apiKeyData.key.dailyLimit * 100))}%` }}
                    />
                  </div>
                </div>

                {apiKeyNewRaw && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2">
                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <TriangleAlert className="w-3.5 h-3.5" />
                      Copy your key — it won't be shown again
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 font-mono text-xs bg-background border border-border rounded px-2.5 py-1.5 text-foreground break-all select-all">
                        {apiKeyNewRaw}
                      </code>
                      <Button size="sm" variant="outline" className="shrink-0 gap-1.5 h-7 text-xs" onClick={handleCopyKey}>
                        {apiKeyCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {apiKeyCopied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                    onClick={() => generateKey.mutate()} disabled={generateKey.isPending}>
                    {generateKey.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Regenerate key
                  </Button>
                  <Button size="sm" variant="ghost"
                    className="gap-1.5 text-xs text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                    onClick={() => revokeKey.mutate()} disabled={revokeKey.isPending}>
                    {revokeKey.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    Revoke
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 space-y-3">
                <div className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center mx-auto">
                  <Terminal className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">No API key</p>
                  <p className="text-xs text-muted-foreground mt-1">Generate a key to access the EdenRadar API and connect AI tools to your data.</p>
                </div>
                <Button size="sm" className="gap-1.5" onClick={() => generateKey.mutate()} disabled={generateKey.isPending}>
                  {generateKey.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                  Generate API key
                </Button>
              </div>
            )}
          </div>

          {/* MCP Integration */}
          {apiKeyData?.key && apiKeyData.key.status === "active" && (
            <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <SectionLabel>AI integration (MCP)</SectionLabel>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-violet-500/40 text-violet-600 dark:text-violet-400 -mt-4">New</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Connect Claude or any MCP-compatible AI directly to your EdenRadar data. Search assets, read enriched details, and manage your pipeline from a conversation.
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Endpoint</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-xs bg-muted border border-border rounded px-2.5 py-1.5 text-foreground truncate">
                    {window.location.origin}/mcp
                  </code>
                  <Button size="sm" variant="outline" className="shrink-0 h-7 w-7 p-0"
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/mcp`)}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Claude Desktop</p>
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <pre className="font-mono text-[11px] text-foreground whitespace-pre-wrap break-all leading-relaxed">
                    {buildMcpConfig(apiKeyNewRaw, apiKeyData.key.prefix)}
                  </pre>
                  <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs w-full"
                    onClick={() => handleCopyMcpConfig(apiKeyData.key!.prefix)}>
                    {mcpConfigCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {mcpConfigCopied ? "Copied" : "Copy config"}
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Claude Code (CLI)</p>
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <code className="block font-mono text-[11px] text-foreground break-all leading-relaxed">
                    claude mcp add eden-scout --transport http {window.location.origin}/mcp --header &quot;Authorization: Bearer {apiKeyNewRaw ?? `eden_${apiKeyData.key.prefix}_<your-key>`}&quot;
                  </code>
                  <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs w-full"
                    onClick={() => handleCopyMcpCode(apiKeyData.key!.prefix)}>
                    {mcpCodeCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {mcpCodeCopied ? "Copied" : "Copy command"}
                  </Button>
                </div>
              </div>

              {!apiKeyNewRaw && (
                <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                  <Plug className="w-3 h-3 mt-0.5 shrink-0" />
                  Replace <code className="font-mono mx-0.5">&lt;your-key&gt;</code> with your full API key, or regenerate your key above to auto-fill it here.
                </p>
              )}
            </div>
          )}

          {/* No key yet: show MCP teaser */}
          {(!apiKeyData?.key || apiKeyData.key.status !== "active") && (
            <div className="rounded-xl border border-card-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-violet-500" />
                <p className="text-sm font-semibold text-foreground">AI Integration (MCP)</p>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-violet-500/40 text-violet-600 dark:text-violet-400">New</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Connect Claude or any MCP-compatible AI directly to your EdenRadar data. Generate an API key above to get your setup config.
              </p>
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Endpoint</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-xs bg-muted border border-border rounded px-2.5 py-1.5 text-foreground truncate">
                    {window.location.origin}/mcp
                  </code>
                  <Button size="sm" variant="outline" className="shrink-0 h-7 w-7 p-0"
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/mcp`)}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Account tab ──────────────────────────────────────────────────────── */}
      {activeTab === "account" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-card-border bg-card p-5">
            <SectionLabel>Account</SectionLabel>
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-foreground mb-1.5">Email address</p>
                <p className="text-sm text-muted-foreground" data-testid="text-account-email">{user?.email ?? "—"}</p>
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
                  <LogOut className="w-3.5 h-3.5" /> Sign out
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
        </div>
      )}

      {/* ── Modals (always mounted) ───────────────────────────────────────────── */}
      <ChangePasswordModal open={pwModalOpen} onClose={() => setPwModalOpen(false)} />

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
              <Input id="invite-name" placeholder="Jane Smith" value={inviteFullName}
                onChange={(e) => setInviteFullName(e.target.value)} disabled={inviteLoading}
                data-testid="input-invite-name" autoFocus />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-email" className="text-xs text-muted-foreground">Work email</Label>
              <Input id="invite-email" type="email" placeholder="jane@company.com" value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)} disabled={inviteLoading}
                data-testid="input-invite-email" />
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)} disabled={inviteLoading}>Cancel</Button>
              <Button type="submit" disabled={inviteLoading || !inviteEmail.trim()}
                data-testid="button-send-invite-modal" className="gap-1.5">
                {inviteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {inviteLoading ? "Sending…" : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {transferToId && (() => {
        const targetMember = org?.members?.find((m: any) => m.userId === transferToId);
        const targetName = targetMember?.memberName ?? targetMember?.email ?? "this member";
        return (
          <Dialog open={!!transferToId} onOpenChange={(v) => { if (!v) setTransferToId(null); }}>
            <DialogContent className="sm:max-w-md" data-testid="modal-transfer-ownership">
              <DialogHeader>
                <DialogTitle>Transfer ownership</DialogTitle>
                <DialogDescription>
                  This will make <strong>{targetName}</strong> the new owner. You will become an admin and lose owner-only permissions.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setTransferToId(null)} disabled={transferring}>Cancel</Button>
                <Button type="button" variant="destructive" disabled={transferring}
                  data-testid="button-confirm-transfer"
                  onClick={() => handleTransferOwnership(transferToId)} className="gap-1.5">
                  {transferring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {transferring ? "Transferring…" : "Yes, transfer ownership"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
