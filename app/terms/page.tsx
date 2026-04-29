import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Debately",
  description: "Terms governing your use of Debately.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-5 py-14 text-zinc-300">
      <Link
        href="/"
        className="mb-10 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
      >
        ← Back to Debately
      </Link>

      <h1 className="mb-2 text-3xl font-semibold tracking-tight text-zinc-100">
        Terms of Service
      </h1>
      <p className="mb-10 text-sm text-zinc-500">
        Effective date: April 26, 2026 (updated May 2026) · Bluume, Inc
      </p>

      <section className="flex flex-col gap-8 text-[15px] leading-relaxed">
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            1. Who we are
          </h2>
          <p>
            Debately is operated by <strong className="text-zinc-200">Bluume, Inc</strong>, a
            Delaware corporation with its principal place of business at 131 Summer St, Unit 1,
            Somerville, MA 02143, USA ("Bluume", "we", "us", or "our"). By accessing or using
            Debately ("Service"), you agree to be bound by these Terms of Service ("Terms").
            If you do not agree, do not use the Service.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            2. Eligibility
          </h2>
          <p>
            You must be at least 13 years old to use the Service. If you are located in the
            European Economic Area (EEA), you must be at least 16 years old. By using the
            Service, you represent that you meet the applicable age requirement.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            3. Description of the Service
          </h2>
          <p>
            Debately is an AI-powered debate practice tool that lets you argue a position
            against an AI opponent or, in multiplayer link mode, against another human player.
            A neutral AI judge may evaluate arguments, factcheck moves, provide optional hints,
            and generate a verdict. After a multiplayer debate concludes, a shareable result
            page and PDF download are available at{" "}
            <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs">/result/&lt;id&gt;</code>{" "}
            for up to 30 days. Debate School is currently a preview explaining why debate
            practice matters; full lessons and guided drills are coming later. The Service is
            provided for entertainment and educational purposes only. Nothing in Debately
            constitutes legal, medical, financial, or professional advice of any kind.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            4. Cookies, local storage, and your choices
          </h2>
          <p>
            The Service may use first-party{" "}
            <strong className="text-zinc-200">cookies</strong> and{" "}
            <strong className="text-zinc-200">browser storage</strong> to remember a random
            anonymous per-browser id, to record your analytics preferences, and to make the
            in-product experience work. Optional privacy-friendly page analytics (Plausible)
            is loaded only if you agree in the on-site notice. The{" "}
            <Link href="/cookies" className="text-indigo-400 hover:text-indigo-300">
              Cookie policy
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-indigo-400 hover:text-indigo-300">
              Privacy Policy
            </Link>{" "}
            describe what we set and why. By continuing to use the Service after you interact
            with the notice, you confirm that you understand how we use that storage in
            line with the choice you make (or your browser settings if you clear data).
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            5. Acceptable use
          </h2>
          <p className="mb-3">You agree not to use the Service to:</p>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>submit content that is illegal, harassing, threatening, or abusive;</li>
            <li>
              attempt to elicit harmful, hateful, or dangerous content from the AI beyond the
              intended debate format;
            </li>
            <li>
              reverse-engineer, scrape, or systematically extract data from the Service;
            </li>
            <li>
              use automated scripts or bots to submit requests, which may harm service
              availability for other users;
            </li>
            <li>
              share multiplayer or result links for harassment, spam, impersonation, or other
              abusive behavior;
            </li>
            <li>
              use the shareable result or PDF download features to misrepresent AI-generated
              verdicts as authoritative factual assessments.
            </li>
            <li>impersonate any person or entity.</li>
          </ul>
          <p className="mt-3">
            We reserve the right to block access to the Service for any usage that violates
            these Terms or places undue load on our infrastructure.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            6. AI-generated content
          </h2>
          <p>
            The AI responses generated by Debately are produced by large language models and
            may be inaccurate, incomplete, or outdated. The "Judge" factcheck and verdict are
            automated assessments and do not represent the views of Bluume. You should not
            rely on AI output as a source of factual truth. We are not liable for decisions
            made based on content generated by the Service.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            7. Intellectual property
          </h2>
          <p>
            All software, design, and branding of the Service are owned by or licensed to
            Bluume. You retain ownership of any original text you submit. By submitting content
            to the Service, you grant Bluume a limited, non-exclusive, royalty-free license to
            process and temporarily store that content solely to provide the Service to you,
            including multiplayer synchronization, resume-by-link behavior, AI processing,
            verdict generation, and storing completed debate results for up to 30 days to
            enable the shareable result link and PDF download features.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            8. Disclaimer of warranties
          </h2>
          <p>
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
            EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY,
            FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE
            SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL
            COMPONENTS.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            9. Limitation of liability
          </h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, BLUUME AND ITS OFFICERS,
            DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
            SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR DATA,
            ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE, EVEN IF ADVISED OF
            THE POSSIBILITY OF SUCH DAMAGES. IN NO EVENT SHALL OUR TOTAL LIABILITY TO YOU
            EXCEED USD 100.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            10. Third-party services
          </h2>
          <p>
            The Service relies on Google Cloud Vertex AI to power AI responses. Your debate
            content may be transmitted to Google&apos;s servers for processing. Multiplayer
            sessions rely on temporary in-memory and JSON snapshot storage in our server
            environment so shared links and live updates can work. Finished debate results —
            including the full transcript, scores, and judge summary — are retained for up
            to 30 days so the shareable result link and PDF download remain accessible.
            Google&apos;s terms and privacy policies apply to AI processing. We are not
            responsible for Google&apos;s practices or the content of any third-party services
            linked from Debately.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            11. Governing law and disputes
          </h2>
          <p>
            These Terms are governed by the laws of the State of Delaware, USA, without
            regard to its conflict-of-law principles. Any dispute arising under these Terms
            shall be resolved exclusively in the state or federal courts located in the State
            of Delaware, and you consent to personal jurisdiction in those courts.
          </p>
          <p className="mt-3">
            If you are located in the EEA, mandatory consumer protection laws of your country
            of residence may apply in addition to the above.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            12. Changes to these Terms
          </h2>
          <p>
            We may update these Terms at any time. Material changes will be reflected by an
            updated effective date. Continued use of the Service after changes are posted
            constitutes acceptance of the revised Terms.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            13. Contact
          </h2>
          <address className="not-italic text-zinc-400">
            <p>Bluume, Inc</p>
            <p>131 Summer St, Unit 1</p>
            <p>Somerville, MA 02143, USA</p>
            <p className="mt-2">
              <a
                href="mailto:legal@debately.website"
                className="text-indigo-400 hover:text-indigo-300"
              >
                legal@debately.website
              </a>
            </p>
          </address>
        </div>
      </section>
    </div>
  );
}
