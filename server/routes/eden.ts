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
  type UserContext, type SessionFocusContext, type IntentClassification, type LiveSource,
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
  message: { error: "Too many requests — please wait a moment before trying again." },
});

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
      const [session, portfolioStats, userProfile] = await Promise.all([
        storage.getOrCreateEdenSession(sid),
        fetchPortfolioStats().catch((err) => {
          console.error("[eden] Portfolio stats preload failed:", err?.message ?? err);
          return undefined;
        }),
        requestUserId
          ? storage.getIndustryProfileByUserId(requestUserId).catch(() => undefined)
          : Promise.resolve(undefined),
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

      await storage.appendEdenMessage(sid, { role: "user", content: message.trim() });

      // ── Portfolio institution names for two-pass detection ────────────────
      const portfolioInstitutionNames: string[] = portfolioStats?.topInstitutions?.map((i: { institution: string }) => i.institution) ?? [];

      // ── Session focus context (accumulated across turns) ──────────────────
      const focusContext = getOrUpdateSessionFocus(sid, message.trim(), portfolioInstitutionNames);
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

      // ── LLM Intent Router + Embedding (parallel) ──────────────────────────────────
      // classifyIntent replaces the regex cascade. embedQuery runs speculatively
      // so it's ready when we reach the search path — cost is negligible if discarded.
      const [intentResult, precomputedEmbedding] = await Promise.allSettled([
        classifyIntent(message.trim(), priorIds.length > 0),
        embedQuery(message.trim()),
      ]);
      const intentClass: IntentClassification = intentResult.status === "fulfilled"
        ? intentResult.value
        : isConversational(message.trim())
          ? { intent: "conversational", filters: {}, backRefPosition: null, liveSource: null }
          : { intent: "search", filters: {}, backRefPosition: null, liveSource: null };
      const cachedEmbedding: number[] | null = precomputedEmbedding.status === "fulfilled"
        ? precomputedEmbedding.value
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
        for await (const token of ragQuery(message.trim(), targeted, history, resolvedCtx, portfolioStats, focusContext, engagementSignals)) {
          fullResponse += token;
          sendEvent("token", { text: token });
        }
        await storage.appendEdenMessage(sid, {
          role: "assistant", content: fullResponse,
          assetIds: targeted.map((a) => a.id), assets: assetPayload,
        });
        sendEvent("done", { sessionId: sid });
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
          for await (const token of aggregationQuery(message.trim(), resolvedResult, history, resolvedCtx, portfolioStats, focusContext)) {
            fullResponse += token;
            sendEvent("token", { text: token });
          }
          await storage.appendEdenMessage(sid, { role: "assistant", content: fullResponse, assetIds: [], assets: [] });
          sendEvent("done", { sessionId: sid });
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
          for await (const token of aggregationQuery(message.trim(), sqlCountResult, history, resolvedCtx, portfolioStats, focusContext)) {
            fullResponse += token;
            sendEvent("token", { text: token });
          }
          await storage.appendEdenMessage(sid, { role: "assistant", content: fullResponse, assetIds: [], assets: [] });
          sendEvent("done", { sessionId: sid });
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
          sendEvent("done", { sessionId: sid });
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
            for await (const token of compareQuery(message.trim(), fetchedForCompare, history, resolvedCtx, portfolioStats, focusContext)) {
              fullResponse += token;
              sendEvent("token", { text: token });
            }
            await storage.appendEdenMessage(sid, {
              role: "assistant", content: fullResponse,
              assetIds: fetchedForCompare.map((a) => a.id),
              assets: compareAssetPayload,
            });
            sendEvent("done", { sessionId: sid });
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
        for await (const token of conceptQuery(message.trim(), history, resolvedCtx, portfolioStats, focusContext)) {
          fullResponse += token;
          sendEvent("token", { text: token });
        }

        const CONCEPT_SIMILARITY_THRESHOLD = 0.50;
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
          for await (const token of ragQuery(bridgePrompt, relatedAssets, [], resolvedCtx, portfolioStats, focusContext, engagementSignals)) {
            fullResponse += token;
            sendEvent("token", { text: token });
          }

          await storage.appendEdenMessage(sid, {
            role: "assistant", content: fullResponse,
            assetIds: relatedAssets.slice(0, 3).map((a) => a.id),
            assets: relatedAssetPayload,
          });
        } else {
          await storage.appendEdenMessage(sid, { role: "assistant", content: fullResponse, assetIds: [], assets: [] });
        }

        sendEvent("done", { sessionId: sid });
        return;
      }

      // ── Path 5: Conversational ─────────────────────────────────────────────────
      if (chat) {
        sendEvent("context", { sessionId: sid, assets: [] });
        let fullResponse = "";
        for await (const token of directQuery(message.trim(), history, resolvedCtx, portfolioStats, focusContext)) {
          fullResponse += token;
          sendEvent("token", { text: token });
        }
        await storage.appendEdenMessage(sid, { role: "assistant", content: fullResponse, assetIds: [], assets: [] });
        sendEvent("done", { sessionId: sid });
        return;
      }

      // ── Path 6: Standard RAG (semantic retrieval) ──────────────────────────────

      const institutionName = filters.institution ?? detectInstitutionName(message.trim(), portfolioInstitutionNames);

      let allSemantic: import("../storage").RetrievedAsset[];
      let institutionAssets: import("../storage").RetrievedAsset[] = [];

      try {
        const queryEmbedding = cachedEmbedding ?? await embedQuery(message.trim());
        const instAssets = institutionName
          ? await storage.searchIngestedAssetsByInstitution(institutionName, 10).catch(() => [])
          : [];
        institutionAssets = instAssets;
        if (filtersActive) {
          allSemantic = await storage.filteredSemanticSearch(queryEmbedding, geoRx, filters.modality, filters.stage, filters.indication, filters.institution, 20, filters.biology, sinceDate, filters.trending ? 0.65 : undefined, true);
        } else {
          allSemantic = await storage.filteredSemanticSearch(queryEmbedding, undefined, undefined, undefined, undefined, undefined, 20, undefined, undefined, undefined, true);
        }
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
      }));

      const externalResults = await liveResultsPromise;
      sendEvent("context", { sessionId: sid, assets: assetPayload, externalResults, activeSource: liveSource ?? "tto" });
      const ragQuestion = filters.trending
        ? `${message.trim()}\n\n[CONTEXT FOR EDEN: These assets were indexed in the last 90 days and are well-documented. After presenting them, add 2–3 sentences of genuine market context from your industry intelligence — what deal dynamics, funding trends, or mechanism enthusiasm makes this area compelling right now. Do NOT fabricate market data; only reference what you know from your training.]`
        : message.trim();
      let fullResponse = "";
      for await (const token of ragQuery(ragQuestion, retrieved, history, resolvedCtx, portfolioStats, focusContext, engagementSignals)) {
        fullResponse += token;
        sendEvent("token", { text: token });
      }
      await storage.appendEdenMessage(sid, {
        role: "assistant", content: fullResponse,
        assetIds: retrieved.slice(0, 3).map((a) => a.id), assets: assetPayload,
      });

      sendEvent("done", { sessionId: sid });
    } catch (err: unknown) {
      const errMsg = "Chat failed";
      console.error("[EDEN chat] Error:", err);
      sendEvent("error", { message: errMsg });
    } finally {
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
    try {
      const limit = Math.min(100, parseInt(String(req.query.limit ?? "50"), 10) || 50);
      const sessions = await storage.listEdenSessions(limit);
      res.json(sessions);
    } catch (err: unknown) {
      const msg = "Failed";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/eden/sessions/:sessionId", verifyAnyAuth, async (req, res) => {
    try {
      const session = await storage.getEdenSession(String(req.params.sessionId));
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json(session);
    } catch (err: unknown) {
      const msg = "Failed";
      res.status(500).json({ error: msg });
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
