import type { MessageContent } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogle } from "@langchain/google/node";
import { resolveGeminiApiKey } from "@/lib/geminiKey";
import type { GeminiResponseSchema } from "@/lib/geminiSchemas";

const DEFAULT_VERTEX_LOCATION = "us-central1";
const VERTEX_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

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

function buildSearchTool(): Record<string, unknown> {
  const mode = process.env.GEMINI_SEARCH_TOOL?.trim();
  if (mode === "googleSearchRetrieval") {
    return { googleSearchRetrieval: {} };
  }
  return { googleSearch: {} };
}

function extractMessageText(message: unknown): string {
  const maybeText = (message as { text?: unknown }).text;
  if (typeof maybeText === "string") return maybeText.trim();

  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const text = (part as { text?: unknown }).text;
          if (typeof text === "string") return text;
        }
        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

export async function generateWithLangChainGoogle(params: {
  model: string;
  systemInstruction: string;
  userPrompt: string;
  maxOutputTokens?: number;
  responseSchema?: GeminiResponseSchema;
  temperature?: number;
  enableSearch: boolean;
  timeoutMs: number;
  useVertex: boolean;
  apiKey: string | null;
}): Promise<string> {
  const model = params.model.trim().replace(/^models\//, "");
  const chat = new ChatGoogle({
    model,
    ...(params.maxOutputTokens !== undefined
      ? { maxOutputTokens: params.maxOutputTokens }
      : {}),
    ...(params.temperature !== undefined
      ? { temperature: params.temperature }
      : {}),
    ...(params.responseSchema
      ? { responseSchema: params.responseSchema as Record<string, unknown> }
      : {}),
    ...(params.useVertex
      ? {
          platformType: "gcp" as const,
          vertexai: true,
          location: getVertexLocation(),
          googleAuthOptions: {
            projectId: getVertexProjectId(),
            scopes: [VERTEX_SCOPE],
          },
        }
      : { apiKey: params.apiKey ?? undefined }),
  });
  const runnable = params.enableSearch
    ? chat.bindTools([buildSearchTool() as never])
    : chat;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const result = await runnable.invoke(
      [
        new SystemMessage(params.systemInstruction),
        new HumanMessage(params.userPrompt),
      ],
      { signal: controller.signal },
    );
    const text = extractMessageText(result);
    if (!text) {
      throw new Error("Empty response from LangChain Gemini");
    }
    return text;
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error("LangChain Gemini request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function transcribeWithLangChainGoogle(params: {
  model: string;
  mimeType: string;
  base64Audio: string;
  prompt: string;
  timeoutMs: number;
  useVertex: boolean;
}): Promise<string> {
  const apiKey = params.useVertex ? null : await resolveGeminiApiKey();
  const chat = new ChatGoogle({
    model: params.model.trim().replace(/^models\//, ""),
    temperature: 0,
    maxOutputTokens: 4096,
    ...(params.useVertex
      ? {
          platformType: "gcp" as const,
          vertexai: true,
          location: getVertexLocation(),
          googleAuthOptions: {
            projectId: getVertexProjectId(),
            scopes: [VERTEX_SCOPE],
          },
        }
      : { apiKey: apiKey ?? undefined }),
  });

  const content = [
    {
      type: "audio",
      source_type: "base64",
      mime_type: params.mimeType,
      data: params.base64Audio,
    },
    { type: "text", text: params.prompt },
  ] as MessageContent;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const result = await chat.invoke(
      [new HumanMessage({ content })],
      { signal: controller.signal },
    );
    const text = extractMessageText(result);
    if (!text) {
      throw new Error("Empty transcription from LangChain Gemini");
    }
    return text;
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error("LangChain Gemini transcription timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
