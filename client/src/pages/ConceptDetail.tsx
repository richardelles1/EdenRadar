import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import type { ConceptCard } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/lib/supabase";
import {
  Lightbulb,
  Sparkles,
  TrendingUp,
  Clock,
  ArrowLeft,
  Loader2,
  Target,
  Beaker,
  AlertTriangle,
  Moon,
  Sun,
  ArrowRight,
  Users,
  DollarSign,
  GraduationCap,
  ExternalLink,
  Building2,
  FlaskConical,
  BookOpen,
} from "lucide-react";

function ScoreRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="currentColor" className="text-border" strokeWidth="5" />
        <circle
          cx="40" cy="40" r={radius} fill="none" stroke={color} strokeWidth="5"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-foreground">{score}</span>
        <span className="text-[10px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function DiscoveryDetailNav() {
  const { session, role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isConceptUser = session && role === "concept";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <Link href="/discovery">
          <div className="flex items-center gap-2.5 cursor-pointer select-none" data-testid="discovery-detail-nav-logo">
            <div className="relative w-7 h-7 rounded-md bg-amber-500 flex items-center justify-center">
              <Lightbulb className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-foreground text-base tracking-tight">
              Eden<span className="text-amber-500">Discovery</span>
            </span>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={toggleTheme} data-testid="detail-toggle-theme">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          {!isConceptUser && (
            <Link href="/discovery/join">
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5" data-testid="link-join-from-detail">
                Join Eden Discovery
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

const INTEREST_TYPES = [
  { id: "collaborating", label: "Collaborate", icon: Users, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10 border-violet-500/30 hover:border-violet-500/60" },
  { id: "funding", label: "Fund", icon: DollarSign, color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10 border-green-500/30 hover:border-green-500/60" },
  { id: "advising", label: "Advise", icon: GraduationCap, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10 border-amber-500/30 hover:border-amber-500/60" },
] as const;

export default function ConceptDetail() {
  const { session, role } = useAuth();
  const hasSidebar = session && role === "concept";
  const [, params] = useRoute("/discovery/concept/:id");
  const id = params?.id;
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ concept: ConceptCard }>({
    queryKey: ["/api/discovery/concepts", id],
    queryFn: async () => {
      const res = await fetch(`/api/discovery/concepts/${id}`);
      if (!res.ok) throw new Error("Failed to fetch concept");
      return res.json();
    },
    enabled: !!id,
  });

  type LandscapeAsset = {
    id: number; assetName: string; institution: string;
    modality: string; developmentStage: string; target: string; sourceUrl: string | null;
  };
  type PubmedPaper = {
    pmid: string; title: string; authors: string; journal: string; year: string; url: string; source?: "pubmed" | "biorxiv";
  };

  const { data: landscapeData } = useQuery<{ assets: LandscapeAsset[]; literature: PubmedPaper[] }>({
    queryKey: ["/api/discovery/concepts", id, "landscape"],
    queryFn: async () => {
      const res = await fetch(`/api/discovery/concepts/${id}/landscape`);
      if (!res.ok) return { assets: [], literature: [] };
      return res.json();
    },
    enabled: !!id,
    staleTime: Infinity,
  });

  const interestMutation = useMutation({
    mutationFn: async (type: string) => {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`/api/discovery/concepts/${id}/interest`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || "Failed");
      }
      return res.json();
    },
    onSuccess: (_, type) => {
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/concepts", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/concepts"] });
      const label = INTEREST_TYPES.find((t) => t.id === type)?.label ?? "Interest";
      toast({ title: `${label} interest registered!` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {!hasSidebar && <DiscoveryDetailNav />}
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
        </div>
      </div>
    );
  }

  const c = data?.concept;
  if (!c) {
    return (
      <div className="min-h-screen bg-background">
        {!hasSidebar && <DiscoveryDetailNav />}
        <div className="p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">Concept not found.</p>
        </div>
      </div>
    );
  }

  const totalInterest = (c.interestCollaborating ?? 0) + (c.interestFunding ?? 0) + (c.interestAdvising ?? 0);

  return (
    <div className="min-h-screen bg-background">
      {!hasSidebar && <DiscoveryDetailNav />}

      <div className="p-6 md:p-8 max-w-3xl mx-auto">
        <Link href="/discovery">
          <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer mb-6 transition-colors" data-testid="link-back-feed">
            <ArrowLeft className="w-4 h-4" />
            Back to feed
          </div>
        </Link>

        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <div className="w-11 h-11 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 mt-1">
            <Lightbulb className="w-6 h-6 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-concept-title">
              {c.title}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{c.oneLiner}</p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                {c.therapeuticArea}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {c.modality}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {({ 1: "Stage 1", 2: "Stage 2", 3: "Stage 3", 4: "Stage 4" } as Record<number, string>)[c.stage] ?? `Stage ${c.stage}`}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
                <Clock className="w-3 h-3" />
                {new Date(c.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {/* AI Score + core content */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
          {c.credibilityScore !== null && (
            <div className="md:col-span-1 border border-border rounded-xl bg-card p-5 flex flex-col items-center">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                AI Credibility
              </div>
              <ScoreRing score={c.credibilityScore} />
              {c.credibilityRationale && (
                <p className="text-xs text-muted-foreground text-center mt-3 italic">
                  {c.credibilityRationale}
                </p>
              )}
            </div>
          )}

          <div className={`${c.credibilityScore !== null ? "md:col-span-2" : "md:col-span-3"} space-y-4`}>
            {c.hypothesis && (
              <div className="border border-border rounded-xl bg-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <FlaskConical className="w-4 h-4 text-amber-500" />
                  <h3 className="font-semibold text-sm text-foreground">Hypothesis</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-hypothesis">
                  {c.hypothesis}
                </p>
              </div>
            )}
            <div className="border border-border rounded-xl bg-card p-5">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-amber-500" />
                <h3 className="font-semibold text-sm text-foreground">Problem Statement</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-problem-statement">
                {c.problem}
              </p>
            </div>

            <div className="border border-border rounded-xl bg-card p-5">
              <div className="flex items-center gap-2 mb-2">
                <Beaker className="w-4 h-4 text-amber-500" />
                <h3 className="font-semibold text-sm text-foreground">Proposed Approach</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-proposed-approach">
                {c.proposedApproach}
              </p>
            </div>
          </div>
        </div>

        {/* Seeking & Expertise */}
        {(c.seeking?.length || c.requiredExpertise) && (
          <div className="border border-border rounded-xl bg-card p-5 mb-5">
            <h3 className="font-semibold text-sm text-foreground mb-3">Collaboration Profile</h3>
            {c.seeking && c.seeking.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {c.seeking.map((s) => (
                  <span key={s} className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium capitalize">
                    {s}
                  </span>
                ))}
              </div>
            )}
            {c.requiredExpertise && (
              <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-required-expertise">
                <span className="font-medium text-foreground">Required expertise: </span>
                {c.requiredExpertise}
              </p>
            )}
          </div>
        )}

        {/* Collaboration interest buttons */}
        <div className="border border-border rounded-xl bg-card p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">
                <span data-testid="text-interest-count">{totalInterest}</span> total interest signals
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            {INTEREST_TYPES.map(({ id: tid, label, icon: Icon, color, bg }) => {
              const countKey = `interest${tid.charAt(0).toUpperCase() + tid.slice(1)}` as keyof ConceptCard;
              const count = (c[countKey] as number) ?? 0;
              return (
                <div key={tid} className="text-center">
                  <div className={`text-lg font-bold ${color}`} data-testid={`count-interest-${tid}`}>{count}</div>
                  <div className="text-xs text-muted-foreground mb-2">{label}</div>
                  {session ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className={`w-full text-xs border ${bg} ${color}`}
                      onClick={() => interestMutation.mutate(tid)}
                      disabled={interestMutation.isPending}
                      data-testid={`button-interest-${tid}`}
                    >
                      {interestMutation.isPending && interestMutation.variables === tid ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Icon className="w-3 h-3 mr-1" />
                      )}
                      {label}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>

          {!session && (
            <div className="text-center pt-2 border-t border-border">
              <Link href="/discovery/join">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                  data-testid="button-join-to-interest"
                >
                  Join to Express Interest
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* AI Landscape Intelligence */}
        {landscapeData && (landscapeData.assets.length > 0 || landscapeData.literature.length > 0) && (
          <div className="border border-border rounded-xl bg-card p-5 mb-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground">AI Landscape Intelligence</h3>
                <p className="text-xs text-muted-foreground">Related TTO assets and published literature in this therapy area</p>
              </div>
            </div>

            {landscapeData.assets.length > 0 && (
              <>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Building2 className="w-3 h-3" /> TTO Portfolio Assets
                </p>
                <div className="space-y-2 mb-4">
                  {landscapeData.assets.map((asset) => (
                    <div key={asset.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors" data-testid={`landscape-asset-${asset.id}`}>
                      <Building2 className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground line-clamp-1">{asset.assetName}</p>
                        <p className="text-xs text-muted-foreground">
                          {asset.institution} · {asset.modality} · {asset.developmentStage}
                        </p>
                      </div>
                      {asset.sourceUrl && (
                        <a href={asset.sourceUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground" data-testid={`link-landscape-asset-${asset.id}`}>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {landscapeData.literature.length > 0 && (
              <>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <BookOpen className="w-3 h-3" /> Related Literature (PubMed + bioRxiv)
                </p>
                <div className="space-y-2">
                  {landscapeData.literature.map((paper) => (
                    <div key={paper.pmid} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors" data-testid={`landscape-paper-${paper.pmid}`}>
                      <BookOpen className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${paper.source === "biorxiv" ? "bg-orange-500/10 text-orange-600 dark:text-orange-400" : "bg-blue-500/10 text-blue-600 dark:text-blue-400"}`}>
                            {paper.source === "biorxiv" ? "bioRxiv" : "PubMed"}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground line-clamp-2">{paper.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {paper.authors}{paper.authors && paper.journal ? " · " : ""}{paper.journal}{paper.year ? ` (${paper.year})` : ""}
                        </p>
                      </div>
                      <a href={paper.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground" data-testid={`link-landscape-paper-${paper.pmid}`}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
              </>
            )}

            <p className="text-xs text-muted-foreground mt-3 italic">
              AI-curated from institutional TTO databases and PubMed. Not affiliated with this concept.
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-4">
          Submitted by {c.submitterName}
          {c.submitterAffiliation ? ` · ${c.submitterAffiliation}` : ""}
        </p>
      </div>
    </div>
  );
}
