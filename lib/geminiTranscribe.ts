import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAuth } from "google-auth-library";
import { debatelyLog } from "@/lib/debatelyLog";
import { runSerializedGemini } from "@/lib/geminiQueue";
import { resolveGeminiApiKey } from "@/lib/geminiKey";

const VERTEX_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const DEFAULT_VERTEX_LOCATION = "us-central1";

let vertexAuth: GoogleAuth | null = null;

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

function getTranscribeModel(): string {
  const m =
    process.env.GEMINI_TRANSCRIBE_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    "gemini-2.5-flash";
  return m.replace(/^models\//, "");
}

function buildTranscribePrompt(hintLang?: string): string {
  const hint =
    hintLang && hintLang !== "auto"
      ? ` Likely language (BCP-47): ${hintLang}.`
      : "";
  return [
    "Transcribe the speech verbatim.",
    "Preserve each language as spoken; do not translate.",
    "Output only the transcribed words, no labels or quotes.",
    hint,
  ]
    .join("")
    .trim();
}

async function transcribeWithVertex(params: {
  mimeType: string;
  base64Audio: string;
  hintLang?: string;
  timeoutMs: number;
}): Promise<string> {
  const project = getVertexProjectId();
  const location = getVertexLocation();
  const token = await getVertexAccessToken();
  const model = getTranscribeModel();
  const url =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${project}` +
    `/locations/${location}/publishers/google/models/${model}:generateContent`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: params.mimeType,
              data: params.base64Audio,
            },
          },
          { text: buildTranscribePrompt(params.hintLang) },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 4096,
    },
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
      debatelyLog("transcribe", "error", "vertex transcribe failed", {
        status: res.status,
        snippet: raw.slice(0, 400),
      });
      throw new Error(`Vertex transcribe failed (${res.status})`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Vertex returned non-JSON: ${raw.slice(0, 200)}`);
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
      throw new Error("Empty transcription from Gemini");
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function transcribeWithApiKey(params: {
  mimeType: string;
  base64Audio: string;
  hintLang?: string;
  timeoutMs: number;
}): Promise<string> {
  const apiKey = await resolveGeminiApiKey();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: getTranscribeModel(),
    generationConfig: { temperature: 0, maxOutputTokens: 4096 },
  });
  const run = model.generateContent([
    {
      inlineData: {
        mimeType: params.mimeType,
        data: params.base64Audio,
      },
    },
    { text: buildTranscribePrompt(params.hintLang) },
  ]);
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Transcribe timeout")), params.timeoutMs);
  });
  const result = await Promise.race([run, timeout]);
  const text = result.response.text().trim();
  if (!text) throw new Error("Empty transcription from Gemini");
  return text;
}

function getTranscribeTimeoutMs(): number {
  const raw = process.env.GEMINI_TRANSCRIBE_TIMEOUT_MS?.trim();
  if (raw === undefined || raw === "") return 90_000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 15_000 ? Math.min(180_000, n) : 90_000;
}

export async function transcribeAudioWithGemini(params: {
  audioBytes: Buffer;
  mimeType: string;
  hintLang?: string;
}): Promise<string> {
  const mime = params.mimeType.split(";")[0]!.trim() || "audio/webm";
  const base64Audio = params.audioBytes.toString("base64");
  const timeoutMs = getTranscribeTimeoutMs();

  return runSerializedGemini(async () => {
    const useVertex = shouldUseVertexBackend();
    if (useVertex) {
      return transcribeWithVertex({
        mimeType: mime,
        base64Audio,
        hintLang: params.hintLang,
        timeoutMs,
      });
    }
    return transcribeWithApiKey({
      mimeType: mime,
      base64Audio,
      hintLang: params.hintLang,
      timeoutMs,
    });
  });
}
