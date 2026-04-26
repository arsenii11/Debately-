"use client";

import { useCallback, useState } from "react";
import type { Side } from "@/lib/types";
import {
  SPEC_REACTION_KINDS,
  type SpecLike,
  type SpecReactionKind,
} from "@/lib/multiplayer/types";
import {
  getSpectatorDisplayName,
  setSpectatorDisplayName,
} from "@/lib/multiplayer/spectatorNameStorage";
import { reactionHoverTitle } from "./spectatorMeta";

const BUTTONS: { kind: SpecReactionKind; emoji: string }[] = [
  { kind: "like", emoji: "👍" },
  { kind: "dislike", emoji: "👎" },
  { kind: "cackle", emoji: "😂" },
  { kind: "fire", emoji: "🔥" },
];

function kindOf(r: SpecLike): SpecReactionKind {
  return SPEC_REACTION_KINDS.includes(r.kind) ? r.kind : "like";
}

type Props = {
  sessionId: string;
  round: number;
  side: Side;
  reactions: SpecLike[];
  readOnly?: boolean;
  onUpdate?: (next?: SpecLike[]) => void;
  align?: "start" | "end";
  /**
   * Spectator view: display name from parent (entry gate). When set, overrides
   * localStorage for this view. Omitted in read-only in-debate UI.
   */
  viewerName?: string;
};

export function SpectatorReactions({
  sessionId,
  round,
  side,
  reactions,
  readOnly = false,
  onUpdate,
  align = "end",
  viewerName: viewerNameProp,
}: Props) {
  const [busyKind, setBusyKind] = useState<SpecReactionKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveName = (
    viewerNameProp !== undefined
      ? viewerNameProp
      : getSpectatorDisplayName()
  ).trim();

  const forKind = (kind: SpecReactionKind) =>
    reactions.filter(
      (r) => r.round === round && r.side === side && kindOf(r) === kind,
    );

  const iHaveThisReaction = (kind: SpecReactionKind) =>
    effectiveName.length > 0
      ? reactions.some(
          (r) =>
            r.round === round &&
            r.side === side &&
            kindOf(r) === kind &&
            r.name.toLowerCase() === effectiveName.toLowerCase(),
        )
      : false;

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
        setSpectatorDisplayName(name.trim());
        onUpdate?.(data.session?.likes);
      } catch {
        setError("Network error.");
      } finally {
        setBusyKind(null);
      }
    },
    [sessionId, round, side, onUpdate],
  );

  const submitRemove = useCallback(
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
            remove: true,
          }),
        });
        const data = (await res.json()) as {
          session?: { likes?: SpecLike[] };
          error?: string;
        };
        if (!res.ok) {
          setError(data.error ?? "Could not remove reaction.");
          return;
        }
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
    if (!effectiveName) return;
    if (iHaveThisReaction(kind)) {
      void submitRemove(effectiveName, kind);
      return;
    }
    void submit(effectiveName, kind);
  };

  const justify = align === "start" ? "justify-start" : "justify-end";
  const needName = !readOnly && !effectiveName;

  return (
    <div className={`mt-1 flex w-full min-w-0 flex-col gap-1 ${justify}`}>
      {needName ? (
        <p className="text-[10px] text-amber-200/80">
          Set your name in the bar above to react.
        </p>
      ) : null}
      <div className={`flex flex-wrap items-center gap-1 ${justify}`}>
        {BUTTONS.map(({ kind, emoji }) => {
          const list = forKind(kind);
          const count = list.length;
          const names = list.map((r) => r.name);
          const disabled =
            readOnly || busyKind !== null || (!readOnly && !effectiveName);
          const mineHere = !readOnly && iHaveThisReaction(kind);
          const title = reactionHoverTitle(
            kind,
            names,
            mineHere,
          );
          return (
            <button
              key={kind}
              type="button"
              disabled={disabled}
              onClick={() => handlePickKind(kind)}
              title={readOnly && count === 0 ? "No reactions yet" : title}
              className={`flex min-h-[28px] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                readOnly
                  ? "cursor-default border-zinc-700/80 bg-zinc-900/50 text-zinc-400"
                  : needName
                    ? "cursor-not-allowed border-zinc-800 bg-zinc-900/50 text-zinc-500 opacity-70"
                    : mineHere
                      ? "cursor-pointer border-indigo-500/50 bg-indigo-950/50 text-indigo-100 ring-1 ring-indigo-500/30 hover:border-rose-400/60 hover:bg-rose-950/40"
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

      {error ? (
        <p className={`text-[11px] text-rose-400 ${justify} text-left`}>{error}</p>
      ) : null}
    </div>
  );
}
