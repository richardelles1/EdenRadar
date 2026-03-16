import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  Bell,
  ExternalLink,
  Search,
  Building2,
  Calendar,
  FlaskConical,
  DollarSign,
  Activity,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Send,
  ShieldCheck,
  ShieldX,
  Archive,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getResearcherProfile } from "@/hooks/use-researcher";
import { useResearcherId, useResearcherHeaders } from "@/hooks/use-researcher";
import type { DiscoveryCard } from "@shared/schema";

type SearchResult = {
  id: string;
  title: string;
  text: string;
  url: string;
  date: string;
  institution_or_sponsor: string;
  source_key?: string;
};
type SearchResponse = { assets: { signals: SearchResult[] }[] };
type DiscoveriesResponse = { cards: DiscoveryCard[] };

const RESEARCH_SOURCES = ["pubmed", "biorxiv", "arxiv"];
const GRANT_SOURCES = ["grants_gov", "nih_reporter", "nsf_awards"];

export default function ResearchAlerts() {
  const profile = getResearcherProfile();
  const researcherId = useResearcherId();
  const researcherHeaders = useResearcherHeaders();
  const [, navigate] = useLocation();
  const alertTopics = profile.alertTopics?.length > 0 ? profile.alertTopics : profile.researchAreas;
  const primaryTopic = alertTopics[0] ?? "";
  const [filter, setFilter] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    research: true,
    grants: true,
    discoveries: true,
  });

  function toggleSection(key: string) {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const topicQuery = alertTopics.join(" OR ");

  const { data: researchData, isLoading: researchLoading } = useQuery<SearchResponse>({
    queryKey: ["/api/search", topicQuery, "research-alerts"],
    queryFn: async () => {
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: topicQuery, sources: RESEARCH_SOURCES, maxPerSource: 10 }),
      });
      if (!r.ok) throw new Error("Failed to fetch research alerts");
      return r.json();
    },
    enabled: !!primaryTopic,
    staleTime: 0,
  });

  const { data: grantData, isLoading: grantLoading } = useQuery<SearchResponse>({
    queryKey: ["/api/search", topicQuery, "grant-alerts"],
    queryFn: async () => {
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: topicQuery, sources: GRANT_SOURCES, maxPerSource: 10 }),
      });
      if (!r.ok) throw new Error("Failed to fetch grant alerts");
      return r.json();
    },
    enabled: !!primaryTopic,
    staleTime: 0,
  });

  const { data: discoveriesData, isLoading: discoveriesLoading } = useQuery<DiscoveriesResponse>({
    queryKey: ["/api/research/discoveries", researcherId, "alerts"],
    queryFn: () =>
      fetch("/api/research/discoveries", { headers: researcherHeaders }).then(r => r.json()),
    enabled: !!researcherId,
    staleTime: 0,
  });

  const researchSignals = useMemo(() => {
    return researchData?.assets?.flatMap(a => a.signals ?? []) ?? [];
  }, [researchData]);

  const grantSignals = useMemo(() => {
    return grantData?.assets?.flatMap(a => a.signals ?? []) ?? [];
  }, [grantData]);

  const discoveryCards = discoveriesData?.cards ?? [];

  const filterItems = <T extends { title?: string; text?: string }>(items: T[]): T[] => {
    if (!filter.trim()) return items;
    const q = filter.toLowerCase();
    return items.filter(s =>
      (s.title ?? "").toLowerCase().includes(q) ||
      (s.text ?? "").toLowerCase().includes(q)
    );
  };

  const filteredResearch = filterItems(researchSignals);
  const filteredGrants = filterItems(grantSignals);

  if (!primaryTopic) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Bell className="w-5 h-5 text-amber-500" />
          <h1 className="text-xl font-bold text-foreground">My Alerts</h1>
        </div>
        <div className="border border-dashed border-border rounded-lg p-10 text-center">
          <Bell className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-3">
            Set research areas or alert topics in your profile to activate alerts.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/research/profile")}
            data-testid="button-go-to-profile"
          >
            Go to Profile
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-amber-500" />
          <h1 className="text-xl font-bold text-foreground">My Alerts</h1>
          <div className="flex gap-1.5 flex-wrap">
            {alertTopics.map(t => (
              <Badge key={t} variant="secondary" className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Filter all alerts..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-10"
          data-testid="input-alert-filter"
        />
      </div>

      <AlertSection
        icon={<FlaskConical className="w-4 h-4 text-blue-500" />}
        title="Breaking Research"
        subtitle="Latest publications from PubMed, bioRxiv & arXiv"
        count={filteredResearch.length}
        expanded={expandedSections.research}
        onToggle={() => toggleSection("research")}
        loading={researchLoading}
        sectionKey="research"
      >
        {filteredResearch.length === 0 ? (
          <EmptyState text={filter ? "No research alerts match your filter." : "No recent research found for your topics."} />
        ) : (
          filteredResearch.map((signal, i) => (
            <AlertCard key={signal.id ?? `r-${i}`} signal={signal} index={i} colorClass="hover:border-blue-500/30" />
          ))
        )}
      </AlertSection>

      <AlertSection
        icon={<DollarSign className="w-4 h-4 text-emerald-500" />}
        title="Grant Opportunities"
        subtitle="Funding from NIH Reporter, NSF & Grants.gov"
        count={filteredGrants.length}
        expanded={expandedSections.grants}
        onToggle={() => toggleSection("grants")}
        loading={grantLoading}
        sectionKey="grants"
      >
        {filteredGrants.length === 0 ? (
          <EmptyState text={filter ? "No grant alerts match your filter." : "No grants found for your topics."} />
        ) : (
          filteredGrants.map((signal, i) => (
            <AlertCard key={signal.id ?? `g-${i}`} signal={signal} index={i} colorClass="hover:border-emerald-500/30" />
          ))
        )}
      </AlertSection>

      <AlertSection
        icon={<Activity className="w-4 h-4 text-violet-500" />}
        title="Discovery Updates"
        subtitle="Status timeline for your discovery cards"
        count={discoveryCards.length}
        expanded={expandedSections.discoveries}
        onToggle={() => toggleSection("discoveries")}
        loading={discoveriesLoading}
        sectionKey="discoveries"
      >
        {discoveryCards.length === 0 ? (
          <EmptyState text="No discovery cards yet. Create one to track its status here." />
        ) : (
          discoveryCards.map((card) => <DiscoveryTimelineCard key={card.id} card={card} />)
        )}
      </AlertSection>
    </div>
  );
}

function AlertSection({
  icon,
  title,
  subtitle,
  count,
  expanded,
  onToggle,
  loading,
  children,
  sectionKey,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  loading: boolean;
  children: React.ReactNode;
  sectionKey: string;
}) {
  return (
    <section data-testid={`alert-section-${sectionKey}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 py-2 group"
        data-testid={`toggle-section-${sectionKey}`}
      >
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <Badge variant="secondary" className="text-[10px]">{count}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{subtitle}</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {expanded && (
        <div className="space-y-3 mt-1">
          {loading ? (
            <>
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
            </>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  );
}

function AlertCard({ signal, index, colorClass }: { signal: SearchResult; index: number; colorClass: string }) {
  return (
    <div
      className={`border border-border rounded-lg p-4 bg-card transition-colors ${colorClass}`}
      data-testid={`alert-card-${index}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{signal.title}</h3>
        {signal.url && (
          <a
            href={signal.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            data-testid={`alert-link-${index}`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
      {signal.text && (
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed mb-2">{signal.text}</p>
      )}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
        {signal.date && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {signal.date}
          </span>
        )}
        {signal.institution_or_sponsor && (
          <span className="flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            {signal.institution_or_sponsor}
          </span>
        )}
        {signal.source_key && (
          <Badge variant="secondary" className="text-[9px]">{signal.source_key}</Badge>
        )}
      </div>
    </div>
  );
}

function DiscoveryTimelineCard({ card }: { card: DiscoveryCard }) {
  const fmtDate = (d: string | Date) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  type TimelineStep = { icon: React.ReactNode; label: string; date?: string; active: boolean; color: string };

  const steps: TimelineStep[] = [
    {
      icon: <Clock className="w-3.5 h-3.5" />,
      label: "Created",
      date: fmtDate(card.createdAt),
      active: true,
      color: "text-muted-foreground",
    },
  ];

  if (card.published) {
    steps.push({
      icon: <Send className="w-3.5 h-3.5" />,
      label: "Published to Industry",
      active: true,
      color: "text-blue-500",
    });
  }

  if (card.adminStatus === "approved") {
    steps.push({
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
      label: "Approved — Now Live to Industry",
      active: true,
      color: "text-emerald-500",
    });
  } else if (card.adminStatus === "rejected") {
    steps.push({
      icon: <ShieldX className="w-3.5 h-3.5" />,
      label: "Rejected by Admin",
      active: true,
      color: "text-red-500",
    });
  } else if (card.published) {
    steps.push({
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
      label: "Awaiting Review",
      active: false,
      color: "text-amber-500",
    });
  }

  if (card.archived) {
    steps.push({
      icon: <Archive className="w-3.5 h-3.5" />,
      label: "Archived",
      active: true,
      color: "text-muted-foreground",
    });
  }

  return (
    <div
      className="border border-border rounded-lg p-4 bg-card hover:border-violet-500/30 transition-colors"
      data-testid={`discovery-update-${card.id}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-1">{card.title}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">{card.researchArea} · {card.technologyType} · {card.institution}</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {card.published && card.adminStatus === "approved" ? (
            <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
              <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
              Live
            </Badge>
          ) : card.published ? (
            <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
              Awaiting Review
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">Draft</Badge>
          )}
        </div>
      </div>

      <div className="relative pl-5 space-y-2">
        {steps.map((step, i) => (
          <div key={i} className="relative flex items-center gap-2">
            <div className={`absolute left-[-14px] ${step.color}`}>{step.icon}</div>
            <span className={`text-xs ${step.active ? "text-foreground" : "text-muted-foreground"}`}>
              {step.label}
            </span>
            {step.date && (
              <span className="text-[10px] text-muted-foreground">{step.date}</span>
            )}
            {i < steps.length - 1 && (
              <div className="absolute left-[-10px] top-5 w-px h-3 bg-border" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
