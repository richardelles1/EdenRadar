import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useDocumentMeta } from "@/hooks/use-document-meta";

export default function AdminResetPassword() {
  useDocumentMeta({ title: "Set Your Password | EdenRadar", noindex: true });
  const { session, loading, updatePassword, role } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !session) {
      toast({
        title: "Reset link expired",
        description: "Open the password-reset email again to start over.",
        variant: "destructive",
      });
    }
  }, [loading, session, toast]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      password.length < 10 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      toast({
        title: "Password too weak",
        description: "Use at least 10 characters with upper-case, lower-case, and a digit.",
        variant: "destructive",
      });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await updatePassword(password);
    setSubmitting(false);
    if (error) {
      toast({ title: "Could not update password", description: error, variant: "destructive" });
      return;
    }
    toast({ title: "Password updated", description: "Welcome to EdenRadar!" });
    const dest = isAdmin ? "/admin"
      : role === "industry" ? "/industry/dashboard"
      : role === "researcher" ? "/research"
      : "/discovery";
    navigate(dest, { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <Card className="w-full max-w-md" data-testid="card-admin-reset-password">
        <CardHeader>
          <CardTitle>Set your password</CardTitle>
          <CardDescription>
            Choose a password to activate your EdenRadar account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!session && !loading ? (
            <p className="text-sm text-muted-foreground" data-testid="text-reset-expired">
              This reset link is no longer valid. Request a new one from the login page.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={10}
                  required
                  data-testid="input-new-password"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum 10 characters with upper-case, lower-case, and a digit.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  minLength={10}
                  required
                  data-testid="input-confirm-password"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={submitting || loading}
                data-testid="button-submit-new-password"
              >
                {submitting ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
