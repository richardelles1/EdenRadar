import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Download, Database, RefreshCw, AlertTriangle, CheckCircle2, ExternalLink, Zap, Sparkles, Activity, AlertCircle, XCircle, Microscope, Trash2, ClipboardList, Lightbulb, Users, UserPlus, Copy, Check, Inbox, ChevronDown, ChevronRight, ChevronUp, Building2, Clock, PackagePlus, BrainCircuit, PlayCircle, BarChart3, Mic, MicOff, ThumbsUp, ThumbsDown, Bookmark, Layers, Plus, Upload, FileText, Image as ImageIcon, Pencil, BookOpen, X, CreditCard, Server, TrendingUp, Globe, MessageSquare, FlaskConical, Send, Eye, Tag, ArrowUp, ArrowDown, ChevronsUpDown, Square, Key, PowerOff, RotateCcw, ArrowUpCircle, Shield, ShieldCheck, Lock, LogOut, DollarSign, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { PORTAL_CONFIG, ALL_PORTAL_ROLES, getPortalConfig, type PortalRole } from "@shared/portals";
import type { ConceptCard } from "@shared/schema";
import { formatDate, timeAgo, relativeTime, getErrorType, HealthDot, HealthLabel } from "./_shared";
import type { HealthStatus, ErrorType, CollectorHealthRow, SchedulerStatus, ActiveSearchRow, CollectorHealthData, SyncSessionData, SyncStatusResponse } from "./_shared";
import { ExportMenu } from "@/components/ExportMenu";

function parseCsv(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  let i = 0;
  const len = text.length;

  function parseField(): string {
    if (i < len && text[i] === '"') {
      i++;
      let val = "";
      while (i < len) {
        if (text[i] === '"') {
          i++;
          if (i < len && text[i] === '"') { val += '"'; i++; }
          else break;
        } else {
          val += text[i++];
        }
      }
      return val;
    }
    let val = "";
    while (i < len && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") val += text[i++];
    return val;
  }

  function parseLine(): string[] {
    const fields: string[] = [];
    while (i < len && text[i] !== "\n" && text[i] !== "\r") {
      fields.push(parseField());
      if (i < len && text[i] === ",") i++;
    }
    if (i < len && text[i] === "\r") i++;
    if (i < len && text[i] === "\n") i++;
    return fields;
  }

  const headers = parseLine();
  while (i < len) {
    const line = parseLine();
    if (line.every((f) => f === "")) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = line[idx] ?? ""; });
    rows.push(obj);
  }
  return rows;
}

function BulkCsvImport({ pw }: { pw: string }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<{ updated: number; skipped: number; validationSkipped: number; skippedDetails: Array<{ index: number; id?: number; reason: string }> } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ batch: number; total: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const CSV_FIELDS = ["id","assetName","institution","summary","abstract","target","modality","indication","developmentStage","categories","mechanismOfAction","innovationClaim","unmetNeed","comparableDrugs","licensingReadiness","ipType","completenessScore"] as const;

  function handleFile(file: File) {
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 50 MB.", variant: "destructive" });
      return;
    }
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const rows = parseCsv(text);
        if (!rows.length || !("id" in rows[0])) {
          toast({ title: "Invalid CSV", description: "File must have an 'id' column header.", variant: "destructive" });
          return;
        }
        setParsedRows(rows);
        setFileName(file.name);
      } catch {
        toast({ title: "Parse error", description: "Could not parse CSV file.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  }

  function buildRows(rawRows: Record<string, string>[]) {
    return rawRows.map((r) => {
      const id = parseInt(r.id, 10);
      const obj: Record<string, unknown> = { id };
      for (const f of CSV_FIELDS) {
        if (f === "id") continue;
        const v = r[f]?.trim();
        if (!v) continue;
        if (f === "categories") {
          try { obj[f] = JSON.parse(v); } catch { obj[f] = v.split(";").map((s) => s.trim()).filter(Boolean); }
        } else if (f === "completenessScore") {
          const n = parseFloat(v);
          if (!isNaN(n)) obj[f] = n;
        } else {
          obj[f] = v;
        }
      }
      return obj;
    });
  }

  function fieldCoverage(rawRows: Record<string, string>[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const f of CSV_FIELDS) {
      if (f === "id") continue;
      counts[f] = rawRows.filter((r) => r[f] && r[f].trim() !== "").length;
    }
    return counts;
  }

  async function handleImport() {
    if (!parsedRows) return;
    setImporting(true);
    setResult(null);
    setImportProgress(null);
    const CHUNK_SIZE = 500;
    const rows = buildRows(parsedRows);
    const chunks: typeof rows[] = [];
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) chunks.push(rows.slice(i, i + CHUNK_SIZE));
    const acc = { updated: 0, skipped: 0, validationSkipped: 0, skippedDetails: [] as Array<{ index: number; id?: number; reason: string }> };
    try {
      for (let c = 0; c < chunks.length; c++) {
        if (chunks.length > 1) setImportProgress({ batch: c + 1, total: chunks.length });
        const res = await fetch(`/api/admin/assets/bulk-update`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
          body: JSON.stringify(chunks[c]),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(err.error ?? "Import failed");
        }
        const data = await res.json() as { updated: number; skipped: number; validationSkipped: number; skippedDetails: Array<{ index: number; id?: number; reason: string }> };
        acc.updated += data.updated ?? 0;
        acc.skipped += data.skipped ?? 0;
        acc.validationSkipped += data.validationSkipped ?? 0;
        acc.skippedDetails.push(...(data.skippedDetails ?? []));
      }
      setResult(acc);
      setParsedRows(null);
      setFileName(null);
      toast({ title: "Import complete", description: `${acc.updated} assets updated.` });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }

  const previewRows = parsedRows?.slice(0, 10) ?? [];
  const previewCols = ["id", "assetName", "institution", "target", "modality", "developmentStage", "completenessScore"];
  const willUpdateCount = parsedRows
    ? parsedRows.filter((r) => {
        const id = parseInt(r.id, 10);
        if (isNaN(id)) return false;
        return CSV_FIELDS.some((f) => f !== "id" && r[f] && r[f].trim() !== "");
      }).length
    : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-6 mb-6" data-testid="bulk-csv-import-panel">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-base font-semibold text-foreground">CSV Bulk Import</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Export relevant assets to CSV, enrich fields externally (e.g. with GPT-4o), then re-import. Only non-empty fields are written; id must match an existing asset.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <button
          type="button"
          onClick={async () => {
            const res = await fetch(`/api/admin/assets/export-csv`, {
              headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
            });
            if (!res.ok) {
              toast({ title: "Export failed", variant: "destructive" });
              return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `EdenRadar_Enrichment_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 border border-border text-foreground transition-colors"
          data-testid="link-export-enrichment-csv"
        >
          <Download className="h-3.5 w-3.5" />
          Export Enrichment CSV
        </button>
      </div>

      {/* Drag-and-drop dropzone */}
      <div
        className={`mb-4 rounded-lg border-2 border-dashed transition-colors cursor-pointer ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/20"}`}
        data-testid="dropzone-csv"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
      >
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
          <Upload className={`h-6 w-6 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
          <p className="text-xs font-medium text-foreground">
            {fileName ? `Re-upload CSV (current: ${fileName})` : "Drop enriched CSV here or click to browse"}
          </p>
          <p className="text-xs text-muted-foreground">Accepts .csv files up to 50,000 rows</p>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        data-testid="input-csv-file"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />

      {result && (
        <div className="mb-4 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 text-xs text-green-800 dark:text-green-300 overflow-hidden" data-testid="text-import-result">
          <div className="flex items-center gap-2 px-3 py-2">
            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Last import: <span className="font-semibold">{result.updated}</span> assets updated, <span className="font-semibold">{result.skipped}</span> skipped{result.validationSkipped > 0 ? ` (${result.validationSkipped} failed validation)` : ""}.</span>
          </div>
          {result.skippedDetails.length > 0 && (
            <div className="border-t border-green-200 dark:border-green-800 px-3 py-2 space-y-0.5" data-testid="text-skipped-details">
              <p className="font-semibold mb-1">Skipped rows (first {result.skippedDetails.length}):</p>
              {result.skippedDetails.map((d, i) => (
                <p key={i} className="font-mono">{d.index >= 0 ? `Row ${d.index + 1}` : "—"}{d.id !== undefined ? ` (id=${d.id})` : ""}: {d.reason}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {parsedRows && parsedRows.length > 0 && (
        <div data-testid="csv-preview-section">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-foreground space-y-0.5">
              <p className="font-medium">{parsedRows.length.toLocaleString()} rows, {Object.keys(parsedRows[0] ?? {}).length} columns from <span className="font-semibold">{fileName}</span></p>
              <p className="text-muted-foreground"><span className="font-semibold text-foreground" data-testid="text-will-update-count">{willUpdateCount.toLocaleString()}</span> rows will be updated (valid id + at least one non-empty field)</p>
            </div>
            <Button
              size="sm"
              className="text-xs h-7"
              onClick={handleImport}
              disabled={importing || willUpdateCount === 0}
              data-testid="button-confirm-import"
            >
              {importing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowUpCircle className="h-3.5 w-3.5 mr-1.5" />}
              {importing && importProgress ? `Batch ${importProgress.batch}/${importProgress.total}…` : importing ? "Importing…" : `Import ${willUpdateCount.toLocaleString()} rows`}
            </Button>
          </div>

          {/* Field coverage summary */}
          <div className="mb-3 p-3 rounded-lg bg-muted/30 border border-border text-xs" data-testid="field-coverage-summary">
            <p className="font-semibold text-foreground mb-1.5">Fields to be written (non-empty counts):</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              {Object.entries(fieldCoverage(parsedRows)).map(([field, count]) => count > 0 && (
                <span key={field}>
                  <span className="text-foreground font-medium">{field}</span>: {count.toLocaleString()}
                </span>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border text-xs">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  {previewCols.map((col) => (
                    <th key={col} className="px-3 py-2 text-left font-semibold text-foreground whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-border last:border-0 hover:bg-muted/20" data-testid={`row-csv-preview-${idx}`}>
                    {previewCols.map((col) => (
                      <td key={col} className="px-3 py-1.5 text-muted-foreground max-w-[200px] truncate" title={row[col]}>
                        {row[col] || <span className="text-border italic">empty</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                {parsedRows.length > 10 && (
                  <tr>
                    <td colSpan={previewCols.length} className="px-3 py-1.5 text-center text-muted-foreground italic">
                      …and {(parsedRows.length - 10).toLocaleString()} more rows
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

type ParsedImportAsset = {
  name: string;
  description: string;
  sourceUrl: string;
  unmetNeed: string;
  inventors: string[];
  patentStatus: string;
  technologyId: string;
  contactEmail: string;
  target: string;
  modality: string;
  indication: string;
  developmentStage: string;
  abstract: string;
  categories: string[];
  innovationClaim: string;
  mechanismOfAction: string;
};

// Mirror of server/lib/pipeline/contentHash.ts computeCompletenessScore — same weights, no server call
function computeManualAssetScore(a: ParsedImportAsset): number {
  let score = 0;
  type FieldKey = "target" | "modality" | "indication" | "developmentStage" | "summary" | "abstract" | "categories" | "innovationClaim" | "mechanismOfAction" | "inventors" | "patentStatus";
  const checks: [FieldKey, number][] = [
    ["target", 15], ["modality", 15], ["indication", 15], ["developmentStage", 10],
    ["summary", 10], ["abstract", 10], ["categories", 5], ["innovationClaim", 5],
    ["mechanismOfAction", 5], ["inventors", 5], ["patentStatus", 5],
  ];
  const mapped: Record<FieldKey, string | string[] | null> = {
    target: a.target,
    modality: a.modality,
    indication: a.indication,
    developmentStage: a.developmentStage,
    summary: a.description,
    abstract: a.abstract,
    categories: a.categories,
    innovationClaim: a.innovationClaim,
    mechanismOfAction: a.mechanismOfAction,
    inventors: a.inventors,
    patentStatus: a.patentStatus,
  };
  for (const [field, weight] of checks) {
    const val = mapped[field];
    if (!val || val === "unknown" || val === "") continue;
    if (Array.isArray(val) && val.length === 0) continue;
    if (typeof val === "string" && val.length < 3) continue;
    score += weight;
  }
  return score;
}

function assetGrade(score: number): "pass" | "revisions" | "incomplete" {
  return score >= 75 ? "pass" : score >= 50 ? "revisions" : "incomplete";
}

function getMissingFields(a: ParsedImportAsset): string[] {
  const missing: string[] = [];
  const isMissing = (v: string | string[]) =>
    !v || v === "unknown" || v === "n/a" || v === "" || (Array.isArray(v) && v.length === 0);
  if (isMissing(a.technologyId)) missing.push("Tech ID");
  if (isMissing(a.description)) missing.push("description");
  if (isMissing(a.abstract)) missing.push("abstract");
  if (isMissing(a.inventors)) missing.push("inventors");
  if (isMissing(a.contactEmail)) missing.push("contact email");
  if (isMissing(a.target)) missing.push("target");
  if (isMissing(a.modality)) missing.push("modality");
  if (isMissing(a.indication)) missing.push("indication");
  return missing;
}

function GradeBadge({ grade, score }: { grade: string; score: number }) {
  if (grade === "pass") return (
    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200">
      Pass ({score})
    </Badge>
  );
  if (grade === "revisions") return (
    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200">
      Revisions needed ({score})
    </Badge>
  );
  return (
    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200">
      Incomplete ({score})
    </Badge>
  );
}

function ManualImportTab({ pw, setActiveTab }: { pw: string; setActiveTab: (tab: string) => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Stage: "input" → "preview" → "done"
  const [stage, setStage] = useState<"input" | "preview" | "done">("input");
  const [mode, setMode] = useState<"text" | "image" | "document">("text");

  // Institution combobox state
  const [instSearch, setInstSearch] = useState("");
  const [instOpen, setInstOpen] = useState(false);
  const [selectedInst, setSelectedInst] = useState("");
  const instBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (instBlurTimer.current) clearTimeout(instBlurTimer.current); }, []);
  const [showCreateInst, setShowCreateInst] = useState(false);
  const [newInstName, setNewInstName] = useState("");
  const [newInstTtoUrl, setNewInstTtoUrl] = useState("");

  // Input content
  const [pastedText, setPastedText] = useState("");
  const [sourceUrlInput, setSourceUrlInput] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [docFiles, setDocFiles] = useState<File[]>([]);

  // Preview stage
  const [parsedAssets, setParsedAssets] = useState<ParsedImportAsset[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [parsedInstitution, setParsedInstitution] = useState("");

  // Done stage
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

  // Per-image parse warnings
  const [failedImages, setFailedImages] = useState<string[]>([]);

  const { data: instData } = useQuery<{ institutions: string[]; manual: { name: string; ttoUrl: string }[] }>({
    queryKey: ["/api/admin/institutions", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/institutions", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load institutions");
      return res.json();
    },
  });

  const allInstitutions: string[] = instData?.institutions ?? [];
  const filteredInsts = allInstitutions.filter((n) => n.toLowerCase().includes(instSearch.toLowerCase())).slice(0, 20);

  const createInstMutation = useMutation({
    mutationFn: async () => {
      if (!newInstName.trim()) throw new Error("Institution name is required");
      const res = await fetch("/api/admin/institutions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ name: newInstName.trim(), ttoUrl: newInstTtoUrl.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || "Failed to create institution");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/institutions", pw] });
      setSelectedInst(data.institution.name);
      setInstSearch(data.institution.name);
      setShowCreateInst(false);
      setNewInstName("");
      setNewInstTtoUrl("");
      toast({ title: "Institution saved", description: data.institution.name });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const parseMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInst) throw new Error("Select or create an institution first");
      if (mode === "text" && !pastedText.trim()) throw new Error("Paste some text first");
      if (mode === "image" && imageFiles.length === 0) throw new Error("Upload at least one screenshot");
      if (mode === "document" && docFiles.length === 0) throw new Error("Upload at least one document");

      const formData = new FormData();
      formData.append("institution", selectedInst);
      if (mode === "text") {
        const textWithUrl = sourceUrlInput.trim()
          ? `Page URL: ${sourceUrlInput.trim()}\n\n${pastedText}`
          : pastedText;
        formData.append("rawText", textWithUrl);
      } else if (mode === "image") {
        for (const file of imageFiles) {
          formData.append("images", file);
        }
      } else {
        for (const file of docFiles) {
          formData.append("documents", file);
        }
      }

      const res = await fetch("/api/admin/manual-import/parse", {
        method: "POST",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || "Parse failed");
      }
      return res.json() as Promise<{ assets: ParsedImportAsset[]; institution: string; failedImages?: string[] }>;
    },
    onSuccess: (data) => {
      setParsedAssets(data.assets);
      setChecked(data.assets.map(() => true));
      setParsedInstitution(data.institution);
      setFailedImages(data.failedImages ?? []);
      setStage("preview");
    },
    onError: (err: Error) => toast({ title: "Parse failed", description: err.message, variant: "destructive" }),
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      const selected = parsedAssets.filter((_, i) => checked[i]);
      if (selected.length === 0) throw new Error("Select at least one asset to import");
      const res = await fetch("/api/admin/manual-import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({
          institution: parsedInstitution,
          assets: selected.map(({ name, description, abstract, sourceUrl, unmetNeed, inventors, patentStatus, technologyId, contactEmail, target, modality, indication, developmentStage, categories, innovationClaim, mechanismOfAction }) =>
            ({ name, description, abstract, sourceUrl, unmetNeed, inventors, patentStatus, technologyId, contactEmail, target, modality, indication, developmentStage, categories, innovationClaim, mechanismOfAction })
          ),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || "Commit failed");
      }
      return res.json() as Promise<{ imported: number; skipped: number }>;
    },
    onSuccess: (data) => {
      setImportResult(data);
      setStage("done");
      queryClient.invalidateQueries({ queryKey: ["/api/ingest/new-arrivals"] });
      toast({ title: `Imported ${data.imported} assets`, description: data.skipped > 0 ? `${data.skipped} skipped (duplicates)` : undefined });
    },
    onError: (err: Error) => toast({ title: "Import failed", description: err.message, variant: "destructive" }),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 10);
    setImageFiles(files);
    const previews = files.map((f) => URL.createObjectURL(f));
    setImagePreviews(previews);
  };

  const selectedCount = checked.filter(Boolean).length;
  const passCnt = parsedAssets.filter((a) => assetGrade(computeManualAssetScore(a)) === "pass").length;
  const revCnt = parsedAssets.filter((a) => assetGrade(computeManualAssetScore(a)) === "revisions").length;
  const incCnt = parsedAssets.filter((a) => assetGrade(computeManualAssetScore(a)) === "incomplete").length;

  const resetState = () => {
    setStage("input");
    setParsedAssets([]);
    setChecked([]);
    setImportResult(null);
    setFailedImages([]);
    setPastedText("");
    setSourceUrlInput("");
    setImageFiles([]);
    setImagePreviews([]);
    setDocFiles([]);
  };

  // Preserves institution — use after committing assets from the same TTO
  const resetToInput = () => resetState();

  // Clears institution — use when starting a fresh import from a different source
  const resetToInputFresh = () => {
    resetState();
    setSelectedInst("");
    setInstSearch("");
  };

  return (
    <div className="space-y-6 max-w-4xl" data-testid="manual-import-tab">

      {/* ── Stage 1: Institution + Input ────────────────────── */}
      {stage === "input" && (
        <>
          {/* Institution searchable combobox */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold text-foreground">Institution</h3>
            </div>

            <div className="relative w-full">
              <Input
                placeholder="Search institution…"
                value={instSearch}
                onChange={(e) => { setInstSearch(e.target.value); setInstOpen(true); setSelectedInst(""); }}
                onFocus={() => setInstOpen(true)}
                onBlur={() => { instBlurTimer.current = setTimeout(() => setInstOpen(false), 150); }}
                className="pr-8"
                data-testid="input-institution-search"
              />
              {selectedInst ? (
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors"
                  onClick={() => { setSelectedInst(""); setInstSearch(""); setShowCreateInst(false); setInstOpen(false); }}
                  data-testid="button-clear-institution"
                  aria-label="Clear institution"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              )}
              {instOpen && !selectedInst && (
                <div
                  className="absolute top-full left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover shadow-md"
                  data-testid="institution-dropdown"
                >
                  {filteredInsts.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                      onClick={() => { if (instBlurTimer.current) clearTimeout(instBlurTimer.current); setSelectedInst(name); setInstSearch(name); setInstOpen(false); setShowCreateInst(false); }}
                      data-testid={`inst-option-${name}`}
                    >
                      {name}
                    </button>
                  ))}
                  {instSearch.trim() && !allInstitutions.some((n) => n.toLowerCase() === instSearch.toLowerCase()) && (
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted text-primary font-medium transition-colors flex items-center gap-1.5"
                      onClick={() => { if (instBlurTimer.current) clearTimeout(instBlurTimer.current); setNewInstName(instSearch.trim()); setShowCreateInst(true); setInstOpen(false); }}
                      data-testid="button-create-institution"
                    >
                      <Plus className="h-3.5 w-3.5" /> Create "{instSearch.trim()}"…
                    </button>
                  )}
                  {filteredInsts.length === 0 && !instSearch.trim() && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">Start typing to search…</p>
                  )}
                </div>
              )}
            </div>

            {selectedInst && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1" data-testid="selected-institution-label">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Selected: <strong>{selectedInst}</strong>
              </p>
            )}

            {showCreateInst && (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 space-y-3" data-testid="create-institution-form">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Register New Institution</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    placeholder="Institution name *"
                    value={newInstName}
                    onChange={(e) => setNewInstName(e.target.value)}
                    data-testid="input-new-inst-name"
                  />
                  <Input
                    placeholder="TTO website URL (optional)"
                    value={newInstTtoUrl}
                    onChange={(e) => setNewInstTtoUrl(e.target.value)}
                    data-testid="input-new-inst-url"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => createInstMutation.mutate()}
                    disabled={createInstMutation.isPending || !newInstName.trim()}
                    data-testid="button-save-institution"
                  >
                    {createInstMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                    Save & select
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowCreateInst(false)} data-testid="button-cancel-create-inst">
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Input mode */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold text-foreground">TTO Content</h3>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant={mode === "text" ? "default" : "outline"} onClick={() => setMode("text")} className="gap-1.5" data-testid="button-mode-text">
                <FileText className="h-3.5 w-3.5" /> Paste text
              </Button>
              <Button size="sm" variant={mode === "image" ? "default" : "outline"} onClick={() => setMode("image")} className="gap-1.5" data-testid="button-mode-image">
                <ImageIcon className="h-3.5 w-3.5" /> Screenshots
              </Button>
              <Button size="sm" variant={mode === "document" ? "default" : "outline"} onClick={() => setMode("document")} className="gap-1.5" data-testid="button-mode-document">
                <BookOpen className="h-3.5 w-3.5" /> Documents
              </Button>
            </div>

            {mode === "text" ? (
              <div className="space-y-2">
                <Input
                  placeholder="Page URL (optional — paste the listing URL so it's stored with the asset)"
                  value={sourceUrlInput}
                  onChange={(e) => setSourceUrlInput(e.target.value)}
                  className="text-xs"
                  data-testid="input-source-url"
                />
                <Textarea
                  placeholder="Paste the TTO listing text: titles, descriptions, inventors, patent info…"
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  className="min-h-[180px] font-mono text-xs"
                  data-testid="textarea-paste-text"
                />
              </div>
            ) : mode === "image" ? (
              <div className="space-y-3">
                <div
                  className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")).slice(0, 10);
                    if (dropped.length > 0) {
                      setImageFiles(dropped);
                      setImagePreviews(dropped.map(f => URL.createObjectURL(f)));
                    }
                  }}
                  data-testid="dropzone-image-upload"
                >
                  <Upload className="h-8 w-8 text-muted-foreground/50" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">Drag & drop or click to upload screenshots</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG, or WebP, up to 10 images</p>
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} data-testid="input-file-upload" />
                {imagePreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2" data-testid="image-preview-grid">
                    {imagePreviews.map((src, i) => (
                      <img key={i} src={src} alt={`Screenshot ${i + 1}`} className="h-24 w-auto rounded border border-border object-cover" data-testid={`image-preview-${i}`} />
                    ))}
                    <p className="w-full text-xs text-muted-foreground">{imagePreviews.length} image{imagePreviews.length !== 1 ? "s" : ""} ready</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div
                  className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => docInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
                    const dropped = Array.from(e.dataTransfer.files).filter(f => allowed.includes(f.type)).slice(0, 5);
                    if (dropped.length > 0) setDocFiles(dropped);
                  }}
                  data-testid="dropzone-document-upload"
                >
                  <Upload className="h-8 w-8 text-muted-foreground/50" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">Drag & drop or click to upload documents</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF or DOCX, up to 5 files, 20 MB each</p>
                  </div>
                </div>
                <input
                  ref={docInputRef}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const selected = Array.from(e.target.files ?? []).slice(0, 5);
                    setDocFiles(selected);
                    e.target.value = "";
                  }}
                  data-testid="input-doc-upload"
                />
                {docFiles.length > 0 && (
                  <div className="space-y-1" data-testid="doc-file-list">
                    {docFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground" data-testid={`doc-file-${i}`}>
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{f.name}</span>
                        <span className="shrink-0 text-muted-foreground/60">({(f.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground pt-1">{docFiles.length} document{docFiles.length !== 1 ? "s" : ""} ready</p>
                  </div>
                )}
              </div>
            )}

            <Button onClick={() => parseMutation.mutate()} disabled={parseMutation.isPending || !selectedInst} className="gap-2" data-testid="button-parse">
              {parseMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Parsing with AI…</> : <><Zap className="h-4 w-4" /> Parse with AI</>}
            </Button>
          </div>
        </>
      )}

      {/* ── Stage 2: Preview table ─────────────────────────── */}
      {stage === "preview" && (
        <div className="space-y-4" data-testid="preview-stage">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">{parsedAssets.length} asset{parsedAssets.length !== 1 ? "s" : ""} extracted</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="text-emerald-600 dark:text-emerald-400">{passCnt} Pass</span>
                {" · "}
                <span className="text-amber-600 dark:text-amber-400">{revCnt} Revisions needed</span>
                {" · "}
                <span className="text-red-600 dark:text-red-400">{incCnt} Incomplete</span>
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={resetToInput} data-testid="button-back-to-input">
              ← Back
            </Button>
          </div>

          {failedImages.length > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-start gap-2.5" data-testid="failed-images-warning">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  {failedImages.length} image{failedImages.length !== 1 ? "s" : ""} yielded no asset
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                  {failedImages.join(", ")}: the screenshot may be too low resolution, cropped, or show a listing index rather than a single asset page. Try re-uploading a cleaner screenshot.
                </p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border overflow-hidden" data-testid="preview-table">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedCount === parsedAssets.length}
                      onChange={(e) => setChecked(parsedAssets.map(() => e.target.checked))}
                      data-testid="checkbox-select-all"
                    />
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground hidden md:table-cell">Description</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground hidden lg:table-cell">Inventors</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {parsedAssets.map((asset, i) => {
                  const score = computeManualAssetScore(asset);
                  const grade = assetGrade(score);
                  return (
                    <tr key={i} className={`transition-colors ${checked[i] ? "bg-card" : "bg-muted/20 opacity-60"}`} data-testid={`preview-row-${i}`}>
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={checked[i] ?? false}
                          onChange={(e) => { const next = [...checked]; next[i] = e.target.checked; setChecked(next); }}
                          data-testid={`checkbox-asset-${i}`}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-foreground line-clamp-1">{asset.name}</p>
                        {asset.sourceUrl && (
                          <a href={asset.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline line-clamp-1" data-testid={`link-source-${i}`}>
                            {asset.sourceUrl}
                          </a>
                        )}
                        {asset.patentStatus && asset.patentStatus !== "unknown" && (
                          <p className="text-xs text-muted-foreground mt-0.5">{asset.patentStatus}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell max-w-xs">
                        <p className="text-xs text-muted-foreground line-clamp-2">{asset.description || "—"}</p>
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell">
                        <p className="text-xs text-muted-foreground">{asset.inventors.length > 0 ? asset.inventors.join(", ") : "—"}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <GradeBadge grade={grade} score={score} />
                        {(() => {
                          const missing = getMissingFields(asset);
                          if (missing.length === 0) return null;
                          return (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1" data-testid={`missing-fields-${i}`}>
                              Missing: {missing.join(" · ")}
                            </p>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => commitMutation.mutate()}
              disabled={commitMutation.isPending || selectedCount === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              data-testid="button-import"
            >
              {commitMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</> : <><PackagePlus className="h-4 w-4" /> Import {selectedCount} selected</>}
            </Button>
            <p className="text-xs text-muted-foreground">{selectedCount} of {parsedAssets.length} selected</p>
          </div>
        </div>
      )}

      {/* ── Stage 3: Done summary ──────────────────────────── */}
      {stage === "done" && importResult && (
        <div className="space-y-4" data-testid="done-stage">
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-6 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              <h3 className="font-semibold text-emerald-700 dark:text-emerald-400">Import complete</h3>
            </div>
            <div className="flex gap-6 text-sm">
              <div data-testid="text-imported-count">
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{importResult.imported}</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Assets added to Indexing Queue</p>
              </div>
              {importResult.skipped > 0 && (
                <div data-testid="text-skipped-count">
                  <p className="text-2xl font-bold text-muted-foreground">{importResult.skipped}</p>
                  <p className="text-xs text-muted-foreground">Skipped (duplicates)</p>
                </div>
              )}
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-500">
              AI classification is running in the background. Assets remain in Indexing Queue until you push them to Scout.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setActiveTab("indexing-queue")}
              className="gap-1.5"
              data-testid="button-go-to-queue"
            >
              <PackagePlus className="h-4 w-4" /> Go to Indexing Queue
            </Button>
            <Button variant="ghost" onClick={resetToInput} data-testid="button-import-more">
              Import more assets
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export { ManualImportTab, BulkCsvImport };
