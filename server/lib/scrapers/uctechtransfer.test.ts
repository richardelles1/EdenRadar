import { describe, it, expect } from "vitest";
import { normalizeUCUrl } from "./uctechtransfer";

const BASE = "https://techtransfer.universityofcalifornia.edu";

describe("normalizeUCUrl", () => {
  it("converts old query-param format to canonical .html URL", () => {
    expect(normalizeUCUrl(`${BASE}/NCD/Detail?NCDId=12345`))
      .toBe(`${BASE}/NCD/12345.html`);
  });

  it("is a no-op for the current .html format", () => {
    expect(normalizeUCUrl(`${BASE}/NCD/12345.html`))
      .toBe(`${BASE}/NCD/12345.html`);
  });

  it("handles uppercase NCDId parameter", () => {
    expect(normalizeUCUrl(`${BASE}/NCD/Detail?NCDID=99999`))
      .toBe(`${BASE}/NCD/99999.html`);
  });

  it("handles NCDId mixed with other query params", () => {
    expect(normalizeUCUrl(`${BASE}/NCD/Detail?campus=B&NCDId=42`))
      .toBe(`${BASE}/NCD/42.html`);
  });

  it("returns URL unchanged when no NCDId is present", () => {
    const url = `${BASE}/Default?RunSearch=true&campus=B`;
    expect(normalizeUCUrl(url)).toBe(url);
  });

  it("returns empty string unchanged", () => {
    expect(normalizeUCUrl("")).toBe("");
  });

  it("produces the same output for both URL formats for the same NCD ID", () => {
    const oldFormat = `${BASE}/NCD/Detail?NCDId=55555`;
    const newFormat = `${BASE}/NCD/55555.html`;
    expect(normalizeUCUrl(oldFormat)).toBe(normalizeUCUrl(newFormat));
  });
});
