import { NextResponse } from "next/server";
import { runVerdict } from "@/lib/ai/verdict";
import type { RoundData, Side } from "@/lib/types";

type Body = {
  topic?: string;
  playerSide?: Side;
  opponentSide?: Side;
  history?: RoundData[];
  skippedTurns?: number;
  playerConceded?: boolean;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const playerSide = body.playerSide === "AGAINST" ? "AGAINST" : "FOR";
  const opponentSide = body.opponentSide === "FOR" ? "FOR" : "AGAINST";
  const history = Array.isArray(body.history) ? body.history : [];
  const skippedTurns =
    typeof body.skippedTurns === "number" && body.skippedTurns >= 0
      ? Math.floor(body.skippedTurns)
      : 0;
  const playerConceded = body.playerConceded === true;

  const verdict = await runVerdict({
    topic: body.topic ?? "",
    playerSide,
    opponentSide,
    history,
    skippedTurns,
    playerConceded,
  });
  return NextResponse.json(verdict);
}
