import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Loader2, ShoppingBag, Lock, ArrowLeft } from "lucide-react";
import { useDocumentMeta } from "@/hooks/use-document-meta";

export default function MarketSignup() {
  useDocumentMeta({ title: "Create account — EdenMarket | EdenRadar", noindex: true });
  const { signUp, session, loading: authLoading } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [, navigate] = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tos, setTos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && session) {
      navigate("/market", { replace: true });
    }
  }, [authLoading, session, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // Buyer-only signup: deliberately no portal role assigned. The user lands
    // on /market and the MarketGate paywall lets them subscribe via Stripe,
    // which writes the per-user marketEntitlement back into their metadata.
    // (Cast required because signUp's role param doesn't include "buyer".)
    const { error: err } = await signUp(email, password, null, {
      signupSource: "market",
    });
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    navigate("/market", { replace: true });
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
            <h1 className={`text-2xl font-semibold ${heading}`} data-testid="text-market-signup-title">
              Create your <span style={{ color: "hsl(234 80% 58%)" }}>EdenMarket</span> account
            </h1>
            <p className={`text-sm ${sub}`}>For buyers, sellers and BD/licensing teams.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className={`${inputBase} ${inputBorder}`}>
            <input
              type="email"
              placeholder="Work email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              data-testid="input-market-signup-email"
              className={`bg-transparent outline-none text-sm w-full h-full ${inputText}`}
            />
          </div>
          <div className={`${inputBase} ${inputBorder}`}>
            <Lock className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <input
              type="password"
              placeholder="Password (min. 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              data-testid="input-market-signup-password"
              className={`bg-transparent outline-none text-sm w-full h-full ${inputText}`}
            />
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={tos}
              onChange={(e) => setTos(e.target.checked)}
              required
              data-testid="checkbox-market-signup-tos"
              className="mt-0.5 h-4 w-4 cursor-pointer shrink-0"
              style={{ accentColor: "hsl(234 80% 58%)" }}
            />
            <span>
              I agree to the{" "}
              <a href="/tos" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "hsl(234 80% 58%)" }}>
                Terms of Service
              </a>{" "}and{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "hsl(234 80% 58%)" }}>
                Privacy Policy
              </a>.
            </span>
          </label>

          {error && (
            <p className="text-sm text-red-500 dark:text-red-400" data-testid="text-market-signup-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !tos}
            data-testid="button-market-signup-submit"
            className="w-full h-11 rounded-full text-white font-medium text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: "hsl(234 80% 58%)" }}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Create account
          </button>
        </form>

        <div className="text-center text-xs text-muted-foreground space-y-2">
          <p>
            Already have an account?{" "}
            <Link href="/market/login" className="font-medium" style={{ color: "hsl(234 80% 58%)" }} data-testid="link-market-login">
              Sign in
            </Link>
          </p>
          <p>
            <Link href="/" className="inline-flex items-center gap-1 text-muted-foreground/80 hover:text-foreground" data-testid="link-back-home-market-signup">
              <ArrowLeft className="w-3 h-3" /> Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
