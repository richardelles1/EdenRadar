import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Sprout, Loader2, Lightbulb, FlaskConical, Radar } from "lucide-react";

const PORTAL_STYLES = {
  amber:   { iconBg: "bg-amber-500",   iconBgSoft: "bg-amber-500/20",   iconBorder: "border-amber-500/30",   text: "text-amber-400"   },
  violet:  { iconBg: "bg-violet-500",  iconBgSoft: "bg-violet-500/20",  iconBorder: "border-violet-500/30",  text: "text-violet-400"  },
  emerald: { iconBg: "bg-emerald-500", iconBgSoft: "bg-emerald-500/20", iconBorder: "border-emerald-500/30", text: "text-emerald-400" },
} as const;
type PortalColor = keyof typeof PORTAL_STYLES;

function AuroraLayer() {
  return (
    <>
      <div
        className="aurora-blob-1 absolute pointer-events-none rounded-full"
        style={{
          top: "-18%", right: "-12%",
          width: "clamp(280px, 55vw, 640px)",
          height: "clamp(280px, 55vw, 640px)",
          background: "radial-gradient(circle at center, rgba(34,197,94,0.30) 0%, rgba(16,185,129,0.13) 40%, transparent 70%)",
          filter: "blur(64px)",
        }}
      />
      <div
        className="aurora-blob-2 absolute pointer-events-none rounded-full"
        style={{
          bottom: "-12%", left: "-10%",
          width: "clamp(240px, 50vw, 580px)",
          height: "clamp(240px, 50vw, 580px)",
          background: "radial-gradient(circle at center, rgba(245,158,11,0.22) 0%, rgba(251,191,36,0.09) 45%, transparent 70%)",
          filter: "blur(72px)",
        }}
      />
      <div
        className="aurora-blob-3 absolute pointer-events-none rounded-full"
        style={{
          top: "30%", left: "8%",
          width: "clamp(200px, 40vw, 480px)",
          height: "clamp(200px, 40vw, 480px)",
          background: "radial-gradient(circle at center, rgba(139,92,246,0.18) 0%, rgba(167,139,250,0.07) 45%, transparent 70%)",
          filter: "blur(68px)",
        }}
      />
    </>
  );
}

function RadarRings({ size = 600, opacity = 0.22 }: { size?: number; opacity?: number }) {
  const rings = [
    size * 0.37,
    size * 0.56,
    size * 0.74,
    size * 0.92,
  ];
  return (
    <div
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          animation: "radar-bg-slow 18s linear infinite",
          transformOrigin: "center center",
          background:
            "conic-gradient(from 0deg, transparent 260deg, hsl(142 65% 48% / 0.06) 310deg, hsl(142 65% 48% / 0.24) 360deg)",
        }}
      />
      {rings.map((r, i) => (
        <div
          key={r}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{
            width: r,
            height: r,
            borderColor: `hsl(142 55% 45% / ${opacity - i * 0.04})`,
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
      {[
        { cx: "35%", cy: "30%" },
        { cx: "62%", cy: "40%" },
        { cx: "44%", cy: "62%" },
        { cx: "70%", cy: "56%" },
        { cx: "28%", cy: "55%" },
        { cx: "58%", cy: "24%" },
        { cx: "72%", cy: "72%" },
      ].map((pos, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 rounded-full"
          style={{
            left: pos.cx, top: pos.cy,
            background: "hsl(142 65% 55%)",
            opacity: 0.55,
          }}
        />
      ))}
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

  return (
    <div
      className="relative min-h-screen overflow-hidden flex"
      style={{ background: "hsl(222 47% 5%)" }}
    >
      <AuroraLayer />

      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <RadarRings size={680} opacity={0.20} />
      </div>

      <div className="hidden md:flex flex-1 flex-col items-center justify-center relative z-10 px-12">
        <div className="max-w-xs text-center space-y-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <Radar className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-lg font-bold text-white/90 tracking-tight">EdenRadar</span>
          </div>
          <p className="text-sm text-white/40 leading-relaxed">
            Biotech intelligence platform connecting industry buyers with licensable assets from 300+ technology transfer offices.
          </p>
          <div className="flex flex-col gap-2.5 text-left">
            {([
              { icon: Lightbulb, color: "amber" as PortalColor, label: "Discovery", desc: "$19.99 / mo" },
              { icon: FlaskConical, color: "violet" as PortalColor, label: "Lab", desc: "$29.99 / mo" },
              { icon: Sprout, color: "emerald" as PortalColor, label: "Scout", desc: "$299 / mo" },
            ]).map(({ icon: Icon, color, label, desc }) => {
              const s = PORTAL_STYLES[color];
              return (
                <div key={label} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded ${s.iconBgSoft} border ${s.iconBorder} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-3.5 h-3.5 ${s.text}`} />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-white/80">Eden{label}</span>
                    <span className="text-xs text-white/35 ml-2">{desc}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center relative z-10 px-4 py-12 md:max-w-md md:ml-auto">
        <div className="w-full max-w-sm space-y-5">
          <div
            className="rounded-2xl border px-7 py-7 space-y-5"
            style={{
              background: "rgba(13,18,32,0.78)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderColor: "rgba(34,197,94,0.16)",
              boxShadow: "0 0 48px rgba(34,197,94,0.05), 0 28px 56px rgba(0,0,0,0.55)",
            }}
          >
            <div className="md:hidden flex flex-col items-start gap-2.5 mb-1 w-fit mx-auto">
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
                    <span className="font-bold text-sm text-white/90">
                      Eden<span className={s.text}>{label}</span>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="space-y-1">
              <h1 className="text-xl font-bold text-white">
                {mode === "signin" ? "Welcome back" : "Create account"}
              </h1>
              <p className="text-sm text-white/45">
                {mode === "signin"
                  ? "Sign in to access the platform"
                  : "Sign up for an EdenRadar account"}
              </p>
            </div>

            <div
              className="flex rounded-lg border overflow-hidden"
              style={{ borderColor: "rgba(255,255,255,0.09)" }}
            >
              <button
                type="button"
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  mode === "signin"
                    ? "bg-emerald-600 text-white"
                    : "bg-transparent text-white/35 hover:text-white/65"
                }`}
                onClick={() => { setMode("signin"); setError(null); }}
                data-testid="tab-signin"
              >
                Sign In
              </button>
              <button
                type="button"
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  mode === "signup"
                    ? "bg-emerald-600 text-white"
                    : "bg-transparent text-white/35 hover:text-white/65"
                }`}
                onClick={() => { setMode("signup"); setError(null); }}
                data-testid="tab-signup"
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-white/65 text-sm">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-email"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/22 focus:border-emerald-500/55 focus:ring-emerald-500/18"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-white/65 text-sm">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  data-testid="input-password"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/22 focus:border-emerald-500/55 focus:ring-emerald-500/18"
                />
              </div>

              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label className="text-white/65 text-sm">I am</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "industry" as const, label: "Industry", activeClass: "border-emerald-500/55 bg-emerald-500/12 text-emerald-400" },
                      { value: "researcher" as const, label: "Researcher", activeClass: "border-violet-500/55 bg-violet-500/12 text-violet-400" },
                      { value: "concept" as const, label: "Concept", activeClass: "border-amber-500/55 bg-amber-500/12 text-amber-400" },
                    ].map(({ value, label, activeClass }) => (
                      <button
                        key={value}
                        type="button"
                        className={`p-2.5 rounded-lg border text-xs font-medium transition-all ${
                          selectedRole === value
                            ? activeClass
                            : "border-white/10 text-white/35 hover:border-white/18 hover:text-white/65"
                        }`}
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
                <p className="text-sm text-red-400" data-testid="text-auth-error">{error}</p>
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
                className="text-xs text-white/28 hover:text-white/55 transition-colors"
                onClick={() => navigate("/")}
                data-testid="link-back-home"
              >
                Back to home
              </button>
            </div>
          </div>

          <p className="text-center text-[11px] text-white/18 tracking-wide">
            EdenNX &mdash; Biotech Intelligence Platform
          </p>
        </div>
      </div>
    </div>
  );
}
