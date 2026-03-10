import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Nav } from "@/components/Nav";
import { ScoreBadge } from "@/components/ScoreBadge";
import { ScoreBreakdownCard } from "@/components/ScoreBreakdownCard";
import { SourceBadge } from "@/components/SourceBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, Building2, ExternalLink, FileText, Key, Shield,
  Activity, Sparkles, BookOpen, Printer,
} from "lucide-react";
import type { ScoredAsset, DossierPayload } from "@/lib/types";

const STAGE_COLORS: Record<string, string> = {
  discovery: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  preclinical: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "phase 1": "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  "phase 2": "bg-sky-500/15 text-sky-400 border-sky-500/30",
  "phase 3": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
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
      <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${accent ? "text-primary" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

export default function AssetDossier() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [asset, setAsset] = useState<ScoredAsset | null>(null);
  const [dossier, setDossier] = useState<DossierPayload | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(`asset-${id}`);
    if (stored) {
      try {
        setAsset(JSON.parse(stored));
      } catch {}
    }
  }, [id]);

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

  if (!asset) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Nav />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <p className="text-muted-foreground mb-4">Asset not found. Please return to Discover and try again.</p>
          <Button variant="outline" onClick={() => setLocation("/discover")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Discover
          </Button>
        </div>
      </div>
    );
  }

  const stageClass = STAGE_COLORS[asset.development_stage?.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
  const licensingAvailable = (asset.licensing_status ?? "").toLowerCase().includes("available");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Nav />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 w-full">
        <div className="flex items-center gap-3 mb-6">
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

        <div className="space-y-6">
          <div className="rounded-xl border border-card-border bg-card p-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <ScoreBadge score={asset.score} breakdown={asset.score_breakdown} size="lg" />
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border capitalize ${stageClass}`}>
                    {asset.development_stage}
                  </span>
                  {licensingAvailable && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2.5 py-1 font-semibold">
                      <Key className="w-3 h-3" />
                      Available for Licensing
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-2 leading-tight" data-testid="dossier-asset-name">
                  {asset.asset_name !== "unknown" ? asset.asset_name : "Unnamed Asset"}
                </h1>
                <p className="text-muted-foreground text-sm">{asset.indication}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5 text-xs"
                onClick={() => window.print()}
                data-testid="button-print-dossier"
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </Button>
            </div>

            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-card-border">
              <InfoRow label="Target" value={asset.target} />
              <InfoRow label="Modality" value={asset.modality} />
              <InfoRow label="Stage" value={asset.development_stage} />
              <InfoRow label="Owner" value={asset.owner_name} />
              <InfoRow label="Institution" value={asset.institution !== asset.owner_name ? asset.institution : ""} />
              <InfoRow label="Licensing" value={asset.licensing_status} accent={licensingAvailable} />
              <InfoRow label="Patent" value={asset.patent_status} />
            </div>

            {asset.source_types?.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-card-border">
                <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Sources:</span>
                {asset.source_types.map((st) => (
                  <SourceBadge key={st} sourceType={st} />
                ))}
                <span className="text-[11px] text-muted-foreground ml-1">
                  {asset.evidence_count} signal{asset.evidence_count !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            <div className="sm:col-span-2 space-y-6">
              {asset.why_it_matters && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Commercial Opportunity Signal</h2>
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed italic">"{asset.why_it_matters}"</p>
                </div>
              )}

              {asset.summary && (
                <div className="rounded-xl border border-card-border bg-card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">Summary</h2>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{asset.summary}</p>
                </div>
              )}

              {dossier ? (
                <div className="rounded-xl border border-card-border bg-card p-5" data-testid="dossier-narrative-panel">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Full Commercial Dossier</h2>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      Generated {new Date(dossier.generated_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <NarrativeSection narrative={dossier.narrative} />
                </div>
              ) : (
                <div className="rounded-xl border border-card-border bg-card p-5 text-center">
                  <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-40" />
                  <h3 className="text-sm font-semibold text-foreground mb-1">Full Commercial Dossier</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    AI-generated investor-grade brief: exec summary, commercial rationale, licensing outlook, risks, and recommended next step.
                  </p>
                  <Button
                    onClick={() => asset && dossierMutation.mutate(asset)}
                    disabled={dossierMutation.isPending}
                    className="gap-2 text-sm"
                    data-testid="button-generate-dossier"
                  >
                    <FileText className="w-4 h-4" />
                    {dossierMutation.isPending ? "Generating..." : "Generate Dossier"}
                  </Button>
                </div>
              )}

              {asset.signals?.length > 0 && (
                <div className="rounded-xl border border-card-border bg-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">Evidence Signals</h2>
                    <span className="text-xs text-muted-foreground ml-1">({asset.signals.length})</span>
                  </div>
                  <div className="space-y-3">
                    {asset.signals.map((signal) => (
                      <div key={signal.id} className="flex items-start gap-3 p-3 rounded-lg bg-background border border-card-border">
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
            </div>

            <div className="space-y-4">
              <ScoreBreakdownCard breakdown={asset.score_breakdown} />

              {asset.matching_tags?.length > 0 && (
                <div className="rounded-xl border border-card-border bg-card p-4">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Tags</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {asset.matching_tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-2 py-0.5 rounded-full border border-card-border bg-muted text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-card-border bg-card p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Confidence</h3>
                <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  asset.confidence === "high" ? "bg-emerald-500/15 text-emerald-400" :
                  asset.confidence === "medium" ? "bg-amber-500/15 text-amber-400" :
                  "bg-muted text-muted-foreground"
                }`}>
                  <Shield className="w-3 h-3" />
                  {asset.confidence} confidence
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Based on completeness of extracted fields and number of corroborating signals.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
