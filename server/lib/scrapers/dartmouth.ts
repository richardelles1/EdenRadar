import { execSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import * as os from "os";
import * as path from "path";
import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Dartmouth College";
const PDF_URL = "https://tto.dartmouth.edu/sites/tto/files/2025-06/Life-Sciences.pdf";
const TTO_HOME = "https://tto.dartmouth.edu/";

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

function parsePdfText(text: string, baseUrl: string): ScrapedListing[] {
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
        url: baseUrl,
        institution: INST,
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
          url: baseUrl,
          institution: INST,
        });
      }
    }
  }

  return results;
}

export const dartmouthScraper: InstitutionScraper = {
  institution: INST,

  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: downloading life-sciences PDF...`);
    const tmpPdf = path.join(os.tmpdir(), `dartmouth_tto_${Date.now()}.pdf`);
    const tmpTxt = tmpPdf.replace(".pdf", ".txt");

    try {
      const res = await fetch(PDF_URL, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching PDF`);

      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(tmpPdf, buf);

      const pdfToText = findPdfToText();
      if (!pdfToText) {
        console.warn(`[scraper] ${INST}: pdftotext not found, returning empty`);
        return [];
      }

      execSync(`${pdfToText} "${tmpPdf}" "${tmpTxt}" 2>/dev/null`, { timeout: 30_000 });
      const { readFileSync } = await import("fs");
      const text = readFileSync(tmpTxt, "utf8");

      const listings = parsePdfText(text, TTO_HOME);
      console.log(`[scraper] ${INST}: ${listings.length} listings from PDF`);
      return listings;
    } catch (err: any) {
      console.error(`[scraper] ${INST} PDF scraper failed: ${err?.message}`);
      return [];
    } finally {
      for (const f of [tmpPdf, tmpTxt]) {
        try { unlinkSync(f); } catch { /* ignore */ }
      }
    }
  },
};
