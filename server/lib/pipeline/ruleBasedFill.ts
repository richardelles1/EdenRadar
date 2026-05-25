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
  { pattern: /\bPD[\s-]?L1\b|\bCD274\b|\bprogrammed\s+(?:cell\s+)?death[\s-]?ligand[\s-]?1\b/i, value: "PD-L1" },
  { pattern: /\bPD[\s-]?1\b|\bPDCD1\b|\bprogrammed\s+(?:cell\s+)?death\s+(?:protein\s+)?1\b(?!\s*ligand)/i, value: "PD-1" },
  { pattern: /\bCTLA[\s-]?4\b/i, value: "CTLA-4" },
  { pattern: /\bLAG[\s-]?3\b/i, value: "LAG-3" },
  { pattern: /\bTIM[\s-]?3\b/i, value: "TIM-3" },
  { pattern: /\bTIGIT\b/i, value: "TIGIT" },
  { pattern: /\b4[\s-]?1BB\b|\bCD137\b/i, value: "4-1BB" },
  { pattern: /\bOX40\b|\bCD134\b/i, value: "OX40" },
  { pattern: /\bPD[\s-]?L2\b/i, value: "PD-L2" },
  // RTK receptors
  { pattern: /\bEGFR\b|\bepidermal\s+growth\s+factor\s+receptor\b/i, value: "EGFR" },
  { pattern: /\bHER2\b|\bERBB2\b|\bhuman\s+epidermal\s+growth\s+factor\s+receptor\s+2\b/i, value: "HER2" },
  { pattern: /\bHER3\b|\bERBB3\b/i, value: "HER3" },
  { pattern: /\bVEGFR\b|\bvascular\s+endothelial\s+growth\s+factor\s+receptor\b/i, value: "VEGFR" },
  { pattern: /\bVEGF\b(?!R)|\bvascular\s+endothelial\s+growth\s+factor\b(?!\s+receptor)/i, value: "VEGF" },
  { pattern: /\bFGFR[0-9]?\b|\bfibroblast\s+growth\s+factor\s+receptor\b/i, value: "FGFR" },
  { pattern: /\bMET\b(?:\s+(?:kinase|receptor|tyrosine|proto|inhibitor|amplification|exon))/i, value: "MET" },
  { pattern: /\bIGF[\s-]?1R\b/i, value: "IGF-1R" },
  // RAS/RAF/MAPK pathway
  { pattern: /\bKRAS\b/i, value: "KRAS" },
  { pattern: /\bBRAF\b/i, value: "BRAF" },
  { pattern: /\bNRAS\b/i, value: "NRAS" },
  { pattern: /\bMEK[0-9]?\b/i, value: "MEK" },
  { pattern: /\bERK[0-9]?\b(?:\s+(?:kinase|pathway|inhibitor|phospho))/i, value: "ERK" },
  // Fusion/rearrangement targets
  { pattern: /\bALK\b(?:\s+(?:kinase|receptor|inhibitor|fusion|rearrangement|mutation|positive))|\banaplastic\s+lymphoma\s+kinase\b/i, value: "ALK" },
  { pattern: /\bRET\b(?:\s+(?:kinase|proto|fusion|rearrangement|mutation|inhibitor))|\brearranged\s+during\s+transfection\b/i, value: "RET" },
  { pattern: /\bROS1\b/i, value: "ROS1" },
  { pattern: /\bNTRK[0-9]?\b|\bneurotrophic\s+(?:tyrosine|tropomyosin)\s+(?:receptor\s+)?kinase\b|\btropomyosin\s+receptor\s+kinase\b/i, value: "NTRK" },
  { pattern: /\bBCR[\s-]?ABL\b|\bbreakpoint\s+cluster\s+region[\s-]?Abelson\b/i, value: "BCR-ABL" },
  // Oncogenes
  { pattern: /\bMYC\b|\bc[\s-]?Myc\b|\bN[\s-]?Myc\b/i, value: "MYC" },
  // Tumor suppressors
  { pattern: /\bTP53\b|\bp53\b/i, value: "TP53/p53" },
  { pattern: /\bBRCA1\b/i, value: "BRCA1" },
  { pattern: /\bBRCA2\b/i, value: "BRCA2" },
  { pattern: /\bPTEN\b/i, value: "PTEN" },
  // Epigenetic
  { pattern: /\bEZH2\b|\benhancer\s+of\s+zeste\s+homolog\s+2\b/i, value: "EZH2" },
  { pattern: /\bHDAC[0-9]?\b|\bhistone\s+deacetylase\b/i, value: "HDAC" },
  { pattern: /\bBRD4\b|\bBET\b(?:\s+bromodomain)|\bbromodomain\s+and\s+extra[\s-]?terminal\b/i, value: "BET/BRD4" },
  { pattern: /\bDNMT[0-9]?\b|\bDNA\s+methyltransferase\b/i, value: "DNMT" },
  // Cell cycle
  { pattern: /\bCDK4\/6\b|\bCDK4\b|\bCDK6\b|\bcyclin[\s-]?dependent\s+kinase\s+(?:4(?:\/6)?|6)\b/i, value: "CDK4/6" },
  { pattern: /\bCDK[0-9]+\b(?:\s+(?:inhibitor|kinase|pathway))|\bcyclin[\s-]?dependent\s+kinase\b(?!\s+(?:4|6))/i, value: "CDK" },
  // PI3K/AKT/mTOR
  { pattern: /\bPI3K\b|\bPI3K[αβγδ]\b|\bphospho(?:ino)?sitide[\s-]3[\s-]?kinase\b|\bphosphatidylinositol[\s-]3[\s-]?kinase\b/i, value: "PI3K" },
  { pattern: /\bmTOR\b|\bmTORC[12]\b|\b(?:mechanistic|mammalian)\s+target\s+of\s+rapamycin\b/i, value: "mTOR" },
  { pattern: /\bAKT[0-9]?\b/i, value: "AKT" },
  // JAK/STAT
  { pattern: /\bJAK1\b|\bJanus\s+kinase\s+1\b/i, value: "JAK1" },
  { pattern: /\bJAK2\b|\bJanus\s+kinase\s+2\b/i, value: "JAK2" },
  { pattern: /\bJAK3\b|\bJanus\s+kinase\s+3\b/i, value: "JAK3" },
  { pattern: /\bSTAT3\b|\bsignal\s+transducer\s+and\s+activator\s+of\s+transcription\s+3\b/i, value: "STAT3" },
  // Heme/leukemia
  { pattern: /\bBTK\b|\bBruton'?s?\s+tyrosine\s+kinase\b/i, value: "BTK" },
  { pattern: /\bIDH1\b|\bisocitrate\s+dehydrogenase\s+(?:\(NADP[+]?\)\s+)?1\b/i, value: "IDH1" },
  { pattern: /\bIDH2\b|\bisocitrate\s+dehydrogenase\s+(?:\(NADP[+]?\)\s+)?2\b/i, value: "IDH2" },
  { pattern: /\bFLT3\b|\bfms[\s-]?(?:like|related)\s+tyrosine\s+kinase\s+3\b/i, value: "FLT3" },
  // DNA damage response
  { pattern: /\bPARP[0-9]?\b|\bpoly[\s-]?\(?ADP[\s-]?ribose\)?[\s-]?polymerase\b/i, value: "PARP" },
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
  { pattern: /\bGLP[\s-]?1R\b|\bGLP[\s-]?1\s+receptor\b|\bglucagon[\s-]?like\s+peptide[\s-]?1\s+receptor\b/i, value: "GLP-1R" },
  { pattern: /\bGLP[\s-]?1\b|\bGlucagon[\s-]?like\s+peptide\b(?!\s*[\s-]?1\s+receptor)/i, value: "GLP-1" },
  { pattern: /\bPCSK9\b|\bproprotein\s+convertase\s+subtilisin(?:\/kexin)?(?:\s+type)?\s*9\b/i, value: "PCSK9" },
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
  "infectious disease": "Antimicrobial resistance is growing; access to effective vaccines and therapeutics remains inequitable; latent infections (HIV, TB, HSV) cannot be eradicated with current therapies.",
  "respiratory disease": "Progressive lung function decline is not halted by any approved therapy; respiratory failure in ILD and COPD is irreversible; pulmonary hypertension complicating parenchymal disease is undertreated.",
  "hematological disorder": "Cure is limited to patients eligible for stem-cell transplant; gene therapy approaches are not yet broadly accessible; iron overload from chronic transfusion causes progressive organ damage.",
  "wound healing": "Chronic wounds (diabetic ulcers, pressure injuries) have high recurrence rates; current standard of care has limited efficacy in ischaemic wounds; wound-related amputations carry high mortality.",
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

// ── Target → Class lookup ─────────────────────────────────────────────────────
// Groups individual molecular targets into ~15 functional categories for the
// Target×Modality landscape grid. Applied after target is resolved.
const TARGET_CLASS: Record<string, string> = {
  // Checkpoint immunotherapy
  "PD-1": "checkpoint immunotherapy",
  "PD-L1": "checkpoint immunotherapy",
  "PD-L2": "checkpoint immunotherapy",
  "PDCD1": "checkpoint immunotherapy",   // LLM alias for PD-1
  "CD274": "checkpoint immunotherapy",   // LLM alias for PD-L1
  "CTLA-4": "checkpoint immunotherapy",
  "LAG-3": "checkpoint immunotherapy",
  "TIM-3": "checkpoint immunotherapy",
  "TIGIT": "checkpoint immunotherapy",
  "4-1BB": "checkpoint immunotherapy",
  "OX40": "checkpoint immunotherapy",
  "CD47": "checkpoint immunotherapy",
  "CD73": "checkpoint immunotherapy",
  "A2AR": "checkpoint immunotherapy",
  "IDO1": "checkpoint immunotherapy",
  "TDO": "checkpoint immunotherapy",
  "Arginase-1": "checkpoint immunotherapy",
  "CD39": "checkpoint immunotherapy",
  "CD40": "checkpoint immunotherapy",
  // Receptor tyrosine kinase
  "EGFR": "receptor tyrosine kinase",
  "EGFRvIII": "receptor tyrosine kinase",
  "HER2": "receptor tyrosine kinase",
  "ERBB2": "receptor tyrosine kinase",   // LLM alias for HER2
  "HER3": "receptor tyrosine kinase",
  "VEGFR": "receptor tyrosine kinase",
  "FGFR": "receptor tyrosine kinase",
  "MET": "receptor tyrosine kinase",
  "IGF-1R": "receptor tyrosine kinase",
  "FLT3": "receptor tyrosine kinase",
  "AXL": "receptor tyrosine kinase",
  // Fusion/rearrangement kinase
  "ALK": "fusion kinase",
  "RET": "fusion kinase",
  "ROS1": "fusion kinase",
  "NTRK": "fusion kinase",
  "BCR-ABL": "fusion kinase",
  // RAS/MAPK pathway
  "KRAS": "RAS/MAPK pathway",
  "BRAF": "RAS/MAPK pathway",
  "NRAS": "RAS/MAPK pathway",
  "MEK": "RAS/MAPK pathway",
  "ERK": "RAS/MAPK pathway",
  // PI3K/AKT/mTOR
  "PI3K": "PI3K/AKT/mTOR",
  "AKT": "PI3K/AKT/mTOR",
  "mTOR": "PI3K/AKT/mTOR",
  "PTEN": "PI3K/AKT/mTOR",
  // Cell cycle
  "CDK4/6": "cell cycle",
  "CDK": "cell cycle",
  // DNA damage response
  "PARP": "DNA damage response",
  "ATR": "DNA damage response",
  "ATM": "DNA damage response",
  "BRCA1": "DNA damage response",
  "BRCA2": "DNA damage response",
  "TP53/p53": "DNA damage response",
  "TP53": "DNA damage response",         // LLM alias (omits /p53)
  // Apoptosis
  "BCL-2": "apoptosis",
  "BCL-XL": "apoptosis",
  "MDM2": "apoptosis",
  // Epigenetics
  "EZH2": "epigenetics",
  "HDAC": "epigenetics",
  "BET/BRD4": "epigenetics",
  "DNMT": "epigenetics",
  // JAK/STAT signaling
  "JAK1": "JAK/STAT signaling",
  "JAK2": "JAK/STAT signaling",
  "JAK3": "JAK/STAT signaling",
  "STAT3": "JAK/STAT signaling",
  // Cytokine/inflammation
  "TNF-alpha": "cytokine/inflammation",
  "IL-6": "cytokine/inflammation",
  "IL-1": "cytokine/inflammation",
  "IL-17": "cytokine/inflammation",
  "IL-23": "cytokine/inflammation",
  "IL-4": "cytokine/inflammation",
  "IL-13": "cytokine/inflammation",
  "IL-33": "cytokine/inflammation",
  "TGF-beta": "cytokine/inflammation",
  "TGFB1": "cytokine/inflammation",      // LLM alias for TGF-beta
  "NF-kB": "cytokine/inflammation",
  // Metabolic/hormone receptor
  "GLP-1R": "metabolic hormone",
  "GLP-1": "metabolic hormone",
  "PCSK9": "metabolic hormone",
  "AMPK": "metabolic hormone",
  "PPAR": "metabolic hormone",
  "THRβ": "metabolic hormone",
  "ACC": "metabolic hormone",
  "FASN": "metabolic hormone",
  "SCD1": "metabolic hormone",
  "FXR": "metabolic hormone",
  "androgen receptor": "metabolic hormone",
  "estrogen receptor": "metabolic hormone",
  // Ion channel / pain
  "Nav1.7": "ion channel",
  "Nav1.8": "ion channel",
  "TRPV1": "ion channel",
  "TRPA1": "ion channel",
  "P2X3": "ion channel",
  "sodium channel": "ion channel",
  // Fibrosis/ECM
  "LOXL2": "fibrosis/ECM",
  "Galectin-3": "fibrosis/ECM",
  "CTGF/CCN2": "fibrosis/ECM",
  // Complement
  "C3": "complement",
  "C5": "complement",
  "complement factor B/D": "complement",
  // Solid tumor antigen
  "TROP-2": "solid tumor antigen",
  "NECTIN-4": "solid tumor antigen",
  "FRα": "solid tumor antigen",
  "Claudin 18.2": "solid tumor antigen",
  "CEACAM5": "solid tumor antigen",
  "MUC1/MUC16": "solid tumor antigen",
  "Mesothelin": "solid tumor antigen",
  "GPC3": "solid tumor antigen",
  "HIF": "solid tumor antigen",
  // Heme/liquid tumor antigen
  "CD19": "B-cell/lymphoid antigen",
  "CD20": "B-cell/lymphoid antigen",
  "CD22": "B-cell/lymphoid antigen",
  "CD30": "B-cell/lymphoid antigen",
  "CD70": "B-cell/lymphoid antigen",
  "CD79": "B-cell/lymphoid antigen",
  "CD33": "myeloid antigen",
  "CD38": "myeloid antigen",
  "CD123": "myeloid antigen",
  // B-cell kinase
  "BTK": "B-cell kinase",
  // Metabolic enzyme
  "IDH1": "metabolic enzyme",
  "IDH2": "metabolic enzyme",
  // Transcription factor
  "MYC": "transcription factor",
  // Developmental signaling
  "Wnt": "developmental signaling",
  "Notch": "developmental signaling",
  "Hedgehog/SHH": "developmental signaling",
  // Chemokine receptor
  "CXCR4": "chemokine receptor",
  "CCR5": "chemokine receptor",
  // Viral target
  "ACE2": "viral target",
  "NSP14": "viral target",
  "Spike protein": "viral target",
  "sars-cov-2": "viral target",           // LLM alias (virus name used as target)
  // Neurodegeneration
  "TREM2": "neurodegeneration",
  "LRRK2": "neurodegeneration",
  "GBA": "neurodegeneration",
  "MAPT": "neurodegeneration",            // tau protein (Alzheimer's)
  "SNCA": "neurodegeneration",            // alpha-synuclein (Parkinson's)
  "APP": "neurodegeneration",             // amyloid precursor protein (Alzheimer's)
  // Non-receptor kinase
  "SRC": "non-receptor kinase",
  // Adenosine/immune metabolism
  "VEGF": "angiogenesis",
};

// ── Indication → Unmet Need Severity (1–5) ───────────────────────────────────
// Integer scale: 5 = critical (no approved curative option, high mortality),
// 1 = addressable (established treatments with good coverage).
// Used to overlay White Space Finder on the landscape intelligence heatmap.
const INDICATION_UNMET_NEED_SEVERITY: Record<string, number> = {
  // 5 = critical
  "glioblastoma": 5,
  "pancreatic cancer": 5,
  "small cell lung cancer": 5,
  "mesothelioma": 5,
  "als": 5,
  "amyotrophic lateral sclerosis": 5,
  "huntington's disease": 5,
  "duchenne muscular dystrophy": 5,
  "idiopathic pulmonary fibrosis": 5,
  "pulmonary fibrosis": 5,
  "fibrosis": 5,
  // 4 = high
  "non-small cell lung cancer": 4,
  "triple-negative breast cancer": 4,
  "ovarian cancer": 4,
  "hepatocellular carcinoma": 4,
  "glioma": 4,
  "parkinson's disease": 4,
  "alzheimer's disease": 4,
  "multiple sclerosis": 4,
  "prostate cancer": 4,
  "melanoma": 4,
  "acute myeloid leukemia": 4,
  "aml": 4,
  "sepsis": 4,
  "tuberculosis": 4,
  "antimicrobial resistance": 4,
  "cystic fibrosis": 4,
  "sickle cell disease": 4,
  "hiv/aids": 4,
  // 3 = moderate
  "breast cancer": 3,
  "colorectal cancer": 3,
  "lymphoma": 3,
  "diffuse large b-cell lymphoma": 3,
  "multiple myeloma": 3,
  "leukemia": 3,
  "chronic lymphocytic leukemia": 3,
  "cll": 3,
  "neuropathic pain": 3,
  "epilepsy": 3,
  "heart failure": 3,
  "stroke": 3,
  "non-alcoholic steatohepatitis": 3,
  "nash": 3,
  "rheumatoid arthritis": 3,
  "inflammatory bowel disease": 3,
  "crohn's disease": 3,
  "lupus": 3,
  "systemic lupus erythematosus": 3,
  "schizophrenia": 3,
  "depression": 3,
  "bipolar disorder": 3,
  "hiv": 3,
  "spinal cord injury": 3,
  "traumatic brain injury": 3,
  // 2 = manageable
  "lung cancer": 2,
  "gastric cancer": 2,
  "esophageal cancer": 2,
  "bladder cancer": 2,
  "renal cell carcinoma": 2,
  "thyroid cancer": 2,
  "sarcoma": 2,
  "diabetes type 2": 2,
  "type 2 diabetes": 2,
  "obesity": 2,
  "hypertension": 2,
  "cardiovascular disease": 2,
  "atherosclerosis": 2,
  "asthma": 2,
  "psoriasis": 2,
  "atopic dermatitis": 2,
  "ulcerative colitis": 2,
  "migraine": 2,
  "hepatitis b": 2,
  "hepatitis c": 2,
  "covid-19": 2,
  // 1 = addressable
  "type 1 diabetes": 1,
  "diabetes type 1": 1,
  "hypercholesterolemia": 1,
  "ankylosing spondylitis": 1,
  "influenza": 1,
  // Broad LLM categories and canonical form aliases
  "cancer": 3,
  "hiv infection": 3,                    // LLM canonical (253 assets vs "hiv")
  "type 2 diabetes mellitus": 2,         // LLM canonical (131 assets)
  "neurological disorder": 3,
  "infectious disease": 3,
  "hematological disorder": 3,
  "pain": 3,
  "renal disease": 3,
  "autoimmune disease": 2,
  "musculoskeletal disorder": 2,
  "ocular disease": 2,
  "gastrointestinal disease": 2,
  "dermatological condition": 2,
  "reproductive health": 2,
  "respiratory disease": 2,
  "wound healing": 1,
  "point-of-care diagnostics": 1,
  "surgical application": 1,
  "medical imaging diagnostics": 1,
};

// ── Target → Indication reverse lookup (narrow, high-confidence set) ──────────
// Fills indication when it is missing and a highly specific target implies
// a single canonical disease. Only the most unambiguous mappings are included —
// targets that are used across multiple indications are excluded.
const TARGET_INDICATION: Record<string, string> = {
  "PCSK9": "atherosclerosis",
  "GLP-1R": "type 2 diabetes",
  "GLP-1": "type 2 diabetes",
  "LRRK2": "parkinson's disease",
  "GBA": "parkinson's disease",
  "TREM2": "alzheimer's disease",
  "Nav1.7": "neuropathic pain",
  "Nav1.8": "neuropathic pain",
  "P2X3": "neuropathic pain",
  "TRPV1": "neuropathic pain",
  "ACE2": "covid-19",
  "NSP14": "covid-19",
  "Spike protein": "covid-19",
  "CCR5": "hiv",
  "FLT3": "acute myeloid leukemia",
  "IDH1": "acute myeloid leukemia",
  "IDH2": "acute myeloid leukemia",
  "BCR-ABL": "chronic myeloid leukemia",
  "androgen receptor": "prostate cancer",
  "estrogen receptor": "breast cancer",
  "LOXL2": "idiopathic pulmonary fibrosis",
  "Galectin-3": "idiopathic pulmonary fibrosis",
  "BTK": "chronic lymphocytic leukemia",
};

// ── Indication → Biology lookup (85 entries) ─────────────────────────────────
// Priority 1 (disease-specific). Maps canonical indication values to the
// canonical biology taxonomy used across the platform. Won't overwrite
// LLM-filled values (humanVerified guard applied at call site).
const INDICATION_BIOLOGY: Record<string, string> = {
  // Oncology — specific cancers
  "non-small cell lung cancer": "oncogenic transcription",
  "small cell lung cancer": "oncogenic transcription",
  "lung cancer": "oncogenic transcription",
  "breast cancer": "oncogenic transcription",
  "triple-negative breast cancer": "tumor microenvironment",
  "her2-positive breast cancer": "oncogenic transcription",
  "colorectal cancer": "oncogenic transcription",
  "pancreatic cancer": "tumor microenvironment",
  "prostate cancer": "oncogenic transcription",
  "ovarian cancer": "dna damage response deficiency",
  "cervical cancer": "pathogen replication",
  "bladder cancer": "oncogenic transcription",
  "renal cell carcinoma": "oncogenic transcription",
  "kidney cancer": "oncogenic transcription",
  "hepatocellular carcinoma": "oncogenic transcription",
  "liver cancer": "oncogenic transcription",
  "gastric cancer": "oncogenic transcription",
  "esophageal cancer": "oncogenic transcription",
  "head and neck cancer": "oncogenic transcription",
  "head and neck squamous cell carcinoma": "tumor microenvironment",
  "thyroid cancer": "oncogenic transcription",
  "endometrial cancer": "hormonal dysregulation",
  "glioblastoma": "tumor microenvironment",
  "glioma": "tumor microenvironment",
  "melanoma": "immune evasion",
  "leukemia": "oncogenic transcription",
  "aml": "oncogenic transcription",
  "acute myeloid leukemia": "oncogenic transcription",
  "cll": "apoptosis resistance",
  "chronic lymphocytic leukemia": "apoptosis resistance",
  "lymphoma": "oncogenic transcription",
  "diffuse large b-cell lymphoma": "oncogenic transcription",
  "multiple myeloma": "oncogenic transcription",
  "sarcoma": "oncogenic transcription",
  "mesothelioma": "tumor microenvironment",
  "cancer": "oncogenic transcription",
  // Neurology / neurodegeneration
  "alzheimer's disease": "protein aggregation",
  "parkinson's disease": "protein aggregation",
  "als": "protein aggregation",
  "amyotrophic lateral sclerosis": "protein aggregation",
  "huntington's disease": "protein aggregation",
  "multiple sclerosis": "myelin disruption",
  "epilepsy": "ion channel dysfunction",
  "migraine": "ion channel dysfunction",
  "neuropathic pain": "ion channel dysfunction",
  "traumatic brain injury": "neuroinflammation",
  "spinal cord injury": "neuroinflammation",
  "neurological disorder": "neuroinflammation",
  "depression": "synaptic dysfunction",
  "schizophrenia": "synaptic dysfunction",
  "bipolar disorder": "synaptic dysfunction",
  "autism spectrum disorder": "synaptic dysfunction",
  // Cardiovascular / metabolic
  "stroke": "ischemia and oxidative stress",
  "heart failure": "ischemia and oxidative stress",
  "myocardial infarction": "ischemia and oxidative stress",
  "atherosclerosis": "lipid metabolism dysfunction",
  "hypertension": "ischemia and oxidative stress",
  "cardiovascular disease": "ischemia and oxidative stress",
  "diabetes type 2": "insulin resistance",
  "type 2 diabetes": "insulin resistance",
  "obesity": "insulin resistance",
  "metabolic syndrome": "insulin resistance",
  "metabolic disease": "insulin resistance",
  "non-alcoholic steatohepatitis": "lipid metabolism dysfunction",
  "nash": "lipid metabolism dysfunction",
  "non-alcoholic fatty liver disease": "lipid metabolism dysfunction",
  "hypercholesterolemia": "lipid metabolism dysfunction",
  // Immunology / inflammation
  "rheumatoid arthritis": "autoimmune dysregulation",
  "lupus": "autoimmune dysregulation",
  "systemic lupus erythematosus": "autoimmune dysregulation",
  "inflammatory bowel disease": "autoimmune dysregulation",
  "crohn's disease": "autoimmune dysregulation",
  "ulcerative colitis": "autoimmune dysregulation",
  "psoriasis": "autoimmune dysregulation",
  "ankylosing spondylitis": "autoimmune dysregulation",
  "autoimmune disease": "autoimmune dysregulation",
  "atopic dermatitis": "allergic dysregulation",
  "asthma": "allergic dysregulation",
  "allergic disease": "allergic dysregulation",
  "diabetes type 1": "autoimmune dysregulation",
  "type 1 diabetes": "autoimmune dysregulation",
  // Fibrosis / pulmonary
  "pulmonary fibrosis": "fibrosis",
  "idiopathic pulmonary fibrosis": "fibrosis",
  "liver fibrosis": "fibrosis",
  "kidney fibrosis": "fibrosis",
  "fibrosis": "fibrosis",
  "copd": "ischemia and oxidative stress",
  "respiratory disease": "ischemia and oxidative stress",
  // Infectious disease
  "hiv": "immune evasion",
  "hiv/aids": "immune evasion",
  "hiv infection": "immune evasion",     // LLM canonical form (253 assets)
  "hepatitis b": "immune evasion",
  "hepatitis c": "pathogen replication",
  "influenza": "pathogen replication",
  "covid-19": "pathogen replication",
  "sars-cov-2": "pathogen replication",
  "sepsis": "cytokine dysregulation",
  "malaria": "pathogen replication",
  "tuberculosis": "pathogen replication",
  "infectious disease": "pathogen replication",
  "antimicrobial resistance": "antimicrobial resistance",
  // Rare / genetic disease
  "cystic fibrosis": "gene expression deficiency",
  "sickle cell disease": "structural protein defect",
  "duchenne muscular dystrophy": "gene expression deficiency",
  "spinal muscular atrophy": "gene expression deficiency",
  "hemophilia": "gene expression deficiency",
  "lysosomal storage disease": "enzyme deficiency",
  "fabry disease": "enzyme deficiency",
  "gaucher disease": "enzyme deficiency",
  "hereditary angioedema": "enzyme deficiency",
  "hematological disorder": "structural protein defect",
  // Ophthalmology
  "macular degeneration": "angiogenesis",
  "diabetic retinopathy": "angiogenesis",
  "ocular disease": "angiogenesis",
  // Hormonal / reproductive
  "osteoporosis": "hormonal dysregulation",
  "endometriosis": "hormonal dysregulation",
  "polycystic ovary syndrome": "hormonal dysregulation",
  "hormonal dysregulation": "hormonal dysregulation",
  "reproductive health": "hormonal dysregulation",
  "urological condition": "hormonal dysregulation",
  // Coarse LLM outputs (oncology, neurology etc.)
  "oncology": "oncogenic transcription",
  "hematology": "structural protein defect",
  "neurology": "neuroinflammation",
  "neurodegenerative disease": "protein aggregation",
  "immunology": "autoimmune dysregulation",
  "gastroenterology": "autoimmune dysregulation",
  "gastrointestinal disease": "autoimmune dysregulation",
  "dermatological condition": "autoimmune dysregulation",
  "musculoskeletal disorder": "fibrosis",
  "renal disease": "ischemia and oxidative stress",
  "kidney disease": "ischemia and oxidative stress",
  "wound healing": "fibrosis",
  "psychiatric disorder": "synaptic dysfunction",
  "mental health": "synaptic dysfunction",
  "anxiety": "synaptic dysfunction",
  "addiction": "synaptic dysfunction",
  "surgical application": "structural protein defect",
  "point-of-care diagnostics": "pathogen replication",
  "medical imaging diagnostics": "tumor microenvironment",
  "neonatal screening": "gene expression deficiency",
  "hearing loss": "ion channel dysfunction",
  // Diabetes variants
  "type 2 diabetes mellitus": "insulin resistance",
  "type 1 diabetes mellitus": "autoimmune dysregulation",
  "diabetes mellitus": "insulin resistance",
  "diabetes": "insulin resistance",
  // Pain / musculoskeletal
  "chronic pain": "ion channel dysfunction",
  "pain": "ion channel dysfunction",
  "osteoarthritis": "fibrosis",
  "rheumatology": "autoimmune dysregulation",
};

// ── Target → Biology lookup (100+ entries) ────────────────────────────────────
// Priority 2 (mechanism-specific). Maps canonical target values to the
// canonical biology taxonomy. Used when indication is absent or too coarse.
const TARGET_BIOLOGY: Record<string, string> = {
  // Checkpoint / immune evasion
  "PD-1": "immune evasion",
  "PD-L1": "immune evasion",
  "CTLA-4": "immune evasion",
  "LAG-3": "immune evasion",
  "TIM-3": "immune evasion",
  "TIGIT": "immune evasion",
  "CD47": "immune evasion",
  "CD19": "immune evasion",
  "CD20": "immune evasion",
  "CD22": "immune evasion",
  "CXCR4": "immune evasion",
  "CCR5": "immune evasion",
  // RTK / oncogenic kinase signaling
  "EGFR": "aberrant kinase signaling",
  "HER2": "aberrant kinase signaling",
  "HER3": "aberrant kinase signaling",
  "ALK": "aberrant kinase signaling",
  "ROS1": "aberrant kinase signaling",
  "MET": "aberrant kinase signaling",
  "RET": "aberrant kinase signaling",
  "FGFR": "aberrant kinase signaling",
  "FGFR1": "aberrant kinase signaling",
  "FGFR2": "aberrant kinase signaling",
  "FGFR3": "aberrant kinase signaling",
  "KIT": "aberrant kinase signaling",
  "ABL": "aberrant kinase signaling",
  "BCR-ABL": "aberrant kinase signaling",
  "BRAF": "aberrant kinase signaling",
  "MEK": "aberrant kinase signaling",
  "ERK": "aberrant kinase signaling",
  "PI3K": "aberrant kinase signaling",
  "AKT": "aberrant kinase signaling",
  "mTOR": "aberrant kinase signaling",
  "SRC": "aberrant kinase signaling",
  "FAK": "aberrant kinase signaling",
  "AXL": "aberrant kinase signaling",
  "NTRK": "aberrant kinase signaling",
  "RAS": "aberrant kinase signaling",
  "RAF": "aberrant kinase signaling",
  "NRG1": "aberrant kinase signaling",
  // JAK/STAT → immunology
  "JAK1": "autoimmune dysregulation",
  "JAK2": "autoimmune dysregulation",
  "JAK3": "autoimmune dysregulation",
  "TYK2": "autoimmune dysregulation",
  "STAT3": "oncogenic transcription",
  "STAT6": "allergic dysregulation",
  // Oncogenic drivers
  "KRAS": "oncogenic transcription",
  "NRAS": "oncogenic transcription",
  "HRAS": "oncogenic transcription",
  "MYC": "oncogenic transcription",
  "MYCN": "oncogenic transcription",
  "Androgen Receptor": "hormonal dysregulation",
  "AR": "hormonal dysregulation",
  "Estrogen Receptor": "hormonal dysregulation",
  "ER": "hormonal dysregulation",
  "PSMA": "oncogenic transcription",
  "CD38": "oncogenic transcription",
  "BCMA": "oncogenic transcription",
  "CD123": "oncogenic transcription",
  "FLT3": "oncogenic transcription",
  "TROP-2": "tumor microenvironment",
  // Apoptosis
  "BCL-2": "apoptosis resistance",
  "BCL-XL": "apoptosis resistance",
  "MCL-1": "apoptosis resistance",
  "MDM2": "apoptosis resistance",
  "p53": "apoptosis resistance",
  "MDM2/p53": "apoptosis resistance",
  // Cell cycle
  "CDK4/6": "cell cycle dysregulation",
  "CDK4": "cell cycle dysregulation",
  "CDK6": "cell cycle dysregulation",
  "CDK2": "cell cycle dysregulation",
  "CDK9": "cell cycle dysregulation",
  "WEE1": "dna damage response deficiency",
  "CHK1": "dna damage response deficiency",
  "CHK2": "dna damage response deficiency",
  // DNA damage response
  "PARP": "dna damage response deficiency",
  "ATM": "dna damage response deficiency",
  "ATR": "dna damage response deficiency",
  "BRCA1": "dna damage response deficiency",
  "BRCA2": "dna damage response deficiency",
  // Epigenetics
  "HDAC": "epigenetic dysregulation",
  "EZH2": "epigenetic dysregulation",
  "BRD4": "epigenetic dysregulation",
  "DNMT": "epigenetic dysregulation",
  "DOT1L": "epigenetic dysregulation",
  "LSD1": "epigenetic dysregulation",
  // Angiogenesis
  "VEGF": "angiogenesis",
  "VEGFR": "angiogenesis",
  "VEGFR2": "angiogenesis",
  "PDGFR": "angiogenesis",
  "HIF-1α": "angiogenesis",
  "HIF-1alpha": "angiogenesis",
  "Angiopoietin": "angiogenesis",
  // Fibrosis / TGF-β
  "TGF-β": "fibrosis",
  "TGF-beta": "fibrosis",
  "TGFB1": "fibrosis",
  "Connective tissue growth factor": "fibrosis",
  // Neurodegeneration → protein aggregation
  "Amyloid-β": "protein aggregation",
  "Amyloid beta": "protein aggregation",
  "Tau": "protein aggregation",
  "α-Synuclein": "protein aggregation",
  "Alpha-synuclein": "protein aggregation",
  "TDP-43": "protein aggregation",
  "SOD1": "protein aggregation",
  "Huntingtin": "protein aggregation",
  "APP": "protein aggregation",
  // Neuroinflammation
  "LRRK2": "neuroinflammation",
  "TREM2": "neuroinflammation",
  "MAPT": "protein aggregation",
  // Ion channels
  "Nav1.7": "ion channel dysfunction",
  "Nav1.8": "ion channel dysfunction",
  "TRPV1": "ion channel dysfunction",
  "KCNQ2": "ion channel dysfunction",
  "KCNQ3": "ion channel dysfunction",
  "HCN": "ion channel dysfunction",
  // Gene expression / rare disease
  "CFTR": "gene expression deficiency",
  "SMN1": "gene expression deficiency",
  "SMN2": "gene expression deficiency",
  "Dystrophin": "gene expression deficiency",
  "DMD": "gene expression deficiency",
  "Factor VIII": "gene expression deficiency",
  "Factor IX": "gene expression deficiency",
  // Cytokines → inflammation
  "IL-6": "cytokine dysregulation",
  "IL-6R": "cytokine dysregulation",
  "TNF-α": "cytokine dysregulation",
  "TNF": "cytokine dysregulation",
  "IL-1β": "cytokine dysregulation",
  "IL-1R": "cytokine dysregulation",
  "IL-17A": "autoimmune dysregulation",
  "IL-23": "autoimmune dysregulation",
  "IL-12": "autoimmune dysregulation",
  "IL-4R": "allergic dysregulation",
  "IL-13": "allergic dysregulation",
  "IL-33": "allergic dysregulation",
  "IL-5": "allergic dysregulation",
  "TSLP": "allergic dysregulation",
  "IgE": "allergic dysregulation",
  // Metabolism → insulin resistance / lipid
  "GLP-1R": "insulin resistance",
  "GCGR": "insulin resistance",
  "GIP": "insulin resistance",
  "PPAR": "insulin resistance",
  "PPARγ": "insulin resistance",
  "PCSK9": "lipid metabolism dysfunction",
  "FXR": "lipid metabolism dysfunction",
  "ANGPTL3": "lipid metabolism dysfunction",
  // Cardiovascular
  "ACE": "ischemia and oxidative stress",
  "AT1R": "ischemia and oxidative stress",
  "Renin": "ischemia and oxidative stress",
  // Spike protein / viral
  "Spike protein": "pathogen replication",
  // Pathogen targets
  "Viral polymerase": "pathogen replication",
  "Protease": "pathogen replication",
};

// ── Modality → Biology lookup (safety net) ────────────────────────────────────
// Priority 3 (broadest). Only fires when indication AND target are both absent.
// Modality is 99.9% filled, so this catches assets lacking both indication and target.
// Mapping is broad by design — it sets a biology floor rather than a precise classification.
const MODALITY_BIOLOGY: Record<string, string> = {
  "gene therapy": "gene expression deficiency",
  "gene editing": "gene expression deficiency",
  "mrna": "gene expression deficiency",
  "rna therapy": "gene expression deficiency",
  "antisense oligonucleotide": "gene expression deficiency",
  "cell therapy": "immune evasion",
  "vaccine": "pathogen replication",
  "antibody": "immune evasion",
  "biologic": "immune evasion",
  "small molecule": "aberrant kinase signaling",
  "peptide": "aberrant kinase signaling",
  "nanoparticle": "pathogen replication",
  "diagnostic": "pathogen replication",
  "medical device": "structural protein defect",
  "platform technology": "gene expression deficiency",
  "research tool": "gene expression deficiency",
  "imaging agent": "tumor microenvironment",
  "radiopharmaceutical": "tumor microenvironment",
  "drug delivery": "aberrant kinase signaling",
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

// ── Mechanism of action rules ─────────────────────────────────────────────────
// Pattern-match title + summary for specific MoA strings.
// Only fires when mechanismOfAction is null/empty and asset is therapeutic.
const MOA_RULES: Array<{ pattern: RegExp; value: string }> = [
  // Kinase inhibitors
  { pattern: /\bPARP\s*(?:1\/2\s+)?inhibitor/i, value: "PARP inhibitor" },
  { pattern: /\bCDK\s*4\s*[/,&]\s*6\s+inhibitor/i, value: "CDK4/6 inhibitor" },
  { pattern: /\bCDK\s*9\s+inhibitor/i, value: "CDK9 inhibitor" },
  { pattern: /\bCDK\s*2\s+inhibitor/i, value: "CDK2 inhibitor" },
  { pattern: /\bEGFR\s+(?:tyrosine\s+kinase\s+)?inhibitor|\bEGFR[\s-]TKI\b/i, value: "EGFR tyrosine kinase inhibitor" },
  { pattern: /\banti-HER2\b|\bHER2[\s-]targeted|\bHER2\s+(?:targeted\s+)?inhibitor/i, value: "HER2-targeted therapy" },
  { pattern: /\bBRAF\s+(?:V600[A-Z]\s+)?inhibitor/i, value: "BRAF inhibitor" },
  { pattern: /\bMEK\s*(?:1\/2\s+)?inhibitor/i, value: "MEK inhibitor" },
  { pattern: /\bERK\s*(?:1\/2\s+)?inhibitor/i, value: "ERK inhibitor" },
  { pattern: /\bPI3K\s*(?:[αβδγ/]*\s*)?inhibitor|\bPI3K[/\s]AKT\s+inhibitor/i, value: "PI3K inhibitor" },
  { pattern: /\bmTOR\s+inhibitor|\brapalog\b/i, value: "mTOR inhibitor" },
  { pattern: /\bAKT\s+inhibitor/i, value: "AKT inhibitor" },
  { pattern: /\banti-VEGF\b|\bVEGF(?:R)?\s+inhibitor|\bVEGF\s+(?:pathway\s+)?blockade/i, value: "VEGF/VEGFR inhibitor" },
  { pattern: /\bJAK\s*[1-3]?\s+inhibitor|\bJanus\s+kinase\s+inhibitor/i, value: "JAK inhibitor" },
  { pattern: /\bBTK\s+inhibitor/i, value: "BTK inhibitor" },
  { pattern: /\bFLT3\s+inhibitor/i, value: "FLT3 inhibitor" },
  { pattern: /\bALK\s+(?:tyrosine\s+kinase\s+)?inhibitor/i, value: "ALK inhibitor" },
  { pattern: /\bRET\s+(?:tyrosine\s+kinase\s+)?inhibitor/i, value: "RET inhibitor" },
  { pattern: /\bMET\s+(?:tyrosine\s+kinase\s+)?inhibitor/i, value: "MET inhibitor" },
  { pattern: /\bKIT\s+(?:tyrosine\s+kinase\s+)?inhibitor/i, value: "KIT inhibitor" },
  { pattern: /\bSRC\s+(?:kinase\s+)?inhibitor/i, value: "SRC kinase inhibitor" },
  { pattern: /\bLRRK2\s+(?:kinase\s+)?inhibitor/i, value: "LRRK2 kinase inhibitor" },
  { pattern: /\bWEE1\s+inhibitor/i, value: "WEE1 inhibitor" },
  { pattern: /\bATR\s+inhibitor/i, value: "ATR inhibitor" },
  { pattern: /\bATM\s+inhibitor/i, value: "ATM inhibitor" },
  { pattern: /\bCHK1\s+inhibitor/i, value: "CHK1 inhibitor" },
  // Checkpoint / immune therapy
  { pattern: /\banti.PD.1\b|\bPD.1\s+(?:antibody|blockade|checkpoint\s+inhibitor|inhibitor)/i, value: "anti-PD-1 checkpoint inhibitor" },
  { pattern: /\banti.PD.L1\b|\bPD.L1\s+(?:antibody|blockade|checkpoint\s+inhibitor|inhibitor)/i, value: "anti-PD-L1 checkpoint inhibitor" },
  { pattern: /\banti.CTLA.4\b|\bCTLA.4\s+(?:antibody|blockade|inhibitor)/i, value: "anti-CTLA-4 checkpoint inhibitor" },
  { pattern: /\bimmune\s+checkpoint\s+(?:blockade|inhibitor|therapy)|\bcheckpoint\s+inhibitor/i, value: "immune checkpoint inhibitor" },
  // Apoptosis
  { pattern: /\bBCL.2\s+inhibitor|\bBCL.XL\s+inhibitor|\bMCL.1\s+inhibitor|\bBH3\s+mimetic/i, value: "BCL-2 family inhibitor" },
  { pattern: /\bMDM2\s+inhibitor|\bMDM2\/p53\s+(?:inhibitor|antagonist)/i, value: "MDM2/p53 inhibitor" },
  // Epigenetic
  { pattern: /\bHDAC\s+inhibitor|\bhistone\s+deacetylase\s+inhibitor/i, value: "HDAC inhibitor" },
  { pattern: /\bBET\s+(?:bromodomain\s+)?inhibitor|\bBRD4\s+inhibitor/i, value: "BET/BRD4 inhibitor" },
  { pattern: /\bEZH2\s+inhibitor/i, value: "EZH2 inhibitor" },
  { pattern: /\bDNMT\s+inhibitor|\bDNA\s+methyltransferase\s+inhibitor/i, value: "DNMT inhibitor" },
  { pattern: /\bLSD1\s+inhibitor/i, value: "LSD1 inhibitor" },
  { pattern: /\bDOT1L\s+inhibitor/i, value: "DOT1L inhibitor" },
  // Antibody formats
  { pattern: /\bbispecific\s+(?:T.cell\s+)?(?:antibody|engager)|\bBiTE\b/i, value: "bispecific antibody" },
  { pattern: /\bantibody.drug\s+conjugate|\bADC\b/i, value: "antibody-drug conjugate" },
  { pattern: /\bCAR.T\s+cell|\bchimeric\s+antigen\s+receptor\s+T/i, value: "CAR-T cell therapy" },
  { pattern: /\bCAR.NK\b/i, value: "CAR-NK cell therapy" },
  { pattern: /\bmonoclonal\s+antibody|\bhumanized\s+(?:\w+\s+)?antibody/i, value: "monoclonal antibody" },
  // Protein degradation
  { pattern: /\bPROTAC\b|\btargeted\s+protein\s+degradation|\bprotein\s+degrader/i, value: "targeted protein degradation (PROTAC)" },
  { pattern: /\bmolecular\s+glue\b/i, value: "molecular glue degrader" },
  // Oncogenic drivers
  { pattern: /\bKRAS\s+(?:G12[A-Z]\s+)?inhibitor|\bRAS\s+(?:pathway\s+)?inhibitor|\bRAS.MAPK\s+inhibitor/i, value: "KRAS/RAS inhibitor" },
  // Gene / RNA therapy
  { pattern: /\bgene\s+replacement\s+therap|\bgene\s+correction(?!\s+factor)/i, value: "gene replacement therapy" },
  { pattern: /\bCRISPR.Cas\s*(?:9|12|13)?\b|\bgene\s+editing/i, value: "CRISPR gene editing" },
  { pattern: /\bsiRNA\b|\bRNAi\b|\bRNA\s+interference/i, value: "RNA interference (siRNA)" },
  { pattern: /\bantisense\s+oligonucleotide|\bASO\b|\bgapmer/i, value: "antisense oligonucleotide (ASO)" },
  { pattern: /\bmRNA\s+(?:therap|vaccine|platform)/i, value: "mRNA therapy" },
  // Inflammation / cytokine
  { pattern: /\banti.TNF.?\b|\bTNF.?\s+(?:inhibitor|blockade|neutralization)/i, value: "anti-TNF therapy" },
  { pattern: /\bIL.6\s+(?:receptor\s+)?(?:inhibitor|antagonist|blockade)|\banti.IL.6/i, value: "IL-6/IL-6R inhibitor" },
  { pattern: /\bIL.17\s+(?:inhibitor|antagonist|blockade)|\banti.IL.17/i, value: "IL-17 inhibitor" },
  { pattern: /\bIL.23\s+(?:inhibitor|antagonist|blockade)|\banti.IL.23/i, value: "IL-23 inhibitor" },
  { pattern: /\bIL.1\s*[Bβ]?\s+(?:inhibitor|antagonist|blockade)|\banti.IL.1\b|\bIL.1\s+receptor\s+antagonist/i, value: "IL-1 inhibitor" },
  { pattern: /\bcomplement\s+(?:system\s+)?inhibitor|\bC[35]\s+inhibitor|\bfactor\s+[BD]\s+inhibitor/i, value: "complement inhibitor" },
  // Metabolism
  { pattern: /\bGLP.1\s+(?:receptor\s+)?agonist|\bincretin\s+mimetic/i, value: "GLP-1 receptor agonist" },
  { pattern: /\bPCSK9\s+inhibitor|\banti.PCSK9/i, value: "PCSK9 inhibitor" },
  { pattern: /\bPPAR.?\s+(?:agonist|modulator)/i, value: "PPAR agonist" },
  // Neurodegeneration
  { pattern: /\banti.amyloid|\bamyloid.?\s+(?:clearance|antibody|targeting)\b/i, value: "amyloid-targeting antibody" },
  { pattern: /\btau\s+(?:aggregation\s+)?inhibitor|\banti.tau\b/i, value: "tau aggregation inhibitor" },
  { pattern: /\bdopamine\s+(?:D[12]\s+)?(?:agonist|receptor\s+agonist)|dopaminergic\s+agonist/i, value: "dopamine receptor agonist" },
  // Antiviral / antimicrobial
  { pattern: /\bviral\s+protease\s+inhibitor|\bNS3\s+protease|\bHCV\s+protease/i, value: "viral protease inhibitor" },
  { pattern: /\bnucleos(?:ide|otide)\s+(?:analog|reverse\s+transcriptase\s+)?inhibitor|\bNRTI\b|\bNNRTI\b/i, value: "nucleoside reverse transcriptase inhibitor" },
  { pattern: /\bneuraminidase\s+inhibitor/i, value: "neuraminidase inhibitor" },
  { pattern: /\bintegrase\s+inhibitor/i, value: "integrase inhibitor" },
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
  targetClass?: string | null;
  unmetNeedSeverity?: number | null;
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

    // ── Mechanism of action: text pattern matching ──────────────────────────────
    if (!humanV.mechanismOfAction && (!asset.mechanismOfAction || asset.mechanismOfAction.trim() === "")) {
      const effectiveMod = (fields.modality ?? asset.modality ?? "").toLowerCase();
      const isNonTherapeuticMod = /^(diagnostic|medical device|software\/algorithm|research tool|platform technology|other)$/.test(effectiveMod);
      if (!isNonTherapeuticMod) {
        const val = applyRules(MOA_RULES, text);
        if (val) { fields.mechanismOfAction = val; provenance.mechanismOfAction = "rule"; }
      }
    }
  }

  // ── Target → Indication reverse lookup ───────────────────────────────────────
  // Runs after target fill. Only fires when indication is still missing and the
  // target has a single unambiguous disease mapping (narrow high-confidence set).
  if (!humanV.indication && (!asset.indication || asset.indication === "unknown") && !fields.indication) {
    const tgt = (fields.target ?? asset.target ?? "").trim();
    if (tgt && tgt !== "unknown") {
      const fromTarget = TARGET_INDICATION[tgt];
      if (fromTarget) { fields.indication = fromTarget; provenance.indication = "rule:target"; }
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

  // ── Biology fill: indication → target → modality priority cascade ─────────────
  // Won't overwrite LLM-filled values (humanVerified guard).
  // Priority 1: indication (disease-specific, most precise)
  // Priority 2: target (mechanism-specific)
  // Priority 3: modality (broadest — safety net for assets lacking both)
  if (!humanV.biology && (!asset.biology || asset.biology.trim() === "")) {
    const effectiveIndication = (fields.indication ?? asset.indication ?? "").toLowerCase().trim();
    const effectiveTarget = (fields.target ?? asset.target ?? "").trim();
    const effectiveModality = (fields.modality ?? asset.modality ?? "").toLowerCase().trim();

    let biologyVal: string | undefined;

    if (effectiveIndication) {
      biologyVal = INDICATION_BIOLOGY[effectiveIndication];
    }

    if (!biologyVal && effectiveTarget) {
      biologyVal = TARGET_BIOLOGY[effectiveTarget];
    }

    if (!biologyVal && effectiveModality) {
      biologyVal = MODALITY_BIOLOGY[effectiveModality];
    }

    if (biologyVal) {
      fields.biology = biologyVal;
      const src = biologyVal === INDICATION_BIOLOGY[effectiveIndication]
        ? "rule:indication"
        : biologyVal === TARGET_BIOLOGY[effectiveTarget]
          ? "rule:target"
          : "rule:modality";
      provenance.biology = src;
    }
  }

  // ── Target class: groups target into functional category for landscape grid ───
  if (!asset.targetClass) {
    const tgt = (fields.target ?? asset.target ?? "").trim();
    if (tgt && tgt !== "unknown") {
      const cls = TARGET_CLASS[tgt];
      if (cls) { fields.targetClass = cls; provenance.targetClass = "rule:target"; }
    }
  }

  // ── Unmet need severity: integer 1–5 from indication ─────────────────────────
  if (asset.unmetNeedSeverity == null) {
    const ind = (fields.indication ?? asset.indication ?? "").toLowerCase().trim();
    if (ind && ind !== "unknown") {
      const sev = INDICATION_UNMET_NEED_SEVERITY[ind];
      if (sev !== undefined) { fields.unmetNeedSeverity = String(sev); provenance.unmetNeedSeverity = "rule:indication"; }
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
    target_class: string | null;
    unmet_need_severity: number | null;
  }>(sql`
    SELECT id, asset_name, summary, abstract, development_stage, ip_type, licensing_readiness,
           indication, modality, target, categories, human_verified, source_type, deep_enrich_attempts,
           comparable_drugs, unmet_need, patent_status, mechanism_of_action, biology,
           target_class, unmet_need_severity
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
        OR target_class IS NULL
        OR unmet_need_severity IS NULL
        OR data_sparse IS NULL
        OR (mechanism_of_action IS NULL AND modality NOT IN ('diagnostic','medical device','software/algorithm','research tool','platform technology','other'))
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
      targetClass: row.target_class,
      unmetNeedSeverity: row.unmet_need_severity,
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
  targetClass?: string;
  unmetNeedSeverity?: number;
  mechanismOfAction?: string;
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
      if (item.fields.targetClass) updates.targetClass = item.fields.targetClass;
      if (item.fields.unmetNeedSeverity) updates.unmetNeedSeverity = parseInt(item.fields.unmetNeedSeverity, 10);
      if (item.fields.mechanismOfAction) updates.mechanismOfAction = item.fields.mechanismOfAction;

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
    target_class: string | null;
    unmet_need_severity: number | null;
  }>(sql`
    SELECT id, asset_name, summary, abstract, development_stage, ip_type, licensing_readiness,
           indication, modality, target, categories, human_verified, source_type, deep_enrich_attempts,
           comparable_drugs, unmet_need, patent_status, mechanism_of_action, biology,
           target_class, unmet_need_severity
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
        OR target_class IS NULL
        OR unmet_need_severity IS NULL
        OR data_sparse IS NULL
        OR (mechanism_of_action IS NULL AND modality NOT IN ('diagnostic','medical device','software/algorithm','research tool','platform technology','other'))
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
      sourceType: row.source_type,
      deepEnrichAttempts: row.deep_enrich_attempts,
      biology: row.biology,
      targetClass: row.target_class,
      unmetNeedSeverity: row.unmet_need_severity,
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
