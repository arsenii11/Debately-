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
