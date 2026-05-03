import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserBySessionToken } from "@/lib/auth/db";
import { AUTH_SESSION_COOKIE } from "@/lib/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const user = getUserBySessionToken(
    cookieStore.get(AUTH_SESSION_COOKIE)?.value ?? null,
  );
  return NextResponse.json({ user });
}

