import type { InstitutionScraper, ScrapedListing } from "./types";
import { stanfordScraper } from "./stanford";
import { mitScraper } from "./mit";
import { harvardScraper } from "./harvard";
import { ucsfScraper } from "./ucsf";
import { jhuScraper } from "./jhu";
import { dukeScraper } from "./duke";
import { columbiaScraper } from "./columbia";
import { upennScraper } from "./upenn";
import { northwesternScraper } from "./northwestern";
import { cornellScraper } from "./cornell";
import { ucBerkeleyScraper } from "./ucberkeley";
import { ucsdScraper } from "./ucsd";
import { uwashingtonScraper } from "./uwashington";
import { cambridgeScraper as cambridgeCustomScraper } from "./cambridge";
import { uillinoisScraper as uillinoisCustomScraper } from "./uillinois";
import { purdueRFScraper } from "./purdue";
import { umnScraper } from "./umn";
import { wustlScraper } from "./wustl";
import { umichScraper } from "./umich";
import { scrippsScraper } from "./scripps";
import { mdandersonScraper } from "./mdanderson";
import { upittScraper } from "./upitt";
import { uchicagoScraper } from "./uchicago";
import { utexasScraper } from "./utexas";
import { nyuScraper } from "./nyu";
import { nihOttScraper } from "./nihott";
import { nciTtcScraper } from "./ncittc";
import { maxPlanckScraper } from "./maxplanck";
import { mskScraper } from "./msk";
import { lifeArcScraper } from "./lifearc";
import { kyotoTloScraper } from "./kyototlo";
import { yaleScraper } from "./yale";
import { buScraper } from "./bu";
import { georgetownScraper } from "./georgetown";
import { gatechScraper } from "./gatech";
import { cwruScraper } from "./cwru";
import { ucoloradoScraper } from "./ucolorado";
import { emoryScraper } from "./emory";
import { mayoScraper } from "./mayo";
import { osuScraper } from "./osu";
import {
  // TechPublisher – verified working
  princetonScraper,
  uclaScraper,
  brownScraper,
  rochesterScraper,
  tuftsScraper,
  uthealthScraper,
  coloradoStateScraper,
  virginiaTechScraper,
  usfScraper,
  wayneScraper,
  utDallasScraper,
  msStateScraper,
  utToledoScraper,
  njitScraper,
  calPolyScraper,
  sluScraper,
  ucDavisScraper,
  ucIrvineScraper,
  ucRiversideScraper,
  ucSantaBarbaraScraper,
  ucSantaCruzScraper,
  utahScraper,
  uvaScraper,
  uOregonScraper,
  gwuScraper,
  czBiohubScraper,
  muscScraper,
  southCarolinaScraper,
  lehighScraper,
  clemsonScraper,
  iowaStateScraper,
  tgenScraper,
  wsuScraper,
  arizonaScraper,
  pennStateScraper,
  rutgersScraper,
  stevensScraper,
  rpiScraper,
  stonyBrookScraper,
  cincinnatiScraper,
  buffaloScraper,
  rowanScraper,
  georgemasonScraper,
  umaineScraper,
  binghamtonScraper,
  uscScraper,
  oregonStateScraper,
  gsuScraper,
  northeasternScraper,
  uvmScraper,
  usdScraper,
  txstateScraper,
  miamiScraper,
  upstateScraper,
  sunyScraper,
  alabamaScraper,
  wyomingScraper,
  idahoScraper,
  uafScraper,
  sdstateScraper,
  olemissScraper,
  drexelScraper,
  leedsScraper,
  southamptonScraper,
  usaskScraper,
  unlvScraper,
  // FSU custom scraper
  fsuScraper,
  // Misc custom scrapers
  asuScraper,
  ndsuScraper,
  montanaStateScraper,
  mountsinaiScraper,
  indianaScraper,
  uhoustonScraper,
  undScraper,
  sfuScraper,
  warfScraper,
  // Flintbox – verified working
  ucfScraper,
  fiuScraper,
  riceScraper,
  baylorScraper,
  usuScraper,
  auburnScraper,
  ugaScraper,
  uconnScraper,
  dartmouthScraper,
  ubcScraper,
  uvicScraper,
  monashScraper,
  // in-part Playwright scrapers
  portlandStateScraper,
  notredameScraper,
  umanitobaScraper,
  manchesterScraper,
  kclScraper,
  liverpoolScraper,
  durhamInPartScraper,
  ethzurichScraper,
  helsinkiScraper,
  aaltoScraper,
  tampereScraper,
  lmuScraper,
  rwthScraper,
  tcdScraper,
  ulbScraper,
  utorontoScraper,
  westernScraper,
  queensuScraper,
  ualbertaScraper,
  griffithScraper,
  ntuScraper,
  uhawScraper,
  // Flintbox HTML fallback batch (March 2026)
  uiowaScraper,
  bidmcScraper,
  northumbriaScraper,
  cmuScraper,
  smuFlintboxScraper,
  clevelandClinicScraper,
  uabScraper,
  cercaScraper,
  kstateScraper,
  cedarsScraper,
  fauScraper,
  tulaneScraper,
  louisvilleScraper,
  lsuItcScraper,
  uhnScraper,
  lsuScraper,
  uahScraper,
  wvuScraper,
  cmhScraper,
  kcvScraper,
  strathclydeScraper,
  syracuseScraper,
  swanseaScraper,
  utsaScraper,
  ncsuScraper,
  dalhousieScraper,
  tamuScraper,
  ufScraper,
  ucMercedScraper,
  sdsuScraper,
  southernMissScraper,
  michiganStateScraper,
  denverScraper,
  kansasScraper,
  siuScraper,
  ukyScraper,
  boiseStateScraper,
  nauScraper,
  utennesseeScraper,
  ncatScraper,
  morganStateScraper,
  // Task #103 — Platform Scrapers Batch 2
  howardScraper,
  uncChapelHillScraper,
  prscienceTrustScraper,
  umassAmherstScraper,
  southAlabamaScraper,
  umbcScraper,
  bostonCollegeScraper,
  // Task #104 — Bespoke Scrapers Batch 2A
  // Task #105 — Bespoke Scrapers Batch 2B
  ohioScraper,
  umkcScraper,
  famuScraper,
  unetechScraper,
  uneMedScraper,
  umventuresScraper,
  memphisScraper,
  utrgvScraper,
  uwmrfScraper,
} from "./new-institutions";

// ── Tier 2 Investigation Results (March 2026) ─────────────────────────────────
// Institutions investigated but EXCLUDED — no public enumerable tech listing:
//
// Fred Hutchinson Cancer Center
//   Probed: fredhutch.org/en/research/innovation (404), /about/business-development (404),
//           /about/technology-transfer (404), research.fredhutch.org/tech-transfer (302→404)
//   Platform: None found (no TechPublisher, Flintbox, Wellspring, Elucid, or in-part)
//   Status: No public tech listing exists. Innovation page removed/relocated.
//   Listing estimate: 0 (no enumerable source)
//   Last verified: 2026-03-15
//
// Cold Spring Harbor Laboratory (CSHL)
//   Probed: cshl.edu/partner-with-us/technology-transfer/ (200, informational only),
//           WP REST API /wp-json/wp/v2/types (no tech-related custom post types)
//   Platform: WordPress; CPTs are press_news, library_news, archives_blog, harborscope
//   Status: Tech transfer page describes processes/contacts, no enumerable tech database
//   Listing estimate: 0
//   Last verified: 2026-03-15
//
// Dana-Farber Cancer Institute
//   Probed: innovation.dfci.harvard.edu (empty response, 0 bytes),
//           dana-farber.org/research/innovations (informational: mission/vision/contact),
//           dana-farber.org/transfer (patient transfer page, not tech transfer)
//   Platform: None found (no TechPublisher, Flintbox, Wellspring, Elucid)
//   Status: Innovation office exists but no public tech enumeration
//   Listing estimate: 0
//   Last verified: 2026-03-15
//
// Allen Institute
//   Probed: alleninstitute.org/partnerships/technology-transfer/ (404),
//           alleninstitute.org/partnerships/ (404),
//           WP REST API /wp-json/wp/v2/types (standard post types only, no tech CPTs)
//   Platform: WordPress; no tech-related custom post types
//   Status: Tech transfer page removed/relocated, no public listing
//   Listing estimate: 0
//   Last verified: 2026-03-15
//
// Sanford Burnham Prebys
//   Probed: sbpdiscovery.org/industry-partnerships (404),
//           sbpdiscovery.org/industry-partnerships/available-technologies (301→404),
//           sbpdiscovery.org/techniques-technologies-sitemap.xml (69 entries)
//   Platform: WordPress; techniques-technologies CPT exists but contains research
//             capability descriptions (3D bioprinting, biochemistry, assay development)
//             — not licensable IP/technologies available for out-licensing
//   Status: No licensable tech listing; capabilities pages are not TTO assets
//   Listing estimate: 0 (69 capability pages, 0 licensable tech)
//   Last verified: 2026-03-15
// ───────────────────────────────────────────────────────────────────────────────

export { ScrapedListing, InstitutionScraper };

export const ALL_SCRAPERS: InstitutionScraper[] = [
  // ── Custom scrapers (verified working) ────────────────────────────────────
  stanfordScraper,
  mitScraper,
  harvardScraper,
  ucsfScraper,
  jhuScraper,
  dukeScraper,
  columbiaScraper,
  upennScraper,
  northwesternScraper,
  cornellScraper,
  ucBerkeleyScraper,
  ucsdScraper,
  uwashingtonScraper,
  wustlScraper,
  umichScraper,
  scrippsScraper,
  mdandersonScraper,
  upittScraper,
  uchicagoScraper,
  utexasScraper,
  nyuScraper,
  nihOttScraper,
  nciTtcScraper,
  maxPlanckScraper,
  mskScraper,
  lifeArcScraper,
  yaleScraper,
  buScraper,
  georgetownScraper,
  gatechScraper,
  cwruScraper,
  ucoloradoScraper,
  emoryScraper,
  mayoScraper,
  osuScraper,
  purdueRFScraper,
  umnScraper,
  uillinoisCustomScraper,
  cambridgeCustomScraper,
  fsuScraper,
  // ── TechPublisher (verified working slugs) ────────────────────────────────
  princetonScraper,
  uclaScraper,
  brownScraper,
  rochesterScraper,
  tuftsScraper,
  uthealthScraper,
  coloradoStateScraper,
  virginiaTechScraper,
  usfScraper,
  wayneScraper,
  utDallasScraper,
  msStateScraper,
  utToledoScraper,
  njitScraper,
  calPolyScraper,
  sluScraper,
  ucDavisScraper,
  ucIrvineScraper,
  ucRiversideScraper,
  ucSantaBarbaraScraper,
  ucSantaCruzScraper,
  utahScraper,
  uvaScraper,
  uOregonScraper,
  gwuScraper,
  czBiohubScraper,
  muscScraper,
  southCarolinaScraper,
  lehighScraper,
  clemsonScraper,
  iowaStateScraper,
  tgenScraper,
  wsuScraper,
  arizonaScraper,
  pennStateScraper,
  rutgersScraper,
  stevensScraper,
  rpiScraper,
  stonyBrookScraper,
  cincinnatiScraper,
  buffaloScraper,
  rowanScraper,
  georgemasonScraper,
  umaineScraper,
  binghamtonScraper,
  uscScraper,
  oregonStateScraper,
  gsuScraper,
  northeasternScraper,
  uvmScraper,
  usdScraper,
  txstateScraper,
  miamiScraper,
  upstateScraper,
  sunyScraper,
  alabamaScraper,
  wyomingScraper,
  idahoScraper,
  uafScraper,
  sdstateScraper,
  olemissScraper,
  drexelScraper,
  leedsScraper,
  southamptonScraper,
  usaskScraper,
  unlvScraper,
  // ── Misc custom scrapers (real scraping logic) ────────────────────────────
  asuScraper,
  ndsuScraper,
  montanaStateScraper,
  mountsinaiScraper,
  indianaScraper,
  uhoustonScraper,
  undScraper,
  sfuScraper,
  warfScraper,
  // ── Flintbox / in-part (verified working) ─────────────────────────────────
  ucfScraper,
  fiuScraper,
  riceScraper,
  baylorScraper,
  usuScraper,
  auburnScraper,
  ugaScraper,
  uconnScraper,
  dartmouthScraper,
  ubcScraper,
  uvicScraper,
  monashScraper,
  // ── in-part Playwright scrapers ───────────────────────────────────────────
  portlandStateScraper,
  notredameScraper,
  umanitobaScraper,
  manchesterScraper,
  kclScraper,
  liverpoolScraper,
  durhamInPartScraper,
  ethzurichScraper,
  helsinkiScraper,
  aaltoScraper,
  tampereScraper,
  lmuScraper,
  rwthScraper,
  tcdScraper,
  ulbScraper,
  utorontoScraper,
  westernScraper,
  queensuScraper,
  ualbertaScraper,
  griffithScraper,
  ntuScraper,
  uhawScraper,
  // ── Flintbox HTML fallback batch (March 2026) ───────────────────────────
  tamuScraper,
  uiowaScraper,
  bidmcScraper,
  northumbriaScraper,
  cmuScraper,
  kyotoTloScraper,
  smuFlintboxScraper,
  clevelandClinicScraper,
  uabScraper,
  cercaScraper,
  kstateScraper,
  cedarsScraper,
  fauScraper,
  tulaneScraper,
  louisvilleScraper,
  lsuItcScraper,
  uhnScraper,
  lsuScraper,
  uahScraper,
  wvuScraper,
  cmhScraper,
  kcvScraper,
  strathclydeScraper,
  syracuseScraper,
  swanseaScraper,
  utsaScraper,
  ncsuScraper,
  dalhousieScraper,
  ufScraper,
  // ── New platform-based scrapers (Task #100, March 2026) ───────────────────
  ucMercedScraper,
  sdsuScraper,
  southernMissScraper,
  michiganStateScraper,
  denverScraper,
  kansasScraper,
  siuScraper,
  ukyScraper,
  // ── Bespoke HTML scrapers (Task #101, March 2026) ─────────────────────────
  boiseStateScraper,
  nauScraper,
  utennesseeScraper,
  ncatScraper,
  morganStateScraper,
  // ── Platform scrapers batch 2 (Task #103, March 2026) ─────────────────────
  howardScraper,
  uncChapelHillScraper,
  prscienceTrustScraper,
  umassAmherstScraper,
  southAlabamaScraper,
  umbcScraper,
  bostonCollegeScraper,
  // ── Bespoke scrapers batch 2A (Task #104) + 2B (Task #105, March 2026) ────
  ohioScraper,
  umkcScraper,
  famuScraper,
  unetechScraper,
  uneMedScraper,
  umventuresScraper,
  memphisScraper,
  utrgvScraper,
  uwmrfScraper,
];

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onTaskDone?: (taskIndex: number, result: T, doneCount: number, totalCount: number) => void
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;
  let doneCount = 0;

  async function worker() {
    while (index < tasks.length) {
      const taskIndex = index++;
      try {
        results[taskIndex] = await tasks[taskIndex]();
      } catch (err: any) {
        console.error(`[scrapers] Task ${taskIndex} threw unexpectedly: ${err?.message}`);
        results[taskIndex] = [] as any;
      }
      doneCount++;
      onTaskDone?.(taskIndex, results[taskIndex], doneCount, tasks.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

export async function runAllScrapers(
  onProgress?: (done: number, total: number, listingsFound: number, active: string[]) => void
): Promise<ScrapedListing[]> {
  console.log(`[scrapers] Starting scrape for ${ALL_SCRAPERS.length} institutions...`);

  const totalCount = ALL_SCRAPERS.length;
  let listingsFound = 0;
  let doneCount = 0;
  const activeInstitutions = new Set<string>();

  const emitProgress = () => {
    onProgress?.(doneCount, totalCount, listingsFound, [...activeInstitutions]);
  };

  emitProgress();

  const SCRAPER_TIMEOUT_MS = 5 * 60 * 1000;

  const tasks = ALL_SCRAPERS.map((scraper) => async () => {
    activeInstitutions.add(scraper.institution);
    emitProgress();
    try {
      const result = await Promise.race([
        scraper.scrape(),
        new Promise<ScrapedListing[]>((_, reject) =>
          setTimeout(() => reject(new Error(`scraper timeout`)), SCRAPER_TIMEOUT_MS)
        ),
      ]);
      return result;
    } catch (err: any) {
      console.warn(`[scrapers] ${scraper.institution} failed: ${err?.message}`);
      return [] as ScrapedListing[];
    } finally {
      activeInstitutions.delete(scraper.institution);
    }
  });

  const results = await runWithConcurrency(tasks, 5, (_taskIndex, result, done, total) => {
    doneCount = done;
    listingsFound += (result as ScrapedListing[]).length;
    emitProgress();
  });

  const allListings = results.flat();
  console.log(`[scrapers] Total listings scraped: ${allListings.length}`);
  return allListings;
}
