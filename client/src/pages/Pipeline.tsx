import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Download,
  Trash2,
  FlaskConical,
  ExternalLink,
  ArrowRight,
  Beaker,
  Loader2,
  FileText,
  Copy,
  Check,
  Printer,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Send,
  Share2,
  Eye,
  EyeOff,
  Lock,
  ScrollText,
  Activity,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { SavedAsset } from "@shared/schema";
import { SAVED_ASSET_STATUSES } from "@shared/schema";

type AssetNote = { id: number; authorName: string; content: string; createdAt: string; isSystemEvent: boolean };
type NotesResponse = { notes: AssetNote[]; total: number };

type SavedAssetsResponse = {
  assets: (SavedAsset & { noteCount?: number; lastNoteAt?: string | null })[];
};

const STATUS_CONFIG: Record<string, { label: string; pill: string; select: string }> = {
  watching:      { label: "Watching",      pill: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30",  select: "text-neutral-400" },
  evaluating:    { label: "Evaluating",    pill: "bg-blue-500/15 text-blue-400 border-blue-500/30",           select: "text-blue-400" },
  in_discussion: { label: "In Discussion", pill: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",  select: "text-emerald-500" },
  on_hold:       { label: "On Hold",       pill: "bg-amber-500/15 text-amber-400 border-amber-500/30",        select: "text-amber-400" },
  passed:        { label: "Passed",        pill: "bg-red-500/15 text-red-400 border-red-500/30",              select: "text-red-400" },
};

const STAGES: { key: string; label: string; colorClass: string; dotClass: string }[] = [
  { key: "discovery",   label: "Discovery",   colorClass: "border-violet-500/30 bg-violet-500/5",   dotClass: "bg-violet-400" },
  { key: "preclinical", label: "Preclinical", colorClass: "border-amber-500/30 bg-amber-500/5",    dotClass: "bg-amber-400" },
  { key: "phase 1",     label: "Phase 1",     colorClass: "border-cyan-500/30 bg-cyan-500/5",       dotClass: "bg-cyan-400" },
  { key: "phase 2",     label: "Phase 2",     colorClass: "border-sky-500/30 bg-sky-500/5",         dotClass: "bg-sky-400" },
  { key: "phase 3",     label: "Phase 3",     colorClass: "border-blue-500/30 bg-blue-500/5",       dotClass: "bg-blue-400" },
  { key: "approved",    label: "Approved",    colorClass: "border-emerald-500/30 bg-emerald-500/5", dotClass: "bg-emerald-400" },
  { key: "unknown",     label: "Unknown",     colorClass: "border-border bg-muted/20",              dotClass: "bg-muted-foreground" },
];

const BADGE_COLORS: Record<string, string> = {
  discovery:   "bg-violet-500/15 text-violet-400 border-violet-500/30",
  preclinical: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "phase 1":   "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  "phase 2":   "bg-sky-500/15 text-sky-400 border-sky-500/30",
  "phase 3":   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  approved:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  unknown:     "bg-muted text-muted-foreground border-border",
};

const MODALITY_COLORS: Record<string, string> = {
  "small molecule":     "bg-rose-500/15 text-rose-400 border-rose-500/30",
  "antibody":           "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  "car-t":              "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  "gene therapy":       "bg-teal-500/15 text-teal-400 border-teal-500/30",
  "mrna therapy":       "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "peptide":            "bg-pink-500/15 text-pink-400 border-pink-500/30",
  "bispecific antibody":"bg-purple-500/15 text-purple-400 border-purple-500/30",
};

function getBadgeClass(map: Record<string, string>, value: string) {
  if (!value) return "bg-muted text-muted-foreground border-border";
  return map[value.toLowerCase().trim()] ?? "bg-muted text-muted-foreground border-border";
}

const STAGE_ABBREV: Record<string, string> = {
  discovery: "DI",
  preclinical: "PC",
  "phase 1": "P1",
  "phase 2": "P2",
  "phase 3": "P3",
  approved: "AP",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
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

type PipelineAsset = SavedAsset & { noteCount?: number; lastNoteAt?: string | null };

function PipelineCard({ asset, onDelete }: { asset: PipelineAsset; onDelete: (id: number) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const cardRef = useRef<HTMLDivElement>(null);
  const notesEndRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, active: false });
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [localStatus, setLocalStatus] = useState<string | null>(asset.status ?? null);
  useEffect(() => { setLocalStatus(asset.status ?? null); }, [asset.status]);

  const modalityClass = getBadgeClass(MODALITY_COLORS, asset.modality);
  const stageAbbr = STAGE_ABBREV[asset.developmentStage?.toLowerCase().trim()] ?? "unknown";
  const statusCfg = localStatus ? STATUS_CONFIG[localStatus] : null;

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
    if (notesOpen && notesEndRef.current) {
      notesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [notesOpen, notes.length]);

  const statusMutation = useMutation<unknown, Error, string | null, { prev: string | null }>({
    mutationFn: async (status: string | null) => {
      const res = await apiRequest("PATCH", `/api/saved-assets/${asset.id}/status`, { status });
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
      const res = await apiRequest("POST", `/api/saved-assets/${asset.id}/notes`, { content });
      return res.json();
    },
    onSuccess: () => {
      setNoteText("");
      qc.invalidateQueries({ queryKey: ["/api/saved-assets", asset.id, "notes"] });
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
    },
    onError: (err: any) => toast({ title: "Note failed", description: err.message, variant: "destructive" }),
  });

  const handleStatusChange = (value: string) => {
    statusMutation.mutate(value === "none" ? null : value);
  };

  const handleNoteSubmit = () => {
    const trimmed = noteText.trim();
    if (!trimmed || noteMutation.isPending) return;
    noteMutation.mutate(trimmed);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current || notesOpen) return;
    const rect = cardRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (relY - 0.5) * -8, y: (relX - 0.5) * 8, active: true });
  };

  const handleMouseLeave = () => {
    setHovered(false);
    setTilt({ x: 0, y: 0, active: false });
    setPressed(false);
  };

  const noteCount = asset.noteCount ?? notes.length;
  const lastNoteAt = asset.lastNoteAt ?? (notes.length > 0 ? notes[notes.length - 1]?.createdAt : null);

  const sn = asset.sourceName ?? "";
  const sourceType = sn === "patent" ? "patent" : sn === "clinical_trial" ? "trial" : "tto";
  const bloomColor = sourceType === "patent" ? "rgba(217,119,6,0.55)" : sourceType === "trial" ? "rgba(13,148,136,0.55)" : "rgba(38,122,70,0.55)";
  const accentColor = sourceType === "patent" ? "#d97706" : sourceType === "trial" ? "#0d9488" : "#22c55e";
  const accentBorderClass = sourceType === "patent" ? "border-amber-500/40" : sourceType === "trial" ? "border-teal-500/40" : "border-emerald-500/40";
  const stageTextClass = sourceType === "patent" ? "text-amber-600 dark:text-amber-400" : sourceType === "trial" ? "text-teal-600 dark:text-teal-400" : "text-emerald-600 dark:text-emerald-400";

  return (
    <div style={{ perspective: "1000px" }} data-testid={`pipeline-card-${asset.id}`}>
      <div
        ref={cardRef}
        className="relative rounded-[14px] overflow-hidden bg-white dark:bg-zinc-900 border border-white/90 dark:border-white/10"
        style={{
          willChange: "transform",
          transformStyle: "preserve-3d",
          transform: pressed
            ? "perspective(1000px) scale(0.97)"
            : tilt.active
            ? `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`
            : "perspective(1000px)",
          transition: pressed
            ? "transform 0.07s ease-in"
            : tilt.active
            ? "transform 0.08s ease-out"
            : "transform 0.5s cubic-bezier(0.23,1,0.32,1)",
          boxShadow: hovered
            ? "0 16px 48px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.10)"
            : "0 4px 20px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)",
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={handleMouseLeave}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
      >
        <div
          className="absolute pointer-events-none"
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: bloomColor,
            top: "-28px",
            left: "-28px",
            transform: hovered ? "scale(26)" : "scale(1)",
            opacity: hovered ? 0.13 : 0,
            transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
            zIndex: 1,
          }}
        />

        <div className="absolute left-0 top-0 bottom-0 w-[3px] z-[3]" style={{ background: accentColor }} />

        <div
          className={`absolute top-0 left-0 z-[5] flex flex-col items-center justify-center px-2 py-1 border-b border-r ${accentBorderClass} bg-white dark:bg-zinc-900`}
          style={{ borderRadius: "17px 0 10px 0", minWidth: "36px" }}
          data-testid={`pipeline-stage-badge-${asset.id}`}
        >
          <span className="text-[8px] font-bold tracking-[0.15em] uppercase leading-none text-muted-foreground">Stage</span>
          <span className={`font-mono text-xs font-bold leading-tight tabular-nums mt-0.5 ${stageTextClass}`}>
            {stageAbbr !== "unknown" ? stageAbbr : <span className="opacity-40">?</span>}
          </span>
        </div>

        <button
          onClick={() => onDelete(asset.id)}
          className="absolute top-2 right-2 z-[5] shrink-0 w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150 active:scale-90"
          data-testid={`button-delete-pipeline-${asset.id}`}
          title="Remove asset"
        >
          <Trash2 className="w-3 h-3" />
        </button>

        <div className="relative z-[4] pl-4 pr-3 pt-8 pb-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {sourceType === "patent" ? (
              <ScrollText className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            ) : sourceType === "trial" ? (
              <Activity className="w-3.5 h-3.5 text-teal-500 shrink-0" />
            ) : (
              <FlaskConical className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            )}
            <span className="font-semibold text-sm text-foreground truncate leading-tight">
              {asset.assetName !== "unknown" ? asset.assetName : "Unnamed Asset"}
            </span>
          </div>

          <div className="flex flex-wrap gap-1">
            {sourceType === "patent" && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30">
                <ScrollText className="w-2.5 h-2.5" />
                Patent
              </span>
            )}
            {sourceType === "trial" && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/30">
                <Activity className="w-2.5 h-2.5" />
                Trial
              </span>
            )}
            {asset.modality && asset.modality !== "unknown" && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${modalityClass}`}>
                {asset.modality}
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

          {/* Status + Notes toggle row */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/20 dark:border-white/10">
            <div className="flex items-center gap-1">
              {statusCfg && (
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusCfg.pill}`}>
                  {statusCfg.label}
                </span>
              )}
              <select
                value={localStatus ?? "none"}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={statusMutation.isPending}
                className={`text-[10px] bg-transparent border border-white/20 dark:border-white/10 rounded px-1.5 py-0.5 focus:outline-none cursor-pointer hover:border-primary/30 transition-colors ${statusCfg ? statusCfg.select : "text-muted-foreground"}`}
                data-testid={`select-pipeline-status-${asset.id}`}
              >
                <option value="none">CRM stage</option>
                {SAVED_ASSET_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setNotesOpen((o) => !o)}
              className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors ${notesOpen ? "border-primary/30 bg-primary/5 text-primary" : "border-white/20 dark:border-white/10 text-muted-foreground hover:border-primary/20 hover:text-foreground"}`}
              data-testid={`button-pipeline-notes-toggle-${asset.id}`}
            >
              <MessageSquare className="w-2.5 h-2.5" />
              <span>{noteCount > 0 ? noteCount : "Notes"}</span>
              {notesOpen ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            </button>
          </div>

          {lastNoteAt && !notesOpen && (
            <p className="text-[9px] text-muted-foreground -mt-1.5">
              Last note {timeAgo(lastNoteAt)}
            </p>
          )}

          {/* Inline source / dossier links */}
          <div className="flex items-center justify-between -mt-1">
            <p className="text-[10px] text-muted-foreground truncate">
              {asset.sourceJournal} · {asset.publicationYear}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {asset.ingestedAssetId && (
                <Link
                  href={`/asset/${asset.ingestedAssetId}`}
                  className="flex items-center gap-0.5 text-[10px] text-primary hover:text-primary/80 transition-colors"
                  data-testid={`link-pipeline-dossier-${asset.id}`}
                >
                  Dossier →
                </Link>
              )}
              {asset.sourceUrl && (
                <a
                  href={asset.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                  data-testid={`link-pipeline-source-${asset.id}`}
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  Source
                </a>
              )}
            </div>
          </div>

          {/* Notes panel */}
          {notesOpen && (
            <div className="border-t border-white/20 dark:border-white/10 pt-2.5 -mx-0 flex flex-col gap-2">
              <div className="max-h-40 overflow-y-auto flex flex-col gap-1.5 pr-0.5">
                {notes.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center py-2">No notes yet</p>
                ) : (
                  notes.map((note) => (
                    <div
                      key={note.id}
                      className={`flex gap-1.5 ${note.isSystemEvent ? "opacity-60" : ""}`}
                      data-testid={`note-pipeline-${note.id}`}
                    >
                      {!note.isSystemEvent && (
                        <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[7px] font-bold shrink-0 mt-0.5">
                          {getInitials(note.authorName)}
                        </div>
                      )}
                      <div className={`flex-1 min-w-0 ${note.isSystemEvent ? "pl-5.5" : ""}`}>
                        {!note.isSystemEvent && (
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="font-medium text-foreground text-[10px]">{note.authorName}</span>
                            <span className="text-[9px] text-muted-foreground">{timeAgo(note.createdAt)}</span>
                          </div>
                        )}
                        <p className={`text-[10px] leading-relaxed break-words ${note.isSystemEvent ? "text-muted-foreground italic" : "text-foreground"}`}>
                          {note.content}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={notesEndRef} />
              </div>

              <div className="flex gap-1.5 items-end">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleNoteSubmit(); }
                  }}
                  placeholder="Add a note..."
                  rows={2}
                  className="flex-1 text-[10px] resize-none rounded border border-white/20 dark:border-white/10 bg-muted/20 px-2 py-1.5 focus:outline-none focus:border-primary/30 placeholder:text-muted-foreground"
                  data-testid={`textarea-pipeline-note-${asset.id}`}
                />
                <button
                  onClick={handleNoteSubmit}
                  disabled={!noteText.trim() || noteMutation.isPending}
                  className="w-6 h-6 rounded flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-90 shrink-0 mb-0.5"
                  data-testid={`button-pipeline-note-submit-${asset.id}`}
                >
                  {noteMutation.isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Send className="w-2.5 h-2.5" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type BriefModal = { stage: string; label: string; brief: string; assetCount: number };

export default function Pipeline() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [briefLoading, setBriefLoading] = useState<string | null>(null);
  const [briefModal, setBriefModal] = useState<BriefModal | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [showShareForm, setShowShareForm] = useState(false);
  const [shareBriefPassword, setShareBriefPassword] = useState("");
  const [shareBriefPasswordVisible, setShareBriefPasswordVisible] = useState(false);
  const [sourceTypeFilter, setSourceTypeFilter] = useState<"all" | "tto" | "patent" | "trial">("all");

  const { data, isLoading } = useQuery<SavedAssetsResponse>({
    queryKey: ["/api/saved-assets"],
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

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
    onError: (err: any) => {
      toast({ title: "Brief generation failed", description: err.message, variant: "destructive" });
      setBriefLoading(null);
    },
  });

  const shareBriefMutation = useMutation({
    mutationFn: async () => {
      if (!briefModal) throw new Error("No brief to share");
      const payload = {
        brief: briefModal.brief,
        pipelineName: briefModal.label,
        assetCount: briefModal.assetCount,
      };
      const body: Record<string, unknown> = { type: "pipeline_brief", payload };
      if (shareBriefPassword) body.password = shareBriefPassword;
      const res = await apiRequest("POST", "/api/share", body);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create share link");
      }
      return res.json() as Promise<{ token: string; expiresAt: string; url: string }>;
    },
    onSuccess: (data) => {
      setShareUrl(data.url);
      setShowShareForm(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to create share link", description: err.message, variant: "destructive" });
    },
  });

  const handleBrief = (stageKey: string) => {
    setBriefLoading(stageKey);
    briefMutation.mutate({ stage: stageKey });
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
      pipelineName: briefModal.label,
      assetCount: briefModal.assetCount,
    }));
    window.open("/pipeline/brief/print", "_blank");
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/saved-assets/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      toast({ title: "Asset removed from pipeline" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const savedAssets = data?.assets ?? [];

  function isPatentSource(sn: string) { return sn === "patent"; }
  function isTrialSource(sn: string) { return sn === "clinical_trial"; }

  const filteredSavedAssets = sourceTypeFilter === "all"
    ? savedAssets
    : savedAssets.filter((a) => {
        const sn = a.sourceName ?? "";
        if (sourceTypeFilter === "patent") return isPatentSource(sn);
        if (sourceTypeFilter === "trial") return isTrialSource(sn);
        return !isPatentSource(sn) && !isTrialSource(sn);
      });

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(savedAssets, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "helixradar-pipeline.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    if (savedAssets.length === 0) return;
    const headers = ["Asset Name", "Target", "Modality", "Stage", "Disease", "Summary", "Journal", "Year", "Source", "URL"];
    const rows = savedAssets.map((a) => [
      a.assetName, a.target, a.modality, a.developmentStage, a.diseaseIndication,
      `"${a.summary.replace(/"/g, '""')}"`, a.sourceJournal, a.publicationYear, a.sourceName, a.sourceUrl ?? "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "helixradar-pipeline.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const assetsByStage = STAGES.map((stage) => ({
    ...stage,
    assets: filteredSavedAssets.filter(
      (a) => (a.developmentStage?.toLowerCase().trim() || "unknown") === stage.key
    ),
  }));

  const totalAssets = savedAssets.length;
  const filteredCount = filteredSavedAssets.length;
  const nonEmptyStages = assetsByStage.filter((s) => s.assets.length > 0);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Nav />

      <main className="flex-1 flex flex-col">
        <div className="border-b border-border bg-card/30">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Drug Development{" "}
                  <span className="gradient-text dark:gradient-text gradient-text-light">
                    Pipeline
                  </span>
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {totalAssets > 0
                    ? sourceTypeFilter === "all"
                      ? `${totalAssets} asset${totalAssets !== 1 ? "s" : ""} across ${nonEmptyStages.length} stage${nonEmptyStages.length !== 1 ? "s" : ""}`
                      : `${filteredCount} ${sourceTypeFilter === "patent" ? "patent" : sourceTypeFilter === "trial" ? "trial" : "TTO"} asset${filteredCount !== 1 ? "s" : ""} of ${totalAssets} total`
                    : "Save assets from Discover to build your pipeline"}
                </p>
              </div>
              {totalAssets > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs border-card-border"
                    onClick={handleExportJson}
                    data-testid="button-pipeline-export-json"
                  >
                    <Download className="w-3 h-3" />
                    JSON
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs border-card-border"
                    onClick={handleExportCsv}
                    data-testid="button-pipeline-export-csv"
                  >
                    <Download className="w-3 h-3" />
                    CSV
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {totalAssets === 0 && !isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-24 px-6 text-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Beaker className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">Your pipeline is empty</h2>
              <p className="text-muted-foreground max-w-sm">
                Discover drug assets from scientific literature and save them here to build your pipeline.
              </p>
            </div>
            <Link href="/discover">
              <Button className="gap-2 mt-2" data-testid="button-go-discover">
                Start Discovering
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {totalAssets > 0 && (
              <div className="border-b border-border bg-background">
                <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide shrink-0">View:</span>
                  {([
                    { key: "all",     label: "All" },
                    { key: "tto",     label: "TTO Assets" },
                    { key: "patent",  label: "Patents" },
                    { key: "trial",   label: "Clinical Trials" },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setSourceTypeFilter(key)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all duration-150 ${
                        sourceTypeFilter === key
                          ? "border-primary bg-primary/15 text-primary font-medium"
                          : "border-card-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40"
                      }`}
                      data-testid={`filter-source-type-${key}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          <div className="flex-1 overflow-x-auto">
            <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
              {filteredCount === 0 && totalAssets > 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                  <p className="text-sm font-medium text-foreground">No {sourceTypeFilter === "patent" ? "patent" : sourceTypeFilter === "trial" ? "trial" : "TTO"} assets in pipeline</p>
                  <p className="text-xs text-muted-foreground">Save {sourceTypeFilter === "patent" ? "patents" : sourceTypeFilter === "trial" ? "clinical trials" : "TTO assets"} from Scout to see them here.</p>
                  <button onClick={() => setSourceTypeFilter("all")} className="text-xs text-primary hover:underline mt-1" data-testid="button-clear-source-filter">Show all assets</button>
                </div>
              ) : (
              <div className="flex gap-4 min-w-max pb-4">
                {assetsByStage.map((stage) => (
                  <div
                    key={stage.key}
                    className={`flex flex-col w-64 rounded-lg border ${stage.colorClass} shrink-0`}
                    data-testid={`pipeline-column-${stage.key.replace(" ", "-")}`}
                  >
                    <div className="flex items-center justify-between px-3.5 py-3 border-b border-inherit">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${stage.dotClass}`} />
                        <span className="text-sm font-semibold text-foreground">{stage.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-muted-foreground tabular-nums w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center">
                          {stage.assets.length}
                        </span>
                        {stage.key !== "unknown" && stage.assets.length > 0 && (
                          <button
                            onClick={() => handleBrief(stage.key)}
                            disabled={briefLoading === stage.key}
                            className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-50"
                            data-testid={`button-pipeline-brief-${stage.key.replace(" ", "-")}`}
                            title="Generate pipeline brief"
                          >
                            {briefLoading === stage.key ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <FileText className="w-2.5 h-2.5" />
                            )}
                            Brief
                          </button>
                        )}
                      </div>
                    </div>

                    <ScrollArea className="flex-1 max-h-[calc(100vh-16rem)]">
                      <div className="p-2.5 flex flex-col gap-2">
                        {stage.assets.length === 0 ? (
                          <div className="py-8 text-center">
                            <p className="text-xs text-muted-foreground">No assets</p>
                          </div>
                        ) : (
                          stage.assets.map((asset) => (
                            <PipelineCard
                              key={asset.id}
                              asset={asset}
                              onDelete={(id) => deleteMutation.mutate(id)}
                            />
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                ))}
              </div>
              )}
            </div>
          </div>
          </>
        )}
      </main>

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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowShareForm(true); setShareUrl(null); setShareBriefPassword(""); setShareBriefPasswordVisible(false); }}
                  disabled={shareBriefMutation.isPending}
                  className="h-7 text-xs gap-1.5 border-card-border"
                  data-testid="button-brief-share"
                >
                  <Share2 className="w-3 h-3" />
                  Share
                </Button>
              </div>
            </div>
            {showShareForm && !shareUrl && (
              <div className="flex flex-col gap-2 mt-2" data-testid="share-form-row">
                <div className="flex gap-2 items-center">
                  <Input
                    type={shareBriefPasswordVisible ? "text" : "password"}
                    placeholder="Password (optional)"
                    value={shareBriefPassword}
                    onChange={(e) => setShareBriefPassword(e.target.value)}
                    className="h-7 text-xs"
                    data-testid="input-brief-share-password"
                  />
                  <Button size="sm" variant="ghost" className="h-7 px-2 shrink-0" onClick={() => setShareBriefPasswordVisible(v => !v)} data-testid="button-brief-toggle-password">
                    {shareBriefPasswordVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => shareBriefMutation.mutate()}
                    disabled={shareBriefMutation.isPending}
                    className="h-7 text-xs gap-1.5 shrink-0"
                    data-testid="button-create-brief-share-link"
                  >
                    {shareBriefMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Share2 className="w-3 h-3" />}
                    {shareBriefMutation.isPending ? "..." : "Create Link"}
                  </Button>
                </div>
              </div>
            )}
            {shareUrl && (
              <div className="flex gap-2 mt-2" data-testid="share-url-row">
                {shareBriefPassword && <Lock className="w-3 h-3 text-amber-500 shrink-0 self-center" />}
                <Input
                  readOnly
                  value={shareUrl}
                  className="h-7 text-xs font-mono"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  data-testid="input-brief-share-url"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1.5 text-xs border-card-border"
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl).then(() => {
                      setShareLinkCopied(true);
                      setTimeout(() => setShareLinkCopied(false), 2000);
                    });
                  }}
                  data-testid="button-copy-brief-share-url"
                >
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
