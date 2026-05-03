import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Bookmark, Layers, Plus, Check, ChevronDown, Loader2, Trash2 } from "lucide-react";
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
};

type SavedAssetsResponse = {
  assets: SavedAssetSummary[];
};

type Props = {
  payload?: PipelinePickerPayload;
  asset?: ScoredAsset;
  alreadySaved?: boolean;
  variant?: "icon" | "button";
  iconClassName?: string;
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

export function PipelinePicker({ payload, asset, alreadySaved, variant = "icon", iconClassName }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createShared, setCreateShared] = useState(false);

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

  const isSaved = alreadySaved !== undefined ? alreadySaved : !!savedAsset;
  const currentPipelineListId = savedAsset?.pipelineListId ?? null;

  type SaveMutationResult = { moved: boolean };
  const saveMutation = useMutation<SaveMutationResult, Error, { pipelineListId: number | null; pipelineId?: number }>({
    mutationFn: async ({ pipelineListId, pipelineId }) => {
      if (!effectivePayload) throw new Error("No asset payload");
      const authHeaders = await getAuthHeaders();
      // If the asset is already saved, move it instead of creating a duplicate.
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
        }),
      });
      if (!res.ok) throw new Error("Failed to save asset");
      // Server-side dedup may have moved an existing row; report as a save
      // here since the client could not tell either way.
      return { moved: false };
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      qc.invalidateQueries({ queryKey: ["/api/pipelines"] });
      const targetId = vars.pipelineId ?? vars.pipelineListId;
      const pl = pipelines.find((p) => p.id === targetId);
      toast({
        title: data.moved ? "Asset moved" : "Asset saved",
        description: pl ? `${data.moved ? "Moved to" : "Added to"} "${pl.name}"` : (data.moved ? "Moved to Uncategorised" : "Added to Uncategorised"),
      });
      setOpen(false);
    },
    onError: (err) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
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
    },
    onError: (err: Error) => {
      toast({ title: "Remove failed", description: err.message, variant: "destructive" });
    },
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
      // If asset is already saved, move it to the newly created pipeline.
      if (savedAsset?.id) {
        const res = await fetch(`/api/saved-assets/${savedAsset.id}/pipeline`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ pipeline_list_id: pipeline.id }),
        });
        if (!res.ok) throw new Error("Failed to move asset");
        return { asset: await res.json(), pipeline, moved: true };
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
        }),
      });
      if (!res.ok) throw new Error("Failed to save asset");
      return { asset: await res.json(), pipeline, moved: false };
    },
    onSuccess: ({ pipeline, moved }) => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      qc.invalidateQueries({ queryKey: ["/api/pipelines"] });
      toast({
        title: moved ? "Asset moved" : "Asset saved",
        description: `${moved ? "Moved to" : "Added to"} new pipeline "${pipeline.name}"`,
      });
      setNewName("");
      setCreateShared(false);
      setCreating(false);
      setOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const isPending = saveMutation.isPending || createAndSaveMutation.isPending || removeMutation.isPending;

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
        onClick={() => {
          if (isCurrent) { setOpen(false); return; }
          saveMutation.mutate({ pipelineListId: p.id, pipelineId: p.id });
        }}
        disabled={isPending}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors text-left ${isCurrent ? "bg-primary/5" : "hover:bg-muted/50"}`}
        data-testid={`pipeline-option-${p.id}`}
      >
        <Layers className={`w-3.5 h-3.5 shrink-0 ${isCurrent ? "text-primary" : "text-primary/70"}`} />
        <span className={`flex-1 truncate ${isCurrent ? "font-medium text-primary" : ""}`}>{p.name}</span>
        {showSharedBadge && (
          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-muted-foreground/30 text-muted-foreground shrink-0">
            shared
          </Badge>
        )}
        {isCurrent ? (
          <Check className="w-3.5 h-3.5 text-primary shrink-0" />
        ) : (
          <span className="text-[10px] text-muted-foreground tabular-nums">{p.assetCount}</span>
        )}
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "button" ? (
          <Button
            variant="outline"
            size="sm"
            className={`gap-1.5 h-8 text-xs ${isSaved ? "border-primary/40 text-primary bg-primary/5" : "border-card-border"}`}
            disabled={isPending}
            data-testid={`button-save-asset-${effectivePayload?.pmid ?? effectivePayload?.asset_name}`}
          >
            {isSaved ? (
              <Check className="w-3 h-3" />
            ) : (
              <Bookmark className="w-3 h-3" />
            )}
            {isSaved ? "Saved" : "Save"}
            <ChevronDown className="w-3 h-3 opacity-60" />
          </Button>
        ) : (
          <button
            className={`rounded flex items-center justify-center transition-all duration-150 ${
              iconClassName ?? "w-7 h-7"
            } ${
              isSaved
                ? "text-primary bg-primary/10 border border-primary/30"
                : "text-muted-foreground hover:text-primary hover:bg-primary/5 border border-transparent hover:border-primary/20"
            }`}
            disabled={isPending}
            data-testid={`button-save-asset-${effectivePayload?.pmid ?? effectivePayload?.asset_name}`}
            title={isSaved ? "Saved. Click to save to another pipeline" : "Save to pipeline"}
          >
            {isPending ? (
              <Loader2 className={iconClassName ? "w-4 h-4 animate-spin" : "w-3.5 h-3.5 animate-spin"} />
            ) : (
              <Bookmark className={iconClassName ? "w-4 h-4" : "w-3.5 h-3.5"} fill={isSaved ? "currentColor" : "none"} />
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-60 p-2 shadow-lg"
        align="end"
        collisionPadding={12}
        data-testid="pipeline-picker-popover"
      >
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1">
          {isSaved ? "Move to pipeline" : "Save to pipeline"}
        </div>

        {(() => {
          const isCurrentUncat = isSaved && currentPipelineListId === null;
          return (
            <button
              onClick={() => {
                if (isCurrentUncat) { setOpen(false); return; }
                saveMutation.mutate({ pipelineListId: null });
              }}
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
            {myLists.length > 0 && (
              <>
                <div className="my-1 border-t border-border" />
                <div className="text-[9px] font-semibold text-muted-foreground/70 uppercase tracking-widest px-2 py-0.5">
                  My Lists
                </div>
                {myLists.map((p) => renderPipelineRow(p, false))}
              </>
            )}
            {teamLists.length > 0 && (
              <>
                <div className="my-1 border-t border-border" />
                <div className="text-[9px] font-semibold text-muted-foreground/70 uppercase tracking-widest px-2 py-0.5">
                  Team Lists
                </div>
                {teamLists.map((p) => renderPipelineRow(p, true))}
              </>
            )}
            {myLists.length === 0 && teamLists.length === 0 && (
              <div className="my-1 border-t border-border" />
            )}
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
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateAndSave();
                    if (e.key === "Escape") { setCreating(false); setNewName(""); setCreateShared(false); }
                  }}
                  placeholder="Pipeline name…"
                  className="h-7 text-xs flex-1"
                  data-testid="input-new-pipeline-name"
                />
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={handleCreateAndSave}
                  disabled={!newName.trim() || isPending}
                  data-testid="button-confirm-new-pipeline"
                >
                  <Check className="w-3 h-3" />
                </Button>
              </div>
              {hasTeamOrg && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCreateShared(false)}
                    className={`flex-1 text-[10px] px-2 py-0.5 rounded border transition-colors ${!createShared ? "border-primary/40 bg-primary/5 text-primary font-medium" : "border-border text-muted-foreground hover:border-primary/20"}`}
                    data-testid="button-picker-create-personal"
                  >
                    Personal
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateShared(true)}
                    className={`flex-1 text-[10px] px-2 py-0.5 rounded border transition-colors ${createShared ? "border-primary/40 bg-primary/5 text-primary font-medium" : "border-border text-muted-foreground hover:border-primary/20"}`}
                    data-testid="button-picker-create-team"
                  >
                    Team
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-left"
              data-testid="button-new-pipeline"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              New pipeline…
            </button>
          )}
        </div>

        {isSaved && savedAsset?.id && !creating && (
          <div className="mt-1 border-t border-border pt-1">
            <button
              onClick={() => removeMutation.mutate()}
              disabled={isPending}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-destructive hover:bg-destructive/10 transition-colors text-left"
              data-testid="button-remove-saved-asset"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              Remove from saved
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
