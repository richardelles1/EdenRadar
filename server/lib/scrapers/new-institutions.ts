import { createTechPublisherScraper } from "./techpublisher";
import type { InstitutionScraper, ScrapedListing } from "./types";

function createStubScraper(institution: string, reason = "no public TTO listing portal"): InstitutionScraper {
  return {
    institution,
    async scrape(): Promise<ScrapedListing[]> {
      console.log(`[scraper] ${institution}: skipped — ${reason}`);
      return [];
    },
  };
}

// ── Verified working TechPublisher scrapers ──────────────────────────────
export const princetonScraper = createTechPublisherScraper(
  "puotl",
  "Princeton University",
  { maxPg: 80 }
);

export const uclaScraper = createTechPublisherScraper(
  "ucla",
  "UCLA",
  { maxPg: 100 }
);

export const brownScraper = createTechPublisherScraper(
  "brown",
  "Brown University",
  { maxPg: 50 }
);

export const rochesterScraper = createTechPublisherScraper(
  "rochester",
  "University of Rochester",
  { maxPg: 80 }
);

export const tuftsScraper = createTechPublisherScraper(
  "tufts",
  "Tufts University",
  { maxPg: 50 }
);

export const uthealthScraper = createTechPublisherScraper(
  "uthealth",
  "UT Health",
  { maxPg: 50 }
);

export const coloradoStateScraper = createTechPublisherScraper(
  "csuventures",
  "Colorado State University",
  { maxPg: 50 }
);

export const virginiaTechScraper = createTechPublisherScraper(
  "vtip",
  "Virginia Tech",
  { maxPg: 80 }
);

export const usfScraper = createTechPublisherScraper(
  "usf",
  "University of South Florida",
  { maxPg: 80 }
);

export const wayneScraper = createTechPublisherScraper(
  "wayne",
  "Wayne State University",
  { maxPg: 80 }
);

export const utDallasScraper = createTechPublisherScraper(
  "utdallas",
  "UT Dallas",
  { maxPg: 50 }
);

export const msStateScraper = createTechPublisherScraper(
  "msstate-innovations",
  "Mississippi State University",
  { maxPg: 30 }
);

export const utToledoScraper = createTechPublisherScraper(
  "utoledo",
  "University of Toledo",
  { maxPg: 30 }
);

export const njitScraper = createTechPublisherScraper(
  "njit",
  "New Jersey Institute of Technology",
  { maxPg: 30 }
);

export const calPolyScraper = createTechPublisherScraper(
  "calpoly",
  "Cal Poly San Luis Obispo",
  { maxPg: 20 }
);

export const sluScraper = createTechPublisherScraper(
  "slu",
  "Saint Louis University",
  { maxPg: 30 }
);

export const ucDavisScraper = createTechPublisherScraper(
  "ucdavis",
  "UC Davis",
  { selector: "a[href*='/techcase']", maxPg: 80 }
);

export const utahScraper = createTechPublisherScraper(
  "utah",
  "University of Utah",
  { maxPg: 80 }
);

export const uvaScraper = createTechPublisherScraper(
  "uva",
  "University of Virginia",
  { maxPg: 80 }
);

export const uOregonScraper = createTechPublisherScraper(
  "uoregon",
  "University of Oregon",
  { maxPg: 30 }
);

export const gwuScraper = createTechPublisherScraper(
  "gwu",
  "George Washington University",
  { maxPg: 30 }
);

export const czBiohubScraper = createTechPublisherScraper(
  "czbiohub",
  "CZ Biohub",
  { maxPg: 20 }
);

export const muscScraper = createTechPublisherScraper(
  "musc",
  "Medical University of South Carolina",
  { maxPg: 30 }
);

export const southCarolinaScraper = createTechPublisherScraper(
  "sc",
  "University of South Carolina",
  { maxPg: 30 }
);

export const lehighScraper = createTechPublisherScraper(
  "lehighott",
  "Lehigh University",
  { maxPg: 30 }
);

export const clemsonScraper = createTechPublisherScraper(
  "curf",
  "Clemson University",
  { maxPg: 50 }
);

export const iowaStateScraper = createTechPublisherScraper(
  "isurftech",
  "Iowa State University",
  { maxPg: 50 }
);

export const tgenScraper = createTechPublisherScraper(
  "tgen",
  "Translational Genomics Research Institute",
  { maxPg: 20 }
);

export const wsuScraper = createTechPublisherScraper(
  "wsu",
  "Washington State University",
  { selector: "a[href*='/techcase']", maxPg: 80 }
);

export const arizonaScraper = createTechPublisherScraper(
  "arizona",
  "University of Arizona",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 80 }
);

export const pennStateScraper = createTechPublisherScraper(
  "pennstate",
  "Penn State University",
  { maxPg: 80 }
);

export const rutgersScraper = createTechPublisherScraper(
  "rutgers",
  "Rutgers University",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 80 }
);

export const stevensScraper = createTechPublisherScraper(
  "stevens",
  "Stevens Institute of Technology",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 30 }
);

export const rpiScraper = createTechPublisherScraper(
  "rpi",
  "Rensselaer Polytechnic Institute",
  { maxPg: 50 }
);

export const stonyBrookScraper = createTechPublisherScraper(
  "stonybrook",
  "Stony Brook University",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 50 }
);

export const cincinnatiScraper = createTechPublisherScraper(
  "uc",
  "University of Cincinnati",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 50 }
);

export const buffaloScraper = createTechPublisherScraper(
  "buffalo",
  "University at Buffalo",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 50 }
);

export const rowanScraper = createTechPublisherScraper(
  "rowan",
  "Rowan University",
  { maxPg: 30 }
);

export const georgemasonScraper = createTechPublisherScraper(
  "mason",
  "George Mason University",
  { maxPg: 50 }
);

export const umaineScraper = createTechPublisherScraper(
  "umaine",
  "University of Maine",
  { maxPg: 30 }
);

export const binghamtonScraper = createTechPublisherScraper(
  "binghamton",
  "Binghamton University",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 50 }
);

export const uscScraper = createTechPublisherScraper(
  "usc",
  "University of Southern California",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 80 }
);

export const oregonStateScraper = createTechPublisherScraper(
  "oregonstate",
  "Oregon State University",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 80 }
);

export const gsuScraper = createTechPublisherScraper(
  "gsu",
  "Georgia State University",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 50 }
);

export const northeasternScraper = createTechPublisherScraper(
  "nu",
  "Northeastern University",
  { maxPg: 50 }
);

export const uvmScraper = createTechPublisherScraper(
  "uvm",
  "University of Vermont",
  { selector: "a[href*='/techcase']", maxPg: 30 }
);

export const usdScraper = createTechPublisherScraper(
  "usd",
  "University of South Dakota",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 20 }
);

export const txstateScraper = createTechPublisherScraper(
  "txstate",
  "Texas State University",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 30 }
);

export const miamiScraper = createTechPublisherScraper(
  "miami",
  "University of Miami",
  { maxPg: 50 }
);

export const upstateScraper = createTechPublisherScraper(
  "upstate",
  "SUNY Upstate Medical University",
  { maxPg: 30 }
);

export const sunyScraper = createTechPublisherScraper(
  "suny",
  "SUNY System",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 20 }
);

export const alabamaScraper = createTechPublisherScraper(
  "ua",
  "University of Alabama",
  { maxPg: 50 }
);

export const wyomingScraper = createTechPublisherScraper(
  "uwyo",
  "University of Wyoming",
  { selector: "a[href*='/tech/'],a[href*='/tech?']", maxPg: 20 }
);

export const idahoScraper = createTechPublisherScraper(
  "uidaho",
  "University of Idaho",
  { maxPg: 30 }
);

// ── New US: verified working TechPublisher slugs ─────────────────────────
export const uafScraper = createTechPublisherScraper("uaf", "University of Alaska Fairbanks", { maxPg: 20 });
export const sdstateScraper = createTechPublisherScraper("sdstate", "South Dakota State University", { maxPg: 30 });
export const olemissScraper = createTechPublisherScraper("olemiss", "University of Mississippi", { maxPg: 30 });

// ── New US: verified working TechPublisher slugs (international) ─────────
export const leedsScraper = createTechPublisherScraper("leeds", "University of Leeds", { maxPg: 50 });
export const southamptonScraper = createTechPublisherScraper("southampton", "University of Southampton", { maxPg: 50 });
export const usaskScraper = createTechPublisherScraper("usask", "University of Saskatchewan", { maxPg: 30 });

// ── New US: no TechPublisher portal (stubs) ──────────────────────────────
export const fsuScraper = createStubScraper("Florida State University");
export const ucfScraper = createStubScraper("University of Central Florida");
export const fiuScraper = createStubScraper("Florida International University");
export const tamuScraper = createStubScraper("Texas A&M University");
export const riceScraper = createStubScraper("Rice University");
export const uhoustonScraper = createStubScraper("University of Houston");
export const texasTechScraper = createStubScraper("Texas Tech University");
export const untScraper = createStubScraper("University of North Texas");
export const baylorScraper = createStubScraper("Baylor University");
export const portlandStateScraper = createStubScraper("Portland State University");
export const umontanaScraper = createStubScraper("University of Montana");
export const montanaStateScraper = createStubScraper("Montana State University");
export const unmScraper = createStubScraper("University of New Mexico");
export const nmsuScraper = createStubScraper("New Mexico State University");
export const unrScraper = createStubScraper("University of Nevada, Reno");
export const unlvScraper = createStubScraper("University of Nevada, Las Vegas");
export const usuScraper = createStubScraper("Utah State University");
export const byuScraper = createStubScraper("Brigham Young University");
export const uaaScraper = createStubScraper("University of Alaska Anchorage");
export const undScraper = createStubScraper("University of North Dakota");
export const ndsuScraper = createStubScraper("North Dakota State University");
export const indianaScraper = createStubScraper("Indiana University");
export const notredameScraper = createStubScraper("University of Notre Dame");
export const warfScraper = createStubScraper("University of Wisconsin");
export const auburnScraper = createStubScraper("Auburn University");
export const ugaScraper = createStubScraper("University of Georgia");
export const uarkansasScraper = createStubScraper("University of Arkansas");
export const uamsScraper = createStubScraper("University of Arkansas for Medical Sciences");
export const udelScraper = createStubScraper("University of Delaware");
export const templeScraper = createStubScraper("Temple University");
export const drexelScraper = createStubScraper("Drexel University");
export const bucknellScraper = createStubScraper("Bucknell University");
export const sunyalbanyScraper = createStubScraper("SUNY Albany");
export const uconnScraper = createStubScraper("University of Connecticut");
export const dartmouthScraper = createStubScraper("Dartmouth College");
export const brandeisScraper = createStubScraper("Brandeis University");
export const unhScraper = createStubScraper("University of New Hampshire");
export const uriScraper = createStubScraper("University of Rhode Island");
export const mountsinaiScraper = createStubScraper("Icahn School of Medicine at Mount Sinai");
export const caltechScraper = createStubScraper("California Institute of Technology");
export const asuScraper = createStubScraper("Arizona State University");

// ── International: UK ────────────────────────────────────────────────────
export const oxfordScraper = createStubScraper("University of Oxford");
export const imperialScraper = createStubScraper("Imperial College London");
export const uclScraper = createStubScraper("University College London");
export const manchesterScraper = createStubScraper("University of Manchester");
export const edinburghScraper = createStubScraper("University of Edinburgh");
export const bristolScraper = createStubScraper("University of Bristol");
export const glasgowScraper = createStubScraper("University of Glasgow");
export const birminghamScraper = createStubScraper("University of Birmingham");
export const nottinghamScraper = createStubScraper("University of Nottingham");
export const sheffieldScraper = createStubScraper("University of Sheffield");
export const warwickScraper = createStubScraper("University of Warwick");
export const kclScraper = createStubScraper("King's College London");

// ── International: Switzerland ───────────────────────────────────────────
export const ethzurichScraper = createStubScraper("ETH Zurich");
export const epflScraper = createStubScraper("EPFL");
export const ubaselScraper = createStubScraper("University of Basel");
export const ulausanneScraper = createStubScraper("University of Lausanne");
export const ugenevaScaper = createStubScraper("University of Geneva");
export const uzurichScraper = createStubScraper("University of Zurich");

// ── International: Benelux ───────────────────────────────────────────────
export const kuleuvenScraper = createStubScraper("KU Leuven");
export const ugentScraper = createStubScraper("Ghent University");
export const groningenScraper = createStubScraper("University of Groningen");
export const uamsterdamScraper = createStubScraper("University of Amsterdam");
export const vuamsterdamScraper = createStubScraper("Vrije Universiteit Amsterdam");
export const leidenScraper = createStubScraper("Leiden University");

// ── International: Nordic ────────────────────────────────────────────────
export const karolinskaScaper = createStubScraper("Karolinska Institutet");
export const inven2Scraper = createStubScraper("University of Oslo");
export const visScraper = createStubScraper("University of Bergen");
export const ntnuScraper = createStubScraper("NTNU");
export const ucphScraper = createStubScraper("University of Copenhagen");
export const aarhusScraper = createStubScraper("Aarhus University");
export const dtuScraper = createStubScraper("Technical University of Denmark");
export const lundScraper = createStubScraper("Lund University");
export const chalmersScraper = createStubScraper("Chalmers University of Technology");
export const gothenburgScraper = createStubScraper("University of Gothenburg");
export const helsinkiScraper = createStubScraper("University of Helsinki");
export const aaltoScraper = createStubScraper("Aalto University");

// ── International: Germany ───────────────────────────────────────────────
export const tumScraper = createStubScraper("Technical University of Munich");
export const lmuScraper = createStubScraper("Ludwig Maximilian University of Munich");
export const rwthScraper = createStubScraper("RWTH Aachen University");
export const ufreiburgScraper = createStubScraper("University of Freiburg");
export const ubonnScraper = createStubScraper("University of Bonn");
export const ucologneScraper = createStubScraper("University of Cologne");
export const utubingenScraper = createStubScraper("University of Tübingen");
export const heidelbergScraper = createStubScraper("University of Heidelberg");

// ── International: Israel ────────────────────────────────────────────────
export const weizmannScraper = createStubScraper("Weizmann Institute of Science");
export const technionScraper = createStubScraper("Technion – Israel Institute of Technology");

// ── International: Canada ────────────────────────────────────────────────
export const utorontoScraper = createStubScraper("University of Toronto");
export const mcgillScraper = createStubScraper("McGill University");
export const ubcScraper = createStubScraper("University of British Columbia");
export const ucalgaryScraper = createStubScraper("University of Calgary");
export const umanitobaScraper = createStubScraper("University of Manitoba");
export const uvicScraper = createStubScraper("University of Victoria");
export const sfuScraper = createStubScraper("Simon Fraser University");

// ── International: Asia-Pacific ──────────────────────────────────────────
export const umelbourneScraper = createStubScraper("University of Melbourne");
export const monashScraper = createStubScraper("Monash University");
export const usydneyScraper = createStubScraper("University of Sydney");
export const uniquestScraper = createStubScraper("University of Queensland");
export const nusScraper = createStubScraper("National University of Singapore");
export const hkustScraper = createStubScraper("Hong Kong University of Science and Technology");
export const hkuScraper = createStubScraper("University of Hong Kong");
