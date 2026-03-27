import { useState } from "react";
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
  TriangleAlert,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const SETTINGS_KEY = "eden-industry-settings";

type IndustrySettings = {
  emailDigest: boolean;
  alertFrequency: "realtime" | "daily" | "weekly";
  defaultModalities: string[];
  defaultStages: string[];
};

const DEFAULT_SETTINGS: IndustrySettings = {
  emailDigest: false,
  alertFrequency: "daily",
  defaultModalities: [],
  defaultStages: [],
};

function getSettings(): IndustrySettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(partial: Partial<IndustrySettings>) {
  const existing = getSettings();
  const updated = { ...existing, ...partial };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
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

const STAGES = [
  "Discovery",
  "Preclinical",
  "Phase 1",
  "Phase 2",
  "Phase 3",
  "Approved",
];

const FREQUENCY_OPTIONS: { value: IndustrySettings["alertFrequency"]; label: string; description: string }[] = [
  { value: "realtime", label: "Real-time", description: "As new matching assets are indexed" },
  { value: "daily", label: "Daily digest", description: "Summary once per day" },
  { value: "weekly", label: "Weekly digest", description: "Summary once per week" },
];

function SectionHeader({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
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
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [settings, setSettingsState] = useState<IndustrySettings>(getSettings);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

  function updateSetting<K extends keyof IndustrySettings>(key: K, value: IndustrySettings[K]) {
    const updated = { ...settings, [key]: value };
    setSettingsState(updated);
    saveSettings({ [key]: value });
  }

  function toggleArrayItem(key: "defaultModalities" | "defaultStages", item: string) {
    const current = settings[key];
    const updated = current.includes(item)
      ? current.filter((v) => v !== item)
      : [...current, item];
    updateSetting(key, updated);
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
  {/* Page header */}
  <div className="flex items-center gap-3">
    <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
      <Settings className="w-5 h-5 text-white" />
    </div>
    <div>
      <h1 className="text-lg font-bold text-foreground tracking-tight">Settings</h1>
      <p className="text-xs text-muted-foreground">Notifications, alert defaults, and account management</p>
    </div>
  </div>

  {/* Notifications section */}
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
          <p className="text-xs text-muted-foreground mt-0.5">Receive a summary of new TTO assets and activity matching your alerts</p>
        </div>
        <Switch
          checked={settings.emailDigest}
          onCheckedChange={(v) => updateSetting("emailDigest", v)}
          data-testid="toggle-email-digest"
        />
      </div>

      {settings.emailDigest && (
        <>
          <Separator />
          <div>
    <p className="text-xs font-semibold text-foreground mb-2">Digest frequency</p>
    <div className="space-y-2">
      {FREQUENCY_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => updateSetting("alertFrequency", opt.value)}
          data-testid={`freq-${opt.value}`}
          className={cn(
            "w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-all duration-150",
            settings.alertFrequency === opt.value
              ? "border-emerald-500/40 bg-emerald-500/5 text-foreground"
              : "border-border text-muted-foreground hover:border-emerald-500/20 hover:text-foreground"
          )}
        >
          <span className="flex flex-col">
            <span className="text-sm font-medium">{opt.label}</span>
            <span className="text-xs text-muted-foreground">{opt.description}</span>
          </span>
          {settings.alertFrequency === opt.value && (
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

  {/* Alert defaults section */}
  <div className="rounded-xl border border-card-border bg-card p-5">
    <SectionHeader
      icon={Layers}
      title="Alert Defaults"
      description="Default filters applied when creating new Scout alerts"
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
      active={settings.defaultModalities.includes(m)}
      onClick={() => toggleArrayItem("defaultModalities", m)}
    />
          ))}
        </div>
        {settings.defaultModalities.length > 0 && (
          <button
    type="button"
    onClick={() => updateSetting("defaultModalities", [])}
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
      active={settings.defaultStages.includes(s)}
      onClick={() => toggleArrayItem("defaultStages", s)}
    />
          ))}
        </div>
        {settings.defaultStages.length > 0 && (
          <button
    type="button"
    onClick={() => updateSetting("defaultStages", [])}
    className="text-[11px] text-muted-foreground hover:text-foreground mt-2 transition-colors"
    data-testid="button-clear-stages"
          >
    Clear all
          </button>
        )}
      </div>
    </div>
  </div>

  {/* Account section */}
  <div className="rounded-xl border border-card-border bg-card p-5">
    <SectionHeader
      icon={Shield}
      title="Account"
      description="Manage your credentials and session"
    />

    <div className="space-y-5">
      {/* Email display */}
      <div>
        <p className="text-xs font-semibold text-foreground mb-1.5">Email address</p>
        <p className="text-sm text-muted-foreground" data-testid="text-account-email">
          {user?.email ?? "—"}
        </p>
      </div>

      <Separator />

      {/* Password change */}
      <div>
        <p className="text-xs font-semibold text-foreground mb-3">Change password</p>
        <div className="space-y-2.5 max-w-sm">
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
    ) : pwLoading ? (
      "Updating..."
    ) : (
      <><KeyRound className="w-3.5 h-3.5" /> Update password</>
    )}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Sign out */}
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

      {/* Danger zone */}
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
      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs">
        Active
      </Badge>
      <button
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
        onClick={() => {
          window.open("mailto:support@edennx.com?subject=Billing inquiry", "_blank");
        }}
        data-testid="link-billing"
      >
        Billing <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  </div>
    </div>
  );
}
