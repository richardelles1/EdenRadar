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
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const SETTINGS_KEY = "eden-industry-settings";

type LocalSettings = {
  defaultModalities: string[];
  defaultStages: string[];
};

const DEFAULT_LOCAL: LocalSettings = {
  defaultModalities: [],
  defaultStages: [],
};

function getLocalSettings(): LocalSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_LOCAL };
    return { ...DEFAULT_LOCAL, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_LOCAL };
  }
}

function saveLocalSettings(partial: Partial<LocalSettings>) {
  const existing = getLocalSettings();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...existing, ...partial }));
}

const MODALITIES = [
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

const STAGES = ["Discovery", "Preclinical", "Phase 1", "Phase 2", "Phase 3", "Approved"];

type Frequency = "realtime" | "daily" | "weekly";

const FREQUENCY_OPTIONS: { value: Frequency; label: string; description: string }[] = [
  { value: "realtime", label: "Real-time", description: "As new matching assets are indexed" },
  { value: "daily", label: "Daily digest", description: "Summary once per day" },
  { value: "weekly", label: "Weekly digest", description: "Summary once per week" },
];

type ProfileData = {
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
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`chip-${label.toLowerCase().replace(/\s+/g, "-")}`}
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

export default function IndustrySettings() {
  const { user, session, signOut } = useAuth();
  const { toast } = useToast();

  const [localSettings, setLocalSettings] = useState<LocalSettings>(getLocalSettings);

  const [emailDigest, setEmailDigest] = useState<boolean>(
    () => user?.user_metadata?.subscribedToDigest === true
  );
  const [digestLoading, setDigestLoading] = useState(false);

  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [freqLoading, setFreqLoading] = useState(false);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    if (!session?.access_token) return;
    fetch("/api/industry/profile", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then(({ profile: p }) => {
        if (p) {
          setProfile({
            companyName: p.companyName ?? "",
            companyType: p.companyType ?? "",
            onboardingDone: p.onboardingDone ?? false,
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ subscribedToDigest: value }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({ title: "Update failed", description: body.error ?? "Unknown error", variant: "destructive" });
      } else {
        setEmailDigest(body.subscribedToDigest);
        toast({
          title: value ? "Email digest enabled" : "Email digest disabled",
          description: value ? "You will receive digest emails based on your alert frequency." : "You will no longer receive digest emails.",
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
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

  function updateLocalSetting<K extends keyof LocalSettings>(key: K, value: LocalSettings[K]) {
    const updated = { ...localSettings, [key]: value };
    setLocalSettings(updated);
    saveLocalSettings({ [key]: value });
  }

  function toggleLocalArrayItem(key: "defaultModalities" | "defaultStages", item: string) {
    const current = localSettings[key];
    const updated = current.includes(item) ? current.filter((v) => v !== item) : [...current, item];
    updateLocalSetting(key, updated);
  }

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
    await signOut();
    window.location.href = "/login";
  }

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground tracking-tight">Settings</h1>
          <p className="text-xs text-muted-foreground">Notifications, alert defaults, and account management</p>
        </div>
      </div>

      {/* Section 1: Notifications */}
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
                Receive a summary of new TTO assets and activity matching your alerts
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

      {/* Section 2: Profile summary */}
      <div className="rounded-xl border border-card-border bg-card p-5">
        <SectionHeader
          icon={Building2}
          title="Profile"
          description="Your company information and onboarding status"
        />

        {profileLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 rounded bg-muted animate-pulse w-1/2" />
            ))}
          </div>
        ) : profile ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
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
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-0.5">Therapeutic areas</p>
                <p className="text-foreground text-xs" data-testid="text-therapeutic-areas">
                  {profile.therapeuticAreas.length > 0
                    ? profile.therapeuticAreas.slice(0, 3).join(", ") +
                      (profile.therapeuticAreas.length > 3 ? ` +${profile.therapeuticAreas.length - 3}` : "")
                    : <span className="text-muted-foreground italic">None set</span>}
                </p>
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

      {/* Section 3: Alert defaults (stored locally) */}
      <div className="rounded-xl border border-card-border bg-card p-5">
        <SectionHeader
          icon={Layers}
          title="Alert Defaults"
          description="Default filters pre-filled when creating new Scout alerts"
        />

        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Default modalities</p>
            <p className="text-[11px] text-muted-foreground mb-2.5">New alerts will pre-select these modalities</p>
            <div className="flex flex-wrap gap-1.5">
              {MODALITIES.map((m) => (
                <ToggleChip
                  key={m}
                  label={m}
                  active={localSettings.defaultModalities.includes(m)}
                  onClick={() => toggleLocalArrayItem("defaultModalities", m)}
                />
              ))}
            </div>
            {localSettings.defaultModalities.length > 0 && (
              <button
                type="button"
                onClick={() => updateLocalSetting("defaultModalities", [])}
                className="text-[11px] text-muted-foreground hover:text-foreground mt-2 transition-colors"
                data-testid="button-clear-modalities"
              >
                Clear all
              </button>
            )}
          </div>

          <Separator />

          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Default stages</p>
            <p className="text-[11px] text-muted-foreground mb-2.5">New alerts will pre-select these development stages</p>
            <div className="flex flex-wrap gap-1.5">
              {STAGES.map((s) => (
                <ToggleChip
                  key={s}
                  label={s}
                  active={localSettings.defaultStages.includes(s)}
                  onClick={() => toggleLocalArrayItem("defaultStages", s)}
                />
              ))}
            </div>
            {localSettings.defaultStages.length > 0 && (
              <button
                type="button"
                onClick={() => updateLocalSetting("defaultStages", [])}
                className="text-[11px] text-muted-foreground hover:text-foreground mt-2 transition-colors"
                data-testid="button-clear-stages"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Section 4: Account */}
      <div className="rounded-xl border border-card-border bg-card p-5">
        <SectionHeader
          icon={Shield}
          title="Account"
          description="Manage your credentials and session"
        />

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
            <div className="space-y-2.5 max-w-sm">
              <div className="space-y-1">
                <Label htmlFor="new-password" className="text-xs text-muted-foreground">
                  New password
                </Label>
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
                <Label htmlFor="confirm-password" className="text-xs text-muted-foreground">
                  Confirm new password
                </Label>
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
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Updated
                  </>
                ) : pwLoading ? (
                  "Updating..."
                ) : (
                  <>
                    <KeyRound className="w-3.5 h-3.5" /> Update password
                  </>
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
              To delete your EdenScout account and remove all saved data, contact{" "}
              <a
                href="mailto:support@edennx.com"
                className="text-primary hover:underline"
                data-testid="link-account-deletion"
              >
                support@edennx.com
              </a>
              . Account deletion is permanent and cannot be undone.
            </p>
          </div>
        </div>
      </div>

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
  );
}
