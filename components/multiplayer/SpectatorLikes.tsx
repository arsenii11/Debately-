"use client";

import { useCallback, useState } from "react";
import type { Side } from "@/lib/types";
import type { SpecLike } from "@/lib/multiplayer/types";

const SPEC_NAME_KEY = "debately:spec:name";

function getStoredName(): string {
  try {
    return localStorage.getItem(SPEC_NAME_KEY) ?? "";
  } catch {
    return "";
  }
}
function saveName(name: string) {
  try {
    localStorage.setItem(SPEC_NAME_KEY, name);
  } catch {
    /* ignore */
  }
}

type Props = {
  sessionId: string;
  round: number;
  side: Side;
  likes: SpecLike[];
  onLiked: (updatedLikes: SpecLike[]) => void;
};

export function SpectatorLikes({ sessionId, round, side, likes, onLiked }: Props) {
  const [nameInput, setNameInput] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = likes.filter((l) => l.round === round && l.side === side).length;
  const names = likes
    .filter((l) => l.round === round && l.side === side)
    .map((l) => l.name);

  const submitLike = useCallback(
    async (name: string) => {
      if (!name.trim()) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/multiplayer/sessions/${sessionId}/like`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), round, side }),
        });
        const data = (await res.json()) as { session?: { likes?: SpecLike[] }; error?: string };
        if (!res.ok) {
          setError(data.error ?? "Could not submit like.");
          return;
        }
        saveName(name.trim());
        setPromptOpen(false);
        if (data.session?.likes) onLiked(data.session.likes);
      } catch {
        setError("Network error.");
      } finally {
        setBusy(false);
      }
    },
    [sessionId, round, side, onLiked],
  );

  const handleLikeClick = () => {
    const stored = getStoredName();
    if (stored) {
      void submitLike(stored);
    } else {
      setPromptOpen(true);
    }
  };

  const alreadyLiked = (() => {
    const stored = getStoredName();
    return stored
      ? likes.some(
          (l) =>
            l.round === round &&
            l.side === side &&
            l.name.toLowerCase() === stored.toLowerCase(),
        )
      : false;
  })();

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy || alreadyLiked}
        onClick={handleLikeClick}
        title={names.length > 0 ? names.join(", ") : "Be the first to react"}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
          alreadyLiked
            ? "border-amber-400/40 bg-amber-400/15 text-amber-200"
            : "cursor-pointer border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:border-amber-400/50 hover:bg-amber-400/10 hover:text-amber-200"
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span>👍</span>
        {count > 0 ? <span>{count}</span> : null}
      </button>

      {promptOpen ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            maxLength={32}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitLike(nameInput);
              if (e.key === "Escape") setPromptOpen(false);
            }}
            placeholder="Your name"
            className="w-32 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400 focus:outline-none"
          />
          <button
            type="button"
            disabled={!nameInput.trim() || busy}
            onClick={() => void submitLike(nameInput)}
            className="cursor-pointer rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-400/20 disabled:opacity-50"
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => { setPromptOpen(false); setError(null); }}
            className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300"
          >
            ✕
          </button>
        </div>
      ) : null}

      {error ? <span className="text-xs text-rose-400">{error}</span> : null}
    </div>
  );
}
