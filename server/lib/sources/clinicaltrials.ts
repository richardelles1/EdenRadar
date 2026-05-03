import type { RawSignal } from "../types";

const BASE = "https://clinicaltrials.gov/api/v2/studies";

function mapPhase(phase: string | undefined): string {
  if (!phase) return "unknown";
  const p = phase.toLowerCase();
  if (p.includes("phase 1") || p.includes("phase1") || p === "early_phase1") return "phase 1";
  if (p.includes("phase 2") || p.includes("phase2")) return "phase 2";
  if (p.includes("phase 3") || p.includes("phase3")) return "phase 3";
  if (p.includes("phase 4") || p.includes("phase4")) return "approved";
  return "preclinical";
}

function inferOwnerType(sponsorClass: string | undefined): "university" | "company" | "unknown" {
  if (!sponsorClass) return "unknown";
  const c = sponsorClass.toUpperCase();
  if (c === "NIH" || c === "OTHER" || c === "FED") return "university";
  if (c === "INDUSTRY") return "company";
  return "unknown";
}

export async function searchClinicalTrials(query: string, maxResults = 10): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      "query.term": query,
      pageSize: String(maxResults),
      format: "json",
      fields: [
        "NCTId",
        "BriefTitle",
        "OfficialTitle",
        "LeadSponsorName",
        "LeadSponsorClass",
        "OverallStatus",
        "Phase",
        "Condition",
        "InterventionName",
        "InterventionOtherName",
        "BriefSummary",
        "StartDate",
        "PrimaryCompletionDate",
      ].join(","),
    });

    const url = `${BASE}?${params}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`ClinicalTrials API error: ${res.status}`);
    const data = await res.json();

    const studies = data?.studies ?? [];
    return studies.map((study: any): RawSignal => {
      const p = study?.protocolSection ?? {};
      const id = p?.identificationModule ?? {};
      const sponsor = p?.sponsorCollaboratorsModule?.leadSponsor ?? {};
      const status = p?.statusModule ?? {};
      const design = p?.designModule ?? {};
      const conditions = p?.conditionsModule?.conditions ?? [];
      const interventions = p?.armsInterventionsModule?.interventions ?? [];
      const description = p?.descriptionModule ?? {};

      const nctId = id.nctId ?? "";
      const phase = Array.isArray(design.phases) ? design.phases[0] : design.phases ?? "";
      const interventionNames = interventions.map((i: any) => i.interventionName).join(", ");
      const interventionOtherNames = interventions
        .flatMap((i: any) => Array.isArray(i.interventionOtherNames) ? i.interventionOtherNames : [])
        .filter(Boolean)
        .join(", ");
      const conditionStr = conditions.join(", ");

      return {
        id: `ct-${nctId}`,
        source_type: "clinical_trial",
        title: id.briefTitle ?? id.officialTitle ?? "Untitled Trial",
        text: description.briefSummary ?? `${interventionNames} for ${conditionStr}`,
        authors_or_owner: sponsor.leadSponsorName ?? "",
        institution_or_sponsor: sponsor.leadSponsorName ?? "",
        date: status.startDateStruct?.date ?? status.primaryCompletionDateStruct?.date ?? "",
        stage_hint: mapPhase(phase),
        url: nctId ? `https://clinicaltrials.gov/study/${nctId}` : "https://clinicaltrials.gov",
        metadata: {
          nct_id: nctId,
          sponsor_class: sponsor.leadSponsorClass,
          owner_type: inferOwnerType(sponsor.leadSponsorClass),
          status: status.overallStatus,
          phase,
          conditions,
          interventions: interventionNames,
          intervention_other_name: interventionOtherNames || interventionNames || "unknown",
        },
      };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Downgrade timeouts/aborts to warn — they are caught by the orchestrator's
    // hard timeout and reported as `status: "timeout"` in sourceDiagnostics.
    if (/abort|timeout|timed out/i.test(msg)) {
      console.warn(`[search] ClinicalTrials.gov upstream slow/aborted: ${msg}`);
    } else {
      console.error("ClinicalTrials search error:", err);
    }
    return [];
  }
}
