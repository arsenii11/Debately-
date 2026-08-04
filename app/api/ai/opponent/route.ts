import { NextResponse } from "next/server";
import { parseWarmupTier, runOpponent } from "@/lib/ai/opponent";
import { DEFAULT_TIMED_TURN_TIMER_SECONDS } from "@/lib/types";
import type { SoloWarmupTier } from "@/lib/soloWarmup";
import type { RoundData, Side } from "@/lib/types";

type Body = {
  topic?: string;
  playerSide?: Side;
  opponentSide?: Side;
  history?: RoundData[];
  currentRound?: number;
  totalRounds?: number;
  turnTimerSeconds?: number;
  soloWarmupTier?: SoloWarmupTier;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const topic = body.topic ?? "";
  const playerSide = body.playerSide === "AGAINST" ? "AGAINST" : "FOR";
  const opponentSide = body.opponentSide === "FOR" ? "FOR" : "AGAINST";
  const history = Array.isArray(body.history) ? body.history : [];
  const currentRound =
    typeof body.currentRound === "number" ? body.currentRound : 1;
  const totalRounds =
    typeof body.totalRounds === "number" ? body.totalRounds : 3;
  const turnTimerSeconds =
    typeof body.turnTimerSeconds === "number"
      ? body.turnTimerSeconds
      : DEFAULT_TIMED_TURN_TIMER_SECONDS;
  const text = await runOpponent({
    topic,
    playerSide,
    opponentSide,
    history,
    currentRound,
    totalRounds,
    turnTimerSeconds,
    soloWarmupTier: parseWarmupTier(body.soloWarmupTier),
  });
  return NextResponse.json({ text });
}
