"use client";

import { useLayoutEffect, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import {
  allowsAnalyticsForStats,
  consentIsUnset,
  ensureCookiesMirrorStorage,
  loadUserPreferences,
  saveConsentChoice,
} from "@/lib/cookiePreferences";

export function ConsentAndAnalytics() {
  const [ready, setReady] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(true);
  const [analytics, setAnalytics] = useState(false);

  useLayoutEffect(() => {
    ensureCookiesMirrorStorage();
    const p = loadUserPreferences();
    setReady(true);
    setBannerOpen(!p || p.consent === "unset");
    setAnalytics(allowsAnalyticsForStats());
  }, []);

  useLayoutEffect(() => {
    const onChange = () => {
      ensureCookiesMirrorStorage();
      setAnalytics(allowsAnalyticsForStats());
      if (!consentIsUnset()) {
        setBannerOpen(false);
      }
    };
    window.addEventListener("debately:consent-changed", onChange);
    return () => window.removeEventListener("debately:consent-changed", onChange);
  }, []);

  if (!ready) {
    return null;
  }

  return (
    <>
      {bannerOpen ? (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-zinc-950/98 px-4 py-4 shadow-[0_-4px_24px_rgba(0,0,0,0.4)] backdrop-blur sm:px-6"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          role="dialog"
          aria-label="Cookie preferences"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:gap-4">
            <p className="text-sm leading-relaxed text-zinc-200">
              We use first-party storage to keep a random anonymous id and, if
              you choose, to load privacy-friendly page analytics. For details
              see our{" "}
              <Link
                href="/cookies"
                className="font-medium text-indigo-400 underline decoration-indigo-500/50 underline-offset-2 hover:text-indigo-300"
              >
                Cookie policy
              </Link>
              ,{" "}
              <Link
                href="/privacy"
                className="font-medium text-indigo-400 underline decoration-indigo-500/50 underline-offset-2 hover:text-indigo-300"
              >
                Privacy
              </Link>{" "}
              (including how we use cookies and similar storage), and{" "}
              <Link
                href="/terms"
                className="font-medium text-indigo-400 underline decoration-indigo-500/50 underline-offset-2 hover:text-indigo-300"
              >
                Terms
              </Link>{" "}
              (consent, cookies, and the Service).
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <Link
                href="/cookies"
                className="order-last text-center text-xs text-zinc-500 hover:text-zinc-400 sm:order-none sm:mr-auto sm:text-left"
              >
                Learn more
              </Link>
              <button
                type="button"
                onClick={() => saveConsentChoice("necessary")}
                className="cursor-pointer rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
              >
                Essential only
              </button>
              <button
                type="button"
                onClick={() => saveConsentChoice("all")}
                className="cursor-pointer rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-900/30 transition-colors hover:bg-indigo-500"
              >
                Accept all
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {analytics && !bannerOpen ? (
        <Script
          defer
          data-domain="debately.website"
          src="https://plausible.io/js/script.js"
          strategy="afterInteractive"
        />
      ) : null}
    </>
  );
}
