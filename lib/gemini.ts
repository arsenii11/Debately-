import type { ResponseSchema } from "@google/generative-ai";
import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from "@google/generative-ai";
import { debatelyLog } from "@/lib/debatelyLog";
import { runSerializedGemini } from "@/lib/geminiQueue";
import { resolveGeminiApiKey } from "@/lib/geminiKey";

const DEFAULT_MODEL = "gemini-2.5-flash";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_GEMINI_ATTEMPTS = 6;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Parse server retry hint from error message (429 / quota). */
function parseRetryDelayMsFromError(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const quoted = msg.match(/retryDelay["']?\s*:\s*"?(\d+(?:\.\d+)?)s/i);
  if (quoted) {
    return Math.min(120_000, Math.ceil(parseFloat(quoted[1]) * 1000) + 500);
  }
  const brace = msg.indexOf("{");
  if (brace !== -1) {
    try {
      const end = msg.lastIndexOf("}");
      if (end > brace) {
        const o = JSON.parse(msg.slice(brace, end + 1)) as {
          error?: { details?: Array<{ retryDelay?: string }> };
        };
        const d = o.error?.details?.find((x) => x?.retryDelay)?.retryDelay;
        if (d?.endsWith("s")) {
          return Math.min(120_000, Math.ceil(parseFloat(d) * 1000) + 500);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function isRetryableQuotaError(e: unknown): boolean {
  if (e instanceof GoogleGenerativeAIFetchError) {
    const s = e.status;
    return s === 429 || s === 503;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /429|Too Many Requests|RESOURCE_EXHAUSTED|quota exceeded/i.test(msg);
}

export async function generateGeminiText(params: {
  systemInstruction: string;
  userPrompt: string;
  maxOutputTokens: number;
  responseMimeType?: "text/plain" | "application/json";
  responseSchema?: ResponseSchema;
  temperature?: number;
}): Promise<string> {
  return runSerializedGemini(async () => {
    const apiKey = await resolveGeminiApiKey();
    const modelName =
      process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: params.systemInstruction,
      generationConfig: {
        maxOutputTokens: params.maxOutputTokens,
        ...(params.temperature !== undefined
          ? { temperature: params.temperature }
          : {}),
        ...(params.responseMimeType
          ? { responseMimeType: params.responseMimeType }
          : {}),
        ...(params.responseSchema && params.responseMimeType === "application/json"
          ? { responseSchema: params.responseSchema }
          : {}),
      },
    });

    for (let attempt = 1; attempt <= MAX_GEMINI_ATTEMPTS; attempt++) {
      try {
        const result = await model.generateContent(
          params.userPrompt,
          { timeout: REQUEST_TIMEOUT_MS },
        );

        const text = result.response.text();
        if (!text?.trim()) {
          throw new Error("Empty response from Gemini");
        }
        return text;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (attempt >= MAX_GEMINI_ATTEMPTS || !isRetryableQuotaError(e)) {
          debatelyLog("gemini", "error", "generateContent failed", {
            message: msg,
            model: modelName,
            hasSchema: Boolean(params.responseSchema),
            attempt,
          });
          throw e;
        }
        const fromServer = parseRetryDelayMsFromError(e);
        const backoff = Math.min(
          90_000,
          fromServer ?? 1500 * 2 ** (attempt - 1),
        );
        debatelyLog("gemini", "warn", "quota/rate limit — retrying", {
          attempt,
          nextInMs: backoff,
          hintFromServer: fromServer != null,
        });
        await sleep(backoff);
      }
    }
    throw new Error("Gemini: retry loop exhausted");
  });
}
