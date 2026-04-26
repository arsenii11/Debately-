import { NextResponse } from "next/server";
import { applyLike } from "@/lib/multiplayer/store";
import { jsonError, publicViewForRequest } from "@/lib/multiplayer/apiHelpers";
import type { Side } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type Body = { name?: string; round?: number; side?: string };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return jsonError("Name is required.", 400);
  if (name.length > 32) return jsonError("Name too long.", 400);

  const round = typeof body.round === "number" ? Math.floor(body.round) : 0;
  if (round < 1) return jsonError("Invalid round.", 400);

  const side = body.side === "FOR" || body.side === "AGAINST" ? (body.side as Side) : null;
  if (!side) return jsonError("side must be FOR or AGAINST.", 400);

  const result = applyLike({ sessionId: id, name, round, side });
  if (result.kind === "error") return jsonError(result.reason, 400);

  return NextResponse.json({ session: publicViewForRequest(result.session, request) });
}
