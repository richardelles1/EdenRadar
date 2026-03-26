import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/lib/supabase";
import { Sprout, Loader2, Lightbulb, FlaskConical } from "lucide-react";

const PORTAL_STYLES = {
  amber:   { iconBg: "bg-amber-500",   text: "text-amber-500 dark:text-amber-400"   },
  violet:  { iconBg: "bg-violet-500",  text: "text-violet-500 dark:text-violet-400"  },
  emerald: { iconBg: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
} as const;
type PortalColor = keyof typeof PORTAL_STYLES;

interface AuroraLayerProps {
  opacity?: number;
  intensity?: number;
  isDark?: boolean;
}

function AuroraLayer({ opacity = 1, intensity = 1, isDark = true }: AuroraLayerProps) {
  const base = isDark ? 1 : 0.5;
  const emeraldA = 0.30 * intensity * base * opacity;
  const emeraldB = 0.13 * intensity * base * opacity;
  const amberA   = 0.22 * intensity * base * opacity;
  const amberB   = 0.09 * intensity * base * opacity;
  const violetA  = 0.18 * intensity * base * opacity;
  const violetB  = 0.07 * intensity * base * opacity;

  return (
    <>
      <div
        className="aurora-blob-1 absolute pointer-events-none rounded-full"
        style={{
          top: "-18%", right: "-12%",
          width: "clamp(280px, 55vw, 640px)",
          height: "clamp(280px, 55vw, 640px)",
          background: `radial-gradient(circle at center,
            rgba(34,197,94,${emeraldA}) 0%,
            rgba(16,185,129,${emeraldB}) 40%,
            transparent 70%)`,
          filter: "blur(64px)",
        }}
      />
      <div
        className="aurora-blob-2 absolute pointer-events-none rounded-full"
        style={{
          bottom: "-12%", left: "-10%",
          width: "clamp(240px, 50vw, 580px)",
          height: "clamp(240px, 50vw, 580px)",
          background: `radial-gradient(circle at center,
            rgba(245,158,11,${amberA}) 0%,
            rgba(251,191,36,${amberB}) 45%,
            transparent 70%)`,
          filter: "blur(72px)",
        }}
      />
      <div
        className="aurora-blob-3 absolute pointer-events-none rounded-full"
        style={{
          top: "30%", left: "8%",
          width: "clamp(200px, 40vw, 480px)",
          height: "clamp(200px, 40vw, 480px)",
          background: `radial-gradient(circle at center,
            rgba(139,92,246,${violetA}) 0%,
            rgba(167,139,250,${violetB}) 45%,
            transparent 70%)`,
          filter: "blur(68px)",
        }}
      />
    </>
  );
}

function RadarRings({ isDark = true }: { isDark?: boolean }) {
  const ringAlpha = isDark ? 0.20 : 0.12;
  const sweepAlpha1 = isDark ? 0.06 : 0.04;
  const sweepAlpha2 = isDark ? 0.24 : 0.15;

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden
    >
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: "clamp(320px, 68vw, 680px)",
          height: "clamp(320px, 68vw, 680px)",
          animation: "radar-bg-slow 18s linear infinite",
          transformOrigin: "center center",
          background: `conic-gradient(from 0deg, transparent 260deg,
            hsl(142 65% 48% / ${sweepAlpha1}) 310deg,
            hsl(142 65% 48% / ${sweepAlpha2}) 360deg)`,
          borderRadius: "50%",
        }}
      />
      {([0.37, 0.56, 0.74, 0.92] as const).map((frac, i) => (
        <div
          key={frac}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{
            width: `clamp(${Math.round(320 * frac)}px, ${Math.round(68 * frac)}vw, ${Math.round(680 * frac)}px)`,
            height: `clamp(${Math.round(320 * frac)}px, ${Math.round(68 * frac)}vw, ${Math.round(680 * frac)}px)`,
            borderColor: `hsl(142 55% 45% / ${ringAlpha - i * 0.04})`,
          }}
        />
      ))}
      <div
        className="absolute left-1/2 top-1/2 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: "hsl(142 65% 55%)",
          animation: "pulse-ring 3s ease-out infinite",
          opacity: 0,
        }}
      />
    </div>
  );
}

export default function Login() {
  const { signIn, signUp, session, role, loading: authLoading } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<"industry" | "researcher" | "concept">("industry");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && session && role) {
      const dest =
        role === "industry" ? "/industry/dashboard" :
        role === "researcher" ? "/research" :
        "/discovery";
      navigate(dest, { replace: true });
    }
  }, [authLoading, session, role, navigate]);

  if (!authLoading && session && role) return null;

  function redirectByRole(r: "industry" | "researcher" | "concept") {
    navigate(
      r === "industry" ? "/industry/dashboard" :
      r === "researcher" ? "/research" :
      "/discovery",
      { replace: true }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === "signin") {
      const { error: err } = await signIn(email, password);
      if (err) { setError(err); setLoading(false); return; }
      const { data } = await supabase.auth.getUser();
      const r = data.user?.user_metadata?.role;
      if (r === "industry" || r === "researcher" || r === "concept") redirectByRole(r);
      else { setError("Account has no role assigned"); setLoading(false); }
    } else {
      const { error: err } = await signUp(email, password, selectedRole);
      if (err) { setError(err); setLoading(false); return; }
      redirectByRole(selectedRole);
    }
  }

  const pageBg = isDark ? "hsl(222 47% 5%)" : "hsl(210 25% 95%)";

  const cardStyle: React.CSSProperties = isDark
    ? {
        background: "rgba(13,18,32,0.78)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderColor: "rgba(34,197,94,0.16)",
        boxShadow: "0 0 48px rgba(34,197,94,0.05), 0 28px 56px rgba(0,0,0,0.55)",
      }
    : {
        background: "rgba(255,255,255,0.82)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderColor: "rgba(34,197,94,0.22)",
        boxShadow: "0 0 32px rgba(34,197,94,0.07), 0 16px 40px rgba(0,0,0,0.10)",
      };

  const headingClass = isDark ? "text-white" : "text-foreground";
  const subClass     = isDark ? "text-white/45" : "text-muted-foreground";
  const labelClass   = isDark ? "text-white/65" : "text-foreground/70";
  const inputClass   = isDark
    ? "bg-white/5 border-white/10 text-white placeholder:text-white/22 focus:border-emerald-500/55 focus:ring-emerald-500/18"
    : "bg-white border-border text-foreground placeholder:text-muted-foreground/50 focus:border-emerald-500/60 focus:ring-emerald-500/20";
  const tabInactive  = isDark ? "text-white/35 hover:text-white/65" : "text-muted-foreground hover:text-foreground";
  const roleInactive = isDark
    ? "border-white/10 text-white/35 hover:border-white/18 hover:text-white/65"
    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground";
  const backClass    = isDark ? "text-white/28 hover:text-white/55" : "text-muted-foreground/50 hover:text-muted-foreground";
  const footerClass  = isDark ? "text-white/18" : "text-muted-foreground/35";
  const tabBorderStyle = isDark
    ? { borderColor: "rgba(255,255,255,0.09)" }
    : { borderColor: "rgba(0,0,0,0.10)" };

  return (
    <div
      className="relative min-h-screen overflow-hidden flex"
      style={{ background: pageBg }}
    >
      <AuroraLayer opacity={1} intensity={1} isDark={isDark} />
      <RadarRings isDark={isDark} />

      <div className="hidden md:block flex-1" aria-hidden />

      <div className="flex flex-1 items-center justify-center relative z-10 px-4 py-12 md:max-w-md">
        <div className="w-full max-w-sm space-y-5">
          <div className="rounded-2xl border px-7 py-7 space-y-5" style={cardStyle}>

            <div className="flex flex-col items-start gap-2.5 mb-1 w-fit mx-auto">
              {([
                { icon: Lightbulb, color: "amber" as PortalColor, label: "Discovery" },
                { icon: FlaskConical, color: "violet" as PortalColor, label: "Lab" },
                { icon: Sprout, color: "emerald" as PortalColor, label: "Scout" },
              ]).map(({ icon: Icon, color, label }) => {
                const s = PORTAL_STYLES[color];
                return (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className={`w-6 h-6 rounded ${s.iconBg} flex items-center justify-center`}>
                      <Icon className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className={`font-bold text-sm ${headingClass}`}>
                      Eden<span className={s.text}>{label}</span>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="space-y-1">
              <h1 className={`text-xl font-bold ${headingClass}`}>
                {mode === "signin" ? "Welcome back" : "Create account"}
              </h1>
              <p className={`text-sm ${subClass}`}>
                {mode === "signin"
                  ? "Sign in to access the platform"
                  : "Sign up for an EdenRadar account"}
              </p>
            </div>

            <div className="flex rounded-lg border overflow-hidden" style={tabBorderStyle}>
              <button
                type="button"
                className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === "signin" ? "bg-emerald-600 text-white" : `bg-transparent ${tabInactive}`}`}
                onClick={() => { setMode("signin"); setError(null); }}
                data-testid="tab-signin"
              >
                Sign In
              </button>
              <button
                type="button"
                className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === "signup" ? "bg-emerald-600 text-white" : `bg-transparent ${tabInactive}`}`}
                onClick={() => { setMode("signup"); setError(null); }}
                data-testid="tab-signup"
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className={`text-sm ${labelClass}`}>Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-email"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className={`text-sm ${labelClass}`}>Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  data-testid="input-password"
                  className={inputClass}
                />
              </div>

              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label className={`text-sm ${labelClass}`}>I am</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: "industry" as const, label: "Industry", activeClass: "border-emerald-500/55 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
                      { value: "researcher" as const, label: "Researcher", activeClass: "border-violet-500/55 bg-violet-500/12 text-violet-600 dark:text-violet-400" },
                      { value: "concept" as const, label: "Concept", activeClass: "border-amber-500/55 bg-amber-500/12 text-amber-600 dark:text-amber-400" },
                    ]).map(({ value, label, activeClass }) => (
                      <button
                        key={value}
                        type="button"
                        className={`p-2.5 rounded-lg border text-xs font-medium transition-all ${selectedRole === value ? activeClass : roleInactive}`}
                        onClick={() => setSelectedRole(value)}
                        data-testid={`role-${value}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <p className="text-sm text-red-500 dark:text-red-400" data-testid="text-auth-error">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white border-0 mt-1"
                disabled={loading}
                data-testid="button-auth-submit"
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {mode === "signin" ? "Sign In" : "Create Account"}
              </Button>
            </form>

            <div className="text-center pt-1">
              <button
                type="button"
                className={`text-xs transition-colors ${backClass}`}
                onClick={() => navigate("/")}
                data-testid="link-back-home"
              >
                Back to home
              </button>
            </div>
          </div>

          <p className={`text-center text-[11px] tracking-wide ${footerClass}`}>
            EdenNX &mdash; Biotech Intelligence Platform
          </p>
        </div>
      </div>
    </div>
  );
}
