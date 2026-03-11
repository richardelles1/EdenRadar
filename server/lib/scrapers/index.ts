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
import { purdueRFScraper } from "./purdue";
import { umnScraper } from "./umn";
import { wustlScraper } from "./wustl";
import { umichScraper } from "./umich";
import { mayoScraper } from "./mayo";
import { scrippsScraper } from "./scripps";
import { salkScraper } from "./salk";
import { mdandersonScraper } from "./mdanderson";
import { upittScraper } from "./upitt";
import { uchicagoScraper } from "./uchicago";
import { yaleScraper } from "./yale";
import { vanderbiltScraper } from "./vanderbilt";
import { emoryScraper } from "./emory";
import { buScraper } from "./bu";
import { georgetownScraper } from "./georgetown";
import { gatechScraper } from "./gatech";
import { utexasScraper } from "./utexas";
import { cwruScraper } from "./cwru";
import { ucoloradoScraper } from "./ucolorado";
import {
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
  // New US
  fsuScraper,
  ucfScraper,
  fiuScraper,
  tamuScraper,
  riceScraper,
  uhoustonScraper,
  texasTechScraper,
  untScraper,
  baylorScraper,
  portlandStateScraper,
  umontanaScraper,
  montanaStateScraper,
  unmScraper,
  nmsuScraper,
  unrScraper,
  unlvScraper,
  usuScraper,
  byuScraper,
  uafScraper,
  uaaScraper,
  undScraper,
  ndsuScraper,
  sdstateScraper,
  indianaScraper,
  notredameScraper,
  warfScraper,
  auburnScraper,
  ugaScraper,
  uarkansasScraper,
  uamsScraper,
  olemissScraper,
  udelScraper,
  templeScraper,
  drexelScraper,
  bucknellScraper,
  sunyalbanyScraper,
  uconnScraper,
  dartmouthScraper,
  brandeisScraper,
  unhScraper,
  uriScraper,
  mountsinaiScraper,
  caltechScraper,
  asuScraper,
  uillinoisScraper,
  // International – UK
  oxfordScraper,
  cambridgeScraper,
  imperialScraper,
  uclScraper,
  manchesterScraper,
  edinburghScraper,
  bristolScraper,
  glasgowScraper,
  birminghamScraper,
  nottinghamScraper,
  leedsScraper,
  sheffieldScraper,
  southamptonScraper,
  warwickScraper,
  kclScraper,
  // International – Switzerland
  ethzurichScraper,
  epflScraper,
  ubaselScraper,
  ulausanneScraper,
  ugenevaScaper,
  uzurichScraper,
  // International – Benelux
  kuleuvenScraper,
  ugentScraper,
  groningenScraper,
  uamsterdamScraper,
  vuamsterdamScraper,
  leidenScraper,
  // International – Nordic
  karolinskaScaper,
  inven2Scraper,
  visScraper,
  ntnuScraper,
  ucphScraper,
  aarhusScraper,
  dtuScraper,
  lundScraper,
  chalmersScraper,
  gothenburgScraper,
  helsinkiScraper,
  aaltoScraper,
  // International – Germany
  tumScraper,
  lmuScraper,
  rwthScraper,
  ufreiburgScraper,
  ubonnScraper,
  ucologneScraper,
  utubingenScraper,
  heidelbergScraper,
  // International – Israel
  weizmannScraper,
  technionScraper,
  // International – Canada
  utorontoScraper,
  mcgillScraper,
  ubcScraper,
  ucalgaryScraper,
  usaskScraper,
  umanitobaScraper,
  uvicScraper,
  sfuScraper,
  // International – Asia-Pacific
  umelbourneScraper,
  monashScraper,
  usydneyScraper,
  uniquestScraper,
  nusScraper,
  hkustScraper,
  hkuScraper,
} from "./new-institutions";

export { ScrapedListing, InstitutionScraper };

export const ALL_SCRAPERS: InstitutionScraper[] = [
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
  mayoScraper,
  scrippsScraper,
  salkScraper,
  mdandersonScraper,
  upittScraper,
  uchicagoScraper,
  yaleScraper,
  vanderbiltScraper,
  emoryScraper,
  buScraper,
  georgetownScraper,
  gatechScraper,
  utexasScraper,
  cwruScraper,
  ucoloradoScraper,
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
  purdueRFScraper,
  umnScraper,
  miamiScraper,
  upstateScraper,
  sunyScraper,
  alabamaScraper,
  wyomingScraper,
  idahoScraper,
  // New US
  fsuScraper,
  ucfScraper,
  fiuScraper,
  tamuScraper,
  riceScraper,
  uhoustonScraper,
  texasTechScraper,
  untScraper,
  baylorScraper,
  portlandStateScraper,
  umontanaScraper,
  montanaStateScraper,
  unmScraper,
  nmsuScraper,
  unrScraper,
  unlvScraper,
  usuScraper,
  byuScraper,
  uafScraper,
  uaaScraper,
  undScraper,
  ndsuScraper,
  sdstateScraper,
  indianaScraper,
  notredameScraper,
  warfScraper,
  auburnScraper,
  ugaScraper,
  uarkansasScraper,
  uamsScraper,
  olemissScraper,
  udelScraper,
  templeScraper,
  drexelScraper,
  bucknellScraper,
  sunyalbanyScraper,
  uconnScraper,
  dartmouthScraper,
  brandeisScraper,
  unhScraper,
  uriScraper,
  mountsinaiScraper,
  caltechScraper,
  asuScraper,
  uillinoisScraper,
  // International – UK
  oxfordScraper,
  cambridgeScraper,
  imperialScraper,
  uclScraper,
  manchesterScraper,
  edinburghScraper,
  bristolScraper,
  glasgowScraper,
  birminghamScraper,
  nottinghamScraper,
  leedsScraper,
  sheffieldScraper,
  southamptonScraper,
  warwickScraper,
  kclScraper,
  // International – Switzerland
  ethzurichScraper,
  epflScraper,
  ubaselScraper,
  ulausanneScraper,
  ugenevaScaper,
  uzurichScraper,
  // International – Benelux
  kuleuvenScraper,
  ugentScraper,
  groningenScraper,
  uamsterdamScraper,
  vuamsterdamScraper,
  leidenScraper,
  // International – Nordic
  karolinskaScaper,
  inven2Scraper,
  visScraper,
  ntnuScraper,
  ucphScraper,
  aarhusScraper,
  dtuScraper,
  lundScraper,
  chalmersScraper,
  gothenburgScraper,
  helsinkiScraper,
  aaltoScraper,
  // International – Germany
  tumScraper,
  lmuScraper,
  rwthScraper,
  ufreiburgScraper,
  ubonnScraper,
  ucologneScraper,
  utubingenScraper,
  heidelbergScraper,
  // International – Israel
  weizmannScraper,
  technionScraper,
  // International – Canada
  utorontoScraper,
  mcgillScraper,
  ubcScraper,
  ucalgaryScraper,
  usaskScraper,
  umanitobaScraper,
  uvicScraper,
  sfuScraper,
  // International – Asia-Pacific
  umelbourneScraper,
  monashScraper,
  usydneyScraper,
  uniquestScraper,
  nusScraper,
  hkustScraper,
  hkuScraper,
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
  onProgress?: (done: number, total: number, listingsFound: number) => void
): Promise<ScrapedListing[]> {
  console.log(`[scrapers] Starting scrape for ${ALL_SCRAPERS.length} institutions...`);

  let listingsFound = 0;
  const tasks = ALL_SCRAPERS.map((scraper) => () => scraper.scrape());

  const results = await runWithConcurrency(tasks, 5, (_taskIndex, result, done, total) => {
    listingsFound += (result as ScrapedListing[]).length;
    onProgress?.(done, total, listingsFound);
  });

  const allListings = results.flat();
  console.log(`[scrapers] Total listings scraped: ${allListings.length}`);
  return allListings;
}
