/**
 * Maps EdenRadar institution names to their canonical USPTO assignee strings.
 * Covers the top 30 institutions by TTO asset count.
 *
 * Each entry may have multiple candidateNames — the lookup service tries
 * all of them and unions the results, so we don't miss patents filed under
 * an alternate name (e.g. "MIT" vs "Massachusetts Institute of Technology").
 */

export interface AssigneeEntry {
  institution: string;
  candidateNames: string[];
}

export const ASSIGNEE_MAP: AssigneeEntry[] = [
  {
    institution: "Johns Hopkins University",
    candidateNames: ["Johns Hopkins University", "The Johns Hopkins University"],
  },
  {
    institution: "Johns Hopkins",
    candidateNames: ["Johns Hopkins University", "The Johns Hopkins University"],
  },
  {
    institution: "JHU",
    candidateNames: ["Johns Hopkins University", "The Johns Hopkins University"],
  },
  {
    institution: "University of Arizona",
    candidateNames: ["University of Arizona", "Arizona Board of Regents on behalf of the University of Arizona"],
  },
  {
    institution: "Purdue University",
    candidateNames: ["Purdue University", "Purdue Research Foundation"],
  },
  {
    institution: "Purdue",
    candidateNames: ["Purdue University", "Purdue Research Foundation"],
  },
  {
    institution: "University of Wisconsin",
    candidateNames: ["Wisconsin Alumni Research Foundation", "University of Wisconsin-Madison", "University of Wisconsin"],
  },
  {
    institution: "UW Madison",
    candidateNames: ["Wisconsin Alumni Research Foundation", "University of Wisconsin-Madison"],
  },
  {
    institution: "WARF",
    candidateNames: ["Wisconsin Alumni Research Foundation"],
  },
  {
    institution: "UCLA",
    candidateNames: ["University of California Los Angeles", "Regents of the University of California"],
  },
  {
    institution: "Arizona State University",
    candidateNames: ["Arizona State University", "Arizona Board of Regents on behalf of Arizona State University"],
  },
  {
    institution: "Columbia University",
    candidateNames: ["Columbia University", "The Trustees of Columbia University in the City of New York"],
  },
  {
    institution: "Columbia",
    candidateNames: ["Columbia University", "The Trustees of Columbia University in the City of New York"],
  },
  {
    institution: "UC Davis",
    candidateNames: ["University of California Davis", "Regents of the University of California"],
  },
  {
    institution: "University of Pittsburgh",
    candidateNames: ["University of Pittsburgh", "UPMC"],
  },
  {
    institution: "Pittsburgh",
    candidateNames: ["University of Pittsburgh", "UPMC"],
  },
  {
    institution: "Pitt",
    candidateNames: ["University of Pittsburgh"],
  },
  {
    institution: "Cornell University",
    candidateNames: ["Cornell University", "Cornell Research Foundation"],
  },
  {
    institution: "Cornell",
    candidateNames: ["Cornell University", "Cornell Research Foundation"],
  },
  {
    institution: "Stanford University",
    candidateNames: ["The Board of Trustees of the Leland Stanford Junior University", "Stanford University"],
  },
  {
    institution: "Stanford",
    candidateNames: ["The Board of Trustees of the Leland Stanford Junior University", "Stanford University"],
  },
  {
    institution: "MIT",
    candidateNames: ["Massachusetts Institute of Technology"],
  },
  {
    institution: "Massachusetts Institute of Technology",
    candidateNames: ["Massachusetts Institute of Technology"],
  },
  {
    institution: "UC San Diego",
    candidateNames: ["University of California San Diego", "Regents of the University of California"],
  },
  {
    institution: "UCSD",
    candidateNames: ["University of California San Diego", "Regents of the University of California"],
  },
  {
    institution: "University of Minnesota",
    candidateNames: ["University of Minnesota", "Regents of the University of Minnesota"],
  },
  {
    institution: "Northwestern University",
    candidateNames: ["Northwestern University"],
  },
  {
    institution: "Northwestern",
    candidateNames: ["Northwestern University"],
  },
  {
    institution: "University of South Florida",
    candidateNames: ["University of South Florida", "University of South Florida Research Foundation"],
  },
  {
    institution: "Washington University in St. Louis",
    candidateNames: ["Washington University in St. Louis", "Washington University"],
  },
  {
    institution: "Washington University",
    candidateNames: ["Washington University in St. Louis", "Washington University"],
  },
  {
    institution: "WashU",
    candidateNames: ["Washington University in St. Louis", "Washington University"],
  },
  {
    institution: "UC Berkeley",
    candidateNames: ["University of California Berkeley", "Regents of the University of California"],
  },
  {
    institution: "UC Irvine",
    candidateNames: ["University of California Irvine", "Regents of the University of California"],
  },
  {
    institution: "UC Santa Barbara",
    candidateNames: ["University of California Santa Barbara", "Regents of the University of California"],
  },
  {
    institution: "UC San Francisco",
    candidateNames: ["University of California San Francisco", "Regents of the University of California"],
  },
  {
    institution: "UCSF",
    candidateNames: ["University of California San Francisco", "Regents of the University of California"],
  },
  {
    institution: "University of California",
    candidateNames: ["Regents of the University of California"],
  },
  {
    institution: "Rutgers University",
    candidateNames: ["Rutgers, The State University of New Jersey", "Rutgers University"],
  },
  {
    institution: "University of Illinois",
    candidateNames: ["The Board of Trustees of the University of Illinois", "University of Illinois"],
  },
  {
    institution: "UIUC",
    candidateNames: ["The Board of Trustees of the University of Illinois", "University of Illinois"],
  },
  {
    institution: "Emory University",
    candidateNames: ["Emory University"],
  },
  {
    institution: "Emory",
    candidateNames: ["Emory University"],
  },
  {
    institution: "University of Washington",
    candidateNames: ["University of Washington"],
  },
  {
    institution: "Princeton University",
    candidateNames: ["The Trustees of Princeton University", "Princeton University"],
  },
  {
    institution: "Princeton",
    candidateNames: ["The Trustees of Princeton University", "Princeton University"],
  },
  {
    institution: "University of Pennsylvania",
    candidateNames: ["The Trustees of the University of Pennsylvania", "University of Pennsylvania"],
  },
  {
    institution: "Penn",
    candidateNames: ["The Trustees of the University of Pennsylvania", "University of Pennsylvania"],
  },
  {
    institution: "UPenn",
    candidateNames: ["The Trustees of the University of Pennsylvania", "University of Pennsylvania"],
  },
  {
    institution: "Penn State University",
    candidateNames: ["The Penn State Research Foundation", "Pennsylvania State University"],
  },
  {
    institution: "Penn State",
    candidateNames: ["The Penn State Research Foundation", "Pennsylvania State University"],
  },
  {
    institution: "Rice University",
    candidateNames: ["William Marsh Rice University", "Rice University"],
  },
  {
    institution: "University of Southern California",
    candidateNames: ["University of Southern California"],
  },
  {
    institution: "University of Rochester",
    candidateNames: ["University of Rochester"],
  },
  {
    institution: "Harvard University",
    candidateNames: ["President and Fellows of Harvard College", "Harvard University"],
  },
  {
    institution: "Harvard",
    candidateNames: ["President and Fellows of Harvard College", "Harvard University"],
  },
  {
    institution: "Yale University",
    candidateNames: ["Yale University"],
  },
  {
    institution: "Yale",
    candidateNames: ["Yale University"],
  },
  {
    institution: "Duke University",
    candidateNames: ["Duke University"],
  },
  {
    institution: "Duke",
    candidateNames: ["Duke University"],
  },
  {
    institution: "Vanderbilt University",
    candidateNames: ["Vanderbilt University"],
  },
  {
    institution: "Vanderbilt",
    candidateNames: ["Vanderbilt University"],
  },
  {
    institution: "University of Michigan",
    candidateNames: ["The Regents of the University of Michigan", "University of Michigan"],
  },
  {
    institution: "U Michigan",
    candidateNames: ["The Regents of the University of Michigan", "University of Michigan"],
  },
  {
    institution: "University of Texas",
    candidateNames: ["Board of Regents, The University of Texas System", "University of Texas"],
  },
  {
    institution: "UT Austin",
    candidateNames: ["Board of Regents, The University of Texas System", "University of Texas at Austin"],
  },
  {
    institution: "Ohio State University",
    candidateNames: ["The Ohio State University", "Ohio State University"],
  },
  {
    institution: "Ohio State",
    candidateNames: ["The Ohio State University"],
  },
  {
    institution: "OSU",
    candidateNames: ["The Ohio State University"],
  },
  {
    institution: "Georgetown University",
    candidateNames: ["Georgetown University"],
  },
  {
    institution: "Georgetown",
    candidateNames: ["Georgetown University"],
  },
  {
    institution: "Baylor College of Medicine",
    candidateNames: ["Baylor College of Medicine"],
  },
  {
    institution: "Baylor",
    candidateNames: ["Baylor College of Medicine"],
  },
  {
    institution: "Mayo Clinic",
    candidateNames: ["Mayo Foundation for Medical Education and Research"],
  },
  {
    institution: "Case Western Reserve University",
    candidateNames: ["Case Western Reserve University"],
  },
  {
    institution: "Case Western",
    candidateNames: ["Case Western Reserve University"],
  },
  {
    institution: "Case Western Reserve",
    candidateNames: ["Case Western Reserve University"],
  },
  {
    institution: "Tufts University",
    candidateNames: ["Tufts University"],
  },
  {
    institution: "Tufts",
    candidateNames: ["Tufts University"],
  },
  {
    institution: "Boston University",
    candidateNames: ["Trustees of Boston University", "Boston University"],
  },
  {
    institution: "BU",
    candidateNames: ["Trustees of Boston University"],
  },
  {
    institution: "Northeastern University",
    candidateNames: ["Northeastern University"],
  },
  {
    institution: "Northeastern",
    candidateNames: ["Northeastern University"],
  },
  {
    institution: "University of North Carolina",
    candidateNames: ["The University of North Carolina at Chapel Hill", "University of North Carolina"],
  },
  {
    institution: "UNC",
    candidateNames: ["The University of North Carolina at Chapel Hill"],
  },
  {
    institution: "North Carolina",
    candidateNames: ["The University of North Carolina at Chapel Hill"],
  },
  {
    institution: "Caltech",
    candidateNames: ["California Institute of Technology"],
  },
  {
    institution: "California Institute of Technology",
    candidateNames: ["California Institute of Technology"],
  },
  {
    institution: "NIH",
    candidateNames: ["The United States of America, as represented by the Secretary, Department of Health and Human Services"],
  },
];

/** Looks up the entry for a given institution name (case-insensitive). */
export function findAssigneeEntry(institution: string): AssigneeEntry | undefined {
  const lower = institution.toLowerCase();
  return ASSIGNEE_MAP.find(e => e.institution.toLowerCase() === lower);
}

/**
 * Returns the primary USPTO assignee string for a given institution name,
 * or null if no mapping exists. Compatibility shim for single-assignee lookups.
 */
export function getAssigneeName(institution: string): string | null {
  const entry = findAssigneeEntry(institution);
  return entry?.candidateNames[0] ?? null;
}

/**
 * Returns all mapped institution names (EdenRadar keys).
 */
export function getMappedInstitutions(): string[] {
  return ASSIGNEE_MAP.map(e => e.institution);
}
