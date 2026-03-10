import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Bookmark, BookmarkCheck, ExternalLink, ChevronDown, ChevronUp,
  FlaskConical, FileText, Building2, Key, ArrowRight,
} from "lucide-react";
import { ScoreBadge } from "./ScoreBadge";
import { SourceBadge } from "./SourceBadge";
import type { ScoredAsset } from "@/lib/types";
import type { SavedAsset } from "@shared/schema";
import { useLocation } from "wouter";

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
  adc: "bg-lime-500/15 text-lime-400 border-lime-500/30",
  "cell therapy": "bg-sky-500/15 text-sky-400 border-sky-500/30",
  protac: "bg-violet-500/15 text-violet-400 border-violet-500/30",
};

function getBadgeClass(map: Record<string, string>, value: string, fallback = "bg-muted text-muted-foreground border-border"): string {
  if (!value) return fallback;
  return map[value.toLowerCase().trim()] ?? fallback;
}

type AssetCardProps = {
  asset: ScoredAsset;
  isSaved?: boolean;
  onSave?: (asset: ScoredAsset) => void;
  onUnsave?: (id: string, assetName?: string) => void;
};

export function AssetCard({ asset, isSaved, onSave, onUnsave }: AssetCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [, setLocation] = useLocation();

  const stageClass = getBadgeClass(STAGE_COLORS, asset.development_stage);
  const modalityClass = getBadgeClass(MODALITY_COLORS, asset.modality);

  const hasOwner = asset.owner_name && asset.owner_name !== "unknown";
  const hasInstitution = asset.institution && asset.institution !== "unknown" && asset.institution !== asset.owner_name;
  const licensingAvailable = (asset.licensing_status ?? "").toLowerCase().includes("available");
  const hasWhyItMatters = asset.why_it_matters && asset.why_it_matters.length > 10;

  const handleViewDossier = () => {
    sessionStorage.setItem(`asset-${asset.id}`, JSON.stringify(asset));
    setLocation(`/asset/${asset.id}`);
  };

  return (
    <Card
      className="group border border-card-border bg-card hover:border-primary/40 transition-all duration-300 flex flex-col overflow-hidden"
      data-testid={`asset-card-${asset.id}`}
    >
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="shrink-0 w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <FlaskConical className="w-4 h-4 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground text-sm leading-tight truncate" data-testid={`text-asset-name-${asset.id}`}>
              {asset.asset_name !== "unknown" ? asset.asset_name : "Unnamed Asset"}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ScoreBadge score={asset.score} breakdown={asset.score_breakdown} size="sm" />
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 hover:bg-primary/10"
              onClick={() => isSaved ? onUnsave?.(asset.id, asset.asset_name) : onSave?.(asset)}
              data-testid={`button-save-${asset.id}`}
              title={isSaved ? "Remove from saved" : "Save asset"}
            >
              {isSaved ? (
                <BookmarkCheck className="w-4 h-4 text-primary" />
              ) : (
                <Bookmark className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium border ${stageClass}`}>
            {asset.development_stage !== "unknown" ? asset.development_stage : "Stage Unknown"}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium border ${modalityClass}`}>
            {asset.modality !== "unknown" ? asset.modality : "Modality Unknown"}
          </span>
          {asset.source_types?.map((st) => (
            <SourceBadge key={st} sourceType={st} />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <span className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold">Target</span>
            <p className="text-foreground font-medium mt-0.5 truncate" data-testid={`text-target-${asset.id}`}>
              {asset.target !== "unknown" ? asset.target : "—"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold">Indication</span>
            <p className="text-foreground font-medium mt-0.5 truncate" data-testid={`text-indication-${asset.id}`}>
              {asset.indication !== "unknown" ? asset.indication : "—"}
            </p>
          </div>
          {hasOwner && (
            <div className="col-span-2">
              <span className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold">Owner</span>
              <p className="text-foreground font-medium mt-0.5 truncate flex items-center gap-1" data-testid={`text-owner-${asset.id}`}>
                <Building2 className="w-3 h-3 shrink-0 text-muted-foreground" />
                {asset.owner_name}
                {hasInstitution && <span className="text-muted-foreground font-normal">· {asset.institution}</span>}
              </p>
            </div>
          )}
        </div>

        {hasWhyItMatters && (
          <div className="bg-primary/5 border border-primary/15 rounded-md px-3 py-2">
            <p className="text-[11px] text-primary/80 leading-relaxed italic" data-testid={`text-why-matters-${asset.id}`}>
              "{asset.why_it_matters}"
            </p>
          </div>
        )}

        {!hasWhyItMatters && asset.summary && (
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
        )}
      </div>

      <div className="border-t border-card-border px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {licensingAvailable && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-sm px-1.5 py-0.5 font-semibold shrink-0">
              <Key className="w-2.5 h-2.5" />
              Available
            </span>
          )}
          <span className="text-[11px] text-muted-foreground truncate">
            {asset.evidence_count > 1
              ? `${asset.evidence_count} signals`
              : asset.latest_signal_date
              ? new Date(asset.latest_signal_date).getFullYear() || asset.latest_signal_date
              : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {asset.source_urls?.[0] && (
            <a
              href={asset.source_urls[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
              data-testid={`link-source-${asset.id}`}
            >
              <ExternalLink className="w-3 h-3" />
              View
            </a>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] px-2 text-muted-foreground hover:text-primary gap-1"
            onClick={handleViewDossier}
            data-testid={`button-dossier-${asset.id}`}
          >
            <FileText className="w-3 h-3" />
            Dossier
            <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
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
