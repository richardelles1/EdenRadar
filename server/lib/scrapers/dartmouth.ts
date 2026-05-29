/**
 * Dartmouth College — Technology Transfer Office
 *
 * Platform: Drupal (tto.dartmouth.edu)
 * Source: /industry-entrepreneurs/available-technologies
 *   → links to multiple PDFs (Life-Sciences, Physical-Sciences) with date-based paths
 *
 * Strategy:
 *   1. Scrape the listing page to discover current PDF URLs (avoids hardcoded date paths)
 *   2. Download each PDF and extract text with pdftotext (Replit Nix environment)
 *   3. Use TTO_HOME#techId as sourceUrl so each listing gets a unique URL for ingest dedup
 *
 * Verified accessible 2026-05-23.
 */

import { execSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import * as os from "os";
import * as path from "path";
import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml } from "./utils";

const INST = "Dartmouth College";
const BASE = "https://tto.dartmouth.edu";
const LISTING_PAGE = `${BASE}/industry-entrepreneurs/available-technologies`;
const TTO_HOME = `${BASE}/`;

function findPdfToText(): string | null {
  for (const candidate of ["pdftotext", "/nix/store/bmirb5k0vksybajy1wrfgq9ckgs37q0c-replit-runtime-path/bin/pdftotext"]) {
    try {
      execSync(`which ${candidate}`, { stdio: "ignore" });
      return candidate;
    } catch {
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

async function discoverPdfUrls(): Promise<string[]> {
  const $ = await fetchHtml(LISTING_PAGE, 15_000, undefined, 2);
  if (!$) return [];
  const urls: string[] = [];
  $("a[href$='.pdf']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (!href.endsWith(".pdf")) return;
    const full = href.startsWith("http") ? href : `${BASE}${href}`;
    if (!urls.includes(full)) urls.push(full);
  });
  return urls;
}

function parsePdfText(text: string): ScrapedListing[] {
  const results: ScrapedListing[] = [];
  const seen = new Set<string>();
  const lines = text.split("\n").map((l) => l.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idMatch = line.match(/^(\d{4}-\d{4})\s+(.+)/);
    if (idMatch) {
      const techId = idMatch[1];
      let title = idMatch[2].trim();
      if (title.length < 8 && i + 1 < lines.length) {
        title = lines[i + 1].trim();
      }
      title = title.replace(/EXTENSIVE IP PORTFOLIO.*|AVAILABLE FOR REVIEW.*/gi, "").trim();
      if (!title || title.length < 5 || seen.has(techId)) continue;
      seen.add(techId);
      results.push({
        title,
        description: "",
        url: `${TTO_HOME}#${techId}`,
        institution: INST,
        technologyId: techId,
      });
    } else {
      const bareIdMatch = line.match(/^(\d{4}-\d{4})$/);
      if (bareIdMatch) {
        const techId = bareIdMatch[1];
        if (seen.has(techId)) continue;
        let title = "";
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const candidate = lines[j].replace(/EXTENSIVE IP PORTFOLIO.*|AVAILABLE FOR REVIEW.*/gi, "").trim();
          if (candidate.length > 8 && !/^(PRINCIPAL|INVENTION|DESCRIPTION|ADVANTAGES|CONTACT)/i.test(candidate)) {
            title = candidate;
            break;
          }
        }
        if (!title || title.length < 5) continue;
        seen.add(techId);
        results.push({
          title,
          description: "",
          url: `${TTO_HOME}#${techId}`,
          institution: INST,
          technologyId: techId,
        });
      }
    }
  }

  return results;
}

async function parsePdf(pdfUrl: string, pdfToText: string): Promise<ScrapedListing[]> {
  const tmpPdf = path.join(os.tmpdir(), `dartmouth_tto_${Date.now()}.pdf`);
  const tmpTxt = tmpPdf.replace(".pdf", ".txt");
  try {
    const res = await fetch(pdfUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(tmpPdf, Buffer.from(await res.arrayBuffer()));
    execSync(`${pdfToText} "${tmpPdf}" "${tmpTxt}" 2>/dev/null`, { timeout: 30_000 });
    const { readFileSync } = await import("fs");
    return parsePdfText(readFileSync(tmpTxt, "utf8"));
  } finally {
    for (const f of [tmpPdf, tmpTxt]) {
      try { unlinkSync(f); } catch { /* ignore */ }
    }
  }
}

export const dartmouthScraper: InstitutionScraper = {
  institution: INST,
  scraperType: "manual",

  async scrape(): Promise<ScrapedListing[]> {
    const pdfToText = findPdfToText();
    if (!pdfToText) {
      console.warn(`[scraper] ${INST}: pdftotext not found — skipping`);
      return [];
    }

    console.log(`[scraper] ${INST}: discovering PDF URLs...`);
    const pdfUrls = await discoverPdfUrls();
    if (pdfUrls.length === 0) {
      console.error(`[scraper] ${INST}: no PDF links found on listing page`);
      return [];
    }
    console.log(`[scraper] ${INST}: found ${pdfUrls.length} PDF(s)`);

    const all: ScrapedListing[] = [];
    const seenIds = new Set<string>();

    for (const url of pdfUrls) {
      try {
        console.log(`[scraper] ${INST}: parsing ${url.split("/").pop()}...`);
        const listings = await parsePdf(url, pdfToText);
        for (const l of listings) {
          if (l.technologyId && !seenIds.has(l.technologyId)) {
            seenIds.add(l.technologyId);
            all.push(l);
          }
        }
      } catch (err: any) {
        console.error(`[scraper] ${INST}: failed to parse ${url}: ${err?.message}`);
      }
    }

    console.log(`[scraper] ${INST}: ${all.length} total listings`);
    return all;
  },
};
