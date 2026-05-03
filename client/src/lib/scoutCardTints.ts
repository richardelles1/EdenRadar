export type ScoutCardCategory = "tto" | "patent" | "trial" | "research";

export type ScoutCardTint = {
  containerBg: string;
  stripColor: string;
};

export const SCOUT_CARD_TINTS: Record<ScoutCardCategory, ScoutCardTint> = {
  tto: {
    containerBg: "bg-emerald-50/60 dark:bg-emerald-950/30",
    stripColor: "#10b981",
  },
  patent: {
    containerBg: "bg-amber-50/60 dark:bg-amber-950/30",
    stripColor: "#d97706",
  },
  trial: {
    containerBg: "bg-teal-50/60 dark:bg-teal-950/30",
    stripColor: "#0d9488",
  },
  research: {
    containerBg: "bg-sky-50/60 dark:bg-sky-950/30",
    stripColor: "#0ea5e9",
  },
};
