import { NextResponse } from "next/server";
import { joinExistingSession, hashPlayerToken } from "@/lib/multiplayer/store";
import { publicView } from "@/lib/multiplayer/store";
import { readPlayerToken } from "@/lib/multiplayer/apiHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type Body = { nickname?: string };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }
  const nickname =
    typeof body.nickname === "string" ? body.nickname.trim().slice(0, 32) : "";
  if (!nickname) {
    return NextResponse.json({ error: "Nickname required." }, { status: 400 });
  }
  const existingToken = readPlayerToken(request);
  const result = joinExistingSession({
    sessionId: id,
    nickname,
    existingToken,
  });
  if (result.kind === "error") {
    const status = result.reason === "Session not found." ? 404 : 403;
    return NextResponse.json({ error: result.reason }, { status });
  }
  if (result.kind === "already") {
    const tokenHash = existingToken ? hashPlayerToken(existingToken) : null;
    return NextResponse.json({
      sessionId: id,
      slot: result.slot,
      playerToken: existingToken,
      session: publicView(result.session, tokenHash),
    });
  }
  return NextResponse.json({
    sessionId: id,
    slot: result.slot,
    playerToken: result.playerToken,
    session: publicView(result.session, hashPlayerToken(result.playerToken)),
  });
}
