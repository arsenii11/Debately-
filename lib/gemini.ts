import type { ResponseSchema } from "@google/generative-ai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { resolveGeminiApiKey } from "@/lib/geminiKey";

const DEFAULT_MODEL = "gemini-2.5-flash";
const REQUEST_TIMEOUT_MS = 45_000;

export async function generateGeminiText(params: {
  systemInstruction: string;
  userPrompt: string;
  maxOutputTokens: number;
  responseMimeType?: "text/plain" | "application/json";
  responseSchema?: ResponseSchema;
  temperature?: number;
}): Promise<string> {
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

  const result = await model.generateContent(
    params.userPrompt,
    { timeout: REQUEST_TIMEOUT_MS },
  );

  const text = result.response.text();
  if (!text?.trim()) {
    throw new Error("Empty response from Gemini");
  }
  return text;
}
