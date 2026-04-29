"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MAX = 1500;

type WritingHint = {
  label: string;
  insert: string;
};

function MicrophoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="-3 0 19 19"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M11.665 7.915v1.31a5.257 5.257 0 0 1-1.514 3.694 5.174 5.174 0 0 1-1.641 1.126 5.04 5.04 0 0 1-1.456.384v1.899h2.312a.554.554 0 0 1 0 1.108H3.634a.554.554 0 0 1 0-1.108h2.312v-1.899a5.045 5.045 0 0 1-1.456-.384 5.174 5.174 0 0 1-1.641-1.126 5.257 5.257 0 0 1-1.514-3.695v-1.31a.554.554 0 1 1 1.109 0v1.31a4.131 4.131 0 0 0 1.195 2.917 3.989 3.989 0 0 0 5.722 0 4.133 4.133 0 0 0 1.195-2.917v-1.31a.554.554 0 1 1 1.109 0zM3.77 10.37a2.875 2.875 0 0 1-.233-1.146V4.738A2.905 2.905 0 0 1 3.77 3.58a3 3 0 0 1 1.59-1.59 2.902 2.902 0 0 1 1.158-.233 2.865 2.865 0 0 1 1.152.233 2.977 2.977 0 0 1 1.793 2.748l-.012 4.487a2.958 2.958 0 0 1-.856 2.09 3.025 3.025 0 0 1-.937.634 2.865 2.865 0 0 1-1.152.233 2.905 2.905 0 0 1-1.158-.233A2.957 2.957 0 0 1 3.77 10.37z" />
    </svg>
  );
}

function StopRecordingIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="12" height="12" rx="1.2" />
    </svg>
  );
}

const VOICE_BAR_DELAYS = ["0ms", "0.1s", "0.2s", "0.1s", "0.3s", "0.15s"] as const;

const MARQUEE_HINT_P =
  "Recording — no live preview. Speak, then tap stop to add text after transcribing. ";

function appendTranscript(base: string, transcript: string): string {
  const trimmedTranscript = transcript.trim();
  if (!trimmedTranscript) return base.slice(0, MAX);
  const separator = base.trim().length > 0 && !/\s$/.test(base) ? " " : "";
  return `${base}${separator}${trimmedTranscript}`.slice(0, MAX);
}

function appendHint(base: string, hint: string): string {
  const separator = base.trim().length > 0 && !/\s$/.test(base) ? " " : "";
  return `${base}${separator}${hint}`.slice(0, MAX);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getWritingHints(text: string): WritingHint[] {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const hints: WritingHint[] = [];

  if (!trimmed) {
    return [
      { label: "State your position", insert: "I argue that " },
      { label: "Add a reason", insert: "because " },
      { label: "Give an example", insert: "For example, " },
    ];
  }

  if (countWords(trimmed) < 25) {
    hints.push({ label: "Make it fuller", insert: "because " });
  }
  if (!/\b(because|since|therefore|so|потому|поэтому|так как)\b/i.test(lower)) {
    hints.push({ label: "Explain why", insert: "because " });
  }
  if (!/\b(for example|example|evidence|data|study|например|пример|данн)\b/i.test(lower)) {
    hints.push({ label: "Add evidence", insert: "For example, " });
  }
  if (!/\b(however|but|although|tradeoff|risk|но|однако|зато|риск)\b/i.test(lower)) {
    hints.push({ label: "Mention tradeoff", insert: "However, " });
  }

  return hints.slice(0, 3);
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  onFocus?: () => void;
  onSurrender?: () => void;
  onRequestAIHint?: () => Promise<string | null> | string | null;
  aiHintDisabled?: boolean;
  aiHintBusy?: boolean;
};

export function InputBar({
  value,
  onChange,
  onSubmit,
  disabled,
  onFocus,
  onSurrender,
  onRequestAIHint,
  aiHintDisabled,
  aiHintBusy,
}: Props) {
  const pct = (value.length / MAX) * 100;
  const nearLimit = pct > 90;
  const writingHints = useMemo(() => getWritingHints(value), [value]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const cloudChunksRef = useRef<Blob[]>([]);
  const aliveRef = useRef(true);
  const baseTextRef = useRef("");
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv || !shellRef.current) return;
    const apply = () => {
      const el = shellRef.current;
      if (!el) return;
      const overlap = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop,
      );
      el.style.paddingBottom = `calc(0.75rem + env(safe-area-inset-bottom) + ${overlap}px)`;
    };
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    apply();
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      if (shellRef.current) shellRef.current.style.paddingBottom = "";
    };
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    const ok =
      typeof MediaRecorder !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia);
    setVoiceSupported(ok);
    return () => {
      aliveRef.current = false;
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    };
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!disabled && value.trim()) onSubmit();
      }
    },
    [disabled, onSubmit, value],
  );

  const finalizeCloudRecording = useCallback(
    async (blobMime: string) => {
      const stream = mediaStreamRef.current;
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }

      const chunks = cloudChunksRef.current;
      cloudChunksRef.current = [];
      const blob = new Blob(chunks, { type: blobMime });

      if (!aliveRef.current) return;

      setIsRecording(false);

      if (blob.size < 64) {
        setVoiceError("No audio captured.");
        return;
      }

      setCloudBusy(true);
      setVoiceError(null);
      try {
        const fd = new FormData();
        fd.append("audio", blob, "recording.webm");
        const res = await fetch("/api/speech/transcribe", {
          method: "POST",
          body: fd,
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          text?: string;
        };
        if (!aliveRef.current) return;
        if (!res.ok) {
          setVoiceError(
            typeof data.error === "string"
              ? data.error
              : "Transcription failed.",
          );
          return;
        }
        const text = typeof data.text === "string" ? data.text.trim() : "";
        if (text) {
          onChange(appendTranscript(baseTextRef.current, text));
        }
      } catch {
        if (aliveRef.current) {
          setVoiceError("Could not reach transcription service.");
        }
      } finally {
        if (aliveRef.current) {
          setCloudBusy(false);
        }
      }
    },
    [onChange],
  );

  const startCloudRecording = useCallback(async () => {
    if (
      disabled ||
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setVoiceError("Recording is not supported in this browser.");
      return;
    }

    baseTextRef.current = value;
    setVoiceError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      let mime = "";
      for (const candidate of ["audio/webm;codecs=opus", "audio/webm"]) {
        if (MediaRecorder.isTypeSupported(candidate)) {
          mime = candidate;
          break;
        }
      }

      const rec = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      cloudChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) cloudChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        void finalizeCloudRecording(rec.mimeType || mime || "audio/webm");
      };

      mediaRecorderRef.current = rec;
      rec.start();
      setIsRecording(true);
    } catch {
      setVoiceError("Microphone access was denied or unavailable.");
    }
  }, [disabled, finalizeCloudRecording, value]);

  const toggleVoiceInput = useCallback(() => {
    if (disabled || cloudBusy) return;

    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    void startCloudRecording();
  }, [cloudBusy, disabled, isRecording, startCloudRecording]);

  const applyWritingHint = useCallback(
    (hint: WritingHint) => {
      onChange(appendHint(value, hint.insert));
    },
    [onChange, value],
  );

  const handleRequestHint = useCallback(async () => {
    if (!onRequestAIHint || hintLoading) return;
    setHintLoading(true);
    try {
      const result = await onRequestAIHint();
      if (typeof result === "string" && result.trim()) {
        setAiHint(result.trim());
      }
    } finally {
      setHintLoading(false);
    }
  }, [hintLoading, onRequestAIHint]);

  const dismissHint = useCallback(() => setAiHint(null), []);

  const handleTextareaFocus = useCallback(() => {
    onFocus?.();
    requestAnimationFrame(() => {
      textareaRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    });
  }, [onFocus]);

  return (
    <div
      ref={shellRef}
      className="min-w-0 max-w-full overflow-x-hidden border-t border-zinc-800 bg-zinc-950/95 px-3 py-3 backdrop-blur sm:px-4"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-2">
        <div className="relative">
          <textarea
            ref={textareaRef}
            rows={3}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value.slice(0, MAX))}
            onFocus={handleTextareaFocus}
            onKeyDown={onKeyDown}
            placeholder="Make your argument… (Enter to send, Shift+Enter for newline)"
            className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 pr-14 text-base leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
          />
          {voiceSupported ? (
            <button
              type="button"
              disabled={disabled || cloudBusy}
              onClick={toggleVoiceInput}
              aria-pressed={isRecording}
              aria-label={
                cloudBusy
                  ? "Transcribing"
                  : isRecording
                    ? "Stop recording and transcribe"
                    : "Start voice recording"
              }
              title={
                cloudBusy
                  ? "Transcribing…"
                  : isRecording
                    ? "Stop — text is added after transcription (no live preview)"
                    : "Record — tap again when done; text shows after transcribing"
              }
              className={`absolute right-3 top-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border transition-all active:scale-[0.96] disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-900/50 disabled:text-zinc-600 disabled:hover:scale-100 ${
                isRecording
                  ? "border-rose-300/80 bg-rose-600/90 text-white shadow-md shadow-rose-950/40"
                  : "border-zinc-700 bg-zinc-950/70 text-zinc-300 hover:border-indigo-500/60 hover:bg-indigo-950/35 hover:text-indigo-100"
              }`}
            >
              {isRecording ? (
                <StopRecordingIcon className="h-4 w-4" />
              ) : (
                <MicrophoneIcon className="h-5 w-5" />
              )}
            </button>
          ) : null}
        </div>
        {!disabled && writingHints.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-zinc-500">Try:</span>
            {writingHints.map((hint) => (
              <button
                key={hint.label}
                type="button"
                onClick={() => applyWritingHint(hint)}
                className="cursor-pointer rounded-full border border-zinc-700 bg-zinc-900/70 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-indigo-500/60 hover:bg-indigo-950/35 hover:text-indigo-100 active:scale-[0.98]"
              >
                {hint.label}
              </button>
            ))}
            {onRequestAIHint ? (
              <button
                type="button"
                onClick={handleRequestHint}
                disabled={
                  disabled ||
                  hintLoading ||
                  Boolean(aiHintBusy) ||
                  Boolean(aiHintDisabled)
                }
                className="cursor-pointer rounded-full border border-indigo-500/50 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition-colors hover:border-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {hintLoading ? "Thinking…" : "AI hint"}
              </button>
            ) : null}
          </div>
        ) : null}
        {aiHint ? (
          <div className="rounded-lg border border-indigo-500/40 bg-indigo-950/40 p-3 text-xs text-indigo-100">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-300">
                AI hint
              </span>
              <button
                type="button"
                onClick={dismissHint}
                className="cursor-pointer text-[10px] font-semibold text-indigo-300 hover:text-white"
              >
                Dismiss
              </button>
            </div>
            <pre className="mt-2 max-w-full whitespace-pre-wrap break-words font-sans text-xs leading-relaxed [overflow-wrap:anywhere]">
              {aiHint}
            </pre>
          </div>
        ) : null}
        {voiceError ? (
          <p className="text-xs text-amber-300">{voiceError}</p>
        ) : cloudBusy ? (
          <p className="text-xs text-indigo-300">Transcribing with Gemini…</p>
        ) : isRecording ? (
          <div
            className="overflow-hidden rounded-xl border border-rose-500/40 bg-gradient-to-b from-rose-950/40 to-zinc-900/25 shadow-[0_0_0_1px_rgba(244,63,94,0.12),inset_0_1px_0_rgba(255,255,255,0.04)]"
            role="status"
            aria-live="polite"
            aria-relevant="additions"
          >
            <div
              className="inputbar-voice-timeline"
              aria-hidden="true"
            />
            <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="inputbar-voice-bars shrink-0" aria-hidden="true">
                {VOICE_BAR_DELAYS.map((delay, i) => (
                  <span
                    key={i}
                    className="inputbar-voice-bars__bar"
                    style={{ animationDelay: delay }}
                  />
                ))}
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400/70 opacity-50" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-600/50" />
                </span>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-rose-200/90">
                    Recording
                  </p>
                  <div className="inputbar-rec-marquee">
                    <p className="inputbar-rec-marquee__track text-[0.7rem] leading-tight text-rose-200/80">
                      <span>{MARQUEE_HINT_P}</span>
                      <span>{MARQUEE_HINT_P}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {onSurrender ? (
              <button
                type="button"
                disabled={disabled}
                onClick={onSurrender}
                className="cursor-pointer rounded-xl border border-rose-600/50 bg-rose-950/40 px-4 py-2 text-sm font-semibold text-rose-200/95 transition-colors hover:border-rose-500 hover:bg-rose-950/70 hover:text-rose-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-900/50 disabled:text-zinc-600 disabled:hover:scale-100"
              >
                Concede
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`text-xs font-mono tabular-nums ${
                nearLimit ? "text-red-400" : "text-zinc-500"
              }`}
            >
              {value.length}/{MAX}
            </span>
            <button
              type="button"
              disabled={disabled || !value.trim()}
              onClick={onSubmit}
              className="cursor-pointer rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-900/20 transition-all hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none disabled:hover:scale-100"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
