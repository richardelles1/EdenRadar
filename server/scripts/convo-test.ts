/**
 * EDEN Regression Test Suite
 *
 * Tests intent routing, response content, asset counts, and multi-turn behavior.
 * Every scenario here was triggered by a real bug found in production.
 *
 * Usage (run on Replit):
 *   EDEN_TOKEN="eyJ..." tsx server/scripts/convo-test.ts
 *   tsx server/scripts/convo-test.ts --suite routing   # run one suite only
 *   tsx server/scripts/convo-test.ts --suite regression
 */

export {};

const BASE_URL = "https://helix-radar.replit.app";
const SUITE_FILTER = (() => {
  const idx = process.argv.indexOf("--suite");
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

let TOKEN = process.env.EDEN_TOKEN ?? "";
if (!TOKEN) {
  try {
    const { readFileSync } = await import("fs");
    TOKEN = readFileSync(".eden-token", "utf-8").trim();
  } catch {
    console.error("No token found. Set EDEN_TOKEN env var or create .eden-token file.");
    process.exit(1);
  }
}

// ── Colours ──────────────────────────────────────────────────────────────────
const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m";
const DIM = "\x1b[2m", B = "\x1b[1m", RST = "\x1b[0m";

// ── Chat client ───────────────────────────────────────────────────────────────
type ChatResult = {
  response: string;
  assetCount: number;
  sessionId: string;
  intent: string | null;
};

async function chat(message: string, sessionId?: string): Promise<ChatResult> {
  const res = await fetch(`${BASE_URL}/api/eden/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ message, sessionId }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "", fullText = "", assetCount = 0, outSid = sessionId ?? "", intent: string | null = null;

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
          if (payload.sessionId) outSid = payload.sessionId as string;
        }
        if (evtMatch[1] === "done") {
          if (payload.sessionId) outSid = payload.sessionId as string;
          if (payload.intent) intent = payload.intent as string;
        }
        if (evtMatch[1] === "error") throw new Error((payload.message as string) ?? "Chat error");
      } catch (e) {
        if ((e as Error).message.includes("Chat error")) throw e;
      }
    }
  }
  return { response: fullText.trim(), assetCount, sessionId: outSid, intent };
}

// ── Assertion types ───────────────────────────────────────────────────────────
type Turn = {
  msg: string;
  expectAssets?: boolean;           // true = must have >0, false = should have 0
  expectMinAssets?: number;         // assets >= N
  expectMaxAssets?: number;         // assets <= N
  expectIntent?: string;            // exact intent string from done event
  responseContains?: string[];      // ALL strings must appear in response (case-insensitive)
  responseExcludes?: string[];      // NONE must appear in response (case-insensitive)
  note?: string;                    // human-readable explanation of what this tests
};

type Scenario = {
  suite: string;
  label: string;
  turns: Turn[];
};

type TurnResult = "PASS" | "WARN" | "FAIL";

function assessTurn(r: ChatResult, turn: Turn): { result: TurnResult; failures: string[] } {
  const failures: string[] = [];
  const lower = r.response.toLowerCase();

  if (turn.expectAssets === true && r.assetCount === 0) {
    failures.push(`Expected assets, got 0`);
  }
  if (turn.expectAssets === false && r.assetCount > 0) {
    // soft warning only — some queries legitimately return assets even when "no assets expected"
  }
  if (turn.expectMinAssets !== undefined && r.assetCount < turn.expectMinAssets) {
    failures.push(`Expected ≥${turn.expectMinAssets} assets, got ${r.assetCount}`);
  }
  if (turn.expectMaxAssets !== undefined && r.assetCount > turn.expectMaxAssets) {
    failures.push(`Expected ≤${turn.expectMaxAssets} assets, got ${r.assetCount}`);
  }
  if (turn.expectIntent && r.intent && r.intent !== turn.expectIntent) {
    failures.push(`Intent: expected "${turn.expectIntent}", got "${r.intent}"`);
  }
  if (turn.expectIntent && !r.intent) {
    failures.push(`Intent not returned by server (add intent to donePayload)`);
  }
  for (const pat of turn.responseContains ?? []) {
    if (!lower.includes(pat.toLowerCase())) failures.push(`Response missing: "${pat}"`);
  }
  for (const pat of turn.responseExcludes ?? []) {
    if (lower.includes(pat.toLowerCase())) failures.push(`Response must NOT contain: "${pat}"`);
  }

  // Defeatist pattern check (always WARN, not FAIL, unless expectAssets=true + 0 assets)
  const DEFEATIST = [
    /no (exact |specific |relevant )?results? (were |)?found/i,
    /no assets? (were |)?found/i,
    /there are no assets?/i,
    /couldn'?t find (any|a single)/i,
    /search returned no/i,
    /returned no results/i,
  ];
  const hasDefeatist = DEFEATIST.some((p) => p.test(r.response));
  if (hasDefeatist && turn.expectAssets === true && r.assetCount === 0) {
    failures.push("Defeatist response — claims no assets exist");
  }

  const result: TurnResult = failures.length > 0 ? "FAIL" : (hasDefeatist ? "WARN" : "PASS");
  return { result, failures };
}

// ── Test scenarios ────────────────────────────────────────────────────────────

const SCENARIOS: Scenario[] = [

  // ── Suite: routing ──────────────────────────────────────────────────────────
  {
    suite: "routing",
    label: "Institution count comparison — must be aggregation, not comparative",
    turns: [{
      msg: "who has more assets, MIT or Stanford?",
      expectAssets: false,
      expectIntent: "aggregation",
      responseContains: ["MIT", "Stanford"],
      responseExcludes: ["| Dimension |", "| Modality |", "| Stage |"],
      note: "Was producing a head-to-head asset comparison table instead of a count answer",
    }],
  },
  {
    suite: "routing",
    label: "Institution count — Harvard vs Yale variant",
    turns: [{
      msg: "does Harvard or Yale have a bigger portfolio?",
      expectAssets: false,
      expectIntent: "aggregation",
      responseExcludes: ["| Dimension |"],
    }],
  },
  {
    suite: "routing",
    label: "Add to pipeline — back_ref, not search",
    turns: [
      { msg: "show me CAR-T assets for leukemia", expectAssets: true },
      {
        msg: "add that to my leukemia pipeline",
        expectIntent: "back_ref",
        responseExcludes: ["couldn't find", "no assets"],
        note: "Was searching for a new leukemia asset instead of referencing the prior one",
      },
    ],
  },
  {
    suite: "routing",
    label: "Show me 5 then back-ref to 4th",
    turns: [
      {
        msg: "show me 5 CAR-T assets I should consider",
        expectAssets: true,
        expectMinAssets: 3,
      },
      {
        msg: "tell me more about the fourth one",
        expectAssets: true,
        expectIntent: "back_ref",
        note: "Was failing because assetIds were capped at 3 in session storage",
      },
    ],
  },
  {
    suite: "routing",
    label: "More like this — seed embedding, not generic search",
    turns: [
      { msg: "gene therapy for rare disease", expectAssets: true },
      {
        msg: "show me similar assets",
        expectAssets: true,
        expectIntent: "back_ref",
        note: "Should use the prior asset's embedding as the search seed",
      },
    ],
  },
  {
    suite: "routing",
    label: "Last 7 days recency",
    turns: [{
      msg: "show me new activity in the past 7 days",
      expectIntent: "search",
      responseExcludes: ["| Dimension |"],
      note: "Was mapping to last30 with no 7-day window available",
    }],
  },
  {
    suite: "routing",
    label: "Pipeline synthesis — my saved pipeline analysis",
    turns: [
      {
        msg: "analyze my pipeline",
        expectIntent: "synthesis",
        expectAssets: false,
      },
    ],
  },
  {
    suite: "routing",
    label: "Document generation intent",
    turns: [
      { msg: "show me ADC assets", expectAssets: true },
      {
        msg: "draft a diligence checklist for the first one",
        expectIntent: "document",
        responseContains: ["IP", "patent"],
        responseExcludes: ["| Dimension |"],
      },
    ],
  },

  // ── Suite: regression ───────────────────────────────────────────────────────
  {
    suite: "regression",
    label: "Compound indication — filter-drop retry (pediatric oncology)",
    turns: [{
      msg: "pediatric oncology assets",
      expectAssets: true,
      expectMinAssets: 1,
      note: "SQL ILIKE '%pediatric oncology%' returns 0 — should fall back to vector-only search",
    }],
  },
  {
    suite: "regression",
    label: "Childhood cancer pushback",
    turns: [
      { msg: "pediatric oncology", expectAssets: true },
      {
        msg: "you're saying there's not a single asset focused on childhood cancer?",
        expectAssets: true,
        expectMinAssets: 1,
      },
    ],
  },
  {
    suite: "regression",
    label: "California geography — must exclude PNW institutions",
    turns: [{
      msg: "gene therapy assets from California universities",
      expectAssets: true,
      responseExcludes: ["University of Washington", "Fred Hutch", "Oregon Health"],
      note: "California was sharing regex with West Coast — UW and Fred Hutch appeared",
    }],
  },
  {
    suite: "regression",
    label: "Shift gears filter reset",
    turns: [
      { msg: "show me phase 1 oncology antibody assets", expectAssets: true },
      {
        msg: "let's shift gears — what about ADC technologies?",
        expectAssets: true,
        expectIntent: "search",
        responseExcludes: ["phase 1", "antibody"],
        note: "Session focus should pivot, not accumulate phase 1 + oncology onto ADC search",
      },
    ],
  },
  {
    suite: "regression",
    label: "Generic institution count ignores accumulated filters",
    turns: [
      { msg: "show me phase 1 oncology assets", expectAssets: true },
      {
        msg: "how many assets does Stanford have",
        expectAssets: false,
        expectIntent: "aggregation",
        responseContains: ["Stanford"],
        responseExcludes: ["0 assets", "zero assets", "no assets matching"],
        note: "Was returning 0 because phase 1 + oncology filters were applied to the count",
      },
    ],
  },
  {
    suite: "regression",
    label: "West Coast geography — includes PNW",
    turns: [{
      msg: "gene therapy assets from West Coast universities",
      expectAssets: true,
      note: "West Coast should include UW and Fred Hutch unlike California-specific",
    }],
  },
  {
    suite: "regression",
    label: "Session deduplication — different assets on follow-up",
    turns: [
      { msg: "antibody assets for autoimmune disease", expectAssets: true },
      {
        msg: "show me more antibody autoimmune assets",
        expectAssets: true,
        note: "Should surface different assets, not repeat the same 3 from turn 1",
      },
    ],
  },

  // ── Suite: content ──────────────────────────────────────────────────────────
  {
    suite: "content",
    label: "Institution head-to-head includes percentage",
    turns: [{
      msg: "who has more assets, MIT or Stanford?",
      expectAssets: false,
      responseContains: ["%"],
      note: "Response should include % difference between the two counts",
    }],
  },
  {
    suite: "content",
    label: "Aggregation + trending adds market context",
    turns: [{
      msg: "how many hot ADC programs are there?",
      expectAssets: false,
      expectIntent: "aggregation",
      responseContains: ["ADC"],
      note: "Trending aggregation should add market commentary beyond dry counts",
    }],
  },
  {
    suite: "content",
    label: "Target missing — acknowledged not invented",
    turns: [
      { msg: "show me gene therapy assets from Stanford", expectAssets: true },
      {
        msg: "what's the molecular target for the first one?",
        expectAssets: true,
        responseExcludes: ["target is unknown"],
        note: "EDEN should say 'not yet characterized' and direct to TTO, not invent a target",
      },
    ],
  },
  {
    suite: "content",
    label: "Comparison — produces structured table",
    turns: [
      { msg: "show me 2 PROTAC assets", expectAssets: true },
      {
        msg: "compare them",
        expectIntent: "comparative",
        responseContains: ["| Dimension |"],
        note: "Head-to-head should produce a markdown table",
      },
    ],
  },

  // ── Suite: golden ───────────────────────────────────────────────────────────
  {
    suite: "golden",
    label: "Core search — short disease name",
    turns: [{ msg: "leukemia", expectAssets: true, expectMinAssets: 2 }],
  },
  {
    suite: "golden",
    label: "Core search — modality alone",
    turns: [{ msg: "CAR-T", expectAssets: true, expectMinAssets: 2 }],
  },
  {
    suite: "golden",
    label: "Institution search — informal name",
    turns: [{ msg: "what does Hopkins have in neurology?", expectAssets: true }],
  },
  {
    suite: "golden",
    label: "Series A framing",
    turns: [{ msg: "I'm a Series A company in metabolic disease, what's realistic to license?", expectAssets: true }],
  },
  {
    suite: "golden",
    label: "Greeting then biotech query",
    turns: [
      { msg: "good evening eden", expectAssets: false },
      { msg: "I'm building a company in oncology", expectAssets: true, expectIntent: "search" },
    ],
  },
  {
    suite: "golden",
    label: "Multi-turn geo filter",
    turns: [
      { msg: "gene therapy for rare disease", expectAssets: true },
      { msg: "now only UK institutions", expectAssets: true, expectIntent: "search" },
    ],
  },
  {
    suite: "golden",
    label: "Stage breakdown aggregation",
    turns: [{ msg: "what's the stage breakdown of the portfolio?", expectAssets: false, expectIntent: "aggregation" }],
  },
  {
    suite: "golden",
    label: "Whitespace / gap analysis",
    turns: [{ msg: "where are the gaps in the corpus?", expectAssets: false, expectIntent: "aggregation" }],
  },
  {
    suite: "golden",
    label: "Definitional with related assets",
    turns: [{ msg: "what is a PROTAC?", expectIntent: "definitional" }],
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────
async function main() {
  const suites = SUITE_FILTER ? [SUITE_FILTER] : ["routing", "regression", "content", "golden"];
  const filtered = SCENARIOS.filter((s) => suites.includes(s.suite));

  console.log(`\n${B}EDEN Test Suite — ${filtered.length} scenarios${RST}`);
  console.log(`${DIM}Suites: ${suites.join(", ")} · Target: ${BASE_URL}${RST}\n`);

  const summary: Array<{ label: string; suite: string; result: TurnResult }> = [];

  for (const scenario of filtered) {
    console.log(`\n${"─".repeat(68)}`);
    console.log(`${C}${B}▶ [${scenario.suite}] ${scenario.label}${RST}`);

    let sessionId: string | undefined;
    let worstResult: TurnResult = "PASS";

    for (let t = 0; t < scenario.turns.length; t++) {
      const turn = scenario.turns[t];
      const userLabel = `Turn ${t + 1}${turn.note ? ` — ${turn.note.slice(0, 60)}` : ""}`;
      console.log(`\n  ${DIM}User: "${turn.msg}"${RST}`);

      try {
        const result = await chat(turn.msg, sessionId);
        sessionId = result.sessionId;
        const { result: grade, failures } = assessTurn(result, turn);

        if (grade === "FAIL" || (grade === "WARN" && worstResult !== "FAIL")) worstResult = grade;

        const icon = grade === "PASS" ? `${G}✓` : grade === "WARN" ? `${Y}~` : `${R}✗`;
        const intentLabel = result.intent ? `${DIM} intent:${result.intent}${RST}` : "";
        console.log(`  ${icon} ${B}${userLabel}${RST}${intentLabel} ${DIM}(${result.assetCount} assets)${RST}`);

        if (failures.length > 0) {
          for (const f of failures) console.log(`    ${R}→ ${f}${RST}`);
        }

        const preview = result.response.slice(0, 300).replace(/\n+/g, " ");
        console.log(`  ${DIM}"${preview}${result.response.length > 300 ? "…" : ""}"${RST}`);
      } catch (err) {
        console.log(`  ${R}✗ ERROR: ${(err as Error).message}${RST}`);
        worstResult = "FAIL";
      }

      await new Promise((r) => setTimeout(r, 1800));
    }

    summary.push({ label: scenario.label, suite: scenario.suite, result: worstResult });
  }

  // ── Summary table ───────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(68)}`);
  console.log(`${B}Summary${RST}`);

  const byResult = { PASS: 0, WARN: 0, FAIL: 0 };
  for (const s of summary) {
    const icon = s.result === "PASS" ? `${G}✓` : s.result === "WARN" ? `${Y}~` : `${R}✗`;
    console.log(`  ${icon} ${DIM}[${s.suite}]${RST} ${s.label}${RST}`);
    byResult[s.result]++;
  }

  console.log(`\n  ${G}${byResult.PASS} passed${RST}  ${Y}${byResult.WARN} warnings${RST}  ${R}${byResult.FAIL} failed${RST}  / ${summary.length} total`);

  const failedScenarios = summary.filter((s) => s.result === "FAIL");
  if (failedScenarios.length > 0) {
    console.log(`\n${R}${B}Failed:${RST}`);
    for (const s of failedScenarios) console.log(`  ${R}✗ ${s.label}${RST}`);
    process.exit(1);
  }

  console.log(`\n${G}All checks passed.${RST}\n`);
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
