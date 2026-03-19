import type { RawSignal } from "../types";

const BASE = "https://api.lib.harvard.edu/v2/items.json";

function extractMods(mods: any): RawSignal | null {
  try {
    const titleRaw = mods.titleInfo;
    const title = Array.isArray(titleRaw)
      ? titleRaw[0]?.title ?? ""
      : (titleRaw?.title ?? "");
    if (!title) return null;

    const abstractRaw = mods.abstract;
    const abstract = Array.isArray(abstractRaw)
      ? abstractRaw.map((a: any) => (typeof a === "string" ? a : a?.["#text"] ?? "")).join(" ")
      : typeof abstractRaw === "string"
      ? abstractRaw
      : (abstractRaw?.["#text"] ?? "");

    const nameRaw: any[] = Array.isArray(mods.name) ? mods.name : mods.name ? [mods.name] : [];
    const authors = nameRaw
      .slice(0, 4)
      .map((n: any) => {
        const parts = Array.isArray(n.namePart) ? n.namePart : [n.namePart];
        return parts.map((p: any) => (typeof p === "string" ? p : p?.["#text"] ?? "")).join(" ");
      })
      .filter(Boolean)
      .join(", ");

    const originInfo = mods.originInfo ?? {};
    const dateIssued = originInfo.dateIssued;
    const date = Array.isArray(dateIssued)
      ? (dateIssued.find((d: any) => typeof d === "string") ?? (dateIssued[0]?.["#text"] ?? ""))
      : typeof dateIssued === "string"
      ? dateIssued
      : (dateIssued?.["#text"] ?? "");

    const identifiers: any[] = Array.isArray(mods.identifier) ? mods.identifier : mods.identifier ? [mods.identifier] : [];
    const doi = identifiers.find((i: any) => i?.type === "doi" || i?.["@type"] === "doi")?.["#text"] ?? "";
    const handle = identifiers.find((i: any) => i?.type === "hdl" || i?.["@type"] === "hdl")?.["#text"] ?? "";
    const url = doi
      ? `https://doi.org/${doi}`
      : handle
      ? `https://hdl.handle.net/${handle}`
      : "https://library.harvard.edu";

    const genre = mods.genre;
    const genreStr = Array.isArray(genre)
      ? genre.map((g: any) => (typeof g === "string" ? g : g?.["#text"] ?? "")).join(", ")
      : typeof genre === "string"
      ? genre
      : "";

    const typeOfResource = mods.typeOfResource ?? "";
    const sourceType = genreStr.toLowerCase().includes("thesis") || genreStr.toLowerCase().includes("dissertation")
      ? "thesis"
      : typeOfResource === "text"
      ? "publication"
      : "publication";

    return {
      id: `harvard-librarycloud-${encodeURIComponent(title.slice(0, 40))}-${date}`,
      source_type: sourceType,
      title,
      text: abstract.slice(0, 2000),
      authors_or_owner: authors || "Harvard Library",
      institution_or_sponsor: "Harvard University",
      date: String(date).slice(0, 10),
      stage_hint: "unknown",
      url,
      metadata: {
        doi,
        genre: genreStr,
        source_label: "Harvard LibraryCloud",
      },
    };
  } catch {
    return null;
  }
}

export async function searchHarvardLibraryCloud(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      limit: String(Math.min(maxResults, 50)),
      sort: "score desc",
    });

    const res = await fetch(`${BASE}?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`Harvard LibraryCloud API error: ${res.status}`);
    const data = await res.json();

    const modsRaw = data?.items?.mods;
    const modsArray: any[] = Array.isArray(modsRaw) ? modsRaw : modsRaw ? [modsRaw] : [];

    return modsArray
      .map(extractMods)
      .filter((s): s is RawSignal => s !== null)
      .slice(0, maxResults);
  } catch (err) {
    console.error("Harvard LibraryCloud search error:", err);
    return [];
  }
}
