# EdenRadar — Leads v3 LinkedIn Validation Report

**Companion to:** `attached_assets/edenradar_leads_v3.csv` and `docs/edenradar-icp-and-outreach-brief-v3.md`
**Generated:** 2026-05-03

## Methodology

Same scripted Google-search audit pass used for v2 (`docs/edenradar-leads-v2-linkedin-validation.md`):

1. **Pass 1 — strict**: query Google for `"<Contact Name>" "<Company>" site:linkedin.com/in` and parse top 6 results.
2. **Pass 2 — looser**: for rows that did not return a verified match in pass 1, re-query as `"<Contact Name>" "<Company>" linkedin` (drop `site:` filter).
3. **Pass 3 — manual disposition** of `partial-name-only` rows (LinkedIn page returned for the named person but Google snippet did not contain the company name in Latin script): kept iff the snippet showed (a) the company name in CJK script (Chinese / Japanese / Korean characters), or (b) the persons known headquarters / location matched the companys HQ city for a globally-recognized public-company executive.
4. **Drop rule**: any row that did not reach `verified` (Google-snippet evidence of person + company) was dropped.

No LinkedIn API or scraping was used. LinkedIn returns HTTP 999 to direct unauthenticated fetches. Googles `site:linkedin.com/in` index is the practical evidence source.

## Results

- **Started**: 88 candidate rows (built from v3 ICP work).
- **Kept (verified)**: 38 rows shipped in the v3 CSV.
- **Dropped**: 50 rows (no Google-snippet evidence of the named person at the named company; or evidence showed a different employer / different person of the same name).

### Verified-status breakdown (kept rows)

- **verified-exact** (32 rows): name appears in Google result title AND company appears in title or snippet.
- **verified** (0 rows): name + company both appear in Google snippet but not both in title.
- **verified-manual** (6 rows): pass-3 manual disposition, evidence in CJK script or location-match.

### Dropped-status breakdown

- **partial-name-only** (22 rows): Google returned a LinkedIn page for the named person but the page title showed a different employer (likely job change, or same-name collision).
- **unverifiable** (28 rows): no LinkedIn page where the name appeared, on either pass. APAC executives are systematically under-indexed on Google in Latin-script search.

### Bucket distribution

| Bucket | Started | Kept | Dropped |
|---|---|---|---|
| APAC-Japan | 21 | 9 | 12 |
| APAC-China | 23 | 12 | 11 |
| APAC-Korea | 14 | 3 | 11 |
| Canada | 16 | 6 | 10 |
| Australia | 14 | 8 | 6 |
| **TOTAL** | **88** | **38** | **50** |

## Per-row report (KEPT)

| # | Bucket | Name | Company | Status | Verified LinkedIn URL |
|---|---|---|---|---|---|
| 1 | APAC-Japan | Adam Pearson | Astellas Pharma | verified-exact | https://jp.linkedin.com/in/adam-pearson-72bb3749 |
| 2 | APAC-Japan | Naoki Okamura | Astellas Pharma — Discovery Research | verified-exact | https://jp.linkedin.com/in/naoki-okamura |
| 3 | APAC-Japan | Ken Takeshita | Daiichi Sankyo | verified-exact | https://www.linkedin.com/in/ken-takeshita-579b921 |
| 4 | APAC-Japan | Takuko Sawada | Shionogi | verified-exact | https://jp.linkedin.com/in/takuko-sawada-982877124 |
| 5 | APAC-Japan | Hiroaki Ueno | Mitsubishi Tanabe Pharma | verified-exact | https://ca.linkedin.com/in/ueno-hiroaki-008312225 |
| 6 | APAC-Japan | Patrick Reid | PeptiDream | verified-exact | https://www.linkedin.com/in/patrick-reid-526b7318 |
| 7 | APAC-Japan | Haru Morita | Modalis Therapeutics | verified-exact | https://www.linkedin.com/in/harumorita |
| 8 | APAC-Japan | Hardy TS Kagimoto | Healios | verified-exact | https://www.linkedin.com/in/hardytskagimoto |
| 9 | APAC-Japan | Miguel Garcia-Guzman | Rakuten Medical | verified-manual | https://www.linkedin.com/in/mgarciaguzman |
| 10 | APAC-China | Lai Wang | BeiGene (BeOne Medicines) | verified-exact | https://www.linkedin.com/in/lai-wang-b367921a |
| 11 | APAC-China | Zhang Lianshan | Hengrui Pharmaceuticals | verified-exact | https://www.linkedin.com/in/lianshan-zhang-148a5710 |
| 12 | APAC-China | Michelle Xia | Akeso | verified-exact | https://cn.linkedin.com/in/michelle-yu-xia-74b78918 |
| 13 | APAC-China | Patricia Keegan | Junshi Biosciences | verified-manual | https://www.linkedin.com/in/patricia-keegan-6259271a5 |
| 14 | APAC-China | Rafael G. Amado | Zai Lab | verified-exact | https://www.linkedin.com/in/rafael-amado-84bb235 |
| 15 | APAC-China | Frank Jiang | CStone Pharmaceuticals | verified-manual | https://www.linkedin.com/in/frank-jiang-%E6%B1%9F%E5%AE%81%E5%86%9B-1ab11812 |
| 16 | APAC-China | Sean Fu | I-Mab Biopharma | verified-exact | https://www.linkedin.com/in/seanfu |
| 17 | APAC-China | Peter Luo | Adagene | verified-exact | https://www.linkedin.com/in/peter-luo-80b9675 |
| 18 | APAC-China | Alex Zhavoronkov | Insilico Medicine | verified-manual | https://www.linkedin.com/in/zhavoronkov |
| 19 | APAC-China | Shuhao Wen | XtalPi | verified-exact | https://www.linkedin.com/in/shuhao-wen-a1810356 |
| 20 | APAC-China | Crystal Qin | LaNova Medicines | verified-exact | https://cn.linkedin.com/in/crystal-qin-b515324a |
| 21 | APAC-China | Christian Hogg | Hutchmed — US BD | verified-exact | https://uk.linkedin.com/in/christian-hogg-04a030b |
| 22 | APAC-Korea | Sang Hoon Lee | ABL Bio | verified-exact | https://www.linkedin.com/in/sang-hoon-lee-8004046 |
| 23 | APAC-Korea | Donghoon Lee | SK Biopharmaceuticals | verified-exact | https://www.linkedin.com/in/donghoon-lee-648b441a9 |
| 24 | APAC-Korea | Sang Joon Lee | Celltrion | verified-exact | https://www.linkedin.com/in/sang-joon-lee-42b763216 |
| 25 | Canada | Tryn Stimart | AbCellera Biologics | verified-exact | https://www.linkedin.com/in/trynstimart |
| 26 | Canada | Christian Marsolais | Theratechnologies | verified-exact | https://www.linkedin.com/in/christian-marsolais-18a92b10 |
| 27 | Canada | Tamer Mohamed | Aspect Biosystems | verified-exact | https://ca.linkedin.com/in/tamer-g-mohamed |
| 28 | Canada | Neil Warma | ProMIS Neurosciences | verified-exact | https://www.linkedin.com/in/neil-warma-05085b16 |
| 29 | Canada | David Elsley | Cardiol Therapeutics | verified-exact | https://ca.linkedin.com/in/davidelsley |
| 30 | Canada | Samira Sakhia | Knight Therapeutics | verified-manual | https://www.linkedin.com/in/samira-sakhia-0025bb |
| 31 | Australia | Silviu Itescu | Mesoblast | verified-exact | https://www.linkedin.com/in/silviu-itescu-470855a |
| 32 | Australia | Jon Pilcher | Neuren Pharmaceuticals | verified-manual | https://www.linkedin.com/in/jon-pilcher-467a172 |
| 33 | Australia | Leslie Chong | Imugene | verified-exact | https://www.linkedin.com/in/leslie-chong-6903ab6 |
| 34 | Australia | Philippe Wolgen | Clinuvel Pharmaceuticals | verified-exact | https://www.linkedin.com/in/philippe-wolgen-098213249 |
| 35 | Australia | Rohan Hockings | PYC Therapeutics | verified-exact | https://www.linkedin.com/in/rohan-hockings-94a20a46 |
| 36 | Australia | Daniel Tillett | Race Oncology | verified-exact | https://au.linkedin.com/in/tillettdaniel |
| 37 | Australia | Marc Voigt | Immutep | verified-exact | https://www.linkedin.com/in/marc-voigt-ab381b62 |
| 38 | Australia | James Corbett | Avita Medical | verified-exact | https://www.linkedin.com/in/james-corbett-6917338 |

## Per-row report (DROPPED)

| # | Bucket | Name | Company | Status | Notes |
|---|---|---|---|---|---|
| 1 | APAC-Japan | Wataru Takasaki | Daiichi Sankyo — Business Development | partial-name-only | LinkedIn page found but title shows different employer: Wataru Takasaki - -- / LinkedIn |
| 2 | APAC-Japan | Tatsuhiko Yokoyama | Takeda — Japan R&D | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 3 | APAC-Japan | Makoto Inoue | Otsuka Pharmaceutical | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 4 | APAC-Japan | Teiji Kimura | Eisai | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 5 | APAC-Japan | Toichi Takino | Ono Pharmaceutical | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 6 | APAC-Japan | Toshiaki Nojima | Chugai Pharmaceutical | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 7 | APAC-Japan | Toru Kimura | Sumitomo Pharma | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 8 | APAC-Japan | Yutaka Osawa | Kyowa Kirin | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 9 | APAC-Japan | Tetsushi Inada | Ono Pharma USA | partial-name-only | LinkedIn page found but title shows different employer: Tetsushi Inada - President - Pharma-East Insight, Inc. / LinkedIn |
| 10 | APAC-Japan | Chris Cargill | Sosei Heptares (Nxera Pharma) | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 11 | APAC-Japan | Tatsuya Tanaka | JCR Pharmaceuticals | partial-name-only | LinkedIn page found but title shows different employer: Tatsuya Tanaka - Entrepreneur / LinkedIn |
| 12 | APAC-Japan | Daisaku Sato | Megakaryon | partial-name-only | LinkedIn page found but title shows different employer: Daisaku Sato - Sumitomo Mitsui Finance and Leasing Company, Limited-Digital Lab. |
| 13 | APAC-China | Yongjun Liu | Innovent Biologics | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 14 | APAC-China | Lyu Aifeng | Hansoh Pharmaceutical | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 15 | APAC-China | Jianmin Fang | RemeGen | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 16 | APAC-China | Rogers Yongqing Luo | Everest Medicines | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 17 | APAC-China | Jay Mei | Antengene | partial-name-only | LinkedIn page found but title shows different employer: Jay Mei - Antennova / LinkedIn |
| 18 | APAC-China | Brian Min | GenScript ProBio | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 19 | APAC-China | Jason Yang | Sino Biopharmaceutical | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 20 | APAC-China | Marek Kania | Hutchmed | partial-name-only | LinkedIn page found but title shows different employer: Marek Kania, M.D., M.B.A. - Marek Kania & Partners Biotech Consulting / LinkedIn |
| 21 | APAC-China | Le Song | BioMap | partial-name-only | LinkedIn page found but title shows different employer: Le Song - GenBio AI / LinkedIn |
| 22 | APAC-China | Kevin Gong | 3D Medicines | partial-name-only | LinkedIn page found but title shows different employer: Kevin Gong - GE Healthcare / LinkedIn |
| 23 | APAC-China | Frank Guo | Genor Biopharma | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 24 | APAC-Korea | Linda MacDonald | Samsung Bioepis | partial-name-only | LinkedIn page found but title shows different employer: Linda Choi MacDonald - Stanford University Graduate School of Business - Greater |
| 25 | APAC-Korea | Yong-Zu Kim | LegoChem Biosciences (Ligachem Biosciences) | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 26 | APAC-Korea | Jeong Hee Kim | Yuhan Corporation | partial-name-only | LinkedIn page found but title shows different employer: JeongHee Kim - Iowa State University / LinkedIn |
| 27 | APAC-Korea | Sengho Jeon | Daewoong Pharmaceutical | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 28 | APAC-Korea | Jong-Soo Lee | Hanmi Pharmaceutical | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 29 | APAC-Korea | Jang Junpyo | GC Cell | partial-name-only | LinkedIn page found but title shows different employer: Junpyo Jang - forparents / LinkedIn |
| 30 | APAC-Korea | James Jungkue Lee | Bridge Biotherapeutics | partial-name-only | LinkedIn page found but title shows different employer: James Jungkue Lee - Advisor - 3billion, Inc. / LinkedIn |
| 31 | APAC-Korea | Soonjae Park | Alteogen | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 32 | APAC-Korea | Daewon Kim | Voronoi Inc | partial-name-only | LinkedIn page found but title shows different employer: Daewon KIM - Business Advisor - Samsung Electronics / LinkedIn |
| 33 | APAC-Korea | Jinhan Kim | Standigm | partial-name-only | LinkedIn page found but title shows different employer: Jinhan Kim - Samsung Biologics / LinkedIn |
| 34 | APAC-Korea | Sung-Yub Hong | GI Innovation | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 35 | Canada | Steve Forte | Repare Therapeutics | partial-name-only | LinkedIn page found but title shows different employer: Steve Forte - DCx Therapeutics / LinkedIn |
| 36 | Canada | Kenneth Galbraith | Zymeworks | partial-name-only | LinkedIn page found but title shows different employer: Kenneth Galbraith - SYNCONA INVESTMENT MANAGEMENT LIMITED / LinkedIn |
| 37 | Canada | Peter Greenleaf | Aurinia Pharmaceuticals | partial-name-only | LinkedIn page found but title shows different employer: Peter Greenleaf - Great Bay Foundation / LinkedIn |
| 38 | Canada | Avinash Chiruvolu | Notch Therapeutics | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 39 | Canada | Marcelo Bigal | Ventus Therapeutics | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 40 | Canada | Jakob Dupont | Deep Genomics | partial-name-only | LinkedIn page found but title shows different employer: Jakob Dupont, MD MA - Sofinnova Investments / LinkedIn |
| 41 | Canada | Thomas Madden | Acuitas Therapeutics | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 42 | Canada | James Taylor | Precision NanoSystems | partial-name-only | LinkedIn page found but title shows different employer: James Taylor - none / LinkedIn |
| 43 | Canada | Karen Bohmert | Bright Angel Therapeutics | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 44 | Canada | Handol Kim | Variational AI | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 45 | Australia | Bill Mezzanotte | CSL | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 46 | Australia | Christian Behrenbruch | Telix Pharmaceuticals | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
| 47 | Australia | Frederic Guerard | Opthea | partial-name-only | LinkedIn page found but title shows different employer: Frederic Guerard - CalciMedica / LinkedIn |
| 48 | Australia | James Garner | Prescient Therapeutics | partial-name-only | LinkedIn page found but title shows different employer: James Garner - Percheron Therapeutics Limited / LinkedIn |
| 49 | Australia | Jackie Fairley | Starpharma | partial-name-only | LinkedIn page found but title shows different employer: Jackie Fairley FAICD FTSE - Calvary Health Care / LinkedIn |
| 50 | Australia | Brian Ward | Aroa Biosurgery | unverifiable | No LinkedIn page returned by Google for this name + company on either pass |
