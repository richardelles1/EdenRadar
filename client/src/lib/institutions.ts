export type Institution = {
  slug: string;
  name: string;
  city: string | null;
  ttoName: string | null;
  website: string | null;
  specialties: string[];
  continent: string | null;
  noPublicPortal: boolean;
  accessRestricted: boolean;
  count: number;
  activeListings: number;
  topBiology: string[];
};

export type InstitutionsListResponse = {
  institutions: Institution[];
  total: number;
};

export type InstitutionProfile = {
  biologyBreakdown: { label: string; count: number }[];
  stageBreakdown: { stage: string; count: number }[];
  topIndications: string[];
  standoutAssets: {
    id: number;
    assetName: string;
    completenessScore: number;
    developmentStage: string | null;
    indication: string | null;
  }[];
  totalAssets: number;
};
