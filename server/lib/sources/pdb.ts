import type { RawSignal } from "../types";

const BASE = "https://search.rcsb.org/rcsbsearch/v2/query";
const ENTRY_BASE = "https://data.rcsb.org/rest/v1/core/entry";

export async function searchPdb(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const body = {
      query: {
        type: "terminal",
        service: "full_text",
        parameters: { value: query },
      },
      return_type: "entry",
      request_options: {
        paginate: { start: 0, rows: maxResults },
        scoring_strategy: "combined",
        sort: [{ sort_by: "score", direction: "desc" }],
      },
    };

    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`PDB search error: ${res.status}`);
    const data = await res.json();
    const results: any[] = data?.result_set ?? [];

    if (results.length === 0) return [];

    const entryIds = results.map((r) => r.identifier).filter(Boolean).slice(0, maxResults);
    const entries = await fetchPdbEntries(entryIds);

    return entries;
  } catch (err) {
    console.error("PDB search error:", err);
    return [];
  }
}

async function fetchPdbEntries(ids: string[]): Promise<RawSignal[]> {
  const signals: RawSignal[] = [];

  const batchSize = 5;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const fetches = batch.map(async (id) => {
      try {
        const res = await fetch(`${ENTRY_BASE}/${id}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return { id, data };
      } catch {
        return null;
      }
    });

    const results = await Promise.all(fetches);
    for (const r of results) {
      if (!r) continue;
      const { id, data: entry } = r;
      const title = entry.struct?.title ?? `PDB ${id}`;
      const authors = (entry.audit_author ?? []).map((a: any) => a.name ?? "").filter(Boolean).join(", ");
      const depositDate = entry.rcsb_accession_info?.deposit_date ?? "";
      const description = entry.struct?.pdbx_descriptor ?? "";

      signals.push({
        id: `pdb-${id}`,
        source_type: "dataset",
        title,
        text: description || title,
        authors_or_owner: authors,
        institution_or_sponsor: "",
        date: depositDate ? depositDate.slice(0, 10) : "",
        stage_hint: "unknown",
        url: `https://www.rcsb.org/structure/${id}`,
        metadata: {
          pdb_id: id,
          resolution: entry.rcsb_entry_info?.resolution_combined?.[0] ?? null,
          method: entry.exptl?.[0]?.method ?? "",
          source_label: "PDB",
        },
      });
    }
  }

  return signals;
}
