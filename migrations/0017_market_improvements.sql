-- EdenMarket improvements: observers, term sheets, post-deal feedback

CREATE TABLE IF NOT EXISTS market_deal_observers (
  id                serial PRIMARY KEY,
  deal_id           integer NOT NULL REFERENCES market_deals(id) ON DELETE CASCADE,
  invited_by        text NOT NULL,
  observer_email    text NOT NULL,
  observer_name     text NOT NULL,
  role              text NOT NULL DEFAULT 'counsel',
  invite_token      text NOT NULL UNIQUE,
  accepted_at       timestamptz,
  revoked_at        timestamptz,
  invited_at        timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (deal_id, observer_email)
);

CREATE INDEX IF NOT EXISTS market_deal_observers_deal_idx ON market_deal_observers (deal_id);

CREATE TABLE IF NOT EXISTS market_deal_term_sheets (
  id               serial PRIMARY KEY,
  deal_id          integer NOT NULL UNIQUE REFERENCES market_deals(id) ON DELETE CASCADE,
  fields           jsonb NOT NULL DEFAULT '{}',
  seller_agreed_at timestamptz,
  buyer_agreed_at  timestamptz,
  locked_at        timestamptz,
  last_edited_by   text,
  created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS market_deal_feedback (
  id               serial PRIMARY KEY,
  deal_id          integer NOT NULL REFERENCES market_deals(id) ON DELETE CASCADE,
  responder_id     text NOT NULL,
  responder_role   text NOT NULL,
  outcome_type     text NOT NULL,
  overall_rating   integer CHECK (overall_rating BETWEEN 1 AND 5),
  time_to_loi_days integer CHECK (time_to_loi_days >= 0),
  deal_value_usd_m real CHECK (deal_value_usd_m >= 0),
  main_blocker     text,
  platform_rating  integer CHECK (platform_rating BETWEEN 1 AND 5),
  platform_comment text,
  would_recommend  boolean,
  submitted_at     timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (deal_id, responder_id)
);

CREATE INDEX IF NOT EXISTS market_deal_feedback_deal_idx ON market_deal_feedback (deal_id);
