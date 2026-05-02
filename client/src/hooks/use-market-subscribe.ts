import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

type SubscribeOptions = {
  redirectTo?: string;
};

export function useMarketSubscribe() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  async function subscribe(opts: SubscribeOptions = {}) {
    const redirectTo = opts.redirectTo ?? "/market";

    if (!session?.access_token) {
      window.location.href = `/login?redirectTo=${encodeURIComponent(redirectTo)}`;
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/market/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "x-user-id": session.user.id,
        },
      });

      let payload: { url?: string; error?: string } = {};
      try {
        payload = await res.json();
      } catch {
        // non-JSON response
      }

      if (!res.ok || !payload.url) {
        const message =
          payload.error
          || (res.status === 503
            ? "EdenMarket checkout is not yet configured. Please contact support@edenradar.com."
            : `Checkout failed (${res.status}). Please try again or contact support@edenradar.com.`);
        toast({
          title: "Subscription unavailable",
          description: message,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      window.location.href = payload.url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      toast({
        title: "Could not start checkout",
        description: `${message}. Please try again or contact support@edenradar.com.`,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  }

  return { subscribe, isLoading };
}
