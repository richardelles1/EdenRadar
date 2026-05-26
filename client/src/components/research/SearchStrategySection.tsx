import { useState, useRef } from "react";
import { Plus, X, Save, Loader2, Database, Search, Zap, Upload, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { ResearchProject } from "@shared/schema";

type ScreeningPaper = {
  id: string; title: string; authors: string; year: string; abstract: string;
  url: string; source: string; doi: string; aiScore: number | null;
  abstractDecision: "include" | "exclude" | "maybe" | null; abstractRationale: string;
  fullTextDecision: "include" | "exclude" | null; fullTextRationale: string; fullTextUrl: string;
  reviewer2AbstractDecision: "include" | "exclude" | "maybe" | null; reviewer2AbstractRationale: string;
  reviewer2FullTextDecision: "include" | "exclude" | null; reviewer2FullTextRationale: string;
};

type SearchRun = {
  id: string;
  query: string;
  sources: string[];
  resultCount: number;
  importedCount: number;
  dupeCount: number;
  date: string;
};

type SearchData = {
  databases: string[];
  searchStrings: Array<{ database: string; query: string; date: string; count: number }>;
  dateFrom: string; dateTo: string; filters: string[]; notes: string;
  searchRuns?: SearchRun[];
};

type SourceDef = { key: string; label: string; desc: string };
type SourceGroup = { id: string; label: string; sources: SourceDef[] };

const SOURCE_GROUPS: SourceGroup[] = [
  {
    id: "literature", label: "Literature Databases",
    sources: [
      { key: "pubmed",           label: "PubMed / MEDLINE",    desc: "Biomedical literature" },
      { key: "openalex",         label: "OpenAlex",            desc: "Open academic publications" },
      { key: "semantic_scholar", label: "Semantic Scholar",    desc: "AI-powered research papers" },
      { key: "europepmc",        label: "Europe PMC",          desc: "European biomedical literature" },
      { key: "ieee",             label: "IEEE Xplore",         desc: "Engineering & biomedical" },
      { key: "core",             label: "CORE",                desc: "Open access research" },
      { key: "base",             label: "BASE",                desc: "Academic search engine" },
      { key: "doaj",             label: "DOAJ",                desc: "Open access journals" },
      { key: "openaire",         label: "OpenAIRE",            desc: "European open research" },
      { key: "hal",              label: "HAL",                 desc: "French academic repository" },
      { key: "eric",             label: "ERIC",                desc: "Education research" },
    ],
  },
  {
    id: "preprints", label: "Preprint Servers",
    sources: [
      { key: "biorxiv",    label: "bioRxiv",    desc: "Biology preprints" },
      { key: "medrxiv",    label: "medRxiv",    desc: "Clinical preprints" },
      { key: "arxiv",      label: "arXiv",      desc: "Physics & biology preprints" },
      { key: "chemrxiv",   label: "ChemRxiv",   desc: "Chemistry preprints" },
      { key: "socarxiv",   label: "SocArXiv",   desc: "Social science" },
      { key: "psyarxiv",   label: "PsyArXiv",   desc: "Psychology" },
      { key: "eartharxiv", label: "EarthArXiv", desc: "Earth science" },
      { key: "engrxiv",    label: "EngrXiv",    desc: "Engineering" },
    ],
  },
  {
    id: "trials", label: "Trials & Grants",
    sources: [
      { key: "clinicaltrials",    label: "ClinicalTrials.gov", desc: "US clinical trial registry" },
      { key: "eu_clinicaltrials", label: "EU Clinical Trials", desc: "EU trial registry" },
      { key: "isrctn",            label: "ISRCTN",             desc: "UK clinical trial registry" },
      { key: "nih_reporter",      label: "NIH Reporter",       desc: "Federal grants" },
      { key: "nsf_awards",        label: "NSF Awards",         desc: "National Science Foundation" },
      { key: "grants_gov",        label: "Grants.gov",         desc: "Federal grant database" },
      { key: "eu_cordis",         label: "EU Cordis",          desc: "EU research programs" },
    ],
  },
  {
    id: "data", label: "Data & Repositories",
    sources: [
      { key: "zenodo",     label: "Zenodo",     desc: "Open research data" },
      { key: "figshare",   label: "Figshare",   desc: "Research data & figures" },
      { key: "dryad",      label: "Dryad",      desc: "Scientific data" },
      { key: "geo",        label: "GEO",        desc: "Genomics expression data" },
      { key: "pdb",        label: "PDB",        desc: "Protein structures" },
      { key: "biostudies", label: "BioStudies", desc: "Biological study data" },
    ],
  },
  {
    id: "specialist", label: "Specialist & Patents",
    sources: [
      { key: "lens",         label: "Lens.org",            desc: "Patents + literature" },
      { key: "harvard",      label: "Harvard LibraryCloud", desc: "Harvard library catalog" },
      { key: "techtransfer", label: "Tech Transfer",       desc: "TTO licensing database" },
    ],
  },
];

const MANUAL_DATABASES = [
  "Embase", "Cochrane Library", "Web of Science",
  "Scopus", "CINAHL", "PsycINFO", "WHO ICTRP", "Google Scholar",
];

const ALL_KEYED = SOURCE_GROUPS.flatMap((g) => g.sources);
const KEY_LOOKUP: Record<string, SourceDef> = Object.fromEntries(ALL_KEYED.map((s) => [s.key, s]));
const LABEL_TO_KEY: Record<string, string> = Object.fromEntries(ALL_KEYED.map((s) => [s.label, s.key]));

const FILTER_OPTIONS = [
  "English only", "Peer-reviewed only", "Humans only",
  "Adults only", "Date restricted", "Full text available", "Open access only",
];

const EMPTY_SEARCH: SearchData = {
  databases: [], searchStrings: [], dateFrom: "", dateTo: "", filters: [], notes: "", searchRuns: [],
};

function normalizeKey(p: { doi?: string; title: string }): string {
  if (p.doi?.trim()) return `doi:${p.doi.toLowerCase().trim()}`;
  return `title:${p.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60)}`;
}

function deduplicatePapers(existing: ScreeningPaper[], incoming: ScreeningPaper[]): { added: ScreeningPaper[]; dupes: number } {
  const seen = new Set(existing.map(normalizeKey));
  const added: ScreeningPaper[] = [];
  let dupes = 0;
  for (const p of incoming) {
    const k = normalizeKey(p);
    if (seen.has(k)) { dupes++; continue; }
    seen.add(k);
    added.push(p);
  }
  return { added, dupes };
}

interface Props {
  project: ResearchProject;
  onSave: (label: string, data: Partial<ResearchProject>) => Promise<void>;
  saving: string | null;
  headers?: Record<string, string>;
}

export function SearchStrategySection({ project, onSave, saving, headers }: Props) {
  const { toast } = useToast();
  const stored = project.searchStrategy as SearchData | null;
  const [data, setData] = useState<SearchData>(stored ?? EMPTY_SEARCH);
  const [newString, setNewString] = useState({ database: "", query: "", date: new Date().toISOString().slice(0, 10), count: "" });
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [runningSearch, setRunningSearch] = useState(false);
  const [lastImport, setLastImport] = useState<{ count: number; dupes: number } | null>(null);
  const [scoutQuery, setScoutQuery] = useState((project as any).primaryResearchQuestion ?? "");

  const allSelectedKeys = data.databases.flatMap((db) => LABEL_TO_KEY[db] ? [LABEL_TO_KEY[db]] : []);
  const totalSources = data.databases.length;

  function toggleDb(label: string) {
    setData((d) => ({
      ...d,
      databases: d.databases.includes(label)
        ? d.databases.filter((x) => x !== label)
        : [...d.databases, label],
    }));
  }

  function toggleGroup(id: string) {
    setCollapsedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleFilter(f: string) {
    setData((d) => ({
      ...d,
      filters: d.filters.includes(f) ? d.filters.filter((x) => x !== f) : [...d.filters, f],
    }));
  }

  function addSearchString() {
    if (!newString.database || !newString.query) return;
    setData((d) => ({
      ...d,
      searchStrings: [...d.searchStrings, {
        database: newString.database, query: newString.query,
        date: newString.date, count: parseInt(newString.count) || 0,
      }],
    }));
    setNewString((s) => ({ ...s, query: "", count: "" }));
  }

  function removeSearchString(i: number) {
    setData((d) => ({ ...d, searchStrings: d.searchStrings.filter((_, j) => j !== i) }));
  }

  async function runSearch() {
    const q = scoutQuery.trim();
    if (!q) { toast({ title: "Enter a search query first", variant: "destructive" }); return; }
    const sources = allSelectedKeys.length > 0 ? allSelectedKeys : ["pubmed", "openalex", "semantic_scholar"];
    setRunningSearch(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(headers ?? {}) },
        body: JSON.stringify({ query: q, sources, maxPerSource: 25 }),
      });
      if (!res.ok) throw new Error("Search failed");
      const { assets } = await res.json();
      const incoming: ScreeningPaper[] = (assets ?? []).map((a: any) => ({
        id: crypto.randomUUID(),
        title: a.name ?? "",
        authors: a.signals?.[0]?.authors_or_owner ?? "",
        year: (a.latest_signal_date ?? a.signals?.[0]?.publication_date ?? "").slice(0, 4),
        abstract: a.summary ?? "",
        url: a.signals?.[0]?.source_url ?? "",
        doi: "",
        source: KEY_LOOKUP[a.source]?.label ?? a.source ?? "",
        aiScore: typeof a.fitScore === "number" ? a.fitScore : null,
        abstractDecision: null, abstractRationale: "",
        fullTextDecision: null, fullTextRationale: "", fullTextUrl: "",
        reviewer2AbstractDecision: null, reviewer2AbstractRationale: "",
        reviewer2FullTextDecision: null, reviewer2FullTextRationale: "",
      }));
      const existing = ((project.screeningPapers as ScreeningPaper[] | null) ?? []);
      const { added, dupes } = deduplicatePapers(existing, incoming);

      // Record this search run in history
      const run: SearchRun = {
        id: crypto.randomUUID(),
        query: q,
        sources,
        resultCount: incoming.length,
        importedCount: added.length,
        dupeCount: dupes,
        date: new Date().toISOString(),
      };
      const nextData: SearchData = { ...data, searchRuns: [...(data.searchRuns ?? []), run] };
      setData(nextData);

      await onSave("Search Strategy", {
        searchStrategy: nextData as any,
        screeningPapers: [...existing, ...added] as any,
      });
      setLastImport({ count: added.length, dupes });
      toast({ title: `Imported ${added.length} papers${dupes > 0 ? ` · ${dupes} duplicates skipped` : ""}`, description: "Switch to §5 Screening to review" });
    } catch {
      toast({ title: "Search failed", variant: "destructive" });
    } finally {
      setRunningSearch(false);
    }
  }

  const totalResults = data.searchStrings.reduce((s, r) => s + (r.count || 0), 0);

  return (
    <div className="space-y-6">
      {/* Source groups */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Databases Searched
          </label>
          {totalSources > 0 && (
            <span className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 tabular-nums">
              {totalSources} selected
            </span>
          )}
        </div>

        {/* Scout-integrated sources */}
        {SOURCE_GROUPS.map((group) => {
          const active = group.sources.filter((s) => data.databases.includes(s.label));
          const collapsed = collapsedGroups[group.id];
          return (
            <div key={group.id} className="border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleGroup(group.id)}
                className="w-full flex items-center justify-between px-3 py-2 bg-muted/20 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {collapsed ? <ChevronRight className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                  <span className="text-[11px] font-semibold text-foreground">{group.label}</span>
                  <span className="text-[9px] text-muted-foreground">· {group.sources.length} sources</span>
                </div>
                {active.length > 0 && (
                  <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded-full">
                    {active.length} active
                  </span>
                )}
              </button>
              {!collapsed && (
                <div className="p-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {group.sources.map((src) => {
                    const on = data.databases.includes(src.label);
                    return (
                      <label
                        key={src.key}
                        className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-all ${
                          on ? "border-sky-500/30 bg-sky-500/8" : "border-border/50 hover:border-sky-500/20 hover:bg-muted/30"
                        }`}
                        data-testid={`db-${src.key}`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleDb(src.label)}
                          className="mt-0.5 accent-sky-500 w-3 h-3 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className={`text-[10px] font-semibold leading-tight truncate ${on ? "text-sky-700 dark:text-sky-300" : "text-foreground"}`}>
                            {src.label}
                          </p>
                          <p className="text-[9px] text-muted-foreground leading-tight mt-0.5 truncate">{src.desc}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Manual databases */}
        <div className="border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => toggleGroup("manual")}
            className="w-full flex items-center justify-between px-3 py-2 bg-muted/20 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              {collapsedGroups["manual"] ? <ChevronRight className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
              <span className="text-[11px] font-semibold text-foreground">Commercial / Manual Databases</span>
              <span className="text-[9px] text-muted-foreground">· document results manually</span>
            </div>
          </button>
          {!collapsedGroups["manual"] && (
            <div className="p-2 flex flex-wrap gap-1.5">
              {MANUAL_DATABASES.map((db) => {
                const on = data.databases.includes(db);
                return (
                  <button
                    key={db}
                    onClick={() => toggleDb(db)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                      on
                        ? "bg-violet-600/10 border-violet-500/40 text-violet-600 dark:text-violet-400"
                        : "border-border text-muted-foreground hover:border-violet-500/30 hover:text-foreground"
                    }`}
                  >
                    {db}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Search From</label>
          <Input type="date" value={data.dateFrom} onChange={(e) => setData((d) => ({ ...d, dateFrom: e.target.value }))} className="text-xs" data-testid="input-date-from" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Search To</label>
          <Input type="date" value={data.dateTo} onChange={(e) => setData((d) => ({ ...d, dateTo: e.target.value }))} className="text-xs" data-testid="input-date-to" />
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Limits & Filters</label>
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((f) => {
            const active = data.filters.includes(f);
            return (
              <button key={f} onClick={() => toggleFilter(f)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  active ? "bg-violet-600/10 border-violet-500/40 text-violet-600 dark:text-violet-400"
                  : "border-border text-muted-foreground hover:border-violet-500/30 hover:text-foreground"
                }`}>
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {/* Formal search strings */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Search Strings & Results</label>
          {totalResults > 0 && (
            <span className="text-[10px] font-semibold tabular-nums text-violet-600 dark:text-violet-400">
              {totalResults.toLocaleString()} total records
            </span>
          )}
        </div>
        {data.searchStrings.length > 0 && (
          <div className="border border-border rounded-md overflow-x-auto">
            <table className="w-full text-xs min-w-[500px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Database</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Search String</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-24">Date</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-20">Results</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {data.searchStrings.map((s, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{s.database}</td>
                    <td className="px-3 py-2 text-muted-foreground font-mono text-[10px] max-w-[280px]">
                      <span className="block truncate">{s.query}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{s.date}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">{s.count.toLocaleString()}</td>
                    <td className="px-2 py-2">
                      <button onClick={() => removeSearchString(i)} className="text-muted-foreground hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border border-dashed border-border rounded-md p-3 space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Add Search String</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={newString.database}
              onChange={(e) => setNewString((s) => ({ ...s, database: e.target.value }))}
              className="text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
              data-testid="select-search-db"
            >
              <option value="">Select database...</option>
              {[...ALL_KEYED.map((s) => s.label), ...MANUAL_DATABASES].map((db) => (
                <option key={db} value={db}>{db}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <Input type="date" value={newString.date} onChange={(e) => setNewString((s) => ({ ...s, date: e.target.value }))} className="text-xs w-32 shrink-0" />
              <Input type="number" value={newString.count} onChange={(e) => setNewString((s) => ({ ...s, count: e.target.value }))} placeholder="# results" className="text-xs flex-1" data-testid="input-search-count" />
            </div>
          </div>
          <div className="flex gap-2">
            <Textarea
              value={newString.query}
              onChange={(e) => setNewString((s) => ({ ...s, query: e.target.value }))}
              rows={3}
              className="resize-none text-xs font-mono flex-1"
              placeholder='("cancer" OR "neoplasm") AND ("drug therapy") AND ("clinical trial"[pt])'
              data-testid="input-search-query"
            />
            <Button variant="outline" size="sm" onClick={addSearchString} disabled={!newString.database || !newString.query} className="self-end px-2">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Search Notes</label>
        <Textarea
          value={data.notes}
          onChange={(e) => setData((d) => ({ ...d, notes: e.target.value }))}
          rows={3}
          className="resize-none text-xs"
          placeholder="Describe any hand-searching, reference list checking, or contact with experts..."
          data-testid="input-search-notes"
        />
      </div>

      {/* Scout Intelligence panel */}
      <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-sky-500 shrink-0" />
          <span className="text-xs font-bold text-sky-700 dark:text-sky-300">Scout Intelligence — Live Search</span>
          <span className="text-[10px] text-sky-600/70 dark:text-sky-400/70">
            · {allSelectedKeys.length > 0 ? `${allSelectedKeys.length} source${allSelectedKeys.length !== 1 ? "s" : ""} active` : "defaults to PubMed, OpenAlex, Semantic Scholar"}
          </span>
        </div>
        <p className="text-[11px] text-sky-800/70 dark:text-sky-200/60 leading-relaxed">
          Run a live search across your selected databases and import results directly into your screening queue. Duplicates are automatically removed.
        </p>
        <div className="flex gap-2">
          <Input
            value={scoutQuery}
            onChange={(e) => setScoutQuery(e.target.value)}
            placeholder="Enter keywords or your research question..."
            className="text-xs flex-1 bg-background border-sky-500/30 focus:border-sky-500/60"
            data-testid="input-scout-query"
            onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
          />
          <Button
            size="sm"
            className="gap-1.5 bg-sky-600 hover:bg-sky-700 text-white shrink-0"
            onClick={runSearch}
            disabled={runningSearch || !scoutQuery.trim()}
            data-testid="button-run-search"
          >
            {runningSearch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            {runningSearch ? "Searching…" : "Run Search"}
          </Button>
        </div>
        {lastImport && (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
              Imported {lastImport.count} papers{lastImport.dupes > 0 ? `, ${lastImport.dupes} duplicate${lastImport.dupes !== 1 ? "s" : ""} skipped` : ""} → switch to §5 Screening to review
            </p>
          </div>
        )}
      </div>

      {/* Search Run History (Bugs #4 / #10) */}
      {(data.searchRuns ?? []).length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex-1">
              Search Run History
            </label>
            <span className="text-[10px] font-semibold tabular-nums text-violet-600 dark:text-violet-400">
              {(data.searchRuns ?? []).length} run{(data.searchRuns ?? []).length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="border border-border rounded-md overflow-x-auto">
            <table className="w-full text-xs min-w-[500px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-28">Date</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Query</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-20">Retrieved</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-20">Imported</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-16">Dupes</th>
                </tr>
              </thead>
              <tbody>
                {[...(data.searchRuns ?? [])].reverse().map((run) => (
                  <tr key={run.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap tabular-nums text-[10px]">
                      {new Date(run.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                    </td>
                    <td className="px-3 py-2 text-foreground font-mono text-[10px] max-w-[240px]">
                      <span className="block truncate" title={run.query}>{run.query}</span>
                      <span className="text-muted-foreground text-[9px]">{run.sources.slice(0, 3).join(", ")}{run.sources.length > 3 ? ` +${run.sources.length - 3}` : ""}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{run.resultCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{run.importedCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{run.dupeCount > 0 ? run.dupeCount : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[9px] text-muted-foreground">
            This log serves as your PROSPERO-compliant search audit trail — dates, queries, and import counts are preserved.
          </p>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => onSave("Search Strategy", { searchStrategy: data as any })} disabled={!!saving} data-testid="button-save-search-strategy">
          {saving === "Search Strategy" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Strategy
        </Button>
      </div>
    </div>
  );
}
