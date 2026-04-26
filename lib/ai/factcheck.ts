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
  JUDGE_FACTCHECK_COMPACT_RETRY_SUFFIX,
  judgeFactcheckUserPrompt,
  isPlayfulDebateTopic,
} from "@/lib/prompts";
import type { FactCheck, Side } from "@/lib/types";

export type FactcheckArgs = {
  topic: string;
  side: Side;
  /** Speaker's argued side. */
  speakerSide: Side;
  moveText: string;
  /** "player" / "opponent" only changes prompt framing for first-move structured retry. */
  speaker: "player" | "opponent";
  previousMoveText: string;
  round: number;
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

function hasMalformedFactText(parsed: FactCheck): boolean {
  if (parsed.facts.length === 0) return true;
  return parsed.facts.some((f) => {
    const claim = f.claim.trim();
    const comment = f.comment.trim();
    if (!claim || !comment) return true;
    return /```|^\s*\{|\uFFFD/.test(`${claim} ${comment}`);
  });
}

function rawLooksTruncatedJson(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true;
  if (/[,:]\s*$/.test(t)) return true;
  const openCurly = (t.match(/\{/g) ?? []).length;
  const closeCurly = (t.match(/\}/g) ?? []).length;
  return openCurly !== closeCurly;
}

function shouldExpandFactcheck(moveText: string, parsed: FactCheck): boolean {
  if (isFactcheckFallback(parsed)) return false;
  const moveWords = countWords(moveText);
  if (moveWords < 18) return false;
  const nonEmptyComments = parsed.facts.filter((f) => f.comment.trim().length > 0);
  const commentChars = nonEmptyComments.reduce(
    (sum, f) => sum + f.comment.trim().length,
    0,
  );
  if (parsed.facts.length < 2) return true;
  if (nonEmptyComments.length < parsed.facts.length) return true;
  return commentChars < 180;
}

export async function runFactcheck(args: FactcheckArgs): Promise<FactCheck> {
  const {
    topic,
    moveText,
    round,
    previousMoveText,
    outputLanguage,
    speaker,
    speakerSide,
  } = args;
  const hasNoPreviousArgument =
    previousMoveText.trim().length === 0 ||
    /^no previous argument$/i.test(previousMoveText.trim());
  const firstPlayerFactcheck =
    speaker === "player" && round <= 1 && hasNoPreviousArgument;
  const vibeFirstTopic = isPlayfulDebateTopic(topic);

  const factcheckParams = {
    systemInstruction: JUDGE_FACTCHECK_SYSTEM,
    userPrompt: judgeFactcheckUserPrompt({
      topic,
      side: speakerSide,
      round,
      previousMoveText,
      moveText,
      outputLanguage,
      vibeFirst: vibeFirstTopic,
    }),
    maxOutputTokens: 1800,
    responseMimeType: "application/json" as const,
    temperature: vibeFirstTopic ? 0.5 : 0.35,
    enableSearch: !firstPlayerFactcheck && !vibeFirstTopic,
    ...(firstPlayerFactcheck
      ? { responseSchema: FACTCHECK_RESPONSE_SCHEMA }
      : {}),
  };

  try {
    const raw = await generateGeminiText(factcheckParams);
    let parsed = parseFactcheckJson(raw);
    if (
      (
        isFactcheckFallback(parsed) ||
        hasMalformedFactText(parsed) ||
        rawLooksTruncatedJson(raw)
      ) &&
      raw.trim().length > 0
    ) {
      debatelyLog(
        "factcheck",
        "warn",
        "parse fallback with non-empty body; retry without search (structured)",
        { rawLen: raw.length, rawPreview: raw.slice(0, 400) },
      );
      try {
        const raw2 = await generateGeminiText({
          ...factcheckParams,
          userPrompt:
            factcheckParams.userPrompt + JUDGE_FACTCHECK_COMPACT_RETRY_SUFFIX,
          enableSearch: false,
          responseSchema: FACTCHECK_RESPONSE_SCHEMA,
          maxOutputTokens: 2000,
          temperature: 0.2,
        });
        const parsed2 = parseFactcheckJson(raw2);
        if (!isFactcheckFallback(parsed2)) {
          parsed = parsed2;
        } else {
          debatelyLog(
            "factcheck",
            "warn",
            "structured retry still fallback",
            { rawLen: raw2.length, rawPreview: raw2.slice(0, 400) },
          );
          try {
            const raw3 = await generateGeminiText({
              ...factcheckParams,
              userPrompt:
                factcheckParams.userPrompt +
                JUDGE_FACTCHECK_COMPACT_RETRY_SUFFIX,
              enableSearch: false,
              responseSchema: undefined,
              maxOutputTokens: 1400,
              temperature: 0.1,
            });
            const parsed3 = parseFactcheckJson(raw3);
            if (!isFactcheckFallback(parsed3)) {
              parsed = parsed3;
            }
          } catch (lastErr) {
            debatelyLog(
              "factcheck",
              "warn",
              "last-chance no-schema retry failed",
              { err: lastErr instanceof Error ? lastErr.message : String(lastErr) },
            );
          }
        }
      } catch (retryErr) {
        debatelyLog(
          "factcheck",
          "warn",
          "structured retry without search failed",
          { err: retryErr instanceof Error ? retryErr.message : String(retryErr) },
        );
      }
    }
    if (shouldExpandFactcheck(moveText, parsed)) {
      debatelyLog(
        "factcheck",
        "warn",
        "factcheck too short for long argument; retrying expanded",
        {
          moveWords: countWords(moveText),
          facts: parsed.facts.length,
          commentChars: parsed.facts.reduce(
            (sum, f) => sum + f.comment.trim().length,
            0,
          ),
        },
      );
      try {
        const expansionSuffix = vibeFirstTopic
          ? `\n\nEXPANSION RETRY: Still thin — add at most one extra row only if a second distinct point exists; otherwise sharpen the single vibe/banter row. Max 2 rows for humor topics; focus on delivery.`
          : `\n\nEXPANSION RETRY: The previous factcheck was too short. Extract 2-3 factual claims (when present) and provide concise but complete comments for each claim (up to 2 short sentences each). Keep strict JSON shape.`;
        const rawExpanded = await generateGeminiText({
          ...factcheckParams,
          userPrompt: factcheckParams.userPrompt + expansionSuffix,
          enableSearch: false,
          responseSchema: FACTCHECK_RESPONSE_SCHEMA,
          maxOutputTokens: vibeFirstTopic ? 1600 : 2600,
          temperature: vibeFirstTopic ? 0.45 : 0.2,
        });
        const parsedExpanded = parseFactcheckJson(rawExpanded);
        if (
          !isFactcheckFallback(parsedExpanded) &&
          !hasMalformedFactText(parsedExpanded)
        ) {
          parsed = parsedExpanded;
        }
      } catch (expandedErr) {
        debatelyLog(
          "factcheck",
          "warn",
          "expanded factcheck retry failed",
          { err: expandedErr instanceof Error ? expandedErr.message : String(expandedErr) },
        );
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
        debatelyLog(
          "factcheck",
          "warn",
          "argument score adjusted after model output",
          {
            moveText,
            modelRelevance: parsed.relevance,
            finalRelevance: normalized.relevance,
          },
        );
      }
      debatelyLog("factcheck", "info", "factcheck ok", {
        rawLen: raw.length,
        facts: normalized.facts.length,
        relevance: normalized.relevance,
        rawResponse: raw,
        parsedResponse: JSON.stringify(normalized),
      });
    }
    return normalized;
  } catch (e) {
    debatelyLog(
      "factcheck",
      "warn",
      "Gemini failed on primary call; retrying no-search structured",
      { err: e instanceof Error ? e.message : String(e) },
    );
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
      return normalizedRetry;
    } catch (retryErr) {
      debatelyLog(
        "factcheck",
        "error",
        "Gemini failed; returning fallback factcheck",
        { err: retryErr instanceof Error ? retryErr.message : String(retryErr) },
      );
      return FACTCHECK_PARSE_FALLBACK;
    }
  }
}
