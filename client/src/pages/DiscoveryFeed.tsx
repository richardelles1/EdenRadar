import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState } from "react";
import type { ConceptCard } from "@shared/schema";
import { Lightbulb, TrendingUp, Clock, Sparkles, ArrowRight, Compass, Filter, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Moon, Sun } from "lucide-react";

const THERAPY_AREAS = [
  "All Areas", "Oncology", "Neurology", "Immunology", "Cardiology", "Rare Disease",
  "Infectious Disease", "Metabolic", "Ophthalmology", "Dermatology", "Respiratory", "Other",
];

const STAGE_OPTIONS = [
  { value: "all", label: "All Stages" },
  { value: "1", label: "Stage 1: Concept Idea" },
  { value: "2", label: "Stage 2: Literature Review" },
  { value: "3", label: "Stage 3: Preliminary Data" },
  { value: "4", label: "Stage 4: Proof of Concept" },
];

const STAGE_LABEL: Record<number, string> = {
  1: "Stage 1",
  2: "Stage 2",
  3: "Stage 3",
  4: "Stage 4",
};

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

function DiscoveryNav() {
  const { session, role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isConceptUser = session && role === "concept";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <Link href="/discovery">
          <div className="flex items-center gap-2.5 cursor-pointer select-none" data-testid="discovery-nav-logo">
            <div className="relative w-7 h-7 rounded-md bg-amber-500 flex items-center justify-center">
              <Lightbulb className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-foreground text-base tracking-tight">
              Eden<span className="text-amber-500">Discovery</span>
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8"
            onClick={toggleTheme}
            data-testid="discovery-toggle-theme"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          {isConceptUser ? (
            <div className="flex items-center gap-2">
              <Link href="/discovery/my-concepts">
                <Button variant="ghost" size="sm" data-testid="link-my-concepts">
                  My Concepts
                </Button>
              </Link>
              <Link href="/discovery/submit">
                <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5" data-testid="link-submit-concept">
                  <Lightbulb className="w-3.5 h-3.5" />
                  Submit
                </Button>
              </Link>
            </div>
          ) : (
            <Link href="/discovery/join">
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5" data-testid="link-join-discovery">
                Join EdenDiscovery
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export default function DiscoveryFeed() {
  const { data, isLoading } = useQuery<{ concepts: ConceptCard[]; total?: number; page?: number; totalPages?: number }>({
    queryKey: ["/api/discovery/concepts"],
  });

  const [filterArea, setFilterArea] = useState("All Areas");
  const [filterStage, setFilterStage] = useState("all");

  const allConcepts = data?.concepts ?? [];
  const concepts = allConcepts.filter((c) => {
    const areaMatch = filterArea === "All Areas" || c.therapeuticArea === filterArea;
    const stageMatch = filterStage === "all" || String(c.stage) === filterStage;
    return areaMatch && stageMatch;
  });

  const { session, role } = useAuth();
  const hasSidebar = session && role === "concept";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {!hasSidebar && <DiscoveryNav />}

      <main className="flex-1 p-6 md:p-8 max-w-4xl mx-auto w-full">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Compass className="w-5 h-5 text-amber-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-discovery-title">
              Concept Feed
            </h1>
          </div>
          <p className="text-sm text-muted-foreground ml-12">
            Early-stage biotech concepts scored by AI for scientific credibility.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          <Select value={filterArea} onValueChange={setFilterArea}>
            <SelectTrigger className="w-44" data-testid="filter-therapy-area">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THERAPY_AREAS.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStage} onValueChange={setFilterStage}>
            <SelectTrigger className="w-44" data-testid="filter-stage">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGE_OPTIONS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(filterArea !== "All Areas" || filterStage !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => { setFilterArea("All Areas"); setFilterStage("all"); }}
              data-testid="button-clear-filters"
            >
              Clear filters
            </Button>
          )}
          {!isLoading && (
            <span className="text-xs text-muted-foreground ml-auto" data-testid="text-concept-count">
              {concepts.length} concept{concepts.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 rounded-xl border border-border bg-card animate-pulse" />
            ))}
          </div>
        ) : concepts.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-xl">
            <Lightbulb className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">
              {allConcepts.length === 0 ? "No concepts yet" : "No concepts match your filters"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {allConcepts.length === 0
                ? "Be the first to submit a pre-research concept."
                : "Try adjusting or clearing your filters."}
            </p>
            {allConcepts.length === 0 && (
              <Link href="/discovery/join">
                <Button className="mt-4 bg-amber-500 hover:bg-amber-600 text-white" data-testid="button-join-empty">
                  Join & Submit a Concept
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {concepts.map((c) => {
              const totalInterest = (c.interestCollaborating ?? 0) + (c.interestFunding ?? 0) + (c.interestAdvising ?? 0);
              return (
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
                      <ScoreBadge score={c.credibilityScore} />
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                        {c.therapeuticArea}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        {c.modality}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        {STAGE_LABEL[c.stage] ?? `Stage ${c.stage}`}
                      </span>
                      {c.submitterAffiliation && (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Building2 className="w-3 h-3 shrink-0" />
                          {c.submitterAffiliation}
                        </span>
                      )}
                      <span className="ml-auto inline-flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {totalInterest} interested
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    {c.seeking && c.seeking.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {c.seeking.map((s) => (
                          <span key={s} className="text-[11px] px-1.5 py-0.5 rounded-full border border-amber-500/30 text-amber-600 dark:text-amber-400">
                            Seeking: {s}
                          </span>
                        ))}
                      </div>
                    )}

                    {c.credibilityRationale && (
                      <p className="mt-3 text-xs text-muted-foreground italic border-t border-border pt-2">
                        AI: {c.credibilityRationale}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
