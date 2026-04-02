import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Bell,
  Plus,
  ChevronDown,
  ChevronUp,
  Building2,
  Lightbulb,
  FlaskConical,
  Package,
  Clock,
  Trash2,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserAlert } from "@shared/schema";

const STORAGE_KEY = "edenLastSeenAlerts";

interface DeltaInstitution {
  institution: string;
  count: number;
  matchedCount: number;
  matchedBy: string | null;
  sampleAssets: Array<{ id: number; name: string }>;
}

interface IndustryDeltaResponse {
  newAssets: {
    total: number;
    hasAlerts: boolean;
    byInstitution: DeltaInstitution[];
  };
  newConcepts: {
    total: number;
    items: Array<{ id: number; title: string; therapeuticArea: string; submitterAffiliation?: string; oneLiner?: string }>;
  };
  newProjects: {
    total: number;
    items: Array<{ id: number; title: string; discoveryTitle?: string; researchArea?: string; status: string; discoverySummary?: string; description?: string; projectUrl?: string | null; projectContributors?: Array<{ name: string; institution: string; role: string; email: string }> | null }>;
  };
  windowHours: number;
  since?: string;
}

function formatRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return "last 48h";
  const ms = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return "the last hour";
  if (hours < 24) return `the last ${hours}h`;
  if (days === 1) return "yesterday";
  if (days < 7) return `the last ${days} days`;
  if (days < 30) return `the last ${Math.round(days / 7)} weeks`;
  return `the last ${Math.round(days / 30)} months`;
}

function useBloomCard(rotateMax = 8) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, active: false });
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (relY - 0.5) * -rotateMax, y: (relX - 0.5) * rotateMax, active: true });
  }, [rotateMax]);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    setTilt({ x: 0, y: 0, active: false });
    setPressed(false);
  }, []);

  const cardStyle: React.CSSProperties = {
    willChange: "transform",
    transformStyle: "preserve-3d",
    transform: pressed
      ? "perspective(1000px) scale(0.97)"
      : tilt.active
      ? `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`
      : "perspective(1000px)",
    transition: pressed
      ? "transform 0.07s ease-in"
      : tilt.active
      ? "transform 0.08s ease-out"
      : "transform 0.5s cubic-bezier(0.23,1,0.32,1)",
    boxShadow: hovered
      ? "0 16px 48px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.10)"
      : "0 4px 20px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)",
  };

  const bloomHandlers = {
    onMouseMove: handleMouseMove,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: handleMouseLeave,
    onMouseDown: () => setPressed(true),
    onMouseUp: () => setPressed(false),
  };

  return { cardRef, hovered, cardStyle, bloomHandlers };
}

function SectionHeader({
  icon: Icon,
  label,
  count,
  countLabel,
  color,
  expanded,
  onToggle,
  hasNew,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  countLabel?: string;
  color: string;
  expanded: boolean;
  onToggle: () => void;
  hasNew?: boolean;
}) {
  return (
    <button
      className="w-full flex items-center gap-3 text-left select-none"
      onClick={onToggle}
      data-testid={`alerts-section-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className={`relative w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4 h-4" />
        {hasNew && !expanded && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary border border-card" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-foreground">{label}</span>
      </div>
      <Badge variant="secondary" className="shrink-0 text-[11px] tabular-nums">
        {countLabel ?? `${count} new`}
      </Badge>
      {expanded ? (
        <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      ) : (
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      )}
    </button>
  );
}

function AlertDefinitionCard({ alert, onDelete, isPending }: { alert: UserAlert; onDelete: (id: number) => void; isPending: boolean }) {
  const { cardRef, hovered, cardStyle, bloomHandlers } = useBloomCard(7);

  const parts = [alert.query, ...(alert.modalities ?? []), ...(alert.stages ?? [])].filter(Boolean);
  const draft = parts.join(" ");

  return (
    <div style={{ perspective: "1000px" }} data-testid={`alert-card-${alert.id}`}>
      <div
        ref={cardRef}
        className="relative rounded-[13px] overflow-hidden bg-white dark:bg-zinc-900 border border-white/90 dark:border-white/10"
        style={cardStyle}
        {...bloomHandlers}
      >
        <div
          className="absolute pointer-events-none"
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "rgba(217, 119, 6, 0.55)",
            top: "-28px",
            left: "-28px",
            transform: hovered ? "scale(26)" : "scale(1)",
            opacity: hovered ? 0.13 : 0,
            transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
            zIndex: 1,
          }}
        />
        <div className="absolute left-0 top-0 bottom-0 w-[3px] z-[3]" style={{ background: "#d97706" }} />

        <div
          className="absolute top-0 left-0 z-[5] flex flex-col items-center justify-center px-2 py-1 border-b border-r border-amber-500/40 bg-white dark:bg-zinc-900"
          style={{ borderRadius: "17px 0 10px 0", minWidth: "34px" }}
          data-testid={`alert-badge-${alert.id}`}
        >
          <span className="text-[8px] font-bold tracking-[0.15em] uppercase leading-none text-muted-foreground">Filters</span>
          <span className="font-mono text-xs font-bold leading-tight tabular-nums mt-0.5 text-amber-600 dark:text-amber-400">
            {(alert.modalities?.length ?? 0) + (alert.stages?.length ?? 0) + (alert.institutions?.length ?? 0) + (alert.query ? 1 : 0)}
          </span>
        </div>

        <button
          onClick={() => onDelete(alert.id)}
          className="absolute top-2 right-2 z-[5] text-muted-foreground hover:text-destructive transition-colors w-6 h-6 flex items-center justify-center rounded hover:bg-destructive/10 active:scale-90"
          data-testid={`button-delete-alert-${alert.id}`}
          disabled={isPending}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        <div className="relative z-[4] pt-7 pb-3 pl-4 pr-3">
          <div className="space-y-1.5">
            {draft ? (
              <Link href={`/scout?draft=${encodeURIComponent(draft)}`}>
                <p className="text-xs font-semibold text-foreground hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer" data-testid={`alert-title-${alert.id}`}>
                  {alert.query || "Any query"}
                </p>
              </Link>
            ) : (
              <p className="text-xs font-semibold text-foreground" data-testid={`alert-title-${alert.id}`}>
                {alert.query || "Any query"}
              </p>
            )}
            <div className="flex flex-wrap gap-1">
              {(alert.modalities ?? []).map((m: string) => (
                <span key={m} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 capitalize">{m}</span>
              ))}
              {(alert.stages ?? []).map((s: string) => (
                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500 border border-violet-500/20 capitalize">{s}</span>
              ))}
              {(alert.institutions ?? []).map((inst: string) => (
                <span key={inst} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 truncate max-w-[120px]">{inst}</span>
              ))}
            </div>
            {draft && (
              <Link href={`/scout?draft=${encodeURIComponent(draft)}`}>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline cursor-pointer" data-testid={`alert-explore-${alert.id}`}>
                  Explore matches →
                </span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MyAlertsSection({ onCreateAlert }: { onCreateAlert: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { data: alerts = [], isLoading } = useQuery<UserAlert[]>({
    queryKey: ["/api/alerts"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/alerts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/alerts"] }),
  });

  return (
    <div className="rounded-lg border border-card-border bg-card overflow-hidden">
      <div className="p-4">
        <SectionHeader
          icon={Bell}
          label="My Alerts"
          count={alerts.length}
          countLabel={`${alerts.length} saved`}
          color="bg-emerald-500/10 text-emerald-500"
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          hasNew={false}
        />
      </div>
      {expanded && (
        <div className="border-t border-card-border/60 px-4 pb-4">
          {isLoading ? (
            <div className="pt-3 space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
            </div>
          ) : alerts.length === 0 ? (
            <div className="pt-3 space-y-2">
              <p className="text-xs text-muted-foreground">No saved alerts yet. Use + Create Alert to set one up.</p>
              <button
                onClick={onCreateAlert}
                className="text-xs text-primary hover:underline"
                data-testid="button-create-first-alert"
              >
                + Create your first alert
              </button>
            </div>
          ) : (
            <div className="pt-3 space-y-2">
              {alerts.map((alert) => (
                <AlertDefinitionCard
                  key={alert.id}
                  alert={alert}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  isPending={deleteMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TtoAssetsSection({
  data,
  onCreateAlert,
}: {
  data: IndustryDeltaResponse["newAssets"];
  onCreateAlert: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const matched = data.byInstitution.filter((inst) => inst.matchedBy !== null);
  const matchedTotal = matched.reduce((s, inst) => s + inst.matchedCount, 0);
  const displayCount = data.hasAlerts ? matchedTotal : data.total;

  return (
    <div className="rounded-lg border border-card-border bg-card overflow-hidden">
      <div className="p-4">
        <SectionHeader
          icon={Package}
          label="TTO Assets"
          count={displayCount}
          color="bg-primary/10 text-primary"
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          hasNew={displayCount > 0}
        />
      </div>
      {expanded && (
        <div className="border-t border-card-border/60 px-4 pb-4">
          {!data.hasAlerts ? (
            <div className="pt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Create a saved alert to personalise this feed. We'll highlight new TTO assets matching your criteria.
              </p>
              <button
                onClick={onCreateAlert}
                className="text-xs text-primary hover:underline"
                data-testid="button-create-alert-from-tto"
              >
                + Create your first alert
              </button>
            </div>
          ) : matched.length === 0 ? (
            <p className="text-xs text-muted-foreground pt-3">
              {data.total > 0
                ? "No new assets match your saved alert criteria. Try broadening your alert filters."
                : "No new TTO assets since your last visit. Check back soon."}
            </p>
          ) : (
            <div className="pt-3 space-y-2">
              <p className="text-[10px] text-muted-foreground/70 pb-1">Matching your alerts</p>
              {matched.map((inst, i) => (
                <InstitutionRow key={inst.institution} inst={inst} index={i} matchLabel={inst.matchedBy!} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MiniAssetBloomCard({ asset, index }: { asset: { id: number; name: string }; index: number }) {
  const { cardRef, hovered, cardStyle, bloomHandlers } = useBloomCard(5);
  return (
    <div style={{ perspective: "1000px" }}>
      <Link href={`/asset/${asset.id}`}>
        <div
          ref={cardRef}
          className="relative rounded-[11px] overflow-hidden bg-white dark:bg-zinc-900 border border-white/90 dark:border-white/10 cursor-pointer"
          style={cardStyle}
          {...bloomHandlers}
          data-testid={`alert-asset-mini-${index}`}
        >
          <div
            className="absolute pointer-events-none"
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: "rgba(38, 122, 70, 0.55)",
              top: "-20px",
              left: "-20px",
              transform: hovered ? "scale(22)" : "scale(1)",
              opacity: hovered ? 0.13 : 0,
              transition: "transform 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
              zIndex: 1,
            }}
          />
          <div className="absolute left-0 top-0 bottom-0 w-[3px] z-[3]" style={{ background: "#22c55e" }} />
          <div
            className="absolute top-0 left-0 z-[5] flex flex-col items-center justify-center px-1.5 py-1 border-b border-r border-emerald-500/40 bg-white dark:bg-zinc-900"
            style={{ borderRadius: "17px 0 10px 0", minWidth: "30px" }}
          >
            <span className="text-[7px] font-bold tracking-[0.15em] uppercase leading-none text-muted-foreground">New</span>
            <span className="font-mono text-[9px] font-bold leading-tight mt-0.5 text-emerald-600 dark:text-emerald-400">TTO</span>
          </div>
          <div className="relative z-[4] pl-4 pr-3 pt-5 pb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-foreground truncate">{asset.name}</span>
            <span className="text-[10px] text-primary shrink-0 font-medium">View →</span>
          </div>
        </div>
      </Link>
    </div>
  );
}

function InstitutionRow({ inst, index, matchLabel }: { inst: DeltaInstitution; index: number; matchLabel?: string }) {
  const [open, setOpen] = useState(false);
  const { cardRef, hovered, cardStyle, bloomHandlers } = useBloomCard(6);

  return (
    <div style={{ perspective: "1000px" }} data-testid={`delta-card-${index}`}>
      <div
        ref={cardRef}
        className="relative rounded-[13px] overflow-hidden bg-white dark:bg-zinc-900 border border-white/90 dark:border-white/10"
        style={cardStyle}
        {...bloomHandlers}
      >
        <div
          className="absolute pointer-events-none"
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "rgba(38, 122, 70, 0.55)",
            top: "-28px",
            left: "-28px",
            transform: hovered ? "scale(26)" : "scale(1)",
            opacity: hovered ? 0.13 : 0,
            transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
            zIndex: 1,
          }}
        />
        <div className="absolute left-0 top-0 bottom-0 w-[3px] z-[3]" style={{ background: "#22c55e" }} />

        <div className="relative z-[4]">
          <div
            className="flex items-center gap-2.5 pl-4 pr-3 py-3 cursor-pointer"
            onClick={() => setOpen((v) => !v)}
          >
            <Building2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="flex-1 text-xs font-semibold text-foreground truncate">{inst.institution}</span>
            {matchLabel && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium truncate max-w-[80px] hidden sm:inline-block" title={matchLabel}>
                {matchLabel}
              </span>
            )}
            <Badge variant="secondary" className="text-[11px] tabular-nums shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">+{inst.count}</Badge>
            {open ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
          </div>
          {open && inst.sampleAssets.length > 0 && (
            <div className="px-3 pb-3 border-t border-white/20 dark:border-white/10">
              <div className="space-y-1.5 pt-2">
                {inst.sampleAssets.map((asset, i) => (
                  <MiniAssetBloomCard key={asset.id} asset={asset} index={i} />
                ))}
              </div>
              {inst.count > inst.sampleAssets.length && (
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  +{inst.count - inst.sampleAssets.length} more
                </p>
              )}
              <Link
                href={`/scout?q=${encodeURIComponent(inst.institution)}`}
                className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline mt-2 transition-colors"
                data-testid={`alert-scout-link-${inst.institution}`}
              >
                Search Scout for {inst.institution} assets
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type ConceptItem = IndustryDeltaResponse["newConcepts"]["items"][number];
type ProjectItem = IndustryDeltaResponse["newProjects"]["items"][number];

function ConceptAlertCard({ concept }: { concept: ConceptItem }) {
  const { cardRef, hovered, cardStyle, bloomHandlers } = useBloomCard(7);
  return (
    <div style={{ perspective: "1000px" }} data-testid={`alert-concept-${concept.id}`}>
      <Link href={`/discovery/concept/${concept.id}`}>
        <div
          ref={cardRef}
          className="relative rounded-[13px] overflow-hidden bg-white dark:bg-zinc-900 border border-white/90 dark:border-white/10 cursor-pointer"
          style={cardStyle}
          {...bloomHandlers}
        >
          <div
            className="absolute pointer-events-none"
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(217, 119, 6, 0.55)",
              top: "-28px",
              left: "-28px",
              transform: hovered ? "scale(26)" : "scale(1)",
              opacity: hovered ? 0.13 : 0,
              transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
              zIndex: 1,
            }}
          />
          <div className="absolute left-0 top-0 bottom-0 w-[3px] z-[3]" style={{ background: "#d97706" }} />

          <div
            className="absolute top-0 left-0 z-[5] flex flex-col items-center justify-center px-2 py-1 border-b border-r border-amber-500/40 bg-white dark:bg-zinc-900"
            style={{ borderRadius: "17px 0 10px 0", minWidth: "34px" }}
          >
            <span className="text-[8px] font-bold tracking-[0.15em] uppercase leading-none text-muted-foreground">Idea</span>
            <span className="font-mono text-xs font-bold leading-tight mt-0.5 text-amber-600 dark:text-amber-400">
              {concept.therapeuticArea ? concept.therapeuticArea.slice(0, 2).toUpperCase() : "—"}
            </span>
          </div>

          <div className="relative z-[4] pl-4 pr-3 pt-7 pb-3">
            <p className="text-xs font-semibold text-foreground truncate">{concept.title}</p>
            {concept.oneLiner && (
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{concept.oneLiner}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              {concept.therapeuticArea && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400">{concept.therapeuticArea}</span>
              )}
              {concept.submitterAffiliation && (
                <span className="text-[10px] text-muted-foreground truncate">{concept.submitterAffiliation}</span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

function ProjectAlertCard({ proj }: { proj: ProjectItem }) {
  const { cardRef, hovered, cardStyle, bloomHandlers } = useBloomCard(7);
  return (
    <div style={{ perspective: "1000px" }} data-testid={`alert-project-${proj.id}`}>
      <Link href="/industry/projects">
        <div
          ref={cardRef}
          className="relative rounded-[13px] overflow-hidden bg-white dark:bg-zinc-900 border border-white/90 dark:border-white/10 cursor-pointer"
          style={cardStyle}
          {...bloomHandlers}
        >
          <div
            className="absolute pointer-events-none"
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(124, 58, 237, 0.55)",
              top: "-28px",
              left: "-28px",
              transform: hovered ? "scale(26)" : "scale(1)",
              opacity: hovered ? 0.13 : 0,
              transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
              zIndex: 1,
            }}
          />
          <div className="absolute left-0 top-0 bottom-0 w-[3px] z-[3]" style={{ background: "#7c3aed" }} />

          <div
            className="absolute top-0 left-0 z-[5] flex flex-col items-center justify-center px-2 py-1 border-b border-r border-violet-500/40 bg-white dark:bg-zinc-900"
            style={{ borderRadius: "17px 0 10px 0", minWidth: "34px" }}
          >
            <span className="text-[8px] font-bold tracking-[0.15em] uppercase leading-none text-muted-foreground">Lab</span>
            <span className="font-mono text-xs font-bold leading-tight mt-0.5 text-violet-600 dark:text-violet-400">
              {proj.researchArea ? proj.researchArea.slice(0, 2).toUpperCase() : "—"}
            </span>
          </div>

          <div className="relative z-[4] pl-4 pr-3 pt-7 pb-3">
            <p className="text-xs font-semibold text-foreground truncate">
              {proj.discoveryTitle || proj.title}
            </p>
            {(proj.discoverySummary || proj.description) && (
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                {proj.discoverySummary || proj.description}
              </p>
            )}
            <div className="flex items-center justify-between mt-1.5 gap-2">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                {proj.researchArea && (
                  <span className="text-[10px] text-violet-500">{proj.researchArea}</span>
                )}
                {(proj.projectContributors ?? [])[0]?.institution && (
                  <span className="text-[10px] text-muted-foreground truncate">
                    {(proj.projectContributors ?? [])[0].institution}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground/60 capitalize">{proj.status}</span>
              </div>
              {proj.projectUrl && (
                <a
                  href={proj.projectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[10px] text-violet-500 hover:underline shrink-0"
                  data-testid={`alert-project-source-${proj.id}`}
                >
                  Source
                </a>
              )}
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

function ConceptsSection({ data }: { data: IndustryDeltaResponse["newConcepts"] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-card-border bg-card overflow-hidden">
      <div className="p-4">
        <SectionHeader
          icon={Lightbulb}
          label="New Concepts"
          count={data.total}
          color="bg-amber-500/10 text-amber-500"
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          hasNew={data.total > 0}
        />
      </div>
      {expanded && (
        <div className="border-t border-card-border/60 px-4 pb-4">
          {data.total === 0 ? (
            <p className="text-xs text-muted-foreground pt-3">
              No new concepts since your last visit. Check back soon.
            </p>
          ) : (
            <div className="pt-3 space-y-2">
              {data.items.map((concept) => (
                <ConceptAlertCard key={concept.id} concept={concept} />
              ))}
              {data.total > data.items.length && (
                <Link href="/industry/concepts">
                  <p className="text-xs text-primary hover:underline cursor-pointer">
                    +{data.total - data.items.length} more, view all concepts
                  </p>
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectsSection({ data }: { data: IndustryDeltaResponse["newProjects"] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-card-border bg-card overflow-hidden">
      <div className="p-4">
        <SectionHeader
          icon={FlaskConical}
          label="Research Projects"
          count={data.total}
          color="bg-violet-500/10 text-violet-500"
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          hasNew={data.total > 0}
        />
      </div>
      {expanded && (
        <div className="border-t border-card-border/60 px-4 pb-4">
          {data.total === 0 ? (
            <p className="text-xs text-muted-foreground pt-3">
              No new research projects since your last visit. Check back soon.
            </p>
          ) : (
            <div className="pt-3 space-y-2">
              {data.items.map((proj) => (
                <ProjectAlertCard key={proj.id} proj={proj} />
              ))}
              {data.total > data.items.length && (
                <Link href="/industry/projects">
                  <p className="text-xs text-primary hover:underline cursor-pointer">
                    +{data.total - data.items.length} more, view all projects
                  </p>
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const MODALITY_OPTIONS = [
  "Small Molecule", "Antibody", "CAR-T", "Gene Therapy",
  "mRNA Therapy", "Peptide", "Bispecific Antibody", "ADC", "PROTAC",
];
const STAGE_OPTIONS = ["Discovery", "Preclinical", "Phase 1", "Phase 2", "Phase 3"];

function MultiSelectCombobox({
  options,
  selected,
  onToggle,
  placeholder,
  searchPlaceholder,
  testId,
}: {
  options: string[];
  selected: string[];
  onToggle: (val: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase())
  );

  const label = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm text-left hover:bg-accent/20 transition-colors"
          data-testid={testId}
        >
          <span className={selected.length === 0 ? "text-muted-foreground" : "text-foreground truncate"}>
            {label}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No options found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((opt) => (
                <CommandItem
                  key={opt}
                  onSelect={() => onToggle(opt)}
                  className="flex items-center gap-2"
                >
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${selected.includes(opt) ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                    {selected.includes(opt) && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                  </div>
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function InstitutionCombobox({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: allInstitutions = [] } = useQuery<string[]>({
    queryKey: ["/api/ingest/institutions/names"],
    staleTime: 10 * 60 * 1000,
  });

  const filtered = allInstitutions.filter((inst) =>
    inst.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 100);

  const label = selected.length === 0
    ? "All institutions"
    : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm text-left hover:bg-accent/20 transition-colors"
          data-testid="select-alert-institutions"
        >
          <span className={selected.length === 0 ? "text-muted-foreground" : "text-foreground truncate"}>
            {label}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type to search institutions..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-60">
            <CommandEmpty>No institutions found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((inst) => (
                <CommandItem
                  key={inst}
                  onSelect={() => onToggle(inst)}
                  className="flex items-center gap-2"
                >
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${selected.includes(inst) ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                    {selected.includes(inst) && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                  </div>
                  <span className="truncate text-sm">{inst}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CreateAlertSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [modalities, setModalities] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [institutions, setInstitutions] = useState<string[]>([]);

  function toggleItem(arr: string[], setArr: (v: string[]) => void, val: string) {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/alerts", {
        query: query.trim() || null,
        modalities: modalities.map((m) => m.toLowerCase().replace(/\s+/g, "-")),
        stages: stages.map((s) => s.toLowerCase().replace(/\s+/g, "-")),
        institutions,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "Alert saved", description: "You'll see it in My Alerts." });
      setQuery("");
      setModalities([]);
      setStages([]);
      setInstitutions([]);
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Error saving alert", description: err.message, variant: "destructive" });
    },
  });

  function handleSave() {
    if (!query.trim() && modalities.length === 0 && stages.length === 0 && institutions.length === 0) {
      toast({ title: "Set at least one filter", variant: "destructive" });
      return;
    }
    saveMutation.mutate();
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Create Alert</SheetTitle>
          <SheetDescription>
            Set up a saved search that notifies you when new matching assets are found.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="alert-query">Query</Label>
            <Input
              id="alert-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. CAR-T solid tumor preclinical"
              data-testid="input-alert-query"
            />
          </div>

          <div className="space-y-2">
            <Label>Modality</Label>
            <MultiSelectCombobox
              options={MODALITY_OPTIONS}
              selected={modalities}
              onToggle={(v) => toggleItem(modalities, setModalities, v)}
              placeholder="Any modality"
              searchPlaceholder="Search modalities..."
              testId="select-alert-modality"
            />
            {modalities.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {modalities.map((m) => (
                  <span key={m} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
                    {m}
                    <button onClick={() => toggleItem(modalities, setModalities, m)} className="hover:text-destructive">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Stage</Label>
            <MultiSelectCombobox
              options={STAGE_OPTIONS}
              selected={stages}
              onToggle={(v) => toggleItem(stages, setStages, v)}
              placeholder="Any stage"
              searchPlaceholder="Search stages..."
              testId="select-alert-stage"
            />
            {stages.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {stages.map((s) => (
                  <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500 border border-violet-500/20 flex items-center gap-1">
                    {s}
                    <button onClick={() => toggleItem(stages, setStages, s)} className="hover:text-destructive">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Institutions</Label>
            <InstitutionCombobox
              selected={institutions}
              onToggle={(v) => toggleItem(institutions, setInstitutions, v)}
            />
            {institutions.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {institutions.map((inst) => (
                  <span key={inst} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center gap-1 max-w-[150px]">
                    <span className="truncate">{inst}</span>
                    <button onClick={() => toggleItem(institutions, setInstitutions, inst)} className="hover:text-destructive shrink-0">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 flex gap-3">
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              data-testid="button-save-alert"
            >
              {saveMutation.isPending ? "Saving..." : "Save Alert"}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              data-testid="button-cancel-alert"
            >
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function Alerts() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sinceParam, setSinceParam] = useState<string>(() =>
    typeof window !== "undefined" ? (localStorage.getItem(STORAGE_KEY) ?? "") : ""
  );

  const deltaUrl = sinceParam
    ? `/api/industry/alerts/delta?since=${encodeURIComponent(sinceParam)}`
    : "/api/industry/alerts/delta";

  const { data, isLoading } = useQuery<IndustryDeltaResponse>({
    queryKey: [deltaUrl],
    staleTime: 5 * 60 * 1000,
  });

  const totalNew =
    (data?.newAssets.total ?? 0) +
    (data?.newConcepts.total ?? 0) +
    (data?.newProjects.total ?? 0);

  const sinceLabel = formatRelative(data?.since ?? (sinceParam || undefined));

  function handleMarkAllSeen() {
    const now = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, now);
    window.dispatchEvent(new CustomEvent("eden-alerts-seen"));
    setSinceParam(now);
  }

  return (
    <div className="min-h-full">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-foreground">Alerts</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                New discoveries across TTO assets, concepts, and research projects since your last visit.
              </p>
            </div>
            <Button
              className="gap-2 shrink-0"
              onClick={() => setSheetOpen(true)}
              data-testid="button-create-alert"
            >
              <Plus className="w-4 h-4" />
              Create Alert
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
        {isLoading ? (
          <div className="space-y-3 max-w-2xl">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : !data ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Bell className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">Could not load alerts</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-4">
              <MyAlertsSection onCreateAlert={() => setSheetOpen(true)} />
              <TtoAssetsSection data={data.newAssets} onCreateAlert={() => setSheetOpen(true)} />
              <ConceptsSection data={data.newConcepts} />
              <ProjectsSection data={data.newProjects} />
            </div>

            <div className="lg:col-span-1">
              <div className="rounded-lg border border-card-border bg-card p-5 space-y-3 sticky top-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs font-medium">Since last visit</span>
                </div>
                <p className="text-[10px] text-muted-foreground/70 -mt-1">
                  Showing activity from {sinceLabel}
                </p>
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">TTO Assets</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      +{data.newAssets.total}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Concepts</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      +{data.newConcepts.total}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Research Projects</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      +{data.newProjects.total}
                    </span>
                  </div>
                </div>
                <div className="border-t border-border/60 pt-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Total
                  </span>
                  <span className="text-xl font-bold text-primary tabular-nums">
                    +{totalNew}
                  </span>
                </div>
                {totalNew > 0 && (
                  <button
                    onClick={handleMarkAllSeen}
                    className="w-full text-[11px] text-muted-foreground hover:text-foreground border border-border rounded-md py-1.5 transition-colors flex items-center justify-center gap-1.5"
                    data-testid="button-mark-all-seen"
                  >
                    <Check className="w-3 h-3" />
                    Mark all as seen
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <CreateAlertSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
