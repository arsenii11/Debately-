import type { FactCheck, RoundData, Side } from "@/lib/types";

/** Opponent system prompt — Debately Solo spec §3.1 */
export function opponentSystemPrompt(opponentSide: Side): string {
  return `You are a skilled debater arguing the "${opponentSide}" side of a debate.
You are intelligent, well-informed, and argue like a real human would.

CRITICAL RULES:
- You MUST argue the ${opponentSide} position, but you are NOT a blind contrarian
- If the opponent makes a genuinely strong point backed by facts, PARTIALLY
  CONCEDE it — say "Fair point on X, but..." or "I'll grant that X is true,
  however..."
- A good debater concedes minor points to strengthen their main argument
- Never concede your core position, but acknowledge valid sub-arguments
- Use specific facts, data, statistics — be concrete, not vague
- Stay on topic. Respond directly to the opponent's latest argument
- Keep responses under 120 words. Be punchy, not rambling
- Sound human — natural language, occasional rhetorical questions,
  vary sentence length
- Do NOT use markdown, bullet points, or headers. Natural paragraphs only
- Do NOT start with "I" — vary your openings`;
}

function formatFactcheckLine(fc: FactCheck | null): string {
  if (!fc) return "(none)";
  return JSON.stringify({
    facts: fc.facts,
    relevance: fc.relevance,
    flags: fc.flags,
    flag_details: fc.flag_details,
  });
}

function formatCompletedRound(
  r: RoundData,
  playerSide: Side,
  opponentSide: Side,
): string {
  return `Round ${r.round}:
Player (${playerSide}): ${r.playerMove}
Judge factcheck (player): ${formatFactcheckLine(r.aiFactcheckPlayer)}
Opponent (${opponentSide}): ${r.opponentMove ?? "(pending)"}
Judge factcheck (opponent): ${formatFactcheckLine(r.aiFactcheckOpponent)}`;
}

/** Prior rounds only; last entry in history is the current (incomplete) round. */
export function formatOpponentTranscript(
  history: RoundData[],
  playerSide: Side,
  opponentSide: Side,
): string {
  if (history.length <= 1) {
    return "No prior rounds.";
  }
  return history
    .slice(0, -1)
    .map((r) => formatCompletedRound(r, playerSide, opponentSide))
    .join("\n\n");
}

export function opponentUserPrompt(params: {
  topic: string;
  opponentSide: Side;
  currentRound: number;
  totalRounds: number;
  transcript: string;
  lastPlayerMove: string;
}): string {
  return `Topic: "${params.topic}"
Your side: ${params.opponentSide}
Round: ${params.currentRound} of ${params.totalRounds}

Debate so far:
${params.transcript}

The player just argued:
"${params.lastPlayerMove}"

Respond with your counter-argument in at most 120 words.`;
}

/** Judge factcheck — spec §3.2 */
export const JUDGE_FACTCHECK_SYSTEM = `You are an impartial debate judge performing a factcheck on a single argument.

Your job:
1. Extract 1-3 specific factual claims from the text
2. For each claim, assess if it's:
   - "verified" — well-supported by reliable evidence
   - "disputed" — partially true or sources disagree
   - "false" — contradicted by well-established facts
3. Rate relevance 0-100: does this argument address the debate topic
   and respond to the opponent's previous points?
4. Flag logical fallacies if present:
   ad_hominem, strawman, whataboutism, tu_quoque,
   appeal_to_emotion, red_herring

IMPORTANT: Base factchecking on your training knowledge. If unsure,
mark as "disputed" rather than guessing.

Respond ONLY in valid JSON. No markdown fences, no preamble.`;

export function judgeFactcheckUserPrompt(params: {
  topic: string;
  side: Side;
  round: number;
  previousMoveText: string;
  moveText: string;
}): string {
  const prev =
    params.previousMoveText.trim() || "No previous argument";
  return `Topic: "${params.topic}"
Speaker side: ${params.side}
Round: ${params.round}
Previous opponent argument: "${prev}"

Argument to factcheck:
"${params.moveText}"

Return JSON:
{"facts":[{"claim":"...","status":"verified|disputed|false","comment":"..."}],
 "relevance":85,"flags":[],"flag_details":[]}`;
}

/** Final verdict — spec §3.3 */
export const JUDGE_VERDICT_SYSTEM = `You are an impartial debate judge. Evaluate the completed debate.
Score each side 0-100 based on:
- Factual accuracy (40%): were claims true?
- Logical consistency (25%): coherent argument chain?
- Relevance (20%): stayed on topic, addressed opponent?
- Rhetoric quality (15%): clarity, persuasiveness?

Penalize: -5 points per skipped turn (apply to the side that skipped: player skipped turns reduce player score).

You do NOT judge who has the "correct" political position.
You judge argumentation QUALITY.

Respond ONLY in valid JSON. No markdown, no preamble.`;

function formatRoundForVerdict(
  r: RoundData,
  playerSide: Side,
  opponentSide: Side,
): string {
  return `Round ${r.round}:
  Player (${playerSide}): ${JSON.stringify(r.playerMove)}
  Judge factcheck: ${formatFactcheckLine(r.aiFactcheckPlayer)}
  Opponent (${opponentSide}): ${JSON.stringify(r.opponentMove ?? "")}
  Judge factcheck: ${formatFactcheckLine(r.aiFactcheckOpponent)}`;
}

export function judgeVerdictUserPrompt(params: {
  topic: string;
  playerSide: Side;
  opponentSide: Side;
  history: RoundData[];
  skippedTurns: number;
}): string {
  const full = params.history
    .map((r) => formatRoundForVerdict(r, params.playerSide, params.opponentSide))
    .join("\n\n");

  return `Topic: "${params.topic}"
Player side: ${params.playerSide}
Opponent (AI) side: ${params.opponentSide}
Skipped turns (player timed out): ${params.skippedTurns} (−5 points per skip to player score)

Full transcript:
${full}

Return JSON:
{"score_player":67,"score_opponent":58,
 "breakdown":{"factual":[72,61],"logic":[68,55],
 "relevance":[94,79],"rhetoric":[52,63]},
 "summary":"3-4 sentences",
 "best_arg_player":"one sentence",
 "best_arg_opponent":"one sentence"}`;
}
