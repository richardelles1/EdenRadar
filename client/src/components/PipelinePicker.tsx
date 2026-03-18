import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Bookmark, Layers, Plus, Check, ChevronDown } from "lucide-react";
import type { ScoredAsset } from "@/lib/types";

type PipelineWithCount = {
  id: number;
  name: string;
  assetCount: number;
  createdAt: string;
};

type PipelinesResponse = {
  pipelines: PipelineWithCount[];
  uncategorisedCount: number;
};

type SavedAssetsResponse = {
  assets: Array<{ pmid?: string | null; assetName: string }>;
};

type Props = {
  asset: ScoredAsset;
  variant?: "icon" | "button";
};

export function PipelinePicker({ asset, variant = "icon" }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: pipelinesData } = useQuery<PipelinesResponse>({
    queryKey: ["/api/pipelines"],
    staleTime: 30000,
  });
  const { data: savedData } = useQuery<SavedAssetsResponse>({
    queryKey: ["/api/saved-assets"],
  });

  const pipelines = pipelinesData?.pipelines ?? [];
  const savedAssets = savedData?.assets ?? [];
  const alreadySaved = savedAssets.some(
    (a) => (a.pmid ?? a.assetName) === (asset.id ?? asset.asset_name)
  );

  const saveMutation = useMutation({
    mutationFn: async ({ pipelineListId }: { pipelineListId: number | null }) => {
      const res = await apiRequest("POST", "/api/saved-assets", {
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
        source_url: asset.source_urls?.[0] ?? undefined,
        pmid: asset.id,
        pipeline_list_id: pipelineListId,
      });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      qc.invalidateQueries({ queryKey: ["/api/pipelines"] });
      const pl = pipelines.find((p) => p.id === vars.pipelineListId);
      toast({
        title: "Asset saved",
        description: pl ? `Added to "${pl.name}"` : "Added to Uncategorised",
      });
      setOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const createAndSaveMutation = useMutation({
    mutationFn: async (name: string) => {
      const plRes = await apiRequest("POST", "/api/pipelines", { name });
      const { pipeline } = await plRes.json();
      const res = await apiRequest("POST", "/api/saved-assets", {
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
        source_url: asset.source_urls?.[0] ?? undefined,
        pmid: asset.id,
        pipeline_list_id: pipeline.id,
      });
      return { asset: await res.json(), pipeline };
    },
    onSuccess: ({ pipeline }) => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      qc.invalidateQueries({ queryKey: ["/api/pipelines"] });
      toast({ title: "Asset saved", description: `Added to new pipeline "${pipeline.name}"` });
      setNewName("");
      setCreating(false);
      setOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const isPending = saveMutation.isPending || createAndSaveMutation.isPending;

  const handleCreateAndSave = () => {
    const name = newName.trim();
    if (!name) return;
    createAndSaveMutation.mutate(name);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "button" ? (
          <Button
            variant="outline"
            size="sm"
            className={`gap-1.5 h-8 text-xs ${alreadySaved ? "border-primary/40 text-primary bg-primary/5" : "border-card-border"}`}
            disabled={isPending}
            data-testid={`button-save-asset-${asset.id}`}
          >
            {alreadySaved ? (
              <Check className="w-3 h-3" />
            ) : (
              <Bookmark className="w-3 h-3" />
            )}
            {alreadySaved ? "Saved" : "Save"}
            <ChevronDown className="w-3 h-3 opacity-60" />
          </Button>
        ) : (
          <button
            className={`w-7 h-7 rounded flex items-center justify-center transition-all duration-150 ${
              alreadySaved
                ? "text-primary bg-primary/10 border border-primary/30"
                : "text-muted-foreground hover:text-primary hover:bg-primary/5 border border-transparent hover:border-primary/20"
            }`}
            disabled={isPending}
            data-testid={`button-save-asset-${asset.id}`}
            title={alreadySaved ? "Saved — click to save to another pipeline" : "Save to pipeline"}
          >
            <Bookmark className="w-3.5 h-3.5" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-60 p-2 shadow-lg"
        align="end"
        data-testid="pipeline-picker-popover"
      >
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1">
          Save to pipeline
        </div>

        <button
          onClick={() => saveMutation.mutate({ pipelineListId: null })}
          disabled={isPending}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted/50 transition-colors text-left"
          data-testid="pipeline-option-uncategorised"
        >
          <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="flex-1 truncate">Uncategorised</span>
        </button>

        {pipelines.length > 0 && (
          <div className="my-1 border-t border-border" />
        )}

        {pipelines.map((p) => (
          <button
            key={p.id}
            onClick={() => saveMutation.mutate({ pipelineListId: p.id })}
            disabled={isPending}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted/50 transition-colors text-left"
            data-testid={`pipeline-option-${p.id}`}
          >
            <Layers className="w-3.5 h-3.5 text-primary/70 shrink-0" />
            <span className="flex-1 truncate">{p.name}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{p.assetCount}</span>
          </button>
        ))}

        <div className="mt-1 border-t border-border pt-1">
          {creating ? (
            <div className="flex items-center gap-1.5 px-1">
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateAndSave();
                  if (e.key === "Escape") { setCreating(false); setNewName(""); }
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
      </PopoverContent>
    </Popover>
  );
}
