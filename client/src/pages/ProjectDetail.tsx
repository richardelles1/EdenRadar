import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Save, Loader2, Trash2, Plus, X, ExternalLink,
  ArrowRight, Download, Upload, Paperclip, FileText, Globe, Users,
  Target, Search, BookOpen, FlaskConical, Rocket, Settings2,
  Lock, Unlock, CheckCircle2, Circle, ChevronDown, ChevronRight,
  Microscope, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useResearcherId, useResearcherHeaders } from "@/hooks/use-researcher";
import { useToast } from "@/hooks/use-toast";
import type { ResearchProject } from "@shared/schema";
import { ResearchBriefPDF } from "@/components/ResearchBriefPDF";
import { computeReadinessScore } from "@/lib/readiness";
import { HypothesisBuilder, VisualTimeline, PicoHelper, ProtocolChecklist } from "@/components/ResearchTools";
import { EligibilityCriteriaSection } from "@/components/research/EligibilityCriteriaSection";
import { SearchStrategySection } from "@/components/research/SearchStrategySection";
import { ScreeningSection } from "@/components/research/ScreeningSection";
import { DataExtractionSection } from "@/components/research/DataExtractionSection";
import { RiskOfBiasSection } from "@/components/research/RiskOfBiasSection";
import { EvidenceSynthesisSection } from "@/components/research/EvidenceSynthesisSection";
import { ResultsSection } from "@/components/research/ResultsSection";
import { DisseminationSection } from "@/components/research/DisseminationSection";
import { ProtocolDeviationLog } from "@/components/research/ProtocolDeviationLog";

// ── Types ─────────────────────────────────────────────────────────────────────
type Paper = { paper_title: string; authors: string; journal: string; year: string; paper_link: string; notes: string };
type Dataset = { dataset_name: string; dataset_source: string; dataset_link: string; notes: string };
type Contributor = { name: string; institution: string; role: string; email: string };
type Experiment = { label: string; done: boolean };
type EvidenceLink = { url: string; label: string };
type Partner = { name: string; website: string; status: string; outreachDate: string; contactName: string };

// ── Constants ─────────────────────────────────────────────────────────────────
const PARTNER_STATUS_OPTIONS = ["No Contact", "Outreach Completed", "In Discussion", "In Negotiation", "Closed"];
const DOMAIN_OPTIONS = ["Biotech","Drug Discovery","Genomics","Diagnostics","Medical Devices","AI in Healthcare","Digital Health","Healthcare Systems","Other"];
const METHODOLOGY_OPTIONS = ["Experimental","Computational","Clinical","Observational","Mixed Methods"];
const CONFIDENCE_OPTIONS = ["Conceptual","Early data","Validated in lab","Preclinical evidence","Clinical evidence"];
const INDUSTRY_REL_OPTIONS = ["Pharma","Biotech","Medical Devices","Digital Health","Healthcare Systems"];
const PATENT_STATUS_OPTIONS = ["None","Patent in preparation","Patent filed","Patent granted"];
const STARTUP_OPTIONS = ["Low","Moderate","High"];
const COLLAB_TYPE_OPTIONS = ["Academic collaboration","Industry partnership","Clinical research partner","Startup founder","Investor"];
const FUNDING_STATUS_OPTIONS = ["Not funded","Grant submitted","Grant funded","Industry funded"];
const RISK_OPTIONS = ["Low","Moderate","High"];
const TECH_TYPE_OPTIONS = ["Small molecule","Biologic","Gene therapy","Cell therapy","Diagnostic","Medical device","AI/software","Platform technology"];
const DEV_STAGE_OPTIONS = ["Basic research","Translational","Preclinical","Clinical"];
const SEEKING_OPTIONS = ["Licensing partner","Industry collaboration","Startup founder","Investment"];
const STATUS_OPTIONS = [
  { value: "planning",  label: "Planning",  color: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30" },
  { value: "active",    label: "Active",    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30" },
  { value: "on_hold",   label: "On Hold",   color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  { value: "completed", label: "Completed", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
];

// ── Phase / section navigation ────────────────────────────────────────────────
type SectionMeta = { id: string; num: number | null; short: string };
type PhaseGroup = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  sections: SectionMeta[];
};

const PHASE_GROUPS: PhaseGroup[] = [
  {
    id: "define",
    label: "Define",
    icon: Target,
    color: "hsl(262 80% 60%)",
    sections: [
      { id: "overview",    num: 1,  short: "Overview & Protocol" },
      { id: "research-q",  num: 2,  short: "Research Question" },
      { id: "eligibility", num: 3,  short: "Eligibility Criteria" },
    ],
  },
  {
    id: "search",
    label: "Search",
    icon: Search,
    color: "hsl(217 91% 60%)",
    sections: [
      { id: "search-strategy", num: 4, short: "Search Strategy" },
      { id: "screening",       num: 5, short: "Screening & PRISMA" },
    ],
  },
  {
    id: "evidence",
    label: "Evidence",
    icon: BookOpen,
    color: "hsl(188 85% 35%)",
    sections: [
      { id: "literature", num: 6, short: "Literature" },
      { id: "methods",    num: 7, short: "Methods & Protocol" },
    ],
  },
  {
    id: "analyze",
    label: "Analyze",
    icon: FlaskConical,
    color: "hsl(142 52% 36%)",
    sections: [
      { id: "extraction", num: 8,  short: "Data Extraction" },
      { id: "rob",        num: 9,  short: "Risk of Bias" },
      { id: "synthesis",  num: 10, short: "Evidence Synthesis" },
      { id: "results",    num: 11, short: "Results & Conclusions" },
    ],
  },
  {
    id: "translate",
    label: "Translate",
    icon: Rocket,
    color: "hsl(262 80% 60%)",
    sections: [
      { id: "discovery",     num: 12,   short: "Discovery Card" },
      { id: "dissemination", num: 13,   short: "Dissemination Plan" },
    ],
  },
  {
    id: "manage",
    label: "Project",
    icon: Settings2,
    color: "hsl(217 25% 55%)",
    sections: [
      { id: "collab",     num: null, short: "Collaboration" },
      { id: "funding",    num: null, short: "Funding" },
      { id: "milestones", num: null, short: "Milestones" },
      { id: "risk",       num: null, short: "Risk Assessment" },
    ],
  },
];

const ALL_SECTIONS: SectionMeta[] = PHASE_GROUPS.flatMap((g) => g.sections);

// ── Section completion check ──────────────────────────────────────────────────
function isSectionComplete(id: string, p: ResearchProject | null): boolean {
  if (!p) return false;
  const a = p as any;
  switch (id) {
    case "overview":         return !!(p.title && p.description && p.researchDomain);
    case "research-q":       return !!(p.primaryResearchQuestion && p.hypothesis);
    case "eligibility":      return !!(a.eligibilityCriteria?.inclusion?.length > 0);
    case "search-strategy":  return !!(a.searchStrategy?.databases?.length > 0);
    case "screening":        return !!(a.screeningPapers?.length > 0);
    case "literature":       return !!((p.keyPapers ?? []).length > 0);
    case "methods":          return !!(p.methodology && p.experimentalDesign);
    case "extraction":       return !!(a.extractedData?.length > 0);
    case "rob":              return !!(a.riskOfBias?.length > 0);
    case "synthesis":        return !!(a.evidenceSynthesisText?.narrative?.trim());
    case "results":          return !!(a.researchResults?.mainFindings?.trim());
    case "discovery":        return !!(p.discoveryTitle && p.discoverySummary);
    case "dissemination":    return !!(a.disseminationPlan?.targetJournals?.length > 0);
    case "collab":           return !!((p.projectContributors ?? []).length > 0 || p.openForCollaboration);
    case "funding":          return !!p.fundingStatus;
    case "milestones":       return !!(a.milestones?.length > 0);
    case "risk":             return !!p.technicalRisk;
    default:                 return false;
  }
}

function phaseCompletion(phase: PhaseGroup, p: ResearchProject | null): { done: number; total: number } {
  const total = phase.sections.length;
  const done = phase.sections.filter((s) => isSectionComplete(s.id, p)).length;
  return { done, total };
}

function patentToIpStatus(pat: string | null | undefined): string {
  if (!pat || pat === "None") return "No IP";
  if (pat === "Patent in preparation") return "Provisional";
  if (pat === "Patent filed") return "Patent Pending";
  if (pat === "Patent granted") return "Patented";
  return pat;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id ?? "0");
  const [, navigate] = useLocation();
  const researcherId = useResearcherId();
  const researcherHeaders = useResearcherHeaders();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [local, setLocal] = useState<ResearchProject | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    () => Object.fromEntries(ALL_SECTIONS.filter((s) => s.id !== "overview").map((s) => [s.id, true]))
  );
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverRef = useRef<ResearchProject | null>(null);

  const { data, isLoading } = useQuery<{ project: ResearchProject }>({
    queryKey: ["/api/research/projects", projectId],
    queryFn: async () => {
      const r = await fetch(`/api/research/projects/${projectId}`, { headers: researcherHeaders });
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
    enabled: !!researcherId && !!projectId,
  });

  useEffect(() => {
    if (data?.project) {
      setLocal(data.project);
      serverRef.current = data.project;
    }
  }, [data]);

  // 2-second debounced autosave for directly-edited scalar/array fields
  useEffect(() => {
    if (!local || !serverRef.current) return;
    const TRACK: (keyof ResearchProject)[] = [
      "title", "researchDomain", "description", "status", "keywords",
      "primaryResearchQuestion", "hypothesis", "scientificRationale",
      "keyPapers", "conflictingEvidence", "literatureGap",
      "methodology", "experimentalDesign", "keyTechnologies", "datasetsUsed",
      "potentialApplications", "industryRelevance", "patentStatus", "startupPotential",
      "discoveryTitle", "discoverySummary", "technologyType", "developmentStage", "projectSeeking",
      "projectContributors", "openForCollaboration", "collaborationType",
      "fundingStatus", "fundingSources", "estimatedBudget",
      "technicalRisk", "regulatoryRisk", "keyScientificUnknowns",
      "nextExperiments", "successCriteria",
    ];
    const changed: Partial<ResearchProject> = {};
    let dirty = false;
    for (const k of TRACK) {
      if (JSON.stringify(local[k]) !== JSON.stringify(serverRef.current[k])) {
        (changed as any)[k] = local[k];
        dirty = true;
      }
    }
    if (!dirty) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/research/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...researcherHeaders },
          body: JSON.stringify(changed),
        });
        if (r.ok) {
          const { project: updated } = await r.json();
          serverRef.current = updated;
        }
      } catch {}
    }, 2000);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [local]);

  // Intersection observer for active section tracking
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const visible: Record<string, number> = {};
    ALL_SECTIONS.forEach(({ id }) => {
      const el = sectionRefs.current[id];
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          visible[id] = entry.intersectionRatio;
          const best = Object.entries(visible).sort(([, a], [, b]) => b - a)[0];
          if (best) setActiveSection(best[0]);
        },
        { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: "-10% 0px -60% 0px" }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [local]);

  const scrollToSection = useCallback((id: string) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
  }, []);

  async function saveSection(label: string, data: Partial<ResearchProject>) {
    setSaving(label);
    try {
      const r = await fetch(`/api/research/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...researcherHeaders },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Save failed");
      const { project: updated } = await r.json();
      setLocal(updated);
      serverRef.current = updated;
      qc.invalidateQueries({ queryKey: ["/api/research/projects"] });
      toast({ title: `${label} saved` });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  async function deleteProject() {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    await fetch(`/api/research/projects/${projectId}`, { method: "DELETE", headers: researcherHeaders });
    qc.invalidateQueries({ queryKey: ["/api/research/projects"] });
    navigate("/research/projects");
  }

  async function exportBrief() {
    if (!local) return;
    setPdfGenerating(true);
    toast({ title: "Generating PDF…", description: "Your brief will download automatically" });
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const blob = await pdf(<ResearchBriefPDF project={local} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${local.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-research-brief.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Research brief downloaded" });
    } catch {
      toast({ title: "PDF export failed", variant: "destructive" });
    } finally {
      setPdfGenerating(false);
    }
  }

  function pushToDiscovery() {
    if (!local) return;
    const prefill = {
      title: local.discoveryTitle || local.title || "",
      summary: local.discoverySummary || local.description || "",
      researchArea: local.researchDomain || local.researchArea || "",
      technologyType: local.technologyType || "",
      developmentStage: local.developmentStage || "",
      seeking: (local.projectSeeking ?? []).join(", "),
      ipStatus: patentToIpStatus(local.patentStatus),
      publicationLink: (local.keyPapers ?? [])[0]?.paper_link || "",
    };
    sessionStorage.setItem("eden-discovery-prefill", JSON.stringify(prefill));
    navigate("/research/create-discovery");
  }

  function setField<K extends keyof ResearchProject>(key: K, value: ResearchProject[K]) {
    setLocal((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const readiness = local ? computeReadinessScore(local) : null;

  if (isLoading) return (
    <div className="flex h-screen">
      <div className="w-[200px] shrink-0 border-r border-border p-4 space-y-3">
        {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-6 w-full rounded" />)}
      </div>
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1,2,3].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
      </div>
    </div>
  );

  if (!local) return (
    <div className="p-6 max-w-3xl mx-auto text-center">
      <p className="text-muted-foreground">Project not found.</p>
      <Button variant="ghost" className="mt-4 gap-2" onClick={() => navigate("/research/projects")}>
        <ArrowLeft className="w-4 h-4" /> Back to My Projects
      </Button>
    </div>
  );

  const statusCfg = STATUS_OPTIONS.find((o) => o.value === local.status) ?? STATUS_OPTIONS[0];

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Left phase sidebar ───────────────────────────────────────────── */}
      <aside
        className={`${sidebarCollapsed ? "w-[52px]" : "w-[210px]"} shrink-0 border-r border-border flex flex-col overflow-hidden bg-muted/10 transition-[width] duration-200`}
      >
        {/* Sidebar header */}
        <div className="h-12 flex items-center justify-between px-3 border-b border-border shrink-0 gap-2">
          {!sidebarCollapsed && (
            <button
              onClick={() => navigate("/research/projects")}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors min-w-0"
              data-testid="button-back-projects"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span className="text-xs font-medium truncate">Projects</span>
            </button>
          )}
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0 ml-auto"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            data-testid="button-toggle-sidebar"
          >
            {sidebarCollapsed
              ? <PanelLeftOpen className="w-3.5 h-3.5" />
              : <PanelLeftClose className="w-3.5 h-3.5" />
            }
          </button>
        </div>

        {/* Project name + readiness (expanded only) */}
        {!sidebarCollapsed && (
          <div className="px-3 py-3 border-b border-border/50 shrink-0">
            <p className="text-xs font-bold text-foreground line-clamp-2 leading-tight">{local.title}</p>
            {readiness && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${readiness.barColor}`}
                    style={{ width: `${readiness.score}%` }}
                  />
                </div>
                <span className={`text-[10px] font-bold tabular-nums shrink-0 ${readiness.textColor}`}>
                  {readiness.score}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Phase navigation */}
        <div className="flex-1 overflow-y-auto py-2">
          {PHASE_GROUPS.map((phase) => {
            const { done, total } = phaseCompletion(phase, local);
            const PhaseIcon = phase.icon;

            if (sidebarCollapsed) {
              return (
                <div key={phase.id} className="px-2 py-1">
                  <button
                    title={`${phase.label} — ${done}/${total}`}
                    onClick={() => {
                      setSidebarCollapsed(false);
                      setTimeout(() => scrollToSection(phase.sections[0].id), 220);
                    }}
                    className="w-full flex items-center justify-center p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <PhaseIcon className="w-4 h-4" style={{ color: phase.color }} />
                  </button>
                </div>
              );
            }

            return (
              <div key={phase.id} className="mb-1">
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <PhaseIcon className="w-3 h-3 shrink-0" style={{ color: phase.color }} />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex-1">
                    {phase.label}
                  </span>
                  <span className="text-[9px] font-semibold tabular-nums text-muted-foreground/60">
                    {done}/{total}
                  </span>
                </div>
                <div className="space-y-0.5 px-2 mb-1">
                  {phase.sections.map((sec) => {
                    const complete = isSectionComplete(sec.id, local);
                    const active = activeSection === sec.id;
                    const isDiscovery = sec.id === "discovery";
                    return (
                      <button
                        key={sec.id}
                        onClick={() => scrollToSection(sec.id)}
                        data-testid={`nav-section-${sec.id}`}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                          active
                            ? "bg-violet-600/12 text-violet-600 dark:text-violet-400"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        }`}
                      >
                        {complete ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                        ) : (
                          <Circle className={`w-3.5 h-3.5 shrink-0 ${active ? "text-violet-500" : "text-border"}`} />
                        )}
                        <span className="text-[11px] font-medium leading-tight flex-1 text-left line-clamp-1">
                          {sec.num !== null && (
                            <span className="font-bold mr-1 opacity-50">{sec.num}.</span>
                          )}
                          {sec.short}
                        </span>
                        {isDiscovery && !complete && (
                          <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 shrink-0">
                            KEY
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* §12 Discovery Card callout (Bug #5) */}
          {!sidebarCollapsed && !isSectionComplete("discovery", local) && (
            <div className="mx-2 mt-2 mb-1 p-2.5 rounded-lg border border-violet-500/25 bg-violet-500/5">
              <p className="text-[9px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wide mb-0.5">
                §12 Discovery Card
              </p>
              <p className="text-[9px] text-muted-foreground leading-tight mb-1.5">
                Package your research for industry visibility — highest-impact section
              </p>
              <button
                onClick={() => {
                  setCollapsed((prev) => ({ ...prev, discovery: false }));
                  scrollToSection("discovery");
                }}
                className="text-[9px] font-semibold text-violet-600 dark:text-violet-400 underline underline-offset-2"
              >
                Complete now →
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top header bar */}
        <header className="shrink-0 border-b border-border bg-background px-5 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-violet-600 flex items-center justify-center shrink-0">
              <Microscope className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-foreground truncate" data-testid="text-project-title">
                {local.title}
              </h1>
              {local.researchDomain && (
                <p className="text-[11px] text-muted-foreground">{local.researchDomain}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={`text-xs ${statusCfg.color}`}>{statusCfg.label}</Badge>
            {(() => {
              const s = (local.adminStatus ?? "draft") as string;
              const published = local.publishToIndustry === true && s === "published";
              const pending   = local.publishToIndustry === true && s === "pending";
              const rejected  = s === "rejected";
              const cls = published ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                : pending   ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                : rejected  ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30"
                : "bg-slate-500/10 text-slate-500 border-slate-500/30";
              const label = published ? "Published" : pending ? "Pending review" : rejected ? "Rejected" : "Draft";
              return <Badge className={`text-xs hidden sm:inline-flex ${cls}`} data-testid="badge-publish-status">{label}</Badge>;
            })()}
            <Button variant="outline" size="sm" className="gap-1.5 text-xs hidden sm:flex" onClick={exportBrief} disabled={pdfGenerating} data-testid="button-export-brief">
              {pdfGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Export Brief
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs border-violet-500/40 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 hidden sm:flex" onClick={pushToDiscovery} data-testid="button-push-discovery">
              <ArrowRight className="w-3.5 h-3.5" />
              Push to Discovery
            </Button>
            <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 shrink-0" onClick={deleteProject} data-testid="button-delete-project">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Scrollable section content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-5 py-6 space-y-3">

            {/* §1 — Overview & Protocol */}
            <SectionCard
              id="overview" num={1} title="Overview & Protocol"
              complete={isSectionComplete("overview", local)}
              collapsed={collapsed["overview"]} onToggle={() => toggleCollapse("overview")}
              sectionRef={(el) => { sectionRefs.current["overview"] = el; }}
            >
              <FieldGroup label="Project Title">
                <Input value={local.title} onChange={(e) => setField("title", e.target.value)} data-testid="input-project-title" />
              </FieldGroup>
              <div className="grid grid-cols-2 gap-4">
                <FieldGroup label="Research Domain">
                  <SelectField value={local.researchDomain ?? ""} onChange={(v) => setField("researchDomain", v)} options={DOMAIN_OPTIONS} placeholder="Select domain" testId="select-domain" />
                </FieldGroup>
                <FieldGroup label="Status">
                  <SelectField value={local.status} onChange={(v) => setField("status", v as any)} options={STATUS_OPTIONS.map(o => o.value)} labels={STATUS_OPTIONS.map(o => o.label)} placeholder="Select status" testId="select-status" />
                </FieldGroup>
              </div>
              <FieldGroup label="Project Summary">
                <Textarea value={local.description ?? ""} onChange={(e) => setField("description", e.target.value)} rows={4} className="resize-none" data-testid="input-description" />
              </FieldGroup>
              <FieldGroup label="Keywords">
                <TagInput tags={local.keywords ?? []} onChange={(t) => setField("keywords", t)} placeholder="Add keyword, press Enter" testId="input-keywords" />
              </FieldGroup>
              {/* Protocol registration */}
              <div className="border-t border-border/50 pt-4 space-y-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Protocol Registration</p>
                <div className="grid grid-cols-2 gap-4">
                  <FieldGroup label="PROSPERO / Registration ID">
                    <Input
                      value={(local as any).prosperoId ?? ""}
                      onChange={(e) => setField("prosperoId" as any, e.target.value)}
                      placeholder="e.g. CRD42024..."
                      data-testid="input-prospero-id"
                    />
                  </FieldGroup>
                  <FieldGroup label="Protocol Version">
                    <Input
                      value={(local as any).protocolVersion ?? ""}
                      onChange={(e) => setField("protocolVersion" as any, e.target.value)}
                      placeholder="e.g. v1.0"
                      data-testid="input-protocol-version"
                    />
                  </FieldGroup>
                </div>
                {/* Protocol lock */}
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/10">
                  {(local as any).protocolLockedAt ? (
                    <>
                      <Lock className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground">Protocol locked</p>
                        <p className="text-[10px] text-muted-foreground">
                          Locked {new Date((local as any).protocolLockedAt).toLocaleDateString()} · Deviations must be documented
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1.5 shrink-0"
                        onClick={() => saveSection("Protocol", { protocolLockedAt: null as any })}
                        disabled={!!saving}
                        data-testid="button-unlock-protocol"
                      >
                        <Unlock className="w-3.5 h-3.5" /> Unlock
                      </Button>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground">Protocol unlocked</p>
                        <p className="text-[10px] text-muted-foreground">Lock before collecting data to maintain preregistration integrity</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1.5 shrink-0 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
                        onClick={() => saveSection("Protocol", { protocolLockedAt: new Date().toISOString() as any })}
                        disabled={!!saving}
                        data-testid="button-lock-protocol"
                      >
                        <Lock className="w-3.5 h-3.5" /> Lock Protocol
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {(local as any).protocolLockedAt && (
                <ProtocolDeviationLog project={local} onSave={saveSection} saving={saving} />
              )}
              <SaveButton label="Overview" saving={saving} onClick={() => saveSection("Overview", {
                title: local.title, researchDomain: local.researchDomain, description: local.description,
                status: local.status, keywords: local.keywords,
                prosperoId: (local as any).prosperoId, protocolVersion: (local as any).protocolVersion,
              })} />
            </SectionCard>

            {/* §2 — Research Question */}
            <SectionCard id="research-q" num={2} title="Research Question"
              complete={isSectionComplete("research-q", local)}
              collapsed={collapsed["research-q"]} onToggle={() => toggleCollapse("research-q")}
              sectionRef={(el) => { sectionRefs.current["research-q"] = el; }}
            >
              <FieldGroup label="Primary Research Question">
                <Input value={local.primaryResearchQuestion ?? ""} onChange={(e) => setField("primaryResearchQuestion", e.target.value)} data-testid="input-research-question" />
              </FieldGroup>
              <FieldGroup label="Hypothesis">
                <Textarea value={local.hypothesis ?? ""} onChange={(e) => setField("hypothesis", e.target.value)} rows={3} className="resize-none" data-testid="input-hypothesis" />
              </FieldGroup>
              <FieldGroup label="Scientific Rationale">
                <Textarea value={local.scientificRationale ?? ""} onChange={(e) => setField("scientificRationale", e.target.value)} rows={4} className="resize-none" data-testid="input-rationale" />
              </FieldGroup>
              <SaveButton label="Research Question" saving={saving} onClick={() => saveSection("Research Question", {
                primaryResearchQuestion: local.primaryResearchQuestion,
                hypothesis: local.hypothesis, scientificRationale: local.scientificRationale,
              })} />
              <div className="border-t border-border/50 pt-4 space-y-4">
                <SectionLabel>PICO Framework</SectionLabel>
                <PicoHelper project={local} onSave={saveSection} saving={saving} />
                <SectionLabel>Hypothesis Builder</SectionLabel>
                <HypothesisBuilder project={local} onSave={saveSection} saving={saving} />
              </div>
            </SectionCard>

            {/* §3 — Eligibility Criteria */}
            <SectionCard id="eligibility" num={3} title="Eligibility Criteria"
              complete={isSectionComplete("eligibility", local)}
              collapsed={collapsed["eligibility"]} onToggle={() => toggleCollapse("eligibility")}
              sectionRef={(el) => { sectionRefs.current["eligibility"] = el; }}
            >
              <EligibilityCriteriaSection project={local} onSave={saveSection} saving={saving} />
            </SectionCard>

            {/* §4 — Search Strategy */}
            <SectionCard id="search-strategy" num={4} title="Search Strategy"
              complete={isSectionComplete("search-strategy", local)}
              collapsed={collapsed["search-strategy"]} onToggle={() => toggleCollapse("search-strategy")}
              sectionRef={(el) => { sectionRefs.current["search-strategy"] = el; }}
            >
              <SearchStrategySection project={local} onSave={saveSection} saving={saving} headers={researcherHeaders} />
            </SectionCard>

            {/* §5 — Screening & PRISMA */}
            <SectionCard id="screening" num={5} title="Screening & PRISMA"
              complete={isSectionComplete("screening", local)}
              collapsed={collapsed["screening"]} onToggle={() => toggleCollapse("screening")}
              sectionRef={(el) => { sectionRefs.current["screening"] = el; }}
            >
              <ScreeningSection project={local} onSave={saveSection} saving={saving} headers={researcherHeaders} />
            </SectionCard>

            {/* §6 — Literature Context */}
            <SectionCard id="literature" num={6} title="Literature Context"
              complete={isSectionComplete("literature", local)}
              collapsed={collapsed["literature"]} onToggle={() => toggleCollapse("literature")}
              sectionRef={(el) => { sectionRefs.current["literature"] = el; }}
            >
              <FieldGroup label="Key Papers">
                <PapersList papers={local.keyPapers ?? []} onChange={(p) => setField("keyPapers", p)} />
              </FieldGroup>
              <FieldGroup label="Conflicting Evidence">
                <Textarea value={local.conflictingEvidence ?? ""} onChange={(e) => setField("conflictingEvidence", e.target.value)} rows={3} className="resize-none" data-testid="input-conflicting-evidence" />
              </FieldGroup>
              <FieldGroup label="Literature Gap">
                <Textarea value={local.literatureGap ?? ""} onChange={(e) => setField("literatureGap", e.target.value)} rows={3} className="resize-none" data-testid="input-literature-gap" />
              </FieldGroup>
              <SaveButton label="Literature" saving={saving} onClick={() => saveSection("Literature", {
                keyPapers: local.keyPapers, conflictingEvidence: local.conflictingEvidence, literatureGap: local.literatureGap,
              })} />
            </SectionCard>

            {/* §7 — Methods & Protocol */}
            <SectionCard id="methods" num={7} title="Methods & Protocol"
              complete={isSectionComplete("methods", local)}
              collapsed={collapsed["methods"]} onToggle={() => toggleCollapse("methods")}
              sectionRef={(el) => { sectionRefs.current["methods"] = el; }}
            >
              <FieldGroup label="Research Methodology">
                <SelectField value={local.methodology ?? ""} onChange={(v) => setField("methodology", v)} options={METHODOLOGY_OPTIONS} placeholder="Select methodology" testId="select-methodology" />
              </FieldGroup>
              <FieldGroup label="Experimental Design">
                <Textarea value={local.experimentalDesign ?? ""} onChange={(e) => setField("experimentalDesign", e.target.value)} rows={4} className="resize-none" data-testid="input-experimental-design" />
              </FieldGroup>
              <FieldGroup label="Key Technologies">
                <TagInput tags={local.keyTechnologies ?? []} onChange={(t) => setField("keyTechnologies", t)} placeholder="Add technology, press Enter" testId="input-technologies" />
              </FieldGroup>
              <FieldGroup label="Datasets Used">
                <DatasetsList datasets={local.datasetsUsed ?? []} onChange={(d) => setField("datasetsUsed", d)} />
              </FieldGroup>
              <FieldGroup label="Attachments">
                <SectionFileUpload projectId={projectId} section="section4" files={local.section4Files ?? []} maxFiles={3}
                  onUploaded={(url) => { const next = [...(local.section4Files ?? []), url]; setField("section4Files", next); saveSection("Methods", { section4Files: next }); }}
                  onRemove={(url) => { const next = (local.section4Files ?? []).filter((f) => f !== url); setField("section4Files", next); saveSection("Methods", { section4Files: next }); }}
                  headers={researcherHeaders} />
              </FieldGroup>
              <SaveButton label="Methods" saving={saving} onClick={() => saveSection("Methods", {
                methodology: local.methodology, experimentalDesign: local.experimentalDesign,
                keyTechnologies: local.keyTechnologies, datasetsUsed: local.datasetsUsed, section4Files: local.section4Files,
              })} />
              <div className="border-t border-border/50 pt-4">
                <SectionLabel>Protocol Checklist</SectionLabel>
                <ProtocolChecklist project={local} onSave={saveSection} saving={saving} />
              </div>
            </SectionCard>

            {/* §8 — Data Extraction */}
            <SectionCard id="extraction" num={8} title="Data Extraction"
              complete={isSectionComplete("extraction", local)}
              collapsed={collapsed["extraction"]} onToggle={() => toggleCollapse("extraction")}
              sectionRef={(el) => { sectionRefs.current["extraction"] = el; }}
            >
              <DataExtractionSection project={local} onSave={saveSection} saving={saving} />
            </SectionCard>

            {/* §9 — Risk of Bias */}
            <SectionCard id="rob" num={9} title="Risk of Bias Assessment"
              complete={isSectionComplete("rob", local)}
              collapsed={collapsed["rob"]} onToggle={() => toggleCollapse("rob")}
              sectionRef={(el) => { sectionRefs.current["rob"] = el; }}
            >
              <RiskOfBiasSection project={local} onSave={saveSection} saving={saving} />
            </SectionCard>

            {/* §10 — Evidence Synthesis */}
            <SectionCard id="synthesis" num={10} title="Evidence Synthesis"
              complete={isSectionComplete("synthesis", local)}
              collapsed={collapsed["synthesis"]} onToggle={() => toggleCollapse("synthesis")}
              sectionRef={(el) => { sectionRefs.current["synthesis"] = el; }}
            >
              <EvidenceSynthesisSection project={local} onSave={saveSection} saving={saving} />
            </SectionCard>

            {/* §11 — Results & Conclusions */}
            <SectionCard id="results" num={11} title="Results & Conclusions"
              complete={isSectionComplete("results", local)}
              collapsed={collapsed["results"]} onToggle={() => toggleCollapse("results")}
              sectionRef={(el) => { sectionRefs.current["results"] = el; }}
            >
              <ResultsSection project={local} onSave={saveSection} saving={saving} />
            </SectionCard>

            {/* §12 — Discovery Card (merged with Commercialization) */}
            <SectionCard id="discovery" num={12} title="Discovery Card & Commercialization"
              complete={isSectionComplete("discovery", local)}
              collapsed={collapsed["discovery"]} onToggle={() => toggleCollapse("discovery")}
              sectionRef={(el) => { sectionRefs.current["discovery"] = el; }}
            >
              <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/20 text-xs text-violet-700 dark:text-violet-300 mb-4">
                Complete this section to prepare your research for the EdenRadar industry feed. Toggle "Publish to industry" to send to admin review, or use "Push to Discovery Card" to pre-fill a one-page card.
              </div>
              {/* Commercialization signals */}
              <SectionLabel>Commercialization Signals</SectionLabel>
              <div className="space-y-4 mb-6">
                <FieldGroup label="Potential Applications">
                  <Textarea value={local.potentialApplications ?? ""} onChange={(e) => setField("potentialApplications", e.target.value)} rows={3} className="resize-none" data-testid="input-applications" />
                </FieldGroup>
                <div className="grid grid-cols-2 gap-4">
                  <FieldGroup label="Industry Relevance">
                    <SelectField value={local.industryRelevance ?? ""} onChange={(v) => setField("industryRelevance", v)} options={INDUSTRY_REL_OPTIONS} placeholder="Select industry" testId="select-industry-relevance" />
                  </FieldGroup>
                  <FieldGroup label="Patent Status">
                    <SelectField value={local.patentStatus ?? ""} onChange={(v) => setField("patentStatus", v)} options={PATENT_STATUS_OPTIONS} placeholder="Select patent status" testId="select-patent-status" />
                  </FieldGroup>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FieldGroup label="Startup Potential">
                    <SelectField value={local.startupPotential ?? ""} onChange={(v) => setField("startupPotential", v)} options={STARTUP_OPTIONS} placeholder="Select potential" testId="select-startup-potential" />
                  </FieldGroup>
                </div>
                <FieldGroup label="Potential Partners">
                  <PotentialPartnersList partners={local.potentialPartners ?? []} onChange={(p) => setField("potentialPartners", p)} />
                </FieldGroup>
              </div>

              {/* Discovery card fields */}
              <SectionLabel>Industry Discovery Card</SectionLabel>
              <div className="space-y-4">
                <FieldGroup label="Publish to Industry">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Switch checked={local.publishToIndustry === true}
                      onCheckedChange={(v) => { setField("publishToIndustry", v); saveSection(v ? "Publish request" : "Unpublish", { publishToIndustry: v }); }}
                      data-testid="switch-publish-industry" />
                    <span className="text-sm text-muted-foreground">
                      {local.publishToIndustry ? "Submitted for industry visibility" : "Off — project is private"}
                    </span>
                  </div>
                </FieldGroup>
                <FieldGroup label="Discovery Title">
                  <Input value={local.discoveryTitle ?? ""} onChange={(e) => setField("discoveryTitle", e.target.value)} data-testid="input-discovery-title" />
                </FieldGroup>
                <FieldGroup label="Discovery Summary">
                  <Textarea value={local.discoverySummary ?? ""} onChange={(e) => setField("discoverySummary", e.target.value)} rows={4} className="resize-none" placeholder="Summarise for an industry audience..." data-testid="input-discovery-summary" />
                </FieldGroup>
                <div className="grid grid-cols-2 gap-4">
                  <FieldGroup label="Technology Type">
                    <SelectField value={local.technologyType ?? ""} onChange={(v) => setField("technologyType", v)} options={TECH_TYPE_OPTIONS} placeholder="Select type" testId="select-tech-type" />
                  </FieldGroup>
                  <FieldGroup label="Development Stage">
                    <SelectField value={local.developmentStage ?? ""} onChange={(v) => setField("developmentStage", v)} options={DEV_STAGE_OPTIONS} placeholder="Select stage" testId="select-dev-stage" />
                  </FieldGroup>
                </div>
                <FieldGroup label="Seeking">
                  <MultiSelect options={SEEKING_OPTIONS} selected={local.projectSeeking ?? []} onChange={(v) => setField("projectSeeking", v)} testId="multiselect-seeking" />
                </FieldGroup>
                <div className="flex items-center gap-2">
                  <SaveButton label="My Project" saving={saving} onClick={() => saveSection("My Project", {
                    potentialApplications: local.potentialApplications, industryRelevance: local.industryRelevance,
                    patentStatus: local.patentStatus, startupPotential: local.startupPotential,
                    potentialPartners: local.potentialPartners, discoveryTitle: local.discoveryTitle,
                    discoverySummary: local.discoverySummary, technologyType: local.technologyType,
                    developmentStage: local.developmentStage, projectSeeking: local.projectSeeking,
                  })} />
                  <Button variant="outline" size="sm" className="gap-1.5 border-violet-500/40 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10"
                    onClick={pushToDiscovery} data-testid="button-push-discovery-section">
                    <ArrowRight className="w-3.5 h-3.5" />
                    Push to Discovery Card
                  </Button>
                </div>
              </div>
            </SectionCard>

            {/* §13 — Dissemination Plan */}
            <SectionCard id="dissemination" num={13} title="Dissemination Plan"
              complete={isSectionComplete("dissemination", local)}
              collapsed={collapsed["dissemination"]} onToggle={() => toggleCollapse("dissemination")}
              sectionRef={(el) => { sectionRefs.current["dissemination"] = el; }}
            >
              <DisseminationSection project={local} onSave={saveSection} saving={saving} />
            </SectionCard>

            {/* ── Project management sections (unnumbered) ─────────────────── */}
            <div className="border-t border-border/60 pt-2 mt-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1 pb-2">Project Management</p>
            </div>

            {/* Collaboration */}
            <SectionCard id="collab" num={null} title="Collaboration"
              complete={isSectionComplete("collab", local)}
              collapsed={collapsed["collab"]} onToggle={() => toggleCollapse("collab")}
              sectionRef={(el) => { sectionRefs.current["collab"] = el; }}
            >
              <FieldGroup label="Project Contributors">
                <ContributorsList contributors={local.projectContributors ?? []} onChange={(c) => setField("projectContributors", c)} />
              </FieldGroup>
              <FieldGroup label="Open for Collaboration">
                <div className="flex items-center gap-2">
                  <Switch checked={local.openForCollaboration ?? false} onCheckedChange={(v) => setField("openForCollaboration", v)} data-testid="switch-open-collab" />
                  <span className="text-sm text-muted-foreground">{local.openForCollaboration ? "Yes" : "No"}</span>
                </div>
              </FieldGroup>
              <FieldGroup label="Collaboration Type">
                <MultiSelect options={COLLAB_TYPE_OPTIONS} selected={local.collaborationType ?? []} onChange={(v) => setField("collaborationType", v)} testId="multiselect-collab-type" />
              </FieldGroup>
              <SaveButton label="Collaboration" saving={saving} onClick={() => saveSection("Collaboration", {
                projectContributors: local.projectContributors, openForCollaboration: local.openForCollaboration, collaborationType: local.collaborationType,
              })} />
            </SectionCard>

            {/* Funding */}
            <SectionCard id="funding" num={null} title="Funding"
              complete={isSectionComplete("funding", local)}
              collapsed={collapsed["funding"]} onToggle={() => toggleCollapse("funding")}
              sectionRef={(el) => { sectionRefs.current["funding"] = el; }}
            >
              <FieldGroup label="Funding Status">
                <SelectField value={local.fundingStatus ?? ""} onChange={(v) => setField("fundingStatus", v)} options={FUNDING_STATUS_OPTIONS} placeholder="Select funding status" testId="select-funding-status" />
              </FieldGroup>
              <FieldGroup label="Funding Sources">
                <TagInput tags={local.fundingSources ?? []} onChange={(t) => setField("fundingSources", t)} placeholder="e.g. NIH, NSF (press Enter)" testId="input-funding-sources" />
              </FieldGroup>
              <FieldGroup label="Estimated Budget (USD)">
                <Input type="number" value={local.estimatedBudget ?? ""} onChange={(e) => setField("estimatedBudget", e.target.value ? parseInt(e.target.value) : null)} placeholder="e.g. 250000" data-testid="input-budget" />
              </FieldGroup>
              <FieldGroup label="Attachments">
                <SectionFileUpload projectId={projectId} section="section8" files={local.section8Files ?? []} maxFiles={3}
                  onUploaded={(url) => { const next = [...(local.section8Files ?? []), url]; setField("section8Files", next); saveSection("Funding", { section8Files: next }); }}
                  onRemove={(url) => { const next = (local.section8Files ?? []).filter((f) => f !== url); setField("section8Files", next); saveSection("Funding", { section8Files: next }); }}
                  headers={researcherHeaders} />
              </FieldGroup>
              <SaveButton label="Funding" saving={saving} onClick={() => saveSection("Funding", {
                fundingStatus: local.fundingStatus, fundingSources: local.fundingSources,
                estimatedBudget: local.estimatedBudget, section8Files: local.section8Files,
              })} />
            </SectionCard>

            {/* Milestones */}
            <SectionCard id="milestones" num={null} title="Milestones & Timeline"
              complete={isSectionComplete("milestones", local)}
              collapsed={collapsed["milestones"]} onToggle={() => toggleCollapse("milestones")}
              sectionRef={(el) => { sectionRefs.current["milestones"] = el; }}
            >
              <VisualTimeline project={local} onSave={saveSection} saving={saving} />
              <div className="mt-4 pt-4 border-t border-border/50">
                <FieldGroup label="Next Experiments / Tasks">
                  <ExperimentChecklist items={local.nextExperiments ?? []} onChange={(e) => setField("nextExperiments", e)} />
                </FieldGroup>
                <FieldGroup label="Success Criteria">
                  <Textarea value={local.successCriteria ?? ""} onChange={(e) => setField("successCriteria", e.target.value)} rows={3} className="resize-none" data-testid="input-success-criteria" />
                </FieldGroup>
                <SaveButton label="Milestones" saving={saving} onClick={() => saveSection("Milestones", {
                  nextExperiments: local.nextExperiments, expectedTimeline: local.expectedTimeline, successCriteria: local.successCriteria,
                })} />
              </div>
            </SectionCard>

            {/* Risk Assessment */}
            <SectionCard id="risk" num={null} title="Risk Assessment"
              complete={isSectionComplete("risk", local)}
              collapsed={collapsed["risk"]} onToggle={() => toggleCollapse("risk")}
              sectionRef={(el) => { sectionRefs.current["risk"] = el; }}
            >
              <div className="grid grid-cols-2 gap-4">
                <FieldGroup label="Technical Risk">
                  <SelectField value={local.technicalRisk ?? ""} onChange={(v) => setField("technicalRisk", v)} options={RISK_OPTIONS} placeholder="Select level" testId="select-technical-risk" />
                </FieldGroup>
                <FieldGroup label="Regulatory Risk">
                  <SelectField value={local.regulatoryRisk ?? ""} onChange={(v) => setField("regulatoryRisk", v)} options={RISK_OPTIONS} placeholder="Select level" testId="select-regulatory-risk" />
                </FieldGroup>
              </div>
              <FieldGroup label="Key Scientific Unknowns">
                <Textarea value={local.keyScientificUnknowns ?? ""} onChange={(e) => setField("keyScientificUnknowns", e.target.value)} rows={4} className="resize-none" data-testid="input-scientific-unknowns" />
              </FieldGroup>
              <SaveButton label="Risk" saving={saving} onClick={() => saveSection("Risk", {
                technicalRisk: local.technicalRisk, regulatoryRisk: local.regulatoryRisk, keyScientificUnknowns: local.keyScientificUnknowns,
              })} />
            </SectionCard>

            {/* General Attachments */}
            <div className="border border-border rounded-xl bg-card overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2.5 border-b border-border/50">
                <Paperclip className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">General Attachments</span>
                <span className="text-xs text-muted-foreground ml-auto">Max 5 files</span>
              </div>
              <div className="px-4 pb-4 pt-3">
                <SectionFileUpload projectId={projectId} section="general" files={local.generalFiles ?? []} maxFiles={5}
                  onUploaded={(url) => { const next = [...(local.generalFiles ?? []), url]; setField("generalFiles", next); saveSection("My Project", { generalFiles: next }); }}
                  onRemove={(url) => { const next = (local.generalFiles ?? []).filter((f) => f !== url); setField("generalFiles", next); saveSection("My Project", { generalFiles: next }); }}
                  headers={researcherHeaders} enableDragDrop />
              </div>
            </div>

            <div className="h-16" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pl-3 border-l-2 border-violet-500 mb-3">
      <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-widest">{children}</span>
    </div>
  );
}

function SectionCard({
  id, num, title, children, collapsed, onToggle, sectionRef, complete,
}: {
  id: string; num: number | null; title: string; children: React.ReactNode;
  collapsed: boolean; onToggle: () => void;
  sectionRef: (el: HTMLElement | null) => void;
  complete: boolean;
}) {
  return (
    <div
      id={`section-${id}`}
      ref={sectionRef}
      className="border border-border rounded-xl bg-card overflow-hidden"
      data-testid={`section-${id}`}
    >
      <button
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-accent/30 transition-colors"
        onClick={onToggle}
        data-testid={`toggle-section-${id}`}
      >
        <div className="flex items-center gap-3">
          {complete ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : (
            <Circle className="w-4 h-4 text-border shrink-0" />
          )}
          <div className="flex items-center gap-2">
            {num !== null && (
              <span className="w-5 h-5 rounded-full bg-violet-600/10 text-violet-600 dark:text-violet-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                {num}
              </span>
            )}
            <span className="text-sm font-semibold text-foreground">{title}</span>
          </div>
        </div>
        {collapsed
          ? <ChevronRight className="w-4 h-4 text-muted-foreground" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground" />
        }
      </button>
      {!collapsed && (
        <div className="px-4 pb-5 pt-1 space-y-4 border-t border-border/40">
          {children}
        </div>
      )}
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function SaveButton({ label, saving, onClick }: { label: string; saving: string | null; onClick: () => void }) {
  const isSaving = saving === label;
  return (
    <div className="flex justify-end pt-2">
      <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white" onClick={onClick} disabled={!!saving}
        data-testid={`button-save-${label.toLowerCase().replace(/\s+/g, "-")}`}>
        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        Save
      </Button>
    </div>
  );
}

function SelectField({ value, onChange, options, labels, placeholder, testId }: {
  value: string; onChange: (v: string) => void; options: string[]; labels?: string[]; placeholder: string; testId: string;
}) {
  return (
    <Select value={value || "__placeholder__"} onValueChange={(v) => onChange(v === "__placeholder__" ? "" : v)}>
      <SelectTrigger data-testid={testId}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__placeholder__"><span className="text-muted-foreground">{placeholder}</span></SelectItem>
        {options.map((opt, i) => <SelectItem key={opt} value={opt}>{labels?.[i] ?? opt}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function TagInput({ tags, onChange, placeholder, testId }: { tags: string[]; onChange: (t: string[]) => void; placeholder: string; testId: string }) {
  const [input, setInput] = useState("");
  function add() { const v = input.trim(); if (v && !tags.includes(v)) onChange([...tags, v]); setInput(""); }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder} data-testid={testId} className="flex-1" />
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!input.trim()}><Plus className="w-3.5 h-3.5" /></Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t, i) => (
            <Badge key={i} variant="secondary" className="gap-1 text-xs">{t}
              <button onClick={() => onChange(tags.filter((_, j) => j !== i))} className="hover:text-destructive" data-testid={`remove-tag-${i}`}>
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function MultiSelect({ options, selected, onChange, testId }: { options: string[]; selected: string[]; onChange: (v: string[]) => void; testId: string }) {
  return (
    <div className="flex flex-wrap gap-2" data-testid={testId}>
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button key={opt} onClick={() => onChange(active ? selected.filter((s) => s !== opt) : [...selected, opt])}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              active ? "bg-violet-600/10 border-violet-500/40 text-violet-600 dark:text-violet-400"
              : "border-border text-muted-foreground hover:border-violet-500/30 hover:text-foreground"
            }`}
            data-testid={`option-${opt.replace(/\s+/g,"-").toLowerCase()}`}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function PapersList({ papers, onChange }: { papers: Paper[]; onChange: (p: Paper[]) => void }) {
  function update(i: number, key: keyof Paper, val: string) { onChange(papers.map((p, j) => j === i ? { ...p, [key]: val } : p)); }
  function add() { onChange([...papers, { paper_title: "", authors: "", journal: "", year: "", paper_link: "", notes: "" }]); }
  function remove(i: number) { onChange(papers.filter((_, j) => j !== i)); }
  return (
    <div className="space-y-3">
      {papers.map((p, i) => (
        <div key={i} className="border border-border rounded-lg p-3 space-y-2 bg-background" data-testid={`paper-${i}`}>
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-muted-foreground">Paper {i + 1}</span>
            <button onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive" data-testid={`remove-paper-${i}`}><X className="w-3.5 h-3.5" /></button>
          </div>
          <Input placeholder="Title" value={p.paper_title} onChange={(e) => update(i, "paper_title", e.target.value)} className="text-xs" />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Authors" value={p.authors} onChange={(e) => update(i, "authors", e.target.value)} className="text-xs" />
            <Input placeholder="Journal" value={p.journal} onChange={(e) => update(i, "journal", e.target.value)} className="text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Year" value={p.year} onChange={(e) => update(i, "year", e.target.value)} className="text-xs" />
            <Input placeholder="Link (URL)" value={p.paper_link} onChange={(e) => update(i, "paper_link", e.target.value)} className="text-xs" />
          </div>
          <Textarea placeholder="Notes" value={p.notes} onChange={(e) => update(i, "notes", e.target.value)} rows={2} className="text-xs resize-none" />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs w-full" onClick={add} data-testid="add-paper">
        <Plus className="w-3.5 h-3.5" /> Add Paper
      </Button>
    </div>
  );
}

function DatasetsList({ datasets, onChange }: { datasets: Dataset[]; onChange: (d: Dataset[]) => void }) {
  function update(i: number, key: keyof Dataset, val: string) { onChange(datasets.map((d, j) => j === i ? { ...d, [key]: val } : d)); }
  function add() { onChange([...datasets, { dataset_name: "", dataset_source: "", dataset_link: "", notes: "" }]); }
  function remove(i: number) { onChange(datasets.filter((_, j) => j !== i)); }
  return (
    <div className="space-y-3">
      {datasets.map((d, i) => (
        <div key={i} className="border border-border rounded-lg p-3 space-y-2 bg-background" data-testid={`dataset-${i}`}>
          <div className="flex justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Dataset {i + 1}</span>
            <button onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive" data-testid={`remove-dataset-${i}`}><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Name" value={d.dataset_name} onChange={(e) => update(i, "dataset_name", e.target.value)} className="text-xs" />
            <Input placeholder="Source" value={d.dataset_source} onChange={(e) => update(i, "dataset_source", e.target.value)} className="text-xs" />
          </div>
          <Input placeholder="Link (URL)" value={d.dataset_link} onChange={(e) => update(i, "dataset_link", e.target.value)} className="text-xs" />
          <Textarea placeholder="Notes" value={d.notes} onChange={(e) => update(i, "notes", e.target.value)} rows={2} className="text-xs resize-none" />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs w-full" onClick={add} data-testid="add-dataset">
        <Plus className="w-3.5 h-3.5" /> Add Dataset
      </Button>
    </div>
  );
}

function ContributorsList({ contributors, onChange }: { contributors: Contributor[]; onChange: (c: Contributor[]) => void }) {
  function update(i: number, key: keyof Contributor, val: string) { onChange(contributors.map((c, j) => j === i ? { ...c, [key]: val } : c)); }
  function add() { onChange([...contributors, { name: "", institution: "", role: "", email: "" }]); }
  function remove(i: number) { onChange(contributors.filter((_, j) => j !== i)); }
  return (
    <div className="space-y-3">
      {contributors.map((c, i) => (
        <div key={i} className="border border-border rounded-lg p-3 space-y-2 bg-background" data-testid={`contributor-${i}`}>
          <div className="flex justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Contributor {i + 1}</span>
            <button onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive" data-testid={`remove-contributor-${i}`}><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Name" value={c.name} onChange={(e) => update(i, "name", e.target.value)} className="text-xs" />
            <Input placeholder="Institution" value={c.institution} onChange={(e) => update(i, "institution", e.target.value)} className="text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Role" value={c.role} onChange={(e) => update(i, "role", e.target.value)} className="text-xs" />
            <Input placeholder="Email" value={c.email} onChange={(e) => update(i, "email", e.target.value)} className="text-xs" />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs w-full" onClick={add} data-testid="add-contributor">
        <Plus className="w-3.5 h-3.5" /> Add Contributor
      </Button>
    </div>
  );
}

function ExperimentChecklist({ items, onChange }: { items: Experiment[]; onChange: (e: Experiment[]) => void }) {
  const [input, setInput] = useState("");
  function add() { const v = input.trim(); if (v) { onChange([...items, { label: v, done: false }]); setInput(""); } }
  function toggle(i: number) { onChange(items.map((e, j) => j === i ? { ...e, done: !e.done } : e)); }
  function remove(i: number) { onChange(items.filter((_, j) => j !== i)); }
  return (
    <div className="space-y-2">
      {items.map((e, i) => (
        <div key={i} className="flex items-center gap-2" data-testid={`experiment-${i}`}>
          <input type="checkbox" checked={e.done} onChange={() => toggle(i)} className="accent-violet-600 w-4 h-4 cursor-pointer" data-testid={`check-experiment-${i}`} />
          <span className={`flex-1 text-sm ${e.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{e.label}</span>
          <button onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive" data-testid={`remove-experiment-${i}`}><X className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add experiment / task, press Enter" className="text-xs" data-testid="input-experiment" />
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!input.trim()} data-testid="add-experiment"><Plus className="w-3.5 h-3.5" /></Button>
      </div>
    </div>
  );
}

function PotentialPartnersList({ partners, onChange }: { partners: Partner[]; onChange: (p: Partner[]) => void }) {
  function update(i: number, key: keyof Partner, val: string) { onChange(partners.map((p, j) => j === i ? { ...p, [key]: val } : p)); }
  function add() { onChange([...partners, { name: "", website: "", status: "No Contact", outreachDate: "", contactName: "" }]); }
  function remove(i: number) { onChange(partners.filter((_, j) => j !== i)); }
  return (
    <div className="space-y-3">
      {partners.map((p, i) => (
        <div key={i} className="border border-border rounded-lg p-3 space-y-2 bg-background" data-testid={`partner-${i}`}>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Partner {i + 1}</span>
            </div>
            <button onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive" data-testid={`remove-partner-${i}`}><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Company / Organization" value={p.name} onChange={(e) => update(i, "name", e.target.value)} className="text-xs" data-testid={`partner-name-${i}`} />
            <Input placeholder="Contact Name" value={p.contactName} onChange={(e) => update(i, "contactName", e.target.value)} className="text-xs" data-testid={`partner-contact-${i}`} />
          </div>
          <div className="flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Input placeholder="Website URL" value={p.website} onChange={(e) => update(i, "website", e.target.value)} className="text-xs flex-1" data-testid={`partner-website-${i}`} />
            {p.website && <a href={p.website.startsWith("http") ? p.website : `https://${p.website}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" /></a>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={p.status || "No Contact"} onValueChange={(v) => update(i, "status", v)}>
              <SelectTrigger className="text-xs" data-testid={`partner-status-${i}`}><SelectValue /></SelectTrigger>
              <SelectContent>{PARTNER_STATUS_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="date" value={p.outreachDate} onChange={(e) => update(i, "outreachDate", e.target.value)} className="text-xs" data-testid={`partner-date-${i}`} />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs w-full" onClick={add} data-testid="add-partner">
        <Plus className="w-3.5 h-3.5" /> Add Partner
      </Button>
    </div>
  );
}

function SectionFileUpload({
  projectId, section, files, maxFiles, onUploaded, onRemove, headers, enableDragDrop,
}: {
  projectId: number; section: string; files: string[]; maxFiles: number;
  onUploaded: (url: string) => void; onRemove: (url: string) => void;
  headers: Record<string, string>; enableDragDrop?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const { toast } = useToast();

  async function uploadFile(file: File) {
    if (files.length >= maxFiles) { toast({ title: `Max ${maxFiles} files allowed`, variant: "destructive" }); return; }
    if (file.size > 10 * 1024 * 1024) { toast({ title: "File too large (max 10 MB)", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const r = await fetch(`/api/research/projects/${projectId}/files?section=${section}`, { method: "POST", headers, body: formData });
      if (!r.ok) { const err = await r.json().catch(() => ({ error: "Upload failed" })); throw new Error(err.error || "Upload failed"); }
      const { url } = await r.json();
      onUploaded(url);
      toast({ title: "File uploaded" });
    } catch (err: any) {
      toast({ title: err.message || "Upload failed", variant: "destructive" });
    } finally { setUploading(false); }
  }

  function fileName(url: string) {
    try { const parts = url.split("/"); return decodeURIComponent(parts[parts.length - 1].replace(/^\d+-/, "")); } catch { return url; }
  }

  return (
    <div className="space-y-2">
      {files.map((f, i) => (
        <div key={i} className="flex items-center gap-2 p-2 rounded-md border border-border bg-background" data-testid={`file-${section}-${i}`}>
          <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <a href={f} target="_blank" rel="noopener noreferrer" className="flex-1 text-xs text-foreground hover:text-violet-600 dark:hover:text-violet-400 truncate">{fileName(f)}</a>
          <button onClick={() => onRemove(f)} className="text-muted-foreground hover:text-destructive shrink-0" data-testid={`remove-file-${section}-${i}`}><X className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      {files.length < maxFiles && (
        <label
          className={`flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed cursor-pointer transition-colors ${enableDragDrop ? "p-6" : "p-3"} ${
            dragOver ? "border-violet-500 bg-violet-500/10" : "border-border hover:border-violet-500/40 hover:bg-violet-500/5"
          } ${uploading ? "pointer-events-none opacity-60" : ""}`}
          data-testid={`upload-${section}`}
          onDrop={enableDragDrop ? (e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) uploadFile(f); } : undefined}
          onDragOver={enableDragDrop ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
          onDragLeave={enableDragDrop ? () => setDragOver(false) : undefined}
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin text-violet-600" /> : <Upload className="w-4 h-4 text-muted-foreground" />}
          <span className="text-xs text-muted-foreground">
            {uploading ? "Uploading..." : enableDragDrop ? `Drag & drop or click to upload (${files.length}/${maxFiles})` : `Upload file (${files.length}/${maxFiles})`}
          </span>
          <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} disabled={uploading} />
        </label>
      )}
    </div>
  );
}
