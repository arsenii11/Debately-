"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ChatArea } from "./ChatArea";
import { InputBar } from "./InputBar";
import { SetupScreen } from "./SetupScreen";
import { Timer } from "./Timer";
import { VerdictCard } from "./VerdictCard";
import {
  parseFactcheckJson,
  FACTCHECK_PARSE_FALLBACK,
  isFactcheckFallback,
} from "@/lib/factcheckFallback";
import {
  clearDebatelySession,
  loadDebatelySession,
  saveDebatelySession,
} from "@/lib/debatelySession";
import type {
  FactCheck,
  Phase,
  RoundData,
  Side,
  ThinkingStage,
  Verdict,
} from "@/lib/types";

const TOTAL_ROUNDS = 3;
const TIMER_MAX = 120;

function opponentSideFor(player: Side): Side {
  return player === "FOR" ? "AGAINST" : "FOR";
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  return res.json() as Promise<T>;
}

export function DebatelyApp() {
  const [sessionReady, setSessionReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("setup");
  const [nickname, setNickname] = useState("");
  const [topic, setTopic] = useState("");
  const [playerSide, setPlayerSide] = useState<Side>("FOR");
  const [history, setHistory] = useState<RoundData[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [inputText, setInputText] = useState("");
  const [timer, setTimer] = useState(TIMER_MAX);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState("");
  const [thinkingStage, setThinkingStage] = useState<ThinkingStage>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skippedTurns, setSkippedTurns] = useState(0);

  const skipScheduled = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const runTurnRef = useRef<
    (move: string, isTimedOut: boolean) => Promise<void>
  >(() => Promise.resolve());

  const opponentSide = opponentSideFor(playerSide);

  useLayoutEffect(() => {
    const s = loadDebatelySession();
    if (s) {
      setPhase(s.phase);
      setNickname(s.nickname);
      setTopic(s.topic);
      setPlayerSide(s.playerSide);
      setHistory(s.history);
      setCurrentRound(
        Math.min(TOTAL_ROUNDS, Math.max(1, Math.floor(s.currentRound))),
      );
      setInputText(s.inputText);
      setTimer(Math.max(0, Math.min(TIMER_MAX, Math.floor(s.timer))));
      setVerdict(s.verdict);
      setError(s.error);
      setSkippedTurns(Math.max(0, s.skippedTurns));
    }
    setIsAIThinking(false);
    setThinkingStage(null);
    setThinkingLabel("");
    skipScheduled.current = false;
    setSessionReady(true);
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    saveDebatelySession({
      v: 1,
      phase,
      nickname,
      topic,
      playerSide,
      history,
      currentRound,
      inputText,
      timer,
      verdict,
      error,
      skippedTurns,
    });
  }, [
    sessionReady,
    phase,
    nickname,
    topic,
    playerSide,
    history,
    currentRound,
    inputText,
    timer,
    verdict,
    error,
    skippedTurns,
  ]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history, isAIThinking, thinkingStage, phase, verdict]);

  useEffect(() => {
    if (phase !== "debating" || isAIThinking) return undefined;

    const id = window.setInterval(() => {
      setTimer((t) => {
        if (t <= 0) return 0;
        const next = t - 1;
        if (next === 0 && !skipScheduled.current) {
          skipScheduled.current = true;
          window.setTimeout(() => {
            void runTurnRef.current(
              "[Turn skipped — time expired]",
              true,
            ).finally(() => {
              skipScheduled.current = false;
            });
          }, 0);
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [phase, isAIThinking, currentRound]);

  const updateRound = useCallback(
    (roundNumber: number, patch: Partial<RoundData>) => {
      setHistory((prev) => {
        const next = [...prev];
        const idx = roundNumber - 1;
        if (!next[idx]) {
          next[idx] = {
            round: roundNumber,
            playerMove: "",
            aiFactcheckPlayer: null,
            opponentMove: null,
            aiFactcheckOpponent: null,
          };
        }
        next[idx] = { ...next[idx], ...patch };
        return next;
      });
    },
    [],
  );

  const runTurn = useCallback(
    async (rawMove: string, isTimedOut: boolean) => {
      if (phase !== "debating") return;

      const move = rawMove.trim();
      if (!isTimedOut && !move) return;
      if (isAIThinking) return;

      const displayMove = isTimedOut
        ? "[Turn skipped — time expired]"
        : move;
      const roundNumber = currentRound;

      setError(null);
      setTimer(0);
      const nextSkipCount = skippedTurns + (isTimedOut ? 1 : 0);
      if (isTimedOut) setSkippedTurns(nextSkipCount);

      updateRound(roundNumber, { playerMove: displayMove });
      setInputText("");
      setIsAIThinking(true);

      try {
        setThinkingStage("fc_player");
        setThinkingLabel("Judge is factchecking your argument…");
        let fcPlayer: FactCheck;
        try {
          const prevOpp =
            roundNumber <= 1
              ? "No previous argument"
              : (history[roundNumber - 2]?.opponentMove?.trim()
                  ? history[roundNumber - 2]!.opponentMove!
                  : "No previous argument");

          const res = await postJson<string | FactCheck>("/api/ai/factcheck", {
            topic,
            playerSide,
            opponentSide,
            moveText: displayMove,
            speaker: "player",
            previousMoveText: prevOpp,
            round: roundNumber,
          });
          fcPlayer =
            typeof res === "string"
              ? parseFactcheckJson(res)
              : (res as FactCheck);
          if (isFactcheckFallback(fcPlayer)) {
            console.error(
              "[Debately] Judge factcheck (player) is parse fallback — see server logs [debately:factcheck]",
            );
          }
        } catch (e) {
          console.error("[Debately] factcheck (player) request failed", e);
          fcPlayer = FACTCHECK_PARSE_FALLBACK;
        }
        updateRound(roundNumber, { aiFactcheckPlayer: fcPlayer });

        setThinkingStage("opponent");
        setThinkingLabel("Opponent is thinking…");
        let opponentText: string;
        try {
          const prior = history.slice(0, roundNumber - 1);
          const histForOpp: RoundData[] = [
            ...prior,
            {
              round: roundNumber,
              playerMove: displayMove,
              aiFactcheckPlayer: fcPlayer,
              opponentMove: null,
              aiFactcheckOpponent: null,
            },
          ];

          const oppRes = await postJson<{ text: string }>("/api/ai/opponent", {
            topic,
            playerSide,
            opponentSide,
            history: histForOpp,
            currentRound: roundNumber,
            totalRounds: TOTAL_ROUNDS,
          });
          opponentText =
            oppRes.text?.trim() || "AI opponent failed to respond.";
        } catch (e) {
          console.error("[Debately] opponent API request failed", e);
          opponentText = "AI opponent failed to respond.";
        }
        updateRound(roundNumber, { opponentMove: opponentText });

        setThinkingStage("fc_opponent");
        setThinkingLabel("Judge is factchecking opponent…");
        let fcOpp: FactCheck;
        try {
          const res = await postJson<string | FactCheck>("/api/ai/factcheck", {
            topic,
            playerSide,
            opponentSide,
            moveText: opponentText,
            speaker: "opponent",
            previousMoveText: displayMove,
            round: roundNumber,
          });
          fcOpp =
            typeof res === "string"
              ? parseFactcheckJson(res)
              : (res as FactCheck);
          if (isFactcheckFallback(fcOpp)) {
            console.error(
              "[Debately] Judge factcheck (opponent) is parse fallback — see server logs [debately:factcheck]",
            );
          }
        } catch (e) {
          console.error("[Debately] factcheck (opponent) request failed", e);
          fcOpp = FACTCHECK_PARSE_FALLBACK;
        }
        updateRound(roundNumber, { aiFactcheckOpponent: fcOpp });

        const completedRound: RoundData = {
          round: roundNumber,
          playerMove: displayMove,
          aiFactcheckPlayer: fcPlayer,
          opponentMove: opponentText,
          aiFactcheckOpponent: fcOpp,
        };

        if (roundNumber >= TOTAL_ROUNDS) {
          setThinkingStage("verdict");
          setThinkingLabel("Judge is deliberating final verdict…");
          const histForVerdict: RoundData[] = [
            ...history.slice(0, roundNumber - 1),
            completedRound,
          ];
          try {
            const vRes = await postJson<Verdict>("/api/ai/verdict", {
              topic,
              playerSide,
              opponentSide,
              history: histForVerdict,
              skippedTurns: nextSkipCount,
            });
            setVerdict(vRes);
          } catch (e) {
            console.error("[Debately] verdict API request failed", e);
            setVerdict(null);
            setError("Could not load verdict.");
          }
          setPhase("finished");
        } else {
          setCurrentRound((r) => r + 1);
          setTimer(TIMER_MAX);
        }
      } finally {
        setIsAIThinking(false);
        setThinkingStage(null);
        setThinkingLabel("");
      }
    },
    [
      phase,
      isAIThinking,
      currentRound,
      skippedTurns,
      topic,
      playerSide,
      opponentSide,
      history,
      updateRound,
    ],
  );

  useEffect(() => {
    runTurnRef.current = runTurn;
  }, [runTurn]);

  const handleSubmit = useCallback(() => {
    void runTurn(inputText, false);
  }, [inputText, runTurn]);

  const handleStart = useCallback(() => {
    setPhase("debating");
    setHistory([]);
    setCurrentRound(1);
    setTimer(TIMER_MAX);
    setInputText("");
    setVerdict(null);
    setError(null);
    setSkippedTurns(0);
    setIsAIThinking(false);
    setThinkingStage(null);
    skipScheduled.current = false;
  }, []);

  const handleNew = useCallback(() => {
    clearDebatelySession();
    setPhase("setup");
    setHistory([]);
    setCurrentRound(1);
    setTimer(TIMER_MAX);
    setInputText("");
    setVerdict(null);
    setError(null);
    setSkippedTurns(0);
    setIsAIThinking(false);
    setThinkingStage(null);
    skipScheduled.current = false;
  }, []);

  if (!sessionReady) {
    return (
      <div
        className="min-h-dvh flex-1 bg-zinc-950"
        aria-busy="true"
        aria-label="Loading"
      />
    );
  }

  if (phase === "setup") {
    return (
      <div className="flex min-h-dvh flex-1 flex-col bg-zinc-950 text-zinc-100">
        <SetupScreen
          nickname={nickname}
          topic={topic}
          side={playerSide}
          onNickname={setNickname}
          onTopic={setTopic}
          onSide={setPlayerSide}
          onStart={handleStart}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-h-dvh flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-40 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/90 px-3 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/75 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight">Debately</span>
          <span className="rounded-md bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-300">
            Solo
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {phase === "debating" && (
            <span className="text-sm text-zinc-400">
              Round{" "}
              <span className="font-mono text-zinc-200">
                {currentRound}/{TOTAL_ROUNDS}
              </span>
            </span>
          )}
          {phase === "debating" && !isAIThinking && timer > 0 ? (
            <Timer seconds={timer} maxSeconds={TIMER_MAX} />
          ) : phase === "debating" && !isAIThinking && timer === 0 ? (
            <span className="text-xs text-red-400">Time&apos;s up</span>
          ) : null}
          <button
            type="button"
            onClick={handleNew}
            className="cursor-pointer rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-700/50 hover:text-zinc-100 active:bg-zinc-800"
          >
            New
          </button>
        </div>
      </header>

      {error ? (
        <div className="shrink-0 border-b border-red-900/50 bg-red-950/40 px-4 py-2 text-center text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        <ChatArea
          topic={topic}
          playerName={nickname.trim() || "Player"}
          playerSide={playerSide}
          opponentSide={opponentSide}
          history={history}
          currentRound={currentRound}
          thinkingStage={thinkingStage}
          isAIThinking={isAIThinking}
          thinkingLabel={thinkingLabel}
        />

        <div ref={bottomRef} className="h-px w-full shrink-0" aria-hidden />

        {phase === "finished" && verdict ? (
          <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 px-3 py-8 sm:px-6">
            <VerdictCard
              verdict={verdict}
              playerName={nickname.trim() || "Player"}
              onNewDebate={handleNew}
            />
          </div>
        ) : phase === "finished" && !verdict ? (
          <div className="shrink-0 border-t border-zinc-800 px-4 py-8 text-center">
            <p className="text-sm text-zinc-400">No verdict data.</p>
            <button
              type="button"
              onClick={handleNew}
              className="mt-4 cursor-pointer rounded-xl border border-zinc-600 px-5 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800/70 hover:text-white active:bg-zinc-800"
            >
              New Debate
            </button>
          </div>
        ) : null}
      </div>

      {phase === "debating" && !isAIThinking ? (
        <InputBar
          value={inputText}
          onChange={setInputText}
          onSubmit={handleSubmit}
          disabled={isAIThinking}
        />
      ) : null}
    </div>
  );
}
