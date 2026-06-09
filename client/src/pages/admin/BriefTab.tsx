import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, ExternalLink, Send, ChevronDown, ChevronRight,
  Trash2, CheckCircle2, FileText, Users, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { BriefContent, BriefTagType, EdenBriefIssue } from "@shared/schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

function authH(pw: string) {
  return pw ? { Authorization: `Bearer ${pw}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "Draft";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function currentMonthSlug() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const TAG_TYPES: BriefTagType[] = ["default", "oncology", "cns", "rare", "gene"];

const BLANK_CONTENT: BriefContent = {
  the_number: { figure: "", delta: "", headline: "", body: "" },
  whats_moving: [
    { text: "" },
    { text: "" },
    { text: "", chart: [] },
  ],
  therapeutic_spotlight: {
    area: "",
    body: ["", ""],
    stats: [
      { figure: "", label: "" },
      { figure: "", label: "" },
      { figure: "", label: "" },
    ],
    ring: { pct: 0, label: "", detail: "" },
  },
  brief_take: { quote: "", attribution: "" },
  pipeline: [
    { mechanism: "", tags: [], stage: "", tier: "Tier 1", status: "available" },
    { mechanism: "", tags: [], stage: "", tier: "Tier 1", status: "available" },
    { mechanism: "", tags: [], stage: "", tier: "Tier 2", status: "available" },
    { mechanism: "", tags: [], stage: "", tier: "Tier 2", status: "available" },
  ],
};

// ── Section accordion wrapper ─────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/40 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-foreground tracking-wide uppercase" style={{ fontSize: "11px", letterSpacing: "0.1em" }}>
          {title}
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-4 space-y-3 bg-background">{children}</div>}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-muted-foreground mb-1">{children}</label>;
}

// ── Issue content editor ──────────────────────────────────────────────────────

function IssueEditor({
  issue,
  pw,
  onBack,
}: {
  issue: EdenBriefIssue;
  pw: string;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState(issue.title);
  const [content, setContent] = useState<BriefContent>(
    issue.content && Object.keys(issue.content).length > 0
      ? (issue.content as BriefContent)
      : BLANK_CONTENT,
  );
  const [publishOpen, setPublishOpen] = useState(false);

  const { data: subscriberData } = useQuery<{ count: number }>({
    queryKey: ["brief-subscriber-count"],
    queryFn: () => fetch("/api/admin/brief/subscribers/count", { headers: authH(pw) }).then(r => r.json()),
    enabled: !!pw,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/admin/brief/${issue.id}`, {
        method: "PATCH",
        headers: authH(pw),
        body: JSON.stringify({ title, content }),
      }).then(r => { if (!r.ok) throw new Error("Save failed"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-brief-issues"] });
      toast({ title: "Draft saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const publishMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/admin/brief/${issue.id}/publish`, {
        method: "POST",
        headers: authH(pw),
      }).then(r => { if (!r.ok) throw new Error("Publish failed"); return r.json(); }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin-brief-issues"] });
      setPublishOpen(false);
      toast({ title: `Published. ${data.sent} email${data.sent === 1 ? "" : "s"} sent.` });
    },
    onError: () => toast({ title: "Publish failed", variant: "destructive" }),
  });

  function set(updater: (c: BriefContent) => BriefContent) {
    setContent(prev => updater(JSON.parse(JSON.stringify(prev))));
  }

  const c = content;

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            &larr; All Issues
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium text-foreground">
            Issue {issue.issueNumber} &middot; {issue.slug}
          </span>
          <Badge variant={issue.status === "published" ? "default" : "secondary"}>
            {issue.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/brief/${issue.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 border border-border rounded-md"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Preview
          </a>
          <Button
            size="sm"
            variant="outline"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Save Draft
          </Button>
          {issue.status !== "published" && (
            <Button
              size="sm"
              onClick={() => setPublishOpen(true)}
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Publish + Send
            </Button>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <FieldLabel>Issue title</FieldLabel>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Q2 Signals" />
        </div>
        <div>
          <FieldLabel>Slug (YYYY-MM, read-only after creation)</FieldLabel>
          <Input value={issue.slug} disabled className="opacity-60" />
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-3">

        {/* 01 - THE NUMBER */}
        <Section title="01 - The Number">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Figure</FieldLabel>
              <Input
                value={c.the_number.figure}
                onChange={e => set(d => { d.the_number.figure = e.target.value; return d; })}
                placeholder="847"
              />
            </div>
            <div>
              <FieldLabel>Delta</FieldLabel>
              <Input
                value={c.the_number.delta}
                onChange={e => set(d => { d.the_number.delta = e.target.value; return d; })}
                placeholder="+14% vs Q2 2025"
              />
            </div>
          </div>
          <div>
            <FieldLabel>Headline</FieldLabel>
            <Input
              value={c.the_number.headline}
              onChange={e => set(d => { d.the_number.headline = e.target.value; return d; })}
              placeholder="New biotech assets entered monitored TTO portfolios..."
            />
          </div>
          <div>
            <FieldLabel>Body</FieldLabel>
            <Textarea
              value={c.the_number.body}
              onChange={e => set(d => { d.the_number.body = e.target.value; return d; })}
              rows={3}
              placeholder="Across 400+ technology transfer offices..."
            />
          </div>
        </Section>

        {/* 02 - WHAT'S MOVING */}
        <Section title="02 - What's Moving">
          {c.whats_moving.map((item, i) => (
            <div key={i} className="border border-border rounded-md p-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Observation {i + 1}</div>
              <div>
                <FieldLabel>
                  Text (HTML allowed for &lt;strong&gt; emphasis)
                </FieldLabel>
                <Textarea
                  value={item.text}
                  onChange={e => set(d => { d.whats_moving[i].text = e.target.value; return d; })}
                  rows={3}
                  placeholder="<strong>Oncology competition is at a three-year high.</strong> BD teams..."
                />
              </div>
              {i === c.whats_moving.length - 1 && (
                <div>
                  <FieldLabel>
                    Chart data (optional, JSON array: {`[{"label":"Oncology","value":312,"maxValue":312}]`})
                  </FieldLabel>
                  <Textarea
                    value={item.chart ? JSON.stringify(item.chart, null, 2) : ""}
                    onChange={e => {
                      try {
                        const parsed = JSON.parse(e.target.value || "[]");
                        set(d => { d.whats_moving[i].chart = parsed; return d; });
                      } catch { /* ignore parse errors while typing */ }
                    }}
                    rows={5}
                    className="font-mono text-xs"
                    placeholder='[{"label":"Oncology","value":312,"maxValue":312}]'
                  />
                </div>
              )}
            </div>
          ))}
        </Section>

        {/* 03 - THERAPEUTIC SPOTLIGHT */}
        <Section title="03 - Therapeutic Spotlight">
          <div>
            <FieldLabel>Focus area</FieldLabel>
            <Input
              value={c.therapeutic_spotlight.area}
              onChange={e => set(d => { d.therapeutic_spotlight.area = e.target.value; return d; })}
              placeholder="Central Nervous System"
            />
          </div>
          {c.therapeutic_spotlight.body.map((para, i) => (
            <div key={i}>
              <FieldLabel>Paragraph {i + 1}</FieldLabel>
              <Textarea
                value={para}
                onChange={e => set(d => { d.therapeutic_spotlight.body[i] = e.target.value; return d; })}
                rows={3}
              />
            </div>
          ))}
          <div className="grid grid-cols-3 gap-3">
            {c.therapeutic_spotlight.stats.map((stat, i) => (
              <div key={i} className="border border-border rounded-md p-2 space-y-1.5">
                <div className="text-xs text-muted-foreground font-medium">Stat {i + 1}</div>
                <Input
                  value={stat.figure}
                  onChange={e => set(d => { d.therapeutic_spotlight.stats[i].figure = e.target.value; return d; })}
                  placeholder="143"
                  className="text-sm"
                />
                <Input
                  value={stat.label}
                  onChange={e => set(d => { d.therapeutic_spotlight.stats[i].label = e.target.value; return d; })}
                  placeholder="CNS assets in active pipeline"
                  className="text-sm"
                />
              </div>
            ))}
          </div>
          {c.therapeutic_spotlight.ring && (
            <div className="border border-border rounded-md p-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Ring callout (optional)</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <FieldLabel>Percent</FieldLabel>
                  <Input
                    type="number"
                    value={c.therapeutic_spotlight.ring.pct}
                    onChange={e => set(d => { d.therapeutic_spotlight.ring!.pct = Number(e.target.value); return d; })}
                    placeholder="75"
                  />
                </div>
                <div>
                  <FieldLabel>Label</FieldLabel>
                  <Input
                    value={c.therapeutic_spotlight.ring.label}
                    onChange={e => set(d => { d.therapeutic_spotlight.ring!.label = e.target.value; return d; })}
                    placeholder="Uncontested"
                  />
                </div>
                <div>
                  <FieldLabel>Detail</FieldLabel>
                  <Input
                    value={c.therapeutic_spotlight.ring.detail}
                    onChange={e => set(d => { d.therapeutic_spotlight.ring!.detail = e.target.value; return d; })}
                    placeholder="of CNS assets have had no qualified BD inquiry..."
                  />
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* 04 - THE BRIEF TAKE */}
        <Section title="04 - The Brief Take">
          <div>
            <FieldLabel>Quote (no quotation marks needed)</FieldLabel>
            <Textarea
              value={c.brief_take.quote}
              onChange={e => set(d => { d.brief_take.quote = e.target.value; return d; })}
              rows={5}
              placeholder="The licensing market conflates recency with relevance..."
            />
          </div>
          <div>
            <FieldLabel>Attribution</FieldLabel>
            <Input
              value={c.brief_take.attribution}
              onChange={e => set(d => { d.brief_take.attribution = e.target.value; return d; })}
              placeholder="Eden NX Editorial, June 2026"
            />
          </div>
        </Section>

        {/* 05 - FROM THE PIPELINE */}
        <Section title="05 - From the Pipeline">
          {c.pipeline.map((asset, i) => (
            <div key={i} className="border border-border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-muted-foreground">Asset {i + 1}</div>
                {c.pipeline.length > 2 && (
                  <button
                    onClick={() => set(d => { d.pipeline.splice(i, 1); return d; })}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div>
                <FieldLabel>Mechanism description</FieldLabel>
                <Textarea
                  value={asset.mechanism}
                  onChange={e => set(d => { d.pipeline[i].mechanism = e.target.value; return d; })}
                  rows={2}
                  placeholder="Novel gene-silencing mechanism targeting validated CNS pathway"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <FieldLabel>Stage</FieldLabel>
                  <Input
                    value={asset.stage}
                    onChange={e => set(d => { d.pipeline[i].stage = e.target.value; return d; })}
                    placeholder="Pre-clinical"
                  />
                </div>
                <div>
                  <FieldLabel>Tier</FieldLabel>
                  <Select
                    value={asset.tier}
                    onValueChange={v => set(d => { d.pipeline[i].tier = v; return d; })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Tier 1">Tier 1</SelectItem>
                      <SelectItem value="Tier 2">Tier 2</SelectItem>
                      <SelectItem value="Tier 3">Tier 3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FieldLabel>Status</FieldLabel>
                  <Select
                    value={asset.status}
                    onValueChange={v => set(d => { d.pipeline[i].status = v as "available" | "in_discussion"; return d; })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="in_discussion">In Discussion</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Tags */}
              <div>
                <FieldLabel>Tags</FieldLabel>
                <div className="space-y-1.5">
                  {asset.tags.map((tag, ti) => (
                    <div key={ti} className="flex items-center gap-2">
                      <Input
                        value={tag.label}
                        onChange={e => set(d => { d.pipeline[i].tags[ti].label = e.target.value; return d; })}
                        placeholder="CNS"
                        className="flex-1 text-sm"
                      />
                      <Select
                        value={tag.type}
                        onValueChange={v => set(d => { d.pipeline[i].tags[ti].type = v as BriefTagType; return d; })}
                      >
                        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TAG_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <button
                        onClick={() => set(d => { d.pipeline[i].tags.splice(ti, 1); return d; })}
                        className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => set(d => { d.pipeline[i].tags.push({ label: "", type: "default" }); return d; })}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                  >
                    <Plus className="h-3 w-3" /> Add tag
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={() => set(d => {
              d.pipeline.push({ mechanism: "", tags: [], stage: "", tier: "Tier 2", status: "available" });
              return d;
            })}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border rounded-md px-3 py-2 w-full justify-center"
          >
            <Plus className="h-3.5 w-3.5" /> Add asset
          </button>
        </Section>

      </div>{/* /sections */}

      {/* Bottom save bar */}
      <div className="flex items-center justify-between mt-6 pt-6 border-t border-border">
        <div className="text-xs text-muted-foreground">
          {saveMutation.isSuccess ? (
            <span className="flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved
            </span>
          ) : "Unsaved changes are lost on navigation."}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Save Draft
          </Button>
          {issue.status !== "published" && (
            <Button
              onClick={() => setPublishOpen(true)}
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Publish + Send
            </Button>
          )}
        </div>
      </div>

      {/* Publish confirmation */}
      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish Issue {issue.issueNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will make the issue publicly visible at{" "}
              <span className="font-mono text-xs">/brief/{issue.slug}</span> and send
              an email to{" "}
              <strong>{subscriberData?.count ?? "..."} subscriber{(subscriberData?.count ?? 0) === 1 ? "" : "s"}</strong>.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => publishMutation.mutate()}
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              {publishMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Publish and send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Issue list ────────────────────────────────────────────────────────────────

function IssueList({
  pw,
  onSelect,
}: {
  pw: string;
  onSelect: (issue: EdenBriefIssue) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [newSlug, setNewSlug] = useState(currentMonthSlug());
  const [newTitle, setNewTitle] = useState("");
  const [newIssueNumber, setNewIssueNumber] = useState(1);

  const { data: issues = [], isLoading } = useQuery<EdenBriefIssue[]>({
    queryKey: ["admin-brief-issues"],
    queryFn: () => fetch("/api/admin/brief", { headers: authH(pw) }).then(r => r.json()),
    enabled: !!pw,
  });

  const { data: subscriberData } = useQuery<{ count: number }>({
    queryKey: ["brief-subscriber-count"],
    queryFn: () => fetch("/api/admin/brief/subscribers/count", { headers: authH(pw) }).then(r => r.json()),
    enabled: !!pw,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      fetch("/api/admin/brief", {
        method: "POST",
        headers: authH(pw),
        body: JSON.stringify({
          slug: newSlug,
          issueNumber: newIssueNumber,
          title: newTitle || "Untitled",
          content: BLANK_CONTENT,
        }),
      }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    onSuccess: (issue: EdenBriefIssue) => {
      qc.invalidateQueries({ queryKey: ["admin-brief-issues"] });
      setNewOpen(false);
      setNewTitle("");
      toast({ title: `Draft created: Issue ${issue.issueNumber}` });
      onSelect(issue);
    },
    onError: () => toast({ title: "Create failed. Slug may already exist.", variant: "destructive" }),
  });

  const nextIssueNumber = issues.length > 0
    ? Math.max(...issues.map(i => i.issueNumber)) + 1
    : 1;

  return (
    <div>
      {/* Header stats */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold text-foreground leading-none">
                {issues.filter(i => i.status === "published").length}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Published</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold text-foreground leading-none">
                {subscriberData?.count ?? "--"}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Subscribers</div>
            </div>
          </div>
        </div>
        <Button
          onClick={() => { setNewIssueNumber(nextIssueNumber); setNewSlug(currentMonthSlug()); setNewOpen(true); }}
          className="bg-emerald-700 hover:bg-emerald-800 text-white"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New Issue
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : issues.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          No issues yet. Create the first one.
        </div>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left pb-2.5 text-xs font-medium text-muted-foreground pr-4">#</th>
              <th className="text-left pb-2.5 text-xs font-medium text-muted-foreground pr-4">Title</th>
              <th className="text-left pb-2.5 text-xs font-medium text-muted-foreground pr-4">Slug</th>
              <th className="text-left pb-2.5 text-xs font-medium text-muted-foreground pr-4">Status</th>
              <th className="text-left pb-2.5 text-xs font-medium text-muted-foreground pr-4">Published</th>
              <th className="pb-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {issues.map(issue => (
              <tr key={issue.id} className="group hover:bg-muted/30 transition-colors">
                <td className="py-3 pr-4 text-muted-foreground font-mono text-xs">{issue.issueNumber}</td>
                <td className="py-3 pr-4 font-medium text-foreground">{issue.title}</td>
                <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{issue.slug}</td>
                <td className="py-3 pr-4">
                  <Badge
                    variant={issue.status === "published" ? "default" : "secondary"}
                    className={issue.status === "published" ? "bg-emerald-700 text-white" : ""}
                  >
                    {issue.status}
                  </Badge>
                </td>
                <td className="py-3 pr-4 text-xs text-muted-foreground">{fmtDate(issue.publishedAt)}</td>
                <td className="py-3 text-right">
                  <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onSelect(issue)}
                      className="text-xs text-primary hover:underline px-2 py-1"
                    >
                      Edit
                    </button>
                    <a
                      href={`/brief/${issue.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 flex items-center gap-0.5"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Create dialog */}
      <AlertDialog open={newOpen} onOpenChange={setNewOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>New Issue</AlertDialogTitle>
            <AlertDialogDescription>
              Creates a draft. You can edit all content before publishing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <FieldLabel>Issue number</FieldLabel>
              <Input
                type="number"
                value={newIssueNumber}
                onChange={e => setNewIssueNumber(Number(e.target.value))}
              />
            </div>
            <div>
              <FieldLabel>Slug (YYYY-MM)</FieldLabel>
              <Input
                value={newSlug}
                onChange={e => setNewSlug(e.target.value)}
                placeholder="2026-07"
              />
            </div>
            <div>
              <FieldLabel>Title</FieldLabel>
              <Input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Q3 Signals"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => createMutation.mutate()}
              disabled={!newSlug || createMutation.isPending}
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Create Draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Exported tab ──────────────────────────────────────────────────────────────

export function BriefTab({ pw }: { pw: string }) {
  const [selectedIssue, setSelectedIssue] = useState<EdenBriefIssue | null>(null);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-6 w-6 text-emerald-600" />
          The Eden Brief
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Create, edit, and publish monthly intelligence issues. Publish fires an email to all active subscribers.
        </p>
      </div>

      {selectedIssue ? (
        <IssueEditor
          issue={selectedIssue}
          pw={pw}
          onBack={() => setSelectedIssue(null)}
        />
      ) : (
        <IssueList pw={pw} onSelect={setSelectedIssue} />
      )}
    </div>
  );
}
