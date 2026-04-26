import { debatelyLog } from "@/lib/debatelyLog";
import { generateGeminiText } from "@/lib/gemini";
import type { RoundData, Side } from "@/lib/types";

export type HintArgs = {
  topic: string;
  mySide: Side;
  opponentSide: Side;
  history: RoundData[];
  lastOpponentMove: string;
  outputLanguage?: "Russian" | "English";
};

const HINT_SYSTEM = `You are a debate coach helping the speaker craft their next move.
Output 2 to 3 short, punchy bullet ideas for what to say next. Each bullet:
- one sentence, under 22 words
- concrete angle, fact-leaning rebuttal, or pressure point
- never the full reply, just spark ideas
- never reveal you are an AI, never moralize
Output plain text bullets starting with "- ". No preamble, no markdown headers.
Match the dominant language of the transcript.`;

function detectLanguage(history: RoundData[], lastMove: string): "Russian" | "English" {
  const corpus =
    [lastMove, ...history.map((r) => `${r.playerMove} ${r.opponentMove ?? ""}`)]
      .join(" ");
  const cyr = (corpus.match(/[А-Яа-яЁё]/g) ?? []).length;
  const lat = (corpus.match(/[A-Za-z]/g) ?? []).length;
  return cyr >= lat ? "Russian" : "English";
}

function formatTranscript(history: RoundData[]): string {
  if (history.length === 0) return "(no rounds yet)";
  return history
    .map(
      (r) =>
        `Round ${r.round}\nMe: ${r.playerMove || "(no move yet)"}\nOpponent: ${r.opponentMove ?? "(no reply yet)"}`,
    )
    .join("\n\n");
}

export async function runHint(args: HintArgs): Promise<string> {
  const language = args.outputLanguage ?? detectLanguage(args.history, args.lastOpponentMove);
  const userPrompt = `Topic: "${args.topic}"
Output language: ${language}
You argue: ${args.mySide}
Opponent argues: ${args.opponentSide}

Transcript so far:
${formatTranscript(args.history)}

Opponent's latest line:
"${args.lastOpponentMove || "(opponent has not spoken yet)"}"

Give 2-3 short hint bullets I could base my next move on. No full sentences I would copy verbatim.`;

  try {
    const raw = await generateGeminiText({
      systemInstruction: HINT_SYSTEM,
      userPrompt,
      temperature: 0.55,
      maxOutputTokens: 320,
    });
    const cleaned = raw
      .replace(/^```(?:[a-z]+)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    if (!cleaned) return "- (no hint available right now)";
    return cleaned;
  } catch (err) {
    debatelyLog("gemini", "warn", "hint generation failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return "- (could not load hint, please try again)";
  }
}
