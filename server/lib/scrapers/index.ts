import type { InstitutionScraper, ScrapedListing } from "./types";
// iEdison scraper disabled — iedison.nih.gov blocks all cloud/datacenter hosting IPs.
// Re-enable only if a residential proxy or API key becomes available.
// import { iEdisonScraper } from "./iedison";
import { stanfordScraper } from "./stanford";
import { mitScraper } from "./mit";
import { harvardScraper } from "./harvard";
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
import { gladstoneScraper, utepScraper } from "./tradespace";
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
  // Task #364 — Recovered Flintbox scrapers + updated stubs
  texasTechScraper,
  brandeisScraper,
  uarkansasScraper,
  exeterScraper,
  cardiffScraper,
  warwickScraper,
  // Task #366 — BGN Technologies (previously unregistered stub)
  bgnScraper,
  // Task #412 — Flintbox data moat expansion
  uicFlintboxScraper,
  qmulScraper,
  unccScraper,
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
  ucsfScraper,
  ucmScraper,
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
  jeffersonScraper,
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
  umassLowellScraper,
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
  // Task #271 — Ljubljana
  ljubljanaScraper,
  // Task #273 — Wistar, VCU, WEHI
  wistarScraper,
  vcuScraper,
  wehiScraper,
  // Task #275 — UWI, Bath, LLNL
  uwiScraper,
  bathScraper,
  llnlScraper,
  // Task #276 — TechLink VA
  techLinkVAScraper,
  // Task #279 — University of Guelph + Ontario Tech
  uoguelphScraper,
  ontarioTechScraper,
  versitiScraper,
  // Task #280 — Institut Curie, Einstein, OHSU, MGB
  institutCurieScraper,
  einsteinScraper,
  ohsuScraper,
  mgbScraper,
  // KAUST — Flintbox (kaust.flintbox.com, orgId 92)
  kaustScraper,
  // Task #352 — Tier 1 TechPublisher (5 institutions)
  houstonMethodistScraper,
  sickkidsScraper,
  hjfScraper,
  okstateScraper,
  univieScraper,
  // Task #352 — Tier 1 IN-PART (2 new institutions + URI upgrade)
  norinnova,
  embl,
  uriScraper,
  // Task #352 — Tier 2 Flintbox (3 new + UNM/UDel upgrades)
  unmScraper,
  udelScraper,
  unthscScraper,
  qatarUniversityScraper,
  hollandBloorviewScraper,
  // Task #352 — Tier 3 custom HTML scrapers (3 institutions)
  benaroyaScraper,
  ljiScraper,
  limrScraper,
  // Task #360 — Scraper Expansion: ~30 New Institutions
  sanfordHealthScraper,
  // US children's hospitals — stubs
  seattleChildrensScraper,
  childrensColoradoScraper,
  radyChildrensScraper,
  // US independent research institutes — stubs
  vanAndelScraper,
  salkScraper,
  broadInstituteScraper,
  whiteheadScraper,
  kesslerFoundationScraper,
  forsythScraper,
  jcviScraper,
  mblScraper,
  moteScraper,
  hudsonAlphaScraper,
  nationalJewishHealthScraper,
  medStarScraper,
  hennepinHealthcareScraper,
  cdcTechTransferScraper,
  jacksonLabScraper,
  burnetInstituteScraper,
  // International institutions — stubs
  astarScraper,
  csiroScraper,
  nrcCanadaScraper,
  fraunhoferScraper,
  ceaScraper,
  tecnaliaScraper,
  vttScraper,
  sintefScraper,
  tnoScraper,
  imecScraper,
  rikenScraper,
  aistScraper,
  kistScraper,
  // Chinese research institutions — stubs
  chineseAcademySciencesScraper,
  tsinghuaScraper,
  pekingUniversityScraper,
  zhejiangUniversityScraper,
  shanghaiTechScraper,
  // Task #412 — in-part data moat expansion
  umassmedScraper,
  upvScraper,
  brockScraper,
  novaLisbonScraper,
} from "./new-institutions";

// ── Task #277 — VIPS DOE National Labs ────────────────────────────────────────
import {
  nrelVipsScraper,
  kcnscVipsScraper,
  slacVipsScraper,
  netlVipsScraper,
  savannahRiverVipsScraper,
  fermiVipsScraper,
  amesLabVipsScraper,
  jlabVipsScraper,
  y12VipsScraper,
  ppplVipsScraper,
  nevadaNSSVipsScraper,
} from "./vips";

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

// ── Scraper Tier Map ──────────────────────────────────────────────────────────
// Tier 1: API/RSS-based (structured data, fastest)
// Tier 2: Platform factory (TechPublisher / Flintbox platform crawl)
// Tier 3: Custom bespoke HTML (not Playwright)
// Tier 4: Playwright (headless browser — slowest, most resource-intensive)
// Scrapers not listed here are inferred: playwright → 4, otherwise → 3.

const TIER1_INSTITUTIONS = new Set<string>([
  // Government / foundation API
  "NIH Office of Technology Transfer",
  "NCI Technology Transfer Center",
  "Max Planck Innovation",
  "LifeArc",
  "Kyoto University TLO",
  // Yissum — WP REST API
  "Yissum",
  // In-part non-playwright (Flintbox API)
  "University of Central Florida",
  "Florida International University",
  "Rice University",
  "Utah State University",
  "Auburn University",
  "University of Georgia",
  "University of Connecticut",
  "Dartmouth College",
  "University of British Columbia",
  "University of Victoria",
  "Monash University",
  // Task #109/#112 in-part API
  "Dana-Farber Cancer Institute",
  "Children's Hospital Los Angeles",
  "Lurie Children's Hospital",
  "Baylor College of Medicine",
  "Children's National",
  "Children's Hospital of Philadelphia",
  // Task #113/#114 in-part API
  "University of Glasgow",
  "University of Southern Denmark",
  "University of East Anglia",
  "University of Sussex",
  "Newcastle University",
  "University of Plymouth",
  "Saarland University",
  "Stellenbosch University",
  "Macquarie University",
  // Task #115 in-part API
  "Nagoya University",
  "Okinawa Institute of Science and Technology",
  "Hokkaido University",
  "University of St Andrews",
  "University of Salford",
  // Task #279 in-part API
  "University of Guelph",
  // Task #280 in-part API
  "Institut Curie",
  "Albert Einstein College of Medicine",
  // Task #120/#134 Flintbox
  "University of Birmingham",
  "University of Dundee",
  "McGill University",
  "University of Calgary",
  // Inteum + Algolia API (arizona.technologypublisher.com)
  "University of Arizona",
  // Task #360 — Flintbox API (orgId/accessKey confirmed live)
  "Sanford Health Innovation",
  // Task #364 — Recovered Flintbox scrapers (re-investigated 2026-04-20)
  "Texas Tech University",        // ttu.flintbox.com — orgId=23 — 246 techs confirmed
  "Brandeis University",          // brandeis.flintbox.com — orgId=43 — 95 techs confirmed
]);

const TIER2_INSTITUTIONS = new Set<string>([
  // TechPublisher factory
  "Princeton University", "UCLA", "Brown University", "University of Rochester",
  "Tufts University", "UTHealth Houston", "Colorado State University", "Virginia Tech",
  "University of South Florida", "Wayne State University", "UT Dallas",
  "Mississippi State University", "University of Toledo", "NJIT",
  "Cal Poly San Luis Obispo", "Saint Louis University", "UC Davis", "UC Irvine",
  "UC Riverside", "UC Santa Barbara", "UC Santa Cruz", "University of Utah",
  "University of Virginia", "University of Oregon", "George Washington University",
  "CZ Biohub", "MUSC", "University of South Carolina", "Lehigh University",
  "Clemson University", "Iowa State University", "TGen", "Washington State University",
  "Penn State", "Rutgers University", "Stevens Institute of Technology",
  "Rensselaer Polytechnic Institute", "Stony Brook University",
  "University of Cincinnati", "University at Buffalo", "Rowan University",
  "George Mason University", "University of Maine", "Binghamton University",
  "University of Southern California", "Oregon State University",
  "Georgia State University", "Northeastern University", "University of Vermont",
  "University of San Diego", "Texas State University", "University of Miami",
  "SUNY Upstate Medical University", "SUNY Research Foundation", "University of Alabama",
  "University of Wyoming", "University of Idaho", "University of Alaska Fairbanks",
  "South Dakota State University", "University of Mississippi", "Drexel University",
  "University of Leeds", "University of Southampton", "University of Saskatchewan", "UNLV",
  // Task #118 TechPublisher international
  "University of New South Wales", "Loughborough University", "University of Ottawa",
  "University of Surrey", "La Trobe University", "Vanderbilt University",
  "Queen's University Belfast",
  // TechPublisher misc
  "Boston Children's Hospital", "University of Nottingham",
  // Flintbox HTML fallback batch (platform-based, roughly tier 2)
  "Texas A&M University", "University of Iowa", "BIDMC", "Northumbria University",
  "Carnegie Mellon University", "SMU", "Cleveland Clinic", "UAB",
  "Cerca Nostra", "Kansas State University", "Cedars-Sinai", "Florida Atlantic University",
  "Tulane University", "University of Louisville", "Louisiana State University Health Sciences Center",
  "University Health Network", "Louisiana State University", "University of Alabama in Huntsville",
  "West Virginia University", "Children's Mercy Hospital", "KC Ventures", "University of Strathclyde",
  "Syracuse University", "Swansea University", "UT San Antonio", "NC State University",
  "Dalhousie University", "University of Florida", "UC Merced", "San Diego State University",
  "University of Southern Mississippi", "Michigan State University", "University of Denver",
  "University of Kansas", "Southern Illinois University", "University of Kentucky",
  "Boise State University", "Northern Arizona University", "University of Tennessee",
  "North Carolina A&T", "Morgan State University", "Howard University",
  "UNC Chapel Hill", "PR Science Trust", "UMass Amherst", "University of South Alabama",
  "UMBC", "Boston College",
]);

export function getScraperTier(institution: string): 1 | 2 | 3 | 4 {
  const scraper = ALL_SCRAPERS.find((s) => s.institution === institution);
  if (!scraper) return 3;
  if (scraper.scraperType === "playwright") return 4;
  if (scraper.scraperType === "api") return 1;
  if (TIER1_INSTITUTIONS.has(institution)) return 1;
  if (TIER2_INSTITUTIONS.has(institution)) return 2;
  return 3;
}

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
  // iEdisonScraper disabled — blocks cloud IPs, no API key available (see import above)
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
  ucmScraper,
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
  jeffersonScraper,               // Thomas Jefferson University — in-part API "jefferson"
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
  kaustScraper,
  // ── Task #352 — 16 new/upgraded scrapers (April 2026) ─────────────────────
  // Tier 1: TechPublisher
  houstonMethodistScraper,
  sickkidsScraper,
  hjfScraper,
  okstateScraper,
  univieScraper,
  // Tier 1: IN-PART
  norinnova,
  embl,
  uriScraper,
  // Tier 2: Flintbox (3 new + 2 stubs upgraded)
  unmScraper,
  udelScraper,
  unthscScraper,
  qatarUniversityScraper,
  hollandBloorviewScraper,
  // Tier 3: custom HTML
  benaroyaScraper,
  ljiScraper,
  limrScraper,
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
  umassLowellScraper,
  southAlabamaScraper,
  umbcScraper,
  bostonCollegeScraper,
  // ── Task #412 — Data moat expansion new scrapers ──────────────────────────
  uicFlintboxScraper,
  qmulScraper,
  unccScraper,
  umassmedScraper,
  upvScraper,
  brockScraper,
  novaLisbonScraper,
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
  // Re-investigated 2026-04-20 (Task #364): Exeter portal gone; Cardiff+Warwick Flintbox 0 items
  exeterScraper,                  // University of Exeter — stub (exeter.flintbox.com redirects away)
  cardiffScraper,                 // Cardiff University — stub (cardiff.flintbox.com returns 0 items)
  warwickScraper,                 // University of Warwick — stub (warwick.flintbox.com returns 0 items)
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
  // ── Tradespace (Tasks #271, this session) ─────────────────────────────────
  gladstoneScraper,               // Gladstone Institutes — Tradespace Playwright — ~60+ techs
  utepScraper,                    // University of Texas El Paso — Tradespace Playwright — confirmed live
  // ── International — Central/Eastern Europe (this session) ─────────────────
  ljubljanaScraper,               // University of Ljubljana — in-part "ljubljana" — confirmed live
  // ── Task #273 — Wistar, VCU, WEHI ─────────────────────────────────────────
  wistarScraper,                  // Wistar Institute — stub (no public IP listing portal found)
  vcuScraper,                     // Virginia Commonwealth University — Flintbox orgId=174 — 146 techs confirmed
  wehiScraper,                    // Walter and Eliza Hall Institute — Algolia prod_sod_technology — 13 techs
  // ── Task #275 — UWI, Bath, LLNL ────────────────────────────────────────────
  uwiScraper,                     // UWI St. Augustine STACIE — Drupal nodes — 3 patents
  bathScraper,                    // University of Bath — 4 PDF tech sheets confirmed live
  llnlScraper,                    // Lawrence Livermore National Laboratory — ~340 static HTML techs across 8 categories
  // ── Task #276 — TechLink VA ────────────────────────────────────────────────
  // Probe validated 2026-03-31: 1,400 VA technologies confirmed via live Playwright run.
  // ES cluster: search-techlinkopensearch-4cwxptyr7jbbeo3btshilrp4ka.us-west-2.es.amazonaws.com
  // If ES auth ever stops working, scraper logs warning and returns [] explicitly.
  techLinkVAScraper,              // TechLink (VA Technology Transfer) — ES XHR intercept Playwright — 1,400 VA techs
  // ── Task #279 — University of Guelph + Ontario Tech ───────────────────────
  uoguelphScraper,                // University of Guelph — In-Part "uoguelph" — 26 techs confirmed
  ontarioTechScraper,             // Ontario Tech University — HTML accordion — 13 techs confirmed
  versitiScraper,                 // Versiti Blood Research Institute — stub (landing page, no enumerable catalog)
  // ── Task #280 — Institut Curie, Albert Einstein, OHSU, MGB ────────────────
  institutCurieScraper,           // Institut Curie — In-Part "institutcurie" — 42 techs confirmed
  einsteinScraper,                // Albert Einstein College of Medicine — In-Part "einsteinmed" — 96 techs confirmed
  ohsuScraper,                    // OHSU — Drupal 9 bespoke 2-level HTTP scraper — 47 categories
  mgbScraper,                     // Mass General Brigham — AEM site, 10 featured-licensing pages
  // ── Task #277 — VIPS DOE National Labs ────────────────────────────────────
  // Pure-HTTP SRS API: POST /SRS/Sessions/AuthenticateGuest + DataAdapters/Query + Results/Values
  // Probe validated 2026-03-31: all 11 labs confirmed ≥1 result via live direct API call.
  // Skipped (already covered): Sandia, LLNL (ipo.llnl.gov), ORNL, LBL, PNNL, LANL, ANL, INL, BNL.
  nrelVipsScraper,                // National Renewable Energy Laboratory — 1,535 VIPS records
  kcnscVipsScraper,               // Kansas City National Security Campus — 392 VIPS records
  slacVipsScraper,                // SLAC National Accelerator Laboratory — 271 VIPS records
  netlVipsScraper,                // National Energy Technology Laboratory — 268 VIPS records
  savannahRiverVipsScraper,       // Savannah River National Laboratory — 261+20 VIPS records
  fermiVipsScraper,               // Fermi National Accelerator Laboratory — 185 VIPS records
  amesLabVipsScraper,             // Ames Laboratory — 180 VIPS records
  jlabVipsScraper,                // Thomas Jefferson National Accelerator Facility — 157 VIPS records
  y12VipsScraper,                 // Y-12 National Security Complex — 143 VIPS records
  ppplVipsScraper,                // Princeton Plasma Physics Laboratory — 52 VIPS records
  nevadaNSSVipsScraper,           // Nevada National Security Site — 39 VIPS records
  // ── Task #360 — Scraper Expansion: ~30 New Institutions ──────────────────────
  sanfordHealthScraper,           // Sanford Health Innovation — Flintbox orgId=122 — 10 techs confirmed
  // Task #364 — Recovered US Flintbox scrapers (re-investigated 2026-04-20)
  texasTechScraper,               // Texas Tech University — Flintbox orgId=23 — 246 techs confirmed
  brandeisScraper,                // Brandeis University — Flintbox orgId=43 — 95 techs confirmed
  uarkansasScraper,               // University of Arkansas — Flintbox orgId=27, 50+ tech listings (upgraded from stub 2026-04-21)
  // US children's hospitals
  seattleChildrensScraper,        // Seattle Children's Research Institute — stub (no enumerable catalog)
  childrensColoradoScraper,       // Children's Hospital Colorado Research Institute — stub (generic pages only)
  radyChildrensScraper,           // Rady Children's Institute for Genomic Medicine — stub (clinical service licenses, not IP)
  // US independent research institutes
  vanAndelScraper,                // Van Andel Institute — stub (contact-only page; Playwright confirmed 0 tech links after full SPA render)
  salkScraper,                    // Salk Institute for Biological Studies — stub (redirects to authenticated In-Part portal; Playwright confirmed 0 tech links)
  broadInstituteScraper,          // Broad Institute of MIT and Harvard — stub (marketing page only)
  whiteheadScraper,               // Whitehead Institute for Biomedical Research — stub (30KB, no listing)
  kesslerFoundationScraper,       // Kessler Foundation — stub (Cloudflare-blocked)
  forsythScraper,                 // Forsyth Institute — stub (services brochure, not IP catalog)
  jcviScraper,                    // J. Craig Venter Institute — stub (bare 2-link overview)
  mblScraper,                     // Marine Biological Laboratory — stub (general research site)
  moteScraper,                    // Mote Marine Laboratory & Aquarium — stub (0 bytes returned)
  hudsonAlphaScraper,             // HudsonAlpha Institute for Biotechnology — stub (education programs only)
  nationalJewishHealthScraper,    // National Jewish Health — stub (overview page only)
  medStarScraper,                 // MedStar Health Research Institute — stub (marketing page)
  hennepinHealthcareScraper,      // Hennepin Healthcare Research Institute — stub (2KB, no listing)
  cdcTechTransferScraper,         // CDC Technology Transfer Office — stub (0 bytes returned)
  jacksonLabScraper,              // Jackson Laboratory (JAX) — stub (55KB, 0 tech links)
  burnetInstituteScraper,         // Burnet Institute — stub (single-technology page only)
  // International institutions
  astarScraper,                   // A*STAR — stub (ERR_NAME_NOT_RESOLVED via Playwright; astar.edu.sg DNS geo-restricted to Singapore)
  csiroScraper,                   // CSIRO — Playwright (JS-rendered IP catalog; XHR intercept + DOM fallback)
  nrcCanadaScraper,               // National Research Council Canada — stub (generic gov navigation)
  fraunhoferScraper,              // Fraunhofer Society — stub (institute group listing, no unified IP catalog)
  ceaScraper,                     // CEA (France) — stub (713 bytes, geo-blocked or JS-only)
  tecnaliaScraper,                // Tecnalia — stub (86KB, no enumerable catalog)
  vttScraper,                     // VTT Technical Research Centre of Finland — stub (service areas, not IPs)
  sintefScraper,                  // SINTEF — stub (7KB, 0 tech links)
  tnoScraper,                     // TNO (Netherlands) — stub (research topics, not IP catalog)
  imecScraper,                    // IMEC — Playwright (JS-rendered; XHR intercept + DOM fallback)
  bgnScraper,                     // BGN Technologies (Ben-Gurion University) — stub (CloudFront WAF blocks both curl and Playwright headless)
  rikenScraper,                   // RIKEN — stub (lab pages only, not IP listings)
  aistScraper,                    // AIST (Japan) — stub (18KB informational, 0 tech links)
  kistScraper,                    // KIST (Korea) — stub (166 bytes, bot-blocked)
  // Chinese research institutions
  chineseAcademySciencesScraper,  // Chinese Academy of Sciences — stub (1235 bytes, no accessible catalog)
  tsinghuaScraper,                // Tsinghua University — stub (0 bytes, blocked)
  pekingUniversityScraper,        // Peking University — stub (no accessible English catalog)
  zhejiangUniversityScraper,      // Zhejiang University — stub (no accessible English catalog)
  shanghaiTechScraper,            // ShanghaiTech University — stub (no accessible English catalog)
];

// Stamp the tier field on every scraper object at startup so that
// both `scraper.tier` (property) and `getScraperTier()` (function) agree,
// without requiring every individual scraper file to declare it explicitly.
for (const s of ALL_SCRAPERS) {
  s.tier = getScraperTier(s.institution);
}

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
