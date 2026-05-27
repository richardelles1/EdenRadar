/**
 * TTO Contact Scraper
 * Probes each institution's TTO staff/team page, extracts contacts via
 * email regex + GPT-4o-mini, and upserts into tto_contacts.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

const PROBE_PATHS = [
  "/team",
  "/about/team",
  "/about/our-team",
  "/about/staff",
  "/staff",
  "/people",
  "/about/people",
  "/licensing-team",
  "/our-team",
  "/meet-the-team",
  "/contact/staff",
  "/who-we-are",
  "/contact",
  "/about",
];

const FETCH_TIMEOUT_MS = 10_000;
const EMAIL_RE = /[\w.+'-]+@[\w.-]+\.[a-z]{2,}/gi;

export interface TtoSeed {
  institution: string;
  ttoUrl: string;
  staffPageUrl?: string; // skip probe if provided
}

export interface TtoContact {
  institution: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  tto_url?: string;
  source: string;
}

// ── Institution → TTO URL seed ────────────────────────────────────────────────
export const TTO_SEEDS: TtoSeed[] = [
  // ── US Elite ─────────────────────────────────────────────────────────────
  { institution: "Stanford University", ttoUrl: "https://otl.stanford.edu", staffPageUrl: "https://otl.stanford.edu/about/meet-the-staff" },
  { institution: "MIT", ttoUrl: "https://tlo.mit.edu", staffPageUrl: "https://tlo.mit.edu/about/staff" },
  { institution: "Harvard University", ttoUrl: "https://otd.harvard.edu", staffPageUrl: "https://otd.harvard.edu/about/our-team" },
  { institution: "Johns Hopkins University", ttoUrl: "https://ventures.jhu.edu", staffPageUrl: "https://ventures.jhu.edu/about/our-team/" },
  { institution: "Duke University", ttoUrl: "https://otc.duke.edu", staffPageUrl: "https://otc.duke.edu/about/staff/" },
  { institution: "Columbia University", ttoUrl: "https://techventures.columbia.edu", staffPageUrl: "https://techventures.columbia.edu/about/our-team/" },
  { institution: "University of Pennsylvania", ttoUrl: "https://pci.upenn.edu", staffPageUrl: "https://pci.upenn.edu/about/team/" },
  { institution: "Northwestern University", ttoUrl: "https://www.invo.northwestern.edu", staffPageUrl: "https://www.invo.northwestern.edu/about/team/" },
  { institution: "Cornell University", ttoUrl: "https://www.research.cornell.edu/tto", staffPageUrl: "https://www.research.cornell.edu/tto/about/staff" },
  { institution: "UC Berkeley", ttoUrl: "https://ipira.berkeley.edu", staffPageUrl: "https://ipira.berkeley.edu/about/staff" },
  { institution: "UC San Diego", ttoUrl: "https://innovation.ucsd.edu", staffPageUrl: "https://innovation.ucsd.edu/about/our-team/" },
  { institution: "University of Washington", ttoUrl: "https://techtransfer.uw.edu", staffPageUrl: "https://techtransfer.uw.edu/about/staff/" },
  { institution: "Yale University", ttoUrl: "https://ventures.yale.edu", staffPageUrl: "https://ventures.yale.edu/about/team/" },
  { institution: "Princeton University", ttoUrl: "https://research.princeton.edu/ott", staffPageUrl: "https://research.princeton.edu/ott/about/staff" },
  { institution: "University of Michigan", ttoUrl: "https://techtransfer.umich.edu", staffPageUrl: "https://techtransfer.umich.edu/about/our-people/" },
  { institution: "University of Minnesota", ttoUrl: "https://license.umn.edu", staffPageUrl: "https://license.umn.edu/about/staff" },
  { institution: "Ohio State University", ttoUrl: "https://innovate.osu.edu", staffPageUrl: "https://innovate.osu.edu/about/team" },
  { institution: "Purdue University", ttoUrl: "https://licensing.prf.org", staffPageUrl: "https://licensing.prf.org/about/staff/" },
  { institution: "University of Illinois", ttoUrl: "https://otm.illinois.edu", staffPageUrl: "https://otm.illinois.edu/about/staff" },
  { institution: "Washington University in St. Louis", ttoUrl: "https://tech.wustl.edu", staffPageUrl: "https://tech.wustl.edu/about/our-team/" },
  // ── US Top-50 ────────────────────────────────────────────────────────────
  { institution: "UNC Chapel Hill", ttoUrl: "https://techtransfer.unc.edu", staffPageUrl: "https://techtransfer.unc.edu/about/staff/" },
  { institution: "Emory University", ttoUrl: "https://techtransfer.emory.edu", staffPageUrl: "https://techtransfer.emory.edu/about/staff.html" },
  { institution: "Georgetown University", ttoUrl: "https://universityresearch.georgetown.edu/tto", staffPageUrl: "https://universityresearch.georgetown.edu/tto/team/" },
  { institution: "Georgia Institute of Technology", ttoUrl: "https://licensing.research.gatech.edu", staffPageUrl: "https://licensing.research.gatech.edu/about/team" },
  { institution: "Case Western Reserve University", ttoUrl: "https://research.case.edu/techtransfer", staffPageUrl: "https://research.case.edu/techtransfer/about/staff/" },
  { institution: "University of Texas", ttoUrl: "https://research.utexas.edu/ott", staffPageUrl: "https://research.utexas.edu/ott/about/staff/" },
  { institution: "NYU Langone", ttoUrl: "https://med.nyu.edu/research/technology-ventures", staffPageUrl: "https://med.nyu.edu/research/technology-ventures/about/team" },
  { institution: "University of Chicago", ttoUrl: "https://techtransfer.uchicago.edu", staffPageUrl: "https://techtransfer.uchicago.edu/about/team/" },
  { institution: "Brown University", ttoUrl: "https://www.brown.edu/research/tto", staffPageUrl: "https://www.brown.edu/research/tto/about/staff" },
  { institution: "Boston University", ttoUrl: "https://www.bu.edu/techtransfer", staffPageUrl: "https://www.bu.edu/techtransfer/about/staff/" },
  { institution: "Vanderbilt University", ttoUrl: "https://cttc.vanderbilt.edu", staffPageUrl: "https://cttc.vanderbilt.edu/about/staff/" },
  { institution: "University of Pittsburgh", ttoUrl: "https://innovation.pitt.edu", staffPageUrl: "https://innovation.pitt.edu/about/team/" },
  { institution: "Penn State University", ttoUrl: "https://research.psu.edu/tlt", staffPageUrl: "https://research.psu.edu/tlt/staff" },
  { institution: "Indiana University", ttoUrl: "https://research.iu.edu/commercialization", staffPageUrl: "https://research.iu.edu/commercialization/about/staff.html" },
  { institution: "Iowa State University", ttoUrl: "https://www.techtransfer.iastate.edu", staffPageUrl: "https://www.techtransfer.iastate.edu/about/staff/" },
  { institution: "Rutgers University", ttoUrl: "https://techtransfer.rutgers.edu", staffPageUrl: "https://techtransfer.rutgers.edu/about/staff" },
  { institution: "University of Maryland (UMVentures)", ttoUrl: "https://ventures.umd.edu", staffPageUrl: "https://ventures.umd.edu/about/team/" },
  { institution: "University of Virginia", ttoUrl: "https://tto.virginia.edu", staffPageUrl: "https://tto.virginia.edu/about/staff/" },
  { institution: "Virginia Tech", ttoUrl: "https://vtip.org", staffPageUrl: "https://vtip.org/about/team/" },
  { institution: "NC State University", ttoUrl: "https://research.ncsu.edu/techtransfer", staffPageUrl: "https://research.ncsu.edu/techtransfer/about/staff/" },
  { institution: "Tulane University", ttoUrl: "https://tulane.edu/research/tto", staffPageUrl: "https://tulane.edu/research/tto/staff" },
  { institution: "Rice University", ttoUrl: "https://research.rice.edu/tto", staffPageUrl: "https://research.rice.edu/tto/about/team" },
  { institution: "Tufts University", ttoUrl: "https://research.tufts.edu/tto", staffPageUrl: "https://research.tufts.edu/tto/about/team/" },
  { institution: "University of Rochester", ttoUrl: "https://www.rochester.edu/techtransfer", staffPageUrl: "https://www.rochester.edu/techtransfer/about/staff.html" },
  { institution: "University of Notre Dame", ttoUrl: "https://innovation.nd.edu", staffPageUrl: "https://innovation.nd.edu/about/staff/" },
  { institution: "University of Arizona", ttoUrl: "https://techlaunch.arizona.edu", staffPageUrl: "https://techlaunch.arizona.edu/about/team" },
  { institution: "University of Colorado", ttoUrl: "https://technologytransfer.cu.edu", staffPageUrl: "https://technologytransfer.cu.edu/about/staff/" },
  { institution: "University of Florida", ttoUrl: "https://techtransfer.ufl.edu", staffPageUrl: "https://techtransfer.ufl.edu/about/staff/" },
  { institution: "University of Utah", ttoUrl: "https://tco.utah.edu", staffPageUrl: "https://tco.utah.edu/about/team/" },
  { institution: "Dartmouth College", ttoUrl: "https://tto.dartmouth.edu", staffPageUrl: "https://tto.dartmouth.edu/about/staff" },
  { institution: "University of Iowa", ttoUrl: "https://research.uiowa.edu/techtransfer", staffPageUrl: "https://research.uiowa.edu/techtransfer/about/staff" },
  { institution: "University of Kansas", ttoUrl: "https://kucr.ku.edu", staffPageUrl: "https://kucr.ku.edu/tto/staff" },
  { institution: "University of Kentucky", ttoUrl: "https://research.uky.edu/tto", staffPageUrl: "https://research.uky.edu/tto/staff/" },
  { institution: "University of Connecticut", ttoUrl: "https://tto.uconn.edu", staffPageUrl: "https://tto.uconn.edu/about/staff/" },
  { institution: "University of Nebraska Medical Center (UNEMED)", ttoUrl: "https://unmc.edu/bmi/tto", staffPageUrl: "https://unmc.edu/bmi/tto/about/staff.html" },
  { institution: "University of Alabama at Birmingham", ttoUrl: "https://www.uab.edu/research/tto", staffPageUrl: "https://www.uab.edu/research/tto/about/staff" },
  { institution: "University of Tennessee", ttoUrl: "https://research.utk.edu/oris/tto", staffPageUrl: "https://research.utk.edu/oris/tto/about/staff" },
  { institution: "University of South Florida", ttoUrl: "https://www.usf.edu/innovation", staffPageUrl: "https://www.usf.edu/innovation/about/team.aspx" },
  { institution: "University of Cincinnati", ttoUrl: "https://research.uc.edu/tto", staffPageUrl: "https://research.uc.edu/tto/about/staff" },
  { institution: "Stony Brook University", ttoUrl: "https://www.stonybrook.edu/research/ott", staffPageUrl: "https://www.stonybrook.edu/research/ott/about/staff.shtml" },
  { institution: "Temple University", ttoUrl: "https://research.temple.edu/tto", staffPageUrl: "https://research.temple.edu/tto/about/staff" },
  { institution: "University of Delaware", ttoUrl: "https://www.udel.edu/research/tto", staffPageUrl: "https://www.udel.edu/research/tto/about/team/" },
  { institution: "University of Houston", ttoUrl: "https://uh.edu/research/tto", staffPageUrl: "https://uh.edu/research/tto/about/staff/" },
  { institution: "University of Missouri – Kansas City (UMKC)", ttoUrl: "https://www.umkc.edu/research/tto", staffPageUrl: "https://www.umkc.edu/research/tto/staff.html" },
  { institution: "University of Vermont", ttoUrl: "https://www.uvm.edu/research/tto", staffPageUrl: "https://www.uvm.edu/research/tto/staff" },
  { institution: "University of New Mexico", ttoUrl: "https://research.unm.edu/tto", staffPageUrl: "https://research.unm.edu/tto/about/staff.html" },
  { institution: "University of Miami", ttoUrl: "https://miami.edu/research/tto", staffPageUrl: "https://miami.edu/research/tto/about/team/" },
  { institution: "University of South Carolina", ttoUrl: "https://sc.edu/research/tto", staffPageUrl: "https://sc.edu/research/tto/about/staff.php" },
  { institution: "Wayne State University", ttoUrl: "https://research.wayne.edu/tto", staffPageUrl: "https://research.wayne.edu/tto/about/staff" },
  { institution: "University of Louisville", ttoUrl: "https://louisville.edu/research/tto", staffPageUrl: "https://louisville.edu/research/tto/staff" },
  { institution: "University of Oregon", ttoUrl: "https://research.uoregon.edu/tto", staffPageUrl: "https://research.uoregon.edu/tto/staff" },
  { institution: "Northeastern University", ttoUrl: "https://research.northeastern.edu/tto", staffPageUrl: "https://research.northeastern.edu/tto/about/team/" },
  { institution: "Carnegie Mellon University", ttoUrl: "https://www.cmu.edu/tto", staffPageUrl: "https://www.cmu.edu/tto/about/staff.html" },
  { institution: "University of Southern California", ttoUrl: "https://stevens.usc.edu/research/tto", staffPageUrl: "https://stevens.usc.edu/research/tto/team/" },
  { institution: "Drexel University", ttoUrl: "https://drexel.edu/research/tto", staffPageUrl: "https://drexel.edu/research/tto/about/staff/" },
  // ── US Medical/Research Centers ───────────────────────────────────────────
  { institution: "Mayo Clinic", ttoUrl: "https://www.mayo.edu/research/technology-transfer", staffPageUrl: "https://www.mayo.edu/research/technology-transfer/about/staff" },
  { institution: "Cleveland Clinic", ttoUrl: "https://clevelandclinic.org/innovations", staffPageUrl: "https://clevelandclinic.org/innovations/contact" },
  { institution: "Mass General Brigham", ttoUrl: "https://mgb.org/research/partnering-with-us", staffPageUrl: "https://www.massgeneralbrigham.org/en/research-and-innovation/industry-partnerships/contact-us" },
  { institution: "Memorial Sloan Kettering Cancer Center", ttoUrl: "https://www.mskcc.org/about/innovative-collaborations/tto", staffPageUrl: "https://www.mskcc.org/about/innovative-collaborations/tto/contact-us" },
  { institution: "MD Anderson Cancer Center", ttoUrl: "https://www.mdanderson.org/research/departments-labs-institutes/programs-centers/tto.html", staffPageUrl: "https://www.mdanderson.org/research/departments-labs-institutes/programs-centers/tto/contact-us.html" },
  { institution: "Dana-Farber Cancer Institute", ttoUrl: "https://www.dfci.harvard.edu/innovation", staffPageUrl: "https://www.dfci.harvard.edu/innovation/contact-us/" },
  { institution: "Scripps Research", ttoUrl: "https://www.scripps.edu/science-and-medicine/research-services/technology-transfer", staffPageUrl: "https://www.scripps.edu/science-and-medicine/research-services/technology-transfer/contact-us/" },
  { institution: "Salk Institute for Biological Studies", ttoUrl: "https://www.salk.edu/research/resources/licensing", staffPageUrl: "https://www.salk.edu/research/resources/licensing/contact/" },
  { institution: "Fred Hutchinson Cancer Center", ttoUrl: "https://www.fredhutch.org/en/research/core-facilities/administration/technology-transfer.html", staffPageUrl: "https://www.fredhutch.org/en/research/core-facilities/administration/technology-transfer/contact-us.html" },
  { institution: "Children's Hospital of Philadelphia", ttoUrl: "https://www.chop.edu/research/technology-transfer", staffPageUrl: "https://www.chop.edu/research/technology-transfer/contact-us" },
  { institution: "Boston Children's Hospital", ttoUrl: "https://www.childrenshospital.org/research/technology-licensing", staffPageUrl: "https://www.childrenshospital.org/research/technology-licensing/contact-us" },
  { institution: "Icahn School of Medicine at Mount Sinai", ttoUrl: "https://innovation.icahn.mssm.edu", staffPageUrl: "https://innovation.icahn.mssm.edu/about/team" },
  { institution: "Gladstone Institutes", ttoUrl: "https://gladstone.org/research/tto", staffPageUrl: "https://gladstone.org/research/tto/contact" },
  { institution: "The Hospital for Sick Children (SickKids)", ttoUrl: "https://www.sickkidsinnovation.com", staffPageUrl: "https://www.sickkidsinnovation.com/about/team" },
  { institution: "St. Jude Children's Research Hospital", ttoUrl: "https://www.stjude.org/research/tto.html", staffPageUrl: "https://www.stjude.org/research/tto/contact.html" },
  { institution: "Roswell Park Comprehensive Cancer Center", ttoUrl: "https://www.roswellpark.org/research/tto", staffPageUrl: "https://www.roswellpark.org/research/tto/contact" },
  { institution: "Houston Methodist Research Institute", ttoUrl: "https://www.houstonmethodist.org/research/research-areas/tto", staffPageUrl: "https://www.houstonmethodist.org/research/research-areas/tto/contact/" },
  // ── US National Labs ──────────────────────────────────────────────────────
  { institution: "NIH Office of Technology Transfer", ttoUrl: "https://techtransfer.nih.gov", staffPageUrl: "https://techtransfer.nih.gov/about/staff" },
  { institution: "NCI Technology Transfer Center", ttoUrl: "https://techtransfer.cancer.gov", staffPageUrl: "https://techtransfer.cancer.gov/about/staff" },
  { institution: "Argonne National Laboratory", ttoUrl: "https://www.anl.gov/partnerships", staffPageUrl: "https://www.anl.gov/partnerships/about/staff" },
  { institution: "Brookhaven National Laboratory", ttoUrl: "https://www.bnl.gov/techtransfer", staffPageUrl: "https://www.bnl.gov/techtransfer/about.php" },
  { institution: "Lawrence Berkeley National Laboratory", ttoUrl: "https://tt.lbl.gov", staffPageUrl: "https://tt.lbl.gov/about/staff/" },
  { institution: "Lawrence Livermore National Laboratory", ttoUrl: "https://www.llnl.gov/partnerships/technology-transfer", staffPageUrl: "https://www.llnl.gov/partnerships/technology-transfer/contact-us" },
  { institution: "Los Alamos National Laboratory", ttoUrl: "https://www.lanl.gov/business/tto", staffPageUrl: "https://www.lanl.gov/business/tto/contact.shtml" },
  { institution: "Oak Ridge National Laboratory", ttoUrl: "https://www.ornl.gov/content/technology-transfer", staffPageUrl: "https://www.ornl.gov/content/technology-transfer/contact-us" },
  { institution: "Pacific Northwest National Laboratory", ttoUrl: "https://www.pnnl.gov/available-technologies", staffPageUrl: "https://www.pnnl.gov/technology-licensing/contact-licensing-staff" },
  { institution: "Sandia National Laboratories", ttoUrl: "https://ip.sandia.gov", staffPageUrl: "https://ip.sandia.gov/contact.php" },
  { institution: "National Renewable Energy Laboratory", ttoUrl: "https://www.nrel.gov/about/technology-transfer.html", staffPageUrl: "https://www.nrel.gov/about/technology-transfer.html" },
  { institution: "Idaho National Laboratory", ttoUrl: "https://www.inl.gov/inl-initiatives/technology-deployment", staffPageUrl: "https://www.inl.gov/inl-initiatives/technology-deployment/contact-us/" },
  // ── UK ────────────────────────────────────────────────────────────────────
  { institution: "University of Cambridge", ttoUrl: "https://www.enterprise.cam.ac.uk", staffPageUrl: "https://www.enterprise.cam.ac.uk/about-us/team/" },
  { institution: "Oxford University Innovation", ttoUrl: "https://innovation.ox.ac.uk", staffPageUrl: "https://innovation.ox.ac.uk/about-us/our-team/" },
  { institution: "Imperial College London", ttoUrl: "https://www.imperialinnovations.co.uk", staffPageUrl: "https://www.imperialinnovations.co.uk/about/team/" },
  { institution: "University of Manchester", ttoUrl: "https://www.uominnovations.manchester.ac.uk", staffPageUrl: "https://www.uominnovations.manchester.ac.uk/about/team/" },
  { institution: "Edinburgh Innovations", ttoUrl: "https://edinburgh-innovations.ed.ac.uk", staffPageUrl: "https://edinburgh-innovations.ed.ac.uk/about/our-team/" },
  { institution: "University of Birmingham", ttoUrl: "https://www.birmingham.ac.uk/research/innovation", staffPageUrl: "https://www.birmingham.ac.uk/research/innovation/about/team" },
  { institution: "University of Sheffield", ttoUrl: "https://www.sheffield.ac.uk/innovation", staffPageUrl: "https://www.sheffield.ac.uk/innovation/about/team" },
  { institution: "University of Dundee", ttoUrl: "https://www.dundee.ac.uk/research/commercialisation", staffPageUrl: "https://www.dundee.ac.uk/research/commercialisation/team" },
  { institution: "University of Cardiff", ttoUrl: "https://www.cardiff.ac.uk/innovation", staffPageUrl: "https://www.cardiff.ac.uk/innovation/about/team" },
  { institution: "University of Warwick", ttoUrl: "https://warwick.ac.uk/research/commercialisation", staffPageUrl: "https://warwick.ac.uk/research/commercialisation/about/team" },
  { institution: "University of Nottingham", ttoUrl: "https://www.nottingham.ac.uk/research/business/index.aspx", staffPageUrl: "https://www.nottingham.ac.uk/research/business/team.aspx" },
  { institution: "University of Bristol", ttoUrl: "https://www.bristol.ac.uk/research/enterprise", staffPageUrl: "https://www.bristol.ac.uk/research/enterprise/about/team/" },
  { institution: "University of Leeds", ttoUrl: "https://www.leeds.ac.uk/research/enterprise", staffPageUrl: "https://www.leeds.ac.uk/research/enterprise/about/team" },
  { institution: "University of Glasgow", ttoUrl: "https://www.glasgowresearch.com", staffPageUrl: "https://www.glasgowresearch.com/about/team" },
  { institution: "King's College London", ttoUrl: "https://www.kcl.ac.uk/research/support/industry/tech-transfer", staffPageUrl: "https://www.kcl.ac.uk/research/support/industry/tech-transfer/team" },
  { institution: "Queen Mary University of London", ttoUrl: "https://www.qmul.ac.uk/builtenv/research/enterprise", staffPageUrl: "https://www.qmul.ac.uk/innovation/about/team" },
  { institution: "Cancer Research Horizons", ttoUrl: "https://www.cancerresearchhorizons.com", staffPageUrl: "https://www.cancerresearchhorizons.com/about-us/our-team/" },
  { institution: "LifeArc", ttoUrl: "https://www.lifearc.org", staffPageUrl: "https://www.lifearc.org/about-us/our-people/" },
  // ── Europe ────────────────────────────────────────────────────────────────
  { institution: "ETH Zurich", ttoUrl: "https://ethz.ch/en/industry/transfer.html", staffPageUrl: "https://ethz.ch/en/industry/transfer/team.html" },
  { institution: "EPFL", ttoUrl: "https://tto.epfl.ch", staffPageUrl: "https://tto.epfl.ch/about/team/" },
  { institution: "Max Planck Innovation", ttoUrl: "https://www.max-planck-innovation.com", staffPageUrl: "https://www.max-planck-innovation.com/about/team/" },
  { institution: "Inserm Transfert", ttoUrl: "https://www.inserm-transfert.fr", staffPageUrl: "https://www.inserm-transfert.fr/en/about-us/team/" },
  { institution: "Institut Curie", ttoUrl: "https://www.curie.fr/en/technology-transfer", staffPageUrl: "https://www.curie.fr/en/technology-transfer/contact" },
  { institution: "CERN Knowledge Transfer", ttoUrl: "https://kt.cern", staffPageUrl: "https://kt.cern/about/team" },
  { institution: "EMBLEM Technology Transfer (EMBL)", ttoUrl: "https://www.embl.org/about/info/tech-transfer", staffPageUrl: "https://www.embl.org/about/info/tech-transfer/about-us/" },
  { institution: "ICGEB", ttoUrl: "https://www.icgeb.org/research/technology-transfer", staffPageUrl: "https://www.icgeb.org/research/technology-transfer/contacts/" },
  { institution: "Ludwig Maximilian University of Munich", ttoUrl: "https://www.lmu.de/en/research/transfer-and-innovation", staffPageUrl: "https://www.lmu.de/en/research/transfer-and-innovation/contact/" },
  { institution: "RWTH Aachen University", ttoUrl: "https://www.rwth-aachen.de/cms/root/Forschung/Transfer", staffPageUrl: "https://www.rwth-aachen.de/cms/root/Forschung/Transfer/team" },
  { institution: "NTNU", ttoUrl: "https://www.ntnu.edu/research/technology-transfer", staffPageUrl: "https://www.ntnu.edu/research/technology-transfer/contact" },
  { institution: "University of Helsinki", ttoUrl: "https://www.helsinki.fi/en/research/technology-transfer", staffPageUrl: "https://www.helsinki.fi/en/research/technology-transfer/contact" },
  { institution: "Trinity College Dublin", ttoUrl: "https://www.tcd.ie/innovation", staffPageUrl: "https://www.tcd.ie/innovation/about/our-team/" },
  { institution: "University of Galway", ttoUrl: "https://www.universityofgalway.ie/research/enterprise", staffPageUrl: "https://www.universityofgalway.ie/research/enterprise/team/" },
  { institution: "Université Libre de Bruxelles", ttoUrl: "https://www.ulb.be/en/research/tto", staffPageUrl: "https://www.ulb.be/en/research/tto/team" },
  { institution: "Research Luxembourg", ttoUrl: "https://www.researchluxembourg.org", staffPageUrl: "https://www.researchluxembourg.org/en/about/team/" },
  // ── Canada ────────────────────────────────────────────────────────────────
  { institution: "University of Toronto", ttoUrl: "https://innovations.utoronto.ca", staffPageUrl: "https://innovations.utoronto.ca/about/team/" },
  { institution: "University of British Columbia", ttoUrl: "https://uilo.ubc.ca", staffPageUrl: "https://uilo.ubc.ca/about/people" },
  { institution: "University of Waterloo", ttoUrl: "https://uwaterloo.ca/research/tto", staffPageUrl: "https://uwaterloo.ca/research/tto/about/staff" },
  { institution: "McGill University", ttoUrl: "https://mcgill.ca/tto", staffPageUrl: "https://mcgill.ca/tto/about/team/" },
  { institution: "McMaster University", ttoUrl: "https://research.mcmaster.ca/commercialization", staffPageUrl: "https://research.mcmaster.ca/commercialization/about/team" },
  { institution: "University of Calgary", ttoUrl: "https://www.ucalgary.ca/research/industry-engagement/tto", staffPageUrl: "https://www.ucalgary.ca/research/industry-engagement/tto/team" },
  { institution: "University of Ottawa", ttoUrl: "https://tech.uottawa.ca", staffPageUrl: "https://tech.uottawa.ca/about/team" },
  { institution: "University of Alberta", ttoUrl: "https://www.ualberta.ca/research/tto", staffPageUrl: "https://www.ualberta.ca/research/tto/about/staff.html" },
  { institution: "Dalhousie University", ttoUrl: "https://www.dal.ca/research/industry-liaison", staffPageUrl: "https://www.dal.ca/research/industry-liaison/about/team.html" },
  { institution: "University Health Network (Toronto)", ttoUrl: "https://www.uhnresearch.ca/partnerships/tto", staffPageUrl: "https://www.uhnresearch.ca/partnerships/tto/contact" },
  { institution: "Queen's University", ttoUrl: "https://www.queensu.ca/partnerships/tto", staffPageUrl: "https://www.queensu.ca/partnerships/tto/team" },
  { institution: "Western University", ttoUrl: "https://www.uwo.ca/research/tto", staffPageUrl: "https://www.uwo.ca/research/tto/about/staff.html" },
  { institution: "University of Victoria", ttoUrl: "https://www.uvic.ca/research/industry/tto", staffPageUrl: "https://www.uvic.ca/research/industry/tto/team.php" },
  { institution: "University of Saskatchewan", ttoUrl: "https://usask.ca/research/tto", staffPageUrl: "https://research.usask.ca/industry-and-community/tto/staff.php" },
  { institution: "University of Manitoba", ttoUrl: "https://umanitoba.ca/research/tto", staffPageUrl: "https://umanitoba.ca/research/tto/staff.html" },
  // ── Asia-Pacific ──────────────────────────────────────────────────────────
  { institution: "Kyoto University (TLO)", ttoUrl: "https://www.tlo-kyoto.co.jp", staffPageUrl: "https://www.tlo-kyoto.co.jp/about/staff" },
  { institution: "National University of Singapore", ttoUrl: "https://enterprise.nus.edu.sg", staffPageUrl: "https://enterprise.nus.edu.sg/about-us/team/" },
  { institution: "CSIRO", ttoUrl: "https://www.csiro.au/en/work-with-us/licensing", staffPageUrl: "https://www.csiro.au/en/work-with-us/licensing/contact-us" },
  { institution: "Monash University", ttoUrl: "https://www.monash.edu/industry/innovations", staffPageUrl: "https://www.monash.edu/industry/innovations/about/team" },
  { institution: "University of New South Wales", ttoUrl: "https://www.unsw.edu.au/research/engagement/tto", staffPageUrl: "https://www.unsw.edu.au/research/engagement/tto/team" },
  { institution: "Chinese University of Hong Kong (ORKTS)", ttoUrl: "https://www.orkts.cuhk.edu.hk", staffPageUrl: "https://www.orkts.cuhk.edu.hk/about/team/" },
  { institution: "KAIST", ttoUrl: "https://tto.kaist.ac.kr", staffPageUrl: "https://tto.kaist.ac.kr/en/about/team" },
  // ── Israel ────────────────────────────────────────────────────────────────
  { institution: "Yissum (Hebrew University of Jerusalem)", ttoUrl: "https://www.yissum.co.il", staffPageUrl: "https://www.yissum.co.il/about-us/staff/" },
  { institution: "Yeda Research and Development", ttoUrl: "https://www.yeda.org.il", staffPageUrl: "https://www.yeda.org.il/about/staff/" },
];

// ── Core scraping functions ────────────────────────────────────────────────────

async function fetchPage(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: signal
        ? AbortSignal.any([AbortSignal.timeout(FETCH_TIMEOUT_MS), signal])
        : AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

function extractEmails(html: string): string[] {
  const raw = html.match(EMAIL_RE) ?? [];
  return [...new Set(
    raw
      .map(e => e.toLowerCase().trim())
      .filter(e =>
        !e.endsWith(".png") && !e.endsWith(".jpg") && !e.endsWith(".gif") &&
        !e.includes("example.") && !e.includes("youremail") &&
        e.length < 80 && e.includes("@")
      )
  )];
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
}

async function extractContactsWithLLM(
  text: string,
  emails: string[],
  institution: string
): Promise<Omit<TtoContact, "institution" | "source" | "tto_url">[]> {
  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `Extract technology transfer office staff contacts from this web page text for "${institution}".

Known email addresses found on the page: ${emails.slice(0, 20).join(", ") || "none"}

Page text:
${text}

Return a JSON array of contact objects. Each object must have:
- name: full name (required, skip entries without a real name)
- title: job title or role (optional)
- email: email address if identifiable for this person (optional)
- phone: phone number if listed (optional)

Only include people who work in technology transfer, licensing, business development, or commercialization. Skip administrative assistants, receptionists, and general contact info.
Return ONLY the JSON array, no other text.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
      temperature: 0,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "[]";
    const cleaned = raw.startsWith("```") ? raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim() : raw;
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return emails.slice(0, 5).map(email => ({ email }));
  }
}

async function scrapeStaffPage(seed: TtoSeed, signal?: AbortSignal): Promise<TtoContact[]> {
  const urlsToTry = seed.staffPageUrl
    ? [seed.staffPageUrl]
    : PROBE_PATHS.map(p => seed.ttoUrl.replace(/\/$/, "") + p);

  for (const url of urlsToTry) {
    if (signal?.aborted) break;
    const html = await fetchPage(url, signal);
    if (!html || html.length < 500) continue;

    const emails = extractEmails(html);
    const text = htmlToText(html);

    // Only process pages that look like staff/contact pages
    const looksLikeStaffPage =
      emails.length > 0 ||
      /licensing manager|technology transfer|tech transfer|bd manager|business development|commerciali[sz]ation/i.test(text);
    if (!looksLikeStaffPage) continue;

    const contacts = await extractContactsWithLLM(text, emails, seed.institution);
    if (contacts.length > 0) {
      return contacts.map(c => ({
        institution: seed.institution,
        name: c.name ?? "",
        title: c.title,
        email: c.email?.toLowerCase(),
        phone: c.phone,
        tto_url: seed.ttoUrl,
        source: "scraped",
      })).filter(c => c.name.length > 2);
    }
  }
  return [];
}

// ── DB upsert ─────────────────────────────────────────────────────────────────

export async function upsertContacts(contacts: TtoContact[]): Promise<number> {
  let inserted = 0;
  for (const c of contacts) {
    if (!c.name) continue;
    try {
      await db.execute(sql`
        INSERT INTO tto_contacts (institution, name, title, email, phone, tto_url, source)
        VALUES (${c.institution}, ${c.name}, ${c.title ?? null}, ${c.email ?? null},
                ${c.phone ?? null}, ${c.tto_url ?? null}, ${c.source})
        ON CONFLICT (lower(email)) WHERE email IS NOT NULL
        DO UPDATE SET
          name        = EXCLUDED.name,
          title       = COALESCE(EXCLUDED.title, tto_contacts.title),
          phone       = COALESCE(EXCLUDED.phone, tto_contacts.phone),
          tto_url     = COALESCE(EXCLUDED.tto_url, tto_contacts.tto_url),
          updated_at  = CURRENT_TIMESTAMP
      `);
      inserted++;
    } catch {
      // duplicate name-only conflict — skip
    }
  }
  return inserted;
}

// ── Manual insert (for web-search fills) ──────────────────────────────────────

export async function insertManualContact(contact: TtoContact & { verified?: boolean }): Promise<void> {
  await db.execute(sql`
    INSERT INTO tto_contacts (institution, name, title, email, phone, linkedin_url, tto_url, source, verified_at)
    VALUES (
      ${contact.institution}, ${contact.name}, ${contact.title ?? null},
      ${contact.email ?? null}, ${contact.phone ?? null}, ${(contact as any).linkedin_url ?? null},
      ${contact.tto_url ?? null}, ${contact.source},
      ${contact.verified ? sql`CURRENT_TIMESTAMP` : null}
    )
    ON CONFLICT (lower(email)) WHERE email IS NOT NULL
    DO UPDATE SET
      name        = EXCLUDED.name,
      title       = COALESCE(EXCLUDED.title, tto_contacts.title),
      phone       = COALESCE(EXCLUDED.phone, tto_contacts.phone),
      tto_url     = COALESCE(EXCLUDED.tto_url, tto_contacts.tto_url),
      source      = EXCLUDED.source,
      verified_at = COALESCE(EXCLUDED.verified_at, tto_contacts.verified_at),
      updated_at  = CURRENT_TIMESTAMP
  `);
}

// ── Main scrape runner ────────────────────────────────────────────────────────

export interface ScrapeProgress {
  institution: string;
  found: number;
  status: "ok" | "empty" | "error";
  error?: string;
}

export async function runTtoContactScrape(
  seeds: TtoSeed[] = TTO_SEEDS,
  onProgress?: (p: ScrapeProgress) => void,
  signal?: AbortSignal
): Promise<{ total: number; inserted: number; results: ScrapeProgress[] }> {
  const results: ScrapeProgress[] = [];
  let totalInserted = 0;

  for (const seed of seeds) {
    if (signal?.aborted) break;
    try {
      const contacts = await scrapeStaffPage(seed, signal);
      const inserted = contacts.length > 0 ? await upsertContacts(contacts) : 0;
      totalInserted += inserted;
      const p: ScrapeProgress = { institution: seed.institution, found: inserted, status: inserted > 0 ? "ok" : "empty" };
      results.push(p);
      onProgress?.(p);
    } catch (err: any) {
      const p: ScrapeProgress = { institution: seed.institution, found: 0, status: "error", error: err.message };
      results.push(p);
      onProgress?.(p);
    }
  }

  return { total: seeds.length, inserted: totalInserted, results };
}
