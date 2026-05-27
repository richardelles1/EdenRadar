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
import { QuarantinePanel } from "./AccountCenter";

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingRejectIds, setPendingRejectIds] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  const { data, isLoading } = useQuery<NewArrivalsData>({
    queryKey: ["/api/admin/new-arrivals"],
    queryFn: async () => {
      const res = await fetch("/api/admin/new-arrivals", {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 30000,
    enabled: !!pw,
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      setPendingRejectIds((prev) => new Set(prev).add(id));
      const res = await fetch(`/api/admin/new-arrivals/${id}`, {
        method: "DELETE",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Reject failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/new-arrivals"] });
    },
    onError: (err: Error) => {
      toast({ title: "Reject failed", description: err.message, variant: "destructive" });
    },
    onSettled: (_data, _err, id) => {
      setPendingRejectIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    },
  });

  const pushMutation = useMutation({
    mutationFn: async ({ institution }: { institution?: string }) => {
      const res = await fetch("/api/admin/new-arrivals/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ institution }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Push failed");
      return res.json() as Promise<{ updated: number; message: string }>;
    },
    onSuccess: (result) => {
      toast({ title: result.message });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/new-arrivals"] });
    },
    onError: (err: Error) => {
      toast({ title: "Push failed", description: err.message, variant: "destructive" });
    },
  });

  const quarantineInstitutionMutation = useMutation({
    mutationFn: async (institution: string) => {
      const res = await fetch("/api/admin/indexing-queue/quarantine", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ institution }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Quarantine failed");
      return res.json() as Promise<{ quarantined: number; institution: string }>;
    },
    onSuccess: (d) => {
      toast({ title: "Quarantined", description: `${d.quarantined} row(s) quarantined for ${d.institution}. Review in the Quarantined Batches panel.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/new-arrivals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/indexing-queue/quarantine-summary"] });
    },
    onError: (err: Error) => toast({ title: "Quarantine failed", description: err.message, variant: "destructive" }),
  });

  const toggleExpand = (institution: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(institution)) {
        next.delete(institution);
      } else {
        next.add(institution);
      }
      return next;
    });
  };

  const totalUnindexed = data?.totalUnindexed ?? 0;

  return (
    <div className="space-y-6" data-testid="new-arrivals-panel">
      {/* Quarantine panel — shown when anomalous batches are held */}
      <QuarantinePanel pw={pw} />
      {/* Header row */}
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          onClick={() => pushMutation.mutate({})}
          disabled={pushMutation.isPending || totalUnindexed === 0}
          data-testid="button-push-all-new"
        >
          {pushMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <PackagePlus className="h-4 w-4 mr-2" />
          )}
          Mark all as enriched
        </Button>
      </div>

      {/* Summary banner */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-border rounded-lg p-4 bg-card" data-testid="banner-total-unindexed">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Pending enrichment</p>
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-1">{totalUnindexed}</p>
          </div>
          <div className="border border-border rounded-lg p-4 bg-card" data-testid="banner-institutions">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Institutions</p>
            <p className="text-3xl font-bold text-foreground mt-1">{data?.totalInstitutions ?? 0}</p>
          </div>
        </div>
      )}

      {/* Institution rows */}
      {!isLoading && data && (
        data.groups.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground" data-testid="text-no-arrivals">
            <Inbox className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No assets pending enrichment. Queue is clear.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.groups.map((group) => {
              const isOpen = expanded.has(group.institution);
              return (
                <div
                  key={group.institution}
                  className="border border-border rounded-lg bg-card overflow-hidden"
                  data-testid={`card-institution-${group.institution}`}
                >
                  {/* Institution header */}
                  <div className="flex items-center justify-between px-4 py-3 gap-3">
                    <button
                      className="flex items-center gap-2 min-w-0 flex-1 text-left"
                      onClick={() => toggleExpand(group.institution)}
                      data-testid={`button-expand-${group.institution}`}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm text-foreground truncate">{group.institution}</span>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-full px-2 py-0.5" data-testid={`badge-unindexed-${group.institution}`}>
                        {group.count} pending
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => quarantineInstitutionMutation.mutate(group.institution)}
                        disabled={quarantineInstitutionMutation.isPending || pushMutation.isPending}
                        className="h-7 text-xs text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/30"
                        title="Hold all pending rows for this institution (prevents push until reviewed)"
                        data-testid={`button-quarantine-institution-${group.institution}`}
                      >
                        {quarantineInstitutionMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Hold"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => pushMutation.mutate({ institution: group.institution })}
                        disabled={pushMutation.isPending || quarantineInstitutionMutation.isPending}
                        className="h-7 text-xs"
                        data-testid={`button-push-${group.institution}`}
                      >
                        {pushMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Push"}
                      </Button>
                    </div>
                  </div>

                  {/* Asset list */}
                  {isOpen && (
                    <div className="border-t border-border divide-y divide-border">
                      {group.assets.map((asset) => (
                        <div
                          key={asset.id}
                          className="flex items-center px-4 py-2.5 gap-3"
                          data-testid={`row-asset-${asset.id}`}
                        >
                          <div className="min-w-0 flex-1">
                            {asset.sourceUrl ? (
                              <a
                                href={asset.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-foreground hover:text-primary hover:underline line-clamp-1"
                                data-testid={`link-asset-${asset.id}`}
                              >
                                {asset.assetName}
                              </a>
                            ) : (
                              <span className="text-sm text-foreground line-clamp-1">{asset.assetName}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{formatDate(asset.firstSeenAt)}</span>
                            <button
                              className="ml-1 h-5 w-5 flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                              onClick={() => rejectMutation.mutate(asset.id)}
                              disabled={pendingRejectIds.has(asset.id)}
                              title="Remove from queue"
                              data-testid={`button-reject-${asset.id}`}
                            >
                              {pendingRejectIds.has(asset.id)
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <X className="h-3 w-3" />
                              }
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

// ── EDEN Tab ────────────────────────────────────────────────────────────────

type EdenCoverage = {
  totalRelevant: number;
  deepEnriched: number;
  withMoa: number;
  withInnovationClaim: number;
  withUnmetNeed: number;
  withComparableDrugs: number;
  avgCompletenessScore: number | null;
};

type EdenEmbeddingCoverage = {
  totalRelevant: number;
  totalEmbedded: number;
};

type EnrichBreakdown = {
  fresh: number;
  legacy: number;
  lowQualityRetry: number;
  nullCategory?: number;
  total: number;
};

type EdenStatsResponse = {
  coverage: EdenCoverage;
  embeddingCoverage: EdenEmbeddingCoverage;
  latestJob: { id: number; total: number; processed: number; status: string; startedAt: string; completedAt: string | null } | null;
  needingDeepEnrich?: number;
  breakdown?: EnrichBreakdown;
  live: { processed: number; total: number } | null;
};

type EdenStatusResponse = {
  running: boolean;
  processed: number;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  job: { id: number; total: number; processed: number; improved: number; status: string; startedAt: string; completedAt: string | null } | null;
  staleJobDetected: boolean;
  staleJobId: number | null;
};

type EdenEmbedStatusResponse = {
  running: boolean;
  processed: number;
  total: number;
  succeeded: number;
  failed: number;
};

export { NewArrivals };
