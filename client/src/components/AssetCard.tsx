import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  BookmarkCheck, ExternalLink, ChevronDown, ChevronUp,
  FlaskConical, FileText, Building2, Key, ArrowRight, CalendarDays,
  Microscope,
} from "lucide-react";
import { ScoreBadge } from "./ScoreBadge";
import { SourceBadge } from "./SourceBadge";
import { PipelinePicker } from "./PipelinePicker";
import type { ScoredAsset } from "@/lib/types";
import type { SavedAsset } from "@shared/schema";
import { useLocation } from "wouter";

const STAGE_COLORS: Record<string, string> = {
  discovery: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30",
  preclinical: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  "phase 1": "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30",
  "phase 2": "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  "phase 3": "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

const MODALITY_COLORS: Record<string, string> = {
  "small molecule": "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  antibody: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30",
  "car-t": "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-400 border-fuchsia-500/30",
  "gene therapy": "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30",
  "mrna therapy": "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  peptide: "bg-pink-500/15 text-pink-700 dark:text-pink-400 border-pink-500/30",
  "bispecific antibody": "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
  adc: "bg-lime-500/15 text-lime-700 dark:text-lime-400 border-lime-500/30",
  "cell therapy": "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  protac: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30",
};

function formatSignalDate(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  const yearMatch = dateStr.match(/^(\d{4})/);
  return yearMatch ? yearMatch[1] : "";
}

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

  const isResearcherPublished = asset.source_types?.includes("researcher");

  return (
    <Card
      className={`group relative border bg-card transition-all duration-300 flex flex-col overflow-hidden hover:-translate-y-px hover:shadow-md ${
        isResearcherPublished
          ? "border-amber-500/40 hover:border-amber-500/60 ring-1 ring-amber-500/10"
          : "border-card-border hover:border-primary/40"
      }`}
      data-testid={`asset-card-${asset.id}`}
    >
      {/* Glow bloom from icon top-left */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-[inherit] overflow-hidden">
        <div style={{
          position: "absolute",
          top: -20, left: -20,
          width: 180, height: 180,
          background: isResearcherPublished
            ? "radial-gradient(circle at center, rgba(245,158,11,0.09) 0%, rgba(245,158,11,0.04) 45%, transparent 70%)"
            : "radial-gradient(circle at center, rgba(34,197,94,0.10) 0%, rgba(34,197,94,0.04) 45%, transparent 70%)",
        }} />
      </div>
      {isResearcherPublished && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20">
          <Microscope className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 tracking-wide uppercase">
            Lab Published · Researcher Discovery
          </span>
        </div>
      )}
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center transition-colors duration-300 ${
              isResearcherPublished
                ? "bg-amber-500/10 group-hover:bg-amber-500/20"
                : "bg-primary/10 group-hover:bg-primary/20"
            }`}>
              {isResearcherPublished ? (
                <Microscope className="w-4 h-4 text-amber-500" />
              ) : (
                <FlaskConical className="w-4 h-4 text-primary" />
              )}
            </div>
            <h3 className="font-semibold text-foreground text-sm leading-tight truncate" data-testid={`text-asset-name-${asset.id}`}>
              {asset.asset_name !== "unknown" ? asset.asset_name : "Unnamed Asset"}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ScoreBadge score={asset.score} breakdown={asset.score_breakdown} size="sm" />
            {isSaved ? (
              <button
                onClick={() => onUnsave?.(asset.id, asset.asset_name)}
                className="w-7 h-7 rounded flex items-center justify-center text-primary bg-primary/10 border border-primary/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all duration-150"
                data-testid={`button-unsave-${asset.id}`}
                title="Remove from saved"
              >
                <BookmarkCheck className="w-3.5 h-3.5" />
              </button>
            ) : (
              <PipelinePicker asset={asset} variant="icon" />
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {asset.development_stage && asset.development_stage !== "unknown" && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium border ${stageClass}`}>
              {asset.development_stage}
            </span>
          )}
          {asset.modality && asset.modality !== "unknown" && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium border ${modalityClass}`}>
              {asset.modality}
            </span>
          )}
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
          {asset.source_types?.includes("tech_transfer") && asset.contact_office && (
            <div className="col-span-2">
              <span className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold">TTO Contact</span>
              <p className="mt-0.5">
                <a
                  href={asset.source_urls?.[0] ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-xs font-medium flex items-center gap-1 hover:underline truncate"
                  data-testid={`link-tto-contact-${asset.id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  {asset.contact_office}
                </a>
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
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-sm px-1.5 py-0.5 font-semibold shrink-0">
              <Key className="w-2.5 h-2.5" />
              Available
            </span>
          )}
          {asset.evidence_count > 1 && (
            <span className="text-[10px] text-muted-foreground shrink-0">{asset.evidence_count} signals</span>
          )}
          {asset.latest_signal_date && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0" data-testid={`text-date-${asset.id}`}>
              <CalendarDays className="w-3 h-3 shrink-0 text-muted-foreground/60" />
              {formatSignalDate(asset.latest_signal_date)}
            </span>
          )}
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
      className="group relative p-4 rounded-lg border border-card-border bg-card hover:border-primary/40 hover:-translate-y-px hover:shadow-md transition-all duration-300 flex flex-col gap-3 overflow-hidden"
      data-testid={`saved-card-${asset.id}`}
    >
      {/* Glow bloom */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-[inherit] overflow-hidden">
        <div style={{
          position: "absolute",
          top: -20, left: -20,
          width: 160, height: 160,
          background: "radial-gradient(circle at center, rgba(34,197,94,0.09) 0%, rgba(34,197,94,0.04) 45%, transparent 70%)",
        }} />
      </div>
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
        {asset.developmentStage && asset.developmentStage !== "unknown" && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium border ${stageClass}`}>
            {asset.developmentStage}
          </span>
        )}
        {asset.modality && asset.modality !== "unknown" && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium border ${modalityClass}`}>
            {asset.modality}
          </span>
        )}
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
