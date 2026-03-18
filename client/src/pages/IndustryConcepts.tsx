import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Lightbulb, Search, ArrowUpRight, Star } from "lucide-react";
import type { ConceptCard } from "@shared/schema";

type ConceptsResponse = {
  concepts: ConceptCard[];
  total: number;
  page: number;
  totalPages: number;
};

const STAGE_LABELS: Record<number, string> = {
  1: "Idea",
  2: "Hypothesis",
  3: "Validation",
  4: "Prototype",
};

const STAGE_COLORS: Record<number, string> = {
  1: "bg-slate-500/10 text-slate-500 border-slate-500/30",
  2: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  3: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
  4: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
};

function ConceptCard({ card }: { card: ConceptCard }) {
  const stageLabel = STAGE_LABELS[card.stage] ?? `Stage ${card.stage}`;
  const stageColor = STAGE_COLORS[card.stage] ?? STAGE_COLORS[1];
  const totalInterest =
    (card.interestCollaborating ?? 0) +
    (card.interestFunding ?? 0) +
    (card.interestAdvising ?? 0);
  const seekingItems = (card.seeking ?? []).slice(0, 2);

  return (
    <Link href={`/discovery/concept/${card.id}`}>
      <div
        className="group rounded-xl border border-card-border bg-card hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-200 cursor-pointer p-5 flex flex-col gap-3"
        data-testid={`concept-card-${card.id}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={`text-[10px] px-2 py-0.5 font-medium ${stageColor}`}
            >
              {stageLabel}
            </Badge>
            {card.therapeuticArea && (
              <Badge
                variant="outline"
                className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
              >
                {card.therapeuticArea}
              </Badge>
            )}
          </div>
          <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors leading-snug">
            {card.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
            {card.oneLiner}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex flex-wrap gap-1.5">
            {seekingItems.map((s) => (
              <span
                key={s}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground"
              >
                {s}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {card.credibilityScore != null && (
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                <span className="text-[11px] font-semibold text-foreground">
                  {card.credibilityScore}
                </span>
              </div>
            )}
            {totalInterest > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {totalInterest} interested
              </span>
            )}
          </div>
        </div>

        {card.submitterAffiliation && (
          <p className="text-[10px] text-muted-foreground border-t border-border/60 pt-2.5">
            {card.submitterAffiliation}
          </p>
        )}
      </div>
    </Link>
  );
}

export default function IndustryConcepts() {
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading } = useQuery<ConceptsResponse>({
    queryKey: ["/api/discovery/concepts"],
    staleTime: 60 * 1000,
  });

  const concepts = data?.concepts ?? [];

  const therapeuticAreas = useMemo(() => {
    const seen = new Set<string>();
    return concepts
      .map((c) => c.therapeuticArea)
      .filter((a): a is string => Boolean(a) && !seen.has(a) && !!seen.add(a))
      .sort();
  }, [concepts]);

  const statuses = useMemo(() => {
    const seen = new Set<string>();
    return concepts
      .map((c) => c.status)
      .filter((s): s is string => Boolean(s) && !seen.has(s) && !!seen.add(s))
      .sort();
  }, [concepts]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return concepts.filter((c) => {
      const textOk =
        !q ||
        c.title.toLowerCase().includes(q) ||
        c.oneLiner.toLowerCase().includes(q) ||
        (c.therapeuticArea ?? "").toLowerCase().includes(q);
      const areaOk =
        areaFilter === "all" || c.therapeuticArea === areaFilter;
      const statusOk =
        statusFilter === "all" || c.status === statusFilter;
      return textOk && areaOk && statusOk;
    });
  }, [concepts, search, areaFilter, statusFilter]);

  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Lightbulb className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Concepts</h1>
              <p className="text-sm text-muted-foreground">
                Early-stage research concepts published by scientists seeking
                partners, funding, or advisors.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9 text-sm"
              placeholder="Search concepts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-concepts-search"
            />
          </div>
          <Select
            value={areaFilter}
            onValueChange={setAreaFilter}
          >
            <SelectTrigger
              className="h-9 text-xs w-[180px]"
              data-testid="select-concepts-area"
            >
              <SelectValue placeholder="All areas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Therapeutic Areas</SelectItem>
              {therapeuticAreas.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={setStatusFilter}
          >
            <SelectTrigger
              className="h-9 text-xs w-[140px]"
              data-testid="select-concepts-status"
            >
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Lightbulb className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">
              {concepts.length === 0
                ? "No concepts published yet"
                : "No concepts match your filters"}
            </p>
            <p className="text-xs text-muted-foreground/70 max-w-xs">
              {concepts.length === 0
                ? "Scientists will publish concepts here for industry partners to discover."
                : "Try adjusting your search or area filter."}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {filtered.length} concept{filtered.length !== 1 ? "s" : ""}
              {filtered.length < concepts.length
                ? ` of ${concepts.length}`
                : ""}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((c) => (
                <ConceptCard key={c.id} card={c} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
