export type Institution = {
  slug: string;
  name: string;
  city: string;
  ttoName: string;
  website: string;
  specialties: string[];
};

export const INSTITUTIONS: Institution[] = [
  { slug: "stanford", name: "Stanford University", city: "Palo Alto, CA", ttoName: "Stanford OTT", website: "https://ottech.stanford.edu", specialties: ["Oncology", "Neuroscience", "Gene Therapy"] },
  { slug: "mit", name: "MIT", city: "Cambridge, MA", ttoName: "MIT Technology Licensing Office", website: "https://tlo.mit.edu", specialties: ["Bioelectronics", "Drug Delivery", "Immunology"] },
  { slug: "harvard", name: "Harvard University", city: "Boston, MA", ttoName: "Harvard OTD", website: "https://otd.harvard.edu", specialties: ["Oncology", "Gene Editing", "Immunotherapy"] },
  { slug: "jhu", name: "Johns Hopkins University", city: "Baltimore, MD", ttoName: "Johns Hopkins TTO", website: "https://ventures.jhu.edu", specialties: ["Infectious Disease", "Oncology", "Neuroscience"] },
  { slug: "ucsf", name: "University of California San Francisco", city: "San Francisco, CA", ttoName: "UCSF Innovation Ventures", website: "https://inno.ucsf.edu", specialties: ["Oncology", "Rare Disease", "Immunology"] },
  { slug: "duke", name: "Duke University", city: "Durham, NC", ttoName: "Duke OLV", website: "https://olv.duke.edu", specialties: ["Cardiovascular", "Immunotherapy", "mRNA"] },
  { slug: "columbia", name: "Columbia University", city: "New York, NY", ttoName: "Columbia Technology Ventures", website: "https://techventures.columbia.edu", specialties: ["Neuroscience", "Oncology", "Gene Therapy"] },
  { slug: "upenn", name: "University of Pennsylvania", city: "Philadelphia, PA", ttoName: "Penn Center for Innovation", website: "https://pci.upenn.edu", specialties: ["Gene Therapy", "CAR-T", "mRNA"] },
  { slug: "northwestern", name: "Northwestern University", city: "Evanston, IL", ttoName: "Northwestern TTO", website: "https://tto.northwestern.edu", specialties: ["Drug Delivery", "Oncology", "Bioelectronics"] },
  { slug: "cornell", name: "Cornell University", city: "Ithaca, NY", ttoName: "Cornell Center for TT", website: "https://ctt.cornell.edu", specialties: ["Metabolic Disease", "Antimicrobials", "Oncology"] },
  { slug: "ucberkeley", name: "UC Berkeley", city: "Berkeley, CA", ttoName: "UC Berkeley Intellectual Property Office", website: "https://ipira.berkeley.edu", specialties: ["CRISPR", "Synthetic Biology", "Drug Discovery"] },
  { slug: "uwashington", name: "University of Washington", city: "Seattle, WA", ttoName: "UW CoMotion", website: "https://comotion.uw.edu", specialties: ["Neuroscience", "Oncology", "Structural Biology"] },
  { slug: "wustl", name: "Washington University in St. Louis", city: "St. Louis, MO", ttoName: "WashU OTM", website: "https://otm.wustl.edu", specialties: ["Neuroscience", "Metabolic Disease", "Immunology"] },
  { slug: "umich", name: "University of Michigan", city: "Ann Arbor, MI", ttoName: "U-M Tech Transfer", website: "https://techtransfer.umich.edu", specialties: ["Cardiovascular", "Gene Therapy", "Oncology"] },
  { slug: "mayo", name: "Mayo Clinic", city: "Rochester, MN", ttoName: "Mayo Clinic Ventures", website: "https://ventures.mayoclinic.org", specialties: ["Diagnostics", "Oncology", "Rare Disease"] },
  { slug: "scripps", name: "Scripps Research", city: "La Jolla, CA", ttoName: "Scripps Research TTVD", website: "https://www.scripps.edu/science-and-medicine/ttvd", specialties: ["Drug Discovery", "Antibody Engineering", "Oncology"] },
  { slug: "salk", name: "Salk Institute", city: "La Jolla, CA", ttoName: "Salk TTO", website: "https://www.salk.edu/partnerships-commercialization", specialties: ["Gene Regulation", "Oncology", "Aging"] },
  { slug: "mdanderson", name: "MD Anderson Cancer Center", city: "Houston, TX", ttoName: "MD Anderson TTO", website: "https://www.mdanderson.org/research/departments-labs-institutes/programs-centers/technology-commercialization.html", specialties: ["Oncology", "Immunotherapy", "CAR-T"] },
  { slug: "upitt", name: "University of Pittsburgh", city: "Pittsburgh, PA", ttoName: "Pitt Innovation Institute", website: "https://www.innovation.pitt.edu", specialties: ["Regenerative Medicine", "Oncology", "Organ Transplant"] },
  { slug: "uchicago", name: "University of Chicago", city: "Chicago, IL", ttoName: "UChicago Polsky Center", website: "https://polsky.uchicago.edu/programs-and-services/george-shultz-innovation-fund", specialties: ["Immunology", "Drug Delivery", "Oncology"] },
  { slug: "yale", name: "Yale University", city: "New Haven, CT", ttoName: "Yale OCS", website: "https://ocr.yale.edu", specialties: ["Oncology", "Immunotherapy", "Structural Biology"] },
  { slug: "vanderbilt", name: "Vanderbilt University", city: "Nashville, TN", ttoName: "Vanderbilt Center for Technology Transfer", website: "https://ctt.vanderbilt.edu", specialties: ["Small Molecules", "Metabolic Disease", "Infectious Disease"] },
  { slug: "emory", name: "Emory University", city: "Atlanta, GA", ttoName: "Emory OTT", website: "https://ott.emory.edu", specialties: ["Infectious Disease", "Neuroscience", "Vaccines"] },
  { slug: "bu", name: "Boston University", city: "Boston, MA", ttoName: "BU Technology Development", website: "https://www.bu.edu/otd", specialties: ["Oncology", "Drug Delivery", "Rare Disease"] },
  { slug: "georgetown", name: "Georgetown University", city: "Washington, DC", ttoName: "Georgetown OTL", website: "https://otl.georgetown.edu", specialties: ["Oncology", "Immunology", "Small Molecules"] },
  { slug: "utexas", name: "University of Texas", city: "Austin, TX", ttoName: "UT Office of Technology Commercialization", website: "https://research.utexas.edu/otc", specialties: ["Oncology", "Gene Therapy", "Bioelectronics"] },
  { slug: "cwru", name: "Case Western Reserve University", city: "Cleveland, OH", ttoName: "CWRU TTO", website: "https://research.case.edu/tto", specialties: ["Orthopedics", "Neuroscience", "Biomaterials"] },
  { slug: "ucolorado", name: "University of Colorado", city: "Aurora, CO", ttoName: "CU Innovations", website: "https://innovations.cu.edu", specialties: ["Oncology", "Respiratory", "Rare Disease"] },
  { slug: "princeton", name: "Princeton University", city: "Princeton, NJ", ttoName: "Princeton OTL", website: "https://puotl.technologypublisher.com", specialties: ["Drug Discovery", "Materials Science", "Neuroscience"] },
  { slug: "ucla", name: "UCLA", city: "Los Angeles, CA", ttoName: "UCLA Technology Development Group", website: "https://ucla.technologypublisher.com", specialties: ["Oncology", "Stem Cells", "Immunotherapy"] },
  { slug: "brown", name: "Brown University", city: "Providence, RI", ttoName: "Brown Technology Innovations", website: "https://brown.technologypublisher.com", specialties: ["Neuroscience", "Drug Delivery", "Biomaterials"] },
  { slug: "rochester", name: "University of Rochester", city: "Rochester, NY", ttoName: "UR Ventures", website: "https://rochester.technologypublisher.com", specialties: ["Oncology", "Optics", "Drug Delivery"] },
  { slug: "tufts", name: "Tufts University", city: "Medford, MA", ttoName: "Tufts Technology Services", website: "https://tufts.technologypublisher.com", specialties: ["Drug Delivery", "Biomaterials", "Infectious Disease"] },
  { slug: "uthealth", name: "UT Health", city: "Houston, TX", ttoName: "UT Health Office of Technology Management", website: "https://uthealth.technologypublisher.com", specialties: ["Oncology", "Cardiovascular", "Diagnostics"] },
  { slug: "coloradostate", name: "Colorado State University", city: "Fort Collins, CO", ttoName: "CSU Ventures", website: "https://csuventures.technologypublisher.com", specialties: ["Infectious Disease", "Drug Delivery", "Agricultural Biotech"] },
  { slug: "virginiatech", name: "Virginia Tech", city: "Blacksburg, VA", ttoName: "Virginia Tech Intellectual Properties", website: "https://vtip.technologypublisher.com", specialties: ["Biosensors", "Drug Delivery", "Oncology"] },
  { slug: "usf", name: "University of South Florida", city: "Tampa, FL", ttoName: "USF Technology Transfer", website: "https://usf.technologypublisher.com", specialties: ["Oncology", "Neuroscience", "Infectious Disease"] },
  { slug: "waynestate", name: "Wayne State University", city: "Detroit, MI", ttoName: "Wayne State Tech Transfer", website: "https://wayne.technologypublisher.com", specialties: ["Oncology", "Drug Discovery", "Rare Disease"] },
  { slug: "utdallas", name: "UT Dallas", city: "Richardson, TX", ttoName: "UT Dallas Technology Commercialization", website: "https://utdallas.technologypublisher.com", specialties: ["Bioelectronics", "Neuroscience", "Drug Delivery"] },
  { slug: "msstate", name: "Mississippi State University", city: "Starkville, MS", ttoName: "MSU Technology Management", website: "https://msstate-innovations.technologypublisher.com", specialties: ["Agricultural Biotech", "Diagnostics", "Biosensors"] },
  { slug: "utoledo", name: "University of Toledo", city: "Toledo, OH", ttoName: "UT Technology Transfer", website: "https://utoledo.technologypublisher.com", specialties: ["Drug Discovery", "Oncology", "Metabolic Disease"] },
  { slug: "njit", name: "New Jersey Institute of Technology", city: "Newark, NJ", ttoName: "NJIT Technology Transfer", website: "https://njit.technologypublisher.com", specialties: ["Biomaterials", "Drug Delivery", "Biosensors"] },
  { slug: "calpoly", name: "Cal Poly San Luis Obispo", city: "San Luis Obispo, CA", ttoName: "Cal Poly Technology Transfer", website: "https://calpoly.technologypublisher.com", specialties: ["Agricultural Biotech", "Biosensors", "Drug Delivery"] },
  { slug: "slu", name: "Saint Louis University", city: "St. Louis, MO", ttoName: "SLU Technology Management", website: "https://slu.technologypublisher.com", specialties: ["Oncology", "Infectious Disease", "Drug Discovery"] },
  { slug: "ucdavis", name: "UC Davis", city: "Davis, CA", ttoName: "UC Davis InnovationAccess", website: "https://ucdavis.technologypublisher.com", specialties: ["Agricultural Biotech", "Oncology", "Regenerative Medicine"] },
  { slug: "utah", name: "University of Utah", city: "Salt Lake City, UT", ttoName: "University of Utah Technology Licensing Office", website: "https://utah.technologypublisher.com", specialties: ["Drug Delivery", "Bioelectronics", "Oncology"] },
  { slug: "uva", name: "University of Virginia", city: "Charlottesville, VA", ttoName: "UVA Licensing & Ventures Group", website: "https://uva.technologypublisher.com", specialties: ["Oncology", "Neuroscience", "Drug Discovery"] },
  { slug: "uoregon", name: "University of Oregon", city: "Eugene, OR", ttoName: "UO Office for Research", website: "https://uoregon.technologypublisher.com", specialties: ["Neuroscience", "Drug Discovery", "Biomaterials"] },
  { slug: "gwu", name: "George Washington University", city: "Washington, DC", ttoName: "GWU Office of Technology Transfer", website: "https://gwu.technologypublisher.com", specialties: ["Oncology", "Infectious Disease", "Diagnostics"] },
  { slug: "czbiohub", name: "CZ Biohub", city: "San Francisco, CA", ttoName: "CZ Biohub Technology Transfer", website: "https://czbiohub.technologypublisher.com", specialties: ["CRISPR", "Diagnostics", "Infectious Disease"] },
  { slug: "musc", name: "Medical University of South Carolina", city: "Charleston, SC", ttoName: "MUSC Foundation for Research Development", website: "https://musc.technologypublisher.com", specialties: ["Oncology", "Cardiovascular", "Rare Disease"] },
  { slug: "southcarolina", name: "University of South Carolina", city: "Columbia, SC", ttoName: "USC Technology Commercialization Office", website: "https://sc.technologypublisher.com", specialties: ["Drug Delivery", "Biomaterials", "Oncology"] },
  { slug: "lehigh", name: "Lehigh University", city: "Bethlehem, PA", ttoName: "Lehigh Office of Technology Transfer", website: "https://lehighott.technologypublisher.com", specialties: ["Biosensors", "Drug Delivery", "Materials Science"] },
  { slug: "clemson", name: "Clemson University", city: "Clemson, SC", ttoName: "Clemson University Research Foundation", website: "https://curf.technologypublisher.com", specialties: ["Biomaterials", "Agricultural Biotech", "Drug Delivery"] },
  { slug: "iowastate", name: "Iowa State University", city: "Ames, IA", ttoName: "Iowa State University Research Foundation", website: "https://isurftech.technologypublisher.com", specialties: ["Agricultural Biotech", "Drug Delivery", "Biosensors"] },
  { slug: "tgen", name: "Translational Genomics Research Institute", city: "Phoenix, AZ", ttoName: "TGen Technology Transfer", website: "https://tgen.technologypublisher.com", specialties: ["Genomics", "Oncology", "Rare Disease"] },
  { slug: "wsu", name: "Washington State University", city: "Pullman, WA", ttoName: "WSU Office of Commercialization", website: "https://wsu.technologypublisher.com", specialties: ["Agricultural Biotech", "Drug Delivery", "Biosensors"] },
];

export const BLOCKED_SLUGS = new Set([
  "ucsf", "duke", "umich", "mayo", "ucolorado", "columbia",
]);
