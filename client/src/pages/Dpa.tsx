import { Link } from "wouter";
import { Sprout, ArrowLeft } from "lucide-react";
import { useDocumentMeta } from "@/hooks/use-document-meta";

const EFFECTIVE_DATE = "May 31, 2026";
const COMPANY = "EdenRadar, Inc.";
const CONTACT_EMAIL = "legal@edenradar.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

export default function Dpa() {
  useDocumentMeta({
    title: "Data Processing Agreement | EdenRadar",
    description: "EdenRadar Data Processing Agreement (DPA) for enterprise and team customers.",
  });
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-10">

        {/* Header */}
        <div className="space-y-4">
          <Link href="/">
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors mb-2">
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
            <h1 className="text-2xl font-bold text-foreground">Data Processing Agreement</h1>
            <p className="text-sm text-muted-foreground mt-1">Version 1.0 — Effective date: {EFFECTIVE_DATE}</p>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This Data Processing Agreement ("DPA") is incorporated into and forms part of the{" "}
            <Link href="/tos">
              <span className="text-emerald-600 hover:text-emerald-500 underline cursor-pointer">Terms of Service</span>
            </Link>
            {" "}between {COMPANY} ("EdenRadar," "Processor") and the customer entity that has accepted those terms ("Customer," "Controller"). This DPA applies where EdenRadar processes personal data on behalf of the Customer in the course of providing the Service.
          </p>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Executing this DPA:</strong> For enterprise customers requiring a countersigned DPA, please contact{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-600 hover:text-emerald-500 underline">{CONTACT_EMAIL}</a>
              . By continuing to use the Service after this DPA's effective date, Team and Enterprise customers are deemed to have accepted its terms.
            </p>
          </div>
        </div>

        <div className="space-y-8">

          <Section title="1. Definitions">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">"Personal Data"</strong> means any information relating to an identified or identifiable natural person that EdenRadar processes on behalf of the Customer in connection with the Service.</li>
              <li><strong className="text-foreground">"Controller"</strong> means the Customer, who determines the purposes and means of processing Personal Data.</li>
              <li><strong className="text-foreground">"Processor"</strong> means EdenRadar, who processes Personal Data on behalf of the Controller.</li>
              <li><strong className="text-foreground">"Data Subject"</strong> means the natural person to whom Personal Data relates (typically, the Customer's employees who use the Service).</li>
              <li><strong className="text-foreground">"Data Protection Law"</strong> means all applicable laws and regulations relating to the processing of Personal Data, including the GDPR, CCPA, and any applicable national implementing legislation.</li>
              <li><strong className="text-foreground">"Sub-processor"</strong> means any third party engaged by EdenRadar to process Personal Data on the Customer's behalf.</li>
              <li><strong className="text-foreground">"Security Incident"</strong> means a confirmed breach of security leading to accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to, Personal Data.</li>
            </ul>
          </Section>

          <Section title="2. Subject Matter and Duration">
            <p>
              EdenRadar processes Personal Data on behalf of the Customer for the duration of the Customer's subscription to the Service. The subject matter of processing is the provision of biotech intelligence, pipeline management, and deal discovery features as described in the Terms of Service.
            </p>
          </Section>

          <Section title="3. Nature and Purpose of Processing">
            <p>EdenRadar processes Personal Data for the following purposes:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Authenticating Customer's authorized users and managing their access to the Service.</li>
              <li>Storing and retrieving Customer's pipeline assets, saved searches, alerts, and notes.</li>
              <li>Processing search queries to return relevant results and maintain search history.</li>
              <li>Generating AI-powered summaries and intelligence briefings based on user queries.</li>
              <li>Delivering alert notifications and email communications configured by the Customer.</li>
              <li>Monitoring Service performance and diagnosing errors.</li>
            </ul>
          </Section>

          <Section title="4. Categories of Personal Data">
            <p>EdenRadar may process the following categories of Personal Data on behalf of the Customer:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Identity data: name and email address of authorized users.</li>
              <li>Professional data: job title, company affiliation, and therapeutic focus areas entered by users.</li>
              <li>Usage data: search queries, assets viewed and saved, pipeline configurations, notes, and activity timestamps.</li>
              <li>Technical data: IP addresses, browser identifiers, and session tokens.</li>
            </ul>
            <p>EdenRadar does not process special categories of personal data (e.g., health data, genetic data) on behalf of the Customer.</p>
          </Section>

          <Section title="5. Customer's Obligations">
            <p>The Customer, as Controller, represents and warrants that:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>It has a lawful basis for processing the Personal Data it submits to the Service and for directing EdenRadar to process that data.</li>
              <li>It has provided all required notices to Data Subjects and obtained all required consents for processing under applicable Data Protection Law.</li>
              <li>Its instructions to EdenRadar regarding the processing of Personal Data comply with applicable Data Protection Law.</li>
            </ul>
          </Section>

          <Section title="6. EdenRadar's Obligations">
            <p>EdenRadar, as Processor, agrees to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Process Personal Data only on documented instructions from the Customer, including as set out in this DPA and the Terms of Service, unless required to do so by applicable law.</li>
              <li>Ensure that persons authorized to process Personal Data are bound by appropriate confidentiality obligations.</li>
              <li>Implement and maintain the technical and organizational security measures described in Section 9.</li>
              <li>Assist the Customer in fulfilling its obligations to respond to Data Subject requests under applicable Data Protection Law, to the extent technically feasible.</li>
              <li>Assist the Customer in meeting its obligations under Articles 32–36 of the GDPR (security, breach notification, impact assessments, and prior consultation) to the extent EdenRadar has the relevant information.</li>
              <li>Not sell or share Personal Data as defined under applicable privacy laws.</li>
              <li>Not use Personal Data to train, fine-tune, or improve any AI or machine learning model.</li>
              <li>Delete or return all Personal Data upon termination of the Service and delete existing copies, unless storage is required by applicable law.</li>
              <li>Make available to the Customer all information reasonably necessary to demonstrate compliance with this DPA.</li>
            </ul>
          </Section>

          <Section title="7. Sub-processors">
            <p>
              The Customer provides general authorization for EdenRadar to engage Sub-processors. EdenRadar's current Sub-processors are:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Sub-processor</th>
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Purpose</th>
                    <th className="text-left py-2 font-semibold text-foreground">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="py-2 pr-4">Supabase</td>
                    <td className="py-2 pr-4">Database hosting and authentication</td>
                    <td className="py-2">USA (us-west-2)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Stripe</td>
                    <td className="py-2 pr-4">Payment processing</td>
                    <td className="py-2">USA</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Google</td>
                    <td className="py-2 pr-4">OAuth authentication</td>
                    <td className="py-2">USA</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">OpenAI</td>
                    <td className="py-2 pr-4">AI-powered summaries and search intelligence</td>
                    <td className="py-2">USA</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Sentry</td>
                    <td className="py-2 pr-4">Error monitoring and diagnostics</td>
                    <td className="py-2">USA</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              EdenRadar will notify the Customer of any intended additions or replacements of Sub-processors at least 14 days in advance by email or in-platform notice. If the Customer objects to a new Sub-processor on reasonable data protection grounds, the Customer may terminate the affected portion of the Service without penalty by providing written notice within 14 days of EdenRadar's notification.
            </p>
            <p>
              EdenRadar ensures that each Sub-processor is bound by data protection obligations at least as protective as those in this DPA. EdenRadar remains liable for the acts and omissions of its Sub-processors to the same extent as if performing the processing directly.
            </p>
          </Section>

          <Section title="8. International Data Transfers">
            <p>
              Personal Data processed under this DPA is stored and processed in the United States. Where the Customer is subject to GDPR or equivalent laws governing cross-border data transfers, EdenRadar implements the following safeguards:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Standard Contractual Clauses (SCCs):</strong> This DPA incorporates the EU Standard Contractual Clauses (Module Two: Controller to Processor) adopted by the European Commission on June 4, 2021, as may be updated from time to time. The SCCs are incorporated by reference and supplement this DPA.</li>
              <li><strong className="text-foreground">UK Addendum:</strong> To the extent that UK GDPR applies, this DPA incorporates the International Data Transfer Addendum issued by the UK Information Commissioner's Office.</li>
            </ul>
          </Section>

          <Section title="9. Security Measures">
            <p>EdenRadar implements and maintains the following technical and organizational security measures:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Encryption in transit:</strong> All data transmitted between Customer's users and the Service is encrypted using TLS 1.2 or higher.</li>
              <li><strong className="text-foreground">Encryption at rest:</strong> Databases and storage systems containing Personal Data are encrypted at rest.</li>
              <li><strong className="text-foreground">Access controls:</strong> Access to production systems containing Personal Data is restricted to authorized EdenRadar personnel on a need-to-know basis. Access is controlled via multi-factor authentication.</li>
              <li><strong className="text-foreground">Data isolation:</strong> Customer data is logically isolated from other customers' data. No cross-customer data access is possible through any feature of the Service.</li>
              <li><strong className="text-foreground">Monitoring:</strong> Production systems are monitored for security anomalies and errors using automated alerting.</li>
              <li><strong className="text-foreground">Vulnerability management:</strong> We apply security patches and updates to infrastructure on a regular basis.</li>
              <li><strong className="text-foreground">Personnel training:</strong> EdenRadar personnel with access to Personal Data receive data security awareness training.</li>
            </ul>
          </Section>

          <Section title="10. Security Incident Notification">
            <p>
              In the event of a Security Incident affecting Customer's Personal Data, EdenRadar will:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Notify the Customer without undue delay and in any event within 72 hours of becoming aware of the Security Incident.</li>
              <li>Provide, to the extent available, the nature of the Security Incident, the categories and approximate number of Data Subjects and records affected, the likely consequences of the breach, and the measures taken or proposed to address the breach.</li>
              <li>Cooperate with the Customer and take reasonable steps to mitigate the effects of the Security Incident.</li>
            </ul>
            <p>
              Security Incident notifications will be sent to the email address on file for the Customer's account owner. The Customer is responsible for keeping this contact information current.
            </p>
          </Section>

          <Section title="11. Data Subject Rights">
            <p>
              EdenRadar will assist the Customer in fulfilling requests from Data Subjects exercising their rights under applicable Data Protection Law (including rights of access, rectification, deletion, portability, and objection). Upon the Customer's written request, EdenRadar will:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide a copy of Personal Data held about a specific Data Subject within 5 business days.</li>
              <li>Delete or restrict processing of a Data Subject's Personal Data within 5 business days.</li>
              <li>Provide a machine-readable export of a Data Subject's Personal Data within 5 business days.</li>
            </ul>
            <p>
              EdenRadar will not respond directly to Data Subject requests without prior authorization from the Customer, except where required by law.
            </p>
          </Section>

          <Section title="12. Data Protection Impact Assessments">
            <p>
              To the extent required by applicable Data Protection Law, EdenRadar will provide reasonable assistance to the Customer in conducting data protection impact assessments and, where required, consulting with supervisory authorities, where such assessments or consultations relate to the Service.
            </p>
          </Section>

          <Section title="13. Deletion and Return of Data">
            <p>
              Upon termination or expiration of the Service, EdenRadar will, at the Customer's election:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Return:</strong> Provide a full export of the Customer's Personal Data in a machine-readable format (JSON or CSV) within 5 business days of the Customer's written request.</li>
              <li><strong className="text-foreground">Delete:</strong> Securely delete all Personal Data from EdenRadar's systems and those of its Sub-processors within 90 days of termination, except where retention is required by applicable law.</li>
            </ul>
            <p>
              EdenRadar will provide written confirmation of deletion upon request.
            </p>
          </Section>

          <Section title="14. Audits">
            <p>
              EdenRadar will make available to the Customer, upon written request with at least 30 days' notice, all information reasonably necessary to demonstrate compliance with this DPA. In lieu of an on-site audit, EdenRadar may satisfy this obligation by providing a summary of its most recent third-party security assessment or by responding to a reasonable written questionnaire.
            </p>
          </Section>

          <Section title="15. Limitation of Liability">
            <p>
              Each party's liability arising under or in connection with this DPA is subject to the limitations of liability set out in the Terms of Service.
            </p>
          </Section>

          <Section title="16. Governing Law">
            <p>
              This DPA is governed by the same law as the Terms of Service (the laws of the State of Delaware), except where applicable Data Protection Law requires otherwise. Where EU or UK Standard Contractual Clauses are incorporated, the governing law and jurisdiction provisions of those clauses apply to the extent required.
            </p>
          </Section>

          <Section title="17. Contact">
            <p>
              For questions about this DPA, to request a countersigned copy, or to exercise any rights under this DPA, please contact:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-emerald-600 hover:text-emerald-500 underline"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </Section>

        </div>

        <div className="border-t border-border pt-6 text-xs text-muted-foreground">
          {COMPANY} &bull; Version 1.0 &bull; {EFFECTIVE_DATE}
        </div>

      </div>
    </div>
  );
}
