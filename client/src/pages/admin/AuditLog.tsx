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

interface AdminEventRow {
  id: number;
  admin_user_id: string;
  admin_email: string;
  action: string;
  target_user_id: string | null;
  target_email: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  role_change: "Role changed",
  user_delete: "User deleted",
  impersonation_start: "Impersonation started",
  impersonation_end: "Impersonation ended",
  user_invite: "User invited",
  plan_change: "Plan changed",
  market_access_change: "Market access changed",
};

function AuditLogTab({ pw }: { pw: string }) {
  const { data, isLoading, refetch } = useQuery<{ events: AdminEventRow[] }>({
    queryKey: ["/api/admin/events"],
    queryFn: async () => {
      const res = await fetch("/api/admin/events", {
        headers: { Authorization: `Bearer ${pw}` },
      });
      if (!res.ok) throw new Error("Failed to load audit log");
      return res.json();
    },
    staleTime: 30_000,
  });

  const events = data?.events ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Audit Log</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Immutable record of admin actions: role changes, deletions, impersonation sessions, and invites.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No admin actions recorded yet.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Time</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Admin</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Action</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Target</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(ev.created_at)}
                  </td>
                  <td className="px-4 py-2 text-xs truncate max-w-[160px]" title={ev.admin_email}>
                    {ev.admin_email}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                      ev.action === "user_delete" ? "bg-red-500/10 text-red-600 border-red-500/20" :
                      ev.action.startsWith("impersonation") ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                      "bg-primary/10 text-primary border-primary/20"
                    }`}>
                      {ACTION_LABELS[ev.action] ?? ev.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-[180px]" title={ev.target_email ?? ""}>
                    {ev.target_email ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground font-mono">
                    {ev.payload ? JSON.stringify(ev.payload) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export { AuditLogTab };
