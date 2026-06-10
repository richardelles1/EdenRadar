import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Search, ShieldOff, SlidersHorizontal, X } from "lucide-react";
import type { Institution, InstitutionsListResponse } from "@/lib/institutions";
import { OrientationHint } from "@/components/OrientationHint";

// Specialty chips — faint primary tint, ties to Scout portal identity
const SPECIALTY_CHIP = "bg-primary/10 text-primary/80 border-primary/15";
// Biology chips — neutral, derived data signal
const BIOLOGY_CHIP = "bg-muted text-foreground/65 border-border/70";

function portfolioDepthColor(count: number): string {
  if (count >= 50) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (count >= 10) return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "bg-muted/60 text-muted-foreground";
}

type Continent = "All" | "North America" | "Europe" | "Asia-Pacific";
const CONTINENTS: Continent[] = ["All", "North America", "Europe", "Asia-Pacific"];

function institutionContinent(inst: Institution): string {
  return inst.continent ?? "North America";
}

function InstitutionCard({ inst, loading }: { inst: Institution; loading: boolean }) {
  const [, setLocation] = useLocation();
  const count = inst.count;
  const showRestricted = !loading && inst.accessRestricted && !count;
  const showNoPortal = !loading && inst.noPublicPortal && !count && !inst.accessRestricted;
  const hasBody = !!(inst.ttoName || inst.specialties.length > 0 || (inst.topBiology && inst.topBiology.length > 0));

  return (
    <div
      className="rounded-[14px] overflow-hidden border border-border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/30 active:scale-[0.99] flex flex-col"
      onClick={() => setLocation(`/institutions/${inst.slug}`)}
      data-testid={`institution-card-${inst.slug}`}
    >
      {/* ── Emerald header ── */}
      <div
        className="px-4 py-3.5 flex items-start justify-between gap-3 min-h-[64px]"
        style={{ background: "linear-gradient(135deg, hsl(142 65% 36%) 0%, hsl(142 55% 27%) 100%)" }}
      >
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <Building2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "hsl(0 0% 100% / 0.85)" }} />
          <div className="min-w-0">
            <h3 className="font-bold leading-tight text-sm line-clamp-2" style={{ color: "hsl(0 0% 100% / 0.97)" }}>
              {inst.name}
            </h3>
            {inst.city && (
              <p className="text-[11px] mt-0.5" style={{ color: "hsl(142 30% 80%)" }}>{inst.city}</p>
            )}
          </div>
        </div>
        {showRestricted && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium cursor-help shrink-0 border"
                style={{ background: "hsl(0 0% 100% / 0.12)", borderColor: "hsl(0 0% 100% / 0.25)", color: "hsl(0 0% 100% / 0.80)" }}
              >
                <ShieldOff className="w-2.5 h-2.5" />
                Restricted
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              This institution&apos;s website blocks automated access from cloud hosting providers
            </TooltipContent>
          </Tooltip>
        )}
        {showNoPortal && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium cursor-help shrink-0 border"
                style={{ background: "hsl(0 0% 100% / 0.10)", borderColor: "hsl(0 0% 100% / 0.20)", color: "hsl(0 0% 100% / 0.65)" }}
              >
                <ShieldOff className="w-2.5 h-2.5" />
                No portal
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              This institution does not have a public technology listing portal available for scanning
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* ── Card body ── */}
      <div className={`bg-card flex-1 flex flex-col gap-2.5 px-4 ${hasBody ? "pt-3 pb-3.5" : "pt-2 pb-3"}`}>
        {inst.ttoName && (
          <p className="text-xs text-muted-foreground leading-snug">{inst.ttoName}</p>
        )}

        {inst.specialties.length > 0 && (
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1.5">Research Focus</p>
            <div className="flex flex-wrap gap-1.5">
              {inst.specialties.map((s) => (
                <Badge
                  key={s}
                  variant="outline"
                  className={`text-[10px] font-medium px-1.5 py-0.5 border ${SPECIALTY_CHIP}`}
                >
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {inst.topBiology && inst.topBiology.length > 0 && (
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1.5">Biology Signals</p>
            <div className="flex flex-wrap gap-1.5">
              {inst.topBiology.map((b) => (
                <span
                  key={b}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full border leading-tight ${BIOLOGY_CHIP}`}
                  data-testid={`biology-pill-${inst.slug}`}
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1" />

        <div className="flex items-center justify-between pt-2 border-t border-border/50 mt-0.5">
          <span data-testid={`text-listings-${inst.slug}`}>
            {loading ? (
              <Skeleton className="h-3 w-16 inline-block" />
            ) : count > 0 ? (
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${portfolioDepthColor(count)}`}>
                {count} listings
              </span>
            ) : showRestricted ? (
              <span className="italic text-muted-foreground/50 text-[11px]">Access restricted</span>
            ) : showNoPortal ? (
              <span className="italic text-muted-foreground/50 text-[11px]">No public portal</span>
            ) : (
              <span className="italic text-muted-foreground/50 text-[11px]">—</span>
            )}
          </span>
          <span className="text-xs font-medium text-primary" data-testid={`button-view-institution-${inst.slug}`}>
            View Profile →
          </span>
        </div>
      </div>
    </div>
  );
}

type SortOrder = "listings-desc" | "listings-asc" | "name-asc" | "name-desc";
const SORT_OPTIONS: SortOrder[] = ["listings-desc", "listings-asc", "name-asc", "name-desc"];
function isSortOrder(v: string): v is SortOrder { return (SORT_OPTIONS as string[]).includes(v); }

export default function Institutions() {
  const [search, setSearch] = useState("");
  const [continent, setContinent] = useState<Continent>("All");
  const [sortOrder, setSortOrder] = useState<SortOrder>("listings-desc");
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>("");

  const { data, isLoading } = useQuery<InstitutionsListResponse>({
    queryKey: ["/api/institutions"],
    staleTime: 5 * 60 * 1000,
  });

  const allInstitutions = data?.institutions ?? [];
  const totalIndexed = data?.total ?? 0;
  const noneScanned = !isLoading && allInstitutions.every((i) => i.count === 0);

  const allSpecialties = useMemo(() => {
    const set = new Set<string>();
    for (const inst of allInstitutions) {
      for (const s of inst.specialties) {
        set.add(s);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allInstitutions]);

  const filtered = useMemo(() => {
    const base = allInstitutions.filter((i) => {
      const matchesContinent = continent === "All" || institutionContinent(i) === continent;
      const matchesSearch = i.name.toLowerCase().includes(search.toLowerCase());
      const matchesSpecialty = selectedSpecialty === "" || i.specialties.includes(selectedSpecialty);
      return matchesContinent && matchesSearch && matchesSpecialty;
    });
    return base.sort((a, b) => {
      if (sortOrder === "listings-desc") {
        const diff = (b.count ?? 0) - (a.count ?? 0);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      }
      if (sortOrder === "listings-asc") {
        const diff = (a.count ?? 0) - (b.count ?? 0);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      }
      if (sortOrder === "name-asc") {
        return a.name.localeCompare(b.name);
      }
      return b.name.localeCompare(a.name);
    });
  }, [allInstitutions, continent, search, sortOrder, selectedSpecialty]);

  return (
    <div className="min-h-full">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-foreground">Institutions</h1>
                  <Badge
                    variant="secondary"
                    className="text-[11px] font-semibold bg-primary/10 text-primary border-0"
                    data-testid="badge-tto-count"
                  >
                    {isLoading
                      ? "Loading…"
                      : continent !== "All"
                        ? `${filtered.length} TTOs · ${continent}`
                        : `${totalIndexed} TTOs indexed`}
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

            <div className="flex items-center gap-2 flex-wrap justify-between">
              <div className="flex items-center gap-2 flex-wrap" data-testid="continent-filter">
                {CONTINENTS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setContinent(c)}
                    data-testid={`filter-continent-${c.toLowerCase().replace(/[^a-z]/g, "-")}`}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors duration-150 ${
                      continent === c
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-transparent text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Select
                  value={sortOrder}
                  onValueChange={(v) => { if (isSortOrder(v)) setSortOrder(v); }}
                >
                  <SelectTrigger
                    className="h-8 w-44 text-xs gap-1.5"
                    data-testid="select-sort-order"
                  >
                    <SlidersHorizontal className="w-3 h-3 text-muted-foreground shrink-0" />
                    <SelectValue placeholder="Sort by…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="listings-desc" data-testid="sort-option-listings-desc">Listings ↓</SelectItem>
                    <SelectItem value="listings-asc" data-testid="sort-option-listings-asc">Listings ↑</SelectItem>
                    <SelectItem value="name-asc" data-testid="sort-option-name-asc">Name A→Z</SelectItem>
                    <SelectItem value="name-desc" data-testid="sort-option-name-desc">Name Z→A</SelectItem>
                  </SelectContent>
                </Select>
                {allSpecialties.length > 0 && (
                  <Select
                    value={selectedSpecialty}
                    onValueChange={(v) => setSelectedSpecialty(v === "__all__" ? "" : v)}
                  >
                    <SelectTrigger
                      className="h-8 w-44 text-xs gap-1.5"
                      data-testid="select-specialty-filter"
                    >
                      <SelectValue placeholder="Focus area" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__" data-testid="specialty-option-all">All focus areas</SelectItem>
                      {allSpecialties.map((s) => (
                        <SelectItem
                          key={s}
                          value={s}
                          data-testid={`specialty-option-${s.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                        >
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-5">
          <OrientationHint
            hintId="institutions-portfolio-dna"
            title="Portfolio DNA."
            body="Each card shows the institution's biology concentration. Click any card to explore the full TTO portfolio and see individual asset details."
            accent="emerald"
          />
        </div>
        {noneScanned && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400 text-sm">
            <span className="font-medium">Listing counts are not yet available.</span>
            <span className="text-muted-foreground">Run a scan from the Scout page to populate real counts.</span>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-52 w-full rounded-[14px]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Search className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-sm font-medium text-foreground">
              No institutions match{search ? ` "${search}"` : ""}{continent !== "All" ? ` in ${continent}` : ""}
            </p>
            <button
              onClick={() => { setSearch(""); setContinent("All"); setSelectedSpecialty(""); }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <X className="w-3 h-3" />Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((inst) => (
              <InstitutionCard
                key={inst.slug}
                inst={inst}
                loading={isLoading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
