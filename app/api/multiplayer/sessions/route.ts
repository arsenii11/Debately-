import { NextResponse } from "next/server";
import { createSessionWithHost } from "@/lib/multiplayer/store";
import { publicView } from "@/lib/multiplayer/store";
import { hashPlayerToken } from "@/lib/multiplayer/store";
import { getClientKey, tryConsume } from "@/lib/multiplayer/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  nickname?: string;
};

export async function POST(request: Request) {
  const key = getClientKey(request);
  if (!tryConsume(key)) {
    return NextResponse.json(
      { error: "Too many sessions created. Try again later." },
      { status: 429 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }
  const nickname =
    typeof body.nickname === "string" ? body.nickname.trim().slice(0, 32) : "";

  try {
    const { session, slot, playerToken } = await createSessionWithHost({ nickname });
    return NextResponse.json({
      sessionId: session.id,
      slot,
      playerToken,
      session: publicView(session, hashPlayerToken(playerToken)),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create session." },
      { status: 400 },
    );
  }
}
