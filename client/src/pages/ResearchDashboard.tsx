import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import {
  Bell,
  FolderOpen,
  ExternalLink,
  FlaskConical,
  BadgeDollarSign,
  ArrowRight,
  Calendar,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useResearcherId, useResearcherHeaders, getResearcherProfile } from "@/hooks/use-researcher";
import type { ResearchProject } from "@shared/schema";
import { ProjectCard } from "@/pages/ResearchProjects";

type ProjectsResponse = { projects: ResearchProject[] };
type SearchResult = {
  id: string;
  title: string;
  text: string;
  url: string;
  date: string;
  institution_or_sponsor: string;
  metadata?: { opp_status?: string; opp_num?: string; [key: string]: unknown };
};
type SearchResponse = { assets: { signals: SearchResult[] }[] };
type DiscoveryCard = { id: number; title: string; summary: string; published: boolean; adminStatus: string; researchArea: string; createdAt: string };

export default function ResearchDashboard() {
  const researcherId = useResearcherId();
  const researcherHeaders = useResearcherHeaders();
  const profile = getResearcherProfile();
  const [, navigate] = useLocation();

  const [deferredReady, setDeferredReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDeferredReady(true), 800);
    return () => clearTimeout(timer);
  }, []);

  const allAreas = profile.researchAreas.length > 0 ? profile.researchAreas : ["CRISPR gene editing"];
  const spotlightQuery = allAreas.join(" OR ");

  const { data: projectsData, isLoading: projectsLoading } = useQuery<ProjectsResponse>({
    queryKey: ["/api/research/projects", researcherId],
    queryFn: async () => {
      const r = await fetch("/api/research/projects", { headers: researcherHeaders });
      if (!r.ok) throw new Error("Failed to fetch projects");
      return r.json();
    },
    enabled: !!researcherId,
  });

  const { data: discoveryData, isLoading: discoveriesLoading } = useQuery<{ cards: DiscoveryCard[] }>({
    queryKey: ["/api/research/discoveries", researcherId],
    queryFn: async () => {
      const r = await fetch("/api/research/discoveries", { headers: researcherHeaders });
      if (!r.ok) throw new Error("Failed to fetch discoveries");
      return r.json();
    },
    enabled: !!researcherId,
  });

  const { data: grantData, isLoading: grantLoading } = useQuery<SearchResponse>({
    queryKey: ["/api/search", spotlightQuery, "grants_spotlight"],
    queryFn: async () => {
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: spotlightQuery, sources: ["grants_gov", "nih_reporter", "nsf_awards", "eu_cordis"], maxPerSource: 3 }),
      });
      if (!r.ok) throw new Error("Failed to fetch grants");
      return r.json();
    },
    enabled: !!spotlightQuery && deferredReady,
  });

  const primaryArea = allAreas[0];

  const { data: alertData, isLoading: alertLoading } = useQuery<SearchResponse>({
    queryKey: ["/api/search", primaryArea, "pubmed"],
    queryFn: async () => {
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: primaryArea, sources: ["pubmed"], maxPerSource: 3 }),
      });
      if (!r.ok) throw new Error("Failed to fetch alerts");
      return r.json();
    },
    enabled: !!primaryArea && deferredReady,
  });

  const projects = projectsData?.projects ?? [];
  const recentProjects = projects.slice(0, 3);
  const discoveries = discoveryData?.cards ?? [];
  const recentDiscoveries = discoveries.slice(0, 3);
  const totalDiscoveries = discoveries.length;
  const publishedCount = discoveries.filter((c) => c.published).length;
  const latestSignal = alertData?.assets?.[0]?.signals?.[0];
  const grantSignals = grantData?.assets?.flatMap((a) => a.signals ?? []) ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-welcome">
            {profile.name ? `Welcome back, ${profile.name.split(" ")[0]}!` : "Research Dashboard"}
          </h1>
          {(profile.institution || profile.careerStage) && (
            <p className="text-sm text-muted-foreground mt-0.5" data-testid="text-profile-subtitle">
              {profile.careerStage ? `${profile.careerStage} · ` : ""}{profile.institution}{profile.lab ? ` · ${profile.lab}` : ""}{profile.researchAreas?.length > 0 ? ` — ${profile.researchAreas.slice(0, 2).join(", ")}` : ""}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Projects", value: projects.length, icon: FolderOpen, color: "text-violet-500", href: "/research/projects" },
          { label: "Discoveries", value: totalDiscoveries, icon: FlaskConical, color: "text-amber-500", href: "/research/my-discoveries" },
          { label: "Open Grants", value: grantSignals.length > 0 ? `${grantSignals.length}+` : "—", icon: BadgeDollarSign, color: "text-emerald-500", href: "/research/grants" },
          { label: "Alerts", value: latestSignal ? "New" : "—", icon: Bell, color: "text-blue-500", href: "/research/alerts" },
        ].map((kpi) => (
          <button
            key={kpi.label}
            onClick={() => navigate(kpi.href)}
            className="border border-border rounded-lg p-4 bg-card flex flex-col gap-2 text-left hover:border-violet-500/30 transition-colors cursor-pointer"
            data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
            <div className="text-2xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </button>
        ))}
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate("/research/projects")} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <FolderOpen className="w-4 h-4 text-violet-500" />
            <h2 className="text-base font-semibold text-foreground">Recent Projects</h2>
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/research/projects")}
            data-testid="button-view-all-projects"
          >
            View all
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {projectsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
          </div>
        ) : recentProjects.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
            No projects yet.{" "}
            <button
              className="text-violet-500 underline underline-offset-2 hover:text-violet-400"
              onClick={() => navigate("/research/projects")}
            >
              Create one
            </button>{" "}
            to start organizing your research.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {recentProjects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onClick={() => navigate(`/research/projects/${p.id}`)}
                researcherHeaders={researcherHeaders}
                researcherId={researcherId}
                compact
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate("/research/my-discoveries")} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <FlaskConical className="w-4 h-4 text-amber-500" />
            <h2 className="text-base font-semibold text-foreground">Recent Discoveries</h2>
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/research/my-discoveries")}
            data-testid="button-view-all-discoveries"
          >
            View all
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {discoveriesLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : recentDiscoveries.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
            No discoveries yet.{" "}
            <button
              className="text-violet-500 underline underline-offset-2 hover:text-violet-400"
              onClick={() => navigate("/research/create-discovery")}
            >
              Create one
            </button>{" "}
            to share your research with industry.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {recentDiscoveries.map((d) => (
              <div
                key={d.id}
                className="border border-border rounded-lg p-4 bg-card hover:border-violet-500/30 transition-colors cursor-pointer flex flex-col gap-2"
                onClick={() => navigate("/research/my-discoveries")}
                data-testid={`discovery-card-${d.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug flex-1">{d.title}</p>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] shrink-0 ${
                      d.adminStatus === "approved"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                        : d.published
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                          : "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30"
                    }`}
                  >
                    {d.adminStatus === "approved" ? "Approved" : d.published ? "Submitted" : "Draft"}
                  </Badge>
                </div>
                {d.researchArea && (
                  <span className="text-[11px] text-muted-foreground">{d.researchArea}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate("/research/grants")} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <BadgeDollarSign className="w-4 h-4 text-emerald-500" />
            <h2 className="text-base font-semibold text-foreground">Grants Spotlight</h2>
          </button>
          <div className="flex items-center gap-1 flex-wrap">
            {allAreas.slice(0, 3).map((area) => (
              <Badge key={area} variant="secondary" className="text-[11px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                {area}
              </Badge>
            ))}
            {allAreas.length > 3 && (
              <span className="text-[11px] text-muted-foreground">+{allAreas.length - 3}</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/research/grants")}
            data-testid="button-find-more-grants"
          >
            Find more
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {grantLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : grantSignals.length > 0 ? (
          <div className="space-y-2">
            {grantSignals.slice(0, 3).map((g, i) => (
              <div
                key={g.id ?? i}
                className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-4 flex flex-col gap-2 cursor-pointer hover:border-emerald-500/50 transition-colors"
                onClick={() => navigate("/research/grants")}
                data-testid={`grants-spotlight-${i}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{g.title}</h3>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {g.metadata?.source_label && (
                      <Badge variant="secondary" className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                        {g.metadata.source_label as string}
                      </Badge>
                    )}
                    {g.url && (
                      <a href={g.url} target="_blank" rel="noopener noreferrer" className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                      </a>
                    )}
                  </div>
                </div>
                {g.text && g.text !== g.title && (
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{g.text}</p>
                )}
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  {g.institution_or_sponsor && (
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {g.institution_or_sponsor}
                    </span>
                  )}
                  {g.date && (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                      <Calendar className="w-3 h-3" />
                      {g.date}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-border rounded-lg p-4 text-sm text-muted-foreground text-center">
            No open funding found for your research areas — try{" "}
            <button
              className="text-violet-500 underline underline-offset-2 hover:text-violet-400"
              onClick={() => navigate("/research/grants")}
            >
              searching directly
            </button>.
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => navigate("/research/alerts")} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Bell className="w-4 h-4 text-amber-500" />
            <h2 className="text-base font-semibold text-foreground">Breaking Research Alert</h2>
          </button>
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

    </div>
  );
}
