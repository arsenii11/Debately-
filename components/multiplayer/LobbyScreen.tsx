"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_TURN_ROUNDS,
  DEFAULT_TURN_TIMER_SECONDS,
  MAX_TURN_ROUNDS,
  MAX_TURN_TIMER_SECONDS,
  MIN_TURN_ROUNDS,
  MIN_TURN_TIMER_SECONDS,
  UNTIMED_TURN_TIMER_SECONDS,
} from "@/lib/types";
import type { Side } from "@/lib/types";
import type { PublicSession, SlotId } from "@/lib/multiplayer/types";
import { TopicPicker } from "@/components/TopicPicker";
import { VoiceInputLangSelect } from "@/components/VoiceInputLangSelect";

type Props = {
  session: PublicSession;
  mySlot: SlotId | null;
  myNickname: string;
  onUpdate: (
    update: {
      topic?: string | null;
      side?: Side | null;
      turnRounds?: number | null;
      turnTimerSeconds?: number | null;
      sideSelectionLockedByHost?: boolean;
      nickname?: string;
      ready?: boolean;
    },
  ) => Promise<void>;
  onJoin: (nickname: string) => Promise<void>;
  busy?: boolean;
  errorMessage?: string | null;
  shareUrl: string;
};

const ROUND_OPTIONS = [3, 4, 5, 6, 8, MAX_TURN_ROUNDS]
  .filter((n) => n >= MIN_TURN_ROUNDS && n <= MAX_TURN_ROUNDS)
  .filter((n, i, arr) => arr.indexOf(n) === i);

const TIMER_OPTIONS = [
  { value: 60, label: "1 min" },
  { value: 90, label: "1:30" },
  { value: 120, label: "2 min" },
  { value: 180, label: "3 min" },
  { value: 240, label: "4 min" },
  { value: 300, label: "5 min" },
  { value: 0, label: "No timer" },
];

function formatProposalSummary(
  topic: string | null,
  side: Side | null,
  turnRounds: number | null,
  turnTimerSeconds: number | null,
): string {
  const parts: string[] = [];
  if (topic) parts.push(`"${topic.length > 32 ? `${topic.slice(0, 30)}…` : topic}"`);
  if (side) parts.push(side);
  if (turnRounds) parts.push(`${turnRounds} rounds`);
  if (typeof turnTimerSeconds === "number") {
    parts.push(
      turnTimerSeconds === 0
        ? "untimed"
        : `${Math.round(turnTimerSeconds / 60 * 10) / 10} min`,
    );
  }
  return parts.length ? parts.join(" · ") : "(no preferences yet)";
}

export function LobbyScreen({
  session,
  mySlot,
  myNickname,
  onUpdate,
  onJoin,
  busy,
  errorMessage,
  shareUrl,
}: Props) {
  const me = mySlot
    ? session.players.find((p) => p.slot === mySlot) ?? null
    : null;
  const opponent = mySlot
    ? session.players.find((p) => p.slot !== mySlot) ?? null
    : session.players.find((p) => p.claimed) ?? null;

  const [nickname, setNickname] = useState(myNickname);
  const [topic, setTopic] = useState<string>(me?.proposal.topic ?? "");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (me?.proposal.topic !== undefined) {
      setTopic(me.proposal.topic ?? "");
    }
  }, [me?.proposal.topic]);

  useEffect(() => {
    if (myNickname && !nickname) setNickname(myNickname);
    if (me?.nickname && !nickname) setNickname(me.nickname);
  }, [me?.nickname, myNickname, nickname]);

  const myProposal = me?.proposal;
  const opponentProposal = opponent?.proposal;
  const myReady = me?.ready === true;
  const opponentReady = opponent?.ready === true;
  const isHost = mySlot === "A";
  const sideSelectionLockedByHost = session.sideSelectionLockedByHost;

  const canEdit = !!me;
  const settings = session.settings;

  const effectiveRounds =
    myProposal?.turnRounds ??
    opponentProposal?.turnRounds ??
    settings.turnRounds ??
    DEFAULT_TURN_ROUNDS;
  const effectiveTimer =
    myProposal?.turnTimerSeconds ??
    opponentProposal?.turnTimerSeconds ??
    settings.turnTimerSeconds ??
    DEFAULT_TURN_TIMER_SECONDS;
  const effectiveSide = myProposal?.side ?? me?.side ?? null;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore clipboard failures */
    }
  }, [shareUrl]);

  const canJoin = !me && session.players.some((p) => !p.claimed);
  const trimmedNick = nickname.trim();

  const readyDisabled = useMemo(() => {
    if (!me) return true;
    const sharedTopic = (myProposal?.topic ?? opponentProposal?.topic ?? "").trim();
    return !sharedTopic;
  }, [me, myProposal?.topic, opponentProposal?.topic]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-5 sm:p-8">
      <header className="flex flex-col gap-2 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Battle room ⚔
        </p>
        <h1 className="text-2xl font-bold text-zinc-100 sm:text-3xl">
          Set up the fight 🥊
        </h1>
        <p className="text-sm text-zinc-400">
          Send this link to your opponent. Once you&apos;re both set, hit Ready,
          and it begins. No backing out 💀
        </p>
      </header>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Your challenge link 🔗
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
            {shareUrl}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="cursor-pointer rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-indigo-500 hover:text-white"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <VoiceInputLangSelect id="lobby-voice-lang" />
      </section>

      {!me ? (
        <section className="rounded-2xl border border-amber-400/40 bg-amber-950/30 p-4">
          <p className="text-sm font-semibold text-amber-100">
            Join this lobby
          </p>
          <p className="mt-1 text-xs text-amber-200/80">
            Your battle name is what your opponent sees.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value.slice(0, 32))}
              placeholder="Your battle name"
              className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400 focus:outline-none"
            />
            <button
              type="button"
              disabled={!canJoin || trimmedNick.length === 0 || busy}
              onClick={() => onJoin(trimmedNick)}
              className="cursor-pointer rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              Join
            </button>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        {session.players.map((p) => {
          const isMine = mySlot === p.slot;
          return (
            <div
              key={p.slot}
              className={`rounded-2xl border p-4 ${
                isMine
                  ? "border-indigo-500/50 bg-indigo-950/30"
                  : p.claimed
                    ? "border-zinc-700 bg-zinc-900/50"
                    : "border-dashed border-zinc-700/60 bg-zinc-900/30"
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                {isMine ? "You 👤" : p.claimed ? "Opponent 👤" : "Opponent 👤"}
              </p>
              <p className="mt-1 text-base font-bold text-zinc-100">
                {p.claimed
                  ? p.nickname || "Unnamed"
                  : "Waiting for them to accept… 👀"}
              </p>
              {p.claimed ? (
                <>
                  <p className="mt-1 text-xs text-zinc-400">
                    {formatProposalSummary(
                      p.proposal.topic,
                      p.proposal.side,
                      p.proposal.turnRounds,
                      p.proposal.turnTimerSeconds,
                    )}
                  </p>
                  <p
                    className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      p.ready
                        ? "bg-emerald-500/30 text-emerald-100"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {p.ready ? "Ready" : "Not ready yet ⏳"}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">
                  {isHost
                    ? "Send them the link. They&apos;ll show up here when they open it."
                    : "Hold tight…"}
                </p>
              )}
            </div>
          );
        })}
      </section>

      {canEdit && !isHost && myReady ? (
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-2xl">
            ✓
          </div>
          <div>
            <p className="text-lg font-semibold text-zinc-100">You're ready!</p>
            <p className="mt-1 text-sm text-zinc-400">
              Waiting for{" "}
              <span className="font-medium text-zinc-200">
                {opponent?.nickname ?? "the host"}
              </span>{" "}
              to start the debate…
            </p>
          </div>
          <button
            type="button"
            onClick={() => onUpdate({ ready: false })}
            disabled={busy}
            className="cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
          >
            Cancel ready
          </button>
        </section>
      ) : null}

      {canEdit && (isHost || !myReady) ? (
        <>
          {isHost ? (
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-fuchsia-400/90">
                Pick the battlefield 🗡
              </p>
              <TopicPicker
                selectedTopic={topic}
                maxTopicLength={280}
                onTopic={(t) => {
                  setTopic(t);
                  void onUpdate({ topic: t });
                }}
              />
              <p className="mt-4 text-[11px] text-zinc-500">
                You pick the topic; your opponent picks their side.
              </p>
            </section>
          ) : (
            opponentProposal?.topic ? (
              <section className="rounded-2xl border border-zinc-700/50 bg-zinc-900/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Topic proposed by host
                </p>
                <p className="mt-2 text-sm font-medium text-zinc-100">
                  {opponentProposal.topic}
                </p>
              </section>
            ) : (
              <section className="rounded-2xl border border-dashed border-zinc-700/60 bg-zinc-900/20 p-4 text-center text-sm text-zinc-500">
                Waiting for the host to pick a topic…
              </section>
            )
          )}

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Choose your side — no switching after 👊
              </p>
              {isHost ? (
                <button
                  type="button"
                  onClick={() =>
                    onUpdate({
                      sideSelectionLockedByHost: !sideSelectionLockedByHost,
                    })
                  }
                  disabled={busy}
                  className={`cursor-pointer rounded-md border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                    sideSelectionLockedByHost
                      ? "border-amber-400/60 bg-amber-500/20 text-amber-100"
                      : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500"
                  }`}
                >
                  {sideSelectionLockedByHost ? "Side lock: on" : "Side lock: off"}
                </button>
              ) : null}
            </div>
            <div className="mt-2 flex gap-2">
              {(["FOR", "AGAINST"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy || (!isHost && sideSelectionLockedByHost)}
                  onClick={() => onUpdate({ side: s })}
                  className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                    effectiveSide === s
                      ? s === "FOR"
                        ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                        : "border-rose-400 bg-rose-500/20 text-rose-100"
                      : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {s}
                </button>
              ))}
              <button
                type="button"
                disabled={busy || (!isHost && sideSelectionLockedByHost)}
                onClick={() => onUpdate({ side: null })}
                className="cursor-pointer rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-400 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Random
              </button>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              {isHost
                ? "You can lock side choice so only you assign sides before start."
                : sideSelectionLockedByHost
                  ? "Host locked side choice and will decide sides."
                  : "Can&apos;t both argue the same side — one of you gets flipped automatically."}
            </p>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                How many rounds? 🥊
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ROUND_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={busy || !isHost}
                    onClick={() => onUpdate({ turnRounds: n })}
                    className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-semibold ${
                      effectiveRounds === n
                        ? "border-indigo-400 bg-indigo-500/20 text-indigo-100"
                        : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {!isHost ? (
                <p className="mt-2 text-[11px] text-zinc-500">Only host can change rounds.</p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Time per turn ⏱
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {TIMER_OPTIONS.map(({ value, label }) => {
                  const active =
                    (value === 0 && effectiveTimer === UNTIMED_TURN_TIMER_SECONDS) ||
                    (value !== 0 && effectiveTimer === value);
                  const tooltip =
                    value === 0
                      ? "No timer"
                      : `${Math.max(MIN_TURN_TIMER_SECONDS, Math.min(MAX_TURN_TIMER_SECONDS, value))}s`;
                  return (
                    <button
                      key={label}
                      type="button"
                      title={tooltip}
                      disabled={busy || !isHost}
                      onClick={() => onUpdate({ turnTimerSeconds: value })}
                      className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-semibold ${
                        active
                          ? "border-indigo-400 bg-indigo-500/20 text-indigo-100"
                          : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {!isHost ? (
                <p className="mt-2 text-[11px] text-zinc-500">Only host can change timer.</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Your battle name ⚡
            </p>
            <div className="mt-2 flex gap-2">
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value.slice(0, 32))}
                onBlur={() =>
                  nickname.trim() && nickname !== me?.nickname
                    ? onUpdate({ nickname: nickname.trim() })
                    : undefined
                }
                placeholder="Your battle name"
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={!nickname.trim() || busy}
                onClick={() => onUpdate({ nickname: nickname.trim() })}
                className="cursor-pointer rounded-lg border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-200 hover:border-indigo-500 hover:text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </section>

          <section className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 sm:flex-row sm:justify-between">
            <div className="text-sm text-zinc-300">
              <p className="font-semibold">
                {myReady
                  ? "You&apos;re locked in."
                  : "Lock in when you&apos;re ready. Your opponent will see it. 👀"}
              </p>
              <p className="text-xs text-zinc-500">
                {opponentReady
                  ? "Opponent: ready ✅"
                  : "Opponent hasn&apos;t tapped Ready yet… 👀"}
              </p>
            </div>
            <button
              type="button"
              disabled={readyDisabled || busy}
              onClick={() => onUpdate({ ready: !myReady })}
              className={`cursor-pointer rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors ${
                myReady
                  ? "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                  : "bg-indigo-600 text-white hover:bg-indigo-500"
              } disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500`}
            >
              {myReady ? "Cancel ready" : "I&apos;m Ready — Lock It In ✅"}
            </button>
          </section>
        </>
      ) : null}

      {errorMessage ? (
        <p className="rounded-lg border border-rose-400/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
