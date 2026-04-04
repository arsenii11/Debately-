import { NextResponse } from "next/server";
import { generateGeminiText } from "@/lib/gemini";
import {
  formatOpponentTranscript,
  opponentSystemPrompt,
  opponentUserPrompt,
} from "@/lib/prompts";
import type { RoundData, Side } from "@/lib/types";

type Body = {
  topic?: string;
  playerSide?: Side;
  opponentSide?: Side;
  history?: RoundData[];
  currentRound?: number;
  totalRounds?: number;
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

  const last = history[history.length - 1];
  const lastPlayerMove = last?.playerMove?.trim() ?? "";

  const transcript = formatOpponentTranscript(
    history,
    playerSide,
    opponentSide,
  );

  try {
    const text = await generateGeminiText({
      systemInstruction: opponentSystemPrompt(opponentSide),
      userPrompt: opponentUserPrompt({
        topic,
        opponentSide,
        currentRound,
        totalRounds,
        transcript,
        lastPlayerMove,
      }),
      maxOutputTokens: 2048,
    });
    return NextResponse.json({
      text: text.trim() || "AI opponent returned an empty response.",
    });
  } catch (e) {
    console.error("[opponent]", e);
    return NextResponse.json(
      {
        text: "AI opponent failed to respond.",
      },
      { status: 200 },
    );
  }
}
