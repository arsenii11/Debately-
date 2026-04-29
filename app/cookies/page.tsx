import type { Metadata } from "next";
import Link from "next/link";
import { COOKIE_NAMES } from "@/lib/cookiePreferences";

export const metadata: Metadata = {
  title: "Cookie Policy — Debately",
  description: "How Debately uses cookies and similar storage.",
};

export default function CookiesPage() {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-5 py-14 text-zinc-300">
      <Link
        href="/"
        className="mb-10 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
      >
        ← Back to Debately
      </Link>

      <h1 className="mb-2 text-3xl font-semibold tracking-tight text-zinc-100">
        Cookie Policy
      </h1>
      <p className="mb-10 text-sm text-zinc-500">
        Effective date: April 28, 2026 · Bluume, Inc
      </p>

      <section className="flex flex-col gap-8 text-[15px] leading-relaxed">
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            1. What this policy covers
          </h2>
          <p>
            This page describes how{" "}
            <strong className="text-zinc-200">Debately</strong> (operated by
            Bluume, Inc) uses <strong className="text-zinc-200">cookies</strong>{" "}
            and <strong className="text-zinc-200">browser storage</strong>{" "}
            (including{" "}
            <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs">
              localStorage
            </code>
            ) to remember your choices and to support a simple anonymous
            per-browser profile. It should be read together with our{" "}
            <Link
              href="/privacy"
              className="text-indigo-400 hover:text-indigo-300"
            >
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/terms" className="text-indigo-400 hover:text-indigo-300">
              Terms of Service
            </Link>
            , which explain how the Service, analytics, and legal terms fit
            together.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            2. Consent banner
          </h2>
          <p>
            When you first use the site, you may see a notice offering{" "}
            <strong className="text-zinc-200">Essential only</strong> or{" "}
            <strong className="text-zinc-200">Accept all</strong>. We only load
            optional third-party page analytics (Plausible) if you accept
            analytics. Strictly necessary storage for the notice itself and
            (after you choose) to remember that choice and your anonymous id is
            set only in line with the option you select.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            3. First-party cookies
          </h2>
          <p className="mb-3">
            After you make a choice in the notice, we may set the following
            first-party cookies (names are exact):
          </p>
          <ul className="mb-3 flex list-disc flex-col gap-2 pl-5">
            <li>
              <code className="rounded bg-zinc-800 px-1 text-xs">
                {COOKIE_NAMES.uid}
              </code>{" "}
              — a random identifier for your browser, used to distinguish
              repeat visits without a login. Duration: up to one year, renewed
              when you use the site with a saved choice.
            </li>
            <li>
              <code className="rounded bg-zinc-800 px-1 text-xs">
                {COOKIE_NAMES.analytics}
              </code>{" "}
              —{" "}
              <code className="rounded bg-zinc-800 px-1 text-xs">1</code> if
              you allowed analytics,{" "}
              <code className="rounded bg-zinc-800 px-1 text-xs">0</code> if
              you chose essential only. Duration: up to one year.
            </li>
          </ul>
          <p>
            The same data is duplicated in{" "}
            <code className="rounded bg-zinc-800 px-1 text-xs">localStorage</code>{" "}
            (key <code className="rounded bg-zinc-800 px-1 text-xs">debately:preferences:v1</code>)
            for reliability. Debate state, solo progress, and multiplayer
            link tokens may use other{" "}
            <code className="rounded bg-zinc-800 px-1 text-xs">localStorage</code>{" "}
            keys as described in the{" "}
            <Link
              href="/privacy"
              className="text-indigo-400 hover:text-indigo-300"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            4. Analytics
          </h2>
          <p>
            If you accept analytics, we load{" "}
            <strong className="text-zinc-200">Plausible Analytics</strong> (a
            lightweight script from plausible.io) to collect aggregated traffic
            statistics. Plausible is designed to be privacy-friendly; we only
            enable it when you have opted in. See the Privacy Policy for
            details.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            5. Changing or deleting
          </h2>
          <p>
            You can clear site data in your browser settings, which removes our
            cookies and storage. The consent banner will appear again on the
            next visit until you make a new choice. For other rights, see the
            Privacy Policy.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">
            6. Contact
          </h2>
          <p>
            <a
              href="mailto:privacy@debately.website"
              className="text-indigo-400 hover:text-indigo-300"
            >
              privacy@debately.website
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
