import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/lib/supabase";
import { Sprout, Loader2, Lightbulb, FlaskConical, ArrowLeft, CheckCircle2 } from "lucide-react";
import imgLabWork from "@assets/pexels-yaroslav-shuraev-8515114_1773638670424.jpg";

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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.3441 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2822-1.71V4.9582H.9574C.3477 6.173 0 7.5482 0 9s.3477 2.827.9574 4.0418L3.964 10.71z" fill="#FBBC05"/>
      <path d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9574 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z" fill="#EA4335"/>
    </svg>
  );
}

type View = "auth" | "forgot" | "forgot-sent" | "set-password" | "pick-role";

export default function Login() {
  const {
    signIn, signUp, signInWithGoogle, sendPasswordReset, updatePassword, updateRole,
    session, role, loading: authLoading,
    isPasswordRecovery, clearPasswordRecovery,
  } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [, navigate] = useLocation();
  const initialMode = new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [view, setView] = useState<View>(() => isPasswordRecovery ? "set-password" : "auth");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<"industry" | "researcher" | "concept">("industry");
  const [tosAccepted, setTosAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setPasswordLoading, setSetPasswordLoading] = useState(false);
  const [setPasswordError, setSetPasswordError] = useState<string | null>(null);

  const [pickRoleLoading, setPickRoleLoading] = useState(false);
  const [pickRoleError, setPickRoleError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && session && !role && !isPasswordRecovery && view === "auth") {
      setView("pick-role");
    }
  }, [authLoading, session, role, isPasswordRecovery, view]);

  useEffect(() => {
    if (isPasswordRecovery && view !== "set-password") {
      setView("set-password");
      setSetPasswordError(null);
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [isPasswordRecovery, view]);

  useEffect(() => {
    if (!authLoading && session && role && !isPasswordRecovery && view === "auth") {
      const dest =
        role === "industry" ? "/industry/dashboard" :
        role === "researcher" ? "/research" :
        "/discovery";
      navigate(dest, { replace: true });
    }
  }, [authLoading, session, role, isPasswordRecovery, navigate, view]);

  if (!authLoading && session && role && !isPasswordRecovery && view === "auth") return null;

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

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    const { error: err } = await signInWithGoogle();
    if (err) {
      setError(err);
      setGoogleLoading(false);
    } else {
      setTimeout(() => setGoogleLoading(false), 8000);
    }
  }

  async function handlePickRole(r: "industry" | "researcher" | "concept") {
    setPickRoleLoading(true);
    setPickRoleError(null);
    const { error: err } = await updateRole(r);
    setPickRoleLoading(false);
    if (err) {
      setPickRoleError(err);
      return;
    }
    redirectByRole(r);
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResetError(null);
    setResetLoading(true);
    const { error: err } = await sendPasswordReset(resetEmail);
    setResetLoading(false);
    if (err) {
      setResetError(err);
    } else {
      setView("forgot-sent");
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setSetPasswordError(null);
    if (newPassword !== confirmPassword) {
      setSetPasswordError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setSetPasswordError("Password must be at least 8 characters");
      return;
    }
    setSetPasswordLoading(true);
    const { error: err } = await updatePassword(newPassword);
    setSetPasswordLoading(false);
    if (err) {
      setSetPasswordError(err);
      return;
    }
    clearPasswordRecovery();
    const { data } = await supabase.auth.getUser();
    const r = data.user?.user_metadata?.role;
    if (r === "industry" || r === "researcher" || r === "concept") {
      redirectByRole(r);
    } else {
      setView("auth");
    }
  }

  const panelBg  = isDark ? "hsl(222 47% 5%)"  : "#ffffff";
  const heading  = isDark ? "text-white"        : "text-gray-900";
  const sub      = isDark ? "text-white/45"     : "text-gray-500/90";
  const tabOff   = isDark ? "text-white/35 hover:text-white/65" : "text-gray-500 hover:text-gray-700";
  const tabBorder = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.10)";
  const roleOff  = isDark
    ? "border-white/10 text-white/35 hover:border-white/18 hover:text-white/65"
    : "border-gray-300/60 text-gray-500 hover:border-emerald-400 hover:text-gray-700";
  const dividerLine = isDark ? "bg-white/10" : "bg-gray-300/90";
  const dividerText = isDark ? "text-white/30" : "text-gray-500/90";
  const forgotLink  = isDark ? "text-emerald-400/70 hover:text-emerald-400" : "text-emerald-700/60 hover:text-emerald-700";
  const backLink    = isDark ? "text-emerald-400/40 hover:text-emerald-400/70" : "text-emerald-700/40 hover:text-emerald-700/70";
  const googleBtn   = isDark
    ? "bg-white/5 border border-white/10 text-white hover:bg-white/10"
    : "bg-gray-500/10 border border-transparent text-gray-700 hover:bg-gray-500/15";

  const inputBase = "flex items-center w-full h-12 rounded-full overflow-hidden pl-5 pr-4 gap-2.5 transition-colors";
  const inputBorder = isDark
    ? "border border-white/10 bg-white/4 focus-within:border-emerald-500/50"
    : "border border-gray-300/60 bg-transparent focus-within:border-emerald-500/60";
  const inputText = isDark
    ? "text-white placeholder:text-white/30"
    : "text-gray-700 placeholder:text-gray-400/80";
  const inputIconColor = isDark ? "#6b7280" : "#9ca3af";

  const mutedText = isDark ? "text-white/50" : "text-gray-500";
  const bodyText  = isDark ? "text-white/80" : "text-gray-700";

  return (
    <div className="flex min-h-screen" style={{ background: panelBg }}>

      {/* Left: photo panel */}
      <div className="hidden md:block w-1/2 flex-shrink-0 relative">
        <img
          src={imgLabWork}
          alt="EdenNX lab"
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>

      {/* Right: form panel */}
      <div
        className="w-full md:w-1/2 flex flex-col items-center justify-center px-6 py-12 min-h-screen"
        style={{ background: panelBg }}
      >
        <div className="w-full max-w-sm space-y-6">

          {/* Portal badges */}
          <div className="flex items-center justify-center gap-4">
            {PORTALS.map(({ icon: Icon, color, label }) => {
              const s = PORTAL_STYLES[color];
              return (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={`w-5 h-5 rounded ${s.iconBg} flex items-center justify-center`}>
                    <Icon className="w-3 h-3 text-white" />
                  </div>
                  <span className={`font-bold text-xs ${isDark ? "text-white/80" : "text-gray-800"}`}>
                    Eden<span className={s.text}>{label}</span>
                  </span>
                </div>
              );
            })}
          </div>

          {/* ── Forgot password form ── */}
          {view === "forgot" && (
            <div className="space-y-5">
              <div className="space-y-1">
                <h1 className={`text-2xl font-semibold ${heading}`}>Reset password</h1>
                <p className={`text-sm ${sub}`}>
                  Enter your email and we'll send you a link to set a new password.
                </p>
              </div>
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <div className={`${inputBase} ${inputBorder}`}>
                  <svg width="16" height="11" viewBox="0 0 16 11" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                    <path fillRule="evenodd" clipRule="evenodd" d="M0 .55.571 0H15.43l.57.55v9.9l-.571.55H.57L0 10.45zm1.143 1.138V9.9h13.714V1.69l-6.503 4.8h-.697zM13.749 1.1H2.25L8 5.356z" fill={inputIconColor}/>
                  </svg>
                  <input
                    type="email"
                    placeholder="Email address"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    autoFocus
                    data-testid="input-reset-email"
                    className={`bg-transparent outline-none text-sm w-full h-full ${inputText}`}
                  />
                </div>
                {resetError && (
                  <p className="text-sm text-red-500 dark:text-red-400" data-testid="text-reset-error">{resetError}</p>
                )}
                <button
                  type="submit"
                  disabled={resetLoading}
                  data-testid="button-send-reset"
                  className="w-full h-11 rounded-full text-white font-medium text-sm bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {resetLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Send reset link
                </button>
              </form>
              <div className="text-center">
                <button
                  type="button"
                  className={`inline-flex items-center gap-1.5 text-xs transition-colors ${backLink}`}
                  onClick={() => { setView("auth"); setResetError(null); }}
                  data-testid="link-back-to-signin"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Back to sign in
                </button>
              </div>
            </div>
          )}

          {/* ── Reset link sent confirmation ── */}
          {view === "forgot-sent" && (
            <div className="space-y-5 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <div className="space-y-1.5">
                <h2 className={`text-xl font-semibold ${heading}`}>Check your email</h2>
                <p className={`text-sm ${sub}`}>
                  We sent a password reset link to{" "}
                  <span className={`font-medium ${bodyText}`}>{resetEmail}</span>.
                  The link expires in 24 hours.
                </p>
              </div>
              <button
                type="button"
                className={`inline-flex items-center gap-1.5 text-xs transition-colors ${backLink}`}
                onClick={() => { setView("auth"); setResetEmail(""); }}
                data-testid="link-back-to-signin-from-sent"
              >
                <ArrowLeft className="w-3 h-3" />
                Back to sign in
              </button>
            </div>
          )}

          {/* ── Set new password (PASSWORD_RECOVERY event) ── */}
          {view === "set-password" && (
            <div className="space-y-5">
              <div className="space-y-1">
                <h1 className={`text-2xl font-semibold ${heading}`}>Set new password</h1>
                <p className={`text-sm ${sub}`}>Choose a strong password for your account.</p>
              </div>
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div className={`${inputBase} ${inputBorder}`}>
                  <svg width="13" height="17" viewBox="0 0 13 17" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                    <path d="M13 8.5c0-.938-.729-1.7-1.625-1.7h-.812V4.25C10.563 1.907 8.74 0 6.5 0S2.438 1.907 2.438 4.25V6.8h-.813C.729 6.8 0 7.562 0 8.5v6.8c0 .938.729 1.7 1.625 1.7h9.75c.896 0 1.625-.762 1.625-1.7zM4.063 4.25c0-1.406 1.093-2.55 2.437-2.55s2.438 1.144 2.438 2.55V6.8H4.061z" fill={inputIconColor}/>
                  </svg>
                  <input
                    type="password"
                    placeholder="New password (min. 8 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    autoFocus
                    data-testid="input-new-password"
                    className={`bg-transparent outline-none text-sm w-full h-full ${inputText}`}
                  />
                </div>
                <div className={`${inputBase} ${inputBorder}`}>
                  <svg width="13" height="17" viewBox="0 0 13 17" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                    <path d="M13 8.5c0-.938-.729-1.7-1.625-1.7h-.812V4.25C10.563 1.907 8.74 0 6.5 0S2.438 1.907 2.438 4.25V6.8h-.813C.729 6.8 0 7.562 0 8.5v6.8c0 .938.729 1.7 1.625 1.7h9.75c.896 0 1.625-.762 1.625-1.7zM4.063 4.25c0-1.406 1.093-2.55 2.437-2.55s2.438 1.144 2.438 2.55V6.8H4.061z" fill={inputIconColor}/>
                  </svg>
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    data-testid="input-confirm-password"
                    className={`bg-transparent outline-none text-sm w-full h-full ${inputText}`}
                  />
                </div>
                {setPasswordError && (
                  <p className="text-sm text-red-500 dark:text-red-400" data-testid="text-set-password-error">{setPasswordError}</p>
                )}
                <button
                  type="submit"
                  disabled={setPasswordLoading}
                  data-testid="button-set-password"
                  className="w-full h-11 rounded-full text-white font-medium text-sm bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {setPasswordLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Set new password
                </button>
              </form>
              <p className={`text-xs text-center ${mutedText}`}>
                You'll be signed in automatically after setting your password.
              </p>
            </div>
          )}

          {/* ── Role picker (Google OAuth new user) ── */}
          {view === "pick-role" && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h1 className={`text-2xl font-semibold ${heading}`}>One more step</h1>
                <p className={`text-sm ${sub}`}>
                  How will you use EdenRadar? Choose the portal that best describes you.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: "industry"   as const, label: "Industry",   active: "border-emerald-500/55 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
                  { value: "researcher" as const, label: "Researcher", active: "border-violet-500/55 bg-violet-500/12 text-violet-600 dark:text-violet-400"   },
                  { value: "concept"    as const, label: "Concept",    active: "border-amber-500/55 bg-amber-500/12 text-amber-600 dark:text-amber-400"        },
                ]).map(({ value, label, active }) => (
                  <button
                    key={value}
                    type="button"
                    disabled={pickRoleLoading}
                    className={`p-2.5 rounded-lg border text-xs font-medium transition-all disabled:opacity-60 ${selectedRole === value ? active : roleOff}`}
                    onClick={() => setSelectedRole(value)}
                    data-testid={`pick-role-${value}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {pickRoleError && (
                <p className="text-sm text-red-500 dark:text-red-400" data-testid="text-pick-role-error">{pickRoleError}</p>
              )}
              <button
                type="button"
                disabled={pickRoleLoading}
                onClick={() => handlePickRole(selectedRole)}
                data-testid="button-confirm-role"
                className="w-full h-11 rounded-full text-white font-medium text-sm bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {pickRoleLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Continue to EdenRadar
              </button>
            </div>
          )}

          {/* ── Normal sign in / sign up ── */}
          {view === "auth" && (
            <>
              {/* Heading */}
              <div className="text-center space-y-1">
                <h1 className={`text-3xl font-semibold ${heading}`}>
                  {mode === "signin" ? "Sign in" : "Create account"}
                </h1>
                <p className={`text-sm ${sub}`}>
                  {mode === "signin"
                    ? "Welcome back! Please sign in to continue"
                    : "Sign up for an EdenRadar account"}
                </p>
              </div>

              {/* Mode toggle */}
              <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: tabBorder }}>
                {(["signin", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === m ? "bg-emerald-600 text-white" : `bg-transparent ${tabOff}`}`}
                    onClick={() => { setMode(m); setError(null); setTosAccepted(false); }}
                    data-testid={`tab-${m}`}
                  >
                    {m === "signin" ? "Sign In" : "Sign Up"}
                  </button>
                ))}
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Email */}
                <div className={`${inputBase} ${inputBorder}`}>
                  <svg width="16" height="11" viewBox="0 0 16 11" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                    <path fillRule="evenodd" clipRule="evenodd" d="M0 .55.571 0H15.43l.57.55v9.9l-.571.55H.57L0 10.45zm1.143 1.138V9.9h13.714V1.69l-6.503 4.8h-.697zM13.749 1.1H2.25L8 5.356z" fill={inputIconColor}/>
                  </svg>
                  <input
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    data-testid="input-email"
                    className={`bg-transparent outline-none text-sm w-full h-full ${inputText}`}
                  />
                </div>

                {/* Password */}
                <div className={`${inputBase} ${inputBorder}`}>
                  <svg width="13" height="17" viewBox="0 0 13 17" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                    <path d="M13 8.5c0-.938-.729-1.7-1.625-1.7h-.812V4.25C10.563 1.907 8.74 0 6.5 0S2.438 1.907 2.438 4.25V6.8h-.813C.729 6.8 0 7.562 0 8.5v6.8c0 .938.729 1.7 1.625 1.7h9.75c.896 0 1.625-.762 1.625-1.7zM4.063 4.25c0-1.406 1.093-2.55 2.437-2.55s2.438 1.144 2.438 2.55V6.8H4.061z" fill={inputIconColor}/>
                  </svg>
                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    data-testid="input-password"
                    className={`bg-transparent outline-none text-sm w-full h-full ${inputText}`}
                  />
                </div>

                {/* Forgot password link */}
                {mode === "signin" && (
                  <div className="flex justify-end -mt-1">
                    <button
                      type="button"
                      className={`text-xs underline transition-colors ${forgotLink}`}
                      onClick={() => {
                        setResetEmail(email);
                        setResetError(null);
                        setView("forgot");
                      }}
                      data-testid="link-forgot-password"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {/* Role selector (sign up only) */}
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <p className={`text-xs font-medium ${isDark ? "text-white/50" : "text-gray-500"}`}>I am</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: "industry"   as const, label: "Industry",   active: "border-emerald-500/55 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
                        { value: "researcher" as const, label: "Researcher", active: "border-violet-500/55 bg-violet-500/12 text-violet-600 dark:text-violet-400"   },
                        { value: "concept"    as const, label: "Concept",    active: "border-amber-500/55 bg-amber-500/12 text-amber-600 dark:text-amber-400"        },
                      ]).map(({ value, label, active }) => (
                        <button
                          key={value}
                          type="button"
                          className={`p-2.5 rounded-lg border text-xs font-medium transition-all ${selectedRole === value ? active : roleOff}`}
                          onClick={() => setSelectedRole(value)}
                          data-testid={`role-${value}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* TOS checkbox (signup only) */}
                {mode === "signup" && (
                  <label className="flex items-start gap-2.5 cursor-pointer" data-testid="label-tos-accept">
                    <input
                      type="checkbox"
                      checked={tosAccepted}
                      onChange={(e) => setTosAccepted(e.target.checked)}
                      required
                      data-testid="checkbox-tos"
                      className="mt-0.5 h-4 w-4 cursor-pointer accent-emerald-600 shrink-0"
                    />
                    <span className={`text-xs leading-relaxed ${isDark ? "text-white/50" : "text-gray-500"}`}>
                      I agree to the{" "}
                      <a
                        href="/tos"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-emerald-600 hover:text-emerald-500"
                        onClick={(e) => e.stopPropagation()}
                        data-testid="link-tos-signup"
                      >
                        Terms of Service
                      </a>
                      {" "}and{" "}
                      <a
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-emerald-600 hover:text-emerald-500"
                        onClick={(e) => e.stopPropagation()}
                        data-testid="link-privacy-signup"
                      >
                        Privacy Policy
                      </a>
                    </span>
                  </label>
                )}

                {/* Error */}
                {error && (
                  <p className="text-sm text-red-500 dark:text-red-400" data-testid="text-auth-error">{error}</p>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading || (mode === "signup" && !tosAccepted)}
                  data-testid="button-auth-submit"
                  className="w-full h-11 rounded-full text-white font-medium text-sm bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {mode === "signin" ? "Sign In" : "Create Account"}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className={`flex-1 h-px ${dividerLine}`} />
                <span className={`text-xs text-nowrap ${dividerText}`}>or continue with</span>
                <div className={`flex-1 h-px ${dividerLine}`} />
              </div>

              {/* Google button */}
              <button
                type="button"
                onClick={handleGoogle}
                disabled={googleLoading}
                data-testid="button-google-signin"
                className={`w-full h-12 rounded-full flex items-center justify-center gap-3 text-sm font-medium transition-colors disabled:opacity-60 ${googleBtn}`}
              >
                {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
                Continue with Google
              </button>

              {/* Back to home */}
              <div className="text-center pt-1">
                <button
                  type="button"
                  className={`text-xs transition-colors ${backLink}`}
                  onClick={() => navigate("/")}
                  data-testid="link-back-home"
                >
                  Back to home
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
