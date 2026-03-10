import { XMLParser } from "fast-xml-parser";

export interface RawPaper {
  pmid: string;
  title: string;
  abstract: string;
  journal: string;
  year: string;
  date: string;
  url: string;
  sourceName: string;
}

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function parseFullDate(pubDateNode: any): string {
  if (!pubDateNode) return "";
  const year = String(pubDateNode.Year ?? "").trim();
  if (!year || year === "Unknown") return "";
  let month = "01";
  let day = "01";
  if (pubDateNode.Month) {
    const m = String(pubDateNode.Month).toLowerCase().trim().slice(0, 3);
    month = MONTH_MAP[m] ?? (m.match(/^\d+$/) ? m.padStart(2, "0") : "01");
  }
  if (pubDateNode.Day) {
    day = String(pubDateNode.Day).trim().padStart(2, "0");
  }
  if (pubDateNode.MedlineDate && !pubDateNode.Year) {
    const medYear = String(pubDateNode.MedlineDate).slice(0, 4);
    return `${medYear}-01-01`;
  }
  return `${year}-${month}-${day}`;
}

async function searchPMIDs(query: string, maxResults = 10): Promise<string[]> {
  const url = `${EUTILS_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PubMed search failed: ${res.status}`);
  const data = await res.json();
  return data?.esearchresult?.idlist ?? [];
}

async function fetchPaperDetails(pmids: string[]): Promise<RawPaper[]> {
  if (pmids.length === 0) return [];
  const ids = pmids.join(",");
  const url = `${EUTILS_BASE}/efetch.fcgi?db=pubmed&id=${ids}&retmode=xml`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PubMed fetch failed: ${res.status}`);
  const xml = await res.text();

  const parser = new XMLParser({ ignoreAttributes: false, isArray: (name) => name === "AbstractText" });
  const parsed = parser.parse(xml);

  const articles = parsed?.PubmedArticleSet?.PubmedArticle;
  if (!articles) return [];
  const articleArray = Array.isArray(articles) ? articles : [articles];

  return articleArray.map((article: any) => {
    const medline = article?.MedlineCitation;
    const pmid = String(medline?.PMID?.["#text"] ?? medline?.PMID ?? "");
    const articleData = medline?.Article ?? {};
    const title = articleData?.ArticleTitle?.["#text"] ?? articleData?.ArticleTitle ?? "Unknown Title";
    const abstractParts = articleData?.Abstract?.AbstractText;
    let abstract = "";
    if (Array.isArray(abstractParts)) {
      abstract = abstractParts.map((p: any) => (typeof p === "string" ? p : p?.["#text"] ?? "")).join(" ");
    } else if (typeof abstractParts === "string") {
      abstract = abstractParts;
    } else if (abstractParts?.["#text"]) {
      abstract = abstractParts["#text"];
    }
    const journal = articleData?.Journal?.Title ?? articleData?.Journal?.ISOAbbreviation ?? "Unknown Journal";
    const pubDateNode = articleData?.Journal?.JournalIssue?.PubDate;
    const year = String(pubDateNode?.Year ?? pubDateNode?.MedlineDate?.slice(0, 4) ?? "Unknown");
    const fullDate = parseFullDate(pubDateNode);

    return {
      pmid,
      title: typeof title === "object" ? JSON.stringify(title) : String(title),
      abstract: abstract || "No abstract available.",
      journal: typeof journal === "object" ? JSON.stringify(journal) : String(journal),
      year: String(year),
      date: fullDate || year,
      url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "",
      sourceName: "PubMed",
    };
  });
}

export async function searchPubMed(query: string, maxResults = 10): Promise<RawPaper[]> {
  const pmids = await searchPMIDs(query, maxResults);
  return fetchPaperDetails(pmids);
}
