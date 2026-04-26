"use client";

import { useState } from "react";
import { setSpectatorDisplayName } from "@/lib/multiplayer/spectatorNameStorage";

type Props = {
  onSaved: (name: string) => void;
};

export function SpectatorEntryName({ onSaved }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const t = value.trim().slice(0, 32);
    if (!t) {
      setError("Enter a name your friend will see on reactions.");
      return;
    }
    setError(null);
    setSpectatorDisplayName(t);
    onSaved(t);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-amber-100">Your display name</p>
        <p className="mt-1 text-xs text-amber-200/85">
          Shown next to your reactions. Change anytime via the footer.
        </p>
      </div>
      <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <input
            id="spectator-name-entry"
            autoFocus
            maxLength={32}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            placeholder="e.g. Sam"
            className="w-full rounded-xl border border-amber-500/40 bg-amber-950/40 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={save}
          className="shrink-0 cursor-pointer rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-400"
        >
          Continue
        </button>
      </div>
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
