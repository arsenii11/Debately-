import { SchemaType } from "@google/generative-ai";
import type { ResponseSchema } from "@google/generative-ai";

/** Forces valid JSON shape for judge factcheck (Gemini structured output). */
export const FACTCHECK_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    facts: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          claim: { type: SchemaType.STRING },
          status: { type: SchemaType.STRING },
          comment: { type: SchemaType.STRING },
        },
        required: ["claim", "status", "comment"],
      },
    },
    relevance: { type: SchemaType.NUMBER },
    flags: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    flag_details: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: ["facts", "relevance", "flags", "flag_details"],
};

/** Structured JSON for opponent replies. */
export const OPPONENT_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    text: { type: SchemaType.STRING },
  },
  required: ["text"],
};

/** Structured JSON for final verdict (Gemini). */
export const VERDICT_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    score_player: { type: SchemaType.NUMBER },
    score_opponent: { type: SchemaType.NUMBER },
    breakdown: {
      type: SchemaType.OBJECT,
      properties: {
        factual: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.NUMBER },
        },
        logic: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.NUMBER },
        },
        relevance: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.NUMBER },
        },
        rhetoric: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.NUMBER },
        },
      },
      required: ["factual", "logic", "relevance", "rhetoric"],
    },
    summary: { type: SchemaType.STRING },
    best_arg_player: { type: SchemaType.STRING },
    best_arg_opponent: { type: SchemaType.STRING },
  },
  required: [
    "score_player",
    "score_opponent",
    "breakdown",
    "summary",
    "best_arg_player",
    "best_arg_opponent",
  ],
};
