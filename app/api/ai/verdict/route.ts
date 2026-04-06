import { NextResponse } from "next/server";
import { clipForLog, debatelyLog } from "@/lib/debatelyLog";
import { generateGeminiText } from "@/lib/gemini";
import { VERDICT_RESPONSE_SCHEMA } from "@/lib/geminiSchemas";
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

  const verdictParams = {
    systemInstruction: JUDGE_VERDICT_SYSTEM,
    userPrompt: judgeVerdictUserPrompt({
      topic,
      playerSide,
      opponentSide,
      history,
      skippedTurns,
    }),
    maxOutputTokens: 2048,
    responseMimeType: "application/json" as const,
    temperature: 0.35,
  };

  try {
    let raw: string;
    try {
      raw = await generateGeminiText({
        ...verdictParams,
        responseSchema: VERDICT_RESPONSE_SCHEMA,
      });
    } catch (schemaErr) {
      debatelyLog("verdict", "error", "structured output failed; retry without responseSchema", {
        err: String(schemaErr),
      });
      raw = await generateGeminiText(verdictParams);
    }

    const verdict = parseVerdictJson(raw);
    if (verdict === VERDICT_PARSE_FALLBACK) {
      debatelyLog("verdict", "error", "JSON parse produced fallback", {
        rawLen: raw.length,
        rawPreview: raw.slice(0, 500),
      });
    } else {
      debatelyLog("verdict", "info", "verdict ok", {
        rawLen: raw.length,
        scores: [verdict.score_player, verdict.score_opponent],
        rawPreview: clipForLog(raw),
        parsedPreview: clipForLog(JSON.stringify(verdict)),
      });
    }
    return NextResponse.json(verdict);
  } catch (e) {
    debatelyLog("verdict", "error", "Gemini failed; returning fallback verdict", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(VERDICT_PARSE_FALLBACK);
  }
}
