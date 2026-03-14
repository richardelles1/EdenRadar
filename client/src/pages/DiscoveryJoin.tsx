import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { Lightbulb, Loader2, ArrowLeft } from "lucide-react";

export default function DiscoveryJoin() {
  const { signIn, signUp, session, role, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && session && role === "concept") {
      navigate("/discovery/submit", { replace: true });
    }
  }, [authLoading, session, role, navigate]);

  if (!authLoading && session && role === "concept") return null;

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
      navigate("/discovery", { replace: true });
    } else {
      const { error: err } = await signUp(email, password, "concept");
      if (err) {
        setError(err);
        setLoading(false);
        return;
      }
      navigate("/discovery/submit", { replace: true });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-md bg-amber-500 flex items-center justify-center">
              <Lightbulb className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl text-foreground">
              Eden<span className="text-amber-500">Discovery</span>
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-join-title">
            {mode === "signup" ? "Join Eden Discovery" : "Sign in to Discovery"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "signup"
              ? "Create a concept account to submit and track your pre-research ideas."
              : "Sign in to your concept account"}
          </p>
        </div>

        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === "signup" ? "bg-amber-500 text-white" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => { setMode("signup"); setError(null); }}
            data-testid="tab-join-signup"
          >
            Sign Up
          </button>
          <button
            type="button"
            className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === "signin" ? "bg-amber-500 text-white" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => { setMode("signin"); setError(null); }}
            data-testid="tab-join-signin"
          >
            Sign In
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
              data-testid="input-join-email"
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
              data-testid="input-join-password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500" data-testid="text-join-error">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full bg-amber-500 hover:bg-amber-600 text-white"
            disabled={loading}
            data-testid="button-join-submit"
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {mode === "signup" ? "Create Concept Account" : "Sign In"}
          </Button>
        </form>

        <div className="text-center space-y-2">
          <Link href="/discovery">
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors" data-testid="link-back-feed-join">
              <ArrowLeft className="w-3 h-3" />
              Back to Concept Feed
            </div>
          </Link>
          <p className="text-xs text-muted-foreground">
            Already have an EdenRadar account?{" "}
            <Link href="/login">
              <span className="text-amber-500 hover:text-amber-600 cursor-pointer" data-testid="link-main-login">
                Log in here
              </span>
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
