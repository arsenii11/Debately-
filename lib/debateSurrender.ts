import type { FactCheck, RoundData } from "./types";

/** Machine-readable; verdict prompt and penalties treat this as concession. */
export const SURRENDER_PLAYER_MOVE = "[Conceded the debate]";

const surrenderPlayerFc: FactCheck = {
  facts: [
    {
      claim: "Player ended the debate by conceding",
      status: "verified",
      comment: "No argumentative content to assess.",
    },
  ],
  relevance: 0,
  flags: [],
  flag_details: [],
};

const surrenderOpponentFc: FactCheck = {
  facts: [
    {
      claim: "No counter-argument after concession",
      status: "disputed",
      comment: "Match closed by player.",
    },
  ],
  relevance: 85,
  flags: [],
  flag_details: [],
};

export function buildSurrenderRound(round: number): RoundData {
  return {
    round,
    playerMove: SURRENDER_PLAYER_MOVE,
    aiFactcheckPlayer: surrenderPlayerFc,
    opponentMove:
      "You conceded — debate stops here. Thanks for the rounds; take the W on persistence.",
    aiFactcheckOpponent: surrenderOpponentFc,
  };
}
