type SourceType = "paper" | "preprint" | "clinical_trial" | "patent" | "tech_transfer";

const SOURCE_CONFIG: Record<SourceType, { label: string; classes: string }> = {
  paper: { label: "Paper", classes: "bg-blue-500/10 text-blue-400 border-blue-500/25" },
  preprint: { label: "Preprint", classes: "bg-violet-500/10 text-violet-400 border-violet-500/25" },
  clinical_trial: { label: "Trial", classes: "bg-cyan-500/10 text-cyan-400 border-cyan-500/25" },
  patent: { label: "Patent", classes: "bg-amber-500/10 text-amber-400 border-amber-500/25" },
  tech_transfer: { label: "TT Office", classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" },
};

interface SourceBadgeProps {
  sourceType: string;
}

export function SourceBadge({ sourceType }: SourceBadgeProps) {
  const config = SOURCE_CONFIG[sourceType as SourceType] ?? {
    label: sourceType,
    classes: "bg-muted text-muted-foreground border-border",
  };

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-semibold uppercase tracking-wide border ${config.classes}`}
      data-testid={`source-badge-${sourceType}`}
    >
      {config.label}
    </span>
  );
}
