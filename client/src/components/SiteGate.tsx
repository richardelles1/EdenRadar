import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock } from "lucide-react";

const SITE_KEY = "eden-access";

export function SiteGate({ children }: { children: React.ReactNode }) {
  const PUBLIC_PATHS = ["/pitch", "/tos", "/privacy", "/pricing"];
  const isPublic = PUBLIC_PATHS.includes(window.location.pathname);
  const [unlocked, setUnlocked] = useState(() => isPublic || localStorage.getItem(SITE_KEY) === "true");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  if (unlocked) return <>{children}</>;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password === "quality") {
      localStorage.setItem(SITE_KEY, "true");
      setUnlocked(true);
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <form
        onSubmit={handleSubmit}
        className={`flex flex-col items-center gap-5 p-8 rounded-xl border border-border bg-card shadow-lg w-full max-w-sm ${shake ? "animate-shake" : ""}`}
        data-testid="site-gate-form"
      >
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Lock className="w-5 h-5 text-primary" />
        </div>
        <div className="text-center space-y-1">
          <h1 className="text-lg font-bold text-foreground">EdenRadar</h1>
          <p className="text-sm text-muted-foreground">Private beta: enter access code</p>
        </div>
        <Input
          type="password"
          placeholder="Access code"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(false); }}
          className={error ? "border-red-500 focus-visible:ring-red-500" : ""}
          autoFocus
          data-testid="input-site-gate-password"
        />
        {error && <p className="text-sm text-red-500 -mt-2">Incorrect access code</p>}
        <Button type="submit" className="w-full" data-testid="button-site-gate-submit">
          Enter
        </Button>
      </form>
    </div>
  );
}
