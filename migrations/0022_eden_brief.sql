CREATE TABLE IF NOT EXISTS eden_brief_issues (
  id            serial PRIMARY KEY,
  slug          text NOT NULL UNIQUE,
  issue_number  integer NOT NULL,
  title         text NOT NULL,
  status        text NOT NULL DEFAULT 'draft',
  content       jsonb NOT NULL DEFAULT '{}',
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS eden_brief_issues_status_idx
  ON eden_brief_issues (status, published_at DESC);

CREATE TABLE IF NOT EXISTS eden_brief_subscribers (
  id             serial PRIMARY KEY,
  email          text NOT NULL UNIQUE,
  active         boolean NOT NULL DEFAULT true,
  token          text NOT NULL DEFAULT '',
  subscribed_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO eden_brief_issues (slug, issue_number, title, status, published_at, content)
VALUES (
  '2026-06',
  1,
  'Q2 Signals',
  'published',
  CURRENT_TIMESTAMP,
  $json${
    "the_number": {
      "figure": "847",
      "delta": "+14% vs Q2 2025",
      "headline": "New biotech assets entered monitored TTO portfolios in Q2 2026",
      "body": "Across 400+ technology transfer offices tracked by Eden NX, Q2 saw a 14% increase in new filings versus the same period last year. The majority remain invisible to active BD buyers: not due to access restrictions, but because discovery infrastructure has not kept pace with filing volume."
    },
    "whats_moving": [
      {
        "text": "<strong>Oncology competition is at a three-year high.</strong> BD teams scanning for oncology assets are contesting the same narrow visible set while a secondary tier of less-indexed assets goes uncontested. Concentration of attention is the problem, not lack of supply."
      },
      {
        "text": "<strong>CNS and rare metabolic filings are underrepresented relative to need.</strong> Lower licensing competition and a growing cluster of university-stage assets align with mid-size pharma's current appetite, particularly pre-clinical programmes with early efficacy signals."
      },
      {
        "text": "<strong>Gene silencing mechanisms are entering the pipeline at a rate not seen since 2019.</strong> Multiple Tier 1 institutions filed related assets within a 90-day window. Whether coordinated research momentum or independent convergence, the licensing window is narrow.",
        "chart": [
          { "label": "Oncology",  "value": 312, "maxValue": 312 },
          { "label": "CNS",       "value": 143, "maxValue": 312 },
          { "label": "Rare Dis.", "value": 98,  "maxValue": 312 },
          { "label": "Gene Sil.", "value": 77,  "maxValue": 312 },
          { "label": "Other",     "value": 217, "maxValue": 312 }
        ]
      }
    ],
    "therapeutic_spotlight": {
      "area": "Central Nervous System",
      "body": [
        "CNS represents one of the most structurally underdiscovered categories in the academic licensing market. Filing volume has grown steadily since 2022, but the proportion of CNS assets reaching active licensing conversations remains disproportionately low, driven primarily by discoverability rather than demand.",
        "The assets most likely to go unnoticed are early pre-clinical programmes at regional research universities, where TTO outreach capacity is limited. These institutions rarely appear in standard conference circuits, yet several have produced assets with validated mechanisms that have not yet attracted qualified inquiries."
      ],
      "stats": [
        { "figure": "143",  "label": "CNS assets in active pipeline" },
        { "figure": "+38%", "label": "Year-on-year filing growth" },
        { "figure": "2.1x", "label": "Demand-to-visibility gap ratio" }
      ],
      "ring": {
        "pct": 75,
        "label": "Uncontested",
        "detail": "of CNS assets have had no qualified BD inquiry in 12 months"
      }
    },
    "brief_take": {
      "quote": "The licensing market conflates recency with relevance. A three-year-old pre-clinical asset with clean IP and a strong institution behind it is frequently more valuable than a newly filed one with unclear protection. The industry's search infrastructure does not reflect that: it sorts by date, not by fit. Until BD teams can query by mechanism, stage, IP clarity, and institutional track record simultaneously, they are not searching. They are browsing.",
      "attribution": "Eden NX Editorial, June 2026"
    },
    "pipeline": [
      {
        "mechanism": "Novel gene-silencing mechanism targeting validated CNS pathway",
        "tags": [
          { "label": "CNS",                    "type": "cns"     },
          { "label": "Gene Silencing",          "type": "gene"    },
          { "label": "Efficacy data available", "type": "default" }
        ],
        "stage": "Pre-clinical",
        "tier": "Tier 1",
        "status": "available"
      },
      {
        "mechanism": "Protein aggregation inhibitor for rare metabolic disease with validated target",
        "tags": [
          { "label": "Rare Disease",        "type": "rare"    },
          { "label": "Protein Aggregation", "type": "default" },
          { "label": "Clean IP",            "type": "default" }
        ],
        "stage": "IND-enabling",
        "tier": "Tier 1",
        "status": "available"
      },
      {
        "mechanism": "Oncogenic transcription factor with synthetic lethality approach in solid tumours",
        "tags": [
          { "label": "Oncology",     "type": "oncology" },
          { "label": "Transcription","type": "default"  }
        ],
        "stage": "Pre-clinical",
        "tier": "Tier 2",
        "status": "in_discussion"
      },
      {
        "mechanism": "Epigenetic modifier with dual CNS and inflammatory disease potential",
        "tags": [
          { "label": "CNS",         "type": "cns"     },
          { "label": "Epigenetics", "type": "default" },
          { "label": "Grant-backed","type": "default" }
        ],
        "stage": "Discovery",
        "tier": "Tier 2",
        "status": "available"
      }
    ]
  }$json$::jsonb
) ON CONFLICT (slug) DO NOTHING;
