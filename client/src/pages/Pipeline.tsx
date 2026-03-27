import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
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
} from "lucide-react";
import type { SavedAsset } from "@shared/schema";

type SavedAssetsResponse = {
  assets: SavedAsset[];
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

function PipelineCard({ asset, onDelete }: { asset: SavedAsset; onDelete: (id: number) => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, active: false });
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const modalityClass = getBadgeClass(MODALITY_COLORS, asset.modality);
  const stageAbbr = STAGE_ABBREV[asset.developmentStage?.toLowerCase().trim()] ?? "—";

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
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

  return (
    <div style={{ perspective: "1000px" }} data-testid={`pipeline-card-${asset.id}`}>
      <div
        ref={cardRef}
        className="relative rounded-[14px] overflow-hidden bg-white/80 dark:bg-zinc-900/85 border border-white/90 dark:border-white/10"
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
            ? "0 14px 40px rgba(0,0,0,0.16), 0 4px 12px rgba(0,0,0,0.10)"
            : "0 4px 16px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)",
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={handleMouseLeave}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
      >
        {/* Green bloom from top-left */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            background: "rgba(38, 122, 70, 0.55)",
            top: "-24px",
            left: "-24px",
            transform: hovered ? "scale(26)" : "scale(1)",
            opacity: hovered ? 0.12 : 0,
            transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
            zIndex: 1,
          }}
        />

        {/* Left accent strip — z-[3], behind badge */}
        <div className="absolute left-0 top-0 bottom-0 w-[3px] z-[3]" style={{ background: "#22c55e" }} />

        {/* Flush top-left stage badge — NO backdrop-filter */}
        <div
          className="absolute top-0 left-0 z-[5] flex flex-col items-center justify-center px-2 py-1 border-b border-r border-emerald-500/40 bg-white dark:bg-zinc-900"
          style={{ borderRadius: "14px 0 10px 0", minWidth: "36px" }}
          data-testid={`pipeline-stage-badge-${asset.id}`}
        >
          <span className="text-[8px] font-bold tracking-[0.12em] uppercase leading-none text-muted-foreground">Stage</span>
          <span className="font-mono text-xs font-bold leading-tight tabular-nums mt-0.5 text-emerald-600 dark:text-emerald-400">{stageAbbr}</span>
        </div>

        {/* Delete button flush top-right */}
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
            <FlaskConical className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="font-semibold text-sm text-foreground truncate leading-tight">
              {asset.assetName !== "unknown" ? asset.assetName : "Unnamed Asset"}
            </span>
          </div>

          <div className="flex flex-wrap gap-1">
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

          <div className="flex items-center justify-between pt-1.5 border-t border-white/20 dark:border-white/10">
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

  const { data, isLoading } = useQuery<SavedAssetsResponse>({
    queryKey: ["/api/saved-assets"],
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
    assets: savedAssets.filter(
      (a) => (a.developmentStage?.toLowerCase().trim() || "unknown") === stage.key
    ),
  }));

  const totalAssets = savedAssets.length;
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
                    ? `${totalAssets} asset${totalAssets !== 1 ? "s" : ""} across ${nonEmptyStages.length} stage${nonEmptyStages.length !== 1 ? "s" : ""}`
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
          <div className="flex-1 overflow-x-auto">
            <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
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
            </div>
          </div>
        )}
      </main>

      <Dialog open={!!briefModal} onOpenChange={(open) => { if (!open) { setBriefModal(null); setCopied(false); } }}>
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
