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

function DocumentsTab({ pw }: { pw: string }) {
  return (
    <div className="space-y-6 max-w-4xl" data-testid="documents-tab">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2" data-testid="text-section-title">
          <ClipboardList className="h-6 w-6 text-primary" />
          Cloud Export Log
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Audit trail for every Pitch Deck, One-Pager, Dossier, and CSV exported to OneDrive or Google Drive from anywhere in the app. Outbound email templates are no longer generated here — manage them in Gmail templates instead.
        </p>
      </div>
      <ExportLogTable pw={pw} />
    </div>
  );
}

// (removed) The old DocumentsTab body below this comment generated .docx
// outbound BD email templates and uploaded them to OneDrive / Google Drive.
// Replaced by the lightweight wrapper above. Keeping this stub eliminator so

type ExportLogRow = {
  id: number;
  filename: string;
  destination: "onedrive" | "googledrive" | string;
  fileType: string;
  exportedBy: string | null;
  shareUrl: string | null;
  success: boolean;
  errorMessage: string | null;
  exportedAt: string;
};

function ExportLogTable({ pw }: { pw: string }) {
  const { data, isLoading, refetch, isFetching } = useQuery<{ exports: ExportLogRow[] }>({
    queryKey: ["/api/admin/export-log", pw],
    queryFn: async () => {
      const res = await fetch(`/api/admin/export-log?limit=20`, {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) throw new Error("Failed to load export log");
      return res.json();
    },
  });

  const rows = data?.exports ?? [];

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden mt-8" data-testid="export-log-section">
      <div className="px-5 py-3 flex items-center justify-between bg-muted/20 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Recent Cloud Exports
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Last 20 user-triggered exports to OneDrive / Google Drive.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
          data-testid="button-refresh-export-log"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="px-5 py-6 text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-6 text-sm text-muted-foreground" data-testid="text-no-exports">
          No exports yet. Use the "Save to Cloud" button on Pitch Deck, One-Pager, Pipeline Brief, or CSV exports.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/10 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">When</th>
                <th className="px-3 py-2 text-left font-medium">File</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Destination</th>
                <th className="px-3 py-2 text-left font-medium">User</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border" data-testid={`row-export-${r.id}`}>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {new Date(r.exportedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-foreground font-mono text-[11px] max-w-[280px] truncate" title={r.filename}>
                    {r.shareUrl ? (
                      <a href={r.shareUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                        {r.filename} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      r.filename
                    )}
                  </td>
                  <td className="px-3 py-2 uppercase text-muted-foreground text-[10px]">{r.fileType}</td>
                  <td className="px-3 py-2 capitalize">
                    {r.destination === "onedrive" ? "OneDrive" : r.destination === "googledrive" ? "Google Drive" : r.destination}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-[11px] font-mono max-w-[120px] truncate" title={r.exportedBy ?? "anonymous"}>
                    {r.exportedBy ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.success ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> ok
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-destructive" title={r.errorMessage ?? ""}>
                        <AlertTriangle className="h-3 w-3" /> failed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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


export { DocumentsTab };
