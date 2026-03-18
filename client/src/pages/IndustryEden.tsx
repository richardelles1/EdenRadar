import { Sparkles } from "lucide-react";

export default function IndustryEden() {
  return (
    <div className="min-h-full bg-background flex items-center justify-center">
      <div className="text-center space-y-4 max-w-sm px-4">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto">
          <Sparkles className="w-7 h-7 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          Eden <span className="text-emerald-500">Intelligence</span>
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your AI-powered deal intelligence layer is being redesigned with
          smarter data-query tools and a full EDEN briefing experience.
          Coming in the next release.
        </p>
        <p className="text-xs text-muted-foreground/60">
          In the meantime, use Scout to search and the Eden AI on the
          researcher portal for asset analysis.
        </p>
      </div>
    </div>
  );
}
