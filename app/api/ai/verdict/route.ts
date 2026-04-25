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
  argumentCompletenessScoreBonuses,
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
  playerConceded?: boolean;
};

function fallbackBestArgFromHistory(
  history: RoundData[],
  who: "player" | "debately",
): string {
  const moves = history
    .map((r) => (who === "player" ? r.playerMove : (r.opponentMove ?? "")))
    .map((t) => t.trim())
    .filter(Boolean);
  if (moves.length === 0) return "No clear argument available.";
  const best = moves.reduce((a, b) => (b.length > a.length ? b : a));
  return best.length > 180 ? `${best.slice(0, 177)}...` : best;
}

function verdictNeedsRetry(v: ReturnType<typeof parseVerdictJson>): boolean {
  const badPlayerArg =
    !v.best_arg_player?.trim() ||
    v.best_arg_player.trim() === "—" ||
    v.best_arg_player.trim() === "-";
  const badDebatelyArg =
    !v.best_arg_opponent?.trim() ||
    v.best_arg_opponent.trim() === "—" ||
    v.best_arg_opponent.trim() === "-";
  const suspiciouslyTruncatedSummary = v.summary.trim().endsWith("…");
  return badPlayerArg || badDebatelyArg || suspiciouslyTruncatedSummary;
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
  const skippedTurns =
    typeof body.skippedTurns === "number" && body.skippedTurns >= 0
      ? Math.floor(body.skippedTurns)
      : 0;
  const playerConceded = body.playerConceded === true;

  const baseUserPrompt = judgeVerdictUserPrompt({
    topic,
    playerSide,
    opponentSide,
    history,
    skippedTurns,
    playerConceded,
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

    if (!isVerdictFallback(parsedVerdict) && verdictNeedsRetry(parsedVerdict)) {
      debatelyLog("verdict", "warn", "verdict missing best-args/complete summary; retrying compact", {
        rawLen: raw.length,
        rawPreview: clipForLog(raw),
      });
      raw = await callVerdict(
        `${baseUserPrompt}${JUDGE_VERDICT_COMPACT_RETRY_SUFFIX}
CRITICAL: best_arg_player and best_arg_opponent must be non-empty specific one-sentence arguments.`,
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

    // Derive final scores from the breakdown so they are always consistent
    // with the displayed category subscores (factual 40%, logic 25%, relevance 20%, rhetoric 15%).
    if (!isVerdictFallback(parsedVerdict)) {
      const bd = parsedVerdict.breakdown;
      const aiSp = parsedVerdict.score_player;
      const aiSo = parsedVerdict.score_opponent;
      const derivedSp = Math.round(
        bd.factual[0] * 0.4 + bd.logic[0] * 0.25 + bd.relevance[0] * 0.2 + bd.rhetoric[0] * 0.15,
      );
      const derivedSo = Math.round(
        bd.factual[1] * 0.4 + bd.logic[1] * 0.25 + bd.relevance[1] * 0.2 + bd.rhetoric[1] * 0.15,
      );
      parsedVerdict = { ...parsedVerdict, score_player: derivedSp, score_opponent: derivedSo };
      debatelyLog("verdict", "info", "scores derived from breakdown", {
        aiScores: [aiSp, aiSo],
        derivedScores: [derivedSp, derivedSo],
      });
    }

    const pen = shortAnswerScorePenalties(history);
    const completenessBonus = argumentCompletenessScoreBonuses(history);
    const ceil = shortAnswerScoreCeilings(history);
    const bestArgPlayer =
      parsedVerdict.best_arg_player?.trim() &&
      parsedVerdict.best_arg_player.trim() !== "—" &&
      parsedVerdict.best_arg_player.trim() !== "-"
        ? parsedVerdict.best_arg_player
        : fallbackBestArgFromHistory(history, "player");
    const bestArgDebately =
      parsedVerdict.best_arg_opponent?.trim() &&
      parsedVerdict.best_arg_opponent.trim() !== "—" &&
      parsedVerdict.best_arg_opponent.trim() !== "-"
        ? parsedVerdict.best_arg_opponent
        : fallbackBestArgFromHistory(history, "debately");
    const afterPen = {
      score_player: Math.max(0, parsedVerdict.score_player - pen.player),
      score_opponent: Math.max(0, parsedVerdict.score_opponent - pen.opponent),
    };
    const afterCompletenessBonus = {
      score_player: Math.min(100, afterPen.score_player + completenessBonus.player),
      score_opponent: Math.min(100, afterPen.score_opponent + completenessBonus.opponent),
    };
    let verdict = {
      ...parsedVerdict,
      best_arg_player: bestArgPlayer,
      best_arg_opponent: bestArgDebately,
      score_player: Math.min(ceil.playerMax, afterCompletenessBonus.score_player),
      score_opponent: Math.min(ceil.opponentMax, afterCompletenessBonus.score_opponent),
    };

    if (playerConceded && !isVerdictFallback(parsedVerdict)) {
      const spCap = Math.min(verdict.score_player, 32);
      const soFloor = Math.max(
        verdict.score_opponent,
        Math.min(100, spCap + 18),
      );
      verdict = {
        ...verdict,
        score_player: spCap,
        score_opponent: soFloor,
      };
    }

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
        completenessBonus,
        before: [parsedVerdict.score_player, parsedVerdict.score_opponent],
        afterPen: [afterPen.score_player, afterPen.score_opponent],
        afterCompletenessBonus: [
          afterCompletenessBonus.score_player,
          afterCompletenessBonus.score_opponent,
        ],
      });
    }
    if (completenessBonus.player > 0 || completenessBonus.opponent > 0) {
      debatelyLog("verdict", "info", "argument completeness bonuses applied", {
        completenessBonus,
        afterPen: [afterPen.score_player, afterPen.score_opponent],
        afterCompletenessBonus: [
          afterCompletenessBonus.score_player,
          afterCompletenessBonus.score_opponent,
        ],
      });
    }
    if (ceil.playerMax < 100 || ceil.opponentMax < 100) {
      debatelyLog("verdict", "warn", "short-answer score ceiling applied", {
        ceil,
        afterPen: [afterPen.score_player, afterPen.score_opponent],
        afterCompletenessBonus: [
          afterCompletenessBonus.score_player,
          afterCompletenessBonus.score_opponent,
        ],
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
