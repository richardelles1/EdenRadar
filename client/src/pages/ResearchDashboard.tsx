import { useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Bell,
  FolderOpen,
  ExternalLink,
  FlaskConical,
  BadgeDollarSign,
  ArrowRight,
  Calendar,
  Building2,
  Search,
  BookOpen,
  Send,
  ChevronRight,
  Microscope,
  Sparkles,
  TrendingUp,
  Target,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useResearcherId, useResearcherHeaders, getResearcherProfile } from "@/hooks/use-researcher";
import { PORTAL_ACCENT, accentMix } from "@/components/sidebar-primitives";
import type { ResearchProject, SavedReference } from "@shared/schema";
import { ProjectCard } from "@/pages/ResearchProjects";

const ACCENT = PORTAL_ACCENT.lab;
const FUNNEL_FLEX = [1.45, 1.25, 1.05, 0.95, 0.83, 0.72];

type ProjectsResponse = { projects: ResearchProject[] };
type SearchResult = {
  id: string;
  title: string;
  text: string;
  url: string;
  date: string;
  institution_or_sponsor: string;
  metadata?: { opp_status?: string; opp_num?: string; source_label?: string; [key: string]: unknown };
};
type SearchResponse = { assets: { signals: SearchResult[] }[] };
type DiscoveryCard = {
  id: number;
  title: string;
  summary: string;
  published: boolean;
  adminStatus: string;
  researchArea: string;
  createdAt: string;
};

function SectionLabel({
  icon: Icon,
  label,
  accent,
  action,
  onAction,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  accent: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between pb-2 mb-4 border-b border-border/50">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
        <span className="text-sm font-semibold text-foreground">{label}</span>
      </div>
      {action && onAction && (
        <button
          onClick={onAction}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {action}
          <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

type PipelineStage = {
  key: string;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accentColor: string;
  value: string | number;
  href: string;
};

function PipelineStageCard({
  stage,
  isLast,
  navigate,
  delay = 0,
  reducedMotion,
  flexWeight = 1,
}: {
  stage: PipelineStage;
  isLast: boolean;
  navigate: (href: string) => void;
  delay?: number;
  reducedMotion: boolean;
  flexWeight?: number;
}) {
  const target = typeof stage.value === "number" ? stage.value : null;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (reducedMotion || target === null || target === 0) {
      setCount(target ?? 0);
      return;
    }
    let cancelled = false;
    const startTime = Date.now();
    const duration = 550;
    const endValue = target;
    function tick() {
      if (cancelled) return;
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * endValue));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return () => { cancelled = true; };
  }, [target, reducedMotion]);

  const displayValue = target !== null ? (reducedMotion ? target : count) : stage.value;

  return (
    <motion.div
      className="flex items-center min-w-0"
      style={{ flex: flexWeight }}
      initial={reducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1], delay }}
    >
      <button
        onClick={() => navigate(stage.href)}
        className="flex-1 min-w-0 rounded-lg border border-border bg-card p-3.5 flex flex-col gap-1.5 transition-all hover:-translate-y-px hover:shadow-sm text-left cursor-pointer"
      >
        <div className="flex items-center justify-between">
          <stage.icon className="w-3.5 h-3.5" style={{ color: stage.accentColor }} />
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
            {stage.label}
          </span>
        </div>
        <div className="text-3xl font-black tabular-nums" style={{ color: stage.accentColor }}>
          {displayValue}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">{stage.sublabel}</div>
      </button>
      {!isLast && (
        <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0 mx-1.5" />
      )}
    </motion.div>
  );
}

function DiscoveryStatusBadge({ card }: { card: DiscoveryCard }) {
  if (card.adminStatus === "approved") {
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
        Live
      </span>
    );
  }
  if (card.published) {
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
        Submitted
      </span>
    );
  }
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-500/10 text-gray-500 dark:text-gray-400 border border-gray-500/20">
      Draft
    </span>
  );
}

function getNextAction(
  projectCount: number,
  refCount: number,
  totalScreened: number,
  totalIncluded: number,
  discoveryCount: number,
  publishedCount: number,
): { message: string; cta: string; href: string; accent: string } | null {
  if (projectCount === 0) return { message: "Start by defining a research question to track.", cta: "Create a project", href: "/research/projects", accent: ACCENT };
  if (refCount === 0) return { message: `${projectCount} project${projectCount > 1 ? "s" : ""} defined — time to search the literature.`, cta: "Search databases", href: "/research/data-sources", accent: "hsl(217 91% 60%)" };
  if (totalScreened === 0) return { message: `${refCount} reference${refCount > 1 ? "s" : ""} saved. Import papers to begin screening.`, cta: "Go to projects", href: "/research/projects", accent: "hsl(188 85% 35%)" };
  if (totalIncluded === 0) return { message: `${totalScreened} paper${totalScreened > 1 ? "s" : ""} imported. Mark the strongest evidence as included.`, cta: "Screen papers", href: "/research/projects", accent: "hsl(142 52% 36%)" };
  if (discoveryCount === 0) return { message: `${totalIncluded} paper${totalIncluded > 1 ? "s" : ""} included. Ready to package your findings?`, cta: "Draft a discovery", href: "/research/my-discoveries", accent: "hsl(38 92% 50%)" };
  if (publishedCount === 0) return { message: `${discoveryCount} discovery${discoveryCount > 1 ? " drafts" : " draft"} ready to submit to EdenMarket.`, cta: "Publish now", href: "/research/my-discoveries", accent: "hsl(142 52% 36%)" };
  return null;
}

export default function ResearchDashboard() {
  const researcherId = useResearcherId();
  const researcherHeaders = useResearcherHeaders();
  const profile = getResearcherProfile();
  const [, navigate] = useLocation();
  const reducedMotion = useReducedMotion() ?? false;

  const allAreas = profile.researchAreas.length > 0 ? profile.researchAreas : ["CRISPR gene editing"];
  const spotlightQuery = allAreas.join(" OR ");
  const primaryArea = allAreas[0];

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

  const { data: refsData } = useQuery<{ references: SavedReference[] }>({
    queryKey: ["/api/research/references", researcherId],
    queryFn: async () => {
      const r = await fetch("/api/research/references", { headers: researcherHeaders });
      if (!r.ok) throw new Error("Failed to fetch references");
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
        body: JSON.stringify({ query: spotlightQuery, sources: ["nih_reporter"], maxPerSource: 3 }),
      });
      if (!r.ok) throw new Error("Failed to fetch grants");
      return r.json();
    },
    enabled: !!spotlightQuery,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

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
    enabled: !!primaryArea,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  const projects = projectsData?.projects ?? [];
  const recentProjects = projects.slice(0, 3);
  const discoveries = discoveryData?.cards ?? [];
  const recentDiscoveries = discoveries.slice(0, 3);
  const publishedCount = discoveries.filter((c) => c.published || c.adminStatus === "approved").length;
  const activeProjects = projects.filter((p) => p.status === "active").length;
  const refCount = refsData?.references?.length ?? 0;
  const latestSignal = alertData?.assets?.[0]?.signals?.[0];
  const grantSignals = grantData?.assets?.flatMap((a) => a.signals ?? []) ?? [];

  const nextAction = (!projectsLoading && !discoveriesLoading)
    ? getNextAction(projects.length, refCount, totalScreened, totalIncluded, discoveries.length, publishedCount)
    : null;

  // Phase-level counts derived from projects
  const totalScreened = projects.reduce((sum, p) => sum + ((p as any).screeningPapers?.length ?? 0), 0);
  const totalIncluded = projects.reduce((sum, p) =>
    sum + ((p as any).screeningPapers as any[] ?? []).filter((sp: any) => sp.fullTextDecision === "include").length, 0
  );

  const pipelineStages: PipelineStage[] = [
    {
      key: "define",
      label: "Define",
      sublabel: projects.length === 1 ? "project defined" : "projects defined",
      icon: Target,
      accentColor: "hsl(262 80% 60%)",
      value: projects.length,
      href: "/research/projects",
    },
    {
      key: "search",
      label: "Search",
      sublabel: refCount === 1 ? "reference saved" : "references saved",
      icon: Search,
      accentColor: "hsl(217 91% 60%)",
      value: refCount,
      href: "/research/data-sources",
    },
    {
      key: "evidence",
      label: "Evidence",
      sublabel: totalScreened === 1 ? "paper imported" : "papers imported",
      icon: BookOpen,
      accentColor: "hsl(188 85% 35%)",
      value: totalScreened,
      href: "/research/projects",
    },
    {
      key: "analyze",
      label: "Analyze",
      sublabel: totalIncluded === 1 ? "paper included" : "papers included",
      icon: FlaskConical,
      accentColor: "hsl(142 52% 36%)",
      value: totalIncluded,
      href: "/research/projects",
    },
    {
      key: "translate",
      label: "Translate",
      sublabel: discoveries.length === 1 ? "discovery drafted" : "discoveries drafted",
      icon: Rocket,
      accentColor: "hsl(38 92% 50%)",
      value: discoveries.length,
      href: "/research/my-discoveries",
    },
    {
      key: "publish",
      label: "Publish",
      sublabel: publishedCount === 1 ? "discovery live" : "discoveries live",
      icon: Send,
      accentColor: "hsl(142 52% 36%)",
      value: publishedCount,
      href: "/research/my-discoveries",
    },
  ];

  return (
    <motion.div
      className="p-6 max-w-5xl mx-auto space-y-7"
      initial={{ opacity: reducedMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >

      {/* Command header */}
      <div
        className="rounded-xl border border-border p-4 flex items-center justify-between gap-4"
        style={{ background: accentMix(ACCENT, 7) }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: ACCENT }}
          >
            <Microscope className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-foreground" data-testid="text-welcome">
                {profile.name ? `Welcome back, ${profile.name.split(" ")[0]}` : "EdenLab"}
              </h1>
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border"
                style={{
                  background: accentMix("hsl(142 52% 36%)", 12),
                  color: "hsl(142 52% 36%)",
                  borderColor: accentMix("hsl(142 52% 36%)", 30),
                }}
              >
                Live
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-profile-subtitle">
              {[profile.careerStage, profile.institution, profile.lab].filter(Boolean).join(" · ") || "Complete your profile to personalise EdenLab"}
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums shrink-0">
          <span>
            <span className="text-foreground font-semibold">{projects.length}</span> projects
          </span>
          <span className="text-border">·</span>
          <span>
            <span className="text-foreground font-semibold">{refCount}</span> refs
          </span>
          <span className="text-border">·</span>
          <span>
            <span className="text-foreground font-semibold">{discoveries.length}</span> discoveries
          </span>
        </div>
        {allAreas.length > 0 && (
          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            {allAreas.slice(0, 2).map((area) => (
              <span
                key={area}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full border truncate max-w-[120px]"
                style={{
                  background: accentMix(ACCENT, 8),
                  color: ACCENT,
                  borderColor: accentMix(ACCENT, 25),
                }}
              >
                {area}
              </span>
            ))}
            {allAreas.length > 2 && (
              <span className="text-[10px] text-muted-foreground">+{allAreas.length - 2}</span>
            )}
          </div>
        )}
      </div>

      {/* Workflow pipeline */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
          Research Workflow
        </p>
        <div className="overflow-x-auto">
          <div className="flex items-center gap-0 min-w-[620px]">
            {pipelineStages.map((stage, i) => (
              <PipelineStageCard
                key={stage.key}
                stage={stage}
                isLast={i === pipelineStages.length - 1}
                navigate={navigate}
                delay={i * 0.05}
                reducedMotion={reducedMotion}
                flexWeight={FUNNEL_FLEX[i]}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Next action nudge */}
      {nextAction && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: 0.38 }}
          className="flex items-center gap-3.5 rounded-lg border p-3.5"
          style={{
            background: accentMix(nextAction.accent, 6),
            borderColor: accentMix(nextAction.accent, 28),
          }}
        >
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
            style={{ background: accentMix(nextAction.accent, 18) }}
          >
            <ArrowRight className="w-4 h-4" style={{ color: nextAction.accent }} />
          </div>
          <p className="text-sm text-foreground flex-1 leading-snug">{nextAction.message}</p>
          <button
            onClick={() => navigate(nextAction.href)}
            className="text-xs font-semibold px-3 py-1.5 rounded-md shrink-0 transition-all hover:-translate-y-px active:translate-y-0 whitespace-nowrap"
            style={{ background: nextAction.accent, color: "#fff" }}
          >
            {nextAction.cta} →
          </button>
        </motion.div>
      )}

      {/* Recent Projects */}
      <section>
        <SectionLabel
          icon={FolderOpen}
          label="Active Projects"
          accent={ACCENT}
          action="View all"
          onAction={() => navigate("/research/projects")}
        />
        {projectsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
          </div>
        ) : recentProjects.length === 0 ? (
          <div
            className="rounded-lg border border-dashed border-border p-8 text-center"
            style={{ background: accentMix(ACCENT, 3) }}
          >
            <motion.div
              className="mx-auto mb-2.5 w-fit"
              animate={reducedMotion ? undefined : { y: [0, -5, 0] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            >
              <FolderOpen className="w-8 h-8" style={{ color: accentMix(ACCENT, 80) }} />
            </motion.div>
            <p className="text-sm text-muted-foreground mb-3">Start a systematic review to track evidence and document your methodology.</p>
            <button
              className="text-xs font-medium px-3 py-1.5 rounded-md border transition-colors"
              style={{
                color: ACCENT,
                borderColor: accentMix(ACCENT, 40),
                background: accentMix(ACCENT, 8),
              }}
              onClick={() => navigate("/research/projects")}
            >
              Create your first project
            </button>
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

      {/* Recent Discoveries */}
      <section>
        <SectionLabel
          icon={FlaskConical}
          label="Discoveries"
          accent="hsl(38 92% 50%)"
          action="View all"
          onAction={() => navigate("/research/my-discoveries")}
        />
        {discoveriesLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : recentDiscoveries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center" style={{ background: "color-mix(in srgb, hsl(38 92% 50%) 4%, transparent)" }}>
            <motion.div
              className="mx-auto mb-2.5 w-fit"
              animate={reducedMotion ? undefined : { y: [0, -5, 0] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sparkles className="w-8 h-8 text-amber-400/60" />
            </motion.div>
            <p className="text-sm text-muted-foreground mb-3">Package a finding for EdenMarket when you're ready to share it.</p>
            <button
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/8 transition-colors hover:bg-amber-500/15"
              onClick={() => navigate("/research/my-discoveries")}
            >
              Package your first discovery
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {recentDiscoveries.map((d) => (
              <button
                key={d.id}
                className="rounded-lg border border-border p-4 flex flex-col gap-2 transition-all hover:-translate-y-px hover:shadow-sm text-left w-full"
                style={{ background: "color-mix(in srgb, hsl(38 92% 50%) 4%, var(--card))" }}
                onClick={() => navigate("/research/my-discoveries")}
                data-testid={`discovery-card-${d.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug flex-1">
                    {d.title}
                  </p>
                  <DiscoveryStatusBadge card={d} />
                </div>
                {d.researchArea && (
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{d.researchArea}</span>
                )}
                {d.summary && (
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{d.summary}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Grants Spotlight */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BadgeDollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold text-foreground">Grants Spotlight</span>
            <div className="flex items-center gap-1">
              {allAreas.slice(0, 2).map((area) => (
                <span
                  key={area}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 truncate max-w-[100px]"
                >
                  {area}
                </span>
              ))}
              {allAreas.length > 2 && (
                <span className="text-[10px] text-muted-foreground">+{allAreas.length - 2}</span>
              )}
            </div>
          </div>
          <button
            onClick={() => navigate("/research/grants")}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-find-more-grants"
          >
            Find more
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {grantLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        ) : grantSignals.length > 0 ? (
          <div className="space-y-2">
            {grantSignals.slice(0, 3).map((g, i) => (
              <div
                key={g.id ?? i}
                role="button"
                tabIndex={0}
                className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 flex flex-col gap-1.5 transition-all hover:-translate-y-px hover:shadow-sm cursor-pointer"
                onClick={() => navigate("/research/grants")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/research/grants"); } }}
                data-testid={`grants-spotlight-${i}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{g.title}</h3>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {g.metadata?.source_label && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wide">
                        {g.metadata.source_label as string}
                      </span>
                    )}
                    {g.url && (
                      <a
                        href={g.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0"
                        aria-label={`Open ${g.title} in new tab`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                      </a>
                    )}
                  </div>
                </div>
                {g.text && g.text !== g.title && (
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{g.text}</p>
                )}
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
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
          <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground text-center">
            No open funding found for your research areas.{" "}
            <button
              className="text-emerald-600 dark:text-emerald-400 underline underline-offset-2"
              onClick={() => navigate("/research/grants")}
            >
              Search directly
            </button>
          </div>
        )}
      </section>

      {/* Breaking Alert */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-semibold text-foreground">Breaking Alert</span>
          {primaryArea && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
              {primaryArea}
            </span>
          )}
          <button
            onClick={() => navigate("/research/alerts")}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            All alerts
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {alertLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : latestSignal ? (
          <div
            className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 flex flex-col gap-1.5"
            data-testid="breaking-alert"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                {latestSignal.title}
              </h3>
              {latestSignal.url && (
                <a
                  href={latestSignal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                  aria-label={`Open ${latestSignal.title} in new tab`}
                >
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                </a>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{latestSignal.text}</p>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
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
          <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground text-center">
            No alert yet.{" "}
            <button
              className="text-amber-600 dark:text-amber-400 underline underline-offset-2"
              onClick={() => navigate("/research/profile")}
            >
              Set a research area
            </button>{" "}
            in your profile to activate.
          </div>
        )}
      </section>

    </motion.div>
  );
}
