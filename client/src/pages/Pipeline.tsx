import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect, useCallback } from "react";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import {
  Download, Trash2, FlaskConical, ExternalLink, ArrowRight, Beaker, Loader2,
  FileText, Copy, Check, Printer, MessageSquare, ChevronDown, ChevronUp,
  Send, Share2, Eye, EyeOff, Lock, Link2, X,
  LayoutDashboard, AlignJustify, Unlink, GripVertical,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { SavedAsset } from "@shared/schema";
import { SAVED_ASSET_STATUSES } from "@shared/schema";
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ─────────────────────────────────────────────────────────────────────

type AssetNote = { id: number; authorName: string; content: string; createdAt: string; isSystemEvent: boolean };
type NotesResponse = { notes: AssetNote[]; limit: number; offset: number };
type SavedAssetsResponse = {
  assets: (SavedAsset & { noteCount?: number; lastNoteAt?: string | null })[];
};
type PipelineAsset = SavedAsset & { noteCount?: number; lastNoteAt?: string | null };
type DeckAsset = PipelineAsset & { signals: PipelineAsset[] };
type BriefModal = { stage: string; label: string; brief: string; assetCount: number };
type ViewMode = "stage" | "board";
type PipelineList = { id: number; name: string; userId: string; createdAt: string };
type PipelinesResponse = { pipelines: PipelineList[] };

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; pill: string; select: string; column: string }> = {
  watching:      { label: "Watching",      pill: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30",  select: "text-neutral-400",  column: "border-neutral-500/30 bg-neutral-500/5" },
  evaluating:    { label: "Evaluating",    pill: "bg-blue-500/15 text-blue-400 border-blue-500/30",           select: "text-blue-400",     column: "border-blue-500/30 bg-blue-500/5" },
  in_discussion: { label: "In Discussion", pill: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",  select: "text-emerald-500",  column: "border-emerald-500/30 bg-emerald-500/5" },
  on_hold:       { label: "On Hold",       pill: "bg-amber-500/15 text-amber-400 border-amber-500/30",        select: "text-amber-400",    column: "border-amber-500/30 bg-amber-500/5" },
  passed:        { label: "Passed",        pill: "bg-red-500/15 text-red-400 border-red-500/30",              select: "text-red-400",      column: "border-red-500/30 bg-red-500/5" },
};

const BOARD_COLUMNS: { key: string | null; label: string; colorClass: string; dotClass: string }[] = [
  { key: null,          label: "Unassigned",    colorClass: "border-border bg-muted/10",               dotClass: "bg-muted-foreground/40" },
  { key: "watching",    label: "Watching",      colorClass: "border-neutral-500/30 bg-neutral-500/5",  dotClass: "bg-neutral-400" },
  { key: "evaluating",  label: "Evaluating",    colorClass: "border-blue-500/30 bg-blue-500/5",        dotClass: "bg-blue-400" },
  { key: "in_discussion",label:"In Discussion", colorClass: "border-emerald-500/30 bg-emerald-500/5",  dotClass: "bg-emerald-400" },
  { key: "on_hold",     label: "On Hold",       colorClass: "border-amber-500/30 bg-amber-500/5",      dotClass: "bg-amber-400" },
  { key: "passed",      label: "Passed",        colorClass: "border-red-500/30 bg-red-500/5",          dotClass: "bg-red-400" },
];

const STAGES = [
  { key: "discovery",   label: "Discovery",   colorClass: "border-violet-500/30 bg-violet-500/5",   dotClass: "bg-violet-400" },
  { key: "preclinical", label: "Preclinical", colorClass: "border-amber-500/30 bg-amber-500/5",    dotClass: "bg-amber-400" },
  { key: "phase 1",     label: "Phase 1",     colorClass: "border-cyan-500/30 bg-cyan-500/5",       dotClass: "bg-cyan-400" },
  { key: "phase 2",     label: "Phase 2",     colorClass: "border-sky-500/30 bg-sky-500/5",         dotClass: "bg-sky-400" },
  { key: "phase 3",     label: "Phase 3",     colorClass: "border-blue-500/30 bg-blue-500/5",       dotClass: "bg-blue-400" },
  { key: "approved",    label: "Approved",    colorClass: "border-emerald-500/30 bg-emerald-500/5", dotClass: "bg-emerald-400" },
  { key: "unknown",     label: "Unknown",     colorClass: "border-border bg-muted/20",              dotClass: "bg-muted-foreground" },
];

const STAGE_ABBREV: Record<string, string> = {
  discovery: "DI", preclinical: "PC", "phase 1": "P1", "phase 2": "P2", "phase 3": "P3", approved: "AP",
};

const MODALITY_COLORS: Record<string, string> = {
  "small molecule": "bg-rose-500/15 text-rose-400 border-rose-500/30",
  "antibody": "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  "car-t": "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  "gene therapy": "bg-teal-500/15 text-teal-400 border-teal-500/30",
  "mrna therapy": "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "peptide": "bg-pink-500/15 text-pink-400 border-pink-500/30",
  "bispecific antibody": "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

// ── Source type helpers ────────────────────────────────────────────────────────

const NON_TTO_SRC = ["patent", "clinical_trial", "pubmed", "biorxiv", "medrxiv", "literature", "arxiv", "preprint", "paper"];

function isTtoSource(sourceName?: string | null): boolean {
  const sn = (sourceName ?? "").toLowerCase();
  return !NON_TTO_SRC.some((s) => sn === s || sn.includes(s));
}

type SourceConfig = { accent: string; sliverBg: string; label: string; textClass: string };

function getSourceConfig(sourceName?: string | null): SourceConfig {
  const sn = (sourceName ?? "").toLowerCase();
  if (sn === "patent") return { accent: "#d97706", sliverBg: "bg-amber-400",  label: "Patent",   textClass: "text-amber-500" };
  if (sn === "clinical_trial") return { accent: "#0d9488", sliverBg: "bg-teal-400",   label: "Trial",    textClass: "text-teal-500" };
  if (NON_TTO_SRC.some((s) => sn.includes(s))) return { accent: "#7c3aed", sliverBg: "bg-violet-400", label: "Research", textClass: "text-violet-500" };
  return { accent: "#22c55e", sliverBg: "bg-emerald-400", label: "TTO", textClass: "text-emerald-500" };
}

// ── Misc helpers ───────────────────────────────────────────────────────────────

function getBadgeClass(map: Record<string, string>, value: string) {
  if (!value) return "bg-muted text-muted-foreground border-border";
  return map[value.toLowerCase().trim()] ?? "bg-muted text-muted-foreground border-border";
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── SignalMiniCard — compact card shown in the fan ─────────────────────────────

function SignalMiniCard({
  signal, onDetach, draggable = false,
}: {
  signal: PipelineAsset;
  onDetach?: () => void;
  draggable?: boolean;
}) {
  const cfg = getSourceConfig(signal.sourceName);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `signal-${signal.id}`,
    disabled: !draggable,
    data: { type: "signal", assetId: signal.id },
  });

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? attributes : {})}
      className={`relative flex items-center gap-2 bg-white dark:bg-zinc-900 border border-white/80 dark:border-white/10 rounded-[10px] px-3 py-2 overflow-hidden transition-opacity ${isDragging ? "opacity-40" : ""}`}
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[10px]" style={{ background: cfg.accent }} />
      {draggable && (
        <div {...listeners} className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground/40 hover:text-muted-foreground -ml-1">
          <GripVertical className="w-3 h-3" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${cfg.textClass}`}>{cfg.label}</p>
        <p className="text-[11px] font-semibold text-foreground truncate leading-tight">{signal.assetName !== "unknown" ? signal.assetName : signal.sourceTitle}</p>
        {signal.sourceJournal && signal.sourceJournal !== "Unknown" && (
          <p className="text-[9px] text-muted-foreground truncate mt-0.5">{signal.sourceJournal}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {signal.sourceUrl && (
          <a href={signal.sourceUrl} target="_blank" rel="noopener noreferrer" title="View source" onClick={(e) => e.stopPropagation()}>
            <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-primary transition-colors" />
          </a>
        )}
        {onDetach && (
          <button onClick={(e) => { e.stopPropagation(); onDetach(); }} title="Detach from asset" className="text-muted-foreground hover:text-destructive transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── PipelineCard — the main TTO card with notes, status, CRM ──────────────────

function PipelineCard({
  asset, onDelete, signals = [], onDetachSignal, isDropTarget = false,
}: {
  asset: PipelineAsset;
  onDelete: (id: number) => void;
  signals?: PipelineAsset[];
  onDetachSignal?: (signalId: number) => void;
  isDropTarget?: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const cardRef = useRef<HTMLDivElement>(null);
  const notesEndRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, active: false });
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [localStatus, setLocalStatus] = useState<string | null>(asset.status ?? null);
  const [fanOpen, setFanOpen] = useState(false);
  useEffect(() => { setLocalStatus(asset.status ?? null); }, [asset.status]);

  const modalityClass = getBadgeClass(MODALITY_COLORS, asset.modality);
  const stageAbbr = STAGE_ABBREV[asset.developmentStage?.toLowerCase().trim()] ?? "unknown";
  const statusCfg = localStatus ? STATUS_CONFIG[localStatus] : null;
  const hasSignals = signals.length > 0;

  // Droppable target for signals
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `tto-drop-${asset.id}`,
    data: { type: "tto-drop", ttoId: asset.id },
  });

  // Draggable (for kanban board mode)
  const { attributes: dragAttrs, listeners: dragListeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `tto-${asset.id}`,
    data: { type: "tto", assetId: asset.id },
  });

  const { data: notesData } = useQuery<NotesResponse>({
    queryKey: ["/api/saved-assets", asset.id, "notes"],
    queryFn: async () => {
      const res = await fetch(`/api/saved-assets/${asset.id}/notes?limit=50`);
      if (!res.ok) throw new Error("Failed to load notes");
      return res.json();
    },
    enabled: notesOpen,
    staleTime: 10000,
    refetchInterval: notesOpen ? 15000 : false,
  });
  const notes = notesData?.notes ?? [];

  useEffect(() => {
    if (notesOpen && notesEndRef.current) notesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [notesOpen, notes.length]);

  const statusMutation = useMutation<unknown, Error, string | null, { prev: string | null }>({
    mutationFn: async (status: string | null) => {
      const res = await apiRequest("PATCH", `/api/saved-assets/${asset.id}/status`, { status });
      return res.json();
    },
    onMutate: (newStatus) => { const prev = localStatus; setLocalStatus(newStatus); return { prev }; },
    onSuccess: (_, newStatus) => { setLocalStatus(newStatus); qc.invalidateQueries({ queryKey: ["/api/saved-assets"] }); },
    onError: (err, _, ctx) => { if (ctx?.prev !== undefined) setLocalStatus(ctx.prev); toast({ title: "Status update failed", description: err.message, variant: "destructive" }); },
  });

  const noteMutation = useMutation({
    mutationFn: async (content: string) => { const res = await apiRequest("POST", `/api/saved-assets/${asset.id}/notes`, { content }); return res.json(); },
    onSuccess: () => { setNoteText(""); qc.invalidateQueries({ queryKey: ["/api/saved-assets", asset.id, "notes"] }); qc.invalidateQueries({ queryKey: ["/api/saved-assets"] }); },
    onError: (err: any) => toast({ title: "Note failed", description: err.message, variant: "destructive" }),
  });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current || notesOpen || fanOpen) return;
    const rect = cardRef.current.getBoundingClientRect();
    setTilt({ x: ((e.clientY - rect.top) / rect.height - 0.5) * -8, y: ((e.clientX - rect.left) / rect.width - 0.5) * 8, active: true });
  };
  const handleMouseLeave = () => { setHovered(false); setTilt({ x: 0, y: 0, active: false }); setPressed(false); };

  const noteCount = asset.noteCount ?? notes.length;
  const lastNoteAt = asset.lastNoteAt ?? (notes.length > 0 ? notes[notes.length - 1]?.createdAt : null);
  const bloomColor = "rgba(38,122,70,0.55)";

  const setRef = (el: HTMLDivElement | null) => {
    (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    setDropRef(el);
    setDragRef(el);
  };

  // Slivers that peek below when fan is closed
  const sliverSignals = signals.slice(0, 3);

  return (
    <div className={`relative transition-opacity ${isDragging ? "opacity-30" : ""}`}>
      {/* Drop highlight ring */}
      {(isOver || isDropTarget) && (
        <div className="absolute inset-0 rounded-[14px] ring-2 ring-emerald-400 ring-offset-1 z-20 pointer-events-none" />
      )}

      {/* Main card */}
      <div style={{ perspective: "1000px" }} data-testid={`pipeline-card-${asset.id}`}>
        <div
          ref={setRef}
          className="relative rounded-[14px] overflow-hidden bg-white dark:bg-zinc-900 border border-white/90 dark:border-white/10 cursor-pointer"
          style={{
            willChange: "transform",
            transformStyle: "preserve-3d",
            transform: pressed ? "perspective(1000px) scale(0.97)" : tilt.active ? `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` : "perspective(1000px)",
            transition: pressed ? "transform 0.07s ease-in" : tilt.active ? "transform 0.08s ease-out" : "transform 0.5s cubic-bezier(0.23,1,0.32,1)",
            boxShadow: (hovered || isOver) ? "0 16px 48px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.10)" : "0 4px 20px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)",
          }}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={handleMouseLeave}
          onMouseDown={() => setPressed(true)}
          onMouseUp={() => setPressed(false)}
          onClick={() => { if (asset.ingestedAssetId) navigate(`/asset/${asset.ingestedAssetId}`); }}
          {...dragAttrs}
          {...dragListeners}
        >
          {/* Bloom */}
          <div className="absolute pointer-events-none" style={{ width: "56px", height: "56px", borderRadius: "50%", background: bloomColor, top: "-28px", left: "-28px", transform: hovered ? "scale(26)" : "scale(1)", opacity: hovered ? 0.13 : 0, transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease", zIndex: 1 }} />

          {/* Accent bar */}
          <div className="absolute left-0 top-0 bottom-0 w-[3px] z-[3]" style={{ background: "#22c55e" }} />

          {/* Stage badge */}
          <div className="absolute top-0 left-0 z-[5] flex flex-col items-center justify-center px-2 py-1 border-b border-r border-emerald-500/40 bg-white dark:bg-zinc-900" style={{ borderRadius: "17px 0 10px 0", minWidth: "36px" }} data-testid={`pipeline-stage-badge-${asset.id}`}>
            <span className="text-[8px] font-bold tracking-[0.15em] uppercase leading-none text-muted-foreground">Stage</span>
            <span className="font-mono text-xs font-bold leading-tight tabular-nums mt-0.5 text-emerald-600 dark:text-emerald-400">{stageAbbr !== "unknown" ? stageAbbr : <span className="opacity-40">?</span>}</span>
          </div>

          {/* Delete */}
          <button onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }} className="absolute top-2 right-2 z-[5] shrink-0 w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150 active:scale-90" data-testid={`button-delete-pipeline-${asset.id}`} title="Remove asset">
            <Trash2 className="w-3 h-3" />
          </button>

          <div className="relative z-[4] pl-4 pr-3 pt-8 pb-3 flex flex-col gap-2.5" onClick={(e) => e.stopPropagation()}>
            {/* Title */}
            <div className="flex items-center gap-1.5 min-w-0">
              <FlaskConical className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="font-semibold text-sm text-foreground truncate leading-tight">{asset.assetName !== "unknown" ? asset.assetName : "Unnamed Asset"}</span>
            </div>

            {asset.modality && asset.modality !== "unknown" && (
              <div className="flex flex-wrap gap-1">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${modalityClass}`}>{asset.modality}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <p className="text-muted-foreground text-[10px] uppercase tracking-wide font-semibold">Target</p>
                <p className="text-foreground truncate mt-0.5">{asset.target !== "unknown" ? asset.target : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] uppercase tracking-wide font-semibold">Disease</p>
                <p className="text-foreground truncate mt-0.5">{asset.diseaseIndication !== "unknown" ? asset.diseaseIndication : "—"}</p>
              </div>
            </div>

            {/* Status + Notes */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/20 dark:border-white/10">
              <div className="flex items-center gap-1">
                {statusCfg && <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusCfg.pill}`}>{statusCfg.label}</span>}
                <select
                  value={localStatus ?? "none"}
                  onChange={(e) => { e.stopPropagation(); statusMutation.mutate(e.target.value === "none" ? null : e.target.value); }}
                  disabled={statusMutation.isPending}
                  onClick={(e) => e.stopPropagation()}
                  className={`text-[10px] bg-transparent border border-white/20 dark:border-white/10 rounded px-1.5 py-0.5 focus:outline-none cursor-pointer hover:border-primary/30 transition-colors ${statusCfg ? statusCfg.select : "text-muted-foreground"}`}
                  data-testid={`select-pipeline-status-${asset.id}`}
                >
                  <option value="none">CRM stage</option>
                  {SAVED_ASSET_STATUSES.map((s) => <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>)}
                </select>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setNotesOpen((o) => !o); }}
                className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors ${notesOpen ? "border-primary/30 bg-primary/5 text-primary" : "border-white/20 dark:border-white/10 text-muted-foreground hover:border-primary/20 hover:text-foreground"}`}
                data-testid={`button-pipeline-notes-toggle-${asset.id}`}
              >
                <MessageSquare className="w-2.5 h-2.5" />
                <span>{noteCount > 0 ? noteCount : "Notes"}</span>
                {notesOpen ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
              </button>
            </div>

            {lastNoteAt && !notesOpen && <p className="text-[9px] text-muted-foreground -mt-1.5">Last note {timeAgo(lastNoteAt)}</p>}

            {/* Footer links + signal toggle */}
            <div className="flex items-center justify-between -mt-1">
              <p className="text-[10px] text-muted-foreground truncate">{asset.sourceJournal} · {asset.publicationYear}</p>
              <div className="flex items-center gap-2 shrink-0">
                {hasSignals && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setFanOpen((o) => !o); }}
                    className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border transition-colors ${fanOpen ? "border-primary/30 bg-primary/5 text-primary" : "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/5"}`}
                    data-testid={`button-pipeline-fan-${asset.id}`}
                    title={fanOpen ? "Collapse signals" : "Expand signals"}
                  >
                    <Link2 className="w-2.5 h-2.5" />
                    <span>{signals.length} signal{signals.length !== 1 ? "s" : ""}</span>
                    {fanOpen ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                  </button>
                )}
                {asset.ingestedAssetId && (
                  <Link href={`/asset/${asset.ingestedAssetId}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-0.5 text-[10px] text-primary hover:text-primary/80 transition-colors" data-testid={`link-pipeline-dossier-${asset.id}`}>
                    Dossier →
                  </Link>
                )}
              </div>
            </div>

            {/* Notes panel */}
            {notesOpen && (
              <div className="border-t border-white/20 dark:border-white/10 pt-2.5 flex flex-col gap-2">
                <div className="max-h-40 overflow-y-auto flex flex-col gap-1.5 pr-0.5">
                  {notes.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground text-center py-2">No notes yet</p>
                  ) : (
                    notes.map((note) => (
                      <div key={note.id} className={`flex gap-1.5 ${note.isSystemEvent ? "opacity-60" : ""}`} data-testid={`note-pipeline-${note.id}`}>
                        {!note.isSystemEvent && (
                          <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[7px] font-bold shrink-0 mt-0.5">{getInitials(note.authorName)}</div>
                        )}
                        <div className={`flex-1 min-w-0 ${note.isSystemEvent ? "pl-5" : ""}`}>
                          {!note.isSystemEvent && <div className="flex items-center gap-1 mb-0.5"><span className="text-[9px] font-semibold text-foreground">{note.authorName}</span><span className="text-[9px] text-muted-foreground">{timeAgo(note.createdAt)}</span></div>}
                          <p className="text-[10px] text-foreground leading-relaxed break-words">{note.content}</p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={notesEndRef} />
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (noteText.trim()) noteMutation.mutate(noteText.trim()); } }}
                    placeholder="Add a note…"
                    className="flex-1 min-w-0 bg-transparent border border-white/20 dark:border-white/10 rounded px-2 py-1 text-[10px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/30"
                    data-testid={`textarea-pipeline-note-${asset.id}`}
                  />
                  <button
                    onClick={() => { if (noteText.trim()) noteMutation.mutate(noteText.trim()); }}
                    disabled={!noteText.trim() || noteMutation.isPending}
                    className="w-6 h-6 rounded flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all active:scale-90 shrink-0"
                    data-testid={`button-pipeline-note-submit-${asset.id}`}
                  >
                    {noteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Signal slivers — peek below when fan is closed */}
      {hasSignals && !fanOpen && (
        <div className="relative -mt-1 mx-1.5">
          {sliverSignals.map((sig, idx) => {
            const cfg = getSourceConfig(sig.sourceName);
            return (
              <div
                key={sig.id}
                className={`${cfg.sliverBg} rounded-b-md`}
                style={{
                  height: "5px",
                  marginTop: "1px",
                  marginLeft: `${(idx + 1) * 4}px`,
                  marginRight: `${(idx + 1) * 4}px`,
                  opacity: 0.7 - idx * 0.15,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Fanned signal cards */}
      <AnimatePresence>
        {fanOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-1.5 pt-1.5 pb-1">
              {signals.map((sig, idx) => (
                <motion.div
                  key={sig.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: idx * 0.04, duration: 0.15 }}
                >
                  <SignalMiniCard
                    signal={sig}
                    draggable
                    onDetach={onDetachSignal ? () => onDetachSignal(sig.id) : undefined}
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── UnlinkedSignalCard — draggable signal in the tray ─────────────────────────

function UnlinkedSignalCard({ signal, onDelete }: { signal: PipelineAsset; onDelete: (id: number) => void }) {
  const cfg = getSourceConfig(signal.sourceName);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `signal-${signal.id}`,
    data: { type: "signal", assetId: signal.id },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      className={`relative bg-white dark:bg-zinc-900 border border-white/90 dark:border-white/10 rounded-[12px] overflow-hidden transition-opacity ${isDragging ? "opacity-30" : ""}`}
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
      data-testid={`unlinked-signal-${signal.id}`}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: cfg.accent }} />
      <div className="pl-3 pr-2 py-2.5 flex items-center gap-2">
        <div {...listeners} className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground/40 hover:text-muted-foreground">
          <GripVertical className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-[9px] font-bold uppercase tracking-wide ${cfg.textClass}`}>{cfg.label}</span>
          </div>
          <p className="text-[11px] font-semibold text-foreground truncate">{signal.assetName !== "unknown" ? signal.assetName : signal.sourceTitle}</p>
          {signal.sourceJournal && signal.sourceJournal !== "Unknown" && (
            <p className="text-[9px] text-muted-foreground truncate mt-0.5">{signal.sourceJournal} · {signal.publicationYear}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {signal.sourceUrl && (
            <a href={signal.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <button onClick={() => onDelete(signal.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Remove">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      <p className="text-[8px] text-muted-foreground/60 px-3 pb-1.5 italic">Drag onto a TTO asset card to attach</p>
    </div>
  );
}

// ── KanbanStatusColumn — droppable status column ───────────────────────────────

function KanbanStatusColumn({
  col, decks, onDelete, onDetachSignal,
}: {
  col: typeof BOARD_COLUMNS[number];
  decks: DeckAsset[];
  onDelete: (id: number) => void;
  onDetachSignal: (signalId: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `status-col-${col.key ?? "unassigned"}`,
    data: { type: "status-drop", status: col.key },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-72 rounded-lg border shrink-0 transition-colors ${col.colorClass} ${isOver ? "ring-2 ring-primary/40" : ""}`}
    >
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-inherit">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${col.dotClass}`} />
          <span className="text-sm font-semibold text-foreground">{col.label}</span>
        </div>
        <span className="text-xs font-bold text-muted-foreground tabular-nums w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center">{decks.length}</span>
      </div>
      <ScrollArea className="flex-1 max-h-[calc(100vh-16rem)]">
        <div className="p-2.5 flex flex-col gap-3">
          {decks.length === 0 ? (
            <div className={`py-10 text-center rounded-lg border-2 border-dashed border-inherit transition-colors ${isOver ? "border-primary/40 bg-primary/5" : ""}`}>
              <p className="text-xs text-muted-foreground">Drop asset here</p>
            </div>
          ) : (
            decks.map((deck) => (
              <PipelineCard
                key={deck.id}
                asset={deck}
                signals={deck.signals}
                onDelete={onDelete}
                onDetachSignal={onDetachSignal}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Pipeline main component ────────────────────────────────────────────────────

export default function Pipeline() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("stage");
  const [filterPipeline, setFilterPipeline] = useState<"all" | number | null>("all");
  const [briefLoading, setBriefLoading] = useState<string | null>(null);
  const [briefModal, setBriefModal] = useState<BriefModal | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [showShareForm, setShowShareForm] = useState(false);
  const [shareBriefPassword, setShareBriefPassword] = useState("");
  const [shareBriefPasswordVisible, setShareBriefPasswordVisible] = useState(false);

  // DnD state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const { data, isLoading } = useQuery<SavedAssetsResponse>({
    queryKey: ["/api/saved-assets"],
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const { data: pipelinesData } = useQuery<PipelinesResponse>({
    queryKey: ["/api/pipelines"],
    staleTime: 30000,
  });
  const pipelines = pipelinesData?.pipelines ?? [];

  const savedAssets = data?.assets ?? [];

  // ── Data grouping ──────────────────────────────────────────────────────────
  const ttoAssets = savedAssets.filter((a) => isTtoSource(a.sourceName));
  const signalAssets = savedAssets.filter((a) => !isTtoSource(a.sourceName));

  const signalsByParent = new Map<number, PipelineAsset[]>();
  const unlinkedSignals: PipelineAsset[] = [];
  for (const sig of signalAssets) {
    if (sig.parentSavedAssetId) {
      const arr = signalsByParent.get(sig.parentSavedAssetId) ?? [];
      arr.push(sig);
      signalsByParent.set(sig.parentSavedAssetId, arr);
    } else {
      unlinkedSignals.push(sig);
    }
  }

  const deckAssets: DeckAsset[] = ttoAssets.map((tto) => ({
    ...tto,
    signals: signalsByParent.get(tto.id) ?? [],
  }));

  const filteredDeckAssets = filterPipeline === "all" ? deckAssets
    : filterPipeline === null ? deckAssets.filter((d) => d.pipelineListId == null)
    : deckAssets.filter((d) => d.pipelineListId === filterPipeline);

  const filteredUnlinkedSignals = filterPipeline === "all" ? unlinkedSignals
    : filterPipeline === null ? unlinkedSignals.filter((s) => s.pipelineListId == null)
    : unlinkedSignals.filter((s) => s.pipelineListId === filterPipeline);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/saved-assets/${id}`); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/saved-assets"] }); toast({ title: "Asset removed from pipeline" }); },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const attachMutation = useMutation({
    mutationFn: async ({ signalId, parentId }: { signalId: number; parentId: number | null }) => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/saved-assets/${signalId}/parent`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ parent_saved_asset_id: parentId }),
      });
      if (!res.ok) throw new Error("Failed to attach signal");
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      if (vars.parentId) toast({ title: "Signal attached to asset" });
      else toast({ title: "Signal detached" });
    },
    onError: (err: any) => toast({ title: "Attach failed", description: err.message, variant: "destructive" }),
  });

  const boardStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string | null }) => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/saved-assets/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/saved-assets"] }),
    onError: (err: any) => toast({ title: "Status update failed", description: err.message, variant: "destructive" }),
  });

  const handleDetachSignal = useCallback((signalId: number) => {
    attachMutation.mutate({ signalId, parentId: null });
  }, [attachMutation]);

  // ── DnD handlers ──────────────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const dragData = active.data.current;
    const dropData = over.data.current;

    if (dragData?.type === "signal" && dropData?.type === "tto-drop") {
      if (dragData.assetId !== dropData.ttoId) {
        attachMutation.mutate({ signalId: dragData.assetId, parentId: dropData.ttoId });
      }
    }

    if (dragData?.type === "tto" && dropData?.type === "status-drop") {
      const tto = ttoAssets.find((a) => a.id === dragData.assetId);
      const newStatus = dropData.status as string | null;
      if (tto && tto.status !== newStatus) {
        boardStatusMutation.mutate({ id: dragData.assetId, status: newStatus });
      }
    }
  }

  // ── Brief / export ────────────────────────────────────────────────────────

  const briefMutation = useMutation({
    mutationFn: async ({ stage }: { stage: string }) => {
      const res = await apiRequest("POST", "/api/pipeline/brief", { stage });
      return res.json() as Promise<{ brief: string; assetCount: number }>;
    },
    onSuccess: (result, vars) => {
      const stageInfo = STAGES.find((s) => s.key === vars.stage);
      setBriefModal({ stage: vars.stage, label: stageInfo?.label ?? vars.stage, brief: result.brief, assetCount: result.assetCount });
      setBriefLoading(null);
    },
    onError: (err: any) => { toast({ title: "Brief generation failed", description: err.message, variant: "destructive" }); setBriefLoading(null); },
  });

  const shareBriefMutation = useMutation({
    mutationFn: async () => {
      if (!briefModal) throw new Error("No brief to share");
      const body: Record<string, unknown> = { type: "pipeline_brief", payload: { brief: briefModal.brief, pipelineName: briefModal.label, assetCount: briefModal.assetCount } };
      if (shareBriefPassword) body.password = shareBriefPassword;
      const res = await apiRequest("POST", "/api/share", body);
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? "Failed to create share link"); }
      return res.json() as Promise<{ token: string; expiresAt: string; url: string }>;
    },
    onSuccess: (data) => { setShareUrl(data.url); setShowShareForm(false); },
    onError: (err: any) => toast({ title: "Failed to create share link", description: err.message, variant: "destructive" }),
  });

  const handleBrief = (stageKey: string) => { setBriefLoading(stageKey); briefMutation.mutate({ stage: stageKey }); };
  const handleCopy = () => { if (!briefModal) return; navigator.clipboard.writeText(briefModal.brief).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  const handlePrint = () => {
    if (!briefModal) return;
    sessionStorage.setItem("pipeline-brief-print", JSON.stringify({ brief: briefModal.brief, pipelineName: briefModal.label, assetCount: briefModal.assetCount }));
    window.open("/pipeline/brief/print", "_blank");
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(savedAssets, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "helixradar-pipeline.json"; a.click(); URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    if (savedAssets.length === 0) return;
    const headers = ["Asset Name", "Target", "Modality", "Stage", "Disease", "Summary", "Journal", "Year", "Source", "URL"];
    const rows = savedAssets.map((a) => [a.assetName, a.target, a.modality, a.developmentStage, a.diseaseIndication, `"${a.summary.replace(/"/g, '""')}"`, a.sourceJournal, a.publicationYear, a.sourceName, a.sourceUrl ?? ""]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "helixradar-pipeline.csv"; a.click(); URL.revokeObjectURL(url);
  };

  // ── Derived counts ─────────────────────────────────────────────────────────
  const totalAssets = savedAssets.length;
  const ttoCount = ttoAssets.length;
  const unlinkedCount = unlinkedSignals.length;

  // Active drag asset (for overlay)
  const activeDragAsset = activeDragId
    ? savedAssets.find((a) => `signal-${a.id}` === activeDragId || `tto-${a.id}` === activeDragId)
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Nav />
      <main className="flex-1 flex flex-col">

        {/* Header */}
        <div className="border-b border-border bg-card/30">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-foreground">
                    Drug Development{" "}
                    <span className="gradient-text dark:gradient-text gradient-text-light">Pipeline</span>
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {totalAssets > 0
                      ? `${ttoCount} TTO asset${ttoCount !== 1 ? "s" : ""}${unlinkedCount > 0 ? ` · ${unlinkedCount} unlinked signal${unlinkedCount !== 1 ? "s" : ""}` : ""}`
                      : "Save assets from Scout to build your pipeline"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {totalAssets > 0 && (
                    <>
                      {/* View toggle */}
                      <div className="flex items-center gap-0.5 border border-card-border rounded-md p-0.5 bg-card">
                        <button
                          onClick={() => setViewMode("stage")}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${viewMode === "stage" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          data-testid="button-view-stage"
                          title="Stage view — organized by clinical development stage"
                        >
                          <AlignJustify className="w-3 h-3" />
                          Stage
                        </button>
                        <button
                          onClick={() => setViewMode("board")}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${viewMode === "board" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          data-testid="button-view-board"
                          title="Board view — organized by CRM status stage"
                        >
                          <LayoutDashboard className="w-3 h-3" />
                          Board
                        </button>
                      </div>
                      <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs border-card-border" onClick={handleExportJson} data-testid="button-pipeline-export-json">
                        <Download className="w-3 h-3" />JSON
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs border-card-border" onClick={handleExportCsv} data-testid="button-pipeline-export-csv">
                        <Download className="w-3 h-3" />CSV
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Pipeline filter pills */}
              {totalAssets > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setFilterPipeline("all")}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterPipeline === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                    data-testid="filter-pipeline-all"
                  >
                    All
                  </button>
                  <button
                    onClick={() => setFilterPipeline(null)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterPipeline === null ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                    data-testid="filter-pipeline-uncategorised"
                  >
                    Uncategorised
                  </button>
                  {pipelines.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={() => setFilterPipeline(pl.id)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterPipeline === pl.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                      data-testid={`filter-pipeline-${pl.id}`}
                    >
                      {pl.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Loading / retry / no-data-yet state — gate on data existence, not isLoading,
            because isLoading drops to false between retry attempts even when data is still undefined */}
        {(isLoading || !data) ? (
          <div className="flex-1 flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : totalAssets === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-24 px-6 text-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Beaker className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">Your pipeline is empty</h2>
              <p className="text-muted-foreground max-w-sm">Discover TTO assets from Scout and save them here to build your pipeline.</p>
            </div>
            <Link href="/discover">
              <Button className="gap-2 mt-2" data-testid="button-go-discover">
                Start Discovering <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        ) : (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex-1">
              <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-8">

                {/* ── Board view (CRM kanban by status) ─────────────────── */}
                {viewMode === "board" && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-3">Drag TTO assets between columns to update their CRM stage. Drag signals onto TTO cards to attach.</p>
                    <div className="overflow-x-auto">
                      <div className="flex gap-4 min-w-max pb-4">
                        {BOARD_COLUMNS.map((col) => {
                          const colDecks = filteredDeckAssets.filter((d) => (d.status ?? null) === col.key);
                          return (
                            <KanbanStatusColumn
                              key={col.key ?? "unassigned"}
                              col={col}
                              decks={colDecks}
                              onDelete={(id) => deleteMutation.mutate(id)}
                              onDetachSignal={handleDetachSignal}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Stage view (organized by clinical dev stage) ───────── */}
                {viewMode === "stage" && filteredDeckAssets.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <FlaskConical className="w-4 h-4 text-emerald-500" />
                      <h3 className="text-sm font-semibold text-foreground">TTO Assets</h3>
                      <span className="text-xs font-bold text-muted-foreground tabular-nums w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center">{filteredDeckAssets.length}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">— Drag signals onto a card to attach. Drag the ⣿ handle to reorder.</span>
                    </div>
                    <div className="overflow-x-auto">
                      <div className="flex gap-4 min-w-max pb-4">
                        {STAGES.map((stage) => {
                          const stageDecks = filteredDeckAssets.filter((d) => (d.developmentStage?.toLowerCase().trim() || "unknown") === stage.key);
                          return (
                            <div key={stage.key} className={`flex flex-col w-72 rounded-lg border ${stage.colorClass} shrink-0`} data-testid={`pipeline-stage-col-${stage.key}`}>
                              <div className="flex items-center justify-between px-3.5 py-3 border-b border-inherit">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${stage.dotClass}`} />
                                  <span className="text-sm font-semibold text-foreground">{stage.label}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-muted-foreground tabular-nums w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center">{stageDecks.length}</span>
                                  {stage.key !== "unknown" && stageDecks.length > 0 && (
                                    <button
                                      onClick={() => handleBrief(stage.key)}
                                      disabled={briefLoading === stage.key}
                                      className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-50"
                                      data-testid={`button-pipeline-brief-${stage.key.replace(" ", "-")}`}
                                      title="Generate pipeline brief"
                                    >
                                      {briefLoading === stage.key ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <FileText className="w-2.5 h-2.5" />}
                                      Brief
                                    </button>
                                  )}
                                </div>
                              </div>
                              <ScrollArea className="flex-1 max-h-[calc(100vh-20rem)]">
                                <div className="p-2.5 flex flex-col gap-3">
                                  {stageDecks.length === 0 ? (
                                    <div className="py-8 text-center"><p className="text-xs text-muted-foreground">No assets</p></div>
                                  ) : (
                                    stageDecks.map((deck) => (
                                      <PipelineCard
                                        key={deck.id}
                                        asset={deck}
                                        signals={deck.signals}
                                        onDelete={(id) => deleteMutation.mutate(id)}
                                        onDetachSignal={handleDetachSignal}
                                      />
                                    ))
                                  )}
                                </div>
                              </ScrollArea>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Unlinked signals tray ─────────────────────────────── */}
                {filteredUnlinkedSignals.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Unlink className="w-4 h-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground">Unlinked Signals</h3>
                      <span className="text-xs font-bold text-muted-foreground tabular-nums w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center">{filteredUnlinkedSignals.length}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">— Drag these onto a TTO asset card to attach as supporting evidence</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                      {filteredUnlinkedSignals.map((sig) => (
                        <UnlinkedSignalCard
                          key={sig.id}
                          signal={sig}
                          onDelete={(id) => deleteMutation.mutate(id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Drag overlay — ghost card while dragging */}
            <DragOverlay>
              {activeDragAsset && (
                <div className="opacity-80 rotate-1 scale-[0.98]">
                  <div
                    className="relative bg-white dark:bg-zinc-900 border border-white/90 dark:border-white/10 rounded-[12px] px-3 py-2.5 w-64"
                    style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.25)", background: getSourceConfig(activeDragAsset.sourceName).accent + "15" }}
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[12px]" style={{ background: getSourceConfig(activeDragAsset.sourceName).accent }} />
                    <p className={`text-[9px] font-bold uppercase tracking-wide mb-1 ${getSourceConfig(activeDragAsset.sourceName).textClass}`}>
                      {getSourceConfig(activeDragAsset.sourceName).label}
                    </p>
                    <p className="text-[12px] font-semibold text-foreground truncate">{activeDragAsset.assetName !== "unknown" ? activeDragAsset.assetName : activeDragAsset.sourceTitle}</p>
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      {/* ── Brief dialog ──────────────────────────────────────────────────── */}
      <Dialog open={!!briefModal} onOpenChange={(open) => { if (!open) { setBriefModal(null); setCopied(false); setShareUrl(null); setShareLinkCopied(false); setShowShareForm(false); setShareBriefPassword(""); setShareBriefPasswordVisible(false); } }}>
        <DialogContent className="max-w-xl max-h-[80vh] flex flex-col overflow-hidden" data-testid="dialog-pipeline-brief">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileText className="w-4 h-4 text-primary" />
                {briefModal?.label} Pipeline Brief
              </DialogTitle>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">{briefModal?.assetCount} asset{briefModal?.assetCount !== 1 ? "s" : ""}</span>
                <Button variant="outline" size="sm" onClick={handleCopy} className="h-7 text-xs gap-1.5 border-card-border" data-testid="button-brief-copy">
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint} className="h-7 text-xs gap-1.5 border-card-border" data-testid="button-brief-print">
                  <Printer className="w-3 h-3" />Print
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setShowShareForm(true); setShareUrl(null); setShareBriefPassword(""); setShareBriefPasswordVisible(false); }} disabled={shareBriefMutation.isPending} className="h-7 text-xs gap-1.5 border-card-border" data-testid="button-brief-share">
                  <Share2 className="w-3 h-3" />Share
                </Button>
              </div>
            </div>
            {showShareForm && !shareUrl && (
              <div className="flex flex-col gap-2 mt-2" data-testid="share-form-row">
                <div className="flex gap-2 items-center">
                  <Input type={shareBriefPasswordVisible ? "text" : "password"} placeholder="Password (optional)" value={shareBriefPassword} onChange={(e) => setShareBriefPassword(e.target.value)} className="h-7 text-xs" data-testid="input-brief-share-password" />
                  <Button size="sm" variant="ghost" className="h-7 px-2 shrink-0" onClick={() => setShareBriefPasswordVisible(v => !v)} data-testid="button-brief-toggle-password">
                    {shareBriefPasswordVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </Button>
                  <Button size="sm" onClick={() => shareBriefMutation.mutate()} disabled={shareBriefMutation.isPending} className="h-7 text-xs gap-1.5 shrink-0" data-testid="button-create-brief-share-link">
                    {shareBriefMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Share2 className="w-3 h-3" />}
                    {shareBriefMutation.isPending ? "..." : "Create Link"}
                  </Button>
                </div>
              </div>
            )}
            {shareUrl && (
              <div className="flex gap-2 mt-2" data-testid="share-url-row">
                {shareBriefPassword && <Lock className="w-3 h-3 text-amber-500 shrink-0 self-center" />}
                <Input readOnly value={shareUrl} className="h-7 text-xs font-mono" onClick={(e) => (e.target as HTMLInputElement).select()} data-testid="input-brief-share-url" />
                <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1.5 text-xs border-card-border" onClick={() => { navigator.clipboard.writeText(shareUrl).then(() => { setShareLinkCopied(true); setTimeout(() => setShareLinkCopied(false), 2000); }); }} data-testid="button-copy-brief-share-url">
                  {shareLinkCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {shareLinkCopied ? "Copied!" : "Copy"}
                </Button>
              </div>
            )}
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 mt-2">
            <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed px-1 pb-4" data-testid="text-brief-content">
              {briefModal?.brief}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
