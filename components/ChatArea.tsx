"use client";

import type { RefObject } from "react";
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
      <div className="border-b border-zinc-800 bg-zinc-900/40 px-4 py-3 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Topic
        </p>
        <p className="mt-1 text-sm font-medium leading-snug text-zinc-200">
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
                  <span className="relative inline-block rounded-full border border-zinc-700 bg-zinc-950 px-4 py-1 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                    Round {round.round}
                  </span>
                </div>

                {round.playerMove ? (
                  <PlayerBubble
                    name={playerName}
                    side={playerSide}
                    text={round.playerMove}
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
            <p className="py-12 text-center text-sm text-zinc-500">
              Round {currentRound} — type your opening argument below.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
