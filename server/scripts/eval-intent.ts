/**
 * EDEN Intent Classification Evaluator
 *
 * Tests classifyIntent() against the canonical case suite.
 * Requires only OPENAI_API_KEY — no database connection needed.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... tsx server/scripts/eval-intent.ts
 *   OPENAI_API_KEY=sk-... tsx server/scripts/eval-intent.ts --filter i22
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import { classifyIntent } from "../lib/eden/rag.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const casesPath = resolve(__dir, "../evals/cases.json");

interface IntentCase {
  id: string;
  label: string;
  message: string;
  hasPriorAssets: boolean;
  expect: {
    intent?: string;
    backRefPosition?: number | null;
    liveSource?: string | null;
    filters?: Record<string, unknown>;
  };
}

interface CaseFile {
  intent_cases: IntentCase[];
}

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function pass(msg: string) { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function fail(msg: string) { console.log(`  ${RED}✗${RESET} ${msg}`); }
function warn(msg: string) { console.log(`  ${YELLOW}~${RESET} ${msg}`); }

function checkCase(got: Awaited<ReturnType<typeof classifyIntent>>, expect: IntentCase["expect"]): { passed: boolean; failures: string[] } {
  const failures: string[] = [];

  if (expect.intent && got.intent !== expect.intent) {
    failures.push(`intent: expected "${expect.intent}", got "${got.intent}"`);
  }

  if ("backRefPosition" in expect && expect.backRefPosition !== undefined) {
    if (got.backRefPosition !== expect.backRefPosition) {
      failures.push(`backRefPosition: expected ${expect.backRefPosition}, got ${got.backRefPosition}`);
    }
  }

  if ("liveSource" in expect && expect.liveSource !== undefined) {
    if (got.liveSource !== expect.liveSource) {
      failures.push(`liveSource: expected "${expect.liveSource}", got "${got.liveSource}"`);
    }
  }

  if (expect.filters) {
    for (const [k, v] of Object.entries(expect.filters)) {
      const actual = (got.filters as Record<string, unknown>)[k];
      if (v === null && actual != null) {
        failures.push(`filters.${k}: expected null, got "${actual}"`);
      } else if (v !== null && typeof v === "string") {
        // Case-insensitive substring match for string filters
        const actualStr = String(actual ?? "").toLowerCase();
        const expectedStr = v.toLowerCase();
        if (!actualStr.includes(expectedStr) && actualStr !== expectedStr) {
          failures.push(`filters.${k}: expected "${v}", got "${actual}"`);
        }
      } else if (v !== null && typeof v === "boolean" && actual !== v) {
        failures.push(`filters.${k}: expected ${v}, got ${actual}`);
      }
    }
  }

  return { passed: failures.length === 0, failures };
}

async function main() {
  const filterArg = process.argv.includes("--filter")
    ? process.argv[process.argv.indexOf("--filter") + 1]
    : null;

  const { intent_cases }: CaseFile = JSON.parse(readFileSync(casesPath, "utf-8"));

  const cases = filterArg
    ? intent_cases.filter((c) => c.id === filterArg || c.label.includes(filterArg))
    : intent_cases;

  console.log(`\n${BOLD}EDEN Intent Eval — ${cases.length} cases${RESET}\n`);

  let passed = 0;
  let failed = 0;
  const failures: Array<{ id: string; label: string; issues: string[]; got: unknown }> = [];

  for (const c of cases) {
    process.stdout.write(`${DIM}[${c.id}]${RESET} ${c.label} ... `);
    try {
      const got = await classifyIntent(c.message, c.hasPriorAssets);
      const { passed: ok, failures: issues } = checkCase(got, c.expect);
      if (ok) {
        console.log(`${GREEN}PASS${RESET}`);
        passed++;
      } else {
        console.log(`${RED}FAIL${RESET}`);
        failed++;
        failures.push({ id: c.id, label: c.label, issues, got });
      }
    } catch (err) {
      console.log(`${RED}ERROR${RESET}`);
      failed++;
      failures.push({ id: c.id, label: c.label, issues: [(err as Error).message], got: null });
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`${BOLD}Results: ${GREEN}${passed} passed${RESET}${BOLD}, ${RED}${failed} failed${RESET}${BOLD} / ${cases.length} total${RESET}`);

  if (failures.length > 0) {
    console.log(`\n${BOLD}Failures:${RESET}`);
    for (const f of failures) {
      console.log(`\n  ${RED}[${f.id}]${RESET} ${f.label}`);
      for (const issue of f.issues) {
        fail(issue);
      }
      if (f.got) {
        console.log(`  ${DIM}got: ${JSON.stringify(f.got)}${RESET}`);
      }
    }
  }

  console.log("");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Eval runner crashed:", err);
  process.exit(2);
});
