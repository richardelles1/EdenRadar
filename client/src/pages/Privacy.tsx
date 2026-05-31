import { Link } from "wouter";
import { Sprout, ArrowLeft } from "lucide-react";
import { useDocumentMeta } from "@/hooks/use-document-meta";

const EFFECTIVE_DATE = "May 31, 2026";
const COMPANY = "EdenRadar, Inc.";
const CONTACT_EMAIL = "privacy@edenradar.com";
const GOVERNING_LAW = "Delaware";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

export default function Privacy() {
  useDocumentMeta({
    title: "Privacy Policy | EdenRadar",
    description: "How EdenRadar collects, uses, and safeguards your data across EdenRadar, EdenLab, EdenDiscovery and EdenMarket.",
  });
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-10">

        {/* Header */}
        <div className="space-y-4">
          <Link href="/">
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors mb-2" data-testid="link-back-privacy">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to EdenRadar
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-emerald-600 flex items-center justify-center">
              <Sprout className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg text-foreground">
              Eden<span className="text-emerald-600">Radar</span>
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-privacy-title">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground mt-1">Effective date: {EFFECTIVE_DATE}</p>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This Privacy Policy describes how {COMPANY} ("EdenRadar," "we," "us," or "our") collects, uses, stores, and shares information about you when you use our platform and services. Please read it carefully alongside our{" "}
            <Link href="/tos">
              <span className="text-emerald-600 hover:text-emerald-500 underline cursor-pointer" data-testid="link-tos-from-privacy">Terms of Service</span>
            </Link>
            {" "}and our{" "}
            <Link href="/dpa">
              <span className="text-emerald-600 hover:text-emerald-500 underline cursor-pointer">Data Processing Agreement</span>
            </Link>
            .
          </p>
        </div>

        <div className="space-y-8">

          <Section title="1. Information We Collect">
            <p>We collect information you provide directly to us, information generated automatically when you use the Service, and information from third-party sources.</p>
            <p><strong className="text-foreground">Information you provide:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Account registration details: name, email address, password, and role (industry buyer, researcher, or concept submitter).</li>
              <li>Professional profile data: institutional affiliation, therapeutic focus areas, modalities, and deal stage preferences, if entered.</li>
              <li>Content you create or submit: research concepts, project notes, pipeline assets, saved searches, alert configurations, and comments.</li>
              <li>Payment information: billing details processed by our payment processor; we do not store raw card numbers.</li>
              <li>Communications with us: support inquiries, feedback, and correspondence.</li>
            </ul>
            <p><strong className="text-foreground">Information collected automatically:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Usage data: pages visited, features used, and interactions within the Service.</li>
              <li><strong className="text-foreground">Search queries:</strong> When you search within EdenRadar, we log the text of your queries, the results returned, and the assets you interact with. This is used to personalize your experience, power your search history, and improve our search relevance. See Section 2 for how we use this data and what we do not do with it.</li>
              <li>Device and browser data: IP address, browser type, operating system, and referring URL.</li>
              <li>Cookies and similar technologies: session tokens, preference cookies, and analytics identifiers (see Section 7).</li>
            </ul>
            <p><strong className="text-foreground">Information from third parties:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>If you sign in using Google OAuth, we receive your name and email address from Google.</li>
              <li>Publicly available institutional technology transfer disclosures that we index to power the platform.</li>
            </ul>
          </Section>

          <Section title="2. How We Use Your Information">
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Create and manage your account and authenticate your identity.</li>
              <li>Provide, operate, and improve the EdenRadar platform and its features.</li>
              <li>Personalize your experience, including tailoring search results and recommendations based on your profile and prior searches.</li>
              <li>Process payments and manage subscription billing.</li>
              <li>Send transactional communications such as account confirmations, alerts you have set up, and billing notices.</li>
              <li>Send product updates and marketing communications where you have consented or where permitted by applicable law.</li>
              <li>Analyze usage patterns in aggregate to improve platform performance, fix bugs, and develop new features.</li>
              <li>Enforce our Terms of Service and protect the security and integrity of the platform.</li>
              <li>Comply with legal obligations and respond to lawful requests from public authorities.</li>
            </ul>
            <p><strong className="text-foreground">Search query confidentiality:</strong> Your search queries reveal your organization's research interests and competitive focus. We treat this information as confidential. Specifically:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Your search queries are <strong className="text-foreground">not visible to other users or organizations</strong> on the platform.</li>
              <li>Your search queries are <strong className="text-foreground">not used to train AI or machine learning models</strong>, including any models used to power EdenRadar features.</li>
              <li>Your search queries are <strong className="text-foreground">not shared with technology transfer offices</strong> or any third party except as required by law.</li>
              <li>Search history is scoped to your individual user account and, where you are part of an organization, visible to your organization's account administrators only.</li>
            </ul>
          </Section>

          <Section title="3. How We Share Your Information">
            <p>We do not sell your personal information. We may share it in the following circumstances:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Service providers (sub-processors):</strong> We share data with vendors who help us operate the platform. Our current sub-processors are: Supabase (authentication and database hosting, US-West-2), Stripe (payment processing), Google (OAuth sign-in), OpenAI (AI-powered summaries and search), and Sentry (error monitoring). Each is contractually bound to use your data only to provide services to us and not for any other purpose.</li>
              <li><strong className="text-foreground">Organization administrators:</strong> If you access the Service through an organization account, your organization's account administrators may have access to your usage activity, saved assets, and pipeline data as described in Section 11.</li>
              <li><strong className="text-foreground">Business transfers:</strong> If EdenRadar is involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction. We will provide notice before your data is transferred and becomes subject to a different privacy policy.</li>
              <li><strong className="text-foreground">Legal compliance:</strong> We may disclose information when required by law, subpoena, or other legal process, or when we believe in good faith that disclosure is necessary to protect our rights, your safety, or the safety of others.</li>
              <li><strong className="text-foreground">With your consent:</strong> We may share information for any other purpose with your explicit consent.</li>
            </ul>
            <p><strong className="text-foreground">Customer data isolation:</strong> Each customer organization's data — including saved assets, pipeline contents, alerts, and search history — is logically isolated from all other customers. No organization can access another organization's data through any feature of the Service.</p>
            <p>Publicly submitted concept cards on EdenDiscovery may be visible to other registered users of that portal as part of the platform's collaborative discovery purpose.</p>
          </Section>

          <Section title="4. Data Retention">
            <p>We retain your personal data for as long as your account is active or as needed to provide the Service. Specifically:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Account data</strong> is kept for the duration of your account and for up to 24 months after account closure to allow for account recovery and to meet legal obligations.</li>
              <li><strong className="text-foreground">Search query history</strong> is retained for 12 months on a rolling basis, after which it is automatically deleted. You may request deletion of your search history at any time by contacting us.</li>
              <li><strong className="text-foreground">Usage and analytics data</strong> is retained in aggregated or anonymized form for up to 36 months to support platform improvement.</li>
              <li><strong className="text-foreground">Payment records</strong> are retained for at least 7 years in accordance with financial record-keeping requirements.</li>
              <li><strong className="text-foreground">Content you create</strong> (pipeline assets, notes, saved searches, alerts) is deleted within 30 days of account closure upon request.</li>
            </ul>
            <p>We may retain certain information longer if required by law or to resolve disputes.</p>
          </Section>

          <Section title="5. Your Rights and Choices">
            <p>Depending on your location, you may have the following rights regarding your personal data:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Access:</strong> Request a copy of the personal data we hold about you, including your search history.</li>
              <li><strong className="text-foreground">Correction:</strong> Request correction of inaccurate or incomplete data.</li>
              <li><strong className="text-foreground">Deletion:</strong> Request deletion of your personal data, subject to legal retention requirements.</li>
              <li><strong className="text-foreground">Portability:</strong> Request a machine-readable export of data you have provided to us, including your pipeline and saved assets.</li>
              <li><strong className="text-foreground">Objection / Restriction:</strong> Object to or request restriction of certain processing activities.</li>
              <li><strong className="text-foreground">Withdraw consent:</strong> Where processing is based on consent, you may withdraw it at any time without affecting the lawfulness of prior processing.</li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-emerald-600 hover:text-emerald-500 underline"
                data-testid="link-privacy-contact-rights"
              >
                {CONTACT_EMAIL}
              </a>
              . We will respond within 30 days (or within 72 hours for urgent breach-related requests). We may need to verify your identity before processing your request.
            </p>
            <p>
              You may also update or delete your account information directly from your account settings at any time.
            </p>
          </Section>

          <Section title="6. Data Security">
            <p>
              We implement industry-standard technical and organizational measures to protect your personal data, including:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Encryption in transit (TLS 1.2+) for all data transmitted between your browser and our servers.</li>
              <li>Encrypted storage of credentials and sensitive fields.</li>
              <li>Role-based access controls limiting data access to authorized personnel.</li>
              <li>Automated error monitoring and alerting to detect and respond to anomalies.</li>
              <li>Customer data isolation ensuring no cross-organization data access.</li>
            </ul>
            <p>
              No method of transmission over the internet is completely secure. While we use commercially reasonable measures to protect your data, we cannot guarantee absolute security.
            </p>
            <p>
              <strong className="text-foreground">Breach notification:</strong> In the event of a personal data breach that is likely to result in a risk to your rights and freedoms, we will notify affected users without undue delay and, where required by applicable law (including GDPR Article 33), notify the relevant supervisory authority within 72 hours of becoming aware of the breach.
            </p>
          </Section>

          <Section title="7. Cookies and Tracking Technologies">
            <p>We use cookies and similar tracking technologies to operate and improve the Service. These include:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Strictly necessary cookies:</strong> Required for authentication, session management, and security. These cannot be disabled without affecting Service functionality.</li>
              <li><strong className="text-foreground">Preference cookies:</strong> Store your settings such as theme (light/dark mode) and display preferences.</li>
              <li><strong className="text-foreground">Analytics cookies:</strong> Help us understand how users interact with the platform so we can improve it. Analytics data is aggregated and not used to identify individual users.</li>
            </ul>
            <p>
              You can control cookie preferences through your browser settings. Note that disabling certain cookies may affect the functionality of the Service.
            </p>
          </Section>

          <Section title="8. Sub-Processors">
            <p>
              We use the following third-party service providers (sub-processors) to deliver the Service. Each is bound by a data processing agreement requiring them to protect your data and process it only as directed by us:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Supabase:</strong> Authentication and database hosting. Data stored in US-West-2 (Oregon, USA).</li>
              <li><strong className="text-foreground">Stripe:</strong> Payment processing. Cardholder data is handled entirely by Stripe; we do not store raw card numbers.</li>
              <li><strong className="text-foreground">Google:</strong> OAuth sign-in. Used only for authentication; we receive name and email only.</li>
              <li><strong className="text-foreground">OpenAI:</strong> AI-powered asset summaries, scoring, and conversational intelligence. Queries sent to OpenAI are governed by OpenAI's API data usage policy and are not used to train OpenAI's models.</li>
              <li><strong className="text-foreground">Sentry:</strong> Error monitoring. Error reports may include stack traces and request metadata; they do not include the content of your search queries or pipeline assets.</li>
            </ul>
            <p>
              We will notify customers of any changes to our sub-processor list with at least 14 days' notice where those changes affect the processing of customer personal data.
            </p>
          </Section>

          <Section title="9. Children's Privacy">
            <p>
              The Service is not directed to individuals under the age of 18. We do not knowingly collect personal data from children. If you believe we have inadvertently collected data from a minor, please contact us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-emerald-600 hover:text-emerald-500 underline"
                data-testid="link-privacy-contact-children"
              >
                {CONTACT_EMAIL}
              </a>{" "}
              and we will promptly delete it.
            </p>
          </Section>

          <Section title="10. International Data Transfers">
            <p>
              {COMPANY} is incorporated in {GOVERNING_LAW} and our infrastructure is hosted in the United States (US-West-2 region). If you are accessing the Service from outside the United States, your data will be transferred to and processed in the United States.
            </p>
            <p>
              Where required by applicable law (including GDPR), we implement appropriate safeguards for cross-border data transfers, such as Standard Contractual Clauses (SCCs) approved by the European Commission. Our Data Processing Agreement, available at{" "}
              <Link href="/dpa">
                <span className="text-emerald-600 hover:text-emerald-500 underline cursor-pointer">/dpa</span>
              </Link>
              , incorporates these safeguards.
            </p>
          </Section>

          <Section title="11. Organization and Enterprise Accounts">
            <p>
              If you access the Service through an organization subscription (Team or Enterprise plan), the following additional terms apply:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Data ownership:</strong> The subscribing organization retains ownership of all data created by its members within the Service, including saved assets, pipeline configurations, alerts, and notes.</li>
              <li><strong className="text-foreground">Administrator access:</strong> Organization account administrators can view the pipeline assets and activity of member accounts within their organization. They cannot access the full text of search queries of individual members.</li>
              <li><strong className="text-foreground">Member offboarding:</strong> When a member's access is removed by an administrator, that member's saved assets and pipeline data remain associated with the organization account and are not deleted.</li>
              <li><strong className="text-foreground">Data export:</strong> Organization administrators may request a full export of their organization's data at any time by contacting us at {CONTACT_EMAIL}. We will fulfill export requests within 5 business days.</li>
              <li><strong className="text-foreground">Account closure:</strong> Upon subscription termination, organization data will be retained for 90 days to allow for data export, after which it will be permanently deleted unless a longer retention period is required by law.</li>
            </ul>
            <p>
              Enterprise customers requiring a Data Processing Agreement (DPA) may access our standard DPA at{" "}
              <Link href="/dpa">
                <span className="text-emerald-600 hover:text-emerald-500 underline cursor-pointer">edenradar.com/dpa</span>
              </Link>
              {" "}or contact us at {CONTACT_EMAIL} to negotiate a custom agreement.
            </p>
          </Section>

          <Section title="12. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. When we do, we will revise the effective date at the top of this page. For material changes, we will provide notice through the Service or by email to registered users at least 14 days before the changes take effect. Your continued use of the Service after any changes constitutes acceptance of the updated policy.
            </p>
          </Section>

          <Section title="13. Contact">
            <p>
              If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact our privacy team at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-emerald-600 hover:text-emerald-500 underline"
                data-testid="link-privacy-contact"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
            <p>
              For enterprise data processing inquiries or to execute a Data Processing Agreement, please contact{" "}
              <a
                href="mailto:legal@edenradar.com"
                className="text-emerald-600 hover:text-emerald-500 underline"
              >
                legal@edenradar.com
              </a>
              .
            </p>
          </Section>

        </div>

        <div className="border-t border-border pt-6 text-xs text-muted-foreground">
          {COMPANY} &bull; {GOVERNING_LAW} &bull; {EFFECTIVE_DATE}
        </div>

      </div>
    </div>
  );
}
