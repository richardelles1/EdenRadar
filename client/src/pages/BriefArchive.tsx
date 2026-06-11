import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Nav } from "@/components/Nav";
import { useDocumentMeta } from "@/hooks/use-document-meta";

type BriefIssue = {
  id: number;
  slug: string;
  issueNumber: number;
  title: string;
  publishedAt: string | null;
  content?: {
    therapeutic_spotlight?: { area?: string };
    the_number?: { figure?: string; headline?: string };
  };
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function SubscribeForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setState("loading");
    try {
      const res = await fetch("/api/brief/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Failed");
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p style={{ fontFamily: "'JetBrains Mono', monospace" }}
         className="text-xs tracking-widest uppercase text-emerald-700">
        Subscribed. The next issue will reach you directly.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={compact ? "flex gap-0" : "flex flex-col gap-2"}>
      {!compact && (
        <p className="text-sm text-stone-500 leading-relaxed mb-2">
          Monthly intelligence from 400+ monitored TTO portfolios.
          No pitch. Just signal.
        </p>
      )}
      <div className="flex gap-0">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          className="flex-1 min-w-0 border border-stone-300 border-r-0 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 outline-none focus:border-emerald-600"
          style={{ fontFamily: "inherit" }}
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className="bg-emerald-700 text-white px-4 py-2 text-xs tracking-widest uppercase border border-emerald-700 hover:bg-emerald-800 transition-colors disabled:opacity-60 flex-shrink-0"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {state === "loading" ? "..." : "Subscribe"}
        </button>
      </div>
      {state === "error" && (
        <p className="text-xs text-red-600 mt-1">Something went wrong. Please try again.</p>
      )}
    </form>
  );
}

export default function BriefArchive() {
  useDocumentMeta({
    title: "The Eden Brief - Intelligence from the Licensing Frontier",
    description: "Monthly intelligence on the biotech asset licensing market. Signal from 400+ monitored TTO portfolios, published by Eden NX.",
  });

  const { data: issues = [], isLoading } = useQuery<BriefIssue[]>({
    queryKey: ["brief-archive"],
    queryFn: () => fetch("/api/brief").then((r) => r.json()),
  });

  return (
    <div className="min-h-screen" style={{ background: "#e8e6e1" }}>
      <Nav />

      <div className="max-w-5xl mx-auto px-6 py-10 sm:py-16">

        {/* Page header */}
        <div className="mb-12">
          <p
            className="text-xs tracking-widest uppercase mb-3"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: "#6b7570" }}
          >
            Eden NX · Intelligence Brief
          </p>
          <h1
            className="text-3xl sm:text-5xl mb-3"
            style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "#1a1e23", lineHeight: 1.1 }}
          >
            The Eden <em>Brief</em>
          </h1>
          <p className="text-base text-stone-500 font-light">
            Signal from the licensing frontier. Published monthly.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* Issue list */}
          <div className="lg:col-span-2">
            <div
              className="text-xs tracking-widest uppercase mb-4 pb-3 inline-block"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: "#2d7a52",
                borderBottom: "2px solid #2d7a52",
              }}
            >
              All Issues
            </div>

            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-stone-400 py-8">
                <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                Loading...
              </div>
            )}

            {!isLoading && issues.length === 0 && (
              <div className="py-12 text-sm text-stone-400">
                The first issue is on its way. Subscribe below to receive it.
              </div>
            )}

            <div className="divide-y" style={{ borderColor: "#dddad4" }}>
              {issues.map((issue) => {
                const spotlightArea = issue.content?.therapeutic_spotlight?.area;
                const statFigure = issue.content?.the_number?.figure;
                return (
                  <Link key={issue.id} href={`/brief/${issue.slug}`}>
                    <a className="flex items-start justify-between py-5 group" style={{ textDecoration: "none" }}>
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-xs tracking-widest uppercase mb-1"
                          style={{ fontFamily: "'JetBrains Mono', monospace", color: "#9a9590" }}
                        >
                          Issue {issue.issueNumber} &middot; {formatDate(issue.publishedAt)}
                        </div>
                        <div
                          className="text-lg font-medium group-hover:text-emerald-700 transition-colors mb-1.5"
                          style={{ color: "#1a1e23" }}
                        >
                          {issue.title}
                        </div>
                        {(spotlightArea || statFigure) && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {spotlightArea && (
                              <span
                                className="text-xs px-2 py-0.5 rounded-sm"
                                style={{
                                  fontFamily: "'JetBrains Mono', monospace",
                                  fontSize: "10px",
                                  letterSpacing: "0.06em",
                                  textTransform: "uppercase",
                                  color: "#2d7a52",
                                  background: "#e8f5ee",
                                  border: "1px solid #b8dfc8",
                                }}
                              >
                                Spotlight: {spotlightArea}
                              </span>
                            )}
                            {statFigure && (
                              <span
                                className="text-xs"
                                style={{
                                  fontFamily: "'JetBrains Mono', monospace",
                                  fontSize: "10px",
                                  color: "#9a9590",
                                }}
                              >
                                {statFigure} assets tracked
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <span
                        className="text-xs tracking-widest uppercase mt-1 flex-shrink-0 ml-4 group-hover:text-emerald-700 transition-colors"
                        style={{ fontFamily: "'JetBrains Mono', monospace", color: "#9a9590" }}
                      >
                        Read &rarr;
                      </span>
                    </a>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div
              className="p-5"
              style={{ background: "#faf9f6", border: "1px solid #dddad4" }}
            >
              <div
                className="text-xs tracking-widest uppercase mb-3"
                style={{ fontFamily: "'JetBrains Mono', monospace", color: "#2d7a52" }}
              >
                Subscribe
              </div>
              <SubscribeForm />
            </div>

            <div className="mt-6 text-xs text-stone-400 leading-relaxed">
              Each issue is a permanent, public URL. Share any issue directly.
              To unsubscribe, reply to any email with "unsubscribe" in the subject.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
