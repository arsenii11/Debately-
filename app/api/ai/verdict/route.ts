import { NextResponse } from "next/server";
import { clipForLog, debatelyLog } from "@/lib/debatelyLog";
import { generateGeminiText } from "@/lib/gemini";
import { VERDICT_RESPONSE_SCHEMA } from "@/lib/geminiSchemas";
import { JUDGE_VERDICT_SYSTEM, judgeVerdictUserPrompt } from "@/lib/prompts";
import { parseVerdictJson, VERDICT_PARSE_FALLBACK } from "@/lib/verdictParse";
import {
  shortAnswerScoreCeilings,
  shortAnswerScorePenalties,
} from "@/lib/verdictPenalties";
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

    const parsedVerdict = parseVerdictJson(raw);
    const pen = shortAnswerScorePenalties(history);
    const ceil = shortAnswerScoreCeilings(history);
    const afterPen = {
      score_player: Math.max(0, parsedVerdict.score_player - pen.player),
      score_opponent: Math.max(0, parsedVerdict.score_opponent - pen.opponent),
    };
    const verdict = {
      ...parsedVerdict,
      score_player: Math.min(ceil.playerMax, afterPen.score_player),
      score_opponent: Math.min(ceil.opponentMax, afterPen.score_opponent),
    };

    if (parsedVerdict === VERDICT_PARSE_FALLBACK) {
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
    if (pen.player > 0 || pen.opponent > 0) {
      debatelyLog("verdict", "warn", "short-answer score penalties applied", {
        pen,
        before: [parsedVerdict.score_player, parsedVerdict.score_opponent],
        afterPen: [afterPen.score_player, afterPen.score_opponent],
      });
    }
    if (ceil.playerMax < 100 || ceil.opponentMax < 100) {
      debatelyLog("verdict", "warn", "short-answer score ceiling applied", {
        ceil,
        afterPen: [afterPen.score_player, afterPen.score_opponent],
        final: [verdict.score_player, verdict.score_opponent],
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
