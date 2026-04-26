import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Debately",
  description: "How Debately handles your information.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-5 py-14 text-zinc-300">
      <Link
        href="/"
        className="mb-10 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
      >
        ← Back to Debately
      </Link>

      <h1 className="mb-2 text-3xl font-semibold tracking-tight text-zinc-100">
        Privacy Policy
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
            Somerville, MA 02143, USA ("we", "us", or "our"). You can reach us at{" "}
            <a
              href="mailto:privacy@debately.website"
              className="text-indigo-400 hover:text-indigo-300"
            >
              privacy@debately.website
            </a>
            .
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            2. What data we collect — and what we don't
          </h2>
          <p className="mb-3">
            Debately is designed to collect as little data as possible.
          </p>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              <strong className="text-zinc-200">No user accounts.</strong> You never register,
              log in, or provide an email address.
            </li>
            <li>
              <strong className="text-zinc-200">No cookies.</strong> We do not set any cookies,
              first-party or third-party.
            </li>
            <li>
              <strong className="text-zinc-200">Solo debates stay local except for AI processing.</strong>{" "}
              Your solo nickname, topic, and debate state are stored in your browser's{" "}
              <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs">sessionStorage</code>,
              which is cleared when the browser session ends.
            </li>
            <li>
              <strong className="text-zinc-200">Multiplayer link sessions — temporary storage during play.</strong>{" "}
              To let two players share a lobby, reconnect, and receive live updates, we store
              the session state in memory and periodically write a JSON snapshot to disk. This
              can include nicknames, topics, arguments, factchecks, verdicts, and anonymous
              player-token hashes. Active sessions expire automatically after about 12 hours of
              inactivity.
            </li>
            <li>
              <strong className="text-zinc-200">Debate results stored for 30 days.</strong>{" "}
              Once a multiplayer debate concludes and a final verdict is issued, the full result —
              including the topic, nicknames, transcript, scores, and judge summary — is retained
              on our server for up to 30 days to support the shareable result link (
              <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs">/result/&lt;id&gt;</code>)
              and the PDF download feature. After 30 days the record is permanently deleted.
              You can request early deletion by emailing us with the session link.
            </li>
            <li>
              <strong className="text-zinc-200">Spectator reactions.</strong>{" "}
              When a spectator submits a "like" reaction on an argument, the display name they
              enter is stored as part of the session record and is subject to the same 30-day
              retention window.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            3. How your debate content is processed
          </h2>
          <p className="mb-3">
            When you submit a debate argument, it is sent over HTTPS to our API server. For
            AI-powered features, the server forwards relevant content to{" "}
            <strong className="text-zinc-200">Google Cloud Vertex AI (Gemini)</strong> to
            generate the AI opponent's response, judge factcheck, verdict, or optional hint.
            Solo debates use this as a transient processing step. Multiplayer sessions are also
            temporarily stored as described above so the shared link can work.
          </p>
          <p>
            Your content may appear briefly in our server process logs (Docker container
            stdout) for debugging purposes. These logs are not persisted to disk and are
            not shared with any third party beyond Google Cloud as the AI processor.
            Google's use of data submitted through the Vertex AI API is governed by the{" "}
            <a
              href="https://cloud.google.com/terms/data-processing-addendum"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300"
            >
              Google Cloud Data Processing Addendum
            </a>
            . Google does not use API-submitted content to train its models without a separate
            agreement.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            4. Analytics
          </h2>
          <p>
            We use{" "}
            <a
              href="https://plausible.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300"
            >
              Plausible Analytics
            </a>
            , a privacy-preserving analytics service. Plausible does not use cookies, does not
            collect personal identifiers, and does not store or process individual IP addresses.
            Only aggregated, anonymous statistics are collected — page views, referrer source,
            country (derived from IP and immediately discarded), and device type. No data is
            shared with advertisers.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            5. Legal basis for processing (EU / GDPR)
          </h2>
          <p className="mb-3">
            If you are located in the European Economic Area (EEA), we process your data on the
            following legal bases:
          </p>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              <strong className="text-zinc-200">Contractual necessity</strong> — transmitting
              your debate arguments to Google Vertex AI and temporarily storing multiplayer
              session state are necessary to deliver the core functionality of the Service.
            </li>
            <li>
              <strong className="text-zinc-200">Legitimate interests</strong> — anonymous
              analytics to understand aggregate usage patterns, without any impact on individual
              privacy.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            6. Your rights
          </h2>
          <p className="mb-3">
            Depending on where you live, you may have rights including access, rectification,
            erasure, restriction, portability, and objection. We do not run user accounts, so
            solo usage has no server-side profile attached to you. Completed multiplayer debates
            are stored anonymously for up to 30 days. To request early deletion of a specific
            result, email us with the session link; we will delete it within 72 hours.
          </p>
          <p>
            If you have concerns, email us at{" "}
            <a
              href="mailto:privacy@debately.website"
              className="text-indigo-400 hover:text-indigo-300"
            >
              privacy@debately.website
            </a>
            . EEA residents may also lodge a complaint with their local data protection
            authority.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            7. Data transfers
          </h2>
          <p>
            Your debate content is processed by Google Cloud Vertex AI, which may operate
            infrastructure in the United States and other countries. Google participates in the
            EU–US Data Privacy Framework and provides Standard Contractual Clauses for
            international transfers.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            8. Children
          </h2>
          <p>
            Debately is not directed at children under 13 (or under 16 in the EEA). We do not
            knowingly collect personal information from minors. If you believe a child has used
            the Service, please contact us and we will take appropriate steps.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            9. Changes to this policy
          </h2>
          <p>
            We may update this policy from time to time. Material changes will be reflected
            by an updated effective date at the top of this page. Continued use of the Service
            after changes constitutes acceptance of the revised policy.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            10. Contact
          </h2>
          <address className="not-italic text-zinc-400">
            <p>Bluume, Inc</p>
            <p>131 Summer St, Unit 1</p>
            <p>Somerville, MA 02143, USA</p>
            <p className="mt-2">
              <a
                href="mailto:privacy@debately.website"
                className="text-indigo-400 hover:text-indigo-300"
              >
                privacy@debately.website
              </a>
            </p>
          </address>
        </div>
      </section>
    </div>
  );
}
