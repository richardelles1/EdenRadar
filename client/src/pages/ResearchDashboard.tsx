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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useResearcherId, useResearcherHeaders, getResearcherProfile } from "@/hooks/use-researcher";
import { useToast } from "@/hooks/use-toast";
import type { ResearchProject } from "@shared/schema";

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
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectArea, setNewProjectArea] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);

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

  const createProject = useMutation({
    mutationFn: () =>
      fetch("/api/research/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...researcherHeaders },
        body: JSON.stringify({ title: newProjectTitle, researchArea: newProjectArea, researcherId }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/research/projects", researcherId] });
      setNewProjectTitle("");
      setNewProjectArea("");
      setShowNewProject(false);
      toast({ title: "Project created" });
    },
  });

  const deleteProject = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/research/projects/${id}`, {
        method: "DELETE",
        headers: researcherHeaders,
      }).then((r) => r.json()),
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
            onClick={() => setShowNewProject((v) => !v)}
            data-testid="button-toggle-new-project"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </Button>
        </div>

        {showNewProject && (
          <div className="border border-violet-500/30 bg-violet-500/5 rounded-lg p-4 mb-3 flex flex-col gap-3">
            <Input
              placeholder="Project title"
              value={newProjectTitle}
              onChange={(e) => setNewProjectTitle(e.target.value)}
              data-testid="input-new-project-title"
            />
            <Input
              placeholder="Research area (e.g., KRAS inhibitor)"
              value={newProjectArea}
              onChange={(e) => setNewProjectArea(e.target.value)}
              data-testid="input-new-project-area"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!newProjectTitle.trim() || createProject.isPending}
                onClick={() => createProject.mutate()}
                className="bg-violet-600 hover:bg-violet-700 text-white"
                data-testid="button-create-project-submit"
              >
                Create Project
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowNewProject(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

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
              <div
                key={p.id}
                className="border border-border rounded-lg p-4 bg-card hover:border-violet-500/30 transition-colors flex flex-col gap-2"
                data-testid={`project-card-${p.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground leading-snug">{p.title}</h3>
                  <button
                    onClick={() => deleteProject.mutate(p.id)}
                    className="text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                    data-testid={`button-delete-project-${p.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {p.researchArea && (
                  <Badge variant="secondary" className="text-[11px] w-fit bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30">
                    {p.researchArea}
                  </Badge>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Last edited {formatDate(p.lastEditedAt)}
                </p>
              </div>
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
