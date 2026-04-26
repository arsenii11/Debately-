import { NextResponse } from "next/server";
import { runFactcheck } from "@/lib/ai/factcheck";
import type { Side } from "@/lib/types";

type Body = {
  topic?: string;
  playerSide?: Side;
  opponentSide?: Side;
  moveText?: string;
  speaker?: "player" | "opponent";
  previousMoveText?: string;
  round?: number;
  outputLanguage?: "Russian" | "English";
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const speaker = body.speaker === "opponent" ? "opponent" : "player";
  const playerSide = body.playerSide === "AGAINST" ? "AGAINST" : "FOR";
  const opponentSide = body.opponentSide === "FOR" ? "FOR" : "AGAINST";
  const speakerSide: Side = speaker === "player" ? playerSide : opponentSide;
  const outputLanguage =
    body.outputLanguage === "Russian" || body.outputLanguage === "English"
      ? body.outputLanguage
      : undefined;

  const result = await runFactcheck({
    topic: body.topic ?? "",
    side: speakerSide,
    speakerSide,
    moveText: body.moveText ?? "",
    speaker,
    previousMoveText: body.previousMoveText ?? "",
    round: typeof body.round === "number" ? body.round : 1,
    outputLanguage,
  });
  return NextResponse.json(result);
}
