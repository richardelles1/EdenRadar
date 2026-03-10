import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Building2, Search, ShieldOff } from "lucide-react";
import { INSTITUTIONS, BLOCKED_SLUGS, type Institution } from "@/lib/institutions";

export { INSTITUTIONS };

const SPECIALTY_COLORS: Record<string, string> = {
  "Oncology": "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  "Neuroscience": "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  "Gene Therapy": "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  "Immunology": "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  "Immunotherapy": "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  "CAR-T": "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20",
  "mRNA": "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  "CRISPR": "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  "Drug Delivery": "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  "Rare Disease": "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
};

function getSpecialtyClass(s: string) {
  return SPECIALTY_COLORS[s] ?? "bg-muted/40 text-muted-foreground border-border";
}

function InstitutionCard({
  inst,
  count,
  countsLoading,
}: {
  inst: Institution;
  count: number | null;
  countsLoading: boolean;
}) {
  const isBlocked = BLOCKED_SLUGS.has(inst.slug);
  const showRestricted = !countsLoading && isBlocked && !count;

  return (
    <div
      className="flex flex-col gap-3 p-5 rounded-lg border border-card-border bg-card hover:border-primary/30 transition-colors duration-200"
      data-testid={`institution-card-${inst.slug}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Building2 className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground leading-tight">{inst.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{inst.city}</p>
        </div>
        {showRestricted && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 cursor-help shrink-0">
                <ShieldOff className="w-2.5 h-2.5" />
                Restricted
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              This institution&apos;s website blocks automated access from cloud hosting providers
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{inst.ttoName}</p>

      <div className="flex flex-wrap gap-1.5">
        {inst.specialties.map((s) => (
          <Badge
            key={s}
            variant="outline"
            className={`text-[10px] font-medium px-1.5 py-0.5 border ${getSpecialtyClass(s)}`}
          >
            {s}
          </Badge>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-card-border">
        <span className="text-xs text-muted-foreground" data-testid={`text-listings-${inst.slug}`}>
          {countsLoading ? (
            <Skeleton className="h-3 w-16 inline-block" />
          ) : count !== null && count > 0 ? (
            <><span className="font-semibold text-foreground">{count}</span> active listings</>
          ) : showRestricted ? (
            <span className="italic text-muted-foreground/60">Access restricted</span>
          ) : (
            <span className="italic text-muted-foreground/60">—</span>
          )}
        </span>
        <Link href={`/institutions/${inst.slug}`}>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5 border-card-border"
            data-testid={`button-view-institution-${inst.slug}`}
          >
            View Profile
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function Institutions() {
  const [search, setSearch] = useState("");

  const { data: countsData, isLoading: countsLoading } = useQuery<Record<string, number>>({
    queryKey: ["/api/institutions/counts"],
    staleTime: 5 * 60 * 1000,
  });

  const noneScanned = !countsLoading && (!countsData || Object.keys(countsData).length === 0);

  const filtered = INSTITUTIONS.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground">Institutions</h1>
                <Badge
                  variant="secondary"
                  className="text-[11px] font-semibold bg-primary/10 text-primary border-0"
                  data-testid="badge-tto-count"
                >
                  {INSTITUTIONS.length} TTOs indexed
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                University tech transfer offices tracked and indexed by EdenRadar.
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search institutions..."
                className="pl-8 h-9 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-institutions"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
        {noneScanned && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400 text-sm">
            <span className="font-medium">Listing counts are not yet available.</span>
            <span className="text-muted-foreground">Run a scan from the Scout page to populate real counts.</span>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            No institutions match &ldquo;{search}&rdquo;
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((inst) => (
              <InstitutionCard
                key={inst.slug}
                inst={inst}
                count={countsData?.[inst.name] ?? null}
                countsLoading={countsLoading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
