import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  VISITOR_COOKIE_MAX_AGE_SEC,
  VISITOR_COOKIE_NAME,
  normalizeVisitorId,
} from "@/lib/visitorIdentity";
import { touchVisitor } from "@/lib/visitorRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  visitorId?: string;
};

function isSecureRequest(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto")?.trim().toLowerCase();
  if (proto === "https") return true;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  const cookieStore = await cookies();
  const cookieVisitorId = normalizeVisitorId(
    cookieStore.get(VISITOR_COOKIE_NAME)?.value,
  );
  const bodyVisitorId = normalizeVisitorId(body.visitorId);
  const visitorId = cookieVisitorId ?? bodyVisitorId;

  if (!visitorId) {
    return NextResponse.json({ error: "Missing visitor id." }, { status: 400 });
  }

  const record = touchVisitor(visitorId);

  if (!cookieVisitorId && bodyVisitorId) {
    cookieStore.set(VISITOR_COOKIE_NAME, bodyVisitorId, {
      path: "/",
      maxAge: VISITOR_COOKIE_MAX_AGE_SEC,
      sameSite: "lax",
      secure: isSecureRequest(request),
    });
  }

  return NextResponse.json({
    ok: true,
    visitorId: record.visitorId,
    firstSeenAt: record.firstSeenAt,
    lastSeenAt: record.lastSeenAt,
    isNew: record.isNew,
  });
}
