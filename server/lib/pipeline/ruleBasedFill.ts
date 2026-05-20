import { db } from "../../db";
import { ingestedAssets } from "@shared/schema";
import { sql, eq, type SQL } from "drizzle-orm";

// ── Development Stage rules ───────────────────────────────────────────────────
const STAGE_RULES: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\bphase\s*3\b|\bphase\s*III\b/i, value: "phase 3" },
  { pattern: /\bphase\s*2\/3\b|\bphase\s*II\/III\b/i, value: "phase 2" },
  { pattern: /\bphase\s*2\b|\bphase\s*II\b/i, value: "phase 2" },
  { pattern: /\bphase\s*1\/2\b|\bphase\s*I\/II\b/i, value: "phase 1" },
  { pattern: /\bphase\s*1\b|\bphase\s*I\b|\bfirst-in-human\b/i, value: "phase 1" },
  { pattern: /\bIND\s+filed\b|\bIND\s+approved\b|\binvestigational\s+new\s+drug\b/i, value: "preclinical" },
  { pattern: /\bpreclinical\b|\bpre-clinical\b|\bin\s+vivo\b|\bin\s+vitro\b|\banimal\s+model\b|\bmouse\s+model\b|\brat\s+model\b/i, value: "preclinical" },
  // Prototype / proof-of-concept / pilot: technology demonstrated but not yet in clinical trials.
  // Mapped to preclinical — more accurate than "discovery" which implies bench-only research.
  { pattern: /\bprototype\b|\bproof[- ]of[- ]concept\b|\bpoc\s+(?:study|testing|data|results?)\b|\bpilot\s+(?:study|testing|trial|program|experiment)\b|\bfeasibility\s+(?:study|testing|trial)\b/i, value: "preclinical" },
  { pattern: /\bFDA[- ]approved\b|\bEMA[- ]approved\b|\bCE[- ]marked\b|\b510\(k\)[- ]cleared\b|\bmarket\s+approval\b|\bcommercialized\b/i, value: "approved" },
  // Discovery: genuine early-stage research — hit/lead ID only. POC removed (see preclinical above).
  { pattern: /\bdiscovery\s+stage\b|\bhit\s+identification\b|\blead\s+identification\b/i, value: "discovery" },
];

// ── IP Type rules ─────────────────────────────────────────────────────────────
const IP_RULES: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\bprovisional\s+patent\b|\bprovisional\s+application\b/i, value: "provisional" },
  { pattern: /\bpatent\s+pending\b|\bpatent\s+applied\b|\bpatent\s+filed\b|\bpatent\s+application\b/i, value: "patent pending" },
  { pattern: /\bissued\s+patent\b|\bgranted\s+patent\b|\bU\.S\.\s+patent\s+no\b|\bUS\s+patent\s+no\b|\bpatent\s+no\.\b|\bpatented\b/i, value: "patented" },
  { pattern: /\btrade\s+secret\b|\bproprietary\s+know-?how\b/i, value: "trade secret" },
  { pattern: /\bcopyright\b|\bopen\s+source\b/i, value: "copyright" },
];

// ── Licensing Readiness rules ─────────────────────────────────────────────────
const LICENSING_RULES: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\bexclusively\s+licensed\b|\bexclusive\s+license\s+granted\b/i, value: "exclusively licensed" },
  { pattern: /\bnon-?exclusively\s+licensed\b|\bnon-?exclusive\s+license\b/i, value: "non-exclusively licensed" },
  { pattern: /\boption(ed)?\s+agreement\b|\bunder\s+option\b/i, value: "optioned" },
  { pattern: /\bspin-?out\b|\bspin-?off\b|\bstartup\s+formed\b|\bcompany\s+formed\b|\bstart-?up\s+founded\b/i, value: "startup formed" },
  { pattern: /\bavailable\s+for\s+licens\w+\b|\bseeking\s+licens\w+\b|\bopen\s+for\s+licens\w+\b|\blicensing\s+opportunit\w+\b/i, value: "available" },
];

// ── Modality rules — order matters: most specific first ───────────────────────
const MODALITY_RULES: Array<{ pattern: RegExp; value: string }> = [
  // Gene editing (CRISPR, base editing)
  { pattern: /\bCRISPR[\s-]?Cas\b|\bCRISPR[\s-]?based\b|\bbase[\s-]?edit(?:ing)?\b|\bprime[\s-]?edit(?:ing)?\b|\bgene[\s-]?edit(?:ing)?\b/i, value: "gene editing" },
  // CAR-T / CAR-NK and all cell therapies (canonical value: "cell therapy")
  { pattern: /\bCAR[\s-]?T\b|\bCAR[\s-]?NK\b|\bCAR[\s-]?cell\b|\bchimeric\s+antigen\s+receptor/i, value: "cell therapy" },
  // Adoptive cell therapies (TIL, T cell, NK cell, stem cell)
  { pattern: /\badoptive\s+cell\s+therap|\bTIL\s+therap|\bT[\s-]?cell\s+therap|\bNK\s+cell\s+therap|\bcell-?based\s+immuno|\bstem\s+cell\s+therap/i, value: "cell therapy" },
  // Gene therapy (AAV/lentiviral)
  { pattern: /\bgene\s+therap|\bAAV\b|\blentiviral\s+(?:vector|delivery)\b|\badeno[\s-]?associated\s+virus|\badenoviral\s+(?:vector|gene)\b/i, value: "gene therapy" },
  // mRNA therapeutics
  { pattern: /\bmRNA\s+(?:vaccine|therap|platform|delivery|encod)\b|\blipid[\s-]?nanoparticle\s+mRNA\b/i, value: "mrna" },
  // RNA therapeutics (siRNA, ASO, RNAi)
  { pattern: /\bsiRNA\b|\bshRNA\b|\bRNAi\b|\bmiRNA\s+(?:mimic|inhibitor|therap)\b|\bASO\b|\bantisense\s+oligon|\bRNA[\s-]?interferenc|\boligonucleotide\s+therap/i, value: "rna therapy" },
  // Vaccines — require explicit asset context, not just mention of the word
  { pattern: /\bvaccine\s+(?:candidate|platform|formulation|development|therapy|immunogen)\b|\bprophylactic\s+vaccine\b|\btherapeutic\s+vaccine\b|\bmRNA\s+vaccine\b|\bviral\s+vector\s+vaccine\b/i, value: "vaccine" },
  // ADC and complex antibody formats first
  { pattern: /\bbispecific\s+antibod|\bantibody[\s-]?drug\s+conjug|\bADC\b(?:\s+therap|\s+platform)|\bnanobod|\bscFv\b|\bIgG\b/i, value: "antibody" },
  // Antibody (broad)
  { pattern: /\bmonoclonal\s+antibod|\bantibod(?:y|ies)\b/i, value: "antibody" },
  // Stapled / therapeutic peptides
  { pattern: /\bstapled\s+peptide\b|\bcyclic\s+peptide\b|\bpeptide\s+therap|\bpeptidomimetic|\bcell[\s-]?penetrating\s+peptide/i, value: "peptide" },
  // Nanoparticles / delivery systems
  { pattern: /\bnanoparticle\b|\bliposome\b|\bliposomal\b|\bnano[\s-]?medicine\b|\bnano[\s-]?carrier\b|\blipid[\s-]?nanoparticle\b|\bpolymeric\s+nano|\bexosome[\s-]?(?:based|delivery)/i, value: "nanoparticle" },
  // PROTAC / molecular glue / degraders
  { pattern: /\bPROTAC\b|\bmolecular\s+glue\b|\btargeted\s+protein\s+degrad|\bTPD\b/i, value: "small molecule" },
  // Small molecule — explicit term or unambiguous chemistry classes only
  { pattern: /\bsmall[\s-]?molecule\b|\bkinase\s+inhibitor\b|\bprotease\s+inhibitor\b|\ballosteric\s+(?:inhibitor|modulator)\b/i, value: "small molecule" },
  // Diagnostics
  { pattern: /\bdiagnostic\s+(?:test|kit|assay|platform|tool|device|marker)\b|\bbiomarker\s+(?:test|assay|panel|platform)\b|\bimaging\s+agent\b|\bcontrast\s+agent\b|\bin\s+vitro\s+diagnostic\b|\bIVD\b/i, value: "diagnostic" },
  // Peptide (broad fallback)
  { pattern: /\bpeptide\b/i, value: "peptide" },
  // Biologic / protein / recombinant (broad catch-all after antibody)
  { pattern: /\brecombinant\s+(?:protein|enzyme|hormone|cytokine|growth\s+factor)\b|\bfusion\s+protein\b|\bgrowth\s+factor\b(?:\s+therap|\s+protein)|\bcytokine\s+therap|\bbiologic(?:s)?\b/i, value: "biologic" },
];

// ── Target rules — biotech gene/protein target vocabulary ─────────────────────
// Applied only when target is null/'unknown' and not human-verified.
const TARGET_RULES: Array<{ pattern: RegExp; value: string }> = [
  // Checkpoint / IO
  { pattern: /\bPD[\s-]?L1\b|\bCD274\b/i, value: "PD-L1" },
  { pattern: /\bPD[\s-]?1\b|\bPDCD1\b/i, value: "PD-1" },
  { pattern: /\bCTLA[\s-]?4\b/i, value: "CTLA-4" },
  { pattern: /\bLAG[\s-]?3\b/i, value: "LAG-3" },
  { pattern: /\bTIM[\s-]?3\b/i, value: "TIM-3" },
  { pattern: /\bTIGIT\b/i, value: "TIGIT" },
  { pattern: /\b4[\s-]?1BB\b|\bCD137\b/i, value: "4-1BB" },
  { pattern: /\bOX40\b|\bCD134\b/i, value: "OX40" },
  { pattern: /\bPD[\s-]?L2\b/i, value: "PD-L2" },
  // RTK receptors
  { pattern: /\bEGFR\b/i, value: "EGFR" },
  { pattern: /\bHER2\b|\bERBB2\b/i, value: "HER2" },
  { pattern: /\bHER3\b|\bERBB3\b/i, value: "HER3" },
  { pattern: /\bVEGFR\b/i, value: "VEGFR" },
  { pattern: /\bVEGF\b(?!R)/i, value: "VEGF" },
  { pattern: /\bFGFR[0-9]?\b/i, value: "FGFR" },
  { pattern: /\bMET\b(?:\s+(?:kinase|receptor|tyrosine|proto|inhibitor|amplification|exon))/i, value: "MET" },
  { pattern: /\bIGF[\s-]?1R\b/i, value: "IGF-1R" },
  // RAS/RAF/MAPK pathway
  { pattern: /\bKRAS\b/i, value: "KRAS" },
  { pattern: /\bBRAF\b/i, value: "BRAF" },
  { pattern: /\bNRAS\b/i, value: "NRAS" },
  { pattern: /\bMEK[0-9]?\b/i, value: "MEK" },
  { pattern: /\bERK[0-9]?\b(?:\s+(?:kinase|pathway|inhibitor|phospho))/i, value: "ERK" },
  // Fusion/rearrangement targets
  { pattern: /\bALK\b(?:\s+(?:kinase|receptor|inhibitor|fusion|rearrangement|mutation|positive))/i, value: "ALK" },
  { pattern: /\bRET\b(?:\s+(?:kinase|proto|fusion|rearrangement|mutation|inhibitor))/i, value: "RET" },
  { pattern: /\bROS1\b/i, value: "ROS1" },
  { pattern: /\bNTRK[0-9]?\b/i, value: "NTRK" },
  { pattern: /\bBCR[\s-]?ABL\b/i, value: "BCR-ABL" },
  // Oncogenes
  { pattern: /\bMYC\b|\bc[\s-]?Myc\b|\bN[\s-]?Myc\b/i, value: "MYC" },
  // Tumor suppressors
  { pattern: /\bTP53\b|\bp53\b/i, value: "TP53/p53" },
  { pattern: /\bBRCA1\b/i, value: "BRCA1" },
  { pattern: /\bBRCA2\b/i, value: "BRCA2" },
  { pattern: /\bPTEN\b/i, value: "PTEN" },
  // Epigenetic
  { pattern: /\bEZH2\b/i, value: "EZH2" },
  { pattern: /\bHDAC[0-9]?\b/i, value: "HDAC" },
  { pattern: /\bBRD4\b|\bBET\b(?:\s+bromodomain)/i, value: "BET/BRD4" },
  { pattern: /\bDNMT[0-9]?\b/i, value: "DNMT" },
  // Cell cycle
  { pattern: /\bCDK4\/6\b|\bCDK4\b|\bCDK6\b/i, value: "CDK4/6" },
  { pattern: /\bCDK[0-9]+\b(?:\s+(?:inhibitor|kinase|pathway))/i, value: "CDK" },
  // PI3K/AKT/mTOR
  { pattern: /\bPI3K\b|\bPI3K[αβγδ]\b/i, value: "PI3K" },
  { pattern: /\bmTOR\b|\bmTORC[12]\b/i, value: "mTOR" },
  { pattern: /\bAKT[0-9]?\b/i, value: "AKT" },
  // JAK/STAT
  { pattern: /\bJAK1\b/i, value: "JAK1" },
  { pattern: /\bJAK2\b/i, value: "JAK2" },
  { pattern: /\bJAK3\b/i, value: "JAK3" },
  { pattern: /\bSTAT3\b/i, value: "STAT3" },
  // Heme/leukemia
  { pattern: /\bBTK\b/i, value: "BTK" },
  { pattern: /\bIDH1\b/i, value: "IDH1" },
  { pattern: /\bIDH2\b/i, value: "IDH2" },
  { pattern: /\bFLT3\b/i, value: "FLT3" },
  // DNA damage response
  { pattern: /\bPARP[0-9]?\b/i, value: "PARP" },
  { pattern: /\bATR\b(?:\s+(?:kinase|inhibitor|pathway))/i, value: "ATR" },
  { pattern: /\bATM\b(?:\s+(?:kinase|inhibitor|pathway))/i, value: "ATM" },
  // Apoptosis
  { pattern: /\bBCL[\s-]?2\b/i, value: "BCL-2" },
  { pattern: /\bBCL[\s-]?XL\b/i, value: "BCL-XL" },
  { pattern: /\bMDM2\b/i, value: "MDM2" },
  // Cytokines / inflammation
  { pattern: /\bTNF[\s-]?(?:α|alpha)\b|\bTNF\b(?:\s+(?:alpha|receptor|inhibitor|pathway))/i, value: "TNF-alpha" },
  { pattern: /\bIL[\s-]?6\b/i, value: "IL-6" },
  { pattern: /\bIL[\s-]?1[βB]\b|\bIL[\s-]?1\b(?:\s+(?:beta|receptor|inhibitor))/i, value: "IL-1" },
  { pattern: /\bIL[\s-]?17\b/i, value: "IL-17" },
  { pattern: /\bIL[\s-]?23\b/i, value: "IL-23" },
  { pattern: /\bIL[\s-]?4\b/i, value: "IL-4" },
  { pattern: /\bIL[\s-]?13\b/i, value: "IL-13" },
  { pattern: /\bIL[\s-]?33\b/i, value: "IL-33" },
  { pattern: /\bTGF[\s-]?(?:β|beta)\b/i, value: "TGF-beta" },
  { pattern: /\bNF[\s-]?(?:κB|kB)\b/i, value: "NF-kB" },
  // CD antigens
  { pattern: /\bCD19\b/i, value: "CD19" },
  { pattern: /\bCD20\b/i, value: "CD20" },
  { pattern: /\bCD22\b/i, value: "CD22" },
  { pattern: /\bCD33\b/i, value: "CD33" },
  { pattern: /\bCD38\b/i, value: "CD38" },
  { pattern: /\bCD47\b/i, value: "CD47" },
  { pattern: /\bCD3\b(?:\s+(?:T[\s-]?cell|receptor|complex|antibody|agonist))/i, value: "CD3" },
  // Metabolic
  { pattern: /\bGLP[\s-]?1R\b|\bGLP[\s-]?1\s+receptor\b/i, value: "GLP-1R" },
  { pattern: /\bGLP[\s-]?1\b|\bGlucagon[\s-]?like\s+peptide/i, value: "GLP-1" },
  { pattern: /\bPCSK9\b/i, value: "PCSK9" },
  { pattern: /\bAMPK\b/i, value: "AMPK" },
  // Signaling pathways
  { pattern: /\bWnt\b(?:\s+(?:pathway|signaling|receptor|target))/i, value: "Wnt" },
  { pattern: /\bNotch\b(?:\s+(?:pathway|signaling|receptor))/i, value: "Notch" },
  { pattern: /\bHedgehog\b|\bSHH\b(?:\s+(?:pathway|inhibitor))|\bSMO\b(?:\s+(?:receptor|inhibitor))/i, value: "Hedgehog/SHH" },
  // Chemokine receptors
  { pattern: /\bCXCR4\b/i, value: "CXCR4" },
  { pattern: /\bCCR5\b/i, value: "CCR5" },
  // Viral/infectious disease targets
  { pattern: /\bACE2\b/i, value: "ACE2" },
  { pattern: /\bNSP14\b/i, value: "NSP14" },
  { pattern: /\bSpike\s+(?:protein|glycoprotein)\b/i, value: "Spike protein" },
  // Hormone receptors
  { pattern: /\bandrogen\s+receptor\b|\bAR\b(?:\s+(?:splice|variant|pathway|signaling|v7|inhibitor|antagonist|LBD))/i, value: "androgen receptor" },
  { pattern: /\bestrogen\s+receptor\b|\bER[αβ]\b|\bESR1\b/i, value: "estrogen receptor" },
  // HIF
  { pattern: /\bHIF[\s-]?1[αa]\b|\bHIF[\s-]?2[αa]\b|\bHIF\b(?:\s+(?:pathway|inhibitor|alpha))/i, value: "HIF" },
  // SRC kinase
  { pattern: /\bSRC\b(?:\s+(?:kinase|pathway|family|inhibitor))/i, value: "SRC" },
  // Emerging solid tumor targets
  { pattern: /\bTROP[\s-]?2\b|\bTACSTD2\b/i, value: "TROP-2" },
  { pattern: /\bNECTIN[\s-]?4\b|\bPVRL4\b/i, value: "NECTIN-4" },
  { pattern: /\bFR[αa]\b|\bfolate\s+receptor\s+alpha\b|\bFOLR1\b/i, value: "FRα" },
  { pattern: /\bClaudin[\s-]?18\.2\b|\bCLDN18\.2\b|\bCLDN18A2\b/i, value: "Claudin 18.2" },
  { pattern: /\bCEACAM5\b|\bCEA\b(?:\s+(?:targeted|antigen|positive|expressing))/i, value: "CEACAM5" },
  { pattern: /\bMUC1\b|\bMUC16\b|\bCA[\s-]?125\b/i, value: "MUC1/MUC16" },
  { pattern: /\bMSLN\b|\bmesothelin\b/i, value: "Mesothelin" },
  { pattern: /\bGPC3\b|\bglypican[\s-]?3\b/i, value: "GPC3" },
  { pattern: /\bEGFRvIII\b|\bEGFR\s+variant\s+III\b/i, value: "EGFRvIII" },
  // CD antigens (extended)
  { pattern: /\bCD123\b|\bIL[\s-]?3R[αa]\b/i, value: "CD123" },
  { pattern: /\bCD30\b|\bTNFRSF8\b/i, value: "CD30" },
  { pattern: /\bCD70\b|\bTNFSF7\b/i, value: "CD70" },
  { pattern: /\bCD79[ab]\b|\bIg[αβ]\b/i, value: "CD79" },
  { pattern: /\bCD73\b|\bNT5E\b|\becto[\s-]?5['′][\s-]?nucleotidase\b/i, value: "CD73" },
  { pattern: /\bCD40\b|\bTNFRSF5\b/i, value: "CD40" },
  { pattern: /\bCD27\b|\bTNFRSF7\b/i, value: "CD27" },
  { pattern: /\bCD200\b|\bOX2\b/i, value: "CD200" },
  // Pain / ion channel targets
  { pattern: /\bNav[\s-]?1\.7\b|\bSCN9A\b/i, value: "Nav1.7" },
  { pattern: /\bNav[\s-]?1\.8\b|\bSCN10A\b/i, value: "Nav1.8" },
  { pattern: /\bTRPV1\b|\bvanilloid\s+receptor\b/i, value: "TRPV1" },
  { pattern: /\bTRPA1\b/i, value: "TRPA1" },
  { pattern: /\bP2X3\b|\bpurinergic\s+receptor\s+P2X3\b/i, value: "P2X3" },
  // Metabolic / liver targets
  { pattern: /\bACC[12]?\b|\bacetyl[\s-]?CoA\s+carboxylase\b/i, value: "ACC" },
  { pattern: /\bFASN\b|\bfatty\s+acid\s+synthase\b/i, value: "FASN" },
  { pattern: /\bSCD[\s-]?1\b|\bstearoyl[\s-]?CoA\s+desaturase\b/i, value: "SCD1" },
  { pattern: /\bFXR\b|\bfarnesoid\s+X\s+receptor\b/i, value: "FXR" },
  { pattern: /\bTHR[βb]\b|\bthyroid\s+hormone\s+receptor\s+beta\b/i, value: "THRβ" },
  { pattern: /\bPPAR[αγδ]?\b|\bperoxisome\s+proliferator.activated\s+receptor\b/i, value: "PPAR" },
  // Fibrosis targets
  { pattern: /\bLOXL2\b|\blysyl\s+oxidase[\s-]?like\s+2\b/i, value: "LOXL2" },
  { pattern: /\bgalectin[\s-]?3\b|\bGAL[\s-]?3\b/i, value: "Galectin-3" },
  { pattern: /\bCTGF\b|\bCCN2\b|\bconnective\s+tissue\s+growth\s+factor\b/i, value: "CTGF/CCN2" },
  // Adenosine / immune metabolism
  { pattern: /\bA2[Aa]R\b|\badenosine\s+A2[Aa]\s+receptor\b|\bADORA2A\b/i, value: "A2AR" },
  { pattern: /\bCD39\b|\bENTPD1\b/i, value: "CD39" },
  { pattern: /\bIDO1?\b|\bindoleamine\s+2,3[\s-]?dioxygenase\b/i, value: "IDO1" },
  { pattern: /\bTDO2?\b|\btryptophan\s+2,3[\s-]?dioxygenase\b/i, value: "TDO" },
  { pattern: /\bARG1\b|\barginase[\s-]?1\b/i, value: "Arginase-1" },
  // Neurodegeneration / CNS
  { pattern: /\bTREM2\b/i, value: "TREM2" },
  { pattern: /\bLRRK2\b|\bleucine[\s-]?rich\s+repeat\s+kinase\s+2\b/i, value: "LRRK2" },
  { pattern: /\bGBA\b|\bglucocerebrosidase\b/i, value: "GBA" },
  { pattern: /\bASCN[\s-]?4\b|\bsodium\s+channel\b(?:\s+(?:inhibitor|blocker|Nav))/i, value: "sodium channel" },
  // Complement (extended)
  { pattern: /\bC3\b(?:\s+(?:inhibitor|complement|convertase|fragment|blocker))/i, value: "C3" },
  { pattern: /\bC5\b(?:\s+(?:inhibitor|complement|convertase|fragment|blocker))/i, value: "C5" },
  { pattern: /\bfactor\s+[BD]\b|\bCFB\b|\bCFD\b|\bproperdin\b/i, value: "complement factor B/D" },
];

// ── Indication → Unmet Need lookup ──────────────────────────────────────────
// Maps canonical indication values to a concise clinical unmet need statement.
// Fills unmet_need where the LLM did not reach the asset. Zero cost.
const INDICATION_UNMET_NEED: Record<string, string> = {
  // Oncology — specific cancers
  "non-small cell lung cancer": "Acquired resistance to EGFR/ALK inhibitors and checkpoint immunotherapy limits durable responses; ~30% of patients lack an actionable driver mutation and have poor options beyond chemotherapy.",
  "small cell lung cancer": "Rapid resistance to platinum-etoposide chemotherapy and checkpoint inhibitors; 5-year survival under 7%; no curative treatment for extensive-stage disease.",
  "lung cancer": "Most patients present at advanced stage with limited curative options; systemic therapy resistance remains a major unmet need across subtypes.",
  "breast cancer": "Metastatic HER2-negative breast cancer has limited targeted options; triple-negative subtype lacks targeted therapy in most patients; brain metastases remain largely treatment-refractory.",
  "triple-negative breast cancer": "No approved targeted therapy for the majority of TNBC patients lacking PD-L1 expression or BRCA mutation; high recurrence rate after standard chemotherapy.",
  "colorectal cancer": "RAS-mutant colorectal cancer is ineligible for anti-EGFR therapy; liver metastases remain the primary cause of death; microsatellite-stable tumors are largely immunotherapy-resistant.",
  "pancreatic cancer": "5-year survival under 12%; most patients diagnosed at unresectable stage; gemcitabine-based regimens offer limited benefit and no targeted therapies approved for KRAS-wild-type disease.",
  "prostate cancer": "Metastatic castration-resistant prostate cancer remains incurable; AR splice variants (AR-V7) confer resistance to enzalutamide and abiraterone; limited options after second-line failure.",
  "ovarian cancer": "High recurrence rate after platinum-based chemotherapy; PARP inhibitor resistance emerges in most BRCA-mutated patients; no curative option for recurrent platinum-resistant disease.",
  "glioblastoma": "Median OS ~15 months despite surgery, temozolomide, and radiation; universal recurrence within 6–8 months; blood-brain barrier limits systemic drug delivery.",
  "glioma": "Lower-grade gliomas progress to high-grade disease; IDH-mutant gliomas lack approved targeted therapy beyond standard chemotherapy; recurrence is universal.",
  "melanoma": "Acquired resistance to BRAF/MEK inhibitors and checkpoint immunotherapy affects majority of metastatic patients; uveal melanoma is largely immunotherapy-resistant.",
  "hepatocellular carcinoma": "Majority of patients diagnosed at intermediate or advanced stage; response to systemic therapy remains low; liver function constraints limit treatment intensity.",
  "renal cell carcinoma": "Sarcomatoid/rhabdoid differentiation confers poor prognosis; non-clear cell subtypes lack approved targeted therapies; combination immunotherapy resistance mechanisms are poorly characterized.",
  "bladder cancer": "High recurrence rate in non-muscle-invasive disease requiring repeated surveillance; muscle-invasive disease has ~50% 5-year survival with standard cystectomy; cisplatin ineligibility excludes many patients.",
  "gastric cancer": "HER2-negative gastric cancer has limited targeted options; peritoneal metastasis is difficult to treat and common; most patients diagnosed at advanced stage.",
  "acute myeloid leukemia": "Refractory or relapsed AML has <10% long-term survival; elderly/unfit patients cannot tolerate intensive chemotherapy; TP53-mutant AML has very poor prognosis with any approved therapy.",
  "chronic lymphocytic leukemia": "BTK inhibitor resistance (C481S mutation) is emerging; Richter transformation to aggressive lymphoma has no standard effective therapy.",
  "multiple myeloma": "Triple-class refractory disease (anti-CD38, IMiD, PI-resistant) has median survival under 6 months; no curative treatment exists; CNS myeloma is largely treatment-refractory.",
  "diffuse large b-cell lymphoma": "~40% of patients are refractory to or relapse after first-line R-CHOP; CAR-T cell therapy access is limited by manufacturing time and cost; CNS relapse has no standard treatment.",
  // Metabolic / Endocrine
  "type 2 diabetes mellitus": "Progressive beta-cell failure limits durability of current therapies; cardiovascular and renal comorbidities drive mortality; significant treatment burden and non-adherence in insulin-dependent patients.",
  "type 1 diabetes mellitus": "Continuous insulin management burden and hypoglycemia risk persist despite closed-loop systems; autoimmune destruction is irreversible once established; no broadly available curative therapy.",
  "obesity": "Long-term weight maintenance after pharmacotherapy discontinuation is poor; current GLP-1 agonists require indefinite use; surgical options carry risk and are inaccessible to many patients.",
  "non-alcoholic steatohepatitis": "No approved therapy for the majority of NASH patients beyond lifestyle intervention; disease progression to cirrhosis and HCC is underdiagnosed; fibrosis reversal remains limited with current agents.",
  "non-alcoholic fatty liver disease": "Most patients are diagnosed incidentally; no approved pharmacotherapy for early-stage disease; progression to NASH and cirrhosis is a significant unmet risk.",
  // Neurological
  "alzheimer's disease": "Approved anti-amyloid therapies (lecanemab, donanemab) slow but do not stop progression; suitable only for early-stage patients; ARIA side effects limit use in many; tau and neuroinflammation pathways remain largely untreated.",
  "parkinson's disease": "Levodopa-related motor fluctuations and dyskinesias are poorly controlled long-term; no disease-modifying therapy exists; non-motor symptoms (cognitive decline, autonomic dysfunction) are undertreated.",
  "multiple sclerosis": "Progressive MS (PPMS/SPMS) has limited effective treatments; CNS repair and remyelination strategies remain investigational; therapies targeting neurodegeneration are absent.",
  "amyotrophic lateral sclerosis": "Median survival 2–5 years; riluzole and edaravone provide only marginal benefit; no therapy stops disease progression; SOD1-targeting antisense (tofersen) is limited to SOD1-mutant subset.",
  "huntington's disease": "No disease-modifying therapy approved; motor, cognitive, and psychiatric decline is progressive and universal in gene-positive individuals; huntingtin-lowering strategies remain investigational.",
  "epilepsy": "~30% of patients have drug-resistant epilepsy uncontrolled by available ASMs; surgical eligibility is limited; infantile-onset epilepsies (Dravet, LGS) have severe developmental consequences.",
  "traumatic brain injury": "No approved neuroprotective therapy; secondary injury cascade (edema, excitotoxicity) is a major driver of outcome; long-term neuropsychiatric sequelae lack effective treatment.",
  "stroke": "Thrombolytic window is narrow (≤4.5 hours); neuroprotective agents have failed in clinical trials; functional recovery after moderate-severe stroke is incomplete with current rehabilitation approaches.",
  // Psychiatric
  "schizophrenia": "~30% of patients have treatment-resistant disease; negative and cognitive symptoms respond poorly to dopamine antagonists; current antipsychotics have significant metabolic and EPS side-effect burden.",
  "major depressive disorder": "~30–40% of patients fail to achieve remission with two or more antidepressants (TRD); response can take 6–8 weeks; no reliable biomarkers predict treatment response.",
  "psychiatric disorder": "Psychiatric conditions collectively have among the highest disability-adjusted life-year burden globally; pharmacological options are often palliative and poorly tolerated long-term.",
  // Cardiovascular
  "heart failure": "HFpEF (preserved ejection fraction) has limited approved therapies beyond SGLT2 inhibitors; hospitalisation rates remain high; cardiac fibrosis is not therapeutically reversible.",
  "atrial fibrillation": "Rhythm control is difficult to maintain long-term; anticoagulation increases bleeding risk; catheter ablation has significant recurrence rates in persistent AF.",
  "hypertension": "Resistant hypertension (uncontrolled despite 3+ agents) affects ~10% of patients; uncontrolled hypertension drives cardiovascular and renal end-organ damage globally.",
  "coronary artery disease": "Residual cardiovascular risk persists despite optimal statin + antiplatelet therapy; vulnerable plaque detection and stabilisation remain unsolved; microvascular disease is undertreated.",
  "atherosclerosis": "Residual ASCVD risk in statin-treated patients is substantial; plaque regression beyond lipid-lowering is limited; vascular inflammation is not therapeutically targeted.",
  // Autoimmune / Immunological
  "rheumatoid arthritis": "~40% of patients are inadequate responders to TNF inhibitors; biologic-refractory RA has limited options; cardiovascular comorbidity is undertreated; remission is not achieved in many patients.",
  "crohn's disease": "Up to 50% of patients require surgery within 10 years; transmural healing is rarely achieved with current biologics; fistulising disease has no reliably effective pharmacotherapy.",
  "ulcerative colitis": "~25% of patients require colectomy; acute severe UC unresponsive to corticosteroids has high short-term mortality; mucosal healing is not achieved in many biologic-treated patients.",
  "inflammatory bowel disease": "Biologic non-response and loss of response are common; transmural and histological remission remain elusive; extra-intestinal manifestations are poorly controlled.",
  "psoriasis": "Moderate-to-severe psoriasis has significant quality-of-life burden beyond skin; psoriatic arthritis requires distinct management; biologics are costly and access-limited in many markets.",
  "systemic lupus erythematosus": "Lupus nephritis progresses to ESRD in ~10% of patients; flare management is suboptimal; organ damage accrual continues despite current DMARDs; CNS lupus is difficult to treat.",
  "atopic dermatitis": "Severe AD has significant itch and sleep burden; dupilumab non-responders (~30%) have limited alternatives; face and hand involvement impacts quality of life disproportionately.",
  "asthma": "Severe eosinophilic asthma unresponsive to biologics (~10%) has no approved therapy; Type-2 low (non-eosinophilic) asthma lacks effective targeted treatments; asthma-COPD overlap is undertreated.",
  "chronic obstructive pulmonary disease": "Exacerbation prevention remains inadequate despite triple inhaler therapy; lung function decline is not halted by any approved therapy; COPD-associated muscle wasting is not therapeutically addressed.",
  "idiopathic pulmonary fibrosis": "Nintedanib and pirfenidone slow but do not stop progression; median survival 2–3 years after diagnosis; no approved anti-fibrotic reverses established fibrosis.",
  "autoimmune disease": "Broad-acting immunosuppression increases infection and malignancy risk; disease-specific tolerance induction strategies are not clinically available; long-term remission off therapy is rare.",
  // Infectious
  "hiv infection": "HIV cure remains elusive; long-acting injectable regimens improve adherence but are still lifelong; CNS HIV reservoir is pharmacologically inaccessible; HIV-associated neurocognitive disorder is undertreated.",
  "hepatitis b": "Functional cure (HBsAg loss) is achieved in <5% with current nucleoside analogues; cccDNA and integrated HBV DNA are not eliminated; treatment must continue indefinitely in most patients.",
  "hepatitis c": "Globally, ~58 million people remain infected; access to pangenotypic DAAs is limited in low-income countries; reinfection after cure is not prevented by treatment.",
  "covid-19": "Immunocompromised patients have limited treatment response to antivirals; Long COVID lacks approved treatment; vaccine-resistant variants continue to emerge.",
  "tuberculosis": "Drug-resistant TB (MDR/XDR) requires prolonged regimens with significant toxicity; TB meningitis has high mortality and morbidity; latent TB reactivation in immunosuppressed patients is undertreated.",
  "sepsis": "28-day mortality remains 20–30% despite ICU care; no immunomodulatory therapy has shown survival benefit in broad sepsis populations; survivors frequently have long-term cognitive and physical impairment.",
  // Genetic / Rare Disease
  "cystic fibrosis": "Elexacaftor-tezacaftor-ivacaftor (Trikafta) is not effective for all CFTR mutation classes; ~10% of patients (non-F508del) lack approved CFTR modulator therapy; lung transplantation is the only option for end-stage disease.",
  "duchenne muscular dystrophy": "Exon-skipping therapies apply only to specific exon-amenable mutations; cardiac and respiratory failure remain the primary cause of death; no curative therapy restores dystrophin in most patients.",
  "spinal muscular atrophy": "Gene therapy (Zolgensma) is approved only up to age 2; older patients with established motor neuron loss do not recover lost function; treatment cost and access remain barriers globally.",
  "sickle cell disease": "Vaso-occlusive crises cause cumulative organ damage not fully prevented by current therapies; curative gene therapy approaches (Zynteglo, Lyfgenia) are limited by cost and access; chronic pain is undertreated.",
  "hemophilia": "Prophylaxis burden is high despite factor concentrate therapy; inhibitor development (~30% of severe HA) renders factor replacement ineffective; joint disease from recurrent bleeds is progressive.",
  // Renal
  "chronic kidney disease": "Progression to ESRD requires dialysis or transplant; no approved therapy restores lost nephrons; mineral and bone disorder and anemia management remain suboptimal in advanced CKD.",
  "renal disease": "Renal fibrosis is not reversible with current agents; proteinuria reduction with RAS inhibitors is incomplete; acute kidney injury-to-CKD transition lacks therapeutic prevention.",
  // Ophthalmic
  "age-related macular degeneration": "Anti-VEGF injections require frequent dosing (monthly/bimonthly) with patient burden; ~30% of wet AMD patients are poor responders; geographic atrophy (dry AMD) has very limited approved treatments.",
  "ocular disease": "Blood-retinal barrier limits drug delivery; ocular surface disease is frequently misdiagnosed; gene therapy delivery to the retina remains technically challenging.",
  // Musculoskeletal / Bone
  "osteoporosis": "High fracture risk in untreated or undertreated patients; anabolic therapies (romosozumab, teriparatide) have limited duration of use; vertebral fractures frequently go undiagnosed.",
  "osteoarthritis": "No disease-modifying therapy approved; joint replacement is the only definitive intervention for advanced disease; chronic pain management relies heavily on NSAIDs with GI/CV risk.",
  "musculoskeletal disorder": "Chronic musculoskeletal pain is frequently undertreated; structural damage in inflammatory arthropathies is not fully halted by available DMARDs; physical disability accrues progressively.",
  // Broader categories
  "cancer": "Most advanced solid tumors lack curative options; immunotherapy resistance affects the majority of patients; tumour heterogeneity and clonal evolution limit durability of targeted therapies.",
  "neurological disorder": "CNS drug delivery is limited by the blood-brain barrier; neurodegeneration is not halted by any approved therapy class; patient stratification for trial enrolment remains poor.",
  "cardiovascular disease": "Residual cardiovascular risk persists in optimally treated patients; heart failure with preserved ejection fraction (HFpEF) has limited approved therapies; cardiac fibrosis is not therapeutically reversible.",
  "metabolic disease": "Metabolic syndrome drives cardiovascular and renal comorbidities; weight regain after pharmacotherapy discontinuation is near-universal; behavioural interventions have poor long-term adherence.",
  "autoimmune disease": "Systemic immunosuppression increases infection and malignancy risk; disease-specific tolerance induction is not yet clinically available; many patients cycle through multiple biologics without sustained remission.",
  "infectious disease": "Antimicrobial resistance is growing; access to effective vaccines and therapeutics remains inequitable; latent infections (HIV, TB, HSV) cannot be eradicated with current therapies.",
  "respiratory disease": "Progressive lung function decline is not halted by any approved therapy; respiratory failure in ILD and COPD is irreversible; pulmonary hypertension complicating parenchymal disease is undertreated.",
  "hematological disorder": "Cure is limited to patients eligible for stem-cell transplant; gene therapy approaches are not yet broadly accessible; iron overload from chronic transfusion causes progressive organ damage.",
  "wound healing": "Chronic wounds (diabetic ulcers, pressure injuries) have high recurrence rates; current standard of care has limited efficacy in ischaemic wounds; wound-related amputations carry high mortality.",
  "renal cell carcinoma": "Sarcomatoid differentiation and non-clear cell histology have poor responses to approved IO/TKI combinations; brain metastases from RCC are common and undertreated.",
};

// ── Indication → Comparable Drugs lookup ────────────────────────────────────
// Maps canonical indication values (from INDICATION_RULES) to key approved /
// late-stage drugs in that space. Zero cost — derived from structured fields only.
const INDICATION_COMPARABLE_DRUGS: Record<string, string> = {
  // Specific cancers
  "non-small cell lung cancer": "osimertinib (Tagrisso), pembrolizumab (Keytruda), nivolumab (Opdivo), sotorasib (Lumakras), alectinib (Alecensa), lorlatinib (Lorbrena)",
  "small cell lung cancer": "atezolizumab (Tecentriq), durvalumab (Imfinzi), etoposide, carboplatin",
  "lung cancer": "pembrolizumab (Keytruda), osimertinib (Tagrisso), bevacizumab (Avastin), carboplatin, pemetrexed",
  "breast cancer": "trastuzumab (Herceptin), palbociclib (Ibrance), ribociclib (Kisqali), fulvestrant (Faslodex), sacituzumab govitecan (Trodelvy)",
  "triple-negative breast cancer": "pembrolizumab (Keytruda), sacituzumab govitecan (Trodelvy), olaparib (Lynparza), atezolizumab (Tecentriq)",
  "colorectal cancer": "bevacizumab (Avastin), cetuximab (Erbitux), pembrolizumab (Keytruda), oxaliplatin, irinotecan",
  "pancreatic cancer": "gemcitabine, nab-paclitaxel (Abraxane), erlotinib (Tarceva), olaparib (Lynparza)",
  "prostate cancer": "enzalutamide (Xtandi), abiraterone (Zytiga), darolutamide (Nubeqa), olaparib (Lynparza), lutetium-177 PSMA (Pluvicto)",
  "ovarian cancer": "olaparib (Lynparza), niraparib (Zejula), bevacizumab (Avastin), carboplatin, paclitaxel",
  "glioblastoma": "temozolomide (Temodar), bevacizumab (Avastin), lomustine",
  "glioma": "temozolomide (Temodar), bevacizumab (Avastin), lomustine",
  "melanoma": "pembrolizumab (Keytruda), nivolumab (Opdivo), ipilimumab (Yervoy), dabrafenib + trametinib, vemurafenib (Zelboraf)",
  "hepatocellular carcinoma": "sorafenib (Nexavar), lenvatinib (Lenvima), atezolizumab + bevacizumab (Tecentriq + Avastin), nivolumab (Opdivo)",
  "renal cell carcinoma": "nivolumab + ipilimumab (Opdualag), pembrolizumab + axitinib (Keytruda + Inlyta), sunitinib (Sutent), cabozantinib (Cabometyx)",
  "bladder cancer": "atezolizumab (Tecentriq), pembrolizumab (Keytruda), enfortumab vedotin (Padcev), cisplatin",
  "gastric cancer": "trastuzumab (Herceptin), pembrolizumab (Keytruda), ramucirumab (Cyramza), fluorouracil",
  "acute myeloid leukemia": "venetoclax (Venclexta), azacitidine (Vidaza), midostaurin (Rydapt), gilteritinib (Xospata), ivosidenib (Tibsovo)",
  "chronic lymphocytic leukemia": "ibrutinib (Imbruvica), zanubrutinib (Brukinsa), acalabrutinib (Calquence), venetoclax (Venclexta), obinutuzumab (Gazyva)",
  "multiple myeloma": "lenalidomide (Revlimid), bortezomib (Velcade), daratumumab (Darzalex), carfilzomib (Kyprolis), pomalidomide (Pomalyst)",
  "diffuse large b-cell lymphoma": "rituximab (Rituxan), polatuzumab vedotin (Polivy), axicabtagene ciloleucel (Yescarta), tisagenlecleucel (Kymriah)",
  // Metabolic / Endocrine
  "type 2 diabetes mellitus": "semaglutide (Ozempic), tirzepatide (Mounjaro), empagliflozin (Jardiance), metformin, sitagliptin (Januvia)",
  "type 1 diabetes mellitus": "insulin glargine (Lantus), insulin degludec (Tresiba), teplizumab (Tzield)",
  "obesity": "semaglutide (Wegovy), tirzepatide (Zepbound), orlistat (Xenical), naltrexone-bupropion (Contrave)",
  "non-alcoholic steatohepatitis": "resmetirom (Rezdiffra), semaglutide (Ozempic), lanifibranor, obeticholic acid",
  "non-alcoholic fatty liver disease": "resmetirom (Rezdiffra), semaglutide, vitamin E, pioglitazone",
  // Neurological
  "alzheimer's disease": "lecanemab (Leqembi), donanemab (Kisunla), donepezil (Aricept), memantine (Namenda), galantamine",
  "parkinson's disease": "levodopa-carbidopa (Sinemet), pramipexole (Mirapex), ropinirole (Requip), rasagiline (Azilect), safinamide (Xadago)",
  "multiple sclerosis": "ocrelizumab (Ocrevus), natalizumab (Tysabri), siponimod (Mayzent), ozanimod (Zeposia), ofatumumab (Kesimpta)",
  "amyotrophic lateral sclerosis": "riluzole (Rilutek), edaravone (Radicava), tofersen (Qalsody)",
  "huntington's disease": "deutetrabenazine (Austedo), tetrabenazine (Xenazine), valbenazine (Ingrezza)",
  "epilepsy": "levetiracetam (Keppra), lamotrigine (Lamictal), valproate, lacosamide (Vimpat), cenobamate (Xcopri)",
  "traumatic brain injury": "mannitol, hypertonic saline, levetiracetam (Keppra)",
  "stroke": "alteplase (tPA), tenecteplase (TNKase), aspirin, clopidogrel, ticagrelor",
  // Psychiatric
  "schizophrenia": "risperidone, olanzapine, quetiapine, aripiprazole (Abilify), clozapine, xanomeline-trospium (Cobenfy)",
  "major depressive disorder": "sertraline, escitalopram, venlafaxine, duloxetine, bupropion, esketamine (Spravato)",
  "psychiatric disorder": "risperidone, quetiapine, fluoxetine, sertraline, lithium",
  // Cardiovascular
  "heart failure": "sacubitril-valsartan (Entresto), empagliflozin (Jardiance), dapagliflozin (Farxiga), carvedilol, spironolactone",
  "atrial fibrillation": "apixaban (Eliquis), rivaroxaban (Xarelto), dabigatran (Pradaxa), amiodarone, flecainide",
  "hypertension": "lisinopril, amlodipine, losartan, metoprolol, hydrochlorothiazide, sacubitril-valsartan (Entresto)",
  "coronary artery disease": "atorvastatin, aspirin, clopidogrel, ticagrelor (Brilinta), ezetimibe, inclisiran (Leqvio)",
  "atherosclerosis": "atorvastatin, evolocumab (Repatha), alirocumab (Praluent), inclisiran (Leqvio), ezetimibe",
  // Autoimmune / Immunological
  "rheumatoid arthritis": "adalimumab (Humira), etanercept (Enbrel), tocilizumab (Actemra), baricitinib (Olumiant), upadacitinib (Rinvoq)",
  "crohn's disease": "adalimumab (Humira), infliximab (Remicade), ustekinumab (Stelara), vedolizumab (Entyvio), risankizumab (Skyrizi)",
  "ulcerative colitis": "mesalamine, infliximab (Remicade), vedolizumab (Entyvio), tofacitinib (Xeljanz), upadacitinib (Rinvoq)",
  "inflammatory bowel disease": "mesalamine, infliximab (Remicade), adalimumab (Humira), vedolizumab (Entyvio), ustekinumab (Stelara)",
  "psoriasis": "adalimumab (Humira), secukinumab (Cosentyx), ixekizumab (Taltz), guselkumab (Tremfya), deucravacitinib (Sotyktu)",
  "systemic lupus erythematosus": "belimumab (Benlysta), anifrolumab (Saphnelo), hydroxychloroquine (Plaquenil), mycophenolate",
  "atopic dermatitis": "dupilumab (Dupixent), tralokinumab (Adbry), abrocitinib (Cibinqo), upadacitinib (Rinvoq), baricitinib (Olumiant)",
  "asthma": "dupilumab (Dupixent), mepolizumab (Nucala), benralizumab (Fasenra), tezepelumab (Tezspire), omalizumab (Xolair)",
  "chronic obstructive pulmonary disease": "tiotropium (Spiriva), indacaterol, roflumilast (Daliresp), tezepelumab (Tezspire)",
  "idiopathic pulmonary fibrosis": "nintedanib (Ofev), pirfenidone (Esbriet)",
  "autoimmune disease": "adalimumab (Humira), methotrexate, hydroxychloroquine, mycophenolate, prednisone",
  // Infectious
  "hiv infection": "bictegravir (Biktarvy), dolutegravir (Tivicay), cabotegravir + rilpivirine (Cabenuva), lenacapavir (Sunlenca)",
  "hepatitis b": "entecavir (Baraclude), tenofovir (Viread), pegylated interferon alfa-2a, bulevirtide (Hepcludex)",
  "hepatitis c": "sofosbuvir-velpatasvir (Epclusa), glecaprevir-pibrentasvir (Mavyret), ledipasvir-sofosbuvir (Harvoni)",
  "covid-19": "nirmatrelvir-ritonavir (Paxlovid), molnupiravir (Lagevrio), remdesivir (Veklury)",
  "tuberculosis": "isoniazid, rifampicin, pyrazinamide, ethambutol, pretomanid, bedaquiline (Sirturo)",
  "sepsis": "vancomycin, piperacillin-tazobactam (Zosyn), meropenem, norepinephrine",
  "infectious disease": "amoxicillin, azithromycin, ceftriaxone, vancomycin, piperacillin-tazobactam",
  // Genetic / Rare Disease
  "cystic fibrosis": "elexacaftor-tezacaftor-ivacaftor (Trikafta), ivacaftor (Kalydeco)",
  "duchenne muscular dystrophy": "eteplirsen (Exondys 51), golodirsen (Vyondys 53), delandistrogene moxeparvovec (Elevidys)",
  "spinal muscular atrophy": "nusinersen (Spinraza), risdiplam (Evrysdi), onasemnogene abeparvovec (Zolgensma)",
  "sickle cell disease": "hydroxyurea, voxelotor (Oxbryta), crizanlizumab (Adakveo), betibeglogene (Zynteglo)",
  "hemophilia": "emicizumab (Hemlibra), fitusiran (Alhemo), factor VIII/IX concentrates, desmopressin",
  // Renal
  "chronic kidney disease": "dapagliflozin (Farxiga), finerenone (Kerendia), erythropoietin, semaglutide",
  "renal disease": "dapagliflozin (Farxiga), finerenone (Kerendia), erythropoietin, losartan",
  // Ophthalmic
  "age-related macular degeneration": "ranibizumab (Lucentis), aflibercept (Eylea), faricimab (Vabysmo), brolucizumab (Beovu)",
  "ocular disease": "ranibizumab (Lucentis), aflibercept (Eylea), latanoprost, timolol",
  // Musculoskeletal / Bone
  "osteoporosis": "alendronate (Fosamax), zoledronic acid (Reclast), denosumab (Prolia), romosozumab (Evenity), teriparatide (Forteo)",
  "osteoarthritis": "celecoxib, intra-articular corticosteroids, intra-articular hyaluronic acid, tanezumab",
  "musculoskeletal disorder": "NSAIDs (celecoxib), methotrexate, adalimumab (Humira), zoledronic acid",
  // Dermatology
  "dermatological condition": "dupilumab (Dupixent), secukinumab (Cosentyx), apremilast (Otezla), isotretinoin",
  "wound healing": "becaplermin (Regranex), platelet-rich plasma, negative pressure wound therapy",
  // General buckets
  "cancer": "pembrolizumab (Keytruda), nivolumab (Opdivo), trastuzumab (Herceptin), bevacizumab (Avastin)",
  "neurological disorder": "levetiracetam, memantine (Namenda), methylphenidate, riluzole",
  "cardiovascular disease": "atorvastatin, aspirin, metoprolol, lisinopril, amlodipine",
  "metabolic disease": "metformin, semaglutide (Ozempic), empagliflozin (Jardiance), atorvastatin",
  "respiratory disease": "budesonide, salmeterol, tiotropium (Spiriva), montelukast",
  "gastrointestinal disease": "mesalamine, infliximab (Remicade), adalimumab (Humira), pantoprazole",
  "hematological disorder": "hydroxyurea, thalidomide, lenalidomide (Revlimid), rituximab (Rituxan)",
  "point-of-care diagnostics": "lateral flow immunoassays, PCR-based diagnostics, biosensor platforms",
  "hearing loss": "cochlear implant systems, hearing aids (Oticon, ReSound)",
};

// ── Target → Comparable Drugs lookup ────────────────────────────────────────
// Maps canonical target values (from TARGET_RULES) to flagship approved drugs.
const TARGET_COMPARABLE_DRUGS: Record<string, string> = {
  "PD-1": "nivolumab (Opdivo), pembrolizumab (Keytruda)",
  "PD-L1": "atezolizumab (Tecentriq), durvalumab (Imfinzi), avelumab (Bavencio)",
  "CTLA-4": "ipilimumab (Yervoy), tremelimumab (Imjudo)",
  "LAG-3": "relatlimab (Opdualag)",
  "TIGIT": "vibostolimab, tiragolumab",
  "TIM-3": "cobolimab, sabatolimab",
  "4-1BB": "utomilumab, urelumab",
  "OX40": "pogalizumab, tavolixizumab",
  "EGFR": "erlotinib (Tarceva), gefitinib (Iressa), osimertinib (Tagrisso), cetuximab (Erbitux)",
  "HER2": "trastuzumab (Herceptin), pertuzumab (Perjeta), ado-trastuzumab emtansine (Kadcyla), tucatinib (Tukysa)",
  "HER3": "patritumab deruxtecan (HER3-DXd), zenocutuzumab",
  "VEGF": "bevacizumab (Avastin)",
  "VEGFR": "sorafenib (Nexavar), sunitinib (Sutent), axitinib (Inlyta), cabozantinib (Cabometyx)",
  "KRAS": "sotorasib (Lumakras), adagrasib (Krazati)",
  "BRAF": "vemurafenib (Zelboraf), dabrafenib (Tafinlar)",
  "MEK": "trametinib (Mekinist), cobimetinib (Cotellic), binimetinib (Mektovi)",
  "NRAS": "binimetinib (Mektovi)",
  "ALK": "crizotinib (Xalkori), alectinib (Alecensa), lorlatinib (Lorbrena), brigatinib (Alunbrig)",
  "RET": "selpercatinib (Retevmo), pralsetinib (Gavreto)",
  "ROS1": "crizotinib (Xalkori), entrectinib (Rozlytrek), repotrectinib (Augtyro)",
  "NTRK": "larotrectinib (Vitrakvi), entrectinib (Rozlytrek)",
  "MET": "tepotinib (Tepmetko), capmatinib (Tabrecta), crizotinib (Xalkori)",
  "FGFR": "erdafitinib (Balversa), infigratinib (Truseltiq), futibatinib (Lytgobi)",
  "IGF-1R": "teprotumumab (Tepezza), ganitumab",
  "BCR-ABL": "imatinib (Gleevec), dasatinib (Sprycel), nilotinib (Tasigna), asciminib (Scemblix)",
  "CDK4/6": "palbociclib (Ibrance), ribociclib (Kisqali), abemaciclib (Verzenio)",
  "CDK": "palbociclib (Ibrance), ribociclib (Kisqali), abemaciclib (Verzenio)",
  "PI3K": "idelalisib (Zydelig), copanlisib (Aliqopa), alpelisib (Piqray), duvelisib (Copiktra)",
  "mTOR": "everolimus (Afinitor), temsirolimus (Torisel)",
  "AKT": "capivasertib (Truqap), ipatasertib",
  "PARP": "olaparib (Lynparza), rucaparib (Rubraca), niraparib (Zejula), talazoparib (Talzenna)",
  "ATR": "elimusertib, camonsertib, ceralasertib",
  "BTK": "ibrutinib (Imbruvica), zanubrutinib (Brukinsa), acalabrutinib (Calquence), pirtobrutinib (Jaypirca)",
  "IDH1": "ivosidenib (Tibsovo), olutasidenib (Rezlidhia)",
  "IDH2": "enasidenib (Idhifa)",
  "FLT3": "midostaurin (Rydapt), gilteritinib (Xospata), quizartinib (Vanflyta)",
  "EZH2": "tazemetostat (Tazverik)",
  "HDAC": "vorinostat (Zolinza), romidepsin (Istodax), panobinostat (Farydak), belinostat (Beleodaq)",
  "BET/BRD4": "molibresib, birabresib",
  "DNMT": "azacitidine (Vidaza), decitabine (Dacogen)",
  "BCL-2": "venetoclax (Venclexta)",
  "BCL-XL": "navitoclax",
  "MDM2": "idasanutlin, navtemadlin, milademetan",
  "TP53/p53": "APR-246 (eprenetapopt), APG-115",
  "MYC": "OMO-103, VVD-159247",
  "STAT3": "napabucasin, danvatirsen",
  "CD19": "blinatumomab (Blincyto), tisagenlecleucel (Kymriah), axicabtagene ciloleucel (Yescarta)",
  "CD20": "rituximab (Rituxan), obinutuzumab (Gazyva), ofatumumab (Arzerra), mosunetuzumab (Lunsumio)",
  "CD22": "inotuzumab ozogamicin (Besylomab), moxetumomab pasudotox (Lumoxiti)",
  "CD33": "gemtuzumab ozogamicin (Mylotarg)",
  "CD38": "daratumumab (Darzalex), isatuximab (Sarclisa)",
  "CD47": "magrolimab, lemzoparlimab",
  "CD3": "blinatumomab (Blincyto), catumaxomab",
  "TNF-alpha": "adalimumab (Humira), etanercept (Enbrel), infliximab (Remicade), golimumab (Simponi), certolizumab pegol (Cimzia)",
  "IL-6": "tocilizumab (Actemra), sarilumab (Kevzara), siltuximab (Sylvant)",
  "IL-1": "anakinra (Kineret), canakinumab (Ilaris), rilonacept (Arcalyst)",
  "IL-17": "secukinumab (Cosentyx), ixekizumab (Taltz), bimekizumab (Bimzelx)",
  "IL-23": "guselkumab (Tremfya), risankizumab (Skyrizi), tildrakizumab (Ilumya)",
  "IL-4": "dupilumab (Dupixent — dual IL-4/IL-13 blockade)",
  "IL-13": "dupilumab (Dupixent), tralokinumab (Adbry), lebrikizumab (Ebglyss)",
  "IL-33": "itepekimab, tozorakimab",
  "TGF-beta": "bintrafusp alfa, fresolimumab",
  "NF-kB": "bortezomib (Velcade), carfilzomib (Kyprolis)",
  "JAK1": "upadacitinib (Rinvoq), filgotinib (Jyseleca), abrocitinib (Cibinqo)",
  "JAK2": "ruxolitinib (Jakafi), fedratinib (Inrebic), pacritinib (Vonjo)",
  "JAK3": "tofacitinib (Xeljanz)",
  "GLP-1R": "semaglutide (Ozempic/Wegovy), liraglutide (Victoza), tirzepatide (Mounjaro — dual GLP-1R/GIPR)",
  "GLP-1": "semaglutide (Ozempic/Wegovy), tirzepatide (Mounjaro), liraglutide (Victoza)",
  "PCSK9": "evolocumab (Repatha), alirocumab (Praluent), inclisiran (Leqvio)",
  "androgen receptor": "enzalutamide (Xtandi), apalutamide (Erleada), darolutamide (Nubeqa), abiraterone (Zytiga)",
  "estrogen receptor": "fulvestrant (Faslodex), tamoxifen, letrozole (Femara), anastrozole (Arimidex), elacestrant (Orserdu)",
  "HIF": "belzutifan (Welireg)",
  "BRCA1": "olaparib (Lynparza), rucaparib (Rubraca) — for BRCA1-associated cancers",
  "BRCA2": "olaparib (Lynparza), talazoparib (Talzenna) — for BRCA2-associated cancers",
  "Wnt": "porcupine inhibitors WNT-974, RXC004",
  "Hedgehog/SHH": "vismodegib (Erivedge), sonidegib (Odomzo)",
  "CXCR4": "plerixafor (Mozobil)",
  "CCR5": "maraviroc (Selzentry)",
  "Spike protein": "nirmatrelvir-ritonavir (Paxlovid), monoclonal antibodies (bebtelovimab, cilgavimab)",
  "SRC": "dasatinib (Sprycel), bosutinib (Bosulif)",
};

// ── Indication → Biology lookup ──────────────────────────────────────────────
// Maps canonical indication → biology domain. Fills biology where LLM hasn't reached.
const INDICATION_BIOLOGY: Record<string, string> = {
  // Oncology — specific
  "non-small cell lung cancer": "thoracic oncology",
  "small cell lung cancer": "thoracic oncology",
  "lung cancer": "thoracic oncology",
  "breast cancer": "breast oncology",
  "triple-negative breast cancer": "breast oncology",
  "colorectal cancer": "gastrointestinal oncology",
  "pancreatic cancer": "gastrointestinal oncology",
  "prostate cancer": "genitourinary oncology",
  "ovarian cancer": "gynecologic oncology",
  "glioblastoma": "neuro-oncology",
  "glioma": "neuro-oncology",
  "melanoma": "dermatologic oncology",
  "hepatocellular carcinoma": "hepatic oncology",
  "renal cell carcinoma": "genitourinary oncology",
  "bladder cancer": "genitourinary oncology",
  "gastric cancer": "gastrointestinal oncology",
  "acute myeloid leukemia": "hematologic oncology",
  "chronic lymphocytic leukemia": "hematologic oncology",
  "multiple myeloma": "hematologic oncology",
  "diffuse large b-cell lymphoma": "hematologic oncology",
  "cancer": "oncology",
  // Metabolic / Endocrine
  "type 2 diabetes mellitus": "metabolic disease",
  "type 1 diabetes mellitus": "metabolic disease",
  "obesity": "metabolic disease",
  "non-alcoholic steatohepatitis": "hepatology / metabolic disease",
  "non-alcoholic fatty liver disease": "hepatology / metabolic disease",
  "metabolic disease": "metabolic disease",
  // Neurological
  "alzheimer's disease": "neurodegeneration",
  "parkinson's disease": "neurodegeneration",
  "amyotrophic lateral sclerosis": "neurodegeneration",
  "huntington's disease": "neurodegeneration",
  "multiple sclerosis": "neuroimmunology",
  "epilepsy": "neurology",
  "traumatic brain injury": "neurology",
  "stroke": "neurovascular",
  "neurological disorder": "neurology",
  // Psychiatric
  "schizophrenia": "psychiatry",
  "major depressive disorder": "psychiatry",
  "psychiatric disorder": "psychiatry",
  // Cardiovascular
  "heart failure": "cardiology",
  "atrial fibrillation": "cardiology",
  "hypertension": "cardiology",
  "coronary artery disease": "cardiology",
  "atherosclerosis": "cardiology / vascular biology",
  "cardiovascular disease": "cardiology",
  // Autoimmune / Immunological
  "rheumatoid arthritis": "rheumatology / immunology",
  "crohn's disease": "gastroenterology / immunology",
  "ulcerative colitis": "gastroenterology / immunology",
  "inflammatory bowel disease": "gastroenterology / immunology",
  "psoriasis": "dermatology / immunology",
  "systemic lupus erythematosus": "rheumatology / immunology",
  "atopic dermatitis": "dermatology / immunology",
  "asthma": "pulmonology / immunology",
  "chronic obstructive pulmonary disease": "pulmonology",
  "idiopathic pulmonary fibrosis": "pulmonology / fibrosis",
  "autoimmune disease": "immunology",
  "respiratory disease": "pulmonology",
  // Infectious
  "hiv infection": "infectious disease / virology",
  "hepatitis b": "infectious disease / hepatology",
  "hepatitis c": "infectious disease / hepatology",
  "covid-19": "infectious disease / virology",
  "tuberculosis": "infectious disease",
  "sepsis": "infectious disease / critical care",
  "infectious disease": "infectious disease",
  // Genetic / Rare
  "cystic fibrosis": "rare disease / pulmonology",
  "duchenne muscular dystrophy": "rare disease / neuromuscular",
  "spinal muscular atrophy": "rare disease / neuromuscular",
  "sickle cell disease": "rare disease / hematology",
  "hemophilia": "rare disease / hematology",
  "hematological disorder": "hematology",
  // Renal
  "chronic kidney disease": "nephrology",
  "renal disease": "nephrology",
  // Ophthalmic
  "age-related macular degeneration": "ophthalmology",
  "ocular disease": "ophthalmology",
  // Musculoskeletal / Bone
  "osteoporosis": "musculoskeletal / bone biology",
  "osteoarthritis": "musculoskeletal",
  "musculoskeletal disorder": "musculoskeletal",
  // Other
  "gastrointestinal disease": "gastroenterology",
  "dermatological condition": "dermatology",
  "wound healing": "regenerative medicine",
  "point-of-care diagnostics": "diagnostics",
  "neonatal screening": "pediatrics / diagnostics",
  "hearing loss": "otolaryngology",
  "surgical application": "surgery",
  "medical imaging diagnostics": "radiology / imaging",
  "urological condition": "urology",
  "reproductive health": "reproductive medicine",
};

// ── Target → Biology lookup ───────────────────────────────────────────────────
// Maps canonical target values to biology domain. Fills biology when indication is absent.
const TARGET_BIOLOGY: Record<string, string> = {
  // Checkpoint / IO
  "PD-1": "immuno-oncology",
  "PD-L1": "immuno-oncology",
  "PD-L2": "immuno-oncology",
  "CTLA-4": "immuno-oncology",
  "LAG-3": "immuno-oncology",
  "TIM-3": "immuno-oncology",
  "TIGIT": "immuno-oncology",
  "4-1BB": "immuno-oncology",
  "OX40": "immuno-oncology",
  // RTK / growth factor receptors
  "EGFR": "oncology / RTK signaling",
  "HER2": "oncology / RTK signaling",
  "HER3": "oncology / RTK signaling",
  "EGFRvIII": "neuro-oncology",
  "VEGF": "oncology / angiogenesis",
  "VEGFR": "oncology / angiogenesis",
  "FGFR": "oncology / RTK signaling",
  "MET": "oncology / RTK signaling",
  "IGF-1R": "oncology / metabolic signaling",
  // RAS/RAF/MAPK
  "KRAS": "oncology / MAPK signaling",
  "BRAF": "oncology / MAPK signaling",
  "NRAS": "oncology / MAPK signaling",
  "MEK": "oncology / MAPK signaling",
  "ERK": "oncology / MAPK signaling",
  // Fusion/rearrangement
  "ALK": "thoracic oncology",
  "RET": "oncology / kinase fusion",
  "ROS1": "oncology / kinase fusion",
  "NTRK": "oncology / kinase fusion",
  "BCR-ABL": "hematologic oncology",
  // Oncogenes / tumor suppressors
  "MYC": "oncology / transcription factor",
  "TP53/p53": "oncology / tumor suppression",
  "BRCA1": "oncology / DNA repair",
  "BRCA2": "oncology / DNA repair",
  "PTEN": "oncology / PI3K-AKT signaling",
  // Epigenetic
  "EZH2": "oncology / epigenetics",
  "HDAC": "oncology / epigenetics",
  "BET/BRD4": "oncology / epigenetics",
  "DNMT": "oncology / epigenetics",
  // Cell cycle
  "CDK4/6": "oncology / cell cycle",
  "CDK": "oncology / cell cycle",
  // PI3K/AKT/mTOR
  "PI3K": "oncology / PI3K-AKT-mTOR signaling",
  "mTOR": "oncology / PI3K-AKT-mTOR signaling",
  "AKT": "oncology / PI3K-AKT-mTOR signaling",
  // JAK/STAT
  "JAK1": "immunology / JAK-STAT signaling",
  "JAK2": "immunology / JAK-STAT signaling",
  "JAK3": "immunology / JAK-STAT signaling",
  "STAT3": "immuno-oncology",
  // DNA damage
  "PARP": "oncology / DNA damage response",
  "ATR": "oncology / DNA damage response",
  "ATM": "oncology / DNA damage response",
  // Apoptosis
  "BCL-2": "oncology / apoptosis",
  "BCL-XL": "oncology / apoptosis",
  "MDM2": "oncology / apoptosis",
  // Heme / leukemia
  "BTK": "hematologic oncology",
  "IDH1": "hematologic oncology",
  "IDH2": "hematologic oncology",
  "FLT3": "hematologic oncology",
  "CD123": "hematologic oncology",
  "CD30": "hematologic oncology",
  "CD70": "hematologic oncology",
  "CD79": "hematologic oncology",
  "CD19": "hematologic oncology / B-cell biology",
  "CD20": "hematologic oncology / B-cell biology",
  "CD22": "hematologic oncology / B-cell biology",
  "CD33": "hematologic oncology",
  "CD38": "hematologic oncology",
  // Solid tumor antigens
  "TROP-2": "oncology / tumor antigen",
  "NECTIN-4": "oncology / tumor antigen",
  "FRα": "oncology / tumor antigen",
  "Claudin 18.2": "gastrointestinal oncology",
  "CEACAM5": "gastrointestinal oncology",
  "MUC1/MUC16": "oncology / tumor antigen",
  "Mesothelin": "oncology / tumor antigen",
  "GPC3": "hepatic oncology",
  // IO / angiogenesis
  "CD47": "immuno-oncology",
  "HIF": "oncology / hypoxia biology",
  // Cytokines / inflammation
  "TNF-alpha": "immunology / inflammation",
  "IL-6": "immunology / inflammation",
  "IL-1": "immunology / inflammation",
  "IL-17": "immunology / inflammation",
  "IL-23": "immunology / inflammation",
  "IL-4": "immunology / allergy",
  "IL-13": "immunology / allergy",
  "IL-33": "immunology / allergy",
  "TGF-beta": "immunology / fibrosis",
  "NF-kB": "immunology / inflammation",
  "CD40": "immunology",
  "CD27": "immunology",
  "CD200": "immunology",
  // Adenosine / immune metabolism
  "A2AR": "immuno-oncology / adenosine biology",
  "CD39": "immuno-oncology / adenosine biology",
  "IDO1": "immuno-oncology / immune metabolism",
  "TDO": "immuno-oncology / immune metabolism",
  "Arginase-1": "immuno-oncology / immune metabolism",
  "CD73": "immuno-oncology / adenosine biology",
  // Metabolic
  "GLP-1R": "metabolic disease / endocrinology",
  "GLP-1": "metabolic disease / endocrinology",
  "PCSK9": "cardiology / lipid metabolism",
  "AMPK": "metabolic disease",
  "ACC": "hepatology / metabolic disease",
  "FASN": "hepatology / metabolic disease",
  "SCD1": "hepatology / metabolic disease",
  "FXR": "hepatology / metabolic disease",
  "THRβ": "hepatology / metabolic disease",
  "PPAR": "metabolic disease",
  // Fibrosis
  "LOXL2": "fibrosis / tissue remodeling",
  "Galectin-3": "fibrosis / tissue remodeling",
  "CTGF/CCN2": "fibrosis / tissue remodeling",
  // Signaling / developmental
  "Wnt": "oncology / developmental biology",
  "Notch": "oncology / developmental biology",
  "Hedgehog/SHH": "oncology / developmental biology",
  "SRC": "oncology / kinase signaling",
  // Chemokine receptors
  "CXCR4": "oncology / immunology",
  "CCR5": "infectious disease / immunology",
  // Viral targets
  "ACE2": "infectious disease / virology",
  "NSP14": "infectious disease / virology",
  "Spike protein": "infectious disease / virology",
  // Hormone receptors
  "androgen receptor": "genitourinary oncology",
  "estrogen receptor": "breast oncology",
  // Neurodegeneration / CNS
  "TREM2": "neurodegeneration",
  "LRRK2": "neurodegeneration",
  "GBA": "neurodegeneration",
  "sodium channel": "neurology / pain biology",
  // Pain / ion channel
  "Nav1.7": "neurology / pain biology",
  "Nav1.8": "neurology / pain biology",
  "TRPV1": "neurology / pain biology",
  "TRPA1": "neurology / pain biology",
  "P2X3": "neurology / pain biology",
};

// ── Modality → Biology lookup ─────────────────────────────────────────────────
// Last-resort fill for biology when indication and target are both absent.
// Modality is 99.9% filled so this catches nearly all remaining gaps.
const MODALITY_BIOLOGY: Record<string, string> = {
  "gene editing": "gene editing / genome engineering",
  "cell therapy": "cell therapy / immunology",
  "gene therapy": "gene therapy / genetic medicine",
  "mrna": "RNA biology / mRNA therapeutics",
  "rna therapy": "RNA biology",
  "vaccine": "immunology / vaccinology",
  "antibody": "protein biology / immunology",
  "small molecule": "medicinal chemistry",
  "peptide": "peptide biology",
  "nanoparticle": "drug delivery / nanotechnology",
  "biologic": "protein biology",
  "diagnostic": "diagnostics / biomarker science",
  "medical device": "biomedical engineering",
  "software/algorithm": "health informatics",
};

// ── Category → Modality map ───────────────────────────────────────────────────
// Uses stored categories[] to provide structured modality signal before text rules.
const CATEGORY_MODALITY_MAP: Array<{ keywords: RegExp; value: string }> = [
  { keywords: /\bgene[\s-]?edit|\bcrispr/i, value: "gene editing" },
  { keywords: /\bCAR[\s-]?T|car-t/i, value: "cell therapy" },
  { keywords: /\bcell[\s-]?therap/i, value: "cell therapy" },
  { keywords: /\bgene[\s-]?therap/i, value: "gene therapy" },
  { keywords: /\bsiRNA\b|RNAi\b|\bantisense/i, value: "rna therapy" },
  { keywords: /\bmRNA\b/i, value: "mrna" },
  { keywords: /\bvaccine/i, value: "vaccine" },
  { keywords: /\bantibod|\bmAb\b|monoclonal/i, value: "antibody" },
  { keywords: /\bsmall[\s-]?molecule/i, value: "small molecule" },
  { keywords: /\bnanoparticle|nanotechnology|nanomedicine/i, value: "nanoparticle" },
  { keywords: /\bpeptide/i, value: "peptide" },
  { keywords: /\bdiagnostic|biomarker|imaging\s+agent/i, value: "diagnostic" },
  { keywords: /\bmedical\s+device|device\s+(?:technology|platform)/i, value: "medical device" },
  { keywords: /\bsoftware\b|algorithm\b|machine\s+learning|artificial\s+intelligence/i, value: "software/algorithm" },
];

// ── Category → Indication map ─────────────────────────────────────────────────
// Provides coarse indication from categories when no specific disease text is found.
// NOTE: categories are a structural/first-party signal — this map runs outside the
// dataSparse gate so thin-text assets with institution-tagged categories still benefit.
const CATEGORY_INDICATION_MAP: Array<{ keywords: RegExp; value: string }> = [
  { keywords: /\boncology|\bcancer/i, value: "cancer" },
  { keywords: /\bneurology|\bneuroscience|\bneurological|\bneurodegenera/i, value: "neurological disorder" },
  { keywords: /\bcardiovascular|\bcardiology|\bcardiac/i, value: "cardiovascular disease" },
  { keywords: /\binfectious[\s-]?disease|\bvirology|\bbacteriology|\bantimicrobial/i, value: "infectious disease" },
  { keywords: /\bmetabolic[\s-]?disease|\bdiabetes|\bendocrinology/i, value: "metabolic disease" },
  { keywords: /\bimmunology|\bautoimmune|\brheumatology|\binflammation/i, value: "autoimmune disease" },
  { keywords: /\bpulmonary|\brespiratory/i, value: "respiratory disease" },
  { keywords: /\bophthalmology|\bocular/i, value: "ocular disease" },
  { keywords: /\bdermatology/i, value: "dermatological condition" },
  { keywords: /\bmusculoskeletal|\borthopedic/i, value: "musculoskeletal disorder" },
  { keywords: /\bnephrology|\brenal[\s-]?disease|\bkidney[\s-]?disease/i, value: "renal disease" },
  { keywords: /\bgastrointestinal|\bgastroenterology/i, value: "gastrointestinal disease" },
  { keywords: /\bhematology|\bblood[\s-]?disease/i, value: "hematological disorder" },
  { keywords: /\bwound[\s-]?heal|\bregenerative\s+medicine|\btissue\s+engineer/i, value: "wound healing" },
  { keywords: /\bpsychiatry|\bmental\s+health|\bpsychiatric/i, value: "psychiatric disorder" },
  { keywords: /\burology|\burological/i, value: "urological condition" },
  { keywords: /\breproductive\s+health|\bfertility|\bobstetrics|\bgynecology|\bgynecolog/i, value: "reproductive health" },
  { keywords: /\bsurgery|\bsurgical/i, value: "surgical application" },
  { keywords: /\bmedical\s+imaging|\bradiology|\bnuclear\s+medicine/i, value: "medical imaging diagnostics" },
];

// ── Indication keyword rules ──────────────────────────────────────────────────
const INDICATION_RULES: Array<{ pattern: RegExp; value: string }> = [
  // ── Device / diagnostic / broad clinical applications ────────────────────
  // These go first so specific device/tool assets are not skipped by isDrug gate.
  { pattern: /\bhearing\s+(?:loss|impairment|screening|disorder)\b|\bauditory\s+(?:loss|impairment|screening)\b|\botoacoustic\b|\baudiolog\w+/i, value: "hearing loss" },
  { pattern: /\brenal\s+function\b|\bkidney\s+function\b|\bglomerular\s+filtration\b|\bGFR\b(?!\s*\w*receptor)/i, value: "renal disease" },
  { pattern: /\btraumatic\s+brain\s+injury\b|\bTBI\b|\bconcussion\b|\bhead\s+(?:injury|trauma)\b/i, value: "traumatic brain injury" },
  { pattern: /\bischemic\s+stroke\b|\bhemorrhagic\s+stroke\b|\bstroke\s+(?:treatment|detection|diagnosis|monitoring|rehabilitation)\b/i, value: "stroke" },
  { pattern: /\bsepsis\b|\bseptic\s+shock\b|\bbacteremia\b/i, value: "sepsis" },
  { pattern: /\borthopedic\b|\bbone\s+(?:fracture|repair|regeneration|healing|defect)\b|\bjoint\s+(?:replacement|repair)\b|\bspinal\s+(?:cord\s+injury|fusion|stenosis)\b/i, value: "musculoskeletal disorder" },
  { pattern: /\bwound\s+(?:healing|care|closure|management)\b|\bchronic\s+wound\b|\bskin\s+(?:regeneration|graft|repair)\b/i, value: "wound healing" },
  { pattern: /\bintraoperative\b|\bsurgical\s+(?:guidance|navigation|tool|device|robot|imaging|planning)\b|\bminimally\s+invasive\s+surgery\b/i, value: "surgical application" },
  { pattern: /\bpoint[- ]of[- ]care\b|\brapid\s+(?:diagnostic|test|detection|assay)\b|\bbedside\s+(?:monitoring|test|diagnostic)\b/i, value: "point-of-care diagnostics" },
  { pattern: /\bneonatal\s+(?:screening|diagnosis|monitoring|care)\b|\bnewborn\s+screening\b/i, value: "neonatal screening" },
  // ── Specific cancers ─────────────────────────────────────────────────────
  { pattern: /\bnon-small\s+cell\s+lung\s+cancer\b|\bnsclc\b/i, value: "non-small cell lung cancer" },
  { pattern: /\bsmall\s+cell\s+lung\s+cancer\b|\bsclc\b/i, value: "small cell lung cancer" },
  { pattern: /\blung\s+cancer\b|\blung\s+carcinoma\b|\blung\s+adenocarcinoma\b/i, value: "lung cancer" },
  { pattern: /\bbreast\s+cancer\b|\bbreast\s+carcinoma\b/i, value: "breast cancer" },
  { pattern: /\btriple.negative\s+breast\b|\btnbc\b/i, value: "triple-negative breast cancer" },
  { pattern: /\bcolorectal\s+cancer\b|\bcolon\s+cancer\b|\brectal\s+cancer\b/i, value: "colorectal cancer" },
  { pattern: /\bpancreatic\s+cancer\b|\bpdac\b|\bpancreatic\s+ductal\b/i, value: "pancreatic cancer" },
  { pattern: /\bprostate\s+cancer\b|\bcrpc\b|\bcastration.resistant\s+prostate\b/i, value: "prostate cancer" },
  { pattern: /\bovarian\s+cancer\b|\bovarian\s+carcinoma\b/i, value: "ovarian cancer" },
  { pattern: /\bglioblastoma\b|\bgbm\b|\bhigh.grade\s+glioma\b/i, value: "glioblastoma" },
  { pattern: /\bglioma\b/i, value: "glioma" },
  { pattern: /\bmelanoma\b/i, value: "melanoma" },
  { pattern: /\bhepatocellular\s+carcinoma\b|\bhcc\b|\bliver\s+cancer\b/i, value: "hepatocellular carcinoma" },
  { pattern: /\brenal\s+cell\s+carcinoma\b|\brcc\b|\bkidney\s+cancer\b/i, value: "renal cell carcinoma" },
  { pattern: /\bbladder\s+cancer\b|\burothelial\s+carcinoma\b/i, value: "bladder cancer" },
  { pattern: /\bgastric\s+cancer\b|\bstomach\s+cancer\b/i, value: "gastric cancer" },
  { pattern: /\bacute\s+myeloid\s+leukemia\b|\baml\b/i, value: "acute myeloid leukemia" },
  { pattern: /\bchronic\s+lymphocytic\s+leukemia\b|\bcll\b/i, value: "chronic lymphocytic leukemia" },
  { pattern: /\bmultiple\s+myeloma\b/i, value: "multiple myeloma" },
  { pattern: /\bdiffuse\s+large\s+b.cell\s+lymphoma\b|\bdlbcl\b/i, value: "diffuse large b-cell lymphoma" },
  { pattern: /\btype\s+2\s+diabetes\b|\bt2dm\b|\bt2d\b/i, value: "type 2 diabetes mellitus" },
  { pattern: /\btype\s+1\s+diabetes\b|\bt1dm\b|\bt1d\b/i, value: "type 1 diabetes mellitus" },
  { pattern: /\bobesity\b|\boverweight\b/i, value: "obesity" },
  { pattern: /\bnash\b|\bnon.alcoholic\s+steatohepatitis\b/i, value: "non-alcoholic steatohepatitis" },
  { pattern: /\bnafld\b|\bnon.alcoholic\s+fatty\s+liver\b/i, value: "non-alcoholic fatty liver disease" },
  { pattern: /\balzheimer.s?\s+disease\b|\balzheimer\b/i, value: "alzheimer's disease" },
  { pattern: /\bparkinson.s?\s+disease\b|\bparkinson\b/i, value: "parkinson's disease" },
  { pattern: /\bamyotrophic\s+lateral\s+sclerosis\b|\bmotor\s+neuron\s+disease\b|\bALS\b[^.!?\n]{0,60}\b(?:motor\s+neuron|neurodegenerative|riluzole|amyotrophic)\b|\b(?:motor\s+neuron|neurodegenerative|riluzole|amyotrophic)\b[^.!?\n]{0,60}\bALS\b/i, value: "amyotrophic lateral sclerosis" },
  { pattern: /\bmultiple\s+sclerosis\b/i, value: "multiple sclerosis" },
  { pattern: /\bhuntington.s?\s+disease\b/i, value: "huntington's disease" },
  { pattern: /\bepilep\w+\b|\bseizure\s+disorder\b/i, value: "epilepsy" },
  { pattern: /\bschizophrenia\b/i, value: "schizophrenia" },
  { pattern: /\bmajor\s+depressive\s+disorder\b|\bdepressive\s+disorder\b|\bclinical\s+depression\b|\bantidepressant\b|\btreat\w*\s+depression\b|\bdepression\s+treatment\b|\bdepressive\s+episode\b|\bmdd\b/i, value: "major depressive disorder" },
  { pattern: /\bheart\s+failure\b|\bcardiac\s+failure\b|\bchf\b/i, value: "heart failure" },
  { pattern: /\batrial\s+fibrillation\b|\bafib\b/i, value: "atrial fibrillation" },
  { pattern: /\bhypertension\b|\bhigh\s+blood\s+pressure\b/i, value: "hypertension" },
  { pattern: /\bcoronary\s+artery\s+disease\b|\bCAD\b[^.!?\n]{0,60}\b(?:coronary|cardiac|atherosclerosis|plaque|cardiovascular)\b|\b(?:coronary|cardiac|atherosclerosis|plaque|cardiovascular)\b[^.!?\n]{0,60}\bCAD\b/i, value: "coronary artery disease" },
  { pattern: /\batherosclerosis\b/i, value: "atherosclerosis" },
  { pattern: /\brheumatoid\s+arthritis\b/i, value: "rheumatoid arthritis" },
  { pattern: /\bcrohn.s?\s+disease\b/i, value: "crohn's disease" },
  { pattern: /\bulcerative\s+colitis\b/i, value: "ulcerative colitis" },
  { pattern: /\binflammatory\s+bowel\s+disease\b|\bibd\b/i, value: "inflammatory bowel disease" },
  { pattern: /\bpsoriasis\b/i, value: "psoriasis" },
  { pattern: /\bsystemic\s+lupus\b|\bsle\b/i, value: "systemic lupus erythematosus" },
  { pattern: /\batopic\s+dermatitis\b|\beczema\b/i, value: "atopic dermatitis" },
  { pattern: /\basthma\b/i, value: "asthma" },
  { pattern: /\bcopd\b|\bchronic\s+obstructive\s+pulmonary\b/i, value: "chronic obstructive pulmonary disease" },
  { pattern: /\bidiopathic\s+pulmonary\s+fibrosis\b|\bipf\b/i, value: "idiopathic pulmonary fibrosis" },
  { pattern: /\bHIV\s+(?:infection|disease|positive|status|patient|treatment|therap)\b|\bHIV[-\s]infected\b|\banti(?:retroviral)\b|\bHAART\b|\bAIDS\b.*\b(?:infect|patient|treatment|therap)\b|\b(?:infect|patient|treatment|therap)\b.*\bAIDS\b/i, value: "hiv infection" },
  { pattern: /\bhepatitis\s+b\b|\bhbv\b/i, value: "hepatitis b" },
  { pattern: /\bhepatitis\s+c\b|\bhcv\b/i, value: "hepatitis c" },
  { pattern: /\bcovid.19\b|\bsars.cov.2\b/i, value: "covid-19" },
  { pattern: /\btuberculosis\b/i, value: "tuberculosis" },
  { pattern: /\bcystic\s+fibrosis\b/i, value: "cystic fibrosis" },
  { pattern: /\bduchenne\s+muscular\s+dystrophy\b|\bdmd\b/i, value: "duchenne muscular dystrophy" },
  { pattern: /\bspinal\s+muscular\s+atrophy\b|\bSMA\b[^.!?\n]{0,60}\b(?:spinal\s+muscular|motor\s+neuron|nusinersen|risdiplam)\b|\b(?:spinal\s+muscular|motor\s+neuron|nusinersen|risdiplam)\b[^.!?\n]{0,60}\bSMA\b/i, value: "spinal muscular atrophy" },
  { pattern: /\bsickle\s+cell\s+disease\b|\bsickle\s+cell\s+anemia\b/i, value: "sickle cell disease" },
  { pattern: /\bhemophilia\b/i, value: "hemophilia" },
  { pattern: /\bchronic\s+kidney\s+disease\b|\bckd\b/i, value: "chronic kidney disease" },
  { pattern: /\bage.related\s+macular\s+degeneration\b|\bamd\b|\bmacular\s+degeneration\b/i, value: "age-related macular degeneration" },
  { pattern: /\bosteoporosis\b/i, value: "osteoporosis" },
  { pattern: /\bosteoarthritis\b/i, value: "osteoarthritis" },
];

// Heuristic: does the text look like it describes a drug/biologic?
const DRUG_SIGNALS = /\bdrug\b|\btherapeu\w+\b|\btreatment\b|\btherapy\b|\bclinical\s+trial\b|\bIND\b|\bsmall\s+molecule\b|\bantibody\b|\bbiologic\b|\bvaccine\b|\bRNAi\b|\bsiRNA\b|\bgene\s+therapy\b|\bcell\s+therapy\b|\bCAR.T\b|\bmodality\b|\bpharmaceu\w+\b/i;

function looksLikeDrug(text: string): boolean {
  return DRUG_SIGNALS.test(text);
}

function applyRules(rules: Array<{ pattern: RegExp; value: string }>, text: string): string | null {
  for (const rule of rules) {
    if (rule.pattern.test(text)) return rule.value;
  }
  return null;
}

function applyCategoriesToModality(categories: string[]): string | null {
  const joined = categories.join(" ");
  for (const rule of CATEGORY_MODALITY_MAP) {
    if (rule.keywords.test(joined)) return rule.value;
  }
  return null;
}

function applyCategoriesToIndication(categories: string[]): string | null {
  const joined = categories.join(" ");
  for (const rule of CATEGORY_INDICATION_MAP) {
    if (rule.keywords.test(joined)) return rule.value;
  }
  return null;
}

export interface RuleFillSummary {
  processed: number;
  filled: number;
  fieldsWritten: number;
  byField: Record<string, number>;
  dataSparseTagged: number;
}

const SPARSE_THRESHOLD = 150;

export function applyRulesToAsset(asset: {
  id: number;
  assetName?: string | null;
  summary: string;
  abstract: string | null;
  developmentStage: string;
  ipType: string | null;
  licensingReadiness: string | null;
  indication: string | null;
  modality?: string | null;
  target?: string | null;
  categories?: string[] | null;
  humanVerified: Record<string, boolean> | null;
  sourceType?: string | null;
  deepEnrichAttempts?: number | null;
  comparableDrugs?: string | null;
  unmetNeed?: string | null;
  patentStatus?: string | null;
  mechanismOfAction?: string | null;
  biology?: string | null;
}): { fields: Record<string, string>; dataSparse: boolean; provenance: Record<string, string> } {
  // Include MOA in text so TARGET_RULES can match against it (e.g. "PARP inhibitor" → PARP)
  const text = [(asset.assetName ?? ""), (asset.summary ?? ""), (asset.abstract ?? ""), (asset.mechanismOfAction ?? "")].join(" ");
  const humanV = asset.humanVerified ?? {};
  const fields: Record<string, string> = {};
  // provenance tracks the enrichment_sources stamp per field (defaults to "rule")
  const provenance: Record<string, string> = {};
  const isDrug = looksLikeDrug(text);
  const dataSparse = text.trim().length < SPARSE_THRESHOLD;
  const cats = asset.categories ?? [];

  // ── TTO source rule: listing IS proof of licensing availability ────────────
  // Applies even to data-sparse assets — sourceType is a structural signal,
  // not a content signal, so it works regardless of description length.
  if (asset.sourceType === "tech_transfer" &&
      !humanV.licensingReadiness &&
      (!asset.licensingReadiness || asset.licensingReadiness === "unknown")) {
    fields.licensingReadiness = "available";
    provenance.licensingReadiness = "rule:tto_source";
  }

  // ── Category-based fills: structural signal, applies regardless of text length ──
  // Institution-tagged categories are first-party metadata from the TTO portal —
  // they apply even if the description text is thin (< 150 chars). Text-pattern
  // rules inside the dataSparse gate may later override these with more specific values.
  if (cats.length > 0) {
    if (!humanV.modality && (!asset.modality || asset.modality === "unknown")) {
      const fromCats = applyCategoriesToModality(cats);
      if (fromCats) { fields.modality = fromCats; provenance.modality = "rule:category"; }
    }
    if (!humanV.indication && (!asset.indication || asset.indication === "unknown")) {
      const fromCats = applyCategoriesToIndication(cats);
      if (fromCats) { fields.indication = fromCats; provenance.indication = "rule:category"; }
    }
  }

  if (!dataSparse) {
    if (!humanV.developmentStage && asset.developmentStage === "unknown") {
      const val = applyRules(STAGE_RULES, text);
      if (val) fields.developmentStage = val;
    }
    if (!humanV.ipType && (!asset.ipType || asset.ipType === "unknown")) {
      const val = applyRules(IP_RULES, text);
      if (val) fields.ipType = val;
    }
    if (!humanV.licensingReadiness && (!asset.licensingReadiness || asset.licensingReadiness === "unknown") && !fields.licensingReadiness) {
      const val = applyRules(LICENSING_RULES, text);
      if (val) fields.licensingReadiness = val;
    }

    // ── Modality: text rules (category fill already handled above) ────────────
    // Text rules are more specific — they can override the category-based fill.
    if (!humanV.modality && (!asset.modality || asset.modality === "unknown")) {
      const val = applyRules(MODALITY_RULES, text);
      if (val) { fields.modality = val; provenance.modality = "rule"; }
    }

    // ── Indication: text rules are more specific, can override category fill ──
    // Indication (25 pts in scoring) is too valuable to gate behind isDrug —
    // devices, diagnostics, and tools all have clinical applications that map
    // to indication.
    if (!humanV.indication && (!asset.indication || asset.indication === "unknown")) {
      const fromText = applyRules(INDICATION_RULES, text);
      if (fromText) { fields.indication = fromText; provenance.indication = "rule"; }
    }

    // ── Target: gene/protein name vocabulary scan ─────────────────────────────
    // Skip for diagnostics, medical devices, and software — target attribution
    // for those asset types causes false positives (e.g. "EGFR diagnostic assay"
    // should not have its target set to EGFR).
    if (!humanV.target && (!asset.target || asset.target === "unknown")) {
      const effectiveModality = (fields.modality ?? asset.modality ?? "").toLowerCase();
      const isNonTherapeutic = /^(diagnostic|medical device|software\/algorithm|research tool)$/.test(effectiveModality);
      if (!isNonTherapeutic) {
        const val = applyRules(TARGET_RULES, text);
        if (val) fields.target = val;
      }
    }
  }

  // ── Unmet need: indication lookup ────────────────────────────────────────────
  if (!asset.unmetNeed || asset.unmetNeed.trim() === "") {
    const ind = (fields.indication ?? asset.indication ?? "").toLowerCase().trim();
    if (ind && ind !== "unknown") {
      const fromInd = INDICATION_UNMET_NEED[ind];
      if (fromInd) { fields.unmetNeed = fromInd; provenance.unmetNeed = "rule:indication"; }
    }
  }

  // ── Comparable drugs: indication lookup (highest confidence) ─────────────────
  // Uses the canonical indication value (already structured) for a zero-cost fill.
  if (!asset.comparableDrugs || asset.comparableDrugs.trim() === "") {
    const ind = (fields.indication ?? asset.indication ?? "").toLowerCase().trim();
    if (ind && ind !== "unknown") {
      const fromInd = INDICATION_COMPARABLE_DRUGS[ind];
      if (fromInd) { fields.comparableDrugs = fromInd; provenance.comparableDrugs = "rule:indication"; }
    }
  }

  // ── Comparable drugs: target lookup (fills remainder after indication pass) ──
  if (!fields.comparableDrugs && (!asset.comparableDrugs || asset.comparableDrugs.trim() === "")) {
    const tgt = (fields.target ?? asset.target ?? "").trim();
    if (tgt && tgt !== "unknown") {
      const fromTarget = TARGET_COMPARABLE_DRUGS[tgt];
      if (fromTarget) { fields.comparableDrugs = fromTarget; provenance.comparableDrugs = "rule:target"; }
    }
  }

  // ── ip_type from patent_status (structural signal, no text needed) ────────────
  if (!humanV.ipType && (!asset.ipType || asset.ipType === "unknown") && !fields.ipType) {
    const ps = (asset.patentStatus ?? "").toLowerCase();
    if (ps === "patented" || ps === "granted") {
      fields.ipType = "patented";
      provenance.ipType = "rule:patent_status";
    } else if (ps === "pending" || ps === "filed") {
      fields.ipType = "patent pending";
      provenance.ipType = "rule:patent_status";
    }
  }

  // ── Biology: indication → target → modality cascade ─────────────────────────
  // Indication is highest confidence (disease-specific), target second (mechanism-specific),
  // modality third (broadest — catches everything modality is 99.9% filled).
  if (!humanV.biology && (!asset.biology || asset.biology.trim() === "")) {
    const ind = (fields.indication ?? asset.indication ?? "").toLowerCase().trim();
    if (ind && ind !== "unknown") {
      const fromInd = INDICATION_BIOLOGY[ind];
      if (fromInd) { fields.biology = fromInd; provenance.biology = "rule:indication"; }
    }
  }
  if (!humanV.biology && (!asset.biology || asset.biology.trim() === "") && !fields.biology) {
    const tgt = (fields.target ?? asset.target ?? "").trim();
    if (tgt && tgt !== "unknown") {
      const fromTarget = TARGET_BIOLOGY[tgt];
      if (fromTarget) { fields.biology = fromTarget; provenance.biology = "rule:target"; }
    }
  }
  if (!humanV.biology && (!asset.biology || asset.biology.trim() === "") && !fields.biology) {
    const mod = (fields.modality ?? asset.modality ?? "").toLowerCase().trim();
    if (mod && mod !== "unknown") {
      const fromModality = MODALITY_BIOLOGY[mod];
      if (fromModality) { fields.biology = fromModality; provenance.biology = "rule:modality"; }
    }
  }

  // ── Modality normalizer: "device" → "medical device" ─────────────────────────
  // Catch-all that converts the bare "device" string (often from LLM output or
  // stale scraped data) to the canonical "medical device" label. Runs after all
  // text and category rules so it applies to both newly-filled and pre-existing values.
  if (!humanV.modality) {
    const effectiveModality = (fields.modality ?? asset.modality ?? "").toLowerCase().trim();
    if (effectiveModality === "device") {
      fields.modality = "medical device";
      provenance.modality = provenance.modality ?? "rule:normalize";
    }
  }

  // ── Early stage TTO default ──────────────────────────────────────────────────
  // Applies AFTER text-based stage rules so text clues always win.
  // "early stage" is an umbrella for TTO assets where we know the technology is
  // pre-clinical but can't distinguish discovery from preclinical. Safer than
  // forcing "preclinical" (which implies animal data) or leaving "unknown".
  //
  // Eligibility: TTO asset with unknown stage, no clinical keywords, AND either:
  //   (a) dataSparse (thin-text asset where LLM enrichment can't do better), OR
  //   (b) deepEnrichAttempts >= 2 (LLM tried at least twice and still returned unknown)
  //
  // This ensures richer assets with enough text but genuine stage ambiguity are NOT
  // prematurely defaulted — they remain unknown until LLM enrichment has had a fair shot.
  const CLINICAL_STAGE_SIGNALS = /\bphase\s+[123]\b|\bphase\s+I{1,3}\b|\bclinical\s+trial\b|\bIND\s+(?:filed|approved)\b|\bFDA[- ]approved\b|\bEMA[- ]approved\b|\b510\(k\)\b|\bapproved\b|\bBLA\b|\bNDA\b/i;
  const enrichAttempts = asset.deepEnrichAttempts ?? 0;
  const stageThinOrExhausted = dataSparse || enrichAttempts >= 2;
  if (
    asset.sourceType === "tech_transfer" &&
    !humanV.developmentStage &&
    (!asset.developmentStage || asset.developmentStage === "unknown") &&
    !fields.developmentStage &&
    stageThinOrExhausted &&
    !CLINICAL_STAGE_SIGNALS.test(text)
  ) {
    fields.developmentStage = "early stage";
    provenance.developmentStage = "rule:tto_early_stage";
  }

  return { fields, dataSparse, provenance };
}

export async function runRuleBasedFill(
  onProgress?: (processed: number, total: number, filled: number) => void,
  abortCheck?: () => boolean,
): Promise<RuleFillSummary> {
  const rows = await db.execute<{
    id: number;
    asset_name: string;
    summary: string;
    abstract: string | null;
    development_stage: string;
    ip_type: string | null;
    licensing_readiness: string | null;
    indication: string;
    modality: string | null;
    target: string | null;
    categories: string[] | null;
    human_verified: Record<string, boolean> | null;
    source_type: string | null;
    deep_enrich_attempts: number | null;
    comparable_drugs: string | null;
    unmet_need: string | null;
    patent_status: string | null;
    mechanism_of_action: string | null;
    biology: string | null;
  }>(sql`
    SELECT id, asset_name, summary, abstract, development_stage, ip_type, licensing_readiness,
           indication, modality, target, categories, human_verified, source_type, deep_enrich_attempts,
           comparable_drugs, unmet_need, patent_status, mechanism_of_action, biology
    FROM ingested_assets
    WHERE relevant = true
      AND (
        development_stage IS NULL OR development_stage = 'unknown'
        OR ip_type IS NULL OR ip_type = 'unknown'
        OR licensing_readiness IS NULL OR licensing_readiness = 'unknown'
        OR indication IS NULL OR indication = 'unknown'
        OR modality IS NULL OR modality = 'unknown' OR modality = 'device'
        OR target IS NULL OR target = 'unknown'
        OR comparable_drugs IS NULL OR comparable_drugs = ''
        OR unmet_need IS NULL OR unmet_need = ''
        OR biology IS NULL OR biology = ''
        OR data_sparse IS NULL
      )
    ORDER BY id ASC
  `);

  const total = rows.rows.length;
  let processed = 0;
  let filled = 0;
  let dataSparseTagged = 0;
  const byField: Record<string, number> = {};
  const WRITE_BATCH = 50;
  const toWrite: Array<{ id: number; fields: Record<string, string>; dataSparse: boolean; provenance?: Record<string, string> }> = [];

  for (const row of rows.rows) {
    if (abortCheck?.()) break;

    const { fields, dataSparse, provenance } = applyRulesToAsset({
      id: row.id,
      assetName: row.asset_name,
      summary: row.summary,
      abstract: row.abstract,
      developmentStage: row.development_stage,
      ipType: row.ip_type,
      licensingReadiness: row.licensing_readiness,
      indication: row.indication,
      modality: row.modality,
      target: row.target,
      categories: row.categories,
      humanVerified: row.human_verified,
      sourceType: row.source_type,
      deepEnrichAttempts: row.deep_enrich_attempts,
      comparableDrugs: row.comparable_drugs,
      unmetNeed: row.unmet_need,
      patentStatus: row.patent_status,
      mechanismOfAction: row.mechanism_of_action,
      biology: row.biology,
    });

    if (Object.keys(fields).length > 0 || dataSparse) {
      toWrite.push({ id: row.id, fields, dataSparse, provenance });
      if (Object.keys(fields).length > 0) filled++;
      if (dataSparse) dataSparseTagged++;
      for (const k of Object.keys(fields)) byField[k] = (byField[k] ?? 0) + 1;
    }

    processed++;
    onProgress?.(processed, total, filled);

    if (toWrite.length >= WRITE_BATCH) {
      await flushWrites(toWrite.splice(0, toWrite.length));
    }
  }

  if (toWrite.length > 0) await flushWrites(toWrite);

  return { processed, filled, fieldsWritten: Object.values(byField).reduce((a, b) => a + b, 0), byField, dataSparseTagged };
}

type RuleFillUpdateSet = {
  dataSparse: boolean;
  developmentStage?: string;
  ipType?: string;
  licensingReadiness?: string;
  indication?: string;
  modality?: string;
  target?: string;
  comparableDrugs?: string;
  unmetNeed?: string;
  biology?: string;
  enrichmentSources?: SQL;
};

async function flushWrites(
  batch: Array<{ id: number; fields: Record<string, string>; dataSparse: boolean; provenance?: Record<string, string> }>,
): Promise<void> {
  for (const item of batch) {
    try {
      const fieldKeys = Object.keys(item.fields);
      const updates: RuleFillUpdateSet = { dataSparse: item.dataSparse };

      if (item.fields.developmentStage) updates.developmentStage = item.fields.developmentStage;
      if (item.fields.ipType) updates.ipType = item.fields.ipType;
      if (item.fields.licensingReadiness) updates.licensingReadiness = item.fields.licensingReadiness;
      if (item.fields.indication) updates.indication = item.fields.indication;
      if (item.fields.modality) updates.modality = item.fields.modality;
      if (item.fields.target) updates.target = item.fields.target;
      if (item.fields.comparableDrugs) updates.comparableDrugs = item.fields.comparableDrugs;
      if (item.fields.unmetNeed) updates.unmetNeed = item.fields.unmetNeed;
      if (item.fields.biology) updates.biology = item.fields.biology;

      if (fieldKeys.length > 0) {
        // Use per-field provenance when available (e.g. "rule:tto_source"), fall back to "rule"
        const prov = item.provenance ?? {};
        const sourcesJson = JSON.stringify(Object.fromEntries(fieldKeys.map(k => [k, prov[k] ?? "rule"])));
        updates.enrichmentSources = sql`COALESCE(${ingestedAssets.enrichmentSources}, '{}'::jsonb) || ${sourcesJson}::jsonb`;
      }

      await db.update(ingestedAssets).set(updates).where(eq(ingestedAssets.id, item.id));
    } catch (e) {
      console.error(`[ruleBasedFill] write failed for asset ${item.id}:`, e);
    }
  }
}

export async function estimateRuleBasedFill(): Promise<{
  total: number;
  fillable: number;
  byField: Record<string, number>;
  dataSparseCount: number;
}> {
  const rows = await db.execute<{
    id: number;
    asset_name: string;
    summary: string;
    abstract: string | null;
    development_stage: string;
    ip_type: string | null;
    licensing_readiness: string | null;
    indication: string;
    modality: string | null;
    target: string | null;
    categories: string[] | null;
    human_verified: Record<string, boolean> | null;
    source_type: string | null;
    deep_enrich_attempts: number | null;
    comparable_drugs: string | null;
    unmet_need: string | null;
    patent_status: string | null;
    mechanism_of_action: string | null;
    biology: string | null;
  }>(sql`
    SELECT id, asset_name, summary, abstract, development_stage, ip_type, licensing_readiness,
           indication, modality, target, categories, human_verified, source_type, deep_enrich_attempts,
           comparable_drugs, unmet_need, patent_status, mechanism_of_action, biology
    FROM ingested_assets
    WHERE relevant = true
      AND (
        development_stage IS NULL OR development_stage = 'unknown'
        OR ip_type IS NULL OR ip_type = 'unknown'
        OR licensing_readiness IS NULL OR licensing_readiness = 'unknown'
        OR indication IS NULL OR indication = 'unknown'
        OR modality IS NULL OR modality = 'unknown' OR modality = 'device'
        OR target IS NULL OR target = 'unknown'
        OR comparable_drugs IS NULL OR comparable_drugs = ''
        OR unmet_need IS NULL OR unmet_need = ''
        OR biology IS NULL OR biology = ''
        OR data_sparse IS NULL
      )
    ORDER BY id ASC
  `);

  let fillable = 0;
  let dataSparseCount = 0;
  const byField: Record<string, number> = {};

  for (const row of rows.rows) {
    const { fields, dataSparse } = applyRulesToAsset({
      id: row.id,
      assetName: row.asset_name,
      summary: row.summary,
      abstract: row.abstract,
      developmentStage: row.development_stage,
      ipType: row.ip_type,
      licensingReadiness: row.licensing_readiness,
      indication: row.indication,
      modality: row.modality,
      target: row.target,
      categories: row.categories,
      humanVerified: row.human_verified,
      comparableDrugs: row.comparable_drugs,
      unmetNeed: row.unmet_need,
      patentStatus: row.patent_status,
      mechanismOfAction: row.mechanism_of_action,
      biology: row.biology,
      sourceType: row.source_type,
      deepEnrichAttempts: row.deep_enrich_attempts,
    });
    if (Object.keys(fields).length > 0) fillable++;
    if (dataSparse) dataSparseCount++;
    for (const k of Object.keys(fields)) byField[k] = (byField[k] ?? 0) + 1;
  }

  return { total: rows.rows.length, fillable, byField, dataSparseCount };
}

/**
 * Clears data_sparse=true for relevant assets whose combined text (title +
 * summary + abstract) is now ≥ 150 chars, and resets enriched_at + attempts
 * so the deep-enrichment queue picks them up again.
 *
 * Returns the count of rows updated.
 */
export async function resetDataSparseFlags(): Promise<number> {
  const result = await db.execute<{ id: number }>(sql`
    UPDATE ingested_assets
    SET data_sparse = false,
        enriched_at = NULL,
        deep_enrich_attempts = 0
    WHERE relevant = true
      AND data_sparse = true
      AND length(
        COALESCE(asset_name, '') ||
        COALESCE(summary, '') ||
        COALESCE(abstract, '')
      ) >= ${SPARSE_THRESHOLD}
    RETURNING id
  `);
  const count = result.rows.length;
  console.log(`[ruleBasedFill] Cleared data_sparse flag for ${count} assets with sufficient text`);
  return count;
}
