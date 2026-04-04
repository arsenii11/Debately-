import { NextResponse } from "next/server";
import { generateGeminiText } from "@/lib/gemini";
import { JUDGE_VERDICT_SYSTEM, judgeVerdictUserPrompt } from "@/lib/prompts";
import { parseVerdictJson, VERDICT_PARSE_FALLBACK } from "@/lib/verdictParse";
import type { RoundData, Side } from "@/lib/types";

type Body = {
  topic?: string;
  playerSide?: Side;
  opponentSide?: Side;
  history?: RoundData[];
  skippedTurns?: number;
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
  const skippedTurns =
    typeof body.skippedTurns === "number" && body.skippedTurns >= 0
      ? Math.floor(body.skippedTurns)
      : 0;

  try {
    const raw = await generateGeminiText({
      systemInstruction: JUDGE_VERDICT_SYSTEM,
      userPrompt: judgeVerdictUserPrompt({
        topic,
        playerSide,
        opponentSide,
        history,
        skippedTurns,
      }),
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      temperature: 0.35,
    });
    const verdict = parseVerdictJson(raw);
    return NextResponse.json(verdict);
  } catch (e) {
    console.error("[verdict]", e);
    return NextResponse.json(VERDICT_PARSE_FALLBACK, { status: 502 });
  }
}
