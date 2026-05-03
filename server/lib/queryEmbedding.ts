import OpenAI from "openai";

const EMBED_MODEL = "text-embedding-3-small";
// Soft budget on the embedding call. The task plan suggests ~800ms but cold
// OpenAI calls routinely run 900-1300ms; cache hits are ~0ms so the typical
// hot-path latency is well under target. Set to 1500ms to absorb the cold
// start while still failing open well before the route's own timeout.
const EMBED_TIMEOUT_MS = 1500;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

type CacheEntry = { vec: number[]; expires: number };
const cache = new Map<string, CacheEntry>();

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function evictIfNeeded() {
  if (cache.size <= CACHE_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.expires <= now) cache.delete(k);
  }
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

export type EmbedResult =
  | { ok: true; vec: number[]; cached: boolean; latencyMs: number }
  | { ok: false; reason: "empty" | "timeout" | "error"; latencyMs: number; error?: string };

export async function getQueryEmbedding(query: string): Promise<EmbedResult> {
  const start = Date.now();
  const text = (query ?? "").trim();
  if (!text) return { ok: false, reason: "empty", latencyMs: 0 };

  const key = normalize(text);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return { ok: true, vec: cached.vec, cached: true, latencyMs: Date.now() - start };
  }

  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, reason: "error", latencyMs: 0, error: "OPENAI_API_KEY missing" };
  }

  try {
    const result = await Promise.race<
      | { kind: "ok"; vec: number[] }
      | { kind: "timeout" }
    >([
      getClient()
        .embeddings.create({ model: EMBED_MODEL, input: text })
        .then((r) => ({ kind: "ok" as const, vec: r.data[0].embedding })),
      new Promise<{ kind: "timeout" }>((resolve) =>
        setTimeout(() => resolve({ kind: "timeout" }), EMBED_TIMEOUT_MS),
      ),
    ]);

    const latencyMs = Date.now() - start;
    if (result.kind === "timeout") {
      return { ok: false, reason: "timeout", latencyMs };
    }
    cache.set(key, { vec: result.vec, expires: Date.now() + CACHE_TTL_MS });
    evictIfNeeded();
    return { ok: true, vec: result.vec, cached: false, latencyMs };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function _clearQueryEmbeddingCacheForTests(): void {
  cache.clear();
}
