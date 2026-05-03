import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { saveEncryptedUserDataForSession } from "@/lib/auth/db";
import { AUTH_SESSION_COOKIE } from "@/lib/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  progress?: unknown;
};

export async function POST(request: Request) {
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const cookieStore = await cookies();
  try {
    const saved = saveEncryptedUserDataForSession({
      token: cookieStore.get(AUTH_SESSION_COOKIE)?.value ?? null,
      namespace: "solo_progress",
      payload: body.progress ?? null,
    });
    if (!saved) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    return NextResponse.json({ ok: true, updatedAt: saved.updatedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save progress.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

