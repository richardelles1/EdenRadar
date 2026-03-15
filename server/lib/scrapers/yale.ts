import * as cheerio from "cheerio";
import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Yale University";
const BASE_URL = "https://ventures.yale.edu";
const LIST_URL = `${BASE_URL}/yale-technologies`;

function slugToTitle(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function getNodeIdsFromPage(page: number): Promise<number[]> {
  const url = page === 0 ? LIST_URL : `${LIST_URL}?page=${page}`;
  const html = await fetchPage(url);
  const $ = cheerio.load(html);
  const ids: number[] = [];
  $("[data-history-node-id]").each((_, el) => {
    const id = parseInt($(el).attr("data-history-node-id") || "", 10);
    if (!isNaN(id) && id > 0) ids.push(id);
  });
  return ids;
}

async function getTotalPages(html: string): Promise<number> {
  const $ = cheerio.load(html);
  let maxPage = 0;
  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (href.includes("yale-technologies")) {
      const m = href.match(/[?&]page=(\d+)/);
      if (m) maxPage = Math.max(maxPage, parseInt(m[1], 10));
    }
  });
  return maxPage;
}

async function resolveNodeUrl(nodeId: number): Promise<{ url: string; title: string; description: string } | null> {
  try {
    const nodeUrl = `${BASE_URL}/node/${nodeId}`;
    const res = await fetch(nodeUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)",
        Accept: "text/html",
      },
    });
    if (!res.ok) return null;
    const finalUrl = res.url;
    const html = await res.text();
    const $ = cheerio.load(html);

    let title = $("title").text().replace(/\s*\|.*$/, "").trim();
    if (!title || title.toLowerCase().includes("available technologies") || title.toLowerCase().includes("redirecting")) {
      const slug = finalUrl.split("/").pop() || "";
      title = slugToTitle(slug);
    }
    if (!title) return null;

    const description = $(".field--body p")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join(" ");

    return { url: finalUrl || nodeUrl, title, description };
  } catch {
    return null;
  }
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;
  const worker = async () => {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

export const yaleScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching yale-technologies listing pages...`);
    try {
      const html0 = await fetchPage(LIST_URL);
      const $ = cheerio.load(html0);
      const nodeIds0: number[] = [];
      $("[data-history-node-id]").each((_, el) => {
        const id = parseInt($(el).attr("data-history-node-id") || "", 10);
        if (!isNaN(id) && id > 0) nodeIds0.push(id);
      });

      const totalPages = await getTotalPages(html0);
      console.log(`[scraper] ${INST}: found ${totalPages + 1} pages, ${nodeIds0.length} nodes on page 0`);

      const additionalPageIds: number[][] = [];
      if (totalPages > 0) {
        const pageTasks = Array.from({ length: totalPages }, (_, i) => () => getNodeIdsFromPage(i + 1));
        const pageResults = await runWithConcurrency(pageTasks, 3);
        additionalPageIds.push(...pageResults);
      }

      const allNodeIds = Array.from(new Set([...nodeIds0, ...additionalPageIds.flat()]));
      console.log(`[scraper] ${INST}: total unique node IDs: ${allNodeIds.length}`);

      const resolvedTasks = allNodeIds.map((id) => () => resolveNodeUrl(id));
      const resolvedResults = await runWithConcurrency(resolvedTasks, 3);

      const listings: ScrapedListing[] = resolvedResults
        .filter((r): r is { url: string; title: string; description: string } => r !== null)
        .map(({ url, title, description }) => ({
          title,
          description,
          url,
          institution: INST,
        }));

      console.log(`[scraper] ${INST}: scraped ${listings.length} listings`);
      return listings;
    } catch (err: any) {
      console.error(`[scraper] ${INST}: error — ${err.message}`);
      return [];
    }
  },
};
