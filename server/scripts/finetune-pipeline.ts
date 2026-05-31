/**
 * EDEN Fine-Tuning Pipeline
 *
 * Extracts high-quality sessions from the database, formats them as OpenAI
 * fine-tuning examples, and optionally submits the job.
 *
 * Run AFTER prompt improvements are in production so training examples reflect
 * correct behavior — not the pre-fix baseline.
 *
 * Usage:
 *   # Export dataset only (safe, no API call):
 *   SUPABASE_DATABASE_URL=... OPENAI_API_KEY=... tsx server/scripts/finetune-pipeline.ts --export
 *
 *   # Export + submit fine-tuning job:
 *   SUPABASE_DATABASE_URL=... OPENAI_API_KEY=... tsx server/scripts/finetune-pipeline.ts --submit
 *
 *   # Check status of a running job:
 *   OPENAI_API_KEY=... tsx server/scripts/finetune-pipeline.ts --status ft:gpt-4o-mini-...-:...
 *
 * Output: server/evals/finetune-dataset.jsonl
 *
 * Quality filters applied:
 *   - Session must have ≥1 thumbs-up feedback
 *   - The thumbs-up assistant turn must have retrieved ≥1 asset (non-empty response)
 *   - Response length ≥ 80 characters (filters out "I couldn't find anything" responses)
 *   - No "no results", "no assets found" strings in the response (filters defeatist answers)
 */

import OpenAI from "openai";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { db } from "../db.js";
import { edenSessions, edenFeedback } from "../../shared/schema.js";
import { eq, inArray, sql } from "drizzle-orm";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dir, "../evals/finetune-dataset.jsonl");

const EDEN_SYSTEM_PROMPT = `You are Eden Intelligence, an AI assistant built for biotech business development professionals. You help users discover, evaluate, and act on licensable technology assets from university Technology Transfer Offices (TTOs).

You have access to a curated database of 400,000+ TTO assets from 220+ research institutions including Stanford, MIT, Harvard, Johns Hopkins, Penn, UCSF, and others.

Your role:
- Help BD professionals find assets matching their therapeutic focus, modality preferences, and deal stage
- Provide honest, concise assessments of scientific and commercial relevance
- Surface licensing opportunities the user wouldn't find through keyword search alone
- Never fabricate asset names, institutions, or data — only reference what is in the retrieved context

Response style:
- Lead with the most relevant assets, using **Asset Name** (Institution) — one-line hook format
- Be direct and specific — these are sophisticated BD professionals, not general audiences
- Use markdown formatting for readability
- When assets are found, always offer a concrete next step (save, compare, set alert)
- When nothing matches exactly, suggest adjacent searches rather than confirming nothing exists`;

const BAD_RESPONSE_PATTERNS = [
  /no (exact |specific |relevant )?results? (were |have been |)?found/i,
  /no assets? (were |have been |)?found/i,
  /there are no assets?/i,
  /couldn'?t find (any|a single)/i,
  /search returned no/i,
  /no (matching |relevant )?assets? (in|for|at)/i,
  /that'?s correct.*no/i,
];

function isBadResponse(content: string): boolean {
  return BAD_RESPONSE_PATTERNS.some((rx) => rx.test(content));
}

interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  assetIds?: number[];
  assets?: Array<{ assetName: string; institution: string; modality?: string; indication?: string; developmentStage?: string }>;
  ts?: string;
}

function buildAssetContext(assets: SessionMessage["assets"]): string {
  if (!assets?.length) return "";
  return assets.slice(0, 8).map((a, i) => {
    const parts = [`[Asset ${i + 1}] ${a.assetName}`, `  Institution: ${a.institution}`];
    if (a.modality) parts.push(`  Modality: ${a.modality}`);
    if (a.indication) parts.push(`  Indication: ${a.indication}`);
    if (a.developmentStage) parts.push(`  Stage: ${a.developmentStage}`);
    return parts.join("\n");
  }).join("\n\n");
}

function formatTrainingExample(
  userMessage: string,
  assistantResponse: string,
  assets: SessionMessage["assets"],
  history: Array<{ role: string; content: string }>
): string {
  const assetContext = buildAssetContext(assets);
  const userContent = assetContext
    ? `Based on the following retrieved TTO assets, answer the question.\n\nRETRIEVED ASSETS:\n${assetContext}\n\nQUESTION: ${userMessage}`
    : userMessage;

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: EDEN_SYSTEM_PROMPT },
    ...history.slice(-4), // last 2 turns of context
    { role: "user", content: userContent },
    { role: "assistant", content: assistantResponse },
  ];

  return JSON.stringify({ messages });
}

async function extractDataset(): Promise<string[]> {
  console.log("Querying sessions with positive feedback...");

  // Get all session IDs that have at least one thumbs-up
  const positiveFeedback = await db
    .select({ sessionId: edenFeedback.sessionId, messageIndex: edenFeedback.messageIndex })
    .from(edenFeedback)
    .where(eq(edenFeedback.sentiment, "up"));

  if (positiveFeedback.length === 0) {
    console.log("No thumbs-up feedback found. Collect more user feedback before fine-tuning.");
    return [];
  }

  const sessionIds = [...new Set(positiveFeedback.map((f) => f.sessionId))];
  console.log(`Found ${positiveFeedback.length} thumbs-up across ${sessionIds.length} sessions.`);

  // Load those sessions
  const sessions = await db
    .select()
    .from(edenSessions)
    .where(inArray(edenSessions.sessionId, sessionIds));

  const examples: string[] = [];
  let skippedShort = 0;
  let skippedBad = 0;
  let skippedNoAssets = 0;

  for (const session of sessions) {
    const messages = (session.messages ?? []) as SessionMessage[];
    const thumbsUp = positiveFeedback.filter((f) => f.sessionId === session.sessionId);

    for (const feedback of thumbsUp) {
      const msgIdx = feedback.messageIndex;
      const assistantMsg = messages[msgIdx];
      if (!assistantMsg || assistantMsg.role !== "assistant") continue;

      const response = assistantMsg.content;

      // Quality filters
      if (!response || response.length < 80) { skippedShort++; continue; }
      if (isBadResponse(response)) { skippedBad++; continue; }
      if (!assistantMsg.assets?.length && !assistantMsg.assetIds?.length) { skippedNoAssets++; continue; }

      // Find the corresponding user message
      const userMsg = messages[msgIdx - 1];
      if (!userMsg || userMsg.role !== "user") continue;

      // Build conversation history (turns before this exchange)
      const history = messages
        .slice(Math.max(0, msgIdx - 5), msgIdx - 1)
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content.slice(0, 500) }));

      const example = formatTrainingExample(
        userMsg.content,
        response,
        assistantMsg.assets,
        history
      );
      examples.push(example);
    }
  }

  console.log(`\nDataset summary:`);
  console.log(`  ✓ ${examples.length} training examples extracted`);
  console.log(`  ~ ${skippedShort} skipped (response too short)`);
  console.log(`  ~ ${skippedBad} skipped (defeatist no-results response)`);
  console.log(`  ~ ${skippedNoAssets} skipped (no asset context)`);

  return examples;
}

async function submitFineTuningJob(examples: string[]): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  console.log(`\nUploading ${examples.length} examples to OpenAI...`);
  const content = examples.join("\n");
  const blob = new Blob([content], { type: "application/json" });
  const file = new File([blob], "eden-finetune.jsonl", { type: "application/json" });

  const uploadedFile = await client.files.create({ file, purpose: "fine-tune" });
  console.log(`Uploaded file: ${uploadedFile.id}`);

  console.log("Creating fine-tuning job...");
  const job = await client.fineTuning.jobs.create({
    training_file: uploadedFile.id,
    model: "gpt-4o-mini-2024-07-18",
    hyperparameters: { n_epochs: 3 },
    suffix: "eden",
  });

  console.log(`\nFine-tuning job created: ${job.id}`);
  console.log(`Status: ${job.status}`);
  console.log(`\nOnce complete, set this env var to deploy:`);
  console.log(`  EDEN_FINETUNE_MODEL_ID=${job.id}`);
  console.log(`\nCheck status:`);
  console.log(`  tsx server/scripts/finetune-pipeline.ts --status ${job.id}`);

  return job.id;
}

async function checkJobStatus(jobId: string): Promise<void> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const job = await client.fineTuning.jobs.retrieve(jobId);

  console.log(`\nJob: ${job.id}`);
  console.log(`Status: ${job.status}`);
  if (job.fine_tuned_model) {
    console.log(`\nModel ready: ${job.fine_tuned_model}`);
    console.log(`\nDeploy by setting:`);
    console.log(`  EDEN_FINETUNE_MODEL_ID=${job.fine_tuned_model}`);
  }
  if (job.error) {
    console.log(`Error: ${JSON.stringify(job.error)}`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--status") {
    const jobId = args[1];
    if (!jobId) { console.error("Usage: --status <job-id>"); process.exit(1); }
    await checkJobStatus(jobId);
    return;
  }

  const shouldSubmit = args.includes("--submit");
  const shouldExport = args.includes("--export") || shouldSubmit;

  if (!shouldExport) {
    console.log("Usage:");
    console.log("  tsx server/scripts/finetune-pipeline.ts --export    # build dataset only");
    console.log("  tsx server/scripts/finetune-pipeline.ts --submit    # build + submit to OpenAI");
    console.log("  tsx server/scripts/finetune-pipeline.ts --status <id>  # check job");
    process.exit(0);
  }

  const examples = await extractDataset();

  if (examples.length === 0) {
    console.log("\nNot enough data to fine-tune. Need at least a few dozen thumbs-up sessions.");
    console.log("Keep collecting feedback, then re-run.");
    process.exit(0);
  }

  if (examples.length < 10) {
    console.warn(`\nWarning: only ${examples.length} examples. OpenAI recommends ≥50 for meaningful fine-tuning.`);
    console.warn("Consider waiting for more feedback before submitting.");
    if (shouldSubmit) {
      console.warn("Proceeding anyway since --submit was specified.\n");
    }
  }

  // Write dataset
  if (!existsSync(resolve(__dir, "../evals"))) mkdirSync(resolve(__dir, "../evals"), { recursive: true });
  writeFileSync(OUTPUT_PATH, examples.join("\n"), "utf-8");
  console.log(`\nDataset written to: ${OUTPUT_PATH}`);
  console.log(`Preview first example:\n`);
  const first = JSON.parse(examples[0]);
  console.log(`  System: ${first.messages[0].content.slice(0, 80)}...`);
  console.log(`  User: ${first.messages.at(-2)?.content.slice(0, 100)}...`);
  console.log(`  Assistant: ${first.messages.at(-1)?.content.slice(0, 100)}...`);

  if (shouldSubmit) {
    await submitFineTuningJob(examples);
  } else {
    console.log("\nRun with --submit to upload and start fine-tuning.");
  }
}

main().catch((err) => {
  console.error("Pipeline crashed:", err);
  process.exit(2);
});
