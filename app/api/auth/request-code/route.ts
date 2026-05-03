import { NextResponse } from "next/server";
import { normalizeDisplayName, normalizeEmail, maskEmail } from "@/lib/auth/email";
import { sendVerificationEmail } from "@/lib/auth/mailer";
import { startEmailVerification } from "@/lib/auth/db";
import { tryConsumeEmailCodeRequest } from "@/lib/auth/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  email?: string;
  displayName?: string;
};

export async function POST(request: Request) {
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  if (!tryConsumeEmailCodeRequest(email)) {
    return NextResponse.json(
      { error: "Too many login codes requested. Try again later." },
      { status: 429 },
    );
  }

  const displayName = normalizeDisplayName(body.displayName);
  try {
    const verification = startEmailVerification({ email, displayName });
    await sendVerificationEmail({ to: email, code: verification.code });
    return NextResponse.json({
      ok: true,
      email: maskEmail(email),
      expiresAt: verification.expiresAt,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not send verification code.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
