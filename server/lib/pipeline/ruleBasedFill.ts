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
];

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
}): { fields: Record<string, string>; dataSparse: boolean } {
  const text = [(asset.assetName ?? ""), (asset.summary ?? ""), (asset.abstract ?? "")].join(" ");
  const humanV = asset.humanVerified ?? {};
  const fields: Record<string, string> = {};
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

    // ── Modality: categories first (structured signal), then text rules ──────
    if (!humanV.modality && (!asset.modality || asset.modality === "unknown")) {
      const fromCats = cats.length > 0 ? applyCategoriesToModality(cats) : null;
      const val = fromCats ?? applyRules(MODALITY_RULES, text);
      if (val) fields.modality = val;
    }

    // ── Indication: apply to all non-sparse assets, not just drug-like ones.
    // Indication (25 pts in scoring) is too valuable to gate behind isDrug —
    // devices, diagnostics, and tools all have clinical applications that map
    // to indication. Text rules run first (more specific); category map is fallback.
    if (!humanV.indication && (!asset.indication || asset.indication === "unknown")) {
      const fromText = applyRules(INDICATION_RULES, text);
      const fromCats = cats.length > 0 ? applyCategoriesToIndication(cats) : null;
      const val = fromText ?? fromCats;
      if (val) fields.indication = val;
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

  return { fields, dataSparse };
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
  }>(sql`
    SELECT id, asset_name, summary, abstract, development_stage, ip_type, licensing_readiness,
           indication, modality, target, categories, human_verified, source_type
    FROM ingested_assets
    WHERE relevant = true
      AND (
        development_stage IS NULL OR development_stage = 'unknown'
        OR ip_type IS NULL OR ip_type = 'unknown'
        OR licensing_readiness IS NULL OR licensing_readiness = 'unknown'
        OR indication IS NULL OR indication = 'unknown'
        OR modality IS NULL OR modality = 'unknown'
        OR target IS NULL OR target = 'unknown'
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
  const toWrite: Array<{ id: number; fields: Record<string, string>; dataSparse: boolean }> = [];

  for (const row of rows.rows) {
    if (abortCheck?.()) break;

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
      sourceType: row.source_type,
    });

    if (Object.keys(fields).length > 0 || dataSparse) {
      toWrite.push({ id: row.id, fields, dataSparse });
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
  enrichmentSources?: SQL;
};

async function flushWrites(
  batch: Array<{ id: number; fields: Record<string, string>; dataSparse: boolean }>,
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

      if (fieldKeys.length > 0) {
        const sourcesJson = JSON.stringify(Object.fromEntries(fieldKeys.map(k => [k, "rule"])));
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
  }>(sql`
    SELECT id, asset_name, summary, abstract, development_stage, ip_type, licensing_readiness,
           indication, modality, target, categories, human_verified, source_type
    FROM ingested_assets
    WHERE relevant = true
      AND (
        development_stage IS NULL OR development_stage = 'unknown'
        OR ip_type IS NULL OR ip_type = 'unknown'
        OR licensing_readiness IS NULL OR licensing_readiness = 'unknown'
        OR indication IS NULL OR indication = 'unknown'
        OR modality IS NULL OR modality = 'unknown'
        OR target IS NULL OR target = 'unknown'
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
      sourceType: row.source_type,
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
