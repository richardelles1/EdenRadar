import { useLocation } from "wouter";
import { Nav } from "@/components/Nav";
import { ScoreBadge } from "@/components/ScoreBadge";
import { SourceBadge } from "@/components/SourceBadge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Printer, FileText, Building2, Key, ExternalLink,
  BookOpen, User, Calendar,
} from "lucide-react";
import type { ReportPayload, ScoredAsset } from "@/lib/types";

function parseMarkdown(text: string): React.ReactNode[] {
  const sections = text.split(/(\*\*[^*]+\*\*)/g);
  return sections.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function NarrativeSection({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
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

function TopAssetRow({ asset, rank }: { asset: ScoredAsset; rank: number }) {
  const [, setLocation] = useLocation();
  const licensingAvailable = (asset.licensing_status ?? "").toLowerCase().includes("available");

  return (
    <div
      className="p-4 rounded-lg border border-card-border bg-card hover:border-primary/30 transition-all duration-150 flex items-start gap-4"
      data-testid={`report-asset-${asset.id}`}
    >
      <div className="text-lg font-bold text-muted-foreground/40 w-6 shrink-0 text-right mt-0.5">#{rank}</div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{asset.asset_name}</h3>
            <p className="text-xs text-muted-foreground">{asset.indication}</p>
          </div>
          <ScoreBadge score={asset.score} breakdown={asset.score_breakdown} size="sm" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] border border-card-border bg-muted text-muted-foreground px-2 py-0.5 rounded-sm capitalize">
            {asset.modality}
          </span>
          <span className="text-[10px] border border-card-border bg-muted text-muted-foreground px-2 py-0.5 rounded-sm capitalize">
            {asset.development_stage}
          </span>
          {asset.source_types?.map((st) => (
            <SourceBadge key={st} sourceType={st} />
          ))}
        </div>
        <div className="flex items-center gap-3">
          {asset.owner_name && asset.owner_name !== "unknown" && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {asset.owner_name}
            </p>
          )}
          {licensingAvailable && (
            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
              <Key className="w-2.5 h-2.5" />
              Available
            </span>
          )}
        </div>
        {asset.why_it_matters && (
          <p className="text-xs text-primary/70 italic line-clamp-2">"{asset.why_it_matters}"</p>
        )}
      </div>
      <div className="flex flex-col gap-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1 text-muted-foreground hover:text-primary"
          onClick={() => {
            sessionStorage.setItem(`asset-${asset.id}`, JSON.stringify(asset));
            setLocation(`/asset/${asset.id}`);
          }}
          data-testid={`button-report-dossier-${asset.id}`}
        >
          <FileText className="w-3 h-3" />
          Dossier
        </Button>
        {asset.source_urls?.[0] && (
          <a
            href={asset.source_urls[0]}
            target="_blank"
            rel="noopener noreferrer"
            className="h-7 inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 px-2"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

interface ReportPageState {
  report: ReportPayload;
}

export default function Report() {
  const [location, setLocation] = useLocation();

  const state = (typeof window !== "undefined" && window.history.state?.report)
    ? window.history.state as ReportPageState
    : null;

  const reportFromSession = (() => {
    try {
      const stored = sessionStorage.getItem("current-report");
      return stored ? JSON.parse(stored) as ReportPayload : null;
    } catch {
      return null;
    }
  })();

  const report: ReportPayload | null = state?.report ?? reportFromSession;

  if (!report) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Nav />
        <div className="max-w-4xl mx-auto px-4 py-24 text-center">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
          <h2 className="text-xl font-semibold text-foreground mb-2">No Report Available</h2>
          <p className="text-muted-foreground text-sm mb-6">
            Run a search from the Discover page and click "Generate Match Report" to create a buyer intelligence report.
          </p>
          <Button onClick={() => setLocation("/discover")} data-testid="button-go-to-discover">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go to Discover
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Nav />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 w-full">
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground gap-1.5"
            onClick={() => setLocation("/discover")}
            data-testid="button-back-from-report"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => window.print()}
            data-testid="button-print-report"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Report
          </Button>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-card-border bg-card p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 border border-primary/20 rounded-sm px-2 py-0.5">
                    Intelligence Report
                  </span>
                </div>
                <h1 className="text-xl font-bold text-foreground leading-tight" data-testid="report-title">
                  {report.title}
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground border-t border-card-border pt-4">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(report.generated_at).toLocaleString()}
              </div>
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                Query: <span className="font-medium text-foreground">"{report.query}"</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                {report.top_assets.length} assets ranked
              </div>
            </div>
          </div>

          {report.buyer_profile_summary && (
            <div className="rounded-xl border border-primary/15 bg-primary/5 p-5">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Buyer Thesis</h2>
              </div>
              <p className="text-xs text-muted-foreground" data-testid="report-buyer-profile">
                {report.buyer_profile_summary}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-card-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Executive Summary
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed" data-testid="report-executive-summary">
              {report.executive_summary}
            </p>
          </div>

          {report.top_assets.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ArrowLeft className="w-4 h-4 text-primary rotate-180" />
                Top Ranked Opportunities
              </h2>
              {report.top_assets.map((asset, i) => (
                <TopAssetRow key={asset.id} asset={asset} rank={i + 1} />
              ))}
            </div>
          )}

          {report.narrative && (
            <div className="rounded-xl border border-card-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                Intelligence Analysis
              </h2>
              <NarrativeSection text={report.narrative} />
            </div>
          )}

          <div className="rounded-xl border border-card-border bg-muted/20 p-4 text-center">
            <p className="text-[11px] text-muted-foreground">
              Generated by HelixRadar v2 · {new Date(report.generated_at).toLocaleString()} · For research purposes only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
