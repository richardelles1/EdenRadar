import React, { useState, useEffect, useRef, type ReactNode } from "react";
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

function IndustryProjectsQueue({ pw }: { pw: string }) {
  const { toast } = useToast();

  type IndustryProject = {
    id: number;
    title: string;
    discoveryTitle: string | null;
    researchArea: string | null;
    status: string;
    adminStatus: string;
    adminNote: string | null;
    publishToIndustry: boolean | null;
    discoverySummary: string | null;
    projectUrl: string | null;
    lastEditedAt: string;
    openForCollaboration: boolean | null;
    developmentStage: string | null;
  };

  const { data, isLoading, refetch } = useQuery<{ projects: IndustryProject[] }>({
    queryKey: ["/api/admin/industry-projects"],
    queryFn: async () => {
      const res = await fetch("/api/admin/industry-projects", {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 0,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, adminStatus, adminNote }: { id: number; adminStatus: string; adminNote?: string | null }) => {
      const res = await fetch(`/api/admin/industry-projects/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ adminStatus, ...(adminNote !== undefined ? { adminNote } : {}) }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: (_, vars) => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/industry/projects"] });
      const label = vars.adminStatus === "published" ? "Published to EdenLab" : vars.adminStatus === "rejected" ? "Rejected" : "Reset to Pending";
      toast({ title: label, description: "Project status updated." });
    },
    onError: () => toast({ title: "Error", description: "Could not update status.", variant: "destructive" }),
  });

  const projects = data?.projects ?? [];
  const pending = projects.filter((p) => p.adminStatus === "pending");
  const published = projects.filter((p) => p.adminStatus === "published");
  const rejected = projects.filter((p) => p.adminStatus === "rejected");

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading projects...</div>;
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground" data-testid="industry-projects-empty">
        <FlaskConical className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-base font-medium">No research projects yet</p>
        <p className="text-sm mt-1">Projects created in the EdenLab research portal will appear here for review.</p>
      </div>
    );
  }

  function ProjectRow({ project }: { project: IndustryProject }) {
    const isPending = project.adminStatus === "pending";
    const isPublished = project.adminStatus === "published";
    const isRejected = project.adminStatus === "rejected";
    const statusBadge = isPublished
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
      : isRejected
      ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
      : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
    const statusLabel = isPublished ? "Published" : isRejected ? "Rejected" : "Pending";
    return (
      <div className="p-4 border-b border-border last:border-0" data-testid={`industry-project-row-${project.id}`}>
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${statusBadge}`} data-testid={`badge-project-status-${project.id}`}>{statusLabel}</span>
              <span className="text-sm font-semibold text-foreground">{project.discoveryTitle || project.title}</span>
              {project.researchArea && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400">{project.researchArea}</span>
              )}
              {project.developmentStage && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{project.developmentStage}</span>
              )}
              {project.openForCollaboration && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Open to Collab</span>
              )}
            </div>
            {project.discoverySummary && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-1">{project.discoverySummary}</p>
            )}
            {project.adminStatus === "rejected" && project.adminNote && (
              <p className="text-[11px] text-red-600 dark:text-red-400 mb-1" data-testid={`text-admin-note-${project.id}`}>
                <span className="font-semibold">Rejection note:</span> {project.adminNote}
              </p>
            )}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="capitalize">{project.status}</span>
              <span>·</span>
              <span>{new Date(project.lastEditedAt).toLocaleDateString()}</span>
              {project.projectUrl && (
                <>
                  <span>·</span>
                  <a href={project.projectUrl} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">Source</a>
                </>
              )}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {isPending && (
              <>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => updateStatus.mutate({ id: project.id, adminStatus: "published" })}
                  disabled={updateStatus.isPending}
                  data-testid={`button-publish-project-${project.id}`}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Publish
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30"
                  onClick={() => {
                    const note = window.prompt("Reason for rejection (shown to the researcher):", "");
                    if (note === null) return;
                    updateStatus.mutate({ id: project.id, adminStatus: "rejected", adminNote: note.trim() || null });
                  }}
                  disabled={updateStatus.isPending}
                  data-testid={`button-reject-project-${project.id}`}
                >
                  <XCircle className="h-3 w-3 mr-1" /> Reject
                </Button>
              </>
            )}
            {isPublished && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => updateStatus.mutate({ id: project.id, adminStatus: "pending" })}
                disabled={updateStatus.isPending}
                data-testid={`button-unpublish-project-${project.id}`}
              >
                <XCircle className="h-3 w-3 mr-1" /> Unpublish
              </Button>
            )}
            {isRejected && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => updateStatus.mutate({ id: project.id, adminStatus: "pending" })}
                disabled={updateStatus.isPending}
                data-testid={`button-restore-project-${project.id}`}
              >
                <RefreshCw className="h-3 w-3 mr-1" /> Restore
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="industry-projects-queue">
      {pending.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-card overflow-hidden" data-testid="section-pending-projects">
          <div className="px-4 py-2.5 border-b border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Pending Review ({pending.length})</span>
          </div>
          {pending.map((p) => <ProjectRow key={p.id} project={p} />)}
        </div>
      )}

      {published.length > 0 && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-card overflow-hidden" data-testid="section-published-projects">
          <div className="px-4 py-2.5 border-b border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Published to EdenLab ({published.length})</span>
          </div>
          {published.map((p) => <ProjectRow key={p.id} project={p} />)}
        </div>
      )}

      {rejected.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden" data-testid="section-rejected-projects">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center gap-2">
            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">Rejected ({rejected.length})</span>
          </div>
          {rejected.map((p) => <ProjectRow key={p.id} project={p} />)}
        </div>
      )}
    </div>
  );
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  let i = 0;
  const len = text.length;

  function parseField(): string {
    if (i < len && text[i] === '"') {
      i++;
      let val = "";
      while (i < len) {
        if (text[i] === '"') {
          i++;
          if (i < len && text[i] === '"') { val += '"'; i++; }
          else break;
        } else {
          val += text[i++];
        }
      }
      return val;
    }
    let val = "";
    while (i < len && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") val += text[i++];
    return val;
  }

  function parseLine(): string[] {
    const fields: string[] = [];
    while (i < len && text[i] !== "\n" && text[i] !== "\r") {
      fields.push(parseField());
      if (i < len && text[i] === ",") i++;
    }
    if (i < len && text[i] === "\r") i++;
    if (i < len && text[i] === "\n") i++;
    return fields;
  }

  const headers = parseLine();
  while (i < len) {
    const line = parseLine();
    if (line.every((f) => f === "")) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = line[idx] ?? ""; });
    rows.push(obj);
  }
  return rows;
}

function PipelineReviewQueue({ pw }: { pw: string }) {
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<{ items: any[] }>({
    queryKey: ["/api/admin/review-queue"],
    queryFn: async () => {
      const res = await fetch("/api/admin/review-queue", {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 0,
  });

  const resolve = useMutation({
    mutationFn: async ({ id, note }: { id: number; note: string }) => {
      const res = await fetch(`/api/admin/review-queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Resolved", description: "Review item resolved." });
    },
  });

  const wipeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/wipe-assets", {
        method: "POST",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) throw new Error("Failed to wipe");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scan-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/review-queue"] });
      toast({ title: "Wiped", description: "All ingested assets have been removed. Run a sync to re-collect." });
    },
    onError: () => toast({ title: "Error", description: "Wipe failed.", variant: "destructive" }),
  });

  const [confirmWipe, setConfirmWipe] = useState(false);
  const [quarantineInstitution, setQuarantineInstitution] = useState("");
  const [quarantineResult, setQuarantineResult] = useState<number | null>(null);

  const quarantineMutation = useMutation({
    mutationFn: async (institution: string) => {
      const res = await fetch("/api/admin/staging/quarantine", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ institution }),
      });
      if (!res.ok) throw new Error("Failed to quarantine");
      return res.json() as Promise<{ ok: boolean; institution: string; quarantined: number }>;
    },
    onSuccess: (data) => {
      setQuarantineResult(data.quarantined);
      toast({ title: "Quarantined", description: `${data.quarantined} false-new row(s) quarantined for ${data.institution}.` });
    },
    onError: () => toast({ title: "Error", description: "Quarantine failed.", variant: "destructive" }),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6" data-testid="pipeline-review-tab">
      <div className="border border-border rounded-xl bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Asset Review Queue</h3>
            <p className="text-sm text-muted-foreground">Ambiguous assets flagged by the pre-filter for manual review</p>
          </div>
          <Badge variant="secondary" data-testid="badge-review-count">{items.length} pending</Badge>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No items pending review</div>
        ) : (
          <div className="space-y-2">
            {items.slice(0, 20).map((item: any) => (
              <div key={item.id} className="flex items-center justify-between p-3 border border-border rounded-lg" data-testid={`review-item-${item.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{item.fingerprint}</div>
                  <div className="text-xs text-muted-foreground">{item.reason}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolve.mutate({ id: item.id, note: "reviewed" })}
                  disabled={resolve.isPending}
                  data-testid={`button-resolve-${item.id}`}
                >
                  Resolve
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-amber-500/30 rounded-xl bg-card p-5">
        <div className="flex items-center gap-3 mb-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Quarantine False-New Rows</h3>
            <p className="text-sm text-muted-foreground">
              When a dedup failure floods the staging queue (e.g., URL-format churn), quarantine marks
              all unpushed <code className="text-xs bg-muted px-1 py-0.5 rounded">is_new=true</code> rows
              for the institution as skipped so they cannot be pushed. Future syncs for the same institution
              will re-detect assets correctly via the updated URL format.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <input
            type="text"
            className="flex-1 max-w-xs border border-border rounded-md px-3 py-1.5 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            placeholder="e.g. UC Berkeley"
            value={quarantineInstitution}
            onChange={(e) => { setQuarantineInstitution(e.target.value); setQuarantineResult(null); }}
            data-testid="input-quarantine-institution"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => quarantineMutation.mutate(quarantineInstitution.trim())}
            disabled={quarantineMutation.isPending || !quarantineInstitution.trim()}
            data-testid="button-quarantine-submit"
            className="border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
          >
            {quarantineMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Quarantine"}
          </Button>
          {quarantineResult !== null && (
            <span className="text-sm text-muted-foreground" data-testid="text-quarantine-result">
              {quarantineResult === 0 ? "No rows to quarantine" : `${quarantineResult} row(s) quarantined`}
            </span>
          )}
        </div>
      </div>

      <div className="border border-destructive/30 rounded-xl bg-card p-5">
        <div className="flex items-center gap-3 mb-3">
          <Trash2 className="h-5 w-5 text-destructive" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">Wipe & Re-collect</h3>
            <p className="text-sm text-muted-foreground">Delete all ingested assets and start fresh. This is irreversible.</p>
          </div>
        </div>

        {!confirmWipe ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmWipe(true)}
            data-testid="button-wipe-start"
          >
            <Trash2 className="h-4 w-4 mr-1" /> Wipe All Assets
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-destructive font-medium">Are you sure? This deletes everything.</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { wipeMutation.mutate(); setConfirmWipe(false); }}
              disabled={wipeMutation.isPending}
              data-testid="button-wipe-confirm"
            >
              {wipeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, Wipe"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmWipe(false)}
              data-testid="button-wipe-cancel"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConceptQueue({ pw }: { pw: string }) {
  const { data, isLoading } = useQuery<{ concepts: ConceptCard[] }>({
    queryKey: ["/api/admin/concepts"],
    queryFn: async () => {
      const res = await fetch("/api/admin/concepts", {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 0,
  });

  const concepts = data?.concepts ?? [];

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading concepts...</div>;
  if (concepts.length === 0) return <p className="text-sm text-muted-foreground">No concept cards submitted yet.</p>;

  return (
    <div className="space-y-3">
      {concepts.map((c) => (
        <div key={c.id} className="border border-border rounded-lg p-4 bg-card" data-testid={`admin-concept-${c.id}`}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-sm">{c.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{c.oneLiner}</p>
            </div>
            {c.credibilityScore !== null && (
              <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                c.credibilityScore >= 70
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : c.credibilityScore >= 40
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              }`}>
                <Sparkles className="w-3 h-3" />
                {c.credibilityScore}/100
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">{c.therapeuticArea}</span>
            <span className="px-2 py-0.5 rounded-full bg-muted font-medium">{c.modality}</span>
            <span className="px-2 py-0.5 rounded-full bg-muted font-medium">Stage {c.stage}</span>
            <span>by {c.submitterName}</span>
            <span className="ml-auto">
            {((c.interestCollaborating ?? 0) + (c.interestFunding ?? 0) + (c.interestAdvising ?? 0))} interest · {new Date(c.createdAt).toLocaleDateString()}
          </span>
          </div>
          {c.credibilityRationale && (
            <p className="text-xs text-muted-foreground italic mt-2 border-t border-border pt-2">AI: {c.credibilityRationale}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function ConceptEscalationQueue({ pw }: { pw: string }) {
  const { toast } = useToast();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data, isLoading, refetch } = useQuery<{ concepts: any[] }>({
    queryKey: ["/api/admin/concept-escalations"],
    queryFn: async () => {
      const res = await fetch("/api/admin/concept-escalations", {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 0,
  });

  const pending = data?.concepts ?? [];

  async function approve(id: number) {
    try {
      const res = await fetch(`/api/admin/concept-escalations/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) throw new Error(await res.text());
      const { projectId } = await res.json();
      toast({ title: "Approved", description: `Research project #${projectId} created in EdenLab.` });
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function reject(id: number) {
    try {
      const res = await fetch(`/api/admin/concept-escalations/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ note: rejectNote }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Rejected" });
      setRejectingId(null);
      setRejectNote("");
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>;
  if (pending.length === 0) return <p className="text-sm text-muted-foreground">No pending graduation requests.</p>;

  return (
    <div className="space-y-3">
      {pending.map((c) => (
        <div key={c.id} className="border border-violet-500/20 rounded-lg p-4 bg-violet-500/5" data-testid={`admin-escalation-${c.id}`}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-violet-600 dark:text-violet-400 font-semibold uppercase tracking-wide mb-0.5">Graduation Request</p>
              <h3 className="font-semibold text-foreground text-sm">{c.title}</h3>
              <p className="text-xs text-muted-foreground">{c.oneLiner}</p>
            </div>
            <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
              (c.credibilityScore ?? 0) >= 70
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : (c.credibilityScore ?? 0) >= 40
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            }`}>
              <Sparkles className="w-3 h-3" />{c.credibilityScore ?? "—"}/100
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-3">
            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">{c.therapeuticArea}</span>
            <span>by {c.submitterName}</span>
            {c.escalationRequestedAt && (
              <span>Requested {new Date(c.escalationRequestedAt).toLocaleDateString()}</span>
            )}
          </div>
          {rejectingId === c.id ? (
            <div className="space-y-2">
              <input
                className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-background"
                placeholder="Rejection note (optional)"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                data-testid={`input-reject-note-${c.id}`}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setRejectingId(null); setRejectNote(""); }}>Cancel</Button>
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white text-xs h-7" onClick={() => reject(c.id)} data-testid={`button-confirm-reject-${c.id}`}>Confirm Reject</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-7 gap-1" onClick={() => approve(c.id)} data-testid={`button-approve-escalation-${c.id}`}>
                <CheckCircle2 className="w-3 h-3" /> Approve → Create Project
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-7 text-red-600 border-red-500/30 hover:bg-red-500/10" onClick={() => setRejectingId(c.id)} data-testid={`button-reject-escalation-${c.id}`}>
                Reject
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ResearchQueue({ pw }: { pw: string }) {
  const { toast } = useToast();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data, isLoading, refetch } = useQuery<{ cards: any[] }>({
    queryKey: ["/api/admin/research-queue"],
    queryFn: async () => {
      const res = await fetch("/api/admin/research-queue", {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 0,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, adminStatus, adminNote }: { id: number; adminStatus: string; adminNote?: string }) => {
      const res = await fetch(`/api/admin/research-queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ adminStatus, adminNote }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: (_, vars) => {
      refetch();
      setRejectingId(null);
      setRejectNote("");
      const label = vars.adminStatus === "approved" ? "Approved" : vars.adminStatus === "rejected" ? "Rejected" : "Revoked";
      toast({ title: `${label}`, description: "Card status updated." });
    },
    onError: () => toast({ title: "Error", description: "Could not update status.", variant: "destructive" }),
  });

  const cards = data?.cards ?? [];
  const pending = cards.filter((c) => c.adminStatus === "pending");
  const approved = cards.filter((c) => c.adminStatus === "approved");
  const rejected = cards.filter((c) => c.adminStatus === "rejected");

  function CardRow({ card, actions }: { card: any; actions: ReactNode }) {
    return (
      <div className="p-4 border-b border-border last:border-0" data-testid={`research-queue-card-${card.id}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-semibold text-foreground">{card.title}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">{card.technologyType}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{card.developmentStage}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{card.ipStatus}</span>
            </div>
            <div className="text-xs text-muted-foreground mb-1.5">
              <span className="font-medium text-foreground">{card.institution}</span>
              {card.lab && <span> · {card.lab}</span>}
              <span className="mx-1">·</span>
              <span>{card.contactEmail}</span>
              <span className="mx-1">·</span>
              <span>{card.seeking}</span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{card.summary}</p>
            {card.adminNote && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Note: {card.adminNote}</p>
            )}
          </div>
          <div className="shrink-0 flex flex-col gap-2">{actions}</div>
        </div>
        {rejectingId === card.id && (
          <div className="mt-3 flex gap-2" data-testid={`reject-note-row-${card.id}`}>
            <input
              className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground placeholder:text-muted-foreground"
              placeholder="Optional rejection note…"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              data-testid={`input-reject-note-${card.id}`}
            />
            <Button
              size="sm"
              variant="destructive"
              className="text-xs"
              onClick={() => updateStatus.mutate({ id: card.id, adminStatus: "rejected", adminNote: rejectNote || undefined })}
              disabled={updateStatus.isPending}
              data-testid={`button-confirm-reject-${card.id}`}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => { setRejectingId(null); setRejectNote(""); }}
              data-testid={`button-cancel-reject-${card.id}`}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    );
  }

  function Panel({ title, count, color, children }: { title: string; count: number; color: string; children: ReactNode }) {
    return (
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{count}</span>
        </div>
        {count === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">No cards here.</p>
        ) : (
          <div>{children}</div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="research-queue-loading">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="research-queue-tab">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-amber-500" data-testid="stat-pending-count">{pending.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Pending Review</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400" data-testid="stat-approved-count">{approved.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Approved · Live in Scout</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-rejected-count">{rejected.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Rejected</div>
        </div>
      </div>

      <Panel title="Pending Review" count={pending.length} color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
        {pending.map((card) => (
          <CardRow
            key={card.id}
            card={card}
            actions={
              <>
                <Button
                  size="sm"
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => updateStatus.mutate({ id: card.id, adminStatus: "approved" })}
                  disabled={updateStatus.isPending}
                  data-testid={`button-approve-${card.id}`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
                  onClick={() => { setRejectingId(card.id); setRejectNote(""); }}
                  disabled={updateStatus.isPending}
                  data-testid={`button-reject-${card.id}`}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                </Button>
              </>
            }
          />
        ))}
      </Panel>

      <Panel title="Approved · Live in Scout" count={approved.length} color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
        {approved.map((card) => (
          <CardRow
            key={card.id}
            card={card}
            actions={
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => updateStatus.mutate({ id: card.id, adminStatus: "pending" })}
                disabled={updateStatus.isPending}
                data-testid={`button-revoke-${card.id}`}
              >
                Revoke
              </Button>
            }
          />
        ))}
      </Panel>

      <Panel title="Rejected" count={rejected.length} color="bg-muted text-muted-foreground">
        {rejected.map((card) => (
          <CardRow
            key={card.id}
            card={card}
            actions={
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => updateStatus.mutate({ id: card.id, adminStatus: "pending" })}
                disabled={updateStatus.isPending}
                data-testid={`button-requeue-${card.id}`}
              >
                Re-queue
              </Button>
            }
          />
        ))}
      </Panel>
    </div>
  );
}

interface AdminUser {
  id: string;
  email: string;
  name?: string | null;
  contactEmail: string | null;
  role: PortalRole | null;
  subscribedToDigest: boolean;
  marketEntitlement?: { active: boolean; source: "admin" | "stripe" | null; grantedAt: string | null } | null;
  status: string;
  createdAt: string;
  lastSignInAt: string | null;
}

export { IndustryProjectsQueue, PipelineReviewQueue, ConceptQueue, ConceptEscalationQueue, ResearchQueue };
