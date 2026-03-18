import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FlaskConical, Search, Handshake } from "lucide-react";
import type { ResearchProject } from "@shared/schema";

type ProjectsResponse = {
  projects: ResearchProject[];
};

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-slate-500/10 text-slate-500 border-slate-500/30",
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  complete: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
};

const STATUS_LABELS: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  complete: "Complete",
};

function ProjectCard({ project }: { project: ResearchProject }) {
  const statusColor =
    STATUS_COLORS[project.status] ?? STATUS_COLORS.planning;
  const statusLabel = STATUS_LABELS[project.status] ?? project.status;
  const keywords = (project.keywords ?? []).slice(0, 3);
  const seeking = (project.projectSeeking ?? []).slice(0, 2);

  return (
    <div
      className="rounded-xl border border-card-border bg-card hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-200 p-5 flex flex-col gap-3"
      data-testid={`project-card-${project.id}`}
    >
      <div className="flex items-start gap-2 flex-wrap">
        <Badge
          variant="outline"
          className={`text-[10px] px-2 py-0.5 font-medium ${statusColor}`}
        >
          {statusLabel}
        </Badge>
        {project.researchArea && (
          <Badge
            variant="outline"
            className="text-[10px] px-2 py-0.5 bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20"
          >
            {project.researchArea}
          </Badge>
        )}
        {project.openForCollaboration && (
          <Badge
            variant="outline"
            className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1"
          >
            <Handshake className="w-2.5 h-2.5" />
            Open to Collab
          </Badge>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground leading-snug">
          {project.discoveryTitle || project.title}
        </h3>
        {(project.discoverySummary || project.description) && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-3 leading-relaxed">
            {project.discoverySummary || project.description}
          </p>
        )}
      </div>

      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((k) => (
            <span
              key={k}
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground"
            >
              {k}
            </span>
          ))}
        </div>
      )}

      {(project.developmentStage || seeking.length > 0) && (
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-0.5 border-t border-border/60">
          {project.developmentStage && (
            <span className="capitalize">{project.developmentStage}</span>
          )}
          {seeking.length > 0 && (
            <span>Seeking: {seeking.join(", ")}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function IndustryProjects() {
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [collabFilter, setCollabFilter] = useState("all");

  const { data, isLoading } = useQuery<ProjectsResponse>({
    queryKey: ["/api/industry/projects"],
    staleTime: 60 * 1000,
  });

  const projects = data?.projects ?? [];

  const researchAreas = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const p of projects) {
      const a = p.researchArea;
      if (a && !seen.has(a)) {
        seen.add(a);
        result.push(a);
      }
    }
    return result.sort();
  }, [projects]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return projects.filter((p) => {
      const textOk =
        !q ||
        (p.title ?? "").toLowerCase().includes(q) ||
        (p.discoveryTitle ?? "").toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        (p.discoverySummary ?? "").toLowerCase().includes(q) ||
        (p.researchArea ?? "").toLowerCase().includes(q);
      const areaOk = areaFilter === "all" || p.researchArea === areaFilter;
      const statusOk = statusFilter === "all" || p.status === statusFilter;
      const collabOk =
        collabFilter === "all" ||
        (collabFilter === "yes" && p.openForCollaboration);
      return textOk && areaOk && statusOk && collabOk;
    });
  }, [projects, search, areaFilter, statusFilter, collabFilter]);

  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <FlaskConical className="w-4 h-4 text-violet-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Research Projects
              </h1>
              <p className="text-sm text-muted-foreground">
                Active research programs from academic labs published for
                industry engagement.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9 text-sm"
              placeholder="Search research projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-projects-search"
            />
          </div>
          <Select value={areaFilter} onValueChange={setAreaFilter}>
            <SelectTrigger
              className="h-9 text-xs w-[180px]"
              data-testid="select-projects-area"
            >
              <SelectValue placeholder="All areas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Research Areas</SelectItem>
              {researchAreas.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger
              className="h-9 text-xs w-[140px]"
              data-testid="select-projects-status"
            >
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
          </Select>
          <Select value={collabFilter} onValueChange={setCollabFilter}>
            <SelectTrigger
              className="h-9 text-xs w-[160px]"
              data-testid="select-projects-collab"
            >
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              <SelectItem value="yes">Open to Collaborate</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <FlaskConical className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">
              {projects.length === 0
                ? "No research projects published yet"
                : "No projects match your filters"}
            </p>
            <p className="text-xs text-muted-foreground/70 max-w-xs">
              {projects.length === 0
                ? "Researchers will publish their projects here when they enable industry visibility."
                : "Try adjusting your search or filters."}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {filtered.length} project{filtered.length !== 1 ? "s" : ""}
              {filtered.length < projects.length
                ? ` of ${projects.length}`
                : ""}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
