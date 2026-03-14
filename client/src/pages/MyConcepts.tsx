import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { ConceptCard } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Lightbulb, TrendingUp, Clock, Sparkles, PlusCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MyConcepts() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery<{ concepts: ConceptCard[] }>({
    queryKey: ["/api/discovery/concepts"],
  });

  const myConcepts = (data?.concepts ?? []).filter(
    (c) => c.submitterId === user?.id
  );

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Lightbulb className="w-5 h-5 text-amber-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-my-concepts-title">
              My Concepts
            </h1>
          </div>
          <p className="text-sm text-muted-foreground ml-12">
            Concepts you've submitted to Eden Discovery.
          </p>
        </div>
        <Link href="/discovery/submit">
          <Button className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5" data-testid="button-new-concept">
            <PlusCircle className="w-4 h-4" />
            New Concept
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
        </div>
      ) : myConcepts.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <Lightbulb className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No concepts submitted yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Submit your first pre-research concept to get AI credibility scoring.
          </p>
          <Link href="/discovery/submit">
            <Button className="mt-4 bg-amber-500 hover:bg-amber-600 text-white" data-testid="button-first-concept">
              Submit Your First Concept
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {myConcepts.map((c) => (
            <Link key={c.id} href={`/discovery/concept/${c.id}`}>
              <div
                className="group p-5 rounded-xl border border-border bg-card hover:border-amber-500/40 hover:shadow-md transition-all duration-200 cursor-pointer"
                data-testid={`card-my-concept-${c.id}`}
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h3 className="font-semibold text-foreground text-base group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                    {c.title}
                  </h3>
                  {c.aiCredibilityScore !== null && (
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      c.aiCredibilityScore >= 70
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : c.aiCredibilityScore >= 40
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }`}>
                      <Sparkles className="w-3 h-3" />
                      {c.aiCredibilityScore}/100
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground line-clamp-1 mb-3">{c.oneLiner}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                    {c.therapyArea}
                  </span>
                  <span className="inline-flex items-center gap-1 ml-auto">
                    <TrendingUp className="w-3 h-3" />
                    {c.interestCount} interested
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
