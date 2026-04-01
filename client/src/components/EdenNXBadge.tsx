import edenNxLogo from "@assets/EdenNX_Logo_T_1774480105524.png";

export function EdenNXBadge() {
  return (
    <a
      href="https://edennx.com"
      target="_blank"
      rel="noopener noreferrer"
      data-testid="footer-edennx-badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        textDecoration: "none",
        opacity: 0.7,
      }}
      title="EdenNX: Parent Company"
    >
      <img
        src={edenNxLogo}
        onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/edennx-logo.png"; }}
        alt="EdenNX"
        style={{ height: 18, width: "auto", objectFit: "contain", display: "block" }}
      />
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.05em",
          color: "currentColor",
          whiteSpace: "nowrap",
        }}
      >
        by EdenNX
      </span>
    </a>
  );
}
