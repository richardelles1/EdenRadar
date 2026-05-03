export function quoteQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed;
  if (/[":()]/.test(trimmed)) return trimmed;
  if (!/[-\s]/.test(trimmed)) return trimmed;
  return `"${trimmed.replace(/"/g, '')}"`;
}
