import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import {
  FolderOpen,
  Plus,
  Trash2,
  FileText,
  Calendar,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { PORTAL_ACCENT, accentMix } from "@/components/sidebar-primitives";
import type { ResearchProject, SavedReference } from "@shared/schema";
import { computeReadinessScore } from "@/lib/readiness";

const ACCENT = PORTAL_ACCENT.lab;

type ProjectsResponse = { projects: ResearchProject[] };

export const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  planning: {
    label: "Planning",
    dot: "bg-gray-400",
    badge: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20",
  },
  active: {
    label: "Active",
    dot: "bg-violet-500",
    badge: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  },
  on_hold: {
    label: "On Hold",
    dot: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  completed: {
    label: "Completed",
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
};

const STATUS_FILTERS = ["All", "active", "planning", "on_hold", "completed"] as const;

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
  const [statusFilter, setStatusFilter] = useState<string>("All");
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
  const filtered = statusFilter === "All"
    ? projects
    : projects.filter((p) => p.status === statusFilter);

  const counts = {
    All: projects.length,
    active: projects.filter((p) => p.status === "active").length,
    planning: projects.filter((p) => p.status === "planning").length,
    on_hold: projects.filter((p) => p.status === "on_hold").length,
    completed: projects.filter((p) => p.status === "completed").length,
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div
        className="rounded-xl border border-border p-4 flex items-center justify-between gap-4"
        style={{ background: accentMix(ACCENT, 4) }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: ACCENT }}
          >
            <FolderOpen className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">My Projects</h1>
            <p className="text-xs text-muted-foreground">
              {projects.length} total · {counts.active} active
            </p>
          </div>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          size="sm"
          className="gap-1.5 text-xs font-semibold text-white"
          style={{ background: ACCENT }}
          data-testid="button-new-project"
        >
          <Plus className="w-3.5 h-3.5" />
          New Project
        </Button>
      </div>

      {/* Status filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {STATUS_FILTERS.map((f) => {
          const isActive = statusFilter === f;
          const conf = f === "All" ? null : STATUS_CONFIG[f];
          const label = f === "All" ? "All" : conf?.label ?? f;
          const count = counts[f];
          return (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all"
              style={
                isActive
                  ? {
                      background: accentMix(ACCENT, 10),
                      color: ACCENT,
                      borderColor: accentMix(ACCENT, 35),
                    }
                  : {
                      background: "transparent",
                      color: "hsl(var(--muted-foreground))",
                      borderColor: "hsl(var(--border) / 0.5)",
                    }
              }
            >
              {conf && (
                <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />
              )}
              {label}
              <span
                className="text-[10px] tabular-nums"
                style={{ opacity: isActive ? 1 : 0.6 }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-52 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-border p-12 text-center"
          style={{ background: accentMix(ACCENT, 3) }}
        >
          <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm text-muted-foreground mb-3">
            {statusFilter === "All" ? "No projects yet." : `No ${STATUS_CONFIG[statusFilter]?.label.toLowerCase()} projects.`}
          </p>
          {statusFilter === "All" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs"
              onClick={() => setDialogOpen(true)}
              data-testid="button-new-project-empty"
            >
              <Plus className="w-3.5 h-3.5" />
              Create your first project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
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

      {/* Create dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) resetDialog();
          setDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-create-project">
          <DialogHeader>
            <DialogTitle>New Research Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                Title *
              </label>
              <Input
                placeholder="Project title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                data-testid="input-new-project-title"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                Research Question / Hypothesis
              </label>
              <Textarea
                placeholder="What question does this project aim to answer?"
                value={newHypothesis}
                onChange={(e) => setNewHypothesis(e.target.value)}
                rows={3}
                data-testid="input-new-project-hypothesis"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                Research Area
              </label>
              <Input
                placeholder="e.g., KRAS inhibitor, mRNA delivery"
                value={newArea}
                onChange={(e) => setNewArea(e.target.value)}
                data-testid="input-new-project-area"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                Status
              </label>
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
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                Objectives
              </label>
              <Textarea
                placeholder="Key objectives for this project"
                value={newObjectives}
                onChange={(e) => setNewObjectives(e.target.value)}
                rows={3}
                data-testid="input-new-project-objectives"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                Methodology
              </label>
              <Textarea
                placeholder="Research methodology and approach"
                value={newMethodology}
                onChange={(e) => setNewMethodology(e.target.value)}
                rows={3}
                data-testid="input-new-project-methodology"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                Target Completion
              </label>
              <Input
                type="date"
                value={newTargetCompletion}
                onChange={(e) => setNewTargetCompletion(e.target.value)}
                data-testid="input-new-project-target-completion"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { resetDialog(); setDialogOpen(false); }}
              data-testid="button-cancel-create-project"
            >
              Cancel
            </Button>
            <Button
              disabled={!newTitle.trim() || createProject.isPending}
              onClick={() => createProject.mutate()}
              size="sm"
              className="text-white"
              style={{ background: ACCENT }}
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
      const r = await fetch(`/api/research/references?projectId=${project.id}`, {
        headers: researcherHeaders,
      });
      if (!r.ok) throw new Error("Failed to fetch references");
      return r.json();
    },
    enabled: !!researcherId,
  });

  const refs = refsData?.references ?? [];
  const statusConf = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.planning;
  const readiness = computeReadinessScore(project);

  const scoreColor =
    readiness.score >= 70
      ? "hsl(142 52% 36%)"
      : readiness.score >= 40
        ? "hsl(38 92% 50%)"
        : "hsl(0 84% 60%)";

  return (
    <div
      className="relative rounded-lg border border-border bg-card flex flex-col overflow-hidden cursor-pointer"
      style={{ minHeight: compact ? 120 : 200 }}
      onClick={onClick}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = `${PORTAL_ACCENT.lab}40`;
        el.style.transform = "translateY(-1px)";
        el.style.boxShadow = `0 4px 20px ${PORTAL_ACCENT.lab}14`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = "";
        el.style.transform = "";
        el.style.boxShadow = "";
      }}
      data-testid={`project-card-${project.id}`}
    >
      {/* Left accent strip */}
      <div
        className="absolute left-0 inset-y-0 w-[3px]"
        style={{ backgroundColor: PORTAL_ACCENT.lab }}
      />

      {/* Score badge */}
      <div
        className="absolute top-3 right-3 w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-bold border-2"
        style={{
          background: accentMix(scoreColor, 10),
          color: scoreColor,
          borderColor: accentMix(scoreColor, 30),
        }}
        data-testid={`readiness-score-${project.id}`}
      >
        {readiness.score}
      </div>

      <div className="flex-1 flex flex-col gap-2 p-4 pl-5 pr-14">
        {/* Status + area */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${statusConf.badge}`}
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${statusConf.dot}`} />
            {statusConf.label}
          </span>
          {project.researchArea && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded border truncate max-w-[120px]"
              style={{
                background: accentMix(PORTAL_ACCENT.lab, 8),
                color: PORTAL_ACCENT.lab,
                borderColor: accentMix(PORTAL_ACCENT.lab, 25),
              }}
            >
              {project.researchArea}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {project.title}
        </h3>

        {/* Hypothesis preview */}
        {!compact && project.hypothesis && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed flex-1">
            {project.hypothesis}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pl-5 pb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            <span className="tabular-nums">{refs.length}</span> ref{refs.length !== 1 ? "s" : ""}
          </span>
          {!compact && project.targetCompletion && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(project.targetCompletion)}
            </span>
          )}
        </div>

        {!compact && onDelete && (
          <button
            onClick={onDelete}
            className="text-muted-foreground/40 hover:text-red-500 transition-colors"
            data-testid={`button-delete-project-${project.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Readiness bar */}
      {!compact && (
        <div className="h-0.5 bg-muted w-full">
          <div
            className="h-full transition-all"
            style={{ width: `${readiness.score}%`, backgroundColor: scoreColor }}
          />
        </div>
      )}
    </div>
  );
}
