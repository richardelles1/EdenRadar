import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Eye, X, Lock } from "lucide-react";
import { apiRequest, getImpersonationToken, queryClient, setImpersonationToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ActiveSession {
  id: number;
  targetUserId: string;
  targetEmail: string;
  targetRole: string | null;
  readOnly: boolean;
  startedAt: string;
  actionCount: number;
}

export function ImpersonationBanner() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [hasToken, setHasToken] = useState<boolean>(() => !!getImpersonationToken());

  useEffect(() => {
    function onChange() {
      setHasToken(!!getImpersonationToken());
    }
    window.addEventListener("eden-impersonation-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("eden-impersonation-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const { data } = useQuery<{ active: ActiveSession | null }>({
    queryKey: ["/api/me/impersonation", hasToken],
    queryFn: async () => {
      if (!hasToken) return { active: null };
      const res = await apiRequest("GET", "/api/me/impersonation");
      return res.json();
    },
    refetchInterval: hasToken ? 30_000 : false,
    staleTime: 10_000,
  });

  const active = data?.active ?? null;

  // If the server says there's no active session but we still hold a stale
  // token, clear it so writes don't keep failing silently.
  useEffect(() => {
    if (hasToken && data && data.active === null) {
      setImpersonationToken(null);
    }
  }, [hasToken, data]);

  async function exit() {
    if (!active) {
      setImpersonationToken(null);
      return;
    }
    try {
      // End the server session BEFORE clearing the token so the request still
      // carries x-impersonation-token (which loadActiveSessionByToken needs to
      // verify the admin id). The end route ignores the swap and uses x-admin-id.
      await apiRequest("POST", "/api/admin/impersonation/end", { sessionId: active.id });
    } catch (err: any) {
      // Continue regardless — the client-side token is the primary control.
      console.warn("[impersonation] end session failed:", err?.message);
    }
    setImpersonationToken(null);
    queryClient.invalidateQueries();
    toast({ title: "Exited impersonation" });
    // Per spec: exiting returns the admin to /admin.
    navigate("/admin");
  }

  if (!active) return null;

  return (
    <div
      className="sticky top-0 z-[100] w-full bg-amber-500 text-amber-950 border-b border-amber-700 shadow"
      data-testid="impersonation-banner"
    >
      <div className="mx-auto max-w-7xl px-4 py-2 flex items-center gap-3 text-sm font-medium">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="truncate">
          Acting as <span className="font-bold" data-testid="text-impersonation-target">{active.targetEmail}</span>
          {active.targetRole && (
            <span className="ml-1 opacity-80">({active.targetRole})</span>
          )}
        </span>
        {active.readOnly && (
          <span className="inline-flex items-center gap-1 text-xs bg-amber-900/20 px-2 py-0.5 rounded" data-testid="badge-impersonation-readonly">
            <Lock className="h-3 w-3" /> Read-only
          </span>
        )}
        <span className="text-xs opacity-75 hidden sm:inline">
          {active.actionCount} request{active.actionCount === 1 ? "" : "s"}
        </span>
        <button
          onClick={exit}
          className="ml-auto inline-flex items-center gap-1 bg-amber-950 text-amber-50 hover:bg-amber-900 rounded px-3 py-1 text-xs font-semibold"
          data-testid="button-impersonation-exit"
        >
          <X className="h-3 w-3" /> Exit
        </button>
      </div>
    </div>
  );
}
