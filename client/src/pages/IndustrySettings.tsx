import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Bell,
  Shield,
  LogOut,
  KeyRound,
  CheckCircle2,
  ChevronRight,
  Settings,
  Layers,
  Building2,
  TriangleAlert,
  ExternalLink,
  Save,
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const THERAPEUTIC_AREA_OPTIONS = [
  "Oncology",
  "Immunology",
  "Neurology",
  "Rare Disease",
  "Cardiology",
  "Infectious Disease",
  "Metabolic Disease",
  "Ophthalmology",
  "Dermatology",
  "Respiratory",
  "Hematology",
  "Gastroenterology",
  "Musculoskeletal",
  "Endocrinology",
  "Psychiatry",
];

const MODALITY_OPTIONS = [
  "Small Molecule",
  "Antibody",
  "ADC",
  "CAR-T",
  "Gene Therapy",
  "mRNA Therapy",
  "Peptide",
  "Bispecific Antibody",
  "Cell Therapy",
];

const STAGE_OPTIONS = ["Discovery", "Preclinical", "Phase 1", "Phase 2", "Phase 3", "Approved"];

type Frequency = "realtime" | "daily" | "weekly";

const FREQUENCY_OPTIONS: { value: Frequency; label: string; description: string }[] = [
  { value: "realtime", label: "Real-time", description: "As new matching assets are indexed" },
  { value: "daily", label: "Daily digest", description: "Summary once per day" },
  { value: "weekly", label: "Weekly digest", description: "Summary once per week" },
];

type ProfilePrefs = {
  userName: string;
  companyName: string;
  companyType: string;
  onboardingDone: boolean;
  therapeuticAreas: string[];
  modalities: string[];
  dealStages: string[];
};

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

function ToggleChip({
  label,
  active,
  onClick,
  testId,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId ?? `chip-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className={cn(
        "px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-150 select-none",
        active
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40"
          : "bg-transparent text-muted-foreground border-border hover:border-emerald-500/30 hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

function AccountSection({
  user,
  signOut: doSignOut,
  toast,
}: {
  user: { email?: string | null } | null;
  signOut: () => Promise<void>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

  async function handlePasswordChange() {
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
      setPwSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Password updated", description: "Your password has been changed." });
      setTimeout(() => setPwSuccess(false), 3000);
    }
  }

  async function handleSignOut() {
    await doSignOut();
    window.location.href = "/login";
  }

  return (
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

        <div>
          <p className="text-xs font-semibold text-foreground mb-3">Change password</p>
          <div className="space-y-2.5">
            <div className="space-y-1">
              <Label htmlFor="new-password" className="text-xs text-muted-foreground">New password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Min. 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm-password" className="text-xs text-muted-foreground">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                data-testid="input-confirm-password"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePasswordChange}
              disabled={pwLoading || pwSuccess || !newPassword}
              data-testid="button-save-password"
              className="gap-1.5"
            >
              {pwSuccess ? (
                <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Updated</>
              ) : pwLoading ? "Updating..." : (
                <><KeyRound className="w-3.5 h-3.5" /> Update password</>
              )}
            </Button>
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Sign out</p>
            <p className="text-xs text-muted-foreground mt-0.5">End your current session on this device</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSignOut}
            data-testid="button-sign-out"
            className="text-muted-foreground hover:text-red-500 hover:bg-red-500/10 gap-1.5"
          >
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
            To delete your account and remove all saved data, contact{" "}
            <a href="mailto:support@edennx.com" className="text-primary hover:underline" data-testid="link-account-deletion">
              support@edennx.com
            </a>
            . Account deletion is permanent and cannot be undone.
          </p>
        </div>
      </div>
    </div>
  );
}

function SimplifiedSettings() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();

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
      <AccountSection user={user} signOut={signOut} toast={toast} />
    </div>
  );
}

export default function IndustrySettings() {
  const { user, session, signOut, role } = useAuth();
  const { toast } = useToast();

  if (role && role !== "industry") {
    return <SimplifiedSettings />;
  }

  const [emailDigest, setEmailDigest] = useState<boolean>(
    () => user?.user_metadata?.subscribedToDigest === true
  );
  const [digestLoading, setDigestLoading] = useState(false);

  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [freqLoading, setFreqLoading] = useState(false);

  const [profile, setProfile] = useState<ProfilePrefs | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [alertPrefs, setAlertPrefs] = useState<{
    therapeuticAreas: string[];
    modalities: string[];
    dealStages: string[];
  }>({ therapeuticAreas: [], modalities: [], dealStages: [] });
  const [alertPrefsSaving, setAlertPrefsSaving] = useState(false);
  const [alertPrefsSaved, setAlertPrefsSaved] = useState(false);

  useEffect(() => {
    if (!session?.access_token) return;
    fetch("/api/industry/profile", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then(({ profile: p }) => {
        if (p) {
          setProfile({
            userName: p.userName ?? "",
            companyName: p.companyName ?? "",
            companyType: p.companyType ?? "",
            onboardingDone: p.onboardingDone ?? false,
            therapeuticAreas: p.therapeuticAreas ?? [],
            modalities: p.modalities ?? [],
            dealStages: p.dealStages ?? [],
          });
          setAlertPrefs({
            therapeuticAreas: p.therapeuticAreas ?? [],
            modalities: p.modalities ?? [],
            dealStages: p.dealStages ?? [],
          });
          const freq = p.notificationPrefs?.frequency;
          if (freq === "realtime" || freq === "daily" || freq === "weekly") {
            setFrequency(freq);
          }
        }
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [session?.access_token]);

  useEffect(() => {
    setEmailDigest(user?.user_metadata?.subscribedToDigest === true);
  }, [user?.user_metadata?.subscribedToDigest]);

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
        toast({
          title: value ? "Email digest enabled" : "Email digest disabled",
          description: value ? "You will receive digest emails based on your alert frequency." : "Digest emails disabled.",
        });
      }
    } catch {
      toast({ title: "Network error", description: "Could not reach the server.", variant: "destructive" });
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
      toast({ title: "Network error", description: "Could not reach the server.", variant: "destructive" });
    } finally {
      setFreqLoading(false);
    }
  }

  function toggleAlertPref(key: "therapeuticAreas" | "modalities" | "dealStages", item: string) {
    setAlertPrefs((prev) => {
      const current = prev[key];
      const updated = current.includes(item) ? current.filter((v) => v !== item) : [...current, item];
      return { ...prev, [key]: updated };
    });
    setAlertPrefsSaved(false);
  }

  async function saveAlertPrefs() {
    if (!session?.access_token || !profile) return;
    setAlertPrefsSaving(true);
    try {
      const res = await fetch("/api/industry/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          userName: profile.userName,
          companyName: profile.companyName,
          companyType: profile.companyType,
          therapeuticAreas: alertPrefs.therapeuticAreas,
          dealStages: alertPrefs.dealStages,
          modalities: alertPrefs.modalities,
          onboardingDone: profile.onboardingDone,
          notificationPrefs: { frequency },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Save failed", description: body.error ?? "Unknown error", variant: "destructive" });
      } else {
        const { profile: saved } = await res.json();
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                therapeuticAreas: saved.therapeuticAreas ?? alertPrefs.therapeuticAreas,
                modalities: saved.modalities ?? alertPrefs.modalities,
                dealStages: saved.dealStages ?? alertPrefs.dealStages,
              }
            : prev
        );
        setAlertPrefsSaved(true);
        toast({ title: "Alert preferences saved" });
        setTimeout(() => setAlertPrefsSaved(false), 2500);
      }
    } catch {
      toast({ title: "Network error", description: "Could not reach the server.", variant: "destructive" });
    } finally {
      setAlertPrefsSaving(false);
    }
  }

  const alertPrefsChanged =
    JSON.stringify(alertPrefs.therapeuticAreas.slice().sort()) !==
      JSON.stringify((profile?.therapeuticAreas ?? []).slice().sort()) ||
    JSON.stringify(alertPrefs.modalities.slice().sort()) !==
      JSON.stringify((profile?.modalities ?? []).slice().sort()) ||
    JSON.stringify(alertPrefs.dealStages.slice().sort()) !==
      JSON.stringify((profile?.dealStages ?? []).slice().sort());

  return (
    <div className="max-w-5xl mx-auto px-5 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground tracking-tight">Settings</h1>
          <p className="text-xs text-muted-foreground">Notifications, alert preferences, and account management</p>
        </div>
      </div>

      {/* Two-column layout on desktop, single column on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* Notifications */}
          <div className="rounded-xl border border-card-border bg-card p-5">
            <SectionHeader
              icon={Bell}
              title="Notifications"
              description="Control how EdenRadar notifies you about new activity"
            />

            <div className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Email digest</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Receive a summary of new TTO assets matching your alerts
                  </p>
                </div>
                <Switch
                  checked={emailDigest}
                  onCheckedChange={handleDigestToggle}
                  disabled={digestLoading}
                  data-testid="toggle-email-digest"
                />
              </div>

              {emailDigest && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-2">Digest frequency</p>
                    <div className="space-y-2">
                      {FREQUENCY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleFrequencyChange(opt.value)}
                          disabled={freqLoading}
                          data-testid={`freq-${opt.value}`}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-all duration-150",
                            frequency === opt.value
                              ? "border-emerald-500/40 bg-emerald-500/5 text-foreground"
                              : "border-border text-muted-foreground hover:border-emerald-500/20 hover:text-foreground"
                          )}
                        >
                          <span className="flex flex-col">
                            <span className="text-sm font-medium">{opt.label}</span>
                            <span className="text-xs text-muted-foreground">{opt.description}</span>
                          </span>
                          {frequency === opt.value && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Alert Preferences (server-backed) */}
          <div className="rounded-xl border border-card-border bg-card p-5">
            <SectionHeader
              icon={Layers}
              title="Alert Preferences"
              description="Therapeutic focus, modalities, and stages used to score TTO assets"
            />

            {profileLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-4 rounded bg-muted animate-pulse w-3/4" />
                ))}
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1.5">Therapeutic areas</p>
                  <p className="text-[11px] text-muted-foreground mb-2.5">Areas you actively watch for new assets</p>
                  <div className="flex flex-wrap gap-1.5">
                    {THERAPEUTIC_AREA_OPTIONS.map((area) => (
                      <ToggleChip
                        key={area}
                        label={area}
                        active={alertPrefs.therapeuticAreas.includes(area)}
                        onClick={() => toggleAlertPref("therapeuticAreas", area)}
                        testId={`chip-ta-${area.toLowerCase().replace(/\s+/g, "-")}`}
                      />
                    ))}
                  </div>
                  {alertPrefs.therapeuticAreas.filter((a) => !THERAPEUTIC_AREA_OPTIONS.includes(a)).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {alertPrefs.therapeuticAreas
                        .filter((a) => !THERAPEUTIC_AREA_OPTIONS.includes(a))
                        .map((area) => (
                          <ToggleChip
                            key={area}
                            label={area}
                            active
                            onClick={() => toggleAlertPref("therapeuticAreas", area)}
                            testId={`chip-ta-custom-${area.toLowerCase().replace(/\s+/g, "-")}`}
                          />
                        ))}
                    </div>
                  )}
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-foreground mb-1.5">Modalities of interest</p>
                  <p className="text-[11px] text-muted-foreground mb-2.5">Asset types you are actively evaluating</p>
                  <div className="flex flex-wrap gap-1.5">
                    {MODALITY_OPTIONS.map((m) => (
                      <ToggleChip
                        key={m}
                        label={m}
                        active={alertPrefs.modalities.includes(m)}
                        onClick={() => toggleAlertPref("modalities", m)}
                        testId={`chip-modality-${m.toLowerCase().replace(/\s+/g, "-")}`}
                      />
                    ))}
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-foreground mb-1.5">Preferred deal stages</p>
                  <p className="text-[11px] text-muted-foreground mb-2.5">Development stages you actively pursue</p>
                  <div className="flex flex-wrap gap-1.5">
                    {STAGE_OPTIONS.map((s) => (
                      <ToggleChip
                        key={s}
                        label={s}
                        active={alertPrefs.dealStages.includes(s)}
                        onClick={() => toggleAlertPref("dealStages", s)}
                        testId={`chip-stage-${s.toLowerCase().replace(/\s+/g, "-")}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <Button
                    size="sm"
                    onClick={saveAlertPrefs}
                    disabled={alertPrefsSaving || alertPrefsSaved || !alertPrefsChanged}
                    data-testid="button-save-alert-prefs"
                    className="gap-1.5"
                  >
                    {alertPrefsSaved ? (
                      <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</>
                    ) : alertPrefsSaving ? "Saving..." : (
                      <><Save className="w-3.5 h-3.5" /> Save preferences</>
                    )}
                  </Button>
                  <Link
                    href="/industry/profile"
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                    data-testid="link-full-profile-from-alerts"
                  >
                    Full profile <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Profile summary */}
          <div className="rounded-xl border border-card-border bg-card p-5">
            <SectionHeader
              icon={Building2}
              title="Profile"
              description="Your company information and onboarding status"
            />

            {profileLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-4 rounded bg-muted animate-pulse w-1/2" />
                ))}
              </div>
            ) : profile ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-0.5">Company</p>
                    <p className="text-foreground" data-testid="text-company-name">
                      {profile.companyName || <span className="text-muted-foreground italic">Not set</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-0.5">Type</p>
                    <p className="text-foreground" data-testid="text-company-type">
                      {profile.companyType || <span className="text-muted-foreground italic">Not set</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-0.5">Onboarding</p>
                    <span
                      data-testid="text-onboarding-status"
                      className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full",
                        profile.onboardingDone
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      )}
                    >
                      {profile.onboardingDone ? "Complete" : "Incomplete"}
                    </span>
                  </div>
                </div>
                <Separator />
                <Link
                  href="/industry/profile"
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                  data-testid="link-edit-profile"
                >
                  Edit full profile <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Profile not found.</p>
            )}
          </div>

          {/* Account */}
          <AccountSection user={user} signOut={signOut} toast={toast} />

          {/* Plan info */}
          <div className="rounded-xl border border-card-border bg-card p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-foreground">EdenScout plan</p>
              <p className="text-xs text-muted-foreground mt-0.5">$299 / month</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs"
              >
                Active
              </Badge>
              <button
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                onClick={() => window.open("mailto:support@edennx.com?subject=Billing inquiry", "_blank")}
                data-testid="link-billing"
              >
                Billing <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
