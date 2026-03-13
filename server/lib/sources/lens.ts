import type { RawSignal } from "../types";

const PATENT_BASE = "https://api.lens.org/patent/search";

export async function searchLens(query: string, maxResults = 12): Promise<RawSignal[]> {
  const apiKey = process.env.LENS_API_KEY;
  if (!apiKey) {
    return [];
  }

  try {
    const body = {
      query: {
        match: { query, type: "best_fields" },
      },
      size: maxResults,
      include: [
        "lens_id",
        "title",
        "abstract",
        "date_published",
        "biblio.application_reference.doc_number",
        "biblio.parties.applicants",
        "biblio.parties.inventors",
        "biblio.classifications_ipcr.symbol",
        "jurisdiction",
      ],
    };

    const res = await fetch(PATENT_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`Lens.org API error: ${res.status}`);
    const data = await res.json();
    const results: any[] = data?.data ?? [];

    return results.filter((r) => r.title).map((r): RawSignal => {
      const titleText = Array.isArray(r.title) ? r.title[0]?.text ?? "" : typeof r.title === "string" ? r.title : "";
      const abstractText = Array.isArray(r.abstract) ? r.abstract[0]?.text ?? "" : typeof r.abstract === "string" ? r.abstract : "";
      const applicants = (r.biblio?.parties?.applicants ?? []).map((a: any) => a.extracted_name?.value ?? "").filter(Boolean);
      const published = r.date_published ?? "";

      return {
        id: `lens-${r.lens_id || Math.random()}`,
        source_type: "patent",
        title: titleText,
        text: abstractText,
        authors_or_owner: applicants.join(", "),
        institution_or_sponsor: applicants[0] ?? "",
        date: published,
        stage_hint: "discovery",
        url: r.lens_id ? `https://www.lens.org/lens/patent/${r.lens_id}` : "https://www.lens.org",
        metadata: {
          lens_id: r.lens_id,
          jurisdiction: r.jurisdiction ?? "",
          source_label: "Lens.org",
        },
      };
    });
  } catch (err) {
    console.error("Lens.org search error:", err);
    return [];
  }
}
