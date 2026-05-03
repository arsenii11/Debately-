import {
  AUTH_SESSION_COOKIE,
  AUTH_SESSION_MAX_AGE_SEC,
} from "@/lib/auth/db";

type CookieOptions = {
  path: string;
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
  priority: "high";
};

export function isSecureRequest(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto")?.trim().toLowerCase();
  if (proto === "https") return true;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function sessionCookieOptions(
  request: Request,
): CookieOptions {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    maxAge: AUTH_SESSION_MAX_AGE_SEC,
    priority: "high",
  };
}

export function expiredSessionCookieOptions(
  request: Request,
): CookieOptions {
  return {
    ...sessionCookieOptions(request),
    maxAge: 0,
  };
}

export { AUTH_SESSION_COOKIE };
