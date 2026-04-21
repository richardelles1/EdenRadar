import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ScoreBadge } from "@/components/ScoreBadge";
import { ScoreBreakdownCard } from "@/components/ScoreBreakdownCard";
import { SourceBadge } from "@/components/SourceBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, Building2, ExternalLink, FileText, Key, Shield,
  Activity, Sparkles, BookOpen, Upload, Swords, GraduationCap,
  Beaker, Tag, FlaskConical, Lightbulb, Mail,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ScoredAsset, DossierPayload } from "@/lib/types";

const STAGE_COLORS: Record<string, string> = {
  discovery:  "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30",
  preclinical:"bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  "phase 1":  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30",
  "phase 2":  "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  "phase 3":  "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  approved:   "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

const SOURCE_BADGE_COLORS: Record<string, string> = {
  paper:    "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  preprint: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
};

const LOADING_MESSAGES = [
  "Analyzing IP landscape...",
  "Synthesizing commercial narrative...",
  "Cross-referencing competitive signals...",
  "Drafting market context...",
  "Finalizing intelligence brief...",
];

const SKELETON_SECTIONS = [
  { label: "Full Commercial Dossier",  icon: FileText },
  { label: "Innovation Claim",         icon: Lightbulb },
  { label: "Competitive Landscape",    icon: Swords },
  { label: "Supporting Literature",    icon: GraduationCap },
];

type IntelligenceData = {
  assetRecord: {
    id: number;
    fingerprint: string;
    assetName: string;
    target: string;
    modality: string;
    indication: string;
    developmentStage: string;
    institution: string;
    summary: string;
    sourceUrl: string | null;
    fdaDesignation: string | null;
    fdaDesignationDate: string | null;
  } | null;
  enriched: {
    mechanismOfAction: string | null;
    abstract: string | null;
    categories: string[] | null;
    completenessScore: number | null;
    innovationClaim: string | null;
    ipType: string | null;
    unmetNeed: string | null;
    comparableDrugs: string | null;
    licensingReadiness: string | null;
    patentStatus: string | null;
    licensingStatus: string | null;
    inventors: string[] | null;
    contactEmail: string | null;
  } | null;
  competingAssets: Array<{
    fingerprint: string;
    assetName: string;
    target: string;
    modality: string;
    indication: string;
    developmentStage: string;
    institution: string;
    completenessScore: number | null;
  }>;
  literature: Array<{
    title: string;
    url: string;
    date: string;
    source_type: string;
  }>;
};

function parseMarkdown(text: string): React.ReactNode[] {
  const sections = text.split(/(\*\*[^*]+\*\*)/g);
  return sections.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function NarrativeSection({ narrative }: { narrative: string }) {
  const paragraphs = narrative.split(/\n{2,}/).filter(Boolean);
  return (
    <div className="space-y-4">
      {paragraphs.map((p, i) => (
        <p key={i} className="text-sm text-muted-foreground leading-relaxed">
          {parseMarkdown(p)}
        </p>
      ))}
    </div>
  );
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  if (!value || value === "unknown") return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide font-semibold text-foreground/50">{label}</span>
      <span className={`text-sm font-medium ${accent ? "text-primary" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function isTrivialSummary(summary: string, assetName: string): boolean {
  if (!summary || summary.trim().length === 0) return true;
  const s = summary.trim().toLowerCase();
  const n = assetName.trim().toLowerCase();
  if (s === n) return true;
  if (s.startsWith(n) && summary.trim().length <= assetName.trim().length + 20) return true;
  return false;
}

function useLoadingMessage(isPending: boolean): string {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!isPending) { setIndex(0); return; }
    const t = setInterval(() => setIndex(i => (i + 1) % LOADING_MESSAGES.length), 2500);
    return () => clearInterval(t);
  }, [isPending]);
  return LOADING_MESSAGES[index];
}

function DossierGeneratingState() {
  return (
    <div className="space-y-4" data-testid="dossier-generating-state">
      {SKELETON_SECTIONS.map((sec, i) => (
        <div
          key={sec.label}
          className="rounded-xl border border-border bg-card p-5"
          style={{ animation: `dash-fade-up 400ms ease ${i * 80}ms both`, opacity: 0 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <sec.icon className="w-4 h-4 text-primary/40" />
            <span className="text-sm font-semibold text-muted-foreground/50">{sec.label}</span>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-[85%] rounded" />
            <Skeleton className="h-3 w-[70%] rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AssetDossier() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [asset, setAsset] = useState<ScoredAsset | null>(null);
  const [dossier, setDossier] = useState<DossierPayload | null>(null);

  const fingerprint = sessionStorage.getItem(`asset-fingerprint-${id}`) ?? id;

  const { data: intelligence, isLoading: intelLoading, isError: intelError } = useQuery<IntelligenceData>({
    queryKey: ["/api/assets", fingerprint, "intelligence"],
    queryFn: () =>
      fetch(`/api/assets/${encodeURIComponent(fingerprint)}/intelligence`).then((r) => {
        if (!r.ok) throw new Error("Failed to fetch intelligence");
        return r.json();
      }),
    enabled: !!fingerprint,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    let base: ScoredAsset | null = null;
    const stored = sessionStorage.getItem(`asset-${id}`);
    if (stored) {
      try { base = JSON.parse(stored); } catch {}
    }

    if (intelligence?.assetRecord) {
      const rec = intelligence.assetRecord;
      const enr = intelligence.enriched;
      const dbAsset: ScoredAsset = {
        id: rec.fingerprint ?? String(rec.id),
        asset_name: rec.assetName ?? "Unnamed Asset",
        target: rec.target ?? "unknown",
        modality: rec.modality ?? "unknown",
        indication: rec.indication ?? "unknown",
        development_stage: rec.developmentStage ?? "unknown",
        owner_name: rec.institution ?? "unknown",
        owner_type: "university",
        institution: rec.institution ?? "unknown",
        patent_status: enr?.patentStatus ?? "unknown",
        licensing_status: enr?.licensingStatus ?? "unknown",
        summary: rec.summary ?? "",
        why_it_matters: base?.why_it_matters ?? "",
        evidence_count: base?.evidence_count ?? 0,
        source_types: base?.source_types ?? ["tech_transfer"],
        source_urls: rec.sourceUrl ? [rec.sourceUrl] : (base?.source_urls ?? []),
        latest_signal_date: base?.latest_signal_date ?? "",
        score: base?.score ?? 0,
        score_breakdown: base?.score_breakdown ?? { novelty: 0, freshness: 0, readiness: 0, licensability: 0, fit: 0, competition: 0, total: 0, signal_coverage: 0, scored_dimensions: [], dimension_basis: {} },
        matching_tags: base?.matching_tags ?? [],
        confidence: base?.confidence ?? "low",
        signals: base?.signals ?? [],
        fda_designation: rec.fdaDesignation ?? base?.fda_designation ?? null,
        fda_designation_date: rec.fdaDesignationDate ?? base?.fda_designation_date ?? null,
      };
      setAsset(dbAsset);
    } else if (base) {
      setAsset(base);
    }
  }, [id, intelligence]);

  const dossierMutation = useMutation({
    mutationFn: async (a: ScoredAsset) => {
      const res = await apiRequest("POST", "/api/dossier", { asset: a });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to generate dossier");
      }
      return res.json() as Promise<DossierPayload>;
    },
    onSuccess: (data) => {
      setDossier(data);
      toast({ title: "Dossier generated" });
    },
    onError: (err: any) => {
      toast({ title: "Dossier failed", description: err.message, variant: "destructive" });
    },
  });

  const loadingMessage = useLoadingMessage(dossierMutation.isPending);

  if (!asset && intelLoading) {
    return (
      <div className="min-h-full relative overflow-hidden" style={{ background: "linear-gradient(180deg, hsl(210 30% 96%) 0%, hsl(var(--background)) 40%)" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="min-h-full relative overflow-hidden" style={{ background: "linear-gradient(180deg, hsl(210 30% 96%) 0%, hsl(var(--background)) 40%)" }}>
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <p className="text-muted-foreground mb-4">Asset not found. Please return to Discover and try again.</p>
          <Button variant="outline" onClick={() => setLocation("/discover")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Discover
          </Button>
        </div>
      </div>
    );
  }

  const enriched = intelligence?.enriched;
  const stageClass = STAGE_COLORS[asset.development_stage?.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
  const licensingAvailable = (enriched?.licensingStatus ?? asset.licensing_status ?? "").toLowerCase().includes("available");

  const bd = asset.score_breakdown;
  const scoredDimsCount = bd?.scored_dimensions?.length ?? 0;
  const signalCoverage = bd?.signal_coverage ?? 0;
  const strongSignal = asset.score >= 85 && (signalCoverage >= 60 || scoredDimsCount >= 4);
  const scoreVerdict = strongSignal
    ? { label: "Strong Commercial Signal", color: "text-emerald-600 dark:text-emerald-400" }
    : asset.score >= 70
    ? { label: "Moderate Signal",          color: "text-amber-600 dark:text-amber-400" }
    : { label: "Emerging Signal",          color: "text-muted-foreground" };

  const allCategories = [
    ...(enriched?.categories ?? []),
    ...(asset.matching_tags ?? []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="min-h-full relative overflow-hidden" data-testid="print-target" style={{ background: "linear-gradient(180deg, hsl(210 30% 96%) 0%, hsl(var(--background)) 40%)" }}>
      <style>{`
        @keyframes dash-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-5">

        {/* ── Back nav ── */}
        <div className="no-print" style={{ animation: "dash-fade-up 300ms ease both" }}>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground gap-1.5"
            onClick={() => setLocation("/discover")}
            data-testid="button-back-to-discover"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Discover
          </Button>
        </div>

        {/* ── Header panel ── */}
        <div
          className="rounded-xl border border-primary/15 p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25"
          style={{
            background: "color-mix(in srgb, hsl(var(--primary)) 3%, hsl(var(--background)))",
            animation: "dash-fade-up 400ms ease both",
          }}
        >
          {/* Top row: score/stage/licensing + Print button */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <ScoreBadge score={asset.score} breakdown={asset.score_breakdown} size="lg" />
                {asset.development_stage && asset.development_stage !== "unknown" && (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border capitalize ${stageClass}`}>
                    {asset.development_stage}
                  </span>
                )}
                {licensingAvailable && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2.5 py-1 font-semibold">
                    <Key className="w-3 h-3" />
                    Available for Licensing
                  </span>
                )}
                {asset.fda_designation && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-semibold border ${
                            asset.fda_designation.toLowerCase().includes("orphan")
                              ? "bg-purple-50 dark:bg-purple-950/40 border-purple-300/60 dark:border-purple-700/40 text-purple-700 dark:text-purple-300"
                              : asset.fda_designation.toLowerCase().includes("breakthrough")
                              ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300/60 dark:border-amber-700/40 text-amber-700 dark:text-amber-300"
                              : "bg-sky-50 dark:bg-sky-950/40 border-sky-300/60 dark:border-sky-700/40 text-sky-700 dark:text-sky-300"
                          }`}
                          data-testid="badge-fda-designation"
                        >
                          <Shield className="w-3 h-3" />
                          FDA {asset.fda_designation}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs max-w-56">
                        {asset.fda_designation.toLowerCase().includes("orphan")
                          ? "FDA Orphan Drug Designation -- granted for drugs targeting rare diseases affecting fewer than 200,000 people."
                          : asset.fda_designation.toLowerCase().includes("breakthrough")
                          ? "FDA Breakthrough Therapy Designation -- expedited development and review for serious conditions."
                          : "FDA Fast Track Designation -- expedited review to treat serious conditions with unmet medical needs."}
                        {asset.fda_designation_date && (
                          <span className="block mt-1 opacity-70">Designated {asset.fda_designation_date}</span>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <p className={`text-sm font-bold mb-1.5 ${scoreVerdict.color}`} data-testid="score-verdict-label">
                {scoreVerdict.label}
              </p>
              <h1 className="text-2xl font-bold text-foreground mb-1 leading-tight" data-testid="dossier-asset-name">
                {asset.asset_name !== "unknown" ? asset.asset_name : "Unnamed Asset"}
              </h1>
              <p className="text-muted-foreground text-sm">{asset.indication}</p>

              {/* Taxonomy tags — inline */}
              {allCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {allCategories.map((cat) => (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-primary/20 bg-primary/5 text-primary font-medium"
                    >
                      <Tag className="w-2.5 h-2.5" />
                      {cat}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 text-xs no-print"
              onClick={() => {
                try {
                  sessionStorage.setItem(`asset-${id}`, JSON.stringify(asset));
                  if (dossier) sessionStorage.setItem(`dossier-${id}`, JSON.stringify(dossier));
                } catch {}
                setLocation(`/asset/${id}/print`);
              }}
              data-testid="button-export-dossier"
            >
              <Upload className="w-3.5 h-3.5" />
              Export Dossier
            </Button>
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-primary/10">
            <InfoRow label="Target"    value={asset.target} />
            <InfoRow label="Modality"  value={asset.modality} />
            <InfoRow label="Stage"     value={asset.development_stage} />
            <InfoRow label="Owner"     value={asset.owner_name} />
            <InfoRow label="Institution" value={asset.institution !== asset.owner_name ? asset.institution : ""} />
            <InfoRow label="Licensing" value={enriched?.licensingStatus ?? asset.licensing_status} accent={licensingAvailable} />
            <InfoRow label="Patent"    value={enriched?.patentStatus ?? asset.patent_status} />
            {enriched?.mechanismOfAction && (
              <InfoRow label="Mechanism of Action" value={enriched.mechanismOfAction} />
            )}
            {enriched?.ipType && (
              <InfoRow label="IP Type" value={enriched.ipType} />
            )}
            {enriched?.licensingReadiness && (
              <InfoRow label="Licensing Readiness" value={enriched.licensingReadiness} />
            )}
            {(enriched?.inventors?.length ?? 0) > 0 && (
              <InfoRow label="Inventors" value={enriched!.inventors!.join(", ")} />
            )}
          </div>

          {/* Sources */}
          {asset.source_types?.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-primary/10">
              <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Sources:</span>
              {asset.source_types.map((st) => (
                <SourceBadge key={st} sourceType={st} />
              ))}
              {asset.evidence_count > 0 && (
                <span className="text-[11px] text-muted-foreground ml-1">
                  {asset.evidence_count} signal{asset.evidence_count !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}

          {/* Licensing contact */}
          {enriched?.contactEmail && (
            <div className="mt-4 pt-3 border-t border-primary/10">
              <a
                href={`mailto:${enriched.contactEmail}`}
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                data-testid="contact-email-link"
              >
                <Mail className="w-3 h-3" />
                {enriched.contactEmail}
              </a>
            </div>
          )}

          {/* Why it matters quote */}
          {asset.why_it_matters && (
            <div className="mt-4 pt-4 border-t border-primary/10 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-foreground/80 leading-relaxed italic">"{asset.why_it_matters}"</p>
            </div>
          )}

          {/* Signal Profile — above CTA */}
          {asset.score_breakdown && (
            <div className="mt-4 pt-4 border-t border-primary/10">
              <ScoreBreakdownCard breakdown={asset.score_breakdown} />
            </div>
          )}

          {/* CTA gate */}
          {!dossier && (
            <div className="mt-6 pt-5 border-t border-primary/10" data-testid="dossier-gate">
              <Button
                onClick={() => asset && dossierMutation.mutate(asset)}
                disabled={dossierMutation.isPending}
                size="lg"
                className="gap-2 w-full"
                data-testid="button-generate-dossier"
              >
                <FileText className="w-4 h-4" />
                {dossierMutation.isPending ? loadingMessage : "Generate Full Intelligence Brief"}
              </Button>
            </div>
          )}
        </div>

        {/* ── Dossier generating skeletons ── */}
        {dossierMutation.isPending && <DossierGeneratingState />}

        {/* ── Intelligence loading ── */}
        {intelLoading && !dossier && (
          <div className="space-y-3" data-testid="intelligence-loading">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        )}

        {/* ── Intelligence error ── */}
        {intelError && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4" data-testid="intelligence-error">
            <p className="text-xs text-amber-700 dark:text-amber-400">Competitive landscape data is unavailable for this asset.</p>
          </div>
        )}

        {/* ── Dossier content (single column) ── */}
        {dossier && (
          <>
            {/* Narrative */}
            <div
              className="rounded-xl border border-border bg-card p-5"
              style={{ animation: "dash-fade-up 400ms ease 80ms both" }}
              data-testid="dossier-narrative-panel"
            >
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Full Commercial Dossier</h2>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  Generated {new Date(dossier.generated_at).toLocaleTimeString()}
                </span>
              </div>
              <NarrativeSection narrative={dossier.narrative} />
            </div>

            {/* Abstract / Summary */}
            {(enriched?.abstract || (!isTrivialSummary(asset.summary, asset.asset_name) && asset.summary)) && (
              <div
                className="rounded-xl border border-border bg-card p-5"
                style={{ animation: "dash-fade-up 400ms ease 120ms both" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">
                    {enriched?.abstract ? "Abstract" : "Summary"}
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {(enriched?.abstract ?? asset.summary).replace(/^summary:\s*/i, "")}
                </p>
              </div>
            )}

            {/* Innovation Claim */}
            {enriched?.innovationClaim && enriched.innovationClaim.length > 30 && (
              <div
                className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5"
                style={{ animation: "dash-fade-up 400ms ease 160ms both" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <h2 className="text-sm font-semibold text-foreground">Innovation Claim</h2>
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">{enriched.innovationClaim}</p>
              </div>
            )}

            {/* Unmet Need */}
            {enriched?.unmetNeed && enriched.unmetNeed.length > 30 && (
              <div
                className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-5"
                style={{ animation: "dash-fade-up 400ms ease 200ms both" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <FlaskConical className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <h2 className="text-sm font-semibold text-foreground">Unmet Need</h2>
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">{enriched.unmetNeed}</p>
              </div>
            )}

            {/* Comparable Drugs */}
            {enriched?.comparableDrugs && (
              <div
                className="rounded-xl border border-border bg-card p-5"
                style={{ animation: "dash-fade-up 400ms ease 240ms both" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Beaker className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">Comparable Drugs</h2>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{enriched.comparableDrugs}</p>
              </div>
            )}

            {/* Competing Assets */}
            {(intelligence?.competingAssets?.length ?? 0) > 0 && (
              <div
                className="rounded-xl border border-border bg-card p-5"
                style={{ animation: "dash-fade-up 400ms ease 280ms both" }}
                data-testid="competing-assets-panel"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Swords className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">Competing Assets</h2>
                  <Badge variant="secondary" className="text-[10px]">
                    {intelligence!.competingAssets.length} found
                  </Badge>
                </div>
                <div className="space-y-2">
                  {intelligence!.competingAssets.map((comp) => {
                    const compStage = STAGE_COLORS[comp.developmentStage?.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
                    return (
                      <div
                        key={comp.fingerprint}
                        className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/60 hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer"
                        onClick={() => {
                          sessionStorage.setItem(`asset-${comp.fingerprint}`, JSON.stringify({
                            id: comp.fingerprint,
                            asset_name: comp.assetName,
                            target: comp.target,
                            modality: comp.modality,
                            indication: comp.indication,
                            development_stage: comp.developmentStage,
                            owner_name: comp.institution,
                            owner_type: "university",
                            institution: comp.institution,
                            patent_status: "unknown",
                            licensing_status: "unknown",
                            summary: "",
                            why_it_matters: "",
                            evidence_count: 0,
                            source_types: ["tech_transfer"],
                            source_urls: [],
                            latest_signal_date: "",
                            score: 0,
                            score_breakdown: { novelty: 0, freshness: 0, readiness: 0, licensability: 0, fit: 0, competition: 0, total: 0, signal_coverage: 0, scored_dimensions: [], dimension_basis: {} },
                            matching_tags: [],
                            confidence: "low",
                            signals: [],
                          }));
                          sessionStorage.setItem(`asset-fingerprint-${comp.fingerprint}`, comp.fingerprint);
                          setLocation(`/asset/${comp.fingerprint}`);
                        }}
                        data-testid={`competing-asset-${comp.fingerprint}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{comp.assetName}</p>
                          {[comp.target, comp.modality].filter(v => v && v !== "unknown").length > 0 && (
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {[comp.target, comp.modality].filter(v => v && v !== "unknown").map((v, i, arr) => (
                                <span key={v} className="text-[10px] text-muted-foreground">
                                  {v}{i < arr.length - 1 ? " ·" : ""}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] px-2 py-0.5 rounded-md border font-semibold capitalize ${compStage}`}>
                            {comp.developmentStage}
                          </span>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Building2 className="w-3 h-3" />
                            <span className="truncate max-w-[100px]">{comp.institution}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Supporting Literature */}
            {(intelligence?.literature?.length ?? 0) > 0 && (
              <div
                className="rounded-xl border border-border bg-card p-5"
                style={{ animation: "dash-fade-up 400ms ease 320ms both" }}
                data-testid="supporting-literature-panel"
              >
                <div className="flex items-center gap-2 mb-4">
                  <GraduationCap className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">Supporting Literature</h2>
                  <Badge variant="secondary" className="text-[10px]">
                    {intelligence!.literature.length} results
                  </Badge>
                </div>
                <div className="space-y-2">
                  {intelligence!.literature.map((lit, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-border/60 hover:border-primary/30 hover:bg-primary/5 transition-all"
                    >
                      <Badge
                        variant="outline"
                        className={`text-[10px] shrink-0 mt-0.5 ${SOURCE_BADGE_COLORS[lit.source_type] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {lit.source_type === "paper" ? "PubMed" : lit.source_type === "preprint" ? "bioRxiv" : lit.source_type}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground line-clamp-2">{lit.title}</p>
                        {lit.date && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{lit.date}</p>
                        )}
                      </div>
                      {lit.url && (
                        <a
                          href={lit.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-primary hover:text-primary/80 transition-colors"
                          data-testid={`literature-link-${i}`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Evidence Signals */}
            {asset.signals?.length > 0 && (
              <div
                className="rounded-xl border border-border bg-card p-5"
                style={{ animation: "dash-fade-up 400ms ease 360ms both" }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">Evidence Signals</h2>
                  <span className="text-xs text-muted-foreground ml-1">({asset.signals.length})</span>
                </div>
                <div className="space-y-2">
                  {asset.signals.map((signal) => (
                    <div key={signal.id} className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-border/60">
                      <SourceBadge sourceType={signal.source_type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground line-clamp-2">{signal.title}</p>
                        {signal.date && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{signal.date}</p>
                        )}
                      </div>
                      {signal.url && (
                        <a
                          href={signal.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-primary hover:text-primary/80 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
