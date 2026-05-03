import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/lib/supabase";
import { Loader2, ShoppingBag, Lock, ArrowLeft } from "lucide-react";
import { useDocumentMeta } from "@/hooks/use-document-meta";

export default function MarketLogin() {
  useDocumentMeta({ title: "Sign in — EdenMarket | EdenRadar", noindex: true });
  const { signIn, session, loading: authLoading } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [, navigate] = useLocation();

  const _params = new URLSearchParams(window.location.search);
  const _rawRedirect = _params.get("redirect") ?? "";
  const _redirect = _rawRedirect.startsWith("/") && !_rawRedirect.startsWith("//") ? _rawRedirect : "/market";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && session) {
      navigate(_redirect, { replace: true });
    }
  }, [authLoading, session, navigate, _redirect]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(email, password);
    if (err) {
      setError(err);
      setLoading(false);
      return;
    }
    const { data } = await supabase.auth.getUser();
    const ok = !!data.user;
    if (!ok) {
      setError("Sign in failed");
      setLoading(false);
      return;
    }
    // Task #752 — if the buyer has no Market access yet, send them
    // straight into Stripe checkout instead of bouncing through the
    // paywall. Use the freshly-issued session token (useAuth hasn't
    // re-rendered yet at this point).
    if (_rawRedirect.startsWith("/")) {
      navigate(_redirect, { replace: true });
      return;
    }
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (token) {
        const accessRes = await fetch("/api/market/access", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (accessRes.ok) {
          const access = (await accessRes.json()) as { access?: boolean };
          if (!access.access) {
            const co = await fetch("/api/market/checkout", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ redirectTo: "/market" }),
            });
            if (co.ok) {
              const j = (await co.json()) as { url?: string };
              if (j.url) {
                window.location.href = j.url;
                return;
              }
            }
          }
        }
      }
    } catch {
      // fall through to default navigation
    }
    navigate(_redirect, { replace: true });
  }

  const panelBg = isDark ? "hsl(222 47% 5%)" : "#ffffff";
  const heading = isDark ? "text-white" : "text-gray-900";
  const sub = isDark ? "text-white/55" : "text-gray-500";
  const inputBase = "flex items-center w-full h-12 rounded-full overflow-hidden pl-5 pr-4 gap-2.5 transition-colors";
  const inputBorder = isDark
    ? "border border-white/10 bg-white/4 focus-within:border-indigo-500/50"
    : "border border-gray-300/60 bg-transparent focus-within:border-indigo-500/60";
  const inputText = isDark ? "text-white placeholder:text-white/30" : "text-gray-700 placeholder:text-gray-400/80";

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12" style={{ background: panelBg }}>
      <div className="w-full max-w-sm space-y-7">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "hsl(234 80% 58%)" }}>
            <ShoppingBag className="w-6 h-6 text-white" />
          </div>
          <div className="space-y-1">
            <h1 className={`text-2xl font-semibold ${heading}`} data-testid="text-market-login-title">
              Sign in to <span style={{ color: "hsl(234 80% 58%)" }}>EdenMarket</span>
            </h1>
            <p className={`text-sm ${sub}`}>The blind biopharma deal marketplace.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className={`${inputBase} ${inputBorder}`}>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              data-testid="input-market-login-email"
              className={`bg-transparent outline-none text-sm w-full h-full ${inputText}`}
            />
          </div>
          <div className={`${inputBase} ${inputBorder}`}>
            <Lock className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              data-testid="input-market-login-password"
              className={`bg-transparent outline-none text-sm w-full h-full ${inputText}`}
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 dark:text-red-400" data-testid="text-market-login-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            data-testid="button-market-login-submit"
            className="w-full h-11 rounded-full text-white font-medium text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: "hsl(234 80% 58%)" }}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Sign in
          </button>
        </form>

        <div className="text-center text-xs text-muted-foreground space-y-2">
          <p>
            Don't have a buyer account?{" "}
            <Link href="/market/signup" className="font-medium" style={{ color: "hsl(234 80% 58%)" }} data-testid="link-market-signup">
              Create one
            </Link>
          </p>
          <p>
            <Link href="/" className="inline-flex items-center gap-1 text-muted-foreground/80 hover:text-foreground" data-testid="link-back-home-market-login">
              <ArrowLeft className="w-3 h-3" /> Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
