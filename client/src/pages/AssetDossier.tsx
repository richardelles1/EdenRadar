import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { ScoreBadge } from "@/components/ScoreBadge";
import { ScoreBreakdownCard } from "@/components/ScoreBreakdownCard";
import { SourceBadge } from "@/components/SourceBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, Building2, ExternalLink, FileText, Key,
  Activity, Sparkles, BookOpen, Upload, Swords, GraduationCap,
  Beaker, Tag, FlaskConical, Lightbulb, Share2, Copy, Check,
  Eye, EyeOff, Loader2, Lock, ShoppingBag, TrendingUp, Zap,
  ChevronDown, ChevronUp, ChevronRight, RefreshCw, ArrowRight,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ScoredAsset, DossierPayload, SignalEvent } from "@/lib/types";


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

const TIMELINE_LEGEND = [
  { color: "bg-emerald-500", label: "Stage Change" },
  { color: "bg-sky-500",     label: "First Indexed" },
  { color: "bg-amber-500",   label: "Content Update" },
  { color: "bg-violet-500",  label: "Citation Update" },
];

type StreamState = {
  narrative: string;
  isStreaming: boolean;
  isComplete: boolean;
  generatedAt: string | null;
  error: string | null;
};

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
    dataSparse: boolean;
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
    categoryConfidence?: number | null;
    assetClass?: string | null;
    enrichmentSources?: Record<string, string> | null;
    humanVerified?: Record<string, boolean> | null;
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
  clinicalTrials: Array<{
    nctId: string;
    title: string;
    phase: string;
    status: string;
    url: string;
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

function NarrativeSection({ narrative, isStreaming }: { narrative: string; isStreaming: boolean }) {
  const paragraphs = narrative.split(/\n{2,}/).filter(Boolean);
  return (
    <div className="space-y-4">
      {paragraphs.map((p, i) => (
        <p
          key={i}
          className="text-sm text-muted-foreground leading-relaxed"
          style={{ animation: "dash-fade-up 280ms ease both", animationDelay: `${Math.min(i * 60, 300)}ms` }}
        >
          {parseMarkdown(p)}
          {isStreaming && i === paragraphs.length - 1 && (
            <span className="inline-block w-0.5 h-3.5 bg-primary/60 ml-0.5 animate-pulse align-middle" />
          )}
        </p>
      ))}
    </div>
  );
}

function extractSuggestedNextStep(narrative: string): string | null {
  const match = narrative.match(/\*\*Suggested Next Step[^*]*\*\*[^:\n]*:?\s*([\s\S]*?)(?=\n\n\*\*|$)/i);
  return match ? match[1].trim() : null;
}

function getProvenanceLabel(
  fieldKey: string,
  enrichmentSources: Record<string, string> | null | undefined,
  humanVerified: Record<string, boolean> | null | undefined,
): string | null {
  if (humanVerified?.[fieldKey] === true) return "Human verified";
  const src = enrichmentSources?.[fieldKey];
  if (!src) return null;
  if (src === "gpt-4o") return "AI inferred · GPT-4o";
  if (src === "gpt-4o-mini" || src === "mini") return "AI inferred · GPT-4o mini";
  if (src === "rule" || src === "regex") return "Rule-based extraction";
  if (src === "rule:tto_source") return "Sourced from TTO listing";
  if (src === "rule:patent_text_extraction") return "Extracted from patent text";
  if (src === "rule:uspto_jaccard") return "Matched via USPTO";
  if (src === "llm") return "AI inferred";
  return null;
}

function InfoRow({ label, value, accent, provenanceLabel }: {
  label: string; value: string; accent?: boolean; provenanceLabel?: string | null;
}) {
  if (!value || value === "unknown") return null;
  const inner = (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide font-semibold text-foreground/50">{label}</span>
      <span className={`text-sm font-medium ${accent ? "text-primary" : "text-foreground"}`}>{value}</span>
    </div>
  );
  if (!provenanceLabel) return inner;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-default">{inner}</div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[180px]">
          {provenanceLabel}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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

function NarrativeSkeleton() {
  return (
    <div className="space-y-2.5" data-testid="dossier-generating-state">
      {[100, 85, 92, 70, 88].map((w, i) => (
        <Skeleton key={i} className="h-3 rounded" style={{ width: `${w}%`, animationDelay: `${i * 60}ms` }} />
      ))}
    </div>
  );
}

function useReducedMotion() {
  const [pref, setPref] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const h = (e: MediaQueryListEvent) => setPref(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return pref;
}

function CountUp({ value, duration = 600 }: { value: number; duration: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (duration === 0) { setDisplay(value); return; }
    let raf: number;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{display.toFixed(1)}</>;
}

function Tier2Row({
  num, title, statusText, isExpanded, onToggle, isSparse, staggerIndex = 0, children,
}: {
  num: string; title: string; statusText: string;
  isExpanded: boolean; onToggle: () => void;
  isSparse: boolean; staggerIndex?: number; children: React.ReactNode;
}) {
  return (
    <div style={{
      borderTop: "1px solid hsl(220 14% 93%)",
      animation: "dash-fade-up 260ms ease both",
      animationDelay: `${staggerIndex * 45}ms`,
    }}>
      <button
        onClick={onToggle}
        className="w-full text-left hover:bg-black/[0.018] transition-colors"
        style={{
          display: "grid", gridTemplateColumns: "56px 1fr auto 20px",
          gap: "0 16px", alignItems: "center",
          padding: "12px 24px 12px 22px",
          background: "transparent", border: "none", cursor: "pointer",
        }}
      >
        <span style={{
          fontSize: "17px", fontWeight: 900, letterSpacing: "-0.03em",
          color: isSparse ? "hsl(33 62% 44% / 0.14)" : "hsl(142 52% 36% / 0.14)",
          fontVariantNumeric: "tabular-nums", textAlign: "right",
        }}>
          {num}
        </span>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "hsl(222 18% 22%)" }}>{title}</span>
        <span style={{ fontSize: "10.5px", fontWeight: 600, color: "hsl(220 10% 58%)", whiteSpace: "nowrap" }}>{statusText}</span>
        <ChevronRight style={{
          width: "15px", height: "15px",
          color: "hsl(220 10% 66%)",
          transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
          flexShrink: 0,
        }} />
      </button>
      <div style={{
        display: "grid",
        gridTemplateRows: isExpanded ? "1fr" : "0fr",
        transition: "grid-template-rows 220ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{
            padding: "2px 24px 20px 78px",
            opacity: isExpanded ? 1 : 0,
            transform: isExpanded ? "translateY(0)" : "translateY(4px)",
            transition: `opacity 180ms ease ${isExpanded ? "60ms" : "0ms"}, transform 180ms ease ${isExpanded ? "60ms" : "0ms"}`,
          }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRelativeDate(dateStr: string): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const now = new Date();
  const months = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
  if (months < 1) return "This month";
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;
  const yrs = Math.floor(months / 12);
  return yrs === 1 ? "1 year ago" : `${yrs} years ago`;
}

export default function AssetDossier() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { session } = useAuth();
  const [asset, setAsset] = useState<ScoredAsset | null>(null);
  const [dossier, setDossier] = useState<DossierPayload | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [metaExpanded, setMetaExpanded] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [sharePassword, setSharePassword] = useState("");
  const [sharePasswordVisible, setSharePasswordVisible] = useState(false);

  const prefersReducedMotion = useReducedMotion();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const toggleSection = (id: string) =>
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const [streamState, setStreamState] = useState<StreamState>({
    narrative: "", isStreaming: false, isComplete: false, generatedAt: null, error: null,
  });
  const streamStartedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const fingerprint = sessionStorage.getItem(`asset-fingerprint-${id}`) ?? id;

  async function handleExportPdf() {
    if (!asset || pdfLoading) return;
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(fingerprint)}/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          asset,
          dossier: dossier ? { narrative: dossier.narrative, generated_at: dossier.generated_at } : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "PDF generation failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `EdenRadar_Dossier.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message ?? "Could not generate PDF", variant: "destructive" });
    } finally {
      setPdfLoading(false);
    }
  }

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

  const { data: regulatoryData } = useQuery<{
    designations: Array<{
      id: number;
      applicationNumber: string | null;
      sponsorName: string | null;
      genericName: string | null;
      brandName: string | null;
      indication: string;
      sourceUrl: string | null;
      similarity: number;
    }>;
  }>({
    queryKey: ["/api/assets", fingerprint, "regulatory"],
    queryFn: () =>
      fetch(`/api/assets/${encodeURIComponent(fingerprint)}/regulatory`).then((r) =>
        r.ok ? r.json() : { designations: [] },
      ),
    enabled: !!fingerprint,
    staleTime: 60 * 60 * 1000,
  });
  const orphanDesignations = regulatoryData?.designations ?? [];

  const { data: marketListingData } = useQuery<{
    listing: { id: number; therapeuticArea: string; modality: string; stage: string; assetName: string | null; blind: boolean; engagementStatus: string } | null;
  }>({
    queryKey: ["/api/assets", fingerprint, "market-listing"],
    enabled: !!fingerprint && !!session,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      fetch(`/api/assets/${encodeURIComponent(fingerprint)}/market-listing`, {
        headers: {
          Authorization: `Bearer ${session!.access_token}`,
          "x-user-id": session!.user.id,
        },
      }).then(r => r.ok ? r.json() : { listing: null }),
  });
  const marketListing = marketListingData?.listing ?? null;

  const { data: signalEventsData } = useQuery<{ events: SignalEvent[] }>({
    queryKey: ["/api/assets", fingerprint, "signal-events"],
    queryFn: () =>
      fetch(`/api/assets/${encodeURIComponent(fingerprint)}/signal-events`).then((r) =>
        r.ok ? r.json() : { events: [] }
      ),
    enabled: !!fingerprint,
    staleTime: 5 * 60 * 1000,
  });
  const signalEvents = signalEventsData?.events ?? [];

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
        category_confidence: enr?.categoryConfidence ?? base?.category_confidence,
        asset_class: enr?.assetClass ?? base?.asset_class ?? null,
        signals: base?.signals ?? [],
        momentum_score: base?.momentum_score ?? null,
      };
      setAsset(dbAsset);
    } else if (base) {
      setAsset(base);
    }
  }, [id, intelligence]);

  const startStream = useCallback(async (targetAsset: ScoredAsset, fullModel = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStreamState({ narrative: "", isStreaming: true, isComplete: false, generatedAt: null, error: null });
    setDossier(null);
    let fullNarrative = "";

    try {
      const dossierContext = intelligence ? {
        mechanismOfAction: intelligence.enriched?.mechanismOfAction ?? null,
        innovationClaim: intelligence.enriched?.innovationClaim ?? null,
        unmetNeed: intelligence.enriched?.unmetNeed ?? null,
        comparableDrugs: intelligence.enriched?.comparableDrugs ?? null,
        abstract: intelligence.enriched?.abstract ?? null,
        ipType: intelligence.enriched?.ipType ?? null,
        licensingReadiness: intelligence.enriched?.licensingReadiness ?? null,
        dataSparse: intelligence.assetRecord?.dataSparse ?? false,
        competingAssets: (intelligence.competingAssets ?? []).map((c) => ({
          assetName: c.assetName,
          developmentStage: c.developmentStage ?? "unknown",
          institution: c.institution ?? "unknown",
          modality: c.modality ?? null,
        })),
      } : undefined;

      const res = await fetch("/api/dossier/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset: targetAsset, fullModel, context: dossierContext }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as any).error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(part.slice(6)) as { text?: string; done?: boolean; generated_at?: string; error?: string };
            if (data.error) throw new Error(data.error);
            if (data.text) {
              fullNarrative += data.text;
              setStreamState(s => ({ ...s, narrative: s.narrative + data.text! }));
            }
            if (data.done) {
              const generatedAt = data.generated_at ?? new Date().toISOString();
              setStreamState(s => ({ ...s, isStreaming: false, isComplete: true, generatedAt }));
              setDossier({ asset: targetAsset, narrative: fullNarrative, generated_at: generatedAt });
            }
          } catch {
            // skip malformed chunk
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setStreamState(s => ({ ...s, isStreaming: false, error: err.message ?? "Generation failed" }));
      toast({ title: "Brief generation failed", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  // Auto-trigger on first asset load
  useEffect(() => {
    if (asset && !streamStartedRef.current) {
      streamStartedRef.current = true;
      startStream(asset, false);
    }
  }, [asset, startStream]);

  const shareMutation = useMutation({
    mutationFn: async () => {
      if (!asset || !dossier) throw new Error("No dossier to share");
      const enriched = intelligence?.enriched;
      const payload = {
        assetName: asset.asset_name,
        target: asset.target,
        modality: asset.modality,
        developmentStage: asset.development_stage,
        institution: asset.institution,
        indication: asset.indication,
        narrative: dossier.narrative,
        score: asset.score,
        licensingStatus: enriched?.licensingStatus ?? asset.licensing_status,
        generated_at: dossier.generated_at,
      };
      const body: Record<string, unknown> = { type: "dossier", entityId: fingerprint, payload };
      if (sharePassword) body.password = sharePassword;
      const res = await apiRequest("POST", "/api/share", body);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create share link");
      }
      return res.json() as Promise<{ token: string; expiresAt: string; url: string }>;
    },
    onSuccess: (data) => {
      setShareUrl(data.url);
      setShareDialogOpen(true);
    },
    onError: (err: any) => {
      toast({ title: "Failed to create share link", description: err.message, variant: "destructive" });
    },
  });

  if (!asset && intelLoading) {
    return (
      <div className="min-h-full relative overflow-hidden" style={{ background: "linear-gradient(180deg, hsl(210 30% 96%) 0%, hsl(var(--background)) 40%)" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 space-y-4">
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
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <p className="text-muted-foreground mb-4">Asset not found. Please return to Discover and try again.</p>
          <Button variant="outline" onClick={() => setLocation("/discover")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Discover
          </Button>
        </div>
      </div>
    );
  }

  const enriched = intelligence?.enriched;
  const isSparse = !!intelligence?.assetRecord?.dataSparse;
  const stageClass = STAGE_COLORS[asset.development_stage?.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
  const licensingAvailable = (enriched?.licensingStatus ?? asset.licensing_status ?? "").toLowerCase().includes("available");

  const bd = asset.score_breakdown;
  const scoredDimsCount = bd?.scored_dimensions?.length ?? 0;
  const signalCoverage = bd?.signal_coverage ?? 0;

  // True when the asset was opened via Scout search and has a real relevance score.
  // scored_dimensions is only populated by the Scout scoring pipeline — if it's empty
  // the user navigated here from a non-Scout context (alerts, market, institution page).
  const hasScoutScore = scoredDimsCount > 0;

  // When no Scout score is available, fall back to the DB completeness score (0–100).
  const completenessScore = intelligence?.assetRecord?.completenessScore ?? null;
  const displayScore = hasScoutScore ? asset.score : (completenessScore ?? 0);
  const scoreLabel = hasScoutScore ? "Scout Match" : "Completeness";

  const strongSignal = hasScoutScore && asset.score >= 85 && (signalCoverage >= 60 || scoredDimsCount >= 4);
  const scoreVerdict = !hasScoutScore
    ? (completenessScore ?? 0) >= 80
      ? { label: "Rich Data",     color: "text-emerald-600 dark:text-emerald-400" }
      : (completenessScore ?? 0) >= 55
      ? { label: "Good Data",     color: "text-amber-600 dark:text-amber-400" }
      : { label: "Sparse Data",   color: "text-muted-foreground" }
    : strongSignal
    ? { label: "Strong Commercial Signal", color: "text-emerald-600 dark:text-emerald-400" }
    : asset.score >= 70
    ? { label: "Moderate Signal",          color: "text-amber-600 dark:text-amber-400" }
    : { label: "Emerging Signal",          color: "text-muted-foreground" };

  const allCategories = [
    ...(enriched?.categories ?? []),
    ...(asset.matching_tags ?? []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const suggestedNextStep = streamState.isComplete ? extractSuggestedNextStep(streamState.narrative) : null;
  const showSkeleton = streamState.isStreaming && streamState.narrative.length === 0;
  const showNarrative = streamState.narrative.length > 0;

  const bentoGap   = isSparse ? "hsl(33 38% 66%)"   : "hsl(142 30% 68%)";
  const scoreBg    = isSparse ? "linear-gradient(148deg, hsl(33 70% 48%) 0%, hsl(33 62% 38%) 100%)" : "linear-gradient(148deg, hsl(142 60% 38%) 0%, hsl(142 54% 30%) 100%)";
  const docRule    = isSparse ? "hsl(33 62% 46%)"    : "hsl(142 52% 36%)";
  const docBorder  = isSparse ? "hsl(33 14% 78%)"    : "hsl(142 18% 78%)";
  const numColor   = isSparse ? "hsl(33 62% 44% / 0.22)" : "hsl(142 52% 36% / 0.18)";

  const tier2Sections = [
    { id: "innovation", title: "Innovation Claim",        available: !!(enriched?.innovationClaim && enriched.innovationClaim.length > 30), statusText: "1 field available" },
    { id: "unmet",      title: "Unmet Need",              available: !!(enriched?.unmetNeed && enriched.unmetNeed.length > 30),            statusText: "1 field available" },
    { id: "abstract",   title: "Abstract / Summary",      available: !!(enriched?.abstract || (!isTrivialSummary(asset.summary, asset.asset_name) && asset.summary)), statusText: "1 field available" },
    { id: "comparable", title: "Comparable Drugs",        available: !!enriched?.comparableDrugs,                                         statusText: "1 field available" },
    { id: "signals",    title: "Signal Activity",         available: signalEvents.length > 0,                                            statusText: `${signalEvents.length} events` },
    { id: "competing",  title: "Competing Assets",        available: (intelligence?.competingAssets?.length ?? 0) > 0,                   statusText: `${intelligence?.competingAssets?.length ?? 0} found` },
    { id: "literature", title: "Supporting Literature",   available: (intelligence?.literature?.length ?? 0) > 0,                       statusText: `${intelligence?.literature?.length ?? 0} results` },
    { id: "trials",     title: "Clinical Trials",         available: (intelligence?.clinicalTrials?.length ?? 0) > 0,                   statusText: `${intelligence?.clinicalTrials?.length ?? 0} found` },
    { id: "orphan",     title: "FDA Orphan Drug",         available: orphanDesignations.length > 0,                                     statusText: `${orphanDesignations.length} matched` },
    { id: "evidence",   title: "Evidence Signals",        available: (asset.signals?.length ?? 0) > 0,                                  statusText: `${asset.signals?.length ?? 0} total` },
  ]
    .filter(s => s.available)
    .map((s, i) => ({ ...s, num: String(i + (hasScoutScore ? 3 : 2)).padStart(2, "0") }));

  const secStyle = {
    display: "grid", gridTemplateColumns: "56px 1fr",
    gap: "0 20px", padding: "26px 24px 26px 22px",
    borderBottom: "1px solid hsl(220 14% 91%)",
  };
  const secNum = (n: string, extra?: React.CSSProperties) => (
    <div style={{ fontSize: "44px", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1, color: numColor, userSelect: "none" as const, paddingTop: "1px", fontVariantNumeric: "tabular-nums", ...extra }}>{n}</div>
  );
  const secTitle = (t: string) => (
    <h2 style={{ fontSize: "15px", fontWeight: 700, color: "hsl(222 22% 10%)", letterSpacing: "-0.018em", lineHeight: 1.2 }}>{t}</h2>
  );

  return (
    <>
    <div className="min-h-full relative overflow-hidden" data-testid="print-target" style={{ background: "linear-gradient(180deg, hsl(210 30% 96%) 0%, hsl(var(--background)) 40%)" }}>
      <style>{`
        @keyframes dash-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; animation-delay: 0ms !important; }
        }
      `}</style>

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-2.5">

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

        {/* ══════════════════════════════
            BENTO HEADER
        ══════════════════════════════ */}
        <div
          className="rounded-t-2xl overflow-hidden"
          style={{
            display: "grid",
            gridTemplateColumns: "172px 1fr",
            gridTemplateRows: "1fr auto",
            gap: "1px",
            background: bentoGap,
            border: `1px solid ${bentoGap}`,
            boxShadow: "0 1px 2px hsl(220 20% 20% / 0.04), 0 4px 12px hsl(220 20% 20% / 0.06)",
            animation: "dash-fade-up 380ms ease 40ms both",
          }}
        >
          {/* ── Score tile ── */}
          <div style={{
            gridColumn: 1, gridRow: "1 / 3",
            background: scoreBg,
            padding: "24px 20px 22px",
            display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{
              position: "absolute", top: "-20px", left: "-30px",
              width: "220px", height: "200px",
              background: isSparse
                ? "radial-gradient(ellipse at 35% 25%, hsl(33 85% 72% / 0.14) 0%, transparent 60%)"
                : "radial-gradient(ellipse at 35% 25%, hsl(142 75% 72% / 0.14) 0%, transparent 60%)",
              pointerEvents: "none",
            }} />
            <p style={{ fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: "8px", position: "relative", color: isSparse ? "hsl(33 32% 85%)" : "hsl(142 36% 85%)" }}>
              {scoreLabel}
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: "2px", lineHeight: 1, marginBottom: "8px", position: "relative" }}>
              <span style={{ fontSize: "52px", fontWeight: 900, letterSpacing: "-0.045em", fontVariantNumeric: "tabular-nums", color: "hsl(0 0% 98%)" }}>
                <CountUp value={displayScore / 10} duration={prefersReducedMotion ? 0 : 620} />
              </span>
              <span style={{ fontSize: "16px", fontWeight: 600, paddingBottom: "4px", color: isSparse ? "hsl(33 36% 82%)" : "hsl(142 38% 80%)" }}>/ 10</span>
            </div>
            {/* Verdict chip */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              borderRadius: "6px", padding: "4px 9px", fontSize: "10px", fontWeight: 700,
              width: "fit-content", position: "relative", marginBottom: "18px",
              background: "hsl(0 0% 100% / 0.16)",
              border: "1px solid hsl(0 0% 100% / 0.28)",
              color: "hsl(0 0% 97%)",
            }}>
              {!hasScoutScore
                ? <><Activity className="w-2.5 h-2.5" /> {scoreVerdict.label}</>
                : strongSignal
                ? <><Check className="w-2.5 h-2.5" /> Strong Signal</>
                : asset.score >= 70
                ? <><Activity className="w-2.5 h-2.5" /> Moderate Signal</>
                : <><AlertTriangle className="w-2.5 h-2.5" /> Emerging Signal</>}
            </div>
            {/* Dimension bars */}
            {scoredDimsCount > 0 && (
              <div style={{ position: "relative", paddingTop: "14px", borderTop: `1px solid ${isSparse ? "hsl(33 54% 34%)" : "hsl(142 50% 26%)"}`, width: "100%" }}>
                <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.13em", marginBottom: "7px", color: isSparse ? "hsl(33 32% 84%)" : "hsl(142 34% 84%)" }}>Dimensions</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {(bd?.scored_dimensions ?? []).slice(0, 3).map(dim => {
                    const raw = (bd as any)?.[dim] ?? 0;
                    const pct = Math.round(raw * 10);
                    const label = dim.charAt(0).toUpperCase() + dim.slice(1);
                    return (
                      <div key={dim} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "10px", fontWeight: 500, color: isSparse ? "hsl(33 26% 84%)" : "hsl(142 28% 84%)" }}>{label}</span>
                          <span style={{ fontSize: "10px", fontWeight: 700, fontFamily: "monospace", color: "hsl(0 0% 97%)" }}>{pct}</span>
                        </div>
                        <div style={{ height: "2px", borderRadius: "1px", overflow: "hidden", background: isSparse ? "hsl(33 54% 34%)" : "hsl(142 50% 24%)" }}>
                          <div style={{ height: "100%", width: `${pct}%`, borderRadius: "1px", background: "rgba(255,255,255,0.84)" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: "9.5px", fontWeight: 500, marginTop: "6px", color: isSparse ? "hsl(33 30% 82%)" : "hsl(142 32% 82%)" }}>
                  {scoredDimsCount} of 6 dimensions scored
                </p>
              </div>
            )}
            {isSparse && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 9px", borderRadius: "6px", border: "1px solid hsl(0 0% 100% / 0.22)", background: "hsl(0 0% 100% / 0.12)", marginTop: "8px", width: "100%" }}>
                <AlertTriangle className="w-3 h-3 shrink-0" style={{ color: "hsl(0 0% 92%)" }} />
                <span style={{ fontSize: "10px", fontWeight: 600, color: "hsl(0 0% 93%)", lineHeight: 1.35 }}>Low confidence — limited data</span>
              </div>
            )}
          </div>

          {/* ── Identity tile ── */}
          <div style={{
            gridColumn: 2, gridRow: 1,
            background: isSparse ? "hsl(38 18% 99%)" : "hsl(0 0% 99.8%)",
            padding: "20px 22px 18px",
            display: "flex", flexDirection: "column",
          }}>
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              {asset.development_stage && asset.development_stage !== "unknown" && (
                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border capitalize ${stageClass}`}>{asset.development_stage}</span>
              )}
              {licensingAvailable && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border" style={{ background: "hsl(142 52% 36% / 0.10)", color: "hsl(142 42% 28%)", borderColor: "hsl(142 42% 40% / 0.28)" }}>
                  <Key className="w-2.5 h-2.5" />Available for Licensing
                </span>
              )}
              {asset.momentum_score != null && asset.momentum_score >= 40 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border" style={{ background: "hsl(142 52% 36% / 0.06)", color: "hsl(142 38% 34%)", borderColor: "hsl(142 38% 44% / 0.20)" }}>
                  <TrendingUp className="w-2.5 h-2.5" />Rising · {asset.momentum_score}
                </span>
              )}
              {marketListing && (
                <a href={`/market/listing/${marketListing.id}`} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border transition-colors" style={{ background: "hsl(246 55% 54% / 0.07)", color: "hsl(246 38% 44%)", borderColor: "hsl(246 38% 54% / 0.22)" }} data-testid="dossier-edenmarket-badge">
                  <ShoppingBag className="w-2.5 h-2.5" />EdenMarket
                </a>
              )}
              {isSparse && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border cursor-default" style={{ background: "hsl(33 85% 44% / 0.09)", color: "hsl(33 55% 32%)", borderColor: "hsl(33 55% 44% / 0.28)" }} data-testid="dossier-limited-data-badge">
                        <Eye className="w-2.5 h-2.5" />Limited data available
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs max-w-[240px]">
                      This asset has limited public information. EdenRadar will update it automatically as new data appears.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <h1 className="font-extrabold leading-tight mb-1" style={{ fontSize: "20px", color: isSparse ? "hsl(222 14% 28%)" : "hsl(222 22% 9%)", letterSpacing: "-0.025em" }} data-testid="dossier-asset-name">
              {asset.asset_name !== "unknown" ? asset.asset_name : "Unnamed Asset"}
            </h1>
            {asset.indication && asset.indication !== "unknown" && (
              <p className="mb-3" style={{ fontSize: "13px", color: "hsl(220 10% 46%)" }}>{asset.indication}</p>
            )}
            {allCategories.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {allCategories.slice(0, 6).map(cat => (
                  <span key={cat} className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border"
                    style={{ background: isSparse ? "hsl(220 10% 52% / 0.07)" : "hsl(142 52% 36% / 0.065)", borderColor: isSparse ? "hsl(220 10% 52% / 0.18)" : "hsl(142 40% 40% / 0.18)", color: isSparse ? "hsl(220 10% 44%)" : "hsl(142 36% 28%)" }}>
                    <Tag className="w-2.5 h-2.5" />{cat}
                  </span>
                ))}
              </div>
            )}
            {/* 4-cell meta grid pinned to bottom */}
            <div style={{ marginTop: "auto", paddingTop: "13px", borderTop: "1px solid hsl(220 14% 91%)", display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
              {([
                { label: "Licensing",   primary: enriched?.licensingStatus ?? (isSparse ? "Status unknown" : asset.licensing_status ?? "—"), secondary: enriched?.licensingReadiness ?? (licensingAvailable ? "Active TTO program" : "No TTO data"), accent: licensingAvailable, italic: !enriched?.licensingStatus && isSparse },
                { label: "Modality",    primary: asset.modality !== "unknown" ? asset.modality : "—", secondary: enriched?.mechanismOfAction ?? "" },
                { label: "Last Signal", primary: asset.latest_signal_date ? formatRelativeDate(asset.latest_signal_date) : "—", secondary: asset.latest_signal_date ? new Date(asset.latest_signal_date).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "" },
                { label: "Evidence",    primary: asset.evidence_count > 0 ? `${asset.evidence_count} signals` : "—", secondary: "", momentum: !!(asset.momentum_score != null && asset.momentum_score >= 40) },
              ] as const).map((cell, ci) => (
                <div key={cell.label} style={{ display: "flex", flexDirection: "column", gap: "3px", paddingRight: ci < 3 ? "12px" : 0, borderRight: ci < 3 ? "1px solid hsl(220 14% 91%)" : "none", marginRight: ci < 3 ? "12px" : 0 }}>
                  <span style={{ fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "hsl(220 10% 57%)" }}>{cell.label}</span>
                  <span style={{ fontSize: "12px", fontWeight: 700, lineHeight: 1.2, color: (cell as any).accent ? "hsl(142 44% 27%)" : (cell as any).italic ? "hsl(220 10% 60%)" : "hsl(222 20% 11%)", fontStyle: (cell as any).italic ? "italic" : "normal" }}>{cell.primary}</span>
                  {(cell as any).momentum
                    ? <span style={{ fontSize: "10px", fontWeight: 600, color: "hsl(142 42% 34%)", display: "inline-flex", alignItems: "center", gap: "3px" }}><TrendingUp className="w-2.5 h-2.5" />Momentum rising</span>
                    : cell.secondary ? <span style={{ fontSize: "10px", color: "hsl(220 10% 56%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cell.secondary}</span>
                    : null}
                </div>
              ))}
            </div>
          </div>

          {/* ── Strip ── */}
          <div style={{
            gridColumn: 2, gridRow: 2,
            padding: "9px 20px",
            display: "flex", alignItems: "center", gap: "6px",
            background: isSparse ? "hsl(38 14% 97%)" : "hsl(210 16% 97.5%)",
          }}>
            {asset.source_types?.map(st => <SourceBadge key={st} sourceType={st} />)}
            {(asset.source_types?.length ?? 0) >= 2 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border" style={{ background: "hsl(142 50% 36% / 0.07)", color: "hsl(142 36% 27%)", borderColor: "hsl(142 38% 40% / 0.20)" }}>
                <Activity className="w-2.5 h-2.5" />Corroborated
              </span>
            )}
            <div style={{ width: "1px", height: "16px", background: "hsl(220 13% 88%)", margin: "0 4px", flexShrink: 0 }} />
            <div className="ml-auto flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleExportPdf} disabled={pdfLoading || !asset} data-testid="button-export-dossier">
                {pdfLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                {pdfLoading ? "Generating…" : "Export PDF"}
              </Button>
              {dossier && (
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => { setShareUrl(null); setSharePassword(""); setSharePasswordVisible(false); setShareDialogOpen(true); }} disabled={shareMutation.isPending} data-testid="button-share-dossier">
                  <Share2 className="w-3 h-3" />{shareMutation.isPending ? "Creating..." : "Share"}
                </Button>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={() => asset && startStream(asset, true)} disabled={streamState.isStreaming} data-testid="button-regenerate-dossier">
                      {streamState.isStreaming ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      {streamState.isStreaming ? "Generating…" : "Regenerate"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Re-runs with GPT-4o for deeper analysis</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>

        {/* ── Why it matters — emerald band ── */}
        {asset.why_it_matters && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: "12px",
            padding: "15px 20px",
            background: isSparse
              ? "linear-gradient(148deg, hsl(33 70% 48%) 0%, hsl(33 62% 38%) 100%)"
              : "linear-gradient(148deg, hsl(142 60% 38%) 0%, hsl(142 54% 30%) 100%)",
            borderRadius: "10px",
            position: "relative", overflow: "hidden",
            animation: "dash-fade-up 400ms ease 120ms both",
          }}>
            <div style={{ position: "absolute", top: "-10px", left: "-20px", width: "180px", height: "160px", background: isSparse ? "radial-gradient(ellipse at 35% 30%, hsl(33 85% 72% / 0.12) 0%, transparent 60%)" : "radial-gradient(ellipse at 35% 30%, hsl(142 75% 72% / 0.12) 0%, transparent 60%)", pointerEvents: "none" }} />
            <div style={{ width: "28px", height: "28px", flexShrink: 0, background: "hsl(0 0% 100% / 0.12)", border: "1px solid hsl(0 0% 100% / 0.20)", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              <Sparkles className="w-3.5 h-3.5" style={{ color: "hsl(0 0% 97%)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", position: "relative" }}>
              <span style={{ fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: isSparse ? "hsl(33 32% 85%)" : "hsl(142 36% 84%)" }}>Why it matters</span>
              <p style={{ fontSize: "13px", fontWeight: 600, color: "hsl(0 0% 97%)", lineHeight: 1.55 }}>"{asset.why_it_matters}"</p>
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            DOC BODY
        ══════════════════════════════ */}
        <div style={{
          background: "hsl(210 22% 97.5%)",
          border: `1px solid ${docBorder}`,
          borderTop: `3px solid ${docRule}`,
          borderRadius: "0 0 16px 16px",
          overflow: "hidden",
          boxShadow: "0 4px 16px hsl(220 20% 20% / 0.07)",
          animation: "dash-fade-up 400ms ease 160ms both",
        }}>

          {/* 01 — Intelligence Brief */}
          <div style={secStyle}>
            {secNum("01")}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" }}>
                {secTitle("Intelligence Brief")}
                {streamState.isStreaming && (
                  <span style={{ fontSize: "10px", color: "hsl(220 10% 56%)", display: "inline-flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap", flexShrink: 0 }}>
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />Generating…
                  </span>
                )}
                {streamState.isComplete && streamState.generatedAt && (
                  <span style={{ fontSize: "10px", color: "hsl(220 10% 56%)", whiteSpace: "nowrap", flexShrink: 0, animation: "dash-fade-up 300ms ease both" }}>
                    Generated {new Date(streamState.generatedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
              {isSparse && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "9px 12px", borderRadius: "7px", background: "hsl(33 72% 44% / 0.06)", border: "1px solid hsl(33 60% 44% / 0.16)" }}>
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" style={{ color: "hsl(33 55% 44%)" }} />
                  <span style={{ fontSize: "11px", fontWeight: 500, color: "hsl(33 30% 38%)", lineHeight: 1.5 }}>Generated from limited data — conclusions should be treated as preliminary until additional data is indexed.</span>
                </div>
              )}
              {showSkeleton && <NarrativeSkeleton />}
              {showNarrative && (
                <div style={{ animation: "dash-fade-up 320ms ease both" }}>
                  <NarrativeSection narrative={streamState.narrative} isStreaming={streamState.isStreaming} />
                </div>
              )}
              {streamState.error && (
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                  <p className="text-xs text-rose-700 dark:text-rose-400">{streamState.error}</p>
                </div>
              )}
              {suggestedNextStep && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 14px", background: "hsl(142 52% 36% / 0.06)", border: "1px solid hsl(142 42% 40% / 0.16)", borderRadius: "8px", animation: "dash-fade-up 340ms ease both" }} data-testid="suggested-next-step-panel">
                  <div style={{ width: "26px", height: "26px", flexShrink: 0, background: "hsl(142 52% 36% / 0.10)", border: "1px solid hsl(142 42% 40% / 0.20)", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ArrowRight className="w-3 h-3" style={{ color: "hsl(142 44% 34%)" }} />
                  </div>
                  <div>
                    <p style={{ fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.13em", color: "hsl(142 38% 38%)", marginBottom: "3px" }}>Suggested Next Step</p>
                    <p style={{ fontSize: "13px", color: "hsl(222 18% 24%)", lineHeight: 1.58 }}>{suggestedNextStep}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 02 — Signal Profile (only shown when asset was opened via Scout search) */}
          {hasScoutScore && asset.score_breakdown && (
            <div style={secStyle} data-testid="score-breakdown-panel">
              {secNum("02")}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  {secTitle("Signal Profile")}
                  <span style={{ fontSize: "10px", fontWeight: 600, color: isSparse ? "hsl(33 55% 42%)" : "hsl(220 10% 56%)", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
                    {scoredDimsCount} of 6 dimensions scored
                  </span>
                </div>
                <ScoreBreakdownCard breakdown={asset.score_breakdown} />
              </div>
            </div>
          )}

          {intelError && (
            <div style={{ padding: "12px 24px 0" }}>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3" data-testid="intelligence-error">
                <p className="text-xs text-amber-700 dark:text-amber-400">Competitive landscape data is unavailable for this asset.</p>
              </div>
            </div>
          )}

          {/* Tier 2 supplementary sections */}
          {isSparse ? (
            <div style={{ ...secStyle, borderBottom: "none" }}>
              {secNum("03", { opacity: 0.5 })}
              <div>
                <h2 style={{ fontSize: "15px", fontWeight: 700, color: "hsl(220 10% 52%)", letterSpacing: "-0.018em", marginBottom: "16px" }}>Supplementary Enrichment</h2>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "10px", padding: "28px 40px" }}>
                  <div style={{ width: "38px", height: "38px", background: "hsl(33 72% 44% / 0.09)", border: "1px solid hsl(33 60% 44% / 0.18)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Beaker className="w-4 h-4" style={{ color: "hsl(33 55% 44%)" }} />
                  </div>
                  <p style={{ fontSize: "14px", fontWeight: 700, color: "hsl(222 18% 22%)" }}>No enrichment data available for this asset</p>
                  <p style={{ fontSize: "12.5px", color: "hsl(220 10% 52%)", lineHeight: 1.65, maxWidth: "480px" }}>
                    EdenRadar monitors <strong>358 TTOs</strong> continuously and will enrich this record automatically when new data appears — typically within days of a publication, filing, or portal update.
                  </p>
                </div>
              </div>
            </div>
          ) : tier2Sections.length > 0 ? (
            <>
              <div style={{ padding: "11px 24px 9px 22px", borderBottom: "1px solid hsl(220 14% 91%)", display: "flex", alignItems: "center", animation: "dash-fade-up 260ms ease both" }}>
                <span style={{ fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "hsl(220 10% 58%)" }}>
                  Supplementary enrichment · {tier2Sections.length} section{tier2Sections.length !== 1 ? "s" : ""}
                </span>
              </div>
              {tier2Sections.map((s, idx) => (
                <Tier2Row key={s.id} num={s.num} title={s.title} statusText={s.statusText} isExpanded={expandedSections.has(s.id)} onToggle={() => toggleSection(s.id)} isSparse={isSparse} staggerIndex={idx}>
                  {s.id === "innovation" && enriched?.innovationClaim && (
                    <p className="text-sm text-foreground/80 leading-relaxed">{enriched.innovationClaim}</p>
                  )}
                  {s.id === "unmet" && enriched?.unmetNeed && (
                    <p className="text-sm text-foreground/80 leading-relaxed">{enriched.unmetNeed}</p>
                  )}
                  {s.id === "abstract" && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {(enriched?.abstract ?? asset.summary).replace(/^summary:\s*/i, "")}
                    </p>
                  )}
                  {s.id === "comparable" && enriched?.comparableDrugs && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{enriched.comparableDrugs}</p>
                  )}
                  {s.id === "signals" && (
                    <div className="space-y-3" data-testid="signal-activity-panel">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 pb-3 border-b border-border/60">
                        {TIMELINE_LEGEND.map(({ color, label }) => (
                          <span key={label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <div className={`w-2 h-2 rounded-full ${color}`} />{label}
                          </span>
                        ))}
                      </div>
                      <div className="relative pl-4 space-y-3">
                        <div className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
                        {signalEvents.slice(0, 6).map((event, i) => {
                          const dateStr = new Date(event.occurred_at).toLocaleDateString("en-US", { month: "short", year: "numeric" });
                          let label = "", sublabel = "", dotColor = "bg-zinc-400";
                          if (event.event_type === "stage_change") { const to = event.payload?.to as string; label = to ? `Stage advanced → ${to}` : "Stage advanced"; sublabel = event.payload?.from ? `from ${event.payload.from}` : ""; dotColor = "bg-emerald-500"; }
                          else if (event.event_type === "first_indexed") { label = "Asset first indexed"; sublabel = "Added to EdenRadar"; dotColor = "bg-sky-500"; }
                          else if (event.event_type === "content_update") { label = "Content updated"; sublabel = "Portal listing refreshed"; dotColor = "bg-amber-500"; }
                          else if (event.event_type === "citation_update") { const count = event.payload?.count as number; label = count ? `${count} citations recorded` : "Citation count updated"; dotColor = "bg-violet-500"; }
                          else { label = event.event_type.replace(/_/g, " "); }
                          return (
                            <div key={event.id ?? i} className="flex items-start gap-3">
                              <div className={`relative z-10 w-2 h-2 rounded-full mt-1.5 shrink-0 -ml-[3px] ${dotColor}`} />
                              <div className="flex-1 min-w-0"><p className="text-xs font-medium text-foreground">{label}</p>{sublabel && <p className="text-[10px] text-muted-foreground">{sublabel}</p>}</div>
                              <span className="text-[10px] text-muted-foreground shrink-0">{dateStr}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {s.id === "competing" && (
                    <div className="space-y-2" data-testid="competing-assets-panel">
                      {intelligence!.competingAssets.map(comp => {
                        const cs = STAGE_COLORS[comp.developmentStage?.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
                        return (
                          <div key={comp.fingerprint} className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/60 hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer"
                            onClick={() => { sessionStorage.setItem(`asset-${comp.fingerprint}`, JSON.stringify({ id: comp.fingerprint, asset_name: comp.assetName, target: comp.target, modality: comp.modality, indication: comp.indication, development_stage: comp.developmentStage, owner_name: comp.institution, owner_type: "university", institution: comp.institution, patent_status: "unknown", licensing_status: "unknown", summary: "", why_it_matters: "", evidence_count: 0, source_types: ["tech_transfer"], source_urls: [], latest_signal_date: "", score: 0, score_breakdown: { novelty: 0, freshness: 0, readiness: 0, licensability: 0, fit: 0, competition: 0, total: 0, signal_coverage: 0, scored_dimensions: [], dimension_basis: {} }, matching_tags: [], confidence: "low", signals: [] })); sessionStorage.setItem(`asset-fingerprint-${comp.fingerprint}`, comp.fingerprint); setLocation(`/asset/${comp.fingerprint}`); }}
                            data-testid={`competing-asset-${comp.fingerprint}`}>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-foreground truncate">{comp.assetName}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">{[comp.target, comp.modality].filter(v => v && v !== "unknown").map((v, i, a) => <span key={v} className="text-[10px] text-muted-foreground">{v}{i < a.length - 1 ? " ·" : ""}</span>)}</div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-[10px] px-2 py-0.5 rounded-md border font-semibold capitalize ${cs}`}>{comp.developmentStage}</span>
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Building2 className="w-3 h-3" /><span className="truncate max-w-[100px]">{comp.institution}</span></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {s.id === "literature" && (
                    <div className="space-y-2" data-testid="supporting-literature-panel">
                      {intelligence!.literature.map((lit, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-border/60 hover:border-primary/30 hover:bg-primary/5 transition-all">
                          <span className={`text-[10px] shrink-0 mt-0.5 px-2 py-0.5 rounded border font-semibold ${SOURCE_BADGE_COLORS[lit.source_type] ?? "bg-muted text-muted-foreground"}`}>{lit.source_type === "paper" ? "PubMed" : lit.source_type === "preprint" ? "bioRxiv" : lit.source_type}</span>
                          <div className="flex-1 min-w-0"><p className="text-xs font-medium text-foreground line-clamp-2">{lit.title}</p>{lit.date && <p className="text-[10px] text-muted-foreground mt-0.5">{lit.date}</p>}</div>
                          {lit.url && <a href={lit.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-primary hover:text-primary/80 transition-colors" data-testid={`literature-link-${i}`}><ExternalLink className="w-3.5 h-3.5" /></a>}
                        </div>
                      ))}
                    </div>
                  )}
                  {s.id === "trials" && (
                    <div className="space-y-2" data-testid="clinical-trials-panel">
                      {intelligence!.clinicalTrials.map(trial => (
                        <div key={trial.nctId} className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-border/60 hover:border-primary/30 hover:bg-primary/5 transition-all">
                          <span className="text-xs shrink-0 mt-0.5 px-2 py-0.5 rounded border font-semibold bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20">{trial.phase || "Trial"}</span>
                          <div className="flex-1 min-w-0"><p className="text-xs font-medium text-foreground line-clamp-2">{trial.title}</p><div className="flex items-center gap-2 mt-0.5"><p className="text-xs text-muted-foreground font-mono">{trial.nctId}</p>{trial.status && <span className="text-xs text-muted-foreground">· {trial.status}</span>}</div></div>
                          <a href={trial.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-primary hover:text-primary/80 transition-colors" data-testid={`trial-link-${trial.nctId}`}><ExternalLink className="w-3.5 h-3.5" /></a>
                        </div>
                      ))}
                    </div>
                  )}
                  {s.id === "orphan" && (
                    <div className="space-y-2" data-testid="orphan-designations-panel">
                      {orphanDesignations.map(d => (
                        <div key={d.id} className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-border/60 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all">
                          <span className="text-xs shrink-0 mt-0.5 px-2 py-0.5 rounded border font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">Orphan</span>
                          <div className="flex-1 min-w-0"><p className="text-xs font-medium text-foreground line-clamp-1">{d.genericName || d.brandName || d.applicationNumber || "—"}</p><p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{d.indication}</p>{d.sponsorName && <p className="text-xs text-muted-foreground mt-0.5">{d.sponsorName}</p>}</div>
                          <div className="flex flex-col items-end gap-1 shrink-0">{d.sourceUrl && <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors" data-testid={`orphan-link-${d.id}`}><ExternalLink className="w-3.5 h-3.5" /></a>}<span className="text-[10px] text-muted-foreground">{d.similarity}% match</span></div>
                        </div>
                      ))}
                    </div>
                  )}
                  {s.id === "evidence" && asset.signals?.length > 0 && (
                    <div className="space-y-2">
                      {asset.signals.map(signal => (
                        <div key={signal.id} className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-border/60">
                          <SourceBadge sourceType={signal.source_type} />
                          <div className="flex-1 min-w-0"><p className="text-xs font-medium text-foreground line-clamp-2">{signal.title}</p>{signal.date && <p className="text-[10px] text-muted-foreground mt-0.5">{signal.date}</p>}</div>
                          {signal.url && <a href={signal.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-primary hover:text-primary/80 transition-colors"><ExternalLink className="w-3.5 h-3.5" /></a>}
                        </div>
                      ))}
                    </div>
                  )}
                </Tier2Row>
              ))}
            </>
          ) : null}
        </div>

      </div>
    </div>

    <Dialog open={shareDialogOpen} onOpenChange={(open) => { if (!open) { setShareDialogOpen(false); setShareCopied(false); setShareUrl(null); setSharePassword(""); setSharePasswordVisible(false); } }}>
      <DialogContent className="max-w-sm" data-testid="dialog-share-dossier">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Share2 className="w-4 h-4 text-primary" />
            Share Dossier
          </DialogTitle>
        </DialogHeader>
        {!shareUrl ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Create a public read-only link. Expires in 7&nbsp;days.
            </p>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Password protection <span className="opacity-60">(optional)</span></p>
              <div className="flex gap-2">
                <Input
                  type={sharePasswordVisible ? "text" : "password"}
                  placeholder="Leave blank for public access"
                  value={sharePassword}
                  onChange={(e) => setSharePassword(e.target.value)}
                  className="text-sm"
                  data-testid="input-share-password"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 px-2"
                  onClick={() => setSharePasswordVisible(v => !v)}
                  data-testid="button-toggle-password-visibility"
                >
                  {sharePasswordVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
            <Button
              className="w-full gap-2"
              size="sm"
              onClick={() => shareMutation.mutate()}
              disabled={shareMutation.isPending}
              data-testid="button-create-share-link"
            >
              {shareMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
              {shareMutation.isPending ? "Creating..." : "Create Share Link"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Link created — expires in 7&nbsp;days.{sharePassword && (
                <span className="inline-flex items-center gap-1 ml-1.5 text-amber-500"><Lock className="w-3 h-3" />Password protected.</span>
              )}
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="text-xs font-mono"
                onClick={(e) => (e.target as HTMLInputElement).select()}
                data-testid="input-share-url"
              />
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl).then(() => {
                    setShareCopied(true);
                    setTimeout(() => setShareCopied(false), 2000);
                  });
                }}
                data-testid="button-copy-share-url"
              >
                {shareCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {shareCopied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
