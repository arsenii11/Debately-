import { runSerializedGemini } from "@/lib/geminiQueue";
import { transcribeWithLangChainGoogle } from "@/lib/langchainGemini";

function shouldUseVertexBackend(): boolean {
  const raw = process.env.GEMINI_USE_VERTEX?.trim().toLowerCase();
  if (!raw) return true;
  return !["0", "false", "no", "off"].includes(raw);
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

  return runSerializedGemini(() =>
    transcribeWithLangChainGoogle({
      model: getTranscribeModel(),
      mimeType: mime,
      base64Audio,
      prompt: buildTranscribePrompt(params.hintLang),
      timeoutMs,
      useVertex: shouldUseVertexBackend(),
    }),
  );
}
