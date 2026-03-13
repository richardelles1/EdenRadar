import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Save, Loader2, Trash2, Plus, X, ChevronDown, ChevronUp,
  FlaskConical, ExternalLink, ArrowRight, Download,
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

type Paper = { paper_title: string; authors: string; journal: string; year: string; paper_link: string; notes: string };
type Dataset = { dataset_name: string; dataset_source: string; dataset_link: string; notes: string };
type Contributor = { name: string; institution: string; role: string; email: string };
type Experiment = { label: string; done: boolean };
type EvidenceLink = { url: string; label: string };

const SECTION_META = [
  { id: "overview",    num: 1,  label: "Overview",          short: "Overview" },
  { id: "research-q",  num: 2,  label: "Research Question", short: "Res. Question" },
  { id: "literature",  num: 3,  label: "Literature",        short: "Literature" },
  { id: "methods",     num: 4,  label: "Methods",           short: "Methods" },
  { id: "data",        num: 5,  label: "Data & Evidence",   short: "Data" },
  { id: "commercial",  num: 6,  label: "Commercialization", short: "Commercial" },
  { id: "collab",      num: 7,  label: "Collaboration",     short: "Collaboration" },
  { id: "funding",     num: 8,  label: "Funding",           short: "Funding" },
  { id: "risk",        num: 9,  label: "Risk",              short: "Risk" },
  { id: "milestones",  num: 10, label: "Milestones",        short: "Milestones" },
  { id: "discovery",   num: 11, label: "Discovery Card",    short: "Discovery Card" },
];

const STATUS_OPTIONS = [
  { value: "planning",   label: "Planning",   color: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30" },
  { value: "active",     label: "Active",     color: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30" },
  { value: "on_hold",    label: "On Hold",    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  { value: "completed",  label: "Completed",  color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
];

const DOMAIN_OPTIONS = ["Biotech","Drug Discovery","Genomics","Diagnostics","Medical Devices","AI in Healthcare","Digital Health","Healthcare Systems","Other"];
const METHODOLOGY_OPTIONS = ["Experimental","Computational","Clinical","Observational","Mixed Methods"];
const CONFIDENCE_OPTIONS = ["Conceptual","Early data","Validated in lab","Preclinical evidence","Clinical evidence"];
const INDUSTRY_REL_OPTIONS = ["Pharma","Biotech","Medical Devices","Digital Health","Healthcare Systems"];
const PATENT_STATUS_OPTIONS = ["None","Patent in preparation","Patent filed","Patent granted"];
const STARTUP_OPTIONS = ["Low","Moderate","High"];
const COLLAB_TYPE_OPTIONS = ["Academic collaboration","Industry partnership","Clinical research partner","Startup founder","Investor"];
const FUNDING_STATUS_OPTIONS = ["Not funded","Grant submitted","Grant funded","Industry funded"];
const RISK_OPTIONS = ["Low","Moderate","High"];
const TIMELINE_OPTIONS = ["3 months","6 months","12 months","24 months"];
const TECH_TYPE_OPTIONS = ["Small molecule","Biologic","Gene therapy","Cell therapy","Diagnostic","Medical device","AI/software","Platform technology"];
const DEV_STAGE_OPTIONS = ["Basic research","Translational","Preclinical","Clinical"];
const SEEKING_OPTIONS = ["Licensing partner","Industry collaboration","Startup founder","Investment"];

function getStatusColor(s: string) {
  return STATUS_OPTIONS.find((o) => o.value === s)?.color ?? STATUS_OPTIONS[0].color;
}

function patentToIpStatus(p: string | null | undefined): string {
  if (!p || p === "None") return "No IP";
  if (p === "Patent in preparation") return "Provisional";
  if (p === "Patent filed") return "Patent Pending";
  if (p === "Patent granted") return "Patented";
  return p;
}

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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const navRef = useRef<HTMLDivElement>(null);

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
    if (data?.project) setLocal(data.project);
  }, [data]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const visible: Record<string, number> = {};
    SECTION_META.forEach(({ id }) => {
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
    await fetch(`/api/research/projects/${projectId}`, {
      method: "DELETE", headers: researcherHeaders,
    });
    qc.invalidateQueries({ queryKey: ["/api/research/projects"] });
    navigate("/research/projects");
  }

  async function exportBrief() {
    if (!local) return;
    setPdfGenerating(true);
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

  function toggleCollapse(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function setField<K extends keyof ResearchProject>(key: K, value: ResearchProject[K]) {
    setLocal((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  if (isLoading) return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-16 w-full rounded-lg" />
      {[1,2,3].map(i => <Skeleton key={i} className="h-40 rounded-lg" />)}
    </div>
  );

  if (!local) return (
    <div className="p-6 max-w-3xl mx-auto text-center">
      <p className="text-muted-foreground">Project not found.</p>
      <Button variant="ghost" className="mt-4 gap-2" onClick={() => navigate("/research/projects")} data-testid="button-back-projects">
        <ArrowLeft className="w-4 h-4" /> Back to My Projects
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Page header ── */}
      <div className="shrink-0 border-b border-border bg-background px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/research/projects")} data-testid="button-back-projects">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-foreground truncate" data-testid="text-project-title">{local.title}</h1>
          {local.researchDomain && <p className="text-xs text-muted-foreground">{local.researchDomain}</p>}
        </div>
        <Badge className={`text-xs shrink-0 ${getStatusColor(local.status)}`}>{local.status.replace("_"," ")}</Badge>
        {(() => {
          const r = computeReadinessScore(local);
          return (
            <span
              className={`text-xs font-semibold shrink-0 hidden sm:inline ${r.textColor}`}
              data-testid="text-readiness-score"
            >
              {r.score}/100
            </span>
          );
        })()}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs shrink-0"
          onClick={exportBrief}
          disabled={pdfGenerating}
          data-testid="button-export-brief"
        >
          {pdfGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">Export Brief</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs shrink-0 border-violet-500/40 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10"
          onClick={pushToDiscovery}
          data-testid="button-push-discovery"
        >
          <FlaskConical className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Push to Discovery</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:bg-destructive/10 shrink-0"
          onClick={deleteProject}
          data-testid="button-delete-project"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* ── Stage Navigator ── */}
      <div
        ref={navRef}
        className="shrink-0 border-b border-border bg-muted/30 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        <div className="flex items-center gap-0 px-4 min-w-max">
          {SECTION_META.map((sec, i) => (
            <div key={sec.id} className="flex items-center">
              <button
                onClick={() => scrollToSection(sec.id)}
                data-testid={`nav-section-${sec.id}`}
                className={`flex flex-col items-center gap-0.5 px-3 py-2.5 transition-all group ${
                  activeSection === sec.id
                    ? "text-violet-600 dark:text-violet-400"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className={`text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                  activeSection === sec.id
                    ? "bg-violet-600 text-white"
                    : "bg-border text-muted-foreground group-hover:bg-violet-500/20 group-hover:text-violet-500"
                }`}>
                  {sec.num}
                </span>
                <span className="text-[10px] font-medium whitespace-nowrap hidden sm:block">{sec.short}</span>
              </button>
              {i < SECTION_META.length - 1 && (
                <div className={`w-6 h-px shrink-0 transition-colors ${
                  activeSection === sec.id || SECTION_META[i + 1]?.id === activeSection
                    ? "bg-violet-500/40"
                    : "bg-border"
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

          {/* §1 — Overview */}
          <SectionCard
            id="overview" num={1} title="Project Overview"
            collapsed={collapsed["overview"]} onToggle={() => toggleCollapse("overview")}
            sectionRef={(el) => { sectionRefs.current["overview"] = el; }}
          >
            <FieldGroup label="Project Title">
              <Input value={local.title} onChange={(e) => setField("title", e.target.value)} data-testid="input-project-title" />
            </FieldGroup>
            <FieldGroup label="Research Domain">
              <SelectField value={local.researchDomain ?? ""} onChange={(v) => setField("researchDomain", v)} options={DOMAIN_OPTIONS} placeholder="Select domain" testId="select-domain" />
            </FieldGroup>
            <FieldGroup label="Project Summary">
              <Textarea value={local.description ?? ""} onChange={(e) => setField("description", e.target.value)} rows={4} className="resize-none" data-testid="input-description" />
            </FieldGroup>
            <FieldGroup label="Status">
              <SelectField value={local.status} onChange={(v) => setField("status", v as any)} options={STATUS_OPTIONS.map(o => o.value)} labels={STATUS_OPTIONS.map(o => o.label)} placeholder="Select status" testId="select-status" />
            </FieldGroup>
            <FieldGroup label="Keywords">
              <TagInput tags={local.keywords ?? []} onChange={(t) => setField("keywords", t)} placeholder="Add keyword, press Enter" testId="input-keywords" />
            </FieldGroup>
            <SaveButton label="Overview" saving={saving} onClick={() => saveSection("Overview", {
              title: local.title, researchDomain: local.researchDomain, description: local.description,
              status: local.status, keywords: local.keywords,
            })} />
          </SectionCard>

          {/* §2 — Research Question */}
          <SectionCard id="research-q" num={2} title="Research Question" collapsed={collapsed["research-q"]} onToggle={() => toggleCollapse("research-q")} sectionRef={(el) => { sectionRefs.current["research-q"] = el; }}>
            <FieldGroup label="Primary Research Question">
              <Input value={local.primaryResearchQuestion ?? ""} onChange={(e) => setField("primaryResearchQuestion", e.target.value)} data-testid="input-research-question" />
            </FieldGroup>
            <FieldGroup label="Hypothesis">
              <Textarea value={local.hypothesis ?? ""} onChange={(e) => setField("hypothesis", e.target.value)} rows={3} className="resize-none" data-testid="input-hypothesis" />
            </FieldGroup>
            <FieldGroup label="Scientific Rationale">
              <Textarea value={local.scientificRationale ?? ""} onChange={(e) => setField("scientificRationale", e.target.value)} rows={5} className="resize-none" data-testid="input-rationale" />
            </FieldGroup>
            <SaveButton label="Research Question" saving={saving} onClick={() => saveSection("Research Question", {
              primaryResearchQuestion: local.primaryResearchQuestion,
              hypothesis: local.hypothesis,
              scientificRationale: local.scientificRationale,
            })} />
          </SectionCard>

          {/* §3 — Literature Context */}
          <SectionCard id="literature" num={3} title="Literature Context" collapsed={collapsed["literature"]} onToggle={() => toggleCollapse("literature")} sectionRef={(el) => { sectionRefs.current["literature"] = el; }}>
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

          {/* §4 — Methods */}
          <SectionCard id="methods" num={4} title="Methods / Approach" collapsed={collapsed["methods"]} onToggle={() => toggleCollapse("methods")} sectionRef={(el) => { sectionRefs.current["methods"] = el; }}>
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
            <SaveButton label="Methods" saving={saving} onClick={() => saveSection("Methods", {
              methodology: local.methodology, experimentalDesign: local.experimentalDesign,
              keyTechnologies: local.keyTechnologies, datasetsUsed: local.datasetsUsed,
            })} />
          </SectionCard>

          {/* §5 — Data & Evidence */}
          <SectionCard id="data" num={5} title="Data & Evidence" collapsed={collapsed["data"]} onToggle={() => toggleCollapse("data")} sectionRef={(el) => { sectionRefs.current["data"] = el; }}>
            <FieldGroup label="Preliminary Data">
              <Textarea value={local.preliminaryData ?? ""} onChange={(e) => setField("preliminaryData", e.target.value)} rows={4} className="resize-none" data-testid="input-preliminary-data" />
            </FieldGroup>
            <FieldGroup label="Supporting Evidence Links">
              <EvidenceLinksList links={local.supportingEvidenceLinks ?? []} onChange={(l) => setField("supportingEvidenceLinks", l)} />
            </FieldGroup>
            <FieldGroup label="Confidence Level">
              <SelectField value={local.confidenceLevel ?? ""} onChange={(v) => setField("confidenceLevel", v)} options={CONFIDENCE_OPTIONS} placeholder="Select confidence level" testId="select-confidence" />
            </FieldGroup>
            <SaveButton label="Data & Evidence" saving={saving} onClick={() => saveSection("Data & Evidence", {
              preliminaryData: local.preliminaryData, supportingEvidenceLinks: local.supportingEvidenceLinks,
              confidenceLevel: local.confidenceLevel,
            })} />
          </SectionCard>

          {/* §6 — Commercialization */}
          <SectionCard id="commercial" num={6} title="Commercialization Signals" collapsed={collapsed["commercial"]} onToggle={() => toggleCollapse("commercial")} sectionRef={(el) => { sectionRefs.current["commercial"] = el; }}>
            <FieldGroup label="Potential Applications">
              <Textarea value={local.potentialApplications ?? ""} onChange={(e) => setField("potentialApplications", e.target.value)} rows={3} className="resize-none" data-testid="input-applications" />
            </FieldGroup>
            <FieldGroup label="Industry Relevance">
              <SelectField value={local.industryRelevance ?? ""} onChange={(v) => setField("industryRelevance", v)} options={INDUSTRY_REL_OPTIONS} placeholder="Select industry" testId="select-industry-relevance" />
            </FieldGroup>
            <FieldGroup label="Patent Status">
              <SelectField value={local.patentStatus ?? ""} onChange={(v) => setField("patentStatus", v)} options={PATENT_STATUS_OPTIONS} placeholder="Select patent status" testId="select-patent-status" />
            </FieldGroup>
            <FieldGroup label="Startup Potential">
              <SelectField value={local.startupPotential ?? ""} onChange={(v) => setField("startupPotential", v)} options={STARTUP_OPTIONS} placeholder="Select startup potential" testId="select-startup-potential" />
            </FieldGroup>
            <SaveButton label="Commercialization" saving={saving} onClick={() => saveSection("Commercialization", {
              potentialApplications: local.potentialApplications, industryRelevance: local.industryRelevance,
              patentStatus: local.patentStatus, startupPotential: local.startupPotential,
            })} />
          </SectionCard>

          {/* §7 — Collaboration */}
          <SectionCard id="collab" num={7} title="Collaboration" collapsed={collapsed["collab"]} onToggle={() => toggleCollapse("collab")} sectionRef={(el) => { sectionRefs.current["collab"] = el; }}>
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
              <MultiSelect
                options={COLLAB_TYPE_OPTIONS}
                selected={local.collaborationType ?? []}
                onChange={(v) => setField("collaborationType", v)}
                testId="multiselect-collab-type"
              />
            </FieldGroup>
            <SaveButton label="Collaboration" saving={saving} onClick={() => saveSection("Collaboration", {
              projectContributors: local.projectContributors, openForCollaboration: local.openForCollaboration,
              collaborationType: local.collaborationType,
            })} />
          </SectionCard>

          {/* §8 — Funding */}
          <SectionCard id="funding" num={8} title="Funding" collapsed={collapsed["funding"]} onToggle={() => toggleCollapse("funding")} sectionRef={(el) => { sectionRefs.current["funding"] = el; }}>
            <FieldGroup label="Funding Status">
              <SelectField value={local.fundingStatus ?? ""} onChange={(v) => setField("fundingStatus", v)} options={FUNDING_STATUS_OPTIONS} placeholder="Select funding status" testId="select-funding-status" />
            </FieldGroup>
            <FieldGroup label="Funding Sources">
              <TagInput tags={local.fundingSources ?? []} onChange={(t) => setField("fundingSources", t)} placeholder="e.g. NIH, NSF — press Enter" testId="input-funding-sources" />
            </FieldGroup>
            <FieldGroup label="Estimated Budget (USD)">
              <Input
                type="number"
                value={local.estimatedBudget ?? ""}
                onChange={(e) => setField("estimatedBudget", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="e.g. 250000"
                data-testid="input-budget"
              />
            </FieldGroup>
            <SaveButton label="Funding" saving={saving} onClick={() => saveSection("Funding", {
              fundingStatus: local.fundingStatus, fundingSources: local.fundingSources,
              estimatedBudget: local.estimatedBudget,
            })} />
          </SectionCard>

          {/* §9 — Risk */}
          <SectionCard id="risk" num={9} title="Risk Assessment" collapsed={collapsed["risk"]} onToggle={() => toggleCollapse("risk")} sectionRef={(el) => { sectionRefs.current["risk"] = el; }}>
            <FieldGroup label="Technical Risk">
              <SelectField value={local.technicalRisk ?? ""} onChange={(v) => setField("technicalRisk", v)} options={RISK_OPTIONS} placeholder="Select level" testId="select-technical-risk" />
            </FieldGroup>
            <FieldGroup label="Regulatory Risk">
              <SelectField value={local.regulatoryRisk ?? ""} onChange={(v) => setField("regulatoryRisk", v)} options={RISK_OPTIONS} placeholder="Select level" testId="select-regulatory-risk" />
            </FieldGroup>
            <FieldGroup label="Key Scientific Unknowns">
              <Textarea value={local.keyScientificUnknowns ?? ""} onChange={(e) => setField("keyScientificUnknowns", e.target.value)} rows={4} className="resize-none" data-testid="input-scientific-unknowns" />
            </FieldGroup>
            <SaveButton label="Risk" saving={saving} onClick={() => saveSection("Risk", {
              technicalRisk: local.technicalRisk, regulatoryRisk: local.regulatoryRisk,
              keyScientificUnknowns: local.keyScientificUnknowns,
            })} />
          </SectionCard>

          {/* §10 — Milestones */}
          <SectionCard id="milestones" num={10} title="Next Milestones" collapsed={collapsed["milestones"]} onToggle={() => toggleCollapse("milestones")} sectionRef={(el) => { sectionRefs.current["milestones"] = el; }}>
            <FieldGroup label="Next Experiments">
              <ExperimentChecklist items={local.nextExperiments ?? []} onChange={(e) => setField("nextExperiments", e)} />
            </FieldGroup>
            <FieldGroup label="Expected Timeline">
              <SelectField value={local.expectedTimeline ?? ""} onChange={(v) => setField("expectedTimeline", v)} options={TIMELINE_OPTIONS} placeholder="Select timeline" testId="select-timeline" />
            </FieldGroup>
            <FieldGroup label="Success Criteria">
              <Textarea value={local.successCriteria ?? ""} onChange={(e) => setField("successCriteria", e.target.value)} rows={3} className="resize-none" data-testid="input-success-criteria" />
            </FieldGroup>
            <SaveButton label="Milestones" saving={saving} onClick={() => saveSection("Milestones", {
              nextExperiments: local.nextExperiments, expectedTimeline: local.expectedTimeline,
              successCriteria: local.successCriteria,
            })} />
          </SectionCard>

          {/* §11 — Discovery Card */}
          <SectionCard id="discovery" num={11} title="Discovery Card Preparation" collapsed={collapsed["discovery"]} onToggle={() => toggleCollapse("discovery")} sectionRef={(el) => { sectionRefs.current["discovery"] = el; }}>
            <div className="mb-3 p-3 rounded-lg bg-violet-500/5 border border-violet-500/20 text-xs text-violet-700 dark:text-violet-300">
              Complete this section to prepare your research for the EdenRadar industry feed. Use "Push to Discovery Card" to pre-fill the submission form.
            </div>
            <FieldGroup label="Discovery Title">
              <Input value={local.discoveryTitle ?? ""} onChange={(e) => setField("discoveryTitle", e.target.value)} data-testid="input-discovery-title" />
            </FieldGroup>
            <FieldGroup label="Discovery Summary">
              <Textarea value={local.discoverySummary ?? ""} onChange={(e) => setField("discoverySummary", e.target.value)} rows={4} className="resize-none" placeholder="Summarize your discovery for an industry audience..." data-testid="input-discovery-summary" />
            </FieldGroup>
            <FieldGroup label="Technology Type">
              <SelectField value={local.technologyType ?? ""} onChange={(v) => setField("technologyType", v)} options={TECH_TYPE_OPTIONS} placeholder="Select technology type" testId="select-tech-type" />
            </FieldGroup>
            <FieldGroup label="Development Stage">
              <SelectField value={local.developmentStage ?? ""} onChange={(v) => setField("developmentStage", v)} options={DEV_STAGE_OPTIONS} placeholder="Select stage" testId="select-dev-stage" />
            </FieldGroup>
            <FieldGroup label="Seeking">
              <MultiSelect
                options={SEEKING_OPTIONS}
                selected={local.projectSeeking ?? []}
                onChange={(v) => setField("projectSeeking", v)}
                testId="multiselect-seeking"
              />
            </FieldGroup>
            <FieldGroup label="Publish to Industry Feed">
              <div className="flex items-center gap-2">
                <Switch checked={local.publishToIndustry ?? false} onCheckedChange={(v) => setField("publishToIndustry", v)} data-testid="switch-publish-industry" />
                <span className="text-sm text-muted-foreground">{local.publishToIndustry ? "Enabled — will appear in industry Scout portal after admin review" : "Disabled"}</span>
              </div>
            </FieldGroup>
            <div className="flex items-center gap-2 mt-4">
              <SaveButton label="Discovery Card" saving={saving} onClick={() => saveSection("Discovery Card", {
                discoveryTitle: local.discoveryTitle, discoverySummary: local.discoverySummary,
                technologyType: local.technologyType, developmentStage: local.developmentStage,
                projectSeeking: local.projectSeeking, publishToIndustry: local.publishToIndustry,
              })} />
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-violet-500/40 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10"
                onClick={pushToDiscovery}
                data-testid="button-push-discovery-section"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                Push to Discovery Card
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </SectionCard>

          <div className="h-16" />
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  id, num, title, children, collapsed, onToggle, sectionRef,
}: {
  id: string; num: number; title: string; children: React.ReactNode;
  collapsed: boolean; onToggle: () => void;
  sectionRef: (el: HTMLElement | null) => void;
}) {
  return (
    <div
      id={`section-${id}`}
      ref={sectionRef}
      className="border border-border rounded-lg bg-card overflow-hidden"
      data-testid={`section-${id}`}
    >
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/40 transition-colors"
        onClick={onToggle}
        data-testid={`toggle-section-${id}`}
      >
        <div className="flex items-center gap-2.5">
          <span className="w-5 h-5 rounded-full bg-violet-600/10 text-violet-600 dark:text-violet-400 text-[10px] font-bold flex items-center justify-center shrink-0">
            {num}
          </span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
      </button>
      {!collapsed && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-border/50">
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
      <Button
        size="sm"
        className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
        onClick={onClick}
        disabled={!!saving}
        data-testid={`button-save-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        Save {label}
      </Button>
    </div>
  );
}

function SelectField({
  value, onChange, options, labels, placeholder, testId,
}: {
  value: string; onChange: (v: string) => void;
  options: string[]; labels?: string[]; placeholder: string; testId: string;
}) {
  return (
    <Select value={value || "__placeholder__"} onValueChange={(v) => onChange(v === "__placeholder__" ? "" : v)}>
      <SelectTrigger data-testid={testId}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__placeholder__"><span className="text-muted-foreground">{placeholder}</span></SelectItem>
        {options.map((opt, i) => (
          <SelectItem key={opt} value={opt}>{labels?.[i] ?? opt}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TagInput({ tags, onChange, placeholder, testId }: { tags: string[]; onChange: (t: string[]) => void; placeholder: string; testId: string }) {
  const [input, setInput] = useState("");
  function add() {
    const v = input.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput("");
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          data-testid={testId}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!input.trim()}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t, i) => (
            <Badge key={i} variant="secondary" className="gap-1 text-xs">
              {t}
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
          <button
            key={opt}
            onClick={() => onChange(active ? selected.filter((s) => s !== opt) : [...selected, opt])}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              active
                ? "bg-violet-600/10 border-violet-500/40 text-violet-600 dark:text-violet-400"
                : "border-border text-muted-foreground hover:border-violet-500/30 hover:text-foreground"
            }`}
            data-testid={`option-${opt.replace(/\s+/g,"-").toLowerCase()}`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function PapersList({ papers, onChange }: { papers: Paper[]; onChange: (p: Paper[]) => void }) {
  function update(i: number, key: keyof Paper, val: string) {
    const next = papers.map((p, j) => j === i ? { ...p, [key]: val } : p);
    onChange(next);
  }
  function add() {
    onChange([...papers, { paper_title: "", authors: "", journal: "", year: "", paper_link: "", notes: "" }]);
  }
  function remove(i: number) { onChange(papers.filter((_, j) => j !== i)); }
  return (
    <div className="space-y-3">
      {papers.map((p, i) => (
        <div key={i} className="border border-border rounded-md p-3 space-y-2 bg-background" data-testid={`paper-${i}`}>
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
  function update(i: number, key: keyof Dataset, val: string) {
    onChange(datasets.map((d, j) => j === i ? { ...d, [key]: val } : d));
  }
  function add() { onChange([...datasets, { dataset_name: "", dataset_source: "", dataset_link: "", notes: "" }]); }
  function remove(i: number) { onChange(datasets.filter((_, j) => j !== i)); }
  return (
    <div className="space-y-3">
      {datasets.map((d, i) => (
        <div key={i} className="border border-border rounded-md p-3 space-y-2 bg-background" data-testid={`dataset-${i}`}>
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

function EvidenceLinksList({ links, onChange }: { links: EvidenceLink[]; onChange: (l: EvidenceLink[]) => void }) {
  function update(i: number, key: keyof EvidenceLink, val: string) {
    onChange(links.map((l, j) => j === i ? { ...l, [key]: val } : l));
  }
  function add() { onChange([...links, { url: "", label: "" }]); }
  function remove(i: number) { onChange(links.filter((_, j) => j !== i)); }
  return (
    <div className="space-y-2">
      {links.map((l, i) => (
        <div key={i} className="flex items-center gap-2" data-testid={`evidence-link-${i}`}>
          <Input placeholder="Label" value={l.label} onChange={(e) => update(i, "label", e.target.value)} className="text-xs flex-1" />
          <Input placeholder="URL" value={l.url} onChange={(e) => update(i, "url", e.target.value)} className="text-xs flex-[2]" />
          {l.url && <a href={l.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" /></a>}
          <button onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive" data-testid={`remove-evidence-${i}`}><X className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs w-full" onClick={add} data-testid="add-evidence-link">
        <Plus className="w-3.5 h-3.5" /> Add Link
      </Button>
    </div>
  );
}

function ContributorsList({ contributors, onChange }: { contributors: Contributor[]; onChange: (c: Contributor[]) => void }) {
  function update(i: number, key: keyof Contributor, val: string) {
    onChange(contributors.map((c, j) => j === i ? { ...c, [key]: val } : c));
  }
  function add() { onChange([...contributors, { name: "", institution: "", role: "", email: "" }]); }
  function remove(i: number) { onChange(contributors.filter((_, j) => j !== i)); }
  return (
    <div className="space-y-3">
      {contributors.map((c, i) => (
        <div key={i} className="border border-border rounded-md p-3 space-y-2 bg-background" data-testid={`contributor-${i}`}>
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
  function add() {
    const v = input.trim();
    if (v) { onChange([...items, { label: v, done: false }]); setInput(""); }
  }
  function toggle(i: number) { onChange(items.map((e, j) => j === i ? { ...e, done: !e.done } : e)); }
  function remove(i: number) { onChange(items.filter((_, j) => j !== i)); }
  return (
    <div className="space-y-2">
      {items.map((e, i) => (
        <div key={i} className="flex items-center gap-2" data-testid={`experiment-${i}`}>
          <input
            type="checkbox"
            checked={e.done}
            onChange={() => toggle(i)}
            className="accent-violet-600 w-4 h-4 cursor-pointer"
            data-testid={`check-experiment-${i}`}
          />
          <span className={`flex-1 text-sm ${e.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{e.label}</span>
          <button onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive" data-testid={`remove-experiment-${i}`}><X className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add experiment / milestone, press Enter"
          className="text-xs"
          data-testid="input-experiment"
        />
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!input.trim()} data-testid="add-experiment">
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
