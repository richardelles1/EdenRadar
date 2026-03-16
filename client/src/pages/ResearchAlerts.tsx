import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useCallback, useEffect } from "react";
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
  Plus,
  X,
  Eye,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getResearcherProfile, saveResearcherProfile } from "@/hooks/use-researcher";
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
const MAX_TOPICS = 10;

const DISMISSED_KEY = "eden-alerts-dismissed";
const CHECKED_KEY = "eden-alerts-checked-at";

function getDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

function dismissId(id: string) {
  const set = getDismissedIds();
  set.add(id);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
}

function getCheckedTimestamps(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CHECKED_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function stampChecked(topic: string) {
  const ts = getCheckedTimestamps();
  ts[topic] = Date.now();
  localStorage.setItem(CHECKED_KEY, JSON.stringify(ts));
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ResearchAlerts() {
  const profile = getResearcherProfile();
  const researcherId = useResearcherId();
  const researcherHeaders = useResearcherHeaders();
  const alertTopics = profile.alertTopics?.length > 0 ? profile.alertTopics : profile.researchAreas;
  const primaryTopic = alertTopics[0] ?? "";
  const [filter, setFilter] = useState("");
  const [dismissed, setDismissed] = useState<Set<string>>(getDismissedIds);
  const [newTopicValue, setNewTopicValue] = useState("");
  const [topicsList, setTopicsList] = useState<string[]>(alertTopics);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    discoveries: true,
  });
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    alertTopics.forEach(t => { init[t] = true; });
    return init;
  });

  function toggleSection(key: string) {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleTopic(topic: string) {
    setExpandedTopics(prev => ({ ...prev, [topic]: !prev[topic] }));
  }

  function handleDismiss(id: string) {
    dismissId(id);
    setDismissed(prev => new Set([...prev, id]));
  }

  function addTopic() {
    const trimmed = newTopicValue.trim();
    if (!trimmed || topicsList.includes(trimmed) || topicsList.length >= MAX_TOPICS) return;
    const updated = [...topicsList, trimmed];
    setTopicsList(updated);
    saveResearcherProfile({ alertTopics: updated });
    setExpandedTopics(prev => ({ ...prev, [trimmed]: true }));
    setNewTopicValue("");
  }

  function removeTopic(topic: string) {
    const updated = topicsList.filter(t => t !== topic);
    setTopicsList(updated);
    saveResearcherProfile({ alertTopics: updated });
    setExpandedTopics(prev => {
      const next = { ...prev };
      delete next[topic];
      return next;
    });
  }

  const { data: discoveriesData, isLoading: discoveriesLoading } = useQuery<DiscoveriesResponse>({
    queryKey: ["/api/research/discoveries", researcherId, "alerts"],
    queryFn: () =>
      fetch("/api/research/discoveries", { headers: researcherHeaders }).then(r => r.json()),
    enabled: !!researcherId,
    staleTime: 0,
  });

  const discoveryCards = discoveriesData?.cards ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-amber-500" />
          <h1 className="text-xl font-bold text-foreground">My Alerts</h1>
        </div>
      </div>

      <div className="border border-border rounded-lg p-4 bg-card" data-testid="alert-topic-manager">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Alert Topics</h2>
          <span className="text-[11px] text-muted-foreground">{topicsList.length}/{MAX_TOPICS} topics</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {topicsList.map(t => (
            <Badge
              key={t}
              variant="secondary"
              className="gap-1.5 pr-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
              data-testid={`badge-alert-topic-${t}`}
            >
              {t}
              <button
                onClick={() => removeTopic(t)}
                className="hover:text-red-500 transition-colors"
                data-testid={`button-remove-topic-${t}`}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
        {topicsList.length < MAX_TOPICS && (
          <div className="flex gap-2">
            <Input
              placeholder="Add a topic (e.g., CRISPR delivery)"
              value={newTopicValue}
              onChange={e => setNewTopicValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTopic(); } }}
              className="text-sm"
              data-testid="input-add-alert-topic"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={addTopic}
              data-testid="button-add-alert-topic"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        )}
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

      {topicsList.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-8 text-center">
          <Bell className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Add your first alert topic above to start receiving research & grant alerts.
          </p>
        </div>
      ) : (
        topicsList.map(topic => (
          <TopicSection
            key={topic}
            topic={topic}
            filter={filter}
            dismissed={dismissed}
            onDismiss={handleDismiss}
            expanded={expandedTopics[topic] ?? true}
            onToggle={() => toggleTopic(topic)}
          />
        ))
      )}

      <AlertSection
        icon={<Activity className="w-4 h-4 text-violet-500" />}
        title="Discovery Updates"
        subtitle="Status timeline for your discovery cards"
        count={discoveryCards.length}
        expanded={expandedSections.discoveries ?? true}
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

const ALERTS_CAP = 5;

function TopicSection({
  topic,
  filter,
  dismissed,
  onDismiss,
  expanded,
  onToggle,
}: {
  topic: string;
  filter: string;
  dismissed: Set<string>;
  onDismiss: (id: string) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [showAllResearch, setShowAllResearch] = useState(false);
  const [showAllGrants, setShowAllGrants] = useState(false);
  const { data: researchData, isLoading: researchLoading } = useQuery<SearchResponse>({
    queryKey: ["/api/search", topic, "research-alerts-topic"],
    queryFn: async () => {
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: topic, sources: RESEARCH_SOURCES, maxPerSource: 5 }),
      });
      if (!r.ok) throw new Error("Failed to fetch research alerts");
      stampChecked(topic);
      return r.json();
    },
    enabled: !!topic,
    staleTime: 0,
  });

  const { data: grantData, isLoading: grantLoading } = useQuery<SearchResponse>({
    queryKey: ["/api/search", topic, "grant-alerts-topic"],
    queryFn: async () => {
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: topic, sources: GRANT_SOURCES, maxPerSource: 5 }),
      });
      if (!r.ok) throw new Error("Failed to fetch grant alerts");
      return r.json();
    },
    enabled: !!topic,
    staleTime: 0,
  });

  const researchSignals = useMemo(() =>
    researchData?.assets?.flatMap(a => a.signals ?? []) ?? [], [researchData]);
  const grantSignals = useMemo(() =>
    grantData?.assets?.flatMap(a => a.signals ?? []) ?? [], [grantData]);

  const filterList = useCallback((items: SearchResult[], prefix: string): Array<SearchResult & { dismissKey: string }> => {
    const withKeys = items.map((s, i) => ({
      ...s,
      dismissKey: s.id || `${prefix}-${topic}-${i}`,
    }));
    let filtered = withKeys.filter(s => !dismissed.has(s.dismissKey));
    if (filter.trim()) {
      const q = filter.toLowerCase();
      filtered = filtered.filter(s =>
        (s.title ?? "").toLowerCase().includes(q) ||
        (s.text ?? "").toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [filter, dismissed, topic]);

  const filteredResearch = filterList(researchSignals, "r");
  const filteredGrants = filterList(grantSignals, "g");
  const allCount = filteredResearch.length + filteredGrants.length;
  const isLoading = researchLoading || grantLoading;
  const [lastCheckedTs, setLastCheckedTs] = useState<number | undefined>(() => getCheckedTimestamps()[topic]);

  useEffect(() => {
    if (researchData) {
      setLastCheckedTs(getCheckedTimestamps()[topic]);
    }
  }, [researchData, topic]);

  return (
    <section data-testid={`alert-topic-section-${topic}`} className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
        data-testid={`toggle-topic-${topic}`}
      >
        <div className="flex items-center gap-2">
          <Bell className="w-3.5 h-3.5 text-amber-500" />
          <h2 className="text-sm font-semibold text-foreground">{topic}</h2>
          <Badge variant="secondary" className="text-[10px]">
            {isLoading ? "..." : (
              (!showAllResearch && filteredResearch.length > ALERTS_CAP) ||
              (!showAllGrants && filteredGrants.length > ALERTS_CAP)
                ? `${Math.min(filteredResearch.length, ALERTS_CAP) + Math.min(filteredGrants.length, ALERTS_CAP)} of ${allCount}`
                : allCount
            )}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          {lastCheckedTs && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground" data-testid={`last-checked-${topic}`}>
              <Eye className="w-3 h-3" />
              {formatTimestamp(lastCheckedTs)}
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="p-3 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
            </div>
          ) : (
            <>
              {filteredResearch.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-blue-500 font-medium">
                    <FlaskConical className="w-3.5 h-3.5" />
                    Research ({filteredResearch.length > ALERTS_CAP && !showAllResearch
                      ? `${ALERTS_CAP} of ${filteredResearch.length}`
                      : filteredResearch.length})
                  </div>
                  {(showAllResearch ? filteredResearch : filteredResearch.slice(0, ALERTS_CAP)).map((signal, i) => (
                    <AlertCard
                      key={signal.dismissKey}
                      signal={signal}
                      index={i}
                      colorClass="hover:border-blue-500/30"
                      onDismiss={() => onDismiss(signal.dismissKey)}
                    />
                  ))}
                  {filteredResearch.length > ALERTS_CAP && !showAllResearch && (
                    <button
                      onClick={() => setShowAllResearch(true)}
                      className="w-full text-xs text-blue-500 hover:text-blue-400 font-medium py-1.5 transition-colors"
                      data-testid={`show-more-research-${topic}`}
                    >
                      Show {filteredResearch.length - ALERTS_CAP} more research alerts
                    </button>
                  )}
                  {showAllResearch && filteredResearch.length > ALERTS_CAP && (
                    <button
                      onClick={() => setShowAllResearch(false)}
                      className="w-full text-xs text-muted-foreground hover:text-foreground font-medium py-1.5 transition-colors"
                      data-testid={`show-less-research-${topic}`}
                    >
                      Show less
                    </button>
                  )}
                </div>
              )}
              {filteredGrants.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                    <DollarSign className="w-3.5 h-3.5" />
                    Grants ({filteredGrants.length > ALERTS_CAP && !showAllGrants
                      ? `${ALERTS_CAP} of ${filteredGrants.length}`
                      : filteredGrants.length})
                  </div>
                  {(showAllGrants ? filteredGrants : filteredGrants.slice(0, ALERTS_CAP)).map((signal, i) => (
                    <AlertCard
                      key={signal.dismissKey}
                      signal={signal}
                      index={i}
                      colorClass="hover:border-emerald-500/30"
                      onDismiss={() => onDismiss(signal.dismissKey)}
                    />
                  ))}
                  {filteredGrants.length > ALERTS_CAP && !showAllGrants && (
                    <button
                      onClick={() => setShowAllGrants(true)}
                      className="w-full text-xs text-emerald-500 hover:text-emerald-400 font-medium py-1.5 transition-colors"
                      data-testid={`show-more-grants-${topic}`}
                    >
                      Show {filteredGrants.length - ALERTS_CAP} more grant alerts
                    </button>
                  )}
                  {showAllGrants && filteredGrants.length > ALERTS_CAP && (
                    <button
                      onClick={() => setShowAllGrants(false)}
                      className="w-full text-xs text-muted-foreground hover:text-foreground font-medium py-1.5 transition-colors"
                      data-testid={`show-less-grants-${topic}`}
                    >
                      Show less
                    </button>
                  )}
                </div>
              )}
              {filteredResearch.length === 0 && filteredGrants.length === 0 && (
                <EmptyState text={filter ? "No alerts match your filter for this topic." : "No recent alerts found for this topic."} />
              )}
            </>
          )}
        </div>
      )}
    </section>
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

function AlertCard({ signal, index, colorClass, onDismiss }: { signal: SearchResult; index: number; colorClass: string; onDismiss?: () => void }) {
  return (
    <div
      className={`border border-border rounded-lg p-4 bg-card transition-colors ${colorClass}`}
      data-testid={`alert-card-${index}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{signal.title}</h3>
        <div className="flex items-center gap-1.5 shrink-0">
          {signal.url && (
            <a
              href={signal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              data-testid={`alert-link-${index}`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-muted-foreground hover:text-red-500 transition-colors"
              title="Dismiss"
              data-testid={`alert-dismiss-${index}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
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