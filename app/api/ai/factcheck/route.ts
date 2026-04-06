import { NextResponse } from "next/server";
import { debatelyLog } from "@/lib/debatelyLog";
import { generateGeminiText } from "@/lib/gemini";
import { FACTCHECK_RESPONSE_SCHEMA } from "@/lib/geminiSchemas";
import { parseFactcheckJson, FACTCHECK_PARSE_FALLBACK } from "@/lib/factcheckFallback";
import {
  JUDGE_FACTCHECK_SYSTEM,
  judgeFactcheckUserPrompt,
} from "@/lib/prompts";
import type { Side } from "@/lib/types";

type Body = {
  topic?: string;
  playerSide?: Side;
  opponentSide?: Side;
  moveText?: string;
  speaker?: "player" | "opponent";
  previousMoveText?: string;
  round?: number;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const topic = body.topic ?? "";
  const moveText = body.moveText ?? "";
  const round = typeof body.round === "number" ? body.round : 1;
  const previousMoveText = body.previousMoveText ?? "";
  const speaker = body.speaker === "opponent" ? "opponent" : "player";
  const playerSide = body.playerSide === "AGAINST" ? "AGAINST" : "FOR";
  const opponentSide = body.opponentSide === "FOR" ? "FOR" : "AGAINST";
  const side: Side = speaker === "player" ? playerSide : opponentSide;

  const factcheckParams = {
    systemInstruction: JUDGE_FACTCHECK_SYSTEM,
    userPrompt: judgeFactcheckUserPrompt({
      topic,
      side,
      round,
      previousMoveText,
      moveText,
    }),
    maxOutputTokens: 2048,
    responseMimeType: "application/json" as const,
    temperature: 0.35,
  };

  try {
    let raw: string;
    try {
      raw = await generateGeminiText({
        ...factcheckParams,
        responseSchema: FACTCHECK_RESPONSE_SCHEMA,
      });
    } catch (schemaErr) {
      debatelyLog("factcheck", "error", "structured output failed; retry without responseSchema", {
        err: String(schemaErr),
      });
      raw = await generateGeminiText(factcheckParams);
    }
    const parsed = parseFactcheckJson(raw);
    if (parsed === FACTCHECK_PARSE_FALLBACK) {
      debatelyLog("factcheck", "error", "JSON parse produced fallback", {
        rawLen: raw.length,
        rawResponse: raw,
      });
    } else {
      debatelyLog("factcheck", "info", "factcheck ok", {
        rawLen: raw.length,
        facts: parsed.facts.length,
        relevance: parsed.relevance,
        rawResponse: raw,
        parsedResponse: JSON.stringify(parsed),
      });
    }
    return NextResponse.json(parsed);
  } catch (e) {
    debatelyLog("factcheck", "error", "Gemini failed; returning fallback factcheck", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(FACTCHECK_PARSE_FALLBACK);
  }
}
