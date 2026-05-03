import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { CheckCircle2, Circle } from "lucide-react";

function PasswordRule({ met, label }: { met: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-1.5 text-xs transition-colors ${met ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
      {met
        ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        : <Circle className="w-3.5 h-3.5 shrink-0" />}
      {label}
    </li>
  );
}

export default function SetPassword() {
  useDocumentMeta({ title: "Set Your Password | EdenRadar", noindex: true });
  const { session, loading, updatePassword } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  const rules = {
    length: password.length >= 8,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    digit: /[0-9]/.test(password),
  };
  const passwordValid = Object.values(rules).every(Boolean);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setConfirmError("");

    if (!passwordValid) {
      toast({ title: "Password doesn't meet the requirements", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      setConfirmError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    const { error } = await updatePassword(password);
    if (error) {
      setSubmitting(false);
      toast({ title: "Could not set password", description: error, variant: "destructive" });
      return;
    }

    // Eagerly flip invite_status → active so ScoutGate passes immediately.
    // Non-fatal: /api/industry/org also auto-activates on first dashboard load
    // as a safety net if this call fails transiently.
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const activateRes = await fetch("/api/industry/activate-invite", { method: "POST", headers });
      if (!activateRes.ok) {
        console.warn("[set-password] activate-invite responded", activateRes.status, "– fallback activation will run on /api/industry/org");
      }
    } catch (activateErr) {
      console.warn("[set-password] activate-invite network error:", activateErr, "– fallback activation will run on /api/industry/org");
    }

    setSubmitting(false);
    toast({ title: "Password set!", description: "Welcome to EdenRadar." });
    navigate("/industry/dashboard", { replace: true });
  }

  if (!loading && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <Card className="w-full max-w-md" data-testid="card-set-password-expired">
          <CardHeader>
            <CardTitle>Link expired</CardTitle>
            <CardDescription>
              Your invitation link is no longer valid — links expire after 24 hours.
              Ask your team admin to resend the invite.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <Card className="w-full max-w-md" data-testid="card-set-password">
        <CardHeader>
          <CardTitle>Welcome to EdenRadar</CardTitle>
          <CardDescription>
            Choose a password to activate your account and get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
                required
                data-testid="input-new-password"
              />
              <ul className="space-y-1 pt-1">
                <PasswordRule met={rules.length} label="At least 8 characters" />
                <PasswordRule met={rules.lower} label="One lowercase letter" />
                <PasswordRule met={rules.upper} label="One uppercase letter" />
                <PasswordRule met={rules.digit} label="One number" />
              </ul>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setConfirmError(""); }}
                autoComplete="new-password"
                required
                data-testid="input-confirm-password"
              />
              {confirmError && (
                <p className="text-xs text-red-500" data-testid="text-confirm-error">{confirmError}</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={submitting || loading || !passwordValid}
              data-testid="button-set-password-submit"
            >
              {submitting ? "Setting password…" : "Set password & continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
