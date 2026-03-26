import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/lib/supabase";
import { Sprout, Loader2, Lightbulb, FlaskConical } from "lucide-react";
import { AuroraLayer } from "@/components/AuroraLayer";
import { RadarRings } from "@/components/RadarRings";

const PORTAL_STYLES = {
  amber:   { iconBg: "bg-amber-500",   text: "text-amber-500 dark:text-amber-400"   },
  violet:  { iconBg: "bg-violet-500",  text: "text-violet-500 dark:text-violet-400"  },
  emerald: { iconBg: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
} as const;
type PortalColor = keyof typeof PORTAL_STYLES;

const PORTALS: { icon: React.ElementType; color: PortalColor; label: string }[] = [
  { icon: Lightbulb,    color: "amber",   label: "Discovery" },
  { icon: FlaskConical, color: "violet",  label: "Lab"       },
  { icon: Sprout,       color: "emerald", label: "Scout"     },
];

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

  const pageBg    = isDark ? "hsl(222 47% 5%)"  : "hsl(210 25% 95%)";
  const heading   = isDark ? "text-white"        : "text-foreground";
  const sub       = isDark ? "text-white/45"     : "text-muted-foreground";
  const lbl       = isDark ? "text-white/65"     : "text-foreground/70";
  const inp       = isDark
    ? "bg-white/5 border-white/10 text-white placeholder:text-white/22 focus:border-emerald-500/55 focus:ring-emerald-500/18"
    : "bg-white border-border text-foreground placeholder:text-muted-foreground/50 focus:border-emerald-500/60 focus:ring-emerald-500/20";
  const tabOff    = isDark ? "text-white/35 hover:text-white/65"  : "text-muted-foreground hover:text-foreground";
  const roleOff   = isDark
    ? "border-white/10 text-white/35 hover:border-white/18 hover:text-white/65"
    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground";
  const back      = isDark ? "text-white/28 hover:text-white/55"  : "text-muted-foreground/50 hover:text-muted-foreground";
  const footer    = isDark ? "text-white/18" : "text-muted-foreground/35";
  const tabBorder = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.10)";
  const cardStyle: React.CSSProperties = isDark
    ? { background: "rgba(13,18,32,0.78)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        borderColor: "rgba(34,197,94,0.16)", boxShadow: "0 0 48px rgba(34,197,94,0.05), 0 28px 56px rgba(0,0,0,0.55)" }
    : { background: "rgba(255,255,255,0.82)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderColor: "rgba(34,197,94,0.22)", boxShadow: "0 0 32px rgba(34,197,94,0.07), 0 16px 40px rgba(0,0,0,0.10)" };

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: pageBg }}>
      <AuroraLayer opacity={1} intensity={1} isDark={isDark} />
      <RadarRings isDark={isDark} />

      <div className="relative z-10 min-h-screen flex items-center justify-center">
        <div className="flex items-center justify-center px-4 py-12 w-full">
          <div className="w-full max-w-sm space-y-5">
            <div className="rounded-2xl border px-7 py-7 space-y-5" style={cardStyle}>

              <div className="flex flex-col items-start gap-2.5 w-fit mx-auto">
                {PORTALS.map(({ icon: Icon, color, label }) => {
                  const s = PORTAL_STYLES[color];
                  return (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className={`w-6 h-6 rounded ${s.iconBg} flex items-center justify-center`}>
                        <Icon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className={`font-bold text-sm ${heading}`}>
                        Eden<span className={s.text}>{label}</span>
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1">
                <h1 className={`text-xl font-bold ${heading}`}>
                  {mode === "signin" ? "Welcome back" : "Create account"}
                </h1>
                <p className={`text-sm ${sub}`}>
                  {mode === "signin"
                    ? "Sign in to access the platform"
                    : "Sign up for an EdenRadar account"}
                </p>
              </div>

              <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: tabBorder }}>
                {(["signin", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === m ? "bg-emerald-600 text-white" : `bg-transparent ${tabOff}`}`}
                    onClick={() => { setMode(m); setError(null); }}
                    data-testid={`tab-${m}`}
                  >
                    {m === "signin" ? "Sign In" : "Sign Up"}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className={`text-sm ${lbl}`}>Email</Label>
                  <Input id="email" type="email" placeholder="you@example.com"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    required data-testid="input-email" className={inp} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className={`text-sm ${lbl}`}>Password</Label>
                  <Input id="password" type="password" placeholder="••••••••"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    required minLength={6} data-testid="input-password" className={inp} />
                </div>

                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label className={`text-sm ${lbl}`}>I am</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: "industry" as const,    label: "Industry",   active: "border-emerald-500/55 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
                        { value: "researcher" as const,  label: "Researcher", active: "border-violet-500/55 bg-violet-500/12 text-violet-600 dark:text-violet-400"   },
                        { value: "concept" as const,     label: "Concept",    active: "border-amber-500/55 bg-amber-500/12 text-amber-600 dark:text-amber-400"        },
                      ]).map(({ value, label, active }) => (
                        <button key={value} type="button"
                          className={`p-2.5 rounded-lg border text-xs font-medium transition-all ${selectedRole === value ? active : roleOff}`}
                          onClick={() => setSelectedRole(value)} data-testid={`role-${value}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {error && (
                  <p className="text-sm text-red-500 dark:text-red-400" data-testid="text-auth-error">{error}</p>
                )}

                <Button type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white border-0 mt-1"
                  disabled={loading} data-testid="button-auth-submit">
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {mode === "signin" ? "Sign In" : "Create Account"}
                </Button>
              </form>

              <div className="text-center pt-1">
                <button type="button" className={`text-xs transition-colors ${back}`}
                  onClick={() => navigate("/")} data-testid="link-back-home">
                  Back to home
                </button>
              </div>
            </div>

            <p className={`text-center text-[11px] tracking-wide ${footer}`}>
              EdenNX &mdash; Biotech Intelligence Platform
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
