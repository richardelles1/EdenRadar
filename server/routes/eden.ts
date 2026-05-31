import crypto from "crypto";
import type { Express } from "express";
import { db } from "../db";
import { sql, desc } from "drizzle-orm";
import { storage } from "../storage";
import { ingestedAssets, edenQueries } from "@shared/schema";
import { verifyAnyAuth } from "../lib/supabaseAuth";
import {
  embedQuery, ragQuery, directQuery, aggregationQuery, isConversational,
  resolveAggregationQuery, fetchPortfolioStats, hasMeaningfulFilters,
  getOrUpdateSessionFocus, GEO_INSTITUTION_REGEX, detectInstitutionName,
  detectAllInstitutionNames, rerankAssets, persistSessionFocus, seedSessionFocusFromDb,
  conceptQuery, deriveEngagementSignals, markEngagementReset, isEngagementResetMessage,
  isComparativeQuery, compareQuery, summarizeSession, classifyIntent,
  extractBackRefPosition, extractBackRefInstitution,
  synthesisQuery, documentQuery,
  type UserContext, type SessionFocusContext, type IntentClassification, type LiveSource,
  type CrossSessionMemory, type RankedAsset, type PipelineSavedAsset, type DocumentType, type SynthesisSnapshot, buildCrossSessionMemory,
} from "../lib/eden/rag";
import { searchClinicalTrials } from "../lib/sources/clinicaltrials";
import { searchLens } from "../lib/sources/lens";
import { searchHarvardDataverse } from "../lib/sources/harvard_dataverse";
import { searchHarvardLibraryCloud } from "../lib/sources/harvard_librarycloud";
import rateLimit from "express-rate-limit";
import { z } from "zod";

const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Key by authenticated user ID so the limit is per-user, not per-IP.
  // verifyAnyAuth runs before this middleware and sets x-user-id.
  // Falls back to IP only if auth hasn't set the header (should never happen).
  keyGenerator: (req) => (req.headers["x-user-id"] as string | undefined) ?? req.ip ?? "unknown",
  message: { error: "Too many requests — please wait a moment before trying again." },
});

// ── Action Offer Types ──────────────────────────────────────────────────────
type ActionOfferAsset = {
  id: number; assetName: string; institution: string; similarity: number;
  modality?: string | null; developmentStage?: string | null;
  indication?: string | null; sourceUrl?: string | null;
};
type AlertOfferConfig = {
  name: string; criteriaType: "custom";
  query?: string | null; modalities?: string[] | null;
  stages?: string[] | null; institutions?: string[] | null;
  cadence?: "daily" | "weekly";
};
type WriteActionOffer =
  | { type: "status_update"; ingestedAssetId: number; assetName: string; status: string; label: string }
  | { type: "note_add"; ingestedAssetId: number; assetName: string; content: string; label: string }
  | { type: "move_pipeline"; ingestedAssetId: number; assetName: string; pipelineName: string; label: string };
type ActionOffer =
  | { type: "save"; assets: ActionOfferAsset[]; targetPipelineName?: string }
  | { type: "alert"; label: string; config: AlertOfferConfig }
  | WriteActionOffer;

// Intent patterns for save and alert offer detection.
const SAVE_PATTERNS: RegExp[] = [
  /\bsave (this|it|them|these)\b/,/\bbookmark (this|it|these)\b/,
  /\badd (this|it|these|that) to\b/,/\btrack (this|it|these)\b/,
  /\bkeep (this|it|these)\b/,/\bwatchlist\b/,
  /\badd to (my |our )?(pipeline|list|watchlist|portfolio)\b/,
  /\bput (this|it|these) in\b/,/\bI('d| would) like to save\b/,/\bcan you save\b/,
  /\bhow (do I|can I) contact\b/,/\blicensing (terms|status|interest|info)\b/,
  /\bI('m| am) (very |quite |really )?(interested|intrigued)\b/,
  /\bthis is (exactly|precisely) what\b/,
  /\bthis (looks|seems) (perfect|ideal|great|promising|very relevant)\b/,
  /\bI (love|like|prefer) this\b/,/\b(most|very) (interesting|relevant|promising|compelling)\b/,
  /\bworth (evaluating|a deeper look|following up|tracking)\b/,
  /\bwant to (evaluate|explore|follow up on|dig into)\b/,
  /\bI('d| would) (like to |want to )?(evaluate|explore|discuss)\b/,
  /\bof (these|those),? (I )?prefer\b/,/\bthe (first|second|top) one\b/,
  /\bthis one specifically\b/,/\bthis particular\b/,
];
const ALERT_PATTERNS: RegExp[] = [
  /\blet me know (when|if|about)\b/,/\bnotif(y|ication) me\b/,/\balert me\b/,
  /\bkeep me posted\b/,/\bwatch (for|out for)\b/,/\bmonitor (this|new)\b/,
  /\bfollow up (on|with)\b/,/\bupdate me\b/,/\bremind me\b/,/\bnext time\b/,
  /\bif (more|anything|new) (comes?|appears?|is added)\b/,
  /\bstay (updated|informed|in the loop)\b/,
  /\bwhen (they|it|there) (comes?|arrives?|becomes? available)\b/,
  /\bare there (any more|more|others|new)\b/,/\bany more (like this|coming)\b/,
  /\bwill there be (more|new|others)\b/,
  /\banything (else |new )?(coming|in the pipeline)\b/,
  /\bmore (assets|technologies|listings) (from|at|like)\b/,
  /\bnew (assets|technologies|deals|listings) (from|at|like)\b/,
];

// Write-action patterns: status update, note addition, pipeline move
const STATUS_MAP: Array<[RegExp, string]> = [
  [/\b(in[\s-]?discussion|actively discussing|discussing)\b/i, "in_discussion"],
  [/\b(evaluating|due diligence|deep.?dive|diligence)\b/i, "evaluating"],
  [/\b(on[\s-]?hold|pause|paused|hold)\b/i, "on_hold"],
  [/\b(pass(ed)?|not interested|skip)\b/i, "passed"],
  [/\bwatching\b/i, "watching"],
];
const WRITE_STATUS_PATTERNS: RegExp[] = [
  /\b(?:mark|set|tag|update|change)(?:\s+(?:it|this|that))?\s+(?:as|to)\b/i,
  /\b(?:move|advance)(?:\s+(?:it|this|that))?\s+(?:to|into)\b/i,
  /\b(?:status|stage)\s*[:=]/i,
];
const WRITE_NOTE_PATTERNS: RegExp[] = [
  /\b(?:add|write|leave|create)\s+a?\s*note[:\s]/i,
  /\bnote(?:\s+that|:\s|[:\s])/i,
  /\bannotate\b/i,
];
const WRITE_MOVE_PATTERNS: RegExp[] = [
  /\b(?:move|transfer|put)\s+(?:this|it|that)\s+(?:to|into)\s+(?:my\s+|the\s+)?(.+?)\s+(?:pipeline|list|portfolio)\b/i,
];

function extractStatusTarget(message: string): string | null {
  for (const [rx, status] of STATUS_MAP) {
    if (rx.test(message)) return status;
  }
  return null;
}
function extractNoteContent(message: string): string | null {
  const m = message.match(/\bnote[:\s]+(.{4,200})/i) ?? message.match(/\badd(?:\s+a)?\s+note[:\s]+(.{4,200})/i);
  return m?.[1]?.trim().replace(/[.!?]*$/, "").slice(0, 200) ?? null;
}

const PIPELINE_NAME_PATTERNS: RegExp[] = [
  /\b(?:save|add) (?:it|this|these|them) to (?:my |our |the )?(.+?) (?:pipeline|list|portfolio|watchlist)\b/i,
  /\b(?:put|move) (?:it|this|these|them) (?:in|into) (?:my |our |the )?(.+?) (?:pipeline|list|portfolio|watchlist)\b/i,
  /\badd to (?:my |our |the )?(.+?) (?:pipeline|list|portfolio|watchlist)\b/i,
  /\bsave to (?:my |our |the )?(.+?) (?:pipeline|list|portfolio|watchlist)\b/i,
  /\bmy (.+?) (?:pipeline|list|portfolio|watchlist)\b/i,
];

const ALERT_NAME_PATTERNS: Array<[RegExp, number]> = [
  [/\bwatch (?:for|out for) (.+)/i, 1],
  [/\blet me know (?:when|if|about|of) (.+)/i, 1],
  [/\balert me (?:when|if|about) (.+)/i, 1],
  [/\bnotify me (?:when|if|about) (.+)/i, 1],
  [/\bkeep me (?:posted|updated|informed) (?:on|about) (.+)/i, 1],
  [/\bstay (?:updated|informed) (?:on|about) (.+)/i, 1],
  [/\bmore (.+?) from\b/i, 1],
  [/\bnew (.+?) from\b/i, 1],
];

function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

const ALERT_NAME_STOPLIST = new Set([
  "assets", "technologies", "results", "listings", "items", "things", "more", "new",
  "any", "some", "data", "info", "information", "content", "deals", "news",
]);

function extractPipelineName(message: string): string | null {
  for (const pattern of PIPELINE_NAME_PATTERNS) {
    const m = message.match(pattern);
    if (m?.[1]) return m[1].trim().slice(0, 100);
  }
  return null;
}

function extractAlertName(
  message: string,
  filters: { modality?: string | null; stage?: string | null; indication?: string | null; institution?: string | null },
): string {
  for (const [pattern, group] of ALERT_NAME_PATTERNS) {
    const m = message.match(pattern);
    if (m?.[group]) {
      const phrase = m[group].trim().replace(/[?.!,]+$/, "").slice(0, 80);
      if (phrase.length > 2 && !ALERT_NAME_STOPLIST.has(phrase.toLowerCase())) {
        return capitalize(phrase);
      }
    }
  }
  const parts: string[] = [];
  if (filters.modality) parts.push(filters.modality);
  if (filters.indication) parts.push(filters.indication);
  if (filters.stage) parts.push(filters.stage);
  if (filters.institution) parts.push(`· ${filters.institution}`);
  if (parts.length > 0) return `New ${parts.join(" ")} assets`.slice(0, 100);
  return `New: ${message.trim().slice(0, 60)}`;
}

function detectCadence(message: string): "daily" | "weekly" {
  if (/\b(daily|every day|each day|day by day)\b/i.test(message)) return "daily";
  return "weekly";
}

async function updateEdenAcceptedSignals(userId: string, asset: { modality?: string | null; diseaseIndication?: string | null }): Promise<void> {
  const prof = await storage.getIndustryProfileByUserId(userId).catch(() => null);
  if (!prof) return;
  const bp = (prof.buyerProfile as Record<string, unknown>) ?? {};
  const sigs = (bp._edenAcceptedSignals as { modalities: Record<string, number>; indications: Record<string, number> }) ?? { modalities: {}, indications: {} };
  const mods = { ...sigs.modalities };
  const inds = { ...sigs.indications };
  if (asset.modality && asset.modality !== "unknown") mods[asset.modality] = (mods[asset.modality] ?? 0) + 1;
  if (asset.diseaseIndication && asset.diseaseIndication !== "unknown") inds[asset.diseaseIndication] = (inds[asset.diseaseIndication] ?? 0) + 1;
  await storage.saveBuyerProfile(userId, { ...bp, _edenAcceptedSignals: { modalities: mods, indications: inds } });
}

function buildActionOffers(
  message: string,
  intent: string,
  retrieved: ActionOfferAsset[],
  filters: { modality?: string | null; stage?: string | null; indication?: string | null; institution?: string | null },
  acceptedSignals?: { modalities: Record<string, number>; indications: Record<string, number> } | null,
  crossSessionMemory?: CrossSessionMemory | null,
): ActionOffer[] {
  const offers: ActionOffer[] = [];
  const lower = message.toLowerCase();

  // Save: explicit or high-intent signals + search path with results
  const hasSaveIntent = SAVE_PATTERNS.some((p) => p.test(lower));
  if (hasSaveIntent && (intent === "search" || intent === "back_ref" || intent === "comparative" || intent === "definitional") && retrieved.length > 0) {
    const topAssets = retrieved.filter((a) => a.similarity >= 0.55).slice(0, 2);
    if (topAssets.length > 0) {
      const targetPipelineName = extractPipelineName(message) ?? undefined;
      offers.push({ type: "save", assets: topAssets, targetPipelineName });
    }
  }

  // Alert: notify/watch/more signals → derive config from active filters
  const hasAlertIntent = ALERT_PATTERNS.some((p) => p.test(lower));
  if (hasAlertIntent) {
    const institutionFilter = filters.institution ? [filters.institution] : null;
    const modalityFilter = filters.modality ? [filters.modality] : null;
    const stageFilter = filters.stage ? [filters.stage] : null;

    const labelParts: string[] = [];
    if (filters.institution) labelParts.push(filters.institution);
    if (filters.modality) labelParts.push(filters.modality);
    if (filters.indication) labelParts.push(filters.indication);
    const label = labelParts.length > 0 ? labelParts.join(", ") : "this topic";

    const hasStructuredFilter = institutionFilter || modalityFilter || stageFilter;
    const queryVal = hasStructuredFilter ? null : message.trim().slice(0, 200);

    offers.push({
      type: "alert", label,
      config: {
        name: extractAlertName(message, filters).slice(0, 100),
        query: queryVal,
        modalities: modalityFilter,
        stages: stageFilter,
        institutions: institutionFilter,
        criteriaType: "custom",
        cadence: detectCadence(message),
      },
    });
  }

  // Proactive alert: user hasn't asked but has shown repeated interest via prior actions or sessions
  if (!hasAlertIntent && (intent === "search" || intent === "back_ref") && (filters.modality || filters.indication)) {
    const acceptedMod = filters.modality ? (acceptedSignals?.modalities[filters.modality] ?? 0) : 0;
    const acceptedInd = filters.indication ? (acceptedSignals?.indications[filters.indication] ?? 0) : 0;
    const isFrequentTopic = (crossSessionMemory?.sessionCount ?? 0) >= 3 &&
      (crossSessionMemory?.topModalities[0] === filters.modality || crossSessionMemory?.topIndications[0] === filters.indication);
    if (acceptedMod >= 2 || acceptedInd >= 2 || isFrequentTopic) {
      const topic = filters.modality ?? filters.indication ?? "this area";
      offers.push({
        type: "alert",
        label: `${topic} (recommended)`,
        config: {
          name: `${filters.modality ?? filters.indication ?? "My"} Alert`,
          query: filters.modality ? null : (filters.indication ?? null),
          modalities: filters.modality ? [filters.modality] : null,
          stages: null,
          institutions: null,
          criteriaType: "custom",
          cadence: "weekly",
        },
      });
    }
  }

  // Write actions: status update, note addition, pipeline move
  // Only emitted when a single clear target asset is in context (intent is back_ref or a single-result search).
  const targetAsset = retrieved.length === 1 ? retrieved[0] : null;
  if (targetAsset) {
    const hasStatusIntent = WRITE_STATUS_PATTERNS.some((p) => p.test(message));
    if (hasStatusIntent) {
      const status = extractStatusTarget(message);
      if (status) {
        const statusLabel: Record<string, string> = { in_discussion: "In Discussion", evaluating: "Evaluating", on_hold: "On Hold", passed: "Passed", watching: "Watching" };
        offers.push({ type: "status_update", ingestedAssetId: targetAsset.id, assetName: targetAsset.assetName, status, label: `Mark as ${statusLabel[status] ?? status}` });
      }
    }
    const hasNoteIntent = WRITE_NOTE_PATTERNS.some((p) => p.test(message));
    if (hasNoteIntent) {
      const content = extractNoteContent(message);
      if (content) {
        offers.push({ type: "note_add", ingestedAssetId: targetAsset.id, assetName: targetAsset.assetName, content, label: `Add note: "${content.slice(0, 50)}${content.length > 50 ? "…" : ""}"` });
      }
    }
    const movePipelineMatch = message.match(WRITE_MOVE_PATTERNS[0]);
    if (movePipelineMatch?.[1]) {
      const pipelineName = movePipelineMatch[1].trim();
      offers.push({ type: "move_pipeline", ingestedAssetId: targetAsset.id, assetName: targetAsset.assetName, pipelineName, label: `Move to "${pipelineName}"` });
    }
  }

  return offers;
}

export function registerEdenRoutes(app: Express): void {
  const chatBodySchema = z.object({
    message: z.string().min(1).max(4000),
    sessionId: z.string().max(100).optional(),
    userContext: z.object({
      companyName: z.string().max(200).optional(),
      companyType: z.string().max(100).optional(),
      therapeuticAreas: z.array(z.string().max(100)).max(20).optional(),
      modalities: z.array(z.string().max(100)).max(20).optional(),
      dealStages: z.array(z.string().max(100)).max(20).optional(),
      engagementBoosts: z.object({
        modalities: z.record(z.number()).optional(),
        indications: z.record(z.number()).optional(),
      }).optional(),
    }).optional(),
  });

  app.post("/api/eden/chat", verifyAnyAuth, aiRateLimit, async (req, res) => {

    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid request body" });
    const { message, sessionId, userContext } = parsed.data;

    const sid = (typeof sessionId === "string" && sessionId) || crypto.randomUUID();
    const requestUserId = req.headers["x-user-id"] as string | undefined;
    const ctx: UserContext | undefined = userContext && typeof userContext === "object" ? userContext as UserContext : undefined;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Hard timeout: abort the request if the AI hasn't finished in 50 s
    const abortController = new AbortController();
    const abortTimer = setTimeout(() => abortController.abort(), 50_000);
    req.on("close", () => abortController.abort());

    // Analytics tracking — populated as the request progresses, flushed in finally.
    const _qStart = Date.now();
    let _qIntent = "search";
    let _qFilters: Record<string, unknown> = {};
    let _qAssetCount = 0;

    const sendEvent = (event: string, data: unknown) => {
      if (event === "context" && data !== null && typeof data === "object" && "assets" in data) {
        _qAssetCount = ((data as { assets?: unknown[] }).assets ?? []).length;
      }
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      let newArrivalsHint: { count: number; label: string; query: string } | undefined;
      const donePayload = () => ({ sessionId: sid, ...(newArrivalsHint ? { newArrivalsHint } : {}) });

      // ── Start embedding immediately — no session state needed ────────────────
      const embeddingPromise = embedQuery(message.trim()).catch(() => null);

      // ── Speculative broad search: fires as soon as embedding is ready ────────
      // Used directly on the no-filter search path (most common), saving the full
      // vector search latency that would otherwise sit behind classifyIntent.
      const speculativeSearchPromise: Promise<import("../storage").RetrievedAsset[] | null> =
        embeddingPromise.then((embedding) =>
          embedding
            ? storage.filteredSemanticSearch(embedding, undefined, undefined, undefined, undefined, undefined, 20, undefined, undefined, undefined, true).catch(() => null)
            : Promise.resolve(null)
        );

      // ── All DB fetches in parallel (including cross-session memory) ──────────
      const [session, portfolioStats, userProfile, preloadedRecentSessions] = await Promise.all([
        storage.getOrCreateEdenSession(sid),
        Promise.race([
          fetchPortfolioStats(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5_000)),
        ]).catch(() => undefined),
        requestUserId
          ? storage.getIndustryProfileByUserId(requestUserId).catch(() => undefined)
          : Promise.resolve(undefined),
        requestUserId
          ? storage.getRecentSessionsForUser(requestUserId, 6).catch(() => [])
          : Promise.resolve([]),
      ]);

      // Merge DB industry profile into UserContext so reranking + response generation
      // reflect the user's actual therapeutic focus, preferred modalities, and deal stages.
      const resolvedCtx: UserContext | undefined = userProfile
        ? {
            companyName: userProfile.companyName ?? ctx?.companyName,
            companyType: userProfile.companyType ?? ctx?.companyType,
            therapeuticAreas: userProfile.therapeuticAreas?.length ? userProfile.therapeuticAreas : ctx?.therapeuticAreas,
            modalities: userProfile.modalities?.length ? userProfile.modalities : ctx?.modalities,
            dealStages: userProfile.dealStages?.length ? userProfile.dealStages : ctx?.dealStages,
          }
        : ctx;
      const acceptedSignals: { modalities: Record<string, number>; indications: Record<string, number> } | null = (() => {
        const bp = userProfile?.buyerProfile as Record<string, unknown> | null | undefined;
        return (bp?._edenAcceptedSignals as { modalities: Record<string, number>; indications: Record<string, number> } | undefined) ?? null;
      })();

      const allMessages = (session.messages ?? []).map((t) => ({ role: t.role, content: t.content }));

      // ── Session summarization: at turn 8, compress older turns into a context note ──
      // Keeps the last 4 turns fresh and prepends a summary of everything prior,
      // effectively tripling usable context without growing token cost.
      const assistantTurnCount = allMessages.filter((m) => m.role === "assistant").length;
      const storedSummary = session.focusContext?._summary as string | undefined;
      let history: typeof allMessages;
      if (assistantTurnCount >= 8 && storedSummary) {
        history = [
          { role: "user" as const, content: `[Prior conversation summary]\n${storedSummary}` },
          { role: "assistant" as const, content: "Understood. Continuing from there." },
          ...allMessages.slice(-4),
        ];
      } else {
        history = allMessages.slice(-6);
      }
      // Trigger async summarization at turn 8+ when no summary exists yet.
      // Uses >= so a server restart between turns 8 and 9 doesn't permanently skip it.
      if (assistantTurnCount >= 8 && !storedSummary) {
        summarizeSession(allMessages).then(async (summary) => {
          if (summary) {
            const updatedFocus = { ...(session.focusContext ?? {}), _summary: summary } as SessionFocusContext;
            await persistSessionFocus(sid, updatedFocus).catch(() => {});
          }
        });
      }

      // ── Seed in-memory focus from DB on first message of this server process ──
      seedSessionFocusFromDb(sid, session.focusContext);

      // ── Cross-session memory: built from pre-fetched sessions (no extra round-trip) ──
      let crossSessionMemory: CrossSessionMemory | null = null;
      const isFirstTurn = (session.messages ?? []).length === 0;
      if (requestUserId && isFirstTurn) {
        crossSessionMemory = buildCrossSessionMemory(preloadedRecentSessions);
        // Non-blocking: check for new relevant assets matching user history.
        // Resolves well before the AI response finishes (~100ms vs 1-3s).
        if (crossSessionMemory) {
          const topModality = crossSessionMemory.topModalities[0];
          const topIndication = crossSessionMemory.topIndications[0];
          const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          storage.filteredCount(undefined, topModality, undefined, topIndication, undefined, undefined, since30)
            .then((newCount) => {
              if (newCount > 0) {
                const labelParts: string[] = [];
                if (topModality) labelParts.push(topModality);
                if (topIndication) labelParts.push(topIndication);
                const label = labelParts.join(" / ") || "assets";
                const queryParts: string[] = ["Show me new"];
                if (topModality) queryParts.push(topModality);
                if (topIndication) queryParts.push(topIndication);
                queryParts.push("assets from the last 30 days");
                newArrivalsHint = { count: newCount, label, query: queryParts.join(" ") };
              }
            })
            .catch(() => {});
        }
      } else if (!isFirstTurn) {
        // On subsequent turns, preserve the memory already attached to focusContext
        const stored = session.focusContext?._crossSessionMemory as CrossSessionMemory | undefined;
        if (stored) crossSessionMemory = stored;
      }

      await storage.appendEdenMessage(sid, { role: "user", content: message.trim() });

      // ── Portfolio institution names for two-pass detection ────────────────
      const portfolioInstitutionNames: string[] = portfolioStats?.topInstitutions?.map((i: { institution: string }) => i.institution) ?? [];

      // ── Session focus context (accumulated across turns) ──────────────────
      const focusContext = getOrUpdateSessionFocus(sid, message.trim(), portfolioInstitutionNames);
      // Attach cross-session memory to focusContext so it flows into buildSystemPrompt
      if (crossSessionMemory) focusContext._crossSessionMemory = crossSessionMemory;
      if (isEngagementResetMessage(message.trim())) {
        markEngagementReset(sid);
      }

      // Persist updated focus fire-and-forget
      persistSessionFocus(sid, focusContext).catch((e) =>
        console.warn("[eden] focus persist failed:", e?.message ?? e)
      );

      // Pre-compute prior-asset state for back-ref and comparative routing.
      const lastAssistantWithAssets = [...(session.messages ?? [])].reverse().find(
        (m) => m.role === "assistant" && (m.assetIds?.length ?? 0) > 0
      );
      const priorIds: number[] = (lastAssistantWithAssets?.assetIds ?? []).slice(0, 3);

      // Derive engagement signals early so back-ref and definitional paths also benefit.
      const engagementSignals = deriveEngagementSignals(sid, session.messages ?? []);
      // Merge client-side save boosts — explicit saves are stronger signals than passive views.
      const boosts = ctx?.engagementBoosts;
      if (boosts) {
        for (const [m, v] of Object.entries(boosts.modalities ?? {})) {
          engagementSignals.modalities[m] = (engagementSignals.modalities[m] ?? 0) + v;
        }
        for (const [ind, v] of Object.entries(boosts.indications ?? {})) {
          engagementSignals.indications[ind] = (engagementSignals.indications[ind] ?? 0) + v;
        }
      }
      // Pre-seed from cross-session history at weight 1 — weaker than session activity
      // so it's a prior, not a bias. Only fires when session signals are thin.
      if (crossSessionMemory && requestUserId) {
        for (const m of crossSessionMemory.topModalities) {
          if (!engagementSignals.modalities[m]) engagementSignals.modalities[m] = 1;
        }
        for (const ind of crossSessionMemory.topIndications) {
          if (!engagementSignals.indications[ind]) engagementSignals.indications[ind] = 1;
        }
        for (const bio of crossSessionMemory.topBiologies) {
          if (!engagementSignals.biologies[bio]) engagementSignals.biologies[bio] = 1;
        }
      }

      // Accepted action signals: weight 3 — concrete prior engagement beats passive browsing
      if (acceptedSignals) {
        for (const [m, count] of Object.entries(acceptedSignals.modalities)) {
          engagementSignals.modalities[m] = Math.max(engagementSignals.modalities[m] ?? 0, Math.min(count * 3, 9));
        }
        for (const [ind, count] of Object.entries(acceptedSignals.indications)) {
          engagementSignals.indications[ind] = Math.max(engagementSignals.indications[ind] ?? 0, Math.min(count * 3, 9));
        }
      }

      // ── LLM Intent Router (embedding already in-flight since request start) ──────
      // classifyIntent needs session state so runs here; embedding is already running.
      const [intentResult, embeddingResult] = await Promise.allSettled([
        classifyIntent(message.trim(), priorIds.length > 0, focusContext),
        embeddingPromise,
      ]);
      const intentClass: IntentClassification = intentResult.status === "fulfilled"
        ? intentResult.value
        : isConversational(message.trim())
          ? { intent: "conversational", filters: {}, backRefPosition: null, liveSource: null }
          : { intent: "search", filters: {}, backRefPosition: null, liveSource: null };
      const cachedEmbedding: number[] | null = embeddingResult.status === "fulfilled"
        ? embeddingResult.value
        : null;

      _qIntent = intentClass.intent ?? "search";

      // ── Merge LLM filters with accumulated session focus ──────────────────
      // LLM extracts what's in the current message; focusContext fills gaps with
      // prior accumulated context (e.g. a stage set two turns ago stays active).
      // recency + trending are per-query only — never merged from focusContext.
      const filters = {
        modality: intentClass.filters.modality ?? focusContext.modality,
        stage: intentClass.filters.stage ?? focusContext.stage,
        indication: intentClass.filters.indication ?? focusContext.indication,
        institution: intentClass.filters.institution ?? focusContext.institution,
        geography: intentClass.filters.geography ?? focusContext.geography,
        biology: intentClass.filters.biology ?? focusContext.biology,
        recency: intentClass.filters.recency,
        trending: intentClass.filters.trending,
      };

      _qFilters = filters as Record<string, unknown>;

      // Map recency window to a concrete Date for storage-layer filtering.
      const RECENCY_MS: Record<string, number> = {
        last30: 30 * 24 * 60 * 60 * 1000,
        last90: 90 * 24 * 60 * 60 * 1000,
        last180: 180 * 24 * 60 * 60 * 1000,
        lastyear: 365 * 24 * 60 * 60 * 1000,
      };
      const sinceDate: Date | undefined = filters.recency
        ? new Date(Date.now() - RECENCY_MS[filters.recency])
        : undefined;

      // Two-pass institution detection: if LLM didn't catch it, try pattern + portfolio scan.
      if (!filters.institution) {
        const detected = detectInstitutionName(message.trim(), portfolioInstitutionNames);
        if (detected) filters.institution = detected;
      }

      const filtersActive = hasMeaningfulFilters(filters);
      const geoRx: string | undefined = filters.geography ? GEO_INSTITUTION_REGEX[filters.geography] : undefined;

      // ── Live external source fork ──────────────────────────────────────────────
      // Fires in parallel with TTO corpus search when classifyIntent returns a
      // non-null liveSource. Results are sent as externalResults in the context
      // SSE event — supplemental to, never replacing, TTO corpus results.
      const liveSource: LiveSource | null = intentClass.liveSource;

      const LIVE_SEARCH_TIMEOUT = 4000;
      const liveResultsPromise: Promise<Array<{ id: string; title: string; url: string; source: LiveSource; status?: string; sponsor?: string; date?: string; metadata?: Record<string, unknown> }>> = liveSource
        ? (async () => {
            try {
              const query = message.trim();
              let signals;
              if (liveSource === "clinicaltrials") {
                signals = await Promise.race([
                  searchClinicalTrials(query, 8),
                  new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), LIVE_SEARCH_TIMEOUT)),
                ]);
              } else if (liveSource === "patents") {
                signals = await Promise.race([
                  searchLens(query, 8),
                  new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), LIVE_SEARCH_TIMEOUT)),
                ]);
              } else {
                const [dataverse, librarycloud] = await Promise.allSettled([
                  Promise.race([searchHarvardDataverse(query, 5), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), LIVE_SEARCH_TIMEOUT))]),
                  Promise.race([searchHarvardLibraryCloud(query, 5), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), LIVE_SEARCH_TIMEOUT))]),
                ]);
                signals = [
                  ...(dataverse.status === "fulfilled" ? dataverse.value : []),
                  ...(librarycloud.status === "fulfilled" ? librarycloud.value : []),
                ].slice(0, 8);
              }
              return (signals ?? []).map((s) => ({
                id: s.id,
                title: s.title,
                url: s.url,
                source: liveSource,
                status: (s.metadata as Record<string, unknown>)?.status as string | undefined,
                sponsor: s.institution_or_sponsor || s.authors_or_owner || undefined,
                date: s.date || undefined,
                metadata: s.metadata as Record<string, unknown> | undefined,
              }));
            } catch {
              return [];
            }
          })()
        : Promise.resolve([]);

      // ── Routing decisions from LLM intent ────────────────────────────────────
      const isBackRef = intentClass.intent === "back_ref" && priorIds.length > 0;
      const isComparative = intentClass.intent === "comparative";

      // ── Path 1: Back-reference ───────────────────────────────────────────────
      if (isBackRef) {
        const fetchedAssets = await storage.getIngestedAssetsByIds(priorIds).catch(() => [] as import("../storage").RetrievedAsset[]);
        // Restore original retrieval order (SQL IN clause does not guarantee order)
        const idOrder = new Map(priorIds.map((id, i) => [id, i]));
        fetchedAssets.sort((a, b) => (idOrder.get(a.id) ?? 99) - (idOrder.get(b.id) ?? 99));

        let targeted: import("../storage").RetrievedAsset[];
        // Institution-qualified back-ref: "the one from MIT", "that one from Stanford"
        const backRefInst = extractBackRefInstitution(message.trim(), portfolioInstitutionNames);
        if (backRefInst) {
          const instMatch = fetchedAssets.filter((a) =>
            a.institution?.toLowerCase().includes(backRefInst.toLowerCase())
          );
          targeted = instMatch.length > 0 ? instMatch : fetchedAssets;
        } else {
          const pos = extractBackRefPosition(message.trim());
          targeted = pos !== null && fetchedAssets[pos] ? [fetchedAssets[pos]] : fetchedAssets;
        }

        const assetPayload = targeted.map((a) => ({
          id: a.id, assetName: a.assetName, institution: a.institution,
          indication: a.indication ?? "unknown", modality: a.modality ?? "unknown", developmentStage: a.developmentStage,
          biology: a.biology ?? undefined,
          ipType: a.ipType, sourceName: a.sourceName, sourceUrl: a.sourceUrl, similarity: 1.0,
        }));
        sendEvent("context", { sessionId: sid, assets: assetPayload });
        let fullResponse = "";
        for await (const token of ragQuery(message.trim(), targeted, history, resolvedCtx, portfolioStats, focusContext, engagementSignals, abortController.signal)) {
          fullResponse += token;
          sendEvent("token", { text: token });
        }
        await storage.appendEdenMessage(sid, {
          role: "assistant", content: fullResponse,
          assetIds: targeted.map((a) => a.id), assets: assetPayload,
        });
        const backRefOffers = buildActionOffers(message.trim(), "back_ref", targeted.map((a) => ({ ...a, similarity: 1.0 })), filters, acceptedSignals, crossSessionMemory);
        if (backRefOffers.length > 0) sendEvent("action_offer", { offers: backRefOffers });
        sendEvent("done", donePayload());
        return;
      }

      const aggQuery = intentClass.intent === "aggregation";
      const definitional = intentClass.intent === "definitional";
      const chat = intentClass.intent === "conversational";

      // ── Path 2: Aggregation / count queries ────────────────────────────────────
      if (aggQuery) {
        const resolvedResult = await resolveAggregationQuery(message.trim(), filters, geoRx).catch(() => null);
        if (resolvedResult) {
          sendEvent("context", { sessionId: sid, assets: [] });
          let fullResponse = "";
          for await (const token of aggregationQuery(message.trim(), resolvedResult, history, resolvedCtx, portfolioStats, focusContext, abortController.signal)) {
            fullResponse += token;
            sendEvent("token", { text: token });
          }
          await storage.appendEdenMessage(sid, { role: "assistant", content: fullResponse, assetIds: [], assets: [] });
          sendEvent("done", donePayload());
          return;
        }

        const count = await storage.filteredCount(geoRx, filters.modality, filters.stage, filters.indication, filters.institution, filters.biology, sinceDate).catch(() => null);
        if (count !== null) {
          const filterDesc = [
            filters.geography ? `${filters.geography.toUpperCase()} institution` : "",
            filters.modality || "", filters.stage || "",
            filters.indication || "", filters.institution || "",
          ].filter(Boolean).join(", ");
          const sqlCountResult = filterDesc
            ? `Filtered count (${filterDesc}): **${count}** relevant assets match the active filters.`
            : `Total relevant assets indexed in the portfolio: **${count.toLocaleString()}**`;
          sendEvent("context", { sessionId: sid, assets: [] });
          let fullResponse = "";
          for await (const token of aggregationQuery(message.trim(), sqlCountResult, history, resolvedCtx, portfolioStats, focusContext, abortController.signal)) {
            fullResponse += token;
            sendEvent("token", { text: token });
          }
          await storage.appendEdenMessage(sid, { role: "assistant", content: fullResponse, assetIds: [], assets: [] });
          sendEvent("done", donePayload());
          return;
        }
        // fall through to RAG if SQL cannot resolve
      }

      // ── Path 3: Comparative / head-to-head ─────────────────────────────────────
      if (isComparative) {
        let compareIds: number[] = [];
        let terminalError: string | null = null;
        let hasExplicitRefs = false;

        // All prior asset payloads from typed session messages (assets is schema-typed on EdenSession)
        const allPriorAssetPayloads = (session.messages ?? [])
          .filter((m) => m.role === "assistant" && (m.assetIds?.length ?? 0) > 0)
          .flatMap((m) => m.assets ?? []);

        const msgLower = message.trim().toLowerCase();

        // ── Step a: ordinal back-refs ──────────────────────────────────────────
        const ordinalPositions: number[] = [];
        if (/\bfirst\b|\b1st\b/.test(msgLower)) ordinalPositions.push(0);
        if (/\bsecond\b|\b2nd\b/.test(msgLower)) ordinalPositions.push(1);
        if (/\bthird\b|\b3rd\b/.test(msgLower)) ordinalPositions.push(2);
        if (ordinalPositions.length >= 2) {
          hasExplicitRefs = true;
          const resolvable = ordinalPositions.filter((p) => priorIds[p] !== undefined);
          if (resolvable.length >= 2) {
            compareIds = [...new Set(resolvable)].map((p) => priorIds[p]);
          } else {
            const avail = priorIds.length;
            terminalError = avail === 0
              ? "I don't have any previously shown assets to reference — search for a set of assets first, then ask me to compare them."
              : `I can see ${avail} previously shown asset${avail === 1 ? "" : "s"}, but your message references positions beyond what's available. Ask me to find more assets or compare the ones already shown.`;
          }
        }

        // ── Step b: named-asset matching ─────────────────────────────────────
        if (compareIds.length < 2 && !terminalError) {
          const namedMatches: number[] = [];
          for (const a of allPriorAssetPayloads) {
            if (!a.assetName || a.assetName.length < 5) continue;
            if (msgLower.includes(a.assetName.toLowerCase()) && !namedMatches.includes(a.id)) {
              namedMatches.push(a.id);
            }
          }
          if (namedMatches.length >= 2) {
            hasExplicitRefs = true;
            compareIds = namedMatches.slice(0, 3);
          } else if (namedMatches.length === 1) {
            hasExplicitRefs = true;
            try {
              const namedEmbedding = cachedEmbedding ?? await embedQuery(message.trim());
              const namedHits = await storage.semanticSearch(namedEmbedding, 5);
              const NAMED_SIM_THRESHOLD = 0.45;
              const portfolioCandidate = namedHits.find(
                (h) => h.similarity >= NAMED_SIM_THRESHOLD && !namedMatches.includes(h.id)
              );
              if (portfolioCandidate) {
                compareIds = [namedMatches[0], portfolioCandidate.id];
              } else {
                const resolvedAsset = allPriorAssetPayloads.find((a) => a.id === namedMatches[0]);
                terminalError = `I found "${resolvedAsset?.assetName ?? "one asset"}" from your session, but couldn't find a second asset to compare it to. Try searching for both assets first, then ask me to compare.`;
              }
            } catch {
              const resolvedAsset = allPriorAssetPayloads.find((a) => a.id === namedMatches[0]);
              terminalError = `I found "${resolvedAsset?.assetName ?? "one asset"}" from your session, but couldn't locate a second asset to compare it to.`;
            }
          }
        }

        // ── Step c: institution-qualified resolution ───────────────────────────
        if (compareIds.length < 2 && !terminalError) {
          const mentionedInsts = detectAllInstitutionNames(message.trim(), portfolioInstitutionNames);
          if (mentionedInsts.length >= 2) {
            hasExplicitRefs = true;
            const instMatched: number[] = [];
            let firstUnresolved: string | null = null;

            const institutionMatches = (institution: string | null | undefined, instKey: string): boolean => {
              if (!institution) return false;
              const aInstLower = institution.toLowerCase();
              if (aInstLower.includes(instKey)) return true;
              const canonical = detectInstitutionName(institution) ?? "";
              return canonical === instKey;
            };

            for (const inst of mentionedInsts.slice(0, 3)) {
              const instKey = inst.toLowerCase();

              // Pass 1: session history
              const sessionMatch = allPriorAssetPayloads.find((a) => institutionMatches(a.institution, instKey));
              if (sessionMatch && !instMatched.includes(sessionMatch.id)) {
                instMatched.push(sessionMatch.id);
                continue;
              }

              // Pass 2: portfolio-level semantic search with institution context
              let portfolioResolved = false;
              try {
                const instQueryText = `${inst} ${message.trim()}`;
                const instEmbedding = await embedQuery(instQueryText);
                const instHits = await storage.semanticSearch(instEmbedding, 8);
                const portfolioHit = instHits.find(
                  (h) => institutionMatches(h.institution, instKey) && !instMatched.includes(h.id)
                );
                if (portfolioHit) {
                  instMatched.push(portfolioHit.id);
                  portfolioResolved = true;
                }
              } catch (instSearchErr) {
                console.warn("[eden/comparative] institution portfolio search failed:", (instSearchErr as Error)?.message);
              }

              if (!portfolioResolved && !firstUnresolved) {
                firstUnresolved = inst;
              }
            }

            if (instMatched.length >= 2) {
              compareIds = instMatched;
            } else {
              if (instMatched.length === 1 && firstUnresolved) {
                const resolvedName = (
                  allPriorAssetPayloads.find((a) => a.id === instMatched[0])?.institution
                ) ?? mentionedInsts.find((i) => i !== firstUnresolved) ?? "one institution";
                terminalError = `I found assets from ${resolvedName}, but couldn't locate any licensable assets from "${firstUnresolved}" in the portfolio. Try searching for that institution directly first.`;
              } else if (firstUnresolved) {
                terminalError = `I couldn't find any licensable assets from "${firstUnresolved}" in the portfolio. Try searching for that institution directly.`;
              }
            }
          }
        }

        // ── Step d: all priorIds fallback ──────────────────────────────────────
        if (compareIds.length < 2 && !terminalError && !hasExplicitRefs && priorIds.length >= 2) {
          compareIds = priorIds.slice(0, 3);
        }

        // ── Step e: semantic fallback ───────────────────────────────────────────
        if (compareIds.length < 2 && !terminalError && !hasExplicitRefs) {
          try {
            const compareEmbedding = cachedEmbedding ?? await embedQuery(message.trim());
            const semanticHits = await storage.semanticSearch(compareEmbedding, 3);
            const COMPARE_SIM_THRESHOLD = 0.45;
            const passing = semanticHits.filter((a) => a.similarity >= COMPARE_SIM_THRESHOLD);
            if (passing.length >= 2) {
              compareIds = passing.slice(0, 3).map((a) => a.id);
            }
          } catch (semErr) {
            console.warn("[eden/comparative] semantic fallback failed:", (semErr as Error)?.message ?? semErr);
          }
        }

        // ── Terminal error emission ─────────────────────────────────────────────
        if (terminalError) {
          sendEvent("context", { sessionId: sid, assets: [] });
          sendEvent("token", { text: terminalError });
          await storage.appendEdenMessage(sid, { role: "assistant", content: terminalError, assetIds: [], assets: [] });
          sendEvent("done", donePayload());
          return;
        }

        // ── Comparison execution ───────────────────────────────────────────────
        if (compareIds.length >= 2) {
          const fetchedForCompare = await storage.getIngestedAssetsByIds(compareIds).catch(
            () => [] as import("../storage").RetrievedAsset[]
          );
          const compareIdOrder = new Map(compareIds.map((id, i) => [id, i]));
          fetchedForCompare.sort((a, b) => (compareIdOrder.get(a.id) ?? 99) - (compareIdOrder.get(b.id) ?? 99));

          if (fetchedForCompare.length >= 2) {
            const compareAssetPayload = fetchedForCompare.map((a) => ({
              id: a.id, assetName: a.assetName, institution: a.institution,
              indication: a.indication ?? "unknown", modality: a.modality ?? "unknown",
              developmentStage: a.developmentStage, ipType: a.ipType,
              sourceName: a.sourceName, sourceUrl: a.sourceUrl, similarity: 1.0,
            }));
            sendEvent("context", { sessionId: sid, assets: compareAssetPayload });
            let fullResponse = "";
            for await (const token of compareQuery(message.trim(), fetchedForCompare, history, resolvedCtx, portfolioStats, focusContext, abortController.signal)) {
              fullResponse += token;
              sendEvent("token", { text: token });
            }
            await storage.appendEdenMessage(sid, {
              role: "assistant", content: fullResponse,
              assetIds: fetchedForCompare.map((a) => a.id),
              assets: compareAssetPayload,
            });
            const compareOffers = buildActionOffers(
              message.trim(), "comparative",
              fetchedForCompare.map((a) => ({ id: a.id, assetName: a.assetName, institution: a.institution, modality: a.modality, developmentStage: a.developmentStage, indication: a.indication, sourceUrl: a.sourceUrl, similarity: 1.0 })),
              filters, acceptedSignals, crossSessionMemory,
            );
            if (compareOffers.length > 0) sendEvent("action_offer", { offers: compareOffers });
            sendEvent("done", donePayload());
            return;
          }
        }
        // < 2 assets after all steps: fall through to definitional / RAG
      }

      // ── Path 4: Definitional / educational ──────────────────────────────────────
      if (definitional) {
        const conceptEmbeddingPromise = cachedEmbedding
          ? Promise.resolve(cachedEmbedding)
          : embedQuery(message.trim());

        sendEvent("context", { sessionId: sid, assets: [] });
        let fullResponse = "";
        for await (const token of conceptQuery(message.trim(), history, resolvedCtx, portfolioStats, focusContext, abortController.signal)) {
          fullResponse += token;
          sendEvent("token", { text: token });
        }

        const CONCEPT_SIMILARITY_THRESHOLD = 0.60;
        let relatedAssets: import("../storage").RetrievedAsset[] = [];
        try {
          const conceptEmbedding = await conceptEmbeddingPromise.catch(() => null);
          if (conceptEmbedding) {
            const hits = await storage.semanticSearch(conceptEmbedding, 5);
            const passing = hits.filter((a) => a.similarity >= CONCEPT_SIMILARITY_THRESHOLD);
            if (hits.length > 0 && passing.length === 0) {
              const topSim = hits[0]?.similarity ?? 0;
              console.log(`[eden/definitional] 0 hits above ${CONCEPT_SIMILARITY_THRESHOLD} threshold (top sim: ${topSim.toFixed(3)}) for: "${message.trim().slice(0, 80)}"`);
            }
            relatedAssets = passing.slice(0, 3);
          }
        } catch (lookupErr) {
          console.warn("[eden/definitional] portfolio lookup failed:", (lookupErr as Error)?.message ?? lookupErr);
        }

        if (relatedAssets.length > 0) {
          const relatedAssetPayload = relatedAssets.map((a) => ({
            id: a.id, assetName: a.assetName, institution: a.institution,
            indication: a.indication ?? "unknown", modality: a.modality ?? "unknown",
            developmentStage: a.developmentStage, ipType: a.ipType,
            sourceName: a.sourceName, sourceUrl: a.sourceUrl,
            similarity: Math.round(a.similarity * 100) / 100,
          }));
          sendEvent("context", { sessionId: sid, assets: relatedAssetPayload });

          const bridgeIntro = "\n\n";
          sendEvent("token", { text: bridgeIntro });
          fullResponse += bridgeIntro;

          const bridgePrompt = `You just explained a concept. Now briefly introduce these ${relatedAssets.length} portfolio asset${relatedAssets.length > 1 ? "s" : ""} that relate to it. Lead with "There ${relatedAssets.length === 1 ? "is" : "are"} ${relatedAssets.length} related asset${relatedAssets.length > 1 ? "s" : ""} in the portfolio:" then list each with one concise hook sentence (standard **Asset Name** (Institution) — hook format). Keep it under 80 words total.`;
          for await (const token of ragQuery(bridgePrompt, relatedAssets, [], resolvedCtx, portfolioStats, focusContext, engagementSignals, abortController.signal, "gpt-4o-mini")) {
            fullResponse += token;
            sendEvent("token", { text: token });
          }

          await storage.appendEdenMessage(sid, {
            role: "assistant", content: fullResponse,
            assetIds: relatedAssets.slice(0, 3).map((a) => a.id),
            assets: relatedAssetPayload,
          });
          const defOffers = buildActionOffers(
            message.trim(), "definitional",
            relatedAssets.slice(0, 3).map((a) => ({ id: a.id, assetName: a.assetName, institution: a.institution, modality: a.modality, developmentStage: a.developmentStage, indication: a.indication, sourceUrl: a.sourceUrl, similarity: a.similarity ?? 0.8 })),
            filters, acceptedSignals, crossSessionMemory,
          );
          if (defOffers.length > 0) sendEvent("action_offer", { offers: defOffers });
        } else {
          await storage.appendEdenMessage(sid, { role: "assistant", content: fullResponse, assetIds: [], assets: [] });
        }

        sendEvent("done", donePayload());
        return;
      }

      // ── Path 5: Pipeline / saved-asset browse ─────────────────────────────────
      if (intentClass.intent === "pipeline" && requestUserId) {
        // Detect optional named pipeline in the message (e.g. "show my gene therapy pipeline")
        const namedPipeline = extractPipelineName(message.trim());
        let pipelineListId: number | undefined;
        let pipelineLabel = "your saved pipeline";

        if (namedPipeline) {
          try {
            const lists = await storage.getPipelineLists(requestUserId);
            const match = lists.find((l) =>
              l.name.toLowerCase().includes(namedPipeline.toLowerCase()) ||
              namedPipeline.toLowerCase().includes(l.name.toLowerCase())
            );
            if (match) {
              pipelineListId = match.id;
              pipelineLabel = `your "${match.name}" pipeline`;
            }
          } catch { /* fall through to all saved */ }
        }

        const savedList = await storage.getSavedAssets(pipelineListId, requestUserId).catch(() => []);
        const ingestedIds = savedList
          .map((s) => s.ingestedAssetId)
          .filter((id): id is number => id !== null && id !== undefined);

        let pipelineAssets: import("../storage").RetrievedAsset[] = [];
        if (ingestedIds.length > 0) {
          const fetched = await storage.getIngestedAssetsByIds(ingestedIds).catch(() => [] as import("../storage").RetrievedAsset[]);
          // Apply active filters to narrow the view if the user asked for something specific
          pipelineAssets = fetched.filter((a) => {
            if (filters.modality && a.modality?.toLowerCase() !== filters.modality.toLowerCase()) return false;
            if (filters.stage && a.developmentStage?.toLowerCase() !== filters.stage.toLowerCase()) return false;
            if (filters.indication && !a.indication?.toLowerCase().includes(filters.indication.toLowerCase())) return false;
            if (filters.institution && !a.institution?.toLowerCase().includes(filters.institution.toLowerCase())) return false;
            if (filters.biology && !a.biology?.toLowerCase().includes(filters.biology.toLowerCase())) return false;
            return true;
          });
          // If filters zeroed out results, show everything (user may be browsing, not filtering)
          if (pipelineAssets.length === 0 && fetched.length > 0) {
            pipelineAssets = fetched;
          }
        }

        const pipelineAssetPayload = pipelineAssets.slice(0, 15).map((a) => ({
          id: a.id, assetName: a.assetName, institution: a.institution,
          indication: a.indication ?? "unknown", modality: a.modality ?? "unknown",
          developmentStage: a.developmentStage, biology: a.biology ?? undefined,
          ipType: a.ipType, sourceName: a.sourceName, sourceUrl: a.sourceUrl, similarity: 1.0,
        }));

        sendEvent("context", { sessionId: sid, assets: pipelineAssetPayload });

        const pipelineQuestion = pipelineAssets.length > 0
          ? `[CONTEXT: These are the assets the user has saved in ${pipelineLabel}. They are NOT search results — they are assets this user has already bookmarked. Answer the question in the context of their saved portfolio.]\n\n${message.trim()}`
          : `[CONTEXT: The user asked about ${pipelineLabel} but has no saved assets yet${namedPipeline ? ` in "${namedPipeline}"` : ""}. Inform them their pipeline is empty and suggest searching for assets to add.]\n\n${message.trim()}`;

        let fullResponse = "";
        for await (const token of ragQuery(pipelineQuestion, pipelineAssets.slice(0, 15), history, resolvedCtx, portfolioStats, focusContext, engagementSignals, abortController.signal)) {
          fullResponse += token;
          sendEvent("token", { text: token });
        }
        await storage.appendEdenMessage(sid, {
          role: "assistant", content: fullResponse,
          assetIds: pipelineAssets.slice(0, 3).map((a) => a.id),
          assets: pipelineAssetPayload,
        });
        sendEvent("done", donePayload());
        return;
      }
      // If pipeline intent but no user ID, fall through to standard RAG search

      // ── Path 5.5: Pipeline synthesis ─────────────────────────────────────────
      if (intentClass.intent === "synthesis" && requestUserId) {
        const savedList = await storage.getSavedAssets(undefined, requestUserId).catch(() => []);
        if (savedList.length === 0) {
          sendEvent("context", { sessionId: sid, assets: [] });
          const emptyMsg = "Your pipeline is empty — save some assets first, then I can analyze them for you.";
          sendEvent("token", { text: emptyMsg });
          await storage.appendEdenMessage(sid, { role: "assistant", content: emptyMsg, assetIds: [], assets: [] });
          sendEvent("done", donePayload());
          return;
        }

        // Fetch pipeline list names for context
        const lists = await storage.getPipelineLists(requestUserId).catch(() => []);
        const listMap = new Map(lists.map((l) => [l.id, l.name]));

        const synthAssets: PipelineSavedAsset[] = savedList.slice(0, 150).map((s) => ({
          assetName: s.assetName, modality: s.modality, developmentStage: s.developmentStage,
          diseaseIndication: s.diseaseIndication, status: s.status ?? undefined,
          summary: s.summary, pipelineListName: s.pipelineListId ? (listMap.get(s.pipelineListId) ?? undefined) : undefined,
        }));

        const synthBP = userProfile?.buyerProfile as Record<string, unknown> | null | undefined;
        const synthPriorSnapshot = (synthBP?._lastSynthesisSnapshot as SynthesisSnapshot | undefined) ?? null;

        sendEvent("context", { sessionId: sid, assets: [] });
        let fullResponse = "";
        for await (const token of synthesisQuery(message.trim(), synthAssets, history, resolvedCtx, portfolioStats, focusContext, synthPriorSnapshot, abortController.signal)) {
          fullResponse += token;
          sendEvent("token", { text: token });
        }
        await storage.appendEdenMessage(sid, { role: "assistant", content: fullResponse, assetIds: [], assets: [] });
        if (requestUserId) {
          const newSnap: SynthesisSnapshot = {
            ts: new Date().toISOString(),
            totalCount: synthAssets.length,
            statusGroups: synthAssets.reduce<Record<string, number>>((acc, a) => {
              const k = a.status ?? "unsorted"; acc[k] = (acc[k] ?? 0) + 1; return acc;
            }, {}),
          };
          storage.saveBuyerProfile(requestUserId, { ...(synthBP ?? {}), _lastSynthesisSnapshot: newSnap }).catch(() => {});
        }
        sendEvent("done", donePayload());
        return;
      }

      // ── Path 5.6: Document generation ─────────────────────────────────────────
      if (intentClass.intent === "document") {
        // Detect document type from message
        const msgLower = message.trim().toLowerCase();
        const docType: DocumentType =
          /check.?list|due.?diligence|diligence/.test(msgLower) ? "checklist" :
          /term.?sheet|term sheet|licensing.?terms/.test(msgLower) ? "term_sheet" :
          /\bmemo\b|memorandum/.test(msgLower) ? "memo" : "brief";

        // Resolve target asset: use back-ref if available, otherwise first semantic hit
        let targetAsset: import("../storage").RetrievedAsset | undefined;
        if (priorIds.length > 0) {
          const fetched = await storage.getIngestedAssetsByIds(priorIds.slice(0, 1)).catch(() => []);
          targetAsset = fetched[0];
        }
        if (!targetAsset && cachedEmbedding) {
          const hits = await storage.filteredSemanticSearch(cachedEmbedding, undefined, undefined, undefined, undefined, undefined, 3, undefined, undefined, undefined, true).catch(() => []);
          targetAsset = hits.find((h) => h.similarity >= 0.5);
        }

        if (!targetAsset) {
          sendEvent("context", { sessionId: sid, assets: [] });
          const noAssetMsg = "I need an asset to generate a document for. Try searching for one first, then ask me to draft a checklist or memo.";
          sendEvent("token", { text: noAssetMsg });
          await storage.appendEdenMessage(sid, { role: "assistant", content: noAssetMsg, assetIds: [], assets: [] });
          sendEvent("done", donePayload());
          return;
        }

        const docPayload = [{ id: targetAsset.id, assetName: targetAsset.assetName, institution: targetAsset.institution, indication: targetAsset.indication ?? "unknown", modality: targetAsset.modality ?? "unknown", developmentStage: targetAsset.developmentStage, similarity: 1.0 }];
        sendEvent("context", { sessionId: sid, assets: docPayload });
        let fullResponse = "";
        for await (const token of documentQuery(docType, targetAsset, history, resolvedCtx, portfolioStats, focusContext, abortController.signal)) {
          fullResponse += token;
          sendEvent("token", { text: token });
        }
        await storage.appendEdenMessage(sid, { role: "assistant", content: fullResponse, assetIds: [targetAsset.id], assets: docPayload });
        focusContext._lastDocType = docType;
        sendEvent("done", donePayload());
        return;
      }

      // ── Path 6: Conversational ─────────────────────────────────────────────────
      if (chat) {
        sendEvent("context", { sessionId: sid, assets: [] });
        let fullResponse = "";
        for await (const token of directQuery(message.trim(), history, resolvedCtx, portfolioStats, focusContext, abortController.signal)) {
          fullResponse += token;
          sendEvent("token", { text: token });
        }
        await storage.appendEdenMessage(sid, { role: "assistant", content: fullResponse, assetIds: [], assets: [] });
        sendEvent("done", donePayload());
        return;
      }

      // ── Path 7: Standard RAG (semantic retrieval) ──────────────────────────────

      const institutionName = filters.institution ?? detectInstitutionName(message.trim(), portfolioInstitutionNames);

      let allSemantic: import("../storage").RetrievedAsset[];
      let institutionAssets: import("../storage").RetrievedAsset[] = [];

      try {
        const queryEmbedding = cachedEmbedding ?? await embedQuery(message.trim());

        // Parallelize institution search with semantic retrieval.
        // For the no-filter path, the speculative search (started at request open)
        // is already done — just await the resolved promise, 0 extra wait.
        const [instAssets, semanticResults] = await Promise.all([
          institutionName
            ? storage.searchIngestedAssetsByInstitution(institutionName, 10).catch(() => [])
            : Promise.resolve([]),
          filtersActive
            ? storage.filteredSemanticSearch(queryEmbedding, geoRx, filters.modality, filters.stage, filters.indication, filters.institution, 20, filters.biology, sinceDate, filters.trending ? 0.65 : undefined, true)
            : speculativeSearchPromise.then((speculative) =>
                speculative ?? storage.filteredSemanticSearch(queryEmbedding, undefined, undefined, undefined, undefined, undefined, 20, undefined, undefined, undefined, true)
              ),
        ]);
        institutionAssets = instAssets;
        allSemantic = semanticResults ?? [];
      } catch (embedErr) {
        console.warn("[eden/rag] embedding failed, falling back to keyword search:", (embedErr as Error)?.message ?? embedErr);
        const kwResults = await storage.keywordSearchIngestedAssets(message.trim(), 15, {
          modality: filters.modality,
          stage: filters.stage,
          indication: filters.indication,
          institution: filters.institution ?? (institutionName ?? undefined),
        }).catch(() => [] as import("../storage").RetrievedAsset[]);
        allSemantic = kwResults.map((a) => ({ ...a, similarity: 0.6 }));
        if (institutionName) {
          institutionAssets = await storage.searchIngestedAssetsByInstitution(institutionName, 10).catch(() => []);
        }
      }

      const threshold = institutionName ? 0.38 : 0.45;
      const institutionIds = new Set(institutionAssets.map((a) => a.id));
      let merged = [
        ...institutionAssets,
        ...allSemantic.filter((a) => a.similarity > threshold && !institutionIds.has(a.id)),
      ].slice(0, 15);

      // ── Auto-broadening: if nothing clears threshold, widen the net ──────────
      if (merged.length === 0 && allSemantic.length > 0) {
        const broadThreshold = institutionName ? 0.30 : 0.35;
        merged = [
          ...institutionAssets,
          ...allSemantic.filter((a) => a.similarity > broadThreshold && !institutionIds.has(a.id)),
        ].slice(0, 8);
      }
      if (merged.length === 0) {
        const kwFallback = await storage.keywordSearchIngestedAssets(message.trim(), 10, {
          modality: filters.modality,
          stage: filters.stage,
          indication: filters.indication,
          institution: filters.institution ?? (institutionName ?? undefined),
        }).catch(() => [] as import("../storage").RetrievedAsset[]);
        merged = kwFallback.map((a) => ({ ...a, similarity: 0.5 }));
      }

      // Rerank with profile + adaptive + biology tiers using pre-derived engagement signals.
      const retrieved = rerankAssets(merged, resolvedCtx, engagementSignals, focusContext?.biology);

      const assetPayload = retrieved.map((a) => ({
        id: a.id, assetName: a.assetName, institution: a.institution,
        indication: a.indication ?? "unknown", modality: a.modality ?? "unknown", developmentStage: a.developmentStage,
        biology: a.biology ?? undefined,
        ipType: a.ipType, sourceName: a.sourceName, sourceUrl: a.sourceUrl,
        similarity: Math.round(a.similarity * 100) / 100,
        rankNote: a.rankNote,
      }));

      const externalResults = await liveResultsPromise;
      sendEvent("context", { sessionId: sid, assets: assetPayload, externalResults, activeSource: liveSource ?? "tto" });
      let crossRefNote = "";
      if (externalResults.length > 0 && liveSource) {
        const srcLabel = liveSource === "clinicaltrials" ? "ClinicalTrials" : liveSource === "patents" ? "Patent Landscape" : "Harvard Research";
        const extLines = externalResults.slice(0, 6).map((r, i) =>
          `${i + 1}. ${r.title}${r.sponsor ? ` — ${r.sponsor}` : ""}${r.status ? ` (${r.status})` : ""}`
        ).join("\n");
        crossRefNote = `\n\n[SUPPLEMENTAL ${srcLabel.toUpperCase()} CONTEXT — do not present as TTO assets]:
${extLines}
After covering TTO assets, note in one sentence whether any of these external results connect thematically to the TTO assets (shared institution, indication, or mechanism). Skip if no connection exists.`;
      }
      const ragQuestion = (filters.trending
        ? `${message.trim()}\n\n[CONTEXT FOR EDEN: These assets were indexed in the last 90 days and are well-documented. After presenting them, add 2–3 sentences of genuine market context from your industry intelligence — what deal dynamics, funding trends, or mechanism enthusiasm makes this area compelling right now. Do NOT fabricate market data; only reference what you know from your training.]`
        : message.trim()) + crossRefNote;
      const ragModel = retrieved.length === 0 ? "gpt-4o-mini" : "gpt-4o";
      let fullResponse = "";
      for await (const token of ragQuery(ragQuestion, retrieved, history, resolvedCtx, portfolioStats, focusContext, engagementSignals, abortController.signal, ragModel)) {
        fullResponse += token;
        sendEvent("token", { text: token });
      }
      await storage.appendEdenMessage(sid, {
        role: "assistant", content: fullResponse,
        assetIds: retrieved.slice(0, 3).map((a) => a.id), assets: assetPayload,
      });

      const searchOffers = buildActionOffers(message.trim(), "search", retrieved, filters, acceptedSignals, crossSessionMemory);
      if (searchOffers.length > 0) sendEvent("action_offer", { offers: searchOffers });
      sendEvent("done", donePayload());
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      const msg = (err as Error)?.message ?? "";
      const isAborted = abortController.signal.aborted;
      const errMsg = isAborted
        ? "Request timed out — please try again."
        : status === 429
        ? "Too many requests — please wait a moment and try again."
        : status === 401 || status === 403
        ? "AI service authentication error — please contact support."
        : status != null && status >= 500
        ? "AI service is temporarily unavailable — please try again in a moment."
        : msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("econnreset")
        ? "Connection timed out — please try again."
        : "Something went wrong. Please try again.";
      console.error("[EDEN chat] Error:", err);
      sendEvent("error", { message: errMsg });
    } finally {
      clearTimeout(abortTimer);
      res.end();
      db.insert(edenQueries).values({
        sessionId: sid,
        userId: requestUserId ?? null,
        queryText: message.trim().slice(0, 500),
        intent: _qIntent,
        filters: Object.keys(_qFilters).length ? _qFilters : null,
        assetCount: _qAssetCount,
        emptyResult: _qIntent === "search" && _qAssetCount === 0,
        latencyMs: Date.now() - _qStart,
      }).catch(() => { /* non-fatal */ });
    }
  });

  app.get("/api/eden/feedback/:sessionId", verifyAnyAuth, async (req, res) => {
    try {
      const data = await storage.getEdenFeedbackForSession(String(req.params.sessionId));
      return res.json(data);
    } catch (err) {
      console.error("[EDEN feedback GET]", err);
      return res.status(500).json({ error: "Failed" });
    }
  });

  app.post("/api/eden/feedback", verifyAnyAuth, async (req, res) => {
    const feedbackParsed = z.object({
      sessionId: z.string().min(1).max(100),
      messageIndex: z.number().int().min(0).max(9999),
      sentiment: z.enum(["up", "down"]),
    }).safeParse(req.body);
    if (!feedbackParsed.success) {
      return res.status(400).json({ error: "sessionId, messageIndex, and sentiment (up|down) required" });
    }
    const { sessionId, messageIndex, sentiment } = feedbackParsed.data;
    try {
      const userId = (req as any).userId ?? null;
      let assetIds: number[] | undefined;
      let queryText: string | undefined;
      try {
        const sess = await storage.getOrCreateEdenSession(sessionId);
        const msgs = sess.messages ?? [];
        const assistantMsg = msgs[messageIndex];
        if (assistantMsg?.assetIds?.length) assetIds = assistantMsg.assetIds;
        const userMsg = msgs[messageIndex - 1];
        if (userMsg?.role === "user") queryText = userMsg.content.slice(0, 500);
      } catch { /* non-fatal — still record the sentiment */ }
      await storage.createEdenMessageFeedback(sessionId, messageIndex, sentiment, { userId, assetIds, queryText });
      return res.json({ ok: true });
    } catch (err) {
      console.error("[EDEN feedback]", err);
      return res.status(500).json({ error: "Failed to record feedback" });
    }
  });

  // ── Write action endpoint: Eden-triggered status/note/move actions ──────────
  // Resolves ingestedAssetId → savedAsset.id for this user, then executes the action.
  app.post("/api/eden/write-action", verifyAnyAuth, async (req, res) => {
    const userId = (req as any).userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const parsed = z.object({
      type: z.enum(["status_update", "note_add", "move_pipeline"]),
      ingestedAssetId: z.number().int().positive(),
      payload: z.object({
        status: z.enum(["watching", "evaluating", "in_discussion", "on_hold", "passed"]).optional(),
        content: z.string().min(1).max(2000).optional(),
        pipelineName: z.string().min(1).max(200).optional(),
      }),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

    const { type, ingestedAssetId, payload } = parsed.data;
    try {
      const saved = await storage.getSavedAssets(undefined, userId);
      const target = saved.find((s) => s.ingestedAssetId === ingestedAssetId);
      if (!target) return res.status(404).json({ error: "Asset not found in your pipeline — save it first" });

      // Fire-and-forget: record this engagement for future ranking and proactive alerts
      updateEdenAcceptedSignals(userId, target).catch(() => {});

      if (type === "status_update") {
        if (!payload.status) return res.status(400).json({ error: "status required" });
        await storage.updateSavedAssetStatus(target.id, payload.status);
        return res.json({ ok: true, action: "status_update", status: payload.status });
      }
      if (type === "note_add") {
        if (!payload.content) return res.status(400).json({ error: "content required" });
        const profile = await storage.getIndustryProfileByUserId(userId).catch(() => undefined);
        const authorName = profile?.userName?.trim() || "Via Eden";
        await storage.createAssetNote({ savedAssetId: target.id, userId, content: payload.content, authorName });
        return res.json({ ok: true, action: "note_add" });
      }
      if (type === "move_pipeline") {
        if (!payload.pipelineName) return res.status(400).json({ error: "pipelineName required" });
        const lists = await storage.getPipelineLists(userId);
        const match = lists.find((l) =>
          l.name.toLowerCase().includes(payload.pipelineName!.toLowerCase()) ||
          payload.pipelineName!.toLowerCase().includes(l.name.toLowerCase())
        );
        if (!match) return res.status(404).json({ error: `Pipeline "${payload.pipelineName}" not found` });
        await storage.updateSavedAssetPipeline(target.id, match.id);
        return res.json({ ok: true, action: "move_pipeline", pipelineId: match.id, pipelineName: match.name });
      }
    } catch (err) {
      console.error("[EDEN write-action]", err);
      return res.status(500).json({ error: "Action failed" });
    }
  });

  app.post("/api/eden/bookmark", verifyAnyAuth, async (req, res) => {
    const bookmarkParsed = z.object({
      source: z.enum(["clinicaltrials", "patents", "harvard"]),
      externalId: z.string().min(1).max(200),
      title: z.string().min(1).max(500),
      url: z.string().url().max(2000),
      snapshotJson: z.record(z.unknown()).optional(),
    }).safeParse(req.body);
    if (!bookmarkParsed.success) {
      return res.status(400).json({ error: "source, externalId, title, and url are required" });
    }
    const { source, externalId, title, url, snapshotJson } = bookmarkParsed.data;
    try {
      const userId = (req as any).userId ?? (req as any).user?.id ?? null;
      if (!userId) return res.status(401).json({ error: "User ID required to bookmark" });
      await db.execute(sql`
        INSERT INTO user_bookmarks (user_id, source, external_id, title, url, snapshot_json)
        VALUES (${userId}, ${source}, ${externalId}, ${title}, ${url}, ${snapshotJson ? JSON.stringify(snapshotJson) : null}::jsonb)
        ON CONFLICT (user_id, source, external_id) DO NOTHING
      `);
      return res.json({ ok: true });
    } catch (err) {
      console.error("[EDEN bookmark]", err);
      return res.status(500).json({ error: "Failed to save bookmark" });
    }
  });

  app.get("/api/eden/sessions", verifyAnyAuth, async (req, res) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const limit = Math.min(100, parseInt(String(req.query.limit ?? "50"), 10) || 50);
      const sessions = await storage.listEdenSessions(userId, limit);
      res.json(sessions);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed" });
    }
  });

  app.get("/api/eden/sessions/:sessionId", verifyAnyAuth, async (req, res) => {
    const requestUserId = req.headers["x-user-id"] as string | undefined;
    try {
      const session = await storage.getEdenSession(String(req.params.sessionId));
      if (!session) return res.status(404).json({ error: "Session not found" });
      // Ownership check: if the session belongs to a known user, only that user may read it.
      const sessionUserId = (session as Record<string, unknown>).userId as string | undefined;
      if (sessionUserId && requestUserId && sessionUserId !== requestUserId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      res.json(session);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed" });
    }
  });

  // ── Eden data-query tool routes (authenticated user) ─────────────────────────

  app.get("/api/eden/query/count-by-institution", verifyAnyAuth, async (req, res) => {
    try {
      const area = typeof req.query.area === "string" ? req.query.area.toLowerCase() : null;
      const rows = await db
        .select({
          institution: ingestedAssets.institution,
          count: sql<number>`count(*)::int`,
        })
        .from(ingestedAssets)
        .where(
          area
            ? sql`${ingestedAssets.relevant} = true AND (lower(${ingestedAssets.indication}) LIKE ${"%" + area + "%"} OR lower(${ingestedAssets.categories}::text) LIKE ${"%" + area + "%"})`
            : sql`${ingestedAssets.relevant} = true`
        )
        .groupBy(ingestedAssets.institution)
        .orderBy(sql`count(*) DESC`)
        .limit(20);
      res.json({ results: rows });
    } catch (err: unknown) {
      res.status(500).json({ error: "Query failed" });
    }
  });

  app.get("/api/eden/query/top-institutions", verifyAnyAuth, async (req, res) => {
    try {
      const area = typeof req.query.area === "string" ? req.query.area.toLowerCase() : "";
      const rows = await db
        .select({
          institution: ingestedAssets.institution,
          count: sql<number>`count(*)::int`,
        })
        .from(ingestedAssets)
        .where(
          area
            ? sql`${ingestedAssets.relevant} = true AND (lower(${ingestedAssets.indication}) LIKE ${"%" + area + "%"} OR lower(${ingestedAssets.categories}::text) LIKE ${"%" + area + "%"} OR lower(${ingestedAssets.assetName}) LIKE ${"%" + area + "%"})`
            : sql`${ingestedAssets.relevant} = true`
        )
        .groupBy(ingestedAssets.institution)
        .orderBy(sql`count(*) DESC`)
        .limit(10);
      res.json({ area, results: rows });
    } catch (err: unknown) {
      res.status(500).json({ error: "Query failed" });
    }
  });

  app.get("/api/eden/query/count-by-modality", verifyAnyAuth, async (req, res) => {
    try {
      const rows = await db
        .select({
          modality: ingestedAssets.modality,
          count: sql<number>`count(*)::int`,
        })
        .from(ingestedAssets)
        .where(sql`${ingestedAssets.relevant} = true AND ${ingestedAssets.modality} != 'unknown'`)
        .groupBy(ingestedAssets.modality)
        .orderBy(sql`count(*) DESC`)
        .limit(20);
      res.json({ results: rows });
    } catch (err: unknown) {
      res.status(500).json({ error: "Query failed" });
    }
  });

  app.get("/api/eden/query/count-by-stage", verifyAnyAuth, async (req, res) => {
    try {
      const rows = await db
        .select({
          stage: ingestedAssets.developmentStage,
          count: sql<number>`count(*)::int`,
        })
        .from(ingestedAssets)
        .where(sql`${ingestedAssets.relevant} = true AND ${ingestedAssets.developmentStage} != 'unknown'`)
        .groupBy(ingestedAssets.developmentStage)
        .orderBy(sql`count(*) DESC`)
        .limit(15);
      res.json({ results: rows });
    } catch (err: unknown) {
      res.status(500).json({ error: "Query failed" });
    }
  });

  app.get("/api/eden/query/newest-by-institution", verifyAnyAuth, async (req, res) => {
    try {
      const institution = typeof req.query.institution === "string" ? req.query.institution : null;
      if (!institution) return res.status(400).json({ error: "institution param required" });
      const rows = await db
        .select({
          id: ingestedAssets.id,
          assetName: ingestedAssets.assetName,
          indication: ingestedAssets.indication,
          modality: ingestedAssets.modality,
          developmentStage: ingestedAssets.developmentStage,
          firstSeenAt: ingestedAssets.firstSeenAt,
        })
        .from(ingestedAssets)
        .where(sql`${ingestedAssets.relevant} = true AND lower(${ingestedAssets.institution}) LIKE ${"%" + institution.toLowerCase() + "%"}`)
        .orderBy(desc(ingestedAssets.firstSeenAt))
        .limit(10);
      res.json({ institution, results: rows });
    } catch (err: unknown) {
      res.status(500).json({ error: "Query failed" });
    }
  });

  // Corpus size for the Eden welcome screen (non-admin users can't hit /api/admin/eden/stats)
  app.get("/api/eden/corpus", verifyAnyAuth, async (_req, res) => {
    try {
      const rows = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(ingestedAssets)
        .where(sql`${ingestedAssets.relevant} = true AND ${ingestedAssets.embedding} IS NOT NULL`);
      res.json({ total: rows[0]?.total ?? 0 });
    } catch (err: unknown) {
      res.status(500).json({ error: "Query failed" });
    }
  });
}
