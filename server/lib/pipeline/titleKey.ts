const STOP = new Set([
  'a','an','the','for','in','of','and','or','to','with','by','from','on','at','as',
  'is','its','are','was','were','be','been','have','has','do','does','via','new',
  'novel','using','based','type','study','role','effect','effects','clinical',
]);

/**
 * Normalise an asset title into a canonical sort-key for cross-institution
 * dedup.  Two titles that produce the same key are treated as the same
 * technology regardless of institution.
 *
 * Algorithm: lowercase → strip non-alphanumeric → tokenise → drop stop-words
 * and 1-char tokens → sort tokens alphabetically → join with spaces.
 *
 * Example:
 *   "Enzyme Replacement Therapy in Niemann-Pick Disease"
 *   → "disease enzyme niemann pick replacement therapy"
 */
export function computeTitleKey(title: string): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .sort()
    .join(" ")
    .trim();
}
