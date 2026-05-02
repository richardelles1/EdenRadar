export interface TemplateSection {
  tag: "subject" | "heading" | "subheading" | "body" | "cta" | "signature" | "ps" | "ab-variants";
  text: string;
  placeholder?: boolean;
  variantA?: string;
  variantB?: string;
}

export interface EmailTemplate {
  id: string;
  filename: string;
  title: string;
  audience: string;
  sections: TemplateSection[];
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "eden-scout-bd",
    filename: "EdenScout_BD_Outreach_Template.docx",
    title: "EdenScout BD Outreach",
    audience: "VP Business Development / Head of S&E at pharma/biotech",
    sections: [
      {
        tag: "subject",
        text: "Subject: Finding [THERAPEUTIC FOCUS] assets before they're widely marketed — EdenScout",
      },
      {
        tag: "heading",
        text: "EdenScout — AI-Powered Biopharma Deal Intelligence",
      },
      {
        tag: "body",
        text: "Hi [FIRST NAME],",
        placeholder: true,
      },
      {
        tag: "ab-variants",
        text: "Opening Hook",
        variantA: "Most early-stage [THERAPEUTIC FOCUS] assets never reach a BD team's desk — they're buried in TTO databases, grant registries, and preprint servers, discoverable only if you know exactly where to look. EdenScout fixes that.",
        variantB: "I noticed [COMPANY] has been active in [THERAPEUTIC FOCUS] BD. I wanted to reach out because we've indexed 500+ pre-commercial assets in that space that aren't on most radar screens yet — and EdenScout is how top BD teams are finding them first.",
        placeholder: true,
      },
      {
        tag: "body",
        text: "EdenScout indexes 20,000+ university technology transfer assets across North America and Europe, scores each one for novelty, clinical readiness, and licensability using our proprietary EDEN AI analyst, and surfaces the ones most relevant to [COMPANY]'s therapeutic focus — updated in real time.",
        placeholder: true,
      },
      {
        tag: "subheading",
        text: "What EdenScout delivers for BD teams:",
      },
      {
        tag: "body",
        text: "• Early signal on pre-commercial assets before they hit investment banker decks\n• Side-by-side comparison of competing programs across stage, modality, and indication\n• Patent landscape overlays so you can assess freedom-to-operate risk upfront\n• One-click dossier generation for internal opportunity memos",
      },
      {
        tag: "body",
        text: "Teams at [COMPANY TYPE] organizations like yours are typically spending 6–12 hours per week manually tracking TTOs and PubMed. EdenScout compresses that to a 15-minute daily briefing.",
        placeholder: true,
      },
      {
        tag: "cta",
        text: "I'd love to show you a live demo focused specifically on [THERAPEUTIC FOCUS] assets. Would 20 minutes this week work?",
        placeholder: true,
      },
      {
        tag: "signature",
        text: "[YOUR NAME]\n[TITLE], EdenRadar\n[EMAIL] | [PHONE]\nwww.edenradar.io",
        placeholder: true,
      },
      {
        tag: "ps",
        text: "P.S. — We currently have [NUMBER] pre-commercial [THERAPEUTIC FOCUS] assets indexed that match [COMPANY]'s stated focus areas. Happy to send a sample report if that's useful before we connect.",
        placeholder: true,
      },
    ],
  },
  {
    id: "tto-partner-invite",
    filename: "EdenRadar_TTO_Partner_Invite.docx",
    title: "TTO Data Partner Invite",
    audience: "Technology Transfer Office directors and licensing associates",
    sections: [
      {
        tag: "subject",
        text: "Subject: Amplifying visibility for [INSTITUTION]'s technology portfolio — EdenRadar partnership",
      },
      {
        tag: "heading",
        text: "EdenRadar — Visibility Partner for Technology Transfer Offices",
      },
      {
        tag: "body",
        text: "Dear [FIRST NAME],",
        placeholder: true,
      },
      {
        tag: "ab-variants",
        text: "Opening Hook",
        variantA: "Technology transfer offices do extraordinary work bringing university research to market — but discovery still relies heavily on personal networks and conference serendipity. We built EdenRadar to change that for [INSTITUTION]'s portfolio.",
        variantB: "I've been following [INSTITUTION]'s TTO activity and noticed you have some strong [THERAPEUTIC FOCUS] assets that aren't getting the industry visibility they deserve. EdenRadar was built specifically to close that gap — at no cost to the TTO.",
        placeholder: true,
      },
      {
        tag: "body",
        text: "EdenRadar is an AI-powered biopharma intelligence platform used by BD teams at pharma, biotech, and investment firms to identify early-stage licensing opportunities. We currently index publicly available information across 400+ institutions, but our data partnership program provides TTOs with a direct channel to push structured asset data into our platform — ensuring your technologies are represented accurately and are discoverable by the right audience.",
      },
      {
        tag: "subheading",
        text: "What a data partnership includes:",
      },
      {
        tag: "body",
        text: "• Direct ingestion of your structured technology listings (CSV, API, or our intake form)\n• Priority indexing and enrichment by our EDEN AI analyst\n• Your institution's branded profile page on EdenRadar\n• Monthly visibility reports: views, saves, and BD team engagement per technology\n• No licensing fees — this is a visibility amplification program, not a sales channel",
      },
      {
        tag: "body",
        text: "We are not a marketplace intermediary. EdenRadar does not charge transaction fees or position itself between your office and potential licensees. We exist to increase the surface area of discovery.",
      },
      {
        tag: "cta",
        text: "Would you be open to a 30-minute call to explore whether this is a good fit for [INSTITUTION]? I can also send our one-pager on the data partnership program if you'd prefer to review it first.",
        placeholder: true,
      },
      {
        tag: "signature",
        text: "[YOUR NAME]\n[TITLE], EdenRadar\n[EMAIL] | [PHONE]\nwww.edenradar.io",
        placeholder: true,
      },
      {
        tag: "ps",
        text: "P.S. — We already index [NUMBER] technologies from [INSTITUTION] based on publicly available information. A data partnership would allow you to correct, supplement, and amplify those listings at no cost.",
        placeholder: true,
      },
    ],
  },
  {
    id: "edenmarket-lister-invite",
    filename: "EdenMarket_Lister_Invite.docx",
    title: "EdenMarket Lister Invite",
    audience: "Biotech founders and BD leads with assets available for licensing or acquisition",
    sections: [
      {
        tag: "subject",
        text: "Subject: List [ASSET NAME] on EdenMarket — confidential access to 500+ qualified biopharma buyers",
      },
      {
        tag: "heading",
        text: "EdenMarket — The Curated Biopharma Asset Marketplace",
      },
      {
        tag: "body",
        text: "Hi [FIRST NAME],",
        placeholder: true,
      },
      {
        tag: "ab-variants",
        text: "Opening Hook",
        variantA: "I came across [COMPANY]'s work on [ASSET NAME] and wanted to reach out about EdenMarket — our curated marketplace for pre-commercial biopharma assets. Unlike generalist platforms, every buyer in our network has been verified as an active acquirer or licensor in your asset's therapeutic area.",
        variantB: "Finding the right licensing partner for [ASSET NAME] usually means 12–18 months of conference networking and cold emails to BD teams who aren't actively looking. EdenMarket short-circuits that — your asset reaches verified, actively-searching buyers who match your TA and stage.",
        placeholder: true,
      },
      {
        tag: "subheading",
        text: "Why listers choose EdenMarket:",
      },
      {
        tag: "body",
        text: "• $0 upfront to list — we operate on a success-fee model only\n• Confidential listing option — your asset is visible only to buyers who sign a standard NDA\n• AI-assisted listing creation — our EDEN analyst pre-populates your profile from published data\n• Curated buyer matching — we surface your asset to BD teams at pharma and biotech whose therapeutic focus aligns\n• Eden Signal Score — a proprietary readiness and licensability score that helps buyers prioritize, accelerating their evaluation",
      },
      {
        tag: "body",
        text: "The success fee is [X]% of any transaction value closed through a buyer introduction made via EdenMarket, with no fee if no deal is completed. There are no monthly listing fees, no data access charges, and no exclusivity requirements.",
        placeholder: true,
      },
      {
        tag: "cta",
        text: "Would a 20-minute call make sense to walk through how EdenMarket could work for [ASSET NAME]? I'm happy to share examples of how similar [MODALITY] programs have been positioned on the platform.",
        placeholder: true,
      },
      {
        tag: "signature",
        text: "[YOUR NAME]\n[TITLE], EdenRadar\n[EMAIL] | [PHONE]\nwww.edenradar.io",
        placeholder: true,
      },
      {
        tag: "ps",
        text: "P.S. — Listing takes under 10 minutes using our guided intake form. If you'd like to preview the listing experience before committing, I can set up a sandbox account for [COMPANY] at no charge.",
        placeholder: true,
      },
    ],
  },
];
