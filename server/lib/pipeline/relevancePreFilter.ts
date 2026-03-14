import type { ScrapedListing } from "../scrapers/types";

const NON_BIOTECH_KEYWORDS = [
  "solar panel", "wind turbine", "concrete", "asphalt", "road surface",
  "building material", "textile", "fabric", "leather", "apparel",
  "furniture", "automotive exhaust", "combustion engine", "diesel",
  "petroleum", "oil drilling", "mining equipment", "excavation",
  "architectural design", "interior decoration", "landscaping",
  "video game", "social media", "cryptocurrency", "blockchain",
  "real estate", "property management", "consumer electronics",
  "smartphone case", "kitchen appliance", "household cleaning",
  "pet food", "cosmetic fragrance", "hair styling",
];

const BIOTECH_KEYWORDS = [
  "antibod", "inhibitor", "receptor", "kinase", "enzyme", "protein",
  "gene", "crispr", "rna", "dna", "mrna", "sirna", "antisense",
  "peptide", "vaccine", "immuno", "oncolog", "cancer", "tumor", "tumour",
  "therapeutic", "pharma", "drug", "compound", "molecule",
  "biomarker", "assay", "diagnostic", "imaging", "cell therapy",
  "stem cell", "regenerat", "tissue", "organ", "implant",
  "nanoparticle", "liposom", "delivery", "formulation",
  "pathogen", "viral", "bacteri", "fungal", "infect",
  "inflammat", "autoimmun", "neurodegenerat", "cardiovascular",
  "metaboli", "diabetes", "obesity", "fibrosis", "renal",
  "ophthalm", "retina", "dermatol", "wound heal",
  "surgical", "prosthe", "catheter", "stent", "medical device",
  "biologic", "biosimil", "monoclonal", "bispecific",
  "protac", "degrader", "agonist", "antagonist", "modulator",
  "clinical trial", "preclinical", "in vivo", "in vitro",
  "patient", "treatment", "therapy", "disease", "disorder",
  "syndrome", "condition", "symptom", "diagnosis",
];

export type PreFilterResult = "pass" | "reject" | "ambiguous";

export function preFilterRelevance(listing: ScrapedListing): PreFilterResult {
  const text = `${listing.title} ${listing.description}`.toLowerCase();

  let biotechHits = 0;
  for (const kw of BIOTECH_KEYWORDS) {
    if (text.includes(kw)) biotechHits++;
  }

  let nonBiotechHits = 0;
  for (const kw of NON_BIOTECH_KEYWORDS) {
    if (text.includes(kw)) nonBiotechHits++;
  }

  if (biotechHits >= 2 && nonBiotechHits === 0) return "pass";
  if (nonBiotechHits >= 2 && biotechHits === 0) return "reject";
  if (biotechHits === 0 && nonBiotechHits === 0) return "ambiguous";
  if (biotechHits > 0 && nonBiotechHits > 0) return "ambiguous";
  if (biotechHits === 1) return "ambiguous";
  return "ambiguous";
}

export function preFilterBatch(listings: ScrapedListing[]): {
  passed: ScrapedListing[];
  rejected: ScrapedListing[];
  ambiguous: ScrapedListing[];
} {
  const passed: ScrapedListing[] = [];
  const rejected: ScrapedListing[] = [];
  const ambiguous: ScrapedListing[] = [];

  for (const listing of listings) {
    const result = preFilterRelevance(listing);
    if (result === "pass") passed.push(listing);
    else if (result === "reject") rejected.push(listing);
    else ambiguous.push(listing);
  }

  return { passed, rejected, ambiguous };
}
