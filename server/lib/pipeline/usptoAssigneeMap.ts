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
    institution: "University of Arizona",
    candidateNames: ["University of Arizona", "Arizona Board of Regents on behalf of the University of Arizona"],
  },
  {
    institution: "Purdue University",
    candidateNames: ["Purdue University", "Purdue Research Foundation"],
  },
  {
    institution: "University of Wisconsin",
    candidateNames: ["Wisconsin Alumni Research Foundation", "University of Wisconsin-Madison", "University of Wisconsin"],
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
    institution: "UC Davis",
    candidateNames: ["University of California Davis", "Regents of the University of California"],
  },
  {
    institution: "University of Pittsburgh",
    candidateNames: ["University of Pittsburgh", "UPMC"],
  },
  {
    institution: "Cornell University",
    candidateNames: ["Cornell University", "Cornell Research Foundation"],
  },
  {
    institution: "Stanford University",
    candidateNames: ["The Board of Trustees of the Leland Stanford Junior University", "Stanford University"],
  },
  {
    institution: "MIT",
    candidateNames: ["Massachusetts Institute of Technology"],
  },
  {
    institution: "UC San Diego",
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
    institution: "University of South Florida",
    candidateNames: ["University of South Florida", "University of South Florida Research Foundation"],
  },
  {
    institution: "Washington University in St. Louis",
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
    institution: "Rutgers University",
    candidateNames: ["Rutgers, The State University of New Jersey", "Rutgers University"],
  },
  {
    institution: "University of Illinois",
    candidateNames: ["The Board of Trustees of the University of Illinois", "University of Illinois"],
  },
  {
    institution: "Emory University",
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
    institution: "University of Pennsylvania",
    candidateNames: ["The Trustees of the University of Pennsylvania", "University of Pennsylvania"],
  },
  {
    institution: "Penn State University",
    candidateNames: ["The Penn State Research Foundation", "Pennsylvania State University"],
  },
  {
    institution: "UC San Francisco",
    candidateNames: ["University of California San Francisco", "Regents of the University of California"],
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
];

/** Looks up the entry for a given institution name (case-insensitive). */
export function findAssigneeEntry(institution: string): AssigneeEntry | undefined {
  const lower = institution.toLowerCase();
  return ASSIGNEE_MAP.find(e => e.institution.toLowerCase() === lower);
}
