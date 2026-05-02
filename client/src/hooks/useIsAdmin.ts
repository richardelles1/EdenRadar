import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getAuthHeaders } from "@/lib/queryClient";

export interface AdminWhoAmI {
  id: string;
  email: string;
  isAdmin: true;
}

/**
 * Resolves whether the current Supabase-authenticated user is an admin
 * (their email is on the server's ADMIN_EMAILS allowlist). Calls
 * GET /api/admin/whoami once per session and caches the result.
 */
export function useIsAdmin() {
  const { user, loading: authLoading } = useAuth();

  // Cache key is scoped to the current Supabase user id so admin status
  // cannot bleed across accounts (e.g. admin signs out, non-admin signs in
  // on the same browser). When user is null we still emit a stable key.
  const query = useQuery<AdminWhoAmI | null>({
    queryKey: ["/api/admin/whoami", user?.id ?? "anon"],
    enabled: !!user && !authLoading,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/whoami", { headers });
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) throw new Error(`whoami failed: ${res.status}`);
      return (await res.json()) as AdminWhoAmI;
    },
  });

  return {
    isAdmin: !!query.data?.isAdmin,
    adminEmail: query.data?.email ?? null,
    loading: authLoading || query.isLoading,
  };
}
