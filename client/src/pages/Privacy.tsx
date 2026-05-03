import { Link } from "wouter";
import { Sprout, ArrowLeft } from "lucide-react";
import { useDocumentMeta } from "@/hooks/use-document-meta";

const EFFECTIVE_DATE = "April 17, 2026";
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
    description: "How EdenRadar collects, uses, and safeguards your data across EdenScout, EdenLab, EdenDiscovery and EdenMarket.",
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
            .
          </p>
        </div>

        <div className="space-y-8">

          <Section title="1. Information We Collect">
            <p>We collect information you provide directly to us, information generated automatically when you use the Service, and information from third-party sources.</p>
            <p><strong className="text-foreground">Information you provide:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Account registration details: name, email address, password, and role (industry buyer, researcher, or concept submitter).</li>
              <li>Professional profile data: institutional affiliation, research area, and goals, if entered.</li>
              <li>Content you create or submit: research concepts, project notes, pipeline data, saved searches, and comments.</li>
              <li>Payment information: billing details processed by our payment processor; we do not store raw card numbers.</li>
              <li>Communications with us: support inquiries, feedback, and correspondence.</li>
            </ul>
            <p><strong className="text-foreground">Information collected automatically:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Usage data: pages visited, features used, search queries, and interactions within the Service.</li>
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
              <li>Personalize your experience, including tailoring search results and recommendations.</li>
              <li>Process payments and manage subscription billing.</li>
              <li>Send transactional communications such as account confirmations, alerts you have set up, and billing notices.</li>
              <li>Send product updates and marketing communications where you have consented or where permitted by applicable law.</li>
              <li>Analyze usage patterns to improve platform performance, fix bugs, and develop new features.</li>
              <li>Enforce our Terms of Service and protect the security and integrity of the platform.</li>
              <li>Comply with legal obligations and respond to lawful requests from public authorities.</li>
            </ul>
          </Section>

          <Section title="3. How We Share Your Information">
            <p>We do not sell your personal information. We may share it in the following circumstances:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Service providers:</strong> We share data with vendors who help us operate the platform, including cloud hosting, payment processing, email delivery, and analytics services. These providers are contractually bound to use your data only to provide services to us.</li>
              <li><strong className="text-foreground">Business transfers:</strong> If EdenRadar is involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction. We will provide notice before your data is transferred and becomes subject to a different privacy policy.</li>
              <li><strong className="text-foreground">Legal compliance:</strong> We may disclose information when required by law, subpoena, or other legal process, or when we believe in good faith that disclosure is necessary to protect our rights, your safety, or the safety of others.</li>
              <li><strong className="text-foreground">With your consent:</strong> We may share information for any other purpose with your explicit consent.</li>
            </ul>
            <p>Publicly submitted concept cards on EdenDiscovery may be visible to other registered users of that portal as part of the platform's collaborative discovery purpose.</p>
          </Section>

          <Section title="4. Data Retention">
            <p>We retain your personal data for as long as your account is active or as needed to provide the Service. Specifically:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Account data</strong> is kept for the duration of your account and for up to 24 months after account closure to allow for account recovery and to meet legal obligations.</li>
              <li><strong className="text-foreground">Usage and analytics data</strong> is retained in aggregated or anonymized form for up to 36 months to support platform improvement.</li>
              <li><strong className="text-foreground">Payment records</strong> are retained for at least 7 years in accordance with financial record-keeping requirements.</li>
              <li><strong className="text-foreground">Content you create</strong> (projects, notes, saved searches) is deleted within 30 days of account closure upon request.</li>
            </ul>
            <p>We may retain certain information longer if required by law or to resolve disputes.</p>
          </Section>

          <Section title="5. Your Rights and Choices">
            <p>Depending on your location, you may have the following rights regarding your personal data:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Access:</strong> Request a copy of the personal data we hold about you.</li>
              <li><strong className="text-foreground">Correction:</strong> Request correction of inaccurate or incomplete data.</li>
              <li><strong className="text-foreground">Deletion:</strong> Request deletion of your personal data, subject to legal retention requirements.</li>
              <li><strong className="text-foreground">Portability:</strong> Request a machine-readable export of data you have provided to us.</li>
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
              . We will respond within 30 days. We may need to verify your identity before processing your request.
            </p>
            <p>
              You may also update or delete your account information directly from your account settings at any time.
            </p>
          </Section>

          <Section title="6. Data Security">
            <p>
              We implement industry-standard technical and organizational measures to protect your personal data, including encryption in transit (TLS), encrypted storage of credentials, role-based access controls, and regular security reviews.
            </p>
            <p>
              No method of transmission over the internet or electronic storage is completely secure. While we strive to use commercially acceptable means to protect your data, we cannot guarantee absolute security. In the event of a data breach that affects your rights or freedoms, we will notify affected users as required by applicable law.
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
              You can control cookie preferences through your browser settings. Note that disabling certain cookies may affect the functionality of the Service. A separate cookie consent interface is coming soon.
            </p>
          </Section>

          <Section title="8. Third-Party Services">
            <p>
              The Service integrates with third-party services including Supabase (authentication and database hosting), Stripe (payment processing), and Google (OAuth sign-in). Each of these services operates under its own privacy policy. We encourage you to review those policies before using these sign-in or payment features.
            </p>
            <p>
              The Service may display links to external websites or institutions. EdenRadar is not responsible for the privacy practices of those external sites.
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
              {COMPANY} is incorporated in {GOVERNING_LAW} and our infrastructure is hosted in the United States. If you are accessing the Service from outside the United States, please be aware that your data will be transferred to and processed in the United States, which may have different data protection laws than your country of residence.
            </p>
            <p>
              Where required by applicable law, we implement appropriate safeguards for cross-border data transfers, such as standard contractual clauses approved by relevant authorities.
            </p>
          </Section>

          <Section title="11. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. When we do, we will revise the effective date at the top of this page. For material changes, we will provide notice through the Service or by email to registered users. Your continued use of the Service after any changes constitutes acceptance of the updated policy.
            </p>
          </Section>

          <Section title="12. Contact">
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
          </Section>

        </div>

        <div className="border-t border-border pt-6 text-xs text-muted-foreground">
          {COMPANY} &bull; {GOVERNING_LAW} &bull; {EFFECTIVE_DATE}
        </div>

      </div>
    </div>
  );
}
