CREATE TABLE IF NOT EXISTS tto_contacts (
  id           serial PRIMARY KEY,
  institution  text NOT NULL,
  name         text NOT NULL,
  title        text,
  email        text,
  phone        text,
  linkedin_url text,
  tto_url      text,
  source       text NOT NULL DEFAULT 'scraped',
  verified_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX tto_contacts_institution_idx ON tto_contacts (institution);
CREATE UNIQUE INDEX tto_contacts_email_uniq ON tto_contacts (lower(email)) WHERE email IS NOT NULL;
