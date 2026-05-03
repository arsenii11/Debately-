import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSession, verifyEmailCode } from "@/lib/auth/db";
import {
  AUTH_SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  email?: string;
  code?: string;
};

export async function POST(request: Request) {
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    const user = verifyEmailCode({
      email: body.email ?? "",
      code: body.code ?? "",
    });
    const session = createSession(user.id);
    const cookieStore = await cookies();
    cookieStore.set(
      AUTH_SESSION_COOKIE,
      session.token,
      sessionCookieOptions(request),
    );
    return NextResponse.json({ ok: true, user, expiresAt: session.expiresAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not verify code.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

