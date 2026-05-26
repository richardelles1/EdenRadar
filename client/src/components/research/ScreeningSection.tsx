import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, X, Save, Loader2, ChevronRight, ChevronLeft,
  CheckCircle2, XCircle, HelpCircle, ArrowRight, FileText,
  Upload, Download, Zap, Users, AlertCircle, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { ResearchProject } from "@shared/schema";

export type ScreeningPaper = {
  id: string; title: string; authors: string; year: string;
  abstract: string; url: string; source: string; doi: string;
  aiScore: number | null;
  abstractDecision: "include" | "exclude" | "maybe" | null;
  abstractRationale: string;
  fullTextDecision: "include" | "exclude" | null;
  fullTextRationale: string; fullTextUrl: string;
  reviewer2AbstractDecision: "include" | "exclude" | "maybe" | null;
  reviewer2AbstractRationale: string;
  reviewer2FullTextDecision: "include" | "exclude" | null;
  reviewer2FullTextRationale: string;
};

type Phase = "abstract" | "fulltext";
type ReviewerMode = "solo" | "reviewer2";

const EMPTY_PAPER: Omit<ScreeningPaper, "id"> = {
  title: "", authors: "", year: "", abstract: "", url: "",
  source: "", doi: "", aiScore: null,
  abstractDecision: null, abstractRationale: "",
  fullTextDecision: null, fullTextRationale: "", fullTextUrl: "",
  reviewer2AbstractDecision: null, reviewer2AbstractRationale: "",
  reviewer2FullTextDecision: null, reviewer2FullTextRationale: "",
};

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseRIS(text: string): ScreeningPaper[] {
  const records: ScreeningPaper[] = [];
  const blocks = text.split(/\nER\s*-/).filter((b) => b.trim());
  for (const block of blocks) {
    const fields: Record<string, string[]> = {};
    for (const line of block.split("\n")) {
      const m = line.match(/^([A-Z][A-Z0-9])\s+-\s+(.*)/);
      if (m) fields[m[1]] = [...(fields[m[1]] ?? []), m[2].trim()];
    }
    const title = (fields["TI"] ?? fields["T1"] ?? [])[0];
    if (!title) continue;
    records.push({
      ...EMPTY_PAPER,
      id: crypto.randomUUID(),
      title,
      authors: (fields["AU"] ?? []).join("; "),
      year: ((fields["PY"] ?? fields["Y1"] ?? [])[0] ?? "").slice(0, 4),
      abstract: (fields["AB"] ?? fields["N2"] ?? [])[0] ?? "",
      doi: (fields["DO"] ?? [])[0] ?? "",
      url: (fields["UR"] ?? fields["L1"] ?? [])[0] ?? "",
      source: (fields["DB"] ?? fields["DP"] ?? [])[0] ?? "",
    });
  }
  return records;
}

function parseBibTeX(text: string): ScreeningPaper[] {
  const records: ScreeningPaper[] = [];
  const entryRe = /@\w+\{[^,]+,([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(text)) !== null) {
    const body = m[1];
    const get = (f: string) => {
      const r = body.match(new RegExp(`\\b${f}\\s*=\\s*[{"](.*?)[}"]`, "si"));
      return r ? r[1].trim() : "";
    };
    const title = get("title") || get("Title");
    if (!title) continue;
    records.push({
      ...EMPTY_PAPER,
      id: crypto.randomUUID(),
      title,
      authors: get("author") || get("Author"),
      year: get("year") || get("Year"),
      abstract: get("abstract"),
      doi: get("doi") || get("DOI"),
      url: get("url") || get("URL"),
      source: get("journal") || get("booktitle") || "",
    });
  }
  return records;
}

function parseCSV(text: string): ScreeningPaper[] {
  const lines = text.split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const vals = (line.match(/("(?:[^"\\]|\\.)*"|[^,]*)/g) ?? []).map((v) => v.replace(/^"|"$/g, "").trim());
    const g = (...keys: string[]) => { for (const k of keys) { const i = headers.indexOf(k); if (i >= 0 && vals[i]) return vals[i]; } return ""; };
    return { ...EMPTY_PAPER, id: crypto.randomUUID(), title: g("title"), authors: g("authors", "author"), year: g("year", "date"), abstract: g("abstract"), doi: g("doi"), url: g("url", "link"), source: g("source", "database", "journal") };
  }).filter((p) => p.title);
}

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

// ── PRISMA SVG export ─────────────────────────────────────────────────────────

function buildPrismaSVG(stats: { identified: number; screened: number; excludedAbstract: number; fullText: number; excludedFullText: number; included: number }): string {
  const W = 760; const H = 340;
  const box = (x: number, y: number, w: number, h: number, label: string, n: number, color: string, textColor: string) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${color}" stroke="#e2e8f0" stroke-width="1.5"/>
     <text x="${x + w / 2}" y="${y + h / 2 - 8}" text-anchor="middle" font-size="22" font-weight="700" font-family="system-ui" fill="${textColor}">${n}</text>
     <text x="${x + w / 2}" y="${y + h / 2 + 12}" text-anchor="middle" font-size="10" font-weight="600" font-family="system-ui" fill="${textColor}" text-transform="uppercase">${label}</text>`;
  const arrow = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arrow)"/>`;
  const sideBox = (x: number, y: number, label: string, n: number) =>
    `<rect x="${x}" y="${y}" width="120" height="52" rx="6" fill="#fef2f2" stroke="#fca5a5" stroke-width="1.5"/>
     <text x="${x + 60}" y="${y + 22}" text-anchor="middle" font-size="16" font-weight="700" font-family="system-ui" fill="#dc2626">${n}</text>
     <text x="${x + 60}" y="${y + 38}" text-anchor="middle" font-size="9" font-weight="600" font-family="system-ui" fill="#ef4444">${label}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#94a3b8"/></marker></defs>
  <rect width="${W}" height="${H}" fill="white"/>
  <text x="${W / 2}" y="24" text-anchor="middle" font-size="13" font-weight="700" font-family="system-ui" fill="#475569" letter-spacing="2">PRISMA FLOW DIAGRAM</text>
  ${box(20, 50, 130, 70, "Identified", stats.identified, "#f0f9ff", "#0369a1")}
  ${arrow(150, 85, 200, 85)}
  ${box(200, 50, 130, 70, "Screened", stats.screened, "#fffbeb", "#b45309")}
  ${arrow(265, 120, 265, 160)}
  ${sideBox(300, 140, "Excl. abstract", stats.excludedAbstract)}
  ${arrow(330, 85, 380, 85)}
  ${box(380, 50, 140, 70, "Full-text assessed", stats.fullText, "#f5f3ff", "#6d28d9")}
  ${arrow(450, 120, 450, 160)}
  ${sideBox(490, 140, "Excl. full-text", stats.excludedFullText)}
  ${arrow(520, 85, 590, 85)}
  ${box(590, 50, 130, 70, "Included", stats.included, "#f0fdf4", "#166534")}
</svg>`;
}

function exportPrismaSVG(papers: ScreeningPaper[]) {
  const identified = papers.length;
  const screened = papers.filter((p) => p.abstractDecision !== null).length;
  const excludedAbstract = papers.filter((p) => p.abstractDecision === "exclude").length;
  const fullText = papers.filter((p) => p.abstractDecision === "include" || p.abstractDecision === "maybe").length;
  const excludedFullText = papers.filter((p) => p.fullTextDecision === "exclude").length;
  const included = papers.filter((p) => p.fullTextDecision === "include").length;
  const svg = buildPrismaSVG({ identified, screened, excludedAbstract, fullText, excludedFullText, included });
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "prisma-flow.svg";
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── RIS citation export ───────────────────────────────────────────────────────

function exportRIS(papers: ScreeningPaper[]) {
  const included = papers.filter((p) => p.fullTextDecision === "include");
  const lines = included.flatMap((p) => [
    "TY  - JOUR",
    `TI  - ${p.title}`,
    ...p.authors.split(/[;,]/).map((a) => `AU  - ${a.trim()}`).filter((a) => a !== "AU  - "),
    p.year ? `PY  - ${p.year}` : null,
    p.abstract ? `AB  - ${p.abstract}` : null,
    p.doi ? `DO  - ${p.doi}` : null,
    p.url ? `UR  - ${p.url}` : null,
    p.source ? `DP  - ${p.source}` : null,
    "ER  -", "",
  ].filter(Boolean) as string[]);
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "included-papers.ris";
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── PRISMA flow UI ────────────────────────────────────────────────────────────

function PrismaFlow({ papers, onExport }: { papers: ScreeningPaper[]; onExport: () => void }) {
  const identified = papers.length;
  const screened = papers.filter((p) => p.abstractDecision !== null).length;
  const excludedAbstract = papers.filter((p) => p.abstractDecision === "exclude").length;
  const fullText = papers.filter((p) => p.abstractDecision === "include" || p.abstractDecision === "maybe").length;
  const excludedFullText = papers.filter((p) => p.fullTextDecision === "exclude").length;
  const included = papers.filter((p) => p.fullTextDecision === "include").length;

  const mainBox = (label: string, n: number, color: string) => (
    <div className={`rounded-lg border-2 p-3 text-center min-w-[100px] flex-1 ${color}`}>
      <p className="text-xl font-bold tabular-nums">{n}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide mt-0.5 leading-tight">{label}</p>
    </div>
  );
  const sideBox = (label: string, n: number) => (
    <div className="rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-center min-w-[90px]">
      <p className="text-base font-bold tabular-nums text-red-600 dark:text-red-400">{n}</p>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-red-500/80 leading-tight">{label}</p>
    </div>
  );
  const arrow = () => <div className="flex items-center shrink-0"><ArrowRight className="w-4 h-4 text-muted-foreground" /></div>;

  return (
    <div className="p-4 rounded-xl border border-border bg-muted/20">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">PRISMA Flow</p>
        {papers.length > 0 && (
          <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 px-2" onClick={onExport}>
            <Download className="w-3 h-3" /> Export SVG
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="flex items-center gap-1 min-w-[480px]">
          {mainBox("Identified", identified, "border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300")}
          {arrow()}
          <div className="flex flex-col items-center gap-1">
            {mainBox("Screened", screened, "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300")}
            <div className="w-px h-2 bg-border" />
            {sideBox("Excl. abstract", excludedAbstract)}
          </div>
          {arrow()}
          <div className="flex flex-col items-center gap-1">
            {mainBox("Full-text", fullText, "border-violet-500/30 bg-violet-500/5 text-violet-700 dark:text-violet-300")}
            <div className="w-px h-2 bg-border" />
            {sideBox("Excl. full-text", excludedFullText)}
          </div>
          {arrow()}
          {mainBox("Included", included, "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300")}
        </div>
      </div>
    </div>
  );
}

// ── Add paper form ────────────────────────────────────────────────────────────

function AddPaperForm({ onAdd }: { onAdd: (p: ScreeningPaper) => void }) {
  const [form, setForm] = useState({ ...EMPTY_PAPER });
  const [open, setOpen] = useState(false);
  function submit() {
    if (!form.title.trim()) return;
    onAdd({ ...form, id: crypto.randomUUID() });
    setForm({ ...EMPTY_PAPER }); setOpen(false);
  }
  if (!open) return (
    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setOpen(true)} data-testid="button-add-paper">
      <Plus className="w-3.5 h-3.5" /> Add Paper Manually
    </Button>
  );
  return (
    <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Add Paper</p>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>
      <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Paper title *" className="text-xs" data-testid="input-paper-title" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Input value={form.authors} onChange={(e) => setForm((f) => ({ ...f, authors: e.target.value }))} placeholder="Authors" className="text-xs col-span-2" />
        <Input value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} placeholder="Year" className="text-xs" />
        <Input value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} placeholder="Source / DB" className="text-xs" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input value={form.doi} onChange={(e) => setForm((f) => ({ ...f, doi: e.target.value }))} placeholder="DOI" className="text-xs" />
        <Input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="URL" className="text-xs" />
      </div>
      <Textarea value={form.abstract} onChange={(e) => setForm((f) => ({ ...f, abstract: e.target.value }))} rows={4} className="resize-none text-xs" placeholder="Paste abstract..." data-testid="input-paper-abstract" />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" onClick={submit} disabled={!form.title.trim()}>Add Paper</Button>
      </div>
    </div>
  );
}

// ── Conflict badge ────────────────────────────────────────────────────────────

function hasConflict(p: ScreeningPaper, phase: Phase): boolean {
  if (phase === "abstract") {
    return p.abstractDecision !== null && p.reviewer2AbstractDecision !== null &&
      p.abstractDecision !== p.reviewer2AbstractDecision;
  }
  return p.fullTextDecision !== null && p.reviewer2FullTextDecision !== null &&
    p.fullTextDecision !== p.reviewer2FullTextDecision;
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  project: ResearchProject;
  onSave: (label: string, data: Partial<ResearchProject>) => Promise<void>;
  saving: string | null;
  headers?: Record<string, string>;
}

export function ScreeningSection({ project, onSave, saving, headers }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stored = (project.screeningPapers as ScreeningPaper[] | null) ?? [];
  const [papers, setPapers] = useState<ScreeningPaper[]>(stored);
  const [phase, setPhase] = useState<Phase>("abstract");
  const [reviewerMode, setReviewerMode] = useState<ReviewerMode>("solo");
  const [activeIdx, setActiveIdx] = useState(0);
  const [scoring, setScoring] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const isR2 = reviewerMode === "reviewer2";

  const abstractQueue = papers.filter((p) => (isR2 ? p.reviewer2AbstractDecision === null : p.abstractDecision === null));
  const abstractDone = papers.filter((p) => (isR2 ? p.reviewer2AbstractDecision !== null : p.abstractDecision !== null));
  const fulltextQueue = papers.filter((p) =>
    (p.abstractDecision === "include" || p.abstractDecision === "maybe") &&
    (isR2 ? p.reviewer2FullTextDecision === null : p.fullTextDecision === null)
  );
  const fulltextDone = papers.filter((p) =>
    (p.abstractDecision === "include" || p.abstractDecision === "maybe") &&
    (isR2 ? p.reviewer2FullTextDecision !== null : p.fullTextDecision !== null)
  );
  const conflicts = papers.filter((p) => hasConflict(p, phase));

  const queue = phase === "abstract" ? abstractQueue : fulltextQueue;
  const activePaper = queue[activeIdx] ?? null;

  useEffect(() => { setActiveIdx(0); }, [phase, reviewerMode]);

  function updatePaper(id: string, updates: Partial<ScreeningPaper>) {
    setPapers((prev) => prev.map((p) => p.id === id ? { ...p, ...updates } : p));
  }

  function savePapers(next: ScreeningPaper[]) {
    onSave("Screening", { screeningPapers: next as any });
  }

  function decide(decision: "include" | "exclude" | "maybe") {
    if (!activePaper) return;
    let updates: Partial<ScreeningPaper>;
    if (isR2) {
      updates = phase === "abstract"
        ? { reviewer2AbstractDecision: decision as any }
        : { reviewer2FullTextDecision: decision as "include" | "exclude" };
    } else {
      updates = phase === "abstract"
        ? { abstractDecision: decision as any }
        : { fullTextDecision: decision as "include" | "exclude" };
    }
    const next = papers.map((p) => p.id === activePaper.id ? { ...p, ...updates } : p);
    setPapers(next);
    setActiveIdx((i) => Math.min(i, queue.length - 2));
    savePapers(next);
  }

  function undoDecision(id: string) {
    let updates: Partial<ScreeningPaper>;
    if (isR2) {
      updates = phase === "abstract" ? { reviewer2AbstractDecision: null } : { reviewer2FullTextDecision: null };
    } else {
      updates = phase === "abstract" ? { abstractDecision: null } : { fullTextDecision: null };
    }
    const next = papers.map((p) => p.id === id ? { ...p, ...updates } : p);
    setPapers(next);
    savePapers(next);
  }

  function adjudicate(id: string, decision: "include" | "exclude") {
    const next = papers.map((p) => p.id === id
      ? phase === "abstract"
        ? { ...p, abstractDecision: decision as any, reviewer2AbstractDecision: decision as any }
        : { ...p, fullTextDecision: decision, reviewer2FullTextDecision: decision }
      : p
    );
    setPapers(next);
    savePapers(next);
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "i" || e.key === "I") decide("include");
    if (e.key === "e" || e.key === "E") decide("exclude");
    if (e.key === "m" || e.key === "M") phase === "abstract" && decide("maybe");
    if (e.key === "ArrowRight") setActiveIdx((i) => Math.min(i + 1, queue.length - 1));
    if (e.key === "ArrowLeft") setActiveIdx((i) => Math.max(i - 1, 0));
  }, [activePaper, phase, queue.length, reviewerMode]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const name = file.name.toLowerCase();
    let parsed: ScreeningPaper[] = [];
    if (name.endsWith(".ris")) parsed = parseRIS(text);
    else if (name.endsWith(".bib")) parsed = parseBibTeX(text);
    else if (name.endsWith(".csv")) parsed = parseCSV(text);
    else { toast({ title: "Unsupported file type. Use .ris, .bib, or .csv", variant: "destructive" }); return; }
    const { added, dupes } = deduplicatePapers(papers, parsed);
    const next = [...papers, ...added];
    setPapers(next);
    savePapers(next);
    setImportStatus(`Imported ${added.length} papers${dupes > 0 ? `, ${dupes} duplicates skipped` : ""}`);
    toast({ title: `Imported ${added.length} papers${dupes > 0 ? ` · ${dupes} dupes skipped` : ""}` });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function aiPrioritize() {
    const scoredCount = papers.filter((p) => p.aiScore !== null).length;
    if (scoredCount > 0) {
      const next = [...papers].sort((a, b) => {
        const sa = a.aiScore ?? -1; const sb = b.aiScore ?? -1;
        return sb - sa;
      });
      setPapers(next); savePapers(next);
      toast({ title: `Queue re-ranked by AI score (${scoredCount} scored papers)` });
      return;
    }
    const query = (project as any).primaryResearchQuestion ?? project.title ?? "";
    if (!query) { toast({ title: "Add a research question in §2 first", variant: "destructive" }); return; }
    setScoring(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(headers ?? {}) },
        body: JSON.stringify({ query, sources: ["pubmed", "openalex", "semantic_scholar"], maxPerSource: 50 }),
      });
      const { assets } = await res.json();
      const titleScores: Record<string, number> = {};
      for (const a of assets ?? []) {
        const key = (a.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
        if (key) titleScores[key] = a.fitScore ?? 50;
      }
      const scoreWord = (title: string) => {
        const key = title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
        if (titleScores[key]) return titleScores[key];
        const words = title.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
        let best = 0;
        for (const k of Object.keys(titleScores)) {
          const overlap = words.filter((w) => k.includes(w)).length / Math.max(words.length, 1);
          if (overlap > 0.4) best = Math.max(best, titleScores[k] * overlap);
        }
        return best || null;
      };
      const next = papers.map((p) => ({ ...p, aiScore: scoreWord(p.title) })).sort((a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1));
      setPapers(next); savePapers(next);
      toast({ title: `AI scored ${next.filter((p) => p.aiScore !== null).length} papers — queue re-ranked` });
    } catch {
      toast({ title: "AI scoring failed", variant: "destructive" });
    } finally { setScoring(false); }
  }

  const included = papers.filter((p) => p.fullTextDecision === "include");

  const decisionLabel = (d: string | null) => d === "include" ? "Include" : d === "exclude" ? "Exclude" : d === "maybe" ? "Maybe" : "—";
  const decisionColor = (d: string | null) =>
    d === "include" ? "text-emerald-600 dark:text-emerald-400" :
    d === "exclude" ? "text-red-500 dark:text-red-400" :
    d === "maybe" ? "text-amber-500 dark:text-amber-400" : "text-muted-foreground";

  return (
    <div className="space-y-4">
      <PrismaFlow papers={papers} onExport={() => exportPrismaSVG(papers)} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Import */}
        <input ref={fileInputRef} type="file" accept=".ris,.bib,.csv" className="hidden" onChange={handleFileImport} />
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-3.5 h-3.5" /> Import (RIS / BibTeX / CSV)
        </Button>

        {/* AI prioritize */}
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={aiPrioritize} disabled={scoring || papers.length === 0}>
          {scoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-500" />}
          AI Prioritize
        </Button>

        {/* Reviewer mode toggle */}
        <div className="flex items-center gap-1 p-0.5 rounded-md bg-muted/40 border border-border">
          {(["solo", "reviewer2"] as ReviewerMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setReviewerMode(m)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                reviewerMode === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "reviewer2" && <Users className="w-3 h-3" />}
              {m === "solo" ? "Solo Review" : "Reviewer 2"}
            </button>
          ))}
        </div>

        {/* Export */}
        {included.length > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5 text-xs ml-auto" onClick={() => exportRIS(papers)}>
            <Download className="w-3.5 h-3.5" /> Export RIS ({included.length})
          </Button>
        )}
      </div>

      {importStatus && (
        <div className="flex items-center gap-2 text-[11px] text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          {importStatus}
        </div>
      )}

      {/* Conflict panel (Reviewer 2 mode) */}
      {isR2 && conflicts.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
              {conflicts.length} screening conflict{conflicts.length !== 1 ? "s" : ""} — adjudication required
            </span>
          </div>
          <div className="space-y-1.5">
            {conflicts.map((p) => {
              const r1 = phase === "abstract" ? p.abstractDecision : p.fullTextDecision;
              const r2 = phase === "abstract" ? p.reviewer2AbstractDecision : p.reviewer2FullTextDecision;
              return (
                <div key={p.id} className="flex items-center gap-3 p-2 rounded-md bg-background border border-amber-500/15 text-xs flex-wrap">
                  <span className="flex-1 font-medium text-foreground truncate min-w-0">{p.title}</span>
                  <span className={`shrink-0 ${decisionColor(r1)}`}>R1: {decisionLabel(r1)}</span>
                  <span className={`shrink-0 ${decisionColor(r2)}`}>R2: {decisionLabel(r2)}</span>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" className="h-6 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => adjudicate(p.id, "include")}>Include</Button>
                    <Button size="sm" className="h-6 px-2 text-[10px] bg-red-600 hover:bg-red-700 text-white" onClick={() => adjudicate(p.id, "exclude")}>Exclude</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Phase tabs */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/40 w-fit">
        {(["abstract", "fulltext"] as Phase[]).map((p) => {
          const label = p === "abstract" ? "Abstract Screening" : "Full-text Review";
          const count = p === "abstract" ? abstractQueue.length : fulltextQueue.length;
          const done = p === "abstract" ? abstractDone.length : fulltextDone.length;
          return (
            <button key={p} onClick={() => setPhase(p)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                phase === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {count > 0 && <span className="bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums">{count}</span>}
              {done > 0 && count === 0 && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
            </button>
          );
        })}
      </div>

      {/* Screening panel */}
      {queue.length === 0 ? (
        <div className="rounded-xl border border-border bg-muted/10 p-8 text-center">
          {phase === "abstract" ? (
            papers.length === 0 ? (
              <>
                <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-semibold text-foreground mb-1">No papers added yet</p>
                <p className="text-xs text-muted-foreground mb-4">Use Scout Intelligence in §4 to search and import, or add manually / import a file above.</p>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-foreground mb-1">Abstract screening complete</p>
                <p className="text-xs text-muted-foreground">Switch to Full-text Review to continue.</p>
              </>
            )
          ) : (
            <>
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-foreground mb-1">Full-text review complete</p>
              <p className="text-xs text-muted-foreground">{included.length} paper{included.length !== 1 ? "s" : ""} included.</p>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col md:grid md:grid-cols-[240px,1fr] gap-4">
          {/* Queue list */}
          <div className="border border-border rounded-lg overflow-hidden bg-muted/10 flex flex-col md:max-h-[520px]">
            <div className="px-3 py-2 border-b border-border/50 bg-muted/20 flex items-center justify-between shrink-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Queue · {queue.length}</p>
              {isR2 && <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">R2 Mode</span>}
            </div>
            <div className="flex-1 overflow-y-auto">
              {queue.map((p, i) => (
                <button key={p.id} onClick={() => setActiveIdx(i)}
                  className={`w-full text-left px-3 py-2.5 border-b border-border/30 last:border-0 transition-colors ${i === activeIdx ? "bg-violet-500/10" : "hover:bg-muted/40"}`}
                >
                  <div className="flex items-start gap-1.5">
                    {p.aiScore !== null && (
                      <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded shrink-0 mt-0.5 tabular-nums">
                        {Math.round(p.aiScore)}
                      </span>
                    )}
                    <p className={`text-xs font-medium line-clamp-2 ${i === activeIdx ? "text-violet-600 dark:text-violet-400" : "text-foreground"}`}>
                      {p.title || "Untitled"}
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{p.year}{p.source ? ` · ${p.source}` : ""}</p>
                </button>
              ))}
            </div>
            <div className="px-3 py-2 border-t border-border/50 flex items-center gap-2 shrink-0">
              <button onClick={() => setActiveIdx((i) => Math.max(i - 1, 0))} disabled={activeIdx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-[10px] text-muted-foreground tabular-nums flex-1 text-center">{activeIdx + 1} / {queue.length}</span>
              <button onClick={() => setActiveIdx((i) => Math.min(i + 1, queue.length - 1))} disabled={activeIdx >= queue.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Active paper */}
          {activePaper && (
            <div className="border border-border rounded-lg overflow-hidden flex flex-col md:max-h-[520px]">
              <div className="px-4 py-3 border-b border-border/50 bg-muted/10 shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-snug">{activePaper.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {activePaper.authors}{activePaper.year ? ` · ${activePaper.year}` : ""}{activePaper.source ? ` · ${activePaper.source}` : ""}
                    </p>
                    {activePaper.doi && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">DOI: {activePaper.doi}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {activePaper.aiScore !== null && (
                      <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded tabular-nums">
                        AI {Math.round(activePaper.aiScore)}
                      </span>
                    )}
                    {activePaper.url && (
                      <a href={activePaper.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-violet-500 hover:underline flex items-center gap-0.5">
                        View <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </div>

                {/* R2 sees R1's decision */}
                {isR2 && phase === "abstract" && activePaper.abstractDecision && (
                  <div className="mt-2 p-2 rounded bg-muted/30 border border-border/50 text-[10px]">
                    <span className="font-semibold text-muted-foreground">Reviewer 1: </span>
                    <span className={decisionColor(activePaper.abstractDecision)}>{decisionLabel(activePaper.abstractDecision)}</span>
                    {activePaper.abstractRationale && <span className="text-muted-foreground ml-1">— {activePaper.abstractRationale}</span>}
                  </div>
                )}
                {isR2 && phase === "fulltext" && activePaper.fullTextDecision && (
                  <div className="mt-2 p-2 rounded bg-muted/30 border border-border/50 text-[10px]">
                    <span className="font-semibold text-muted-foreground">Reviewer 1: </span>
                    <span className={decisionColor(activePaper.fullTextDecision)}>{decisionLabel(activePaper.fullTextDecision)}</span>
                    {activePaper.fullTextRationale && <span className="text-muted-foreground ml-1">— {activePaper.fullTextRationale}</span>}
                  </div>
                )}
              </div>

              <div className="flex-1 px-4 py-3 overflow-y-auto space-y-4">
                {phase === "abstract" ? (
                  <>
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Abstract</p>
                      <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                        {activePaper.abstract || <span className="text-muted-foreground italic">No abstract provided.</span>}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Rationale (optional)</label>
                      <Textarea
                        value={isR2 ? activePaper.reviewer2AbstractRationale : activePaper.abstractRationale}
                        onChange={(e) => updatePaper(activePaper.id, isR2 ? { reviewer2AbstractRationale: e.target.value } : { abstractRationale: e.target.value })}
                        rows={2} className="resize-none text-xs" placeholder="Note your reason..." />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Full-text URL</label>
                      <Input value={activePaper.fullTextUrl} onChange={(e) => updatePaper(activePaper.id, { fullTextUrl: e.target.value })} placeholder="Paste full-text URL..." className="text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Rationale (optional)</label>
                      <Textarea
                        value={isR2 ? activePaper.reviewer2FullTextRationale : activePaper.fullTextRationale}
                        onChange={(e) => updatePaper(activePaper.id, isR2 ? { reviewer2FullTextRationale: e.target.value } : { fullTextRationale: e.target.value })}
                        rows={3} className="resize-none text-xs" placeholder="Note reasons for exclusion or concerns..." />
                    </div>
                    {activePaper.abstract && (
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Abstract (reference)</p>
                        <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-6">{activePaper.abstract}</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Decision buttons */}
              <div className="px-4 py-3 border-t border-border/40 bg-muted/5 shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white flex-1 sm:flex-none" onClick={() => decide("include")}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Include
                    <kbd className="ml-1 text-[9px] opacity-60 font-mono bg-emerald-700 px-1 rounded">I</kbd>
                  </Button>
                  {phase === "abstract" && (
                    <Button size="sm" variant="outline" className="gap-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 flex-1 sm:flex-none" onClick={() => decide("maybe")}>
                      <HelpCircle className="w-3.5 h-3.5" /> Maybe
                      <kbd className="ml-1 text-[9px] opacity-60 font-mono bg-muted px-1 rounded">M</kbd>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="gap-1.5 border-red-500/40 text-red-500 hover:bg-red-500/10 flex-1 sm:flex-none" onClick={() => decide("exclude")}>
                    <XCircle className="w-3.5 h-3.5" /> Exclude
                    <kbd className="ml-1 text-[9px] opacity-60 font-mono bg-muted px-1 rounded">E</kbd>
                  </Button>
                  <div className="flex items-center gap-1 ml-auto text-muted-foreground">
                    <button onClick={() => setActiveIdx((i) => Math.max(i - 1, 0))} disabled={activeIdx === 0} className="hover:text-foreground disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                    <button onClick={() => setActiveIdx((i) => Math.min(i + 1, queue.length - 1))} disabled={activeIdx >= queue.length - 1} className="hover:text-foreground disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add paper / reviewed list */}
      <div className="space-y-2 pt-2 border-t border-border/50">
        <AddPaperForm onAdd={(p) => { const next = [...papers, p]; setPapers(next); savePapers(next); }} />

        {/* Reviewed papers */}
        {(phase === "abstract" ? abstractDone : fulltextDone).length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Reviewed ({(phase === "abstract" ? abstractDone : fulltextDone).length})</p>
            <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
              {(phase === "abstract" ? abstractDone : fulltextDone).map((p) => {
                const d = phase === "abstract" ? (isR2 ? p.reviewer2AbstractDecision : p.abstractDecision) : (isR2 ? p.reviewer2FullTextDecision : p.fullTextDecision);
                const conflict = hasConflict(p, phase);
                return (
                  <div key={p.id} className={`flex items-center gap-2 p-2 rounded-md border text-xs ${conflict ? "border-amber-500/30 bg-amber-500/5" : "border-border/50 bg-muted/10"}`}>
                    {conflict && <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />}
                    <span className="flex-1 truncate text-foreground">{p.title}</span>
                    <span className={`shrink-0 font-semibold text-[10px] ${decisionColor(d)}`}>{decisionLabel(d)}</span>
                    <button onClick={() => undoDecision(p.id)} className="text-muted-foreground hover:text-foreground shrink-0 text-[10px]">Undo</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => savePapers(papers)} disabled={!!saving} data-testid="button-save-screening">
          {saving === "Screening" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save All
        </Button>
      </div>
    </div>
  );
}
