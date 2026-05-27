import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Download, Database, RefreshCw, AlertTriangle, CheckCircle2, ExternalLink, Zap, Sparkles, Activity, AlertCircle, XCircle, Microscope, Trash2, ClipboardList, Lightbulb, Users, UserPlus, Copy, Check, Inbox, ChevronDown, ChevronRight, ChevronUp, Building2, Clock, PackagePlus, BrainCircuit, PlayCircle, BarChart3, Mic, MicOff, ThumbsUp, ThumbsDown, Bookmark, Layers, Plus, Upload, FileText, Image as ImageIcon, Pencil, BookOpen, X, CreditCard, Server, TrendingUp, Globe, MessageSquare, FlaskConical, Send, Eye, Tag, ArrowUp, ArrowDown, ChevronsUpDown, Square, Key, PowerOff, RotateCcw, ArrowUpCircle, Shield, ShieldCheck, Lock, LogOut, DollarSign, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { PORTAL_CONFIG, ALL_PORTAL_ROLES, getPortalConfig, type PortalRole } from "@shared/portals";
import type { ConceptCard } from "@shared/schema";
import { formatDate, timeAgo, relativeTime, getErrorType, HealthDot, HealthLabel } from "./_shared";
import type { HealthStatus, ErrorType, CollectorHealthRow, SchedulerStatus, ActiveSearchRow, CollectorHealthData, SyncSessionData, SyncStatusResponse } from "./_shared";
import { setImpersonationToken, getImpersonationToken } from "@/lib/queryClient";

interface ImpersonationSessionRow {
  id: number;
  admin_id: string;
  admin_email: string;
  target_user_id: string;
  target_email: string;
  target_role: string | null;
  read_only: boolean;
  started_at: string;
  ended_at: string | null;
  ended_reason: string | null;
  action_count: number;
  last_activity_at: string | null;
}

interface ImpersonationEventRow {
  id: number;
  method: string;
  route: string;
  status_code: number;
  blocked: boolean;
  created_at: string;
}

function ImpersonationTab({ pw }: { pw: string }) {
  const { toast } = useToast();
  const [filter, setFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [readOnly, setReadOnly] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [tokenPresent, setTokenPresent] = useState<boolean>(() => !!getImpersonationToken());

  useEffect(() => {
    const onChange = () => setTokenPresent(!!getImpersonationToken());
    window.addEventListener("eden-impersonation-changed", onChange);
    return () => window.removeEventListener("eden-impersonation-changed", onChange);
  }, []);

  const usersQ = useQuery<{ users: AdminUser[] }>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
    staleTime: 30_000,
    enabled: !!pw,
  });

  const sessionsQ = useQuery<{ sessions: ImpersonationSessionRow[] }>({
    queryKey: ["/api/admin/impersonation/sessions"],
    queryFn: async () => {
      const res = await fetch("/api/admin/impersonation/sessions", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load sessions");
      return res.json();
    },
    refetchInterval: 15_000,
    enabled: !!pw,
  });

  const eventsQ = useQuery<{ events: ImpersonationEventRow[] }>({
    queryKey: ["/api/admin/impersonation/sessions", selectedSessionId, "events"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/impersonation/sessions/${selectedSessionId}/events`, {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) throw new Error("Failed to load events");
      return res.json();
    },
    enabled: !!pw && selectedSessionId !== null,
    refetchInterval: selectedSessionId ? 10_000 : false,
  });

  const startMut = useMutation({
    mutationFn: async (target: AdminUser) => {
      const res = await fetch("/api/admin/impersonation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ targetUserId: target.id, readOnly }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to start impersonation");
      return json as {
        token: string;
        session: {
          id: number;
          targetUserId: string;
          targetEmail: string;
          targetRole: string | null;
          readOnly: boolean;
          startedAt: string;
        };
      };
    },
    onSuccess: (data) => {
      setImpersonationToken(data.token);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/impersonation/sessions"] });
      queryClient.invalidateQueries();
      toast({
        title: "Now acting as " + data.session.targetEmail,
        description: readOnly ? "Read-only — write actions will be blocked." : "Full access — writes will be performed as the target user.",
      });
      // Drop the admin into the target user's app per spec ("View as" → enter
      // the target experience). Pick a landing route based on target role.
      const landing =
        data.session.targetRole === "researcher" ? "/research" :
        data.session.targetRole === "concept" ? "/discovery" :
        data.session.targetRole === "industry" ? "/dashboard" :
        "/dashboard";
      window.setTimeout(() => { window.location.assign(landing); }, 50);
    },
    onError: (err: Error) => {
      toast({ title: "Could not start impersonation", description: err.message, variant: "destructive" });
    },
  });

  const endActiveMut = useMutation({
    mutationFn: async (sessionId: number) => {
      const res = await fetch("/api/admin/impersonation/end", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to end session");
      }
      return res.json();
    },
    onSuccess: () => {
      setImpersonationToken(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/impersonation/sessions"] });
      toast({ title: "Session ended" });
    },
    onError: (err: Error) => {
      toast({ title: "Could not end session", description: err.message, variant: "destructive" });
    },
  });

  const allUsers = usersQ.data?.users ?? [];
  // Build the list of distinct roles for the filter dropdown.
  const availableRoles = Array.from(
    new Set(allUsers.map((u) => u.role).filter((r): r is PortalRole => !!r)),
  ).sort();
  const filteredUsers = allUsers.filter((u) => {
    if (roleFilter !== "all" && (u.role ?? "") !== roleFilter) return false;
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      u.email.toLowerCase().includes(f) ||
      (u.name ?? "").toLowerCase().includes(f) ||
      (u.role ?? "").toLowerCase().includes(f) ||
      u.id.toLowerCase().includes(f)
    );
  });

  const sessions = sessionsQ.data?.sessions ?? [];
  const activeSession = sessions.find((s) => !s.ended_at) ?? null;

  function formatRel(iso: string | null) {
    if (!iso) return "—";
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  return (
    <div className="space-y-6" data-testid="impersonation-tab">
      {activeSession && (
        <div className="border border-amber-500 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-4 flex items-center gap-3" data-testid="active-session-card">
          <Eye className="h-5 w-5 text-amber-600" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-amber-900 dark:text-amber-200">
              Active session — acting as {activeSession.target_email}
            </div>
            <div className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
              {activeSession.read_only ? "Read-only" : "Full access"} · started {formatRel(activeSession.started_at)} · {activeSession.action_count} request{activeSession.action_count === 1 ? "" : "s"}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => endActiveMut.mutate(activeSession.id)}
            disabled={endActiveMut.isPending}
            data-testid="button-end-active-session"
          >
            End session
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User picker */}
        <div className="border border-border rounded-lg bg-card p-4">
          <h3 className="font-semibold text-sm mb-3">Start impersonation</h3>
          <div className="flex items-center gap-2 mb-3">
            <Input
              placeholder="Search by name, email, role, or id…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              data-testid="input-impersonation-search"
            />
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              data-testid="select-role-filter"
            >
              <option value="all">All roles</option>
              {availableRoles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm mb-3 select-none">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
              data-testid="checkbox-readonly"
            />
            <span className="font-medium">Read-only mode</span>
            <span className="text-xs text-muted-foreground">(blocks POST/PATCH/DELETE)</span>
          </label>
          <div className="max-h-[420px] overflow-y-auto border border-border rounded">
            {usersQ.isLoading && (
              <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
              </div>
            )}
            {!usersQ.isLoading && filteredUsers.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">No users match.</div>
            )}
            {filteredUsers.map((u) => {
              // Admin enforcement is server-side only (the server knows the
              // real ADMIN_EMAILS allowlist). The UI never disables rows by
              // domain heuristic; if the target is in fact an admin, the
              // /start endpoint returns 403 and we surface it via toast.
              const disabled = activeSession !== null && activeSession.target_user_id === u.id;
              return (
                <div
                  key={u.id}
                  className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-b-0 hover:bg-muted/50"
                  data-testid={`row-impersonation-user-${u.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" data-testid={`text-impersonation-name-${u.id}`}>
                      {u.name || u.email}
                    </div>
                    <div className="text-xs text-muted-foreground truncate" data-testid={`text-impersonation-email-${u.id}`}>
                      {u.name ? `${u.email} · ` : ""}{u.role ?? "no role"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled || startMut.isPending || !!activeSession}
                    onClick={() => startMut.mutate(u)}
                    data-testid={`button-impersonate-${u.id}`}
                  >
                    {startMut.isPending && startMut.variables?.id === u.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Eye className="h-3 w-3 mr-1" />
                    )}
                    Act as
                  </Button>
                </div>
              );
            })}
          </div>
          {activeSession && (
            <p className="text-xs text-muted-foreground mt-2">
              End the active session above before starting a new one.
            </p>
          )}
          {tokenPresent && !activeSession && (
            <p className="text-xs text-amber-600 mt-2">
              A stale impersonation token is set locally. <button className="underline" onClick={() => { setImpersonationToken(null); queryClient.invalidateQueries(); }}>Clear it</button>.
            </p>
          )}
        </div>

        {/* Session history */}
        <div className="border border-border rounded-lg bg-card p-4">
          <h3 className="font-semibold text-sm mb-3">Recent sessions</h3>
          <div className="max-h-[420px] overflow-y-auto">
            {sessionsQ.isLoading && (
              <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            )}
            {sessions.length === 0 && !sessionsQ.isLoading && (
              <div className="p-4 text-sm text-muted-foreground">No sessions yet.</div>
            )}
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSessionId(s.id)}
                className={`w-full text-left px-3 py-2 border-b border-border last:border-b-0 hover:bg-muted/50 ${
                  selectedSessionId === s.id ? "bg-muted" : ""
                }`}
                data-testid={`row-session-${s.id}`}
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium truncate flex-1">{s.target_email}</span>
                  {!s.ended_at ? (
                    <span className="text-[10px] uppercase font-bold bg-emerald-500 text-white rounded px-1.5 py-0.5">Active</span>
                  ) : (
                    <span className="text-[10px] uppercase font-semibold bg-muted text-muted-foreground rounded px-1.5 py-0.5">Ended</span>
                  )}
                  {s.read_only && (
                    <span className="text-[10px] uppercase font-semibold text-amber-700 bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 rounded px-1.5 py-0.5">RO</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  by {s.admin_email} · {formatRel(s.started_at)} · {s.action_count} req
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Audit events */}
      {selectedSessionId !== null && (
        <div className="border border-border rounded-lg bg-card p-4" data-testid="audit-log-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Audit log — session #{selectedSessionId}</h3>
            <Button size="sm" variant="ghost" onClick={() => setSelectedSessionId(null)}>Close</Button>
          </div>
          <div className="max-h-[360px] overflow-y-auto border border-border rounded">
            {eventsQ.isLoading && (
              <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            )}
            {(eventsQ.data?.events ?? []).length === 0 && !eventsQ.isLoading && (
              <div className="p-4 text-sm text-muted-foreground">No requests recorded yet.</div>
            )}
            <table className="w-full text-xs">
              <tbody>
                {(eventsQ.data?.events ?? []).map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-1.5 font-mono text-muted-foreground w-24">{formatRel(e.created_at)}</td>
                    <td className="px-2 py-1.5 font-mono w-16">{e.method}</td>
                    <td className="px-2 py-1.5 font-mono truncate">{e.route}</td>
                    <td className="px-2 py-1.5 font-mono w-12 text-right">
                      <span className={e.status_code >= 400 ? "text-red-600" : "text-emerald-600"}>{e.status_code}</span>
                    </td>
                    <td className="px-2 py-1.5 w-16 text-right">
                      {e.blocked && <span className="text-[10px] uppercase font-bold text-red-600">Blocked</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


export { ImpersonationTab };
