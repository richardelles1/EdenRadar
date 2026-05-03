import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase } from "./supabase";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    let message = text || res.statusText;
    try {
      const json = JSON.parse(text);
      if (json.error) message = json.error;
    } catch {}
    throw new Error(message);
  }
}

export const IMPERSONATION_TOKEN_KEY = "eden-impersonation-token";

export function getImpersonationToken(): string | null {
  try {
    return localStorage.getItem(IMPERSONATION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setImpersonationToken(token: string | null) {
  try {
    if (token) localStorage.setItem(IMPERSONATION_TOKEN_KEY, token);
    else localStorage.removeItem(IMPERSONATION_TOKEN_KEY);
  } catch {}
  // Notify listeners (banner, hooks) — storage events don't fire in the same tab.
  try {
    window.dispatchEvent(new CustomEvent("eden-impersonation-changed"));
  } catch {}
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {}
  const imp = getImpersonationToken();
  if (imp) headers["x-impersonation-token"] = imp;
  return headers;
}

// ── Global fetch interceptor for impersonation token (Task #736) ─────────────
// Many places in the client call `fetch` directly without going through
// `apiRequest`/`getAuthHeaders` (e.g. role-specific hooks, ad-hoc admin calls).
// To guarantee that EVERY request to our own API carries the impersonation
// token while a session is active, we patch window.fetch once on module load.
// The Supabase Bearer token is left to the existing per-call setup so this
// interceptor doesn't accidentally leak credentials to third-party origins.
if (typeof window !== "undefined" && !(window as any).__edenImpersonationFetchPatched) {
  (window as any).__edenImpersonationFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const imp = getImpersonationToken();
      if (imp) {
        // Only attach to same-origin /api/* requests — never to third parties.
        let urlStr: string;
        if (typeof input === "string") urlStr = input;
        else if (input instanceof URL) urlStr = input.toString();
        else urlStr = (input as Request).url;
        const isOurApi =
          urlStr.startsWith("/api/") ||
          (urlStr.startsWith(window.location.origin + "/api/"));
        if (isOurApi) {
          const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
          if (!headers.has("x-impersonation-token")) {
            headers.set("x-impersonation-token", imp);
          }
          return originalFetch(input, { ...(init ?? {}), headers });
        }
      }
    } catch {
      // Fall through to the un-modified fetch on any interceptor error.
    }
    return originalFetch(input, init);
  };
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(url, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...authHeaders,
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
      headers: authHeaders,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
