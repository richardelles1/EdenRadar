import edenNxLogo from "@assets/EdenNX_Logo_T_1774480105524.png";

export function EdenNXBadge() {
  return (
    <>
      <style>{`
        @keyframes edennx-badge-breathe {
          0%, 100% { opacity: 0.7; }
          50%       { opacity: 1; }
        }
      `}</style>
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
          animation: "edennx-badge-breathe 3s ease-in-out infinite",
        }}
        title="EdenNX — Parent Company"
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
            opacity: 0.7,
            whiteSpace: "nowrap",
          }}
        >
          by EdenNX
        </span>
      </a>
    </>
  );
}
