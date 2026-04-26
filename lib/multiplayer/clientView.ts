import type { RoundData, Side } from "@/lib/types";
import type { MultiplayerRound } from "@/lib/multiplayer/types";

export function viewMultiplayerRoundsFromSide(
  rounds: MultiplayerRound[],
  mySide: Side,
): RoundData[] {
  return rounds.map((r) => {
    const myMove = mySide === "FOR" ? r.forMove : r.againstMove;
    const opMove = mySide === "FOR" ? r.againstMove : r.forMove;
    const myFc = mySide === "FOR" ? r.factcheckFor : r.factcheckAgainst;
    const opFc = mySide === "FOR" ? r.factcheckAgainst : r.factcheckFor;
    return {
      round: r.round,
      playerMove: myMove ?? "",
      aiFactcheckPlayer: myFc,
      opponentMove: opMove,
      aiFactcheckOpponent: opFc,
    };
  });
}
