import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            ignore: "pid,hostname",
            translateTime: "HH:MM:ss",
          },
        },
      }
    : {
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
          level(label) {
            return { level: label };
          },
        },
      }),
});

// In production, bridge Node's console.* to pino so any remaining console calls
// in route code emit structured JSON rather than plain text mixed into the log stream.
if (!isDev) {
  console.error = (...args: unknown[]) => {
    const first = args[0];
    if (first instanceof Error) {
      logger.error({ err: first }, args.slice(1).join(" ") || "error");
    } else {
      const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
      logger.error(msg);
    }
  };
  console.warn = (...args: unknown[]) => {
    logger.warn(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  console.log = (...args: unknown[]) => {
    logger.info(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
}
