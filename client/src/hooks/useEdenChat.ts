import { useState } from "react";

export type ChatAsset = {
  id: number;
  assetName: string;
  institution: string;
  indication: string;
  modality: string;
  developmentStage?: string;
  ipType?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  similarity: number;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  assets?: ChatAsset[];
  isStreaming?: boolean;
};

export type EdenSessionSummary = {
  id: number;
  sessionId: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    assets?: ChatAsset[];
    ts: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

type SseContextPayload = { sessionId?: string; assets: ChatAsset[] };
type SseTokenPayload = { text: string };
type SseDonePayload = { sessionId?: string };
type SseErrorPayload = { message: string };

function parseSsePayload(evt: string, raw: unknown): void | { type: "context"; data: SseContextPayload } | { type: "token"; data: SseTokenPayload } | { type: "done"; data: SseDonePayload } | { type: "error"; data: SseErrorPayload } {
  if (typeof raw !== "object" || raw === null) return;
  if (evt === "context") return { type: "context", data: raw as SseContextPayload };
  if (evt === "token") return { type: "token", data: raw as SseTokenPayload };
  if (evt === "done") return { type: "done", data: raw as SseDonePayload };
  if (evt === "error") return { type: "error", data: raw as SseErrorPayload };
}

export function useEdenChat(pw: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState("");

  async function send(overrideMsg?: string): Promise<void> {
    const raw = overrideMsg ?? input;
    if (!raw.trim() || streaming) return;
    const msg = raw.trim();
    setInput("");
    setMessages((prev) => [
      ...prev,
      { role: "user", content: msg },
      { role: "assistant", content: "", assets: [], isStreaming: true },
    ]);
    setStreaming(true);

    try {
      const response = await fetch("/api/eden/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ message: msg, sessionId: sessionId || undefined }),
      });

      if (!response.ok || !response.body) {
        const errBody: unknown = await response.json().catch(() => ({ error: "Chat failed" }));
        const errMsg =
          typeof errBody === "object" && errBody !== null && "error" in errBody
            ? String((errBody as { error: unknown }).error)
            : "Chat failed";
        throw new Error(errMsg);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

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
          const evtType = evtMatch[1];
          let parsed: unknown;
          try { parsed = JSON.parse(dataMatch[1]); } catch { continue; }

          const dispatched = parseSsePayload(evtType, parsed);
          if (!dispatched) continue;

          if (dispatched.type === "context") {
            const d = dispatched.data;
            if (d.sessionId) setSessionId(d.sessionId);
            setMessages((prev) => {
              const upd = [...prev];
              const last = upd[upd.length - 1];
              if (last?.role === "assistant") upd[upd.length - 1] = { ...last, assets: d.assets ?? [] };
              return upd;
            });
          } else if (dispatched.type === "token") {
            const d = dispatched.data;
            setMessages((prev) => {
              const upd = [...prev];
              const last = upd[upd.length - 1];
              if (last?.role === "assistant") upd[upd.length - 1] = { ...last, content: last.content + d.text };
              return upd;
            });
          } else if (dispatched.type === "done") {
            const d = dispatched.data;
            if (d.sessionId) setSessionId(d.sessionId);
            setMessages((prev) => {
              const upd = [...prev];
              const last = upd[upd.length - 1];
              if (last?.role === "assistant") upd[upd.length - 1] = { ...last, isStreaming: false };
              return upd;
            });
          } else if (dispatched.type === "error") {
            throw new Error(dispatched.data.message ?? "Chat error");
          }
        }
      }

      // Finalize the last assistant turn in case `done` event was not received
      setMessages((prev) => {
        const upd = [...prev];
        const last = upd[upd.length - 1];
        if (last?.role === "assistant" && last.isStreaming) {
          upd[upd.length - 1] = { ...last, isStreaming: false };
        }
        return upd;
      });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : "Chat failed";
      setMessages((prev) => {
        const upd = [...prev];
        const last = upd[upd.length - 1];
        if (last?.role === "assistant" && last.isStreaming) {
          upd[upd.length - 1] = { ...last, content: `Error: ${errMsg}`, isStreaming: false };
        }
        return upd;
      });
    } finally {
      setStreaming(false);
    }
  }

  function clearChat(): void {
    setMessages([]);
    setSessionId("");
  }

  function loadSession(session: EdenSessionSummary): void {
    setMessages(
      (session.messages ?? []).map((m) => ({
        role: m.role,
        content: m.content,
        assets: m.assets,
      }))
    );
    setSessionId(session.sessionId);
  }

  return { messages, setMessages, input, setInput, streaming, sessionId, send, clearChat, loadSession };
}
