import type { ElementType, ReactNode } from "react";

export const GREEN = "#3fb950";
export const BG_DARK = "#0a0f0d";
export const GREEN_TEXT = "#2d6a45";

export function PrintRadar({ rings = [200, 340, 470, 590] }: { rings?: number[] }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }} aria-hidden>
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(72vw, 640px)", height: "min(72vw, 640px)",
        animation: "radar-bg-slow 22s linear infinite",
        transformOrigin: "center center",
        background: `conic-gradient(from 0deg, transparent 260deg, ${GREEN}0a 310deg, ${GREEN}22 360deg)`,
        borderRadius: "50%",
      }} />
      {rings.map((r, i) => (
        <div key={r} style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%, -50%)",
          width: r, height: r, borderRadius: "50%",
          border: `1px solid ${GREEN}${Math.round((0.10 - i * 0.018) * 255).toString(16).padStart(2, "0")}`,
        }} />
      ))}
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        width: 10, height: 10, borderRadius: "50%",
        background: GREEN, opacity: 0,
        animation: "pulse-ring 3s ease-out infinite",
      }} />
    </div>
  );
}

export function PrintLogo({ subtitle }: { subtitle: string }) {
  return (
    <div style={{ position: "relative", zIndex: 10, padding: "28px 40px 0" }}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>
        <span style={{ color: "#ffffff" }}>Eden</span>
        <span style={{ color: GREEN }}>Radar</span>
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {subtitle}
      </div>
    </div>
  );
}

export function CoverBottomStrip({ children }: { children: ReactNode }) {
  return (
    <div style={{
      position: "relative", zIndex: 10,
      padding: "20px 40px",
      borderTop: "1px solid rgba(255,255,255,0.07)",
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      {children}
    </div>
  );
}

export function PrintFooter({ date, right }: { date: string; right?: string }) {
  return (
    <div style={{
      marginTop: 48, paddingTop: 16,
      borderTop: "1px solid #e5e7eb",
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <span style={{ fontSize: 10, color: "#9ca3af", letterSpacing: "0.04em" }}>
        <span style={{ fontWeight: 700, color: "#374151" }}>Eden</span>
        <span style={{ fontWeight: 700, color: GREEN_TEXT }}>Radar</span>
        {" "}· Confidential · {date}
      </span>
      {right && <span style={{ fontSize: 10, color: "#9ca3af" }}>{right}</span>}
    </div>
  );
}

export function SectionHeader({ icon: Icon, title, color = GREEN_TEXT }: {
  icon: ElementType; title: string; color?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <div style={{ width: 3, height: 20, borderRadius: 2, background: color, flexShrink: 0 }} />
      <Icon style={{ width: 16, height: 16, color, flexShrink: 0 }} />
      <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111", margin: 0 }}>{title}</h2>
    </div>
  );
}

export function DarkPill({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "4px 12px", borderRadius: 6,
      background: accent ? `${GREEN}30` : "rgba(255,255,255,0.07)",
      border: `1px solid ${accent ? `${GREEN}70` : "rgba(255,255,255,0.12)"}`,
      color: accent ? GREEN : "rgba(255,255,255,0.80)",
      fontSize: 12, fontWeight: accent ? 700 : 500,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

export function LightPill({ label }: { label: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "3px 10px", borderRadius: 4,
      background: "#f3f4f6", border: "1px solid #e5e7eb",
      color: "#374151", fontSize: 12, fontWeight: 500,
    }}>
      {label}
    </span>
  );
}

export const PRINT_STYLES = `
  @media print {
    .print-cover { page-break-after: always; break-after: page; }
    .print-section { page-break-before: always; break-before: page; page-break-inside: avoid; break-inside: avoid; }
    .no-print { display: none !important; }
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      forced-color-adjust: none !important;
    }
    p, li, .print-para { break-inside: avoid; orphans: 3; widows: 3; }
    @page {
      margin: 12mm 14mm;
      size: A4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
  @keyframes radar-bg-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes pulse-ring { 0% { transform: scale(0.6) translate(-50%,-50%); opacity: 0.5; } 100% { transform: scale(1.8) translate(-50%,-50%); opacity: 0; } }
`;

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch { return iso; }
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export function parseMarkdown(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ fontWeight: 700, color: "#111" }}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export function val(v: string | null | undefined): string | null {
  if (!v || v === "unknown" || v.trim() === "") return null;
  return v;
}

export function scoreColor(score: number): { bg: string; border: string; text: string } {
  if (score >= 75) return { bg: "#dcfce7", border: "#86efac", text: "#15803d" };
  if (score >= 55) return { bg: "#fef9c3", border: "#fde68a", text: "#b45309" };
  return { bg: "#fee2e2", border: "#fca5a5", text: "#dc2626" };
}
