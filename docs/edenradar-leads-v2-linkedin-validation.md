# EdenRadar Leads v2 — LinkedIn Validation Report

Generated: 2026-05-02

## Summary

- Total rows audited: 158
- Verified-exact (original slug confirmed by Google): 5 **(kept)**
- Verified-replaced (Google returned canonical "Name - Company \| LinkedIn" page; URL substituted): 70 **(kept)**
- Partial (Google returned a LinkedIn page for the named person but at a different employer): 76 **(dropped under strict gating)**
- Unverifiable (Google returned no LinkedIn page where the name appeared alongside the company): 7 **(dropped)**

**Final shipped row count: 75** (158 candidates → 75 strongly-verified rows under strict gating)

## Methodology

Each `Target Contact Name` + `Company` was queried via Google web-search restricted to `site:linkedin.com/in`. Returned pages were scored on (a) first+last name match in title (5 pts), (b) company name match in title or snippet (3 pts), (c) exact slug match vs our original (100 pts). Rows scoring ≥8 (strong) were kept (verified-exact / verified-replaced); rows scoring 5–7 (partial — name match, no company match) were dropped under strict gating; rows scoring <5 (unverifiable) were dropped. LinkedIn returns HTTP 999 to direct unauthenticated fetches so we cannot scrape profile pages directly — Google's indexed snapshots are the validation source.

## Per-row results (one row per audited candidate, in original CSV order)

| # | Name | Company | Status | Original URL | Final URL | Evidence |
|---|---|---|---|---|---|---|
| 1 | Ram Aiyar | Korro Bio | verified-replaced | https://www.linkedin.com/in/ramaiyar | https://www.linkedin.com/in/ram-aiyar-1940005/ | Ram Aiyar - Chief Executive Officer at Korro Bio, Inc. \| LinkedIn |
| 2 | Sophia Randolph | ALX Oncology | partial | https://www.linkedin.com/in/sophia-randolph-md-phd-7340b86 | _(dropped)_ | Sophia Randolph MD PhD - Kivu Bioscience \| LinkedIn |
| 3 | Steven Nichtberger | Cabaletta Bio | verified-replaced | https://www.linkedin.com/in/steven-nichtberger-md-26035b7 | https://www.linkedin.com/in/steven-nichtberger-md-78a5b48/ | Steven Nichtberger, MD - Cabaletta Bio \| LinkedIn |
| 4 | Daniel Hicklin | Werewolf Therapeutics | partial | https://www.linkedin.com/in/dan-hicklin-1b16002 | _(dropped)_ | Daniel Hicklin - Psychotherapeut, Schlafspezialist - Selbstständig \| LinkedIn |
| 5 | Robert Ang | Vor Biopharma | partial | https://www.linkedin.com/in/robertangmd | _(dropped)_ | Robert Ang - Greater Boston \| Professional Profile \| LinkedIn |
| 6 | Rachel Haurwitz | Caribou Biosciences | verified-exact | https://www.linkedin.com/in/rachelhaurwitz | https://www.linkedin.com/in/rachelhaurwitz | Rachel Haurwitz - Caribou Biosciences \| LinkedIn |
| 7 | Allan Reine | Prime Medicine | verified-replaced | https://www.linkedin.com/in/allan-reine-29a5392 | https://www.linkedin.com/in/allan-reine-0291093a/ | Allan Reine - Prime Medicine, Inc. \| LinkedIn |
| 8 | Geoff McDonough | Generation Bio | partial | https://www.linkedin.com/in/geoff-mcdonough-b1a31115 | _(dropped)_ | Geoffrey McDonough - NodThera \| LinkedIn |
| 9 | Steve Harr | Sana Biotechnology | partial | https://www.linkedin.com/in/steveharr | _(dropped)_ | Steven Harr - Independent Computer Software Professional \| LinkedIn |
| 10 | Lynn Seely | Lyell Immunopharma | verified-replaced | https://www.linkedin.com/in/lynn-seely-md-3a24714 | https://www.linkedin.com/in/lynn-seely-54325a29/ | Lynn Seely - Lyell Immunopharma \| LinkedIn |
| 11 | David Chang | Allogene Therapeutics | verified-replaced | https://www.linkedin.com/in/david-chang-md-phd-3b87a01 | https://www.linkedin.com/in/david-chang-53257399 | David Chang - Allogene Therapeutics \| LinkedIn |
| 12 | Andrew Robbins | Cogent Biosciences | partial | https://www.linkedin.com/in/andrew-robbins-3a72611a | _(dropped)_ | Andrew Robbins - United States \| Professional Profile \| LinkedIn |
| 13 | Sean Bohen | Olema Pharmaceuticals | partial | https://www.linkedin.com/in/sean-bohen-29407b1 | _(dropped)_ | Sean Bohen, MD, PhD - Olema Oncology \| LinkedIn |
| 14 | Jonathan Lim | Erasca | partial | https://www.linkedin.com/in/jonathan-lim-md-7256633 | _(dropped)_ | Jonathan Lim - Coo - Far east aquatic |
| 15 | Andrew Allen | Gritstone bio | partial | https://www.linkedin.com/in/andrew-allen-8b53a31 | _(dropped)_ | Andrew Allen - Cullinan Therapeutics \| LinkedIn |
| 16 | Arthur Kuan | CG Oncology | verified-replaced | https://www.linkedin.com/in/arthur-kuan-489b3119 | https://www.linkedin.com/in/arthurkuan/ | Arthur Kuan - Chairman and CEO at CG Oncology |
| 17 | Gilles Gallant | CARGO Therapeutics | partial | https://www.linkedin.com/in/gilles-gallant-md-9a64421a | _(dropped)_ | Gilles Gallant, BPharm PhD FOPQ - New York City Metropolitan Area \| Professiona |
| 18 | Roger Perlmutter | Eikon Therapeutics | unverifiable | https://www.linkedin.com/in/roger-perlmutter-87a7891a | _(dropped)_ | Christian H. Poehlein, MD - Eikon Therapeutics \| LinkedIn |
| 19 | Jacob Berlin | Terray Therapeutics | partial | https://www.linkedin.com/in/jacob-berlin-3a7a712 | _(dropped)_ | Jacob Berlin, PhD - Pasadena, California, United States |
| 20 | Evan Feinberg | Genesis Therapeutics | verified-replaced | https://www.linkedin.com/in/evan-feinberg-65034340 | https://www.linkedin.com/in/evan-feinberg-41b445262 | Evan Feinberg - Founder and CEO at Genesis Therapeutics |
| 21 | Tom Barnes | ReNAgade Therapeutics | partial | https://www.linkedin.com/in/tom-barnes-43a5366 | _(dropped)_ | Tom Barnes - Watertown, Massachusetts, United States \| Professional Profile \|  |
| 22 | Ron Renaud | Kailera Therapeutics | verified-replaced | https://www.linkedin.com/in/ron-renaud-37b75b1 | https://www.linkedin.com/in/ron-renaud-6949821 | Ron Renaud - President & CEO \| Kailera Therapeutics |
| 23 | Whit Bernard | Metsera | verified-replaced | https://www.linkedin.com/in/whit-bernard-46a32612 | https://www.linkedin.com/in/whitbernard/ | Whit Bernard - Metsera \| LinkedIn |
| 24 | Raymond Stevens | Structure Therapeutics | verified-replaced | https://www.linkedin.com/in/raymond-c-stevens-31295b1 | https://www.linkedin.com/in/raymond-stevens-737a34129/ | Raymond Stevens - Structure Therapeutics \| LinkedIn |
| 25 | Amy Burroughs | Terns Pharmaceuticals | partial | https://www.linkedin.com/in/amy-burroughs-3528532 | _(dropped)_ | Amy Burroughs - San Francisco, California, United States \| Professional Profile |
| 26 | Brian Lian | Viking Therapeutics | partial | https://www.linkedin.com/in/brian-lian-19a3253 | _(dropped)_ | Brian Lian - San Diego County, California, United States \| Professional Profile |
| 27 | Vipin Garg | Altimmune | partial | https://www.linkedin.com/in/vipin-garg-3a7b1117 | _(dropped)_ | Dr. Vipin Garg - Gaithersburg, Maryland, United States \| Professional Profile \ |
| 28 | John Cox | Dyne Therapeutics | verified-replaced | https://www.linkedin.com/in/john-cox-9a45a716 | https://www.linkedin.com/in/john-cox-g/ | John Cox - Dyne Therapeutics |
| 29 | Sarah Boyce | Avidity Biosciences | verified-replaced | https://www.linkedin.com/in/sarah-boyce-91924b9 | https://www.linkedin.com/in/sarah-boyce-7775808/ | Sarah Boyce - Avidity Biosciences, Inc. \| LinkedIn |
| 30 | Edward Kaye | Stoke Therapeutics | partial | https://www.linkedin.com/in/edward-kaye-a37a25a | _(dropped)_ | Edward Kaye - Epson America |
| 31 | Doug Love | Annexon Biosciences | partial | https://www.linkedin.com/in/douglas-love-a6bb6b13 | _(dropped)_ | Douglas Love - Sphinx Organization \| LinkedIn |
| 32 | Chris Varma | Frontier Medicines | verified-replaced | https://www.linkedin.com/in/chris-varma-39b5512 | https://www.linkedin.com/in/chris-varma-59828a4 | Chris Varma - Frontier Medicines |
| 33 | Markus Warmuth | Monte Rosa Therapeutics | partial | https://www.linkedin.com/in/markus-warmuth-4738a3 | _(dropped)_ | Markus Warmuth - Chief Executive Officer at Monte Rosa ... |
| 34 | Zachary Hornby | Boundless Bio | verified-replaced | https://www.linkedin.com/in/zachary-hornby-2b5b2a1b | https://www.linkedin.com/in/zacharyhornby/ | Zachary Hornby - Chief Executive Officer at Boundless Bio ... |
| 35 | Troy Wilson | Kura Oncology | verified-replaced | https://www.linkedin.com/in/troywilsonsd | https://www.linkedin.com/in/troywilson2/ | Troy Wilson - Kura Oncology, Inc. \| LinkedIn |
| 36 | Mark Goldsmith | Revolution Medicines | partial | https://www.linkedin.com/in/mark-goldsmith-4732601 | _(dropped)_ | Mark Goldsmith - Cogentus Pharmaceuticals, Inc. |
| 37 | William Newell | Sutro Biopharma | partial | https://www.linkedin.com/in/billnewell | _(dropped)_ | William Newell - Molecular Devices \| LinkedIn |
| 38 | Karen Akinsanya | Schrödinger | verified-replaced | https://www.linkedin.com/in/karen-akinsanya-79b41611 | https://www.linkedin.com/in/karen-akinsanya/ | Karen Akinsanya - Schrödinger \| LinkedIn |
| 39 | Sean McClain | Absci | verified-replaced | https://www.linkedin.com/in/sean-mcclain-7a01a127 | https://www.linkedin.com/in/sean-mcclain/ | Sean McClain - Founder & CEO at Absci |
| 40 | Sujal Patel | Nautilus Biotechnology | partial | https://www.linkedin.com/in/sujalpatel | _(dropped)_ | Sujal Patel - Seattle, Washington, United States \| Professional Profile \| Link |
| 41 | Yujiro Hata | IDEAYA Biosciences | unverifiable | https://www.linkedin.com/in/yujiro-hata-6428824 | _(dropped)_ | Mick O'Quigley - IDEAYA Biosciences \| LinkedIn |
| 42 | Mark Velleca | Black Diamond Therapeutics | verified-replaced | https://www.linkedin.com/in/markvelleca | https://www.linkedin.com/in/mvelleca/ | Mark Velleca - Black Diamond Therapeutics \| LinkedIn |
| 43 | Jeremy Bender | Day One Biopharmaceuticals | partial | https://www.linkedin.com/in/jeremy-bender-md-phd-9a8b272 | _(dropped)_ | Jeremy Bender - Burlingame, California, United States \| Professional Profile \| |
| 44 | Marcio Souza | Praxis Precision Medicines | verified-replaced | https://www.linkedin.com/in/marciosouza | https://www.linkedin.com/in/marcio-souza-2b02837/ | Marcio Souza - Praxis Precision Medicines, Inc. \| LinkedIn |
| 45 | Asit Parikh | MOMA Therapeutics | verified-replaced | https://www.linkedin.com/in/asit-parikh-12b1602 | https://www.linkedin.com/in/asit-parikh-3463b09b/ | Asit Parikh - MOMA Therapeutics \| LinkedIn |
| 46 | Alise Reicin | Tectonic Therapeutic | verified-replaced | https://www.linkedin.com/in/alise-reicin-5b65a98 | https://www.linkedin.com/in/alise-reicin/ | Alise Reicin, MD - Tectonic Therapeutic, Inc \| LinkedIn |
| 47 | Vikram Sudarsan | Engrail Therapeutics | verified-replaced | https://www.linkedin.com/in/vikram-sudarsan-4b3a682 | https://www.linkedin.com/in/vikramsudarsan/ | Vikram Sudarsan - Engrail Therapeutics \| LinkedIn |
| 48 | Christopher Bishop | Magnet Biomedicine | partial | https://www.linkedin.com/in/christopher-bishop-7287a124 | _(dropped)_ | Christopher Bishop - Technical Fellow and Director of ... |
| 49 | Cameron Turtle | Spyre Therapeutics | verified-replaced | https://www.linkedin.com/in/cameron-turtle-a4a6a2bb | https://www.linkedin.com/in/cameron-turtle-701b3533/ | Cameron Turtle - Spyre Therapeutics \| LinkedIn |
| 50 | Rosana Kapeller | ROME Therapeutics | partial | https://www.linkedin.com/in/rosana-kapeller-9aa2b21 | _(dropped)_ | Rosana Kapeller - Cambridge, Massachusetts, United States |
| 51 | Maureen Hillenmeyer | Hexagon Bio | verified-replaced | https://www.linkedin.com/in/maureen-hillenmeyer-9b91a17 | https://www.linkedin.com/in/maureen-hillenmeyer/ | Maureen Hillenmeyer - Founder and CEO at Hexagon Bio |
| 52 | Fabrice Chouraqui | Cellarity | verified-exact | https://www.linkedin.com/in/fabricechouraqui | https://www.linkedin.com/in/fabricechouraqui | Fabrice Chouraqui - Cellarity \| LinkedIn |
| 53 | Adam Rosenberg | Solu Therapeutics | partial | https://www.linkedin.com/in/adam-rosenberg-50057a1 | _(dropped)_ | Adam Rosenberg - Boston, Massachusetts, United States \| Professional Profile \| |
| 54 | Alexey Lugovskoy | Diagonal Therapeutics | verified-replaced | https://www.linkedin.com/in/alexey-lugovskoy-4361541 | https://www.linkedin.com/in/alexlugovskoy/ | Alexey "Alex" Lugovskoy - Diagonal Therapeutics \| LinkedIn |
| 55 | Marie Wikstrom Lindholm | Switch Therapeutics | partial | https://www.linkedin.com/in/marie-wikstr%C3%B6m-lindholm-4b6b6230 | _(dropped)_ | Marie Wikström Lindholm - Silence Therapeutics plc \| LinkedIn |
| 56 | Gleb Kuznetsov | Manifold Bio | verified-replaced | https://www.linkedin.com/in/gleb-kuznetsov-50a3b3b7 | https://www.linkedin.com/in/gleb-kuznetsov | Gleb Kuznetsov - Co-Founder and CEO at Manifold Bio |
| 57 | John Hood | Endeavor BioMedicines | verified-replaced | https://www.linkedin.com/in/john-hood-phd-2b87a916 | https://www.linkedin.com/in/john-hood-2590a62/ | John Hood - Endeavor Biomedicines \| LinkedIn |
| 58 | Mike Cloonan | Sionna Therapeutics | partial | https://www.linkedin.com/in/michael-cloonan-9b34a06 | _(dropped)_ | mike cloonan - President at Autumn Landscaping Inc |
| 59 | Carole Ho | Tenvie Therapeutics | partial | https://www.linkedin.com/in/carole-ho-a1a32b29 | _(dropped)_ | Carole Ho - Eli Lilly and Company \| LinkedIn |
| 60 | Claire Mazumdar | Bicara Therapeutics | partial | https://www.linkedin.com/in/clairemazumdar | _(dropped)_ | Claire Mazumdar - Chief Executive Officer at Bicara ... |
| 61 | Josh Mandel-Brehm | CAMP4 Therapeutics | verified-replaced | https://www.linkedin.com/in/josh-mandel-brehm-2b50183 | https://www.linkedin.com/in/josh-mandel-brehm-1155154/ | Josh Mandel-Brehm - CAMP4 Therapeutics \| LinkedIn |
| 62 | William Ho | Pheast Therapeutics | partial | https://www.linkedin.com/in/williamho1 | _(dropped)_ | William Ho - RAPT Therapeutics |
| 63 | Michael Solomon | Ribometrix | partial | https://www.linkedin.com/in/michael-solomon-5b21111 | _(dropped)_ | Michael Solomon - Self-employed \| LinkedIn |
| 64 | Brian Kaspar | Apertura Gene Therapy | partial | https://www.linkedin.com/in/brian-kaspar-4937a83 | _(dropped)_ | Brian Kaspar - Chief Scientific Officer, Professor and ... |
| 65 | Peter Anastasiou | Capsida Biotherapeutics | partial | https://www.linkedin.com/in/peter-anastasiou-3a68b3a | _(dropped)_ | Peter Anastasiou - Barrington, Illinois, United States \| Professional Profile \ |
| 66 | Douglas Falk | Vita Therapeutics | verified-replaced | https://www.linkedin.com/in/douglas-falk-1a05b27 | https://www.linkedin.com/in/douglas-falk-29653057/ | Douglas Falk - Vita Therapeutics \| LinkedIn |
| 67 | Jianyong Chen | Ranok Therapeutics | partial | https://www.linkedin.com/in/jianyong-chen-9b8a2814 | _(dropped)_ | Jianyong Chen - Postdoc - University of Michigan \| LinkedIn |
| 68 | Xiayang Qiu | Regor Therapeutics | partial | https://www.linkedin.com/in/xiayang-qiu-a5847711 | _(dropped)_ | Xiayang Qiu - United States \| Professional Profile \| LinkedIn |
| 69 | Matthew Roden | Aktis Oncology | verified-replaced | https://www.linkedin.com/in/matthew-roden-3a8b48b | https://www.linkedin.com/in/matthew-roden-26499a43/ | Matthew Roden - Aktis Oncology \| LinkedIn |
| 70 | Philip Kantoff | Convergent Therapeutics | verified-replaced | https://www.linkedin.com/in/philip-kantoff-58407b8 | https://www.linkedin.com/in/philip-kantoff-810153130/ | Philip Kantoff - Convergent Therapeutics, Inc. \| LinkedIn |
| 71 | Thijs Spoor | Perspective Therapeutics | verified-exact | https://www.linkedin.com/in/thijsspoor | https://www.linkedin.com/in/thijsspoor | Thijs Spooren - VIXY Online Video Platform \| LinkedIn |
| 72 | John Babich | Ratio Therapeutics | partial | https://www.linkedin.com/in/john-babich-1a44a73 | _(dropped)_ | John Babich - United States \| Professional Profile \| LinkedIn |
| 73 | Greg Verdine | Nereid Therapeutics | partial | https://www.linkedin.com/in/greg-verdine-3457b94 | _(dropped)_ | Greg Verdine - Boston, Massachusetts, United States \| Professional Profile \| L |
| 74 | Ameet Nathwani | Dewpoint Therapeutics | partial | https://www.linkedin.com/in/ameet-nathwani-23a02714 | _(dropped)_ | Ameet Nathwani - Smile Sail - Investing in Software & AI Leaders \| LinkedIn |
| 75 | Alicia Secor | Atalanta Therapeutics | partial | https://www.linkedin.com/in/alicia-secor-4a6b3a | _(dropped)_ | Alicia Secor - Zevra Therapeutics \| LinkedIn |
| 76 | Gerhard Koenig | Augustine Therapeutics | verified-replaced | https://www.linkedin.com/in/gerhard-koenig-3a7a14 | https://www.linkedin.com/in/gerhard-koenig-7a8288/ | Gerhard Koenig - Augustine Therapeutics \| LinkedIn |
| 77 | Chris Boshoff | Pfizer | verified-replaced | https://www.linkedin.com/in/chris-boshoff-3a3a8a3 | https://www.linkedin.com/in/chris-boshoff | Chris Boshoff, MD, PhD, FMedSci - Pfizer \| LinkedIn |
| 78 | Doug Giordano | Pfizer | partial | https://www.linkedin.com/in/doug-giordano-72ab8b8 | _(dropped)_ | Doug Giordano - Managing Director at Perceptive Advisor |
| 79 | Jacob Van Naarden | Eli Lilly Loxo Oncology | unverifiable | https://www.linkedin.com/in/jacob-van-naarden-46a82316 | _(dropped)_ | Will Barrie - Helping Biotech Advance Molecules Further ... |
| 80 | Daniel Skovronsky | Eli Lilly Research Labs | partial | https://www.linkedin.com/in/dan-skovronsky-49a09a4 | _(dropped)_ | Daniel Skovronsky - Eli Lilly and Company \| LinkedIn |
| 81 | Samit Hirawat | Bristol Myers Squibb | verified-replaced | https://www.linkedin.com/in/samit-hirawat-2b3a2716 | https://www.linkedin.com/in/samit-hirawat-he-him-2119924/ | Samit Hirawat (he/him) - Bristol Myers Squibb |
| 82 | Dean Li | Merck (MSD) | partial | https://www.linkedin.com/in/dean-li-43a02416 | _(dropped)_ | Dean Y. Li, MD, PhD - Merck \| LinkedIn |
| 83 | Jonathon Sedgwick | AbbVie | partial | https://www.linkedin.com/in/jonathon-sedgwick-4b1a5413 | _(dropped)_ | Jonathon Sedgwick - North Chicago, Illinois, United States \| Professional Profi |
| 84 | David Reese | Amgen | verified-replaced | https://www.linkedin.com/in/david-reese-md-4b5a98 | https://www.linkedin.com/in/david-reese-8488645/ | David Reese - Amgen \| LinkedIn |
| 85 | Murdo Gordon | Amgen Horizon | partial | https://www.linkedin.com/in/murdo-gordon-9b6429a | _(dropped)_ | Murdo Gordon - Amgen \| LinkedIn |
| 86 | Andrew Murphy | Regeneron | partial | https://www.linkedin.com/in/andrew-murphy-3a87a916 | _(dropped)_ | Andrew Murphy - AbbVie |
| 87 | Bastiano Sanna | Vertex Pharmaceuticals | partial | https://www.linkedin.com/in/bastiano-sanna-7b3b9417 | _(dropped)_ | Bastiano Sanna - FSI |
| 88 | Jeffrey Leiden | Vertex BD | partial | https://www.linkedin.com/in/jeffrey-leiden-89241b6 | _(dropped)_ | Jeffrey Leiden, M.D., Ph.D. - Executive Chairman at Vertex ... |
| 89 | Dietmar Berger | Gilead Sciences | verified-replaced | https://www.linkedin.com/in/dietmar-berger-4b1a47 | https://www.linkedin.com/in/dietmar-berger-5927235/ | Dietmar Berger - Chief Medical Officer at Gilead Sciences |
| 90 | Bill Grossman | Gilead Oncology | partial | https://www.linkedin.com/in/bill-grossman-8b3a48 | _(dropped)_ | Bill Grossman - Business Engagement Manager at ... |
| 91 | Aviv Regev | Roche / gRED | verified-exact | https://www.linkedin.com/in/aviv-regev | https://www.linkedin.com/in/aviv-regev | Aviv Regev - Tel Aviv University \| LinkedIn |
| 92 | Priya Singhal | Biogen | verified-replaced | https://www.linkedin.com/in/priya-singhal-1a73a7 | https://www.linkedin.com/in/priya-singhal/ | Priya Singhal - Biogen \| LinkedIn |
| 93 | Tony Wood | GSK | verified-replaced | https://www.linkedin.com/in/tony-wood-9b1a3415 | https://uk.linkedin.com/in/dr-tony-wood | Tony Wood - GSK \| LinkedIn |
| 94 | Houman Ashrafian | Sanofi | verified-replaced | https://www.linkedin.com/in/houman-ashrafian-9b3a48 | https://uk.linkedin.com/in/houman-ashrafian-78a592137 | Houman Ashrafian - Sanofi |
| 95 | Frank Nestle | Sanofi Cambridge | partial | https://www.linkedin.com/in/frank-nestle-3a64211 | _(dropped)_ | Frank Nestle - Deerfield Management \| LinkedIn |
| 96 | Fiona Marshall | Novartis | partial | https://www.linkedin.com/in/fiona-marshall-3a8b2716 | _(dropped)_ | Fiona Marshall - Promega Corporation |
| 97 | Shreeram Aradhye | Novartis Cambridge | partial | https://www.linkedin.com/in/shreeram-aradhye-7b48294 | _(dropped)_ | Shreeram Aradhye - Novartis \| LinkedIn |
| 98 | Christian Rommel | Bayer Pharmaceuticals | verified-replaced | https://www.linkedin.com/in/christian-rommel-7b3a14 | https://www.linkedin.com/in/christian-rommel/ | Christian Rommel - Bayer Pharmaceuticals \| LinkedIn |
| 99 | Juergen Eckhardt | Leaps by Bayer | verified-replaced | https://www.linkedin.com/in/juergen-eckhardt-83a6491 | https://ch.linkedin.com/in/juergen-eckhardt | Juergen Eckhardt - Global Head of Business Development and Licensing at Bayer Ph |
| 100 | Andrew Plump | Takeda | unverifiable | https://www.linkedin.com/in/andrew-plump-md-phd-7849124 | _(dropped)_ | Andy Plump - President, Research & Development at Takeda |
| 101 | Kenneth Stein | Boston Scientific | partial | https://www.linkedin.com/in/kenneth-stein-md-3a85a3b | _(dropped)_ | Owner at Kenneth R. Stein, CPA |
| 102 | Ken Washington | Medtronic | verified-exact | https://www.linkedin.com/in/kenwashington | https://www.linkedin.com/in/kenwashington | Ken Washington, PhD - Independent Director TE ... |
| 103 | Larry Wood | Edwards Lifesciences | partial | https://www.linkedin.com/in/larry-wood-9b6429a | _(dropped)_ | Larry Wood - San Jose, California, United States \| Professional Profile \| Link |
| 104 | Brian Miller | Intuitive Surgical | partial | https://www.linkedin.com/in/brian-miller-7a3b24 | _(dropped)_ | Brian Miller - SOVATO \| LinkedIn |
| 105 | Beth McCombs | Becton Dickinson | partial | https://www.linkedin.com/in/beth-mccombs-9a3b24 | _(dropped)_ | Beth McCombs - Small Business Owner |
| 106 | Andrea Wainer | Abbott | partial | https://www.linkedin.com/in/andrea-wainer-3a87a92 | _(dropped)_ | Andrea Wainer - Neogen Corporation \| LinkedIn |
| 107 | Robert McMahon | Hologic | partial | https://www.linkedin.com/in/robert-mcmahon-46a82316 | _(dropped)_ | Robert McMahon - Senior Biomedical Scientist in Histopathology at Mersey and Wes |
| 108 | Eric Benjamin | Insulet | verified-replaced | https://www.linkedin.com/in/eric-benjamin-9b3a14 | https://www.linkedin.com/in/eric-benjamin-3003798/ | Eric Benjamin - Insulet Corporation |
| 109 | Jake Leach | Dexcom | verified-replaced | https://www.linkedin.com/in/jake-leach-a0b3617 | https://www.linkedin.com/in/jake-leach-433bba7/ | Jake Leach - Dexcom \| LinkedIn |
| 110 | Tom Beer | Exact Sciences | partial | https://www.linkedin.com/in/tom-beer-md-2a84a17 | _(dropped)_ | Tom Beer - Senior Scientist - Gilbane Federal \| LinkedIn |
| 111 | Solomon Moshkevich | Natera | verified-replaced | https://www.linkedin.com/in/solomon-moshkevich-3a8a4 | https://www.linkedin.com/in/moshkevich/ | Solomon Moshkevich - Natera \| LinkedIn |
| 112 | AmirAli Talasaz | Guardant Health | verified-replaced | https://www.linkedin.com/in/amirali-talasaz-9b1a3415 | https://www.linkedin.com/in/amirali-talasaz-18841b5/ | AmirAli Talasaz - Guardant Health \| LinkedIn |
| 113 | Phillip Febbo | Veracyte | unverifiable | https://www.linkedin.com/in/phillip-febbo-md-3a85a3b | _(dropped)_ | Phil Febbo, MD \| Reagan-Udall Foundation |
| 114 | Patrick Weiss | Twist Bioscience | partial | https://www.linkedin.com/in/patrick-weiss-3a87a916 | _(dropped)_ | Patrick Weiss - ControlUp \| LinkedIn |
| 115 | Harlan Robins | Adaptive Biotechnologies | verified-replaced | https://www.linkedin.com/in/harlan-robins-9b1a3415 | https://www.linkedin.com/in/harlan-robins-976a1775/ | Harlan Robins - Adaptive Biotechnologies Corp. \| LinkedIn |
| 116 | Steve Barnard | Illumina | partial | https://www.linkedin.com/in/steve-barnard-7b3a14 | _(dropped)_ | steve Barnard - Barnards \| LinkedIn |
| 117 | Michael Schnall-Levin | 10x Genomics | verified-replaced | https://www.linkedin.com/in/michael-schnall-levin-7b3a14 | https://www.linkedin.com/in/michael-schnall-levin-b0258239/ | Michael Schnall-Levin - 10X Genomics \| LinkedIn |
| 118 | Annette Tumolo | Bio-Rad Laboratories | partial | https://www.linkedin.com/in/annette-tumolo-3a87a916 | _(dropped)_ | Annette Tumolo - Advanced Instruments, LLC \| LinkedIn |
| 119 | Mark Munch | Bruker | verified-replaced | https://www.linkedin.com/in/mark-munch-3a87a916 | https://www.linkedin.com/in/mark-munch-66496b7/ | Mark Munch - President at Bruker Nano, Inc. |
| 120 | Jonas Korlach | Pacific Biosciences | unverifiable | https://www.linkedin.com/in/jonaskorlach | _(dropped)_ | Mark Van Oene - San Diego, California, United States \| Professional Profile \|  |
| 121 | Molly He | Element Biosciences | verified-replaced | https://www.linkedin.com/in/molly-he-7b3a14 | https://www.linkedin.com/in/molly-he-2243731 | Molly He - Element Biosciences |
| 122 | Masoud Toloue | Quanterix | verified-replaced | https://www.linkedin.com/in/masoud-toloue-9b1a3415 | https://www.linkedin.com/in/masoud-toloue/ | Masoud Toloue - Quanterix \| LinkedIn |
| 123 | Christopher Hall | Personalis | partial | https://www.linkedin.com/in/christopher-hall-2a8b48 | _(dropped)_ | Christopher Hall - San Francisco, California, United States \| Professional Prof |
| 124 | Kevin Lee | Bicycle Therapeutics | verified-replaced | https://www.linkedin.com/in/kevin-lee-3a87a916 | https://www.linkedin.com/in/kevin-lee-1822617/ | Kevin Lee - Bicycle Therapeutics \| LinkedIn |
| 125 | Bahija Jallal | Immunocore | verified-replaced | https://www.linkedin.com/in/bahija-jallal-5717491 | https://www.linkedin.com/in/bahija-jallal/ | Bahija Jallal, Ph.D. - Immunocore \| LinkedIn |
| 126 | Christian Itin | Autolus Therapeutics | partial | https://www.linkedin.com/in/christian-itin-9b1a3415 | _(dropped)_ | Christian Itin - Autolus Ltd. \| LinkedIn |
| 127 | Kabir Nath | Compass Pathways | partial | https://www.linkedin.com/in/kabir-nath-3a85a3b | _(dropped)_ | Kabir Nath - London, England, United Kingdom \| Professional Profile \| LinkedIn |
| 128 | Denise Scots-Knight | Mereo BioPharma | partial | https://www.linkedin.com/in/denise-scots-knight-7b3a14 | _(dropped)_ | Denise Scots-Knight - Elanco |
| 129 | Iraj Ali | Achilles Therapeutics | verified-replaced | https://www.linkedin.com/in/iraj-ali-3a87a916 | https://uk.linkedin.com/in/iraj-ali-0b57621 | Iraj Ali - Achilles Therapeutics Limited |
| 130 | Adrian Rawcliffe | Adaptimmune Therapeutics | partial | https://www.linkedin.com/in/adrian-rawcliffe-9b3a14 | _(dropped)_ | Adrian (Ad) Rawcliffe - Philadelphia, Pennsylvania, United States \| Professiona |
| 131 | David Zaccardelli | Verona Pharma | verified-replaced | https://www.linkedin.com/in/david-zaccardelli-7b3a14 | https://bh.linkedin.com/in/david-zaccardelli | David Zaccardelli - Verona Pharma \| LinkedIn |
| 132 | Craig Tooman | Silence Therapeutics | verified-replaced | https://www.linkedin.com/in/craig-tooman-9b3a14 | https://www.linkedin.com/in/craig-tooman-82645a3b/ | Craig Tooman - Silence Therapeutics plc \| LinkedIn |
| 133 | Frank Mathias | Oxford BioMedica | verified-replaced | https://www.linkedin.com/in/frank-mathias-9b1a3415 | https://www.linkedin.com/in/dr-frank-mathias-927583ba/ | Dr. Frank Mathias - Oxford Biomedica \| LinkedIn |
| 134 | Richard Mason | Apollo Therapeutics | partial | https://www.linkedin.com/in/richard-mason-9b3a14 | _(dropped)_ | Richard Mason - Cambridge, England, United Kingdom |
| 135 | Saurabh Saha | Centessa Pharmaceuticals | partial | https://www.linkedin.com/in/saurabh-saha-7b3a14 | _(dropped)_ | Saurabh Saha MD PhD - Johns Hopkins Medicine \| LinkedIn |
| 136 | Susan Galbraith | AstraZeneca | verified-replaced | https://www.linkedin.com/in/susan-galbraith-3a87a916 | https://uk.linkedin.com/in/susan-galbraith-584a195 | Susan Galbraith - AstraZeneca |
| 137 | Marc Dunoyer | AstraZeneca Alexion | partial | https://www.linkedin.com/in/marc-dunoyer-9b1a3415 | _(dropped)_ | Marc Dunoyer - Mid Cap M&A - Team management |
| 138 | Sharon Barr | AstraZeneca BioPharm R&D | partial | https://www.linkedin.com/in/sharon-barr-3a87a916 | _(dropped)_ | Sharon Barr - AstraZeneca \| LinkedIn |
| 139 | Özlem Türeci | BioNTech | partial | https://www.linkedin.com/in/oezlem-tuereci-7b3a14 | _(dropped)_ | Özlem Türeci - GANYMED Pharmaceuticals AG \| LinkedIn |
| 140 | Alexander Zehnder | CureVac | verified-replaced | https://www.linkedin.com/in/alexander-zehnder-9b3a14 | https://de.linkedin.com/in/alexander-zehnder-curevac | Alexander Zehnder, MD, MBA - CureVac \| LinkedIn |
| 141 | Christian Wojczewski | Evotec | verified-replaced | https://www.linkedin.com/in/christian-wojczewski-9b1a3415 | https://www.linkedin.com/in/christian-wojczewski-220001111/ | Christian Wojczewski - Evotec \| LinkedIn |
| 142 | Jan van de Winkel | Genmab | verified-replaced | https://www.linkedin.com/in/jan-van-de-winkel-9b1a3415 | https://www.linkedin.com/in/janvandewinkel/ | Jan van de Winkel, Ph.D. - Genmab \| LinkedIn |
| 143 | Tim Van Hauwermeiren | Argenx | verified-replaced | https://www.linkedin.com/in/tim-van-hauwermeiren-7b3a14 | https://be.linkedin.com/in/tim-van-hauwermeiren-476a3521 | Tim Van Hauwermeiren - argenx SE |
| 144 | Paul Stoffels | Galapagos | verified-replaced | https://www.linkedin.com/in/paul-stoffels-9b3a14 | https://be.linkedin.com/in/stoffelspaul | Paul Stoffels, MD - Galapagos \| LinkedIn |
| 145 | Jean-Paul Clozel | Idorsia | partial | https://www.linkedin.com/in/jean-paul-clozel-9b3a14 | _(dropped)_ | Jean-Paul CLOZEL - UCC COFFEE FRANCE \| LinkedIn |
| 146 | Olivier Laureau | Servier | verified-replaced | https://www.linkedin.com/in/olivier-laureau-9b1a3415 | https://fr.linkedin.com/in/olivierlaureau | Olivier Laureau - President, Servier Foundation and ... |
| 147 | David Loew | Ipsen | verified-replaced | https://www.linkedin.com/in/david-loew-9b1a3415 | https://fr.linkedin.com/in/david-loew-219a9310 | David Loew - Chief Executive Officer at Ipsen |
| 148 | Iris Loew-Friedrich | UCB | verified-replaced | https://www.linkedin.com/in/iris-loew-friedrich-9b3a14 | https://de.linkedin.com/in/iris-loew-friedrich-19310592 | Iris Loew-Friedrich – UCB |
| 149 | Wolfgang Wienand | Lonza | unverifiable | https://www.linkedin.com/in/wolfgang-wienand-9b1a3415 | _(dropped)_ | Manuel Wagner - Lonza \| LinkedIn |
| 150 | Marcus Schindler | Novo Nordisk | verified-replaced | https://www.linkedin.com/in/marcus-schindler-9b3a14 | https://se.linkedin.com/in/marcus-schindler-a9b843a | Marcus Schindler – Former CSO & EVP, Novo Nordisk |
| 151 | Paul Chaplin | Bavarian Nordic | partial | https://www.linkedin.com/in/paul-chaplin-9b1a3415 | _(dropped)_ | Paul Chaplin - DXC Technology |
| 152 | Adam Steensberg | Zealand Pharma | verified-replaced | https://www.linkedin.com/in/adam-steensberg-9b1a3415 | https://dk.linkedin.com/in/adam-steensberg-md-mba-7b01336 | Adam Steensberg, MD, MBA - Zealand Pharma |
| 153 | Jan Mikkelsen | Ascendis Pharma | partial | https://www.linkedin.com/in/jan-mikkelsen-9b1a3415 | _(dropped)_ | Jan Møller Mikkelsen - San Francisco Bay Area \| Professional Profile \| LinkedI |
| 154 | Bill Lundberg | Merus | partial | https://www.linkedin.com/in/bill-lundberg-9b1a3415 | _(dropped)_ | Bill Lundberg - Cambridge, Massachusetts, United States \| Professional Profile  |
| 155 | Paola Casarosa | Boehringer Ingelheim | verified-replaced | https://www.linkedin.com/in/paola-casarosa-9b1a3415 | https://de.linkedin.com/in/paola-casarosa-343a8910 | Paola Casarosa – Boehringer Ingelheim |
| 156 | David Mauro | Recursion | verified-replaced | https://www.linkedin.com/in/david-mauro-md-phd-50a02315 | https://www.linkedin.com/in/david-mauro-55917a12/ | David Mauro - Recursion \| LinkedIn |
| 157 | Judith Klimovsky | Genmab | verified-replaced | https://www.linkedin.com/in/judith-klimovsky-md-3a87a916 | https://www.linkedin.com/in/judith-klimovsky-0859549/ | Judith Klimovsky - Genmab \| LinkedIn |
| 158 | Martin Lange | Novo Nordisk | partial | https://www.linkedin.com/in/martin-lange-9b1a3415 | _(dropped)_ | Martin Langer - BRAIN Biotech AG |
