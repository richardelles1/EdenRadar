import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Layers,
  Plus,
  Pencil,
  Check,
  X,
  FolderOpen,
  ChevronDown,
  FileText,
  Copy,
  Loader2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { SavedAsset } from "@shared/schema";

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
  assets: SavedAsset[];
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

function getBadgeClass(value: string) {
  if (!value) return "bg-muted text-muted-foreground border-border";
  return MODALITY_COLORS[value.toLowerCase().trim()] ?? "bg-muted text-muted-foreground border-border";
}

function AssetCard({ asset, onDelete, onMove, pipelines }: {
  asset: SavedAsset;
  onDelete: (id: number) => void;
  onMove: (id: number, pipelineListId: number | null) => void;
  pipelines: PipelineWithCount[];
}) {
  return (
    <div
      className="group p-3.5 rounded-md border border-card-border bg-card hover:border-primary/30 transition-all duration-200 flex flex-col gap-2.5"
      data-testid={`pipeline-card-${asset.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <FlaskConical className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="font-semibold text-sm text-foreground truncate leading-tight">
            {asset.assetName !== "unknown" ? asset.assetName : "Unnamed Asset"}
          </span>
        </div>
        <button
          onClick={() => onDelete(asset.id)}
          className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
          data-testid={`button-delete-asset-${asset.id}`}
          title="Remove asset"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${getBadgeClass(asset.modality)}`}>
          {asset.modality !== "unknown" ? asset.modality : "Unknown modality"}
        </span>
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
        <p className="text-[10px] text-muted-foreground truncate flex-1">
          {asset.sourceJournal} · {asset.publicationYear}
        </p>
        <div className="flex items-center gap-1 shrink-0">
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
          {pipelines.length > 0 && (
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
  onCreatePipeline: (name: string) => void;
  onBrief?: (id: number) => void;
  briefLoadingId?: number | null;
  isLoading: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

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
    onCreatePipeline(name);
    setNewName("");
    setCreating(false);
  };

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

      <button
        onClick={() => onSelect(null)}
        className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${selectedId === null ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
        data-testid="pipeline-filter-uncategorised"
      >
        <FolderOpen className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 text-left">Uncategorised</span>
        {uncategorisedCount > 0 && (
          <span className="text-[10px] tabular-nums text-muted-foreground">{uncategorisedCount}</span>
        )}
      </button>

      {isLoading ? (
        <div className="space-y-1 mt-1">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full rounded-md" />)}
        </div>
      ) : (
        pipelines.map((p) => (
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
        ))
      )}

      <div className="mt-1 border-t border-border pt-1">
        {creating ? (
          <div className="flex items-center gap-1 px-1.5 py-1">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") { setCreating(false); setNewName(""); }
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
              onClick={() => { setCreating(false); setNewName(""); }}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted/50 text-muted-foreground"
            >
              <X className="w-3 h-3" />
            </button>
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
  const [briefModal, setBriefModal] = useState<BriefModal | null>(null);
  const [briefLoading, setBriefLoading] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: pipelinesData, isLoading: pipelinesLoading } = useQuery<PipelinesResponse>({
    queryKey: ["/api/pipelines"],
    staleTime: 30000,
  });

  const assetsQueryKey = selectedPipeline === "all"
    ? ["/api/saved-assets"]
    : selectedPipeline === null
      ? ["/api/saved-assets", "pipeline", null]
      : ["/api/saved-assets", "pipeline", selectedPipeline];

  const { data, isLoading: assetsLoading } = useQuery<SavedAssetsResponse>({
    queryKey: assetsQueryKey,
    queryFn: async () => {
      const url = selectedPipeline === "all"
        ? "/api/saved-assets"
        : selectedPipeline === null
          ? "/api/saved-assets?pipelineListId=null"
          : `/api/saved-assets?pipelineListId=${selectedPipeline}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load assets");
      return res.json();
    },
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
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/pipelines", { name });
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

  const pipelines = pipelinesData?.pipelines ?? [];
  const uncategorisedCount = pipelinesData?.uncategorisedCount ?? 0;
  const displayedAssets = data?.assets ?? [];

  const isLoading = pipelinesLoading || assetsLoading;
  const totalAssets = displayedAssets.length;

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
                {totalAssets > 0
                  ? `${totalAssets} asset${totalAssets !== 1 ? "s" : ""} across ${pipelines.length} named pipeline${pipelines.length !== 1 ? "s" : ""}`
                  : "Save assets from Scout to build your pipelines"}
              </p>
            </div>
            {displayedAssets.length > 0 && (
              <div className="flex items-center gap-2">
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
          <div className="hidden md:block w-64 shrink-0 border-r border-border p-4">
            <PipelineSidebar
              pipelines={pipelines}
              uncategorisedCount={uncategorisedCount}
              selectedId={selectedPipeline}
              onSelect={setSelectedPipeline}
              onCreatePipeline={(name) => createPipelineMutation.mutate(name)}
              onBrief={handleBrief}
              briefLoadingId={briefLoading}
              isLoading={pipelinesLoading}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">{selectedPipelineName}</h2>
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
                          onCreatePipeline={(name) => createPipelineMutation.mutate(name)}
                          onBrief={handleBrief}
                          briefLoadingId={briefLoading}
                          isLoading={pipelinesLoading}
                        />
                      </SheetContent>
                    </Sheet>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {displayedAssets.length} asset{displayedAssets.length !== 1 ? "s" : ""}
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

              {displayedAssets.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-3">
                  <Layers className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm">No assets in this pipeline yet.</p>
                  <Link href="/scout">
                    <Button variant="outline" size="sm" className="gap-1.5 mt-1" data-testid="button-discover-assets">
                      <ArrowRight className="w-3.5 h-3.5" />
                      Discover assets
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {displayedAssets.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      onDelete={(id) => deleteMutation.mutate(id)}
                      onMove={(id, pipelineListId) => moveMutation.mutate({ id, pipelineListId })}
                      pipelines={pipelines}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!briefModal} onOpenChange={(open) => { if (!open) { setBriefModal(null); setCopied(false); } }}>
        <DialogContent className="max-w-xl max-h-[80vh] flex flex-col" data-testid="dialog-pipeline-brief">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileText className="w-4 h-4 text-primary" />
                {briefModal?.pipelineName} — Pipeline Brief
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
              </div>
            </div>
          </DialogHeader>
          <ScrollArea className="flex-1 mt-2">
            <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed px-1 pb-4" data-testid="text-brief-content">
              {briefModal?.brief}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
