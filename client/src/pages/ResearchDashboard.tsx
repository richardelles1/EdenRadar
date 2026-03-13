import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Bell,
  FolderOpen,
  Building2,
  Plus,
  Trash2,
  ExternalLink,
  BookOpen,
  FlaskConical,
  TrendingUp,
  Layers,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useResearcherId, useResearcherHeaders, getResearcherProfile } from "@/hooks/use-researcher";
import { useToast } from "@/hooks/use-toast";
import type { ResearchProject, SavedReference } from "@shared/schema";

type ProjectsResponse = { projects: ResearchProject[] };
type SearchResult = {
  id: string;
  title: string;
  text: string;
  url: string;
  date: string;
  institution_or_sponsor: string;
};
type SearchResponse = { assets: { signals: SearchResult[] }[] };

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  planning: { label: "Planning", color: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30" },
  active: { label: "Active", color: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30" },
  on_hold: { label: "On Hold", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  completed: { label: "Completed", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
};

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ResearchDashboard() {
  const researcherId = useResearcherId();
  const researcherHeaders = useResearcherHeaders();
  const profile = getResearcherProfile();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newArea, setNewArea] = useState("");
  const [newHypothesis, setNewHypothesis] = useState("");
  const [newStatus, setNewStatus] = useState("planning");
  const [newObjectives, setNewObjectives] = useState("");
  const [newMethodology, setNewMethodology] = useState("");
  const [newTargetCompletion, setNewTargetCompletion] = useState("");

  const primaryArea = profile.researchAreas[0] ?? "CRISPR gene editing";

  const { data: projectsData, isLoading: projectsLoading } = useQuery<ProjectsResponse>({
    queryKey: ["/api/research/projects", researcherId],
    queryFn: () =>
      fetch("/api/research/projects", { headers: researcherHeaders }).then((r) => r.json()),
  });

  const { data: alertData, isLoading: alertLoading } = useQuery<SearchResponse>({
    queryKey: ["/api/search", primaryArea, "pubmed"],
    queryFn: () =>
      fetch(`/api/search?q=${encodeURIComponent(primaryArea)}&sources=pubmed&maxPerSource=3`).then((r) =>
        r.json()
      ),
    enabled: !!primaryArea,
  });

  const { data: discoveryData } = useQuery<{ cards: Array<{ id: number; published: boolean }> }>({
    queryKey: ["/api/research/discoveries", researcherId],
    queryFn: () =>
      fetch("/api/research/discoveries", { headers: researcherHeaders }).then((r) => r.json()),
  });

  function resetDialog() {
    setNewTitle("");
    setNewArea("");
    setNewHypothesis("");
    setNewStatus("planning");
    setNewObjectives("");
    setNewMethodology("");
    setNewTargetCompletion("");
  }

  const createProject = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/research/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...researcherHeaders },
        body: JSON.stringify({
          title: newTitle,
          researchArea: newArea || null,
          hypothesis: newHypothesis || null,
          status: newStatus,
          objectives: newObjectives || null,
          methodology: newMethodology || null,
          targetCompletion: newTargetCompletion || null,
          researcherId,
        }),
      });
      if (!r.ok) throw new Error("Failed to create project");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/research/projects", researcherId] });
      resetDialog();
      setDialogOpen(false);
      toast({ title: "Project created" });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/research/projects/${id}`, {
        method: "DELETE",
        headers: researcherHeaders,
      });
      if (!r.ok) throw new Error("Failed to delete project");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/research/projects", researcherId] });
      toast({ title: "Project deleted" });
    },
  });

  const projects = projectsData?.projects ?? [];
  const latestSignal = alertData?.assets?.[0]?.signals?.[0];
  const totalDiscoveries = discoveryData?.cards?.length ?? 0;
  const publishedCount = discoveryData?.cards?.filter((c) => c.published).length ?? 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {profile.name ? `Welcome back, ${profile.name.split(" ")[0]}` : "Research Dashboard"}
          </h1>
          {profile.institution && (
            <p className="text-sm text-muted-foreground mt-0.5">{profile.institution}{profile.lab ? ` · ${profile.lab}` : ""}</p>
          )}
        </div>
        <Button
          onClick={() => navigate("/research/create-discovery")}
          className="gap-2 bg-violet-600 hover:bg-violet-700 text-white shrink-0"
          data-testid="button-create-discovery"
        >
          <Plus className="w-4 h-4" />
          New Discovery
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Active Projects", value: projects.length, icon: FolderOpen, color: "text-violet-500" },
          { label: "Discoveries", value: totalDiscoveries, icon: FlaskConical, color: "text-amber-500" },
          { label: "Published", value: publishedCount, icon: TrendingUp, color: "text-emerald-500" },
          { label: "Data Sources", value: 8, icon: Layers, color: "text-blue-500" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="border border-border rounded-lg p-4 bg-card flex flex-col gap-2"
            data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
            <div className="text-2xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </div>
        ))}
      </div>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-4 h-4 text-amber-500" />
          <h2 className="text-base font-semibold text-foreground">Breaking Research Alert</h2>
          {primaryArea && (
            <Badge variant="secondary" className="text-[11px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
              {primaryArea}
            </Badge>
          )}
        </div>
        {alertLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : latestSignal ? (
          <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4 flex flex-col gap-2" data-testid="breaking-alert">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{latestSignal.title}</h3>
              {latestSignal.url && (
                <a href={latestSignal.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                </a>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{latestSignal.text}</p>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {latestSignal.date && <span>{latestSignal.date}</span>}
              {latestSignal.institution_or_sponsor && (
                <>
                  <span>·</span>
                  <span>{latestSignal.institution_or_sponsor}</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="border border-border rounded-lg p-4 text-sm text-muted-foreground text-center">
            No alert — set a research area in your{" "}
            <button
              className="text-violet-500 underline underline-offset-2 hover:text-violet-400"
              onClick={() => navigate("/research/profile")}
            >
              profile
            </button>{" "}
            to activate.
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-violet-500" />
            <h2 className="text-base font-semibold text-foreground">Active Projects</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setDialogOpen(true)}
            data-testid="button-toggle-new-project"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </Button>
        </div>

        {projectsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        ) : projects.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
            No projects yet. Create one to start organizing your research.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onDelete={(e) => {
                  e.stopPropagation();
                  deleteProject.mutate(p.id);
                }}
                onClick={() => navigate(`/research/projects/${p.id}`)}
                researcherHeaders={researcherHeaders}
                researcherId={researcherId}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-4 h-4 text-blue-500" />
          <h2 className="text-base font-semibold text-foreground">Suggested Sources</h2>
        </div>
        <SuggestedSources area={primaryArea} />
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-emerald-500" />
          <h2 className="text-base font-semibold text-foreground">Quick Actions</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => navigate("/research/data-sources")}
            data-testid="button-open-literature-search"
          >
            <Layers className="w-3.5 h-3.5" />
            Search Literature
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => navigate("/research/my-discoveries")}
            data-testid="button-view-discoveries"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            View My Discoveries
          </Button>
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { resetDialog(); } setDialogOpen(open); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-create-project">
          <DialogHeader>
            <DialogTitle>New Research Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Title *</label>
              <Input
                placeholder="Project title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                data-testid="input-new-project-title"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Research Question / Hypothesis</label>
              <Textarea
                placeholder="What question does this project aim to answer?"
                value={newHypothesis}
                onChange={(e) => setNewHypothesis(e.target.value)}
                rows={3}
                data-testid="input-new-project-hypothesis"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Research Area</label>
              <Input
                placeholder="e.g., KRAS inhibitor, mRNA delivery"
                value={newArea}
                onChange={(e) => setNewArea(e.target.value)}
                data-testid="input-new-project-area"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Status</label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger data-testid="select-new-project-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Objectives</label>
              <Textarea
                placeholder="Key objectives for this project"
                value={newObjectives}
                onChange={(e) => setNewObjectives(e.target.value)}
                rows={3}
                data-testid="input-new-project-objectives"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Methodology</label>
              <Textarea
                placeholder="Research methodology and approach"
                value={newMethodology}
                onChange={(e) => setNewMethodology(e.target.value)}
                rows={3}
                data-testid="input-new-project-methodology"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Target Completion</label>
              <Input
                type="date"
                value={newTargetCompletion}
                onChange={(e) => setNewTargetCompletion(e.target.value)}
                data-testid="input-new-project-target-completion"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { resetDialog(); setDialogOpen(false); }} data-testid="button-cancel-create-project">
              Cancel
            </Button>
            <Button
              disabled={!newTitle.trim() || createProject.isPending}
              onClick={() => createProject.mutate()}
              className="bg-violet-600 hover:bg-violet-700 text-white"
              data-testid="button-create-project-submit"
            >
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectCard({
  project,
  onDelete,
  onClick,
  researcherHeaders,
  researcherId,
}: {
  project: ResearchProject;
  onDelete: (e: React.MouseEvent) => void;
  onClick: () => void;
  researcherHeaders: Record<string, string>;
  researcherId: string;
}) {
  const { data: refsData } = useQuery<{ references: SavedReference[] }>({
    queryKey: ["/api/research/references", researcherId, project.id],
    queryFn: () =>
      fetch(`/api/research/references?projectId=${project.id}`, { headers: researcherHeaders }).then((r) => r.json()),
    enabled: !!researcherId,
  });

  const refs = refsData?.references ?? [];
  const statusConf = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.planning;

  return (
    <div
      className="border border-border rounded-lg p-4 bg-card hover:border-violet-500/30 transition-colors flex flex-col gap-2 cursor-pointer"
      onClick={onClick}
      data-testid={`project-card-${project.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground leading-snug">{project.title}</h3>
        <button
          onClick={onDelete}
          className="text-muted-foreground hover:text-red-500 transition-colors shrink-0"
          data-testid={`button-delete-project-${project.id}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge className={`text-[11px] ${statusConf.color}`} data-testid={`badge-status-${project.id}`}>
          {statusConf.label}
        </Badge>
        {project.researchArea && (
          <Badge variant="secondary" className="text-[11px] w-fit bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30">
            {project.researchArea}
          </Badge>
        )}
      </div>
      {project.hypothesis && (
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{project.hypothesis}</p>
      )}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-auto">
        <span className="flex items-center gap-1">
          <FileText className="w-3 h-3" />
          {refs.length} ref{refs.length !== 1 ? "s" : ""}
        </span>
        <span>Last edited {formatDate(project.lastEditedAt)}</span>
      </div>
    </div>
  );
}

function SuggestedSources({ area }: { area: string }) {
  const { data, isLoading } = useQuery<Record<string, number>>({
    queryKey: ["/api/institutions/counts"],
    queryFn: () => fetch("/api/institutions/counts").then((r) => r.json()),
  });

  if (isLoading) return <Skeleton className="h-12 w-full rounded-lg" />;

  const institutions = data
    ? Object.entries(data)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
    : [];

  if (institutions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No institution data available yet.</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {institutions.map(([name, count]) => (
        <div
          key={name}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card text-xs font-medium text-muted-foreground hover:border-blue-500/30 hover:text-foreground transition-colors cursor-default"
          data-testid={`suggested-source-${name.replace(/\s+/g, "-").toLowerCase()}`}
        >
          <Building2 className="w-3 h-3" />
          {name}
          <span className="text-[10px] text-muted-foreground/60">({count})</span>
        </div>
      ))}
    </div>
  );
}
