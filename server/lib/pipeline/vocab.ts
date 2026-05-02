// Controlled vocabulary for indication and target normalization.
// Maps free-text AI output to canonical terms so the same disease/target
// is stored consistently regardless of how the AI phrased it.

// ── Indication vocabulary (MeSH-aligned disease names) ───────────────────────
// Each entry: [canonical term, ...aliases that map to it]
const INDICATION_MAP: [string, ...string[]][] = [
  // Oncology — solid tumors
  ["non-small cell lung cancer", "nsclc", "non small cell lung", "lung adenocarcinoma", "lung carcinoma", "squamous cell lung", "lung cancer"],
  ["small cell lung cancer", "sclc", "small cell lung"],
  ["breast cancer", "breast carcinoma", "breast tumor"],
  ["triple-negative breast cancer", "tnbc", "triple negative breast"],
  ["colorectal cancer", "colorectal carcinoma", "colon cancer", "rectal cancer", "colorectal"],
  ["pancreatic cancer", "pancreatic ductal adenocarcinoma", "pdac", "pancreatic carcinoma"],
  ["pancreatic cancer", "exocrine pancreatic cancer"],
  ["prostate cancer", "castration-resistant prostate cancer", "crpc", "prostate carcinoma"],
  ["ovarian cancer", "epithelial ovarian cancer", "ovarian carcinoma"],
  ["glioblastoma", "glioblastoma multiforme", "gbm", "glioma", "high-grade glioma"],
  ["melanoma", "cutaneous melanoma", "metastatic melanoma"],
  ["hepatocellular carcinoma", "hcc", "liver cancer", "hepatic carcinoma"],
  ["renal cell carcinoma", "rcc", "kidney cancer", "clear cell renal"],
  ["bladder cancer", "urothelial carcinoma", "bladder carcinoma"],
  ["gastric cancer", "gastric carcinoma", "stomach cancer", "gastroesophageal cancer"],
  ["head and neck squamous cell carcinoma", "hnscc", "head and neck cancer"],
  ["cervical cancer", "cervical carcinoma"],
  ["endometrial cancer", "uterine cancer", "endometrial carcinoma"],
  ["thyroid cancer", "thyroid carcinoma", "papillary thyroid"],
  ["esophageal cancer", "esophageal carcinoma"],
  // Oncology — hematologic
  ["acute myeloid leukemia", "aml", "acute myelogenous leukemia"],
  ["chronic lymphocytic leukemia", "cll"],
  ["chronic myeloid leukemia", "cml", "chronic myelogenous leukemia"],
  ["acute lymphoblastic leukemia", "all", "acute lymphocytic leukemia"],
  ["multiple myeloma", "myeloma", "plasma cell myeloma"],
  ["diffuse large b-cell lymphoma", "dlbcl", "large b-cell lymphoma"],
  ["follicular lymphoma", "fl"],
  ["mantle cell lymphoma", "mcl"],
  ["hodgkin lymphoma", "hodgkin disease", "hodgkin's lymphoma"],
  ["t-cell lymphoma", "peripheral t-cell lymphoma", "ptcl"],
  ["myelodysplastic syndrome", "mds"],
  // Metabolic
  ["type 2 diabetes mellitus", "type 2 diabetes", "t2dm", "t2d", "diabetes mellitus type 2"],
  ["type 1 diabetes mellitus", "type 1 diabetes", "t1dm", "t1d"],
  ["obesity", "overweight", "adiposity"],
  ["non-alcoholic steatohepatitis", "nash", "metabolic-associated steatohepatitis", "mash"],
  ["non-alcoholic fatty liver disease", "nafld", "fatty liver disease"],
  ["metabolic syndrome", "metabolic disorder"],
  // Neurological / CNS
  ["alzheimer's disease", "alzheimer disease", "ad dementia", "senile dementia"],
  ["parkinson's disease", "parkinson disease", "pd"],
  ["amyotrophic lateral sclerosis", "als", "lou gehrig's disease", "motor neuron disease"],
  ["multiple sclerosis", "ms", "relapsing multiple sclerosis", "rrms"],
  ["huntington's disease", "huntington disease"],
  ["epilepsy", "seizure disorder", "epileptic seizures"],
  ["schizophrenia", "psychosis"],
  ["major depressive disorder", "depression", "major depression", "mdd"],
  ["bipolar disorder", "bipolar disease"],
  ["post-traumatic stress disorder", "ptsd"],
  ["pain", "chronic pain", "neuropathic pain"],
  ["migraine", "migraine headache"],
  ["stroke", "ischemic stroke", "cerebrovascular accident"],
  ["spinal cord injury", "sci"],
  // Cardiovascular
  ["heart failure", "cardiac failure", "congestive heart failure", "chf"],
  ["atrial fibrillation", "afib", "af"],
  ["hypertension", "high blood pressure", "arterial hypertension"],
  ["coronary artery disease", "cad", "ischemic heart disease"],
  ["atherosclerosis", "atherosclerotic cardiovascular disease"],
  ["pulmonary arterial hypertension", "pah"],
  ["myocardial infarction", "heart attack", "mi"],
  // Inflammatory / Autoimmune
  ["rheumatoid arthritis", "ra"],
  ["inflammatory bowel disease", "ibd"],
  ["crohn's disease", "crohn disease"],
  ["ulcerative colitis", "uc"],
  ["psoriasis", "plaque psoriasis"],
  ["psoriatic arthritis", "psa"],
  ["systemic lupus erythematosus", "sle", "lupus"],
  ["ankylosing spondylitis", "axial spondyloarthritis"],
  ["atopic dermatitis", "eczema", "atopic eczema"],
  ["asthma", "bronchial asthma", "allergic asthma"],
  ["chronic obstructive pulmonary disease", "copd", "emphysema"],
  ["idiopathic pulmonary fibrosis", "ipf", "pulmonary fibrosis"],
  ["sjogren's syndrome", "sjogren syndrome"],
  // Infectious disease
  ["hiv infection", "hiv", "hiv/aids", "aids"],
  ["hepatitis b", "hepatitis b virus", "hbv"],
  ["hepatitis c", "hepatitis c virus", "hcv"],
  ["covid-19", "sars-cov-2 infection", "coronavirus disease"],
  ["tuberculosis", "tb", "mycobacterium tuberculosis"],
  ["influenza", "flu", "influenza infection"],
  ["malaria", "plasmodium infection"],
  // Rare / Genetic
  ["cystic fibrosis", "cf"],
  ["duchenne muscular dystrophy", "dmd"],
  ["spinal muscular atrophy", "sma"],
  ["sickle cell disease", "sickle cell anemia", "scd"],
  ["hemophilia", "hemophilia a", "hemophilia b"],
  ["phenylketonuria", "pku"],
  ["fabry disease"],
  ["gaucher disease"],
  // Other
  ["age-related macular degeneration", "amd", "macular degeneration"],
  ["dry eye disease", "dry eye syndrome", "keratoconjunctivitis sicca"],
  ["chronic kidney disease", "ckd", "renal failure", "kidney disease"],
  ["osteoporosis", "bone loss"],
  ["osteoarthritis", "oa", "degenerative joint disease"],
  ["anemia", "iron deficiency anemia"],
  ["sepsis", "septic shock"],
  ["wound healing", "chronic wound", "diabetic wound"],
  ["fibrosis", "organ fibrosis", "tissue fibrosis"],
  ["graft-versus-host disease", "gvhd"],
  ["transplant rejection", "organ rejection"],
  ["inflammatory disease", "inflammation"],
  ["cancer", "solid tumor", "malignancy", "neoplasm", "tumor"],
];

// ── Target vocabulary (HGNC gene symbols / protein names) ────────────────────
const TARGET_MAP: [string, ...string[]][] = [
  ["KRAS", "kras", "k-ras", "ras"],
  ["EGFR", "egfr", "her1", "erbb1", "epidermal growth factor receptor"],
  ["ERBB2", "her2", "erbb2", "her-2", "neu"],
  ["ERBB3", "her3", "erbb3"],
  ["ALK", "alk", "anaplastic lymphoma kinase"],
  ["ROS1", "ros1"],
  ["MET", "met", "c-met", "hgfr"],
  ["BRAF", "braf", "b-raf"],
  ["NRAS", "nras", "n-ras"],
  ["HRAS", "hras", "h-ras"],
  ["PIK3CA", "pi3k", "pik3ca", "phosphoinositide 3-kinase"],
  ["AKT1", "akt", "akt1", "pkb"],
  ["mTOR", "mtor", "mechanistic target of rapamycin"],
  ["MTORC1", "mtorc1"],
  ["CDK4", "cdk4"],
  ["CDK6", "cdk6"],
  ["CDK4/6", "cdk4/6", "cdk 4/6"],
  ["PARP1", "parp", "parp1", "poly adp-ribose polymerase"],
  ["BRCA1", "brca1"],
  ["BRCA2", "brca2"],
  ["PDCD1", "pd-1", "pd1", "pdcd1", "programmed death-1"],
  ["CD274", "pd-l1", "pdl1", "cd274", "programmed death ligand 1"],
  ["CTLA4", "ctla-4", "ctla4"],
  ["TIGIT", "tigit"],
  ["LAG3", "lag-3", "lag3"],
  ["TIM3", "tim-3", "tim3", "havcr2"],
  ["CD19", "cd19"],
  ["CD20", "cd20", "ms4a1"],
  ["CD22", "cd22"],
  ["CD38", "cd38", "darc"],
  ["CD47", "cd47"],
  ["BCMA", "bcma", "tnfrsf17"],
  ["BCL2", "bcl-2", "bcl2"],
  ["BTK", "btk", "bruton tyrosine kinase"],
  ["JAK1", "jak1"],
  ["JAK2", "jak2"],
  ["STAT3", "stat3"],
  ["VEGF", "vegf", "vegfa", "vascular endothelial growth factor"],
  ["VEGFR2", "vegfr2", "kdr", "vegf receptor"],
  ["FGFR", "fgfr", "fibroblast growth factor receptor"],
  ["FGFR1", "fgfr1"],
  ["FGFR2", "fgfr2"],
  ["FGFR3", "fgfr3"],
  ["RET", "ret"],
  ["NTRK", "ntrk", "trk", "tropomyosin receptor kinase"],
  ["TNF", "tnf", "tnf-alpha", "tumor necrosis factor"],
  ["IL6", "il-6", "il6", "interleukin-6"],
  ["IL6R", "il-6r", "il6r", "il6 receptor"],
  ["IL17A", "il-17a", "il17a", "interleukin-17"],
  ["IL4", "il-4", "il4"],
  ["IL13", "il-13", "il13"],
  ["IL1B", "il-1b", "il1b", "interleukin-1 beta"],
  ["IL2", "il-2", "il2"],
  ["TGFB1", "tgf-beta", "tgfb", "tgf-b", "transforming growth factor beta"],
  ["PCSK9", "pcsk9"],
  ["GLP1R", "glp-1", "glp1r", "glp-1r", "glucagon-like peptide-1"],
  ["GIP", "gip", "gastric inhibitory polypeptide"],
  ["GCGR", "glucagon receptor", "gcgr"],
  ["APP", "amyloid precursor protein", "app", "amyloid beta", "abeta", "a-beta"],
  ["MAPT", "tau", "mapt", "microtubule-associated protein tau"],
  ["SNCA", "alpha-synuclein", "snca", "a-synuclein"],
  ["PSEN1", "presenilin-1", "psen1"],
  ["HTT", "huntingtin", "htt"],
  ["SMN1", "smn1", "survival motor neuron"],
  ["TP53", "p53", "tp53"],
  ["MDM2", "mdm2"],
  ["RB1", "rb1", "retinoblastoma"],
  ["MYC", "myc", "c-myc"],
  ["TERT", "telomerase", "tert", "hTERT"],
  ["DNMT", "dnmt", "dna methyltransferase"],
  ["HDAC", "hdac", "histone deacetylase"],
  ["EZH2", "ezh2"],
  ["BRD4", "brd4", "bromodomain"],
  ["WNT", "wnt", "wnt pathway"],
  ["NOTCH1", "notch", "notch1"],
  ["SHH", "sonic hedgehog", "shh", "hedgehog"],
  ["CXCR4", "cxcr4", "cxc receptor"],
  ["CCR5", "ccr5"],
  ["ANGPTL3", "angptl3"],
  ["FXR", "fxr", "farnesoid x receptor"],
  ["PCSK9", "pcsk9"],
  ["ROCK", "rock", "rho kinase"],
  ["CFTR", "cftr", "cystic fibrosis transmembrane"],
  ["HIF1A", "hif-1", "hif1a", "hypoxia inducible factor"],
  ["IDH1", "idh1"],
  ["IDH2", "idh2"],
  ["FLT3", "flt3"],
  ["NPM1", "npm1"],
  ["DNMT3A", "dnmt3a"],
  ["KMT2A", "mll", "kmt2a"],
  ["ARID1A", "arid1a"],
  ["PTEN", "pten"],
  ["NF1", "nf1", "neurofibromin"],
  ["VHL", "vhl"],
  ["POLE", "pole"],
  ["TMB", "tumor mutational burden", "tmb"],
  ["microsatellite instability", "msi", "msi-h"],
];

// ── Build lookup maps at module load time ─────────────────────────────────────

const INDICATION_LOOKUP = new Map<string, string>();
for (const [canonical, ...aliases] of INDICATION_MAP) {
  const key = canonical.toLowerCase().trim();
  INDICATION_LOOKUP.set(key, canonical);
  for (const alias of aliases) {
    INDICATION_LOOKUP.set(alias.toLowerCase().trim(), canonical);
  }
}

const TARGET_LOOKUP = new Map<string, string>();
for (const [canonical, ...aliases] of TARGET_MAP) {
  const key = canonical.toLowerCase().trim();
  TARGET_LOOKUP.set(key, canonical);
  for (const alias of aliases) {
    TARGET_LOOKUP.set(alias.toLowerCase().trim(), canonical);
  }
}

/**
 * Normalize a free-text AI value to a canonical controlled-vocabulary term.
 * Exact match only (case-insensitive, whitespace-normalized). Returns "unknown"
 * for any value not present in the vocabulary — no substring guessing, no
 * free-text passthrough. This guarantees consistent, enumerable storage.
 *
 * @param value  - raw string from AI (e.g. "NSCLC", "non small cell lung cancer")
 * @param vocab  - "indication" or "target"
 * @returns canonical term from controlled vocabulary, or "unknown" if no exact match
 */
export function sanitizeToVocab(value: string | null | undefined, vocab: "indication" | "target"): string {
  if (!value || value.toLowerCase().trim() === "unknown" || value.trim() === "") return "unknown";
  const lookup = vocab === "indication" ? INDICATION_LOOKUP : TARGET_LOOKUP;
  const normalized = value.toLowerCase().trim();

  // Exact match only — deterministic, no substring ambiguity
  const hit = lookup.get(normalized);
  return hit ?? "unknown";
}
