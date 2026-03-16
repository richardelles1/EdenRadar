import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  FlaskConical,
  Plus,
  Send,
  ExternalLink,
  CheckCircle2,
  Clock,
  Mail,
  Key,
  Beaker,
  Archive,
  ArchiveRestore,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useResearcherId, useResearcherHeaders } from "@/hooks/use-researcher";
import { useToast } from "@/hooks/use-toast";
import type { DiscoveryCard } from "@shared/schema";

type DiscoveriesResponse = { cards: DiscoveryCard[] };

type TabKey = "all" | "active" | "archived";

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function MyDiscoveries() {
  const researcherId = useResearcherId();
  const researcherHeaders = useResearcherHeaders();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("active");

  const { data, isLoading } = useQuery<DiscoveriesResponse>({
    queryKey: ["/api/research/discoveries", researcherId],
    queryFn: () =>
      fetch("/api/research/discoveries", { headers: researcherHeaders }).then((r) => r.json()),
  });

  const publish = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/research/discoveries/${id}/publish`, {
        method: "PATCH",
        headers: researcherHeaders,
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/research/discoveries", researcherId] });
      toast({
        title: "Published to EdenRadar Industry!",
        description: "Your discovery is now visible to industry buyers in Scout.",
      });
    },
  });

  const archiveToggle = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/research/discoveries/${id}/archive`, {
        method: "PATCH",
        headers: researcherHeaders,
      }).then((r) => r.json()),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["/api/research/discoveries", researcherId] });
      const wasArchived = cards.find(c => c.id === id)?.archived;
      toast({ title: wasArchived ? "Discovery restored" : "Discovery archived" });
    },
  });

  const cards = data?.cards ?? [];
  const activeCards = cards.filter((c) => !c.archived);
  const archivedCards = cards.filter((c) => c.archived);

  const visibleCards = tab === "all" ? cards : tab === "archived" ? archivedCards : activeCards;

  const published = visibleCards.filter((c) => c.published && !c.archived);
  const drafts = visibleCards.filter((c) => !c.published && !c.archived);
  const archivedVisible = visibleCards.filter((c) => c.archived);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "active", label: "Active", count: activeCards.length },
    { key: "archived", label: "Archived", count: archivedCards.length },
    { key: "all", label: "All", count: cards.length },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Discoveries</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {cards.length === 0
              ? "Create your first discovery card to reach industry partners."
              : `${cards.length} discovery card${cards.length !== 1 ? "s" : ""} — ${cards.filter(c => c.published).length} published`}
          </p>
        </div>
        <Button
          onClick={() => navigate("/research/create-discovery")}
          className="gap-2 bg-violet-600 hover:bg-violet-700 text-white shrink-0"
          data-testid="button-create-new-discovery"
        >
          <Plus className="w-4 h-4" />
          New Discovery
        </Button>
      </div>

      {cards.length > 0 && (
        <div className="flex gap-1 border-b border-border" data-testid="discovery-tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-violet-500 text-violet-600 dark:text-violet-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-${t.key}`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
        </div>
      ) : cards.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-12 text-center flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center">
            <FlaskConical className="w-7 h-7 text-violet-500" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">No discoveries yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Create your first Discovery Card to share your research with industry partners through EdenRadar.
            </p>
          </div>
          <Button
            onClick={() => navigate("/research/create-discovery")}
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
            data-testid="button-create-first-discovery"
          >
            <Plus className="w-4 h-4" />
            Create Discovery Card
          </Button>
        </div>
      ) : visibleCards.length === 0 ? (
        <div className="border border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
          No {tab === "archived" ? "archived" : "active"} discoveries.
        </div>
      ) : (
        <div className="space-y-8">
          {tab !== "archived" && published.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <h2 className="text-sm font-semibold text-foreground">Published ({published.length})</h2>
                <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                  Visible to Industry
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {published.map((card) => (
                  <DiscoveryCardItem
                    key={card.id}
                    card={card}
                    onPublish={publish.mutate}
                    publishPending={publish.isPending}
                    onArchiveToggle={archiveToggle.mutate}
                    archivePending={archiveToggle.isPending}
                  />
                ))}
              </div>
            </section>
          )}
          {tab !== "archived" && drafts.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Drafts ({drafts.length})</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {drafts.map((card) => (
                  <DiscoveryCardItem
                    key={card.id}
                    card={card}
                    onPublish={publish.mutate}
                    publishPending={publish.isPending}
                    onArchiveToggle={archiveToggle.mutate}
                    archivePending={archiveToggle.isPending}
                  />
                ))}
              </div>
            </section>
          )}
          {archivedVisible.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Archive className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Archived ({archivedVisible.length})</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {archivedVisible.map((card) => (
                  <DiscoveryCardItem
                    key={card.id}
                    card={card}
                    onPublish={publish.mutate}
                    publishPending={publish.isPending}
                    onArchiveToggle={archiveToggle.mutate}
                    archivePending={archiveToggle.isPending}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function DiscoveryCardItem({
  card,
  onPublish,
  publishPending,
  onArchiveToggle,
  archivePending,
}: {
  card: DiscoveryCard;
  onPublish: (id: number) => void;
  publishPending: boolean;
  onArchiveToggle: (id: number) => void;
  archivePending: boolean;
}) {
  const attachments = card.attachmentUrls ?? [];
  return (
    <div
      className={`border rounded-lg p-4 bg-card flex flex-col gap-3 transition-colors ${
        card.archived
          ? "border-border opacity-70"
          : card.published
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-border hover:border-violet-500/30"
      }`}
      data-testid={`discovery-card-${card.id}`}
    >
      <div className="flex items-start gap-2 justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{card.title}</h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {card.archived ? (
            <Badge variant="secondary" className="text-[10px]">Archived</Badge>
          ) : card.published ? (
            <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
              <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
              Live
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">Draft</Badge>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{card.summary}</p>

      <div className="flex flex-wrap gap-1.5">
        {card.researchArea && (
          <Badge variant="secondary" className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30">
            {card.researchArea}
          </Badge>
        )}
        {card.technologyType && (
          <Badge variant="secondary" className="text-[10px]">
            {card.technologyType}
          </Badge>
        )}
        {card.developmentStage && (
          <Badge variant="secondary" className="text-[10px]">
            {card.developmentStage}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <Beaker className="w-3 h-3 shrink-0" />
          <span className="truncate">{card.institution}{card.lab ? ` · ${card.lab}` : ""}</span>
        </div>
        <div className="flex items-center gap-1">
          <Key className="w-3 h-3 shrink-0" />
          <span className="truncate">{card.ipStatus}</span>
        </div>
        <div className="flex items-center gap-1">
          <Mail className="w-3 h-3 shrink-0" />
          <span className="truncate">{card.contactEmail}</span>
        </div>
        {(card.publicationLink || card.patentLink) && (
          <div className="flex items-center gap-1">
            <ExternalLink className="w-3 h-3 shrink-0" />
            {card.publicationLink && (
              <a href={card.publicationLink} target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:underline truncate">
                Publication
              </a>
            )}
            {card.publicationLink && card.patentLink && <span>·</span>}
            {card.patentLink && (
              <a href={card.patentLink} target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:underline truncate">
                Patent
              </a>
            )}
          </div>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Paperclip className="w-3 h-3 shrink-0" />
          {attachments.map((url, i) => {
            const name = decodeURIComponent(url.split("/").pop()?.replace(/^\d+-/, "") ?? `File ${i + 1}`);
            return (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-500 hover:underline truncate max-w-[120px]"
                data-testid={`attachment-link-${card.id}-${i}`}
              >
                {name}
              </a>
            );
          })}
        </div>
      )}

      <div className="pt-1 border-t border-border flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">{formatDate(card.createdAt)}</span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onArchiveToggle(card.id)}
            disabled={archivePending}
            className="gap-1 h-7 text-xs text-muted-foreground hover:text-foreground"
            data-testid={`button-archive-${card.id}`}
          >
            {card.archived ? (
              <>
                <ArchiveRestore className="w-3 h-3" />
                Restore
              </>
            ) : (
              <>
                <Archive className="w-3 h-3" />
                Archive
              </>
            )}
          </Button>
          {!card.published && !card.archived && (
            <Button
              size="sm"
              onClick={() => onPublish(card.id)}
              disabled={publishPending}
              className="gap-1.5 h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white"
              data-testid={`button-publish-discovery-${card.id}`}
            >
              <Send className="w-3 h-3" />
              Publish to EdenRadar Industry
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
