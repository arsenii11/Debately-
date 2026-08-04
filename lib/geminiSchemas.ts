export type GeminiResponseSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
};

/** Forces valid JSON shape for judge factcheck (LangChain structured output). */
export const FACTCHECK_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          status: { type: "string" },
          comment: { type: "string" },
        },
        required: ["claim", "status", "comment"],
      },
    },
    relevance: { type: "number" },
    flags: {
      type: "array",
      items: { type: "string" },
    },
    flag_details: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["facts", "relevance", "flags", "flag_details"],
} satisfies GeminiResponseSchema;

/** Structured JSON for opponent replies. */
export const OPPONENT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string" },
  },
  required: ["text"],
} satisfies GeminiResponseSchema;

/** Structured JSON for final verdict. */
export const VERDICT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    score_player: { type: "number" },
    score_opponent: { type: "number" },
    breakdown: {
      type: "object",
      properties: {
        factual: {
          type: "array",
          items: { type: "number" },
        },
        logic: {
          type: "array",
          items: { type: "number" },
        },
        relevance: {
          type: "array",
          items: { type: "number" },
        },
        rhetoric: {
          type: "array",
          items: { type: "number" },
        },
      },
      required: ["factual", "logic", "relevance", "rhetoric"],
    },
    summary: { type: "string" },
    best_arg_player: { type: "string" },
    best_arg_opponent: { type: "string" },
  },
  required: [
    "score_player",
    "score_opponent",
    "breakdown",
    "summary",
    "best_arg_player",
    "best_arg_opponent",
  ],
} satisfies GeminiResponseSchema;
