import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BookmarkCheck, ExternalLink,
  FlaskConical, Building2, Key, ArrowRight, CalendarDays,
  Microscope, Link as LinkIcon,
} from "lucide-react";
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

function scoreAccent(score: number, isUnscored: boolean): string {
  if (isUnscored || score === 0) return "bg-border/60";
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-muted-foreground/30";
}

function scoreTextColor(score: number, isUnscored: boolean): string {
  if (isUnscored || score === 0) return "text-muted-foreground";
  if (score >= 75) return "text-emerald-500";
  if (score >= 50) return "text-amber-500";
  return "text-muted-foreground";
}

type AssetCardProps = {
  asset: ScoredAsset;
  isSaved?: boolean;
  onSave?: (asset: ScoredAsset) => void;
  onUnsave?: (id: string, assetName?: string) => void;
};

export function AssetCard({ asset, isSaved, onSave, onUnsave }: AssetCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [spotlight, setSpotlight] = useState({ x: 50, y: 30, visible: false });
  const [, setLocation] = useLocation();

  const isUnscored = asset.score === 0 || (asset.score_breakdown?.signal_coverage ?? 0) === 0;
  const stageClass = getBadgeClass(STAGE_COLORS, asset.development_stage);
  const modalityClass = getBadgeClass(MODALITY_COLORS, asset.modality);

  const hasOwner = asset.owner_name && asset.owner_name !== "unknown";
  const hasInstitution = asset.institution && asset.institution !== "unknown" && asset.institution !== asset.owner_name;
  const licensingAvailable = (asset.licensing_status ?? "").toLowerCase().includes("available");
  const hasWhyItMatters = asset.why_it_matters && asset.why_it_matters.length > 10;
  const isResearcherPublished = asset.source_types?.includes("researcher");
  const accentClass = scoreAccent(asset.score, isUnscored);
  const scoreColor = scoreTextColor(asset.score, isUnscored);

  const handleViewDossier = () => {
    sessionStorage.setItem(`asset-${asset.id}`, JSON.stringify(asset));
    setLocation(`/asset/${asset.id}`);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setSpotlight({ x, y, visible: true });
  };

  const handleMouseLeave = () => {
    setSpotlight((s) => ({ ...s, visible: false }));
  };

  return (
    <div
      ref={cardRef}
      className={`group relative flex flex-col rounded-xl border bg-card overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
        isResearcherPublished
          ? "border-amber-500/30 hover:border-amber-500/50"
          : "border-card-border hover:border-primary/30"
      }`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      data-testid={`asset-card-${asset.id}`}
    >
      {/* Spotlight glow that follows the cursor */}
      <div
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] transition-opacity duration-300"
        style={{
          opacity: spotlight.visible ? 1 : 0,
          background: isResearcherPublished
            ? `radial-gradient(circle at ${spotlight.x}% ${spotlight.y}%, rgba(245,158,11,0.13) 0%, transparent 55%)`
            : `radial-gradient(circle at ${spotlight.x}% ${spotlight.y}%, rgba(34,197,94,0.13) 0%, transparent 55%)`,
        }}
      />

      {/* Left-edge score accent strip */}
      <div className={`absolute left-0 top-0 bottom-0 w-[4px] ${accentClass} transition-all duration-300 group-hover:opacity-100 opacity-80`} />

      {/* Researcher banner */}
      {isResearcherPublished && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 relative z-10">
          <Microscope className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 tracking-wide uppercase">
            Lab Published · Researcher Discovery
          </span>
        </div>
      )}

      {/* Card body */}
      <div className="relative z-10 pl-5 pr-4 pt-4 pb-0 flex flex-col gap-3 flex-1">

        {/* Header: icon + title + score metric + bookmark */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <div className={`mt-0.5 shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors duration-300 ${
              isResearcherPublished
                ? "bg-amber-500/10 group-hover:bg-amber-500/20"
                : "bg-primary/10 group-hover:bg-primary/15"
            }`}>
              {isResearcherPublished
                ? <Microscope className="w-3.5 h-3.5 text-amber-500" />
                : <FlaskConical className="w-3.5 h-3.5 text-primary" />
              }
            </div>
            <h3 className="font-semibold text-foreground text-sm leading-snug line-clamp-2 flex-1" data-testid={`text-asset-name-${asset.id}`}>
              {asset.asset_name !== "unknown" ? asset.asset_name : "Unnamed Asset"}
            </h3>
          </div>

          {/* Score metric — purely passive, tooltip shows breakdown */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col items-end select-none cursor-default" data-testid="score-badge">
                  <span className="text-[8px] font-bold tracking-widest text-muted-foreground uppercase leading-none mb-0.5">Match</span>
                  <span className={`font-mono text-[13px] font-bold leading-none ${scoreColor}`}>
                    {isUnscored ? <span className="opacity-40 text-[11px]">—</span> : Math.round(asset.score)}
                  </span>
                </div>
              </TooltipTrigger>
              {asset.score_breakdown && !isUnscored && (
                <TooltipContent side="bottom" className="p-3 w-56 bg-card border border-card-border shadow-xl">
                  <p className="text-xs font-semibold text-foreground mb-1">Signal Profile</p>
                  <div className="space-y-1.5 mt-2">
                    {(["fit", "novelty", "readiness", "licensability"] as const).map((k) => {
                      const val = (asset.score_breakdown as unknown as Record<string, number>)[k];
                      if (!val || val === 0) return null;
                      const barColor = val >= 75 ? "bg-emerald-500/60" : val >= 50 ? "bg-amber-500/60" : "bg-muted-foreground/30";
                      const textColor = val >= 75 ? "text-emerald-500" : val >= 50 ? "text-amber-500" : "text-muted-foreground";
                      const labels: Record<string, string> = { fit: "Buyer Fit", novelty: "Novelty", readiness: "Readiness", licensability: "Licensability" };
                      return (
                        <div key={k} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-24 shrink-0">{labels[k]}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-card-border overflow-hidden">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${val}%` }} />
                          </div>
                          <span className={`text-[10px] font-mono font-semibold w-7 text-right ${textColor}`}>{val}</span>
                        </div>
                      );
                    })}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
            {isSaved ? (
              <button
                onClick={() => onUnsave?.(asset.id, asset.asset_name)}
                className="w-6 h-6 rounded flex items-center justify-center text-primary bg-primary/10 border border-primary/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all duration-150"
                data-testid={`button-unsave-${asset.id}`}
                title="Remove from saved"
              >
                <BookmarkCheck className="w-3 h-3" />
              </button>
            ) : (
              <PipelinePicker asset={asset} variant="icon" />
            )}
          </div>
        </div>

        {/* Taxonomy badges */}
        <div className="flex flex-wrap gap-1.5">
          {asset.development_stage && asset.development_stage !== "unknown" && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${stageClass}`}>
              {asset.development_stage}
            </span>
          )}
          {asset.modality && asset.modality !== "unknown" && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${modalityClass}`}>
              {asset.modality}
            </span>
          )}
          {asset.source_types?.map((st) => (
            <SourceBadge key={st} sourceType={st} />
          ))}
          {licensingAvailable && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5 font-semibold">
              <Key className="w-2.5 h-2.5" />
              Available
            </span>
          )}
        </div>

        {/* Target / Indication / Owner */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Target</p>
            <p className="text-foreground font-medium truncate" data-testid={`text-target-${asset.id}`}>
              {asset.target !== "unknown" ? asset.target : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Indication</p>
            <p className="text-foreground font-medium truncate" data-testid={`text-indication-${asset.id}`}>
              {asset.indication !== "unknown" ? asset.indication : "—"}
            </p>
          </div>
          {hasOwner && (
            <div className="col-span-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Owner</p>
              <p className="text-foreground font-medium truncate flex items-center gap-1" data-testid={`text-owner-${asset.id}`}>
                <Building2 className="w-3 h-3 shrink-0 text-muted-foreground" />
                {asset.owner_name}
                {hasInstitution && <span className="text-muted-foreground font-normal text-[10px]">· {asset.institution}</span>}
              </p>
            </div>
          )}
        </div>

        {/* Why it matters / summary */}
        {hasWhyItMatters ? (
          <div className="rounded-lg border border-primary/12 bg-primary/[0.04] px-3 py-2">
            <p className="text-[11px] text-foreground/75 leading-relaxed italic line-clamp-3" data-testid={`text-why-matters-${asset.id}`}>
              "{asset.why_it_matters}"
            </p>
          </div>
        ) : asset.summary ? (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {asset.summary}
          </p>
        ) : null}
      </div>

      {/* Footer */}
      <div className="relative z-10 pl-5 pr-3 py-3 mt-3 border-t border-card-border/70 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground min-w-0">
          {asset.latest_signal_date && (
            <span className="flex items-center gap-1 shrink-0" data-testid={`text-date-${asset.id}`}>
              <CalendarDays className="w-3 h-3 opacity-60" />
              {formatSignalDate(asset.latest_signal_date)}
            </span>
          )}
          {asset.evidence_count > 1 && (
            <span className="shrink-0">{asset.evidence_count} signals</span>
          )}
          {asset.source_types?.includes("tech_transfer") && asset.contact_office && (
            <a
              href={asset.source_urls?.[0] ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-primary hover:text-primary/70 transition-colors shrink-0 truncate"
              data-testid={`link-tto-contact-${asset.id}`}
              onClick={(e) => e.stopPropagation()}
              title={asset.contact_office}
            >
              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
              {asset.contact_office}
            </a>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* External source — icon only, not a CTA */}
          {asset.source_urls?.[0] && !asset.source_types?.includes("tech_transfer") && (
            <a
              href={asset.source_urls[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-150"
              data-testid={`link-source-${asset.id}`}
              title="View source"
            >
              <LinkIcon className="w-3 h-3" />
            </a>
          )}
          {/* Single CTA */}
          <Button
            size="sm"
            className="h-7 text-[11px] px-3 gap-1 font-semibold"
            onClick={handleViewDossier}
            data-testid={`button-dossier-${asset.id}`}
          >
            Open Dossier
            <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SavedAssetCard({ asset, onDelete }: { asset: SavedAsset; onDelete: (id: number) => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [spotlight, setSpotlight] = useState({ x: 50, y: 30, visible: false });
  const stageClass = getBadgeClass(STAGE_COLORS, asset.developmentStage);
  const modalityClass = getBadgeClass(MODALITY_COLORS, asset.modality);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setSpotlight({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
      visible: true,
    });
  };

  return (
    <div
      ref={cardRef}
      className="group relative p-4 rounded-xl border border-card-border bg-card hover:border-primary/30 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300 flex flex-col gap-3 overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setSpotlight((s) => ({ ...s, visible: false }))}
      data-testid={`saved-card-${asset.id}`}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] transition-opacity duration-300"
        style={{
          opacity: spotlight.visible ? 1 : 0,
          background: `radial-gradient(circle at ${spotlight.x}% ${spotlight.y}%, rgba(34,197,94,0.11) 0%, transparent 55%)`,
        }}
      />
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-border/60 group-hover:bg-primary/50 transition-colors duration-300" />

      <div className="relative z-10 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 pl-1">
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

      <div className="relative z-10 flex flex-wrap gap-1 pl-1">
        {asset.developmentStage && asset.developmentStage !== "unknown" && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${stageClass}`}>
            {asset.developmentStage}
          </span>
        )}
        {asset.modality && asset.modality !== "unknown" && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${modalityClass}`}>
            {asset.modality}
          </span>
        )}
      </div>

      <div className="relative z-10 text-xs space-y-1 pl-1">
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
          className="relative z-10 text-[11px] text-primary hover:text-primary/80 flex items-center gap-1 transition-colors pl-1"
        >
          <ExternalLink className="w-3 h-3" />
          {asset.sourceJournal} · {asset.publicationYear}
        </a>
      )}
    </div>
  );
}
