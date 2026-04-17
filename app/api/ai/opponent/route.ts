import { NextResponse } from "next/server";
import { clipForLog, debatelyLog } from "@/lib/debatelyLog";
import { generateGeminiText } from "@/lib/gemini";
import { OPPONENT_RESPONSE_SCHEMA } from "@/lib/geminiSchemas";
import {
  formatOpponentTranscript,
  opponentSystemPrompt,
  opponentUserPrompt,
} from "@/lib/prompts";
import { extractBalancedJsonObject } from "@/lib/extractJson";
import { countWords } from "@/lib/truncateWords";
import type { RoundData, Side } from "@/lib/types";

function getOpponentLengthProfile(turnTimerSeconds: number): {
  softMaxWords: number;
  maxOutputTokens: number;
} {
  const t = Math.max(60, Math.min(600, Math.floor(turnTimerSeconds)));
  // Token budget includes JSON scaffolding + possible Cyrillic (Russian tokens
  // are ~2x more expensive). Be generous to avoid mid-sentence truncation.
  if (t <= 90) return { softMaxWords: 85, maxOutputTokens: 720 };
  if (t <= 150) return { softMaxWords: 120, maxOutputTokens: 1040 };
  if (t <= 240) return { softMaxWords: 165, maxOutputTokens: 1480 };
  return { softMaxWords: 210, maxOutputTokens: 1920 };
}

function looksTruncated(text: string, minWords: number): boolean {
  const t = text.trim();
  if (!t) return true;
  if (countWords(t) < Math.max(6, Math.floor(minWords * 0.4))) return true;
  const last = t[t.length - 1];
  const okEndings = /[\.\!\?\…»"”'`\)\]]/;
  if (!okEndings.test(last)) return true;
  return false;
}

type Body = {
  topic?: string;
  playerSide?: Side;
  opponentSide?: Side;
  history?: RoundData[];
  currentRound?: number;
  totalRounds?: number;
  turnTimerSeconds?: number;
};

type OpponentResponse = {
  text?: string;
};

function parseOpponentResponse(raw: string): OpponentResponse | null {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const extracted = extractBalancedJsonObject(stripped);
  const candidates = extracted
    ? Array.from(new Set([extracted, stripped]))
    : [stripped];

  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text) as OpponentResponse;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* try next */
    }
  }
  return null;
}

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
    typeof body.turnTimerSeconds === "number" ? body.turnTimerSeconds : 120;
  const lengthProfile = getOpponentLengthProfile(turnTimerSeconds);

  const last = history[history.length - 1];
  const lastPlayerMove = last?.playerMove?.trim() ?? "";

  const transcript = formatOpponentTranscript(
    history,
    playerSide,
    opponentSide,
  );

  try {
    const opponentParams = {
      systemInstruction: opponentSystemPrompt(opponentSide),
      userPrompt: opponentUserPrompt({
        topic,
        opponentSide,
        playerSide,
        currentRound,
        totalRounds,
        turnTimerSeconds,
        transcript,
        lastPlayerMove,
      }),
      responseMimeType: "application/json" as const,
      maxOutputTokens: lengthProfile.maxOutputTokens,
    };

    let raw: string;
    try {
      raw = await generateGeminiText({
        ...opponentParams,
        responseSchema: OPPONENT_RESPONSE_SCHEMA,
      });
    } catch (schemaErr) {
      debatelyLog(
        "opponent",
        "error",
        "structured output failed; retry without responseSchema",
        {
          err: String(schemaErr),
        },
      );
      raw = await generateGeminiText({
        ...opponentParams,
        maxOutputTokens: Math.round(lengthProfile.maxOutputTokens * 1.5),
      });
    }

    const parsed = parseOpponentResponse(raw);
    let trimmed = (parsed?.text ?? raw).trim();

    // If the result looks cut mid-sentence, retry once with a bigger budget
    // and a compact-reply hint so the model finishes its thought.
    if (looksTruncated(trimmed, lengthProfile.softMaxWords)) {
      debatelyLog(
        "opponent",
        "warn",
        "reply looks truncated; retrying with larger budget",
        {
          words: countWords(trimmed),
          rawLen: raw.length,
          rawPreview: raw.slice(0, 200),
        },
      );
      try {
        const raw2 = await generateGeminiText({
          ...opponentParams,
          userPrompt:
            opponentParams.userPrompt +
            `\n\nIMPORTANT: reply MUST fit in one compact JSON object ending with a full sentence. Keep it under ${Math.max(40, Math.floor(lengthProfile.softMaxWords * 0.7))} words. Do not get cut off.`,
          maxOutputTokens: Math.round(lengthProfile.maxOutputTokens * 2),
        });
        const parsed2 = parseOpponentResponse(raw2);
        const trimmed2 = (parsed2?.text ?? raw2).trim();
        if (trimmed2 && !looksTruncated(trimmed2, lengthProfile.softMaxWords)) {
          raw = raw2;
          trimmed = trimmed2;
        }
      } catch (retryErr) {
        debatelyLog("opponent", "warn", "truncation retry failed", {
          err: retryErr instanceof Error ? retryErr.message : String(retryErr),
        });
      }
    }

    const text = trimmed || "Debately returned an empty response.";
    const afterWords = countWords(text);
    if (afterWords > lengthProfile.softMaxWords) {
      debatelyLog("opponent", "warn", "Debately reply exceeded soft length guidance", {
        words: afterWords,
        softMaxWords: lengthProfile.softMaxWords,
        rawResponse: raw,
        replyPreview: clipForLog(text),
      });
    }
    debatelyLog("opponent", "info", "Debately response ok", {
      words: afterWords,
      rawResponse: raw,
      replyPreview: clipForLog(text),
    });
    return NextResponse.json({
      text,
    });
  } catch (e) {
    debatelyLog("opponent", "error", "Gemini failed for Debately", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { text: "Debately failed to respond." },
      { status: 200 },
    );
  }
}
