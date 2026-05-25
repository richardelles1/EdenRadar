import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import {
  Download, Trash2, FlaskConical, ExternalLink, ArrowRight, Beaker, Loader2,
  FileText, ChevronLeft, ChevronRight, Send, Link2, X, MessageSquare, Plus, Check,
  LayoutDashboard, LayoutGrid, GripVertical, Layers, Building2,
} from "lucide-react";
import type { SavedAsset } from "@shared/schema";
import { SAVED_ASSET_STATUSES } from "@shared/schema";
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SCOUT_CARD_TINTS, type ScoutCardCategory } from "@/lib/scoutCardTints";

// ── Types ─────────────────────────────────────────────────────────────────────

type AssetNote = { id: number; authorName: string; content: string; createdAt: string; isSystemEvent: boolean };
type NotesResponse = { notes: AssetNote[]; limit: number; offset: number };
type SavedAssetsResponse = {
  assets: (SavedAsset & { noteCount?: number; lastNoteAt?: string | null })[];
};
type PipelineAsset = SavedAsset & { noteCount?: number; lastNoteAt?: string | null };
type DeckAsset = PipelineAsset & { signals: PipelineAsset[] };
type ViewMode = "grid" | "board";
type GridFilterType = "all" | "tto" | "trial" | "patent" | "research";
type SortOrder = "date" | "az" | "stage";
type PipelineList = { id: number; name: string; userId: string; createdAt: string };
type PipelinesResponse = { pipelines: PipelineList[] };

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; pill: string }> = {
  watching:      { label: "Watching",      pill: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30" },
  evaluating:    { label: "Evaluating",    pill: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  in_discussion: { label: "In Discussion", pill: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  on_hold:       { label: "On Hold",       pill: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  passed:        { label: "Passed",        pill: "bg-red-500/15 text-red-400 border-red-500/30" },
};

const BOARD_COLUMNS: { key: string | null; label: string; colorClass: string; dotClass: string }[] = [
  { key: null,           label: "New",           colorClass: "border-border bg-muted/10",               dotClass: "bg-muted-foreground/40" },
  { key: "watching",    label: "Watching",       colorClass: "border-neutral-500/30 bg-neutral-500/5",  dotClass: "bg-neutral-400" },
  { key: "evaluating",  label: "Evaluating",     colorClass: "border-blue-500/30 bg-blue-500/5",        dotClass: "bg-blue-400" },
  { key: "in_discussion", label: "In Discussion",colorClass: "border-emerald-500/30 bg-emerald-500/5",  dotClass: "bg-emerald-400" },
  { key: "on_hold",     label: "On Hold",        colorClass: "border-amber-500/30 bg-amber-500/5",      dotClass: "bg-amber-400" },
  { key: "passed",      label: "Passed",         colorClass: "border-red-500/30 bg-red-500/5",          dotClass: "bg-red-400" },
];

const STAGE_ABBREV: Record<string, string> = {
  discovery: "DI", preclinical: "PC", "phase 1": "P1", "phase 2": "P2", "phase 3": "P3", approved: "AP",
};


// ── Source helpers ─────────────────────────────────────────────────────────────

const NON_TTO_SRC = ["patent", "clinical_trial", "pubmed", "biorxiv", "medrxiv", "literature", "arxiv", "preprint", "paper"];

function isTtoSource(sourceName?: string | null): boolean {
  if (!sourceName) return false;
  const sn = sourceName.toLowerCase();
  return !NON_TTO_SRC.some((s) => sn === s || sn.includes(s));
}

function getSourceCategory(sourceName?: string | null): ScoutCardCategory {
  const sn = (sourceName ?? "").toLowerCase();
  if (sn === "patent") return "patent";
  if (sn === "clinical_trial" || sn.includes("trial")) return "trial";
  if (NON_TTO_SRC.some((s) => sn.includes(s))) return "research";
  return "tto";
}

function getSourceLabel(sourceName?: string | null): string {
  const cat = getSourceCategory(sourceName);
  if (cat === "patent") return "Patent";
  if (cat === "trial") return "Clinical Trial";
  if (cat === "research") return "Research";
  return "TTO Asset";
}

// ── Misc helpers ───────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  if (!str) return str;
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

const PILL_MUTED = "text-zinc-500 dark:text-zinc-400";
function stagePillClass(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes("phase 3") || s.includes("phase iii") || s.includes("approved") || s.includes("marketed"))
    return `bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-700/30 ${PILL_MUTED}`;
  if (s.includes("phase 2") || s.includes("phase ii"))
    return `bg-violet-50 dark:bg-violet-950/40 border border-violet-200/70 dark:border-violet-700/30 ${PILL_MUTED}`;
  if (s.includes("phase 1") || (s.includes("phase i") && !s.includes("phase ii") && !s.includes("phase iii")))
    return `bg-sky-50 dark:bg-sky-950/40 border border-sky-200/70 dark:border-sky-700/30 ${PILL_MUTED}`;
  return `bg-zinc-100 dark:bg-zinc-700/50 border border-zinc-200/80 dark:border-zinc-600/50 ${PILL_MUTED}`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff <= 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── SignalMiniCard ─────────────────────────────────────────────────────────────

function SignalMiniCard({ signal, onDetach, draggable = false }: {
  signal: PipelineAsset;
  onDetach?: () => void;
  draggable?: boolean;
}) {
  const cat = getSourceCategory(signal.sourceName);
  const tint = SCOUT_CARD_TINTS[cat];
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `signal-${signal.id}`,
    disabled: !draggable,
    data: { type: "signal", assetId: signal.id },
  });

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? attributes : {})}
      className={`relative flex items-center gap-2 bg-white dark:bg-zinc-900 border border-white/80 dark:border-white/10 rounded-[10px] px-3 py-2.5 overflow-hidden transition-opacity ${isDragging ? "opacity-40" : ""}`}
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[10px]" style={{ background: tint.stripColor }} />
      {draggable && (
        <div {...listeners} className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground/40 hover:text-muted-foreground -ml-1">
          <GripVertical className="w-3 h-3" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: tint.stripColor }}>{getSourceLabel(signal.sourceName)}</p>
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
          <button onClick={(e) => { e.stopPropagation(); onDetach(); }} title="Detach" className="text-muted-foreground hover:text-destructive transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── CardFaceContent — pure visual component for a single card face ────────────

function CardFaceContent({ asset, hovered = false, compact = false, inDeck = false }: { asset: PipelineAsset; hovered?: boolean; compact?: boolean; inDeck?: boolean }) {
  const cat = getSourceCategory(asset.sourceName);
  const tint = SCOUT_CARD_TINTS[cat];
  const isTto = isTtoSource(asset.sourceName);
  const stageAbbr = STAGE_ABBREV[asset.developmentStage?.toLowerCase().trim() ?? ""] ?? "";
  const displayTitle = asset.assetName !== "unknown" ? asset.assetName : (asset.sourceTitle ?? "Untitled");

  return (
    <div className={`absolute inset-0 rounded-[17px] overflow-hidden ${tint.containerBg}`}>
      {/* Bloom */}
      <div className="absolute pointer-events-none" style={{
        width: "56px", height: "56px", borderRadius: "50%",
        background: tint.stripColor + "8C",
        top: "-28px", left: "-28px",
        transform: hovered ? "scale(26)" : "scale(1)",
        opacity: hovered ? 0.13 : 0,
        transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
        zIndex: 1,
      }} />

      {/* Left accent strip */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] z-[3]" style={{ background: tint.stripColor }} />

      {/* Top-left badge */}
      <div
        className="absolute top-0 left-0 z-[5] flex flex-col items-center justify-center px-3 py-1.5 border-b border-r bg-white dark:bg-zinc-900"
        style={{ borderRadius: "17px 0 10px 0", minWidth: "52px", borderColor: tint.stripColor + "40" }}
      >
        {isTto && stageAbbr ? (
          <>
            <span className="text-[7px] font-bold tracking-[0.15em] uppercase leading-none text-muted-foreground">Stage</span>
            <span className="font-mono text-xs font-bold leading-tight mt-0.5" style={{ color: tint.stripColor }}>{stageAbbr}</span>
          </>
        ) : (
          <span className="text-[9px] font-bold uppercase tracking-wide leading-none" style={{ color: tint.stripColor }}>{getSourceLabel(asset.sourceName)}</span>
        )}
      </div>

      {/* Content */}
      <div className={`absolute inset-0 z-[4] flex flex-col pl-4 pr-3 pt-[52px] ${compact ? "pb-3" : "pb-10"}`}>
        <h3 className="text-[13px] font-semibold text-foreground leading-snug line-clamp-3 mt-1">
          {displayTitle}
        </h3>

        <div className="flex-1 flex flex-col gap-1.5 mt-2 min-h-0 overflow-hidden">
          {cat === "tto" && (
            <>
              {asset.diseaseIndication && asset.diseaseIndication !== "unknown" && (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug line-clamp-1">{asset.diseaseIndication}</p>
              )}
              <div className="flex flex-wrap gap-1 mt-0.5">
                {asset.developmentStage && asset.developmentStage !== "unknown" && (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full select-none ${stagePillClass(asset.developmentStage)}`}>{asset.developmentStage}</span>
                )}
                {asset.modality && asset.modality !== "unknown" && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full select-none bg-zinc-100 dark:bg-zinc-700/50 border border-zinc-200/80 dark:border-zinc-600/50 text-zinc-500 dark:text-zinc-400">{asset.modality}</span>
                )}
              </div>
              {asset.sourceJournal && asset.sourceJournal !== "Unknown" && (
                <p className="flex items-center gap-1 text-[11px] text-zinc-700 dark:text-zinc-300 font-medium line-clamp-1 mt-auto">
                  <Building2 className="w-2.5 h-2.5 shrink-0 opacity-50" />{toTitleCase(asset.sourceJournal)}
                </p>
              )}
            </>
          )}
          {cat === "patent" && (
            <>
              {asset.publicationYear && (
                <p className="text-[10px] text-muted-foreground">{asset.publicationYear}</p>
              )}
              {asset.diseaseIndication && asset.diseaseIndication !== "unknown" && (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug line-clamp-2">{asset.diseaseIndication}</p>
              )}
              {asset.sourceJournal && asset.sourceJournal !== "Unknown" && (
                <p className="flex items-center gap-1 text-[11px] text-zinc-700 dark:text-zinc-300 font-medium line-clamp-1 mt-auto">
                  <Building2 className="w-2.5 h-2.5 shrink-0 opacity-50" />{toTitleCase(asset.sourceJournal)}
                </p>
              )}
            </>
          )}
          {cat === "trial" && (
            <>
              {asset.developmentStage && asset.developmentStage !== "unknown" && (
                <span className="self-start text-[10px] font-medium px-2 py-0.5 rounded-full border" style={{ borderColor: tint.stripColor + "40", color: tint.stripColor, background: tint.stripColor + "18" }}>
                  {asset.developmentStage}
                </span>
              )}
              {asset.diseaseIndication && asset.diseaseIndication !== "unknown" && (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug line-clamp-2">{asset.diseaseIndication}</p>
              )}
              {asset.sourceJournal && asset.sourceJournal !== "Unknown" && (
                <p className="flex items-center gap-1 text-[11px] text-zinc-700 dark:text-zinc-300 font-medium line-clamp-1 mt-auto">
                  <Building2 className="w-2.5 h-2.5 shrink-0 opacity-50" />{toTitleCase(asset.sourceJournal)}
                </p>
              )}
            </>
          )}
          {cat === "research" && (
            <>
              {asset.sourceJournal && asset.sourceJournal !== "Unknown" && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium line-clamp-1">{toTitleCase(asset.sourceJournal)}</p>
              )}
              {asset.publicationYear && (
                <p className="text-[10px] text-muted-foreground">{asset.publicationYear}</p>
              )}
              {asset.diseaseIndication && asset.diseaseIndication !== "unknown" && (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug line-clamp-2">{asset.diseaseIndication}</p>
              )}
            </>
          )}
        </div>

        {/* Footer strip for standalone non-TTO cards — suppressed when used as a face inside a TTO deck */}
        {!isTto && !inDeck && (
          <div className="flex items-center gap-1 pt-2 border-t border-white/20 dark:border-white/10 mt-auto">
            <span className="text-[10px] text-muted-foreground flex-1">Drag to stack</span>
            {asset.sourceUrl && (
              <a
                href={asset.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── PipelineCard — full multi-face deck with animated face transitions ─────────

function PipelineCard({ asset, signals = [], onDelete, onClick }: {
  asset: PipelineAsset;
  signals?: PipelineAsset[];
  onDelete: (id: number) => void;
  onClick?: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, active: false });
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [faceIdx, setFaceIdx] = useState(0);

  const faces = [asset, ...signals];

  useEffect(() => {
    setFaceIdx((i) => Math.min(i, Math.max(0, faces.length - 1)));
  }, [faces.length]);

  const isTto = isTtoSource(asset.sourceName);
  const hasMultipleFaces = faces.length > 1;

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `tto-drop-${asset.id}`,
    data: { type: "tto-drop", ttoId: asset.id },
    disabled: !isTto,
  });
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `signal-${asset.id}`,
    data: { type: "signal", assetId: asset.id },
    disabled: isTto,
  });

  const setRef = (el: HTMLDivElement | null) => {
    (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    setDropRef(el);
    if (!isTto) setDragRef(el);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setTilt({ x: ((e.clientY - rect.top) / rect.height - 0.5) * -10, y: ((e.clientX - rect.left) / rect.width - 0.5) * 10, active: true });
  };
  const handleMouseLeave = () => { setHovered(false); setTilt({ x: 0, y: 0, active: false }); setPressed(false); };

  return (
    <div className={`relative transition-opacity ${isDragging ? "opacity-30" : ""}`}>
      {isOver && <div className="absolute inset-0 rounded-[17px] ring-2 ring-emerald-400 ring-offset-2 z-20 pointer-events-none" />}

      <div style={{ perspective: "1000px" }} className={isTto ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}>
        <div
          ref={setRef}
          className="relative w-full h-[260px] rounded-[17px] overflow-hidden border border-white/90 dark:border-white/10"
          style={{
            willChange: "transform",
            transformStyle: "preserve-3d",
            transform: pressed
              ? "perspective(1000px) scale(0.96) rotateZ(0.4deg)"
              : tilt.active
              ? `perspective(1000px) scale(1.015) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`
              : "perspective(1000px)",
            transition: pressed ? "transform 0.07s ease-in, box-shadow 0.1s" : tilt.active ? "transform 0.08s ease-out, box-shadow 0.2s" : "transform 0.5s cubic-bezier(0.23,1,0.32,1), box-shadow 0.4s",
            boxShadow: (hovered || isOver) ? "0 16px 48px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.10)" : "0 4px 20px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)",
          }}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={handleMouseLeave}
          onMouseDown={() => setPressed(true)}
          onMouseUp={() => setPressed(false)}
          onClick={onClick}
          {...(isTto ? {} : { ...attributes, ...listeners })}
          data-testid={`pipeline-card-${asset.id}`}
        >
          {/* Face layers — each face is the full card visual */}
          {faces.map((face, idx) => (
            <div
              key={face.id}
              className="absolute inset-0"
              style={{
                opacity: idx === faceIdx ? 1 : 0,
                transform: idx === faceIdx
                  ? "translateX(0) scale(1)"
                  : idx < faceIdx
                  ? "translateX(-24px) scale(0.97)"
                  : "translateX(24px) scale(0.97)",
                transition: "opacity 0.18s ease, transform 0.22s cubic-bezier(0.34,1.3,0.64,1)",
                pointerEvents: idx === faceIdx ? "auto" : "none",
              }}
            >
              <CardFaceContent asset={face} hovered={hovered} inDeck={idx > 0} />
            </div>
          ))}

          {/* Delete button */}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute top-1.5 right-1.5 z-[20] w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all active:scale-90"
            data-testid={`button-delete-pipeline-${asset.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Nav buttons — no gradient, solid pill buttons so they're always readable */}
          {hasMultipleFaces && (
            <div className="absolute bottom-2.5 left-0 right-0 z-[20] flex items-center justify-center gap-1.5 px-2">
              <button
                onClick={(e) => { e.stopPropagation(); setFaceIdx((i) => Math.max(0, i - 1)); }}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={faceIdx === 0}
                className="w-6 h-6 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/75 disabled:opacity-25 transition-all shrink-0 shadow-sm"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-sm text-[9px] text-white tabular-nums shadow-sm">{faceIdx + 1}/{faces.length}</span>
              <button
                onClick={(e) => { e.stopPropagation(); setFaceIdx((i) => Math.min(faces.length - 1, i + 1)); }}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={faceIdx === faces.length - 1}
                className="w-6 h-6 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/75 disabled:opacity-25 transition-all shrink-0 shadow-sm"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Signal color slivers below TTO cards */}
      {isTto && signals.length > 0 && (
        <div className="relative -mt-1 mx-1.5">
          {signals.slice(0, 3).map((sig, idx) => {
            const sigTint = SCOUT_CARD_TINTS[getSourceCategory(sig.sourceName)];
            return (
              <div key={sig.id} style={{
                background: sigTint.stripColor,
                height: "5px", marginTop: "1px",
                marginLeft: `${(idx + 1) * 4}px`, marginRight: `${(idx + 1) * 4}px`,
                opacity: 0.5 - idx * 0.12,
                borderRadius: "0 0 4px 4px",
              }} />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── BoardCard — uses same CardFaceContent visual as the grid ─────────────────

function BoardCard({ asset, signals = [], onClick, onDelete }: {
  asset: PipelineAsset;
  signals?: PipelineAsset[];
  onClick: () => void;
  onDelete: (id: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tto-${asset.id}`,
    data: { type: "tto", assetId: asset.id },
  });

  const hasSignals = signals.length > 0;

  return (
    <div
      className={`relative transition-opacity ${isDragging ? "opacity-30" : ""}`}
    >
      <div
        ref={setNodeRef}
        className="relative w-full h-[210px] rounded-[17px] overflow-hidden border border-white/90 dark:border-white/10 cursor-pointer"
        style={{ boxShadow: hovered ? "0 16px 48px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.10)" : "0 4px 20px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)", transition: "box-shadow 0.25s ease" }}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        {...attributes}
        {...listeners}
        data-testid={`board-card-${asset.id}`}
      >
        <CardFaceContent asset={asset} hovered={hovered} compact />

        {/* Delete button */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute top-1.5 right-1.5 z-[20] w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all active:scale-90"
          data-testid={`button-delete-board-${asset.id}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {/* Signal + note count badges — bottom-right */}
        {(hasSignals || (asset.noteCount ?? 0) > 0) && (
          <div className="absolute bottom-2 right-2 z-[20] flex items-center gap-1.5">
            {hasSignals && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-[9px] text-white">
                <Link2 className="w-2.5 h-2.5" />{signals.length}
              </span>
            )}
            {(asset.noteCount ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-[9px] text-white">
                <MessageSquare className="w-2.5 h-2.5" />{asset.noteCount}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Signal color slivers below board cards */}
      {hasSignals && (
        <div className="relative -mt-1 mx-1.5">
          {signals.slice(0, 3).map((sig, idx) => {
            const sigTint = SCOUT_CARD_TINTS[getSourceCategory(sig.sourceName)];
            return (
              <div key={sig.id} style={{
                background: sigTint.stripColor,
                height: "5px", marginTop: "1px",
                marginLeft: `${(idx + 1) * 4}px`, marginRight: `${(idx + 1) * 4}px`,
                opacity: 0.5 - idx * 0.12,
                borderRadius: "0 0 4px 4px",
              }} />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── KanbanColumn — droppable column for the board view ────────────────────────

function KanbanColumn({ col, decks, onDelete, onCardClick }: {
  col: typeof BOARD_COLUMNS[number];
  decks: DeckAsset[];
  onDelete: (id: number) => void;
  onCardClick: (asset: DeckAsset) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `status-col-${col.key ?? "unassigned"}`,
    data: { type: "status-drop", status: col.key },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-52 rounded-xl border shrink-0 transition-colors ${col.colorClass} ${isOver ? "ring-2 ring-primary/40" : ""}`}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-inherit">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${col.dotClass}`} />
          <span className="text-xs font-semibold text-foreground">{col.label}</span>
        </div>
        <span className="text-[10px] font-bold text-muted-foreground tabular-nums min-w-[16px] h-4 rounded-full bg-muted/60 flex items-center justify-center px-1">{decks.length}</span>
      </div>
      <ScrollArea className="flex-1 max-h-[calc(100vh-16rem)]">
        <div className="p-2 flex flex-col gap-2">
          {decks.length === 0 ? (
            <div className={`py-10 text-center rounded-lg border-2 border-dashed border-inherit transition-colors ${isOver ? "border-primary/40 bg-primary/5" : ""}`}>
              <p className="text-[10px] text-muted-foreground">Drop here</p>
            </div>
          ) : (
            decks.map((deck) => (
              <BoardCard
                key={deck.id}
                asset={deck}
                signals={deck.signals}
                onClick={() => onCardClick(deck)}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── AssetDrawer — Overview (metadata + signals) / Activity (stage + notes) ─────

const TAB_TRIGGER_CLS = "text-xs px-0 h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground bg-transparent shadow-none data-[state=active]:shadow-none";

function AssetDrawer({ asset, signals = [], onClose, onDetachSignal, onDelete, pipelines = [] }: {
  asset: PipelineAsset | null;
  signals?: PipelineAsset[];
  onClose: () => void;
  onDetachSignal: (signalId: number) => void;
  onDelete: (id: number) => void;
  pipelines?: PipelineList[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  const [noteText, setNoteText] = useState("");
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [localPipelineId, setLocalPipelineId] = useState<number | null | undefined>(undefined);
  const [drawerCreatingPipeline, setDrawerCreatingPipeline] = useState(false);
  const [drawerNewPipelineName, setDrawerNewPipelineName] = useState("");
  const notesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (asset) {
      setLocalStatus(asset.status ?? null);
      setLocalPipelineId(asset.pipelineListId ?? null);
      setNoteText("");
      setActiveTab("overview");
    }
  }, [asset?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectivePipelineId = localPipelineId !== undefined ? localPipelineId : (asset?.pipelineListId ?? null);

  // Fetch eagerly so the Activity count badge matches the visible list
  const { data: notesData, isLoading: notesLoading } = useQuery<NotesResponse>({
    queryKey: ["/api/saved-assets", asset?.id, "notes"],
    queryFn: async () => {
      const res = await fetch(`/api/saved-assets/${asset!.id}/notes?limit=50`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!asset,
    staleTime: 0,
  });
  const notes = notesData?.notes ?? [];

  useEffect(() => {
    if (notesEndRef.current && activeTab === "activity") {
      notesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [notes.length, activeTab]);

  const statusMutation = useMutation<unknown, Error, string | null, { prev: string | null }>({
    mutationFn: async (status) => {
      if (!asset) throw new Error("No asset");
      const res = await apiRequest("PATCH", `/api/saved-assets/${asset.id}/status`, { status });
      return res.json();
    },
    onMutate: (s) => { const prev = localStatus; setLocalStatus(s); return { prev }; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/saved-assets"] }),
    onError: (err, _, ctx) => { if (ctx) setLocalStatus(ctx.prev); toast({ title: "Status update failed", description: err.message, variant: "destructive" }); },
  });

  const pipelineMutation = useMutation<unknown, Error, number | null, { prev: number | null }>({
    mutationFn: async (pipelineListId) => {
      if (!asset) throw new Error("No asset");
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/saved-assets/${asset.id}/pipeline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ pipeline_list_id: pipelineListId }),
      });
      if (!res.ok) throw new Error("Failed to move asset");
      return res.json();
    },
    onMutate: (id) => { const prev = effectivePipelineId; setLocalPipelineId(id); return { prev }; },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      qc.invalidateQueries({ queryKey: ["/api/pipelines"] });
      toast({ title: "Pipeline updated" });
    },
    onError: (err, _, ctx) => {
      if (ctx) setLocalPipelineId(ctx.prev);
      toast({ title: "Pipeline update failed", description: err.message, variant: "destructive" });
    },
  });

  const drawerCreatePipelineMutation = useMutation({
    mutationFn: async (name: string) => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ name, shared: false }),
      });
      if (!res.ok) throw new Error("Failed to create pipeline");
      return res.json();
    },
    onSuccess: ({ pipeline }) => {
      qc.invalidateQueries({ queryKey: ["/api/pipelines"] });
      pipelineMutation.mutate(pipeline.id);
      setDrawerCreatingPipeline(false);
      setDrawerNewPipelineName("");
    },
    onError: (err: any) => toast({ title: "Failed to create", description: err.message, variant: "destructive" }),
  });

  const noteMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!asset) throw new Error("No asset");
      const res = await apiRequest("POST", `/api/saved-assets/${asset.id}/notes`, { content });
      return res.json();
    },
    onSuccess: (createdNote, _content) => {
      setNoteText("");
      if (asset) {
        // Immediately append to cache so the note appears without waiting for a refetch
        qc.setQueryData(
          ["/api/saved-assets", asset.id, "notes"],
          (old: NotesResponse | undefined): NotesResponse => ({
            notes: [...(old?.notes ?? []), createdNote],
            limit: old?.limit ?? 50,
            offset: old?.offset ?? 0,
          }),
        );
        qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      }
    },
    onError: (err: any) => toast({ title: "Note failed", description: err.message, variant: "destructive" }),
  });

  if (!asset) return null;

  const tint = SCOUT_CARD_TINTS[getSourceCategory(asset.sourceName)];
  const statusCfg = localStatus ? STATUS_CONFIG[localStatus] : null;
  const stageAbbr = STAGE_ABBREV[asset.developmentStage?.toLowerCase().trim() ?? ""];
  const noteCount = notes.length;

  return (
    <Sheet open={!!asset} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0 gap-0 overflow-hidden" side="right">

        {/* Header */}
        <div className="shrink-0 border-b border-border px-5 py-4" style={{ borderTop: `3px solid ${tint.stripColor}` }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: tint.stripColor }}>{getSourceLabel(asset.sourceName)}</span>
                {stageAbbr && <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{stageAbbr}</span>}
                {statusCfg && <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border ${statusCfg.pill}`}>{statusCfg.label}</span>}
              </div>
              <h2 className="font-bold text-base text-foreground leading-snug">
                {asset.assetName !== "unknown" ? asset.assetName : "Unnamed Asset"}
              </h2>
            </div>
            <button onClick={onClose} className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full rounded-none border-b border-border bg-transparent h-10 px-5 justify-start gap-6 shrink-0">
            <TabsTrigger value="overview" className={TAB_TRIGGER_CLS}>
              Overview{signals.length > 0 ? ` (${signals.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="activity" className={TAB_TRIGGER_CLS}>
              Activity{noteCount > 0 ? ` (${noteCount})` : ""}
            </TabsTrigger>
          </TabsList>

          {/* ── Overview: metadata + signals (scrollable) + action links (pinned) ── */}
          <TabsContent value="overview" className="flex-1 flex flex-col min-h-0 m-0">

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">

              {/* Metadata grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                {asset.target && asset.target !== "unknown" && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Target</p>
                    <p className="text-foreground font-semibold">{asset.target}</p>
                  </div>
                )}
                {asset.diseaseIndication && asset.diseaseIndication !== "unknown" && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Disease</p>
                    <p className="text-foreground font-semibold">{asset.diseaseIndication}</p>
                  </div>
                )}
                {asset.modality && asset.modality !== "unknown" && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Modality</p>
                    <p className="text-foreground font-semibold">{asset.modality}</p>
                  </div>
                )}
                {asset.developmentStage && asset.developmentStage !== "unknown" && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Stage</p>
                    <p className="text-foreground font-semibold">{asset.developmentStage}</p>
                  </div>
                )}
                {asset.sourceJournal && asset.sourceJournal !== "Unknown" && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Institution</p>
                    <p className="text-foreground font-semibold">{toTitleCase(asset.sourceJournal)}</p>
                  </div>
                )}
                {asset.publicationYear && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Year</p>
                    <p className="text-foreground font-semibold">{asset.publicationYear}</p>
                  </div>
                )}
              </div>

              {/* Summary */}
              {asset.summary && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Summary</p>
                  <p className="text-sm text-foreground/90 leading-relaxed">{asset.summary}</p>
                </div>
              )}

              {/* Pipeline assignment */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Pipeline</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => pipelineMutation.mutate(null)}
                    disabled={pipelineMutation.isPending}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${effectivePipelineId === null ? "bg-primary text-primary-foreground border-primary font-semibold" : "border-border text-foreground hover:border-primary/30 hover:bg-muted/40"}`}
                  >
                    Uncategorised
                  </button>
                  {pipelines.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={() => pipelineMutation.mutate(pl.id)}
                      disabled={pipelineMutation.isPending}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${effectivePipelineId === pl.id ? "bg-primary text-primary-foreground border-primary font-semibold" : "border-border text-foreground hover:border-primary/30 hover:bg-muted/40"}`}
                    >
                      {pl.name}
                    </button>
                  ))}
                </div>
                {drawerCreatingPipeline ? (
                  <div className="flex gap-1.5 mt-2">
                    <input
                      autoFocus
                      value={drawerNewPipelineName}
                      onChange={(e) => setDrawerNewPipelineName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && drawerNewPipelineName.trim()) drawerCreatePipelineMutation.mutate(drawerNewPipelineName.trim());
                        if (e.key === "Escape") { setDrawerCreatingPipeline(false); setDrawerNewPipelineName(""); }
                      }}
                      placeholder="Pipeline name…"
                      className="flex-1 text-xs border border-border rounded-lg px-2.5 py-1.5 bg-transparent focus:outline-none focus:border-primary/40 text-foreground placeholder:text-muted-foreground"
                    />
                    <button
                      onClick={() => { if (drawerNewPipelineName.trim()) drawerCreatePipelineMutation.mutate(drawerNewPipelineName.trim()); }}
                      disabled={!drawerNewPipelineName.trim() || drawerCreatePipelineMutation.isPending}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all shrink-0"
                    >
                      {drawerCreatePipelineMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDrawerCreatingPipeline(true)}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors mt-2"
                  >
                    <Plus className="w-3 h-3" /> New pipeline
                  </button>
                )}
              </div>

              {/* Supporting signals — TTO assets only */}
              {isTtoSource(asset.sourceName) && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    Supporting Signals{signals.length > 0 ? ` (${signals.length})` : ""}
                  </p>
                  {signals.length === 0 ? (
                    <p className="text-xs text-foreground/60 italic leading-relaxed">
                      No signals attached. In the Grid view, drag a patent, paper, or clinical trial card onto this asset to attach it as supporting evidence.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {signals.map((sig) => (
                        <SignalMiniCard key={sig.id} signal={sig} draggable onDetach={() => onDetachSignal(sig.id)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action links — pinned to bottom, always visible */}
            <div className="shrink-0 border-t border-border px-5 py-4 flex flex-col gap-2.5">
              {asset.sourceUrl && (
                <a href={asset.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" /> View Source
                </a>
              )}
              {asset.ingestedAssetId && (
                <button onClick={() => navigate(`/asset/${asset.ingestedAssetId}`)} className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors text-left">
                  <FileText className="w-3.5 h-3.5" /> Open Full Dossier →
                </button>
              )}
              <button
                onClick={() => { onDelete(asset.id); onClose(); }}
                className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove from Pipeline
              </button>
            </div>
          </TabsContent>

          {/* ── Activity: deal stage (fixed top) + notes feed + input (pinned bottom) ── */}
          <TabsContent value="activity" className="flex-1 flex flex-col min-h-0 m-0">

            {/* Deal stage — compact, fixed */}
            <div className="shrink-0 px-5 pt-4 pb-3 border-b border-border">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">Deal Stage</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => statusMutation.mutate(null)}
                  disabled={statusMutation.isPending}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${localStatus === null ? "bg-muted text-foreground border-muted-foreground/30 font-semibold" : "border-border text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"}`}
                >
                  None
                </button>
                {SAVED_ASSET_STATUSES.map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  return (
                    <button
                      key={s}
                      onClick={() => statusMutation.mutate(s)}
                      disabled={statusMutation.isPending}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${localStatus === s ? `${cfg.pill} font-semibold` : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"}`}
                    >
                      {cfg?.label ?? s}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes feed — scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
              {notesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : notes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                  <div className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-foreground/70 leading-relaxed max-w-[200px]">
                    No activity yet — add a note below or set a deal stage above.
                  </p>
                </div>
              ) : (
                notes.map((note) => (
                  <div key={note.id}>
                    {note.isSystemEvent ? (
                      <div className="flex items-center gap-2 py-0.5">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{note.content}</span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    ) : (
                      <div className="flex gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[8px] font-bold shrink-0 mt-0.5">
                          {getInitials(note.authorName)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[10px] font-semibold text-foreground">{note.authorName}</span>
                            <span className="text-[10px] text-muted-foreground">{timeAgo(note.createdAt)}</span>
                          </div>
                          <p className="text-xs text-foreground leading-relaxed break-words">{note.content}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={notesEndRef} />
            </div>

            {/* Note input — pinned to bottom */}
            <div className="shrink-0 border-t border-border px-5 py-3 flex gap-2">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (noteText.trim()) noteMutation.mutate(noteText.trim()); } }}
                placeholder="Add a note…"
                className="flex-1 min-w-0 bg-transparent border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
              />
              <button
                onClick={() => { if (noteText.trim()) noteMutation.mutate(noteText.trim()); }}
                disabled={!noteText.trim() || noteMutation.isPending}
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all active:scale-90 shrink-0"
              >
                {noteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

// ── Pipeline page ──────────────────────────────────────────────────────────────

export default function Pipeline() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filterPipeline, setFilterPipeline] = useState<"all" | number | null>("all");
  const [filterType, setFilterType] = useState<GridFilterType>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("date");
  const [activeAssetId, setActiveAssetId] = useState<number | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [parentOverrides, setParentOverrides] = useState<Map<number, number | null>>(new Map());
  const [statusOverrides, setStatusOverrides] = useState<Map<number, string | null>>(new Map());
  const [creatingPipeline, setCreatingPipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");

  useEffect(() => { setActiveAssetId(null); }, [filterPipeline]);
  useEffect(() => { setFilterType("all"); }, [viewMode, filterPipeline]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const { data, isLoading, isError } = useQuery<SavedAssetsResponse>({
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
    const effectiveParent = parentOverrides.has(sig.id) ? parentOverrides.get(sig.id)! : sig.parentSavedAssetId;
    if (effectiveParent) {
      const arr = signalsByParent.get(effectiveParent) ?? [];
      arr.push(sig);
      signalsByParent.set(effectiveParent, arr);
    } else {
      unlinkedSignals.push(sig);
    }
  }

  const deckAssets: DeckAsset[] = ttoAssets.map((tto) => ({
    ...tto,
    status: statusOverrides.has(tto.id) ? statusOverrides.get(tto.id)! : tto.status,
    signals: signalsByParent.get(tto.id) ?? [],
  }));

  const filteredDecks = filterPipeline === "all" ? deckAssets
    : filterPipeline === null ? deckAssets.filter((d) => d.pipelineListId == null)
    : deckAssets.filter((d) => d.pipelineListId === filterPipeline);

  const filteredSignals = filterPipeline === "all" ? unlinkedSignals
    : filterPipeline === null ? unlinkedSignals.filter((s) => s.pipelineListId == null)
    : unlinkedSignals.filter((s) => s.pipelineListId === filterPipeline);

  // Grid shows TTO cards first, then unlinked signals
  const gridCards: PipelineAsset[] = [...filteredDecks, ...filteredSignals];

  const TYPE_FILTER_LABELS: Record<GridFilterType, string> = {
    all: "All", tto: "TTO Assets", trial: "Clinical Trials", patent: "Patents", research: "Research",
  };
  const typeFilteredCards = filterType === "all" ? gridCards : gridCards.filter((c) => {
    const cat = getSourceCategory(c.sourceName);
    return cat === filterType;
  });

  const STAGE_SORT_ORDER = ["discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved"];
  const sortedCards = [...typeFilteredCards].sort((a, b) => {
    if (sortOrder === "az") return a.assetName.localeCompare(b.assetName);
    if (sortOrder === "stage") {
      const ai = STAGE_SORT_ORDER.findIndex((s) => a.developmentStage?.toLowerCase().includes(s));
      const bi = STAGE_SORT_ORDER.findIndex((s) => b.developmentStage?.toLowerCase().includes(s));
      return (bi === -1 ? -1 : bi) - (ai === -1 ? -1 : ai);
    }
    return b.id - a.id;
  });

  // Drawer — search all saved assets so signal cards can open the drawer too
  const activeAsset = activeAssetId ? (savedAssets.find((a) => a.id === activeAssetId) ?? null) : null;
  const activeSignals = activeAsset ? (signalsByParent.get(activeAsset.id) ?? []) : [];

  // ── Mutations ──────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/saved-assets/${id}`); },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      if (activeAssetId === id) setActiveAssetId(null);
      toast({ title: "Removed from pipeline" });
    },
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
    onMutate: ({ signalId, parentId }) => {
      setParentOverrides((m) => new Map(m).set(signalId, parentId));
      return { signalId };
    },
    onSuccess: (_, vars) => {
      setParentOverrides((m) => { const n = new Map(m); n.delete(vars.signalId); return n; });
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      toast({ title: vars.parentId ? "Signal attached" : "Signal detached" });
    },
    onError: (err: any, vars, ctx: any) => {
      if (ctx) setParentOverrides((m) => { const n = new Map(m); n.delete(ctx.signalId); return n; });
      toast({ title: "Attach failed", description: err.message, variant: "destructive" });
    },
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
    onMutate: ({ id, status }) => {
      setStatusOverrides((m) => new Map(m).set(id, status));
      return { id };
    },
    onSuccess: (_, vars) => {
      setStatusOverrides((m) => { const n = new Map(m); n.delete(vars.id); return n; });
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
    },
    onError: (err: any, _vars, ctx: any) => {
      if (ctx) setStatusOverrides((m) => { const n = new Map(m); n.delete(ctx.id); return n; });
      toast({ title: "Status update failed", description: err.message, variant: "destructive" });
    },
  });

  const createPipelineMutation = useMutation({
    mutationFn: async (name: string) => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ name, shared: false }),
      });
      if (!res.ok) throw new Error("Failed to create pipeline");
      return res.json();
    },
    onSuccess: ({ pipeline }) => {
      qc.invalidateQueries({ queryKey: ["/api/pipelines"] });
      setFilterPipeline(pipeline.id);
      setCreatingPipeline(false);
      setNewPipelineName("");
      toast({ title: `"${pipeline.name}" created` });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const handleDetachSignal = useCallback((signalId: number) => {
    attachMutation.mutate({ signalId, parentId: null });
  }, [attachMutation]);

  // ── DnD ───────────────────────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) { setActiveDragId(String(event.active.id)); }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    const dragData = active.data.current;
    const dropData = over.data.current;
    if (dragData?.type === "signal" && dropData?.type === "tto-drop") {
      if (dragData.assetId !== dropData.ttoId) attachMutation.mutate({ signalId: dragData.assetId, parentId: dropData.ttoId });
    }
    if (dragData?.type === "tto" && dropData?.type === "status-drop") {
      const deck = deckAssets.find((a) => a.id === dragData.assetId);
      const newStatus = dropData.status as string | null;
      if (deck && deck.status !== newStatus) boardStatusMutation.mutate({ id: dragData.assetId, status: newStatus });
    }
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  const handleExportCsv = () => {
    if (sortedCards.length === 0) return;
    const headers = ["Asset Name", "Target", "Modality", "Stage", "Disease", "Summary", "Journal", "Year", "Source", "URL"];
    const rows = sortedCards.map((a) => [
      a.assetName, a.target, a.modality, a.developmentStage, a.diseaseIndication,
      `"${(a.summary ?? "").replace(/"/g, '""')}"`,
      a.sourceJournal, a.publicationYear, a.sourceName, a.sourceUrl ?? "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "eden-pipeline.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(sortedCards, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "eden-pipeline.json"; a.click(); URL.revokeObjectURL(url);
  };

  const totalAssets = savedAssets.length;
  const ttoCount = ttoAssets.length;
  const signalCount = signalAssets.length;
  const activeDragAsset = activeDragId ? savedAssets.find((a) => `signal-${a.id}` === activeDragId || `tto-${a.id}` === activeDragId) : null;

  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 flex flex-col min-h-0">

        {/* Header */}
        <div className="border-b border-border bg-card/30 shrink-0">
          <div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Pipeline <span className="gradient-text dark:gradient-text gradient-text-light">Builder</span>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {totalAssets > 0
                  ? sortedCards.length < totalAssets
                    ? `${sortedCards.length} of ${totalAssets} assets`
                    : `${ttoCount} TTO asset${ttoCount !== 1 ? "s" : ""}${signalCount > 0 ? ` · ${signalCount} signal${signalCount !== 1 ? "s" : ""}` : ""}`
                  : "Save assets from Scout to build your pipeline"}
              </p>
            </div>
            {totalAssets > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5 border border-border rounded-lg p-0.5 bg-card">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    data-testid="button-view-grid"
                  >
                    <LayoutGrid className="w-3 h-3" /> Grid
                  </button>
                  <button
                    onClick={() => setViewMode("board")}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === "board" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    data-testid="button-view-board"
                  >
                    <LayoutDashboard className="w-3 h-3" /> Board
                  </button>
                </div>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-border" onClick={handleExportCsv} data-testid="button-pipeline-export-csv">
                  <Download className="w-3 h-3" />CSV
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-border" onClick={handleExportJson} data-testid="button-pipeline-export-json">
                  <Download className="w-3 h-3" />JSON
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Loading / global empty state */}
        {isLoading && !isError ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : totalAssets === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-24 px-6 text-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Beaker className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">Your pipeline is empty</h2>
              <p className="text-muted-foreground max-w-sm text-sm">Discover TTO assets in Scout and bookmark them to build your pipeline.</p>
            </div>
            <Link href="/scout"><Button className="gap-2 mt-2" data-testid="button-go-scout">Go to Scout <ArrowRight className="w-4 h-4" /></Button></Link>
          </div>
        ) : (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex-1 flex min-h-0">

              {/* ── Left sidebar — always visible ─────────────────────────── */}
              <aside className="w-56 shrink-0 border-r border-border bg-card/20 flex flex-col">
                <div className="px-4 py-3 border-b border-border shrink-0">
                  <div className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Pipelines</span>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="px-2 py-2 flex flex-col gap-0.5">
                    <button
                      onClick={() => setFilterPipeline("all")}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${filterPipeline === "all" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted/60"}`}
                      data-testid="filter-pipeline-all"
                    >
                      <span className="font-medium truncate">All Assets</span>
                      <span className={`text-[10px] tabular-nums font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${filterPipeline === "all" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {totalAssets}
                      </span>
                    </button>
                    <button
                      onClick={() => setFilterPipeline(null)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${filterPipeline === null ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted/60"}`}
                      data-testid="filter-pipeline-uncategorised"
                    >
                      <span className="truncate">Uncategorised</span>
                      <span className={`text-[10px] tabular-nums font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${filterPipeline === null ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {savedAssets.filter((a) => a.pipelineListId == null).length}
                      </span>
                    </button>
                    {pipelines.length > 0 && <div className="my-1.5 border-t border-border" />}
                    {pipelines.map((pl) => {
                      const count = savedAssets.filter((a) => a.pipelineListId === pl.id).length;
                      return (
                        <button
                          key={pl.id}
                          onClick={() => setFilterPipeline(pl.id)}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${filterPipeline === pl.id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted/60"}`}
                          data-testid={`filter-pipeline-${pl.id}`}
                        >
                          <span className="truncate">{pl.name}</span>
                          <span className={`text-[10px] tabular-nums font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${filterPipeline === pl.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
                {/* Create new pipeline */}
                <div className="px-2 py-2 border-t border-border shrink-0">
                  {creatingPipeline ? (
                    <div className="flex gap-1.5">
                      <input
                        autoFocus
                        value={newPipelineName}
                        onChange={(e) => setNewPipelineName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newPipelineName.trim()) createPipelineMutation.mutate(newPipelineName.trim());
                          if (e.key === "Escape") { setCreatingPipeline(false); setNewPipelineName(""); }
                        }}
                        placeholder="Pipeline name…"
                        className="flex-1 min-w-0 text-xs border border-border rounded-lg px-2.5 py-1.5 bg-transparent focus:outline-none focus:border-primary/40 text-foreground placeholder:text-muted-foreground"
                      />
                      <button
                        onClick={() => { if (newPipelineName.trim()) createPipelineMutation.mutate(newPipelineName.trim()); }}
                        disabled={!newPipelineName.trim() || createPipelineMutation.isPending}
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all shrink-0"
                      >
                        {createPipelineMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCreatingPipeline(true)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                      data-testid="button-sidebar-new-pipeline"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      New pipeline
                    </button>
                  )}
                </div>
              </aside>

              {/* ── Main content area ─────────────────────────────────────── */}
              <div className="flex-1 overflow-auto">
                <div className="px-6 py-6">

                  {/* Grid view */}
                  {viewMode === "grid" && (
                    gridCards.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                        <div className="w-12 h-12 rounded-xl bg-muted/50 border border-border flex items-center justify-center">
                          <Beaker className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">No assets in this pipeline</p>
                          <p className="text-xs text-muted-foreground mt-1">Save assets to this pipeline from Scout, or view all assets.</p>
                        </div>
                        <button onClick={() => setFilterPipeline("all")} className="text-xs text-primary hover:text-primary/80 transition-colors">
                          ← Back to All Assets
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Filter bar + sort controls */}
                        <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {(["all", "tto", "trial", "patent", "research"] as const).map((type) => {
                              const count = type === "all" ? gridCards.length : gridCards.filter((c) => getSourceCategory(c.sourceName) === type).length;
                              if (type !== "all" && count === 0) return null;
                              return (
                                <button
                                  key={type}
                                  onClick={() => setFilterType(type)}
                                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${filterType === type ? "bg-primary text-primary-foreground border-primary font-medium" : "border-border text-foreground hover:border-primary/30 hover:bg-muted/40"}`}
                                >
                                  {TYPE_FILTER_LABELS[type]}{count > 0 && <span className={`ml-1 ${filterType === type ? "opacity-70" : "text-muted-foreground"}`}>({count})</span>}
                                </button>
                              );
                            })}
                          </div>
                          <div className="flex items-center gap-0.5 border border-border rounded-lg p-0.5 bg-card shrink-0">
                            {(["date", "az", "stage"] as const).map((s) => (
                              <button
                                key={s}
                                onClick={() => setSortOrder(s)}
                                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${sortOrder === s ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                              >
                                {s === "date" ? "Date" : s === "az" ? "A–Z" : "Stage"}
                              </button>
                            ))}
                          </div>
                        </div>

                        {sortedCards.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                            <p className="text-sm text-muted-foreground">No {TYPE_FILTER_LABELS[filterType].toLowerCase()} in this view.</p>
                            <button onClick={() => setFilterType("all")} className="text-xs text-primary hover:text-primary/80 transition-colors">
                              Show all types
                            </button>
                          </div>
                        ) : (
                          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
                            {sortedCards.map((card) => {
                              const isTto = isTtoSource(card.sourceName);
                              const deck = isTto ? deckAssets.find((d) => d.id === card.id) : null;
                              return (
                                <PipelineCard
                                  key={card.id}
                                  asset={card}
                                  signals={deck?.signals ?? []}
                                  onDelete={(id) => deleteMutation.mutate(id)}
                                  onClick={() => setActiveAssetId(card.id)}
                                />
                              );
                            })}
                          </div>
                        )}
                      </>
                    )
                  )}

                  {/* Board view */}
                  {viewMode === "board" && (
                    filteredDecks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                          <FlaskConical className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">No TTO assets in this pipeline</p>
                          <p className="text-xs text-muted-foreground mt-1">The board shows TTO assets only. Switch to Grid to see all assets.</p>
                        </div>
                        <button onClick={() => setViewMode("grid")} className="text-xs text-primary hover:text-primary/80 transition-colors">
                          ← Switch to Grid view
                        </button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <div className="flex gap-3 min-w-max pb-4">
                          {BOARD_COLUMNS.map((col) => {
                            const colDecks = filteredDecks.filter((d) => (d.status ?? null) === col.key);
                            return (
                              <KanbanColumn
                                key={col.key ?? "unassigned"}
                                col={col}
                                decks={colDecks}
                                onDelete={(id) => deleteMutation.mutate(id)}
                                onCardClick={(asset) => setActiveAssetId(asset.id)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Drag overlay — full card visual */}
            <DragOverlay>
              {activeDragAsset && (
                <div className="opacity-90 rotate-1 scale-[0.97]" style={{ width: "200px" }}>
                  <div
                    className="relative w-full h-[260px] rounded-[17px] overflow-hidden border border-white/90 dark:border-white/10"
                    style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.28)" }}
                  >
                    <CardFaceContent asset={activeDragAsset} />
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      {/* Asset drawer */}
      <AssetDrawer
        asset={activeAsset}
        signals={activeSignals}
        onClose={() => setActiveAssetId(null)}
        onDetachSignal={handleDetachSignal}
        onDelete={(id) => deleteMutation.mutate(id)}
        pipelines={pipelines}
      />
    </div>
  );
}
