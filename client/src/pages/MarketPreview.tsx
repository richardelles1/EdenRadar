import { useEffect } from "react";
import { Link } from "wouter";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingBag,
  EyeOff,
  Send,
  GitCompareArrows,
  CheckCircle2,
  Lock,
  Zap,
  ArrowRight,
  Loader2,
  ShieldCheck,
  Layers,
} from "lucide-react";
import { useMarketSubscribe } from "@/hooks/use-market-subscribe";

const ACCENT = "hsl(271 81% 55%)";

const SAMPLE_LISTINGS = [
  {
    id: "demo-1",
    confidential: false,
    assetName: "BCMA-targeting CAR-T (preclinical)",
    therapeuticArea: "Oncology",
    modality: "Cell Therapy",
    stage: "Preclinical",
    engagement: "Actively Seeking",
    engagementColor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    summary: "Autologous CAR-T candidate with novel binder showing 100% tumor regression in MM xenografts. IND-enabling tox underway.",
    price: "$5M – $12M upfront",
    eoiCount: 4,
    score: 86,
  },
  {
    id: "demo-2",
    confidential: true,
    therapeuticArea: "Neurology",
    modality: "Small Molecule",
    stage: "Phase 1",
    engagement: "Quietly Inbound",
    engagementColor: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    summary: "Orally bioavailable, brain-penetrant kinase inhibitor for rare neurodegenerative indication. P1 SAD complete with clean safety.",
    price: "Price on request",
    eoiCount: 2,
    score: 72,
  },
  {
    id: "demo-3",
    confidential: false,
    assetName: "Anti-PD-L1 / VEGF bispecific",
    therapeuticArea: "Oncology",
    modality: "Bispecific Antibody",
    stage: "IND-Ready",
    engagement: "Under LOI",
    engagementColor: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    summary: "Composition-of-matter IP, manufacturable construct, strong PK in NHP. TTO seeks exclusive global license.",
    price: "$2M – $6M upfront",
    eoiCount: 7,
    score: 91,
  },
];

const HOW_IT_WORKS = [
  {
    title: "Browse",
    body: "Explore curated TTO spin-outs, deprioritized programs, and biotech assets — filtered by modality, stage, and therapeutic area.",
    icon: Layers,
  },
  {
    title: "Compare",
    body: "Stack up to 3 listings side-by-side with our intelligence-derived Eden Signal Score and structured fields.",
    icon: GitCompareArrows,
  },
  {
    title: "Connect",
    body: "Submit an Expression of Interest. Sellers respond inside private NDA-gated deal rooms — never via cold email.",
    icon: Send,
  },
];

function ListingCardPreview({ l }: { l: typeof SAMPLE_LISTINGS[0] }) {
  return (
    <div
      className="rounded-xl border border-card-border bg-card p-5 flex flex-col gap-3"
      data-testid={`market-preview-card-${l.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {l.confidential ? (
            <div className="flex items-center gap-1.5 mb-1">
              <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground italic">Confidential Listing</span>
            </div>
          ) : (
            <p className="text-sm font-semibold text-foreground truncate mb-0.5">{l.assetName}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[10px] border-border">{l.therapeuticArea}</Badge>
            <Badge variant="outline" className="text-[10px] border-border">{l.modality}</Badge>
            <Badge variant="outline" className="text-[10px] border-border">{l.stage}</Badge>
          </div>
        </div>
        <Badge variant="outline" className={`text-[10px] shrink-0 ${l.engagementColor}`}>
          {l.engagement}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{l.summary}</p>

      <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-border/60">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">{l.price}</span>
          <span className="text-[10px] text-muted-foreground">{l.eoiCount} EOIs</span>
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/8"
          >
            <Zap className="w-2.5 h-2.5" /> {l.score}
          </span>
        </div>
        <Button
          size="sm"
          className="h-7 text-xs gap-1 text-white"
          style={{ background: ACCENT }}
          data-testid={`market-preview-eoi-btn-${l.id}`}
          disabled
        >
          <Send className="w-3 h-3" /> Submit EOI
        </Button>
      </div>
    </div>
  );
}

export default function MarketPreview() {
  const { subscribe, isLoading } = useMarketSubscribe();

  useEffect(() => {
    document.title = "EdenMarket — Confidential Biopharma Deal Marketplace | EdenRadar";

    const setMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.content = content;
    };
    const setOg = (property: string, content: string) => {
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    setMeta(
      "description",
      "EdenMarket is the confidential biopharma deal marketplace — browse, compare, and submit EOIs on TTO spin-outs, deprioritized programs, and non-core assets. NDA-gated deal rooms, blind listings, success-fee model.",
    );
    setOg("og:title", "EdenMarket — Confidential Biopharma Deal Marketplace");
    setOg(
      "og:description",
      "Browse curated biopharma assets for licensing or acquisition. Submit EOIs in NDA-protected deal rooms.",
    );
    setOg("og:type", "website");
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Nav />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-16">
        {/* Hero */}
        <section className="text-center space-y-5" data-testid="market-preview-hero">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20">
            <ShoppingBag className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 tracking-wide uppercase">
              EdenMarket — Live Preview
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold text-foreground tracking-tight">
            The confidential biopharma<br />
            <span className="text-violet-600 dark:text-violet-400">deal marketplace</span>
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
            EdenMarket connects BD/licensing teams with sellers of deprioritized programs, TTO spin-outs, and non-core
            biotech assets — all in a curated, NDA-protected environment.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap pt-2">
            <Button
              size="lg"
              className="gap-2 text-white"
              style={{ background: ACCENT }}
              onClick={() => subscribe({ redirectTo: "/market" })}
              disabled={isLoading}
              data-testid="market-preview-subscribe-hero"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Redirecting…
                </>
              ) : (
                <>
                  Subscribe — $1,000/mo
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
            <Link href="/market/list">
              <Button size="lg" variant="outline" data-testid="market-preview-list-cta">
                List your assets
              </Button>
            </Link>
          </div>
        </section>

        {/* Sample listings */}
        <section className="space-y-5" data-testid="market-preview-listings">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-bold text-foreground">Sample listings</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                A taste of what subscribers see — real listings are curated and admin-reviewed.
              </p>
            </div>
            <Badge variant="outline" className="border-violet-500/30 text-violet-600 dark:text-violet-400 bg-violet-500/5">
              Demo data
            </Badge>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SAMPLE_LISTINGS.map((l) => <ListingCardPreview key={l.id} l={l} />)}
          </div>
        </section>

        {/* Comparison teaser */}
        <section className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6 sm:p-8 space-y-5" data-testid="market-preview-compare">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
              <GitCompareArrows className="w-5 h-5 text-violet-500" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-foreground">Compare up to 3 listings side-by-side</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Therapeutic area, modality, stage, IP status, mechanism, price range, AI-generated summary — all in one view
                so you can shortlist faster.
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-muted-foreground font-semibold">Field</th>
                  <th className="text-left py-2 px-2 text-foreground font-semibold">Listing A</th>
                  <th className="text-left py-2 px-2 text-foreground font-semibold">Listing B</th>
                  <th className="text-left py-2 px-2 text-foreground font-semibold">
                    <span className="flex items-center gap-1 italic text-muted-foreground">
                      <EyeOff className="w-3 h-3" /> Confidential
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/50"><td className="py-2 px-2 font-medium">Modality</td><td className="py-2 px-2">Cell Therapy</td><td className="py-2 px-2">Bispecific Ab</td><td className="py-2 px-2">Small Molecule</td></tr>
                <tr className="border-b border-border/50"><td className="py-2 px-2 font-medium">Stage</td><td className="py-2 px-2">Preclinical</td><td className="py-2 px-2">IND-Ready</td><td className="py-2 px-2">Phase 1</td></tr>
                <tr className="border-b border-border/50"><td className="py-2 px-2 font-medium">IP Status</td><td className="py-2 px-2">Composition</td><td className="py-2 px-2">CoM + Method</td><td className="py-2 px-2">Method-of-Use</td></tr>
                <tr><td className="py-2 px-2 font-medium">Price Range</td><td className="py-2 px-2">$5M – $12M</td><td className="py-2 px-2">$2M – $6M</td><td className="py-2 px-2">On request</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Deal room teaser */}
        <section className="rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-5" data-testid="market-preview-dealroom">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-foreground">NDA-gated deal rooms</h2>
              <p className="text-sm text-muted-foreground mt-1">
                When a seller accepts your EOI, both parties enter a private deal room. Confidential identity is unmasked,
                documents are exchanged under mutual NDA, and Eden facilitates the close.
              </p>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.title} className="rounded-xl border border-border bg-background p-4 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <s.icon className="w-4 h-4 text-violet-500" />
                </div>
                <p className="text-sm font-semibold text-foreground">{s.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-6 sm:p-8 space-y-6" data-testid="market-preview-pricing">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 mb-2">
                <Lock className="w-3 h-3 text-violet-500" />
                <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 tracking-wide uppercase">
                  Subscription
                </span>
              </div>
              <h2 className="text-xl font-bold text-foreground">EdenMarket Access</h2>
              <p className="text-sm text-muted-foreground mt-1">Full buy-side and sell-side access</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-foreground tabular-nums">$1,000</p>
              <p className="text-xs text-muted-foreground">per month</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <ul className="space-y-2.5">
              {[
                "Unlimited listing browsing",
                "Submit up to 10 EOIs / month",
                "Side-by-side comparison (up to 3)",
                "NDA-gated deal rooms",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                  <span className="text-sm text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
            <ul className="space-y-2.5">
              {[
                "Create and manage your own listings",
                "Blind/confidential listing option",
                "Admin-reviewed listing quality",
                "Eden Signal Score on every listing",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                  <span className="text-sm text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Success fees on closed deals</p>
            <div className="grid sm:grid-cols-3 gap-3 text-xs">
              <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                <span className="text-muted-foreground">Deal &lt; $10M</span>
                <span className="font-semibold text-foreground tabular-nums">$10,000</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                <span className="text-muted-foreground">$10M – $50M</span>
                <span className="font-semibold text-foreground tabular-nums">$30,000</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                <span className="text-muted-foreground">Deal &gt; $50M</span>
                <span className="font-semibold text-foreground tabular-nums">$50,000</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 flex-wrap pt-2">
            <Button
              size="lg"
              className="gap-2 text-white"
              style={{ background: ACCENT }}
              onClick={() => subscribe({ redirectTo: "/market" })}
              disabled={isLoading}
              data-testid="market-preview-subscribe-footer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Redirecting…
                </>
              ) : (
                <>
                  Subscribe to EdenMarket
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
            <Link href="/market/list">
              <Button size="lg" variant="outline" data-testid="market-preview-list-footer">
                List your assets instead
              </Button>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
