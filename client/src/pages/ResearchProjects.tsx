import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import {
  FolderOpen,
  Plus,
  Trash2,
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
import { useResearcherId, useResearcherHeaders } from "@/hooks/use-researcher";
import { useToast } from "@/hooks/use-toast";
import type { ResearchProject, SavedReference } from "@shared/schema";
import { computeReadinessScore } from "@/lib/readiness";

type ProjectsResponse = { projects: ResearchProject[] };

export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  planning: { label: "Planning", color: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30" },
  active: { label: "Active", color: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30" },
  on_hold: { label: "On Hold", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  completed: { label: "Completed", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
};

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ResearchProjects() {
  const researcherId = useResearcherId();
  const researcherHeaders = useResearcherHeaders();
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

  const { data: projectsData, isLoading } = useQuery<ProjectsResponse>({
    queryKey: ["/api/research/projects", researcherId],
    queryFn: async () => {
      const r = await fetch("/api/research/projects", { headers: researcherHeaders });
      if (!r.ok) throw new Error("Failed to fetch projects");
      return r.json();
    },
    enabled: !!researcherId,
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
      qc.invalidateQueries({ queryKey: ["/api/research/projects"] });
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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/research/projects"] });
      toast({ title: "Project deleted" });
    },
  });

  const projects = projectsData?.projects ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-violet-500" />
          <h1 className="text-xl font-bold text-foreground">My Projects</h1>
        </div>
        <Button
          className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
          onClick={() => setDialogOpen(true)}
          data-testid="button-new-project"
        >
          <Plus className="w-4 h-4" />
          New Project
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-lg" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-10 text-center">
          <FolderOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-3">No projects yet. Create one to start organizing your research.</p>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setDialogOpen(true)}
            data-testid="button-new-project-empty"
          >
            <Plus className="w-3.5 h-3.5" />
            Create your first project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

export function ProjectCard({
  project,
  onDelete,
  onClick,
  researcherHeaders,
  researcherId,
  compact = false,
}: {
  project: ResearchProject;
  onDelete?: (e: React.MouseEvent) => void;
  onClick: () => void;
  researcherHeaders: Record<string, string>;
  researcherId: string;
  compact?: boolean;
}) {
  const { data: refsData } = useQuery<{ references: SavedReference[] }>({
    queryKey: ["/api/research/references", researcherId, project.id],
    queryFn: async () => {
      const r = await fetch(`/api/research/references?projectId=${project.id}`, { headers: researcherHeaders });
      if (!r.ok) throw new Error("Failed to fetch references");
      return r.json();
    },
    enabled: !!researcherId,
  });

  const refs = refsData?.references ?? [];
  const statusConf = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.planning;
  const readiness = computeReadinessScore(project);

  return (
    <div
      className="border border-border rounded-lg p-4 bg-card hover:border-violet-500/30 transition-colors flex flex-col gap-2 cursor-pointer"
      onClick={onClick}
      data-testid={`project-card-${project.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground leading-snug">{project.title}</h3>
        {onDelete && !compact && (
          <button
            onClick={onDelete}
            className="text-muted-foreground hover:text-red-500 transition-colors shrink-0"
            data-testid={`button-delete-project-${project.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
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
      {project.hypothesis && !compact && (
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{project.hypothesis}</p>
      )}
      {!compact && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Readiness</span>
            <span className={`text-[11px] font-semibold ${readiness.textColor}`} data-testid={`readiness-score-${project.id}`}>
              {readiness.score}/100
            </span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${readiness.barColor}`}
              style={{ width: `${readiness.score}%` }}
            />
          </div>
        </div>
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
