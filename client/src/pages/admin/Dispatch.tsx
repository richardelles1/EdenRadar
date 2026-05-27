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
import { PipelinePicker, type PipelinePickerPayload } from "@/components/PipelinePicker";
import { type ChatAsset } from "@/hooks/useEdenChat";

function devStageBadgeClass(stage?: string): string {
  if (!stage) return "bg-muted text-muted-foreground border-border";
  const s = stage.toLowerCase();
  if (s.includes("clinical") || s.includes("phase")) return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
  if (s.includes("preclinical") || s.includes("pre-clinical")) return "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20";
  if (s.includes("research") || s.includes("discovery")) return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
  if (s.includes("approved") || s.includes("commercial")) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
  return "bg-muted text-muted-foreground border-border";
}

function modalityBadgeClass(modality?: string): string {
  if (!modality) return "bg-muted text-muted-foreground border-border";
  const m = modality.toLowerCase();
  if (m.includes("antibody") || m.includes("biologic")) return "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20";
  if (m.includes("small molecule") || m.includes("compound")) return "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20";
  if (m.includes("gene") || m.includes("cell") || m.includes("rna") || m.includes("mrna")) return "bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/20";
  if (m.includes("platform") || m.includes("diagnostic") || m.includes("device")) return "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20";
  return "bg-muted text-muted-foreground border-border";
}


function relevanceLabel(similarity: number): { label: string; cls: string } {
  if (similarity >= 0.70) return { label: "Strong", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800" };
  if (similarity >= 0.50) return { label: "Good", cls: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800" };
  return { label: "Relevant", cls: "bg-muted text-muted-foreground border-border" };
}

type PipelineWithCount = { id: number; name: string; assetCount: number };
type PipelinesResponse = { pipelines: PipelineWithCount[]; uncategorisedCount: number };

function CitationCard({ asset, index, savedIngestedIds }: {
  asset: ChatAsset;
  index: number;
  savedIngestedIds: Set<number>;
}) {
  const { label, cls } = relevanceLabel(asset.similarity);
  const isSaved = savedIngestedIds.has(asset.id);

  const pickerPayload: PipelinePickerPayload = {
    asset_name: asset.assetName,
    target: "unknown",
    modality: asset.modality || "unknown",
    development_stage: asset.developmentStage || "unknown",
    disease_indication: asset.indication || "unknown",
    summary: "",
    source_title: asset.assetName,
    source_journal: asset.institution,
    publication_year: "",
    source_name: asset.sourceName || "tto",
    source_url: asset.sourceUrl ?? null,
    ingested_asset_id: asset.id,
  };

  return (
    <div className="rounded-lg border border-border bg-background p-3 flex flex-col gap-1.5" data-testid={`citation-card-${index}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2 flex-1">{asset.assetName}</p>
        <div className="flex items-center gap-1 shrink-0">
          <PipelinePicker payload={pickerPayload} alreadySaved={isSaved} />
          <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${cls}`}>{label}</span>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground truncate">{asset.institution}</p>
      <div className="flex flex-wrap gap-1 mt-0.5">
        {asset.modality && asset.modality !== "unknown" && (
          <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${modalityBadgeClass(asset.modality)}`}>
            {asset.modality.length > 22 ? asset.modality.slice(0, 22) + "…" : asset.modality}
          </span>
        )}
        {asset.developmentStage && asset.developmentStage !== "unknown" && (
          <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${devStageBadgeClass(asset.developmentStage)}`}>
            {asset.developmentStage.length > 18 ? asset.developmentStage.slice(0, 18) + "…" : asset.developmentStage}
          </span>
        )}
        {asset.ipType && (
          <span className="text-[10px] font-medium border rounded px-1.5 py-0.5 bg-muted text-muted-foreground border-border">
            {asset.ipType}
          </span>
        )}
      </div>
      {asset.sourceUrl && (
        <a
          href={asset.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-primary hover:underline flex items-center gap-1 mt-0.5"
          data-testid={`citation-link-${index}`}
        >
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          View source
        </a>
      )}
    </div>
  );
}

type DiscoveryAsset = {
  id: number;
  assetName: string;
  institution: string;
  indication: string;
  modality: string;
  target: string;
  developmentStage: string;
  summary: string | null;
  sourceUrl: string | null;
  firstSeenAt: string;
  previouslySent: boolean;
};

type DispatchLogEntry = {
  id: number;
  sentAt: string;
  subject: string;
  recipients: string[];
  assetIds: number[];
  assetNames: string[];
  assetSourceUrls: string[];
  assetCount: number;
  windowHours: number;
  isTest: boolean;
};

type SubscriberMatchData = {
  userId: string;
  email: string;
  companyName: string;
  therapeuticAreas: string[];
  modalities: string[];
  dealStages: string[];
  totalMatches: number;
  top5AssetIds: number[];
};

type SmartAsset = DiscoveryAsset & {
  score: number;
  matchedFields: string[];
};

function StagePill({ stage }: { stage: string }) {
  const s = stage.toLowerCase();
  let cls = "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
  if (s.includes("phase 3") || s.includes("approved")) cls = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  else if (s.includes("phase 2")) cls = "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  else if (s.includes("phase 1")) cls = "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400";
  else if (s.includes("preclinical")) cls = "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  const label = stage && stage !== "unknown" ? stage.charAt(0).toUpperCase() + stage.slice(1) : "Unknown";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function assetAge(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function DispatchTab({ pw }: { pw: string }) {
  const { toast } = useToast();
  const [windowHours, setWindowHours] = useState(168);
  const [filterInstitutions, setFilterInstitutions] = useState<string[]>([]);
  const [filterModalities, setFilterModalities] = useState<string[]>([]);
  const [filterSearch, setFilterSearch] = useState("");
  const [instDropOpen, setInstDropOpen] = useState(false);
  const [modalDropOpen, setModalDropOpen] = useState(false);
  const [instFilterSearch, setInstFilterSearch] = useState("");
  const instDropRef = useRef<HTMLDivElement>(null);
  const modalDropRef = useRef<HTMLDivElement>(null);
  const [dragOverDigest, setDragOverDigest] = useState(false);
  const [dragDigestIdx, setDragDigestIdx] = useState<number | null>(null);
  const [previewAutoLoading, setPreviewAutoLoading] = useState(false);
  const [historyExpandedId, setHistoryExpandedId] = useState<number | null>(null);
  const [digestAssets, setDigestAssets] = useState<DiscoveryAsset[]>([]);
  const [subject, setSubject] = useState("EdenRadar: {count} new TTO assets from {institution_count} institutions");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [testAddress, setTestAddress] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showInlinePreview, setShowInlinePreview] = useState(false);
  const [colorMode, setColorMode] = useState<"light" | "dark">("light");
  const [showConfirm, setShowConfirm] = useState(false);
  const [isTest, setIsTest] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingSubscribers, setLoadingSubscribers] = useState(false);
  const [dispatchMode, setDispatchMode] = useState<"manual" | "smart">("manual");
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [smartDigests, setSmartDigests] = useState<Record<string, DiscoveryAsset[]>>({});
  const [smartDragOver, setSmartDragOver] = useState(false);
  const [smartDragIdx, setSmartDragIdx] = useState<number | null>(null);
  const [sendingSmartId, setSendingSmartId] = useState<string | null>(null);
  const [sendAllPending, setSendAllPending] = useState(false);
  const [subscriberMgmtOpen, setSubscriberMgmtOpen] = useState(false);
  const [allUsersSearch, setAllUsersSearch] = useState("");
  const [allUsersPage, setAllUsersPage] = useState(1);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [testSubscriberEmail, setTestSubscriberEmail] = useState("");
  const [addingTestSubscriber, setAddingTestSubscriber] = useState(false);
  const [manualWindowInput, setManualWindowInput] = useState("");

  const subscriberCountQuery = useQuery<{ subscribers: { id: string; username: string; effectiveEmail: string }[] }>({
    queryKey: ["/api/admin/dispatch/subscribers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/dispatch/subscribers", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) return { subscribers: [] };
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const windowOptions = [
    { label: "Last 24 hours", value: 24 },
    { label: "Last 48 hours", value: 48 },
    { label: "Last 72 hours", value: 72 },
    { label: "Last 7 days", value: 168 },
    { label: "Last 14 days", value: 336 },
    { label: "Last 30 days", value: 720 },
  ];

  const allInstitutionsQuery = useQuery<{ institutions: string[] }>({
    queryKey: ["/api/admin/all-institutions"],
    queryFn: async () => {
      const r = await fetch("/api/admin/all-institutions", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!r.ok) return { institutions: [] };
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!pw,
  });

  const allUsersQuery = useQuery<{ users: Array<{ id: string; email: string; contactEmail: string | null; subscribedToDigest: boolean; role: string | null }> }>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const r = await fetch("/api/admin/users", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!r.ok) return { users: [] };
      return r.json();
    },
    staleTime: 60 * 1000,
    enabled: !!pw && subscriberMgmtOpen,
  });

  const discoveriesQuery = useQuery<{ assets: DiscoveryAsset[]; windowHours: number }>({
    queryKey: ["/api/admin/new-discoveries", windowHours],
    queryFn: async () => {
      const params = new URLSearchParams({ windowHours: String(windowHours) });
      const r = await fetch(`/api/admin/new-discoveries?${params}`, { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!r.ok) throw new Error("Failed to load discoveries");
      return r.json();
    },
  });

  const historyQuery = useQuery<{ history: DispatchLogEntry[] }>({
    queryKey: ["/api/admin/dispatch/history"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/dispatch/history`, { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!r.ok) throw new Error("Failed to load history");
      return r.json();
    },
    enabled: historyOpen,
  });

  const subscriberMatchesQuery = useQuery<{ subscribers: SubscriberMatchData[]; windowHours: number }>({
    queryKey: ["/api/admin/dispatch/subscriber-matches", windowHours],
    queryFn: async () => {
      const r = await fetch(`/api/admin/dispatch/subscriber-matches?windowHours=${windowHours}`, { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!r.ok) throw new Error("Failed to load subscriber matches");
      return r.json();
    },
    enabled: dispatchMode === "smart" && !!pw,
    staleTime: 2 * 60 * 1000,
  });

  const suggestionsQuery = useQuery<{ assets: SmartAsset[]; windowHours: number }>({
    queryKey: ["/api/admin/dispatch/suggestions", selectedSubId, windowHours],
    queryFn: async () => {
      const r = await fetch(`/api/admin/dispatch/suggestions/${selectedSubId}?windowHours=${windowHours}`, { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!r.ok) throw new Error("Failed to load suggestions");
      return r.json();
    },
    enabled: dispatchMode === "smart" && !!selectedSubId && !!pw,
    staleTime: 2 * 60 * 1000,
  });

  const sendMutation = useMutation({
    mutationFn: async (payload: { isTest: boolean }) => {
      const r = await fetch("/api/admin/dispatch/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({
          subject,
          recipients,
          testAddress: payload.isTest ? testAddress || recipients[0] : undefined,
          assetIds: digestAssets.map((a) => a.id),
          windowHours,
          isTest: payload.isTest,
          colorMode,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Send failed" }));
        throw new Error(err.error ?? "Send failed");
      }
      return r.json();
    },
    onSuccess: (data, payload) => {
      toast({
        title: payload.isTest ? "Test email sent" : "Digest dispatched",
        description: payload.isTest
          ? `Test sent to ${data.sentTo} recipient`
          : `Sent to ${data.sentTo} recipient${data.sentTo !== 1 ? "s" : ""}`,
      });
      setShowConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dispatch/history"] });
      if (!payload.isTest) setDigestAssets([]);
    },
    onError: (err: Error) => {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    },
  });

  const allAssets = discoveriesQuery.data?.assets ?? [];
  const digestIds = new Set(digestAssets.map((a) => a.id));

  const filteredAssets = allAssets.filter((a) => {
    if (digestIds.has(a.id)) return false;
    if (filterSearch && !a.assetName.toLowerCase().includes(filterSearch.toLowerCase()) && !a.indication.toLowerCase().includes(filterSearch.toLowerCase())) return false;
    if (filterInstitutions.length > 0 && !filterInstitutions.includes(a.institution)) return false;
    if (filterModalities.length > 0 && !filterModalities.includes(a.modality ?? "")) return false;
    return true;
  });

  const windowInstCounts = allAssets.reduce<Record<string, number>>((acc, a) => {
    if (a.institution) acc[a.institution] = (acc[a.institution] ?? 0) + 1;
    return acc;
  }, {});
  const institutionOptions = allInstitutionsQuery.data?.institutions ?? Array.from(new Set(allAssets.map((a) => a.institution).filter(Boolean))).sort();
  const modalityOptions = Array.from(new Set(allAssets.map((a) => a.modality).filter((m): m is string => !!m && m !== "unknown"))).sort();
  const visibleInstOptions = instFilterSearch
    ? institutionOptions.filter((n) => n.toLowerCase().includes(instFilterSearch.toLowerCase()))
    : institutionOptions;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (instDropRef.current && !instDropRef.current.contains(e.target as Node)) {
        setInstDropOpen(false);
        setInstFilterSearch("");
      }
      if (modalDropRef.current && !modalDropRef.current.contains(e.target as Node)) {
        setModalDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (digestAssets.length === 0) return;
    const timer = setTimeout(async () => {
      setPreviewAutoLoading(true);
      try {
        const r = await fetch("/api/admin/dispatch/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
          body: JSON.stringify({ subject, assetIds: digestAssets.map((a) => a.id), windowHours, isTest: false, colorMode }),
        });
        if (!r.ok) return;
        const { html } = await r.json();
        setPreviewHtml(html);
        setShowInlinePreview(true);
      } catch {
      } finally {
        setPreviewAutoLoading(false);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [digestAssets, subject, windowHours, colorMode]);

  function insertSubjectToken(token: string) {
    const input = document.querySelector<HTMLInputElement>("[data-testid='input-subject']");
    if (!input) { setSubject((s) => (s + token).slice(0, 200)); return; }
    const start = input.selectionStart ?? subject.length;
    const end = input.selectionEnd ?? subject.length;
    const next = (subject.slice(0, start) + token + subject.slice(end)).slice(0, 200);
    setSubject(next);
    setTimeout(() => { input.focus(); input.setSelectionRange(start + token.length, start + token.length); }, 0);
  }

  function handleDiscoveryDragStart(e: React.DragEvent, asset: DiscoveryAsset) {
    e.dataTransfer.setData("discovery-id", String(asset.id));
    e.dataTransfer.effectAllowed = "copy";
  }
  function handleDigestDragStart(e: React.DragEvent, idx: number) {
    e.dataTransfer.setData("digest-idx", String(idx));
    e.dataTransfer.effectAllowed = "move";
    setDragDigestIdx(idx);
  }
  function handleDigestDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOverDigest(false);
    const discoveryId = e.dataTransfer.getData("discovery-id");
    const fromIdxStr = e.dataTransfer.getData("digest-idx");
    if (discoveryId) {
      const id = Number(discoveryId);
      const asset = allAssets.find((a) => a.id === id);
      if (asset && !digestIds.has(id)) setDigestAssets((prev) => [...prev, asset]);
    } else if (fromIdxStr !== "") {
      const fromIdx = Number(fromIdxStr);
      const toIdx = dragDigestIdx !== null ? dragDigestIdx : digestAssets.length - 1;
      if (fromIdx !== toIdx) {
        setDigestAssets((prev) => {
          const arr = [...prev];
          const [moved] = arr.splice(fromIdx, 1);
          arr.splice(toIdx, 0, moved);
          return arr;
        });
      }
    }
    setDragDigestIdx(null);
  }
  function handleDigestItemDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDragDigestIdx(idx);
  }

  function addToDigest(asset: DiscoveryAsset) {
    setDigestAssets((prev) => [...prev, asset]);
  }

  function removeFromDigest(id: number) {
    setDigestAssets((prev) => prev.filter((a) => a.id !== id));
  }

  function moveUp(index: number) {
    if (index === 0) return;
    setDigestAssets((prev) => {
      const arr = [...prev];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      return arr;
    });
  }

  function moveDown(index: number) {
    setDigestAssets((prev) => {
      if (index >= prev.length - 1) return prev;
      const arr = [...prev];
      [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
      return arr;
    });
  }

  async function loadSubscribers() {
    setLoadingSubscribers(true);
    try {
      const res = await fetch("/api/admin/dispatch/subscribers", {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) throw new Error("Failed to load subscribers");
      const { subscribers } = await res.json() as { subscribers: { id: string; username: string; effectiveEmail: string }[] };
      const newEmails = subscribers.map((s) => s.effectiveEmail).filter(Boolean);
      setRecipients((prev) => {
        const combined = [...prev];
        for (const email of newEmails) {
          if (!combined.includes(email)) combined.push(email);
        }
        return combined;
      });
      toast({
        title: `${newEmails.length} subscriber${newEmails.length !== 1 ? "s" : ""} loaded`,
        description: newEmails.length === 0 ? "No subscribed users found. Subscribe users in Account Center." : `${newEmails.join(", ")}`,
      });
    } catch (err: any) {
      toast({ title: "Failed to load subscribers", description: err.message, variant: "destructive" });
    } finally {
      setLoadingSubscribers(false);
    }
  }

  function addRecipient() {
    const email = recipientInput.trim().toLowerCase();
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(email)) {
      toast({ title: "Invalid email", description: `"${email}" is not a valid email address.`, variant: "destructive" });
      return;
    }
    if (recipients.includes(email)) {
      toast({ title: "Already added", description: `${email} is already in the recipient list.` });
      setRecipientInput("");
      return;
    }
    setRecipients((prev) => [...prev, email]);
    setRecipientInput("");
  }

  async function generatePreview() {
    if (digestAssets.length === 0) {
      toast({ title: "No assets selected", description: "Add at least one asset to the Digest Zone first.", variant: "destructive" });
      return;
    }
    setPreviewLoading(true);
    try {
      const r = await fetch("/api/admin/dispatch/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({
          subject,
          assetIds: digestAssets.map((a) => a.id),
          windowHours,
          isTest: false,
          colorMode,
        }),
      });
      if (!r.ok) throw new Error("Preview failed");
      const { html } = await r.json();
      setPreviewHtml(html);
      setShowInlinePreview(true);
    } catch {
      const windowLabel = windowOptions.find((o) => o.value === windowHours)?.label ?? `${windowHours}h`;
      const html = buildFallbackPreview(subject, digestAssets, windowLabel);
      setPreviewHtml(html);
      setShowInlinePreview(true);
    } finally {
      setPreviewLoading(false);
    }
  }

  function buildFallbackPreview(subj: string, assets: DiscoveryAsset[], windowLabel: string): string {
    const byInst = new Map<string, DiscoveryAsset[]>();
    for (const a of assets) {
      const inst = a.institution || "Unknown";
      if (!byInst.has(inst)) byInst.set(inst, []);
      byInst.get(inst)!.push(a);
    }
    const cards = Array.from(byInst.entries()).map(([inst, items]) => `
      <div style="margin-bottom:20px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;">${inst}</p>
        ${items.map((a) => `
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 18px;margin-bottom:10px;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#111827;">${a.assetName}</p>
            <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">${a.indication !== "unknown" ? a.indication : ""} &bull; ${a.modality !== "unknown" ? a.modality : ""}</p>
            ${a.summary ? `<p style="margin:0;font-size:12px;color:#4b5563;">${a.summary.slice(0, 180)}...</p>` : ""}
            ${a.sourceUrl ? `<a href="${a.sourceUrl}" style="font-size:11px;color:#4f46e5;">View Listing &rarr;</a>` : ""}
          </div>`).join("")}
      </div>`).join("");
    return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px;background:#f3f4f6;">
      <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#1e1b4b,#312e81);padding:24px 28px;">
          <p style="margin:0;color:#fff;font-size:20px;font-weight:800;">EdenRadar</p>
          <p style="margin:4px 0 0;color:#a5b4fc;font-size:13px;">TTO Intelligence Digest &mdash; ${windowLabel}</p>
        </div>
        <div style="padding:24px 28px;">${cards}</div>
        <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 28px;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">&copy; ${new Date().getFullYear()} EdenRadar. All rights reserved.</p>
        </div>
      </div></body></html>`;
  }

  function handleSendClick(test: boolean) {
    if (digestAssets.length === 0) {
      toast({ title: "Digest Zone is empty", description: "Add assets to the Digest Zone before dispatching.", variant: "destructive" });
      return;
    }
    if (!test && recipients.length === 0) {
      toast({ title: "No recipients", description: "Add at least one subscriber email address.", variant: "destructive" });
      return;
    }
    if (test && !testAddress && recipients.length === 0) {
      toast({ title: "No test address", description: "Enter a test send address or add a subscriber.", variant: "destructive" });
      return;
    }
    if (!subject.trim()) {
      toast({ title: "Subject required", description: "Enter a subject line for the digest.", variant: "destructive" });
      return;
    }
    setIsTest(test);
    setShowConfirm(true);
  }

  const windowLabel = windowOptions.find((o) => o.value === windowHours)?.label ?? `${windowHours}h`;

  function getSmartDigest(userId: string): DiscoveryAsset[] {
    return smartDigests[userId] ?? [];
  }

  function addToSmartDigest(userId: string, asset: DiscoveryAsset) {
    setSmartDigests((prev) => ({ ...prev, [userId]: [...(prev[userId] ?? []), asset] }));
  }

  function removeFromSmartDigest(userId: string, assetId: number) {
    setSmartDigests((prev) => ({ ...prev, [userId]: (prev[userId] ?? []).filter((a) => a.id !== assetId) }));
  }

  function addTop5(userId: string) {
    const suggestions = suggestionsQuery.data?.assets ?? [];
    const already = new Set(getSmartDigest(userId).map((a) => a.id));
    const top5 = suggestions.filter((a) => !already.has(a.id)).slice(0, 5);
    setSmartDigests((prev) => ({ ...prev, [userId]: [...(prev[userId] ?? []), ...top5] }));
  }

  async function sendSmartDigest(sub: SubscriberMatchData): Promise<void> {
    const staged = getSmartDigest(sub.userId);
    const r = await fetch("/api/admin/dispatch/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      body: JSON.stringify({
        subject: `EdenRadar: ${staged.length} new TTO asset${staged.length !== 1 ? "s" : ""} matched for you`,
        recipients: [sub.email],
        assetIds: staged.map((a) => a.id),
        windowHours,
        isTest: false,
        colorMode,
      }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: "Send failed" }));
      throw new Error(err.error ?? "Send failed");
    }
    setSmartDigests((prev) => ({ ...prev, [sub.userId]: [] }));
    queryClient.invalidateQueries({ queryKey: ["/api/admin/dispatch/history"] });
  }

  async function sendToSubscriber(sub: SubscriberMatchData) {
    const staged = getSmartDigest(sub.userId);
    if (staged.length === 0) {
      toast({ title: "No assets staged", description: "Add assets to this subscriber's digest zone first.", variant: "destructive" });
      return;
    }
    setSendingSmartId(sub.userId);
    try {
      await sendSmartDigest(sub);
      toast({ title: `Sent to ${sub.email}`, description: `${staged.length} asset${staged.length !== 1 ? "s" : ""} dispatched.` });
    } catch (err: any) {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    } finally {
      setSendingSmartId(null);
    }
  }

  async function sendAllPersonalized() {
    const subs = subscriberMatchesQuery.data?.subscribers ?? [];
    const subsWithDigests = subs.filter((s) => getSmartDigest(s.userId).length > 0);
    if (subsWithDigests.length === 0) {
      toast({ title: "No staged digests", description: "Stage assets for at least one subscriber first.", variant: "destructive" });
      return;
    }
    setSendAllPending(true);
    let sent = 0; let failed = 0;
    for (const sub of subsWithDigests) {
      try { await sendSmartDigest(sub); sent++; } catch { failed++; }
    }
    setSendAllPending(false);
    toast({
      title: failed === 0 ? `${sent} personalized digest${sent !== 1 ? "s" : ""} sent` : `${sent} sent, ${failed} failed`,
      variant: failed > 0 ? "destructive" : "default",
    });
  }

  const selectedSub = (subscriberMatchesQuery.data?.subscribers ?? []).find((s) => s.userId === selectedSubId) ?? null;
  const smartQueueAssets = suggestionsQuery.data?.assets ?? [];
  const smartStagedIds = new Set(getSmartDigest(selectedSubId ?? "").map((a) => a.id));

  return (
    <div className="space-y-0">
      <div className="mb-4">
        <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Dispatch</h2>
        <p className="text-sm text-muted-foreground mt-1">Curate new TTO discoveries into a branded email digest and send to subscriber lists.</p>
      </div>

      <div className="mb-5 flex items-center gap-1 p-1 bg-muted rounded-lg w-fit" data-testid="toggle-dispatch-mode">
        <button
          onClick={() => setDispatchMode("manual")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dispatchMode === "manual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          data-testid="button-mode-manual"
        >
          Manual
        </button>
        <button
          onClick={() => setDispatchMode("smart")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dispatchMode === "smart" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          data-testid="button-mode-smart"
        >
          Smart
        </button>
      </div>

      {dispatchMode === "manual" && <div className="flex gap-4 items-start">

        {/* LEFT: Discovery Browser */}
        <div className="w-80 shrink-0 flex flex-col gap-3">
          <div className="border border-border rounded-xl p-4 bg-card space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">New Discoveries</p>
              {discoveriesQuery.isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {!discoveriesQuery.isLoading && (
                <span className="text-[11px] text-muted-foreground">{allAssets.length} found</span>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1">
                {[{ label: "24h", value: 24 }, { label: "48h", value: 48 }, { label: "7d", value: 168 }, { label: "14d", value: 336 }, { label: "30d", value: 720 }].map((o) => (
                  <button
                    key={o.value}
                    onClick={() => { setWindowHours(o.value); setManualWindowInput(""); setFilterInstitutions([]); setFilterModalities([]); }}
                    className={`h-6 px-2.5 text-[10px] font-medium rounded-full border transition-colors ${windowHours === o.value && !manualWindowInput ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary"}`}
                    data-testid={`button-window-preset-${o.label}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={8760}
                  placeholder="Custom hrs"
                  value={manualWindowInput}
                  onChange={(e) => {
                    setManualWindowInput(e.target.value);
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n) && n >= 1 && n <= 8760) { setWindowHours(n); setFilterInstitutions([]); setFilterModalities([]); }
                  }}
                  className="flex-1 h-6 px-2 text-[10px] border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                  data-testid="input-window-custom-hours"
                />
                <span className="text-[10px] text-muted-foreground shrink-0">hrs</span>
              </div>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Search by name or indication..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setFilterSearch("")}
                className="w-full h-8 px-3 pr-7 text-xs border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                data-testid="input-filter-search"
              />
              {filterSearch && (
                <button
                  onClick={() => setFilterSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  data-testid="button-clear-search"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex gap-2">
              {/* Institution multi-select */}
              <div className="relative flex-1" ref={instDropRef}>
                <button
                  onClick={() => { setInstDropOpen((o) => !o); setModalDropOpen(false); if (!instDropOpen) setInstFilterSearch(""); }}
                  className={`w-full h-7 px-2.5 text-xs border rounded-md bg-background text-left flex items-center justify-between gap-1 ${filterInstitutions.length > 0 ? "border-primary/50 text-primary" : "border-border text-muted-foreground"}`}
                  data-testid="button-filter-institutions"
                >
                  <span className="truncate">{filterInstitutions.length > 0 ? `Inst (${filterInstitutions.length})` : "Institution"}</span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
                {instDropOpen && (
                  <div className="absolute z-30 top-8 left-0 w-64 bg-popover border border-border rounded-lg shadow-lg flex flex-col max-h-64">
                    <div className="p-1.5 border-b border-border shrink-0">
                      <input
                        type="text"
                        placeholder="Search institutions..."
                        value={instFilterSearch}
                        onChange={(e) => setInstFilterSearch(e.target.value)}
                        className="w-full h-6 px-2 text-xs bg-background border border-border rounded focus:outline-none"
                        data-testid="input-inst-search"
                        autoFocus
                      />
                    </div>
                    <div className="overflow-y-auto flex-1 p-1">
                      {discoveriesQuery.isLoading && (
                        <div className="px-2.5 py-3 text-xs text-muted-foreground text-center">Loading...</div>
                      )}
                      {visibleInstOptions.length === 0 && (
                        <div className="px-2.5 py-3 text-xs text-muted-foreground text-center">
                          {instFilterSearch ? `No match for "${instFilterSearch}"` : allInstitutionsQuery.isLoading ? "Loading..." : "No institutions found"}
                        </div>
                      )}
                      {visibleInstOptions.length > 0 && (
                        <>
                          <button onClick={() => setFilterInstitutions([])} className="w-full text-left px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded" data-testid="button-clear-inst-filter">Clear all</button>
                          {visibleInstOptions.map((inst) => {
                            const windowCount = windowInstCounts[inst] ?? 0;
                            return (
                              <label key={inst} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted rounded cursor-pointer">
                                <input type="checkbox" checked={filterInstitutions.includes(inst)} onChange={() => setFilterInstitutions((prev) => prev.includes(inst) ? prev.filter((i) => i !== inst) : [...prev, inst])} className="h-3 w-3 accent-primary" />
                                <span className="text-xs text-foreground truncate flex-1">{inst}</span>
                                {windowCount > 0 && (
                                  <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{windowCount}</span>
                                )}
                              </label>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {/* Modality multi-select */}
              <div className="relative flex-1" ref={modalDropRef}>
                <button
                  onClick={() => { setModalDropOpen((o) => !o); setInstDropOpen(false); }}
                  className={`w-full h-7 px-2.5 text-xs border rounded-md bg-background text-left flex items-center justify-between gap-1 ${filterModalities.length > 0 ? "border-primary/50 text-primary" : "border-border text-muted-foreground"}`}
                  data-testid="button-filter-modalities"
                >
                  <span className="truncate">{filterModalities.length > 0 ? `Mod (${filterModalities.length})` : "Modality"}</span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
                {modalDropOpen && (
                  <div className="absolute z-30 top-8 left-0 w-48 bg-popover border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    <div className="p-1">
                      {discoveriesQuery.isLoading && (
                        <div className="px-2.5 py-3 text-xs text-muted-foreground text-center">Loading...</div>
                      )}
                      {!discoveriesQuery.isLoading && modalityOptions.length === 0 && (
                        <div className="px-2.5 py-3 text-xs text-muted-foreground text-center">No modalities in this window</div>
                      )}
                      {!discoveriesQuery.isLoading && modalityOptions.length > 0 && (
                        <>
                          <button onClick={() => setFilterModalities([])} className="w-full text-left px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded">Clear all</button>
                          {modalityOptions.map((m) => (
                            <label key={m} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted rounded cursor-pointer">
                              <input type="checkbox" checked={filterModalities.includes(m)} onChange={() => setFilterModalities((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m])} className="h-3 w-3 accent-primary" />
                              <span className="text-xs text-foreground">{m.charAt(0).toUpperCase() + m.slice(1)}</span>
                            </label>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {(filterInstitutions.length > 0 || filterModalities.length > 0) && (
              <div className="flex flex-wrap gap-1 items-center">
                {filterInstitutions.map((inst) => (
                  <span key={inst} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                    {inst.length > 18 ? inst.slice(0, 18) + "…" : inst}
                    <button onClick={() => setFilterInstitutions((p) => p.filter((i) => i !== inst))} className="ml-0.5 text-primary/60 hover:text-primary"><X className="h-2.5 w-2.5" /></button>
                  </span>
                ))}
                {filterModalities.map((m) => (
                  <span key={m} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 text-[10px] font-medium">
                    {m}
                    <button onClick={() => setFilterModalities((p) => p.filter((x) => x !== m))} className="ml-0.5 text-violet-500 hover:text-violet-700"><X className="h-2.5 w-2.5" /></button>
                  </span>
                ))}
                <button
                  onClick={() => { setFilterInstitutions([]); setFilterModalities([]); }}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline ml-1"
                  data-testid="button-clear-filter-chips"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          <div className="border border-border rounded-xl bg-card overflow-hidden flex flex-col" style={{ maxHeight: "calc(100vh - 320px)" }}>
            <div className="overflow-y-auto flex-1 divide-y divide-border">
              {discoveriesQuery.isLoading && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                  Loading discoveries...
                </div>
              )}
              {!discoveriesQuery.isLoading && filteredAssets.length === 0 && (
                <div className="p-6 text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {allAssets.length === 0
                      ? "No new assets in this window."
                      : filterSearch
                        ? `No results for "${filterSearch}"`
                        : "No assets match the selected filters."}
                  </p>
                  {(filterSearch || filterInstitutions.length > 0 || filterModalities.length > 0) && (
                    <button
                      onClick={() => { setFilterSearch(""); setFilterInstitutions([]); setFilterModalities([]); }}
                      className="text-xs text-primary hover:underline"
                      data-testid="button-clear-all-filters"
                    >
                      Clear all filters
                    </button>
                  )}
                </div>
              )}
              {(() => {
                const groupMap = new Map<string, typeof filteredAssets>();
                for (const asset of filteredAssets) {
                  const inst = asset.institution || "Unknown";
                  if (!groupMap.has(inst)) groupMap.set(inst, []);
                  groupMap.get(inst)!.push(asset);
                }
                const sortedGroups = Array.from(groupMap.entries())
                  .map(([inst, assets]) => ({ inst, assets }))
                  .sort((a, b) => a.inst.localeCompare(b.inst));
                return sortedGroups.map(({ inst, assets: grpAssets }) => (
                  <div key={inst}>
                    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-border sticky top-0 z-10">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide truncate">{inst}</span>
                      <button
                        onClick={() => {
                          const toAdd = grpAssets.filter((a) => !digestIds.has(a.id));
                          setDigestAssets((prev) => [...prev, ...toAdd]);
                        }}
                        className="shrink-0 text-[9px] text-primary/70 hover:text-primary flex items-center gap-0.5 font-medium"
                        data-testid={`button-add-all-${inst.replace(/\s+/g, "-")}`}
                        title={`Add all ${grpAssets.length} from ${inst}`}
                      >
                        <Plus className="h-2.5 w-2.5" />Add all
                      </button>
                    </div>
                    {grpAssets.map((asset) => (
                      <div
                        key={asset.id}
                        draggable
                        onDragStart={(e) => handleDiscoveryDragStart(e, asset)}
                        className="p-3 hover:bg-muted/40 transition-colors group cursor-grab active:cursor-grabbing"
                        data-testid={`card-discovery-${asset.id}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate leading-snug">{asset.assetName}</p>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className="text-[9px] text-muted-foreground/50">{assetAge(asset.firstSeenAt)}</span>
                              {asset.sourceUrl && (
                                <a href={asset.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] text-primary/60 hover:text-primary" title="View source" onClick={(e) => e.stopPropagation()} data-testid={`link-source-${asset.id}`}>
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              )}
                            </div>
                            {asset.indication && asset.indication !== "unknown" && (
                              <p className="text-[10px] text-muted-foreground/80 truncate mt-0.5">{asset.indication}</p>
                            )}
                            {asset.target && asset.target !== "unknown" && (
                              <p className="text-[10px] text-amber-600/80 dark:text-amber-400/70 truncate font-mono">&#x2192; {asset.target}</p>
                            )}
                            <div className="mt-1 flex flex-wrap gap-1">
                              <StagePill stage={asset.developmentStage} />
                              {asset.modality && asset.modality !== "unknown" && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 text-[9px] font-medium">
                                  {asset.modality.charAt(0).toUpperCase() + asset.modality.slice(1)}
                                </span>
                              )}
                              {asset.previouslySent && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 text-[9px] font-semibold">
                                  <Check className="h-2.5 w-2.5" /> Sent
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => addToDigest(asset)}
                            className="shrink-0 opacity-0 group-hover:opacity-100 h-6 w-6 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white flex items-center justify-center transition-all"
                            data-testid={`button-add-asset-${asset.id}`}
                            title="Add to digest (or drag)"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>

        {/* RIGHT: Compose + Digest Zone */}
        <div className="flex-1 space-y-4">

          {/* Subject Line */}
          <div className="border border-border rounded-xl p-4 bg-card space-y-2">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Subject Line</label>
            <div className="relative">
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value.slice(0, 200))}
                maxLength={200}
                className="w-full h-9 px-3 pr-40 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                data-testid="input-subject"
              />
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] ${subject.length > 60 ? "text-red-500 font-semibold" : subject.length > 55 ? "text-orange-500 font-medium" : "text-muted-foreground"}`}>
                {subject.length}/200 {subject.length > 60 ? "(clients may truncate)" : subject.length > 55 ? "(approaching 60-char limit)" : ""}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground">Insert value:</span>
              {[
                { label: "{count}", hint: `will resolve to: ${digestAssets.length}` },
                { label: "{institution_count}", hint: `will resolve to: ${new Set(digestAssets.map((a) => a.institution)).size}` },
                { label: "{date}", hint: `will resolve to: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` },
              ].map(({ label, hint }) => (
                <button
                  key={label}
                  onClick={() => insertSubjectToken(label)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors font-mono"
                  data-testid={`button-token-${label.replace(/[{}]/g, "")}`}
                  title={hint}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Recipients */}
          <div className="border border-border rounded-xl p-4 bg-card space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Subscriber Recipients</label>
              <Button
                size="sm"
                variant="outline"
                onClick={loadSubscribers}
                disabled={loadingSubscribers}
                className="h-7 px-2.5 text-xs gap-1.5"
                data-testid="button-load-subscribers"
              >
                {loadingSubscribers ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Users className="h-3 w-3" />
                )}
                Load {subscriberCountQuery.data?.subscribers.length ?? 0} subscriber{(subscriberCountQuery.data?.subscribers.length ?? 0) !== 1 ? "s" : ""}
              </Button>
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="subscriber@company.com"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addRecipient(); } }}
                className="flex-1 h-8 px-3 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                data-testid="input-recipient"
              />
              <Button size="sm" variant="outline" onClick={addRecipient} className="h-8 px-3" data-testid="button-add-recipient">
                <Tag className="h-3.5 w-3.5" />
              </Button>
            </div>
            {recipients.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {recipients.map((email) => (
                  <span key={email} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium" data-testid={`tag-recipient-${email}`}>
                    {email}
                    <button onClick={() => setRecipients((prev) => prev.filter((r) => r !== email))} className="text-primary/60 hover:text-primary" data-testid={`button-remove-recipient-${email}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Enter emails and press Enter or comma to add.</p>
            )}
            <div className="border-t border-border pt-3">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wide block mb-1.5">Test Send Address</label>
              <input
                type="email"
                placeholder="your@email.com (for test sends only)"
                value={testAddress}
                onChange={(e) => setTestAddress(e.target.value)}
                className="w-full h-8 px-3 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                data-testid="input-test-address"
              />
              <p className="text-[11px] text-muted-foreground mt-1">When blank, test send uses the first subscriber above.</p>
            </div>
          </div>

          {/* Digest Zone */}
          <div className="border border-border rounded-xl bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Digest Zone</p>
                <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{digestAssets.length} asset{digestAssets.length !== 1 ? "s" : ""}</span>
              </div>
              {digestAssets.length > 0 && (
                <button onClick={() => setDigestAssets([])} className="text-xs text-muted-foreground hover:text-destructive transition-colors" data-testid="button-clear-digest">
                  Clear all
                </button>
              )}
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOverDigest(true); }}
              onDragLeave={() => setDragOverDigest(false)}
              onDrop={handleDigestDrop}
              className={`min-h-[80px] transition-colors ${dragOverDigest ? "bg-primary/5 ring-2 ring-primary/20 ring-inset" : ""}`}
            >
              {digestAssets.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <Send className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p>Drag discoveries here, or click the + button to add.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {digestAssets.map((asset, i) => (
                    <div
                      key={asset.id}
                      draggable
                      onDragStart={(e) => handleDigestDragStart(e, i)}
                      onDragOver={(e) => handleDigestItemDragOver(e, i)}
                      className={`flex items-start gap-3 px-4 py-3 transition-colors cursor-grab active:cursor-grabbing ${dragDigestIdx === i ? "bg-primary/5" : "hover:bg-muted/30"}`}
                      data-testid={`digest-item-${asset.id}`}
                    >
                      <div className="flex flex-col gap-0.5 pt-0.5 text-muted-foreground/40">
                        <ArrowUp className="h-2.5 w-2.5" />
                        <ArrowDown className="h-2.5 w-2.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{asset.assetName}</p>
                        <p className="text-xs text-muted-foreground truncate">{asset.institution}</p>
                        <div className="mt-1 flex gap-1.5 flex-wrap">
                          <StagePill stage={asset.developmentStage} />
                          {asset.modality && asset.modality !== "unknown" && (
                            <span className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 px-2 py-0.5 rounded-full">
                              {asset.modality.charAt(0).toUpperCase() + asset.modality.slice(1)}
                            </span>
                          )}
                          {asset.previouslySent && (
                            <span className="text-[9px] bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 px-1.5 py-0.5 rounded-full font-semibold">
                              Previously sent
                            </span>
                          )}
                        </div>
                        {asset.summary && (
                          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{asset.summary}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        <button onClick={() => moveUp(i)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20" data-testid={`button-move-up-${asset.id}`} title="Move up">
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button onClick={() => moveDown(i)} disabled={i === digestAssets.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20" data-testid={`button-move-down-${asset.id}`} title="Move down">
                          <ArrowDown className="h-3 w-3" />
                        </button>
                        <button onClick={() => removeFromDigest(asset.id)} className="text-muted-foreground hover:text-destructive transition-colors" data-testid={`button-remove-digest-${asset.id}`} title="Remove">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex rounded-md border border-border overflow-hidden text-[11px] font-medium" data-testid="toggle-color-mode-bar">
              <button
                onClick={() => setColorMode("light")}
                className={`px-2.5 py-1.5 transition-colors ${colorMode === "light" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
                data-testid="button-bar-color-mode-light"
                title="Light email theme"
              >
                Light
              </button>
              <button
                onClick={() => setColorMode("dark")}
                className={`px-2.5 py-1.5 transition-colors ${colorMode === "dark" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
                data-testid="button-bar-color-mode-dark"
                title="Dark email theme"
              >
                Dark
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={generatePreview}
              disabled={previewLoading || digestAssets.length === 0}
              className="gap-1.5"
              data-testid="button-generate-preview"
            >
              {(previewLoading || previewAutoLoading) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              {showInlinePreview ? "Refresh Preview" : "Preview Email"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSendClick(true)}
              disabled={sendMutation.isPending || digestAssets.length === 0}
              className="gap-1.5"
              data-testid="button-test-send"
            >
              <Send className="h-3.5 w-3.5" />
              Test Send
            </Button>
            <Button
              size="sm"
              onClick={() => handleSendClick(false)}
              disabled={sendMutation.isPending || digestAssets.length === 0}
              className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
              data-testid="button-dispatch"
            >
              {sendMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Dispatch Digest
            </Button>
            {recipients.length > 0 && (
              <span className="text-xs text-muted-foreground">{recipients.length} recipient{recipients.length !== 1 ? "s" : ""}</span>
            )}
          </div>

          {/* Inline Preview Panel */}
          {showInlinePreview && previewHtml && (
            <div className="border border-border rounded-xl overflow-hidden bg-card" data-testid="panel-email-preview">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5" />
                  Email Preview
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-md border border-border overflow-hidden text-[11px] font-medium" data-testid="toggle-color-mode">
                    <button
                      onClick={() => setColorMode("light")}
                      className={`px-2.5 py-1 transition-colors ${colorMode === "light" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
                      data-testid="button-color-mode-light"
                    >
                      Light
                    </button>
                    <button
                      onClick={() => setColorMode("dark")}
                      className={`px-2.5 py-1 transition-colors ${colorMode === "dark" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
                      data-testid="button-color-mode-dark"
                    >
                      Dark
                    </button>
                  </div>
                  <button onClick={() => setShowInlinePreview(false)} className="text-muted-foreground hover:text-foreground text-xs" data-testid="button-close-preview">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <iframe
                srcDoc={previewHtml}
                title="Email Preview"
                className="w-full border-0"
                style={{ minHeight: "560px" }}
                data-testid="iframe-email-preview"
                sandbox="allow-same-origin"
              />
            </div>
          )}

          {/* Confirm Modal */}
          {showConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="modal-confirm">
              <div className="bg-card rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isTest ? "bg-blue-100 dark:bg-blue-900/30" : "bg-orange-100 dark:bg-orange-900/30"}`}>
                    <Send className={`h-5 w-5 ${isTest ? "text-blue-600" : "text-orange-600"}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{isTest ? "Send test email" : "Dispatch to all recipients"}</p>
                    <p className="text-sm text-muted-foreground">
                      {isTest
                        ? `Will send to ${testAddress || recipients[0] || "—"} only`
                        : `Will send to ${recipients.length} recipient${recipients.length !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-xs text-muted-foreground">
                  <p><span className="font-medium text-foreground">Subject:</span> {isTest ? `[TEST] ${subject}` : subject}</p>
                  <p><span className="font-medium text-foreground">Assets:</span> {digestAssets.length} selected</p>
                  <p><span className="font-medium text-foreground">{isTest ? "Test address" : "Recipients"}:</span> {isTest ? (testAddress || recipients[0] || "—") : recipients.join(", ")}</p>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)} data-testid="button-cancel-confirm">Cancel</Button>
                  <Button
                    size="sm"
                    onClick={() => sendMutation.mutate({ isTest })}
                    disabled={sendMutation.isPending}
                    className={isTest ? "" : "bg-indigo-600 hover:bg-indigo-700 text-white"}
                    data-testid="button-confirm-send"
                  >
                    {sendMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    {isTest ? "Send Test" : "Confirm Dispatch"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>}

      {dispatchMode === "smart" && (
        <div className="flex gap-4 items-start">

          {/* SUBSCRIBER ROSTER */}
          <div className="w-52 shrink-0 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Subscribers</p>
              {subscriberMatchesQuery.isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex flex-wrap gap-1">
              {[{ label: "24h", value: 24 }, { label: "48h", value: 48 }, { label: "7d", value: 168 }, { label: "14d", value: 336 }, { label: "30d", value: 720 }].map((o) => (
                <button
                  key={o.value}
                  onClick={() => { setWindowHours(o.value); setManualWindowInput(""); }}
                  className={`h-6 px-2.5 text-[10px] font-medium rounded-full border transition-colors ${windowHours === o.value && !manualWindowInput ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary"}`}
                  data-testid={`button-smart-window-preset-${o.label}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1.5 max-h-[calc(100vh-260px)] overflow-y-auto pr-0.5">
              {subscriberMatchesQuery.data?.subscribers.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground text-center bg-card border border-border rounded-lg">
                  No subscribers with profiles.<br />Ask subscribers to complete their profile.
                </div>
              )}
              {(subscriberMatchesQuery.data?.subscribers ?? []).map((sub) => (
                <button
                  key={sub.userId}
                  onClick={() => setSelectedSubId(sub.userId)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedSubId === sub.userId ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"}`}
                  data-testid={`sub-card-${sub.userId}`}
                >
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <p className="text-xs font-medium text-foreground truncate">{sub.companyName || sub.email}</p>
                    <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${sub.totalMatches > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                      {sub.totalMatches}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate mb-1">{sub.email}</p>
                  <div className="flex flex-wrap gap-0.5">
                    {[...sub.therapeuticAreas.slice(0, 2), ...sub.modalities.slice(0, 1)].map((tag, i) => (
                      <span key={i} className="text-[9px] px-1 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">{tag}</span>
                    ))}
                    {sub.therapeuticAreas.length + sub.modalities.length > 3 && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">+{sub.therapeuticAreas.length + sub.modalities.length - 3}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Subscriber Management */}
            <div className="border border-border rounded-xl bg-card overflow-hidden">
              <button
                onClick={() => setSubscriberMgmtOpen((o) => !o)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/40 transition-colors"
                data-testid="button-subscriber-mgmt-toggle"
              >
                <span className="flex items-center gap-1.5"><Users className="h-3 w-3 text-muted-foreground" />Manage Subscribers</span>
                <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${subscriberMgmtOpen ? "rotate-180" : ""}`} />
              </button>
              {subscriberMgmtOpen && (
                <div className="border-t border-border p-2 space-y-2">
                  {/* Create test subscriber */}
                  <div className="flex gap-1.5">
                    <input
                      type="email"
                      placeholder="email@company.com"
                      value={testSubscriberEmail}
                      onChange={(e) => setTestSubscriberEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && testSubscriberEmail.trim() && !addingTestSubscriber && (async () => {
                        const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (!emailRx.test(testSubscriberEmail.trim())) { toast({ title: "Invalid email", variant: "destructive" }); return; }
                        setAddingTestSubscriber(true);
                        try {
                          const allUsers = allUsersQuery.data?.users ?? [];
                          const existing = allUsers.find((u) => u.email.toLowerCase() === testSubscriberEmail.trim().toLowerCase());
                          if (existing) {
                            const r = await fetch(`/api/admin/users/${existing.id}/subscribed`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) }, body: JSON.stringify({ subscribedToDigest: true }) });
                            if (!r.ok) throw new Error("Failed");
                          } else {
                            toast({ title: "User not found", description: `${testSubscriberEmail} has no account yet. Ask them to sign up first.`, variant: "destructive" }); return;
                          }
                          queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
                          queryClient.invalidateQueries({ queryKey: ["/api/admin/dispatch/subscribers"] });
                          queryClient.invalidateQueries({ queryKey: ["/api/admin/dispatch/subscriber-matches", windowHours] });
                          toast({ title: "Subscribed", description: `${testSubscriberEmail} added to digest list.` });
                          setTestSubscriberEmail("");
                        } catch { toast({ title: "Error", variant: "destructive" }); } finally { setAddingTestSubscriber(false); }
                      })()}
                      className="flex-1 h-7 px-2.5 text-[10px] border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                      data-testid="input-test-subscriber-email"
                    />
                    <button
                      onClick={async () => {
                        const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (!emailRx.test(testSubscriberEmail.trim())) { toast({ title: "Invalid email", variant: "destructive" }); return; }
                        setAddingTestSubscriber(true);
                        try {
                          const allUsers = allUsersQuery.data?.users ?? [];
                          const existing = allUsers.find((u) => u.email.toLowerCase() === testSubscriberEmail.trim().toLowerCase());
                          if (existing) {
                            const r = await fetch(`/api/admin/users/${existing.id}/subscribed`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) }, body: JSON.stringify({ subscribedToDigest: true }) });
                            if (!r.ok) throw new Error("Failed");
                          } else {
                            toast({ title: "User not found", description: `${testSubscriberEmail} has no account yet.`, variant: "destructive" }); return;
                          }
                          queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
                          queryClient.invalidateQueries({ queryKey: ["/api/admin/dispatch/subscribers"] });
                          queryClient.invalidateQueries({ queryKey: ["/api/admin/dispatch/subscriber-matches", windowHours] });
                          toast({ title: "Subscribed", description: `${testSubscriberEmail} added.` });
                          setTestSubscriberEmail("");
                        } catch { toast({ title: "Error", variant: "destructive" }); } finally { setAddingTestSubscriber(false); }
                      }}
                      disabled={addingTestSubscriber || !testSubscriberEmail.trim()}
                      className="shrink-0 h-7 px-2 text-[9px] font-semibold rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-40 flex items-center gap-0.5"
                      data-testid="button-add-test-subscriber"
                    >
                      {addingTestSubscriber ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Plus className="h-2.5 w-2.5" />}
                      Add
                    </button>
                  </div>
                  {/* Search existing users */}
                  <input
                    type="text"
                    placeholder="Search users by email..."
                    value={allUsersSearch}
                    onChange={(e) => { setAllUsersSearch(e.target.value); setAllUsersPage(1); }}
                    className="w-full h-7 px-2.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                    data-testid="input-all-users-search"
                  />
                  {allUsersQuery.isLoading && (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {!allUsersQuery.isLoading && (allUsersQuery.data?.users ?? []).length === 0 && (
                    <p className="text-[10px] text-muted-foreground text-center py-2">No users found.</p>
                  )}
                  {(() => {
                    const PAGE_SIZE = 30;
                    const filtered = (allUsersQuery.data?.users ?? []).filter((u) =>
                      !allUsersSearch || u.email.toLowerCase().includes(allUsersSearch.toLowerCase()) || (u.contactEmail ?? "").toLowerCase().includes(allUsersSearch.toLowerCase())
                    );
                    const paginated = filtered.slice(0, allUsersPage * PAGE_SIZE);
                    return (
                      <>
                        {filtered.length > 0 && (
                          <p className="text-[9px] text-muted-foreground">Showing {paginated.length} of {filtered.length} users</p>
                        )}
                        <div className="max-h-56 overflow-y-auto space-y-1">
                          {paginated.map((u) => (
                            <div key={u.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-muted/40" data-testid={`user-row-${u.id}`}>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-medium text-foreground truncate">{u.contactEmail || u.email}</p>
                                {u.role && <p className="text-[9px] text-muted-foreground">{u.role}</p>}
                              </div>
                              <button
                                onClick={async () => {
                                  setTogglingUserId(u.id);
                                  try {
                                    const r = await fetch(`/api/admin/users/${u.id}/subscribed`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
                                      body: JSON.stringify({ subscribedToDigest: !u.subscribedToDigest }),
                                    });
                                    if (!r.ok) throw new Error("Failed");
                                    queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
                                    queryClient.invalidateQueries({ queryKey: ["/api/admin/dispatch/subscribers"] });
                                    queryClient.invalidateQueries({ queryKey: ["/api/admin/dispatch/subscriber-matches", windowHours] });
                                    toast({ title: u.subscribedToDigest ? "Unsubscribed" : "Subscribed", description: `${u.contactEmail || u.email} ${u.subscribedToDigest ? "removed from" : "added to"} digest list.` });
                                  } catch {
                                    toast({ title: "Error", description: "Failed to update subscription.", variant: "destructive" });
                                  } finally {
                                    setTogglingUserId(null);
                                  }
                                }}
                                disabled={togglingUserId === u.id}
                                className={`shrink-0 text-[9px] font-semibold px-2 py-1 rounded-full transition-colors ${u.subscribedToDigest ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-red-100 hover:text-red-600" : "bg-muted text-muted-foreground hover:bg-emerald-100 hover:text-emerald-700"}`}
                                data-testid={`button-toggle-sub-${u.id}`}
                                title={u.subscribedToDigest ? "Click to unsubscribe" : "Click to subscribe"}
                              >
                                {togglingUserId === u.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : u.subscribedToDigest ? "Subscribed" : "Subscribe"}
                              </button>
                            </div>
                          ))}
                        </div>
                        {paginated.length < filtered.length && (
                          <button
                            onClick={() => setAllUsersPage((p) => p + 1)}
                            className="w-full text-[10px] text-primary hover:underline py-1"
                            data-testid="button-load-more-users"
                          >
                            Load more ({filtered.length - paginated.length} remaining)
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* SMART QUEUE */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {selectedSub ? `Matches for ${selectedSub.companyName || selectedSub.email}` : "Select a subscriber"}
              </p>
              {selectedSub && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-xs gap-1.5"
                  onClick={() => addTop5(selectedSub.userId)}
                  disabled={!selectedSubId || suggestionsQuery.isLoading}
                  data-testid="button-add-top5"
                >
                  <Plus className="h-3 w-3" />
                  Add top 5
                </Button>
              )}
            </div>

            {!selectedSubId && (
              <div className="border border-border rounded-xl p-10 bg-card text-center text-sm text-muted-foreground">
                Select a subscriber to see their personalized asset recommendations.
              </div>
            )}

            {selectedSubId && (
              <div className="border border-border rounded-xl bg-card overflow-hidden" style={{ maxHeight: "calc(100vh - 260px)" }}>
                <div className="overflow-y-auto flex-1 divide-y divide-border">
                  {suggestionsQuery.isLoading && (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />Loading matches...
                    </div>
                  )}
                  {!suggestionsQuery.isLoading && smartQueueAssets.length === 0 && (
                    <div className="p-8 text-center text-sm text-muted-foreground">No new assets in this window.</div>
                  )}
                  {smartQueueAssets.map((asset) => {
                    const inDigest = smartStagedIds.has(asset.id);
                    return (
                      <div
                        key={asset.id}
                        draggable={!inDigest}
                        onDragStart={(e) => { e.dataTransfer.setData("smart-asset-id", String(asset.id)); e.dataTransfer.effectAllowed = "copy"; }}
                        className={`p-3 transition-colors group ${inDigest ? "opacity-40" : "hover:bg-muted/40 cursor-grab active:cursor-grabbing"}`}
                        data-testid={`smart-asset-${asset.id}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{asset.assetName}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{asset.institution}</p>
                            <div className="mt-1 flex flex-wrap gap-1 items-center">
                              <StagePill stage={asset.developmentStage} />
                              {asset.modality && asset.modality !== "unknown" && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                                  {asset.modality}
                                </span>
                              )}
                              {asset.score > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-semibold">
                                  {asset.score}pt
                                </span>
                              )}
                              {asset.matchedFields.slice(0, 2).map((f, i) => (
                                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{f}</span>
                              ))}
                            </div>
                          </div>
                          {!inDigest && selectedSubId && (
                            <button
                              onClick={() => addToSmartDigest(selectedSubId, asset)}
                              className="shrink-0 opacity-0 group-hover:opacity-100 h-6 w-6 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white flex items-center justify-center transition-all"
                              data-testid={`smart-add-${asset.id}`}
                              title="Add to digest"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* PER-USER DIGEST ZONE */}
          <div className="w-72 shrink-0 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                Digest Zone
                {selectedSub && <span className="ml-1.5 text-xs font-normal text-muted-foreground">for {selectedSub.companyName || selectedSub.email}</span>}
              </p>
              {selectedSubId && getSmartDigest(selectedSubId).length > 0 && (
                <button onClick={() => setSmartDigests((p) => ({ ...p, [selectedSubId]: [] }))} className="text-xs text-muted-foreground hover:text-destructive" data-testid="smart-clear-digest">
                  Clear
                </button>
              )}
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setSmartDragOver(true); }}
              onDragLeave={() => setSmartDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setSmartDragOver(false);
                if (!selectedSubId) return;
                const reorderStr = e.dataTransfer.getData("digest-smart-idx");
                if (reorderStr !== "") {
                  const fromIdx = Number(reorderStr);
                  const toIdx = smartDragIdx ?? fromIdx;
                  setSmartDragIdx(null);
                  if (fromIdx === toIdx) return;
                  setSmartDigests((prev) => {
                    const items = [...(prev[selectedSubId] ?? [])];
                    const [moved] = items.splice(fromIdx, 1);
                    items.splice(toIdx, 0, moved);
                    return { ...prev, [selectedSubId]: items };
                  });
                  return;
                }
                const idStr = e.dataTransfer.getData("smart-asset-id");
                if (!idStr) return;
                const id = Number(idStr);
                const asset = smartQueueAssets.find((a) => a.id === id);
                if (asset && !smartStagedIds.has(id)) addToSmartDigest(selectedSubId, asset);
              }}
              className={`min-h-[120px] border border-border rounded-xl bg-card overflow-hidden transition-colors ${smartDragOver ? "ring-2 ring-primary/20 ring-inset bg-primary/5" : ""}`}
              data-testid="smart-digest-zone"
            >
              {!selectedSubId ? (
                <div className="p-6 text-center text-xs text-muted-foreground">Select a subscriber first.</div>
              ) : getSmartDigest(selectedSubId).length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  <Send className="h-6 w-6 mx-auto mb-2 opacity-20" />
                  Drag assets here or use "Add top 5".
                </div>
              ) : (
                <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                  {getSmartDigest(selectedSubId).map((asset, i) => (
                    <div
                      key={asset.id}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("digest-smart-idx", String(i)); e.dataTransfer.effectAllowed = "move"; setSmartDragIdx(i); }}
                      onDragOver={(e) => { e.preventDefault(); setSmartDragIdx(i); }}
                      className={`flex items-start gap-2 px-3 py-2.5 cursor-grab ${smartDragIdx === i ? "bg-primary/5" : "hover:bg-muted/30"}`}
                      data-testid={`smart-digest-item-${asset.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{asset.assetName}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{asset.institution}</p>
                      </div>
                      <button
                        onClick={() => removeFromSmartDigest(selectedSubId, asset.id)}
                        className="text-muted-foreground hover:text-destructive mt-0.5"
                        data-testid={`smart-remove-${asset.id}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedSub && (
              <Button
                size="sm"
                onClick={() => sendToSubscriber(selectedSub)}
                disabled={sendingSmartId === selectedSub.userId || getSmartDigest(selectedSub.userId).length === 0}
                className="w-full gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                data-testid={`button-send-to-${selectedSub.userId}`}
              >
                {sendingSmartId === selectedSub.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send to {selectedSub.companyName || selectedSub.email}
              </Button>
            )}

            {(subscriberMatchesQuery.data?.subscribers ?? []).some((s) => getSmartDigest(s.userId).length > 0) && (
              <Button
                size="sm"
                variant="outline"
                onClick={sendAllPersonalized}
                disabled={sendAllPending}
                className="w-full gap-1.5"
                data-testid="button-send-all-personalized"
              >
                {sendAllPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send All Personalized
              </Button>
            )}
          </div>

        </div>
      )}

      {/* Dispatch History */}
      <div className="mt-6 border border-border rounded-xl overflow-hidden bg-card">
        <button
          onClick={() => setHistoryOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/40 transition-colors"
          data-testid="button-toggle-history"
        >
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Dispatch History
            {historyQuery.data && (
              <span className="text-[11px] text-muted-foreground">({historyQuery.data.history.length} entries)</span>
            )}
          </span>
          {historyOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {historyOpen && (
          <div className="border-t border-border">
            {historyQuery.isLoading && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                Loading history...
              </div>
            )}
            {historyQuery.data?.history.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">No dispatches sent yet.</div>
            )}
            {(historyQuery.data?.history ?? []).map((log) => {
              const isExpanded = historyExpandedId === log.id;
              return (
                <div key={log.id} className="border-b border-border last:border-b-0" data-testid={`history-row-${log.id}`}>
                  <button
                    onClick={() => setHistoryExpandedId(isExpanded ? null : log.id)}
                    className="w-full flex items-start justify-between gap-4 px-4 py-3 hover:bg-muted/30 text-left"
                    data-testid={`button-expand-history-${log.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">{log.subject}</p>
                        {log.isTest && (
                          <span className="text-[10px] bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full font-semibold">TEST</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {log.assetCount} asset{log.assetCount !== 1 ? "s" : ""} &bull; {log.recipients.length} recipient{log.recipients.length !== 1 ? "s" : ""} &bull; {log.windowHours}h window
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-muted-foreground">{timeAgo(log.sentAt)}</span>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3 pt-0 space-y-1.5 bg-muted/20">
                      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Recipients</p>
                      <p className="text-xs text-muted-foreground">{log.recipients.join(", ")}</p>
                      {(log.assetNames ?? []).length > 0 && (
                        <>
                          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mt-2">Assets dispatched</p>
                          <ul className="space-y-0.5">
                            {(log.assetNames ?? []).map((name, idx) => {
                              const url = (log.assetSourceUrls ?? [])[idx];
                              return (
                                <li key={idx} className="text-xs text-foreground flex items-center gap-1.5">
                                  <span className="h-1 w-1 rounded-full bg-primary/60 shrink-0" />
                                  {url ? (
                                    <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline flex items-center gap-1">
                                      {name}
                                      <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                                    </a>
                                  ) : (
                                    <span>{name}</span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export { DispatchTab, CitationCard };
