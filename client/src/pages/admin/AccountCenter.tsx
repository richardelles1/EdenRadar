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

function AccountCenter({ pw }: { pw: string }) {
  const { toast } = useToast();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<PortalRole>("concept");
  const [copiedRole, setCopiedRole] = useState<string | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deactivateUserId, setDeactivateUserId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ users: AdminUser[] }>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
    staleTime: 30000,
    enabled: !!pw,
  });

  const { data: profilesData } = useQuery<{ profiles: AdminIndustryProfile[] }>({
    queryKey: ["/api/admin/industry-profiles"],
    queryFn: async () => {
      const res = await fetch("/api/admin/industry-profiles", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) return { profiles: [] };
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const industryProfileMap = new Map<string, AdminIndustryProfile>(
    (profilesData?.profiles ?? []).map((p) => [p.userId, p])
  );

  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: PortalRole }) => {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to update role");
      }
      return res.json();
    },
    onMutate: async ({ userId, role }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/admin/users"] });
      const prev = queryClient.getQueryData<{ users: AdminUser[] }>(["/api/admin/users"]);
      queryClient.setQueryData<{ users: AdminUser[] }>(["/api/admin/users"], (old) => {
        if (!old) return old;
        return { users: old.users.map((u) => u.id === userId ? { ...u, role } : u) };
      });
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated" });
    },
    onError: (err: Error, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(["/api/admin/users"], context.prev);
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const [editingEmailUserId, setEditingEmailUserId] = useState<string | null>(null);
  const [editingEmailValue, setEditingEmailValue] = useState("");

  const updateContactEmail = useMutation({
    mutationFn: async ({ userId, contactEmail }: { userId: string; contactEmail: string }) => {
      const res = await fetch(`/api/admin/users/${userId}/email`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ contactEmail }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to update email");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingEmailUserId(null);
      toast({ title: "Contact email updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const updateSubscribed = useMutation({
    mutationFn: async ({ userId, subscribedToDigest }: { userId: string; subscribedToDigest: boolean }) => {
      const res = await fetch(`/api/admin/users/${userId}/subscribed`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ subscribedToDigest }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to update subscription");
      }
      return res.json();
    },
    onMutate: async ({ userId, subscribedToDigest }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/admin/users"] });
      const prev = queryClient.getQueryData<{ users: AdminUser[] }>(["/api/admin/users"]);
      queryClient.setQueryData<{ users: AdminUser[] }>(["/api/admin/users"], (old) => {
        if (!old) return old;
        return { users: old.users.map((u) => u.id === userId ? { ...u, subscribedToDigest } : u) };
      });
      return { prev };
    },
    onSuccess: (_data, { subscribedToDigest }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: subscribedToDigest ? "Subscribed to digest" : "Unsubscribed from digest" });
    },
    onError: (err: Error, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(["/api/admin/users"], context.prev);
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const updateMarketAccess = useMutation({
    mutationFn: async ({ userId, active }: { userId: string; active: boolean }) => {
      const res = await fetch(`/api/admin/users/${userId}/market-access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to update market access");
      }
      return res.json();
    },
    onMutate: async ({ userId, active }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/admin/users"] });
      const prev = queryClient.getQueryData<{ users: AdminUser[] }>(["/api/admin/users"]);
      queryClient.setQueryData<{ users: AdminUser[] }>(["/api/admin/users"], (old) => {
        if (!old) return old;
        return {
          users: old.users.map((u) =>
            u.id === userId
              ? { ...u, marketEntitlement: { active, source: "admin", grantedAt: new Date().toISOString() } }
              : u,
          ),
        };
      });
      return { prev };
    },
    onSuccess: (_d, { active }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: active ? "Market access granted" : "Market access revoked" });
    },
    onError: (err: Error, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(["/api/admin/users"], context.prev);
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/members/${userId}`, {
        method: "DELETE",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to delete user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setDeleteUserId(null);
      toast({ title: "Account deleted", description: "The user has been permanently removed." });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const setStatusMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: "active" | "deactivated" }) => {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to update status");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setDeactivateUserId(null);
      toast({
        title: variables.status === "deactivated" ? "Account deactivated" : "Account reactivated",
        description: variables.status === "deactivated"
          ? "The user is blocked from logging in. Their data is preserved."
          : "The user can log in again.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Status update failed", description: err.message, variant: "destructive" });
    },
  });

  const inviteUser = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ email: inviteEmail, password: invitePassword, role: inviteRole }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User created", description: `${inviteEmail} added as ${PORTAL_CONFIG[inviteRole].label}` });
      setShowInvite(false);
      setInviteEmail("");
      setInvitePassword("");
      setInviteRole("concept");
    },
    onError: (err: Error) => {
      toast({ title: "Invite failed", description: err.message, variant: "destructive" });
    },
  });

  const users = data?.users ?? [];

  const portalCounts: Record<string, number> = {};
  let unassignedCount = 0;
  let subscriberCount = 0;
  for (const u of users) {
    if (u.role) {
      portalCounts[u.role] = (portalCounts[u.role] ?? 0) + 1;
    } else {
      unassignedCount++;
    }
    if (u.subscribedToDigest) subscriberCount++;
  }

  function copyInviteLink(role: PortalRole) {
    const origin = window.location.origin;
    const cfg = PORTAL_CONFIG[role];
    const emailSuffix = inviteEmail.trim() ? `&email=${encodeURIComponent(inviteEmail.trim())}` : "";
    navigator.clipboard.writeText(`${origin}${cfg.registerPath}${emailSuffix}`);
    setCopiedRole(role);
    setTimeout(() => setCopiedRole(null), 2000);
    toast({ title: "Link copied", description: `Registration link for ${cfg.label} copied to clipboard` });
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function timeAgoShort(iso: string | null) {
    if (!iso) return "Never";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <div className="space-y-6" data-testid="account-center-tab">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-total-users">{users.length}</div>
            <span className="text-sm text-muted-foreground">total users</span>
            <span className="text-xs text-muted-foreground">&bull;</span>
            <div className="text-sm font-semibold tabular-nums text-foreground" data-testid="stat-digest-subscribers">{subscriberCount}</div>
            <span className="text-sm text-muted-foreground">digest subscriber{subscriberCount !== 1 ? "s" : ""}</span>
          </div>
          {unassignedCount > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="text-unassigned-count">
              {unassignedCount} user{unassignedCount !== 1 ? "s" : ""} without a portal assignment
            </p>
          )}
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setShowInvite(true)}
          data-testid="button-invite-user"
        >
          <UserPlus className="w-4 h-4" />
          Invite User
        </Button>
      </div>

      {showInvite && (
        <div className="border border-border rounded-xl bg-card p-5" data-testid="invite-modal">
          <h3 className="font-semibold text-sm text-foreground mb-4">Create New User</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Email</label>
              <Input
                type="email"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                data-testid="input-invite-email"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Password</label>
              <Input
                type="password"
                placeholder="Min 8 characters"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                data-testid="input-invite-password"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Portal</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as PortalRole)}
                data-testid="select-invite-role"
              >
                {ALL_PORTAL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {PORTAL_CONFIG[r].label} (Tier {PORTAL_CONFIG[r].tier})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => inviteUser.mutate()}
              disabled={!inviteEmail || invitePassword.length < 8 || inviteUser.isPending}
              data-testid="button-confirm-invite"
            >
              {inviteUser.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Create User
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowInvite(false); setInviteEmail(""); setInvitePassword(""); }}
              data-testid="button-cancel-invite"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 font-semibold text-foreground">Login Email</th>
                <th className="text-left py-3 px-4 font-semibold text-foreground">Contact Email</th>
                <th className="text-left py-3 px-4 font-semibold text-foreground min-w-[160px]">Portal</th>
                <th className="text-center py-3 px-4 font-semibold text-foreground">Digest</th>
                <th className="text-center py-3 px-4 font-semibold text-foreground">Market</th>
                <th className="text-center py-3 px-4 font-semibold text-foreground">Status</th>
                <th className="text-center py-3 px-4 font-semibold text-foreground">Joined</th>
                <th className="text-center py-3 px-4 font-semibold text-foreground">Last Seen</th>
                <th className="w-16 py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const portal = getPortalConfig(user.role);
                return (
                  <tr key={user.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors" data-testid={`row-user-${user.id}`}>
                    <td className="py-2.5 px-4 text-foreground font-medium text-xs" data-testid={`text-email-${user.id}`}>
                      {user.email}
                    </td>
                    <td className="py-2 px-4" data-testid={`cell-contact-email-${user.id}`}>
                      {editingEmailUserId === user.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="email"
                            value={editingEmailValue}
                            onChange={(e) => setEditingEmailValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") updateContactEmail.mutate({ userId: user.id, contactEmail: editingEmailValue });
                              if (e.key === "Escape") setEditingEmailUserId(null);
                            }}
                            autoFocus
                            className="flex-1 h-7 px-2 text-xs border border-primary/40 rounded bg-background text-foreground focus:outline-none"
                            placeholder="contact@example.com"
                            data-testid={`input-contact-email-${user.id}`}
                          />
                          <button
                            onClick={() => updateContactEmail.mutate({ userId: user.id, contactEmail: editingEmailValue })}
                            className="text-emerald-600 hover:text-emerald-700"
                            disabled={updateContactEmail.isPending}
                            data-testid={`button-save-contact-email-${user.id}`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingEmailUserId(null)}
                            className="text-muted-foreground hover:text-foreground"
                            data-testid={`button-cancel-contact-email-${user.id}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingEmailUserId(user.id); setEditingEmailValue(user.contactEmail ?? ""); }}
                          className="text-xs text-muted-foreground hover:text-foreground group flex items-center gap-1"
                          data-testid={`button-edit-contact-email-${user.id}`}
                        >
                          <span className={user.contactEmail ? "text-foreground" : "italic opacity-50"}>
                            {user.contactEmail || "Set contact email"}
                          </span>
                          <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <select
                          className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                          value={user.role ?? ""}
                          onChange={(e) => {
                            if (e.target.value) {
                              updateRole.mutate({ userId: user.id, role: e.target.value as PortalRole });
                            }
                          }}
                          data-testid={`select-role-${user.id}`}
                        >
                          {!user.role && <option value="">No portal assigned</option>}
                          {ALL_PORTAL_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {PORTAL_CONFIG[r].label} (Tier {PORTAL_CONFIG[r].tier})
                            </option>
                          ))}
                        </select>
                        {portal && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${portal.badgeClass}`} data-testid={`badge-portal-${user.id}`}>
                            {portal.label}
                          </span>
                        )}
                        {!portal && user.role === null && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground" data-testid={`badge-unassigned-${user.id}`}>
                            Unassigned
                          </span>
                        )}
                      </div>
                      {user.role === "industry" && (() => {
                        const ip = industryProfileMap.get(user.id);
                        if (!ip) return null;
                        const interests = [...(ip.therapeuticAreas ?? []), ...(ip.modalities ?? [])].slice(0, 4);
                        if (interests.length === 0 && !ip.companyName) return null;
                        return (
                          <div className="mt-1 flex flex-wrap gap-1" data-testid={`interests-${user.id}`}>
                            {ip.companyName && (
                              <span className="text-[10px] text-muted-foreground italic">{ip.companyName}</span>
                            )}
                            {interests.map((tag) => (
                              <span key={tag} className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                {tag}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="text-center py-2.5 px-4">
                      <input
                        type="checkbox"
                        checked={user.subscribedToDigest}
                        onChange={(e) => updateSubscribed.mutate({ userId: user.id, subscribedToDigest: e.target.checked })}
                        className="w-4 h-4 accent-primary cursor-pointer"
                        title={user.subscribedToDigest ? "Unsubscribe from digest" : "Subscribe to digest"}
                        data-testid={`toggle-digest-${user.id}`}
                      />
                    </td>
                    <td className="text-center py-2.5 px-4">
                      <div className="flex flex-col items-center gap-0.5">
                        <input
                          type="checkbox"
                          checked={user.marketEntitlement?.active === true}
                          onChange={(e) => {
                            // Task #752 — confirm before revoking a Stripe-paying
                            // user's access to avoid accidental clobber while a
                            // subscription is still active.
                            const isRevoke = !e.target.checked;
                            const isStripeSourced = user.marketEntitlement?.source === "stripe";
                            if (isRevoke && isStripeSourced) {
                              const ok = window.confirm(
                                `${user.email ?? "This user"} currently has EdenMarket access via an active Stripe subscription. Revoking here will record an admin override that blocks them immediately, even though Stripe may still be billing. Continue?`,
                              );
                              if (!ok) {
                                e.target.checked = true;
                                return;
                              }
                            }
                            updateMarketAccess.mutate({ userId: user.id, active: e.target.checked });
                          }}
                          className="w-4 h-4 cursor-pointer"
                          style={{ accentColor: "hsl(234 80% 58%)" }}
                          title={user.marketEntitlement?.active ? "Revoke EdenMarket access" : "Grant EdenMarket access"}
                          data-testid={`toggle-market-${user.id}`}
                        />
                        {user.marketEntitlement?.active && user.marketEntitlement.source && (
                          <span className="text-[9px] uppercase tracking-wide text-muted-foreground" data-testid={`text-market-source-${user.id}`}>
                            {user.marketEntitlement.source}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-center py-2.5 px-4">
                      {user.status === "deactivated" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20" data-testid={`badge-status-${user.id}`}>
                          Inactive
                        </span>
                      ) : user.status === "suspended" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20" data-testid={`badge-status-${user.id}`}>
                          Suspended
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" data-testid={`badge-status-${user.id}`}>
                          Active
                        </span>
                      )}
                    </td>
                    <td className="text-center py-2.5 px-4 text-xs text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="text-center py-2.5 px-4 text-xs text-muted-foreground">
                      {timeAgoShort(user.lastSignInAt)}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        {user.status === "deactivated" ? (
                          <button
                            onClick={() => setStatusMutation.mutate({ userId: user.id, status: "active" })}
                            className="text-emerald-600/50 hover:text-emerald-600 hover:bg-emerald-500/10 rounded p-1 transition-colors"
                            title="Reactivate account"
                            data-testid={`button-reactivate-user-${user.id}`}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setDeactivateUserId(user.id)}
                            className="text-amber-500/40 hover:text-amber-500 hover:bg-amber-500/10 rounded p-1 transition-colors"
                            title="Deactivate account (preserves data)"
                            data-testid={`button-deactivate-user-${user.id}`}
                          >
                            <PowerOff className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteUserId(user.id)}
                          className="text-destructive/40 hover:text-destructive hover:bg-destructive/10 rounded p-1 transition-colors"
                          title="Delete account permanently"
                          data-testid={`button-delete-user-${user.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-muted-foreground">No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h3 className="font-semibold text-sm text-foreground mb-3">Portal Directory</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ALL_PORTAL_ROLES.map((role) => {
            const cfg = PORTAL_CONFIG[role];
            const count = portalCounts[role] ?? 0;
            return (
              <div
                key={role}
                className="border border-border rounded-xl bg-card p-4 space-y-3"
                data-testid={`card-portal-${role}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cfg.badgeClass}`}>
                      Tier {cfg.tier}
                    </span>
                    <h4 className="font-semibold text-foreground mt-1">{cfg.label}</h4>
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-foreground" data-testid={`stat-portal-count-${role}`}>
                    {count}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{cfg.description}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs gap-1.5"
                  onClick={() => copyInviteLink(role)}
                  data-testid={`button-copy-link-${role}`}
                >
                  {copiedRole === role ? (
                    <><Check className="w-3 h-3 text-emerald-500" /> Copied!</>
                  ) : (
                    <><Copy className="w-3 h-3" /> Copy invite link</>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <AlertDialog open={deleteUserId !== null} onOpenChange={(o) => { if (!o) setDeleteUserId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the user&apos;s login account and remove them from all organizations. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteUserMutation.isPending}
              onClick={() => deleteUserId && deleteUserMutation.mutate(deleteUserId)}
              data-testid="button-confirm-delete-user"
            >
              {deleteUserMutation.isPending ? "Deleting..." : "Delete Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deactivateUserId !== null} onOpenChange={(o) => { if (!o) setDeactivateUserId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate this account?</AlertDialogTitle>
            <AlertDialogDescription>
              The user will be blocked from logging in immediately. Their data, pipeline lists, and history are preserved and the account can be reactivated at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-500 text-white hover:bg-amber-600"
              disabled={setStatusMutation.isPending}
              onClick={() => deactivateUserId && setStatusMutation.mutate({ userId: deactivateUserId, status: "deactivated" })}
              data-testid="button-confirm-deactivate-user"
            >
              {setStatusMutation.isPending ? "Deactivating..." : "Deactivate Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Quarantine Panel ─────────────────────────────────────────────────────────

type QuarantineSummaryRow = { institution: string; count: number };

function QuarantinePanel({ pw }: { pw: string }) {
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<{ summary: QuarantineSummaryRow[] }>({
    queryKey: ["/api/admin/indexing-queue/quarantine-summary"],
    queryFn: async () => {
      const res = await fetch("/api/admin/indexing-queue/quarantine-summary", {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) throw new Error("Failed to load quarantine summary");
      return res.json();
    },
    staleTime: 30000,
    enabled: !!pw,
  });

  const releaseMutation = useMutation({
    mutationFn: async (institution: string) => {
      const res = await fetch("/api/admin/indexing-queue/release-quarantine", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ institution }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Release failed");
      return res.json() as Promise<{ released: number; institution: string }>;
    },
    onSuccess: (d) => {
      toast({ title: "Released", description: `${d.released} row(s) released for ${d.institution}. Trigger a manual re-sync to classify and push these assets.` });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/new-arrivals"] });
    },
    onError: (err: Error) => toast({ title: "Release failed", description: err.message, variant: "destructive" }),
  });

  const discardMutation = useMutation({
    mutationFn: async (institution: string) => {
      const res = await fetch("/api/admin/indexing-queue/discard-quarantine", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ institution }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Discard failed");
      return res.json() as Promise<{ discarded: number; institution: string }>;
    },
    onSuccess: (d) => {
      toast({ title: "Discarded", description: `${d.discarded} quarantined row(s) permanently discarded for ${d.institution}.` });
      refetch();
    },
    onError: (err: Error) => toast({ title: "Discard failed", description: err.message, variant: "destructive" }),
  });

  if (isLoading || !data || data.summary.length === 0) return null;

  return (
    <div className="border border-orange-200 dark:border-orange-900 rounded-lg bg-orange-50 dark:bg-orange-950/20 p-4 space-y-3" data-testid="quarantine-panel">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
        <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-400">Quarantined Batches</h3>
        <span className="text-xs text-orange-600 dark:text-orange-500 ml-1">Rows held back due to suspected dedup failure. Review and release or discard.</span>
      </div>
      <div className="space-y-2">
        {data.summary.map((row) => (
          <div
            key={row.institution}
            className="flex items-center justify-between bg-white dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-md px-3 py-2 gap-3"
            data-testid={`quarantine-row-${row.institution}`}
          >
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-foreground">{row.institution}</span>
              <span className="ml-2 text-xs text-orange-600 dark:text-orange-400">{row.count} quarantined</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/40"
                onClick={() => releaseMutation.mutate(row.institution)}
                disabled={releaseMutation.isPending || discardMutation.isPending}
                data-testid={`button-release-quarantine-${row.institution}`}
              >
                {releaseMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Release"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => discardMutation.mutate(row.institution)}
                disabled={releaseMutation.isPending || discardMutation.isPending}
                data-testid={`button-discard-quarantine-${row.institution}`}
              >
                {discardMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Discard"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── New Arrivals ─────────────────────────────────────────────────────────────

type NewArrivalAsset = {
  id: number;
  assetName: string;
  firstSeenAt: string;
  sourceUrl: string | null;
};

type NewArrivalGroup = {
  institution: string;
  count: number;
  assets: NewArrivalAsset[];
};

type NewArrivalsData = {
  totalUnindexed: number;
  totalInstitutions: number;
  groups: NewArrivalGroup[];
};

function NewArrivals({ pw }: { pw: string }) {

export { AccountCenter };
