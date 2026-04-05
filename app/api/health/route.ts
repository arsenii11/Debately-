import { NextResponse } from "next/server";

/** Public diagnostics: open GET /api/health in browser or curl — no secrets exposed. */
export async function GET() {
  const hasKey = Boolean(process.env.GEMINI_API_KEY?.trim());
  const hasSecret = Boolean(process.env.GEMINI_API_KEY_SECRET_RESOURCE?.trim());
  return NextResponse.json({
    ok: true,
    geminiConfigured: hasKey || hasSecret,
    timestamp: new Date().toISOString(),
  });
}
