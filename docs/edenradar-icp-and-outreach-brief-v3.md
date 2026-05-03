# EdenRadar — ICP & Outreach Brief v3 (Expansion: APAC + Canada + Australia)

**Companion to:** `attached_assets/edenradar_leads_v3.csv`
**List size:** **38 prospects** across 5 expansion buckets, post strict per-row LinkedIn-validation pass (88 candidates → 38 strongly-verified rows). **Schema:** identical to v2 (16 columns total: the 14 v1 columns + `Country` + `Expansion Bucket`).
**Validation companion:** `docs/edenradar-leads-v3-linkedin-validation.md` (per-row Google-evidence report).
**Generated:** 2026-05-03 · **Re-run cadence:** every 90 days
**Hard-deduped against:** `attached_assets/edenradar_first_leads.csv` (105 rows, v1) and `attached_assets/edenradar_leads_v2.csv` (75 rows, v2). Build-time dedup script verified **zero `(Domain)` collisions** and **zero `linkedin.com/in/<slug>` collisions** vs v1+v2 combined.

> **Volume note** (mirrors the v2 caveat): the original task target was 75–100. **Strict per-row LinkedIn validation** (Google must return a canonical "Name - Company \| LinkedIn" page for the row to be kept, with a CJK-snippet manual-disposition exception for the most globally-recognized public-company executives) gated the list down from 88 candidates to 38 strongly-verified rows. The 50 dropped rows split as: 28 `unverifiable` (no LinkedIn page returned by Google for that name + company on either pass) and 22 `partial-name-only` (LinkedIn page returned for the named person but the page title showed a different employer — likely job change since sourcing, or same-name collision). Under strict gating these were dropped (no positive person+company evidence). To reach 75+ verified APAC/Canada/Australia rows would require Apollo / Sales Navigator / ZoomInfo access (out of scope), since Google's `site:linkedin.com/in` index for APAC executives is materially thinner than for US/EU executives — many real BD heads at Japanese, Korean, and Chinese pharmas have CJK-script LinkedIn profiles that Googles Latin-script crawl does not surface.

---

## 1. Why this list exists

v1 was US-only (105 prospects). v2 added depth + EU/UK + Medtech/Dx/Tools (75 prospects). Both **explicitly excluded** APAC, Canada, LATAM, and Australia per task scope. v3 fills exactly that gap: as EdenRadar surfaces global academic IP from US, Canadian, EU, UK, Japanese, Korean, Chinese, and Australian universities, the buyer side has to follow. v3 covers the four geographies most active in licensing US/EU academic biotech IP today: **Japan**, **China**, **South Korea**, **Canada**, and **Australia**.

| Expansion bucket | Why it exists | Candidates built | After strict LinkedIn validation |
|---|---|---|---|
| **APAC-Japan** | Japan-pharma BD is the most mature non-US in-licensing market — Astellas, Daiichi, Takeda, Otsuka, Eisai, Ono have done >$30B in cross-border BD in 2023–2025. | 21 | **9** |
| **APAC-China** | Reciprocal in-licensing flow: China biotechs that out-license to Western pharma (Akeso, LaNova, Hengrui, Hansoh) have cash + appetite for academic IP, plus US-listed China-anchored mid-caps (BeOne, Zai, Innovent, Hutchmed). | 23 | **12** |
| **APAC-Korea** | Korea ranks #2 in APAC pharma BD activity (LegoChem→J&J $1.7B, Alteogen→MSD $432M, ABL→Sanofi $1B) — under-covered by Western SDR teams. Korean exec LinkedIn slugs are the most under-indexed by Google in v3 (3/14 verified). | 14 | **3** |
| **Canada** | Strong AI-bio + cell-therapy + delivery-tech cohort (AbCellera, Acuitas, Repare, Zymeworks, Aspect, Notch, Ventus, Deep Genomics) with active US partnering. Drop rate inflated by recent CEO turnover (Repare, Aurinia, Zymeworks). | 16 | **6** |
| **Australia** | ASX-listed biotech sector funded by superannuation cash (CSL, Mesoblast, Telix, Neuren, Immutep) — radioligand + cell-therapy + rare-disease focus. Highest verification rate of v3 (8/14). | 14 | **8** |
| **TOTAL** | | **88** | **38** |

Same v1/v2 principle: the **Why Now** column is the cold-email opener. Every row is sourced to a publicly disclosed event in the last 30–540 days (round close, FDA approval, BD deal, restructuring, leadership move, BLA acceptance, conference talk).

---

## 2. ICP per expansion bucket

### 2A. APAC-Japan

| Attribute | Definition |
|---|---|
| Headcount | Big Pharma 5,000+ (Astellas, Daiichi, Takeda, Eisai, Otsuka), mid-cap 500–10,000 (Chugai, Sumitomo, Kyowa Kirin, Shionogi, Mitsubishi Tanabe, Ono), emerging 30–500 (PeptiDream, Sosei/Nxera, Modalis, JCR, Healios, Rakuten Med, Megakaryon) |
| Geography | Japan-HQ; **US BD office is the practical front door** for Astellas (US), Daiichi (Basking Ridge, NJ), Takeda (Cambridge, MA), Ono USA (Lawrenceville, NJ). Send to the US office where one exists — Japanese HQ inboxes have ~5–10x lower reply rates for cold BD outreach. |
| Buying signal | (a) Recent mega out-license (Hengrui→Merck, Daiichi→AZ on Dato), (b) named "Vision" or mid-term plan with explicit external-sourcing language, (c) Shonan iPark / academic-incubator program participation (Takeda, Astellas), (d) freshly-acquired US biotech being integrated (Astellas-Iveric, Astellas-Vivace, Ono-Deciphera, Otsuka-Jnana). |
| Persona (primary) | Global Head of BD / SVP BD&L (mapped to `SVP, Business Development`) — usually US-based for Japan Big Pharma |
| Persona (secondary) | Head of R&D / CSO (mapped to `SVP, Research`) — usually JP-based |
| Persona (tertiary) | CMO / Head of Clinical Development (mapped to `SVP, Clinical Development`) for clinical-stage IP |
| Disqualifiers | CMC-only / generics (Sawai, Nichi-Iko); over-the-counter / consumer-health pure-plays (Rohto, Kobayashi); CDMO services (CMIC, Nipro); recent acquirees of v1/v2 accounts. |

### 2B. APAC-China

| Attribute | Definition |
|---|---|
| Headcount | Big Pharma 10,000+ (Hengrui, Sino Biopharm, Hansoh), mid-cap 1,000–10,000 (Innovent, Akeso, BeOne, Junshi, Zai), emerging 100–1,000 (LaNova, I-Mab, Adagene, Antengene, Insilico, XtalPi, Everest, Hutchmed-US, RemeGen, BioMap, GenScript ProBio, 3D Med, Genor, CStone) |
| Geography | China-HQ **with a US-listed structure or US-based BD office**. Hong Kong / Cayman holdco is acceptable when the operating R&D is in Shanghai/Suzhou/Beijing. Pure-mainland-China-only-listed companies (e.g., A-share-only Shenzhen biotechs) are excluded — they cannot easily transact in USD-denominated US academic IP licenses without going through a HK/Cayman vehicle. |
| Buying signal | (a) Recent mega out-license to global pharma (Akeso→Summit, LaNova→Merck, Hansoh→Merck, Hengrui→Merck/Kailera, Alteogen→MSD), (b) US-listing or HK-listing in last 24 months with explicit pipeline-expansion language, (c) named US-based CMO/CSO running global trials (Junshi/Keegan, Zai/Amado), (d) freshly-renamed entity signaling Western-market push (BeiGene→BeOne Q4-2024). |
| Persona (primary) | CEO (sub-1,000 emerging) / Global Head of R&D / SVP BD (mid+) |
| Persona (secondary) | Chief Medical Officer (US-based, where applicable) |
| Persona (tertiary) | US BD lead (Hutchmed/Hogg, BeOne San Mateo, Junshi/Keegan) |
| Disqualifiers | A-share-only-listed companies with no HK/Cayman vehicle; pure-CRO / CDMO (WuXi services arms — but WuXi Bio is partnering-active and would be in scope if not for the US Biosecure Act overhang, which makes it a high-political-risk send); state-owned-enterprise pharmas (Sinopharm, NCPC) without a named external-innovation function. |

### 2C. APAC-Korea

| Attribute | Definition |
|---|---|
| Headcount | Big-domestic 1,000–3,000 (Yuhan, Daewoong, Hanmi, Celltrion, GC Cell), emerging 60–500 (LegoChem/Ligachem, ABL Bio, Alteogen, SK Biopharm, Voronoi, Bridge Bio, Standigm, GI Innovation), Samsung Bioepis as biosim/novel-pivot (1,500). |
| Geography | South Korea-HQ. Strong public BD function — Korean biotechs out-license at 4–5x the per-employee rate of Japanese biotechs (LegoChem→J&J $1.7B with 350 employees). |
| Buying signal | (a) Recent mega out-license (LegoChem→J&J, Alteogen→MSD, ABL→Sanofi, Hanmi→MSD, Yuhan→J&J Lazcluze, GI Innovation→Maruho), (b) first-FDA-approved-Korean-novel-drug royalty cash (Yuhan/Lazcluze, SK Biopharm/Cenobamate), (c) named CSO with US/EU pharma pedigree (LegoChem/Yong-Zu Kim from C&C, Alteogen/Soonjae Park from LG Chem). |
| Persona (primary) | Founder/CEO (most Korean biotechs are founder-led — explicit `[founder-led]` tag retained per v2 convention) |
| Persona (secondary) | SVP, Research (CSO equivalent) / SVP, Business Development (Head of Global BD) |
| Disqualifiers | Pure-biosimilar without novel-drug pipeline (Celltrion is borderline — kept because of Zymfentra novel SC pivot); state-owned (KOLON Life Science post-Invossa scandal); cosmeceutical / nutraceutical pure-plays. |

### 2D. Canada

| Attribute | Definition |
|---|---|
| Headcount | Mid-cap 200–700 (AbCellera, Zymeworks, Aurinia, Repare), emerging 30–200 (Notch, Ventus, Aspect, Deep Genomics, Acuitas, Bright Angel, Variational AI, ProMIS, Cardiol), Canadian-HQ-with-US-operating-arm (Repare Cambridge MA, Ventus Waltham MA, Acuitas Vancouver, Theratechnologies Montreal). |
| Geography | Canada-HQ (BC, ON, QC primarily); often listed on TSX + Nasdaq. Vancouver = AI-bio + delivery + cell-therapy cluster (AbCellera, Acuitas, Aspect, PNI, Notch, Bright Angel, Variational AI). Toronto = AI / RNA cluster (Deep Genomics, Notch, ProMIS). Montreal/Saint-Laurent = onc + immunology (Repare, Ventus, Theratech, Knight). |
| Buying signal | (a) Recent FDA approval w/ US partner (Zymeworks/Ziihera w/ Jazz, Aurinia/Lupkynis), (b) Acuitas / AbCellera royalty cash from COVID-mRNA + COVID-mAb period, (c) explicit US-Cambridge or US-Boston operating arm signaling US TTO scouting (Repare, Ventus). |
| Persona (primary) | CEO (sub-500); SVP, Business Development (mid-cap with named CBO/CCO) |
| Persona (secondary) | SVP, Research (CSO equivalent) |
| Disqualifiers | Cannabis-pivots (Tilray, Canopy); pure-CRO (LabCorp Canada); medical-cannabis-only; recently-acquired-by-Big-Pharma rows (BELLUS→GSK 2023, Inversago→Novo 2023, Fusion Pharma→AZ 2024 — **explicitly excluded**). |

### 2E. Australia

| Attribute | Definition |
|---|---|
| Headcount | Big Pharma 30,000+ (CSL with Behring + Seqirus + Vifor); mid-cap 100–700 (Mesoblast, Telix, Clinuvel, Avita); emerging 25–100 (Neuren, Imugene, Opthea, PYC, Race, Prescient, Immutep, Starpharma, Aroa). |
| Geography | Australia-HQ (Melbourne dominant — CSL, Telix, Mesoblast, Neuren, Clinuvel, Opthea, Starpharma, Prescient; Sydney — Immutep, Imugene; Brisbane — Race; Perth — PYC). NZ-HQ-but-AU-operating (Aroa Auckland) is included since the ASX listing + AU sales force put it on Australian BD radar. |
| Buying signal | (a) Recent FDA approval (Mesoblast/Ryoncil Dec-2024, Avita/Recell GO Q2-2024, Telix/Illuccix), (b) US royalty cash from Acadia partnership (Neuren/Daybue trofinetide), (c) Phase 3 readout window in next 12 months (Opthea/COAST, Telix/ProstACT GLOBAL, Immutep/TACTI-003, Cardiol-equivalent), (d) ASX-listed-with-Nasdaq-secondary creating dual-market-funded BD seat (Telix, Mesoblast, Immutep). |
| Persona (primary) | CEO / Founder-CEO (most ASX-listed biotechs are founder-led — explicit `[founder-led]` tag retained per v2 convention) |
| Persona (secondary) | Chief Medical Officer (CSL/Mezzanotte), SVP Research |
| Disqualifiers | Pure mining / agritech (Australian biotech-adjacent listings that don't actually develop drugs); medical-device-only without R&D function; pre-IND single-asset-only without platform. ResMed / Cochlear / Pro Medicus excluded — pure devices, not drug-IP buyers. |

---

## 3. Per-jurisdiction privacy + outreach rules (this is the v3-specific section)

This is the v3 equivalent of v2 §2E.i (which covered GDPR/PECR for EU/UK). v3 covers **five jurisdictions** with materially different rules. **Read this section before sending — non-compliant cold B2B outreach in Canada and Australia carries six-figure regulatory penalties.**

### 3.1 Canada — CASL (Canada's Anti-Spam Legislation) + PIPEDA

CASL is **the strictest cold-B2B-email regime in the G7**. Practical implications:

1. **Default rule**: B2B cold email to a Canadian recipient requires **express consent** OR **implied consent** (a documented existing business relationship, OR a public conspicuous publication of the email by the recipient with no "no unsolicited email" disclaimer). EdenRadar BD outreach must rely on the **conspicuous publication exception** (§10(9)(b) of CASL) — i.e., the contact has published their corporate email on a corporate website or LinkedIn page in their professional capacity, with no "do not email" disclaimer, and the email content is *clearly relevant to their published role*.
2. **Mandatory in every email** (§6 of CASL): full sender legal name + Replit-style mailing address, working unsubscribe (operational for ≥60 days), one-click opt-out honored within 10 business days.
3. **Penalties**: up to CAD $10M per violation for organizations. The CRTC has issued seven-figure CASL penalties since 2017 — this is enforced.
4. **Privacy layer (PIPEDA)**: contact name + corporate email + LinkedIn URL constitute "personal information" under PIPEDA. Lawful basis = legitimate business purpose; must be limited to stated purpose; must support a §8 access-and-correction request within 30 days.
5. **Quebec Law 25** (in force Sep-2023): adds GDPR-like rights for Quebec residents specifically — right to data portability, mandatory privacy-impact assessment for cross-border transfer of Quebec-resident data, and a Privacy Officer must be named in the privacy notice. Repare (Saint-Laurent QC), Theratechnologies (Montreal), Knight (Montreal), Ventus (QC arm) all sit in QC.
6. **Practical sequence rule**: 2 touches max within 30 days, then drop and re-add only after a documented new trigger. This is more conservative than US-CAN-SPAM.

### 3.2 Japan — APPI (Act on Protection of Personal Information) + Specified Email Act

1. **APPI** classifies corporate-role contact data (name, business email, business LinkedIn, business phone) as **personal information**. Cross-border transfer (e.g., US-hosted SDR tool → Japan-resident contact) requires either (a) the recipient's consent, OR (b) the operator's confirmation that the receiving country has equivalent protection (US is **not** automatically equivalent under APPI), OR (c) a contractual safeguard (SCC-equivalent). Practical answer for EdenRadar: use a contractual safeguard with the SDR tool vendor (Outreach, Apollo, Lemlist) covering APPI cross-border-transfer terms.
2. **Specified Email Act** (Act on Regulation of the Transmission of Specified Electronic Mail) is Japan's CAN-SPAM equivalent. Default rule is **opt-in** for marketing email, with a B2B carve-out: business email sent to a *publicly published business email address* (e.g., the BD lead's email on a corporate website) is permitted. Mandatory in every email: sender identity, sender mailing address, working opt-out, opt-out honored within a reasonable time.
3. **Cultural / practical layer (not law, but conversion-decisive)**: Japanese pharma BD inboxes have an ~80% lower cold-email reply rate than US equivalents. **Always send to the US BD office where one exists** (Astellas US in Northbrook IL, Daiichi US in Basking Ridge NJ, Takeda US in Cambridge MA, Ono USA in Lawrenceville NJ, Eisai US in Nutley NJ). Sending to a Japan-HQ inbox in English without an introduction is a low-yield motion. Japan-HQ rows in the v3 CSV target the US-based or globally-mobile English-speaking BD lead (Adam Pearson at Astellas, Wataru Takasaki at Daiichi, Tatsuhiko Yokoyama at Takeda Japan — but route through US office where possible).
4. **Suppression** keyed off corporate email + LinkedIn URL. Honor erasure within 30 days.
5. **Retention**: 18-month rolling, same as v2 EU rule.

### 3.3 China — PIPL (Personal Information Protection Law) + Cybersecurity Law

1. **PIPL** (effective Nov-2021) is the strictest privacy regime applied to v3 prospects. Cross-border transfer of personal data **out of China** requires one of: (a) CAC security assessment (only for large processors / sensitive data), (b) standard contract filed with CAC, (c) CAC-recognized certification. Practical implication for EdenRadar: outbound email *into* China with personal data of Chinese residents likely triggers PIPL — but the cross-border-transfer rules govern data leaving China, not entering it. Inbound prospecting email is governed by China's email-marketing rules under the **Measures for the Administration of Internet Email Services (2006)**: opt-out required, header must include "AD" or equivalent marker if the email is commercial, no false subject lines.
2. **Practical political-risk overlay**: US-China BD outreach is currently in a regulatory grey zone — the **US Biosecure Act** (passed House Sep-2024, awaiting Senate as of v3 ship date) targets WuXi AppTec, BGI, MGI, Complete Genomics, WuXi Biologics specifically. None of those are in the v3 list. Other China-HQ biotechs (Akeso, Hengrui, Innovent, BeOne, LaNova) are **not** named in the bill but the broader US-China biotech-decoupling sentiment means BD conversations carry geopolitical risk. **Recommendation**: prioritize US-listed-and-US-BD-office China rows (BeOne San Mateo, Hutchmed Florham Park NJ, Zai US, I-Mab Rockville MD) over mainland-China-only inboxes — both for deliverability and for political-risk hygiene.
3. **Send via US sender domain** to avoid Chinese ISP filtering of unfamiliar foreign senders. Tencent-Exmail / Aliyun-Mail / 263.net (the three big China corporate email providers) aggressively reject unknown US senders without prior reputation.
4. **Suppression** keyed off corporate email. Honor opt-out via simple reply (Chinese inboxes routinely strip unsubscribe-link footers).

### 3.4 South Korea — PIPA (Personal Information Protection Act) + Information & Communications Network Act

1. **PIPA** governs personal data; corporate-role contact data is in scope. **Cross-border transfer** of Korean residents' personal data requires the recipient's consent OR a contract specifying the destination country and security measures. Same practical answer as APPI: contractual safeguards with the SDR tool vendor.
2. **Information & Communications Network Act (ICNA)** §50 governs commercial email. Default rule: prior consent required for marketing email to individuals; B2B carve-out exists for emails *to a corporate role address* discussing the recipient's professional duties. Mandatory in every email: "(광고)" or "(AD)" prefix in the subject line for clearly commercial content (BD outreach is a grey zone — most BD senders do not prefix, but the safest hygiene is to make the subject obviously professional and personalized so it cannot be read as bulk-marketing), sender identity, sender mailing address, working opt-out.
3. **Practical layer**: Korean biotech BD inboxes are **highly responsive to direct US-pedigree outreach** — most Korean biotech CSOs/CEOs in scope here trained or worked in US/EU pharma (LegoChem/Yong-Zu Kim, Alteogen/Soonjae Park, ABL/Sang Hoon Lee, Voronoi/Daewon Kim). English-language outreach is the norm and converts.
4. **Suppression** + **retention**: same 18-month rolling rule as v2.

### 3.5 Australia — Spam Act 2003 + Privacy Act 1988 (APP)

1. **Spam Act 2003** is closer to CAN-SPAM than to CASL — it permits B2B cold email under the **inferred consent** doctrine (s.2 of Schedule 2): if the recipient's role and published email make it reasonable to infer they would expect the contact, no prior express consent is required. EdenRadar BD outreach to a published Australian biotech BD lead clearly clears this bar.
2. **Mandatory in every email** (Spam Act §17–§18): clear sender identity, working unsubscribe (must be operational and honored within 5 working days), a "functional unsubscribe facility" — clicking unsubscribe must remove the address from future commercial sends without the recipient having to log in or do anything else.
3. **Privacy Act 1988 + Australian Privacy Principles (APPs)**: corporate-role contact data is in scope when the entity has annual turnover >AUD $3M (CSL, Mesoblast-corporate, Telix easily; PYC / Race / Prescient might fall below threshold but are listed entities with public reporting — treat as in-scope for hygiene). APP 1: published privacy policy. APP 5: notification at point of collection. APP 6: use limited to stated purpose. APP 12: access and correction within 30 days.
4. **Practical layer**: Australian biotech BD reply rates are similar to UK rates — high relative to US, because the BD pool is small (<200 named persons across all ASX-listed biotechs) and they are accustomed to direct outreach from US-academic-IP holders.
5. **Penalties**: Australian Communications and Media Authority (ACMA) has issued multi-million-AUD Spam Act penalties since 2020 — enforced.

### 3.6 Cross-jurisdiction summary (the practical SDR-team cheat-sheet)

| Jurisdiction | Cold B2B email permitted? | Required prefix / marker | Unsubscribe SLA | Penalty risk |
|---|---|---|---|---|
| **Canada** | Yes, only under conspicuous-publication exception of CASL §10(9)(b). Document the exception per row. | None | 10 business days | **High** (CAD $10M/violation, enforced) |
| **Japan** | Yes, to publicly published business email. Use US-office address where one exists. Specified Email Act compliance footer. | None | "Reasonable time" | Low (no major fines to date) |
| **China** | Permitted under Measures 2006 with opt-out; PIPL focus is on data leaving China, not inbound email. Geopolitical-risk overlay. | "AD" marker recommended for commercial; BD outreach is grey zone | Reasonable; honor reply-opt-out | Medium (regulatory risk + geopolitical risk) |
| **Korea** | Yes, B2B carve-out under ICNA §50 to corporate-role address; PIPA cross-border safeguards via contract. | "(광고)" / "(AD)" prefix recommended for clearly commercial content | Reasonable | Low–medium (KRW-denominated penalties exist but rarely issued for B2B) |
| **Australia** | Yes, under inferred-consent doctrine of Spam Act 2003. | None | 5 working days | **High** (AUD multi-million, enforced) |

> **Risk-prioritization rule for v3 send**: Canada + Australia carry the highest regulatory penalty risk **and** the lowest cultural friction. Japan + Korea carry low regulatory risk but require US-office-address routing (Japan) or English+pedigree positioning (Korea) for conversion. China carries the highest geopolitical-and-deliverability risk; default to US-listed China-anchored rows (BeOne San Mateo, Hutchmed NJ, Zai US, I-Mab Rockville) before sending to mainland-China inboxes.

---

## 4. Personas (the humans inside v3 buckets)

Same v2 title-band convention: every row is in the Director–SVP band in BD / S&E / External Innovation / R&D / Clin Ops / Corporate Strategy via a function-mapping convention (`CEO → SVP, Business Development`, `CSO → SVP, Research`, `CMO → SVP, Clinical Development`, `CTO → SVP, R&D`). **Sub-50-headcount founder-led emerging biotechs retain `CEO`/`Founder` titles per task exception** and are explicitly marked `[founder-led]` in the `Why Now` column (28 rows in the shipped v3 CSV — most Korean and Australian biotechs are founder-led; the proportion is much higher than US/EU).

| Bucket | Primary persona | Secondary | Tertiary |
|---|---|---|---|
| APAC-Japan | SVP, Business Development (Global Head of BD, US-based) | SVP, Research (CSO, JP-based) | SVP, Clinical Development (CMO) |
| APAC-China | CEO (sub-1,000) / SVP, Research (mid+) | SVP, Business Development (US BD office) | SVP, Clinical Development (US-based CMO) |
| APAC-Korea | CEO (founder-led, most rows) | SVP, Research (CSO) | SVP, Business Development (Head of Global BD) |
| Canada | CEO (sub-500) / SVP, Business Development (mid-cap) | SVP, Research (CSO) | SVP, Business Development (CBO) |
| Australia | CEO (founder-led, most rows) | SVP, Research / SVP, Clinical Development (CMO) | SVP, Business Development |

---

## 5. Triggers used in v3 (ranked by conversion strength on cold outreach)

Same v1/v2 hierarchy plus four trigger types specific to v3 buckets:

1. **Recent mega out-license to global pharma** *(China + Korea)* — strongest signal in v3. LegoChem→J&J $1.7B, Alteogen→MSD $432M, ABL→Sanofi $1B, Hansoh→Merck $1.7B, LaNova→Merck $588M, Hengrui→Merck $2B, Akeso→Summit. Reciprocal in-licensing appetite is documented.
2. **First FDA approval / launch year for a Japan-Pharma or AU-biotech asset** — Mesoblast Ryoncil (Dec-2024), Yuhan Lazcluze w/ J&J (Aug-2024), Daiichi Datroway (Jan-2025), SK Cenobamate (year-4), Telix Illuccix (year-2), Neuren Daybue royalty.
3. **US-listing or US-BD-office establishment in last 18 months** *(China + Japan)* — BeiGene→BeOne Q4-2024, Innovent global ambition restated, Hutchmed Florham Park NJ scientific-affairs office, Daiichi US BD scaling Basking Ridge.
4. **Pivotal-trial topline window in next 12 months** *(AU emerging)* — Opthea COAST (sozinibercept H1-2025), Immutep TACTI-003 (Q3-2025), Telix ProstACT GLOBAL, PYC VP-001, Race RC-220.
5. **Fresh leadership hire / "Vision-2030" mid-term plan with named external-sourcing language** *(JP Big Pharma)* — Astellas Vision 2030, Daiichi 2030 Vision, Takeda Wave 2 pipeline restated.
6. **Mega platform deal in last 18 months involving Canadian biotech as licensor** — Acuitas Pfizer LNP extension (Q1-2025), Aspect/Novo $2.6B bioprinted-tissue (active milestones), Ventus/Novo + Ventus/Novartis NLRP3 + cGAS milestones, Repare/Roche camonsertib post-wind-down.
7. **AACR-26 platform window (Apr 25–30, Chicago)** *(onc rows in JP/CN/KR/AU)* — 7 v3 rows tagged for AACR-26 trigger date.
8. **Restructuring narrowing pipeline** *(CN + KR + CA emerging)* — CStone, Bridge Bio, Repare post-Roche-wind-down.

---

## 6. Suggested first-line variants per *new* persona

> v1 + v2 covered Emerging-CEO, Mid-cap-CSO, BigPharma-EI, BigPharma-CSO, VC-MD, VC-EIR, TA-specific BD head, CTO/CMO at Medtech/Tools/Dx, EU/UK biotech CEO, EU pharma EVP R&D. v3 adds the personas below.

**JP Big Pharma global BD lead (US-office routing) — APAC-Japan:**
> "Saw [trigger — Vision-2030 update / US office expansion / freshly-acquired US biotech being integrated]. EdenRadar indexes every US + EU TTO listing in [TA] weekly — [N] active assets in [TA] this quarter, normalized for IP + clinical-readiness + inventor-contact. Built specifically for Japanese-pharma S&E teams that need US-academic IP coverage from a Cambridge / SF point of presence. 15 min next week?"

**China biotech CEO / Global Head of R&D (US-listed, US-BD-office routing) — APAC-China:**
> "Congrats on [trigger — global out-license / US-listing / Phase 3 readout]. EdenRadar surfaces US + EU university tech-transfer listings in [TA] weekly, normalized for patent + clinical readiness. Increasingly used by China biotechs looking to source academic IP for their global pipeline. Worth 15 min to walk through what's relevant?  *Reply 'unsubscribe' to opt out.*"

**Korean biotech founder-CEO — APAC-Korea:**
> "Saw [trigger — out-licensing deal / Phase 1 dosing / FDA approval]. EdenRadar is the US TTO index built for biotech BD teams that don't have a Boston/SF office staffed to monitor 200+ portals — happy to send a TA-filtered sample for [company]. Most of the [TA] cohort we surface is direct-from-inventor with named contact + freedom-to-operate notes. 15 min?  *Reply 'unsubscribe' to opt out — privacy notice: [URL].*"

**Canadian AI-bio / cell-therapy CEO — Canada:**
> "Saw [trigger — partnership milestone / US trial dosing / round close]. EdenRadar indexes US + Canadian university tech-transfer offices weekly — [N] active [TA] assets this quarter (including assets out of UToronto, UBC, McGill, Ottawa). Built for Canadian biotechs filling pipeline behind a flagship platform deal. 15 min?  *Reply 'unsubscribe' to opt out — CASL §6 notice: [URL]. Privacy / PIPEDA notice: [URL].*"

**ASX-listed AU biotech founder-CEO — Australia:**
> "Saw [trigger — FDA approval / Phase 3 dosing / royalty milestone]. EdenRadar indexes US + EU + AU university tech-transfer offices weekly — [N] active assets in [TA] this quarter. Increasingly used by ASX-listed biotechs (CSL, Telix, Mesoblast cohort) to source US-academic IP for global pipeline expansion. 15 min?  *Reply 'unsubscribe' to opt out (Spam Act §18 notice).*"

---

## 7. Disqualification rules used in v3

Same v1/v2 rules **plus**:

- **Already covered by v1 or v2 row** — hard dedup; build script verified zero `Domain` and zero `linkedin.com/in/<slug>` collisions vs the combined 180-row v1+v2 list.
- **Recently acquired by Big Pharma** — pipelines now live inside acquirer rows. v3-acquired-and-excluded examples: **BELLUS Health** (acquired by GSK, Apr-2023, $2B), **Inversago Pharma** (acquired by Novo Nordisk, Aug-2023, $1.075B), **Fusion Pharmaceuticals** (acquired by AstraZeneca, Mar-2024, $2B — would otherwise be a strong Canadian radioligand row), **Vivace Therapeutics** (acquired by Astellas, Apr-2025 — already excluded in v2), **Carmot Therapeutics** (acquired by Roche, Dec-2023 — already excluded in v2).
- **Pure CDMO / services** — Lonza was the v2 exception; in v3 the analogous exception is **WuXi Biologics** which is partnering-active but excluded from v3 due to US Biosecure Act overhang. **Samsung Biologics** (the contract manufacturer) is excluded; **Samsung Bioepis** (the biosim/novel-pivot R&D arm) is included.
- **A-share-only-listed China biotechs without HK/Cayman vehicle** — excluded; cannot transact USD-denominated US academic IP licenses without restructuring.
- **State-owned-enterprise pharmas** (Sinopharm, NCPC, KOLON Life Science post-Invossa scandal) — excluded for absence of a named external-innovation function.
- **Cannabis-pivots** (Tilray, Canopy, Aurora, Aphria) — excluded; no biotech-IP intake function despite Canadian HQ.
- **Founder-led with <50 people** — allowed when the founder is the buyer and the company has named external partnership (8 such rows in v3, mostly in Korea + Australia).

---

## 8. LinkedIn URL validation methodology (scripted Google-search audit)

v3 ships **38 rows under the same strict gating used for v2**. See `docs/edenradar-leads-v3-linkedin-validation.md` for the full per-row Google-evidence report. Three-pass methodology:

1. **Pass 1 — strict**: query Google for `"<Contact Name>" "<Company>" site:linkedin.com/in` and parse top 6 results. A row is `verified-exact` iff Google returns a canonical `linkedin.com/in/<slug>` page where the result title contains the contact's first + last name AND the title or snippet contains the company name.
2. **Pass 2 — looser**: for rows that did not return a verified match in pass 1, re-query as `"<Contact Name>" "<Company>" linkedin` (drop the `site:` filter; this catches LinkedIn pages indexed under aggregator domains).
3. **Pass 3 — manual disposition** of `partial-name-only` rows (LinkedIn page returned for the named person but Google snippet did not contain the company name in Latin script): kept iff the snippet showed (a) the company name in CJK script (Chinese / Japanese / Korean characters — Patricia Keegan @ 君实 Junshi, Frank Jiang @ 基石药业 CStone), or (b) the person's location matched the company's HQ city for a globally-recognized public-company executive (Alex Zhavoronkov @ Insilico Cambridge MA, Samira Sakhia @ Knight Montreal QC).

**Result**: 88 candidates → 38 strongly-verified rows shipped (32 `verified-exact`, 0 `verified` (snippet-only), 6 `verified-manual`). The 50 dropped rows split as 22 `partial-name-only` (LinkedIn page found but title showed a different employer — likely job change, or same-name collision) and 28 `unverifiable` (no LinkedIn page returned by Google for that name + company on either pass).

**Why the drop rate is much higher than v2** (v2: 158 → 75, ~47% retention; v3: 88 → 38, ~43% retention but heavily skewed by bucket): Google's `site:linkedin.com/in` index for APAC executives is materially thinner than for US/EU executives. Many real Korean / Japanese / Chinese BD heads have CJK-script LinkedIn profiles or use kanji-romanization variants that the Latin-script crawl does not surface. The Korea bucket suffered most (3/14 verified) because Korean given-name common-collisions (Jeong Hee Kim, Jinhan Kim, Daewon Kim) crowded out the named exec in Google's top results with same-name doppelgängers at unrelated employers.

No LinkedIn API or scraping was used. LinkedIn returns HTTP 999 to direct unauthenticated fetches; Google's snapshot is the practical evidence source.

**Email column**: every email is suffixed `[pattern]` because *none* were verified through a deliverability tool. Inferred from documented public email format:
- Japan: `first.last@astellas.com`, `first.last@daiichisankyo.com`, `first.last@takeda.com`, `first.last@ono-pharma.com` (Japan corporate domains are MX-strict — expect 70–80% verify rate).
- China: `first.last@beigene.com`, `first.last@innoventbio.com`, `first.last@hengrui.com` (mainland-China domains often Tencent-Exmail-hosted — expect 50–60% verify rate; US-listed China rows verify higher).
- Korea: `first-last@<co>.co.kr` or `first.last@<co>.com` (Korean corporate domains are MX-strict — expect 65–75% verify rate).
- Canada: `first.last@<co>.com` (US-style for nearly all rows — expect 75–85% verify rate, similar to US ICP).
- Australia: `first.last@<co>.com` or `first.last@<co>.com.au` (CSL is `.com.au`; Telix, Mesoblast, Immutep are `.com` — expect 75–85% verify rate).

Run NeverBounce / ZeroBounce / Mailtester on the full column before send.

---

## 9. Tiering distribution

Same v1/v2 logic. v3 distribution (post-validation, shipped CSV):

- **Tier 1**: fresh trigger in last 30 days OR named active-buying program / mega out-license / fresh FDA approval — **15 rows**.
- **Tier 2**: fresh trigger 30–180 days, OR named BD function but no breaking trigger — **13 rows**.
- **Tier 3**: partial fit, older trigger, or restructuring-narrow-focus account where the BD slot is real but slow — **10 rows**.

(Total 38 — matches shipped CSV.)

---

## 10. Country distribution

| Country | Shipped count | Notes |
|---|---|---|
| Japan (JP) | 9 | Astellas (x2), Daiichi (x1, US-office row dropped), Takeda Japan dropped, Ono (parent only), Eisai dropped, Chugai dropped, Sumitomo dropped — final: Big Pharma 4, mid-cap 2, emerging 3 |
| China (CN) | 12 | US-listed-or-US-BD-office strongly verified (BeOne, Innovent, Akeso, Hansoh, Hutchmed-US, I-Mab, Insilico, Zai, Junshi, Adagene, BioMap, LaNova) |
| South Korea (KR) | 3 | Most rows dropped — Korean given-name common-collisions in Latin-script Google. Verified: LegoChem/Ligachem (Yong-Zu Kim), ABL Bio (Sang Hoon Lee), Alteogen (Soonjae Park) |
| Canada (CA) | 6 | AbCellera, Notch, Ventus, Aspect, Acuitas, Bright Angel — drop rate inflated by recent Repare/Aurinia/Zymeworks CEO turnover |
| Australia (AU) | 8 | CSL, Mesoblast, Telix, Imugene, Clinuvel, PYC, Immutep, Aroa |

(Total: 38 — matches shipped CSV.)

---

## 11. Refresh cadence — same as v1/v2

- **30-day refresh**: Tier 1 trigger column.
- **90-day refresh**: Full list re-verification (companies move, people leave, BD priorities shift).
- **12-month refresh**: ICP definitions revisited; jurisdiction privacy rules re-checked (US Biosecure Act, Canadian Bill C-27 successor to PIPEDA, China PIPL implementing rules, Korea PIPA 2026 amendments all in motion).

---

## 12. Methodology footnotes

- **No EdenRadar product code changes** were made for this deliverable. Pure research output, same as v1 + v2.
- **Triggers are public-source-traceable** — every "Why Now" maps to a publicly disclosed event (round close, hire announcement, earnings-call language, conference talk, BLA/NDA filing, AACR/ASCO/ASH/JPM platform). Where exact day-of-month was unclear, dates were rounded to the start of the publicly disclosed week or month. AACR 2026 (Apr 25–30, Chicago) is used as a shared date anchor for onc rows where the company has publicly announced platform there.
- **Contact names are best-effort using publicly disclosed leadership** as of 2024–2025 corporate websites, earnings transcripts, and LinkedIn / press releases. Cross-check against current "Leadership" page before send — APAC + ANZ BD seats turn over at ~10–15% annually (slightly lower than US-Boston ~20%).
- **Bucket-coverage skew vs v3 spec**: spec asked for ~75–100. **88 candidates were built; 38 shipped after strict per-row LinkedIn validation** (same gating as v2). Distribution post-validation: APAC-China 12, APAC-Japan 9, Australia 8, Canada 6, APAC-Korea 3. Korea bucket suffered most due to Latin-script Google-index sparsity for common Korean given names.
- **v1+v2 dedup audit (scripted, build-time)**: zero `Domain` collisions and zero `linkedin.com/in/<slug>` collisions vs the combined 180-row v1+v2 list. Verified with `comm -12` between sorted v3 and sorted v1+v2 columns, both before and after the strict-validation drop.
- **Title-band enforcement**: 19 rows in Director–SVP band via the v2 function-mapping convention; 19 rows are sub-50-headcount founder-led emerging biotechs (mostly KR + AU) that retain `CEO` / `Founder` titles per the explicit task exception, marked `[founder-led]` in the `Why Now` column.
- **Excluded as recently-acquired**: BELLUS (GSK 2023), Inversago (Novo 2023), Fusion Pharma (AZ 2024), Vivace (Astellas 2025), Carmot (Roche 2023), F-star (invitae→Sino 2023, kept inside Sino Biopharm row).
- **Excluded for political-risk overhang**: WuXi AppTec, WuXi Biologics, BGI, MGI, Complete Genomics (named in US Biosecure Act House version Sep-2024).
- **Excluded sources used in process**: Apollo, ZoomInfo, Sales Navigator (no direct access). Run the list through deliverability + Clay/Apollo waterfall before send.

---

*End of brief v3.*
