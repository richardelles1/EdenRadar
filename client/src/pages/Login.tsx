import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Sprout, Loader2, Lightbulb, FlaskConical } from "lucide-react";

function RadarBackground() {
  const R = 260;
  const cx = 50;
  const cy = 50;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
      <svg
        viewBox="0 0 100 100"
        className="w-[min(90vw,90vh)] h-[min(90vw,90vh)] opacity-[0.18]"
        xmlns="http://www.w3.org/2000/svg"
        style={{ minWidth: 280, minHeight: 280 }}
      >
        <defs>
          <radialGradient id="sweepFade" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </radialGradient>
          <mask id="radarMask">
            <circle cx="50" cy="50" r="48" fill="white" />
          </mask>
        </defs>

        <g mask="url(#radarMask)">
          {[12, 22, 32, 42, 48].map((r) => (
            <circle
              key={r}
              cx="50" cy="50" r={r}
              fill="none"
              stroke="#22c55e"
              strokeWidth="0.25"
              strokeDasharray="1 1.2"
            />
          ))}

          <line x1="50" y1="2" x2="50" y2="98" stroke="#22c55e" strokeWidth="0.2" strokeOpacity="0.6" />
          <line x1="2" y1="50" x2="98" y2="50" stroke="#22c55e" strokeWidth="0.2" strokeOpacity="0.6" />
          <line x1="15.6" y1="15.6" x2="84.4" y2="84.4" stroke="#22c55e" strokeWidth="0.15" strokeOpacity="0.3" />
          <line x1="84.4" y1="15.6" x2="15.6" y2="84.4" stroke="#22c55e" strokeWidth="0.15" strokeOpacity="0.3" />

          {[0, 90, 180, 270].map((angle) => {
            const rad = (angle * Math.PI) / 180;
            const x1 = 50 + 45 * Math.cos(rad);
            const y1 = 50 + 45 * Math.sin(rad);
            const x2 = 50 + 48 * Math.cos(rad);
            const y2 = 50 + 48 * Math.sin(rad);
            return (
              <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#22c55e" strokeWidth="0.5" strokeOpacity="0.7" />
            );
          })}

          <g className="radar-spin">
            <path
              d={`M 50 50 L ${50 + 48 * Math.cos(-Math.PI / 2)} ${50 + 48 * Math.sin(-Math.PI / 2)} A 48 48 0 0 1 50 2`}
              fill="url(#sweepFade)"
              style={{
                fill: "none",
                stroke: "none",
              }}
            />
            <path
              d="M 50 50 L 50 2"
              stroke="#22c55e"
              strokeWidth="0.35"
              strokeOpacity="0.9"
            />
            <path
              d={`M 50 50 L ${50 + 48 * Math.cos(-Math.PI / 2 + 0.8)} ${50 + 48 * Math.sin(-Math.PI / 2 + 0.8)}`}
              stroke="#22c55e"
              strokeWidth="0.2"
              strokeOpacity="0.45"
            />
            <path
              d={`M 50 50 L ${50 + 48 * Math.cos(-Math.PI / 2 + 1.4)} ${50 + 48 * Math.sin(-Math.PI / 2 + 1.4)}`}
              stroke="#22c55e"
              strokeWidth="0.1"
              strokeOpacity="0.2"
            />
          </g>

          <circle cx="50" cy="50" r="1.2" fill="#22c55e" fillOpacity="0.8" />

          {[
            { cx: 34, cy: 28, r: 0.8 },
            { cx: 62, cy: 38, r: 0.7 },
            { cx: 44, cy: 62, r: 0.9 },
            { cx: 68, cy: 58, r: 0.6 },
            { cx: 30, cy: 55, r: 0.7 },
            { cx: 58, cy: 22, r: 0.6 },
            { cx: 72, cy: 72, r: 0.5 },
          ].map((dot, i) => (
            <circle key={i} cx={dot.cx} cy={dot.cy} r={dot.r}
              fill="#22c55e" fillOpacity="0.6" />
          ))}

          <circle cx="50" cy="50" r="12" fill="none" stroke="#22c55e" strokeWidth="0.3" className="radar-ring-1" />
          <circle cx="50" cy="50" r="12" fill="none" stroke="#22c55e" strokeWidth="0.3" className="radar-ring-2" />
          <circle cx="50" cy="50" r="12" fill="none" stroke="#22c55e" strokeWidth="0.3" className="radar-ring-3" />
        </g>
      </svg>
    </div>
  );
}

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
      const dest = role === "industry" ? "/industry/dashboard" : role === "researcher" ? "/research" : "/discovery";
      navigate(dest, { replace: true });
    }
  }, [authLoading, session, role, navigate]);

  if (!authLoading && session && role) return null;

  function redirectByRole(r: "industry" | "researcher" | "concept") {
    navigate(r === "industry" ? "/industry/dashboard" : r === "researcher" ? "/research" : "/discovery", { replace: true });
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
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center px-4"
      style={{ background: "hsl(222 47% 5%)" }}>

      <div className="aurora-blob-1 absolute top-[-15%] right-[-10%] w-[55vw] h-[55vw] max-w-[640px] max-h-[640px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle at center, rgba(34,197,94,0.28) 0%, rgba(16,185,129,0.12) 40%, transparent 70%)", filter: "blur(60px)" }} />

      <div className="aurora-blob-2 absolute bottom-[-10%] left-[-8%] w-[50vw] h-[50vw] max-w-[580px] max-h-[580px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle at center, rgba(245,158,11,0.22) 0%, rgba(251,191,36,0.08) 45%, transparent 70%)", filter: "blur(70px)" }} />

      <div className="aurora-blob-3 absolute top-[30%] left-[10%] w-[40vw] h-[40vw] max-w-[480px] max-h-[480px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle at center, rgba(139,92,246,0.18) 0%, rgba(167,139,250,0.07) 45%, transparent 70%)", filter: "blur(65px)" }} />

      <RadarBackground />

      <div className="relative z-10 w-full max-w-sm space-y-6">
        <div className="rounded-2xl border px-8 py-8 space-y-6"
          style={{
            background: "rgba(15,20,35,0.72)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderColor: "rgba(34,197,94,0.18)",
            boxShadow: "0 0 40px rgba(34,197,94,0.06), 0 24px 48px rgba(0,0,0,0.5)",
          }}>

          <div className="text-center space-y-2">
            <div className="flex flex-col items-start gap-3 mb-4 w-fit mx-auto">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded bg-amber-500 flex items-center justify-center">
                  <Lightbulb className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="font-bold text-sm text-white/90">
                  Eden<span className="text-amber-400">Discovery</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded bg-violet-500 flex items-center justify-center">
                  <FlaskConical className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="font-bold text-sm text-white/90">
                  Eden<span className="text-violet-400">Lab</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded bg-emerald-500 flex items-center justify-center">
                  <Sprout className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="font-bold text-sm text-white/90">
                  Eden<span className="text-emerald-400">Scout</span>
                </span>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white">
              {mode === "signin" ? "Sign in" : "Create account"}
            </h1>
            <p className="text-sm text-white/50">
              {mode === "signin"
                ? "Enter your credentials to access the platform"
                : "Sign up for an EdenRadar account"}
            </p>
          </div>

          <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === "signin" ? "bg-emerald-600 text-white" : "bg-transparent text-white/40 hover:text-white/70"}`}
              onClick={() => { setMode("signin"); setError(null); }}
              data-testid="tab-signin"
            >
              Sign In
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === "signup" ? "bg-emerald-600 text-white" : "bg-transparent text-white/40 hover:text-white/70"}`}
              onClick={() => { setMode("signup"); setError(null); }}
              data-testid="tab-signup"
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/70 text-sm">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="input-email"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-emerald-500/60 focus:ring-emerald-500/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/70 text-sm">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                data-testid="input-password"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-emerald-500/60 focus:ring-emerald-500/20"
              />
            </div>

            {mode === "signup" && (
              <div className="space-y-2">
                <Label className="text-white/70 text-sm">I am</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                      selectedRole === "industry"
                        ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-400"
                        : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/70"
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
                        ? "border-violet-500/60 bg-violet-500/15 text-violet-400"
                        : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/70"
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
                        ? "border-amber-500/60 bg-amber-500/15 text-amber-400"
                        : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/70"
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
              <p className="text-sm text-red-400" data-testid="text-auth-error">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white border-0"
              disabled={loading}
              data-testid="button-auth-submit"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {mode === "signin" ? "Sign In" : "Create Account"}
            </Button>
          </form>

          <div className="text-center">
            <button
              type="button"
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
              onClick={() => navigate("/")}
              data-testid="link-back-home"
            >
              Back to home
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-white/20 tracking-wide">
          EdenNX &mdash; Biotech Intelligence Platform
        </p>
      </div>
    </div>
  );
}
