import { debatelyLog } from "@/lib/debatelyLog";
import { runSerializedGemini } from "@/lib/geminiQueue";
import { resolveGeminiApiKey } from "@/lib/geminiKey";
import { generateWithLangChainGoogle } from "@/lib/langchainGemini";
import type { GeminiResponseSchema } from "@/lib/geminiSchemas";

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

function getModelCandidates(): string[] {
  const explicit =
    process.env.GEMINI_MODELS?.trim() ?? process.env.MODELS?.trim();
  if (explicit) {
    const models = explicit
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (models.length > 0) return Array.from(new Set(models));
  }

  // Backward-compatible fallback for older deployments that still provide
  // a single-model variable instead of MODELS.
  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return Array.from(new Set([primary, ...fallbacks]));
}

function shouldUseVertexBackend(): boolean {
  const raw = process.env.GEMINI_USE_VERTEX?.trim().toLowerCase();
  if (!raw) return true;
  return !["0", "false", "no", "off"].includes(raw);
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
  const msg = e instanceof Error ? e.message : String(e);
  return /429|503|Too Many Requests|Service Unavailable|RESOURCE_EXHAUSTED|quota exceeded/i.test(
    msg,
  );
}

function isRetryableTransientError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /aborted|timeout|timed out|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|network|empty response from gemini/i.test(
    msg,
  );
}

function isModelUnavailableError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /404|not found|no longer available|unknown model|model .* unavailable/i.test(
    msg,
  );
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
  responseSchema?: GeminiResponseSchema;
  temperature?: number;
  enableSearch?: boolean;
}): Promise<string> {
  return runSerializedGemini(async () => {
    const useVertex = shouldUseVertexBackend();
    const apiKey = useVertex ? null : await resolveGeminiApiKey();
    const modelCandidates = getModelCandidates();
    const requestTimeoutMs = getRequestTimeoutMs();

    const searchRequested = params.enableSearch ?? true;
    const maxAttempts = searchRequested
      ? Math.min(MAX_GEMINI_ATTEMPTS, getSearchMaxAttempts())
      : MAX_GEMINI_ATTEMPTS;
    let lastError: unknown = new Error("Gemini: retry loop exhausted");

    for (let modelIdx = 0; modelIdx < modelCandidates.length; modelIdx++) {
      const modelName = modelCandidates[modelIdx]!;
      let searchEnabled = searchRequested;
      let loggedJsonSearchCompat = false;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          // Both public Gemini API and Vertex reject controlled generation
          // (responseMimeType/responseSchema=json) when used together with the
          // Search tool. Drop responseMimeType/Schema in that case so we don't
          // waste a 400 round-trip.
          const jsonWithSearchUnsupported =
            searchEnabled &&
            params.responseMimeType === "application/json";
          if (jsonWithSearchUnsupported && !loggedJsonSearchCompat) {
            debatelyLog(
              "gemini",
              "warn",
              "search+json mime unsupported; using plain-text JSON mode",
              { model: modelName },
            );
            loggedJsonSearchCompat = true;
          }
          const effectiveResponseSchema =
            !jsonWithSearchUnsupported &&
            params.responseSchema &&
            params.responseMimeType === "application/json"
              ? params.responseSchema
              : undefined;
          const effectiveTimeoutMs = searchEnabled
            ? getSearchTimeoutMs(requestTimeoutMs)
            : requestTimeoutMs;
          const text = await generateWithLangChainGoogle({
            model: modelName,
            systemInstruction: params.systemInstruction,
            userPrompt: params.userPrompt,
            maxOutputTokens: params.maxOutputTokens,
            responseSchema: effectiveResponseSchema,
            temperature: params.temperature,
            enableSearch: searchEnabled,
            timeoutMs: effectiveTimeoutMs,
            useVertex,
            apiKey,
          });
          if (!text?.trim()) {
            throw new Error("Empty response from Gemini");
          }
          return text;
        } catch (e) {
          lastError = e;
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
          if (attempt >= maxAttempts && retryable && searchEnabled) {
            // Search path can be unstable under provider load; retry once more without search.
            debatelyLog("gemini", "warn", "search retries exhausted; retrying without search", {
              model: modelName,
              attempt,
              maxAttempts,
              message: msg,
            });
            searchEnabled = false;
            attempt = 0;
            continue;
          }
          if (attempt >= maxAttempts || !retryable) {
            const hasNextModel = modelIdx < modelCandidates.length - 1;
            const unavailable = isModelUnavailableError(e);
            if ((retryable || unavailable) && hasNextModel) {
              debatelyLog("gemini", "warn", "switching to next model candidate", {
                fromModel: modelName,
                toModel: modelCandidates[modelIdx + 1],
                attempt,
                maxAttempts,
                searchRequested,
                searchEnabled,
                message: msg,
                ...(unavailable ? { reason: "model_unavailable" } : {}),
              });
              break;
            }
            debatelyLog("gemini", "error", "generateContent failed", {
              message: msg,
              model: modelName,
              hasSchema: Boolean(params.responseSchema),
              attempt,
              maxAttempts,
              searchRequested,
              searchEnabled,
              requestTimeoutMs: searchEnabled
                ? getSearchTimeoutMs(requestTimeoutMs)
                : requestTimeoutMs,
            });
            throw e;
          }
          const maxWait = searchEnabled
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
            model: modelName,
            hintFromServer: hintedRaw != null,
            ...(hintedRaw != null && hintedRaw > maxWait
              ? { serverHintMs: hintedRaw, cappedToMs: maxWait }
              : {}),
          });
          await sleep(backoff);
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Gemini: retry loop exhausted");
  });
}
