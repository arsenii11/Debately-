import type { ResponseSchema } from "@google/generative-ai";
import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from "@google/generative-ai";
import { GoogleAuth } from "google-auth-library";
import { debatelyLog } from "@/lib/debatelyLog";
import { runSerializedGemini } from "@/lib/geminiQueue";
import { resolveGeminiApiKey } from "@/lib/geminiKey";

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_REQUEST_TIMEOUT_MS = 65_000;
const DEFAULT_SEARCH_TIMEOUT_MS = 30_000;
const DEFAULT_VERTEX_LOCATION = "us-central1";
/** Fewer attempts: each retry waits (capped); failing fast beats multi-minute hangs. */
const MAX_GEMINI_ATTEMPTS = 4;
const DEFAULT_SEARCH_MAX_ATTEMPTS = 3;
const VERTEX_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

let vertexAuth: GoogleAuth | null = null;

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

function getVertexProjectId(): string {
  const project =
    process.env.GEMINI_VERTEX_PROJECT?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    process.env.GCP_PROJECT?.trim() ||
    "";
  if (!project) {
    throw new Error(
      "Missing Vertex project id. Set GEMINI_VERTEX_PROJECT (or GOOGLE_CLOUD_PROJECT/GCP_PROJECT).",
    );
  }
  return project;
}

function getVertexLocation(): string {
  return (
    process.env.GEMINI_VERTEX_LOCATION?.trim() ||
    process.env.GOOGLE_CLOUD_LOCATION?.trim() ||
    DEFAULT_VERTEX_LOCATION
  );
}

async function getVertexAccessToken(): Promise<string> {
  if (!vertexAuth) {
    vertexAuth = new GoogleAuth({ scopes: [VERTEX_SCOPE] });
  }
  const client = await vertexAuth.getClient();
  const tok = await client.getAccessToken();
  const token = typeof tok === "string" ? tok : tok?.token ?? "";
  if (!token) {
    throw new Error(
      "Could not acquire Vertex access token via ADC. Check service account/credentials.",
    );
  }
  return token;
}

async function generateWithVertex(params: {
  model: string;
  systemInstruction: string;
  userPrompt: string;
  generationConfig: Record<string, unknown>;
  enableSearch: boolean;
  timeoutMs: number;
}): Promise<string> {
  const project = getVertexProjectId();
  const location = getVertexLocation();
  const token = await getVertexAccessToken();
  const model = params.model.trim().replace(/^models\//, "");
  const url =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${project}` +
    `/locations/${location}/publishers/google/models/${model}:generateContent`;

  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: params.userPrompt }],
      },
    ],
    systemInstruction: {
      role: "system",
      parts: [{ text: params.systemInstruction }],
    },
    generationConfig: params.generationConfig,
    ...(params.enableSearch ? { tools: [buildSearchTool()] } : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`[Vertex AI ${res.status}] ${raw}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Vertex returned non-JSON response: ${raw.slice(0, 300)}`);
    }

    const parts =
      (parsed as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      }).candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) {
      throw new Error("Empty response from Gemini");
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
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
  if (e instanceof GoogleGenerativeAIFetchError) {
    if (e.status === 404) return true;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /404|not found|no longer available|unknown model|model .* unavailable/i.test(
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
    const useVertex = shouldUseVertexBackend();
    const apiKey = useVertex ? null : await resolveGeminiApiKey();
    const modelCandidates = getModelCandidates();
    const requestTimeoutMs = getRequestTimeoutMs();

    const genAI = useVertex ? null : new GoogleGenerativeAI(apiKey as string);
    const baseGenerationConfig = {
      ...(params.maxOutputTokens !== undefined
        ? { maxOutputTokens: params.maxOutputTokens }
        : {}),
      ...(params.temperature !== undefined
        ? { temperature: params.temperature }
        : {}),
    };
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
          const generationConfig = {
            ...baseGenerationConfig,
            ...(!jsonWithSearchUnsupported && params.responseMimeType
              ? { responseMimeType: params.responseMimeType }
              : {}),
            ...(!jsonWithSearchUnsupported &&
            params.responseSchema &&
            params.responseMimeType === "application/json"
              ? { responseSchema: params.responseSchema }
              : {}),
          };
          const effectiveTimeoutMs = searchEnabled
            ? getSearchTimeoutMs(requestTimeoutMs)
            : requestTimeoutMs;
          const text = useVertex
            ? await generateWithVertex({
                model: modelName,
                systemInstruction: params.systemInstruction,
                userPrompt: params.userPrompt,
                generationConfig,
                enableSearch: searchEnabled,
                timeoutMs: effectiveTimeoutMs,
              })
            : (
                await (genAI as GoogleGenerativeAI)
                  .getGenerativeModel({
                    model: modelName,
                    systemInstruction: params.systemInstruction,
                    generationConfig,
                    ...(searchEnabled ? { tools: [buildSearchTool()] } : {}),
                  } as any)
                  .generateContent(params.userPrompt, {
                    timeout: effectiveTimeoutMs,
                  })
              ).response.text();
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
