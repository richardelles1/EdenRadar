import { useState, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Building2, Search, ShieldOff } from "lucide-react";
import type { Institution, InstitutionsListResponse } from "@/lib/institutions";

type Continent = "All" | "North America" | "Europe" | "Asia-Pacific";
const CONTINENTS: Continent[] = ["All", "North America", "Europe", "Asia-Pacific"];

const SPECIALTY_PATTERNS: Array<[string, string]> = [
  ["oncol",        "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"],
  ["cancer",       "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"],
  ["tumor",        "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"],
  ["tumour",       "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"],
  ["neurosc",      "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"],
  ["neurol",       "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"],
  ["brain",        "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"],
  ["cns",          "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"],
  ["drug deliv",   "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"],
  ["drug-deliv",   "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"],
  ["nanoparticl",  "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"],
  ["formul",       "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"],
  ["gene ther",    "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20"],
  ["gene-ther",    "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20"],
  ["viral vect",   "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20"],
  ["car-t",        "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20"],
  ["cart ",        "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20"],
  ["chimeric",     "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20"],
  ["cell ther",    "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20"],
  ["immuno",       "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"],
  ["mrna",         "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"],
  ["rna ther",     "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"],
  ["antisense",    "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"],
  ["crispr",       "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"],
  ["genome edit",  "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"],
  ["gene edit",    "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"],
  ["base edit",    "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"],
  ["rare dis",     "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"],
  ["orphan",       "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"],
  ["diagnost",     "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20"],
  ["biomarker",    "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20"],
  ["imaging",      "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20"],
  ["biomaterial",  "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"],
  ["scaffold",     "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"],
  ["bioelectron",  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"],
  ["neural interface", "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"],
];

function getSpecialtyClass(s: string) {
  const lower = s.toLowerCase();
  const match = SPECIALTY_PATTERNS.find(([pattern]) => lower.includes(pattern));
  return match ? match[1] : "bg-muted/40 text-muted-foreground border-border";
}

function institutionContinent(inst: Institution): string {
  return inst.continent ?? "North America";
}

function InstitutionCard({
  inst,
  loading,
}: {
  inst: Institution;
  loading: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, active: false });
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [, setLocation] = useLocation();

  const count = inst.count;
  const showRestricted = !loading && inst.accessRestricted && !count;
  const showNoPortal = !loading && inst.noPublicPortal && !count && !inst.accessRestricted;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (relY - 0.5) * -10, y: (relX - 0.5) * 10, active: true });
  };

  const handleMouseLeave = () => {
    setHovered(false);
    setTilt({ x: 0, y: 0, active: false });
    setPressed(false);
  };

  return (
    <div
      style={{ perspective: "900px" }}
      className="cursor-pointer w-full"
      onClick={() => setLocation(`/institutions/${inst.slug}`)}
      data-testid={`institution-card-${inst.slug}`}
    >
      <div
        ref={cardRef}
        className="relative w-full rounded-[14px] overflow-hidden bg-white/80 dark:bg-zinc-900/85 border border-white/90 dark:border-white/10"
        style={{
          willChange: "transform",
          transformStyle: "preserve-3d",
          transform: pressed
            ? `perspective(900px) scale(0.96) rotateZ(0.4deg)`
            : tilt.active
            ? `perspective(900px) scale(1.015) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`
            : `perspective(900px)`,
          transition: pressed
            ? "transform 0.07s ease-in, box-shadow 0.1s"
            : tilt.active
            ? "transform 0.08s ease-out, box-shadow 0.2s"
            : "transform 0.5s cubic-bezier(0.23,1,0.32,1), box-shadow 0.4s",
          boxShadow: hovered
            ? "0 16px 48px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.10)"
            : "0 4px 20px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)",
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={handleMouseLeave}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
      >
        <div
          className="absolute pointer-events-none"
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "rgba(38, 122, 70, 0.55)",
            top: "-28px",
            left: "-28px",
            transform: hovered ? "scale(26)" : "scale(1)",
            transformOrigin: "center center",
            opacity: hovered ? 0.13 : 0,
            transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
            zIndex: 1,
          }}
        />

        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] z-[3]"
          style={{ background: "#22c55e" }}
        />

        <div className="relative z-[4] flex flex-col gap-3 pl-5 pr-4 pt-4 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-foreground leading-tight">{inst.name}</h3>
              {inst.city && (
                <p className="text-xs text-zinc-700 dark:text-zinc-200 font-medium mt-0.5">{inst.city}</p>
              )}
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
            {showNoPortal && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20 cursor-help shrink-0">
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

          {inst.ttoName && (
            <p className="text-xs text-muted-foreground">{inst.ttoName}</p>
          )}

          {inst.specialties.length > 0 && (
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
          )}

          <div className="flex items-center justify-between pt-1 border-t border-white/20 dark:border-white/10">
            <span className="text-xs text-muted-foreground" data-testid={`text-listings-${inst.slug}`}>
              {loading ? (
                <Skeleton className="h-3 w-16 inline-block" />
              ) : count > 0 ? (
                <><span className="font-semibold text-foreground">{count}</span> active listings</>
              ) : showRestricted ? (
                <span className="italic text-muted-foreground/60">Access restricted</span>
              ) : showNoPortal ? (
                <span className="italic text-muted-foreground/60">No public portal</span>
              ) : (
                <span className="italic text-muted-foreground/60">—</span>
              )}
            </span>
            <span
              className="text-xs font-medium text-primary"
              data-testid={`button-view-institution-${inst.slug}`}
            >
              View Profile →
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Institutions() {
  const [search, setSearch] = useState("");
  const [continent, setContinent] = useState<Continent>("All");

  const { data, isLoading } = useQuery<InstitutionsListResponse>({
    queryKey: ["/api/institutions"],
    staleTime: 5 * 60 * 1000,
  });

  const allInstitutions = data?.institutions ?? [];
  const totalIndexed = data?.total ?? 0;
  const noneScanned = !isLoading && allInstitutions.every((i) => i.count === 0);

  const filtered = useMemo(() => {
    const base = allInstitutions.filter((i) => {
      const matchesContinent = continent === "All" || institutionContinent(i) === continent;
      const matchesSearch = i.name.toLowerCase().includes(search.toLowerCase());
      return matchesContinent && matchesSearch;
    });
    return base.sort((a, b) => {
      const diff = (b.count ?? 0) - (a.count ?? 0);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }, [allInstitutions, continent, search]);

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

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-[14px]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            No institutions match{search ? ` "${search}"` : ""}{continent !== "All" ? ` in ${continent}` : ""}
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
