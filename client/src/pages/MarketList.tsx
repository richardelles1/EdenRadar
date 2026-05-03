import { Link } from "wouter";
import { Nav } from "@/components/Nav";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { Button } from "@/components/ui/button";
import {
  Tag,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Building2,
  FileSearch,
  Handshake,
} from "lucide-react";

const ACCENT = "hsl(234 80% 58%)";

const START_LISTING_HREF = "/login?redirect=/market/create-listing";

const SELLER_AUDIENCE = [
  {
    icon: Building2,
    title: "TTOs and university spin-outs",
    body: "Find pharma partners for IND-ready and preclinical programs without burning your pipeline on cold outreach.",
  },
  {
    icon: FileSearch,
    title: "Biotechs with deprioritized assets",
    body: "Recover value from non-core programs. List confidentially — your identity stays hidden until mutual NDA.",
  },
  {
    icon: Handshake,
    title: "Independent inventors and consortia",
    body: "Reach licensing buyers directly inside a curated, signal-rich marketplace with admin-reviewed listings.",
  },
];

const HOW_LISTING_WORKS = [
  {
    step: "1",
    title: "Create a listing",
    body: "Provide therapeutic area, modality, stage, mechanism, IP status, and an asking price (or price range). Choose blind or open mode.",
  },
  {
    step: "2",
    title: "Admin review",
    body: "Our team reviews every listing for quality, completeness, and legitimacy before it goes live. Typical turnaround: 1–2 business days.",
  },
  {
    step: "3",
    title: "Receive EOIs",
    body: "Qualified buyers submit Expressions of Interest. You decide whom to engage with inside an NDA-gated deal room.",
  },
  {
    step: "4",
    title: "Close with Eden",
    body: "Eden facilitates the deal room and pays out a clean, predictable success fee only when a deal closes.",
  },
];

export default function MarketList() {
  useDocumentMeta({
    title: "List your biopharma assets on EdenMarket | EdenRadar",
    description:
      "List deprioritized programs, TTO spin-outs, and non-core biopharma assets on EdenMarket. Confidential blind listings, NDA-gated deal rooms, and a transparent success-fee model.",
  });

  return (
    <div className="min-h-screen bg-background">
      <Nav />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-16">
        {/* Hero */}
        <section className="text-center space-y-5" data-testid="market-list-hero">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20">
            <Tag className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 tracking-wide uppercase">
              For Sellers
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold text-foreground tracking-tight">
            List your assets where<br />
            <span className="text-indigo-600 dark:text-indigo-400">qualified buyers actually look</span>
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
            EdenMarket gives TTOs, biotechs, and inventors a curated, confidential channel to reach BD/licensing teams.
            Pay only when a deal closes — and stay anonymous until you decide otherwise.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap pt-2">
            <a href={START_LISTING_HREF} data-testid="market-list-cta-hero-link">
              <Button
                size="lg"
                className="gap-2 text-white"
                style={{ background: ACCENT }}
                data-testid="market-list-cta-hero"
              >
                Start listing
                <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
          </div>
        </section>

        {/* Audience */}
        <section className="space-y-6" data-testid="market-list-audience">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Built for asset owners</h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Whether you're a TTO, a biotech with shelved programs, or an independent inventor — EdenMarket is your
              channel.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {SELLER_AUDIENCE.map((a) => (
              <div key={a.title} className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                  <a.icon className="w-5 h-5 text-indigo-500" />
                </div>
                <h3 className="text-sm font-bold text-foreground">{a.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{a.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Blind listing explainer */}
        <section className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-6 sm:p-8" data-testid="market-list-blind">
          <div className="grid sm:grid-cols-[auto_1fr] gap-5">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/15 flex items-center justify-center">
              <EyeOff className="w-6 h-6 text-indigo-500" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-bold text-foreground">Blind listings keep you anonymous</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Choose blind mode and your institution name, asset name, and contact info stay hidden. Buyers see only the
                structured deal facts — therapeutic area, modality, stage, IP status, mechanism, and price range. Identity is
                only revealed inside an NDA-gated deal room after you accept an EOI.
              </p>
              <ul className="grid sm:grid-cols-2 gap-2 pt-1">
                {[
                  "No public association with your institution",
                  "Reveal identity on your terms inside the deal room",
                  "Mutual NDA enforced before any document exchange",
                  "Toggle between blind and open at any time",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                    <span className="text-sm text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="space-y-6" data-testid="market-list-how">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-foreground">How listing works</h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Four steps from listing to close. Eden curates buyers and facilitates the deal — you stay in control.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {HOW_LISTING_WORKS.map((s) => (
              <div key={s.step} className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-sm font-bold text-indigo-500">
                  {s.step}
                </div>
                <h3 className="text-sm font-bold text-foreground">{s.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Success-fee aligned CTA — full pricing lives on /pricing */}
        <section className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-6 sm:p-8 space-y-6" data-testid="market-list-pricing">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20">
              <ShieldCheck className="w-3 h-3 text-indigo-500" />
              <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 tracking-wide uppercase">
                Success-fee aligned
              </span>
            </div>
            <h2 className="text-2xl font-bold text-foreground">Pay only when you close</h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              EdenMarket grants both buy-side and sell-side access, with success fees that apply only to closed deals.
            </p>
            <div className="pt-2">
              <Link href="/pricing">
                <a className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline" data-testid="market-list-see-pricing">
                  See full pricing →
                </a>
              </Link>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 flex-wrap pt-2">
            <a href={START_LISTING_HREF} data-testid="market-list-cta-footer-link">
              <Button
                size="lg"
                className="gap-2 text-white"
                style={{ background: ACCENT }}
                data-testid="market-list-cta-footer"
              >
                Start listing
                <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
