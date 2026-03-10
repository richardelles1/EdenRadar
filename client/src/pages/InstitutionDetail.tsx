import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Building2, ExternalLink, FlaskConical, RefreshCw, ShieldOff } from "lucide-react";
import type { IngestedAsset } from "@shared/schema";

const BLOCKED_SLUGS = new Set([
  "ucsf", "duke", "umich", "mayo", "ucolorado", "columbia",
]);

type Institution = {
  slug: string;
  name: string;
  city: string;
  ttoName: string;
  website: string;
  specialties: string[];
};

const INSTITUTIONS: Institution[] = [
  { slug: "stanford", name: "Stanford University", city: "Palo Alto, CA", ttoName: "Stanford OTT", website: "https://ottech.stanford.edu", specialties: ["Oncology", "Neuroscience", "Gene Therapy"] },
  { slug: "mit", name: "MIT", city: "Cambridge, MA", ttoName: "MIT Technology Licensing Office", website: "https://tlo.mit.edu", specialties: ["Bioelectronics", "Drug Delivery", "Immunology"] },
  { slug: "harvard", name: "Harvard University", city: "Boston, MA", ttoName: "Harvard OTD", website: "https://otd.harvard.edu", specialties: ["Oncology", "Gene Editing", "Immunotherapy"] },
  { slug: "jhu", name: "Johns Hopkins University", city: "Baltimore, MD", ttoName: "Johns Hopkins TTO", website: "https://ventures.jhu.edu", specialties: ["Infectious Disease", "Oncology", "Neuroscience"] },
  { slug: "ucsf", name: "University of California San Francisco", city: "San Francisco, CA", ttoName: "UCSF Innovation Ventures", website: "https://inno.ucsf.edu", specialties: ["Oncology", "Rare Disease", "Immunology"] },
  { slug: "duke", name: "Duke University", city: "Durham, NC", ttoName: "Duke OLV", website: "https://olv.duke.edu", specialties: ["Cardiovascular", "Immunotherapy", "mRNA"] },
  { slug: "columbia", name: "Columbia University", city: "New York, NY", ttoName: "Columbia Technology Ventures", website: "https://techventures.columbia.edu", specialties: ["Neuroscience", "Oncology", "Gene Therapy"] },
  { slug: "upenn", name: "University of Pennsylvania", city: "Philadelphia, PA", ttoName: "Penn Center for Innovation", website: "https://pci.upenn.edu", specialties: ["Gene Therapy", "CAR-T", "mRNA"] },
  { slug: "northwestern", name: "Northwestern University", city: "Evanston, IL", ttoName: "Northwestern TTO", website: "https://tto.northwestern.edu", specialties: ["Drug Delivery", "Oncology", "Bioelectronics"] },
  { slug: "cornell", name: "Cornell University", city: "Ithaca, NY", ttoName: "Cornell Center for TT", website: "https://ctt.cornell.edu", specialties: ["Metabolic Disease", "Antimicrobials", "Oncology"] },
  { slug: "ucberkeley", name: "UC Berkeley", city: "Berkeley, CA", ttoName: "UC Berkeley IPO", website: "https://ipira.berkeley.edu", specialties: ["CRISPR", "Synthetic Biology", "Drug Discovery"] },
  { slug: "uwashington", name: "University of Washington", city: "Seattle, WA", ttoName: "UW CoMotion", website: "https://comotion.uw.edu", specialties: ["Neuroscience", "Oncology", "Structural Biology"] },
  { slug: "wustl", name: "Washington University in St. Louis", city: "St. Louis, MO", ttoName: "WashU OTM", website: "https://otm.wustl.edu", specialties: ["Neuroscience", "Metabolic Disease", "Immunology"] },
  { slug: "umich", name: "University of Michigan", city: "Ann Arbor, MI", ttoName: "U-M Tech Transfer", website: "https://techtransfer.umich.edu", specialties: ["Cardiovascular", "Gene Therapy", "Oncology"] },
  { slug: "mayo", name: "Mayo Clinic", city: "Rochester, MN", ttoName: "Mayo Clinic Ventures", website: "https://ventures.mayoclinic.org", specialties: ["Diagnostics", "Oncology", "Rare Disease"] },
  { slug: "scripps", name: "Scripps Research", city: "La Jolla, CA", ttoName: "Scripps Research TTVD", website: "https://www.scripps.edu/science-and-medicine/ttvd", specialties: ["Drug Discovery", "Antibody Engineering", "Oncology"] },
  { slug: "salk", name: "Salk Institute", city: "La Jolla, CA", ttoName: "Salk TTO", website: "https://www.salk.edu/partnerships-commercialization", specialties: ["Gene Regulation", "Oncology", "Aging"] },
  { slug: "mdanderson", name: "MD Anderson Cancer Center", city: "Houston, TX", ttoName: "MD Anderson TTO", website: "https://www.mdanderson.org/research/departments-labs-institutes/programs-centers/technology-commercialization.html", specialties: ["Oncology", "Immunotherapy", "CAR-T"] },
  { slug: "upitt", name: "University of Pittsburgh", city: "Pittsburgh, PA", ttoName: "Pitt Innovation Institute", website: "https://www.innovation.pitt.edu", specialties: ["Regenerative Medicine", "Oncology", "Organ Transplant"] },
  { slug: "uchicago", name: "University of Chicago", city: "Chicago, IL", ttoName: "UChicago Polsky Center", website: "https://polsky.uchicago.edu", specialties: ["Immunology", "Drug Delivery", "Oncology"] },
  { slug: "yale", name: "Yale University", city: "New Haven, CT", ttoName: "Yale OCS", website: "https://ocr.yale.edu", specialties: ["Oncology", "Immunotherapy", "Structural Biology"] },
  { slug: "vanderbilt", name: "Vanderbilt University", city: "Nashville, TN", ttoName: "Vanderbilt CTTC", website: "https://ctt.vanderbilt.edu", specialties: ["Small Molecules", "Metabolic Disease", "Infectious Disease"] },
  { slug: "emory", name: "Emory University", city: "Atlanta, GA", ttoName: "Emory OTT", website: "https://ott.emory.edu", specialties: ["Infectious Disease", "Neuroscience", "Vaccines"] },
  { slug: "bu", name: "Boston University", city: "Boston, MA", ttoName: "BU Technology Development", website: "https://www.bu.edu/otd", specialties: ["Oncology", "Drug Delivery", "Rare Disease"] },
  { slug: "georgetown", name: "Georgetown University", city: "Washington, DC", ttoName: "Georgetown OTL", website: "https://otl.georgetown.edu", specialties: ["Oncology", "Immunology", "Small Molecules"] },
  { slug: "utexas", name: "University of Texas", city: "Austin, TX", ttoName: "UT Office of Technology Commercialization", website: "https://research.utexas.edu/otc", specialties: ["Oncology", "Gene Therapy", "Bioelectronics"] },
  { slug: "cwru", name: "Case Western Reserve University", city: "Cleveland, OH", ttoName: "CWRU TTO", website: "https://research.case.edu/tto", specialties: ["Orthopedics", "Neuroscience", "Biomaterials"] },
  { slug: "ucolorado", name: "University of Colorado", city: "Aurora, CO", ttoName: "CU Innovations", website: "https://innovations.cu.edu", specialties: ["Oncology", "Respiratory", "Rare Disease"] },
];

const STAGE_COLORS: Record<string, string> = {
  "discovery": "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  "preclinical": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "phase 1": "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  "phase 2": "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  "phase 3": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
};

function formatDate(dt: Date | string | null): string {
  if (!dt) return "";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function InstitutionDetail() {
  const { slug } = useParams<{ slug: string }>();
  const inst = INSTITUTIONS.find((i) => i.slug === slug);

  const { data, isLoading } = useQuery<{ assets: IngestedAsset[]; institution: string }>({
    queryKey: ["/api/institutions", slug, "assets"],
    queryFn: () => fetch(`/api/institutions/${slug}/assets`).then((r) => r.json()),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  if (!inst) {
    return (
      <div className="min-h-full bg-background flex flex-col items-center justify-center py-24 text-center gap-4">
        <Building2 className="w-10 h-10 text-muted-foreground" />
        <h2 className="text-xl font-bold text-foreground">Institution not found</h2>
        <Link href="/institutions">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Institutions
          </Button>
        </Link>
      </div>
    );
  }

  const assets = data?.assets ?? [];
  const activeCount = isLoading ? null : assets.length;
  const isBlocked = BLOCKED_SLUGS.has(slug ?? "");

  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
          <Link href="/institutions">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-xs text-muted-foreground hover:text-foreground -ml-2 mb-4"
              data-testid="button-back-institutions"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              All Institutions
            </Button>
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{inst.name}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">{inst.city} · {inst.ttoName}</p>
              </div>
            </div>
            <a href={inst.website} target="_blank" rel="noopener noreferrer">
              <Button
                variant="outline"
                className="gap-2 border-card-border"
                data-testid="button-view-tto-site"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View TTO Site
              </Button>
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border border-card-border bg-card">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">TTO Office</p>
            <p className="text-sm font-medium text-foreground">{inst.ttoName}</p>
          </div>
          <div className="p-4 rounded-lg border border-card-border bg-card">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Location</p>
            <p className="text-sm font-medium text-foreground">{inst.city}</p>
          </div>
          <div className="p-4 rounded-lg border border-card-border bg-card" data-testid="stat-active-listings">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Active Listings</p>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : activeCount !== null && activeCount > 0 ? (
              <p className="text-2xl font-bold text-primary">{activeCount}</p>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground">—</p>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Specialty Areas</h2>
          <div className="flex flex-wrap gap-2">
            {inst.specialties.map((s) => (
              <Badge
                key={s}
                variant="secondary"
                className="text-sm font-medium bg-primary/10 text-primary border-0 px-3 py-1"
              >
                {s}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Active Listings</h2>
            {activeCount !== null && activeCount > 0 && (
              <Badge variant="secondary" className="text-[11px] bg-primary/10 text-primary border-0">
                {activeCount} listings
              </Badge>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : assets.length === 0 && isBlocked ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <ShieldOff className="w-8 h-8 text-amber-500/60" />
              <p className="text-sm font-medium text-foreground">Access Restricted</p>
              <p className="text-xs text-muted-foreground/70 max-w-sm">
                This institution&apos;s website blocks automated access from cloud hosting providers. Listings cannot be indexed automatically.
              </p>
              <a href={inst.website} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                Visit TTO website directly →
              </a>
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <RefreshCw className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No listings indexed yet</p>
              <p className="text-xs text-muted-foreground/70">Run a scan from the Scout page to pull real listings from this TTO.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {assets.map((asset, i) => (
                <div
                  key={asset.id}
                  className="flex items-center justify-between gap-4 p-4 rounded-lg border border-card-border bg-card hover:border-primary/20 transition-colors"
                  data-testid={`asset-listing-${i}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FlaskConical className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      {asset.sourceUrl ? (
                        <a
                          href={asset.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-foreground hover:text-primary truncate block"
                        >
                          {asset.assetName}
                        </a>
                      ) : (
                        <p className="text-sm font-medium text-foreground truncate">{asset.assetName}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{asset.summary}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {asset.developmentStage && asset.developmentStage !== "unknown" && (
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STAGE_COLORS[asset.developmentStage.toLowerCase()] ?? "bg-muted text-muted-foreground"}`}>
                        {asset.developmentStage}
                      </span>
                    )}
                    {asset.lastSeenAt && (
                      <span className="text-[11px] text-muted-foreground">{formatDate(asset.lastSeenAt)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
