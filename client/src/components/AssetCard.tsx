import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bookmark, BookmarkCheck, ExternalLink, ChevronDown, ChevronUp, FlaskConical } from "lucide-react";
import type { Asset, SavedAsset } from "@shared/schema";

type AssetCardProps = {
  asset: Asset;
  isSaved?: boolean;
  onSave?: (asset: Asset) => void;
  onUnsave?: (pmid?: string, assetName?: string) => void;
  savedId?: number;
};

const STAGE_COLORS: Record<string, string> = {
  discovery: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  preclinical: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "phase 1": "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  "phase 2": "bg-sky-500/15 text-sky-400 border-sky-500/30",
  "phase 3": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

const MODALITY_COLORS: Record<string, string> = {
  "small molecule": "bg-rose-500/15 text-rose-400 border-rose-500/30",
  antibody: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  "car-t": "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  "gene therapy": "bg-teal-500/15 text-teal-400 border-teal-500/30",
  "mrna therapy": "bg-orange-500/15 text-orange-400 border-orange-500/30",
  peptide: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  "bispecific antibody": "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

function getBadgeClass(map: Record<string, string>, value: string, fallback = "bg-muted text-muted-foreground border-border"): string {
  if (!value) return fallback;
  const key = value.toLowerCase().trim();
  return map[key] ?? fallback;
}

export function AssetCard({ asset, isSaved, onSave, onUnsave, savedId }: AssetCardProps) {
  const [expanded, setExpanded] = useState(false);

  const stageClass = getBadgeClass(STAGE_COLORS, asset.development_stage);
  const modalityClass = getBadgeClass(MODALITY_COLORS, asset.modality);

  return (
    <Card
      className="group border border-card-border bg-card hover:border-primary/40 transition-all duration-300 flex flex-col overflow-hidden"
      data-testid={`asset-card-${asset.pmid ?? asset.asset_name}`}
    >
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="shrink-0 w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <FlaskConical className="w-4 h-4 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground text-sm leading-tight truncate" data-testid={`text-asset-name-${asset.pmid}`}>
              {asset.asset_name !== "unknown" ? asset.asset_name : "Unnamed Asset"}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 w-8 h-8 hover:bg-primary/10"
            onClick={() => isSaved ? onUnsave?.(asset.pmid, asset.asset_name) : onSave?.(asset)}
            data-testid={`button-save-${asset.pmid ?? asset.asset_name}`}
            title={isSaved ? "Remove from saved" : "Save asset"}
          >
            {isSaved ? (
              <BookmarkCheck className="w-4 h-4 text-primary" />
            ) : (
              <Bookmark className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            )}
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium border ${stageClass}`}>
            {asset.development_stage !== "unknown" ? asset.development_stage : "Stage Unknown"}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium border ${modalityClass}`}>
            {asset.modality !== "unknown" ? asset.modality : "Modality Unknown"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <span className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold">Target</span>
            <p className="text-foreground font-medium mt-0.5 truncate" data-testid={`text-target-${asset.pmid}`}>
              {asset.target !== "unknown" ? asset.target : "—"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold">Indication</span>
            <p className="text-foreground font-medium mt-0.5 truncate" data-testid={`text-indication-${asset.pmid}`}>
              {asset.disease_indication !== "unknown" ? asset.disease_indication : "—"}
            </p>
          </div>
        </div>

        <div>
          <p className={`text-xs text-muted-foreground leading-relaxed ${!expanded ? "line-clamp-3" : ""}`}>
            {asset.summary}
          </p>
          {asset.summary.length > 150 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-1 text-[11px] text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
            >
              {expanded ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Show more</>}
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-card-border px-5 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground truncate" data-testid={`text-source-${asset.pmid}`}>
            {asset.source_journal} · {asset.publication_year}
          </p>
          <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
            via {asset.source_name}
          </p>
        </div>
        {asset.source_url && (
          <a
            href={asset.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
            data-testid={`link-source-${asset.pmid}`}
          >
            <ExternalLink className="w-3 h-3" />
            View
          </a>
        )}
      </div>
    </Card>
  );
}

export function SavedAssetCard({ asset, onDelete }: { asset: SavedAsset; onDelete: (id: number) => void }) {
  const stageClass = getBadgeClass(STAGE_COLORS, asset.developmentStage);
  const modalityClass = getBadgeClass(MODALITY_COLORS, asset.modality);

  return (
    <div
      className="group p-4 rounded-lg border border-card-border bg-card hover:border-primary/40 transition-all duration-300 flex flex-col gap-3"
      data-testid={`saved-card-${asset.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FlaskConical className="w-4 h-4 text-primary shrink-0" />
          <span className="font-medium text-sm text-foreground truncate">{asset.assetName}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 w-7 h-7 hover:bg-destructive/10"
          onClick={() => onDelete(asset.id)}
          data-testid={`button-delete-saved-${asset.id}`}
          title="Remove from saved"
        >
          <BookmarkCheck className="w-3.5 h-3.5 text-primary" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium border ${stageClass}`}>
          {asset.developmentStage}
        </span>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium border ${modalityClass}`}>
          {asset.modality}
        </span>
      </div>
      <div className="text-xs space-y-1">
        <div className="flex gap-1.5">
          <span className="text-muted-foreground w-16 shrink-0">Target</span>
          <span className="text-foreground font-medium truncate">{asset.target}</span>
        </div>
        <div className="flex gap-1.5">
          <span className="text-muted-foreground w-16 shrink-0">Disease</span>
          <span className="text-foreground font-medium truncate">{asset.diseaseIndication}</span>
        </div>
      </div>
      {asset.sourceUrl && (
        <a
          href={asset.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          {asset.sourceJournal} · {asset.publicationYear}
        </a>
      )}
    </div>
  );
}
