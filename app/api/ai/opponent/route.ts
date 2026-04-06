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
import { countWords, truncateToMaxWords } from "@/lib/truncateWords";
import type { RoundData, Side } from "@/lib/types";

/** Hard cap (prompt also asks for ≤120 words). */
const OPPONENT_MAX_WORDS = 120;

type Body = {
  topic?: string;
  playerSide?: Side;
  opponentSide?: Side;
  history?: RoundData[];
  currentRound?: number;
  totalRounds?: number;
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
        currentRound,
        totalRounds,
        transcript,
        lastPlayerMove,
      }),
      responseMimeType: "application/json" as const,
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
      raw = await generateGeminiText(opponentParams);
    }

    const parsed = parseOpponentResponse(raw);
    const trimmed = (parsed?.text ?? raw).trim();
    const beforeWords = countWords(trimmed);
    const text = truncateToMaxWords(trimmed, OPPONENT_MAX_WORDS);
    const afterWords = countWords(text);
    if (beforeWords > OPPONENT_MAX_WORDS) {
      debatelyLog("opponent", "warn", "truncated opponent reply to word cap", {
        beforeWords,
        afterWords,
        cap: OPPONENT_MAX_WORDS,
        rawResponse: raw,
        replyPreview: clipForLog(text),
      });
    } else {
      debatelyLog("opponent", "info", "opponent ok", {
        words: afterWords,
        rawResponse: raw,
        replyPreview: clipForLog(text),
      });
    }
    return NextResponse.json({
      text: text || "AI opponent returned an empty response.",
    });
  } catch (e) {
    debatelyLog("opponent", "error", "Gemini failed for opponent", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      {
        text: "AI opponent failed to respond.",
      },
      { status: 200 },
    );
  }
}
