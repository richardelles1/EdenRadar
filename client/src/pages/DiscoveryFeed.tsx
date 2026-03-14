import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { ConceptCard } from "@shared/schema";
import { Lightbulb, TrendingUp, Clock, Sparkles } from "lucide-react";

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const color =
    score >= 70
      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
      : score >= 40
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}
      data-testid="badge-credibility-score"
    >
      <Sparkles className="w-3 h-3" />
      {score}/100
    </span>
  );
}

export default function DiscoveryFeed() {
  const { data, isLoading } = useQuery<{ concepts: ConceptCard[] }>({
    queryKey: ["/api/discovery/concepts"],
  });

  const concepts = data?.concepts ?? [];

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Lightbulb className="w-5 h-5 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-discovery-title">
            Concept Feed
          </h1>
        </div>
        <p className="text-sm text-muted-foreground ml-12">
          Early-stage biotech concepts scored by AI for scientific credibility.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-36 rounded-xl border border-border bg-card animate-pulse"
            />
          ))}
        </div>
      ) : concepts.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <Lightbulb className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No concepts yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Be the first to submit a pre-research concept.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {concepts.map((c) => (
            <Link key={c.id} href={`/discovery/concept/${c.id}`}>
              <div
                className="group p-5 rounded-xl border border-border bg-card hover:border-amber-500/40 hover:shadow-md transition-all duration-200 cursor-pointer"
                data-testid={`card-concept-${c.id}`}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground text-base group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                      {c.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {c.oneLiner}
                    </p>
                  </div>
                  <ScoreBadge score={c.aiCredibilityScore} />
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                    {c.therapyArea}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                    {c.modality}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium capitalize">
                    {c.stage}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    {c.interestCount} interested
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {c.aiCredibilityRationale && (
                  <p className="mt-3 text-xs text-muted-foreground italic border-t border-border pt-2">
                    AI: {c.aiCredibilityRationale}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
