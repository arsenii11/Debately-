"use client";

import type { RefObject } from "react";
import { SURRENDER_PLAYER_MOVE } from "@/lib/debateSurrender";
import type { RoundData, Side, ThinkingStage } from "@/lib/types";
import { AIBubble } from "./AIBubble";
import { FactCheckCard } from "./FactCheckCard";
import { PlayerBubble } from "./PlayerBubble";
import { ThinkingBanner } from "./ThinkingBanner";

function lastOpponentAnchorIndex(
  history: RoundData[],
  isAIThinking: boolean,
  thinkingStage: ThinkingStage,
): number {
  for (let i = history.length - 1; i >= 0; i--) {
    const r = history[i];
    const isLast = i === history.length - 1;
    const oppThinking =
      isLast &&
      isAIThinking &&
      thinkingStage === "opponent" &&
      !r.opponentMove;
    if (r.opponentMove || oppThinking) return i;
  }
  return -1;
}

type Props = {
  topic: string;
  playerName: string;
  playerSide: Side;
  opponentSide: Side;
  history: RoundData[];
  currentRound: number;
  thinkingStage: ThinkingStage;
  isAIThinking: boolean;
  thinkingLabel: string;
  lastOpponentAnchorRef?: RefObject<HTMLDivElement | null>;
};

export function ChatArea({
  topic,
  playerName,
  playerSide,
  opponentSide,
  history,
  currentRound,
  thinkingStage,
  isAIThinking,
  thinkingLabel,
  lastOpponentAnchorRef,
}: Props) {
  const anchorIdx = lastOpponentAnchorRef
    ? lastOpponentAnchorIndex(history, isAIThinking, thinkingStage)
    : -1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-zinc-800 bg-zinc-900/40 px-4 py-4 text-center sm:py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Topic
        </p>
        <p className="mx-auto mt-1.5 max-w-3xl text-lg font-semibold leading-snug text-zinc-100 sm:text-xl">
          {topic}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-6 max-sm:[scroll-padding-bottom:min(42vh,320px)] sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {history.map((round, idx) => {
            const isLast = idx === history.length - 1;
            const showFcPlayerThinking =
              isLast &&
              isAIThinking &&
              thinkingStage === "fc_player" &&
              !round.aiFactcheckPlayer;
            const showOppThinking =
              isLast &&
              isAIThinking &&
              thinkingStage === "opponent" &&
              !round.opponentMove;
            const showFcOppThinking =
              isLast &&
              isAIThinking &&
              thinkingStage === "fc_opponent" &&
              !round.aiFactcheckOpponent;

            return (
              <section key={`${round.round}-${idx}`} className="flex flex-col gap-4">
                <div className="relative py-2 text-center">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-zinc-800" />
                  <span className="relative inline-block rounded-full border border-zinc-700 bg-zinc-950 px-5 py-1.5 text-sm font-bold uppercase tracking-[0.16em] text-zinc-300">
                    Round {round.round}
                  </span>
                </div>

                {round.playerMove ? (
                  <PlayerBubble
                    name={playerName}
                    side={playerSide}
                    text={
                      round.playerMove.trim() === SURRENDER_PLAYER_MOVE
                        ? "I concede this debate."
                        : round.playerMove
                    }
                  />
                ) : null}

                {showFcPlayerThinking ? (
                  <ThinkingBanner label={thinkingLabel} />
                ) : null}
                {round.aiFactcheckPlayer ? (
                  <FactCheckCard variant="player" data={round.aiFactcheckPlayer} />
                ) : null}

                {round.opponentMove ? (
                  <div
                    ref={
                      lastOpponentAnchorRef && idx === anchorIdx
                        ? lastOpponentAnchorRef
                        : undefined
                    }
                    className="flex justify-end max-sm:scroll-mt-4"
                  >
                    <AIBubble opponentSide={opponentSide} text={round.opponentMove} />
                  </div>
                ) : showOppThinking ? (
                  <div
                    ref={
                      lastOpponentAnchorRef && idx === anchorIdx
                        ? lastOpponentAnchorRef
                        : undefined
                    }
                    className="flex justify-end max-sm:scroll-mt-4"
                  >
                    <AIBubble
                      opponentSide={opponentSide}
                      text={null}
                      thinking
                      label={thinkingLabel}
                    />
                  </div>
                ) : null}

                {showFcOppThinking ? (
                  <ThinkingBanner label={thinkingLabel} />
                ) : null}
                {round.aiFactcheckOpponent ? (
                  <FactCheckCard
                    variant="opponent"
                    data={round.aiFactcheckOpponent}
                  />
                ) : null}
              </section>
            );
          })}

          {isAIThinking && thinkingStage === "verdict" ? (
            <ThinkingBanner
              label="Determining final results..."
              subtitle="Comparing arguments, checking evidence, and deciding who did best."
              showProgress
            />
          ) : null}

          {history.length === 0 && (
            <p className="py-12 text-center text-base text-zinc-400 sm:text-lg">
              Round {currentRound} — type your opening argument below.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
