/**
 * Biology Rule-Fill — assigns a canonical "biology" value to each asset.
 *
 * "Biology" describes the pathological biological process the asset addresses —
 * the mechanism layer between indication (what disease) and target (which molecule).
 * It is universally applicable: every asset has a biology even when a specific
 * molecular target is absent (diagnostics, platforms, devices, research tools).
 *
 * Canonical taxonomy (32 values):
 *   Oncology (9):
 *     aberrant kinase signaling | cell cycle dysregulation | epigenetic dysregulation |
 *     dna damage response deficiency | immune evasion | apoptosis resistance |
 *     oncogenic transcription | angiogenesis | tumor microenvironment
 *   Neurological (6):
 *     protein aggregation | neuroinflammation | synaptic dysfunction |
 *     mitochondrial dysfunction | myelin disruption | neuronal excitotoxicity
 *   Immunological (5):
 *     autoimmune dysregulation | cytokine dysregulation | complement dysregulation |
 *     allergic dysregulation | immune deficiency
 *   Metabolic / Endocrine (4):
 *     insulin resistance | lipid metabolism dysfunction | enzyme deficiency |
 *     hormonal dysregulation
 *   Genetic / Structural (4):
 *     gene expression deficiency | ion channel dysfunction |
 *     structural protein defect | rna splicing defect
 *   Infectious (2):
 *     pathogen replication | antimicrobial resistance
 *   General (2):
 *     fibrosis | ischemia and oxidative stress
 */

import { computeCompletenessScore } from "./contentHash";
import OpenAI from "openai";

export const CANONICAL_BIOLOGY: string[] = [
  // Oncology
  "aberrant kinase signaling",
  "cell cycle dysregulation",
  "epigenetic dysregulation",
  "dna damage response deficiency",
  "immune evasion",
  "apoptosis resistance",
  "oncogenic transcription",
  "angiogenesis",
  "tumor microenvironment",
  // Neurological
  "protein aggregation",
  "neuroinflammation",
  "synaptic dysfunction",
  "mitochondrial dysfunction",
  "myelin disruption",
  "neuronal excitotoxicity",
  // Immunological
  "autoimmune dysregulation",
  "cytokine dysregulation",
  "complement dysregulation",
  "allergic dysregulation",
  "immune deficiency",
  // Metabolic / Endocrine
  "insulin resistance",
  "lipid metabolism dysfunction",
  "enzyme deficiency",
  "hormonal dysregulation",
  // Genetic / Structural
  "gene expression deficiency",
  "ion channel dysfunction",
  "structural protein defect",
  "rna splicing defect",
  // Infectious
  "pathogen replication",
  "antimicrobial resistance",
  // General
  "fibrosis",
  "ischemia and oxidative stress",
];

export type BiologyAsset = {
  id: number;
  asset_name: string;
  summary: string | null;
  abstract: string | null;
  indication: string | null;
  modality: string | null;
  target: string | null;
  mechanism_of_action: string | null;
  source_type: string | null;
  ip_type: string | null;
  patent_status: string | null;
  development_stage: string | null;
};

export type BiologyFillSummary = {
  total: number;
  targetDerived: number;
  indicationDerived: number;
  ruleMatched: number;
  gptSent: number;
  gptResolved: number;
  totalUpdated: number;
  unresolved: number;
};

export type BiologyFillProgress = {
  processed: number;
  total: number;
  phase: string;
  targetDerived: number;
  ruleMatched: number;
  gptSent: number;
  gptResolved: number;
  written: number;
};

export type BiologyFillOptions = {
  dryRun?: boolean;
  skipGpt?: boolean;
  gptBatchSize?: number;
  cap?: number;
  signal?: AbortSignal;
  onProgress?: (p: BiologyFillProgress) => void;
};

// ── Tier 0: Derive from known target (zero cost, highest confidence) ──────────
// When a specific molecular target is already set, biology is deterministically derivable.
const TARGET_TO_BIOLOGY: Array<{ pattern: RegExp; biology: string }> = [
  // Kinase / RTK targets → aberrant kinase signaling
  { pattern: /\b(EGFR|ERBB[234]|HER[234]|KRAS|NRAS|HRAS|BRAF|RAF1|MEK[12]|ERK[12]|ALK|RET|ROS1|NTRK[123]|MET|FGFR[1234]|KIT|FLT3|PDGFRα|PDGFRβ|AXL|MER|SRC|ABL1?|BCR.ABL|PI3K|AKT[123]|mTOR|MTORC[12]|VEGFR[123]|IGF.1R|INSR)\b/i, biology: "aberrant kinase signaling" },
  // Immune checkpoint targets → immune evasion
  { pattern: /\b(PD.?1|PD.?L[12]|PDCD1|CD274|CTLA.?4|LAG.?3|TIM.?3|TIGIT|4.?1BB|CD137|OX40|CD134|VISTA|BTLA|SIGLEC.?[0-9])\b/i, biology: "immune evasion" },
  // Apoptosis regulators → apoptosis resistance
  { pattern: /\b(BCL.?2|BCL.?XL|BCL.?W|MCL1|MDM2|MDMX|MDM4|XIAP|survivin|BIRC5)\b/i, biology: "apoptosis resistance" },
  // Epigenetic targets → epigenetic dysregulation
  { pattern: /\b(HDAC[1-9]?|EZH2|EZH1|BRD4|BRD2|BET|DNMT[13]|PRMT[1-9]|KDM[1-9]|DOT1L|LSD1|KMT2[ABCDE]|SETD2|ARID1[AB])\b/i, biology: "epigenetic dysregulation" },
  // Cell cycle targets → cell cycle dysregulation
  { pattern: /\b(CDK[1-9][0-9]?|cyclin[- ][A-Z][0-9]?|RB1|TP53|p53|CDKN[12][AB]|p16|p21|p27|WEE1|CHK[12]|CDC25)\b/i, biology: "cell cycle dysregulation" },
  // DNA damage response targets → dna damage response deficiency
  { pattern: /\b(PARP[1-9]?|ATM|ATR|BRCA[12]|PALB2|RAD51|CHEK[12]|MLH1|MSH[26]|MSH3|FANCONI|FANC[A-Z]|DNA.PK|DNAPK|XRCC[1-9])\b/i, biology: "dna damage response deficiency" },
  // MYC/transcription factors → oncogenic transcription
  { pattern: /\b(MYC|c.?MYC|N.?MYC|L.?MYC|MYCN|RUNX[123]|ETS[12]|FLI1|ERG|NF.?κB|NFKB[12]|EWS|FUS.ERG|PAX[3-8]|FOXO[1-4]|TCF[1-9]|STAT[356])\b/i, biology: "oncogenic transcription" },
  // VEGF / angiogenesis targets → angiogenesis
  { pattern: /\b(VEGF[ABC]?|VEGFR[123]|PDGF[ABCD]?|FGF[1-9]?|angiopoietin|TIE[12]|HIF.?1α|HIF.?2α|endostatin|thrombospondin)\b/i, biology: "angiogenesis" },
  // Neurodegeneration aggregation targets → protein aggregation
  { pattern: /\b(tau|MAPT|amyloid|APP|Aβ|beta.?amyloid|alpha.?synuclein|SNCA|TDP.?43|TARDBP|FUS|huntingtin|HTT|SOD1|prion|PRNP|polyglutamine|polyQ)\b/i, biology: "protein aggregation" },
  // Neuroinflammation targets
  { pattern: /\b(TREM2|NLRP3|RIPK[13]|STING|cGAS|TLR[1-9]|MyD88|IRAK[1-4]|microglial|astrogliosis)\b/i, biology: "neuroinflammation" },
  // Synaptic / neurotransmitter targets → synaptic dysfunction
  { pattern: /\b(NMDA|AMPA|GABA[AB]?|dopamine.?receptor|D[12345]R|serotonin|5.?HT[1-7][ABCDE]?|acetylcholine|nAChR|mAChR|CHRN[AB]|COMT|MAO[AB]|vesicular|VMAT|DAT|SERT|NET|synapsin|PSD.?95)\b/i, biology: "synaptic dysfunction" },
  // Cytokine / JAK/STAT targets → cytokine dysregulation
  { pattern: /\b(TNF.?α?|IL.?[0-9]+[αβγ]?|IFN.?[αβγ]|JAK[1-3]|TYK2|STAT[1-6]|IL[0-9]+R|gp130|OSM|LIF|TSLP|GM.?CSF|M.?CSF|G.?CSF)\b/i, biology: "cytokine dysregulation" },
  // Complement targets → complement dysregulation
  { pattern: /\b(C3|C5|C1q|C4[AB]?|factor[- ][BDH]|properdin|MBL|MASP[12]|CD55|CD59|CFH|complement)\b/i, biology: "complement dysregulation" },
  // IgE / mast cell targets → allergic dysregulation
  { pattern: /\b(IgE|FcεRI|FcεRII|CD23|IL.?4|IL.?13|IL.?5|eotaxin|CCR3|SIGLEC.?8|mast.?cell|basophil)\b/i, biology: "allergic dysregulation" },
  // Insulin / glucose targets → insulin resistance
  { pattern: /\b(GLP.?1R?|GLP.?1|glucagon|insulin|INSR|IRS[12]|GLUT[1-9]|SGLT[12]|DPP.?4|PCSK9|AMPK|FGF21|GIP[R]?|amylin)\b/i, biology: "insulin resistance" },
  // Lipid metabolism targets → lipid metabolism dysfunction
  { pattern: /\b(PCSK9|HMGCR|CETP|LDL.?R|LDLR|ANGPTL[34]|APOB|APOC3|APOE|ABCA1|NPC1L1|ACC[12]|FAS[NI]|ACLY|SCAP|SREBP)\b/i, biology: "lipid metabolism dysfunction" },
  // Lysosomal / metabolic enzymes → enzyme deficiency
  { pattern: /\b(GBA[12]?|glucocerebrosidase|GAA|alpha.?galactosidase|iduronate|IDUA|IDS|HEXA|HEXB|ASAH1|NPC[12]|TPP[12]|CLN[0-9]|phenylalanine|PAH|OTC|ASS1|fumarylacetoacetate)\b/i, biology: "enzyme deficiency" },
  // Hormone receptor targets → hormonal dysregulation
  { pattern: /\b(androgen.?receptor|AR|ESR[12]|estrogen.?receptor|PR|progesterone.?receptor|FSHR|LHR|TSHR|GnRH|thyroid|T3|T4|cortisol|CRH|ACTH|GH|IGF)\b/i, biology: "hormonal dysregulation" },
  // CFTR / ion channel targets → ion channel dysfunction
  { pattern: /\b(CFTR|SCN[1-9][AB]?|KCNQ[1-5]|KCNH2|HERG|Nav[0-9]|Kv[0-9]|HCN[1-4]|TRPV[1-8]|TRPA[12]|TRPM[1-8]|P2X[1-7]|ENaC|ClC.?[1-9]|PIEZO[12])\b/i, biology: "ion channel dysfunction" },
  // Structural protein targets → structural protein defect
  { pattern: /\b(dystrophin|DMD|utrophin|collagen.?type|COL[0-9]+[A-Z][0-9]?|fibrillin|FBN[12]|spectrin|ankyrin|laminin|LAMA[0-9]|titin|TTN)\b/i, biology: "structural protein defect" },
  // Splicing factor targets → rna splicing defect
  { pattern: /\b(SMN[12]|survival.motor.neuron|U1|U2AF|SF3[AB][123]|SRSF[0-9]|hnRNP|SFSWAP|NOVA[12])\b/i, biology: "rna splicing defect" },
  // Viral / bacterial targets → pathogen replication
  { pattern: /\b(spike|NSP[0-9]+|helicase|polymerase|protease|integrase|reverse.transcriptase|capsid|envelope|neuraminidase|hemagglutinin|gp[0-9]+|HIV|HCV|HBV|RSV|CMV|EBV|HSV|SARS.CoV|MERS|influenza|bacterial.wall|peptidoglycan|LPS)\b/i, biology: "pathogen replication" },
  // Fibrosis targets → fibrosis
  { pattern: /\b(TGF.?β|TGF.?beta|TGFBR[123]|CTGF|CCN2|LOX|LOXL[1-4]|fibronectin|myofibroblast|galectin.?[13]|lysyl.oxidase|BMP[0-9]|SMAD[0-9])\b/i, biology: "fibrosis" },
];

// ── Tier 1: High-confidence text patterns ─────────────────────────────────────
const TIER1: Array<{ pattern: RegExp; biology: string }> = [
  // Oncology — kinase signaling
  { pattern: /kinase\s+inhibitor|tyrosine\s+kinase|EGFR\s+mutation|KRAS\s+mutation|oncogenic\s+(?:RAS|RAF|MEK|ERK|MAPK|PI3K|AKT|mTOR)|RTK\s+(?:signaling|pathway)|receptor\s+tyrosine\s+kinase|MAPK\s+pathway|PI3K.AKT.mTOR\s+(?:pathway|signaling)|BCR.ABL\s+(?:fusion|kinase)/i, biology: "aberrant kinase signaling" },
  // Oncology — immune evasion
  { pattern: /PD.?L1\s+(?:expression|overexpression|blockade|inhibitor)|PD.?1\s+(?:checkpoint|blockade|inhibitor|pathway)|immune\s+checkpoint\s+(?:inhibitor|blockade|therapy)|checkpoint\s+(?:inhibitor|immunotherapy)|tumor\s+immune\s+evasion|immunosuppressive\s+tumor|CTLA.?4\s+(?:blockade|inhibitor)/i, biology: "immune evasion" },
  // Oncology — cell cycle
  { pattern: /CDK4.?\/?\s*6\s+inhibitor|cell\s+cycle\s+(?:arrest|dysregulation|checkpoint|progression)|G1.S\s+(?:checkpoint|transition|arrest)|p53\s+(?:mutation|loss|pathway|tumor\s+suppressor)|Rb\s+(?:pathway|loss|phosphorylation)|cyclin\s+(?:overexpression|dysregulation)/i, biology: "cell cycle dysregulation" },
  // Oncology — DNA damage
  { pattern: /PARP\s+inhibitor|homologous\s+recombination\s+(?:deficiency|repair|defect)|mismatch\s+repair\s+(?:deficiency|defect)|microsatellite\s+(?:instability|unstable|high)|BRCA[12]\s+(?:mutation|deficiency|pathway)|DNA\s+(?:damage\s+response|repair\s+deficiency|double.strand\s+break)|replication\s+stress\s+(?:pathway|response)/i, biology: "dna damage response deficiency" },
  // Oncology — epigenetic
  { pattern: /HDAC\s+inhibitor|histone\s+(?:deacetylase|methylation|acetylation|modification)\s+(?:inhibitor|dysregulation)|EZH2\s+(?:inhibitor|mutation|overexpression)|BET\s+(?:bromodomain|inhibitor)|epigenetic\s+(?:dysregulation|modification|reprogramming|silencing)|DNA\s+methylation\s+(?:inhibitor|dysregulation|aberrant)/i, biology: "epigenetic dysregulation" },
  // Oncology — apoptosis
  { pattern: /BCL.?2\s+(?:inhibitor|overexpression|family)|apoptosis\s+(?:resistance|evasion|dysregulation)|anti.apoptotic|MDM2\s+(?:inhibitor|overexpression|p53\s+pathway)|p53.MDM2|caspase\s+(?:resistance|activation|pathway\s+defect)/i, biology: "apoptosis resistance" },
  // Oncology — transcription
  { pattern: /MYC\s+(?:amplification|overexpression|oncogene|target|inhibitor)|c.Myc|transcription\s+factor\s+(?:fusion|dysregulation|oncogenic)|NF.?κB\s+(?:pathway|activation|dysregulation)|oncogenic\s+transcription|EWS.FLI|EWS.ERG|RUNX\s+(?:fusion|amplification)/i, biology: "oncogenic transcription" },
  // Oncology — angiogenesis
  { pattern: /VEGF\s+(?:inhibitor|pathway|signaling|overexpression|driven)|tumor\s+angiogenesis|anti.angiogenic|neovascularization|HIF.?[12].?α\s+(?:inhibitor|pathway|stabilization)|tumor\s+vasculature|angiogenic\s+(?:switch|signaling|pathway)/i, biology: "angiogenesis" },
  // Oncology — tumor microenvironment
  { pattern: /tumor\s+microenvironment|immunosuppressive\s+(?:TME|stroma|niche)|tumor.associated\s+macrophage|myeloid.derived\s+suppressor|regulatory\s+T.cell\s+(?:depletion|exclusion)|stromal\s+(?:reprogramming|targeting)|cancer.associated\s+fibroblast|TME\s+(?:remodeling|immunosuppression)/i, biology: "tumor microenvironment" },
  // Neurological — protein aggregation
  { pattern: /protein\s+aggregation|amyloid\s+(?:plaque|beta|precursor|clearance|fibril)|tau\s+(?:phosphorylation|aggregation|tangle|pathology|propagation)|alpha.?synuclein\s+(?:aggregation|accumulation|pathology)|Lewy\s+(?:body|pathology)|TDP.?43\s+(?:aggregation|pathology)|prion.?(?:like|disease|protein)|huntingtin\s+aggregation|polyglutamine\s+(?:expansion|aggregation)/i, biology: "protein aggregation" },
  // Neurological — neuroinflammation
  { pattern: /neuroinflammation|microglial\s+(?:activation|polarization|dysfunction)|astrogliosis|neuroimmune|NLRP3\s+inflammasome|neurological\s+inflammation|CNS\s+inflammation|brain\s+inflammation|TREM2\s+(?:pathway|activation)|complement.?mediated\s+neurodegeneration/i, biology: "neuroinflammation" },
  // Neurological — synaptic
  { pattern: /synaptic\s+(?:dysfunction|transmission|plasticity|loss|failure)|neurotransmitter\s+(?:imbalance|dysregulation|deficiency)|glutamate\s+(?:receptor|signaling|excitotoxicity|NMDA)|dopamine\s+(?:pathway|deficit|signaling|dysregulation)|serotonin\s+(?:receptor|signaling|imbalance)|GABA\s+(?:receptor|signaling|deficiency)|acetylcholine\s+(?:pathway|deficit|esterase)/i, biology: "synaptic dysfunction" },
  // Neurological — mitochondrial
  { pattern: /mitochondrial\s+(?:dysfunction|disease|complex\s+[I-V]|ETC|respiratory|membrane|biogenesis|fission|fusion)|electron\s+transport\s+chain|ATP\s+(?:depletion|synthesis\s+defect|production\s+failure)|mitochondrial\s+(?:DNA|genome|mutation)|reactive\s+oxygen\s+species.*mitochondr|oxidative\s+phosphorylation\s+(?:defect|impairment)/i, biology: "mitochondrial dysfunction" },
  // Neurological — myelin
  { pattern: /demyelination|myelin\s+(?:disruption|loss|sheath|basic\s+protein|repair|formation)|oligodendrocyte\s+(?:dysfunction|loss|damage)|Schwann\s+cell\s+(?:pathology|dysfunction)|remyelination|multiple\s+sclerosis\s+(?:biology|lesion|pathology|autoimmune)|peripheral\s+neuropathy.*myelin/i, biology: "myelin disruption" },
  // Neurological — excitotoxicity
  { pattern: /excitotoxicity|glutamate\s+(?:excitotoxicity|overactivation|excess)|NMDA\s+receptor\s+(?:overactivation|excitotoxicity|hyperactivation)|calcium\s+(?:overload|excitotoxicity|dysregulation.*neuron)|neuronal\s+(?:death.*glutamate|excitotoxic)|status\s+epilepticus\s+(?:excitotoxicity)/i, biology: "neuronal excitotoxicity" },
  // Immunological — autoimmune
  { pattern: /autoimmune\s+(?:disease|disorder|dysregulation|inflammation|pathology)|autoreactive\s+(?:T.cell|B.cell|lymphocyte)|self.antigen\s+(?:recognition|presentation)|loss\s+of\s+(?:self.tolerance|immune\s+tolerance)|autoantibody|rheumatoid\s+arthritis\s+(?:biology|pathogenesis)|lupus\s+(?:pathogenesis|biology)|Sjogren|systemic\s+autoimmune/i, biology: "autoimmune dysregulation" },
  // Immunological — cytokine
  { pattern: /cytokine\s+(?:storm|dysregulation|overproduction|release\s+syndrome)|pro.inflammatory\s+cytokine|TNF.?(?:alpha|α)\s+(?:pathway|inhibitor|overexpression)|IL.6\s+(?:signaling|pathway|overexpression|receptor)|JAK.STAT\s+(?:pathway|signaling|dysregulation)|interleukin\s+(?:signaling|dysregulation|overproduction)|cytokine.mediated\s+inflammation/i, biology: "cytokine dysregulation" },
  // Immunological — complement
  { pattern: /complement\s+(?:system|pathway|dysregulation|overactivation|deficiency|cascade)|paroxysmal\s+nocturnal\s+hemoglobinuria|C3\s+(?:glomerulopathy|deposition|dysregulation)|membrane\s+attack\s+complex|complement.mediated\s+(?:lysis|damage|pathology)/i, biology: "complement dysregulation" },
  // Immunological — allergic
  { pattern: /IgE.mediated|mast\s+cell\s+(?:activation|degranulation|dysregulation)|atopic\s+(?:disease|inflammation|march)|Type\s+I\s+hypersensitivity|allergic\s+(?:inflammation|response|airway|sensitization)|basophil\s+(?:activation|degranulation)|eosinophil.?(?:ic\s+inflammation|driven)|anaphylaxis\s+(?:mechanism|pathway)/i, biology: "allergic dysregulation" },
  // Immunological — immune deficiency
  { pattern: /primary\s+immunodeficiency|combined\s+immunodeficiency|T.cell\s+(?:deficiency|aplasia|immunodeficiency)|B.cell\s+(?:deficiency|agammaglobulinemia)|SCID|agammaglobulinemia|hypogammaglobulinemia|X.linked\s+(?:immunodeficiency|agammaglobulinemia)|inherited\s+immune\s+disorder/i, biology: "immune deficiency" },
  // Metabolic — insulin resistance
  { pattern: /insulin\s+(?:resistance|signaling|pathway|secretion\s+defect|insensitivity)|type\s+[12]\s+diabetes|beta.cell\s+(?:dysfunction|failure|destruction)|glucagon.like\s+peptide|GLP.?1\s+(?:receptor|agonist|signaling)|SGLT.?2\s+inhibitor|blood\s+glucose\s+(?:dysregulation|control)|pancreatic\s+beta.cell|metabolic\s+syndrome.*insulin/i, biology: "insulin resistance" },
  // Metabolic — lipid
  { pattern: /lipid\s+(?:metabolism|accumulation|dysregulation|disorder)|cholesterol\s+(?:dysregulation|overproduction|pathway)|non.alcoholic\s+(?:fatty\s+liver|steatohepatitis|NAFLD|NASH)|triglyceride\s+(?:accumulation|dysregulation)|fatty\s+acid\s+(?:oxidation\s+defect|synthesis\s+dysregulation)|atherosclerosis\s+(?:biology|pathogenesis|lipid)|PCSK9\s+(?:inhibitor|pathway)/i, biology: "lipid metabolism dysfunction" },
  // Metabolic — enzyme deficiency
  { pattern: /lysosomal\s+storage\s+(?:disease|disorder)|enzyme\s+(?:replacement\s+therapy|deficiency|supplementation)|lysosomal\s+enzyme\s+(?:deficiency|dysfunction)|Gaucher|Fabry|Pompe|Hunter|Hurler|sphingolipidosis|glycogen\s+storage|urea\s+cycle\s+(?:disorder|defect)|metabolic\s+enzyme\s+(?:deficiency|dysfunction)/i, biology: "enzyme deficiency" },
  // Metabolic — hormonal
  { pattern: /androgen\s+receptor\s+(?:signaling|pathway|dysregulation)|castration.resistant\s+prostate|hormone.sensitive|estrogen\s+receptor\s+(?:positive|pathway|signaling)|HER2.positive\s+breast|thyroid\s+(?:hormone|dysfunction|disorder)|hypothyroidism|hyperthyroidism|adrenal\s+insufficiency|Cushing|hormonal\s+(?:dysregulation|imbalance|pathway)/i, biology: "hormonal dysregulation" },
  // Genetic — gene expression deficiency
  { pattern: /loss.of.function\s+(?:mutation|variant)|haploinsufficiency|gene\s+(?:silencing|expression\s+deficiency|dosage\s+imbalance)|promoter\s+(?:methylation|silencing|mutation)|gene\s+expression\s+(?:restoration|rescue|defect)|trinucleotide\s+repeat\s+(?:expansion|disorder)|repeat\s+expansion\s+(?:mutation|disorder)/i, biology: "gene expression deficiency" },
  // Genetic — ion channel
  { pattern: /channelopathy|ion\s+channel\s+(?:dysfunction|mutation|defect)|CFTR\s+(?:dysfunction|mutation|correction)|cystic\s+fibrosis\s+(?:biology|CFTR|transmembrane)|sodium\s+channel\s+(?:mutation|dysfunction)|potassium\s+channel\s+(?:mutation|dysfunction)|chloride\s+channel|long\s+QT\s+(?:syndrome|channel\s+defect)|Brugada\s+syndrome|epilepsy.*channel\s+mutation/i, biology: "ion channel dysfunction" },
  // Genetic — structural protein
  { pattern: /dystrophin\s+(?:deficiency|mutation|restoration|exon\s+skipping)|muscular\s+dystrophy.*protein|collagen\s+(?:defect|mutation|biosynthesis\s+disorder)|structural\s+protein\s+(?:defect|mutation|dysfunction)|fibrillin\s+(?:mutation|defect)|connective\s+tissue\s+(?:structural\s+protein|disorder.*protein\s+defect)/i, biology: "structural protein defect" },
  // Genetic — splicing
  { pattern: /(?:pre.)?mRNA\s+splicing\s+(?:defect|error|dysregulation)|exon\s+skipping\s+(?:therapy|approach|strategy)|splice.?site\s+(?:mutation|variant|correction)|splicing\s+factor\s+(?:mutation|dysfunction)|spinal\s+muscular\s+atrophy.*SMN|SMN[12].*splicing|antisense.*splicing|spliceosome\s+(?:dysfunction|inhibitor)/i, biology: "rna splicing defect" },
  // Infectious — pathogen replication
  { pattern: /viral\s+(?:replication|entry|infection|pathogenesis|life\s+cycle)|bacterial\s+(?:infection|virulence|replication|pathogenesis)|antiviral\s+(?:therapy|mechanism|activity)|antimicrobial\s+(?:mechanism|activity|peptide)|pathogen\s+(?:replication|clearance|virulence)|infection\s+(?:biology|mechanism|pathogenesis)|SARS.CoV.?2|HIV\s+(?:replication|infection\s+biology|life\s+cycle)|hepatitis.*replication|influenza.*replication/i, biology: "pathogen replication" },
  // Infectious — antimicrobial resistance
  { pattern: /antibiotic\s+resistance|antimicrobial\s+resistance|drug.resistant\s+(?:bacteria|pathogen|TB|tuberculosis)|MRSA|methicillin.resistant|multi.drug.resistant|MDR.(?:TB|bacteria)|ESKAPE|beta.?lactamase|carbapenem.resistant|vancomycin.resistant|AMR\s+(?:mechanism|pathway|bacteria)/i, biology: "antimicrobial resistance" },
  // General — fibrosis
  { pattern: /(?:pulmonary|hepatic|renal|cardiac|organ)\s+fibrosis|TGF.?(?:β|beta)\s+(?:pathway|signaling|fibrosis|driven)|myofibroblast\s+(?:activation|differentiation|fibrosis)|fibrotic\s+(?:disease|pathway|response|tissue)|collagen\s+(?:overdeposition|accumulation|fibrosis)|idiopathic\s+pulmonary\s+fibrosis|cirrhosis\s+(?:fibrosis|biology)|anti.?fibrotic/i, biology: "fibrosis" },
  // General — ischemia / oxidative stress
  { pattern: /ischemia(?:.reperfusion)?|reperfusion\s+injury|oxidative\s+stress\s+(?:disease|pathway|induced)|reactive\s+oxygen\s+species\s+(?:disease|pathology|overproduction)|ROS.induced|antioxidant\s+(?:therapy|pathway|defense\s+deficiency)|hypoxia.?(?:reoxygenation|ischemia)|myocardial\s+infarction.*ischemia|stroke\s+(?:ischemia|oxidative\s+stress)|neuroprotection.*ischemia/i, biology: "ischemia and oxidative stress" },
];

// ── Tier 2: Disease-name and broader text patterns ────────────────────────────
const TIER2: Array<{ pattern: RegExp; biology: string }> = [
  // Disease names that reliably map to a biology
  { pattern: /Alzheimer.s?\s+(?:disease|dementia)|Parkinson.s?\s+disease|Huntington.s?\s+disease|frontotemporal\s+(?:dementia|lobar\s+degeneration)|Lewy\s+body\s+dementia|ALS.*neurodegen|amyotrophic\s+lateral\s+sclerosis.*protein/i, biology: "protein aggregation" },
  { pattern: /multiple\s+sclerosis|Guillain.Barr[eé]|Charcot.Marie.Tooth|peripheral\s+neuropathy.*myelin|optic\s+neuritis|transverse\s+myelitis/i, biology: "myelin disruption" },
  { pattern: /rheumatoid\s+arthritis|systemic\s+lupus|Sjogren.s?\s+syndrome|ankylosing\s+spondylitis|psoriatic\s+arthritis|inflammatory\s+bowel\s+disease.*autoimmune|Crohn.s?\s+disease.*autoimmune|celiac\s+disease|type\s+1\s+diabetes.*autoimmune|autoimmune\s+hepatitis|primary\s+biliary/i, biology: "autoimmune dysregulation" },
  { pattern: /atopic\s+dermatitis|asthma.*IgE|allergic\s+rhinitis|food\s+allergy|anaphylaxis|urticaria\s+(?:chronic|allergy)|eosinophilic\s+esophagitis/i, biology: "allergic dysregulation" },
  { pattern: /Gaucher\s+disease|Fabry\s+disease|Pompe\s+disease|Hunter\s+syndrome|Hurler\s+syndrome|Niemann.Pick|mucopolysaccharidosis|glycogen\s+storage\s+disease|phenylketonuria|PKU|galactosemia|maple\s+syrup\s+urine/i, biology: "enzyme deficiency" },
  { pattern: /cystic\s+fibrosis|Duchenne\s+muscular\s+dystrophy|Becker\s+muscular\s+dystrophy|spinal\s+muscular\s+atrophy\s+(?:type|SMA)\s*[0-9]?/i, biology: "ion channel dysfunction" },
  { pattern: /hemophilia|sickle\s+cell\s+disease|thalassemia|Diamond.Blackfan|aplastic\s+anemia\s+(?:genetic|congenital)|Fanconi\s+anemia/i, biology: "gene expression deficiency" },
  { pattern: /non.alcoholic\s+steatohepatitis|NASH|NAFLD|fatty\s+liver\s+disease|hypertriglyceridemia|familial\s+hypercholesterolemia|steatosis/i, biology: "lipid metabolism dysfunction" },
  { pattern: /IPF|idiopathic\s+pulmonary\s+fibrosis|liver\s+cirrhosis|renal\s+fibrosis|cardiac\s+fibrosis|systemic\s+sclerosis.*fibrosis|scleroderma.*fibrosis|keloid|hypertrophic\s+scar/i, biology: "fibrosis" },
  { pattern: /heart\s+failure.*ischemi|myocardial\s+infarction|stroke\s+(?:treatment|neuroprotection|ischemic)|peripheral\s+artery\s+disease\s+(?:ischemia|occlusion)|limb\s+ischemia|organ\s+preservation.*ischemia/i, biology: "ischemia and oxidative stress" },
  { pattern: /castration.resistant\s+prostate\s+cancer|hormone.?receptor.positive\s+breast\s+cancer|PCOS|polycystic\s+ovary|endometriosis|hypogonadism|adrenal\s+(?:insufficiency|hyperplasia)/i, biology: "hormonal dysregulation" },
  { pattern: /epilepsy|seizure\s+disorder|long\s+QT\s+syndrome|Brugada|catecholaminergic\s+polymorphic\s+ventricular|HCN\s+channelopathy/i, biology: "ion channel dysfunction" },
  { pattern: /PD.L1.positive|checkpoint.?naive|immunotherapy.?resistant|tumor\s+infiltrating\s+lymphocyte|adoptive\s+(?:cell\s+therapy|transfer).*tumor|CAR.T.*(?:tumor|cancer|solid\s+tumor)|bispecific.*tumor\s+antigen/i, biology: "immune evasion" },
  { pattern: /HIV\s+infection|COVID.?19|SARS.?CoV|HBV|HCV|hepatitis\s+[BC]\s+virus|RSV|cytomegalovirus|EBV\s+infection|herpes\s+(?:simplex|zoster)|influenza\s+virus|malaria\s+(?:infection|parasite)|tuberculosis\s+infection/i, biology: "pathogen replication" },
  { pattern: /kinase.*cancer|inhibitor.*kinase.*oncol|oncogenic.*(?:signal|pathway|mutation).*kinase|fusion.*kinase|amplified.*RTK/i, biology: "aberrant kinase signaling" },
  { pattern: /mitochondrial\s+(?:myopathy|encephalopathy|neuropathy|disease|disorder)|Leigh\s+syndrome|MELAS|MERRF|Kearns.Sayre/i, biology: "mitochondrial dysfunction" },
  // Expanded TIER2: pain / nociception → ion channel dysfunction
  { pattern: /\b(?:chronic\s+pain|neuropathic\s+pain|nociception|pain\s+(?:management|relief|treatment|therapy)|analgesic|opioid.*pain|allodynia|hyperalgesia|fibromyalgia|migraine|headache\s+disorder)\b/i, biology: "ion channel dysfunction" },
  // Expanded TIER2: wound healing / tissue repair → fibrosis
  { pattern: /\b(?:wound\s+healing|tissue\s+repair|skin\s+regeneration|chronic\s+wound|diabetic\s+(?:wound|ulcer)|pressure\s+ulcer|dermal\s+repair|regenerative\s+wound|burn\s+wound|wound\s+closure)\b/i, biology: "fibrosis" },
  // Expanded TIER2: cardiovascular → ischemia and oxidative stress
  // Includes plain hypertension, remodeling variants, valve disease, arrhythmia
  { pattern: /\b(?:heart\s+failure|cardiac\s+arrest|cardiomyopathy|dilated\s+cardiomyopathy|coronary\s+artery\s+disease|angina|atherosclerosis|hypertension(?!\s+(?:portal|pulmonary\s+arterial))\b|cardiac\s+remodeling|ventricular\s+(?:remodeling|hypertrophy|dysfunction)|arrhythmia|acute\s+coronary\s+syndrome|cardioprotection|aortic\s+(?:stenosis|valve\s+disease)|cardiogenic\s+shock|heart\s+disease)\b/i, biology: "ischemia and oxidative stress" },
  // Expanded TIER2: acute kidney injury → ischemia (distinct from CKD → fibrosis)
  { pattern: /\b(?:acute\s+kidney\s+injury|AKI\b|renal\s+(?:ischemia|reperfusion\s+injury|ischemia.reperfusion)|ischemic\s+nephropathy|contrast.induced\s+(?:nephropathy|AKI)|hepatorenal\s+syndrome|acute\s+tubular\s+necrosis)\b/i, biology: "ischemia and oxidative stress" },
  // Expanded TIER2: chronic kidney disease / renal → fibrosis
  { pattern: /\b(?:chronic\s+kidney\s+disease|CKD\b|diabetic\s+nephropathy|glomerulosclerosis|renal\s+(?:insufficiency|failure|chronic\s+disease)|end.stage\s+renal|nephritis\s+fibrosis|kidney\s+fibrosis)\b/i, biology: "fibrosis" },
];

/**
 * Step 0 — Derive biology from known target.
 * Returns biology string or null if no target rule matches.
 */
function deriveFromTarget(target: string | null): string | null {
  if (!target || target === "unknown" || target.length < 2) return null;
  for (const rule of TARGET_TO_BIOLOGY) {
    if (rule.pattern.test(target)) return rule.biology;
  }
  return null;
}

// ── Accuracy guards ────────────────────────────────────────────────────────────

/** Returns true if the modality is a medical device / equipment (independent of target). */
function isDeviceModality(asset: BiologyAsset): boolean {
  const modLower = (asset.modality ?? "").toLowerCase();
  return /\b(?:medical\s+device|device|surgical|implant|equipment|instrument|diagnostic\s+tool|imaging|wearable)\b/.test(modLower);
}

/**
 * @deprecated Use isDeviceModality instead — kept for reference only.
 * The old function allowed devices with a non-empty target to fall through
 * into TIER1/TIER2 text matching, reintroducing biology bleed.
 */
function isDeviceWithNoMolecularTarget(asset: BiologyAsset): boolean {
  if (!isDeviceModality(asset)) return false;
  const tgt = (asset.target ?? "").toLowerCase().trim();
  return !tgt || tgt === "unknown" || tgt.length <= 2;
}

/**
 * Returns true if the asset has clear autoimmune disease context.
 * Prioritises indication (higher-weight signal) then falls back to the full
 * text blob. Checking indication first prevents autoimmune background terms
 * in a research abstract from over-downgrading oncology checkpoint assets.
 */
function isAutoimmune(text: string, indication?: string | null): boolean {
  const AUTOIMMUNE_RE = /\b(?:autoimmune|autoantibody|self.antigen|autoreactive|rheumatoid|lupus|Sjogren|multiple\s+sclerosis|inflammatory\s+bowel|Crohn|celiac|psoriatic|ankylosing|myasthenia|vasculitis)\b/i;
  // If indication is available and clearly autoimmune, trust it.
  if (indication && AUTOIMMUNE_RE.test(indication)) return true;
  // If indication is present but not autoimmune, don't over-downgrade based on
  // background text (e.g. oncology checkpoint paper with autoimmune side-effect
  // mention). Only use full text when indication is absent / uninformative.
  if (indication && indication.trim().length > 5) return false;
  return AUTOIMMUNE_RE.test(text);
}

/**
 * Returns true if the indication string has genuine infectious disease context.
 * Intentionally only checks the indication field — NOT summary/abstract — so
 * delivery-vector language ("AAV", "viral vector", "lentiviral") in the body
 * of a gene therapy abstract cannot trigger a false positive.
 */
function hasInfectiousContext(indication: string): boolean {
  return /\b(?:infect(?:ion|ious)|viral\s+(?:disease|infection|illness)|bacterial\s+(?:disease|infection|illness)|pathogen|SARS|COVID|HIV|HCV|HBV|RSV|CMV|EBV|HSV|influenza|malaria|tuberculosis|TB|antimicrobial|antiviral\s+(?:therapy|treatment)|antibiotic|sepsis|bacteremia|fungal\s+infection|mycobact)\b/i.test(indication);
}

/** Returns true if modality is gene therapy / gene editing / nanoparticle (delivery vector). */
function isVectorDeliveryModality(asset: BiologyAsset): boolean {
  const modLower = (asset.modality ?? "").toLowerCase();
  return /\b(?:gene\s+therapy|gene\s+editing|nanoparticle|lipid\s+nanoparticle|LNP|AAV|lentiviral\s+vector|viral\s+vector|mRNA\s+(?:therapy|vaccine))\b/.test(modLower);
}

/**
 * Step 1 — Apply tiered text rules with accuracy guards.
 * Returns biology string or null if nothing matched.
 */
export function applyBiologyRules(asset: BiologyAsset): string | null {
  // Guard 1: medical device modality — NEVER run TIER1/TIER2 text matching.
  // Devices have no molecular biology in the pharma sense; the only valid
  // biology is one that maps from an explicit molecular target (e.g. a device
  // that delivers a VEGF inhibitor still has target="VEGF"). If target
  // derivation fails, return null — do NOT fall through into text rules.
  if (isDeviceModality(asset)) {
    const targetDerived = deriveFromTarget(asset.target);
    if (!targetDerived) return null;
    // Apply viral-vector guard even for device+target path (rare but possible).
    if (targetDerived === "pathogen replication" && isVectorDeliveryModality(asset)) {
      if (!hasInfectiousContext(asset.indication ?? "")) return null;
    }
    return targetDerived;
  }

  const targetDerived = deriveFromTarget(asset.target);
  if (targetDerived) {
    // Guard 2: viral-vector guard — gene therapy/nanoparticle assets only map to
    // "pathogen replication" when the indication is genuinely infectious.
    // Checking indication only (not summary/abstract) avoids false positives from
    // delivery-vector language ("AAV", "viral vector") in the method section.
    if (targetDerived === "pathogen replication" && isVectorDeliveryModality(asset)) {
      if (!hasInfectiousContext(asset.indication ?? "")) return null;
    }
    return targetDerived;
  }

  const text = [
    asset.asset_name ?? "",
    asset.summary ?? "",
    asset.abstract ?? "",
    asset.indication ?? "",
    asset.mechanism_of_action ?? "",
  ].join(" ");

  for (const rule of TIER1) {
    const matched = rule.pattern.test(text);
    if (matched) {
      // Guard 3: "immune evasion" rules can misfire for autoimmune checkpoint use-cases.
      // If indication/text is clearly autoimmune, downgrade to autoimmune dysregulation.
      if (rule.biology === "immune evasion" && isAutoimmune(text, asset.indication)) {
        return "autoimmune dysregulation";
      }
      // Guard 4: viral-vector assets matched to "pathogen replication" via TIER1 text
      // need infectious indication confirmation (not just text which has delivery language).
      if (rule.biology === "pathogen replication" && isVectorDeliveryModality(asset)) {
        if (!hasInfectiousContext(asset.indication ?? "")) continue;
      }
      return rule.biology;
    }
  }
  for (const rule of TIER2) {
    const matched = rule.pattern.test(text);
    if (matched) {
      if (rule.biology === "immune evasion" && isAutoimmune(text, asset.indication)) {
        return "autoimmune dysregulation";
      }
      if (rule.biology === "pathogen replication" && isVectorDeliveryModality(asset)) {
        if (!hasInfectiousContext(asset.indication ?? "")) continue;
      }
      return rule.biology;
    }
  }
  return null;
}

/**
 * GPT-4o-mini fallback for assets the rules couldn't classify.
 * Uses a closed-set constraint for maximum accuracy.
 */
async function gptFallback(
  batch: BiologyAsset[],
  openai: OpenAI,
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (batch.length === 0) return result;

  // Build a 1-based index → DB id map so we can handle GPT returning either
  const idxToDbId = new Map<number, number>();
  const items = batch.map((a, i) => {
    idxToDbId.set(i + 1, a.id);
    // Prefer abstract over summary (richer scientific context), strip HTML tags,
    // and cap to 900 chars for reliable JSON output within token budget.
    const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const raw = a.abstract
      ? [a.abstract, a.summary ?? "", a.indication ?? ""].join(" ")
      : [a.summary ?? "", a.indication ?? "", a.mechanism_of_action ?? ""].join(" ");
    const ctx = stripHtml(raw).slice(0, 900);
    return `${i + 1}. ${a.asset_name} | Modality: ${a.modality ?? "unknown"} | Target: ${a.target ?? "unknown"} | ${ctx}`;
  });

  const prompt = `You are a biotech asset classifier. Assign each asset to exactly one "biology" value from this closed list — the pathological biological process the asset addresses:

${CANONICAL_BIOLOGY.join(" | ")}

Reply with ONLY a JSON object using the list position (1, 2, 3…) as the "idx":
{"results": [{"idx": 1, "biology": "..."}, {"idx": 2, "biology": "..."}, ...]}
Include every asset. Use "unknown" if genuinely unclear. Never invent values outside the list.

Assets:
${items.join("\n")}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { return result; }

    const arr: Array<{ idx?: number; id?: number; biology: string }> =
      Array.isArray(parsed) ? parsed : (parsed.results ?? []);

    for (const item of arr) {
      if (typeof item.biology !== "string") continue;
      const b = item.biology.toLowerCase().trim();
      if (b === "unknown" || !CANONICAL_BIOLOGY.includes(b)) continue;

      // Prefer idx (1-based list position); fall back to id in case GPT used it
      const listPos = typeof item.idx === "number" ? item.idx : (typeof item.id === "number" ? item.id : null);
      if (listPos === null) continue;

      const dbId = idxToDbId.get(listPos);
      if (dbId !== undefined) {
        result.set(dbId, b);
      }
    }
  } catch (err: any) {
    console.error("[biology-fill] GPT batch error:", err.message);
  }

  return result;
}

/** Write a batch of tagged updates to DB immediately. */
async function flushToDB(
  dbClient: import("pg").PoolClient,
  updates: Array<{ id: number; biology: string; source: string }>,
): Promise<void> {
  if (updates.length === 0) return;
  const values: unknown[] = [];
  const rows = updates.map((u, j) => {
    const base = j * 3;
    values.push(u.id, u.biology, JSON.stringify({ biology: u.source }));
    return `($${base + 1}::int, $${base + 2}::text, $${base + 3}::text)`;
  });
  await dbClient.query(
    `UPDATE ingested_assets AS t
     SET biology = v.biology,
         enrichment_sources = COALESCE(t.enrichment_sources, '{}'::jsonb) || v.src::jsonb
     FROM (VALUES ${rows.join(", ")}) AS v(id, biology, src)
     WHERE t.id = v.id`,
    values,
  );
}

/**
 * Full biology fill pipeline — writes progressively so partial progress
 * is preserved even if the server restarts mid-run.
 *
 * 1. Fetch relevant assets where biology IS NULL / empty / unknown
 * 2. Derive from known target (zero cost) → write immediately
 * 3. Apply Tier 1 + Tier 2 text rules → write immediately
 * 4. GPT-4o-mini fallback for residual → write after each batch of 50
 */
export async function runBiologyFill(
  dbClient: import("pg").PoolClient,
  opts: BiologyFillOptions = {},
): Promise<BiologyFillSummary> {
  const { dryRun = false, skipGpt = false, gptBatchSize = 50, cap, signal, onProgress } = opts;

  const { rows: assets } = await dbClient.query<BiologyAsset>(
    `SELECT id, asset_name, summary, abstract, indication, modality, target,
            mechanism_of_action, source_type, ip_type, patent_status, development_stage
     FROM ingested_assets
     WHERE relevant = true
       AND (biology IS NULL OR biology = '' OR biology = 'unknown')
     ORDER BY completeness_score DESC NULLS LAST, id
     ${cap ? `LIMIT ${cap}` : ""}`,
  );

  const total = assets.length;
  let targetDerivedCount = 0;
  let ruleMatchedCount = 0;
  let gptResolvedCount = 0;
  let written = 0;

  const emit = (phase: string, gptSent = 0) =>
    onProgress?.({
      processed: targetDerivedCount + ruleMatchedCount + Math.min(gptSent, total - targetDerivedCount - ruleMatchedCount),
      total,
      phase,
      targetDerived: targetDerivedCount,
      ruleMatched: ruleMatchedCount,
      gptSent,
      gptResolved: gptResolvedCount,
      written,
    });

  emit("classifying (target + rules)");

  // ── Phase 1: fast classification ─────────────────────────────────────────
  const fastTarget: Array<{ id: number; biology: string; source: string }> = [];
  const fastRule: Array<{ id: number; biology: string; source: string }> = [];
  const unmatched: BiologyAsset[] = [];

  for (const asset of assets) {
    if (signal?.aborted) break;
    const fromTarget = deriveFromTarget(asset.target);
    if (fromTarget) {
      fastTarget.push({ id: asset.id, biology: fromTarget, source: "target_derived" });
      targetDerivedCount++;
      continue;
    }
    const fromRules = applyBiologyRules(asset);
    if (fromRules) {
      fastRule.push({ id: asset.id, biology: fromRules, source: "rule" });
      ruleMatchedCount++;
    } else {
      unmatched.push(asset);
    }
  }

  // Write target-derived + rule matches immediately
  if (!dryRun) {
    await flushToDB(dbClient, [...fastTarget, ...fastRule]);
    written += fastTarget.length + fastRule.length;
  }
  emit(`classifying done — ${unmatched.length} need GPT`);

  // ── Phase 2: GPT fallback, one batch at a time ───────────────────────────
  if (!skipGpt && unmatched.length > 0 && !signal?.aborted) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    for (let i = 0; i < unmatched.length; i += gptBatchSize) {
      if (signal?.aborted) break;
      const batch = unmatched.slice(i, i + gptBatchSize);
      const gptResult = await gptFallback(batch, openai);

      const batchWrites: Array<{ id: number; biology: string; source: string }> = [];
      for (const asset of batch) {
        const b = gptResult.get(asset.id);
        if (b) {
          batchWrites.push({ id: asset.id, biology: b, source: "gpt4o-mini" });
          gptResolvedCount++;
        }
      }

      if (!dryRun && batchWrites.length > 0) {
        await flushToDB(dbClient, batchWrites);
        written += batchWrites.length;
      }

      const gptSent = Math.min(i + gptBatchSize, unmatched.length);
      emit(`GPT fallback (${gptSent} / ${unmatched.length} sent)`, gptSent);

      if (i + gptBatchSize < unmatched.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }

  return {
    total,
    targetDerived: targetDerivedCount,
    indicationDerived: 0,
    ruleMatched: ruleMatchedCount,
    gptSent: unmatched.length,
    gptResolved: gptResolvedCount,
    totalUpdated: written,
    unresolved: unmatched.length - gptResolvedCount,
  };
}
