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
  '2026-05',
  1,
  'May 2026',
  'published',
  CURRENT_TIMESTAMP,
  $json${
    "the_number": {
      "figure": "2,846",
      "delta": "May 2026 intake",
      "headline": "New biotech assets indexed across 348 monitored TTO portfolios",
      "body": "Eden's monitored corpus reached 34,170 relevant biotech assets as of May 2026. The 2,846 new records added this month span 348 technology transfer offices: from Tier 1 research universities to regional institutions rarely represented in standard conference-circuit deal flow. The majority remain below the threshold of active BD discovery."
    },
    "whats_moving": [
      {
        "text": "<strong>Oncology leads all categories, accounting for 14% of May intake.</strong> 406 assets carried oncology tags across 12 identified cancer subtypes. BD attention remains concentrated on a narrow visible tier while a secondary set from less-indexed institutions goes uncontested. The supply is not the constraint."
      },
      {
        "text": "<strong>44.9% of May intake carries no structured indication.</strong> 1,278 of 2,846 assets lack classification: not because the science is absent, but because TTOs describe technology at the filing stage without standardised terminology. Without structured metadata, these assets are invisible to any BD team running indication-filtered searches."
      },
      {
        "text": "<strong>Neurology and immunology account for 378 May assets combined, with significantly lower BD competition than oncology.</strong> 207 CNS and neurology-tagged assets entered the corpus alongside 171 immunology records. Both categories show a structural mismatch between filing volume and active BD attention.",
        "chart": [
          { "label": "Oncology",    "value": 406, "maxValue": 406 },
          { "label": "Diagnostics", "value": 199, "maxValue": 406 },
          { "label": "Immunology",  "value": 171, "maxValue": 406 },
          { "label": "Inf. Disease","value": 152, "maxValue": 406 },
          { "label": "Neurology",   "value": 143, "maxValue": 406 }
        ]
      }
    ],
    "therapeutic_spotlight": {
      "area": "Oncology",
      "body": [
        "Oncology is the most densely represented category in academic biotech filings, and May 2026 reinforces that pattern. 406 oncology-tagged assets entered Eden's monitored corpus across 12 identified cancer subtypes: solid tumours, haematologic malignancies, CNS cancers, and more.",
        "The concentration problem is structural. BD teams scanning oncology compete for the same narrow visible set: assets from Tier 1 institutions with active TTO outreach programmes. A secondary tier of oncology assets from less-indexed universities and regional research centres remains uncontested, not because of lower quality, but because the discovery infrastructure has not reached them."
      ],
      "stats": [
        { "figure": "406", "label": "Oncology assets added in May" },
        { "figure": "12",  "label": "Cancer subtypes represented" },
        { "figure": "14%", "label": "Share of total May intake" }
      ],
      "ring": {
        "pct": 76,
        "label": "Pre-IND",
        "detail": "of May assets are at discovery or early stage"
      }
    },
    "brief_take": {
      "quote": "Nearly half of what enters the academic biotech pipeline each month carries no structured indication. It is not sparse data: the science is documented, the IP is filed, the inventor is named. What is missing is the layer of structured metadata that makes an asset findable. Without it, a pre-clinical oncology asset filed at a regional university looks identical to a blank record to any BD team running an indication-filtered search. This is the problem Eden exists to solve.",
      "attribution": "Eden NX Editorial, May 2026"
    },
    "pipeline": [
      {
        "mechanism": "AAV-delivered GRK2 inhibitor restoring cardiac GPCR signalling in heart failure",
        "tags": [
          { "label": "Cardiology",   "type": "default" },
          { "label": "Gene Therapy", "type": "gene"    },
          { "label": "Preclinical",  "type": "default" }
        ],
        "stage": "Preclinical",
        "tier": "Tier 2",
        "status": "available"
      },
      {
        "mechanism": "Dual GPR18/TRPV1 modulator with neuroprotective and immunomodulatory activity for multiple sclerosis",
        "tags": [
          { "label": "Neurology",  "type": "cns"     },
          { "label": "Immunology", "type": "default" },
          { "label": "Dual target","type": "default" }
        ],
        "stage": "Discovery",
        "tier": "Tier 2",
        "status": "available"
      },
      {
        "mechanism": "Oncogenic transcription factor suppression panel for bladder cancer risk stratification",
        "tags": [
          { "label": "Oncology",    "type": "oncology" },
          { "label": "Diagnostics", "type": "default"  }
        ],
        "stage": "Preclinical",
        "tier": "Tier 2",
        "status": "available"
      },
      {
        "mechanism": "Allosteric GLP-1R small molecule agonist for type 2 diabetes and obesity",
        "tags": [
          { "label": "Metabolic",  "type": "rare"    },
          { "label": "Small Mol.", "type": "default" },
          { "label": "GLP-1R",    "type": "default" }
        ],
        "stage": "Discovery",
        "tier": "Tier 3",
        "status": "available"
      }
    ]
  }$json$::jsonb
) ON CONFLICT (slug) DO NOTHING;
