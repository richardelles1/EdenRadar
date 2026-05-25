import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Bookmark, Layers, Plus, Check, ChevronDown, Loader2, Trash2,
  Link2, X, FlaskConical,
} from "lucide-react";
import type { ScoredAsset } from "@/lib/types";
import { useOrg } from "@/hooks/use-org";

export type PipelinePickerPayload = {
  asset_name: string;
  target?: string;
  modality?: string;
  development_stage?: string;
  disease_indication?: string;
  summary?: string;
  source_title?: string;
  source_journal?: string;
  publication_year?: string;
  source_name?: string;
  source_url?: string | null;
  pmid?: string | null;
  ingested_asset_id?: number | null;
};

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

type SavedAssetSummary = {
  id: number;
  pmid?: string | null;
  assetName: string;
  pipelineListId?: number | null;
  sourceName?: string | null;
  parentSavedAssetId?: number | null;
};

type SavedAssetsResponse = {
  assets: SavedAssetSummary[];
};

const NON_TTO_SOURCES = ["patent", "clinical_trial", "pubmed", "biorxiv", "medrxiv", "literature", "arxiv", "preprint", "paper"];
function isNonTtoSource(sourceName?: string | null) {
  if (!sourceName) return false;
  const sn = sourceName.toLowerCase();
  return NON_TTO_SOURCES.some((s) => sn.includes(s));
}

const SOURCE_LABELS: Record<string, { label: string; colorClass: string }> = {
  patent:         { label: "Patent",         colorClass: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30" },
  clinical_trial: { label: "Clinical Trial",  colorClass: "text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/30" },
  paper:          { label: "Research Paper",  colorClass: "text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/30" },
  preprint:       { label: "Preprint",        colorClass: "text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/30" },
  pubmed:         { label: "Publication",     colorClass: "text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/30" },
};
function getSourceLabel(sourceName?: string | null) {
  const sn = (sourceName ?? "").toLowerCase();
  for (const [key, val] of Object.entries(SOURCE_LABELS)) {
    if (sn.includes(key)) return val;
  }
  return { label: "Signal", colorClass: "text-muted-foreground bg-muted border-border" };
}

type Props = {
  payload?: PipelinePickerPayload;
  asset?: ScoredAsset;
  alreadySaved?: boolean;
  variant?: "icon" | "button";
  iconClassName?: string;
  bare?: boolean;
};

function buildPayload(asset: ScoredAsset): PipelinePickerPayload {
  return {
    asset_name: asset.asset_name,
    target: asset.target,
    modality: asset.modality,
    development_stage: asset.development_stage,
    disease_indication: asset.indication,
    summary: asset.summary,
    source_title: asset.signals?.[0]?.title ?? asset.asset_name,
    source_journal: asset.institution !== "unknown" ? asset.institution : "Unknown",
    publication_year: asset.latest_signal_date?.slice(0, 4) ?? "Unknown",
    source_name: asset.source_types?.[0] ?? "unknown",
    source_url: asset.source_urls?.[0] ?? null,
    pmid: asset.id,
  };
}

export function PipelinePicker({ payload, asset, alreadySaved, variant = "icon", iconClassName, bare }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Popover state (TTO path) ───────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createShared, setCreateShared] = useState(false);
  const [parentSearch, setParentSearch] = useState("");
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);

  // ── Dialog state (non-TTO path) ────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogParentId, setDialogParentId] = useState<number | null>(null);
  const [dialogParentSearch, setDialogParentSearch] = useState("");
  const [dialogPipelineListId, setDialogPipelineListId] = useState<number | null>(null);
  const [dialogCreating, setDialogCreating] = useState(false);
  const [dialogNewName, setDialogNewName] = useState("");

  const effectivePayload = payload ?? (asset ? buildPayload(asset) : null);

  const { data: org } = useOrg();
  const hasTeamOrg = !!(org && org.planTier !== "individual");

  const { data: pipelinesData } = useQuery<PipelinesResponse>({
    queryKey: ["/api/pipelines"],
    staleTime: 30000,
  });

  const { data: savedData } = useQuery<SavedAssetsResponse>({
    queryKey: ["/api/saved-assets"],
  });

  const pipelines = pipelinesData?.pipelines ?? [];
  const savedAssets = savedData?.assets ?? [];
  const myLists = pipelines.filter((p) => !p.orgId);
  const teamLists = pipelines.filter((p) => !!p.orgId);

  const matchKey = effectivePayload?.pmid ?? effectivePayload?.asset_name;
  const savedAsset = matchKey
    ? savedAssets.find((a) => (a.pmid ?? a.assetName) === matchKey)
    : undefined;

  // Prefer live query data over stale alreadySaved prop — the prop can lag after save
  const isSaved = savedData ? !!savedAsset : (alreadySaved ?? false);
  const currentPipelineListId = savedAsset?.pipelineListId ?? null;

  const thisIsNonTto = isNonTtoSource(effectivePayload?.source_name);
  const srcLabel = getSourceLabel(effectivePayload?.source_name);

  // TTO assets for linking
  const ttoAssets = savedAssets.filter((a) => !isNonTtoSource(a.sourceName));
  const filteredTtoAssets = (search: string) => search.trim()
    ? ttoAssets.filter((a) => a.assetName.toLowerCase().includes(search.toLowerCase()))
    : ttoAssets;

  // Initialise dialog fields from saved state when it opens
  useEffect(() => {
    if (dialogOpen) {
      setDialogParentId(savedAsset?.parentSavedAssetId ?? null);
      setDialogPipelineListId(savedAsset?.pipelineListId ?? null);
      setDialogParentSearch("");
      setDialogCreating(false);
      setDialogNewName("");
    }
  }, [dialogOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mutations ──────────────────────────────────────────────────────────────

  type SaveMutationResult = { moved: boolean };
  const saveMutation = useMutation<SaveMutationResult, Error, { pipelineListId: number | null; pipelineId?: number }>({
    mutationFn: async ({ pipelineListId, pipelineId }) => {
      if (!effectivePayload) throw new Error("No asset payload");
      const authHeaders = await getAuthHeaders();
      if (savedAsset?.id) {
        const targetListId = pipelineId ?? pipelineListId;
        const res = await fetch(`/api/saved-assets/${savedAsset.id}/pipeline`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ pipeline_list_id: targetListId }),
        });
        if (!res.ok) throw new Error("Failed to move asset");
        return { moved: true };
      }
      const url = pipelineId != null ? `/api/pipelines/${pipelineId}/assets` : "/api/saved-assets";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          asset_name: effectivePayload.asset_name,
          target: effectivePayload.target ?? "unknown",
          modality: effectivePayload.modality ?? "unknown",
          development_stage: effectivePayload.development_stage ?? "unknown",
          disease_indication: effectivePayload.disease_indication ?? "unknown",
          summary: effectivePayload.summary ?? "",
          source_title: effectivePayload.source_title ?? effectivePayload.asset_name,
          source_journal: effectivePayload.source_journal ?? "Unknown",
          publication_year: effectivePayload.publication_year ?? "",
          source_name: effectivePayload.source_name ?? "unknown",
          source_url: effectivePayload.source_url ?? undefined,
          pmid: effectivePayload.pmid ?? undefined,
          ingested_asset_id: effectivePayload.ingested_asset_id ?? undefined,
          pipeline_list_id: pipelineListId,
          parent_saved_asset_id: selectedParentId ?? undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to save asset");
      return { moved: false };
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      qc.invalidateQueries({ queryKey: ["/api/pipelines"] });
      const pl = pipelines.find((p) => p.id === (vars.pipelineId ?? vars.pipelineListId));
      toast({
        title: data.moved ? "Asset moved" : "Asset saved",
        description: pl ? `${data.moved ? "Moved to" : "Added to"} "${pl.name}"` : (data.moved ? "Moved to Uncategorised" : "Added to Uncategorised"),
      });
      setOpen(false);
    },
    onError: (err) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!savedAsset?.id) throw new Error("Not saved");
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/saved-assets/${savedAsset.id}`, {
        method: "DELETE",
        headers: { ...authHeaders },
      });
      if (!res.ok) throw new Error("Failed to remove asset");
      return res.json().catch(() => ({}));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      qc.invalidateQueries({ queryKey: ["/api/pipelines"] });
      toast({ title: "Removed from saved" });
      setOpen(false);
      setDialogOpen(false);
    },
    onError: (err: Error) => toast({ title: "Remove failed", description: err.message, variant: "destructive" }),
  });

  const createAndSaveMutation = useMutation({
    mutationFn: async ({ name, shared }: { name: string; shared?: boolean }) => {
      if (!effectivePayload) throw new Error("No asset payload");
      const authHeaders = await getAuthHeaders();
      const plRes = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ name, shared: shared ?? false }),
      });
      if (!plRes.ok) throw new Error("Failed to create pipeline");
      const { pipeline } = await plRes.json();
      if (savedAsset?.id) {
        const res = await fetch(`/api/saved-assets/${savedAsset.id}/pipeline`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ pipeline_list_id: pipeline.id }),
        });
        if (!res.ok) throw new Error("Failed to move asset");
        return { pipeline, moved: true };
      }
      const res = await fetch(`/api/pipelines/${pipeline.id}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          asset_name: effectivePayload.asset_name,
          target: effectivePayload.target ?? "unknown",
          modality: effectivePayload.modality ?? "unknown",
          development_stage: effectivePayload.development_stage ?? "unknown",
          disease_indication: effectivePayload.disease_indication ?? "unknown",
          summary: effectivePayload.summary ?? "",
          source_title: effectivePayload.source_title ?? effectivePayload.asset_name,
          source_journal: effectivePayload.source_journal ?? "Unknown",
          publication_year: effectivePayload.publication_year ?? "",
          source_name: effectivePayload.source_name ?? "unknown",
          source_url: effectivePayload.source_url ?? undefined,
          pmid: effectivePayload.pmid ?? undefined,
          ingested_asset_id: effectivePayload.ingested_asset_id ?? undefined,
          parent_saved_asset_id: selectedParentId ?? undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to save asset");
      return { pipeline, moved: false };
    },
    onSuccess: ({ pipeline, moved }) => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      qc.invalidateQueries({ queryKey: ["/api/pipelines"] });
      toast({ title: moved ? "Asset moved" : "Asset saved", description: `${moved ? "Moved to" : "Added to"} "${pipeline.name}"` });
      setNewName(""); setCreateShared(false); setCreating(false); setOpen(false);
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  // Dialog-specific save mutation (handles both new save + update of existing signal)
  const dialogSaveMutation = useMutation({
    mutationFn: async () => {
      if (!effectivePayload) throw new Error("No payload");
      const authHeaders = await getAuthHeaders();

      if (savedAsset?.id) {
        // Update existing: pipeline + parent link (only if changed)
        if (dialogPipelineListId !== (savedAsset.pipelineListId ?? null)) {
          const r = await fetch(`/api/saved-assets/${savedAsset.id}/pipeline`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({ pipeline_list_id: dialogPipelineListId }),
          });
          if (!r.ok) throw new Error("Failed to move");
        }
        if (dialogParentId !== (savedAsset.parentSavedAssetId ?? null)) {
          const r = await fetch(`/api/saved-assets/${savedAsset.id}/parent`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({ parent_saved_asset_id: dialogParentId }),
          });
          if (!r.ok) throw new Error("Failed to link");
        }
        return { updated: true };
      }

      // New save with parent link
      const r = await fetch("/api/saved-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          asset_name: effectivePayload.asset_name,
          target: effectivePayload.target ?? "unknown",
          modality: effectivePayload.modality ?? "unknown",
          development_stage: effectivePayload.development_stage ?? "unknown",
          disease_indication: effectivePayload.disease_indication ?? "unknown",
          summary: effectivePayload.summary ?? "",
          source_title: effectivePayload.source_title ?? effectivePayload.asset_name,
          source_journal: effectivePayload.source_journal ?? "Unknown",
          publication_year: effectivePayload.publication_year ?? "",
          source_name: effectivePayload.source_name ?? "unknown",
          source_url: effectivePayload.source_url ?? undefined,
          pmid: effectivePayload.pmid ?? undefined,
          ingested_asset_id: effectivePayload.ingested_asset_id ?? undefined,
          pipeline_list_id: dialogPipelineListId,
          parent_saved_asset_id: dialogParentId ?? undefined,
        }),
      });
      if (!r.ok) throw new Error("Failed to save");
      return { updated: false };
    },
    onSuccess: ({ updated }) => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      qc.invalidateQueries({ queryKey: ["/api/pipelines"] });
      toast({ title: updated ? "Signal updated" : "Signal saved" });
      setDialogOpen(false);
    },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const dialogCreateAndSaveMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!effectivePayload) throw new Error("No payload");
      const authHeaders = await getAuthHeaders();
      const plRes = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ name, shared: false }),
      });
      if (!plRes.ok) throw new Error("Failed to create pipeline");
      const { pipeline } = await plRes.json();
      setDialogPipelineListId(pipeline.id);
      setDialogCreating(false);
      setDialogNewName("");
      return pipeline;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pipelines"] });
    },
    onError: (err: any) => toast({ title: "Failed to create pipeline", description: err.message, variant: "destructive" }),
  });

  const isPending = saveMutation.isPending || createAndSaveMutation.isPending || removeMutation.isPending;
  const dialogIsPending = dialogSaveMutation.isPending || dialogCreateAndSaveMutation.isPending || removeMutation.isPending;

  const handleCreateAndSave = () => {
    const name = newName.trim();
    if (!name) return;
    createAndSaveMutation.mutate({ name, shared: createShared });
  };

  function renderPipelineRow(p: PipelineWithCount, showSharedBadge?: boolean) {
    const isCurrent = isSaved && currentPipelineListId === p.id;
    return (
      <button
        key={p.id}
        onClick={() => { if (isCurrent) { setOpen(false); return; } saveMutation.mutate({ pipelineListId: p.id, pipelineId: p.id }); }}
        disabled={isPending}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors text-left ${isCurrent ? "bg-primary/5" : "hover:bg-muted/50"}`}
        data-testid={`pipeline-option-${p.id}`}
      >
        <Layers className={`w-3.5 h-3.5 shrink-0 ${isCurrent ? "text-primary" : "text-primary/70"}`} />
        <span className={`flex-1 truncate ${isCurrent ? "font-medium text-primary" : ""}`}>{p.name}</span>
        {showSharedBadge && <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-muted-foreground/30 text-muted-foreground shrink-0">shared</Badge>}
        {isCurrent ? <Check className="w-3.5 h-3.5 text-primary shrink-0" /> : <span className="text-[10px] text-muted-foreground tabular-nums">{p.assetCount}</span>}
      </button>
    );
  }

  // ── Shared trigger button rendering ─────────────────────────────────────────

  function renderTrigger(onClick?: () => void) {
    const testId = `button-save-asset-${effectivePayload?.pmid ?? effectivePayload?.asset_name}`;
    if (variant === "button") {
      return (
        <Button
          variant="outline" size="sm"
          className={`gap-1.5 h-8 text-xs ${isSaved ? "border-primary/40 text-primary bg-primary/5" : "border-card-border"}`}
          disabled={isPending || dialogIsPending}
          onClick={onClick}
          data-testid={testId}
        >
          {isSaved ? <Check className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
          {isSaved ? "Saved" : "Save"}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </Button>
      );
    }
    if (bare) {
      return (
        <button
          className={`flex items-center justify-center transition-opacity duration-150 ${isSaved ? "text-primary opacity-100" : "text-muted-foreground opacity-60 hover:opacity-100 hover:text-primary"}`}
          disabled={isPending || dialogIsPending}
          onClick={onClick}
          data-testid={testId}
          title={isSaved ? "Saved. Click to manage" : "Save to pipeline"}
        >
          {(isPending || dialogIsPending) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bookmark className="w-3.5 h-3.5" fill={isSaved ? "currentColor" : "none"} />}
        </button>
      );
    }
    return (
      <button
        className={`rounded flex items-center justify-center transition-all duration-150 ${iconClassName ?? "w-7 h-7"} ${isSaved ? "text-primary bg-primary/10 border border-primary/30" : "text-muted-foreground hover:text-primary hover:bg-primary/5 border border-transparent hover:border-primary/20"}`}
        disabled={isPending || dialogIsPending}
        onClick={onClick}
        data-testid={testId}
        title={isSaved ? "Saved. Click to manage" : "Save to pipeline"}
      >
        {(isPending || dialogIsPending) ? <Loader2 className={iconClassName ? "w-4 h-4 animate-spin" : "w-3.5 h-3.5 animate-spin"} /> : <Bookmark className={iconClassName ? "w-4 h-4" : "w-3.5 h-3.5"} fill={isSaved ? "currentColor" : "none"} />}
      </button>
    );
  }

  // ── Non-TTO path: Dialog ───────────────────────────────────────────────────

  if (thisIsNonTto) {
    const dialogTtoList = filteredTtoAssets(dialogParentSearch);
    const selectedParentAsset = ttoAssets.find((a) => a.id === dialogParentId) ?? null;

    return (
      <>
        {renderTrigger(() => setDialogOpen(true))}

        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); }}>
          <DialogContent className="max-w-md w-full" data-testid="dialog-non-tto-save">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Bookmark className="w-4 h-4 text-primary shrink-0" />
                Save Signal
              </DialogTitle>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${srcLabel.colorClass}`}>
                  {srcLabel.label}
                </span>
                <p className="text-sm text-muted-foreground truncate flex-1">{effectivePayload?.asset_name}</p>
              </div>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-1 max-h-[60vh] overflow-y-auto pr-1">
              {/* ── Link to TTO Asset ─────────────────────────────────────── */}
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  <Link2 className="w-3 h-3" />
                  Link to TTO Asset
                  <span className="font-normal text-muted-foreground/60 normal-case tracking-normal">(optional)</span>
                </div>

                {selectedParentAsset ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <FlaskConical className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="text-sm text-emerald-700 dark:text-emerald-400 flex-1 truncate font-medium">{selectedParentAsset.assetName}</span>
                    <button
                      onClick={() => { setDialogParentId(null); setDialogParentSearch(""); }}
                      className="shrink-0 text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-300 transition-colors"
                      title="Remove link"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <Input
                      value={dialogParentSearch}
                      onChange={(e) => setDialogParentSearch(e.target.value)}
                      placeholder="Search saved TTO assets…"
                      className="h-8 text-sm mb-1.5"
                      data-testid="input-dialog-tto-search"
                    />
                    {ttoAssets.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic px-1 py-1">No saved TTO assets yet — save a TTO asset first.</p>
                    ) : (
                      <div className="max-h-36 overflow-y-auto flex flex-col gap-0.5 rounded-md border border-border">
                        {dialogTtoList.slice(0, 12).map((a) => {
                          const pl = pipelines.find((p) => p.id === a.pipelineListId);
                          return (
                            <button
                              key={a.id}
                              onClick={() => { setDialogParentId(a.id); setDialogParentSearch(""); }}
                              className="w-full text-left px-2.5 py-2 text-sm hover:bg-muted/60 transition-colors flex items-center gap-2"
                              data-testid={`dialog-tto-option-${a.id}`}
                            >
                              <FlaskConical className="w-3 h-3 text-emerald-500 shrink-0" />
                              <span className="flex-1 truncate">{a.assetName}</span>
                              {pl && <span className="text-[9px] text-muted-foreground shrink-0 bg-muted px-1.5 py-0.5 rounded">{pl.name}</span>}
                            </button>
                          );
                        })}
                        {dialogTtoList.length === 0 && (
                          <p className="text-xs text-muted-foreground italic px-2.5 py-2">No matches</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Pipeline selection ────────────────────────────────────── */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Pipeline
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setDialogPipelineListId(null)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${dialogPipelineListId === null ? "bg-primary text-primary-foreground border-primary" : "border-border text-foreground hover:border-primary/40 hover:bg-muted/50"}`}
                    data-testid="dialog-pipeline-uncategorised"
                  >
                    Uncategorised
                  </button>
                  {pipelines.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setDialogPipelineListId(p.id)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${dialogPipelineListId === p.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-foreground hover:border-primary/40 hover:bg-muted/50"}`}
                      data-testid={`dialog-pipeline-option-${p.id}`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>

                {dialogCreating ? (
                  <div className="flex gap-1.5 mt-2">
                    <Input
                      autoFocus
                      value={dialogNewName}
                      onChange={(e) => setDialogNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && dialogNewName.trim()) dialogCreateAndSaveMutation.mutate(dialogNewName.trim());
                        if (e.key === "Escape") { setDialogCreating(false); setDialogNewName(""); }
                      }}
                      placeholder="Pipeline name…"
                      className="h-7 text-xs flex-1"
                      data-testid="input-dialog-new-pipeline"
                    />
                    <Button
                      size="sm" className="h-7 px-2 text-xs"
                      onClick={() => { if (dialogNewName.trim()) dialogCreateAndSaveMutation.mutate(dialogNewName.trim()); }}
                      disabled={!dialogNewName.trim() || dialogCreateAndSaveMutation.isPending}
                      data-testid="button-dialog-confirm-pipeline"
                    >
                      <Check className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDialogCreating(true)}
                    className="flex items-center justify-center gap-1.5 text-xs font-medium border border-dashed border-primary/40 text-primary hover:bg-primary/5 rounded-lg px-3 py-2 mt-2 w-full transition-colors"
                    data-testid="button-dialog-new-pipeline"
                  >
                    <Plus className="w-3.5 h-3.5" /> New pipeline
                  </button>
                )}
              </div>
            </div>

            <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
              <div>
                {isSaved && savedAsset?.id && (
                  <button
                    onClick={() => removeMutation.mutate()}
                    disabled={dialogIsPending}
                    className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 transition-colors"
                    data-testid="button-dialog-remove"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} data-testid="button-dialog-cancel">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => dialogSaveMutation.mutate()}
                  disabled={dialogIsPending}
                  className="gap-1.5"
                  data-testid="button-dialog-save"
                >
                  {dialogSaveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bookmark className="w-3.5 h-3.5" />}
                  {isSaved ? "Update" : "Add to Pipeline"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // ── TTO path: Dialog (centered, avoids card boundary overflow) ───────────────

  return (
    <>
      {renderTrigger(() => setOpen(true))}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSelectedParentId(null); setParentSearch(""); setCreating(false); setNewName(""); setCreateShared(false); } }}>
        <DialogContent className="max-w-sm w-full" data-testid="pipeline-picker-popover">
          <DialogHeader>
            <DialogTitle>
              {isSaved ? "Move to pipeline" : "Save to pipeline"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-0.5">
            {(() => {
              const isCurrentUncat = isSaved && currentPipelineListId === null;
              return (
                <button
                  onClick={() => { if (isCurrentUncat) { setOpen(false); return; } saveMutation.mutate({ pipelineListId: null }); }}
                  disabled={isPending}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors text-left ${isCurrentUncat ? "bg-primary/5" : "hover:bg-muted/50"}`}
                  data-testid="pipeline-option-uncategorised"
                >
                  <Layers className={`w-3.5 h-3.5 shrink-0 ${isCurrentUncat ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`flex-1 truncate ${isCurrentUncat ? "font-medium text-primary" : ""}`}>Uncategorised</span>
                  {isCurrentUncat && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </button>
              );
            })()}

            {hasTeamOrg ? (
              <>
                {myLists.length > 0 && (<><div className="my-1 border-t border-border" /><div className="text-[9px] font-semibold text-muted-foreground/70 uppercase tracking-widest px-2 py-0.5">My Lists</div>{myLists.map((p) => renderPipelineRow(p, false))}</>)}
                {teamLists.length > 0 && (<><div className="my-1 border-t border-border" /><div className="text-[9px] font-semibold text-muted-foreground/70 uppercase tracking-widest px-2 py-0.5">Team Lists</div>{teamLists.map((p) => renderPipelineRow(p, true))}</>)}
                {myLists.length === 0 && teamLists.length === 0 && <div className="my-1 border-t border-border" />}
              </>
            ) : (
              <>
                {pipelines.length > 0 && <div className="my-1 border-t border-border" />}
                {pipelines.map((p) => renderPipelineRow(p, false))}
              </>
            )}

            <div className="mt-1 border-t border-border pt-1">
              {creating ? (
                <div className="flex flex-col gap-1.5 px-1">
                  <div className="flex items-center gap-1.5">
                    <Input
                      autoFocus value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleCreateAndSave(); if (e.key === "Escape") { setCreating(false); setNewName(""); setCreateShared(false); } }}
                      placeholder="Pipeline name…" className="h-7 text-xs flex-1"
                      data-testid="input-new-pipeline-name"
                    />
                    <Button size="sm" className="h-7 px-2 text-xs" onClick={handleCreateAndSave} disabled={!newName.trim() || isPending} data-testid="button-confirm-new-pipeline">
                      <Check className="w-3 h-3" />
                    </Button>
                  </div>
                  {hasTeamOrg && (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setCreateShared(false)} className={`flex-1 text-[10px] px-2 py-0.5 rounded border transition-colors ${!createShared ? "border-primary/40 bg-primary/5 text-primary font-medium" : "border-border text-muted-foreground hover:border-primary/20"}`} data-testid="button-picker-create-personal">Personal</button>
                      <button type="button" onClick={() => setCreateShared(true)} className={`flex-1 text-[10px] px-2 py-0.5 rounded border transition-colors ${createShared ? "border-primary/40 bg-primary/5 text-primary font-medium" : "border-border text-muted-foreground hover:border-primary/20"}`} data-testid="button-picker-create-team">Team</button>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={() => setCreating(true)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-left" data-testid="button-new-pipeline">
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  New pipeline…
                </button>
              )}
            </div>

            {isSaved && savedAsset?.id && !creating && (
              <div className="mt-1 border-t border-border pt-1">
                <button onClick={() => removeMutation.mutate()} disabled={isPending} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-destructive hover:bg-destructive/10 transition-colors text-left" data-testid="button-remove-saved-asset">
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  Remove from saved
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
