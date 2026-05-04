import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Download,
  Trash2,
  FlaskConical,
  ExternalLink,
  ArrowRight,
  Beaker,
  Layers,
  Plus,
  Pencil,
  Check,
  X,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  FileText,
  Copy,
  Loader2,
  Printer,
  Users,
  MessageSquare,
  Send,
  Clock,
  Activity,
  BookOpen,
  Lightbulb,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import type { SavedAsset, SavedAssetNote, SavedAssetStatus } from "@shared/schema";
import { SAVED_ASSET_STATUSES } from "@shared/schema";
import { useOrg } from "@/hooks/use-org";

type PipelineWithCount = {
  id: number;
  name: string;
  assetCount: number;
  createdAt: string;
  orgId?: number | null;
};

type PipelinesResponse = {
  pipelines: PipelineWithCount[];
  uncategorisedCount: number;
};

type TeamSavedAsset = SavedAsset & { saverName?: string | null; noteCount?: number; lastNoteAt?: string | Date | null };
type TeamMember = { userId: string; displayName: string | null };

type SavedAssetsResponse = {
  assets: TeamSavedAsset[];
  members?: TeamMember[];
};

const MODALITY_COLORS: Record<string, string> = {
  "small molecule":     "bg-rose-500/15 text-rose-400 border-rose-500/30",
  "antibody":           "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  "car-t":              "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  "gene therapy":       "bg-teal-500/15 text-teal-400 border-teal-500/30",
  "mrna therapy":       "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "peptide":            "bg-pink-500/15 text-pink-400 border-pink-500/30",
  "bispecific antibody":"bg-purple-500/15 text-purple-400 border-purple-500/30",
  "adc":                "bg-red-500/15 text-red-400 border-red-500/30",
  "cell therapy":       "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  "protac":             "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const STATUS_CONFIG: Record<string, { label: string; pill: string; select: string }> = {
  watching:      { label: "Watching",      pill: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30",  select: "text-neutral-400" },
  evaluating:    { label: "Evaluating",    pill: "bg-blue-500/15 text-blue-400 border-blue-500/30",           select: "text-blue-400" },
  in_discussion: { label: "In Discussion", pill: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",  select: "text-emerald-500" },
  on_hold:       { label: "On Hold",       pill: "bg-amber-500/15 text-amber-400 border-amber-500/30",        select: "text-amber-400" },
  passed:        { label: "Passed",        pill: "bg-red-500/15 text-red-400 border-red-500/30",              select: "text-red-400" },
};

type SourceTypeKey = "tto" | "patent" | "trial" | "literature";

const SOURCE_TYPE_CONFIG: Record<SourceTypeKey, {
  label: string;
  shortLabel: string;
  icon: typeof FlaskConical;
  iconColor: string;
  stripColor: string;
  borderHover: string;
  pillClass: string;
  filterActiveClass: string;
}> = {
  tto: {
    label: "TTO Assets",
    shortLabel: "TTO",
    icon: FlaskConical,
    iconColor: "text-emerald-600 dark:text-emerald-400",
    stripColor: "#22c55e",
    borderHover: "hover:border-emerald-500/40",
    pillClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    filterActiveClass: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  patent: {
    label: "Patents",
    shortLabel: "Patent",
    icon: Lightbulb,
    iconColor: "text-amber-600 dark:text-amber-400",
    stripColor: "#d97706",
    borderHover: "hover:border-amber-500/40",
    pillClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
    filterActiveClass: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  trial: {
    label: "Clinical Trials",
    shortLabel: "Trial",
    icon: Activity,
    iconColor: "text-teal-600 dark:text-teal-400",
    stripColor: "#0d9488",
    borderHover: "hover:border-teal-500/40",
    pillClass: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30",
    filterActiveClass: "border-teal-500/50 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  },
  literature: {
    label: "Literature",
    shortLabel: "Literature",
    icon: BookOpen,
    iconColor: "text-violet-600 dark:text-violet-400",
    stripColor: "#8b5cf6",
    borderHover: "hover:border-violet-500/40",
    pillClass: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
    filterActiveClass: "border-violet-500/50 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
};

function getSourceTypeKey(sourceName: string | null | undefined): SourceTypeKey {
  const sn = (sourceName ?? "").toLowerCase();
  if (sn === "patent" || sn === "patents") return "patent";
  if (sn === "clinical_trial" || sn === "clinicaltrials" || sn === "trial") return "trial";
  if (sn === "literature" || sn === "pubmed" || sn === "biorxiv" || sn === "medrxiv" || sn === "preprint") return "literature";
  return "tto";
}

function getBadgeClass(value: string) {
  if (!value) return "bg-muted text-muted-foreground border-border";
  return MODALITY_COLORS[value.toLowerCase().trim()] ?? "bg-muted text-muted-foreground border-border";
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatNoteTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 2) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function AssetCard({ asset, onDelete, onMove, pipelines, restrictMeta, currentUserId }: {
  asset: TeamSavedAsset;
  onDelete: (id: number) => void;
  onMove: (id: number, pipelineListId: number | null) => void;
  pipelines: PipelineWithCount[];
  /** When true, hides the delete button and pipeline move select (team view) */
  restrictMeta?: boolean;
  currentUserId?: string | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [localStatus, setLocalStatus] = useState<string | null>(asset.status ?? null);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  useEffect(() => { setLocalStatus(asset.status ?? null); }, [asset.status]);
  const notesEndRef = useRef<HTMLDivElement>(null);

  const { data: notesData, isLoading: notesLoading } = useQuery<{ notes: SavedAssetNote[] }>({
    queryKey: ["/api/saved-assets", asset.id, "notes"],
    queryFn: () =>
      fetch(`/api/saved-assets/${asset.id}/notes`).then((r) => {
        if (!r.ok) throw new Error("Failed to load notes");
        return r.json();
      }),
    enabled: notesOpen,
    staleTime: 10000,
    refetchInterval: notesOpen ? 15000 : false,
  });

  const notes = notesData?.notes ?? [];

  useEffect(() => {
    if (notesOpen && notesEndRef.current) {
      notesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [notesOpen, notes.length]);

  const statusMutation = useMutation<unknown, Error, string | null, { prev: string | null }>({
    mutationFn: async (status: string | null) => {
      const res = await apiRequest("PATCH", `/api/saved-assets/${asset.id}/status`, {
        status,
      });
      return res.json();
    },
    onMutate: (newStatus) => {
      const prev = localStatus;
      setLocalStatus(newStatus);
      return { prev };
    },
    onSuccess: (_, newStatus) => {
      setLocalStatus(newStatus);
      qc.invalidateQueries({ queryKey: ["/api/saved-assets", asset.id, "notes"] });
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
    },
    onError: (err, _, ctx) => {
      if (ctx?.prev !== undefined) setLocalStatus(ctx.prev);
      toast({ title: "Status update failed", description: err.message, variant: "destructive" });
    },
  });

  const noteMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/saved-assets/${asset.id}/notes`, {
        content,
      });
      return res.json();
    },
    onSuccess: () => {
      setNoteText("");
      qc.invalidateQueries({ queryKey: ["/api/saved-assets", asset.id, "notes"] });
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
    },
    onError: (err: any) => toast({ title: "Note failed", description: err.message, variant: "destructive" }),
  });

  const editNoteMutation = useMutation({
    mutationFn: async ({ noteId, content }: { noteId: number; content: string }) => {
      const res = await apiRequest("PATCH", `/api/saved-assets/${asset.id}/notes/${noteId}`, { content });
      return res.json();
    },
    onSuccess: () => {
      setEditingNoteId(null);
      setEditingContent("");
      qc.invalidateQueries({ queryKey: ["/api/saved-assets", asset.id, "notes"] });
    },
    onError: (err: any) => toast({ title: "Edit failed", description: err.message, variant: "destructive" }),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: number) => {
      await apiRequest("DELETE", `/api/saved-assets/${asset.id}/notes/${noteId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets", asset.id, "notes"] });
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const handleStatusChange = (val: string) => {
    statusMutation.mutate(val === "none" ? null : val);
  };

  const handleNoteSubmit = () => {
    const content = noteText.trim();
    if (!content) return;
    noteMutation.mutate(content);
  };

  const statusCfg = localStatus ? STATUS_CONFIG[localStatus] : null;
  const sourceTypeKey = getSourceTypeKey(asset.sourceName);
  const sourceMeta = SOURCE_TYPE_CONFIG[sourceTypeKey];
  const SourceIcon = sourceMeta.icon;

  return (
    <div
      className={`group relative rounded-md border border-card-border bg-card transition-all duration-200 flex flex-col overflow-hidden ${sourceMeta.borderHover}`}
      data-testid={`pipeline-card-${asset.id}`}
      data-source-type={sourceTypeKey}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] z-[1]"
        style={{ background: sourceMeta.stripColor }}
        aria-hidden="true"
      />
      <div className="p-3.5 pl-4 flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <SourceIcon className={`w-3.5 h-3.5 shrink-0 ${sourceMeta.iconColor}`} />
            <span className="font-semibold text-sm text-foreground truncate leading-tight">
              {asset.assetName !== "unknown" ? asset.assetName : "Unnamed Asset"}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {asset.saverName !== undefined && (
              <span
                className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/60 border border-border rounded-full px-1.5 py-0.5 leading-none"
                title={asset.saverName ?? undefined}
                data-testid={`text-saver-${asset.id}`}
              >
                <span className="w-3.5 h-3.5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold text-[8px] leading-none shrink-0">
                  {getInitials(asset.saverName)}
                </span>
                <span className="truncate max-w-[80px]">{asset.saverName ?? "Unknown"}</span>
              </span>
            )}
            {!restrictMeta && (
              <button
                onClick={() => onDelete(asset.id)}
                className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
                data-testid={`button-delete-asset-${asset.id}`}
                title="Remove asset"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${sourceMeta.pillClass}`}
            data-testid={`pill-source-type-${asset.id}`}
          >
            {sourceMeta.shortLabel}
          </span>
          {asset.modality && asset.modality !== "unknown" && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${getBadgeClass(asset.modality)}`}>
              {asset.modality}
            </span>
          )}
          {asset.developmentStage && asset.developmentStage !== "unknown" && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border bg-muted text-muted-foreground border-border capitalize">
              {asset.developmentStage}
            </span>
          )}
        </div>

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

        <div className="flex items-center justify-between pt-0.5 border-t border-card-border gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <p className="text-[10px] text-muted-foreground truncate">
              {asset.sourceJournal} · {asset.publicationYear}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {asset.sourceUrl && (
              <a
                href={asset.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 text-[10px] text-primary hover:text-primary/80 transition-colors"
                data-testid={`link-asset-source-${asset.id}`}
              >
                <ExternalLink className="w-2.5 h-2.5" />
                View
              </a>
            )}
            {pipelines.length > 0 && !restrictMeta && (
              <select
                value={asset.pipelineListId ?? "null"}
                onChange={(e) => {
                  const val = e.target.value;
                  onMove(asset.id, val === "null" ? null : parseInt(val, 10));
                }}
                className="text-[10px] text-muted-foreground bg-transparent border-0 focus:outline-none cursor-pointer hover:text-foreground"
                title="Move to pipeline"
                data-testid={`select-move-asset-${asset.id}`}
              >
                <option value="null">Uncategorised</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1.5">
            {statusCfg && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusCfg.pill}`}>
                {statusCfg.label}
              </span>
            )}
            <select
              value={localStatus ?? "none"}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={statusMutation.isPending}
              className={`text-[10px] bg-transparent border border-card-border rounded px-1.5 py-0.5 focus:outline-none cursor-pointer hover:border-primary/30 transition-colors ${statusCfg ? statusCfg.select : "text-muted-foreground"}`}
              data-testid={`select-status-${asset.id}`}
            >
              <option value="none">Set stage</option>
              {SAVED_ASSET_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setNotesOpen((o) => !o)}
            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors ${notesOpen ? "border-primary/30 bg-primary/5 text-primary" : "border-card-border text-muted-foreground hover:border-primary/20 hover:text-foreground"}`}
            data-testid={`button-notes-toggle-${asset.id}`}
          >
            <MessageSquare className="w-2.5 h-2.5" />
            {(() => {
              const count = notesOpen ? notes.length : (asset.noteCount ?? 0);
              return count > 0 ? `${count} note${count !== 1 ? "s" : ""}` : "Notes";
            })()}
            {!notesOpen && asset.lastNoteAt && (
              <span className="text-muted-foreground/70 text-[9px] hidden sm:inline">
                · {formatNoteTime(asset.lastNoteAt as string)}
              </span>
            )}
            {notesOpen ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </button>
        </div>
      </div>

      {notesOpen && (
        <div className="border-t border-card-border bg-muted/20 flex flex-col" data-testid={`notes-panel-${asset.id}`}>
          <div className="max-h-48 overflow-y-auto px-3 py-2 flex flex-col gap-2">
            {notesLoading ? (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground py-2">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                Loading...
              </div>
            ) : notes.length === 0 ? (
              <p className="text-[10px] text-muted-foreground py-2 text-center">No notes yet</p>
            ) : (
              notes.map((note) => (
                <div
                  key={note.id}
                  className={`text-xs group/note ${note.isSystemEvent ? "flex items-center gap-1 text-muted-foreground/70 italic" : "flex flex-col gap-0.5"}`}
                  data-testid={`note-item-${note.id}`}
                >
                  {note.isSystemEvent ? (
                    <>
                      <Clock className="w-2.5 h-2.5 shrink-0" />
                      <span>{note.content}</span>
                      <span className="ml-auto text-[10px] shrink-0 pl-2">{formatNoteTime(note.createdAt as unknown as string)}</span>
                    </>
                  ) : editingNoteId === note.id ? (
                    <>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold text-[8px] leading-none shrink-0">
                          {getInitials(note.authorName)}
                        </span>
                        <span className="font-medium text-foreground text-[11px]">{note.authorName}</span>
                      </div>
                      <Textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        className="text-xs min-h-[48px] max-h-20 resize-none bg-background pl-5"
                        data-testid={`textarea-edit-note-${note.id}`}
                        autoFocus
                      />
                      <div className="flex gap-1 mt-1 pl-5">
                        <button
                          onClick={() => editNoteMutation.mutate({ noteId: note.id, content: editingContent.trim() })}
                          disabled={!editingContent.trim() || editNoteMutation.isPending}
                          className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                          data-testid={`button-save-edit-note-${note.id}`}
                        >
                          {editNoteMutation.isPending ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => { setEditingNoteId(null); setEditingContent(""); }}
                          className="text-[10px] px-2 py-0.5 rounded border border-card-border text-muted-foreground hover:text-foreground transition-colors"
                          data-testid={`button-cancel-edit-note-${note.id}`}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold text-[8px] leading-none shrink-0">
                          {getInitials(note.authorName)}
                        </span>
                        <span className="font-medium text-foreground text-[11px]">{note.authorName}</span>
                        <span className="text-muted-foreground text-[10px] ml-auto">{formatNoteTime(note.createdAt as unknown as string)}</span>
                        {currentUserId && note.userId === currentUserId && (
                          <div className="flex gap-0.5 opacity-0 group-hover/note:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setEditingNoteId(note.id); setEditingContent(note.content); }}
                              className="w-4 h-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                              title="Edit note"
                              data-testid={`button-edit-note-${note.id}`}
                            >
                              <Pencil className="w-2.5 h-2.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm("Delete this note?")) {
                                  deleteNoteMutation.mutate(note.id);
                                }
                              }}
                              disabled={deleteNoteMutation.isPending}
                              className="w-4 h-4 rounded flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                              title="Delete note"
                              data-testid={`button-delete-note-${note.id}`}
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-foreground/90 pl-5.5 leading-relaxed">{note.content}</p>
                    </>
                  )}
                </div>
              ))
            )}
            <div ref={notesEndRef} />
          </div>
          <div className="flex items-end gap-1.5 px-3 pb-2.5 pt-1.5 border-t border-card-border/50">
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleNoteSubmit();
                }
              }}
              placeholder="Add a note... (Enter to send)"
              className="text-xs min-h-[52px] max-h-24 resize-none flex-1 bg-background"
              data-testid={`textarea-note-${asset.id}`}
            />
            <button
              onClick={handleNoteSubmit}
              disabled={!noteText.trim() || noteMutation.isPending}
              className="w-7 h-7 flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all shrink-0 mb-0.5"
              data-testid={`button-note-submit-${asset.id}`}
            >
              {noteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PipelineSidebar({
  pipelines,
  uncategorisedCount,
  selectedId,
  onSelect,
  onCreatePipeline,
  onBrief,
  briefLoadingId,
  isLoading,
}: {
  pipelines: PipelineWithCount[];
  uncategorisedCount: number;
  selectedId: number | null | "all";
  onSelect: (id: number | null | "all") => void;
  onCreatePipeline: (name: string, shared?: boolean) => void;
  onBrief?: (id: number) => void;
  briefLoadingId?: number | null;
  isLoading: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createShared, setCreateShared] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const { data: org } = useOrg();

  const hasTeamOrg = !!(org && org.planTier !== "individual");
  const myLists = pipelines.filter((p) => !p.orgId);
  const teamLists = pipelines.filter((p) => !!p.orgId);

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await apiRequest("PATCH", `/api/pipelines/${id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pipelines"] });
      setEditId(null);
      setEditName("");
    },
    onError: (err: any) => toast({ title: "Rename failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/pipelines/${id}`);
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["/api/pipelines"] });
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      if (selectedId === id) onSelect("all");
      toast({ title: "Pipeline deleted", description: "Assets moved to Uncategorised" });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onCreatePipeline(name, createShared);
    setNewName("");
    setCreateShared(false);
    setCreating(false);
  };

  function renderPipelineRow(p: PipelineWithCount, showSharedBadge?: boolean) {
    return (
      <div key={p.id} className="group relative">
        {editId === p.id ? (
          <div className="flex items-center gap-1 px-1.5 py-1">
            <Input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") renameMutation.mutate({ id: p.id, name: editName.trim() });
                if (e.key === "Escape") { setEditId(null); setEditName(""); }
              }}
              className="h-7 text-xs flex-1"
              data-testid={`input-rename-pipeline-${p.id}`}
            />
            <button
              onClick={() => renameMutation.mutate({ id: p.id, name: editName.trim() })}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted/50 text-primary"
              data-testid={`button-confirm-rename-${p.id}`}
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={() => { setEditId(null); setEditName(""); }}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted/50 text-muted-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => onSelect(p.id)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${selectedId === p.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
            data-testid={`pipeline-filter-${p.id}`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0 text-primary/70" />
            <span className="flex-1 text-left truncate">{p.name}</span>
            {showSharedBadge && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-muted-foreground/30 text-muted-foreground group-hover:hidden shrink-0">
                shared
              </Badge>
            )}
            <span className="text-[10px] tabular-nums text-muted-foreground group-hover:hidden">{p.assetCount}</span>
            <div className="hidden group-hover:flex items-center gap-0.5">
              {onBrief && p.assetCount > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onBrief(p.id); }}
                  disabled={briefLoadingId === p.id}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted/50 text-muted-foreground hover:text-primary disabled:opacity-50"
                  title="Pipeline brief"
                  data-testid={`button-pipeline-brief-${p.id}`}
                >
                  {briefLoadingId === p.id
                    ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    : <FileText className="w-2.5 h-2.5" />
                  }
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setEditId(p.id); setEditName(p.name); }}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted/50"
                title="Rename"
                data-testid={`button-rename-pipeline-${p.id}`}
              >
                <Pencil className="w-2.5 h-2.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(p.id); }}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive"
                title="Delete pipeline"
                data-testid={`button-delete-pipeline-${p.id}`}
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-56 shrink-0 flex flex-col gap-0.5">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1 mb-1">
        Pipelines
      </div>

      <button
        onClick={() => onSelect("all")}
        className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${selectedId === "all" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
        data-testid="pipeline-filter-all"
      >
        <Layers className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 text-left">All Assets</span>
      </button>

      {uncategorisedCount > 0 && (
        <button
          onClick={() => onSelect(null)}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${selectedId === null ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
          data-testid="pipeline-filter-uncategorised"
        >
          <FolderOpen className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 text-left">Uncategorised</span>
          <span className="text-[10px] tabular-nums text-muted-foreground">{uncategorisedCount}</span>
        </button>
      )}

      {isLoading ? (
        <div className="space-y-1 mt-1">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full rounded-md" />)}
        </div>
      ) : (
        <>
          {hasTeamOrg ? (
            <>
              {myLists.length > 0 && (
                <div className="mt-2">
                  <div className="text-[9px] font-semibold text-muted-foreground/70 uppercase tracking-widest px-2 mb-0.5">
                    My Lists
                  </div>
                  {myLists.map((p) => renderPipelineRow(p, false))}
                </div>
              )}
              {teamLists.length > 0 && (
                <div className="mt-2">
                  <div className="text-[9px] font-semibold text-muted-foreground/70 uppercase tracking-widest px-2 mb-0.5">
                    Team Lists
                  </div>
                  {teamLists.map((p) => renderPipelineRow(p, true))}
                </div>
              )}
            </>
          ) : (
            pipelines.map((p) => renderPipelineRow(p, false))
          )}
        </>
      )}

      <div className="mt-1 border-t border-border pt-1">
        {creating ? (
          <div className="flex flex-col gap-1 px-1.5 py-1">
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") { setCreating(false); setNewName(""); setCreateShared(false); }
                }}
                placeholder="Pipeline name…"
                className="h-7 text-xs flex-1"
                data-testid="input-create-pipeline"
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted/50 text-primary disabled:opacity-40"
                data-testid="button-confirm-create-pipeline"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={() => { setCreating(false); setNewName(""); setCreateShared(false); }}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted/50 text-muted-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            {hasTeamOrg && (
              <div className="flex items-center gap-1 px-0.5">
                <button
                  type="button"
                  onClick={() => setCreateShared(false)}
                  className={`flex-1 text-[10px] px-2 py-0.5 rounded border transition-colors ${!createShared ? "border-primary/40 bg-primary/5 text-primary font-medium" : "border-border text-muted-foreground hover:border-primary/20"}`}
                  data-testid="button-create-personal"
                >
                  Personal
                </button>
                <button
                  type="button"
                  onClick={() => setCreateShared(true)}
                  className={`flex-1 text-[10px] px-2 py-0.5 rounded border transition-colors ${createShared ? "border-primary/40 bg-primary/5 text-primary font-medium" : "border-border text-muted-foreground hover:border-primary/20"}`}
                  data-testid="button-create-team"
                >
                  Team
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            data-testid="button-new-pipeline-sidebar"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            New pipeline…
          </button>
        )}
      </div>
    </div>
  );
}

type BriefModal = { pipelineName: string; brief: string; assetCount: number };

export default function Assets() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedPipeline, setSelectedPipeline] = useState<number | null | "all">("all");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<"all" | SourceTypeKey>("all");
  const [briefModal, setBriefModal] = useState<BriefModal | null>(null);
  const [briefLoading, setBriefLoading] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [teamScope, setTeamScope] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { data: org } = useOrg();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    let es: EventSource | null = null;
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      es = new EventSource(`/api/saved-assets/events?token=${encodeURIComponent(token)}`);
      es.addEventListener("note_added", (e: MessageEvent) => {
        try {
          const { savedAssetId } = JSON.parse(e.data);
          qc.invalidateQueries({ queryKey: ["/api/saved-assets", savedAssetId, "notes"] });
          qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
        } catch {}
      });
      es.addEventListener("note_updated", (e: MessageEvent) => {
        try {
          const { savedAssetId } = JSON.parse(e.data);
          qc.invalidateQueries({ queryKey: ["/api/saved-assets", savedAssetId, "notes"] });
        } catch {}
      });
      es.addEventListener("note_deleted", (e: MessageEvent) => {
        try {
          const { savedAssetId } = JSON.parse(e.data);
          qc.invalidateQueries({ queryKey: ["/api/saved-assets", savedAssetId, "notes"] });
          qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
        } catch {}
      });
      es.addEventListener("status_changed", () => {
        qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      });
    });
    return () => { es?.close(); };
  }, [currentUserId, qc]);
  const hasTeamOrg = !!(org && org.planTier !== "individual");

  const { data: pipelinesData, isLoading: pipelinesLoading } = useQuery<PipelinesResponse>({
    queryKey: ["/api/pipelines"],
    staleTime: 30000,
  });

  const assetsQueryKey = teamScope
    ? ["/api/saved-assets", "scope", "team", selectedMemberId ?? "all"]
    : selectedPipeline === "all"
      ? ["/api/saved-assets"]
      : selectedPipeline === null
        ? ["/api/saved-assets", "pipeline", null]
        : ["/api/saved-assets", "pipeline", selectedPipeline];

  const { data, isLoading: assetsLoading } = useQuery<SavedAssetsResponse>({
    queryKey: assetsQueryKey,
    queryFn: async () => {
      const headers = await getAuthHeaders();
      if (teamScope) {
        const url = selectedMemberId
          ? `/api/saved-assets?scope=team&memberId=${encodeURIComponent(selectedMemberId)}`
          : "/api/saved-assets?scope=team";
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error("Failed to load team assets");
        return res.json();
      }
      const url = selectedPipeline === "all"
        ? "/api/saved-assets"
        : selectedPipeline === null
          ? "/api/saved-assets?pipelineListId=null"
          : `/api/saved-assets?pipelineListId=${selectedPipeline}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Failed to load assets");
      return res.json();
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/saved-assets/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      qc.invalidateQueries({ queryKey: ["/api/pipelines"] });
      toast({ title: "Asset removed" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({ id, pipelineListId }: { id: number; pipelineListId: number | null }) => {
      const res = await apiRequest("PATCH", `/api/saved-assets/${id}/pipeline`, { pipeline_list_id: pipelineListId });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      qc.invalidateQueries({ queryKey: ["/api/pipelines"] });
      toast({ title: "Asset moved" });
    },
    onError: (err: any) => {
      toast({ title: "Move failed", description: err.message, variant: "destructive" });
    },
  });

  const createPipelineMutation = useMutation({
    mutationFn: async ({ name, shared }: { name: string; shared?: boolean }) => {
      const res = await apiRequest("POST", "/api/pipelines", { name, shared: shared ?? false });
      return res.json();
    },
    onSuccess: ({ pipeline }) => {
      qc.invalidateQueries({ queryKey: ["/api/pipelines"] });
      setSelectedPipeline(pipeline.id);
      toast({ title: "Pipeline created", description: `"${pipeline.name}" is ready` });
    },
    onError: (err: any) => {
      toast({ title: "Create failed", description: err.message, variant: "destructive" });
    },
  });

  const briefMutation = useMutation({
    mutationFn: async (listId: number) => {
      const res = await apiRequest("POST", `/api/pipeline-lists/${listId}/brief`, {});
      return res.json() as Promise<{ brief: string; assetCount: number; pipelineName: string }>;
    },
    onSuccess: (result) => {
      setBriefModal({ pipelineName: result.pipelineName, brief: result.brief, assetCount: result.assetCount });
      setBriefLoading(null);
    },
    onError: (err: any) => {
      toast({ title: "Brief generation failed", description: err.message, variant: "destructive" });
      setBriefLoading(null);
    },
  });

  const handleBrief = (listId?: number) => {
    const id = listId ?? (typeof selectedPipeline === "number" ? selectedPipeline : null);
    if (!id) return;
    setBriefLoading(id);
    briefMutation.mutate(id);
  };

  const handleCopy = () => {
    if (!briefModal) return;
    navigator.clipboard.writeText(briefModal.brief).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handlePrint = () => {
    if (!briefModal) return;
    sessionStorage.setItem("pipeline-brief-print", JSON.stringify({
      brief: briefModal.brief,
      pipelineName: briefModal.pipelineName,
      assetCount: briefModal.assetCount,
    }));
    window.open("/pipeline/brief/print", "_blank");
  };

  const pipelines = pipelinesData?.pipelines ?? [];
  const uncategorisedCount = pipelinesData?.uncategorisedCount ?? 0;
  const allAssets = data?.assets ?? [];

  const sourceTypeCounts: Record<SourceTypeKey, number> = { tto: 0, patent: 0, trial: 0, literature: 0 };
  for (const a of allAssets) sourceTypeCounts[getSourceTypeKey(a.sourceName)]++;

  const SOURCE_SORT_ORDER: Record<SourceTypeKey, number> = { tto: 0, literature: 1, patent: 2, trial: 3 };

  const displayedAssets = (() => {
    const base = sourceTypeFilter === "all"
      ? allAssets
      : allAssets.filter((a) => getSourceTypeKey(a.sourceName) === sourceTypeFilter);
    return [...base].sort(
      (a, b) =>
        (SOURCE_SORT_ORDER[getSourceTypeKey(a.sourceName)] ?? 99) -
        (SOURCE_SORT_ORDER[getSourceTypeKey(b.sourceName)] ?? 99)
    );
  })();

  const isLoading = pipelinesLoading || assetsLoading;
  const totalAssets = allAssets.length;

  const selectedPipelineName = selectedPipeline === "all"
    ? "All Assets"
    : selectedPipeline === null
      ? "Uncategorised"
      : pipelines.find((p) => p.id === selectedPipeline)?.name ?? "Pipeline";

  const handleExportJson = (assets: SavedAsset[]) => {
    const blob = new Blob([JSON.stringify(assets, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `edenradar-${selectedPipelineName.toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = (assets: SavedAsset[]) => {
    if (assets.length === 0) return;
    const headers = ["Asset Name", "Target", "Modality", "Stage", "Disease", "Summary", "Journal", "Year", "Source", "URL"];
    const rows = assets.map((a) => [
      a.assetName, a.target, a.modality, a.developmentStage, a.diseaseIndication,
      `"${a.summary.replace(/"/g, '""')}"`, a.sourceJournal, a.publicationYear, a.sourceName, a.sourceUrl ?? "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `edenradar-${selectedPipelineName.toLowerCase().replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-full flex flex-col">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Drug Development{" "}
                <span className="gradient-text dark:gradient-text gradient-text-light">
                  Pipelines
                </span>
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {teamScope
                  ? `All assets saved by your team`
                  : totalAssets > 0
                    ? `${totalAssets} asset${totalAssets !== 1 ? "s" : ""} across ${pipelines.length} named pipeline${pipelines.length !== 1 ? "s" : ""}`
                    : "Save assets from Scout to build your pipelines"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {hasTeamOrg && (
                <div className="flex items-center rounded-md border border-border overflow-hidden text-xs" data-testid="toggle-team-scope">
                  <button
                    onClick={() => { setTeamScope(false); setSelectedMemberId(null); }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 transition-colors ${!teamScope ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                    data-testid="button-scope-personal"
                  >
                    My Pipelines
                  </button>
                  <button
                    onClick={() => setTeamScope(true)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 border-l border-border transition-colors ${teamScope ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                    data-testid="button-scope-team"
                  >
                    <Users className="w-3 h-3" />
                    Team View
                  </button>
                </div>
              )}
              {displayedAssets.length > 0 && !teamScope && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs border-card-border"
                    onClick={() => handleExportJson(displayedAssets)}
                    data-testid="button-export-json"
                  >
                    <Download className="w-3 h-3" />
                    JSON
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs border-card-border"
                    onClick={() => handleExportCsv(displayedAssets)}
                    data-testid="button-export-csv"
                  >
                    <Download className="w-3 h-3" />
                    CSV
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {totalAssets === 0 && !isLoading && !teamScope ? (
        <div className="flex-1 flex flex-col items-center justify-center py-24 px-6 text-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Beaker className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-foreground">No assets saved yet</h2>
            <p className="text-muted-foreground max-w-sm">
              Discover drug assets from scientific literature and save them into named pipelines.
            </p>
          </div>
          <Link href="/scout">
            <Button className="gap-2 mt-2" data-testid="button-go-scout">
              Go to Scout
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      ) : (
        <div className="flex-1 flex gap-0">
          {!teamScope && (
            <div className="hidden md:block w-64 shrink-0 border-r border-border p-4">
              <PipelineSidebar
                pipelines={pipelines}
                uncategorisedCount={uncategorisedCount}
                selectedId={selectedPipeline}
                onSelect={setSelectedPipeline}
                onCreatePipeline={(name, shared) => createPipelineMutation.mutate({ name, shared })}
                onBrief={handleBrief}
                briefLoadingId={briefLoading}
                isLoading={pipelinesLoading}
              />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">
                      {teamScope ? (
                        <span className="flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-muted-foreground" />
                          Team Assets
                        </span>
                      ) : selectedPipelineName}
                    </h2>
                    {!teamScope && (
                      <Sheet>
                        <SheetTrigger asChild>
                          <button
                            className="md:hidden flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5 transition-colors"
                            data-testid="button-mobile-pipeline-menu"
                          >
                            <Layers className="w-3 h-3" />
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-72 p-4">
                          <SheetHeader className="mb-4">
                            <SheetTitle>Pipelines</SheetTitle>
                          </SheetHeader>
                          <PipelineSidebar
                            pipelines={pipelines}
                            uncategorisedCount={uncategorisedCount}
                            selectedId={selectedPipeline}
                            onSelect={setSelectedPipeline}
                            onCreatePipeline={(name, shared) => createPipelineMutation.mutate({ name, shared })}
                            onBrief={handleBrief}
                            briefLoadingId={briefLoading}
                            isLoading={pipelinesLoading}
                          />
                        </SheetContent>
                      </Sheet>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sourceTypeFilter === "all"
                      ? `${displayedAssets.length} asset${displayedAssets.length !== 1 ? "s" : ""}`
                      : `${displayedAssets.length} of ${totalAssets} asset${totalAssets !== 1 ? "s" : ""}`}
                    {teamScope && ` across ${org?.members.length ?? 0} team member${(org?.members.length ?? 0) !== 1 ? "s" : ""}`}
                  </p>
                </div>
                {typeof selectedPipeline === "number" && displayedAssets.length > 0 && (
                  <button
                    onClick={() => handleBrief()}
                    disabled={briefLoading !== null}
                    className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all disabled:opacity-50"
                    data-testid="button-pipeline-brief"
                    title="Generate AI pipeline brief"
                  >
                    {briefLoading === selectedPipeline ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileText className="w-3.5 h-3.5" />
                    )}
                    Pipeline Brief
                  </button>
                )}
              </div>

              {teamScope && data?.members && data.members.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mb-4" data-testid="member-filter-pills">
                  <button
                    onClick={() => setSelectedMemberId(null)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${!selectedMemberId ? "border-primary/40 bg-primary/8 text-primary font-medium" : "border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"}`}
                    data-testid="button-member-filter-all"
                  >
                    All members
                  </button>
                  {data.members.map((m) => (
                    <button
                      key={m.userId}
                      onClick={() => setSelectedMemberId(m.userId === selectedMemberId ? null : m.userId)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${selectedMemberId === m.userId ? "border-primary/40 bg-primary/8 text-primary font-medium" : "border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"}`}
                      data-testid={`button-member-filter-${m.userId}`}
                    >
                      <span className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold text-[8px] leading-none shrink-0">
                        {getInitials(m.displayName)}
                      </span>
                      {m.displayName ?? "Unknown"}
                    </button>
                  ))}
                </div>
              )}

              {totalAssets > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4" data-testid="source-type-filter-pills">
                  {([
                    { key: "all" as const, label: "All", count: totalAssets },
                    { key: "tto" as const, label: SOURCE_TYPE_CONFIG.tto.shortLabel, count: sourceTypeCounts.tto },
                    { key: "patent" as const, label: SOURCE_TYPE_CONFIG.patent.shortLabel, count: sourceTypeCounts.patent },
                    { key: "trial" as const, label: SOURCE_TYPE_CONFIG.trial.shortLabel, count: sourceTypeCounts.trial },
                    { key: "literature" as const, label: SOURCE_TYPE_CONFIG.literature.shortLabel, count: sourceTypeCounts.literature },
                  ]).map(({ key, label, count }) => {
                    const active = sourceTypeFilter === key;
                    const meta = key !== "all" ? SOURCE_TYPE_CONFIG[key] : null;
                    const Icon = meta?.icon;
                    const activeClass = key === "all"
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : meta!.filterActiveClass;
                    return (
                      <button
                        key={key}
                        onClick={() => setSourceTypeFilter(key)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${active ? `${activeClass} font-medium` : "border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"}`}
                        data-testid={`filter-source-type-${key}`}
                      >
                        {Icon && <Icon className="w-3 h-3" />}
                        {label}
                        <span className="text-[10px] tabular-nums opacity-70">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Synthesis strip — named pipeline only, all types, multiple types present */}
              {typeof selectedPipeline === "number" && sourceTypeFilter === "all" && displayedAssets.length > 0 && (
                Object.values(sourceTypeCounts).filter(c => c > 0).length > 1
              ) && (
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-3 px-0.5" data-testid="synthesis-strip">
                  {sourceTypeCounts.tto > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      {sourceTypeCounts.tto} TTO
                    </span>
                  )}
                  {sourceTypeCounts.patent > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                      {sourceTypeCounts.patent} Patent{sourceTypeCounts.patent !== 1 ? "s" : ""}
                    </span>
                  )}
                  {sourceTypeCounts.trial > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                      {sourceTypeCounts.trial} Trial{sourceTypeCounts.trial !== 1 ? "s" : ""}
                    </span>
                  )}
                  {sourceTypeCounts.literature > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                      {sourceTypeCounts.literature} Literature
                    </span>
                  )}
                </div>
              )}

              {displayedAssets.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-3">
                  <Layers className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm">
                    {selectedPipeline === null && uncategorisedCount === 0
                      ? "All assets are in a pipeline."
                      : sourceTypeFilter !== "all" && totalAssets > 0
                      ? `No ${SOURCE_TYPE_CONFIG[sourceTypeFilter as SourceTypeKey].shortLabel.toLowerCase()} assets in this pipeline.`
                      : teamScope ? "No team assets saved yet." : "No assets in this pipeline yet."}
                  </p>
                  {selectedPipeline === null && uncategorisedCount === 0 ? (
                    <button
                      onClick={() => setSelectedPipeline("all")}
                      className="text-xs text-primary hover:underline"
                      data-testid="button-go-to-all-assets"
                    >
                      View all assets
                    </button>
                  ) : sourceTypeFilter !== "all" && totalAssets > 0 ? (
                    <button
                      onClick={() => setSourceTypeFilter("all")}
                      className="text-xs text-primary hover:underline"
                      data-testid="button-clear-source-filter"
                    >
                      Show all assets
                    </button>
                  ) : !teamScope && (
                    <Link href="/scout">
                      <Button variant="outline" size="sm" className="gap-1.5 mt-1" data-testid="button-discover-assets">
                        <ArrowRight className="w-3.5 h-3.5" />
                        Discover assets
                      </Button>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {displayedAssets.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      onDelete={(id) => deleteMutation.mutate(id)}
                      onMove={(id, pipelineListId) => moveMutation.mutate({ id, pipelineListId })}
                      pipelines={pipelines}
                      restrictMeta={teamScope}
                      currentUserId={currentUserId}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!briefModal} onOpenChange={(open) => { if (!open) { setBriefModal(null); setCopied(false); } }}>
        <DialogContent className="max-w-xl max-h-[80vh] flex flex-col overflow-hidden" data-testid="dialog-pipeline-brief">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileText className="w-4 h-4 text-primary" />
                {briefModal?.pipelineName}: Pipeline Brief
              </DialogTitle>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {briefModal?.assetCount} asset{briefModal?.assetCount !== 1 ? "s" : ""}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="h-7 text-xs gap-1.5 border-card-border"
                  data-testid="button-brief-copy"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                  className="h-7 text-xs gap-1.5 border-card-border"
                  data-testid="button-brief-print"
                >
                  <Printer className="w-3 h-3" />
                  Print
                </Button>
              </div>
            </div>
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
