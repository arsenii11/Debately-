"use client";

import { useLayoutEffect, useState } from "react";

type Props = {
  storageKey: string;
  show: boolean;
};

export function TurnBrowserNotifyBanner({ storageKey, show }: Props) {
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined" || !show) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    if (sessionStorage.getItem(storageKey)) return;
    setOpen(true);
  }, [show, storageKey]);

  if (!open || !show) return null;

  const dismiss = () => {
    sessionStorage.setItem(storageKey, "1");
    setOpen(false);
  };

  return (
    <div
      role="status"
      className="flex shrink-0 items-start gap-3 border-b border-indigo-500/25 bg-indigo-950/35 px-3 py-2.5 sm:px-4"
    >
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-xs font-semibold text-indigo-200">
          Heads up: browser notifications
        </p>
        <p className="mt-1 text-[11px] leading-snug text-zinc-400">
          Allow them to get pinged when it is your turn again, even if this tab
          is in the background.
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => {
            void Notification.requestPermission().finally(dismiss);
          }}
          className="cursor-pointer rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-500"
        >
          Enable
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="cursor-pointer rounded-lg px-2 py-1.5 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-900/80 hover:text-zinc-300"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
