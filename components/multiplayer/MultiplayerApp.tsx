"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChatArea } from "@/components/ChatArea";
import { InputBar } from "@/components/InputBar";
import { Timer } from "@/components/Timer";
import { VerdictCard } from "@/components/VerdictCard";
import { LobbyScreen } from "@/components/multiplayer/LobbyScreen";
import { viewMultiplayerRoundsFromSide } from "@/lib/multiplayer/clientView";
import {
  authHeaders,
  clearPlayerToken,
  getNickname,
  getPlayerToken,
  setNickname as persistNickname,
  setPlayerToken,
} from "@/lib/multiplayer/clientAuth";
import { SpectatorReactions } from "@/components/multiplayer/SpectatorReactions";
import type { PublicSession, SlotId } from "@/lib/multiplayer/types";
import type { Side, ThinkingStage } from "@/lib/types";
import {
  DEFAULT_TIMED_TURN_TIMER_SECONDS,
  UNTIMED_TURN_TIMER_SECONDS,
} from "@/lib/types";

type Props = {
  sessionId: string;
};

type LiveStateProps = {
  session: PublicSession;
  mySide: Side;
  myNickname: string;
  opponentNickname: string;
  isMyTurn: boolean;
  thinkingStage: ThinkingStage;
  isAIThinking: boolean;
  thinkingLabel: string;
  inputText: string;
  setInputText: (v: string) => void;
  onSubmit: () => void;
  onConcede: () => void;
  onRequestHint: () => Promise<string | null>;
  hintCooldown: boolean;
  remainingSeconds: number;
  paused: boolean;
};

function LiveDebate(props: LiveStateProps) {
  const {
    session,
    mySide,
    myNickname,
    opponentNickname,
    isMyTurn,
    thinkingStage,
    isAIThinking,
    thinkingLabel,
    inputText,
    setInputText,
    onSubmit,
    onConcede,
    onRequestHint,
    hintCooldown,
    remainingSeconds,
    paused,
  } = props;
  const opponentSide: Side = mySide === "FOR" ? "AGAINST" : "FOR";
  const history = viewMultiplayerRoundsFromSide(session.history, mySide);
  const showTimer = session.settings.turnTimerSeconds > 0;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/85 px-4 py-2 text-xs text-zinc-400">
        <Link
          href="/"
          className="rounded-md px-2 py-1 font-semibold text-zinc-300 hover:bg-zinc-900 hover:text-white"
        >
          ← Back home
        </Link>
        <div className="flex items-center gap-3">
          <span>
            Round {session.currentRound}/{session.settings.turnRounds}
          </span>
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-300">
            {opponentNickname}
          </span>
          {showTimer ? (
            <Timer
              seconds={remainingSeconds}
              maxSeconds={session.settings.turnTimerSeconds}
              paused={paused}
            />
          ) : (
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">
              Untimed
            </span>
          )}
        </div>
      </div>
      {isMyTurn ? (
        <div className="flex items-center justify-center gap-2 border-b border-emerald-500/20 bg-emerald-950/25 px-4 py-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-sm font-semibold text-emerald-300">Your turn — write your argument</span>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 border-b border-zinc-800 bg-zinc-900/40 px-4 py-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zinc-500 opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-zinc-500" />
          </span>
          <span className="text-sm text-zinc-400">
            Waiting for <span className="font-semibold text-zinc-200">{opponentNickname}</span> to argue…
          </span>
        </div>
      )}
      <ChatArea
        topic={session.settings.topic}
        playerName={myNickname}
        opponentName={opponentNickname}
        playerSide={mySide}
        opponentSide={opponentSide}
        roundFirstSide="FOR"
        history={history}
        currentRound={session.currentRound}
        thinkingStage={thinkingStage}
        isAIThinking={isAIThinking}
        thinkingLabel={thinkingLabel}
        argumentReactions={({ round, side }) => (
          <SpectatorReactions
            sessionId={session.id}
            round={round}
            side={side}
            reactions={session.likes ?? []}
            readOnly
            align={side === mySide ? "start" : "end"}
          />
        )}
      />
      <InputBar
        value={inputText}
        onChange={setInputText}
        onSubmit={onSubmit}
        disabled={!isMyTurn}
        onSurrender={onConcede}
        onRequestAIHint={isMyTurn ? onRequestHint : undefined}
        aiHintDisabled={!isMyTurn || hintCooldown}
        aiHintBusy={hintCooldown}
      />
    </div>
  );
}

function ReadOnlyDebate({
  session,
  perspectiveSide,
  playerName,
  opponentName,
  bannerTitle,
  bannerSubtitle,
}: {
  session: PublicSession;
  perspectiveSide: Side;
  playerName: string;
  opponentName: string;
  bannerTitle: string;
  bannerSubtitle: string;
}) {
  const opponentSide: Side = perspectiveSide === "FOR" ? "AGAINST" : "FOR";
  const history = viewMultiplayerRoundsFromSide(session.history, perspectiveSide);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/85 px-4 py-2 text-xs text-zinc-400">
        <Link
          href="/"
          className="rounded-md px-2 py-1 font-semibold text-zinc-300 hover:bg-zinc-900 hover:text-white"
        >
          ← Home
        </Link>
        <div className="flex items-center gap-3">
          <span>
            Round {session.currentRound}/{session.settings.turnRounds}
          </span>
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-300">
            Read-only
          </span>
        </div>
      </div>
      <div className="border-b border-indigo-500/20 bg-indigo-950/20 px-4 py-3 text-center">
        <p className="text-sm font-semibold text-indigo-200">{bannerTitle}</p>
        <p className="mt-1 text-xs text-zinc-400">{bannerSubtitle}</p>
      </div>
      <ChatArea
        topic={session.settings.topic}
        playerName={playerName}
        opponentName={opponentName}
        playerSide={perspectiveSide}
        opponentSide={opponentSide}
        roundFirstSide="FOR"
        history={history}
        currentRound={session.currentRound}
        thinkingStage="verdict"
        isAIThinking
        thinkingLabel="Judge is preparing the final verdict…"
        argumentReactions={({ round, side }) => (
          <SpectatorReactions
            sessionId={session.id}
            round={round}
            side={side}
            reactions={session.likes ?? []}
            readOnly
            align={side === perspectiveSide ? "start" : "end"}
          />
        )}
      />
    </div>
  );
}

type SpectatorViewProps = {
  session: PublicSession;
  sessionId: string;
  forNick: string;
  againstNick: string;
  spectatorHistory: ReturnType<typeof viewMultiplayerRoundsFromSide>;
  currentTurnNick: string;
  refreshSession: () => Promise<void>;
};

function SpectatorView({
  session,
  sessionId,
  forNick,
  againstNick,
  spectatorHistory,
  currentTurnNick,
  refreshSession,
}: SpectatorViewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/85 px-4 py-2 text-xs text-zinc-400">
        <Link href="/" className="rounded-md px-2 py-1 font-semibold text-zinc-300 hover:bg-zinc-900 hover:text-white">
          ← Home
        </Link>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-fuchsia-500/40 bg-fuchsia-950/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-300">
            Spectator
          </span>
          <span>Round {session.currentRound}/{session.settings.turnRounds}</span>
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-300">
            {forNick} vs {againstNick}
          </span>
        </div>
      </div>

      {session.state === "live" ? (
        <div className="flex items-center justify-center gap-2 border-b border-zinc-800 bg-zinc-900/40 px-4 py-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-400" />
          </span>
          <span className="text-sm text-zinc-400">
            <span className="font-semibold text-zinc-200">{currentTurnNick}</span> is arguing…
          </span>
        </div>
      ) : null}

      <ChatArea
        topic={session.settings.topic}
        playerName={forNick}
        opponentName={againstNick}
        playerSide="FOR"
        opponentSide="AGAINST"
        roundFirstSide="FOR"
        history={spectatorHistory}
        currentRound={session.currentRound}
        thinkingStage={null}
        isAIThinking={false}
        thinkingLabel=""
        showYourSideBadge={false}
        argumentReactions={({ round, side }) => (
          <SpectatorReactions
            sessionId={sessionId}
            round={round}
            side={side}
            reactions={session.likes ?? []}
            onUpdate={() => {
              void refreshSession();
            }}
            align={side === "FOR" ? "start" : "end"}
          />
        )}
      />

      <div className="shrink-0 border-t border-zinc-800 bg-zinc-950/80 px-4 py-2 text-center text-[11px] text-zinc-500">
        Spectator · react under each argument · name required once
      </div>
    </div>
  );
}

export function MultiplayerApp({ sessionId }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<PublicSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inputText, setInputText] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [shareUrl, setShareUrl] = useState("");
  const [myNickname, setMyNicknameState] = useState("");
  const [hintInflight, setHintInflight] = useState(false);
  const [tokenRevision, setTokenRevision] = useState(0);
  const inflightSubmitRef = useRef(false);

  useEffect(() => {
    setMyNicknameState(getNickname());
    if (typeof window !== "undefined") {
      setShareUrl(`${window.location.origin}/play/${sessionId}`);
    }
  }, [sessionId]);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/multiplayer/sessions/${sessionId}`, {
        method: "GET",
        headers: authHeaders(sessionId),
        cache: "no-store",
      });
      if (res.status === 404) {
        setError("Session not found or expired.");
        clearPlayerToken(sessionId);
        return;
      }
      if (!res.ok) {
        setError(await res.text().catch(() => "Failed to load session."));
        return;
      }
      const data = (await res.json()) as PublicSession;
      setSession(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session.");
    }
  }, [sessionId, tokenRevision]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  // Subscribe to SSE for live updates.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof EventSource === "undefined") return;
    const token = getPlayerToken(sessionId);
    const url = token
      ? `/api/multiplayer/sessions/${sessionId}/stream?token=${encodeURIComponent(token)}`
      : `/api/multiplayer/sessions/${sessionId}/stream`;
    const es = new EventSource(url);
    es.addEventListener("snapshot", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as PublicSession;
        // A tokenless stream can still deliver one stale "guest" snapshot right
        // after a join. Ignore it once this browser owns a player token.
        if (getPlayerToken(sessionId) && data.yourSlot === null) return;
        setSession(data);
        setError(null);
      } catch {
        /* ignore malformed */
      }
    });
    es.onerror = () => {
      // SSE will retry automatically; if it permanently fails, polling kicks in.
    };
    return () => {
      es.close();
    };
  }, [sessionId, tokenRevision]);

  // Polling fallback every 5s.
  useEffect(() => {
    const id = setInterval(() => {
      void refreshSession();
    }, 5_000);
    return () => clearInterval(id);
  }, [refreshSession]);

  // Tick "now" each second so the timer counts down even between SSE events.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const join = useCallback(
    async (nickname: string) => {
      setBusy(true);
      setError(null);
      try {
        const existingToken = getPlayerToken(sessionId);
        const res = await fetch(`/api/multiplayer/sessions/${sessionId}/join`, {
          method: "POST",
          headers: authHeaders(sessionId),
          body: JSON.stringify({ nickname }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "Failed to join.");
          throw new Error(t);
        }
        const data = (await res.json()) as {
          sessionId: string;
          slot: SlotId;
          playerToken: string | null;
          session: PublicSession;
        };
        if (data.playerToken) {
          setPlayerToken(sessionId, data.playerToken);
          setTokenRevision((v) => v + 1);
        } else if (existingToken) {
          setPlayerToken(sessionId, existingToken);
          setTokenRevision((v) => v + 1);
        }
        persistNickname(nickname);
        setMyNicknameState(nickname);
        setSession(data.session);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not join lobby.");
      } finally {
        setBusy(false);
      }
    },
    [sessionId],
  );

  const updateLobby = useCallback(
    async (
      update: Parameters<
        Parameters<typeof LobbyScreen>[0]["onUpdate"]
      >[0],
    ) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/multiplayer/sessions/${sessionId}/lobby`, {
          method: "POST",
          headers: authHeaders(sessionId),
          body: JSON.stringify(update),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "Update failed.");
          throw new Error(t);
        }
        const data = (await res.json()) as { session: PublicSession };
        setSession(data.session);
        if (typeof update.nickname === "string" && update.nickname) {
          persistNickname(update.nickname);
          setMyNicknameState(update.nickname);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed.");
      } finally {
        setBusy(false);
      }
    },
    [sessionId],
  );

  const submitMove = useCallback(async () => {
    if (!session || inflightSubmitRef.current) return;
    const text = inputText.trim();
    if (!text) return;
    inflightSubmitRef.current = true;
    try {
      const res = await fetch(`/api/multiplayer/sessions/${sessionId}/move`, {
        method: "POST",
        headers: authHeaders(sessionId),
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "Move failed.");
        setError(t);
        return;
      }
      const data = (await res.json()) as { session: PublicSession };
      setSession(data.session);
      setInputText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Move failed.");
    } finally {
      inflightSubmitRef.current = false;
    }
  }, [inputText, session, sessionId]);

  const concede = useCallback(async () => {
    if (!confirm("Concede this debate? The judge will issue a verdict.")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/multiplayer/sessions/${sessionId}/concede`,
        {
          method: "POST",
          headers: authHeaders(sessionId),
        },
      );
      if (!res.ok) {
        const t = await res.text().catch(() => "Concede failed.");
        setError(t);
        return;
      }
      const data = (await res.json()) as { session: PublicSession };
      setSession(data.session);
    } finally {
      setBusy(false);
    }
  }, [sessionId]);

  const requestHint = useCallback(async (): Promise<string | null> => {
    if (hintInflight) return null;
    setHintInflight(true);
    try {
      const res = await fetch(
        `/api/multiplayer/sessions/${sessionId}/hint`,
        {
          method: "POST",
          headers: authHeaders(sessionId),
        },
      );
      if (!res.ok) {
        return null;
      }
      const data = (await res.json()) as { hint: string };
      return data.hint;
    } catch {
      return null;
    } finally {
      setHintInflight(false);
    }
  }, [hintInflight, sessionId]);

  // Derived state
  const mySlot: SlotId | null = session?.yourSlot ?? null;
  const meRecord = useMemo(
    () => (mySlot ? session?.players.find((p) => p.slot === mySlot) ?? null : null),
    [mySlot, session?.players],
  );
  const opponentRecord = useMemo(
    () =>
      session
        ? session.players.find((p) => p.slot !== (mySlot ?? "X"))
        : null,
    [mySlot, session],
  );

  const mySide: Side | null = meRecord?.side ?? null;
  const opponentName = opponentRecord?.nickname || "Opponent";
  const myName = meRecord?.nickname || myNickname || "You";

  const remainingSeconds = useMemo(() => {
    if (!session) return DEFAULT_TIMED_TURN_TIMER_SECONDS;
    if (session.settings.turnTimerSeconds <= UNTIMED_TURN_TIMER_SECONDS) {
      return DEFAULT_TIMED_TURN_TIMER_SECONDS;
    }
    if (!session.currentDeadlineAt) return session.settings.turnTimerSeconds;
    return Math.max(0, Math.round((session.currentDeadlineAt - now) / 1000));
  }, [now, session]);

  const isMyTurn = useMemo(() => {
    if (!session || session.state !== "live") return false;
    if (!mySide) return false;
    return session.currentSide === mySide;
  }, [mySide, session]);

  const aiThinking = useMemo(() => {
    if (!session) return false;
    if (session.state !== "live") return false;
    const round = session.history[session.currentRound - 1];
    if (!round) return false;
    // Show "judge factchecking" thinking banner if last move has no factcheck yet.
    const fcMissing = (round.forMove && !round.factcheckFor) ||
      (round.againstMove && !round.factcheckAgainst);
    return Boolean(fcMissing);
  }, [session]);

  const thinkingStage: ThinkingStage = useMemo(() => {
    if (!session) return null;
    const round = session.history[session.currentRound - 1];
    if (!round) return null;
    if (round.forMove && !round.factcheckFor) {
      return mySide === "FOR" ? "fc_player" : "fc_opponent";
    }
    if (round.againstMove && !round.factcheckAgainst) {
      return mySide === "AGAINST" ? "fc_player" : "fc_opponent";
    }
    return null;
  }, [mySide, session]);

  if (error && !session) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center">
        <p className="text-base font-semibold text-rose-300">{error}</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:border-indigo-500 hover:text-white"
        >
          Back to home
        </button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto p-8 text-center text-sm text-zinc-500">
        Loading lobby…
      </div>
    );
  }

  if (session.state === "lobby") {
    return (
      <LobbyScreen
        session={session}
        mySlot={mySlot}
        myNickname={mySlot ? myName : myNickname}
        onUpdate={updateLobby}
        onJoin={join}
        busy={busy}
        errorMessage={error}
        shareUrl={shareUrl}
      />
    );
  }

  if (session.state === "finished" && session.verdict && !mySide) {
    // Spectator verdict — always from FOR perspective.
    const forPlayer = session.players.find((p) => p.side === "FOR");
    const againstPlayer = session.players.find((p) => p.side === "AGAINST");
    return (
      <div className="mx-auto flex w-full flex-col items-center gap-4 p-6">
        <p className="rounded-full border border-fuchsia-500/40 bg-fuchsia-950/30 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-fuchsia-300">
          Spectator · match result
        </p>
        <VerdictCard
          verdict={session.verdict}
          playerName={forPlayer?.nickname ?? "FOR"}
          opponentName={againstPlayer?.nickname ?? "AGAINST"}
          newDebateLabel="Back home"
          onNewDebate={() => router.push("/")}
          resultUrl={`${window.location.origin}/result/${sessionId}`}
        />
      </div>
    );
  }

  if (session.state === "finished" && session.verdict) {
    return (
      <div className="mx-auto flex w-full flex-col items-center gap-4 p-6">
        <VerdictCard
          verdict={
            mySide === session.players[0].side
              ? session.verdict
              : {
                  ...session.verdict,
                  score_player: session.verdict.score_opponent,
                  score_opponent: session.verdict.score_player,
                  best_arg_player: session.verdict.best_arg_opponent,
                  best_arg_opponent: session.verdict.best_arg_player,
                  breakdown: {
                    factual: [
                      session.verdict.breakdown.factual[1],
                      session.verdict.breakdown.factual[0],
                    ],
                    logic: [
                      session.verdict.breakdown.logic[1],
                      session.verdict.breakdown.logic[0],
                    ],
                    relevance: [
                      session.verdict.breakdown.relevance[1],
                      session.verdict.breakdown.relevance[0],
                    ],
                    rhetoric: [
                      session.verdict.breakdown.rhetoric[1],
                      session.verdict.breakdown.rhetoric[0],
                    ],
                  },
                }
          }
          playerName={myName}
          opponentName={opponentName}
          newDebateLabel="Back home"
          onNewDebate={() => router.push("/")}
          resultUrl={`${window.location.origin}/result/${sessionId}`}
        />
      </div>
    );
  }

  if (session.state === "finished") {
    const forPlayer = session.players.find((p) => p.side === "FOR");
    const againstPlayer = session.players.find((p) => p.side === "AGAINST");
    const perspectiveSide = mySide ?? "FOR";
    const readOnlyPlayerName =
      perspectiveSide === "FOR"
        ? (forPlayer?.nickname ?? "FOR")
        : (againstPlayer?.nickname ?? "AGAINST");
    const readOnlyOpponentName =
      perspectiveSide === "FOR"
        ? (againstPlayer?.nickname ?? "AGAINST")
        : (forPlayer?.nickname ?? "FOR");
    return (
      <ReadOnlyDebate
        session={session}
        perspectiveSide={perspectiveSide}
        playerName={readOnlyPlayerName}
        opponentName={readOnlyOpponentName}
        bannerTitle="Debate finished. Waiting for the judge verdict…"
        bannerSubtitle="The full transcript stays visible while the AI scores the match."
      />
    );
  }

  if (!mySide) {
    // Spectator view — render from FOR side's perspective.
    const forPlayer = session.players.find((p) => p.side === "FOR");
    const againstPlayer = session.players.find((p) => p.side === "AGAINST");
    const spectatorHistory = viewMultiplayerRoundsFromSide(session.history, "FOR");
    const currentTurnNick =
      session.currentSide === "FOR"
        ? (forPlayer?.nickname ?? "FOR player")
        : (againstPlayer?.nickname ?? "AGAINST player");
    return (
      <SpectatorView
        session={session}
        sessionId={sessionId}
        forNick={forPlayer?.nickname ?? "FOR"}
        againstNick={againstPlayer?.nickname ?? "AGAINST"}
        spectatorHistory={spectatorHistory}
        currentTurnNick={currentTurnNick}
        refreshSession={refreshSession}
      />
    );
  }

  return (
    <LiveDebate
      session={session}
      mySide={mySide}
      myNickname={myName}
      opponentNickname={opponentName}
      isMyTurn={isMyTurn}
      thinkingStage={thinkingStage}
      isAIThinking={aiThinking}
      thinkingLabel="Judge is fact-checking…"
      inputText={inputText}
      setInputText={setInputText}
      onSubmit={submitMove}
      onConcede={concede}
      onRequestHint={requestHint}
      hintCooldown={
        hintInflight ||
        (meRecord?.hintsUsedThisTurn ?? 0) >= 1
      }
      remainingSeconds={remainingSeconds}
      paused={!isMyTurn}
    />
  );
}
