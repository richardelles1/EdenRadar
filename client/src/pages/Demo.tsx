import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { CheckCircle2, ArrowRight } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type FormData = {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  role: string;
  teamSize: string;
  intent: string;
};

type SubmitState = "idle" | "submitting" | "success" | "error";

// ── Static data ──────────────────────────────────────────────────────────────

const STATS = [
  { stat: "350+", label: "Tech Transfer Offices" },
  { stat: "33K+", label: "Scored Assets" },
  { stat: "40+", label: "Live Data Sources" },
  { stat: "Daily", label: "Updates & Alerts" },
];

const ROLES = [
  { value: "", label: "Select your role" },
  { value: "pharma_bd", label: "Pharma BD / Licensing" },
  { value: "biotech_bd", label: "Biotech BD / Strategy" },
  { value: "tto", label: "TTO / Licensing Manager" },
  { value: "investor", label: "Biotech Investor / VC" },
  { value: "consultant", label: "BD Consultant" },
  { value: "researcher", label: "Academic Researcher" },
  { value: "other", label: "Other" },
];

const TEAM_SIZES = [
  { value: "", label: "Team size" },
  { value: "solo", label: "Just me" },
  { value: "2_5", label: "2 – 5" },
  { value: "6_20", label: "6 – 20" },
  { value: "20_plus", label: "20+" },
];


// ── Success state ────────────────────────────────────────────────────────────

function SuccessState({ name }: { name: string }) {
  return (
    <div className="text-center py-8">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-6"
        style={{
          background: "hsl(var(--primary) / 0.1)",
          border: "1px solid hsl(var(--primary) / 0.25)",
        }}
      >
        <CheckCircle2 className="w-7 h-7" style={{ color: "hsl(var(--primary))" }} />
      </div>

      <h2
        className="font-bold mb-3 leading-tight"
        style={{
          fontFamily: "'Barlow Semi Condensed', 'Barlow', system-ui, sans-serif",
          fontSize: "clamp(1.5rem, 3vw, 2rem)",
          color: "hsl(var(--foreground))",
          letterSpacing: "-0.02em",
        }}
      >
        You're on the list{name ? `, ${name}` : ""}.
      </h2>

      <p className="text-sm leading-relaxed mb-8 mx-auto" style={{ color: "hsl(var(--muted-foreground))", maxWidth: "30ch" }}>
        We review every application personally. Expect a reply within 24 hours.
      </p>

      <div
        className="rounded-xl p-4 text-left"
        style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
        }}
      >
        <p
          className="text-[0.6rem] font-semibold uppercase tracking-[0.15em] mb-3"
          style={{ color: "hsl(var(--primary))" }}
        >
          While you wait
        </p>
        {[
          { text: "Browse EdenMarket — our confidential deal marketplace", href: "/market" },
          { text: "See how EdenRadar works on the How It Works page", href: "/how-it-works" },
          { text: "Forward this to a colleague on your BD team", href: null },
        ].map(({ text, href }) => (
          <div key={text} className="flex items-start gap-2 mb-2 last:mb-0">
            <div
              className="w-1 h-1 rounded-full mt-[7px] shrink-0"
              style={{ background: "hsl(var(--primary))" }}
            />
            {href ? (
              <Link href={href}>
                <span className="text-[0.8rem] leading-relaxed hover:text-foreground transition-colors cursor-pointer" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {text}
                </span>
              </Link>
            ) : (
              <span className="text-[0.8rem] leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                {text}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Demo() {
  useDocumentMeta({
    title: "Request Early Access — EdenRadar",
    description:
      "Apply for early access to EdenRadar: AI-powered biotech asset discovery across 350+ technology transfer offices. Tell us about your BD team and we'll be in touch.",
  });

  const [form, setForm] = useState<FormData>({
    email: "", firstName: "", lastName: "",
    company: "", role: "", teamSize: "", intent: "",
  });
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  // Inject Barlow font (only needed for headings/stats, not the whole page)
  useEffect(() => {
    const id = "barlow-font-demo";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Semi+Condensed:wght@600;700&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  function set(key: keyof FormData, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "Work email required";
    if (!form.firstName.trim()) e.firstName = "Required";
    if (!form.lastName.trim()) e.lastName = "Required";
    if (!form.company.trim()) e.company = "Required";
    if (!form.role) e.role = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitState("submitting");
    try {
      const res = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Server error");
      setSubmitState("success");
    } catch {
      setSubmitState("error");
    }
  }

  const labelStyle = "text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
  const errorStyle = "text-[0.68rem] text-destructive mt-1";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "hsl(var(--background))" }}
    >
      <Nav />

      <main className="flex-1 flex flex-col">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_480px] xl:grid-cols-[1fr_520px]">

          {/* ── LEFT: narrative over full-bleed intelligence background ─── */}
          <div
            className="relative flex flex-col justify-center overflow-hidden"
            style={{ minHeight: "calc(100vh - 56px)" }}
          >
            {/* Full-bleed intelligence screenshot */}
            <img
              src="/images/screenshot-intelligence.png"
              alt=""
              aria-hidden
              className="absolute inset-0 w-full h-full pointer-events-none select-none"
              style={{ objectFit: "cover", objectPosition: "top center" }}
              draggable={false}
            />

            {/* Left-to-right gradient scrim — keeps text zone clean */}
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "linear-gradient(to right, hsl(var(--background)) 24%, hsl(var(--background) / 0.94) 40%, hsl(var(--background) / 0.65) 58%, hsl(var(--background) / 0.18) 78%, transparent 100%)",
              }}
            />

            {/* Content — anchored left, lives inside the opaque gradient zone */}
            <div
              className="relative z-10 flex flex-col justify-center px-10 py-16 lg:py-0 lg:px-14"
              style={{ maxWidth: 520 }}
            >
              {/* Headline */}
              <h1
                className="font-bold mb-4"
                style={{
                  fontFamily: "'Barlow Semi Condensed', 'Barlow', system-ui, sans-serif",
                  fontSize: "clamp(2.2rem, 4.5vw, 3.4rem)",
                  lineHeight: 1.05,
                  letterSpacing: "-0.025em",
                  color: "hsl(var(--foreground))",
                }}
              >
                The BD intelligence<br />
                your competitors<br />
                <span style={{ color: "hsl(var(--primary))" }}>don't have.</span>
              </h1>

              <p
                className="text-sm leading-relaxed mb-6"
                style={{
                  color: "hsl(var(--muted-foreground))",
                  maxWidth: "38ch",
                  fontFamily: "'Barlow', system-ui, sans-serif",
                }}
              >
                EdenRadar monitors 350+ university tech transfer offices and surfaces
                AI-enriched asset dossiers before they hit marketing channels. Your
                deal flow, running ahead of the competition.
              </p>

              {/* Stats */}
              <div className="flex gap-5 mb-8 flex-wrap">
                {STATS.map(({ stat, label }) => (
                  <div key={stat}>
                    <p
                      className="font-bold leading-none mb-1"
                      style={{
                        fontFamily: "'Barlow Semi Condensed', 'Barlow', system-ui, sans-serif",
                        fontSize: "1.7rem",
                        letterSpacing: "-0.025em",
                        color: "hsl(var(--foreground))",
                      }}
                    >
                      {stat}
                    </p>
                    <p
                      className="text-[0.68rem] leading-snug"
                      style={{
                        color: "hsl(var(--muted-foreground))",
                        maxWidth: "12ch",
                        fontFamily: "'Barlow', system-ui, sans-serif",
                      }}
                    >
                      {label}
                    </p>
                  </div>
                ))}
              </div>

              <p
                className="text-[0.68rem]"
                style={{ color: "hsl(var(--muted-foreground) / 0.6)", fontFamily: "'Barlow', system-ui, sans-serif" }}
              >
                Applications reviewed personally. We'll reach out within 24 hours.
              </p>
            </div>

            {/* Bottom-right context label — sits over the visible intelligence area */}
            <div
              className="absolute bottom-6 right-6 z-10 hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full text-[0.65rem] font-semibold pointer-events-none"
              style={{
                background: "hsl(var(--background) / 0.82)",
                border: "1px solid hsl(var(--border))",
                color: "hsl(var(--muted-foreground))",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: "hsl(var(--primary))" }}
              />
              Live landscape intelligence
            </div>
          </div>

          {/* ── RIGHT: form panel ───────────────────────────────────────── */}
          <div
            className="flex flex-col justify-center px-7 py-12 lg:py-16 lg:px-9"
            style={{
              background: "hsl(var(--card))",
              borderLeft: "1px solid hsl(var(--border))",
              minHeight: "calc(100vh - 56px)",
            }}
          >
            <div className="w-full max-w-sm mx-auto lg:max-w-none">
              {submitState === "success" ? (
                <SuccessState name={form.firstName} />
              ) : (
                <>
                  <h2
                    className="font-bold mb-2"
                    style={{
                      fontFamily: "'Barlow Semi Condensed', 'Barlow', system-ui, sans-serif",
                      fontSize: "clamp(1.5rem, 3vw, 1.9rem)",
                      letterSpacing: "-0.015em",
                      color: "hsl(var(--foreground))",
                    }}
                  >
                    Apply for early access
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-8">
                    Tell us about yourself. We'll match you to the right access tier.
                  </p>

                  <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">

                    {/* Email */}
                    <div className="space-y-1.5">
                      <Label htmlFor="demo-email" className={labelStyle}>Work email</Label>
                      <Input
                        id="demo-email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@company.com"
                        value={form.email}
                        onChange={e => set("email", e.target.value)}
                      />
                      {errors.email && <p className={errorStyle}>{errors.email}</p>}
                    </div>

                    {/* Name */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="demo-first" className={labelStyle}>First</Label>
                        <Input
                          id="demo-first"
                          type="text"
                          autoComplete="given-name"
                          placeholder="Jane"
                          value={form.firstName}
                          onChange={e => set("firstName", e.target.value)}
                        />
                        {errors.firstName && <p className={errorStyle}>{errors.firstName}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="demo-last" className={labelStyle}>Last</Label>
                        <Input
                          id="demo-last"
                          type="text"
                          autoComplete="family-name"
                          placeholder="Smith"
                          value={form.lastName}
                          onChange={e => set("lastName", e.target.value)}
                        />
                        {errors.lastName && <p className={errorStyle}>{errors.lastName}</p>}
                      </div>
                    </div>

                    {/* Company */}
                    <div className="space-y-1.5">
                      <Label htmlFor="demo-company" className={labelStyle}>Company</Label>
                      <Input
                        id="demo-company"
                        type="text"
                        autoComplete="organization"
                        placeholder="Acme Therapeutics"
                        value={form.company}
                        onChange={e => set("company", e.target.value)}
                      />
                      {errors.company && <p className={errorStyle}>{errors.company}</p>}
                    </div>

                    {/* Role + Team */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="demo-role" className={labelStyle}>Role</Label>
                        <select
                          id="demo-role"
                          value={form.role}
                          onChange={e => set("role", e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer"
                          style={{ appearance: "none" }}
                        >
                          {ROLES.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                        {errors.role && <p className={errorStyle}>{errors.role}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="demo-team" className={labelStyle}>Team size</Label>
                        <select
                          id="demo-team"
                          value={form.teamSize}
                          onChange={e => set("teamSize", e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer"
                          style={{ appearance: "none" }}
                        >
                          {TEAM_SIZES.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Intent */}
                    <div className="space-y-1.5">
                      <Label htmlFor="demo-intent" className={labelStyle}>
                        What are you hunting for?{" "}
                        <span className="normal-case tracking-normal font-normal text-muted-foreground/60">(optional)</span>
                      </Label>
                      <Textarea
                        id="demo-intent"
                        placeholder="e.g. early-stage oncology assets in solid tumors, CAR-T programs, gene therapy..."
                        value={form.intent}
                        onChange={e => set("intent", e.target.value)}
                        rows={2}
                        className="resize-none min-h-0"
                      />
                    </div>

                    {/* Submit */}
                    <Button
                      type="submit"
                      disabled={submitState === "submitting"}
                      className="w-full h-10 font-semibold gap-2 mt-1"
                    >
                      {submitState === "submitting" ? "Sending..." : (
                        <>Request access <ArrowRight className="w-4 h-4" /></>
                      )}
                    </Button>

                    {submitState === "error" && (
                      <p className="text-center text-sm text-destructive">
                        Something went wrong. Email us at{" "}
                        <a href="mailto:wmohamed@edennx.com" className="underline text-primary">
                          wmohamed@edennx.com
                        </a>{" "}or{" "}
                        <a href="mailto:relles@edennx.com" className="underline text-primary">
                          relles@edennx.com
                        </a>
                      </p>
                    )}
                  </form>

                  <p className="mt-5 text-center text-[0.65rem] text-muted-foreground/50">
                    No credit card. No spam. We review every application.
                  </p>
                </>
              )}
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer
        className="border-t border-border py-6 px-6 text-xs text-muted-foreground dark:text-muted-foreground"
        style={{ background: "hsl(var(--background))" }}
      >
        <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <span>© {new Date().getFullYear()} EdenRadar, Inc.</span>
          <div className="flex items-center gap-6">
            <Link href="/privacy">
              <a className="hover:text-foreground transition-colors">Privacy Policy</a>
            </Link>
            <Link href="/tos">
              <a className="hover:text-foreground transition-colors">Terms of Service</a>
            </Link>
            <Link href="/pricing">
              <a className="hover:text-foreground transition-colors">Pricing</a>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
