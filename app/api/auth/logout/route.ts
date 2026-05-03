import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { revokeSessionToken } from "@/lib/auth/db";
import {
  AUTH_SESSION_COOKIE,
  expiredSessionCookieOptions,
} from "@/lib/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE)?.value ?? null;
  revokeSessionToken(token);
  cookieStore.set(
    AUTH_SESSION_COOKIE,
    "",
    expiredSessionCookieOptions(request),
  );
  return NextResponse.json({ ok: true });
}

