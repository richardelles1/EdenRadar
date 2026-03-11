import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen, FlaskConical, Stethoscope, Fingerprint, Microscope,
  DollarSign, Globe, Building2, CheckCircle2, ShieldOff,
  ArrowUpDown, Search, ExternalLink,
} from "lucide-react";
import { INSTITUTIONS, BLOCKED_SLUGS } from "@/lib/institutions";

const DATA_SOURCES = [
  {
    id: "pubmed",
    name: "PubMed",
    category: "Literature",
    description: "NIH biomedical literature database. ~35M peer-reviewed citations indexed. Updated daily.",
    url: "https://pubmed.ncbi.nlm.nih.gov",
    icon: BookOpen,
    color: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
  },
  {
    id: "biorxiv",
    name: "bioRxiv",
    category: "Preprints",
    description: "Biology preprints before peer review. Early-stage research signals, often 6–18 months ahead of publication.",
    url: "https://www.biorxiv.org",
    icon: Microscope,
    color: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
  },
  {
    id: "medrxiv",
    name: "medRxiv",
    category: "Preprints",
    description: "Clinical and health sciences preprints. Covers trials, epidemiology, and translational medicine.",
    url: "https://www.medrxiv.org",
    icon: Stethoscope,
    color: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
  },
  {
    id: "clinicaltrials",
    name: "ClinicalTrials.gov",
    category: "Clinical",
    description: "NIH registry of clinical studies worldwide. ~450K registered trials. Tracks sponsor, phase, status, and endpoints.",
    url: "https://clinicaltrials.gov",
    icon: Stethoscope,
    color: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10",
  },
  {
    id: "patents",
    name: "USPTO Patents",
    category: "Patents",
    description: "US patent filings with biotech-relevant IPC classes (A61, C07, C12). Patent status signals licensing availability.",
    url: "https://www.uspto.gov",
    icon: Fingerprint,
    color: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  },
  {
    id: "nih_reporter",
    name: "NIH Reporter",
    category: "Grants",
    description: "Active NIH grant awards. $40B+ annually. Tracks principal investigator, institution, and funding period.",
    url: "https://reporter.nih.gov",
    icon: DollarSign,
    color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  },
  {
    id: "openalex",
    name: "OpenAlex",
    category: "Literature",
    description: "Open scholarly works index with 250M+ papers, authors, and institutions. Broad cross-disciplinary coverage.",
    url: "https://openalex.org",
    icon: Globe,
    color: "text-sky-600 dark:text-sky-400 bg-sky-500/10",
  },
  {
    id: "techtransfer",
    name: "Tech Transfer (TTO)",
    category: "Licensing",
    description: "Live scraper covering 86 university technology transfer offices. Indexes available-for-licensing assets daily.",
    url: "/institutions",
    icon: Building2,
    color: "text-primary bg-primary/10",
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  Literature:  "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  Preprints:   "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  Clinical:    "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  Patents:     "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  Grants:      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  Licensing:   "bg-primary/10 text-primary border-primary/20",
};

type TtoStatus = "active" | "indexed" | "restricted" | "empty";

const STATUS_CONFIG: Record<TtoStatus, { label: string; color: string; priority: number }> = {
  active:     { label: "Active",      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20", priority: 0 },
  indexed:    { label: "Indexed",     color: "bg-primary/10 text-primary border-primary/20",                                    priority: 1 },
  restricted: { label: "Restricted",  color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",         priority: 2 },
  empty:      { label: "Empty",       color: "bg-muted text-muted-foreground border-border",                                    priority: 3 },
};

function getTtoStatus(slug: string, count: number): TtoStatus {
  if (BLOCKED_SLUGS.has(slug)) return "restricted";
  if (count > 50) return "active";
  if (count > 0) return "indexed";
  return "empty";
}

type SortKey = "status" | "count" | "name";

export default function Sources() {
  const [ttoSearch, setTtoSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: countsData, isLoading } = useQuery<Record<string, number>>({
    queryKey: ["/api/institutions/counts"],
    staleTime: 5 * 60 * 1000,
  });

  const ttos = useMemo(() => {
    const rows = INSTITUTIONS.map((inst) => {
      const count = countsData?.[inst.name] ?? 0;
      const status = getTtoStatus(inst.slug, count);
      return { ...inst, count, status };
    });

    const filtered = ttoSearch.trim()
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(ttoSearch.toLowerCase()) ||
            r.city.toLowerCase().includes(ttoSearch.toLowerCase()) ||
            r.ttoName.toLowerCase().includes(ttoSearch.toLowerCase())
        )
      : rows;

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "status") {
        cmp = STATUS_CONFIG[a.status].priority - STATUS_CONFIG[b.status].priority;
        if (cmp === 0) cmp = b.count - a.count;
      } else if (sortKey === "count") {
        cmp = b.count - a.count;
      } else {
        cmp = a.name.localeCompare(b.name);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [countsData, ttoSearch, sortKey, sortDir]);

  const summary = useMemo(() => {
    const all = INSTITUTIONS.map((inst) => {
      const count = countsData?.[inst.name] ?? 0;
      return getTtoStatus(inst.slug, count);
    });
    return {
      active:     all.filter((s) => s === "active").length,
      indexed:    all.filter((s) => s === "indexed").length,
      restricted: all.filter((s) => s === "restricted").length,
      empty:      all.filter((s) => s === "empty").length,
    };
  }, [countsData]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-bold text-foreground">Sources</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All data sources powering EdenRadar — literature, clinical, patents, grants, and live TTO feeds.
          </p>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        <section>
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
            Data Sources
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {DATA_SOURCES.map((src) => {
              const Icon = src.icon;
              const isInternal = src.url.startsWith("/");
              const content = (
                <div
                  className="flex flex-col gap-3 p-4 rounded-lg border border-card-border bg-card hover:border-primary/25 transition-colors group"
                  data-testid={`source-card-${src.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${src.color}`}>
                      <Icon className="w-4.5 h-4.5 w-4 h-4" />
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[src.category] ?? ""}`}>
                        {src.category}
                      </span>
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                      {src.name}
                      {!isInternal && <ExternalLink className="w-3 h-3 opacity-40" />}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{src.description}</p>
                  </div>
                </div>
              );
              return isInternal ? (
                <Link key={src.id} href={src.url}>{content}</Link>
              ) : (
                <a key={src.id} href={src.url} target="_blank" rel="noopener noreferrer">{content}</a>
              );
            })}
          </div>
        </section>

        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                TTO Index
              </h2>
              {!isLoading && (
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{summary.active} Active</span>
                  <span className="mx-1.5 text-border">·</span>
                  <span className="text-primary font-semibold">{summary.indexed} Indexed</span>
                  <span className="mx-1.5 text-border">·</span>
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">{summary.restricted} Restricted</span>
                  <span className="mx-1.5 text-border">·</span>
                  <span className="text-muted-foreground font-semibold">{summary.empty} Empty</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={ttoSearch}
                onChange={(e) => setTtoSearch(e.target.value)}
                placeholder="Filter institutions…"
                className="h-7 text-xs px-3 rounded-md border border-card-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 w-48"
                data-testid="input-tto-search"
              />
            </div>
          </div>

          <div className="rounded-lg border border-card-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left">
                    <button
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground"
                      onClick={() => toggleSort("name")}
                      data-testid="sort-name"
                    >
                      Institution
                      <ArrowUpDown className={`w-3 h-3 ${sortKey === "name" ? "text-primary" : ""}`} />
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left hidden md:table-cell">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">City</span>
                  </th>
                  <th className="px-4 py-2.5 text-left hidden lg:table-cell">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">TTO Office</span>
                  </th>
                  <th className="px-4 py-2.5 text-left">
                    <button
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground"
                      onClick={() => toggleSort("status")}
                      data-testid="sort-status"
                    >
                      Status
                      <ArrowUpDown className={`w-3 h-3 ${sortKey === "status" ? "text-primary" : ""}`} />
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-right">
                    <button
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground ml-auto"
                      onClick={() => toggleSort("count")}
                      data-testid="sort-count"
                    >
                      Assets
                      <ArrowUpDown className={`w-3 h-3 ${sortKey === "count" ? "text-primary" : ""}`} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-card-border/50">
                        <td className="px-4 py-3" colSpan={5}>
                          <Skeleton className="h-4 w-full" />
                        </td>
                      </tr>
                    ))
                  : ttos.map((tto) => {
                      const sc = STATUS_CONFIG[tto.status];
                      const isRestricted = tto.status === "restricted";
                      return (
                        <tr
                          key={tto.slug}
                          className="border-b border-card-border/50 last:border-0 hover:bg-muted/20 transition-colors group"
                          data-testid={`tto-row-${tto.slug}`}
                        >
                          <td className="px-4 py-3">
                            <Link href={`/institutions/${tto.slug}`}>
                              <span className="font-medium text-foreground group-hover:text-primary transition-colors cursor-pointer text-sm">
                                {tto.name}
                              </span>
                            </Link>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                            {tto.city}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground truncate max-w-[200px]">
                            {tto.ttoName}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {isRestricted && <ShieldOff className="w-3 h-3 text-amber-500 shrink-0" />}
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${sc.color}`}>
                                {sc.label}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold tabular-nums text-foreground">
                              {tto.count > 0 ? tto.count.toLocaleString() : "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>

            {!isLoading && ttos.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No institutions match &ldquo;{ttoSearch}&rdquo;
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
