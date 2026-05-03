"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthUser } from "@/lib/auth/types";

type Props = {
  nickname: string;
  onNickname: (value: string) => void;
};

type MeResponse = {
  user: AuthUser | null;
};

type RequestCodeResponse = {
  ok?: boolean;
  email?: string;
  expiresAt?: string;
  error?: string;
};

type VerifyResponse = {
  ok?: boolean;
  user?: AuthUser;
  error?: string;
};

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const maybeError = data as { error?: string };
    throw new Error(maybeError.error || res.statusText);
  }
  return data;
}

export function AuthCard({ nickname, onNickname }: Props) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const refreshMe = useCallback(async () => {
    try {
      const data = await readJson<MeResponse>(await fetch("/api/auth/me"));
      setUser(data.user);
      if (data.user?.displayName && !nickname.trim()) {
        onNickname(data.user.displayName);
      }
    } catch {
      setUser(null);
    } finally {
      setHydrated(true);
    }
  }, [nickname, onNickname]);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const requestCode = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await readJson<RequestCodeResponse>(
        await fetch("/api/auth/request-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            displayName: nickname,
          }),
        }),
      );
      setMaskedEmail(data.email ?? email);
      setExpiresAt(data.expiresAt ?? null);
      setNotice("Code sent. Check your inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code.");
    } finally {
      setBusy(false);
    }
  }, [email, nickname]);

  const verifyCode = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await readJson<VerifyResponse>(
        await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code }),
        }),
      );
      const nextUser = data.user ?? null;
      setUser(nextUser);
      if (nextUser?.displayName) onNickname(nextUser.displayName);
      setCode("");
      setOpen(false);
      setNotice("Email verified. You are signed in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify code.");
    } finally {
      setBusy(false);
    }
  }, [code, email, onNickname]);

  const logout = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await readJson<{ ok?: boolean }>(
        await fetch("/api/auth/logout", { method: "POST" }),
      );
      setUser(null);
      setNotice("Signed out on this device.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }, []);

  if (!hydrated) {
    return (
      <div className="h-9 w-24 animate-pulse rounded-full border border-zinc-800 bg-zinc-900/70" />
    );
  }

  const initials = (user?.displayName || user?.email || "Profile")
    .trim()
    .slice(0, 1)
    .toUpperCase();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold transition-colors ${
          user
            ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-100 hover:border-emerald-300"
            : "border-zinc-700 bg-zinc-900/80 text-zinc-200 hover:border-amber-300/70 hover:text-amber-100"
        }`}
        aria-expanded={open}
      >
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
            user ? "bg-emerald-400/25" : "bg-amber-400/20"
          }`}
        >
          {user ? initials : "?"}
        </span>
        <span className="hidden sm:inline">{user ? "Profile" : "Sign in"}</span>
      </button>

      {open ? (
        <section className="absolute right-0 top-full z-[120] mt-3 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-zinc-800 bg-zinc-950/98 p-4 text-left shadow-2xl shadow-black/45 backdrop-blur">
          <div>
            <p
              className={`text-[11px] font-black uppercase tracking-[0.22em] ${
                user ? "text-emerald-300" : "text-amber-300"
              }`}
            >
              {user ? "Profile" : "Account"}
            </p>
            <h3 className="mt-1 text-lg font-black text-zinc-50">
              {user
                ? user.displayName || user.email
                : "Save your progress"}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              {user
                ? "Your progress can follow you across devices."
                : "Enter your email and we will send a short sign-in code."}
            </p>
          </div>

          {user ? (
            <button
              type="button"
              disabled={busy}
              onClick={logout}
              className="mt-4 w-full cursor-pointer rounded-xl border border-emerald-400/45 bg-emerald-400/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-emerald-100 transition-colors hover:border-emerald-300 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Signing out..." : "Sign out"}
            </button>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="min-w-0 rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-amber-300/80"
                />
                <button
                  type="button"
                  disabled={busy || email.trim().length === 0}
                  onClick={requestCode}
                  className="cursor-pointer rounded-xl border border-amber-400/55 bg-amber-400/10 px-3 py-2.5 text-xs font-bold text-amber-100 transition-colors hover:border-amber-300 hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Sending..." : "Send"}
                </button>
              </div>

              {maskedEmail ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    className="min-w-0 rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2.5 font-mono text-sm tracking-[0.3em] text-zinc-100 outline-none transition-colors placeholder:tracking-normal placeholder:text-zinc-600 focus:border-emerald-300/80"
                  />
                  <button
                    type="button"
                    disabled={busy || code.length !== 6}
                    onClick={verifyCode}
                    className="cursor-pointer rounded-xl border border-emerald-400/55 bg-emerald-400/10 px-3 py-2.5 text-xs font-bold text-emerald-100 transition-colors hover:border-emerald-300 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? "Checking..." : "Verify"}
                  </button>
                  <p className="text-xs leading-relaxed text-zinc-500 sm:col-span-2">
                    Sent to {maskedEmail}
                    {expiresAt
                      ? `, expires at ${new Date(expiresAt).toLocaleTimeString()}`
                      : ""}
                    .
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {notice ? <p className="mt-3 text-xs text-emerald-200">{notice}</p> : null}
          {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
