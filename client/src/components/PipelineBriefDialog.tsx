import { useState } from "react";
import { FileText, Copy, Check, Printer } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export type BriefSignal = {
  type: string;
  title: string;
  year: string;
  summary?: string;
};

export type BriefAsset = {
  id: number;
  name: string;
  target: string;
  modality: string;
  stage: string;
  indication: string;
  status: string | null;
  institution: string;
  summary: string;
  insight: string | null;
  signals: BriefSignal[];
};

export type BriefData = {
  pipelineName: string;
  assetCount: number;
  generatedAt: string;
  assets: BriefAsset[];
  standaloneSignals: { type: string; title: string; year: string }[];
  strategicThesis: string;
  bdStatusOverview: string;
  strategicAssessment: string;
  brief: string;
};

const SOURCE_COLORS: Record<string, string> = {
  Patent: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
  "Clinical Trial": "text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/30",
  Paper: "text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/30",
  Preprint: "text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/30",
  Signal: "text-muted-foreground bg-muted border-border",
};

export function PipelineBriefDialog({
  data,
  open,
  onClose,
}: {
  data: BriefData | null;
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!data) return;
    navigator.clipboard.writeText(data.brief).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handlePrint = () => {
    if (!data) return;
    sessionStorage.setItem("pipeline-brief-print", JSON.stringify(data));
    window.open("/pipeline/brief/print", "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]" data-testid="dialog-pipeline-brief">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle className="flex items-center gap-2 text-base flex-1 min-w-0 truncate">
              <FileText className="w-4 h-4 text-primary shrink-0" />
              {data?.pipelineName}: Pipeline Brief
            </DialogTitle>
            {data && (
              <span className="text-xs text-muted-foreground shrink-0">
                {data.assetCount} asset{data.assetCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col gap-5 py-1 pr-1">

            {data?.strategicThesis && (
              <NarrativeSection label="Strategic Thesis" body={data.strategicThesis} />
            )}

            {data?.bdStatusOverview && (
              <NarrativeSection label="BD Status" body={data.bdStatusOverview} />
            )}

            {data?.assets && data.assets.length > 0 && (
              <div>
                <SectionLabel>Asset Roster</SectionLabel>
                <div className="flex flex-col gap-2.5 mt-2">
                  {data.assets.map((asset, i) => (
                    <AssetBlock key={asset.id} asset={asset} index={i} />
                  ))}
                </div>
              </div>
            )}

            {data?.standaloneSignals && data.standaloneSignals.length > 0 && (
              <div>
                <SectionLabel>Unlinked Signals</SectionLabel>
                <div className="flex flex-col gap-1.5 mt-2">
                  {data.standaloneSignals.map((s, i) => (
                    <SignalRow key={i} signal={s} />
                  ))}
                </div>
              </div>
            )}

            {data?.strategicAssessment && (
              <NarrativeSection label="Strategic Assessment" body={data.strategicAssessment} />
            )}

          </div>
        </ScrollArea>

        <DialogFooter className="shrink-0 flex items-center justify-end gap-2 sm:justify-end">
          <Button variant="outline" size="sm" onClick={handleCopy} className="h-7 text-xs gap-1.5" data-testid="button-brief-copy">
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied!" : "Copy"}
          </Button>
          <Button size="sm" onClick={handlePrint} className="h-7 text-xs gap-1.5" data-testid="button-brief-print">
            <Printer className="w-3 h-3" />
            Full Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
      {children}
    </p>
  );
}

function NarrativeSection({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <p className="mt-1.5 text-sm text-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function AssetBlock({ asset, index }: { asset: BriefAsset; index: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-bold text-muted-foreground tabular-nums mt-0.5 w-4 shrink-0 text-right">
          {index + 1}.
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="font-semibold text-sm text-foreground">{asset.name}</span>
            {asset.stage && asset.stage !== "—" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium shrink-0">
                {asset.stage}
              </span>
            )}
            {asset.status && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted border border-border text-muted-foreground font-medium shrink-0">
                {asset.status}
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground mb-2">
            {[
              asset.target !== "—" && `Target: ${asset.target}`,
              asset.modality !== "—" && asset.modality,
              asset.indication !== "—" && asset.indication,
              asset.institution !== "—" && asset.institution,
            ].filter(Boolean).join(" · ")}
          </p>

          {asset.insight && (
            <p className="text-xs text-foreground leading-relaxed mb-2 pl-2 border-l-2 border-primary/30 italic">
              {asset.insight}
            </p>
          )}

          {asset.signals.length > 0 && (
            <div className="flex flex-col gap-1 mt-1 pt-2 border-t border-border/50">
              <p className="text-[10px] font-medium text-muted-foreground mb-0.5">
                Supporting evidence
              </p>
              {asset.signals.map((s, i) => (
                <SignalRow key={i} signal={s} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SignalRow({ signal }: { signal: { type: string; title: string; year: string; summary?: string } }) {
  const color = SOURCE_COLORS[signal.type] ?? SOURCE_COLORS.Signal;
  return (
    <div className="flex items-center gap-2 text-xs min-w-0">
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border shrink-0 ${color}`}>
        {signal.type}
      </span>
      <span className="text-muted-foreground truncate flex-1" title={signal.title}>
        {signal.title}
      </span>
      <span className="text-muted-foreground/60 shrink-0 tabular-nums">{signal.year}</span>
    </div>
  );
}
