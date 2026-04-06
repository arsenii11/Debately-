import { NextResponse } from "next/server";
import { clipForLog, debatelyLog } from "@/lib/debatelyLog";
import { generateGeminiText } from "@/lib/gemini";
import { VERDICT_RESPONSE_SCHEMA } from "@/lib/geminiSchemas";
import {
  JUDGE_VERDICT_COMPACT_RETRY_SUFFIX,
  JUDGE_VERDICT_SYSTEM,
  judgeVerdictUserPrompt,
} from "@/lib/prompts";
import {
  isVerdictFallback,
  parseVerdictJson,
  VERDICT_PARSE_FALLBACK,
} from "@/lib/verdictParse";
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

  const baseUserPrompt = judgeVerdictUserPrompt({
    topic,
    playerSide,
    opponentSide,
    history,
    skippedTurns,
  });

  const VERDICT_TOKENS_FIRST = 4096;
  const VERDICT_TOKENS_RETRY = 8192;

  try {
    async function callVerdict(
      userPrompt: string,
      maxOutputTokens: number,
    ): Promise<string> {
      const params = {
        systemInstruction: JUDGE_VERDICT_SYSTEM,
        userPrompt,
        maxOutputTokens,
        responseMimeType: "application/json" as const,
        temperature: 0.35,
      };
      try {
        return await generateGeminiText({
          ...params,
          responseSchema: VERDICT_RESPONSE_SCHEMA,
        });
      } catch (schemaErr) {
        debatelyLog("verdict", "error", "structured output failed; retry without responseSchema", {
          err: String(schemaErr),
        });
        return generateGeminiText(params);
      }
    }

    let raw = await callVerdict(baseUserPrompt, VERDICT_TOKENS_FIRST);
    let parsedVerdict = parseVerdictJson(raw);

    if (isVerdictFallback(parsedVerdict)) {
      debatelyLog("verdict", "warn", "verdict parse failed; retrying compact", {
        rawLen: raw.length,
        rawResponse: raw,
      });
      raw = await callVerdict(
        baseUserPrompt + JUDGE_VERDICT_COMPACT_RETRY_SUFFIX,
        VERDICT_TOKENS_RETRY,
      );
      parsedVerdict = parseVerdictJson(raw);
    }

    if (isVerdictFallback(parsedVerdict)) {
      debatelyLog("verdict", "error", "verdict still fallback after retry", {
        rawLen: raw.length,
        rawResponse: raw,
      });
    }
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

    if (isVerdictFallback(parsedVerdict)) {
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
