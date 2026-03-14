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
  ThumbsUp,
  Loader2,
  Target,
  Beaker,
  AlertTriangle,
  Moon,
  Sun,
  ArrowRight,
} from "lucide-react";

function ScoreRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-border"
          strokeWidth="5"
        />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
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

export default function ConceptDetail() {
  const [, params] = useRoute("/discovery/concept/:id");
  const id = params?.id;
  const { toast } = useToast();
  const { session } = useAuth();

  const { data, isLoading } = useQuery<{ concept: ConceptCard }>({
    queryKey: ["/api/discovery/concepts", id],
    queryFn: async () => {
      const res = await fetch(`/api/discovery/concepts/${id}`);
      if (!res.ok) throw new Error("Failed to fetch concept");
      return res.json();
    },
    enabled: !!id,
  });

  const interestMutation = useMutation({
    mutationFn: async () => {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`/api/discovery/concepts/${id}/interest`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/concepts", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/concepts"] });
      toast({ title: "Interest registered!" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DiscoveryDetailNav />
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
        <DiscoveryDetailNav />
        <div className="p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">Concept not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DiscoveryDetailNav />

      <div className="p-6 md:p-8 max-w-3xl mx-auto">
        <Link href="/discovery">
          <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer mb-6 transition-colors" data-testid="link-back-feed">
            <ArrowLeft className="w-4 h-4" />
            Back to feed
          </div>
        </Link>

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
                {c.therapyArea}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {c.modality}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                {c.stage?.replace(/_/g, " ")}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
                <Clock className="w-3 h-3" />
                {new Date(c.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
          {c.aiCredibilityScore !== null && (
            <div className="md:col-span-1 border border-border rounded-xl bg-card p-5 flex flex-col items-center">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                AI Credibility
              </div>
              <ScoreRing score={c.aiCredibilityScore} />
              {c.aiCredibilityRationale && (
                <p className="text-xs text-muted-foreground text-center mt-3 italic">
                  {c.aiCredibilityRationale}
                </p>
              )}
            </div>
          )}

          <div className={`${c.aiCredibilityScore !== null ? "md:col-span-2" : "md:col-span-3"} space-y-4`}>
            <div className="border border-border rounded-xl bg-card p-5">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-amber-500" />
                <h3 className="font-semibold text-sm text-foreground">Problem Statement</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-problem-statement">
                {c.problemStatement}
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

        <div className="flex items-center justify-between border border-border rounded-xl bg-card p-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground" data-testid="text-interest-count">{c.interestCount}</span>{" "}
              people interested
            </span>
          </div>
          {session ? (
            <Button
              variant="outline"
              size="sm"
              className="border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
              onClick={() => interestMutation.mutate()}
              disabled={interestMutation.isPending}
              data-testid="button-express-interest"
            >
              {interestMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <ThumbsUp className="w-4 h-4 mr-1.5" />
              )}
              I'm Interested
            </Button>
          ) : (
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
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Submitted by {c.submitterName}
        </p>
      </div>
    </div>
  );
}
