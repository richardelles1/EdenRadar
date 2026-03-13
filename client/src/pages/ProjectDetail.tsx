import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft,
  Save,
  Calendar,
  Beaker,
  Target,
  FileText,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

const STATUS_OPTIONS = [
  { value: "planning", label: "Planning", color: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30" },
  { value: "active", label: "Active", color: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30" },
  { value: "on_hold", label: "On Hold", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  { value: "completed", label: "Completed", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
];

function getStatusBadgeClass(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.color ?? STATUS_OPTIONS[0].color;
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id ?? "0");
  const [, navigate] = useLocation();
  const researcherId = useResearcherId();
  const researcherHeaders = useResearcherHeaders();

  const { data: projectData, isLoading } = useQuery<{ project: ResearchProject }>({
    queryKey: ["/api/research/projects", projectId],
    queryFn: () =>
      fetch(`/api/research/projects/${projectId}`, { headers: researcherHeaders }).then((r) => {
        if (!r.ok) throw new Error("Project not found");
        return r.json();
      }),
    enabled: !!researcherId && projectId > 0,
  });

  const { data: refsData } = useQuery<{ references: SavedReference[] }>({
    queryKey: ["/api/research/references", researcherId, projectId],
    queryFn: () =>
      fetch(`/api/research/references?projectId=${projectId}`, { headers: researcherHeaders }).then((r) => r.json()),
    enabled: !!researcherId && projectId > 0,
  });

  const project = projectData?.project;
  const refs = refsData?.references ?? [];

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-center">
        <p className="text-muted-foreground">Project not found.</p>
        <Button variant="ghost" className="mt-4 gap-2" onClick={() => navigate("/research")} data-testid="button-back-dashboard">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/research")} data-testid="button-back-dashboard">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-xl font-bold text-foreground truncate" data-testid="text-project-title">{project.title}</h1>
        <Badge className={`text-xs shrink-0 ${getStatusBadgeClass(project.status)}`} data-testid="badge-project-status">
          {STATUS_OPTIONS.find((s) => s.value === project.status)?.label ?? project.status}
        </Badge>
      </div>

      <div className="text-xs text-muted-foreground">
        Created {formatDate(project.createdAt)} · Last edited {formatDate(project.lastEditedAt)}
      </div>

      <EditableSection
        projectId={projectId}
        researcherHeaders={researcherHeaders}
        field="title"
        label="Title"
        value={project.title}
        type="input"
      />
      <EditableSection
        projectId={projectId}
        researcherHeaders={researcherHeaders}
        field="status"
        label="Status"
        value={project.status}
        type="select"
      />
      <EditableSection
        projectId={projectId}
        researcherHeaders={researcherHeaders}
        field="researchArea"
        label="Research Area"
        value={project.researchArea ?? ""}
        type="input"
      />
      <EditableSection
        projectId={projectId}
        researcherHeaders={researcherHeaders}
        field="hypothesis"
        label="Research Question / Hypothesis"
        value={project.hypothesis ?? ""}
        type="textarea"
      />
      <EditableSection
        projectId={projectId}
        researcherHeaders={researcherHeaders}
        field="objectives"
        label="Objectives"
        value={project.objectives ?? ""}
        type="textarea"
      />
      <EditableSection
        projectId={projectId}
        researcherHeaders={researcherHeaders}
        field="methodology"
        label="Methodology"
        value={project.methodology ?? ""}
        type="textarea"
      />
      <EditableSection
        projectId={projectId}
        researcherHeaders={researcherHeaders}
        field="targetCompletion"
        label="Target Completion"
        value={project.targetCompletion ? new Date(project.targetCompletion).toISOString().split("T")[0] : ""}
        type="date"
      />

      <section className="border border-border rounded-lg p-4 bg-card">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-violet-500" />
          Reference Literature ({refs.length})
        </h3>
        {refs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No references saved to this project yet.</p>
        ) : (
          <div className="space-y-2">
            {refs.map((ref) => (
              <ReferenceItem key={ref.id} reference={ref} researcherHeaders={researcherHeaders} researcherId={researcherId} projectId={projectId} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EditableSection({
  projectId,
  researcherHeaders,
  field,
  label,
  value,
  type,
}: {
  projectId: number;
  researcherHeaders: Record<string, string>;
  field: string;
  label: string;
  value: string;
  type: "input" | "textarea" | "select" | "date";
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const { toast } = useToast();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      fetch(`/api/research/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...researcherHeaders },
        body: JSON.stringify({ [field]: editValue || null }),
      }).then((r) => {
        if (!r.ok) throw new Error("Update failed");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/research/projects"] });
      setEditing(false);
      toast({ title: `${label} updated` });
    },
    onError: () => {
      toast({ title: "Update failed", variant: "destructive" });
    },
  });

  const iconMap: Record<string, typeof Target> = {
    title: FileText,
    status: CheckCircle2,
    researchArea: Beaker,
    hypothesis: Target,
    objectives: Target,
    methodology: Beaker,
    targetCompletion: Calendar,
  };
  const Icon = iconMap[field] ?? FileText;

  if (!editing) {
    return (
      <div
        className="border border-border rounded-lg p-4 bg-card cursor-pointer hover:border-violet-500/30 transition-colors group"
        onClick={() => {
          setEditValue(value);
          setEditing(true);
        }}
        data-testid={`section-${field}`}
      >
        <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
          <Icon className="w-4 h-4 text-violet-500" />
          {label}
        </h3>
        {type === "select" ? (
          <Badge className={`text-xs ${getStatusBadgeClass(value)}`}>
            {STATUS_OPTIONS.find((s) => s.value === value)?.label ?? value}
          </Badge>
        ) : value ? (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{type === "date" ? formatDate(value) : value}</p>
        ) : (
          <p className="text-xs text-muted-foreground/60 italic">Click to add {label.toLowerCase()}</p>
        )}
      </div>
    );
  }

  return (
    <div className="border border-violet-500/30 rounded-lg p-4 bg-card" data-testid={`section-${field}-editing`}>
      <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
        <Icon className="w-4 h-4 text-violet-500" />
        {label}
      </h3>
      {type === "textarea" ? (
        <Textarea
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          rows={4}
          className="mb-2"
          data-testid={`input-${field}`}
        />
      ) : type === "select" ? (
        <Select value={editValue} onValueChange={setEditValue}>
          <SelectTrigger className="mb-2" data-testid={`select-${field}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : type === "date" ? (
        <Input
          type="date"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="mb-2"
          data-testid={`input-${field}`}
        />
      ) : (
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="mb-2"
          data-testid={`input-${field}`}
        />
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
          data-testid={`button-save-${field}`}
        >
          {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)} data-testid={`button-cancel-${field}`}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ReferenceItem({
  reference,
  researcherHeaders,
  researcherId,
  projectId,
}: {
  reference: SavedReference;
  researcherHeaders: Record<string, string>;
  researcherId: string;
  projectId: number;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/research/references/${reference.id}`, {
        method: "DELETE",
        headers: researcherHeaders,
      }).then((r) => {
        if (!r.ok) throw new Error("Delete failed");
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/research/references", researcherId, projectId] });
      toast({ title: "Reference removed" });
    },
  });

  return (
    <div className="flex items-start gap-2 group" data-testid={`reference-item-${reference.id}`}>
      <a
        href={reference.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 flex items-center gap-1.5 text-sm text-foreground hover:text-violet-500 transition-colors truncate"
        data-testid={`reference-link-${reference.id}`}
      >
        <ExternalLink className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{reference.title}</span>
      </a>
      <button
        onClick={() => deleteMutation.mutate()}
        disabled={deleteMutation.isPending}
        className="shrink-0 text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
        data-testid={`button-delete-reference-${reference.id}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
