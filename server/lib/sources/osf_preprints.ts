import type { RawSignal } from "../types";

const BASE = "https://api.osf.io/v2/preprints/";

type OsfProvider = {
  key: string;
  providerId: string;
  label: string;
};

const PROVIDERS: OsfProvider[] = [
  { key: "chemrxiv", providerId: "chemrxiv", label: "ChemRxiv" },
  { key: "socarxiv", providerId: "socarxiv", label: "SocArXiv" },
  { key: "psyarxiv", providerId: "psyarxiv", label: "PsyArXiv" },
  { key: "eartharxiv", providerId: "eartharxiv", label: "EarthArXiv" },
  { key: "engrxiv", providerId: "engrxiv", label: "engrXiv" },
];

function getProviderForKey(key: string): OsfProvider | undefined {
  return PROVIDERS.find((p) => p.key === key);
}

async function searchOsfProvider(
  providerId: string,
  label: string,
  query: string,
  maxResults: number
): Promise<RawSignal[]> {
  const params = new URLSearchParams({
    "filter[title,description]": query,
    "page[size]": String(Math.min(maxResults, 25)),
  });

  const res = await fetch(`${BASE}?filter[provider]=${providerId}&${params}`, {
    headers: { Accept: "application/vnd.api+json" },
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) throw new Error(`OSF/${label} API error: ${res.status}`);
  const data = await res.json();
  const items: any[] = data?.data ?? [];

  return items.filter((item) => item.attributes?.title).map((item): RawSignal => {
    const attr = item.attributes;
    const doi = attr.doi ?? "";
    const url = doi ? `https://doi.org/${doi}` : attr.preprint_doi_created
      ? `https://doi.org/${attr.preprint_doi_created}`
      : item.links?.html ?? "https://osf.io";

    return {
      id: `osf-${providerId}-${item.id ?? Math.random()}`,
      source_type: "preprint",
      title: attr.title,
      text: (attr.description ?? "").slice(0, 1500),
      authors_or_owner: "",
      institution_or_sponsor: "",
      date: attr.date_published?.slice(0, 10) ?? attr.date_created?.slice(0, 10) ?? "",
      stage_hint: "preclinical",
      url,
      metadata: {
        doi,
        provider: label,
        source_label: label,
      },
    };
  });
}

export function createOsfSearchFn(sourceKey: string) {
  const provider = getProviderForKey(sourceKey);
  if (!provider) throw new Error(`Unknown OSF provider: ${sourceKey}`);

  return async function (query: string, maxResults = 12): Promise<RawSignal[]> {
    try {
      return await searchOsfProvider(provider.providerId, provider.label, query, maxResults);
    } catch (err) {
      console.error(`${provider.label} search error:`, err);
      return [];
    }
  };
}

export const OSF_SOURCE_KEYS = PROVIDERS.map((p) => p.key);
export const OSF_PROVIDERS = PROVIDERS;
