/**
 * EDEN Conversation Tester
 * Fires real conversations at the live API and prints full responses.
 *
 * Usage (run on Replit):
 *   EDEN_TOKEN="eyJ..." tsx server/scripts/convo-test.ts
 */

const BASE_URL = "https://helix-radar.replit.app";

// Read token from env var, or from .eden-token file in project root
let TOKEN = process.env.EDEN_TOKEN ?? "";
if (!TOKEN) {
  try {
    const { readFileSync } = await import("fs");
    TOKEN = readFileSync(".eden-token", "utf-8").trim();
  } catch {
    console.error("No token found. Either:");
    console.error("  1. Create a file called .eden-token in the project root and paste your token there");
    console.error("  2. Set EDEN_TOKEN env var");
    process.exit(1);
  }
}

const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const DIM    = "\x1b[2m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

const BAD_PATTERNS = [
  /no (exact |specific |relevant )?results? (were |)?found/i,
  /no assets? (were |)?found/i,
  /there are no assets?/i,
  /couldn'?t find (any|a single)/i,
  /search returned no/i,
  /that'?s correct.*no/i,
  /returned no results/i,
];

async function chat(message: string, sessionId?: string): Promise<{
  response: string;
  assetCount: number;
  sessionId: string;
}> {
  const res = await fetch(`${BASE_URL}/api/eden/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ message, sessionId }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let fullText = "";
  let assetCount = 0;
  let outSessionId = sessionId ?? "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const blocks = buf.split("\n\n");
    buf = blocks.pop() ?? "";

    for (const block of blocks) {
      const evtMatch = block.match(/^event: (\w+)/m);
      const dataMatch = block.match(/^data: (.+)/m);
      if (!evtMatch || !dataMatch) continue;
      try {
        const payload = JSON.parse(dataMatch[1]) as Record<string, unknown>;
        if (evtMatch[1] === "token") fullText += (payload.text as string) ?? "";
        if (evtMatch[1] === "context") {
          assetCount = ((payload.assets as unknown[]) ?? []).length;
          if (payload.sessionId) outSessionId = payload.sessionId as string;
        }
        if (evtMatch[1] === "done" && payload.sessionId) outSessionId = payload.sessionId as string;
        if (evtMatch[1] === "error") throw new Error((payload.message as string) ?? "Chat error");
      } catch (e) {
        if ((e as Error).message.includes("Chat error") || (e as Error).message.includes("error")) throw e;
      }
    }
  }

  return { response: fullText.trim(), assetCount, sessionId: outSessionId };
}

function grade(response: string, assetCount: number, expectAssets: boolean): "PASS" | "WARN" | "FAIL" {
  const hasBad = BAD_PATTERNS.some((p) => p.test(response));
  if (expectAssets && assetCount === 0 && hasBad) return "FAIL";
  if (expectAssets && assetCount === 0) return "WARN";
  if (hasBad) return "WARN";
  return "PASS";
}

function printResult(label: string, result: "PASS" | "WARN" | "FAIL", assetCount: number, response: string) {
  const icon = result === "PASS" ? `${GREEN}✓` : result === "WARN" ? `${YELLOW}~` : `${RED}✗`;
  console.log(`\n${icon} ${BOLD}${label}${RESET} ${DIM}(${assetCount} assets)${RESET}`);
  const preview = response.slice(0, 400).replace(/\n+/g, " ");
  console.log(`  ${DIM}${preview}${response.length > 400 ? "…" : ""}${RESET}`);
  if (result === "FAIL") {
    console.log(`  ${RED}⚠ Defeatist response detected${RESET}`);
  }
}

interface Scenario {
  label: string;
  turns: Array<{ msg: string; expectAssets: boolean }>;
}

const SCENARIOS: Scenario[] = [
  {
    label: "Pediatric oncology (known failure)",
    turns: [
      { msg: "pediatric oncology", expectAssets: true },
    ],
  },
  {
    label: "Pediatric oncology pushback",
    turns: [
      { msg: "pediatric oncology", expectAssets: true },
      { msg: "you're saying there's not a single asset focused on childhood cancer?", expectAssets: true },
    ],
  },
  {
    label: "Multi-turn context shift",
    turns: [
      { msg: "gene therapy for rare disease", expectAssets: true },
      { msg: "what about UK institutions only?", expectAssets: true },
      { msg: "compare the first two", expectAssets: true },
    ],
  },
  {
    label: "Vague company stage question",
    turns: [
      { msg: "I'm a Series A company focused on metabolic disease, what's realistic for licensing?", expectAssets: true },
    ],
  },
  {
    label: "Informal institution name",
    turns: [
      { msg: "what does Hopkins have in neurology?", expectAssets: true },
    ],
  },
  {
    label: "Back-reference after zero results",
    turns: [
      { msg: "xyzzyx disease treatment assets", expectAssets: false },
      { msg: "what about similar or adjacent areas?", expectAssets: true },
    ],
  },
  {
    label: "IP question on prior asset",
    turns: [
      { msg: "antibody for autoimmune disease", expectAssets: true },
      { msg: "what's the IP situation on this one?", expectAssets: true },
    ],
  },
  {
    label: "Short disease name alone",
    turns: [
      { msg: "leukemia", expectAssets: true },
    ],
  },
  {
    label: "Greeting then query",
    turns: [
      { msg: "good evening eden", expectAssets: false },
      { msg: "I'm building a company in oncology", expectAssets: true },
    ],
  },
];

async function main() {
  console.log(`\n${BOLD}EDEN Conversation Test — ${SCENARIOS.length} scenarios${RESET}`);
  console.log(`${DIM}Target: ${BASE_URL}${RESET}\n`);

  const results: Array<{ label: string; result: "PASS" | "WARN" | "FAIL" }> = [];

  for (const scenario of SCENARIOS) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`${CYAN}${BOLD}▶ ${scenario.label}${RESET}`);

    let sessionId: string | undefined;
    let worstResult: "PASS" | "WARN" | "FAIL" = "PASS";

    for (let t = 0; t < scenario.turns.length; t++) {
      const turn = scenario.turns[t];
      console.log(`  ${DIM}User: "${turn.msg}"${RESET}`);

      try {
        const { response, assetCount, sessionId: sid } = await chat(turn.msg, sessionId);
        sessionId = sid;
        const result = grade(response, assetCount, turn.expectAssets);
        if (result === "FAIL" || (result === "WARN" && worstResult !== "FAIL")) worstResult = result;
        printResult(`Turn ${t + 1}`, result, assetCount, response);
      } catch (err) {
        console.log(`  ${RED}ERROR: ${(err as Error).message}${RESET}`);
        worstResult = "FAIL";
      }

      await new Promise((r) => setTimeout(r, 1500));
    }

    results.push({ label: scenario.label, result: worstResult });
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`${BOLD}Summary${RESET}`);
  for (const r of results) {
    const icon = r.result === "PASS" ? `${GREEN}✓` : r.result === "WARN" ? `${YELLOW}~` : `${RED}✗`;
    console.log(`  ${icon} ${r.label}${RESET}`);
  }

  const passed = results.filter((r) => r.result === "PASS").length;
  const warned = results.filter((r) => r.result === "WARN").length;
  const failed = results.filter((r) => r.result === "FAIL").length;
  console.log(`\n${GREEN}${passed} clean${RESET}  ${YELLOW}${warned} warnings${RESET}  ${RED}${failed} failed${RESET} / ${results.length} total\n`);
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
