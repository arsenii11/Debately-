import { NextResponse } from "next/server";
import { applyComposerDraft } from "@/lib/multiplayer/store";
import {
  jsonError,
  publicViewForRequest,
  requireSlot,
} from "@/lib/multiplayer/apiHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type Body = { wordCount?: number };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await requireSlot(id, request);
  if (!auth.ok) return jsonError(auth.reason, auth.status);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const raw =
    typeof body.wordCount === "number" && Number.isFinite(body.wordCount)
      ? body.wordCount
      : 0;

  const result = await applyComposerDraft({
    sessionId: id,
    slot: auth.slot,
    wordCount: raw,
  });
  if (result.kind === "error") return jsonError(result.reason, 400);

  return NextResponse.json({
    session: publicViewForRequest(result.session, request),
  });
}
