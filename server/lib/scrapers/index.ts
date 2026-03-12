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
import { yaleScraper } from "./yale";
import { buScraper } from "./bu";
import { georgetownScraper } from "./georgetown";
import { gatechScraper } from "./gatech";
import { cwruScraper } from "./cwru";
import { ucoloradoScraper } from "./ucolorado";
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
  texasTechScraper,
  baylorScraper,
  unmScraper,
  usuScraper,
  auburnScraper,
  ugaScraper,
  uarkansasScraper,
  udelScraper,
  uconnScraper,
  dartmouthScraper,
  brandeisScraper,
  uriScraper,
  mcgillScraper,
  ubcScraper,
  ucalgaryScraper,
  uvicScraper,
  monashScraper,
  nusScraper,
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
} from "./new-institutions";

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
  uwashingtonScraper,
  wustlScraper,
  umichScraper,
  scrippsScraper,
  mdandersonScraper,
  upittScraper,
  uchicagoScraper,
  yaleScraper,
  buScraper,
  georgetownScraper,
  gatechScraper,
  cwruScraper,
  ucoloradoScraper,
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
  // ── Flintbox (verified working orgIds) ───────────────────────────────────
  ucfScraper,
  fiuScraper,
  riceScraper,
  texasTechScraper,
  baylorScraper,
  unmScraper,
  usuScraper,
  auburnScraper,
  ugaScraper,
  uarkansasScraper,
  udelScraper,
  uconnScraper,
  dartmouthScraper,
  brandeisScraper,
  uriScraper,
  mcgillScraper,
  ubcScraper,
  ucalgaryScraper,
  uvicScraper,
  monashScraper,
  nusScraper,
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
