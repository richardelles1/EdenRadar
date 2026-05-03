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
};

export type InstitutionsListResponse = {
  institutions: Institution[];
  total: number;
};
