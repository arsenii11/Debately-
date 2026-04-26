"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ChatArea } from "./ChatArea";
import {
  DebateLaunchOverlay,
  type DebateCountdownStep,
} from "./DebateLaunchOverlay";
import { InputBar } from "./InputBar";
import { SetupScreen } from "./SetupScreen";
import { Timer } from "./Timer";
import { VerdictCard } from "./VerdictCard";
import {
  parseFactcheckJson,
  FACTCHECK_PARSE_FALLBACK,
  isFactcheckFallback,
} from "@/lib/factcheckFallback";
import { isVerdictFallback } from "@/lib/verdictParse";
import { buildSurrenderRound } from "@/lib/debateSurrender";
import {
  clearDebatelySession,
  loadDebatelySession,
  saveDebatelySession,
} from "@/lib/debatelySession";
import {
  loadDebatelyProgress,
  recordDebatelyVerdict,
  type DebatelyProgress,
} from "@/lib/localProgress";
import {
  DEFAULT_TURN_ROUNDS,
  DEFAULT_TURN_TIMER_SECONDS,
  UNTIMED_TURN_TIMER_SECONDS,
} from "@/lib/types";
import type {
  FactCheck,
  Phase,
  RoundData,
  Side,
  ThinkingStage,
  TurnRounds,
  TurnTimerSeconds,
  Verdict,
} from "@/lib/types";

const OPPONENT_FAILED_TEXT = "Debately failed to respond.";

function opponentSideFor(player: Side): Side {
  return player === "FOR" ? "AGAINST" : "FOR";
}

function detectPlayerLanguage(
  history: RoundData[],
  latestPlayerMove: string,
): "Russian" | "English" {
  const corpus = [latestPlayerMove, ...history.map((r) => r.playerMove)].join(" ");
  const cyr = (corpus.match(/[А-Яа-яЁё]/g) ?? []).length;
  const lat = (corpus.match(/[A-Za-z]/g) ?? []).length;
  return cyr >= lat ? "Russian" : "English";
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
  const [turnRounds, setTurnRounds] = useState<TurnRounds>(DEFAULT_TURN_ROUNDS);
  const [currentRound, setCurrentRound] = useState(1);
  const [inputText, setInputText] = useState("");
  const [turnTimerSeconds, setTurnTimerSeconds] =
    useState<TurnTimerSeconds>(DEFAULT_TURN_TIMER_SECONDS);
  const [timerPaused, setTimerPaused] = useState(false);
  const [timer, setTimer] = useState<number>(DEFAULT_TURN_TIMER_SECONDS);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState("");
  const [thinkingStage, setThinkingStage] = useState<ThinkingStage>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [progress, setProgress] = useState<DebatelyProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skippedTurns, setSkippedTurns] = useState(0);
  const [launchCountdown, setLaunchCountdown] =
    useState<DebateCountdownStep | null>(null);
  const [debateEntered, setDebateEntered] = useState(false);
  const [showAiInfo, setShowAiInfo] = useState(false);

  const skipScheduled = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastOpponentAnchorRef = useRef<HTMLDivElement>(null);
  const runTurnRef = useRef<
    (
      move: string,
      isTimedOut: boolean,
      options?: {
        roundNumber?: number;
        suppressSkipIncrement?: boolean;
      },
    ) => Promise<void>
  >(() => Promise.resolve());

  const opponentSide = opponentSideFor(playerSide);
  const isTimedDebate = turnTimerSeconds > UNTIMED_TURN_TIMER_SECONDS;
  const playerDisplay = nickname.trim() || "Player";
  const playerInitial =
    playerDisplay.trim().charAt(0).toUpperCase() || "?";

  const scrollLastOpponentIntoViewMobile = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 640px)").matches) return;
    const el = lastOpponentAnchorRef.current;
    if (!el) return;
    // `block: "end"` keeps the AI bubble pinned just above the input bar
    // (which itself docks to the top of the on-screen keyboard via the
    // viewport meta `interactive-widget=resizes-content`).
    const go = () => el.scrollIntoView({ block: "end", behavior: "smooth" });
    go();
    requestAnimationFrame(go);
    window.setTimeout(go, 120);
    window.setTimeout(go, 380);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    let lastH = vv.height;
    const onResize = () => {
      if (!window.matchMedia("(max-width: 640px)").matches) {
        lastH = vv.height;
        return;
      }
      // Keyboard opened (viewport shrunk) OR closed (viewport grew): in both
      // cases re-pin the last opponent bubble so it stays visible.
      if (Math.abs(lastH - vv.height) > 72) {
        scrollLastOpponentIntoViewMobile();
      }
      lastH = vv.height;
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, [scrollLastOpponentIntoViewMobile]);

  useLayoutEffect(() => {
    const s = loadDebatelySession();
    if (s) {
      setPhase(s.phase);
      setNickname(s.nickname);
      setTopic(s.topic);
      setPlayerSide(s.playerSide);
      setHistory(s.history);
      setTurnRounds(s.turnRounds);
      setCurrentRound(
        Math.min(s.turnRounds, Math.max(1, Math.floor(s.currentRound))),
      );
      setInputText(s.inputText);
      setTurnTimerSeconds(s.turnTimerSeconds);
      setTimerPaused(s.timerPaused);
      setTimer(
        s.turnTimerSeconds === UNTIMED_TURN_TIMER_SECONDS
          ? 0
          : Math.max(
              0,
              Math.min(s.turnTimerSeconds, Math.floor(s.timer)),
            ),
      );
      setVerdict(s.verdict);
      setError(s.error);
      setSkippedTurns(Math.max(0, s.skippedTurns));
      if (s.phase === "debating" || s.phase === "finished") {
        setDebateEntered(true);
      }
    }
    setIsAIThinking(false);
    setThinkingStage(null);
    setThinkingLabel("");
    setProgress(loadDebatelyProgress());
    skipScheduled.current = false;
    setSessionReady(true);
  }, []);

  useEffect(() => {
    if (phase === "setup") {
      setDebateEntered(false);
      return;
    }
    if (phase !== "debating") return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setDebateEntered(true));
    });
    return () => cancelAnimationFrame(id);
  }, [phase]);

  useEffect(() => {
    if (launchCountdown === null) return;
    if (launchCountdown === "go") {
      const t = window.setTimeout(() => {
        setTimer(turnTimerSeconds);
        setLaunchCountdown(null);
      }, 450);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      setLaunchCountdown((p: DebateCountdownStep | null) => {
        if (p === 3) return 2;
        if (p === 2) return 1;
        if (p === 1) return "go";
        return p;
      });
    }, 850);
    return () => window.clearTimeout(t);
  }, [launchCountdown, turnTimerSeconds]);

  useEffect(() => {
    if (!sessionReady) return;
    saveDebatelySession({
      v: 1,
      savedAt: Date.now(),
      phase,
      nickname,
      topic,
      playerSide,
      history,
      turnRounds,
      currentRound,
      inputText,
      timer,
      turnTimerSeconds,
      timerPaused,
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
    turnRounds,
    currentRound,
    inputText,
    timer,
    turnTimerSeconds,
    timerPaused,
    verdict,
    error,
    skippedTurns,
  ]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history, isAIThinking, thinkingStage, phase, verdict]);

  useEffect(() => {
    if (
      phase !== "debating" ||
      !isTimedDebate ||
      isAIThinking ||
      launchCountdown !== null ||
      timerPaused
    )
      return undefined;

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
  }, [phase, isTimedDebate, isAIThinking, currentRound, launchCountdown, timerPaused]);

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
    async (
      rawMove: string,
      isTimedOut: boolean,
      options?: {
        roundNumber?: number;
        suppressSkipIncrement?: boolean;
      },
    ) => {
      if (phase !== "debating") return;

      const move = rawMove.trim();
      if (!isTimedOut && !move) return;
      if (isAIThinking) return;

      const displayMove = isTimedOut
        ? "[Turn skipped — time expired]"
        : move;
      const roundNumber = options?.roundNumber ?? currentRound;
      const debateLanguage = detectPlayerLanguage(history, displayMove);

      setError(null);
      setTimer(0);
      const shouldAddSkip = isTimedOut && !options?.suppressSkipIncrement;
      const nextSkipCount = skippedTurns + (shouldAddSkip ? 1 : 0);
      if (shouldAddSkip) setSkippedTurns(nextSkipCount);

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
            outputLanguage: debateLanguage,
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
        setThinkingLabel("Debately is thinking…");
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
            totalRounds: turnRounds,
            turnTimerSeconds,
          });
          opponentText =
            oppRes.text?.trim() || "Debately failed to respond.";
        } catch (e) {
          console.error("[Debately] opponent API request failed", e);
          opponentText = "Debately failed to respond.";
        }
        updateRound(roundNumber, { opponentMove: opponentText });

        const requestOpponentFactcheck = async (
          showThinking: boolean,
        ): Promise<FactCheck> => {
          if (showThinking) {
            setThinkingStage("fc_opponent");
            setThinkingLabel("Judge is factchecking Debately…");
          }
          try {
            const res = await postJson<string | FactCheck>("/api/ai/factcheck", {
              topic,
              playerSide,
              opponentSide,
              moveText: opponentText,
              speaker: "opponent",
              previousMoveText: displayMove,
              round: roundNumber,
              outputLanguage: debateLanguage,
            });
            const fcOpp =
              typeof res === "string"
                ? parseFactcheckJson(res)
                : (res as FactCheck);
            if (isFactcheckFallback(fcOpp)) {
              console.error(
                "[Debately] Judge factcheck (opponent) is parse fallback — see server logs [debately:factcheck]",
              );
            }
            return fcOpp;
          } catch (e) {
            console.error("[Debately] factcheck (opponent) request failed", e);
            return FACTCHECK_PARSE_FALLBACK;
          }
        };

        if (roundNumber >= turnRounds) {
          const fcOpp = await requestOpponentFactcheck(true);
          updateRound(roundNumber, { aiFactcheckOpponent: fcOpp });
          const completedRound: RoundData = {
            round: roundNumber,
            playerMove: displayMove,
            aiFactcheckPlayer: fcPlayer,
            opponentMove: opponentText,
            aiFactcheckOpponent: fcOpp,
          };
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
            if (!isVerdictFallback(vRes)) {
              setProgress(recordDebatelyVerdict(vRes));
            }
          } catch (e) {
            console.error("[Debately] verdict API request failed", e);
            setVerdict(null);
            setError("Could not load verdict.");
          }
          setPhase("finished");
        } else {
          void (async () => {
            const fcOpp = await requestOpponentFactcheck(false);
            updateRound(roundNumber, { aiFactcheckOpponent: fcOpp });
          })();
          setCurrentRound(Math.min(turnRounds, roundNumber + 1));
          setTimer(turnTimerSeconds);
          setTimerPaused(false);
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
      turnTimerSeconds,
      turnRounds,
    ],
  );

  useEffect(() => {
    runTurnRef.current = runTurn;
  }, [runTurn]);

  const handleSubmit = useCallback(() => {
    void runTurn(inputText, false);
  }, [inputText, runTurn]);

  const lastRound = history[history.length - 1] ?? null;
  const lastRoundRetryable = Boolean(
    lastRound &&
      (lastRound.opponentMove?.trim() === OPPONENT_FAILED_TEXT ||
        (lastRound.aiFactcheckPlayer &&
          isFactcheckFallback(lastRound.aiFactcheckPlayer)) ||
        (lastRound.aiFactcheckOpponent &&
          isFactcheckFallback(lastRound.aiFactcheckOpponent))),
  );
  const verdictRetryable =
    phase === "finished" && verdict ? isVerdictFallback(verdict) : false;
  const canRetryAi =
    !isAIThinking &&
    launchCountdown === null &&
    (phase === "debating" || phase === "finished") &&
    history.length > 0;

  const handleRetryAi = useCallback(() => {
    if (!canRetryAi || !lastRound?.playerMove?.trim()) return;
    const roundToRetry = lastRound.round;
    const moveToRetry = lastRound.playerMove.trim();

    setError(null);
    setVerdict(null);
    if (phase === "finished") {
      setPhase("debating");
    }
    setCurrentRound(roundToRetry);
    void runTurn(moveToRetry, false, {
      roundNumber: roundToRetry,
      suppressSkipIncrement: true,
    });
  }, [canRetryAi, lastRound, phase, runTurn]);

  const runConcede = useCallback(() => {
    setError(null);
    setTimer(0);
    setTimerPaused(false);
    setIsAIThinking(true);
    setThinkingStage("verdict");
    setThinkingLabel("Judge is deliberating final verdict…");

    const surrenderRound = buildSurrenderRound(currentRound);
    const histForVerdict = [
      ...history.slice(0, currentRound - 1),
      surrenderRound,
    ];
    setHistory(histForVerdict);

    void (async () => {
      try {
        const vRes = await postJson<Verdict>("/api/ai/verdict", {
          topic,
          playerSide,
          opponentSide,
          history: histForVerdict,
          skippedTurns,
          playerConceded: true,
        });
        setVerdict(vRes);
        if (!isVerdictFallback(vRes)) {
          setProgress(recordDebatelyVerdict(vRes));
        }
      } catch (e) {
        console.error("[Debately] verdict (surrender) failed", e);
        setVerdict(null);
        setError("Could not load verdict.");
      } finally {
        setPhase("finished");
        setIsAIThinking(false);
        setThinkingStage(null);
        setThinkingLabel("");
      }
    })();
  }, [
    currentRound,
    history,
    topic,
    playerSide,
    opponentSide,
    skippedTurns,
  ]);

  const handleSurrender = useCallback(() => {
    if (phase !== "debating" || isAIThinking || launchCountdown !== null) return;
    if (
      !window.confirm(
        "Concede this debate? The judge will issue a final verdict and Debately wins by surrender.",
      )
    )
      return;
    runConcede();
  }, [phase, isAIThinking, launchCountdown, runConcede]);

  const handleStart = useCallback(() => {
    setPhase("debating");
    setHistory([]);
    setCurrentRound(1);
    setTimer(0);
    setTimerPaused(false);
    setInputText("");
    setVerdict(null);
    setError(null);
    setSkippedTurns(0);
    setIsAIThinking(false);
    setThinkingStage(null);
    skipScheduled.current = false;
    setLaunchCountdown(isTimedDebate ? 3 : null);
    if (!isTimedDebate) {
      setTimer(UNTIMED_TURN_TIMER_SECONDS);
    }
  }, [isTimedDebate]);

  const handleNew = useCallback(() => {
    const opponentHasReplied =
      phase === "debating" &&
      history.some((r) => r.opponentMove && r.opponentMove.trim().length > 0);

    if (opponentHasReplied && !isAIThinking && launchCountdown === null) {
      if (
        !window.confirm(
          "Start a new debate? The current one will end now — Debately wins by surrender.",
        )
      ) {
        return;
      }
      runConcede();
      return;
    }

    if (phase === "debating" && history.length > 0) {
      if (
        !window.confirm(
          "Start a new debate? Your current progress will be lost.",
        )
      ) {
        return;
      }
    }

    clearDebatelySession();
    setPhase("setup");
    setHistory([]);
    setCurrentRound(1);
    setTimer(turnTimerSeconds);
    setTimerPaused(false);
    setInputText("");
    setVerdict(null);
    setError(null);
    setSkippedTurns(0);
    setIsAIThinking(false);
    setThinkingStage(null);
    skipScheduled.current = false;
    setLaunchCountdown(null);
  }, [
    phase,
    history,
    isAIThinking,
    launchCountdown,
    runConcede,
    turnTimerSeconds,
  ]);

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
      <div className="flex min-h-dvh w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden bg-zinc-950 text-zinc-100">
        <SetupScreen
          nickname={nickname}
          topic={topic}
          side={playerSide}
          turnRounds={turnRounds}
          turnTimerSeconds={turnTimerSeconds}
          onNickname={setNickname}
          onTopic={setTopic}
          onSide={setPlayerSide}
          onTurnRounds={setTurnRounds}
          onTurnTimerSeconds={setTurnTimerSeconds}
          progress={progress}
          onStart={handleStart}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-0 min-h-dvh w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden bg-zinc-950 text-zinc-100 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        debateEntered
          ? "translate-y-0 opacity-100"
          : "translate-y-6 opacity-0"
      }`}
    >
      {launchCountdown !== null ? (
        <DebateLaunchOverlay step={launchCountdown} />
      ) : null}
      <header className="sticky top-0 z-40 w-full min-w-0 max-w-full shrink-0 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/75">
        <div className="flex min-w-0 flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
          <div className="flex min-w-0 items-center justify-between gap-2 sm:contents">
            <button
              type="button"
              onClick={handleNew}
              className="flex shrink-0 cursor-pointer items-center gap-2 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-zinc-900/80 active:scale-[0.98] sm:order-1"
              aria-label="Go to new debate setup"
            >
              <span className="text-lg font-semibold tracking-tight">
                Debately
              </span>
              <span className="rounded-md bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-300">
                Solo
              </span>
            </button>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:order-3 sm:gap-3">
              {phase === "debating" && (
                <span className="text-sm text-zinc-400">
                  Round{" "}
                  <span className="font-mono text-zinc-200">
                    {currentRound}/{turnRounds}
                  </span>
                </span>
              )}
              {phase === "debating" && !isTimedDebate ? (
                <span className="text-xs font-medium uppercase tracking-wide text-indigo-300">
                  Untimed
                </span>
              ) : phase === "debating" &&
              launchCountdown === null &&
              !isAIThinking &&
              timer > 0 ? (
                <div className="flex flex-wrap items-end gap-2 sm:gap-3">
                  <Timer
                    seconds={timer}
                    maxSeconds={turnTimerSeconds}
                    paused={timerPaused}
                  />
                  <button
                    type="button"
                    onClick={() => setTimerPaused((p) => !p)}
                    className="cursor-pointer rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-100 active:scale-[0.98]"
                  >
                    {timerPaused ? "Resume" : "Pause"}
                  </button>
                </div>
              ) : phase === "debating" &&
                isTimedDebate &&
                launchCountdown === null &&
                !isAIThinking &&
                timer === 0 ? (
                <span className="text-xs text-red-400">Time&apos;s up</span>
              ) : phase === "debating" && launchCountdown !== null ? (
                <span className="text-xs font-medium uppercase tracking-wide text-fuchsia-400/90">
                  Starting…
                </span>
              ) : null}
              <button
                type="button"
                onClick={handleNew}
                className="cursor-pointer rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-fuchsia-900/40 transition-all hover:from-fuchsia-500 hover:to-pink-500 hover:shadow-fuchsia-500/25 active:scale-[0.98]"
              >
                New
              </button>
              {canRetryAi ? (
                <button
                  type="button"
                  onClick={handleRetryAi}
                  className="cursor-pointer rounded-xl border border-indigo-500/55 bg-indigo-950/35 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-indigo-200 transition-colors hover:border-indigo-400 hover:bg-indigo-950/55 hover:text-indigo-100 active:scale-[0.98]"
                >
                  Retry AI
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex min-w-0 items-center justify-center gap-3 border-t border-zinc-800/70 pt-2 sm:order-2 sm:flex-1 sm:border-t-0 sm:pt-0 sm:px-2">
            <div className="flex min-w-0 max-w-[46%] items-center gap-2 sm:max-w-none">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                  playerSide === "FOR" ? "bg-emerald-600" : "bg-rose-600"
                }`}
              >
                {playerInitial}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-zinc-200 sm:text-sm">
                  {playerDisplay}
                </p>
                <span
                  className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    playerSide === "FOR"
                      ? "bg-emerald-500/25 text-emerald-300"
                      : "bg-rose-500/25 text-rose-300"
                  }`}
                >
                  {playerSide}
                </span>
              </div>
            </div>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              vs
            </span>
            <div className="relative flex min-w-0 max-w-[46%] items-center gap-2 sm:max-w-none">
              <button
                type="button"
                onClick={() => setShowAiInfo((v) => !v)}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-600 to-pink-600 text-[10px] font-bold text-white shadow-md shadow-fuchsia-950/30 transition-transform hover:scale-105 active:scale-95"
                aria-expanded={showAiInfo}
                aria-label="About Debately AI opponent"
              >
                AI
              </button>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-zinc-200 sm:text-sm">
                  Debately
                </p>
                <span
                  className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    opponentSide === "FOR"
                      ? "bg-emerald-500/25 text-emerald-300"
                      : "bg-rose-500/25 text-rose-300"
                  }`}
                >
                  {opponentSide}
                </span>
              </div>
              {showAiInfo ? (
                <div className="absolute right-0 top-full z-50 mt-3 w-72 rounded-xl border border-zinc-700 bg-zinc-950 p-4 text-left shadow-xl shadow-black/30 sm:right-auto sm:left-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    AI opponent
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-200">
                    Debately argues the opposite side. It is tuned to push back,
                    not to act like a neutral assistant.
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                    Expect short rebuttals, pressure on weak assumptions, and a
                    more online debate style while staying within basic boundaries.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <div className="shrink-0 border-b border-red-900/50 bg-red-950/40 px-4 py-2 text-center text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
          lastOpponentAnchorRef={lastOpponentAnchorRef}
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
          disabled={isAIThinking || launchCountdown !== null}
          onFocus={scrollLastOpponentIntoViewMobile}
          onSurrender={handleSurrender}
        />
      ) : null}
    </div>
  );
}
