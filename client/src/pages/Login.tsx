import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Sprout, Loader2, Lightbulb, FlaskConical } from "lucide-react";

export default function Login() {
  const { signIn, signUp, session, role, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<"industry" | "researcher" | "concept">("industry");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && session && role) {
      const dest = role === "industry" ? "/scout" : role === "researcher" ? "/research" : "/discovery";
      navigate(dest, { replace: true });
    }
  }, [authLoading, session, role, navigate]);

  if (!authLoading && session && role) return null;

  function redirectByRole(r: "industry" | "researcher" | "concept") {
    navigate(r === "industry" ? "/scout" : r === "researcher" ? "/research" : "/discovery", { replace: true });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === "signin") {
      const { error: err } = await signIn(email, password);
      if (err) {
        setError(err);
        setLoading(false);
        return;
      }
      const { data } = await supabase.auth.getUser();
      const r = data.user?.user_metadata?.role;
      if (r === "industry" || r === "researcher" || r === "concept") redirectByRole(r);
      else { setError("Account has no role assigned"); setLoading(false); }
    } else {
      const { error: err } = await signUp(email, password, selectedRole);
      if (err) {
        setError(err);
        setLoading(false);
        return;
      }
      redirectByRole(selectedRole);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex flex-col items-center gap-2 mb-4">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded bg-amber-500 flex items-center justify-center">
                <Lightbulb className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-bold text-sm text-foreground">
                Eden<span className="text-amber-500">Discovery</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded bg-violet-500 flex items-center justify-center">
                <FlaskConical className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-bold text-sm text-foreground">
                Eden<span className="text-violet-500">Lab</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
                <Sprout className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <span className="font-bold text-sm text-foreground">
                Eden<span className="text-primary">Radar</span>
              </span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "signin"
              ? "Enter your credentials to access the platform"
              : "Sign up for an EdenRadar account"}
          </p>
        </div>

        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === "signin" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => { setMode("signin"); setError(null); }}
            data-testid="tab-signin"
          >
            Sign In
          </button>
          <button
            type="button"
            className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === "signup" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => { setMode("signup"); setError(null); }}
            data-testid="tab-signup"
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="input-email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              data-testid="input-password"
            />
          </div>

          {mode === "signup" && (
            <div className="space-y-2">
              <Label>I am</Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                    selectedRole === "industry"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                  onClick={() => setSelectedRole("industry")}
                  data-testid="role-industry"
                >
                  Industry
                </button>
                <button
                  type="button"
                  className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                    selectedRole === "researcher"
                      ? "border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                      : "border-border text-muted-foreground hover:border-violet-500/50 hover:text-foreground"
                  }`}
                  onClick={() => setSelectedRole("researcher")}
                  data-testid="role-researcher"
                >
                  Researcher
                </button>
                <button
                  type="button"
                  className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                    selectedRole === "concept"
                      ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "border-border text-muted-foreground hover:border-amber-500/50 hover:text-foreground"
                  }`}
                  onClick={() => setSelectedRole("concept")}
                  data-testid="role-concept"
                >
                  Concept
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500" data-testid="text-auth-error">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading} data-testid="button-auth-submit">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {mode === "signin" ? "Sign In" : "Create Account"}
          </Button>
        </form>

        <div className="text-center">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => navigate("/")}
            data-testid="link-back-home"
          >
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
}
