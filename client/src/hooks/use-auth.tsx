import { createContext, useContext, useEffect, useState } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getImpersonationToken } from "@/lib/queryClient";

type UserRole = "industry" | "researcher" | "concept" | undefined;

interface ImpersonationState {
  sessionId: number;
  targetUserId: string;
  targetEmail: string;
  targetRole: UserRole;
  readOnly: boolean;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: UserRole;
  /** Original (non-impersonated) role of the signed-in user. */
  realRole: UserRole;
  /** True iff an impersonation session is active for the signed-in admin. */
  isImpersonating: boolean;
  impersonation: ImpersonationState | null;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, role: "industry" | "researcher" | "concept", metadata?: Record<string, string>) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  updateRole: (role: "industry" | "researcher" | "concept") => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isRecoveryUrl(): boolean {
  try {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    return params.get("type") === "recovery";
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(isRecoveryUrl);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!isMounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
      }
      setSession(s);
      setUser(s?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const realRole: UserRole = (user?.user_metadata?.role as UserRole) ?? undefined;

  // ── Impersonation effective identity (Task #736) ──────────────────────────
  // When an admin starts an impersonation session, we polled /api/me/impersonation
  // to learn the target's role/email and override the values exposed by useAuth
  // so role-gated layouts/routes behave as if the admin were the target user.
  const [impersonation, setImpersonation] = useState<ImpersonationState | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function refresh() {
      const token = getImpersonationToken();
      if (!token || !session) {
        if (!cancelled) setImpersonation(null);
        return;
      }
      try {
        const res = await fetch("/api/me/impersonation", {
          headers: { Authorization: `Bearer ${session.access_token}`, "x-impersonation-token": token },
        });
        if (!res.ok) {
          if (!cancelled) setImpersonation(null);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const a = data?.active;
        if (!a) {
          setImpersonation(null);
        } else {
          setImpersonation({
            sessionId: a.id,
            targetUserId: a.targetUserId,
            targetEmail: a.targetEmail,
            targetRole: (a.targetRole as UserRole) ?? undefined,
            readOnly: !!a.readOnly,
          });
        }
      } catch {
        if (!cancelled) setImpersonation(null);
      }
    }

    refresh();
    timer = setInterval(refresh, 30_000);
    function onChange() { refresh(); }
    window.addEventListener("eden-impersonation-changed", onChange);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener("eden-impersonation-changed", onChange);
    };
  }, [session]);

  const role: UserRole = impersonation?.targetRole ?? realRole;
  // Synthesize a User-shaped object so consumers reading user.id/email get the
  // target's identity. Spread the real user so other fields (avatar, etc.) are
  // preserved as a fallback — they're admin-side and not security-sensitive.
  const effectiveUser: User | null = impersonation && user
    ? {
        ...user,
        id: impersonation.targetUserId,
        email: impersonation.targetEmail,
        user_metadata: { ...(user.user_metadata ?? {}), role: impersonation.targetRole },
      }
    : user;

  function clearPasswordRecovery() {
    setIsPasswordRecovery(false);
    const url = new URL(window.location.href);
    if (url.hash) {
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUp(email: string, password: string, role: "industry" | "researcher" | "concept", metadata?: Record<string, string>) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role, ...metadata } },
    });
    return { error: error?.message ?? null };
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login` },
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    sessionStorage.removeItem("edenradar_welcomed");
    const userSpecificKeys = [
      "eden-industry-profile",
      "eden-researcher-profile",
      "edenradar:buyer-profile",
      "edenLastSeenAlerts",
      "eden-alerts-dismissed",
      "eden-alerts-checked-at",
      "eden-orientation-dismissed",
    ];
    userSpecificKeys.forEach((k) => localStorage.removeItem(k));
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }

  async function sendPasswordReset(email: string) {
    // Admins click the email link and land on /admin/reset-password where they
    // set a new password via supabase.auth.updateUser. Non-admin users still
    // complete the flow there (the page just calls updateUser).
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/admin/reset-password`,
    });
    return { error: error?.message ?? null };
  }

  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  }

  async function updateRole(r: "industry" | "researcher" | "concept") {
    const { error } = await supabase.auth.updateUser({ data: { role: r } });
    return { error: error?.message ?? null };
  }

  return (
    <AuthContext.Provider value={{
      user: effectiveUser, session, loading, role,
      realRole, isImpersonating: !!impersonation, impersonation,
      isPasswordRecovery, clearPasswordRecovery,
      signIn, signUp, signInWithGoogle, signOut, sendPasswordReset, updatePassword, updateRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
