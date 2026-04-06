export const TURN_TIMER_SECONDS = [180, 300] as const;
export type TurnTimerSeconds = (typeof TURN_TIMER_SECONDS)[number];

export type Phase = "setup" | "debating" | "finished";

export type Side = "FOR" | "AGAINST";

export type FactStatus = "verified" | "disputed" | "false";

export type FactCheck = {
  facts: Array<{
    claim: string;
    status: FactStatus;
    comment: string;
  }>;
  relevance: number;
  flags: string[];
  flag_details: string[];
};

export type RoundData = {
  round: number;
  playerMove: string;
  aiFactcheckPlayer: FactCheck | null;
  opponentMove: string | null;
  aiFactcheckOpponent: FactCheck | null;
};

export type Verdict = {
  score_player: number;
  score_opponent: number;
  breakdown: {
    factual: [number, number];
    logic: [number, number];
    relevance: [number, number];
    rhetoric: [number, number];
  };
  summary: string;
  best_arg_player: string;
  best_arg_opponent: string;
};

export type ThinkingStage =
  | null
  | "fc_player"
  | "opponent"
  | "fc_opponent"
  | "verdict";
