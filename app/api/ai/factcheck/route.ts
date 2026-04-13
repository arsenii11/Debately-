import { NextResponse } from "next/server";
import { debatelyLog } from "@/lib/debatelyLog";
import { generateGeminiText } from "@/lib/gemini";
import { FACTCHECK_RESPONSE_SCHEMA } from "@/lib/geminiSchemas";
import { clampFactcheckArgumentScore } from "@/lib/factcheckScoreAdjust";
import {
  isFactcheckFallback,
  parseFactcheckJson,
  FACTCHECK_PARSE_FALLBACK,
} from "@/lib/factcheckFallback";
import {
  JUDGE_FACTCHECK_SYSTEM,
  judgeFactcheckUserPrompt,
} from "@/lib/prompts";
import type { FactCheck, Side } from "@/lib/types";

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

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function hasSupportSignals(text: string): boolean {
  return /%|\d|because|since|for example|for instance|according to|study|studies|data|evidence|statistics|research|report|because|потому|так как|например|например,|данн|исслед|статист|цифр/i.test(
    text,
  );
}

function isBareLowSubstanceClaim(text: string): boolean {
  const words = countWords(text);
  if (words === 0) return false;
  return words <= 4 && !hasSupportSignals(text);
}

function normalizeFactcheckRelevance(
  moveText: string,
  parsed: FactCheck,
): FactCheck {
  if (isFactcheckFallback(parsed)) return parsed;
  if (!isBareLowSubstanceClaim(moveText)) return parsed;
  return {
    ...parsed,
    relevance: Math.min(parsed.relevance, 10),
  };
}

function finalizeFactcheck(moveText: string, parsed: FactCheck): FactCheck {
  if (isFactcheckFallback(parsed)) return parsed;
  let out = normalizeFactcheckRelevance(moveText, parsed);
  out = clampFactcheckArgumentScore(out);
  return out;
}

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
  const outputLanguage =
    body.outputLanguage === "Russian" || body.outputLanguage === "English"
      ? body.outputLanguage
      : undefined;
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
      outputLanguage,
    }),
    maxOutputTokens: 1400,
    responseMimeType: "application/json" as const,
    temperature: 0.35,
    enableSearch: true,
  };

  try {
    const raw = await generateGeminiText(factcheckParams);
    let parsed = parseFactcheckJson(raw);
    if (isFactcheckFallback(parsed) && raw.trim().length > 0) {
      debatelyLog("factcheck", "warn", "parse fallback with non-empty body; retry without search (structured)", {
        rawLen: raw.length,
        rawPreview: raw.slice(0, 400),
      });
      try {
        const raw2 = await generateGeminiText({
          ...factcheckParams,
          enableSearch: false,
          responseSchema: FACTCHECK_RESPONSE_SCHEMA,
        });
        const parsed2 = parseFactcheckJson(raw2);
        if (!isFactcheckFallback(parsed2)) {
          parsed = parsed2;
        }
      } catch (retryErr) {
        debatelyLog("factcheck", "warn", "structured retry without search failed", {
          err: retryErr instanceof Error ? retryErr.message : String(retryErr),
        });
      }
    }
    const normalized = finalizeFactcheck(moveText, parsed);
    if (isFactcheckFallback(parsed)) {
      debatelyLog("factcheck", "error", "JSON parse produced fallback", {
        rawLen: raw.length,
        rawResponse: raw,
      });
    } else {
      if (normalized.relevance !== parsed.relevance) {
        debatelyLog("factcheck", "warn", "argument score adjusted after model output", {
          moveText,
          modelRelevance: parsed.relevance,
          finalRelevance: normalized.relevance,
        });
      }
      debatelyLog("factcheck", "info", "factcheck ok", {
        rawLen: raw.length,
        facts: normalized.facts.length,
        relevance: normalized.relevance,
        rawResponse: raw,
        parsedResponse: JSON.stringify(normalized),
      });
    }
    return NextResponse.json(normalized);
  } catch (e) {
    debatelyLog("factcheck", "warn", "Gemini failed on primary call; retrying no-search structured", {
      err: e instanceof Error ? e.message : String(e),
    });
    try {
      const rawRetry = await generateGeminiText({
        ...factcheckParams,
        enableSearch: false,
        responseSchema: FACTCHECK_RESPONSE_SCHEMA,
      });
      const parsedRetry = parseFactcheckJson(rawRetry);
      const normalizedRetry = finalizeFactcheck(moveText, parsedRetry);
      if (isFactcheckFallback(parsedRetry)) {
        debatelyLog("factcheck", "error", "retry parse still fallback", {
          rawLen: rawRetry.length,
          rawResponse: rawRetry,
        });
      } else {
        debatelyLog("factcheck", "info", "factcheck ok on no-search retry", {
          rawLen: rawRetry.length,
          facts: normalizedRetry.facts.length,
          relevance: normalizedRetry.relevance,
        });
      }
      return NextResponse.json(normalizedRetry);
    } catch (retryErr) {
      debatelyLog("factcheck", "error", "Gemini failed; returning fallback factcheck", {
        err: retryErr instanceof Error ? retryErr.message : String(retryErr),
      });
      return NextResponse.json(FACTCHECK_PARSE_FALLBACK);
    }
  }
}
