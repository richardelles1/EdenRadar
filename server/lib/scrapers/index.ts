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
  unswScraper,
  loughboroughScraper,
  uottawaScraper,
  surreyScraper,
  latrobeScraper,
  vanderbiltScraper,
  queensBelfastScraper,
  cernKtScraper,
  cancerResearchHorizonsScraper,
  // Batch E — UK & Canada (Task #134)
  imperialScraper,
  birminghamScraper,
  sheffieldScraper,
  dundeeScraper,
  mcgillScraper,
  waterlooScraper,
  mcmasterScraper,
  calgaryScraper,
  // DOE Labs — proxy-routed
  ornlScraper,
  argonneScraper,
  pnnlScraper,
} from "./new-institutions";

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
  csusScraper,
  loyolaChicagoScraper,
  ohioScraper,
  umkcScraper,
  famuScraper,
  unetechScraper,
  uneMedScraper,
  umventuresScraper,
  memphisScraper,
  utrgvScraper,
  uwmrfScraper,
  jacksonStateScraper,
  ferrisStateScraper,
  brookhavenScraper,
  launchTNScraper,
  ritScraper,
  nmTechScraper,
  sandiaScraper,
  losAlamosScraper,
  // Task #107 — Government & Cancer Center Scrapers (Batch 3)
  niddkScraper,
  lblScraper,
  roswellParkScraper,
  ncatsScraper,
  // Task #109 — Batch 4 Cancer Centers
  dfciScraper,
  cincyChildrensScraper,
  foxChaseScraper,
  fredHutchScraper,
  moffittScraper,
  // Task #112 — Pediatric / Children's Hospital batch
  chlaScraper,
  lurieChildrensScraper,
  bcmScraper,
  childrensNationalScraper,
  bostonChildrensScraper,
  chopScraper,
  stjudeScraper,
  nationwideChildrensScraper,
  nemoursScraper,
  // Task #113 — International Batch A
  oxfordInnovationScraper,
  bristolScraper,
  yissumScraper,
  nottinghamScraper,
  techLinkScraper,
  researchPortalGhentScraper,
  // Task #114 — International Batch B
  yedaResearchScraper,
  glasgowScraper,
  sduScraper,
  ueaScraper,
  sussexScraper,
  newcastleScraper,
  plymouthScraper,
  saarlandScraper,
  stellenboschScraper,
  macquarieScraper,
  edinburghInnovationsScraper,
  // Task #115 — FRIS Belgium (pivoted: FRIS Akamai-blocked; 5 in-part alternatives)
  nagoyaScraper,
  oistScraper,
  hokkaidoScraper,
  stAndrewsScraper,
  salfordScraper,
} from "./new-institutions";

// ── Tier 2 Investigation Results (March 2026) ─────────────────────────────────
// Institutions fully investigated — no enumerable public tech listing found:
//
// Cold Spring Harbor Laboratory (CSHL)
//   Probed: cshl.edu/partner-with-us/technology-transfer/ (200, informational only),
//           WP REST API /wp-json/wp/v2/types (no tech-related custom post types)
//   Platform: WordPress; CPTs are press_news, library_news, archives_blog, harborscope
//   Status: Tech transfer page describes processes/contacts, no enumerable tech database
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
//
// Fred Hutchinson Cancer Center — IMPLEMENTED via Playwright (Task #109)
//   Elastic "cancer-consortium" engine only indexes cancerconsortium.org (0 FH tech pages)
//   AEM childrenlist hasChildren:false — tech-detail pages are dynamically rendered
//   Wayback Machine CDX: 0 archived technology-details pages
//   Solution: Playwright navigation of available-technologies.html JS search UI
//   Pagination: JS-driven Next button (no href), 10 results/page; stops when no new URLs
//   Smoke-tested result: ~61 listings across 7 pages (2026-03-17)
//   Last verified: 2026-03-17
//
// Moffitt Cancer Center — IMPLEMENTED Playwright-first + Wayback fallback (Task #109)
//   Direct HTTP access: Cloudflare Managed Challenge (HTTP 403) on all server-side requests
//   Playwright: also blocked by Cloudflare ("Just a moment" bot challenge page)
//   Fallback: Wayback Machine 2023 snapshot, 6 confirmed archived category pages:
//     pharmaceuticals-biologics, diagnostics, devices, immunotherapies,
//     software-tools, clinical-decision-support-tools
//   Titles derived from URL slug (ID prefix removed, proper title-case)
//   Smoke-tested result: ~158 listings from 4 categories (2026-03-17)
//   Last verified: 2026-03-17
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
  // baylorScraper replaced by explicit bcmScraper in Task #112 section below — same InPart "bcm" subdomain
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
  csusScraper,
  loyolaChicagoScraper,
  ohioScraper,
  umkcScraper,
  famuScraper,
  unetechScraper,
  uneMedScraper,
  umventuresScraper,
  memphisScraper,
  utrgvScraper,
  uwmrfScraper,
  jacksonStateScraper,
  ferrisStateScraper,
  brookhavenScraper,
  launchTNScraper,
  ritScraper,
  nmTechScraper,
  sandiaScraper,
  losAlamosScraper,
  // ── Government & Cancer Center Scrapers (Task #107, March 2026) ───────────
  niddkScraper,
  lblScraper,
  roswellParkScraper,
  ncatsScraper,
  // ── Batch 4 Cancer Centers (Task #109, March 2026) ─────────────────────────
  dfciScraper,                 // Dana-Farber Cancer Institute — in-part API ~70
  cincyChildrensScraper,       // Cincinnati Children's — HTML search page, dedup pagination ~40
  foxChaseScraper,             // Fox Chase Cancer Center — Drupal 2-level crawl ~67
  fredHutchScraper,            // Fred Hutch — Elastic cancer-consortium exhaustive scan (fredhutch.org URLs)
  moffittScraper,              // Moffitt — Wayback Machine 2023 snapshot, 6 categories
  // ── Pediatric / Children's Hospital batch (Task #112, March 2026) ─────────
  chlaScraper,                 // Children's Hospital Los Angeles — in-part API ~27
  lurieChildrensScraper,       // Lurie Children's Hospital — in-part API
  bcmScraper,                  // Baylor College of Medicine — in-part API "bcm" (replaces legacy baylorScraper)
  childrensNationalScraper,    // Children's National — in-part API
  bostonChildrensScraper,      // Boston Children's Hospital — TechPublisher "bch"
  chopScraper,                 // Children's Hospital of Philadelphia — Flintbox orgId=96
  stjudeScraper,               // St. Jude Children's Research Hospital — 6 category pages
  nationwideChildrensScraper,  // Nationwide Children's Hospital — bespoke HTML
  nemoursScraper,              // Nemours Children's Health — inline listing ~7 techs
  // ── International Batch A (Task #113) ────────────────────────────────────────
  oxfordInnovationScraper,        // Oxford University Innovation — ~200 techs via WP pagination
  bristolScraper,                 // University of Bristol — HTML listing + detail fetch
  yissumScraper,                  // Yissum (Hebrew Univ.) — 234 techs via WP REST API
  nottinghamScraper,              // University of Nottingham — TechPublisher slug "uon"
  techLinkScraper,                // TechLink (DoD) — Playwright, React SPA, no bot protection
  // ── International Batch B (Task #114) ────────────────────────────────────
  yedaResearchScraper,            // Yeda R&D / Weizmann Institute — 159 techs, mailto href extraction
  glasgowScraper,                 // University of Glasgow — in-part "gla" — 31 techs
  sduScraper,                     // Univ. of Southern Denmark — in-part "sdu" — 29 techs
  ueaScraper,                     // University of East Anglia — in-part "uea" — 23 techs
  sussexScraper,                  // University of Sussex — in-part "sussex" — 27 techs
  newcastleScraper,               // Newcastle University — in-part "newcastle" — 37 techs
  plymouthScraper,                // University of Plymouth — in-part "plymouth" — 18 techs
  saarlandScraper,                // Saarland University — in-part "saarland" — 34 techs
  stellenboschScraper,            // Stellenbosch University — in-part "sun" — 76 techs
  macquarieScraper,               // Macquarie University — in-part "mq" — 11 techs
  edinburghInnovationsScraper,    // Edinburgh Innovations — Playwright, Elucid3 — 50+ techs
  // ── FRIS Belgium pivot (Task #115): FRIS Akamai-blocked; 5 in-part alternatives ──
  nagoyaScraper,                  // Nagoya University (Japan) — in-part "nagoya" — ~72 techs
  oistScraper,                    // OIST (Japan) — in-part "oist" — ~68 techs
  hokkaidoScraper,                // Hokkaido University (Japan) — in-part "hokkaido" — ~31 techs
  stAndrewsScraper,               // University of St Andrews (UK) — in-part "st-andrews" — 20 techs
  salfordScraper,                 // University of Salford (UK) — in-part "salford" — ~5 techs
  // ── International Scrapers — Batch C (Task #118) ─────────────────────────
  unswScraper,                    // Univ. of New South Wales — TechPublisher "unsw" — 54 sitemap techs
  loughboroughScraper,            // Loughborough University — TechPublisher "lboro" — 36 sitemap techs
  uottawaScraper,                 // University of Ottawa — TechPublisher "uottawa" — 53 sitemap techs
  surreyScraper,                  // University of Surrey — TechPublisher "surrey" — 45 sitemap techs
  latrobeScraper,                 // La Trobe University — TechPublisher "latrobe" — 9 sitemap techs
  vanderbiltScraper,              // Vanderbilt University — TechPublisher "vanderbilt" — 213 sitemap techs
  queensBelfastScraper,           // Queen's Univ. Belfast — TechPublisher "qub" — listings confirmed
  // ── International Scrapers — Batch D (Task #119) ────────────────────────
  cernKtScraper,                  // CERN Knowledge Transfer — Drupal SSR, 54 tech pages — probed 2026-03-17
  cancerResearchHorizonsScraper,  // Cancer Research Horizons (CRUK) — Playwright, JS-rendered, oncology portfolio — probed 2026-03-17
  // ── International Scrapers — Batch E (Task #120 → fixed Task #134) — UK & Canada ──
  // Exeter, Cardiff, Warwick removed — no usable public TTO portal found
  imperialScraper,                // Imperial College London — paginated HTML scraper (imperial.ac.uk)
  birminghamScraper,              // University of Birmingham — Flintbox (unibirmingham.flintbox.com)
  sheffieldScraper,               // University of Sheffield — HTML listing (sheffield.ac.uk)
  dundeeScraper,                  // University of Dundee — Flintbox (dundee.flintbox.com)
  mcgillScraper,                  // McGill University — Flintbox (mcgill.flintbox.com)
  waterlooScraper,                // University of Waterloo — HTML catalog (uwaterloo.ca/watco)
  mcmasterScraper,                // McMaster University — HTML listing (research.mcmaster.ca)
  calgaryScraper,                 // University of Calgary — Flintbox (calgary.flintbox.com)
  // ── DOE National Labs — Proxy-Routed (Task #121) ─────────────────────────
  // Require SCRAPER_PROXY_URL env secret (Cloudflare Worker).
  // Deploy server/lib/scrapers/cloudflare-proxy/worker.js to unlock.
  ornlScraper,                    // Oak Ridge National Laboratory — proxy-routed — ~120+ techs
  argonneScraper,                 // Argonne National Laboratory — proxy-routed — ~200+ techs
  pnnlScraper,                    // Pacific Northwest National Laboratory — proxy-routed — ~150+ techs
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
    onProgress?.(doneCount, totalCount, listingsFound, Array.from(activeInstitutions));
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
