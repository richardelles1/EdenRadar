import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Plus, Search } from "lucide-react";

const MOCK_REPORTS = [
  {
    id: "r1",
    title: "CAR-T Solid Tumor Opportunities — Q1 2026",
    assetCount: 8,
    generatedAt: "3 days ago",
    institutions: ["Stanford University", "MD Anderson Cancer Center", "UCSF"],
    summary: "Analysis of 8 licensable CAR-T assets targeting solid tumor indications, with emphasis on early-stage preclinical programs from leading TTOs.",
  },
  {
    id: "r2",
    title: "Next-Gen ADC Licensing Landscape",
    assetCount: 12,
    generatedAt: "1 week ago",
    institutions: ["MIT", "Harvard University", "Columbia University"],
    summary: "Comprehensive survey of 12 antibody-drug conjugate programs emerging from university tech transfer offices, covering novel linker and payload chemistries.",
  },
  {
    id: "r3",
    title: "RNA Therapeutics: University Pipeline Survey",
    assetCount: 6,
    generatedAt: "2 weeks ago",
    institutions: ["Johns Hopkins University", "University of Pennsylvania", "Yale University"],
    summary: "Six high-priority mRNA and siRNA therapeutic assets identified across top research universities, spanning rare disease and oncology indications.",
  },
];

export default function Reports() {
  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Reports</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Opportunity briefs and buyer intelligence reports generated from Scout searches.
              </p>
            </div>
            <Link href="/scout">
              <Button className="gap-2" data-testid="button-generate-new-report">
                <Plus className="w-4 h-4" />
                Generate New
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
        {MOCK_REPORTS.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <FileText className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">No reports yet</h2>
              <p className="text-muted-foreground max-w-sm">
                Run a Scout search to generate your first report.
              </p>
            </div>
            <Link href="/scout">
              <Button className="gap-2 mt-2" data-testid="button-reports-go-scout">
                <Search className="w-4 h-4" />
                Go to Scout
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MOCK_REPORTS.map((report) => (
              <div
                key={report.id}
                className="flex flex-col gap-4 p-5 rounded-lg border border-card-border bg-card hover:border-primary/30 transition-colors duration-200"
                data-testid={`report-card-${report.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground leading-snug">{report.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">Generated {report.generatedAt}</p>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className="shrink-0 text-[11px] font-semibold bg-primary/10 text-primary border-0"
                    data-testid={`badge-asset-count-${report.id}`}
                  >
                    {report.assetCount} assets
                  </Badge>
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                  {report.summary}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {report.institutions.map((inst) => (
                    <span
                      key={inst}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-card-border bg-muted/30 text-muted-foreground"
                    >
                      {inst}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-card-border">
                  <Link href="/report" className="flex-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-2 h-8 text-xs border-card-border"
                      data-testid={`button-view-report-${report.id}`}
                    >
                      View Report
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    title="Download PDF"
                    data-testid={`button-download-report-${report.id}`}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
