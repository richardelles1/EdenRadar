import { describe, it, expect } from "vitest";
import { resolveSubjectTokens } from "../lib/resolveSubjectTokens";

describe("resolveSubjectTokens", () => {
  const makeAssets = (institutions: (string | null | undefined)[]) =>
    institutions.map((institution) => ({ institution }));

  it("replaces {count} with asset count", () => {
    const assets = makeAssets(["MIT", "Harvard", "Stanford"]);
    expect(resolveSubjectTokens("New: {count} assets", assets)).toBe(
      "New: 3 assets"
    );
  });

  it("replaces {institution_count} with unique institution count", () => {
    const assets = makeAssets(["MIT", "MIT", "Harvard"]);
    expect(resolveSubjectTokens("{institution_count} institutions", assets)).toBe(
      "2 institutions"
    );
  });

  it("replaces {date} with a non-empty date string", () => {
    const result = resolveSubjectTokens("Digest for {date}", makeAssets(["MIT"]));
    expect(result).not.toContain("{date}");
    expect(result.length).toBeGreaterThan("Digest for ".length);
  });

  it("handles null and undefined institutions without throwing", () => {
    const assets = makeAssets([null, undefined, "MIT"]);
    expect(() =>
      resolveSubjectTokens("{count} assets from {institution_count} institutions", assets)
    ).not.toThrow();
  });

  it("counts null/undefined institutions as one shared empty bucket", () => {
    // null and undefined both coalesce to "" — they count as one institution
    const assets = makeAssets([null, undefined]);
    const result = resolveSubjectTokens("{institution_count}", assets);
    expect(result).toBe("1");
  });

  it("replaces all token occurrences, not just the first", () => {
    const assets = makeAssets(["MIT"]);
    const result = resolveSubjectTokens("{count} assets ({count} total)", assets);
    expect(result).toBe("1 assets (1 total)");
  });

  it("leaves unrecognised tokens untouched", () => {
    const assets = makeAssets(["MIT"]);
    expect(resolveSubjectTokens("Hello {name}", assets)).toBe("Hello {name}");
  });

  it("returns the subject unchanged when there are no tokens", () => {
    const assets = makeAssets(["MIT"]);
    expect(resolveSubjectTokens("Weekly digest", assets)).toBe("Weekly digest");
  });
});
