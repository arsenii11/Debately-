import type { ResponseSchema } from "@google/generative-ai";
import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from "@google/generative-ai";
import { debatelyLog } from "@/lib/debatelyLog";
import { runSerializedGemini } from "@/lib/geminiQueue";
import { resolveGeminiApiKey } from "@/lib/geminiKey";

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_REQUEST_TIMEOUT_MS = 65_000;
const DEFAULT_SEARCH_TIMEOUT_MS = 30_000;
/** Fewer attempts: each retry waits (capped); failing fast beats multi-minute hangs. */
const MAX_GEMINI_ATTEMPTS = 4;
const DEFAULT_SEARCH_MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Max ms to sleep before one retry (server may suggest ~60s; that kills UX). */
function getRetryMaxWaitMs(): number {
  const raw = process.env.GEMINI_RETRY_MAX_WAIT_MS?.trim();
  if (raw === undefined || raw === "") return 12_000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 500 ? Math.min(120_000, n) : 12_000;
}

function getRequestTimeoutMs(): number {
  const raw = process.env.GEMINI_REQUEST_TIMEOUT_MS?.trim();
  if (raw === undefined || raw === "") return DEFAULT_REQUEST_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 10_000
    ? Math.min(180_000, n)
    : DEFAULT_REQUEST_TIMEOUT_MS;
}

function getSearchTimeoutMs(defaultMs: number): number {
  const raw = process.env.GEMINI_SEARCH_TIMEOUT_MS?.trim();
  if (raw === undefined || raw === "") {
    return Math.min(defaultMs, DEFAULT_SEARCH_TIMEOUT_MS);
  }
  const n = Number(raw);
  return Number.isFinite(n) && n >= 8_000 ? Math.min(120_000, n) : Math.min(defaultMs, DEFAULT_SEARCH_TIMEOUT_MS);
}

function getSearchMaxAttempts(): number {
  const raw = process.env.GEMINI_SEARCH_MAX_ATTEMPTS?.trim();
  if (raw === undefined || raw === "") return DEFAULT_SEARCH_MAX_ATTEMPTS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.min(4, Math.floor(n)) : DEFAULT_SEARCH_MAX_ATTEMPTS;
}

/** Parse server retry hint from error message (429 / quota). Uncapped raw ms. */
function parseRetryDelayMsFromError(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const quoted = msg.match(/retryDelay["']?\s*:\s*"?(\d+(?:\.\d+)?)s/i);
  if (quoted) {
    return Math.ceil(parseFloat(quoted[1]) * 1000) + 500;
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
          return Math.ceil(parseFloat(d) * 1000) + 500;
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

function isRetryableTransientError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /aborted|timeout|timed out|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|network|empty response from gemini/i.test(
    msg,
  );
}

function buildSearchTool(): Record<string, unknown> {
  const mode = process.env.GEMINI_SEARCH_TOOL?.trim();
  if (mode === "googleSearchRetrieval") {
    return { googleSearchRetrieval: {} };
  }
  return { googleSearch: {} };
}

function isSearchToolConfigError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const mentionsSearch =
    /googleSearch|google_search|googleSearchRetrieval|tool/i.test(msg);
  const mentionsInvalid =
    /400|INVALID_ARGUMENT|unknown field|invalid|not supported|unrecognized/i.test(
      msg,
    );
  return mentionsSearch && mentionsInvalid;
}

export async function generateGeminiText(params: {
  systemInstruction: string;
  userPrompt: string;
  maxOutputTokens?: number;
  responseMimeType?: "text/plain" | "application/json";
  responseSchema?: ResponseSchema;
  temperature?: number;
  enableSearch?: boolean;
}): Promise<string> {
  return runSerializedGemini(async () => {
    const apiKey = await resolveGeminiApiKey();
    const modelName =
      process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
    const requestTimeoutMs = getRequestTimeoutMs();

    const genAI = new GoogleGenerativeAI(apiKey);
    const baseGenerationConfig = {
      ...(params.maxOutputTokens !== undefined
        ? { maxOutputTokens: params.maxOutputTokens }
        : {}),
      ...(params.temperature !== undefined
        ? { temperature: params.temperature }
        : {}),
    };
    const searchRequested = params.enableSearch ?? true;
    let searchEnabled = searchRequested;
    const maxAttempts = searchRequested
      ? Math.min(MAX_GEMINI_ATTEMPTS, getSearchMaxAttempts())
      : MAX_GEMINI_ATTEMPTS;
    const effectiveTimeoutMs = searchRequested
      ? getSearchTimeoutMs(requestTimeoutMs)
      : requestTimeoutMs;
    let loggedJsonSearchCompat = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const jsonWithSearch =
          searchEnabled && params.responseMimeType === "application/json";
        if (jsonWithSearch && !loggedJsonSearchCompat) {
          debatelyLog(
            "gemini",
            "warn",
            "search+json mime unsupported; using plain-text JSON mode",
            { model: modelName },
          );
          loggedJsonSearchCompat = true;
        }
        const generationConfig = {
          ...baseGenerationConfig,
          ...(!jsonWithSearch && params.responseMimeType
            ? { responseMimeType: params.responseMimeType }
            : {}),
          ...(!jsonWithSearch &&
          params.responseSchema &&
          params.responseMimeType === "application/json"
            ? { responseSchema: params.responseSchema }
            : {}),
        };
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: params.systemInstruction,
          generationConfig,
          ...(searchEnabled ? { tools: [buildSearchTool()] } : {}),
        } as any);
        const result = await model.generateContent(
          params.userPrompt,
          { timeout: effectiveTimeoutMs },
        );

        const text = result.response.text();
        if (!text?.trim()) {
          throw new Error("Empty response from Gemini");
        }
        return text;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (searchEnabled && isSearchToolConfigError(e)) {
          searchEnabled = false;
          debatelyLog("gemini", "warn", "search tool unavailable; fallback", {
            message: msg,
            model: modelName,
          });
          attempt -= 1;
          continue;
        }
        const retryable =
          isRetryableQuotaError(e) || isRetryableTransientError(e);
        if (attempt >= maxAttempts || !retryable) {
          debatelyLog("gemini", "error", "generateContent failed", {
            message: msg,
            model: modelName,
            hasSchema: Boolean(params.responseSchema),
            attempt,
            maxAttempts,
            searchRequested,
            searchEnabled,
            requestTimeoutMs: effectiveTimeoutMs,
          });
          throw e;
        }
        const maxWait = searchRequested
          ? Math.min(getRetryMaxWaitMs(), 2500)
          : getRetryMaxWaitMs();
        const hintedRaw = parseRetryDelayMsFromError(e);
        const expFallback = Math.min(
          maxWait,
          1500 * 2 ** (attempt - 1),
        );
        const backoff = Math.min(
          maxWait,
          hintedRaw ?? expFallback,
        );
        debatelyLog("gemini", "warn", "quota/rate limit — retrying", {
          attempt,
          nextInMs: backoff,
          hintFromServer: hintedRaw != null,
          ...(hintedRaw != null && hintedRaw > maxWait
            ? { serverHintMs: hintedRaw, cappedToMs: maxWait }
            : {}),
        });
        await sleep(backoff);
      }
    }
    throw new Error("Gemini: retry loop exhausted");
  });
}
