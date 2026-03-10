import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Building2, Search, ShieldOff } from "lucide-react";

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
  { slug: "ucberkeley", name: "UC Berkeley", city: "Berkeley, CA", ttoName: "UC Berkeley Intellectual Property Office", website: "https://ipira.berkeley.edu", specialties: ["CRISPR", "Synthetic Biology", "Drug Discovery"] },
  { slug: "uwashington", name: "University of Washington", city: "Seattle, WA", ttoName: "UW CoMotion", website: "https://comotion.uw.edu", specialties: ["Neuroscience", "Oncology", "Structural Biology"] },
  { slug: "wustl", name: "Washington University in St. Louis", city: "St. Louis, MO", ttoName: "WashU OTM", website: "https://otm.wustl.edu", specialties: ["Neuroscience", "Metabolic Disease", "Immunology"] },
  { slug: "umich", name: "University of Michigan", city: "Ann Arbor, MI", ttoName: "U-M Tech Transfer", website: "https://techtransfer.umich.edu", specialties: ["Cardiovascular", "Gene Therapy", "Oncology"] },
  { slug: "mayo", name: "Mayo Clinic", city: "Rochester, MN", ttoName: "Mayo Clinic Ventures", website: "https://ventures.mayoclinic.org", specialties: ["Diagnostics", "Oncology", "Rare Disease"] },
  { slug: "scripps", name: "Scripps Research", city: "La Jolla, CA", ttoName: "Scripps Research TTVD", website: "https://www.scripps.edu/science-and-medicine/ttvd", specialties: ["Drug Discovery", "Antibody Engineering", "Oncology"] },
  { slug: "salk", name: "Salk Institute", city: "La Jolla, CA", ttoName: "Salk TTO", website: "https://www.salk.edu/partnerships-commercialization", specialties: ["Gene Regulation", "Oncology", "Aging"] },
  { slug: "mdanderson", name: "MD Anderson Cancer Center", city: "Houston, TX", ttoName: "MD Anderson TTO", website: "https://www.mdanderson.org/research/departments-labs-institutes/programs-centers/technology-commercialization.html", specialties: ["Oncology", "Immunotherapy", "CAR-T"] },
  { slug: "upitt", name: "University of Pittsburgh", city: "Pittsburgh, PA", ttoName: "Pitt Innovation Institute", website: "https://www.innovation.pitt.edu", specialties: ["Regenerative Medicine", "Oncology", "Organ Transplant"] },
  { slug: "uchicago", name: "University of Chicago", city: "Chicago, IL", ttoName: "UChicago Polsky Center", website: "https://polsky.uchicago.edu/programs-and-services/george-shultz-innovation-fund", specialties: ["Immunology", "Drug Delivery", "Oncology"] },
  { slug: "yale", name: "Yale University", city: "New Haven, CT", ttoName: "Yale OCS", website: "https://ocr.yale.edu", specialties: ["Oncology", "Immunotherapy", "Structural Biology"] },
  { slug: "vanderbilt", name: "Vanderbilt University", city: "Nashville, TN", ttoName: "Vanderbilt Center for Technology Transfer", website: "https://ctt.vanderbilt.edu", specialties: ["Small Molecules", "Metabolic Disease", "Infectious Disease"] },
  { slug: "emory", name: "Emory University", city: "Atlanta, GA", ttoName: "Emory OTT", website: "https://ott.emory.edu", specialties: ["Infectious Disease", "Neuroscience", "Vaccines"] },
  { slug: "bu", name: "Boston University", city: "Boston, MA", ttoName: "BU Technology Development", website: "https://www.bu.edu/otd", specialties: ["Oncology", "Drug Delivery", "Rare Disease"] },
  { slug: "georgetown", name: "Georgetown University", city: "Washington, DC", ttoName: "Georgetown OTL", website: "https://otl.georgetown.edu", specialties: ["Oncology", "Immunology", "Small Molecules"] },
  { slug: "utexas", name: "University of Texas", city: "Austin, TX", ttoName: "UT Office of Technology Commercialization", website: "https://research.utexas.edu/otc", specialties: ["Oncology", "Gene Therapy", "Bioelectronics"] },
  { slug: "cwru", name: "Case Western Reserve University", city: "Cleveland, OH", ttoName: "CWRU TTO", website: "https://research.case.edu/tto", specialties: ["Orthopedics", "Neuroscience", "Biomaterials"] },
  { slug: "ucolorado", name: "University of Colorado", city: "Aurora, CO", ttoName: "CU Innovations", website: "https://innovations.cu.edu", specialties: ["Oncology", "Respiratory", "Rare Disease"] },
];

export { INSTITUTIONS };

const BLOCKED_SLUGS = new Set([
  "ucsf", "duke", "umich", "mayo", "ucolorado", "columbia",
]);

const SPECIALTY_COLORS: Record<string, string> = {
  "Oncology": "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  "Neuroscience": "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  "Gene Therapy": "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  "Immunology": "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  "Immunotherapy": "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  "CAR-T": "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20",
  "mRNA": "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  "CRISPR": "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  "Drug Delivery": "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  "Rare Disease": "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
};

function getSpecialtyClass(s: string) {
  return SPECIALTY_COLORS[s] ?? "bg-muted/40 text-muted-foreground border-border";
}

function InstitutionCard({
  inst,
  count,
  countsLoading,
}: {
  inst: Institution;
  count: number | null;
  countsLoading: boolean;
}) {
  const isBlocked = BLOCKED_SLUGS.has(inst.slug);
  const showRestricted = !countsLoading && isBlocked && !count;

  return (
    <div
      className="flex flex-col gap-3 p-5 rounded-lg border border-card-border bg-card hover:border-primary/30 transition-colors duration-200"
      data-testid={`institution-card-${inst.slug}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Building2 className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground leading-tight">{inst.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{inst.city}</p>
        </div>
        {showRestricted && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 cursor-help shrink-0">
                <ShieldOff className="w-2.5 h-2.5" />
                Restricted
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              This institution&apos;s website blocks automated access from cloud hosting providers
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{inst.ttoName}</p>

      <div className="flex flex-wrap gap-1.5">
        {inst.specialties.map((s) => (
          <Badge
            key={s}
            variant="outline"
            className={`text-[10px] font-medium px-1.5 py-0.5 border ${getSpecialtyClass(s)}`}
          >
            {s}
          </Badge>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-card-border">
        <span className="text-xs text-muted-foreground" data-testid={`text-listings-${inst.slug}`}>
          {countsLoading ? (
            <Skeleton className="h-3 w-16 inline-block" />
          ) : count !== null && count > 0 ? (
            <><span className="font-semibold text-foreground">{count}</span> active listings</>
          ) : showRestricted ? (
            <span className="italic text-muted-foreground/60">Access restricted</span>
          ) : (
            <span className="italic text-muted-foreground/60">—</span>
          )}
        </span>
        <Link href={`/institutions/${inst.slug}`}>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5 border-card-border"
            data-testid={`button-view-institution-${inst.slug}`}
          >
            View Profile
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function Institutions() {
  const [search, setSearch] = useState("");

  const { data: countsData, isLoading: countsLoading } = useQuery<Record<string, number>>({
    queryKey: ["/api/institutions/counts"],
    staleTime: 5 * 60 * 1000,
  });

  const noneScanned = !countsLoading && (!countsData || Object.keys(countsData).length === 0);

  const filtered = INSTITUTIONS.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground">Institutions</h1>
                <Badge
                  variant="secondary"
                  className="text-[11px] font-semibold bg-primary/10 text-primary border-0"
                  data-testid="badge-tto-count"
                >
                  {INSTITUTIONS.length} TTOs indexed
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                University tech transfer offices tracked and indexed by EdenRadar.
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search institutions..."
                className="pl-8 h-9 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-institutions"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
        {noneScanned && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400 text-sm">
            <span className="font-medium">Listing counts are not yet available.</span>
            <span className="text-muted-foreground">Run a scan from the Scout page to populate real counts.</span>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            No institutions match &ldquo;{search}&rdquo;
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((inst) => (
              <InstitutionCard
                key={inst.slug}
                inst={inst}
                count={countsData?.[inst.name] ?? null}
                countsLoading={countsLoading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
