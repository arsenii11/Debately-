/**
 * Integration tests — require a live Gemini/Vertex connection.
 * Run with:  npm run test:ai
 *
 * Env vars needed (same as the app):
 *   GEMINI_API_KEY              — direct Gemini API
 *   or
 *   GEMINI_USE_VERTEX=true + GOOGLE_APPLICATION_CREDENTIALS + GEMINI_VERTEX_PROJECT
 */
import { afterEach, describe, expect, it } from "vitest";

// Small pause between AI calls to spread quota usage.
const COOLDOWN_MS = 4_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
import {
  isFactcheckFallback,
  parseFactcheckJson,
} from "@/lib/factcheckFallback";
import {
  isVerdictFallback,
  parseVerdictJson,
} from "@/lib/verdictParse";
import { generateGeminiText } from "@/lib/gemini";
import {
  opponentSystemPrompt,
  opponentUserPrompt,
  JUDGE_FACTCHECK_SYSTEM,
  judgeFactcheckUserPrompt,
  JUDGE_VERDICT_SYSTEM,
  judgeVerdictUserPrompt,
} from "@/lib/prompts";

const TOPIC = "Remote work is better than working from the office";
const PLAYER_SIDE = "FOR" as const;
const OPPONENT_SIDE = "AGAINST" as const;

const PLAYER_MOVE_1 =
  "Remote work eliminates daily commutes, saving employees hours each week " +
  "and significantly reducing stress. Stanford research found a 13% productivity " +
  "boost for remote workers, and surveys show most employees prefer it for focus and flexibility.";

// Generous timeouts — AI calls can take 15–30 s under load.
const TIMEOUT_MS = 60_000;

afterEach(async () => {
  await sleep(COOLDOWN_MS);
});

describe("AI: opponent response (Round 1)", { timeout: TIMEOUT_MS }, () => {
  it("returns non-empty text that is not the failure fallback", async () => {
    const raw = await generateGeminiText({
      systemInstruction: opponentSystemPrompt(OPPONENT_SIDE),
      userPrompt: opponentUserPrompt({
        topic: TOPIC,
        opponentSide: OPPONENT_SIDE,
        playerSide: PLAYER_SIDE,
        currentRound: 1,
        totalRounds: 3,
        turnTimerSeconds: 0,
        transcript: "No prior rounds.",
        lastPlayerMove: PLAYER_MOVE_1,
      }),
      maxOutputTokens: 1040,
      responseMimeType: "application/json",
    });

    let text: string;
    try {
      const parsed = JSON.parse(raw) as { text?: unknown };
      text = typeof parsed.text === "string" ? parsed.text : raw;
    } catch {
      text = raw;
    }

    expect(text.trim().length).toBeGreaterThan(20);
    expect(text).not.toContain("failed to respond");
    expect(text).not.toContain("Debately failed");
  });

  it("response stays within a reasonable word budget", async () => {
    const raw = await generateGeminiText({
      systemInstruction: opponentSystemPrompt(OPPONENT_SIDE),
      userPrompt: opponentUserPrompt({
        topic: TOPIC,
        opponentSide: OPPONENT_SIDE,
        playerSide: PLAYER_SIDE,
        currentRound: 1,
        totalRounds: 3,
        turnTimerSeconds: 120,
        transcript: "No prior rounds.",
        lastPlayerMove: PLAYER_MOVE_1,
      }),
      maxOutputTokens: 1040,
      responseMimeType: "application/json",
    });

    let text: string;
    try {
      const parsed = JSON.parse(raw) as { text?: unknown };
      text = typeof parsed.text === "string" ? parsed.text : raw;
    } catch {
      text = raw;
    }

    const wordCount = text.trim().split(/\s+/).length;
    // 120 s timer → soft max ~120 words. Allow generous upper bound.
    expect(wordCount).toBeLessThan(400);
    expect(wordCount).toBeGreaterThan(10);
  });
});

describe("AI: factcheck (player move, Round 1)", { timeout: TIMEOUT_MS }, () => {
  it("parses to a valid non-fallback FactCheck", async () => {
    const raw = await generateGeminiText({
      systemInstruction: JUDGE_FACTCHECK_SYSTEM,
      userPrompt: judgeFactcheckUserPrompt({
        topic: TOPIC,
        side: PLAYER_SIDE,
        round: 1,
        previousMoveText: "No previous argument",
        moveText: PLAYER_MOVE_1,
        outputLanguage: "English",
      }),
      maxOutputTokens: 1800,
      responseMimeType: "application/json",
      temperature: 0.35,
    });

    const fc = parseFactcheckJson(raw);
    expect(isFactcheckFallback(fc)).toBe(false);
    expect(fc.facts.length).toBeGreaterThan(0);
    expect(fc.relevance).toBeGreaterThanOrEqual(0);
    expect(fc.relevance).toBeLessThanOrEqual(100);
  });

  it("every fact has a non-empty claim and a valid status", async () => {
    const raw = await generateGeminiText({
      systemInstruction: JUDGE_FACTCHECK_SYSTEM,
      userPrompt: judgeFactcheckUserPrompt({
        topic: TOPIC,
        side: PLAYER_SIDE,
        round: 1,
        previousMoveText: "No previous argument",
        moveText: PLAYER_MOVE_1,
        outputLanguage: "English",
      }),
      maxOutputTokens: 1800,
      responseMimeType: "application/json",
      temperature: 0.35,
    });

    const fc = parseFactcheckJson(raw);
    const VALID_STATUSES = new Set(["verified", "disputed", "false"]);

    for (const fact of fc.facts) {
      expect(fact.claim.trim().length).toBeGreaterThan(0);
      expect(VALID_STATUSES.has(fact.status)).toBe(true);
    }
  });
});

describe("AI: factcheck robustness — short and empty arguments", { timeout: TIMEOUT_MS }, () => {
  it("handles a bare one-word argument without throwing", async () => {
    const raw = await generateGeminiText({
      systemInstruction: JUDGE_FACTCHECK_SYSTEM,
      userPrompt: judgeFactcheckUserPrompt({
        topic: TOPIC,
        side: PLAYER_SIDE,
        round: 1,
        previousMoveText: "No previous argument",
        moveText: "Yes.",
        outputLanguage: "English",
      }),
      maxOutputTokens: 1800,
      responseMimeType: "application/json",
      temperature: 0.35,
    });

    const fc = parseFactcheckJson(raw);
    // A one-word argument should score very low.
    expect(fc.relevance).toBeLessThanOrEqual(25);
  });
});

describe("AI: verdict (1-round debate)", { timeout: TIMEOUT_MS }, () => {
  it("parses to a valid non-fallback Verdict", async () => {
    const history = [
      {
        round: 1,
        playerMove: PLAYER_MOVE_1,
        aiFactcheckPlayer: {
          facts: [{ claim: "Stanford 13% productivity boost", status: "disputed" as const, comment: "Often cited but context-dependent." }],
          relevance: 62,
          flags: [],
          flag_details: [],
        },
        opponentMove:
          "In-person collaboration enables spontaneous brainstorming that no video call can replicate. " +
          "Google and Apple brought workers back for exactly that reason — the serendipitous hallway conversation " +
          "that sparks the next breakthrough simply does not happen over Slack.",
        aiFactcheckOpponent: {
          facts: [{ claim: "Google/Apple returned to office for collaboration", status: "verified" as const, comment: "Both mandated return-to-office policies." }],
          relevance: 74,
          flags: [],
          flag_details: [],
        },
      },
    ];

    const raw = await generateGeminiText({
      systemInstruction: JUDGE_VERDICT_SYSTEM,
      userPrompt: judgeVerdictUserPrompt({
        topic: TOPIC,
        playerSide: PLAYER_SIDE,
        opponentSide: OPPONENT_SIDE,
        history,
        skippedTurns: 0,
      }),
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      temperature: 0.35,
    });

    const v = parseVerdictJson(raw);
    expect(isVerdictFallback(v)).toBe(false);
    expect(v.score_player).toBeGreaterThanOrEqual(0);
    expect(v.score_player).toBeLessThanOrEqual(100);
    expect(v.score_opponent).toBeGreaterThanOrEqual(0);
    expect(v.score_opponent).toBeLessThanOrEqual(100);
    expect(v.summary.trim().length).toBeGreaterThan(10);
    expect(v.best_arg_player.trim().length).toBeGreaterThan(5);
    expect(v.best_arg_opponent.trim().length).toBeGreaterThan(5);
  });

  it("breakdown scores are all within 0–100", async () => {
    const history = [
      {
        round: 1,
        playerMove: PLAYER_MOVE_1,
        aiFactcheckPlayer: null,
        opponentMove: "In-person work drives collaboration and innovation that remote setups cannot match.",
        aiFactcheckOpponent: null,
      },
    ];

    const raw = await generateGeminiText({
      systemInstruction: JUDGE_VERDICT_SYSTEM,
      userPrompt: judgeVerdictUserPrompt({
        topic: TOPIC,
        playerSide: PLAYER_SIDE,
        opponentSide: OPPONENT_SIDE,
        history,
        skippedTurns: 0,
      }),
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      temperature: 0.35,
    });

    const v = parseVerdictJson(raw);
    if (isVerdictFallback(v)) return;

    const allScores = [
      ...v.breakdown.factual,
      ...v.breakdown.logic,
      ...v.breakdown.relevance,
      ...v.breakdown.rhetoric,
    ];
    for (const s of allScores) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });
});
