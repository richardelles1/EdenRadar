import { Link } from "wouter";
import { Sprout, ArrowLeft } from "lucide-react";

const EFFECTIVE_DATE = "April 17, 2026";
const COMPANY = "EdenRadar, Inc.";
const CONTACT_EMAIL = "legal@edenradar.com";
const GOVERNING_LAW = "Delaware";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

export default function Tos() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-10">

        {/* Header */}
        <div className="space-y-4">
          <Link href="/">
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors mb-2" data-testid="link-back-tos">
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
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-tos-title">Terms of Service</h1>
            <p className="text-sm text-muted-foreground mt-1">Effective date: {EFFECTIVE_DATE}</p>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Please read these Terms of Service carefully before using any EdenRadar product or service. By creating an account or accessing the platform, you agree to be bound by these terms and our{" "}
            <Link href="/privacy">
              <span className="text-emerald-600 hover:text-emerald-500 underline cursor-pointer" data-testid="link-privacy-from-tos">Privacy Policy</span>
            </Link>
            .
          </p>
        </div>

        <div className="space-y-8">

          <Section title="1. Acceptance of Terms">
            <p>
              These Terms of Service ("Terms") form a binding agreement between you and {COMPANY} ("EdenRadar," "we," "us," or "our"). By accessing or using EdenRadar's platform, applications, or related services (collectively, the "Service"), you confirm that you have read, understood, and agree to these Terms and our Privacy Policy.
            </p>
            <p>
              If you are using the Service on behalf of a company or other legal entity, you represent that you have authority to bind that entity to these Terms. If you do not have such authority, or if you do not agree with these Terms, you may not use the Service.
            </p>
          </Section>

          <Section title="2. Description of Service">
            <p>
              EdenRadar is a biotech intelligence platform that helps industry buyers discover and evaluate licensable technology transfer office assets. The Service includes three portals:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">EdenDiscovery</strong> - a free concept exploration feed for early-stage researchers.</li>
              <li><strong className="text-foreground">EdenLab</strong> - a free research workspace for academic and institutional users.</li>
              <li><strong className="text-foreground">EdenScout</strong> - a paid intelligence and pipeline management tool for industry buyers.</li>
            </ul>
            <p>
              We reserve the right to modify, suspend, or discontinue any part of the Service at any time with reasonable notice where practicable.
            </p>
          </Section>

          <Section title="3. Accounts and Eligibility">
            <p>
              You must be at least 18 years old and capable of forming a binding contract to use the Service. You are responsible for maintaining the security of your account credentials and for all activity that occurs under your account.
            </p>
            <p>
              You agree to provide accurate and complete information when creating an account and to keep that information up to date. EdenRadar may suspend or terminate accounts that provide false or misleading information.
            </p>
          </Section>

          <Section title="4. Permitted Use">
            <p>
              You may use the Service only for lawful purposes and in accordance with these Terms. You agree not to:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use the Service to infringe the intellectual property rights of any party.</li>
              <li>Scrape, copy, or systematically extract content from the platform without written permission.</li>
              <li>Attempt to gain unauthorized access to any portion of the Service or its infrastructure.</li>
              <li>Use the Service to transmit spam, malware, or other harmful content.</li>
              <li>Resell or sublicense access to the Service without written authorization from EdenRadar.</li>
              <li>Reverse engineer or attempt to extract the source code of the Service.</li>
            </ul>
          </Section>

          <Section title="5. Subscriptions and Payments">
            <p>
              EdenScout is a paid service available on the following plans: Individual ($1,999/month), Team-5 ($8,999/month), Team-10 ($16,999/month), and Enterprise (custom pricing). Free tiers (EdenDiscovery, EdenLab) are provided at no charge and may be modified or discontinued at our discretion.
            </p>
            <p>
              Paid plans are billed in advance on a monthly or annual basis. All fees are non-refundable except as required by law or as expressly stated in your order. We may adjust pricing with at least 30 days' written notice to active subscribers.
            </p>
          </Section>

          <Section title="6. Intellectual Property">
            <p>
              All content, features, and functionality of the Service - including but not limited to software, text, graphics, data compilations, AI-generated summaries, and scoring models - are the exclusive property of {COMPANY} or its licensors and are protected by applicable intellectual property laws.
            </p>
            <p>
              You retain ownership of any content you submit to the Service (such as research concepts or pipeline notes). By submitting content, you grant EdenRadar a non-exclusive, worldwide, royalty-free license to host, display, and process that content as necessary to provide the Service.
            </p>
            <p>
              Technology transfer listings displayed on the Service are sourced from publicly available institutional disclosures. EdenRadar does not claim ownership of those underlying technologies and makes no representation regarding their licensing status or availability.
            </p>
          </Section>

          <Section title="7. Data and Privacy">
            <p>
              Our collection and use of personal data is governed by our{" "}
              <Link href="/privacy">
                <span className="text-emerald-600 hover:text-emerald-500 underline cursor-pointer" data-testid="link-privacy-section7">Privacy Policy</span>
              </Link>
              , which is incorporated into these Terms by reference. By using the Service, you consent to the data practices described in the Privacy Policy.
            </p>
            <p>
              We implement reasonable technical and organizational measures to protect your data. However, no method of transmission over the internet is completely secure, and we cannot guarantee absolute security.
            </p>
          </Section>

          <Section title="8. Third-Party Content and Links">
            <p>
              The Service may display content sourced from third-party institutions and databases. EdenRadar does not endorse or verify the accuracy of third-party content and is not responsible for errors or omissions in data sourced from external institutions.
            </p>
            <p>
              Links to external sites are provided for convenience only. EdenRadar has no control over, and assumes no responsibility for, the content or practices of any third-party sites.
            </p>
          </Section>

          <Section title="9. Disclaimer of Warranties">
            <p>
              The Service is provided "as is" and "as available" without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, or non-infringement. EdenRadar does not warrant that the Service will be uninterrupted, error-free, or that any content is accurate, complete, or current.
            </p>
            <p>
              Nothing on the Service constitutes legal, financial, or investment advice. Licensing opportunities displayed should be independently verified before making any business decision.
            </p>
          </Section>

          <Section title="10. Limitation of Liability">
            <p>
              To the maximum extent permitted by law, {COMPANY} and its officers, directors, employees, and agents will not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or business opportunities, arising from your use of or inability to use the Service.
            </p>
            <p>
              In no event will EdenRadar's total liability to you for all claims arising under these Terms exceed the greater of (a) the total fees you paid to EdenRadar in the 12 months preceding the claim, or (b) $100.
            </p>
          </Section>

          <Section title="11. Indemnification">
            <p>
              You agree to indemnify and hold harmless {COMPANY} and its affiliates from any claims, losses, damages, liabilities, costs, and expenses (including reasonable attorneys' fees) arising from your use of the Service, your violation of these Terms, or your infringement of any third-party rights.
            </p>
          </Section>

          <Section title="12. Termination">
            <p>
              Either party may terminate the agreement at any time. You may close your account from your account settings or by contacting us. We may suspend or terminate your access if you violate these Terms, fail to pay applicable fees, or if we discontinue the Service.
            </p>
            <p>
              Upon termination, your right to access the Service ends immediately. Provisions that by their nature should survive termination (including IP ownership, limitation of liability, and dispute resolution) will remain in effect.
            </p>
          </Section>

          <Section title="13. Governing Law and Disputes">
            <p>
              These Terms are governed by the laws of the State of {GOVERNING_LAW}, without regard to its conflict of law provisions. Any dispute arising from these Terms or your use of the Service will be resolved exclusively in the state or federal courts located in {GOVERNING_LAW}, and you consent to personal jurisdiction in those courts.
            </p>
            <p>
              Before initiating any formal proceeding, both parties agree to attempt to resolve disputes informally by contacting EdenRadar at {CONTACT_EMAIL} and allowing 30 days for resolution.
            </p>
          </Section>

          <Section title="14. Changes to These Terms">
            <p>
              We may update these Terms from time to time. When we do, we will revise the effective date at the top of this page. For material changes, we will provide notice through the Service or by email. Your continued use of the Service after any changes constitutes acceptance of the updated Terms.
            </p>
          </Section>

          <Section title="15. Contact">
            <p>
              If you have questions about these Terms, please contact us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-emerald-600 hover:text-emerald-500 underline"
                data-testid="link-tos-contact"
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
