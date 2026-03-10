import type { RawSignal } from "../types";

const NIH_REPORTER_BASE = "https://api.reporter.nih.gov/v2/projects/search";

function toRawSignal(project: any): RawSignal {
  const piNames: string[] = (project.principal_investigators ?? []).map(
    (pi: any) => `${pi.first_name ?? ""} ${pi.last_name ?? ""}`.trim()
  ).filter(Boolean);
  const orgName: string = project.organization?.org_name ?? "";
  const nctId = project.project_num ?? "";
  const fiscalYear: string = String(project.fiscal_year ?? "");
  const startDate: string = project.project_start_date
    ? project.project_start_date.split("T")[0]
    : fiscalYear ? `${fiscalYear}-01-01` : "";
  const awardAmount: number = project.award_amount ?? 0;
  const abstractText: string = project.abstract_text ?? project.project_title ?? "";

  return {
    id: `nih-${nctId || Math.random()}`,
    source_type: "paper",
    title: project.project_title ?? "Untitled NIH Project",
    text: abstractText,
    authors_or_owner: piNames.join(", "),
    institution_or_sponsor: orgName,
    date: startDate,
    stage_hint: "preclinical",
    url: nctId
      ? `https://reporter.nih.gov/project-details/${nctId}`
      : "https://reporter.nih.gov",
    metadata: {
      project_num: nctId,
      fiscal_year: fiscalYear,
      award_amount: awardAmount,
      org_name: orgName,
      activity_code: project.activity_code ?? "",
      source_label: "NIH Reporter",
    },
  };
}

export async function searchNihReporter(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const body = {
      criteria: {
        advanced_text_search: {
          operator: "and",
          search_field: "all",
          search_text: query,
        },
        fiscal_years: [2023, 2024, 2025],
      },
      offset: 0,
      limit: maxResults,
      sort_field: "project_start_date",
      sort_order: "desc",
      include_fields: [
        "ProjectNum",
        "ProjectTitle",
        "AbstractText",
        "PrincipalInvestigators",
        "Organization",
        "FiscalYear",
        "ProjectStartDate",
        "AwardAmount",
        "ActivityCode",
      ],
    };

    const res = await fetch(NIH_REPORTER_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`NIH Reporter API error: ${res.status}`);
    const data = await res.json();
    const results: any[] = data?.results ?? [];
    return results.filter((r) => r.abstract_text || r.project_title).map(toRawSignal);
  } catch (err) {
    console.error("NIH Reporter search error:", err);
    return [];
  }
}
