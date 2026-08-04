import { clipForLog, debatelyLog } from "@/lib/debatelyLog";
import { extractBalancedJsonObject } from "@/lib/extractJson";
import { generateGeminiText } from "@/lib/gemini";
import { OPPONENT_RESPONSE_SCHEMA } from "@/lib/geminiSchemas";
import { runLangGraphWorkflow } from "@/lib/ai/langgraphWorkflow";
import {
  formatOpponentTranscript,
  opponentSystemPrompt,
  opponentUserPrompt,
} from "@/lib/prompts";
import { stripReasoningLeaks } from "@/lib/stripReasoningLeaks";
import { countWords } from "@/lib/truncateWords";
import type { SoloWarmupTier } from "@/lib/soloWarmup";
import type { RoundData, Side } from "@/lib/types";

export type OpponentArgs = {
  topic: string;
  playerSide: Side;
  opponentSide: Side;
  history: RoundData[];
  currentRound: number;
  totalRounds: number;
  turnTimerSeconds: number;
  soloWarmupTier?: SoloWarmupTier;
};

type OpponentResponse = {
  text?: string;
};

type OpponentLengthProfile = {
  softMaxWords: number;
  maxOutputTokens: number;
};

type OpponentModelParams = {
  systemInstruction: string;
  userPrompt: string;
  responseMimeType: "application/json";
  maxOutputTokens: number;
};

type OpponentGraphState = Record<string, unknown> & {
  args: OpponentArgs;
  lengthProfile: OpponentLengthProfile;
  opponentParams: OpponentModelParams;
  raw: string;
  trimmed: string;
  text: string;
};

export function parseWarmupTier(raw: unknown): SoloWarmupTier | undefined {
  if (raw === 0 || raw === 1 || raw === 2) return raw;
  return undefined;
}

function getOpponentLengthProfile(turnTimerSeconds: number): OpponentLengthProfile {
  if (turnTimerSeconds <= 0) {
    return { softMaxWords: 120, maxOutputTokens: 1040 };
  }
  const t = Math.max(60, Math.min(600, Math.floor(turnTimerSeconds)));
  // Token budget includes JSON scaffolding + possible Cyrillic.
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

function stripAccidentalDuplicateBlock(text: string): string {
  const t = text.trim();
  if (t.length < 220) return t;
  const probeLen = Math.min(160, Math.floor(t.length * 0.45));
  const probe = t.slice(0, probeLen).trim();
  if (probe.length < 80) return t;

  const repeatAt = t.indexOf(probe, Math.floor(probe.length * 0.8));
  if (repeatAt <= 0) return t;

  const first = t.slice(0, repeatAt).trim();
  const second = t.slice(repeatAt).trim();
  if (first.length < 80 || second.length < 80) return t;
  if (!second.startsWith(probe.slice(0, Math.min(100, probe.length)))) {
    return t;
  }
  return first;
}

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
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.text === "string"
      ) {
        return parsed;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function runOpponent(args: OpponentArgs): Promise<string> {
  const lengthProfile = getOpponentLengthProfile(args.turnTimerSeconds);
  const last = args.history[args.history.length - 1];
  const lastPlayerMove = last?.playerMove?.trim() ?? "";
  const transcript = formatOpponentTranscript(
    args.history,
    args.playerSide,
    args.opponentSide,
  );
  const opponentParams = {
    systemInstruction: opponentSystemPrompt(args.opponentSide),
    userPrompt: opponentUserPrompt({
      topic: args.topic,
      opponentSide: args.opponentSide,
      playerSide: args.playerSide,
      currentRound: args.currentRound,
      totalRounds: args.totalRounds,
      turnTimerSeconds: args.turnTimerSeconds,
      transcript,
      lastPlayerMove,
      soloWarmupTier: args.soloWarmupTier,
    }),
    responseMimeType: "application/json" as const,
    maxOutputTokens: lengthProfile.maxOutputTokens,
  };

  try {
    const graphState = await runLangGraphWorkflow<OpponentGraphState>(
      {
        args,
        lengthProfile,
        opponentParams,
        raw: "",
        trimmed: "",
        text: "",
      },
      [
        {
          name: "primary_opponent_turn",
          run: async (state) => {
            let raw: string;
            try {
              raw = await generateGeminiText({
                ...state.opponentParams,
                responseSchema: OPPONENT_RESPONSE_SCHEMA,
              });
            } catch (schemaErr) {
              debatelyLog(
                "opponent",
                "error",
                "structured output failed; retry without responseSchema",
                { err: String(schemaErr) },
              );
              raw = await generateGeminiText({
                ...state.opponentParams,
                maxOutputTokens: Math.round(
                  state.lengthProfile.maxOutputTokens * 1.5,
                ),
              });
            }

            raw = stripReasoningLeaks(raw);
            const parsed = parseOpponentResponse(raw);
            const trimmed = stripAccidentalDuplicateBlock(
              stripReasoningLeaks((parsed?.text ?? raw).trim()),
            );
            return { raw, trimmed };
          },
        },
        {
          name: "retry_truncated_opponent_turn",
          run: async (state) => {
            let trimmed = state.trimmed;
            if (!looksTruncated(trimmed, state.lengthProfile.softMaxWords)) {
              return {};
            }
            debatelyLog(
              "opponent",
              "warn",
              "reply looks truncated; retrying with larger budget",
              {
                words: countWords(trimmed),
                rawLen: state.raw.length,
                rawPreview: state.raw.slice(0, 200),
              },
            );
            try {
              const maxWords = Math.max(
                40,
                Math.floor(state.lengthProfile.softMaxWords * 0.75),
              );
              const raw2 = await generateGeminiText({
                systemInstruction: state.opponentParams.systemInstruction,
                userPrompt:
                  state.opponentParams.userPrompt +
                  `\n\nIMPORTANT: Output ONLY your spoken response as plain text — no JSON, no markdown, no formatting. End with a complete sentence. Keep it under ${maxWords} words. Do not add [Thoughts] or any reasoning after your answer.`,
                maxOutputTokens: Math.round(
                  state.lengthProfile.maxOutputTokens * 2.5,
                ),
              });
              const trimmed2 = stripAccidentalDuplicateBlock(
                stripReasoningLeaks(raw2)
                  .replace(/^```(?:json)?\s*/i, "")
                  .replace(/\s*```$/i, "")
                  .replace(/^\{?"text"\s*:\s*"?/i, "")
                  .replace(/"?\}?$/, "")
                  .trim(),
              );
              if (
                trimmed2 &&
                !looksTruncated(trimmed2, state.lengthProfile.softMaxWords)
              ) {
                trimmed = trimmed2;
              }
            } catch (retryErr) {
              debatelyLog("opponent", "warn", "truncation retry failed", {
                err:
                  retryErr instanceof Error
                    ? retryErr.message
                    : String(retryErr),
              });
            }
            return { trimmed };
          },
        },
        {
          name: "finalize_opponent_turn",
          run: (state) => {
            const text = state.trimmed || "Debately returned an empty response.";
            const afterWords = countWords(text);
            if (afterWords > state.lengthProfile.softMaxWords) {
              debatelyLog(
                "opponent",
                "warn",
                "Debately reply exceeded soft length guidance",
                {
                  words: afterWords,
                  softMaxWords: state.lengthProfile.softMaxWords,
                  rawResponse: state.raw,
                  replyPreview: clipForLog(text),
                },
              );
            }
            debatelyLog("opponent", "info", "Debately response ok", {
              words: afterWords,
              rawResponse: state.raw,
              replyPreview: clipForLog(text),
            });
            return { text };
          },
        },
      ],
    );
    return graphState.text;
  } catch (e) {
    debatelyLog("opponent", "error", "Gemini failed for Debately", {
      err: e instanceof Error ? e.message : String(e),
    });
    return "Debately failed to respond.";
  }
}
