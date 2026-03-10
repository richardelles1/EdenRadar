import type { RawSignal } from "../../types";
import { getStanfordListings } from "./stanford";
import { getMitListings } from "./mit";
import { getOxfordListings } from "./oxford";
import { getUcsfListings } from "./ucsf";
import { getBroadListings } from "./broad";
import { getJohnsHopkinsListings } from "./johnshopkins";
import { getHarvardListings } from "./harvard";
import { getEmoryListings } from "./emory";
import { getWarfListings } from "./warf";
import { getColumbiaListings } from "./columbia";
import { getPennListings } from "./penn";
import { getDukeListings } from "./duke";
import { getNorthwesternListings } from "./northwestern";
import { getUcsdListings } from "./ucsd";
import { getVanderbiltListings } from "./vanderbilt";
import { getUtSouthwesternListings } from "./ut_southwestern";
import { getWeillCornellListings } from "./weill_cornell";
import { getBaylorListings } from "./baylor";
import { getUcBerkeleyListings } from "./ucberkeley";
import { getUwListings } from "./uw";
import { getWashuListings } from "./washu";
import { getUmichListings } from "./umich";
import { getMayoListings } from "./mayo";
import { getScrippsListings } from "./scripps";
import { getSalkListings } from "./salk";
import { getMdAndersonListings } from "./mdanderson";
import { getUpittListings } from "./upitt";
import { getUchicagoListings } from "./uchicago";

export interface TechTransferAdapter {
  institution: string;
  getListings(): RawSignal[];
}

const adapters: TechTransferAdapter[] = [
  { institution: "Stanford University", getListings: getStanfordListings },
  { institution: "MIT", getListings: getMitListings },
  { institution: "University of Oxford", getListings: getOxfordListings },
  { institution: "UCSF", getListings: getUcsfListings },
  { institution: "Broad Institute", getListings: getBroadListings },
  { institution: "Johns Hopkins University", getListings: getJohnsHopkinsListings },
  { institution: "Harvard University", getListings: getHarvardListings },
  { institution: "Emory University", getListings: getEmoryListings },
  { institution: "Wisconsin Alumni Research Foundation (WARF)", getListings: getWarfListings },
  { institution: "Columbia University", getListings: getColumbiaListings },
  { institution: "University of Pennsylvania", getListings: getPennListings },
  { institution: "Duke University", getListings: getDukeListings },
  { institution: "Northwestern University", getListings: getNorthwesternListings },
  { institution: "UC San Diego", getListings: getUcsdListings },
  { institution: "Vanderbilt University", getListings: getVanderbiltListings },
  { institution: "UT Southwestern Medical Center", getListings: getUtSouthwesternListings },
  { institution: "Weill Cornell Medicine", getListings: getWeillCornellListings },
  { institution: "Baylor College of Medicine", getListings: getBaylorListings },
  { institution: "UC Berkeley", getListings: getUcBerkeleyListings },
  { institution: "University of Washington", getListings: getUwListings },
  { institution: "Washington University in St. Louis", getListings: getWashuListings },
  { institution: "University of Michigan", getListings: getUmichListings },
  { institution: "Mayo Clinic", getListings: getMayoListings },
  { institution: "Scripps Research", getListings: getScrippsListings },
  { institution: "Salk Institute for Biological Studies", getListings: getSalkListings },
  { institution: "MD Anderson Cancer Center", getListings: getMdAndersonListings },
  { institution: "University of Pittsburgh", getListings: getUpittListings },
  { institution: "University of Chicago", getListings: getUchicagoListings },
];

function matchesQuery(signal: RawSignal, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const haystack = `${signal.title} ${signal.text}`.toLowerCase();
  return terms.some((t) => haystack.includes(t));
}

export async function searchTechTransfer(query: string, maxResults = 10): Promise<RawSignal[]> {
  const allListings = adapters.flatMap((a) => a.getListings());
  const matched = allListings.filter((s) => matchesQuery(s, query));

  if (matched.length === 0) {
    return allListings.slice(0, Math.min(5, maxResults));
  }

  return matched.slice(0, maxResults);
}
