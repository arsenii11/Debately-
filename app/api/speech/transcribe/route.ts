import { NextResponse } from "next/server";
import { transcribeAudioWithGemini } from "@/lib/geminiTranscribe";

const MAX_BYTES = 15 * 1024 * 1024;

const ALLOWED_PREFIXES = [
  "audio/",
  "video/webm",
];

function isAllowedMime(m: string): boolean {
  const lower = m.split(";")[0]!.trim().toLowerCase();
  if (ALLOWED_PREFIXES.some((p) => lower.startsWith(p))) return true;
  return lower === "application/ogg";
}

export async function POST(request: Request) {
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data" },
        { status: 400 },
      );
    }

    const form = await request.formData();
    const file = form.get("audio");
    const hintRaw = form.get("hintLang");
    const hintLang =
      typeof hintRaw === "string" && hintRaw.trim().length > 0
        ? hintRaw.trim().slice(0, 32)
        : undefined;

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Audio too large (max ~15 MB)" },
        { status: 413 },
      );
    }

    const mimeType = file.type || "audio/webm";
    if (!isAllowedMime(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported audio type: ${mimeType}` },
        { status: 415 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const text = await transcribeAudioWithGemini({
      audioBytes: buf,
      mimeType,
      hintLang:
        hintLang && hintLang !== "auto" ? hintLang : undefined,
    });

    return NextResponse.json({ text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transcription failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
