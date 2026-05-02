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
  { pattern: /\bFDA[- ]approved\b|\bEMA[- ]approved\b|\bCE[- ]marked\b|\b510\(k\)[- ]cleared\b|\bmarket\s+approval\b|\bcommercialized\b/i, value: "approved" },
  { pattern: /\bdiscovery\s+stage\b|\bhit\s+identification\b|\blead\s+identification\b|\bproof[- ]of[- ]concept\b/i, value: "discovery" },
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

// ── Indication keyword rules ──────────────────────────────────────────────────
const INDICATION_RULES: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\bnon-small\s+cell\s+lung\s+cancer\b|\bnsclc\b/i, value: "non-small cell lung cancer" },
  { pattern: /\bsmall\s+cell\s+lung\s+cancer\b|\bsclc\b/i, value: "small cell lung cancer" },
  { pattern: /\blung\s+cancer\b|\blung\s+carcinoma\b|\blung\s+adenocarcinoma\b/i, value: "non-small cell lung cancer" },
  { pattern: /\bbreast\s+cancer\b|\bbreast\s+carcinoma\b/i, value: "breast cancer" },
  { pattern: /\btriple.negative\s+breast\b|\btnbc\b/i, value: "triple-negative breast cancer" },
  { pattern: /\bcolorectal\s+cancer\b|\bcolon\s+cancer\b|\brectal\s+cancer\b/i, value: "colorectal cancer" },
  { pattern: /\bpancreatic\s+cancer\b|\bpdac\b|\bpancreatic\s+ductal\b/i, value: "pancreatic cancer" },
  { pattern: /\bprostate\s+cancer\b|\bcrpc\b|\bcastration.resistant\s+prostate\b/i, value: "prostate cancer" },
  { pattern: /\bovarian\s+cancer\b|\bovarian\s+carcinoma\b/i, value: "ovarian cancer" },
  { pattern: /\bglioblastoma\b|\bgbm\b|\bhigh.grade\s+glioma\b/i, value: "glioblastoma" },
  { pattern: /\bglioma\b/i, value: "glioblastoma" },
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
  { pattern: /\bamyotrophic\s+lateral\s+sclerosis\b|\bals\b|\bmotor\s+neuron\s+disease\b/i, value: "amyotrophic lateral sclerosis" },
  { pattern: /\bmultiple\s+sclerosis\b/i, value: "multiple sclerosis" },
  { pattern: /\bhuntington.s?\s+disease\b/i, value: "huntington's disease" },
  { pattern: /\bepilep\w+\b|\bseizure\s+disorder\b/i, value: "epilepsy" },
  { pattern: /\bschizophrenia\b/i, value: "schizophrenia" },
  { pattern: /\bmajor\s+depressive\s+disorder\b|\bdepression\b|\bmdd\b/i, value: "major depressive disorder" },
  { pattern: /\bheart\s+failure\b|\bcardiac\s+failure\b|\bchf\b/i, value: "heart failure" },
  { pattern: /\batrial\s+fibrillation\b|\bafib\b/i, value: "atrial fibrillation" },
  { pattern: /\bhypertension\b|\bhigh\s+blood\s+pressure\b/i, value: "hypertension" },
  { pattern: /\bcoronary\s+artery\s+disease\b|\bcad\b/i, value: "coronary artery disease" },
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
  { pattern: /\bhiv\b|\baids\b/i, value: "hiv infection" },
  { pattern: /\bhepatitis\s+b\b|\bhbv\b/i, value: "hepatitis b" },
  { pattern: /\bhepatitis\s+c\b|\bhcv\b/i, value: "hepatitis c" },
  { pattern: /\bcovid.19\b|\bsars.cov.2\b/i, value: "covid-19" },
  { pattern: /\btuberculosis\b/i, value: "tuberculosis" },
  { pattern: /\bcystic\s+fibrosis\b/i, value: "cystic fibrosis" },
  { pattern: /\bduchenne\s+muscular\s+dystrophy\b|\bdmd\b/i, value: "duchenne muscular dystrophy" },
  { pattern: /\bspinal\s+muscular\s+atrophy\b|\bsma\b/i, value: "spinal muscular atrophy" },
  { pattern: /\bsickle\s+cell\s+disease\b|\bsickle\s+cell\s+anemia\b/i, value: "sickle cell disease" },
  { pattern: /\bhemophilia\b/i, value: "hemophilia" },
  { pattern: /\bchronic\s+kidney\s+disease\b|\bckd\b/i, value: "chronic kidney disease" },
  { pattern: /\bage.related\s+macular\s+degeneration\b|\bamd\b|\bmacular\s+degeneration\b/i, value: "age-related macular degeneration" },
  { pattern: /\bosteoporosis\b/i, value: "osteoporosis" },
  { pattern: /\bosteoarthritis\b/i, value: "osteoarthritis" },
];

// Heuristic: does the text look like it describes a drug/biologic?
// Only apply indication rules to drug-like assets to avoid false positives on devices/tools.
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
  summary: string;
  abstract: string | null;
  developmentStage: string;
  ipType: string | null;
  licensingReadiness: string | null;
  indication: string;
  humanVerified: Record<string, boolean> | null;
}): { fields: Record<string, string>; dataSparse: boolean } {
  const text = [(asset.summary ?? ""), (asset.abstract ?? "")].join(" ");
  const humanV = asset.humanVerified ?? {};
  const fields: Record<string, string> = {};
  const isDrug = looksLikeDrug(text);
  const dataSparse = text.trim().length < SPARSE_THRESHOLD;

  if (!dataSparse) {
    if (!humanV.developmentStage && asset.developmentStage === "unknown") {
      const val = applyRules(STAGE_RULES, text);
      if (val) fields.developmentStage = val;
    }
    if (!humanV.ipType && (!asset.ipType || asset.ipType === "unknown")) {
      const val = applyRules(IP_RULES, text);
      if (val) fields.ipType = val;
    }
    if (!humanV.licensingReadiness && (!asset.licensingReadiness || asset.licensingReadiness === "unknown")) {
      const val = applyRules(LICENSING_RULES, text);
      if (val) fields.licensingReadiness = val;
    }
    if (isDrug && !humanV.indication && asset.indication === "unknown") {
      const val = applyRules(INDICATION_RULES, text);
      if (val) fields.indication = val;
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
    summary: string;
    abstract: string | null;
    development_stage: string;
    ip_type: string | null;
    licensing_readiness: string | null;
    indication: string;
    human_verified: Record<string, boolean> | null;
  }>(sql`
    SELECT id, summary, abstract, development_stage, ip_type, licensing_readiness, indication, human_verified
    FROM ingested_assets
    WHERE relevant = true
      AND (
        development_stage IS NULL OR development_stage = 'unknown'
        OR ip_type IS NULL OR ip_type = 'unknown'
        OR licensing_readiness IS NULL OR licensing_readiness = 'unknown'
        OR indication IS NULL OR indication = 'unknown'
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
      summary: row.summary,
      abstract: row.abstract,
      developmentStage: row.development_stage,
      ipType: row.ip_type,
      licensingReadiness: row.licensing_readiness,
      indication: row.indication,
      humanVerified: row.human_verified,
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

      if (fieldKeys.length > 0) {
        const sourcesJson = JSON.stringify(Object.fromEntries(fieldKeys.map(k => [k, "rule"])));
        // Merge rule sources into existing JSONB, preserving other pipeline sources
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
    summary: string;
    abstract: string | null;
    development_stage: string;
    ip_type: string | null;
    licensing_readiness: string | null;
    indication: string;
    human_verified: Record<string, boolean> | null;
  }>(sql`
    SELECT id, summary, abstract, development_stage, ip_type, licensing_readiness, indication, human_verified
    FROM ingested_assets
    WHERE relevant = true
      AND (
        development_stage IS NULL OR development_stage = 'unknown'
        OR ip_type IS NULL OR ip_type = 'unknown'
        OR licensing_readiness IS NULL OR licensing_readiness = 'unknown'
        OR indication IS NULL OR indication = 'unknown'
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
      summary: row.summary,
      abstract: row.abstract,
      developmentStage: row.development_stage,
      ipType: row.ip_type,
      licensingReadiness: row.licensing_readiness,
      indication: row.indication,
      humanVerified: row.human_verified,
    });
    if (Object.keys(fields).length > 0) fillable++;
    if (dataSparse) dataSparseCount++;
    for (const k of Object.keys(fields)) byField[k] = (byField[k] ?? 0) + 1;
  }

  return { total: rows.rows.length, fillable, byField, dataSparseCount };
}
