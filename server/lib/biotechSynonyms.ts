/**
 * Biotech synonym + alias expansion (Task #761).
 *
 * Query-time expansion for the Scout keyword search. Lives in TS (not in
 * Postgres dictionaries) so PMs / domain folks can review and grow the list
 * without touching SQL or running migrations.
 *
 * Design:
 *  - Bidirectional groups. Every member expands to every other member; there
 *    is no "canonical" form.
 *  - Match is case-insensitive and punctuation-insensitive (PD-1 == pd1 ==
 *    "PD 1") via a normalize step before lookup.
 *  - Quoted phrases ("...") and `-negations` are passed through verbatim.
 *    Users have signalled strict intent; we never widen those.
 *  - Corpus-noise words (technology, novel, method, ...) are stripped before
 *    lookup so they don't anchor irrelevant results. Postgres' built-in
 *    English stopwords are left alone.
 *  - Total expanded alternatives are capped (MAX_ALT_TERMS) to keep the
 *    generated tsquery size bounded.
 */

// Each entry is one bidirectional synonym group. Add new groups freely; do
// NOT add the same surface form to two groups (lookup picks first match).
// Multi-word entries are matched as a unit against the *original* query
// (before token splitting) so "non small cell lung cancer" works.
export const SYNONYM_GROUPS: string[][] = [
  // ── Immuno-oncology checkpoints ────────────────────────────────────────────
  ["PD-1", "PD1", "PDCD1", "programmed cell death 1", "programmed death 1"],
  ["PD-L1", "PDL1", "CD274", "programmed death ligand 1"],
  ["CTLA-4", "CTLA4", "CD152"],
  ["LAG-3", "LAG3", "CD223"],
  ["TIGIT", "T cell immunoreceptor with Ig and ITIM domains"],
  ["TIM-3", "TIM3", "HAVCR2"],

  // ── Cell therapy / CAR ─────────────────────────────────────────────────────
  ["CAR-T", "CAR T", "CART", "chimeric antigen receptor T cell", "chimeric antigen receptor T-cell"],
  ["CAR-NK", "CAR NK", "chimeric antigen receptor NK cell"],
  ["TCR-T", "TCR T", "T cell receptor therapy"],
  ["TIL", "tumor infiltrating lymphocyte", "tumor-infiltrating lymphocytes"],

  // ── Modalities / drug classes ──────────────────────────────────────────────
  ["mAb", "monoclonal antibody", "monoclonal antibodies"],
  ["bsAb", "bispecific antibody", "bispecific antibodies", "BiTE"],
  ["ADC", "antibody drug conjugate", "antibody-drug conjugate"],
  ["scFv", "single chain variable fragment", "single-chain Fv"],
  ["nanobody", "VHH", "single domain antibody", "single-domain antibody"],
  ["siRNA", "small interfering RNA"],
  ["shRNA", "short hairpin RNA"],
  ["ASO", "antisense oligonucleotide", "antisense oligonucleotides"],
  ["mRNA vaccine", "messenger RNA vaccine"],
  ["LNP", "lipid nanoparticle", "lipid nanoparticles"],
  ["AAV", "adeno-associated virus", "adeno associated virus"],
  ["PROTAC", "proteolysis targeting chimera", "proteolysis-targeting chimera"],
  ["LYTAC", "lysosome targeting chimera"],
  ["small molecule", "small-molecule inhibitor"],

  // ── Receptors / targets (HGNC aliases) ─────────────────────────────────────
  ["HER2", "ERBB2", "neu"],
  ["EGFR", "ERBB1", "HER1"],
  ["VEGF", "vascular endothelial growth factor"],
  ["VEGFR", "VEGF receptor", "KDR"],
  ["KRAS", "K-Ras", "K Ras"],
  ["BRAF", "B-Raf"],
  ["BCMA", "TNFRSF17", "CD269"],
  ["CD19", "B-lymphocyte antigen CD19"],
  ["CD20", "MS4A1"],
  ["CD3", "T cell co-receptor CD3"],
  ["CD47", "integrin associated protein"],
  ["GLP-1", "GLP1", "glucagon-like peptide 1", "glucagon like peptide 1"],
  ["GIP", "gastric inhibitory polypeptide"],
  ["IL-2", "IL2", "interleukin 2"],
  ["IL-6", "IL6", "interleukin 6"],
  ["IL-15", "IL15", "interleukin 15"],
  ["TNF", "TNF-alpha", "tumor necrosis factor"],
  ["TGF-beta", "TGF beta", "transforming growth factor beta"],
  ["JAK", "Janus kinase"],
  ["MEK", "MAP2K", "mitogen activated protein kinase kinase"],
  ["mTOR", "mammalian target of rapamycin"],
  ["BTK", "Bruton tyrosine kinase", "Bruton's tyrosine kinase"],
  ["PARP", "poly ADP ribose polymerase"],
  ["FGFR", "fibroblast growth factor receptor"],
  ["TROP2", "TACSTD2"],

  // ── Indications (oncology) ─────────────────────────────────────────────────
  ["NSCLC", "non small cell lung cancer", "non-small cell lung cancer", "non-small-cell lung cancer"],
  ["SCLC", "small cell lung cancer", "small-cell lung cancer"],
  ["TNBC", "triple negative breast cancer", "triple-negative breast cancer"],
  ["HCC", "hepatocellular carcinoma"],
  ["CRC", "colorectal cancer", "colorectal carcinoma"],
  ["GBM", "glioblastoma", "glioblastoma multiforme"],
  ["AML", "acute myeloid leukemia", "acute myelogenous leukemia"],
  ["ALL", "acute lymphoblastic leukemia", "acute lymphoblastic leukaemia"],
  ["CLL", "chronic lymphocytic leukemia"],
  ["CML", "chronic myeloid leukemia"],
  ["MM", "multiple myeloma"],
  ["DLBCL", "diffuse large B cell lymphoma", "diffuse large B-cell lymphoma"],
  ["RCC", "renal cell carcinoma"],
  ["mCRPC", "metastatic castration resistant prostate cancer", "metastatic castration-resistant prostate cancer"],
  ["PDAC", "pancreatic ductal adenocarcinoma"],

  // ── Indications (other) ────────────────────────────────────────────────────
  ["T2D", "type 2 diabetes", "type II diabetes"],
  ["T1D", "type 1 diabetes", "type I diabetes"],
  ["NASH", "nonalcoholic steatohepatitis", "non-alcoholic steatohepatitis", "MASH", "metabolic associated steatohepatitis"],
  ["IBD", "inflammatory bowel disease"],
  ["UC", "ulcerative colitis"],
  ["RA", "rheumatoid arthritis"],
  ["MS", "multiple sclerosis"],
  ["AD", "Alzheimer disease", "Alzheimer's disease"],
  ["PD", "Parkinson disease", "Parkinson's disease"],
  ["ALS", "amyotrophic lateral sclerosis", "Lou Gehrig disease"],
  ["DMD", "Duchenne muscular dystrophy"],
  ["SMA", "spinal muscular atrophy"],
  ["CF", "cystic fibrosis"],
  ["SCD", "sickle cell disease", "sickle cell anemia"],
  ["AMD", "age related macular degeneration", "age-related macular degeneration"],

  // ── Generic biotech abbreviations ──────────────────────────────────────────
  ["IV", "intravenous"],
  ["SC", "subcutaneous"],
  ["IP", "intellectual property"],
  ["GMP", "good manufacturing practice"],
  ["IND", "investigational new drug"],
  ["NDA", "new drug application"],
  ["BLA", "biologics license application"],
  ["FDA", "Food and Drug Administration"],
  ["EMA", "European Medicines Agency"],
  ["RNA-seq", "RNA seq", "RNA sequencing"],
  ["scRNA-seq", "single cell RNA sequencing", "single-cell RNA sequencing"],
  ["CRISPR", "clustered regularly interspaced short palindromic repeats"],
  ["GWAS", "genome wide association study", "genome-wide association study"],
];

// Corpus-specific stopwords that drag in noise from TTO listings. These are
// stripped from the user query *before* expansion. Postgres' built-in English
// stopwords (the, a, of, ...) are NOT touched here — we let the FTS dictionary
// handle those.
export const CORPUS_STOPWORDS = new Set<string>([
  "technology", "technologies",
  "novel", "novelty",
  "method", "methods",
  "system", "systems",
  "platform", "platforms",
  "composition", "compositions",
  "apparatus",
  "invention",
  "device", "devices",
  "improved", "improving",
  "use", "using", "uses",
  "thereof",
]);

// Cap on total alternatives across all groups to keep the generated tsquery
// from blowing up on long pasted text.
const MAX_ALT_TERMS = 30;

/** Normalize a string for synonym lookup: lowercase, strip non [a-z0-9 ]. */
function normalizeForLookup(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Pre-built lookup index: normalized form → group index. Groups with multi-word
// members are also indexed by their phrase form so "non small cell lung
// cancer" hits before being split into separate tokens.
const lookupIndex: Map<string, number> = (() => {
  const m = new Map<string, number>();
  SYNONYM_GROUPS.forEach((group, idx) => {
    for (const member of group) {
      const key = normalizeForLookup(member);
      if (key && !m.has(key)) m.set(key, idx);
    }
  });
  return m;
})();

const maxGroupPhraseWords: number = SYNONYM_GROUPS.reduce((max, g) => {
  for (const m of g) {
    const w = normalizeForLookup(m).split(/\s+/).filter(Boolean).length;
    if (w > max) max = w;
  }
  return max;
}, 1);

/**
 * One expanded "group" in the parsed query. `members` are the raw alternative
 * phrases (no normalization applied) that should be combined with OR; the
 * caller will pass each to `phraseto_tsquery`. `negated` mirrors websearch
 * `-token` semantics.
 */
export interface ExpandedGroup {
  members: string[];
  negated: boolean;
  // For debug surfacing only — what the user originally typed for this group.
  source: string;
}

export interface QueryExpansion {
  groups: ExpandedGroup[];
  strippedStopwords: string[];
  /** Original user query, unchanged. */
  original: string;
}

/**
 * Parse and expand a user query into ordered groups suitable for building a
 * tsquery on the SQL side. Empty / pure-stopword input returns no groups.
 */
export function expandQuery(rawQuery: string): QueryExpansion {
  const original = (rawQuery ?? "").trim();
  const out: QueryExpansion = { groups: [], strippedStopwords: [], original };
  if (!original) return out;

  // Tokenize while preserving "..." phrases and -tokens. Single regex over the
  // raw string keeps quoted phrases intact (including hyphens and spaces).
  const tokens: { text: string; quoted: boolean; negated: boolean }[] = [];
  const re = /(-?)"([^"]+)"|(-?)(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(original)) !== null) {
    if (m[2] !== undefined) {
      tokens.push({ text: m[2], quoted: true, negated: m[1] === "-" });
    } else if (m[4] !== undefined) {
      tokens.push({ text: m[4], quoted: false, negated: m[3] === "-" });
    }
  }

  // Walk tokens, greedily merging consecutive bare tokens that together match
  // a multi-word synonym phrase (e.g. "non" + "small" + "cell" + "lung" +
  // "cancer" → NSCLC group). Quoted/negated tokens are barriers.
  let altBudget = MAX_ALT_TERMS;
  const pushGroup = (g: ExpandedGroup) => {
    // Truncate members to remaining budget. Keep at least the original term.
    if (altBudget <= 0) return;
    if (g.members.length > altBudget) {
      g.members = g.members.slice(0, Math.max(1, altBudget));
    }
    altBudget -= g.members.length;
    out.groups.push(g);
  };

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];

    // Quoted phrases and negations: pass through verbatim, no expansion.
    if (tok.quoted || tok.negated) {
      pushGroup({ members: [tok.text], negated: tok.negated, source: (tok.negated ? "-" : "") + (tok.quoted ? `"${tok.text}"` : tok.text) });
      i++;
      continue;
    }

    // Greedy multi-word lookup: try the longest possible window starting at i.
    let matched = false;
    const maxWindow = Math.min(maxGroupPhraseWords, tokens.length - i);
    for (let w = maxWindow; w >= 2; w--) {
      const window = tokens.slice(i, i + w);
      if (window.some((t) => t.quoted || t.negated)) continue;
      const phrase = window.map((t) => t.text).join(" ");
      const key = normalizeForLookup(phrase);
      const groupIdx = lookupIndex.get(key);
      if (groupIdx !== undefined) {
        const group = SYNONYM_GROUPS[groupIdx];
        pushGroup({ members: [...group], negated: false, source: phrase });
        i += w;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Single-token path: stopword strip first, then 1-word lookup, else
    // pass-through as a 1-member group.
    const norm = normalizeForLookup(tok.text);
    if (CORPUS_STOPWORDS.has(norm)) {
      out.strippedStopwords.push(tok.text);
      i++;
      continue;
    }
    const groupIdx = lookupIndex.get(norm);
    if (groupIdx !== undefined) {
      pushGroup({ members: [...SYNONYM_GROUPS[groupIdx]], negated: false, source: tok.text });
    } else if (norm) {
      pushGroup({ members: [tok.text], negated: false, source: tok.text });
    }
    i++;
  }

  return out;
}
