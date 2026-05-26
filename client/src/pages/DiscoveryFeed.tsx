import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState } from "react";
import type { ConceptCard } from "@shared/schema";
import {
  Lightbulb, TrendingUp, Clock, Sparkles, ArrowRight, FlaskConical,
  Users, DollarSign, GraduationCap, Filter, Building2, Moon, Sun, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";

const THERAPY_AREAS = [
  "All Areas", "Oncology", "Neurology", "Immunology", "Cardiology", "Rare Disease",
  "Infectious Disease", "Metabolic", "Ophthalmology", "Dermatology", "Respiratory", "Other",
];

const STAGE_OPTIONS = [
  { value: "all", label: "All Stages" },
  { value: "1", label: "Hypothesis" },
  { value: "2", label: "Literature Review" },
  { value: "3", label: "Preliminary Data" },
  { value: "4", label: "Proof of Concept" },
];

const STAGE_SIGNAL: Record<number, { label: string; color: string }> = {
  1: { label: "Hypothesis", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  2: { label: "Lit Review", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
  3: { label: "Prelim Data", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  4: { label: "POC Ready", color: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20" },
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
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${color}`} data-testid="badge-credibility-score">
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
              The <span className="text-amber-500">Commons</span>
            </span>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={toggleTheme} data-testid="discovery-toggle-theme">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          {isConceptUser ? (
            <div className="flex items-center gap-2">
              <Link href="/discovery/my-concepts">
                <Button variant="ghost" size="sm" data-testid="link-my-concepts">My Concepts</Button>
              </Link>
              <Link href="/discovery/submit">
                <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5" data-testid="link-submit-concept">
                  <Lightbulb className="w-3.5 h-3.5" />
                  Post Concept
                </Button>
              </Link>
            </div>
          ) : (
            <Link href="/discovery/join">
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5" data-testid="link-join-discovery">
                Join The Commons
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function ConceptCard({ c }: { c: ConceptCard }) {
  const stage = STAGE_SIGNAL[c.stage] ?? { label: `Stage ${c.stage}`, color: "bg-muted text-muted-foreground" };
  const collab = c.interestCollaborating ?? 0;
  const funding = c.interestFunding ?? 0;
  const advising = c.interestAdvising ?? 0;
  const totalInterest = collab + funding + advising;
  const mechanismTags = (c as any).mechanismTags as string[] | null;

  return (
    <Link href={`/discovery/concept/${c.id}`}>
      <div
        className="group p-5 rounded-xl border border-border bg-card hover:border-amber-500/40 hover:shadow-md transition-all duration-200 cursor-pointer"
        data-testid={`card-concept-${c.id}`}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${stage.color}`}>
                {stage.label}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                {c.therapeuticArea}
              </span>
            </div>
            <h3 className="font-semibold text-foreground text-base leading-snug group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
              {c.title}
            </h3>
          </div>
          <ScoreBadge score={c.credibilityScore} />
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{c.oneLiner}</p>

        {mechanismTags && mechanismTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {mechanismTags.slice(0, 4).map((tag) => (
              <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border border-violet-500/25 text-violet-600 dark:text-violet-400 bg-violet-500/5">
                <Tag className="w-2.5 h-2.5" />
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {c.submitterAffiliation && (
            <span className="inline-flex items-center gap-1">
              <Building2 className="w-3 h-3 shrink-0" />
              {c.submitterAffiliation}
            </span>
          )}
          <span className="ml-auto flex items-center gap-3">
            {collab > 0 && (
              <span className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400">
                <Users className="w-3 h-3" />{collab}
              </span>
            )}
            {funding > 0 && (
              <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                <DollarSign className="w-3 h-3" />{funding}
              </span>
            )}
            {advising > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <GraduationCap className="w-3 h-3" />{advising}
              </span>
            )}
            {totalInterest === 0 && (
              <span className="inline-flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />0 signals
              </span>
            )}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(c.createdAt).toLocaleDateString()}
          </span>
        </div>

        {c.seeking && c.seeking.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {c.seeking.map((s) => (
              <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/30 text-amber-600 dark:text-amber-400">
                Seeking: {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

export default function DiscoveryFeed() {
  const { data, isLoading } = useQuery<{ concepts: ConceptCard[]; total?: number }>({
    queryKey: ["/api/discovery/concepts"],
  });

  const [filterArea, setFilterArea] = useState("All Areas");
  const [filterStage, setFilterStage] = useState("all");
  const [filterTag, setFilterTag] = useState("");

  const allConcepts = data?.concepts ?? [];

  const allTags = Array.from(new Set(
    allConcepts.flatMap((c) => ((c as any).mechanismTags as string[] | null) ?? [])
  )).sort();

  const concepts = allConcepts.filter((c) => {
    const areaMatch = filterArea === "All Areas" || c.therapeuticArea === filterArea;
    const stageMatch = filterStage === "all" || String(c.stage) === filterStage;
    const tagMatch = !filterTag || (((c as any).mechanismTags as string[] | null) ?? []).includes(filterTag);
    return areaMatch && stageMatch && tagMatch;
  });

  const { session, role } = useAuth();
  const hasSidebar = session && role === "concept";

  const featured = concepts.filter((c) => (c.credibilityScore ?? 0) >= 70).slice(0, 3);
  const rest = concepts.filter((c) => !featured.some((f) => f.id === c.id));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {!hasSidebar && <DiscoveryNav />}

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 sm:px-6 py-8">
        {/* Hero */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-discovery-title">The Commons</h1>
              <p className="text-sm text-muted-foreground">Pre-research ideas posted before the work is done — to attract collaborators, funding, and movement.</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          <Select value={filterArea} onValueChange={setFilterArea}>
            <SelectTrigger className="w-40 h-8 text-xs" data-testid="filter-therapy-area">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THERAPY_AREAS.map((a) => (
                <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStage} onValueChange={setFilterStage}>
            <SelectTrigger className="w-40 h-8 text-xs" data-testid="filter-stage">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGE_OPTIONS.map(({ value, label }) => (
                <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {allTags.length > 0 && (
            <Select value={filterTag || "_all"} onValueChange={(v) => setFilterTag(v === "_all" ? "" : v)}>
              <SelectTrigger className="w-44 h-8 text-xs" data-testid="filter-mechanism-tag">
                <SelectValue placeholder="Mechanism" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all" className="text-xs">All Mechanisms</SelectItem>
                {allTags.map((tag) => (
                  <SelectItem key={tag} value={tag} className="text-xs">{tag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(filterArea !== "All Areas" || filterStage !== "all" || filterTag) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => { setFilterArea("All Areas"); setFilterStage("all"); setFilterTag(""); }}
              data-testid="button-clear-filters"
            >
              Clear
            </Button>
          )}
          {!isLoading && (
            <span className="text-xs text-muted-foreground ml-auto" data-testid="text-concept-count">
              {concepts.length} concept{concepts.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-40 rounded-xl border border-border bg-card animate-pulse" />
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
                ? "Be the first to post a pre-research concept."
                : "Try adjusting or clearing your filters."}
            </p>
            {allConcepts.length === 0 && (
              <Link href="/discovery/join">
                <Button className="mt-4 bg-amber-500 hover:bg-amber-600 text-white" data-testid="button-join-empty">
                  Join & Post a Concept
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {featured.length > 0 && !filterArea && filterStage === "all" && !filterTag && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-amber-500" /> High credibility
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {featured.map((c) => <ConceptCard key={c.id} c={c} />)}
                </div>
              </div>
            )}

            {(featured.length === 0 || filterArea !== "All Areas" || filterStage !== "all" || filterTag) ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {concepts.map((c) => <ConceptCard key={c.id} c={c} />)}
              </div>
            ) : rest.length > 0 ? (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">All concepts</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {rest.map((c) => <ConceptCard key={c.id} c={c} />)}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
