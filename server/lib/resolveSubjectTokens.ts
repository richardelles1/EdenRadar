export function resolveSubjectTokens(
  subject: string,
  assets: Array<{ institution?: string | null }>
): string {
  const count = assets.length;
  const institutionCount = new Set(assets.map((a) => a.institution ?? "")).size;
  const date = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return subject
    .replace(/\{count\}/g, String(count))
    .replace(/\{institution_count\}/g, String(institutionCount))
    .replace(/\{date\}/g, date);
}
