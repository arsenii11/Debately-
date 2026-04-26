"use client";

import { useCallback, useState } from "react";
import type { Side } from "@/lib/types";
import {
  SPEC_REACTION_KINDS,
  type SpecLike,
  type SpecReactionKind,
} from "@/lib/multiplayer/types";

const SPEC_NAME_KEY = "debately:spec:name";

const BUTTONS: { kind: SpecReactionKind; emoji: string }[] = [
  { kind: "like", emoji: "👍" },
  { kind: "dislike", emoji: "👎" },
  { kind: "cackle", emoji: "😂" },
  { kind: "fire", emoji: "🔥" },
];

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

function kindOf(r: SpecLike): SpecReactionKind {
  return SPEC_REACTION_KINDS.includes(r.kind) ? r.kind : "like";
}

type Props = {
  sessionId: string;
  round: number;
  side: Side;
  reactions: SpecLike[];
  readOnly?: boolean;
  onUpdate?: (next: SpecLike[]) => void;
  align?: "start" | "end";
};

export function SpectatorReactions({
  sessionId,
  round,
  side,
  reactions,
  readOnly = false,
  onUpdate,
  align = "end",
}: Props) {
  const [nameInput, setNameInput] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);
  const [pendingKind, setPendingKind] = useState<SpecReactionKind | null>(null);
  const [busyKind, setBusyKind] = useState<SpecReactionKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const forKind = (kind: SpecReactionKind) =>
    reactions.filter(
      (r) => r.round === round && r.side === side && kindOf(r) === kind,
    );

  const submit = useCallback(
    async (name: string, kind: SpecReactionKind) => {
      if (!name.trim()) return;
      setBusyKind(kind);
      setError(null);
      try {
        const res = await fetch(`/api/multiplayer/sessions/${sessionId}/like`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            round,
            side,
            kind,
          }),
        });
        const data = (await res.json()) as {
          session?: { likes?: SpecLike[] };
          error?: string;
        };
        if (!res.ok) {
          setError(data.error ?? "Could not react.");
          return;
        }
        saveName(name.trim());
        setPromptOpen(false);
        setPendingKind(null);
        onUpdate?.(data.session?.likes);
      } catch {
        setError("Network error.");
      } finally {
        setBusyKind(null);
      }
    },
    [sessionId, round, side, onUpdate],
  );

  const handlePickKind = (kind: SpecReactionKind) => {
    if (readOnly) return;
    const stored = getStoredName();
    if (stored) {
      void submit(stored, kind);
    } else {
      setPendingKind(kind);
      setPromptOpen(true);
    }
  };

  const stored = getStoredName();
  const already = (kind: SpecReactionKind) =>
    stored
      ? reactions.some(
          (r) =>
            r.round === round &&
            r.side === side &&
            kindOf(r) === kind &&
            r.name.toLowerCase() === stored.toLowerCase(),
        )
      : false;

  const justify = align === "start" ? "justify-start" : "justify-end";

  return (
    <div className={`mt-1 flex w-full min-w-0 flex-col gap-1 ${justify}`}>
      <div className={`flex flex-wrap items-center gap-1 ${justify}`}>
        {BUTTONS.map(({ kind, emoji }) => {
          const list = forKind(kind);
          const count = list.length;
          const names = list.map((r) => r.name);
          const disabled =
            readOnly || busyKind !== null || already(kind);
          return (
            <button
              key={kind}
              type="button"
              disabled={disabled}
              onClick={() => handlePickKind(kind)}
              title={
                names.length > 0
                  ? `${kind}: ${names.join(", ")}`
                  : readOnly
                    ? `${kind}`
                    : `${kind}`
              }
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                readOnly
                  ? "cursor-default border-zinc-700/80 bg-zinc-900/50 text-zinc-400"
                  : count > 0
                    ? "cursor-pointer border-zinc-600 bg-zinc-800/80 text-zinc-200 hover:border-indigo-400/50 hover:bg-indigo-950/40"
                    : "cursor-pointer border-zinc-700 bg-zinc-900/60 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
              } disabled:cursor-not-allowed disabled:opacity-45`}
            >
              <span aria-hidden>{emoji}</span>
              {count > 0 ? <span className="tabular-nums">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {!readOnly && promptOpen ? (
        <div
          className={`flex flex-wrap items-center gap-2 ${justify}`}
        >
          <input
            autoFocus
            maxLength={32}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && pendingKind)
                void submit(nameInput, pendingKind);
              if (e.key === "Escape") {
                setPromptOpen(false);
                setPendingKind(null);
              }
            }}
            placeholder="Your name"
            className="w-28 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-400 focus:outline-none"
          />
          <button
            type="button"
            disabled={!nameInput.trim() || !pendingKind || busyKind !== null}
            onClick={() =>
              pendingKind ? void submit(nameInput, pendingKind) : undefined
            }
            className="cursor-pointer rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-2 py-1 text-[11px] font-semibold text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-50"
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => {
              setPromptOpen(false);
              setPendingKind(null);
              setError(null);
            }}
            className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300"
          >
            ✕
          </button>
        </div>
      ) : null}

      {error ? (
        <p className={`text-[11px] text-rose-400 ${justify} text-left`}>{error}</p>
      ) : null}
    </div>
  );
}
