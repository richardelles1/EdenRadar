import type { InstitutionScraper, ScrapedListing } from "./types";
import { cleanText } from "./utils";

const INST = "Mayo Clinic";
const BIOPHARMA_URL = "https://businessdevelopment.mayoclinic.org/collaborate/biopharmaceuticals/";

// Mayo Clinic — biopharmaceuticals page scraper
// Page structure (Elementor): technology titles appear as <h5><strong>Title</strong></h5>
// inside elementor-widget-text-editor widgets; the following text-editor widget(s) hold
// "Unmet need:" / "Innovation:" prose blocks. No individual detail pages exist — all
// content lives on the single biopharmaceuticals listing page.
//
// Note: The Mayo site WAF blocks the full Chrome UA from cloud IPs;
// a lightweight Mozilla compatible UA returns HTTP 200 successfully.
export const mayoScraper: InstitutionScraper = {
  institution: INST,
  async scrape(signal?: AbortSignal): Promise<ScrapedListing[]> {
    const combinedSignal = signal
      ? AbortSignal.any([AbortSignal.timeout(25000), signal])
      : AbortSignal.timeout(25000);

    let html: string;
    try {
      const res = await fetch(BIOPHARMA_URL, {
        signal: combinedSignal,
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0; +https://edenradar.com)",
          Accept: "text/html,*/*",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!res.ok) {
        console.warn(`[scraper] ${INST}: HTTP ${res.status} — skipping`);
        return [];
      }
      html = await res.text();
    } catch (err: any) {
      console.warn(`[scraper] ${INST}: fetch failed — ${err?.message}`);
      return [];
    }

    const { load } = await import("cheerio");
    const $ = load(html);

    // Collect text-editor widget contents in DOM order
    const widgets: Array<{ kind: "title" | "body"; text: string }> = [];
    $(".elementor-widget-text-editor .elementor-widget-container").each((_, el) => {
      const h5 = $(el).find("h5").text().trim();
      if (h5 && h5.length > 5) {
        widgets.push({ kind: "title", text: cleanText(h5) });
      } else {
        const body = cleanText($(el).text());
        if (body.length > 20) widgets.push({ kind: "body", text: body });
      }
    });

    const listings: ScrapedListing[] = [];

    for (let i = 0; i < widgets.length; i++) {
      if (widgets[i].kind !== "title") continue;
      const title = widgets[i].text;

      // Collect following body widgets until next title
      const bodyParts: string[] = [];
      for (let j = i + 1; j < widgets.length && widgets[j].kind === "body"; j++) {
        bodyParts.push(widgets[j].text);
      }
      const fullBody = bodyParts.join(" ");

      // Prefer "Innovation:" section for description
      const innovMatch = fullBody.match(/Innovation[:\s]+([\s\S]{20,600}?)(?:Publications:|Learn more|$)/i);
      const description = innovMatch
        ? innovMatch[1].trim().slice(0, 1000)
        : fullBody.slice(0, 400);

      listings.push({
        title,
        description,
        url: BIOPHARMA_URL,
        institution: INST,
      });
    }

    console.log(`[scraper] ${INST}: ${listings.length} listings`);
    return listings;
  },
};
