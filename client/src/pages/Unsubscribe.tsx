import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type Status = "loading" | "success" | "already" | "error";

export default function Unsubscribe() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("t") ?? "";
    if (!token) {
      setStatus("error");
      setErrorMsg("Missing unsubscribe token. Please use the link from the email.");
      return;
    }
    fetch("/api/digest/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.ok) {
          setStatus("error");
          setErrorMsg(body.error ?? "Could not process your unsubscribe request.");
          return;
        }
        setStatus(body.alreadyUnsubscribed ? "already" : "success");
      })
      .catch((err) => {
        setStatus("error");
        setErrorMsg(err?.message ?? "Network error");
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6" data-testid="page-unsubscribe">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center space-y-5">
        {status === "loading" && (
          <>
            <Loader2 className="h-10 w-10 text-muted-foreground mx-auto animate-spin" />
            <h1 className="text-lg font-semibold text-foreground">Processing your request…</h1>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
            <h1 className="text-lg font-semibold text-foreground" data-testid="text-unsubscribe-success">
              You've been unsubscribed.
            </h1>
            <p className="text-sm text-muted-foreground">
              You will no longer receive EdenRadar alert digests at this address. You can re-enable
              digests anytime from your account settings.
            </p>
            <Button onClick={() => navigate("/")} data-testid="button-home">
              Return to EdenRadar
            </Button>
          </>
        )}
        {status === "already" && (
          <>
            <CheckCircle2 className="h-10 w-10 text-muted-foreground mx-auto" />
            <h1 className="text-lg font-semibold text-foreground" data-testid="text-unsubscribe-already">
              You were already unsubscribed.
            </h1>
            <p className="text-sm text-muted-foreground">
              No action needed. You can re-enable digests from your account settings.
            </p>
            <Button onClick={() => navigate("/")} data-testid="button-home">
              Return to EdenRadar
            </Button>
          </>
        )}
        {status === "error" && (
          <>
            <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
            <h1 className="text-lg font-semibold text-foreground" data-testid="text-unsubscribe-error">
              We couldn't unsubscribe you.
            </h1>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <p className="text-xs text-muted-foreground">
              If the problem persists, email{" "}
              <a href="mailto:support@edenradar.com" className="text-primary underline">
                support@edenradar.com
              </a>{" "}
              and we'll remove you manually.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
