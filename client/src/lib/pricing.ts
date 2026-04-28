export const PLAN_PRICES = {
  individual: 1999,
  team5: 8999,
  team10: 16999,
} as const;

export function formatPrice(usd: number): string {
  return `$${usd.toLocaleString("en-US")}`;
}
