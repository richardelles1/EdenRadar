import type { RawSignal } from "../types";

const BASE = "https://zenodo.org/api/records";

export async function searchZenodo(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      size: String(maxResults),
      sort: "bestmatch",
      type: "dataset,software,publication",
    });

    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`Zenodo API error: ${res.status}`);
    const data = await res.json();
    const hits: any[] = data?.hits?.hits ?? [];

    return hits.filter((h) => h.metadata?.title).map((h): RawSignal => {
      const m = h.metadata;
      const creators = (m.creators ?? []).slice(0, 4).map((c: any) => c.name ?? "").filter(Boolean).join(", ");
      const doi = h.doi ?? m.doi ?? "";
      const resourceType = m.resource_type?.type ?? "";
      const sourceType = "dataset" as const;

      return {
        id: `zenodo-${h.id || Math.random()}`,
        source_type: sourceType,
        title: m.title,
        text: m.description ? stripHtml(m.description) : "",
        authors_or_owner: creators,
        institution_or_sponsor: "",
        date: m.publication_date ?? "",
        stage_hint: "unknown",
        url: doi ? `https://doi.org/${doi}` : h.links?.html ?? "https://zenodo.org",
        metadata: {
          doi,
          resource_type: resourceType,
          zenodo_id: h.id,
          source_label: "Zenodo",
        },
      };
    });
  } catch (err) {
    console.error("Zenodo search error:", err);
    return [];
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000);
}
